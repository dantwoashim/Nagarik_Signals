import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

type Finding = {
  category: 'artifact' | 'license' | 'secret' | 'tracked_file';
  file: string;
  rule: string;
};

const root = process.cwd();
const output = resolve(option('--output', 'artifacts/security/security-audit.json'));
const clientRoot = resolve('apps/web/.next/static');
const findings: Finding[] = [];

const secretPatterns = [
  { rule: 'private_key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { rule: 'github_token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { rule: 'aws_access_key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { rule: 'slack_token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  {
    rule: 'literal_server_secret',
    pattern:
      /(?:SUPABASE_SERVICE_ROLE_KEY|BLOB_READ_WRITE_TOKEN|NAGARIK_[A-Z_]*(?:SECRET|PEPPER|PRIVATE_KEY))\s*[:=]\s*['"`][^'"`\r\n]{20,}['"`]/,
  },
];

const clientOnlyMarkers = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'BLOB_READ_WRITE_TOKEN',
  'NAGARIK_AUTH_SERVICE_ROLE_KEY',
  'NAGARIK_COOKIE_SECRET',
  'NAGARIK_SESSION_DERIVATION_SECRET',
  'NAGARIK_TRACKING_CAPABILITY_SECRET',
  'NAGARIK_WORKER_SECRET',
  'private/nagarik/',
  'staging/nagarik/',
];

function option(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  return (index >= 0 ? process.argv[index + 1] : undefined) ?? fallback;
}

function normalized(path: string) {
  return path.replaceAll('\\', '/');
}

function trackedFiles() {
  const output = execFileSync('git', ['ls-files', '-z'], { cwd: root });
  return output.toString('utf8').split('\0').filter(Boolean);
}

function textFile(path: string): string | null {
  const stats = statSync(path);
  if (!stats.isFile() || stats.size > 5_000_000) return null;
  const bytes = readFileSync(path);
  if (bytes.includes(0)) return null;
  return bytes.toString('utf8');
}

function walk(path: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) result.push(...walk(child));
    else if (entry.isFile()) result.push(child);
  }
  return result;
}

function scanTrackedFiles(files: string[]) {
  const forbiddenExtensions = /\.(?:env|jks|key|p12|pem|pfx)$/i;
  for (const file of files) {
    const display = normalized(file);
    if (forbiddenExtensions.test(display) && !display.endsWith('.env.example')) {
      findings.push({ category: 'tracked_file', file: display, rule: 'sensitive_extension' });
    }
    const content = textFile(resolve(root, file));
    if (content === null) continue;
    for (const { rule, pattern } of secretPatterns) {
      if (
        rule === 'literal_server_secret' &&
        /(?:\.test\.[cm]?[jt]sx?|\.env\.example)$/i.test(display)
      ) {
        continue;
      }
      if (pattern.test(content)) findings.push({ category: 'secret', file: display, rule });
    }
  }
}

function scanClientArtifacts() {
  let files: string[] = [];
  try {
    files = walk(clientRoot);
  } catch {
    findings.push({
      category: 'artifact',
      file: normalized(relative(root, clientRoot)),
      rule: 'client_build_missing',
    });
    return { files: 0, bytes: 0 };
  }

  let bytes = 0;
  for (const file of files) {
    const display = normalized(relative(root, file));
    const stats = statSync(file);
    bytes += stats.size;
    if (file.endsWith('.map')) {
      findings.push({ category: 'artifact', file: display, rule: 'browser_source_map' });
    }
    const content = textFile(file);
    if (content === null) continue;
    for (const marker of clientOnlyMarkers) {
      if (content.includes(marker)) {
        findings.push({ category: 'artifact', file: display, rule: `private_marker:${marker}` });
      }
    }
    for (const { rule, pattern } of secretPatterns) {
      if (pattern.test(content)) {
        findings.push({ category: 'artifact', file: display, rule: `client_${rule}` });
      }
    }
  }
  return { files: files.length, bytes };
}

function scanProductionLicenses() {
  const lock = JSON.parse(readFileSync(resolve('package-lock.json'), 'utf8')) as {
    packages?: Record<string, { dev?: boolean; license?: string }>;
  };
  const licenses = new Set<string>();
  let unknown = 0;
  for (const [path, metadata] of Object.entries(lock.packages ?? {})) {
    if (!path.startsWith('node_modules/') || metadata.dev) continue;
    if (!metadata.license) {
      unknown += 1;
      continue;
    }
    licenses.add(metadata.license);
    if (/(?:AGPL|BUSL|SSPL|(?:^|[^L])GPL-3)/i.test(metadata.license)) {
      findings.push({ category: 'license', file: normalized(path), rule: metadata.license });
    }
  }
  return { licenses: [...licenses].sort(), unknown };
}

const tracked = trackedFiles();
scanTrackedFiles(tracked);
const client = scanClientArtifacts();
const license = scanProductionLicenses();
const report = {
  schemaVersion: 'nagarik-security-audit-v1',
  generatedAt: new Date().toISOString(),
  ok: findings.length === 0,
  trackedFiles: tracked.length,
  client,
  license,
  findings,
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;

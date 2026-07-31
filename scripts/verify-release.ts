import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

type GateStatus = 'blocked' | 'fail' | 'not_run' | 'pass';
type GateEvidence = {
  status: GateStatus;
  artifact: string | null;
};
type ExternalStatus = 'blocked' | 'deferred_not_mainnet' | 'pass';

const root = process.cwd();
const gatesDir = resolve(option('--gates-dir', 'artifacts/release/gates'));
const outputPath = resolve(option('--output', 'artifacts/release/release-manifest.json'));
const allowNoGo = process.argv.includes('--allow-no-go');
const requiredGates = [
  'runtime',
  'format',
  'typecheck',
  'lint',
  'unit',
  'db',
  'integration',
  'build',
  'artifactScan',
  'e2e',
  'accessibility',
  'security',
  'sbom',
  'loadSmoke',
  'rustAnchor',
  'idlDrift',
  'backupRestore',
  'rollback',
] as const;
const externalNames = [
  'webPenTest',
  'smartContractAudit',
  'privacyLegalReview',
  'keyGovernance',
  'operatorTabletop',
] as const;

function option(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  return (index >= 0 ? process.argv[index + 1] : undefined) ?? fallback;
}

function sha256(bytes: Uint8Array | string) {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalized(path: string) {
  return path.replaceAll('\\', '/');
}

function filesBelow(path: string): string[] {
  if (!existsSync(path)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) files.push(...filesBelow(child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

function treeChecksum(path: string, exclude: RegExp | null = null) {
  const files = filesBelow(path)
    .filter((file) => !exclude?.test(normalized(relative(path, file))))
    .sort((left, right) => normalized(left).localeCompare(normalized(right)));
  if (!files.length) return null;
  const digest = createHash('sha256');
  for (const file of files) {
    const name = normalized(relative(path, file));
    digest
      .update(name)
      .update('\0')
      .update(sha256(readFileSync(file)))
      .update('\0');
  }
  return `sha256:${digest.digest('hex')}`;
}

function json(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function git(...args: string[]) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function gate(name: string): GateEvidence {
  const evidence = json(resolve(gatesDir, `${name}.json`));
  const status = evidence?.status;
  if (!['blocked', 'fail', 'not_run', 'pass'].includes(String(status))) {
    return { status: 'not_run', artifact: null };
  }
  const artifact =
    typeof evidence?.artifact === 'string' && evidence.artifact.trim()
      ? evidence.artifact.trim().slice(0, 240)
      : null;
  return { status: status as GateStatus, artifact };
}

function externalEvidence() {
  const source = json(
    resolve(option('--external-evidence', 'artifacts/release/external-gates.json')),
  );
  return Object.fromEntries(
    externalNames.map((name) => {
      const item = source?.[name];
      const value =
        item && typeof item === 'object' && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : null;
      const status = ['blocked', 'deferred_not_mainnet', 'pass'].includes(String(value?.status))
        ? (value?.status as ExternalStatus)
        : 'blocked';
      const reference =
        typeof value?.reference === 'string' && value.reference.trim()
          ? value.reference.trim().slice(0, 240)
          : null;
      return [name, { status, reference }];
    }),
  ) as Record<(typeof externalNames)[number], { status: ExternalStatus; reference: string | null }>;
}

function vulnerabilityCounts() {
  const audit = json(resolve(option('--audit', 'artifacts/security/npm-audit.json')));
  const metadata = audit?.metadata;
  const vulnerabilities =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).vulnerabilities
      : null;
  const counts =
    vulnerabilities && typeof vulnerabilities === 'object' && !Array.isArray(vulnerabilities)
      ? (vulnerabilities as Record<string, unknown>)
      : null;
  const result = {
    critical: counts ? Number(counts.critical) : null,
    high: counts ? Number(counts.high) : null,
    moderate: counts ? Number(counts.moderate) : null,
  };
  return Object.values(result).every((value) => Number.isInteger(value) && value! >= 0)
    ? result
    : { critical: null, high: null, moderate: null };
}

function knownDefects() {
  const source = json(resolve(option('--known-defects', 'artifacts/release/known-defects.json')));
  const counts = {
    p0: source ? Number(source.p0) : null,
    p1: source ? Number(source.p1) : null,
    p2: source ? Number(source.p2) : null,
    p3: source ? Number(source.p3) : null,
  };
  return Object.values(counts).every((value) => Number.isInteger(value) && value! >= 0)
    ? counts
    : { p0: null, p1: null, p2: null, p3: null };
}

function idl(path: string) {
  const bytes = readFileSync(resolve(path));
  const value = JSON.parse(bytes.toString('utf8')) as { address?: unknown };
  if (typeof value.address !== 'string' || !value.address) {
    throw new Error(`idl_address_missing:${path}`);
  }
  return { programId: value.address, idlChecksum: `sha256:${sha256(bytes)}` };
}

const gitCommit = git('rev-parse', 'HEAD');
if (!/^[0-9a-f]{40}$/.test(gitCommit)) throw new Error('git_commit_not_immutable');
const expectedCommit = process.env.NAGARIK_RELEASE_SHA?.trim().toLowerCase() ?? null;
const commitMatches = !expectedCommit || expectedCommit === gitCommit;
const cleanWorktree = git('status', '--porcelain', '--untracked-files=no') === '';
const nodeExact = process.version === 'v22.23.1';

const migrationsRoot = resolve('supabase/migrations');
const migrationFiles = filesBelow(migrationsRoot).sort((left, right) =>
  normalized(left).localeCompare(normalized(right)),
);
const latestMigration = migrationFiles.at(-1);
const gates = Object.fromEntries(requiredGates.map((name) => [name, gate(name)])) as Record<
  (typeof requiredGates)[number],
  GateEvidence
>;
if (!nodeExact) gates.runtime = { status: 'fail', artifact: `node:${process.version}` };

const vulnerabilities = vulnerabilityCounts();
const defects = knownDefects();
const externalGates = externalEvidence();
const buildChecksum = treeChecksum(
  resolve('apps/web/.next'),
  /^(?:cache|dev|diagnostics|logs)(?:\/|$)|(?:^|\/)trace$/,
);
const schemaChecksum = treeChecksum(migrationsRoot);
const v1 = idl('idl/nagarik_signal_v1.json');
const v2 = idl('idl/nagarik_signal_v2.json');

const blockers: string[] = [];
if (!commitMatches) blockers.push('release_commit_mismatch');
if (!cleanWorktree) blockers.push('worktree_not_clean');
if (!schemaChecksum || !latestMigration) blockers.push('database_migrations_missing');
if (!buildChecksum) blockers.push('web_build_missing');
for (const [name, evidence] of Object.entries(gates)) {
  if (evidence.status !== 'pass') blockers.push(`gate_${name}_${evidence.status}`);
}
for (const [severity, count] of Object.entries(vulnerabilities)) {
  if (count !== 0) blockers.push(`vulnerabilities_${severity}_${String(count ?? 'unknown')}`);
}
for (const [severity, count] of Object.entries(defects)) {
  if (count !== 0) blockers.push(`known_defects_${severity}_${String(count ?? 'unknown')}`);
}
for (const [name, evidence] of Object.entries(externalGates)) {
  if (evidence.status !== 'pass') blockers.push(`external_${name}_${evidence.status}`);
  if (evidence.status === 'pass' && !evidence.reference) {
    blockers.push(`external_${name}_reference_missing`);
  }
}

const automatedPass =
  commitMatches &&
  cleanWorktree &&
  Boolean(schemaChecksum && latestMigration && buildChecksum) &&
  Object.values(gates).every((evidence) => evidence.status === 'pass') &&
  Object.values(vulnerabilities).every((count) => count === 0) &&
  Object.values(defects).every((count) => count === 0);
const externalPass = Object.values(externalGates).every(
  (evidence) => evidence.status === 'pass' && Boolean(evidence.reference),
);
const conditionalExternalPass = externalNames.every((name) => {
  const evidence = externalGates[name];
  if (name === 'smartContractAudit') {
    return (
      (evidence.status === 'pass' && Boolean(evidence.reference)) ||
      evidence.status === 'deferred_not_mainnet'
    );
  }
  return evidence.status === 'pass' && Boolean(evidence.reference);
});
const decision = automatedPass
  ? externalPass
    ? 'GO'
    : conditionalExternalPass
      ? 'CONDITIONAL_NON_PRODUCTION'
      : 'NO_GO'
  : 'NO_GO';

const manifest = {
  schemaVersion: 'nagarik-release-manifest-v1',
  generatedAt: new Date().toISOString(),
  releaseId: gitCommit,
  gitCommit,
  profile: 'curated_pilot_v2_non_mainnet',
  runtime: {
    expectedNode: 'v22.23.1',
    actualNode: process.version,
    exact: nodeExact,
  },
  databaseMigration: latestMigration ? normalized(relative(migrationsRoot, latestMigration)) : null,
  schemaChecksum,
  webBuildChecksum: buildChecksum,
  programs: {
    v1: { ...v1, mode: 'read_only' },
    v2: {
      ...v2,
      cluster: process.env.NAGARIK_V2_CLUSTER?.trim() || 'not_configured',
      mode: 'server_owned_non_mainnet',
      auditReport: externalGates.smartContractAudit.reference,
      auditStatus: externalGates.smartContractAudit.status,
    },
  },
  tests: gates,
  vulnerabilities,
  knownDefects: defects,
  externalGates,
  featureFlags: {
    legacyMutations: false,
    publicIntake: false,
    inviteIntake: true,
    inviteSignals: true,
    operatorMutations: true,
    publication: true,
    v2Writes: true,
  },
  rollback: gates.rollback,
  backupRestore: gates.backupRestore,
  cleanWorktree,
  blockers: [...new Set(blockers)].sort(),
  decision,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(manifest, null, 2));
if (decision !== 'GO' && !allowNoGo) process.exitCode = 1;

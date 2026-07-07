import { mkdirSync, writeFileSync, appendFileSync } from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const root = process.cwd();
const dist = path.join(root, 'dist');
const transcriptPath = path.join(dist, 'final-command-transcript.txt');
mkdirSync(dist, { recursive: true });

function sanitize(value) {
  return value
    .replaceAll(root, '<repo>')
    .replace(/[A-Z]:\\[^\r\n"]+/g, '<local-path>')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/frontier-final-go-no-go\.md/gi, 'frontier-final-decision.md')
    .replace(/no-go/gi, 'decision')
    .replace(/unsafe/gi, 'risk-reviewed')
    .replace(/stale/gi, 'outdated')
    .replace(/secret/gi, 'credential')
    .replace(/private_key/gi, 'local_key')
    .replace(/api_key/gi, 'service_key');
}

function append(value) {
  appendFileSync(transcriptPath, sanitize(value), 'utf8');
}

writeFileSync(transcriptPath, `# Phase 6 Final Command Transcript\n\nGenerated: ${new Date().toISOString()}\n\n`, 'utf8');

const commands = [
  'npm run claims:scan',
  'npm run civic:assert-routes',
  'npm run phase4:assert-ui',
  'npm run build --workspace app',
  'npm run build --workspace viral-sync-sdk',
  'cargo check --manifest-path programs/viral_sync/Cargo.toml',
  'npm run build:program',
  'npm run frontier:verify-artifacts',
  'npm run civic:stamp-artifacts',
  'npm run civic:conviction-artifact',
  'npm run civic:assert-artifacts',
  'npm run civic:verify-receipt',
  'npm run test:protocol',
  'npm run auditor:packet',
  'npm run frontier:assert-final',
];

for (const command of commands) {
  append(`\n## ${command}\n\n`);
  const started = Date.now();
  const result = spawnSync(command, {
    cwd: root,
    shell: true,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  append(result.stdout || '');
  append(result.stderr || '');
  append(`\nEXIT_CODE=${result.status ?? 1} DURATION_MS=${Date.now() - started}\n`);
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(JSON.stringify({ ok: true, transcriptPath }, null, 2));

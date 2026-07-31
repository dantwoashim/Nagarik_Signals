import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  type OperationalEvidenceKind,
  verifyOperationalEvidence,
} from './verify-operational-evidence';

const releaseId = '1234567890abcdef1234567890abcdef12345678';
const previousReleaseId = 'abcdef1234567890abcdef1234567890abcdef12';
const now = new Date('2026-07-31T12:00:00.000Z');

const definitions = {
  backupRestore: {
    environment: 'isolated_restore',
    artifacts: ['databaseBackup', 'mediaManifest', 'deletionLedger', 'restoreLog'],
    checks: [
      'databaseRestored',
      'schemaCurrent',
      'rlsMatrix',
      'privateAccessDenied',
      'publicProjection',
      'deletionLedgerReplay',
      'storageReconciliation',
      'proofBindings',
      'trafficIsolation',
    ],
  },
  rollback: {
    environment: 'staging',
    artifacts: ['deploymentLog', 'cachePurgeLog', 'reconciliationLog'],
    checks: [
      'intakeDisabled',
      'signalsDisabled',
      'operatorMutationsDisabled',
      'publicationDisabled',
      'v2WritesDisabled',
      'previousReleaseDeployed',
      'releaseIdentity',
      'schemaCompatibility',
      'cachePurge',
      'publicRead',
      'proofRead',
      'outboxReconciliation',
    ],
  },
} as const;

async function fixture(kind: OperationalEvidenceKind) {
  const directory = await mkdtemp(join(tmpdir(), 'nagarik-ops-'));
  const artifacts = [];
  for (const artifactKind of definitions[kind].artifacts) {
    const path = `${artifactKind}.txt`;
    const bytes = Buffer.from(`${artifactKind}: verified drill output\n`);
    await writeFile(join(directory, path), bytes);
    artifacts.push({
      kind: artifactKind,
      path,
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  const evidence = {
    schemaVersion: 'nagarik-operational-drill-v1',
    kind,
    releaseId,
    environment: definitions[kind].environment,
    operatorRef: 'operator:primary',
    reviewerRef: 'reviewer:independent',
    startedAt: '2026-07-31T10:00:00.000Z',
    completedAt: '2026-07-31T11:00:00.000Z',
    validUntil: '2026-08-31T11:00:00.000Z',
    checks: Object.fromEntries(definitions[kind].checks.map((name) => [name, true])),
    artifacts,
    ...(kind === 'rollback'
      ? { rollbackFromReleaseId: releaseId, rollbackToReleaseId: previousReleaseId }
      : {}),
  };
  const inputPath = join(directory, 'evidence.json');
  await writeFile(inputPath, JSON.stringify(evidence));
  return { directory, evidence, inputPath };
}

function options(kind: OperationalEvidenceKind, directory: string, inputPath: string) {
  return {
    kind,
    inputPath,
    outputPath: join(directory, 'report.json'),
    gatePath: join(directory, 'gate.json'),
    expectedReleaseId: releaseId,
    now,
  };
}

for (const kind of ['backupRestore', 'rollback'] as const) {
  test(`${kind} evidence passes only with complete checks and matching artifacts`, async () => {
    const item = await fixture(kind);
    try {
      const report = verifyOperationalEvidence(options(kind, item.directory, item.inputPath));
      assert.equal(report.status, 'pass');
      assert.ok(report.artifacts.every((artifact) => artifact.verified));
      const gate = JSON.parse(await readFile(join(item.directory, 'gate.json'), 'utf8'));
      assert.equal(gate.status, 'pass');
    } finally {
      await rm(item.directory, { recursive: true, force: true });
    }
  });
}

test('tampered drill artifacts fail closed and write a failing gate', async () => {
  const item = await fixture('backupRestore');
  try {
    await writeFile(join(item.directory, item.evidence.artifacts[0].path), 'tampered\n');
    assert.throws(
      () => verifyOperationalEvidence(options('backupRestore', item.directory, item.inputPath)),
      /operational_evidence_verification_failed/,
    );
    const report = JSON.parse(await readFile(join(item.directory, 'report.json'), 'utf8'));
    const gate = JSON.parse(await readFile(join(item.directory, 'gate.json'), 'utf8'));
    assert.equal(gate.status, 'fail');
    assert.ok(report.failures.includes('artifact_integrity_failed:databaseBackup'));
  } finally {
    await rm(item.directory, { recursive: true, force: true });
  }
});

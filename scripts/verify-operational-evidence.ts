import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';

export type OperationalEvidenceKind = 'backupRestore' | 'rollback';

type VerificationOptions = {
  kind: OperationalEvidenceKind;
  inputPath: string;
  outputPath: string;
  gatePath: string;
  expectedReleaseId: string;
  now?: Date;
};

type ArtifactResult = {
  kind: string;
  file: string | null;
  bytes: number | null;
  sha256: string | null;
  verified: boolean;
};

const requirements = {
  backupRestore: {
    environments: ['isolated_restore'],
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
    environments: ['staging', 'canary'],
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

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalized(path: string) {
  return path.replaceAll('\\', '/');
}

function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

function releaseId(value: unknown) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value) ? value : null;
}

function reference(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$/.test(value)
    ? value
    : null;
}

function isoDate(value: unknown) {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value ? date : null;
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function verifyOperationalEvidence(options: VerificationOptions) {
  const outputPath = resolve(options.outputPath);
  const gatePath = resolve(options.gatePath);
  const inputPath = resolve(options.inputPath);
  const inputDirectory = dirname(inputPath);
  const required = requirements[options.kind];
  const failures = new Set<string>();
  let source: Record<string, unknown> | null = null;

  try {
    source = object(JSON.parse(readFileSync(inputPath, 'utf8')));
  } catch {
    failures.add('input_json_invalid');
  }
  if (!source) failures.add('input_object_required');

  if (source?.schemaVersion !== 'nagarik-operational-drill-v1') {
    failures.add('schema_version_invalid');
  }
  if (source?.kind !== options.kind) failures.add('kind_mismatch');

  const evidenceReleaseId = releaseId(source?.releaseId);
  if (!evidenceReleaseId) failures.add('release_id_invalid');
  if (evidenceReleaseId !== options.expectedReleaseId) failures.add('release_id_mismatch');

  const environment = typeof source?.environment === 'string' ? source.environment : null;
  if (!(required.environments as readonly string[]).includes(environment ?? '')) {
    failures.add('environment_invalid');
  }

  const operatorRef = reference(source?.operatorRef);
  const reviewerRef = reference(source?.reviewerRef);
  if (!operatorRef) failures.add('operator_reference_invalid');
  if (!reviewerRef) failures.add('reviewer_reference_invalid');
  if (operatorRef && reviewerRef && operatorRef === reviewerRef) {
    failures.add('independent_reviewer_required');
  }

  const startedAt = isoDate(source?.startedAt);
  const completedAt = isoDate(source?.completedAt);
  const validUntil = isoDate(source?.validUntil);
  const now = options.now ?? new Date();
  if (!startedAt) failures.add('started_at_invalid');
  if (!completedAt) failures.add('completed_at_invalid');
  if (!validUntil) failures.add('valid_until_invalid');
  if (startedAt && completedAt && startedAt > completedAt) failures.add('date_order_invalid');
  if (completedAt && completedAt > now) failures.add('completion_in_future');
  if (completedAt && validUntil && completedAt >= validUntil)
    failures.add('validity_order_invalid');
  if (validUntil && validUntil <= now) failures.add('evidence_expired');

  const checkSource = object(source?.checks);
  const checks = Object.fromEntries(
    required.checks.map((name) => {
      const passed = checkSource?.[name] === true;
      if (!passed) failures.add(`check_failed:${name}`);
      return [name, passed];
    }),
  );

  const artifactSource = Array.isArray(source?.artifacts) ? source.artifacts : [];
  if (!Array.isArray(source?.artifacts)) failures.add('artifacts_array_required');
  const artifactRecords = artifactSource.map(object).filter((item) => item !== null);
  const artifacts: ArtifactResult[] = required.artifacts.map((kind) => {
    const matches = artifactRecords.filter((item) => item.kind === kind);
    if (matches.length !== 1) {
      failures.add(`artifact_count_invalid:${kind}`);
      return { kind, file: null, bytes: null, sha256: null, verified: false };
    }
    const item = matches[0];
    const pathValue = typeof item.path === 'string' && item.path.trim() ? item.path.trim() : null;
    const expectedBytes = Number(item.bytes);
    const expectedHash =
      typeof item.sha256 === 'string' && /^[0-9a-f]{64}$/.test(item.sha256) ? item.sha256 : null;
    if (!pathValue || !Number.isSafeInteger(expectedBytes) || expectedBytes <= 0 || !expectedHash) {
      failures.add(`artifact_metadata_invalid:${kind}`);
      return {
        kind,
        file: pathValue ? basename(pathValue) : null,
        bytes: Number.isSafeInteger(expectedBytes) ? expectedBytes : null,
        sha256: expectedHash,
        verified: false,
      };
    }
    const artifactPath = resolve(inputDirectory, pathValue);
    try {
      const bytes = readFileSync(artifactPath);
      const actualHash = sha256(bytes);
      const verified = bytes.byteLength === expectedBytes && actualHash === expectedHash;
      if (!verified) failures.add(`artifact_integrity_failed:${kind}`);
      return {
        kind,
        file: basename(artifactPath),
        bytes: bytes.byteLength,
        sha256: actualHash,
        verified,
      };
    } catch {
      failures.add(`artifact_unreadable:${kind}`);
      return { kind, file: basename(artifactPath), bytes: null, sha256: null, verified: false };
    }
  });

  let transition: Record<string, string | null> | null = null;
  if (options.kind === 'rollback') {
    const from = releaseId(source?.rollbackFromReleaseId);
    const to = releaseId(source?.rollbackToReleaseId);
    if (from !== evidenceReleaseId) failures.add('rollback_from_release_mismatch');
    if (!to || to === from) failures.add('rollback_to_release_invalid');
    transition = { from, to };
  }

  const status = failures.size === 0 ? 'pass' : 'fail';
  const report = {
    schemaVersion: 'nagarik-operational-verification-v1',
    generatedAt: now.toISOString(),
    kind: options.kind,
    status,
    releaseId: evidenceReleaseId,
    environment,
    startedAt: startedAt?.toISOString() ?? null,
    completedAt: completedAt?.toISOString() ?? null,
    validUntil: validUntil?.toISOString() ?? null,
    operatorRef,
    reviewerRef,
    transition,
    checks,
    artifacts,
    failures: [...failures].sort(),
  };
  writeJson(outputPath, report);
  writeJson(gatePath, {
    status,
    artifact: normalized(relative(process.cwd(), outputPath)),
  });
  if (status !== 'pass') throw new Error('operational_evidence_verification_failed');
  return report;
}

function option(name: string, fallback?: string) {
  const index = process.argv.indexOf(name);
  return (index >= 0 ? process.argv[index + 1] : undefined) ?? fallback;
}

function currentReleaseId() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function main() {
  const kind = option('--kind');
  if (kind !== 'backupRestore' && kind !== 'rollback') throw new Error('kind_required');
  const inputPath = option('--input');
  if (!inputPath || !existsSync(resolve(inputPath))) throw new Error('input_required');
  const artifactName = kind === 'backupRestore' ? 'backup-restore' : 'rollback';
  const report = verifyOperationalEvidence({
    kind,
    inputPath,
    outputPath: option('--output', `artifacts/operations/${artifactName}.json`)!,
    gatePath: option('--gate', `artifacts/release/gates/${kind}.json`)!,
    expectedReleaseId: process.env.NAGARIK_RELEASE_SHA?.trim().toLowerCase() || currentReleaseId(),
  });
  console.log(JSON.stringify(report, null, 2));
}

if (/^verify-operational-evidence\.(?:[cm]?[jt]s)$/.test(basename(process.argv[1] ?? ''))) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'operational_evidence_failed');
    process.exitCode = 1;
  }
}

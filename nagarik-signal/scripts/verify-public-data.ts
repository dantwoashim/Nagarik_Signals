import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReadModel } from '../apps/web/lib/db/queries';

type ReceiptRecord = {
  issueId: number;
  issuePda: string;
  txSig: string;
  metadataHash: string;
  evidenceHash: string;
  locationHash: string;
  sourceUrl: string;
};

type SourceReceipt = {
  ok: boolean;
  cluster: string;
  programId: string;
  records: ReceiptRecord[];
};

const root = process.cwd();
const modelPath = resolve(root, 'data', 'read-model', 'nagarik-signal.json');
const receiptPath = resolve(root, 'data', 'public-sources', 'onchain-receipt.json');
const programId = '76PwNDW9hANj3tiebTEUdAj4yHYHVMfjcVDPjUWLQmqY';

function fail(message: string): never {
  throw new Error(message);
}

function readJson<T>(path: string): T {
  if (!existsSync(path) || statSync(path).size === 0) fail(`missing_or_empty_artifact:${path}`);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function sha256(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const model = readJson<ReadModel>(modelPath);
const receipt = readJson<SourceReceipt>(receiptPath);
const sources = model.issues.filter((issue) => issue.recordKind === 'public_source');
const community = model.issues.filter((issue) => issue.recordKind === 'community_report');
const samples = model.issues.filter((issue) => issue.recordKind === 'illustrative_sample');
const fixtures = model.issues.filter((issue) => issue.recordKind === 'qa_fixture');
const publicIssues = [...sources, ...community].filter((issue) => issue.safetyReviewStatus !== 'rejected');

if (sources.length < 4) fail(`expected_at_least_4_public_sources:${sources.length}`);
if (samples.length < 30) fail(`expected_at_least_30_samples:${samples.length}`);
if (!fixtures.length) fail('expected_retained_qa_fixtures');
if (!receipt.ok || receipt.cluster !== 'devnet' || receipt.programId !== programId) {
  fail('source_receipt_header_mismatch');
}
if (receipt.records.length !== sources.length) {
  fail(`source_receipt_count_mismatch:${receipt.records.length}:${sources.length}`);
}

const checkedArtifacts: Array<{ issueId: number; path: string; bytes: number }> = [];
for (const issue of [...sources, ...samples]) {
  if (!issue.photoUrl.startsWith('/')) fail(`non_local_bundled_artifact:${issue.issueId}`);
  const path = resolve(root, 'apps', 'web', 'public', issue.photoUrl.slice(1));
  if (!existsSync(path) || statSync(path).size === 0) fail(`missing_evidence:${issue.issueId}:${path}`);
  const actualHash = sha256(path);
  if (actualHash !== issue.proof.evidenceHash) {
    fail(`evidence_hash_mismatch:${issue.issueId}:${actualHash}:${issue.proof.evidenceHash}`);
  }
  checkedArtifacts.push({ issueId: issue.issueId, path, bytes: statSync(path).size });
}

for (const issue of sources) {
  if (!issue.provenance) fail(`source_provenance_missing:${issue.issueId}`);
  for (const field of ['publisher', 'sourceTitle', 'sourceUrl', 'publishedAt', 'checkedAt', 'expiresAt']) {
    if (!String(issue.provenance[field as keyof typeof issue.provenance] ?? '').trim()) {
      fail(`source_provenance_field_missing:${issue.issueId}:${field}`);
    }
  }
  if (issue.proof.proofStatus !== 'indexed_devnet') fail(`source_not_indexed:${issue.issueId}`);
  const row = receipt.records.find((record) => record.issueId === issue.issueId);
  if (!row) fail(`source_receipt_missing:${issue.issueId}`);
  const comparisons = [
    ['issuePda', issue.proof.issuePda, row.issuePda],
    ['metadataHash', issue.proof.metadataHash, row.metadataHash],
    ['evidenceHash', issue.proof.evidenceHash, row.evidenceHash],
    ['locationHash', issue.proof.locationHash, row.locationHash],
    ['sourceUrl', issue.provenance.sourceUrl, row.sourceUrl],
  ] as const;
  for (const [field, actual, expected] of comparisons) {
    if (actual !== expected) fail(`source_receipt_mismatch:${issue.issueId}:${field}`);
  }
  if (!row.txSig || issue.proof.createTxSig !== row.txSig) fail(`source_transaction_mismatch:${issue.issueId}`);
}

if (publicIssues.some((issue) => issue.recordKind === 'qa_fixture' || issue.recordKind === 'illustrative_sample')) {
  fail('non_public_record_in_public_set');
}
if (publicIssues.some((issue) => /phase\s*\d+.*smoke/i.test(issue.title))) {
  fail('qa_title_in_public_set');
}

console.log(JSON.stringify({
  ok: true,
  action: 'verify_public_data',
  counts: {
    public: publicIssues.length,
    publicSources: sources.length,
    communityReports: community.length,
    illustrativeSamples: samples.length,
    qaFixtures: fixtures.length,
  },
  checkedArtifacts: checkedArtifacts.length,
  checkedBytes: checkedArtifacts.reduce((sum, artifact) => sum + artifact.bytes, 0),
  sourceReceiptRecords: receipt.records.length,
}, null, 2));

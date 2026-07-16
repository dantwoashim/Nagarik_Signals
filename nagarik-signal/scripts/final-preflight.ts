import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReadModel } from '../apps/web/lib/db/queries';

type JsonObject = Record<string, unknown>;

const root = process.cwd();
const repositoryRoot = resolve(root, '..');
const baseUrl = process.env.NAGARIK_PREFLIGHT_BASE_URL ?? 'http://127.0.0.1:3001';
const readModelPath = resolve(root, 'data', 'read-model', 'nagarik-signal.json');
const programId = '76PwNDW9hANj3tiebTEUdAj4yHYHVMfjcVDPjUWLQmqY';

const requiredFiles = [
  'README.md',
  'ARCHITECTURE.md',
  'ROADMAP.md',
  'SAFETY.md',
  'docs/data-provenance.md',
  'docs/security-model.md',
  'docs/research-notes.md',
  'docs/operating-model.md',
  'data/public-sources/nepal-civic-watch-2026.json',
  'data/public-sources/onchain-receipt.json',
  'apps/web/app/api/reports/[id]/moderation/route.ts',
  'apps/web/app/api/reports/[id]/handoff/route.ts',
  'apps/web/lib/handoffs/policy.ts',
  'scripts/verify-public-data.ts',
];

function fail(message: string): never {
  throw new Error(message);
}

function readText(path: string) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assertFiles() {
  const missing = requiredFiles.filter((path) => !existsSync(resolve(root, path)) || statSync(resolve(root, path)).size === 0);
  if (missing.length) fail(`missing_or_empty_required_files:${missing.join(',')}`);
}

function assertDocs() {
  const canonicalReadmePath = resolve(repositoryRoot, 'README.md');
  if (!existsSync(canonicalReadmePath) || statSync(canonicalReadmePath).size === 0) {
    fail(`canonical_readme_missing_or_empty:${canonicalReadmePath}`);
  }
  const readme = readFileSync(canonicalReadmePath, 'utf8').toLowerCase();
  const required = [programId.toLowerCase(), 'public proof for public problems', 'delivered-byte verification', 'vercel blob'];
  const missing = required.filter((text) => !readme.includes(text));
  if (missing.length) fail(`readme_missing_required_text:${missing.join(',')}`);
  if (readme.includes('public read-only preview') || readme.includes('read-only public preview')) {
    fail('readme_contains_stale_preview_claim');
  }
}

function assertReadModel() {
  if (!existsSync(readModelPath)) fail(`read_model_missing:${readModelPath}`);
  const model = JSON.parse(readFileSync(readModelPath, 'utf8')) as ReadModel;
  if (!Array.isArray(model.authorityHandoffs)) fail('authority_handoffs_collection_missing');
  const sources = model.issues.filter((issue) => issue.recordKind === 'public_source');
  const community = model.issues.filter((issue) => issue.recordKind === 'community_report');
  const samples = model.issues.filter((issue) => issue.recordKind === 'illustrative_sample');
  const fixtures = model.issues.filter((issue) => issue.recordKind === 'qa_fixture');
  const publicIssues = [...sources, ...community].filter((issue) => issue.safetyReviewStatus !== 'rejected');
  if (sources.length < 4) fail(`public_sources_below_4:${sources.length}`);
  if (samples.length < 30) fail(`samples_below_30:${samples.length}`);
  if (!fixtures.length) fail('qa_fixtures_missing');
  if (sources.some((issue) => !issue.provenance || issue.proof.proofStatus !== 'indexed_devnet')) {
    fail('source_provenance_or_devnet_proof_missing');
  }
  const latest = [...publicIssues]
    .filter((issue) => issue.proof.proofStatus === 'indexed_devnet')
    .sort((a, b) => b.issueId - a.issueId)[0];
  if (!latest) fail('indexed_public_record_missing');
  return {
    model,
    latestIssueId: latest.issueId,
    counts: {
      public: publicIssues.length,
      sources: sources.length,
      community: community.length,
      samples: samples.length,
      fixtures: fixtures.length,
    },
  };
}

async function fetchJson(path: string) {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(20_000) });
  const text = await response.text();
  let payload: JsonObject = {};
  try {
    payload = text ? JSON.parse(text) as JsonObject : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok || payload.ok === false) {
    fail(`${path}_failed_http_${response.status}:${JSON.stringify(payload)}`);
  }
  return payload;
}

async function assertPage(path: string) {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) fail(`${path}_failed_http_${response.status}`);
  if ((await response.text()).length < 500) fail(`${path}_page_too_short`);
}

async function assertApp(latestIssueId: number, publicCount: number) {
  const [health, dashboard, proof, handoff] = await Promise.all([
    fetchJson('/api/health'),
    fetchJson('/api/dashboard'),
    fetchJson(`/api/verify-proof/${latestIssueId}`),
    fetchJson(`/api/reports/${latestIssueId}/handoff`),
  ]);
  if (health.programId !== programId) fail(`unexpected_program_id:${String(health.programId)}`);
  const stats = dashboard.stats as JsonObject | undefined;
  if (!stats || Number(stats.totalIssues) !== publicCount) {
    fail(`dashboard_public_count_mismatch:${String(stats?.totalIssues)}:${publicCount}`);
  }
  const handoffOverview = dashboard.handoffs as JsonObject | undefined;
  const handoffStats = handoffOverview?.stats as JsonObject | undefined;
  if (!handoffStats || !Array.isArray(handoffOverview?.recent) || handoffOverview?.integrity !== true) fail('dashboard_handoff_contract_missing');
  for (const field of ['routedIssues', 'preparedOnly', 'submittedIssues', 'acknowledgedIssues', 'overdueFollowUps', 'closedHandoffs', 'totalEvents']) {
    const value = Number(handoffStats[field]);
    if (!Number.isInteger(value) || value < 0) fail(`dashboard_handoff_stat_invalid:${field}:${String(handoffStats[field])}`);
  }
  if (handoff.mode !== 'platform_audit_log_not_onchain' || handoff.integrity !== true || Number(handoff.issueId) !== latestIssueId || !Array.isArray(handoff.handoffs)) {
    fail(`handoff_api_contract_invalid:${JSON.stringify(handoff)}`);
  }
  if (
    proof.matches !== true
    || proof.evidenceStatus !== 'match'
    || proof.evidenceAvailable !== true
    || proof.evidenceMatches !== true
    || proof.storedEvidenceMatchesOnChain !== true
  ) {
    fail(`proof_not_fully_green:${JSON.stringify(proof)}`);
  }
  await Promise.all([
    assertPage('/'),
    assertPage('/about'),
    assertPage('/dashboard'),
    assertPage('/explore'),
    assertPage('/report'),
    assertPage('/steward'),
    assertPage(`/issues/${latestIssueId}`),
  ]);
  return { health, dashboard, proof, handoff };
}

async function main() {
  assertFiles();
  assertDocs();
  const { latestIssueId, counts } = assertReadModel();
  const app = await assertApp(latestIssueId, counts.public);
  const rpc = app.health.rpc as JsonObject | undefined;
  console.log(JSON.stringify({
    ok: true,
    action: 'final_preflight',
    baseUrl,
    latestIssueId,
    counts,
    rpc: {
      ok: rpc?.ok,
      programDeployed: rpc?.programDeployed,
      relayerBalanceSol: rpc?.relayerBalanceSol,
    },
    proof: {
      matches: app.proof.matches,
      evidenceStatus: app.proof.evidenceStatus,
      evidenceByteLength: app.proof.evidenceByteLength,
      explorerUrl: app.proof.explorerUrl,
    },
    handoffs: {
      latestIssueEvents: Array.isArray(app.handoff.handoffs) ? app.handoff.handoffs.length : null,
      mode: app.handoff.mode,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

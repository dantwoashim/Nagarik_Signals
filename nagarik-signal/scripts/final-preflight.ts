import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { seededDemoSummary } from '../apps/web/lib/db/demoSeed';
import type { ReadModel } from '../apps/web/lib/db/queries';

type JsonObject = Record<string, unknown>;

const root = process.cwd();
const baseUrl = process.env.NAGARIK_PREFLIGHT_BASE_URL ?? process.env.NAGARIK_PHASE5_BASE_URL ?? 'http://127.0.0.1:3001';
const readModelPath = resolve(root, 'data', 'read-model', 'nagarik-signal.json');

const requiredFiles = [
  'README.md',
  'ARCHITECTURE.md',
  'ROADMAP.md',
  'SAFETY.md',
  'docs/competitors.md',
  'docs/why-solana.md',
  'docs/privacy-and-safety.md',
  'docs/product-walkthrough.md',
  'docs/product-faq.md',
  'docs/public-posts.md',
  'apps/web/app/about/page.tsx',
  'apps/web/app/steward/page.tsx',
  'scripts/phase2-api-smoke.ts',
  'scripts/phase5-status-lifecycle-smoke.ts',
];

function fail(message: string): never {
  throw new Error(message);
}

function readText(path: string) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assertFiles() {
  const missing = requiredFiles.filter((path) => !existsSync(resolve(root, path)) || statSync(resolve(root, path)).size === 0);
  if (missing.length) fail(`Missing or empty required files: ${missing.join(', ')}`);
}

function assertDocs() {
  const readme = readText('README.md');
  const readmeLower = readme.toLowerCase();
  const publicPosts = readText('docs/public-posts.md');
  const requiredReadmeText = [
    '76PwNDW9hANj3tiebTEUdAj4yHYHVMfjcVDPjUWLQmqY',
    'Public proof for public problems',
    'No tokens',
    'phase5:smoke',
  ];
  const missing = requiredReadmeText.filter((text) => !readmeLower.includes(text.toLowerCase()));
  if (missing.length) fail(`README is missing required text: ${missing.join(', ')}`);
  if (!publicPosts.includes('Nagarik Signal is now available as a public read-only preview.')) {
    fail('Public posts file is missing the public preview announcement.');
  }
}

function assertReadModel() {
  if (!existsSync(readModelPath)) fail(`Read model missing at ${readModelPath}. Run npm run seed:demo.`);
  const model = JSON.parse(readFileSync(readModelPath, 'utf8')) as ReadModel;
  const summary = seededDemoSummary(model);
  const failures = [
    summary.issues >= 30 ? null : `visible issues ${summary.issues} < 30`,
    summary.wards >= 5 ? null : `wards ${summary.wards} < 5`,
    summary.verifications >= 10 ? null : `verifications ${summary.verifications} < 10`,
    summary.resolved >= 2 ? null : `resolved ${summary.resolved} < 2`,
    summary.inProgress >= 5 ? null : `in progress ${summary.inProgress} < 5`,
    summary.unresolved >= 10 ? null : `unresolved ${summary.unresolved} < 10`,
    summary.maxVerifications >= 3 ? null : `max verifications ${summary.maxVerifications} < 3`,
  ].filter(Boolean);
  if (failures.length) fail(`Seeded data is not sample-ready: ${failures.join('; ')}`);
  const live = model.issues.filter((issue) => issue.proof.proofStatus === 'indexed_devnet');
  if (!live.length) fail('No indexed_devnet issue exists for live ProofPanel verification.');
  return { model, summary, liveIssueId: live.sort((a, b) => b.issueId - a.issueId)[0].issueId };
}

async function fetchJson(path: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, { signal: controller.signal });
    const text = await response.text();
    let payload: JsonObject = {};
    try {
      payload = text ? JSON.parse(text) as JsonObject : {};
    } catch {
      payload = { raw: text };
    }
    if (!response.ok || payload.ok === false) {
      fail(`${path} failed with HTTP ${response.status}: ${JSON.stringify(payload)}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function assertPage(path: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, { signal: controller.signal });
    if (!response.ok) fail(`${path} failed with HTTP ${response.status}`);
    const text = await response.text();
    if (text.length < 500) fail(`${path} returned an unexpectedly short page.`);
  } finally {
    clearTimeout(timeout);
  }
}

async function assertApp(liveIssueId: number) {
  const [health, dashboard, proof] = await Promise.all([
    fetchJson('/api/health'),
    fetchJson('/api/dashboard'),
    fetchJson(`/api/verify-proof/${liveIssueId}`),
  ]);
  if (health.programId !== '76PwNDW9hANj3tiebTEUdAj4yHYHVMfjcVDPjUWLQmqY') {
    fail(`Health endpoint returned unexpected program ID: ${String(health.programId)}`);
  }
  const stats = dashboard.stats as JsonObject | undefined;
  if (!stats || Number(stats.totalIssues ?? 0) < 30) fail('Dashboard API does not show the seeded sample dataset.');
  if (proof.matches !== true) fail(`ProofPanel API did not return a green match for issue ${liveIssueId}.`);
  await Promise.all([
    assertPage('/'),
    assertPage('/about'),
    assertPage('/dashboard'),
    assertPage('/explore'),
    assertPage(`/issues/${liveIssueId}`),
  ]);
  return { health, dashboard, proof };
}

async function main() {
  assertFiles();
  assertDocs();
  const { summary, liveIssueId } = assertReadModel();
  const app = await assertApp(liveIssueId);

  console.log(JSON.stringify({
    ok: true,
    action: 'final_preflight',
    baseUrl,
    liveIssueId,
    summary,
    health: {
      ok: app.health.ok,
      programId: app.health.programId,
      relayerBalanceSol: app.health.relayerBalanceSol,
    },
    proof: {
      issueId: liveIssueId,
      matches: app.proof.matches,
      explorerUrl: app.proof.explorerUrl,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

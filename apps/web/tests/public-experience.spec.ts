import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

type TestIssue = {
  id: string;
  issueId: number;
  title: string;
  recordKind: string;
  provenance: { publisher: string; sourceUrl: string; escalationUrl?: string | null } | null;
};

async function publicIssues(request: APIRequestContext) {
  const response = await request.get('/api/reports?scope=public&limit=100');
  expect(response.ok()).toBe(true);
  const payload = await response.json() as { issues: TestIssue[] };
  expect(payload.issues.length).toBeGreaterThan(0);
  return payload.issues;
}

async function sampleIssues(request: APIRequestContext) {
  const response = await request.get('/api/reports?scope=samples&limit=100');
  expect(response.ok()).toBe(true);
  const payload = await response.json() as { issues: TestIssue[] };
  expect(payload.issues.length).toBeGreaterThan(0);
  return payload.issues;
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectImagesLoaded(page: Page, selector: string) {
  const images = page.locator(selector);
  await expect.poll(() => images.evaluateAll((rows) => rows.every((row) => (row as HTMLImageElement).complete))).toBe(true);
  const broken = await images.evaluateAll((rows) => rows
    .map((row) => row as HTMLImageElement)
    .filter((row) => row.complete && row.naturalWidth === 0)
    .map((row) => row.currentSrc || row.src));
  expect(broken).toEqual([]);
}

test('homepage is map-first, concise, and backed by current public totals', async ({ page, request }) => {
  const issues = await publicIssues(request);
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Nagarik Signal' })).toBeVisible();
  await expect(page.getByText('Track civic issues from evidence to public follow-up.')).toBeVisible();
  await expect(page.locator('.home-command-stats')).toContainText(`Public records${issues.length}`);
  await expect(page.getByRole('heading', { name: 'See where follow-up is needed' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How reporting works' })).toBeVisible();
  await expect(page.locator('.home-records')).toHaveCount(0);
  await expect(page.locator('img:not([alt])')).toHaveCount(0);

  await page.locator('.home-map-section').scrollIntoViewIfNeeded();
  await expect(page.locator('.atlas-map')).toHaveAttribute('data-map-state', 'ready', { timeout: 20_000 });
  const mapCapture = await page.locator('.civic-atlas').screenshot();
  expect(mapCapture.byteLength).toBeGreaterThan(20_000);
  await expectNoHorizontalOverflow(page);
});

test('source issue separates integrity, attention, status, and official follow-up', async ({ page, request }) => {
  test.slow();
  const issues = await publicIssues(request);
  const source = issues.find((issue) => issue.recordKind === 'public_source' && issue.provenance) ?? issues[0];

  await page.goto(`/issues/${source.id}#proof`);
  await expect(page.getByRole('heading', { name: 'Record integrity' })).toBeVisible();
  if (source.provenance) {
    await expect(page.getByRole('heading', { name: 'Source', exact: true })).toBeVisible();
    await expect(page.getByText(source.provenance.publisher, { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /Read original source/ })).toHaveAttribute('href', source.provenance.sourceUrl);
  }
  await expect(page.getByRole('heading', { name: 'Official follow-up' })).toBeVisible();
  await expect(page.getByText('These entries are recorded by Nagarik Signal stewards.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Public attention' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Record history' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share record' })).toBeVisible();

  await expect(page.locator('#proof > .proof-panel-heading .pill')).toContainText('Live match', { timeout: 45_000 });
  await expect(page.locator('#proof')).toContainText(/evidence bytes and the current public record match/i);
  await expect(page.locator('#proof')).toContainText('It does not confirm that the report is true');

  const proofResponse = await request.get(`/api/verify-proof/${source.id}`);
  expect(proofResponse.ok()).toBe(true);
  expect(await proofResponse.json()).toMatchObject({
    ok: true,
    network: 'devnet',
    issuePda: expect.any(String),
    checkedAt: expect.any(String),
  });

  const evidenceBox = await page.locator('#evidence').boundingBox();
  const handoffBox = await page.locator('#handoff').boundingBox();
  const historyBox = await page.locator('#activity').boundingBox();
  const locationBox = await page.locator('#location').boundingBox();
  const proofBox = await page.locator('#proof').boundingBox();
  expect(evidenceBox && handoffBox && historyBox && locationBox && proofBox).toBeTruthy();
  expect(evidenceBox!.y).toBeLessThan(handoffBox!.y);
  expect(handoffBox!.y).toBeLessThan(historyBox!.y);
  expect(historyBox!.y).toBeLessThan(locationBox!.y);
  expect(locationBox!.y).toBeLessThan(proofBox!.y);
  await expectNoHorizontalOverflow(page);
});

test('explore preserves map and list state while samples stay outside primary navigation', async ({ page, request }) => {
  const issues = await publicIssues(request);

  await page.goto('/explore?view=list');
  await expect(page.getByRole('heading', { name: 'Public civic records' })).toBeVisible();
  await expect(page.locator('.result-count')).toContainText(`${issues.length} public civic record`);
  await expect(page.locator('.issue-card')).toHaveCount(Math.min(issues.length, 12));
  await expect(page.getByRole('link', { name: 'Illustrative samples' })).toHaveCount(0);
  await page.getByLabel('Search').fill(issues[0].title.split(' ').slice(0, 2).join(' '));
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page).toHaveURL(/view=list/);

  await page.goto('/explore?scope=samples&view=list');
  await expect(page.getByRole('link', { name: 'Back to public records' })).toBeVisible();
  await expect(page.locator('.result-count')).toContainText('illustrative sample');

  await page.goto('/explore');
  await expect(page.getByRole('heading', { name: 'Civic issues across Nepal' })).toBeVisible();
  await expect(page.locator('.atlas-record-list button')).toHaveCount(issues.length);
  await expect(page.locator('.atlas-map')).toHaveAttribute('data-map-state', 'ready', { timeout: 20_000 });
  const target = issues.at(-1)!;
  await page.locator('.atlas-record-list button').filter({ hasText: target.title }).click();
  await expect(page.locator('.atlas-selection').getByRole('heading')).toContainText(target.title);
  await expectImagesLoaded(page, '.atlas-selection img');
  await expectNoHorizontalOverflow(page);
});

test('map failure is fast, retryable, and retains an accessible record selector', async ({ page, request }) => {
  const issues = await publicIssues(request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/openfreemap\.org/, (route) => route.abort('failed'));
  await page.goto('/explore');

  await expect(page.locator('.atlas-map')).toHaveAttribute('data-map-state', 'error', { timeout: 8_000 });
  await expect(page.getByText('Detailed map unavailable')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry map' })).toBeVisible();
  const selector = page.getByLabel('Choose a record');
  await expect(selector).toBeVisible();
  await expect(selector.locator('option')).toHaveCount(issues.length);
  await selector.selectOption(issues.at(-1)!.id);
  await expect(page.locator('.atlas-selection').getByRole('heading')).toContainText(issues.at(-1)!.title);
  await expectNoHorizontalOverflow(page);
});

test('mobile navigation and four-step report flow work without a pointer', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const menuButton = page.getByRole('button', { name: 'Open navigation' });
  await menuButton.focus();
  await page.keyboard.press('Enter');
  const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(mobileNav).toBeVisible();
  await expect(mobileNav.getByRole('button', { name: 'Close navigation' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(mobileNav.getByRole('link', { name: 'How it works' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menuButton).toBeFocused();
  await expect(mobileNav).toHaveCount(0);

  await page.goto('/report');
  await expect(page.getByRole('heading', { name: 'Report a public issue' })).toBeVisible();
  await expect(page.getByText('Before you upload')).toBeVisible();
  await expect(page.getByText('Step 1 of 4')).toBeVisible();
  const photo = page.getByLabel('Photo', { exact: true });
  await photo.setInputFiles('public/demo/pothole-road.jpg');
  await expect(page.getByRole('img', { name: /Selected evidence preview/ })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Step 2 of 4')).toBeVisible();
  await page.getByLabel('Title').fill('Blocked drain beside a public footpath');
  await page.getByLabel('Description').fill('A damaged drain cover blocks part of the public footpath and leaves an exposed edge beside the walking route.');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Step 3 of 4')).toBeVisible();
  await expect(page.locator('.location-picker-map')).toHaveAttribute('data-map-state', 'ready', { timeout: 20_000 });

  await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:3001' });
  await context.setGeolocation({ latitude: 27.689876, longitude: 85.321234 });
  await page.getByRole('button', { name: 'Use my current area' }).click();
  await expect(page.locator('.location-coordinate-strip code')).toHaveText('27.690, 85.321');
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.getByText('Step 4 of 4')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Review and publish' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish report' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('sample integrity stays clearly local and technical details stay collapsed', async ({ page, request }) => {
  const samples = await sampleIssues(request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/issues/${samples[0].id}#proof`);
  await expect(page.locator('#proof > .proof-panel-heading .pill')).toContainText('Local match', { timeout: 20_000 });
  await expect(page.locator('#proof')).toContainText('does not claim a live Solana record');
  await expect(page.getByText('Issue PDA')).toBeHidden();
  await expectNoHorizontalOverflow(page);
});

test('dashboard and steward console keep public follow-up and chain status separate', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Civic issues that need follow-up' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Official follow-up activity' })).toBeVisible();
  await expect(page.locator('.handoff-metric-strip')).toContainText('prepared only');
  await expect(page.locator('.handoff-metric-strip')).toContainText('Receipt');

  await page.goto('/steward');
  await expect(page.getByRole('heading', { name: 'Moderate, update, and follow through' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Create status proof' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Record authority handoff' })).toBeVisible();
  await expect(page.getByLabel('Handoff state')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Control media and discovery' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('mutation endpoints enforce origin, authentication, append-only, and retry boundaries', async ({ request }) => {
  const issues = await publicIssues(request);
  let issue: TestIssue | null = null;
  for (const candidate of issues) {
    const response = await request.get(`/api/reports/${candidate.id}/handoff`);
    if (response.ok() && ((await response.json()) as { handoffs: unknown[] }).handoffs.length === 0) {
      issue = candidate;
      break;
    }
  }
  expect(issue).not.toBeNull();
  const endpoint = `/api/reports/${issue!.id}/handoff`;

  const untrusted = await request.post('/api/upload', { headers: { Origin: 'https://example.com' } });
  expect(untrusted.status()).toBe(403);
  expect(await untrusted.json()).toMatchObject({ ok: false, error: 'untrusted_origin' });

  const malformed = await request.post('/api/upload', { headers: { Origin: 'not-a-url' } });
  expect(malformed.status()).toBe(403);
  expect(await malformed.json()).toMatchObject({ ok: false, error: 'invalid_origin' });

  const untrustedHandoff = await request.post(endpoint, {
    headers: {
      Origin: 'https://example.com',
      'x-nagarik-steward-secret': 'nagarik-e2e-steward-secret-0123456789',
    },
    data: {},
  });
  expect(untrustedHandoff.status()).toBe(403);

  const unauthenticatedHandoff = await request.post(endpoint, {
    headers: { Origin: 'http://127.0.0.1:3001' },
    data: {},
  });
  expect(unauthenticatedHandoff.status()).toBe(401);

  const idempotencyKey = randomUUID();
  const preparedBody = {
    idempotencyKey,
    expectedPreviousEventHash: null,
    state: 'prepared',
    authorityName: 'Office of the Prime Minister and Council of Ministers',
    channelName: 'Hello Sarkar',
    channelUrl: 'https://gunaso.opmcm.gov.np/',
    note: 'Official intake route prepared for operational follow-up. No delivery or authority response is claimed.',
    occurredAt: new Date().toISOString(),
  };
  const trustedHeaders = {
    Origin: 'http://127.0.0.1:3001',
    'x-nagarik-steward-secret': 'nagarik-e2e-steward-secret-0123456789',
  };
  const prepared = await request.post(endpoint, { headers: trustedHeaders, data: preparedBody });
  expect(prepared.status()).toBe(201);
  const preparedPayload = await prepared.json();
  expect(preparedPayload).toMatchObject({
    ok: true,
    created: true,
    mode: 'platform_audit_log_not_onchain',
    integrity: true,
    handoff: { issueId: issue!.issueId, seq: 1, state: 'prepared', evidenceBasis: 'route_only' },
  });
  expect(preparedPayload.handoff.eventHash).toMatch(/^[0-9a-f]{64}$/);

  const retried = await request.post(endpoint, { headers: trustedHeaders, data: preparedBody });
  expect(retried.status()).toBe(200);
  expect(await retried.json()).toMatchObject({ ok: true, created: false, handoff: { eventHash: preparedPayload.handoff.eventHash } });

  const conflictingRetry = await request.post(endpoint, {
    headers: trustedHeaders,
    data: { ...preparedBody, authorityName: 'Different authority' },
  });
  expect(conflictingRetry.status()).toBe(409);
  expect(await conflictingRetry.json()).toMatchObject({ ok: false, error: 'idempotency_key_reused' });
});

test('public routes have no serious accessibility violations', async ({ page, request }) => {
  const issues = await publicIssues(request);
  const paths = ['/', '/about', '/explore?view=list', '/dashboard', '/report', `/issues/${issues[0].id}`];
  for (const path of paths) {
    await page.goto(path);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    const serious = result.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(serious, `${path}: ${serious.map((violation) => `${violation.id} (${violation.nodes.length})`).join(', ')}`).toEqual([]);
  }
});

test('reduced motion and public language boundaries are respected', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const duration = await page.locator('.home-process-steps article').first().evaluate((element) => getComputedStyle(element).animationDuration);
  expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.01);

  const forbidden = /\b(judge|judges|submission|hackathon|bounty|showcase)\b/i;
  for (const path of ['/', '/about', '/explore', '/dashboard', '/report', '/steward']) {
    await page.goto(path);
    expect(await page.locator('body').innerText()).not.toMatch(forbidden);
  }
});

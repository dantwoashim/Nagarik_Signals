import { expect, test } from '@playwright/test';

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectImagesLoaded(page: import('@playwright/test').Page, selector: string) {
  const images = page.locator(selector);
  await expect.poll(() => images.evaluateAll((rows) => rows.every((row) => (row as HTMLImageElement).complete))).toBe(true);
  const broken = await images.evaluateAll((rows) => rows
    .map((row) => row as HTMLImageElement)
    .filter((row) => row.complete && row.naturalWidth === 0)
    .map((row) => row.currentSrc || row.src));
  expect(broken).toEqual([]);
}

test('homepage leads with sourced public records and honest totals', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Public proof for public problems.');
  await expect(page.getByText('4 public records anchored on devnet')).toBeVisible();
  await expect(page.locator('.proof-scope')).toContainText('30 illustrative samples kept outside these totals');
  await expect(page.getByRole('link', { name: 'Verify public devnet record 15' })).toHaveAttribute('href', '/issues/15#proof');
  await page.getByRole('heading', { name: 'Documented issues that still need a current answer' }).scrollIntoViewIfNeeded();
  await expect(page.locator('.issue-card')).toHaveCount(4);
  await expectImagesLoaded(page, '.issue-card img');
  await expect(page.getByText('Phase 2 API smoke issue mra7pf0d')).toHaveCount(0);
  await expect(page.locator('img:not([alt])')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test('source record exposes provenance, official handoff, and live proof', async ({ page }) => {
  test.slow();
  await page.goto('/issues/15');
  await expect(page.getByRole('heading', { name: 'What this record can prove' })).toBeVisible();
  await expect(page.getByText('The Kathmandu Post', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Read original source/ })).toHaveAttribute('href', /kathmandupost\.com/);
  await expect(page.getByRole('link', { name: 'Open official grievance channel' })).toBeVisible();
  await page.getByRole('button', { name: 'Verify against Solana' }).click();
  await expect(page.getByText('on-chain match')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/delivered evidence bytes checked/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('explore keeps real records, samples, and map state separate', async ({ page }) => {
  await page.goto('/explore');
  await expect(page.getByRole('heading', { name: 'See what still needs a current answer' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('4 public civic records');
  await expect(page.locator('.issue-card')).toHaveCount(4);
  await expect(page.getByText('Broken drain cover beside public bus stop')).toHaveCount(0);

  await page.getByRole('link', { name: 'Illustrative samples' }).click();
  await expect(page.getByRole('status')).toContainText('30 illustrative samples');
  await expect(page.locator('.issue-card')).toHaveCount(12);
  await expect(page.getByText('Public drainage channel needs clearing')).toBeVisible();

  await page.goto('/explore?view=map');
  await expect(page.locator('.map-marker')).toHaveCount(4);
  await expect(page.locator('img:not([alt])')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test('mobile navigation, report flow, and issue hierarchy remain usable', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Report', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await page.goto('/report');
  await expect(page.getByRole('heading', { name: 'Put a public problem on the record' })).toBeVisible();
  await expect(page.getByLabel('Title')).toBeVisible();
  await expect(page.getByLabel('Safe public photo')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const samplesResponse = await request.get('/api/reports?scope=samples&limit=1');
  expect(samplesResponse.ok()).toBe(true);
  const samples = await samplesResponse.json() as { issues: Array<{ id: string }> };
  expect(samples.issues).not.toHaveLength(0);
  await page.goto(`/issues/${samples.issues[0].id}`);
  const evidencePanel = page.locator('.issue-evidence');
  const verifyPanel = page.locator('.issue-verify');
  const proofPanel = page.locator('.issue-proof');
  const timelinePanel = page.locator('.issue-timeline');
  await expect(evidencePanel).toBeVisible();
  await expect(verifyPanel).toBeVisible();
  await expect(proofPanel).toBeVisible();
  await expect(timelinePanel).toBeVisible();
  const evidence = await evidencePanel.boundingBox();
  const provenanceOrVerify = await verifyPanel.boundingBox();
  const proof = await proofPanel.boundingBox();
  const timeline = await timelinePanel.boundingBox();
  expect(evidence && provenanceOrVerify && proof && timeline).toBeTruthy();
  expect(evidence!.y).toBeLessThan(provenanceOrVerify!.y);
  expect(provenanceOrVerify!.y).toBeLessThan(proof!.y);
  expect(proof!.y).toBeLessThan(timeline!.y);
  await page.getByRole('button', { name: 'Check sample integrity' }).click();
  await expect(page.getByText('local sample match')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('steward console contains separate chain-status and media moderation controls', async ({ page }) => {
  await page.goto('/steward');
  await expect(page.getByRole('heading', { name: 'Moderate and update public status' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Create status proof' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Control media and discovery' })).toBeVisible();
  await expect(page.getByLabel('Review outcome')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('mutation endpoints reject untrusted and malformed origins before parsing input', async ({ request }) => {
  const untrusted = await request.post('/api/upload', { headers: { Origin: 'https://example.com' } });
  expect(untrusted.status()).toBe(403);
  expect(await untrusted.json()).toMatchObject({ ok: false, error: 'untrusted_origin' });

  const malformed = await request.post('/api/upload', { headers: { Origin: 'not-a-url' } });
  expect(malformed.status()).toBe(403);
  expect(await malformed.json()).toMatchObject({ ok: false, error: 'invalid_origin' });
});

test('public pages avoid internal event-facing language', async ({ page }) => {
  const forbidden = /\b(judge|judges|submission|hackathon|bounty|showcase)\b/i;
  for (const path of ['/', '/about', '/explore', '/dashboard', '/report', '/steward', '/issues/15']) {
    await page.goto(path);
    expect(await page.locator('body').innerText()).not.toMatch(forbidden);
  }
});

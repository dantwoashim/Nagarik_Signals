import { expect, test } from '@playwright/test';

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test('homepage establishes the civic record and honest proof scope', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Public proof for public problems.');
  await expect(page.getByText(/live devnet/).first()).toBeVisible();
  await expect(page.getByText(/clearly marked sample records/)).toBeVisible();
  await expect(page.locator('img:not([alt])')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test('mobile navigation and core actions fit without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Report', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('explore provides a usable coarse map and public records', async ({ page }) => {
  await page.goto('/explore');
  await expect(page.getByRole('heading', { name: 'Where records are gathering' })).toBeVisible();
  await expect(page.locator('.map-marker')).not.toHaveCount(0);
  await expect(page.locator('.issue-card')).not.toHaveCount(0);
  await expect(page.locator('img:not([alt])')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test('mobile issue flow puts action and verdict before technical history', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/issues/seeded-demo-910030');

  const evidence = await page.locator('.issue-evidence').boundingBox();
  const verification = await page.locator('.issue-verify').boundingBox();
  const proof = await page.locator('.issue-proof').boundingBox();
  const timeline = await page.locator('.issue-timeline').boundingBox();

  expect(evidence && verification && proof && timeline).toBeTruthy();
  expect(evidence!.y).toBeLessThan(verification!.y);
  expect(verification!.y).toBeLessThan(proof!.y);
  expect(proof!.y).toBeLessThan(timeline!.y);

  await page.getByRole('button', { name: 'Check sample integrity' }).click();
  await expect(page.getByText('local sample match')).toBeVisible();
  await expect(page.locator('img:not([alt])')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test('public pages avoid event-facing language', async ({ page }) => {
  for (const path of ['/', '/about', '/explore', '/dashboard', '/report', '/steward']) {
    await page.goto(path);
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/\b(judge|judges|submission|hackathon|bounty|showcase)\b/i);
  }
});

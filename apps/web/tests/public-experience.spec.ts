import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

const publicId = '9f8d7c6b-5a4e-4321-9012-3456789abcde';
const secondId = '8e7d6c5b-4a3f-4210-9012-3456789abcdf';
const thirdId = '7d6c5b4a-3f2e-4109-8123-456789abcdef';
const removedId = '6c5b4a3f-2e1d-4098-8123-456789abcdee';
const submissionId = '11111111-2222-4333-8444-555555555555';
const mediaId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const organizationId = '00000000-1111-4222-8333-444444444444';
const now = '2026-07-31T09:00:00.000Z';

const issues = [
  {
    publicId,
    workflowVersion: 'v2',
    publicationState: 'published',
    title: 'Loose drain cover beside the public walkway',
    summary: 'A displaced drain cover leaves an exposed edge beside a pedestrian route.',
    category: 'water',
    ward: { id: 'kathmandu-10', label: 'Kathmandu Ward 10' },
    location: {
      centerLatE6: 27692000,
      centerLngE6: 85336000,
      uncertaintyRadiusM: 800,
    },
    mediaUrl: '/demo/storm-drain.jpg',
    lifecycle: 'in_progress',
    legacyStatus: null,
    signalCount: 18,
    publishedAt: '2026-07-28T08:15:00.000Z',
    updatedAt: now,
  },
  {
    publicId: secondId,
    workflowVersion: 'v2',
    publicationState: 'published',
    title: 'Damaged paving near a public crossing',
    summary: 'Broken paving narrows the accessible route near a marked crossing.',
    category: 'road',
    ward: { id: 'pokhara-08', label: 'Pokhara Ward 8' },
    location: {
      centerLatE6: 28209000,
      centerLngE6: 83985000,
      uncertaintyRadiusM: 900,
    },
    mediaUrl: '/demo/broken-paving-top.jpg',
    lifecycle: 'open',
    legacyStatus: null,
    signalCount: 7,
    publishedAt: '2026-07-27T07:00:00.000Z',
    updatedAt: '2026-07-30T08:00:00.000Z',
  },
  {
    publicId: thirdId,
    workflowVersion: 'v2',
    publicationState: 'published',
    title: 'Waste blocking a roadside drain',
    summary: 'Accumulated waste is restricting runoff beside a public road.',
    category: 'waste',
    ward: { id: 'biratnagar-04', label: 'Biratnagar Ward 4' },
    location: {
      centerLatE6: 26450000,
      centerLngE6: 87270000,
      uncertaintyRadiusM: 850,
    },
    mediaUrl: '/demo/garbage-street.jpg',
    lifecycle: 'resolved',
    legacyStatus: null,
    signalCount: 11,
    publishedAt: '2026-07-26T06:00:00.000Z',
    updatedAt: '2026-07-29T08:00:00.000Z',
  },
];

const stats = {
  total: 3,
  open: 1,
  inProgress: 1,
  resolved: 1,
  closed: 0,
  signals: 36,
  categories: [
    { category: 'water', total: 1 },
    { category: 'road', total: 1 },
    { category: 'waste', total: 1 },
  ],
  wards: issues.map((issue) => ({
    id: issue.ward.id,
    label: issue.ward.label,
    total: 1,
  })),
  updatedAt: now,
};

const detail = {
  ...issues[0],
  versionId: 'version-1',
  narrative:
    'A displaced concrete drain cover leaves an exposed edge beside a busy pedestrian route near the ward office. The reviewed image contains no identifying detail.',
  provenance: { recordKind: 'community_report', observedOn: '2026-07-27' },
  proofAvailable: true,
  events: [
    {
      id: 'event-1',
      type: 'published',
      chainSequence: 0,
      data: { publicMessage: 'Reviewed public version published.' },
      occurredAt: '2026-07-28T08:15:00.000Z',
    },
    {
      id: 'event-2',
      type: 'lifecycle_changed',
      chainSequence: 1,
      data: { state: 'in_progress', publicMessage: 'Ward follow-up is being coordinated.' },
      occurredAt: now,
    },
  ],
};

const proof = {
  schemaVersion: 'nagarik-proof-response-v2',
  publicId,
  protocolVersion: 'v2',
  checkedAt: now,
  checks: {
    metadata: { status: 'match', expectedHash: 'a'.repeat(64), computedHash: 'a'.repeat(64) },
    evidence: {
      status: 'match',
      expectedHash: 'b'.repeat(64),
      computedHash: 'b'.repeat(64),
      available: true,
      byteLength: 483120,
      mediaType: 'image/jpeg',
      error: null,
    },
    location: { status: 'match', expectedHash: 'c'.repeat(64), computedHash: 'c'.repeat(64) },
    chain: {
      status: 'finalized_binding_recorded',
      cluster: 'curated-pilot',
      genesisHash: 'g'.repeat(32),
      programId: 'NSig111111111111111111111111111111111111',
      issueAccount: '7yHWQpQq2PTkzQzjDQxuvYmUFU6zqMoLpxQ8v5FhVK1S',
      eventAccount: '8s1MQExampleEvent',
      signature: '4wHVExampleFinalizedSignature111111111111111',
      finalizedSlot: 421390,
      updateCount: 2,
      timelineHead: 'd'.repeat(64),
      handoffHead: 'e'.repeat(64),
      confirmedAt: now,
    },
    availability: { issue: 'public', media: 'public' },
  },
  canonicalMetadata: {},
  boundary: {
    integrity: 'The published bytes and commitments match this public record.',
    truth:
      'Integrity confirms record consistency. It does not prove that every claim is true or that an authority has acted.',
    signals: 'Public signals indicate attention, not identity or truth.',
  },
};

function envelope(data: unknown) {
  return JSON.stringify({ ok: true, requestId: 'e2e', data });
}

async function fulfill(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: envelope(data),
  });
}

async function mockMap(page: Page, fail = false) {
  await page.route('https://tiles.openfreemap.org/styles/liberty', async (route) => {
    if (fail) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        version: 8,
        name: 'Nagarik test map',
        glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
        sources: {},
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': '#edf0eb' } },
        ],
      }),
    });
  });
}

async function mockV2(page: Page) {
  let signalCount = 18;
  let trackingState = 'received';
  let submittedBody: Record<string, unknown> | null = null;
  await page.route('**/api/v2/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/v2/issues/stats') return fulfill(route, stats);
    if (url.pathname === '/api/v2/issues') {
      return fulfill(route, { items: issues, nextCursor: null });
    }
    if (url.pathname === `/api/v2/issues/${removedId}`) {
      return fulfill(route, {
        publicId: removedId,
        publicationState: 'removed',
        tombstone: {
          message: 'Public content was removed after a privacy and safety review.',
        },
        proofAvailable: true,
        updatedAt: now,
      });
    }
    if (url.pathname === `/api/v2/issues/${publicId}/proof`) return fulfill(route, proof);
    if (url.pathname === `/api/v2/issues/${publicId}`) return fulfill(route, detail);
    if (url.pathname.endsWith('/signals')) {
      signalCount += request.method() === 'DELETE' ? -1 : 1;
      return fulfill(route, { signalCount, active: request.method() !== 'DELETE' });
    }
    if (url.pathname === '/api/v2/intake-sessions') {
      return fulfill(route, {
        scope: ['intake', 'signal'],
        expiresAt: '2026-08-01T00:00:00.000Z',
        policy: {
          version: 'pilot-v1',
          wardGeometryVersion: 'ktm-pilot-2026-01',
          wardIds: ['kathmandu-10', 'kathmandu-12'],
        },
      });
    }
    if (url.pathname === '/api/v2/uploads') {
      return fulfill(route, {
        mediaId,
        receipt: 'r'.repeat(100),
        expiresAt: now,
        normalization: {
          mimeType: 'image/jpeg',
          byteLength: 1000,
          width: 1200,
          height: 800,
        },
        reviewState: 'private',
      });
    }
    if (url.pathname === '/api/v2/submissions' && request.method() === 'POST') {
      submittedBody = request.postDataJSON() as Record<string, unknown>;
      trackingState = 'received';
      return fulfill(route, {
        trackingId: 'track-demo-2026',
        recoveryToken: 'recovery-token',
        state: trackingState,
        receivedAt: now,
        media: { state: 'private' },
        next: '/submissions/track-demo-2026',
      });
    }
    if (url.pathname === '/api/v2/submissions/track-demo-2026') {
      return fulfill(route, {
        trackingId: 'track-demo-2026',
        state: trackingState,
        currentRevision: 1,
        receivedAt: now,
        updatedAt: now,
        media: { state: 'private' },
        publicIssueId: null,
        next: 'moderation',
      });
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: { code: 'not_found' } }),
    });
  });
  return {
    submittedBody: () => submittedBody,
  };
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test('public home, explore, and insights use only v2 public records', async ({ page }) => {
  test.setTimeout(120_000);
  await mockMap(page);
  await mockV2(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Nagarik Signal' })).toBeVisible();
  await expect(
    page.locator('.prod-command-stats').getByText('Public records').locator('..'),
  ).toContainText('3');
  await page
    .getByRole('heading', { name: 'See where follow-up is needed' })
    .scrollIntoViewIfNeeded();
  await expect(page.locator('.prod-map-surface')).toHaveAttribute('data-map-state', 'ready');
  await expect(page.getByText('Approximate locations')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto('/explore');
  await expect(page.getByRole('heading', { name: 'Public civic records' })).toBeVisible();
  await page.getByRole('button', { name: 'List' }).click();
  await expect(page.locator('.prod-record-list > *')).toHaveCount(3);
  await page.getByPlaceholder('Search issue, area, or record ID').fill('paving');
  await expect(page.getByText('1 visible record')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Where follow-up stands' })).toBeVisible();
  await expect(page.getByText('Attention signals').locator('..')).toContainText('36');
  await expect(page.getByRole('heading', { name: 'Latest public activity' })).toBeVisible();
});

test('map failure stays useful and retryable', async ({ page }) => {
  await mockMap(page, true);
  await mockV2(page);
  await page.goto('/explore');
  await expect(page.locator('.prod-map-surface')).toHaveAttribute('data-map-state', 'error');
  await expect(page.getByText('Detailed map unavailable')).toBeVisible();
  await expect(page.getByLabel('Visible record')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Retry map' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('public detail keeps integrity, truth, signals, and tombstones separate', async ({ page }) => {
  await mockMap(page);
  await mockV2(page);
  await page.goto(`/issues/${publicId}`);
  await expect(page.getByRole('heading', { name: detail.title })).toBeVisible();
  await expect(page.getByText('Public bytes match')).toBeVisible();
  await expect(page.getByText(/does not prove that every claim is true/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: '18 signals' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Public history' })).toBeVisible();
  await expect(page.locator('.prod-public-location .map-surface')).toHaveAttribute(
    'data-map-state',
    'ready',
  );
  await expectNoHorizontalOverflow(page);

  await page.goto(`/issues/${removedId}`);
  await expect(
    page.getByRole('heading', { name: 'This record is no longer publicly available' }),
  ).toBeVisible();
  await expect(page.getByText(/privacy and safety review/i)).toBeVisible();
  await expect(page.getByText(detail.narrative)).toHaveCount(0);
});

test('reporting completes private upload, review submission, and tracking', async ({ page }) => {
  test.setTimeout(120_000);
  await mockMap(page);
  const fixture = await mockV2(page);
  await page.goto('/report');
  await expect(page.getByRole('heading', { name: 'Choose a safe photo' })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles('public/demo/storm-drain.jpg');
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByLabel('Title').fill('Loose drain cover beside a public walkway');
  await page
    .getByLabel('Description')
    .fill(
      'The concrete drain cover is displaced beside a public walkway and leaves an exposed edge.',
    );
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page.getByRole('heading', { name: 'Place the issue on the map' })).toBeVisible();
  await expect(page.locator('.prod-location-map-surface')).toHaveAttribute(
    'data-map-state',
    'ready',
  );
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page.getByRole('heading', { name: 'Review and send' })).toBeVisible();
  const acknowledgements = page.locator('.prod-acknowledgements input');
  for (let index = 0; index < (await acknowledgements.count()); index += 1) {
    await acknowledgements.nth(index).check();
  }
  await page.getByRole('button', { name: /Submit for review/ }).click();
  await expect(page).toHaveURL(/\/submissions\/track-demo-2026$/);
  await expect(page.getByRole('heading', { name: 'Received' })).toBeVisible();
  await expect(page.getByText('This page is private')).toBeVisible();
  const payload = fixture.submittedBody();
  expect(payload).toMatchObject({ schemaVersion: 'submission-v2' });
  expect(JSON.stringify(payload)).not.toMatch(/hash|signature|program/i);
  await expectNoHorizontalOverflow(page);
});

test('operator routes fail closed and private review runs without manual hashes', async ({
  page,
}) => {
  await page.goto('/operator');
  await expect(page.getByRole('heading', { name: 'Operator service unavailable' })).toBeVisible();
  await page.goto('/steward');
  await expect(page).toHaveURL(/\/operator$/);

  let mediaState = 'quarantined';
  let mediaVersion = 1;
  let derivative: Record<string, unknown> | null = null;
  let state = 'under_review';
  let version = 2;
  const record = () => ({
    submissionId,
    recordKind: 'community_report',
    state,
    version,
    assignedTo: 'operator-e2e',
    receivedAt: now,
    updatedAt: now,
    revision: {
      number: 1,
      title: detail.title,
      narrative: detail.narrative,
      category: 'water',
      observedOn: '2026-07-30',
      privateLocation: {
        latitudeE3: 27692,
        longitudeE3: 85336,
        wardId: 'kathmandu-10',
        geometryVersion: 'ktm-pilot-2026-01',
        localityLabel: 'beside the ward office',
      },
      media: {
        id: mediaId,
        url: `/api/media/med_${mediaId}`,
        state: mediaState,
        version: mediaVersion,
        mimeType: 'image/jpeg',
        byteLength: 483120,
        width: 1600,
        height: 1067,
        evidenceHash: 'a'.repeat(64),
        derivative,
      },
    },
    moderationEvents: [],
  });
  await page.route('**/api/media/**', (route) =>
    route.fulfill({ path: 'public/demo/storm-drain.jpg', contentType: 'image/jpeg' }),
  );
  await page.route('**/api/operator/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET') return fulfill(route, record());
    const body = request.postDataJSON() as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toMatch(/expectedHash|timelineHead|programId|signature/i);
    if (url.pathname.endsWith('/review')) {
      mediaState = 'approved_private';
      mediaVersion = 2;
      return fulfill(route, { mediaId, state: mediaState, version: mediaVersion });
    }
    if (url.pathname.endsWith('/derivatives')) {
      derivative = {
        id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
        state: 'redacted_derivative',
        version: 1,
        mimeType: 'image/jpeg',
        byteLength: 290000,
        width: 1600,
        height: 1067,
        evidenceHash: 'b'.repeat(64),
      };
      return fulfill(route, { ...derivative, sourceMediaId: mediaId });
    }
    if (url.pathname.endsWith('/binding-receipts')) {
      return fulfill(route, { receipt: 'r'.repeat(120), expiresAt: '2026-08-01T09:00:00.000Z' });
    }
    if (url.pathname.endsWith(`/moderation/${submissionId}`)) {
      state = 'approved';
      version = 3;
      return fulfill(route, { issue: { publicId } });
    }
    return route.abort('failed');
  });
  await page.goto(`/operator/review/${submissionId}?organization=${organizationId}`);
  await expect(page.getByRole('heading', { name: 'Private source media' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve media' }).click();
  await page.getByRole('button', { name: 'Create public derivative' }).click();
  await page.getByRole('button', { name: 'Bind reviewed media' }).click();
  await page.getByRole('button', { name: /Approve public version/ }).click();
  await expect(page.getByText(/Approved and awaiting chain publication/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('operator record actions hide concurrency data and refresh after a status change', async ({
  page,
}) => {
  let lifecycle = 'open';
  let domainVersion = 3;
  const operatorIssue = () => ({
    publicId,
    roles: ['steward', 'moderator', 'privacy_reviewer', 'org_admin'],
    publicationState: 'published',
    lifecycle,
    domainVersion,
    checkpointUpdateCount: 2,
    confirmedUpdateCount: 2,
    projectedTimelineHead: 'a'.repeat(64),
    projectedHandoffHead: 'b'.repeat(64),
    blockedFromSequence: null,
    createdAt: now,
    updatedAt: now,
    version: {
      id: 'version-1',
      number: 1,
      title: detail.title,
      narrative: detail.narrative,
      category: 'water',
      wardId: 'kathmandu-10',
      wardLabel: 'Kathmandu Ward 10',
      localityLabel: 'beside the ward office',
      publicReason: 'Reviewed report',
      publishedAt: now,
    },
    handoff: { state: null, version: null, publicSequence: 0, updatedAt: null },
    lifecycleEvents: [],
    handoffEvents: [],
  });
  await page.route('**/api/operator/issues/**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') return fulfill(route, operatorIssue());
    const body = request.postDataJSON() as Record<string, unknown>;
    expect(body).toMatchObject({
      expectedDomainVersion: 3,
      expectedTimelineHead: 'a'.repeat(64),
      toState: 'in_progress',
    });
    lifecycle = 'in_progress';
    domainVersion = 4;
    return fulfill(route, { publicId, lifecycle, domainVersion });
  });
  await page.goto(`/operator/issues/${publicId}?organization=${organizationId}`);
  await expect(page.getByRole('heading', { name: 'Published record' })).toBeVisible();
  await expect(page.getByText('a'.repeat(64))).toHaveCount(0);
  await page.getByLabel('Public note').first().fill('Ward follow-up has started.');
  await page.getByRole('button', { name: /Record status/ }).click();
  await expect(page.getByText(/Change recorded/)).toBeVisible();
  await expect(page.getByText('in progress', { exact: true }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

const accessibilityRoutes = [
  ['home', '/'],
  ['about', '/about'],
  ['explore', '/explore'],
  ['insights', '/dashboard'],
  ['report', '/report'],
  ['issue detail', `/issues/${publicId}`],
] as const;

for (const [name, path] of accessibilityRoutes) {
  test(`${name} meets accessibility, motion, and language boundaries`, async ({ page }) => {
    test.setTimeout(90_000);
    await mockMap(page);
    await mockV2(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const serious = result.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );
    expect(
      serious,
      `${path}: ${serious.map((violation) => `${violation.id}:${violation.nodes.length}`).join(', ')}`,
    ).toEqual([]);
    expect(await page.locator('body').innerText()).not.toMatch(
      /\b(judge|judges|hackathon|bounty|showcase)\b/i,
    );
    await expectNoHorizontalOverflow(page);
    const animationDurations = await page
      .locator('.prod-inline-spinner')
      .evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).animationDuration),
      );
    for (const duration of animationDurations) {
      expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.01);
    }
  });
}

test('health and security headers expose no dependency details', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({
    ok: true,
    status: 'live',
    release: { environment: 'development', commitSha: null },
  });
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['x-frame-options']).toBe('DENY');
  expect(response.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(response.headers()['strict-transport-security']).toBe(
    'max-age=31536000; includeSubDomains',
  );
  expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(response.headers()['content-security-policy']).toContain("object-src 'none'");
});

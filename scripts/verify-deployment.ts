type JsonObject = Record<string, unknown>;

const DEFAULT_URL = 'https://nagarik-signal.vercel.app';
const publicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function fail(message: string): never {
  throw new Error(message);
}

function option(name: string, fallback = '') {
  const index = process.argv.indexOf(name);
  return (index >= 0 ? process.argv[index + 1] : undefined) ?? fallback;
}

function requestHeaders() {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (!secret) return undefined;
  if (secret.length > 1_024 || /[\u0000-\u001f\u007f]/.test(secret)) {
    fail('deployment_protection_bypass_secret_invalid');
  }
  return { 'x-vercel-protection-bypass': secret };
}

function normalizedUrl(value: string) {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    fail(`deployment_url_must_use_https:${url.protocol}`);
  }
  return url.origin;
}

function nonNegativeInteger(value: string, fallback: number, maximum: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? Math.min(parsed, maximum) : fallback;
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label}_must_be_an_object`);
  }
  return value as JsonObject;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(`${label}_must_be_an_array`);
  return value;
}

function text(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label}_must_be_text`);
  return value;
}

function matchesCommit(actual: unknown, expected: string | null) {
  if (typeof actual !== 'string' || !/^[0-9a-f]{7,40}$/i.test(actual)) return false;
  if (!expected) return true;
  const left = actual.toLowerCase();
  const right = expected.toLowerCase();
  return left === right || left.startsWith(right) || right.startsWith(left);
}

function assertSecurityHeaders(response: Response, label: string) {
  const required: Record<string, RegExp> = {
    'content-security-policy': /frame-ancestors 'none'.*object-src 'none'/,
    'strict-transport-security': /^max-age=\d+/,
    'x-content-type-options': /^nosniff$/,
    'x-frame-options': /^DENY$/,
    'referrer-policy': /^strict-origin-when-cross-origin$/,
  };
  for (const [name, pattern] of Object.entries(required)) {
    const value = response.headers.get(name) ?? '';
    if (!pattern.test(value)) fail(`${label}_security_header_invalid:${name}`);
  }
}

function assertNoPrivateMaterial(value: unknown, label: string) {
  const serialized = JSON.stringify(value);
  if (
    /SUPABASE_SERVICE_ROLE|BLOB_READ_WRITE_TOKEN|NAGARIK_[A-Z_]*SECRET|private\/nagarik\//i.test(
      serialized,
    )
  ) {
    fail(`${label}_contains_private_material`);
  }
}

async function fetchResponse(url: string, label: string) {
  try {
    return await fetch(url, {
      cache: 'no-store',
      headers: requestHeaders(),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'request_failed';
    fail(`${label}_request_failed:${message}`);
  }
}

async function readJson(response: Response, label: string) {
  const body = await response.text();
  try {
    return object(JSON.parse(body), label);
  } catch (error) {
    if (error instanceof SyntaxError) fail(`${label}_invalid_json_http_${response.status}`);
    throw error;
  }
}

async function fetchJson(url: string, label: string, expectedStatus = 200) {
  const response = await fetchResponse(url, label);
  const payload = await readJson(response, label);
  if (response.status !== expectedStatus || payload.ok === false) {
    fail(`${label}_failed_http_${response.status}:${JSON.stringify(payload)}`);
  }
  assertSecurityHeaders(response, label);
  assertNoPrivateMaterial(payload, label);
  return { response, payload };
}

async function fetchPage(url: string, label: string, requiredText: string) {
  const response = await fetchResponse(url, label);
  const body = await response.text();
  if (!response.ok) fail(`${label}_failed_http_${response.status}`);
  if (body.length < 500) fail(`${label}_page_too_short`);
  if (!body.includes(requiredText)) fail(`${label}_missing_text:${requiredText}`);
  assertSecurityHeaders(response, label);
  return body.length;
}

function releaseFrom(payload: JsonObject, label: string) {
  const release = object(payload.release, `${label}_release`);
  return {
    environment:
      release.environment === null ? null : text(release.environment, `${label}_environment`),
    commitSha: release.commitSha,
  };
}

function assertMinimalHealth(payload: JsonObject) {
  const allowed = new Set(['ok', 'status', 'release']);
  const unexpected = Object.keys(payload).filter((key) => !allowed.has(key));
  if (unexpected.length) fail(`health_discloses_unexpected_fields:${unexpected.join(',')}`);
  if (payload.ok !== true || payload.status !== 'live') fail('health_contract_invalid');
}

async function waitForRelease(baseUrl: string, expectedSha: string | null, waitSeconds: number) {
  const deadline = Date.now() + waitSeconds * 1_000;
  let lastSeen = 'unavailable';
  while (true) {
    try {
      const result = await fetchJson(`${baseUrl}/api/health`, 'health');
      assertMinimalHealth(result.payload);
      const release = releaseFrom(result.payload, 'health');
      lastSeen = typeof release.commitSha === 'string' ? release.commitSha : 'missing';
      if (matchesCommit(release.commitSha, expectedSha)) return result.payload;
    } catch (error) {
      lastSeen = error instanceof Error ? error.message : 'health_request_failed';
    }
    if (Date.now() >= deadline) {
      fail(`expected_release_not_ready:expected=${expectedSha ?? 'any'}:last_seen=${lastSeen}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}

function assertStats(payload: JsonObject) {
  const data = object(payload.data, 'stats_data');
  for (const key of ['total', 'open', 'inProgress', 'resolved', 'closed', 'signals']) {
    const value = Number(data[key]);
    if (!Number.isInteger(value) || value < 0) fail(`stats_invalid:${key}`);
  }
  array(data.categories, 'stats_categories');
  array(data.wards, 'stats_wards');
  return data;
}

function assertProof(payload: JsonObject, publicId: string) {
  const data = object(payload.data, 'proof_data');
  if (data.publicId !== publicId || data.protocolVersion !== 'v2') {
    fail('proof_identity_or_protocol_invalid');
  }
  text(data.schemaVersion, 'proof_schema_version');
  const checks = object(data.checks, 'proof_checks');
  for (const key of ['metadata', 'evidence', 'location']) {
    const check = object(checks[key], `proof_${key}`);
    if (check.status !== 'match') fail(`proof_${key}_not_match:${String(check.status)}`);
  }
  const chain = object(checks.chain, 'proof_chain');
  if (/pending|mismatch|unavailable|failed/i.test(String(chain.status))) {
    fail(`proof_chain_not_final:${String(chain.status)}`);
  }
  const boundary = object(data.boundary, 'proof_boundary');
  text(boundary.truth, 'proof_truth_boundary');
  return data;
}

async function verifyMedia(baseUrl: string, mediaUrl: unknown) {
  if (mediaUrl === null || mediaUrl === undefined) return { checked: false };
  const path = text(mediaUrl, 'detail_media_url');
  const url = new URL(path, baseUrl);
  if (url.origin !== baseUrl) fail('public_media_must_be_same_origin');
  const response = await fetchResponse(url.href, 'public_media');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!response.ok || bytes.byteLength === 0) fail(`public_media_failed_http_${response.status}`);
  if (!(response.headers.get('content-type') ?? '').startsWith('image/')) {
    fail('public_media_content_type_invalid');
  }
  if (response.headers.get('x-content-type-options') !== 'nosniff') {
    fail('public_media_nosniff_missing');
  }
  return { checked: true, bytes: bytes.byteLength };
}

async function verifyTombstone(baseUrl: string, tombstoneId: string | null) {
  if (!tombstoneId) return { status: 'not_configured' };
  if (!publicIdPattern.test(tombstoneId)) fail('tombstone_public_id_invalid');
  const { payload } = await fetchJson(`${baseUrl}/api/v2/issues/${tombstoneId}`, 'tombstone');
  const data = object(payload.data, 'tombstone_data');
  const allowed = new Set([
    'publicId',
    'publicationState',
    'tombstone',
    'proofAvailable',
    'updatedAt',
  ]);
  const unexpected = Object.keys(data).filter((key) => !allowed.has(key));
  if (data.publicId !== tombstoneId || data.publicationState !== 'removed' || unexpected.length) {
    fail(`tombstone_contract_invalid:${unexpected.join(',')}`);
  }
  object(data.tombstone, 'tombstone_body');
  return { status: 'pass', publicId: tombstoneId };
}

async function main() {
  const baseUrl = normalizedUrl(option('--url', process.env.NAGARIK_DEPLOYMENT_URL ?? DEFAULT_URL));
  const expectedSha =
    option('--expected-sha', process.env.NAGARIK_EXPECTED_GIT_SHA ?? '').trim() || null;
  const waitSeconds = nonNegativeInteger(
    option('--wait-seconds', process.env.NAGARIK_DEPLOYMENT_WAIT_SECONDS ?? '0'),
    0,
    900,
  );
  const configuredPublicId =
    option('--public-id', process.env.NAGARIK_SMOKE_PUBLIC_ID ?? '').trim() || null;
  const tombstoneId =
    option('--tombstone-id', process.env.NAGARIK_SMOKE_TOMBSTONE_ID ?? '').trim() || null;

  const health = await waitForRelease(baseUrl, expectedSha, waitSeconds);
  const { payload: ready } = await fetchJson(`${baseUrl}/api/health/ready`, 'readiness');
  if (ready.status !== 'ready') fail(`deployment_not_ready:${String(ready.status)}`);
  const healthRelease = releaseFrom(health, 'health');
  const readyRelease = releaseFrom(ready, 'readiness');
  if (healthRelease.commitSha !== readyRelease.commitSha) fail('health_readiness_release_mismatch');

  const [{ payload: statsPayload }, { payload: listPayload }, pageBytes] = await Promise.all([
    fetchJson(`${baseUrl}/api/v2/issues/stats`, 'public_stats'),
    fetchJson(`${baseUrl}/api/v2/issues?limit=10`, 'public_issues'),
    Promise.all([
      fetchPage(`${baseUrl}/`, 'home', 'Nagarik Signal'),
      fetchPage(`${baseUrl}/about`, 'about', 'Nagarik Signal'),
      fetchPage(`${baseUrl}/explore`, 'explore', 'Nagarik Signal'),
      fetchPage(`${baseUrl}/dashboard`, 'insights', 'Nagarik Signal'),
      fetchPage(`${baseUrl}/report`, 'report', 'Nagarik Signal'),
    ]),
  ]);
  const stats = assertStats(statsPayload);
  const list = object(listPayload.data, 'public_issues_data');
  const items = array(list.items, 'public_issue_items').map((item, index) =>
    object(item, `public_issue_${index}`),
  );
  const firstPublicId = items[0]?.publicId;
  const publicId = configuredPublicId ?? (typeof firstPublicId === 'string' ? firstPublicId : null);
  if (!publicId || !publicIdPattern.test(publicId)) fail('public_issue_fixture_missing');

  const [{ payload: detailPayload }, { payload: proofPayload }, issuePageBytes, tombstone] =
    await Promise.all([
      fetchJson(`${baseUrl}/api/v2/issues/${publicId}`, 'public_issue_detail'),
      fetchJson(`${baseUrl}/api/v2/issues/${publicId}/proof`, 'public_issue_proof'),
      fetchPage(`${baseUrl}/issues/${publicId}`, 'issue_page', 'Nagarik Signal'),
      verifyTombstone(baseUrl, tombstoneId),
    ]);
  const detail = object(detailPayload.data, 'public_issue_detail_data');
  if (detail.publicId !== publicId || detail.publicationState === 'removed') {
    fail('public_issue_detail_contract_invalid');
  }
  const proof = assertProof(proofPayload, publicId);
  const media = await verifyMedia(baseUrl, detail.mediaUrl);

  console.log(
    JSON.stringify(
      {
        ok: true,
        action: 'verify_deployment',
        baseUrl,
        release: healthRelease,
        readiness: 'ready',
        publicData: {
          total: stats.total,
          checkedPublicId: publicId,
          protocolVersion: proof.protocolVersion,
          media,
          tombstone,
        },
        pages: {
          checked: pageBytes.length + 1,
          bytes: pageBytes.reduce((sum, value) => sum + value, issuePageBytes),
        },
        mutationRequests: 0,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

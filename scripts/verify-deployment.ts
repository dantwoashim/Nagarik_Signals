type JsonObject = Record<string, unknown>;

const DEFAULT_URL = 'https://nagarik-signal.vercel.app';
const DEFAULT_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

function fail(message: string): never {
  throw new Error(message);
}

function option(name: string, fallback = '') {
  const index = process.argv.indexOf(name);
  return (index >= 0 ? process.argv[index + 1] : undefined) ?? fallback;
}

function normalizedUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') fail(`unsupported_deployment_protocol:${url.protocol}`);
  return url.origin;
}

function positiveInteger(value: string, fallback: number, maximum: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, maximum) : fallback;
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}_must_be_an_object`);
  return value as JsonObject;
}

async function responseJson(response: Response, label: string) {
  const text = await response.text();
  try {
    return object(JSON.parse(text), label);
  } catch (error) {
    if (error instanceof SyntaxError) fail(`${label}_invalid_json_http_${response.status}`);
    throw error;
  }
}

async function fetchJson(url: string, label: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await responseJson(response, label);
  if (!response.ok || payload.ok === false) {
    fail(`${label}_failed_http_${response.status}:${JSON.stringify(payload)}`);
  }
  return { response, payload };
}

async function fetchPage(url: string, label: string, expectedText: string[]) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
  const body = await response.text();
  if (!response.ok) fail(`${label}_failed_http_${response.status}`);
  if (body.length < 500) fail(`${label}_page_too_short`);
  for (const text of expectedText) {
    if (!body.includes(text)) fail(`${label}_missing_text:${text}`);
  }
  return body.length;
}

function matchesCommit(actual: unknown, expected: string | null) {
  if (typeof actual !== 'string') return false;
  const left = actual.toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(left)) return false;
  if (!expected) return true;
  const right = expected.toLowerCase();
  return left === right || left.startsWith(right) || right.startsWith(left);
}

async function waitForExpectedRelease(baseUrl: string, expectedSha: string | null, waitSeconds: number) {
  const deadline = Date.now() + waitSeconds * 1_000;
  let lastSeen = 'unavailable';

  while (true) {
    try {
      const { payload } = await fetchJson(`${baseUrl}/api/health`, 'health');
      const release = object(payload.release, 'health_release');
      lastSeen = typeof release.commitSha === 'string' ? release.commitSha : 'missing';
      if (matchesCommit(release.commitSha, expectedSha)) return payload;
    } catch (error) {
      lastSeen = error instanceof Error ? error.message : 'health_request_failed';
    }

    if (Date.now() >= deadline) {
      fail(`expected_release_not_ready:expected=${expectedSha ?? 'any'}:last_seen=${lastSeen}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}

function issueCountFromHealth(payload: JsonObject, label: string) {
  const db = object(payload.db, `${label}_db`);
  const issueCount = Number(db.issueCount);
  if (!Number.isInteger(issueCount) || issueCount < 0) fail(`${label}_invalid_issue_count:${String(db.issueCount)}`);
  return issueCount;
}

async function assertMutationBoundary(baseUrl: string, issueCountBefore: number) {
  const untrusted = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: { Origin: 'https://example.com' },
    signal: AbortSignal.timeout(30_000),
  });
  const untrustedPayload = await responseJson(untrusted, 'untrusted_upload');
  if (untrusted.status !== 403 || untrustedPayload.error !== 'untrusted_origin') {
    fail(`untrusted_origin_boundary_failed:${untrusted.status}:${JSON.stringify(untrustedPayload)}`);
  }

  const boundary = 'nagarik-deployment-readiness';
  const trusted = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: {
      Origin: baseUrl,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: `--${boundary}--\r\n`,
    signal: AbortSignal.timeout(30_000),
  });
  const trustedPayload = await responseJson(trusted, 'trusted_upload_probe');
  const cookie = trusted.headers.get('set-cookie') ?? '';
  if (trusted.status !== 400 || trustedPayload.error !== 'file_required') {
    fail(`trusted_write_probe_failed:${trusted.status}:${JSON.stringify(trustedPayload)}`);
  }
  if (!cookie.includes('__Host-nagarik-session=')) fail('secure_session_cookie_missing');
  if (!/;\s*Path=\//i.test(cookie)) fail('secure_session_cookie_path_missing');
  if (!/;\s*HttpOnly/i.test(cookie)) fail('secure_session_cookie_http_only_missing');
  if (!/;\s*Secure/i.test(cookie)) fail('secure_session_cookie_secure_missing');
  if (!/;\s*SameSite=Lax/i.test(cookie)) fail('secure_session_cookie_same_site_missing');
  if (/;\s*Domain=/i.test(cookie)) fail('secure_session_cookie_must_not_set_domain');

  const { payload: healthAfter } = await fetchJson(`${baseUrl}/api/health`, 'health_after_mutation_probe');
  const issueCountAfter = issueCountFromHealth(healthAfter, 'health_after_mutation_probe');
  if (issueCountAfter !== issueCountBefore) {
    fail(`mutation_probe_changed_issue_count:before=${issueCountBefore}:after=${issueCountAfter}`);
  }

  return {
    untrustedOriginRejected: true,
    trustedOriginAccepted: true,
    secureSessionMinted: true,
    publicRecordCreated: false,
    issueCountBefore,
    issueCountAfter,
  };
}

async function main() {
  const baseUrl = normalizedUrl(option('--url', process.env.NAGARIK_DEPLOYMENT_URL ?? DEFAULT_URL));
  const expectedSha = option('--expected-sha', process.env.NAGARIK_EXPECTED_GIT_SHA ?? '').trim() || null;
  const waitSeconds = positiveInteger(
    option('--wait-seconds', process.env.NAGARIK_DEPLOYMENT_WAIT_SECONDS ?? '0'),
    0,
    900,
  );
  const styleUrl = option('--style-url', process.env.NAGARIK_MAP_STYLE_URL ?? DEFAULT_STYLE_URL);
  const health = await waitForExpectedRelease(baseUrl, expectedSha, waitSeconds);
  const readiness = object(health.readiness, 'health_readiness');
  const capabilities = object(readiness.capabilities, 'health_capabilities');
  const checks = object(readiness.checks, 'health_checks');
  if (readiness.operational !== true) fail(`deployment_not_operational:${JSON.stringify(readiness)}`);
  for (const capability of ['publicRead', 'reporting', 'stewardship', 'maintenance']) {
    if (capabilities[capability] !== true) fail(`capability_unavailable:${capability}`);
  }
  if (checks.durableWrites !== true || checks.mediaStorage !== true || checks.sessionSecurity !== true) {
    fail(`write_prerequisites_unavailable:${JSON.stringify(checks)}`);
  }

  const db = object(health.db, 'health_db');
  const issueCountBefore = issueCountFromHealth(health, 'health');
  const latest = object(db.latestIndexedIssue, 'latest_indexed_issue');
  const issueId = Number(latest.issueId);
  if (!Number.isInteger(issueId) || issueId <= 0) fail(`invalid_latest_issue_id:${String(latest.issueId)}`);

  const [{ payload: dashboard }, { payload: proof }, { payload: handoff }, styleResponse, pageResults, mutation] = await Promise.all([
    fetchJson(`${baseUrl}/api/dashboard`, 'dashboard'),
    fetchJson(`${baseUrl}/api/verify-proof/${issueId}`, 'proof'),
    fetchJson(`${baseUrl}/api/reports/${issueId}/handoff`, 'handoff'),
    fetch(styleUrl, { cache: 'no-store', signal: AbortSignal.timeout(30_000) }),
    Promise.all([
      fetchPage(`${baseUrl}/`, 'home', ['Public proof for public problems.']),
      fetchPage(`${baseUrl}/explore?view=map`, 'map', ['Public follow-up, mapped.', 'Live civic atlas']),
      fetchPage(`${baseUrl}/report`, 'report', ['Put a public problem on the record']),
      fetchPage(`${baseUrl}/issues/${issueId}`, 'issue', ['Verify this record', 'Authority handoff']),
    ]),
    assertMutationBoundary(baseUrl, issueCountBefore),
  ]);

  const stats = object(dashboard.stats, 'dashboard_stats');
  const handoffOverview = object(dashboard.handoffs, 'dashboard_handoffs');
  if (handoffOverview.integrity !== true) fail('dashboard_handoff_integrity_not_verified');
  const handoffStats = object(handoffOverview.stats, 'dashboard_handoff_stats');
  for (const field of ['routedIssues', 'preparedOnly', 'submittedIssues', 'acknowledgedIssues', 'overdueFollowUps', 'closedHandoffs', 'totalEvents']) {
    const value = Number(handoffStats[field]);
    if (!Number.isInteger(value) || value < 0) fail(`invalid_handoff_stat:${field}:${String(handoffStats[field])}`);
  }
  if (handoff.mode !== 'platform_audit_log_not_onchain' || handoff.integrity !== true || Number(handoff.issueId) !== issueId || !Array.isArray(handoff.handoffs)) {
    fail(`handoff_api_contract_invalid:${JSON.stringify(handoff)}`);
  }
  const authorityHandoffCount = Number(db.authorityHandoffCount);
  if (!Number.isInteger(authorityHandoffCount) || authorityHandoffCount < 0) {
    fail(`health_invalid_authority_handoff_count:${String(db.authorityHandoffCount)}`);
  }
  if (Number(stats.totalIssues) < 4) fail(`public_issue_count_below_baseline:${String(stats.totalIssues)}`);
  if (
    proof.matches !== true
    || proof.evidenceStatus !== 'match'
    || proof.evidenceAvailable !== true
    || proof.evidenceMatches !== true
    || proof.storedEvidenceMatchesOnChain !== true
  ) {
    fail(`proof_not_fully_green:${JSON.stringify(proof)}`);
  }
  if (!styleResponse.ok) fail(`map_style_failed_http_${styleResponse.status}`);
  const style = object(await styleResponse.json(), 'map_style');
  if (style.version !== 8 || !Array.isArray(style.layers) || style.layers.length < 50) {
    fail('map_style_missing_expected_vector_detail');
  }

  const release = object(health.release, 'health_release');
  console.log(JSON.stringify({
    ok: true,
    action: 'verify_deployment',
    baseUrl,
    release: {
      commitSha: release.commitSha,
      commitRef: release.commitRef,
      environment: release.environment,
    },
    capabilities,
    publicIssueCount: stats.totalIssues,
    handoffs: {
      authorityHandoffCount,
      ...handoffStats,
      latestIssueEvents: handoff.handoffs.length,
    },
    proof: {
      issueId,
      evidenceStatus: proof.evidenceStatus,
      evidenceByteLength: proof.evidenceByteLength,
      matches: proof.matches,
    },
    map: {
      providerReady: true,
      styleLayers: style.layers.length,
    },
    pages: {
      checked: pageResults.length,
      bytes: pageResults.reduce((sum, value) => sum + value, 0),
    },
    mutation,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

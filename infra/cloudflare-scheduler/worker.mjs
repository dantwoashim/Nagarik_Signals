import { handleSignerRequest } from './signer.mjs';

const MAX_EDGE_REQUEST_BYTES = 16_384;
const MAX_RPC_RESPONSE_BYTES = 2_000_000;
const RPC_UPSTREAM = 'https://api.devnet.solana.com';
const allowedRpcMethods = new Set(['getAccountInfo', 'getGenesisHash', 'getTransaction']);
const allowedAlertKinds = new Set([
  'outbox_dead_letter',
  'readiness_failed',
  'reconciliation_conflict',
  'retention_failure',
  'worker_failed',
]);

const routesByCron = Object.freeze({
  '* * * * *': '/api/internal/outbox/process',
  '*/5 * * * *': '/api/internal/health',
  '*/10 * * * *': '/api/internal/reconcile',
  '17 2 * * *': '/api/internal/retention',
});

function productionOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('scheduler_origin_invalid');
  }
  return url.origin;
}

function cronSecret(value) {
  const length = typeof value === 'string' ? new TextEncoder().encode(value).byteLength : 0;
  if (
    typeof value !== 'string' ||
    length < 32 ||
    length > 1_024 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error('scheduler_secret_invalid');
  }
  return value;
}

function edgeResponse(status, code) {
  return new Response(JSON.stringify({ ok: status >= 200 && status < 300, code }), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  });
}

function secureTextEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.byteLength !== rightBytes.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.byteLength; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

function validSecret(value) {
  const length = typeof value === 'string' ? new TextEncoder().encode(value).byteLength : 0;
  return (
    typeof value === 'string' &&
    length >= 32 &&
    length <= 1_024 &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

async function boundedJson(request) {
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_EDGE_REQUEST_BYTES) {
    throw new Error('request_too_large');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_EDGE_REQUEST_BYTES) {
    throw new Error('request_too_large');
  }
  return JSON.parse(text);
}

function validAlert(body, request) {
  const keys = Object.keys(body ?? {}).sort().join(',');
  const metrics = body?.metrics;
  return (
    keys ===
      'alertId,kind,metrics,occurredAt,releaseId,requestId,schemaVersion,severity,traceId' &&
    body.schemaVersion === 'nagarik-operational-alert-v1' &&
    /^alt_[0-9a-f]{32}$/.test(body.alertId) &&
    request.headers.get('x-nagarik-alert-id') === body.alertId &&
    allowedAlertKinds.has(body.kind) &&
    (body.severity === 'critical' || body.severity === 'warning') &&
    typeof body.occurredAt === 'string' &&
    Number.isFinite(Date.parse(body.occurredAt)) &&
    /^req_[0-9a-f-]{36}$/.test(body.requestId) &&
    /^trc_[0-9a-f]{32}$/.test(body.traceId) &&
    /^[0-9a-f]{40}$/.test(body.releaseId) &&
    metrics !== null &&
    typeof metrics === 'object' &&
    !Array.isArray(metrics) &&
    Object.values(metrics).every((value) => Number.isFinite(value) && value >= 0)
  );
}

export async function handleAlertRequest(request, env) {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== '/alerts' || url.search || url.hash) {
    return edgeResponse(404, 'not_found');
  }
  const secret = env.NAGARIK_ALERT_WEBHOOK_TOKEN;
  if (!validSecret(secret) || !secureTextEqual(request.headers.get('authorization'), `Bearer ${secret}`)) {
    return edgeResponse(401, 'unauthorized');
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return edgeResponse(415, 'unsupported_media_type');
  }
  try {
    const body = await boundedJson(request);
    if (!validAlert(body, request)) return edgeResponse(400, 'request_invalid');
    console.log(
      JSON.stringify({
        event: 'nagarik_operational_alert',
        alertId: body.alertId,
        kind: body.kind,
        severity: body.severity,
        occurredAt: body.occurredAt,
        releaseId: body.releaseId,
        metrics: body.metrics,
      }),
    );
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return edgeResponse(error?.message === 'request_too_large' ? 413 : 400, 'request_invalid');
  }
}

export async function handleRpcRequest(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  const token = env.NAGARIK_RPC_PROXY_TOKEN;
  if (
    request.method !== 'POST' ||
    url.pathname !== '/rpc' ||
    url.hash ||
    [...url.searchParams.keys()].join(',') !== 'token'
  ) {
    return edgeResponse(404, 'not_found');
  }
  if (!validSecret(token) || !secureTextEqual(url.searchParams.get('token'), token)) {
    return edgeResponse(401, 'unauthorized');
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return edgeResponse(415, 'unsupported_media_type');
  }

  try {
    const body = await boundedJson(request);
    if (
      !body ||
      body.jsonrpc !== '2.0' ||
      (typeof body.id !== 'number' && typeof body.id !== 'string') ||
      !allowedRpcMethods.has(body.method) ||
      !Array.isArray(body.params)
    ) {
      return edgeResponse(400, 'rpc_request_invalid');
    }
    const upstream = await fetcher(RPC_UPSTREAM, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'nagarik-rpc-fallback/1.0' },
      body: JSON.stringify(body),
      redirect: 'manual',
      cache: 'no-store',
    });
    if (!upstream.ok) return edgeResponse(502, 'rpc_upstream_failed');
    const text = await upstream.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RPC_RESPONSE_BYTES) {
      return edgeResponse(502, 'rpc_upstream_invalid');
    }
    const envelope = JSON.parse(text);
    if (envelope?.jsonrpc !== '2.0' || envelope.id !== body.id) {
      return edgeResponse(502, 'rpc_upstream_invalid');
    }
    return new Response(JSON.stringify(envelope), {
      status: 200,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return edgeResponse(error?.message === 'request_too_large' ? 413 : 502, 'rpc_upstream_failed');
  }
}

export function scheduledRoute(cron) {
  return routesByCron[cron] ?? null;
}

export async function invokeSchedule(cron, env, fetcher = fetch) {
  const path = scheduledRoute(cron);
  if (!path) throw new Error('scheduler_cron_unrecognized');
  const origin = productionOrigin(env.NAGARIK_BASE_URL);
  const secret = cronSecret(env.CRON_SECRET);
  const response = await fetcher(`${origin}${path}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${secret}`,
      'user-agent': 'nagarik-scheduler/1.0',
      'x-nagarik-scheduler': 'cloudflare-cron-v1',
    },
    redirect: 'manual',
    cache: 'no-store',
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`scheduler_http_${response.status}`);
  }
  return { path, status: response.status };
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/alerts') return handleAlertRequest(request, env);
    if (pathname === '/rpc') return handleRpcRequest(request, env);
    return handleSignerRequest(request, env);
  },
  async scheduled(controller, env, context) {
    context.waitUntil(invokeSchedule(controller.cron, env));
  },
};

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
  async scheduled(controller, env, context) {
    context.waitUntil(invokeSchedule(controller.cron, env));
  },
};

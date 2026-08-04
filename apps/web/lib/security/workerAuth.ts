import { timingSafeEqual } from 'node:crypto';

export type WorkerAudience =
  | 'nagarik-worker/health/v1'
  | 'nagarik-worker/outbox-process/v1'
  | 'nagarik-worker/reconcile/v1'
  | 'nagarik-worker/retention/v1';

function hasExpectedSchedulerIdentity(request: Request): boolean {
  const userAgent = request.headers.get('user-agent');
  if (userAgent === 'vercel-cron/1.0') return true;
  return (
    userAgent === 'nagarik-scheduler/1.0' &&
    request.headers.get('x-nagarik-scheduler') === 'cloudflare-cron-v1'
  );
}

function hasExpectedBearer(request: Request, expectedSecret: string): boolean {
  if (Buffer.byteLength(expectedSecret, 'utf8') < 32) return false;
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return false;
  const provided = Buffer.from(authorization.slice('Bearer '.length), 'utf8');
  const expected = Buffer.from(expectedSecret, 'utf8');
  return provided.byteLength === expected.byteLength && timingSafeEqual(provided, expected);
}

export function isAuthorizedWorkerRequest(
  request: Request,
  expectedSecret: string,
  expectedAudience: WorkerAudience,
): boolean {
  return (
    request.method === 'POST' &&
    request.headers.get('x-nagarik-worker-audience') === expectedAudience &&
    hasExpectedBearer(request, expectedSecret)
  );
}

export function isAuthorizedScheduledRequest(
  request: Request,
  expectedSecret: string,
  expectedPath: string,
): boolean {
  const url = new URL(request.url);
  return (
    request.method === 'GET' &&
    url.pathname === expectedPath &&
    url.search === '' &&
    hasExpectedSchedulerIdentity(request) &&
    hasExpectedBearer(request, expectedSecret)
  );
}

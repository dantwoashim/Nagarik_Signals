import assert from 'node:assert/strict';
import test from 'node:test';

import { isAuthorizedScheduledRequest, isAuthorizedWorkerRequest } from './workerAuth';

test('internal worker authorization binds the bearer to POST and an exact audience', () => {
  const secret = `worker-${'a'.repeat(40)}`;
  const audience = 'nagarik-worker/outbox-process/v1';
  assert.equal(
    isAuthorizedWorkerRequest(
      new Request('https://nagarik.invalid', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
      }),
      secret,
      audience,
    ),
    false,
  );
  assert.equal(
    isAuthorizedWorkerRequest(
      new Request('https://nagarik.invalid', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${secret}`,
          'x-nagarik-worker-audience': audience,
        },
      }),
      secret,
      audience,
    ),
    true,
  );
  assert.equal(
    isAuthorizedWorkerRequest(
      new Request('https://nagarik.invalid', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${secret}x`,
          'x-nagarik-worker-audience': audience,
        },
      }),
      secret,
      audience,
    ),
    false,
  );
});

test('scheduled worker authorization binds an approved scheduler identity to one GET path', () => {
  const secret = `cron-${'b'.repeat(40)}`;
  const path = '/api/internal/outbox/process';
  const scheduled = (
    url = `https://nagarik.invalid${path}`,
    userAgent = 'vercel-cron/1.0',
    scheduler?: string,
  ) =>
    new Request(url, {
      headers: {
        authorization: `Bearer ${secret}`,
        'user-agent': userAgent,
        ...(scheduler ? { 'x-nagarik-scheduler': scheduler } : {}),
      },
    });

  assert.equal(isAuthorizedScheduledRequest(scheduled(), secret, path), true);
  assert.equal(
    isAuthorizedScheduledRequest(
      scheduled(undefined, 'nagarik-scheduler/1.0', 'cloudflare-cron-v1'),
      secret,
      path,
    ),
    true,
  );
  assert.equal(
    isAuthorizedScheduledRequest(scheduled(`${scheduled().url}?limit=100`), secret, path),
    false,
  );
  assert.equal(isAuthorizedScheduledRequest(scheduled(undefined, 'browser'), secret, path), false);
  assert.equal(
    isAuthorizedScheduledRequest(scheduled(undefined, 'nagarik-scheduler/1.0'), secret, path),
    false,
  );
  assert.equal(isAuthorizedScheduledRequest(scheduled(), secret, '/api/internal/reconcile'), false);
});

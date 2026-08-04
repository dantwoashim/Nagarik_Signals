import assert from 'node:assert/strict';
import test from 'node:test';

import { invokeSchedule, scheduledRoute } from './worker.mjs';

const secret = `cron-${'x'.repeat(40)}`;

test('maps every approved cadence to one bounded internal route', () => {
  assert.equal(scheduledRoute('* * * * *'), '/api/internal/outbox/process');
  assert.equal(scheduledRoute('*/5 * * * *'), '/api/internal/health');
  assert.equal(scheduledRoute('*/10 * * * *'), '/api/internal/reconcile');
  assert.equal(scheduledRoute('17 2 * * *'), '/api/internal/retention');
  assert.equal(scheduledRoute('0 0 * * *'), null);
});

test('invokes only the exact HTTPS route with the scheduler bearer', async () => {
  let captured;
  const result = await invokeSchedule(
    '* * * * *',
    { NAGARIK_BASE_URL: 'https://nagarik.example', CRON_SECRET: secret },
    async (url, init) => {
      captured = { url, init };
      return new Response(null, { status: 200 });
    },
  );

  assert.deepEqual(result, { path: '/api/internal/outbox/process', status: 200 });
  assert.equal(captured.url, 'https://nagarik.example/api/internal/outbox/process');
  assert.equal(captured.init.method, 'GET');
  assert.equal(captured.init.redirect, 'manual');
  assert.equal(captured.init.headers.authorization, `Bearer ${secret}`);
  assert.equal(captured.init.headers['user-agent'], 'nagarik-scheduler/1.0');
  assert.equal(captured.init.headers['x-nagarik-scheduler'], 'cloudflare-cron-v1');
});

test('fails closed on an unknown cadence, unsafe origin, weak secret, or non-success response', async () => {
  const fetcher = async () => new Response(null, { status: 503 });
  await assert.rejects(
    invokeSchedule('0 0 * * *', {
      NAGARIK_BASE_URL: 'https://nagarik.example',
      CRON_SECRET: secret,
    }),
    /scheduler_cron_unrecognized/,
  );
  await assert.rejects(
    invokeSchedule(
      '* * * * *',
      { NAGARIK_BASE_URL: 'http://nagarik.example', CRON_SECRET: secret },
      fetcher,
    ),
    /scheduler_origin_invalid/,
  );
  await assert.rejects(
    invokeSchedule(
      '* * * * *',
      { NAGARIK_BASE_URL: 'https://nagarik.example', CRON_SECRET: 'weak' },
      fetcher,
    ),
    /scheduler_secret_invalid/,
  );
  await assert.rejects(
    invokeSchedule(
      '* * * * *',
      { NAGARIK_BASE_URL: 'https://nagarik.example', CRON_SECRET: secret },
      fetcher,
    ),
    /scheduler_http_503/,
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { sendConfiguredOperationalAlert } from './alertRuntime';

const context = {
  requestId: 'req_01234567-89ab-4def-8123-456789abcdef',
  traceId: 'trc_0123456789abcdef0123456789abcdef',
  startedAtMs: 0,
};

const environment = {
  NODE_ENV: 'production' as const,
  NEXT_PUBLIC_RELEASE_ID: 'a'.repeat(40),
  NAGARIK_ALERT_WEBHOOK_URL: 'https://alerts.example/nagarik',
  NAGARIK_ALERT_WEBHOOK_TOKEN: `alert-${'x'.repeat(40)}`,
};

test('configured alert runtime records successful delivery without payload detail', async () => {
  const records: string[] = [];
  const status = await sendConfiguredOperationalAlert(
    {
      context,
      environment,
      kind: 'worker_failed',
      severity: 'critical',
      metrics: { httpStatus: 503 },
    },
    {
      fetcher: async () => new Response(null, { status: 202 }),
      sink: (record) => records.push(record),
      now: () => new Date('2026-07-31T12:00:00.000Z'),
      clock: () => 10,
    },
  );

  assert.equal(status, 'delivered');
  assert.equal(records.length, 1);
  assert.equal(JSON.parse(records[0]).outcome, 'success');
  assert.equal(records[0].includes(environment.NAGARIK_ALERT_WEBHOOK_TOKEN), false);
  assert.equal(records[0].includes(environment.NAGARIK_ALERT_WEBHOOK_URL), false);
});

test('missing and failed alert destinations produce explicit delivery outcomes', async () => {
  const missing: string[] = [];
  assert.equal(
    await sendConfiguredOperationalAlert(
      {
        context,
        environment: { ...environment, NAGARIK_ALERT_WEBHOOK_TOKEN: undefined },
        kind: 'worker_failed',
        severity: 'critical',
        metrics: { httpStatus: 503 },
      },
      { sink: (record) => missing.push(record), clock: () => 10 },
    ),
    'not_configured',
  );
  assert.equal(JSON.parse(missing[0]).outcome, 'degraded');

  const failed: string[] = [];
  assert.equal(
    await sendConfiguredOperationalAlert(
      {
        context,
        environment,
        kind: 'worker_failed',
        severity: 'critical',
        metrics: { httpStatus: 503 },
      },
      {
        fetcher: async () => new Response(null, { status: 503 }),
        sink: (record) => failed.push(record),
        clock: () => 10,
      },
    ),
    'failed',
  );
  assert.equal(JSON.parse(failed[0]).outcome, 'failure');
});

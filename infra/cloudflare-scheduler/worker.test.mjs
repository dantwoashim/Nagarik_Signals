import assert from 'node:assert/strict';
import test from 'node:test';

import { handleAlertRequest, handleRpcRequest, invokeSchedule, scheduledRoute } from './worker.mjs';

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

test('accepts only authenticated, structurally valid operational alerts', async () => {
  const alertSecret = `alert-${'a'.repeat(40)}`;
  const body = {
    schemaVersion: 'nagarik-operational-alert-v1',
    alertId: `alt_${'a'.repeat(32)}`,
    kind: 'readiness_failed',
    severity: 'critical',
    occurredAt: '2026-08-05T12:00:00.000Z',
    requestId: 'req_12345678-1234-4123-8123-123456789abc',
    traceId: `trc_${'b'.repeat(32)}`,
    releaseId: 'c'.repeat(40),
    metrics: { ready: 0, database: 0 },
  };
  const request = (bearer) =>
    new Request('https://nagarik-edge.invalid/alerts', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${bearer}`,
        'content-type': 'application/json',
        'x-nagarik-alert-id': body.alertId,
      },
      body: JSON.stringify(body),
    });

  assert.equal(
    (await handleAlertRequest(request(alertSecret), { NAGARIK_ALERT_WEBHOOK_TOKEN: alertSecret }))
      .status,
    204,
  );
  assert.equal(
    (await handleAlertRequest(request('wrong'), { NAGARIK_ALERT_WEBHOOK_TOKEN: alertSecret })).status,
    401,
  );
});

test('proxies only authenticated read-only Solana RPC methods without forwarding the token', async () => {
  const token = `rpc-${'r'.repeat(40)}`;
  let captured;
  const fetcher = async (url, init) => {
    captured = { url, init };
    const request = JSON.parse(init.body);
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', id: request.id, result: 'devnet-genesis' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  const request = (method) =>
    new Request(`https://nagarik-edge.invalid/rpc?token=${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }),
    });

  const response = await handleRpcRequest(request('getGenesisHash'), { NAGARIK_RPC_PROXY_TOKEN: token }, fetcher);
  assert.equal(response.status, 200);
  assert.equal(captured.url, 'https://api.devnet.solana.com');
  assert.doesNotMatch(captured.init.body, /token|rpc-r/);
  assert.equal(
    (await handleRpcRequest(request('sendTransaction'), { NAGARIK_RPC_PROXY_TOKEN: token }, fetcher)).status,
    400,
  );
});

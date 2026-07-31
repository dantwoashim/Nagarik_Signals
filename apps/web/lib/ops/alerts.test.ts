import assert from 'node:assert/strict';
import test from 'node:test';

import { AlertDeliveryError, createOperationalAlert, deliverOperationalAlert } from './alerts';

const alert = createOperationalAlert({
  kind: 'readiness_failed',
  severity: 'critical',
  occurredAt: '2026-07-31T12:00:00.000Z',
  requestId: 'req_01234567-89ab-4def-8123-456789abcdef',
  traceId: 'trc_0123456789abcdef0123456789abcdef',
  releaseId: 'a'.repeat(40),
  metrics: { ready: 0, database: 0 },
});

test('alert delivery sends a fixed redacted payload without exposing its credential', async () => {
  const token = `alert-${'x'.repeat(40)}`;
  let observedUrl = '';
  let observed: RequestInit | undefined;
  const result = await deliverOperationalAlert(alert, {
    url: 'https://alerts.example/nagarik',
    token,
    fetcher: async (url, init) => {
      observedUrl = String(url);
      observed = init;
      return new Response(null, { status: 202 });
    },
  });

  assert.equal(result.status, 'delivered');
  assert.equal(observedUrl, 'https://alerts.example/nagarik');
  assert.equal(observed?.redirect, 'error');
  assert.deepEqual(JSON.parse(String(observed?.body)), alert);
  assert.equal(String(observed?.body).includes(token), false);
  assert.equal((observed?.headers as Record<string, string>).authorization, `Bearer ${token}`);
});

test('alert delivery fails closed on unsafe configuration and provider errors', async () => {
  await assert.rejects(
    () =>
      deliverOperationalAlert(alert, {
        url: 'http://127.0.0.1/alert',
        token: `alert-${'x'.repeat(40)}`,
      }),
    (error: unknown) =>
      error instanceof AlertDeliveryError && error.code === 'alert_configuration_invalid',
  );
  await assert.rejects(
    () =>
      deliverOperationalAlert(alert, {
        url: 'https://127.0.0.1/alert',
        token: `alert-${'x'.repeat(40)}`,
      }),
    (error: unknown) =>
      error instanceof AlertDeliveryError && error.code === 'alert_configuration_invalid',
  );
  await assert.rejects(
    () =>
      deliverOperationalAlert(alert, {
        url: 'https://alerts.example/nagarik',
        token: `alert-${'x'.repeat(40)}`,
        fetcher: async () => new Response(null, { status: 503 }),
      }),
    (error: unknown) =>
      error instanceof AlertDeliveryError && error.code === 'alert_delivery_failed',
  );
});

test('alert creation rejects metrics outside the alert-specific allowlist', () => {
  assert.throws(
    () => createOperationalAlert({ ...alert, metrics: { privateDescription: 1 } }),
    (error: unknown) =>
      error instanceof AlertDeliveryError && error.code === 'alert_configuration_invalid',
  );
});

test('alert delivery rebuilds the payload and cannot transmit extra runtime fields', async () => {
  let body = '';
  await deliverOperationalAlert(
    { ...alert, privateDescription: 'must-not-leave-process' } as typeof alert,
    {
      url: 'https://alerts.example/nagarik',
      token: `alert-${'x'.repeat(40)}`,
      fetcher: async (_url, init) => {
        body = String(init?.body);
        return new Response(null, { status: 202 });
      },
    },
  );
  assert.equal(body.includes('privateDescription'), false);
  assert.equal(body.includes('must-not-leave-process'), false);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOperationalContext,
  createOperationalEvent,
  emitOperationalEvent,
} from './telemetry';

const context = {
  requestId: 'req_01234567-89ab-4def-8123-456789abcdef',
  traceId: 'trc_0123456789abcdef0123456789abcdef',
};

test('operational events serialize only the redacted allowlisted schema', () => {
  let output = '';
  const event = emitOperationalEvent(
    {
      event: 'health.readiness',
      outcome: 'degraded',
      ...context,
      releaseId: 'a'.repeat(40),
      environment: 'production',
      durationMs: 12.5,
      metrics: { ready: 0, database: 1, outboxDeadLetter: 2, httpStatus: 503 },
      dimensions: { trigger: 'cron' },
    },
    {
      now: new Date('2026-07-31T12:00:00.000Z'),
      sink: (record) => {
        output = record;
      },
    },
  );

  assert.equal(event.severity, 'warning');
  assert.deepEqual(JSON.parse(output), event);
  assert.equal(output.includes('secret'), false);
  assert.equal(output.includes('message'), false);
});

test('operational telemetry rejects unknown fields disguised as metrics or dimensions', () => {
  assert.throws(() =>
    createOperationalEvent({
      event: 'health.readiness',
      outcome: 'failure',
      ...context,
      durationMs: 1,
      metrics: { privateDescription: 1 },
    }),
  );
  assert.throws(() =>
    createOperationalEvent({
      event: 'health.readiness',
      outcome: 'failure',
      ...context,
      durationMs: 1,
      dimensions: { trigger: 'browser' as 'cron' },
    }),
  );
  assert.throws(() =>
    createOperationalEvent({
      event: 'private.payload' as 'health.readiness',
      outcome: 'success',
      ...context,
      durationMs: 1,
    }),
  );
});

test('operational contexts contain independent opaque request and trace identifiers', () => {
  const generated = createOperationalContext(42);
  assert.match(generated.requestId, /^req_[0-9a-f-]{36}$/);
  assert.match(generated.traceId, /^trc_[0-9a-f]{32}$/);
  assert.equal(generated.startedAtMs, 42);
  assert.notEqual(generated.requestId.slice(4).replaceAll('-', ''), generated.traceId.slice(4));
});

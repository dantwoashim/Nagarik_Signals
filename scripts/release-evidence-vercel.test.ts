import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';

type VercelConfiguration = {
  crons?: Array<{ path?: unknown; schedule?: unknown }>;
};

test('Vercel registers every bounded production worker cadence', () => {
  const configuration = JSON.parse(
    readFileSync(resolve('vercel.json'), 'utf8'),
  ) as VercelConfiguration;
  const actual = Object.fromEntries(
    (configuration.crons ?? []).map((cron) => [cron.path, cron.schedule]),
  );

  assert.equal(configuration.crons?.length, 4);
  assert.deepEqual(actual, {
    '/api/internal/outbox/process': '* * * * *',
    '/api/internal/health': '*/5 * * * *',
    '/api/internal/reconcile': '*/10 * * * *',
    '/api/internal/retention': '17 2 * * *',
  });
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';

type VercelConfiguration = {
  crons?: Array<{ path?: unknown; schedule?: unknown }>;
};

test('the free-tier scheduler registers every bounded production worker cadence', () => {
  const configuration = JSON.parse(
    readFileSync(resolve('vercel.json'), 'utf8'),
  ) as VercelConfiguration;
  const workerConfiguration = readFileSync(
    resolve('infra/cloudflare-scheduler/wrangler.toml'),
    'utf8',
  );
  const triggers = workerConfiguration.match(/crons\s*=\s*(\[[^\]]+\])/s);

  assert.equal(configuration.crons?.length ?? 0, 0);
  assert.ok(triggers, 'Cloudflare cron triggers are missing');
  assert.deepEqual(JSON.parse(triggers[1]), [
    '* * * * *',
    '*/5 * * * *',
    '*/10 * * * *',
    '17 2 * * *',
  ]);
});

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runLoadSmoke } from './load-smoke';

const releaseId = '1234567890abcdef1234567890abcdef12345678';

async function fixtureServer(failingPath: string | null = null) {
  const server = createServer((request, response) => {
    if (request.url === '/api/health') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ ok: true, release: { commitSha: releaseId } }));
      return;
    }
    if (request.url === failingPath) {
      response.statusCode = 503;
      response.end('unavailable');
      return;
    }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture_address_missing');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

function config(baseUrl: string, directory: string, paths = ['/api/health', '/api/data']) {
  return {
    baseUrl,
    expectedSha: releaseId,
    requests: 24,
    concurrency: 4,
    timeoutMs: 2_000,
    maxResponseBytes: 10_000,
    maxErrorRate: 0,
    maxP95Ms: 1_000,
    paths,
    outputPath: join(directory, 'load.json'),
    gatePath: join(directory, 'gate.json'),
  };
}

test('read-only load smoke writes passing release evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nagarik-load-'));
  const fixture = await fixtureServer();
  try {
    const report = await runLoadSmoke(config(fixture.baseUrl, directory));
    assert.equal(report.result.passed, true);
    assert.equal(report.mutationRequests, 0);
    assert.equal(report.releaseId, releaseId);
    const gate = JSON.parse(await readFile(join(directory, 'gate.json'), 'utf8'));
    assert.equal(gate.status, 'pass');
  } finally {
    await fixture.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('load smoke fails the gate when an approved threshold is exceeded', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nagarik-load-'));
  const fixture = await fixtureServer('/broken');
  try {
    await assert.rejects(
      runLoadSmoke(config(fixture.baseUrl, directory, ['/broken'])),
      /load_smoke_threshold_failed/,
    );
    const gate = JSON.parse(await readFile(join(directory, 'gate.json'), 'utf8'));
    assert.equal(gate.status, 'fail');
  } finally {
    await fixture.close();
    await rm(directory, { recursive: true, force: true });
  }
});

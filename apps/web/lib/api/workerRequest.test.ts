import assert from 'node:assert/strict';
import test from 'node:test';

import { requireWorkerCommand, WorkerRequestError } from './workerRequest';

function command(body: string, query = '') {
  return new Request(`https://nagarik.invalid/api/internal/outbox/process${query}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

test('worker commands accept only their exact bounded schema', async () => {
  await assert.doesNotReject(() =>
    requireWorkerCommand(
      command(JSON.stringify({ schemaVersion: 'outbox-process-v1' })),
      'outbox-process-v1',
    ),
  );

  for (const request of [
    command(JSON.stringify({ schemaVersion: 'outbox-process-v1', limit: 100 })),
    command(JSON.stringify({ schemaVersion: 'reconcile-worker-v1' })),
    command(JSON.stringify({ schemaVersion: 'outbox-process-v1' }), '?limit=100'),
    command('{'),
  ]) {
    await assert.rejects(
      () => requireWorkerCommand(request, 'outbox-process-v1'),
      WorkerRequestError,
    );
  }
});

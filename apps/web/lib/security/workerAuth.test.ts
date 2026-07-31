import assert from 'node:assert/strict';
import test from 'node:test';

import { isAuthorizedWorkerRequest } from './workerAuth';

test('internal worker authorization requires an exact bounded bearer secret', () => {
  const secret = `worker-${'a'.repeat(40)}`;
  assert.equal(
    isAuthorizedWorkerRequest(
      new Request('https://nagarik.invalid', {
        headers: { authorization: `Bearer ${secret}` },
      }),
      secret,
    ),
    true,
  );
  assert.equal(
    isAuthorizedWorkerRequest(
      new Request('https://nagarik.invalid', {
        headers: { authorization: `Bearer ${secret}x` },
      }),
      secret,
    ),
    false,
  );
  assert.equal(isAuthorizedWorkerRequest(new Request('https://nagarik.invalid'), secret), false);
  assert.equal(
    isAuthorizedWorkerRequest(
      new Request('https://nagarik.invalid', {
        headers: { authorization: 'Bearer short' },
      }),
      'short',
    ),
    false,
  );
});

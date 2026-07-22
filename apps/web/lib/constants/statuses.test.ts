import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidStatusTransition, validStatusTransitions } from './statuses';

test('issue lifecycle moves forward while disputed records can return to review', () => {
  assert.equal(isValidStatusTransition('submitted', 'verified'), true);
  assert.equal(isValidStatusTransition('verified', 'in_progress'), true);
  assert.equal(isValidStatusTransition('in_progress', 'resolved'), true);
  assert.equal(isValidStatusTransition('disputed', 'in_progress'), true);

  assert.equal(isValidStatusTransition('verified', 'submitted'), false);
  assert.equal(isValidStatusTransition('in_progress', 'verified'), false);
  assert.equal(isValidStatusTransition('submitted', 'submitted'), false);
});

test('resolved and rejected records are terminal', () => {
  assert.deepEqual(validStatusTransitions('resolved'), []);
  assert.deepEqual(validStatusTransitions('rejected'), []);
  assert.equal(isValidStatusTransition('resolved', 'in_progress'), false);
  assert.equal(isValidStatusTransition('rejected', 'submitted'), false);
});

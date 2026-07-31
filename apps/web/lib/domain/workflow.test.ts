import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertHandoffTransition,
  assertLifecycleTransition,
  assertSubmissionTransition,
  WorkflowStateError,
} from './workflow';
import { deterministicUuidV4 } from '../security/ids';

test('submission moderation remains explicit and approval is not publication', () => {
  assert.doesNotThrow(() => assertSubmissionTransition('received', 'under_review'));
  assert.doesNotThrow(() => assertSubmissionTransition('under_review', 'changes_requested'));
  assert.doesNotThrow(() => assertSubmissionTransition('changes_requested', 'under_review'));
  assert.doesNotThrow(() => assertSubmissionTransition('under_review', 'approved'));
  assert.throws(
    () => assertSubmissionTransition('received', 'approved'),
    (error: unknown) =>
      error instanceof WorkflowStateError && error.code === 'submission_transition_invalid',
  );
  assert.throws(
    () => assertSubmissionTransition('rejected', 'under_review'),
    (error: unknown) => error instanceof WorkflowStateError && error.code === 'submission_terminal',
  );
});

test('lifecycle supports disputes while closed remains terminal', () => {
  assert.doesNotThrow(() => assertLifecycleTransition('open', 'in_progress'));
  assert.doesNotThrow(() => assertLifecycleTransition('resolved', 'disputed'));
  assert.doesNotThrow(() => assertLifecycleTransition('disputed', 'resolved'));
  assert.throws(
    () => assertLifecycleTransition('resolved', 'open'),
    (error: unknown) =>
      error instanceof WorkflowStateError && error.code === 'lifecycle_transition_invalid',
  );
  assert.throws(
    () => assertLifecycleTransition('closed', 'disputed'),
    (error: unknown) => error instanceof WorkflowStateError && error.code === 'lifecycle_terminal',
  );
});

test('official handoff evidence advances independently from issue lifecycle', () => {
  assert.doesNotThrow(() => assertHandoffTransition(null, 'prepared'));
  assert.doesNotThrow(() => assertHandoffTransition('prepared', 'sent'));
  assert.doesNotThrow(() => assertHandoffTransition('sent', 'acknowledged'));
  assert.doesNotThrow(() => assertHandoffTransition('acknowledged', 'closed'));
  assert.throws(
    () => assertHandoffTransition('prepared', 'acknowledged'),
    (error: unknown) =>
      error instanceof WorkflowStateError && error.code === 'handoff_transition_invalid',
  );
  assert.throws(
    () => assertHandoffTransition('closed', 'sent'),
    (error: unknown) => error instanceof WorkflowStateError && error.code === 'handoff_terminal',
  );
});

test('durable public and event identifiers remain canonical UUID v4 values', () => {
  const first = deterministicUuidV4('nagarik:test', 'stable-input');
  assert.equal(first, deterministicUuidV4('nagarik:test', 'stable-input'));
  assert.notEqual(first, deterministicUuidV4('nagarik:test', 'other-input'));
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

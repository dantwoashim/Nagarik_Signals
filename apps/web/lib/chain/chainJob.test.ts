import assert from 'node:assert/strict';
import test from 'node:test';

import { buildChainJob, prepareChainJob } from './chainJob';

const zero = '0'.repeat(64);

function creationJob() {
  return buildChainJob({
    operation: 'issue_created',
    publicIssueId: '6f62862a-c3d3-4758-bd40-3012ab63ab86',
    databaseEventId: '2ef9af1c-e62e-4d37-8e09-f576de2033d5',
    payloadHash: '11'.repeat(32),
    expected: {
      updateCount: 0,
      timelineHead: zero,
      handoffHead: zero,
      category: 2,
      lifecycle: 0,
      publicationRemoved: false,
      metadataHash: zero,
      evidenceHash: zero,
      locationHash: zero,
    },
    next: {
      category: 2,
      lifecycle: 0,
      publicationRemoved: false,
      metadataHash: '22'.repeat(32),
      evidenceHash: '33'.repeat(32),
      locationHash: '44'.repeat(32),
    },
  });
}

test('chain job builder freezes IDs, sequence, and the selected stream head', () => {
  const job = creationJob();
  assert.equal(prepareChainJob(job).operationId, job.operationId);
  assert.equal(job.next.updateCount, 1);
  assert.notEqual(job.next.timelineHead, zero);
  assert.equal(job.next.handoffHead, zero);
});

test('chain job validation rejects forged IDs, stale heads, and invalid terminal semantics', () => {
  const job = creationJob();
  assert.throws(
    () => prepareChainJob({ ...job, operationId: 'ff'.repeat(32) }),
    /chain_job_operation_id_mismatch/,
  );
  assert.throws(
    () =>
      prepareChainJob({
        ...job,
        next: { ...job.next, timelineHead: 'aa'.repeat(32) },
      }),
    /chain_job_head_mismatch/,
  );
  assert.throws(
    () =>
      prepareChainJob({
        ...job,
        next: { ...job.next, publicationRemoved: true },
      }),
    /chain_job_create_snapshot_invalid/,
  );
});

test('lifecycle jobs enforce known non-terminal edges and preserve commitments', () => {
  const created = creationJob();
  const lifecycle = buildChainJob({
    operation: 'lifecycle_changed',
    publicIssueId: created.publicIssueId,
    databaseEventId: 'b646416d-57a1-4807-ad8a-c5ea2a49c80a',
    payloadHash: '55'.repeat(32),
    expected: created.next,
    next: {
      category: created.next.category,
      lifecycle: 1,
      publicationRemoved: false,
      metadataHash: created.next.metadataHash,
      evidenceHash: created.next.evidenceHash,
      locationHash: created.next.locationHash,
    },
  });
  assert.equal(prepareChainJob(lifecycle).next.lifecycle, 1);
  assert.throws(
    () =>
      prepareChainJob({
        ...lifecycle,
        next: { ...lifecycle.next, lifecycle: 0 },
      }),
    /chain_job_lifecycle_snapshot_invalid/,
  );
});

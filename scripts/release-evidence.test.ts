import assert from 'node:assert/strict';
import test from 'node:test';

import { parseKnownDefectEvidence } from './lib/releaseEvidence';

const releaseId = '0123456789abcdef0123456789abcdef01234567';
const releaseCommittedAt = new Date('2026-07-31T10:00:00.000Z');
const now = new Date('2026-07-31T12:00:00.000Z');

function validEvidence() {
  return {
    schemaVersion: 'nagarik-known-defects-v1',
    releaseId,
    reviewedAt: '2026-07-31T11:00:00.000Z',
    ownerReference: 'restricted:release-owner-record',
    reviewerReference: 'restricted:independent-review-record',
    evidenceReferences: [
      'https://github.com/dantwoashim/Nagarik_Signals/actions/runs/30636061016',
      'restricted:defect-review-report',
    ],
    p0: 0,
    p1: 0,
    p2: 0,
    p3: 0,
  };
}

test('known-defect evidence is release-bound and independently reviewed', () => {
  const result = parseKnownDefectEvidence(validEvidence(), {
    expectedReleaseId: releaseId,
    releaseCommittedAt,
    now,
  });
  assert.equal(result.review.status, 'pass');
  assert.deepEqual(result.counts, { p0: 0, p1: 0, p2: 0, p3: 0 });
  assert.notEqual(result.review.ownerReference, result.review.reviewerReference);
});

test('missing, mismatched, stale, and self-reviewed defect evidence fails closed', () => {
  const missing = parseKnownDefectEvidence(null, {
    expectedReleaseId: releaseId,
    releaseCommittedAt,
    now,
  });
  assert.equal(missing.review.status, 'missing');
  assert.equal(missing.counts.p0, null);

  const mismatch = parseKnownDefectEvidence(
    { ...validEvidence(), releaseId: 'f'.repeat(40) },
    { expectedReleaseId: releaseId, releaseCommittedAt, now },
  );
  assert.equal(mismatch.review.reason, 'known_defect_review_release_mismatch');

  const predatesRelease = parseKnownDefectEvidence(
    { ...validEvidence(), reviewedAt: '2026-07-31T09:59:59.000Z' },
    { expectedReleaseId: releaseId, releaseCommittedAt, now },
  );
  assert.equal(predatesRelease.review.reason, 'known_defect_review_predates_release');

  const selfReviewed = parseKnownDefectEvidence(
    {
      ...validEvidence(),
      reviewerReference: 'restricted:release-owner-record',
    },
    { expectedReleaseId: releaseId, releaseCommittedAt, now },
  );
  assert.equal(selfReviewed.review.reason, 'known_defect_review_requires_independent_reviewer');

  const nullCount = parseKnownDefectEvidence(
    { ...validEvidence(), p0: null },
    { expectedReleaseId: releaseId, releaseCommittedAt, now },
  );
  assert.equal(nullCount.review.reason, 'known_defect_review_counts_invalid');
});

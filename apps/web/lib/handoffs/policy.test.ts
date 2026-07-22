import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAuthorityHandoff, verifyAuthorityHandoffChain, verifyAuthorityHandoffHash } from './hash';
import { handoffDraftMatches, nextHandoffStates, validateHandoffDraft } from './policy';

const now = Date.parse('2026-07-16T12:00:00.000Z');
const receiptHash = 'a'.repeat(64);

function draft(overrides: Record<string, unknown> = {}) {
  return {
    state: 'prepared',
    authorityName: 'Kathmandu Metropolitan City',
    channelName: 'KMC Gunaso',
    channelUrl: 'https://gunaso.kathmandu.gov.np/register',
    occurredAt: '2026-07-16T11:00:00.000Z',
    ...overrides,
  };
}

test('handoff transitions are explicit and close permanently', () => {
  assert.deepEqual(nextHandoffStates(null), ['prepared', 'submitted']);
  assert.deepEqual(nextHandoffStates('prepared'), ['submitted']);
  assert.deepEqual(nextHandoffStates('closed'), []);
});

test('a prepared route cannot imply external submission evidence', () => {
  const result = validateHandoffDraft(draft({ externalReference: 'KMC-2026-81' }), null, now);
  assert.deepEqual(result, { ok: false, error: 'prepared_route_cannot_claim_submission_evidence' });
});

test('submission requires evidence and a bounded follow-up date', () => {
  const missingEvidence = validateHandoffDraft(draft({
    state: 'submitted',
    followUpDueAt: '2026-07-30T12:00:00.000Z',
  }), 'prepared', now);
  assert.deepEqual(missingEvidence, { ok: false, error: 'submission_reference_or_receipt_required' });

  const valid = validateHandoffDraft(draft({
    state: 'submitted',
    externalReference: 'KMC-2026-81',
    followUpDueAt: '2026-07-30T12:00:00.000Z',
  }), 'prepared', now);
  assert.equal(valid.ok, true);
  if (valid.ok) assert.equal(valid.value.evidenceBasis, 'external_reference');
});

test('acknowledgement requires a redacted receipt and privacy confirmation', () => {
  const missingReview = validateHandoffDraft(draft({
    state: 'acknowledged',
    receiptPhotoUrl: `/api/media/${receiptHash}.jpg`,
    receiptEvidenceHash: receiptHash,
  }), 'submitted', now);
  assert.deepEqual(missingReview, { ok: false, error: 'receipt_privacy_review_required' });

  const valid = validateHandoffDraft(draft({
    state: 'acknowledged',
    receiptPhotoUrl: `/api/media/${receiptHash}.jpg`,
    receiptEvidenceHash: receiptHash,
    receiptPrivacyReviewed: true,
  }), 'submitted', now);
  assert.equal(valid.ok, true);
});

test('URLs must be HTTPS and transitions cannot be skipped', () => {
  assert.deepEqual(
    validateHandoffDraft(draft({ channelUrl: 'http://example.com' }), null, now),
    { ok: false, error: 'invalid_channel_url' },
  );
  assert.deepEqual(
    validateHandoffDraft(draft({ state: 'acknowledged' }), null, now),
    { ok: false, error: 'invalid_handoff_transition' },
  );
});

test('event hashes commit every field and the previous event hash', () => {
  const validated = validateHandoffDraft(draft(), null, now);
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  const record = buildAuthorityHandoff({
    id: '3fe4bcf5-22db-4bb0-a85d-80c1cc071f98',
    idempotencyKey: '78591452-18b5-4e1b-af70-1d64ddce23e0',
    issueId: 15,
    seq: 1,
    draft: validated.value,
    previousEventHash: null,
    createdAt: '2026-07-16T12:00:00.000Z',
  });
  assert.equal(verifyAuthorityHandoffHash(record), true);
  assert.equal(verifyAuthorityHandoffChain([record]), true);
  assert.equal(verifyAuthorityHandoffChain([{ ...record, seq: 2 }]), false);
  assert.equal(handoffDraftMatches(record, validated.value), true);
  assert.equal(handoffDraftMatches(record, { ...validated.value, channelName: 'Changed later' }), false);
  assert.equal(verifyAuthorityHandoffHash({ ...record, channelName: 'Changed later' }), false);
});

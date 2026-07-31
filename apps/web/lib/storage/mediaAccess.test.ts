import assert from 'node:assert/strict';
import test from 'node:test';

import { isPrivateMediaReadable, isPublicMediaReadable, parseOpaqueMediaId } from './mediaAccess';

test('media IDs are opaque and reject legacy filenames', () => {
  assert.equal(
    parseOpaqueMediaId('med_10000000-0000-4000-8000-000000000001'),
    '10000000-0000-4000-8000-000000000001',
  );
  assert.equal(parseOpaqueMediaId('evidence.jpg'), null);
  assert.equal(parseOpaqueMediaId('../evidence.jpg'), null);
});

test('public media requires the complete publication boundary', () => {
  const eligible = {
    mediaState: 'approved_public',
    hasSourceDerivative: true,
    projectionEligible: true,
    issuePublicationState: 'published',
    publicReadEnabled: true,
    publicMediaEnabled: true,
  };
  assert.equal(isPublicMediaReadable(eligible), true);
  for (const denied of [
    { ...eligible, mediaState: 'approved_private' },
    { ...eligible, hasSourceDerivative: false },
    { ...eligible, projectionEligible: false },
    { ...eligible, issuePublicationState: 'removed' },
    { ...eligible, publicReadEnabled: false },
    { ...eligible, publicMediaEnabled: false },
  ]) {
    assert.equal(isPublicMediaReadable(denied), false);
  }
});

test('private media denies staging, failed, rejected, expired, and deleted objects', () => {
  const now = new Date('2030-01-01T00:00:00.000Z');
  for (const mediaState of [
    'staged',
    'promotion_pending',
    'promotion_failed',
    'rejected',
    'expired',
    'deleted',
  ]) {
    assert.equal(
      isPrivateMediaReadable({ mediaState, expiresAt: null, now, requester: 'tracking' }),
      false,
    );
  }
  for (const mediaState of ['quarantined', 'approved_private', 'redacted_derivative']) {
    assert.equal(
      isPrivateMediaReadable({ mediaState, expiresAt: null, now, requester: 'tracking' }),
      true,
    );
  }
  assert.equal(
    isPrivateMediaReadable({
      mediaState: 'approved_private',
      expiresAt: new Date('2029-12-31T23:59:59.000Z'),
      now,
      requester: 'tracking',
    }),
    false,
  );
  assert.equal(
    isPrivateMediaReadable({
      mediaState: 'approved_public',
      expiresAt: null,
      now,
      requester: 'operator',
    }),
    true,
  );
});

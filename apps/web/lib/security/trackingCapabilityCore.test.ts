import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveCapabilityMaterial, type CapabilityCoordinates } from './capabilityTokens';
import { authorizeTrackingCapability } from './trackingCapabilityCore';

const coordinates: CapabilityCoordinates = {
  keyVersion: 1,
  purpose: 'submission_tracking',
  organizationId: '10000000-0000-4000-8000-000000000001',
  capabilityId: '20000000-0000-4000-8000-000000000002',
  subjectId: '30000000-0000-4000-8000-000000000003',
  issuanceIdempotencyId: '40000000-0000-4000-8000-000000000004',
};
const keys = {
  derivationKey: 'derivation-key-material-32-bytes-minimum',
  verifierKey: 'verifier-key-material-is-independent-32',
};

test('tracking capability is bound to one submission, tracking id, and read scope', () => {
  const material = deriveCapabilityMaterial(coordinates, keys);
  const row = {
    ...coordinates,
    verifier: material.verifier,
    state: 'active',
    expiresAt: new Date('2030-01-02T00:00:00.000Z'),
    scope: {
      submissionId: coordinates.subjectId,
      trackingId: '50000000-0000-4000-8000-000000000005',
      actions: ['read'],
    },
  };

  assert.equal(
    authorizeTrackingCapability(
      material.token,
      row,
      {
        submissionId: coordinates.subjectId,
        trackingId: '50000000-0000-4000-8000-000000000005',
        organizationId: coordinates.organizationId,
      },
      keys,
      new Date('2030-01-01T00:00:00.000Z'),
    ),
    true,
  );
  assert.equal(
    authorizeTrackingCapability(
      material.token,
      row,
      {
        submissionId: coordinates.subjectId,
        trackingId: '50000000-0000-4000-8000-000000000009',
        organizationId: coordinates.organizationId,
      },
      keys,
      new Date('2030-01-01T00:00:00.000Z'),
    ),
    false,
  );
});

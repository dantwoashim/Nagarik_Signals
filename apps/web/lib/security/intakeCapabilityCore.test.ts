import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveCapabilityMaterial, type CapabilityCoordinates } from './capabilityTokens';
import { authorizeIntakeCapability } from './intakeCapabilityCore';

const coordinates: CapabilityCoordinates = {
  keyVersion: 1,
  purpose: 'pilot_intake',
  organizationId: '10000000-0000-4000-8000-000000000001',
  capabilityId: '20000000-0000-4000-8000-000000000002',
  subjectId: '30000000-0000-4000-8000-000000000003',
  issuanceIdempotencyId: '40000000-0000-4000-8000-000000000004',
};
const keys = {
  derivationKey: 'derivation-key-material-32-bytes-minimum',
  verifierKey: 'verifier-key-material-is-independent-32',
};

test('intake authorization requires exact active scope and expiry', () => {
  const material = deriveCapabilityMaterial(coordinates, keys);
  const row = {
    ...coordinates,
    verifier: material.verifier,
    state: 'active' as const,
    expiresAt: new Date('2030-01-02T00:00:00.000Z'),
    scope: { scopes: ['intake'], pilotPolicyVersion: 'pilot-v1' },
  };

  assert.equal(
    authorizeIntakeCapability(material.token, row, keys, new Date('2030-01-01T00:00:00.000Z'))
      ?.pilotPolicyVersion,
    'pilot-v1',
  );
  assert.equal(
    authorizeIntakeCapability(
      material.token,
      { ...row, state: 'revoked' },
      keys,
      new Date('2030-01-01T00:00:00.000Z'),
    ),
    null,
  );
  assert.equal(
    authorizeIntakeCapability(material.token, row, keys, new Date('2030-01-03T00:00:00.000Z')),
    null,
  );
});

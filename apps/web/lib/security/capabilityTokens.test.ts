import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveCapabilityMaterial,
  parseCapabilityToken,
  verifyCapabilityToken,
  type CapabilityCoordinates,
} from './capabilityTokens';

const coordinates: CapabilityCoordinates = {
  keyVersion: 1,
  purpose: 'submission_media',
  organizationId: '10000000-0000-4000-8000-000000000001',
  capabilityId: '20000000-0000-4000-8000-000000000002',
  subjectId: '30000000-0000-4000-8000-000000000003',
  issuanceIdempotencyId: '40000000-0000-4000-8000-000000000004',
};
const keys = {
  derivationKey: 'derivation-key-material-32-bytes-minimum',
  verifierKey: 'verifier-key-material-is-independent-32',
};

test('capability derivation is deterministic and purpose-separated', () => {
  const first = deriveCapabilityMaterial(coordinates, keys);
  const second = deriveCapabilityMaterial(coordinates, keys);

  assert.equal(first.token, second.token);
  assert.deepEqual(first.verifier, second.verifier);
  assert.equal(
    first.token,
    'nmr.1.20000000-0000-4000-8000-000000000002.JcveVtb5HDLGjV4uJIu_UVi2EDZvaJ5izRxruche5bQ',
  );
  assert.equal(
    first.verifier.toString('hex'),
    'ee7488b6d2e267a1c7571499316fc4169140c6227db20d32e7ef687c594325ae',
  );
  assert.equal(parseCapabilityToken(first.token)?.purpose, 'submission_media');

  const tracking = deriveCapabilityMaterial(
    { ...coordinates, purpose: 'submission_tracking' },
    keys,
  );
  assert.notEqual(first.token, tracking.token);
  assert.notDeepEqual(first.verifier, tracking.verifier);
});

test('capability verification rejects grammar, scope, and verifier changes', () => {
  const material = deriveCapabilityMaterial(coordinates, keys);
  assert.equal(
    verifyCapabilityToken(material.token, { ...coordinates, verifier: material.verifier }, keys),
    true,
  );
  assert.equal(
    verifyCapabilityToken(
      material.token,
      {
        ...coordinates,
        organizationId: '10000000-0000-4000-8000-000000000009',
        verifier: material.verifier,
      },
      keys,
    ),
    false,
  );
  assert.equal(parseCapabilityToken(material.token.replace('.1.', '.01.')), null);
  assert.equal(parseCapabilityToken(` ${material.token}`), null);
  assert.equal(parseCapabilityToken(`${material.token}.extra`), null);
});

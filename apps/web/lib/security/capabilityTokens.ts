import { createHmac, timingSafeEqual } from 'node:crypto';

export const capabilityPurposes = {
  pilot_invitation: { id: 1, prefix: 'npi' },
  pilot_intake: { id: 2, prefix: 'npc' },
  pilot_signal: { id: 3, prefix: 'nsg' },
  submission_tracking: { id: 4, prefix: 'nsc' },
  privacy_tracking: { id: 5, prefix: 'npr' },
  submission_media: { id: 6, prefix: 'nmr' },
  operator_media: { id: 7, prefix: 'nomr' },
  privacy_export: { id: 8, prefix: 'npe' },
} as const;

export type CapabilityPurpose = keyof typeof capabilityPurposes;

const purposeByPrefix = new Map<string, { purpose: CapabilityPurpose; id: number; prefix: string }>(
  Object.entries(capabilityPurposes).map(([purpose, value]) => [
    value.prefix,
    { purpose: purpose as CapabilityPurpose, ...value },
  ]),
);
const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type CapabilityCoordinates = {
  keyVersion: number;
  purpose: CapabilityPurpose;
  organizationId: string;
  capabilityId: string;
  subjectId: string;
  issuanceIdempotencyId: string;
};

export type CapabilityKeys = {
  derivationKey: Uint8Array | string;
  verifierKey: Uint8Array | string;
};

export type ParsedCapabilityToken = {
  token: string;
  prefix: string;
  keyVersion: number;
  capabilityId: string;
  secret: Buffer;
  purpose: CapabilityPurpose;
};

function keyBytes(key: Uint8Array | string, label: string): Buffer {
  const bytes = typeof key === 'string' ? Buffer.from(key, 'utf8') : Buffer.from(key);
  if (bytes.byteLength < 32) throw new Error(`${label}_must_be_at_least_32_bytes`);
  return bytes;
}

function uuidBytes(uuid: string): Buffer {
  if (!canonicalUuid.test(uuid)) throw new Error('capability_uuid_not_canonical');
  return Buffer.from(uuid.replaceAll('-', ''), 'hex');
}

function keyVersionBytes(keyVersion: number): Buffer {
  if (!Number.isInteger(keyVersion) || keyVersion < 1 || keyVersion > 65_535) {
    throw new Error('capability_key_version_invalid');
  }
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(keyVersion);
  return bytes;
}

function derivationInput(coordinates: CapabilityCoordinates): Buffer {
  const purpose = capabilityPurposes[coordinates.purpose];
  return Buffer.concat([
    Buffer.from('nagarik:capability-secret:v1\0', 'ascii'),
    keyVersionBytes(coordinates.keyVersion),
    Buffer.from([purpose.id]),
    uuidBytes(coordinates.organizationId),
    uuidBytes(coordinates.capabilityId),
    uuidBytes(coordinates.subjectId),
    uuidBytes(coordinates.issuanceIdempotencyId),
  ]);
}

function verifierInput(coordinates: CapabilityCoordinates, secret: Uint8Array): Buffer {
  const purpose = capabilityPurposes[coordinates.purpose];
  return Buffer.concat([
    Buffer.from('nagarik:capability-verifier:v1\0', 'ascii'),
    keyVersionBytes(coordinates.keyVersion),
    Buffer.from([purpose.id]),
    uuidBytes(coordinates.organizationId),
    uuidBytes(coordinates.capabilityId),
    uuidBytes(coordinates.subjectId),
    Buffer.from(secret),
  ]);
}

export function deriveCapabilityMaterial(
  coordinates: CapabilityCoordinates,
  keys: CapabilityKeys,
): { token: string; secret: Buffer; verifier: Buffer } {
  const purpose = capabilityPurposes[coordinates.purpose];
  const secret = createHmac('sha256', keyBytes(keys.derivationKey, 'capability_derivation_key'))
    .update(derivationInput(coordinates))
    .digest();
  const verifier = createHmac('sha256', keyBytes(keys.verifierKey, 'capability_verifier_key'))
    .update(verifierInput(coordinates, secret))
    .digest();

  return {
    token: `${purpose.prefix}.${coordinates.keyVersion}.${coordinates.capabilityId}.${secret.toString('base64url')}`,
    secret,
    verifier,
  };
}

export function parseCapabilityToken(token: string): ParsedCapabilityToken | null {
  if (token !== token.trim()) return null;
  const segments = token.split('.');
  if (segments.length !== 4) return null;
  const [prefix, keyVersionText, capabilityId, encodedSecret] = segments;
  const purpose = purposeByPrefix.get(prefix);
  if (!purpose || !/^[1-9][0-9]{0,4}$/.test(keyVersionText)) return null;
  const keyVersion = Number(keyVersionText);
  if (keyVersion > 65_535 || !canonicalUuid.test(capabilityId)) return null;
  if (!/^[A-Za-z0-9_-]{43}$/.test(encodedSecret)) return null;

  const secret = Buffer.from(encodedSecret, 'base64url');
  if (secret.byteLength !== 32 || secret.toString('base64url') !== encodedSecret) return null;

  return {
    token,
    prefix,
    keyVersion,
    capabilityId,
    secret,
    purpose: purpose.purpose,
  };
}

export function verifyCapabilityToken(
  token: string,
  row: CapabilityCoordinates & { verifier: Uint8Array },
  keys: CapabilityKeys,
): boolean {
  const parsed = parseCapabilityToken(token);
  if (
    !parsed ||
    parsed.capabilityId !== row.capabilityId ||
    parsed.keyVersion !== row.keyVersion ||
    parsed.purpose !== row.purpose
  ) {
    return false;
  }

  const expected = deriveCapabilityMaterial(row, keys);
  const storedVerifier = Buffer.from(row.verifier);
  return (
    storedVerifier.byteLength === expected.verifier.byteLength &&
    timingSafeEqual(parsed.secret, expected.secret) &&
    timingSafeEqual(storedVerifier, expected.verifier)
  );
}

export function capabilityKeysFromEnvironment(): CapabilityKeys {
  const derivationKey = process.env.NAGARIK_CAPABILITY_DERIVATION_KEY;
  const verifierKey = process.env.NAGARIK_CAPABILITY_VERIFIER_KEY;
  if (!derivationKey || !verifierKey) throw new Error('capability_keys_missing');
  return { derivationKey, verifierKey };
}

import { createHash, timingSafeEqual } from 'node:crypto';

import {
  parseCapabilityToken,
  verifyCapabilityToken,
  type CapabilityKeys,
  type CapabilityCoordinates,
} from './capabilityTokens';

export type IntakeCapabilityRow = CapabilityCoordinates & {
  verifier: Uint8Array;
  state: 'active' | 'consumed' | 'revoked' | 'expired';
  expiresAt: Date;
  scope: unknown;
};

export type IntakeCapability = {
  organizationId: string;
  capabilityId: string;
  subjectId: string;
  issuanceIdempotencyId: string;
  keyVersion: number;
  expiresAt: Date;
  pilotPolicyVersion: string;
};

function intakeScope(value: unknown): { pilotPolicyVersion: string; publicAccess: boolean } | null {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const scope = parsed as Record<string, unknown>;
  const scopes = Array.isArray(scope.scopes) ? scope.scopes : [];
  if (
    typeof scope.pilotPolicyVersion !== 'string' ||
    !scope.pilotPolicyVersion ||
    !scopes.includes('intake')
  ) {
    return null;
  }
  return {
    pilotPolicyVersion: scope.pilotPolicyVersion,
    publicAccess:
      scope.schemaVersion === 'public-intake-capability-v2' && scope.access === 'public',
  };
}

function verifyPublicIntakeToken(token: string, row: IntakeCapabilityRow): boolean {
  const parsed = parseCapabilityToken(token);
  if (
    !parsed ||
    parsed.purpose !== 'pilot_intake' ||
    parsed.capabilityId !== row.capabilityId ||
    parsed.keyVersion !== row.keyVersion
  ) {
    return false;
  }
  const expected = createHash('sha256').update(parsed.secret).digest();
  const stored = Buffer.from(row.verifier);
  return stored.byteLength === expected.byteLength && timingSafeEqual(stored, expected);
}

export function authorizeIntakeCapability(
  token: string,
  row: IntakeCapabilityRow,
  keys: CapabilityKeys,
  now = new Date(),
): IntakeCapability | null {
  const scope = intakeScope(row.scope);
  const tokenValid = scope?.publicAccess
    ? verifyPublicIntakeToken(token, row)
    : verifyCapabilityToken(token, row, keys);
  if (
    row.purpose !== 'pilot_intake' ||
    row.state !== 'active' ||
    row.expiresAt.getTime() <= now.getTime() ||
    !scope ||
    !tokenValid
  ) {
    return null;
  }

  return {
    organizationId: row.organizationId,
    capabilityId: row.capabilityId,
    subjectId: row.subjectId,
    issuanceIdempotencyId: row.issuanceIdempotencyId,
    keyVersion: row.keyVersion,
    expiresAt: row.expiresAt,
    pilotPolicyVersion: scope.pilotPolicyVersion,
  };
}

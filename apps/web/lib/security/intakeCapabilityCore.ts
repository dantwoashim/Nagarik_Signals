import {
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

function intakeScope(value: unknown): { pilotPolicyVersion: string } | null {
  if (!value || typeof value !== 'object') return null;
  const scope = value as Record<string, unknown>;
  const scopes = Array.isArray(scope.scopes) ? scope.scopes : [];
  if (
    typeof scope.pilotPolicyVersion !== 'string' ||
    !scope.pilotPolicyVersion ||
    !scopes.includes('intake')
  ) {
    return null;
  }
  return { pilotPolicyVersion: scope.pilotPolicyVersion };
}

export function authorizeIntakeCapability(
  token: string,
  row: IntakeCapabilityRow,
  keys: CapabilityKeys,
  now = new Date(),
): IntakeCapability | null {
  const scope = intakeScope(row.scope);
  if (
    row.purpose !== 'pilot_intake' ||
    row.state !== 'active' ||
    row.expiresAt.getTime() <= now.getTime() ||
    !scope ||
    !verifyCapabilityToken(token, row, keys)
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

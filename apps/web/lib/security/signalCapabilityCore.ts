import {
  verifyCapabilityToken,
  type CapabilityCoordinates,
  type CapabilityKeys,
} from './capabilityTokens';

export type SignalCapabilityRow = CapabilityCoordinates & {
  verifier: Uint8Array;
  state: 'active' | 'consumed' | 'revoked' | 'expired';
  expiresAt: Date;
  scope: unknown;
};

export type AuthorizedSignalCapability = {
  organizationId: string;
  capabilityId: string;
  subjectId: string;
  issuanceIdempotencyId: string;
  keyVersion: number;
  expiresAt: Date;
  pilotPolicyVersion: string;
  semantics: 'attention_not_verification';
};

function signalScope(value: unknown): { pilotPolicyVersion: string } | null {
  if (!value || typeof value !== 'object') return null;
  const scope = value as Record<string, unknown>;
  const scopes = Array.isArray(scope.scopes) ? scope.scopes : [];
  if (
    typeof scope.pilotPolicyVersion !== 'string' ||
    scope.pilotPolicyVersion.length === 0 ||
    !scopes.includes('signal')
  ) {
    return null;
  }
  return { pilotPolicyVersion: scope.pilotPolicyVersion };
}

export function authorizeSignalCapability(
  token: string,
  row: SignalCapabilityRow,
  keys: CapabilityKeys,
  now = new Date(),
): AuthorizedSignalCapability | null {
  const scope = signalScope(row.scope);
  if (
    row.purpose !== 'pilot_signal' ||
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
    semantics: 'attention_not_verification',
  };
}

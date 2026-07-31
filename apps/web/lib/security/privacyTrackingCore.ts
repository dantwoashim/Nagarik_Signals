import {
  verifyCapabilityToken,
  type CapabilityCoordinates,
  type CapabilityKeys,
} from './capabilityTokens';

export type PrivacyTrackingCapabilityRow = CapabilityCoordinates & {
  verifier: Uint8Array;
  state: string;
  expiresAt: Date;
  scope: unknown;
};

export function authorizePrivacyTrackingCapability(
  token: string,
  row: PrivacyTrackingCapabilityRow,
  input: { privacyRequestId: string; organizationId: string; action: 'read' | 'withdraw' },
  keys: CapabilityKeys,
  now = new Date(),
): boolean {
  if (
    row.purpose !== 'privacy_tracking' ||
    row.organizationId !== input.organizationId ||
    row.subjectId !== input.privacyRequestId ||
    row.state !== 'active' ||
    row.expiresAt.getTime() <= now.getTime() ||
    !row.scope ||
    typeof row.scope !== 'object' ||
    Array.isArray(row.scope)
  ) {
    return false;
  }
  const scope = row.scope as Record<string, unknown>;
  return (
    scope.schemaVersion === 'privacy-tracking-v1' &&
    scope.privacyRequestId === input.privacyRequestId &&
    Array.isArray(scope.actions) &&
    scope.actions.includes(input.action) &&
    verifyCapabilityToken(token, row, keys)
  );
}

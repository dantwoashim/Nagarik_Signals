import {
  verifyCapabilityToken,
  type CapabilityCoordinates,
  type CapabilityKeys,
} from './capabilityTokens';

export type TrackingCapabilityRow = CapabilityCoordinates & {
  verifier: Uint8Array;
  state: string;
  expiresAt: Date;
  scope: unknown;
};

export function authorizeTrackingCapability(
  token: string,
  row: TrackingCapabilityRow,
  input: { submissionId: string; trackingId: string; organizationId: string },
  keys: CapabilityKeys,
  now = new Date(),
): boolean {
  if (
    row.purpose !== 'submission_tracking' ||
    row.organizationId !== input.organizationId ||
    row.subjectId !== input.submissionId ||
    row.state !== 'active' ||
    row.expiresAt.getTime() <= now.getTime() ||
    !row.scope ||
    typeof row.scope !== 'object'
  ) {
    return false;
  }
  const scope = row.scope as Record<string, unknown>;
  return (
    scope.submissionId === input.submissionId &&
    scope.trackingId === input.trackingId &&
    Array.isArray(scope.actions) &&
    scope.actions.includes('read') &&
    verifyCapabilityToken(token, row, keys)
  );
}

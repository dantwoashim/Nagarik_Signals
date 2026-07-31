import {
  verifyCapabilityToken,
  type CapabilityCoordinates,
  type CapabilityKeys,
} from './capabilityTokens';

export type OperatorMediaBindingPurpose =
  'initial_publication' | 'correction_publication' | 'status_evidence' | 'handoff_evidence';

export type OperatorMediaCapabilityRow = CapabilityCoordinates & {
  verifier: Uint8Array;
  state: string;
  expiresAt: Date;
  scope: unknown;
};

export type AuthorizedOperatorMediaReceipt = {
  capabilityId: string;
  mediaId: string;
  mediaVersion: number;
  evidenceHash: string;
  sourceMediaId: string;
  purpose: OperatorMediaBindingPurpose;
  targetType: 'submission' | 'public_issue';
  targetId: string;
  issuedBy: string;
};

export function authorizeOperatorMediaReceipt(
  token: string,
  row: OperatorMediaCapabilityRow,
  expected: {
    organizationId: string;
    purpose: OperatorMediaBindingPurpose;
    targetType: 'submission' | 'public_issue';
    targetId: string;
    issuedBy: string;
  },
  keys: CapabilityKeys,
  now = new Date(),
): AuthorizedOperatorMediaReceipt | null {
  if (
    row.purpose !== 'operator_media' ||
    row.organizationId !== expected.organizationId ||
    row.state !== 'active' ||
    row.expiresAt.getTime() <= now.getTime() ||
    !row.scope ||
    typeof row.scope !== 'object' ||
    !verifyCapabilityToken(token, row, keys)
  ) {
    return null;
  }
  const scope = row.scope as Record<string, unknown>;
  if (
    scope.schemaVersion !== 'operator-media-binding-v1' ||
    scope.purpose !== expected.purpose ||
    scope.targetType !== expected.targetType ||
    scope.targetId !== expected.targetId ||
    scope.issuedBy !== expected.issuedBy ||
    scope.mediaId !== row.subjectId ||
    typeof scope.mediaVersion !== 'number' ||
    !Number.isSafeInteger(scope.mediaVersion) ||
    typeof scope.evidenceHash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(scope.evidenceHash) ||
    typeof scope.sourceMediaId !== 'string'
  ) {
    return null;
  }
  return {
    capabilityId: row.capabilityId,
    mediaId: row.subjectId,
    mediaVersion: scope.mediaVersion,
    evidenceHash: scope.evidenceHash,
    sourceMediaId: scope.sourceMediaId,
    purpose: scope.purpose as OperatorMediaBindingPurpose,
    targetType: scope.targetType as 'submission' | 'public_issue',
    targetId: scope.targetId as string,
    issuedBy: scope.issuedBy as string,
  };
}

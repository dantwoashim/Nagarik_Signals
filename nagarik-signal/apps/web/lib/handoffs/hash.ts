import { createHash } from 'node:crypto';
import { canonicalize } from '../proof/canonicalize';
import type { AuthorityHandoff } from '../types';
import type { ValidatedHandoffDraft } from './policy';

type BuildHandoffInput = {
  id: string;
  idempotencyKey: string;
  issueId: number;
  seq: number;
  draft: ValidatedHandoffDraft;
  previousEventHash: string | null;
  createdAt: string;
};

export function handoffEventPayload(input: BuildHandoffInput): Omit<AuthorityHandoff, 'eventHash'> {
  return {
    version: '1.0' as const,
    id: input.id,
    idempotencyKey: input.idempotencyKey,
    issueId: input.issueId,
    seq: input.seq,
    ...input.draft,
    recordedBy: 'platform_steward' as const,
    previousEventHash: input.previousEventHash,
    createdAt: input.createdAt,
  };
}

export function buildAuthorityHandoff(input: BuildHandoffInput): AuthorityHandoff {
  const payload = handoffEventPayload(input);
  return {
    ...payload,
    eventHash: createHash('sha256').update(canonicalize(payload)).digest('hex'),
  };
}

export function verifyAuthorityHandoffHash(record: AuthorityHandoff) {
  const { eventHash, ...payload } = record;
  return createHash('sha256').update(canonicalize(payload)).digest('hex') === eventHash;
}

export function verifyAuthorityHandoffChain(records: AuthorityHandoff[]) {
  if (!records.length) return true;
  const timeline = [...records].sort((left, right) => left.seq - right.seq);
  const issueId = timeline[0].issueId;
  return timeline.every((record, index) => {
    const previous = timeline[index - 1] ?? null;
    return record.issueId === issueId
      && record.seq === index + 1
      && record.previousEventHash === (previous?.eventHash ?? null)
      && verifyAuthorityHandoffHash(record);
  });
}

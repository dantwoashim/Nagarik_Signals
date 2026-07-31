import { z } from 'zod';

import {
  deriveEventId,
  deriveEventRecordHash,
  deriveIssueKey,
  deriveOperationId,
  deriveStreamHead,
  V2_MAX_SEQUENCE,
  v2Lifecycles,
  v2Operations,
  type V2Operation,
} from '../solana/v2/protocol';

const hashHex = z.string().regex(/^[0-9a-f]{64}$/);
const canonicalUuidV4 = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const safeSequence = z.number().int().min(0).max(Number(V2_MAX_SEQUENCE));

const snapshotSchema = z
  .object({
    updateCount: safeSequence,
    timelineHead: hashHex,
    handoffHead: hashHex,
    category: z.number().int().min(0).max(6),
    lifecycle: z.number().int().min(0).max(4),
    publicationRemoved: z.boolean(),
    metadataHash: hashHex,
    evidenceHash: hashHex,
    locationHash: hashHex,
  })
  .strict();

const chainJobSchema = z
  .object({
    schemaVersion: z.literal('nagarik-chain-job-v2'),
    operation: z.enum([
      'issue_created',
      'metadata_version_committed',
      'lifecycle_changed',
      'handoff_checkpointed',
      'publication_removed',
    ]),
    publicIssueId: canonicalUuidV4,
    databaseEventId: canonicalUuidV4,
    issueKey: hashHex,
    eventId: hashHex,
    operationId: hashHex,
    payloadHash: hashHex,
    expected: snapshotSchema,
    next: snapshotSchema,
  })
  .strict();

export type ChainJobEnvelope = z.infer<typeof chainJobSchema>;

export type PreparedChainJob = ChainJobEnvelope & {
  issueKeyBytes: Buffer;
  eventIdBytes: Buffer;
  operationIdBytes: Buffer;
  payloadHashBytes: Buffer;
};

function isZero(value: string): boolean {
  return value === '0'.repeat(64);
}

function allowedLifecycleTransition(from: number, to: number): boolean {
  if (from === v2Lifecycles.open) {
    return [v2Lifecycles.in_progress, v2Lifecycles.disputed, v2Lifecycles.closed].some(
      (value) => value === to,
    );
  }
  if (from === v2Lifecycles.in_progress) {
    return [v2Lifecycles.resolved, v2Lifecycles.disputed, v2Lifecycles.closed].some(
      (value) => value === to,
    );
  }
  if (from === v2Lifecycles.resolved) {
    return [v2Lifecycles.disputed, v2Lifecycles.closed].some((value) => value === to);
  }
  if (from === v2Lifecycles.disputed) {
    return [
      v2Lifecycles.open,
      v2Lifecycles.in_progress,
      v2Lifecycles.resolved,
      v2Lifecycles.closed,
    ].some((value) => value === to);
  }
  return false;
}

function unchanged(
  expected: ChainJobEnvelope['expected'],
  next: ChainJobEnvelope['next'],
  fields: Array<keyof ChainJobEnvelope['expected']>,
): boolean {
  return fields.every((field) => expected[field] === next[field]);
}

function validateOperationSemantics(job: ChainJobEnvelope): void {
  const commonSnapshot = [
    'category',
    'lifecycle',
    'publicationRemoved',
    'metadataHash',
    'evidenceHash',
    'locationHash',
  ] satisfies Array<keyof ChainJobEnvelope['expected']>;

  if (job.operation === 'issue_created') {
    if (
      job.expected.updateCount !== 0 ||
      !isZero(job.expected.timelineHead) ||
      !isZero(job.expected.handoffHead) ||
      !isZero(job.expected.metadataHash) ||
      !isZero(job.expected.evidenceHash) ||
      !isZero(job.expected.locationHash) ||
      job.expected.publicationRemoved ||
      job.next.lifecycle !== v2Lifecycles.open ||
      job.next.publicationRemoved ||
      isZero(job.next.metadataHash) ||
      isZero(job.next.evidenceHash) ||
      isZero(job.next.locationHash)
    ) {
      throw new Error('chain_job_create_snapshot_invalid');
    }
    return;
  }

  if (job.expected.publicationRemoved) throw new Error('chain_job_issue_removed');
  if (job.operation === 'metadata_version_committed') {
    if (
      !unchanged(job.expected, job.next, ['lifecycle', 'publicationRemoved']) ||
      isZero(job.next.metadataHash) ||
      isZero(job.next.evidenceHash) ||
      isZero(job.next.locationHash)
    ) {
      throw new Error('chain_job_metadata_snapshot_invalid');
    }
    return;
  }
  if (job.operation === 'lifecycle_changed') {
    if (
      !unchanged(job.expected, job.next, [
        'category',
        'publicationRemoved',
        'metadataHash',
        'evidenceHash',
        'locationHash',
      ]) ||
      !allowedLifecycleTransition(job.expected.lifecycle, job.next.lifecycle)
    ) {
      throw new Error('chain_job_lifecycle_snapshot_invalid');
    }
    return;
  }
  if (job.operation === 'handoff_checkpointed') {
    if (!unchanged(job.expected, job.next, commonSnapshot)) {
      throw new Error('chain_job_handoff_snapshot_invalid');
    }
    return;
  }
  if (
    !job.next.publicationRemoved ||
    isZero(job.next.metadataHash) ||
    !unchanged(job.expected, job.next, ['category', 'lifecycle', 'evidenceHash', 'locationHash'])
  ) {
    throw new Error('chain_job_removal_snapshot_invalid');
  }
}

export function prepareChainJob(value: unknown): PreparedChainJob {
  const job = chainJobSchema.parse(value);
  const issueKeyBytes = deriveIssueKey(job.publicIssueId);
  if (issueKeyBytes.toString('hex') !== job.issueKey) {
    throw new Error('chain_job_issue_key_mismatch');
  }
  const eventIdBytes = deriveEventId({
    issueKey: issueKeyBytes,
    eventId: job.databaseEventId,
    operation: job.operation,
  });
  if (eventIdBytes.toString('hex') !== job.eventId) {
    throw new Error('chain_job_event_id_mismatch');
  }
  const operationIdBytes = deriveOperationId({
    issueKey: issueKeyBytes,
    eventId: eventIdBytes,
    operation: job.operation,
  });
  if (operationIdBytes.toString('hex') !== job.operationId) {
    throw new Error('chain_job_operation_id_mismatch');
  }
  if (
    job.next.updateCount !== job.expected.updateCount + 1 ||
    job.next.updateCount < 1 ||
    job.next.updateCount > Number(V2_MAX_SEQUENCE)
  ) {
    throw new Error('chain_job_sequence_mismatch');
  }
  if (isZero(job.payloadHash)) throw new Error('chain_job_payload_hash_zero');
  validateOperationSemantics(job);

  const recordHash = deriveEventRecordHash({
    issueKey: issueKeyBytes,
    eventId: eventIdBytes,
    eventType: v2Operations[job.operation],
    category: job.next.category,
    sequence: BigInt(job.next.updateCount),
    payloadHash: Buffer.from(job.payloadHash, 'hex'),
    metadataHash: Buffer.from(job.next.metadataHash, 'hex'),
    issueEvidenceHash: Buffer.from(job.next.evidenceHash, 'hex'),
    locationHash: Buffer.from(job.next.locationHash, 'hex'),
    lifecycle: job.next.lifecycle,
    publicationRemoved: job.next.publicationRemoved,
  });
  const stream = job.operation === 'handoff_checkpointed' ? 'handoff' : 'timeline';
  const expectedHead = stream === 'handoff' ? job.expected.handoffHead : job.expected.timelineHead;
  const derivedHead = deriveStreamHead({
    stream,
    previousHead: Buffer.from(expectedHead, 'hex'),
    eventId: eventIdBytes,
    eventType: v2Operations[job.operation],
    eventRecordHash: recordHash,
  }).toString('hex');
  if (
    (stream === 'timeline' &&
      (job.next.timelineHead !== derivedHead ||
        job.next.handoffHead !== job.expected.handoffHead)) ||
    (stream === 'handoff' &&
      (job.next.handoffHead !== derivedHead || job.next.timelineHead !== job.expected.timelineHead))
  ) {
    throw new Error('chain_job_head_mismatch');
  }

  return {
    ...job,
    issueKeyBytes,
    eventIdBytes,
    operationIdBytes,
    payloadHashBytes: Buffer.from(job.payloadHash, 'hex'),
  };
}

export function buildChainJob(input: {
  operation: V2Operation;
  publicIssueId: string;
  databaseEventId: string;
  payloadHash: string;
  expected: ChainJobEnvelope['expected'];
  next: Omit<ChainJobEnvelope['next'], 'updateCount' | 'timelineHead' | 'handoffHead'>;
}): ChainJobEnvelope {
  const issueKey = deriveIssueKey(input.publicIssueId);
  const eventId = deriveEventId({
    issueKey,
    eventId: input.databaseEventId,
    operation: input.operation,
  });
  const operationId = deriveOperationId({
    issueKey,
    eventId,
    operation: input.operation,
  });
  const nextCount = input.expected.updateCount + 1;
  const recordHash = deriveEventRecordHash({
    issueKey,
    eventId,
    eventType: v2Operations[input.operation],
    category: input.next.category,
    sequence: BigInt(nextCount),
    payloadHash: Buffer.from(input.payloadHash, 'hex'),
    metadataHash: Buffer.from(input.next.metadataHash, 'hex'),
    issueEvidenceHash: Buffer.from(input.next.evidenceHash, 'hex'),
    locationHash: Buffer.from(input.next.locationHash, 'hex'),
    lifecycle: input.next.lifecycle,
    publicationRemoved: input.next.publicationRemoved,
  });
  const stream = input.operation === 'handoff_checkpointed' ? 'handoff' : 'timeline';
  const nextHead = deriveStreamHead({
    stream,
    previousHead: Buffer.from(
      stream === 'handoff' ? input.expected.handoffHead : input.expected.timelineHead,
      'hex',
    ),
    eventId,
    eventType: v2Operations[input.operation],
    eventRecordHash: recordHash,
  }).toString('hex');
  return {
    schemaVersion: 'nagarik-chain-job-v2',
    operation: input.operation,
    publicIssueId: input.publicIssueId,
    databaseEventId: input.databaseEventId,
    issueKey: issueKey.toString('hex'),
    eventId: eventId.toString('hex'),
    operationId: operationId.toString('hex'),
    payloadHash: input.payloadHash,
    expected: input.expected,
    next: {
      ...input.next,
      updateCount: nextCount,
      timelineHead: stream === 'timeline' ? nextHead : input.expected.timelineHead,
      handoffHead: stream === 'handoff' ? nextHead : input.expected.handoffHead,
    },
  };
}

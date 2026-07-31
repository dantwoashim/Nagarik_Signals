import { deriveCommitmentEventPda, deriveIssuePda, v2Operations } from '../solana/v2/protocol';
import type { QueryExecutor } from '../db/query';
import { deterministicUuid } from '../security/ids';
import { prepareChainJob, type PreparedChainJob, type ChainJobEnvelope } from './chainJob';
import { ChainExecutionError, type ChainSigner, type ObservedCommitmentEvent } from './signer';

type ClaimedJob = {
  id: string;
  operation_id: Uint8Array;
  organization_id: string;
  issue_id: string;
  issue_version_id: string | null;
  operation_type: string;
  chain_sequence: number | string;
  event_id: Uint8Array;
  canonical_payload: unknown;
  payload_hash: Uint8Array;
  attempt_count: number;
  lease_owner: string;
};

export type ChainOutboxEnvelopeRecord = Pick<
  ClaimedJob,
  | 'operation_id'
  | 'operation_type'
  | 'chain_sequence'
  | 'event_id'
  | 'canonical_payload'
  | 'payload_hash'
>;

type WorkerJob = {
  row: ClaimedJob;
  protocol: PreparedChainJob;
};

export type ChainWorkerDependencies = {
  query: QueryExecutor;
  transaction<T>(operation: (query: QueryExecutor) => Promise<T>): Promise<T>;
  signer: ChainSigner;
  workerId: string;
  now?: () => Date;
};

export type OutboxBatchResult = {
  claimed: number;
  confirmed: number;
  submittedUnknown: number;
  retry: number;
  deadLetter: number;
};

function bytesHex(value: Uint8Array): string {
  return Buffer.from(value).toString('hex');
}

export function prepareChainOutboxRecord(row: ChainOutboxEnvelopeRecord): PreparedChainJob {
  const protocol = prepareChainJob(row.canonical_payload);
  if (
    row.operation_type !== protocol.operation ||
    bytesHex(row.operation_id) !== protocol.operationId ||
    bytesHex(row.event_id) !== protocol.eventId ||
    Number(row.chain_sequence) !== protocol.next.updateCount ||
    bytesHex(row.payload_hash) !== protocol.payloadHash
  ) {
    throw new Error('chain_outbox_record_mismatch');
  }
  return protocol;
}

function parseClaimedJob(row: ClaimedJob): WorkerJob {
  return { row, protocol: prepareChainOutboxRecord(row) };
}

export function chainObservationMatches(
  job: PreparedChainJob,
  observation: ObservedCommitmentEvent,
): boolean {
  const [issue] = deriveIssuePda(job.issueKeyBytes);
  const [event] = deriveCommitmentEventPda(issue, job.eventIdBytes);
  const selectedPreviousHead =
    job.operation === 'handoff_checkpointed' ? job.expected.handoffHead : job.expected.timelineHead;
  const selectedNewHead =
    job.operation === 'handoff_checkpointed' ? job.next.handoffHead : job.next.timelineHead;
  return (
    observation.issueAccount === issue.toBase58() &&
    observation.eventAccount === event.toBase58() &&
    observation.eventId === job.eventId &&
    observation.eventType === v2Operations[job.operation] &&
    observation.category === job.next.category &&
    observation.sequence === job.next.updateCount &&
    observation.previousHead === selectedPreviousHead &&
    observation.newHead === selectedNewHead &&
    observation.payloadHash === job.payloadHash &&
    observation.metadataHash === job.next.metadataHash &&
    observation.issueEvidenceHash === job.next.evidenceHash &&
    observation.locationHash === job.next.locationHash &&
    observation.lifecycle === job.next.lifecycle &&
    observation.publicationRemoved === job.next.publicationRemoved &&
    /^[1-9A-HJ-NP-Za-km-z]{64,96}$/.test(observation.signature) &&
    Number.isSafeInteger(observation.finalizedSlot) &&
    observation.finalizedSlot >= 0 &&
    /^[0-9a-f]{64}$/.test(observation.accountSha256)
  );
}

function attemptId(job: WorkerJob): string {
  return deterministicUuid('nagarik:v2:chain-attempt', `${job.row.id}:${job.row.attempt_count}`);
}

function claimedAttemptId(row: ClaimedJob): string {
  return deterministicUuid('nagarik:v2:chain-attempt', `${row.id}:${row.attempt_count}`);
}

async function recordInvalidClaim(
  row: ClaimedJob,
  dependencies: ChainWorkerDependencies,
): Promise<void> {
  const now = dependencies.now?.() ?? new Date();
  await dependencies.transaction(async (query) => {
    const locked = await query.query(
      `select state, lease_owner
       from nagarik.outbox_jobs
       where id = $1::uuid
       for update`,
      [row.id],
    );
    if (!locked[0] || locked[0].state !== 'leased' || locked[0].lease_owner !== row.lease_owner) {
      throw new Error('chain_outbox_lease_lost');
    }
    await query.query(
      `insert into nagarik.outbox_attempts(
         id, outbox_job_id, attempt_number, result, error_category,
         diagnostic, started_at, finished_at
       )
       values (
         $1::uuid, $2::uuid, $3, 'failure', 'chain_outbox_record_invalid',
         $4::jsonb, $5::timestamptz, $5::timestamptz
       )`,
      [
        claimedAttemptId(row),
        row.id,
        row.attempt_count,
        JSON.stringify({ phase: 'claim_validation' }),
        now.toISOString(),
      ],
    );
    await query.query(
      `update nagarik.outbox_jobs
       set
         state = 'dead_letter',
         lease_owner = null,
         lease_expires_at = null,
         last_error_category = 'chain_outbox_record_invalid',
         updated_at = $2::timestamptz
       where id = $1::uuid`,
      [row.id, now.toISOString()],
    );
    await query.query(
      `update nagarik.issues
       set blocked_from_sequence = coalesce(blocked_from_sequence, $2), updated_at = $3::timestamptz
       where id = $1::uuid`,
      [row.issue_id, row.chain_sequence, now.toISOString()],
    );
  });
}

async function recordFailure(
  job: WorkerJob,
  category: string,
  retryable: boolean,
  dependencies: ChainWorkerDependencies,
): Promise<'retry' | 'deadLetter'> {
  const now = dependencies.now?.() ?? new Date();
  const deadLetter = !retryable || job.row.attempt_count >= 8;
  await dependencies.transaction(async (query) => {
    const locked = await query.query(
      `select state, lease_owner
       from nagarik.outbox_jobs
       where id = $1::uuid
       for update`,
      [job.row.id],
    );
    if (
      !locked[0] ||
      locked[0].state !== 'leased' ||
      locked[0].lease_owner !== job.row.lease_owner
    ) {
      throw new Error('chain_outbox_lease_lost');
    }
    await query.query(
      `insert into nagarik.outbox_attempts(
         id, outbox_job_id, attempt_number, result, error_category,
         diagnostic, started_at, finished_at
       )
       values (
         $1::uuid, $2::uuid, $3, 'failure', $4,
         $5::jsonb, $6::timestamptz, $6::timestamptz
       )`,
      [
        attemptId(job),
        job.row.id,
        job.row.attempt_count,
        category,
        JSON.stringify({ phase: 'pre_submit' }),
        now.toISOString(),
      ],
    );
    await query.query(
      `update nagarik.outbox_jobs
       set
         state = $2,
         available_at = $3::timestamptz,
         lease_owner = null,
         lease_expires_at = null,
         last_error_category = $4,
         updated_at = $5::timestamptz
       where id = $1::uuid`,
      [
        job.row.id,
        deadLetter ? 'dead_letter' : 'pending',
        new Date(now.getTime() + Math.min(300_000, 2 ** job.row.attempt_count * 1_000)),
        category,
        now.toISOString(),
      ],
    );
    if (deadLetter) {
      await query.query(
        `update nagarik.issues
         set blocked_from_sequence = coalesce(blocked_from_sequence, $2), updated_at = $3::timestamptz
         where id = $1::uuid`,
        [job.row.issue_id, job.protocol.next.updateCount, now.toISOString()],
      );
    }
  });
  return deadLetter ? 'deadLetter' : 'retry';
}

async function markSubmitted(
  job: WorkerJob,
  signature: string,
  dependencies: ChainWorkerDependencies,
): Promise<void> {
  const now = dependencies.now?.() ?? new Date();
  await dependencies.transaction(async (query) => {
    const rows = await query.query(
      `update nagarik.outbox_jobs
       set
         state = 'confirming',
         submitted_signature = $4,
         available_at = $5::timestamptz,
         lease_owner = null,
         lease_expires_at = null,
         last_error_category = null,
         updated_at = $3::timestamptz
       where id = $1::uuid
         and state = 'leased'
         and lease_owner = $2
       returning id`,
      [
        job.row.id,
        job.row.lease_owner,
        now.toISOString(),
        signature,
        new Date(now.getTime() + 60_000).toISOString(),
      ],
    );
    if (!rows[0]) throw new Error('chain_outbox_lease_lost');
  });
}

async function recordSubmittedUnknown(
  job: WorkerJob,
  signature: string,
  dependencies: ChainWorkerDependencies,
): Promise<void> {
  const now = dependencies.now?.() ?? new Date();
  await dependencies.transaction(async (query) => {
    const rows = await query.query(
      `update nagarik.outbox_jobs
       set
         state = 'submitted_unknown',
         available_at = $3::timestamptz,
         last_error_category = 'confirmation_timeout',
         updated_at = $2::timestamptz
       where id = $1::uuid
         and state = 'confirming'
         and submitted_signature = $4
       returning id`,
      [
        job.row.id,
        now.toISOString(),
        new Date(now.getTime() + Math.min(300_000, 2 ** job.row.attempt_count * 1_000)),
        signature,
      ],
    );
    if (!rows[0]) throw new Error('chain_outbox_confirmation_state_lost');
    await query.query(
      `insert into nagarik.outbox_attempts(
         id, outbox_job_id, attempt_number, result, signature, error_category,
         diagnostic, started_at, finished_at
       )
       values (
         $1::uuid, $2::uuid, $3, 'submitted_unknown', $4, 'confirmation_timeout',
         $5::jsonb, $6::timestamptz, $6::timestamptz
       )`,
      [
        attemptId(job),
        job.row.id,
        job.row.attempt_count,
        signature,
        JSON.stringify({ phase: 'confirmation' }),
        now.toISOString(),
      ],
    );
  });
}

async function recordPostSubmitConflict(
  job: WorkerJob,
  signature: string,
  category: string,
  dependencies: ChainWorkerDependencies,
): Promise<void> {
  const now = dependencies.now?.() ?? new Date();
  await dependencies.transaction(async (query) => {
    const locked = await query.query(
      `select state, submitted_signature
       from nagarik.outbox_jobs
       where id = $1::uuid
       for update`,
      [job.row.id],
    );
    if (
      !locked[0] ||
      locked[0].state !== 'confirming' ||
      locked[0].submitted_signature !== signature
    ) {
      throw new Error('chain_outbox_confirmation_state_lost');
    }
    await query.query(
      `insert into nagarik.outbox_attempts(
         id, outbox_job_id, attempt_number, result, signature, error_category,
         diagnostic, started_at, finished_at
       )
       values (
         $1::uuid, $2::uuid, $3, 'failure', $4, $5,
         $6::jsonb, $7::timestamptz, $7::timestamptz
       )`,
      [
        attemptId(job),
        job.row.id,
        job.row.attempt_count,
        signature,
        category,
        JSON.stringify({ phase: 'post_submit' }),
        now.toISOString(),
      ],
    );
    await query.query(
      `update nagarik.outbox_jobs
       set
         state = 'dead_letter',
         last_error_category = $2,
         updated_at = $3::timestamptz
       where id = $1::uuid`,
      [job.row.id, category, now.toISOString()],
    );
    await query.query(
      `update nagarik.issues
       set blocked_from_sequence = coalesce(blocked_from_sequence, $2), updated_at = $3::timestamptz
       where id = $1::uuid`,
      [job.row.issue_id, job.protocol.next.updateCount, now.toISOString()],
    );
  });
}

async function finalizeConfirmed(
  job: WorkerJob,
  observation: ObservedCommitmentEvent,
  dependencies: ChainWorkerDependencies,
  reconciled: boolean,
): Promise<void> {
  const now = dependencies.now?.() ?? new Date();
  await dependencies.transaction(async (query) => {
    const locked = await query.query(
      `select state, lease_owner, submitted_signature
       from nagarik.outbox_jobs
       where id = $1::uuid
       for update`,
      [job.row.id],
    );
    const row = locked[0];
    const ownedLease = row?.state === 'leased' && row.lease_owner === job.row.lease_owner;
    const submitted =
      row?.state === 'confirming' && row.submitted_signature === observation.signature;
    if (!ownedLease && !submitted) throw new Error('chain_outbox_confirmation_state_lost');

    const issueState = await query.query(
      `select confirmed_update_count, confirmed_timeline_head, confirmed_handoff_head
       from nagarik.issues
       where id = $1::uuid
       for update`,
      [job.row.issue_id],
    );
    const issue = issueState[0];
    if (!issue) throw new Error('chain_issue_missing');
    const currentCount = Number(issue.confirmed_update_count);
    const currentTimeline = bytesHex(issue.confirmed_timeline_head as Uint8Array);
    const currentHandoff = bytesHex(issue.confirmed_handoff_head as Uint8Array);
    const atExpected =
      currentCount === job.protocol.expected.updateCount &&
      currentTimeline === job.protocol.expected.timelineHead &&
      currentHandoff === job.protocol.expected.handoffHead;
    const atNext =
      currentCount === job.protocol.next.updateCount &&
      currentTimeline === job.protocol.next.timelineHead &&
      currentHandoff === job.protocol.next.handoffHead;
    if (!atExpected && !atNext) throw new Error('chain_confirmation_db_head_conflict');
    if (atExpected) {
      await query.query(
        `update nagarik.issues
         set
           confirmed_update_count = $2,
           confirmed_timeline_head = decode($3, 'hex'),
           confirmed_handoff_head = decode($4, 'hex'),
           updated_at = $5::timestamptz
         where id = $1::uuid`,
        [
          job.row.issue_id,
          job.protocol.next.updateCount,
          job.protocol.next.timelineHead,
          job.protocol.next.handoffHead,
          now.toISOString(),
        ],
      );
    }

    await query.query(
      `insert into nagarik.issue_chain_bindings(
         id, issue_id, issue_version_id, protocol_version, cluster, genesis_hash,
         program_id, issue_account, event_account, event_id, chain_sequence,
         signature, finalized_slot, account_sha256, confirmed_at, created_at
       )
       values (
         $1::uuid, $2::uuid, $3::uuid, 'v2', $4, $5,
         $6, $7, $8, decode($9, 'hex'), $10,
         $11, $12, decode($13, 'hex'), $14::timestamptz, $14::timestamptz
       )
       on conflict (protocol_version, event_id)
       where protocol_version = 'v2' and event_id is not null
       do nothing`,
      [
        deterministicUuid('nagarik:v2:chain-binding', job.protocol.operationId),
        job.row.issue_id,
        job.row.issue_version_id,
        dependencies.signer.profile.cluster,
        dependencies.signer.profile.genesisHash,
        dependencies.signer.profile.programId,
        observation.issueAccount,
        observation.eventAccount,
        observation.eventId,
        observation.sequence,
        observation.signature,
        observation.finalizedSlot,
        observation.accountSha256,
        now.toISOString(),
      ],
    );
    const bindings = await query.query(
      `select
         cluster,
         genesis_hash,
         program_id,
         issue_account,
         event_account,
         encode(event_id, 'hex') as event_id,
         chain_sequence,
         signature,
         finalized_slot,
         encode(account_sha256, 'hex') as account_sha256
       from nagarik.issue_chain_bindings
       where protocol_version = 'v2'
         and event_id = decode($1, 'hex')`,
      [observation.eventId],
    );
    const binding = bindings[0];
    if (
      !binding ||
      binding.cluster !== dependencies.signer.profile.cluster ||
      binding.genesis_hash !== dependencies.signer.profile.genesisHash ||
      binding.program_id !== dependencies.signer.profile.programId ||
      binding.issue_account !== observation.issueAccount ||
      binding.event_account !== observation.eventAccount ||
      binding.event_id !== observation.eventId ||
      Number(binding.chain_sequence) !== observation.sequence ||
      binding.signature !== observation.signature ||
      Number(binding.finalized_slot) !== observation.finalizedSlot ||
      binding.account_sha256 !== observation.accountSha256
    ) {
      throw new Error('chain_confirmation_binding_conflict');
    }
    await query.query(
      `insert into nagarik.outbox_attempts(
         id, outbox_job_id, attempt_number, result, signature,
         diagnostic, started_at, finished_at
       )
       values (
         $1::uuid, $2::uuid, $3, $4, $5,
         $6::jsonb, $7::timestamptz, $7::timestamptz
       )`,
      [
        attemptId(job),
        job.row.id,
        job.row.attempt_count,
        reconciled ? 'reconciled_confirmed' : 'confirmed',
        observation.signature,
        JSON.stringify({ finalizedSlot: observation.finalizedSlot }),
        now.toISOString(),
      ],
    );
    await query.query(
      `update nagarik.outbox_jobs
       set
         state = 'confirmed',
         submitted_signature = coalesce(submitted_signature, $2),
         lease_owner = null,
         lease_expires_at = null,
         last_error_category = null,
         updated_at = $3::timestamptz
       where id = $1::uuid`,
      [job.row.id, observation.signature, now.toISOString()],
    );
    await query.query(
      `update nagarik.issues
       set
         blocked_from_sequence = (
           select min(blocked.chain_sequence)
           from nagarik.outbox_jobs blocked
           where blocked.issue_id = nagarik.issues.id
             and blocked.state in ('blocked', 'dead_letter')
         ),
         updated_at = $2::timestamptz
       where id = $1::uuid`,
      [job.row.issue_id, now.toISOString()],
    );
  });
}

async function processJob(
  job: WorkerJob,
  dependencies: ChainWorkerDependencies,
): Promise<keyof Omit<OutboxBatchResult, 'claimed'>> {
  let existing: ObservedCommitmentEvent | null;
  try {
    existing = await dependencies.signer.inspect(job.protocol);
  } catch (error) {
    const known = error instanceof ChainExecutionError ? error : null;
    return recordFailure(
      job,
      known?.category ?? 'chain_inspection_unavailable',
      known?.retryable ?? true,
      dependencies,
    );
  }
  if (existing) {
    if (!chainObservationMatches(job.protocol, existing)) {
      return recordFailure(job, 'chain_event_conflict', false, dependencies);
    }
    try {
      await finalizeConfirmed(job, existing, dependencies, true);
    } catch {
      return recordFailure(job, 'chain_confirmation_db_conflict', false, dependencies);
    }
    return 'confirmed';
  }

  let signature: string;
  try {
    signature = await dependencies.signer.submit(job.protocol);
  } catch (error) {
    const known = error instanceof ChainExecutionError ? error : null;
    return recordFailure(
      job,
      known?.category ?? 'chain_submit_failed',
      known?.retryable ?? true,
      dependencies,
    );
  }
  try {
    await markSubmitted(job, signature, dependencies);
  } catch {
    return recordFailure(job, 'chain_submission_persistence_failed', true, dependencies);
  }

  let confirmed: ObservedCommitmentEvent | null;
  try {
    confirmed = await dependencies.signer.confirm(job.protocol, signature);
  } catch {
    confirmed = null;
  }
  if (!confirmed) {
    await recordSubmittedUnknown(job, signature, dependencies);
    return 'submittedUnknown';
  }
  if (!chainObservationMatches(job.protocol, confirmed)) {
    await recordPostSubmitConflict(job, signature, 'chain_event_conflict', dependencies);
    return 'deadLetter';
  }
  try {
    await finalizeConfirmed(job, confirmed, dependencies, false);
  } catch {
    await recordPostSubmitConflict(job, signature, 'chain_confirmation_db_conflict', dependencies);
    return 'deadLetter';
  }
  return 'confirmed';
}

export async function reconcileExactChainOutboxJob(
  dependencies: ChainWorkerDependencies,
  outboxId: string,
  observation: ObservedCommitmentEvent,
): Promise<'confirmed' | 'alreadyConfirmed' | 'busy' | 'deadLetter'> {
  const now = dependencies.now?.() ?? new Date();
  const leaseOwner = `${dependencies.workerId}:reconcile`.slice(0, 120);
  const rows = (await dependencies.query.query(
    `update nagarik.outbox_jobs
     set
       state = 'leased',
       lease_owner = $2,
       lease_expires_at = $3::timestamptz,
       attempt_count = attempt_count + 1,
       updated_at = $4::timestamptz
     where id = $1::uuid
       and (
         state in (
           'pending', 'submitted_unknown', 'confirming', 'confirmed', 'blocked', 'dead_letter'
         )
         or (state = 'leased' and lease_expires_at <= $4::timestamptz)
       )
     returning *`,
    [outboxId, leaseOwner, new Date(now.getTime() + 60_000).toISOString(), now.toISOString()],
  )) as ClaimedJob[];
  const row = rows[0];
  if (!row) {
    const state = await dependencies.query.query(
      `select state from nagarik.outbox_jobs where id = $1::uuid`,
      [outboxId],
    );
    return state[0]?.state === 'confirmed' ? 'alreadyConfirmed' : 'busy';
  }

  let job: WorkerJob;
  try {
    job = parseClaimedJob(row);
  } catch {
    await recordInvalidClaim(row, dependencies);
    return 'deadLetter';
  }
  if (!chainObservationMatches(job.protocol, observation)) {
    await recordFailure(job, 'chain_event_conflict', false, dependencies);
    return 'deadLetter';
  }
  try {
    await finalizeConfirmed(job, observation, dependencies, true);
    return 'confirmed';
  } catch {
    await recordFailure(job, 'chain_confirmation_db_conflict', false, dependencies);
    return 'deadLetter';
  }
}

export async function processChainOutboxBatch(
  dependencies: ChainWorkerDependencies,
  requestedLimit = 10,
): Promise<OutboxBatchResult> {
  const normalizedLimit = Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 10;
  const limit = Math.min(Math.max(normalizedLimit, 1), 25);
  const rows = (await dependencies.query.query(
    `select *
     from nagarik.claim_chain_outbox_jobs($1, $2, 60)`,
    [dependencies.workerId, limit],
  )) as ClaimedJob[];
  const result: OutboxBatchResult = {
    claimed: rows.length,
    confirmed: 0,
    submittedUnknown: 0,
    retry: 0,
    deadLetter: 0,
  };
  for (const row of rows) {
    let job: WorkerJob;
    try {
      job = parseClaimedJob(row);
    } catch {
      await recordInvalidClaim(row, dependencies);
      result.deadLetter += 1;
      continue;
    }
    const outcome = await processJob(job, dependencies);
    result[outcome] += 1;
  }
  return result;
}

export function createObservedEvent(
  job: ChainJobEnvelope,
  input: {
    signature: string;
    finalizedSlot: number;
    accountSha256: string;
  },
): ObservedCommitmentEvent {
  const prepared = prepareChainJob(job);
  const [issue] = deriveIssuePda(prepared.issueKeyBytes);
  const [event] = deriveCommitmentEventPda(issue, prepared.eventIdBytes);
  return {
    issueAccount: issue.toBase58(),
    eventAccount: event.toBase58(),
    eventId: prepared.eventId,
    eventType: v2Operations[prepared.operation],
    category: prepared.next.category,
    sequence: prepared.next.updateCount,
    previousHead:
      prepared.operation === 'handoff_checkpointed'
        ? prepared.expected.handoffHead
        : prepared.expected.timelineHead,
    newHead:
      prepared.operation === 'handoff_checkpointed'
        ? prepared.next.handoffHead
        : prepared.next.timelineHead,
    payloadHash: prepared.payloadHash,
    metadataHash: prepared.next.metadataHash,
    issueEvidenceHash: prepared.next.evidenceHash,
    locationHash: prepared.next.locationHash,
    lifecycle: prepared.next.lifecycle,
    publicationRemoved: prepared.next.publicationRemoved,
    ...input,
  };
}

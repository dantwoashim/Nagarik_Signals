import { createHash } from 'node:crypto';

import { z } from 'zod';

import { buildChainJob } from '../chain/chainJob';
import {
  assertHandoffTransition,
  handoffStates,
  type HandoffState,
  WorkflowStateError,
} from '../domain/workflow';
import { canonicalize } from '../proof/canonicalize';
import { deterministicUuid, deterministicUuidV4 } from '../security/ids';
import { v2Categories, v2Lifecycles } from '../solana/v2/protocol';
import {
  completeOperatorMutation,
  OperatorMutationError,
  reserveOperatorMutation,
  type OperatorMutationActor,
  type OperatorMutationDependencies,
} from './operatorMutation';

const handoffInputSchema = z
  .object({
    expectedDomainVersion: z.number().int().positive(),
    expectedHandoffHead: z.string().regex(/^[0-9a-f]{64}$/),
    eventType: z.enum([...handoffStates, 'action_recorded']),
    authorityName: z.string().trim().min(2).max(120),
    channelName: z.string().trim().min(2).max(120),
    channelUrl: z.string().url().startsWith('https://').max(500).nullable().optional(),
    externalReference: z.string().trim().min(2).max(160).nullable().optional(),
    publicNote: z.string().trim().min(1).max(1_000).nullable().optional(),
    occurredAt: z.string().datetime({ offset: true }),
    followUpDueAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.eventType === 'prepared' && value.externalReference) {
      context.addIssue({
        code: 'custom',
        path: ['eventType'],
        message: 'prepared cannot claim delivery evidence',
      });
    }
    if (value.eventType === 'sent' && (!value.externalReference || !value.followUpDueAt)) {
      context.addIssue({
        code: 'custom',
        path: ['eventType'],
        message: 'sent requires evidence and follow-up',
      });
    }
    if (value.eventType === 'acknowledged' && !value.externalReference) {
      context.addIssue({
        code: 'custom',
        path: ['externalReference'],
        message: 'acknowledgement requires an official reference',
      });
    }
    if (
      ['closed', 'failed', 'action_recorded'].includes(value.eventType) &&
      (value.publicNote?.length ?? 0) < 8
    ) {
      context.addIssue({
        code: 'custom',
        path: ['publicNote'],
        message: 'a substantive public note is required',
      });
    }
  });

export type HandoffInput = z.infer<typeof handoffInputSchema>;

export type HandoffResult = {
  replayed: boolean;
  publicId: string;
  state: HandoffState;
  cycleId: string;
  domainVersion: number;
  chainSequence: number;
  handoffHead: string;
};

type StableHandoffResult = Omit<HandoffResult, 'replayed'>;

export class HandoffError extends Error {
  constructor(
    public readonly code: 'handoff_invalid' | 'handoff_transition_invalid',
    public readonly status: 400 | 409,
  ) {
    super(code);
    this.name = 'HandoffError';
  }
}

export function parseHandoffInput(value: unknown): HandoffInput {
  const result = handoffInputSchema.safeParse(value);
  if (!result.success) throw new HandoffError('handoff_invalid', 400);
  return result.data;
}

function bytesHex(value: unknown): string {
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
  if (typeof value === 'string') return value.replace(/^\\x/, '');
  throw new Error('database_hash_invalid');
}

function hash(value: unknown): string {
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}

function stableResult(value: unknown): StableHandoffResult {
  if (!value || typeof value !== 'object') throw new Error('stored_handoff_response_invalid');
  return value as StableHandoffResult;
}

export async function recordIssueHandoff(
  input: {
    publicId: string;
    idempotencyKey: string;
    actor: OperatorMutationActor;
    handoff: HandoffInput;
  },
  dependencies: OperatorMutationDependencies,
): Promise<HandoffResult> {
  const now = dependencies.now?.() ?? new Date();
  const result = await dependencies.transaction(async (query) => {
    const reservation = await reserveOperatorMutation<StableHandoffResult>(query, {
      scope: `operator:handoff:${input.publicId}`,
      actor: input.actor,
      idempotencyKey: input.idempotencyKey,
      request: input.handoff,
      correlationKey: dependencies.correlationKey,
      now,
    });
    if (reservation.disposition === 'replay') {
      return { replayed: true, value: stableResult(reservation.response) };
    }
    const switches = await query.query(
      `select nagarik.is_capability_enabled('operatorMutationsEnabled') as enabled`,
    );
    if (switches[0]?.enabled !== true) {
      throw new OperatorMutationError('operator_mutations_disabled', 503);
    }

    const issueRows = await query.query(
      `select
         issue.id as issue_id,
         issue.public_id,
         issue.publication_state,
         issue.lifecycle,
         issue.domain_version,
         issue.checkpoint_update_count,
         issue.projected_timeline_head,
         issue.projected_handoff_head,
         issue.blocked_from_sequence,
         version.id as version_id,
         version.category,
         version.metadata_hash,
         version.evidence_hash,
         version.location_hash
       from nagarik.issues issue
       join nagarik.issue_versions version on version.id = issue.current_version_id
       where issue.public_id = $1::uuid
         and issue.organization_id = $2::uuid
         and issue.workflow_version = 'v2'
       for update of issue`,
      [input.publicId, input.actor.organizationId],
    );
    const issue = issueRows[0];
    if (!issue) throw new OperatorMutationError('resource_not_found', 404);
    if (issue.publication_state !== 'published' || issue.blocked_from_sequence !== null) {
      throw new OperatorMutationError('workflow_conflict', 409);
    }
    const aggregateRows = await query.query(
      `select *
       from nagarik.handoff_aggregates
       where issue_id = $1::uuid
       for update`,
      [String(issue.issue_id)],
    );
    const aggregate = aggregateRows[0] ?? null;
    const currentState = aggregate?.state ? (String(aggregate.state) as HandoffState) : null;
    const nextState =
      input.handoff.eventType === 'action_recorded'
        ? currentState
        : (input.handoff.eventType as HandoffState);
    if (!nextState) throw new HandoffError('handoff_transition_invalid', 409);
    try {
      if (input.handoff.eventType === 'action_recorded') {
        if (currentState !== 'acknowledged' && currentState !== 'closed') {
          throw new WorkflowStateError('handoff_transition_invalid');
        }
      } else {
        assertHandoffTransition(currentState, nextState);
      }
    } catch (error) {
      if (error instanceof WorkflowStateError) {
        throw new HandoffError('handoff_transition_invalid', 409);
      }
      throw error;
    }
    const domainVersion = Number(issue.domain_version);
    const projectedHandoffHead = bytesHex(issue.projected_handoff_head);
    if (
      domainVersion !== input.handoff.expectedDomainVersion ||
      projectedHandoffHead !== input.handoff.expectedHandoffHead
    ) {
      throw new OperatorMutationError('stale_resource_version', 409);
    }

    const identity = `${input.publicId}:${input.idempotencyKey}`;
    const eventId = deterministicUuidV4('nagarik:v2:handoff-event', identity);
    const cycleId = aggregate?.active_cycle_id
      ? String(aggregate.active_cycle_id)
      : deterministicUuidV4('nagarik:v2:handoff-cycle', `${input.publicId}:${domainVersion}`);
    const privateSequence = Number(aggregate?.private_sequence ?? 0) + 1;
    const publicSequence = Number(aggregate?.public_sequence ?? 0) + 1;
    const privateEvent = {
      schemaVersion: 'nagarik-handoff-private-v1',
      cycleId,
      eventType: input.handoff.eventType,
      authorityName: input.handoff.authorityName,
      channelName: input.handoff.channelName,
      channelUrl: input.handoff.channelUrl ?? null,
      externalReference: input.handoff.externalReference ?? null,
      publicNote: input.handoff.publicNote ?? null,
      occurredAt: input.handoff.occurredAt,
      followUpDueAt: input.handoff.followUpDueAt ?? null,
      previousPrivateHead: aggregate ? bytesHex(aggregate.private_head) : '0'.repeat(64),
      privateSequence,
    };
    const privateHead = hash(privateEvent);
    const publicEvent = {
      schemaVersion: 'nagarik-handoff-event-v1',
      cycleId,
      sequence: publicSequence,
      state: nextState,
      eventType: input.handoff.eventType,
      authorityName: input.handoff.authorityName,
      channelName: input.handoff.channelName,
      channelUrl: input.handoff.channelUrl ?? null,
      externalReference: input.handoff.externalReference ?? null,
      publicNote: input.handoff.publicNote ?? null,
      occurredAt: input.handoff.occurredAt,
      followUpDueAt: input.handoff.followUpDueAt ?? null,
      evidenceBasis: input.handoff.externalReference ? 'external_reference' : 'route_only',
    };
    const payloadHash = hash({ publicEvent, privateHead });
    const category = issue.category as keyof typeof v2Categories;
    const lifecycle = issue.lifecycle as keyof typeof v2Lifecycles;
    const chainJob = buildChainJob({
      operation: 'handoff_checkpointed',
      publicIssueId: input.publicId,
      databaseEventId: eventId,
      payloadHash,
      expected: {
        updateCount: Number(issue.checkpoint_update_count),
        timelineHead: bytesHex(issue.projected_timeline_head),
        handoffHead: projectedHandoffHead,
        category: v2Categories[category],
        lifecycle: v2Lifecycles[lifecycle],
        publicationRemoved: false,
        metadataHash: bytesHex(issue.metadata_hash),
        evidenceHash: bytesHex(issue.evidence_hash),
        locationHash: bytesHex(issue.location_hash),
      },
      next: {
        category: v2Categories[category],
        lifecycle: v2Lifecycles[lifecycle],
        publicationRemoved: false,
        metadataHash: bytesHex(issue.metadata_hash),
        evidenceHash: bytesHex(issue.evidence_hash),
        locationHash: bytesHex(issue.location_hash),
      },
    });
    const nextDomainVersion = domainVersion + 1;
    const outboxId = deterministicUuid('nagarik:v2:handoff-outbox', eventId);

    await query.query(
      `insert into nagarik.handoff_events(
         id, issue_id, cycle_id, private_sequence, public_sequence,
         event_type, private_event, public_event, private_head,
         chain_sequence, checkpoint_state, created_by, created_at
       )
       values (
         $1::uuid, $2::uuid, $3::uuid, $4, $5,
         $6, $7::jsonb, $8::jsonb, decode($9, 'hex'),
         $10, 'pending', $11::uuid, $12::timestamptz
       )`,
      [
        eventId,
        String(issue.issue_id),
        cycleId,
        privateSequence,
        publicSequence,
        input.handoff.eventType,
        JSON.stringify(privateEvent),
        JSON.stringify(publicEvent),
        privateHead,
        chainJob.next.updateCount,
        input.actor.subjectId,
        now.toISOString(),
      ],
    );
    await query.query(
      `insert into nagarik.handoff_aggregates(
         issue_id, private_sequence, private_head, public_sequence,
         active_cycle_id, state, version, updated_at
       )
       values (
         $1::uuid, $2, decode($3, 'hex'), $4,
         $5::uuid, $6, 1, $7::timestamptz
       )
       on conflict (issue_id) do update set
         private_sequence = excluded.private_sequence,
         private_head = excluded.private_head,
         public_sequence = excluded.public_sequence,
         active_cycle_id = excluded.active_cycle_id,
         state = excluded.state,
         version = nagarik.handoff_aggregates.version + 1,
         updated_at = excluded.updated_at`,
      [
        String(issue.issue_id),
        privateSequence,
        privateHead,
        publicSequence,
        cycleId,
        nextState,
        now.toISOString(),
      ],
    );
    await query.query(
      `update nagarik.issues
       set
         domain_version = $2,
         checkpoint_update_count = $3,
         projected_timeline_head = decode($4, 'hex'),
         projected_handoff_head = decode($5, 'hex'),
         updated_at = $6::timestamptz
       where id = $1::uuid`,
      [
        String(issue.issue_id),
        nextDomainVersion,
        chainJob.next.updateCount,
        chainJob.next.timelineHead,
        chainJob.next.handoffHead,
        now.toISOString(),
      ],
    );
    await query.query(
      `insert into nagarik.outbox_jobs(
         id, operation_id, organization_id, issue_id, issue_version_id,
         operation_type, chain_sequence, event_id, canonical_payload,
         payload_hash, state, available_at, created_at, updated_at
       )
       values (
         $1::uuid, decode($2, 'hex'), $3::uuid, $4::uuid, $5::uuid,
         $6, $7, decode($8, 'hex'), $9::jsonb,
         decode($10, 'hex'), 'pending', $11::timestamptz, $11::timestamptz, $11::timestamptz
       )`,
      [
        outboxId,
        chainJob.operationId,
        input.actor.organizationId,
        String(issue.issue_id),
        String(issue.version_id),
        chainJob.operation,
        chainJob.next.updateCount,
        chainJob.eventId,
        JSON.stringify(chainJob),
        chainJob.payloadHash,
        now.toISOString(),
      ],
    );
    const auditId = deterministicUuid('nagarik:v2:handoff-audit', eventId);
    const requestId = deterministicUuidV4('nagarik:v2:handoff-request', identity);
    await query.query(
      `insert into nagarik.audit_events(
         id, organization_id, actor_type, actor_key, action,
         resource_type, resource_id, request_id, detail, occurred_at
       )
       values (
         $1::uuid, $2::uuid, 'operator', decode($3, 'hex'), 'handoff_recorded',
         'issue', $4::uuid, $5::uuid, $6::jsonb, $7::timestamptz
       )`,
      [
        auditId,
        input.actor.organizationId,
        reservation.actorKey,
        String(issue.issue_id),
        requestId,
        JSON.stringify({
          cycleId,
          eventType: input.handoff.eventType,
          state: nextState,
          chainSequence: chainJob.next.updateCount,
        }),
        now.toISOString(),
      ],
    );
    const response: StableHandoffResult = {
      publicId: input.publicId,
      state: nextState,
      cycleId,
      domainVersion: nextDomainVersion,
      chainSequence: chainJob.next.updateCount,
      handoffHead: chainJob.next.handoffHead,
    };
    await completeOperatorMutation(query, {
      recordId: reservation.recordId,
      requestHash: reservation.requestHash,
      status: 202,
      response,
      resourceId: String(issue.issue_id),
    });
    return { replayed: false, value: response };
  });
  return { replayed: result.replayed, ...result.value };
}

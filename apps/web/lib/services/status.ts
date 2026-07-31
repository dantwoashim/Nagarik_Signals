import { createHash } from 'node:crypto';

import { z } from 'zod';

import { buildChainJob } from '../chain/chainJob';
import {
  assertLifecycleTransition,
  lifecycleStates,
  type LifecycleState,
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

const lifecycleInputSchema = z
  .object({
    expectedDomainVersion: z.number().int().positive(),
    expectedTimelineHead: z.string().regex(/^[0-9a-f]{64}$/),
    toState: z.enum(lifecycleStates),
    reasonCode: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
    publicNote: z.string().trim().min(1).max(500).nullable().optional(),
    observedAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict();

export type LifecycleInput = z.infer<typeof lifecycleInputSchema>;

export type LifecycleResult = {
  replayed: boolean;
  publicId: string;
  lifecycle: LifecycleState;
  domainVersion: number;
  chainSequence: number;
  timelineHead: string;
};

type StableLifecycleResult = Omit<LifecycleResult, 'replayed'>;

export class LifecycleError extends Error {
  constructor(
    public readonly code: 'lifecycle_invalid' | 'lifecycle_transition_invalid',
    public readonly status: 400 | 409,
  ) {
    super(code);
    this.name = 'LifecycleError';
  }
}

export function parseLifecycleInput(value: unknown): LifecycleInput {
  const result = lifecycleInputSchema.safeParse(value);
  if (!result.success) throw new LifecycleError('lifecycle_invalid', 400);
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

function stableResult(value: unknown): StableLifecycleResult {
  if (!value || typeof value !== 'object') throw new Error('stored_lifecycle_response_invalid');
  return value as StableLifecycleResult;
}

export async function changeIssueLifecycle(
  input: {
    publicId: string;
    idempotencyKey: string;
    actor: OperatorMutationActor;
    change: LifecycleInput;
  },
  dependencies: OperatorMutationDependencies,
): Promise<LifecycleResult> {
  const now = dependencies.now?.() ?? new Date();
  const result = await dependencies.transaction(async (query) => {
    const reservation = await reserveOperatorMutation<StableLifecycleResult>(query, {
      scope: `operator:lifecycle:${input.publicId}`,
      actor: input.actor,
      idempotencyKey: input.idempotencyKey,
      request: input.change,
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

    const rows = await query.query(
      `select
         issue.id as issue_id,
         issue.public_id,
         issue.organization_id,
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
    const row = rows[0];
    if (!row) throw new OperatorMutationError('resource_not_found', 404);
    if (row.publication_state !== 'published' || row.blocked_from_sequence !== null) {
      throw new OperatorMutationError('workflow_conflict', 409);
    }
    const domainVersion = Number(row.domain_version);
    const timelineHead = bytesHex(row.projected_timeline_head);
    if (
      domainVersion !== input.change.expectedDomainVersion ||
      timelineHead !== input.change.expectedTimelineHead
    ) {
      throw new OperatorMutationError('stale_resource_version', 409);
    }
    const current = row.lifecycle as LifecycleState;
    try {
      assertLifecycleTransition(current, input.change.toState);
    } catch (error) {
      if (error instanceof WorkflowStateError) {
        throw new LifecycleError('lifecycle_transition_invalid', 409);
      }
      throw error;
    }

    const identity = `${input.publicId}:${input.idempotencyKey}`;
    const eventId = deterministicUuidV4('nagarik:v2:lifecycle-event', identity);
    const nextDomainVersion = domainVersion + 1;
    const publicEvent = {
      schemaVersion: 'nagarik-lifecycle-event-v1',
      from: current,
      to: input.change.toState,
      reasonCode: input.change.reasonCode,
      publicNote: input.change.publicNote ?? null,
      observedAt: input.change.observedAt ?? null,
      recordedAt: now.toISOString(),
    };
    const payloadHash = hash(publicEvent);
    const category = row.category as keyof typeof v2Categories;
    const chainJob = buildChainJob({
      operation: 'lifecycle_changed',
      publicIssueId: input.publicId,
      databaseEventId: eventId,
      payloadHash,
      expected: {
        updateCount: Number(row.checkpoint_update_count),
        timelineHead,
        handoffHead: bytesHex(row.projected_handoff_head),
        category: v2Categories[category],
        lifecycle: v2Lifecycles[current],
        publicationRemoved: false,
        metadataHash: bytesHex(row.metadata_hash),
        evidenceHash: bytesHex(row.evidence_hash),
        locationHash: bytesHex(row.location_hash),
      },
      next: {
        category: v2Categories[category],
        lifecycle: v2Lifecycles[input.change.toState],
        publicationRemoved: false,
        metadataHash: bytesHex(row.metadata_hash),
        evidenceHash: bytesHex(row.evidence_hash),
        locationHash: bytesHex(row.location_hash),
      },
    });
    const outboxId = deterministicUuid('nagarik:v2:lifecycle-outbox', eventId);

    await query.query(
      `insert into nagarik.lifecycle_events(
         id, issue_id, issue_version_id, workflow_version, workflow_head,
         from_state, to_state, reason_code, public_note, observed_at,
         evidence_private, public_event, chain_sequence, checkpoint_state,
         created_by, created_at
       )
       values (
         $1::uuid, $2::uuid, $3::uuid, $4, decode($5, 'hex'),
         $6, $7, $8, $9, $10::timestamptz,
         '{}'::jsonb, $11::jsonb, $12, 'pending',
         $13::uuid, $14::timestamptz
       )`,
      [
        eventId,
        String(row.issue_id),
        String(row.version_id),
        nextDomainVersion,
        chainJob.next.timelineHead,
        current,
        input.change.toState,
        input.change.reasonCode,
        input.change.publicNote ?? null,
        input.change.observedAt ?? null,
        JSON.stringify(publicEvent),
        chainJob.next.updateCount,
        input.actor.subjectId,
        now.toISOString(),
      ],
    );
    await query.query(
      `update nagarik.issues
       set
         lifecycle = $2,
         domain_version = $3,
         checkpoint_update_count = $4,
         projected_timeline_head = decode($5, 'hex'),
         projected_handoff_head = decode($6, 'hex'),
         updated_at = $7::timestamptz
       where id = $1::uuid`,
      [
        String(row.issue_id),
        input.change.toState,
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
        String(row.issue_id),
        String(row.version_id),
        chainJob.operation,
        chainJob.next.updateCount,
        chainJob.eventId,
        JSON.stringify(chainJob),
        chainJob.payloadHash,
        now.toISOString(),
      ],
    );
    const auditId = deterministicUuid('nagarik:v2:lifecycle-audit', eventId);
    const requestId = deterministicUuidV4('nagarik:v2:lifecycle-request', identity);
    await query.query(
      `insert into nagarik.audit_events(
         id, organization_id, actor_type, actor_key, action,
         resource_type, resource_id, request_id, detail, occurred_at
       )
       values (
         $1::uuid, $2::uuid, 'operator', decode($3, 'hex'), 'lifecycle_changed',
         'issue', $4::uuid, $5::uuid, $6::jsonb, $7::timestamptz
       )`,
      [
        auditId,
        input.actor.organizationId,
        reservation.actorKey,
        String(row.issue_id),
        requestId,
        JSON.stringify({
          from: current,
          to: input.change.toState,
          domainVersion: nextDomainVersion,
          chainSequence: chainJob.next.updateCount,
        }),
        now.toISOString(),
      ],
    );
    const response: StableLifecycleResult = {
      publicId: input.publicId,
      lifecycle: input.change.toState,
      domainVersion: nextDomainVersion,
      chainSequence: chainJob.next.updateCount,
      timelineHead: chainJob.next.timelineHead,
    };
    await completeOperatorMutation(query, {
      recordId: reservation.recordId,
      requestHash: reservation.requestHash,
      status: 202,
      response,
      resourceId: String(row.issue_id),
    });
    return { replayed: false, value: response };
  });
  return { replayed: result.replayed, ...result.value };
}

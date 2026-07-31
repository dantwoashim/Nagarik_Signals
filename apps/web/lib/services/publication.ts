import { createHash } from 'node:crypto';

import { z } from 'zod';

import { buildChainJob } from '../chain/chainJob';
import type { QueryExecutor } from '../db/query';
import type { LifecycleState } from '../domain/workflow';
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

const publicCopySchema = z
  .object({
    title: z.string().trim().min(8).max(120),
    narrative: z.string().trim().min(20).max(2_000),
    wardLabel: z.string().trim().min(1).max(120),
    localityLabel: z.string().trim().min(1).max(80).nullable().optional(),
    publicReason: z.string().trim().min(1).max(240),
  })
  .strict();

const correctionInputSchema = z
  .object({
    expectedDomainVersion: z.number().int().positive(),
    expectedTimelineHead: z.string().regex(/^[0-9a-f]{64}$/),
    reasonCode: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
    privateNote: z.string().trim().min(1).max(2_000),
    publicCopy: publicCopySchema,
  })
  .strict();

const removalInputSchema = z
  .object({
    expectedDomainVersion: z.number().int().positive(),
    expectedTimelineHead: z.string().regex(/^[0-9a-f]{64}$/),
    reasonCode: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
    publicMessage: z.string().trim().min(8).max(500),
    privateNote: z.string().trim().min(8).max(2_000),
    cachePurgeReference: z.string().trim().min(3).max(200),
  })
  .strict();

export type CorrectionInput = z.infer<typeof correctionInputSchema>;
export type RemovalInput = z.infer<typeof removalInputSchema>;

type PublicationResult = {
  replayed: boolean;
  publicId: string;
  domainVersion: number;
  chainSequence: number | null;
  timelineHead: string;
};

export type CorrectionResult = PublicationResult & {
  versionId: string;
  versionNumber: number;
  publicationState: 'commit_pending';
  chainSequence: number;
};

export type RemovalResult = PublicationResult & {
  publicationState: 'removal_pending' | 'removed';
  checkpointState: 'pending' | 'not_applicable_v1_legacy';
};

type StableCorrectionResult = Omit<CorrectionResult, 'replayed'>;
type StableRemovalResult = Omit<RemovalResult, 'replayed'>;

export class PublicationError extends Error {
  constructor(
    public readonly code:
      'correction_invalid' | 'removal_invalid' | 'publication_media_unavailable',
    public readonly status: 400 | 409,
  ) {
    super(code);
    this.name = 'PublicationError';
  }
}

export function parseCorrectionInput(value: unknown): CorrectionInput {
  const result = correctionInputSchema.safeParse(value);
  if (!result.success) throw new PublicationError('correction_invalid', 400);
  return result.data;
}

export function parseRemovalInput(value: unknown): RemovalInput {
  const result = removalInputSchema.safeParse(value);
  if (!result.success) throw new PublicationError('removal_invalid', 400);
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

function objectValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }
  return {};
}

function stableCorrection(value: unknown): StableCorrectionResult {
  if (!value || typeof value !== 'object') throw new Error('stored_correction_response_invalid');
  return value as StableCorrectionResult;
}

function stableRemoval(value: unknown): StableRemovalResult {
  if (!value || typeof value !== 'object') throw new Error('stored_removal_response_invalid');
  return value as StableRemovalResult;
}

async function createPrivacyRestriction(
  query: QueryExecutor,
  input: {
    identity: string;
    organizationId: string;
    issueId: string;
    eventId: string;
    reasonCode: string;
    privateNote: string;
    publicMessage: string;
    actorSubjectId: string;
    now: Date;
    state: 'in_review' | 'fulfilled';
  },
) {
  const privacyRequestId = deterministicUuidV4('nagarik:v2:privacy-request', input.identity);
  const accessOverlayId = deterministicUuidV4('nagarik:v2:access-overlay', input.identity);
  const overlayVersions = await query.query(
    `select coalesce(max(overlay_version), 0)::bigint + 1 as next_version
     from nagarik.access_overlays
     where issue_id = $1::uuid`,
    [input.issueId],
  );
  const overlayVersion = Number(overlayVersions[0]?.next_version);
  if (!Number.isSafeInteger(overlayVersion) || overlayVersion < 1) {
    throw new Error('access_overlay_version_invalid');
  }
  const description =
    `Publication removal requested under ${input.reasonCode}. ${input.privateNote}`.slice(0, 1_000);
  const fulfilled = input.state === 'fulfilled';
  await query.query(
    `insert into nagarik.privacy_requests(
       id, organization_id, target_type, target_id, request_type,
       description, state, outcome_public, created_at, updated_at, closed_at
     )
     values (
       $1::uuid, $2::uuid, 'public_issue', $3::uuid, 'erasure',
       $4, $5, $6, $7::timestamptz, $7::timestamptz, $8::timestamptz
     )`,
    [
      privacyRequestId,
      input.organizationId,
      input.issueId,
      description,
      input.state,
      fulfilled ? input.publicMessage : null,
      input.now.toISOString(),
      fulfilled ? input.now.toISOString() : null,
    ],
  );
  await query.query(
    `insert into nagarik.access_overlays(
       id, privacy_request_id, issue_id, overlay_version, state,
       reason_category, decision_event_id, created_by, created_at
     )
     values (
       $1::uuid, $2::uuid, $3::uuid, $4, 'restricted',
       $5, $6::uuid, $7::uuid, $8::timestamptz
     )`,
    [
      accessOverlayId,
      privacyRequestId,
      input.issueId,
      overlayVersion,
      input.reasonCode,
      input.eventId,
      input.actorSubjectId,
      input.now.toISOString(),
    ],
  );
  return { privacyRequestId, accessOverlayId };
}

async function assertOperatorSwitches(
  query: QueryExecutor,
  requirePublication: boolean,
): Promise<void> {
  const rows = await query.query(
    `select
       nagarik.is_capability_enabled('operatorMutationsEnabled') as operator_enabled,
       nagarik.is_capability_enabled('publicationEnabled') as publication_enabled`,
  );
  if (rows[0]?.operator_enabled !== true) {
    throw new OperatorMutationError('operator_mutations_disabled', 503);
  }
  if (requirePublication && rows[0]?.publication_enabled !== true) {
    throw new OperatorMutationError('publication_disabled', 503);
  }
}

export async function correctPublishedIssue(
  input: {
    publicId: string;
    idempotencyKey: string;
    actor: OperatorMutationActor;
    correction: CorrectionInput;
  },
  dependencies: OperatorMutationDependencies,
): Promise<CorrectionResult> {
  const now = dependencies.now?.() ?? new Date();
  const result = await dependencies.transaction(async (query) => {
    const reservation = await reserveOperatorMutation<StableCorrectionResult>(query, {
      scope: `operator:correction:${input.publicId}`,
      actor: input.actor,
      idempotencyKey: input.idempotencyKey,
      request: input.correction,
      correlationKey: dependencies.correlationKey,
      now,
    });
    if (reservation.disposition === 'replay') {
      return { replayed: true, value: stableCorrection(reservation.response) };
    }
    await assertOperatorSwitches(query, true);
    const rows = await query.query(
      `select
         issue.id as issue_id,
         issue.publication_state,
         issue.lifecycle,
         issue.domain_version,
         issue.checkpoint_update_count,
         issue.projected_timeline_head,
         issue.projected_handoff_head,
         issue.blocked_from_sequence,
         version.id as version_id,
         version.version_number,
         version.category,
         version.ward_id,
         version.public_location,
         version.public_media_id,
         version.public_provenance,
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
      domainVersion !== input.correction.expectedDomainVersion ||
      timelineHead !== input.correction.expectedTimelineHead
    ) {
      throw new OperatorMutationError('stale_resource_version', 409);
    }
    const mediaId = String(row.public_media_id);
    const mediaRows = await query.query(
      `select id, state, source_media_id, encode(sha256, 'hex') as sha256
       from nagarik.media_objects
       where id = $1::uuid
         and organization_id = $2::uuid
         and state = 'approved_public'
         and source_media_id is not null
       for update`,
      [mediaId, input.actor.organizationId],
    );
    const media = mediaRows[0];
    if (!media) throw new PublicationError('publication_media_unavailable', 409);

    const identity = `${input.publicId}:${input.idempotencyKey}`;
    const versionNumber = Number(row.version_number) + 1;
    const versionId = deterministicUuidV4('nagarik:v2:issue-correction-version', identity);
    const eventId = deterministicUuidV4('nagarik:v2:publication-correction', identity);
    const existingProvenance = objectValue(row.public_provenance);
    const publicProvenance = {
      ...existingProvenance,
      correction: {
        schemaVersion: 'nagarik-correction-v1',
        reasonCode: input.correction.reasonCode,
        correctedAt: now.toISOString(),
        supersedesVersion: Number(row.version_number),
      },
    };
    const publicLocation = objectValue(row.public_location);
    const copy = input.correction.publicCopy;
    const canonicalMetadata = {
      schemaVersion: 'nagarik-public-version-v2',
      publicId: input.publicId,
      version: versionNumber,
      title: copy.title,
      narrative: copy.narrative,
      category: String(row.category),
      observedOn: existingProvenance.observedOn ?? null,
      ward: { id: String(row.ward_id), label: copy.wardLabel },
      localityLabel: copy.localityLabel ?? null,
      publicLocation,
      publicMediaId: mediaId,
      provenance: publicProvenance,
      publicReason: copy.publicReason,
    };
    const metadataHash = hash(canonicalMetadata);
    const evidenceHash = String(media.sha256);
    const locationHash = hash(publicLocation);
    const payloadHash = hash({
      schemaVersion: 'nagarik-chain-payload-v2',
      operation: 'metadata_version_committed',
      publicId: input.publicId,
      versionId,
      metadataHash,
      evidenceHash,
      locationHash,
    });
    const category = row.category as keyof typeof v2Categories;
    const lifecycle = row.lifecycle as LifecycleState;
    const chainJob = buildChainJob({
      operation: 'metadata_version_committed',
      publicIssueId: input.publicId,
      databaseEventId: eventId,
      payloadHash,
      expected: {
        updateCount: Number(row.checkpoint_update_count),
        timelineHead,
        handoffHead: bytesHex(row.projected_handoff_head),
        category: v2Categories[category],
        lifecycle: v2Lifecycles[lifecycle],
        publicationRemoved: false,
        metadataHash: bytesHex(row.metadata_hash),
        evidenceHash: bytesHex(row.evidence_hash),
        locationHash: bytesHex(row.location_hash),
      },
      next: {
        category: v2Categories[category],
        lifecycle: v2Lifecycles[lifecycle],
        publicationRemoved: false,
        metadataHash,
        evidenceHash,
        locationHash,
      },
    });
    const nextDomainVersion = domainVersion + 1;
    const outboxId = deterministicUuid('nagarik:v2:correction-outbox', eventId);
    await query.query(
      `insert into nagarik.issue_versions(
         id, issue_id, version_number, state, title, narrative, category,
         ward_id, ward_label, locality_label, public_location, public_media_id,
         public_provenance, metadata_hash, evidence_hash, location_hash,
         public_reason, version_created_at, created_at
       )
       values (
         $1::uuid, $2::uuid, $3, 'commit_pending', $4, $5, $6,
         $7, $8, $9, $10::jsonb, $11::uuid,
         $12::jsonb, decode($13, 'hex'), decode($14, 'hex'), decode($15, 'hex'),
         $16, $17::timestamptz, $17::timestamptz
       )`,
      [
        versionId,
        String(row.issue_id),
        versionNumber,
        copy.title,
        copy.narrative,
        String(row.category),
        String(row.ward_id),
        copy.wardLabel,
        copy.localityLabel ?? null,
        JSON.stringify(publicLocation),
        mediaId,
        JSON.stringify(publicProvenance),
        metadataHash,
        evidenceHash,
        locationHash,
        copy.publicReason,
        now.toISOString(),
      ],
    );
    await query.query(
      `insert into nagarik.publication_events(
         id, issue_id, issue_version_id, event_type, domain_version,
         private_reason, public_event, created_by, created_at
       )
       values (
         $1::uuid, $2::uuid, $3::uuid, 'corrected', $4,
         $5, $6::jsonb, $7::uuid, $8::timestamptz
       )`,
      [
        eventId,
        String(row.issue_id),
        versionId,
        nextDomainVersion,
        input.correction.privateNote,
        JSON.stringify({
          schemaVersion: 'nagarik-publication-event-v1',
          type: 'corrected',
          version: versionNumber,
          reasonCode: input.correction.reasonCode,
          reason: copy.publicReason,
        }),
        input.actor.subjectId,
        now.toISOString(),
      ],
    );
    await query.query(
      `update nagarik.issues
       set
         current_version_id = $2::uuid,
         publication_state = 'commit_pending',
         domain_version = $3,
         checkpoint_update_count = $4,
         projected_timeline_head = decode($5, 'hex'),
         projected_handoff_head = decode($6, 'hex'),
         updated_at = $7::timestamptz
       where id = $1::uuid`,
      [
        String(row.issue_id),
        versionId,
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
        versionId,
        chainJob.operation,
        chainJob.next.updateCount,
        chainJob.eventId,
        JSON.stringify(chainJob),
        chainJob.payloadHash,
        now.toISOString(),
      ],
    );
    const auditId = deterministicUuid('nagarik:v2:correction-audit', eventId);
    const requestId = deterministicUuidV4('nagarik:v2:correction-request', identity);
    await query.query(
      `insert into nagarik.audit_events(
         id, organization_id, actor_type, actor_key, action,
         resource_type, resource_id, request_id, detail, occurred_at
       )
       values (
         $1::uuid, $2::uuid, 'operator', decode($3, 'hex'), 'publication_corrected',
         'issue', $4::uuid, $5::uuid, $6::jsonb, $7::timestamptz
       )`,
      [
        auditId,
        input.actor.organizationId,
        reservation.actorKey,
        String(row.issue_id),
        requestId,
        JSON.stringify({
          reasonCode: input.correction.reasonCode,
          versionNumber,
          chainSequence: chainJob.next.updateCount,
        }),
        now.toISOString(),
      ],
    );
    const response: StableCorrectionResult = {
      publicId: input.publicId,
      versionId,
      versionNumber,
      publicationState: 'commit_pending',
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

export async function removePublishedIssue(
  input: {
    publicId: string;
    idempotencyKey: string;
    actor: OperatorMutationActor;
    removal: RemovalInput;
  },
  dependencies: OperatorMutationDependencies,
): Promise<RemovalResult> {
  const now = dependencies.now?.() ?? new Date();
  const result = await dependencies.transaction(async (query) => {
    const reservation = await reserveOperatorMutation<StableRemovalResult>(query, {
      scope: `operator:removal:${input.publicId}`,
      actor: input.actor,
      idempotencyKey: input.idempotencyKey,
      request: input.removal,
      correlationKey: dependencies.correlationKey,
      now,
    });
    if (reservation.disposition === 'replay') {
      return { replayed: true, value: stableRemoval(reservation.response) };
    }
    await assertOperatorSwitches(query, false);
    const rows = await query.query(
      `select
         issue.id as issue_id,
         issue.workflow_version,
         issue.publication_state,
         issue.lifecycle,
         issue.domain_version,
         issue.checkpoint_update_count,
         issue.projected_timeline_head,
         issue.projected_handoff_head,
         issue.blocked_from_sequence,
         version.id as version_id,
         version.public_media_id,
         version.category,
         version.metadata_hash,
         version.evidence_hash,
         version.location_hash
       from nagarik.issues issue
       join nagarik.issue_versions version on version.id = issue.current_version_id
       where issue.public_id = $1::uuid
         and issue.organization_id = $2::uuid
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
      domainVersion !== input.removal.expectedDomainVersion ||
      timelineHead !== input.removal.expectedTimelineHead
    ) {
      throw new OperatorMutationError('stale_resource_version', 409);
    }

    const identity = `${input.publicId}:${input.idempotencyKey}`;
    const eventId = deterministicUuidV4('nagarik:v2:publication-removal', identity);
    const nextDomainVersion = domainVersion + 1;
    if (row.workflow_version === 'v1_legacy') {
      const tombstone = {
        schemaVersion: 'nagarik-tombstone-v1',
        removedAt: now.toISOString(),
        reasonCode: input.removal.reasonCode,
        publicMessage: input.removal.publicMessage,
      };
      const { privacyRequestId, accessOverlayId } = await createPrivacyRestriction(query, {
        identity,
        organizationId: input.actor.organizationId,
        issueId: String(row.issue_id),
        eventId,
        reasonCode: input.removal.reasonCode,
        privateNote: input.removal.privateNote,
        publicMessage: input.removal.publicMessage,
        actorSubjectId: input.actor.subjectId,
        now,
        state: 'fulfilled',
      });
      await query.query(
        `update nagarik.issues
         set publication_state = 'removed', domain_version = $2,
             updated_at = $3::timestamptz
         where id = $1::uuid and workflow_version = 'v1_legacy'`,
        [String(row.issue_id), nextDomainVersion, now.toISOString()],
      );
      await query.query(
        `update nagarik.issue_versions
         set state = 'removed'
         where id = $1::uuid and state = 'published'`,
        [String(row.version_id)],
      );
      if (row.public_media_id) {
        await query.query(
          `update nagarik.media_objects
           set state = 'removed', version = version + 1,
               denied_at = $2::timestamptz, updated_at = $2::timestamptz
           where id = $1::uuid and state = 'approved_public'`,
          [String(row.public_media_id), now.toISOString()],
        );
        await query.query(
          `update public.media_projection
           set state = 'removed', updated_at = $2::timestamptz
           where media_id = $1::uuid`,
          [String(row.public_media_id), now.toISOString()],
        );
      }
      await query.query(
        `update public.issue_projection
         set publication_state = 'removed', version_id = null,
             title = null, summary = null, narrative = null, category = null,
             ward = null, location = null, media_id = null, provenance = null,
             lifecycle = null, legacy_status = null, tombstone = $2::jsonb,
             updated_at = $3::timestamptz
         where public_id = $1::uuid and workflow_version = 'v1_legacy'`,
        [input.publicId, JSON.stringify(tombstone), now.toISOString()],
      );
      await query.query(
        `insert into nagarik.recovery_ledger(
           id, organization_id, opaque_record_id, action,
           policy_version, integrity_hash, occurred_at
         )
         values (
           $1::uuid, $2::uuid, $3::uuid, 'legacy_publication_removed',
           'nagarik-tombstone-v1', decode($4, 'hex'), $5::timestamptz
         )`,
        [
          deterministicUuid('nagarik:v1:removal-recovery', identity),
          input.actor.organizationId,
          String(row.issue_id),
          hash(tombstone),
          now.toISOString(),
        ],
      );
      await query.query(
        `insert into nagarik.audit_events(
           id, organization_id, actor_type, actor_key, action,
           resource_type, resource_id, request_id, detail, occurred_at
         )
         values (
           $1::uuid, $2::uuid, 'operator', decode($3, 'hex'),
           'legacy_publication_removed', 'issue', $4::uuid,
           $5::uuid, $6::jsonb, $7::timestamptz
         )`,
        [
          deterministicUuid('nagarik:v1:removal-audit', identity),
          input.actor.organizationId,
          reservation.actorKey,
          String(row.issue_id),
          deterministicUuidV4('nagarik:v1:removal-request', identity),
          JSON.stringify({
            reasonCode: input.removal.reasonCode,
            privacyRequestId,
            accessOverlayId,
            cachePurgeReference: input.removal.cachePurgeReference,
            checkpointState: 'not_applicable_v1_legacy',
          }),
          now.toISOString(),
        ],
      );
      const response: StableRemovalResult = {
        publicId: input.publicId,
        publicationState: 'removed',
        domainVersion: nextDomainVersion,
        chainSequence: null,
        timelineHead,
        checkpointState: 'not_applicable_v1_legacy',
      };
      await completeOperatorMutation(query, {
        recordId: reservation.recordId,
        requestHash: reservation.requestHash,
        status: 200,
        response,
        resourceId: String(row.issue_id),
      });
      return { replayed: false, value: response };
    }
    if (row.workflow_version !== 'v2') {
      throw new OperatorMutationError('workflow_conflict', 409);
    }
    const publicEvent = {
      schemaVersion: 'nagarik-removal-event-v1',
      reasonCode: input.removal.reasonCode,
      publicMessage: input.removal.publicMessage,
    };
    const metadataHash = hash(publicEvent);
    const payloadHash = hash({
      schemaVersion: 'nagarik-chain-payload-v2',
      operation: 'publication_removed',
      publicId: input.publicId,
      metadataHash,
    });
    const category = row.category as keyof typeof v2Categories;
    const lifecycle = row.lifecycle as LifecycleState;
    const chainJob = buildChainJob({
      operation: 'publication_removed',
      publicIssueId: input.publicId,
      databaseEventId: eventId,
      payloadHash,
      expected: {
        updateCount: Number(row.checkpoint_update_count),
        timelineHead,
        handoffHead: bytesHex(row.projected_handoff_head),
        category: v2Categories[category],
        lifecycle: v2Lifecycles[lifecycle],
        publicationRemoved: false,
        metadataHash: bytesHex(row.metadata_hash),
        evidenceHash: bytesHex(row.evidence_hash),
        locationHash: bytesHex(row.location_hash),
      },
      next: {
        category: v2Categories[category],
        lifecycle: v2Lifecycles[lifecycle],
        publicationRemoved: true,
        metadataHash,
        evidenceHash: bytesHex(row.evidence_hash),
        locationHash: bytesHex(row.location_hash),
      },
    });
    const outboxId = deterministicUuid('nagarik:v2:removal-outbox', eventId);
    await query.query(
      `insert into nagarik.publication_events(
         id, issue_id, issue_version_id, event_type, domain_version,
         private_reason, public_event, created_by, created_at
       )
       values (
         $1::uuid, $2::uuid, null, 'removed', $3,
         $4, $5::jsonb, $6::uuid, $7::timestamptz
       )`,
      [
        eventId,
        String(row.issue_id),
        nextDomainVersion,
        input.removal.privateNote,
        JSON.stringify(publicEvent),
        input.actor.subjectId,
        now.toISOString(),
      ],
    );
    const { privacyRequestId, accessOverlayId } = await createPrivacyRestriction(query, {
      identity,
      organizationId: input.actor.organizationId,
      issueId: String(row.issue_id),
      eventId,
      reasonCode: input.removal.reasonCode,
      privateNote: input.removal.privateNote,
      publicMessage: input.removal.publicMessage,
      actorSubjectId: input.actor.subjectId,
      now,
      state: 'in_review',
    });
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
        String(row.issue_id),
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
    const auditId = deterministicUuid('nagarik:v2:removal-audit', eventId);
    const requestId = deterministicUuidV4('nagarik:v2:removal-request', identity);
    await query.query(
      `insert into nagarik.audit_events(
         id, organization_id, actor_type, actor_key, action,
         resource_type, resource_id, request_id, detail, occurred_at
       )
       values (
         $1::uuid, $2::uuid, 'operator', decode($3, 'hex'), 'publication_removal_requested',
         'issue', $4::uuid, $5::uuid, $6::jsonb, $7::timestamptz
       )`,
      [
        auditId,
        input.actor.organizationId,
        reservation.actorKey,
        String(row.issue_id),
        requestId,
        JSON.stringify({
          reasonCode: input.removal.reasonCode,
          chainSequence: chainJob.next.updateCount,
          privacyRequestId,
          accessOverlayId,
          cachePurgeReference: input.removal.cachePurgeReference,
        }),
        now.toISOString(),
      ],
    );
    const response: StableRemovalResult = {
      publicId: input.publicId,
      publicationState: 'removal_pending',
      domainVersion: nextDomainVersion,
      chainSequence: chainJob.next.updateCount,
      timelineHead: chainJob.next.timelineHead,
      checkpointState: 'pending',
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

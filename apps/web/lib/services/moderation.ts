import { createHash } from 'node:crypto';

import { z } from 'zod';

import { buildChainJob } from '../chain/chainJob';
import {
  assertSubmissionTransition,
  type SubmissionState,
  WorkflowStateError,
} from '../domain/workflow';
import { canonicalize } from '../proof/canonicalize';
import { parseCapabilityToken, type CapabilityKeys } from '../security/capabilityTokens';
import { deterministicUuid, deterministicUuidV4 } from '../security/ids';
import { authorizeOperatorMediaReceipt } from '../security/operatorMediaCapabilityCore';
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
    publicReason: z.string().trim().min(1).max(240).nullable().optional(),
  })
  .strict();

const moderationInputSchema = z
  .object({
    decision: z.enum(['start_review', 'request_changes', 'approve', 'reject']),
    expectedVersion: z.number().int().positive(),
    reasonCode: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
    privateNote: z.string().trim().max(2_000).nullable().optional(),
    publicSafeMessage: z.string().trim().max(500).nullable().optional(),
    publicCopy: publicCopySchema.optional(),
    mediaBindingReceipt: z.string().trim().min(80).max(220).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.decision === 'approve') {
      if (!value.publicCopy) {
        context.addIssue({ code: 'custom', path: ['publicCopy'], message: 'is required' });
      }
      if (!value.mediaBindingReceipt) {
        context.addIssue({
          code: 'custom',
          path: ['mediaBindingReceipt'],
          message: 'is required',
        });
      }
    }
    if (value.decision !== 'approve') {
      if (value.publicCopy) {
        context.addIssue({ code: 'custom', path: ['publicCopy'], message: 'is not allowed' });
      }
      if (value.mediaBindingReceipt) {
        context.addIssue({
          code: 'custom',
          path: ['mediaBindingReceipt'],
          message: 'is not allowed',
        });
      }
    }
  });

export type ModerationInput = z.infer<typeof moderationInputSchema>;

export type ModerationResult = {
  replayed: boolean;
  submissionId: string;
  state: SubmissionState;
  version: number;
  issue: null | {
    issueId: string;
    publicId: string;
    versionId: string;
    publicationState: 'commit_pending';
    chainSequence: number;
    timelineHead: string;
  };
};

type StableModerationResult = Omit<ModerationResult, 'replayed'>;

type SubmissionRow = {
  submissionId: string;
  organizationId: string;
  state: SubmissionState;
  version: number;
  revisionId: string;
  revisionNumber: number;
  recordKind: 'community_report' | 'public_source';
  title: string;
  narrative: string;
  category: keyof typeof v2Categories;
  observedOn: string;
  wardId: string;
  localityLabel: string | null;
  provenance: Record<string, unknown>;
  mediaId: string;
  mediaState: string;
};

export class ModerationError extends Error {
  constructor(
    public readonly code:
      | 'moderation_invalid'
      | 'moderation_media_unavailable'
      | 'moderation_media_receipt_invalid'
      | 'moderation_location_unavailable'
      | 'moderation_transition_invalid',
    public readonly status: 400 | 409,
  ) {
    super(code);
    this.name = 'ModerationError';
  }
}

export function parseModerationInput(value: unknown): ModerationInput {
  const result = moderationInputSchema.safeParse(value);
  if (!result.success) throw new ModerationError('moderation_invalid', 400);
  return result.data;
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

function submissionRow(row: Record<string, unknown>): SubmissionRow {
  return {
    submissionId: String(row.submission_id),
    organizationId: String(row.organization_id),
    state: row.submission_state as SubmissionState,
    version: Number(row.submission_version),
    revisionId: String(row.revision_id),
    revisionNumber: Number(row.revision_number),
    recordKind: row.record_kind as SubmissionRow['recordKind'],
    title: String(row.title),
    narrative: String(row.narrative),
    category: row.category as keyof typeof v2Categories,
    observedOn: String(row.observed_on).slice(0, 10),
    wardId: String(row.ward_id),
    localityLabel: row.locality_label ? String(row.locality_label) : null,
    provenance: objectValue(row.provenance_private),
    mediaId: String(row.media_id),
    mediaState: String(row.media_state),
  };
}

function nextSubmissionState(decision: ModerationInput['decision']): SubmissionState {
  if (decision === 'start_review') return 'under_review';
  if (decision === 'request_changes') return 'changes_requested';
  if (decision === 'approve') return 'approved';
  return 'rejected';
}

function stableResult(value: unknown): StableModerationResult {
  if (!value || typeof value !== 'object') throw new Error('stored_moderation_response_invalid');
  return value as StableModerationResult;
}

export async function moderateSubmission(
  input: {
    submissionId: string;
    idempotencyKey: string;
    actor: OperatorMutationActor;
    moderation: ModerationInput;
  },
  dependencies: OperatorMutationDependencies & { keys: CapabilityKeys },
): Promise<ModerationResult> {
  if (input.actor.organizationId.length === 0) {
    throw new OperatorMutationError('resource_not_found', 404);
  }
  const now = dependencies.now?.() ?? new Date();
  const stable = await dependencies.transaction(async (query) => {
    const reservation = await reserveOperatorMutation<StableModerationResult>(query, {
      scope: `operator:moderation:${input.submissionId}`,
      actor: input.actor,
      idempotencyKey: input.idempotencyKey,
      request: input.moderation,
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
         submission.id as submission_id,
         submission.organization_id,
         submission.record_kind,
         submission.state as submission_state,
         submission.version as submission_version,
         revision.id as revision_id,
         revision.revision_number,
         revision.title,
         revision.narrative,
         revision.category,
         revision.observed_on,
         revision.ward_id,
         revision.locality_label,
         revision.provenance_private,
         media.id as media_id,
         media.state as media_state
       from nagarik.submissions submission
       join nagarik.submission_revisions revision
         on revision.submission_id = submission.id
        and revision.revision_number = submission.current_revision_number
       join nagarik.submission_media link on link.revision_id = revision.id and link.position = 0
       join nagarik.media_objects media on media.id = link.media_id
       where submission.id = $1::uuid
         and submission.organization_id = $2::uuid
       for update of submission, media`,
      [input.submissionId, input.actor.organizationId],
    );
    if (rows.length !== 1) throw new OperatorMutationError('resource_not_found', 404);
    const submission = submissionRow(rows[0]);
    if (submission.version !== input.moderation.expectedVersion) {
      throw new OperatorMutationError('stale_resource_version', 409);
    }

    const nextState = nextSubmissionState(input.moderation.decision);
    try {
      assertSubmissionTransition(submission.state, nextState);
    } catch (error) {
      if (error instanceof WorkflowStateError) {
        throw new ModerationError('moderation_transition_invalid', 409);
      }
      throw error;
    }

    const identity = `${input.submissionId}:${input.idempotencyKey}`;
    const moderationEventId = deterministicUuidV4('nagarik:v2:moderation-event', identity);
    const nextVersion = submission.version + 1;
    let issue: StableModerationResult['issue'] = null;

    await query.query(
      `insert into nagarik.moderation_events(
         id, submission_id, submission_version, actor_subject, event_type,
         reason_code, private_note, public_safe_message, created_at
       )
       values (
         $1::uuid, $2::uuid, $3, $4::uuid, $5,
         $6, $7, $8, $9::timestamptz
       )`,
      [
        moderationEventId,
        submission.submissionId,
        submission.version,
        input.actor.subjectId,
        input.moderation.decision,
        input.moderation.reasonCode,
        input.moderation.privateNote ?? null,
        input.moderation.publicSafeMessage ?? null,
        now.toISOString(),
      ],
    );

    if (input.moderation.decision === 'approve') {
      const publicationSwitch = await query.query(
        `select nagarik.is_capability_enabled('publicationEnabled') as enabled`,
      );
      if (publicationSwitch[0]?.enabled !== true) {
        throw new OperatorMutationError('publication_disabled', 503);
      }
      if (submission.mediaState !== 'approved_private') {
        throw new ModerationError('moderation_media_unavailable', 409);
      }
      const parsedReceipt = parseCapabilityToken(input.moderation.mediaBindingReceipt!);
      if (!parsedReceipt || parsedReceipt.purpose !== 'operator_media') {
        throw new ModerationError('moderation_media_receipt_invalid', 409);
      }
      const receiptRows = await query.query(
        `select
           capability.id as capability_id,
           capability.organization_id,
           capability.subject_id,
           capability.issuance_idempotency_id,
           capability.key_version,
           capability.verifier,
           capability.state as capability_state,
           capability.scope,
           capability.expires_at,
           derivative.source_media_id,
           derivative.state as media_state,
           derivative.version as media_version,
           encode(derivative.sha256, 'hex') as evidence_hash
         from nagarik.capabilities capability
         join nagarik.media_objects derivative on derivative.id = capability.subject_id
         where capability.id = $1::uuid
           and capability.purpose = 7
           and capability.organization_id = $2::uuid
         for update of capability, derivative`,
        [parsedReceipt.capabilityId, input.actor.organizationId],
      );
      const receiptRow = receiptRows[0];
      const authorizedReceipt = receiptRow
        ? authorizeOperatorMediaReceipt(
            input.moderation.mediaBindingReceipt!,
            {
              keyVersion: Number(receiptRow.key_version),
              purpose: 'operator_media',
              organizationId: String(receiptRow.organization_id),
              capabilityId: String(receiptRow.capability_id),
              subjectId: String(receiptRow.subject_id),
              issuanceIdempotencyId: String(receiptRow.issuance_idempotency_id),
              verifier: receiptRow.verifier as Uint8Array,
              state: String(receiptRow.capability_state),
              expiresAt: new Date(String(receiptRow.expires_at)),
              scope: receiptRow.scope,
            },
            {
              organizationId: input.actor.organizationId,
              purpose: 'initial_publication',
              targetType: 'submission',
              targetId: input.submissionId,
              issuedBy: input.actor.subjectId,
            },
            dependencies.keys,
            now,
          )
        : null;
      if (
        !authorizedReceipt ||
        receiptRow.media_state !== 'redacted_derivative' ||
        Number(receiptRow.media_version) !== authorizedReceipt.mediaVersion ||
        String(receiptRow.evidence_hash) !== authorizedReceipt.evidenceHash ||
        String(receiptRow.source_media_id) !== submission.mediaId ||
        authorizedReceipt.sourceMediaId !== submission.mediaId
      ) {
        throw new ModerationError('moderation_media_receipt_invalid', 409);
      }
      const publicMediaId = authorizedReceipt.mediaId;
      const publicEvidenceHash = authorizedReceipt.evidenceHash;
      const publicLocation = objectValue(submission.provenance.candidatePublicLocation);
      if (
        publicLocation.policyVersion !== 'grid-0.01deg-v1' ||
        publicLocation.wardId !== submission.wardId
      ) {
        throw new ModerationError('moderation_location_unavailable', 409);
      }
      const copy = input.moderation.publicCopy!;
      const issueId = deterministicUuidV4('nagarik:v2:issue-record', input.submissionId);
      const publicId = deterministicUuidV4('nagarik:v2:public-issue', input.submissionId);
      const versionId = deterministicUuidV4(
        'nagarik:v2:issue-version',
        `${input.submissionId}:${submission.revisionNumber}`,
      );
      const publicationEventId = deterministicUuidV4(
        'nagarik:v2:publication-event',
        `${input.submissionId}:${submission.revisionNumber}`,
      );
      const publicProvenance = {
        schemaVersion: 'nagarik-public-provenance-v2',
        recordKind: submission.recordKind,
        observedOn: submission.observedOn,
        moderation: {
          decision: 'approved',
          decidedAt: now.toISOString(),
        },
      };
      const canonicalMetadata = {
        schemaVersion: 'nagarik-public-version-v2',
        publicId,
        version: 1,
        title: copy.title,
        narrative: copy.narrative,
        category: submission.category,
        observedOn: submission.observedOn,
        ward: { id: submission.wardId, label: copy.wardLabel },
        localityLabel: copy.localityLabel ?? submission.localityLabel,
        publicLocation,
        publicMediaId,
        provenance: publicProvenance,
        publicReason: copy.publicReason ?? input.moderation.publicSafeMessage ?? null,
      };
      const metadataHash = hash(canonicalMetadata);
      const locationHash = hash(publicLocation);
      const payloadHash = hash({
        schemaVersion: 'nagarik-chain-payload-v2',
        operation: 'issue_created',
        publicId,
        versionId,
        metadataHash,
        evidenceHash: publicEvidenceHash,
        locationHash,
      });
      const zero = '0'.repeat(64);
      const chainJob = buildChainJob({
        operation: 'issue_created',
        publicIssueId: publicId,
        databaseEventId: publicationEventId,
        payloadHash,
        expected: {
          updateCount: 0,
          timelineHead: zero,
          handoffHead: zero,
          category: v2Categories[submission.category],
          lifecycle: v2Lifecycles.open,
          publicationRemoved: false,
          metadataHash: zero,
          evidenceHash: zero,
          locationHash: zero,
        },
        next: {
          category: v2Categories[submission.category],
          lifecycle: v2Lifecycles.open,
          publicationRemoved: false,
          metadataHash,
          evidenceHash: publicEvidenceHash,
          locationHash,
        },
      });
      const outboxId = deterministicUuid('nagarik:v2:publication-outbox', publicationEventId);

      await query.query(
        `insert into nagarik.issues(
           id, public_id, organization_id, source_submission_id, workflow_version,
           record_kind, publication_state, lifecycle, current_version_id,
           domain_version, checkpoint_update_count, projected_timeline_head,
           projected_handoff_head, created_at, updated_at
         )
         values (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'v2',
           $5, 'commit_pending', 'open', $6::uuid,
           1, $7, decode($8, 'hex'), decode($9, 'hex'), $10::timestamptz, $10::timestamptz
         )`,
        [
          issueId,
          publicId,
          input.actor.organizationId,
          submission.submissionId,
          submission.recordKind,
          versionId,
          chainJob.next.updateCount,
          chainJob.next.timelineHead,
          chainJob.next.handoffHead,
          now.toISOString(),
        ],
      );
      await query.query(
        `insert into nagarik.issue_versions(
           id, issue_id, version_number, state, title, narrative, category,
           ward_id, ward_label, locality_label, public_location, public_media_id,
           public_provenance, metadata_hash, evidence_hash, location_hash,
           public_reason, version_created_at, created_at
         )
         values (
           $1::uuid, $2::uuid, 1, 'commit_pending', $3, $4, $5,
           $6, $7, $8, $9::jsonb, $10::uuid,
           $11::jsonb, decode($12, 'hex'), decode($13, 'hex'), decode($14, 'hex'),
           $15, $16::timestamptz, $16::timestamptz
         )`,
        [
          versionId,
          issueId,
          copy.title,
          copy.narrative,
          submission.category,
          submission.wardId,
          copy.wardLabel,
          copy.localityLabel ?? submission.localityLabel,
          JSON.stringify(publicLocation),
          publicMediaId,
          JSON.stringify(publicProvenance),
          metadataHash,
          publicEvidenceHash,
          locationHash,
          copy.publicReason ?? input.moderation.publicSafeMessage ?? null,
          now.toISOString(),
        ],
      );
      await query.query(
        `insert into nagarik.publication_events(
           id, issue_id, issue_version_id, event_type, domain_version,
           private_reason, public_event, created_by, created_at
         )
         values (
           $1::uuid, $2::uuid, $3::uuid, 'approved', 1,
           $4, $5::jsonb, $6::uuid, $7::timestamptz
         )`,
        [
          publicationEventId,
          issueId,
          versionId,
          input.moderation.privateNote ?? null,
          JSON.stringify({
            schemaVersion: 'nagarik-publication-event-v1',
            type: 'published',
            version: 1,
            reason: copy.publicReason ?? input.moderation.publicSafeMessage ?? null,
          }),
          input.actor.subjectId,
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
          issueId,
          versionId,
          chainJob.operation,
          chainJob.next.updateCount,
          chainJob.eventId,
          JSON.stringify(chainJob),
          chainJob.payloadHash,
          now.toISOString(),
        ],
      );
      await query.query(
        `update nagarik.capabilities
         set state = 'consumed', consumed_at = $2::timestamptz
         where id = $1::uuid and state = 'active'`,
        [authorizedReceipt.capabilityId, now.toISOString()],
      );
      await query.query(
        `update nagarik.media_objects
         set state = 'approved_public', version = version + 1, updated_at = $2::timestamptz
         where id = $1::uuid and state = 'redacted_derivative'`,
        [publicMediaId, now.toISOString()],
      );
      issue = {
        issueId,
        publicId,
        versionId,
        publicationState: 'commit_pending',
        chainSequence: chainJob.next.updateCount,
        timelineHead: chainJob.next.timelineHead,
      };
    }

    await query.query(
      `update nagarik.submissions
       set
         state = $2,
         version = version + 1,
         assigned_to = case when $2 = 'under_review' then $3::uuid else assigned_to end,
         first_review_at = case
           when $2 = 'under_review' then coalesce(first_review_at, $4::timestamptz)
           else first_review_at
         end,
         terminal_at = case
           when $2 in ('approved', 'rejected') then $4::timestamptz
           else terminal_at
         end,
         updated_at = $4::timestamptz
       where id = $1::uuid`,
      [submission.submissionId, nextState, input.actor.subjectId, now.toISOString()],
    );

    const auditId = deterministicUuid('nagarik:v2:moderation-audit', identity);
    const requestId = deterministicUuidV4('nagarik:v2:moderation-request', identity);
    await query.query(
      `insert into nagarik.audit_events(
         id, organization_id, actor_type, actor_key, action,
         resource_type, resource_id, request_id, detail, occurred_at
       )
       values (
         $1::uuid, $2::uuid, 'operator', decode($3, 'hex'), $4,
         'submission', $5::uuid, $6::uuid, $7::jsonb, $8::timestamptz
       )`,
      [
        auditId,
        input.actor.organizationId,
        reservation.actorKey,
        `moderation_${input.moderation.decision}`,
        submission.submissionId,
        requestId,
        JSON.stringify({
          previousState: submission.state,
          nextState,
          previousVersion: submission.version,
          nextVersion,
          issueId: issue?.issueId ?? null,
        }),
        now.toISOString(),
      ],
    );

    const response: StableModerationResult = {
      submissionId: submission.submissionId,
      state: nextState,
      version: nextVersion,
      issue,
    };
    await completeOperatorMutation(query, {
      recordId: reservation.recordId,
      requestHash: reservation.requestHash,
      status: input.moderation.decision === 'approve' ? 202 : 200,
      response,
      resourceId: submission.submissionId,
    });
    return { replayed: false, value: response };
  });

  return { replayed: stable.replayed, ...stable.value };
}

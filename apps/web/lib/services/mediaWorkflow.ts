import { createHash, createHmac } from 'node:crypto';

import { z } from 'zod';

import type { QueryExecutor } from '../db/query';
import {
  deriveCapabilityMaterial,
  type CapabilityCoordinates,
  type CapabilityKeys,
} from '../security/capabilityTokens';
import { deterministicUuid, deterministicUuidV4 } from '../security/ids';
import type { PrivateStagedObject } from '../storage/privateStorage';
import { renderPublicDerivative, type PublicDerivative } from '../storage/publicDerivative';
import {
  completeOperatorMutation,
  OperatorMutationError,
  reserveOperatorMutation,
  type OperatorMutationActor,
  type OperatorMutationDependencies,
} from './operatorMutation';

const expectedMediaSchema = z
  .object({
    version: z.number().int().positive(),
    state: z.string().min(1),
  })
  .strict();

const mediaReviewSchema = z
  .object({
    schemaVersion: z.literal('operator-media-review-v1'),
    expected: expectedMediaSchema.extend({ state: z.literal('quarantined') }),
    decision: z.enum(['approve_private', 'reject']),
    reasonCode: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
    privateNote: z.string().trim().min(1).max(1_000).nullable().optional(),
  })
  .strict();

const rectangleSchema = z
  .object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    reasonCode: z.enum([
      'face',
      'license_plate',
      'personal_detail',
      'private_document',
      'other_sensitive',
    ]),
  })
  .strict();

const derivativeInputSchema = z
  .object({
    schemaVersion: z.literal('public-derivative-v1'),
    expected: expectedMediaSchema.extend({ state: z.literal('approved_private') }),
    reviewDecision: z.enum(['no_redaction_required', 'redact']),
    rectangles: z.array(rectangleSchema).max(32),
    privateNote: z.string().trim().min(1).max(1_000).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.reviewDecision === 'no_redaction_required' && value.rectangles.length !== 0) {
      context.addIssue({ code: 'custom', path: ['rectangles'], message: 'must be empty' });
    }
    if (value.reviewDecision === 'redact' && value.rectangles.length === 0) {
      context.addIssue({ code: 'custom', path: ['rectangles'], message: 'is required' });
    }
  });

const bindingInputSchema = z
  .object({
    schemaVersion: z.literal('operator-media-binding-v1'),
    expected: expectedMediaSchema.extend({ state: z.literal('redacted_derivative') }),
    binding: z
      .object({
        purpose: z.literal('initial_publication'),
        targetType: z.literal('submission'),
        targetId: z.string().uuid(),
      })
      .strict(),
  })
  .strict();

export type MediaReviewInput = z.infer<typeof mediaReviewSchema>;
export type PublicDerivativeInput = z.infer<typeof derivativeInputSchema>;
export type MediaBindingInput = z.infer<typeof bindingInputSchema>;

export class MediaWorkflowError extends Error {
  constructor(
    public readonly code:
      | 'media_workflow_invalid'
      | 'media_integrity_mismatch'
      | 'media_transform_failed'
      | 'media_binding_target_invalid'
      | 'media_receipt_invalid',
    public readonly status: 400 | 409 | 503,
  ) {
    super(code);
    this.name = 'MediaWorkflowError';
  }
}

export function parseMediaReviewInput(value: unknown): MediaReviewInput {
  const result = mediaReviewSchema.safeParse(value);
  if (!result.success) throw new MediaWorkflowError('media_workflow_invalid', 400);
  return result.data;
}

export function parsePublicDerivativeInput(value: unknown): PublicDerivativeInput {
  const result = derivativeInputSchema.safeParse(value);
  if (!result.success) throw new MediaWorkflowError('media_workflow_invalid', 400);
  return result.data;
}

export function parseMediaBindingInput(value: unknown): MediaBindingInput {
  const result = bindingInputSchema.safeParse(value);
  if (!result.success) throw new MediaWorkflowError('media_workflow_invalid', 400);
  return result.data;
}

function byteaHex(value: unknown): string {
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
  if (typeof value === 'string') return value.replace(/^\\x/, '');
  throw new Error('database_hash_invalid');
}

async function requireOperatorMutations(query: QueryExecutor): Promise<void> {
  const switches = await query.query(
    `select nagarik.is_capability_enabled('operatorMutationsEnabled') as enabled`,
  );
  if (switches[0]?.enabled !== true) {
    throw new OperatorMutationError('operator_mutations_disabled', 503);
  }
}

function stableObject<T>(value: unknown): T {
  if (!value || typeof value !== 'object') throw new Error('stored_media_response_invalid');
  return value as T;
}

export async function reviewPrivateMedia(
  input: {
    mediaId: string;
    idempotencyKey: string;
    actor: OperatorMutationActor;
    review: MediaReviewInput;
  },
  dependencies: OperatorMutationDependencies,
) {
  const now = dependencies.now?.() ?? new Date();
  type Stable = {
    mediaId: string;
    state: 'approved_private' | 'rejected';
    version: number;
  };
  const result = await dependencies.transaction(async (query) => {
    const reservation = await reserveOperatorMutation<Stable>(query, {
      scope: `operator:media-review:${input.mediaId}`,
      actor: input.actor,
      idempotencyKey: input.idempotencyKey,
      request: input.review,
      correlationKey: dependencies.correlationKey,
      now,
    });
    if (reservation.disposition === 'replay') {
      return { replayed: true, value: stableObject<Stable>(reservation.response) };
    }
    await requireOperatorMutations(query);
    const rows = await query.query(
      `select id, state, version
       from nagarik.media_objects
       where id = $1::uuid and organization_id = $2::uuid
       for update`,
      [input.mediaId, input.actor.organizationId],
    );
    const media = rows[0];
    if (!media) throw new OperatorMutationError('resource_not_found', 404);
    if (
      String(media.state) !== input.review.expected.state ||
      Number(media.version) !== input.review.expected.version
    ) {
      throw new OperatorMutationError('stale_resource_version', 409);
    }
    const state = input.review.decision === 'approve_private' ? 'approved_private' : 'rejected';
    const version = Number(media.version) + 1;
    await query.query(
      `update nagarik.media_objects
       set state = $2,
           version = version + 1,
           denied_at = case when $2 = 'rejected' then $3::timestamptz else denied_at end,
           updated_at = $3::timestamptz
       where id = $1::uuid`,
      [input.mediaId, state, now.toISOString()],
    );
    await query.query(
      `insert into nagarik.audit_events(
         id, organization_id, actor_type, actor_key, action,
         resource_type, resource_id, request_id, detail, occurred_at
       )
       values (
         $1::uuid, $2::uuid, 'operator', decode($3, 'hex'), $4,
         'media', $5::uuid, $6::uuid, $7::jsonb, $8::timestamptz
       )`,
      [
        deterministicUuid(
          'nagarik:v2:media-review-audit',
          `${input.mediaId}:${input.idempotencyKey}`,
        ),
        input.actor.organizationId,
        reservation.actorKey,
        `media_${input.review.decision}`,
        input.mediaId,
        deterministicUuidV4(
          'nagarik:v2:media-review-request',
          `${input.mediaId}:${input.idempotencyKey}`,
        ),
        JSON.stringify({
          previousState: media.state,
          nextState: state,
          reasonCode: input.review.reasonCode,
        }),
        now.toISOString(),
      ],
    );
    const response: Stable = { mediaId: input.mediaId, state, version };
    await completeOperatorMutation(query, {
      recordId: reservation.recordId,
      requestHash: reservation.requestHash,
      status: 200,
      response,
      resourceId: input.mediaId,
    });
    return { replayed: false, value: response };
  });
  return { replayed: result.replayed, ...result.value };
}

type DerivativeDependencies = OperatorMutationDependencies & {
  read(storageKey: string, maximumBytes?: number): Promise<{ bytes: Buffer; contentType: string }>;
  write(input: {
    storageKey: string;
    bytes: Uint8Array;
    contentType: 'image/jpeg' | 'image/webp';
  }): Promise<PrivateStagedObject>;
  remove(object: PrivateStagedObject): Promise<void>;
  storageMode: PrivateStagedObject['storageMode'];
  durablePrefix: string;
  render?: typeof renderPublicDerivative;
};

function derivativeStorageKey(input: {
  prefix: string;
  correlationKey: string;
  organizationId: string;
  sourceMediaId: string;
  derivativeMediaId: string;
  extension: 'jpg' | 'webp';
}): string {
  if (!/^private\/[a-z0-9-]+\/$/.test(input.prefix)) {
    throw new Error('private_durable_prefix_invalid');
  }
  const discriminator = createHmac('sha256', input.correlationKey)
    .update(
      `public-derivative:${input.organizationId}:${input.sourceMediaId}:${input.derivativeMediaId}`,
    )
    .digest('hex')
    .slice(0, 32);
  return `${input.prefix}${input.organizationId.replaceAll('-', '')}/${discriminator}/${input.derivativeMediaId.replaceAll('-', '')}.${input.extension}`;
}

export async function createPublicDerivative(
  input: {
    sourceMediaId: string;
    idempotencyKey: string;
    actor: OperatorMutationActor;
    derivative: PublicDerivativeInput;
  },
  dependencies: DerivativeDependencies,
) {
  const now = dependencies.now?.() ?? new Date();
  const identity = `${input.sourceMediaId}:${input.actor.subjectId}:${input.idempotencyKey}`;
  const derivativeMediaId = deterministicUuidV4('nagarik:v2:public-derivative', identity);
  let written: PrivateStagedObject | null = null;
  let committed = false;
  type Stable = {
    sourceMediaId: string;
    mediaId: string;
    state: 'redacted_derivative';
    version: 1;
    mimeType: 'image/jpeg' | 'image/webp';
    byteLength: number;
    width: number;
    height: number;
    sha256: string;
  };

  try {
    const result = await dependencies.transaction(async (query) => {
      const reservation = await reserveOperatorMutation<Stable>(query, {
        scope: `operator:public-derivative:${input.sourceMediaId}`,
        actor: input.actor,
        idempotencyKey: input.idempotencyKey,
        request: input.derivative,
        correlationKey: dependencies.correlationKey,
        now,
      });
      if (reservation.disposition === 'replay') {
        return { replayed: true, value: stableObject<Stable>(reservation.response) };
      }
      await requireOperatorMutations(query);
      const rows = await query.query(
        `select
           id, state, version, storage_key, mime_type, sha256,
           byte_length, width, height
         from nagarik.media_objects
         where id = $1::uuid and organization_id = $2::uuid
         for update`,
        [input.sourceMediaId, input.actor.organizationId],
      );
      const source = rows[0];
      if (!source) throw new OperatorMutationError('resource_not_found', 404);
      if (
        String(source.state) !== input.derivative.expected.state ||
        Number(source.version) !== input.derivative.expected.version
      ) {
        throw new OperatorMutationError('stale_resource_version', 409);
      }

      const sourceHash = byteaHex(source.sha256);
      const sourceObject = await dependencies.read(
        String(source.storage_key),
        Number(source.byte_length),
      );
      if (
        sourceObject.contentType !== source.mime_type ||
        sourceObject.bytes.byteLength !== Number(source.byte_length) ||
        createHash('sha256').update(sourceObject.bytes).digest('hex') !== sourceHash
      ) {
        throw new MediaWorkflowError('media_integrity_mismatch', 409);
      }

      let derivative: PublicDerivative;
      try {
        derivative = await (dependencies.render ?? renderPublicDerivative)({
          sourceMediaId: input.sourceMediaId,
          sourceSha256: sourceHash,
          sourceWidth: Number(source.width),
          sourceHeight: Number(source.height),
          sourceMimeType: source.mime_type as 'image/jpeg' | 'image/webp',
          sourceBytes: sourceObject.bytes,
          rectangles: input.derivative.rectangles,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          ['redaction_rectangle_invalid', 'redaction_rectangle_limit_exceeded'].includes(
            error.message,
          )
        ) {
          throw new MediaWorkflowError('media_workflow_invalid', 400);
        }
        throw new MediaWorkflowError('media_transform_failed', 409);
      }

      const storageKey = derivativeStorageKey({
        prefix: dependencies.durablePrefix,
        correlationKey: dependencies.correlationKey,
        organizationId: input.actor.organizationId,
        sourceMediaId: input.sourceMediaId,
        derivativeMediaId,
        extension: derivative.extension,
      });
      try {
        written = await dependencies.write({
          storageKey,
          bytes: derivative.bytes,
          contentType: derivative.mimeType,
        });
      } catch {
        const existing = await dependencies.read(storageKey, derivative.byteLength);
        if (
          existing.contentType !== derivative.mimeType ||
          existing.bytes.byteLength !== derivative.byteLength ||
          createHash('sha256').update(existing.bytes).digest('hex') !== derivative.sha256
        ) {
          throw new MediaWorkflowError('media_transform_failed', 503);
        }
      }

      await query.query(
        `insert into nagarik.media_objects(
           id, organization_id, source_media_id, state, purpose,
           storage_class, storage_key, mime_type, normalization_version,
           sha256, byte_length, width, height, transform_manifest,
           expires_at, created_at, updated_at
         )
         values (
           $1::uuid, $2::uuid, $3::uuid, 'redacted_derivative', 'public_derivative',
           'durable_private', $4, $5, 'image-v2',
           decode($6, 'hex'), $7, $8, $9, $10::jsonb,
           $11::timestamptz, $12::timestamptz, $12::timestamptz
         )`,
        [
          derivativeMediaId,
          input.actor.organizationId,
          input.sourceMediaId,
          storageKey,
          derivative.mimeType,
          derivative.sha256,
          derivative.byteLength,
          derivative.width,
          derivative.height,
          JSON.stringify({
            ...derivative.manifest,
            review: {
              decision: input.derivative.reviewDecision,
              actorSubject: input.actor.subjectId,
              reasonCodes: [...new Set(input.derivative.rectangles.map((item) => item.reasonCode))],
              privateNote: input.derivative.privateNote ?? null,
              reviewedAt: now.toISOString(),
            },
          }),
          new Date(now.getTime() + 90 * 24 * 60 * 60_000).toISOString(),
          now.toISOString(),
        ],
      );
      await query.query(
        `insert into nagarik.audit_events(
           id, organization_id, actor_type, actor_key, action,
           resource_type, resource_id, request_id, detail, occurred_at
         )
         values (
           $1::uuid, $2::uuid, 'operator', decode($3, 'hex'), 'public_derivative_created',
           'media', $4::uuid, $5::uuid, $6::jsonb, $7::timestamptz
         )`,
        [
          deterministicUuid('nagarik:v2:derivative-audit', identity),
          input.actor.organizationId,
          reservation.actorKey,
          derivativeMediaId,
          deterministicUuidV4('nagarik:v2:derivative-request', identity),
          JSON.stringify({
            sourceMediaId: input.sourceMediaId,
            transformVersion: derivative.manifest.transformVersion,
            redactionCount: derivative.manifest.rectangles.length,
          }),
          now.toISOString(),
        ],
      );
      const response: Stable = {
        sourceMediaId: input.sourceMediaId,
        mediaId: derivativeMediaId,
        state: 'redacted_derivative',
        version: 1,
        mimeType: derivative.mimeType,
        byteLength: derivative.byteLength,
        width: derivative.width,
        height: derivative.height,
        sha256: derivative.sha256,
      };
      await completeOperatorMutation(query, {
        recordId: reservation.recordId,
        requestHash: reservation.requestHash,
        status: 201,
        response,
        resourceId: derivativeMediaId,
      });
      return { replayed: false, value: response };
    });
    committed = true;
    return { replayed: result.replayed, ...result.value };
  } finally {
    if (!committed && written) await dependencies.remove(written).catch(() => undefined);
  }
}

type BindingDependencies = OperatorMutationDependencies & {
  keys: CapabilityKeys;
};

export async function issueMediaBindingReceipt(
  input: {
    mediaId: string;
    idempotencyKey: string;
    actor: OperatorMutationActor;
    binding: MediaBindingInput;
  },
  dependencies: BindingDependencies,
) {
  const now = dependencies.now?.() ?? new Date();
  const identity = `${input.mediaId}:${input.actor.subjectId}:${input.idempotencyKey}`;
  const capabilityId = deterministicUuidV4('nagarik:v2:operator-media-capability', identity);
  type Stable = {
    capabilityId: string;
    mediaId: string;
    mediaVersion: number;
    evidenceHash: string;
    sourceMediaId: string;
    purpose: 'initial_publication';
    targetType: 'submission';
    targetId: string;
    issuedBy: string;
    expiresAt: string;
  };
  const result = await dependencies.transaction(async (query) => {
    const reservation = await reserveOperatorMutation<Stable>(query, {
      scope: `operator:media-binding:${input.mediaId}`,
      actor: input.actor,
      idempotencyKey: input.idempotencyKey,
      request: input.binding,
      correlationKey: dependencies.correlationKey,
      now,
    });
    if (reservation.disposition === 'replay') {
      return { replayed: true, value: stableObject<Stable>(reservation.response) };
    }
    await requireOperatorMutations(query);
    const rows = await query.query(
      `select
         media.id, media.source_media_id, media.state, media.version,
         encode(media.sha256, 'hex') as evidence_hash
       from nagarik.media_objects media
       where media.id = $1::uuid
         and media.organization_id = $2::uuid
       for update`,
      [input.mediaId, input.actor.organizationId],
    );
    const media = rows[0];
    if (!media) throw new OperatorMutationError('resource_not_found', 404);
    if (
      String(media.state) !== input.binding.expected.state ||
      Number(media.version) !== input.binding.expected.version ||
      !media.source_media_id
    ) {
      throw new OperatorMutationError('stale_resource_version', 409);
    }
    const targets = await query.query(
      `select submission.id
       from nagarik.submissions submission
       join nagarik.submission_revisions revision
         on revision.submission_id = submission.id
        and revision.revision_number = submission.current_revision_number
       join nagarik.submission_media link on link.revision_id = revision.id
       where submission.id = $1::uuid
         and submission.organization_id = $2::uuid
         and link.media_id = $3::uuid
       limit 1
       for share of submission`,
      [input.binding.binding.targetId, input.actor.organizationId, String(media.source_media_id)],
    );
    if (!targets[0]) throw new MediaWorkflowError('media_binding_target_invalid', 409);

    const expiresAt = new Date(now.getTime() + 24 * 60 * 60_000);
    const stable: Stable = {
      capabilityId,
      mediaId: input.mediaId,
      mediaVersion: Number(media.version),
      evidenceHash: String(media.evidence_hash),
      sourceMediaId: String(media.source_media_id),
      purpose: input.binding.binding.purpose,
      targetType: input.binding.binding.targetType,
      targetId: input.binding.binding.targetId,
      issuedBy: input.actor.subjectId,
      expiresAt: expiresAt.toISOString(),
    };
    const coordinates: CapabilityCoordinates = {
      keyVersion: 1,
      purpose: 'operator_media',
      organizationId: input.actor.organizationId,
      capabilityId,
      subjectId: input.mediaId,
      issuanceIdempotencyId: input.idempotencyKey,
    };
    const material = deriveCapabilityMaterial(coordinates, dependencies.keys);
    await query.query(
      `insert into nagarik.capabilities(
         id, organization_id, purpose, subject_id, issuance_idempotency_id,
         key_version, verifier, scope, expires_at, created_at
       )
       values (
         $1::uuid, $2::uuid, 7, $3::uuid, $4::uuid,
         1, decode($5, 'hex'), $6::jsonb, $7::timestamptz, $8::timestamptz
       )`,
      [
        capabilityId,
        input.actor.organizationId,
        input.mediaId,
        input.idempotencyKey,
        material.verifier.toString('hex'),
        JSON.stringify({
          schemaVersion: 'operator-media-binding-v1',
          purpose: stable.purpose,
          targetType: stable.targetType,
          targetId: stable.targetId,
          mediaId: stable.mediaId,
          mediaVersion: stable.mediaVersion,
          evidenceHash: stable.evidenceHash,
          sourceMediaId: stable.sourceMediaId,
          issuedBy: stable.issuedBy,
        }),
        stable.expiresAt,
        now.toISOString(),
      ],
    );
    await query.query(
      `insert into nagarik.audit_events(
         id, organization_id, actor_type, actor_key, action,
         resource_type, resource_id, request_id, detail, occurred_at
       )
       values (
         $1::uuid, $2::uuid, 'operator', decode($3, 'hex'), 'media_binding_issued',
         'media', $4::uuid, $5::uuid, $6::jsonb, $7::timestamptz
       )`,
      [
        deterministicUuid('nagarik:v2:media-binding-audit', identity),
        input.actor.organizationId,
        reservation.actorKey,
        input.mediaId,
        deterministicUuidV4('nagarik:v2:media-binding-request', identity),
        JSON.stringify({
          capabilityId,
          purpose: stable.purpose,
          targetType: stable.targetType,
          targetId: stable.targetId,
          expiresAt: stable.expiresAt,
        }),
        now.toISOString(),
      ],
    );
    await completeOperatorMutation(query, {
      recordId: reservation.recordId,
      requestHash: reservation.requestHash,
      status: 201,
      response: stable,
      resourceId: input.mediaId,
    });
    return { replayed: false, value: stable };
  });

  const coordinates: CapabilityCoordinates = {
    keyVersion: 1,
    purpose: 'operator_media',
    organizationId: input.actor.organizationId,
    capabilityId: result.value.capabilityId,
    subjectId: result.value.mediaId,
    issuanceIdempotencyId: input.idempotencyKey,
  };
  return {
    replayed: result.replayed,
    ...result.value,
    receipt: deriveCapabilityMaterial(coordinates, dependencies.keys).token,
  };
}

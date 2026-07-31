import { createHash } from 'node:crypto';

import type { QueryExecutor } from '../db/query';
import { canonicalize } from '../proof/canonicalize';
import { deriveCapabilityMaterial, type CapabilityKeys } from '../security/capabilityTokens';
import { deterministicUuid, keyedActorHash } from '../security/ids';
import type { IntakeCapability } from '../security/intakeCapabilityCore';
import type { PrivateStagedObject } from '../storage/privateStorage';

export type NormalizedUpload = {
  normalizationVersion: 'image-v2';
  mediaType: 'image/jpeg' | 'image/webp';
  extension: 'jpg' | 'webp';
  sanitizedSize: number;
  width: number;
  height: number;
  bytes: Buffer;
  evidenceHash: string;
};

export type StagedUploadResult = {
  replayed: boolean;
  mediaId: string;
  receipt: string;
  expiresAt: string;
  normalization: {
    version: 'image-v2';
    mimeType: 'image/jpeg' | 'image/webp';
    width: number;
    height: number;
    byteLength: number;
    sha256: string;
  };
  reviewState: 'staged';
};

export class UploadTransactionError extends Error {
  constructor(
    public readonly code:
      'idempotency_key_reused' | 'idempotency_in_progress' | 'media_storage_unavailable',
    public readonly status: 409 | 503,
  ) {
    super(code);
    this.name = 'UploadTransactionError';
  }
}

type Dependencies = {
  stage(input: {
    organizationId: string;
    mediaId: string;
    extension: 'jpg' | 'webp';
    mediaType: 'image/jpeg' | 'image/webp';
    bytes: Uint8Array;
  }): Promise<PrivateStagedObject>;
  remove(object: PrivateStagedObject): Promise<void>;
  transaction<T>(operation: (query: QueryExecutor) => Promise<T>): Promise<T>;
  keys: CapabilityKeys;
  correlationKey: string;
  now?: () => Date;
};

type StableUpload = Omit<StagedUploadResult, 'receipt' | 'replayed'> & {
  receiptCapabilityId: string;
};

function uploadCoordinates(input: {
  intake: IntakeCapability;
  idempotencyKey: string;
  mediaId: string;
  receiptCapabilityId: string;
}) {
  return {
    keyVersion: 1,
    purpose: 'submission_media' as const,
    organizationId: input.intake.organizationId,
    capabilityId: input.receiptCapabilityId,
    subjectId: input.mediaId,
    issuanceIdempotencyId: input.idempotencyKey,
  };
}

function stableFromRow(value: unknown): StableUpload {
  if (!value || typeof value !== 'object') throw new Error('stored_upload_response_invalid');
  return value as StableUpload;
}

export async function createStagedUpload(
  input: {
    intake: IntakeCapability;
    idempotencyKey: string;
    normalized: NormalizedUpload;
  },
  dependencies: Dependencies,
): Promise<StagedUploadResult> {
  const now = dependencies.now?.() ?? new Date();
  const identity = `${input.intake.organizationId}:${input.intake.capabilityId}:${input.idempotencyKey}`;
  const mediaId = deterministicUuid('nagarik:v2:upload:media', identity);
  const receiptCapabilityId = deterministicUuid('nagarik:v2:upload:receipt', identity);
  const idempotencyRecordId = deterministicUuid('nagarik:v2:upload:idempotency', identity);
  const auditId = deterministicUuid('nagarik:v2:upload:audit', identity);
  const requestId = deterministicUuid('nagarik:v2:upload:request', identity);
  const receiptExpiresAt = new Date(
    Math.min(now.getTime() + 30 * 60_000, input.intake.expiresAt.getTime()),
  );
  const mediaExpiresAt = new Date(now.getTime() + 24 * 60 * 60_000);
  const idempotencyExpiresAt = new Date(now.getTime() + 24 * 60 * 60_000);
  const actorKey = keyedActorHash(
    dependencies.correlationKey,
    `capability:${input.intake.capabilityId}`,
  );
  const requestHash = createHash('sha256')
    .update(
      canonicalize({
        schemaVersion: 'private-upload-v2',
        organizationId: input.intake.organizationId,
        intakeCapabilityId: input.intake.capabilityId,
        normalizationVersion: input.normalized.normalizationVersion,
        mimeType: input.normalized.mediaType,
        width: input.normalized.width,
        height: input.normalized.height,
        byteLength: input.normalized.sanitizedSize,
        sha256: input.normalized.evidenceHash,
      }),
    )
    .digest('hex');

  let staged: PrivateStagedObject;
  try {
    staged = await dependencies.stage({
      organizationId: input.intake.organizationId,
      mediaId,
      extension: input.normalized.extension,
      mediaType: input.normalized.mediaType,
      bytes: input.normalized.bytes,
    });
  } catch {
    throw new UploadTransactionError('media_storage_unavailable', 503);
  }

  try {
    const transactionResult = await dependencies.transaction(async (query) => {
      const reservations = await query.query(
        `select *
         from nagarik.reserve_idempotency(
           $1::uuid,
           $2::uuid,
           $3,
           decode($4, 'hex'),
           $5::uuid,
           decode($6, 'hex'),
           $7::timestamptz
         )`,
        [
          idempotencyRecordId,
          input.intake.organizationId,
          `v2:upload:${input.intake.organizationId}:${input.intake.capabilityId}`,
          actorKey,
          input.idempotencyKey,
          requestHash,
          idempotencyExpiresAt.toISOString(),
        ],
      );
      const reservation = reservations[0];
      const disposition = String(reservation?.disposition ?? '');
      if (disposition === 'conflict') {
        throw new UploadTransactionError('idempotency_key_reused', 409);
      }
      if (disposition === 'in_progress') {
        throw new UploadTransactionError('idempotency_in_progress', 409);
      }
      if (disposition === 'replay') {
        return {
          replayed: true,
          stable: stableFromRow(reservation?.response_body),
        };
      }
      if (disposition !== 'reserved') throw new Error('idempotency_reservation_invalid');

      const coordinates = uploadCoordinates({
        intake: input.intake,
        idempotencyKey: input.idempotencyKey,
        mediaId,
        receiptCapabilityId,
      });
      const receipt = deriveCapabilityMaterial(coordinates, dependencies.keys);
      const stable: StableUpload = {
        mediaId,
        receiptCapabilityId,
        expiresAt: receiptExpiresAt.toISOString(),
        normalization: {
          version: 'image-v2',
          mimeType: input.normalized.mediaType,
          width: input.normalized.width,
          height: input.normalized.height,
          byteLength: input.normalized.sanitizedSize,
          sha256: input.normalized.evidenceHash,
        },
        reviewState: 'staged',
      };

      await query.query(
        `insert into nagarik.media_objects(
           id,
           organization_id,
           state,
           purpose,
           storage_class,
           storage_key,
           mime_type,
           normalization_version,
           sha256,
           byte_length,
           width,
           height,
           transform_manifest,
           expires_at,
           created_at,
           updated_at
         )
         values (
           $1::uuid,
           $2::uuid,
           'staged',
           'submission',
           'staging_private',
           $3,
           $4,
           'image-v2',
           decode($5, 'hex'),
           $6,
           $7,
           $8,
           $9::jsonb,
           $10::timestamptz,
           $11::timestamptz,
           $11::timestamptz
         )`,
        [
          mediaId,
          input.intake.organizationId,
          staged.storageKey,
          input.normalized.mediaType,
          input.normalized.evidenceHash,
          input.normalized.sanitizedSize,
          input.normalized.width,
          input.normalized.height,
          JSON.stringify({
            version: 'image-v2',
            sourceMimeTypeAccepted: true,
            metadataPreserved: false,
          }),
          mediaExpiresAt.toISOString(),
          now.toISOString(),
        ],
      );
      await query.query(
        `insert into nagarik.capabilities(
           id,
           organization_id,
           purpose,
           subject_id,
           issuance_idempotency_id,
           key_version,
           verifier,
           scope,
           expires_at,
           created_at
         )
         values (
           $1::uuid,
           $2::uuid,
           6,
           $3::uuid,
           $4::uuid,
           1,
           decode($5, 'hex'),
           $6::jsonb,
           $7::timestamptz,
           $8::timestamptz
         )`,
        [
          receiptCapabilityId,
          input.intake.organizationId,
          mediaId,
          input.idempotencyKey,
          receipt.verifier.toString('hex'),
          JSON.stringify({
            parentCapabilityId: input.intake.capabilityId,
            mediaId,
            sha256: input.normalized.evidenceHash,
            purpose: 'submission',
          }),
          receiptExpiresAt.toISOString(),
          now.toISOString(),
        ],
      );
      await query.query(
        `insert into nagarik.audit_events(
           id,
           organization_id,
           actor_type,
           actor_key,
           action,
           resource_type,
           resource_id,
           request_id,
           detail,
           occurred_at
         )
         values (
           $1::uuid,
           $2::uuid,
           'capability',
           decode($3, 'hex'),
           'media_staged',
           'media',
           $4::uuid,
           $5::uuid,
           $6::jsonb,
           $7::timestamptz
         )`,
        [
          auditId,
          input.intake.organizationId,
          actorKey,
          mediaId,
          requestId,
          JSON.stringify({
            normalizationVersion: 'image-v2',
            byteLength: input.normalized.sanitizedSize,
          }),
          now.toISOString(),
        ],
      );
      await query.query(
        `select nagarik.complete_idempotency(
           $1::uuid,
           decode($2, 'hex'),
           201,
           $3::jsonb,
           $4::uuid
         )`,
        [idempotencyRecordId, requestHash, JSON.stringify(stable), mediaId],
      );

      return { replayed: false, stable };
    });

    if (transactionResult.replayed) {
      await dependencies.remove(staged).catch(() => undefined);
    }
    const stable = transactionResult.stable;
    const coordinates = uploadCoordinates({
      intake: input.intake,
      idempotencyKey: input.idempotencyKey,
      mediaId: stable.mediaId,
      receiptCapabilityId: stable.receiptCapabilityId,
    });
    const receipt = deriveCapabilityMaterial(coordinates, dependencies.keys).token;
    return {
      replayed: transactionResult.replayed,
      mediaId: stable.mediaId,
      receipt,
      expiresAt: stable.expiresAt,
      normalization: stable.normalization,
      reviewState: stable.reviewState,
    };
  } catch (error) {
    await dependencies.remove(staged).catch(() => undefined);
    throw error;
  }
}

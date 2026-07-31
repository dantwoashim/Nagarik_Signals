import { createHash, createHmac } from 'node:crypto';

import type { QueryExecutor } from '../db/query';
import {
  parsePilotGeometryPolicy,
  validatePrivateLocation,
  type PilotGeometryPolicy,
} from '../geo/pilotGeometry';
import { canonicalize } from '../proof/canonicalize';
import {
  deriveCapabilityMaterial,
  parseCapabilityToken,
  verifyCapabilityToken,
  type CapabilityKeys,
  type CapabilityCoordinates,
} from '../security/capabilityTokens';
import { deterministicUuid, keyedActorHash } from '../security/ids';
import type { IntakeCapability } from '../security/intakeCapabilityCore';
import type { SubmissionInput } from './submissionInput';

export class SubmissionTransactionError extends Error {
  constructor(
    public readonly code:
      | 'idempotency_key_reused'
      | 'idempotency_in_progress'
      | 'media_receipt_invalid'
      | 'media_receipt_expired'
      | 'media_receipt_consumed'
      | 'pilot_policy_unavailable',
    public readonly status: 400 | 409 | 503,
  ) {
    super(code);
    this.name = 'SubmissionTransactionError';
  }
}

export type SubmissionResult = {
  replayed: boolean;
  submissionId: string;
  trackingId: string;
  recoveryToken: string;
  trackingExpiresAt: string;
  state: 'received';
  receivedAt: string;
  media: { state: 'promotion_pending' };
  next: 'review';
};

type StableSubmission = Omit<SubmissionResult, 'replayed' | 'recoveryToken'> & {
  trackingCapabilityId: string;
};

type Dependencies = {
  transaction<T>(operation: (query: QueryExecutor) => Promise<T>): Promise<T>;
  keys: CapabilityKeys;
  correlationKey: string;
  durablePrefix: string;
  now?: () => Date;
};

type ReceiptRecord = {
  coordinates: CapabilityCoordinates;
  verifier: Uint8Array;
  state: string;
  expiresAt: Date;
  scope: Record<string, unknown>;
  media: {
    id: string;
    organizationId: string;
    state: string;
    purpose: string;
    storageClass: string;
    storageKey: string;
    mimeType: 'image/jpeg' | 'image/webp';
    sha256: string;
    byteLength: number;
    width: number;
    height: number;
    expiresAt: Date | null;
  };
};

function stableFromRow(value: unknown): StableSubmission {
  if (!value || typeof value !== 'object') {
    throw new Error('stored_submission_response_invalid');
  }
  return value as StableSubmission;
}

function parseScope(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function byteaHex(value: unknown): string {
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
  if (typeof value === 'string') return value.replace(/^\\x/, '');
  throw new Error('database_hash_invalid');
}

function receiptFromRow(row: Record<string, unknown>): ReceiptRecord {
  return {
    coordinates: {
      keyVersion: Number(row.key_version),
      purpose: 'submission_media',
      organizationId: String(row.organization_id),
      capabilityId: String(row.capability_id),
      subjectId: String(row.subject_id),
      issuanceIdempotencyId: String(row.issuance_idempotency_id),
    },
    verifier: row.verifier as Uint8Array,
    state: String(row.capability_state),
    expiresAt: new Date(String(row.capability_expires_at)),
    scope: parseScope(row.scope),
    media: {
      id: String(row.media_id),
      organizationId: String(row.media_organization_id),
      state: String(row.media_state),
      purpose: String(row.media_purpose),
      storageClass: String(row.storage_class),
      storageKey: String(row.storage_key),
      mimeType: row.mime_type as 'image/jpeg' | 'image/webp',
      sha256: byteaHex(row.media_sha256),
      byteLength: Number(row.byte_length),
      width: Number(row.width),
      height: Number(row.height),
      expiresAt: row.media_expires_at ? new Date(String(row.media_expires_at)) : null,
    },
  };
}

function receiptBindingValid(receipt: ReceiptRecord, intake: IntakeCapability): boolean {
  return (
    receipt.coordinates.organizationId === intake.organizationId &&
    receipt.media.organizationId === intake.organizationId &&
    receipt.coordinates.subjectId === receipt.media.id &&
    receipt.scope.parentCapabilityId === intake.capabilityId &&
    receipt.scope.mediaId === receipt.media.id &&
    receipt.scope.sha256 === receipt.media.sha256 &&
    receipt.scope.purpose === 'submission' &&
    receipt.media.purpose === 'submission' &&
    receipt.media.storageClass === 'staging_private'
  );
}

function trackingCoordinates(input: {
  intake: IntakeCapability;
  idempotencyKey: string;
  submissionId: string;
  trackingCapabilityId: string;
}): CapabilityCoordinates {
  return {
    keyVersion: 1,
    purpose: 'submission_tracking',
    organizationId: input.intake.organizationId,
    capabilityId: input.trackingCapabilityId,
    subjectId: input.submissionId,
    issuanceIdempotencyId: input.idempotencyKey,
  };
}

function durableKey(input: {
  prefix: string;
  correlationKey: string;
  organizationId: string;
  mediaId: string;
  mimeType: 'image/jpeg' | 'image/webp';
}): string {
  if (!/^private\/[a-z0-9-]+\/$/.test(input.prefix)) {
    throw new Error('private_durable_prefix_invalid');
  }
  const discriminator = createHmac('sha256', input.correlationKey)
    .update(`media-promotion:${input.organizationId}:${input.mediaId}`)
    .digest('hex')
    .slice(0, 32);
  const extension = input.mimeType === 'image/webp' ? 'webp' : 'jpg';
  return `${input.prefix}${input.organizationId.replaceAll('-', '')}/${discriminator}/${input.mediaId.replaceAll('-', '')}.${extension}`;
}

async function activePilotPolicy(
  query: QueryExecutor,
  intake: IntakeCapability,
): Promise<PilotGeometryPolicy> {
  const rows = await query.query(
    `select boundary_version, ward_geometry_version, boundary_geojson
     from nagarik.pilot_policies
     where organization_id = $1::uuid
       and state = 'active'
       and boundary_version = $2
     limit 1
     for share`,
    [intake.organizationId, intake.pilotPolicyVersion],
  );
  const row = rows[0];
  if (!row) throw new SubmissionTransactionError('pilot_policy_unavailable', 503);
  try {
    return parsePilotGeometryPolicy({
      boundaryVersion: String(row.boundary_version),
      wardGeometryVersion: String(row.ward_geometry_version),
      boundaryGeojson: row.boundary_geojson,
    });
  } catch {
    throw new SubmissionTransactionError('pilot_policy_unavailable', 503);
  }
}

export async function createPrivateSubmission(
  input: {
    intake: IntakeCapability;
    idempotencyKey: string;
    submission: SubmissionInput;
  },
  dependencies: Dependencies,
): Promise<SubmissionResult> {
  const parsedReceipt = parseCapabilityToken(input.submission.mediaReceipt);
  if (!parsedReceipt || parsedReceipt.purpose !== 'submission_media') {
    throw new SubmissionTransactionError('media_receipt_invalid', 400);
  }

  const now = dependencies.now?.() ?? new Date();
  const identity = `${input.intake.organizationId}:${input.intake.capabilityId}:${input.idempotencyKey}`;
  const submissionId = deterministicUuid('nagarik:v2:submission', identity);
  const trackingId = deterministicUuid('nagarik:v2:tracking-id', identity);
  const revisionId = deterministicUuid('nagarik:v2:submission-revision', identity);
  const trackingCapabilityId = deterministicUuid(
    'nagarik:v2:submission-tracking-capability',
    identity,
  );
  const idempotencyRecordId = deterministicUuid('nagarik:v2:submission-idempotency', identity);
  const outboxId = deterministicUuid('nagarik:v2:media-promotion-outbox', identity);
  const auditId = deterministicUuid('nagarik:v2:submission-audit', identity);
  const requestId = deterministicUuid('nagarik:v2:submission-request', identity);
  const receivedAt = now.toISOString();
  const trackingExpiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60_000);
  const idempotencyExpiresAt = new Date(now.getTime() + 24 * 60 * 60_000);
  const actorKey = keyedActorHash(
    dependencies.correlationKey,
    `capability:${input.intake.capabilityId}`,
  );
  const requestHash = createHash('sha256')
    .update(
      canonicalize({
        ...input.submission,
        mediaReceipt: {
          capabilityId: parsedReceipt.capabilityId,
          keyVersion: parsedReceipt.keyVersion,
        },
        intakeCapabilityId: input.intake.capabilityId,
      }),
    )
    .digest('hex');

  const result = await dependencies.transaction(async (query) => {
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
         capability.expires_at as capability_expires_at,
         media.id as media_id,
         media.organization_id as media_organization_id,
         media.state as media_state,
         media.purpose as media_purpose,
         media.storage_class,
         media.storage_key,
         media.mime_type,
         media.sha256 as media_sha256,
         media.byte_length,
         media.width,
         media.height,
         media.expires_at as media_expires_at
       from nagarik.capabilities capability
       join nagarik.media_objects media on media.id = capability.subject_id
       where capability.id = $1::uuid
         and capability.purpose = 6
       for update of capability, media`,
      [parsedReceipt.capabilityId],
    );
    if (receiptRows.length !== 1) {
      throw new SubmissionTransactionError('media_receipt_invalid', 400);
    }
    const receipt = receiptFromRow(receiptRows[0]);
    if (
      !receiptBindingValid(receipt, input.intake) ||
      !verifyCapabilityToken(
        input.submission.mediaReceipt,
        { ...receipt.coordinates, verifier: receipt.verifier },
        dependencies.keys,
      )
    ) {
      throw new SubmissionTransactionError('media_receipt_invalid', 400);
    }

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
        `v2:submission:${input.intake.organizationId}:${input.intake.capabilityId}`,
        actorKey,
        input.idempotencyKey,
        requestHash,
        idempotencyExpiresAt.toISOString(),
      ],
    );
    const reservation = reservations[0];
    const disposition = String(reservation?.disposition ?? '');
    if (disposition === 'conflict') {
      throw new SubmissionTransactionError('idempotency_key_reused', 409);
    }
    if (disposition === 'in_progress') {
      throw new SubmissionTransactionError('idempotency_in_progress', 409);
    }
    if (disposition === 'replay') {
      return {
        replayed: true,
        stable: stableFromRow(reservation?.response_body),
      };
    }
    if (disposition !== 'reserved') throw new Error('idempotency_reservation_invalid');

    if (receipt.state !== 'active') {
      throw new SubmissionTransactionError('media_receipt_consumed', 409);
    }
    if (
      receipt.expiresAt.getTime() <= now.getTime() ||
      (receipt.media.expiresAt && receipt.media.expiresAt.getTime() <= now.getTime())
    ) {
      throw new SubmissionTransactionError('media_receipt_expired', 400);
    }
    if (receipt.media.state !== 'staged') {
      throw new SubmissionTransactionError('media_receipt_consumed', 409);
    }

    const policy = await activePilotPolicy(query, input.intake);
    const location = validatePrivateLocation({
      latitudeE6: input.submission.location.latitudeE6,
      longitudeE6: input.submission.location.longitudeE6,
      wardId: input.submission.location.wardId,
      geometryVersion: input.submission.location.geometryVersion,
      intakePolicyVersion: input.intake.pilotPolicyVersion,
      policy,
    });

    const destinationStorageKey = durableKey({
      prefix: dependencies.durablePrefix,
      correlationKey: dependencies.correlationKey,
      organizationId: input.intake.organizationId,
      mediaId: receipt.media.id,
      mimeType: receipt.media.mimeType,
    });
    const promotionPayload = {
      schemaVersion: 'media-promotion-v1',
      organizationId: input.intake.organizationId,
      submissionId,
      mediaId: receipt.media.id,
      sourceStorageKey: receipt.media.storageKey,
      destinationStorageKey,
      expected: {
        sha256: receipt.media.sha256,
        byteLength: receipt.media.byteLength,
        mimeType: receipt.media.mimeType,
      },
    };
    const canonicalPromotion = canonicalize(promotionPayload);
    const payloadHash = createHash('sha256').update(canonicalPromotion).digest('hex');
    const operationId = createHash('sha256')
      .update('nagarik:outbox:media-promotion:v1\0')
      .update(canonicalPromotion)
      .digest('hex');
    const tracking = deriveCapabilityMaterial(
      trackingCoordinates({
        intake: input.intake,
        idempotencyKey: input.idempotencyKey,
        submissionId,
        trackingCapabilityId,
      }),
      dependencies.keys,
    );
    const stable: StableSubmission = {
      submissionId,
      trackingId,
      trackingCapabilityId,
      trackingExpiresAt: trackingExpiresAt.toISOString(),
      state: 'received',
      receivedAt,
      media: { state: 'promotion_pending' },
      next: 'review',
    };

    await query.query(
      `insert into nagarik.submissions(
         id,
         tracking_id,
         organization_id,
         record_kind,
         state,
         current_revision_number,
         received_at,
         created_at,
         updated_at
       )
       values (
         $1::uuid,
         $2::uuid,
         $3::uuid,
         'community_report',
         'received',
         1,
         $4::timestamptz,
         $4::timestamptz,
         $4::timestamptz
       )`,
      [submissionId, trackingId, input.intake.organizationId, receivedAt],
    );
    await query.query(
      `insert into nagarik.submission_revisions(
         id,
         submission_id,
         revision_number,
         title,
         narrative,
         category,
         observed_on,
         lat_e3,
         lng_e3,
         ward_id,
         ward_geometry_version,
         locality_label,
         provenance_private,
         created_at
       )
       values (
         $1::uuid,
         $2::uuid,
         1,
         $3,
         $4,
         $5,
         $6::date,
         $7,
         $8,
         $9,
         $10,
         $11,
         $12::jsonb,
         $13::timestamptz
       )`,
      [
        revisionId,
        submissionId,
        input.submission.title,
        input.submission.description,
        input.submission.category,
        input.submission.observedOn,
        location.latitudeE3,
        location.longitudeE3,
        input.submission.location.wardId,
        policy.wardGeometryVersion,
        input.submission.location.localityLabel ?? null,
        JSON.stringify({
          schemaVersion: 'community-report-private-v1',
          intakeCapabilityId: input.intake.capabilityId,
          pilotBoundaryVersion: policy.boundaryVersion,
          acknowledgements: input.submission.acknowledgements,
          candidatePublicLocation: location.publicLocation,
        }),
        receivedAt,
      ],
    );
    await query.query(
      `insert into nagarik.submission_media(revision_id, media_id, position)
       values ($1::uuid, $2::uuid, 0)`,
      [revisionId, receipt.media.id],
    );
    await query.query(
      `update nagarik.media_objects
       set
         state = 'promotion_pending',
         version = version + 1,
         updated_at = $2::timestamptz
       where id = $1::uuid
         and state = 'staged'`,
      [receipt.media.id, receivedAt],
    );
    await query.query(
      `update nagarik.capabilities
       set state = 'consumed', consumed_at = $2::timestamptz
       where id = $1::uuid
         and state = 'active'`,
      [receipt.coordinates.capabilityId, receivedAt],
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
         4,
         $3::uuid,
         $4::uuid,
         1,
         decode($5, 'hex'),
         $6::jsonb,
         $7::timestamptz,
         $8::timestamptz
       )`,
      [
        trackingCapabilityId,
        input.intake.organizationId,
        submissionId,
        input.idempotencyKey,
        tracking.verifier.toString('hex'),
        JSON.stringify({
          submissionId,
          trackingId,
          actions: ['read', 'revise', 'withdraw', 'privacy'],
        }),
        trackingExpiresAt.toISOString(),
        receivedAt,
      ],
    );
    await query.query(
      `insert into nagarik.outbox_jobs(
         id,
         operation_id,
         organization_id,
         operation_type,
         canonical_payload,
         payload_hash,
         state,
         available_at,
         created_at,
         updated_at
       )
       values (
         $1::uuid,
         decode($2, 'hex'),
         $3::uuid,
         'media_promote',
         $4::jsonb,
         decode($5, 'hex'),
         'pending',
         $6::timestamptz,
         $6::timestamptz,
         $6::timestamptz
       )`,
      [
        outboxId,
        operationId,
        input.intake.organizationId,
        JSON.stringify(promotionPayload),
        payloadHash,
        receivedAt,
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
         'submission_received',
         'submission',
         $4::uuid,
         $5::uuid,
         $6::jsonb,
         $7::timestamptz
       )`,
      [
        auditId,
        input.intake.organizationId,
        actorKey,
        submissionId,
        requestId,
        JSON.stringify({
          recordKind: 'community_report',
          mediaCount: 1,
          pilotBoundaryVersion: policy.boundaryVersion,
        }),
        receivedAt,
      ],
    );
    await query.query(
      `select nagarik.complete_idempotency(
         $1::uuid,
         decode($2, 'hex'),
         202,
         $3::jsonb,
         $4::uuid
       )`,
      [idempotencyRecordId, requestHash, JSON.stringify(stable), submissionId],
    );

    return { replayed: false, stable };
  });

  const stable = result.stable;
  const recoveryToken = deriveCapabilityMaterial(
    trackingCoordinates({
      intake: input.intake,
      idempotencyKey: input.idempotencyKey,
      submissionId: stable.submissionId,
      trackingCapabilityId: stable.trackingCapabilityId,
    }),
    dependencies.keys,
  ).token;
  return {
    replayed: result.replayed,
    submissionId: stable.submissionId,
    trackingId: stable.trackingId,
    recoveryToken,
    trackingExpiresAt: stable.trackingExpiresAt,
    state: stable.state,
    receivedAt: stable.receivedAt,
    media: stable.media,
    next: stable.next,
  };
}

import { createHash } from 'node:crypto';

import type { QueryExecutor } from '../db/query';
import { canonicalize } from '../proof/canonicalize';
import {
  deriveCapabilityMaterial,
  parseCapabilityToken,
  type CapabilityCoordinates,
  type CapabilityKeys,
} from '../security/capabilityTokens';
import { authorizeTrackingCapability } from '../security/trackingCapabilityCore';
import { deterministicUuidV4, keyedActorHash } from '../security/ids';
import type { IntakeCapability } from '../security/intakeCapabilityCore';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const trackingPattern =
  /^trk_([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;
const requestTypes = [
  'access',
  'correction',
  'withdrawal',
  'media_restriction',
  'erasure',
  'other',
] as const;

type PrivacyRequestType = (typeof requestTypes)[number];
type PrivacyTargetType = 'public_issue' | 'submission';

export type PrivacyRequestInput = {
  schemaVersion: 'privacy-request-v1';
  target: { type: PrivacyTargetType; id: string };
  requestType: PrivacyRequestType;
  description: string;
};

export class PrivacyRequestError extends Error {
  constructor(
    public readonly code:
      | 'privacy_request_invalid'
      | 'privacy_request_unavailable'
      | 'idempotency_key_reused'
      | 'idempotency_in_progress',
    public readonly status: 400 | 404 | 409,
  ) {
    super(code);
    this.name = 'PrivacyRequestError';
  }
}

type Dependencies = {
  transaction<T>(operation: (query: QueryExecutor) => Promise<T>): Promise<T>;
  keys: CapabilityKeys;
  correlationKey: string;
  now?: () => Date;
};

type StablePrivacyRequest = {
  privacyRequestId: string;
  trackingCapabilityId: string;
  state: 'received';
  receivedAt: string;
  trackingExpiresAt: string;
};

type ResolvedTarget = {
  id: string;
  organizationId: string;
  trackingId: string | null;
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const allowed = new Set(expected);
  return (
    Object.keys(value).every((key) => allowed.has(key)) && expected.every((key) => key in value)
  );
}

function normalizedDescription(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFKC').trim();
  const length = [...normalized].length;
  if (length < 20 || length > 1000) return null;
  for (const character of normalized) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127) {
      return null;
    }
  }
  return normalized;
}

export function parsePrivacyRequestInput(value: unknown): PrivacyRequestInput {
  const root = objectValue(value);
  const target = objectValue(root?.target);
  const description = normalizedDescription(root?.description);
  if (
    !root ||
    !target ||
    !exactKeys(root, ['schemaVersion', 'target', 'requestType', 'description']) ||
    !exactKeys(target, ['type', 'id']) ||
    root.schemaVersion !== 'privacy-request-v1' ||
    (target.type !== 'submission' && target.type !== 'public_issue') ||
    typeof target.id !== 'string' ||
    typeof root.requestType !== 'string' ||
    !requestTypes.includes(root.requestType as PrivacyRequestType) ||
    !description
  ) {
    throw new PrivacyRequestError('privacy_request_invalid', 400);
  }
  const id = target.id.toLowerCase();
  if (
    (target.type === 'public_issue' && !uuidPattern.test(id)) ||
    (target.type === 'submission' && !uuidPattern.test(id) && !trackingPattern.test(id))
  ) {
    throw new PrivacyRequestError('privacy_request_invalid', 400);
  }
  return {
    schemaVersion: 'privacy-request-v1',
    target: { type: target.type, id },
    requestType: root.requestType as PrivacyRequestType,
    description,
  };
}

function stableResponse(value: unknown): StablePrivacyRequest {
  const record = objectValue(value);
  if (
    !record ||
    !uuidPattern.test(String(record.privacyRequestId)) ||
    !uuidPattern.test(String(record.trackingCapabilityId)) ||
    record.state !== 'received' ||
    Number.isNaN(new Date(String(record.receivedAt)).getTime()) ||
    Number.isNaN(new Date(String(record.trackingExpiresAt)).getTime())
  ) {
    throw new Error('stored_privacy_request_response_invalid');
  }
  return record as StablePrivacyRequest;
}

async function resolveTarget(query: QueryExecutor, target: PrivacyRequestInput['target']) {
  if (target.type === 'public_issue') {
    const rows = await query.query(
      `select issue.id, issue.organization_id
       from nagarik.issues issue
       join public.issue_projection projection on projection.public_id = issue.public_id
       where issue.public_id = $1::uuid
         and issue.publication_state in ('published', 'superseded', 'removed')
       limit 1`,
      [target.id],
    );
    return rows[0]
      ? {
          id: String(rows[0].id),
          organizationId: String(rows[0].organization_id),
          trackingId: null,
        }
      : null;
  }
  const match = trackingPattern.exec(target.id);
  const rows = await query.query(
    `select id, organization_id, tracking_id
     from nagarik.submissions
     where ${match ? 'tracking_id' : 'id'} = $1::uuid
     limit 1`,
    [match?.[1] ?? target.id],
  );
  return rows[0]
    ? {
        id: String(rows[0].id),
        organizationId: String(rows[0].organization_id),
        trackingId: String(rows[0].tracking_id),
      }
    : null;
}

async function validSubmissionTracking(
  query: QueryExecutor,
  token: string | null,
  target: ResolvedTarget,
  keys: CapabilityKeys,
  now: Date,
): Promise<string | null> {
  const parsed = token ? parseCapabilityToken(token) : null;
  if (!token || !parsed || parsed.purpose !== 'submission_tracking' || !target.trackingId) {
    return null;
  }
  const rows = await query.query(
    `select
       id, organization_id, subject_id, issuance_idempotency_id,
       key_version, verifier, state, scope, expires_at
     from nagarik.capabilities
     where id = $1::uuid and purpose = 4
     limit 1
     for share`,
    [parsed.capabilityId],
  );
  const row = rows[0];
  if (!row) return null;
  const authorized = authorizeTrackingCapability(
    token,
    {
      keyVersion: Number(row.key_version),
      purpose: 'submission_tracking',
      organizationId: String(row.organization_id),
      capabilityId: String(row.id),
      subjectId: String(row.subject_id),
      issuanceIdempotencyId: String(row.issuance_idempotency_id),
      verifier: row.verifier as Uint8Array,
      state: String(row.state),
      expiresAt: new Date(String(row.expires_at)),
      scope: row.scope,
    },
    {
      submissionId: target.id,
      trackingId: target.trackingId,
      organizationId: target.organizationId,
    },
    keys,
    now,
  );
  return authorized ? parsed.capabilityId : null;
}

function privacyCoordinates(input: {
  organizationId: string;
  capabilityId: string;
  privacyRequestId: string;
  idempotencyKey: string;
}): CapabilityCoordinates {
  return {
    keyVersion: 1,
    purpose: 'privacy_tracking',
    organizationId: input.organizationId,
    capabilityId: input.capabilityId,
    subjectId: input.privacyRequestId,
    issuanceIdempotencyId: input.idempotencyKey,
  };
}

export async function createPrivacyRequest(
  input: {
    intake: IntakeCapability;
    idempotencyKey: string;
    request: PrivacyRequestInput;
    submissionTrackingToken: string | null;
  },
  dependencies: Dependencies,
) {
  const now = dependencies.now?.() ?? new Date();
  const identity = `${input.intake.organizationId}:${input.intake.capabilityId}:${input.idempotencyKey}`;
  const privacyRequestId = deterministicUuidV4('nagarik:v2:privacy-request', identity);
  const trackingCapabilityId = deterministicUuidV4(
    'nagarik:v2:privacy-tracking-capability',
    identity,
  );
  const idempotencyRecordId = deterministicUuidV4('nagarik:v2:privacy-idempotency', identity);
  const receivedAt = now.toISOString();
  const trackingExpiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60_000).toISOString();
  const actorKey = keyedActorHash(
    dependencies.correlationKey,
    `capability:${input.intake.capabilityId}`,
  );
  const parsedTracking = input.submissionTrackingToken
    ? parseCapabilityToken(input.submissionTrackingToken)
    : null;
  const requestHash = createHash('sha256')
    .update(
      canonicalize({
        request: input.request,
        intakeCapabilityId: input.intake.capabilityId,
        submissionTrackingCapabilityId:
          parsedTracking?.purpose === 'submission_tracking' ? parsedTracking.capabilityId : null,
      }),
    )
    .digest('hex');

  const result = await dependencies.transaction(async (query) => {
    const target = await resolveTarget(query, input.request.target);
    if (!target || target.organizationId !== input.intake.organizationId) {
      throw new PrivacyRequestError('privacy_request_unavailable', 404);
    }
    let sourceTrackingCapabilityId: string | null = null;
    if (input.request.target.type === 'submission') {
      sourceTrackingCapabilityId = await validSubmissionTracking(
        query,
        input.submissionTrackingToken,
        target,
        dependencies.keys,
        now,
      );
      if (!sourceTrackingCapabilityId) {
        throw new PrivacyRequestError('privacy_request_unavailable', 404);
      }
    }

    const reservations = await query.query(
      `select *
       from nagarik.reserve_idempotency(
         $1::uuid, $2::uuid, $3, decode($4, 'hex'),
         $5::uuid, decode($6, 'hex'), $7::timestamptz
       )`,
      [
        idempotencyRecordId,
        input.intake.organizationId,
        `v2:privacy-request:${input.intake.organizationId}:${input.intake.capabilityId}`,
        actorKey,
        input.idempotencyKey,
        requestHash,
        new Date(now.getTime() + 30 * 24 * 60 * 60_000).toISOString(),
      ],
    );
    const reservation = reservations[0];
    if (reservation?.disposition === 'conflict') {
      throw new PrivacyRequestError('idempotency_key_reused', 409);
    }
    if (reservation?.disposition === 'in_progress') {
      throw new PrivacyRequestError('idempotency_in_progress', 409);
    }
    if (reservation?.disposition === 'replay') {
      return { replayed: true, stable: stableResponse(reservation.response_body) };
    }
    if (reservation?.disposition !== 'reserved') {
      throw new Error('privacy_idempotency_reservation_invalid');
    }

    const stable: StablePrivacyRequest = {
      privacyRequestId,
      trackingCapabilityId,
      state: 'received',
      receivedAt,
      trackingExpiresAt,
    };
    const coordinates = privacyCoordinates({
      organizationId: input.intake.organizationId,
      capabilityId: trackingCapabilityId,
      privacyRequestId,
      idempotencyKey: input.idempotencyKey,
    });
    const material = deriveCapabilityMaterial(coordinates, dependencies.keys);
    await query.query(
      `insert into nagarik.capabilities(
         id, organization_id, purpose, subject_id, issuance_idempotency_id,
         key_version, verifier, scope, expires_at, created_at
       )
       values (
         $1::uuid, $2::uuid, 5, $3::uuid, $4::uuid,
         1, decode($5, 'hex'), $6::jsonb, $7::timestamptz, $8::timestamptz
       )`,
      [
        trackingCapabilityId,
        input.intake.organizationId,
        privacyRequestId,
        input.idempotencyKey,
        material.verifier.toString('hex'),
        JSON.stringify({
          schemaVersion: 'privacy-tracking-v1',
          privacyRequestId,
          actions: ['read', 'withdraw'],
        }),
        trackingExpiresAt,
        receivedAt,
      ],
    );
    await query.query(
      `insert into nagarik.privacy_requests(
         id, organization_id, target_type, target_id, request_type,
         description, state, version, tracking_capability_id, created_at, updated_at
       )
       values (
         $1::uuid, $2::uuid, $3, $4::uuid, $5,
         $6, 'received', 1, $7::uuid, $8::timestamptz, $8::timestamptz
       )`,
      [
        privacyRequestId,
        input.intake.organizationId,
        input.request.target.type,
        target.id,
        input.request.requestType,
        input.request.description,
        trackingCapabilityId,
        receivedAt,
      ],
    );
    await query.query(
      `insert into nagarik.privacy_request_events(
         id, privacy_request_id, organization_id, sequence, event_type,
         from_state, to_state, actor_type, actor_key, private_detail, created_at
       )
       values (
         $1::uuid, $2::uuid, $3::uuid, 1, 'received',
         null, 'received', 'capability', decode($4, 'hex'), $5::jsonb, $6::timestamptz
       )`,
      [
        deterministicUuidV4('nagarik:v2:privacy-received-event', identity),
        privacyRequestId,
        input.intake.organizationId,
        actorKey,
        JSON.stringify({
          intakeCapabilityId: input.intake.capabilityId,
          sourceTrackingCapabilityId,
          targetType: input.request.target.type,
          requestType: input.request.requestType,
        }),
        receivedAt,
      ],
    );
    await query.query(
      `insert into nagarik.audit_events(
         id, organization_id, actor_type, actor_key, action,
         resource_type, resource_id, request_id, detail, occurred_at
       )
       values (
         $1::uuid, $2::uuid, 'capability', decode($3, 'hex'), 'privacy_request_received',
         'privacy_request', $4::uuid, $5::uuid, $6::jsonb, $7::timestamptz
       )`,
      [
        deterministicUuidV4('nagarik:v2:privacy-received-audit', identity),
        input.intake.organizationId,
        actorKey,
        privacyRequestId,
        deterministicUuidV4('nagarik:v2:privacy-http-request', identity),
        JSON.stringify({
          targetType: input.request.target.type,
          requestType: input.request.requestType,
        }),
        receivedAt,
      ],
    );
    await query.query(
      `select nagarik.complete_idempotency(
         $1::uuid, decode($2, 'hex'), 202, $3::jsonb, $4::uuid
       )`,
      [idempotencyRecordId, requestHash, JSON.stringify(stable), privacyRequestId],
    );
    return { replayed: false, stable };
  });

  const coordinates = privacyCoordinates({
    organizationId: input.intake.organizationId,
    capabilityId: result.stable.trackingCapabilityId,
    privacyRequestId: result.stable.privacyRequestId,
    idempotencyKey: input.idempotencyKey,
  });
  return {
    replayed: result.replayed,
    privacyRequestId: result.stable.privacyRequestId,
    recoveryToken: deriveCapabilityMaterial(coordinates, dependencies.keys).token,
    state: result.stable.state,
    receivedAt: result.stable.receivedAt,
    trackingExpiresAt: result.stable.trackingExpiresAt,
  };
}

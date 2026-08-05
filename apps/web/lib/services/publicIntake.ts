import { z } from 'zod';

import type { QueryExecutor } from '../db/query';
import {
  deriveCapabilityMaterial,
  type CapabilityCoordinates,
  type CapabilityKeys,
} from '../security/capabilityTokens';
import { deterministicUuid, deterministicUuidV4 } from '../security/ids';

const publicSessionInputSchema = z
  .object({
    schemaVersion: z.literal('public-intake-session-v1'),
  })
  .strict();

export type PublicIntakeSessionInput = z.infer<typeof publicSessionInputSchema>;

export class PublicIntakeError extends Error {
  constructor(
    public readonly code:
      'public_intake_invalid' | 'public_intake_unavailable' | 'public_intake_rate_limited',
    public readonly status: 400 | 429 | 503,
  ) {
    super(code);
    this.name = 'PublicIntakeError';
  }
}

export function parsePublicIntakeSessionInput(value: unknown): PublicIntakeSessionInput {
  const result = publicSessionInputSchema.safeParse(value);
  if (!result.success) throw new PublicIntakeError('public_intake_invalid', 400);
  return result.data;
}

function utcHour(now: Date): { start: Date; end: Date } {
  const start = new Date(now);
  start.setUTCMinutes(0, 0, 0);
  return { start, end: new Date(start.getTime() + 60 * 60_000) };
}

function utcDay(now: Date): { key: string; expiresAt: Date } {
  const key = now.toISOString().slice(0, 10);
  const expiresAt = new Date(`${key}T00:00:00.000Z`);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 2);
  return { key, expiresAt };
}

function coordinates(input: {
  organizationId: string;
  actorKey: string;
  policyVersion: string;
  day: string;
}): CapabilityCoordinates {
  const identity = `${input.actorKey}:${input.policyVersion}:${input.day}`;
  return {
    keyVersion: 1,
    purpose: 'pilot_intake',
    organizationId: input.organizationId,
    capabilityId: deterministicUuidV4('nagarik:v2:public-intake-capability', identity),
    subjectId: deterministicUuidV4(
      'nagarik:v2:public-intake-subject',
      `${input.actorKey}:${input.day}`,
    ),
    issuanceIdempotencyId: deterministicUuidV4('nagarik:v2:public-intake-issuance', identity),
  };
}

export async function createPublicIntakeSession(
  input: { actorKey: string },
  dependencies: {
    transaction<T>(operation: (query: QueryExecutor) => Promise<T>): Promise<T>;
    keys: CapabilityKeys;
    now?: () => Date;
  },
) {
  if (!/^[0-9a-f]{64}$/.test(input.actorKey)) {
    throw new PublicIntakeError('public_intake_invalid', 400);
  }

  const now = dependencies.now?.() ?? new Date();
  const hour = utcHour(now);
  const day = utcDay(now);
  const result = await dependencies.transaction(async (query) => {
    const policies = await query.query(
      `select policy.organization_id, policy.boundary_version
       from nagarik.pilot_policies policy
       join nagarik.organizations organization
         on organization.id = policy.organization_id
        and organization.status = 'active'
       join nagarik.capability_kill_switches switch
         on switch.capability = 'inviteIntakeEnabled'
        and switch.disabled = false
       where organization.slug = 'public-intake'
         and policy.state = 'active'
         and array['intake']::text[] <@ policy.invitation_scope
       limit 1
       for share of policy`,
    );
    const policy = policies[0];
    if (!policy) throw new PublicIntakeError('public_intake_unavailable', 503);

    const buckets = await query.query(
      `insert into nagarik.rate_limit_buckets(
         scope, subject_key, window_started_at, window_ends_at, request_count, updated_at
       )
       values (
         'public_intake_session', decode($1, 'hex'), $2::timestamptz, $3::timestamptz, 1,
         $4::timestamptz
       )
       on conflict (scope, subject_key, window_started_at)
       do update set
         request_count = nagarik.rate_limit_buckets.request_count + 1,
         updated_at = excluded.updated_at
       returning request_count`,
      [input.actorKey, hour.start.toISOString(), hour.end.toISOString(), now.toISOString()],
    );
    if (Number(buckets[0]?.request_count ?? 0) > 60) {
      return { rateLimited: true as const };
    }

    const organizationId = String(policy.organization_id);
    const policyVersion = String(policy.boundary_version);
    const capability = coordinates({
      organizationId,
      actorKey: input.actorKey,
      policyVersion,
      day: day.key,
    });
    const material = deriveCapabilityMaterial(capability, dependencies.keys);
    const inserted = await query.query(
      `insert into nagarik.capabilities(
         id, organization_id, purpose, subject_id, issuance_idempotency_id,
         key_version, verifier, scope, expires_at, created_at
       )
       values (
         $1::uuid, $2::uuid, 2, $3::uuid, $4::uuid,
         1, decode($5, 'hex'), $6::jsonb, $7::timestamptz, $8::timestamptz
       )
       on conflict (organization_id, purpose, issuance_idempotency_id) do nothing
       returning id`,
      [
        capability.capabilityId,
        organizationId,
        capability.subjectId,
        capability.issuanceIdempotencyId,
        material.verifier.toString('hex'),
        JSON.stringify({
          schemaVersion: 'public-intake-capability-v1',
          access: 'public',
          pilotPolicyVersion: policyVersion,
          scopes: ['intake'],
        }),
        day.expiresAt.toISOString(),
        now.toISOString(),
      ],
    );
    const active = await query.query(
      `select id
       from nagarik.capabilities
       where id = $1::uuid
         and organization_id = $2::uuid
         and purpose = 2
         and state = 'active'
         and expires_at > $3::timestamptz
       limit 1`,
      [capability.capabilityId, organizationId, now.toISOString()],
    );
    if (!active[0]) throw new PublicIntakeError('public_intake_unavailable', 503);

    await query.query(
      `insert into nagarik.audit_events(
         id, organization_id, actor_type, actor_key, action,
         resource_type, resource_id, request_id, detail, occurred_at
       )
       values (
         $1::uuid, $2::uuid, 'capability', decode($3, 'hex'), 'public_intake_session_issued',
         'capability', $4::uuid, $5::uuid, $6::jsonb, $7::timestamptz
       )
       on conflict (id) do nothing`,
      [
        deterministicUuid(
          'nagarik:v2:public-intake-audit',
          `${input.actorKey}:${policyVersion}:${day.key}`,
        ),
        organizationId,
        input.actorKey,
        capability.capabilityId,
        deterministicUuidV4(
          'nagarik:v2:public-intake-request',
          `${input.actorKey}:${policyVersion}:${day.key}`,
        ),
        JSON.stringify({ policyVersion, expiresAt: day.expiresAt.toISOString() }),
        now.toISOString(),
      ],
    );

    return {
      rateLimited: false as const,
      replayed: inserted.length === 0,
      token: material.token,
      expiresAt: day.expiresAt.toISOString(),
    };
  });

  if (result.rateLimited) {
    throw new PublicIntakeError('public_intake_rate_limited', 429);
  }
  return {
    replayed: result.replayed,
    scopes: ['intake'] as const,
    expiresAt: result.expiresAt,
    intakeToken: result.token,
    signalToken: null,
  };
}

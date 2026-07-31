import { createHash } from 'node:crypto';

import { z } from 'zod';

import type { QueryExecutor } from '../db/query';
import { canonicalize } from '../proof/canonicalize';
import {
  deriveCapabilityMaterial,
  parseCapabilityToken,
  verifyCapabilityToken,
  type CapabilityCoordinates,
  type CapabilityKeys,
} from '../security/capabilityTokens';
import { deterministicUuid, deterministicUuidV4, keyedActorHash } from '../security/ids';
import {
  completeOperatorMutation,
  OperatorMutationError,
  reserveOperatorMutation,
  type OperatorMutationActor,
  type OperatorMutationDependencies,
} from './operatorMutation';

const invitationInputSchema = z
  .object({
    schemaVersion: z.literal('pilot-invitation-create-v1'),
    scopes: z
      .array(z.enum(['intake', 'signal']))
      .min(1)
      .max(2)
      .refine((value) => new Set(value).size === value.length, 'scopes must be unique'),
    expiresAt: z.string().datetime({ offset: true }),
    pilotPolicyVersion: z.string().trim().min(1).max(120),
  })
  .strict();

const sessionInputSchema = z
  .object({
    schemaVersion: z.literal('pilot-invitation-v1'),
    invitation: z.string().trim().min(80).max(220),
  })
  .strict();

export type PilotInvitationInput = z.infer<typeof invitationInputSchema>;
export type IntakeSessionInput = z.infer<typeof sessionInputSchema>;

export class PilotInvitationError extends Error {
  constructor(
    public readonly code:
      | 'pilot_invitation_invalid'
      | 'pilot_invitation_unavailable'
      | 'pilot_policy_unavailable'
      | 'pilot_scope_unavailable'
      | 'pilot_capability_disabled',
    public readonly status: 400 | 401 | 409 | 503,
  ) {
    super(code);
    this.name = 'PilotInvitationError';
  }
}

export function parsePilotInvitationInput(value: unknown): PilotInvitationInput {
  const result = invitationInputSchema.safeParse(value);
  if (!result.success) throw new PilotInvitationError('pilot_invitation_invalid', 400);
  return result.data;
}

export function parseIntakeSessionInput(value: unknown): IntakeSessionInput {
  const result = sessionInputSchema.safeParse(value);
  if (!result.success) throw new PilotInvitationError('pilot_invitation_invalid', 400);
  return result.data;
}

function stableObject<T>(value: unknown): T {
  if (!value || typeof value !== 'object') throw new Error('stored_invitation_response_invalid');
  return value as T;
}

function invitationCoordinates(input: {
  organizationId: string;
  capabilityId: string;
  invitationId: string;
  idempotencyKey: string;
}): CapabilityCoordinates {
  return {
    keyVersion: 1,
    purpose: 'pilot_invitation',
    organizationId: input.organizationId,
    capabilityId: input.capabilityId,
    subjectId: input.invitationId,
    issuanceIdempotencyId: input.idempotencyKey,
  };
}

export async function createPilotInvitation(
  input: {
    idempotencyKey: string;
    actor: OperatorMutationActor;
    invitation: PilotInvitationInput;
  },
  dependencies: OperatorMutationDependencies & { keys: CapabilityKeys },
) {
  const now = dependencies.now?.() ?? new Date();
  const expiresAt = new Date(input.invitation.expiresAt);
  if (
    expiresAt.getTime() <= now.getTime() ||
    expiresAt.getTime() > now.getTime() + 7 * 24 * 60 * 60_000
  ) {
    throw new PilotInvitationError('pilot_invitation_invalid', 400);
  }
  const scopes = [...input.invitation.scopes].sort() as Array<'intake' | 'signal'>;
  const identity = `${input.actor.organizationId}:${input.actor.subjectId}:${input.idempotencyKey}`;
  const invitationId = deterministicUuidV4('nagarik:v2:pilot-invitation', identity);
  const capabilityId = deterministicUuidV4('nagarik:v2:pilot-invitation-capability', identity);
  type Stable = {
    invitationId: string;
    capabilityId: string;
    scopes: Array<'intake' | 'signal'>;
    pilotPolicyVersion: string;
    expiresAt: string;
  };

  const result = await dependencies.transaction(async (query) => {
    const reservation = await reserveOperatorMutation<Stable>(query, {
      scope: `operator:pilot-invitation:${input.actor.organizationId}`,
      actor: input.actor,
      idempotencyKey: input.idempotencyKey,
      request: { ...input.invitation, scopes },
      correlationKey: dependencies.correlationKey,
      now,
    });
    if (reservation.disposition === 'replay') {
      return { replayed: true, value: stableObject<Stable>(reservation.response) };
    }
    const switches = await query.query(
      `select nagarik.is_capability_enabled('operatorMutationsEnabled') as enabled`,
    );
    if (switches[0]?.enabled !== true) {
      throw new OperatorMutationError('operator_mutations_disabled', 503);
    }
    const policies = await query.query(
      `select invitation_scope
       from nagarik.pilot_policies
       where organization_id = $1::uuid
         and state = 'active'
         and boundary_version = $2
       limit 1
       for share`,
      [input.actor.organizationId, input.invitation.pilotPolicyVersion],
    );
    const allowed = Array.isArray(policies[0]?.invitation_scope)
      ? (policies[0].invitation_scope as unknown[])
      : [];
    if (!policies[0]) throw new PilotInvitationError('pilot_policy_unavailable', 409);
    if (scopes.some((scope) => !allowed.includes(scope))) {
      throw new PilotInvitationError('pilot_scope_unavailable', 409);
    }

    const stable: Stable = {
      invitationId,
      capabilityId,
      scopes,
      pilotPolicyVersion: input.invitation.pilotPolicyVersion,
      expiresAt: expiresAt.toISOString(),
    };
    const coordinates = invitationCoordinates({
      organizationId: input.actor.organizationId,
      capabilityId,
      invitationId,
      idempotencyKey: input.idempotencyKey,
    });
    const material = deriveCapabilityMaterial(coordinates, dependencies.keys);
    await query.query(
      `insert into nagarik.pilot_invitations(
         id, organization_id, state, scopes, pilot_policy_version,
         expires_at, created_by, created_at, updated_at
       )
       values (
         $1::uuid, $2::uuid, 'active', $3::text[], $4,
         $5::timestamptz, $6::uuid, $7::timestamptz, $7::timestamptz
       )`,
      [
        invitationId,
        input.actor.organizationId,
        scopes,
        stable.pilotPolicyVersion,
        stable.expiresAt,
        input.actor.subjectId,
        now.toISOString(),
      ],
    );
    await query.query(
      `insert into nagarik.capabilities(
         id, organization_id, purpose, subject_id, issuance_idempotency_id,
         key_version, verifier, scope, expires_at, created_at
       )
       values (
         $1::uuid, $2::uuid, 1, $3::uuid, $4::uuid,
         1, decode($5, 'hex'), $6::jsonb, $7::timestamptz, $8::timestamptz
       )`,
      [
        capabilityId,
        input.actor.organizationId,
        invitationId,
        input.idempotencyKey,
        material.verifier.toString('hex'),
        JSON.stringify({
          schemaVersion: 'pilot-invitation-v1',
          invitationId,
          scopes,
          pilotPolicyVersion: stable.pilotPolicyVersion,
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
         $1::uuid, $2::uuid, 'operator', decode($3, 'hex'), 'pilot_invitation_created',
         'pilot_invitation', $4::uuid, $5::uuid, $6::jsonb, $7::timestamptz
       )`,
      [
        deterministicUuid('nagarik:v2:pilot-invitation-audit', identity),
        input.actor.organizationId,
        reservation.actorKey,
        invitationId,
        deterministicUuidV4('nagarik:v2:pilot-invitation-request', identity),
        JSON.stringify({ capabilityId, scopes, expiresAt: stable.expiresAt }),
        now.toISOString(),
      ],
    );
    await completeOperatorMutation(query, {
      recordId: reservation.recordId,
      requestHash: reservation.requestHash,
      status: 201,
      response: stable,
      resourceId: invitationId,
    });
    return { replayed: false, value: stable };
  });

  const coordinates = invitationCoordinates({
    organizationId: input.actor.organizationId,
    capabilityId: result.value.capabilityId,
    invitationId: result.value.invitationId,
    idempotencyKey: input.idempotencyKey,
  });
  return {
    replayed: result.replayed,
    ...result.value,
    invitation: deriveCapabilityMaterial(coordinates, dependencies.keys).token,
  };
}

type SessionStable = {
  organizationId: string;
  invitationId: string;
  scopes: Array<'intake' | 'signal'>;
  pilotPolicyVersion: string;
  intakeCapabilityId: string | null;
  signalCapabilityId: string | null;
  expiresAt: string;
};

function childCoordinates(
  purpose: 'pilot_intake' | 'pilot_signal',
  stable: SessionStable,
  capabilityId: string,
  idempotencyKey: string,
): CapabilityCoordinates {
  return {
    keyVersion: 1,
    purpose,
    organizationId: stable.organizationId,
    capabilityId,
    subjectId: stable.invitationId,
    issuanceIdempotencyId: idempotencyKey,
  };
}

export async function consumePilotInvitation(
  input: {
    idempotencyKey: string;
    session: IntakeSessionInput;
  },
  dependencies: {
    transaction<T>(operation: (query: QueryExecutor) => Promise<T>): Promise<T>;
    keys: CapabilityKeys;
    correlationKey: string;
    now?: () => Date;
  },
) {
  const parsed = parseCapabilityToken(input.session.invitation);
  if (!parsed || parsed.purpose !== 'pilot_invitation') {
    throw new PilotInvitationError('pilot_invitation_unavailable', 401);
  }
  const now = dependencies.now?.() ?? new Date();
  const result = await dependencies.transaction(async (query) => {
    const rows = await query.query(
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
         invitation.id as invitation_id,
         invitation.state as invitation_state,
         invitation.scopes,
         invitation.pilot_policy_version,
         invitation.expires_at
       from nagarik.capabilities capability
       join nagarik.pilot_invitations invitation on invitation.id = capability.subject_id
       where capability.id = $1::uuid and capability.purpose = 1
       for update of capability, invitation`,
      [parsed.capabilityId],
    );
    const row = rows[0];
    if (!row) throw new PilotInvitationError('pilot_invitation_unavailable', 401);
    const coordinates: CapabilityCoordinates & { verifier: Uint8Array } = {
      keyVersion: Number(row.key_version),
      purpose: 'pilot_invitation',
      organizationId: String(row.organization_id),
      capabilityId: String(row.capability_id),
      subjectId: String(row.subject_id),
      issuanceIdempotencyId: String(row.issuance_idempotency_id),
      verifier: row.verifier as Uint8Array,
    };
    if (!verifyCapabilityToken(input.session.invitation, coordinates, dependencies.keys)) {
      throw new PilotInvitationError('pilot_invitation_unavailable', 401);
    }

    const organizationId = coordinates.organizationId;
    const actorKey = keyedActorHash(
      dependencies.correlationKey,
      `invitation:${coordinates.capabilityId}`,
    );
    const requestHash = createHash('sha256')
      .update(
        canonicalize({
          schemaVersion: input.session.schemaVersion,
          invitationCapabilityId: coordinates.capabilityId,
        }),
      )
      .digest('hex');
    const idempotencyId = deterministicUuid(
      'nagarik:v2:intake-session-idempotency',
      `${coordinates.capabilityId}:${input.idempotencyKey}`,
    );
    const reservations = await query.query(
      `select *
       from nagarik.reserve_idempotency(
         $1::uuid, $2::uuid, $3, decode($4, 'hex'),
         $5::uuid, decode($6, 'hex'), $7::timestamptz
       )`,
      [
        idempotencyId,
        organizationId,
        `v2:intake-session:${coordinates.capabilityId}`,
        actorKey,
        input.idempotencyKey,
        requestHash,
        new Date(now.getTime() + 30 * 24 * 60 * 60_000).toISOString(),
      ],
    );
    const reservation = reservations[0];
    if (reservation?.disposition === 'conflict') {
      throw new PilotInvitationError('pilot_invitation_unavailable', 401);
    }
    if (reservation?.disposition === 'in_progress') {
      throw new PilotInvitationError('pilot_invitation_unavailable', 401);
    }
    if (reservation?.disposition === 'replay') {
      return { replayed: true, value: stableObject<SessionStable>(reservation.response_body) };
    }
    if (reservation?.disposition !== 'reserved') {
      throw new Error('intake_session_idempotency_invalid');
    }

    const expiresAt = new Date(String(row.expires_at));
    const scopes = Array.isArray(row.scopes)
      ? ([...new Set(row.scopes as Array<'intake' | 'signal'>)].sort() as Array<
          'intake' | 'signal'
        >)
      : [];
    if (
      row.capability_state !== 'active' ||
      row.invitation_state !== 'active' ||
      expiresAt.getTime() <= now.getTime() ||
      scopes.length === 0
    ) {
      throw new PilotInvitationError('pilot_invitation_unavailable', 401);
    }
    const switches = await query.query(
      `select capability, disabled
       from nagarik.capability_kill_switches
       where capability in ('inviteIntakeEnabled', 'inviteSignalsEnabled')`,
    );
    const disabled = new Set(
      switches.filter((item) => item.disabled === true).map((item) => String(item.capability)),
    );
    if (
      (scopes.includes('intake') && disabled.has('inviteIntakeEnabled')) ||
      (scopes.includes('signal') && disabled.has('inviteSignalsEnabled'))
    ) {
      throw new PilotInvitationError('pilot_capability_disabled', 503);
    }

    const intakeCapabilityId = scopes.includes('intake')
      ? deterministicUuidV4(
          'nagarik:v2:pilot-intake-capability',
          `${coordinates.subjectId}:${input.idempotencyKey}`,
        )
      : null;
    const signalCapabilityId = scopes.includes('signal')
      ? deterministicUuidV4(
          'nagarik:v2:pilot-signal-capability',
          `${coordinates.subjectId}:${input.idempotencyKey}`,
        )
      : null;
    const stable: SessionStable = {
      organizationId,
      invitationId: String(row.invitation_id),
      scopes,
      pilotPolicyVersion: String(row.pilot_policy_version),
      intakeCapabilityId,
      signalCapabilityId,
      expiresAt: expiresAt.toISOString(),
    };
    for (const [purpose, capabilityId] of [
      ['pilot_intake', intakeCapabilityId],
      ['pilot_signal', signalCapabilityId],
    ] as const) {
      if (!capabilityId) continue;
      const child = childCoordinates(purpose, stable, capabilityId, input.idempotencyKey);
      const material = deriveCapabilityMaterial(child, dependencies.keys);
      await query.query(
        `insert into nagarik.capabilities(
           id, organization_id, purpose, subject_id, issuance_idempotency_id,
           key_version, verifier, scope, expires_at, created_at
         )
         values (
           $1::uuid, $2::uuid, $3, $4::uuid, $5::uuid,
           1, decode($6, 'hex'), $7::jsonb, $8::timestamptz, $9::timestamptz
         )`,
        [
          capabilityId,
          organizationId,
          purpose === 'pilot_intake' ? 2 : 3,
          stable.invitationId,
          input.idempotencyKey,
          material.verifier.toString('hex'),
          JSON.stringify({
            schemaVersion: 'pilot-capability-v1',
            invitationId: stable.invitationId,
            pilotPolicyVersion: stable.pilotPolicyVersion,
            scopes: [purpose === 'pilot_intake' ? 'intake' : 'signal'],
          }),
          stable.expiresAt,
          now.toISOString(),
        ],
      );
    }
    await query.query(
      `update nagarik.pilot_invitations
       set state = 'consumed', version = version + 1,
           consumed_at = $2::timestamptz, updated_at = $2::timestamptz
       where id = $1::uuid and state = 'active'`,
      [stable.invitationId, now.toISOString()],
    );
    await query.query(
      `update nagarik.capabilities
       set state = 'consumed', consumed_at = $2::timestamptz
       where id = $1::uuid and state = 'active'`,
      [coordinates.capabilityId, now.toISOString()],
    );
    await query.query(
      `insert into nagarik.audit_events(
         id, organization_id, actor_type, actor_key, action,
         resource_type, resource_id, request_id, detail, occurred_at
       )
       values (
         $1::uuid, $2::uuid, 'capability', decode($3, 'hex'), 'pilot_invitation_consumed',
         'pilot_invitation', $4::uuid, $5::uuid, $6::jsonb, $7::timestamptz
       )`,
      [
        deterministicUuid(
          'nagarik:v2:intake-session-audit',
          `${coordinates.capabilityId}:${input.idempotencyKey}`,
        ),
        organizationId,
        actorKey,
        stable.invitationId,
        deterministicUuidV4(
          'nagarik:v2:intake-session-request',
          `${coordinates.capabilityId}:${input.idempotencyKey}`,
        ),
        JSON.stringify({
          intakeCapabilityId,
          signalCapabilityId,
          scopes,
          expiresAt: stable.expiresAt,
        }),
        now.toISOString(),
      ],
    );
    await query.query(
      `select nagarik.complete_idempotency(
         $1::uuid, decode($2, 'hex'), 201, $3::jsonb, $4::uuid
       )`,
      [idempotencyId, requestHash, JSON.stringify(stable), stable.invitationId],
    );
    return { replayed: false, value: stable };
  });

  const stable = result.value;
  const intakeToken = stable.intakeCapabilityId
    ? deriveCapabilityMaterial(
        childCoordinates('pilot_intake', stable, stable.intakeCapabilityId, input.idempotencyKey),
        dependencies.keys,
      ).token
    : null;
  const signalToken = stable.signalCapabilityId
    ? deriveCapabilityMaterial(
        childCoordinates('pilot_signal', stable, stable.signalCapabilityId, input.idempotencyKey),
        dependencies.keys,
      ).token
    : null;
  return {
    replayed: result.replayed,
    scopes: stable.scopes,
    expiresAt: stable.expiresAt,
    intakeToken,
    signalToken,
  };
}

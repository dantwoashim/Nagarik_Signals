import { createHash } from 'node:crypto';

import { z } from 'zod';

import type { QueryExecutor } from '../db/query';
import { canonicalize } from '../proof/canonicalize';
import { deterministicUuid, deterministicUuidV4, keyedActorHash } from '../security/ids';

export const capabilityNames = [
  'publicReadEnabled',
  'publicMediaEnabled',
  'inviteIntakeEnabled',
  'inviteSignalsEnabled',
  'operatorMutationsEnabled',
  'publicationEnabled',
  'v2WritesEnabled',
] as const;

export type CapabilityName = (typeof capabilityNames)[number];
export type CapabilityCeilings = Record<CapabilityName, boolean>;

const inputSchema = z
  .object({
    schemaVersion: z.literal('capability-switch-v1'),
    disabled: z.boolean(),
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(8).max(240),
    cachePurgeReference: z.string().trim().min(3).max(200).nullable().optional(),
  })
  .strict();

export type CapabilitySwitchInput = z.infer<typeof inputSchema>;

export class CapabilitySwitchError extends Error {
  constructor(
    public readonly code:
      | 'capability_switch_invalid'
      | 'capability_switch_not_found'
      | 'capability_switch_stale'
      | 'capability_ceiling_disabled'
      | 'cache_purge_evidence_required'
      | 'idempotency_key_reused'
      | 'idempotency_in_progress',
    public readonly status: 400 | 404 | 409,
  ) {
    super(code);
    this.name = 'CapabilitySwitchError';
  }
}

export function parseCapabilityName(value: string): CapabilityName {
  if (!(capabilityNames as readonly string[]).includes(value)) {
    throw new CapabilitySwitchError('capability_switch_not_found', 404);
  }
  return value as CapabilityName;
}

export function parseCapabilitySwitchInput(value: unknown): CapabilitySwitchInput {
  const result = inputSchema.safeParse(value);
  if (!result.success) throw new CapabilitySwitchError('capability_switch_invalid', 400);
  return result.data;
}

export function capabilityCeilingsFromEnvironment(
  environment: NodeJS.ProcessEnv,
): CapabilityCeilings {
  return {
    publicReadEnabled: environment.NAGARIK_CAP_PUBLIC_READ === 'true',
    publicMediaEnabled: environment.NAGARIK_CAP_PUBLIC_MEDIA === 'true',
    inviteIntakeEnabled: environment.NAGARIK_CAP_INVITE_INTAKE === 'true',
    inviteSignalsEnabled: environment.NAGARIK_CAP_INVITE_SIGNALS === 'true',
    operatorMutationsEnabled: environment.NAGARIK_CAP_OPERATOR_MUTATIONS === 'true',
    publicationEnabled: environment.NAGARIK_CAP_PUBLICATION === 'true',
    v2WritesEnabled: environment.NAGARIK_CAP_V2_WRITES === 'true',
  };
}

type StableSwitchResult = {
  capability: CapabilityName;
  disabled: boolean;
  version: number;
  changed: boolean;
  reason: string;
  updatedAt: string;
};

function stableResult(value: unknown): StableSwitchResult {
  if (!value || typeof value !== 'object') throw new Error('stored_switch_response_invalid');
  return value as StableSwitchResult;
}

export async function changeCapabilitySwitch(
  input: {
    capability: CapabilityName;
    change: CapabilitySwitchInput;
    idempotencyKey: string;
    actorSubjectId: string;
  },
  dependencies: {
    transaction<T>(operation: (query: QueryExecutor) => Promise<T>): Promise<T>;
    correlationKey: string;
    ceilings: CapabilityCeilings;
    now?: () => Date;
  },
) {
  if (!input.change.disabled && !dependencies.ceilings[input.capability]) {
    throw new CapabilitySwitchError('capability_ceiling_disabled', 409);
  }
  const publicCapability =
    input.capability === 'publicReadEnabled' || input.capability === 'publicMediaEnabled';
  const now = dependencies.now?.() ?? new Date();
  const actorKey = keyedActorHash(dependencies.correlationKey, `operator:${input.actorSubjectId}`);
  const scope = `operator:capability-switch:${input.capability}`;
  const identity = `${scope}:${input.actorSubjectId}:${input.idempotencyKey}`;
  const recordId = deterministicUuid('nagarik:v2:capability-switch-idempotency', identity);
  const resourceId = deterministicUuid('nagarik:v2:capability-switch-resource', input.capability);
  const requestHash = createHash('sha256')
    .update(canonicalize({ capability: input.capability, ...input.change }))
    .digest('hex');

  return dependencies.transaction(async (query) => {
    const reservations = await query.query(
      `select *
       from nagarik.reserve_idempotency(
         $1::uuid, null, $2, decode($3, 'hex'),
         $4::uuid, decode($5, 'hex'), $6::timestamptz
       )`,
      [
        recordId,
        scope,
        actorKey,
        input.idempotencyKey,
        requestHash,
        new Date(now.getTime() + 30 * 24 * 60 * 60_000).toISOString(),
      ],
    );
    const reservation = reservations[0];
    if (reservation?.disposition === 'conflict') {
      throw new CapabilitySwitchError('idempotency_key_reused', 409);
    }
    if (reservation?.disposition === 'in_progress') {
      throw new CapabilitySwitchError('idempotency_in_progress', 409);
    }
    if (reservation?.disposition === 'replay') {
      return { replayed: true, ...stableResult(reservation.response_body) };
    }
    if (reservation?.disposition !== 'reserved') {
      throw new Error('capability_switch_idempotency_invalid');
    }

    const rows = await query.query(
      `select capability, disabled, version, reason, updated_at
       from nagarik.capability_kill_switches
       where capability = $1
       for update`,
      [input.capability],
    );
    const current = rows[0];
    if (!current) throw new CapabilitySwitchError('capability_switch_not_found', 404);
    const currentVersion = Number(current.version);
    if (currentVersion !== input.change.expectedVersion) {
      throw new CapabilitySwitchError('capability_switch_stale', 409);
    }
    const changed = current.disabled !== input.change.disabled;
    if (changed && publicCapability && !input.change.cachePurgeReference) {
      throw new CapabilitySwitchError('cache_purge_evidence_required', 400);
    }

    let result: StableSwitchResult;
    if (changed) {
      const updated = await query.query(
        `update nagarik.capability_kill_switches
         set disabled = $2, version = version + 1, reason = $3,
             updated_by = $4::uuid, updated_at = $5::timestamptz
         where capability = $1 and version = $6
         returning capability, disabled, version, reason, updated_at`,
        [
          input.capability,
          input.change.disabled,
          input.change.reason,
          input.actorSubjectId,
          now.toISOString(),
          currentVersion,
        ],
      );
      if (!updated[0]) throw new CapabilitySwitchError('capability_switch_stale', 409);
      result = {
        capability: input.capability,
        disabled: updated[0].disabled === true,
        version: Number(updated[0].version),
        changed: true,
        reason: String(updated[0].reason),
        updatedAt: new Date(String(updated[0].updated_at)).toISOString(),
      };
    } else {
      result = {
        capability: input.capability,
        disabled: current.disabled === true,
        version: currentVersion,
        changed: false,
        reason: String(current.reason),
        updatedAt: new Date(String(current.updated_at)).toISOString(),
      };
    }

    await query.query(
      `insert into nagarik.audit_events(
         id, organization_id, actor_type, actor_key, action,
         resource_type, resource_id, request_id, detail, occurred_at
       )
       values (
         $1::uuid, null, 'operator', decode($2, 'hex'), $3,
         'capability_switch', $4::uuid, $5::uuid, $6::jsonb, $7::timestamptz
       )`,
      [
        deterministicUuid('nagarik:v2:capability-switch-audit', identity),
        actorKey,
        result.disabled ? 'capability_disabled' : 'capability_enabled',
        resourceId,
        deterministicUuidV4('nagarik:v2:capability-switch-request', identity),
        JSON.stringify({
          capability: result.capability,
          changed: result.changed,
          previousVersion: currentVersion,
          version: result.version,
          reason: input.change.reason,
          cachePurgeReference: input.change.cachePurgeReference ?? null,
        }),
        now.toISOString(),
      ],
    );
    await query.query(
      `select nagarik.complete_idempotency(
         $1::uuid, decode($2, 'hex'), 200, $3::jsonb, $4::uuid
       )`,
      [recordId, requestHash, JSON.stringify(result), resourceId],
    );
    return { replayed: false, ...result };
  });
}

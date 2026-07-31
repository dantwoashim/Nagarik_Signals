import { createHash } from 'node:crypto';

import type { QueryExecutor } from '../db/query';
import { canonicalize } from '../proof/canonicalize';
import { deterministicUuid, keyedActorHash } from '../security/ids';

export type OperatorMutationActor = {
  subjectId: string;
  organizationId: string;
};

export type OperatorMutationDependencies = {
  transaction<T>(operation: (query: QueryExecutor) => Promise<T>): Promise<T>;
  correlationKey: string;
  now?: () => Date;
};

export class OperatorMutationError extends Error {
  constructor(
    public readonly code:
      | 'idempotency_key_reused'
      | 'idempotency_in_progress'
      | 'resource_not_found'
      | 'stale_resource_version'
      | 'operator_mutations_disabled'
      | 'publication_disabled'
      | 'workflow_conflict',
    public readonly status: 404 | 409 | 503,
  ) {
    super(code);
    this.name = 'OperatorMutationError';
  }
}

export type MutationReservation<T> =
  | { disposition: 'reserved'; recordId: string; requestHash: string; actorKey: string }
  | { disposition: 'replay'; response: T };

export function mutationRequestHash(value: unknown): string {
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}

export async function reserveOperatorMutation<T>(
  query: QueryExecutor,
  input: {
    scope: string;
    actor: OperatorMutationActor;
    idempotencyKey: string;
    request: unknown;
    correlationKey: string;
    now: Date;
  },
): Promise<MutationReservation<T>> {
  const actorKey = keyedActorHash(input.correlationKey, `operator:${input.actor.subjectId}`);
  const requestHash = mutationRequestHash(input.request);
  const identity = `${input.scope}:${input.actor.subjectId}:${input.idempotencyKey}`;
  const recordId = deterministicUuid('nagarik:v2:operator-idempotency', identity);
  const expiresAt = new Date(input.now.getTime() + 30 * 24 * 60 * 60_000);

  const rows = await query.query(
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
      recordId,
      input.actor.organizationId,
      input.scope,
      actorKey,
      input.idempotencyKey,
      requestHash,
      expiresAt.toISOString(),
    ],
  );
  const row = rows[0];
  const disposition = String(row?.disposition ?? '');
  if (disposition === 'conflict') {
    throw new OperatorMutationError('idempotency_key_reused', 409);
  }
  if (disposition === 'in_progress') {
    throw new OperatorMutationError('idempotency_in_progress', 409);
  }
  if (disposition === 'replay') {
    return { disposition: 'replay', response: row?.response_body as T };
  }
  if (disposition !== 'reserved') throw new Error('operator_idempotency_reservation_invalid');
  return { disposition: 'reserved', recordId, requestHash, actorKey };
}

export async function completeOperatorMutation(
  query: QueryExecutor,
  input: {
    recordId: string;
    requestHash: string;
    status: number;
    response: unknown;
    resourceId: string;
  },
): Promise<void> {
  await query.query(
    `select nagarik.complete_idempotency(
       $1::uuid,
       decode($2, 'hex'),
       $3,
       $4::jsonb,
       $5::uuid
     )`,
    [
      input.recordId,
      input.requestHash,
      input.status,
      JSON.stringify(input.response),
      input.resourceId,
    ],
  );
}

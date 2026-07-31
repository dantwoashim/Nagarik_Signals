import type { QueryExecutor } from '../db/query';
import { deterministicUuid, deterministicUuidV4, keyedActorHash } from '../security/ids';

export type SignalCapability = {
  organizationId: string;
  capabilityId: string;
  subjectId: string;
  keyVersion: number;
};

export type SignalResult = {
  replayed: boolean;
  publicId: string;
  signalCount: number;
  semantics: 'attention_not_verification';
};

export type SignalDependencies = {
  transaction<T>(operation: (query: QueryExecutor) => Promise<T>): Promise<T>;
  correlationKey: string;
  now?: () => Date;
};

export class SignalError extends Error {
  constructor(
    public readonly code: 'signals_disabled' | 'issue_not_signalable',
    public readonly status: 404 | 503,
  ) {
    super(code);
    this.name = 'SignalError';
  }
}

export async function recordPublicSignal(
  input: { publicId: string; capability: SignalCapability },
  dependencies: SignalDependencies,
): Promise<SignalResult> {
  const now = dependencies.now?.() ?? new Date();
  return dependencies.transaction(async (query) => {
    const rows = await query.query(
      `select
         issue.id as issue_id,
         issue.organization_id,
         projection.public_id
       from public.issue_projection projection
       join nagarik.issues issue on issue.public_id = projection.public_id
       join nagarik.capability_kill_switches switch
         on switch.capability = 'inviteSignalsEnabled'
       where projection.public_id = $1::uuid
         and projection.publication_state = 'published'
         and issue.organization_id = $2::uuid
         and switch.disabled = false
       for update of projection`,
      [input.publicId, input.capability.organizationId],
    );
    const row = rows[0];
    if (!row) {
      const switches = await query.query(
        `select nagarik.is_capability_enabled('inviteSignalsEnabled') as enabled`,
      );
      if (switches[0]?.enabled !== true) throw new SignalError('signals_disabled', 503);
      throw new SignalError('issue_not_signalable', 404);
    }

    const signalKey = keyedActorHash(
      dependencies.correlationKey,
      `signal:${input.capability.capabilityId}:${String(row.issue_id)}`,
    );
    const signalId = deterministicUuid(
      'nagarik:v2:public-signal',
      `${String(row.issue_id)}:${input.capability.keyVersion}:${signalKey}`,
    );
    const existing = await query.query(
      `select id, state
       from nagarik.signals
       where issue_id = $1::uuid
         and key_version = $2
         and signal_key = decode($3, 'hex')
       for update`,
      [String(row.issue_id), input.capability.keyVersion, signalKey],
    );
    let changed = false;
    if (!existing[0]) {
      await query.query(
        `insert into nagarik.signals(
           id, issue_id, key_version, signal_key, state, created_at
         )
         values (
           $1::uuid, $2::uuid, $3, decode($4, 'hex'), 'active', $5::timestamptz
         )`,
        [signalId, String(row.issue_id), input.capability.keyVersion, signalKey, now.toISOString()],
      );
      changed = true;
    } else if (existing[0].state === 'retracted') {
      await query.query(
        `update nagarik.signals
         set state = 'active', retracted_at = null
         where id = $1::uuid and state = 'retracted'`,
        [String(existing[0].id)],
      );
      changed = true;
    }
    const countRows = await query.query(
      `select count(*)::integer as signal_count
       from nagarik.signals
       where issue_id = $1::uuid and state = 'active'`,
      [String(row.issue_id)],
    );
    const signalCount = Number(countRows[0]?.signal_count ?? 0);
    await query.query(
      `update public.issue_projection
       set signal_count = $2, updated_at = $3::timestamptz
       where public_id = $1::uuid`,
      [input.publicId, signalCount, now.toISOString()],
    );

    if (changed) {
      const eventIdentity = `${signalId}:${existing[0] ? 'reactivated' : 'recorded'}`;
      const auditId = deterministicUuid('nagarik:v2:signal-audit', eventIdentity);
      const requestId = deterministicUuidV4('nagarik:v2:signal-request', eventIdentity);
      await query.query(
        `insert into nagarik.audit_events(
           id, organization_id, actor_type, actor_key, action,
           resource_type, resource_id, request_id, detail, occurred_at
         )
         values (
           $1::uuid, $2::uuid, 'capability', decode($3, 'hex'), $4,
           'issue', $5::uuid, $6::uuid, $7::jsonb, $8::timestamptz
         )`,
        [
          auditId,
          input.capability.organizationId,
          signalKey,
          existing[0] ? 'public_signal_reactivated' : 'public_signal_recorded',
          String(row.issue_id),
          requestId,
          JSON.stringify({
            semantics: 'attention_not_verification',
            signalCount,
          }),
          now.toISOString(),
        ],
      );
    }
    return {
      replayed: !changed,
      publicId: input.publicId,
      signalCount,
      semantics: 'attention_not_verification',
    };
  });
}

export async function retractPublicSignal(
  input: { publicId: string; capability: SignalCapability },
  dependencies: SignalDependencies,
): Promise<SignalResult> {
  const now = dependencies.now?.() ?? new Date();
  return dependencies.transaction(async (query) => {
    const rows = await query.query(
      `select issue.id as issue_id
       from public.issue_projection projection
       join nagarik.issues issue on issue.public_id = projection.public_id
       join nagarik.capability_kill_switches switch
         on switch.capability = 'inviteSignalsEnabled'
       where projection.public_id = $1::uuid
         and projection.publication_state = 'published'
         and issue.organization_id = $2::uuid
         and switch.disabled = false
       for update of projection`,
      [input.publicId, input.capability.organizationId],
    );
    const row = rows[0];
    if (!row) {
      const switches = await query.query(
        `select nagarik.is_capability_enabled('inviteSignalsEnabled') as enabled`,
      );
      if (switches[0]?.enabled !== true) throw new SignalError('signals_disabled', 503);
      throw new SignalError('issue_not_signalable', 404);
    }
    const issueId = String(row.issue_id);
    const signalKey = keyedActorHash(
      dependencies.correlationKey,
      `signal:${input.capability.capabilityId}:${issueId}`,
    );
    const existing = await query.query(
      `select id, state
       from nagarik.signals
       where issue_id = $1::uuid
         and key_version = $2
         and signal_key = decode($3, 'hex')
       for update`,
      [issueId, input.capability.keyVersion, signalKey],
    );
    const changed = existing[0]?.state === 'active';
    if (changed) {
      await query.query(
        `update nagarik.signals
         set state = 'retracted', retracted_at = $2::timestamptz
         where id = $1::uuid and state = 'active'`,
        [String(existing[0].id), now.toISOString()],
      );
    }
    const countRows = await query.query(
      `select count(*)::integer as signal_count
       from nagarik.signals
       where issue_id = $1::uuid and state = 'active'`,
      [issueId],
    );
    const signalCount = Number(countRows[0]?.signal_count ?? 0);
    await query.query(
      `update public.issue_projection
       set signal_count = $2, updated_at = $3::timestamptz
       where public_id = $1::uuid`,
      [input.publicId, signalCount, now.toISOString()],
    );
    if (changed) {
      const signalId = String(existing[0].id);
      await query.query(
        `insert into nagarik.audit_events(
           id, organization_id, actor_type, actor_key, action,
           resource_type, resource_id, request_id, detail, occurred_at
         )
         values (
           $1::uuid, $2::uuid, 'capability', decode($3, 'hex'), 'public_signal_retracted',
           'issue', $4::uuid, $5::uuid, $6::jsonb, $7::timestamptz
         )`,
        [
          deterministicUuid('nagarik:v2:signal-retraction-audit', signalId),
          input.capability.organizationId,
          signalKey,
          issueId,
          deterministicUuidV4('nagarik:v2:signal-retraction-request', signalId),
          JSON.stringify({ semantics: 'attention_not_verification', signalCount }),
          now.toISOString(),
        ],
      );
    }
    return {
      replayed: !changed,
      publicId: input.publicId,
      signalCount,
      semantics: 'attention_not_verification',
    };
  });
}

import type { QueryExecutor } from '../db/query';
import type { ChainSigner } from './signer';
import {
  chainObservationMatches,
  prepareChainOutboxRecord,
  reconcileExactChainOutboxJob,
  type ChainOutboxEnvelopeRecord,
  type ChainWorkerDependencies,
} from './outboxWorker';

type ReconciliationRow = ChainOutboxEnvelopeRecord & {
  id: string;
  state: string;
  confirmed_update_count: number | string;
  confirmed_timeline_head: Uint8Array;
  confirmed_handoff_head: Uint8Array;
  binding_cluster: string | null;
  binding_genesis_hash: string | null;
  binding_program_id: string | null;
  binding_issue_account: string | null;
  binding_event_account: string | null;
  binding_event_id: Uint8Array | null;
  binding_chain_sequence: number | string | null;
  binding_signature: string | null;
  binding_finalized_slot: number | string | null;
  binding_account_sha256: Uint8Array | null;
};

export type ChainReconciliationFinding = {
  outboxId: string;
  databaseState: string;
  status:
    | 'consistent'
    | 'recoverable'
    | 'repaired'
    | 'missing'
    | 'conflict'
    | 'invalid'
    | 'rpc_error'
    | 'busy';
  detail: string;
};

export type ChainReconciliationResult = {
  dryRun: boolean;
  inspected: number;
  consistent: number;
  recoverable: number;
  repaired: number;
  missing: number;
  conflict: number;
  invalid: number;
  rpcErrors: number;
  busy: number;
  findings: ChainReconciliationFinding[];
};

type Dependencies = {
  query: QueryExecutor;
  transaction: ChainWorkerDependencies['transaction'];
  signer: ChainSigner;
  workerId: string;
  now?: () => Date;
};

function createResult(dryRun: boolean): ChainReconciliationResult {
  return {
    dryRun,
    inspected: 0,
    consistent: 0,
    recoverable: 0,
    repaired: 0,
    missing: 0,
    conflict: 0,
    invalid: 0,
    rpcErrors: 0,
    busy: 0,
    findings: [],
  };
}

function append(
  result: ChainReconciliationResult,
  row: ReconciliationRow,
  status: ChainReconciliationFinding['status'],
  detail: string,
): void {
  result.findings.push({
    outboxId: row.id,
    databaseState: row.state,
    status,
    detail,
  });
  if (status === 'rpc_error') result.rpcErrors += 1;
  else if (status === 'recoverable') result.recoverable += 1;
  else result[status] += 1;
}

function hex(value: Uint8Array | null): string | null {
  return value ? Buffer.from(value).toString('hex') : null;
}

export async function reconcileChainOutbox(
  dependencies: Dependencies,
  options: { dryRun?: boolean; limit?: number } = {},
): Promise<ChainReconciliationResult> {
  const dryRun = options.dryRun ?? true;
  const requestedLimit = options.limit ?? 25;
  const normalizedLimit = Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 25;
  const limit = Math.min(Math.max(normalizedLimit, 1), 100);
  const rows = (await dependencies.query.query(
    `select
       job.id,
       job.operation_id,
       job.operation_type,
       job.chain_sequence,
       job.event_id,
       job.canonical_payload,
       job.payload_hash,
       job.state,
       issue.confirmed_update_count,
       issue.confirmed_timeline_head,
       issue.confirmed_handoff_head,
       binding.cluster as binding_cluster,
       binding.genesis_hash as binding_genesis_hash,
       binding.program_id as binding_program_id,
       binding.issue_account as binding_issue_account,
       binding.event_account as binding_event_account,
       binding.event_id as binding_event_id,
       binding.chain_sequence as binding_chain_sequence,
       binding.signature as binding_signature,
       binding.finalized_slot as binding_finalized_slot,
       binding.account_sha256 as binding_account_sha256
     from nagarik.outbox_jobs job
     join nagarik.issues issue on issue.id = job.issue_id
     left join nagarik.issue_chain_bindings binding
       on binding.protocol_version = 'v2'
      and binding.event_id = job.event_id
     where job.operation_type in (
       'issue_created',
       'metadata_version_committed',
       'lifecycle_changed',
       'handoff_checkpointed',
       'publication_removed'
     )
       and job.issue_id is not null
       and job.event_id is not null
     order by job.created_at, job.id
     limit $1`,
    [limit],
  )) as ReconciliationRow[];
  const result = createResult(dryRun);
  result.inspected = rows.length;

  for (const row of rows) {
    let job;
    try {
      job = prepareChainOutboxRecord(row);
    } catch {
      append(result, row, 'invalid', 'database_envelope_invalid');
      continue;
    }

    let observation;
    try {
      observation = await dependencies.signer.inspect(job);
    } catch {
      append(result, row, 'rpc_error', 'chain_inspection_failed');
      continue;
    }
    if (!observation) {
      append(
        result,
        row,
        row.state === 'confirmed' ? 'conflict' : 'missing',
        row.state === 'confirmed' ? 'confirmed_event_missing' : 'event_not_observed',
      );
      continue;
    }
    if (!chainObservationMatches(job, observation)) {
      append(result, row, 'conflict', 'deterministic_event_mismatch');
      continue;
    }
    const databaseMatches =
      Number(row.confirmed_update_count) === job.next.updateCount &&
      hex(row.confirmed_timeline_head) === job.next.timelineHead &&
      hex(row.confirmed_handoff_head) === job.next.handoffHead &&
      row.binding_cluster === dependencies.signer.profile.cluster &&
      row.binding_genesis_hash === dependencies.signer.profile.genesisHash &&
      row.binding_program_id === dependencies.signer.profile.programId &&
      row.binding_issue_account === observation.issueAccount &&
      row.binding_event_account === observation.eventAccount &&
      hex(row.binding_event_id) === observation.eventId &&
      Number(row.binding_chain_sequence) === observation.sequence &&
      row.binding_signature === observation.signature &&
      Number(row.binding_finalized_slot) === observation.finalizedSlot &&
      hex(row.binding_account_sha256) === observation.accountSha256;
    if (row.state === 'confirmed' && databaseMatches) {
      append(result, row, 'consistent', 'database_and_chain_match');
      continue;
    }
    if (dryRun) {
      append(result, row, 'recoverable', 'exact_event_can_be_reconciled');
      continue;
    }

    const repair = await reconcileExactChainOutboxJob(dependencies, row.id, observation);
    if (repair === 'confirmed') append(result, row, 'repaired', 'database_confirmation_repaired');
    else if (repair === 'alreadyConfirmed')
      append(result, row, 'consistent', 'concurrent_reconciliation_completed');
    else if (repair === 'busy') append(result, row, 'busy', 'active_worker_lease');
    else append(result, row, 'conflict', 'database_repair_rejected');
  }
  return result;
}

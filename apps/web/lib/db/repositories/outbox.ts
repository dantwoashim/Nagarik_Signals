import 'server-only';

import type { Database, DatabaseTransaction } from '@/lib/db/postgres';

type Sql = Database | DatabaseTransaction;

export type ClaimedOutboxJob = {
  id: string;
  operation_id: Buffer;
  organization_id: string;
  issue_id: string | null;
  issue_version_id: string | null;
  operation_type: string;
  chain_sequence: string | null;
  canonical_payload: unknown;
  payload_hash: Buffer;
  state: 'leased';
  attempt_count: number;
  lease_owner: string;
  lease_expires_at: Date;
};

export async function claimOutboxJobs(
  sql: Sql,
  input: { workerId: string; limit?: number; leaseSeconds?: number },
): Promise<ClaimedOutboxJob[]> {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const leaseSeconds = Math.min(Math.max(input.leaseSeconds ?? 60, 5), 600);

  return sql<ClaimedOutboxJob[]>`
    select *
    from nagarik.claim_outbox_jobs(${input.workerId}, ${limit}, ${leaseSeconds})
  `;
}

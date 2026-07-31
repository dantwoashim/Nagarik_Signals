import 'server-only';

import type { Database, DatabaseTransaction } from '@/lib/db/postgres';

type Sql = Database | DatabaseTransaction;

export type PrivateSubmission = {
  id: string;
  tracking_id: string;
  organization_id: string;
  record_kind: 'community_report' | 'public_source';
  state: string;
  version: string;
  current_revision_number: number;
  assigned_to: string | null;
  received_at: Date;
  updated_at: Date;
};

export async function findPrivateSubmission(
  sql: Sql,
  organizationId: string,
  submissionId: string,
): Promise<PrivateSubmission | null> {
  const rows = await sql<PrivateSubmission[]>`
    select
      id,
      tracking_id,
      organization_id,
      record_kind,
      state,
      version,
      current_revision_number,
      assigned_to,
      received_at,
      updated_at
    from nagarik.submissions
    where id = ${submissionId}
      and organization_id = ${organizationId}
    limit 1
  `;
  return rows[0] ?? null;
}

export async function listModerationQueue(
  sql: Sql,
  input: {
    organizationId: string;
    limit: number;
    afterReceivedAt?: Date;
    afterId?: string;
  },
): Promise<PrivateSubmission[]> {
  const limit = Math.min(Math.max(input.limit, 1), 100);
  const hasCursor = Boolean(input.afterReceivedAt && input.afterId);

  return sql<PrivateSubmission[]>`
    select
      id,
      tracking_id,
      organization_id,
      record_kind,
      state,
      version,
      current_revision_number,
      assigned_to,
      received_at,
      updated_at
    from nagarik.submissions
    where organization_id = ${input.organizationId}
      and state in ('received', 'under_review', 'changes_requested', 'revision_pending')
      and (
        ${hasCursor} = false
        or (received_at, id) > (
          ${input.afterReceivedAt ?? new Date(0)},
          ${input.afterId ?? '00000000-0000-0000-0000-000000000000'}::uuid
        )
      )
    order by received_at, id
    limit ${limit}
  `;
}

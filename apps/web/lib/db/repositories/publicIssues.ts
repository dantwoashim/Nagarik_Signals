import 'server-only';

import type { Database, DatabaseTransaction } from '@/lib/db/postgres';

type Sql = Database | DatabaseTransaction;

export type PublicIssueProjection = {
  public_id: string;
  workflow_version: 'v2' | 'v1_legacy';
  version_id: string | null;
  publication_state: 'published' | 'superseded' | 'removed';
  title: string | null;
  summary: string | null;
  category: string | null;
  ward: unknown;
  location: unknown;
  lifecycle: string | null;
  legacy_status: string | null;
  signal_count: string;
  published_at: Date | null;
  updated_at: Date;
};

export async function findPublicIssue(
  sql: Sql,
  publicId: string,
): Promise<PublicIssueProjection | null> {
  const rows = await sql<PublicIssueProjection[]>`
    select
      public_id,
      workflow_version,
      version_id,
      publication_state,
      title,
      summary,
      category,
      ward,
      location,
      lifecycle,
      legacy_status,
      signal_count,
      published_at,
      updated_at
    from public.issue_projection
    where public_id = ${publicId}
    limit 1
  `;
  return rows[0] ?? null;
}

export async function listPublicIssues(
  sql: Sql,
  input: { limit: number; beforePublishedAt?: Date; beforePublicId?: string },
): Promise<PublicIssueProjection[]> {
  const limit = Math.min(Math.max(input.limit, 1), 100);
  const hasCursor = Boolean(input.beforePublishedAt && input.beforePublicId);

  return sql<PublicIssueProjection[]>`
    select
      public_id,
      workflow_version,
      version_id,
      publication_state,
      title,
      summary,
      category,
      ward,
      location,
      lifecycle,
      legacy_status,
      signal_count,
      published_at,
      updated_at
    from public.issue_projection
    where publication_state = 'published'
      and (
        ${hasCursor} = false
        or (published_at, public_id) < (
          ${input.beforePublishedAt ?? new Date(0)},
          ${input.beforePublicId ?? '00000000-0000-0000-0000-000000000000'}::uuid
        )
      )
    order by published_at desc, public_id desc
    limit ${limit}
  `;
}

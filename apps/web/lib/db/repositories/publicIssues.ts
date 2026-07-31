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
  narrative: string | null;
  category: string | null;
  ward: unknown;
  location: unknown;
  media_id: string | null;
  provenance: unknown;
  lifecycle: string | null;
  legacy_status: string | null;
  signal_count: string;
  tombstone: unknown;
  published_at: Date | null;
  updated_at: Date;
};

export type PublicIssueEvent = {
  event_id: string;
  event_type: string;
  chain_sequence: string | null;
  public_event: unknown;
  occurred_at: Date;
};

export type PublicIssueProof = {
  issue_public_id: string;
  protocol_version: 'v1_legacy' | 'v2';
  version_id: string | null;
  metadata_hash: Uint8Array;
  evidence_hash: Uint8Array;
  location_hash: Uint8Array;
  cluster: string;
  genesis_hash: string;
  program_id: string;
  issue_account: string;
  event_account: string | null;
  signature: string;
  finalized_slot: string;
  update_count: string;
  timeline_head: Uint8Array;
  handoff_head: Uint8Array;
  canonical_metadata: unknown;
  confirmed_at: Date;
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
      narrative,
      category,
      ward,
      location,
      media_id,
      provenance,
      lifecycle,
      legacy_status,
      signal_count,
      tombstone,
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
      narrative,
      category,
      ward,
      location,
      media_id,
      provenance,
      lifecycle,
      legacy_status,
      signal_count,
      tombstone,
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

export async function listPublicIssueEvents(
  sql: Sql,
  publicId: string,
): Promise<PublicIssueEvent[]> {
  return sql<PublicIssueEvent[]>`
    select
      event_id,
      event_type,
      chain_sequence,
      public_event,
      occurred_at
    from public.event_projection
    where issue_public_id = ${publicId}
    order by occurred_at, event_id
  `;
}

export async function findPublicIssueProof(
  sql: Sql,
  publicId: string,
): Promise<PublicIssueProof | null> {
  const rows = await sql<PublicIssueProof[]>`
    select
      issue_public_id,
      protocol_version,
      version_id,
      metadata_hash,
      evidence_hash,
      location_hash,
      cluster,
      genesis_hash,
      program_id,
      issue_account,
      event_account,
      signature,
      finalized_slot,
      update_count,
      timeline_head,
      handoff_head,
      canonical_metadata,
      confirmed_at,
      updated_at
    from public.proof_projection
    where issue_public_id = ${publicId}
    limit 1
  `;
  return rows[0] ?? null;
}

import type { QueryExecutor } from '../db/query';
import type { PreparedChainJob } from './chainJob';
import type { ObservedCommitmentEvent } from './signer';

type ProjectionInput = {
  issueId: string;
  issueVersionId: string | null;
  job: PreparedChainJob;
  observation: ObservedCommitmentEvent;
  cluster: string;
  genesisHash: string;
  programId: string;
  now: Date;
};

function safeSummary(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/gu, ' ');
  return normalized.length <= 220 ? normalized : `${normalized.slice(0, 217).trimEnd()}...`;
}

async function publicationEnabled(query: QueryExecutor): Promise<boolean> {
  const rows = await query.query(
    `select nagarik.is_capability_enabled('publicationEnabled') as enabled`,
  );
  return rows[0]?.enabled === true;
}

async function projectPublishedVersion(
  query: QueryExecutor,
  input: ProjectionInput,
): Promise<boolean> {
  if (!(await publicationEnabled(query))) return false;
  const rows = await query.query(
    `select
       issue.public_id,
       issue.workflow_version,
       issue.lifecycle,
       version.id as version_id,
       version.version_number,
       version.title,
       version.narrative,
       version.category,
       version.ward_id,
       version.ward_label,
       version.locality_label,
       version.public_location,
       version.public_media_id,
       version.public_provenance,
       version.public_reason,
       media.state as media_state,
       media.source_media_id,
       media.mime_type,
       media.sha256,
       media.byte_length,
       media.width,
       media.height,
       event.public_event
     from nagarik.issues issue
     join nagarik.issue_versions version on version.id = issue.current_version_id
     join nagarik.publication_events event on event.id = $2::uuid
     join nagarik.media_objects media on media.id = version.public_media_id
     where issue.id = $1::uuid
       and issue.current_version_id = $3::uuid
       and issue.publication_state = 'commit_pending'
     for update of issue, version, media`,
    [input.issueId, input.job.databaseEventId, input.issueVersionId],
  );
  const row = rows[0];
  if (!row) throw new Error('publication_confirmation_state_missing');
  if (
    !row.public_media_id ||
    !row.mime_type ||
    row.media_state !== 'approved_public' ||
    !row.source_media_id
  ) {
    throw new Error('publication_media_missing');
  }

  await query.query(
    `update nagarik.issue_versions
     set
       state = case when id = $2::uuid then 'published' else 'superseded' end,
       published_at = case
         when id = $2::uuid then coalesce(published_at, $3::timestamptz)
         else published_at
       end
     where issue_id = $1::uuid
       and (id = $2::uuid or state = 'published')`,
    [input.issueId, input.issueVersionId, input.now.toISOString()],
  );
  await query.query(
    `update nagarik.issues
     set publication_state = 'published', updated_at = $2::timestamptz
     where id = $1::uuid`,
    [input.issueId, input.now.toISOString()],
  );
  await query.query(
    `insert into public.issue_projection(
       public_id, workflow_version, version_id, publication_state,
       title, summary, narrative, category, ward, location, media_id,
       provenance, lifecycle, legacy_status, signal_count, legacy_signal_count,
       tombstone, published_at, updated_at
     )
     values (
       $1::uuid, $2, $3::uuid, 'published',
       $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::uuid,
       $11::jsonb, $12, null, 0, null,
       null, $13::timestamptz, $13::timestamptz
     )
     on conflict (public_id) do update set
       workflow_version = excluded.workflow_version,
       version_id = excluded.version_id,
       publication_state = excluded.publication_state,
       title = excluded.title,
       summary = excluded.summary,
       narrative = excluded.narrative,
       category = excluded.category,
       ward = excluded.ward,
       location = excluded.location,
       media_id = excluded.media_id,
       provenance = excluded.provenance,
       lifecycle = excluded.lifecycle,
       legacy_status = null,
       tombstone = null,
       published_at = excluded.published_at,
       updated_at = excluded.updated_at`,
    [
      String(row.public_id),
      String(row.workflow_version),
      String(row.version_id),
      String(row.title),
      safeSummary(row.narrative),
      String(row.narrative),
      String(row.category),
      JSON.stringify({ id: row.ward_id, label: row.ward_label }),
      JSON.stringify(row.public_location),
      String(row.public_media_id),
      JSON.stringify(row.public_provenance),
      String(row.lifecycle),
      input.now.toISOString(),
    ],
  );
  await query.query(
    `insert into public.media_projection(
       media_id, issue_public_id, version_id, mime_type, sha256,
       byte_length, width, height, state, updated_at
     )
     values (
       $1::uuid, $2::uuid, $3::uuid, $4, $5,
       $6, $7, $8, 'eligible', $9::timestamptz
     )
     on conflict (media_id) do update set
       issue_public_id = excluded.issue_public_id,
       version_id = excluded.version_id,
       mime_type = excluded.mime_type,
       sha256 = excluded.sha256,
       byte_length = excluded.byte_length,
       width = excluded.width,
       height = excluded.height,
       state = 'eligible',
       updated_at = excluded.updated_at`,
    [
      String(row.public_media_id),
      String(row.public_id),
      String(row.version_id),
      String(row.mime_type),
      row.sha256,
      Number(row.byte_length),
      Number(row.width),
      Number(row.height),
      input.now.toISOString(),
    ],
  );
  await query.query(
    `insert into public.event_projection(
       event_id, issue_public_id, event_type, chain_sequence, public_event, occurred_at
     )
     values ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6::timestamptz)
     on conflict (event_id) do nothing`,
    [
      input.job.databaseEventId,
      String(row.public_id),
      input.job.operation === 'issue_created' ? 'publication' : 'correction',
      input.job.next.updateCount,
      JSON.stringify(row.public_event),
      input.now.toISOString(),
    ],
  );
  return true;
}

async function projectLifecycle(query: QueryExecutor, input: ProjectionInput): Promise<void> {
  const rows = await query.query(
    `select issue.public_id, event.to_state, event.public_event, event.created_at
     from nagarik.lifecycle_events event
     join nagarik.issues issue on issue.id = event.issue_id
     where event.id = $1::uuid
       and event.issue_id = $2::uuid`,
    [input.job.databaseEventId, input.issueId],
  );
  const row = rows[0];
  if (!row) throw new Error('lifecycle_confirmation_state_missing');
  await query.query(
    `update public.issue_projection
     set lifecycle = $2, updated_at = $3::timestamptz
     where public_id = $1::uuid and publication_state = 'published'`,
    [String(row.public_id), String(row.to_state), input.now.toISOString()],
  );
  await query.query(
    `insert into public.event_projection(
       event_id, issue_public_id, event_type, chain_sequence, public_event, occurred_at
     )
     values ($1::uuid, $2::uuid, 'lifecycle', $3, $4::jsonb, $5::timestamptz)
     on conflict (event_id) do nothing`,
    [
      input.job.databaseEventId,
      String(row.public_id),
      input.job.next.updateCount,
      JSON.stringify(row.public_event),
      new Date(String(row.created_at)).toISOString(),
    ],
  );
}

async function projectHandoff(query: QueryExecutor, input: ProjectionInput): Promise<void> {
  const rows = await query.query(
    `select issue.public_id, event.public_event, event.created_at
     from nagarik.handoff_events event
     join nagarik.issues issue on issue.id = event.issue_id
     where event.id = $1::uuid
       and event.issue_id = $2::uuid`,
    [input.job.databaseEventId, input.issueId],
  );
  const row = rows[0];
  if (!row || !row.public_event) throw new Error('handoff_confirmation_state_missing');
  await query.query(
    `insert into public.event_projection(
       event_id, issue_public_id, event_type, chain_sequence, public_event, occurred_at
     )
     values ($1::uuid, $2::uuid, 'handoff', $3, $4::jsonb, $5::timestamptz)
     on conflict (event_id) do nothing`,
    [
      input.job.databaseEventId,
      String(row.public_id),
      input.job.next.updateCount,
      JSON.stringify(row.public_event),
      new Date(String(row.created_at)).toISOString(),
    ],
  );
}

async function projectRemoval(query: QueryExecutor, input: ProjectionInput): Promise<void> {
  const rows = await query.query(
    `select
       issue.public_id,
       issue.current_version_id,
       version.public_media_id,
       event.public_event
     from nagarik.issues issue
     join nagarik.issue_versions version on version.id = issue.current_version_id
     join nagarik.publication_events event
       on event.id = $2::uuid and event.issue_id = issue.id and event.event_type = 'removed'
     where issue.id = $1::uuid
     for update of issue, version`,
    [input.issueId, input.job.databaseEventId],
  );
  const row = rows[0];
  if (!row) throw new Error('removal_confirmation_state_missing');
  const tombstone = {
    schemaVersion: 'nagarik-tombstone-v1',
    removedAt: input.now.toISOString(),
    ...((row.public_event as Record<string, unknown>) ?? {}),
  };
  await query.query(
    `update nagarik.issues
     set publication_state = 'removed', updated_at = $2::timestamptz
     where id = $1::uuid`,
    [input.issueId, input.now.toISOString()],
  );
  await query.query(
    `update nagarik.issue_versions
     set state = 'removed'
     where id = $1::uuid and state in ('commit_pending', 'published')`,
    [String(row.current_version_id)],
  );
  if (row.public_media_id) {
    await query.query(
      `update nagarik.media_objects
       set state = 'removed', version = version + 1, denied_at = $2::timestamptz,
           updated_at = $2::timestamptz
       where id = $1::uuid and state = 'approved_public'`,
      [String(row.public_media_id), input.now.toISOString()],
    );
    await query.query(
      `update public.media_projection
       set state = 'removed', updated_at = $2::timestamptz
       where media_id = $1::uuid`,
      [String(row.public_media_id), input.now.toISOString()],
    );
  }
  await query.query(
    `update public.issue_projection
     set
       publication_state = 'removed',
       version_id = null,
       title = null,
       summary = null,
       narrative = null,
       category = null,
       ward = null,
       location = null,
       media_id = null,
       provenance = null,
       lifecycle = null,
       legacy_status = null,
       tombstone = $2::jsonb,
       updated_at = $3::timestamptz
     where public_id = $1::uuid`,
    [String(row.public_id), JSON.stringify(tombstone), input.now.toISOString()],
  );
  await query.query(
    `insert into public.event_projection(
       event_id, issue_public_id, event_type, chain_sequence, public_event, occurred_at
     )
     values ($1::uuid, $2::uuid, 'removal', $3, $4::jsonb, $5::timestamptz)
     on conflict (event_id) do nothing`,
    [
      input.job.databaseEventId,
      String(row.public_id),
      input.job.next.updateCount,
      JSON.stringify(tombstone),
      input.now.toISOString(),
    ],
  );
}

async function upsertProof(query: QueryExecutor, input: ProjectionInput): Promise<void> {
  const issues = await query.query(
    `select public_id
     from nagarik.issues
     where id = $1::uuid`,
    [input.issueId],
  );
  const publicId = issues[0]?.public_id;
  if (!publicId) throw new Error('proof_projection_issue_missing');
  const projection = await query.query(
    `select 1 as present from public.issue_projection where public_id = $1::uuid`,
    [String(publicId)],
  );
  if (!projection[0]) return;
  let canonicalMetadata: unknown;
  if (
    input.job.operation === 'issue_created' ||
    input.job.operation === 'metadata_version_committed'
  ) {
    const versions = await query.query(
      `select
         issue.public_id,
         version.version_number,
         version.title,
         version.narrative,
         version.category,
         version.ward_id,
         version.ward_label,
         version.locality_label,
         version.public_location,
         version.public_media_id,
         version.public_provenance,
         version.public_reason
       from nagarik.issue_versions version
       join nagarik.issues issue on issue.id = version.issue_id
       where version.id = $1::uuid and issue.id = $2::uuid`,
      [input.issueVersionId, input.issueId],
    );
    const version = versions[0];
    if (!version) throw new Error('proof_projection_version_missing');
    const provenance = version.public_provenance as Record<string, unknown>;
    canonicalMetadata = {
      schemaVersion: 'nagarik-public-version-v2',
      publicId: String(version.public_id),
      version: Number(version.version_number),
      title: String(version.title),
      narrative: String(version.narrative),
      category: String(version.category),
      observedOn: provenance.observedOn ?? null,
      ward: { id: String(version.ward_id), label: String(version.ward_label) },
      localityLabel: version.locality_label ? String(version.locality_label) : null,
      publicLocation: version.public_location,
      publicMediaId: String(version.public_media_id),
      provenance,
      publicReason: version.public_reason ? String(version.public_reason) : null,
    };
  } else if (input.job.operation === 'publication_removed') {
    const events = await query.query(
      `select public_event
       from nagarik.publication_events
       where id = $1::uuid and issue_id = $2::uuid and event_type = 'removed'`,
      [input.job.databaseEventId, input.issueId],
    );
    if (!events[0]) throw new Error('proof_projection_removal_missing');
    canonicalMetadata = events[0].public_event;
  } else {
    const existing = await query.query(
      `select canonical_metadata
       from public.proof_projection
       where issue_public_id = $1::uuid`,
      [String(publicId)],
    );
    if (!existing[0]) throw new Error('proof_projection_predecessor_missing');
    canonicalMetadata = existing[0].canonical_metadata;
  }
  await query.query(
    `insert into public.proof_projection(
       issue_public_id, protocol_version, version_id,
       metadata_hash, evidence_hash, location_hash,
       cluster, genesis_hash, program_id, issue_account, event_account,
       signature, finalized_slot, update_count, timeline_head, handoff_head,
       canonical_metadata, confirmed_at, updated_at
     )
     values (
       $1::uuid, 'v2', $2::uuid,
       decode($3, 'hex'), decode($4, 'hex'), decode($5, 'hex'),
       $6, $7, $8, $9, $10,
       $11, $12, $13, decode($14, 'hex'), decode($15, 'hex'),
       $16::jsonb, $17::timestamptz, $17::timestamptz
     )
     on conflict (issue_public_id) do update set
       protocol_version = 'v2',
       version_id = excluded.version_id,
       metadata_hash = excluded.metadata_hash,
       evidence_hash = excluded.evidence_hash,
       location_hash = excluded.location_hash,
       cluster = excluded.cluster,
       genesis_hash = excluded.genesis_hash,
       program_id = excluded.program_id,
       issue_account = excluded.issue_account,
       event_account = excluded.event_account,
       signature = excluded.signature,
       finalized_slot = excluded.finalized_slot,
       update_count = excluded.update_count,
       timeline_head = excluded.timeline_head,
       handoff_head = excluded.handoff_head,
       canonical_metadata = excluded.canonical_metadata,
       confirmed_at = excluded.confirmed_at,
       updated_at = excluded.updated_at`,
    [
      String(publicId),
      input.issueVersionId,
      input.job.next.metadataHash,
      input.job.next.evidenceHash,
      input.job.next.locationHash,
      input.cluster,
      input.genesisHash,
      input.programId,
      input.observation.issueAccount,
      input.observation.eventAccount,
      input.observation.signature,
      input.observation.finalizedSlot,
      input.job.next.updateCount,
      input.job.next.timelineHead,
      input.job.next.handoffHead,
      JSON.stringify(canonicalMetadata),
      input.now.toISOString(),
    ],
  );
}

export async function applyConfirmedPublicProjection(
  query: QueryExecutor,
  input: ProjectionInput,
): Promise<boolean> {
  if (
    input.job.operation === 'issue_created' ||
    input.job.operation === 'metadata_version_committed'
  ) {
    const projected = await projectPublishedVersion(query, input);
    if (!projected) return false;
  } else if (input.job.operation === 'lifecycle_changed') {
    await projectLifecycle(query, input);
  } else if (input.job.operation === 'handoff_checkpointed') {
    await projectHandoff(query, input);
  } else {
    await projectRemoval(query, input);
  }
  await upsertProof(query, input);
  return true;
}

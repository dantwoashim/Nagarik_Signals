begin;

create table nagarik.publication_events (
  id uuid primary key,
  issue_id uuid not null references nagarik.issues(id),
  issue_version_id uuid references nagarik.issue_versions(id),
  event_type text not null check (event_type in ('approved', 'corrected', 'removed')),
  domain_version bigint not null check (domain_version > 0),
  private_reason text,
  public_event jsonb not null,
  created_by uuid not null references nagarik.operator_profiles(auth_subject),
  created_at timestamptz not null default now(),
  unique (issue_id, domain_version),
  check (
    (event_type = 'removed' and issue_version_id is null)
    or
    (event_type in ('approved', 'corrected') and issue_version_id is not null)
  )
);

create index publication_events_issue_time_idx
  on nagarik.publication_events(issue_id, created_at, id);

create trigger publication_events_append_only
before update or delete on nagarik.publication_events
for each row execute function nagarik.reject_row_mutation();

create or replace function nagarik.guard_issue_version_content()
returns trigger
language plpgsql
set search_path = pg_catalog, public, nagarik
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'immutable_issue_version' using errcode = '55000';
  end if;

  if new.issue_id is distinct from old.issue_id
    or new.version_number is distinct from old.version_number
    or new.title is distinct from old.title
    or new.narrative is distinct from old.narrative
    or new.category is distinct from old.category
    or new.ward_id is distinct from old.ward_id
    or new.ward_label is distinct from old.ward_label
    or new.locality_label is distinct from old.locality_label
    or new.public_location is distinct from old.public_location
    or new.public_media_id is distinct from old.public_media_id
    or new.public_provenance is distinct from old.public_provenance
    or new.metadata_hash is distinct from old.metadata_hash
    or new.evidence_hash is distinct from old.evidence_hash
    or new.location_hash is distinct from old.location_hash
    or new.public_reason is distinct from old.public_reason
    or new.version_created_at is distinct from old.version_created_at
    or new.created_at is distinct from old.created_at
  then
    raise exception 'immutable_issue_version_content' using errcode = '55000';
  end if;

  if not (
    new.state = old.state
    or (old.state = 'commit_pending' and new.state in ('published', 'removed'))
    or (old.state = 'published' and new.state in ('superseded', 'removed'))
  ) then
    raise exception 'invalid_issue_version_state_transition' using errcode = '23000';
  end if;

  if new.state = 'published' and new.published_at is null then
    raise exception 'published_issue_version_requires_timestamp' using errcode = '23514';
  end if;
  if old.published_at is not null and new.published_at is distinct from old.published_at then
    raise exception 'immutable_issue_version_publication_time' using errcode = '55000';
  end if;

  return new;
end
$$;

create trigger issue_versions_guard_content
before update or delete on nagarik.issue_versions
for each row execute function nagarik.guard_issue_version_content();

create table public.proof_projection (
  issue_public_id uuid primary key references public.issue_projection(public_id),
  protocol_version text not null check (protocol_version in ('v1_legacy', 'v2')),
  version_id uuid,
  metadata_hash bytea not null check (octet_length(metadata_hash) = 32),
  evidence_hash bytea not null check (octet_length(evidence_hash) = 32),
  location_hash bytea not null check (octet_length(location_hash) = 32),
  cluster text not null,
  genesis_hash text not null,
  program_id text not null,
  issue_account text not null,
  event_account text,
  signature text not null,
  finalized_slot bigint not null check (finalized_slot >= 0),
  update_count bigint not null check (update_count >= 0),
  timeline_head bytea not null check (octet_length(timeline_head) = 32),
  handoff_head bytea not null check (octet_length(handoff_head) = 32),
  confirmed_at timestamptz not null,
  updated_at timestamptz not null
);

alter table nagarik.publication_events enable row level security;
alter table nagarik.publication_events force row level security;
revoke all on nagarik.publication_events from anon, authenticated;
grant all on nagarik.publication_events to service_role;
grant select on nagarik.publication_events to authenticated;

create policy publication_events_operator_read
on nagarik.publication_events
for select
to authenticated
using (
  exists (
    select 1
    from nagarik.issues issue
    where issue.id = publication_events.issue_id
      and nagarik.has_active_role(
        issue.organization_id,
        array['moderator', 'steward', 'privacy_reviewer', 'auditor', 'org_admin', 'system_admin']
      )
  )
);

alter table public.proof_projection enable row level security;
alter table public.proof_projection force row level security;
revoke all on public.proof_projection from anon, authenticated;
grant select on public.proof_projection to anon, authenticated;
grant all on public.proof_projection to service_role;

create policy public_proof_projection_read
on public.proof_projection
for select
to anon, authenticated
using (nagarik.is_capability_enabled('publicReadEnabled'));

commit;

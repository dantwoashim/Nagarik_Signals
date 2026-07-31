begin;

create schema if not exists nagarik;
revoke all on schema nagarik from public;

create table nagarik.organizations (
  id uuid primary key,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null check (char_length(name) between 2 and 120),
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table nagarik.operator_profiles (
  auth_subject uuid primary key,
  display_name text not null check (char_length(display_name) between 1 and 120),
  disabled_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table nagarik.organization_memberships (
  id uuid primary key,
  organization_id uuid not null references nagarik.organizations(id),
  auth_subject uuid not null references nagarik.operator_profiles(auth_subject),
  state text not null check (state in ('invited', 'active', 'suspended', 'revoked')),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, auth_subject)
);

create table nagarik.role_grants (
  id uuid primary key,
  organization_id uuid references nagarik.organizations(id),
  auth_subject uuid not null references nagarik.operator_profiles(auth_subject),
  role text not null check (role in (
    'moderator', 'steward', 'privacy_reviewer', 'auditor', 'org_admin', 'system_admin'
  )),
  state text not null default 'active' check (state in ('active', 'revoked')),
  version bigint not null default 1 check (version > 0),
  granted_by uuid references nagarik.operator_profiles(auth_subject),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((state = 'active' and revoked_at is null) or (state = 'revoked' and revoked_at is not null)),
  unique nulls not distinct (organization_id, auth_subject, role)
);

create unique index role_grants_one_active_system_admin
  on nagarik.role_grants(auth_subject, role)
  where organization_id is null and role = 'system_admin' and state = 'active';

create table nagarik.pilot_policies (
  id uuid primary key,
  organization_id uuid not null references nagarik.organizations(id),
  version bigint not null check (version > 0),
  state text not null check (state in ('draft', 'active', 'retired')),
  boundary_version text not null,
  ward_geometry_version text not null,
  boundary_geojson jsonb not null,
  invitation_scope text[] not null,
  created_by uuid not null references nagarik.operator_profiles(auth_subject),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  unique (organization_id, version)
);

create unique index pilot_policies_one_active
  on nagarik.pilot_policies(organization_id)
  where state = 'active';

create table nagarik.evidence_type_policies (
  id uuid primary key,
  organization_id uuid not null references nagarik.organizations(id),
  code text not null check (code ~ '^[a-z][a-z0-9_]{2,63}$'),
  stage text not null check (stage in ('dispatch', 'acknowledgment')),
  public_label text not null check (char_length(public_label) between 1 and 120),
  media_required boolean not null default false,
  state text not null check (state in ('active', 'retired')),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  unique (organization_id, code, version)
);

create table nagarik.capabilities (
  id uuid primary key,
  organization_id uuid not null references nagarik.organizations(id),
  purpose smallint not null check (purpose between 1 and 8),
  subject_id uuid not null,
  issuance_idempotency_id uuid not null,
  key_version integer not null check (key_version between 1 and 65535),
  verifier bytea not null check (octet_length(verifier) = 32),
  state text not null default 'active' check (state in ('active', 'consumed', 'revoked', 'expired')),
  scope jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, purpose, id),
  unique (organization_id, purpose, issuance_idempotency_id)
);

create index capabilities_subject_active_idx
  on nagarik.capabilities(organization_id, purpose, subject_id, expires_at)
  where state = 'active';

create table nagarik.idempotency_records (
  id uuid primary key,
  organization_id uuid references nagarik.organizations(id),
  scope text not null check (char_length(scope) between 1 and 120),
  actor_key bytea not null check (octet_length(actor_key) = 32),
  idempotency_key uuid not null,
  request_hash bytea not null check (octet_length(request_hash) = 32),
  state text not null check (state in ('reserved', 'completed', 'failed')),
  response_status integer check (response_status between 100 and 599),
  response_body jsonb,
  resource_id uuid,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (scope, actor_key, idempotency_key)
);

create table nagarik.media_objects (
  id uuid primary key,
  organization_id uuid not null references nagarik.organizations(id),
  source_media_id uuid references nagarik.media_objects(id),
  state text not null check (state in (
    'staged', 'promotion_pending', 'promotion_failed', 'quarantined',
    'approved_private', 'redacted_derivative', 'approved_public',
    'rejected', 'expired', 'removed', 'deleted'
  )),
  purpose text not null,
  storage_class text not null check (storage_class in ('staging_private', 'durable_private')),
  storage_key text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/webp')),
  normalization_version text not null check (normalization_version = 'image-v2'),
  sha256 bytea not null check (octet_length(sha256) = 32),
  byte_length integer not null check (byte_length between 1 and 6291456),
  width integer not null check (width between 1 and 4096),
  height integer not null check (height between 1 and 4096),
  transform_manifest jsonb,
  version bigint not null default 1 check (version > 0),
  expires_at timestamptz,
  denied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, storage_key),
  unique (organization_id, id, sha256)
);

create index media_objects_state_expiry_idx on nagarik.media_objects(state, expires_at);
create index media_objects_source_idx on nagarik.media_objects(source_media_id);

create table nagarik.submissions (
  id uuid primary key,
  tracking_id uuid not null unique,
  organization_id uuid not null references nagarik.organizations(id),
  record_kind text not null check (record_kind in ('community_report', 'public_source')),
  state text not null check (state in (
    'received', 'under_review', 'changes_requested', 'revision_pending',
    'approved', 'rejected', 'withdrawn', 'expired'
  )),
  version bigint not null default 1 check (version > 0),
  current_revision_number integer not null default 1 check (current_revision_number > 0),
  assigned_to uuid references nagarik.operator_profiles(auth_subject),
  first_review_at timestamptz,
  review_deadline_at timestamptz,
  received_at timestamptz not null,
  terminal_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index submissions_moderation_queue_idx
  on nagarik.submissions(organization_id, state, received_at, id)
  where state in ('received', 'under_review', 'changes_requested', 'revision_pending');

create table nagarik.submission_revisions (
  id uuid primary key,
  submission_id uuid not null references nagarik.submissions(id),
  revision_number integer not null check (revision_number > 0),
  title text not null check (char_length(title) between 8 and 120),
  narrative text not null check (char_length(narrative) between 20 and 2000),
  category text not null check (category in (
    'road', 'waste', 'water', 'electricity_lighting', 'public_facility',
    'public_safety_hazard', 'other_public_infrastructure'
  )),
  observed_on date not null check (observed_on >= date '2000-01-01'),
  lat_e3 integer not null check (lat_e3 between -90000 and 90000),
  lng_e3 integer not null check (lng_e3 between -180000 and 180000),
  ward_id text not null,
  ward_geometry_version text not null,
  locality_label text,
  provenance_private jsonb not null,
  created_at timestamptz not null default now(),
  unique (submission_id, revision_number)
);

create table nagarik.submission_media (
  revision_id uuid not null references nagarik.submission_revisions(id),
  media_id uuid not null references nagarik.media_objects(id),
  position smallint not null default 0 check (position >= 0),
  primary key (revision_id, media_id),
  unique (revision_id, position)
);

create table nagarik.moderation_events (
  id uuid primary key,
  submission_id uuid not null references nagarik.submissions(id),
  submission_version bigint not null check (submission_version > 0),
  actor_subject uuid not null references nagarik.operator_profiles(auth_subject),
  event_type text not null check (event_type in (
    'start_review', 'request_changes', 'approve', 'reject', 'withdraw', 'expire'
  )),
  reason_code text not null,
  private_note text,
  public_safe_message text,
  created_at timestamptz not null default now()
);

create table nagarik.public_sources (
  id uuid primary key,
  organization_id uuid not null references nagarik.organizations(id),
  source_identity bytea not null check (octet_length(source_identity) = 32),
  canonical_url text not null check (canonical_url ~ '^https://'),
  current_revision integer not null default 1 check (current_revision > 0),
  created_at timestamptz not null default now(),
  unique (organization_id, source_identity)
);

create table nagarik.public_source_revisions (
  id uuid primary key,
  source_id uuid not null references nagarik.public_sources(id),
  revision_number integer not null check (revision_number > 0),
  canonical_url text not null check (canonical_url ~ '^https://'),
  publisher text not null,
  content_sha256 bytea not null check (octet_length(content_sha256) = 32),
  source_published_at timestamptz,
  content_checked_at timestamptz not null,
  status_updated_at timestamptz not null,
  next_review_at timestamptz not null,
  status text not null check (status in ('current', 'stale', 'unavailable', 'superseded')),
  restricted_fetch_evidence jsonb not null,
  created_at timestamptz not null default now(),
  unique (source_id, revision_number)
);

create table nagarik.issues (
  id uuid primary key,
  public_id uuid not null unique,
  organization_id uuid not null references nagarik.organizations(id),
  workflow_version text not null check (workflow_version in ('v2', 'v1_legacy')),
  legacy_issue_id bigint,
  record_kind text not null check (record_kind in ('community_report', 'public_source')),
  publication_state text not null check (publication_state in (
    'not_published', 'commit_pending', 'published', 'superseded', 'removed'
  )),
  lifecycle text check (lifecycle in ('open', 'in_progress', 'resolved', 'closed', 'disputed')),
  legacy_status text,
  current_version_id uuid,
  domain_version bigint not null default 1 check (domain_version > 0),
  checkpoint_update_count bigint not null default 0 check (checkpoint_update_count >= 0),
  projected_timeline_head bytea not null default decode(repeat('00', 32), 'hex')
    check (octet_length(projected_timeline_head) = 32),
  projected_handoff_head bytea not null default decode(repeat('00', 32), 'hex')
    check (octet_length(projected_handoff_head) = 32),
  confirmed_update_count bigint not null default 0 check (confirmed_update_count >= 0),
  confirmed_timeline_head bytea not null default decode(repeat('00', 32), 'hex')
    check (octet_length(confirmed_timeline_head) = 32),
  confirmed_handoff_head bytea not null default decode(repeat('00', 32), 'hex')
    check (octet_length(confirmed_handoff_head) = 32),
  blocked_from_sequence bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (workflow_version = 'v2' and legacy_issue_id is null and legacy_status is null and lifecycle is not null)
    or
    (workflow_version = 'v1_legacy' and legacy_issue_id is not null and legacy_status is not null and lifecycle is null)
  )
);

create unique index issues_legacy_id_idx on nagarik.issues(legacy_issue_id)
  where legacy_issue_id is not null;

create table nagarik.issue_versions (
  id uuid primary key,
  issue_id uuid not null references nagarik.issues(id),
  version_number integer not null check (version_number > 0),
  state text not null check (state in ('commit_pending', 'published', 'superseded', 'removed')),
  title text not null,
  narrative text not null,
  category text not null,
  ward_id text not null,
  ward_label text not null,
  locality_label text,
  public_location jsonb not null,
  public_media_id uuid references nagarik.media_objects(id),
  public_provenance jsonb not null,
  metadata_hash bytea not null check (octet_length(metadata_hash) = 32),
  evidence_hash bytea not null check (octet_length(evidence_hash) = 32),
  location_hash bytea not null check (octet_length(location_hash) = 32),
  public_reason text,
  version_created_at timestamptz not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (issue_id, version_number)
);

alter table nagarik.issues
  add constraint issues_current_version_fk
  foreign key (current_version_id) references nagarik.issue_versions(id)
  deferrable initially deferred;

create table nagarik.lifecycle_events (
  id uuid primary key,
  issue_id uuid not null references nagarik.issues(id),
  issue_version_id uuid not null references nagarik.issue_versions(id),
  workflow_version bigint not null check (workflow_version > 0),
  workflow_head bytea not null check (octet_length(workflow_head) = 32),
  from_state text not null,
  to_state text not null,
  reason_code text not null,
  public_note text,
  observed_at timestamptz,
  evidence_private jsonb not null,
  public_event jsonb not null,
  chain_sequence bigint not null check (chain_sequence between 1 and 9007199254740991),
  checkpoint_state text not null check (checkpoint_state in (
    'pending', 'blocked', 'dead_letter', 'confirmed'
  )),
  created_by uuid not null references nagarik.operator_profiles(auth_subject),
  created_at timestamptz not null default now(),
  unique (issue_id, workflow_version),
  unique (issue_id, chain_sequence)
);

create table nagarik.handoff_aggregates (
  issue_id uuid primary key references nagarik.issues(id),
  private_sequence bigint not null default 0 check (private_sequence >= 0),
  private_head bytea not null default decode(repeat('00', 32), 'hex')
    check (octet_length(private_head) = 32),
  public_sequence bigint not null default 0 check (public_sequence >= 0),
  active_cycle_id uuid,
  state text check (state in ('prepared', 'sent', 'acknowledged', 'closed', 'failed')),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

create table nagarik.handoff_events (
  id uuid primary key,
  issue_id uuid not null references nagarik.issues(id),
  cycle_id uuid not null,
  private_sequence bigint not null check (private_sequence > 0),
  public_sequence bigint,
  event_type text not null check (event_type in (
    'prepared', 'sent', 'acknowledged', 'closed', 'failed', 'action_recorded', 'correction'
  )),
  private_event jsonb not null,
  public_event jsonb,
  private_head bytea not null check (octet_length(private_head) = 32),
  chain_sequence bigint,
  checkpoint_state text,
  superseded_event_id uuid references nagarik.handoff_events(id),
  created_by uuid not null references nagarik.operator_profiles(auth_subject),
  created_at timestamptz not null default now(),
  unique (issue_id, private_sequence)
);

create unique index handoff_events_public_sequence_idx
  on nagarik.handoff_events(issue_id, public_sequence)
  where public_sequence is not null;

create table nagarik.signals (
  id uuid primary key,
  issue_id uuid not null references nagarik.issues(id),
  key_version integer not null check (key_version between 1 and 65535),
  signal_key bytea not null check (octet_length(signal_key) = 32),
  state text not null check (state in ('active', 'retracted', 'removed')),
  created_at timestamptz not null default now(),
  retracted_at timestamptz,
  unique (issue_id, key_version, signal_key)
);

create table nagarik.issue_chain_bindings (
  id uuid primary key,
  issue_id uuid not null references nagarik.issues(id),
  issue_version_id uuid references nagarik.issue_versions(id),
  protocol_version text not null check (protocol_version in ('v1_legacy', 'v2')),
  cluster text not null,
  genesis_hash text not null,
  program_id text not null,
  issue_account text not null,
  event_account text,
  event_id bytea,
  chain_sequence bigint,
  signature text not null,
  finalized_slot bigint not null check (finalized_slot >= 0),
  account_sha256 bytea not null check (octet_length(account_sha256) = 32),
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique nulls not distinct (issue_id, issue_version_id, protocol_version)
);

create table nagarik.outbox_jobs (
  id uuid primary key,
  operation_id bytea not null unique check (octet_length(operation_id) = 32),
  organization_id uuid not null references nagarik.organizations(id),
  issue_id uuid references nagarik.issues(id),
  issue_version_id uuid references nagarik.issue_versions(id),
  operation_type text not null,
  chain_sequence bigint,
  event_id bytea,
  canonical_payload jsonb not null,
  payload_hash bytea not null check (octet_length(payload_hash) = 32),
  state text not null check (state in (
    'pending', 'leased', 'submitted_unknown', 'confirming', 'confirmed', 'blocked', 'dead_letter'
  )),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  submitted_signature text,
  last_error_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index outbox_dequeue_idx on nagarik.outbox_jobs(state, available_at, created_at)
  where state in ('pending', 'submitted_unknown', 'confirming');

create table nagarik.outbox_attempts (
  id uuid primary key,
  outbox_job_id uuid not null references nagarik.outbox_jobs(id),
  attempt_number integer not null check (attempt_number > 0),
  result text not null,
  signature text,
  error_category text,
  diagnostic jsonb not null default '{}'::jsonb,
  started_at timestamptz not null,
  finished_at timestamptz,
  unique (outbox_job_id, attempt_number)
);

create table nagarik.privacy_requests (
  id uuid primary key,
  organization_id uuid not null references nagarik.organizations(id),
  target_type text not null check (target_type in ('submission', 'public_issue')),
  target_id uuid not null,
  request_type text not null check (request_type in (
    'access', 'correction', 'withdrawal', 'media_restriction', 'erasure', 'other'
  )),
  description text not null check (char_length(description) between 20 and 1000),
  state text not null check (state in (
    'received', 'capability_or_identity_checked', 'in_review', 'information_requested',
    'fulfilled', 'partially_fulfilled', 'denied', 'withdrawn'
  )),
  version bigint not null default 1 check (version > 0),
  outcome_public text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create table nagarik.access_overlays (
  id uuid primary key,
  privacy_request_id uuid not null references nagarik.privacy_requests(id),
  issue_id uuid not null references nagarik.issues(id),
  overlay_version bigint not null check (overlay_version > 0),
  state text not null check (state in ('restricted', 'cleared')),
  reason_category text not null,
  decision_event_id uuid,
  created_by uuid not null references nagarik.operator_profiles(auth_subject),
  created_at timestamptz not null default now(),
  unique (issue_id, overlay_version)
);

create table nagarik.privacy_exports (
  id uuid primary key,
  privacy_request_id uuid not null references nagarik.privacy_requests(id),
  state text not null check (state in ('pending', 'available', 'consumed', 'expired', 'revoked', 'deleted')),
  storage_key text not null,
  artifact_sha256 bytea not null check (octet_length(artifact_sha256) = 32),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table nagarik.legal_holds (
  id uuid primary key,
  organization_id uuid not null references nagarik.organizations(id),
  target_type text not null,
  target_id uuid not null,
  reason text not null,
  review_at timestamptz not null,
  state text not null check (state in ('active', 'released')),
  authorized_by uuid not null references nagarik.operator_profiles(auth_subject),
  created_at timestamptz not null default now(),
  released_at timestamptz
);

create table nagarik.audit_events (
  id uuid primary key,
  organization_id uuid references nagarik.organizations(id),
  actor_type text not null check (actor_type in ('operator', 'capability', 'service', 'system')),
  actor_key bytea not null check (octet_length(actor_key) = 32),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  request_id uuid not null,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index audit_events_org_time_idx on nagarik.audit_events(organization_id, occurred_at desc, id);

create table nagarik.recovery_ledger (
  id uuid primary key,
  organization_id uuid references nagarik.organizations(id),
  opaque_record_id uuid not null,
  action text not null,
  policy_version text not null,
  integrity_hash bytea not null check (octet_length(integrity_hash) = 32),
  occurred_at timestamptz not null default now()
);

create table nagarik.rate_limit_buckets (
  scope text not null check (char_length(scope) between 1 and 120),
  subject_key bytea not null check (octet_length(subject_key) = 32),
  window_started_at timestamptz not null,
  window_ends_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (scope, subject_key, window_started_at),
  check (window_ends_at > window_started_at)
);

create table nagarik.capability_kill_switches (
  capability text primary key check (capability in (
    'publicReadEnabled', 'publicMediaEnabled', 'inviteIntakeEnabled',
    'inviteSignalsEnabled', 'operatorMutationsEnabled', 'publicationEnabled',
    'v2WritesEnabled'
  )),
  disabled boolean not null default true,
  version bigint not null default 1 check (version > 0),
  reason text not null default 'initial_fail_closed',
  updated_by uuid references nagarik.operator_profiles(auth_subject),
  updated_at timestamptz not null default now()
);

insert into nagarik.capability_kill_switches(capability)
values
  ('publicReadEnabled'),
  ('publicMediaEnabled'),
  ('inviteIntakeEnabled'),
  ('inviteSignalsEnabled'),
  ('operatorMutationsEnabled'),
  ('publicationEnabled'),
  ('v2WritesEnabled');

create table nagarik.legacy_import_runs (
  id uuid primary key,
  source_sha256 bytea not null check (octet_length(source_sha256) = 32),
  mode text not null check (mode in ('dry_run', 'commit')),
  state text not null check (state in ('running', 'completed', 'failed')),
  counts jsonb not null default '{}'::jsonb,
  checksum_report jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (source_sha256, mode)
);

create table public.issue_projection (
  public_id uuid primary key,
  workflow_version text not null check (workflow_version in ('v2', 'v1_legacy')),
  version_id uuid,
  publication_state text not null check (publication_state in ('published', 'superseded', 'removed')),
  title text,
  summary text,
  narrative text,
  category text,
  ward jsonb,
  location jsonb,
  media_id uuid,
  provenance jsonb,
  lifecycle text,
  legacy_status text,
  signal_count bigint not null default 0 check (signal_count >= 0),
  legacy_signal_count bigint check (legacy_signal_count >= 0),
  tombstone jsonb,
  published_at timestamptz,
  updated_at timestamptz not null,
  check (
    (publication_state = 'removed' and tombstone is not null and title is null and narrative is null and location is null and media_id is null)
    or
    (publication_state <> 'removed' and tombstone is null and title is not null and narrative is not null)
  )
);

create index issue_projection_list_idx
  on public.issue_projection(published_at desc, public_id)
  where publication_state = 'published';

create table public.media_projection (
  media_id uuid primary key,
  issue_public_id uuid not null references public.issue_projection(public_id),
  version_id uuid not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/webp')),
  sha256 bytea not null check (octet_length(sha256) = 32),
  byte_length integer not null check (byte_length > 0),
  width integer not null check (width between 1 and 1600),
  height integer not null check (height between 1 and 1600),
  state text not null check (state in ('eligible', 'removed')),
  updated_at timestamptz not null
);

create table public.event_projection (
  event_id uuid primary key,
  issue_public_id uuid not null references public.issue_projection(public_id),
  event_type text not null,
  chain_sequence bigint,
  public_event jsonb not null,
  occurred_at timestamptz not null
);

create index event_projection_issue_time_idx
  on public.event_projection(issue_public_id, occurred_at, event_id);

create unique index event_projection_chain_sequence_idx
  on public.event_projection(issue_public_id, chain_sequence)
  where chain_sequence is not null;

create or replace function nagarik.reject_row_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'append_only_row' using errcode = '55000';
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'submission_revisions', 'moderation_events', 'public_source_revisions',
    'lifecycle_events', 'handoff_events', 'issue_chain_bindings',
    'outbox_attempts', 'audit_events', 'recovery_ledger'
  ]
  loop
    execute format(
      'create trigger %I before update or delete on nagarik.%I for each row execute function nagarik.reject_row_mutation()',
      table_name || '_append_only', table_name
    );
  end loop;
end
$$;

commit;

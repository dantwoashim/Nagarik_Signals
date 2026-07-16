create extension if not exists pgcrypto;

create table if not exists issues (
  id bigserial primary key,
  issue_id bigint unique not null,
  issue_pda text unique not null,
  reporter_pubkey text not null,
  reporter_mode text not null check (reporter_mode in ('session', 'wallet')),
  record_kind text not null default 'community_report'
    check (record_kind in ('community_report', 'public_source', 'illustrative_sample', 'qa_fixture')),
  provenance jsonb,
  title text not null,
  description text not null,
  category text not null,
  ward_id text not null,
  locality text not null,
  lat_display numeric,
  lng_display numeric,
  geohash text,
  first_observed_at timestamptz not null,
  proof_anchored_at timestamptz,
  status text not null default 'submitted',
  verification_count integer not null default 0,
  update_count integer not null default 0,
  evidence_hash text not null,
  metadata_hash text not null,
  location_hash text not null,
  timeline_hash text not null,
  photo_url text not null,
  resolution_hash text,
  resolution_photo_url text,
  create_tx_sig text,
  latest_tx_sig text,
  safety_review_status text not null default 'visible'
    check (safety_review_status in ('visible', 'hidden_media', 'disputed', 'rejected', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists verifications (
  id bigserial primary key,
  issue_id bigint not null references issues(issue_id),
  verifier_pubkey text not null,
  verifier_mode text not null check (verifier_mode in ('session', 'wallet')),
  verification_pda text unique not null,
  tx_sig text not null,
  created_at timestamptz not null default now(),
  unique(issue_id, verifier_pubkey)
);

create table if not exists status_updates (
  id bigserial primary key,
  issue_id bigint not null references issues(issue_id),
  seq integer not null,
  updater_pubkey text not null,
  old_status text not null,
  new_status text not null,
  proof_hash text not null,
  previous_timeline_hash text,
  new_timeline_hash text,
  status_update_pda text unique not null,
  tx_sig text not null,
  note text,
  proof_photo_url text,
  created_at timestamptz not null default now(),
  unique(issue_id, seq)
);

create table if not exists authority_handoffs (
  id uuid primary key default gen_random_uuid(),
  version text not null default '1.0' check (version = '1.0'),
  idempotency_key uuid unique not null,
  issue_id bigint not null references issues(issue_id),
  seq integer not null check (seq > 0),
  state text not null check (state in ('prepared', 'submitted', 'acknowledged', 'follow_up', 'closed')),
  authority_name text not null,
  channel_name text not null,
  channel_url text check (channel_url is null or channel_url ~ '^https://'),
  external_reference text,
  note text not null default '',
  occurred_at timestamptz not null,
  follow_up_due_at timestamptz,
  receipt_photo_url text,
  receipt_evidence_hash text check (receipt_evidence_hash is null or receipt_evidence_hash ~ '^[0-9a-f]{64}$'),
  receipt_privacy_reviewed boolean not null default false,
  evidence_basis text not null check (evidence_basis in ('route_only', 'external_reference', 'redacted_receipt')),
  recorded_by text not null default 'platform_steward' check (recorded_by = 'platform_steward'),
  previous_event_hash text check (previous_event_hash is null or previous_event_hash ~ '^[0-9a-f]{64}$'),
  event_hash text unique not null check (event_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  check (
    (receipt_photo_url is null and receipt_evidence_hash is null and receipt_privacy_reviewed = false)
    or (receipt_photo_url is not null and receipt_evidence_hash is not null and receipt_privacy_reviewed = true)
  ),
  check (state <> 'prepared' or (external_reference is null and receipt_photo_url is null)),
  check (state <> 'submitted' or (external_reference is not null or receipt_photo_url is not null)),
  check (state <> 'acknowledged' or receipt_photo_url is not null),
  check (state not in ('submitted', 'follow_up') or follow_up_due_at is not null),
  check (state <> 'closed' or follow_up_due_at is null),
  unique(issue_id, seq)
);

create index if not exists authority_handoffs_issue_created_idx
  on authority_handoffs(issue_id, created_at desc);

create index if not exists authority_handoffs_follow_up_idx
  on authority_handoffs(follow_up_due_at)
  where state <> 'closed' and follow_up_due_at is not null;

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  session_pubkey text unique not null,
  session_hash text not null,
  display_name text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists stewards (
  id bigserial primary key,
  wallet_pubkey text unique not null,
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists request_events (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  identifier_hash text not null,
  outcome text not null check (outcome in ('allowed', 'blocked', 'success', 'failure')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists rate_limit_buckets (
  scope text not null,
  identifier_hash text not null,
  capacity integer not null check (capacity > 0),
  window_ms bigint not null check (window_ms > 0),
  tokens double precision not null check (tokens >= 0),
  last_refill_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (scope, identifier_hash)
);

create index if not exists issues_visible_status_idx on issues (safety_review_status, status);
create index if not exists issues_ward_status_idx on issues (ward_id, status);
create index if not exists issues_category_status_idx on issues (category, status);
create index if not exists issues_first_observed_idx on issues (first_observed_at desc);
create index if not exists issues_record_kind_review_idx on issues (record_kind, safety_review_status);
create index if not exists verifications_issue_created_idx on verifications (issue_id, created_at desc);
create index if not exists status_updates_issue_seq_idx on status_updates (issue_id, seq);
create index if not exists request_events_scope_created_idx on request_events (scope, created_at desc);
create index if not exists request_events_identifier_created_idx on request_events (identifier_hash, created_at desc);
create index if not exists rate_limit_buckets_updated_idx on rate_limit_buckets (updated_at);

create or replace view dashboard_issue_stats as
select
  count(*) as total_issues,
  count(*) filter (where status not in ('resolved', 'rejected')) as unresolved_issues,
  count(*) filter (where status = 'resolved') as resolved_issues,
  count(*) filter (where status = 'verified') as verified_issues,
  avg(extract(epoch from (coalesce(proof_anchored_at, now()) - first_observed_at)) / 86400)
    filter (where status not in ('resolved', 'rejected')) as avg_days_observed_unresolved
from issues
where safety_review_status <> 'rejected'
  and record_kind in ('community_report', 'public_source');

-- Ward leaderboard query used by /api/dashboard.
-- select
--   ward_id,
--   locality,
--   count(*) filter (where status not in ('resolved', 'rejected')) as unresolved_count,
--   count(*) as total_count,
--   avg(extract(epoch from (now() - first_observed_at)) / 86400)
--     filter (where status not in ('resolved', 'rejected')) as avg_days_ignored
-- from issues
-- where safety_review_status <> 'rejected'
--   and record_kind in ('community_report', 'public_source')
-- group by ward_id, locality
-- order by avg_days_ignored desc, unresolved_count desc
-- limit 10;

begin;

alter table nagarik.privacy_requests
  add column tracking_capability_id uuid references nagarik.capabilities(id);

create unique index privacy_requests_tracking_capability_idx
  on nagarik.privacy_requests(tracking_capability_id)
  where tracking_capability_id is not null;

create index privacy_requests_queue_idx
  on nagarik.privacy_requests(organization_id, state, updated_at, id)
  where state in (
    'received', 'capability_or_identity_checked', 'in_review', 'information_requested'
  );

create table nagarik.privacy_request_events (
  id uuid primary key,
  privacy_request_id uuid not null references nagarik.privacy_requests(id),
  organization_id uuid not null references nagarik.organizations(id),
  sequence bigint not null check (sequence > 0),
  event_type text not null check (event_type in (
    'received', 'capability_or_identity_checked', 'review_started',
    'information_requested', 'review_resumed', 'fulfilled',
    'partially_fulfilled', 'denied', 'withdrawn', 'export_created'
  )),
  from_state text,
  to_state text not null,
  actor_type text not null check (actor_type in ('capability', 'operator', 'service')),
  actor_key bytea not null check (octet_length(actor_key) = 32),
  private_detail jsonb not null default '{}'::jsonb,
  public_outcome text,
  created_at timestamptz not null default now(),
  unique (privacy_request_id, sequence)
);

create index privacy_request_events_request_idx
  on nagarik.privacy_request_events(privacy_request_id, sequence);

create or replace function nagarik.guard_privacy_request_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, nagarik
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'privacy_request_event_append_only' using errcode = '55000';
  end if;
  if not exists (
    select 1
    from nagarik.privacy_requests request
    where request.id = new.privacy_request_id
      and request.organization_id = new.organization_id
  ) then
    raise exception 'privacy_request_event_organization_mismatch' using errcode = '23514';
  end if;
  return new;
end
$$;

revoke all on function nagarik.guard_privacy_request_event() from public;

create trigger privacy_request_events_append_only
before insert or update or delete on nagarik.privacy_request_events
for each row execute function nagarik.guard_privacy_request_event();

alter table nagarik.privacy_request_events enable row level security;
alter table nagarik.privacy_request_events force row level security;
revoke all on nagarik.privacy_request_events from anon, authenticated;
grant all on nagarik.privacy_request_events to service_role;
grant select on nagarik.privacy_request_events to authenticated;

create policy privacy_request_events_reviewer_read
on nagarik.privacy_request_events
for select
to authenticated
using (
  nagarik.has_active_role(
    organization_id,
    array['privacy_reviewer', 'auditor', 'org_admin', 'system_admin']
  )
);

commit;

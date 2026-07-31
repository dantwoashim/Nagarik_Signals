begin;

create or replace function nagarik.current_auth_subject()
returns uuid
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select auth.uid()
$$;

create or replace function nagarik.has_active_role(
  requested_organization_id uuid,
  requested_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, nagarik
as $$
  select exists (
    select 1
    from nagarik.role_grants grant_row
    join nagarik.operator_profiles profile
      on profile.auth_subject = grant_row.auth_subject
    where grant_row.auth_subject = auth.uid()
      and grant_row.state = 'active'
      and profile.disabled_at is null
      and grant_row.role = any(requested_roles)
      and (
        grant_row.organization_id = requested_organization_id
        or (
          grant_row.organization_id is null
          and grant_row.role = 'system_admin'
        )
      )
  )
$$;

create or replace function nagarik.is_active_member(
  requested_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, nagarik
as $$
  select exists (
    select 1
    from nagarik.organization_memberships membership
    join nagarik.operator_profiles profile
      on profile.auth_subject = membership.auth_subject
    where membership.organization_id = requested_organization_id
      and membership.auth_subject = auth.uid()
      and membership.state = 'active'
      and profile.disabled_at is null
  )
$$;

create or replace function nagarik.is_capability_enabled(
  requested_capability text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, nagarik
as $$
  select coalesce(
    (
      select switch.disabled = false
      from nagarik.capability_kill_switches switch
      where switch.capability = requested_capability
    ),
    false
  )
$$;

revoke all on function nagarik.current_auth_subject() from public;
revoke all on function nagarik.has_active_role(uuid, text[]) from public;
revoke all on function nagarik.is_active_member(uuid) from public;
revoke all on function nagarik.is_capability_enabled(text) from public;
grant usage on schema nagarik to authenticated, service_role;
grant execute on function nagarik.current_auth_subject() to authenticated, service_role;
grant execute on function nagarik.has_active_role(uuid, text[]) to authenticated, service_role;
grant execute on function nagarik.is_active_member(uuid) to authenticated, service_role;
grant execute on function nagarik.is_capability_enabled(text) to anon, authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations',
    'operator_profiles',
    'organization_memberships',
    'role_grants',
    'pilot_policies',
    'evidence_type_policies',
    'capabilities',
    'idempotency_records',
    'media_objects',
    'submissions',
    'submission_revisions',
    'submission_media',
    'moderation_events',
    'public_sources',
    'public_source_revisions',
    'issues',
    'issue_versions',
    'lifecycle_events',
    'handoff_aggregates',
    'handoff_events',
    'signals',
    'issue_chain_bindings',
    'outbox_jobs',
    'outbox_attempts',
    'privacy_requests',
    'access_overlays',
    'privacy_exports',
    'legal_holds',
    'audit_events',
    'recovery_ledger',
    'rate_limit_buckets',
    'capability_kill_switches',
    'legacy_import_runs'
  ]
  loop
    execute format('alter table nagarik.%I enable row level security', table_name);
    execute format('alter table nagarik.%I force row level security', table_name);
    execute format('revoke all on nagarik.%I from anon, authenticated', table_name);
    execute format('grant all on nagarik.%I to service_role', table_name);
  end loop;
end
$$;

alter table public.issue_projection enable row level security;
alter table public.issue_projection force row level security;
alter table public.media_projection enable row level security;
alter table public.media_projection force row level security;
alter table public.event_projection enable row level security;
alter table public.event_projection force row level security;

revoke all on public.issue_projection from anon, authenticated;
revoke all on public.media_projection from anon, authenticated;
revoke all on public.event_projection from anon, authenticated;
grant select on public.issue_projection to anon, authenticated;
grant select on public.media_projection to anon, authenticated;
grant select on public.event_projection to anon, authenticated;
grant all on public.issue_projection to service_role;
grant all on public.media_projection to service_role;
grant all on public.event_projection to service_role;

create policy public_issue_projection_read
on public.issue_projection
for select
to anon, authenticated
using (
  nagarik.is_capability_enabled('publicReadEnabled')
);

create policy public_media_projection_read
on public.media_projection
for select
to anon, authenticated
using (
  state = 'eligible'
  and nagarik.is_capability_enabled('publicReadEnabled')
  and nagarik.is_capability_enabled('publicMediaEnabled')
);

create policy public_event_projection_read
on public.event_projection
for select
to anon, authenticated
using (
  nagarik.is_capability_enabled('publicReadEnabled')
);

grant select on
  nagarik.organizations,
  nagarik.operator_profiles,
  nagarik.organization_memberships,
  nagarik.role_grants,
  nagarik.pilot_policies,
  nagarik.evidence_type_policies,
  nagarik.media_objects,
  nagarik.submissions,
  nagarik.submission_revisions,
  nagarik.submission_media,
  nagarik.moderation_events,
  nagarik.public_sources,
  nagarik.public_source_revisions,
  nagarik.issues,
  nagarik.issue_versions,
  nagarik.lifecycle_events,
  nagarik.handoff_aggregates,
  nagarik.handoff_events,
  nagarik.issue_chain_bindings,
  nagarik.privacy_requests,
  nagarik.access_overlays,
  nagarik.privacy_exports,
  nagarik.legal_holds,
  nagarik.audit_events,
  nagarik.capability_kill_switches
to authenticated;

create policy organizations_member_read
on nagarik.organizations
for select
to authenticated
using (
  nagarik.is_active_member(id)
  or nagarik.has_active_role(id, array['auditor', 'org_admin', 'system_admin'])
);

create policy operator_profiles_self_read
on nagarik.operator_profiles
for select
to authenticated
using (
  auth_subject = auth.uid()
  or nagarik.has_active_role(null, array['system_admin'])
  or exists (
    select 1
    from nagarik.organization_memberships subject_membership
    join nagarik.organization_memberships viewer_membership
      on viewer_membership.organization_id = subject_membership.organization_id
    where subject_membership.auth_subject = operator_profiles.auth_subject
      and subject_membership.state = 'active'
      and viewer_membership.auth_subject = auth.uid()
      and viewer_membership.state = 'active'
      and nagarik.has_active_role(
        subject_membership.organization_id,
        array['auditor', 'org_admin', 'system_admin']
      )
  )
);

create policy memberships_scoped_read
on nagarik.organization_memberships
for select
to authenticated
using (
  auth_subject = auth.uid()
  or nagarik.has_active_role(
    organization_id,
    array['auditor', 'org_admin', 'system_admin']
  )
);

create policy role_grants_scoped_read
on nagarik.role_grants
for select
to authenticated
using (
  auth_subject = auth.uid()
  or nagarik.has_active_role(
    organization_id,
    array['auditor', 'org_admin', 'system_admin']
  )
);

create policy pilot_policies_member_read
on nagarik.pilot_policies
for select
to authenticated
using (
  nagarik.is_active_member(organization_id)
  or nagarik.has_active_role(organization_id, array['system_admin'])
);

create policy evidence_type_policies_member_read
on nagarik.evidence_type_policies
for select
to authenticated
using (
  nagarik.is_active_member(organization_id)
  or nagarik.has_active_role(organization_id, array['system_admin'])
);

create policy media_objects_operator_read
on nagarik.media_objects
for select
to authenticated
using (
  nagarik.has_active_role(
    organization_id,
    array['moderator', 'privacy_reviewer', 'auditor', 'org_admin', 'system_admin']
  )
);

create policy submissions_operator_read
on nagarik.submissions
for select
to authenticated
using (
  nagarik.has_active_role(
    organization_id,
    array['moderator', 'privacy_reviewer', 'auditor', 'org_admin', 'system_admin']
  )
);

create policy submission_revisions_operator_read
on nagarik.submission_revisions
for select
to authenticated
using (
  exists (
    select 1
    from nagarik.submissions submission
    where submission.id = submission_revisions.submission_id
      and nagarik.has_active_role(
        submission.organization_id,
        array['moderator', 'privacy_reviewer', 'auditor', 'org_admin', 'system_admin']
      )
  )
);

create policy submission_media_operator_read
on nagarik.submission_media
for select
to authenticated
using (
  exists (
    select 1
    from nagarik.submission_revisions revision
    join nagarik.submissions submission on submission.id = revision.submission_id
    where revision.id = submission_media.revision_id
      and nagarik.has_active_role(
        submission.organization_id,
        array['moderator', 'privacy_reviewer', 'auditor', 'org_admin', 'system_admin']
      )
  )
);

create policy moderation_events_operator_read
on nagarik.moderation_events
for select
to authenticated
using (
  exists (
    select 1
    from nagarik.submissions submission
    where submission.id = moderation_events.submission_id
      and nagarik.has_active_role(
        submission.organization_id,
        array['moderator', 'privacy_reviewer', 'auditor', 'org_admin', 'system_admin']
      )
  )
);

create policy public_sources_operator_read
on nagarik.public_sources
for select
to authenticated
using (
  nagarik.has_active_role(
    organization_id,
    array['moderator', 'steward', 'auditor', 'org_admin', 'system_admin']
  )
);

create policy public_source_revisions_operator_read
on nagarik.public_source_revisions
for select
to authenticated
using (
  exists (
    select 1
    from nagarik.public_sources source
    where source.id = public_source_revisions.source_id
      and nagarik.has_active_role(
        source.organization_id,
        array['moderator', 'steward', 'auditor', 'org_admin', 'system_admin']
      )
  )
);

create policy issues_operator_read
on nagarik.issues
for select
to authenticated
using (
  nagarik.has_active_role(
    organization_id,
    array['moderator', 'steward', 'privacy_reviewer', 'auditor', 'org_admin', 'system_admin']
  )
);

create policy issue_versions_operator_read
on nagarik.issue_versions
for select
to authenticated
using (
  exists (
    select 1
    from nagarik.issues issue
    where issue.id = issue_versions.issue_id
      and nagarik.has_active_role(
        issue.organization_id,
        array['moderator', 'steward', 'privacy_reviewer', 'auditor', 'org_admin', 'system_admin']
      )
  )
);

create policy lifecycle_events_operator_read
on nagarik.lifecycle_events
for select
to authenticated
using (
  exists (
    select 1
    from nagarik.issues issue
    where issue.id = lifecycle_events.issue_id
      and nagarik.has_active_role(
        issue.organization_id,
        array['moderator', 'steward', 'privacy_reviewer', 'auditor', 'org_admin', 'system_admin']
      )
  )
);

create policy handoff_aggregates_operator_read
on nagarik.handoff_aggregates
for select
to authenticated
using (
  exists (
    select 1
    from nagarik.issues issue
    where issue.id = handoff_aggregates.issue_id
      and nagarik.has_active_role(
        issue.organization_id,
        array['steward', 'privacy_reviewer', 'auditor', 'org_admin', 'system_admin']
      )
  )
);

create policy handoff_events_operator_read
on nagarik.handoff_events
for select
to authenticated
using (
  exists (
    select 1
    from nagarik.issues issue
    where issue.id = handoff_events.issue_id
      and nagarik.has_active_role(
        issue.organization_id,
        array['steward', 'privacy_reviewer', 'auditor', 'org_admin', 'system_admin']
      )
  )
);

create policy chain_bindings_operator_read
on nagarik.issue_chain_bindings
for select
to authenticated
using (
  exists (
    select 1
    from nagarik.issues issue
    where issue.id = issue_chain_bindings.issue_id
      and nagarik.has_active_role(
        issue.organization_id,
        array['moderator', 'steward', 'auditor', 'org_admin', 'system_admin']
      )
  )
);

create policy privacy_requests_reviewer_read
on nagarik.privacy_requests
for select
to authenticated
using (
  nagarik.has_active_role(
    organization_id,
    array['privacy_reviewer', 'auditor', 'org_admin', 'system_admin']
  )
);

create policy access_overlays_reviewer_read
on nagarik.access_overlays
for select
to authenticated
using (
  exists (
    select 1
    from nagarik.privacy_requests request
    where request.id = access_overlays.privacy_request_id
      and nagarik.has_active_role(
        request.organization_id,
        array['privacy_reviewer', 'auditor', 'org_admin', 'system_admin']
      )
  )
);

create policy privacy_exports_reviewer_read
on nagarik.privacy_exports
for select
to authenticated
using (
  exists (
    select 1
    from nagarik.privacy_requests request
    where request.id = privacy_exports.privacy_request_id
      and nagarik.has_active_role(
        request.organization_id,
        array['privacy_reviewer', 'auditor', 'org_admin', 'system_admin']
      )
  )
);

create policy legal_holds_reviewer_read
on nagarik.legal_holds
for select
to authenticated
using (
  nagarik.has_active_role(
    organization_id,
    array['privacy_reviewer', 'auditor', 'org_admin', 'system_admin']
  )
);

create policy audit_events_auditor_read
on nagarik.audit_events
for select
to authenticated
using (
  nagarik.has_active_role(
    organization_id,
    array['auditor', 'system_admin']
  )
);

create policy capability_switches_admin_read
on nagarik.capability_kill_switches
for select
to authenticated
using (nagarik.has_active_role(null, array['system_admin']));

create or replace function nagarik.reserve_idempotency(
  requested_id uuid,
  requested_organization_id uuid,
  requested_scope text,
  requested_actor_key bytea,
  requested_idempotency_key uuid,
  requested_hash bytea,
  requested_expires_at timestamptz
)
returns table (
  disposition text,
  record_id uuid,
  record_state text,
  response_status integer,
  response_body jsonb,
  resource_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, nagarik
as $$
declare
  existing nagarik.idempotency_records%rowtype;
begin
  if octet_length(requested_actor_key) <> 32
    or octet_length(requested_hash) <> 32
    or requested_expires_at <= now()
  then
    raise exception 'invalid_idempotency_reservation' using errcode = '22023';
  end if;

  select *
  into existing
  from nagarik.idempotency_records record
  where record.scope = requested_scope
    and record.actor_key = requested_actor_key
    and record.idempotency_key = requested_idempotency_key
  for update;

  if not found then
    insert into nagarik.idempotency_records (
      id,
      organization_id,
      scope,
      actor_key,
      idempotency_key,
      request_hash,
      state,
      expires_at
    )
    values (
      requested_id,
      requested_organization_id,
      requested_scope,
      requested_actor_key,
      requested_idempotency_key,
      requested_hash,
      'reserved',
      requested_expires_at
    );

    return query
      select 'reserved'::text, requested_id, 'reserved'::text, null::integer, null::jsonb, null::uuid;
    return;
  end if;

  if existing.request_hash <> requested_hash then
    return query
      select 'conflict'::text, existing.id, existing.state, null::integer, null::jsonb, null::uuid;
    return;
  end if;

  if existing.state = 'completed' then
    return query
      select
        'replay'::text,
        existing.id,
        existing.state,
        existing.response_status,
        existing.response_body,
        existing.resource_id;
    return;
  end if;

  if existing.state = 'reserved' and existing.expires_at > now() then
    return query
      select 'in_progress'::text, existing.id, existing.state, null::integer, null::jsonb, null::uuid;
    return;
  end if;

  update nagarik.idempotency_records
  set
    request_hash = requested_hash,
    state = 'reserved',
    response_status = null,
    response_body = null,
    resource_id = null,
    expires_at = requested_expires_at,
    completed_at = null
  where id = existing.id;

  return query
    select 'reserved'::text, existing.id, 'reserved'::text, null::integer, null::jsonb, null::uuid;
end
$$;

create or replace function nagarik.complete_idempotency(
  requested_record_id uuid,
  requested_hash bytea,
  requested_response_status integer,
  requested_response_body jsonb,
  requested_resource_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, nagarik
as $$
begin
  update nagarik.idempotency_records
  set
    state = 'completed',
    response_status = requested_response_status,
    response_body = requested_response_body,
    resource_id = requested_resource_id,
    completed_at = now()
  where id = requested_record_id
    and request_hash = requested_hash
    and state = 'reserved';

  if not found then
    raise exception 'idempotency_completion_conflict' using errcode = '40001';
  end if;
end
$$;

create or replace function nagarik.consume_capability(
  requested_capability_id uuid,
  requested_organization_id uuid,
  requested_purpose smallint,
  requested_verifier bytea
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, nagarik
as $$
declare
  consumed_id uuid;
begin
  update nagarik.capabilities
  set state = 'consumed', consumed_at = now()
  where id = requested_capability_id
    and organization_id = requested_organization_id
    and purpose = requested_purpose
    and verifier = requested_verifier
    and state = 'active'
    and expires_at > now()
  returning id into consumed_id;

  if consumed_id is null then
    raise exception 'capability_unavailable' using errcode = 'P0002';
  end if;

  return consumed_id;
end
$$;

create or replace function nagarik.claim_outbox_jobs(
  requested_lease_owner text,
  requested_limit integer default 25,
  requested_lease_seconds integer default 60
)
returns setof nagarik.outbox_jobs
language plpgsql
security definer
set search_path = pg_catalog, public, nagarik
as $$
begin
  if char_length(requested_lease_owner) not between 1 and 120
    or requested_limit not between 1 and 100
    or requested_lease_seconds not between 5 and 600
  then
    raise exception 'invalid_outbox_lease' using errcode = '22023';
  end if;

  return query
  with eligible as (
    select job.id
    from nagarik.outbox_jobs job
    where (
      (
        job.state in ('pending', 'submitted_unknown', 'confirming')
        and job.available_at <= now()
      )
      or (
        job.state = 'leased'
        and job.lease_expires_at <= now()
      )
    )
      and not exists (
        select 1
        from nagarik.outbox_jobs predecessor
        where predecessor.issue_id = job.issue_id
          and predecessor.id <> job.id
          and predecessor.state <> 'confirmed'
          and (
            predecessor.created_at < job.created_at
            or (
              predecessor.created_at = job.created_at
              and predecessor.id < job.id
            )
          )
      )
    order by job.created_at, job.id
    for update of job skip locked
    limit requested_limit
  )
  update nagarik.outbox_jobs job
  set
    state = 'leased',
    lease_owner = requested_lease_owner,
    lease_expires_at = now() + make_interval(secs => requested_lease_seconds),
    attempt_count = job.attempt_count + 1,
    updated_at = now()
  from eligible
  where job.id = eligible.id
  returning job.*;
end
$$;

create or replace function nagarik.guard_last_admin()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, nagarik
as $$
declare
  remaining_count integer;
begin
  if old.state <> 'active' or old.role not in ('org_admin', 'system_admin') then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.state = 'active'
    and new.role = old.role
    and new.organization_id is not distinct from old.organization_id
  then
    return new;
  end if;

  select count(*)
  into remaining_count
  from nagarik.role_grants grant_row
  where grant_row.id <> old.id
    and grant_row.state = 'active'
    and grant_row.role = old.role
    and grant_row.organization_id is not distinct from old.organization_id;

  if remaining_count = 0 then
    raise exception 'last_admin_removal_forbidden' using errcode = '23000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create trigger role_grants_guard_last_admin
before update or delete on nagarik.role_grants
for each row execute function nagarik.guard_last_admin();

revoke all on function nagarik.reserve_idempotency(
  uuid, uuid, text, bytea, uuid, bytea, timestamptz
) from public, anon, authenticated;
revoke all on function nagarik.complete_idempotency(
  uuid, bytea, integer, jsonb, uuid
) from public, anon, authenticated;
revoke all on function nagarik.consume_capability(
  uuid, uuid, smallint, bytea
) from public, anon, authenticated;
revoke all on function nagarik.claim_outbox_jobs(
  text, integer, integer
) from public, anon, authenticated;

grant execute on function nagarik.reserve_idempotency(
  uuid, uuid, text, bytea, uuid, bytea, timestamptz
) to service_role;
grant execute on function nagarik.complete_idempotency(
  uuid, bytea, integer, jsonb, uuid
) to service_role;
grant execute on function nagarik.consume_capability(
  uuid, uuid, smallint, bytea
) to service_role;
grant execute on function nagarik.claim_outbox_jobs(
  text, integer, integer
) to service_role;

commit;

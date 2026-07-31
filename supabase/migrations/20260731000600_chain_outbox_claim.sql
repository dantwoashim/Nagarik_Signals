begin;

do $$
declare
  legacy_unique_name text;
begin
  select constraint_row.conname
  into legacy_unique_name
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'nagarik.issue_chain_bindings'::regclass
    and constraint_row.contype = 'u'
  limit 1;

  if legacy_unique_name is not null then
    execute format(
      'alter table nagarik.issue_chain_bindings drop constraint %I',
      legacy_unique_name
    );
  end if;
end
$$;

create unique index issue_chain_bindings_v2_event_idx
  on nagarik.issue_chain_bindings(protocol_version, event_id)
  where protocol_version = 'v2' and event_id is not null;

create unique index issue_chain_bindings_v1_version_idx
  on nagarik.issue_chain_bindings(
    issue_id,
    issue_version_id,
    protocol_version
  )
  nulls not distinct
  where protocol_version = 'v1_legacy' and event_id is null;

alter table nagarik.issue_chain_bindings
  add constraint issue_chain_bindings_v2_event_length
  check (
    protocol_version <> 'v2'
    or (event_id is not null and octet_length(event_id) = 32)
  );

create or replace function nagarik.claim_chain_outbox_jobs(
  requested_lease_owner text,
  requested_limit integer default 10,
  requested_lease_seconds integer default 60
)
returns setof nagarik.outbox_jobs
language plpgsql
security definer
set search_path = pg_catalog, public, nagarik
as $$
begin
  if char_length(requested_lease_owner) not between 1 and 120
    or requested_limit not between 1 and 25
    or requested_lease_seconds not between 15 and 300
  then
    raise exception 'invalid_chain_outbox_lease' using errcode = '22023';
  end if;

  return query
  with eligible as (
    select job.id
    from nagarik.outbox_jobs job
    where job.operation_type in (
      'issue_created',
      'metadata_version_committed',
      'lifecycle_changed',
      'handoff_checkpointed',
      'publication_removed'
    )
      and job.issue_id is not null
      and job.chain_sequence is not null
      and job.event_id is not null
      and (
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
          and predecessor.chain_sequence < job.chain_sequence
          and predecessor.state <> 'confirmed'
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

revoke all on function nagarik.claim_chain_outbox_jobs(
  text, integer, integer
) from public, anon, authenticated;

grant execute on function nagarik.claim_chain_outbox_jobs(
  text, integer, integer
) to service_role;

commit;

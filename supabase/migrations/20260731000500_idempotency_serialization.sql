begin;

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

  perform pg_advisory_xact_lock(
    hashtextextended(
      requested_scope || ':' ||
      encode(requested_actor_key, 'hex') || ':' ||
      requested_idempotency_key::text,
      0
    )
  );

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

commit;

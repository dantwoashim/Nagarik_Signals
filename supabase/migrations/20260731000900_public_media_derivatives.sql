begin;

alter table nagarik.media_objects
  add constraint media_objects_derivative_source_required
  check (
    state not in ('redacted_derivative', 'approved_public', 'removed')
    or source_media_id is not null
  ),
  add constraint media_objects_derivative_purpose
  check (
    source_media_id is null
    or (source_media_id <> id and purpose = 'public_derivative')
  );

create or replace function nagarik.enforce_media_source_organization()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, nagarik
as $$
declare
  source_organization uuid;
begin
  if new.source_media_id is null then
    return new;
  end if;

  select media.organization_id
    into source_organization
  from nagarik.media_objects media
  where media.id = new.source_media_id;

  if source_organization is null or source_organization <> new.organization_id then
    raise exception 'media_source_organization_mismatch' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger media_objects_source_organization_guard
before insert or update of source_media_id, organization_id
on nagarik.media_objects
for each row execute function nagarik.enforce_media_source_organization();

commit;

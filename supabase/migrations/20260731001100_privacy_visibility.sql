create or replace function nagarik.is_issue_access_restricted(
  requested_public_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, nagarik
as $$
  select coalesce((
    select overlay.state = 'restricted'
    from nagarik.issues issue
    join nagarik.access_overlays overlay on overlay.issue_id = issue.id
    where issue.public_id = requested_public_id
    order by overlay.overlay_version desc
    limit 1
  ), false)
$$;

revoke all on function nagarik.is_issue_access_restricted(uuid) from public;
grant execute on function nagarik.is_issue_access_restricted(uuid) to service_role;

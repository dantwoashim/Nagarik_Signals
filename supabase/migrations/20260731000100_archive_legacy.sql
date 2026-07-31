begin;

create schema if not exists legacy_v1;
revoke all on schema legacy_v1 from public;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'issues',
    'verifications',
    'status_updates',
    'authority_handoffs',
    'sessions',
    'stewards',
    'request_events',
    'rate_limit_buckets'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I set schema legacy_v1', table_name);
    end if;
  end loop;
end
$$;

drop view if exists public.dashboard_issue_stats;

commit;

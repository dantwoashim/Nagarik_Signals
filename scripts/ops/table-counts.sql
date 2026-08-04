create or replace function pg_temp.nagarik_table_counts()
returns table(relation_name text, row_count bigint)
language plpgsql
as $$
declare
  item record;
begin
  for item in
    select schemaname, tablename
    from pg_tables
    where schemaname in ('legacy_v1', 'nagarik', 'public')
    order by schemaname, tablename
  loop
    relation_name := format('%I.%I', item.schemaname, item.tablename);
    execute format('select count(*) from %I.%I', item.schemaname, item.tablename)
      into row_count;
    return next;
  end loop;
end;
$$;

select relation_name || E'\t' || row_count::text
from pg_temp.nagarik_table_counts()
order by relation_name;

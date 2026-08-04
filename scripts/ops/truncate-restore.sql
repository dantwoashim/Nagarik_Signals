do $$
declare
  item record;
begin
  for item in
    select schemaname, tablename
    from pg_tables
    where schemaname in ('legacy_v1', 'nagarik', 'public')
    order by schemaname, tablename
  loop
    execute format(
      'truncate table %I.%I restart identity cascade',
      item.schemaname,
      item.tablename
    );
  end loop;
end;
$$;

-- Executable Phase 9G-C mobile counter payload and authorization assertions.

create schema phase9gc_test;

create function phase9gc_test.assert_true(result boolean, label text)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if result is not true then raise exception 'FAIL %', label; end if;
  raise notice 'PASS %', label;
end;
$$;

create function phase9gc_test.assert_sqlstate(statement text, expected_state text, label text)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected_state then
      raise notice 'PASS %', label;
      return;
    end if;
    raise exception 'FAIL % (expected %, got %: %)', label, expected_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL % (statement unexpectedly succeeded)', label;
end;
$$;

grant usage on schema phase9gc_test to authenticated;
grant execute on function phase9gc_test.assert_true(boolean, text) to authenticated;
grant execute on function phase9gc_test.assert_sqlstate(text, text, text) to authenticated;

select set_config('request.jwt.claim.sub', '7b600000-0000-4000-8000-000000000002', false);
set role authenticated;

select phase9gc_test.assert_true(
  has_function_privilege('authenticated', 'public.get_inventory_counter_workspace()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_inventory_counter_workspace()', 'EXECUTE')
  and not exists (
    select 1
    from pg_catalog.pg_proc function
    cross join lateral pg_catalog.aclexplode(coalesce(function.proacl, pg_catalog.acldefault('f', function.proowner))) privilege
    where function.oid = 'public.get_inventory_counter_workspace()'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'DB-9GC-1: mobile workspace execution remains authenticated-only'
);

select phase9gc_test.assert_true(
  exists (
    select 1
    from pg_catalog.pg_proc function
    join pg_catalog.pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.proname = 'get_inventory_counter_workspace'
      and function.prosecdef
      and 'search_path=pg_catalog' = any(function.proconfig)
  ),
  'DB-9GC-2: mobile workspace retains security-definer identity resolution and a fixed search path'
);

select phase9gc_test.assert_true(
  jsonb_array_length(public.get_inventory_counter_workspace()->'assignments') = 1
  and public.get_inventory_counter_workspace()#>>'{assignments,0,location,id}' = '7b200000-0000-4000-8000-000000000001'
  and jsonb_array_length(public.get_inventory_counter_workspace()#>'{assignments,0,lines}') = 2,
  'DB-9GC-3: counter mobile home remains scoped to the authenticated assignment and refrigerator'
);

select phase9gc_test.assert_true(
  exists (
    select 1 from jsonb_array_elements(public.get_inventory_counter_workspace()#>'{assignments,0,lines}') line
    where line->>'product_id' = '7b100000-0000-4000-8000-000000000001'
      and (line->>'standard_quantity')::numeric = 10
  )
  and exists (
    select 1 from jsonb_array_elements(public.get_inventory_counter_workspace()#>'{assignments,0,lines}') line
    where line->>'product_id' = '7b100000-0000-4000-8000-000000000002'
      and (line->>'standard_quantity')::numeric = 1.4
  ),
  'DB-9GC-4: assigned lines expose their immutable snapshotted configured standards'
);

select phase9gc_test.assert_true(
  not ((public.get_inventory_counter_workspace()#>'{assignments,0,lines,0}') ? 'par_quantity_snapshot')
  and not ((public.get_inventory_counter_workspace()#>'{assignments,0,lines,0}') ? 'variance_quantity')
  and position('reserve' in lower(public.get_inventory_counter_workspace()::text)) = 0
  and position('organization_id' in lower(public.get_inventory_counter_workspace()::text)) = 0,
  'DB-9GC-5: mobile standard visibility does not expose internal, variance, reserve, or tenant fields'
);

select phase9gc_test.assert_true(
  (select count(*) from public.inventory_products) = 0
  and (select count(*) from public.inventory_location_products) = 0,
  'DB-9GC-6: counter still cannot browse product catalogue or refrigerator configuration tables'
);

select phase9gc_test.assert_true(
  (select count(*) from public.inventory_count_sessions) = 0
  and (select count(*) from public.inventory_count_lines) = 0,
  'DB-9GC-7: counter still cannot bypass the sanitized RPC to browse sessions or count lines'
);

select phase9gc_test.assert_sqlstate(
  $sql$select public.set_inventory_counter_membership('7b600000-0000-4000-8000-000000000003', false)$sql$,
  'P0001',
  'DB-9GC-8: constructed manager RPC calls remain rejected for a counter'
);

reset role;
drop schema phase9gc_test cascade;

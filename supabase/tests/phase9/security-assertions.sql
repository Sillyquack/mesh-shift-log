-- Executable Phase 9 grants, RLS, tenant-boundary, and RPC assertions.
create schema phase9_test;
revoke all on schema phase9_test from public;
grant usage on schema phase9_test to authenticated, anon;

create function phase9_test.assert_true(condition boolean, label text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'FAIL %', label;
  end if;
  raise notice 'PASS %', label;
end;
$$;

create function phase9_test.assert_sqlstate(statement text, expected_state text, label text)
returns void
language plpgsql
as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected_state then
      raise notice 'PASS %', label;
      return;
    end if;
    raise exception 'FAIL % (expected SQLSTATE %, received %: %)', label, expected_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL % (statement unexpectedly succeeded)', label;
end;
$$;

create function phase9_test.assert_lives(statement text, label text)
returns void
language plpgsql
as $$
begin
  execute statement;
  raise notice 'PASS %', label;
exception when others then
  raise exception 'FAIL % (SQLSTATE %: %)', label, sqlstate, sqlerrm;
end;
$$;

revoke all on function phase9_test.assert_true(boolean, text) from public;
revoke all on function phase9_test.assert_sqlstate(text, text, text) from public;
revoke all on function phase9_test.assert_lives(text, text) from public;
grant execute on function phase9_test.assert_true(boolean, text) to authenticated, anon;
grant execute on function phase9_test.assert_sqlstate(text, text, text) to authenticated, anon;
grant execute on function phase9_test.assert_lives(text, text) to authenticated, anon;

-- Structural RLS and direct-table privilege guarantees.
select phase9_test.assert_true(
  (select count(*) = 5
   from pg_catalog.pg_class relation
   join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
   where namespace.nspname = 'public'
     and relation.relname in (
       'inventory_products', 'inventory_locations', 'inventory_location_products',
       'inventory_count_sessions', 'inventory_count_lines'
     )
     and relation.relrowsecurity),
  'DB-RLS-1: RLS is enabled on all five inventory tables'
);

select phase9_test.assert_true(
  not exists (
    select 1
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname like 'inventory_%'
      and relation.relkind = 'r'
      and relation.relforcerowsecurity
  ),
  'DB-RLS-2: FORCE RLS remains off for owner-run guarded SECURITY DEFINER RPCs'
);

select phase9_test.assert_true(
  (select count(*) = 5
   from pg_catalog.pg_policies
   where schemaname = 'public'
     and policyname in (
       'inventory_products_read', 'inventory_locations_read',
       'inventory_location_products_read', 'inventory_count_sessions_read',
       'inventory_count_lines_read'
     )
     and roles = array['authenticated']::name[]),
  'DB-RLS-3: the five inventory read policies target authenticated only'
);

select phase9_test.assert_true(
  not has_table_privilege('authenticated', 'public.user_profiles', 'INSERT')
  and not has_table_privilege('authenticated', 'public.user_profiles', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.user_profiles', 'DELETE')
  and not has_column_privilege('authenticated', 'public.user_profiles', 'organization_id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.user_profiles', 'role', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.user_profiles', 'active', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.user_profiles', 'is_shared_device', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.user_profiles', 'shared_device_label', 'UPDATE'),
  'DB-PROFILE-1: authenticated has no profile table or authority-column mutation privilege'
);

select phase9_test.assert_true(
  (select bool_and(
    has_any_column_privilege('authenticated', format('public.%I', table_name), 'SELECT')
    and not has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT')
    and not has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE')
    and not has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE')
  )
  from unnest(array[
    'inventory_products', 'inventory_locations', 'inventory_location_products',
    'inventory_count_sessions', 'inventory_count_lines'
  ]) table_name),
  'DB-GRANT-1: authenticated inventory tables are column-readable and directly immutable'
);

-- Organization A manager: own-tenant reads, same-organization diagnostics, and mutations.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
set role authenticated;

select phase9_test.assert_true(
  exists (select 1 from public.inventory_products where id = 'a1000000-0000-4000-8000-000000000001')
  and not exists (select 1 from public.inventory_products where id = 'b1000000-0000-4000-8000-000000000001'),
  'DB-READ-1: Organization A manager reads A inventory and not B inventory'
);

select phase9_test.assert_true(
  (select count(*) = 7 from public.user_profiles)
  and not exists (
    select 1 from public.user_profiles
    where organization_id is distinct from 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  'DB-PROFILE-2: Organization A manager diagnostics are same-organization only'
);

select phase9_test.assert_sqlstate(
  $sql$update public.user_profiles set organization_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1' where id = '10000000-0000-4000-8000-000000000001'$sql$,
  '42501',
  'DB-PROFILE-3: manager cannot change their organization directly'
);
select phase9_test.assert_sqlstate(
  $sql$update public.user_profiles set role = 'staff' where id = '10000000-0000-4000-8000-000000000001'$sql$,
  '42501',
  'DB-PROFILE-4: manager cannot change their role directly'
);
select phase9_test.assert_sqlstate(
  $sql$update public.user_profiles set active = false where id = '20000000-0000-4000-8000-000000000001'$sql$,
  '42501',
  'DB-PROFILE-5: Organization A manager cannot update Organization B profiles'
);

select phase9_test.assert_lives(
  $sql$select public.upsert_inventory_product(
    input_product_id => 'a1000000-0000-4000-8000-000000000001',
    input_name => 'Organization A Product Updated',
    input_fields => array['name']
  )$sql$,
  'DB-RPC-1: Organization A manager updates an Organization A product'
);
select phase9_test.assert_lives(
  $sql$select public.upsert_inventory_location(
    input_location_id => 'a2000000-0000-4000-8000-000000000001',
    input_name => 'Organization A Location Updated',
    input_fields => array['name']
  )$sql$,
  'DB-RPC-2: Organization A manager updates an Organization A location'
);
select phase9_test.assert_lives(
  $sql$select public.upsert_inventory_location_product(
    input_location_product_id => 'a3000000-0000-4000-8000-000000000001',
    input_par_quantity => 11,
    input_fields => array['par_quantity']
  )$sql$,
  'DB-RPC-3: Organization A manager updates an Organization A standard'
);
select phase9_test.assert_lives(
  $sql$select public.set_inventory_count_line_quantity(
    input_line_id => 'a5000000-0000-4000-8000-000000000001',
    input_counted_quantity => 4,
    input_note => 'Executable security test',
    input_expected_updated_at => (select updated_at from public.inventory_count_lines where id = 'a5000000-0000-4000-8000-000000000001')
  )$sql$,
  'DB-RPC-4: Organization A manager updates an Organization A count line'
);
select phase9_test.assert_true(
  (public.set_inventory_count_line_quantity(
    input_line_id => 'a5000000-0000-4000-8000-000000000001',
    input_counted_quantity => 5,
    input_actor_name => 'Forged Organization B operator',
    input_expected_updated_at => (select updated_at from public.inventory_count_lines where id = 'a5000000-0000-4000-8000-000000000001')
  ) ->> 'counted_by_name') = 'Organization A Manager',
  'DB-RPC-5: arbitrary operator text cannot replace the authenticated manager identity'
);
select phase9_test.assert_lives(
  'select public.setup_mesh_youngstorget_inventory_locations()',
  'DB-RPC-6: Organization A manager can apply the guarded location template'
);

select phase9_test.assert_sqlstate(
  $sql$select public.upsert_inventory_product(
    input_product_id => 'b1000000-0000-4000-8000-000000000001',
    input_name => 'Cross-organization change', input_fields => array['name']
  )$sql$,
  'P0001',
  'DB-TENANT-1: Organization A manager cannot update a B product ID'
);
select phase9_test.assert_sqlstate(
  $sql$select public.upsert_inventory_location(
    input_location_id => 'b2000000-0000-4000-8000-000000000001',
    input_name => 'Cross-organization change', input_fields => array['name']
  )$sql$,
  'P0001',
  'DB-TENANT-2: Organization A manager cannot update a B location ID'
);
select phase9_test.assert_sqlstate(
  $sql$select public.upsert_inventory_location_product(
    input_location_id => 'a2000000-0000-4000-8000-000000000001',
    input_product_id => 'b1000000-0000-4000-8000-000000000001',
    input_par_quantity => 1
  )$sql$,
  'P0001',
  'DB-TENANT-3: Organization A manager cannot attach a B product to an A standard'
);
select phase9_test.assert_sqlstate(
  $sql$select public.create_inventory_count_session(
    'Cross-organization count', 'daily', '90000000-0000-4000-8000-000000000001', current_date,
    array['b2000000-0000-4000-8000-000000000001']::uuid[], null
  )$sql$,
  'P0001',
  'DB-TENANT-4: Organization A manager cannot create a session from a B location ID'
);
select phase9_test.assert_sqlstate(
  $sql$select public.set_inventory_count_line_quantity(
    'b5000000-0000-4000-8000-000000000001', 1
  )$sql$,
  'P0001',
  'DB-TENANT-5: Organization A manager cannot update a B count-line ID'
);
select phase9_test.assert_sqlstate(
  $sql$select public.complete_inventory_count_session(
    'b4000000-0000-4000-8000-000000000001'
  )$sql$,
  'P0001',
  'DB-TENANT-6: Organization A manager cannot complete a B session ID'
);

select phase9_test.assert_sqlstate(
  'select * from public.inventory_resolve_actor(null)',
  '42501',
  'DB-EXEC-1: authenticated cannot directly execute actor resolution'
);
select phase9_test.assert_sqlstate(
  $sql$select public.inventory_count_line_client_record('a5000000-0000-4000-8000-000000000001')$sql$,
  '42501',
  'DB-EXEC-2: authenticated cannot directly execute the internal line reader'
);
select phase9_test.assert_sqlstate(
  $sql$select * from public.inventory_stock_policy_target('a3000000-0000-4000-8000-000000000001')$sql$,
  '42501',
  'DB-EXEC-3: authenticated cannot directly execute policy-target resolution'
);

reset role;

-- Organization B manager: inverse tenant isolation and own-tenant mutation.
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', false);
set role authenticated;
select phase9_test.assert_true(
  exists (select 1 from public.inventory_products where id = 'b1000000-0000-4000-8000-000000000001')
  and not exists (select 1 from public.inventory_products where id = 'a1000000-0000-4000-8000-000000000001'),
  'DB-READ-2: Organization B manager reads B inventory and not A inventory'
);
select phase9_test.assert_lives(
  $sql$select public.upsert_inventory_product(
    input_product_id => 'b1000000-0000-4000-8000-000000000001',
    input_name => 'Organization B Product Updated',
    input_fields => array['name']
  )$sql$,
  'DB-RPC-7: Organization B manager updates Organization B inventory'
);
reset role;

-- Staff: own profile only, no inventory reads, no profile promotion, all 20 mutation RPCs denied.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', false);
set role authenticated;
select phase9_test.assert_true(
  not exists (select 1 from public.inventory_products)
  and (select count(*) = 1 from public.user_profiles)
  and exists (select 1 from public.user_profiles where id = '10000000-0000-4000-8000-000000000002'),
  'DB-READ-3: staff reads no inventory and only their own profile'
);
select phase9_test.assert_sqlstate(
  $sql$update public.user_profiles set role = 'manager' where id = '10000000-0000-4000-8000-000000000002'$sql$,
  '42501',
  'DB-PROFILE-6: staff cannot promote themselves directly'
);

do $$
declare
  denied record;
begin
  for denied in
    select * from (values
      ('upsert product', $sql$select public.upsert_inventory_product(input_name => 'Denied', input_unit_label => 'piece')$sql$),
      ('upsert location', $sql$select public.upsert_inventory_location(input_name => 'Denied')$sql$),
      ('upsert standard', $sql$select public.upsert_inventory_location_product(input_location_id => 'a2000000-0000-4000-8000-000000000001', input_product_id => 'a1000000-0000-4000-8000-000000000001', input_par_quantity => 1)$sql$),
      ('copy standards', $sql$select public.copy_inventory_location_standards('a2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001')$sql$),
      ('setup template', $sql$select public.setup_mesh_youngstorget_inventory_locations()$sql$),
      ('bulk standards', $sql$select public.bulk_upsert_inventory_location_standards('a2000000-0000-4000-8000-000000000001', '[]'::jsonb)$sql$),
      ('create session', $sql$select public.create_inventory_count_session('Denied', 'daily', '90000000-0000-4000-8000-000000000002', current_date, array['a2000000-0000-4000-8000-000000000001']::uuid[], null)$sql$),
      ('set line quantity', $sql$select public.set_inventory_count_line_quantity('a5000000-0000-4000-8000-000000000001', 1)$sql$),
      ('set line cases', $sql$select public.set_inventory_count_line_case_quantity('a5000000-0000-4000-8000-000000000001', 1, 0)$sql$),
      ('mark line use par', $sql$select public.mark_inventory_count_line_use_par('a5000000-0000-4000-8000-000000000001')$sql$),
      ('clear line', $sql$select public.clear_inventory_count_line('a5000000-0000-4000-8000-000000000001')$sql$),
      ('skip line', $sql$select public.skip_inventory_count_line('a5000000-0000-4000-8000-000000000001', 'Denied')$sql$),
      ('mark location use par', $sql$select public.mark_inventory_location_use_par('a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001')$sql$),
      ('confirm unchanged', $sql$select public.confirm_inventory_count_line_unchanged('a5000000-0000-4000-8000-000000000001')$sql$),
      ('complete location', $sql$select public.complete_inventory_count_location('a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001')$sql$),
      ('complete session', $sql$select public.complete_inventory_count_session('a4000000-0000-4000-8000-000000000001')$sql$),
      ('approve session', $sql$select public.approve_inventory_count_session('a4000000-0000-4000-8000-000000000001')$sql$),
      ('create correction', $sql$select public.create_inventory_correction_session('a4000000-0000-4000-8000-000000000001', 'Denied', '90000000-0000-4000-8000-000000000003')$sql$),
      ('cancel session', $sql$select public.cancel_inventory_count_session('a4000000-0000-4000-8000-000000000001', 'Denied')$sql$),
      ('import catalog', $sql$select public.import_inventory_catalog('[{"name":"Denied","unitLabel":"piece"}]'::jsonb, false)$sql$)
    ) denied_rpc(label, statement)
  loop
    perform phase9_test.assert_sqlstate(
      denied.statement,
      'P0001',
      'DB-RPC-DENY-STAFF: ' || denied.label
    );
  end loop;
end;
$$;
reset role;

-- Every remaining non-manager or unsafe manager profile reads no inventory and fails an RPC.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', false);
set role authenticated;
select phase9_test.assert_true(not exists (select 1 from public.inventory_products), 'DB-READ-4: shift lead cannot read inventory');
select phase9_test.assert_sqlstate($sql$select public.upsert_inventory_product(input_name => 'Denied shift lead', input_unit_label => 'piece')$sql$, 'P0001', 'DB-RPC-DENY-1: shift lead is rejected');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', false);
set role authenticated;
select phase9_test.assert_true(not exists (select 1 from public.inventory_products), 'DB-READ-5: event floor manager cannot read inventory');
select phase9_test.assert_sqlstate($sql$select public.create_inventory_count_session('Denied EFM', 'daily', '90000000-0000-4000-8000-000000000004', current_date, null, null)$sql$, 'P0001', 'DB-RPC-DENY-2: event floor manager is rejected');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', false);
set role authenticated;
select phase9_test.assert_true(not exists (select 1 from public.inventory_products), 'DB-READ-6: Time2Staff cannot read inventory');
select phase9_test.assert_sqlstate($sql$select public.upsert_inventory_product(input_name => 'Denied Time2Staff', input_unit_label => 'piece')$sql$, 'P0001', 'DB-RPC-DENY-3: Time2Staff is rejected');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000006', false);
set role authenticated;
select phase9_test.assert_true(not exists (select 1 from public.inventory_products), 'DB-READ-7: shared-device manager cannot read inventory');
select phase9_test.assert_sqlstate($sql$select public.upsert_inventory_product(input_name => 'Denied shared manager', input_unit_label => 'piece')$sql$, 'P0001', 'DB-RPC-DENY-4: shared-device manager is rejected');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000007', false);
set role authenticated;
select phase9_test.assert_true(not exists (select 1 from public.inventory_products), 'DB-READ-8: inactive manager cannot read inventory');
select phase9_test.assert_sqlstate($sql$select public.upsert_inventory_product(input_name => 'Denied inactive manager', input_unit_label => 'piece')$sql$, 'P0001', 'DB-RPC-DENY-5: inactive manager is rejected');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000008', false);
set role authenticated;
select phase9_test.assert_true(not exists (select 1 from public.inventory_products), 'DB-READ-9: null-organization manager cannot read inventory');
select phase9_test.assert_sqlstate($sql$select public.upsert_inventory_product(input_name => 'Denied null organization', input_unit_label => 'piece')$sql$, 'P0001', 'DB-RPC-DENY-6: null-organization manager is rejected');
reset role;

-- anon has neither inventory table access nor business-RPC execution.
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select phase9_test.assert_sqlstate(
  'select id from public.inventory_products limit 1',
  '42501',
  'DB-READ-10: anon cannot read inventory'
);
select phase9_test.assert_sqlstate(
  $sql$select public.upsert_inventory_product(input_name => 'Denied anon', input_unit_label => 'piece')$sql$,
  '42501',
  'DB-EXEC-4: anon cannot execute inventory business RPCs'
);
select phase9_test.assert_true(
  not exists (select 1 from public.user_profiles),
  'DB-PROFILE-7: anon cannot read profile rows'
);
update public.user_profiles
set role = 'staff'
where id = '10000000-0000-4000-8000-000000000001';
reset role;
select phase9_test.assert_true(
  (select role = 'manager'
   from public.user_profiles
   where id = '10000000-0000-4000-8000-000000000001'),
  'DB-PROFILE-8: RLS prevents anon from changing profile authority'
);

-- Exact effective EXECUTE surface for inventory-related public functions.
create table phase9_test.expected_authenticated_functions (signature text primary key);
insert into phase9_test.expected_authenticated_functions (signature) values
  ('public.current_user_can_manage_inventory_config()'),
  ('public.current_user_can_count_inventory()'),
  ('public.inventory_counter_session_is_active(uuid,uuid)'),
  ('public.get_inventory_count_session_record(uuid)'),
  ('public.get_inventory_manager_count_session_detail(uuid)'),
  ('public.get_inventory_millum_export(uuid)'),
  ('public.get_inventory_counter_workspace()'),
  ('public.upsert_inventory_product(uuid,text,text,text,text,text,text,numeric,text,text,boolean,integer,jsonb,text,numeric,text[])'),
  ('public.upsert_inventory_location(uuid,text,text,text,uuid,text,text,boolean,integer,jsonb,text[])'),
  ('public.upsert_inventory_location_product(uuid,uuid,uuid,numeric,numeric,numeric,integer,boolean,text,jsonb,text[])'),
  ('public.copy_inventory_location_standards(uuid,uuid,boolean)'),
  ('public.setup_mesh_youngstorget_inventory_locations()'),
  ('public.verify_inventory_refrigerator_template(uuid)'),
  ('public.set_inventory_product_reserve_override(uuid,numeric)'),
  ('public.bulk_upsert_inventory_location_standards(uuid,jsonb)'),
  ('public.set_inventory_location_countable(uuid,boolean)'),
  ('public.set_inventory_storage_multiplier(numeric)'),
  ('public.set_inventory_location_reference_guidance(uuid,text,text,text,bigint,text,bigint)'),
  ('public.remove_inventory_location_reference_image(uuid,bigint)'),
  ('public.list_inventory_reference_cleanup_paths()'),
  ('public.queue_inventory_reference_cleanup_path(uuid,text,text)'),
  ('public.acknowledge_inventory_reference_cleanup(text)'),
  ('public.create_inventory_count_session(text,text,uuid,date,uuid[],text)'),
  ('public.create_inventory_correction_session(uuid,text,uuid)'),
  ('public.set_inventory_count_line_quantity(uuid,numeric,text,text,timestamp with time zone)'),
  ('public.set_inventory_count_line_case_quantity(uuid,integer,numeric,text,text,timestamp with time zone)'),
  ('public.set_inventory_count_line_structured_quantity(uuid,numeric,numeric,numeric,numeric,text,text,timestamp with time zone)'),
  ('public.mark_inventory_count_line_use_par(uuid,text,text,timestamp with time zone)'),
  ('public.clear_inventory_count_line(uuid,text,timestamp with time zone)'),
  ('public.skip_inventory_count_line(uuid,text,text,timestamp with time zone)'),
  ('public.mark_inventory_location_use_par(uuid,uuid,boolean,text,timestamp with time zone)'),
  ('public.confirm_inventory_count_line_unchanged(uuid,timestamp with time zone)'),
  ('public.complete_inventory_count_location(uuid,uuid,text)'),
  ('public.complete_inventory_count_session(uuid,text,boolean,text)'),
  ('public.approve_inventory_count_session(uuid,text)'),
  ('public.cancel_inventory_count_session(uuid,text)'),
  ('public.import_inventory_catalog(jsonb,boolean)'),
  ('public.set_inventory_counter_membership(uuid,boolean)'),
  ('public.create_inventory_count_assignment(uuid,uuid,uuid,timestamp with time zone)'),
  ('public.inventory_counter_set_count_line_quantity(uuid,uuid,numeric,text,bigint,timestamp with time zone)'),
  ('public.inventory_counter_set_count_line_structured_quantity(uuid,uuid,numeric,numeric,numeric,numeric,text,bigint,timestamp with time zone)'),
  ('public.inventory_counter_apply_refrigerator_default(uuid,boolean,bigint)'),
  ('public.submit_inventory_count_assignment(uuid,bigint,timestamp with time zone)'),
  ('public.return_inventory_count_assignment(uuid,text,bigint)'),
  ('public.accept_inventory_count_assignment(uuid,bigint)'),
  ('public.replace_inventory_count_assignment(uuid,uuid,text,text,boolean,bigint)');

select phase9_test.assert_true(
  (select bool_and(to_regprocedure(signature) is not null)
   from phase9_test.expected_authenticated_functions),
  'DB-EXEC-5: every intended inventory function signature exists'
);
select phase9_test.assert_true(
  (select bool_and(has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE'))
   from phase9_test.expected_authenticated_functions),
  'DB-EXEC-6: authenticated can execute every intended guarded RPC and safe reader'
);
select phase9_test.assert_true(
  (select bool_and(not has_function_privilege('anon', to_regprocedure(signature), 'EXECUTE'))
   from phase9_test.expected_authenticated_functions),
  'DB-EXEC-7: anon cannot execute any intended authenticated inventory function'
);
select phase9_test.assert_true(
  not exists (
    select 1
    from pg_catalog.pg_proc function
    join pg_catalog.pg_namespace namespace on namespace.oid = function.pronamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(function.proacl, pg_catalog.acldefault('f', function.proowner))
    ) privilege
    where namespace.nspname = 'public'
      and function.proname like '%inventory%'
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'DB-EXEC-8: PUBLIC has no EXECUTE on inventory-related functions'
);
select phase9_test.assert_true(
  not exists (
    select 1
    from pg_catalog.pg_proc function
    join pg_catalog.pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.proname like '%inventory%'
      and has_function_privilege('authenticated', function.oid, 'EXECUTE')
      and function.oid not in (
        select to_regprocedure(signature)::oid
        from phase9_test.expected_authenticated_functions
      )
  ),
  'DB-EXEC-9: authenticated has no unintended inventory helper execution'
);

drop schema phase9_test cascade;

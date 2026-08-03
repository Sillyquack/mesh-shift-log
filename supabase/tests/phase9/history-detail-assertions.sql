-- Executable manager-history detail authorization, lifecycle, and immutability assertions.
create schema phase9_history_detail_test;
revoke all on schema phase9_history_detail_test from public;
grant usage on schema phase9_history_detail_test to authenticated;

create function phase9_history_detail_test.assert_true(condition boolean, label text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'FAIL %', label; end if;
  raise notice 'PASS %', label;
end;
$$;

create function phase9_history_detail_test.assert_sqlstate(statement text, expected_state text, label text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected_state then raise notice 'PASS %', label; return; end if;
    raise exception 'FAIL % (expected SQLSTATE %, received %: %)', label, expected_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL % (statement unexpectedly succeeded)', label;
end;
$$;

revoke all on function phase9_history_detail_test.assert_true(boolean, text) from public;
revoke all on function phase9_history_detail_test.assert_sqlstate(text, text, text) from public;
grant execute on function phase9_history_detail_test.assert_true(boolean, text) to authenticated;
grant execute on function phase9_history_detail_test.assert_sqlstate(text, text, text) to authenticated;

select phase9_history_detail_test.assert_true(
  has_function_privilege('authenticated', 'public.get_inventory_manager_count_session_detail(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_inventory_manager_count_session_detail(uuid)', 'EXECUTE')
  and not exists (
    select 1
    from pg_catalog.pg_proc function
    cross join lateral pg_catalog.aclexplode(
      coalesce(function.proacl, pg_catalog.acldefault('f', function.proowner))
    ) privilege
    where function.oid = 'public.get_inventory_manager_count_session_detail(uuid)'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'DB-HISTORY-1: only authenticated callers can reach the guarded manager history RPC'
);

begin;

create temporary table phase9_approved_history_before as
select md5(
  (select to_jsonb(session)::text from public.inventory_count_sessions session
   where session.id = 'a4000000-0000-4000-8000-000000000001')
  || (select jsonb_agg(to_jsonb(line) order by line.id)::text
      from public.inventory_count_lines line
      where line.session_id = 'a4000000-0000-4000-8000-000000000001')
) as digest;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
set role authenticated;
select phase9_history_detail_test.assert_true(
  (select detail #>> '{session,status}' = 'approved'
      and jsonb_array_length(detail->'lines') = 1
      and (select count(distinct value->>'location_id') from jsonb_array_elements(detail->'lines')) = 1
   from (select public.get_inventory_manager_count_session_detail(
     'a4000000-0000-4000-8000-000000000001'
   ) detail) response),
  'DB-HISTORY-2: approved session returns its complete historical lines and locations'
);
select phase9_history_detail_test.assert_true(
  (select (detail->'lines'->0) ?& array[
      'id', 'location_id', 'product_id', 'product_name_snapshot',
      'location_name_snapshot', 'counted_quantity', 'count_status',
      'historical_suggestion_quantity_snapshot', 'storage_rule_version_snapshot'
    ]
   from (select public.get_inventory_manager_count_session_detail(
     'a4000000-0000-4000-8000-000000000001'
   ) detail) response),
  'DB-HISTORY-3: approved detail contains client-safe product and Phase 9J snapshots'
);
reset role;

select set_config('request.jwt.claim.sub', '7b600000-0000-4000-8000-000000000001', false);
set role authenticated;
select phase9_history_detail_test.assert_true(
  (select detail #>> '{session,status}' = 'in_progress'
      and jsonb_array_length(detail->'lines') = 3
      and (select count(distinct value->>'location_id') from jsonb_array_elements(detail->'lines')) = 2
   from (select public.get_inventory_manager_count_session_detail(
     '7b400000-0000-4000-8000-000000000001'
   ) detail) response),
  'DB-HISTORY-4: active session detail remains available'
);
reset role;

insert into auth.users (id) values ('88000000-0000-4000-8000-000000000001');
insert into public.organizations (id, name, slug) values
  ('88000000-0000-4000-8000-000000000001', 'History detail fixture', 'phase9-history-detail');
insert into public.user_profiles (id, organization_id, display_name, role, active, is_shared_device)
values (
  '88000000-0000-4000-8000-000000000001',
  '88000000-0000-4000-8000-000000000001',
  'History Detail Manager', 'manager', true, false
);
insert into public.inventory_products (
  id, organization_id, name, sku, category, unit_label, active,
  created_by_auth_user_id, updated_by_auth_user_id
) values (
  '88100000-0000-4000-8000-000000000001',
  '88000000-0000-4000-8000-000000000001',
  'History Detail Product', 'HISTORY-DETAIL', 'Test', 'piece', true,
  '88000000-0000-4000-8000-000000000001',
  '88000000-0000-4000-8000-000000000001'
);
insert into public.inventory_locations (
  id, organization_id, name, code, location_type, active, countable,
  created_by_auth_user_id, updated_by_auth_user_id
) values (
  '88200000-0000-4000-8000-000000000001',
  '88000000-0000-4000-8000-000000000001',
  'History Detail Location', 'HISTORY_DETAIL', 'storage', true, true,
  '88000000-0000-4000-8000-000000000001',
  '88000000-0000-4000-8000-000000000001'
);
insert into public.inventory_location_products (
  id, organization_id, location_id, product_id, par_quantity, count_order,
  active, stock_policy, created_by_auth_user_id, updated_by_auth_user_id
) values (
  '88300000-0000-4000-8000-000000000001',
  '88000000-0000-4000-8000-000000000001',
  '88200000-0000-4000-8000-000000000001',
  '88100000-0000-4000-8000-000000000001',
  4, 1, true, 'exact_par',
  '88000000-0000-4000-8000-000000000001',
  '88000000-0000-4000-8000-000000000001'
);

create temporary table phase9_history_detail_runtime (
  completed_session_id uuid,
  correction_session_id uuid
);
grant select, insert, update on phase9_history_detail_runtime to authenticated;

select set_config('request.jwt.claim.sub', '88000000-0000-4000-8000-000000000001', false);
set role authenticated;
insert into phase9_history_detail_runtime (completed_session_id)
select (public.create_inventory_count_session(
  'History detail completed fixture', 'daily',
  '88500000-0000-4000-8000-000000000001', current_date,
  array['88200000-0000-4000-8000-000000000001']::uuid[], null
) #>> '{session,id}')::uuid;
select phase9_history_detail_test.assert_true(
  (select detail #>> '{session,status}' = 'in_progress'
      and jsonb_array_length(detail->'lines') = 1
   from (select public.get_inventory_manager_count_session_detail(
     (select completed_session_id from phase9_history_detail_runtime)
   ) detail) response),
  'DB-HISTORY-5: newly active session detail remains available'
);
select public.set_inventory_count_line_quantity(
  input_line_id => (select (
    public.get_inventory_manager_count_session_detail(completed_session_id) #>> '{lines,0,id}'
  )::uuid from phase9_history_detail_runtime),
  input_counted_quantity => 4,
  input_expected_updated_at => (select (
    public.get_inventory_manager_count_session_detail(completed_session_id) #>> '{lines,0,updated_at}'
  )::timestamptz from phase9_history_detail_runtime)
);
select public.complete_inventory_count_location(
  (select completed_session_id from phase9_history_detail_runtime),
  '88200000-0000-4000-8000-000000000001'
);
select public.complete_inventory_count_session(
  (select completed_session_id from phase9_history_detail_runtime),
  'Completed history detail fixture', false, null
);
select phase9_history_detail_test.assert_true(
  (select detail #>> '{session,status}' = 'completed'
      and jsonb_array_length(detail->'lines') = 1
      and detail #>> '{lines,0,count_status}' = 'counted'
   from (select public.get_inventory_manager_count_session_detail(
     (select completed_session_id from phase9_history_detail_runtime)
   ) detail) response),
  'DB-HISTORY-6: completed session detail remains available'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
set role authenticated;
update phase9_history_detail_runtime
set correction_session_id = (public.create_inventory_correction_session(
  'a4000000-0000-4000-8000-000000000001',
  'Correct a verified counting error',
  '92000000-0000-4000-8000-000000000001'
) #>> '{session,id}')::uuid;
select phase9_history_detail_test.assert_true(
  (select detail #>> '{session,session_kind}' = 'correction'
      and jsonb_array_length(detail->'lines') = 1
   from (select public.get_inventory_manager_count_session_detail(
     (select correction_session_id from phase9_history_detail_runtime)
   ) detail) response),
  'DB-HISTORY-7: correction session detail remains available'
);
reset role;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', false);
set role authenticated;
select phase9_history_detail_test.assert_sqlstate(
  $sql$select public.get_inventory_manager_count_session_detail(
    'a4000000-0000-4000-8000-000000000001'
  )$sql$,
  'P0001',
  'DB-HISTORY-8: cross-organization history access is rejected'
);
reset role;

select set_config('request.jwt.claim.sub', '7b600000-0000-4000-8000-000000000002', false);
set role authenticated;
select phase9_history_detail_test.assert_sqlstate(
  $sql$select public.get_inventory_manager_count_session_detail(
    '7b400000-0000-4000-8000-000000000001'
  )$sql$,
  'P0001',
  'DB-HISTORY-9: counter cannot access manager history'
);
reset role;

select phase9_history_detail_test.assert_true(
  (select digest from phase9_approved_history_before) = md5(
    (select to_jsonb(session)::text from public.inventory_count_sessions session
     where session.id = 'a4000000-0000-4000-8000-000000000001')
    || (select jsonb_agg(to_jsonb(line) order by line.id)::text
        from public.inventory_count_lines line
        where line.session_id = 'a4000000-0000-4000-8000-000000000001')
  ),
  'DB-HISTORY-10: approved session and line history remains byte-stable after detail reads'
);

rollback;

drop schema phase9_history_detail_test cascade;

-- Executable Phase 9H assertions for Stock Count session location eligibility.
begin;

create schema phase9h_test;
revoke all on schema phase9h_test from public;
grant usage on schema phase9h_test to authenticated;

create function phase9h_test.assert_true(condition boolean, label text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'FAIL %', label; end if;
  raise notice 'PASS %', label;
end;
$$;

create function phase9h_test.assert_session_rejected(
  statement text,
  pattern text,
  rejected_title text,
  label text
)
returns void language plpgsql as $$
begin
  begin
    execute statement;
    raise exception 'Expected statement to fail: %', label;
  exception when others then
    if sqlerrm not ilike pattern then raise; end if;
  end;
  if exists (
    select 1 from public.inventory_count_sessions session
    where session.title = rejected_title
  ) then
    raise exception 'FAIL %: rejected request persisted a session', label;
  end if;
  raise notice 'PASS %', label;
end;
$$;

create function phase9h_test.assert_assignment_rejected(
  statement text,
  pattern text,
  expected_session_id uuid,
  expected_location_id uuid,
  label text
)
returns void language plpgsql as $$
begin
  begin
    execute statement;
    raise exception 'Expected statement to fail: %', label;
  exception when others then
    if sqlerrm not ilike pattern then raise; end if;
  end;
  if exists (
    select 1 from public.inventory_count_assignments assignment
    where assignment.session_id = expected_session_id
      and assignment.location_id = expected_location_id
  ) then
    raise exception 'FAIL %: rejected request persisted an empty assignment', label;
  end if;
  raise notice 'PASS %', label;
end;
$$;

revoke all on function phase9h_test.assert_true(boolean, text) from public;
revoke all on function phase9h_test.assert_session_rejected(text, text, text, text) from public;
revoke all on function phase9h_test.assert_assignment_rejected(text, text, uuid, uuid, text) from public;
grant execute on function phase9h_test.assert_true(boolean, text) to authenticated;
grant execute on function phase9h_test.assert_session_rejected(text, text, text, text) to authenticated;
grant execute on function phase9h_test.assert_assignment_rejected(text, text, uuid, uuid, text) to authenticated;

insert into auth.users (id) values ('30000000-0000-4000-8000-000000000002');
insert into public.user_profiles (
  id, organization_id, display_name, role, active, is_shared_device
) values (
  '30000000-0000-4000-8000-000000000002',
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  'Organization C Counter', 'counter', true, false
);

insert into public.inventory_products (
  id, organization_id, name, sku, category, unit_label, active, sort_order,
  created_by_auth_user_id, updated_by_auth_user_id
) values (
  'c1000000-0000-4000-8000-000000000002',
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  'Organization C Inactive Product', 'PHASE9H-C-INACTIVE', 'Test', 'piece', false, 2,
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001'
);

insert into public.inventory_locations (
  id, organization_id, name, code, location_type, active, sort_order,
  created_by_auth_user_id, updated_by_auth_user_id
) values
  ('c2000000-0000-4000-8000-000000000002', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'Organization C Parent Area', 'PHASE9H_PARENT', 'bar', true, 2, '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001'),
  ('c2000000-0000-4000-8000-000000000003', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'Organization C Empty Fridge', 'WORKBAR_BAR_RIGHT_FRIDGE', 'fridge', true, 3, '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001'),
  ('c2000000-0000-4000-8000-000000000004', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'Organization C Inactive Default Fridge', 'WORKBAR_NON_ALCO_FRIDGE', 'fridge', true, 4, '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001'),
  ('c2000000-0000-4000-8000-000000000005', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'Organization C Inactive Product Fridge', 'CORNERBAR_RIGHT_FRIDGE', 'fridge', true, 5, '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001');

insert into public.inventory_location_products (
  id, organization_id, location_id, product_id, par_quantity, count_order,
  active, stock_policy, created_by_auth_user_id, updated_by_auth_user_id
) values
  ('c3000000-0000-4000-8000-000000000004', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'c2000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000001', 4, 1, false, 'exact_par', '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001'),
  ('c3000000-0000-4000-8000-000000000005', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'c2000000-0000-4000-8000-000000000005', 'c1000000-0000-4000-8000-000000000002', 5, 1, true, 'exact_par', '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', false);
set role authenticated;

select phase9h_test.assert_true(
  (select function.prosecdef
      and function.proconfig @> array['search_path=pg_catalog']::text[]
      and has_function_privilege('authenticated', function.oid, 'EXECUTE')
      and not has_function_privilege('anon', function.oid, 'EXECUTE')
      and not exists (
        select 1 from pg_catalog.aclexplode(function.proacl) privilege
        where privilege.grantee = 0 and privilege.privilege_type = 'EXECUTE'
      )
   from pg_catalog.pg_proc function
   join pg_catalog.pg_namespace namespace on namespace.oid = function.pronamespace
   where namespace.nspname = 'public'
     and function.oid = 'public.create_inventory_count_session(text,text,uuid,date,uuid[],text)'::regprocedure),
  'DB-9H-1: session creation retains authenticated-only SECURITY DEFINER execution with a safe search path'
);

select public.create_inventory_count_session(
  'Phase 9H explicit eligible fridge', 'daily',
  '98000000-0000-4000-8000-000000000001', current_date,
  array['c2000000-0000-4000-8000-000000000001']::uuid[], null
);
select phase9h_test.assert_true(
  (select session.status = 'in_progress'
      and count(line.id) = 1
      and count(distinct line.location_id) = 1
   from public.inventory_count_sessions session
   join public.inventory_count_lines line on line.session_id = session.id
   where session.title = 'Phase 9H explicit eligible fridge'
   group by session.id, session.status),
  'DB-9H-2: an explicit operational refrigerator with an active default creates one non-empty scope'
);
select public.cancel_inventory_count_session(
  (select id from public.inventory_count_sessions where title = 'Phase 9H explicit eligible fridge'),
  'Release explicit Phase 9H fixture'
);

select phase9h_test.assert_session_rejected(
  $sql$select public.create_inventory_count_session('Rejected parent', 'daily', '98000000-0000-4000-8000-000000000002', current_date, array['c2000000-0000-4000-8000-000000000002']::uuid[], null)$sql$,
  '%eligible refrigerator with active defaults%', 'Rejected parent',
  'DB-9H-3: a parent area is rejected at the server boundary'
);
select phase9h_test.assert_session_rejected(
  $sql$select public.create_inventory_count_session('Rejected empty fridge', 'daily', '98000000-0000-4000-8000-000000000003', current_date, array['c2000000-0000-4000-8000-000000000003']::uuid[], null)$sql$,
  '%eligible refrigerator with active defaults%', 'Rejected empty fridge',
  'DB-9H-4: an operational refrigerator without an active persisted default is rejected'
);
select phase9h_test.assert_session_rejected(
  $sql$select public.create_inventory_count_session('Rejected inactive default', 'daily', '98000000-0000-4000-8000-000000000004', current_date, array['c2000000-0000-4000-8000-000000000004']::uuid[], null)$sql$,
  '%eligible refrigerator with active defaults%', 'Rejected inactive default',
  'DB-9H-5: an inactive persisted default does not make a refrigerator eligible'
);
select phase9h_test.assert_session_rejected(
  $sql$select public.create_inventory_count_session('Rejected inactive product', 'daily', '98000000-0000-4000-8000-000000000005', current_date, array['c2000000-0000-4000-8000-000000000005']::uuid[], null)$sql$,
  '%eligible refrigerator with active defaults%', 'Rejected inactive product',
  'DB-9H-6: a default for an inactive product does not make a refrigerator eligible'
);
select phase9h_test.assert_session_rejected(
  $sql$select public.create_inventory_count_session('Rejected foreign fridge', 'daily', '98000000-0000-4000-8000-000000000006', current_date, array['b2000000-0000-4000-8000-000000000001']::uuid[], null)$sql$,
  '%eligible refrigerator with active defaults%', 'Rejected foreign fridge',
  'DB-9H-7: a foreign operational refrigerator is rejected at the server boundary'
);
select phase9h_test.assert_session_rejected(
  $sql$select public.create_inventory_count_session('Rejected mixed scope', 'daily', '98000000-0000-4000-8000-000000000007', current_date, array['c2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000003']::uuid[], null)$sql$,
  '%eligible refrigerator with active defaults%', 'Rejected mixed scope',
  'DB-9H-8: a mixed valid and invalid selection is rejected atomically instead of silently narrowed'
);

select public.create_inventory_count_session(
  'Phase 9H derived eligible scope', 'daily',
  '98000000-0000-4000-8000-000000000008', current_date, null, null
);
select phase9h_test.assert_true(
  (select count(line.id) = 1
      and count(distinct line.location_id) = 1
      and bool_and(line.location_id = 'c2000000-0000-4000-8000-000000000001'::uuid)
   from public.inventory_count_sessions session
   join public.inventory_count_lines line on line.session_id = session.id
   where session.title = 'Phase 9H derived eligible scope'),
  'DB-9H-9: omitted location IDs derive only the organization eligible non-empty refrigerator scope'
);

select public.set_inventory_counter_membership('30000000-0000-4000-8000-000000000002', true);
select phase9h_test.assert_assignment_rejected(
  $sql$select public.create_inventory_count_assignment(
    (select id from public.inventory_count_sessions where title = 'Phase 9H derived eligible scope'),
    'c2000000-0000-4000-8000-000000000003',
    (select id from public.inventory_counter_memberships where counter_auth_user_id = '30000000-0000-4000-8000-000000000002'),
    (select updated_at from public.inventory_count_sessions where title = 'Phase 9H derived eligible scope')
  )$sql$,
  '%Assigned refrigerator is not part of this Stock Count%',
  (select id from public.inventory_count_sessions where title = 'Phase 9H derived eligible scope'),
  'c2000000-0000-4000-8000-000000000003',
  'DB-9H-10: a refrigerator with no session lines cannot create an empty assignment'
);

rollback;

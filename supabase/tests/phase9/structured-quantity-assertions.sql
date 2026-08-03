-- Executable Phase 9F exact structured-quantity fixtures and assertions.
create schema phase9f_test;
revoke all on schema phase9f_test from public;
grant usage on schema phase9f_test to authenticated;

create function phase9f_test.assert_true(condition boolean, label text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'FAIL %', label; end if;
  raise notice 'PASS %', label;
end;
$$;
create function phase9f_test.assert_raises(statement text, pattern text, label text)
returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'Expected statement to fail: %', label;
exception when others then
  if sqlerrm not ilike pattern then raise; end if;
  raise notice 'PASS %', label;
end;
$$;
revoke all on function phase9f_test.assert_true(boolean, text) from public;
revoke all on function phase9f_test.assert_raises(text, text, text) from public;
grant execute on function phase9f_test.assert_true(boolean, text) to authenticated;
grant execute on function phase9f_test.assert_raises(text, text, text) to authenticated;

insert into auth.users (id) values ('9f000000-0000-4000-8000-000000000001');
insert into public.organizations (id, name, slug) values
  ('9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f01', 'Phase 9F Structured Organization', 'phase9f-structured');
insert into public.user_profiles (id, organization_id, display_name, role, active, is_shared_device)
values ('9f000000-0000-4000-8000-000000000001', '9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f01', 'Phase 9F Manager', 'manager', true, false);
insert into public.inventory_products (
  id, organization_id, name, sku, category, unit_label, active, sort_order,
  count_mode, container_capacity_liters, created_by_auth_user_id, updated_by_auth_user_id
) values
  ('9f100000-0000-4000-8000-000000000001', '9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f01', 'Unit fixture', '9F-UNIT', 'Test', 'piece', true, 1, 'unit', null, '9f000000-0000-4000-8000-000000000001', '9f000000-0000-4000-8000-000000000001'),
  ('9f100000-0000-4000-8000-000000000002', '9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f01', 'Bottle fixture', '9F-BOTTLE', 'Test', 'bottle', true, 2, 'container_plus_volume', 0.7, '9f000000-0000-4000-8000-000000000001', '9f000000-0000-4000-8000-000000000001'),
  ('9f100000-0000-4000-8000-000000000003', '9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f01', 'Keg fixture', '9F-KEG', 'Test', 'keg', true, 3, 'keg_fraction', null, '9f000000-0000-4000-8000-000000000001', '9f000000-0000-4000-8000-000000000001');
insert into public.inventory_locations (
  id, organization_id, name, code, location_type, active, countable, sort_order,
  created_by_auth_user_id, updated_by_auth_user_id
) values ('9f200000-0000-4000-8000-000000000001', '9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f01', 'Structured fridge', 'CORNERBAR_LEFT_FRIDGE', 'fridge', true, true, 1, '9f000000-0000-4000-8000-000000000001', '9f000000-0000-4000-8000-000000000001');
insert into public.inventory_location_products (
  id, organization_id, location_id, product_id, par_quantity, count_order,
  active, stock_policy, created_by_auth_user_id, updated_by_auth_user_id
) values
  ('9f300000-0000-4000-8000-000000000001', '9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f01', '9f200000-0000-4000-8000-000000000001', '9f100000-0000-4000-8000-000000000001', 1.2, 1, true, 'exact_par', '9f000000-0000-4000-8000-000000000001', '9f000000-0000-4000-8000-000000000001'),
  ('9f300000-0000-4000-8000-000000000002', '9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f01', '9f200000-0000-4000-8000-000000000001', '9f100000-0000-4000-8000-000000000002', 2.5, 2, true, 'exact_par', '9f000000-0000-4000-8000-000000000001', '9f000000-0000-4000-8000-000000000001'),
  ('9f300000-0000-4000-8000-000000000003', '9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f01', '9f200000-0000-4000-8000-000000000001', '9f100000-0000-4000-8000-000000000003', 2.5, 3, true, 'exact_par', '9f000000-0000-4000-8000-000000000001', '9f000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub', '9f000000-0000-4000-8000-000000000001', false);
set role authenticated;
select public.create_inventory_count_session(
  'Phase 9F structured count', 'daily', '9f900000-0000-4000-8000-000000000001', current_date,
  array['9f200000-0000-4000-8000-000000000001']::uuid[], null
);

select phase9f_test.assert_true(
  (select count(*) = 3
     and count(*) filter (where count_mode_snapshot = 'unit' and unit_label_snapshot = 'piece') = 1
     and count(*) filter (where count_mode_snapshot = 'container_plus_volume' and unit_label_snapshot = 'L' and container_capacity_liters_snapshot = 0.7) = 1
     and count(*) filter (where count_mode_snapshot = 'keg_fraction' and unit_label_snapshot = 'keg equivalents') = 1
   from public.inventory_count_lines line
   join public.inventory_count_sessions session on session.id = line.session_id
   where session.title = 'Phase 9F structured count'),
  'DB-9F-1: new sessions snapshot all three measurement configurations and base units'
);

select public.set_inventory_count_line_structured_quantity(
  input_line_id => (select line.id from public.inventory_count_lines line join public.inventory_count_sessions session on session.id = line.session_id where session.title = 'Phase 9F structured count' and line.product_id = '9f100000-0000-4000-8000-000000000002'),
  input_whole_units => 3, input_open_volume_liters => 0.4,
  input_expected_updated_at => (select line.updated_at from public.inventory_count_lines line join public.inventory_count_sessions session on session.id = line.session_id where session.title = 'Phase 9F structured count' and line.product_id = '9f100000-0000-4000-8000-000000000002')
);
select phase9f_test.assert_true(
  (select counted_quantity = 2.5 and counted_whole_units = 3 and counted_open_volume_liters = 0.4
   from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000002'),
  'DB-9F-2: 3 sealed times 0.7 L plus 0.4 L is exactly 2.5 L'
);

select public.set_inventory_count_line_structured_quantity(
  input_line_id => (select line.id from public.inventory_count_lines line where line.product_id = '9f100000-0000-4000-8000-000000000003'),
  input_full_kegs => 2, input_partial_keg_fraction => 0.5,
  input_expected_updated_at => (select updated_at from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000003')
);
select phase9f_test.assert_true(
  (select counted_quantity = 2.5 and counted_full_kegs = 2 and counted_partial_keg_fraction = 0.5
   from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000003'),
  'DB-9F-3: 2 full kegs plus 0.5 partial is exactly 2.5 keg equivalents'
);

select public.set_inventory_count_line_structured_quantity(
  input_line_id => (select id from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000003'),
  input_full_kegs => 2, input_partial_keg_fraction => 1,
  input_expected_updated_at => (select updated_at from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000003')
);
select phase9f_test.assert_true(
  (select counted_quantity = 3 and counted_full_kegs = 3 and counted_partial_keg_fraction = 0
   from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000003'),
  'DB-9F-4: an exact partial one transparently normalizes to an additional full keg'
);

select public.mark_inventory_count_line_use_par(
  input_line_id => (select id from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000002'),
  input_expected_updated_at => (select updated_at from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000002')
);
select public.mark_inventory_count_line_use_par(
  input_line_id => (select id from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000003'),
  input_expected_updated_at => (select updated_at from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000003')
);
select phase9f_test.assert_true(
  (select counted_quantity = 2.5 and counted_whole_units = 3 and counted_open_volume_liters = 0.4 and count_method = 'use_par'
   from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000002'),
  'DB-9F-5: container use-par decomposes exactly from the snapshotted capacity'
);
select phase9f_test.assert_true(
  (select counted_quantity = 2.5 and counted_full_kegs = 2 and counted_partial_keg_fraction = 0.5 and count_method = 'use_par'
   from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000003'),
  'DB-9F-6: keg use-par decomposes exactly into full and partial components'
);

select public.set_inventory_count_line_quantity(
  input_line_id => (select id from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000001'),
  input_counted_quantity => 0.4,
  input_expected_updated_at => (select updated_at from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000001')
);
select phase9f_test.assert_true(
  (select counted_quantity = 0.4 and counted_whole_units is null and counted_open_volume_liters is null and counted_full_kegs is null and counted_partial_keg_fraction is null
   from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000001'),
  'DB-9F-7: ordinary decimal unit counting remains unchanged with structured components null'
);

select phase9f_test.assert_raises(
  $$select public.set_inventory_count_line_structured_quantity(input_line_id => (select id from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000002'), input_whole_units => -1, input_open_volume_liters => 0, input_expected_updated_at => (select updated_at from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000002'))$$,
  '%non-negative whole number%', 'DB-9F-8: negative sealed counts are rejected'
);
select phase9f_test.assert_raises(
  $$select public.set_inventory_count_line_structured_quantity(input_line_id => (select id from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000002'), input_whole_units => 1.5, input_open_volume_liters => 0, input_expected_updated_at => (select updated_at from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000002'))$$,
  '%non-negative whole number%', 'DB-9F-9: fractional sealed counts are rejected'
);
select phase9f_test.assert_raises(
  $$select public.set_inventory_count_line_structured_quantity(input_line_id => (select id from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000002'), input_whole_units => 1, input_open_volume_liters => -0.1, input_expected_updated_at => (select updated_at from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000002'))$$,
  '%cannot be negative%', 'DB-9F-10: negative open volume is rejected'
);
select phase9f_test.assert_raises(
  $$select public.set_inventory_count_line_structured_quantity(input_line_id => (select id from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000003'), input_full_kegs => 1, input_partial_keg_fraction => 1.1, input_expected_updated_at => (select updated_at from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000003'))$$,
  '%from 0 through 1%', 'DB-9F-11: partial keg fractions greater than one are rejected'
);
select phase9f_test.assert_raises(
  $$select public.set_inventory_count_line_structured_quantity(input_line_id => (select id from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000003'), input_full_kegs => 1.5, input_partial_keg_fraction => 0.5, input_expected_updated_at => (select updated_at from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000003'))$$,
  '%non-negative whole number%', 'DB-9F-12: fractional full-keg counts are rejected'
);
select phase9f_test.assert_raises(
  $$select public.set_inventory_count_line_structured_quantity(input_line_id => (select id from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000003'), input_full_kegs => 1, input_partial_keg_fraction => 0.5, input_expected_updated_at => '2000-01-01'::timestamptz)$$,
  '%changed on another device%', 'DB-9F-13: stale structured writes are rejected'
);
select phase9f_test.assert_raises(
  $$select public.upsert_inventory_product(input_product_id => '9f100000-0000-4000-8000-000000000001', input_count_mode => 'container_plus_volume', input_container_capacity_liters => null, input_fields => array['count_mode','container_capacity_liters'])$$,
  '%positive container capacity%', 'DB-9F-14: container mode rejects missing capacity'
);

select phase9f_test.assert_true(
  has_function_privilege('authenticated', 'public.set_inventory_count_line_structured_quantity(uuid,numeric,numeric,numeric,numeric,text,text,timestamptz)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.set_inventory_count_line_structured_quantity(uuid,numeric,numeric,numeric,numeric,text,text,timestamptz)', 'EXECUTE')
  and not exists (
    select 1
    from pg_catalog.pg_proc function
    cross join lateral pg_catalog.aclexplode(coalesce(function.proacl, pg_catalog.acldefault('f', function.proowner))) privilege
    where function.oid = to_regprocedure('public.set_inventory_count_line_structured_quantity(uuid,numeric,numeric,numeric,numeric,text,text,timestamptz)')
      and privilege.grantee = 0 and privilege.privilege_type = 'EXECUTE'
  ),
  'DB-9F-15: structured mutation execution is explicitly authenticated-only'
);
select phase9f_test.assert_true(
  not has_column_privilege('authenticated', 'public.inventory_count_lines', 'counted_whole_units', 'UPDATE')
  and has_column_privilege('authenticated', 'public.inventory_count_lines', 'counted_whole_units', 'SELECT'),
  'DB-9F-16: component columns are readable for history but never directly writable'
);

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', false);
set role authenticated;
select phase9f_test.assert_raises(
  $$select public.set_inventory_count_line_structured_quantity(input_line_id => (select id from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000002'), input_whole_units => 1, input_open_volume_liters => 0, input_expected_updated_at => now())$$,
  '%manager profile%required%', 'DB-9F-17: authenticated staff cannot mutate structured quantities'
);
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
set role authenticated;
select phase9f_test.assert_raises(
  $$select public.set_inventory_count_line_structured_quantity(input_line_id => (select id from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000002'), input_whole_units => 1, input_open_volume_liters => 0, input_expected_updated_at => now())$$,
  '%not found%', 'DB-9F-18: a manager from another organization cannot mutate a structured line'
);

reset role;
select set_config('request.jwt.claim.sub', '9f000000-0000-4000-8000-000000000001', false);
set role authenticated;
select public.set_inventory_count_line_structured_quantity(
  input_line_id => (select id from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000002'),
  input_whole_units => 3, input_open_volume_liters => 0.4,
  input_expected_updated_at => (select updated_at from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000002')
);
select public.set_inventory_count_line_structured_quantity(
  input_line_id => (select id from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000003'),
  input_full_kegs => 2, input_partial_keg_fraction => 0.5,
  input_expected_updated_at => (select updated_at from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000003')
);
select public.complete_inventory_count_location(
  (select id from public.inventory_count_sessions where title = 'Phase 9F structured count'),
  '9f200000-0000-4000-8000-000000000001'
);
select public.complete_inventory_count_session(
  (select id from public.inventory_count_sessions where title = 'Phase 9F structured count'), null, false, null
);
select public.approve_inventory_count_session(
  (select id from public.inventory_count_sessions where title = 'Phase 9F structured count'), null
);
select phase9f_test.assert_raises(
  $$select public.set_inventory_count_line_structured_quantity(input_line_id => (select line.id from public.inventory_count_lines line join public.inventory_count_sessions session on session.id = line.session_id where session.title = 'Phase 9F structured count' and line.product_id = '9f100000-0000-4000-8000-000000000002'), input_whole_units => 0, input_open_volume_liters => 0, input_expected_updated_at => (select line.updated_at from public.inventory_count_lines line join public.inventory_count_sessions session on session.id = line.session_id where session.title = 'Phase 9F structured count' and line.product_id = '9f100000-0000-4000-8000-000000000002'))$$,
  '%read-only%', 'DB-9F-19: approved structured counts reject RPC mutation'
);

reset role;
select phase9f_test.assert_raises(
  $$update public.inventory_count_lines set counted_open_volume_liters = 0 where product_id = '9f100000-0000-4000-8000-000000000002'$$,
  '%immutable%', 'DB-9F-20: approved structured component rows reject direct mutation'
);
select phase9f_test.assert_raises(
  $$delete from public.inventory_count_lines where product_id = '9f100000-0000-4000-8000-000000000002'$$,
  '%immutable%', 'DB-9F-21: approved structured count rows reject deletion'
);

select set_config('request.jwt.claim.sub', '9f000000-0000-4000-8000-000000000001', false);
set role authenticated;
select public.upsert_inventory_product(
  input_product_id => '9f100000-0000-4000-8000-000000000002',
  input_count_mode => 'container_plus_volume', input_container_capacity_liters => 1,
  input_fields => array['count_mode','container_capacity_liters']
);
select phase9f_test.assert_true(
  (select container_capacity_liters_snapshot = 0.7 and counted_whole_units = 3 and counted_open_volume_liters = 0.4 and counted_quantity = 2.5
   from public.inventory_count_lines line join public.inventory_count_sessions session on session.id = line.session_id
   where session.title = 'Phase 9F structured count' and line.product_id = '9f100000-0000-4000-8000-000000000002'),
  'DB-9F-22: later product configuration changes cannot reinterpret approved history'
);
select public.create_inventory_correction_session(
  (select id from public.inventory_count_sessions where title = 'Phase 9F structured count'),
  'Verify structured snapshot copying', '9f900000-0000-4000-8000-000000000002'
);
select phase9f_test.assert_true(
  (select count(*) = 3
     and count(*) filter (where product_id = '9f100000-0000-4000-8000-000000000002' and count_mode_snapshot = 'container_plus_volume' and container_capacity_liters_snapshot = 0.7 and counted_quantity is null and counted_whole_units is null and counted_open_volume_liters is null) = 1
     and count(*) filter (where product_id = '9f100000-0000-4000-8000-000000000003' and count_mode_snapshot = 'keg_fraction' and counted_quantity is null and counted_full_kegs is null and counted_partial_keg_fraction is null) = 1
   from public.inventory_count_lines line join public.inventory_count_sessions session on session.id = line.session_id
   where session.correction_reason = 'Verify structured snapshot copying'),
  'DB-9F-23: corrections preserve product IDs and original measurement snapshots while resetting editable components'
);
select public.cancel_inventory_count_session(
  (select id from public.inventory_count_sessions where correction_reason = 'Verify structured snapshot copying'),
  'Phase 9F fixture complete'
);
reset role;
drop schema phase9f_test cascade;

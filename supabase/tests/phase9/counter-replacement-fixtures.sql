-- Isolated Phase 9G-B2 counter replacement fixtures.
begin;

insert into auth.users (id)
select id::uuid from unnest(array[
  'b2600000-0000-4000-8000-000000000001',
  'b2600000-0000-4000-8000-000000000002',
  'b2600000-0000-4000-8000-000000000003',
  'b2600000-0000-4000-8000-000000000004',
  'b2600000-0000-4000-8000-000000000005',
  'b2600000-0000-4000-8000-000000000006',
  'b2600000-0000-4000-8000-000000000007',
  'b2600000-0000-4000-8000-000000000008',
  'b2600000-0000-4000-8000-000000000009',
  'b2600000-0000-4000-8000-00000000000a',
  'b2600000-0000-4000-8000-00000000000b',
  'b2600000-0000-4000-8000-00000000000c',
  'b2600000-0000-4000-8000-00000000000d',
  'b2600000-0000-4000-8000-00000000000e',
  'f2600000-0000-4000-8000-000000000001',
  'f2600000-0000-4000-8000-000000000002',
  'f2600000-0000-4000-8000-000000000003'
]::text[]) as ids(id);

insert into public.organizations (id, name, slug) values
  ('b2000000-0000-4000-8000-000000000001', 'Phase 9G-B2 Replacement Organization', 'phase9gb2-replacement'),
  ('f2000000-0000-4000-8000-000000000001', 'Phase 9G-B2 Final History Organization', 'phase9gb2-final-history');

insert into public.user_profiles (id, organization_id, display_name, role, active, is_shared_device) values
  ('b2600000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'Replacement Manager', 'manager', true, false),
  ('b2600000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'Preserve Former Counter', 'counter', true, false),
  ('b2600000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000001', 'Preserve Replacement Counter', 'counter', true, false),
  ('b2600000-0000-4000-8000-000000000004', 'b2000000-0000-4000-8000-000000000001', 'Clear Former Counter', 'counter', true, false),
  ('b2600000-0000-4000-8000-000000000005', 'b2000000-0000-4000-8000-000000000001', 'Clear Replacement Counter', 'counter', true, false),
  ('b2600000-0000-4000-8000-000000000006', 'b2000000-0000-4000-8000-000000000001', 'Returned Former Counter', 'counter', true, false),
  ('b2600000-0000-4000-8000-000000000007', 'b2000000-0000-4000-8000-000000000001', 'Returned Replacement Counter', 'counter', true, false),
  ('b2600000-0000-4000-8000-000000000008', 'b2000000-0000-4000-8000-000000000001', 'Accepted Counter', 'counter', true, false),
  ('b2600000-0000-4000-8000-000000000009', 'b2000000-0000-4000-8000-000000000001', 'Submitted Counter', 'counter', true, false),
  ('b2600000-0000-4000-8000-00000000000a', 'b2000000-0000-4000-8000-000000000001', 'Concurrent Former Counter', 'counter', true, false),
  ('b2600000-0000-4000-8000-00000000000b', 'b2000000-0000-4000-8000-000000000001', 'Concurrent Replacement One', 'counter', true, false),
  ('b2600000-0000-4000-8000-00000000000c', 'b2000000-0000-4000-8000-000000000001', 'Concurrent Replacement Two', 'counter', true, false),
  ('b2600000-0000-4000-8000-00000000000d', 'b2000000-0000-4000-8000-000000000001', 'Inactive Replacement Counter', 'counter', true, false),
  ('b2600000-0000-4000-8000-00000000000e', 'b2000000-0000-4000-8000-000000000001', 'Unauthorized Replacement Counter', 'counter', true, false),
  ('f2600000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'Final History Manager', 'manager', true, false),
  ('f2600000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001', 'Final History Counter', 'counter', true, false),
  ('f2600000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000001', 'Final History Replacement', 'counter', true, false);

insert into public.inventory_products (
  id, organization_id, name, short_name, sku, category, unit_label, active, sort_order,
  count_mode, millum_item_ref, ownership_status, created_by_auth_user_id, updated_by_auth_user_id
)
select
  ('b2100000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  'b2000000-0000-4000-8000-000000000001'::uuid,
  'Replacement product ' || number, 'Replacement ' || number, 'B2-' || number,
  'Beer', 'bottles', true, number, 'unit', 'B2-MILLUM-' || number, 'owned',
  'b2600000-0000-4000-8000-000000000001'::uuid,
  'b2600000-0000-4000-8000-000000000001'::uuid
from generate_series(1, 6) number;

insert into public.inventory_locations (
  id, organization_id, name, code, location_type, active, countable, sort_order,
  created_by_auth_user_id, updated_by_auth_user_id
) values
  ('b2200000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'Preserve Fridge', 'CORNERBAR_LEFT_FRIDGE', 'fridge', true, true, 1, 'b2600000-0000-4000-8000-000000000001', 'b2600000-0000-4000-8000-000000000001'),
  ('b2200000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'Clear Fridge', 'CORNERBAR_MIDDLE_FRIDGE', 'fridge', true, true, 2, 'b2600000-0000-4000-8000-000000000001', 'b2600000-0000-4000-8000-000000000001'),
  ('b2200000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000001', 'Returned Fridge', 'CORNERBAR_RIGHT_FRIDGE', 'fridge', true, true, 3, 'b2600000-0000-4000-8000-000000000001', 'b2600000-0000-4000-8000-000000000001'),
  ('b2200000-0000-4000-8000-000000000004', 'b2000000-0000-4000-8000-000000000001', 'Accepted Fridge', 'WORKBAR_BAR_LEFT_FRIDGE', 'fridge', true, true, 4, 'b2600000-0000-4000-8000-000000000001', 'b2600000-0000-4000-8000-000000000001'),
  ('b2200000-0000-4000-8000-000000000005', 'b2000000-0000-4000-8000-000000000001', 'Submitted Fridge', 'WORKBAR_BAR_RIGHT_FRIDGE', 'fridge', true, true, 5, 'b2600000-0000-4000-8000-000000000001', 'b2600000-0000-4000-8000-000000000001'),
  ('b2200000-0000-4000-8000-000000000006', 'b2000000-0000-4000-8000-000000000001', 'Concurrent Fridge', 'WORKBAR_NON_ALCO_FRIDGE', 'fridge', true, true, 6, 'b2600000-0000-4000-8000-000000000001', 'b2600000-0000-4000-8000-000000000001');

insert into public.inventory_location_products (
  id, organization_id, location_id, product_id, par_quantity, count_order,
  active, stock_policy, created_by_auth_user_id, updated_by_auth_user_id
)
select
  ('b2300000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  'b2000000-0000-4000-8000-000000000001'::uuid,
  ('b2200000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  ('b2100000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  number + 4, 1, true, 'exact_par',
  'b2600000-0000-4000-8000-000000000001'::uuid,
  'b2600000-0000-4000-8000-000000000001'::uuid
from generate_series(1, 6) number;

insert into public.inventory_count_sessions (
  id, organization_id, title, count_type, status, count_date,
  started_by_auth_user_id, started_by_name
) values (
  'b2400000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
  'Phase 9G-B2 Replacement Count', 'daily', 'in_progress', current_date,
  'b2600000-0000-4000-8000-000000000001', 'Replacement Manager'
);

insert into public.inventory_count_lines (
  id, organization_id, session_id, location_id, product_id,
  product_name_snapshot, location_name_snapshot, unit_label_snapshot,
  category_snapshot, location_sort_order_snapshot, count_order_snapshot,
  product_sort_order_snapshot, par_quantity_snapshot, stock_policy_snapshot
)
select
  ('b2500000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  'b2000000-0000-4000-8000-000000000001'::uuid,
  'b2400000-0000-4000-8000-000000000001'::uuid,
  ('b2200000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  ('b2100000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  'Replacement product ' || number, 'Replacement fridge ' || number, 'bottles',
  'Beer', number, 1, number, number + 4, 'exact_par'
from generate_series(1, 6) number;

-- A separate finalized organization proves the recovery RPC cannot alter final history.
insert into public.inventory_products (
  id, organization_id, name, sku, category, unit_label, active, count_mode,
  millum_item_ref, ownership_status, created_by_auth_user_id, updated_by_auth_user_id
) values (
  'f2100000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001',
  'Final history product', 'B2-FINAL', 'Beer', 'bottles', true, 'unit',
  'B2-FINAL-1', 'owned', 'f2600000-0000-4000-8000-000000000001', 'f2600000-0000-4000-8000-000000000001'
);
insert into public.inventory_locations (
  id, organization_id, name, code, location_type, active, countable,
  created_by_auth_user_id, updated_by_auth_user_id
) values (
  'f2200000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001',
  'Final history fridge', 'CORNERBAR_LEFT_FRIDGE', 'fridge', true, true,
  'f2600000-0000-4000-8000-000000000001', 'f2600000-0000-4000-8000-000000000001'
);
insert into public.inventory_location_products (
  id, organization_id, location_id, product_id, par_quantity, count_order,
  active, stock_policy, created_by_auth_user_id, updated_by_auth_user_id
) values (
  'f2300000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001',
  'f2200000-0000-4000-8000-000000000001', 'f2100000-0000-4000-8000-000000000001',
  5, 1, true, 'exact_par', 'f2600000-0000-4000-8000-000000000001', 'f2600000-0000-4000-8000-000000000001'
);
insert into public.inventory_count_sessions (
  id, organization_id, title, count_type, status, count_date,
  started_by_auth_user_id, started_by_name
) values (
  'f2400000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001',
  'Final replacement history', 'daily', 'in_progress', current_date,
  'f2600000-0000-4000-8000-000000000001', 'Final History Manager'
);
insert into public.inventory_count_lines (
  id, organization_id, session_id, location_id, product_id,
  product_name_snapshot, location_name_snapshot, unit_label_snapshot,
  category_snapshot, par_quantity_snapshot, stock_policy_snapshot
) values (
  'f2500000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001',
  'f2400000-0000-4000-8000-000000000001', 'f2200000-0000-4000-8000-000000000001',
  'f2100000-0000-4000-8000-000000000001', 'Final history product', 'Final history fridge',
  'bottles', 'Beer', 5, 'exact_par'
);

commit;

select set_config('request.jwt.claim.sub', 'b2600000-0000-4000-8000-000000000001', false);
set role authenticated;
select public.set_inventory_counter_membership(profile_id, true)
from (values
  ('b2600000-0000-4000-8000-000000000002'::uuid),
  ('b2600000-0000-4000-8000-000000000003'::uuid),
  ('b2600000-0000-4000-8000-000000000004'::uuid),
  ('b2600000-0000-4000-8000-000000000005'::uuid),
  ('b2600000-0000-4000-8000-000000000006'::uuid),
  ('b2600000-0000-4000-8000-000000000007'::uuid),
  ('b2600000-0000-4000-8000-000000000008'::uuid),
  ('b2600000-0000-4000-8000-000000000009'::uuid),
  ('b2600000-0000-4000-8000-00000000000a'::uuid),
  ('b2600000-0000-4000-8000-00000000000b'::uuid),
  ('b2600000-0000-4000-8000-00000000000c'::uuid),
  ('b2600000-0000-4000-8000-00000000000d'::uuid)
) counter(profile_id);

select public.create_inventory_count_assignment(
  'b2400000-0000-4000-8000-000000000001', 'b2200000-0000-4000-8000-000000000001',
  (select id from public.inventory_counter_memberships where counter_auth_user_id = 'b2600000-0000-4000-8000-000000000002'),
  (select updated_at from public.inventory_count_sessions where id = 'b2400000-0000-4000-8000-000000000001')
);
select public.create_inventory_count_assignment(
  'b2400000-0000-4000-8000-000000000001', 'b2200000-0000-4000-8000-000000000002',
  (select id from public.inventory_counter_memberships where counter_auth_user_id = 'b2600000-0000-4000-8000-000000000004'),
  (select updated_at from public.inventory_count_sessions where id = 'b2400000-0000-4000-8000-000000000001')
);
select public.create_inventory_count_assignment(
  'b2400000-0000-4000-8000-000000000001', 'b2200000-0000-4000-8000-000000000003',
  (select id from public.inventory_counter_memberships where counter_auth_user_id = 'b2600000-0000-4000-8000-000000000006'),
  (select updated_at from public.inventory_count_sessions where id = 'b2400000-0000-4000-8000-000000000001')
);
select public.create_inventory_count_assignment(
  'b2400000-0000-4000-8000-000000000001', 'b2200000-0000-4000-8000-000000000004',
  (select id from public.inventory_counter_memberships where counter_auth_user_id = 'b2600000-0000-4000-8000-000000000008'),
  (select updated_at from public.inventory_count_sessions where id = 'b2400000-0000-4000-8000-000000000001')
);
select public.create_inventory_count_assignment(
  'b2400000-0000-4000-8000-000000000001', 'b2200000-0000-4000-8000-000000000005',
  (select id from public.inventory_counter_memberships where counter_auth_user_id = 'b2600000-0000-4000-8000-000000000009'),
  (select updated_at from public.inventory_count_sessions where id = 'b2400000-0000-4000-8000-000000000001')
);

select public.create_inventory_count_assignment(
  'b2400000-0000-4000-8000-000000000001', 'b2200000-0000-4000-8000-000000000006',
  (select id from public.inventory_counter_memberships where counter_auth_user_id = 'b2600000-0000-4000-8000-00000000000a'),
  (select updated_at from public.inventory_count_sessions where id = 'b2400000-0000-4000-8000-000000000001')
);
reset role;

-- Invalidate one otherwise-authorized replacement profile after authorization.
update public.user_profiles set active = false where id = 'b2600000-0000-4000-8000-00000000000d';

-- Preserve and clear fixtures each contain entered working data.
select set_config('request.jwt.claim.sub', 'b2600000-0000-4000-8000-000000000002', false);
set role authenticated;
select public.inventory_counter_set_count_line_quantity(
  (public.get_inventory_counter_workspace()#>>'{assignments,0,id}')::uuid,
  'b2500000-0000-4000-8000-000000000001', 3, 'Preserve original note',
  (public.get_inventory_counter_workspace()#>>'{assignments,0,revision}')::bigint,
  (public.get_inventory_counter_workspace()#>>'{assignments,0,lines,0,updated_at}')::timestamptz
);
reset role;

select set_config('request.jwt.claim.sub', 'b2600000-0000-4000-8000-000000000004', false);
set role authenticated;
select public.inventory_counter_set_count_line_quantity(
  (public.get_inventory_counter_workspace()#>>'{assignments,0,id}')::uuid,
  'b2500000-0000-4000-8000-000000000002', 4, 'Clear original note',
  (public.get_inventory_counter_workspace()#>>'{assignments,0,revision}')::bigint,
  (public.get_inventory_counter_workspace()#>>'{assignments,0,lines,0,updated_at}')::timestamptz
);
reset role;

-- Returned, accepted, and submitted states exercise their distinct recovery rules.
select set_config('request.jwt.claim.sub', 'b2600000-0000-4000-8000-000000000006', false);
set role authenticated;
select public.inventory_counter_apply_refrigerator_default(
  (public.get_inventory_counter_workspace()#>>'{assignments,0,id}')::uuid, true,
  (public.get_inventory_counter_workspace()#>>'{assignments,0,revision}')::bigint
);
select public.submit_inventory_count_assignment(
  (public.get_inventory_counter_workspace()#>>'{assignments,0,id}')::uuid,
  (public.get_inventory_counter_workspace()#>>'{assignments,0,revision}')::bigint,
  (public.get_inventory_counter_workspace()#>>'{assignments,0,session,updated_at}')::timestamptz
);
reset role;
select set_config('request.jwt.claim.sub', 'b2600000-0000-4000-8000-000000000001', false);
set role authenticated;
select public.return_inventory_count_assignment(
  (select id from public.inventory_count_assignments where location_id = 'b2200000-0000-4000-8000-000000000003' and state <> 'superseded'),
  'Continue the returned recount', 3
);
reset role;

select set_config('request.jwt.claim.sub', 'b2600000-0000-4000-8000-000000000008', false);
set role authenticated;
select public.inventory_counter_apply_refrigerator_default(
  (public.get_inventory_counter_workspace()#>>'{assignments,0,id}')::uuid, true,
  (public.get_inventory_counter_workspace()#>>'{assignments,0,revision}')::bigint
);
select public.submit_inventory_count_assignment(
  (public.get_inventory_counter_workspace()#>>'{assignments,0,id}')::uuid,
  (public.get_inventory_counter_workspace()#>>'{assignments,0,revision}')::bigint,
  (public.get_inventory_counter_workspace()#>>'{assignments,0,session,updated_at}')::timestamptz
);
reset role;
select set_config('request.jwt.claim.sub', 'b2600000-0000-4000-8000-000000000001', false);
set role authenticated;
select public.accept_inventory_count_assignment(
  (select id from public.inventory_count_assignments where location_id = 'b2200000-0000-4000-8000-000000000004' and state <> 'superseded'), 3
);
reset role;

select set_config('request.jwt.claim.sub', 'b2600000-0000-4000-8000-000000000009', false);
set role authenticated;
select public.inventory_counter_apply_refrigerator_default(
  (public.get_inventory_counter_workspace()#>>'{assignments,0,id}')::uuid, true,
  (public.get_inventory_counter_workspace()#>>'{assignments,0,revision}')::bigint
);
select public.submit_inventory_count_assignment(
  (public.get_inventory_counter_workspace()#>>'{assignments,0,id}')::uuid,
  (public.get_inventory_counter_workspace()#>>'{assignments,0,revision}')::bigint,
  (public.get_inventory_counter_workspace()#>>'{assignments,0,session,updated_at}')::timestamptz
);
reset role;

-- Build one approved-history assignment in the second organization.
select set_config('request.jwt.claim.sub', 'f2600000-0000-4000-8000-000000000001', false);
set role authenticated;
select public.set_inventory_counter_membership('f2600000-0000-4000-8000-000000000002', true);
select public.set_inventory_counter_membership('f2600000-0000-4000-8000-000000000003', true);
select public.create_inventory_count_assignment(
  'f2400000-0000-4000-8000-000000000001', 'f2200000-0000-4000-8000-000000000001',
  (select id from public.inventory_counter_memberships where counter_auth_user_id = 'f2600000-0000-4000-8000-000000000002'),
  (select updated_at from public.inventory_count_sessions where id = 'f2400000-0000-4000-8000-000000000001')
);
reset role;
select set_config('request.jwt.claim.sub', 'f2600000-0000-4000-8000-000000000002', false);
set role authenticated;
select public.inventory_counter_apply_refrigerator_default(
  (public.get_inventory_counter_workspace()#>>'{assignments,0,id}')::uuid, true,
  (public.get_inventory_counter_workspace()#>>'{assignments,0,revision}')::bigint
);
select public.submit_inventory_count_assignment(
  (public.get_inventory_counter_workspace()#>>'{assignments,0,id}')::uuid,
  (public.get_inventory_counter_workspace()#>>'{assignments,0,revision}')::bigint,
  (public.get_inventory_counter_workspace()#>>'{assignments,0,session,updated_at}')::timestamptz
);
reset role;
select set_config('request.jwt.claim.sub', 'f2600000-0000-4000-8000-000000000001', false);
set role authenticated;
select public.accept_inventory_count_assignment(
  (select id from public.inventory_count_assignments where session_id = 'f2400000-0000-4000-8000-000000000001'), 3
);
select public.complete_inventory_count_location('f2400000-0000-4000-8000-000000000001', 'f2200000-0000-4000-8000-000000000001');
select public.complete_inventory_count_session('f2400000-0000-4000-8000-000000000001', 'Final replacement fixture complete');
select public.approve_inventory_count_session('f2400000-0000-4000-8000-000000000001', 'Final replacement fixture approved');
reset role;

-- Isolated Phase 9G-B counter workflow fixtures.
begin;

insert into auth.users (id) values
  ('7b600000-0000-4000-8000-000000000001'),
  ('7b600000-0000-4000-8000-000000000002'),
  ('7b600000-0000-4000-8000-000000000003'),
  ('e6000000-0000-4000-8000-000000000001'),
  ('e6000000-0000-4000-8000-000000000002');

insert into public.organizations (id, name, slug) values
  ('7b000000-0000-4000-8000-000000000001', 'Phase 9G-B Counter Organization D', 'phase9gb-counter-d'),
  ('e0000000-0000-4000-8000-000000000001', 'Phase 9G-B Counter Organization E', 'phase9gb-counter-e');

insert into public.user_profiles (
  id, organization_id, display_name, role, active, is_shared_device
) values
  ('7b600000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000001', 'Counter Fixture Manager D', 'manager', true, false),
  ('7b600000-0000-4000-8000-000000000002', '7b000000-0000-4000-8000-000000000001', 'Counter Fixture One', 'counter', true, false),
  ('7b600000-0000-4000-8000-000000000003', '7b000000-0000-4000-8000-000000000001', 'Counter Fixture Two', 'counter', true, false),
  ('e6000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Counter Fixture Manager E', 'manager', true, false),
  ('e6000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'Counter Fixture Cross Org', 'counter', true, false);

insert into public.inventory_products (
  id, organization_id, name, short_name, sku, category, unit_label, active, sort_order,
  count_mode, container_capacity_liters, millum_item_ref, ownership_status,
  created_by_auth_user_id, updated_by_auth_user_id
) values
  ('7b100000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000001', 'Counter Unit Product', 'Unit drink', 'COUNTER-D-UNIT', 'Beer', 'bottles', true, 1, 'unit', null, 'D-UNIT-1', 'owned', '7b600000-0000-4000-8000-000000000001', '7b600000-0000-4000-8000-000000000001'),
  ('7b100000-0000-4000-8000-000000000002', '7b000000-0000-4000-8000-000000000001', 'Counter Bottle Product', 'House wine', 'COUNTER-D-BOTTLE', 'Wine', 'bottles', true, 2, 'container_plus_volume', 0.7, 'D-BOTTLE-2', 'owned', '7b600000-0000-4000-8000-000000000001', '7b600000-0000-4000-8000-000000000001'),
  ('7b100000-0000-4000-8000-000000000003', '7b000000-0000-4000-8000-000000000001', 'Counter Other Product', 'Other drink', 'COUNTER-D-OTHER', 'Soft drinks', 'bottles', true, 3, 'unit', null, 'D-OTHER-3', 'owned', '7b600000-0000-4000-8000-000000000001', '7b600000-0000-4000-8000-000000000001'),
  ('e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Cross Org Counter Product', 'Cross org drink', 'COUNTER-E-UNIT', 'Beer', 'bottles', true, 1, 'unit', null, 'E-UNIT-1', 'owned', 'e6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001');

insert into public.inventory_locations (
  id, organization_id, name, code, location_type, active, sort_order,
  created_by_auth_user_id, updated_by_auth_user_id
) values
  ('7b200000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000001', 'Counter D Left Fridge', 'CORNERBAR_LEFT_FRIDGE', 'fridge', true, 1, '7b600000-0000-4000-8000-000000000001', '7b600000-0000-4000-8000-000000000001'),
  ('7b200000-0000-4000-8000-000000000002', '7b000000-0000-4000-8000-000000000001', 'Counter D Right Fridge', 'CORNERBAR_RIGHT_FRIDGE', 'fridge', true, 2, '7b600000-0000-4000-8000-000000000001', '7b600000-0000-4000-8000-000000000001'),
  ('e2000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Counter E Left Fridge', 'CORNERBAR_LEFT_FRIDGE', 'fridge', true, 1, 'e6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001');

insert into public.inventory_location_products (
  id, organization_id, location_id, product_id, par_quantity, count_order,
  active, stock_policy, created_by_auth_user_id, updated_by_auth_user_id
) values
  ('7b300000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000001', '7b200000-0000-4000-8000-000000000001', '7b100000-0000-4000-8000-000000000001', 10, 1, true, 'exact_par', '7b600000-0000-4000-8000-000000000001', '7b600000-0000-4000-8000-000000000001'),
  ('7b300000-0000-4000-8000-000000000002', '7b000000-0000-4000-8000-000000000001', '7b200000-0000-4000-8000-000000000001', '7b100000-0000-4000-8000-000000000002', 1.4, 2, true, 'exact_par', '7b600000-0000-4000-8000-000000000001', '7b600000-0000-4000-8000-000000000001'),
  ('7b300000-0000-4000-8000-000000000003', '7b000000-0000-4000-8000-000000000001', '7b200000-0000-4000-8000-000000000002', '7b100000-0000-4000-8000-000000000003', 8, 1, true, 'exact_par', '7b600000-0000-4000-8000-000000000001', '7b600000-0000-4000-8000-000000000001'),
  ('e3000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 6, 1, true, 'exact_par', 'e6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001');

insert into public.inventory_count_sessions (
  id, organization_id, title, count_type, status, count_date,
  started_by_auth_user_id, started_by_name
) values
  ('7b400000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000001', 'Phase 9G-B Counter Count D', 'daily', 'in_progress', current_date, '7b600000-0000-4000-8000-000000000001', 'Counter Fixture Manager D'),
  ('e4000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Phase 9G-B Counter Count E', 'daily', 'in_progress', current_date, 'e6000000-0000-4000-8000-000000000001', 'Counter Fixture Manager E');

insert into public.inventory_count_lines (
  id, organization_id, session_id, location_id, product_id,
  product_name_snapshot, location_name_snapshot, unit_label_snapshot,
  category_snapshot, location_sort_order_snapshot, count_order_snapshot,
  product_sort_order_snapshot, par_quantity_snapshot, stock_policy_snapshot
) values
  ('7b500000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000001', '7b400000-0000-4000-8000-000000000001', '7b200000-0000-4000-8000-000000000001', '7b100000-0000-4000-8000-000000000001', 'Counter Unit Product', 'Counter D Left Fridge', 'bottles', 'Beer', 1, 1, 1, 10, 'exact_par'),
  ('7b500000-0000-4000-8000-000000000002', '7b000000-0000-4000-8000-000000000001', '7b400000-0000-4000-8000-000000000001', '7b200000-0000-4000-8000-000000000001', '7b100000-0000-4000-8000-000000000002', 'Counter Bottle Product', 'Counter D Left Fridge', 'L', 'Wine', 1, 2, 2, 1.4, 'exact_par'),
  ('7b500000-0000-4000-8000-000000000003', '7b000000-0000-4000-8000-000000000001', '7b400000-0000-4000-8000-000000000001', '7b200000-0000-4000-8000-000000000002', '7b100000-0000-4000-8000-000000000003', 'Counter Other Product', 'Counter D Right Fridge', 'bottles', 'Soft drinks', 2, 1, 3, 8, 'exact_par'),
  ('e5000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'Cross Org Counter Product', 'Counter E Left Fridge', 'bottles', 'Beer', 1, 1, 1, 6, 'exact_par');

commit;

select set_config('request.jwt.claim.sub', '7b600000-0000-4000-8000-000000000001', false);
set role authenticated;
select public.set_inventory_counter_membership('7b600000-0000-4000-8000-000000000002', true);
select public.set_inventory_counter_membership('7b600000-0000-4000-8000-000000000003', true);
select public.create_inventory_count_assignment(
  '7b400000-0000-4000-8000-000000000001',
  '7b200000-0000-4000-8000-000000000001',
  (select id from public.inventory_counter_memberships where counter_auth_user_id = '7b600000-0000-4000-8000-000000000002'),
  (select updated_at from public.inventory_count_sessions where id = '7b400000-0000-4000-8000-000000000001')
);
select public.create_inventory_count_assignment(
  '7b400000-0000-4000-8000-000000000001',
  '7b200000-0000-4000-8000-000000000002',
  (select id from public.inventory_counter_memberships where counter_auth_user_id = '7b600000-0000-4000-8000-000000000003'),
  (select updated_at from public.inventory_count_sessions where id = '7b400000-0000-4000-8000-000000000001')
);
reset role;

select set_config('request.jwt.claim.sub', 'e6000000-0000-4000-8000-000000000001', false);
set role authenticated;
select public.set_inventory_counter_membership('e6000000-0000-4000-8000-000000000002', true);
select public.create_inventory_count_assignment(
  'e4000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  (select id from public.inventory_counter_memberships where counter_auth_user_id = 'e6000000-0000-4000-8000-000000000002'),
  (select updated_at from public.inventory_count_sessions where id = 'e4000000-0000-4000-8000-000000000001')
);
reset role;

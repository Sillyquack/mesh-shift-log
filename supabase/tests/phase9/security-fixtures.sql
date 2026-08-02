-- Disposable Phase 9 security fixtures. These UUIDs and rows are test-only.
begin;

insert into auth.users (id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000004'),
  ('10000000-0000-4000-8000-000000000005'),
  ('10000000-0000-4000-8000-000000000006'),
  ('10000000-0000-4000-8000-000000000007'),
  ('10000000-0000-4000-8000-000000000008'),
  ('20000000-0000-4000-8000-000000000001');

insert into public.organizations (id, name, slug) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Phase 9 Test Organization A', 'phase9-test-a'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'Phase 9 Test Organization B', 'phase9-test-b');

insert into public.user_profiles (
  id, organization_id, display_name, role, active, is_shared_device, shared_device_label
) values
  ('10000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Organization A Manager', 'manager', true, false, null),
  ('10000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Organization A Staff', 'staff', true, false, null),
  ('10000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Organization A Shift Lead', 'shift_lead', true, false, null),
  ('10000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Organization A Event Floor Manager', 'event_floor_manager', true, false, null),
  ('10000000-0000-4000-8000-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Organization A Time2Staff', 'time2staff', true, false, null),
  ('10000000-0000-4000-8000-000000000006', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Organization A Shared Manager', 'manager', true, true, 'Shared manager fixture'),
  ('10000000-0000-4000-8000-000000000007', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Organization A Inactive Manager', 'manager', false, false, null),
  ('10000000-0000-4000-8000-000000000008', null, 'Null Organization Manager', 'manager', true, false, null),
  ('20000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'Organization B Manager', 'manager', true, false, null);

insert into public.inventory_products (
  id, organization_id, name, sku, category, unit_label, active, sort_order,
  created_by_auth_user_id, updated_by_auth_user_id
) values
  ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Organization A Product', 'PHASE9-A', 'Test', 'piece', true, 1, '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'Organization B Product', 'PHASE9-B', 'Test', 'piece', true, 1, '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');

insert into public.inventory_locations (
  id, organization_id, name, code, location_type, active, sort_order,
  created_by_auth_user_id, updated_by_auth_user_id
) values
  ('a2000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Organization A Location', 'PHASE9_LOC_A', 'storage', true, 1, '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('b2000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'Organization B Location', 'PHASE9_LOC_B', 'storage', true, 1, '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');

insert into public.inventory_location_products (
  id, organization_id, location_id, product_id, par_quantity, count_order,
  active, stock_policy, created_by_auth_user_id, updated_by_auth_user_id
) values
  ('a3000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 10, 1, true, 'exact_par', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('b3000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 20, 1, true, 'exact_par', '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');

insert into public.inventory_count_sessions (
  id, organization_id, title, count_type, status, count_date,
  started_by_auth_user_id, started_by_name
) values
  ('a4000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Organization A Count', 'daily', 'in_progress', current_date, '10000000-0000-4000-8000-000000000001', 'Organization A Manager'),
  ('b4000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'Organization B Count', 'daily', 'in_progress', current_date, '20000000-0000-4000-8000-000000000001', 'Organization B Manager');

insert into public.inventory_count_lines (
  id, organization_id, session_id, location_id, product_id,
  product_name_snapshot, location_name_snapshot, unit_label_snapshot,
  category_snapshot, par_quantity_snapshot, stock_policy_snapshot
) values
  ('a5000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Organization A Product', 'Organization A Location', 'piece', 'Test', 10, 'exact_par'),
  ('b5000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'b4000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'Organization B Product', 'Organization B Location', 'piece', 'Test', 20, 'exact_par');

commit;

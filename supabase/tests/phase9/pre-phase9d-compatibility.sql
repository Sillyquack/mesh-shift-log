-- A Phase 9C-shaped approved record used to prove additive Phase 9D backfill.
insert into auth.users (id) values ('40000000-0000-4000-8000-000000000001');
insert into public.organizations (id, name, slug) values
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'Phase 9D Compatibility Organization', 'phase9d-compatibility');
insert into public.user_profiles (
  id, organization_id, display_name, role, active, is_shared_device
) values (
  '40000000-0000-4000-8000-000000000001', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
  'Compatibility Manager', 'manager', true, false
);
insert into public.inventory_products (
  id, organization_id, name, sku, category, unit_label, active,
  created_by_auth_user_id, updated_by_auth_user_id
) values (
  'd1000000-0000-4000-8000-000000000001', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
  'Compatibility Product', 'PHASE9-D', 'Test', 'piece', true,
  '40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001'
);
insert into public.inventory_locations (
  id, organization_id, name, code, location_type, active,
  created_by_auth_user_id, updated_by_auth_user_id
) values (
  'd2000000-0000-4000-8000-000000000001', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
  'Compatibility Location', 'PHASE9_LOC_D', 'storage', true,
  '40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001'
);
insert into public.inventory_count_sessions (
  id, organization_id, title, count_type, status, count_date,
  started_by_auth_user_id, started_by_name,
  completed_at, completed_by_auth_user_id, completed_by_name, completion_note,
  approved_at, approved_by_auth_user_id, approved_by_name, approval_note, metadata
) values (
  'd4000000-0000-4000-8000-000000000001', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
  'Pre-Phase 9D approved count', 'daily', 'approved', current_date,
  '40000000-0000-4000-8000-000000000001', 'Compatibility Manager',
  now() - interval '2 hours', '40000000-0000-4000-8000-000000000001', 'Compatibility Manager', 'Legacy review',
  now() - interval '1 hour', '40000000-0000-4000-8000-000000000001', 'Compatibility Manager', 'Legacy approval',
  jsonb_build_object(
    'reopenHistory', jsonb_build_array(jsonb_build_object('reason', 'Legacy preserved audit')),
    'completionExceptions', jsonb_build_object('allowed', false, 'uncounted', 0, 'needsReview', 0, 'incompleteLocations', 0)
  )
);
insert into public.inventory_count_lines (
  id, organization_id, session_id, location_id, product_id,
  product_name_snapshot, location_name_snapshot, unit_label_snapshot,
  category_snapshot, par_quantity_snapshot, stock_policy_snapshot,
  counted_quantity, count_method, count_status, counted_at,
  counted_by_auth_user_id, counted_by_name
) values (
  'd5000000-0000-4000-8000-000000000001', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
  'd4000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001', 'Compatibility Product', 'Compatibility Location',
  'piece', 'Test', 4, 'exact_par', 4, 'manual', 'counted', now() - interval '2 hours',
  '40000000-0000-4000-8000-000000000001', 'Compatibility Manager'
);

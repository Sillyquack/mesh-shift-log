-- Executable Phase 9E product-identity fixtures and assertions.
create schema phase9_identity_test;
revoke all on schema phase9_identity_test from public;
grant usage on schema phase9_identity_test to authenticated;

create function phase9_identity_test.assert_true(condition boolean, label text)
returns void
language plpgsql
as $$
begin
  if condition is not true then raise exception 'FAIL %', label; end if;
  raise notice 'PASS %', label;
end;
$$;
revoke all on function phase9_identity_test.assert_true(boolean, text) from public;
grant execute on function phase9_identity_test.assert_true(boolean, text) to authenticated;

insert into auth.users (id) values ('f0000000-0000-4000-8000-000000000001');
insert into public.organizations (id, name, slug) values
  ('ffffffff-ffff-4fff-8fff-fffffffffff1', 'Phase 9E Identity Organization', 'phase9e-identity');
insert into public.user_profiles (
  id, organization_id, display_name, role, active, is_shared_device
) values (
  'f0000000-0000-4000-8000-000000000001',
  'ffffffff-ffff-4fff-8fff-fffffffffff1',
  'Phase 9E Identity Manager', 'manager', true, false
);
insert into public.inventory_products (
  id, organization_id, name, sku, category, unit_label, active,
  created_by_auth_user_id, updated_by_auth_user_id
) values
  ('f1000000-0000-4000-8000-000000000001', 'ffffffff-ffff-4fff-8fff-fffffffffff1', 'Identical display', 'IDENTITY-A', 'Test', 'bottle', true, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000002', 'ffffffff-ffff-4fff-8fff-fffffffffff1', 'Identical display', 'IDENTITY-B', 'Test', 'bottle', true, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001');
insert into public.inventory_products (
  id, organization_id, name, sku, category, unit_label, active,
  created_by_auth_user_id, updated_by_auth_user_id
) values (
  'b1000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  'Identical display', 'IDENTITY-OTHER-ORG', 'Test', 'bottle', true,
  '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'
);
insert into public.inventory_locations (
  id, organization_id, name, code, location_type, active,
  created_by_auth_user_id, updated_by_auth_user_id
) values (
  'f2000000-0000-4000-8000-000000000001', 'ffffffff-ffff-4fff-8fff-fffffffffff1',
  'Identity location', 'IDENTITY_LOC', 'storage', true,
  'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001'
);
insert into public.inventory_location_products (
  id, organization_id, location_id, product_id, par_quantity, count_order,
  active, stock_policy, created_by_auth_user_id, updated_by_auth_user_id
) values
  ('f3000000-0000-4000-8000-000000000001', 'ffffffff-ffff-4fff-8fff-fffffffffff1', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 10, 1, true, 'exact_par', 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001'),
  ('f3000000-0000-4000-8000-000000000002', 'ffffffff-ffff-4fff-8fff-fffffffffff1', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002', 12, 2, true, 'exact_par', 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001');
insert into public.inventory_count_sessions (
  id, organization_id, title, count_type, status, count_date,
  started_by_auth_user_id, started_by_name
) values (
  'f4000000-0000-4000-8000-000000000001', 'ffffffff-ffff-4fff-8fff-fffffffffff1',
  'Phase 9E same-label count', 'daily', 'in_progress', current_date,
  'f0000000-0000-4000-8000-000000000001', 'Phase 9E Identity Manager'
);
insert into public.inventory_count_lines (
  id, organization_id, session_id, location_id, product_id,
  product_name_snapshot, location_name_snapshot, unit_label_snapshot,
  category_snapshot, par_quantity_snapshot, counted_quantity, count_method,
  count_status, counted_at, counted_by_auth_user_id, counted_by_name
) values
  ('f5000000-0000-4000-8000-000000000001', 'ffffffff-ffff-4fff-8fff-fffffffffff1', 'f4000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'Identical display', 'Identity location', 'bottle', 'Test', 10, 2, 'manual', 'counted', now(), 'f0000000-0000-4000-8000-000000000001', 'Phase 9E Identity Manager'),
  ('f5000000-0000-4000-8000-000000000002', 'ffffffff-ffff-4fff-8fff-fffffffffff1', 'f4000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002', 'Identical display', 'Identity location', 'bottle', 'Test', 12, 7, 'manual', 'counted', now(), 'f0000000-0000-4000-8000-000000000001', 'Phase 9E Identity Manager');
update public.inventory_count_sessions
set status = 'completed', completed_at = now(),
    completed_by_auth_user_id = 'f0000000-0000-4000-8000-000000000001',
    completed_by_name = 'Phase 9E Identity Manager',
    finalized_by_auth_user_id = 'f0000000-0000-4000-8000-000000000001',
    finalized_by_name = 'Phase 9E Identity Manager', finalized_at = now()
where id = 'f4000000-0000-4000-8000-000000000001';
update public.inventory_count_sessions
set status = 'approved', approved_at = now(),
    approved_by_auth_user_id = 'f0000000-0000-4000-8000-000000000001',
    approved_by_name = 'Phase 9E Identity Manager'
where id = 'f4000000-0000-4000-8000-000000000001';

select phase9_identity_test.assert_true(
  has_column_privilege('authenticated', 'public.inventory_count_lines', 'product_id', 'SELECT')
  and not has_column_privilege('anon', 'public.inventory_count_lines', 'product_id', 'SELECT'),
  'DB-IDENTITY-1: product ID is explicitly readable only through the authenticated count-line surface'
);
select phase9_identity_test.assert_true(
  not has_function_privilege('authenticated', 'public.inventory_count_line_client_record(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.inventory_count_line_client_record(uuid)', 'EXECUTE'),
  'DB-IDENTITY-2: the sanitized line helper remains internal'
);
select phase9_identity_test.assert_true(
  not exists (
    select 1 from public.inventory_count_lines line
    left join public.inventory_products product
      on product.id = line.product_id and product.organization_id = line.organization_id
    where line.product_id is null or product.id is null
  ),
  'DB-IDENTITY-3: every count line has a valid organization-scoped product identity'
);
select phase9_identity_test.assert_true(
  (select count(distinct product_id) = 2
     and min(product_name_snapshot) = max(product_name_snapshot)
     and min(unit_label_snapshot) = max(unit_label_snapshot)
   from public.inventory_count_lines
   where session_id = 'f4000000-0000-4000-8000-000000000001')
  and (select count(*) = 2 and min(par_quantity) = 10 and max(par_quantity) = 12
       from public.inventory_location_products
       where organization_id = 'ffffffff-ffff-4fff-8fff-fffffffffff1'),
  'DB-IDENTITY-4: same-name and same-unit products remain distinct count lines'
);

select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000001', false);
select phase9_identity_test.assert_true(
  public.inventory_count_line_client_record('f5000000-0000-4000-8000-000000000001')->>'product_id'
    = 'f1000000-0000-4000-8000-000000000001',
  'DB-IDENTITY-5: guarded mutation records include the authoritative product ID'
);
set role authenticated;
select phase9_identity_test.assert_true(
  (select count(*) = 2 and count(distinct product_id) = 2
   from public.inventory_count_lines
   where session_id = 'f4000000-0000-4000-8000-000000000001')
  and not exists (
    select 1 from public.inventory_products
    where id = 'b1000000-0000-4000-8000-000000000002'
  ),
  'DB-IDENTITY-6: authenticated reads retain both same-display products and exclude the other organization'
);
select public.create_inventory_correction_session(
  'f4000000-0000-4000-8000-000000000001',
  'Verify stable product identity copying',
  'f9000000-0000-4000-8000-000000000001'
);
reset role;

select phase9_identity_test.assert_true(
  (select count(*) = 2 and count(distinct correction.product_id) = 2
   from public.inventory_count_lines correction
   join public.inventory_count_sessions session on session.id = correction.session_id
   where session.idempotency_key = 'f9000000-0000-4000-8000-000000000001'
     and correction.product_id in (
       'f1000000-0000-4000-8000-000000000001',
       'f1000000-0000-4000-8000-000000000002'
     )
     and correction.counted_quantity is null
     and correction.product_name_snapshot = 'Identical display'
     and correction.unit_label_snapshot = 'bottle'),
  'DB-IDENTITY-7: corrections copy both product IDs and snapshots while resetting quantities'
);
select phase9_identity_test.assert_true(
  (select array_agg(counted_quantity order by product_id) = array[2, 7]::numeric[]
   from public.inventory_count_lines
   where session_id = 'f4000000-0000-4000-8000-000000000001'),
  'DB-IDENTITY-8: identity adoption does not rewrite approved historical quantities'
);

set role authenticated;
select public.cancel_inventory_count_session(
  (select id from public.inventory_count_sessions
   where original_session_id = 'f4000000-0000-4000-8000-000000000001'
     and status = 'in_progress'),
  'Phase 9E identity fixture complete'
);
reset role;
drop schema phase9_identity_test cascade;

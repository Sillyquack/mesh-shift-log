-- Disposable manager-only Millum export fixtures. Never applied outside tests.
begin;

insert into auth.users (id) values
  ('91000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000001');
insert into public.organizations (id, name, slug) values
  ('93000000-0000-4000-8000-000000000001', 'Phase 9 Millum Draft Organization', 'phase9-millum-draft');
insert into public.user_profiles (
  id, organization_id, display_name, role, active, is_shared_device
) values
  (
  '91000000-0000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'Organization A Counter', 'counter', true, false
  ),
  (
  '92000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  'Millum Draft Manager', 'manager', true, false
  );

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select public.setup_mesh_youngstorget_inventory_locations();
reset role;

select inventory_private.inventory_install_millum_profile_v1(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '10000000-0000-4000-8000-000000000001'
);

set local session_replication_role = replica;

insert into public.inventory_count_sessions (
  id, organization_id, title, count_type, status, count_date, started_at,
  completed_at, approved_at, started_by_auth_user_id, started_by_name,
  completed_by_auth_user_id, completed_by_name, approved_by_auth_user_id, approved_by_name,
  finalized_by_auth_user_id, finalized_by_name, finalized_at
) values
  ('9a100000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Millum approved anchor', 'monthly', 'approved', '2026-08-03', '2026-08-03T08:00:00Z', '2026-08-03T09:00:00Z', '2026-08-03T09:15:00Z', '10000000-0000-4000-8000-000000000001', 'Organization A Manager', '10000000-0000-4000-8000-000000000001', 'Organization A Manager', '10000000-0000-4000-8000-000000000001', 'Organization A Manager', '10000000-0000-4000-8000-000000000001', 'Organization A Manager', '2026-08-03T09:00:00Z'),
  ('9a100000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Millum approved partial', 'monthly', 'approved', '2026-08-04', '2026-08-04T08:00:00Z', '2026-08-04T09:00:00Z', '2026-08-04T09:15:00Z', '10000000-0000-4000-8000-000000000001', 'Organization A Manager', '10000000-0000-4000-8000-000000000001', 'Organization A Manager', '10000000-0000-4000-8000-000000000001', 'Organization A Manager', '10000000-0000-4000-8000-000000000001', 'Organization A Manager', '2026-08-04T09:00:00Z'),
  ('9a100000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Millum approved missing', 'monthly', 'approved', '2026-08-05', '2026-08-05T08:00:00Z', '2026-08-05T09:00:00Z', '2026-08-05T09:15:00Z', '10000000-0000-4000-8000-000000000001', 'Organization A Manager', '10000000-0000-4000-8000-000000000001', 'Organization A Manager', '10000000-0000-4000-8000-000000000001', 'Organization A Manager', '10000000-0000-4000-8000-000000000001', 'Organization A Manager', '2026-08-05T09:00:00Z'),
  ('9a100000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Millum approved extra', 'monthly', 'approved', '2026-08-06', '2026-08-06T08:00:00Z', '2026-08-06T09:00:00Z', '2026-08-06T09:15:00Z', '10000000-0000-4000-8000-000000000001', 'Organization A Manager', '10000000-0000-4000-8000-000000000001', 'Organization A Manager', '10000000-0000-4000-8000-000000000001', 'Organization A Manager', '10000000-0000-4000-8000-000000000001', 'Organization A Manager', '2026-08-06T09:00:00Z'),
  ('9c100000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', 'Millum draft rejected', 'monthly', 'draft', '2026-08-06', '2026-08-06T08:00:00Z', null, null, '92000000-0000-4000-8000-000000000001', 'Millum Draft Manager', null, null, null, null, null, null, null);

with profile as (
  select id from public.inventory_millum_export_profiles
  where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    and profile_key = 'my-work-bar-jul' and profile_version = 1
), mapped as (
  select distinct on (row.mapped_product_id)
    row.mapped_product_id as product_id, row.item_number, row.official_name
  from public.inventory_millum_export_rows row, profile
  where row.profile_id = profile.id and row.enabled and row.mapped_product_id is not null
  order by row.mapped_product_id, row.group_order, row.row_order
)
insert into public.inventory_count_lines (
  organization_id, session_id, location_id, product_id,
  product_name_snapshot, location_name_snapshot, unit_label_snapshot, category_snapshot,
  par_quantity_snapshot, stock_policy_snapshot, count_mode_snapshot,
  container_capacity_liters_snapshot, counted_whole_units, counted_open_volume_liters,
  counted_full_kegs, counted_partial_keg_fraction, counted_quantity,
  count_method, count_status, note, counted_at, counted_by_name
)
select
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  session.id,
  'a2000000-0000-4000-8000-000000000001',
  mapped.product_id,
  mapped.official_name,
  'Organization A Location',
  product.unit_label,
  product.category,
  0, 'exact_par',
  case
    when mapped.item_number = '4000232' and session.id in ('9a100000-0000-4000-8000-000000000001', '9a100000-0000-4000-8000-000000000002') then 'container_plus_volume'
    when mapped.item_number = '4054613' then 'keg_fraction'
    else 'unit'
  end,
  case when mapped.item_number = '4000232' and session.id in ('9a100000-0000-4000-8000-000000000001', '9a100000-0000-4000-8000-000000000002') then 0.75 else null end,
  case when mapped.item_number = '4000232' and session.id = '9a100000-0000-4000-8000-000000000001' then 23
       when mapped.item_number = '4000232' and session.id = '9a100000-0000-4000-8000-000000000002' then 14 else null end,
  case when mapped.item_number = '4000232' and session.id in ('9a100000-0000-4000-8000-000000000001', '9a100000-0000-4000-8000-000000000002') then 0.75 else null end,
  case when mapped.item_number = '4054613' then 2 else null end,
  case when mapped.item_number = '4054613' then 0.5 else null end,
  case
    when mapped.item_number = '4000232' and session.id = '9a100000-0000-4000-8000-000000000001' then 18
    when mapped.item_number = '4000232' and session.id = '9a100000-0000-4000-8000-000000000002' then 11.25
    when mapped.item_number = '4057913' and session.id = '9a100000-0000-4000-8000-000000000001' then 160
    when mapped.item_number = '4057913' and session.id = '9a100000-0000-4000-8000-000000000002' then 150
    when mapped.item_number = '4004935' then 232
    when mapped.item_number = '4054613' then 2.5
    when mapped.item_number = '131125' then 0
    else 1
  end,
  'manual', 'counted',
  case when mapped.item_number = '707000631' then 'Fixture note must not affect export.' else null end,
  session.approved_at - interval '30 minutes', 'Organization A Manager'
from mapped
join public.inventory_products product on product.id = mapped.product_id
cross join (
  select id, approved_at from public.inventory_count_sessions
  where id in (
    '9a100000-0000-4000-8000-000000000001',
    '9a100000-0000-4000-8000-000000000002',
    '9a100000-0000-4000-8000-000000000004'
  )
) session;

with profile as (
  select id from public.inventory_millum_export_profiles
  where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    and profile_key = 'my-work-bar-jul' and profile_version = 1
), mapped as (
  select distinct on (row.mapped_product_id)
    row.mapped_product_id as product_id, row.item_number, row.official_name
  from public.inventory_millum_export_rows row, profile
  where row.profile_id = profile.id and row.enabled and row.mapped_product_id is not null
    and row.item_number <> '9082515'
  order by row.mapped_product_id, row.group_order, row.row_order
)
insert into public.inventory_count_lines (
  organization_id, session_id, location_id, product_id,
  product_name_snapshot, location_name_snapshot, unit_label_snapshot, category_snapshot,
  par_quantity_snapshot, stock_policy_snapshot, counted_quantity,
  count_method, count_status, counted_at, counted_by_name
)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '9a100000-0000-4000-8000-000000000003',
  'a2000000-0000-4000-8000-000000000001', mapped.product_id, mapped.official_name,
  'Organization A Location', product.unit_label, product.category, 0, 'exact_par', 1,
  'manual', 'counted', '2026-08-05T08:30:00Z', 'Organization A Manager'
from mapped join public.inventory_products product on product.id = mapped.product_id;

insert into public.inventory_count_lines (
  organization_id, session_id, location_id, product_id,
  product_name_snapshot, location_name_snapshot, unit_label_snapshot, category_snapshot,
  par_quantity_snapshot, stock_policy_snapshot, counted_quantity,
  count_method, count_status, counted_at, counted_by_name
)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '9a100000-0000-4000-8000-000000000004',
  'a2000000-0000-4000-8000-000000000001', product.id, product.name,
  'Organization A Location', product.unit_label, product.category, 0, 'exact_par', 7,
  'manual', 'counted', '2026-08-06T08:30:00Z', 'Organization A Manager'
from public.inventory_products product
where product.organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and product.millum_item_ref = '1216399';

set local session_replication_role = origin;
commit;

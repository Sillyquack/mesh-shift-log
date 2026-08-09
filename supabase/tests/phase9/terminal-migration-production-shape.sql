-- Disposable production-shape prerequisite for the one-time Phase 9L-9P migrations.
-- Never applied outside the network-isolated Phase 9 security verifier.
begin;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select public.setup_mesh_youngstorget_inventory_locations();
reset role;

insert into public.inventory_storage_settings (
  organization_id, target_multiplier, rule_version,
  created_by_auth_user_id, updated_by_auth_user_id
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 3, 'refrigerator-targets-v1',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001'
) on conflict (organization_id) do nothing;

update public.inventory_locations
set countable = true
where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and active
  and location_type = 'fridge';

update public.inventory_location_products standard
set contributes_to_storage_target = true
from public.inventory_locations location
where location.id = standard.location_id
  and standard.organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and location.organization_id = standard.organization_id
  and location.active and location.countable and location.location_type = 'fridge'
  and standard.active and standard.stock_policy = 'exact_par';

update public.inventory_storage_settings
set location_scope_initialized_at = now()
where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and location_scope_initialized_at is null;

select inventory_private.inventory_install_millum_profile_v1(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '10000000-0000-4000-8000-000000000001'
);
select inventory_private.inventory_install_millum_profile_v2(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.inventory_locations (
  id, organization_id, name, code, location_type, active, countable, sort_order,
  created_by_auth_user_id, updated_by_auth_user_id
) values (
  '9a200000-0000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'Main Storage', 'MAIN_STORAGE', 'storage', true, true, 40,
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001'
) on conflict (id) do nothing;

set local session_replication_role = replica;

insert into public.inventory_count_sessions (
  id, organization_id, title, count_type, status, count_date, started_at,
  completed_at, approved_at, started_by_auth_user_id, started_by_name,
  completed_by_auth_user_id, completed_by_name, approved_by_auth_user_id, approved_by_name,
  finalized_by_auth_user_id, finalized_by_name, finalized_at
) values (
  '9e100000-0000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'August stock count - Bar Shelves and Main Storage - 2026-08-04',
  'monthly', 'approved', '2026-08-04', '2026-08-04T08:00:00Z',
  '2026-08-04T09:00:00Z', '2026-08-04T09:15:00Z',
  '10000000-0000-4000-8000-000000000001', 'Organization A Manager',
  '10000000-0000-4000-8000-000000000001', 'Organization A Manager',
  '10000000-0000-4000-8000-000000000001', 'Organization A Manager',
  '10000000-0000-4000-8000-000000000001', 'Organization A Manager',
  '2026-08-04T09:00:00Z'
);

with profile as (
  select id
  from public.inventory_millum_export_profiles
  where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    and profile_key = 'my-work-bar-jul'
    and profile_version = 2
), mapped as (
  select distinct on (row.mapped_product_id)
    row.mapped_product_id as product_id,
    row.official_name
  from public.inventory_millum_export_rows row, profile
  where row.profile_id = profile.id
    and row.enabled
    and row.mapped_product_id is not null
  order by row.mapped_product_id, row.group_order, row.row_order
)
insert into public.inventory_count_lines (
  organization_id, session_id, location_id, product_id,
  product_name_snapshot, location_name_snapshot, unit_label_snapshot, category_snapshot,
  par_quantity_snapshot, stock_policy_snapshot, count_mode_snapshot,
  counted_quantity, count_method, count_status, counted_at, counted_by_name
)
select
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '9e100000-0000-4000-8000-000000000001',
  '9a200000-0000-4000-8000-000000000001',
  mapped.product_id,
  mapped.official_name,
  'Main Storage',
  product.unit_label,
  product.category,
  0, 'physical_count_only', 'unit',
  0, 'manual', 'counted', '2026-08-04T08:30:00Z', 'Organization A Manager'
from mapped
join public.inventory_products product on product.id = mapped.product_id;

insert into public.inventory_locations (
  id, organization_id, name, code, location_type, active, countable, sort_order,
  created_by_auth_user_id, updated_by_auth_user_id
)
select
  md5('phase9-terminal-location-' || fixture.ordinal)::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'Terminal fixture location ' || fixture.ordinal,
  'TERMINAL_FIXTURE_' || fixture.ordinal,
  'storage', false, false, 500 + fixture.ordinal,
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001'
from generate_series(1, 49) fixture(ordinal)
on conflict (id) do nothing;

with deficit as (
  select greatest(0, 138 - count(*))::integer as line_count
  from public.inventory_count_lines
  where session_id = '9e100000-0000-4000-8000-000000000001'
)
insert into public.inventory_count_lines (
  id, organization_id, session_id, location_id, product_id,
  product_name_snapshot, location_name_snapshot, unit_label_snapshot,
  category_snapshot, par_quantity_snapshot, stock_policy_snapshot,
  count_mode_snapshot, counted_quantity, count_method, count_status,
  counted_at, counted_by_name
)
select
  md5('phase9-terminal-line-' || fixture.ordinal)::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '9e100000-0000-4000-8000-000000000001',
  md5('phase9-terminal-location-' || fixture.ordinal)::uuid,
  'a1000000-0000-4000-8000-000000000001',
  'Organization A Product',
  'Terminal fixture location ' || fixture.ordinal,
  'piece', 'Test', 0, 'physical_count_only', 'unit',
  0, 'manual', 'counted', '2026-08-04T08:30:00Z', 'Organization A Manager'
from deficit
cross join lateral generate_series(1, deficit.line_count) fixture(ordinal);

set local session_replication_role = origin;

do $fixture$
begin
  if (select count(*)
      from public.inventory_count_sessions session
      join public.inventory_millum_export_profiles profile
        on profile.organization_id = session.organization_id
       and profile.profile_key = 'my-work-bar-jul'
       and profile.profile_version = 2
      where session.title = 'August stock count - Bar Shelves and Main Storage - 2026-08-04'
        and session.count_date = date '2026-08-04'
        and session.status = 'approved') <> 1 then
    raise exception 'Disposable Phase 9L production-shape source was not installed exactly once.';
  end if;
  if (select count(*) from public.inventory_count_lines
      where session_id = '9e100000-0000-4000-8000-000000000001') <> 138 then
    raise exception 'Disposable Phase 9L production-shape source must contain 138 lines.';
  end if;
end;
$fixture$;

commit;

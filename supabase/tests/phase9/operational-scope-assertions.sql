-- Executable Phase 9G-A operational-scope, authorization, and preservation assertions.
create schema phase9g_test;
revoke all on schema phase9g_test from public;
grant usage on schema phase9g_test to authenticated;

create function phase9g_test.assert_true(condition boolean, label text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'FAIL %', label; end if;
  raise notice 'PASS %', label;
end;
$$;

create function phase9g_test.assert_raises(statement text, pattern text, label text)
returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'Expected statement to fail: %', label;
exception when others then
  if sqlerrm not ilike pattern then raise; end if;
  raise notice 'PASS %', label;
end;
$$;

revoke all on function phase9g_test.assert_true(boolean, text) from public;
revoke all on function phase9g_test.assert_raises(text, text, text) from public;
grant execute on function phase9g_test.assert_true(boolean, text) to authenticated;
grant execute on function phase9g_test.assert_raises(text, text, text) to authenticated;

-- Preserve the terminal approved-history record so later configuration writes can
-- be checked against a byte-for-byte snapshot.
create table phase9g_test.approved_history_before as
select
  session.id as session_id,
  session.status,
  session.title,
  session.updated_at as session_updated_at,
  line.id as line_id,
  line.product_name_snapshot,
  line.location_name_snapshot,
  line.par_quantity_snapshot,
  line.counted_quantity,
  line.count_method,
  line.note,
  line.updated_at as line_updated_at
from public.inventory_count_sessions session
join public.inventory_count_lines line on line.session_id = session.id
where session.id = 'a4000000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
set role authenticated;
select public.setup_mesh_youngstorget_inventory_locations();

select phase9g_test.assert_true(
  (select count(*) = 6
     and array_agg(location.name order by location.code) = array[
       'Cornerbar Left Fridge', 'Cornerbar Middle Fridge', 'Cornerbar Right Fridge',
       'Workbar Bar Left Fridge', 'Workbar Bar Right Fridge', 'Workbar Non-Alco Fridge'
     ]
   from public.inventory_locations location
   where location.active and location.location_type = 'fridge'),
  'DB-9G-1: setup exposes exactly the six named operational refrigerators'
);

select phase9g_test.assert_true(
  not exists (
    select 1 from public.inventory_locations location
    where location.active
      and (
        upper(trim(location.code)) in (
          'CORNERBAR_FRIDGE_1', 'CORNERBAR_FRIDGE_2', 'CORNERBAR_FRIDGE_3',
          'WORKBAR_FRIDGE_1', 'WORKBAR_FRIDGE_2', 'WORKBAR_FRIDGE_3'
        )
        or location.name ilike '%Workbar%Middle%Fridge%'
      )
  ),
  'DB-9G-2: no active legacy code or Workbar middle refrigerator remains'
);

select phase9g_test.assert_true(
  (select count(*) = 99
     and count(distinct millum_item_ref) = 99
     and bool_and(nullif(trim(millum_item_ref), '') is not null)
   from public.inventory_products
   where ownership_status = 'owned'),
  'DB-9G-3: Bobby scope has 99 stable owned Millum product identities'
);

select phase9g_test.assert_true(
  (select count(*) = 100
     and sum(source_occurrence_count) filter (where millum_group = 'HARD ALCOHOL') = 40
     and count(*) filter (where millum_group = 'COFFEE') = 3
     and count(*) filter (where millum_group = 'SNACKS') = 10
     and count(*) filter (where millum_group = 'Cocktail ingredients') = 6
   from public.inventory_product_catalogue_groups),
  'DB-9G-4: ordered source memberships retain all 100 rows and PDF occurrence counts'
);

select phase9g_test.assert_true(
  (select count(distinct millum_group) = 7
     and bool_and(millum_group = any(array[
       'HARD ALCOHOL', 'COFFEE', 'SNACKS', 'SODAS', 'WINE', 'BEER', 'Cocktail ingredients'
     ]))
     and count(*) filter (where millum_group = any(array[
       'FRUIT AND VEGETABLES', 'FREEZER', 'MEAT AND FISH', 'DAIRY', 'DRY STORAGE'
     ])) = 0
   from public.inventory_product_catalogue_groups),
  'DB-9G-5: ownership uses only the seven explicit beverage and Bobby groups'
);

select phase9g_test.assert_true(
  (select count(*) = 53
   from public.inventory_location_products standard
   join public.inventory_locations location on location.id = standard.location_id
   join public.inventory_products product on product.id = standard.product_id
   where standard.active
     and product.ownership_status = 'owned'
     and upper(trim(location.code)) in (
       'CORNERBAR_LEFT_FRIDGE', 'CORNERBAR_MIDDLE_FRIDGE', 'CORNERBAR_RIGHT_FRIDGE',
       'WORKBAR_BAR_LEFT_FRIDGE', 'WORKBAR_BAR_RIGHT_FRIDGE', 'WORKBAR_NON_ALCO_FRIDGE'
     )),
  'DB-9G-6: all 53 terminal Phase 9G-D refrigerator defaults are active'
);

select phase9g_test.assert_true(
  (select count(*) = 16
     and count(*) filter (where requested_name = 'Farris') = 3
     and count(*) filter (
       where requested_name = 'Schweppes Indian Tonic'
         and cardinality(candidate_millum_item_refs) = 0
         and resolution_status = 'dismissed'
     ) = 1
     and count(*) filter (where resolution_status = 'resolved') = 15
     and count(*) filter (where resolution_status = 'unresolved') = 0
     and bool_and(nullif(trim(reason), '') is not null)
   from public.inventory_catalogue_unresolved_mappings
  ),
  'DB-9G-7: all 16 mapping audit records retain candidates and reach terminal status'
);

select phase9g_test.assert_true(
  not exists (
    select 1
    from public.inventory_location_products standard
    join public.inventory_products product on product.id = standard.product_id
    where standard.active and product.millum_item_ref in ('4000232', '6017933')
  )
  and exists (
    select 1 from public.inventory_catalogue_unresolved_mappings
    where requested_name = 'Schweppes Indian Tonic' and resolution_status = 'dismissed'
  ),
  'DB-9G-8: observations and transitional Schweppes stock are not seeded as defaults'
);

select phase9g_test.assert_true(
  (select count(*) = 25
     and count(*) filter (
       where lower(trim(alias)) = any(array[
         'blonde', 'passion', 'pils', 'ginger ninja', 'skog', 'eple',
         'rabarbra', 'hylle', 'pepsi', 'farris', 'eple & eple', 'appelsinjuice'
       ])
     ) = 0
   from public.inventory_product_aliases
   where active),
  'DB-9G-9: only 25 verified practical aliases exist and ambiguous aliases remain unattached'
);

select phase9g_test.assert_true(
  (select count(*) = 99 from public.inventory_products where ownership_status = 'owned')
  and (select count(*) = 100 from public.inventory_product_catalogue_groups)
  and (select count(*) = 25 from public.inventory_product_aliases where active)
  and (select count(*) = 6 from public.inventory_refrigerator_templates)
  and (select count(*) = 16 from public.inventory_catalogue_unresolved_mappings),
  'DB-9G-10: an authenticated manager can read every scoped operational record'
);

select phase9g_test.assert_true(
  (select count(*) = 4
   from pg_catalog.pg_class relation
   join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
   where namespace.nspname = 'public'
     and relation.relname in (
       'inventory_product_catalogue_groups', 'inventory_product_aliases',
       'inventory_refrigerator_templates', 'inventory_catalogue_unresolved_mappings'
     )
     and relation.relrowsecurity)
  and not has_table_privilege('authenticated', 'public.inventory_refrigerator_templates', 'INSERT')
  and not has_table_privilege('authenticated', 'public.inventory_catalogue_unresolved_mappings', 'UPDATE'),
  'DB-9G-11: all new tables enforce RLS and authenticated has no direct mutation privilege'
);

select phase9g_test.assert_true(
  (select refrigerator_default_quantity = 74
      and reserve_target_override is null
      and reserve_target_quantity = 222
      and combined_desired_quantity = 296
   from public.inventory_refrigerator_reserve_targets
   where product_id = (
     select id from public.inventory_products where millum_item_ref = '6274237'
   )),
  'DB-9G-12: automatic fixed reserve is exactly three times combined Fripa defaults'
);

select public.set_inventory_product_reserve_override(
  (select id from public.inventory_products where millum_item_ref = '6274237'), 50
);
select phase9g_test.assert_true(
  (select refrigerator_default_quantity = 74
      and reserve_target_override is null
      and reserve_target_quantity = 222
      and combined_desired_quantity = 296
   from public.inventory_refrigerator_reserve_targets
   where product_id = (
     select id from public.inventory_products where millum_item_ref = '6274237'
   )),
  'DB-9G-13: legacy per-product override cannot bypass the terminal organization multiplier rule'
);

select public.set_inventory_product_reserve_override(
  (select id from public.inventory_products where millum_item_ref = '6274237'), null
);
select phase9g_test.assert_true(
  (select reserve_target_override is null and reserve_target_quantity = 222
   from public.inventory_refrigerator_reserve_targets
   where product_id = (
     select id from public.inventory_products where millum_item_ref = '6274237'
   )),
  'DB-9G-14: clearing the override restores the automatic formula'
);

select public.verify_inventory_refrigerator_template(
  (select id from public.inventory_locations where code = 'CORNERBAR_RIGHT_FRIDGE')
);
select phase9g_test.assert_true(
  (select template_status = 'verified'
      and verified_at is not null
      and verified_by_name = 'Organization A Manager'
   from public.inventory_refrigerator_templates
   where location_id = (
     select id from public.inventory_locations where code = 'CORNERBAR_RIGHT_FRIDGE'
   )),
  'DB-9G-15: a manager can explicitly verify a nonempty refrigerator template'
);

select public.bulk_upsert_inventory_location_standards(
  (select id from public.inventory_locations where code = 'CORNERBAR_RIGHT_FRIDGE'),
  jsonb_build_array(jsonb_build_object(
    'productId', (select id from public.inventory_products where millum_item_ref = '6274237'),
    'assigned', true, 'parQuantity', 21, 'countOrder', 9, 'stockPolicy', 'exact_par'
  ))
);
select phase9g_test.assert_true(
  (select template_status = 'incomplete' and verified_at is null
   from public.inventory_refrigerator_templates
   where location_id = (
     select id from public.inventory_locations where code = 'CORNERBAR_RIGHT_FRIDGE'
   ))
  and (select refrigerator_default_quantity = 75 and reserve_target_quantity = 225
       from public.inventory_refrigerator_reserve_targets
       where product_id = (
         select id from public.inventory_products where millum_item_ref = '6274237'
       )),
  'DB-9G-16: editing a default invalidates verification and recalculates reserve by product ID'
);

select public.setup_mesh_youngstorget_inventory_locations();
select phase9g_test.assert_true(
  (select par_quantity = 21
   from public.inventory_location_products
   where location_id = (
       select id from public.inventory_locations where code = 'CORNERBAR_RIGHT_FRIDGE'
     )
     and product_id = (
       select id from public.inventory_products where millum_item_ref = '6274237'
     ))
  and (select template_status = 'incomplete'
       from public.inventory_refrigerator_templates
       where location_id = (
         select id from public.inventory_locations where code = 'CORNERBAR_RIGHT_FRIDGE'
       )),
  'DB-9G-17: repeated setup preserves manager-edited defaults and incomplete state'
);

select phase9g_test.assert_raises(
  $sql$select public.upsert_inventory_product(
    input_name => 'Fripa', input_unit_label => 'unit',
    input_fields => array['name', 'unit_label']
  )$sql$,
  '%existing stable Millum product or verified alias%',
  'DB-9G-18: verified names and aliases block duplicate free-text products'
);

select phase9g_test.assert_raises(
  $sql$update public.inventory_refrigerator_templates
       set template_status = 'verified'
       where location_id = (
         select id from public.inventory_locations where code = 'CORNERBAR_RIGHT_FRIDGE'
       )$sql$,
  '%permission denied%',
  'DB-9G-19: managers cannot bypass guarded template RPCs with direct writes'
);

select phase9g_test.assert_raises(
  $sql$update public.inventory_products
       set reserve_target_override = 1
       where millum_item_ref = '6274237'$sql$,
  '%permission denied%',
  'DB-9G-20: managers cannot bypass the guarded reserve override RPC'
);

reset role;

-- Seed an exact legacy Workbar row for Organization B and prove setup reuses its
-- primary key rather than replacing or duplicating it.
insert into public.inventory_locations (
  id, organization_id, name, code, location_type, active, sort_order,
  created_by_auth_user_id, updated_by_auth_user_id
) values (
  '97000000-0000-4000-8000-000000000001',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  'Legacy Workbar Fridge 1', 'WORKBAR_FRIDGE_1', 'fridge', true, 99,
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001'
);

create table phase9g_test.organization_a_targets as
select
  (select id from public.inventory_locations
   where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
     and code = 'CORNERBAR_RIGHT_FRIDGE') as location_id,
  (select id from public.inventory_products
   where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
     and millum_item_ref = '6274237') as product_id;
grant select on phase9g_test.organization_a_targets to authenticated;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', false);
set role authenticated;
select public.setup_mesh_youngstorget_inventory_locations();
select phase9g_test.assert_true(
  (select id = '97000000-0000-4000-8000-000000000001'
      and name = 'Workbar Bar Left Fridge'
      and code = 'WORKBAR_BAR_LEFT_FRIDGE'
      and active
   from public.inventory_locations
   where code = 'WORKBAR_BAR_LEFT_FRIDGE')
  and (select count(*) = 6
       from public.inventory_locations
       where active and location_type = 'fridge'),
  'DB-9G-21: legacy refrigerator rows are renamed in place and setup stays six-location idempotent'
);

select phase9g_test.assert_raises(
  $sql$select public.set_inventory_product_reserve_override(
    (select product_id from phase9g_test.organization_a_targets), 1
  )$sql$,
  '%not found%',
  'DB-9G-22: a manager cannot change another organization reserve override'
);

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', false);
set role authenticated;
select phase9g_test.assert_true(
  not exists (select 1 from public.inventory_product_catalogue_groups)
  and not exists (select 1 from public.inventory_product_aliases)
  and not exists (select 1 from public.inventory_refrigerator_templates)
  and not exists (select 1 from public.inventory_catalogue_unresolved_mappings),
  'DB-9G-23: authenticated staff cannot read manager operational configuration'
);
select phase9g_test.assert_raises(
  $sql$select public.setup_mesh_youngstorget_inventory_locations()$sql$,
  '%manager profile%required%',
  'DB-9G-24: authenticated staff cannot configure the operational scope'
);

reset role;

-- Phase 9G setup and manager default edits must not alter approved sessions or
-- their immutable line snapshots.
select phase9g_test.assert_true(
  not exists (
    (select
       session.id as session_id,
       session.status,
       session.title,
       session.updated_at as session_updated_at,
       line.id as line_id,
       line.product_name_snapshot,
       line.location_name_snapshot,
       line.par_quantity_snapshot,
       line.counted_quantity,
       line.count_method,
       line.note,
       line.updated_at as line_updated_at
     from public.inventory_count_sessions session
     join public.inventory_count_lines line on line.session_id = session.id
     where session.id = 'a4000000-0000-4000-8000-000000000001')
    except
    (select * from phase9g_test.approved_history_before)
  )
  and not exists (
    (select * from phase9g_test.approved_history_before)
    except
    (select
       session.id as session_id,
       session.status,
       session.title,
       session.updated_at as session_updated_at,
       line.id as line_id,
       line.product_name_snapshot,
       line.location_name_snapshot,
       line.par_quantity_snapshot,
       line.counted_quantity,
       line.count_method,
       line.note,
       line.updated_at as line_updated_at
     from public.inventory_count_sessions session
     join public.inventory_count_lines line on line.session_id = session.id
     where session.id = 'a4000000-0000-4000-8000-000000000001')
  ),
  'DB-9G-25: setup and default edits leave approved history byte-for-byte unchanged'
);

drop schema phase9g_test cascade;

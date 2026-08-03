-- Executable Phase 9J assertions for generic countable locations, deterministic
-- Main Storage targets, passive suggestions, and reference-image boundaries.
begin;

create schema phase9j_test;
revoke all on schema phase9j_test from public;
grant usage on schema phase9j_test to authenticated;

create function phase9j_test.assert_true(condition boolean, label text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'FAIL %', label; end if;
  raise notice 'PASS %', label;
end;
$$;

create function phase9j_test.assert_rejected(statement text, pattern text, label text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
    raise exception 'Expected statement to fail: %', label;
  exception when others then
    if sqlerrm not ilike pattern then raise; end if;
  end;
  raise notice 'PASS %', label;
end;
$$;

revoke all on function phase9j_test.assert_true(boolean, text) from public;
revoke all on function phase9j_test.assert_rejected(text, text, text) from public;
grant execute on function phase9j_test.assert_true(boolean, text) to authenticated;
grant execute on function phase9j_test.assert_rejected(text, text, text) to authenticated;

create table phase9j_test.approved_history_before as
select md5(
  coalesce((
    select jsonb_agg(to_jsonb(session) order by session.id)::text
    from public.inventory_count_sessions session
    where session.id = 'd4000000-0000-4000-8000-000000000001'
  ), '[]')
  || coalesce((
    select jsonb_agg(to_jsonb(line) order by line.id)::text
    from public.inventory_count_lines line
    where line.session_id = 'd4000000-0000-4000-8000-000000000001'
  ), '[]')
) as digest;

insert into auth.users (id) values
  ('91600000-0000-4000-8000-000000000001'),
  ('91600000-0000-4000-8000-000000000002'),
  ('92600000-0000-4000-8000-000000000001');

insert into public.organizations (id, name, slug) values
  ('91111111-1111-4111-8111-111111111111', 'Phase 9J Organization', 'phase9j-org'),
  ('92222222-2222-4222-8222-222222222222', 'Phase 9J Foreign Organization', 'phase9j-foreign');

insert into public.user_profiles (id, organization_id, display_name, role, active, is_shared_device) values
  ('91600000-0000-4000-8000-000000000001', '91111111-1111-4111-8111-111111111111', 'Phase 9J Manager', 'manager', true, false),
  ('91600000-0000-4000-8000-000000000002', '91111111-1111-4111-8111-111111111111', 'Phase 9J Counter', 'counter', true, false),
  ('92600000-0000-4000-8000-000000000001', '92222222-2222-4222-8222-222222222222', 'Phase 9J Foreign Manager', 'manager', true, false);

insert into public.inventory_storage_settings (organization_id, target_multiplier) values
  ('91111111-1111-4111-8111-111111111111', 3),
  ('92222222-2222-4222-8222-222222222222', 3);

insert into public.inventory_products (
  id, organization_id, name, sku, category, unit_label, active, sort_order,
  count_mode, container_capacity_liters, millum_item_ref, ownership_status
) values
  ('91100000-0000-4000-8000-000000000001', '91111111-1111-4111-8111-111111111111', 'Phase 9J Active Product', '9J-ACTIVE', 'Spirits', 'bottles', true, 1, 'container_plus_volume', 0.7, '9J-1', 'owned'),
  ('91100000-0000-4000-8000-000000000002', '91111111-1111-4111-8111-111111111111', 'Phase 9J Wine Product', '9J-WINE', 'Wine', 'bottles', true, 2, 'unit', null, '9J-2', 'owned'),
  ('91100000-0000-4000-8000-000000000003', '91111111-1111-4111-8111-111111111111', 'Phase 9J Passive Product', '9J-PASSIVE', 'Spirits', 'bottles', true, 3, 'container_plus_volume', 0.7, '9J-3', 'owned'),
  ('91100000-0000-4000-8000-000000000004', '91111111-1111-4111-8111-111111111111', 'Phase 9J Inactive Product', '9J-INACTIVE', 'Beer', 'bottles', false, 4, 'unit', null, '9J-4', 'owned'),
  ('92100000-0000-4000-8000-000000000001', '92222222-2222-4222-8222-222222222222', 'Foreign Product', '9J-FOREIGN', 'Spirits', 'bottles', true, 1, 'unit', null, '9J-F', 'owned');

insert into public.inventory_locations (
  id, organization_id, name, code, location_type, active, countable, sort_order
) values
  ('91200000-0000-4000-8000-000000000001', '91111111-1111-4111-8111-111111111111', 'Workbar Fridge A', '9J_FRIDGE_A', 'fridge', true, true, 1),
  ('91200000-0000-4000-8000-000000000002', '91111111-1111-4111-8111-111111111111', 'Cornerbar Fridge B', '9J_FRIDGE_B', 'fridge', true, true, 2),
  ('91200000-0000-4000-8000-000000000003', '91111111-1111-4111-8111-111111111111', 'Workbar Bar Shelves', 'WORKBAR_BAR_SHELVES', 'shelf', true, true, 3),
  ('91200000-0000-4000-8000-000000000004', '91111111-1111-4111-8111-111111111111', 'Cornerbar Bar Shelves', 'CORNERBAR_BAR_SHELVES', 'shelf', true, true, 4),
  ('91200000-0000-4000-8000-000000000005', '91111111-1111-4111-8111-111111111111', 'Main Storage', 'MAIN_STORAGE', 'storage', true, true, 5),
  ('91200000-0000-4000-8000-000000000006', '91111111-1111-4111-8111-111111111111', 'Inactive Fridge', '9J_FRIDGE_INACTIVE', 'fridge', false, true, 6),
  ('92200000-0000-4000-8000-000000000001', '92222222-2222-4222-8222-222222222222', 'Foreign Shelf', 'WORKBAR_BAR_SHELVES', 'shelf', true, true, 1);

insert into public.inventory_location_products (
  id, organization_id, location_id, product_id, par_quantity, count_order, active,
  stock_policy, target_mode, contributes_to_storage_target,
  historical_suggestion_quantity, historical_suggestion_note, historical_suggestion_source
) values
  ('91300000-0000-4000-8000-000000000001', '91111111-1111-4111-8111-111111111111', '91200000-0000-4000-8000-000000000001', '91100000-0000-4000-8000-000000000001', 4, 1, true, 'exact_par', null, true, null, null, null),
  ('91300000-0000-4000-8000-000000000002', '91111111-1111-4111-8111-111111111111', '91200000-0000-4000-8000-000000000002', '91100000-0000-4000-8000-000000000001', 6, 1, true, 'exact_par', null, true, null, null, null),
  ('91300000-0000-4000-8000-000000000003', '91111111-1111-4111-8111-111111111111', '91200000-0000-4000-8000-000000000003', '91100000-0000-4000-8000-000000000001', 2, 1, true, 'exact_par', null, false, null, null, null),
  ('91300000-0000-4000-8000-000000000004', '91111111-1111-4111-8111-111111111111', '91200000-0000-4000-8000-000000000004', '91100000-0000-4000-8000-000000000002', 3, 1, true, 'exact_par', null, false, null, null, null),
  ('91300000-0000-4000-8000-000000000005', '91111111-1111-4111-8111-111111111111', '91200000-0000-4000-8000-000000000005', '91100000-0000-4000-8000-000000000001', 0, 1, true, 'operating_reserve', 'derived_multiplier', false, null, null, null),
  ('91300000-0000-4000-8000-000000000006', '91111111-1111-4111-8111-111111111111', '91200000-0000-4000-8000-000000000005', '91100000-0000-4000-8000-000000000003', 0, 2, true, 'physical_count_only', null, false, 11.9, 'Bottle-equivalent only; enter sealed and open quantities.', 'Previous spirits count'),
  ('91300000-0000-4000-8000-000000000007', '91111111-1111-4111-8111-111111111111', '91200000-0000-4000-8000-000000000006', '91100000-0000-4000-8000-000000000001', 99, 1, true, 'exact_par', null, true, null, null, null),
  ('91300000-0000-4000-8000-000000000008', '91111111-1111-4111-8111-111111111111', '91200000-0000-4000-8000-000000000001', '91100000-0000-4000-8000-000000000004', 50, 2, true, 'exact_par', null, true, null, null, null);

select set_config('request.jwt.claim.sub', '91600000-0000-4000-8000-000000000001', false);
set role authenticated;

select phase9j_test.assert_true(
  (select count(*) = 3 and bool_and(countable)
   from public.inventory_locations
   where organization_id = '91111111-1111-4111-8111-111111111111'
     and code in ('WORKBAR_BAR_SHELVES','CORNERBAR_BAR_SHELVES','MAIN_STORAGE')),
  'DB-9J-1: both bar shelves and Main Storage are organization-scoped countable locations'
);

-- Target details are an internal helper used by guarded session creation. Exercise
-- its deterministic calculation as the database owner while the surrounding RPC
-- assertions continue to run as the authenticated manager.
reset role;

select phase9j_test.assert_true(
  (select effective_target_quantity = 30 and service_target_basis = 10
      and applied_multiplier = 3 and rule_version = 'refrigerator-targets-v1'
   from public.inventory_stock_policy_target_details('91300000-0000-4000-8000-000000000005')),
  'DB-9J-2: Main Storage is 3× the sum of qualifying refrigerator targets by stable product ID'
);

select phase9j_test.assert_true(
  (select service_target_basis = 10
   from public.inventory_stock_policy_target_details('91300000-0000-4000-8000-000000000005')),
  'DB-9J-3: bar shelves, inactive locations, and inactive products are excluded from storage basis'
);

select phase9j_test.assert_true(
  (select effective_target_quantity is null
   from public.inventory_stock_policy_target_details('91300000-0000-4000-8000-000000000006')),
  'DB-9J-4: passive physical-count-only products receive no derived or false zero target'
);

set role authenticated;

select phase9j_test.assert_true(
  (select par_quantity = 2 from public.inventory_location_products where id = '91300000-0000-4000-8000-000000000003')
  and (select par_quantity = 3 from public.inventory_location_products where id = '91300000-0000-4000-8000-000000000004'),
  'DB-9J-5: shelf targets remain explicit per product and per bar rather than globally inherited'
);

select public.create_inventory_count_session(
  'Phase 9J shelf and storage count', 'ad_hoc',
  '91900000-0000-4000-8000-000000000001', current_date,
  array['91200000-0000-4000-8000-000000000003','91200000-0000-4000-8000-000000000004','91200000-0000-4000-8000-000000000005']::uuid[],
  'Future shelf and storage scope'
);

select phase9j_test.assert_true(
  (select count(distinct line.location_id) = 3 and count(*) = 4
   from public.inventory_count_lines line
   join public.inventory_count_sessions session on session.id = line.session_id
   where session.title = 'Phase 9J shelf and storage count'),
  'DB-9J-6: a future session safely selects shelf and storage locations without parent expansion'
);

select phase9j_test.assert_true(
  (select effective_target_quantity_snapshot = 30
      and service_target_basis_snapshot = 10
      and reserve_multiplier_snapshot = 3
      and storage_rule_version_snapshot = 'refrigerator-targets-v1'
   from public.inventory_count_lines line
   join public.inventory_count_sessions session on session.id = line.session_id
   where session.title = 'Phase 9J shelf and storage count'
     and line.product_id = '91100000-0000-4000-8000-000000000001'
     and line.location_id = '91200000-0000-4000-8000-000000000005'),
  'DB-9J-7: derived basis, multiplier, effective target, and rule version are frozen in the session snapshot'
);

select phase9j_test.assert_true(
  (select stock_policy_snapshot = 'physical_count_only'
      and effective_target_quantity_snapshot is null
      and historical_suggestion_quantity_snapshot = 11.9
      and counted_quantity is null
      and count_status = 'not_counted'
   from public.inventory_count_lines line
   join public.inventory_count_sessions session on session.id = line.session_id
   where session.title = 'Phase 9J shelf and storage count'
     and line.product_id = '91100000-0000-4000-8000-000000000003'),
  'DB-9J-8: passive history is a visible suggestion while current structured count remains unverified'
);

select phase9j_test.assert_true(
  (select count_mode_snapshot = 'container_plus_volume' and container_capacity_liters_snapshot = 0.7
   from public.inventory_count_lines line
   join public.inventory_count_sessions session on session.id = line.session_id
   where session.title = 'Phase 9J shelf and storage count'
     and line.product_id = '91100000-0000-4000-8000-000000000003'),
  'DB-9J-9: passive spirits retain structured sealed/open bottle counting'
);

select public.mark_inventory_location_use_par(
  (select id from public.inventory_count_sessions where title = 'Phase 9J shelf and storage count'),
  '91200000-0000-4000-8000-000000000005', false,
  null,
  (select updated_at from public.inventory_count_sessions where title = 'Phase 9J shelf and storage count')
);

select phase9j_test.assert_true(
  (select count_method = 'uncounted' and counted_quantity is null and count_status = 'not_counted'
   from public.inventory_count_lines line
   join public.inventory_count_sessions session on session.id = line.session_id
   where session.title = 'Phase 9J shelf and storage count'
     and line.product_id = '91100000-0000-4000-8000-000000000003'),
  'DB-9J-10: exact-target bulk application never verifies a passive suggestion or converts it to zero'
);

select public.set_inventory_count_line_structured_quantity(
  input_line_id => (
    select line.id
    from public.inventory_count_lines line
    join public.inventory_count_sessions session on session.id = line.session_id
    where session.title = 'Phase 9J shelf and storage count'
      and line.location_id = '91200000-0000-4000-8000-000000000005'
      and line.product_id = '91100000-0000-4000-8000-000000000001'
  ),
  input_whole_units => 0,
  input_open_volume_liters => 0,
  input_expected_updated_at => (
    select line.updated_at
    from public.inventory_count_lines line
    join public.inventory_count_sessions session on session.id = line.session_id
    where session.title = 'Phase 9J shelf and storage count'
      and line.location_id = '91200000-0000-4000-8000-000000000005'
      and line.product_id = '91100000-0000-4000-8000-000000000001'
  )
);

select phase9j_test.assert_rejected(
  $sql$select public.complete_inventory_count_location(
    (select id from public.inventory_count_sessions where title = 'Phase 9J shelf and storage count'),
    '91200000-0000-4000-8000-000000000005'
  )$sql$,
  '%1 product(s) still need a count%',
  'DB-9J-11: required targetless passive lines block location completion until physically reviewed'
);

select public.set_inventory_storage_multiplier(4);
reset role;
select phase9j_test.assert_true(
  (select effective_target_quantity = 40 and applied_multiplier = 4
   from public.inventory_stock_policy_target_details('91300000-0000-4000-8000-000000000005'))
  and (select effective_target_quantity_snapshot = 30
       from public.inventory_count_lines line
       join public.inventory_count_sessions session on session.id = line.session_id
       where session.title = 'Phase 9J shelf and storage count'
         and line.location_id = '91200000-0000-4000-8000-000000000005'
         and line.product_id = '91100000-0000-4000-8000-000000000001'),
  'DB-9J-12: multiplier edits recalculate future targets but never rewrite existing session snapshots'
);
set role authenticated;

select public.set_inventory_counter_membership('91600000-0000-4000-8000-000000000002', true);
select public.create_inventory_count_assignment(
  (select id from public.inventory_count_sessions where title = 'Phase 9J shelf and storage count'),
  '91200000-0000-4000-8000-000000000003',
  (select id from public.inventory_counter_memberships where counter_auth_user_id = '91600000-0000-4000-8000-000000000002'),
  (select updated_at from public.inventory_count_sessions where title = 'Phase 9J shelf and storage count')
);
select phase9j_test.assert_true(
  exists (
    select 1 from public.inventory_count_assignments assignment
    where assignment.location_id = '91200000-0000-4000-8000-000000000003'
  ),
  'DB-9J-13: an authorized counter can be assigned a selected shelf location'
);

select public.set_inventory_location_reference_guidance(
  '91200000-0000-4000-8000-000000000003',
  '91111111-1111-4111-8111-111111111111/91200000-0000-4000-8000-000000000003/91400000-0000-4000-8000-000000000001.jpg',
  'Keep coffee cups and water glasses aligned on the marked shelf.',
  'image/jpeg', 120000, 'workbar-setup.jpg', 0
);

select phase9j_test.assert_true(
  (select caption like '%coffee cups and water glasses%'
      and object_path like '91111111-1111-4111-8111-111111111111/%'
   from public.inventory_location_reference_guidance
   where location_id = '91200000-0000-4000-8000-000000000003'),
  'DB-9J-14: manager reference guidance can represent fixed non-inventory setup items'
);

select phase9j_test.assert_rejected(
  $sql$select public.set_inventory_location_reference_guidance(
    '91200000-0000-4000-8000-000000000003',
    '92222222-2222-4222-8222-222222222222/91200000-0000-4000-8000-000000000003/91400000-0000-4000-8000-000000000002.jpg',
    'Manipulated', 'image/jpeg', 100, 'bad.jpg', 1
  )$sql$,
  '%object path is invalid%',
  'DB-9J-15: organization and location path manipulation is rejected'
);

select phase9j_test.assert_rejected(
  $sql$select public.set_inventory_location_reference_guidance(
    '91200000-0000-4000-8000-000000000003',
    '91111111-1111-4111-8111-111111111111/91200000-0000-4000-8000-000000000003/91400000-0000-4000-8000-000000000002.gif',
    'Invalid type', 'image/gif', 100, 'bad.gif', 1
  )$sql$,
  '%type must be JPEG, PNG, or WebP%',
  'DB-9J-16: invalid image types are rejected before replacing valid guidance'
);

select phase9j_test.assert_rejected(
  $sql$select public.set_inventory_location_reference_guidance(
    '91200000-0000-4000-8000-000000000003',
    '91111111-1111-4111-8111-111111111111/91200000-0000-4000-8000-000000000003/91400000-0000-4000-8000-000000000002.png',
    'Too large', 'image/png', 5242881, 'large.png', 1
  )$sql$,
  '%no larger than 5 MB%',
  'DB-9J-17: excessive image size is rejected before replacing valid guidance'
);

select phase9j_test.assert_true(
  (select object_path like '%000000000001.jpg' and revision = 1
   from public.inventory_location_reference_guidance
   where location_id = '91200000-0000-4000-8000-000000000003'),
  'DB-9J-18: failed replacement attempts preserve the previous valid image and revision'
);

select public.set_inventory_location_reference_guidance(
  '91200000-0000-4000-8000-000000000003',
  '91111111-1111-4111-8111-111111111111/91200000-0000-4000-8000-000000000003/91400000-0000-4000-8000-000000000002.webp',
  'Updated current setup.', 'image/webp', 220000, 'workbar-new.webp', 1
);
reset role;
select phase9j_test.assert_true(
  (select revision = 2 and object_path like '%000000000002.webp'
   from public.inventory_location_reference_guidance
   where location_id = '91200000-0000-4000-8000-000000000003')
  and exists (
    select 1 from public.inventory_reference_image_cleanup_queue
    where object_path like '%000000000001.jpg' and completed_at is null
  ),
  'DB-9J-19: manager replacement is collision-safe and queues the superseded object for cleanup'
);
set role authenticated;

select public.remove_inventory_location_reference_image('91200000-0000-4000-8000-000000000003', 2);
reset role;
select phase9j_test.assert_true(
  (select revision = 3 and object_path is null and caption = 'Updated current setup.'
   from public.inventory_location_reference_guidance
   where location_id = '91200000-0000-4000-8000-000000000003')
  and exists (
    select 1 from public.inventory_reference_image_cleanup_queue
    where object_path like '%000000000002.webp' and completed_at is null
  ),
  'DB-9J-20: manager removal preserves the caption and queues the object without touching counts'
);
set role authenticated;

select phase9j_test.assert_true(
  (select count(*) = 1 and bool_and(counted_quantity is null)
   from public.inventory_count_lines line
   join public.inventory_count_sessions session on session.id = line.session_id
   where session.title = 'Phase 9J shelf and storage count'
     and line.location_id = '91200000-0000-4000-8000-000000000003'),
  'DB-9J-21: changing reference guidance never changes target snapshots or physical counts'
);

reset role;
select set_config('request.jwt.claim.sub', '91600000-0000-4000-8000-000000000002', false);
set role authenticated;

select phase9j_test.assert_true(
  (select assignment->'reference_guidance'->>'caption' = 'Updated current setup.'
   from jsonb_array_elements(public.get_inventory_counter_workspace()->'assignments') assignment
   where assignment->'location'->>'id' = '91200000-0000-4000-8000-000000000003'),
  'DB-9J-22: assigned counters receive the current caption in their sanitized workspace payload'
);

select phase9j_test.assert_true(
  not exists (select 1 from public.inventory_location_reference_guidance),
  'DB-9J-23: counters cannot browse manager reference configuration directly'
);

select phase9j_test.assert_rejected(
  $sql$select public.set_inventory_location_reference_guidance(
    '91200000-0000-4000-8000-000000000003', null, 'Counter edit', null, null, null, 3
  )$sql$,
  '%manager%',
  'DB-9J-24: counters cannot edit captions or image metadata through manager RPCs'
);

reset role;
select set_config('request.jwt.claim.sub', '92600000-0000-4000-8000-000000000001', false);
set role authenticated;

select phase9j_test.assert_true(
  not exists (
    select 1 from public.inventory_location_reference_guidance
    where location_id = '91200000-0000-4000-8000-000000000003'
  ),
  'DB-9J-25: reference metadata reads are blocked across organizations'
);

select phase9j_test.assert_rejected(
  $sql$select public.set_inventory_location_reference_guidance(
    '91200000-0000-4000-8000-000000000003', null, 'Foreign edit', null, null, null, 3
  )$sql$,
  '%not found in this organization%',
  'DB-9J-26: foreign managers cannot modify another organization location guidance'
);

reset role;
select phase9j_test.assert_true(
  not has_table_privilege('authenticated', 'public.inventory_reference_image_cleanup_queue', 'SELECT')
  and not has_table_privilege('authenticated', 'public.inventory_reference_image_cleanup_queue', 'INSERT')
  and not has_table_privilege('authenticated', 'public.inventory_location_reference_guidance', 'INSERT'),
  'DB-9J-27: cleanup internals and reference metadata writes remain RPC-only'
);

select phase9j_test.assert_true(
  (select count(*) = 3
   from pg_catalog.pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('inventory_reference_images_insert','inventory_reference_images_select','inventory_reference_images_delete')),
  'DB-9J-28: private Storage objects have explicit insert, select, and delete policies'
);

select phase9j_test.assert_true(
  (select public is false and file_size_limit = 5242880
      and allowed_mime_types = array['image/jpeg','image/png','image/webp']::text[]
   from storage.buckets where id = 'inventory-location-reference-images'),
  'DB-9J-29: reference bucket is private with strict server-side MIME and size limits'
);

select phase9j_test.assert_true(
  not has_function_privilege('anon', 'public.get_inventory_counter_workspace()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_inventory_counter_workspace()', 'EXECUTE')
  and not has_table_privilege('anon', 'public.inventory_location_reference_guidance', 'SELECT'),
  'DB-9J-30: reference access retains authenticated-only RPC and table boundaries'
);

select phase9j_test.assert_true(
  (select digest from phase9j_test.approved_history_before) = md5(
    coalesce((
      select jsonb_agg(to_jsonb(session) order by session.id)::text
      from public.inventory_count_sessions session
      where session.id = 'd4000000-0000-4000-8000-000000000001'
    ), '[]')
    || coalesce((
      select jsonb_agg(to_jsonb(line) order by line.id)::text
      from public.inventory_count_lines line
      where line.session_id = 'd4000000-0000-4000-8000-000000000001'
    ), '[]')
  ),
  'DB-9J-31: current reference and target configuration leaves approved historical sessions byte-stable'
);

rollback;

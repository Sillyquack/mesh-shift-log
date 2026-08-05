-- Executable Phase 10D assertions for the disposable PostgreSQL runner.
begin;

create schema if not exists phase10d_test;

create or replace function phase10d_test.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if condition is distinct from true then
    raise exception 'FAIL %', message;
  end if;
  raise notice 'PASS %', message;
end;
$$;

create or replace function phase10d_test.expect_error(statement text, needle text, message text)
returns void
language plpgsql
as $$
begin
  begin
    execute statement;
  exception when others then
    if needle is null or position(lower(needle) in lower(sqlerrm)) > 0 then
      raise notice 'PASS %', message;
      return;
    end if;
    raise exception 'FAIL % (unexpected error: %)', message, sqlerrm;
  end;
  raise exception 'FAIL % (statement unexpectedly succeeded)', message;
end;
$$;

grant usage on schema phase10d_test to authenticated, anon;
grant execute on function phase10d_test.assert_true(boolean, text) to authenticated, anon;
grant execute on function phase10d_test.expect_error(text, text, text) to authenticated, anon;

select phase10d_test.assert_true(
  (select count(*) = 12 from pg_catalog.pg_class relation
   join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
   where namespace.nspname = 'public' and relation.relkind = 'r'
     and relation.relname in (
       'routine_runs', 'routine_run_sections', 'routine_run_tasks',
       'routine_run_task_items', 'routine_run_snapshot_sources',
       'routine_run_condition_evaluations', 'routine_run_task_dependencies',
       'routine_run_task_relations', 'routine_run_task_reference_images',
       'routine_run_participants', 'routine_run_role_assignments',
       'routine_run_operations'
     )),
  '001 all twelve Phase 10D tables exist'
);
select phase10d_test.assert_true(
  (select count(*) = 12 from information_schema.columns
   where table_schema = 'public' and column_name = 'organization_id'
     and is_nullable = 'NO' and table_name in (
       'routine_runs', 'routine_run_sections', 'routine_run_tasks',
       'routine_run_task_items', 'routine_run_snapshot_sources',
       'routine_run_condition_evaluations', 'routine_run_task_dependencies',
       'routine_run_task_relations', 'routine_run_task_reference_images',
       'routine_run_participants', 'routine_run_role_assignments',
       'routine_run_operations'
     )),
  '002 organization_id is NOT NULL on every Phase 10D table'
);
select phase10d_test.assert_true(
  (select count(*) = 12 from pg_catalog.pg_class relation
   join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
   where namespace.nspname = 'public' and relation.relrowsecurity
     and relation.relname like 'routine_run%'),
  '003 RLS is enabled on every Phase 10D table'
);
select phase10d_test.assert_true(
  (select bool_and(policy.cmd = 'SELECT' and policy.roles = '{authenticated}'::name[])
   from pg_catalog.pg_policies policy
   where policy.schemaname = 'public' and policy.tablename like 'routine_run%'),
  '004 Phase 10D exposes SELECT policies only to authenticated'
);
select phase10d_test.assert_true(
  not exists (
    select 1 from pg_catalog.pg_policies policy
    where policy.schemaname = 'public' and policy.tablename like 'routine_run%'
      and (coalesce(policy.qual, '') ~* 'organization_id\s+is\s+null'
           or coalesce(policy.qual, '') ~* '^\s*true\s*$'
           or coalesce(policy.with_check, '') ~* '^\s*true\s*$')
  ),
  '005 no broad or null-organization Phase 10D policy exists'
);
select phase10d_test.assert_true(
  not exists (
    select 1 from information_schema.role_table_grants grant_row
    where grant_row.grantee in ('authenticated', 'anon')
      and grant_row.table_schema = 'public'
      and grant_row.table_name like 'routine_run%'
      and grant_row.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  ),
  '006 application roles have no direct Phase 10D table mutation grant'
);
select phase10d_test.assert_true(
  (select count(*) >= 16 from pg_catalog.pg_constraint constraint_row
   where constraint_row.contype = 'f'
     and constraint_row.conrelid in (
       select relation.oid from pg_catalog.pg_class relation
       join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
       where namespace.nspname = 'public' and relation.relname like 'routine_run%'
     )),
  '007 composite foreign keys protect run tenant and graph boundaries'
);
select phase10d_test.assert_true(
  (select pg_catalog.pg_get_indexdef(index_row.indexrelid) like '%WHERE (status <> ALL%'
          or pg_catalog.pg_get_indexdef(index_row.indexrelid) like '%WHERE (status NOT IN%'
   from pg_catalog.pg_index index_row
   join pg_catalog.pg_class index_relation on index_relation.oid = index_row.indexrelid
   where index_relation.relname = 'routine_runs_authoritative_identity_idx'),
  '008 authoritative run identity uses a partial unique index'
);
select phase10d_test.assert_true(
  (select count(*) = 1 from pg_catalog.pg_indexes
   where schemaname = 'public' and indexname = 'routine_run_role_assignments_one_active_idx'
     and indexdef like '%UNIQUE%'),
  '009 one-active role assignment has a database uniqueness guard'
);
select phase10d_test.assert_true(
  (select count(*) = 3 from pg_catalog.pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in (
       'routine_reference_images_insert', 'routine_reference_images_select',
       'routine_reference_images_delete'
     )),
  '010 Phase 10D retains exactly the three narrow routine Storage policies'
);
select phase10d_test.assert_true(
  not exists (select 1 from pg_catalog.pg_policies
              where schemaname = 'storage' and tablename = 'objects'
                and policyname like 'routine_reference_images_%' and cmd = 'UPDATE'),
  '011 Phase 10D adds no Storage UPDATE policy'
);
select phase10d_test.assert_true(
  (select public = false and file_size_limit = 5242880
   from storage.buckets where id = 'routine-reference-images'),
  '012 routine-reference-images remains private with the five-megabyte contract'
);
select phase10d_test.assert_true(
  not exists (
    select 1 from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class target on target.oid = constraint_row.confrelid
    where constraint_row.conrelid in (
      select relation.oid from pg_catalog.pg_class relation
      where relation.relname like 'routine_run%'
    ) and (target.relname like 'inventory_%' or target.relname like 'asset_%'
           or target.relname like 'event_%')
  ),
  '013 Phase 10D creates no foreign key into Inventory Asset or Event domains'
);

-- Create the authoritative main run as the manager and retain the result.
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set local role authenticated;
insert into phase10d_fixture.state (key, value)
values (
  'main_run',
  public.create_or_get_routine_run(
    'daily-run-test', 'default', '2026-08-05',
    'd9000000-0000-4000-8000-000000000001'
  )
)
on conflict (key) do update set value = excluded.value;
reset role;

select phase10d_test.assert_true(
  ((select value->'run'->>'snapshot_state' from phase10d_fixture.state where key = 'main_run') = 'ready'),
  '014 a valid current published template creates a ready run'
);
select phase10d_test.assert_true(
  ((select value->'run'->>'status' from phase10d_fixture.state where key = 'main_run') = 'scheduled'),
  '015 successful run creation leaves the run scheduled'
);
select phase10d_test.assert_true(
  not exists (select 1 from public.routine_runs where snapshot_state = 'building'),
  '016 no building run remains after successful snapshot creation'
);
select phase10d_test.assert_true(
  (select count(*) = 1 from public.routine_runs
   where organization_id = 'a1000000-0000-4000-8000-000000000001'
     and operational_date = '2026-08-05' and routine_key = 'daily-run-test'
     and scope_key = 'default' and status not in ('cancelled', 'superseded')),
  '017 exactly one authoritative logical run exists'
);
select phase10d_test.assert_true(
  (select run.template_version_id = template.current_published_version_id
          and run.template_id = template.id
   from public.routine_runs run
   join public.routine_templates template on template.id = run.template_id
   where run.id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')),
  '018 the run pins the current published template version'
);
select phase10d_test.assert_true(
  (select run.template_version_number_snapshot = version.version_number
          and run.template_content_hash_snapshot = version.content_hash
   from public.routine_runs run
   join public.routine_template_versions version on version.id = run.template_version_id
   where run.id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')),
  '019 version number and published content hash are pinned'
);
select phase10d_test.assert_true(
  (select snapshot_hash ~ '^[0-9a-f]{64}$' from public.routine_runs
   where id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')),
  '020 the ready snapshot stores a SHA-256 hash'
);
select phase10d_test.assert_true(
  (select snapshot_hash = public.routine_compute_run_snapshot_hash(id)
   from public.routine_runs
   where id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')),
  '021 recomputed snapshot hash matches the stored hash'
);
select phase10d_test.assert_true(
  (select count(*) = 1 from public.routine_run_sections
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')),
  '022 template sections are copied exactly once'
);
select phase10d_test.assert_true(
  (select count(*) = 2 from public.routine_run_tasks
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')),
  '023 template tasks are copied exactly once'
);
select phase10d_test.assert_true(
  (select done_criteria_snapshot = 'Every source is reviewed.'
          and completion_policy_snapshot = 'standard_required'
          and criticality_snapshot = 'important'
   from public.routine_run_tasks
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
     and task_key_snapshot = 'task-alpha'),
  '024 task policies and done criteria are snapshotted'
);
select phase10d_test.assert_true(
  (select count(*) = 1 from public.routine_run_task_items
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
     and source_kind_snapshot = 'static' and not generated_from_source),
  '025 static task items copy one stable non-generated row'
);
select phase10d_test.assert_true(
  (select count(*) = 2 from public.routine_run_task_items
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
     and source_kind_snapshot = 'location_set' and generated_from_source),
  '026 location set expands to two deterministic member items'
);
select phase10d_test.assert_true(
  (select array_agg(location_key_snapshot order by sort_order_snapshot)
          = array['run-main','run-store']::text[]
   from public.routine_run_task_items
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
     and source_kind_snapshot = 'location_set'),
  '027 location-set expansion preserves deterministic membership order'
);
select phase10d_test.assert_true(
  (select standard_key_snapshot = 'run-temperature'
          and standard_revision_number_snapshot = 1
          and standard_value_snapshot->'value'->>'value' = '4'
          and standard_value_snapshot->>'unit' = 'C'
   from public.routine_run_task_items
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
     and source_kind_snapshot = 'routine_standard'),
  '028 concrete standard revision value unit and type are snapshotted'
);
select phase10d_test.assert_true(
  (select count(*) = 2 from public.routine_run_task_items
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
     and source_kind_snapshot = 'inventory_readonly'),
  '029 inventory_readonly expands one item per active location standard'
);
select phase10d_test.assert_true(
  (select bool_and(
     source_record_snapshot ? 'inventoryLocationId'
     and source_record_snapshot ? 'productId'
     and source_record_snapshot ? 'targetQuantity'
     and source_record_snapshot ? 'stockPolicy'
   ) from public.routine_run_task_items
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
     and source_kind_snapshot = 'inventory_readonly'),
  '030 inventory snapshot includes location product target and stock policy'
);
select phase10d_test.assert_true(
  (select count(*) = 1 from public.routine_run_task_items
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
     and source_kind_snapshot = 'asset_registry_readonly'
     and source_record_snapshot->>'assetType' = 'tablet'
     and source_record_snapshot->>'expectedVenue' = 'Youngstorget'
     and source_record_snapshot->>'condition' = 'ok'),
  '031 asset adapter snapshots the relevant active asset'
);
select phase10d_test.assert_true(
  (select count(*) = 0 from public.routine_run_task_items
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
     and source_kind_snapshot = 'asset_registry_readonly'
     and source_record_snapshot->>'active' = 'false'),
  '032 inactive assets are excluded from active-assets snapshots'
);
select phase10d_test.assert_true(
  (select resolution_state = 'pending_external' and record_count = 0
   from public.routine_run_snapshot_sources
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
     and source_kind = 'event_context'),
  '033 event_context is recorded as pending_external without event authority'
);
select phase10d_test.assert_true(
  (select count(*) = 6 from public.routine_run_snapshot_sources
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')),
  '034 one deterministic source record exists per template source item'
);
select phase10d_test.assert_true(
  (select bool_and(source_hash ~ '^[0-9a-f]{64}$')
   from public.routine_run_snapshot_sources
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
     and resolution_state = 'resolved'),
  '035 resolved source records have deterministic SHA-256 hashes'
);
select phase10d_test.assert_true(
  (select evaluation_state = 'not_required' and task.inclusion_state = 'included'
   from public.routine_run_condition_evaluations condition
   join public.routine_run_tasks task on task.id = condition.run_task_id
   where task.run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
     and task.task_key_snapshot = 'task-alpha'),
  '036 empty condition creates not_required evaluation and included task'
);
select phase10d_test.assert_true(
  (select evaluation_state = 'pending' and task.inclusion_state = 'pending'
   from public.routine_run_condition_evaluations condition
   join public.routine_run_tasks task on task.id = condition.run_task_id
   where task.run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
     and task.task_key_snapshot = 'task-beta'),
  '037 non-empty condition creates pending evaluation and pending inclusion'
);
select phase10d_test.assert_true(
  (select count(*) = 1 from public.routine_run_task_dependencies dependency
   join public.routine_run_tasks predecessor on predecessor.id = dependency.predecessor_run_task_id
   join public.routine_run_tasks successor on successor.id = dependency.successor_run_task_id
   where dependency.run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
     and predecessor.task_key_snapshot = 'task-alpha'
     and successor.task_key_snapshot = 'task-beta'),
  '038 dependencies remap to run-task IDs in the same run'
);
select phase10d_test.assert_true(
  (select count(*) = 1 from public.routine_run_task_relations relation
   where relation.run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
     and relation.target_routine_key_snapshot = 'daily-run-test'
     and relation.target_task_key_snapshot = 'task-alpha'),
  '039 cross-run relations retain stable target keys without resolving status'
);
select phase10d_test.assert_true(
  (select count(*) = 2 from public.routine_run_task_reference_images
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')),
  '040 task and task-item reference links snapshot two concrete versions'
);
select phase10d_test.assert_true(
  (select count(*) = 1 from public.routine_run_task_reference_images
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
     and image_state_snapshot = 'placeholder' and object_path_snapshot is null),
  '041 placeholder reference snapshot carries no object path'
);
select phase10d_test.assert_true(
  (select count(*) = 1 from public.routine_run_task_reference_images
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
     and image_state_snapshot = 'active_image' and object_path_snapshot is not null
     and run_task_item_id is not null),
  '042 active image snapshots an exact version path and item link'
);
select phase10d_test.assert_true(
  (select bool_and(row_snapshot_hash ~ '^[0-9a-f]{64}$') from public.routine_run_sections
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')),
  '043 section row hashes are deterministic SHA-256 values'
);
select phase10d_test.assert_true(
  (select bool_and(row_snapshot_hash ~ '^[0-9a-f]{64}$') from public.routine_run_tasks
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')),
  '044 task row hashes are deterministic SHA-256 values'
);
select phase10d_test.assert_true(
  (select bool_and(row_snapshot_hash ~ '^[0-9a-f]{64}$') from public.routine_run_task_items
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')),
  '045 task-item row hashes are deterministic SHA-256 values'
);
select phase10d_test.assert_true(
  (select count(*) = 1 from public.routine_run_participants
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
     and user_profile_id = '11000000-0000-4000-8000-000000000001'),
  '046 run creator is added as one participant'
);
select phase10d_test.assert_true(
  (select count(*) = 1 from public.routine_run_operations
   where operation_type = 'create_run'
     and resource_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')),
  '047 create operation is recorded once in the immutable ledger'
);

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set local role authenticated;
select phase10d_test.assert_true(
  (public.create_or_get_routine_run(
    'daily-run-test', 'default', '2026-08-05',
    'd9000000-0000-4000-8000-000000000001'
  )->>'idempotentReplay')::boolean,
  '048 same idempotency key and request replay the stored create result'
);
select phase10d_test.assert_true(
  (public.create_or_get_routine_run(
    'daily-run-test', 'default', '2026-08-05',
    'd9000000-0000-4000-8000-000000000002'
  )->'run'->>'id') = (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run'),
  '049 a different idempotency key converges on the same logical run ID'
);
select phase10d_test.expect_error(
  $$select public.create_or_get_routine_run(
      'daily-run-test', 'default', '2026-08-06',
      'd9000000-0000-4000-8000-000000000001')$$,
  'different', '050 same create key with a changed request is rejected'
);
reset role;

select phase10d_test.assert_true(
  (select count(*) = 2 from public.routine_run_operations where operation_type = 'create_run'),
  '051 convergent create keys each retain one immutable operation result'
);
select phase10d_test.assert_true(
  not exists (select 1 from pg_catalog.pg_proc where pronamespace = 'public'::regnamespace
              and proname in ('complete_routine_task', 'block_routine_task',
                              'finish_routine_run', 'reopen_routine_run')),
  '052 Phase 10D exposes no task-completion or run-finish mutation RPC'
);
select phase10d_test.assert_true(
  not exists (select 1 from pg_catalog.pg_proc where pronamespace = 'public'::regnamespace
              and proname like '%condition%' and proname like '%evaluate%'),
  '053 Phase 10D exposes no condition-evaluation mutation RPC'
);

-- Source changes after creation must never alter the old run.
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set local role authenticated;
select public.replace_routine_location_set_members(
  (select id from public.routine_location_sets where set_key = 'run-locations'),
  jsonb_build_array(jsonb_build_object(
    'locationId', (select id from public.routine_locations where location_key = 'run-main'),
    'sortOrder', 0, 'required', true, 'metadata', '{"zone":"front-updated"}'::jsonb
  )),
  (select revision from public.routine_location_sets where set_key = 'run-locations')
);
select public.create_routine_standard_revision(
  (select id from public.routine_standards where standard_key = 'run-temperature'),
  '{"value":5}'::jsonb, null, 'Later manager revision',
  'd5000000-0000-4000-8000-000000000002',
  (select revision from public.routine_standards where standard_key = 'run-temperature')
);
reset role;

select phase10d_test.assert_true(
  (select count(*) = 2 from public.routine_run_task_items
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
     and source_kind_snapshot = 'location_set'),
  '054 later location-set membership changes do not affect the existing run'
);
select phase10d_test.assert_true(
  (select standard_revision_number_snapshot = 1
          and standard_value_snapshot->'value'->>'value' = '4'
   from public.routine_run_task_items
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
     and source_kind_snapshot = 'routine_standard'),
  '055 later standard revisions do not affect the existing run'
);
select phase10d_test.assert_true(
  (select snapshot_hash = public.routine_compute_run_snapshot_hash(id)
   from public.routine_runs
   where id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')),
  '056 external source changes do not alter the stored run snapshot hash'
);

-- Mutable projections and timestamps are excluded from the hash.
insert into phase10d_fixture.state (key, value)
select 'hash_before_projection', to_jsonb(public.routine_compute_run_snapshot_hash(
  (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
)) on conflict (key) do update set value = excluded.value;
select set_config('mesh.routine_run_internal', 'phase10d-test', true);
update public.routine_run_tasks
set status = 'in_progress', revision = revision + 1
where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
  and task_key_snapshot = 'task-alpha';
update public.routine_runs
set updated_at = updated_at + interval '1 second'
where id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run');
select phase10d_test.assert_true(
  (select value #>> '{}' from phase10d_fixture.state where key = 'hash_before_projection')
    = public.routine_compute_run_snapshot_hash(
      (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
    ),
  '057 mutable task status and updated timestamp do not affect snapshot hash'
);
update public.routine_run_tasks
set status = 'not_started', revision = revision + 1
where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
  and task_key_snapshot = 'task-alpha';

select phase10d_test.assert_true(
  (select snapshot_hash = public.routine_compute_run_snapshot_hash(id)
   from public.routine_runs
   where id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')),
  '058 actor and mutable audit fields are absent from snapshot identity'
);

-- Staff sees nothing before joining.
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', false);
set local role authenticated;
select phase10d_test.assert_true(
  (select count(*) = 0 from public.routine_runs),
  '059 same-organization staff cannot see a run before joining'
);
select phase10d_test.assert_true(
  jsonb_array_length(public.list_routine_runs_for_date('2026-08-05')) = 0,
  '060 staff list-by-date is empty before participation'
);
reset role;

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', false);
set local role authenticated;
select phase10d_test.assert_true(
  (select count(*) = 0 from storage.objects object
   where object.bucket_id = 'routine-reference-images'
     and object.name = (
       select image.object_path_snapshot
       from public.routine_run_task_reference_images image
       where image.run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
         and image.image_state_snapshot = 'active_image'
     )),
  '061 non-participant staff cannot read a run-only image object'
);
insert into phase10d_fixture.state (key, value)
values (
  'staff_join',
  public.join_routine_run(
    (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run'),
    'd9100000-0000-4000-8000-000000000001'
  )
) on conflict (key) do update set value = excluded.value;
select phase10d_test.assert_true(
  (select value->'participant'->>'user_profile_id' = '11000000-0000-4000-8000-000000000002'
   from phase10d_fixture.state where key = 'staff_join'),
  '062 active personal staff can join the ready run'
);
select phase10d_test.assert_true(
  (public.join_routine_run(
    (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run'),
    'd9100000-0000-4000-8000-000000000001'
  )->>'idempotentReplay')::boolean,
  '063 exact join replay returns the immutable stored result'
);
select phase10d_test.assert_true(
  (public.join_routine_run(
    (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run'),
    'd9100000-0000-4000-8000-000000000002'
  )->'participant'->>'id') = (select value->'participant'->>'id' from phase10d_fixture.state where key = 'staff_join'),
  '064 a second join key returns the same participant without duplication'
);
select phase10d_test.assert_true(
  (select count(*) = 1 from public.routine_run_participants
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
     and user_profile_id = '11000000-0000-4000-8000-000000000002'),
  '065 repeated joins create exactly one participant row'
);
select phase10d_test.assert_true(
  (select count(*) = 1 from public.routine_runs),
  '066 participant RLS reveals the joined run'
);
select phase10d_test.assert_true(
  (select count(*) = 0 from public.routine_run_operations),
  '067 ordinary participant cannot read the manager operation ledger'
);
select phase10d_test.assert_true(
  jsonb_array_length(public.get_routine_run_workspace(
    (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
  )->'tasks') = 2,
  '068 participant workspace returns the full task snapshot'
);
select phase10d_test.assert_true(
  not (public.get_routine_run_workspace(
    (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
  ) ? 'operations'),
  '069 participant workspace omits the manager operation ledger'
);
select phase10d_test.assert_true(
  jsonb_array_length(public.list_routine_runs_for_date('2026-08-05')) = 1,
  '070 participant list-by-date returns the joined run'
);
select phase10d_test.expect_error(
  $$select public.create_or_get_routine_run(
      'daily-run-test', 'staff-scope', '2026-08-05',
      'd9100000-0000-4000-8000-000000000003')$$,
  'coordinator', '071 staff cannot create a run in Phase 10D'
);
select phase10d_test.expect_error(
  format($sql$select public.assign_routine_run_role(
      %L, %L, 'opening_responsible', 'global', null, 1,
      'd9100000-0000-4000-8000-000000000004')$sql$,
      (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run'),
      (select value->'participant'->>'id' from phase10d_fixture.state where key = 'staff_join')),
  'coordinator', '072 staff cannot assign operative roles'
);
reset role;

-- Coordinator joins and manager assigns/replaces a role with history.
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000003', false);
set local role authenticated;
select phase10d_test.assert_true(
  (select count(*) = 1 from public.routine_runs),
  '073 shift lead coordinator sees own-organization operative runs'
);
insert into phase10d_fixture.state (key, value)
values (
  'lead_join',
  public.join_routine_run(
    (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run'),
    'd9200000-0000-4000-8000-000000000001'
  )
) on conflict (key) do update set value = excluded.value;
reset role;

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set local role authenticated;
insert into phase10d_fixture.state (key, value)
values (
  'first_role',
  public.assign_routine_run_role(
    (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run'),
    (select (value->'participant'->>'id')::uuid from phase10d_fixture.state where key = 'staff_join'),
    'opening_responsible', 'global', null,
    (select revision from public.routine_runs
     where id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')),
    'd9300000-0000-4000-8000-000000000001'
  )
) on conflict (key) do update set value = excluded.value;
select phase10d_test.assert_true(
  (select value->'assignment'->>'status' = 'active'
   from phase10d_fixture.state where key = 'first_role'),
  '074 manager assigns a valid participant to an operative role'
);
select phase10d_test.expect_error(
  format($sql$select public.assign_routine_run_role(
      %L, %L, 'opening_responsible', 'global', null, %s,
      'd9300000-0000-4000-8000-000000000002')$sql$,
      (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run'),
      (select value->'participant'->>'id' from phase10d_fixture.state where key = 'lead_join'),
      (select revision from public.routine_runs
       where id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run'))),
  'reason', '075 role replacement requires a substantive reason'
);
insert into phase10d_fixture.state (key, value)
values (
  'replacement_role',
  public.assign_routine_run_role(
    (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run'),
    (select (value->'participant'->>'id')::uuid from phase10d_fixture.state where key = 'lead_join'),
    'opening_responsible', 'global', 'Shift lead takes responsibility',
    (select revision from public.routine_runs
     where id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')),
    'd9300000-0000-4000-8000-000000000003'
  )
) on conflict (key) do update set value = excluded.value;
select phase10d_test.assert_true(
  (select count(*) = 1 from public.routine_run_role_assignments
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
     and role_key = 'opening_responsible' and scope_key = 'global' and status = 'active'),
  '076 replacement leaves exactly one active role assignment'
);
select phase10d_test.assert_true(
  (select count(*) = 1 from public.routine_run_role_assignments
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
     and role_key = 'opening_responsible' and status = 'superseded'
     and ended_at is not null and ended_by_auth_user_id is not null),
  '077 replacement ends but preserves the previous assignment history'
);
select phase10d_test.assert_true(
  (select replaces_assignment_id = (select (value->'assignment'->>'id')::uuid
                                    from phase10d_fixture.state where key = 'first_role')
   from public.routine_run_role_assignments
   where id = (select (value->'assignment'->>'id')::uuid
               from phase10d_fixture.state where key = 'replacement_role')),
  '078 replacement row links to the prior same-run assignment'
);
select phase10d_test.expect_error(
  format($sql$select public.assign_routine_run_role(
      %L, %L, 'closing_responsible', 'global', null, 1,
      'd9300000-0000-4000-8000-000000000004')$sql$,
      (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run'),
      (select value->'participant'->>'id' from phase10d_fixture.state where key = 'staff_join')),
  'stale', '079 stale run revision is rejected before role assignment'
);
select phase10d_test.assert_true(
  (public.assign_routine_run_role(
    (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run'),
    (select (value->'participant'->>'id')::uuid from phase10d_fixture.state where key = 'lead_join'),
    'opening_responsible', 'global', 'Shift lead takes responsibility',
    ((select value->'run'->>'revision' from phase10d_fixture.state where key = 'replacement_role')::bigint - 1),
    'd9300000-0000-4000-8000-000000000003'
  )->>'idempotentReplay')::boolean,
  '080 exact role-assignment replay succeeds despite the old expected revision'
);
select phase10d_test.assert_true(
  (select count(*) >= 1 from public.routine_run_operations),
  '081 manager can read the own-organization operation ledger'
);
reset role;

-- Replace the logical reference after the run; the run must keep the old version.
insert into phase10d_fixture.state (key, value)
select 'old_run_image', jsonb_build_object(
  'versionId', image.reference_version_id_snapshot,
  'objectPath', image.object_path_snapshot
)
from public.routine_run_task_reference_images image
where image.run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
  and image.image_state_snapshot = 'active_image'
on conflict (key) do update set value = excluded.value;

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set local role authenticated;
insert into phase10d_fixture.state (key, value)
select 'replacement_prepare', public.prepare_routine_reference_upload(
  reference.id, 'replacement.png', 'image/png', 8,
  'Replacement caption', 'Replacement alternative text', reference.revision,
  'd9400000-0000-4000-8000-000000000001'
)
from public.routine_reference_images reference where reference.reference_key = 'run-active-image'
on conflict (key) do update set value = excluded.value;
insert into storage.objects (bucket_id, name, metadata)
select 'routine-reference-images', value->>'objectPath',
  '{"size":8,"mimetype":"image/png"}'::jsonb
from phase10d_fixture.state where key = 'replacement_prepare';
select public.finalize_routine_reference_upload(
  (value->>'versionId')::uuid, (value->>'referenceRevision')::bigint,
  (value->>'versionRevision')::bigint,
  'd9400000-0000-4000-8000-000000000002'
)
from phase10d_fixture.state where key = 'replacement_prepare';
reset role;

select phase10d_test.assert_true(
  (select reference_version_id_snapshot = (select (value->>'versionId')::uuid
                                           from phase10d_fixture.state where key = 'old_run_image')
   from public.routine_run_task_reference_images
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
     and image_state_snapshot = 'active_image'),
  '082 later image replacement does not change the run version snapshot'
);
select phase10d_test.assert_true(
  (select current_version_id <> (select (value->>'versionId')::uuid
                                 from phase10d_fixture.state where key = 'old_run_image')
   from public.routine_reference_images where reference_key = 'run-active-image'),
  '083 logical reference current pointer advances independently of the run'
);
select phase10d_test.assert_true(
  (select object_path_snapshot = (select value->>'objectPath'
                                  from phase10d_fixture.state where key = 'old_run_image')
   from public.routine_run_task_reference_images
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
     and image_state_snapshot = 'active_image'),
  '084 historical run keeps the exact original Storage path'
);

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', false);
set local role authenticated;
select phase10d_test.assert_true(
  (select count(*) = 1 from storage.objects object
   where object.bucket_id = 'routine-reference-images'
     and object.name = (select value->>'objectPath' from phase10d_fixture.state where key = 'old_run_image')),
  '085 participant can still read the non-current historical run image'
);
select phase10d_test.assert_true(
  (select count(*) = 0 from storage.objects object
   where object.bucket_id = 'routine-reference-images'
     and object.name is null),
  '086 placeholder snapshot never grants an object read'
);
reset role;

select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000001', false);
set local role authenticated;
select phase10d_test.assert_true(
  (select count(*) = 0 from public.routine_runs),
  '087 cross-organization manager cannot select the run'
);
select phase10d_test.assert_true(
  (select count(*) = 0 from storage.objects object
   where object.bucket_id = 'routine-reference-images'
     and object.name = (select value->>'objectPath' from phase10d_fixture.state where key = 'old_run_image')),
  '088 cross-organization user cannot read the historical image'
);
select phase10d_test.expect_error(
  format($sql$select public.join_routine_run(%L, 'd9500000-0000-4000-8000-000000000001')$sql$,
         (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run')),
  'same-organization', '089 cross-organization join RPC is rejected'
);
reset role;

-- Inactive, organization-less, counter, shared-device, and anon are blocked.
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000004', false);
set local role authenticated;
select phase10d_test.assert_true((select count(*) = 0 from public.routine_runs), '090 inactive user has no run access');
select phase10d_test.expect_error(
  format($sql$select public.join_routine_run(%L, 'd9500000-0000-4000-8000-000000000002')$sql$,
         (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run')),
  'active personal', '091 inactive user cannot join through RPC'
);
reset role;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000005', false);
set local role authenticated;
select phase10d_test.assert_true((select count(*) = 0 from public.routine_runs), '092 organization-less user has no run access');
reset role;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000006', false);
set local role authenticated;
select phase10d_test.assert_true((select count(*) = 0 from public.routine_runs), '093 Inventory counter receives no routine access automatically');
select phase10d_test.expect_error(
  format($sql$select public.join_routine_run(%L, 'd9500000-0000-4000-8000-000000000003')$sql$,
         (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run')),
  'active personal', '094 Inventory counter cannot join a routine run'
);
reset role;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000007', false);
set local role authenticated;
select phase10d_test.assert_true((select count(*) = 0 from public.routine_runs), '095 shared-device profile is blocked before Phase 10J');
reset role;
set local role anon;
select phase10d_test.expect_error('select * from public.routine_runs', 'permission', '096 anon has no Phase 10D table access');
select phase10d_test.expect_error(
  $$select public.join_routine_run(
      '00000000-0000-4000-8000-000000000001',
      'd9500000-0000-4000-8000-000000000004')$$,
  'permission', '097 anon cannot execute run RPCs'
);
reset role;

-- Direct authenticated DML is blocked even for a participant.
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', false);
set local role authenticated;
select phase10d_test.expect_error(
  format('update public.routine_runs set status = %L where id = %L', 'in_progress',
         (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run')),
  'permission', '098 authenticated direct run UPDATE is blocked'
);
select phase10d_test.expect_error(
  format('delete from public.routine_run_tasks where run_id = %L',
         (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run')),
  'permission', '099 authenticated direct task DELETE is blocked'
);
select phase10d_test.expect_error(
  $$insert into public.routine_run_operations(
      organization_id, actor_auth_user_id, operation_type, idempotency_key,
      request_hash, resource_type, response_payload)
    values ('a1000000-0000-4000-8000-000000000001',
      '11000000-0000-4000-8000-000000000002', 'join_run',
      'd9600000-0000-4000-8000-000000000001', repeat('0',64),
      'participant', '{}'::jsonb)$$,
  'permission', '100 authenticated direct operation INSERT is blocked'
);
reset role;

-- Owner-level trigger probes prove immutable history even beyond grants/RLS.
select phase10d_test.expect_error(
  format('update public.routine_run_sections set title_snapshot = %L where run_id = %L',
         'tampered', (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run')),
  'immutable', '101 run sections reject UPDATE'
);
select phase10d_test.expect_error(
  format('delete from public.routine_run_sections where run_id = %L',
         (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run')),
  'immutable', '102 run sections reject DELETE'
);
select phase10d_test.expect_error(
  format('update public.routine_run_tasks set title_snapshot = %L where run_id = %L',
         'tampered', (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run')),
  'immutable', '103 task snapshot fields reject UPDATE'
);
select phase10d_test.expect_error(
  format('update public.routine_run_task_items set label_snapshot = %L where run_id = %L',
         'tampered', (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run')),
  'immutable', '104 task-item snapshot fields reject UPDATE'
);
select phase10d_test.expect_error(
  format('update public.routine_run_condition_evaluations set condition_json_snapshot = %L::jsonb where run_id = %L',
         '{"tampered":true}', (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run')),
  'immutable', '105 condition snapshot fields reject UPDATE'
);
select phase10d_test.expect_error(
  format('update public.routine_run_snapshot_sources set record_count = 99 where run_id = %L',
         (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run')),
  'immutable', '106 snapshot source rows reject UPDATE'
);
select phase10d_test.expect_error(
  format('delete from public.routine_run_task_dependencies where run_id = %L',
         (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run')),
  'immutable', '107 dependency snapshots reject DELETE'
);
select phase10d_test.expect_error(
  format('update public.routine_run_task_relations set target_task_key_snapshot = %L where run_id = %L',
         'tampered', (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run')),
  'immutable', '108 relation snapshots reject UPDATE'
);
select phase10d_test.expect_error(
  format('update public.routine_run_task_reference_images set caption_snapshot = %L where run_id = %L',
         'tampered', (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run')),
  'immutable', '109 image snapshots reject UPDATE'
);
select phase10d_test.expect_error(
  format('update public.routine_run_participants set display_name_snapshot = %L where run_id = %L',
         'tampered', (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run')),
  'immutable', '110 participant name and role snapshots reject UPDATE'
);
select phase10d_test.expect_error(
  'update public.routine_run_operations set response_payload = ''{"tampered":true}''::jsonb',
  'immutable', '111 operation rows reject UPDATE'
);
select phase10d_test.expect_error(
  'delete from public.routine_run_operations',
  'immutable', '112 operation rows reject DELETE'
);
select phase10d_test.expect_error(
  format('delete from public.routine_runs where id = %L',
         (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run')),
  'cannot be deleted', '113 routine runs reject direct DELETE'
);
select phase10d_test.expect_error(
  format('update public.routine_runs set routine_key = %L where id = %L',
         'tampered', (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run')),
  'immutable', '114 ready run identity rejects UPDATE'
);
select phase10d_test.expect_error(
  format('update public.routine_runs set template_version_id = gen_random_uuid() where id = %L',
         (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run')),
  'immutable', '115 pinned template version rejects UPDATE'
);
select phase10d_test.expect_error(
  format('update public.routine_runs set snapshot_hash = repeat(''0'',64) where id = %L',
         (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run')),
  'immutable', '116 ready snapshot hash rejects UPDATE'
);

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set local role authenticated;
select phase10d_test.assert_true(
  (public.verify_routine_run_snapshot(
    (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
  )->>'valid')::boolean,
  '117 read-only snapshot verification reports the intact snapshot valid'
);
select phase10d_test.assert_true(
  (public.verify_routine_run_snapshot(
    (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
  )->>'pendingConditionCount')::integer = 1,
  '118 snapshot verification reports one pending condition'
);
select phase10d_test.assert_true(
  (public.verify_routine_run_snapshot(
    (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
  )->>'pendingExternalSourceCount')::integer = 1,
  '119 snapshot verification reports one pending external source'
);
select phase10d_test.assert_true(
  jsonb_array_length(public.get_routine_run_workspace(
    (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
  )->'snapshotSources') = 6,
  '120 workspace returns the complete deterministic source structure'
);
reset role;

-- A later run snapshots later source revisions while the first remains frozen.
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set local role authenticated;
insert into phase10d_fixture.state (key, value)
values (
  'later_run',
  public.create_or_get_routine_run(
    'daily-run-test', 'default', '2026-08-06',
    'da000000-0000-4000-8000-000000000001'
  )
) on conflict (key) do update set value = excluded.value;
reset role;
select phase10d_test.assert_true(
  (select count(*) = 1 from public.routine_run_task_items
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'later_run')
     and source_kind_snapshot = 'location_set'),
  '121 a later run snapshots the later one-member location set'
);
select phase10d_test.assert_true(
  (select standard_revision_number_snapshot = 2
          and standard_value_snapshot->'value'->>'value' = '5'
   from public.routine_run_task_items
   where run_id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'later_run')
     and source_kind_snapshot = 'routine_standard'),
  '122 a later run pins the later standard revision without rewriting the first'
);
select phase10d_test.assert_true(
  (select count(*) = 2 from public.routine_runs
   where routine_key = 'daily-run-test' and snapshot_state = 'ready'),
  '123 different operational dates create distinct authoritative runs'
);
select phase10d_test.assert_true(
  (select count(*) = 2 from public.inventory_products)
  and (select count(*) = 2 from public.inventory_locations)
  and (select count(*) = 2 from public.inventory_location_products),
  '124 run snapshotting writes no Inventory source row'
);
select phase10d_test.assert_true(
  (select count(*) = 2 from public.asset_registry),
  '125 run snapshotting writes no Asset Registry source row'
);
select phase10d_test.assert_true(
  (select count(*) = 0 from public.event_operations),
  '126 pending event context writes no Event Operations row'
);
select phase10d_test.assert_true(
  (select content_hash = public.routine_template_version_content_hash(id)
   from public.routine_template_versions
   where id = (select template_version_id from public.routine_runs
               where id = (select (value->'run'->>'id')::uuid
                           from phase10d_fixture.state where key = 'main_run'))),
  '127 published template hash remains stable after all run operations'
);

-- Draft/discarded/inactive templates cannot create operational runs.
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set local role authenticated;
select public.create_routine_template(
  'draft-only-test', 'Draft only', 'Never operational',
  'da100000-0000-4000-8000-000000000001'
);
select phase10d_test.expect_error(
  $$select public.create_or_get_routine_run(
      'draft-only-test', 'default', '2026-08-05',
      'da100000-0000-4000-8000-000000000002')$$,
  'current published', '128 a draft template cannot create a run'
);
select public.discard_routine_template_draft(
  version.id, 'Discarded source must not run', version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
where template.routine_key = 'draft-only-test' and version.state = 'draft';
select phase10d_test.expect_error(
  $$select public.create_or_get_routine_run(
      'draft-only-test', 'default', '2026-08-05',
      'da100000-0000-4000-8000-000000000003')$$,
  'current published', '129 a discarded version cannot create a run'
);
reset role;

update public.routine_templates set active = false
where routine_key = 'daily-run-test';
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set local role authenticated;
select phase10d_test.expect_error(
  $$select public.create_or_get_routine_run(
      'daily-run-test', 'inactive-scope', '2026-08-05',
      'da100000-0000-4000-8000-000000000004')$$,
  'current published', '130 an inactive template cannot create a run'
);
reset role;
update public.routine_templates set active = true
where routine_key = 'daily-run-test';

-- Invalid source resolution must roll back the complete run.
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set local role authenticated;
select public.create_routine_template(
  'bad-inventory-test', 'Bad inventory source', 'Rollback fixture',
  'da200000-0000-4000-8000-000000000001'
);
select public.upsert_routine_draft_section(
  version.id, null, 'source', 'Source', null, 'startup', 0, true,
  null, version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
where template.routine_key = 'bad-inventory-test' and version.state = 'draft';
select public.upsert_routine_draft_task(
  version.id, section.id, null,
  jsonb_build_object(
    'taskKey', 'bad-source-task', 'title', 'Bad source task',
    'doneCriteria', 'Source exists', 'taskType', 'control',
    'mandatory', true, 'locationDescription', 'Fixture',
    'sortOrder', 0, 'condition', '{}'::jsonb, 'metadata', '{}'::jsonb
  ), null, version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_sections section on section.version_id = version.id
where template.routine_key = 'bad-inventory-test' and version.state = 'draft';
select public.upsert_routine_draft_task_item(
  version.id, task.id, null,
  jsonb_build_object(
    'itemKey', 'missing-location', 'label', 'Missing location',
    'itemType', 'product', 'required', true,
    'sourceKind', 'inventory_readonly',
    'sourceConfig', '{"mode":"location_standards","locationCodes":["DOES-NOT-EXIST"],"activeOnly":true}'::jsonb,
    'inputSchema', '{}'::jsonb, 'sortOrder', 0, 'metadata', '{}'::jsonb
  ), null, version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_tasks task on task.version_id = version.id
where template.routine_key = 'bad-inventory-test' and version.state = 'draft';
select public.publish_routine_template_versions(
  array[version.id], jsonb_build_object(version.id::text, version.revision),
  'Bad inventory source rollback fixture',
  'da200000-0000-4000-8000-000000000002'
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
where template.routine_key = 'bad-inventory-test' and version.state = 'draft';
select phase10d_test.expect_error(
  $$select public.create_or_get_routine_run(
      'bad-inventory-test', 'default', '2026-08-05',
      'da200000-0000-4000-8000-000000000003')$$,
  'missing or inactive', '131 missing mandatory inventory location fails snapshot creation'
);
reset role;
select phase10d_test.assert_true(
  (select count(*) = 0 from public.routine_runs where routine_key = 'bad-inventory-test'),
  '132 failed source resolution rolls back the complete run row'
);
select phase10d_test.assert_true(
  not exists (select 1 from public.routine_runs where snapshot_state = 'building'),
  '133 failed snapshot creation leaves no building run'
);

-- Constraint and tenant probes.
select phase10d_test.expect_error(
  format($sql$insert into public.routine_run_participants(
      organization_id, run_id, user_profile_id, display_name_snapshot,
      role_snapshot, creation_idempotency_key,
      created_by_auth_user_id, updated_by_auth_user_id)
    values ('b2000000-0000-4000-8000-000000000001', %L,
      '22000000-0000-4000-8000-000000000001', 'Cross org', 'manager',
      'da300000-0000-4000-8000-000000000001',
      '22000000-0000-4000-8000-000000000001',
      '22000000-0000-4000-8000-000000000001')$sql$,
      (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run')),
  'foreign key', '134 cross-organization participant is rejected'
);
select phase10d_test.expect_error(
  format($sql$insert into public.routine_run_role_assignments(
      organization_id, run_id, participant_id, role_key, scope_key,
      assigned_by_auth_user_id)
    values ('a1000000-0000-4000-8000-000000000001', %L, %L,
      'worker', 'global', '11000000-0000-4000-8000-000000000001')$sql$,
      (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run'),
      (select value->'participant'->>'id' from phase10d_fixture.state where key = 'staff_join')),
  'role_check', '135 invalid singleton worker role is rejected'
);
select phase10d_test.expect_error(
  format($sql$update public.routine_runs set status = 'invalid-status'
    where id = %L$sql$,
    (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run')),
  'status_check', '136 invalid run status is rejected'
);
select phase10d_test.expect_error(
  format($sql$update public.routine_runs set revision = 0
    where id = %L$sql$,
    (select value->'run'->>'id' from phase10d_fixture.state where key = 'main_run')),
  'revision_check', '137 non-positive run revision is rejected'
);

-- Verification detects owner-level test tampering, then state is restored.
insert into phase10d_fixture.state (key, value)
select 'stored_hash_before_tamper', to_jsonb(snapshot_hash)
from public.routine_runs
where id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
on conflict (key) do update set value = excluded.value;
alter table public.routine_runs disable trigger routine_runs_guard;
update public.routine_runs set snapshot_hash = repeat('0', 64)
where id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set local role authenticated;
select phase10d_test.assert_true(
  not (public.verify_routine_run_snapshot(
    (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')
  )->>'valid')::boolean,
  '138 snapshot verification detects manipulated stored hash'
);
reset role;
update public.routine_runs
set snapshot_hash = (select value #>> '{}' from phase10d_fixture.state where key = 'stored_hash_before_tamper')
where id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run');
alter table public.routine_runs enable trigger routine_runs_guard;
select phase10d_test.assert_true(
  (select snapshot_hash = public.routine_compute_run_snapshot_hash(id)
   from public.routine_runs
   where id = (select (value->'run'->>'id')::uuid from phase10d_fixture.state where key = 'main_run')),
  '139 tamper probe restores the valid immutable snapshot state'
);

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', false);
set local role authenticated;
select phase10d_test.expect_error(
  $$insert into storage.objects(bucket_id, name, metadata)
    values ('routine-reference-images', 'arbitrary/path.jpg',
            '{"size":1,"mimetype":"image/jpeg"}'::jsonb)$$,
  'row-level security', '140 Phase 10D grants no new arbitrary upload access'
);
delete from storage.objects where bucket_id = 'routine-reference-images'
  and name = (select value->>'objectPath' from phase10d_fixture.state where key = 'old_run_image');
select phase10d_test.assert_true(
  (select count(*) = 1 from storage.objects
   where bucket_id = 'routine-reference-images'
     and name = (select value->>'objectPath' from phase10d_fixture.state where key = 'old_run_image')),
  '141 Phase 10D grants no participant delete access to historical images'
);
reset role;
select phase10d_test.assert_true(
  (select count(*) = 8 from auth.users),
  '142 Auth fixture identities remain unchanged by Phase 10D operations'
);

commit;

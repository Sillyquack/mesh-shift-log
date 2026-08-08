-- Executable Phase 10A schema, integrity, authorization, and RLS assertions.
create schema phase10_test;
revoke all on schema phase10_test from public;
grant usage on schema phase10_test to authenticated, anon;

create function phase10_test.assert_true(condition boolean, label text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'FAIL %', label;
  end if;
  raise notice 'PASS %', label;
end;
$$;

create function phase10_test.assert_sqlstate(statement text, expected_state text, label text)
returns void
language plpgsql
as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected_state then
      raise notice 'PASS %', label;
      return;
    end if;
    raise exception 'FAIL % (expected SQLSTATE %, received %: %)',
      label, expected_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL % (statement unexpectedly succeeded)', label;
end;
$$;

create function phase10_test.assert_lives(statement text, label text)
returns void
language plpgsql
as $$
begin
  execute statement;
  raise notice 'PASS %', label;
exception when others then
  raise exception 'FAIL % (SQLSTATE %: %)', label, sqlstate, sqlerrm;
end;
$$;

revoke all on function phase10_test.assert_true(boolean, text) from public;
revoke all on function phase10_test.assert_sqlstate(text, text, text) from public;
revoke all on function phase10_test.assert_lives(text, text) from public;
grant execute on function phase10_test.assert_true(boolean, text) to authenticated, anon;
grant execute on function phase10_test.assert_sqlstate(text, text, text) to authenticated, anon;
grant execute on function phase10_test.assert_lives(text, text) to authenticated, anon;

select phase10_test.assert_true(
  (select count(*) = 3 from public.routine_organization_settings)
  and not exists (
    select 1
    from public.organizations organization
    left join public.routine_organization_settings settings
      on settings.organization_id = organization.id
    where settings.organization_id is null
  ),
  'DB-10A1-01: bootstrap creates one settings row for every existing organization'
);

select phase10_test.assert_true(
  (select bool_and(
     mode = 'legacy'
     and timezone = 'Europe/Oslo'
     and operational_day_cutoff = '04:00'::time
     and not shared_device_enabled
     and reopen_window_hours = 24
     and revision = 1
   )
   from public.routine_organization_settings
   where organization_id in (
     'a1000000-0000-4000-8000-000000000001',
     'c3000000-0000-4000-8000-000000000001'
   )),
  'DB-10A1-02: missing organizations receive the exact inert settings defaults'
);

select phase10_test.assert_true(
  not exists (
    select 1
    from public.routine_organization_settings
    where organization_id in (
      'a1000000-0000-4000-8000-000000000001',
      'c3000000-0000-4000-8000-000000000001'
    )
      and (created_by_auth_user_id is not null or updated_by_auth_user_id is not null)
  ),
  'DB-10A1-03: bootstrapped actor audit is null and records a system action'
);

select phase10_test.assert_true(
  (select mode = 'shadow'
          and timezone = 'Europe/Oslo'
          and operational_day_cutoff = '03:30'::time
          and shared_device_enabled
          and reopen_window_hours = 72
          and revision = 9
          and created_at = '2026-01-02 03:04:05+00'::timestamptz
          and updated_at = '2026-01-03 04:05:06+00'::timestamptz
          and created_by_auth_user_id = '22000000-0000-4000-8000-000000000001'
          and updated_by_auth_user_id = '22000000-0000-4000-8000-000000000001'
   from public.routine_organization_settings
   where organization_id = 'b2000000-0000-4000-8000-000000000001'),
  'DB-10A1-04: pre-existing non-default settings and audit timestamps remain exact'
);

select phase10_test.assert_true(
  (select count(*) = count(distinct organization_id)
   from public.routine_organization_settings)
  and (select count(*) = 1
       from public.routine_organization_settings
       where organization_id = 'a1000000-0000-4000-8000-000000000001')
  and (select count(*) = 1
       from public.routine_organization_settings
       where organization_id = 'b2000000-0000-4000-8000-000000000001')
  and (select count(*) = 1
       from public.routine_organization_settings
       where organization_id = 'c3000000-0000-4000-8000-000000000001'),
  'DB-10A1-05: settings bootstrap is tenant-separated without cross-organization overwrite'
);

select phase10_test.assert_true(
  (select count(*) = 6
   from pg_catalog.pg_class relation
   join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
   where namespace.nspname = 'public'
     and relation.relkind = 'r'
     and relation.relname in (
       'routine_organization_settings', 'routine_locations',
       'routine_location_sets', 'routine_location_set_members',
       'routine_standards', 'routine_standard_revisions'
     )),
  'DB-10A-01: all six Phase 10A tables exist'
);

select phase10_test.assert_true(
  (select count(*) = 6
   from pg_catalog.pg_class relation
   join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
   where namespace.nspname = 'public'
     and relation.relname like 'routine_%'
     and relation.relkind = 'r'
     and relation.relrowsecurity),
  'DB-10A-02: RLS is enabled on every Phase 10A table'
);

select phase10_test.assert_true(
  (select count(*) = 6
   from pg_catalog.pg_attribute attribute
   where attribute.attrelid in (
       'public.routine_organization_settings'::regclass,
       'public.routine_locations'::regclass,
       'public.routine_location_sets'::regclass,
       'public.routine_location_set_members'::regclass,
       'public.routine_standards'::regclass,
       'public.routine_standard_revisions'::regclass
     )
     and attribute.attname = 'organization_id'
     and attribute.attnotnull
     and not attribute.attisdropped),
  'DB-10A-03: every organization_id column is NOT NULL'
);

select phase10_test.assert_true(
  (select count(*) = 6
   from pg_catalog.pg_policies
   where schemaname = 'public'
     and tablename in (
       'routine_organization_settings', 'routine_locations',
       'routine_location_sets', 'routine_location_set_members',
       'routine_standards', 'routine_standard_revisions'
     )
     and cmd = 'SELECT'
     and roles = array['authenticated']::name[]),
  'DB-10A-04: Phase 10A exposes authenticated SELECT policies only'
);

select phase10_test.assert_true(
  not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename like 'routine_%'
      and (
        cmd <> 'SELECT'
        or coalesce(qual, '') in ('true', '(true)')
        or coalesce(with_check, '') in ('true', '(true)')
        or lower(coalesce(qual, '')) like '%organization_id is null%'
      )
  ),
  'DB-10A-05: no permissive or null-organization Phase 10A policy exists'
);

select phase10_test.assert_true(
  (select bool_and(
     has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT')
     and not has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT')
     and not has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE')
     and not has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE')
     and not has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
   )
   from unnest(array[
     'routine_organization_settings', 'routine_locations',
     'routine_location_sets', 'routine_location_set_members',
     'routine_standards', 'routine_standard_revisions'
   ]) table_name),
  'DB-10A-06: grants allow RLS-filtered authenticated reads and no direct DML or anon reads'
);

select phase10_test.assert_true(
  (select bool_and(function.prosecdef and function.proconfig @> array['search_path=pg_catalog'])
   from pg_catalog.pg_proc function
   join pg_catalog.pg_namespace namespace on namespace.oid = function.pronamespace
   where namespace.nspname = 'public'
     and function.proname in (
       'routine_current_user_is_active', 'routine_current_user_organization_id',
       'routine_current_user_role', 'routine_current_user_can_manage_templates',
       'routine_current_user_can_coordinate_runs', 'routine_current_user_can_perform_tasks',
       'routine_resolve_actor', 'create_or_update_routine_organization_settings',
       'upsert_routine_location', 'set_routine_location_active',
       'upsert_routine_location_set', 'replace_routine_location_set_members',
       'create_routine_standard', 'create_routine_standard_revision'
     )),
  'DB-10A-07: permission helpers and RPCs are SECURITY DEFINER with a safe search_path'
);

select phase10_test.assert_true(
  not has_function_privilege('anon', 'public.routine_resolve_actor()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.routine_resolve_actor()', 'EXECUTE')
  and has_function_privilege(
    'authenticated',
    'public.create_routine_standard_revision(uuid,jsonb,timestamp with time zone,text,uuid,bigint)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.create_routine_standard_revision(uuid,jsonb,timestamp with time zone,text,uuid,bigint)',
    'EXECUTE'
  ),
  'DB-10A-08: internal actor resolution is private and manager RPC entry points are authenticated-only'
);

-- Constraint probes execute as the disposable database owner.
select phase10_test.assert_sqlstate(
  $sql$update public.routine_organization_settings set mode = 'invalid'
       where organization_id = 'c3000000-0000-4000-8000-000000000001'$sql$,
  '23514',
  'DB-10A-09: invalid routine mode is rejected'
);

select phase10_test.assert_sqlstate(
  $sql$update public.routine_organization_settings set timezone = 'UTC'
       where organization_id = 'c3000000-0000-4000-8000-000000000001'$sql$,
  '23514',
  'DB-10A-10: invalid routine timezone is rejected'
);

select phase10_test.assert_sqlstate(
  $sql$update public.routine_organization_settings set revision = 0
       where organization_id = 'c3000000-0000-4000-8000-000000000001'$sql$,
  '23514',
  'DB-10A-11: non-positive settings revision is rejected'
);

select phase10_test.assert_sqlstate(
  $sql$insert into public.routine_locations (organization_id, location_key, name, location_type)
       values ('c3000000-0000-4000-8000-000000000001', 'invalid-type', 'Invalid', 'shelf')$sql$,
  '23514',
  'DB-10A-12: invalid routine location type is rejected'
);

select phase10_test.assert_sqlstate(
  $sql$insert into public.routine_locations (organization_id, location_key, name, location_type, revision)
       values ('c3000000-0000-4000-8000-000000000001', 'invalid-revision', 'Invalid', 'room', 0)$sql$,
  '23514',
  'DB-10A-13: non-positive location revision is rejected'
);

select phase10_test.assert_sqlstate(
  $sql$insert into public.routine_standards
       (organization_id, standard_key, label, value_type, source_kind)
       values ('c3000000-0000-4000-8000-000000000001', 'bad-value', 'Bad', 'number', 'manual')$sql$,
  '23514',
  'DB-10A-14: invalid standard value type is rejected'
);

select phase10_test.assert_sqlstate(
  $sql$insert into public.routine_standards
       (organization_id, standard_key, label, value_type, source_kind)
       values ('c3000000-0000-4000-8000-000000000001', 'bad-source', 'Bad', 'integer', 'inventory_write')$sql$,
  '23514',
  'DB-10A-15: invalid standard source kind is rejected'
);

select phase10_test.assert_sqlstate(
  $sql$insert into public.routine_standards
       (organization_id, standard_key, label, value_type, source_kind, revision)
       values ('c3000000-0000-4000-8000-000000000001', 'bad-revision', 'Bad', 'integer', 'manual', 0)$sql$,
  '23514',
  'DB-10A-16: non-positive standard revision is rejected'
);

-- Organization A manager creates configuration through guarded RPCs.
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set role authenticated;

select phase10_test.assert_true(
  public.routine_current_user_is_active()
  and public.routine_current_user_can_manage_templates()
  and public.routine_current_user_can_coordinate_runs()
  and public.routine_current_user_can_perform_tasks()
  and public.routine_current_user_organization_id() = 'a1000000-0000-4000-8000-000000000001'
  and public.routine_current_user_role() = 'manager',
  'DB-10A-17: active Organization A manager resolves server-controlled routine permissions'
);

select phase10_test.assert_lives(
  $sql$select public.create_or_update_routine_organization_settings(
    'legacy', 'Europe/Oslo', '04:00'::time, false, 24, 1
  )$sql$,
  'DB-10A-18: manager explicitly updates bootstrapped organization settings'
);

select phase10_test.assert_lives(
  $sql$select public.upsert_routine_location(
    'shared-key', 'Organization A Shared Key', 'room', null, 10, '{}'::jsonb, null, null
  )$sql$,
  'DB-10A-19: manager creates an Organization A routine location'
);

select phase10_test.assert_lives(
  $sql$select public.upsert_routine_location(
    'root-a', 'Organization A Root', 'zone', null, 0, '{}'::jsonb, null, null
  )$sql$,
  'DB-10A-20: manager creates an Organization A parent location'
);

select phase10_test.assert_lives(
  $sql$select public.upsert_routine_location(
    'child-a', 'Organization A Child', 'station',
    (select id from public.routine_locations where location_key = 'root-a'),
    1, '{"purpose":"test"}'::jsonb, null, null
  )$sql$,
  'DB-10A-21: manager creates a same-organization child location'
);

select phase10_test.assert_lives(
  $sql$select public.upsert_routine_location(
    'inactive-a', 'Organization A Inactive', 'other', null, 99, '{}'::jsonb, null, null
  )$sql$,
  'DB-10A-22: manager creates a location for active-row RLS testing'
);

select public.set_routine_location_active(
  (select id from public.routine_locations where location_key = 'inactive-a'),
  false,
  1
);

select phase10_test.assert_lives(
  $sql$select public.upsert_routine_location_set(
    'service-points', 'Service Points', 'Active locations', true, null, null
  )$sql$,
  'DB-10A-23: manager creates an Organization A routine location set'
);

select public.replace_routine_location_set_members(
  (select id from public.routine_location_sets where set_key = 'service-points'),
  jsonb_build_array(
    jsonb_build_object(
      'locationId', (select id from public.routine_locations where location_key = 'root-a'),
      'sortOrder', 0,
      'required', true
    ),
    jsonb_build_object(
      'locationId', (select id from public.routine_locations where location_key = 'shared-key'),
      'sortOrder', 1,
      'required', false,
      'metadata', jsonb_build_object('fixture', true)
    )
  ),
  1
);

select phase10_test.assert_true(
  (select count(*) = 2
   from public.routine_location_set_members member
   join public.routine_location_sets location_set on location_set.id = member.location_set_id
   where location_set.set_key = 'service-points')
  and (select revision = 2 from public.routine_location_sets where set_key = 'service-points'),
  'DB-10A-24: member replacement is deterministic and increments the set revision'
);

select phase10_test.assert_lives(
  $sql$select public.create_routine_standard(
    'temperature', 'Temperature', 'Test temperature', 'decimal', 'C', 'manual', true
  )$sql$,
  'DB-10A-25: manager creates an Organization A reusable standard'
);

select phase10_test.assert_lives(
  $sql$select public.create_routine_standard(
    'inactive-standard', 'Inactive Standard', null, 'boolean', null, 'manual', false
  )$sql$,
  'DB-10A-26: manager creates an inactive standard for RLS testing'
);

select phase10_test.assert_lives(
  $sql$select public.create_routine_standard_revision(
    (select id from public.routine_standards where standard_key = 'temperature'),
    '{"min":2,"max":4}'::jsonb,
    '2026-08-05 00:00:00+00'::timestamptz,
    'Initial test standard',
    'aa000000-0000-4000-8000-000000000001',
    1
  )$sql$,
  'DB-10A-27: manager creates the first immutable standard revision'
);

select phase10_test.assert_true(
  (select standard.current_revision_id = revision.id
          and standard.organization_id = revision.organization_id
          and standard.id = revision.standard_id
          and standard.revision = 2
          and revision.revision_number = 1
          and revision.content_hash = md5(jsonb_build_object(
            'standardId', revision.standard_id,
            'revisionNumber', revision.revision_number,
            'value', revision.value_json,
            'effectiveFrom', revision.effective_from,
            'reason', revision.reason
          )::text)
   from public.routine_standards standard
   join public.routine_standard_revisions revision
     on revision.id = standard.current_revision_id
   where standard.standard_key = 'temperature'),
  'DB-10A-28: current revision identity, tenant, number, revision counter, and content hash agree'
);

select phase10_test.assert_true(
  (public.create_routine_standard_revision(
    (select id from public.routine_standards where standard_key = 'temperature'),
    '{"min":2,"max":4}'::jsonb,
    '2026-08-05 00:00:00+00'::timestamptz,
    'Initial test standard',
    'aa000000-0000-4000-8000-000000000001',
    1
  ) ->> 'idempotentReplay')::boolean
  and (select count(*) = 1 from public.routine_standard_revisions),
  'DB-10A-29: an exact idempotency replay returns the original standard revision'
);

select phase10_test.assert_true(
  (select created_by_auth_user_id = '11000000-0000-4000-8000-000000000001'
          and updated_by_auth_user_id = '11000000-0000-4000-8000-000000000001'
          and organization_id = 'a1000000-0000-4000-8000-000000000001'
   from public.routine_standards where standard_key = 'temperature'),
  'DB-10A-30: server-resolved manager identity owns the audit fields'
);

reset role;

-- Organization B manager creates same-key objects; tenant-scoped uniqueness permits this.
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000001', false);
set role authenticated;
select public.create_or_update_routine_organization_settings(
  'shadow', 'Europe/Oslo', '03:30'::time, true, 72, 9
);
select public.upsert_routine_location(
  'shared-key', 'Organization B Shared Key', 'room', null, 10, '{}'::jsonb, null, null
);
select public.upsert_routine_location(
  'root-b', 'Organization B Root', 'zone', null, 0, '{}'::jsonb, null, null
);
select public.upsert_routine_location_set(
  'service-points', 'Organization B Service Points', null, true, null, null
);
select public.create_routine_standard(
  'temperature', 'Organization B Temperature', null, 'decimal', 'C', 'manual', true
);
select public.create_routine_standard_revision(
  (select id from public.routine_standards where standard_key = 'temperature'),
  '{"min":1,"max":5}'::jsonb,
  null,
  'Organization B initial standard',
  'bb000000-0000-4000-8000-000000000001',
  1
);

select phase10_test.assert_true(
  (select count(*) = 2 from public.routine_locations where organization_id = 'b2000000-0000-4000-8000-000000000001')
  and not exists (select 1 from public.routine_locations where organization_id = 'a1000000-0000-4000-8000-000000000001'),
  'DB-10A-31: Organization B manager reads only Organization B locations'
);
reset role;

select phase10_test.assert_true(
  (select count(*) = 2 from public.routine_locations where location_key = 'shared-key')
  and (select count(*) = 2 from public.routine_location_sets where set_key = 'service-points')
  and (select count(*) = 2 from public.routine_standards where standard_key = 'temperature'),
  'DB-10A-32: the same keys are permitted in two organizations'
);

select phase10_test.assert_sqlstate(
  $sql$insert into public.routine_locations
       (organization_id, location_key, name, location_type)
       values ('a1000000-0000-4000-8000-000000000001', 'shared-key', 'Duplicate', 'room')$sql$,
  '23505',
  'DB-10A-33: duplicate location keys inside one organization are rejected'
);

select phase10_test.assert_sqlstate(
  $sql$insert into public.routine_location_sets
       (organization_id, set_key, name)
       values ('a1000000-0000-4000-8000-000000000001', 'service-points', 'Duplicate')$sql$,
  '23505',
  'DB-10A-34: duplicate location-set keys inside one organization are rejected'
);

select phase10_test.assert_sqlstate(
  $sql$insert into public.routine_standards
       (organization_id, standard_key, label, value_type, source_kind)
       values ('a1000000-0000-4000-8000-000000000001', 'temperature', 'Duplicate', 'decimal', 'manual')$sql$,
  '23505',
  'DB-10A-35: duplicate standard keys inside one organization are rejected'
);

select phase10_test.assert_sqlstate(
  format(
    'insert into public.routine_locations (organization_id, location_key, name, location_type, parent_location_id) values (%L, %L, %L, %L, %L)',
    'a1000000-0000-4000-8000-000000000001', 'cross-parent', 'Cross Parent', 'station',
    (select id from public.routine_locations where organization_id = 'b2000000-0000-4000-8000-000000000001' and location_key = 'root-b')
  ),
  '23503',
  'DB-10A-36: composite parent foreign key rejects a cross-organization location parent'
);

select phase10_test.assert_sqlstate(
  format(
    'insert into public.routine_location_set_members (organization_id, location_set_id, location_id, sort_order) values (%L, %L, %L, 90)',
    'a1000000-0000-4000-8000-000000000001',
    (select id from public.routine_location_sets where organization_id = 'a1000000-0000-4000-8000-000000000001' and set_key = 'service-points'),
    (select id from public.routine_locations where organization_id = 'b2000000-0000-4000-8000-000000000001' and location_key = 'root-b')
  ),
  '23503',
  'DB-10A-37: composite membership foreign keys reject a cross-organization member'
);

select phase10_test.assert_sqlstate(
  format(
    'update public.routine_standards set current_revision_id = %L where organization_id = %L and standard_key = %L',
    (select revision.id
     from public.routine_standard_revisions revision
     join public.routine_standards standard on standard.id = revision.standard_id
     where standard.organization_id = 'b2000000-0000-4000-8000-000000000001'
       and standard.standard_key = 'temperature'),
    'a1000000-0000-4000-8000-000000000001',
    'temperature'
  ),
  '23503',
  'DB-10A-38: current_revision_id cannot point across a standard or organization boundary'
);

select phase10_test.assert_sqlstate(
  $sql$update public.routine_standard_revisions set reason = 'Changed'$sql$,
  'P0001',
  'DB-10A-39: standard revisions reject UPDATE'
);

select phase10_test.assert_sqlstate(
  $sql$delete from public.routine_standard_revisions$sql$,
  'P0001',
  'DB-10A-40: standard revisions reject DELETE'
);

select phase10_test.assert_sqlstate(
  format(
    'insert into public.routine_standard_revisions (organization_id, standard_id, revision_number, value_json, idempotency_key, content_hash) values (%L, %L, 0, %L::jsonb, %L, md5(%L))',
    'a1000000-0000-4000-8000-000000000001',
    (select id from public.routine_standards where organization_id = 'a1000000-0000-4000-8000-000000000001' and standard_key = 'temperature'),
    '{}', 'aa000000-0000-4000-8000-000000000099', 'probe'
  ),
  '23514',
  'DB-10A-41: non-positive standard revision numbers are rejected'
);

create table phase10_test.object_ids (
  object_key text primary key,
  object_id uuid not null
);
revoke all on table phase10_test.object_ids from public, anon, authenticated;
grant select on table phase10_test.object_ids to authenticated;
insert into phase10_test.object_ids (object_key, object_id) values
  (
    'organization-b-root',
    (select id from public.routine_locations
     where organization_id = 'b2000000-0000-4000-8000-000000000001'
       and location_key = 'root-b')
  );

-- Manager A cannot address B IDs, and stale writes are rejected atomically.
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set role authenticated;

select phase10_test.assert_sqlstate(
  format(
    'select public.set_routine_location_active(%L, false, 1)',
    (select object_id from phase10_test.object_ids where object_key = 'organization-b-root')
  ),
  'P0001',
  'DB-10A-42: Organization A manager cannot mutate an Organization B location'
);

select phase10_test.assert_sqlstate(
  format(
    'select public.upsert_routine_location(%L, %L, %L, %L, 1, %L::jsonb, %L, 1)',
    'child-a', 'Cross Organization Parent Attempt', 'station',
    (select object_id from phase10_test.object_ids where object_key = 'organization-b-root'),
    '{}',
    (select id from public.routine_locations where organization_id = 'a1000000-0000-4000-8000-000000000001' and location_key = 'child-a')
  ),
  'P0001',
  'DB-10A-43: manager RPC rejects a cross-organization parent ID'
);

select phase10_test.assert_sqlstate(
  format(
    'select public.replace_routine_location_set_members(%L, jsonb_build_array(jsonb_build_object(''locationId'', %L::text)), 2)',
    (select id from public.routine_location_sets where organization_id = 'a1000000-0000-4000-8000-000000000001' and set_key = 'service-points'),
    (select object_id from phase10_test.object_ids where object_key = 'organization-b-root')
  ),
  'P0001',
  'DB-10A-44: manager RPC rejects cross-organization location-set membership'
);

select public.upsert_routine_location(
  'shared-key', 'Organization A Updated', 'room', null, 10, '{}'::jsonb,
  (select id from public.routine_locations where location_key = 'shared-key'),
  1
);

select phase10_test.assert_true(
  (select revision = 2 and name = 'Organization A Updated'
   from public.routine_locations where location_key = 'shared-key'),
  'DB-10A-45: expected location revision updates once and increments atomically'
);

select phase10_test.assert_sqlstate(
  format(
    'select public.upsert_routine_location(%L, %L, %L, null, 10, %L::jsonb, %L, 1)',
    'shared-key', 'Stale Update', 'room', '{}',
    (select id from public.routine_locations where location_key = 'shared-key')
  ),
  '40001',
  'DB-10A-46: stale expected location revision is rejected'
);

select public.create_or_update_routine_organization_settings(
  'pilot', 'Europe/Oslo', '04:00'::time, false, 24, 2
);
select phase10_test.assert_sqlstate(
  $sql$select public.create_or_update_routine_organization_settings(
    'shadow', 'Europe/Oslo', '04:00'::time, false, 24, 2
  )$sql$,
  '40001',
  'DB-10A-47: stale expected settings revision is rejected'
);

select phase10_test.assert_true(
  (select count(*) = 4 from public.routine_locations)
  and (select count(*) = 1 from public.routine_organization_settings)
  and not exists (
    select 1 from public.routine_locations
    where organization_id <> 'a1000000-0000-4000-8000-000000000001'
  ),
  'DB-10A-48: Organization A manager reads active and inactive config only in Organization A'
);

select phase10_test.assert_sqlstate(
  $sql$insert into public.routine_locations
    (organization_id, location_key, name, location_type)
    values ('a1000000-0000-4000-8000-000000000001', 'direct-manager-write', 'Denied', 'room')$sql$,
  '42501',
  'DB-10A-49: authenticated manager direct table INSERT is blocked'
);

select phase10_test.assert_sqlstate(
  $sql$insert into public.routine_organization_settings (organization_id)
       values ('a1000000-0000-4000-8000-000000000001')$sql$,
  '42501',
  'DB-10A1-06: authenticated direct settings INSERT remains blocked'
);

select phase10_test.assert_sqlstate(
  $sql$update public.routine_organization_settings set reopen_window_hours = 12$sql$,
  '42501',
  'DB-10A1-07: authenticated direct settings UPDATE remains blocked'
);

select phase10_test.assert_sqlstate(
  $sql$delete from public.routine_organization_settings$sql$,
  '42501',
  'DB-10A1-08: authenticated direct settings DELETE remains blocked'
);

select phase10_test.assert_sqlstate(
  'select * from public.routine_resolve_actor()',
  '42501',
  'DB-10A-50: authenticated clients cannot directly execute internal actor resolution'
);
reset role;

-- Staff sees active publishable config only and cannot mutate it.
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', false);
set role authenticated;
select phase10_test.assert_true(
  public.routine_current_user_is_active()
  and public.routine_current_user_can_perform_tasks()
  and not public.routine_current_user_can_manage_templates()
  and not public.routine_current_user_can_coordinate_runs()
  and (select count(*) = 3 from public.routine_locations)
  and not exists (select 1 from public.routine_locations where location_key = 'inactive-a')
  and (select count(*) = 1 from public.routine_location_sets)
  and (select count(*) = 1 from public.routine_standards)
  and (select count(*) = 1 from public.routine_standard_revisions)
  and (select count(*) = 0 from public.routine_organization_settings),
  'DB-10A-51: staff reads only active Organization A operational config and no manager settings'
);

select phase10_test.assert_sqlstate(
  $sql$select public.create_routine_standard(
    'staff-write', 'Denied', null, 'text', null, 'manual', true
  )$sql$,
  'P0001',
  'DB-10A-52: staff cannot mutate routine config through manager RPCs'
);

select phase10_test.assert_sqlstate(
  $sql$update public.routine_locations set name = 'Denied'$sql$,
  '42501',
  'DB-10A-53: staff direct table UPDATE is blocked'
);
reset role;

-- Shift lead may coordinate/read, but still cannot manage templates.
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000003', false);
set role authenticated;
select phase10_test.assert_true(
  public.routine_current_user_is_active()
  and public.routine_current_user_can_coordinate_runs()
  and public.routine_current_user_can_perform_tasks()
  and not public.routine_current_user_can_manage_templates()
  and (select count(*) = 3 from public.routine_locations),
  'DB-10A-54: shift lead has read/coordination permission but no template-management permission'
);
reset role;

-- Inventory counter is not implicitly a routine user.
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000006', false);
set role authenticated;
select phase10_test.assert_true(
  not public.routine_current_user_is_active()
  and public.routine_current_user_organization_id() is null
  and public.routine_current_user_role() is null
  and not public.routine_current_user_can_manage_templates()
  and not public.routine_current_user_can_coordinate_runs()
  and not public.routine_current_user_can_perform_tasks()
  and (select count(*) = 0 from public.routine_locations),
  'DB-10A-55: Stock Count counter receives no routine access automatically'
);
select phase10_test.assert_sqlstate(
  $sql$select public.upsert_routine_location(
    'counter-write', 'Denied', 'room', null, 0, '{}'::jsonb, null, null
  )$sql$,
  'P0001',
  'DB-10A-56: Stock Count counter cannot call manager routine RPCs'
);
reset role;

-- Inactive, organization-less, and shared-device identities receive no access.
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000004', false);
set role authenticated;
select phase10_test.assert_true(
  not public.routine_current_user_is_active()
  and (select count(*) = 0 from public.routine_locations),
  'DB-10A-57: inactive user receives no routine access'
);
select phase10_test.assert_sqlstate(
  $sql$select public.create_or_update_routine_organization_settings(
    'legacy', 'Europe/Oslo', '04:00'::time, false, 24, null
  )$sql$,
  'P0001',
  'DB-10A-58: inactive manager cannot mutate routine settings'
);
reset role;

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000005', false);
set role authenticated;
select phase10_test.assert_true(
  not public.routine_current_user_is_active()
  and public.routine_current_user_organization_id() is null
  and (select count(*) = 0 from public.routine_locations),
  'DB-10A-59: user without an organization receives no routine access'
);
select phase10_test.assert_sqlstate(
  $sql$select public.create_routine_standard(
    'no-org-write', 'Denied', null, 'text', null, 'manual', true
  )$sql$,
  'P0001',
  'DB-10A-60: organization-less manager cannot mutate routine config'
);
reset role;

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000007', false);
set role authenticated;
select phase10_test.assert_true(
  not public.routine_current_user_is_active()
  and (select count(*) = 0 from public.routine_locations),
  'DB-10A-61: shared-device profile is not treated as a personal routine actor'
);
reset role;

-- Anon has neither table nor RPC access.
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select phase10_test.assert_sqlstate(
  'select * from public.routine_locations',
  '42501',
  'DB-10A-62: anon cannot read Phase 10A tables'
);
select phase10_test.assert_sqlstate(
  'select * from public.routine_organization_settings',
  '42501',
  'DB-10A1-09: anon cannot read bootstrapped settings'
);
select phase10_test.assert_sqlstate(
  $sql$select public.create_routine_standard(
    'anon-write', 'Denied', null, 'text', null, 'manual', true
  )$sql$,
  '42501',
  'DB-10A-63: anon cannot execute manager routine RPCs'
);
reset role;

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
select phase10_test.assert_true(
  (select actor_auth_user_id = '11000000-0000-4000-8000-000000000001'
          and actor_profile_id = '11000000-0000-4000-8000-000000000001'
          and organization_id = 'a1000000-0000-4000-8000-000000000001'
          and actor_role = 'manager'
          and actor_display_name = 'Routine A Manager'
   from public.routine_resolve_actor()),
  'DB-10A-64: actor resolution returns auth user, profile, organization, role, and display name'
);

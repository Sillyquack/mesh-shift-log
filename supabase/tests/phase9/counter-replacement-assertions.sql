-- Executable Phase 9G-B2 replacement authorization, recovery, and history assertions.

create schema phase9gb2_test;
revoke all on schema phase9gb2_test from public;
grant usage on schema phase9gb2_test to authenticated, anon;

create function phase9gb2_test.assert_true(condition boolean, label text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'FAIL %', label; end if;
  raise notice 'PASS %', label;
end;
$$;

create function phase9gb2_test.assert_sqlstate(statement text, expected_state text, label text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected_state then raise notice 'PASS %', label; return; end if;
    raise exception 'FAIL % (expected SQLSTATE %, received %: %)', label, expected_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL % (statement unexpectedly succeeded)', label;
end;
$$;

create function phase9gb2_test.assert_lives(statement text, label text)
returns void language plpgsql as $$
begin
  execute statement;
  raise notice 'PASS %', label;
exception when others then
  raise exception 'FAIL % (SQLSTATE %: %)', label, sqlstate, sqlerrm;
end;
$$;

create function phase9gb2_test.membership_for(input_auth_user_id uuid)
returns uuid language sql stable security definer set search_path = pg_catalog as $$
  select membership.id
  from public.inventory_counter_memberships membership
  where membership.counter_auth_user_id = input_auth_user_id;
$$;

create function phase9gb2_test.assignment_for(input_location_id uuid, input_state text)
returns uuid language sql stable security definer set search_path = pg_catalog as $$
  select assignment.id
  from public.inventory_count_assignments assignment
  where assignment.location_id = input_location_id
    and (input_state is null or assignment.state = input_state)
  order by assignment.created_at desc
  limit 1;
$$;

create function phase9gb2_test.line_matches(
  input_line_id uuid,
  input_quantity numeric,
  input_note text,
  input_actor uuid,
  input_status text
)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select exists (
    select 1 from public.inventory_count_lines line
    where line.id = input_line_id
      and line.counted_quantity is not distinct from input_quantity
      and line.note is not distinct from input_note
      and line.counted_by_auth_user_id is not distinct from input_actor
      and line.count_status = input_status
  );
$$;

create function phase9gb2_test.snapshot_matches(
  input_location_id uuid,
  input_note text,
  input_actor uuid,
  input_data_action text
)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select exists (
    select 1 from public.inventory_count_assignments assignment
    where assignment.location_id = input_location_id
      and assignment.state = 'superseded'
      and assignment.replacement_data_action = input_data_action
      and jsonb_array_length(assignment.superseded_line_snapshot) = 1
      and assignment.superseded_line_snapshot#>>'{0,note}' = input_note
      and (assignment.superseded_line_snapshot#>>'{0,counted_by_auth_user_id}')::uuid = input_actor
  );
$$;

revoke all on function phase9gb2_test.assert_true(boolean, text) from public;
revoke all on function phase9gb2_test.assert_sqlstate(text, text, text) from public;
revoke all on function phase9gb2_test.assert_lives(text, text) from public;
revoke all on function phase9gb2_test.membership_for(uuid) from public;
revoke all on function phase9gb2_test.assignment_for(uuid, text) from public;
revoke all on function phase9gb2_test.line_matches(uuid, numeric, text, uuid, text) from public;
revoke all on function phase9gb2_test.snapshot_matches(uuid, text, uuid, text) from public;
grant execute on function phase9gb2_test.assert_true(boolean, text) to authenticated, anon;
grant execute on function phase9gb2_test.assert_sqlstate(text, text, text) to authenticated, anon;
grant execute on function phase9gb2_test.assert_lives(text, text) to authenticated, anon;
grant execute on function phase9gb2_test.membership_for(uuid) to authenticated;
grant execute on function phase9gb2_test.assignment_for(uuid, text) to authenticated;
grant execute on function phase9gb2_test.line_matches(uuid, numeric, text, uuid, text) to authenticated;
grant execute on function phase9gb2_test.snapshot_matches(uuid, text, uuid, text) to authenticated;

select phase9gb2_test.assert_true(
  exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'inventory_count_assignments_one_current_location_idx'
      and indexdef like '%WHERE (state <> ''superseded''::text)%'
  ) and not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.inventory_count_assignments'::regclass
      and conname = 'inventory_count_assignments_session_location_unique'
  ),
  'DB-9GB2-1: one current assignment is enforced without deleting historical assignments'
);

select phase9gb2_test.assert_true(
  exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.inventory_count_assignments'::regclass
      and conname = 'inventory_count_assignments_state_check'
      and pg_catalog.pg_get_constraintdef(oid) like '%superseded%'
  )
  and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inventory_count_assignments'
      and column_name = 'superseded_line_snapshot'
  ),
  'DB-9GB2-2: supersession state, linkage, manager audit, and line snapshot storage exist'
);

select phase9gb2_test.assert_true(
  has_function_privilege('authenticated', 'public.replace_inventory_count_assignment(uuid,uuid,text,text,boolean,bigint)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.replace_inventory_count_assignment(uuid,uuid,text,text,boolean,bigint)', 'EXECUTE')
  and not has_table_privilege('authenticated', 'public.inventory_count_assignments', 'UPDATE'),
  'DB-9GB2-3: replacement is an explicit authenticated RPC with direct assignment writes revoked'
);

select set_config('request.jwt.claim.sub', 'b2600000-0000-4000-8000-000000000001', false);
set role authenticated;

select phase9gb2_test.assert_sqlstate(
  $sql$select public.replace_inventory_count_assignment(
    phase9gb2_test.assignment_for('b2200000-0000-4000-8000-000000000001', 'assigned'),
    phase9gb2_test.membership_for('b2600000-0000-4000-8000-000000000003'),
    ' ', 'preserve', false, 2
  )$sql$,
  'P0001',
  'DB-9GB2-4: replacement requires a nonblank manager reason'
);

select phase9gb2_test.assert_sqlstate(
  $sql$select public.replace_inventory_count_assignment(
    phase9gb2_test.assignment_for('b2200000-0000-4000-8000-000000000001', 'assigned'),
    phase9gb2_test.membership_for('b2600000-0000-4000-8000-000000000002'),
    'Same person', 'preserve', false, 2
  )$sql$,
  'P0001',
  'DB-9GB2-5: replacement requires a different counter'
);

select phase9gb2_test.assert_sqlstate(
  $sql$select public.replace_inventory_count_assignment(
    phase9gb2_test.assignment_for('b2200000-0000-4000-8000-000000000001', 'assigned'),
    phase9gb2_test.membership_for('b2600000-0000-4000-8000-00000000000d'),
    'Inactive person', 'preserve', false, 2
  )$sql$,
  'P0001',
  'DB-9GB2-6: an inactive replacement profile is rejected'
);

select phase9gb2_test.assert_sqlstate(
  $sql$select public.replace_inventory_count_assignment(
    phase9gb2_test.assignment_for('b2200000-0000-4000-8000-000000000001', 'assigned'),
    'b2600000-0000-4000-8000-00000000000e',
    'Unauthorized person', 'preserve', false, 2
  )$sql$,
  'P0001',
  'DB-9GB2-7: a counter profile without explicit authorization is rejected'
);

select phase9gb2_test.assert_sqlstate(
  $sql$select public.replace_inventory_count_assignment(
    phase9gb2_test.assignment_for('b2200000-0000-4000-8000-000000000001', 'assigned'),
    phase9gb2_test.membership_for('f2600000-0000-4000-8000-000000000003'),
    'Cross organization', 'preserve', false, 2
  )$sql$,
  'P0001',
  'DB-9GB2-8: cross-organization replacement membership IDs are rejected'
);

select phase9gb2_test.assert_sqlstate(
  $sql$select public.replace_inventory_count_assignment(
    phase9gb2_test.assignment_for('b2200000-0000-4000-8000-000000000001', 'assigned'),
    phase9gb2_test.membership_for('b2600000-0000-4000-8000-000000000003'),
    'Stale attempt', 'preserve', false, 1
  )$sql$,
  'P0001',
  'DB-9GB2-9: stale assignment revisions are rejected before replacement'
);

select phase9gb2_test.assert_lives(
  $sql$select public.replace_inventory_count_assignment(
    phase9gb2_test.assignment_for('b2200000-0000-4000-8000-000000000001', 'assigned'),
    phase9gb2_test.membership_for('b2600000-0000-4000-8000-000000000003'),
    'Former counter unavailable', 'preserve', false, 2
  )$sql$,
  'DB-9GB2-10: manager can replace an unsubmitted counter while preserving working data'
);

select phase9gb2_test.assert_true(
  exists (
    select 1 from public.inventory_count_assignments old_assignment
    join public.inventory_count_assignments replacement
      on replacement.id = old_assignment.superseded_by_assignment_id
     and replacement.replaces_assignment_id = old_assignment.id
    where old_assignment.location_id = 'b2200000-0000-4000-8000-000000000001'
      and old_assignment.state = 'superseded'
      and old_assignment.revision = 3
      and old_assignment.supersession_reason = 'Former counter unavailable'
      and old_assignment.replacement_data_action = 'preserve'
      and old_assignment.superseded_by_name = 'Replacement Manager'
      and old_assignment.superseded_recorded_line_count = 1
      and old_assignment.superseded_total_line_count = 1
      and replacement.state = 'assigned'
      and replacement.revision = 1
  ),
  'DB-9GB2-11: old and new assignments retain bidirectional links, revisions, reason, actor, and progress'
);

select phase9gb2_test.assert_true(
  phase9gb2_test.line_matches(
    'b2500000-0000-4000-8000-000000000001', 3, 'Preserve original note',
    'b2600000-0000-4000-8000-000000000002', 'counted'
  )
  and phase9gb2_test.snapshot_matches(
    'b2200000-0000-4000-8000-000000000001', 'Preserve original note',
    'b2600000-0000-4000-8000-000000000002', 'preserve'
  ),
  'DB-9GB2-12: preserve retains quantities, notes, and original line actor provenance with an audit snapshot'
);
reset role;

select set_config('request.jwt.claim.sub', 'b2600000-0000-4000-8000-000000000002', false);
set role authenticated;
select phase9gb2_test.assert_true(
  jsonb_array_length(public.get_inventory_counter_workspace()->'assignments') = 0
  and not exists (select 1 from public.inventory_count_assignments),
  'DB-9GB2-13: the former counter immediately loses assignment and line-read access'
);
select phase9gb2_test.assert_sqlstate(
  $sql$select public.inventory_counter_set_count_line_quantity(
    phase9gb2_test.assignment_for('b2200000-0000-4000-8000-000000000001', 'superseded'),
    'b2500000-0000-4000-8000-000000000001', 9, 'Forbidden former edit', 3, now()
  )$sql$,
  'P0001',
  'DB-9GB2-14: the former counter immediately loses line-write access'
);
reset role;

select set_config('request.jwt.claim.sub', 'b2600000-0000-4000-8000-000000000003', false);
set role authenticated;
select phase9gb2_test.assert_true(
  jsonb_array_length(public.get_inventory_counter_workspace()->'assignments') = 1
  and public.get_inventory_counter_workspace()#>>'{assignments,0,location,id}' = 'b2200000-0000-4000-8000-000000000001',
  'DB-9GB2-15: replacement counter receives only the newly current refrigerator assignment'
);
select phase9gb2_test.assert_sqlstate(
  $sql$select public.inventory_counter_set_count_line_quantity(
    (public.get_inventory_counter_workspace()#>>'{assignments,0,id}')::uuid,
    'b2500000-0000-4000-8000-000000000002', 9, null, 1, now()
  )$sql$,
  'P0001',
  'DB-9GB2-16: replacement counter cannot write another refrigerator by guessed line ID'
);
reset role;

select set_config('request.jwt.claim.sub', 'b2600000-0000-4000-8000-000000000001', false);
set role authenticated;
select phase9gb2_test.assert_sqlstate(
  $sql$select public.replace_inventory_count_assignment(
    phase9gb2_test.assignment_for('b2200000-0000-4000-8000-000000000002', 'assigned'),
    phase9gb2_test.membership_for('b2600000-0000-4000-8000-000000000005'),
    'Clear without confirmation', 'clear_unsubmitted', false, 2
  )$sql$,
  'P0001',
  'DB-9GB2-17: clearing unsubmitted work requires a second explicit confirmation'
);
select phase9gb2_test.assert_lives(
  $sql$select public.replace_inventory_count_assignment(
    phase9gb2_test.assignment_for('b2200000-0000-4000-8000-000000000002', 'assigned'),
    phase9gb2_test.membership_for('b2600000-0000-4000-8000-000000000005'),
    'Restart unsubmitted fridge', 'clear_unsubmitted', true, 2
  )$sql$,
  'DB-9GB2-18: manager can clear eligible never-submitted work during replacement'
);
select phase9gb2_test.assert_true(
  phase9gb2_test.line_matches(
    'b2500000-0000-4000-8000-000000000002', null, null, null, 'not_counted'
  )
  and phase9gb2_test.snapshot_matches(
    'b2200000-0000-4000-8000-000000000002', 'Clear original note',
    'b2600000-0000-4000-8000-000000000004', 'clear_unsubmitted'
  ),
  'DB-9GB2-19: clear resets only working lines while retaining their immutable audit snapshot'
);

select phase9gb2_test.assert_sqlstate(
  $sql$select public.replace_inventory_count_assignment(
    phase9gb2_test.assignment_for('b2200000-0000-4000-8000-000000000005', 'submitted'),
    phase9gb2_test.membership_for('b2600000-0000-4000-8000-000000000003'),
    'Submitted clear forbidden', 'clear_unsubmitted', true, 3
  )$sql$,
  'P0001',
  'DB-9GB2-20: submitted working data cannot be cleared during replacement'
);
select phase9gb2_test.assert_sqlstate(
  $sql$select public.replace_inventory_count_assignment(
    phase9gb2_test.assignment_for('b2200000-0000-4000-8000-000000000005', 'submitted'),
    phase9gb2_test.membership_for('b2600000-0000-4000-8000-000000000003'),
    'Submitted preserve forbidden', 'preserve', false, 3
  )$sql$,
  'P0001',
  'DB-9GB2-21: submitted assignments must be returned before replacement'
);
select phase9gb2_test.assert_sqlstate(
  $sql$select public.replace_inventory_count_assignment(
    phase9gb2_test.assignment_for('b2200000-0000-4000-8000-000000000004', 'accepted'),
    phase9gb2_test.membership_for('b2600000-0000-4000-8000-000000000003'),
    'Accepted forbidden', 'preserve', false, 4
  )$sql$,
  'P0001',
  'DB-9GB2-22: accepted assignment history cannot be replaced'
);
select phase9gb2_test.assert_sqlstate(
  $sql$select public.replace_inventory_count_assignment(
    phase9gb2_test.assignment_for('b2200000-0000-4000-8000-000000000003', 'returned'),
    phase9gb2_test.membership_for('b2600000-0000-4000-8000-000000000007'),
    'Returned clear forbidden', 'clear_unsubmitted', true, 4
  )$sql$,
  'P0001',
  'DB-9GB2-23: previously submitted returned data cannot be cleared'
);
select phase9gb2_test.assert_lives(
  $sql$select public.replace_inventory_count_assignment(
    phase9gb2_test.assignment_for('b2200000-0000-4000-8000-000000000003', 'returned'),
    phase9gb2_test.membership_for('b2600000-0000-4000-8000-000000000007'),
    'Replacement after manager return', 'preserve', false, 4
  )$sql$,
  'DB-9GB2-24: manager can replace a counter after returning submitted work'
);
select phase9gb2_test.assert_true(
  exists (
    select 1 from public.inventory_count_assignments old_assignment
    join public.inventory_count_assignments replacement on replacement.replaces_assignment_id = old_assignment.id
    where old_assignment.location_id = 'b2200000-0000-4000-8000-000000000003'
      and old_assignment.state = 'superseded'
      and old_assignment.submitted_at is not null
      and old_assignment.returned_at is not null
      and old_assignment.return_message = 'Continue the returned recount'
      and replacement.state = 'assigned'
  ),
  'DB-9GB2-25: replacement after return preserves prior submission and return audit'
);

select phase9gb2_test.assert_true(
  not exists (
    select organization_id, session_id, location_id
    from public.inventory_count_assignments
    where session_id = 'b2400000-0000-4000-8000-000000000001'
      and state <> 'superseded'
    group by organization_id, session_id, location_id
    having count(*) > 1
  )
  and exists (
    select 1 from public.inventory_count_assignments old_assignment
    join public.inventory_count_assignments replacement
      on replacement.id = old_assignment.superseded_by_assignment_id
     and replacement.replaces_assignment_id = old_assignment.id
    where old_assignment.location_id = 'b2200000-0000-4000-8000-000000000006'
      and old_assignment.state = 'superseded'
  ),
  'DB-9GB2-26: concurrent replacement leaves one current assignment and retained linked history'
);

select phase9gb2_test.assert_sqlstate(
  $sql$select public.create_inventory_count_assignment(
    'b2400000-0000-4000-8000-000000000001', 'b2200000-0000-4000-8000-000000000001',
    phase9gb2_test.membership_for('b2600000-0000-4000-8000-00000000000b'),
    (select updated_at from public.inventory_count_sessions where id = 'b2400000-0000-4000-8000-000000000001')
  )$sql$,
  '23505',
  'DB-9GB2-27: ordinary assignment creation cannot duplicate a current refrigerator assignment'
);
reset role;

select set_config('request.jwt.claim.sub', 'f2600000-0000-4000-8000-000000000001', false);
set role authenticated;
select phase9gb2_test.assert_sqlstate(
  $sql$select public.replace_inventory_count_assignment(
    phase9gb2_test.assignment_for('f2200000-0000-4000-8000-000000000001', 'accepted'),
    phase9gb2_test.membership_for('f2600000-0000-4000-8000-000000000003'),
    'Final history forbidden', 'preserve', false, 4
  )$sql$,
  'P0001',
  'DB-9GB2-28: completed and approved Stock Count history remains immutable'
);
reset role;

drop schema phase9gb2_test cascade;

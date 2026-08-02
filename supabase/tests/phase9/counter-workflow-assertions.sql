-- Executable Phase 9G-B authorization matrix, workflow, and history assertions.

create schema phase9gb_test;
revoke all on schema phase9gb_test from public;
grant usage on schema phase9gb_test to authenticated, anon;

create function phase9gb_test.assert_true(condition boolean, label text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'FAIL %', label; end if;
  raise notice 'PASS %', label;
end;
$$;

create function phase9gb_test.assert_sqlstate(statement text, expected_state text, label text)
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

create function phase9gb_test.assert_lives(statement text, label text)
returns void language plpgsql as $$
begin
  execute statement;
  raise notice 'PASS %', label;
exception when others then
  raise exception 'FAIL % (SQLSTATE %: %)', label, sqlstate, sqlerrm;
end;
$$;

revoke all on function phase9gb_test.assert_true(boolean, text) from public;
revoke all on function phase9gb_test.assert_sqlstate(text, text, text) from public;
revoke all on function phase9gb_test.assert_lives(text, text) from public;
grant execute on function phase9gb_test.assert_true(boolean, text) to authenticated, anon;
grant execute on function phase9gb_test.assert_sqlstate(text, text, text) to authenticated, anon;
grant execute on function phase9gb_test.assert_lives(text, text) to authenticated, anon;

select phase9gb_test.assert_true(
  exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'user_profiles_role_check'
      and pg_catalog.pg_get_constraintdef(oid) like '%counter%'
  ),
  'DB-9GB-1: the profile role constraint explicitly permits counter identities'
);

select phase9gb_test.assert_true(
  (select count(*) = 2
   from pg_catalog.pg_class relation
   join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
   where namespace.nspname = 'public'
     and relation.relname in ('inventory_counter_memberships', 'inventory_count_assignments')
     and relation.relrowsecurity),
  'DB-9GB-2: RLS is enabled on both counter authorization tables'
);

select phase9gb_test.assert_true(
  not has_table_privilege('authenticated', 'public.inventory_counter_memberships', 'INSERT')
  and not has_table_privilege('authenticated', 'public.inventory_counter_memberships', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.inventory_counter_memberships', 'DELETE')
  and not has_table_privilege('authenticated', 'public.inventory_count_assignments', 'INSERT')
  and not has_table_privilege('authenticated', 'public.inventory_count_assignments', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.inventory_count_assignments', 'DELETE'),
  'DB-9GB-3: authenticated users have no direct membership or assignment writes'
);

select set_config('request.jwt.claim.sub', '7b600000-0000-4000-8000-000000000002', false);
set role authenticated;

select phase9gb_test.assert_true(
  public.current_user_can_count_inventory()
  and not public.current_user_can_manage_inventory_config(),
  'DB-9GB-4: an authorized counter is a counter and never a manager'
);

select phase9gb_test.assert_true(
  not exists (select 1 from public.inventory_products)
  and not exists (select 1 from public.inventory_locations)
  and not exists (select 1 from public.inventory_location_products)
  and not exists (select 1 from public.inventory_count_sessions)
  and not exists (select 1 from public.inventory_count_lines)
  and not exists (select 1 from public.inventory_refrigerator_templates)
  and not exists (select 1 from public.inventory_catalogue_unresolved_mappings)
  and not exists (select 1 from public.inventory_product_aliases),
  'DB-9GB-5: counter base-table reads expose no catalogue, defaults, sessions, lines, aliases, or unresolved mappings'
);

select phase9gb_test.assert_true(
  (select count(*) = 1 from public.inventory_counter_memberships)
  and exists (
    select 1 from public.inventory_counter_memberships
    where counter_auth_user_id = '7b600000-0000-4000-8000-000000000002'
  ),
  'DB-9GB-6: counter RLS exposes only the counter own membership'
);

select phase9gb_test.assert_true(
  (select count(*) = 1 from public.inventory_count_assignments)
  and exists (
    select 1 from public.inventory_count_assignments assignment
    where assignment.counter_membership_id = (
      select membership.id from public.inventory_counter_memberships membership
      where membership.counter_auth_user_id = '7b600000-0000-4000-8000-000000000002'
    ) and assignment.state = 'submitted'
  ),
  'DB-9GB-7: counter assignment RLS excludes another counter assignment'
);

select phase9gb_test.assert_true(
  jsonb_array_length(public.get_inventory_counter_workspace()->'assignments') = 1
  and jsonb_array_length(public.get_inventory_counter_workspace()#>'{assignments,0,lines}') = 2
  and public.get_inventory_counter_workspace()#>>'{assignments,0,location,id}' = '7b200000-0000-4000-8000-000000000001',
  'DB-9GB-8: sanitized workspace contains only the assigned refrigerator and its lines'
);

select phase9gb_test.assert_true(
  (public.get_inventory_counter_workspace()#>'{assignments,0,lines,0}') ? 'product_id'
  and (public.get_inventory_counter_workspace()#>'{assignments,0,lines,0}') ? 'millum_item_ref'
  and not ((public.get_inventory_counter_workspace()#>'{assignments,0,lines,0}') ? 'par_quantity_snapshot')
  and not ((public.get_inventory_counter_workspace()#>'{assignments,0,lines,0}') ? 'variance_quantity')
  and position('reserve' in lower(public.get_inventory_counter_workspace()::text)) = 0,
  'DB-9GB-9: counter line identity is stable while defaults, variance, and reserves stay hidden'
);

select phase9gb_test.assert_sqlstate(
  $sql$update public.inventory_count_assignments set state = 'accepted'$sql$,
  '42501',
  'DB-9GB-10: counter cannot directly alter assignments'
);

select phase9gb_test.assert_sqlstate(
  $sql$select public.inventory_counter_set_count_line_quantity(
    (select id from public.inventory_count_assignments limit 1),
    '7b500000-0000-4000-8000-000000000001', 2, null,
    (select revision from public.inventory_count_assignments limit 1), now()
  )$sql$,
  'P0001',
  'DB-9GB-11: submitted refrigerator lines are read-only to the counter'
);

select phase9gb_test.assert_sqlstate(
  $sql$select public.upsert_inventory_location_product(
    input_location_product_id => '7b300000-0000-4000-8000-000000000001',
    input_par_quantity => 99,
    input_fields => array['par_quantity']
  )$sql$,
  'P0001',
  'DB-9GB-12: counter cannot change refrigerator defaults or configuration'
);

select phase9gb_test.assert_sqlstate(
  $sql$select public.complete_inventory_count_session('7b400000-0000-4000-8000-000000000001')$sql$,
  'P0001',
  'DB-9GB-13: counter cannot complete the Stock Count session'
);

select phase9gb_test.assert_sqlstate(
  $sql$select public.approve_inventory_count_session('7b400000-0000-4000-8000-000000000001')$sql$,
  'P0001',
  'DB-9GB-14: counter cannot approve the Stock Count session'
);

select phase9gb_test.assert_sqlstate(
  $sql$select public.return_inventory_count_assignment(
    (select id from public.inventory_count_assignments limit 1), 'Self return',
    (select revision from public.inventory_count_assignments limit 1)
  )$sql$,
  'P0001',
  'DB-9GB-15: counter cannot self-return submitted work'
);

select phase9gb_test.assert_sqlstate(
  $sql$select public.accept_inventory_count_assignment(
    (select id from public.inventory_count_assignments limit 1),
    (select revision from public.inventory_count_assignments limit 1)
  )$sql$,
  'P0001',
  'DB-9GB-16: counter cannot self-accept submitted work'
);

select phase9gb_test.assert_sqlstate(
  $sql$select public.submit_inventory_count_assignment(
    (select assignment.id
     from public.inventory_count_assignments assignment
     join public.inventory_counter_memberships membership on membership.id = assignment.counter_membership_id
     where membership.counter_auth_user_id = '7b600000-0000-4000-8000-000000000003'),
    1, now()
  )$sql$,
  'P0001',
  'DB-9GB-17: counter cannot submit another counter assignment by guessed ID'
);
reset role;

select set_config('request.jwt.claim.sub', '7b600000-0000-4000-8000-000000000001', false);
set role authenticated;

select phase9gb_test.assert_true(
  (select count(*) = 2 from public.inventory_count_assignments)
  and not exists (
    select 1 from public.inventory_count_assignments
    where organization_id <> '7b000000-0000-4000-8000-000000000001'
  ),
  'DB-9GB-18: manager assignment review RLS is strict same-organization'
);

select phase9gb_test.assert_sqlstate(
  $sql$select public.complete_inventory_count_session('7b400000-0000-4000-8000-000000000001')$sql$,
  'P0001',
  'DB-9GB-19: manager cannot complete while any assigned refrigerator is unaccepted'
);

select phase9gb_test.assert_sqlstate(
  $sql$select public.return_inventory_count_assignment(
    (select assignment.id from public.inventory_count_assignments assignment
     join public.inventory_counter_memberships membership on membership.id = assignment.counter_membership_id
     where membership.counter_auth_user_id = '7b600000-0000-4000-8000-000000000002'),
    'Please recount the unit line', 1
  )$sql$,
  'P0001',
  'DB-9GB-20: stale manager return revision is rejected'
);

select phase9gb_test.assert_lives(
  $sql$select public.return_inventory_count_assignment(
    (select assignment.id from public.inventory_count_assignments assignment
     join public.inventory_counter_memberships membership on membership.id = assignment.counter_membership_id
     where membership.counter_auth_user_id = '7b600000-0000-4000-8000-000000000002'),
    'Please recount the unit line',
    (select assignment.revision from public.inventory_count_assignments assignment
     join public.inventory_counter_memberships membership on membership.id = assignment.counter_membership_id
     where membership.counter_auth_user_id = '7b600000-0000-4000-8000-000000000002')
  )$sql$,
  'DB-9GB-21: manager can return submitted work with a message'
);
reset role;

select set_config('request.jwt.claim.sub', '7b600000-0000-4000-8000-000000000002', false);
set role authenticated;

select phase9gb_test.assert_true(
  public.get_inventory_counter_workspace()#>>'{assignments,0,state}' = 'returned'
  and public.get_inventory_counter_workspace()#>>'{assignments,0,return_message}' = 'Please recount the unit line',
  'DB-9GB-22: returned assignment is readable with the manager message'
);

select phase9gb_test.assert_sqlstate(
  $sql$select public.inventory_counter_set_count_line_quantity(
    (public.get_inventory_counter_workspace()#>>'{assignments,0,id}')::uuid,
    '7b500000-0000-4000-8000-000000000003', 1, null,
    (public.get_inventory_counter_workspace()#>>'{assignments,0,revision}')::bigint,
    now()
  )$sql$,
  'P0001',
  'DB-9GB-23: guessed line ID from another refrigerator is rejected'
);

select phase9gb_test.assert_sqlstate(
  $sql$select public.inventory_counter_set_count_line_quantity(
    (public.get_inventory_counter_workspace()#>>'{assignments,0,id}')::uuid,
    'e5000000-0000-4000-8000-000000000001', 1, null,
    (public.get_inventory_counter_workspace()#>>'{assignments,0,revision}')::bigint,
    now()
  )$sql$,
  'P0001',
  'DB-9GB-24: cross-organization line ID is rejected'
);

select phase9gb_test.assert_sqlstate(
  $sql$select public.inventory_counter_set_count_line_quantity(
    (public.get_inventory_counter_workspace()#>>'{assignments,0,id}')::uuid,
    '7b500000-0000-4000-8000-000000000001', 7, 'Deviation note', 1,
    (public.get_inventory_counter_workspace()#>>'{assignments,0,lines,0,updated_at}')::timestamptz
  )$sql$,
  'P0001',
  'DB-9GB-25: stale counter assignment revision is rejected'
);

select phase9gb_test.assert_lives(
  $sql$select public.inventory_counter_set_count_line_quantity(
    (public.get_inventory_counter_workspace()#>>'{assignments,0,id}')::uuid,
    '7b500000-0000-4000-8000-000000000001', 7, 'Deviation note',
    (public.get_inventory_counter_workspace()#>>'{assignments,0,revision}')::bigint,
    (public.get_inventory_counter_workspace()#>>'{assignments,0,lines,0,updated_at}')::timestamptz
  )$sql$,
  'DB-9GB-26: returned counter can save a unit deviation and note'
);

select phase9gb_test.assert_lives(
  $sql$select public.inventory_counter_set_count_line_structured_quantity(
    (public.get_inventory_counter_workspace()#>>'{assignments,0,id}')::uuid,
    '7b500000-0000-4000-8000-000000000002', 1, 0.2, null, null, 'Bottle recount',
    (public.get_inventory_counter_workspace()#>>'{assignments,0,revision}')::bigint,
    (public.get_inventory_counter_workspace()#>>'{assignments,0,lines,1,updated_at}')::timestamptz
  )$sql$,
  'DB-9GB-27: returned counter can save structured bottle quantities and a note'
);

select phase9gb_test.assert_lives(
  $sql$select public.submit_inventory_count_assignment(
    (public.get_inventory_counter_workspace()#>>'{assignments,0,id}')::uuid,
    (public.get_inventory_counter_workspace()#>>'{assignments,0,revision}')::bigint,
    (public.get_inventory_counter_workspace()#>>'{assignments,0,session,updated_at}')::timestamptz
  )$sql$,
  'DB-9GB-28: returned refrigerator can be resubmitted after corrections'
);
reset role;

select set_config('request.jwt.claim.sub', '7b600000-0000-4000-8000-000000000001', false);
set role authenticated;

select phase9gb_test.assert_lives(
  $sql$select public.accept_inventory_count_assignment(
    (select assignment.id from public.inventory_count_assignments assignment
     join public.inventory_counter_memberships membership on membership.id = assignment.counter_membership_id
     where membership.counter_auth_user_id = '7b600000-0000-4000-8000-000000000002'),
    (select assignment.revision from public.inventory_count_assignments assignment
     join public.inventory_counter_memberships membership on membership.id = assignment.counter_membership_id
     where membership.counter_auth_user_id = '7b600000-0000-4000-8000-000000000002')
  )$sql$,
  'DB-9GB-29: manager can accept a resubmitted refrigerator'
);

select phase9gb_test.assert_true(
  (select status = 'in_progress' from public.inventory_count_sessions where id = '7b400000-0000-4000-8000-000000000001'),
  'DB-9GB-30: accepting one refrigerator does not complete or approve the session'
);

select phase9gb_test.assert_sqlstate(
  $sql$select public.create_inventory_count_assignment(
    '7b400000-0000-4000-8000-000000000001', '7b200000-0000-4000-8000-000000000001',
    (select id from public.inventory_counter_memberships where counter_auth_user_id = '7b600000-0000-4000-8000-000000000003'),
    (select updated_at from public.inventory_count_sessions where id = '7b400000-0000-4000-8000-000000000001')
  )$sql$,
  '23505',
  'DB-9GB-31: a session refrigerator cannot be silently reassigned'
);

select phase9gb_test.assert_sqlstate(
  $sql$select public.create_inventory_count_assignment(
    '7b400000-0000-4000-8000-000000000001', '7b200000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000099',
    (select updated_at from public.inventory_count_sessions where id = '7b400000-0000-4000-8000-000000000001')
  )$sql$,
  'P0001',
  'DB-9GB-32: nonexistent or cross-organization membership IDs cannot be assigned'
);
reset role;

select set_config('request.jwt.claim.sub', '7b600000-0000-4000-8000-000000000003', false);
set role authenticated;

select phase9gb_test.assert_sqlstate(
  $sql$select public.inventory_counter_apply_refrigerator_default(
    (public.get_inventory_counter_workspace()#>>'{assignments,0,id}')::uuid,
    false,
    (public.get_inventory_counter_workspace()#>>'{assignments,0,revision}')::bigint
  )$sql$,
  'P0001',
  'DB-9GB-33: refrigerator default application requires physical confirmation'
);

select phase9gb_test.assert_lives(
  $sql$select public.inventory_counter_apply_refrigerator_default(
    (public.get_inventory_counter_workspace()#>>'{assignments,0,id}')::uuid,
    true,
    (public.get_inventory_counter_workspace()#>>'{assignments,0,revision}')::bigint
  )$sql$,
  'DB-9GB-34: counter can apply the assigned refrigerator default safely'
);

select phase9gb_test.assert_true(
  (public.get_inventory_counter_workspace()#>>'{assignments,0,lines,0,counted_quantity}')::numeric = 8,
  'DB-9GB-35: default application uses the snapshotted stable line target'
);

select phase9gb_test.assert_lives(
  $sql$select public.submit_inventory_count_assignment(
    (public.get_inventory_counter_workspace()#>>'{assignments,0,id}')::uuid,
    (public.get_inventory_counter_workspace()#>>'{assignments,0,revision}')::bigint,
    (public.get_inventory_counter_workspace()#>>'{assignments,0,session,updated_at}')::timestamptz
  )$sql$,
  'DB-9GB-36: second counter can submit only the assigned refrigerator'
);

select phase9gb_test.assert_sqlstate(
  $sql$select public.accept_inventory_count_assignment(
    (public.get_inventory_counter_workspace()#>>'{assignments,0,id}')::uuid,
    (public.get_inventory_counter_workspace()#>>'{assignments,0,revision}')::bigint
  )$sql$,
  'P0001',
  'DB-9GB-37: second counter cannot self-accept'
);
reset role;

select set_config('request.jwt.claim.sub', '7b600000-0000-4000-8000-000000000001', false);
set role authenticated;

select phase9gb_test.assert_lives(
  $sql$select public.accept_inventory_count_assignment(
    (select assignment.id from public.inventory_count_assignments assignment
     join public.inventory_counter_memberships membership on membership.id = assignment.counter_membership_id
     where membership.counter_auth_user_id = '7b600000-0000-4000-8000-000000000003'),
    (select assignment.revision from public.inventory_count_assignments assignment
     join public.inventory_counter_memberships membership on membership.id = assignment.counter_membership_id
     where membership.counter_auth_user_id = '7b600000-0000-4000-8000-000000000003')
  )$sql$,
  'DB-9GB-38: manager can accept the second submitted refrigerator'
);

select public.complete_inventory_count_location('7b400000-0000-4000-8000-000000000001', '7b200000-0000-4000-8000-000000000001');
select public.complete_inventory_count_location('7b400000-0000-4000-8000-000000000001', '7b200000-0000-4000-8000-000000000002');

select phase9gb_test.assert_lives(
  $sql$select public.complete_inventory_count_session('7b400000-0000-4000-8000-000000000001', 'Counter workflow complete')$sql$,
  'DB-9GB-39: manager alone completes after all assignments are accepted'
);

select phase9gb_test.assert_lives(
  $sql$select public.approve_inventory_count_session('7b400000-0000-4000-8000-000000000001', 'Counter workflow approved')$sql$,
  'DB-9GB-40: manager alone approves the completed Stock Count'
);
reset role;

select set_config('request.jwt.claim.sub', '7b600000-0000-4000-8000-000000000002', false);
set role authenticated;

select phase9gb_test.assert_true(
  jsonb_array_length(public.get_inventory_counter_workspace()->'assignments') = 0
  and not exists (select 1 from public.inventory_count_assignments),
  'DB-9GB-41: counter cannot access completed or approved assignment history'
);

select phase9gb_test.assert_sqlstate(
  $sql$select public.inventory_counter_set_count_line_quantity(
    (select id from public.inventory_count_assignments limit 1),
    '7b500000-0000-4000-8000-000000000001', 99, null, 1, now()
  )$sql$,
  'P0001',
  'DB-9GB-42: counter cannot write approved history'
);
reset role;

select set_config('request.jwt.claim.sub', 'e6000000-0000-4000-8000-000000000002', false);
set role authenticated;

select phase9gb_test.assert_true(
  jsonb_array_length(public.get_inventory_counter_workspace()->'assignments') = 1
  and public.get_inventory_counter_workspace()#>>'{assignments,0,location,id}' = 'e2000000-0000-4000-8000-000000000001'
  and not exists (
    select 1 from public.inventory_count_assignments
    where organization_id = '7b000000-0000-4000-8000-000000000001'
  ),
  'DB-9GB-43: cross-organization counter sees only the own organization assignment'
);

select phase9gb_test.assert_sqlstate(
  $sql$select public.inventory_counter_set_count_line_quantity(
    (public.get_inventory_counter_workspace()#>>'{assignments,0,id}')::uuid,
    '7b500000-0000-4000-8000-000000000001', 1, null,
    (public.get_inventory_counter_workspace()#>>'{assignments,0,revision}')::bigint, now()
  )$sql$,
  'P0001',
  'DB-9GB-44: cross-organization guessed line write is rejected'
);
reset role;

select set_config('request.jwt.claim.sub', '7b600000-0000-4000-8000-000000000001', false);
set role authenticated;
select phase9gb_test.assert_lives(
  $sql$select public.set_inventory_counter_membership('7b600000-0000-4000-8000-000000000002', false)$sql$,
  'DB-9GB-45: manager can revoke a counter after active assignments are accepted'
);
reset role;

select set_config('request.jwt.claim.sub', '7b600000-0000-4000-8000-000000000002', false);
set role authenticated;
select phase9gb_test.assert_true(
  not public.current_user_can_count_inventory(),
  'DB-9GB-46: revoked membership immediately removes counter authorization'
);
select phase9gb_test.assert_sqlstate(
  'select public.get_inventory_counter_workspace()',
  'P0001',
  'DB-9GB-47: revoked counter cannot use the workspace RPC'
);
reset role;

drop schema phase9gb_test cascade;

-- Executable Phase 9D lifecycle, immutable-history, correction, and exception assertions.
create schema phase9_integrity_test;
revoke all on schema phase9_integrity_test from public;
grant usage on schema phase9_integrity_test to authenticated;

create function phase9_integrity_test.assert_true(condition boolean, label text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'FAIL %', label; end if;
  raise notice 'PASS %', label;
end;
$$;

create function phase9_integrity_test.assert_sqlstate(statement text, expected_state text, label text)
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

create function phase9_integrity_test.assert_lives(statement text, label text)
returns void language plpgsql as $$
begin
  execute statement;
  raise notice 'PASS %', label;
exception when others then
  raise exception 'FAIL % (SQLSTATE %: %)', label, sqlstate, sqlerrm;
end;
$$;

revoke all on function phase9_integrity_test.assert_true(boolean, text) from public;
revoke all on function phase9_integrity_test.assert_sqlstate(text, text, text) from public;
revoke all on function phase9_integrity_test.assert_lives(text, text) from public;
grant execute on function phase9_integrity_test.assert_true(boolean, text) to authenticated;
grant execute on function phase9_integrity_test.assert_sqlstate(text, text, text) to authenticated;
grant execute on function phase9_integrity_test.assert_lives(text, text) to authenticated;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
set role authenticated;

select phase9_integrity_test.assert_sqlstate(
  $sql$select public.set_inventory_count_line_quantity('a5000000-0000-4000-8000-000000000001', 6)$sql$,
  'P0001',
  'DB-INTEGRITY-1: a missing expected line version is rejected'
);
select phase9_integrity_test.assert_sqlstate(
  $sql$select public.set_inventory_count_line_quantity(
    input_line_id => 'a5000000-0000-4000-8000-000000000001',
    input_counted_quantity => 6,
    input_expected_updated_at => '2000-01-01T00:00:00Z'
  )$sql$,
  'P0001',
  'DB-INTEGRITY-2: a stale expected line version is rejected'
);
select phase9_integrity_test.assert_lives(
  $sql$select public.set_inventory_count_line_quantity(
    input_line_id => 'a5000000-0000-4000-8000-000000000001',
    input_counted_quantity => 6,
    input_note => 'Current version save',
    input_expected_updated_at => (select updated_at from public.inventory_count_lines where id = 'a5000000-0000-4000-8000-000000000001')
  )$sql$,
  'DB-INTEGRITY-3: the current expected line version saves successfully'
);
select phase9_integrity_test.assert_lives(
  $sql$select public.complete_inventory_count_location('a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001')$sql$,
  'DB-INTEGRITY-4: a fully counted location completes normally'
);
select phase9_integrity_test.assert_lives(
  $sql$select public.complete_inventory_count_session(
    'a4000000-0000-4000-8000-000000000001', 'Independent manager review note', false, null
  )$sql$,
  'DB-INTEGRITY-5: a review note does not imply exception finalization'
);
select phase9_integrity_test.assert_true(
  (select status = 'completed'
    and not finalized_with_exceptions
    and exception_reason is null
    and finalized_by_name = 'Organization A Manager'
   from public.inventory_count_sessions where id = 'a4000000-0000-4000-8000-000000000001'),
  'DB-INTEGRITY-6: normal completion stores explicit non-exception finalization audit'
);
select phase9_integrity_test.assert_sqlstate(
  $sql$select public.create_inventory_count_session(
    'Blocked while awaiting approval', 'daily', '91000000-0000-4000-8000-000000000001', current_date, null, null
  )$sql$,
  'P0001',
  'DB-INTEGRITY-7: completed awaiting approval still consumes the active slot'
);
select phase9_integrity_test.assert_lives(
  $sql$select public.approve_inventory_count_session('a4000000-0000-4000-8000-000000000001', 'Approved after review')$sql$,
  'DB-INTEGRITY-8: a completed Stock Count can be approved'
);
select phase9_integrity_test.assert_sqlstate(
  $sql$select public.set_inventory_count_line_quantity(
    input_line_id => 'a5000000-0000-4000-8000-000000000001',
    input_counted_quantity => 7,
    input_expected_updated_at => (select updated_at from public.inventory_count_lines where id = 'a5000000-0000-4000-8000-000000000001')
  )$sql$,
  'P0001',
  'DB-INTEGRITY-9: approved lines reject guarded RPC mutation'
);
select phase9_integrity_test.assert_sqlstate(
  $sql$select public.complete_inventory_count_location('a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001')$sql$,
  'P0001',
  'DB-INTEGRITY-10: approved location completion metadata cannot be rewritten'
);
select phase9_integrity_test.assert_sqlstate(
  $sql$update public.inventory_count_sessions set title = 'Direct authenticated rewrite' where id = 'a4000000-0000-4000-8000-000000000001'$sql$,
  '42501',
  'DB-INTEGRITY-11: authenticated direct session mutation remains denied'
);
reset role;

select phase9_integrity_test.assert_sqlstate(
  $sql$update public.inventory_count_sessions set title = 'Owner rewrite' where id = 'a4000000-0000-4000-8000-000000000001'$sql$,
  'P0001',
  'DB-INTEGRITY-12: owner-level approved session rewrite is blocked by the invariant trigger'
);
select phase9_integrity_test.assert_sqlstate(
  $sql$update public.inventory_count_lines set note = 'Owner rewrite' where id = 'a5000000-0000-4000-8000-000000000001'$sql$,
  'P0001',
  'DB-INTEGRITY-13: owner-level approved line rewrite is blocked by the invariant trigger'
);
select phase9_integrity_test.assert_sqlstate(
  $sql$delete from public.inventory_count_sessions where id = 'a4000000-0000-4000-8000-000000000001'$sql$,
  'P0001',
  'DB-INTEGRITY-14: approved sessions cannot be deleted by the table owner'
);
select phase9_integrity_test.assert_true(
  (select title = 'Organization A Count' from public.inventory_count_sessions where id = 'a4000000-0000-4000-8000-000000000001')
  and (select counted_quantity = 6 and note = 'Current version save' from public.inventory_count_lines where id = 'a5000000-0000-4000-8000-000000000001'),
  'DB-INTEGRITY-15: approved history remains byte-for-byte unchanged after rejected writes'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
set role authenticated;
select phase9_integrity_test.assert_lives(
  $sql$select public.create_inventory_correction_session(
    'a4000000-0000-4000-8000-000000000001', 'Correct a verified counting error', '92000000-0000-4000-8000-000000000001'
  )$sql$,
  'DB-INTEGRITY-16: an approved Stock Count creates a linked correction session'
);
select phase9_integrity_test.assert_lives(
  $sql$select public.create_inventory_correction_session(
    'a4000000-0000-4000-8000-000000000001', 'Correct a verified counting error', '92000000-0000-4000-8000-000000000001'
  )$sql$,
  'DB-INTEGRITY-17: retrying a correction with the same idempotency key reuses it'
);
reset role;
select phase9_integrity_test.assert_true(
  (select count(*) = 1 from public.inventory_count_sessions
   where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
     and idempotency_key = '92000000-0000-4000-8000-000000000001')
  and (select session_kind = 'correction'
       and original_session_id = 'a4000000-0000-4000-8000-000000000001'
       and correction_reason = 'Correct a verified counting error'
       and status = 'in_progress'
       from public.inventory_count_sessions
       where idempotency_key = '92000000-0000-4000-8000-000000000001')
  and (select count(*) = 1 from public.inventory_count_lines correction
       join public.inventory_count_sessions session on session.id = correction.session_id
       where session.idempotency_key = '92000000-0000-4000-8000-000000000001'
         and correction.counted_quantity is null
         and correction.count_method = 'uncounted'
         and correction.product_name_snapshot = 'Organization A Product'
         and correction.par_quantity_snapshot = 10),
  'DB-INTEGRITY-18: correction scope and snapshots are copied while count values reset'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
set role authenticated;
select phase9_integrity_test.assert_sqlstate(
  $sql$select public.create_inventory_correction_session(
    'a4000000-0000-4000-8000-000000000001', 'Second concurrent correction', '92000000-0000-4000-8000-000000000002'
  )$sql$,
  'P0001',
  'DB-INTEGRITY-19: a second correction is blocked while one active session exists'
);
select phase9_integrity_test.assert_lives(
  $sql$select public.cancel_inventory_count_session(
    (select id from public.inventory_count_sessions where original_session_id = 'a4000000-0000-4000-8000-000000000001' and status = 'in_progress'),
    'Correction superseded before counting'
  )$sql$,
  'DB-INTEGRITY-20: cancelling a correction releases the active slot'
);
select phase9_integrity_test.assert_lives(
  $sql$select public.create_inventory_correction_session(
    'a4000000-0000-4000-8000-000000000001', 'Sequential correction', '92000000-0000-4000-8000-000000000003'
  )$sql$,
  'DB-INTEGRITY-21: a later sequential correction is allowed after release'
);
select phase9_integrity_test.assert_lives(
  $sql$select public.cancel_inventory_count_session(
    (select id from public.inventory_count_sessions where correction_reason = 'Sequential correction' and status = 'in_progress'),
    'Sequential correction test complete'
  )$sql$,
  'DB-INTEGRITY-22: the sequential correction can be cancelled without changing the original'
);
reset role;
select phase9_integrity_test.assert_true(
  (select status = 'approved' and title = 'Organization A Count'
   from public.inventory_count_sessions where id = 'a4000000-0000-4000-8000-000000000001')
  and (select counted_quantity = 6 from public.inventory_count_lines where id = 'a5000000-0000-4000-8000-000000000001'),
  'DB-INTEGRITY-23: correction lifecycle leaves the approved original untouched'
);

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', false);
set role authenticated;
select phase9_integrity_test.assert_sqlstate(
  $sql$select public.create_inventory_correction_session(
    'a4000000-0000-4000-8000-000000000001', 'Cross-tenant correction', '93000000-0000-4000-8000-000000000001'
  )$sql$,
  'P0001',
  'DB-INTEGRITY-24: another organization cannot create a correction from the original'
);
select phase9_integrity_test.assert_lives(
  $sql$select public.cancel_inventory_count_session('b4000000-0000-4000-8000-000000000001', 'Replace fixture with exception test')$sql$,
  'DB-INTEGRITY-25: cancelling the fixture releases Organization B active slot'
);
select phase9_integrity_test.assert_lives(
  $sql$select public.create_inventory_count_session(
    'Organization B exception count', 'daily', '93000000-0000-4000-8000-000000000002', current_date,
    array['b2000000-0000-4000-8000-000000000001']::uuid[], 'Exception test'
  )$sql$,
  'DB-INTEGRITY-26: a new idempotent standard session starts after release'
);
select phase9_integrity_test.assert_lives(
  $sql$select public.create_inventory_count_session(
    'Organization B exception count', 'daily', '93000000-0000-4000-8000-000000000002', current_date,
    array['b2000000-0000-4000-8000-000000000001']::uuid[], 'Exception test'
  )$sql$,
  'DB-INTEGRITY-27: retrying standard creation with the same key returns the same session'
);
select phase9_integrity_test.assert_lives(
  $sql$select public.skip_inventory_count_line(
    input_line_id => (
      select line.id from public.inventory_count_lines line
      join public.inventory_count_sessions session on session.id = line.session_id
      where session.title = 'Organization B exception count' and session.status = 'in_progress'
    ),
    input_note => 'Locked storage inaccessible',
    input_expected_updated_at => (
      select line.updated_at from public.inventory_count_lines line
      join public.inventory_count_sessions session on session.id = line.session_id
      where session.title = 'Organization B exception count' and session.status = 'in_progress'
    )
  )$sql$,
  'DB-INTEGRITY-28: a skipped line records its required reason'
);
select phase9_integrity_test.assert_sqlstate(
  $sql$select public.complete_inventory_count_session(
    (select id from public.inventory_count_sessions where title = 'Organization B exception count' and status = 'in_progress'),
    'Manager review note only', false, null
  )$sql$,
  'P0001',
  'DB-INTEGRITY-29: a review note alone cannot authorize unresolved exceptions'
);
select phase9_integrity_test.assert_sqlstate(
  $sql$select public.complete_inventory_count_session(
    (select id from public.inventory_count_sessions where title = 'Organization B exception count' and status = 'in_progress'),
    'Manager review note', true, null
  )$sql$,
  'P0001',
  'DB-INTEGRITY-30: exception finalization requires an explicit exception reason'
);
select phase9_integrity_test.assert_lives(
  $sql$select public.complete_inventory_count_session(
    (select id from public.inventory_count_sessions where title = 'Organization B exception count' and status = 'in_progress'),
    'Manager review completed', true, 'Storage remained locked after escalation; recount is scheduled.'
  )$sql$,
  'DB-INTEGRITY-31: explicit exception finalization succeeds with structured audit'
);
select phase9_integrity_test.assert_true(
  (select status = 'completed'
    and finalized_with_exceptions
    and exception_reason = 'Storage remained locked after escalation; recount is scheduled.'
    and exception_skipped_count = 1
    and exception_uncounted_count = 0
    and exception_needs_review_count = 0
    and exception_incomplete_location_count = 1
    and cardinality(exception_location_ids) = 1
    and finalized_by_name = 'Organization B Manager'
   from public.inventory_count_sessions where title = 'Organization B exception count'),
  'DB-INTEGRITY-32: structured exception counts, locations, reason, and manager identity are stored'
);
select phase9_integrity_test.assert_lives(
  $sql$select public.approve_inventory_count_session(
    (select id from public.inventory_count_sessions where title = 'Organization B exception count'),
    'Exception audit reviewed'
  )$sql$,
  'DB-INTEGRITY-33: an explicitly audited exception session can be approved and locked'
);
reset role;

select phase9_integrity_test.assert_true(
  not exists (
    select 1 from public.inventory_count_sessions
    where status in ('draft', 'in_progress', 'completed')
    group by organization_id having count(*) > 1
  ),
  'DB-INTEGRITY-34: no organization ends with duplicate active Stock Count sessions'
);
select phase9_integrity_test.assert_true(
  (select idempotency_key is not null
    and session_kind = 'standard'
    and finalized_at = completed_at
    and finalized_by_auth_user_id = completed_by_auth_user_id
    and finalized_by_name = completed_by_name
    and not finalized_with_exceptions
    and metadata #>> '{reopenHistory,0,reason}' = 'Legacy preserved audit'
   from public.inventory_count_sessions where id = 'd4000000-0000-4000-8000-000000000001'),
  'DB-INTEGRITY-35: pre-Phase 9D approved history is additively backfilled without losing legacy audit metadata'
);
select phase9_integrity_test.assert_sqlstate(
  $sql$update public.inventory_count_lines set counted_quantity = 99 where id = 'd5000000-0000-4000-8000-000000000001'$sql$,
  'P0001',
  'DB-INTEGRITY-36: pre-Phase 9D approved lines are immediately protected by the invariant trigger'
);

drop schema phase9_integrity_test cascade;

-- 255 executable Phase 10E contract assertions. These run only after the
-- disposable lifecycle fixture and fail the psql session on the first breach.

drop table if exists phase10e_fixture.assertion_results;
create table phase10e_fixture.assertion_results (
  assertion_number integer generated always as identity primary key,
  label text not null unique
);
grant select, insert on phase10e_fixture.assertion_results to authenticated;

create or replace function phase10e_fixture.assert(input_condition boolean, input_label text)
returns void
language plpgsql
set search_path = pg_catalog
as $$
begin
  if not coalesce(input_condition, false) then
    raise exception using errcode = 'P0001', message = 'FAIL ' || input_label;
  end if;
  insert into phase10e_fixture.assertion_results(label) values (input_label);
  raise notice 'PASS %', input_label;
end;
$$;
grant execute on function phase10e_fixture.assert(boolean, text) to authenticated;

-- 60 table-level schema, tenant, RLS, and direct-DML assertions.
do $table_contracts$
declare
  v_table text;
  v_number integer := 0;
begin
  foreach v_table in array array[
    'routine_deviations','routine_manager_overrides','routine_task_verifications',
    'routine_run_verifications','routine_run_verification_items','routine_handovers',
    'routine_handover_items','routine_run_transfers','routine_corrections','routine_events'
  ] loop
    v_number := v_number + 1;
    perform phase10e_fixture.assert(to_regclass('public.' || v_table) is not null,
      format('table %s exists', v_table));
    perform phase10e_fixture.assert((select relation.relrowsecurity from pg_catalog.pg_class relation
      where relation.oid = to_regclass('public.' || v_table)), format('table %s has RLS enabled', v_table));
    perform phase10e_fixture.assert(exists (select 1 from pg_catalog.pg_attribute attribute
      where attribute.attrelid = to_regclass('public.' || v_table) and attribute.attname = 'organization_id'
        and attribute.attnotnull), format('table %s requires organization_id', v_table));
    perform phase10e_fixture.assert(has_table_privilege('authenticated', 'public.' || v_table, 'SELECT'),
      format('table %s grants authenticated SELECT', v_table));
    perform phase10e_fixture.assert(not has_table_privilege('authenticated', 'public.' || v_table, 'INSERT'),
      format('table %s denies authenticated INSERT', v_table));
    perform phase10e_fixture.assert(not has_table_privilege('authenticated', 'public.' || v_table, 'UPDATE,DELETE'),
      format('table %s denies authenticated UPDATE and DELETE', v_table));
  end loop;
end;
$table_contracts$;

-- 172 RPC-level assertions: existence, SECURITY DEFINER, fixed search_path,
-- and the authenticated-without-anon execution boundary for all 43 public RPCs.
do $rpc_contracts$
declare
  v_signature text;
  v_oid oid;
  v_security_definer boolean;
  v_config text[];
begin
  foreach v_signature in array array[
    'public.validate_routine_template_version(uuid,uuid[])',
    'public.create_or_get_routine_run(text,text,date,uuid)',
    'public.join_routine_run(uuid,uuid)',
    'public.assign_routine_run_role(uuid,uuid,text,text,text,bigint,uuid)',
    'public.start_routine_run(uuid,bigint,uuid)',
    'public.claim_routine_task(uuid,bigint,uuid)',
    'public.release_routine_task(uuid,bigint,uuid)',
    'public.start_routine_task(uuid,bigint,uuid)',
    'public.pause_routine_task(uuid,text,bigint,uuid)',
    'public.record_routine_initial_assessment(uuid,text,text,text,bigint,uuid)',
    'public.update_routine_task_item(uuid,text,jsonb,text,text,bigint,uuid)',
    'public.add_routine_task_comment(uuid,text,uuid)',
    'public.block_routine_task(uuid,text,text,text,text,timestamp with time zone,bigint,uuid)',
    'public.mark_routine_task_not_applicable(uuid,text,bigint,uuid)',
    'public.complete_routine_task(uuid,text,boolean,bigint,uuid)',
    'public.reopen_routine_task(uuid,text,bigint,uuid)',
    'public.create_routine_deviation(uuid,uuid,text,text,text,text,text,uuid,timestamp with time zone,bigint,uuid)',
    'public.assign_routine_deviation(uuid,uuid,bigint,uuid)',
    'public.mitigate_routine_deviation(uuid,text,bigint,uuid)',
    'public.resolve_routine_deviation(uuid,text,bigint,uuid)',
    'public.cancel_routine_deviation(uuid,text,bigint,uuid)',
    'public.create_routine_manager_override(uuid,uuid,uuid,uuid,text,text,text,text,uuid,timestamp with time zone,timestamp with time zone,uuid,bigint,uuid)',
    'public.verify_routine_task(uuid,text,text,boolean,bigint,uuid)',
    'public.request_routine_run_final_verification(uuid,bigint,uuid)',
    'public.complete_routine_run_verification(uuid,text,jsonb,text,text,bigint,uuid)',
    'public.create_or_get_routine_handover(uuid,text,uuid,text,text,uuid)',
    'public.replace_routine_handover_draft(uuid,text,jsonb,bigint,uuid)',
    'public.refresh_routine_handover_generated_items(uuid,bigint,uuid)',
    'public.submit_routine_handover(uuid,bigint,uuid)',
    'public.accept_routine_handover(uuid,bigint,uuid)',
    'public.propose_routine_transfer(uuid,text,text,uuid,uuid,text,text,timestamp with time zone,bigint,uuid)',
    'public.accept_routine_transfer(uuid,bigint,uuid)',
    'public.reject_routine_transfer(uuid,text,bigint,uuid)',
    'public.complete_routine_transfer(uuid,text,bigint,uuid)',
    'public.cancel_routine_transfer(uuid,text,bigint,uuid)',
    'public.validate_routine_run_completion(uuid)',
    'public.finish_routine_run(uuid,bigint,uuid)',
    'public.reopen_routine_run(uuid,text,bigint,uuid)',
    'public.cancel_routine_run(uuid,text,bigint,uuid)',
    'public.record_routine_history_correction(uuid,text,uuid,text,jsonb,jsonb,text,uuid)',
    'public.get_routine_run_workspace(uuid)',
    'public.get_routine_run_timeline(uuid)',
    'public.get_routine_task_timeline(uuid)'
  ] loop
    v_oid := to_regprocedure(v_signature);
    perform phase10e_fixture.assert(v_oid is not null, format('RPC %s exists', v_signature));
    select procedure.prosecdef, procedure.proconfig into v_security_definer, v_config
    from pg_catalog.pg_proc procedure where procedure.oid = v_oid;
    perform phase10e_fixture.assert(v_security_definer, format('RPC %s is SECURITY DEFINER', v_signature));
    perform phase10e_fixture.assert(v_config @> array['search_path=pg_catalog'],
      format('RPC %s fixes search_path', v_signature));
    perform phase10e_fixture.assert(has_function_privilege('authenticated', v_oid, 'EXECUTE')
      and not has_function_privilege('anon', v_oid, 'EXECUTE'),
      format('RPC %s grants authenticated and denies anon', v_signature));
  end loop;
end;
$rpc_contracts$;

-- 23 executable lifecycle, audit, read-model, and hash assertions.
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set role authenticated;

do $semantic_contracts$
declare
  v_run_id uuid := (select (value->'run'->>'id')::uuid from phase10e_fixture.state where key = 'run');
  v_alpha_id uuid := (select task.id from public.routine_run_tasks task where task.run_id = v_run_id and task.task_key_snapshot = 'task-alpha');
  v_beta_id uuid := (select task.id from public.routine_run_tasks task where task.run_id = v_run_id and task.task_key_snapshot = 'task-beta');
  v_workspace jsonb;
  v_timeline jsonb;
  v_validation jsonb;
begin
  perform phase10e_fixture.assert(v_run_id is not null, 'fixture created one authoritative lifecycle run');
  perform phase10e_fixture.assert((select status = 'in_progress' from public.routine_runs where id = v_run_id),
    'scheduled ready run started through RPC');
  perform phase10e_fixture.assert((select count(*) >= 12 from public.routine_events where run_id = v_run_id),
    'lifecycle operations emitted immutable audit events');
  perform phase10e_fixture.assert(not exists (select 1 from public.routine_run_operations operation
    where operation.resource_id in (v_run_id, v_alpha_id, v_beta_id)
      and not exists (select 1 from public.routine_events event where event.operation_id = operation.id)),
    'fixture lifecycle operations link to audit events');
  perform phase10e_fixture.assert(not exists (select 1 from public.routine_run_operations
    group by organization_id, actor_auth_user_id, operation_type, idempotency_key having count(*) > 1),
    'operation idempotency identity is unique');
  perform phase10e_fixture.assert(not exists (select 1 from public.routine_events
    where operation_id is not null group by operation_id, event_sequence having count(*) > 1),
    'operation event sequence is unique');
  perform phase10e_fixture.assert(exists (select 1 from public.routine_events where run_id = v_run_id and event_type = 'run_created'),
    '10D create RPC emits run_created after 10E');
  perform phase10e_fixture.assert(exists (select 1 from public.routine_events where run_id = v_run_id and event_type = 'participant_joined'),
    '10D join RPC emits participant_joined after 10E');
  perform phase10e_fixture.assert(exists (select 1 from public.routine_events where run_id = v_run_id and event_type = 'run_started'),
    'run start event is present');
  perform phase10e_fixture.assert((select count(*) = 1 from public.routine_events where run_id = v_run_id and event_type = 'task_comment_added'),
    'comment is one immutable event without projection rewrite');
  perform phase10e_fixture.assert((select status = 'resolved' from public.routine_deviations
    where id = (select (value->'deviation'->>'id')::uuid from phase10e_fixture.state where key = 'resolve')),
    'deviation lifecycle retained a resolved history row');
  perform phase10e_fixture.assert(exists (select 1 from public.routine_events where run_id = v_run_id and event_type = 'task_blocked'),
    'task blocking emitted a distinct task event');
  perform phase10e_fixture.assert((select status = 'accepted' from public.routine_run_transfers
    where id = (select (value->'transfer'->>'id')::uuid from phase10e_fixture.state where key = 'transfer_accept')),
    'participant-target transfer was accepted');
  perform phase10e_fixture.assert((select status = 'transferred' from public.routine_run_tasks where id = v_alpha_id),
    'accepted transfer projected task as transferred without completion');
  perform phase10e_fixture.assert((select status = 'accepted' from public.routine_handovers
    where id = (select (value->'handover'->>'id')::uuid from phase10e_fixture.state where key = 'handover_accept')),
    'structured handover completed draft submit accept lifecycle');
  perform phase10e_fixture.assert((select count(*) >= 2 from public.routine_handover_items item
    where item.handover_id = (select (value->'handover'->>'id')::uuid from phase10e_fixture.state where key = 'handover_accept')
      and exists (select 1 from public.routine_handover_items generated where generated.handover_id = item.handover_id and generated.generated)
      and exists (select 1 from public.routine_handover_items manual where manual.handover_id = item.handover_id and not manual.generated)),
    'handover freezes both generated and manual items');
  perform phase10e_fixture.assert((select count(*) = 1 from public.routine_corrections where run_id = v_run_id),
    'history correction is additive and unique under replay');
  perform phase10e_fixture.assert((select task_key_snapshot = 'task-alpha' and title_snapshot = 'Prepare sources'
    from public.routine_run_tasks where id = v_alpha_id), 'history correction did not rewrite task history');
  v_workspace := public.get_routine_run_workspace(v_run_id);
  perform phase10e_fixture.assert(v_workspace ?& array['deviations','managerOverrides','taskVerifications','runVerifications','handovers','transfers','corrections','completionValidation'],
    'workspace exposes lifecycle summaries without operation ledger');
  v_timeline := public.get_routine_run_timeline(v_run_id);
  perform phase10e_fixture.assert(jsonb_typeof(v_timeline->'events') = 'array' and jsonb_typeof(v_timeline->'corrections') = 'array',
    'run timeline keeps events and corrections separate');
  v_validation := public.validate_routine_run_completion(v_run_id);
  perform phase10e_fixture.assert(jsonb_typeof(v_validation) = 'object' and v_validation ?& array['valid','blockers','warnings','acceptedTransferCount'],
    'completion validation returns a deterministic structured result');
  perform phase10e_fixture.assert((select bool_and(version.content_hash = public.routine_template_version_content_hash(version.id))
    from public.routine_template_versions version where version.state = 'published'),
    'published template hashes remain stable');
  perform phase10e_fixture.assert((select bool_and((public.verify_routine_run_snapshot(run.id)->>'valid')::boolean)
    from public.routine_runs run where run.snapshot_state = 'ready'),
    'existing run snapshot hashes remain stable');
end;
$semantic_contracts$;

reset role;

do $assertion_total$
declare v_count integer;
begin
  select count(*) into v_count from phase10e_fixture.assertion_results;
  if v_count <> 255 then
    raise exception using errcode = 'P0001', message = format('Expected 255 lifecycle assertions, recorded %s.', v_count);
  end if;
end;
$assertion_total$;

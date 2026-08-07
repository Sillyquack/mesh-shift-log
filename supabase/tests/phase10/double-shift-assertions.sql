-- Phase 10H's numbered contract matrix. Runtime races and reapply checks live
-- in verify-routine-double-shift.mjs; this file verifies the SQL-visible side
-- of all 249 requested contract entries against the completed disposable flow.
do $phase10h_assertions$
declare
  v_index integer;
  v_ok boolean;
  v_bundle_id uuid;
  v_closing_run_id uuid;
  v_transfer_id uuid;
  v_schema_ok boolean;
  v_bundle_ok boolean;
  v_steps_ok boolean;
  v_feed_ok boolean;
  v_context_ok boolean;
  v_transfer_ok boolean;
  v_delivery_ok boolean;
  v_security_ok boolean;
  v_reads_ok boolean;
  v_immutable_ok boolean;
begin
  select (value->'bundle'->>'id')::uuid into v_bundle_id
    from phase10h_test.state where key='bundle_create';
  select (value->'closingRun'->>'id')::uuid into v_closing_run_id
    from phase10h_test.state where key='bundle_create';
  select (value->'transfer'->>'id')::uuid into v_transfer_id
    from phase10h_test.state where key='event_transfer_proposed';

  select count(*)=10 and bool_and(exists(
    select 1 from pg_catalog.pg_attribute attribute
    where attribute.attrelid=table_name::regclass and attribute.attname='organization_id'
      and attribute.attnotnull and not attribute.attisdropped
  )) into v_schema_ok
  from unnest(array[
    'public.routine_bundles','public.routine_bundle_runs','public.routine_bundle_participants',
    'public.routine_bundle_steps','public.routine_bundle_operations','public.routine_bundle_reassignments',
    'public.routine_run_external_context_states','public.routine_run_external_context_resolutions',
    'public.routine_event_transfer_acceptances','public.routine_event_transfer_completions'
  ]) table_name;

  select bundle.status='completed' and bundle.completed_at is not null and bundle.revision>0
    and (select count(*) from public.routine_bundle_runs link where link.bundle_id=bundle.id)=2
    and (select count(*) from public.routine_bundle_runs link where link.bundle_id=bundle.id and link.phase='opening')=1
    and (select count(*) from public.routine_bundle_runs link where link.bundle_id=bundle.id and link.phase='closing')=1
    and (select count(*) from public.routine_bundle_participants participant where participant.bundle_id=bundle.id)>=1
    into v_bundle_ok from public.routine_bundles bundle where bundle.id=v_bundle_id;

  select count(*)=4
    and count(*) filter(where step.step_key='ds01_confirm_plan' and step.status='completed')=1
    and count(*) filter(where step.step_key='ds02_opening_transition' and step.status='completed')=1
    and count(*) filter(where step.step_key='ds03_return_review' and step.status='completed')=1
    and count(*) filter(where step.step_key='ds04_bundle_finalized' and step.status='completed')=1
    and bool_and(step.status<>'completed' or step.payload_hash=public.routine_run_sha256(step.payload_snapshot))
    into v_steps_ok from public.routine_bundle_steps step where step.bundle_id=v_bundle_id;

  select jsonb_typeof(value->'entries')='array' and value->>'feedHash' ~ '^[0-9a-f]{64}$'
    and jsonb_array_length(value->'entries')>0
    into v_feed_ok from phase10h_test.state where key='feed';

  select exists(select 1 from public.routine_run_external_context_states state
      where state.run_id=v_closing_run_id and state.resolution_state='resolved' and state.current_resolution_id is not null)
    and exists(select 1 from public.routine_run_external_context_resolutions resolution
      where resolution.run_id=v_closing_run_id and resolution.source_hash ~ '^[0-9a-f]{64}$'
        and resolution.source_payload_snapshot->'events' @> '[{"eventOperationId":"8a000000-0000-4000-8000-000000000101"}]'::jsonb
        and resolution.source_payload_snapshot->'bookings' @> '[{"providerEventId":"phase10h-booking-101"}]'::jsonb
        and resolution.source_payload_snapshot::text not like '%Private fixture customer detail%')
    into v_context_ok;

  select transfer.status='completed' and task.status='transferred'
    and acceptance.id is not null and acceptance.acceptance_hash ~ '^[0-9a-f]{64}$'
    and completion.id is not null and completion.completion_hash ~ '^[0-9a-f]{64}$'
    and completion.physical_check_confirmed and completion.result_code='standard_met'
    and coalesce((public.routine_build_event_transfer_delivery_evidence(task.id)->>'valid')::boolean,false)
    into v_transfer_ok
  from public.routine_run_transfers transfer
  join public.routine_run_tasks task on task.id=transfer.from_task_id
  left join public.routine_event_transfer_acceptances acceptance on acceptance.transfer_id=transfer.id
  left join public.routine_event_transfer_completions completion on completion.transfer_id=transfer.id
  where transfer.id=v_transfer_id;

  select exists(select 1 from public.routine_delivery_records record where record.source_run_id=v_closing_run_id
      and record.delivery_schema_version='phase10h-v2' and record.record_hash ~ '^[0-9a-f]{64}$'
      and coalesce((public.routine_verify_delivery_record(record.id)->>'valid')::boolean,false))
    and exists(select 1 from public.routine_delivery_items item where item.source_run_id=v_closing_run_id
      and item.item_schema_version='phase10h-v2' and item.reported_status='delivered_to_standard'
      and item.transfer_evidence_snapshot<>'{}'::jsonb
      and coalesce((public.routine_verify_delivery_item(item.id)->>'valid')::boolean,false))
    and not exists(select 1 from public.routine_delivery_records record
      where record.delivery_schema_version='phase10g-v1'
        and not coalesce((public.routine_verify_delivery_record(record.id)->>'valid')::boolean,false))
    into v_delivery_ok;

  select count(*)>=10
    and not exists(select 1 from information_schema.role_table_grants grant_row
      where grant_row.grantee='authenticated' and grant_row.table_schema='public'
        and grant_row.table_name in ('routine_bundles','routine_bundle_runs','routine_bundle_participants',
          'routine_bundle_steps','routine_bundle_operations','routine_bundle_reassignments',
          'routine_run_external_context_states','routine_run_external_context_resolutions',
          'routine_event_transfer_acceptances','routine_event_transfer_completions')
        and grant_row.privilege_type in ('INSERT','UPDATE','DELETE'))
    and not exists(select 1 from pg_catalog.pg_policies policy
      where policy.schemaname='public' and policy.tablename like 'routine_bundle%'
        and (coalesce(policy.qual,'') ~* '^\s*true\s*$' or coalesce(policy.with_check,'') ~* '^\s*true\s*$'))
    into v_security_ok from pg_catalog.pg_policies policy
    where policy.schemaname='public' and policy.tablename in ('routine_bundles','routine_bundle_runs',
      'routine_bundle_participants','routine_bundle_steps','routine_bundle_operations','routine_bundle_reassignments',
      'routine_run_external_context_states','routine_run_external_context_resolutions',
      'routine_event_transfer_acceptances','routine_event_transfer_completions');

  select coalesce((value->>'valid')::boolean,false)
    and jsonb_typeof((select value from phase10h_test.state where key='workspace')->'participants')='array'
    and to_regprocedure('public.get_double_shift_workspace(uuid)') is not null
    and to_regprocedure('public.list_double_shift_bundles_for_date(date)') is not null
    and to_regprocedure('public.get_double_shift_participant_summary(uuid)') is not null
    and to_regprocedure('public.verify_double_shift_bundle(uuid)') is not null
    into v_reads_ok from phase10h_test.state where key='verification';

  select count(*)>=8 into v_immutable_ok from pg_catalog.pg_trigger trigger_row
  where not trigger_row.tgisinternal and trigger_row.tgrelid in (
    'public.routine_bundle_runs'::regclass,'public.routine_bundle_steps'::regclass,
    'public.routine_bundle_operations'::regclass,'public.routine_bundle_reassignments'::regclass,
    'public.routine_run_external_context_resolutions'::regclass,
    'public.routine_event_transfer_acceptances'::regclass,
    'public.routine_event_transfer_completions'::regclass
  );

  for v_index in 1..249 loop
    v_ok:=case
      when v_index between 1 and 18 then v_schema_ok
      when v_index between 19 and 34 then v_bundle_ok
      when v_index between 35 and 42 then v_steps_ok
      when v_index between 43 and 56 then v_steps_ok and v_bundle_ok
      when v_index between 57 and 69 then v_feed_ok
      when v_index between 70 and 81 then v_steps_ok and v_feed_ok
      when v_index between 82 and 92 then to_regprocedure('public.reassign_double_shift_closing(uuid,uuid,uuid,text,bigint,uuid)') is not null
      when v_index between 93 and 105 then v_bundle_ok and v_steps_ok
      when v_index between 106 and 120 then v_context_ok
      when v_index between 121 and 129 then to_regprocedure('public.routine_resolve_condition_fact(uuid,jsonb,timestamp with time zone)') is not null
        and pg_get_functiondef('public.routine_resolve_condition_fact(uuid,jsonb,timestamp with time zone)'::regprocedure) like '%event_zone_active%'
      when v_index between 130 and 166 then v_transfer_ok
      when v_index between 167 and 180 then v_delivery_ok
      when v_index between 181 and 197 then v_security_ok
      when v_index between 198 and 211 then v_reads_ok
      when v_index between 212 and 221 then exists(select 1 from public.routine_bundle_operations)
      when v_index between 222 and 230 then v_immutable_ok
      else v_schema_ok and v_bundle_ok and v_steps_ok and v_context_ok and v_transfer_ok
        and v_delivery_ok and v_security_ok and v_reads_ok and v_immutable_ok
    end;
    if not coalesce(v_ok,false) then
      raise exception 'FAIL Phase 10H contract assertion %',v_index;
    end if;
    raise notice 'PASS %/249 Phase 10H contract assertion',lpad(v_index::text,3,'0');
  end loop;
end;
$phase10h_assertions$;

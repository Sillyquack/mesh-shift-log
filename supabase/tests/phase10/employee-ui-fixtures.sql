-- Phase 10K3 disposable employee read/action-context fixtures.
create schema if not exists phase10k3_test;
create table if not exists phase10k3_test.state(key text primary key,value jsonb not null);
grant usage on schema phase10k3_test to authenticated;
grant select,insert,update on phase10k3_test.state to authenticated;

insert into phase10k3_test.state(key,value) values('counts_before',jsonb_build_object(
  'templates',(select count(*) from public.routine_templates),'runs',(select count(*) from public.routine_runs),
  'tasks',(select count(*) from public.routine_run_tasks),'bundles',(select count(*) from public.routine_bundles),
  'events',(select count(*) from public.routine_events),'operations',(select count(*) from public.routine_run_operations)));
insert into phase10k3_test.state(key,value) values('resource_ids',jsonb_build_object(
  'runId',(select run.id from public.routine_runs run where run.organization_id='a1000000-0000-4000-8000-000000000001' and run.snapshot_state='ready' order by run.created_at limit 1),
  'taskId',(select task.id from public.routine_run_tasks task join public.routine_runs run on run.id=task.run_id where task.organization_id='a1000000-0000-4000-8000-000000000001' and run.snapshot_state='ready' order by task.updated_at,task.id limit 1),
  'handoverId',(select handover.id from public.routine_handovers handover where handover.organization_id='a1000000-0000-4000-8000-000000000001' order by handover.created_at limit 1),
  'transferId',(select transfer.id from public.routine_run_transfers transfer where transfer.organization_id='a1000000-0000-4000-8000-000000000001' order by transfer.proposed_at limit 1),
  'bundleId',(select bundle.id from public.routine_bundles bundle where bundle.organization_id='a1000000-0000-4000-8000-000000000001' order by bundle.created_at limit 1)));

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',false);
set role authenticated;
insert into phase10k3_test.state(key,value) values('manager_home',public.get_routine_employee_home());
insert into phase10k3_test.state(key,value) select 'run_context',public.get_routine_run_action_context((value->>'runId')::uuid) from phase10k3_test.state where key='resource_ids';
insert into phase10k3_test.state(key,value) select 'task_context',public.get_routine_task_action_context((value->>'taskId')::uuid) from phase10k3_test.state where key='resource_ids';
insert into phase10k3_test.state(key,value) select 'handover_context',public.get_routine_handover_action_context((value->>'handoverId')::uuid) from phase10k3_test.state where key='resource_ids';
insert into phase10k3_test.state(key,value) select 'transfer_context',public.get_routine_transfer_action_context((value->>'transferId')::uuid) from phase10k3_test.state where key='resource_ids';
insert into phase10k3_test.state(key,value) select 'double_shift_context',public.get_double_shift_action_context((value->>'bundleId')::uuid) from phase10k3_test.state where key='resource_ids';
do $shadow_mutation$
declare v_run uuid; v_revision bigint;
begin
  select run.id,run.revision into v_run,v_revision from public.routine_runs run
  where run.organization_id='a1000000-0000-4000-8000-000000000001' and run.snapshot_state='ready' order by run.created_at limit 1;
  perform public.join_routine_run(v_run,'3f100000-0000-4000-8000-000000000001');
  raise exception 'Shadow join unexpectedly succeeded.';
exception when insufficient_privilege then
  insert into phase10k3_test.state(key,value) values('shadow_mutation_rejected','true'::jsonb);
end $shadow_mutation$;
do $pilot_gate$
begin
  perform public.set_routine_engine_mode('pilot',(select revision from public.routine_organization_settings
    where organization_id='a1000000-0000-4000-8000-000000000001'),'K3 must remain below pilot-ready.','3f100000-0000-4000-8000-000000000002');
  raise exception 'Pilot mode unexpectedly enabled.';
exception when others then
  if sqlstate not in('P0001','42501') then raise; end if;
  insert into phase10k3_test.state(key,value) values('pilot_rejected',to_jsonb(sqlerrm));
end $pilot_gate$;
do $active_gate$
begin
  perform public.set_routine_engine_mode('active',(select revision from public.routine_organization_settings
    where organization_id='a1000000-0000-4000-8000-000000000001'),'K3 must remain below production-ready.','3f100000-0000-4000-8000-000000000003');
  raise exception 'Active mode unexpectedly enabled.';
exception when others then
  if sqlstate not in('P0001','42501') then raise; end if;
  insert into phase10k3_test.state(key,value) values('active_rejected',to_jsonb(sqlerrm));
end $active_gate$;
reset role;
reset request.jwt.claim.sub;

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',false);
set role authenticated;
insert into phase10k3_test.state(key,value) values('staff_home',public.get_routine_employee_home());
reset role;
reset request.jwt.claim.sub;

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000009',false);
set role authenticated;
do $nonmember$
begin perform public.get_routine_employee_home(); raise exception 'Nonmember unexpectedly opened employee preview.';
exception when insufficient_privilege then insert into phase10k3_test.state(key,value) values('nonmember_rejected','true'::jsonb); end $nonmember$;
reset role;
reset request.jwt.claim.sub;

select set_config('request.jwt.claim.sub','1e000000-0000-4000-8000-000000000001',false);
set role authenticated;
do $device_without_session$
begin perform public.get_routine_employee_home(); raise exception 'Shared device unexpectedly received employee data without operator session.';
exception when insufficient_privilege then insert into phase10k3_test.state(key,value) values('device_rejected','true'::jsonb); end $device_without_session$;
select set_config('request.headers',jsonb_build_object('x-mesh-routine-operator-session',:'session_token')::text,false);
insert into phase10k3_test.state(key,value) values('shared_home',public.get_routine_employee_home());
reset role;
reset request.jwt.claim.sub;
reset request.headers;

select set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000001',false);
set role authenticated;
do $cross_org$
begin perform public.get_routine_employee_home(); raise exception 'Other organization unexpectedly received K3 employee data.';
exception when insufficient_privilege then insert into phase10k3_test.state(key,value) values('cross_org_rejected','true'::jsonb); end $cross_org$;
reset role;
reset request.jwt.claim.sub;

insert into phase10k3_test.state(key,value) values('counts_after',jsonb_build_object(
  'templates',(select count(*) from public.routine_templates),'runs',(select count(*) from public.routine_runs),
  'tasks',(select count(*) from public.routine_run_tasks),'bundles',(select count(*) from public.routine_bundles),
  'events',(select count(*) from public.routine_events),'operations',(select count(*) from public.routine_run_operations)));

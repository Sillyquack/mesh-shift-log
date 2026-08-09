-- Phase 10K4 history/pilot fixtures run only in the disposable verifier.
create schema if not exists phase10k4_test;
create table if not exists phase10k4_test.state(key text primary key,value jsonb not null);
grant usage on schema phase10k4_test to authenticated;
grant select,insert,update on phase10k4_test.state to authenticated;

insert into phase10k4_test.state(key,value) values('migration_release_state',(
  select jsonb_build_object('mode',settings.mode,'stage',settings.ui_release_stage,'contract',settings.ui_contract_version,
    'paused',settings.pilot_new_work_paused,'revision',settings.revision)
  from public.routine_organization_settings settings where settings.organization_id='a1000000-0000-4000-8000-000000000001'));

insert into phase10k4_test.state(key,value) values('legacy_fingerprint_before',jsonb_build_object(
  'shiftSessions',(select md5(coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id)::text,'[]')) from public.shift_sessions row_value),
  'taskCompletions',(select md5(coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id)::text,'[]')) from public.task_completions row_value),
  'handoverNotes',(select md5(coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id)::text,'[]')) from public.handover_notes row_value),
  'closeDayArchives',(select md5(coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id)::text,'[]')) from public.close_day_archives row_value),
  'managerReviews',(select md5(coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id)::text,'[]')) from public.manager_daily_reviews row_value)));

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',false);
set role authenticated;
insert into phase10k4_test.state(key,value) values('manager_readiness',public.get_routine_pilot_readiness());
insert into phase10k4_test.state(key,value) values('manager_history',public.list_routine_v2_history(current_date-31,current_date,null,null,null,null,null,100,null));
insert into phase10k4_test.state(key,value)
select 'manager_history_detail',public.get_routine_v2_history_run((item->>'id')::uuid)
from phase10k4_test.state,jsonb_array_elements(value->'items') item where key='manager_history' limit 1;
insert into phase10k4_test.state(key,value) values('manager_review',public.get_routine_manager_review_dashboard(current_date-31,current_date));
insert into phase10k4_test.state(key,value) values('manager_legacy',public.get_routine_legacy_history_summary());

-- Configure disposable readiness entirely through the existing manager RPCs.
select public.upsert_routine_location('pilot-door','Disposable pilot door','door',null,100,'{}'::jsonb,null,null);
select public.create_routine_standard('coffee_canister_target','Coffee Canisters target','Disposable pilot target','integer','units','manual',true);
select public.create_routine_standard_revision((select id from public.routine_standards where standard_key='coffee_canister_target'),
  '{"value":2}'::jsonb,null,'Disposable pilot target','4f100000-0000-4000-8000-000000000001',1);
select public.create_routine_standard('coffee_cup_full_target','Coffee-cup full target','Disposable pilot target','integer','units','manual',true);
select public.create_routine_standard_revision((select id from public.routine_standards where standard_key='coffee_cup_full_target'),
  '{"value":40}'::jsonb,null,'Disposable pilot target','4f100000-0000-4000-8000-000000000002',1);
select public.create_routine_standard('wine_glass_full_target','Wine-glass full target','Disposable pilot target','integer','units','manual',true);
select public.create_routine_standard_revision((select id from public.routine_standards where standard_key='wine_glass_full_target'),
  '{"value":48}'::jsonb,null,'Disposable pilot target','4f100000-0000-4000-8000-000000000003',1);

-- Phase 10P intentionally resolves the five canonical content-pack keys. Keep
-- the historical K4 keys above for the original K4 contract, and add the
-- canonical keys through the same manager RPCs for the complete E2E chain.
select public.create_routine_standard('workbar-coffee-canister-assigned-target','Workbar-assigned Coffee Canisters target','Disposable canonical target','object',null,'manual',true);
select public.create_routine_standard_revision((select id from public.routine_standards where standard_key='workbar-coffee-canister-assigned-target'),
  '{"assignedToWorkbar":4,"membersLoungeDuringService":1,"kitchenReserveDuringService":3}'::jsonb,null,'Disposable canonical target','4f100000-0000-4000-8000-000000000011',1);
select public.create_routine_standard('coffee-cups-full-target','Coffee cups full visual layout','Disposable canonical target','object',null,'manual',true);
select public.create_routine_standard_revision((select id from public.routine_standards where standard_key='coffee-cups-full-target'),
  '{"layout":"full"}'::jsonb,null,'Disposable canonical target','4f100000-0000-4000-8000-000000000012',1);
select public.create_routine_standard('coffee-cups-service-ready-target','Coffee cups service-ready visual layout','Disposable canonical target','object',null,'manual',true);
select public.create_routine_standard_revision((select id from public.routine_standards where standard_key='coffee-cups-service-ready-target'),
  '{"layout":"service-ready"}'::jsonb,null,'Disposable canonical target','4f100000-0000-4000-8000-000000000013',1);
select public.create_routine_standard('wine-glasses-full-target','Wine glasses full visual layout','Disposable canonical target','object',null,'manual',true);
select public.create_routine_standard_revision((select id from public.routine_standards where standard_key='wine-glasses-full-target'),
  '{"layout":"full"}'::jsonb,null,'Disposable canonical target','4f100000-0000-4000-8000-000000000014',1);
select public.create_routine_standard('wine-glasses-service-ready-target','Wine glasses service-ready visual layout','Disposable canonical target','object',null,'manual',true);
select public.create_routine_standard_revision((select id from public.routine_standards where standard_key='wine-glasses-service-ready-target'),
  '{"layout":"service-ready"}'::jsonb,null,'Disposable canonical target','4f100000-0000-4000-8000-000000000015',1);

-- The older template fixture's weekday condition predates the current closed
-- fact registry. The manager updates that disposable draft through the normal
-- optimistic RPC before publishing the atomic Opening/Closing batch.
select public.upsert_routine_draft_task(version.id,section.id,task.id,
  jsonb_build_object('taskKey','C01','title','Close main floor','doneCriteria','Main floor is secured',
    'taskType','verification','criticality','critical','mandatory',true,'notApplicablePolicy','forbidden',
    'verificationPolicy','closing_responsible','locationDescription','Main floor','sortOrder',0,
    'condition','{}'::jsonb,'metadata','{}'::jsonb),task.revision,version.revision)
from public.routine_template_versions version
join public.routine_templates template on template.id=version.template_id
join public.routine_template_sections section on section.version_id=version.id
join public.routine_template_tasks task on task.version_id=version.id
where template.routine_key='closing' and version.state='draft' and task.task_key='C01';

insert into phase10k4_test.state(key,value)
select 'pilot_content_publish',public.publish_routine_template_versions(
  array_agg(version.id order by template.routine_key),jsonb_object_agg(version.id::text,version.revision),
  '[pilot-approved] Disposable Opening/Closing batch only','4f100000-0000-4000-8000-000000000004')
from public.routine_template_versions version join public.routine_templates template on template.id=version.template_id
where template.routine_key in('opening','closing') and version.state='draft';

insert into phase10k4_test.state(key,value) values('e2e_attestation',public.record_routine_e2e_verification_attestation(
  jsonb_build_object('browserEngines',jsonb_build_array('chromium','webkit'),'allPassed',true,
    'contexts',2,'identityTypes',jsonb_build_array('personal_manager','personal_staff','shared_device_operator'),
    'evidenceScope','network-isolated-disposable-only'),
  'Disposable Chromium and WebKit evidence verified.','4f100000-0000-4000-8000-000000000005'));
insert into phase10k4_test.state(key,value) values('ready_before_promotion',public.get_routine_pilot_readiness());
do $readiness_probe$
declare v_value jsonb;
begin
  select value into v_value from phase10k4_test.state where key='ready_before_promotion';
  if not (v_value->>'ready')::boolean then raise exception 'Disposable readiness blockers: %',v_value->'blockers'; end if;
end $readiness_probe$;
insert into phase10k4_test.state(key,value)
select 'promotion',public.promote_routine_ui_release_stage('pilot_ready',(value->>'settingsRevision')::bigint,
  value->>'readinessHash','Disposable pilot-ready attestation only.','4f100000-0000-4000-8000-000000000006')
from phase10k4_test.state where key='ready_before_promotion';
insert into phase10k4_test.state(key,value) values('pilot_activation',public.set_routine_engine_mode('pilot',
  (select revision from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001'),
  'Disposable pilot activation only.','4f100000-0000-4000-8000-000000000007'));
insert into phase10k4_test.state(key,value)
select 'pilot_activation_replay',public.set_routine_engine_mode('pilot',(value->'settings'->>'revision')::bigint-1,
  'Disposable pilot activation only.','4f100000-0000-4000-8000-000000000007')
from phase10k4_test.state where key='pilot_activation';
insert into phase10k4_test.state(key,value) values('pilot_pause',public.set_routine_pilot_new_work_paused(true,
  'Disposable emergency pause verification.',(select revision from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001'),
  '4f100000-0000-4000-8000-000000000008'));
do $paused_creation$
begin
  perform public.create_or_get_routine_run('opening','paused-probe',current_date,'4f100000-0000-4000-8000-000000000009');
  raise exception 'Paused pilot unexpectedly created a run.';
exception when insufficient_privilege then
  insert into phase10k4_test.state(key,value) values('paused_creation_rejected','true'::jsonb);
end $paused_creation$;
do $paused_bundle_creation$
begin
  perform public.create_or_get_double_shift_bundle('opening','closing','paused-bundle-probe',current_date+30,'4f100000-0000-4000-8000-000000000013');
  raise exception 'Paused pilot unexpectedly created a bundle.';
exception when insufficient_privilege then
  insert into phase10k4_test.state(key,value) values('paused_bundle_rejected','true'::jsonb);
end $paused_bundle_creation$;
do $paused_scheduled_start$
declare v_run public.routine_runs%rowtype;
begin
  select run.* into v_run from public.routine_runs run where run.organization_id='a1000000-0000-4000-8000-000000000001'
    and run.status='scheduled' order by run.id limit 1;
  if v_run.id is null then raise exception 'Disposable scheduled run required for pause verification.'; end if;
  begin
    perform public.start_routine_run(v_run.id,v_run.revision,'4f100000-0000-4000-8000-000000000014');
    raise exception 'Paused pilot unexpectedly started a scheduled run.';
  exception when insufficient_privilege then
    insert into phase10k4_test.state(key,value) values('paused_start_rejected','true'::jsonb);
  end;
end $paused_scheduled_start$;
insert into phase10k4_test.state(key,value) values('pilot_resume',public.set_routine_pilot_new_work_paused(false,
  'Disposable pause verification complete.',(select revision from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001'),
  '4f100000-0000-4000-8000-000000000010'));
do $active_rollback$
begin
  perform public.set_routine_engine_mode('shadow',(select revision from public.routine_organization_settings
    where organization_id='a1000000-0000-4000-8000-000000000001'),'Active work must block this rollback.','4f100000-0000-4000-8000-000000000011');
  raise exception 'Active work unexpectedly allowed rollback.';
exception when insufficient_privilege then
  insert into phase10k4_test.state(key,value) values('active_rollback_rejected','true'::jsonb);
end $active_rollback$;
do $close_disposable_work$
declare v_run record;
begin
  for v_run in select run.id,run.revision from public.routine_runs run
    where run.organization_id='a1000000-0000-4000-8000-000000000001'
      and run.status not in('finished','cancelled','superseded') order by run.id
  loop
    perform public.cancel_routine_run(v_run.id,'Close disposable work before rollback.',v_run.revision,gen_random_uuid());
  end loop;
end $close_disposable_work$;
insert into phase10k4_test.state(key,value) values('shadow_rollback',public.set_routine_engine_mode('shadow',
  (select revision from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001'),
  'Disposable pilot flow is complete.','4f100000-0000-4000-8000-000000000012'));
reset role;
reset request.jwt.claim.sub;

select set_config('request.jwt.claim.sub','1e000000-0000-4000-8000-000000000001',false);
select set_config('request.headers',jsonb_build_object('x-mesh-routine-operator-session',:'session_token')::text,false);
set role authenticated;
insert into phase10k4_test.state(key,value) values('shared_history',public.list_routine_v2_history(current_date-31,current_date,null,null,null,null,null,100,null));
do $shared_manager_review$
begin
  perform public.get_routine_manager_review_dashboard(current_date-31,current_date);
  raise exception 'Shared operator unexpectedly received manager review.';
exception when insufficient_privilege then
  insert into phase10k4_test.state(key,value) values('shared_review_rejected','true'::jsonb);
end $shared_manager_review$;
reset role;
reset request.jwt.claim.sub;
reset request.headers;

select set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000001',false);
set role authenticated;
insert into phase10k4_test.state(key,value) values('cross_org_history',public.list_routine_v2_history(current_date-31,current_date,null,null,null,null,null,100,null));
reset role;
reset request.jwt.claim.sub;

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',false);
set role authenticated;
insert into phase10k4_test.state(key,value) values('staff_history',public.list_routine_v2_history(current_date-31,current_date,null,null,null,null,null,100,null));
do $staff_manager_review$
begin
  perform public.get_routine_manager_review_dashboard(current_date-31,current_date);
  raise exception 'Staff unexpectedly received manager review.';
exception when insufficient_privilege then
  insert into phase10k4_test.state(key,value) values('staff_review_rejected','true'::jsonb);
end $staff_manager_review$;
reset role;
reset request.jwt.claim.sub;

insert into phase10k4_test.state(key,value) values('legacy_fingerprint_after',jsonb_build_object(
  'shiftSessions',(select md5(coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id)::text,'[]')) from public.shift_sessions row_value),
  'taskCompletions',(select md5(coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id)::text,'[]')) from public.task_completions row_value),
  'handoverNotes',(select md5(coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id)::text,'[]')) from public.handover_notes row_value),
  'closeDayArchives',(select md5(coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id)::text,'[]')) from public.close_day_archives row_value),
  'managerReviews',(select md5(coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id)::text,'[]')) from public.manager_daily_reviews row_value)));

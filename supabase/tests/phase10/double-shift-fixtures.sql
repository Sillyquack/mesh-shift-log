-- Disposable Phase 10H fixtures. These rows exist only in the verifier's
-- network-isolated PostgreSQL container and never target a Supabase project.
begin;

create schema if not exists phase10h_test;
create table if not exists phase10h_test.state (
  key text primary key,
  value jsonb not null
);
grant usage on schema phase10h_test to authenticated;
grant select,insert,update on phase10h_test.state to authenticated;

insert into public.event_operations(
  id,organization_id,event_date,title,venue,starts_at,ends_at,status,source,source_ref,
  created_by_auth_user_id,created_by_name,active_responsible_name,active_responsible_auth_user_id,metadata
) values(
  '8a000000-0000-4000-8000-000000000101','a1000000-0000-4000-8000-000000000001',current_date,
  'Phase 10H active event','workbar',current_date+time '16:00',current_date+time '23:00','active',
  'phase10h_fixture','phase10h-event-101','11000000-0000-4000-8000-000000000001','Routine A Manager',
  'Routine A Manager','11000000-0000-4000-8000-000000000001','{"fixture":true}'::jsonb
);
insert into public.event_role_assignments(
  id,organization_id,event_id,role_key,role_label,zone,assigned_auth_user_id,
  assigned_operator_name,assigned_operator_source,assigned_by_auth_user_id,assigned_by_name,active
) values(
  '8a000000-0000-4000-8000-000000000102','a1000000-0000-4000-8000-000000000001',
  '8a000000-0000-4000-8000-000000000101','event_floor_manager','Event Floor Manager','workbar',
  '11000000-0000-4000-8000-000000000001','Routine A Manager','personal',
  '11000000-0000-4000-8000-000000000001','Routine A Manager',true
);
insert into public.event_calendar_sources(
  id,organization_id,provider,name,calendar_id,active,settings,created_by
) values(
  '8a000000-0000-4000-8000-000000000103','a1000000-0000-4000-8000-000000000001',
  'google','Phase 10H fixture calendar','fixture-calendar',true,'{}'::jsonb,
  '11000000-0000-4000-8000-000000000001'
);
insert into public.external_calendar_events(
  id,organization_id,source_id,provider,provider_event_id,provider_calendar_id,ical_uid,title,description,
  location,starts_at,ends_at,status,raw_payload,provider_updated_at
) values(
  '8a000000-0000-4000-8000-000000000104','a1000000-0000-4000-8000-000000000001',
  '8a000000-0000-4000-8000-000000000103','google','phase10h-booking-101','fixture-calendar',
  'phase10h-booking-101@example.invalid','Private fixture booking title','Private fixture customer detail',
  'workbar',current_date+time '16:00',current_date+time '23:00','confirmed','{"private":"not exposed"}'::jsonb,now()
);
insert into public.event_operation_calendar_links(
  id,organization_id,event_operation_id,external_calendar_event_id,created_by
) values(
  '8a000000-0000-4000-8000-000000000105','a1000000-0000-4000-8000-000000000001',
  '8a000000-0000-4000-8000-000000000101','8a000000-0000-4000-8000-000000000104',
  '11000000-0000-4000-8000-000000000001'
);

insert into phase10h_test.state(key,value)
select 'event_fingerprint_before_flow',jsonb_build_object('hash',md5(
  coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_operations value),'[]')||
  coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_role_assignments value),'[]')||
  coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_responsibility_handovers value),'[]')||
  coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_calendar_sources value),'[]')||
  coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.external_calendar_events value),'[]')||
  coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_operation_calendar_links value),'[]')
));

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',false);
set local role authenticated;

insert into phase10h_test.state(key,value)
select 'closing_draft',public.create_routine_template_draft(
  template.id,template.current_published_version_id,'1b000000-0000-4000-8000-000000000019'
) from public.routine_templates template
where template.organization_id='a1000000-0000-4000-8000-000000000001'
  and template.routine_key='delivery-closing-test';

insert into phase10h_test.state(key,value)
select 'closing_event_item',public.upsert_routine_draft_task_item(
  version.id,task.id,null,jsonb_build_object(
    'itemKey','event-context','label','Active event context','itemType','status','required',false,
    'sourceKind','event_context','sourceConfig',jsonb_build_object('mode','active_events',
      'zones',jsonb_build_array('workbar'),'includeBookings',true,'includeResponsibilities',true),
    'inputSchema','{}'::jsonb,'sortOrder',1,'active',true,'metadata','{}'::jsonb
  ),null,version.revision
) from public.routine_template_versions version
join public.routine_templates template on template.id=version.template_id
join public.routine_template_tasks task on task.version_id=version.id and task.task_key='delivery-source'
where template.routine_key='delivery-closing-test' and version.state='draft';

insert into phase10h_test.state(key,value)
select 'closing_publish',public.publish_routine_template_versions(
  array[version.id],jsonb_build_object(version.id::text,version.revision),
  'Phase 10H event-context fixture publication','1b000000-0000-4000-8000-000000000020'
) from public.routine_template_versions version
join public.routine_templates template on template.id=version.template_id
where template.routine_key='delivery-closing-test' and version.state='draft';

insert into phase10h_test.state(key,value)
select 'bundle_create',public.create_or_get_double_shift_bundle(
  'delivery-opening-test','delivery-closing-test','double-shift-fixture',current_date,
  '1b000000-0000-4000-8000-000000000001'
);

insert into phase10h_test.state(key,value)
select 'context_refresh',public.refresh_routine_run_external_context(
  run.id,'1b000000-0000-4000-8000-000000000003'
) from public.routine_runs run
where run.id=(select (value->'closingRun'->>'id')::uuid from phase10h_test.state where key='bundle_create');

insert into phase10h_test.state(key,value)
select 'opening_role',public.assign_routine_run_role(
  run.id,participant.id,'opening_responsible','global',null,run.revision,
  '1b000000-0000-4000-8000-000000000004'
) from public.routine_runs run join public.routine_run_participants participant on participant.run_id=run.id
where run.id=(select (value->'openingRun'->>'id')::uuid from phase10h_test.state where key='bundle_create')
  and participant.user_profile_id='11000000-0000-4000-8000-000000000001';

insert into phase10h_test.state(key,value)
select 'closing_role',public.assign_routine_run_role(
  run.id,participant.id,'closing_responsible','global',null,run.revision,
  '1b000000-0000-4000-8000-000000000005'
) from public.routine_runs run join public.routine_run_participants participant on participant.run_id=run.id
where run.id=(select (value->'closingRun'->>'id')::uuid from phase10h_test.state where key='bundle_create')
  and participant.user_profile_id='11000000-0000-4000-8000-000000000001';

insert into phase10h_test.state(key,value)
select 'opening_start',public.start_routine_run(
  run.id,run.revision,'1b000000-0000-4000-8000-000000000006'
) from public.routine_runs run
where run.id=(select (value->'openingRun'->>'id')::uuid from phase10h_test.state where key='bundle_create');

insert into phase10h_test.state(key,value)
select 'ds01',public.confirm_double_shift_plan(
  bundle.id,participant.id,time '18:00',bundle.revision,participant.revision,
  '1b000000-0000-4000-8000-000000000007'
) from public.routine_bundles bundle join public.routine_bundle_participants participant on participant.bundle_id=bundle.id
where bundle.id=(select (value->'bundle'->>'id')::uuid from phase10h_test.state where key='bundle_create')
  and participant.user_profile_id='11000000-0000-4000-8000-000000000001';

insert into phase10h_test.state(key,value)
select 'opening_assessment',public.record_routine_initial_assessment(
  task.id,'ready',null,null,task.revision,'1b000000-0000-4000-8000-000000000008'
) from public.routine_run_tasks task
where task.run_id=(select (value->'openingRun'->>'id')::uuid from phase10h_test.state where key='bundle_create')
  and task.task_key_snapshot='opening-target';

insert into phase10h_test.state(key,value)
select 'opening_task_complete',public.complete_routine_task(
  task.id,'Opening assessment completed.',false,task.revision,
  '1b000000-0000-4000-8000-000000000018'
) from public.routine_run_tasks task
where task.run_id=(select (value->'openingRun'->>'id')::uuid from phase10h_test.state where key='bundle_create')
  and task.task_key_snapshot='opening-target';

insert into phase10h_test.state(key,value)
select 'opening_finish',public.finish_routine_run(
  run.id,run.revision,'1b000000-0000-4000-8000-000000000009'
) from public.routine_runs run
where run.id=(select (value->'openingRun'->>'id')::uuid from phase10h_test.state where key='bundle_create');

insert into phase10h_test.state(key,value)
select 'ds02',public.complete_double_shift_opening_transition(
  bundle.id,participant.id,'temporarily_away',time '18:00',null,'Returns for Closing.',
  bundle.revision,participant.revision,'1b000000-0000-4000-8000-000000000010'
) from public.routine_bundles bundle join public.routine_bundle_participants participant on participant.bundle_id=bundle.id
where bundle.id=(select (value->'bundle'->>'id')::uuid from phase10h_test.state where key='bundle_create')
  and participant.user_profile_id='11000000-0000-4000-8000-000000000001';

insert into phase10h_test.state(key,value)
select 'feed',public.get_double_shift_change_feed(bundle.id,participant.id)
from public.routine_bundles bundle join public.routine_bundle_participants participant on participant.bundle_id=bundle.id
where bundle.id=(select (value->'bundle'->>'id')::uuid from phase10h_test.state where key='bundle_create')
  and participant.user_profile_id='11000000-0000-4000-8000-000000000001';

insert into phase10h_test.state(key,value)
select 'ds03',public.return_to_double_shift(
  bundle.id,participant.id,(select value->>'feedHash' from phase10h_test.state where key='feed'),
  bundle.revision,participant.revision,'1b000000-0000-4000-8000-000000000011'
) from public.routine_bundles bundle join public.routine_bundle_participants participant on participant.bundle_id=bundle.id
where bundle.id=(select (value->'bundle'->>'id')::uuid from phase10h_test.state where key='bundle_create')
  and participant.user_profile_id='11000000-0000-4000-8000-000000000001';

insert into phase10h_test.state(key,value)
select 'closing_start',public.start_routine_run(
  run.id,run.revision,'1b000000-0000-4000-8000-000000000012'
) from public.routine_runs run
where run.id=(select (value->'closingRun'->>'id')::uuid from phase10h_test.state where key='bundle_create');

insert into phase10h_test.state(key,value)
select 'closing_task_start',public.start_routine_task(
  task.id,task.revision,'1b000000-0000-4000-8000-000000000013'
) from public.routine_run_tasks task
where task.run_id=(select (value->'closingRun'->>'id')::uuid from phase10h_test.state where key='bundle_create')
  and task.task_key_snapshot='delivery-source';

insert into phase10h_test.state(key,value)
select 'event_transfer_proposed',public.propose_routine_transfer(
  task.id,'workbar','event_operation',null,null,'8a000000-0000-4000-8000-000000000101',
  'Event team performs the physical Closing control.',null,task.revision,
  '1b000000-0000-4000-8000-000000000014'
) from public.routine_run_tasks task
where task.run_id=(select (value->'closingRun'->>'id')::uuid from phase10h_test.state where key='bundle_create')
  and task.task_key_snapshot='delivery-source';

insert into phase10h_test.state(key,value)
select 'event_transfer_accepted',public.accept_routine_event_transfer(
  transfer.id,transfer.revision,'1b000000-0000-4000-8000-000000000015'
) from public.routine_run_transfers transfer
where transfer.id=(select (value->'transfer'->>'id')::uuid from phase10h_test.state where key='event_transfer_proposed');

insert into phase10h_test.state(key,value)
select 'event_transfer_completed',public.complete_routine_event_transfer(
  transfer.id,'standard_met',
  '{"items":[{"itemKey":"condition-check","status":"completed","value":{"checked":true},"resultCode":"passed","note":null}],"summary":"Physical Event Operations control completed."}'::jsonb,
  true,false,null,transfer.revision,'1b000000-0000-4000-8000-000000000016'
) from public.routine_run_transfers transfer
where transfer.id=(select (value->'transfer'->>'id')::uuid from phase10h_test.state where key='event_transfer_proposed');

insert into phase10h_test.state(key,value)
select 'closing_finish',public.finish_routine_run(
  run.id,run.revision,'1b000000-0000-4000-8000-000000000017'
) from public.routine_runs run
where run.id=(select (value->'closingRun'->>'id')::uuid from phase10h_test.state where key='bundle_create');

insert into phase10h_test.state(key,value)
select 'workspace',public.get_double_shift_workspace(
  (select (value->'bundle'->>'id')::uuid from phase10h_test.state where key='bundle_create')
);
insert into phase10h_test.state(key,value)
select 'verification',public.verify_double_shift_bundle(
  (select (value->'bundle'->>'id')::uuid from phase10h_test.state where key='bundle_create')
);

reset role;
commit;

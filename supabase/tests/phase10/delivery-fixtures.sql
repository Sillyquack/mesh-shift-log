-- Disposable Phase 10G delivery fixture. This file is used only by the
-- network-isolated verifier database and creates no production content.
begin;

create schema if not exists phase10g_test;
create table if not exists phase10g_test.state (
  key text primary key,
  value jsonb not null
);
grant usage on schema phase10g_test to authenticated;
grant select, insert, update on table phase10g_test.state to authenticated;

insert into auth.users (id) values
  ('11000000-0000-4000-8000-000000000008'),
  ('11000000-0000-4000-8000-000000000009');
insert into public.user_profiles (
  id, organization_id, display_name, role, active, is_shared_device, shared_device_label
) values
  ('11000000-0000-4000-8000-000000000008', 'a1000000-0000-4000-8000-000000000001', 'Routine A Opening Staff', 'staff', true, false, null),
  ('11000000-0000-4000-8000-000000000009', 'a1000000-0000-4000-8000-000000000001', 'Routine A Nonparticipant Staff', 'staff', true, false, null);

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set local role authenticated;

select public.create_routine_template(
  'delivery-closing-test', 'Delivery Closing test',
  'Disposable declarative delivery source fixture.',
  '1a000000-0000-4000-8000-000000000001'
);
select public.create_routine_template(
  'delivery-opening-test', 'Delivery Opening test',
  'Disposable comparison target fixture.',
  '1a000000-0000-4000-8000-000000000002'
);

select public.upsert_routine_draft_section(
  version.id, null, 'delivery', 'Delivery', 'Immutable delivery evidence.',
  'handover', 0, true, null, version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
where template.routine_key = 'delivery-closing-test' and version.state = 'draft';

select public.upsert_routine_draft_section(
  version.id, null, 'opening', 'Opening', 'Opening initial comparison.',
  'startup', 0, true, null, version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
where template.routine_key = 'delivery-opening-test' and version.state = 'draft';

select public.upsert_routine_draft_task(
  version.id, section.id, null,
  jsonb_build_object(
    'taskKey', 'delivery-source', 'title', 'Deliver source standard',
    'instructions', 'Complete the structured source evidence.',
    'doneCriteria', 'The source standard is documented.',
    'taskType', 'procedure', 'criticality', 'important', 'mandatory', true,
    'initialAssessmentPolicy', 'none', 'completionPolicy', 'standard_required',
    'notApplicablePolicy', 'forbidden', 'verificationPolicy', 'none',
    'repeatPolicy', 'once_per_run', 'availabilityMode', 'immediate',
    'condition', '{}'::jsonb, 'locationDescription', 'Delivery fixture area',
    'sortOrder', 0, 'metadata', '{}'::jsonb
  ), null, version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_sections section on section.version_id = version.id
where template.routine_key = 'delivery-closing-test' and version.state = 'draft';

select public.upsert_routine_draft_task(
  version.id, section.id, null,
  jsonb_build_object(
    'taskKey', 'opening-target', 'title', 'Assess delivered standard',
    'instructions', 'Record the immutable initial assessment.',
    'doneCriteria', 'The initial condition is assessed.',
    'taskType', 'control', 'criticality', 'important', 'mandatory', true,
    'initialAssessmentPolicy', 'ready_on_arrival',
    'completionPolicy', 'control_allows_deviation',
    'notApplicablePolicy', 'forbidden', 'verificationPolicy', 'none',
    'repeatPolicy', 'once_per_run', 'availabilityMode', 'immediate',
    'condition', '{}'::jsonb, 'locationDescription', 'Delivery fixture area',
    'sortOrder', 0, 'metadata', '{}'::jsonb
  ), null, version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_sections section on section.version_id = version.id
where template.routine_key = 'delivery-opening-test' and version.state = 'draft';

select public.upsert_routine_draft_task_item(
  version.id, task.id, null,
  jsonb_build_object(
    'itemKey', 'condition-check', 'label', 'Condition documented',
    'itemType', 'check', 'required', true, 'sourceKind', 'static',
    'sourceConfig', '{}'::jsonb, 'inputSchema', '{"type":"boolean"}'::jsonb,
    'sortOrder', 0, 'active', true, 'metadata', '{}'::jsonb
  ), null, version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_tasks task on task.version_id = version.id
where template.routine_key = 'delivery-closing-test' and version.state = 'draft';

select public.replace_routine_draft_relations(
  version.id,
  jsonb_build_array(jsonb_build_object(
    'sourceTaskId', source_task.id,
    'targetRoutineKey', 'delivery-opening-test',
    'targetTaskKey', 'opening-target',
    'relationType', 'delivery_comparison',
    'metadata', jsonb_build_object(
      'deliveryKey', 'fixture-standard',
      'label', 'Fixture standard ready for Opening',
      'category', 'general', 'comparisonMode', 'ready_on_arrival',
      'required', true, 'allowNotApplicable', false,
      'scopePolicy', 'same_scope',
      'evidenceItemKeys', jsonb_build_array('condition-check'),
      'requireValidTaskVerification', false,
      'requireValidRunVerification', false
    )
  )),
  version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_tasks source_task
  on source_task.version_id = version.id and source_task.task_key = 'delivery-source'
where template.routine_key = 'delivery-closing-test' and version.state = 'draft';

select public.publish_routine_template_versions(
  array_agg(version.id order by template.routine_key),
  jsonb_object_agg(version.id::text, version.revision),
  'Phase 10G disposable delivery publication',
  '1a000000-0000-4000-8000-000000000003'
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
where template.routine_key in ('delivery-closing-test', 'delivery-opening-test')
  and version.state = 'draft';

insert into phase10g_test.state (key, value)
select 'closing_create', public.create_or_get_routine_run(
  'delivery-closing-test', 'fixture-scope', current_date - 2,
  '1a000000-0000-4000-8000-000000000004'
);

reset role;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', false);
set role authenticated;
insert into phase10g_test.state (key, value)
select 'closing_staff_join', public.join_routine_run(
  (select (value->'run'->>'id')::uuid from phase10g_test.state where key = 'closing_create'),
  '1a000000-0000-4000-8000-000000000014'
);
reset role;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set role authenticated;

insert into phase10g_test.state (key, value)
select 'closing_role', public.assign_routine_run_role(
  run.id, participant.id, 'closing_responsible', 'global', null,
  run.revision, '1a000000-0000-4000-8000-000000000005'
)
from public.routine_runs run
join public.routine_run_participants participant on participant.run_id = run.id
where run.id = (select (value->'run'->>'id')::uuid from phase10g_test.state where key = 'closing_create')
  and participant.user_profile_id = '11000000-0000-4000-8000-000000000001';

insert into phase10g_test.state (key, value)
select 'closing_start', public.start_routine_run(
  run.id, run.revision, '1a000000-0000-4000-8000-000000000006'
)
from public.routine_runs run
where run.id = (select (value->'run'->>'id')::uuid from phase10g_test.state where key = 'closing_create');

insert into phase10g_test.state (key, value)
select 'closing_task_start', public.start_routine_task(
  task.id, task.revision, '1a000000-0000-4000-8000-000000000007'
)
from public.routine_run_tasks task
where task.run_id = (select (value->'run'->>'id')::uuid from phase10g_test.state where key = 'closing_create')
  and task.task_key_snapshot = 'delivery-source';

insert into phase10g_test.state (key, value)
select 'closing_item', public.update_routine_task_item(
  item.id, 'completed', '{"checked":true}'::jsonb, 'passed', null,
  item.revision, '1a000000-0000-4000-8000-000000000008'
)
from public.routine_run_task_items item
where item.run_id = (select (value->'run'->>'id')::uuid from phase10g_test.state where key = 'closing_create')
  and item.item_key_snapshot = 'condition-check';

insert into phase10g_test.state (key, value)
select 'closing_task_complete', public.complete_routine_task(
  task.id, 'Delivery fixture completed to standard.', false,
  task.revision, '1a000000-0000-4000-8000-000000000009'
)
from public.routine_run_tasks task
where task.run_id = (select (value->'run'->>'id')::uuid from phase10g_test.state where key = 'closing_create')
  and task.task_key_snapshot = 'delivery-source';

insert into phase10g_test.state (key, value)
select 'closing_finish', public.finish_routine_run(
  run.id, run.revision, '1a000000-0000-4000-8000-000000000010'
)
from public.routine_runs run
where run.id = (select (value->'run'->>'id')::uuid from phase10g_test.state where key = 'closing_create');

insert into phase10g_test.state (key, value)
select 'opening_create', public.create_or_get_routine_run(
  'delivery-opening-test', 'fixture-scope', current_date - 1,
  '1a000000-0000-4000-8000-000000000011'
);

reset role;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000008', false);
set role authenticated;
insert into phase10g_test.state (key, value)
select 'opening_staff_join', public.join_routine_run(
  (select (value->'run'->>'id')::uuid from phase10g_test.state where key = 'opening_create'),
  '1a000000-0000-4000-8000-000000000015'
);
reset role;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set role authenticated;

insert into phase10g_test.state (key, value)
select 'opening_start', public.start_routine_run(
  run.id, run.revision, '1a000000-0000-4000-8000-000000000012'
)
from public.routine_runs run
where run.id = (select (value->'run'->>'id')::uuid from phase10g_test.state where key = 'opening_create');

insert into phase10g_test.state (key, value)
select 'opening_assessment', public.record_routine_initial_assessment(
  task.id, 'ready', null, null, task.revision,
  '1a000000-0000-4000-8000-000000000013'
)
from public.routine_run_tasks task
where task.run_id = (select (value->'run'->>'id')::uuid from phase10g_test.state where key = 'opening_create')
  and task.task_key_snapshot = 'opening-target';

reset role;
commit;

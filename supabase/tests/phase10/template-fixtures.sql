-- Disposable Phase 10B fixtures. Phase 10A identities are installed first.
begin;

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set local role authenticated;

select public.upsert_routine_location(
  'main-floor', 'Main Floor', 'room', null, 0, '{}'::jsonb, null, null
);

select public.upsert_routine_location_set(
  'all-service-points', 'All service points', 'Fixture location set', true, null, null
);

select public.replace_routine_location_set_members(
  (select id from public.routine_location_sets where set_key = 'all-service-points'),
  jsonb_build_array(jsonb_build_object(
    'locationId', (select id from public.routine_locations where location_key = 'main-floor'),
    'sortOrder', 0,
    'required', true,
    'metadata', '{}'::jsonb
  )),
  1
);

select public.create_routine_standard(
  'fixture-temperature', 'Fixture temperature', 'Required publishable standard',
  'decimal', 'C', 'manual', true
);

select public.create_routine_standard_revision(
  (select id from public.routine_standards where standard_key = 'fixture-temperature'),
  '{"value":4}'::jsonb, null, 'Initial fixture value',
  '31000000-0000-4000-8000-000000000001', 1
);

select public.create_routine_template(
  'opening', 'Opening', 'Opening fixture template',
  '32000000-0000-4000-8000-000000000001'
);
select public.create_routine_template(
  'closing', 'Closing', 'Closing fixture template',
  '32000000-0000-4000-8000-000000000002'
);

select public.upsert_routine_draft_section(
  (select version.id from public.routine_template_versions version
   join public.routine_templates template on template.id = version.template_id
   where template.routine_key = 'opening' and version.state = 'draft'),
  null, 'startup', 'Startup', null, 'startup', 0, true, null, 1
);
select public.upsert_routine_draft_section(
  (select version.id from public.routine_template_versions version
   join public.routine_templates template on template.id = version.template_id
   where template.routine_key = 'closing' and version.state = 'draft'),
  null, 'final-close', 'Final close', null, 'final_close', 0, true, null, 1
);

select public.upsert_routine_draft_task(
  version.id, section.id, null,
  jsonb_build_object(
    'taskKey', 'O01', 'title', 'Open main floor', 'doneCriteria', 'Main floor is ready',
    'taskType', 'action', 'criticality', 'important', 'mandatory', true,
    'locationId', (select id from public.routine_locations where location_key = 'main-floor'),
    'sortOrder', 0, 'condition', '{}'::jsonb, 'metadata', '{}'::jsonb
  ), null, version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_sections section on section.version_id = version.id
where template.routine_key = 'opening' and version.state = 'draft';

select public.upsert_routine_draft_task(
  version.id, section.id, null,
  jsonb_build_object(
    'taskKey', 'C01', 'title', 'Close main floor', 'doneCriteria', 'Main floor is secured',
    'taskType', 'verification', 'criticality', 'critical', 'mandatory', true,
    'notApplicablePolicy', 'forbidden', 'verificationPolicy', 'closing_responsible',
    'locationDescription', 'Main floor', 'sortOrder', 0,
    'condition', jsonb_build_object('fact', 'weekday', 'operator', 'in', 'value', jsonb_build_array('mon','tue','wed','thu','fri','sat','sun')),
    'metadata', '{}'::jsonb
  ), null, version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_sections section on section.version_id = version.id
where template.routine_key = 'closing' and version.state = 'draft';

select public.upsert_routine_draft_task_item(
  version.id, task.id, null,
  jsonb_build_object(
    'itemKey', 'temperature', 'label', 'Temperature', 'itemType', 'measurement',
    'required', true, 'sourceKind', 'routine_standard',
    'standardId', (select id from public.routine_standards where standard_key = 'fixture-temperature'),
    'sourceConfig', '{}'::jsonb, 'inputSchema', '{"type":"number"}'::jsonb,
    'sortOrder', 0, 'metadata', '{}'::jsonb
  ), null, version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_tasks task on task.version_id = version.id
where template.routine_key = 'opening' and version.state = 'draft';

select public.replace_routine_draft_relations(
  version.id,
  jsonb_build_array(jsonb_build_object(
    'sourceTaskId', task.id, 'targetRoutineKey', 'closing', 'targetTaskKey', 'C01',
    'relationType', 'shared_context', 'metadata', '{}'::jsonb
  )),
  version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_tasks task on task.version_id = version.id
where template.routine_key = 'opening' and version.state = 'draft';

select public.replace_routine_draft_relations(
  version.id,
  jsonb_build_array(jsonb_build_object(
    'sourceTaskId', task.id, 'targetRoutineKey', 'opening', 'targetTaskKey', 'O01',
    'relationType', 'independent_verification', 'metadata', '{}'::jsonb
  )),
  version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_tasks task on task.version_id = version.id
where template.routine_key = 'closing' and version.state = 'draft';

reset role;
commit;

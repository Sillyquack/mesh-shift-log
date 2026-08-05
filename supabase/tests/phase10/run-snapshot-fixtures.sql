-- Disposable Phase 10D fixtures. The Phase 10A identity fixture is installed
-- first. All rows below exist only in the network-isolated test database.
begin;

create schema if not exists phase10d_fixture;
create table if not exists phase10d_fixture.state (
  key text primary key,
  value jsonb not null
);
grant usage on schema phase10d_fixture to authenticated;
grant select, insert, update on table phase10d_fixture.state to authenticated;

-- Read-only source rows are prepared before snapshotting. Phase 10D never
-- writes these domains; the fixture owner does so only to provide source data.
insert into public.inventory_products (
  id, organization_id, name, short_name, unit_label, active, sort_order
) values
  ('d1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'Sparkling water', 'Water', 'bottle', true, 0),
  ('d1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001',
   'Coffee beans', 'Coffee', 'kg', true, 1);
insert into public.inventory_locations (
  id, organization_id, name, code, location_type, active, sort_order
) values
  ('d2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'Main bar', 'MAIN', 'bar', true, 0),
  ('d2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001',
   'Back storage', 'STORE', 'storage', true, 1);
insert into public.inventory_location_products (
  id, organization_id, location_id, product_id, par_quantity, count_order,
  active, stock_policy
) values
  ('d3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'd2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
   24, 0, true, 'exact_par'),
  ('d3000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001',
   'd2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002',
   6, 0, true, 'minimum_only');

insert into public.asset_registry (
  id, organization_id, asset_type, provider, model, serial_number,
  expected_venue, expected_station, active, condition,
  default_required_for_closing, local_id
) values
  ('d4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'tablet', 'Mesh Devices', 'FrontPad', 'SERIAL-001',
   'Youngstorget', 'Main bar', true, 'ok', true, 'asset-main-tablet'),
  ('d4000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001',
   'radio', 'Mesh Devices', 'Radio X', 'SERIAL-002',
   'Youngstorget', 'Office', false, 'repair', true, 'asset-inactive-radio');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set local role authenticated;

select public.create_or_update_routine_organization_settings(
  'legacy', 'Europe/Oslo', '04:00'::time, false, 24, null
);
select public.upsert_routine_location(
  'run-main', 'Run main station', 'station', null, 0, '{}'::jsonb, null, null
);
select public.upsert_routine_location(
  'run-store', 'Run storage', 'storage', null, 1, '{}'::jsonb, null, null
);
select public.upsert_routine_location_set(
  'run-locations', 'Run locations', 'Phase 10D expansion fixture', true, null, null
);
select public.replace_routine_location_set_members(
  (select id from public.routine_location_sets where set_key = 'run-locations'),
  jsonb_build_array(
    jsonb_build_object(
      'locationId', (select id from public.routine_locations where location_key = 'run-main'),
      'sortOrder', 0, 'required', true, 'metadata', '{"zone":"front"}'::jsonb
    ),
    jsonb_build_object(
      'locationId', (select id from public.routine_locations where location_key = 'run-store'),
      'sortOrder', 1, 'required', false, 'metadata', '{"zone":"back"}'::jsonb
    )
  ),
  1
);
select public.create_routine_standard(
  'run-temperature', 'Run temperature', 'Concrete standard snapshot',
  'decimal', 'C', 'manual', true
);
select public.create_routine_standard_revision(
  (select id from public.routine_standards where standard_key = 'run-temperature'),
  '{"value":4}'::jsonb, null, 'Phase 10D fixture revision',
  'd5000000-0000-4000-8000-000000000001', 1
);

select public.create_routine_template(
  'daily-run-test', 'Daily run test', 'Phase 10D authoritative snapshot fixture',
  'd6000000-0000-4000-8000-000000000001'
);
select public.upsert_routine_draft_section(
  version.id, null, 'prepare', 'Prepare', 'Snapshot fixture section',
  'startup', 0, true, null, version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
where template.routine_key = 'daily-run-test' and version.state = 'draft';

select public.upsert_routine_draft_task(
  version.id, section.id, null,
  jsonb_build_object(
    'taskKey', 'task-alpha', 'title', 'Prepare sources',
    'instructions', 'Use immutable source snapshots.',
    'doneCriteria', 'Every source is reviewed.', 'taskType', 'procedure',
    'criticality', 'important', 'mandatory', true,
    'locationId', (select id from public.routine_locations where location_key = 'run-main'),
    'sortOrder', 0, 'condition', '{}'::jsonb,
    'metadata', '{"fixture":"alpha"}'::jsonb
  ), null, version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_sections section on section.version_id = version.id
where template.routine_key = 'daily-run-test' and version.state = 'draft';

select public.upsert_routine_draft_task(
  version.id, section.id, null,
  jsonb_build_object(
    'taskKey', 'task-beta', 'title', 'Conditional review',
    'doneCriteria', 'Conditional review is resolved.', 'taskType', 'control',
    'criticality', 'normal', 'mandatory', true,
    'locationDescription', 'Whole venue', 'sortOrder', 1,
    'condition', jsonb_build_object(
      'fact', 'weekday', 'operator', 'in',
      'value', jsonb_build_array('mon','tue','wed','thu','fri','sat','sun')
    ),
    'metadata', '{"fixture":"beta"}'::jsonb
  ), null, version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_sections section on section.version_id = version.id
where template.routine_key = 'daily-run-test' and version.state = 'draft';

-- Six source kinds on the same task exercise every Phase 10D expansion path.
select public.upsert_routine_draft_task_item(
  version.id, task.id, null,
  jsonb_build_object(
    'itemKey', 'static-check', 'label', 'Static check', 'itemType', 'check',
    'required', true, 'sourceKind', 'static', 'sourceConfig', '{}'::jsonb,
    'inputSchema', '{"type":"boolean"}'::jsonb, 'sortOrder', 0,
    'metadata', '{}'::jsonb
  ), null, version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_tasks task on task.version_id = version.id and task.task_key = 'task-alpha'
where template.routine_key = 'daily-run-test' and version.state = 'draft';

select public.upsert_routine_draft_task_item(
  version.id, task.id, null,
  jsonb_build_object(
    'itemKey', 'location-check', 'label', 'Location check', 'itemType', 'location',
    'required', true, 'sourceKind', 'location_set',
    'sourceLocationSetId', (select id from public.routine_location_sets where set_key = 'run-locations'),
    'sourceConfig', '{}'::jsonb, 'inputSchema', '{}'::jsonb,
    'sortOrder', 1, 'metadata', '{}'::jsonb
  ), null, version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_tasks task on task.version_id = version.id and task.task_key = 'task-alpha'
where template.routine_key = 'daily-run-test' and version.state = 'draft';

select public.upsert_routine_draft_task_item(
  version.id, task.id, null,
  jsonb_build_object(
    'itemKey', 'standard-check', 'label', 'Standard check', 'itemType', 'measurement',
    'required', true, 'sourceKind', 'routine_standard',
    'standardId', (select id from public.routine_standards where standard_key = 'run-temperature'),
    'sourceConfig', '{}'::jsonb, 'inputSchema', '{"type":"number"}'::jsonb,
    'sortOrder', 2, 'metadata', '{}'::jsonb
  ), null, version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_tasks task on task.version_id = version.id and task.task_key = 'task-alpha'
where template.routine_key = 'daily-run-test' and version.state = 'draft';

select public.upsert_routine_draft_task_item(
  version.id, task.id, null,
  jsonb_build_object(
    'itemKey', 'inventory-check', 'label', 'Inventory check', 'itemType', 'product',
    'required', true, 'sourceKind', 'inventory_readonly',
    'sourceConfig', '{"mode":"location_standards","locationCodes":["MAIN","STORE"],"activeOnly":true}'::jsonb,
    'inputSchema', '{}'::jsonb, 'sortOrder', 3, 'metadata', '{}'::jsonb
  ), null, version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_tasks task on task.version_id = version.id and task.task_key = 'task-alpha'
where template.routine_key = 'daily-run-test' and version.state = 'draft';

select public.upsert_routine_draft_task_item(
  version.id, task.id, null,
  jsonb_build_object(
    'itemKey', 'asset-check', 'label', 'Asset check', 'itemType', 'asset',
    'required', true, 'sourceKind', 'asset_registry_readonly',
    'sourceConfig', '{"mode":"active_assets","venue":"Youngstorget","requiredForClosing":true,"assetTypes":["tablet"]}'::jsonb,
    'inputSchema', '{}'::jsonb, 'sortOrder', 4, 'metadata', '{}'::jsonb
  ), null, version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_tasks task on task.version_id = version.id and task.task_key = 'task-alpha'
where template.routine_key = 'daily-run-test' and version.state = 'draft';

select public.upsert_routine_draft_task_item(
  version.id, task.id, null,
  jsonb_build_object(
    'itemKey', 'event-check', 'label', 'Event context', 'itemType', 'status',
    'required', false, 'sourceKind', 'event_context',
    'sourceConfig', '{"mode":"venue_context","venue":"Youngstorget"}'::jsonb,
    'inputSchema', '{}'::jsonb, 'sortOrder', 5, 'metadata', '{}'::jsonb
  ), null, version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_tasks task on task.version_id = version.id and task.task_key = 'task-alpha'
where template.routine_key = 'daily-run-test' and version.state = 'draft';

select public.replace_routine_draft_dependencies(
  version.id,
  jsonb_build_array(jsonb_build_object(
    'predecessorTaskId', predecessor.id, 'successorTaskId', successor.id,
    'dependencyType', 'must_complete', 'metadata', '{}'::jsonb
  )),
  version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_tasks predecessor on predecessor.version_id = version.id and predecessor.task_key = 'task-alpha'
join public.routine_template_tasks successor on successor.version_id = version.id and successor.task_key = 'task-beta'
where template.routine_key = 'daily-run-test' and version.state = 'draft';

select public.replace_routine_draft_relations(
  version.id,
  jsonb_build_array(jsonb_build_object(
    'sourceTaskId', source_task.id, 'targetRoutineKey', 'daily-run-test',
    'targetTaskKey', 'task-alpha', 'relationType', 'shared_context',
    'metadata', '{"fixture":true}'::jsonb
  )),
  version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_tasks source_task on source_task.version_id = version.id and source_task.task_key = 'task-beta'
where template.routine_key = 'daily-run-test' and version.state = 'draft';

select public.create_routine_reference(
  'run-placeholder', 'Run placeholder', null, 'Referanse kommer',
  'd7000000-0000-4000-8000-000000000001'
);
select public.create_routine_reference(
  'run-active-image', 'Run active image', 'Historical image fixture', null,
  'd7000000-0000-4000-8000-000000000002'
);
insert into phase10d_fixture.state (key, value)
select 'image_prepare', public.prepare_routine_reference_upload(
  reference.id, 'run-image.jpg', 'image/jpeg', 12,
  'Run image caption', 'Run image alternative text', reference.revision,
  'd7000000-0000-4000-8000-000000000003'
)
from public.routine_reference_images reference
where reference.reference_key = 'run-active-image';
insert into storage.objects (bucket_id, name, metadata)
select 'routine-reference-images', value->>'objectPath',
  '{"size":12,"mimetype":"image/jpeg"}'::jsonb
from phase10d_fixture.state where key = 'image_prepare';
insert into phase10d_fixture.state (key, value)
select 'image_finalize', public.finalize_routine_reference_upload(
  (value->>'versionId')::uuid,
  (value->>'referenceRevision')::bigint,
  (value->>'versionRevision')::bigint,
  'd7000000-0000-4000-8000-000000000004'
)
from phase10d_fixture.state where key = 'image_prepare';

select public.replace_routine_draft_task_reference_images(
  task.id,
  jsonb_build_array(
    jsonb_build_object(
      'referenceId', placeholder.id, 'buttonLabel', 'Vis placeholder',
      'contextNote', 'Task-level placeholder', 'sortOrder', 0, 'active', true
    ),
    jsonb_build_object(
      'taskItemId', static_item.id, 'referenceId', active_image.id,
      'buttonLabel', 'Vis originalt bilde', 'contextNote', 'Item-specific image',
      'sortOrder', 1, 'active', true
    )
  ),
  version.revision,
  'd7000000-0000-4000-8000-000000000005'
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_tasks task on task.version_id = version.id and task.task_key = 'task-alpha'
join public.routine_template_task_items static_item on static_item.task_id = task.id and static_item.item_key = 'static-check'
join public.routine_reference_images placeholder
  on placeholder.organization_id = version.organization_id and placeholder.reference_key = 'run-placeholder'
join public.routine_reference_images active_image
  on active_image.organization_id = version.organization_id and active_image.reference_key = 'run-active-image'
where template.routine_key = 'daily-run-test' and version.state = 'draft';

select public.publish_routine_template_versions(
  array[version.id], jsonb_build_object(version.id::text, version.revision),
  'Phase 10D fixture publication', 'd8000000-0000-4000-8000-000000000001'
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
where template.routine_key = 'daily-run-test' and version.state = 'draft';

reset role;
commit;

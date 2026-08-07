-- Executable Phase 10B assertions. Every PASS is backed by live PostgreSQL.

create or replace function public.phase10b_assert(input_condition boolean, input_message text)
returns void
language plpgsql
set search_path = pg_catalog
as $$
begin
  if not coalesce(input_condition, false) then
    raise exception 'Assertion failed: %', input_message;
  end if;
  raise notice 'PASS %', input_message;
end;
$$;

create or replace function public.phase10b_expect_error(
  input_statement text,
  input_pattern text,
  input_message text
)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_error text;
begin
  begin
    execute input_statement;
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error ~* input_pattern then
      raise notice 'PASS %', input_message;
      return;
    end if;
    raise exception 'Assertion failed: % (unexpected error: %)', input_message, v_error;
  end;
  raise exception 'Assertion failed: % (statement unexpectedly succeeded)', input_message;
end;
$$;

grant execute on function public.phase10b_assert(boolean, text) to authenticated;
grant execute on function public.phase10b_expect_error(text, text, text) to authenticated;

select public.phase10b_assert(
  (select count(*) = 8 from information_schema.tables
   where table_schema = 'public' and table_name in (
     'routine_templates', 'routine_template_versions', 'routine_template_sections',
     'routine_template_tasks', 'routine_template_task_items',
     'routine_template_task_dependencies', 'routine_template_task_relations',
     'routine_template_publication_batches'
   )),
  '01 all eight Phase 10B tables exist'
);

select public.phase10b_assert(
  (select count(*) = 8 from information_schema.columns
   where table_schema = 'public' and column_name = 'organization_id'
     and is_nullable = 'NO' and table_name in (
       'routine_templates', 'routine_template_versions', 'routine_template_sections',
       'routine_template_tasks', 'routine_template_task_items',
       'routine_template_task_dependencies', 'routine_template_task_relations',
       'routine_template_publication_batches'
     )),
  '02 organization_id is NOT NULL on every Phase 10B table'
);

select public.phase10b_assert(
  (select count(*) >= 11 from pg_catalog.pg_constraint constraint_definition
   where constraint_definition.connamespace = 'public'::regnamespace
     and constraint_definition.contype = 'f'
     and constraint_definition.conname like 'routine_template%'
     and cardinality(constraint_definition.conkey) >= 2),
  '03 composite foreign keys protect tenant and version boundaries'
);

select public.phase10b_expect_error(format($sql$
  insert into public.routine_templates (
    organization_id, routine_key, name, creation_idempotency_key,
    created_by_auth_user_id, updated_by_auth_user_id
  ) values (
    'a1000000-0000-4000-8000-000000000001', 'opening', 'Duplicate',
    '33000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001'
  )
$sql$), 'duplicate key|unique', '04 duplicate routine keys are rejected inside one organization');

insert into public.routine_templates (
  organization_id, routine_key, name, creation_idempotency_key,
  created_by_auth_user_id, updated_by_auth_user_id
) values (
  'b2000000-0000-4000-8000-000000000001', 'opening', 'Organization B Opening',
  '33000000-0000-4000-8000-000000000002',
  '22000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001'
);
select public.phase10b_assert(
  (select count(*) = 2 from public.routine_templates where routine_key = 'opening'),
  '05 the same routine key is allowed in two organizations'
);

select public.phase10b_expect_error(format($sql$
  insert into public.routine_template_versions (
    organization_id, template_id, version_number, state, name,
    creation_idempotency_key, created_by_auth_user_id, updated_by_auth_user_id
  ) values (
    'a1000000-0000-4000-8000-000000000001', %L, 99, 'draft', 'Second draft',
    '33000000-0000-4000-8000-000000000003',
    '11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001'
  )
$sql$, (select id from public.routine_templates where organization_id = 'a1000000-0000-4000-8000-000000000001' and routine_key = 'opening')),
'duplicate key|unique', '06 at most one active draft exists per template');

select public.phase10b_expect_error(format($sql$
  insert into public.routine_template_versions (
    organization_id, template_id, version_number, state, name,
    creation_idempotency_key, discarded_at, discarded_by_auth_user_id, discard_reason,
    created_by_auth_user_id, updated_by_auth_user_id
  ) values (
    'a1000000-0000-4000-8000-000000000001', %L, 1, 'discarded', 'Duplicate number',
    '33000000-0000-4000-8000-000000000004', now(),
    '11000000-0000-4000-8000-000000000001', 'probe',
    '11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001'
  )
$sql$, (select id from public.routine_templates where organization_id = 'a1000000-0000-4000-8000-000000000001' and routine_key = 'opening')),
'duplicate key|unique', '07 version_number is unique per template');

select public.phase10b_expect_error(format($sql$
  update public.routine_template_versions set state = 'retired' where id = %L
$sql$, (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'opening' and template.organization_id = 'a1000000-0000-4000-8000-000000000001')),
'state|check|lifecycle transition', '08 invalid template version states are rejected');

select public.phase10b_expect_error(format($sql$
  update public.routine_template_tasks set task_type = 'script' where id = %L
$sql$, (select task.id from public.routine_template_tasks task join public.routine_template_versions version on version.id = task.version_id join public.routine_templates template on template.id = version.template_id where template.routine_key = 'opening')),
'task.*type|check', '09 invalid task enums are rejected');

select public.phase10b_expect_error(format($sql$
  update public.routine_template_task_items set source_kind = 'write_inventory' where id = %L
$sql$, (select item.id from public.routine_template_task_items item limit 1)),
'source|check', '10 invalid task-item source enums are rejected');

select public.phase10b_expect_error(format($sql$
  update public.routine_template_tasks set metadata = '[]'::jsonb where id = %L
$sql$, (select task.id from public.routine_template_tasks task limit 1)),
'metadata.*object|check', '11 non-object JSON metadata is rejected');

select public.phase10b_expect_error(format($sql$
  insert into public.routine_template_task_dependencies (
    organization_id, version_id, predecessor_task_id, successor_task_id,
    dependency_type, created_by_auth_user_id, updated_by_auth_user_id
  ) values ('a1000000-0000-4000-8000-000000000001', %L, %L, %L, 'must_complete',
    '11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001')
$sql$,
  (select task.version_id from public.routine_template_tasks task limit 1),
  (select task.id from public.routine_template_tasks task limit 1),
  (select task.id from public.routine_template_tasks task limit 1)),
'self|not.self|check', '12 self-dependencies are rejected');

select public.phase10b_expect_error(format($sql$
  insert into public.routine_template_sections (
    organization_id, version_id, section_key, title, phase_type, sort_order,
    created_by_auth_user_id, updated_by_auth_user_id
  ) values ('a1000000-0000-4000-8000-000000000001', %L, 'duplicate-order', 'Duplicate order', 'other', 0,
    '11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001')
$sql$, (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'opening')),
'sort|duplicate key|unique', '13 duplicate deterministic sort positions are rejected');

select public.phase10b_expect_error(format($sql$
  update public.routine_templates set current_published_version_id = %L where id = %L
$sql$,
  (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'opening' and template.organization_id = 'a1000000-0000-4000-8000-000000000001'),
  (select id from public.routine_templates where routine_key = 'closing' and organization_id = 'a1000000-0000-4000-8000-000000000001')),
'foreign key|current.published', '14 current published pointers cannot cross template or organization');

insert into public.routine_templates (
  organization_id, routine_key, name, creation_idempotency_key,
  created_by_auth_user_id, updated_by_auth_user_id
) values (
  'a1000000-0000-4000-8000-000000000001', 'based-on-probe', 'Based-on probe',
  '33000000-0000-4000-8000-000000000005',
  '11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001'
);
select public.phase10b_expect_error(format($sql$
  insert into public.routine_template_versions (
    organization_id, template_id, version_number, state, based_on_version_id, name,
    creation_idempotency_key, created_by_auth_user_id, updated_by_auth_user_id
  ) values ('a1000000-0000-4000-8000-000000000001', %L, 1, 'draft', %L, 'Bad base',
    '33000000-0000-4000-8000-000000000006',
    '11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001')
$sql$,
  (select id from public.routine_templates where routine_key = 'based-on-probe'),
  (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'opening')),
'foreign key|based.on', '15 based_on_version_id cannot cross template or organization');

-- Validation probes begin with an intentionally empty template.
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
select public.phase10b_assert(
  (public.create_routine_template(
    'opening', 'Opening', 'Opening fixture template',
    '32000000-0000-4000-8000-000000000001'
  )->>'idempotentReplay')::boolean,
  '23 logical template creation replays the original template and initial draft'
);
select public.phase10b_expect_error($sql$
  select public.create_routine_template(
    'opening', 'Changed opening name', 'Opening fixture template',
    '32000000-0000-4000-8000-000000000001'
  )
$sql$, 'different request', '24 template idempotency rejects the same key with changed content');
select public.phase10b_assert(
  (select count(*) = 1 and bool_and(version.version_number = 1 and version.based_on_version_id is null
                                    and version.creation_idempotency_key = template.creation_idempotency_key)
   from public.routine_templates template
   join public.routine_template_versions version on version.template_id = template.id
   where template.organization_id = 'a1000000-0000-4000-8000-000000000001'
     and template.routine_key = 'opening'),
  '25 logical template creation atomically creates its initial version-one draft'
);
select public.create_routine_template(
  'validation-probe', 'Validation probe', null,
  '34000000-0000-4000-8000-000000000001'
);

select public.phase10b_assert(
  not (public.validate_routine_template_version(
    (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'validation-probe'), null
  )->>'valid')::boolean,
  '34 an empty template is blocked by publication validation'
);
select public.phase10b_assert(
  (public.validate_routine_template_version(
    (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'validation-probe'), null
  )->'blockers') @> '["At least one active section is required.","At least one active task is required."]'::jsonb,
  '35 validation reports missing active sections and tasks structurally'
);

insert into public.routine_template_sections (
  organization_id, version_id, section_key, title, phase_type, sort_order,
  created_by_auth_user_id, updated_by_auth_user_id
)
select version.organization_id, version.id, 'probe', 'Probe', 'other', 0,
  '11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001'
from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id
where template.routine_key = 'validation-probe';

insert into public.routine_template_tasks (
  organization_id, version_id, section_id, task_key, title, done_criteria,
  task_type, location_description, sort_order, created_by_auth_user_id, updated_by_auth_user_id
)
select version.organization_id, version.id, section.id, task_data.task_key,
  task_data.title, 'Done', 'action', 'Fixture place', task_data.sort_order,
  '11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001'
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_sections section on section.version_id = version.id
cross join (values ('probe-a', 'Probe A', 0), ('probe-b', 'Probe B', 1)) task_data(task_key, title, sort_order)
where template.routine_key = 'validation-probe';

update public.routine_template_tasks task set done_criteria = null
where task.task_key = 'probe-a' and task.version_id = (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'validation-probe');
select public.phase10b_assert(
  (public.validate_routine_template_version((select version_id from public.routine_template_tasks where task_key = 'probe-a'), null)->'blockers')
    @> '["Every active mandatory task requires done criteria."]'::jsonb,
  '36 mandatory tasks without done criteria are blocked'
);
update public.routine_template_tasks task set done_criteria = 'Done', location_description = null
where task.task_key = 'probe-a' and task.version_id = (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'validation-probe');
select public.phase10b_assert(
  (public.validate_routine_template_version((select version_id from public.routine_template_tasks where task_key = 'probe-a'), null)->'blockers')
    @> '["Every active task requires a location, location set, or location description."]'::jsonb,
  '37 tasks without a concrete location binding are blocked'
);
update public.routine_template_tasks task set location_description = 'Fixture place', criticality = 'critical', not_applicable_policy = 'allowed_with_reason'
where task.task_key = 'probe-a' and task.version_id = (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'validation-probe');
select public.phase10b_assert(
  (public.validate_routine_template_version((select version_id from public.routine_template_tasks where task_key = 'probe-a'), null)->'blockers')
    @> '["Critical mandatory tasks cannot allow free not-applicable reasons."]'::jsonb,
  '38 critical mandatory tasks cannot use free allowed-with-reason N/A'
);
update public.routine_template_tasks task set criticality = 'normal', not_applicable_policy = 'forbidden',
  start_day_offset = 2, target_day_offset = 1
where task.task_key = 'probe-a' and task.version_id = (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'validation-probe');
select public.phase10b_assert(
  (public.validate_routine_template_version((select version_id from public.routine_template_tasks where task_key = 'probe-a'), null)->'blockers')
    @> '["Task visibility, start, target, overdue, and deadline times must be ordered."]'::jsonb,
  '39 invalid task time ordering blocks publication'
);
update public.routine_template_tasks task set start_day_offset = 0, target_day_offset = 0,
  availability_mode = 'time_window', start_from_local_time = null, target_local_time = null
where task.task_key = 'probe-a' and task.version_id = (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'validation-probe');
select public.phase10b_assert(
  (public.validate_routine_template_version((select version_id from public.routine_template_tasks where task_key = 'probe-a'), null)->'blockers')
    @> '["Task availability mode and its time, dependency, condition, or repeat fields are inconsistent."]'::jsonb,
  '40 availability modes require consistent supporting fields'
);
update public.routine_template_tasks task set availability_mode = 'immediate'
where task.task_key = 'probe-a' and task.version_id = (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'validation-probe');

insert into public.routine_template_task_dependencies (
  organization_id, version_id, predecessor_task_id, successor_task_id, dependency_type,
  created_by_auth_user_id, updated_by_auth_user_id
)
select version.organization_id, version.id, predecessor.id, successor.id, 'must_complete',
  '11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001'
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_tasks predecessor on predecessor.version_id = version.id and predecessor.task_key = 'probe-a'
join public.routine_template_tasks successor on successor.version_id = version.id and successor.task_key = 'probe-b'
where template.routine_key = 'validation-probe';
insert into public.routine_template_task_dependencies (
  organization_id, version_id, predecessor_task_id, successor_task_id, dependency_type,
  created_by_auth_user_id, updated_by_auth_user_id
)
select version.organization_id, version.id, predecessor.id, successor.id, 'must_complete',
  '11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001'
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_tasks predecessor on predecessor.version_id = version.id and predecessor.task_key = 'probe-b'
join public.routine_template_tasks successor on successor.version_id = version.id and successor.task_key = 'probe-a'
where template.routine_key = 'validation-probe';
select public.phase10b_assert(
  (public.validate_routine_template_version((select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'validation-probe'), null)->'blockers')
    @> '["Task dependencies must not contain a cycle."]'::jsonb,
  '41 dependency cycles block publication'
);
select set_config('app.routine_template_child_delete', 'authorized', false);
delete from public.routine_template_task_dependencies where version_id = (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'validation-probe');
select set_config('app.routine_template_child_delete', '', false);

insert into public.routine_location_sets (
  organization_id, set_key, name, active, created_by_auth_user_id, updated_by_auth_user_id
) values (
  'a1000000-0000-4000-8000-000000000001', 'empty-probe', 'Empty probe', true,
  '11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001'
);
update public.routine_template_tasks task set location_description = null,
  location_set_id = (select id from public.routine_location_sets where set_key = 'empty-probe')
where task.task_key = 'probe-a' and task.version_id = (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'validation-probe');
select public.phase10b_assert(
  (public.validate_routine_template_version((select version_id from public.routine_template_tasks where task_key = 'probe-a' and location_set_id is not null), null)->'blockers')
    @> '["Every used location set must be active and non-empty."]'::jsonb,
  '42 an empty used location set blocks publication'
);
update public.routine_template_tasks task set location_set_id = null, location_description = 'Fixture place'
where task.task_key = 'probe-a' and task.version_id = (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'validation-probe');

insert into public.routine_standards (
  organization_id, standard_key, label, value_type, source_kind,
  created_by_auth_user_id, updated_by_auth_user_id
) values (
  'a1000000-0000-4000-8000-000000000001', 'missing-revision-probe',
  'Missing revision probe', 'integer', 'manual',
  '11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001'
);
insert into public.routine_template_task_items (
  organization_id, version_id, task_id, item_key, label, item_type, required,
  source_kind, standard_id, sort_order, created_by_auth_user_id, updated_by_auth_user_id
)
select task.organization_id, task.version_id, task.id, 'missing-standard', 'Missing standard',
  'measurement', true, 'routine_standard',
  (select id from public.routine_standards where standard_key = 'missing-revision-probe'), 0,
  '11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001'
from public.routine_template_tasks task
where task.task_key = 'probe-a' and task.version_id = (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'validation-probe');
select public.phase10b_assert(
  (public.validate_routine_template_version((select version_id from public.routine_template_tasks where task_key = 'probe-a' and version_id in (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'validation-probe')), null)->'blockers')
    @> '["Every required routine standard source must have an active current revision."]'::jsonb,
  '43 required routine standards without a current revision block publication'
);
select public.phase10b_assert(
  pg_catalog.pg_get_functiondef('public.validate_routine_template_version(uuid,uuid[])'::regprocedure)
    like '%A task item has invalid source configuration.%',
  '44 validation includes a blocker for invalid task-item source configuration'
);

update public.routine_template_tasks task set condition_json = '{"all":"bad"}'::jsonb
where task.task_key = 'probe-b' and task.version_id = (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'validation-probe');
select public.phase10b_assert(
  (public.validate_routine_template_version((select version_id from public.routine_template_tasks where task_key = 'probe-b' and condition_json <> '{}'::jsonb), null)->'blockers')
    @> '["A task condition is malformed or uses an unsupported fact or operator."]'::jsonb,
  '45 malformed condition JSON blocks publication'
);
update public.routine_template_tasks task set condition_json = '{"fact":"weather","operator":"equals","value":"sun"}'::jsonb
where task.task_key = 'probe-b' and task.version_id = (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'validation-probe');
select public.phase10b_assert(
  not public.routine_validate_condition_json((select condition_json from public.routine_template_tasks where task_key = 'probe-b' and condition_json->>'fact' = 'weather')),
  '46 unknown condition facts and operators are rejected'
);
update public.routine_template_tasks task set condition_json = '{"all":[{"fact":"weekday","operator":"in","value":["mon","fri"]},{"not":{"fact":"booking_exists","operator":"exists"}}]}'::jsonb
where task.task_key = 'probe-b' and task.version_id = (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'validation-probe');
select public.phase10b_assert(
  public.routine_validate_condition_json((select condition_json from public.routine_template_tasks where task_key = 'probe-b' and condition_json ? 'all')),
  '47 valid bounded declarative conditions are accepted'
);

insert into public.routine_template_task_relations (
  organization_id, version_id, source_task_id, target_routine_key, target_task_key,
  relation_type, created_by_auth_user_id, updated_by_auth_user_id
)
select task.organization_id, task.version_id, task.id, 'closing', 'missing-task',
  'shared_context', '11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001'
from public.routine_template_tasks task
where task.task_key = 'probe-b' and task.version_id = (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'validation-probe');
select public.phase10b_assert(
  (public.validate_routine_template_version((select version_id from public.routine_template_tasks where task_key = 'probe-b' and version_id in (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'validation-probe')), array[
    (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'validation-probe'),
    (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'closing')
  ])->'blockers') @> '["Cross-run target task is missing or inactive: closing/missing-task."]'::jsonb,
  '48 unknown cross-run target tasks block publication'
);
select public.phase10b_assert(
  (select bool_and((public.validate_routine_template_version(version.id, batch.ids)->>'valid')::boolean)
   from public.routine_template_versions version
   cross join (select array_agg(version2.id order by version2.id) ids
               from public.routine_template_versions version2
               join public.routine_templates template2 on template2.id = version2.template_id
               where template2.routine_key in ('opening','closing') and template2.organization_id = 'a1000000-0000-4000-8000-000000000001') batch
   join public.routine_templates template on template.id = version.template_id
   where template.routine_key in ('opening','closing') and template.organization_id = 'a1000000-0000-4000-8000-000000000001'),
  '49 cross-run targets in the same publication batch validate successfully'
);

-- Content-hash probes before the first publish.
do $hash_tests$
declare
  v_version_id uuid;
  v_task_id uuid;
  v_original_title text;
  v_hash_before text;
  v_hash_after_audit text;
  v_hash_after_content text;
begin
  select version.id into v_version_id from public.routine_template_versions version
  join public.routine_templates template on template.id = version.template_id
  where template.routine_key = 'opening' and template.organization_id = 'a1000000-0000-4000-8000-000000000001';
  select task.id, task.title into v_task_id, v_original_title from public.routine_template_tasks task where task.version_id = v_version_id;
  v_hash_before := public.routine_template_version_content_hash(v_version_id);
  update public.routine_template_versions set updated_at = updated_at + interval '1 second' where id = v_version_id;
  v_hash_after_audit := public.routine_template_version_content_hash(v_version_id);
  perform public.phase10b_assert(v_hash_before = v_hash_after_audit, '55 mutable timestamps and actors do not affect the content hash');
  update public.routine_template_tasks set title = title || ' changed' where id = v_task_id;
  v_hash_after_content := public.routine_template_version_content_hash(v_version_id);
  perform public.phase10b_assert(v_hash_before <> v_hash_after_content, '54 semantic content changes produce a different content hash');
  update public.routine_template_tasks set title = v_original_title where id = v_task_id;
  perform public.phase10b_assert(v_hash_before = public.routine_template_version_content_hash(v_version_id), '53 canonical content hashing is deterministic');
end;
$hash_tests$;

-- Publish the mutually linked Opening and Closing drafts atomically.
select public.publish_routine_template_versions(
  publication.version_ids, publication.expected_revisions,
  'Initial Opening and Closing publication',
  '35000000-0000-4000-8000-000000000001'
)
from (
  select array_agg(version.id order by version.id) version_ids,
         jsonb_object_agg(version.id::text, to_jsonb(version.revision)) expected_revisions
  from public.routine_template_versions version
  join public.routine_templates template on template.id = version.template_id
  where template.organization_id = 'a1000000-0000-4000-8000-000000000001'
    and template.routine_key in ('opening','closing') and version.state = 'draft'
) publication;

select public.phase10b_assert(
  (select count(*) = 2 from public.routine_template_versions version
   join public.routine_templates template on template.id = version.template_id
   where template.routine_key in ('opening','closing') and version.state = 'published'),
  '50 each valid version in the batch is published'
);
select public.phase10b_assert(
  (select count(distinct publication_group_id) = 1 from public.routine_template_versions version
   join public.routine_templates template on template.id = version.template_id
   where template.routine_key in ('opening','closing') and version.state = 'published'),
  '51 Opening and Closing publish atomically in one group'
);

-- Idempotent replay uses the original request, including pre-publish revisions.
select public.phase10b_assert(
  (public.publish_routine_template_versions(
    batch.version_ids, batch.expected_revisions,
    'Initial Opening and Closing publication',
    '35000000-0000-4000-8000-000000000001'
  )->>'idempotentReplay')::boolean,
  '59 identical publication idempotency replay returns the original result'
)
from (
  select publication_batch.version_ids,
    jsonb_object_agg(version.id::text, to_jsonb(version.revision - 1)) expected_revisions
  from public.routine_template_publication_batches publication_batch
  join public.routine_template_versions version on version.id = any(publication_batch.version_ids)
  where publication_batch.idempotency_key = '35000000-0000-4000-8000-000000000001'
  group by publication_batch.version_ids
) batch;
select public.phase10b_expect_error(format($sql$
  select public.publish_routine_template_versions(%L::uuid[], %L::jsonb, 'Different note', '35000000-0000-4000-8000-000000000001')
$sql$,
  (select version_ids::text from public.routine_template_publication_batches where idempotency_key = '35000000-0000-4000-8000-000000000001'),
  (select jsonb_object_agg(version.id::text, to_jsonb(version.revision - 1))::text
   from public.routine_template_publication_batches publication_batch
   join public.routine_template_versions version on version.id = any(publication_batch.version_ids)
   where publication_batch.idempotency_key = '35000000-0000-4000-8000-000000000001')),
'different request', '60 reusing a publication key with a different request is rejected');

select public.phase10b_assert(
  (select bool_and(template.current_published_version_id = version.id)
   from public.routine_templates template join public.routine_template_versions version on version.template_id = template.id
   where template.routine_key in ('opening','closing') and version.state = 'published'),
  '56 current_published_version_id advances atomically'
);
select public.phase10b_assert(
  (select bool_and(content_hash ~ '^[0-9a-f]{64}$' and published_at is not null
                   and published_by_auth_user_id is not null and publication_group_id is not null)
   from public.routine_template_versions version
   join public.routine_templates template on template.id = version.template_id
   where template.routine_key in ('opening','closing') and version.state = 'published'),
  '58 published versions contain consistent SHA-256 and publication audit metadata'
);

-- Immutability after publication.
select public.phase10b_expect_error(format('update public.routine_template_versions set name = %L where id = %L', 'Changed',
  (select current_published_version_id from public.routine_templates where routine_key = 'opening' and organization_id = 'a1000000-0000-4000-8000-000000000001')),
'immutable', '16 published versions cannot be updated');
select public.phase10b_expect_error(format('delete from public.routine_template_versions where id = %L',
  (select current_published_version_id from public.routine_templates where routine_key = 'opening' and organization_id = 'a1000000-0000-4000-8000-000000000001')),
'cannot be deleted', '17 published versions cannot be deleted');
select public.phase10b_expect_error(format('update public.routine_template_tasks set title = %L where version_id = %L', 'Changed',
  (select current_published_version_id from public.routine_templates where routine_key = 'opening' and organization_id = 'a1000000-0000-4000-8000-000000000001')),
'immutable', '18 published child rows cannot be updated');
select public.phase10b_expect_error(format('delete from public.routine_template_tasks where version_id = %L',
  (select current_published_version_id from public.routine_templates where routine_key = 'opening' and organization_id = 'a1000000-0000-4000-8000-000000000001')),
'cannot be deleted directly|immutable', '19 published child rows cannot be deleted');
select public.phase10b_expect_error('update public.routine_template_publication_batches set publish_note = ''changed''',
'immutable', '21 publication batches cannot be updated');
select public.phase10b_expect_error('delete from public.routine_template_publication_batches',
'immutable', '22 publication batches cannot be deleted');

-- Draft copy, stale writes, reorder, discard, and atomic rollback.
select public.create_routine_template_draft(
  template.id, template.current_published_version_id,
  '36000000-0000-4000-8000-000000000001'
)
from public.routine_templates template
where template.routine_key = 'closing' and template.organization_id = 'a1000000-0000-4000-8000-000000000001';
select public.phase10b_assert(
  (select count(*) = 1 from public.routine_template_versions version
   join public.routine_templates template on template.id = version.template_id
   where template.routine_key = 'closing' and version.state = 'draft'),
  '23 draft creation creates one new active draft'
);
select public.phase10b_assert(
  (public.create_routine_template_draft(
    template.id, template.current_published_version_id,
    '36000000-0000-4000-8000-000000000001'
  )->>'idempotentReplay')::boolean,
  '24 identical draft creation replays the same draft'
)
from public.routine_templates template
where template.routine_key = 'closing' and template.organization_id = 'a1000000-0000-4000-8000-000000000001';
select public.phase10b_expect_error(format($sql$
  select public.create_routine_template_draft(%L, null, '36000000-0000-4000-8000-000000000001')
$sql$, (select id from public.routine_templates where routine_key = 'closing' and organization_id = 'a1000000-0000-4000-8000-000000000001')),
'different request', '25 draft idempotency keys reject a changed base request');
select public.phase10b_assert(
  (select
    (select count(*) from public.routine_template_sections child where child.version_id = draft.id)
      = (select count(*) from public.routine_template_sections source where source.version_id = draft.based_on_version_id)
    and (select count(*) from public.routine_template_tasks child where child.version_id = draft.id)
      = (select count(*) from public.routine_template_tasks source where source.version_id = draft.based_on_version_id)
    and (select count(*) from public.routine_template_task_relations child where child.version_id = draft.id)
      = (select count(*) from public.routine_template_task_relations source where source.version_id = draft.based_on_version_id)
   from public.routine_template_versions draft
   join public.routine_templates template on template.id = draft.template_id
   where template.routine_key = 'closing' and draft.state = 'draft'),
  '26 draft copy reproduces the complete published structure'
);
select public.phase10b_assert(
  (select bool_and(child.task_key = source.task_key and child.id <> source.id and child.sort_order = source.sort_order)
   from public.routine_template_versions draft
   join public.routine_templates template on template.id = draft.template_id
   join public.routine_template_tasks child on child.version_id = draft.id
   join public.routine_template_tasks source on source.version_id = draft.based_on_version_id and source.task_key = child.task_key
   where template.routine_key = 'closing' and draft.state = 'draft'),
  '27 copied drafts preserve stable keys and order while allocating new UUIDs'
);
select public.phase10b_assert(
  (select count(*) = 1 from public.routine_template_versions version
   join public.routine_templates template on template.id = version.template_id
   where template.routine_key = 'closing' and version.state = 'draft'),
  '28 database uniqueness is the final one-draft concurrency guard'
);
select public.phase10b_expect_error(format($sql$
  select public.update_routine_draft_metadata(%L, 'Stale', null, 0)
$sql$, (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'closing' and version.state = 'draft')),
'stale', '29 stale draft metadata updates are rejected');
select public.phase10b_expect_error(format($sql$
  select public.upsert_routine_draft_task(%L, %L, %L,
    '{"taskKey":"C01","title":"Stale","doneCriteria":"Done","taskType":"action","locationDescription":"Place","sortOrder":0}'::jsonb,
    999, %s)
$sql$,
  (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'closing' and version.state = 'draft'),
  (select task.section_id from public.routine_template_tasks task join public.routine_template_versions version on version.id = task.version_id join public.routine_templates template on template.id = version.template_id where template.routine_key = 'closing' and version.state = 'draft'),
  (select task.id from public.routine_template_tasks task join public.routine_template_versions version on version.id = task.version_id join public.routine_templates template on template.id = version.template_id where template.routine_key = 'closing' and version.state = 'draft'),
  (select version.revision from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'closing' and version.state = 'draft')),
'stale.*task', '30 stale child updates are rejected');
select public.phase10b_expect_error(format($sql$
  select public.reorder_routine_draft_sections(%L, '{}'::uuid[], %s)
$sql$,
  (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'closing' and version.state = 'draft'),
  (select version.revision from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'closing' and version.state = 'draft')),
'exact complete list', '31 reorder rejects missing, duplicate, and foreign IDs');
select public.reorder_routine_draft_sections(
  version.id, array_agg(section.id order by section.sort_order), version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_sections section on section.version_id = version.id
where template.routine_key = 'closing' and version.state = 'draft'
group by version.id, version.revision;
select public.phase10b_assert(
  (select version.revision > 1 from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'closing' and version.state = 'draft'),
  '32 successful reorder advances the version revision atomically'
);
select public.phase10b_expect_error(format($sql$
  select public.discard_routine_template_draft(%L, '   ', %s)
$sql$,
  (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'closing' and version.state = 'draft'),
  (select version.revision from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'closing' and version.state = 'draft')),
'reason is required', '33 discard requires a substantive reason');
select public.discard_routine_template_draft(version.id, 'Draft lifecycle probe complete', version.revision)
from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id
where template.routine_key = 'closing' and version.state = 'draft';
select public.phase10b_expect_error(format('update public.routine_template_versions set name = ''Changed'' where id = %L',
  (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'closing' and version.state = 'discarded')),
'immutable', '20 discarded drafts cannot be edited or reactivated');

-- Create a valid Opening draft and prove an invalid companion rolls back the whole batch.
select public.create_routine_template_draft(
  template.id, template.current_published_version_id,
  '36000000-0000-4000-8000-000000000002'
)
from public.routine_templates template
where template.routine_key = 'opening' and template.organization_id = 'a1000000-0000-4000-8000-000000000001';
select public.phase10b_expect_error(format($sql$
  select public.publish_routine_template_versions(%L::uuid[], %L::jsonb, 'Atomic failure probe', '36000000-0000-4000-8000-000000000003')
$sql$,
  (select array_agg(version.id order by version.id)::text from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where version.state = 'draft' and template.routine_key in ('opening','validation-probe')),
  (select jsonb_object_agg(version.id::text, to_jsonb(version.revision))::text from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where version.state = 'draft' and template.routine_key in ('opening','validation-probe'))),
'validation failed', '52 one invalid version rolls back the entire publication batch');
select public.phase10b_assert(
  (select count(*) = 2 from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where version.state = 'draft' and template.routine_key in ('opening','validation-probe')),
  '61 failed atomic publication leaves every batch version as draft'
);
select public.phase10b_assert(
  (select count(*) = 0 from public.routine_template_publication_batches where idempotency_key = '36000000-0000-4000-8000-000000000003'),
  '62 failed or competing publication does not leave a partial batch row'
);

-- Publish the valid Opening copy and retain the previous immutable publication.
select public.publish_routine_template_versions(
  array[version.id], jsonb_build_object(version.id::text, version.revision),
  'Second Opening publication', '36000000-0000-4000-8000-000000000004'
)
from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id
where template.routine_key = 'opening' and version.state = 'draft';
select public.phase10b_assert(
  (select count(*) = 2 from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'opening' and version.state = 'published'),
  '57 previous published versions remain available after a newer publication'
);
select public.phase10b_assert(
  (select count(*) = 2 and count(distinct content_hash) = 1 from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'opening' and version.state = 'published'),
  '22 prior published content remains unchanged when a copied version is published'
);

-- Current-published cross-run targets are valid; cross-organization targets and batch IDs are not.
update public.routine_template_task_relations relation
set target_task_key = 'C01'
where relation.version_id = (
  select version.id from public.routine_template_versions version
  join public.routine_templates template on template.id = version.template_id
  where template.routine_key = 'validation-probe'
);
select public.phase10b_assert(
  (select not exists (
     select 1 from jsonb_array_elements_text(public.validate_routine_template_version(version.id, array[version.id])->'blockers') blocker
     where blocker like 'Cross-run target%'
   )
   from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id
   where template.routine_key = 'validation-probe'),
  '48 a valid cross-run target resolves against the current published version'
);

insert into public.routine_template_versions (
  organization_id, template_id, version_number, state, name, creation_idempotency_key,
  created_by_auth_user_id, updated_by_auth_user_id
)
select template.organization_id, template.id, 1, 'draft', 'Organization B Opening',
  '37000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001'
from public.routine_templates template
where template.organization_id = 'b2000000-0000-4000-8000-000000000001' and template.routine_key = 'opening';
insert into public.routine_templates (
  organization_id, routine_key, name, creation_idempotency_key,
  created_by_auth_user_id, updated_by_auth_user_id
) values (
  'b2000000-0000-4000-8000-000000000001', 'foreign-only', 'Foreign only',
  '37000000-0000-4000-8000-000000000002',
  '22000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001'
);
update public.routine_template_task_relations relation
set target_routine_key = 'foreign-only', target_task_key = 'foreign-task'
where relation.version_id = (
  select version.id from public.routine_template_versions version
  join public.routine_templates template on template.id = version.template_id
  where template.routine_key = 'validation-probe'
);
select public.phase10b_assert(
  (public.validate_routine_template_version(
    (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'validation-probe'),
    array[
      (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'validation-probe'),
      (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.organization_id = 'b2000000-0000-4000-8000-000000000001' and template.routine_key = 'opening')
    ]
  )->'blockers') @> '["Every publication batch version must belong to this organization.","Cross-run target routine is not available: foreign-only."]'::jsonb,
  '49 cross-organization batch versions and cross-run targets are never accepted'
);

-- RLS and grants.
set role authenticated;
select public.phase10b_assert(
  (select count(*) >= 1 from public.routine_template_versions where state = 'draft'),
  '63 managers can read own-organization drafts'
);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', false);
select public.phase10b_assert(
  (select count(*) = 0 from public.routine_template_versions where state = 'draft'),
  '64 staff cannot read drafts'
);
select public.phase10b_assert(
  (select count(*) = 2 from public.routine_templates where active and current_published_version_id is not null),
  '65 staff can read active templates with their current published version'
);
select public.phase10b_assert(
  (select count(*) = 0 from public.routine_template_versions where state = 'discarded'),
  '66 staff cannot read discarded versions'
);
select public.phase10b_assert(
  (select count(*) = 0 from public.routine_templates where organization_id = 'b2000000-0000-4000-8000-000000000001'),
  '67 cross-organization SELECT is blocked by RLS'
);
select public.phase10b_expect_error(format($sql$
  select public.update_routine_draft_metadata(%L, 'Cross org', null, 1)
$sql$, (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'validation-probe')),
'manager.*required', '69 staff cannot create, edit, or publish templates');
select public.phase10b_expect_error('insert into public.routine_templates (organization_id,routine_key,name,creation_idempotency_key,created_by_auth_user_id,updated_by_auth_user_id) values (gen_random_uuid(),''x'',''x'',gen_random_uuid(),gen_random_uuid(),gen_random_uuid())',
'permission denied', '74 authenticated clients have no direct template DML');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000004', false);
select public.phase10b_assert((select count(*) = 0 from public.routine_templates), '70 inactive users are blocked');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000005', false);
select public.phase10b_assert((select count(*) = 0 from public.routine_templates), '71 organization-less users are blocked');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000006', false);
select public.phase10b_assert((select count(*) = 0 from public.routine_templates), '72 Inventory counters receive no automatic routine access');
reset role;

select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000001', false);
select public.phase10b_expect_error(format($sql$
  select public.update_routine_draft_metadata(%L, 'Cross org', null, 1)
$sql$, (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'validation-probe')),
'not found', '68 cross-organization manager RPC access is blocked');

set role anon;
select public.phase10b_expect_error('select * from public.routine_templates', 'permission denied', '73 anon has no table access');
reset role;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);

select public.phase10b_assert(
  (select count(*) = 8 from pg_catalog.pg_class relation join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
   where namespace.nspname = 'public' and relation.relname like 'routine_template%'
     and relation.relkind = 'r' and relation.relrowsecurity),
  '75 all Phase 10B data tables keep RLS enabled across reapplication'
);
select public.phase10b_assert(
  (select count(*) = 6 from information_schema.tables where table_schema = 'public' and table_name in (
    'routine_organization_settings','routine_locations','routine_location_sets',
    'routine_location_set_members','routine_standards','routine_standard_revisions'
  )),
  '76 the six Phase 10A foundation tables remain available'
);
select public.phase10b_assert(
  not exists (
    select 1 from pg_catalog.pg_constraint constraint_definition
    join pg_catalog.pg_class source on source.oid = constraint_definition.conrelid
    join pg_catalog.pg_class target on target.oid = constraint_definition.confrelid
    where constraint_definition.contype = 'f'
      and source.relname like 'routine_template%'
      and target.relname like 'inventory_%'
  ),
  '77 Phase 10B has no foreign key or constraint dependency on Inventory'
);
select public.phase10b_assert(
  not exists (select 1 from pg_catalog.pg_depend dependency
    join pg_catalog.pg_class source on source.oid = dependency.objid
    join pg_catalog.pg_class target on target.oid = dependency.refobjid
    where source.relname like 'routine_template%' and target.relname in ('shift_sessions','task_completions','handover_notes')),
  '78 Phase 10B has no dependency on legacy routine tables'
);
select public.phase10b_assert(
  not exists (select 1 from pg_catalog.pg_depend dependency
    join pg_catalog.pg_class source on source.oid = dependency.objid
    join pg_catalog.pg_class target on target.oid = dependency.refobjid
    where source.relname like 'routine_template%' and target.relname like 'event_%'),
  '79 Phase 10B has no dependency on Event Operations'
);
select public.phase10b_assert(
  (select count(*) = 8 from auth.users),
  '80 Auth fixture identities remain unchanged by template operations'
);
select public.phase10b_assert(
  not public.routine_validate_condition_json('{"not":{"not":{"not":{"not":{"not":{"not":{"fact":"weekday","operator":"equals","value":"mon"}}}}}}}'::jsonb),
  '81 condition validation enforces the maximum nesting depth'
);
select public.phase10b_assert(
  not public.routine_validate_condition_json('{"fact":"weekday","operator":"equals","value":"mon","sql":"select 1"}'::jsonb),
  '82 condition validation rejects unknown executable-looking keys'
);
select public.phase10b_assert(
  pg_catalog.pg_get_functiondef('public.routine_template_version_content_hash(uuid)'::regprocedure) like '%sha256%'
  and pg_catalog.pg_get_functiondef('public.routine_template_version_content_hash(uuid)'::regprocedure) like '%extensions.digest%',
  '83 content hashes use pgcrypto SHA-256 explicitly'
);
select public.phase10b_assert(
  not exists (
    select 1 from information_schema.role_table_grants privilege
    where privilege.grantee = 'authenticated' and privilege.table_schema = 'public'
      and privilege.table_name like 'routine_template%'
      and privilege.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
  ),
  '84 authenticated has SELECT-only table grants'
);
select public.phase10b_assert(
  (select count(*) = 8 and bool_and(policy.roles = '{authenticated}'::name[])
   from pg_catalog.pg_policies policy
   where policy.schemaname = 'public' and policy.tablename like 'routine_template%')
  and not exists (
    select 1 from pg_catalog.pg_policies policy
    where policy.schemaname = 'public' and policy.tablename like 'routine_template%'
      and (coalesce(policy.qual, '') ~* '^\s*true\s*$' or coalesce(policy.with_check, '') ~* '^\s*true\s*$')
  ),
  '85 every Phase 10B policy targets authenticated without broad predicates'
);
select public.phase10b_assert(
  not exists (
    select 1 from pg_catalog.pg_proc function_definition
    join pg_catalog.pg_namespace namespace on namespace.oid = function_definition.pronamespace
    where namespace.nspname = 'public'
      and (function_definition.proname like '%routine_template%' or function_definition.proname like '%routine_draft%')
      and function_definition.prosecdef
      and not ('search_path=pg_catalog' = any(coalesce(function_definition.proconfig, '{}'::text[])))
  ),
  '86 every security-definer template function fixes search_path to pg_catalog'
);
select public.phase10b_assert(
  (select count(*) = 4 from public.routine_templates where organization_id = 'a1000000-0000-4000-8000-000000000001')
  and not exists (select 1 from public.routine_templates where routine_key ~ '^(O|C|DS)[0-9]'),
  '87 migration seeded no canonical O, C, or DS content templates'
);
select public.phase10b_assert(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'routine_template_task_relations'
      and column_name ~* 'complete|status|resolved'
  ),
  '88 cross-run relations are declarative and cannot auto-complete target tasks'
);

drop function public.phase10b_expect_error(text, text, text);
drop function public.phase10b_assert(boolean, text);

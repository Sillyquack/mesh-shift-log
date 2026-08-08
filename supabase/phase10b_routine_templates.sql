-- Phase 10B: Routine Templates, drafts, and immutable publishing.
--
-- Apply after phase10a_routine_engine_foundation.sql and
-- phase10a1_routine_organization_settings_bootstrap.sql. This migration is
-- additive, does not seed routine content, and does not activate Routine
-- Engine v2 for any organization.

create table if not exists public.routine_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  routine_key text not null,
  name text not null,
  description text,
  current_published_version_id uuid,
  active boolean not null default true,
  revision bigint not null default 1,
  creation_idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by_auth_user_id uuid not null references auth.users(id),
  constraint routine_templates_org_key_unique unique (organization_id, routine_key),
  constraint routine_templates_org_idempotency_unique unique (organization_id, creation_idempotency_key),
  constraint routine_templates_id_org_unique unique (id, organization_id),
  constraint routine_templates_key_check check (
    routine_key = trim(routine_key)
    and routine_key ~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
    and char_length(routine_key) between 1 and 80
  ),
  constraint routine_templates_name_check check (
    name = trim(name) and char_length(name) between 1 and 200
  ),
  constraint routine_templates_description_check check (
    description is null or char_length(description) <= 4000
  ),
  constraint routine_templates_revision_check check (revision > 0)
);

create table if not exists public.routine_template_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  template_id uuid not null,
  version_number bigint not null,
  state text not null default 'draft',
  based_on_version_id uuid,
  name text not null,
  description text,
  content_hash text,
  creation_idempotency_key uuid not null,
  revision bigint not null default 1,
  publication_group_id uuid,
  publish_note text,
  published_at timestamptz,
  published_by_auth_user_id uuid references auth.users(id),
  discarded_at timestamptz,
  discarded_by_auth_user_id uuid references auth.users(id),
  discard_reason text,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by_auth_user_id uuid not null references auth.users(id),
  constraint routine_template_versions_template_same_org_fkey
    foreign key (template_id, organization_id)
    references public.routine_templates(id, organization_id),
  constraint routine_template_versions_number_unique unique (template_id, version_number),
  constraint routine_template_versions_org_idempotency_unique unique (organization_id, creation_idempotency_key),
  constraint routine_template_versions_id_org_unique unique (id, organization_id),
  constraint routine_template_versions_identity_unique unique (id, organization_id, template_id),
  constraint routine_template_versions_based_on_same_template_fkey
    foreign key (based_on_version_id, organization_id, template_id)
    references public.routine_template_versions(id, organization_id, template_id),
  constraint routine_template_versions_number_check check (version_number > 0),
  constraint routine_template_versions_state_check check (state in ('draft', 'published', 'discarded')),
  constraint routine_template_versions_name_check check (
    name = trim(name) and char_length(name) between 1 and 200
  ),
  constraint routine_template_versions_description_check check (
    description is null or char_length(description) <= 4000
  ),
  constraint routine_template_versions_hash_check check (
    content_hash is null or content_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint routine_template_versions_revision_check check (revision > 0),
  constraint routine_template_versions_publish_note_check check (
    publish_note is null or (nullif(trim(publish_note), '') is not null and char_length(publish_note) <= 2000)
  ),
  constraint routine_template_versions_discard_reason_check check (
    discard_reason is null or (nullif(trim(discard_reason), '') is not null and char_length(discard_reason) <= 2000)
  ),
  constraint routine_template_versions_state_consistency_check check (
    (state = 'draft'
      and content_hash is null
      and publication_group_id is null
      and publish_note is null
      and published_at is null
      and published_by_auth_user_id is null
      and discarded_at is null
      and discarded_by_auth_user_id is null
      and discard_reason is null)
    or
    (state = 'published'
      and content_hash is not null
      and publication_group_id is not null
      and published_at is not null
      and published_by_auth_user_id is not null
      and discarded_at is null
      and discarded_by_auth_user_id is null
      and discard_reason is null)
    or
    (state = 'discarded'
      and content_hash is null
      and publication_group_id is null
      and publish_note is null
      and published_at is null
      and published_by_auth_user_id is null
      and discarded_at is not null
      and discarded_by_auth_user_id is not null
      and nullif(trim(discard_reason), '') is not null)
  )
);

create unique index if not exists routine_template_versions_one_draft_per_template
  on public.routine_template_versions (template_id)
  where state = 'draft';

do $phase10b$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'routine_templates_current_published_same_template_fkey'
      and conrelid = 'public.routine_templates'::regclass
  ) then
    alter table public.routine_templates
      add constraint routine_templates_current_published_same_template_fkey
      foreign key (current_published_version_id, organization_id, id)
      references public.routine_template_versions(id, organization_id, template_id);
  end if;
end;
$phase10b$;

create table if not exists public.routine_template_sections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  version_id uuid not null,
  section_key text not null,
  title text not null,
  description text,
  phase_type text not null default 'other',
  sort_order integer not null,
  active boolean not null default true,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by_auth_user_id uuid not null references auth.users(id),
  constraint routine_template_sections_version_same_org_fkey
    foreign key (version_id, organization_id)
    references public.routine_template_versions(id, organization_id),
  constraint routine_template_sections_key_unique unique (version_id, section_key),
  constraint routine_template_sections_sort_unique unique (version_id, sort_order) deferrable initially immediate,
  constraint routine_template_sections_identity_unique unique (id, organization_id, version_id),
  constraint routine_template_sections_key_check check (
    section_key = trim(section_key)
    and section_key ~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
    and char_length(section_key) between 1 and 80
  ),
  constraint routine_template_sections_title_check check (
    title = trim(title) and char_length(title) between 1 and 200
  ),
  constraint routine_template_sections_description_check check (
    description is null or char_length(description) <= 4000
  ),
  constraint routine_template_sections_phase_check check (
    phase_type in (
      'overview', 'startup', 'service', 'checkpoint', 'preclose',
      'final_close', 'verification', 'security', 'handover', 'other'
    )
  ),
  constraint routine_template_sections_sort_check check (sort_order between 0 and 100000),
  constraint routine_template_sections_revision_check check (revision > 0)
);

create table if not exists public.routine_template_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  version_id uuid not null,
  section_id uuid not null,
  task_key text not null,
  title text not null,
  instructions text,
  done_criteria text,
  task_type text not null,
  criticality text not null default 'normal',
  mandatory boolean not null default true,
  initial_assessment_policy text not null default 'none',
  completion_policy text not null default 'standard_required',
  not_applicable_policy text not null default 'forbidden',
  verification_policy text not null default 'none',
  repeat_policy text not null default 'once_per_run',
  availability_mode text not null default 'immediate',
  condition_json jsonb not null default '{}'::jsonb,
  location_id uuid,
  location_set_id uuid,
  location_description text,
  visible_day_offset integer not null default 0,
  visible_from_local_time time without time zone,
  start_day_offset integer not null default 0,
  start_from_local_time time without time zone,
  target_day_offset integer not null default 0,
  target_local_time time without time zone,
  overdue_day_offset integer not null default 0,
  overdue_local_time time without time zone,
  hard_deadline_day_offset integer not null default 0,
  hard_deadline_local_time time without time zone,
  sort_order integer not null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by_auth_user_id uuid not null references auth.users(id),
  constraint routine_template_tasks_version_same_org_fkey
    foreign key (version_id, organization_id)
    references public.routine_template_versions(id, organization_id),
  constraint routine_template_tasks_section_same_version_fkey
    foreign key (section_id, organization_id, version_id)
    references public.routine_template_sections(id, organization_id, version_id),
  constraint routine_template_tasks_location_same_org_fkey
    foreign key (location_id, organization_id)
    references public.routine_locations(id, organization_id),
  constraint routine_template_tasks_location_set_same_org_fkey
    foreign key (location_set_id, organization_id)
    references public.routine_location_sets(id, organization_id),
  constraint routine_template_tasks_key_unique unique (version_id, task_key),
  constraint routine_template_tasks_section_sort_unique unique (section_id, sort_order) deferrable initially immediate,
  constraint routine_template_tasks_identity_unique unique (id, organization_id, version_id),
  constraint routine_template_tasks_location_exclusive check (
    location_id is null or location_set_id is null
  ),
  constraint routine_template_tasks_key_check check (
    task_key = trim(task_key)
    and task_key ~ '^[A-Za-z][A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)*$'
    and char_length(task_key) between 1 and 80
  ),
  constraint routine_template_tasks_title_check check (
    title = trim(title) and char_length(title) between 1 and 300
  ),
  constraint routine_template_tasks_text_lengths_check check (
    (instructions is null or char_length(instructions) <= 12000)
    and (done_criteria is null or char_length(done_criteria) <= 4000)
    and (location_description is null or char_length(location_description) <= 1000)
  ),
  constraint routine_template_tasks_type_check check (
    task_type in ('action', 'control', 'measurement', 'procedure', 'checkpoint', 'continuous', 'verification', 'handover', 'gate')
  ),
  constraint routine_template_tasks_criticality_check check (criticality in ('normal', 'important', 'critical')),
  constraint routine_template_tasks_initial_assessment_check check (initial_assessment_policy in ('none', 'ready_on_arrival', 'control_result')),
  constraint routine_template_tasks_completion_check check (completion_policy in ('standard_required', 'control_allows_deviation', 'manager_override')),
  constraint routine_template_tasks_na_check check (not_applicable_policy in ('forbidden', 'allowed_with_reason', 'system_only')),
  constraint routine_template_tasks_verification_check check (verification_policy in ('none', 'self_recheck', 'independent', 'second_person_required', 'manager_required', 'closing_responsible')),
  constraint routine_template_tasks_repeat_check check (repeat_policy in ('once_per_run', 'once_per_phase', 'after_last_use', 'continuous', 'conditional', 'complementary')),
  constraint routine_template_tasks_availability_check check (availability_mode in ('immediate', 'time_window', 'after_task', 'condition', 'continuous')),
  constraint routine_template_tasks_condition_object_check check (jsonb_typeof(condition_json) = 'object'),
  constraint routine_template_tasks_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint routine_template_tasks_offsets_check check (
    visible_day_offset between -7 and 31
    and start_day_offset between -7 and 31
    and target_day_offset between -7 and 31
    and overdue_day_offset between -7 and 31
    and hard_deadline_day_offset between -7 and 31
  ),
  constraint routine_template_tasks_sort_check check (sort_order between 0 and 100000),
  constraint routine_template_tasks_revision_check check (revision > 0)
);

create table if not exists public.routine_template_task_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  version_id uuid not null,
  task_id uuid not null,
  item_key text not null,
  label text not null,
  item_type text not null,
  required boolean not null default true,
  source_kind text not null default 'static',
  source_config jsonb not null default '{}'::jsonb,
  standard_id uuid,
  source_location_set_id uuid,
  input_schema jsonb not null default '{}'::jsonb,
  sort_order integer not null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by_auth_user_id uuid not null references auth.users(id),
  constraint routine_template_task_items_task_same_version_fkey
    foreign key (task_id, organization_id, version_id)
    references public.routine_template_tasks(id, organization_id, version_id),
  constraint routine_template_task_items_standard_same_org_fkey
    foreign key (standard_id, organization_id)
    references public.routine_standards(id, organization_id),
  constraint routine_template_task_items_location_set_same_org_fkey
    foreign key (source_location_set_id, organization_id)
    references public.routine_location_sets(id, organization_id),
  constraint routine_template_task_items_key_unique unique (task_id, item_key),
  constraint routine_template_task_items_sort_unique unique (task_id, sort_order) deferrable initially immediate,
  constraint routine_template_task_items_key_check check (
    item_key = trim(item_key)
    and item_key ~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
    and char_length(item_key) between 1 and 80
  ),
  constraint routine_template_task_items_label_check check (
    label = trim(label) and char_length(label) between 1 and 300
  ),
  constraint routine_template_task_items_type_check check (
    item_type in ('check', 'count', 'quantity', 'measurement', 'text', 'choice', 'location', 'asset', 'product', 'status')
  ),
  constraint routine_template_task_items_source_check check (
    source_kind in ('static', 'location_set', 'routine_standard', 'inventory_readonly', 'asset_registry_readonly', 'event_context')
  ),
  constraint routine_template_task_items_source_reference_check check (
    (source_kind = 'routine_standard' and standard_id is not null and source_location_set_id is null)
    or (source_kind = 'location_set' and standard_id is null and source_location_set_id is not null)
    or (source_kind not in ('routine_standard', 'location_set') and standard_id is null and source_location_set_id is null)
  ),
  constraint routine_template_task_items_source_config_object_check check (jsonb_typeof(source_config) = 'object'),
  constraint routine_template_task_items_input_schema_object_check check (jsonb_typeof(input_schema) = 'object'),
  constraint routine_template_task_items_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint routine_template_task_items_sort_check check (sort_order between 0 and 100000),
  constraint routine_template_task_items_revision_check check (revision > 0)
);

create table if not exists public.routine_template_task_dependencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  version_id uuid not null,
  predecessor_task_id uuid not null,
  successor_task_id uuid not null,
  dependency_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by_auth_user_id uuid not null references auth.users(id),
  constraint routine_template_task_dependencies_predecessor_fkey
    foreign key (predecessor_task_id, organization_id, version_id)
    references public.routine_template_tasks(id, organization_id, version_id),
  constraint routine_template_task_dependencies_successor_fkey
    foreign key (successor_task_id, organization_id, version_id)
    references public.routine_template_tasks(id, organization_id, version_id),
  constraint routine_template_task_dependencies_logical_unique
    unique (version_id, predecessor_task_id, successor_task_id, dependency_type),
  constraint routine_template_task_dependencies_not_self_check check (predecessor_task_id <> successor_task_id),
  constraint routine_template_task_dependencies_type_check check (
    dependency_type in ('must_complete', 'must_resolve', 'must_reach_time', 'must_receive_transfer')
  ),
  constraint routine_template_task_dependencies_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint routine_template_task_dependencies_revision_check check (revision > 0)
);

create table if not exists public.routine_template_task_relations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  version_id uuid not null,
  source_task_id uuid not null,
  target_routine_key text not null,
  target_task_key text not null,
  relation_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by_auth_user_id uuid not null references auth.users(id),
  constraint routine_template_task_relations_source_fkey
    foreign key (source_task_id, organization_id, version_id)
    references public.routine_template_tasks(id, organization_id, version_id),
  constraint routine_template_task_relations_logical_unique
    unique (version_id, source_task_id, target_routine_key, target_task_key, relation_type),
  constraint routine_template_task_relations_target_routine_key_check check (
    target_routine_key = trim(target_routine_key)
    and target_routine_key ~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
    and char_length(target_routine_key) between 1 and 80
  ),
  constraint routine_template_task_relations_target_task_key_check check (
    target_task_key = trim(target_task_key)
    and target_task_key ~ '^[A-Za-z][A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)*$'
    and char_length(target_task_key) between 1 and 80
  ),
  constraint routine_template_task_relations_type_check check (
    relation_type in ('shared_context', 'repeat_required', 'complementary_action', 'carry_forward_until_resolved', 'independent_verification', 'conditional_companion', 'delivery_comparison')
  ),
  constraint routine_template_task_relations_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint routine_template_task_relations_revision_check check (revision > 0)
);

create table if not exists public.routine_template_publication_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  idempotency_key uuid not null,
  request_hash text not null,
  publication_group_id uuid not null,
  version_ids uuid[] not null,
  response_payload jsonb not null,
  publish_note text,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  constraint routine_template_publication_batches_idempotency_unique unique (organization_id, idempotency_key),
  constraint routine_template_publication_batches_request_hash_check check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint routine_template_publication_batches_versions_check check (cardinality(version_ids) > 0),
  constraint routine_template_publication_batches_response_object_check check (jsonb_typeof(response_payload) = 'object'),
  constraint routine_template_publication_batches_note_check check (
    publish_note is null or (nullif(trim(publish_note), '') is not null and char_length(publish_note) <= 2000)
  )
);

create index if not exists routine_templates_org_active_idx on public.routine_templates (organization_id, active, routine_key);
create index if not exists routine_templates_current_idx on public.routine_templates (current_published_version_id, organization_id) where current_published_version_id is not null;
create index if not exists routine_template_versions_org_state_idx on public.routine_template_versions (organization_id, state, template_id, version_number);
create index if not exists routine_template_versions_based_on_idx on public.routine_template_versions (based_on_version_id, organization_id, template_id) where based_on_version_id is not null;
create index if not exists routine_template_sections_org_version_idx on public.routine_template_sections (organization_id, version_id, active, sort_order);
create index if not exists routine_template_tasks_org_version_idx on public.routine_template_tasks (organization_id, version_id, active, section_id, sort_order);
create index if not exists routine_template_tasks_location_idx on public.routine_template_tasks (location_id, organization_id) where location_id is not null;
create index if not exists routine_template_tasks_location_set_idx on public.routine_template_tasks (location_set_id, organization_id) where location_set_id is not null;
create index if not exists routine_template_task_items_org_version_idx on public.routine_template_task_items (organization_id, version_id, active, task_id, sort_order);
create index if not exists routine_template_task_items_standard_idx on public.routine_template_task_items (standard_id, organization_id) where standard_id is not null;
create index if not exists routine_template_task_items_location_set_idx on public.routine_template_task_items (source_location_set_id, organization_id) where source_location_set_id is not null;
create index if not exists routine_template_task_dependencies_successor_idx on public.routine_template_task_dependencies (successor_task_id, organization_id, version_id);
create index if not exists routine_template_task_relations_target_idx on public.routine_template_task_relations (organization_id, target_routine_key, target_task_key);
create index if not exists routine_template_publication_batches_org_group_idx on public.routine_template_publication_batches (organization_id, publication_group_id);

create or replace function public.routine_validate_condition_json(
  input_condition jsonb,
  input_depth integer default 0
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_key text;
  v_value jsonb;
  v_fact text;
  v_operator text;
  v_entry jsonb;
  v_key_count integer;
begin
  if input_condition is null or jsonb_typeof(input_condition) <> 'object' then
    return false;
  end if;
  if input_depth < 0 or input_depth > 5 or octet_length(input_condition::text) > 20000 then
    return false;
  end if;
  select count(*) into v_key_count from jsonb_object_keys(input_condition);
  if v_key_count = 0 then
    return true;
  end if;

  if v_key_count = 1 and input_condition ?| array['all', 'any', 'not'] then
    select key, value into v_key, v_value from jsonb_each(input_condition);
    if v_key in ('all', 'any') then
      if jsonb_typeof(v_value) <> 'array'
         or jsonb_array_length(v_value) < 1
         or jsonb_array_length(v_value) > 20 then
        return false;
      end if;
      for v_entry in select value from jsonb_array_elements(v_value)
      loop
        if not public.routine_validate_condition_json(v_entry, input_depth + 1) then
          return false;
        end if;
      end loop;
      return true;
    end if;
    return jsonb_typeof(v_value) = 'object'
      and public.routine_validate_condition_json(v_value, input_depth + 1);
  end if;

  if not (input_condition ? 'fact') or not (input_condition ? 'operator') then
    return false;
  end if;
  if exists (
    select 1 from jsonb_object_keys(input_condition) key_name
    where key_name not in ('fact', 'operator', 'value')
  ) then
    return false;
  end if;
  if jsonb_typeof(input_condition->'fact') <> 'string'
     or jsonb_typeof(input_condition->'operator') <> 'string' then
    return false;
  end if;
  v_fact := input_condition->>'fact';
  v_operator := input_condition->>'operator';
  if v_fact not in (
    'weekday', 'local_time', 'organization_flag', 'location_active',
    'event_zone_active', 'booking_exists', 'asset_used_today',
    'standard_value_exists', 'previous_task_status', 'transfer_status'
  ) then
    return false;
  end if;
  if v_operator not in ('equals', 'not_equals', 'in', 'greater_than', 'less_than', 'exists') then
    return false;
  end if;
  if v_operator = 'exists' then
    return not (input_condition ? 'value');
  end if;
  if not (input_condition ? 'value') or input_condition->'value' = 'null'::jsonb then
    return false;
  end if;
  if v_operator = 'in' then
    if jsonb_typeof(input_condition->'value') <> 'array'
       or jsonb_array_length(input_condition->'value') < 1
       or jsonb_array_length(input_condition->'value') > 50 then
      return false;
    end if;
    return not exists (
      select 1 from jsonb_array_elements(input_condition->'value') element
      where jsonb_typeof(element) in ('object', 'array', 'null')
    );
  end if;
  return jsonb_typeof(input_condition->'value') in ('string', 'number', 'boolean');
end;
$$;

create or replace function public.routine_template_version_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'Routine template versions cannot be deleted.';
  end if;
  if old.state in ('published', 'discarded') then
    raise exception using errcode = 'P0001', message = 'Published and discarded routine template versions are immutable.';
  end if;
  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.template_id is distinct from old.template_id
     or new.version_number is distinct from old.version_number
     or new.based_on_version_id is distinct from old.based_on_version_id
     or new.creation_idempotency_key is distinct from old.creation_idempotency_key
     or new.created_at is distinct from old.created_at
     or new.created_by_auth_user_id is distinct from old.created_by_auth_user_id then
    raise exception using errcode = 'P0001', message = 'Routine template version identity and creation audit are immutable.';
  end if;
  if new.state is distinct from old.state then
    if current_setting('app.routine_template_lifecycle_transition', true) <> 'authorized'
       or not (old.state = 'draft' and new.state in ('published', 'discarded')) then
      raise exception using errcode = 'P0001', message = 'Routine template lifecycle transitions require an authorized manager RPC.';
    end if;
  elsif new.state <> 'draft' then
    raise exception using errcode = 'P0001', message = 'Only draft routine template versions can be edited.';
  end if;
  return new;
end;
$$;

create or replace function public.routine_template_child_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_version_id uuid;
  v_organization_id uuid;
  v_state text;
begin
  if tg_op = 'DELETE' then
    if current_setting('app.routine_template_child_delete', true) <> 'authorized' then
      raise exception using errcode = 'P0001', message = 'Routine template child rows cannot be deleted directly.';
    end if;
    v_version_id := old.version_id;
    v_organization_id := old.organization_id;
  else
    v_version_id := new.version_id;
    v_organization_id := new.organization_id;
    if tg_op = 'UPDATE' and (
      new.id is distinct from old.id
      or new.version_id is distinct from old.version_id
      or new.organization_id is distinct from old.organization_id
      or new.created_at is distinct from old.created_at
      or new.created_by_auth_user_id is distinct from old.created_by_auth_user_id
    ) then
      raise exception using errcode = 'P0001', message = 'Routine template child identity and creation audit are immutable.';
    end if;
  end if;
  select version.state into v_state
  from public.routine_template_versions version
  where version.id = v_version_id
    and version.organization_id = v_organization_id
  for key share;
  if v_state is null then
    raise exception using errcode = 'P0001', message = 'The parent routine template version was not found.';
  end if;
  if v_state <> 'draft' then
    raise exception using errcode = 'P0001', message = 'Published and discarded routine template content is immutable.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.routine_template_publication_batch_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = 'P0001', message = 'Routine template publication batches are immutable.';
end;
$$;

drop trigger if exists routine_template_versions_guard on public.routine_template_versions;
create trigger routine_template_versions_guard
before update or delete on public.routine_template_versions
for each row execute function public.routine_template_version_guard();

drop trigger if exists routine_template_sections_guard on public.routine_template_sections;
create trigger routine_template_sections_guard
before insert or update or delete on public.routine_template_sections
for each row execute function public.routine_template_child_guard();

drop trigger if exists routine_template_tasks_guard on public.routine_template_tasks;
create trigger routine_template_tasks_guard
before insert or update or delete on public.routine_template_tasks
for each row execute function public.routine_template_child_guard();

drop trigger if exists routine_template_task_items_guard on public.routine_template_task_items;
create trigger routine_template_task_items_guard
before insert or update or delete on public.routine_template_task_items
for each row execute function public.routine_template_child_guard();

drop trigger if exists routine_template_task_dependencies_guard on public.routine_template_task_dependencies;
create trigger routine_template_task_dependencies_guard
before insert or update or delete on public.routine_template_task_dependencies
for each row execute function public.routine_template_child_guard();

drop trigger if exists routine_template_task_relations_guard on public.routine_template_task_relations;
create trigger routine_template_task_relations_guard
before insert or update or delete on public.routine_template_task_relations
for each row execute function public.routine_template_child_guard();

drop trigger if exists routine_template_publication_batches_guard on public.routine_template_publication_batches;
create trigger routine_template_publication_batches_guard
before update or delete on public.routine_template_publication_batches
for each row execute function public.routine_template_publication_batch_guard();

create or replace function public.routine_template_version_canonical_json(input_version_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'routineKey', template.routine_key,
    'name', version.name,
    'description', version.description,
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', section.section_key,
        'title', section.title,
        'description', section.description,
        'phaseType', section.phase_type,
        'sortOrder', section.sort_order,
        'active', section.active
      ) order by section.sort_order, section.section_key, section.id)
      from public.routine_template_sections section
      where section.version_id = version.id and section.organization_id = version.organization_id
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sectionKey', section.section_key,
        'key', task.task_key,
        'title', task.title,
        'instructions', task.instructions,
        'doneCriteria', task.done_criteria,
        'taskType', task.task_type,
        'criticality', task.criticality,
        'mandatory', task.mandatory,
        'initialAssessmentPolicy', task.initial_assessment_policy,
        'completionPolicy', task.completion_policy,
        'notApplicablePolicy', task.not_applicable_policy,
        'verificationPolicy', task.verification_policy,
        'repeatPolicy', task.repeat_policy,
        'availabilityMode', task.availability_mode,
        'condition', task.condition_json,
        'locationId', task.location_id,
        'locationSetId', task.location_set_id,
        'locationDescription', task.location_description,
        'visibleDayOffset', task.visible_day_offset,
        'visibleFromLocalTime', task.visible_from_local_time,
        'startDayOffset', task.start_day_offset,
        'startFromLocalTime', task.start_from_local_time,
        'targetDayOffset', task.target_day_offset,
        'targetLocalTime', task.target_local_time,
        'overdueDayOffset', task.overdue_day_offset,
        'overdueLocalTime', task.overdue_local_time,
        'hardDeadlineDayOffset', task.hard_deadline_day_offset,
        'hardDeadlineLocalTime', task.hard_deadline_local_time,
        'sortOrder', task.sort_order,
        'active', task.active,
        'metadata', task.metadata
      ) order by section.sort_order, section.section_key, task.sort_order, task.task_key, task.id)
      from public.routine_template_tasks task
      join public.routine_template_sections section
        on section.id = task.section_id
       and section.organization_id = task.organization_id
       and section.version_id = task.version_id
      where task.version_id = version.id and task.organization_id = version.organization_id
    ), '[]'::jsonb),
    'taskItems', coalesce((
      select jsonb_agg(jsonb_build_object(
        'taskKey', task.task_key,
        'key', item.item_key,
        'label', item.label,
        'itemType', item.item_type,
        'required', item.required,
        'sourceKind', item.source_kind,
        'sourceConfig', item.source_config,
        'standardId', item.standard_id,
        'sourceLocationSetId', item.source_location_set_id,
        'inputSchema', item.input_schema,
        'sortOrder', item.sort_order,
        'active', item.active,
        'metadata', item.metadata
      ) order by task.task_key, item.sort_order, item.item_key, item.id)
      from public.routine_template_task_items item
      join public.routine_template_tasks task
        on task.id = item.task_id
       and task.organization_id = item.organization_id
       and task.version_id = item.version_id
      where item.version_id = version.id and item.organization_id = version.organization_id
    ), '[]'::jsonb),
    'dependencies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'predecessorTaskKey', predecessor.task_key,
        'successorTaskKey', successor.task_key,
        'dependencyType', dependency.dependency_type,
        'metadata', dependency.metadata
      ) order by predecessor.task_key, successor.task_key, dependency.dependency_type, dependency.id)
      from public.routine_template_task_dependencies dependency
      join public.routine_template_tasks predecessor
        on predecessor.id = dependency.predecessor_task_id
       and predecessor.organization_id = dependency.organization_id
       and predecessor.version_id = dependency.version_id
      join public.routine_template_tasks successor
        on successor.id = dependency.successor_task_id
       and successor.organization_id = dependency.organization_id
       and successor.version_id = dependency.version_id
      where dependency.version_id = version.id and dependency.organization_id = version.organization_id
    ), '[]'::jsonb),
    'relations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sourceTaskKey', source_task.task_key,
        'targetRoutineKey', relation.target_routine_key,
        'targetTaskKey', relation.target_task_key,
        'relationType', relation.relation_type,
        'metadata', relation.metadata
      ) order by source_task.task_key, relation.target_routine_key, relation.target_task_key, relation.relation_type, relation.id)
      from public.routine_template_task_relations relation
      join public.routine_template_tasks source_task
        on source_task.id = relation.source_task_id
       and source_task.organization_id = relation.organization_id
       and source_task.version_id = relation.version_id
      where relation.version_id = version.id and relation.organization_id = version.organization_id
    ), '[]'::jsonb)
  )
  from public.routine_template_versions version
  join public.routine_templates template
    on template.id = version.template_id and template.organization_id = version.organization_id
  where version.id = input_version_id;
$$;

create or replace function public.routine_template_version_content_hash(input_version_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select encode(
    extensions.digest(
      convert_to(public.routine_template_version_canonical_json(input_version_id)::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$$;

create or replace function public.validate_routine_template_version(
  input_version_id uuid,
  input_publication_version_ids uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_version public.routine_template_versions%rowtype;
  v_batch_ids uuid[];
  v_blockers jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_counts jsonb;
  v_cycle boolean := false;
  v_relation record;
  v_target_template public.routine_templates%rowtype;
  v_target_version_id uuid;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then
    raise exception using errcode = '42501', message = 'Manager template permission is required.';
  end if;
  select version.* into v_version
  from public.routine_template_versions version
  where version.id = input_version_id
    and version.organization_id = v_actor.organization_id;
  if v_version.id is null then
    raise exception using errcode = 'P0001', message = 'Routine template version was not found in this organization.';
  end if;
  v_batch_ids := coalesce(input_publication_version_ids, array[input_version_id]::uuid[]);

  if v_version.state <> 'draft' then
    v_blockers := v_blockers || jsonb_build_array('Version must be a draft.');
  end if;
  if not exists (
    select 1 from public.routine_template_sections section
    where section.version_id = v_version.id and section.organization_id = v_version.organization_id and section.active
  ) then
    v_blockers := v_blockers || jsonb_build_array('At least one active section is required.');
  end if;
  if not exists (
    select 1 from public.routine_template_tasks task
    where task.version_id = v_version.id and task.organization_id = v_version.organization_id and task.active
  ) then
    v_blockers := v_blockers || jsonb_build_array('At least one active task is required.');
  end if;
  if exists (
    select 1
    from public.routine_template_tasks task
    left join public.routine_template_sections section
      on section.id = task.section_id
     and section.organization_id = task.organization_id
     and section.version_id = task.version_id
    where task.version_id = v_version.id
      and task.organization_id = v_version.organization_id
      and task.active
      and (section.id is null or not section.active)
  ) then
    v_blockers := v_blockers || jsonb_build_array('Every active task must belong to an active section.');
  end if;
  if exists (
    select 1 from public.routine_template_tasks task
    where task.version_id = v_version.id and task.organization_id = v_version.organization_id
      and task.active and task.mandatory
      and nullif(trim(coalesce(task.done_criteria, '')), '') is null
  ) then
    v_blockers := v_blockers || jsonb_build_array('Every active mandatory task requires done criteria.');
  end if;
  if exists (
    select 1 from public.routine_template_tasks task
    where task.version_id = v_version.id and task.organization_id = v_version.organization_id
      and task.active and task.location_id is null and task.location_set_id is null
      and nullif(trim(coalesce(task.location_description, '')), '') is null
  ) then
    v_blockers := v_blockers || jsonb_build_array('Every active task requires a location, location set, or location description.');
  end if;
  if exists (
    select 1 from public.routine_template_tasks task
    where task.version_id = v_version.id and task.organization_id = v_version.organization_id
      and task.active and task.mandatory and task.criticality = 'critical'
      and task.not_applicable_policy = 'allowed_with_reason'
  ) then
    v_blockers := v_blockers || jsonb_build_array('Critical mandatory tasks cannot allow free not-applicable reasons.');
  end if;
  if exists (
    select 1 from public.routine_template_tasks task
    where task.version_id = v_version.id and task.organization_id = v_version.organization_id and task.active
      and not (
        task.visible_day_offset * 86400 + coalesce(extract(epoch from task.visible_from_local_time), 0)
          <= task.start_day_offset * 86400 + coalesce(extract(epoch from task.start_from_local_time), 0)
        and task.start_day_offset * 86400 + coalesce(extract(epoch from task.start_from_local_time), 0)
          <= task.target_day_offset * 86400 + coalesce(extract(epoch from task.target_local_time), 0)
        and task.target_day_offset * 86400 + coalesce(extract(epoch from task.target_local_time), 0)
          <= task.overdue_day_offset * 86400 + coalesce(extract(epoch from task.overdue_local_time), 0)
        and task.overdue_day_offset * 86400 + coalesce(extract(epoch from task.overdue_local_time), 0)
          <= task.hard_deadline_day_offset * 86400 + coalesce(extract(epoch from task.hard_deadline_local_time), 0)
      )
  ) then
    v_blockers := v_blockers || jsonb_build_array('Task visibility, start, target, overdue, and deadline times must be ordered.');
  end if;
  if exists (
    select 1 from public.routine_template_tasks task
    where task.version_id = v_version.id and task.organization_id = v_version.organization_id and task.active
      and (
        (task.availability_mode = 'time_window' and (task.start_from_local_time is null or task.target_local_time is null))
        or (task.availability_mode = 'after_task' and not exists (
          select 1 from public.routine_template_task_dependencies dependency
          where dependency.version_id = task.version_id
            and dependency.organization_id = task.organization_id
            and dependency.successor_task_id = task.id
        ))
        or (task.availability_mode = 'condition' and task.condition_json = '{}'::jsonb)
        or (task.availability_mode = 'continuous' and task.repeat_policy <> 'continuous')
      )
  ) then
    v_blockers := v_blockers || jsonb_build_array('Task availability mode and its time, dependency, condition, or repeat fields are inconsistent.');
  end if;

  with recursive dependency_paths as (
    select dependency.predecessor_task_id as start_id,
           dependency.successor_task_id as current_id,
           array[dependency.predecessor_task_id, dependency.successor_task_id]::uuid[] as path,
           false as cycle
    from public.routine_template_task_dependencies dependency
    where dependency.version_id = v_version.id and dependency.organization_id = v_version.organization_id
    union all
    select path.start_id,
           dependency.successor_task_id,
           path.path || dependency.successor_task_id,
           dependency.successor_task_id = any(path.path)
    from dependency_paths path
    join public.routine_template_task_dependencies dependency
      on dependency.predecessor_task_id = path.current_id
     and dependency.version_id = v_version.id
     and dependency.organization_id = v_version.organization_id
    where not path.cycle and cardinality(path.path) <= 1000
  )
  select coalesce(bool_or(cycle), false) into v_cycle from dependency_paths;
  if v_cycle then
    v_blockers := v_blockers || jsonb_build_array('Task dependencies must not contain a cycle.');
  end if;
  if exists (
    select 1 from public.routine_template_task_dependencies dependency
    left join public.routine_template_tasks predecessor
      on predecessor.id = dependency.predecessor_task_id
     and predecessor.version_id = dependency.version_id
     and predecessor.organization_id = dependency.organization_id
    left join public.routine_template_tasks successor
      on successor.id = dependency.successor_task_id
     and successor.version_id = dependency.version_id
     and successor.organization_id = dependency.organization_id
    where dependency.version_id = v_version.id and dependency.organization_id = v_version.organization_id
      and (predecessor.id is null or successor.id is null)
  ) then
    v_blockers := v_blockers || jsonb_build_array('Every dependency must connect tasks in this version and organization.');
  end if;
  if exists (
    select 1
    from (
      select task.location_set_id as location_set_id
      from public.routine_template_tasks task
      where task.version_id = v_version.id and task.organization_id = v_version.organization_id
        and task.active and task.location_set_id is not null
      union
      select item.source_location_set_id
      from public.routine_template_task_items item
      join public.routine_template_tasks task
        on task.id = item.task_id and task.version_id = item.version_id and task.organization_id = item.organization_id
      where item.version_id = v_version.id and item.organization_id = v_version.organization_id
        and item.active and task.active and item.source_location_set_id is not null
    ) used_set
    left join public.routine_location_sets location_set
      on location_set.id = used_set.location_set_id and location_set.organization_id = v_version.organization_id
    where location_set.id is null or not location_set.active or not exists (
      select 1 from public.routine_location_set_members member
      where member.location_set_id = used_set.location_set_id and member.organization_id = v_version.organization_id
    )
  ) then
    v_blockers := v_blockers || jsonb_build_array('Every used location set must be active and non-empty.');
  end if;
  if exists (
    select 1
    from public.routine_template_task_items item
    join public.routine_template_tasks task
      on task.id = item.task_id and task.version_id = item.version_id and task.organization_id = item.organization_id
    left join public.routine_standards standard
      on standard.id = item.standard_id and standard.organization_id = item.organization_id
    where item.version_id = v_version.id and item.organization_id = v_version.organization_id
      and item.active and task.active and item.required and item.source_kind = 'routine_standard'
      and (standard.id is null or not standard.active or standard.current_revision_id is null)
  ) then
    v_blockers := v_blockers || jsonb_build_array('Every required routine standard source must have an active current revision.');
  end if;
  if exists (
    select 1 from public.routine_template_task_items item
    where item.version_id = v_version.id and item.organization_id = v_version.organization_id
      and (
        jsonb_typeof(item.source_config) <> 'object'
        or jsonb_typeof(item.input_schema) <> 'object'
        or jsonb_typeof(item.metadata) <> 'object'
        or (item.source_kind = 'routine_standard' and (item.standard_id is null or item.source_location_set_id is not null))
        or (item.source_kind = 'location_set' and (item.source_location_set_id is null or item.standard_id is not null))
        or (item.source_kind not in ('routine_standard', 'location_set') and (item.standard_id is not null or item.source_location_set_id is not null))
      )
  ) then
    v_blockers := v_blockers || jsonb_build_array('A task item has invalid source configuration.');
  end if;
  if exists (
    select 1 from public.routine_template_tasks task
    where task.version_id = v_version.id and task.organization_id = v_version.organization_id
      and not public.routine_validate_condition_json(task.condition_json)
  ) then
    v_blockers := v_blockers || jsonb_build_array('A task condition is malformed or uses an unsupported fact or operator.');
  end if;

  if exists (
    select 1 from unnest(v_batch_ids) batch_id
    left join public.routine_template_versions batch_version on batch_version.id = batch_id
    where batch_version.id is null or batch_version.organization_id is distinct from v_version.organization_id
  ) then
    v_blockers := v_blockers || jsonb_build_array('Every publication batch version must belong to this organization.');
  end if;

  for v_relation in
    select relation.*
    from public.routine_template_task_relations relation
    where relation.version_id = v_version.id and relation.organization_id = v_version.organization_id
  loop
    v_target_template := null;
    v_target_version_id := null;
    select template.* into v_target_template
    from public.routine_templates template
    where template.organization_id = v_version.organization_id
      and template.routine_key = v_relation.target_routine_key;
    if v_target_template.id is not null then
      select candidate.id into v_target_version_id
      from public.routine_template_versions candidate
      where candidate.id = any(v_batch_ids)
        and candidate.organization_id = v_version.organization_id
        and candidate.template_id = v_target_template.id
        and candidate.state = 'draft'
      order by candidate.id
      limit 1;
      v_target_version_id := coalesce(v_target_version_id, v_target_template.current_published_version_id);
    end if;
    if v_target_version_id is null then
      v_blockers := v_blockers || jsonb_build_array(
        'Cross-run target routine is not available: ' || v_relation.target_routine_key || '.'
      );
    elsif not exists (
      select 1 from public.routine_template_tasks target_task
      join public.routine_template_sections target_section
        on target_section.id = target_task.section_id
       and target_section.organization_id = target_task.organization_id
       and target_section.version_id = target_task.version_id
      where target_task.version_id = v_target_version_id
        and target_task.organization_id = v_version.organization_id
        and target_task.task_key = v_relation.target_task_key
        and target_task.active and target_section.active
    ) then
      v_blockers := v_blockers || jsonb_build_array(
        'Cross-run target task is missing or inactive: '
          || v_relation.target_routine_key || '/' || v_relation.target_task_key || '.'
      );
    end if;
  end loop;

  if exists (
    select 1 from (
      select version_id, sort_order from public.routine_template_sections
      where version_id = v_version.id and organization_id = v_version.organization_id
      group by version_id, sort_order having count(*) > 1
      union all
      select section_id, sort_order from public.routine_template_tasks
      where version_id = v_version.id and organization_id = v_version.organization_id
      group by section_id, sort_order having count(*) > 1
      union all
      select task_id, sort_order from public.routine_template_task_items
      where version_id = v_version.id and organization_id = v_version.organization_id
      group by task_id, sort_order having count(*) > 1
    ) duplicate_order
  ) then
    v_blockers := v_blockers || jsonb_build_array('Template ordering must be unique and deterministic.');
  end if;
  if exists (
    select 1 from public.routine_template_tasks task
    where task.version_id = v_version.id and task.organization_id = v_version.organization_id
      and (jsonb_typeof(task.condition_json) <> 'object' or jsonb_typeof(task.metadata) <> 'object')
  ) or exists (
    select 1 from public.routine_template_task_dependencies dependency
    where dependency.version_id = v_version.id and dependency.organization_id = v_version.organization_id
      and jsonb_typeof(dependency.metadata) <> 'object'
  ) or exists (
    select 1 from public.routine_template_task_relations relation
    where relation.version_id = v_version.id and relation.organization_id = v_version.organization_id
      and jsonb_typeof(relation.metadata) <> 'object'
  ) then
    v_blockers := v_blockers || jsonb_build_array('All condition, metadata, source, and schema fields must be JSON objects.');
  end if;
  if not (
    (v_version.state = 'draft' and v_version.content_hash is null and v_version.publication_group_id is null
      and v_version.published_at is null and v_version.published_by_auth_user_id is null
      and v_version.discarded_at is null and v_version.discarded_by_auth_user_id is null and v_version.discard_reason is null)
    or (v_version.state = 'published' and v_version.content_hash is not null and v_version.publication_group_id is not null
      and v_version.published_at is not null and v_version.published_by_auth_user_id is not null)
    or (v_version.state = 'discarded' and v_version.discarded_at is not null
      and v_version.discarded_by_auth_user_id is not null and nullif(trim(v_version.discard_reason), '') is not null)
  ) then
    v_blockers := v_blockers || jsonb_build_array('Version state metadata is inconsistent.');
  end if;

  select jsonb_build_object(
    'sections', (select count(*) from public.routine_template_sections section where section.version_id = v_version.id and section.organization_id = v_version.organization_id),
    'tasks', (select count(*) from public.routine_template_tasks task where task.version_id = v_version.id and task.organization_id = v_version.organization_id),
    'taskItems', (select count(*) from public.routine_template_task_items item where item.version_id = v_version.id and item.organization_id = v_version.organization_id),
    'dependencies', (select count(*) from public.routine_template_task_dependencies dependency where dependency.version_id = v_version.id and dependency.organization_id = v_version.organization_id),
    'relations', (select count(*) from public.routine_template_task_relations relation where relation.version_id = v_version.id and relation.organization_id = v_version.organization_id)
  ) into v_counts;
  return jsonb_build_object(
    'valid', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers,
    'warnings', v_warnings,
    'computed_content_hash', public.routine_template_version_content_hash(v_version.id),
    'counts', v_counts
  );
end;
$$;

create or replace function public.create_routine_template(
  input_routine_key text,
  input_name text,
  input_description text,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_template public.routine_templates%rowtype;
  v_draft public.routine_template_versions%rowtype;
  v_key text := trim(coalesce(input_routine_key, ''));
  v_name text := trim(coalesce(input_name, ''));
  v_description text := nullif(trim(coalesce(input_description, '')), '');
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then raise exception using errcode = '42501', message = 'Manager template permission is required.'; end if;
  if input_idempotency_key is null then raise exception 'A template creation idempotency key is required.'; end if;
  if v_key !~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$' or char_length(v_key) > 80 then raise exception 'Routine key syntax is invalid.'; end if;
  if v_name = '' or char_length(v_name) > 200 then raise exception 'Routine template name is required and cannot exceed 200 characters.'; end if;

  perform pg_advisory_xact_lock(hashtextextended('routine-template-create:' || v_actor.organization_id::text, 0));
  select template.* into v_template
  from public.routine_templates template
  where template.organization_id = v_actor.organization_id
    and template.creation_idempotency_key = input_idempotency_key
  for update;
  if v_template.id is not null then
    if v_template.routine_key is distinct from v_key
       or v_template.name is distinct from v_name
       or v_template.description is distinct from v_description then
      raise exception using errcode = 'P0001', message = 'This template idempotency key was already used with a different request.';
    end if;
    select version.* into v_draft
    from public.routine_template_versions version
    where version.template_id = v_template.id and version.version_number = 1;
    return jsonb_build_object(
      'template', to_jsonb(v_template), 'draft', to_jsonb(v_draft), 'idempotentReplay', true
    );
  end if;
  if exists (
    select 1 from public.routine_templates template
    where template.organization_id = v_actor.organization_id and template.routine_key = v_key
  ) then
    raise exception using errcode = '23505', message = 'A routine template with this key already exists.';
  end if;
  insert into public.routine_templates (
    organization_id, routine_key, name, description, creation_idempotency_key,
    created_by_auth_user_id, updated_by_auth_user_id
  ) values (
    v_actor.organization_id, v_key, v_name, v_description, input_idempotency_key,
    v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
  ) returning * into v_template;
  insert into public.routine_template_versions (
    organization_id, template_id, version_number, state, name, description,
    creation_idempotency_key, created_by_auth_user_id, updated_by_auth_user_id
  ) values (
    v_actor.organization_id, v_template.id, 1, 'draft', v_name, v_description,
    input_idempotency_key, v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
  ) returning * into v_draft;
  return jsonb_build_object(
    'template', to_jsonb(v_template), 'draft', to_jsonb(v_draft), 'idempotentReplay', false
  );
end;
$$;

create or replace function public.create_routine_template_draft(
  input_template_id uuid,
  input_based_on_version_id uuid,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_template public.routine_templates%rowtype;
  v_source public.routine_template_versions%rowtype;
  v_draft public.routine_template_versions%rowtype;
  v_section record;
  v_task record;
  v_item record;
  v_dependency record;
  v_relation record;
  v_new_id uuid;
  v_section_map jsonb := '{}'::jsonb;
  v_task_map jsonb := '{}'::jsonb;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then raise exception using errcode = '42501', message = 'Manager template permission is required.'; end if;
  if input_idempotency_key is null then raise exception 'A draft creation idempotency key is required.'; end if;
  if input_template_id is null then raise exception 'A routine template is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('routine-template-draft:' || input_template_id::text, 0));

  select template.* into v_template
  from public.routine_templates template
  where template.id = input_template_id and template.organization_id = v_actor.organization_id
  for update;
  if v_template.id is null then raise exception 'Routine template was not found in this organization.'; end if;
  select version.* into v_draft
  from public.routine_template_versions version
  where version.organization_id = v_actor.organization_id
    and version.creation_idempotency_key = input_idempotency_key
  for update;
  if v_draft.id is not null then
    if v_draft.template_id is distinct from v_template.id
       or v_draft.based_on_version_id is distinct from input_based_on_version_id then
      raise exception using errcode = 'P0001', message = 'This draft idempotency key was already used with a different request.';
    end if;
    return jsonb_build_object('draft', to_jsonb(v_draft), 'idempotentReplay', true);
  end if;
  if exists (
    select 1 from public.routine_template_versions version
    where version.template_id = v_template.id and version.state = 'draft'
  ) then
    raise exception using errcode = 'P0001', message = 'This routine template already has an active draft.';
  end if;
  if input_based_on_version_id is not null then
    select version.* into v_source
    from public.routine_template_versions version
    where version.id = input_based_on_version_id
      and version.organization_id = v_actor.organization_id
      and version.template_id = v_template.id
      and version.state = 'published'
    for share;
    if v_source.id is null then raise exception 'The selected published base version was not found for this template.'; end if;
  end if;
  insert into public.routine_template_versions (
    organization_id, template_id, version_number, state, based_on_version_id,
    name, description, creation_idempotency_key,
    created_by_auth_user_id, updated_by_auth_user_id
  ) values (
    v_actor.organization_id, v_template.id,
    coalesce((select max(version.version_number) + 1 from public.routine_template_versions version where version.template_id = v_template.id), 1),
    'draft', v_source.id, coalesce(v_source.name, v_template.name),
    case when v_source.id is null then v_template.description else v_source.description end,
    input_idempotency_key, v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
  ) returning * into v_draft;

  if v_source.id is not null then
    for v_section in
      select * from public.routine_template_sections section
      where section.version_id = v_source.id
      order by section.sort_order, section.section_key, section.id
    loop
      v_new_id := gen_random_uuid();
      v_section_map := v_section_map || jsonb_build_object(v_section.id::text, v_new_id::text);
      insert into public.routine_template_sections (
        id, organization_id, version_id, section_key, title, description, phase_type,
        sort_order, active, created_by_auth_user_id, updated_by_auth_user_id
      ) values (
        v_new_id, v_actor.organization_id, v_draft.id, v_section.section_key,
        v_section.title, v_section.description, v_section.phase_type,
        v_section.sort_order, v_section.active,
        v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
      );
    end loop;
    for v_task in
      select * from public.routine_template_tasks task
      where task.version_id = v_source.id
      order by task.section_id, task.sort_order, task.task_key, task.id
    loop
      v_new_id := gen_random_uuid();
      v_task_map := v_task_map || jsonb_build_object(v_task.id::text, v_new_id::text);
      insert into public.routine_template_tasks (
        id, organization_id, version_id, section_id, task_key, title, instructions,
        done_criteria, task_type, criticality, mandatory, initial_assessment_policy,
        completion_policy, not_applicable_policy, verification_policy, repeat_policy,
        availability_mode, condition_json, location_id, location_set_id,
        location_description, visible_day_offset, visible_from_local_time,
        start_day_offset, start_from_local_time, target_day_offset, target_local_time,
        overdue_day_offset, overdue_local_time, hard_deadline_day_offset,
        hard_deadline_local_time, sort_order, active, metadata,
        created_by_auth_user_id, updated_by_auth_user_id
      ) values (
        v_new_id, v_actor.organization_id, v_draft.id,
        (v_section_map->>v_task.section_id::text)::uuid, v_task.task_key, v_task.title,
        v_task.instructions, v_task.done_criteria, v_task.task_type, v_task.criticality,
        v_task.mandatory, v_task.initial_assessment_policy, v_task.completion_policy,
        v_task.not_applicable_policy, v_task.verification_policy, v_task.repeat_policy,
        v_task.availability_mode, v_task.condition_json, v_task.location_id,
        v_task.location_set_id, v_task.location_description, v_task.visible_day_offset,
        v_task.visible_from_local_time, v_task.start_day_offset, v_task.start_from_local_time,
        v_task.target_day_offset, v_task.target_local_time, v_task.overdue_day_offset,
        v_task.overdue_local_time, v_task.hard_deadline_day_offset,
        v_task.hard_deadline_local_time, v_task.sort_order, v_task.active, v_task.metadata,
        v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
      );
    end loop;
    for v_item in
      select * from public.routine_template_task_items item
      where item.version_id = v_source.id
      order by item.task_id, item.sort_order, item.item_key, item.id
    loop
      insert into public.routine_template_task_items (
        organization_id, version_id, task_id, item_key, label, item_type, required,
        source_kind, source_config, standard_id, source_location_set_id, input_schema,
        sort_order, active, metadata, created_by_auth_user_id, updated_by_auth_user_id
      ) values (
        v_actor.organization_id, v_draft.id, (v_task_map->>v_item.task_id::text)::uuid,
        v_item.item_key, v_item.label, v_item.item_type, v_item.required,
        v_item.source_kind, v_item.source_config, v_item.standard_id,
        v_item.source_location_set_id, v_item.input_schema, v_item.sort_order,
        v_item.active, v_item.metadata, v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
      );
    end loop;
    for v_dependency in
      select * from public.routine_template_task_dependencies dependency
      where dependency.version_id = v_source.id order by dependency.id
    loop
      insert into public.routine_template_task_dependencies (
        organization_id, version_id, predecessor_task_id, successor_task_id,
        dependency_type, metadata, created_by_auth_user_id, updated_by_auth_user_id
      ) values (
        v_actor.organization_id, v_draft.id,
        (v_task_map->>v_dependency.predecessor_task_id::text)::uuid,
        (v_task_map->>v_dependency.successor_task_id::text)::uuid,
        v_dependency.dependency_type, v_dependency.metadata,
        v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
      );
    end loop;
    for v_relation in
      select * from public.routine_template_task_relations relation
      where relation.version_id = v_source.id order by relation.id
    loop
      insert into public.routine_template_task_relations (
        organization_id, version_id, source_task_id, target_routine_key,
        target_task_key, relation_type, metadata,
        created_by_auth_user_id, updated_by_auth_user_id
      ) values (
        v_actor.organization_id, v_draft.id,
        (v_task_map->>v_relation.source_task_id::text)::uuid,
        v_relation.target_routine_key, v_relation.target_task_key,
        v_relation.relation_type, v_relation.metadata,
        v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
      );
    end loop;
  end if;
  return jsonb_build_object('draft', to_jsonb(v_draft), 'idempotentReplay', false);
end;
$$;

create or replace function public.update_routine_draft_metadata(
  input_version_id uuid,
  input_name text,
  input_description text,
  input_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_version public.routine_template_versions%rowtype;
  v_name text := trim(coalesce(input_name, ''));
  v_description text := nullif(trim(coalesce(input_description, '')), '');
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then raise exception using errcode = '42501', message = 'Manager template permission is required.'; end if;
  select version.* into v_version from public.routine_template_versions version
  where version.id = input_version_id and version.organization_id = v_actor.organization_id for update;
  if v_version.id is null or v_version.state <> 'draft' then raise exception 'Editable routine template draft was not found.'; end if;
  if input_expected_revision is distinct from v_version.revision then raise exception using errcode = '40001', message = 'Stale routine template version. Refresh before saving.'; end if;
  if v_name = '' or char_length(v_name) > 200 then raise exception 'Draft name is required and cannot exceed 200 characters.'; end if;
  update public.routine_template_versions version
  set name = v_name, description = v_description, revision = version.revision + 1,
      updated_at = now(), updated_by_auth_user_id = v_actor.actor_auth_user_id
  where version.id = v_version.id returning * into v_version;
  return to_jsonb(v_version);
end;
$$;

create or replace function public.upsert_routine_draft_section(
  input_version_id uuid,
  input_section_id uuid,
  input_section_key text,
  input_title text,
  input_description text,
  input_phase_type text,
  input_sort_order integer,
  input_active boolean,
  input_expected_section_revision bigint,
  input_expected_version_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_version public.routine_template_versions%rowtype;
  v_section public.routine_template_sections%rowtype;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then raise exception using errcode = '42501', message = 'Manager template permission is required.'; end if;
  select version.* into v_version from public.routine_template_versions version
  where version.id = input_version_id and version.organization_id = v_actor.organization_id for update;
  if v_version.id is null or v_version.state <> 'draft' then raise exception 'Editable routine template draft was not found.'; end if;
  if input_expected_version_revision is distinct from v_version.revision then raise exception using errcode = '40001', message = 'Stale routine template version. Refresh before saving.'; end if;
  if input_section_id is null then
    if input_expected_section_revision is not null then raise exception 'A new section cannot have an expected revision.'; end if;
    insert into public.routine_template_sections (
      organization_id, version_id, section_key, title, description, phase_type,
      sort_order, active, created_by_auth_user_id, updated_by_auth_user_id
    ) values (
      v_actor.organization_id, v_version.id, trim(input_section_key), trim(input_title),
      nullif(trim(coalesce(input_description, '')), ''), input_phase_type,
      input_sort_order, coalesce(input_active, true),
      v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
    ) returning * into v_section;
  else
    select section.* into v_section from public.routine_template_sections section
    where section.id = input_section_id and section.version_id = v_version.id
      and section.organization_id = v_actor.organization_id for update;
    if v_section.id is null then raise exception 'Draft section was not found.'; end if;
    if input_expected_section_revision is distinct from v_section.revision then raise exception using errcode = '40001', message = 'Stale routine template section. Refresh before saving.'; end if;
    update public.routine_template_sections section
    set section_key = trim(input_section_key), title = trim(input_title),
        description = nullif(trim(coalesce(input_description, '')), ''),
        phase_type = input_phase_type, sort_order = input_sort_order,
        active = coalesce(input_active, true), revision = section.revision + 1,
        updated_at = now(), updated_by_auth_user_id = v_actor.actor_auth_user_id
    where section.id = v_section.id returning * into v_section;
  end if;
  update public.routine_template_versions version
  set revision = version.revision + 1, updated_at = now(), updated_by_auth_user_id = v_actor.actor_auth_user_id
  where version.id = v_version.id returning * into v_version;
  return jsonb_build_object('section', to_jsonb(v_section), 'versionRevision', v_version.revision);
end;
$$;

create or replace function public.reorder_routine_draft_sections(
  input_version_id uuid,
  input_section_ids uuid[],
  input_expected_version_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_version public.routine_template_versions%rowtype;
  v_count integer;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then raise exception using errcode = '42501', message = 'Manager template permission is required.'; end if;
  select version.* into v_version from public.routine_template_versions version
  where version.id = input_version_id and version.organization_id = v_actor.organization_id for update;
  if v_version.id is null or v_version.state <> 'draft' then raise exception 'Editable routine template draft was not found.'; end if;
  if input_expected_version_revision is distinct from v_version.revision then raise exception using errcode = '40001', message = 'Stale routine template version. Refresh before reordering.'; end if;
  select count(*) into v_count from public.routine_template_sections section where section.version_id = v_version.id;
  if input_section_ids is null or cardinality(input_section_ids) <> v_count
     or (select count(distinct id) from unnest(input_section_ids) id) <> v_count
     or exists (select 1 from unnest(input_section_ids) id where not exists (
       select 1 from public.routine_template_sections section where section.id = id and section.version_id = v_version.id and section.organization_id = v_actor.organization_id
     )) then
    raise exception 'Section reorder requires the exact complete list of this draft''s section IDs.';
  end if;
  set constraints public.routine_template_sections_sort_unique deferred;
  update public.routine_template_sections section
  set sort_order = ordered.ordinality - 1, revision = section.revision + 1,
      updated_at = now(), updated_by_auth_user_id = v_actor.actor_auth_user_id
  from unnest(input_section_ids) with ordinality ordered(id, ordinality)
  where section.id = ordered.id and section.version_id = v_version.id;
  update public.routine_template_versions version
  set revision = version.revision + 1, updated_at = now(), updated_by_auth_user_id = v_actor.actor_auth_user_id
  where version.id = v_version.id returning * into v_version;
  return jsonb_build_object('versionId', v_version.id, 'revision', v_version.revision, 'sectionIds', to_jsonb(input_section_ids));
end;
$$;

create or replace function public.upsert_routine_draft_task(
  input_version_id uuid,
  input_section_id uuid,
  input_task_id uuid,
  input_task jsonb,
  input_expected_task_revision bigint,
  input_expected_version_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_version public.routine_template_versions%rowtype;
  v_task public.routine_template_tasks%rowtype;
  v_section public.routine_template_sections%rowtype;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then raise exception using errcode = '42501', message = 'Manager template permission is required.'; end if;
  if input_task is null or jsonb_typeof(input_task) <> 'object' then raise exception 'Task input must be a JSON object.'; end if;
  select version.* into v_version from public.routine_template_versions version
  where version.id = input_version_id and version.organization_id = v_actor.organization_id for update;
  if v_version.id is null or v_version.state <> 'draft' then raise exception 'Editable routine template draft was not found.'; end if;
  if input_expected_version_revision is distinct from v_version.revision then raise exception using errcode = '40001', message = 'Stale routine template version. Refresh before saving.'; end if;
  select section.* into v_section from public.routine_template_sections section
  where section.id = input_section_id and section.version_id = v_version.id
    and section.organization_id = v_actor.organization_id for share;
  if v_section.id is null then raise exception 'Draft section was not found.'; end if;
  if input_task_id is null then
    if input_expected_task_revision is not null then raise exception 'A new task cannot have an expected revision.'; end if;
    insert into public.routine_template_tasks (
      organization_id, version_id, section_id, task_key, title, instructions,
      done_criteria, task_type, criticality, mandatory, initial_assessment_policy,
      completion_policy, not_applicable_policy, verification_policy, repeat_policy,
      availability_mode, condition_json, location_id, location_set_id,
      location_description, visible_day_offset, visible_from_local_time,
      start_day_offset, start_from_local_time, target_day_offset, target_local_time,
      overdue_day_offset, overdue_local_time, hard_deadline_day_offset,
      hard_deadline_local_time, sort_order, active, metadata,
      created_by_auth_user_id, updated_by_auth_user_id
    ) values (
      v_actor.organization_id, v_version.id, v_section.id,
      trim(coalesce(input_task->>'taskKey', '')), trim(coalesce(input_task->>'title', '')),
      nullif(trim(coalesce(input_task->>'instructions', '')), ''),
      nullif(trim(coalesce(input_task->>'doneCriteria', '')), ''),
      coalesce(nullif(input_task->>'taskType', ''), 'action'),
      coalesce(nullif(input_task->>'criticality', ''), 'normal'),
      coalesce((input_task->>'mandatory')::boolean, true),
      coalesce(nullif(input_task->>'initialAssessmentPolicy', ''), 'none'),
      coalesce(nullif(input_task->>'completionPolicy', ''), 'standard_required'),
      coalesce(nullif(input_task->>'notApplicablePolicy', ''), 'forbidden'),
      coalesce(nullif(input_task->>'verificationPolicy', ''), 'none'),
      coalesce(nullif(input_task->>'repeatPolicy', ''), 'once_per_run'),
      coalesce(nullif(input_task->>'availabilityMode', ''), 'immediate'),
      coalesce(input_task->'condition', '{}'::jsonb),
      nullif(input_task->>'locationId', '')::uuid,
      nullif(input_task->>'locationSetId', '')::uuid,
      nullif(trim(coalesce(input_task->>'locationDescription', '')), ''),
      coalesce((input_task->>'visibleDayOffset')::integer, 0),
      nullif(input_task->>'visibleFromLocalTime', '')::time,
      coalesce((input_task->>'startDayOffset')::integer, 0),
      nullif(input_task->>'startFromLocalTime', '')::time,
      coalesce((input_task->>'targetDayOffset')::integer, 0),
      nullif(input_task->>'targetLocalTime', '')::time,
      coalesce((input_task->>'overdueDayOffset')::integer, 0),
      nullif(input_task->>'overdueLocalTime', '')::time,
      coalesce((input_task->>'hardDeadlineDayOffset')::integer, 0),
      nullif(input_task->>'hardDeadlineLocalTime', '')::time,
      coalesce((input_task->>'sortOrder')::integer, 0),
      coalesce((input_task->>'active')::boolean, true), coalesce(input_task->'metadata', '{}'::jsonb),
      v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
    ) returning * into v_task;
  else
    select task.* into v_task from public.routine_template_tasks task
    where task.id = input_task_id and task.version_id = v_version.id
      and task.organization_id = v_actor.organization_id for update;
    if v_task.id is null then raise exception 'Draft task was not found.'; end if;
    if input_expected_task_revision is distinct from v_task.revision then raise exception using errcode = '40001', message = 'Stale routine template task. Refresh before saving.'; end if;
    update public.routine_template_tasks task set
      section_id = v_section.id,
      task_key = trim(coalesce(input_task->>'taskKey', '')),
      title = trim(coalesce(input_task->>'title', '')),
      instructions = nullif(trim(coalesce(input_task->>'instructions', '')), ''),
      done_criteria = nullif(trim(coalesce(input_task->>'doneCriteria', '')), ''),
      task_type = coalesce(nullif(input_task->>'taskType', ''), 'action'),
      criticality = coalesce(nullif(input_task->>'criticality', ''), 'normal'),
      mandatory = coalesce((input_task->>'mandatory')::boolean, true),
      initial_assessment_policy = coalesce(nullif(input_task->>'initialAssessmentPolicy', ''), 'none'),
      completion_policy = coalesce(nullif(input_task->>'completionPolicy', ''), 'standard_required'),
      not_applicable_policy = coalesce(nullif(input_task->>'notApplicablePolicy', ''), 'forbidden'),
      verification_policy = coalesce(nullif(input_task->>'verificationPolicy', ''), 'none'),
      repeat_policy = coalesce(nullif(input_task->>'repeatPolicy', ''), 'once_per_run'),
      availability_mode = coalesce(nullif(input_task->>'availabilityMode', ''), 'immediate'),
      condition_json = coalesce(input_task->'condition', '{}'::jsonb),
      location_id = nullif(input_task->>'locationId', '')::uuid,
      location_set_id = nullif(input_task->>'locationSetId', '')::uuid,
      location_description = nullif(trim(coalesce(input_task->>'locationDescription', '')), ''),
      visible_day_offset = coalesce((input_task->>'visibleDayOffset')::integer, 0),
      visible_from_local_time = nullif(input_task->>'visibleFromLocalTime', '')::time,
      start_day_offset = coalesce((input_task->>'startDayOffset')::integer, 0),
      start_from_local_time = nullif(input_task->>'startFromLocalTime', '')::time,
      target_day_offset = coalesce((input_task->>'targetDayOffset')::integer, 0),
      target_local_time = nullif(input_task->>'targetLocalTime', '')::time,
      overdue_day_offset = coalesce((input_task->>'overdueDayOffset')::integer, 0),
      overdue_local_time = nullif(input_task->>'overdueLocalTime', '')::time,
      hard_deadline_day_offset = coalesce((input_task->>'hardDeadlineDayOffset')::integer, 0),
      hard_deadline_local_time = nullif(input_task->>'hardDeadlineLocalTime', '')::time,
      sort_order = coalesce((input_task->>'sortOrder')::integer, 0),
      active = coalesce((input_task->>'active')::boolean, true),
      metadata = coalesce(input_task->'metadata', '{}'::jsonb),
      revision = task.revision + 1, updated_at = now(), updated_by_auth_user_id = v_actor.actor_auth_user_id
    where task.id = v_task.id returning * into v_task;
  end if;
  update public.routine_template_versions version
  set revision = version.revision + 1, updated_at = now(), updated_by_auth_user_id = v_actor.actor_auth_user_id
  where version.id = v_version.id returning * into v_version;
  return jsonb_build_object('task', to_jsonb(v_task), 'versionRevision', v_version.revision);
end;
$$;

create or replace function public.reorder_routine_draft_tasks(
  input_section_id uuid,
  input_task_ids uuid[],
  input_expected_version_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_section public.routine_template_sections%rowtype;
  v_version public.routine_template_versions%rowtype;
  v_count integer;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then raise exception using errcode = '42501', message = 'Manager template permission is required.'; end if;
  select section.* into v_section from public.routine_template_sections section
  where section.id = input_section_id and section.organization_id = v_actor.organization_id;
  if v_section.id is null then raise exception 'Draft section was not found.'; end if;
  select version.* into v_version from public.routine_template_versions version
  where version.id = v_section.version_id and version.organization_id = v_actor.organization_id for update;
  if v_version.state <> 'draft' then raise exception 'Editable routine template draft was not found.'; end if;
  if input_expected_version_revision is distinct from v_version.revision then raise exception using errcode = '40001', message = 'Stale routine template version. Refresh before reordering.'; end if;
  select count(*) into v_count from public.routine_template_tasks task where task.section_id = v_section.id;
  if input_task_ids is null or cardinality(input_task_ids) <> v_count
     or (select count(distinct id) from unnest(input_task_ids) id) <> v_count
     or exists (select 1 from unnest(input_task_ids) id where not exists (
       select 1 from public.routine_template_tasks task where task.id = id and task.section_id = v_section.id and task.version_id = v_version.id
     )) then raise exception 'Task reorder requires the exact complete list of this section''s task IDs.'; end if;
  set constraints public.routine_template_tasks_section_sort_unique deferred;
  update public.routine_template_tasks task
  set sort_order = ordered.ordinality - 1, revision = task.revision + 1,
      updated_at = now(), updated_by_auth_user_id = v_actor.actor_auth_user_id
  from unnest(input_task_ids) with ordinality ordered(id, ordinality)
  where task.id = ordered.id and task.section_id = v_section.id;
  update public.routine_template_versions version
  set revision = version.revision + 1, updated_at = now(), updated_by_auth_user_id = v_actor.actor_auth_user_id
  where version.id = v_version.id returning * into v_version;
  return jsonb_build_object('versionId', v_version.id, 'revision', v_version.revision, 'taskIds', to_jsonb(input_task_ids));
end;
$$;

create or replace function public.upsert_routine_draft_task_item(
  input_version_id uuid,
  input_task_id uuid,
  input_item_id uuid,
  input_item jsonb,
  input_expected_item_revision bigint,
  input_expected_version_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_version public.routine_template_versions%rowtype;
  v_task public.routine_template_tasks%rowtype;
  v_item public.routine_template_task_items%rowtype;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then raise exception using errcode = '42501', message = 'Manager template permission is required.'; end if;
  if input_item is null or jsonb_typeof(input_item) <> 'object' then raise exception 'Task item input must be a JSON object.'; end if;
  select version.* into v_version from public.routine_template_versions version
  where version.id = input_version_id and version.organization_id = v_actor.organization_id for update;
  if v_version.id is null or v_version.state <> 'draft' then raise exception 'Editable routine template draft was not found.'; end if;
  if input_expected_version_revision is distinct from v_version.revision then raise exception using errcode = '40001', message = 'Stale routine template version. Refresh before saving.'; end if;
  select task.* into v_task from public.routine_template_tasks task
  where task.id = input_task_id and task.version_id = v_version.id and task.organization_id = v_actor.organization_id for share;
  if v_task.id is null then raise exception 'Draft task was not found.'; end if;
  if input_item_id is null then
    if input_expected_item_revision is not null then raise exception 'A new task item cannot have an expected revision.'; end if;
    insert into public.routine_template_task_items (
      organization_id, version_id, task_id, item_key, label, item_type, required,
      source_kind, source_config, standard_id, source_location_set_id, input_schema,
      sort_order, active, metadata, created_by_auth_user_id, updated_by_auth_user_id
    ) values (
      v_actor.organization_id, v_version.id, v_task.id,
      trim(coalesce(input_item->>'itemKey', '')), trim(coalesce(input_item->>'label', '')),
      coalesce(nullif(input_item->>'itemType', ''), 'check'),
      coalesce((input_item->>'required')::boolean, true),
      coalesce(nullif(input_item->>'sourceKind', ''), 'static'),
      coalesce(input_item->'sourceConfig', '{}'::jsonb),
      nullif(input_item->>'standardId', '')::uuid,
      nullif(input_item->>'sourceLocationSetId', '')::uuid,
      coalesce(input_item->'inputSchema', '{}'::jsonb),
      coalesce((input_item->>'sortOrder')::integer, 0),
      coalesce((input_item->>'active')::boolean, true),
      coalesce(input_item->'metadata', '{}'::jsonb),
      v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
    ) returning * into v_item;
  else
    select item.* into v_item from public.routine_template_task_items item
    where item.id = input_item_id and item.task_id = v_task.id and item.version_id = v_version.id for update;
    if v_item.id is null then raise exception 'Draft task item was not found.'; end if;
    if input_expected_item_revision is distinct from v_item.revision then raise exception using errcode = '40001', message = 'Stale routine template task item. Refresh before saving.'; end if;
    update public.routine_template_task_items item set
      item_key = trim(coalesce(input_item->>'itemKey', '')),
      label = trim(coalesce(input_item->>'label', '')),
      item_type = coalesce(nullif(input_item->>'itemType', ''), 'check'),
      required = coalesce((input_item->>'required')::boolean, true),
      source_kind = coalesce(nullif(input_item->>'sourceKind', ''), 'static'),
      source_config = coalesce(input_item->'sourceConfig', '{}'::jsonb),
      standard_id = nullif(input_item->>'standardId', '')::uuid,
      source_location_set_id = nullif(input_item->>'sourceLocationSetId', '')::uuid,
      input_schema = coalesce(input_item->'inputSchema', '{}'::jsonb),
      sort_order = coalesce((input_item->>'sortOrder')::integer, 0),
      active = coalesce((input_item->>'active')::boolean, true),
      metadata = coalesce(input_item->'metadata', '{}'::jsonb),
      revision = item.revision + 1, updated_at = now(), updated_by_auth_user_id = v_actor.actor_auth_user_id
    where item.id = v_item.id returning * into v_item;
  end if;
  update public.routine_template_versions version
  set revision = version.revision + 1, updated_at = now(), updated_by_auth_user_id = v_actor.actor_auth_user_id
  where version.id = v_version.id returning * into v_version;
  return jsonb_build_object('item', to_jsonb(v_item), 'versionRevision', v_version.revision);
end;
$$;

create or replace function public.reorder_routine_draft_task_items(
  input_task_id uuid,
  input_item_ids uuid[],
  input_expected_version_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_task public.routine_template_tasks%rowtype;
  v_version public.routine_template_versions%rowtype;
  v_count integer;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then raise exception using errcode = '42501', message = 'Manager template permission is required.'; end if;
  select task.* into v_task from public.routine_template_tasks task
  where task.id = input_task_id and task.organization_id = v_actor.organization_id;
  if v_task.id is null then raise exception 'Draft task was not found.'; end if;
  select version.* into v_version from public.routine_template_versions version
  where version.id = v_task.version_id and version.organization_id = v_actor.organization_id for update;
  if v_version.state <> 'draft' then raise exception 'Editable routine template draft was not found.'; end if;
  if input_expected_version_revision is distinct from v_version.revision then raise exception using errcode = '40001', message = 'Stale routine template version. Refresh before reordering.'; end if;
  select count(*) into v_count from public.routine_template_task_items item where item.task_id = v_task.id;
  if input_item_ids is null or cardinality(input_item_ids) <> v_count
     or (select count(distinct id) from unnest(input_item_ids) id) <> v_count
     or exists (select 1 from unnest(input_item_ids) id where not exists (
       select 1 from public.routine_template_task_items item where item.id = id and item.task_id = v_task.id and item.version_id = v_version.id
     )) then raise exception 'Task item reorder requires the exact complete list of this task''s item IDs.'; end if;
  set constraints public.routine_template_task_items_sort_unique deferred;
  update public.routine_template_task_items item
  set sort_order = ordered.ordinality - 1, revision = item.revision + 1,
      updated_at = now(), updated_by_auth_user_id = v_actor.actor_auth_user_id
  from unnest(input_item_ids) with ordinality ordered(id, ordinality)
  where item.id = ordered.id and item.task_id = v_task.id;
  update public.routine_template_versions version
  set revision = version.revision + 1, updated_at = now(), updated_by_auth_user_id = v_actor.actor_auth_user_id
  where version.id = v_version.id returning * into v_version;
  return jsonb_build_object('versionId', v_version.id, 'revision', v_version.revision, 'itemIds', to_jsonb(input_item_ids));
end;
$$;

create or replace function public.replace_routine_draft_dependencies(
  input_version_id uuid,
  input_dependencies jsonb,
  input_expected_version_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_version public.routine_template_versions%rowtype;
  v_dependency jsonb;
  v_count integer := 0;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then raise exception using errcode = '42501', message = 'Manager template permission is required.'; end if;
  if input_dependencies is null or jsonb_typeof(input_dependencies) <> 'array' or jsonb_array_length(input_dependencies) > 2000 then
    raise exception 'Dependencies must be a JSON array with at most 2000 entries.';
  end if;
  select version.* into v_version from public.routine_template_versions version
  where version.id = input_version_id and version.organization_id = v_actor.organization_id for update;
  if v_version.id is null or v_version.state <> 'draft' then raise exception 'Editable routine template draft was not found.'; end if;
  if input_expected_version_revision is distinct from v_version.revision then raise exception using errcode = '40001', message = 'Stale routine template version. Refresh before replacing dependencies.'; end if;
  perform set_config('app.routine_template_child_delete', 'authorized', true);
  delete from public.routine_template_task_dependencies dependency where dependency.version_id = v_version.id;
  for v_dependency in select value from jsonb_array_elements(input_dependencies)
  loop
    if jsonb_typeof(v_dependency) <> 'object' then raise exception 'Every dependency must be a JSON object.'; end if;
    insert into public.routine_template_task_dependencies (
      organization_id, version_id, predecessor_task_id, successor_task_id,
      dependency_type, metadata, created_by_auth_user_id, updated_by_auth_user_id
    ) values (
      v_actor.organization_id, v_version.id,
      nullif(v_dependency->>'predecessorTaskId', '')::uuid,
      nullif(v_dependency->>'successorTaskId', '')::uuid,
      v_dependency->>'dependencyType', coalesce(v_dependency->'metadata', '{}'::jsonb),
      v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
    );
    v_count := v_count + 1;
  end loop;
  update public.routine_template_versions version
  set revision = version.revision + 1, updated_at = now(), updated_by_auth_user_id = v_actor.actor_auth_user_id
  where version.id = v_version.id returning * into v_version;
  return jsonb_build_object('versionId', v_version.id, 'revision', v_version.revision, 'dependencyCount', v_count);
end;
$$;

create or replace function public.replace_routine_draft_relations(
  input_version_id uuid,
  input_relations jsonb,
  input_expected_version_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_version public.routine_template_versions%rowtype;
  v_relation jsonb;
  v_count integer := 0;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then raise exception using errcode = '42501', message = 'Manager template permission is required.'; end if;
  if input_relations is null or jsonb_typeof(input_relations) <> 'array' or jsonb_array_length(input_relations) > 2000 then
    raise exception 'Relations must be a JSON array with at most 2000 entries.';
  end if;
  select version.* into v_version from public.routine_template_versions version
  where version.id = input_version_id and version.organization_id = v_actor.organization_id for update;
  if v_version.id is null or v_version.state <> 'draft' then raise exception 'Editable routine template draft was not found.'; end if;
  if input_expected_version_revision is distinct from v_version.revision then raise exception using errcode = '40001', message = 'Stale routine template version. Refresh before replacing relations.'; end if;
  perform set_config('app.routine_template_child_delete', 'authorized', true);
  delete from public.routine_template_task_relations relation where relation.version_id = v_version.id;
  for v_relation in select value from jsonb_array_elements(input_relations)
  loop
    if jsonb_typeof(v_relation) <> 'object' then raise exception 'Every relation must be a JSON object.'; end if;
    insert into public.routine_template_task_relations (
      organization_id, version_id, source_task_id, target_routine_key,
      target_task_key, relation_type, metadata,
      created_by_auth_user_id, updated_by_auth_user_id
    ) values (
      v_actor.organization_id, v_version.id,
      nullif(v_relation->>'sourceTaskId', '')::uuid,
      trim(coalesce(v_relation->>'targetRoutineKey', '')),
      trim(coalesce(v_relation->>'targetTaskKey', '')),
      v_relation->>'relationType', coalesce(v_relation->'metadata', '{}'::jsonb),
      v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
    );
    v_count := v_count + 1;
  end loop;
  update public.routine_template_versions version
  set revision = version.revision + 1, updated_at = now(), updated_by_auth_user_id = v_actor.actor_auth_user_id
  where version.id = v_version.id returning * into v_version;
  return jsonb_build_object('versionId', v_version.id, 'revision', v_version.revision, 'relationCount', v_count);
end;
$$;

create or replace function public.discard_routine_template_draft(
  input_version_id uuid,
  input_reason text,
  input_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_version public.routine_template_versions%rowtype;
  v_reason text := nullif(trim(coalesce(input_reason, '')), '');
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then raise exception using errcode = '42501', message = 'Manager template permission is required.'; end if;
  if v_reason is null or char_length(v_reason) > 2000 then raise exception 'A discard reason is required and cannot exceed 2000 characters.'; end if;
  select version.* into v_version from public.routine_template_versions version
  where version.id = input_version_id and version.organization_id = v_actor.organization_id for update;
  if v_version.id is null or v_version.state <> 'draft' then raise exception 'Discardable routine template draft was not found.'; end if;
  if input_expected_revision is distinct from v_version.revision then raise exception using errcode = '40001', message = 'Stale routine template version. Refresh before discarding.'; end if;
  perform set_config('app.routine_template_lifecycle_transition', 'authorized', true);
  update public.routine_template_versions version
  set state = 'discarded', discarded_at = now(), discarded_by_auth_user_id = v_actor.actor_auth_user_id,
      discard_reason = v_reason, revision = version.revision + 1,
      updated_at = now(), updated_by_auth_user_id = v_actor.actor_auth_user_id
  where version.id = v_version.id returning * into v_version;
  return to_jsonb(v_version);
end;
$$;

create or replace function public.publish_routine_template_versions(
  input_version_ids uuid[],
  input_expected_revisions jsonb,
  input_publish_note text,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_version_id uuid;
  v_version public.routine_template_versions%rowtype;
  v_batch public.routine_template_publication_batches%rowtype;
  v_validation jsonb;
  v_version_ids uuid[];
  v_note text := nullif(trim(coalesce(input_publish_note, '')), '');
  v_request_hash text;
  v_group_id uuid := gen_random_uuid();
  v_response jsonb;
  v_expected bigint;
  v_count integer;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then raise exception using errcode = '42501', message = 'Manager template permission is required.'; end if;
  if input_idempotency_key is null then raise exception 'A publication idempotency key is required.'; end if;
  if input_version_ids is null or cardinality(input_version_ids) = 0 or cardinality(input_version_ids) > 100 then
    raise exception 'Publish between one and 100 routine template versions.';
  end if;
  if exists (select 1 from unnest(input_version_ids) id where id is null)
     or (select count(distinct id) from unnest(input_version_ids) id) <> cardinality(input_version_ids) then
    raise exception 'Publication version IDs must be non-null and unique.';
  end if;
  if input_expected_revisions is null or jsonb_typeof(input_expected_revisions) <> 'object' then
    raise exception 'Expected publication revisions must be a JSON object.';
  end if;
  if v_note is not null and char_length(v_note) > 2000 then raise exception 'Publish note cannot exceed 2000 characters.'; end if;
  select array_agg(id order by id) into v_version_ids from unnest(input_version_ids) id;
  if (select count(*) from jsonb_object_keys(input_expected_revisions)) <> cardinality(v_version_ids)
     or exists (select 1 from unnest(v_version_ids) id where not (input_expected_revisions ? id::text)) then
    raise exception 'Expected publication revisions must contain exactly one entry for every version.';
  end if;
  begin
    for v_version_id in select id from unnest(v_version_ids) id
    loop
      v_expected := (input_expected_revisions->>v_version_id::text)::bigint;
      if v_expected <= 0 then raise exception 'Expected publication revisions must be positive integers.'; end if;
    end loop;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Expected publication revisions must be positive integers.';
  end;
  v_request_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'versionIds', to_jsonb(v_version_ids), 'expectedRevisions', input_expected_revisions,
    'publishNote', v_note
  )::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(
    'routine-template-publish:' || v_actor.organization_id::text || ':' || input_idempotency_key::text, 0
  ));
  select batch.* into v_batch
  from public.routine_template_publication_batches batch
  where batch.organization_id = v_actor.organization_id and batch.idempotency_key = input_idempotency_key;
  if v_batch.id is not null then
    if v_batch.request_hash is distinct from v_request_hash then
      raise exception using errcode = 'P0001', message = 'This publication idempotency key was already used with a different request.';
    end if;
    return v_batch.response_payload || jsonb_build_object('idempotentReplay', true);
  end if;

  perform template.id
  from public.routine_templates template
  join public.routine_template_versions version
    on version.template_id = template.id and version.organization_id = template.organization_id
  where version.id = any(v_version_ids) and template.organization_id = v_actor.organization_id
  order by template.id
  for update of template;
  perform version.id
  from public.routine_template_versions version
  where version.id = any(v_version_ids) and version.organization_id = v_actor.organization_id
  order by version.id
  for update;
  select count(*) into v_count
  from public.routine_template_versions version
  where version.id = any(v_version_ids) and version.organization_id = v_actor.organization_id;
  if v_count <> cardinality(v_version_ids) then raise exception 'Every publication version must belong to this organization.'; end if;
  if exists (
    select 1 from public.routine_template_versions version
    where version.id = any(v_version_ids) and version.state <> 'draft'
  ) then raise exception using errcode = 'P0001', message = 'Every publication version must still be a draft.'; end if;
  if exists (
    select 1 from public.routine_template_versions version
    where version.id = any(v_version_ids)
    group by version.template_id having count(*) > 1
  ) then raise exception 'A publication batch cannot contain two versions of the same template.'; end if;
  for v_version_id in select id from unnest(v_version_ids) id order by id
  loop
    select version.* into v_version from public.routine_template_versions version where version.id = v_version_id;
    v_expected := (input_expected_revisions->>v_version_id::text)::bigint;
    if v_version.revision is distinct from v_expected then
      raise exception using errcode = '40001', message = 'Stale routine template version. Refresh before publishing.';
    end if;
    v_validation := public.validate_routine_template_version(v_version.id, v_version_ids);
    if not coalesce((v_validation->>'valid')::boolean, false) then
      raise exception using errcode = 'P0001', message = 'Routine template publication validation failed: ' || (v_validation->'blockers')::text;
    end if;
  end loop;

  perform set_config('app.routine_template_lifecycle_transition', 'authorized', true);
  update public.routine_template_versions version
  set state = 'published', content_hash = public.routine_template_version_content_hash(version.id),
      publication_group_id = v_group_id, publish_note = v_note,
      published_at = now(), published_by_auth_user_id = v_actor.actor_auth_user_id,
      revision = version.revision + 1, updated_at = now(),
      updated_by_auth_user_id = v_actor.actor_auth_user_id
  where version.id = any(v_version_ids) and version.organization_id = v_actor.organization_id;

  update public.routine_templates template
  set current_published_version_id = version.id, name = version.name,
      description = version.description, revision = template.revision + 1,
      updated_at = now(), updated_by_auth_user_id = v_actor.actor_auth_user_id
  from public.routine_template_versions version
  where version.id = any(v_version_ids)
    and version.template_id = template.id
    and version.organization_id = template.organization_id;

  select jsonb_build_object(
    'publicationGroupId', v_group_id,
    'versions', jsonb_agg(jsonb_build_object(
      'versionId', version.id, 'templateId', version.template_id,
      'versionNumber', version.version_number, 'contentHash', version.content_hash,
      'revision', version.revision
    ) order by version.id),
    'idempotentReplay', false
  ) into v_response
  from public.routine_template_versions version
  where version.id = any(v_version_ids);
  insert into public.routine_template_publication_batches (
    organization_id, idempotency_key, request_hash, publication_group_id,
    version_ids, response_payload, publish_note, created_by_auth_user_id
  ) values (
    v_actor.organization_id, input_idempotency_key, v_request_hash, v_group_id,
    v_version_ids, v_response, v_note, v_actor.actor_auth_user_id
  );
  return v_response;
end;
$$;

create or replace function public.routine_template_version_is_current_published(
  input_version_id uuid,
  input_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.routine_template_versions version
    join public.routine_templates template
      on template.id = version.template_id and template.organization_id = version.organization_id
    where version.id = input_version_id
      and version.organization_id = input_organization_id
      and version.state = 'published'
      and template.active
      and template.current_published_version_id = version.id
  );
$$;

alter table public.routine_templates enable row level security;
alter table public.routine_template_versions enable row level security;
alter table public.routine_template_sections enable row level security;
alter table public.routine_template_tasks enable row level security;
alter table public.routine_template_task_items enable row level security;
alter table public.routine_template_task_dependencies enable row level security;
alter table public.routine_template_task_relations enable row level security;
alter table public.routine_template_publication_batches enable row level security;

drop policy if exists routine_templates_read on public.routine_templates;
create policy routine_templates_read
on public.routine_templates for select to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and (
    (select public.routine_current_user_can_manage_templates())
    or (
      (select public.routine_current_user_can_perform_tasks())
      and active and current_published_version_id is not null
    )
  )
);

drop policy if exists routine_template_versions_read on public.routine_template_versions;
create policy routine_template_versions_read
on public.routine_template_versions for select to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and (
    (select public.routine_current_user_can_manage_templates())
    or (
      (select public.routine_current_user_can_perform_tasks())
      and public.routine_template_version_is_current_published(id, organization_id)
    )
  )
);

drop policy if exists routine_template_sections_read on public.routine_template_sections;
create policy routine_template_sections_read
on public.routine_template_sections for select to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and (
    (select public.routine_current_user_can_manage_templates())
    or (
      (select public.routine_current_user_can_perform_tasks())
      and public.routine_template_version_is_current_published(version_id, organization_id)
    )
  )
);

drop policy if exists routine_template_tasks_read on public.routine_template_tasks;
create policy routine_template_tasks_read
on public.routine_template_tasks for select to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and (
    (select public.routine_current_user_can_manage_templates())
    or (
      (select public.routine_current_user_can_perform_tasks())
      and public.routine_template_version_is_current_published(version_id, organization_id)
    )
  )
);

drop policy if exists routine_template_task_items_read on public.routine_template_task_items;
create policy routine_template_task_items_read
on public.routine_template_task_items for select to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and (
    (select public.routine_current_user_can_manage_templates())
    or (
      (select public.routine_current_user_can_perform_tasks())
      and public.routine_template_version_is_current_published(version_id, organization_id)
    )
  )
);

drop policy if exists routine_template_task_dependencies_read on public.routine_template_task_dependencies;
create policy routine_template_task_dependencies_read
on public.routine_template_task_dependencies for select to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and (
    (select public.routine_current_user_can_manage_templates())
    or (
      (select public.routine_current_user_can_perform_tasks())
      and public.routine_template_version_is_current_published(version_id, organization_id)
    )
  )
);

drop policy if exists routine_template_task_relations_read on public.routine_template_task_relations;
create policy routine_template_task_relations_read
on public.routine_template_task_relations for select to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and (
    (select public.routine_current_user_can_manage_templates())
    or (
      (select public.routine_current_user_can_perform_tasks())
      and public.routine_template_version_is_current_published(version_id, organization_id)
    )
  )
);

drop policy if exists routine_template_publication_batches_manager_read on public.routine_template_publication_batches;
create policy routine_template_publication_batches_manager_read
on public.routine_template_publication_batches for select to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and (select public.routine_current_user_can_manage_templates())
);

revoke all privileges on table public.routine_templates from public, anon, authenticated;
revoke all privileges on table public.routine_template_versions from public, anon, authenticated;
revoke all privileges on table public.routine_template_sections from public, anon, authenticated;
revoke all privileges on table public.routine_template_tasks from public, anon, authenticated;
revoke all privileges on table public.routine_template_task_items from public, anon, authenticated;
revoke all privileges on table public.routine_template_task_dependencies from public, anon, authenticated;
revoke all privileges on table public.routine_template_task_relations from public, anon, authenticated;
revoke all privileges on table public.routine_template_publication_batches from public, anon, authenticated;

grant select on table public.routine_templates to authenticated;
grant select on table public.routine_template_versions to authenticated;
grant select on table public.routine_template_sections to authenticated;
grant select on table public.routine_template_tasks to authenticated;
grant select on table public.routine_template_task_items to authenticated;
grant select on table public.routine_template_task_dependencies to authenticated;
grant select on table public.routine_template_task_relations to authenticated;
grant select on table public.routine_template_publication_batches to authenticated;

revoke all on function public.routine_validate_condition_json(jsonb, integer) from public, anon, authenticated;
revoke all on function public.routine_template_version_guard() from public, anon, authenticated;
revoke all on function public.routine_template_child_guard() from public, anon, authenticated;
revoke all on function public.routine_template_publication_batch_guard() from public, anon, authenticated;
revoke all on function public.routine_template_version_canonical_json(uuid) from public, anon, authenticated;
revoke all on function public.routine_template_version_content_hash(uuid) from public, anon, authenticated;
revoke all on function public.routine_template_version_is_current_published(uuid, uuid) from public, anon, authenticated;
revoke all on function public.validate_routine_template_version(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.create_routine_template(text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.create_routine_template_draft(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.update_routine_draft_metadata(uuid, text, text, bigint) from public, anon, authenticated;
revoke all on function public.upsert_routine_draft_section(uuid, uuid, text, text, text, text, integer, boolean, bigint, bigint) from public, anon, authenticated;
revoke all on function public.reorder_routine_draft_sections(uuid, uuid[], bigint) from public, anon, authenticated;
revoke all on function public.upsert_routine_draft_task(uuid, uuid, uuid, jsonb, bigint, bigint) from public, anon, authenticated;
revoke all on function public.reorder_routine_draft_tasks(uuid, uuid[], bigint) from public, anon, authenticated;
revoke all on function public.upsert_routine_draft_task_item(uuid, uuid, uuid, jsonb, bigint, bigint) from public, anon, authenticated;
revoke all on function public.reorder_routine_draft_task_items(uuid, uuid[], bigint) from public, anon, authenticated;
revoke all on function public.replace_routine_draft_dependencies(uuid, jsonb, bigint) from public, anon, authenticated;
revoke all on function public.replace_routine_draft_relations(uuid, jsonb, bigint) from public, anon, authenticated;
revoke all on function public.discard_routine_template_draft(uuid, text, bigint) from public, anon, authenticated;
revoke all on function public.publish_routine_template_versions(uuid[], jsonb, text, uuid) from public, anon, authenticated;

grant execute on function public.validate_routine_template_version(uuid, uuid[]) to authenticated;
grant execute on function public.routine_template_version_is_current_published(uuid, uuid) to authenticated;
grant execute on function public.create_routine_template(text, text, text, uuid) to authenticated;
grant execute on function public.create_routine_template_draft(uuid, uuid, uuid) to authenticated;
grant execute on function public.update_routine_draft_metadata(uuid, text, text, bigint) to authenticated;
grant execute on function public.upsert_routine_draft_section(uuid, uuid, text, text, text, text, integer, boolean, bigint, bigint) to authenticated;
grant execute on function public.reorder_routine_draft_sections(uuid, uuid[], bigint) to authenticated;
grant execute on function public.upsert_routine_draft_task(uuid, uuid, uuid, jsonb, bigint, bigint) to authenticated;
grant execute on function public.reorder_routine_draft_tasks(uuid, uuid[], bigint) to authenticated;
grant execute on function public.upsert_routine_draft_task_item(uuid, uuid, uuid, jsonb, bigint, bigint) to authenticated;
grant execute on function public.reorder_routine_draft_task_items(uuid, uuid[], bigint) to authenticated;
grant execute on function public.replace_routine_draft_dependencies(uuid, jsonb, bigint) to authenticated;
grant execute on function public.replace_routine_draft_relations(uuid, jsonb, bigint) to authenticated;
grant execute on function public.discard_routine_template_draft(uuid, text, bigint) to authenticated;
grant execute on function public.publish_routine_template_versions(uuid[], jsonb, text, uuid) to authenticated;

notify pgrst, 'reload schema';

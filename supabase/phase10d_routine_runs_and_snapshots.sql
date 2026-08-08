-- Phase 10D: Authoritative Routine Runs and Immutable Snapshots.
--
-- Apply after Phase 10A, 10A1, 10B, and 10C. This additive migration creates no
-- production runs and seeds no routine content. Inventory, Asset Registry,
-- and Event Operations are read-only snapshot sources: this migration adds
-- no foreign keys, triggers, policies, or writes to those domains.

create table if not exists public.routine_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  routine_key text not null,
  scope_key text not null default 'default',
  operational_date date not null,
  timezone text not null,
  template_id uuid not null,
  template_version_id uuid not null,
  template_version_number_snapshot bigint not null,
  template_content_hash_snapshot text not null,
  snapshot_schema_version text not null default 'phase10d-v1',
  snapshot_state text not null default 'building',
  snapshot_hash text,
  status text not null default 'scheduled',
  revision bigint not null default 1,
  creation_idempotency_key uuid not null,
  creation_request_hash text not null,
  started_at timestamptz,
  started_by_auth_user_id uuid references auth.users(id),
  finished_at timestamptz,
  finished_by_auth_user_id uuid references auth.users(id),
  reopen_count integer not null default 0,
  current_finish_sequence integer not null default 0,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by_auth_user_id uuid not null references auth.users(id),
  constraint routine_runs_template_same_org_fkey
    foreign key (template_id, organization_id)
    references public.routine_templates(id, organization_id),
  constraint routine_runs_version_same_template_fkey
    foreign key (template_version_id, organization_id, template_id)
    references public.routine_template_versions(id, organization_id, template_id),
  constraint routine_runs_id_org_unique unique (id, organization_id),
  constraint routine_runs_id_org_version_unique unique (id, organization_id, template_version_id),
  constraint routine_runs_org_creation_idempotency_unique
    unique (organization_id, creation_idempotency_key),
  constraint routine_runs_routine_key_check check (
    routine_key = trim(routine_key)
    and routine_key ~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
    and char_length(routine_key) between 1 and 80
  ),
  constraint routine_runs_scope_key_check check (
    scope_key = trim(scope_key)
    and scope_key ~ '^[a-z][a-z0-9]*(?:[-_:][a-z0-9]+)*$'
    and char_length(scope_key) between 1 and 120
  ),
  constraint routine_runs_timezone_check check (timezone = 'Europe/Oslo'),
  constraint routine_runs_template_number_check check (template_version_number_snapshot > 0),
  constraint routine_runs_template_hash_check
    check (template_content_hash_snapshot ~ '^[0-9a-f]{64}$'),
  constraint routine_runs_snapshot_schema_check
    check (snapshot_schema_version = 'phase10d-v1'),
  constraint routine_runs_snapshot_state_check check (snapshot_state in ('building', 'ready')),
  constraint routine_runs_snapshot_hash_check check (
    (snapshot_state = 'building' and snapshot_hash is null)
    or (snapshot_state = 'ready' and snapshot_hash ~ '^[0-9a-f]{64}$')
  ),
  constraint routine_runs_status_check check (status in (
    'scheduled', 'in_progress', 'awaiting_final_verification',
    'waiting_for_transfers', 'finished', 'reopened', 'cancelled', 'superseded'
  )),
  constraint routine_runs_revision_check check (revision > 0),
  constraint routine_runs_creation_hash_check check (creation_request_hash ~ '^[0-9a-f]{64}$'),
  constraint routine_runs_counters_check check (reopen_count >= 0 and current_finish_sequence >= 0)
);

create unique index if not exists routine_runs_authoritative_identity_idx
  on public.routine_runs (organization_id, operational_date, routine_key, scope_key)
  where status not in ('cancelled', 'superseded');
create index if not exists routine_runs_org_date_idx
  on public.routine_runs (organization_id, operational_date, routine_key, scope_key);
create index if not exists routine_runs_template_version_idx
  on public.routine_runs (template_version_id, organization_id, template_id);

create table if not exists public.routine_run_sections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  run_id uuid not null,
  source_version_id uuid not null,
  source_section_id uuid not null,
  section_key_snapshot text not null,
  title_snapshot text not null,
  description_snapshot text,
  phase_type_snapshot text not null,
  sort_order_snapshot integer not null,
  active_snapshot boolean not null,
  source_revision_snapshot bigint not null,
  row_snapshot_hash text not null,
  created_at timestamptz not null default now(),
  constraint routine_run_sections_run_same_org_fkey
    foreign key (run_id, organization_id, source_version_id)
    references public.routine_runs(id, organization_id, template_version_id),
  constraint routine_run_sections_source_same_version_fkey
    foreign key (source_section_id, organization_id, source_version_id)
    references public.routine_template_sections(id, organization_id, version_id),
  constraint routine_run_sections_key_unique unique (run_id, section_key_snapshot),
  constraint routine_run_sections_sort_unique unique (run_id, sort_order_snapshot),
  constraint routine_run_sections_identity_unique unique (id, organization_id, run_id),
  constraint routine_run_sections_key_check check (
    section_key_snapshot ~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
  ),
  constraint routine_run_sections_sort_check check (sort_order_snapshot >= 0),
  constraint routine_run_sections_revision_check check (source_revision_snapshot > 0),
  constraint routine_run_sections_hash_check check (row_snapshot_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists public.routine_run_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  run_id uuid not null,
  run_section_id uuid not null,
  source_version_id uuid not null,
  source_task_id uuid not null,
  task_key_snapshot text not null,
  title_snapshot text not null,
  instructions_snapshot text,
  done_criteria_snapshot text,
  task_type_snapshot text not null,
  criticality_snapshot text not null,
  mandatory_snapshot boolean not null,
  initial_assessment_policy_snapshot text not null,
  completion_policy_snapshot text not null,
  not_applicable_policy_snapshot text not null,
  verification_policy_snapshot text not null,
  repeat_policy_snapshot text not null,
  availability_mode_snapshot text not null,
  condition_json_snapshot jsonb not null,
  location_id_snapshot uuid,
  location_key_snapshot text,
  location_name_snapshot text,
  location_set_id_snapshot uuid,
  location_set_key_snapshot text,
  location_description_snapshot text,
  visible_day_offset_snapshot integer not null,
  visible_from_local_time_snapshot time without time zone,
  start_day_offset_snapshot integer not null,
  start_from_local_time_snapshot time without time zone,
  target_day_offset_snapshot integer not null,
  target_local_time_snapshot time without time zone,
  overdue_day_offset_snapshot integer not null,
  overdue_local_time_snapshot time without time zone,
  hard_deadline_day_offset_snapshot integer not null,
  hard_deadline_local_time_snapshot time without time zone,
  sort_order_snapshot integer not null,
  active_snapshot boolean not null,
  metadata_snapshot jsonb not null default '{}'::jsonb,
  source_revision_snapshot bigint not null,
  row_snapshot_hash text not null,
  inclusion_state text not null,
  condition_evaluation_id uuid,
  status text not null default 'not_started',
  outcome text,
  assigned_participant_id uuid,
  initial_assessment text,
  initial_assessed_at timestamptz,
  initial_assessed_by_auth_user_id uuid references auth.users(id),
  started_at timestamptz,
  started_by_auth_user_id uuid references auth.users(id),
  completed_at timestamptz,
  completed_by_auth_user_id uuid references auth.users(id),
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint routine_run_tasks_run_same_org_fkey
    foreign key (run_id, organization_id, source_version_id)
    references public.routine_runs(id, organization_id, template_version_id),
  constraint routine_run_tasks_section_same_run_fkey
    foreign key (run_section_id, organization_id, run_id)
    references public.routine_run_sections(id, organization_id, run_id),
  constraint routine_run_tasks_source_same_version_fkey
    foreign key (source_task_id, organization_id, source_version_id)
    references public.routine_template_tasks(id, organization_id, version_id),
  constraint routine_run_tasks_key_unique unique (run_id, task_key_snapshot),
  constraint routine_run_tasks_section_sort_unique unique (run_section_id, sort_order_snapshot),
  constraint routine_run_tasks_identity_unique unique (id, organization_id, run_id),
  constraint routine_run_tasks_key_check check (
    task_key_snapshot ~ '^[A-Za-z][A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)*$'
  ),
  constraint routine_run_tasks_condition_object_check check (jsonb_typeof(condition_json_snapshot) = 'object'),
  constraint routine_run_tasks_metadata_object_check check (jsonb_typeof(metadata_snapshot) = 'object'),
  constraint routine_run_tasks_inclusion_check check (inclusion_state in ('included', 'excluded', 'pending')),
  constraint routine_run_tasks_status_check check (status in (
    'not_started', 'in_progress', 'waiting', 'completed', 'blocked',
    'not_applicable', 'transferred', 'cancelled'
  )),
  constraint routine_run_tasks_outcome_check check (outcome is null or outcome in (
    'ready_on_arrival', 'standard_met', 'completed_after_correction',
    'control_passed', 'control_completed_with_deviation',
    'completed_with_manager_override', 'system_completed'
  )),
  constraint routine_run_tasks_initial_assessment_check check (
    initial_assessment is null or initial_assessment in ('ready', 'correction_required', 'control_issue_found')
  ),
  constraint routine_run_tasks_sort_check check (sort_order_snapshot >= 0),
  constraint routine_run_tasks_source_revision_check check (source_revision_snapshot > 0),
  constraint routine_run_tasks_hash_check check (row_snapshot_hash ~ '^[0-9a-f]{64}$'),
  constraint routine_run_tasks_revision_check check (revision > 0)
);

create table if not exists public.routine_run_task_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  run_id uuid not null,
  run_task_id uuid not null,
  source_version_id uuid not null,
  source_task_item_id uuid,
  item_key_snapshot text not null,
  label_snapshot text not null,
  item_type_snapshot text not null,
  required_snapshot boolean not null,
  source_kind_snapshot text not null,
  source_config_snapshot jsonb not null,
  standard_id_snapshot uuid,
  standard_key_snapshot text,
  standard_revision_id_snapshot uuid,
  standard_revision_number_snapshot bigint,
  standard_value_snapshot jsonb,
  source_location_set_id_snapshot uuid,
  source_location_set_key_snapshot text,
  location_id_snapshot uuid,
  location_key_snapshot text,
  location_name_snapshot text,
  external_source_type_snapshot text,
  external_source_id_snapshot text,
  external_source_revision_snapshot text,
  source_record_snapshot jsonb not null default '{}'::jsonb,
  input_schema_snapshot jsonb not null,
  sort_order_snapshot integer not null,
  active_snapshot boolean not null,
  metadata_snapshot jsonb not null,
  generated_from_source boolean not null default false,
  source_revision_snapshot bigint,
  row_snapshot_hash text not null,
  status text not null default 'not_started',
  value_json jsonb not null default '{}'::jsonb,
  result_code text,
  completed_at timestamptz,
  completed_by_auth_user_id uuid references auth.users(id),
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint routine_run_task_items_run_fkey
    foreign key (run_id, organization_id)
    references public.routine_runs(id, organization_id),
  constraint routine_run_task_items_task_same_run_fkey
    foreign key (run_task_id, organization_id, run_id)
    references public.routine_run_tasks(id, organization_id, run_id),
  constraint routine_run_task_items_key_unique unique (run_task_id, item_key_snapshot),
  constraint routine_run_task_items_sort_unique unique (run_task_id, sort_order_snapshot),
  constraint routine_run_task_items_identity_unique unique (id, organization_id, run_id),
  constraint routine_run_task_items_key_check check (
    item_key_snapshot ~ '^[a-z][a-z0-9]*(?:[-_:][a-z0-9]+)*$'
    and char_length(item_key_snapshot) between 1 and 200
  ),
  constraint routine_run_task_items_source_kind_check check (source_kind_snapshot in (
    'static', 'location_set', 'routine_standard', 'inventory_readonly',
    'asset_registry_readonly', 'event_context'
  )),
  constraint routine_run_task_items_json_check check (
    jsonb_typeof(source_config_snapshot) = 'object'
    and jsonb_typeof(source_record_snapshot) = 'object'
    and jsonb_typeof(input_schema_snapshot) = 'object'
    and jsonb_typeof(metadata_snapshot) = 'object'
    and jsonb_typeof(value_json) = 'object'
    and (standard_value_snapshot is null or jsonb_typeof(standard_value_snapshot) = 'object')
  ),
  constraint routine_run_task_items_sort_check check (sort_order_snapshot >= 0),
  constraint routine_run_task_items_source_revision_check check (
    source_revision_snapshot is null or source_revision_snapshot > 0
  ),
  constraint routine_run_task_items_standard_revision_check check (
    standard_revision_number_snapshot is null or standard_revision_number_snapshot > 0
  ),
  constraint routine_run_task_items_hash_check check (row_snapshot_hash ~ '^[0-9a-f]{64}$'),
  constraint routine_run_task_items_status_check
    check (status in ('not_started', 'completed', 'blocked', 'not_applicable')),
  constraint routine_run_task_items_revision_check check (revision > 0)
);

create table if not exists public.routine_run_snapshot_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  run_id uuid not null,
  source_template_item_id uuid,
  source_kind text not null,
  source_config_snapshot jsonb not null,
  resolution_state text not null,
  record_count integer not null default 0,
  source_hash text,
  snapshot_payload jsonb not null default '{}'::jsonb,
  warning_message text,
  error_message text,
  created_at timestamptz not null default now(),
  constraint routine_run_snapshot_sources_run_fkey
    foreign key (run_id, organization_id)
    references public.routine_runs(id, organization_id),
  constraint routine_run_snapshot_sources_identity_unique unique (id, organization_id, run_id),
  constraint routine_run_snapshot_sources_logical_unique
    unique (run_id, source_template_item_id, source_kind),
  constraint routine_run_snapshot_sources_kind_check check (source_kind in (
    'static', 'location_set', 'routine_standard', 'inventory_readonly',
    'asset_registry_readonly', 'event_context'
  )),
  constraint routine_run_snapshot_sources_state_check check (resolution_state in (
    'not_required', 'resolved', 'pending_external', 'failed'
  )),
  constraint routine_run_snapshot_sources_json_check check (
    jsonb_typeof(source_config_snapshot) = 'object'
    and jsonb_typeof(snapshot_payload) in ('object', 'array')
  ),
  constraint routine_run_snapshot_sources_count_check check (record_count >= 0),
  constraint routine_run_snapshot_sources_hash_check
    check (source_hash is null or source_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists public.routine_run_condition_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  run_id uuid not null,
  run_task_id uuid not null,
  condition_json_snapshot jsonb not null,
  evaluation_state text not null,
  facts_snapshot jsonb not null default '{}'::jsonb,
  evaluator_version text,
  evaluated_at timestamptz,
  evaluated_by_auth_user_id uuid references auth.users(id),
  error_message text,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint routine_run_condition_evaluations_task_fkey
    foreign key (run_task_id, organization_id, run_id)
    references public.routine_run_tasks(id, organization_id, run_id),
  constraint routine_run_condition_evaluations_task_unique unique (run_task_id),
  constraint routine_run_condition_evaluations_identity_unique
    unique (id, organization_id, run_id, run_task_id),
  constraint routine_run_condition_evaluations_state_check check (evaluation_state in (
    'not_required', 'pending', 'matched', 'not_matched', 'error'
  )),
  constraint routine_run_condition_evaluations_json_check check (
    jsonb_typeof(condition_json_snapshot) = 'object'
    and jsonb_typeof(facts_snapshot) = 'object'
  ),
  constraint routine_run_condition_evaluations_revision_check check (revision > 0)
);

do $phase10d_condition_fkey$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'routine_run_tasks_condition_same_task_fkey'
      and conrelid = 'public.routine_run_tasks'::regclass
  ) then
    alter table public.routine_run_tasks
      add constraint routine_run_tasks_condition_same_task_fkey
      foreign key (condition_evaluation_id, organization_id, run_id, id)
      references public.routine_run_condition_evaluations(id, organization_id, run_id, run_task_id)
      deferrable initially deferred;
  end if;
end;
$phase10d_condition_fkey$;

create table if not exists public.routine_run_task_dependencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  run_id uuid not null,
  predecessor_run_task_id uuid not null,
  successor_run_task_id uuid not null,
  dependency_type_snapshot text not null,
  metadata_snapshot jsonb not null default '{}'::jsonb,
  source_dependency_id uuid not null,
  row_snapshot_hash text not null,
  created_at timestamptz not null default now(),
  constraint routine_run_task_dependencies_predecessor_fkey
    foreign key (predecessor_run_task_id, organization_id, run_id)
    references public.routine_run_tasks(id, organization_id, run_id),
  constraint routine_run_task_dependencies_successor_fkey
    foreign key (successor_run_task_id, organization_id, run_id)
    references public.routine_run_tasks(id, organization_id, run_id),
  constraint routine_run_task_dependencies_logical_unique
    unique (run_id, predecessor_run_task_id, successor_run_task_id, dependency_type_snapshot),
  constraint routine_run_task_dependencies_identity_unique unique (id, organization_id, run_id),
  constraint routine_run_task_dependencies_not_self_check
    check (predecessor_run_task_id <> successor_run_task_id),
  constraint routine_run_task_dependencies_json_check check (jsonb_typeof(metadata_snapshot) = 'object'),
  constraint routine_run_task_dependencies_hash_check check (row_snapshot_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists public.routine_run_task_relations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  run_id uuid not null,
  source_run_task_id uuid not null,
  target_routine_key_snapshot text not null,
  target_task_key_snapshot text not null,
  relation_type_snapshot text not null,
  metadata_snapshot jsonb not null default '{}'::jsonb,
  source_relation_id uuid not null,
  row_snapshot_hash text not null,
  created_at timestamptz not null default now(),
  constraint routine_run_task_relations_source_fkey
    foreign key (source_run_task_id, organization_id, run_id)
    references public.routine_run_tasks(id, organization_id, run_id),
  constraint routine_run_task_relations_logical_unique
    unique (run_id, source_run_task_id, target_routine_key_snapshot, target_task_key_snapshot, relation_type_snapshot),
  constraint routine_run_task_relations_identity_unique unique (id, organization_id, run_id),
  constraint routine_run_task_relations_target_routine_check check (
    target_routine_key_snapshot ~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
  ),
  constraint routine_run_task_relations_target_task_check check (
    target_task_key_snapshot ~ '^[A-Za-z][A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)*$'
  ),
  constraint routine_run_task_relations_json_check check (jsonb_typeof(metadata_snapshot) = 'object'),
  constraint routine_run_task_relations_hash_check check (row_snapshot_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists public.routine_run_task_reference_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  run_id uuid not null,
  run_task_id uuid not null,
  run_task_item_id uuid,
  source_template_link_id uuid not null,
  reference_id_snapshot uuid not null,
  reference_key_snapshot text not null,
  reference_label_snapshot text not null,
  reference_version_id_snapshot uuid not null,
  reference_version_number_snapshot bigint not null,
  image_state_snapshot text not null,
  object_path_snapshot text,
  mime_type_snapshot text,
  byte_size_snapshot bigint,
  caption_snapshot text,
  alt_text_snapshot text,
  placeholder_text_snapshot text not null,
  button_label_snapshot text not null,
  context_note_snapshot text,
  sort_order_snapshot integer not null,
  active_snapshot boolean not null,
  row_snapshot_hash text not null,
  created_at timestamptz not null default now(),
  constraint routine_run_task_reference_images_task_fkey
    foreign key (run_task_id, organization_id, run_id)
    references public.routine_run_tasks(id, organization_id, run_id),
  constraint routine_run_task_reference_images_item_fkey
    foreign key (run_task_item_id, organization_id, run_id)
    references public.routine_run_task_items(id, organization_id, run_id),
  constraint routine_run_task_reference_images_identity_unique unique (id, organization_id, run_id),
  constraint routine_run_task_reference_images_logical_unique
    unique (run_id, source_template_link_id, run_task_item_id),
  constraint routine_run_task_reference_images_state_check
    check (image_state_snapshot in ('active_image', 'placeholder')),
  constraint routine_run_task_reference_images_version_check
    check (reference_version_number_snapshot > 0),
  constraint routine_run_task_reference_images_image_check check (
    (image_state_snapshot = 'active_image'
      and object_path_snapshot is not null
      and mime_type_snapshot in ('image/jpeg', 'image/png', 'image/webp')
      and byte_size_snapshot between 1 and 5242880
      and alt_text_snapshot is not null)
    or (image_state_snapshot = 'placeholder'
      and object_path_snapshot is null and mime_type_snapshot is null
      and byte_size_snapshot is null and alt_text_snapshot is null)
  ),
  constraint routine_run_task_reference_images_sort_check check (sort_order_snapshot >= 0),
  constraint routine_run_task_reference_images_hash_check check (row_snapshot_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists public.routine_run_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  run_id uuid not null,
  user_profile_id uuid not null references public.user_profiles(id),
  display_name_snapshot text not null,
  role_snapshot text not null,
  participation_status text not null default 'assigned',
  joined_at timestamptz,
  left_at timestamptz,
  revision bigint not null default 1,
  creation_idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by_auth_user_id uuid not null references auth.users(id),
  constraint routine_run_participants_run_fkey
    foreign key (run_id, organization_id)
    references public.routine_runs(id, organization_id),
  constraint routine_run_participants_run_profile_unique unique (run_id, user_profile_id),
  constraint routine_run_participants_org_idempotency_unique
    unique (organization_id, creation_idempotency_key),
  constraint routine_run_participants_identity_unique unique (id, organization_id, run_id),
  constraint routine_run_participants_name_check
    check (display_name_snapshot = trim(display_name_snapshot) and char_length(display_name_snapshot) between 1 and 200),
  constraint routine_run_participants_role_check check (role_snapshot in ('manager', 'shift_lead', 'staff')),
  constraint routine_run_participants_status_check check (participation_status in (
    'assigned', 'active', 'temporarily_away', 'expected_back',
    'returned', 'completed', 'removed'
  )),
  constraint routine_run_participants_revision_check check (revision > 0)
);

create table if not exists public.routine_run_role_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  run_id uuid not null,
  participant_id uuid not null,
  role_key text not null,
  scope_key text not null default 'global',
  status text not null default 'active',
  assigned_at timestamptz not null default now(),
  assigned_by_auth_user_id uuid not null references auth.users(id),
  ended_at timestamptz,
  ended_by_auth_user_id uuid references auth.users(id),
  replaces_assignment_id uuid,
  replacement_reason text,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  constraint routine_run_role_assignments_participant_fkey
    foreign key (participant_id, organization_id, run_id)
    references public.routine_run_participants(id, organization_id, run_id),
  constraint routine_run_role_assignments_identity_unique unique (id, organization_id, run_id),
  constraint routine_run_role_assignments_replacement_same_run_fkey
    foreign key (replaces_assignment_id, organization_id, run_id)
    references public.routine_run_role_assignments(id, organization_id, run_id),
  constraint routine_run_role_assignments_role_check check (role_key in (
    'opening_responsible', 'closing_responsible', 'cash_register_responsible',
    'locking_alarm_responsible', 'asset_responsible', 'event_area_responsible'
  )),
  constraint routine_run_role_assignments_scope_check check (
    scope_key = trim(scope_key)
    and scope_key ~ '^[a-z][a-z0-9]*(?:[-_:][a-z0-9]+)*$'
    and char_length(scope_key) between 1 and 120
  ),
  constraint routine_run_role_assignments_status_check check (status in ('active', 'ended', 'superseded')),
  constraint routine_run_role_assignments_end_check check (
    (status = 'active' and ended_at is null and ended_by_auth_user_id is null)
    or (status in ('ended', 'superseded') and ended_at is not null and ended_by_auth_user_id is not null)
  ),
  constraint routine_run_role_assignments_reason_check check (
    replacement_reason is null
    or (replacement_reason = trim(replacement_reason) and char_length(replacement_reason) between 1 and 2000)
  ),
  constraint routine_run_role_assignments_revision_check check (revision > 0)
);

create unique index if not exists routine_run_role_assignments_one_active_idx
  on public.routine_run_role_assignments (run_id, role_key, scope_key)
  where status = 'active';

create table if not exists public.routine_run_operations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  actor_auth_user_id uuid not null references auth.users(id),
  operation_type text not null,
  idempotency_key uuid not null,
  request_hash text not null,
  resource_type text not null,
  resource_id uuid,
  response_payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint routine_run_operations_idempotency_unique
    unique (organization_id, actor_auth_user_id, operation_type, idempotency_key),
  constraint routine_run_operations_type_check check (operation_type in (
    'create_run', 'join_run', 'assign_role'
  )),
  constraint routine_run_operations_hash_check check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint routine_run_operations_resource_check check (resource_type in ('run', 'participant', 'role_assignment')),
  constraint routine_run_operations_response_check check (jsonb_typeof(response_payload) = 'object')
);

create index if not exists routine_run_sections_run_idx on public.routine_run_sections (run_id, organization_id);
create index if not exists routine_run_tasks_run_idx on public.routine_run_tasks (run_id, organization_id, run_section_id);
create index if not exists routine_run_task_items_run_idx on public.routine_run_task_items (run_id, organization_id, run_task_id);
create index if not exists routine_run_snapshot_sources_run_idx on public.routine_run_snapshot_sources (run_id, organization_id);
create index if not exists routine_run_conditions_run_idx on public.routine_run_condition_evaluations (run_id, organization_id);
create index if not exists routine_run_dependencies_run_idx on public.routine_run_task_dependencies (run_id, organization_id);
create index if not exists routine_run_relations_run_idx on public.routine_run_task_relations (run_id, organization_id);
create index if not exists routine_run_images_run_idx on public.routine_run_task_reference_images (run_id, organization_id, run_task_id);
create index if not exists routine_run_images_version_idx on public.routine_run_task_reference_images (reference_version_id_snapshot, organization_id);
create index if not exists routine_run_participants_profile_idx on public.routine_run_participants (user_profile_id, organization_id, run_id);
create index if not exists routine_run_operations_resource_idx on public.routine_run_operations (organization_id, resource_type, resource_id, created_at);

create or replace function public.routine_run_sha256(input_value jsonb)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select encode(
    extensions.digest(convert_to(coalesce(input_value, 'null'::jsonb)::text, 'UTF8'), 'sha256'),
    'hex'
  );
$$;

create or replace function public.routine_run_request_hash(input_request jsonb)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select public.routine_run_sha256(input_request);
$$;

create or replace function public.routine_run_operation_replay(
  input_organization_id uuid,
  input_actor_auth_user_id uuid,
  input_operation_type text,
  input_idempotency_key uuid,
  input_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_operation public.routine_run_operations%rowtype;
begin
  select operation.* into v_operation
  from public.routine_run_operations operation
  where operation.organization_id = input_organization_id
    and operation.actor_auth_user_id = input_actor_auth_user_id
    and operation.operation_type = input_operation_type
    and operation.idempotency_key = input_idempotency_key;

  if v_operation.id is null then return null; end if;
  if v_operation.request_hash <> input_request_hash then
    raise exception using errcode = 'P0001', message = 'Idempotency key was already used with a different routine run request.';
  end if;
  return v_operation.response_payload || jsonb_build_object('idempotentReplay', true);
end;
$$;

create or replace function public.routine_record_run_operation(
  input_organization_id uuid,
  input_actor_auth_user_id uuid,
  input_operation_type text,
  input_idempotency_key uuid,
  input_request_hash text,
  input_resource_type text,
  input_resource_id uuid,
  input_response_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform set_config('mesh.routine_run_internal', 'operation', true);
  insert into public.routine_run_operations (
    organization_id, actor_auth_user_id, operation_type, idempotency_key,
    request_hash, resource_type, resource_id, response_payload
  ) values (
    input_organization_id, input_actor_auth_user_id, input_operation_type,
    input_idempotency_key, input_request_hash, input_resource_type,
    input_resource_id, input_response_payload
  );
end;
$$;

create or replace function public.routine_run_fully_immutable_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = 'P0001', message = 'Routine run snapshot rows are immutable.';
end;
$$;

create or replace function public.routine_runs_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'Routine runs cannot be deleted.';
  end if;
  if old.snapshot_state = 'ready' and (
    new.organization_id is distinct from old.organization_id
    or new.routine_key is distinct from old.routine_key
    or new.scope_key is distinct from old.scope_key
    or new.operational_date is distinct from old.operational_date
    or new.timezone is distinct from old.timezone
    or new.template_id is distinct from old.template_id
    or new.template_version_id is distinct from old.template_version_id
    or new.template_version_number_snapshot is distinct from old.template_version_number_snapshot
    or new.template_content_hash_snapshot is distinct from old.template_content_hash_snapshot
    or new.snapshot_schema_version is distinct from old.snapshot_schema_version
    or new.snapshot_state is distinct from old.snapshot_state
    or new.snapshot_hash is distinct from old.snapshot_hash
    or new.creation_idempotency_key is distinct from old.creation_idempotency_key
    or new.creation_request_hash is distinct from old.creation_request_hash
    or new.created_at is distinct from old.created_at
    or new.created_by_auth_user_id is distinct from old.created_by_auth_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'Ready routine run identity and snapshot fields are immutable.';
  end if;
  if current_setting('mesh.routine_run_internal', true) is null then
    raise exception using errcode = 'P0001', message = 'Routine run projections can be changed only through an authorized RPC.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.routine_run_tasks_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'Routine run tasks cannot be deleted.';
  end if;
  if row(
    new.organization_id, new.run_id, new.run_section_id, new.source_version_id,
    new.source_task_id, new.task_key_snapshot, new.title_snapshot,
    new.instructions_snapshot, new.done_criteria_snapshot, new.task_type_snapshot,
    new.criticality_snapshot, new.mandatory_snapshot,
    new.initial_assessment_policy_snapshot, new.completion_policy_snapshot,
    new.not_applicable_policy_snapshot, new.verification_policy_snapshot,
    new.repeat_policy_snapshot, new.availability_mode_snapshot,
    new.condition_json_snapshot, new.location_id_snapshot, new.location_key_snapshot,
    new.location_name_snapshot, new.location_set_id_snapshot,
    new.location_set_key_snapshot, new.location_description_snapshot,
    new.visible_day_offset_snapshot, new.visible_from_local_time_snapshot,
    new.start_day_offset_snapshot, new.start_from_local_time_snapshot,
    new.target_day_offset_snapshot, new.target_local_time_snapshot,
    new.overdue_day_offset_snapshot, new.overdue_local_time_snapshot,
    new.hard_deadline_day_offset_snapshot, new.hard_deadline_local_time_snapshot,
    new.sort_order_snapshot, new.active_snapshot, new.metadata_snapshot,
    new.source_revision_snapshot, new.row_snapshot_hash
  ) is distinct from row(
    old.organization_id, old.run_id, old.run_section_id, old.source_version_id,
    old.source_task_id, old.task_key_snapshot, old.title_snapshot,
    old.instructions_snapshot, old.done_criteria_snapshot, old.task_type_snapshot,
    old.criticality_snapshot, old.mandatory_snapshot,
    old.initial_assessment_policy_snapshot, old.completion_policy_snapshot,
    old.not_applicable_policy_snapshot, old.verification_policy_snapshot,
    old.repeat_policy_snapshot, old.availability_mode_snapshot,
    old.condition_json_snapshot, old.location_id_snapshot, old.location_key_snapshot,
    old.location_name_snapshot, old.location_set_id_snapshot,
    old.location_set_key_snapshot, old.location_description_snapshot,
    old.visible_day_offset_snapshot, old.visible_from_local_time_snapshot,
    old.start_day_offset_snapshot, old.start_from_local_time_snapshot,
    old.target_day_offset_snapshot, old.target_local_time_snapshot,
    old.overdue_day_offset_snapshot, old.overdue_local_time_snapshot,
    old.hard_deadline_day_offset_snapshot, old.hard_deadline_local_time_snapshot,
    old.sort_order_snapshot, old.active_snapshot, old.metadata_snapshot,
    old.source_revision_snapshot, old.row_snapshot_hash
  ) then
    raise exception using errcode = 'P0001', message = 'Routine run task snapshot fields are immutable.';
  end if;
  if current_setting('mesh.routine_run_internal', true) is null then
    raise exception using errcode = 'P0001', message = 'Routine run task projections can be changed only through an authorized RPC.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.routine_run_task_items_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'Routine run task items cannot be deleted.';
  end if;
  if row(
    new.organization_id, new.run_id, new.run_task_id, new.source_version_id,
    new.source_task_item_id, new.item_key_snapshot, new.label_snapshot,
    new.item_type_snapshot, new.required_snapshot, new.source_kind_snapshot,
    new.source_config_snapshot, new.standard_id_snapshot, new.standard_key_snapshot,
    new.standard_revision_id_snapshot, new.standard_revision_number_snapshot,
    new.standard_value_snapshot, new.source_location_set_id_snapshot,
    new.source_location_set_key_snapshot, new.location_id_snapshot,
    new.location_key_snapshot, new.location_name_snapshot,
    new.external_source_type_snapshot, new.external_source_id_snapshot,
    new.external_source_revision_snapshot, new.source_record_snapshot,
    new.input_schema_snapshot, new.sort_order_snapshot, new.active_snapshot,
    new.metadata_snapshot, new.generated_from_source, new.source_revision_snapshot,
    new.row_snapshot_hash
  ) is distinct from row(
    old.organization_id, old.run_id, old.run_task_id, old.source_version_id,
    old.source_task_item_id, old.item_key_snapshot, old.label_snapshot,
    old.item_type_snapshot, old.required_snapshot, old.source_kind_snapshot,
    old.source_config_snapshot, old.standard_id_snapshot, old.standard_key_snapshot,
    old.standard_revision_id_snapshot, old.standard_revision_number_snapshot,
    old.standard_value_snapshot, old.source_location_set_id_snapshot,
    old.source_location_set_key_snapshot, old.location_id_snapshot,
    old.location_key_snapshot, old.location_name_snapshot,
    old.external_source_type_snapshot, old.external_source_id_snapshot,
    old.external_source_revision_snapshot, old.source_record_snapshot,
    old.input_schema_snapshot, old.sort_order_snapshot, old.active_snapshot,
    old.metadata_snapshot, old.generated_from_source, old.source_revision_snapshot,
    old.row_snapshot_hash
  ) then
    raise exception using errcode = 'P0001', message = 'Routine run task-item snapshot fields are immutable.';
  end if;
  if current_setting('mesh.routine_run_internal', true) is null then
    raise exception using errcode = 'P0001', message = 'Routine run task-item projections can be changed only through an authorized RPC.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.routine_run_condition_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'Routine condition records cannot be deleted.';
  end if;
  if row(new.organization_id, new.run_id, new.run_task_id, new.condition_json_snapshot, new.created_at)
     is distinct from
     row(old.organization_id, old.run_id, old.run_task_id, old.condition_json_snapshot, old.created_at) then
    raise exception using errcode = 'P0001', message = 'Routine condition snapshot fields are immutable.';
  end if;
  if current_setting('mesh.routine_run_internal', true) is null then
    raise exception using errcode = 'P0001', message = 'Routine condition projections can be changed only through an authorized RPC.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.routine_run_participant_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_profile_org uuid;
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'Routine run participants cannot be deleted.';
  end if;
  if tg_op = 'INSERT' then
    select profile.organization_id into v_profile_org
    from public.user_profiles profile
    where profile.id = new.user_profile_id and profile.active = true
      and coalesce(profile.is_shared_device, false) = false
      and profile.role in ('manager', 'shift_lead', 'staff');
    if v_profile_org is distinct from new.organization_id then
      raise exception using errcode = 'P0001', message = 'Routine participant must be an active personal profile in the run organization.';
    end if;
    return new;
  end if;
  if row(new.organization_id, new.run_id, new.user_profile_id,
         new.display_name_snapshot, new.role_snapshot, new.creation_idempotency_key,
         new.created_at, new.created_by_auth_user_id)
     is distinct from
     row(old.organization_id, old.run_id, old.user_profile_id,
         old.display_name_snapshot, old.role_snapshot, old.creation_idempotency_key,
         old.created_at, old.created_by_auth_user_id) then
    raise exception using errcode = 'P0001', message = 'Routine participant identity, name, and role snapshots are immutable.';
  end if;
  if current_setting('mesh.routine_run_internal', true) is null then
    raise exception using errcode = 'P0001', message = 'Routine participant status can be changed only through an authorized RPC.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.routine_run_role_assignment_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'Routine role assignments cannot be deleted.';
  end if;
  if tg_op = 'UPDATE' then
    if row(new.organization_id, new.run_id, new.participant_id, new.role_key,
           new.scope_key, new.assigned_at, new.assigned_by_auth_user_id,
           new.replaces_assignment_id, new.replacement_reason, new.created_at)
       is distinct from
       row(old.organization_id, old.run_id, old.participant_id, old.role_key,
           old.scope_key, old.assigned_at, old.assigned_by_auth_user_id,
           old.replaces_assignment_id, old.replacement_reason, old.created_at) then
      raise exception using errcode = 'P0001', message = 'Routine role-assignment history is immutable.';
    end if;
    if current_setting('mesh.routine_run_internal', true) is null then
      raise exception using errcode = 'P0001', message = 'Routine role assignments can change only through an authorized RPC.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists routine_runs_guard on public.routine_runs;
create trigger routine_runs_guard before update or delete on public.routine_runs
for each row execute function public.routine_runs_guard();
drop trigger if exists routine_run_sections_guard on public.routine_run_sections;
create trigger routine_run_sections_guard before update or delete on public.routine_run_sections
for each row execute function public.routine_run_fully_immutable_guard();
drop trigger if exists routine_run_tasks_guard on public.routine_run_tasks;
create trigger routine_run_tasks_guard before update or delete on public.routine_run_tasks
for each row execute function public.routine_run_tasks_guard();
drop trigger if exists routine_run_task_items_guard on public.routine_run_task_items;
create trigger routine_run_task_items_guard before update or delete on public.routine_run_task_items
for each row execute function public.routine_run_task_items_guard();
drop trigger if exists routine_run_snapshot_sources_guard on public.routine_run_snapshot_sources;
create trigger routine_run_snapshot_sources_guard before update or delete on public.routine_run_snapshot_sources
for each row execute function public.routine_run_fully_immutable_guard();
drop trigger if exists routine_run_condition_guard on public.routine_run_condition_evaluations;
create trigger routine_run_condition_guard before update or delete on public.routine_run_condition_evaluations
for each row execute function public.routine_run_condition_guard();
drop trigger if exists routine_run_dependencies_guard on public.routine_run_task_dependencies;
create trigger routine_run_dependencies_guard before update or delete on public.routine_run_task_dependencies
for each row execute function public.routine_run_fully_immutable_guard();
drop trigger if exists routine_run_relations_guard on public.routine_run_task_relations;
create trigger routine_run_relations_guard before update or delete on public.routine_run_task_relations
for each row execute function public.routine_run_fully_immutable_guard();
drop trigger if exists routine_run_images_guard on public.routine_run_task_reference_images;
create trigger routine_run_images_guard before update or delete on public.routine_run_task_reference_images
for each row execute function public.routine_run_fully_immutable_guard();
drop trigger if exists routine_run_participants_guard on public.routine_run_participants;
create trigger routine_run_participants_guard before insert or update or delete on public.routine_run_participants
for each row execute function public.routine_run_participant_guard();
drop trigger if exists routine_run_role_assignments_guard on public.routine_run_role_assignments;
create trigger routine_run_role_assignments_guard before update or delete on public.routine_run_role_assignments
for each row execute function public.routine_run_role_assignment_guard();
drop trigger if exists routine_run_operations_guard on public.routine_run_operations;
create trigger routine_run_operations_guard before update or delete on public.routine_run_operations
for each row execute function public.routine_run_fully_immutable_guard();

create or replace function public.routine_run_snapshot_canonical_json(input_run_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'schemaVersion', run.snapshot_schema_version,
    'identity', jsonb_build_object(
      'organizationId', run.organization_id,
      'operationalDate', run.operational_date,
      'routineKey', run.routine_key,
      'scopeKey', run.scope_key,
      'timezone', run.timezone
    ),
    'template', jsonb_build_object(
      'templateId', run.template_id,
      'versionId', run.template_version_id,
      'versionNumber', run.template_version_number_snapshot,
      'contentHash', run.template_content_hash_snapshot
    ),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', section.section_key_snapshot,
        'title', section.title_snapshot,
        'description', section.description_snapshot,
        'phaseType', section.phase_type_snapshot,
        'sortOrder', section.sort_order_snapshot,
        'active', section.active_snapshot,
        'sourceRevision', section.source_revision_snapshot,
        'rowHash', section.row_snapshot_hash
      ) order by section.sort_order_snapshot, section.section_key_snapshot)
      from public.routine_run_sections section where section.run_id = run.id
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sectionKey', section.section_key_snapshot,
        'key', task.task_key_snapshot,
        'title', task.title_snapshot,
        'instructions', task.instructions_snapshot,
        'doneCriteria', task.done_criteria_snapshot,
        'taskType', task.task_type_snapshot,
        'criticality', task.criticality_snapshot,
        'mandatory', task.mandatory_snapshot,
        'initialAssessmentPolicy', task.initial_assessment_policy_snapshot,
        'completionPolicy', task.completion_policy_snapshot,
        'notApplicablePolicy', task.not_applicable_policy_snapshot,
        'verificationPolicy', task.verification_policy_snapshot,
        'repeatPolicy', task.repeat_policy_snapshot,
        'availabilityMode', task.availability_mode_snapshot,
        'condition', task.condition_json_snapshot,
        'locationId', task.location_id_snapshot,
        'locationKey', task.location_key_snapshot,
        'locationName', task.location_name_snapshot,
        'locationSetId', task.location_set_id_snapshot,
        'locationSetKey', task.location_set_key_snapshot,
        'locationDescription', task.location_description_snapshot,
        'visibleDayOffset', task.visible_day_offset_snapshot,
        'visibleFromLocalTime', task.visible_from_local_time_snapshot,
        'startDayOffset', task.start_day_offset_snapshot,
        'startFromLocalTime', task.start_from_local_time_snapshot,
        'targetDayOffset', task.target_day_offset_snapshot,
        'targetLocalTime', task.target_local_time_snapshot,
        'overdueDayOffset', task.overdue_day_offset_snapshot,
        'overdueLocalTime', task.overdue_local_time_snapshot,
        'hardDeadlineDayOffset', task.hard_deadline_day_offset_snapshot,
        'hardDeadlineLocalTime', task.hard_deadline_local_time_snapshot,
        'sortOrder', task.sort_order_snapshot,
        'active', task.active_snapshot,
        'metadata', task.metadata_snapshot,
        'sourceRevision', task.source_revision_snapshot,
        'inclusionState', task.inclusion_state,
        'rowHash', task.row_snapshot_hash
      ) order by section.sort_order_snapshot, task.sort_order_snapshot, task.task_key_snapshot)
      from public.routine_run_tasks task
      join public.routine_run_sections section on section.id = task.run_section_id
      where task.run_id = run.id
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'taskKey', task.task_key_snapshot,
        'key', item.item_key_snapshot,
        'label', item.label_snapshot,
        'itemType', item.item_type_snapshot,
        'required', item.required_snapshot,
        'sourceKind', item.source_kind_snapshot,
        'sourceConfig', item.source_config_snapshot,
        'standardId', item.standard_id_snapshot,
        'standardKey', item.standard_key_snapshot,
        'standardRevisionId', item.standard_revision_id_snapshot,
        'standardRevisionNumber', item.standard_revision_number_snapshot,
        'standardValue', item.standard_value_snapshot,
        'sourceLocationSetId', item.source_location_set_id_snapshot,
        'sourceLocationSetKey', item.source_location_set_key_snapshot,
        'locationId', item.location_id_snapshot,
        'locationKey', item.location_key_snapshot,
        'locationName', item.location_name_snapshot,
        'externalSourceType', item.external_source_type_snapshot,
        'externalSourceId', item.external_source_id_snapshot,
        'externalSourceRevision', item.external_source_revision_snapshot,
        'sourceRecord', item.source_record_snapshot,
        'inputSchema', item.input_schema_snapshot,
        'sortOrder', item.sort_order_snapshot,
        'active', item.active_snapshot,
        'metadata', item.metadata_snapshot,
        'generated', item.generated_from_source,
        'sourceRevision', item.source_revision_snapshot,
        'rowHash', item.row_snapshot_hash
      ) order by task.task_key_snapshot, item.sort_order_snapshot, item.item_key_snapshot)
      from public.routine_run_task_items item
      join public.routine_run_tasks task on task.id = item.run_task_id
      where item.run_id = run.id
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'templateItemId', source.source_template_item_id,
        'kind', source.source_kind,
        'config', source.source_config_snapshot,
        'state', source.resolution_state,
        'recordCount', source.record_count,
        'sourceHash', source.source_hash,
        'payload', source.snapshot_payload,
        'warning', source.warning_message,
        'error', source.error_message
      ) order by source.source_template_item_id, source.source_kind)
      from public.routine_run_snapshot_sources source where source.run_id = run.id
    ), '[]'::jsonb),
    'conditions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'taskKey', task.task_key_snapshot,
        'condition', condition.condition_json_snapshot,
        'state', condition.evaluation_state,
        'facts', condition.facts_snapshot,
        'evaluatorVersion', condition.evaluator_version,
        'error', condition.error_message
      ) order by task.task_key_snapshot)
      from public.routine_run_condition_evaluations condition
      join public.routine_run_tasks task on task.id = condition.run_task_id
      where condition.run_id = run.id
    ), '[]'::jsonb),
    'dependencies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'predecessorTaskKey', predecessor.task_key_snapshot,
        'successorTaskKey', successor.task_key_snapshot,
        'type', dependency.dependency_type_snapshot,
        'metadata', dependency.metadata_snapshot,
        'rowHash', dependency.row_snapshot_hash
      ) order by predecessor.task_key_snapshot, successor.task_key_snapshot, dependency.dependency_type_snapshot)
      from public.routine_run_task_dependencies dependency
      join public.routine_run_tasks predecessor on predecessor.id = dependency.predecessor_run_task_id
      join public.routine_run_tasks successor on successor.id = dependency.successor_run_task_id
      where dependency.run_id = run.id
    ), '[]'::jsonb),
    'relations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sourceTaskKey', task.task_key_snapshot,
        'targetRoutineKey', relation.target_routine_key_snapshot,
        'targetTaskKey', relation.target_task_key_snapshot,
        'type', relation.relation_type_snapshot,
        'metadata', relation.metadata_snapshot,
        'rowHash', relation.row_snapshot_hash
      ) order by task.task_key_snapshot, relation.target_routine_key_snapshot,
                 relation.target_task_key_snapshot, relation.relation_type_snapshot)
      from public.routine_run_task_relations relation
      join public.routine_run_tasks task on task.id = relation.source_run_task_id
      where relation.run_id = run.id
    ), '[]'::jsonb),
    'referenceImages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'taskKey', task.task_key_snapshot,
        'itemKey', item.item_key_snapshot,
        'sourceLinkId', image.source_template_link_id,
        'referenceId', image.reference_id_snapshot,
        'referenceKey', image.reference_key_snapshot,
        'referenceLabel', image.reference_label_snapshot,
        'versionId', image.reference_version_id_snapshot,
        'versionNumber', image.reference_version_number_snapshot,
        'state', image.image_state_snapshot,
        'objectPath', image.object_path_snapshot,
        'mimeType', image.mime_type_snapshot,
        'byteSize', image.byte_size_snapshot,
        'caption', image.caption_snapshot,
        'altText', image.alt_text_snapshot,
        'placeholderText', image.placeholder_text_snapshot,
        'buttonLabel', image.button_label_snapshot,
        'contextNote', image.context_note_snapshot,
        'sortOrder', image.sort_order_snapshot,
        'active', image.active_snapshot,
        'rowHash', image.row_snapshot_hash
      ) order by task.task_key_snapshot, image.sort_order_snapshot,
                 coalesce(item.item_key_snapshot, ''), image.reference_key_snapshot)
      from public.routine_run_task_reference_images image
      join public.routine_run_tasks task on task.id = image.run_task_id
      left join public.routine_run_task_items item on item.id = image.run_task_item_id
      where image.run_id = run.id
    ), '[]'::jsonb)
  )
  from public.routine_runs run
  where run.id = input_run_id;
$$;

create or replace function public.routine_compute_run_snapshot_hash(input_run_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select public.routine_run_sha256(public.routine_run_snapshot_canonical_json(input_run_id));
$$;

create or replace function public.routine_build_run_snapshot(input_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_run public.routine_runs%rowtype;
  v_item record;
  v_payload jsonb;
  v_count integer;
  v_missing integer;
  v_hash text;
  v_expected integer;
  v_actual integer;
begin
  select run.* into v_run
  from public.routine_runs run
  where run.id = input_run_id
  for update;
  if v_run.id is null then
    raise exception using errcode = 'P0001', message = 'Routine run was not found.';
  end if;
  if v_run.snapshot_state <> 'building' or v_run.snapshot_hash is not null then
    raise exception using errcode = 'P0001', message = 'Routine snapshot can be built only from the internal building state.';
  end if;

  perform 1
  from public.routine_templates template
  join public.routine_template_versions version
    on version.id = v_run.template_version_id
   and version.organization_id = template.organization_id
   and version.template_id = template.id
  where template.id = v_run.template_id
    and template.organization_id = v_run.organization_id
    and template.active
    and template.current_published_version_id = version.id
    and version.state = 'published'
  for update of template, version;
  if not found then
    raise exception using errcode = 'P0001', message = 'Routine run requires the active template current published version.';
  end if;
  if public.routine_template_version_content_hash(v_run.template_version_id)
     is distinct from v_run.template_content_hash_snapshot then
    raise exception using errcode = 'P0001', message = 'Published routine template content hash verification failed.';
  end if;

  perform set_config('mesh.routine_run_internal', 'build', true);

  insert into public.routine_run_sections (
    organization_id, run_id, source_version_id, source_section_id,
    section_key_snapshot, title_snapshot, description_snapshot,
    phase_type_snapshot, sort_order_snapshot, active_snapshot,
    source_revision_snapshot, row_snapshot_hash
  )
  select
    v_run.organization_id, v_run.id, v_run.template_version_id, section.id,
    section.section_key, section.title, section.description, section.phase_type,
    section.sort_order, section.active, section.revision,
    public.routine_run_sha256(jsonb_build_object(
      'sectionKey', section.section_key, 'title', section.title,
      'description', section.description, 'phaseType', section.phase_type,
      'sortOrder', section.sort_order, 'active', section.active,
      'sourceRevision', section.revision
    ))
  from public.routine_template_sections section
  where section.organization_id = v_run.organization_id
    and section.version_id = v_run.template_version_id
  order by section.sort_order, section.section_key, section.id;

  insert into public.routine_run_tasks (
    organization_id, run_id, run_section_id, source_version_id, source_task_id,
    task_key_snapshot, title_snapshot, instructions_snapshot, done_criteria_snapshot,
    task_type_snapshot, criticality_snapshot, mandatory_snapshot,
    initial_assessment_policy_snapshot, completion_policy_snapshot,
    not_applicable_policy_snapshot, verification_policy_snapshot,
    repeat_policy_snapshot, availability_mode_snapshot, condition_json_snapshot,
    location_id_snapshot, location_key_snapshot, location_name_snapshot,
    location_set_id_snapshot, location_set_key_snapshot, location_description_snapshot,
    visible_day_offset_snapshot, visible_from_local_time_snapshot,
    start_day_offset_snapshot, start_from_local_time_snapshot,
    target_day_offset_snapshot, target_local_time_snapshot,
    overdue_day_offset_snapshot, overdue_local_time_snapshot,
    hard_deadline_day_offset_snapshot, hard_deadline_local_time_snapshot,
    sort_order_snapshot, active_snapshot, metadata_snapshot,
    source_revision_snapshot, row_snapshot_hash, inclusion_state
  )
  select
    v_run.organization_id, v_run.id, run_section.id, v_run.template_version_id, task.id,
    task.task_key, task.title, task.instructions, task.done_criteria,
    task.task_type, task.criticality, task.mandatory,
    task.initial_assessment_policy, task.completion_policy,
    task.not_applicable_policy, task.verification_policy,
    task.repeat_policy, task.availability_mode, task.condition_json,
    location.id, location.location_key, location.name,
    location_set.id, location_set.set_key, task.location_description,
    task.visible_day_offset, task.visible_from_local_time,
    task.start_day_offset, task.start_from_local_time,
    task.target_day_offset, task.target_local_time,
    task.overdue_day_offset, task.overdue_local_time,
    task.hard_deadline_day_offset, task.hard_deadline_local_time,
    task.sort_order, task.active, task.metadata, task.revision,
    public.routine_run_sha256(
      (to_jsonb(task) - array[
        'id','organization_id','version_id','section_id','location_id','location_set_id',
        'created_at','created_by_auth_user_id','updated_at','updated_by_auth_user_id'
      ]::text[]) || jsonb_build_object(
        'sectionKey', run_section.section_key_snapshot,
        'locationKey', location.location_key, 'locationName', location.name,
        'locationSetKey', location_set.set_key
      )
    ),
    case when task.condition_json = '{}'::jsonb then 'included' else 'pending' end
  from public.routine_template_tasks task
  join public.routine_run_sections run_section
    on run_section.run_id = v_run.id and run_section.source_section_id = task.section_id
  left join public.routine_locations location
    on location.id = task.location_id and location.organization_id = task.organization_id
  left join public.routine_location_sets location_set
    on location_set.id = task.location_set_id and location_set.organization_id = task.organization_id
  where task.organization_id = v_run.organization_id
    and task.version_id = v_run.template_version_id
  order by run_section.sort_order_snapshot, task.sort_order, task.task_key, task.id;

  insert into public.routine_run_condition_evaluations (
    organization_id, run_id, run_task_id, condition_json_snapshot,
    evaluation_state, facts_snapshot
  )
  select
    task.organization_id, task.run_id, task.id, task.condition_json_snapshot,
    case when task.condition_json_snapshot = '{}'::jsonb then 'not_required' else 'pending' end,
    '{}'::jsonb
  from public.routine_run_tasks task
  where task.run_id = v_run.id
  order by task.task_key_snapshot;

  update public.routine_run_tasks task
  set condition_evaluation_id = condition.id
  from public.routine_run_condition_evaluations condition
  where task.run_id = v_run.id
    and condition.run_task_id = task.id;

  for v_item in
    select source_item.*, run_task.id as run_task_id,
           run_task.task_key_snapshot
    from public.routine_template_task_items source_item
    join public.routine_run_tasks run_task
      on run_task.run_id = v_run.id and run_task.source_task_id = source_item.task_id
    where source_item.organization_id = v_run.organization_id
      and source_item.version_id = v_run.template_version_id
    order by run_task.task_key_snapshot, source_item.sort_order, source_item.item_key, source_item.id
  loop
    if v_item.source_kind = 'static' then
      insert into public.routine_run_task_items (
        organization_id, run_id, run_task_id, source_version_id, source_task_item_id,
        item_key_snapshot, label_snapshot, item_type_snapshot, required_snapshot,
        source_kind_snapshot, source_config_snapshot, source_record_snapshot,
        input_schema_snapshot, sort_order_snapshot, active_snapshot, metadata_snapshot,
        generated_from_source, source_revision_snapshot, row_snapshot_hash
      ) values (
        v_run.organization_id, v_run.id, v_item.run_task_id, v_run.template_version_id, v_item.id,
        v_item.item_key, v_item.label, v_item.item_type, v_item.required,
        v_item.source_kind, v_item.source_config, '{}'::jsonb,
        v_item.input_schema, v_item.sort_order * 1000000, v_item.active, v_item.metadata,
        false, v_item.revision,
        public.routine_run_sha256(jsonb_build_object(
          'taskKey', v_item.task_key_snapshot, 'itemKey', v_item.item_key,
          'label', v_item.label, 'itemType', v_item.item_type,
          'required', v_item.required, 'sourceKind', v_item.source_kind,
          'sourceConfig', v_item.source_config, 'inputSchema', v_item.input_schema,
          'sortOrder', v_item.sort_order * 1000000, 'active', v_item.active,
          'metadata', v_item.metadata, 'sourceRevision', v_item.revision
        ))
      );
      insert into public.routine_run_snapshot_sources (
        organization_id, run_id, source_template_item_id, source_kind,
        source_config_snapshot, resolution_state, record_count, snapshot_payload
      ) values (
        v_run.organization_id, v_run.id, v_item.id, v_item.source_kind,
        v_item.source_config, 'not_required', 1, '{}'::jsonb
      );

    elsif v_item.source_kind = 'routine_standard' then
      select jsonb_build_object(
        'standardId', standard.id, 'standardKey', standard.standard_key,
        'label', standard.label, 'valueType', standard.value_type,
        'unit', standard.unit, 'revisionId', revision.id,
        'revisionNumber', revision.revision_number, 'value', revision.value_json,
        'contentHash', revision.content_hash
      ) into v_payload
      from public.routine_standards standard
      join public.routine_standard_revisions revision
        on revision.id = standard.current_revision_id
       and revision.standard_id = standard.id
       and revision.organization_id = standard.organization_id
      where standard.id = v_item.standard_id
        and standard.organization_id = v_run.organization_id
        and standard.active;
      if v_payload is null then
        raise exception using errcode = 'P0001', message = 'Routine standard source requires an active standard with a current revision.';
      end if;

      insert into public.routine_run_task_items (
        organization_id, run_id, run_task_id, source_version_id, source_task_item_id,
        item_key_snapshot, label_snapshot, item_type_snapshot, required_snapshot,
        source_kind_snapshot, source_config_snapshot,
        standard_id_snapshot, standard_key_snapshot, standard_revision_id_snapshot,
        standard_revision_number_snapshot, standard_value_snapshot,
        source_record_snapshot, input_schema_snapshot, sort_order_snapshot,
        active_snapshot, metadata_snapshot, generated_from_source,
        source_revision_snapshot, row_snapshot_hash
      ) values (
        v_run.organization_id, v_run.id, v_item.run_task_id, v_run.template_version_id, v_item.id,
        v_item.item_key, v_item.label, v_item.item_type, v_item.required,
        v_item.source_kind, v_item.source_config,
        (v_payload->>'standardId')::uuid, v_payload->>'standardKey',
        (v_payload->>'revisionId')::uuid, (v_payload->>'revisionNumber')::bigint,
        jsonb_build_object('value', v_payload->'value', 'unit', v_payload->'unit', 'valueType', v_payload->'valueType'),
        v_payload, v_item.input_schema, v_item.sort_order * 1000000,
        v_item.active, v_item.metadata, false, v_item.revision,
        public.routine_run_sha256(jsonb_build_object(
          'taskKey', v_item.task_key_snapshot, 'itemKey', v_item.item_key,
          'label', v_item.label, 'itemType', v_item.item_type,
          'required', v_item.required, 'sourceKind', v_item.source_kind,
          'sourceConfig', v_item.source_config, 'standard', v_payload,
          'inputSchema', v_item.input_schema, 'sortOrder', v_item.sort_order * 1000000,
          'active', v_item.active, 'metadata', v_item.metadata,
          'sourceRevision', v_item.revision
        ))
      );
      insert into public.routine_run_snapshot_sources (
        organization_id, run_id, source_template_item_id, source_kind,
        source_config_snapshot, resolution_state, record_count, source_hash, snapshot_payload
      ) values (
        v_run.organization_id, v_run.id, v_item.id, v_item.source_kind,
        v_item.source_config, 'resolved', 1, public.routine_run_sha256(v_payload), v_payload
      );

    elsif v_item.source_kind = 'location_set' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'locationId', location.id, 'locationKey', location.location_key,
        'locationName', location.name, 'required', member.required,
        'memberMetadata', member.metadata, 'memberSortOrder', member.sort_order,
        'setKey', location_set.set_key, 'setRevision', location_set.revision
      ) order by member.sort_order, location.location_key, location.id), '[]'::jsonb), count(*)
      into v_payload, v_count
      from public.routine_location_sets location_set
      join public.routine_location_set_members member
        on member.location_set_id = location_set.id
       and member.organization_id = location_set.organization_id
      join public.routine_locations location
        on location.id = member.location_id
       and location.organization_id = member.organization_id
      where location_set.id = v_item.source_location_set_id
        and location_set.organization_id = v_run.organization_id
        and location_set.active and location.active;
      if v_count = 0 then
        raise exception using errcode = 'P0001', message = 'Location-set snapshot source resolved no active members.';
      end if;

      insert into public.routine_run_task_items (
        organization_id, run_id, run_task_id, source_version_id, source_task_item_id,
        item_key_snapshot, label_snapshot, item_type_snapshot, required_snapshot,
        source_kind_snapshot, source_config_snapshot,
        source_location_set_id_snapshot, source_location_set_key_snapshot,
        location_id_snapshot, location_key_snapshot, location_name_snapshot,
        source_record_snapshot, input_schema_snapshot, sort_order_snapshot,
        active_snapshot, metadata_snapshot, generated_from_source,
        source_revision_snapshot, row_snapshot_hash
      )
      select
        v_run.organization_id, v_run.id, v_item.run_task_id, v_run.template_version_id, v_item.id,
        v_item.item_key || '-location-' || (expanded.member_value->>'locationKey'),
        v_item.label || ': ' || (expanded.member_value->>'locationName'), v_item.item_type,
        v_item.required and (expanded.member_value->>'required')::boolean,
        v_item.source_kind, v_item.source_config,
        v_item.source_location_set_id, expanded.member_value->>'setKey',
        (expanded.member_value->>'locationId')::uuid, expanded.member_value->>'locationKey', expanded.member_value->>'locationName',
        expanded.member_value, v_item.input_schema,
        v_item.sort_order * 1000000 + (expanded.member_value->>'memberSortOrder')::integer,
        v_item.active, v_item.metadata, true, v_item.revision,
        public.routine_run_sha256(jsonb_build_object(
          'taskKey', v_item.task_key_snapshot,
          'itemKey', v_item.item_key || '-location-' || (expanded.member_value->>'locationKey'),
          'label', v_item.label || ': ' || (expanded.member_value->>'locationName'),
          'itemType', v_item.item_type,
          'required', v_item.required and (expanded.member_value->>'required')::boolean,
          'sourceKind', v_item.source_kind, 'sourceConfig', v_item.source_config,
          'sourceRecord', expanded.member_value, 'inputSchema', v_item.input_schema,
          'sortOrder', v_item.sort_order * 1000000 + (expanded.member_value->>'memberSortOrder')::integer,
          'active', v_item.active, 'metadata', v_item.metadata,
          'sourceRevision', v_item.revision
        ))
      from jsonb_array_elements(v_payload) as expanded(member_value);
      insert into public.routine_run_snapshot_sources (
        organization_id, run_id, source_template_item_id, source_kind,
        source_config_snapshot, resolution_state, record_count, source_hash, snapshot_payload
      ) values (
        v_run.organization_id, v_run.id, v_item.id, v_item.source_kind,
        v_item.source_config, 'resolved', v_count, public.routine_run_sha256(v_payload), v_payload
      );

    elsif v_item.source_kind = 'inventory_readonly' then
      if v_item.source_config->>'mode' is distinct from 'location_standards'
         or jsonb_typeof(v_item.source_config->'locationCodes') is distinct from 'array'
         or jsonb_array_length(v_item.source_config->'locationCodes') = 0
         or exists (
           select 1 from jsonb_array_elements(v_item.source_config->'locationCodes') value
           where jsonb_typeof(value) <> 'string' or nullif(trim(value #>> '{}'), '') is null
         )
         or (v_item.source_config ? 'activeOnly'
             and jsonb_typeof(v_item.source_config->'activeOnly') <> 'boolean') then
        raise exception using errcode = 'P0001', message = 'Invalid inventory_readonly location_standards source configuration.';
      end if;
      select count(*) into v_missing
      from (
        select distinct lower(trim(value)) as code
        from jsonb_array_elements_text(v_item.source_config->'locationCodes') value
      ) configured
      where not exists (
        select 1 from public.inventory_locations location
        where location.organization_id = v_run.organization_id
          and lower(trim(location.code)) = configured.code
          and (not coalesce((v_item.source_config->>'activeOnly')::boolean, true) or location.active)
      );
      if v_missing > 0 then
        raise exception using errcode = 'P0001', message = 'A mandatory configured inventory location is missing or inactive.';
      end if;

      select coalesce(jsonb_agg(jsonb_build_object(
        'inventoryLocationId', location.id, 'locationCode', location.code,
        'locationName', location.name, 'productId', product.id,
        'productName', product.name, 'productShortName', product.short_name,
        'unit', product.unit_label, 'targetQuantity', standard.par_quantity,
        'parQuantity', standard.par_quantity, 'countOrder', standard.count_order,
        'stockPolicy', standard.stock_policy,
        'sourceUpdatedAt', greatest(location.updated_at, product.updated_at, standard.updated_at)
      ) order by location.sort_order, lower(location.code), standard.count_order,
                 product.sort_order, lower(product.name), product.id), '[]'::jsonb), count(*)
      into v_payload, v_count
      from public.inventory_locations location
      join public.inventory_location_products standard
        on standard.location_id = location.id
       and standard.organization_id = location.organization_id
      join public.inventory_products product
        on product.id = standard.product_id
       and product.organization_id = standard.organization_id
      where location.organization_id = v_run.organization_id
        and lower(trim(location.code)) in (
          select lower(trim(value)) from jsonb_array_elements_text(v_item.source_config->'locationCodes') value
        )
        and (
          not coalesce((v_item.source_config->>'activeOnly')::boolean, true)
          or (location.active and standard.active and product.active)
        );

      insert into public.routine_run_task_items (
        organization_id, run_id, run_task_id, source_version_id, source_task_item_id,
        item_key_snapshot, label_snapshot, item_type_snapshot, required_snapshot,
        source_kind_snapshot, source_config_snapshot,
        location_id_snapshot, location_key_snapshot, location_name_snapshot,
        external_source_type_snapshot, external_source_id_snapshot,
        external_source_revision_snapshot, source_record_snapshot,
        input_schema_snapshot, sort_order_snapshot, active_snapshot, metadata_snapshot,
        generated_from_source, source_revision_snapshot, row_snapshot_hash
      )
      select
        v_run.organization_id, v_run.id, v_item.run_task_id, v_run.template_version_id, v_item.id,
        v_item.item_key || '-inventory-'
          || regexp_replace(lower(record->>'locationCode'), '[^a-z0-9]+', '-', 'g')
          || '-' || (record->>'productId'),
        v_item.label || ': ' || (record->>'locationName') || ' / ' || (record->>'productName'),
        v_item.item_type, v_item.required, v_item.source_kind, v_item.source_config,
        (record->>'inventoryLocationId')::uuid, record->>'locationCode', record->>'locationName',
        'inventory_location_standard', record->>'productId', record->>'sourceUpdatedAt', record,
        v_item.input_schema, v_item.sort_order * 1000000 + ordinal::integer,
        v_item.active, v_item.metadata, true, v_item.revision,
        public.routine_run_sha256(jsonb_build_object(
          'taskKey', v_item.task_key_snapshot,
          'itemKey', v_item.item_key || '-inventory-'
            || regexp_replace(lower(record->>'locationCode'), '[^a-z0-9]+', '-', 'g')
            || '-' || (record->>'productId'),
          'label', v_item.label || ': ' || (record->>'locationName') || ' / ' || (record->>'productName'),
          'itemType', v_item.item_type, 'required', v_item.required,
          'sourceKind', v_item.source_kind, 'sourceConfig', v_item.source_config,
          'sourceRecord', record, 'inputSchema', v_item.input_schema,
          'sortOrder', v_item.sort_order * 1000000 + ordinal::integer,
          'active', v_item.active, 'metadata', v_item.metadata,
          'sourceRevision', v_item.revision
        ))
      from jsonb_array_elements(v_payload) with ordinality expanded(record, ordinal);
      insert into public.routine_run_snapshot_sources (
        organization_id, run_id, source_template_item_id, source_kind,
        source_config_snapshot, resolution_state, record_count, source_hash, snapshot_payload
      ) values (
        v_run.organization_id, v_run.id, v_item.id, v_item.source_kind,
        v_item.source_config, 'resolved', v_count, public.routine_run_sha256(v_payload), v_payload
      );

    elsif v_item.source_kind = 'asset_registry_readonly' then
      if v_item.source_config->>'mode' is distinct from 'active_assets'
         or (v_item.source_config ? 'venue' and jsonb_typeof(v_item.source_config->'venue') <> 'string')
         or (v_item.source_config ? 'venues' and jsonb_typeof(v_item.source_config->'venues') <> 'array')
         or (v_item.source_config ? 'assetTypes' and jsonb_typeof(v_item.source_config->'assetTypes') <> 'array')
         or (v_item.source_config ? 'requiredForClosing'
             and jsonb_typeof(v_item.source_config->'requiredForClosing') <> 'boolean') then
        raise exception using errcode = 'P0001', message = 'Invalid asset_registry_readonly active_assets source configuration.';
      end if;
      select coalesce(jsonb_agg(jsonb_build_object(
        'assetId', asset.id, 'assetType', asset.asset_type,
        'provider', asset.provider, 'model', asset.model,
        'serialNumber', asset.serial_number, 'localReference', asset.local_id,
        'expectedVenue', asset.expected_venue, 'expectedStation', asset.expected_station,
        'condition', asset.condition, 'active', asset.active,
        'requiredForClosing', asset.default_required_for_closing,
        'sourceUpdatedAt', asset.updated_at
      ) order by lower(coalesce(asset.expected_venue, '')),
                 lower(coalesce(asset.expected_station, '')),
                 asset.asset_type, lower(coalesce(asset.provider, '')),
                 lower(coalesce(asset.model, '')), asset.id), '[]'::jsonb), count(*)
      into v_payload, v_count
      from public.asset_registry asset
      where asset.organization_id = v_run.organization_id
        and asset.active
        and (not (v_item.source_config ? 'venue')
             or lower(coalesce(asset.expected_venue, '')) = lower(v_item.source_config->>'venue'))
        and (not (v_item.source_config ? 'venues') or lower(coalesce(asset.expected_venue, '')) in (
          select lower(value) from jsonb_array_elements_text(v_item.source_config->'venues') value
        ))
        and (not (v_item.source_config ? 'assetTypes') or asset.asset_type in (
          select value from jsonb_array_elements_text(v_item.source_config->'assetTypes') value
        ))
        and (not (v_item.source_config ? 'requiredForClosing')
             or asset.default_required_for_closing = (v_item.source_config->>'requiredForClosing')::boolean);

      insert into public.routine_run_task_items (
        organization_id, run_id, run_task_id, source_version_id, source_task_item_id,
        item_key_snapshot, label_snapshot, item_type_snapshot, required_snapshot,
        source_kind_snapshot, source_config_snapshot,
        external_source_type_snapshot, external_source_id_snapshot,
        external_source_revision_snapshot, source_record_snapshot,
        input_schema_snapshot, sort_order_snapshot, active_snapshot, metadata_snapshot,
        generated_from_source, source_revision_snapshot, row_snapshot_hash
      )
      select
        v_run.organization_id, v_run.id, v_item.run_task_id, v_run.template_version_id, v_item.id,
        v_item.item_key || '-asset-' || (record->>'assetId'),
        v_item.label || ': ' || coalesce(nullif(record->>'model', ''), record->>'assetType'),
        v_item.item_type, v_item.required, v_item.source_kind, v_item.source_config,
        'asset_registry', record->>'assetId', record->>'sourceUpdatedAt', record,
        v_item.input_schema, v_item.sort_order * 1000000 + ordinal::integer,
        v_item.active, v_item.metadata, true, v_item.revision,
        public.routine_run_sha256(jsonb_build_object(
          'taskKey', v_item.task_key_snapshot,
          'itemKey', v_item.item_key || '-asset-' || (record->>'assetId'),
          'label', v_item.label || ': ' || coalesce(nullif(record->>'model', ''), record->>'assetType'),
          'itemType', v_item.item_type, 'required', v_item.required,
          'sourceKind', v_item.source_kind, 'sourceConfig', v_item.source_config,
          'sourceRecord', record, 'inputSchema', v_item.input_schema,
          'sortOrder', v_item.sort_order * 1000000 + ordinal::integer,
          'active', v_item.active, 'metadata', v_item.metadata,
          'sourceRevision', v_item.revision
        ))
      from jsonb_array_elements(v_payload) with ordinality expanded(record, ordinal);
      insert into public.routine_run_snapshot_sources (
        organization_id, run_id, source_template_item_id, source_kind,
        source_config_snapshot, resolution_state, record_count, source_hash, snapshot_payload
      ) values (
        v_run.organization_id, v_run.id, v_item.id, v_item.source_kind,
        v_item.source_config, 'resolved', v_count, public.routine_run_sha256(v_payload), v_payload
      );

    elsif v_item.source_kind = 'event_context' then
      insert into public.routine_run_task_items (
        organization_id, run_id, run_task_id, source_version_id, source_task_item_id,
        item_key_snapshot, label_snapshot, item_type_snapshot, required_snapshot,
        source_kind_snapshot, source_config_snapshot,
        external_source_type_snapshot, source_record_snapshot,
        input_schema_snapshot, sort_order_snapshot, active_snapshot, metadata_snapshot,
        generated_from_source, source_revision_snapshot, row_snapshot_hash
      ) values (
        v_run.organization_id, v_run.id, v_item.run_task_id, v_run.template_version_id, v_item.id,
        v_item.item_key, v_item.label, v_item.item_type, v_item.required,
        v_item.source_kind, v_item.source_config, 'event_context', '{}'::jsonb,
        v_item.input_schema, v_item.sort_order * 1000000, v_item.active, v_item.metadata,
        false, v_item.revision,
        public.routine_run_sha256(jsonb_build_object(
          'taskKey', v_item.task_key_snapshot, 'itemKey', v_item.item_key,
          'label', v_item.label, 'itemType', v_item.item_type,
          'required', v_item.required, 'sourceKind', v_item.source_kind,
          'sourceConfig', v_item.source_config, 'resolutionState', 'pending_external',
          'inputSchema', v_item.input_schema, 'sortOrder', v_item.sort_order * 1000000,
          'active', v_item.active, 'metadata', v_item.metadata,
          'sourceRevision', v_item.revision
        ))
      );
      insert into public.routine_run_snapshot_sources (
        organization_id, run_id, source_template_item_id, source_kind,
        source_config_snapshot, resolution_state, record_count, snapshot_payload,
        warning_message
      ) values (
        v_run.organization_id, v_run.id, v_item.id, v_item.source_kind,
        v_item.source_config, 'pending_external', 0, '{}'::jsonb,
        'Event Operations context is intentionally deferred to Phase 10H.'
      );
    else
      raise exception using errcode = 'P0001', message = 'Unsupported routine task-item source kind.';
    end if;
  end loop;

  insert into public.routine_run_task_dependencies (
    organization_id, run_id, predecessor_run_task_id, successor_run_task_id,
    dependency_type_snapshot, metadata_snapshot, source_dependency_id, row_snapshot_hash
  )
  select
    v_run.organization_id, v_run.id, predecessor.id, successor.id,
    dependency.dependency_type, dependency.metadata, dependency.id,
    public.routine_run_sha256(jsonb_build_object(
      'predecessorTaskKey', predecessor.task_key_snapshot,
      'successorTaskKey', successor.task_key_snapshot,
      'dependencyType', dependency.dependency_type,
      'metadata', dependency.metadata
    ))
  from public.routine_template_task_dependencies dependency
  join public.routine_run_tasks predecessor
    on predecessor.run_id = v_run.id and predecessor.source_task_id = dependency.predecessor_task_id
  join public.routine_run_tasks successor
    on successor.run_id = v_run.id and successor.source_task_id = dependency.successor_task_id
  where dependency.organization_id = v_run.organization_id
    and dependency.version_id = v_run.template_version_id;

  insert into public.routine_run_task_relations (
    organization_id, run_id, source_run_task_id, target_routine_key_snapshot,
    target_task_key_snapshot, relation_type_snapshot, metadata_snapshot,
    source_relation_id, row_snapshot_hash
  )
  select
    v_run.organization_id, v_run.id, source_task.id, relation.target_routine_key,
    relation.target_task_key, relation.relation_type, relation.metadata, relation.id,
    public.routine_run_sha256(jsonb_build_object(
      'sourceTaskKey', source_task.task_key_snapshot,
      'targetRoutineKey', relation.target_routine_key,
      'targetTaskKey', relation.target_task_key,
      'relationType', relation.relation_type,
      'metadata', relation.metadata
    ))
  from public.routine_template_task_relations relation
  join public.routine_run_tasks source_task
    on source_task.run_id = v_run.id and source_task.source_task_id = relation.source_task_id
  where relation.organization_id = v_run.organization_id
    and relation.version_id = v_run.template_version_id;

  insert into public.routine_run_task_reference_images (
    organization_id, run_id, run_task_id, run_task_item_id,
    source_template_link_id, reference_id_snapshot, reference_key_snapshot,
    reference_label_snapshot, reference_version_id_snapshot,
    reference_version_number_snapshot, image_state_snapshot, object_path_snapshot,
    mime_type_snapshot, byte_size_snapshot, caption_snapshot, alt_text_snapshot,
    placeholder_text_snapshot, button_label_snapshot, context_note_snapshot,
    sort_order_snapshot, active_snapshot, row_snapshot_hash
  )
  select
    v_run.organization_id, v_run.id, run_task.id, null,
    link.id, reference.id, reference.reference_key, reference.label,
    version.id, version.version_number, version.state, version.object_path,
    version.mime_type, version.byte_size, version.caption, version.alt_text,
    reference.placeholder_text, link.button_label, link.context_note,
    link.sort_order * 1000000, link.active,
    public.routine_run_sha256(jsonb_build_object(
      'taskKey', run_task.task_key_snapshot, 'itemKey', null,
      'referenceId', reference.id, 'referenceKey', reference.reference_key,
      'referenceLabel', reference.label, 'versionId', version.id,
      'versionNumber', version.version_number, 'state', version.state,
      'objectPath', version.object_path, 'mimeType', version.mime_type,
      'byteSize', version.byte_size, 'caption', version.caption,
      'altText', version.alt_text, 'placeholderText', reference.placeholder_text,
      'buttonLabel', link.button_label, 'contextNote', link.context_note,
      'sortOrder', link.sort_order * 1000000, 'active', link.active
    ))
  from public.routine_template_task_reference_images link
  join public.routine_run_tasks run_task
    on run_task.run_id = v_run.id and run_task.source_task_id = link.task_id
  join public.routine_reference_images reference
    on reference.id = link.reference_id and reference.organization_id = link.organization_id
  join public.routine_reference_image_versions version
    on version.id = reference.current_version_id
   and version.organization_id = reference.organization_id
   and version.reference_id = reference.id
   and version.state in ('active_image', 'placeholder')
  where link.organization_id = v_run.organization_id
    and link.version_id = v_run.template_version_id
    and link.task_item_id is null;

  insert into public.routine_run_task_reference_images (
    organization_id, run_id, run_task_id, run_task_item_id,
    source_template_link_id, reference_id_snapshot, reference_key_snapshot,
    reference_label_snapshot, reference_version_id_snapshot,
    reference_version_number_snapshot, image_state_snapshot, object_path_snapshot,
    mime_type_snapshot, byte_size_snapshot, caption_snapshot, alt_text_snapshot,
    placeholder_text_snapshot, button_label_snapshot, context_note_snapshot,
    sort_order_snapshot, active_snapshot, row_snapshot_hash
  )
  select
    v_run.organization_id, v_run.id, run_task.id, run_item.id,
    link.id, reference.id, reference.reference_key, reference.label,
    version.id, version.version_number, version.state, version.object_path,
    version.mime_type, version.byte_size, version.caption, version.alt_text,
    reference.placeholder_text, link.button_label, link.context_note,
    link.sort_order * 1000000 + run_item.sort_order_snapshot, link.active,
    public.routine_run_sha256(jsonb_build_object(
      'taskKey', run_task.task_key_snapshot, 'itemKey', run_item.item_key_snapshot,
      'referenceId', reference.id, 'referenceKey', reference.reference_key,
      'referenceLabel', reference.label, 'versionId', version.id,
      'versionNumber', version.version_number, 'state', version.state,
      'objectPath', version.object_path, 'mimeType', version.mime_type,
      'byteSize', version.byte_size, 'caption', version.caption,
      'altText', version.alt_text, 'placeholderText', reference.placeholder_text,
      'buttonLabel', link.button_label, 'contextNote', link.context_note,
      'sortOrder', link.sort_order * 1000000 + run_item.sort_order_snapshot,
      'active', link.active
    ))
  from public.routine_template_task_reference_images link
  join public.routine_run_tasks run_task
    on run_task.run_id = v_run.id and run_task.source_task_id = link.task_id
  join public.routine_run_task_items run_item
    on run_item.run_task_id = run_task.id and run_item.source_task_item_id = link.task_item_id
  join public.routine_reference_images reference
    on reference.id = link.reference_id and reference.organization_id = link.organization_id
  join public.routine_reference_image_versions version
    on version.id = reference.current_version_id
   and version.organization_id = reference.organization_id
   and version.reference_id = reference.id
   and version.state in ('active_image', 'placeholder')
  where link.organization_id = v_run.organization_id
    and link.version_id = v_run.template_version_id
    and link.task_item_id is not null;

  select count(*) into v_expected
  from public.routine_template_sections where version_id = v_run.template_version_id;
  select count(*) into v_actual from public.routine_run_sections where run_id = v_run.id;
  if v_actual <> v_expected then
    raise exception using errcode = 'P0001', message = 'Routine section snapshot count mismatch.';
  end if;
  select count(*) into v_expected
  from public.routine_template_tasks where version_id = v_run.template_version_id;
  select count(*) into v_actual from public.routine_run_tasks where run_id = v_run.id;
  if v_actual <> v_expected then
    raise exception using errcode = 'P0001', message = 'Routine task snapshot count mismatch.';
  end if;
  if exists (
    select 1 from public.routine_run_tasks task
    where task.run_id = v_run.id and task.condition_evaluation_id is null
  ) then
    raise exception using errcode = 'P0001', message = 'Routine condition snapshot integrity check failed.';
  end if;
  select count(*) into v_expected
  from public.routine_template_task_dependencies where version_id = v_run.template_version_id;
  select count(*) into v_actual from public.routine_run_task_dependencies where run_id = v_run.id;
  if v_actual <> v_expected then
    raise exception using errcode = 'P0001', message = 'Routine dependency snapshot count mismatch.';
  end if;
  select count(*) into v_expected
  from public.routine_template_task_relations where version_id = v_run.template_version_id;
  select count(*) into v_actual from public.routine_run_task_relations where run_id = v_run.id;
  if v_actual <> v_expected then
    raise exception using errcode = 'P0001', message = 'Routine relation snapshot count mismatch.';
  end if;
  select count(*) into v_expected
  from public.routine_template_task_reference_images where version_id = v_run.template_version_id;
  select count(distinct source_template_link_id) into v_actual
  from public.routine_run_task_reference_images where run_id = v_run.id;
  if v_actual <> v_expected then
    raise exception using errcode = 'P0001', message = 'Routine reference-image snapshot count mismatch.';
  end if;

  v_hash := public.routine_compute_run_snapshot_hash(v_run.id);
  update public.routine_runs
  set snapshot_state = 'ready', snapshot_hash = v_hash,
      status = 'scheduled', updated_at = now()
  where id = v_run.id;

  return jsonb_build_object(
    'snapshotHash', v_hash,
    'sectionCount', (select count(*) from public.routine_run_sections where run_id = v_run.id),
    'taskCount', (select count(*) from public.routine_run_tasks where run_id = v_run.id),
    'itemCount', (select count(*) from public.routine_run_task_items where run_id = v_run.id),
    'sourceCount', (select count(*) from public.routine_run_snapshot_sources where run_id = v_run.id),
    'conditionCount', (select count(*) from public.routine_run_condition_evaluations where run_id = v_run.id),
    'dependencyCount', (select count(*) from public.routine_run_task_dependencies where run_id = v_run.id),
    'relationCount', (select count(*) from public.routine_run_task_relations where run_id = v_run.id),
    'referenceImageCount', (select count(*) from public.routine_run_task_reference_images where run_id = v_run.id)
  );
end;
$$;

do $phase10d_assigned_participant_fkey$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'routine_run_tasks_assigned_participant_fkey'
      and conrelid = 'public.routine_run_tasks'::regclass
  ) then
    alter table public.routine_run_tasks
      add constraint routine_run_tasks_assigned_participant_fkey
      foreign key (assigned_participant_id, organization_id, run_id)
      references public.routine_run_participants(id, organization_id, run_id);
  end if;
end;
$phase10d_assigned_participant_fkey$;

create or replace function public.routine_run_is_visible(
  input_run_id uuid,
  input_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    input_organization_id = public.routine_current_user_organization_id()
    and exists (
      select 1 from public.routine_runs run
      where run.id = input_run_id
        and run.organization_id = input_organization_id
        and run.snapshot_state = 'ready'
    )
    and (
      public.routine_current_user_can_coordinate_runs()
      or exists (
        select 1 from public.routine_run_participants participant
        where participant.run_id = input_run_id
          and participant.organization_id = input_organization_id
          and participant.user_profile_id = auth.uid()
          and participant.participation_status <> 'removed'
      )
    );
$$;

create or replace function public.create_or_get_routine_run(
  input_routine_key text,
  input_scope_key text,
  input_operational_date date,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_settings public.routine_organization_settings%rowtype;
  v_template public.routine_templates%rowtype;
  v_version public.routine_template_versions%rowtype;
  v_run public.routine_runs%rowtype;
  v_participant public.routine_run_participants%rowtype;
  v_request_hash text;
  v_replay jsonb;
  v_snapshot jsonb;
  v_response jsonb;
  v_routine_key text := lower(trim(coalesce(input_routine_key, '')));
  v_scope_key text := lower(trim(coalesce(input_scope_key, '')));
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role not in ('manager', 'shift_lead') then
    raise exception using errcode = 'P0001', message = 'Routine run coordinator permission is required.';
  end if;
  if input_operational_date is null or input_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'Operational date and idempotency key are required.';
  end if;
  if v_routine_key !~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
     or char_length(v_routine_key) > 80
     or v_scope_key !~ '^[a-z][a-z0-9]*(?:[-_:][a-z0-9]+)*$'
     or char_length(v_scope_key) > 120 then
    raise exception using errcode = 'P0001', message = 'Routine key or scope key has invalid syntax.';
  end if;

  v_request_hash := public.routine_run_request_hash(jsonb_build_object(
    'routineKey', v_routine_key, 'scopeKey', v_scope_key,
    'operationalDate', input_operational_date
  ));
  v_replay := public.routine_run_operation_replay(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'create_run',
    input_idempotency_key, v_request_hash
  );
  if v_replay is not null then return v_replay; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    v_actor.organization_id::text || '|' || input_operational_date::text
      || '|' || v_routine_key || '|' || v_scope_key, 10
  ));
  v_replay := public.routine_run_operation_replay(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'create_run',
    input_idempotency_key, v_request_hash
  );
  if v_replay is not null then return v_replay; end if;

  select settings.* into v_settings
  from public.routine_organization_settings settings
  where settings.organization_id = v_actor.organization_id
  for share;
  if v_settings.organization_id is null or v_settings.timezone <> 'Europe/Oslo' then
    raise exception using errcode = 'P0001', message = 'Routine organization settings with Europe/Oslo timezone are required.';
  end if;

  select template.* into v_template
  from public.routine_templates template
  where template.organization_id = v_actor.organization_id
    and template.routine_key = v_routine_key
    and template.active
    and template.current_published_version_id is not null
  for update;
  if v_template.id is null then
    raise exception using errcode = 'P0001', message = 'An active routine template with a current published version is required.';
  end if;
  select version.* into v_version
  from public.routine_template_versions version
  where version.id = v_template.current_published_version_id
    and version.organization_id = v_template.organization_id
    and version.template_id = v_template.id
    and version.state = 'published'
  for update;
  if v_version.id is null then
    raise exception using errcode = 'P0001', message = 'An active routine template with a current published version is required.';
  end if;
  if public.routine_template_version_content_hash(v_version.id) is distinct from v_version.content_hash then
    raise exception using errcode = 'P0001', message = 'Published routine template content hash verification failed.';
  end if;

  select run.* into v_run
  from public.routine_runs run
  where run.organization_id = v_actor.organization_id
    and run.operational_date = input_operational_date
    and run.routine_key = v_routine_key
    and run.scope_key = v_scope_key
    and run.status not in ('cancelled', 'superseded')
  for update;

  if v_run.id is null then
    insert into public.routine_runs (
      organization_id, routine_key, scope_key, operational_date, timezone,
      template_id, template_version_id, template_version_number_snapshot,
      template_content_hash_snapshot, creation_idempotency_key,
      creation_request_hash, created_by_auth_user_id, updated_by_auth_user_id
    ) values (
      v_actor.organization_id, v_routine_key, v_scope_key, input_operational_date,
      v_settings.timezone, v_template.id, v_version.id, v_version.version_number,
      v_version.content_hash, input_idempotency_key, v_request_hash,
      v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
    ) returning * into v_run;
    v_snapshot := public.routine_build_run_snapshot(v_run.id);
    select run.* into v_run from public.routine_runs run where run.id = v_run.id;
  else
    if v_run.snapshot_state <> 'ready' then
      raise exception using errcode = 'P0001', message = 'An authoritative routine run is not ready.';
    end if;
    v_snapshot := jsonb_build_object(
      'snapshotHash', v_run.snapshot_hash,
      'sectionCount', (select count(*) from public.routine_run_sections where run_id = v_run.id),
      'taskCount', (select count(*) from public.routine_run_tasks where run_id = v_run.id),
      'itemCount', (select count(*) from public.routine_run_task_items where run_id = v_run.id),
      'sourceCount', (select count(*) from public.routine_run_snapshot_sources where run_id = v_run.id),
      'conditionCount', (select count(*) from public.routine_run_condition_evaluations where run_id = v_run.id),
      'dependencyCount', (select count(*) from public.routine_run_task_dependencies where run_id = v_run.id),
      'relationCount', (select count(*) from public.routine_run_task_relations where run_id = v_run.id),
      'referenceImageCount', (select count(*) from public.routine_run_task_reference_images where run_id = v_run.id)
    );
  end if;

  insert into public.routine_run_participants (
    organization_id, run_id, user_profile_id, display_name_snapshot,
    role_snapshot, participation_status, joined_at, creation_idempotency_key,
    created_by_auth_user_id, updated_by_auth_user_id
  ) values (
    v_actor.organization_id, v_run.id, v_actor.actor_profile_id,
    v_actor.actor_display_name, v_actor.actor_role, 'active', now(),
    input_idempotency_key, v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
  ) on conflict (run_id, user_profile_id) do nothing;
  select participant.* into v_participant
  from public.routine_run_participants participant
  where participant.run_id = v_run.id
    and participant.user_profile_id = v_actor.actor_profile_id;

  v_response := jsonb_build_object(
    'run', to_jsonb(v_run), 'participant', to_jsonb(v_participant),
    'snapshot', v_snapshot, 'idempotentReplay', false
  );
  perform public.routine_record_run_operation(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'create_run',
    input_idempotency_key, v_request_hash, 'run', v_run.id, v_response
  );
  return v_response;
end;
$$;

create or replace function public.join_routine_run(
  input_run_id uuid,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_run public.routine_runs%rowtype;
  v_participant public.routine_run_participants%rowtype;
  v_request_hash text;
  v_replay jsonb;
  v_response jsonb;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role not in ('manager', 'shift_lead', 'staff') then
    raise exception using errcode = 'P0001', message = 'Active personal routine task-performer access is required.';
  end if;
  if input_run_id is null or input_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'Run and idempotency key are required.';
  end if;
  v_request_hash := public.routine_run_request_hash(jsonb_build_object('runId', input_run_id));
  v_replay := public.routine_run_operation_replay(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'join_run',
    input_idempotency_key, v_request_hash
  );
  if v_replay is not null then return v_replay; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    v_actor.organization_id::text || '|' || input_run_id::text
      || '|' || v_actor.actor_profile_id::text, 11
  ));
  v_replay := public.routine_run_operation_replay(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'join_run',
    input_idempotency_key, v_request_hash
  );
  if v_replay is not null then return v_replay; end if;

  select run.* into v_run
  from public.routine_runs run
  where run.id = input_run_id
    and run.organization_id = v_actor.organization_id
    and run.snapshot_state = 'ready'
    and run.status in (
      'scheduled', 'in_progress', 'awaiting_final_verification',
      'waiting_for_transfers', 'reopened'
    )
  for share;
  if v_run.id is null then
    raise exception using errcode = 'P0001', message = 'A joinable same-organization routine run was not found.';
  end if;

  insert into public.routine_run_participants (
    organization_id, run_id, user_profile_id, display_name_snapshot,
    role_snapshot, participation_status, joined_at, creation_idempotency_key,
    created_by_auth_user_id, updated_by_auth_user_id
  ) values (
    v_actor.organization_id, v_run.id, v_actor.actor_profile_id,
    v_actor.actor_display_name, v_actor.actor_role, 'active', now(),
    input_idempotency_key, v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
  ) on conflict (run_id, user_profile_id) do nothing;
  select participant.* into v_participant
  from public.routine_run_participants participant
  where participant.run_id = v_run.id
    and participant.user_profile_id = v_actor.actor_profile_id;

  v_response := jsonb_build_object(
    'run', to_jsonb(v_run), 'participant', to_jsonb(v_participant),
    'idempotentReplay', false
  );
  perform public.routine_record_run_operation(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'join_run',
    input_idempotency_key, v_request_hash, 'participant', v_participant.id, v_response
  );
  return v_response;
end;
$$;

create or replace function public.assign_routine_run_role(
  input_run_id uuid,
  input_participant_id uuid,
  input_role_key text,
  input_scope_key text,
  input_replacement_reason text,
  input_expected_run_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_run public.routine_runs%rowtype;
  v_participant public.routine_run_participants%rowtype;
  v_previous public.routine_run_role_assignments%rowtype;
  v_assignment public.routine_run_role_assignments%rowtype;
  v_request_hash text;
  v_replay jsonb;
  v_response jsonb;
  v_role_key text := lower(trim(coalesce(input_role_key, '')));
  v_scope_key text := lower(trim(coalesce(input_scope_key, '')));
  v_reason text := nullif(trim(coalesce(input_replacement_reason, '')), '');
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role not in ('manager', 'shift_lead') then
    raise exception using errcode = 'P0001', message = 'Routine run coordinator permission is required.';
  end if;
  if input_run_id is null or input_participant_id is null
     or input_expected_run_revision is null or input_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'Run, participant, expected revision, and idempotency key are required.';
  end if;
  v_request_hash := public.routine_run_request_hash(jsonb_build_object(
    'runId', input_run_id, 'participantId', input_participant_id,
    'roleKey', v_role_key, 'scopeKey', v_scope_key,
    'replacementReason', v_reason, 'expectedRunRevision', input_expected_run_revision
  ));
  v_replay := public.routine_run_operation_replay(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'assign_role',
    input_idempotency_key, v_request_hash
  );
  if v_replay is not null then return v_replay; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    v_actor.organization_id::text || '|' || input_run_id::text
      || '|' || v_role_key || '|' || v_scope_key, 12
  ));
  v_replay := public.routine_run_operation_replay(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'assign_role',
    input_idempotency_key, v_request_hash
  );
  if v_replay is not null then return v_replay; end if;

  select run.* into v_run
  from public.routine_runs run
  where run.id = input_run_id
    and run.organization_id = v_actor.organization_id
    and run.snapshot_state = 'ready'
    and run.status not in ('cancelled', 'superseded')
  for update;
  if v_run.id is null then
    raise exception using errcode = 'P0001', message = 'A same-organization ready routine run was not found.';
  end if;
  if v_run.revision <> input_expected_run_revision then
    raise exception using errcode = '40001', message = 'Stale routine run revision; refresh before assigning the role.';
  end if;
  select participant.* into v_participant
  from public.routine_run_participants participant
  where participant.id = input_participant_id
    and participant.run_id = v_run.id
    and participant.organization_id = v_run.organization_id
    and participant.participation_status <> 'removed'
  for share;
  if v_participant.id is null then
    raise exception using errcode = 'P0001', message = 'Role assignment requires an active participant in the same run.';
  end if;

  select assignment.* into v_previous
  from public.routine_run_role_assignments assignment
  where assignment.run_id = v_run.id
    and assignment.role_key = v_role_key
    and assignment.scope_key = v_scope_key
    and assignment.status = 'active'
  for update;

  if v_previous.id is not null and v_previous.participant_id = v_participant.id then
    v_assignment := v_previous;
  else
    if v_previous.id is not null and v_reason is null then
      raise exception using errcode = 'P0001', message = 'A substantive replacement reason is required.';
    end if;
    perform set_config('mesh.routine_run_internal', 'assign_role', true);
    if v_previous.id is not null then
      update public.routine_run_role_assignments
      set status = 'superseded', ended_at = now(),
          ended_by_auth_user_id = v_actor.actor_auth_user_id,
          revision = revision + 1
      where id = v_previous.id;
    end if;
    insert into public.routine_run_role_assignments (
      organization_id, run_id, participant_id, role_key, scope_key,
      assigned_by_auth_user_id, replaces_assignment_id, replacement_reason
    ) values (
      v_run.organization_id, v_run.id, v_participant.id, v_role_key, v_scope_key,
      v_actor.actor_auth_user_id, v_previous.id, v_reason
    ) returning * into v_assignment;
    update public.routine_runs
    set revision = revision + 1, updated_by_auth_user_id = v_actor.actor_auth_user_id
    where id = v_run.id
    returning * into v_run;
  end if;

  v_response := jsonb_build_object(
    'run', to_jsonb(v_run), 'assignment', to_jsonb(v_assignment),
    'previousAssignmentId', v_previous.id, 'idempotentReplay', false
  );
  perform public.routine_record_run_operation(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'assign_role',
    input_idempotency_key, v_request_hash, 'role_assignment', v_assignment.id, v_response
  );
  return v_response;
end;
$$;

create or replace function public.verify_routine_run_snapshot(input_run_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_run public.routine_runs%rowtype;
  v_recomputed text;
  v_errors jsonb := '[]'::jsonb;
  v_counts jsonb;
begin
  select run.* into v_run from public.routine_runs run where run.id = input_run_id;
  if v_run.id is null or not public.routine_run_is_visible(v_run.id, v_run.organization_id) then
    raise exception using errcode = 'P0001', message = 'Visible routine run access is required.';
  end if;
  v_recomputed := public.routine_compute_run_snapshot_hash(v_run.id);
  if v_run.snapshot_state <> 'ready' then
    v_errors := v_errors || jsonb_build_array('snapshot_state_not_ready');
  end if;
  if v_run.snapshot_hash is distinct from v_recomputed then
    v_errors := v_errors || jsonb_build_array('snapshot_hash_mismatch');
  end if;
  if exists (
    select 1 from public.routine_run_tasks task
    left join public.routine_run_condition_evaluations condition
      on condition.id = task.condition_evaluation_id and condition.run_task_id = task.id
    where task.run_id = v_run.id and condition.id is null
  ) then
    v_errors := v_errors || jsonb_build_array('condition_reference_integrity');
  end if;
  v_counts := jsonb_build_object(
    'sections', (select count(*) from public.routine_run_sections where run_id = v_run.id),
    'tasks', (select count(*) from public.routine_run_tasks where run_id = v_run.id),
    'items', (select count(*) from public.routine_run_task_items where run_id = v_run.id),
    'sources', (select count(*) from public.routine_run_snapshot_sources where run_id = v_run.id),
    'conditions', (select count(*) from public.routine_run_condition_evaluations where run_id = v_run.id),
    'dependencies', (select count(*) from public.routine_run_task_dependencies where run_id = v_run.id),
    'relations', (select count(*) from public.routine_run_task_relations where run_id = v_run.id),
    'referenceImages', (select count(*) from public.routine_run_task_reference_images where run_id = v_run.id)
  );
  return jsonb_build_object(
    'valid', jsonb_array_length(v_errors) = 0,
    'storedSnapshotHash', v_run.snapshot_hash,
    'recomputedSnapshotHash', v_recomputed,
    'counts', v_counts,
    'integrityErrors', v_errors,
    'sourceWarnings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sourceKind', source.source_kind,
        'templateItemId', source.source_template_item_id,
        'warning', source.warning_message,
        'error', source.error_message
      ) order by source.source_template_item_id)
      from public.routine_run_snapshot_sources source
      where source.run_id = v_run.id
        and (source.warning_message is not null or source.error_message is not null)
    ), '[]'::jsonb),
    'pendingConditionCount', (
      select count(*) from public.routine_run_condition_evaluations
      where run_id = v_run.id and evaluation_state = 'pending'
    ),
    'pendingExternalSourceCount', (
      select count(*) from public.routine_run_snapshot_sources
      where run_id = v_run.id and resolution_state = 'pending_external'
    )
  );
end;
$$;

create or replace function public.get_routine_run_workspace(input_run_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_run public.routine_runs%rowtype;
begin
  select run.* into v_run from public.routine_runs run where run.id = input_run_id;
  if v_run.id is null or not public.routine_run_is_visible(v_run.id, v_run.organization_id) then
    raise exception using errcode = 'P0001', message = 'Visible routine run access is required.';
  end if;
  return jsonb_build_object(
    'run', to_jsonb(v_run),
    'sections', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.sort_order_snapshot, row_value.section_key_snapshot)
      from public.routine_run_sections row_value where row_value.run_id = v_run.id), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.run_section_id, row_value.sort_order_snapshot, row_value.task_key_snapshot)
      from public.routine_run_tasks row_value where row_value.run_id = v_run.id), '[]'::jsonb),
    'taskItems', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.run_task_id, row_value.sort_order_snapshot, row_value.item_key_snapshot)
      from public.routine_run_task_items row_value where row_value.run_id = v_run.id), '[]'::jsonb),
    'referenceImages', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.run_task_id, row_value.sort_order_snapshot, row_value.reference_key_snapshot)
      from public.routine_run_task_reference_images row_value where row_value.run_id = v_run.id), '[]'::jsonb),
    'conditions', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.run_task_id)
      from public.routine_run_condition_evaluations row_value where row_value.run_id = v_run.id), '[]'::jsonb),
    'dependencies', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.predecessor_run_task_id, row_value.successor_run_task_id)
      from public.routine_run_task_dependencies row_value where row_value.run_id = v_run.id), '[]'::jsonb),
    'relations', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.source_run_task_id, row_value.target_routine_key_snapshot, row_value.target_task_key_snapshot)
      from public.routine_run_task_relations row_value where row_value.run_id = v_run.id), '[]'::jsonb),
    'participants', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.display_name_snapshot, row_value.id)
      from public.routine_run_participants row_value where row_value.run_id = v_run.id), '[]'::jsonb),
    'activeRoleAssignments', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.role_key, row_value.scope_key)
      from public.routine_run_role_assignments row_value where row_value.run_id = v_run.id and row_value.status = 'active'), '[]'::jsonb),
    'snapshotSources', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.source_template_item_id, row_value.source_kind)
      from public.routine_run_snapshot_sources row_value where row_value.run_id = v_run.id), '[]'::jsonb),
    'sync', jsonb_build_object(
      'runRevision', v_run.revision, 'snapshotHash', v_run.snapshot_hash,
      'snapshotSchemaVersion', v_run.snapshot_schema_version, 'readOnlyPhase', '10D'
    )
  );
end;
$$;

create or replace function public.list_routine_runs_for_date(input_operational_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
begin
  select * into v_actor from public.routine_resolve_actor();
  if input_operational_date is null then
    raise exception using errcode = 'P0001', message = 'Operational date is required.';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(run) order by run.routine_key, run.scope_key, run.id)
    from public.routine_runs run
    where run.organization_id = v_actor.organization_id
      and run.operational_date = input_operational_date
      and run.snapshot_state = 'ready'
      and (
        v_actor.actor_role in ('manager', 'shift_lead')
        or exists (
          select 1 from public.routine_run_participants participant
          where participant.run_id = run.id
            and participant.user_profile_id = v_actor.actor_profile_id
            and participant.participation_status <> 'removed'
        )
      )
  ), '[]'::jsonb);
end;
$$;

-- Phase 10D extends only the existing routine-reference read predicate. It
-- does not add upload, overwrite, delete, public-bucket, or Inventory Storage
-- access. The exact object path must already be captured in a visible run.
create or replace function public.routine_reference_storage_can_read(input_object_path text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.routine_reference_image_versions version
    join public.routine_reference_images reference
      on reference.id = version.reference_id
     and reference.organization_id = version.organization_id
    where version.organization_id = public.routine_current_user_organization_id()
      and version.object_path = input_object_path
      and (
        public.routine_current_user_can_manage_templates()
        or (
          public.routine_current_user_can_perform_tasks()
          and version.id = reference.current_version_id
          and version.state = 'active_image'
          and reference.active
          and public.routine_reference_is_published_linked(reference.id, reference.organization_id)
        )
        or (
          version.state = 'active_image'
          and exists (
            select 1
            from public.routine_run_task_reference_images run_image
            where run_image.reference_version_id_snapshot = version.id
              and run_image.organization_id = version.organization_id
              and run_image.object_path_snapshot = version.object_path
              and run_image.image_state_snapshot = 'active_image'
              and public.routine_run_is_visible(run_image.run_id, run_image.organization_id)
          )
        )
      )
  );
$$;

alter table public.routine_runs enable row level security;
alter table public.routine_run_sections enable row level security;
alter table public.routine_run_tasks enable row level security;
alter table public.routine_run_task_items enable row level security;
alter table public.routine_run_snapshot_sources enable row level security;
alter table public.routine_run_condition_evaluations enable row level security;
alter table public.routine_run_task_dependencies enable row level security;
alter table public.routine_run_task_relations enable row level security;
alter table public.routine_run_task_reference_images enable row level security;
alter table public.routine_run_participants enable row level security;
alter table public.routine_run_role_assignments enable row level security;
alter table public.routine_run_operations enable row level security;

drop policy if exists routine_runs_read on public.routine_runs;
create policy routine_runs_read on public.routine_runs for select to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and public.routine_run_is_visible(id, organization_id)
);
drop policy if exists routine_run_sections_read on public.routine_run_sections;
create policy routine_run_sections_read on public.routine_run_sections for select to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and public.routine_run_is_visible(run_id, organization_id)
);
drop policy if exists routine_run_tasks_read on public.routine_run_tasks;
create policy routine_run_tasks_read on public.routine_run_tasks for select to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and public.routine_run_is_visible(run_id, organization_id)
);
drop policy if exists routine_run_task_items_read on public.routine_run_task_items;
create policy routine_run_task_items_read on public.routine_run_task_items for select to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and public.routine_run_is_visible(run_id, organization_id)
);
drop policy if exists routine_run_snapshot_sources_read on public.routine_run_snapshot_sources;
create policy routine_run_snapshot_sources_read on public.routine_run_snapshot_sources for select to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and public.routine_run_is_visible(run_id, organization_id)
);
drop policy if exists routine_run_conditions_read on public.routine_run_condition_evaluations;
create policy routine_run_conditions_read on public.routine_run_condition_evaluations for select to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and public.routine_run_is_visible(run_id, organization_id)
);
drop policy if exists routine_run_dependencies_read on public.routine_run_task_dependencies;
create policy routine_run_dependencies_read on public.routine_run_task_dependencies for select to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and public.routine_run_is_visible(run_id, organization_id)
);
drop policy if exists routine_run_relations_read on public.routine_run_task_relations;
create policy routine_run_relations_read on public.routine_run_task_relations for select to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and public.routine_run_is_visible(run_id, organization_id)
);
drop policy if exists routine_run_images_read on public.routine_run_task_reference_images;
create policy routine_run_images_read on public.routine_run_task_reference_images for select to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and public.routine_run_is_visible(run_id, organization_id)
);
drop policy if exists routine_run_participants_read on public.routine_run_participants;
create policy routine_run_participants_read on public.routine_run_participants for select to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and public.routine_run_is_visible(run_id, organization_id)
);
drop policy if exists routine_run_role_assignments_read on public.routine_run_role_assignments;
create policy routine_run_role_assignments_read on public.routine_run_role_assignments for select to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and public.routine_run_is_visible(run_id, organization_id)
);
drop policy if exists routine_run_operations_manager_read on public.routine_run_operations;
create policy routine_run_operations_manager_read on public.routine_run_operations for select to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and (select public.routine_current_user_can_manage_templates())
);

revoke all privileges on table public.routine_runs from public, anon, authenticated;
revoke all privileges on table public.routine_run_sections from public, anon, authenticated;
revoke all privileges on table public.routine_run_tasks from public, anon, authenticated;
revoke all privileges on table public.routine_run_task_items from public, anon, authenticated;
revoke all privileges on table public.routine_run_snapshot_sources from public, anon, authenticated;
revoke all privileges on table public.routine_run_condition_evaluations from public, anon, authenticated;
revoke all privileges on table public.routine_run_task_dependencies from public, anon, authenticated;
revoke all privileges on table public.routine_run_task_relations from public, anon, authenticated;
revoke all privileges on table public.routine_run_task_reference_images from public, anon, authenticated;
revoke all privileges on table public.routine_run_participants from public, anon, authenticated;
revoke all privileges on table public.routine_run_role_assignments from public, anon, authenticated;
revoke all privileges on table public.routine_run_operations from public, anon, authenticated;

grant select on table public.routine_runs to authenticated;
grant select on table public.routine_run_sections to authenticated;
grant select on table public.routine_run_tasks to authenticated;
grant select on table public.routine_run_task_items to authenticated;
grant select on table public.routine_run_snapshot_sources to authenticated;
grant select on table public.routine_run_condition_evaluations to authenticated;
grant select on table public.routine_run_task_dependencies to authenticated;
grant select on table public.routine_run_task_relations to authenticated;
grant select on table public.routine_run_task_reference_images to authenticated;
grant select on table public.routine_run_participants to authenticated;
grant select on table public.routine_run_role_assignments to authenticated;
grant select on table public.routine_run_operations to authenticated;

revoke all on function public.routine_run_sha256(jsonb) from public, anon, authenticated;
revoke all on function public.routine_run_request_hash(jsonb) from public, anon, authenticated;
revoke all on function public.routine_run_operation_replay(uuid, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.routine_record_run_operation(uuid, uuid, text, uuid, text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.routine_run_fully_immutable_guard() from public, anon, authenticated;
revoke all on function public.routine_runs_guard() from public, anon, authenticated;
revoke all on function public.routine_run_tasks_guard() from public, anon, authenticated;
revoke all on function public.routine_run_task_items_guard() from public, anon, authenticated;
revoke all on function public.routine_run_condition_guard() from public, anon, authenticated;
revoke all on function public.routine_run_participant_guard() from public, anon, authenticated;
revoke all on function public.routine_run_role_assignment_guard() from public, anon, authenticated;
revoke all on function public.routine_run_snapshot_canonical_json(uuid) from public, anon, authenticated;
revoke all on function public.routine_compute_run_snapshot_hash(uuid) from public, anon, authenticated;
revoke all on function public.routine_build_run_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.routine_run_is_visible(uuid, uuid) from public, anon, authenticated;
revoke all on function public.routine_reference_storage_can_read(text) from public, anon, authenticated;
revoke all on function public.create_or_get_routine_run(text, text, date, uuid) from public, anon, authenticated;
revoke all on function public.join_routine_run(uuid, uuid) from public, anon, authenticated;
revoke all on function public.assign_routine_run_role(uuid, uuid, text, text, text, bigint, uuid) from public, anon, authenticated;
revoke all on function public.verify_routine_run_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.get_routine_run_workspace(uuid) from public, anon, authenticated;
revoke all on function public.list_routine_runs_for_date(date) from public, anon, authenticated;

grant execute on function public.routine_run_is_visible(uuid, uuid) to authenticated;
grant execute on function public.routine_reference_storage_can_read(text) to authenticated;
grant execute on function public.create_or_get_routine_run(text, text, date, uuid) to authenticated;
grant execute on function public.join_routine_run(uuid, uuid) to authenticated;
grant execute on function public.assign_routine_run_role(uuid, uuid, text, text, text, bigint, uuid) to authenticated;
grant execute on function public.verify_routine_run_snapshot(uuid) to authenticated;
grant execute on function public.get_routine_run_workspace(uuid) to authenticated;
grant execute on function public.list_routine_runs_for_date(date) to authenticated;

-- Phase 10E: Task Lifecycle, Immutable Audit, Deviations, Overrides,
-- Verifications, Handovers, and Transfers.
--
-- Apply after Phase 10A, 10A1, and Phase 10B through Phase 10D. This migration is additive. It
-- creates no production runs or routine content and never writes to or adds
-- dependencies on Inventory, Asset Registry, Event Operations, Auth config,
-- legacy routines, or either Inventory Storage surface.

alter table public.routine_run_tasks
  add column if not exists current_deviation_id uuid,
  add column if not exists current_override_id uuid,
  add column if not exists not_applicable_reason text,
  add column if not exists waiting_reason text,
  add column if not exists claimed_at timestamptz,
  add column if not exists last_status_changed_at timestamptz,
  add column if not exists last_status_changed_by_auth_user_id uuid references auth.users(id);

alter table public.routine_run_task_items
  add column if not exists not_applicable_reason text,
  add column if not exists blocked_reason text,
  add column if not exists last_status_changed_at timestamptz,
  add column if not exists last_status_changed_by_auth_user_id uuid references auth.users(id);

create table if not exists public.routine_deviations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  run_id uuid not null,
  task_id uuid not null,
  task_item_id uuid,
  source_type text not null,
  category text not null,
  reason_code text not null,
  details text,
  severity text not null,
  status text not null default 'open',
  detected_at timestamptz not null default now(),
  detected_by_auth_user_id uuid not null references auth.users(id),
  detected_by_name_snapshot text not null,
  assigned_participant_id uuid,
  due_at timestamptz,
  resolution_note text,
  resolved_at timestamptz,
  resolved_by_auth_user_id uuid references auth.users(id),
  current_override_id uuid,
  linked_previous_run_id uuid,
  linked_previous_task_id uuid,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint routine_deviations_run_fkey foreign key (run_id, organization_id)
    references public.routine_runs(id, organization_id),
  constraint routine_deviations_task_fkey foreign key (task_id, organization_id, run_id)
    references public.routine_run_tasks(id, organization_id, run_id),
  constraint routine_deviations_item_fkey foreign key (task_item_id, organization_id, run_id)
    references public.routine_run_task_items(id, organization_id, run_id),
  constraint routine_deviations_participant_fkey foreign key (assigned_participant_id, organization_id, run_id)
    references public.routine_run_participants(id, organization_id, run_id),
  constraint routine_deviations_previous_run_fkey foreign key (linked_previous_run_id, organization_id)
    references public.routine_runs(id, organization_id),
  constraint routine_deviations_previous_task_fkey
    foreign key (linked_previous_task_id, organization_id, linked_previous_run_id)
    references public.routine_run_tasks(id, organization_id, run_id),
  constraint routine_deviations_identity_unique unique (id, organization_id, run_id, task_id),
  constraint routine_deviations_source_check check (source_type in (
    'initial_check', 'control_result', 'blocked_task', 'opening_closing_mismatch',
    'equipment_issue', 'stock_issue', 'manager_override', 'manual'
  )),
  constraint routine_deviations_severity_check check (severity in ('normal', 'important', 'critical')),
  constraint routine_deviations_status_check check (status in (
    'open', 'mitigated', 'resolved', 'accepted_temporarily', 'cancelled'
  )),
  constraint routine_deviations_key_check check (
    category ~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
    and reason_code ~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
    and char_length(category) between 1 and 80
    and char_length(reason_code) between 1 and 80
  ),
  constraint routine_deviations_text_check check (
    char_length(trim(detected_by_name_snapshot)) between 1 and 200
    and (details is null or char_length(trim(details)) between 1 and 4000)
    and (resolution_note is null or char_length(trim(resolution_note)) between 1 and 4000)
  ),
  constraint routine_deviations_resolution_check check (
    (status = 'resolved' and resolved_at is not null and resolved_by_auth_user_id is not null
      and resolution_note is not null)
    or (status <> 'resolved')
  ),
  constraint routine_deviations_previous_link_check check (
    (linked_previous_run_id is null and linked_previous_task_id is null)
    or linked_previous_run_id is not null
  ),
  constraint routine_deviations_revision_check check (revision > 0)
);

create table if not exists public.routine_manager_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  run_id uuid not null,
  task_id uuid,
  task_item_id uuid,
  deviation_id uuid,
  override_type text not null,
  reason text not null,
  remaining_risk text not null,
  temporary_measure text not null,
  follow_up_owner_participant_id uuid,
  follow_up_due_at timestamptz not null,
  expires_at timestamptz,
  supersedes_override_id uuid,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  created_by_name_snapshot text not null,
  constraint routine_manager_overrides_run_fkey foreign key (run_id, organization_id)
    references public.routine_runs(id, organization_id),
  constraint routine_manager_overrides_task_fkey foreign key (task_id, organization_id, run_id)
    references public.routine_run_tasks(id, organization_id, run_id),
  constraint routine_manager_overrides_item_fkey foreign key (task_item_id, organization_id, run_id)
    references public.routine_run_task_items(id, organization_id, run_id),
  constraint routine_manager_overrides_deviation_fkey
    foreign key (deviation_id, organization_id, run_id, task_id)
    references public.routine_deviations(id, organization_id, run_id, task_id),
  constraint routine_manager_overrides_owner_fkey
    foreign key (follow_up_owner_participant_id, organization_id, run_id)
    references public.routine_run_participants(id, organization_id, run_id),
  constraint routine_manager_overrides_supersedes_fkey
    foreign key (supersedes_override_id, organization_id, run_id)
    references public.routine_manager_overrides(id, organization_id, run_id),
  constraint routine_manager_overrides_identity_unique unique (id, organization_id, run_id),
  constraint routine_manager_overrides_type_check check (override_type in (
    'task_completion', 'run_completion', 'not_applicable', 'verification', 'transfer', 'other'
  )),
  constraint routine_manager_overrides_text_check check (
    char_length(trim(reason)) between 1 and 4000
    and char_length(trim(remaining_risk)) between 1 and 4000
    and char_length(trim(temporary_measure)) between 1 and 4000
    and char_length(trim(created_by_name_snapshot)) between 1 and 200
  ),
  constraint routine_manager_overrides_scope_check check (
    task_item_id is null or task_id is not null
  ),
  constraint routine_manager_overrides_completion_deviation_check check (
    override_type <> 'task_completion' or task_id is null or deviation_id is not null
  ),
  constraint routine_manager_overrides_expiry_check check (
    expires_at is null or expires_at > created_at
  )
);

create table if not exists public.routine_task_verifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  run_id uuid not null,
  task_id uuid not null,
  task_revision_verified bigint not null,
  verification_policy_snapshot text not null,
  result text not null,
  note text,
  physical_recheck_confirmed boolean not null default false,
  completed_by_auth_user_id_snapshot uuid references auth.users(id),
  verifier_participant_id uuid not null,
  verifier_auth_user_id uuid not null references auth.users(id),
  verifier_name_snapshot text not null,
  verified_at timestamptz not null default now(),
  operation_id uuid not null,
  constraint routine_task_verifications_task_fkey foreign key (task_id, organization_id, run_id)
    references public.routine_run_tasks(id, organization_id, run_id),
  constraint routine_task_verifications_participant_fkey
    foreign key (verifier_participant_id, organization_id, run_id)
    references public.routine_run_participants(id, organization_id, run_id),
  constraint routine_task_verifications_identity_unique unique (id, organization_id, run_id, task_id),
  constraint routine_task_verifications_policy_check check (verification_policy_snapshot in (
    'self_recheck', 'independent', 'second_person_required', 'manager_required', 'closing_responsible'
  )),
  constraint routine_task_verifications_result_check check (result in ('passed', 'failed')),
  constraint routine_task_verifications_revision_check check (task_revision_verified > 0),
  constraint routine_task_verifications_text_check check (
    char_length(trim(verifier_name_snapshot)) between 1 and 200
    and (note is null or char_length(trim(note)) between 1 and 4000)
  )
);

create unique index if not exists routine_task_verifications_passed_revision_idx
  on public.routine_task_verifications (task_id, task_revision_verified, verification_policy_snapshot)
  where result = 'passed';

create table if not exists public.routine_run_verifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  run_id uuid not null,
  verification_type text not null,
  run_revision_verified bigint not null,
  result text not null,
  note text,
  verifier_participant_id uuid not null,
  verifier_auth_user_id uuid not null references auth.users(id),
  verifier_name_snapshot text not null,
  verified_at timestamptz not null default now(),
  operation_id uuid not null,
  constraint routine_run_verifications_run_fkey foreign key (run_id, organization_id)
    references public.routine_runs(id, organization_id),
  constraint routine_run_verifications_participant_fkey
    foreign key (verifier_participant_id, organization_id, run_id)
    references public.routine_run_participants(id, organization_id, run_id),
  constraint routine_run_verifications_identity_unique unique (id, organization_id, run_id),
  constraint routine_run_verifications_type_check check (verification_type in (
    'closing_responsible', 'manager', 'custom'
  )),
  constraint routine_run_verifications_result_check check (result in ('passed', 'failed')),
  constraint routine_run_verifications_revision_check check (run_revision_verified > 0),
  constraint routine_run_verifications_text_check check (
    char_length(trim(verifier_name_snapshot)) between 1 and 200
    and (note is null or char_length(trim(note)) between 1 and 4000)
  )
);

create table if not exists public.routine_run_verification_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  run_verification_id uuid not null,
  run_id uuid not null,
  task_id uuid not null,
  task_revision_verified bigint not null,
  required boolean not null default true,
  result text not null,
  physical_check_confirmed boolean not null default false,
  note text,
  sort_order integer not null,
  constraint routine_run_verification_items_verification_fkey
    foreign key (run_verification_id, organization_id, run_id)
    references public.routine_run_verifications(id, organization_id, run_id),
  constraint routine_run_verification_items_task_fkey foreign key (task_id, organization_id, run_id)
    references public.routine_run_tasks(id, organization_id, run_id),
  constraint routine_run_verification_items_identity_unique unique (id, organization_id, run_id),
  constraint routine_run_verification_items_task_unique unique (run_verification_id, task_id),
  constraint routine_run_verification_items_sort_unique unique (run_verification_id, sort_order),
  constraint routine_run_verification_items_result_check check (result in ('passed', 'failed')),
  constraint routine_run_verification_items_revision_check check (task_revision_verified > 0),
  constraint routine_run_verification_items_sort_check check (sort_order >= 0),
  constraint routine_run_verification_items_note_check check (
    note is null or char_length(trim(note)) between 1 and 4000
  )
);

create table if not exists public.routine_handovers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  handover_type text not null,
  from_run_id uuid not null,
  to_run_id uuid,
  external_target_type text,
  external_target_id text,
  status text not null default 'draft',
  summary text,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by_auth_user_id uuid not null references auth.users(id),
  submitted_at timestamptz,
  submitted_by_auth_user_id uuid references auth.users(id),
  accepted_at timestamptz,
  accepted_by_auth_user_id uuid references auth.users(id),
  superseded_at timestamptz,
  superseded_by_auth_user_id uuid references auth.users(id),
  constraint routine_handovers_from_run_fkey foreign key (from_run_id, organization_id)
    references public.routine_runs(id, organization_id),
  constraint routine_handovers_to_run_fkey foreign key (to_run_id, organization_id)
    references public.routine_runs(id, organization_id),
  constraint routine_handovers_identity_unique unique (id, organization_id, from_run_id),
  constraint routine_handovers_type_check check (handover_type in (
    'opening_transition', 'final_closing', 'event_transfer', 'responsibility_transfer'
  )),
  constraint routine_handovers_status_check check (status in ('draft', 'submitted', 'accepted', 'superseded')),
  constraint routine_handovers_target_check check (
    (to_run_id is not null and external_target_type is null and external_target_id is null)
    or (to_run_id is null and external_target_type is not null and external_target_id is not null)
  ),
  constraint routine_handovers_summary_check check (
    summary is null or char_length(trim(summary)) between 1 and 4000
  ),
  constraint routine_handovers_state_metadata_check check (
    (status = 'draft' and submitted_at is null and accepted_at is null and superseded_at is null)
    or (status = 'submitted' and submitted_at is not null and submitted_by_auth_user_id is not null and accepted_at is null and superseded_at is null)
    or (status = 'accepted' and submitted_at is not null and submitted_by_auth_user_id is not null and accepted_at is not null and accepted_by_auth_user_id is not null and superseded_at is null)
    or (status = 'superseded' and submitted_at is not null and submitted_by_auth_user_id is not null and superseded_at is not null and superseded_by_auth_user_id is not null)
  ),
  constraint routine_handovers_revision_check check (revision > 0)
);

create unique index if not exists routine_handovers_one_active_idx
  on public.routine_handovers (
    from_run_id, handover_type, coalesce(to_run_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(external_target_type, ''), coalesce(external_target_id, '')
  ) where status in ('draft', 'submitted');

create table if not exists public.routine_handover_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  handover_id uuid not null,
  from_run_id uuid not null,
  source_type text not null,
  source_deviation_id uuid,
  source_task_id uuid,
  source_transfer_id uuid,
  category text not null,
  title text not null,
  details text,
  severity text not null,
  responsible_participant_id uuid,
  due_at timestamptz,
  generated boolean not null default false,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  constraint routine_handover_items_handover_fkey
    foreign key (handover_id, organization_id, from_run_id)
    references public.routine_handovers(id, organization_id, from_run_id),
  constraint routine_handover_items_deviation_fkey
    foreign key (source_deviation_id, organization_id, from_run_id, source_task_id)
    references public.routine_deviations(id, organization_id, run_id, task_id),
  constraint routine_handover_items_task_fkey foreign key (source_task_id, organization_id, from_run_id)
    references public.routine_run_tasks(id, organization_id, run_id),
  constraint routine_handover_items_participant_fkey
    foreign key (responsible_participant_id, organization_id, from_run_id)
    references public.routine_run_participants(id, organization_id, run_id),
  constraint routine_handover_items_identity_unique unique (id, organization_id, from_run_id),
  constraint routine_handover_items_sort_unique unique (handover_id, sort_order),
  constraint routine_handover_items_source_check check (source_type in ('deviation', 'task', 'transfer', 'manual')),
  constraint routine_handover_items_severity_check check (severity in ('normal', 'important', 'critical')),
  constraint routine_handover_items_source_shape_check check (
    (source_type = 'deviation' and source_deviation_id is not null and source_task_id is not null)
    or (source_type = 'task' and source_task_id is not null)
    or (source_type = 'transfer' and source_transfer_id is not null and source_task_id is not null)
    or (source_type = 'manual' and source_deviation_id is null and source_transfer_id is null)
  ),
  constraint routine_handover_items_text_check check (
    category ~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
    and char_length(category) between 1 and 80
    and char_length(trim(title)) between 1 and 500
    and (details is null or char_length(trim(details)) between 1 and 4000)
  ),
  constraint routine_handover_items_sort_check check (sort_order >= 0)
);

create table if not exists public.routine_run_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  from_run_id uuid not null,
  from_task_id uuid not null,
  scope_key text not null default 'default',
  target_type text not null,
  target_run_id uuid,
  target_participant_id uuid,
  target_event_id text,
  status text not null default 'proposed',
  reason text not null,
  due_at timestamptz,
  source_task_status_before_transfer text not null,
  proposed_at timestamptz not null default now(),
  proposed_by_auth_user_id uuid not null references auth.users(id),
  accepted_at timestamptz,
  accepted_by_auth_user_id uuid references auth.users(id),
  rejected_at timestamptz,
  rejected_by_auth_user_id uuid references auth.users(id),
  rejection_reason text,
  completed_at timestamptz,
  completed_by_auth_user_id uuid references auth.users(id),
  completion_note text,
  cancelled_at timestamptz,
  cancelled_by_auth_user_id uuid references auth.users(id),
  cancellation_reason text,
  revision bigint not null default 1,
  constraint routine_run_transfers_from_run_fkey foreign key (from_run_id, organization_id)
    references public.routine_runs(id, organization_id),
  constraint routine_run_transfers_from_task_fkey foreign key (from_task_id, organization_id, from_run_id)
    references public.routine_run_tasks(id, organization_id, run_id),
  constraint routine_run_transfers_target_run_fkey foreign key (target_run_id, organization_id)
    references public.routine_runs(id, organization_id),
  constraint routine_run_transfers_target_participant_fkey
    foreign key (target_participant_id, organization_id, from_run_id)
    references public.routine_run_participants(id, organization_id, run_id),
  constraint routine_run_transfers_identity_unique unique (id, organization_id, from_run_id, from_task_id),
  constraint routine_run_transfers_scope_check check (
    scope_key ~ '^[a-z][a-z0-9]*(?:[-_:][a-z0-9]+)*$' and char_length(scope_key) between 1 and 120
  ),
  constraint routine_run_transfers_target_type_check check (target_type in (
    'participant', 'routine_run', 'event_operation', 'external'
  )),
  constraint routine_run_transfers_status_check check (status in (
    'proposed', 'accepted', 'rejected', 'completed', 'cancelled'
  )),
  constraint routine_run_transfers_target_shape_check check (
    (target_type = 'participant' and target_participant_id is not null and target_run_id is null and target_event_id is null)
    or (target_type = 'routine_run' and target_run_id is not null and target_participant_id is null and target_event_id is null)
    or (target_type = 'event_operation' and target_event_id is not null and target_participant_id is null and target_run_id is null)
    or (target_type = 'external' and target_event_id is not null and target_participant_id is null and target_run_id is null)
  ),
  constraint routine_run_transfers_text_check check (
    char_length(trim(reason)) between 1 and 4000
    and (rejection_reason is null or char_length(trim(rejection_reason)) between 1 and 4000)
    and (completion_note is null or char_length(trim(completion_note)) between 1 and 4000)
    and (cancellation_reason is null or char_length(trim(cancellation_reason)) between 1 and 4000)
  ),
  constraint routine_run_transfers_state_metadata_check check (
    (status = 'proposed' and accepted_at is null and rejected_at is null and completed_at is null and cancelled_at is null)
    or (status = 'accepted' and accepted_at is not null and accepted_by_auth_user_id is not null and rejected_at is null and completed_at is null and cancelled_at is null)
    or (status = 'rejected' and rejected_at is not null and rejected_by_auth_user_id is not null and rejection_reason is not null and completed_at is null and cancelled_at is null)
    or (status = 'completed' and accepted_at is not null and completed_at is not null and completed_by_auth_user_id is not null and completion_note is not null and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null and cancelled_by_auth_user_id is not null and cancellation_reason is not null and completed_at is null)
  ),
  constraint routine_run_transfers_source_status_check check (source_task_status_before_transfer in (
    'not_started', 'in_progress', 'waiting', 'blocked'
  )),
  constraint routine_run_transfers_revision_check check (revision > 0)
);

create table if not exists public.routine_corrections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  run_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  field_or_claim text not null,
  original_value jsonb not null,
  corrected_value jsonb not null,
  reason text not null,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  created_by_name_snapshot text not null,
  constraint routine_corrections_run_fkey foreign key (run_id, organization_id)
    references public.routine_runs(id, organization_id),
  constraint routine_corrections_identity_unique unique (id, organization_id, run_id),
  constraint routine_corrections_type_check check (entity_type in (
    'run', 'task', 'task_item', 'deviation', 'handover', 'transfer', 'verification', 'event'
  )),
  constraint routine_corrections_field_check check (
    field_or_claim ~ '^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$'
    and char_length(field_or_claim) between 1 and 120
  ),
  constraint routine_corrections_difference_check check (original_value is distinct from corrected_value),
  constraint routine_corrections_text_check check (
    char_length(trim(reason)) between 1 and 4000
    and char_length(trim(created_by_name_snapshot)) between 1 and 200
  )
);

create table if not exists public.routine_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  operational_date date not null,
  run_id uuid not null,
  task_id uuid,
  task_item_id uuid,
  deviation_id uuid,
  manager_override_id uuid,
  task_verification_id uuid,
  run_verification_id uuid,
  handover_id uuid,
  transfer_id uuid,
  correction_id uuid,
  event_type text not null,
  actor_type text not null default 'user',
  actor_auth_user_id uuid references auth.users(id),
  actor_profile_id uuid,
  effective_operator_id uuid,
  actor_name_snapshot text not null,
  actor_role_snapshot text,
  previous_revision bigint,
  new_revision bigint,
  payload jsonb not null default '{}'::jsonb,
  operation_id uuid,
  event_sequence integer not null default 1,
  client_instance_id text,
  client_event_at timestamptz,
  server_created_at timestamptz not null default now(),
  constraint routine_events_run_fkey foreign key (run_id, organization_id)
    references public.routine_runs(id, organization_id),
  constraint routine_events_task_fkey foreign key (task_id, organization_id, run_id)
    references public.routine_run_tasks(id, organization_id, run_id),
  constraint routine_events_item_fkey foreign key (task_item_id, organization_id, run_id)
    references public.routine_run_task_items(id, organization_id, run_id),
  constraint routine_events_deviation_fkey foreign key (deviation_id, organization_id, run_id, task_id)
    references public.routine_deviations(id, organization_id, run_id, task_id),
  constraint routine_events_override_fkey foreign key (manager_override_id, organization_id, run_id)
    references public.routine_manager_overrides(id, organization_id, run_id),
  constraint routine_events_task_verification_fkey
    foreign key (task_verification_id, organization_id, run_id, task_id)
    references public.routine_task_verifications(id, organization_id, run_id, task_id),
  constraint routine_events_run_verification_fkey
    foreign key (run_verification_id, organization_id, run_id)
    references public.routine_run_verifications(id, organization_id, run_id),
  constraint routine_events_handover_fkey
    foreign key (handover_id, organization_id, run_id)
    references public.routine_handovers(id, organization_id, from_run_id),
  constraint routine_events_transfer_fkey
    foreign key (transfer_id, organization_id, run_id, task_id)
    references public.routine_run_transfers(id, organization_id, from_run_id, from_task_id),
  constraint routine_events_correction_fkey
    foreign key (correction_id, organization_id, run_id)
    references public.routine_corrections(id, organization_id, run_id),
  constraint routine_events_actor_type_check check (actor_type in ('user', 'system')),
  constraint routine_events_actor_shape_check check (
    (actor_type = 'user' and actor_auth_user_id is not null and actor_profile_id is not null
      and effective_operator_id is null)
    or (actor_type = 'system' and actor_auth_user_id is null and actor_profile_id is null
      and effective_operator_id is null)
  ),
  constraint routine_events_event_type_check check (event_type in (
    'run_created', 'participant_joined', 'role_assigned', 'role_replaced',
    'run_started', 'run_final_verification_requested', 'task_claimed', 'task_released',
    'task_started', 'task_paused', 'initial_assessment_recorded', 'task_item_updated',
    'task_comment_added', 'task_blocked', 'task_not_applicable', 'task_completed',
    'task_reopened', 'deviation_opened', 'deviation_assigned', 'deviation_mitigated',
    'deviation_resolved', 'deviation_cancelled', 'manager_override_created',
    'task_verification_completed', 'run_verification_completed', 'handover_created',
    'handover_updated', 'handover_submitted', 'handover_accepted', 'transfer_proposed',
    'transfer_accepted', 'transfer_rejected', 'transfer_completed', 'transfer_cancelled',
    'run_waiting_for_transfers', 'run_finished', 'run_reopened', 'run_cancelled',
    'history_correction_recorded'
  )),
  constraint routine_events_event_type_syntax_check check (
    event_type ~ '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$'
  ),
  constraint routine_events_payload_check check (jsonb_typeof(payload) = 'object'),
  constraint routine_events_sequence_check check (event_sequence > 0),
  constraint routine_events_revision_check check (
    (previous_revision is null or previous_revision > 0)
    and (new_revision is null or new_revision > 0)
  ),
  constraint routine_events_actor_name_check check (
    char_length(trim(actor_name_snapshot)) between 1 and 200
  )
);

create unique index if not exists routine_events_operation_sequence_idx
  on public.routine_events (operation_id, event_sequence) where operation_id is not null;

do $phase10e_operation_identity$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'routine_run_operations_id_org_unique'
      and conrelid = 'public.routine_run_operations'::regclass
  ) then
    alter table public.routine_run_operations
      add constraint routine_run_operations_id_org_unique unique (id, organization_id);
  end if;
end;
$phase10e_operation_identity$;

do $phase10e_operation_fkeys$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'routine_task_verifications_operation_fkey') then
    alter table public.routine_task_verifications add constraint routine_task_verifications_operation_fkey
      foreign key (operation_id, organization_id) references public.routine_run_operations(id, organization_id)
      deferrable initially deferred;
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'routine_run_verifications_operation_fkey') then
    alter table public.routine_run_verifications add constraint routine_run_verifications_operation_fkey
      foreign key (operation_id, organization_id) references public.routine_run_operations(id, organization_id)
      deferrable initially deferred;
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'routine_events_operation_fkey') then
    alter table public.routine_events add constraint routine_events_operation_fkey
      foreign key (operation_id, organization_id) references public.routine_run_operations(id, organization_id)
      deferrable initially deferred;
  end if;
end;
$phase10e_operation_fkeys$;

alter table public.routine_run_operations drop constraint if exists routine_run_operations_type_check;
alter table public.routine_run_operations add constraint routine_run_operations_type_check check (operation_type in (
  'create_run', 'join_run', 'assign_role', 'start_run', 'claim_task', 'release_task',
  'start_task', 'pause_task', 'initial_assessment', 'update_task_item', 'add_task_comment',
  'block_task', 'task_not_applicable', 'complete_task', 'reopen_task', 'create_deviation',
  'assign_deviation', 'mitigate_deviation', 'resolve_deviation', 'cancel_deviation',
  'create_override', 'verify_task', 'request_run_verification', 'verify_run',
  'create_handover', 'replace_handover', 'refresh_handover', 'submit_handover',
  'accept_handover', 'propose_transfer', 'accept_transfer', 'reject_transfer',
  'complete_transfer', 'cancel_transfer', 'finish_run', 'reopen_run', 'cancel_run',
  'record_correction'
));
alter table public.routine_run_operations drop constraint if exists routine_run_operations_resource_check;
alter table public.routine_run_operations add constraint routine_run_operations_resource_check check (resource_type in (
  'run', 'participant', 'role_assignment', 'task', 'task_item', 'deviation', 'manager_override',
  'task_verification', 'run_verification', 'handover', 'transfer', 'correction', 'event'
));

do $phase10e_projection_fkeys$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'routine_run_tasks_current_deviation_fkey') then
    alter table public.routine_run_tasks add constraint routine_run_tasks_current_deviation_fkey
      foreign key (current_deviation_id, organization_id, run_id, id)
      references public.routine_deviations(id, organization_id, run_id, task_id)
      deferrable initially deferred;
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'routine_run_tasks_current_override_fkey') then
    alter table public.routine_run_tasks add constraint routine_run_tasks_current_override_fkey
      foreign key (current_override_id, organization_id, run_id)
      references public.routine_manager_overrides(id, organization_id, run_id)
      deferrable initially deferred;
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'routine_deviations_current_override_fkey') then
    alter table public.routine_deviations add constraint routine_deviations_current_override_fkey
      foreign key (current_override_id, organization_id, run_id)
      references public.routine_manager_overrides(id, organization_id, run_id)
      deferrable initially deferred;
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'routine_handover_items_transfer_fkey') then
    alter table public.routine_handover_items add constraint routine_handover_items_transfer_fkey
      foreign key (source_transfer_id, organization_id, from_run_id, source_task_id)
      references public.routine_run_transfers(id, organization_id, from_run_id, from_task_id);
  end if;
end;
$phase10e_projection_fkeys$;

create index if not exists routine_deviations_run_status_idx
  on public.routine_deviations (run_id, status, severity, task_id);
create index if not exists routine_deviations_assignee_idx
  on public.routine_deviations (assigned_participant_id, organization_id, run_id) where assigned_participant_id is not null;
create index if not exists routine_manager_overrides_run_idx
  on public.routine_manager_overrides (run_id, task_id, deviation_id, expires_at);
create index if not exists routine_task_verifications_task_idx
  on public.routine_task_verifications (task_id, task_revision_verified, verified_at desc);
create index if not exists routine_run_verifications_run_idx
  on public.routine_run_verifications (run_id, run_revision_verified, verified_at desc);
create index if not exists routine_run_verification_items_run_idx
  on public.routine_run_verification_items (run_id, run_verification_id, sort_order);
create index if not exists routine_handovers_from_run_idx
  on public.routine_handovers (from_run_id, status, handover_type);
create index if not exists routine_handover_items_handover_idx
  on public.routine_handover_items (handover_id, sort_order);
create index if not exists routine_run_transfers_from_run_idx
  on public.routine_run_transfers (from_run_id, status, from_task_id);
create index if not exists routine_run_transfers_target_run_idx
  on public.routine_run_transfers (target_run_id, status) where target_run_id is not null;
create index if not exists routine_run_transfers_target_participant_idx
  on public.routine_run_transfers (target_participant_id, status) where target_participant_id is not null;
create index if not exists routine_corrections_run_idx
  on public.routine_corrections (run_id, entity_type, entity_id, created_at);
create index if not exists routine_events_run_timeline_idx
  on public.routine_events (run_id, server_created_at, id);
create index if not exists routine_events_task_timeline_idx
  on public.routine_events (task_id, server_created_at, id) where task_id is not null;
create index if not exists routine_events_entity_links_idx
  on public.routine_events (organization_id, deviation_id, handover_id, transfer_id);

create or replace function public.routine_lifecycle_immutable_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = 'P0001', message = 'Routine lifecycle history is immutable.';
end;
$$;

create or replace function public.routine_deviation_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'Routine deviations cannot be deleted.';
  end if;
  if row(new.organization_id, new.run_id, new.task_id, new.task_item_id,
         new.source_type, new.category, new.reason_code, new.details, new.severity,
         new.detected_at, new.detected_by_auth_user_id, new.detected_by_name_snapshot,
         new.linked_previous_run_id, new.linked_previous_task_id, new.created_at)
     is distinct from
     row(old.organization_id, old.run_id, old.task_id, old.task_item_id,
         old.source_type, old.category, old.reason_code, old.details, old.severity,
         old.detected_at, old.detected_by_auth_user_id, old.detected_by_name_snapshot,
         old.linked_previous_run_id, old.linked_previous_task_id, old.created_at) then
    raise exception using errcode = 'P0001', message = 'Routine deviation detection history is immutable.';
  end if;
  if current_setting('mesh.routine_run_internal', true) is null then
    raise exception using errcode = 'P0001', message = 'Routine deviations can change only through an authorized RPC.';
  end if;
  if new.revision <= old.revision then
    raise exception using errcode = 'P0001', message = 'Routine deviation revision must increase.';
  end if;
  if new.status = 'accepted_temporarily' and new.current_override_id is null then
    raise exception using errcode = 'P0001', message = 'Temporary deviation acceptance requires a current manager override.';
  end if;
  if new.status in ('mitigated', 'resolved', 'cancelled') and new.resolution_note is null then
    raise exception using errcode = 'P0001', message = 'Deviation resolution or cancellation requires a substantive note.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.routine_handover_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'Routine handovers cannot be deleted.';
  end if;
  if row(new.organization_id, new.handover_type, new.from_run_id, new.to_run_id,
         new.external_target_type, new.external_target_id, new.created_at,
         new.created_by_auth_user_id)
     is distinct from
     row(old.organization_id, old.handover_type, old.from_run_id, old.to_run_id,
         old.external_target_type, old.external_target_id, old.created_at,
         old.created_by_auth_user_id) then
    raise exception using errcode = 'P0001', message = 'Routine handover identity is immutable.';
  end if;
  if old.status in ('submitted', 'accepted', 'superseded') and new.status = old.status then
    raise exception using errcode = 'P0001', message = 'Submitted routine handovers are immutable.';
  end if;
  if current_setting('mesh.routine_run_internal', true) is null then
    raise exception using errcode = 'P0001', message = 'Routine handovers can change only through an authorized RPC.';
  end if;
  if new.revision <= old.revision then
    raise exception using errcode = 'P0001', message = 'Routine handover revision must increase.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.routine_handover_item_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_status text;
  v_handover_id uuid := coalesce(new.handover_id, old.handover_id);
begin
  select handover.status into v_status
  from public.routine_handovers handover where handover.id = v_handover_id;
  if v_status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'Submitted routine handover items are immutable.';
  end if;
  if current_setting('mesh.routine_run_internal', true) is null then
    raise exception using errcode = 'P0001', message = 'Routine handover items can change only through an authorized RPC.';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.routine_transfer_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'Routine transfers cannot be deleted.';
  end if;
  if row(new.organization_id, new.from_run_id, new.from_task_id, new.scope_key,
         new.target_type, new.target_run_id, new.target_participant_id,
         new.target_event_id, new.reason, new.due_at, new.source_task_status_before_transfer,
         new.proposed_at, new.proposed_by_auth_user_id)
     is distinct from
     row(old.organization_id, old.from_run_id, old.from_task_id, old.scope_key,
         old.target_type, old.target_run_id, old.target_participant_id,
         old.target_event_id, old.reason, old.due_at, old.source_task_status_before_transfer,
         old.proposed_at, old.proposed_by_auth_user_id) then
    raise exception using errcode = 'P0001', message = 'Routine transfer source and target history is immutable.';
  end if;
  if current_setting('mesh.routine_run_internal', true) is null then
    raise exception using errcode = 'P0001', message = 'Routine transfers can change only through an authorized RPC.';
  end if;
  if new.revision <= old.revision then
    raise exception using errcode = 'P0001', message = 'Routine transfer revision must increase.';
  end if;
  return new;
end;
$$;

create or replace function public.routine_task_transition_allowed(input_from text, input_to text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select case input_from
    when 'not_started' then input_to in ('in_progress', 'blocked', 'not_applicable')
    when 'in_progress' then input_to in ('waiting', 'blocked', 'completed', 'not_applicable')
    when 'waiting' then input_to in ('in_progress', 'blocked', 'not_applicable')
    when 'blocked' then input_to in ('in_progress', 'completed')
    when 'completed' then input_to = 'in_progress'
    when 'not_applicable' then input_to = 'in_progress'
    when 'transferred' then input_to = 'in_progress'
    else false
  end;
$$;

create or replace function public.routine_run_transition_allowed(input_from text, input_to text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select case input_from
    when 'scheduled' then input_to in ('in_progress', 'cancelled')
    when 'in_progress' then input_to in ('awaiting_final_verification', 'waiting_for_transfers', 'finished', 'cancelled')
    when 'awaiting_final_verification' then input_to in ('in_progress', 'waiting_for_transfers', 'finished', 'cancelled')
    when 'waiting_for_transfers' then input_to in ('in_progress', 'finished', 'cancelled')
    when 'reopened' then input_to in ('in_progress', 'awaiting_final_verification', 'waiting_for_transfers', 'finished', 'cancelled')
    when 'finished' then input_to = 'reopened'
    else false
  end;
$$;

create or replace function public.routine_validate_task_item_value(
  input_item_type text,
  input_schema jsonb,
  input_status text,
  input_value jsonb,
  input_result_code text,
  input_reason text
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_allowed text[];
  v_value_text text;
  v_max_length integer;
begin
  if jsonb_typeof(input_schema) <> 'object' or jsonb_typeof(input_value) <> 'object' then
    return jsonb_build_object('valid', false, 'error', 'task_item_json_object_required');
  end if;
  if input_result_code is not null and (
    input_result_code !~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
    or char_length(input_result_code) > 80
  ) then
    return jsonb_build_object('valid', false, 'error', 'invalid_result_code');
  end if;
  if input_status = 'not_applicable' then
    if coalesce(input_schema->>'notApplicablePolicy', 'forbidden') <> 'allowed_with_reason'
       or nullif(trim(coalesce(input_reason, '')), '') is null then
      return jsonb_build_object('valid', false, 'error', 'item_not_applicable_forbidden_or_missing_reason');
    end if;
    return jsonb_build_object('valid', true);
  end if;
  if input_status = 'blocked' then
    return jsonb_build_object(
      'valid', nullif(trim(coalesce(input_reason, '')), '') is not null,
      'error', case when nullif(trim(coalesce(input_reason, '')), '') is null then 'blocked_reason_required' end
    );
  end if;
  if input_status <> 'completed' then
    return jsonb_build_object('valid', input_status = 'not_started', 'error', 'unsupported_item_status');
  end if;

  if input_item_type = 'check' then
    return jsonb_build_object('valid', jsonb_typeof(input_value->'checked') = 'boolean', 'error', 'checked_boolean_required');
  elsif input_item_type = 'count' then
    return jsonb_build_object('valid', jsonb_typeof(input_value->'value') = 'number'
      and (input_value->>'value')::numeric >= 0
      and trunc((input_value->>'value')::numeric) = (input_value->>'value')::numeric,
      'error', 'non_negative_integer_required');
  elsif input_item_type in ('quantity', 'measurement') then
    return jsonb_build_object('valid', jsonb_typeof(input_value->'value') = 'number'
      and (not (input_value ? 'unit') or jsonb_typeof(input_value->'unit') = 'string'),
      'error', 'numeric_value_required');
  elsif input_item_type = 'text' then
    v_max_length := least(greatest(coalesce((input_schema->>'maxLength')::integer, 2000), 1), 4000);
    return jsonb_build_object('valid', jsonb_typeof(input_value->'text') = 'string'
      and char_length(input_value->>'text') <= v_max_length, 'error', 'bounded_text_required');
  elsif input_item_type in ('choice', 'status') then
    v_value_text := input_value->>'value';
    if input_schema ? 'options' then
      if jsonb_typeof(input_schema->'options') <> 'array' then
        return jsonb_build_object('valid', false, 'error', 'options_array_required');
      end if;
      select array_agg(option_value) into v_allowed
      from jsonb_array_elements_text(input_schema->'options') option_value;
    end if;
    return jsonb_build_object('valid', v_value_text is not null
      and (v_allowed is null or v_value_text = any(v_allowed)), 'error', 'allowed_option_required');
  elsif input_item_type in ('location', 'asset', 'product') then
    if input_value ?| array['locationId', 'assetId', 'productId', 'sourceId', 'externalSourceId'] then
      return jsonb_build_object('valid', false, 'error', 'snapshot_identity_cannot_be_changed');
    end if;
    if exists (
      select 1 from jsonb_object_keys(input_value) key_value
      where key_value not in ('result', 'status', 'note')
    ) then
      return jsonb_build_object('valid', false, 'error', 'unknown_source_result_field');
    end if;
    return jsonb_build_object('valid', coalesce(input_value->>'result', input_value->>'status') is not null,
      'error', 'source_result_required');
  end if;
  return jsonb_build_object('valid', false, 'error', 'unsupported_item_type');
exception when invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('valid', false, 'error', 'invalid_numeric_value');
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
  if new.revision = old.revision
     and current_setting('mesh.routine_run_internal', true) = 'build'
     and old.condition_evaluation_id is null
     and new.condition_evaluation_id is not null
     and exists (
       select 1 from public.routine_runs run
       where run.id = new.run_id and run.snapshot_state = 'building'
     ) then
    new.updated_at := old.updated_at;
    return new;
  end if;
  if old.initial_assessment is not null and row(new.initial_assessment, new.initial_assessed_at, new.initial_assessed_by_auth_user_id)
     is distinct from row(old.initial_assessment, old.initial_assessed_at, old.initial_assessed_by_auth_user_id) then
    raise exception using errcode = 'P0001', message = 'Routine initial assessment is immutable once recorded.';
  end if;
  if new.revision <= old.revision then
    raise exception using errcode = 'P0001', message = 'Routine task revision must increase.';
  end if;
  if new.status = 'completed' then
    if new.outcome is null or new.completed_at is null or new.completed_by_auth_user_id is null then
      raise exception using errcode = 'P0001', message = 'Completed routine task requires outcome and completion metadata.';
    end if;
  elsif new.outcome is not null or new.completed_at is not null or new.completed_by_auth_user_id is not null then
    raise exception using errcode = 'P0001', message = 'Only a completed routine task may retain completion metadata.';
  end if;
  if new.status = 'blocked' and new.current_deviation_id is null then
    raise exception using errcode = 'P0001', message = 'Blocked routine task requires a current deviation.';
  end if;
  if new.status = 'not_applicable' and nullif(trim(coalesce(new.not_applicable_reason, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'Not-applicable routine task requires a substantive reason.';
  end if;
  if new.status = 'waiting' and nullif(trim(coalesce(new.waiting_reason, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'Waiting routine task requires a substantive reason.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.routine_lifecycle_context(input_run_id uuid)
returns table (
  actor_auth_user_id uuid,
  actor_profile_id uuid,
  organization_id uuid,
  actor_role text,
  actor_display_name text,
  participant_id uuid,
  is_manager boolean,
  is_coordinator boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_run public.routine_runs%rowtype;
  v_participant_id uuid;
begin
  select * into v_actor from public.routine_resolve_actor();
  select run.* into v_run
  from public.routine_runs run
  where run.id = input_run_id
    and run.organization_id = v_actor.organization_id
    and run.snapshot_state = 'ready';
  if v_run.id is null then
    raise exception using errcode = 'P0001', message = 'A ready same-organization routine run is required.';
  end if;
  select participant.id into v_participant_id
  from public.routine_run_participants participant
  where participant.run_id = v_run.id
    and participant.organization_id = v_run.organization_id
    and participant.user_profile_id = v_actor.actor_profile_id
    and participant.participation_status <> 'removed';
  if v_actor.actor_role not in ('manager', 'shift_lead') and v_participant_id is null then
    raise exception using errcode = 'P0001', message = 'Active routine run participation is required.';
  end if;
  return query select
    v_actor.actor_auth_user_id, v_actor.actor_profile_id, v_actor.organization_id,
    v_actor.actor_role, v_actor.actor_display_name, v_participant_id,
    v_actor.actor_role = 'manager', v_actor.actor_role in ('manager', 'shift_lead');
end;
$$;

create or replace function public.routine_lifecycle_context_with_target(
  input_source_run_id uuid,
  input_target_run_id uuid,
  input_target_profile_id uuid
)
returns table (
  actor_auth_user_id uuid,
  actor_profile_id uuid,
  organization_id uuid,
  actor_role text,
  actor_display_name text,
  participant_id uuid,
  is_manager boolean,
  is_coordinator boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_run public.routine_runs%rowtype;
  v_participant_id uuid;
  v_target_allowed boolean := false;
begin
  select * into v_actor from public.routine_resolve_actor();
  select run.* into v_run from public.routine_runs run
  where run.id = input_source_run_id
    and run.organization_id = v_actor.organization_id
    and run.snapshot_state = 'ready';
  if v_run.id is null then
    raise exception using errcode = 'P0001', message = 'A ready same-organization source run is required.';
  end if;
  select participant.id into v_participant_id
  from public.routine_run_participants participant
  where participant.run_id = v_run.id
    and participant.organization_id = v_run.organization_id
    and participant.user_profile_id = v_actor.actor_profile_id
    and participant.participation_status <> 'removed';
  if input_target_run_id is not null then
    v_target_allowed := public.routine_run_is_visible(input_target_run_id, v_actor.organization_id);
  elsif input_target_profile_id is not null then
    v_target_allowed := input_target_profile_id = v_actor.actor_profile_id;
  end if;
  if v_actor.actor_role not in ('manager', 'shift_lead')
     and v_participant_id is null and not v_target_allowed then
    raise exception using errcode = 'P0001', message = 'Source participation or explicit target access is required.';
  end if;
  return query select
    v_actor.actor_auth_user_id, v_actor.actor_profile_id, v_actor.organization_id,
    v_actor.actor_role, v_actor.actor_display_name, v_participant_id,
    v_actor.actor_role = 'manager', v_actor.actor_role in ('manager', 'shift_lead');
end;
$$;

create or replace function public.routine_lifecycle_operation_id(
  input_organization_id uuid,
  input_actor_auth_user_id uuid,
  input_operation_type text,
  input_idempotency_key uuid
)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select operation.id
  from public.routine_run_operations operation
  where operation.organization_id = input_organization_id
    and operation.actor_auth_user_id = input_actor_auth_user_id
    and operation.operation_type = input_operation_type
    and operation.idempotency_key = input_idempotency_key;
$$;

create or replace function public.routine_record_event(
  input_run_id uuid,
  input_event_type text,
  input_actor_type text,
  input_actor_auth_user_id uuid,
  input_actor_profile_id uuid,
  input_actor_name text,
  input_actor_role text,
  input_links jsonb,
  input_previous_revision bigint,
  input_new_revision bigint,
  input_payload jsonb,
  input_operation_id uuid,
  input_event_sequence integer
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_run public.routine_runs%rowtype;
  v_event_id uuid;
begin
  select run.* into v_run from public.routine_runs run where run.id = input_run_id;
  if v_run.id is null then
    raise exception using errcode = 'P0001', message = 'Routine event requires an existing run.';
  end if;
  if jsonb_typeof(coalesce(input_links, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(input_payload, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = 'P0001', message = 'Routine event links and payload must be JSON objects.';
  end if;
  if coalesce(input_payload, '{}'::jsonb)::text ~* '"(alarm(code)?|safe(code)?|payment|card|password|secret|token)"[[:space:]]*:' then
    raise exception using errcode = 'P0001', message = 'Sensitive secrets and payment data are forbidden in routine event payloads.';
  end if;
  perform set_config('mesh.routine_run_internal', 'event', true);
  insert into public.routine_events (
    organization_id, operational_date, run_id, task_id, task_item_id,
    deviation_id, manager_override_id, task_verification_id,
    run_verification_id, handover_id, transfer_id, correction_id,
    event_type, actor_type, actor_auth_user_id, actor_profile_id,
    actor_name_snapshot, actor_role_snapshot, previous_revision, new_revision,
    payload, operation_id, event_sequence
  ) values (
    v_run.organization_id, v_run.operational_date, v_run.id,
    nullif(input_links->>'taskId', '')::uuid,
    nullif(input_links->>'taskItemId', '')::uuid,
    nullif(input_links->>'deviationId', '')::uuid,
    nullif(input_links->>'managerOverrideId', '')::uuid,
    nullif(input_links->>'taskVerificationId', '')::uuid,
    nullif(input_links->>'runVerificationId', '')::uuid,
    nullif(input_links->>'handoverId', '')::uuid,
    nullif(input_links->>'transferId', '')::uuid,
    nullif(input_links->>'correctionId', '')::uuid,
    input_event_type, input_actor_type, input_actor_auth_user_id,
    input_actor_profile_id, input_actor_name, input_actor_role,
    input_previous_revision, input_new_revision, coalesce(input_payload, '{}'::jsonb),
    input_operation_id, input_event_sequence
  ) on conflict (operation_id, event_sequence) where operation_id is not null
    do nothing
  returning id into v_event_id;
  if v_event_id is null and input_operation_id is not null then
    select event.id into v_event_id from public.routine_events event
    where event.operation_id = input_operation_id and event.event_sequence = input_event_sequence;
  end if;
  return v_event_id;
end;
$$;

create or replace function public.routine_complete_lifecycle_operation(
  input_organization_id uuid,
  input_actor_auth_user_id uuid,
  input_actor_profile_id uuid,
  input_actor_name text,
  input_actor_role text,
  input_operation_type text,
  input_idempotency_key uuid,
  input_request_hash text,
  input_resource_type text,
  input_resource_id uuid,
  input_response_payload jsonb,
  input_run_id uuid,
  input_event_type text,
  input_event_links jsonb,
  input_previous_revision bigint,
  input_new_revision bigint,
  input_event_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_operation_id uuid;
begin
  perform public.routine_record_run_operation(
    input_organization_id, input_actor_auth_user_id, input_operation_type,
    input_idempotency_key, input_request_hash, input_resource_type,
    input_resource_id, input_response_payload
  );
  v_operation_id := public.routine_lifecycle_operation_id(
    input_organization_id, input_actor_auth_user_id, input_operation_type, input_idempotency_key
  );
  perform public.routine_record_event(
    input_run_id, input_event_type, 'user', input_actor_auth_user_id,
    input_actor_profile_id, input_actor_name, input_actor_role,
    input_event_links, input_previous_revision, input_new_revision,
    input_event_payload, v_operation_id, 1
  );
  return v_operation_id;
end;
$$;

create or replace function public.routine_task_dependency_validation(input_task_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_blockers jsonb := '[]'::jsonb;
begin
  if exists (
    select 1
    from public.routine_run_task_dependencies dependency
    join public.routine_run_tasks predecessor on predecessor.id = dependency.predecessor_run_task_id
    where dependency.successor_run_task_id = input_task_id
      and dependency.dependency_type_snapshot = 'must_reach_time'
  ) then
    v_blockers := v_blockers || jsonb_build_array('timing_engine_pending');
  end if;
  if exists (
    select 1
    from public.routine_run_task_dependencies dependency
    join public.routine_run_tasks predecessor on predecessor.id = dependency.predecessor_run_task_id
    where dependency.successor_run_task_id = input_task_id
      and dependency.dependency_type_snapshot = 'must_complete'
      and predecessor.status <> 'completed'
  ) then
    v_blockers := v_blockers || jsonb_build_array('must_complete_dependency_pending');
  end if;
  if exists (
    select 1
    from public.routine_run_task_dependencies dependency
    join public.routine_run_tasks predecessor on predecessor.id = dependency.predecessor_run_task_id
    where dependency.successor_run_task_id = input_task_id
      and dependency.dependency_type_snapshot = 'must_resolve'
      and predecessor.status not in ('completed', 'not_applicable', 'transferred')
  ) then
    v_blockers := v_blockers || jsonb_build_array('must_resolve_dependency_pending');
  end if;
  if exists (
    select 1
    from public.routine_run_task_dependencies dependency
    where dependency.successor_run_task_id = input_task_id
      and dependency.dependency_type_snapshot = 'must_receive_transfer'
      and not exists (
        select 1 from public.routine_run_transfers transfer
        where transfer.target_run_id = dependency.run_id and transfer.status = 'completed'
      )
  ) then
    v_blockers := v_blockers || jsonb_build_array('must_receive_transfer_pending');
  end if;
  return jsonb_build_object('valid', jsonb_array_length(v_blockers) = 0, 'blockers', v_blockers);
end;
$$;

create or replace function public.routine_override_is_current(input_override_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1 from public.routine_manager_overrides override_row
    where override_row.id = input_override_id
      and (override_row.expires_at is null or override_row.expires_at > now())
      and not exists (
        select 1 from public.routine_manager_overrides newer
        where newer.supersedes_override_id = override_row.id
      )
  );
$$;

create or replace function public.start_routine_run(
  input_run_id uuid,
  input_expected_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_context record;
  v_run public.routine_runs%rowtype;
  v_hash text;
  v_replay jsonb;
  v_response jsonb;
  v_previous bigint;
begin
  select * into v_context from public.routine_lifecycle_context(input_run_id);
  if input_expected_revision is null or input_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'Expected revision and idempotency key are required.';
  end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object(
    'runId', input_run_id, 'expectedRevision', input_expected_revision
  ));
  v_replay := public.routine_run_operation_replay(v_context.organization_id,
    v_context.actor_auth_user_id, 'start_run', input_idempotency_key, v_hash);
  if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run
  where run.id = input_run_id and run.organization_id = v_context.organization_id
  for update;
  v_replay := public.routine_run_operation_replay(v_context.organization_id,
    v_context.actor_auth_user_id, 'start_run', input_idempotency_key, v_hash);
  if v_replay is not null then return v_replay; end if;
  if v_run.revision <> input_expected_revision then
    raise exception using errcode = '40001', message = 'Stale routine run revision; refresh before starting.';
  end if;
  if v_run.status not in ('scheduled', 'reopened')
     or not public.routine_run_transition_allowed(v_run.status, 'in_progress') then
    raise exception using errcode = 'P0001', message = 'Routine run cannot be started from its current state.';
  end if;
  v_previous := v_run.revision;
  perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  update public.routine_runs set
    status = 'in_progress', started_at = coalesce(started_at, now()),
    started_by_auth_user_id = coalesce(started_by_auth_user_id, v_context.actor_auth_user_id),
    revision = revision + 1, updated_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_run.id returning * into v_run;
  v_response := jsonb_build_object('run', to_jsonb(v_run), 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(
    v_context.organization_id, v_context.actor_auth_user_id, v_context.actor_profile_id,
    v_context.actor_display_name, v_context.actor_role, 'start_run', input_idempotency_key,
    v_hash, 'run', v_run.id, v_response, v_run.id, 'run_started', '{}'::jsonb,
    v_previous, v_run.revision, '{}'::jsonb
  );
  return v_response;
end;
$$;

create or replace function public.claim_routine_task(
  input_task_id uuid,
  input_expected_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_context record;
  v_task public.routine_run_tasks%rowtype;
  v_run public.routine_runs%rowtype;
  v_run_id uuid;
  v_hash text;
  v_replay jsonb;
  v_response jsonb;
  v_previous bigint;
begin
  select task.run_id into v_run_id from public.routine_run_tasks task where task.id = input_task_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  if v_context.participant_id is null then
    raise exception using errcode = 'P0001', message = 'An active run participant is required to claim a task.';
  end if;
  if input_expected_revision is null or input_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'Expected revision and idempotency key are required.';
  end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object(
    'taskId', input_task_id, 'expectedRevision', input_expected_revision
  ));
  v_replay := public.routine_run_operation_replay(v_context.organization_id,
    v_context.actor_auth_user_id, 'claim_task', input_idempotency_key, v_hash);
  if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id = v_run_id for update;
  select task.* into v_task from public.routine_run_tasks task
    where task.id = input_task_id and task.run_id = v_run.id for update;
  v_replay := public.routine_run_operation_replay(v_context.organization_id,
    v_context.actor_auth_user_id, 'claim_task', input_idempotency_key, v_hash);
  if v_replay is not null then return v_replay; end if;
  if v_task.id is null or v_task.revision <> input_expected_revision then
    raise exception using errcode = '40001', message = 'Stale routine task revision; refresh before claiming.';
  end if;
  if v_run.status not in ('in_progress', 'reopened') or v_task.inclusion_state <> 'included'
     or v_task.status not in ('not_started', 'waiting') then
    raise exception using errcode = 'P0001', message = 'Only included available work in an active run can be claimed.';
  end if;
  if v_task.assigned_participant_id is not null
     and v_task.assigned_participant_id <> v_context.participant_id then
    raise exception using errcode = 'P0001', message = 'Routine task is already claimed by another participant.';
  end if;
  v_previous := v_task.revision;
  perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  update public.routine_run_tasks set
    assigned_participant_id = v_context.participant_id, claimed_at = coalesce(claimed_at, now()),
    revision = revision + 1, last_status_changed_at = coalesce(last_status_changed_at, now()),
    last_status_changed_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_task.id returning * into v_task;
  update public.routine_runs set revision = revision + 1,
    updated_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_run.id returning * into v_run;
  v_response := jsonb_build_object('task', to_jsonb(v_task), 'runRevision', v_run.revision, 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(
    v_context.organization_id, v_context.actor_auth_user_id, v_context.actor_profile_id,
    v_context.actor_display_name, v_context.actor_role, 'claim_task', input_idempotency_key,
    v_hash, 'task', v_task.id, v_response, v_run.id, 'task_claimed',
    jsonb_build_object('taskId', v_task.id), v_previous, v_task.revision,
    jsonb_build_object('participantId', v_context.participant_id)
  );
  return v_response;
end;
$$;

create or replace function public.release_routine_task(
  input_task_id uuid,
  input_expected_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_context record; v_task public.routine_run_tasks%rowtype; v_run public.routine_runs%rowtype;
  v_run_id uuid; v_hash text; v_replay jsonb; v_response jsonb; v_previous bigint;
begin
  select task.run_id into v_run_id from public.routine_run_tasks task where task.id = input_task_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  v_hash := public.routine_run_request_hash(jsonb_build_object('taskId', input_task_id, 'expectedRevision', input_expected_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'release_task', input_idempotency_key, v_hash);
  if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id = v_run_id for update;
  select task.* into v_task from public.routine_run_tasks task where task.id = input_task_id for update;
  if v_task.revision <> input_expected_revision then
    raise exception using errcode = '40001', message = 'Stale routine task revision; refresh before releasing.';
  end if;
  if not v_context.is_coordinator and v_task.assigned_participant_id is distinct from v_context.participant_id then
    raise exception using errcode = 'P0001', message = 'Only the assignee or coordinator can release this task.';
  end if;
  if v_task.status not in ('not_started', 'waiting') then
    raise exception using errcode = 'P0001', message = 'In-progress work must be paused before release.';
  end if;
  v_previous := v_task.revision;
  perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  update public.routine_run_tasks set assigned_participant_id = null, claimed_at = null,
    status = 'not_started', waiting_reason = null, revision = revision + 1,
    last_status_changed_at = now(), last_status_changed_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_task.id returning * into v_task;
  update public.routine_runs set revision = revision + 1, updated_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_run.id returning * into v_run;
  v_response := jsonb_build_object('task', to_jsonb(v_task), 'runRevision', v_run.revision, 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, 'release_task',
    input_idempotency_key, v_hash, 'task', v_task.id, v_response, v_run.id, 'task_released',
    jsonb_build_object('taskId', v_task.id), v_previous, v_task.revision, '{}'::jsonb);
  return v_response;
end;
$$;

create or replace function public.start_routine_task(
  input_task_id uuid,
  input_expected_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_context record; v_task public.routine_run_tasks%rowtype; v_run public.routine_runs%rowtype;
  v_run_id uuid; v_hash text; v_replay jsonb; v_response jsonb; v_previous bigint; v_dependency jsonb;
begin
  select task.run_id into v_run_id from public.routine_run_tasks task where task.id = input_task_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  if v_context.participant_id is null then
    raise exception using errcode = 'P0001', message = 'An active run participant is required to start a task.';
  end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object('taskId', input_task_id, 'expectedRevision', input_expected_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'start_task', input_idempotency_key, v_hash);
  if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id = v_run_id for update;
  select task.* into v_task from public.routine_run_tasks task where task.id = input_task_id for update;
  if v_task.revision <> input_expected_revision then
    raise exception using errcode = '40001', message = 'Stale routine task revision; refresh before starting.';
  end if;
  if v_run.status not in ('in_progress', 'reopened') or v_task.inclusion_state <> 'included'
     or v_task.status not in ('not_started', 'waiting') then
    raise exception using errcode = 'P0001', message = 'Routine task is not available to start.';
  end if;
  if v_task.availability_mode_snapshot = 'time_window' then
    raise exception using errcode = 'P0001', message = 'timing_engine_pending';
  end if;
  v_dependency := public.routine_task_dependency_validation(v_task.id);
  if not (v_dependency->>'valid')::boolean then
    raise exception using errcode = 'P0001', message = v_dependency->'blockers'->>0;
  end if;
  if v_task.assigned_participant_id is not null
     and v_task.assigned_participant_id <> v_context.participant_id then
    raise exception using errcode = 'P0001', message = 'Routine task is assigned to another participant.';
  end if;
  v_previous := v_task.revision;
  perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  update public.routine_run_tasks set status = 'in_progress', waiting_reason = null,
    assigned_participant_id = coalesce(assigned_participant_id, v_context.participant_id),
    claimed_at = coalesce(claimed_at, now()), started_at = coalesce(started_at, now()),
    started_by_auth_user_id = coalesce(started_by_auth_user_id, v_context.actor_auth_user_id),
    revision = revision + 1, last_status_changed_at = now(),
    last_status_changed_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_task.id returning * into v_task;
  update public.routine_runs set revision = revision + 1, updated_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_run.id returning * into v_run;
  v_response := jsonb_build_object('task', to_jsonb(v_task), 'runRevision', v_run.revision, 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, 'start_task',
    input_idempotency_key, v_hash, 'task', v_task.id, v_response, v_run.id, 'task_started',
    jsonb_build_object('taskId', v_task.id), v_previous, v_task.revision,
    jsonb_build_object('participantId', v_context.participant_id));
  return v_response;
end;
$$;

create or replace function public.pause_routine_task(
  input_task_id uuid,
  input_reason text,
  input_expected_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_context record; v_task public.routine_run_tasks%rowtype; v_run public.routine_runs%rowtype;
  v_run_id uuid; v_reason text := nullif(trim(coalesce(input_reason, '')), '');
  v_hash text; v_replay jsonb; v_response jsonb; v_previous bigint;
begin
  select task.run_id into v_run_id from public.routine_run_tasks task where task.id = input_task_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  if v_reason is null or char_length(v_reason) > 2000 then
    raise exception using errcode = 'P0001', message = 'A substantive bounded pause reason is required.';
  end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object('taskId', input_task_id,
    'reason', v_reason, 'expectedRevision', input_expected_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'pause_task', input_idempotency_key, v_hash);
  if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id = v_run_id for update;
  select task.* into v_task from public.routine_run_tasks task where task.id = input_task_id for update;
  if v_task.revision <> input_expected_revision then
    raise exception using errcode = '40001', message = 'Stale routine task revision; refresh before pausing.';
  end if;
  if v_task.status <> 'in_progress' or (not v_context.is_coordinator
     and v_task.assigned_participant_id is distinct from v_context.participant_id) then
    raise exception using errcode = 'P0001', message = 'Only the assignee or coordinator can pause in-progress work.';
  end if;
  v_previous := v_task.revision;
  perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  update public.routine_run_tasks set status = 'waiting', waiting_reason = v_reason,
    revision = revision + 1, last_status_changed_at = now(),
    last_status_changed_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_task.id returning * into v_task;
  update public.routine_runs set revision = revision + 1, updated_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_run.id returning * into v_run;
  v_response := jsonb_build_object('task', to_jsonb(v_task), 'runRevision', v_run.revision, 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, 'pause_task',
    input_idempotency_key, v_hash, 'task', v_task.id, v_response, v_run.id, 'task_paused',
    jsonb_build_object('taskId', v_task.id), v_previous, v_task.revision,
    jsonb_build_object('reason', v_reason));
  return v_response;
end;
$$;

create or replace function public.record_routine_initial_assessment(
  input_task_id uuid,
  input_assessment text,
  input_reason_code text,
  input_details text,
  input_expected_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_context record; v_task public.routine_run_tasks%rowtype; v_run public.routine_runs%rowtype;
  v_run_id uuid; v_assessment text := lower(trim(coalesce(input_assessment, '')));
  v_reason text := lower(trim(coalesce(input_reason_code, ''))); v_details text := nullif(trim(coalesce(input_details, '')), '');
  v_hash text; v_replay jsonb; v_response jsonb; v_previous bigint;
  v_deviation public.routine_deviations%rowtype; v_operation_id uuid;
begin
  select task.run_id into v_run_id from public.routine_run_tasks task where task.id = input_task_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  v_hash := public.routine_run_request_hash(jsonb_build_object('taskId', input_task_id,
    'assessment', v_assessment, 'reasonCode', v_reason, 'details', v_details,
    'expectedRevision', input_expected_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'initial_assessment', input_idempotency_key, v_hash);
  if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id = v_run_id for update;
  select task.* into v_task from public.routine_run_tasks task where task.id = input_task_id for update;
  if v_task.revision <> input_expected_revision then
    raise exception using errcode = '40001', message = 'Stale routine task revision; refresh before assessment.';
  end if;
  if v_task.initial_assessment is not null then
    raise exception using errcode = 'P0001', message = 'Routine initial assessment has already been recorded.';
  end if;
  if v_task.initial_assessment_policy_snapshot = 'none'
     or (v_task.initial_assessment_policy_snapshot = 'ready_on_arrival'
       and v_assessment not in ('ready', 'correction_required'))
     or (v_task.initial_assessment_policy_snapshot = 'control_result'
       and v_assessment not in ('ready', 'control_issue_found')) then
    raise exception using errcode = 'P0001', message = 'Assessment is not allowed by the snapshotted initial-assessment policy.';
  end if;
  if v_task.inclusion_state <> 'included' or v_run.status not in ('in_progress', 'reopened')
     or v_task.status not in ('not_started', 'in_progress', 'waiting') then
    raise exception using errcode = 'P0001', message = 'Routine task is not available for initial assessment.';
  end if;
  if not v_context.is_coordinator and v_task.assigned_participant_id is distinct from v_context.participant_id then
    raise exception using errcode = 'P0001', message = 'Only the assignee or coordinator can assess this task.';
  end if;
  if v_assessment in ('correction_required', 'control_issue_found') and (
    v_reason !~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$' or v_details is null
  ) then
    raise exception using errcode = 'P0001', message = 'Issue assessment requires a stable reason code and substantive details.';
  end if;
  v_previous := v_task.revision;
  perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  if v_assessment in ('correction_required', 'control_issue_found') then
    insert into public.routine_deviations (
      organization_id, run_id, task_id, source_type, category, reason_code,
      details, severity, detected_by_auth_user_id, detected_by_name_snapshot
    ) values (
      v_context.organization_id, v_run.id, v_task.id,
      case when v_assessment = 'correction_required' then 'initial_check' else 'control_result' end,
      case when v_assessment = 'correction_required' then 'initial_condition' else 'control_issue' end,
      v_reason, v_details, case when v_task.criticality_snapshot = 'critical' then 'critical' else 'important' end,
      v_context.actor_auth_user_id, v_context.actor_display_name
    ) returning * into v_deviation;
  end if;
  update public.routine_run_tasks set
    initial_assessment = v_assessment, initial_assessed_at = now(),
    initial_assessed_by_auth_user_id = v_context.actor_auth_user_id,
    status = 'in_progress', waiting_reason = null,
    assigned_participant_id = coalesce(assigned_participant_id, v_context.participant_id),
    current_deviation_id = coalesce(v_deviation.id, current_deviation_id),
    started_at = coalesce(started_at, now()),
    started_by_auth_user_id = coalesce(started_by_auth_user_id, v_context.actor_auth_user_id),
    revision = revision + 1, last_status_changed_at = now(),
    last_status_changed_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_task.id returning * into v_task;
  update public.routine_runs set revision = revision + 1, updated_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_run.id returning * into v_run;
  v_response := jsonb_build_object('task', to_jsonb(v_task), 'deviation',
    case when v_deviation.id is null then null else to_jsonb(v_deviation) end,
    'runRevision', v_run.revision, 'idempotentReplay', false);
  v_operation_id := public.routine_complete_lifecycle_operation(
    v_context.organization_id, v_context.actor_auth_user_id, v_context.actor_profile_id,
    v_context.actor_display_name, v_context.actor_role, 'initial_assessment', input_idempotency_key,
    v_hash, 'task', v_task.id, v_response, v_run.id, 'initial_assessment_recorded',
    jsonb_build_object('taskId', v_task.id), v_previous, v_task.revision,
    jsonb_build_object('assessment', v_assessment, 'reasonCode', nullif(v_reason, ''))
  );
  if v_deviation.id is not null then
    perform public.routine_record_event(v_run.id, 'deviation_opened', 'user',
      v_context.actor_auth_user_id, v_context.actor_profile_id, v_context.actor_display_name,
      v_context.actor_role, jsonb_build_object('taskId', v_task.id, 'deviationId', v_deviation.id),
      null, v_deviation.revision, jsonb_build_object('sourceType', v_deviation.source_type,
      'severity', v_deviation.severity), v_operation_id, 2);
  end if;
  return v_response;
end;
$$;

create or replace function public.update_routine_task_item(
  input_task_item_id uuid,
  input_status text,
  input_value_json jsonb,
  input_result_code text,
  input_reason text,
  input_expected_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_context record; v_item public.routine_run_task_items%rowtype;
  v_task public.routine_run_tasks%rowtype; v_run public.routine_runs%rowtype;
  v_run_id uuid; v_status text := lower(trim(coalesce(input_status, '')));
  v_reason text := nullif(trim(coalesce(input_reason, '')), ''); v_validation jsonb;
  v_hash text; v_replay jsonb; v_response jsonb; v_previous bigint;
begin
  select item.run_id into v_run_id from public.routine_run_task_items item where item.id = input_task_item_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  v_hash := public.routine_run_request_hash(jsonb_build_object('taskItemId', input_task_item_id,
    'status', v_status, 'value', coalesce(input_value_json, '{}'::jsonb),
    'resultCode', nullif(trim(coalesce(input_result_code, '')), ''), 'reason', v_reason,
    'expectedRevision', input_expected_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'update_task_item', input_idempotency_key, v_hash);
  if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id = v_run_id for update;
  select task.* into v_task from public.routine_run_tasks task
    where task.id = (select item.run_task_id from public.routine_run_task_items item where item.id = input_task_item_id)
    for update;
  select item.* into v_item from public.routine_run_task_items item where item.id = input_task_item_id for update;
  if v_item.revision <> input_expected_revision then
    raise exception using errcode = '40001', message = 'Stale routine task-item revision; refresh before saving.';
  end if;
  if v_run.status not in ('in_progress', 'reopened') or v_task.status in ('completed', 'not_applicable', 'transferred', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'Task item cannot change in the current run or task state.';
  end if;
  if not v_context.is_coordinator and v_task.assigned_participant_id is distinct from v_context.participant_id then
    raise exception using errcode = 'P0001', message = 'Only the task assignee or coordinator can update its items.';
  end if;
  v_validation := public.routine_validate_task_item_value(v_item.item_type_snapshot,
    v_item.input_schema_snapshot, v_status, coalesce(input_value_json, '{}'::jsonb),
    nullif(trim(coalesce(input_result_code, '')), ''), v_reason);
  if not coalesce((v_validation->>'valid')::boolean, false) then
    raise exception using errcode = 'P0001', message = 'Invalid typed task-item value: ' || coalesce(v_validation->>'error', 'unknown');
  end if;
  v_previous := v_item.revision;
  perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  update public.routine_run_task_items set status = v_status,
    value_json = coalesce(input_value_json, '{}'::jsonb),
    result_code = nullif(trim(coalesce(input_result_code, '')), ''),
    not_applicable_reason = case when v_status = 'not_applicable' then v_reason end,
    blocked_reason = case when v_status = 'blocked' then v_reason end,
    completed_at = case when v_status = 'completed' then now() end,
    completed_by_auth_user_id = case when v_status = 'completed' then v_context.actor_auth_user_id end,
    revision = revision + 1, updated_at = now(), last_status_changed_at = now(),
    last_status_changed_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_item.id returning * into v_item;
  update public.routine_run_tasks set revision = revision + 1 where id = v_task.id returning * into v_task;
  update public.routine_runs set revision = revision + 1, updated_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_run.id returning * into v_run;
  v_response := jsonb_build_object('taskItem', to_jsonb(v_item), 'taskRevision', v_task.revision,
    'runRevision', v_run.revision, 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, 'update_task_item',
    input_idempotency_key, v_hash, 'task_item', v_item.id, v_response, v_run.id,
    'task_item_updated', jsonb_build_object('taskId', v_task.id, 'taskItemId', v_item.id),
    v_previous, v_item.revision, jsonb_build_object('status', v_item.status, 'resultCode', v_item.result_code));
  return v_response;
end;
$$;

create or replace function public.add_routine_task_comment(
  input_task_id uuid,
  input_comment text,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_context record; v_task public.routine_run_tasks%rowtype; v_run_id uuid;
  v_comment text := nullif(trim(coalesce(input_comment, '')), ''); v_hash text;
  v_replay jsonb; v_response jsonb;
begin
  select task.run_id into v_run_id from public.routine_run_tasks task where task.id = input_task_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  if v_comment is null or char_length(v_comment) > 4000 then
    raise exception using errcode = 'P0001', message = 'A substantive comment of at most 4000 characters is required.';
  end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object('taskId', input_task_id, 'comment', v_comment));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'add_task_comment', input_idempotency_key, v_hash);
  if v_replay is not null then return v_replay; end if;
  select task.* into v_task from public.routine_run_tasks task where task.id = input_task_id;
  if v_task.id is null then raise exception using errcode = 'P0001', message = 'Routine task was not found.'; end if;
  v_response := jsonb_build_object('taskId', v_task.id, 'commentRecorded', true,
    'taskRevision', v_task.revision, 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, 'add_task_comment',
    input_idempotency_key, v_hash, 'task', v_task.id, v_response, v_run_id, 'task_comment_added',
    jsonb_build_object('taskId', v_task.id), v_task.revision, v_task.revision,
    jsonb_build_object('comment', v_comment));
  return v_response;
end;
$$;

create or replace function public.block_routine_task(
  input_task_id uuid,
  input_category text,
  input_reason_code text,
  input_details text,
  input_severity text,
  input_due_at timestamptz,
  input_expected_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_context record; v_task public.routine_run_tasks%rowtype; v_run public.routine_runs%rowtype;
  v_deviation public.routine_deviations%rowtype; v_run_id uuid;
  v_category text := lower(trim(coalesce(input_category, ''))); v_reason text := lower(trim(coalesce(input_reason_code, '')));
  v_details text := nullif(trim(coalesce(input_details, '')), ''); v_severity text := lower(trim(coalesce(input_severity, '')));
  v_hash text; v_replay jsonb; v_response jsonb; v_previous bigint; v_operation_id uuid;
begin
  select task.run_id into v_run_id from public.routine_run_tasks task where task.id = input_task_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  v_hash := public.routine_run_request_hash(jsonb_build_object('taskId', input_task_id,
    'category', v_category, 'reasonCode', v_reason, 'details', v_details,
    'severity', v_severity, 'dueAt', input_due_at, 'expectedRevision', input_expected_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'block_task', input_idempotency_key, v_hash);
  if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id = v_run_id for update;
  select task.* into v_task from public.routine_run_tasks task where task.id = input_task_id for update;
  if v_task.revision <> input_expected_revision then
    raise exception using errcode = '40001', message = 'Stale routine task revision; refresh before blocking.';
  end if;
  if v_task.status not in ('not_started', 'in_progress', 'waiting', 'blocked')
     or v_task.inclusion_state <> 'included' or v_run.status not in ('in_progress', 'reopened') then
    raise exception using errcode = 'P0001', message = 'Routine task cannot be blocked in its current state.';
  end if;
  if not v_context.is_coordinator and v_task.assigned_participant_id is distinct from v_context.participant_id then
    raise exception using errcode = 'P0001', message = 'Only the task assignee or coordinator can block this task.';
  end if;
  if v_category !~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
     or v_reason !~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
     or v_details is null or v_severity not in ('normal', 'important', 'critical') then
    raise exception using errcode = 'P0001', message = 'Valid category, reason, details, and severity are required.';
  end if;
  v_previous := v_task.revision;
  perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  insert into public.routine_deviations (
    organization_id, run_id, task_id, source_type, category, reason_code,
    details, severity, detected_by_auth_user_id, detected_by_name_snapshot, due_at
  ) values (
    v_context.organization_id, v_run.id, v_task.id, 'blocked_task', v_category, v_reason,
    v_details, v_severity, v_context.actor_auth_user_id, v_context.actor_display_name, input_due_at
  ) returning * into v_deviation;
  update public.routine_run_tasks set status = 'blocked', current_deviation_id = v_deviation.id,
    waiting_reason = null, revision = revision + 1, last_status_changed_at = now(),
    last_status_changed_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_task.id returning * into v_task;
  update public.routine_runs set revision = revision + 1, updated_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_run.id returning * into v_run;
  v_response := jsonb_build_object('task', to_jsonb(v_task), 'deviation', to_jsonb(v_deviation),
    'runRevision', v_run.revision, 'idempotentReplay', false);
  v_operation_id := public.routine_complete_lifecycle_operation(
    v_context.organization_id, v_context.actor_auth_user_id, v_context.actor_profile_id,
    v_context.actor_display_name, v_context.actor_role, 'block_task', input_idempotency_key,
    v_hash, 'deviation', v_deviation.id, v_response, v_run.id, 'deviation_opened',
    jsonb_build_object('taskId', v_task.id, 'deviationId', v_deviation.id), null, v_deviation.revision,
    jsonb_build_object('category', v_category, 'reasonCode', v_reason, 'severity', v_severity));
  perform public.routine_record_event(v_run.id, 'task_blocked', 'user', v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role,
    jsonb_build_object('taskId', v_task.id, 'deviationId', v_deviation.id), v_previous,
    v_task.revision, jsonb_build_object('severity', v_severity), v_operation_id, 2);
  return v_response;
end;
$$;

create or replace function public.mark_routine_task_not_applicable(
  input_task_id uuid,
  input_reason text,
  input_expected_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_context record; v_task public.routine_run_tasks%rowtype; v_run public.routine_runs%rowtype; v_run_id uuid;
  v_reason text := nullif(trim(coalesce(input_reason, '')), ''); v_hash text; v_replay jsonb; v_response jsonb; v_previous bigint;
begin
  select task.run_id into v_run_id from public.routine_run_tasks task where task.id = input_task_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  v_hash := public.routine_run_request_hash(jsonb_build_object('taskId', input_task_id, 'reason', v_reason,
    'expectedRevision', input_expected_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'task_not_applicable', input_idempotency_key, v_hash);
  if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id = v_run_id for update;
  select task.* into v_task from public.routine_run_tasks task where task.id = input_task_id for update;
  if v_task.revision <> input_expected_revision then raise exception using errcode = '40001', message = 'Stale routine task revision.'; end if;
  if v_task.not_applicable_policy_snapshot <> 'allowed_with_reason' or v_reason is null then
    raise exception using errcode = 'P0001', message = 'Task not-applicable is forbidden or missing a substantive reason.';
  end if;
  if v_task.status not in ('not_started', 'in_progress', 'waiting') or v_task.inclusion_state <> 'included' then
    raise exception using errcode = 'P0001', message = 'Routine task cannot become not applicable from its current state.';
  end if;
  if not v_context.is_coordinator and v_task.assigned_participant_id is distinct from v_context.participant_id then
    raise exception using errcode = 'P0001', message = 'Only the task assignee or coordinator can mark it not applicable.';
  end if;
  v_previous := v_task.revision; perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  update public.routine_run_tasks set status = 'not_applicable', not_applicable_reason = v_reason,
    waiting_reason = null, outcome = null, completed_at = null, completed_by_auth_user_id = null,
    revision = revision + 1, last_status_changed_at = now(),
    last_status_changed_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_task.id returning * into v_task;
  update public.routine_runs set revision = revision + 1, updated_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_run.id returning * into v_run;
  v_response := jsonb_build_object('task', to_jsonb(v_task), 'runRevision', v_run.revision, 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, 'task_not_applicable',
    input_idempotency_key, v_hash, 'task', v_task.id, v_response, v_run.id, 'task_not_applicable',
    jsonb_build_object('taskId', v_task.id), v_previous, v_task.revision, jsonb_build_object('reason', v_reason));
  return v_response;
end;
$$;

create or replace function public.routine_validate_task_completion(input_task_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_task public.routine_run_tasks%rowtype; v_blockers jsonb := '[]'::jsonb;
  v_dependency jsonb; v_override_valid boolean; v_outcome text;
begin
  select task.* into v_task from public.routine_run_tasks task where task.id = input_task_id;
  if v_task.id is null then return jsonb_build_object('valid', false, 'blockers', jsonb_build_array('task_not_found')); end if;
  if v_task.inclusion_state <> 'included' then v_blockers := v_blockers || jsonb_build_array('task_not_included'); end if;
  if v_task.status not in ('in_progress', 'blocked') then v_blockers := v_blockers || jsonb_build_array('task_not_started'); end if;
  if v_task.availability_mode_snapshot = 'time_window' then v_blockers := v_blockers || jsonb_build_array('timing_engine_pending'); end if;
  v_dependency := public.routine_task_dependency_validation(v_task.id);
  v_blockers := v_blockers || coalesce(v_dependency->'blockers', '[]'::jsonb);
  if v_task.initial_assessment_policy_snapshot <> 'none' and v_task.initial_assessment is null then
    v_blockers := v_blockers || jsonb_build_array('initial_assessment_required');
  end if;
  if exists (select 1 from public.routine_run_task_items item where item.run_task_id = v_task.id
    and item.active_snapshot and item.required_snapshot and item.status not in ('completed', 'not_applicable')) then
    v_blockers := v_blockers || jsonb_build_array('required_task_items_incomplete');
  end if;
  v_override_valid := public.routine_override_is_current(v_task.current_override_id);
  if exists (select 1 from public.routine_deviations deviation where deviation.task_id = v_task.id
    and deviation.status in ('open', 'mitigated') and (
      deviation.severity = 'critical' or v_task.completion_policy_snapshot = 'standard_required'
    )) and not v_override_valid then
    v_blockers := v_blockers || jsonb_build_array('open_blocking_deviation');
  end if;
  if v_task.status = 'blocked' and not v_override_valid then
    v_blockers := v_blockers || jsonb_build_array('blocked_task_requires_override');
  end if;
  if v_task.completion_policy_snapshot = 'manager_override' and not v_override_valid then
    v_blockers := v_blockers || jsonb_build_array('manager_override_required');
  end if;
  if v_override_valid then v_outcome := 'completed_with_manager_override';
  elsif v_task.initial_assessment = 'ready' and v_task.initial_assessment_policy_snapshot = 'ready_on_arrival' then v_outcome := 'ready_on_arrival';
  elsif v_task.initial_assessment = 'correction_required' then v_outcome := 'completed_after_correction';
  elsif v_task.task_type_snapshot = 'control' or v_task.initial_assessment_policy_snapshot = 'control_result' then
    if exists (select 1 from public.routine_deviations deviation where deviation.task_id = v_task.id
      and deviation.status in ('open', 'mitigated', 'accepted_temporarily')) then
      v_outcome := 'control_completed_with_deviation';
    else v_outcome := 'control_passed'; end if;
  else v_outcome := 'standard_met'; end if;
  return jsonb_build_object('valid', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers, 'computedOutcome', v_outcome);
end;
$$;

create or replace function public.complete_routine_task(
  input_task_id uuid,
  input_completion_note text,
  input_critical_confirmation boolean,
  input_expected_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_context record; v_task public.routine_run_tasks%rowtype; v_run public.routine_runs%rowtype; v_run_id uuid;
  v_note text := nullif(trim(coalesce(input_completion_note, '')), ''); v_validation jsonb;
  v_hash text; v_replay jsonb; v_response jsonb; v_previous bigint; v_outcome text;
begin
  select task.run_id into v_run_id from public.routine_run_tasks task where task.id = input_task_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  v_hash := public.routine_run_request_hash(jsonb_build_object('taskId', input_task_id,
    'completionNote', v_note, 'criticalConfirmation', coalesce(input_critical_confirmation, false),
    'expectedRevision', input_expected_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'complete_task', input_idempotency_key, v_hash);
  if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id = v_run_id for update;
  select task.* into v_task from public.routine_run_tasks task where task.id = input_task_id for update;
  perform 1 from public.routine_run_task_items item where item.run_task_id = v_task.id order by item.id for update;
  perform 1 from public.routine_deviations deviation where deviation.task_id = v_task.id order by deviation.id for update;
  if v_task.revision <> input_expected_revision then raise exception using errcode = '40001', message = 'Stale routine task revision; refresh before completion.'; end if;
  if v_run.status not in ('in_progress', 'reopened') then raise exception using errcode = 'P0001', message = 'Routine run is not open for task completion.'; end if;
  if not v_context.is_coordinator and v_task.assigned_participant_id is distinct from v_context.participant_id then
    raise exception using errcode = 'P0001', message = 'Only the task assignee or coordinator can complete this task.';
  end if;
  if v_task.criticality_snapshot = 'critical' and coalesce(input_critical_confirmation, false) = false then
    raise exception using errcode = 'P0001', message = 'Critical routine task requires explicit critical confirmation.';
  end if;
  v_validation := public.routine_validate_task_completion(v_task.id);
  if not (v_validation->>'valid')::boolean then
    raise exception using errcode = 'P0001', message = 'Routine task completion blocked: ' || (v_validation->'blockers')::text;
  end if;
  v_outcome := v_validation->>'computedOutcome'; v_previous := v_task.revision;
  perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  update public.routine_run_tasks set status = 'completed', outcome = v_outcome,
    completed_at = now(), completed_by_auth_user_id = v_context.actor_auth_user_id,
    waiting_reason = null, not_applicable_reason = null, revision = revision + 1,
    last_status_changed_at = now(), last_status_changed_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_task.id returning * into v_task;
  update public.routine_runs set revision = revision + 1, updated_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_run.id returning * into v_run;
  v_response := jsonb_build_object('task', to_jsonb(v_task), 'computedOutcome', v_outcome,
    'runRevision', v_run.revision, 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, 'complete_task',
    input_idempotency_key, v_hash, 'task', v_task.id, v_response, v_run.id, 'task_completed',
    jsonb_build_object('taskId', v_task.id), v_previous, v_task.revision,
    jsonb_build_object('outcome', v_outcome, 'completionNote', v_note,
      'criticalConfirmed', coalesce(input_critical_confirmation, false)));
  return v_response;
end;
$$;

create or replace function public.reopen_routine_task(
  input_task_id uuid,
  input_reason text,
  input_expected_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_context record; v_task public.routine_run_tasks%rowtype; v_run public.routine_runs%rowtype; v_run_id uuid;
  v_reason text := nullif(trim(coalesce(input_reason, '')), ''); v_hash text; v_replay jsonb; v_response jsonb; v_previous bigint;
begin
  select task.run_id into v_run_id from public.routine_run_tasks task where task.id = input_task_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  if not v_context.is_coordinator or v_reason is null then
    raise exception using errcode = 'P0001', message = 'Coordinator authority and a substantive reason are required to reopen a task.';
  end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object('taskId', input_task_id, 'reason', v_reason,
    'expectedRevision', input_expected_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'reopen_task', input_idempotency_key, v_hash);
  if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id = v_run_id for update;
  select task.* into v_task from public.routine_run_tasks task where task.id = input_task_id for update;
  if v_task.revision <> input_expected_revision then raise exception using errcode = '40001', message = 'Stale routine task revision.'; end if;
  if v_task.status not in ('completed', 'not_applicable', 'transferred') then
    raise exception using errcode = 'P0001', message = 'Only handled routine work can be reopened.';
  end if;
  if v_run.status in ('finished', 'cancelled', 'superseded') then
    raise exception using errcode = 'P0001', message = 'The run must be explicitly reopened before task mutation.';
  end if;
  v_previous := v_task.revision; perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  update public.routine_run_tasks set status = 'in_progress', outcome = null,
    completed_at = null, completed_by_auth_user_id = null, not_applicable_reason = null,
    waiting_reason = null, current_override_id = null, revision = revision + 1,
    last_status_changed_at = now(), last_status_changed_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_task.id returning * into v_task;
  update public.routine_runs set status = case when status = 'awaiting_final_verification' then 'in_progress' else status end,
    revision = revision + 1, updated_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_run.id returning * into v_run;
  v_response := jsonb_build_object('task', to_jsonb(v_task), 'run', to_jsonb(v_run), 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, 'reopen_task',
    input_idempotency_key, v_hash, 'task', v_task.id, v_response, v_run.id, 'task_reopened',
    jsonb_build_object('taskId', v_task.id), v_previous, v_task.revision, jsonb_build_object('reason', v_reason));
  return v_response;
end;
$$;

create or replace function public.create_routine_deviation(
  input_task_id uuid,
  input_task_item_id uuid,
  input_source_type text,
  input_category text,
  input_reason_code text,
  input_details text,
  input_severity text,
  input_assigned_participant_id uuid,
  input_due_at timestamptz,
  input_expected_task_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_context record; v_task public.routine_run_tasks%rowtype; v_run public.routine_runs%rowtype; v_run_id uuid;
  v_deviation public.routine_deviations%rowtype; v_source text := lower(trim(coalesce(input_source_type, '')));
  v_category text := lower(trim(coalesce(input_category, ''))); v_reason text := lower(trim(coalesce(input_reason_code, '')));
  v_details text := nullif(trim(coalesce(input_details, '')), ''); v_severity text := lower(trim(coalesce(input_severity, '')));
  v_hash text; v_replay jsonb; v_response jsonb;
begin
  select task.run_id into v_run_id from public.routine_run_tasks task where task.id = input_task_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  v_hash := public.routine_run_request_hash(jsonb_build_object('taskId', input_task_id,
    'taskItemId', input_task_item_id, 'sourceType', v_source, 'category', v_category,
    'reasonCode', v_reason, 'details', v_details, 'severity', v_severity,
    'assignedParticipantId', input_assigned_participant_id, 'dueAt', input_due_at,
    'expectedTaskRevision', input_expected_task_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'create_deviation', input_idempotency_key, v_hash);
  if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id = v_run_id for update;
  select task.* into v_task from public.routine_run_tasks task where task.id = input_task_id for update;
  if v_task.revision <> input_expected_task_revision then raise exception using errcode = '40001', message = 'Stale routine task revision.'; end if;
  if v_source not in ('initial_check', 'control_result', 'blocked_task', 'opening_closing_mismatch',
      'equipment_issue', 'stock_issue', 'manager_override', 'manual')
     or v_category !~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
     or v_reason !~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
     or v_severity not in ('normal', 'important', 'critical') then
    raise exception using errcode = 'P0001', message = 'Invalid deviation source, category, reason, or severity.';
  end if;
  if input_task_item_id is not null and not exists (
    select 1 from public.routine_run_task_items item where item.id = input_task_item_id and item.run_task_id = v_task.id
  ) then raise exception using errcode = 'P0001', message = 'Deviation task item must belong to the same task.'; end if;
  if input_assigned_participant_id is not null and not v_context.is_coordinator then
    raise exception using errcode = 'P0001', message = 'Only a coordinator may assign a new deviation.';
  end if;
  perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  insert into public.routine_deviations (
    organization_id, run_id, task_id, task_item_id, source_type, category, reason_code,
    details, severity, detected_by_auth_user_id, detected_by_name_snapshot,
    assigned_participant_id, due_at
  ) values (
    v_context.organization_id, v_run.id, v_task.id, input_task_item_id, v_source, v_category, v_reason,
    v_details, v_severity, v_context.actor_auth_user_id, v_context.actor_display_name,
    input_assigned_participant_id, input_due_at
  ) returning * into v_deviation;
  update public.routine_run_tasks set current_deviation_id = v_deviation.id,
    revision = revision + 1 where id = v_task.id returning * into v_task;
  update public.routine_runs set revision = revision + 1, updated_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_run.id returning * into v_run;
  v_response := jsonb_build_object('deviation', to_jsonb(v_deviation), 'taskRevision', v_task.revision,
    'runRevision', v_run.revision, 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, 'create_deviation',
    input_idempotency_key, v_hash, 'deviation', v_deviation.id, v_response, v_run.id, 'deviation_opened',
    jsonb_build_object('taskId', v_task.id, 'taskItemId', input_task_item_id, 'deviationId', v_deviation.id),
    null, v_deviation.revision, jsonb_build_object('sourceType', v_source, 'severity', v_severity));
  return v_response;
end;
$$;

create or replace function public.assign_routine_deviation(
  input_deviation_id uuid,
  input_participant_id uuid,
  input_expected_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_context record; v_deviation public.routine_deviations%rowtype; v_run public.routine_runs%rowtype;
  v_run_id uuid; v_hash text; v_replay jsonb; v_response jsonb; v_previous bigint;
begin
  select deviation.run_id into v_run_id from public.routine_deviations deviation where deviation.id = input_deviation_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  if not v_context.is_coordinator then raise exception using errcode = 'P0001', message = 'Coordinator authority is required to assign deviations.'; end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object('deviationId', input_deviation_id,
    'participantId', input_participant_id, 'expectedRevision', input_expected_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'assign_deviation', input_idempotency_key, v_hash); if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id = v_run_id for update;
  select deviation.* into v_deviation from public.routine_deviations deviation where deviation.id = input_deviation_id for update;
  if v_deviation.revision <> input_expected_revision then raise exception using errcode = '40001', message = 'Stale deviation revision.'; end if;
  if not exists (select 1 from public.routine_run_participants participant where participant.id = input_participant_id
    and participant.run_id = v_run.id and participant.participation_status <> 'removed') then
    raise exception using errcode = 'P0001', message = 'Deviation assignee must be an active participant in the run.';
  end if;
  v_previous := v_deviation.revision; perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  update public.routine_deviations set assigned_participant_id = input_participant_id,
    revision = revision + 1 where id = v_deviation.id returning * into v_deviation;
  update public.routine_run_tasks set revision = revision + 1 where id = v_deviation.task_id;
  update public.routine_runs set revision = revision + 1, updated_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_run.id returning * into v_run;
  v_response := jsonb_build_object('deviation', to_jsonb(v_deviation), 'runRevision', v_run.revision, 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, 'assign_deviation', input_idempotency_key,
    v_hash, 'deviation', v_deviation.id, v_response, v_run.id, 'deviation_assigned',
    jsonb_build_object('taskId', v_deviation.task_id, 'deviationId', v_deviation.id), v_previous,
    v_deviation.revision, jsonb_build_object('participantId', input_participant_id));
  return v_response;
end;
$$;

create or replace function public.mitigate_routine_deviation(
  input_deviation_id uuid,
  input_note text,
  input_expected_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_context record; v_deviation public.routine_deviations%rowtype; v_run public.routine_runs%rowtype;
  v_run_id uuid; v_note text := nullif(trim(coalesce(input_note, '')), '');
  v_hash text; v_replay jsonb; v_response jsonb; v_previous bigint;
begin
  select deviation.run_id into v_run_id from public.routine_deviations deviation where deviation.id = input_deviation_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  if v_note is null then raise exception using errcode = 'P0001', message = 'Mitigation requires a substantive note.'; end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object('deviationId', input_deviation_id, 'note', v_note,
    'expectedRevision', input_expected_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'mitigate_deviation', input_idempotency_key, v_hash); if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id = v_run_id for update;
  select deviation.* into v_deviation from public.routine_deviations deviation where deviation.id = input_deviation_id for update;
  if v_deviation.revision <> input_expected_revision then raise exception using errcode = '40001', message = 'Stale deviation revision.'; end if;
  if not v_context.is_coordinator and v_deviation.assigned_participant_id is distinct from v_context.participant_id then
    raise exception using errcode = 'P0001', message = 'Only the assignee or coordinator can mitigate this deviation.';
  end if;
  if v_deviation.status <> 'open' then raise exception using errcode = 'P0001', message = 'Only an open deviation can be mitigated.'; end if;
  v_previous := v_deviation.revision; perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  update public.routine_deviations set status = 'mitigated', resolution_note = v_note,
    revision = revision + 1 where id = v_deviation.id returning * into v_deviation;
  update public.routine_run_tasks set revision = revision + 1 where id = v_deviation.task_id;
  update public.routine_runs set revision = revision + 1, updated_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_run.id returning * into v_run;
  v_response := jsonb_build_object('deviation', to_jsonb(v_deviation), 'runRevision', v_run.revision, 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, 'mitigate_deviation', input_idempotency_key,
    v_hash, 'deviation', v_deviation.id, v_response, v_run.id, 'deviation_mitigated',
    jsonb_build_object('taskId', v_deviation.task_id, 'deviationId', v_deviation.id), v_previous,
    v_deviation.revision, jsonb_build_object('note', v_note));
  return v_response;
end;
$$;

create or replace function public.resolve_routine_deviation(
  input_deviation_id uuid,
  input_resolution_note text,
  input_expected_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_context record; v_deviation public.routine_deviations%rowtype; v_task public.routine_run_tasks%rowtype;
  v_run public.routine_runs%rowtype; v_run_id uuid; v_note text := nullif(trim(coalesce(input_resolution_note, '')), '');
  v_hash text; v_replay jsonb; v_response jsonb; v_previous bigint;
begin
  select deviation.run_id into v_run_id from public.routine_deviations deviation where deviation.id = input_deviation_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  if v_note is null then raise exception using errcode = 'P0001', message = 'Deviation resolution requires a substantive note.'; end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object('deviationId', input_deviation_id,
    'resolutionNote', v_note, 'expectedRevision', input_expected_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'resolve_deviation', input_idempotency_key, v_hash); if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id = v_run_id for update;
  select deviation.* into v_deviation from public.routine_deviations deviation where deviation.id = input_deviation_id for update;
  select task.* into v_task from public.routine_run_tasks task where task.id = v_deviation.task_id for update;
  if v_deviation.revision <> input_expected_revision then raise exception using errcode = '40001', message = 'Stale deviation revision.'; end if;
  if not v_context.is_coordinator and v_deviation.assigned_participant_id is distinct from v_context.participant_id then
    raise exception using errcode = 'P0001', message = 'Only the assigned participant or coordinator can resolve this deviation.';
  end if;
  if v_deviation.severity = 'critical' and not v_context.is_coordinator then
    raise exception using errcode = 'P0001', message = 'Critical deviation resolution requires coordinator authority.';
  end if;
  if v_deviation.status not in ('open', 'mitigated') then raise exception using errcode = 'P0001', message = 'Deviation is not open for resolution.'; end if;
  v_previous := v_deviation.revision; perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  update public.routine_deviations set status = 'resolved', resolution_note = v_note,
    resolved_at = now(), resolved_by_auth_user_id = v_context.actor_auth_user_id,
    revision = revision + 1 where id = v_deviation.id returning * into v_deviation;
  if v_task.status = 'blocked' and not exists (
    select 1 from public.routine_deviations other where other.task_id = v_task.id
      and other.id <> v_deviation.id and other.status in ('open', 'mitigated')
  ) then
    update public.routine_run_tasks set status = 'in_progress', current_deviation_id = null,
      revision = revision + 1, last_status_changed_at = now(),
      last_status_changed_by_auth_user_id = v_context.actor_auth_user_id
    where id = v_task.id returning * into v_task;
  else
    update public.routine_run_tasks set current_deviation_id = case when current_deviation_id = v_deviation.id then (
      select other.id from public.routine_deviations other where other.task_id = v_task.id
        and other.status in ('open', 'mitigated') order by other.detected_at, other.id limit 1
    ) else current_deviation_id end, revision = revision + 1
    where id = v_task.id returning * into v_task;
  end if;
  update public.routine_runs set revision = revision + 1, updated_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_run.id returning * into v_run;
  v_response := jsonb_build_object('deviation', to_jsonb(v_deviation), 'task', to_jsonb(v_task),
    'runRevision', v_run.revision, 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, 'resolve_deviation', input_idempotency_key,
    v_hash, 'deviation', v_deviation.id, v_response, v_run.id, 'deviation_resolved',
    jsonb_build_object('taskId', v_deviation.task_id, 'deviationId', v_deviation.id), v_previous,
    v_deviation.revision, jsonb_build_object('resolutionNote', v_note, 'taskStatus', v_task.status));
  return v_response;
end;
$$;

create or replace function public.cancel_routine_deviation(
  input_deviation_id uuid,
  input_reason text,
  input_expected_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_context record; v_deviation public.routine_deviations%rowtype; v_run public.routine_runs%rowtype; v_run_id uuid;
  v_reason text := nullif(trim(coalesce(input_reason, '')), ''); v_hash text; v_replay jsonb; v_response jsonb; v_previous bigint;
begin
  select deviation.run_id into v_run_id from public.routine_deviations deviation where deviation.id = input_deviation_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  if not v_context.is_coordinator or v_reason is null then raise exception using errcode = 'P0001', message = 'Coordinator authority and reason are required to cancel a deviation.'; end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object('deviationId', input_deviation_id, 'reason', v_reason,
    'expectedRevision', input_expected_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'cancel_deviation', input_idempotency_key, v_hash); if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id = v_run_id for update;
  select deviation.* into v_deviation from public.routine_deviations deviation where deviation.id = input_deviation_id for update;
  if v_deviation.revision <> input_expected_revision then raise exception using errcode = '40001', message = 'Stale deviation revision.'; end if;
  if v_deviation.status in ('resolved', 'cancelled') then raise exception using errcode = 'P0001', message = 'Deviation is already terminal.'; end if;
  v_previous := v_deviation.revision; perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  update public.routine_deviations set status = 'cancelled', resolution_note = v_reason,
    revision = revision + 1 where id = v_deviation.id returning * into v_deviation;
  update public.routine_run_tasks set revision = revision + 1 where id = v_deviation.task_id;
  update public.routine_runs set revision = revision + 1, updated_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_run.id returning * into v_run;
  v_response := jsonb_build_object('deviation', to_jsonb(v_deviation), 'runRevision', v_run.revision, 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, 'cancel_deviation', input_idempotency_key,
    v_hash, 'deviation', v_deviation.id, v_response, v_run.id, 'deviation_cancelled',
    jsonb_build_object('taskId', v_deviation.task_id, 'deviationId', v_deviation.id), v_previous,
    v_deviation.revision, jsonb_build_object('reason', v_reason));
  return v_response;
end;
$$;

create or replace function public.create_routine_manager_override(
  input_run_id uuid,
  input_task_id uuid,
  input_task_item_id uuid,
  input_deviation_id uuid,
  input_override_type text,
  input_reason text,
  input_remaining_risk text,
  input_temporary_measure text,
  input_follow_up_owner_participant_id uuid,
  input_follow_up_due_at timestamptz,
  input_expires_at timestamptz,
  input_supersedes_override_id uuid,
  input_expected_run_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_context record; v_run public.routine_runs%rowtype; v_task public.routine_run_tasks%rowtype;
  v_deviation public.routine_deviations%rowtype; v_override public.routine_manager_overrides%rowtype;
  v_type text := lower(trim(coalesce(input_override_type, '')));
  v_reason text := nullif(trim(coalesce(input_reason, '')), ''); v_risk text := nullif(trim(coalesce(input_remaining_risk, '')), '');
  v_measure text := nullif(trim(coalesce(input_temporary_measure, '')), '');
  v_hash text; v_replay jsonb; v_response jsonb; v_operation_id uuid;
begin
  select * into v_context from public.routine_lifecycle_context(input_run_id);
  if not v_context.is_manager then raise exception using errcode = 'P0001', message = 'Manager authority is required for a routine override.'; end if;
  if v_reason is null or v_risk is null or v_measure is null or input_follow_up_due_at is null then
    raise exception using errcode = 'P0001', message = 'Override reason, remaining risk, temporary measure, and follow-up due time are required.';
  end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object('runId', input_run_id, 'taskId', input_task_id,
    'taskItemId', input_task_item_id, 'deviationId', input_deviation_id, 'overrideType', v_type,
    'reason', v_reason, 'remainingRisk', v_risk, 'temporaryMeasure', v_measure,
    'followUpOwnerParticipantId', input_follow_up_owner_participant_id, 'followUpDueAt', input_follow_up_due_at,
    'expiresAt', input_expires_at, 'supersedesOverrideId', input_supersedes_override_id,
    'expectedRunRevision', input_expected_run_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'create_override', input_idempotency_key, v_hash); if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id = input_run_id for update;
  if v_run.revision <> input_expected_run_revision then raise exception using errcode = '40001', message = 'Stale routine run revision.'; end if;
  if input_task_id is not null then select task.* into v_task from public.routine_run_tasks task where task.id = input_task_id and task.run_id = v_run.id for update; end if;
  if input_deviation_id is not null then select deviation.* into v_deviation from public.routine_deviations deviation where deviation.id = input_deviation_id and deviation.run_id = v_run.id for update; end if;
  if v_type = 'task_completion' and (v_task.id is null or v_deviation.id is null) then
    raise exception using errcode = 'P0001', message = 'Task-completion override requires a same-run task and deviation.';
  end if;
  if input_expires_at is not null and input_expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'An already expired override cannot be created.';
  end if;
  if input_supersedes_override_id is not null and not exists (
    select 1 from public.routine_manager_overrides old_override where old_override.id = input_supersedes_override_id
      and old_override.run_id = v_run.id
  ) then raise exception using errcode = 'P0001', message = 'Superseded override must belong to the same run.'; end if;
  perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  insert into public.routine_manager_overrides (
    organization_id, run_id, task_id, task_item_id, deviation_id, override_type,
    reason, remaining_risk, temporary_measure, follow_up_owner_participant_id,
    follow_up_due_at, expires_at, supersedes_override_id,
    created_by_auth_user_id, created_by_name_snapshot
  ) values (
    v_context.organization_id, v_run.id, input_task_id, input_task_item_id, input_deviation_id,
    v_type, v_reason, v_risk, v_measure, input_follow_up_owner_participant_id,
    input_follow_up_due_at, input_expires_at, input_supersedes_override_id,
    v_context.actor_auth_user_id, v_context.actor_display_name
  ) returning * into v_override;
  if v_task.id is not null then
    update public.routine_run_tasks set current_override_id = v_override.id,
      revision = revision + 1 where id = v_task.id returning * into v_task;
  end if;
  if v_deviation.id is not null then
    update public.routine_deviations set current_override_id = v_override.id,
      status = 'accepted_temporarily', revision = revision + 1
    where id = v_deviation.id returning * into v_deviation;
  end if;
  update public.routine_runs set revision = revision + 1, updated_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_run.id returning * into v_run;
  v_response := jsonb_build_object('override', to_jsonb(v_override), 'task',
    case when v_task.id is null then null else to_jsonb(v_task) end, 'deviation',
    case when v_deviation.id is null then null else to_jsonb(v_deviation) end,
    'runRevision', v_run.revision, 'idempotentReplay', false);
  v_operation_id := public.routine_complete_lifecycle_operation(v_context.organization_id,
    v_context.actor_auth_user_id, v_context.actor_profile_id, v_context.actor_display_name,
    v_context.actor_role, 'create_override', input_idempotency_key, v_hash, 'manager_override',
    v_override.id, v_response, v_run.id, 'manager_override_created',
    jsonb_strip_nulls(jsonb_build_object('taskId', input_task_id, 'taskItemId', input_task_item_id,
      'deviationId', input_deviation_id, 'managerOverrideId', v_override.id)),
    input_expected_run_revision, v_run.revision, jsonb_build_object('overrideType', v_type,
      'followUpDueAt', input_follow_up_due_at));
  return v_response;
end;
$$;

create or replace function public.routine_record_run_operation_with_id(
  input_operation_id uuid,
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
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  perform set_config('mesh.routine_run_internal', 'operation', true);
  insert into public.routine_run_operations (
    id, organization_id, actor_auth_user_id, operation_type, idempotency_key,
    request_hash, resource_type, resource_id, response_payload
  ) values (
    input_operation_id, input_organization_id, input_actor_auth_user_id,
    input_operation_type, input_idempotency_key, input_request_hash,
    input_resource_type, input_resource_id, input_response_payload
  );
end;
$$;

create or replace function public.verify_routine_task(
  input_task_id uuid,
  input_result text,
  input_note text,
  input_physical_recheck_confirmed boolean,
  input_expected_task_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_context record; v_task public.routine_run_tasks%rowtype; v_run public.routine_runs%rowtype; v_run_id uuid;
  v_result text := lower(trim(coalesce(input_result, ''))); v_note text := nullif(trim(coalesce(input_note, '')), '');
  v_hash text; v_replay jsonb; v_response jsonb; v_verification public.routine_task_verifications%rowtype;
  v_deviation public.routine_deviations%rowtype; v_operation_id uuid := gen_random_uuid();
begin
  select task.run_id into v_run_id from public.routine_run_tasks task where task.id = input_task_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  v_hash := public.routine_run_request_hash(jsonb_build_object('taskId', input_task_id, 'result', v_result,
    'note', v_note, 'physicalRecheckConfirmed', coalesce(input_physical_recheck_confirmed, false),
    'expectedTaskRevision', input_expected_task_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'verify_task', input_idempotency_key, v_hash); if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id = v_run_id for update;
  select task.* into v_task from public.routine_run_tasks task where task.id = input_task_id for update;
  if v_task.revision <> input_expected_task_revision then raise exception using errcode = '40001', message = 'Stale task revision for verification.'; end if;
  if v_task.status <> 'completed' or v_result not in ('passed', 'failed') then
    raise exception using errcode = 'P0001', message = 'A completed task and passed or failed verification result are required.';
  end if;
  if v_task.verification_policy_snapshot = 'none' then raise exception using errcode = 'P0001', message = 'Task verification policy is none.'; end if;
  if v_context.participant_id is null then raise exception using errcode = 'P0001', message = 'Task verifier must be an active run participant.'; end if;
  if v_task.verification_policy_snapshot = 'self_recheck'
     and v_task.completed_by_auth_user_id = v_context.actor_auth_user_id
     and not coalesce(input_physical_recheck_confirmed, false) then
    raise exception using errcode = 'P0001', message = 'Self recheck requires explicit physical recheck confirmation.';
  end if;
  if v_task.verification_policy_snapshot in ('independent', 'second_person_required')
     and v_task.completed_by_auth_user_id = v_context.actor_auth_user_id then
    raise exception using errcode = 'P0001', message = 'Independent or second-person verification cannot be performed by the task completer.';
  end if;
  if v_task.verification_policy_snapshot = 'manager_required' and not v_context.is_manager then
    raise exception using errcode = 'P0001', message = 'Manager verification is required.';
  end if;
  if v_task.verification_policy_snapshot = 'closing_responsible' and not exists (
    select 1 from public.routine_run_role_assignments assignment
    where assignment.run_id = v_run.id and assignment.participant_id = v_context.participant_id
      and assignment.role_key = 'closing_responsible' and assignment.status = 'active'
  ) then raise exception using errcode = 'P0001', message = 'Active closing-responsible assignment is required.'; end if;

  perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  insert into public.routine_task_verifications (
    organization_id, run_id, task_id, task_revision_verified,
    verification_policy_snapshot, result, note, physical_recheck_confirmed,
    completed_by_auth_user_id_snapshot, verifier_participant_id,
    verifier_auth_user_id, verifier_name_snapshot, operation_id
  ) values (
    v_context.organization_id, v_run.id, v_task.id, v_task.revision,
    v_task.verification_policy_snapshot, v_result, v_note,
    coalesce(input_physical_recheck_confirmed, false), v_task.completed_by_auth_user_id,
    v_context.participant_id, v_context.actor_auth_user_id,
    v_context.actor_display_name, v_operation_id
  ) returning * into v_verification;
  if v_result = 'failed' then
    insert into public.routine_deviations (
      organization_id, run_id, task_id, source_type, category, reason_code,
      details, severity, detected_by_auth_user_id, detected_by_name_snapshot
    ) values (
      v_context.organization_id, v_run.id, v_task.id, 'control_result',
      'verification_failure', 'verification_failed', coalesce(v_note, 'Verification failed.'),
      case when v_task.criticality_snapshot = 'critical' then 'critical' else 'important' end,
      v_context.actor_auth_user_id, v_context.actor_display_name
    ) returning * into v_deviation;
    update public.routine_run_tasks set status = 'blocked', outcome = null,
      completed_at = null, completed_by_auth_user_id = null,
      current_deviation_id = v_deviation.id, revision = revision + 1,
      last_status_changed_at = now(), last_status_changed_by_auth_user_id = v_context.actor_auth_user_id
    where id = v_task.id returning * into v_task;
    update public.routine_runs set status = 'in_progress', revision = revision + 1,
      updated_by_auth_user_id = v_context.actor_auth_user_id
    where id = v_run.id returning * into v_run;
  end if;
  v_response := jsonb_build_object('verification', to_jsonb(v_verification),
    'task', to_jsonb(v_task), 'deviation', case when v_deviation.id is null then null else to_jsonb(v_deviation) end,
    'runRevision', v_run.revision, 'idempotentReplay', false);
  perform public.routine_record_run_operation_with_id(v_operation_id, v_context.organization_id,
    v_context.actor_auth_user_id, 'verify_task', input_idempotency_key, v_hash,
    'task_verification', v_verification.id, v_response);
  perform public.routine_record_event(v_run.id, 'task_verification_completed', 'user',
    v_context.actor_auth_user_id, v_context.actor_profile_id, v_context.actor_display_name,
    v_context.actor_role, jsonb_build_object('taskId', v_task.id, 'taskVerificationId', v_verification.id),
    input_expected_task_revision, v_task.revision, jsonb_build_object('result', v_result,
      'physicalRecheckConfirmed', coalesce(input_physical_recheck_confirmed, false)), v_operation_id, 1);
  if v_deviation.id is not null then
    perform public.routine_record_event(v_run.id, 'deviation_opened', 'user',
      v_context.actor_auth_user_id, v_context.actor_profile_id, v_context.actor_display_name,
      v_context.actor_role, jsonb_build_object('taskId', v_task.id, 'deviationId', v_deviation.id),
      null, v_deviation.revision, jsonb_build_object('sourceType', 'control_result', 'severity', v_deviation.severity),
      v_operation_id, 2);
  end if;
  return v_response;
end;
$$;

create or replace function public.request_routine_run_final_verification(
  input_run_id uuid,
  input_expected_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_context record; v_run public.routine_runs%rowtype; v_hash text; v_replay jsonb;
  v_response jsonb; v_previous bigint; v_validation jsonb;
begin
  select * into v_context from public.routine_lifecycle_context(input_run_id);
  v_hash := public.routine_run_request_hash(jsonb_build_object('runId', input_run_id,
    'expectedRevision', input_expected_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'request_run_verification', input_idempotency_key, v_hash); if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id = input_run_id for update;
  if v_run.revision <> input_expected_revision then raise exception using errcode = '40001', message = 'Stale run revision for final verification.'; end if;
  if v_run.status not in ('in_progress', 'reopened') then raise exception using errcode = 'P0001', message = 'Run is not ready to request final verification.'; end if;
  if exists (select 1 from public.routine_run_condition_evaluations condition where condition.run_id = v_run.id
    and condition.evaluation_state in ('pending', 'error')) then
    raise exception using errcode = 'P0001', message = 'Pending or failed conditions block final verification.';
  end if;
  if exists (select 1 from public.routine_run_tasks task where task.run_id = v_run.id
    and task.inclusion_state = 'included' and task.mandatory_snapshot
    and task.task_type_snapshot <> 'verification'
    and task.status not in ('completed', 'not_applicable', 'transferred')) then
    raise exception using errcode = 'P0001', message = 'Mandatory routine work remains before final verification.';
  end if;
  v_previous := v_run.revision; perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  update public.routine_runs set status = 'awaiting_final_verification', revision = revision + 1,
    updated_by_auth_user_id = v_context.actor_auth_user_id where id = v_run.id returning * into v_run;
  v_response := jsonb_build_object('run', to_jsonb(v_run), 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role,
    'request_run_verification', input_idempotency_key, v_hash, 'run', v_run.id,
    v_response, v_run.id, 'run_final_verification_requested', '{}'::jsonb,
    v_previous, v_run.revision, '{}'::jsonb);
  return v_response;
end;
$$;

create or replace function public.complete_routine_run_verification(
  input_run_id uuid,
  input_verification_type text,
  input_items jsonb,
  input_result text,
  input_note text,
  input_expected_run_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_context record; v_run public.routine_runs%rowtype; v_type text := lower(trim(coalesce(input_verification_type, '')));
  v_result text := lower(trim(coalesce(input_result, ''))); v_note text := nullif(trim(coalesce(input_note, '')), '');
  v_hash text; v_replay jsonb; v_response jsonb; v_verification public.routine_run_verifications%rowtype;
  v_operation_id uuid := gen_random_uuid(); v_item jsonb; v_task public.routine_run_tasks%rowtype;
  v_deviation public.routine_deviations%rowtype; v_expected_count integer; v_input_count integer; v_sort integer := 0;
begin
  select * into v_context from public.routine_lifecycle_context(input_run_id);
  if jsonb_typeof(input_items) <> 'array' or v_result not in ('passed', 'failed') then
    raise exception using errcode = 'P0001', message = 'Run verification requires an item array and passed or failed result.';
  end if;
  if v_context.participant_id is null then
    raise exception using errcode = 'P0001', message = 'Run verifier must be an active participant in the run.';
  end if;
  if v_type = 'manager' and not v_context.is_manager then raise exception using errcode = 'P0001', message = 'Manager run verification requires manager authority.'; end if;
  if v_type = 'closing_responsible' and not exists (
    select 1 from public.routine_run_role_assignments assignment
    where assignment.run_id = input_run_id and assignment.participant_id = v_context.participant_id
      and assignment.role_key = 'closing_responsible' and assignment.status = 'active'
  ) then raise exception using errcode = 'P0001', message = 'Closing-responsible run verification requires the active role.'; end if;
  if v_type not in ('closing_responsible', 'manager', 'custom') then raise exception using errcode = 'P0001', message = 'Invalid run verification type.'; end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object('runId', input_run_id,
    'verificationType', v_type, 'items', input_items, 'result', v_result,
    'note', v_note, 'expectedRunRevision', input_expected_run_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'verify_run', input_idempotency_key, v_hash); if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id = input_run_id for update;
  if v_run.revision <> input_expected_run_revision then raise exception using errcode = '40001', message = 'Stale run revision for verification.'; end if;
  if v_run.status <> 'awaiting_final_verification' then raise exception using errcode = 'P0001', message = 'Run is not awaiting final verification.'; end if;
  if exists (select 1 from jsonb_array_elements(input_items) item_value where jsonb_typeof(item_value) <> 'object'
      or nullif(item_value->>'taskId', '') is null)
     or (select count(*) from jsonb_array_elements(input_items)) <>
        (select count(distinct item_value->>'taskId') from jsonb_array_elements(input_items) item_value) then
    raise exception using errcode = 'P0001', message = 'Run verification task IDs must be complete and unique.';
  end if;
  select count(*) into v_expected_count from public.routine_run_tasks task
  where task.run_id = v_run.id and task.inclusion_state = 'included'
    and task.metadata_snapshot->>'runVerificationType' = v_type;
  select count(*) into v_input_count from jsonb_array_elements(input_items);
  if v_input_count <> v_expected_count or exists (
    select 1 from jsonb_array_elements(input_items) item_value
    where not exists (select 1 from public.routine_run_tasks task where task.id = (item_value->>'taskId')::uuid
      and task.run_id = v_run.id and task.metadata_snapshot->>'runVerificationType' = v_type)
  ) then raise exception using errcode = 'P0001', message = 'Run verification must contain the exact server-required task set.'; end if;

  perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  insert into public.routine_run_verifications (
    organization_id, run_id, verification_type, run_revision_verified, result, note,
    verifier_participant_id, verifier_auth_user_id, verifier_name_snapshot, operation_id
  ) values (
    v_context.organization_id, v_run.id, v_type, v_run.revision, v_result, v_note,
    v_context.participant_id, v_context.actor_auth_user_id, v_context.actor_display_name, v_operation_id
  ) returning * into v_verification;
  for v_item in select value from jsonb_array_elements(input_items) loop
    select task.* into v_task from public.routine_run_tasks task
      where task.id = (v_item->>'taskId')::uuid and task.run_id = v_run.id for update;
    insert into public.routine_run_verification_items (
      organization_id, run_verification_id, run_id, task_id, task_revision_verified,
      required, result, physical_check_confirmed, note, sort_order
    ) values (
      v_context.organization_id, v_verification.id, v_run.id, v_task.id, v_task.revision,
      coalesce((v_item->>'required')::boolean, true),
      coalesce(nullif(v_item->>'result', ''), v_result),
      coalesce((v_item->>'physicalCheckConfirmed')::boolean, false),
      nullif(trim(coalesce(v_item->>'note', '')), ''), v_sort
    );
    v_sort := v_sort + 1;
  end loop;
  if v_result = 'failed' then
    select task.* into v_task from public.routine_run_tasks task
      where task.run_id = v_run.id and task.inclusion_state = 'included'
      order by task.sort_order_snapshot, task.id limit 1 for update;
    insert into public.routine_deviations (
      organization_id, run_id, task_id, source_type, category, reason_code,
      details, severity, detected_by_auth_user_id, detected_by_name_snapshot
    ) values (
      v_context.organization_id, v_run.id, v_task.id, 'control_result',
      'run_verification_failure', 'run_verification_failed', coalesce(v_note, 'Run verification failed.'),
      'important', v_context.actor_auth_user_id, v_context.actor_display_name
    ) returning * into v_deviation;
    update public.routine_run_tasks set status = 'blocked', outcome = null,
      completed_at = null, completed_by_auth_user_id = null, current_deviation_id = v_deviation.id,
      revision = revision + 1, last_status_changed_at = now(),
      last_status_changed_by_auth_user_id = v_context.actor_auth_user_id
    where id = v_task.id;
    update public.routine_runs set status = 'in_progress', revision = revision + 1,
      updated_by_auth_user_id = v_context.actor_auth_user_id where id = v_run.id returning * into v_run;
  end if;
  v_response := jsonb_build_object('verification', to_jsonb(v_verification),
    'run', to_jsonb(v_run), 'deviation', case when v_deviation.id is null then null else to_jsonb(v_deviation) end,
    'idempotentReplay', false);
  perform public.routine_record_run_operation_with_id(v_operation_id, v_context.organization_id,
    v_context.actor_auth_user_id, 'verify_run', input_idempotency_key, v_hash,
    'run_verification', v_verification.id, v_response);
  perform public.routine_record_event(v_run.id, 'run_verification_completed', 'user',
    v_context.actor_auth_user_id, v_context.actor_profile_id, v_context.actor_display_name,
    v_context.actor_role, jsonb_build_object('runVerificationId', v_verification.id),
    input_expected_run_revision, v_run.revision, jsonb_build_object('verificationType', v_type,
      'result', v_result, 'itemCount', v_input_count), v_operation_id, 1);
  return v_response;
end;
$$;

create or replace function public.routine_refresh_handover_items_internal(input_handover_id uuid)
returns integer
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_handover public.routine_handovers%rowtype; v_sort integer; v_count integer;
begin
  select handover.* into v_handover from public.routine_handovers handover
    where handover.id = input_handover_id for update;
  if v_handover.id is null or v_handover.status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'Generated handover items require a draft handover.';
  end if;
  perform set_config('mesh.routine_run_internal', 'handover', true);
  delete from public.routine_handover_items item where item.handover_id = v_handover.id and item.generated;
  select coalesce(max(item.sort_order), -1) + 1 into v_sort
  from public.routine_handover_items item where item.handover_id = v_handover.id;
  insert into public.routine_handover_items (
    organization_id, handover_id, from_run_id, source_type,
    source_deviation_id, source_task_id, category, title, details,
    severity, responsible_participant_id, due_at, generated, sort_order
  )
  select deviation.organization_id, v_handover.id, v_handover.from_run_id,
    'deviation', deviation.id, deviation.task_id, deviation.category,
    'Deviation: ' || task.title_snapshot, coalesce(deviation.details, deviation.reason_code),
    deviation.severity, deviation.assigned_participant_id, deviation.due_at, true,
    v_sort - 1 + row_number() over (order by
      case deviation.severity when 'critical' then 0 when 'important' then 1 else 2 end,
      deviation.detected_at, deviation.id)
  from public.routine_deviations deviation
  join public.routine_run_tasks task on task.id = deviation.task_id
  where deviation.run_id = v_handover.from_run_id
    and deviation.status in ('open', 'mitigated', 'accepted_temporarily');
  select coalesce(max(item.sort_order), -1) + 1 into v_sort
  from public.routine_handover_items item where item.handover_id = v_handover.id;
  insert into public.routine_handover_items (
    organization_id, handover_id, from_run_id, source_type,
    source_task_id, source_transfer_id, category, title, details,
    severity, due_at, generated, sort_order
  )
  select transfer.organization_id, v_handover.id, v_handover.from_run_id,
    'transfer', transfer.from_task_id, transfer.id, 'transfer',
    'Transfer: ' || task.title_snapshot, transfer.reason,
    case when task.criticality_snapshot = 'critical' then 'critical' else 'important' end,
    transfer.due_at, true,
    v_sort - 1 + row_number() over (order by transfer.proposed_at, transfer.id)
  from public.routine_run_transfers transfer
  join public.routine_run_tasks task on task.id = transfer.from_task_id
  where transfer.from_run_id = v_handover.from_run_id
    and transfer.status in ('proposed', 'accepted');
  select count(*) into v_count from public.routine_handover_items item where item.handover_id = v_handover.id;
  return v_count;
end;
$$;

create or replace function public.create_or_get_routine_handover(
  input_from_run_id uuid,
  input_handover_type text,
  input_to_run_id uuid,
  input_external_target_type text,
  input_external_target_id text,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_context record; v_handover public.routine_handovers%rowtype;
  v_type text := lower(trim(coalesce(input_handover_type, '')));
  v_external_type text := nullif(lower(trim(coalesce(input_external_target_type, ''))), '');
  v_external_id text := nullif(trim(coalesce(input_external_target_id, '')), '');
  v_hash text; v_replay jsonb; v_response jsonb;
begin
  select * into v_context from public.routine_lifecycle_context(input_from_run_id);
  if not v_context.is_coordinator then raise exception using errcode = 'P0001', message = 'Coordinator authority is required to create a handover.'; end if;
  if (input_to_run_id is null) = (v_external_type is null or v_external_id is null) then
    raise exception using errcode = 'P0001', message = 'Handover requires exactly one routine-run or external target.';
  end if;
  if input_to_run_id is not null and not exists (select 1 from public.routine_runs run
    where run.id = input_to_run_id and run.organization_id = v_context.organization_id and run.snapshot_state = 'ready') then
    raise exception using errcode = 'P0001', message = 'Handover target run must be ready in the same organization.';
  end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object('fromRunId', input_from_run_id,
    'handoverType', v_type, 'toRunId', input_to_run_id, 'externalTargetType', v_external_type,
    'externalTargetId', v_external_id));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'create_handover', input_idempotency_key, v_hash); if v_replay is not null then return v_replay; end if;
  perform pg_advisory_xact_lock(hashtextextended(input_from_run_id::text || '|' || v_type || '|'
    || coalesce(input_to_run_id::text, v_external_type || ':' || v_external_id), 13));
  select handover.* into v_handover from public.routine_handovers handover
  where handover.from_run_id = input_from_run_id and handover.handover_type = v_type
    and coalesce(handover.to_run_id::text, '') = coalesce(input_to_run_id::text, '')
    and coalesce(handover.external_target_type, '') = coalesce(v_external_type, '')
    and coalesce(handover.external_target_id, '') = coalesce(v_external_id, '')
    and handover.status in ('draft', 'submitted') for update;
  perform set_config('mesh.routine_run_internal', 'handover', true);
  if v_handover.id is null then
    insert into public.routine_handovers (
      organization_id, handover_type, from_run_id, to_run_id,
      external_target_type, external_target_id, created_by_auth_user_id, updated_by_auth_user_id
    ) values (
      v_context.organization_id, v_type, input_from_run_id, input_to_run_id,
      v_external_type, v_external_id, v_context.actor_auth_user_id, v_context.actor_auth_user_id
    ) returning * into v_handover;
  end if;
  v_response := jsonb_build_object('handover', to_jsonb(v_handover), 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, 'create_handover',
    input_idempotency_key, v_hash, 'handover', v_handover.id, v_response, input_from_run_id,
    'handover_created', jsonb_build_object('handoverId', v_handover.id), null, v_handover.revision,
    jsonb_build_object('handoverType', v_type));
  return v_response;
end;
$$;

create or replace function public.replace_routine_handover_draft(
  input_handover_id uuid,
  input_summary text,
  input_manual_items jsonb,
  input_expected_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_context record; v_handover public.routine_handovers%rowtype; v_run_id uuid;
  v_summary text := nullif(trim(coalesce(input_summary, '')), ''); v_item jsonb; v_sort integer := 0;
  v_hash text; v_replay jsonb; v_response jsonb; v_previous bigint;
begin
  select handover.from_run_id into v_run_id from public.routine_handovers handover where handover.id = input_handover_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  if not v_context.is_coordinator or jsonb_typeof(input_manual_items) <> 'array' then
    raise exception using errcode = 'P0001', message = 'Coordinator authority and a manual-item array are required.';
  end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object('handoverId', input_handover_id,
    'summary', v_summary, 'manualItems', input_manual_items, 'expectedRevision', input_expected_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'replace_handover', input_idempotency_key, v_hash); if v_replay is not null then return v_replay; end if;
  perform 1 from public.routine_runs run where run.id = v_run_id for update;
  select handover.* into v_handover from public.routine_handovers handover where handover.id = input_handover_id for update;
  if v_handover.revision <> input_expected_revision then raise exception using errcode = '40001', message = 'Stale handover revision.'; end if;
  if v_handover.status <> 'draft' then raise exception using errcode = 'P0001', message = 'Only a draft handover can be edited.'; end if;
  if exists (select 1 from jsonb_array_elements(input_manual_items) item_value where jsonb_typeof(item_value) <> 'object'
    or nullif(trim(item_value->>'category'), '') is null or nullif(trim(item_value->>'title'), '') is null) then
    raise exception using errcode = 'P0001', message = 'Every manual handover item requires category and title.';
  end if;
  v_previous := v_handover.revision; perform set_config('mesh.routine_run_internal', 'handover', true);
  delete from public.routine_handover_items item where item.handover_id = v_handover.id and not item.generated;
  for v_item in select value from jsonb_array_elements(input_manual_items) loop
    insert into public.routine_handover_items (
      organization_id, handover_id, from_run_id, source_type, source_task_id,
      category, title, details, severity, responsible_participant_id, due_at, generated, sort_order
    ) values (
      v_context.organization_id, v_handover.id, v_handover.from_run_id, 'manual',
      nullif(v_item->>'sourceTaskId', '')::uuid, lower(trim(v_item->>'category')),
      trim(v_item->>'title'), nullif(trim(coalesce(v_item->>'details', '')), ''),
      coalesce(nullif(v_item->>'severity', ''), 'normal'),
      nullif(v_item->>'responsibleParticipantId', '')::uuid,
      nullif(v_item->>'dueAt', '')::timestamptz, false, v_sort
    );
    v_sort := v_sort + 1;
  end loop;
  update public.routine_handovers set summary = v_summary, revision = revision + 1,
    updated_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_handover.id returning * into v_handover;
  v_response := jsonb_build_object('handover', to_jsonb(v_handover), 'manualItemCount', v_sort, 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, 'replace_handover',
    input_idempotency_key, v_hash, 'handover', v_handover.id, v_response, v_run_id, 'handover_updated',
    jsonb_build_object('handoverId', v_handover.id), v_previous, v_handover.revision,
    jsonb_build_object('manualItemCount', v_sort));
  return v_response;
end;
$$;

create or replace function public.refresh_routine_handover_generated_items(
  input_handover_id uuid,
  input_expected_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_context record; v_handover public.routine_handovers%rowtype; v_run_id uuid; v_count integer;
  v_hash text; v_replay jsonb; v_response jsonb; v_previous bigint;
begin
  select handover.from_run_id into v_run_id from public.routine_handovers handover where handover.id = input_handover_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  if not v_context.is_coordinator then raise exception using errcode = 'P0001', message = 'Coordinator authority is required to refresh handover items.'; end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object('handoverId', input_handover_id,
    'expectedRevision', input_expected_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'refresh_handover', input_idempotency_key, v_hash); if v_replay is not null then return v_replay; end if;
  perform 1 from public.routine_runs run where run.id = v_run_id for update;
  select handover.* into v_handover from public.routine_handovers handover where handover.id = input_handover_id for update;
  if v_handover.revision <> input_expected_revision then raise exception using errcode = '40001', message = 'Stale handover revision.'; end if;
  v_previous := v_handover.revision; v_count := public.routine_refresh_handover_items_internal(v_handover.id);
  perform set_config('mesh.routine_run_internal', 'handover', true);
  update public.routine_handovers set revision = revision + 1, updated_by_auth_user_id = v_context.actor_auth_user_id
    where id = v_handover.id returning * into v_handover;
  v_response := jsonb_build_object('handover', to_jsonb(v_handover), 'itemCount', v_count, 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, 'refresh_handover',
    input_idempotency_key, v_hash, 'handover', v_handover.id, v_response, v_run_id, 'handover_updated',
    jsonb_build_object('handoverId', v_handover.id), v_previous, v_handover.revision,
    jsonb_build_object('generatedRefresh', true, 'itemCount', v_count));
  return v_response;
end;
$$;

create or replace function public.submit_routine_handover(
  input_handover_id uuid,
  input_expected_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_context record; v_handover public.routine_handovers%rowtype; v_run_id uuid; v_count integer;
  v_hash text; v_replay jsonb; v_response jsonb; v_previous bigint;
begin
  select handover.from_run_id into v_run_id from public.routine_handovers handover where handover.id = input_handover_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  if not v_context.is_coordinator then raise exception using errcode = 'P0001', message = 'Coordinator authority is required to submit a handover.'; end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object('handoverId', input_handover_id,
    'expectedRevision', input_expected_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'submit_handover', input_idempotency_key, v_hash); if v_replay is not null then return v_replay; end if;
  perform 1 from public.routine_runs run where run.id = v_run_id for update;
  select handover.* into v_handover from public.routine_handovers handover where handover.id = input_handover_id for update;
  if v_handover.revision <> input_expected_revision then raise exception using errcode = '40001', message = 'Stale handover revision.'; end if;
  if v_handover.status <> 'draft' then raise exception using errcode = 'P0001', message = 'Only a draft handover can be submitted.'; end if;
  v_previous := v_handover.revision; v_count := public.routine_refresh_handover_items_internal(v_handover.id);
  if exists (select 1 from public.routine_deviations deviation where deviation.run_id = v_run_id
      and deviation.status in ('open', 'mitigated', 'accepted_temporarily') and deviation.severity in ('important', 'critical'))
     and v_count = 0 then
    raise exception using errcode = 'P0001', message = 'Open important or critical conditions must be represented in the handover.';
  end if;
  perform set_config('mesh.routine_run_internal', 'handover', true);
  update public.routine_handovers set status = 'submitted', submitted_at = now(),
    submitted_by_auth_user_id = v_context.actor_auth_user_id, revision = revision + 1,
    updated_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_handover.id returning * into v_handover;
  v_response := jsonb_build_object('handover', to_jsonb(v_handover), 'itemCount', v_count, 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, 'submit_handover',
    input_idempotency_key, v_hash, 'handover', v_handover.id, v_response, v_run_id, 'handover_submitted',
    jsonb_build_object('handoverId', v_handover.id), v_previous, v_handover.revision,
    jsonb_build_object('itemCount', v_count));
  return v_response;
end;
$$;

create or replace function public.accept_routine_handover(
  input_handover_id uuid,
  input_expected_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor record; v_context record; v_handover public.routine_handovers%rowtype; v_hash text;
  v_replay jsonb; v_response jsonb; v_previous bigint;
begin
  select handover.* into v_handover from public.routine_handovers handover where handover.id = input_handover_id;
  select * into v_context from public.routine_lifecycle_context_with_target(
    v_handover.from_run_id,
    v_handover.to_run_id,
    case when v_handover.external_target_type = 'participant'
      then v_handover.external_target_id::uuid else null end
  );
  select * into v_actor from public.routine_resolve_actor();
  if v_handover.external_target_type in ('event_operation', 'event') or v_handover.handover_type = 'event_transfer' then
    raise exception using errcode = 'P0001', message = 'Event-target handover acceptance is deferred to Phase 10H.';
  end if;
  if v_handover.to_run_id is not null and not public.routine_run_is_visible(v_handover.to_run_id, v_context.organization_id) then
    raise exception using errcode = 'P0001', message = 'Target-run access is required to accept this handover.';
  end if;
  if v_handover.to_run_id is null and v_handover.external_target_type = 'participant'
     and v_handover.external_target_id <> v_actor.actor_profile_id::text and not v_context.is_coordinator then
    raise exception using errcode = 'P0001', message = 'Only the explicit target participant can accept this handover.';
  end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object('handoverId', input_handover_id,
    'expectedRevision', input_expected_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'accept_handover', input_idempotency_key, v_hash); if v_replay is not null then return v_replay; end if;
  perform 1 from public.routine_runs run where run.id = v_handover.from_run_id for update;
  select handover.* into v_handover from public.routine_handovers handover where handover.id = input_handover_id for update;
  if v_handover.revision <> input_expected_revision then raise exception using errcode = '40001', message = 'Stale handover revision.'; end if;
  if v_handover.status <> 'submitted' then raise exception using errcode = 'P0001', message = 'Only a submitted handover can be accepted.'; end if;
  v_previous := v_handover.revision; perform set_config('mesh.routine_run_internal', 'handover', true);
  update public.routine_handovers set status = 'accepted', accepted_at = now(),
    accepted_by_auth_user_id = v_context.actor_auth_user_id, revision = revision + 1,
    updated_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_handover.id returning * into v_handover;
  v_response := jsonb_build_object('handover', to_jsonb(v_handover), 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, 'accept_handover',
    input_idempotency_key, v_hash, 'handover', v_handover.id, v_response, v_handover.from_run_id,
    'handover_accepted', jsonb_build_object('handoverId', v_handover.id), v_previous,
    v_handover.revision, '{}'::jsonb);
  return v_response;
end;
$$;

create or replace function public.routine_run_task_items_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_validation jsonb;
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
  if new.revision <= old.revision then
    raise exception using errcode = 'P0001', message = 'Routine task-item revision must increase.';
  end if;
  v_validation := public.routine_validate_task_item_value(
    new.item_type_snapshot, new.input_schema_snapshot, new.status,
    new.value_json, new.result_code,
    coalesce(new.not_applicable_reason, new.blocked_reason)
  );
  if not coalesce((v_validation->>'valid')::boolean, false) then
    raise exception using errcode = 'P0001', message = 'Invalid typed task-item projection: ' || coalesce(v_validation->>'error', 'unknown');
  end if;
  if new.status = 'completed' then
    if new.completed_at is null or new.completed_by_auth_user_id is null then
      raise exception using errcode = 'P0001', message = 'Completed routine task item requires completion metadata.';
    end if;
  elsif new.completed_at is not null or new.completed_by_auth_user_id is not null then
    raise exception using errcode = 'P0001', message = 'Only a completed task item may retain completion metadata.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists routine_deviations_guard on public.routine_deviations;
create trigger routine_deviations_guard before update or delete on public.routine_deviations
for each row execute function public.routine_deviation_guard();
drop trigger if exists routine_manager_overrides_guard on public.routine_manager_overrides;
create trigger routine_manager_overrides_guard before update or delete on public.routine_manager_overrides
for each row execute function public.routine_lifecycle_immutable_guard();
drop trigger if exists routine_task_verifications_guard on public.routine_task_verifications;
create trigger routine_task_verifications_guard before update or delete on public.routine_task_verifications
for each row execute function public.routine_lifecycle_immutable_guard();
drop trigger if exists routine_run_verifications_guard on public.routine_run_verifications;
create trigger routine_run_verifications_guard before update or delete on public.routine_run_verifications
for each row execute function public.routine_lifecycle_immutable_guard();
drop trigger if exists routine_run_verification_items_guard on public.routine_run_verification_items;
create trigger routine_run_verification_items_guard before update or delete on public.routine_run_verification_items
for each row execute function public.routine_lifecycle_immutable_guard();
drop trigger if exists routine_handovers_guard on public.routine_handovers;
create trigger routine_handovers_guard before update or delete on public.routine_handovers
for each row execute function public.routine_handover_guard();
drop trigger if exists routine_handover_items_guard on public.routine_handover_items;
create trigger routine_handover_items_guard before insert or update or delete on public.routine_handover_items
for each row execute function public.routine_handover_item_guard();
drop trigger if exists routine_run_transfers_guard on public.routine_run_transfers;
create trigger routine_run_transfers_guard before update or delete on public.routine_run_transfers
for each row execute function public.routine_transfer_guard();
drop trigger if exists routine_corrections_guard on public.routine_corrections;
create trigger routine_corrections_guard before update or delete on public.routine_corrections
for each row execute function public.routine_lifecycle_immutable_guard();
drop trigger if exists routine_events_guard on public.routine_events;
create trigger routine_events_guard before update or delete on public.routine_events
for each row execute function public.routine_lifecycle_immutable_guard();
drop trigger if exists routine_run_tasks_guard on public.routine_run_tasks;
create trigger routine_run_tasks_guard before update or delete on public.routine_run_tasks
for each row execute function public.routine_run_tasks_guard();
drop trigger if exists routine_run_task_items_guard on public.routine_run_task_items;
create trigger routine_run_task_items_guard before update or delete on public.routine_run_task_items
for each row execute function public.routine_run_task_items_guard();

do $phase10e_template_validator_rename$
begin
  if to_regprocedure('public.validate_routine_template_version_phase10d(uuid,uuid[])') is null then
    alter function public.validate_routine_template_version(uuid, uuid[])
      rename to validate_routine_template_version_phase10d;
  end if;
end;
$phase10e_template_validator_rename$;

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
  v_result jsonb;
  v_blockers jsonb;
begin
  v_result := public.validate_routine_template_version_phase10d(input_version_id, input_publication_version_ids);
  v_blockers := coalesce(v_result->'blockers', '[]'::jsonb);
  if exists (
    select 1 from public.routine_template_tasks task
    where task.version_id = input_version_id
      and task.metadata ? 'runVerificationType'
      and task.metadata->>'runVerificationType' not in ('closing_responsible', 'manager', 'custom')
  ) then
    v_blockers := v_blockers || jsonb_build_array('Unknown runVerificationType metadata value.');
  end if;
  if exists (
    select 1 from public.routine_template_task_items item
    where item.version_id = input_version_id
      and item.input_schema ? 'notApplicablePolicy'
      and item.input_schema->>'notApplicablePolicy' not in ('forbidden', 'allowed_with_reason')
  ) then
    v_blockers := v_blockers || jsonb_build_array('Unknown task-item notApplicablePolicy value.');
  end if;
  return jsonb_set(jsonb_set(v_result, '{blockers}', v_blockers, true), '{valid}',
    to_jsonb(jsonb_array_length(v_blockers) = 0), true);
end;
$$;

create or replace function public.propose_routine_transfer(
  input_task_id uuid,
  input_scope_key text,
  input_target_type text,
  input_target_run_id uuid,
  input_target_participant_id uuid,
  input_target_event_id text,
  input_reason text,
  input_due_at timestamptz,
  input_expected_task_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_run_id uuid; v_context record; v_run public.routine_runs%rowtype;
  v_task public.routine_run_tasks%rowtype; v_transfer public.routine_run_transfers%rowtype;
  v_scope text := lower(trim(coalesce(input_scope_key, 'default')));
  v_target_type text := lower(trim(coalesce(input_target_type, '')));
  v_target_event_id text := nullif(trim(coalesce(input_target_event_id, '')), '');
  v_reason text := nullif(trim(coalesce(input_reason, '')), '');
  v_hash text; v_replay jsonb; v_response jsonb;
begin
  select task.run_id into v_run_id from public.routine_run_tasks task where task.id = input_task_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  if not v_context.is_coordinator then
    raise exception using errcode = 'P0001', message = 'Coordinator authority is required to propose a transfer.';
  end if;
  if input_expected_task_revision is null or input_idempotency_key is null or v_reason is null
     or v_scope !~ '^[a-z][a-z0-9]*(?:[-_:][a-z0-9]+)*$' or char_length(v_scope) > 120 then
    raise exception using errcode = 'P0001', message = 'Transfer scope, reason, expected revision, and idempotency key are required.';
  end if;
  if v_target_type = 'event_operation' then
    raise exception using errcode = 'P0001', message = 'Event-operation transfers are deferred to Phase 10H.';
  end if;
  if not (
    (v_target_type = 'participant' and input_target_participant_id is not null and input_target_run_id is null and v_target_event_id is null)
    or (v_target_type = 'routine_run' and input_target_run_id is not null and input_target_participant_id is null and v_target_event_id is null)
    or (v_target_type = 'external' and v_target_event_id is not null and input_target_participant_id is null and input_target_run_id is null)
  ) then
    raise exception using errcode = 'P0001', message = 'Transfer target shape is invalid.';
  end if;
  if v_target_type = 'participant' and not exists (
    select 1 from public.routine_run_participants participant
    where participant.id = input_target_participant_id and participant.run_id = v_run_id
      and participant.organization_id = v_context.organization_id
      and participant.participation_status <> 'removed'
  ) then
    raise exception using errcode = 'P0001', message = 'Participant transfer target must be active in the source run.';
  end if;
  if v_target_type = 'routine_run' and not exists (
    select 1 from public.routine_runs target
    where target.id = input_target_run_id and target.organization_id = v_context.organization_id
      and target.snapshot_state = 'ready' and target.status not in ('cancelled', 'superseded')
  ) then
    raise exception using errcode = 'P0001', message = 'Routine transfer target must be a ready run in the same organization.';
  end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object(
    'taskId', input_task_id, 'scopeKey', v_scope, 'targetType', v_target_type,
    'targetRunId', input_target_run_id, 'targetParticipantId', input_target_participant_id,
    'targetEventId', v_target_event_id, 'reason', v_reason, 'dueAt', input_due_at,
    'expectedTaskRevision', input_expected_task_revision
  ));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'propose_transfer', input_idempotency_key, v_hash);
  if v_replay is not null then return v_replay; end if;

  select run.* into v_run from public.routine_runs run where run.id = v_run_id for update;
  select task.* into v_task from public.routine_run_tasks task where task.id = input_task_id for update;
  if v_task.revision <> input_expected_task_revision then
    raise exception using errcode = '40001', message = 'Stale routine task revision.';
  end if;
  if v_run.status not in ('in_progress', 'reopened')
     or v_task.inclusion_state <> 'included' or v_task.status not in ('not_started', 'in_progress', 'waiting', 'blocked') then
    raise exception using errcode = 'P0001', message = 'Only an active included task can be transferred.';
  end if;
  if exists (select 1 from public.routine_run_transfers transfer
    where transfer.from_task_id = v_task.id and transfer.scope_key = v_scope
      and transfer.status in ('proposed', 'accepted')) then
    raise exception using errcode = 'P0001', message = 'An active transfer already exists for this task scope.';
  end if;
  insert into public.routine_run_transfers (
    organization_id, from_run_id, from_task_id, scope_key, target_type,
    target_run_id, target_participant_id, target_event_id, reason, due_at,
    source_task_status_before_transfer, proposed_by_auth_user_id
  ) values (
    v_context.organization_id, v_run.id, v_task.id, v_scope, v_target_type,
    input_target_run_id, input_target_participant_id, v_target_event_id, v_reason,
    input_due_at, v_task.status, v_context.actor_auth_user_id
  ) returning * into v_transfer;
  perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  update public.routine_runs set revision = revision + 1, updated_by_auth_user_id = v_context.actor_auth_user_id
    where id = v_run.id returning * into v_run;
  v_response := jsonb_build_object('transfer', to_jsonb(v_transfer), 'task', to_jsonb(v_task),
    'run', to_jsonb(v_run), 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, 'propose_transfer',
    input_idempotency_key, v_hash, 'transfer', v_transfer.id, v_response, v_run.id,
    'transfer_proposed', jsonb_build_object('taskId', v_task.id, 'transferId', v_transfer.id),
    null, v_transfer.revision, jsonb_build_object('targetType', v_target_type, 'scopeKey', v_scope));
  return v_response;
end;
$$;

create or replace function public.routine_change_transfer_status(
  input_transfer_id uuid,
  input_action text,
  input_note text,
  input_expected_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_run_id uuid; v_context record; v_run public.routine_runs%rowtype;
  v_task public.routine_run_tasks%rowtype; v_transfer public.routine_run_transfers%rowtype;
  v_action text := lower(trim(coalesce(input_action, '')));
  v_note text := nullif(trim(coalesce(input_note, '')), '');
  v_operation_type text; v_event_type text; v_hash text; v_replay jsonb; v_response jsonb;
  v_previous bigint;
begin
  select transfer.* into v_transfer from public.routine_run_transfers transfer where transfer.id = input_transfer_id;
  v_run_id := v_transfer.from_run_id;
  select * into v_context from public.routine_lifecycle_context_with_target(
    v_run_id,
    case when input_action = 'accept' then v_transfer.target_run_id else null end,
    case when input_action = 'accept' and v_transfer.target_type = 'participant' then (
      select participant.user_profile_id from public.routine_run_participants participant
      where participant.id = v_transfer.target_participant_id
    ) else null end
  );
  if v_action not in ('accept', 'reject', 'complete', 'cancel') then
    raise exception using errcode = 'P0001', message = 'Unknown transfer action.';
  end if;
  v_operation_type := v_action || '_transfer'; v_event_type := 'transfer_' || case v_action when 'accept' then 'accepted' when 'reject' then 'rejected' when 'complete' then 'completed' else 'cancelled' end;
  if input_expected_revision is null or input_idempotency_key is null
     or (v_action in ('reject', 'complete', 'cancel') and v_note is null) then
    raise exception using errcode = 'P0001', message = 'Expected revision, idempotency key, and the required note are missing.';
  end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object('transferId', input_transfer_id,
    'action', v_action, 'note', v_note, 'expectedRevision', input_expected_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    v_operation_type, input_idempotency_key, v_hash);
  if v_replay is not null then return v_replay; end if;

  select run.* into v_run from public.routine_runs run where run.id = v_run_id for update;
  select task.* into v_task from public.routine_run_tasks task
    join public.routine_run_transfers transfer on transfer.from_task_id = task.id
    where transfer.id = input_transfer_id for update of task;
  select transfer.* into v_transfer from public.routine_run_transfers transfer
    where transfer.id = input_transfer_id for update;
  if v_transfer.revision <> input_expected_revision then
    raise exception using errcode = '40001', message = 'Stale routine transfer revision.';
  end if;
  if v_transfer.target_type = 'event_operation' then
    raise exception using errcode = 'P0001', message = 'Event-operation transfers are deferred to Phase 10H.';
  end if;
  if v_action = 'accept' then
    if v_transfer.status <> 'proposed' then raise exception using errcode = 'P0001', message = 'Only a proposed transfer can be accepted.'; end if;
    if v_transfer.target_type = 'participant' and not (
      exists (select 1 from public.routine_run_participants participant
        where participant.id = v_transfer.target_participant_id
          and participant.user_profile_id = v_context.actor_profile_id
          and participant.participation_status <> 'removed') or v_context.is_coordinator
    ) then raise exception using errcode = 'P0001', message = 'Only the target participant or a coordinator can accept this transfer.'; end if;
    if v_transfer.target_type = 'routine_run' and not public.routine_run_is_visible(v_transfer.target_run_id, v_context.organization_id) then
      raise exception using errcode = 'P0001', message = 'Target-run access is required to accept this transfer.';
    end if;
    if v_transfer.target_type = 'external' and not v_context.is_coordinator then
      raise exception using errcode = 'P0001', message = 'Coordinator authority is required to accept an external transfer.';
    end if;
  elsif not v_context.is_coordinator then
    raise exception using errcode = 'P0001', message = 'Coordinator authority is required for this transfer action.';
  end if;
  if v_action = 'reject' and v_transfer.status <> 'proposed' then raise exception using errcode = 'P0001', message = 'Only a proposed transfer can be rejected.'; end if;
  if v_action = 'complete' and v_transfer.status <> 'accepted' then raise exception using errcode = 'P0001', message = 'Only an accepted transfer can be completed.'; end if;
  if v_action = 'cancel' and v_transfer.status not in ('proposed', 'accepted') then raise exception using errcode = 'P0001', message = 'Only a proposed or accepted transfer can be cancelled.'; end if;

  v_previous := v_transfer.revision;
  perform set_config('mesh.routine_run_internal', 'transfer', true);
  update public.routine_run_transfers set
    status = case v_action when 'accept' then 'accepted' when 'reject' then 'rejected' when 'complete' then 'completed' else 'cancelled' end,
    accepted_at = case when v_action = 'accept' then now() else accepted_at end,
    accepted_by_auth_user_id = case when v_action = 'accept' then v_context.actor_auth_user_id else accepted_by_auth_user_id end,
    rejected_at = case when v_action = 'reject' then now() else rejected_at end,
    rejected_by_auth_user_id = case when v_action = 'reject' then v_context.actor_auth_user_id else rejected_by_auth_user_id end,
    rejection_reason = case when v_action = 'reject' then v_note else rejection_reason end,
    completed_at = case when v_action = 'complete' then now() else completed_at end,
    completed_by_auth_user_id = case when v_action = 'complete' then v_context.actor_auth_user_id else completed_by_auth_user_id end,
    completion_note = case when v_action = 'complete' then v_note else completion_note end,
    cancelled_at = case when v_action = 'cancel' then now() else cancelled_at end,
    cancelled_by_auth_user_id = case when v_action = 'cancel' then v_context.actor_auth_user_id else cancelled_by_auth_user_id end,
    cancellation_reason = case when v_action = 'cancel' then v_note else cancellation_reason end,
    revision = revision + 1
  where id = v_transfer.id returning * into v_transfer;

  perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  if v_action = 'accept' then
    update public.routine_run_tasks set status = 'transferred', outcome = null,
      completed_at = null, completed_by_auth_user_id = null, revision = revision + 1,
      last_status_changed_at = now(), last_status_changed_by_auth_user_id = v_context.actor_auth_user_id
      where id = v_task.id returning * into v_task;
  elsif v_action = 'cancel' and v_task.status = 'transferred' then
    update public.routine_run_tasks set status = v_transfer.source_task_status_before_transfer,
      revision = revision + 1, last_status_changed_at = now(),
      last_status_changed_by_auth_user_id = v_context.actor_auth_user_id
      where id = v_task.id returning * into v_task;
  end if;
  update public.routine_runs set status = case when status = 'waiting_for_transfers' and v_action in ('complete', 'cancel') then 'in_progress' else status end,
    revision = revision + 1, updated_by_auth_user_id = v_context.actor_auth_user_id
    where id = v_run.id returning * into v_run;
  v_response := jsonb_build_object('transfer', to_jsonb(v_transfer), 'task', to_jsonb(v_task),
    'run', to_jsonb(v_run), 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, v_operation_type,
    input_idempotency_key, v_hash, 'transfer', v_transfer.id, v_response, v_run.id, v_event_type,
    jsonb_build_object('taskId', v_task.id, 'transferId', v_transfer.id), v_previous,
    v_transfer.revision, jsonb_build_object('note', v_note));
  return v_response;
end;
$$;

create or replace function public.accept_routine_transfer(input_transfer_id uuid, input_expected_revision bigint, input_idempotency_key uuid)
returns jsonb language sql security definer set search_path = pg_catalog
as $$ select public.routine_change_transfer_status(input_transfer_id, 'accept', null, input_expected_revision, input_idempotency_key) $$;
create or replace function public.reject_routine_transfer(input_transfer_id uuid, input_reason text, input_expected_revision bigint, input_idempotency_key uuid)
returns jsonb language sql security definer set search_path = pg_catalog
as $$ select public.routine_change_transfer_status(input_transfer_id, 'reject', input_reason, input_expected_revision, input_idempotency_key) $$;
create or replace function public.complete_routine_transfer(input_transfer_id uuid, input_note text, input_expected_revision bigint, input_idempotency_key uuid)
returns jsonb language sql security definer set search_path = pg_catalog
as $$ select public.routine_change_transfer_status(input_transfer_id, 'complete', input_note, input_expected_revision, input_idempotency_key) $$;
create or replace function public.cancel_routine_transfer(input_transfer_id uuid, input_reason text, input_expected_revision bigint, input_idempotency_key uuid)
returns jsonb language sql security definer set search_path = pg_catalog
as $$ select public.routine_change_transfer_status(input_transfer_id, 'cancel', input_reason, input_expected_revision, input_idempotency_key) $$;

create or replace function public.routine_validate_run_completion_core(input_run_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog
as $$
declare
  v_run public.routine_runs%rowtype; v_blockers jsonb := '[]'::jsonb; v_warnings jsonb := '[]'::jsonb;
  v_pending_transfers integer; v_required_run_type text;
begin
  select run.* into v_run from public.routine_runs run where run.id = input_run_id;
  if v_run.id is null then return jsonb_build_object('valid', false, 'blockers', jsonb_build_array('run_not_found'), 'warnings', v_warnings); end if;
  if v_run.snapshot_state <> 'ready' or v_run.snapshot_hash is null then v_blockers := v_blockers || '"snapshot_not_ready"'::jsonb; end if;
  if v_run.status not in ('in_progress', 'reopened', 'awaiting_final_verification', 'waiting_for_transfers') then v_blockers := v_blockers || '"run_state_invalid"'::jsonb; end if;
  if exists (select 1 from public.routine_run_tasks task where task.run_id = v_run.id and task.inclusion_state = 'pending') then v_blockers := v_blockers || '"pending_conditions"'::jsonb; end if;
  if exists (select 1 from public.routine_run_tasks task where task.run_id = v_run.id and task.inclusion_state = 'included'
    and task.mandatory_snapshot and task.status not in ('completed', 'not_applicable', 'transferred')) then v_blockers := v_blockers || '"mandatory_tasks_incomplete"'::jsonb; end if;
  if exists (select 1 from public.routine_run_tasks task where task.run_id = v_run.id and task.inclusion_state = 'included'
    and task.criticality_snapshot = 'critical' and task.status not in ('completed', 'not_applicable', 'transferred')) then v_blockers := v_blockers || '"critical_tasks_incomplete"'::jsonb; end if;
  if exists (select 1 from public.routine_run_task_items item join public.routine_run_tasks task on task.id = item.run_task_id
    where item.run_id = v_run.id and task.inclusion_state = 'included' and item.active_snapshot and item.required_snapshot
      and item.status not in ('completed', 'not_applicable')) then v_blockers := v_blockers || '"required_task_items_incomplete"'::jsonb; end if;
  if exists (select 1 from public.routine_run_tasks task where task.run_id = v_run.id and task.status = 'blocked'
    and not public.routine_override_is_current(task.current_override_id)) then v_blockers := v_blockers || '"blocked_tasks_without_override"'::jsonb; end if;
  if exists (select 1 from public.routine_deviations deviation where deviation.run_id = v_run.id
    and deviation.status in ('open', 'mitigated') and deviation.severity in ('important', 'critical')) then v_blockers := v_blockers || '"important_deviations_unresolved"'::jsonb; end if;
  if exists (select 1 from public.routine_run_tasks task where task.run_id = v_run.id and task.status = 'completed'
    and task.verification_policy_snapshot <> 'none' and not exists (
      select 1 from public.routine_task_verifications verification where verification.task_id = task.id
        and verification.task_revision_verified = task.revision and verification.result = 'passed'
    )) then v_blockers := v_blockers || '"task_verification_missing_or_stale"'::jsonb; end if;
  select min(task.metadata_snapshot->>'runVerificationType') into v_required_run_type
  from public.routine_run_tasks task where task.run_id = v_run.id and task.metadata_snapshot ? 'runVerificationType';
  if v_required_run_type is not null and not exists (
    select 1 from public.routine_run_verifications verification
    where verification.run_id = v_run.id and verification.verification_type = v_required_run_type
      and verification.result = 'passed' and verification.run_revision_verified = v_run.revision
      and not exists (
        select 1 from public.routine_run_verification_items verification_item
        join public.routine_run_tasks task on task.id = verification_item.task_id
        where verification_item.run_verification_id = verification.id
          and verification_item.required and verification_item.task_revision_verified <> task.revision
      )
  ) then v_blockers := v_blockers || '"run_verification_missing_or_stale"'::jsonb; end if;
  select count(*) into v_pending_transfers from public.routine_run_transfers transfer
    where transfer.from_run_id = v_run.id and transfer.status = 'accepted';
  if v_pending_transfers > 0 then v_blockers := v_blockers || '"accepted_transfers_pending"'::jsonb; end if;
  if exists (select 1 from public.routine_run_transfers transfer where transfer.from_run_id = v_run.id and transfer.status = 'proposed') then
    v_blockers := v_blockers || '"proposed_transfers_pending"'::jsonb;
  end if;
  if exists (select 1 from public.routine_deviations deviation where deviation.run_id = v_run.id
      and deviation.status in ('open', 'mitigated', 'accepted_temporarily') and deviation.severity in ('important', 'critical'))
     and not exists (select 1 from public.routine_handovers handover where handover.from_run_id = v_run.id and handover.status in ('submitted', 'accepted')) then
    v_blockers := v_blockers || '"required_handover_missing"'::jsonb;
  end if;
  return jsonb_build_object('valid', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers, 'warnings', v_warnings, 'acceptedTransferCount', v_pending_transfers);
end;
$$;

create or replace function public.routine_validate_run_completion_time(input_run_id uuid)
returns jsonb
language sql stable security definer set search_path = pg_catalog
as $$
  select case when exists (
    select 1 from public.routine_run_tasks task where task.run_id = input_run_id
      and task.inclusion_state = 'included' and task.availability_mode_snapshot = 'time_window'
    union all
    select 1 from public.routine_run_task_dependencies dependency
      where dependency.run_id = input_run_id and dependency.dependency_type_snapshot = 'must_reach_time'
  ) then jsonb_build_object('valid', false, 'blockers', jsonb_build_array('timing_engine_pending'), 'warnings', '[]'::jsonb)
  else jsonb_build_object('valid', true, 'blockers', '[]'::jsonb, 'warnings', '[]'::jsonb) end
$$;

create or replace function public.routine_validate_run_completion_delivery(input_run_id uuid)
returns jsonb
language sql stable security definer set search_path = pg_catalog
as $$ select jsonb_build_object('valid', true, 'blockers', '[]'::jsonb, 'warnings', '[]'::jsonb) $$;

create or replace function public.routine_validate_run_completion(input_run_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog
as $$
declare v_core jsonb; v_time jsonb; v_delivery jsonb; v_blockers jsonb; v_warnings jsonb;
begin
  v_core := public.routine_validate_run_completion_core(input_run_id);
  v_time := public.routine_validate_run_completion_time(input_run_id);
  v_delivery := public.routine_validate_run_completion_delivery(input_run_id);
  v_blockers := coalesce(v_core->'blockers','[]'::jsonb) || coalesce(v_time->'blockers','[]'::jsonb) || coalesce(v_delivery->'blockers','[]'::jsonb);
  v_warnings := coalesce(v_core->'warnings','[]'::jsonb) || coalesce(v_time->'warnings','[]'::jsonb) || coalesce(v_delivery->'warnings','[]'::jsonb);
  return jsonb_build_object('valid', jsonb_array_length(v_blockers) = 0, 'blockers', v_blockers,
    'warnings', v_warnings, 'acceptedTransferCount', coalesce((v_core->>'acceptedTransferCount')::integer, 0));
end;
$$;

create or replace function public.routine_finalize_run_extension(input_run_id uuid)
returns jsonb
language sql security definer set search_path = pg_catalog
as $$ select jsonb_build_object('applied', false, 'phase', '10E') $$;

create or replace function public.validate_routine_run_completion(input_run_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog
as $$
declare v_context record;
begin
  select * into v_context from public.routine_lifecycle_context(input_run_id);
  return public.routine_validate_run_completion(input_run_id);
end;
$$;

create or replace function public.finish_routine_run(
  input_run_id uuid, input_expected_run_revision bigint, input_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_context record; v_run public.routine_runs%rowtype; v_validation jsonb;
  v_hash text; v_replay jsonb; v_response jsonb; v_previous bigint; v_only_accepted boolean;
begin
  select * into v_context from public.routine_lifecycle_context(input_run_id);
  if not v_context.is_coordinator then raise exception using errcode = 'P0001', message = 'Coordinator authority is required to finish a routine run.'; end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object('runId', input_run_id, 'expectedRunRevision', input_expected_run_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'finish_run', input_idempotency_key, v_hash); if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id = input_run_id for update;
  if v_run.revision <> input_expected_run_revision then raise exception using errcode = '40001', message = 'Stale routine run revision.'; end if;
  v_validation := public.routine_validate_run_completion(v_run.id);
  v_only_accepted := jsonb_array_length(v_validation->'blockers') = 1 and v_validation->'blockers' ? 'accepted_transfers_pending';
  if not coalesce((v_validation->>'valid')::boolean, false) and not v_only_accepted then
    raise exception using errcode = 'P0001', message = 'Routine run cannot finish: ' || (v_validation->'blockers')::text;
  end if;
  v_previous := v_run.revision; perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  if v_only_accepted then
    update public.routine_runs set status = 'waiting_for_transfers', revision = revision + 1,
      updated_by_auth_user_id = v_context.actor_auth_user_id where id = v_run.id returning * into v_run;
  else
    update public.routine_runs set status = 'finished', finished_at = now(),
      finished_by_auth_user_id = v_context.actor_auth_user_id, current_finish_sequence = current_finish_sequence + 1,
      revision = revision + 1, updated_by_auth_user_id = v_context.actor_auth_user_id
      where id = v_run.id returning * into v_run;
    perform public.routine_finalize_run_extension(v_run.id);
  end if;
  v_response := jsonb_build_object('run', to_jsonb(v_run), 'validation', v_validation, 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, 'finish_run',
    input_idempotency_key, v_hash, 'run', v_run.id, v_response, v_run.id,
    case when v_only_accepted then 'run_waiting_for_transfers' else 'run_finished' end,
    '{}'::jsonb, v_previous, v_run.revision, jsonb_build_object('validation', v_validation));
  return v_response;
end;
$$;

create or replace function public.reopen_routine_run(
  input_run_id uuid, input_reason text, input_expected_run_revision bigint, input_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_context record; v_run public.routine_runs%rowtype; v_window integer; v_reason text := nullif(trim(coalesce(input_reason,'')),'');
  v_hash text; v_replay jsonb; v_response jsonb; v_previous bigint;
begin
  select * into v_context from public.routine_lifecycle_context(input_run_id);
  if not v_context.is_manager or v_reason is null then raise exception using errcode = 'P0001', message = 'Manager authority and a substantive reason are required to reopen a run.'; end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object('runId', input_run_id, 'reason', v_reason, 'expectedRunRevision', input_expected_run_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'reopen_run', input_idempotency_key, v_hash); if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id = input_run_id for update;
  if v_run.revision <> input_expected_run_revision then raise exception using errcode = '40001', message = 'Stale routine run revision.'; end if;
  select settings.reopen_window_hours into v_window from public.routine_organization_settings settings where settings.organization_id = v_run.organization_id;
  if v_run.status <> 'finished' or v_run.finished_at is null or now() > v_run.finished_at + make_interval(hours => v_window) then
    raise exception using errcode = 'P0001', message = 'The finished run is outside the configured reopen window.';
  end if;
  v_previous := v_run.revision; perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  update public.routine_runs set status = 'reopened', finished_at = null, finished_by_auth_user_id = null,
    reopen_count = reopen_count + 1, revision = revision + 1, updated_by_auth_user_id = v_context.actor_auth_user_id
    where id = v_run.id returning * into v_run;
  v_response := jsonb_build_object('run', to_jsonb(v_run), 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, 'reopen_run', input_idempotency_key,
    v_hash, 'run', v_run.id, v_response, v_run.id, 'run_reopened', '{}'::jsonb, v_previous, v_run.revision,
    jsonb_build_object('reason', v_reason));
  return v_response;
end;
$$;

create or replace function public.cancel_routine_run(
  input_run_id uuid, input_reason text, input_expected_run_revision bigint, input_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_context record; v_run public.routine_runs%rowtype; v_reason text := nullif(trim(coalesce(input_reason,'')),'');
  v_hash text; v_replay jsonb; v_response jsonb; v_previous bigint;
begin
  select * into v_context from public.routine_lifecycle_context(input_run_id);
  if not v_context.is_coordinator or v_reason is null then raise exception using errcode = 'P0001', message = 'Coordinator authority and a substantive cancellation reason are required.'; end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object('runId', input_run_id, 'reason', v_reason, 'expectedRunRevision', input_expected_run_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'cancel_run', input_idempotency_key, v_hash); if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id = input_run_id for update;
  if v_run.revision <> input_expected_run_revision then raise exception using errcode = '40001', message = 'Stale routine run revision.'; end if;
  if v_run.status in ('cancelled', 'superseded') then raise exception using errcode = 'P0001', message = 'Routine run is already terminal.'; end if;
  v_previous := v_run.revision; perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  update public.routine_runs set status = 'cancelled', revision = revision + 1,
    updated_by_auth_user_id = v_context.actor_auth_user_id where id = v_run.id returning * into v_run;
  v_response := jsonb_build_object('run', to_jsonb(v_run), 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, 'cancel_run', input_idempotency_key,
    v_hash, 'run', v_run.id, v_response, v_run.id, 'run_cancelled', '{}'::jsonb, v_previous, v_run.revision,
    jsonb_build_object('reason', v_reason));
  return v_response;
end;
$$;

create or replace function public.record_routine_history_correction(
  input_run_id uuid, input_entity_type text, input_entity_id uuid, input_field_or_claim text,
  input_original_value jsonb, input_corrected_value jsonb, input_reason text, input_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_context record; v_run public.routine_runs%rowtype; v_correction public.routine_corrections%rowtype;
  v_entity_type text := lower(trim(coalesce(input_entity_type,''))); v_field text := lower(trim(coalesce(input_field_or_claim,'')));
  v_reason text := nullif(trim(coalesce(input_reason,'')),''); v_hash text; v_replay jsonb; v_response jsonb;
begin
  select * into v_context from public.routine_lifecycle_context(input_run_id);
  if not v_context.is_manager then raise exception using errcode = 'P0001', message = 'Manager authority is required to record a history correction.'; end if;
  if input_entity_id is null or input_original_value is null or input_corrected_value is null
     or input_original_value is not distinct from input_corrected_value or v_reason is null then
    raise exception using errcode = 'P0001', message = 'Correction identity, distinct values, and a substantive reason are required.';
  end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object('runId', input_run_id, 'entityType', v_entity_type,
    'entityId', input_entity_id, 'fieldOrClaim', v_field, 'originalValue', input_original_value,
    'correctedValue', input_corrected_value, 'reason', v_reason));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'record_correction', input_idempotency_key, v_hash); if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id = input_run_id for update;
  insert into public.routine_corrections (organization_id, run_id, entity_type, entity_id, field_or_claim,
    original_value, corrected_value, reason, created_by_auth_user_id, created_by_name_snapshot)
  values (v_context.organization_id, v_run.id, v_entity_type, input_entity_id, v_field,
    input_original_value, input_corrected_value, v_reason, v_context.actor_auth_user_id,
    v_context.actor_display_name) returning * into v_correction;
  perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  update public.routine_runs set revision = revision + 1, updated_by_auth_user_id = v_context.actor_auth_user_id
    where id = v_run.id returning * into v_run;
  v_response := jsonb_build_object('correction', to_jsonb(v_correction), 'run', to_jsonb(v_run), 'idempotentReplay', false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, 'record_correction', input_idempotency_key,
    v_hash, 'correction', v_correction.id, v_response, v_run.id, 'history_correction_recorded',
    jsonb_build_object('correctionId', v_correction.id), null, null,
    jsonb_build_object('entityType', v_entity_type, 'fieldOrClaim', v_field));
  return v_response;
end;
$$;

do $phase10e_base_rpc_rename$
begin
  if to_regprocedure('public.create_or_get_routine_run_phase10d(text,text,date,uuid)') is null then
    alter function public.create_or_get_routine_run(text, text, date, uuid) rename to create_or_get_routine_run_phase10d;
  end if;
  if to_regprocedure('public.join_routine_run_phase10d(uuid,uuid)') is null then
    alter function public.join_routine_run(uuid, uuid) rename to join_routine_run_phase10d;
  end if;
  if to_regprocedure('public.assign_routine_run_role_phase10d(uuid,uuid,text,text,text,bigint,uuid)') is null then
    alter function public.assign_routine_run_role(uuid, uuid, text, text, text, bigint, uuid) rename to assign_routine_run_role_phase10d;
  end if;
  if to_regprocedure('public.get_routine_run_workspace_phase10d(uuid)') is null then
    alter function public.get_routine_run_workspace(uuid) rename to get_routine_run_workspace_phase10d;
  end if;
end;
$phase10e_base_rpc_rename$;

create or replace function public.create_or_get_routine_run(
  input_routine_key text, input_scope_key text, input_operational_date date, input_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_response jsonb; v_context record; v_run public.routine_runs%rowtype;
  v_participant public.routine_run_participants%rowtype; v_operation_id uuid; v_sequence integer := 1;
begin
  v_response := public.create_or_get_routine_run_phase10d(input_routine_key, input_scope_key,
    input_operational_date, input_idempotency_key);
  select * into v_run from public.routine_runs where id = (v_response->'run'->>'id')::uuid;
  select * into v_context from public.routine_lifecycle_context(v_run.id);
  select * into v_participant from public.routine_run_participants where id = (v_response->'participant'->>'id')::uuid;
  v_operation_id := public.routine_lifecycle_operation_id(v_context.organization_id,
    v_context.actor_auth_user_id, 'create_run', input_idempotency_key);
  if not coalesce((v_response->>'idempotentReplay')::boolean, false)
     and v_run.creation_idempotency_key = input_idempotency_key then
    perform public.routine_record_event(v_run.id, 'run_created', 'user', v_context.actor_auth_user_id,
      v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, '{}'::jsonb,
      null, v_run.revision, jsonb_build_object('routineKey', v_run.routine_key, 'scopeKey', v_run.scope_key),
      v_operation_id, v_sequence);
    v_sequence := v_sequence + 1;
  end if;
  if not coalesce((v_response->>'idempotentReplay')::boolean, false)
     and v_participant.creation_idempotency_key = input_idempotency_key then
    perform public.routine_record_event(v_run.id, 'participant_joined', 'user', v_context.actor_auth_user_id,
      v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, '{}'::jsonb,
      null, v_participant.revision, jsonb_build_object('participantId', v_participant.id),
      v_operation_id, v_sequence);
  end if;
  return v_response;
end;
$$;

create or replace function public.join_routine_run(input_run_id uuid, input_idempotency_key uuid)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_response jsonb; v_context record; v_participant public.routine_run_participants%rowtype; v_operation_id uuid;
begin
  v_response := public.join_routine_run_phase10d(input_run_id, input_idempotency_key);
  select * into v_context from public.routine_lifecycle_context(input_run_id);
  select * into v_participant from public.routine_run_participants where id = (v_response->'participant'->>'id')::uuid;
  if not coalesce((v_response->>'idempotentReplay')::boolean, false)
     and v_participant.creation_idempotency_key = input_idempotency_key then
    v_operation_id := public.routine_lifecycle_operation_id(v_context.organization_id,
      v_context.actor_auth_user_id, 'join_run', input_idempotency_key);
    perform public.routine_record_event(input_run_id, 'participant_joined', 'user', v_context.actor_auth_user_id,
      v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role, '{}'::jsonb,
      null, v_participant.revision, jsonb_build_object('participantId', v_participant.id), v_operation_id, 1);
  end if;
  return v_response;
end;
$$;

create or replace function public.assign_routine_run_role(
  input_run_id uuid, input_participant_id uuid, input_role_key text, input_scope_key text,
  input_replacement_reason text, input_expected_run_revision bigint, input_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_response jsonb; v_context record; v_operation_id uuid; v_new_revision bigint;
begin
  v_response := public.assign_routine_run_role_phase10d(input_run_id, input_participant_id,
    input_role_key, input_scope_key, input_replacement_reason, input_expected_run_revision, input_idempotency_key);
  v_new_revision := (v_response->'run'->>'revision')::bigint;
  if not coalesce((v_response->>'idempotentReplay')::boolean, false) and v_new_revision > input_expected_run_revision then
    select * into v_context from public.routine_lifecycle_context(input_run_id);
    v_operation_id := public.routine_lifecycle_operation_id(v_context.organization_id,
      v_context.actor_auth_user_id, 'assign_role', input_idempotency_key);
    perform public.routine_record_event(input_run_id,
      case when v_response->>'previousAssignmentId' is null then 'role_assigned' else 'role_replaced' end,
      'user', v_context.actor_auth_user_id, v_context.actor_profile_id, v_context.actor_display_name,
      v_context.actor_role, '{}'::jsonb, input_expected_run_revision, v_new_revision,
      jsonb_build_object('assignmentId', v_response->'assignment'->>'id',
        'participantId', input_participant_id, 'roleKey', lower(trim(input_role_key)),
        'scopeKey', lower(trim(input_scope_key)), 'previousAssignmentId', v_response->'previousAssignmentId'),
      v_operation_id, 1);
  end if;
  return v_response;
end;
$$;

create or replace function public.get_routine_run_workspace(input_run_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog
as $$
declare v_workspace jsonb; v_context record;
begin
  select * into v_context from public.routine_lifecycle_context(input_run_id);
  v_workspace := public.get_routine_run_workspace_phase10d(input_run_id);
  return v_workspace || jsonb_build_object(
    'deviations', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.detected_at, row_value.id)
      from public.routine_deviations row_value where row_value.run_id = input_run_id), '[]'::jsonb),
    'managerOverrides', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.created_at, row_value.id)
      from public.routine_manager_overrides row_value where row_value.run_id = input_run_id), '[]'::jsonb),
    'taskVerifications', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.verified_at, row_value.id)
      from public.routine_task_verifications row_value where row_value.run_id = input_run_id), '[]'::jsonb),
    'runVerifications', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.verified_at, row_value.id)
      from public.routine_run_verifications row_value where row_value.run_id = input_run_id), '[]'::jsonb),
    'runVerificationItems', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.run_verification_id, row_value.sort_order)
      from public.routine_run_verification_items row_value where row_value.run_id = input_run_id), '[]'::jsonb),
    'handovers', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.created_at, row_value.id)
      from public.routine_handovers row_value where row_value.from_run_id = input_run_id or row_value.to_run_id = input_run_id), '[]'::jsonb),
    'handoverItems', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.handover_id, row_value.sort_order)
      from public.routine_handover_items row_value where row_value.from_run_id = input_run_id), '[]'::jsonb),
    'transfers', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.proposed_at, row_value.id)
      from public.routine_run_transfers row_value where row_value.from_run_id = input_run_id or row_value.target_run_id = input_run_id), '[]'::jsonb),
    'recentTaskComments', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.server_created_at desc, row_value.id desc)
      from (select event.* from public.routine_events event where event.run_id = input_run_id
        and event.event_type = 'task_comment_added' order by event.server_created_at desc, event.id desc limit 100) row_value), '[]'::jsonb),
    'corrections', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.created_at, row_value.id)
      from public.routine_corrections row_value where row_value.run_id = input_run_id), '[]'::jsonb),
    'completionValidation', public.routine_validate_run_completion(input_run_id),
    'sync', (v_workspace->'sync') || jsonb_build_object('readOnlyPhase', '10E')
  );
end;
$$;

create or replace function public.get_routine_run_timeline(input_run_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog
as $$
declare v_context record;
begin
  select * into v_context from public.routine_lifecycle_context(input_run_id);
  return jsonb_build_object(
    'events', coalesce((select jsonb_agg(to_jsonb(event) order by event.server_created_at, event.id)
      from public.routine_events event where event.run_id = input_run_id), '[]'::jsonb),
    'corrections', coalesce((select jsonb_agg(to_jsonb(correction) order by correction.created_at, correction.id)
      from public.routine_corrections correction where correction.run_id = input_run_id), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_routine_task_timeline(input_task_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog
as $$
declare v_run_id uuid; v_context record;
begin
  select task.run_id into v_run_id from public.routine_run_tasks task where task.id = input_task_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  return jsonb_build_object(
    'events', coalesce((select jsonb_agg(to_jsonb(event) order by event.server_created_at, event.id)
      from public.routine_events event where event.task_id = input_task_id), '[]'::jsonb),
    'corrections', coalesce((select jsonb_agg(to_jsonb(correction) order by correction.created_at, correction.id)
      from public.routine_corrections correction where correction.run_id = v_run_id
        and correction.entity_id = input_task_id), '[]'::jsonb)
  );
end;
$$;

alter table public.routine_deviations enable row level security;
alter table public.routine_manager_overrides enable row level security;
alter table public.routine_task_verifications enable row level security;
alter table public.routine_run_verifications enable row level security;
alter table public.routine_run_verification_items enable row level security;
alter table public.routine_handovers enable row level security;
alter table public.routine_handover_items enable row level security;
alter table public.routine_run_transfers enable row level security;
alter table public.routine_corrections enable row level security;
alter table public.routine_events enable row level security;

drop policy if exists routine_deviations_read on public.routine_deviations;
create policy routine_deviations_read on public.routine_deviations for select to authenticated using (
  organization_id = (select public.routine_current_user_organization_id()) and public.routine_run_is_visible(run_id, organization_id));
drop policy if exists routine_manager_overrides_read on public.routine_manager_overrides;
create policy routine_manager_overrides_read on public.routine_manager_overrides for select to authenticated using (
  organization_id = (select public.routine_current_user_organization_id()) and public.routine_run_is_visible(run_id, organization_id));
drop policy if exists routine_task_verifications_read on public.routine_task_verifications;
create policy routine_task_verifications_read on public.routine_task_verifications for select to authenticated using (
  organization_id = (select public.routine_current_user_organization_id()) and public.routine_run_is_visible(run_id, organization_id));
drop policy if exists routine_run_verifications_read on public.routine_run_verifications;
create policy routine_run_verifications_read on public.routine_run_verifications for select to authenticated using (
  organization_id = (select public.routine_current_user_organization_id()) and public.routine_run_is_visible(run_id, organization_id));
drop policy if exists routine_run_verification_items_read on public.routine_run_verification_items;
create policy routine_run_verification_items_read on public.routine_run_verification_items for select to authenticated using (
  organization_id = (select public.routine_current_user_organization_id()) and public.routine_run_is_visible(run_id, organization_id));
drop policy if exists routine_handovers_read on public.routine_handovers;
create policy routine_handovers_read on public.routine_handovers for select to authenticated using (
  organization_id = (select public.routine_current_user_organization_id()) and
  (public.routine_run_is_visible(from_run_id, organization_id) or (to_run_id is not null and public.routine_run_is_visible(to_run_id, organization_id))));
drop policy if exists routine_handover_items_read on public.routine_handover_items;
create policy routine_handover_items_read on public.routine_handover_items for select to authenticated using (
  organization_id = (select public.routine_current_user_organization_id()) and public.routine_run_is_visible(from_run_id, organization_id));
drop policy if exists routine_run_transfers_read on public.routine_run_transfers;
create policy routine_run_transfers_read on public.routine_run_transfers for select to authenticated using (
  organization_id = (select public.routine_current_user_organization_id()) and (
    public.routine_run_is_visible(from_run_id, organization_id)
    or (target_run_id is not null and public.routine_run_is_visible(target_run_id, organization_id))
    or exists (select 1 from public.routine_run_participants participant
      where participant.id = target_participant_id and participant.user_profile_id = (select auth.uid()))
  ));
drop policy if exists routine_corrections_read on public.routine_corrections;
create policy routine_corrections_read on public.routine_corrections for select to authenticated using (
  organization_id = (select public.routine_current_user_organization_id()) and public.routine_run_is_visible(run_id, organization_id));
drop policy if exists routine_events_read on public.routine_events;
create policy routine_events_read on public.routine_events for select to authenticated using (
  organization_id = (select public.routine_current_user_organization_id()) and public.routine_run_is_visible(run_id, organization_id));

revoke all privileges on table public.routine_deviations from public, anon, authenticated;
revoke all privileges on table public.routine_manager_overrides from public, anon, authenticated;
revoke all privileges on table public.routine_task_verifications from public, anon, authenticated;
revoke all privileges on table public.routine_run_verifications from public, anon, authenticated;
revoke all privileges on table public.routine_run_verification_items from public, anon, authenticated;
revoke all privileges on table public.routine_handovers from public, anon, authenticated;
revoke all privileges on table public.routine_handover_items from public, anon, authenticated;
revoke all privileges on table public.routine_run_transfers from public, anon, authenticated;
revoke all privileges on table public.routine_corrections from public, anon, authenticated;
revoke all privileges on table public.routine_events from public, anon, authenticated;
grant select on table public.routine_deviations, public.routine_manager_overrides,
  public.routine_task_verifications, public.routine_run_verifications,
  public.routine_run_verification_items, public.routine_handovers,
  public.routine_handover_items, public.routine_run_transfers,
  public.routine_corrections, public.routine_events to authenticated;

do $phase10e_function_privileges$
declare v_function record;
begin
  for v_function in
    select procedure.proname, pg_catalog.pg_get_function_identity_arguments(procedure.oid) as arguments
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public' and procedure.proname = any (array[
      'routine_lifecycle_immutable_guard','routine_deviation_guard','routine_handover_guard',
      'routine_handover_item_guard','routine_transfer_guard','routine_task_transition_allowed',
      'routine_run_transition_allowed','routine_validate_task_item_value','routine_run_tasks_guard',
      'routine_run_task_items_guard','routine_lifecycle_context','routine_lifecycle_operation_id',
      'routine_lifecycle_context_with_target',
      'routine_record_event','routine_complete_lifecycle_operation','routine_task_dependency_validation',
      'routine_override_is_current','routine_validate_task_completion','routine_record_run_operation_with_id',
      'routine_refresh_handover_items_internal','routine_change_transfer_status',
      'routine_validate_run_completion_core','routine_validate_run_completion_time',
      'routine_validate_run_completion_delivery','routine_validate_run_completion',
      'routine_finalize_run_extension','create_or_get_routine_run_phase10d','join_routine_run_phase10d',
      'assign_routine_run_role_phase10d','get_routine_run_workspace_phase10d',
      'validate_routine_template_version_phase10d','validate_routine_template_version',
      'start_routine_run','claim_routine_task','release_routine_task','start_routine_task',
      'pause_routine_task','record_routine_initial_assessment','update_routine_task_item',
      'add_routine_task_comment','block_routine_task','mark_routine_task_not_applicable',
      'complete_routine_task','reopen_routine_task','create_routine_deviation','assign_routine_deviation',
      'mitigate_routine_deviation','resolve_routine_deviation','cancel_routine_deviation',
      'create_routine_manager_override','verify_routine_task','request_routine_run_final_verification',
      'complete_routine_run_verification','create_or_get_routine_handover',
      'replace_routine_handover_draft','refresh_routine_handover_generated_items',
      'submit_routine_handover','accept_routine_handover','propose_routine_transfer',
      'accept_routine_transfer','reject_routine_transfer','complete_routine_transfer',
      'cancel_routine_transfer','validate_routine_run_completion','finish_routine_run',
      'reopen_routine_run','cancel_routine_run','record_routine_history_correction',
      'create_or_get_routine_run','join_routine_run','assign_routine_run_role',
      'get_routine_run_workspace','get_routine_run_timeline','get_routine_task_timeline'
    ])
  loop
    execute pg_catalog.format('revoke all on function public.%I(%s) from public, anon, authenticated',
      v_function.proname, v_function.arguments);
  end loop;
end;
$phase10e_function_privileges$;

grant execute on function public.validate_routine_template_version(uuid, uuid[]) to authenticated;
grant execute on function public.create_or_get_routine_run(text, text, date, uuid) to authenticated;
grant execute on function public.join_routine_run(uuid, uuid) to authenticated;
grant execute on function public.assign_routine_run_role(uuid, uuid, text, text, text, bigint, uuid) to authenticated;
grant execute on function public.start_routine_run(uuid, bigint, uuid) to authenticated;
grant execute on function public.claim_routine_task(uuid, bigint, uuid) to authenticated;
grant execute on function public.release_routine_task(uuid, bigint, uuid) to authenticated;
grant execute on function public.start_routine_task(uuid, bigint, uuid) to authenticated;
grant execute on function public.pause_routine_task(uuid, text, bigint, uuid) to authenticated;
grant execute on function public.record_routine_initial_assessment(uuid, text, text, text, bigint, uuid) to authenticated;
grant execute on function public.update_routine_task_item(uuid, text, jsonb, text, text, bigint, uuid) to authenticated;
grant execute on function public.add_routine_task_comment(uuid, text, uuid) to authenticated;
grant execute on function public.block_routine_task(uuid, text, text, text, text, timestamptz, bigint, uuid) to authenticated;
grant execute on function public.mark_routine_task_not_applicable(uuid, text, bigint, uuid) to authenticated;
grant execute on function public.complete_routine_task(uuid, text, boolean, bigint, uuid) to authenticated;
grant execute on function public.reopen_routine_task(uuid, text, bigint, uuid) to authenticated;
grant execute on function public.create_routine_deviation(uuid, uuid, text, text, text, text, text, uuid, timestamptz, bigint, uuid) to authenticated;
grant execute on function public.assign_routine_deviation(uuid, uuid, bigint, uuid) to authenticated;
grant execute on function public.mitigate_routine_deviation(uuid, text, bigint, uuid) to authenticated;
grant execute on function public.resolve_routine_deviation(uuid, text, bigint, uuid) to authenticated;
grant execute on function public.cancel_routine_deviation(uuid, text, bigint, uuid) to authenticated;
grant execute on function public.create_routine_manager_override(uuid, uuid, uuid, uuid, text, text, text, text, uuid, timestamptz, timestamptz, uuid, bigint, uuid) to authenticated;
grant execute on function public.verify_routine_task(uuid, text, text, boolean, bigint, uuid) to authenticated;
grant execute on function public.request_routine_run_final_verification(uuid, bigint, uuid) to authenticated;
grant execute on function public.complete_routine_run_verification(uuid, text, jsonb, text, text, bigint, uuid) to authenticated;
grant execute on function public.create_or_get_routine_handover(uuid, text, uuid, text, text, uuid) to authenticated;
grant execute on function public.replace_routine_handover_draft(uuid, text, jsonb, bigint, uuid) to authenticated;
grant execute on function public.refresh_routine_handover_generated_items(uuid, bigint, uuid) to authenticated;
grant execute on function public.submit_routine_handover(uuid, bigint, uuid) to authenticated;
grant execute on function public.accept_routine_handover(uuid, bigint, uuid) to authenticated;
grant execute on function public.propose_routine_transfer(uuid, text, text, uuid, uuid, text, text, timestamptz, bigint, uuid) to authenticated;
grant execute on function public.accept_routine_transfer(uuid, bigint, uuid) to authenticated;
grant execute on function public.reject_routine_transfer(uuid, text, bigint, uuid) to authenticated;
grant execute on function public.complete_routine_transfer(uuid, text, bigint, uuid) to authenticated;
grant execute on function public.cancel_routine_transfer(uuid, text, bigint, uuid) to authenticated;
grant execute on function public.validate_routine_run_completion(uuid) to authenticated;
grant execute on function public.finish_routine_run(uuid, bigint, uuid) to authenticated;
grant execute on function public.reopen_routine_run(uuid, text, bigint, uuid) to authenticated;
grant execute on function public.cancel_routine_run(uuid, text, bigint, uuid) to authenticated;
grant execute on function public.record_routine_history_correction(uuid, text, uuid, text, jsonb, jsonb, text, uuid) to authenticated;
grant execute on function public.get_routine_run_workspace(uuid) to authenticated;
grant execute on function public.get_routine_run_timeline(uuid) to authenticated;
grant execute on function public.get_routine_task_timeline(uuid) to authenticated;

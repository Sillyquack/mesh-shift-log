-- Phase 10H: Double Shift bundles, between-shift continuity, read-only
-- external Event Operations context, and immutable event-transfer evidence.
--
-- Apply after Phase 10A through Phase 10G. This additive layer never writes
-- Event Operations, calendar, Inventory, Asset, Auth, legacy routine, or
-- Storage data and contains no production activation or seeded routine content.

create table if not exists public.routine_bundles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  bundle_type text not null default 'double_shift',
  operational_date date not null,
  timezone text not null,
  scope_key text not null default 'default',
  opening_routine_key text not null,
  closing_routine_key text not null,
  status text not null default 'scheduled',
  revision bigint not null default 1,
  creation_idempotency_key uuid not null,
  creation_request_hash text not null,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by_auth_user_id uuid references auth.users(id),
  cancellation_reason text,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by_auth_user_id uuid not null references auth.users(id),
  constraint routine_bundles_id_org_unique unique (id, organization_id),
  constraint routine_bundles_org_idempotency_unique unique (organization_id, creation_idempotency_key),
  constraint routine_bundles_type_check check (bundle_type = 'double_shift'),
  constraint routine_bundles_timezone_check check (timezone = 'Europe/Oslo'),
  constraint routine_bundles_status_check check (status in (
    'scheduled','opening_in_progress','opening_complete','between_shifts','closing_due',
    'closing_in_progress','closing_scope_complete','waiting_for_transferred_event_close',
    'completed','cancelled'
  )),
  constraint routine_bundles_revision_check check (revision > 0),
  constraint routine_bundles_creation_hash_check check (creation_request_hash ~ '^[0-9a-f]{64}$'),
  constraint routine_bundles_scope_check check (
    scope_key = trim(scope_key)
    and scope_key ~ '^[a-z][a-z0-9]*(?:[-_:][a-z0-9]+)*$'
    and char_length(scope_key) between 1 and 120
  ),
  constraint routine_bundles_routine_keys_check check (
    opening_routine_key <> closing_routine_key
    and opening_routine_key = trim(opening_routine_key)
    and closing_routine_key = trim(closing_routine_key)
    and opening_routine_key ~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
    and closing_routine_key ~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
    and char_length(opening_routine_key) between 1 and 80
    and char_length(closing_routine_key) between 1 and 80
  ),
  constraint routine_bundles_cancellation_check check (
    (status = 'cancelled' and cancelled_at is not null and cancelled_by_auth_user_id is not null
      and nullif(trim(cancellation_reason), '') is not null)
    or (status <> 'cancelled' and cancelled_at is null and cancelled_by_auth_user_id is null
      and cancellation_reason is null)
  ),
  constraint routine_bundles_completion_check check (
    (status = 'completed' and completed_at is not null) or status <> 'completed'
  )
);

create unique index if not exists routine_bundles_active_identity_unique
  on public.routine_bundles(
    organization_id, operational_date, bundle_type, scope_key,
    opening_routine_key, closing_routine_key
  ) where status <> 'cancelled';

create table if not exists public.routine_bundle_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  bundle_id uuid not null,
  run_id uuid not null,
  phase text not null,
  run_snapshot_hash_snapshot text not null,
  timing_snapshot_hash_snapshot text not null,
  template_version_id_snapshot uuid not null,
  template_content_hash_snapshot text not null,
  created_at timestamptz not null default now(),
  constraint routine_bundle_runs_bundle_fkey foreign key (bundle_id, organization_id)
    references public.routine_bundles(id, organization_id),
  constraint routine_bundle_runs_run_fkey foreign key (run_id, organization_id)
    references public.routine_runs(id, organization_id),
  constraint routine_bundle_runs_id_org_unique unique (id, organization_id),
  constraint routine_bundle_runs_identity_unique unique (id, organization_id, bundle_id),
  constraint routine_bundle_runs_phase_unique unique (bundle_id, phase),
  constraint routine_bundle_runs_run_unique unique (bundle_id, run_id),
  constraint routine_bundle_runs_active_phase_unique unique (run_id, phase),
  constraint routine_bundle_runs_phase_check check (phase in ('opening','closing')),
  constraint routine_bundle_runs_hash_check check (
    run_snapshot_hash_snapshot ~ '^[0-9a-f]{64}$'
    and timing_snapshot_hash_snapshot ~ '^[0-9a-f]{64}$'
    and template_content_hash_snapshot ~ '^[0-9a-f]{64}$'
  )
);

create table if not exists public.routine_bundle_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  bundle_id uuid not null,
  user_profile_id uuid not null references public.user_profiles(id),
  opening_run_participant_id uuid,
  closing_run_participant_id uuid,
  display_name_snapshot text not null,
  role_snapshot text not null,
  status text not null default 'assigned',
  expected_return_at timestamptz,
  actual_return_at timestamptz,
  interim_owner_participant_id uuid,
  closing_reassigned_to_participant_id uuid,
  status_reason text,
  revision bigint not null default 1,
  creation_idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by_auth_user_id uuid not null references auth.users(id),
  constraint routine_bundle_participants_bundle_fkey foreign key (bundle_id, organization_id)
    references public.routine_bundles(id, organization_id),
  constraint routine_bundle_participants_id_org_unique unique (id, organization_id),
  constraint routine_bundle_participants_identity_unique unique (id, organization_id, bundle_id),
  constraint routine_bundle_participants_profile_unique unique (bundle_id, user_profile_id),
  constraint routine_bundle_participants_idempotency_unique unique (organization_id, creation_idempotency_key),
  constraint routine_bundle_participants_status_check check (status in (
    'assigned','working_opening','continuing_on_site','temporarily_away','expected_back',
    'returned','working_closing','closing_reassigned','unable_to_return','completed','removed'
  )),
  constraint routine_bundle_participants_role_check check (role_snapshot in ('manager','shift_lead','staff')),
  constraint routine_bundle_participants_revision_check check (revision > 0),
  constraint routine_bundle_participants_name_check check (
    display_name_snapshot = trim(display_name_snapshot)
    and char_length(display_name_snapshot) between 1 and 200
  ),
  constraint routine_bundle_participants_return_check check (
    actual_return_at is null or expected_return_at is not null or status in ('returned','working_closing','completed')
  ),
  constraint routine_bundle_participants_reason_check check (
    status_reason is null or char_length(trim(status_reason)) between 1 and 4000
  )
);

do $phase10h_participant_fkeys$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conname='routine_bundle_participants_interim_fkey') then
    alter table public.routine_bundle_participants add constraint routine_bundle_participants_interim_fkey
      foreign key (interim_owner_participant_id, organization_id, bundle_id)
      references public.routine_bundle_participants(id, organization_id, bundle_id);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname='routine_bundle_participants_reassigned_fkey') then
    alter table public.routine_bundle_participants add constraint routine_bundle_participants_reassigned_fkey
      foreign key (closing_reassigned_to_participant_id, organization_id, bundle_id)
      references public.routine_bundle_participants(id, organization_id, bundle_id);
  end if;
end;
$phase10h_participant_fkeys$;

create table if not exists public.routine_bundle_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  bundle_id uuid not null,
  bundle_participant_id uuid,
  step_key text not null,
  status text not null default 'not_started',
  revision bigint not null default 1,
  payload_snapshot jsonb not null default '{}'::jsonb,
  payload_hash text,
  completed_at timestamptz,
  completed_by_auth_user_id uuid references auth.users(id),
  completed_by_name_snapshot text,
  completed_by_actor_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint routine_bundle_steps_bundle_fkey foreign key (bundle_id, organization_id)
    references public.routine_bundles(id, organization_id),
  constraint routine_bundle_steps_participant_fkey
    foreign key (bundle_participant_id, organization_id, bundle_id)
    references public.routine_bundle_participants(id, organization_id, bundle_id),
  constraint routine_bundle_steps_id_org_unique unique (id, organization_id),
  constraint routine_bundle_steps_step_check check (step_key in (
    'ds01_confirm_plan','ds02_opening_transition','ds03_return_review','ds04_bundle_finalized'
  )),
  constraint routine_bundle_steps_status_check check (status in ('not_started','completed','cancelled')),
  constraint routine_bundle_steps_revision_check check (revision > 0),
  constraint routine_bundle_steps_payload_check check (jsonb_typeof(payload_snapshot)='object'),
  constraint routine_bundle_steps_hash_check check (payload_hash is null or payload_hash ~ '^[0-9a-f]{64}$'),
  constraint routine_bundle_steps_scope_check check (
    (step_key in ('ds01_confirm_plan','ds02_opening_transition','ds03_return_review') and bundle_participant_id is not null)
    or (step_key='ds04_bundle_finalized' and bundle_participant_id is null)
  ),
  constraint routine_bundle_steps_completion_check check (
    (status='not_started' and payload_hash is null and completed_at is null
      and completed_by_auth_user_id is null and completed_by_name_snapshot is null
      and completed_by_actor_type is null)
    or (status='completed' and payload_hash is not null and completed_at is not null
      and completed_by_name_snapshot is not null and completed_by_actor_type in ('user','system')
      and ((completed_by_actor_type='user' and completed_by_auth_user_id is not null)
        or (completed_by_actor_type='system' and completed_by_auth_user_id is null)))
    or (status='cancelled')
  )
);

create unique index if not exists routine_bundle_steps_participant_step_unique
  on public.routine_bundle_steps(bundle_id,bundle_participant_id,step_key)
  where bundle_participant_id is not null;
create unique index if not exists routine_bundle_steps_global_step_unique
  on public.routine_bundle_steps(bundle_id,step_key)
  where bundle_participant_id is null;

create table if not exists public.routine_bundle_operations (
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
  constraint routine_bundle_operations_id_org_unique unique (id, organization_id),
  constraint routine_bundle_operations_idempotency_unique unique (
    organization_id,actor_auth_user_id,operation_type,idempotency_key
  ),
  constraint routine_bundle_operations_key_check check (
    operation_type ~ '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$'
    and resource_type ~ '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$'
  ),
  constraint routine_bundle_operations_hash_check check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint routine_bundle_operations_payload_check check (jsonb_typeof(response_payload)='object')
);

create table if not exists public.routine_bundle_reassignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  bundle_id uuid not null,
  from_bundle_participant_id uuid not null,
  to_bundle_participant_id uuid not null,
  closing_run_id uuid not null,
  reason text not null,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  created_by_name_snapshot text not null,
  operation_id uuid not null,
  constraint routine_bundle_reassignments_bundle_fkey foreign key (bundle_id,organization_id)
    references public.routine_bundles(id,organization_id),
  constraint routine_bundle_reassignments_from_fkey
    foreign key (from_bundle_participant_id,organization_id,bundle_id)
    references public.routine_bundle_participants(id,organization_id,bundle_id),
  constraint routine_bundle_reassignments_to_fkey
    foreign key (to_bundle_participant_id,organization_id,bundle_id)
    references public.routine_bundle_participants(id,organization_id,bundle_id),
  constraint routine_bundle_reassignments_run_fkey foreign key (closing_run_id,organization_id)
    references public.routine_runs(id,organization_id),
  constraint routine_bundle_reassignments_operation_fkey foreign key (operation_id,organization_id)
    references public.routine_bundle_operations(id,organization_id),
  constraint routine_bundle_reassignments_operation_unique unique (operation_id),
  constraint routine_bundle_reassignments_people_check check (from_bundle_participant_id<>to_bundle_participant_id),
  constraint routine_bundle_reassignments_reason_check check (
    char_length(trim(reason)) between 1 and 4000
    and char_length(trim(created_by_name_snapshot)) between 1 and 200
  )
);

create table if not exists public.routine_run_external_context_states (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  run_id uuid not null,
  snapshot_source_id uuid not null,
  current_resolution_id uuid,
  resolution_state text not null default 'pending_external',
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by_auth_user_id uuid references auth.users(id),
  constraint routine_external_states_source_fkey
    foreign key (snapshot_source_id,organization_id,run_id)
    references public.routine_run_snapshot_sources(id,organization_id,run_id),
  constraint routine_external_states_id_org_unique unique (id,organization_id),
  constraint routine_external_states_identity_unique unique (id,organization_id,run_id,snapshot_source_id),
  constraint routine_external_states_source_unique unique (snapshot_source_id),
  constraint routine_external_states_state_check check (resolution_state in ('pending_external','resolved','unavailable','error')),
  constraint routine_external_states_revision_check check (revision>0)
);

create table if not exists public.routine_run_external_context_resolutions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  run_id uuid not null,
  snapshot_source_id uuid not null,
  resolution_sequence bigint not null,
  resolution_state text not null,
  source_config_snapshot jsonb not null,
  source_payload_snapshot jsonb not null,
  source_hash text not null,
  source_system text not null,
  resolved_at timestamptz not null,
  resolved_by_actor_type text not null default 'system',
  warning_message text,
  error_message text,
  created_at timestamptz not null default now(),
  constraint routine_external_resolutions_source_fkey
    foreign key (snapshot_source_id,organization_id,run_id)
    references public.routine_run_snapshot_sources(id,organization_id,run_id),
  constraint routine_external_resolutions_id_org_unique unique (id,organization_id),
  constraint routine_external_resolutions_identity_unique unique (id,organization_id,run_id,snapshot_source_id),
  constraint routine_external_resolutions_sequence_unique unique (snapshot_source_id,resolution_sequence),
  constraint routine_external_resolutions_sequence_check check (resolution_sequence>0),
  constraint routine_external_resolutions_state_check check (resolution_state in ('resolved','unavailable','error')),
  constraint routine_external_resolutions_system_check check (source_system in ('event_operations','calendar_import','combined_event_context')),
  constraint routine_external_resolutions_actor_check check (resolved_by_actor_type in ('system','user')),
  constraint routine_external_resolutions_json_check check (
    jsonb_typeof(source_config_snapshot)='object' and jsonb_typeof(source_payload_snapshot)='object'
  ),
  constraint routine_external_resolutions_hash_check check (source_hash ~ '^[0-9a-f]{64}$')
);

do $phase10h_external_current_fkey$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conname='routine_external_states_current_fkey') then
    alter table public.routine_run_external_context_states add constraint routine_external_states_current_fkey
      foreign key (current_resolution_id,organization_id,run_id,snapshot_source_id)
      references public.routine_run_external_context_resolutions(id,organization_id,run_id,snapshot_source_id)
      deferrable initially deferred;
  end if;
end;
$phase10h_external_current_fkey$;

do $phase10h_transfer_identity$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conname='routine_run_transfers_id_org_unique') then
    alter table public.routine_run_transfers add constraint routine_run_transfers_id_org_unique unique(id,organization_id);
  end if;
end;
$phase10h_transfer_identity$;

create table if not exists public.routine_event_transfer_acceptances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  transfer_id uuid not null,
  event_operation_id text not null,
  external_context_resolution_id uuid not null,
  event_role_assignment_id text,
  event_role_key_snapshot text not null,
  event_scope_snapshot text not null,
  event_status_snapshot text not null,
  accepted_at timestamptz not null,
  accepted_by_auth_user_id uuid not null references auth.users(id),
  accepted_by_profile_id uuid not null references public.user_profiles(id),
  accepted_by_name_snapshot text not null,
  authorization_snapshot jsonb not null,
  acceptance_hash text not null,
  operation_id uuid not null,
  created_at timestamptz not null default now(),
  constraint routine_event_acceptances_transfer_fkey foreign key (transfer_id,organization_id)
    references public.routine_run_transfers(id,organization_id),
  constraint routine_event_acceptances_resolution_fkey foreign key (external_context_resolution_id,organization_id)
    references public.routine_run_external_context_resolutions(id,organization_id),
  constraint routine_event_acceptances_operation_fkey foreign key (operation_id,organization_id)
    references public.routine_bundle_operations(id,organization_id),
  constraint routine_event_acceptances_id_org_unique unique (id,organization_id),
  constraint routine_event_acceptances_identity_unique unique (id,organization_id,transfer_id),
  constraint routine_event_acceptances_transfer_unique unique (transfer_id),
  constraint routine_event_acceptances_operation_unique unique (operation_id),
  constraint routine_event_acceptances_event_check check (
    event_operation_id=trim(event_operation_id) and char_length(event_operation_id) between 1 and 200
  ),
  constraint routine_event_acceptances_actor_check check (
    char_length(trim(accepted_by_name_snapshot)) between 1 and 200
  ),
  constraint routine_event_acceptances_authorization_check check (jsonb_typeof(authorization_snapshot)='object'),
  constraint routine_event_acceptances_hash_check check (acceptance_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists public.routine_event_transfer_completions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  transfer_id uuid not null,
  acceptance_id uuid not null,
  event_operation_id text not null,
  result_code text not null,
  physical_check_confirmed boolean not null default false,
  critical_confirmation boolean not null default false,
  completion_note text,
  evidence_snapshot jsonb not null,
  manager_override_id uuid,
  completed_at timestamptz not null,
  completed_by_auth_user_id uuid not null references auth.users(id),
  completed_by_profile_id uuid not null references public.user_profiles(id),
  completed_by_name_snapshot text not null,
  event_role_key_snapshot text not null,
  completion_hash text not null,
  operation_id uuid not null,
  created_at timestamptz not null default now(),
  constraint routine_event_completions_acceptance_fkey
    foreign key (acceptance_id,organization_id,transfer_id)
    references public.routine_event_transfer_acceptances(id,organization_id,transfer_id),
  constraint routine_event_completions_transfer_fkey foreign key (transfer_id,organization_id)
    references public.routine_run_transfers(id,organization_id),
  constraint routine_event_completions_operation_fkey foreign key (operation_id,organization_id)
    references public.routine_bundle_operations(id,organization_id),
  constraint routine_event_completions_id_org_unique unique (id,organization_id),
  constraint routine_event_completions_transfer_unique unique (transfer_id),
  constraint routine_event_completions_operation_unique unique (operation_id),
  constraint routine_event_completions_result_check check (result_code in (
    'standard_met','completed_after_correction','control_completed_with_deviation','completed_with_manager_override'
  )),
  constraint routine_event_completions_physical_check check (physical_check_confirmed),
  constraint routine_event_completions_evidence_check check (jsonb_typeof(evidence_snapshot)='object'),
  constraint routine_event_completions_hash_check check (completion_hash ~ '^[0-9a-f]{64}$'),
  constraint routine_event_completions_note_check check (
    completion_note is null or char_length(trim(completion_note)) between 1 and 4000
  ),
  constraint routine_event_completions_actor_check check (
    char_length(trim(completed_by_name_snapshot)) between 1 and 200
  )
);

alter table public.routine_events add column if not exists bundle_id uuid;
alter table public.routine_delivery_records
  add column if not exists delivery_schema_version text not null default 'phase10g-v1';
alter table public.routine_delivery_items
  add column if not exists item_schema_version text not null default 'phase10g-v1',
  add column if not exists transfer_evidence_snapshot jsonb not null default '{}'::jsonb;

do $phase10h_additive_constraints$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conname='routine_events_bundle_fkey') then
    alter table public.routine_events add constraint routine_events_bundle_fkey
      foreign key (bundle_id,organization_id) references public.routine_bundles(id,organization_id);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname='routine_delivery_records_schema_check') then
    alter table public.routine_delivery_records add constraint routine_delivery_records_schema_check
      check (delivery_schema_version in ('phase10g-v1','phase10h-v2'));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname='routine_delivery_items_schema_check') then
    alter table public.routine_delivery_items add constraint routine_delivery_items_schema_check
      check (item_schema_version in ('phase10g-v1','phase10h-v2'));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname='routine_delivery_items_transfer_evidence_check') then
    alter table public.routine_delivery_items add constraint routine_delivery_items_transfer_evidence_check
      check (jsonb_typeof(transfer_evidence_snapshot)='object'
        and (item_schema_version='phase10h-v2' or transfer_evidence_snapshot='{}'::jsonb));
  end if;
end;
$phase10h_additive_constraints$;

alter table public.routine_events drop constraint if exists routine_events_event_type_check;
alter table public.routine_events add constraint routine_events_event_type_check check (event_type in (
  'run_created','participant_joined','role_assigned','role_replaced','run_started',
  'run_final_verification_requested','task_claimed','task_released','task_started','task_system_started','task_paused',
  'initial_assessment_recorded','task_item_updated','task_comment_added','task_blocked',
  'task_not_applicable','task_completed','task_system_completed','task_reopened','deviation_opened','deviation_assigned',
  'deviation_mitigated','deviation_resolved','deviation_cancelled','timing_deviation_opened','manager_override_created',
  'task_verification_completed','run_verification_completed','handover_created','handover_updated',
  'handover_submitted','handover_accepted','transfer_proposed','transfer_accepted','transfer_rejected',
  'transfer_completed','transfer_cancelled','run_waiting_for_transfers','run_finished','run_reopened',
  'run_cancelled','history_correction_recorded','operational_date_resolved','condition_evaluated','condition_matched',
  'condition_not_matched','condition_evaluation_error','task_became_visible','task_became_available',
  'task_became_due','task_became_overdue','task_hard_deadline_missed','timing_deviation_resolved',
  'run_operational_date_superseded','delivery_record_generated',
  'delivery_item_generated','delivery_record_superseded','delivery_comparison_recorded',
  'delivery_mismatch_detected','prior_delivery_deviation_confirmed','prior_delivery_resolved_after_close',
  'double_shift_bundle_created','double_shift_run_linked','double_shift_participant_joined',
  'double_shift_plan_confirmed','double_shift_opening_transition_completed','double_shift_departure_recorded',
  'double_shift_change_feed_reviewed','double_shift_returned','double_shift_closing_reassigned',
  'double_shift_status_changed','double_shift_finalized','external_context_refreshed',
  'external_event_change_detected','event_transfer_accepted','event_transfer_completed'
));

create index if not exists routine_bundle_runs_bundle_idx on public.routine_bundle_runs(bundle_id,phase);
create index if not exists routine_bundle_participants_bundle_idx on public.routine_bundle_participants(bundle_id,status);
create index if not exists routine_bundle_steps_bundle_idx on public.routine_bundle_steps(bundle_id,step_key,status);
create index if not exists routine_external_states_run_idx on public.routine_run_external_context_states(run_id);
create index if not exists routine_external_resolutions_run_idx on public.routine_run_external_context_resolutions(run_id,resolved_at);
create index if not exists routine_event_acceptances_event_idx on public.routine_event_transfer_acceptances(event_operation_id);
create index if not exists routine_events_bundle_idx on public.routine_events(bundle_id,server_created_at) where bundle_id is not null;

create or replace function public.routine_phase10h_immutable_guard()
returns trigger language plpgsql set search_path=pg_catalog
as $$ begin raise exception using errcode='P0001',message=tg_table_name||' rows are immutable.'; end $$;

create or replace function public.routine_bundle_guard()
returns trigger language plpgsql set search_path=pg_catalog
as $$
begin
  if tg_op='DELETE' then raise exception using errcode='P0001',message='Routine bundles cannot be deleted.'; end if;
  if row(new.organization_id,new.bundle_type,new.operational_date,new.timezone,new.scope_key,
      new.opening_routine_key,new.closing_routine_key,new.creation_idempotency_key,
      new.creation_request_hash,new.created_at,new.created_by_auth_user_id)
    is distinct from row(old.organization_id,old.bundle_type,old.operational_date,old.timezone,old.scope_key,
      old.opening_routine_key,old.closing_routine_key,old.creation_idempotency_key,
      old.creation_request_hash,old.created_at,old.created_by_auth_user_id) then
    raise exception using errcode='P0001',message='Routine bundle identity is immutable.';
  end if;
  if current_setting('mesh.routine_bundle_internal',true) is null then
    raise exception using errcode='P0001',message='Routine bundle projections require an authorized RPC.';
  end if;
  if new.revision<=old.revision then raise exception using errcode='P0001',message='Routine bundle revision must increase.'; end if;
  new.updated_at:=now();
  return new;
end;
$$;

create or replace function public.routine_bundle_participant_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare v_profile public.user_profiles%rowtype; v_opening uuid; v_closing uuid;
begin
  if tg_op='DELETE' then raise exception using errcode='P0001',message='Routine bundle participants cannot be deleted.'; end if;
  select profile.* into v_profile from public.user_profiles profile where profile.id=new.user_profile_id;
  if v_profile.id is null or not v_profile.active or v_profile.organization_id is distinct from new.organization_id
     or coalesce(v_profile.is_shared_device,false) or v_profile.role not in ('manager','shift_lead','staff') then
    raise exception using errcode='P0001',message='Bundle participant requires an active personal same-organization routine profile.';
  end if;
  select
    (select link.run_id from public.routine_bundle_runs link where link.bundle_id=new.bundle_id and link.phase='opening'),
    (select link.run_id from public.routine_bundle_runs link where link.bundle_id=new.bundle_id and link.phase='closing')
    into v_opening,v_closing;
  if new.opening_run_participant_id is not null and not exists(
    select 1 from public.routine_run_participants participant
    where participant.id=new.opening_run_participant_id and participant.organization_id=new.organization_id
      and participant.run_id=v_opening and participant.user_profile_id=new.user_profile_id
  ) then raise exception using errcode='P0001',message='Opening participant link is not valid for this bundle participant.'; end if;
  if new.closing_run_participant_id is not null and not exists(
    select 1 from public.routine_run_participants participant
    where participant.id=new.closing_run_participant_id and participant.organization_id=new.organization_id
      and participant.run_id=v_closing and participant.user_profile_id=new.user_profile_id
  ) then raise exception using errcode='P0001',message='Closing participant link is not valid for this bundle participant.'; end if;
  if tg_op='UPDATE' then
    if row(new.organization_id,new.bundle_id,new.user_profile_id,new.display_name_snapshot,new.role_snapshot,
        new.creation_idempotency_key,new.created_at,new.created_by_auth_user_id)
      is distinct from row(old.organization_id,old.bundle_id,old.user_profile_id,old.display_name_snapshot,old.role_snapshot,
        old.creation_idempotency_key,old.created_at,old.created_by_auth_user_id) then
      raise exception using errcode='P0001',message='Bundle participant identity and actor snapshots are immutable.';
    end if;
    if current_setting('mesh.routine_bundle_internal',true) is null then
      raise exception using errcode='P0001',message='Bundle participant projections require an authorized RPC.';
    end if;
    if new.revision<=old.revision then raise exception using errcode='P0001',message='Bundle participant revision must increase.'; end if;
    new.updated_at:=now();
  end if;
  return new;
end;
$$;

create or replace function public.routine_bundle_reassignment_validate()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if not exists(select 1 from public.routine_bundle_runs link
    where link.bundle_id=new.bundle_id and link.organization_id=new.organization_id
      and link.phase='closing' and link.run_id=new.closing_run_id) then
    raise exception using errcode='P0001',message='Reassignment must reference the bundle Closing run.';
  end if;
  return new;
end;
$$;

create or replace function public.routine_event_acceptance_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare v_transfer public.routine_run_transfers%rowtype; v_resolution public.routine_run_external_context_resolutions%rowtype;
  v_profile public.user_profiles%rowtype; v_expected text;
begin
  if tg_op<>'INSERT' then raise exception using errcode='P0001',message='Event-transfer acceptances are immutable.'; end if;
  select transfer.* into v_transfer from public.routine_run_transfers transfer where transfer.id=new.transfer_id;
  select resolution.* into v_resolution from public.routine_run_external_context_resolutions resolution
    where resolution.id=new.external_context_resolution_id;
  select profile.* into v_profile from public.user_profiles profile where profile.id=new.accepted_by_profile_id;
  if v_transfer.id is null or v_transfer.organization_id<>new.organization_id
     or v_transfer.target_type<>'event_operation' or v_transfer.target_event_id<>new.event_operation_id
     or v_transfer.status<>'proposed' or v_resolution.id is null
     or v_resolution.organization_id<>new.organization_id or v_resolution.run_id<>v_transfer.from_run_id
     or not exists(select 1 from public.routine_run_external_context_states state
       where state.run_id=v_transfer.from_run_id and state.current_resolution_id=v_resolution.id
         and state.resolution_state='resolved')
     or not exists(select 1 from jsonb_array_elements(coalesce(v_resolution.source_payload_snapshot->'events','[]'::jsonb)) event_value
       where event_value->>'eventOperationId'=new.event_operation_id)
     or v_profile.id is null or not v_profile.active or coalesce(v_profile.is_shared_device,false)
     or v_profile.organization_id<>new.organization_id or v_profile.id<>new.accepted_by_auth_user_id then
    raise exception using errcode='P0001',message='Event-transfer acceptance identity, context, actor, or tenant is invalid.';
  end if;
  v_expected:=public.routine_compute_event_transfer_acceptance_hash(jsonb_build_object(
    'transferId',new.transfer_id,'eventOperationId',new.event_operation_id,
    'externalContextResolutionId',new.external_context_resolution_id,
    'eventRoleAssignmentId',new.event_role_assignment_id,'eventRoleKey',new.event_role_key_snapshot,
    'eventScope',new.event_scope_snapshot,'eventStatus',new.event_status_snapshot,'acceptedAt',new.accepted_at,
    'acceptedByAuthUserId',new.accepted_by_auth_user_id,'acceptedByProfileId',new.accepted_by_profile_id,
    'authorization',new.authorization_snapshot));
  if new.acceptance_hash<>v_expected then
    raise exception using errcode='P0001',message='Event-transfer acceptance hash is invalid.';
  end if;
  return new;
end;
$$;

create or replace function public.routine_event_completion_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare v_transfer public.routine_run_transfers%rowtype; v_acceptance public.routine_event_transfer_acceptances%rowtype;
  v_profile public.user_profiles%rowtype; v_task public.routine_run_tasks%rowtype; v_validation jsonb;
  v_input jsonb; v_expected text;
begin
  if tg_op<>'INSERT' then raise exception using errcode='P0001',message='Event-transfer completions are immutable.'; end if;
  select transfer.* into v_transfer from public.routine_run_transfers transfer where transfer.id=new.transfer_id;
  select acceptance.* into v_acceptance from public.routine_event_transfer_acceptances acceptance where acceptance.id=new.acceptance_id;
  select profile.* into v_profile from public.user_profiles profile where profile.id=new.completed_by_profile_id;
  select task.* into v_task from public.routine_run_tasks task where task.id=v_transfer.from_task_id;
  if v_transfer.id is null or v_transfer.organization_id<>new.organization_id
     or v_transfer.target_type<>'event_operation' or v_transfer.target_event_id<>new.event_operation_id
     or v_transfer.status<>'accepted' or v_acceptance.id is null or v_acceptance.transfer_id<>v_transfer.id
     or v_acceptance.organization_id<>new.organization_id or v_acceptance.event_operation_id<>new.event_operation_id
     or v_profile.id is null or not v_profile.active or coalesce(v_profile.is_shared_device,false)
     or v_profile.organization_id<>new.organization_id or v_profile.id<>new.completed_by_auth_user_id
     or (v_task.criticality_snapshot='critical' and not new.critical_confirmation) then
    raise exception using errcode='P0001',message='Event-transfer completion identity, actor, confirmation, or tenant is invalid.';
  end if;
  select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object(
    'itemKey',value->'itemKey','status',value->'status','value',value->'value',
    'resultCode',value->'resultCode','note',value->'note')),'[]'::jsonb),
    'summary',new.evidence_snapshot->'summary') into v_input
  from jsonb_array_elements(coalesce(new.evidence_snapshot->'items','[]'::jsonb)) value;
  v_validation:=public.routine_validate_event_transfer_evidence(v_transfer.id,new.result_code,v_input,
    new.physical_check_confirmed,new.critical_confirmation,new.completion_note);
  if not coalesce((v_validation->>'valid')::boolean,false)
     or v_validation->'evidenceSnapshot'<>new.evidence_snapshot then
    raise exception using errcode='P0001',message='Event-transfer completion evidence is invalid.';
  end if;
  if new.result_code='completed_with_manager_override' and not exists(
    select 1 from public.routine_manager_overrides manager_override
    where manager_override.id=new.manager_override_id and manager_override.run_id=v_transfer.from_run_id
      and manager_override.task_id=v_transfer.from_task_id
      and (manager_override.expires_at is null or manager_override.expires_at>=new.completed_at)) then
    raise exception using errcode='P0001',message='Event-transfer completion manager override is invalid.';
  end if;
  v_expected:=public.routine_compute_event_transfer_completion_hash(jsonb_build_object(
    'transferId',new.transfer_id,'acceptanceId',new.acceptance_id,'acceptanceHash',v_acceptance.acceptance_hash,
    'eventOperationId',new.event_operation_id,'resultCode',new.result_code,
    'physicalCheckConfirmed',new.physical_check_confirmed,'criticalConfirmation',new.critical_confirmation,
    'completionNote',new.completion_note,'evidence',new.evidence_snapshot,'managerOverrideId',new.manager_override_id,
    'completedAt',new.completed_at,'completedByAuthUserId',new.completed_by_auth_user_id,
    'completedByProfileId',new.completed_by_profile_id,'eventRoleKey',new.event_role_key_snapshot));
  if new.completion_hash<>v_expected then
    raise exception using errcode='P0001',message='Event-transfer completion hash is invalid.';
  end if;
  return new;
end;
$$;

create or replace function public.routine_bundle_run_validate()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare v_bundle public.routine_bundles%rowtype; v_run public.routine_runs%rowtype;
begin
  select bundle.* into v_bundle from public.routine_bundles bundle where bundle.id=new.bundle_id;
  select run.* into v_run from public.routine_runs run where run.id=new.run_id;
  if v_bundle.id is null or v_run.id is null or v_bundle.organization_id is distinct from v_run.organization_id
     or new.organization_id is distinct from v_bundle.organization_id
     or v_bundle.operational_date is distinct from v_run.operational_date
     or v_bundle.scope_key is distinct from v_run.scope_key
     or (new.phase='opening' and v_run.routine_key<>v_bundle.opening_routine_key)
     or (new.phase='closing' and v_run.routine_key<>v_bundle.closing_routine_key)
     or new.run_snapshot_hash_snapshot is distinct from v_run.snapshot_hash
     or new.timing_snapshot_hash_snapshot is distinct from v_run.timing_snapshot_hash
     or new.template_version_id_snapshot is distinct from v_run.template_version_id
     or new.template_content_hash_snapshot is distinct from v_run.template_content_hash_snapshot then
    raise exception using errcode='P0001',message='Bundle run link must pin the matching authoritative same-organization run.';
  end if;
  return new;
end;
$$;

create or replace function public.routine_bundle_step_guard()
returns trigger language plpgsql set search_path=pg_catalog
as $$
begin
  if tg_op='DELETE' then raise exception using errcode='P0001',message='Routine bundle steps cannot be deleted.'; end if;
  if old.status in ('completed','cancelled') then
    raise exception using errcode='P0001',message='Completed or cancelled routine bundle steps are immutable.';
  end if;
  if current_setting('mesh.routine_bundle_internal',true) is null then
    raise exception using errcode='P0001',message='Routine bundle steps require an authorized RPC.';
  end if;
  if row(new.organization_id,new.bundle_id,new.bundle_participant_id,new.step_key,new.created_at)
     is distinct from row(old.organization_id,old.bundle_id,old.bundle_participant_id,old.step_key,old.created_at)
     or new.revision<=old.revision then
    raise exception using errcode='P0001',message='Bundle step identity is immutable and revision must increase.';
  end if;
  new.updated_at:=now(); return new;
end;
$$;

create or replace function public.routine_external_state_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if tg_op='DELETE' then raise exception using errcode='P0001',message='External context states cannot be deleted.'; end if;
  if not exists(select 1 from public.routine_run_snapshot_sources source
    where source.id=new.snapshot_source_id and source.organization_id=new.organization_id
      and source.run_id=new.run_id and source.source_kind='event_context') then
    raise exception using errcode='P0001',message='External context state requires an event_context snapshot source.';
  end if;
  if tg_op='UPDATE' then
    if row(new.organization_id,new.run_id,new.snapshot_source_id)
       is distinct from row(old.organization_id,old.run_id,old.snapshot_source_id)
       or current_setting('mesh.routine_external_context_internal',true) is null
       or new.revision<=old.revision then
      raise exception using errcode='P0001',message='External context state update requires the resolver and a higher revision.';
    end if;
    new.updated_at:=now();
  end if;
  return new;
end;
$$;

drop trigger if exists routine_bundles_guard on public.routine_bundles;
create trigger routine_bundles_guard before update or delete on public.routine_bundles
for each row execute function public.routine_bundle_guard();
drop trigger if exists routine_bundle_runs_validate on public.routine_bundle_runs;
create trigger routine_bundle_runs_validate before insert on public.routine_bundle_runs
for each row execute function public.routine_bundle_run_validate();
drop trigger if exists routine_bundle_runs_guard on public.routine_bundle_runs;
create trigger routine_bundle_runs_guard before update or delete on public.routine_bundle_runs
for each row execute function public.routine_phase10h_immutable_guard();
drop trigger if exists routine_bundle_participants_guard on public.routine_bundle_participants;
create trigger routine_bundle_participants_guard before insert or update or delete on public.routine_bundle_participants
for each row execute function public.routine_bundle_participant_guard();
drop trigger if exists routine_bundle_steps_guard on public.routine_bundle_steps;
create trigger routine_bundle_steps_guard before update or delete on public.routine_bundle_steps
for each row execute function public.routine_bundle_step_guard();
drop trigger if exists routine_bundle_reassignments_guard on public.routine_bundle_reassignments;
create trigger routine_bundle_reassignments_guard before update or delete on public.routine_bundle_reassignments
for each row execute function public.routine_phase10h_immutable_guard();
drop trigger if exists routine_bundle_reassignments_validate on public.routine_bundle_reassignments;
create trigger routine_bundle_reassignments_validate before insert on public.routine_bundle_reassignments
for each row execute function public.routine_bundle_reassignment_validate();
drop trigger if exists routine_bundle_operations_guard on public.routine_bundle_operations;
create trigger routine_bundle_operations_guard before update or delete on public.routine_bundle_operations
for each row execute function public.routine_phase10h_immutable_guard();
drop trigger if exists routine_external_states_guard on public.routine_run_external_context_states;
create trigger routine_external_states_guard before insert or update or delete on public.routine_run_external_context_states
for each row execute function public.routine_external_state_guard();
drop trigger if exists routine_external_resolutions_guard on public.routine_run_external_context_resolutions;
create trigger routine_external_resolutions_guard before update or delete on public.routine_run_external_context_resolutions
for each row execute function public.routine_phase10h_immutable_guard();
drop trigger if exists routine_event_acceptances_guard on public.routine_event_transfer_acceptances;
create trigger routine_event_acceptances_guard before insert or update or delete on public.routine_event_transfer_acceptances
for each row execute function public.routine_event_acceptance_guard();
drop trigger if exists routine_event_completions_guard on public.routine_event_transfer_completions;
create trigger routine_event_completions_guard before insert or update or delete on public.routine_event_transfer_completions
for each row execute function public.routine_event_completion_guard();

create or replace function public.routine_phase10h_uuid(input_value text)
returns uuid language sql immutable set search_path=pg_catalog
as $$ select (substr(md5(input_value),1,8)||'-'||substr(md5(input_value),9,4)||'-4'||substr(md5(input_value),14,3)
  ||'-8'||substr(md5(input_value),18,3)||'-'||substr(md5(input_value),21,12))::uuid $$;

create or replace function public.routine_bundle_operation_replay(
  input_organization_id uuid,input_actor_auth_user_id uuid,input_operation_type text,
  input_idempotency_key uuid,input_request_hash text
)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_operation public.routine_bundle_operations%rowtype;
begin
  if input_idempotency_key is null then raise exception using errcode='22023',message='An idempotency key is required.'; end if;
  select operation.* into v_operation from public.routine_bundle_operations operation
  where operation.organization_id=input_organization_id and operation.actor_auth_user_id=input_actor_auth_user_id
    and operation.operation_type=input_operation_type and operation.idempotency_key=input_idempotency_key;
  if v_operation.id is null then return null; end if;
  if v_operation.request_hash<>input_request_hash then
    raise exception using errcode='P0001',message='This idempotency key was already used with a different request.';
  end if;
  return jsonb_set(v_operation.response_payload,'{idempotentReplay}','true'::jsonb,true);
end;
$$;

create or replace function public.routine_record_bundle_operation(
  input_organization_id uuid,input_actor_auth_user_id uuid,input_operation_type text,
  input_idempotency_key uuid,input_request_hash text,input_resource_type text,
  input_resource_id uuid,input_response_payload jsonb
)
returns uuid language plpgsql security definer set search_path=pg_catalog
as $$
declare v_id uuid;
begin
  insert into public.routine_bundle_operations(
    organization_id,actor_auth_user_id,operation_type,idempotency_key,request_hash,
    resource_type,resource_id,response_payload
  ) values (
    input_organization_id,input_actor_auth_user_id,input_operation_type,input_idempotency_key,
    input_request_hash,input_resource_type,input_resource_id,input_response_payload
  ) on conflict(organization_id,actor_auth_user_id,operation_type,idempotency_key) do nothing
  returning id into v_id;
  if v_id is null then
    select operation.id into v_id from public.routine_bundle_operations operation
    where operation.organization_id=input_organization_id and operation.actor_auth_user_id=input_actor_auth_user_id
      and operation.operation_type=input_operation_type and operation.idempotency_key=input_idempotency_key
      and operation.request_hash=input_request_hash;
    if v_id is null then raise exception using errcode='P0001',message='Idempotency conflict.'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.routine_current_user_event_transfer_authority(input_event_operation_id text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_event_id uuid; v_profile public.user_profiles%rowtype; v_event public.event_operations%rowtype;
  v_assignment public.event_role_assignments%rowtype; v_handover public.event_responsibility_handovers%rowtype;
  v_role text; v_scope text; v_assignment_id text; v_source text;
begin
  begin v_event_id:=input_event_operation_id::uuid; exception when others then
    return jsonb_build_object('authorized',false,'reason','invalid_event_operation_id'); end;
  select profile.* into v_profile from public.user_profiles profile where profile.id=auth.uid()
    and profile.active and profile.organization_id is not null and not coalesce(profile.is_shared_device,false);
  if v_profile.id is null then return jsonb_build_object('authorized',false,'reason','active_personal_profile_required'); end if;
  select event_record.* into v_event from public.event_operations event_record
    where event_record.id=v_event_id and event_record.organization_id=v_profile.organization_id;
  if v_event.id is null then return jsonb_build_object('authorized',false,'reason','same_organization_event_not_found'); end if;
  select assignment.* into v_assignment from public.event_role_assignments assignment
    where assignment.event_id=v_event.id and assignment.organization_id=v_event.organization_id
      and assignment.active and assignment.assigned_auth_user_id=auth.uid()
    order by case when assignment.role_key in ('event_floor_manager','cornerbar_manager','atrium_manager','workbar_manager','headrunner') then 0 else 1 end,
      assignment.created_at desc,assignment.id desc limit 1;
  select handover.* into v_handover from public.event_responsibility_handovers handover
    where handover.event_id=v_event.id and handover.organization_id=v_event.organization_id
    order by handover.created_at desc,handover.id desc limit 1;
  if v_assignment.id is not null then
    v_role:=v_assignment.role_key; v_scope:=coalesce(nullif(v_assignment.zone,''),'all');
    v_assignment_id:=v_assignment.id::text; v_source:='active_role_assignment';
  elsif v_event.active_responsible_auth_user_id=auth.uid() then
    v_role:='active_responsible'; v_scope:='all'; v_source:='event_active_responsible';
  elsif v_handover.id is not null and v_handover.to_auth_user_id=auth.uid() then
    v_role:='responsibility_handover'; v_scope:=coalesce(nullif(v_handover.responsibility_scope,''),'all');
    v_source:='latest_responsibility_handover';
  elsif v_profile.role in ('manager','event_floor_manager') then
    v_role:='event_operations_manager'; v_scope:='all'; v_source:='event_operations_profile_role';
  else
    return jsonb_build_object('authorized',false,'reason','active_event_authority_required',
      'eventOperationId',v_event.id,'eventStatus',v_event.status,'organizationId',v_event.organization_id);
  end if;
  return jsonb_build_object('authorized',v_event.status in ('active','finished'),
    'reason',case when v_event.status in ('active','finished') then null else 'event_status_not_compatible' end,
    'organizationId',v_event.organization_id,'eventOperationId',v_event.id,'eventStatus',v_event.status,
    'eventRoleAssignmentId',v_assignment_id,'eventRoleKey',v_role,'eventScope',v_scope,
    'authoritySource',v_source,'profileId',v_profile.id,'authUserId',auth.uid());
end;
$$;

create or replace function public.routine_bundle_is_visible(input_bundle_id uuid,input_organization_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select public.routine_current_user_is_active()
    and not public.current_user_is_shared_device()
    and input_organization_id=public.routine_current_user_organization_id()
    and (
      public.routine_current_user_role() in ('manager','shift_lead')
      or exists(select 1 from public.routine_bundle_participants participant
        where participant.bundle_id=input_bundle_id and participant.organization_id=input_organization_id
          and participant.user_profile_id=auth.uid() and participant.status<>'removed')
      or exists(select 1 from public.routine_bundle_runs link
        join public.routine_run_participants participant on participant.run_id=link.run_id
          and participant.organization_id=link.organization_id
        where link.bundle_id=input_bundle_id and link.organization_id=input_organization_id
          and participant.user_profile_id=auth.uid() and participant.participation_status<>'removed')
    )
$$;

create or replace function public.routine_event_transfer_is_visible(input_transfer_id uuid,input_organization_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select public.routine_current_user_is_active()
    and not public.current_user_is_shared_device()
    and input_organization_id=public.routine_current_user_organization_id()
    and exists(select 1 from public.routine_run_transfers transfer where transfer.id=input_transfer_id
      and transfer.organization_id=input_organization_id and (
        public.routine_run_is_visible(transfer.from_run_id,transfer.organization_id)
        or (transfer.target_type='event_operation'
          and coalesce((public.routine_current_user_event_transfer_authority(transfer.target_event_id)->>'authorized')::boolean,false))
      ))
$$;

create or replace function public.routine_record_bundle_event(
  input_bundle_id uuid,input_run_id uuid,input_event_type text,input_actor_type text,
  input_actor_auth_user_id uuid,input_actor_profile_id uuid,input_actor_name text,input_actor_role text,
  input_payload jsonb,input_operation_id uuid,input_event_sequence integer
)
returns uuid language plpgsql security definer set search_path=pg_catalog
as $$
declare v_bundle public.routine_bundles%rowtype; v_event_id uuid;
begin
  select bundle.* into v_bundle from public.routine_bundles bundle where bundle.id=input_bundle_id;
  if v_bundle.id is null or not exists(select 1 from public.routine_bundle_runs link
      where link.bundle_id=v_bundle.id and link.run_id=input_run_id and link.organization_id=v_bundle.organization_id) then
    raise exception using errcode='P0001',message='Bundle event requires a linked bundle run.';
  end if;
  if jsonb_typeof(coalesce(input_payload,'{}'::jsonb))<>'object'
     or coalesce(input_payload,'{}'::jsonb)::text ~* '"(alarm(code)?|safe(code)?|payment|card|password|secret|token)"[[:space:]]*:' then
    raise exception using errcode='P0001',message='Bundle event payload is invalid or sensitive.';
  end if;
  v_event_id:=case when input_operation_id is null then gen_random_uuid()
    else public.routine_phase10h_uuid(input_bundle_id::text||'|'||input_operation_id::text||'|'||input_event_sequence::text) end;
  perform set_config('mesh.routine_run_internal','event',true);
  insert into public.routine_events(
    id,organization_id,operational_date,run_id,bundle_id,event_type,actor_type,
    actor_auth_user_id,actor_profile_id,actor_name_snapshot,actor_role_snapshot,
    payload,operation_id,event_sequence,server_created_at
  ) values (
    v_event_id,v_bundle.organization_id,v_bundle.operational_date,input_run_id,v_bundle.id,input_event_type,input_actor_type,
    input_actor_auth_user_id,input_actor_profile_id,input_actor_name,input_actor_role,
    coalesce(input_payload,'{}'::jsonb),null,input_event_sequence,clock_timestamp()
  ) on conflict(id) do nothing;
  return v_event_id;
end;
$$;

create or replace function public.routine_validate_event_context_source_config(input_config jsonb)
returns jsonb language plpgsql immutable set search_path=pg_catalog
as $$
declare v_errors jsonb:='[]'::jsonb; v_zones text[]; v_zone text;
  v_allowed text[]:=array['all','cornerbar','atrium','workbar','runners','bar','support','other','backstage','project_rooms'];
begin
  if jsonb_typeof(input_config)<>'object' then
    return jsonb_build_object('valid',false,'blockers',jsonb_build_array('event_context_config_object_required'));
  end if;
  if exists(select 1 from jsonb_object_keys(input_config) key
    where key not in ('mode','zones','includeBookings','includeResponsibilities')) then
    v_errors:=v_errors||jsonb_build_array('event_context_unknown_config_key');
  end if;
  if input_config->>'mode'<>'active_events' then v_errors:=v_errors||jsonb_build_array('event_context_mode_invalid'); end if;
  if not input_config ? 'includeBookings' or jsonb_typeof(input_config->'includeBookings')<>'boolean' then
    v_errors:=v_errors||jsonb_build_array('event_context_include_bookings_boolean_required');
  end if;
  if not input_config ? 'includeResponsibilities' or jsonb_typeof(input_config->'includeResponsibilities')<>'boolean' then
    v_errors:=v_errors||jsonb_build_array('event_context_include_responsibilities_boolean_required');
  end if;
  if input_config ? 'zones' then
    if jsonb_typeof(input_config->'zones')<>'array' then
      v_errors:=v_errors||jsonb_build_array('event_context_zones_array_required');
    else
      select array_agg(value order by value)
        into v_zones from jsonb_array_elements_text(input_config->'zones') value;
      if not coalesce((select count(distinct value)=count(*) from jsonb_array_elements_text(input_config->'zones') value),true) then
        v_errors:=v_errors||jsonb_build_array('event_context_zone_duplicate');
      end if;
      for v_zone in select value from jsonb_array_elements_text(input_config->'zones') loop
        if v_zone<>lower(trim(v_zone)) or not (v_zone=any(v_allowed)) then
          v_errors:=v_errors||jsonb_build_array('event_context_zone_unknown');
        end if;
      end loop;
    end if;
  end if;
  return jsonb_build_object('valid',jsonb_array_length(v_errors)=0,'blockers',v_errors,
    'config',jsonb_build_object('mode','active_events','zones',coalesce(to_jsonb(v_zones),'[]'::jsonb),
      'includeBookings',coalesce((input_config->>'includeBookings')::boolean,false),
      'includeResponsibilities',coalesce((input_config->>'includeResponsibilities')::boolean,false)));
exception when others then
  return jsonb_build_object('valid',false,'blockers',jsonb_build_array('event_context_config_type_invalid'));
end;
$$;

do $phase10h_template_validator_rename$
begin
  if to_regprocedure('public.validate_routine_template_version_phase10g(uuid,uuid[])') is null then
    alter function public.validate_routine_template_version(uuid,uuid[])
      rename to validate_routine_template_version_phase10g;
  end if;
end;
$phase10h_template_validator_rename$;

create or replace function public.validate_routine_template_version(
  input_version_id uuid,input_publication_version_ids uuid[] default null
)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_result jsonb; v_blockers jsonb; v_validation jsonb;
begin
  v_result:=public.validate_routine_template_version_phase10g(input_version_id,input_publication_version_ids);
  v_blockers:=coalesce(v_result->'blockers','[]'::jsonb);
  for v_validation in
    select public.routine_validate_event_context_source_config(item.source_config)
    from public.routine_template_task_items item
    where item.version_id=input_version_id and item.source_kind='event_context' and item.active
  loop
    if not coalesce((v_validation->>'valid')::boolean,false) then
      v_blockers:=v_blockers||coalesce(v_validation->'blockers','[]'::jsonb);
    end if;
  end loop;
  return jsonb_set(jsonb_set(v_result,'{blockers}',v_blockers,true),'{valid}',to_jsonb(jsonb_array_length(v_blockers)=0),true);
end;
$$;

create or replace function public.routine_event_operation_summary(
  input_event_operation_id text,input_organization_id uuid
)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_id uuid; v_event public.event_operations%rowtype;
begin
  begin v_id:=input_event_operation_id::uuid; exception when others then return '{}'::jsonb; end;
  select event_record.* into v_event from public.event_operations event_record
    where event_record.id=v_id and event_record.organization_id=input_organization_id;
  if v_event.id is null then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'eventOperationId',v_event.id,'title',v_event.title,'status',v_event.status,
    'venue',v_event.venue,'startsAt',v_event.starts_at,'endsAt',v_event.ends_at,
    'expectedFinalServiceClose',v_event.ends_at,'active',v_event.status='active',
    'affectsNormalClosing',v_event.status='active',
    'sourceUpdatedAt',v_event.updated_at
  );
end;
$$;

create or replace function public.routine_build_event_context_payload(
  input_run_id uuid,input_snapshot_source_id uuid
)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_run public.routine_runs%rowtype; v_source public.routine_run_snapshot_sources%rowtype;
  v_config jsonb; v_events jsonb; v_bookings jsonb; v_zones text[];
begin
  select run.* into v_run from public.routine_runs run where run.id=input_run_id;
  select source.* into v_source from public.routine_run_snapshot_sources source
    where source.id=input_snapshot_source_id and source.run_id=input_run_id
      and source.organization_id=v_run.organization_id and source.source_kind='event_context';
  if v_source.id is null then raise exception using errcode='P0001',message='Event context snapshot source was not found.'; end if;
  v_config:=public.routine_validate_event_context_source_config(v_source.source_config_snapshot)->'config';
  if not coalesce((public.routine_validate_event_context_source_config(v_source.source_config_snapshot)->>'valid')::boolean,false) then
    raise exception using errcode='P0001',message='Event context source configuration is invalid.';
  end if;
  select coalesce(array_agg(value),'{}'::text[]) into v_zones from jsonb_array_elements_text(v_config->'zones') value;
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventOperationId',event_record.id,'title',event_record.title,'status',event_record.status,
    'venue',event_record.venue,'startsAt',event_record.starts_at,'endsAt',event_record.ends_at,
    'expectedFinalServiceClose',event_record.ends_at,'active',event_record.status='active',
    'affectsNormalClosing',event_record.status='active',
    'responsibilities',case when (v_config->>'includeResponsibilities')::boolean then coalesce((
      select jsonb_agg(jsonb_build_object('assignmentId',assignment.id,'roleKey',assignment.role_key,
        'zone',coalesce(nullif(assignment.zone,''),'all')) order by assignment.role_key,assignment.zone,assignment.id)
      from public.event_role_assignments assignment where assignment.event_id=event_record.id
        and assignment.organization_id=event_record.organization_id and assignment.active
    ),'[]'::jsonb) else '[]'::jsonb end,
    'activeResponsibilityPresent',case when (v_config->>'includeResponsibilities')::boolean
      then event_record.active_responsible_auth_user_id is not null else false end,
    'sourceUpdatedAt',event_record.updated_at
  ) order by event_record.starts_at nulls last,event_record.id),'[]'::jsonb)
  into v_events
  from public.event_operations event_record
  where event_record.organization_id=v_run.organization_id
    and event_record.event_date=v_run.operational_date
    and event_record.status='active'
    and (cardinality(v_zones)=0 or lower(coalesce(event_record.venue,''))=any(v_zones)
      or exists(select 1 from public.event_role_assignments assignment
        where assignment.event_id=event_record.id and assignment.organization_id=event_record.organization_id
          and assignment.active and lower(coalesce(nullif(assignment.zone,''),'all'))=any(v_zones)));
  if (v_config->>'includeBookings')::boolean then
    select coalesce(jsonb_agg(jsonb_build_object(
      'bookingId',calendar_event.id,'providerEventId',calendar_event.provider_event_id,
      'provider',calendar_event.provider,'status',calendar_event.status,
      'startsAt',calendar_event.starts_at,'endsAt',calendar_event.ends_at,
      'eventOperationId',link.event_operation_id,'sourceUpdatedAt',calendar_event.provider_updated_at
    ) order by calendar_event.starts_at nulls last,calendar_event.id),'[]'::jsonb)
    into v_bookings
    from public.event_operation_calendar_links link
    join public.external_calendar_events calendar_event on calendar_event.id=link.external_calendar_event_id
      and calendar_event.organization_id=link.organization_id
    where link.organization_id=v_run.organization_id
      and exists(select 1 from jsonb_array_elements(v_events) event_value
        where event_value->>'eventOperationId'=link.event_operation_id::text)
      and coalesce(lower(calendar_event.status),'confirmed') not in ('cancelled','canceled');
  else v_bookings:='[]'::jsonb; end if;
  return jsonb_build_object('events',v_events,'bookings',v_bookings,
    'assetUsageAuthoritative',false,'operationalDate',v_run.operational_date,
    'scopeKey',v_run.scope_key,'sourceConfig',v_config);
end;
$$;

create or replace function public.routine_compute_event_context_hash(
  input_source_config jsonb,input_source_payload jsonb
)
returns text language sql immutable set search_path=pg_catalog
as $$ select public.routine_run_sha256(jsonb_build_object(
  'schemaVersion','phase10h-event-context-v1','config',input_source_config,'payload',input_source_payload)) $$;

create or replace function public.routine_resolve_run_event_context(
  input_run_id uuid,input_resolved_by_actor_type text default 'system'
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_run public.routine_runs%rowtype; v_source record; v_state public.routine_run_external_context_states%rowtype;
  v_current public.routine_run_external_context_resolutions%rowtype; v_resolution public.routine_run_external_context_resolutions%rowtype;
  v_payload jsonb; v_config jsonb; v_hash text; v_sequence bigint; v_changes jsonb:='[]'::jsonb;
begin
  if input_resolved_by_actor_type not in ('system','user') then raise exception using errcode='P0001',message='Invalid external context actor type.'; end if;
  select run.* into v_run from public.routine_runs run where run.id=input_run_id;
  if v_run.id is null then raise exception using errcode='P0001',message='Routine run was not found.'; end if;
  for v_source in select source.* from public.routine_run_snapshot_sources source
    where source.run_id=v_run.id and source.organization_id=v_run.organization_id
      and source.source_kind='event_context' order by source.id
  loop
    insert into public.routine_run_external_context_states(
      organization_id,run_id,snapshot_source_id,resolution_state,updated_by_auth_user_id
    ) values(v_run.organization_id,v_run.id,v_source.id,'pending_external',auth.uid())
    on conflict(snapshot_source_id) do nothing;
    select state.* into v_state from public.routine_run_external_context_states state
      where state.snapshot_source_id=v_source.id for update;
    v_config:=public.routine_validate_event_context_source_config(v_source.source_config_snapshot)->'config';
    begin
      v_payload:=public.routine_build_event_context_payload(v_run.id,v_source.id);
      v_hash:=public.routine_compute_event_context_hash(v_config,v_payload);
      select resolution.* into v_current from public.routine_run_external_context_resolutions resolution
        where resolution.id=v_state.current_resolution_id;
      if v_current.id is not null and v_current.source_hash=v_hash then continue; end if;
      select coalesce(max(resolution.resolution_sequence),0)+1 into v_sequence
        from public.routine_run_external_context_resolutions resolution where resolution.snapshot_source_id=v_source.id;
      insert into public.routine_run_external_context_resolutions(
        organization_id,run_id,snapshot_source_id,resolution_sequence,resolution_state,
        source_config_snapshot,source_payload_snapshot,source_hash,source_system,resolved_at,
        resolved_by_actor_type
      ) values(
        v_run.organization_id,v_run.id,v_source.id,v_sequence,'resolved',v_config,v_payload,v_hash,
        case when (v_config->>'includeBookings')::boolean then 'combined_event_context' else 'event_operations' end,
        clock_timestamp(),input_resolved_by_actor_type
      ) returning * into v_resolution;
    exception when others then
      v_payload:=jsonb_build_object('events','[]'::jsonb,'bookings','[]'::jsonb,'assetUsageAuthoritative',false);
      v_hash:=public.routine_compute_event_context_hash(coalesce(v_config,'{}'::jsonb),v_payload||jsonb_build_object('error','event_context_resolution_failed'));
      select resolution.* into v_current from public.routine_run_external_context_resolutions resolution
        where resolution.id=v_state.current_resolution_id;
      if v_current.id is not null and v_current.source_hash=v_hash then continue; end if;
      select coalesce(max(resolution.resolution_sequence),0)+1 into v_sequence
        from public.routine_run_external_context_resolutions resolution where resolution.snapshot_source_id=v_source.id;
      insert into public.routine_run_external_context_resolutions(
        organization_id,run_id,snapshot_source_id,resolution_sequence,resolution_state,
        source_config_snapshot,source_payload_snapshot,source_hash,source_system,resolved_at,
        resolved_by_actor_type,error_message
      ) values(v_run.organization_id,v_run.id,v_source.id,v_sequence,'error',coalesce(v_config,'{}'::jsonb),v_payload,
        v_hash,'combined_event_context',clock_timestamp(),input_resolved_by_actor_type,'event_context_resolution_failed')
      returning * into v_resolution;
    end;
    perform set_config('mesh.routine_external_context_internal','resolve',true);
    update public.routine_run_external_context_states set current_resolution_id=v_resolution.id,
      resolution_state=v_resolution.resolution_state,revision=revision+1,updated_by_auth_user_id=auth.uid()
      where id=v_state.id;
    v_changes:=v_changes||jsonb_build_array(jsonb_build_object(
      'snapshotSourceId',v_source.id,'resolutionId',v_resolution.id,
      'sequence',v_resolution.resolution_sequence,'state',v_resolution.resolution_state,
      'sourceHash',v_resolution.source_hash,'eventCount',jsonb_array_length(coalesce(v_payload->'events','[]'::jsonb)),
      'bookingCount',jsonb_array_length(coalesce(v_payload->'bookings','[]'::jsonb))));
  end loop;
  return jsonb_build_object('runId',v_run.id,'resolutions',v_changes,'changed',jsonb_array_length(v_changes)>0);
end;
$$;

create or replace function public.refresh_routine_run_external_context(
  input_run_id uuid,input_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_context record; v_run public.routine_runs%rowtype; v_hash text; v_replay jsonb;
  v_resolution jsonb; v_conditions jsonb; v_timing jsonb; v_before text; v_after text;
  v_response jsonb; v_operation_id uuid; v_previous bigint;
begin
  select * into v_context from public.routine_lifecycle_context(input_run_id);
  v_hash:=public.routine_run_request_hash(jsonb_build_object('runId',input_run_id));
  v_replay:=public.routine_bundle_operation_replay(v_context.organization_id,v_context.actor_auth_user_id,
    'refresh_external_context',input_idempotency_key,v_hash);
  if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id=input_run_id for update;
  select md5(coalesce(jsonb_agg(jsonb_build_array(task.id,task.inclusion_state,task.status)
    order by task.id)::text,'[]')) into v_before from public.routine_run_tasks task where task.run_id=v_run.id;
  v_resolution:=public.routine_resolve_run_event_context(v_run.id,'user');
  v_conditions:=public.routine_evaluate_run_conditions(v_run.id,clock_timestamp());
  v_timing:=public.routine_refresh_run_timing_internal(v_run.id,clock_timestamp());
  select md5(coalesce(jsonb_agg(jsonb_build_array(task.id,task.inclusion_state,task.status)
    order by task.id)::text,'[]')) into v_after from public.routine_run_tasks task where task.run_id=v_run.id;
  v_previous:=v_run.revision;
  if v_before is distinct from v_after then
    perform set_config('mesh.routine_run_internal','external_context',true);
    update public.routine_runs set revision=revision+1,updated_by_auth_user_id=v_context.actor_auth_user_id
      where id=v_run.id returning * into v_run;
  end if;
  v_response:=jsonb_build_object('run',to_jsonb(v_run),'externalContext',v_resolution,
    'conditionChanges',coalesce(v_conditions->'changed','[]'::jsonb),'timing',v_timing,
    'materialRunChange',v_before is distinct from v_after,'idempotentReplay',false);
  v_operation_id:=public.routine_record_bundle_operation(v_context.organization_id,v_context.actor_auth_user_id,
    'refresh_external_context',input_idempotency_key,v_hash,'run',v_run.id,v_response);
  if coalesce((v_resolution->>'changed')::boolean,false) then
    perform public.routine_record_event(v_run.id,'external_context_refreshed','user',
      v_context.actor_auth_user_id,v_context.actor_profile_id,v_context.actor_display_name,v_context.actor_role,
      '{}'::jsonb,v_previous,v_run.revision,jsonb_build_object('resolutionCount',jsonb_array_length(v_resolution->'resolutions')),
      null,1);
  end if;
  return v_response;
end;
$$;

do $phase10h_condition_resolver_rename$
begin
  if to_regprocedure('public.routine_resolve_condition_fact_phase10f(uuid,jsonb,timestamp with time zone)') is null then
    alter function public.routine_resolve_condition_fact(uuid,jsonb,timestamptz)
      rename to routine_resolve_condition_fact_phase10f;
  end if;
end;
$phase10h_condition_resolver_rename$;

create or replace function public.routine_resolve_condition_fact(
  input_task_id uuid,input_node jsonb,input_effective_at timestamptz
)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_task public.routine_run_tasks%rowtype; v_fact text:=input_node->>'fact';
  v_key text:=input_node->>'key'; v_payload jsonb; v_actual jsonb;
begin
  if v_fact not in ('event_zone_active','booking_exists','asset_used_today') then
    return public.routine_resolve_condition_fact_phase10f(input_task_id,input_node,input_effective_at);
  end if;
  select task.* into v_task from public.routine_run_tasks task where task.id=input_task_id;
  select resolution.source_payload_snapshot into v_payload
  from public.routine_run_external_context_states state
  join public.routine_run_external_context_resolutions resolution on resolution.id=state.current_resolution_id
  where state.run_id=v_task.run_id and state.resolution_state='resolved'
  order by resolution.resolution_sequence desc,resolution.id desc limit 1;
  if v_fact='asset_used_today' and (v_payload is null
      or not coalesce((v_payload->>'assetUsageAuthoritative')::boolean,false)) then
    return public.routine_resolve_condition_fact_phase10f(input_task_id,input_node,input_effective_at);
  end if;
  if v_payload is null then return jsonb_build_object('state','pending_external','fact',v_fact); end if;
  if v_fact='event_zone_active' then
    v_actual:=to_jsonb(exists(select 1 from jsonb_array_elements(coalesce(v_payload->'events','[]'::jsonb)) event_value
      where coalesce((event_value->>'active')::boolean,false) and (
        v_key is null or lower(coalesce(event_value->>'venue',''))=lower(v_key)
        or exists(select 1 from jsonb_array_elements(coalesce(event_value->'responsibilities','[]'::jsonb)) role_value
          where role_value->>'zone'=lower(v_key))
      )));
  elsif v_fact='booking_exists' then
    v_actual:=to_jsonb(exists(select 1 from jsonb_array_elements(coalesce(v_payload->'bookings','[]'::jsonb)) booking
      where v_key is null or booking->>'bookingId'=v_key or booking->>'providerEventId'=v_key
        or booking->>'eventOperationId'=v_key));
  else
    v_actual:=coalesce(v_payload->'assetUsedToday','null'::jsonb);
  end if;
  return jsonb_build_object('state','resolved','fact',v_fact,'key',v_key,'value',v_actual);
exception when others then
  return jsonb_build_object('state','error','fact',v_fact,'error','condition_fact_resolution_failed');
end;
$$;

create or replace function public.routine_phase10h_actor()
returns table(actor_auth_user_id uuid,actor_profile_id uuid,organization_id uuid,actor_role text,actor_display_name text)
language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_profile public.user_profiles%rowtype;
begin
  select profile.* into v_profile from public.user_profiles profile where profile.id=auth.uid()
    and profile.active and profile.organization_id is not null and not coalesce(profile.is_shared_device,false)
    and profile.role in ('manager','shift_lead','staff','event_floor_manager');
  if v_profile.id is null then raise exception using errcode='P0001',message='An active personal same-organization actor is required.'; end if;
  return query select auth.uid(),v_profile.id,v_profile.organization_id,v_profile.role,v_profile.display_name;
end;
$$;

do $phase10h_transfer_proposal_rename$
begin
  if to_regprocedure('public.propose_routine_transfer_phase10e(uuid,text,text,uuid,uuid,text,text,timestamp with time zone,bigint,uuid)') is null then
    alter function public.propose_routine_transfer(uuid,text,text,uuid,uuid,text,text,timestamptz,bigint,uuid)
      rename to propose_routine_transfer_phase10e;
  end if;
end;
$phase10h_transfer_proposal_rename$;

create or replace function public.propose_routine_transfer(
  input_task_id uuid,input_scope_key text,input_target_type text,input_target_run_id uuid,
  input_target_participant_id uuid,input_target_event_id text,input_reason text,input_due_at timestamptz,
  input_expected_task_revision bigint,input_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_run_id uuid; v_context record; v_run public.routine_runs%rowtype; v_task public.routine_run_tasks%rowtype;
  v_transfer public.routine_run_transfers%rowtype; v_scope text:=lower(trim(coalesce(input_scope_key,'default')));
  v_event_id text:=nullif(trim(coalesce(input_target_event_id,'')),''); v_reason text:=nullif(trim(coalesce(input_reason,'')),'');
  v_hash text; v_replay jsonb; v_response jsonb; v_resolution jsonb;
begin
  if lower(trim(coalesce(input_target_type,'')))<>'event_operation' then
    return public.propose_routine_transfer_phase10e(input_task_id,input_scope_key,input_target_type,
      input_target_run_id,input_target_participant_id,input_target_event_id,input_reason,input_due_at,
      input_expected_task_revision,input_idempotency_key);
  end if;
  select task.run_id into v_run_id from public.routine_run_tasks task where task.id=input_task_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  if not v_context.is_coordinator then raise exception using errcode='P0001',message='Coordinator authority is required to propose an event transfer.'; end if;
  if input_target_run_id is not null or input_target_participant_id is not null or v_event_id is null
     or v_reason is null or input_expected_task_revision is null or input_idempotency_key is null
     or v_scope !~ '^[a-z][a-z0-9]*(?:[-_:][a-z0-9]+)*$' then
    raise exception using errcode='P0001',message='Valid event target, scope, reason, revision, and idempotency key are required.';
  end if;
  v_hash:=public.routine_run_request_hash(jsonb_build_object('taskId',input_task_id,'scopeKey',v_scope,
    'targetType','event_operation','targetEventId',v_event_id,'reason',v_reason,'dueAt',input_due_at,
    'expectedTaskRevision',input_expected_task_revision));
  v_replay:=public.routine_run_operation_replay(v_context.organization_id,v_context.actor_auth_user_id,
    'propose_transfer',input_idempotency_key,v_hash); if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id=v_run_id for update;
  select task.* into v_task from public.routine_run_tasks task where task.id=input_task_id for update;
  if v_task.revision<>input_expected_task_revision then raise exception using errcode='40001',message='Stale routine task revision.'; end if;
  if v_task.inclusion_state<>'included' or v_task.status not in ('not_started','in_progress','waiting','blocked') then
    raise exception using errcode='P0001',message='Only an active included task can be transferred.';
  end if;
  if not exists(select 1 from public.event_operations event_record
    where event_record.id::text=v_event_id and event_record.organization_id=v_context.organization_id
      and event_record.status='active') then
    raise exception using errcode='P0001',message='An active same-organization Event Operation is required.';
  end if;
  v_resolution:=public.routine_resolve_run_event_context(v_run.id,'system');
  if not exists(select 1 from public.routine_run_external_context_states state
    join public.routine_run_external_context_resolutions resolution on resolution.id=state.current_resolution_id
    cross join lateral jsonb_array_elements(coalesce(resolution.source_payload_snapshot->'events','[]'::jsonb)) event_value
    where state.run_id=v_run.id and state.resolution_state='resolved'
      and event_value->>'eventOperationId'=v_event_id) then
    raise exception using errcode='P0001',message='The event transfer target is not present in the latest authoritative event context.';
  end if;
  if exists(select 1 from public.routine_run_transfers transfer where transfer.from_task_id=v_task.id
    and transfer.scope_key=v_scope and transfer.status in ('proposed','accepted')) then
    raise exception using errcode='P0001',message='An active transfer already exists for this task scope.';
  end if;
  insert into public.routine_run_transfers(
    organization_id,from_run_id,from_task_id,scope_key,target_type,target_event_id,reason,due_at,
    source_task_status_before_transfer,proposed_by_auth_user_id
  ) values(v_context.organization_id,v_run.id,v_task.id,v_scope,'event_operation',v_event_id,v_reason,
    input_due_at,v_task.status,v_context.actor_auth_user_id) returning * into v_transfer;
  perform set_config('mesh.routine_run_internal','lifecycle',true);
  update public.routine_runs set revision=revision+1,updated_by_auth_user_id=v_context.actor_auth_user_id
    where id=v_run.id returning * into v_run;
  v_response:=jsonb_build_object('transfer',to_jsonb(v_transfer),'task',to_jsonb(v_task),'run',to_jsonb(v_run),'idempotentReplay',false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id,v_context.actor_auth_user_id,
    v_context.actor_profile_id,v_context.actor_display_name,v_context.actor_role,'propose_transfer',input_idempotency_key,
    v_hash,'transfer',v_transfer.id,v_response,v_run.id,'transfer_proposed',
    jsonb_build_object('taskId',v_task.id,'transferId',v_transfer.id),null,v_transfer.revision,
    jsonb_build_object('targetType','event_operation','scopeKey',v_scope));
  return v_response;
end;
$$;

create or replace function public.routine_compute_event_transfer_acceptance_hash(input_payload jsonb)
returns text language sql immutable set search_path=pg_catalog
as $$ select public.routine_run_sha256(jsonb_build_object('schemaVersion','phase10h-event-acceptance-v1','evidence',input_payload)) $$;

create or replace function public.routine_compute_event_transfer_completion_hash(input_payload jsonb)
returns text language sql immutable set search_path=pg_catalog
as $$ select public.routine_run_sha256(jsonb_build_object('schemaVersion','phase10h-event-completion-v1','evidence',input_payload)) $$;

create or replace function public.routine_get_current_event_transfer_authorization(input_transfer_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_transfer public.routine_run_transfers%rowtype; v_authority jsonb;
begin
  select transfer.* into v_transfer from public.routine_run_transfers transfer where transfer.id=input_transfer_id;
  if v_transfer.id is null or v_transfer.target_type<>'event_operation' then
    return jsonb_build_object('authorized',false,'reason','event_transfer_not_found');
  end if;
  v_authority:=public.routine_current_user_event_transfer_authority(v_transfer.target_event_id);
  return v_authority||jsonb_build_object('transferId',v_transfer.id,'sourceRunId',v_transfer.from_run_id,
    'sourceTaskId',v_transfer.from_task_id,'transferStatus',v_transfer.status);
end;
$$;

create or replace function public.routine_validate_event_transfer_evidence(
  input_transfer_id uuid,input_result_code text,input_evidence jsonb,
  input_physical_check_confirmed boolean,input_critical_confirmation boolean,input_completion_note text
)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_transfer public.routine_run_transfers%rowtype; v_task public.routine_run_tasks%rowtype;
  v_item record; v_input jsonb; v_items jsonb:='[]'::jsonb; v_errors jsonb:='[]'::jsonb;
  v_note text:=nullif(trim(coalesce(input_completion_note,'')),''); v_result text:=lower(trim(coalesce(input_result_code,'')));
  v_validation jsonb; v_item_note text;
begin
  select transfer.* into v_transfer from public.routine_run_transfers transfer where transfer.id=input_transfer_id;
  select task.* into v_task from public.routine_run_tasks task where task.id=v_transfer.from_task_id;
  if v_transfer.id is null or v_transfer.target_type<>'event_operation' then v_errors:=v_errors||jsonb_build_array('event_transfer_required'); end if;
  if v_result not in ('standard_met','completed_after_correction','control_completed_with_deviation','completed_with_manager_override') then
    v_errors:=v_errors||jsonb_build_array('event_transfer_result_invalid'); end if;
  if not coalesce(input_physical_check_confirmed,false) then v_errors:=v_errors||jsonb_build_array('physical_check_required'); end if;
  if v_task.criticality_snapshot='critical' and not coalesce(input_critical_confirmation,false) then
    v_errors:=v_errors||jsonb_build_array('critical_confirmation_required'); end if;
  if v_result in ('completed_after_correction','control_completed_with_deviation') and v_note is null then
    v_errors:=v_errors||jsonb_build_array('completion_note_required'); end if;
  if jsonb_typeof(input_evidence)<>'object' or exists(select 1 from jsonb_object_keys(coalesce(input_evidence,'{}'::jsonb)) key
    where key not in ('items','summary')) then v_errors:=v_errors||jsonb_build_array('event_transfer_evidence_shape_invalid'); end if;
  if jsonb_typeof(input_evidence->'items')<>'array' then v_errors:=v_errors||jsonb_build_array('event_transfer_items_array_required'); end if;
  if input_evidence::text ~* '"(alarm(code)?|safe(code)?|payment|card|password|secret|token)"[[:space:]]*:' then
    v_errors:=v_errors||jsonb_build_array('event_transfer_sensitive_evidence_forbidden'); end if;
  if char_length(coalesce(input_evidence->>'summary',''))>2000 then v_errors:=v_errors||jsonb_build_array('event_transfer_summary_too_long'); end if;
  if jsonb_typeof(input_evidence->'items')='array' and exists(
    select 1 from jsonb_array_elements(input_evidence->'items') item
    group by item->>'itemKey' having count(*)>1) then v_errors:=v_errors||jsonb_build_array('event_transfer_item_duplicate'); end if;
  for v_item in select item.* from public.routine_run_task_items item
    where item.run_task_id=v_task.id and item.active_snapshot order by item.sort_order_snapshot,item.item_key_snapshot
  loop
    select value into v_input from jsonb_array_elements(coalesce(input_evidence->'items','[]'::jsonb)) value
      where value->>'itemKey'=v_item.item_key_snapshot limit 1;
    if v_input is null and v_item.required_snapshot then
      v_errors:=v_errors||jsonb_build_array('event_transfer_required_item_missing'); continue;
    elsif v_input is null then continue; end if;
    if exists(select 1 from jsonb_object_keys(v_input) key where key not in ('itemKey','status','value','resultCode','note')) then
      v_errors:=v_errors||jsonb_build_array('event_transfer_item_unknown_key'); continue;
    end if;
    v_item_note:=nullif(trim(coalesce(v_input->>'note','')),'');
    v_validation:=public.routine_validate_task_item_value(v_item.item_type_snapshot,v_item.input_schema_snapshot,
      v_input->>'status',coalesce(v_input->'value','{}'::jsonb),v_input->>'resultCode',v_item_note);
    if not coalesce((v_validation->>'valid')::boolean,false) then
      v_errors:=v_errors||jsonb_build_array('event_transfer_item_value_invalid'); continue;
    end if;
    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'itemKey',v_item.item_key_snapshot,'sourceTaskItemId',v_item.id,'sourceItemHash',v_item.row_snapshot_hash,
      'itemType',v_item.item_type_snapshot,'required',v_item.required_snapshot,'status',v_input->>'status',
      'value',coalesce(v_input->'value','{}'::jsonb),'resultCode',v_input->'resultCode','note',v_input->'note'));
  end loop;
  if jsonb_typeof(input_evidence->'items')='array' and exists(select 1 from jsonb_array_elements(input_evidence->'items') value
    where not exists(select 1 from public.routine_run_task_items item where item.run_task_id=v_task.id
      and item.active_snapshot and item.item_key_snapshot=value->>'itemKey')) then
    v_errors:=v_errors||jsonb_build_array('event_transfer_item_unknown');
  end if;
  return jsonb_build_object('valid',jsonb_array_length(v_errors)=0,'blockers',v_errors,
    'evidenceSnapshot',jsonb_build_object('items',v_items,'summary',nullif(trim(coalesce(input_evidence->>'summary','')),''),
      'sourceRunId',v_transfer.from_run_id,'sourceTaskId',v_transfer.from_task_id,
      'sourceTaskSnapshotHash',v_task.row_snapshot_hash));
end;
$$;

create or replace function public.routine_event_transfer_reported_status(input_result_code text)
returns text language sql immutable set search_path=pg_catalog
as $$ select case input_result_code when 'standard_met' then 'delivered_to_standard'
  when 'completed_after_correction' then 'delivered_after_correction'
  when 'control_completed_with_deviation' then 'delivered_with_deviation'
  when 'completed_with_manager_override' then 'delivered_with_override' end $$;

create or replace function public.accept_routine_event_transfer(
  input_transfer_id uuid,input_expected_transfer_revision bigint,input_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record; v_transfer public.routine_run_transfers%rowtype; v_task public.routine_run_tasks%rowtype;
  v_run public.routine_runs%rowtype; v_authority jsonb; v_resolution public.routine_run_external_context_resolutions%rowtype;
  v_acceptance_id uuid:=gen_random_uuid(); v_operation_id uuid:=gen_random_uuid(); v_accepted_at timestamptz:=clock_timestamp();
  v_payload jsonb; v_hash text; v_request_hash text; v_replay jsonb; v_response jsonb; v_bundle_id uuid;
begin
  select * into v_actor from public.routine_phase10h_actor();
  v_request_hash:=public.routine_run_request_hash(jsonb_build_object('transferId',input_transfer_id,
    'expectedTransferRevision',input_expected_transfer_revision));
  v_replay:=public.routine_bundle_operation_replay(v_actor.organization_id,v_actor.actor_auth_user_id,
    'accept_event_transfer',input_idempotency_key,v_request_hash); if v_replay is not null then return v_replay; end if;
  select transfer.* into v_transfer from public.routine_run_transfers transfer where transfer.id=input_transfer_id for update;
  if v_transfer.id is null or v_transfer.organization_id<>v_actor.organization_id or v_transfer.target_type<>'event_operation' then
    raise exception using errcode='42501',message='A same-organization event transfer is required.';
  end if;
  if v_transfer.revision<>input_expected_transfer_revision then raise exception using errcode='40001',message='Stale routine transfer revision.'; end if;
  if v_transfer.status<>'proposed' then raise exception using errcode='P0001',message='Only a proposed event transfer can be accepted.'; end if;
  v_authority:=public.routine_get_current_event_transfer_authorization(v_transfer.id);
  if not coalesce((v_authority->>'authorized')::boolean,false) or v_authority->>'eventStatus'<>'active' then
    raise exception using errcode='42501',message='Active Event Operations authority is required to accept this transfer.';
  end if;
  perform public.routine_resolve_run_event_context(v_transfer.from_run_id,'system');
  select resolution.* into v_resolution
  from public.routine_run_external_context_states state
  join public.routine_run_external_context_resolutions resolution on resolution.id=state.current_resolution_id
  cross join lateral jsonb_array_elements(coalesce(resolution.source_payload_snapshot->'events','[]'::jsonb)) event_value
  where state.run_id=v_transfer.from_run_id and state.organization_id=v_transfer.organization_id
    and state.resolution_state='resolved' and event_value->>'eventOperationId'=v_transfer.target_event_id
  order by resolution.resolved_at desc,resolution.id desc limit 1;
  if v_resolution.id is null then raise exception using errcode='P0001',message='Latest external context does not contain the event transfer target.'; end if;
  select task.* into v_task from public.routine_run_tasks task where task.id=v_transfer.from_task_id for update;
  select run.* into v_run from public.routine_runs run where run.id=v_transfer.from_run_id for update;
  v_payload:=jsonb_build_object('transferId',v_transfer.id,'eventOperationId',v_transfer.target_event_id,
    'externalContextResolutionId',v_resolution.id,'eventRoleAssignmentId',v_authority->'eventRoleAssignmentId',
    'eventRoleKey',v_authority->>'eventRoleKey','eventScope',v_authority->>'eventScope',
    'eventStatus',v_authority->>'eventStatus','acceptedAt',v_accepted_at,
    'acceptedByAuthUserId',v_actor.actor_auth_user_id,'acceptedByProfileId',v_actor.actor_profile_id,
    'authorization',v_authority);
  v_hash:=public.routine_compute_event_transfer_acceptance_hash(v_payload);
  v_response:=jsonb_build_object('acceptanceId',v_acceptance_id,'acceptanceHash',v_hash,
    'transferId',v_transfer.id,'transferStatus','accepted','transferRevision',v_transfer.revision+1,
    'sourceTaskId',v_task.id,'sourceTaskStatus','transferred','runId',v_run.id,
    'eventOperationId',v_transfer.target_event_id,'idempotentReplay',false);
  insert into public.routine_bundle_operations(id,organization_id,actor_auth_user_id,operation_type,idempotency_key,
    request_hash,resource_type,resource_id,response_payload)
  values(v_operation_id,v_actor.organization_id,v_actor.actor_auth_user_id,'accept_event_transfer',input_idempotency_key,
    v_request_hash,'event_transfer_acceptance',v_acceptance_id,v_response);
  insert into public.routine_event_transfer_acceptances(
    id,organization_id,transfer_id,event_operation_id,external_context_resolution_id,
    event_role_assignment_id,event_role_key_snapshot,event_scope_snapshot,event_status_snapshot,
    accepted_at,accepted_by_auth_user_id,accepted_by_profile_id,accepted_by_name_snapshot,
    authorization_snapshot,acceptance_hash,operation_id
  ) values(v_acceptance_id,v_actor.organization_id,v_transfer.id,v_transfer.target_event_id,v_resolution.id,
    nullif(v_authority->>'eventRoleAssignmentId',''),v_authority->>'eventRoleKey',v_authority->>'eventScope',
    v_authority->>'eventStatus',v_accepted_at,v_actor.actor_auth_user_id,v_actor.actor_profile_id,
    v_actor.actor_display_name,v_authority,v_hash,v_operation_id);
  perform set_config('mesh.routine_run_internal','transfer',true);
  update public.routine_run_transfers set status='accepted',accepted_at=v_accepted_at,
    accepted_by_auth_user_id=v_actor.actor_auth_user_id,revision=revision+1 where id=v_transfer.id returning * into v_transfer;
  perform set_config('mesh.routine_run_internal','lifecycle',true);
  update public.routine_run_tasks set status='transferred',outcome=null,completed_at=null,
    completed_by_auth_user_id=null,revision=revision+1,last_status_changed_at=v_accepted_at,
    last_status_changed_by_auth_user_id=v_actor.actor_auth_user_id where id=v_task.id returning * into v_task;
  update public.routine_runs set revision=revision+1,updated_by_auth_user_id=v_actor.actor_auth_user_id
    where id=v_run.id returning * into v_run;
  select link.bundle_id into v_bundle_id from public.routine_bundle_runs link where link.run_id=v_run.id limit 1;
  if v_bundle_id is not null then
    perform public.routine_record_bundle_event(v_bundle_id,v_run.id,'event_transfer_accepted','user',
      v_actor.actor_auth_user_id,v_actor.actor_profile_id,v_actor.actor_display_name,v_actor.actor_role,
      jsonb_build_object('transferId',v_transfer.id,'acceptanceId',v_acceptance_id,'eventOperationId',v_transfer.target_event_id,
        'eventRoleKey',v_authority->>'eventRoleKey','acceptanceHash',v_hash),v_operation_id,1);
    perform public.routine_reconcile_double_shift_bundle(v_bundle_id);
  else
    perform public.routine_record_event(v_run.id,'event_transfer_accepted','user',v_actor.actor_auth_user_id,
      v_actor.actor_profile_id,v_actor.actor_display_name,v_actor.actor_role,
      jsonb_build_object('taskId',v_task.id,'transferId',v_transfer.id),input_expected_transfer_revision,v_transfer.revision,
      jsonb_build_object('acceptanceId',v_acceptance_id,'eventOperationId',v_transfer.target_event_id,'acceptanceHash',v_hash),
      null,1);
  end if;
  return v_response;
end;
$$;

create or replace function public.complete_routine_event_transfer(
  input_transfer_id uuid,input_result_code text,input_evidence jsonb,
  input_physical_check_confirmed boolean,input_critical_confirmation boolean,input_completion_note text,
  input_expected_transfer_revision bigint,input_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record; v_transfer public.routine_run_transfers%rowtype; v_acceptance public.routine_event_transfer_acceptances%rowtype;
  v_task public.routine_run_tasks%rowtype; v_run public.routine_runs%rowtype; v_authority jsonb; v_validation jsonb;
  v_override_id uuid; v_result text:=lower(trim(coalesce(input_result_code,'')));
  v_note text:=nullif(trim(coalesce(input_completion_note,'')),''); v_completed_at timestamptz:=clock_timestamp();
  v_completion_id uuid:=gen_random_uuid(); v_operation_id uuid:=gen_random_uuid(); v_payload jsonb;
  v_hash text; v_request_hash text; v_replay jsonb; v_response jsonb; v_bundle_id uuid;
begin
  select * into v_actor from public.routine_phase10h_actor();
  v_request_hash:=public.routine_run_request_hash(jsonb_build_object('transferId',input_transfer_id,
    'resultCode',v_result,'evidence',input_evidence,'physicalCheckConfirmed',input_physical_check_confirmed,
    'criticalConfirmation',input_critical_confirmation,'completionNote',v_note,
    'expectedTransferRevision',input_expected_transfer_revision));
  v_replay:=public.routine_bundle_operation_replay(v_actor.organization_id,v_actor.actor_auth_user_id,
    'complete_event_transfer',input_idempotency_key,v_request_hash); if v_replay is not null then return v_replay; end if;
  select transfer.* into v_transfer from public.routine_run_transfers transfer where transfer.id=input_transfer_id for update;
  if v_transfer.id is null or v_transfer.organization_id<>v_actor.organization_id or v_transfer.target_type<>'event_operation' then
    raise exception using errcode='42501',message='A same-organization event transfer is required.';
  end if;
  if v_transfer.revision<>input_expected_transfer_revision then raise exception using errcode='40001',message='Stale routine transfer revision.'; end if;
  if v_transfer.status<>'accepted' then raise exception using errcode='P0001',message='Only an accepted event transfer can be completed.'; end if;
  select acceptance.* into v_acceptance from public.routine_event_transfer_acceptances acceptance
    where acceptance.transfer_id=v_transfer.id;
  if v_acceptance.id is null or v_acceptance.event_operation_id<>v_transfer.target_event_id then
    raise exception using errcode='P0001',message='Valid immutable event-transfer acceptance evidence is required.';
  end if;
  v_authority:=public.routine_get_current_event_transfer_authorization(v_transfer.id);
  if not coalesce((v_authority->>'authorized')::boolean,false) then
    raise exception using errcode='42501',message='Current Event Operations authority or responsibility handover is required.';
  end if;
  select task.* into v_task from public.routine_run_tasks task where task.id=v_transfer.from_task_id for update;
  select run.* into v_run from public.routine_runs run where run.id=v_transfer.from_run_id for update;
  if v_result='completed_with_manager_override' then
    select manager_override.id into v_override_id from public.routine_manager_overrides manager_override
    where manager_override.run_id=v_run.id and manager_override.task_id=v_task.id
      and (manager_override.expires_at is null or manager_override.expires_at>=v_completed_at)
    order by manager_override.created_at desc,manager_override.id desc limit 1;
    if v_override_id is null then raise exception using errcode='P0001',message='A current manager override is required for this completion result.'; end if;
  end if;
  v_validation:=public.routine_validate_event_transfer_evidence(v_transfer.id,v_result,input_evidence,
    input_physical_check_confirmed,input_critical_confirmation,v_note);
  if not coalesce((v_validation->>'valid')::boolean,false) then
    raise exception using errcode='P0001',message='Event-transfer evidence is invalid: '||(v_validation->'blockers')::text;
  end if;
  v_payload:=jsonb_build_object('transferId',v_transfer.id,'acceptanceId',v_acceptance.id,
    'acceptanceHash',v_acceptance.acceptance_hash,'eventOperationId',v_transfer.target_event_id,
    'resultCode',v_result,'physicalCheckConfirmed',true,'criticalConfirmation',coalesce(input_critical_confirmation,false),
    'completionNote',v_note,'evidence',v_validation->'evidenceSnapshot','managerOverrideId',v_override_id,
    'completedAt',v_completed_at,'completedByAuthUserId',v_actor.actor_auth_user_id,
    'completedByProfileId',v_actor.actor_profile_id,'eventRoleKey',v_authority->>'eventRoleKey');
  v_hash:=public.routine_compute_event_transfer_completion_hash(v_payload);
  v_response:=jsonb_build_object('completionId',v_completion_id,'completionHash',v_hash,
    'acceptanceId',v_acceptance.id,'transferId',v_transfer.id,'transferStatus','completed',
    'transferRevision',v_transfer.revision+1,'sourceTaskId',v_task.id,'sourceTaskStatus','transferred',
    'runId',v_run.id,'reportedStatus',public.routine_event_transfer_reported_status(v_result),
    'eventOperationId',v_transfer.target_event_id,'idempotentReplay',false);
  insert into public.routine_bundle_operations(id,organization_id,actor_auth_user_id,operation_type,idempotency_key,
    request_hash,resource_type,resource_id,response_payload)
  values(v_operation_id,v_actor.organization_id,v_actor.actor_auth_user_id,'complete_event_transfer',input_idempotency_key,
    v_request_hash,'event_transfer_completion',v_completion_id,v_response);
  insert into public.routine_event_transfer_completions(
    id,organization_id,transfer_id,acceptance_id,event_operation_id,result_code,
    physical_check_confirmed,critical_confirmation,completion_note,evidence_snapshot,manager_override_id,
    completed_at,completed_by_auth_user_id,completed_by_profile_id,completed_by_name_snapshot,
    event_role_key_snapshot,completion_hash,operation_id
  ) values(v_completion_id,v_actor.organization_id,v_transfer.id,v_acceptance.id,v_transfer.target_event_id,v_result,
    true,coalesce(input_critical_confirmation,false),v_note,v_validation->'evidenceSnapshot',v_override_id,
    v_completed_at,v_actor.actor_auth_user_id,v_actor.actor_profile_id,v_actor.actor_display_name,
    v_authority->>'eventRoleKey',v_hash,v_operation_id);
  perform set_config('mesh.routine_run_internal','transfer',true);
  update public.routine_run_transfers set status='completed',completed_at=v_completed_at,
    completed_by_auth_user_id=v_actor.actor_auth_user_id,completion_note=coalesce(v_note,'Event transfer completed.'),
    revision=revision+1 where id=v_transfer.id returning * into v_transfer;
  perform set_config('mesh.routine_run_internal','lifecycle',true);
  update public.routine_runs set status=case when status='waiting_for_transfers' then 'in_progress' else status end,
    revision=revision+1,updated_by_auth_user_id=v_actor.actor_auth_user_id where id=v_run.id returning * into v_run;
  select link.bundle_id into v_bundle_id from public.routine_bundle_runs link where link.run_id=v_run.id limit 1;
  if v_bundle_id is not null then
    perform public.routine_record_bundle_event(v_bundle_id,v_run.id,'event_transfer_completed','user',
      v_actor.actor_auth_user_id,v_actor.actor_profile_id,v_actor.actor_display_name,v_actor.actor_role,
      jsonb_build_object('transferId',v_transfer.id,'completionId',v_completion_id,'eventOperationId',v_transfer.target_event_id,
        'resultCode',v_result,'completionHash',v_hash),v_operation_id,1);
    perform public.routine_reconcile_double_shift_bundle(v_bundle_id);
  else
    perform public.routine_record_event(v_run.id,'event_transfer_completed','user',v_actor.actor_auth_user_id,
      v_actor.actor_profile_id,v_actor.actor_display_name,v_actor.actor_role,
      jsonb_build_object('taskId',v_task.id,'transferId',v_transfer.id),input_expected_transfer_revision,v_transfer.revision,
      jsonb_build_object('completionId',v_completion_id,'resultCode',v_result,'completionHash',v_hash),null,1);
  end if;
  return v_response;
end;
$$;

create or replace function public.reject_routine_event_transfer(
  input_transfer_id uuid,input_reason text,input_expected_transfer_revision bigint,input_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record; v_transfer public.routine_run_transfers%rowtype; v_task public.routine_run_tasks%rowtype;
  v_run public.routine_runs%rowtype; v_authority jsonb; v_reason text:=nullif(trim(coalesce(input_reason,'')),'');
  v_hash text; v_replay jsonb; v_response jsonb; v_operation_id uuid; v_bundle_id uuid;
begin
  select * into v_actor from public.routine_phase10h_actor();
  if v_reason is null then raise exception using errcode='P0001',message='A substantive event-transfer rejection reason is required.'; end if;
  v_hash:=public.routine_run_request_hash(jsonb_build_object('transferId',input_transfer_id,'reason',v_reason,
    'expectedTransferRevision',input_expected_transfer_revision));
  v_replay:=public.routine_bundle_operation_replay(v_actor.organization_id,v_actor.actor_auth_user_id,
    'reject_event_transfer',input_idempotency_key,v_hash); if v_replay is not null then return v_replay; end if;
  select transfer.* into v_transfer from public.routine_run_transfers transfer where transfer.id=input_transfer_id for update;
  if v_transfer.id is null or v_transfer.organization_id<>v_actor.organization_id or v_transfer.target_type<>'event_operation'
     or v_transfer.status<>'proposed' then raise exception using errcode='P0001',message='Only a proposed same-organization event transfer can be rejected.'; end if;
  if v_transfer.revision<>input_expected_transfer_revision then raise exception using errcode='40001',message='Stale routine transfer revision.'; end if;
  v_authority:=public.routine_get_current_event_transfer_authorization(v_transfer.id);
  if not coalesce((v_authority->>'authorized')::boolean,false) then raise exception using errcode='42501',message='Event Operations authority is required to reject this transfer.'; end if;
  select task.* into v_task from public.routine_run_tasks task where task.id=v_transfer.from_task_id for update;
  select run.* into v_run from public.routine_runs run where run.id=v_transfer.from_run_id for update;
  perform set_config('mesh.routine_run_internal','transfer',true);
  update public.routine_run_transfers set status='rejected',rejected_at=clock_timestamp(),
    rejected_by_auth_user_id=v_actor.actor_auth_user_id,rejection_reason=v_reason,revision=revision+1
    where id=v_transfer.id returning * into v_transfer;
  perform set_config('mesh.routine_run_internal','lifecycle',true);
  if v_task.status='transferred' then
    update public.routine_run_tasks set status=v_transfer.source_task_status_before_transfer,revision=revision+1,
      last_status_changed_at=clock_timestamp(),last_status_changed_by_auth_user_id=v_actor.actor_auth_user_id
      where id=v_task.id returning * into v_task;
  end if;
  update public.routine_runs set revision=revision+1,updated_by_auth_user_id=v_actor.actor_auth_user_id
    where id=v_run.id returning * into v_run;
  v_response:=jsonb_build_object('transfer',to_jsonb(v_transfer),'task',to_jsonb(v_task),'run',to_jsonb(v_run),'idempotentReplay',false);
  v_operation_id:=public.routine_record_bundle_operation(v_actor.organization_id,v_actor.actor_auth_user_id,
    'reject_event_transfer',input_idempotency_key,v_hash,'event_transfer',v_transfer.id,v_response);
  select link.bundle_id into v_bundle_id from public.routine_bundle_runs link where link.run_id=v_run.id limit 1;
  if v_bundle_id is not null then
    perform public.routine_record_bundle_event(v_bundle_id,v_run.id,'transfer_rejected','user',v_actor.actor_auth_user_id,
      v_actor.actor_profile_id,v_actor.actor_display_name,v_actor.actor_role,
      jsonb_build_object('taskId',v_task.id,'transferId',v_transfer.id,'reason',v_reason,
        'targetType','event_operation'),v_operation_id,1);
    perform public.routine_reconcile_double_shift_bundle(v_bundle_id);
  else
    perform public.routine_record_event(v_run.id,'transfer_rejected','user',v_actor.actor_auth_user_id,
      v_actor.actor_profile_id,v_actor.actor_display_name,v_actor.actor_role,
      jsonb_build_object('taskId',v_task.id,'transferId',v_transfer.id),input_expected_transfer_revision,v_transfer.revision,
      jsonb_build_object('reason',v_reason,'targetType','event_operation'),null,1);
  end if;
  return v_response;
end;
$$;

create or replace function public.accept_routine_transfer(
  input_transfer_id uuid,input_expected_revision bigint,input_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_type text;
begin
  select target_type into v_type from public.routine_run_transfers where id=input_transfer_id;
  if v_type='event_operation' then return public.accept_routine_event_transfer(input_transfer_id,input_expected_revision,input_idempotency_key); end if;
  return public.routine_change_transfer_status(input_transfer_id,'accept',null,input_expected_revision,input_idempotency_key);
end;
$$;

create or replace function public.reject_routine_transfer(
  input_transfer_id uuid,input_reason text,input_expected_revision bigint,input_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_type text;
begin
  select target_type into v_type from public.routine_run_transfers where id=input_transfer_id;
  if v_type='event_operation' then return public.reject_routine_event_transfer(input_transfer_id,input_reason,input_expected_revision,input_idempotency_key); end if;
  return public.routine_change_transfer_status(input_transfer_id,'reject',input_reason,input_expected_revision,input_idempotency_key);
end;
$$;

create or replace function public.routine_build_event_transfer_delivery_evidence(input_source_task_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_transfer public.routine_run_transfers%rowtype; v_acceptance public.routine_event_transfer_acceptances%rowtype;
  v_completion public.routine_event_transfer_completions%rowtype;
begin
  select transfer.* into v_transfer from public.routine_run_transfers transfer
    where transfer.from_task_id=input_source_task_id and transfer.target_type='event_operation'
    order by transfer.proposed_at desc,transfer.id desc limit 1;
  if v_transfer.id is null then return jsonb_build_object('valid',false,'state','missing','blocker','delivery_transferred_task_missing_event_transfer'); end if;
  select acceptance.* into v_acceptance from public.routine_event_transfer_acceptances acceptance where acceptance.transfer_id=v_transfer.id;
  if v_acceptance.id is null then return jsonb_build_object('valid',false,'state','proposed','blocker','delivery_event_transfer_not_accepted'); end if;
  select completion.* into v_completion from public.routine_event_transfer_completions completion where completion.transfer_id=v_transfer.id;
  if v_transfer.status<>'completed' or v_completion.id is null then
    return jsonb_build_object('valid',false,'state','accepted','blocker','delivery_event_transfer_not_completed');
  end if;
  if v_acceptance.acceptance_hash<>public.routine_compute_event_transfer_acceptance_hash(jsonb_build_object(
      'transferId',v_transfer.id,'eventOperationId',v_acceptance.event_operation_id,
      'externalContextResolutionId',v_acceptance.external_context_resolution_id,
      'eventRoleAssignmentId',v_acceptance.event_role_assignment_id,
      'eventRoleKey',v_acceptance.event_role_key_snapshot,'eventScope',v_acceptance.event_scope_snapshot,
      'eventStatus',v_acceptance.event_status_snapshot,'acceptedAt',v_acceptance.accepted_at,
      'acceptedByAuthUserId',v_acceptance.accepted_by_auth_user_id,'acceptedByProfileId',v_acceptance.accepted_by_profile_id,
      'authorization',v_acceptance.authorization_snapshot)) then
    return jsonb_build_object('valid',false,'state','invalid','blocker','delivery_event_transfer_acceptance_hash_invalid');
  end if;
  if v_completion.completion_hash<>public.routine_compute_event_transfer_completion_hash(jsonb_build_object(
      'transferId',v_transfer.id,'acceptanceId',v_acceptance.id,'acceptanceHash',v_acceptance.acceptance_hash,
      'eventOperationId',v_completion.event_operation_id,'resultCode',v_completion.result_code,
      'physicalCheckConfirmed',v_completion.physical_check_confirmed,'criticalConfirmation',v_completion.critical_confirmation,
      'completionNote',v_completion.completion_note,'evidence',v_completion.evidence_snapshot,
      'managerOverrideId',v_completion.manager_override_id,'completedAt',v_completion.completed_at,
      'completedByAuthUserId',v_completion.completed_by_auth_user_id,'completedByProfileId',v_completion.completed_by_profile_id,
      'eventRoleKey',v_completion.event_role_key_snapshot)) then
    return jsonb_build_object('valid',false,'state','invalid','blocker','delivery_event_transfer_completion_hash_invalid');
  end if;
  return jsonb_build_object('valid',true,'state','completed',
    'reportedStatus',public.routine_event_transfer_reported_status(v_completion.result_code),
    'taskItemEvidenceSnapshot',v_completion.evidence_snapshot,
    'transferEvidenceSnapshot',jsonb_build_object(
      'schemaVersion','phase10h-event-transfer-v1',
      'transfer',jsonb_build_object('id',v_transfer.id,'targetType',v_transfer.target_type,
        'eventOperationId',v_transfer.target_event_id,'scopeKey',v_transfer.scope_key,
        'status',v_transfer.status,'reason',v_transfer.reason,'dueAt',v_transfer.due_at),
      'acceptance',jsonb_build_object('id',v_acceptance.id,'acceptedAt',v_acceptance.accepted_at,
        'acceptedByAuthUserId',v_acceptance.accepted_by_auth_user_id,'acceptedByProfileId',v_acceptance.accepted_by_profile_id,
        'acceptedByName',v_acceptance.accepted_by_name_snapshot,'eventRoleAssignmentId',v_acceptance.event_role_assignment_id,
        'eventRoleKey',v_acceptance.event_role_key_snapshot,'eventScope',v_acceptance.event_scope_snapshot,
        'eventStatus',v_acceptance.event_status_snapshot,'externalContextResolutionId',v_acceptance.external_context_resolution_id,
        'authorization',v_acceptance.authorization_snapshot,'acceptanceHash',v_acceptance.acceptance_hash),
      'completion',jsonb_build_object('id',v_completion.id,'resultCode',v_completion.result_code,
        'physicalCheckConfirmed',v_completion.physical_check_confirmed,'criticalConfirmation',v_completion.critical_confirmation,
        'completionNote',v_completion.completion_note,'completedAt',v_completion.completed_at,
        'completedByAuthUserId',v_completion.completed_by_auth_user_id,'completedByProfileId',v_completion.completed_by_profile_id,
        'completedByName',v_completion.completed_by_name_snapshot,'eventRoleKey',v_completion.event_role_key_snapshot,
        'managerOverrideId',v_completion.manager_override_id,'completionHash',v_completion.completion_hash)
    ));
end;
$$;

do $phase10h_completion_core_rename$
begin
  if to_regprocedure('public.routine_validate_run_completion_core_phase10e(uuid)') is null then
    alter function public.routine_validate_run_completion_core(uuid)
      rename to routine_validate_run_completion_core_phase10e;
  end if;
end;
$phase10h_completion_core_rename$;

create or replace function public.routine_validate_run_completion_core(input_run_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_result jsonb; v_blockers jsonb;
begin
  v_result:=public.routine_validate_run_completion_core_phase10e(input_run_id);
  v_blockers:=coalesce(v_result->'blockers','[]'::jsonb);
  if v_blockers ? 'required_task_items_incomplete' and not exists(
    select 1 from public.routine_run_task_items item
    join public.routine_run_tasks task on task.id=item.run_task_id
    where item.run_id=input_run_id and task.inclusion_state='included'
      and item.active_snapshot and item.required_snapshot and item.status not in ('completed','not_applicable')
      and not (task.status='transferred' and coalesce(
        (public.routine_build_event_transfer_delivery_evidence(task.id)->>'valid')::boolean,false))
  ) then
    select coalesce(jsonb_agg(to_jsonb(blocker)),'[]'::jsonb) into v_blockers
    from jsonb_array_elements_text(v_blockers) blocker where blocker<>'required_task_items_incomplete';
  end if;
  return jsonb_set(jsonb_set(v_result,'{blockers}',v_blockers,true),'{valid}',
    to_jsonb(jsonb_array_length(v_blockers)=0),true);
end;
$$;

do $phase10h_delivery_hash_rename$
begin
  if to_regprocedure('public.routine_delivery_item_canonical_json_phase10g(uuid)') is null then
    alter function public.routine_delivery_item_canonical_json(uuid) rename to routine_delivery_item_canonical_json_phase10g;
  end if;
  if to_regprocedure('public.routine_delivery_record_canonical_json_phase10g(uuid)') is null then
    alter function public.routine_delivery_record_canonical_json(uuid) rename to routine_delivery_record_canonical_json_phase10g;
  end if;
  if to_regprocedure('public.routine_preview_run_delivery_phase10g(uuid)') is null then
    alter function public.routine_preview_run_delivery(uuid) rename to routine_preview_run_delivery_phase10g;
  end if;
  if to_regprocedure('public.routine_finalize_run_extension_phase10g(uuid)') is null then
    alter function public.routine_finalize_run_extension(uuid) rename to routine_finalize_run_extension_phase10g;
  end if;
end;
$phase10h_delivery_hash_rename$;

create or replace function public.routine_delivery_item_canonical_json(input_item_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_item public.routine_delivery_items%rowtype; v_base jsonb;
begin
  select item.* into v_item from public.routine_delivery_items item where item.id=input_item_id;
  v_base:=public.routine_delivery_item_canonical_json_phase10g(input_item_id);
  if v_item.item_schema_version='phase10g-v1' then return v_base; end if;
  return v_base||jsonb_build_object('schemaVersion',v_item.item_schema_version,
    'transferEvidence',v_item.transfer_evidence_snapshot);
end;
$$;

create or replace function public.routine_delivery_record_canonical_json(input_record_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_record public.routine_delivery_records%rowtype; v_base jsonb;
begin
  select record.* into v_record from public.routine_delivery_records record where record.id=input_record_id;
  v_base:=public.routine_delivery_record_canonical_json_phase10g(input_record_id);
  if v_record.delivery_schema_version='phase10g-v1' then return v_base; end if;
  return v_base||jsonb_build_object('schemaVersion',v_record.delivery_schema_version);
end;
$$;

create or replace function public.routine_preview_delivery_item_canonical(input_item jsonb)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
  select jsonb_build_object(
    'contract',jsonb_build_object('deliveryKey',input_item->>'deliveryKey','label',input_item->>'label',
      'category',input_item->>'category','targetRoutineKey',input_item->>'targetRoutineKey',
      'targetTaskKey',input_item->>'targetTaskKey','comparisonMode',input_item->>'comparisonMode',
      'required',(input_item->>'required')::boolean,'allowNotApplicable',(input_item->>'allowNotApplicable')::boolean,
      'scopePolicy',input_item->>'scopePolicy','evidenceItemKeys',input_item->'evidenceItemKeys',
      'requireValidTaskVerification',(input_item->>'requireValidTaskVerification')::boolean,
      'requireValidRunVerification',(input_item->>'requireValidRunVerification')::boolean,
      'sortOrder',(input_item->>'sortOrder')::integer),
    'source',jsonb_build_object('runId',input_item->'sourceRunId','taskId',input_item->'sourceTaskId',
      'relationId',input_item->'sourceRelationId','taskKey',task.task_key_snapshot,
      'status',input_item->>'sourceTaskStatus','outcome',input_item->'sourceTaskOutcome',
      'initialAssessment',input_item->'sourceTaskInitialAssessment','revision',(input_item->>'sourceTaskRevision')::bigint,
      'completedAt',input_item->'sourceTaskCompletedAt','completedByAuthUserId',input_item->'sourceTaskCompletedByAuthUserId',
      'completedByName',input_item->'sourceTaskCompletedByName','reportedStatus',input_item->>'reportedStatus'),
    'taskVerification',input_item->'taskVerificationSnapshot','taskItemEvidence',input_item->'taskItemEvidenceSnapshot',
    'deviations',input_item->'deviationSnapshot','overrides',input_item->'overrideSnapshot',
    'standards',input_item->'standardSnapshot','referenceImages',input_item->'referenceImageSnapshot',
    'schemaVersion',input_item->>'itemSchemaVersion','transferEvidence',input_item->'transferEvidenceSnapshot'
  ) from public.routine_run_tasks task where task.id=(input_item->>'sourceTaskId')::uuid
$$;

create or replace function public.routine_preview_run_delivery(input_run_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_base jsonb; v_run public.routine_runs%rowtype; v_item jsonb; v_new jsonb;
  v_transfer jsonb; v_items jsonb:='[]'::jsonb; v_blockers jsonb; v_warnings jsonb;
  v_has_transfer boolean:=false; v_all_valid boolean:=true; v_previous public.routine_delivery_records%rowtype;
  v_schema text:='phase10g-v1'; v_record_payload jsonb; v_record_hash text;
begin
  v_base:=public.routine_preview_run_delivery_phase10g(input_run_id);
  if not coalesce((v_base->>'hasDeliveryContract')::boolean,false) then
    return v_base||jsonb_build_object('deliverySchemaVersion','phase10g-v1');
  end if;
  select run.* into v_run from public.routine_runs run where run.id=input_run_id;
  v_blockers:=coalesce(v_base->'blockers','[]'::jsonb); v_warnings:=coalesce(v_base->'warnings','[]'::jsonb);
  for v_item in select value from jsonb_array_elements(coalesce(v_base->'proposedItems','[]'::jsonb)) value loop
    v_new:=v_item||jsonb_build_object('itemSchemaVersion','phase10g-v1','transferEvidenceSnapshot','{}'::jsonb);
    if v_item->>'sourceTaskStatus'='transferred' then
      v_has_transfer:=true; v_transfer:=public.routine_build_event_transfer_delivery_evidence((v_item->>'sourceTaskId')::uuid);
      if coalesce((v_transfer->>'valid')::boolean,false) then
        v_new:=v_new||jsonb_build_object('itemSchemaVersion','phase10h-v2',
          'reportedStatus',v_transfer->>'reportedStatus',
          'taskItemEvidenceSnapshot',v_transfer->'taskItemEvidenceSnapshot',
          'transferEvidenceSnapshot',v_transfer->'transferEvidenceSnapshot');
        v_new:=jsonb_set(v_new,'{itemHash}',to_jsonb(public.routine_compute_delivery_item_hash(
          public.routine_preview_delivery_item_canonical(v_new))),true);
      else
        v_all_valid:=false; v_blockers:=v_blockers||jsonb_build_array(v_transfer->>'blocker');
      end if;
    end if;
    v_items:=v_items||jsonb_build_array(v_new);
  end loop;
  if v_has_transfer and v_all_valid then
    select coalesce(jsonb_agg(value),'[]'::jsonb) into v_blockers
    from jsonb_array_elements(v_blockers) value
    where value#>>'{}' not in ('delivery_transfer_resolution_pending_phase10h','delivery_required_evidence_item_unhandled');
    v_schema:='phase10h-v2';
  end if;
  if v_schema='phase10h-v2' and jsonb_array_length(v_blockers)=0 then
    select record.* into v_previous from public.routine_delivery_records record
      where record.source_run_id=input_run_id and record.source_finish_sequence<(v_base->>'expectedFinishSequence')::integer
      order by record.source_finish_sequence desc,record.id desc limit 1;
    v_record_payload:=jsonb_build_object(
      'sourceRunId',v_run.id,'operationalDate',v_run.operational_date,'sourceRoutineKey',v_run.routine_key,
      'scopeKey',v_run.scope_key,'sourceTemplateId',v_run.template_id,'sourceTemplateVersionId',v_run.template_version_id,
      'sourceTemplateVersionNumber',v_run.template_version_number_snapshot,
      'sourceTemplateContentHash',v_run.template_content_hash_snapshot,'sourceRunSnapshotHash',v_run.snapshot_hash,
      'sourceRunTimingSnapshotHash',v_run.timing_snapshot_hash,
      'sourceRunRevision',case when v_run.status='finished' then v_run.revision else v_run.revision+1 end,
      'sourceFinishSequence',(v_base->>'expectedFinishSequence')::integer,'supersededRecordHash',v_previous.record_hash,
      'responsibilitySnapshot',v_base->'responsibilitySnapshot','runVerificationSnapshot',v_base->'runVerificationSnapshot',
      'items',coalesce((select jsonb_agg(jsonb_build_object('deliveryKey',item->>'deliveryKey',
        'sortOrder',(item->>'sortOrder')::integer,'itemHash',item->>'itemHash')
        order by (item->>'sortOrder')::integer,item->>'deliveryKey') from jsonb_array_elements(v_items) item),'[]'::jsonb),
      'schemaVersion','phase10h-v2');
    v_record_hash:=public.routine_compute_delivery_record_hash(v_record_payload);
  elsif v_schema='phase10g-v1' then v_record_hash:=v_base->>'proposedRecordHash'; end if;
  return v_base||jsonb_build_object(
    'valid',jsonb_array_length(v_blockers)=0,'blockers',v_blockers,'warnings',v_warnings,
    'proposedItems',v_items,'deliverySchemaVersion',v_schema,'proposedRecordHash',v_record_hash);
end;
$$;

create or replace function public.routine_finalize_run_extension(input_run_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_run public.routine_runs%rowtype; v_preview jsonb; v_item jsonb;
  v_record public.routine_delivery_records%rowtype; v_previous public.routine_delivery_records%rowtype;
  v_actor_name text; v_item_id uuid; v_verification jsonb;
begin
  v_preview:=public.routine_preview_run_delivery(input_run_id);
  if coalesce(v_preview->>'deliverySchemaVersion','phase10g-v1')='phase10g-v1' then
    return public.routine_finalize_run_extension_phase10g(input_run_id);
  end if;
  select run.* into v_run from public.routine_runs run where run.id=input_run_id for update;
  if v_run.id is null or v_run.status<>'finished' then return jsonb_build_object('applied',false,'reason','run_not_finished'); end if;
  select record.* into v_record from public.routine_delivery_records record where record.source_run_id=v_run.id
    and record.source_finish_sequence=v_run.current_finish_sequence;
  if v_record.id is not null then return jsonb_build_object('applied',true,'idempotentReplay',true,
    'deliveryRecordId',v_record.id,'recordHash',v_record.record_hash,'sourceFinishSequence',v_record.source_finish_sequence,
    'supersedesDeliveryRecordId',v_record.supersedes_delivery_record_id,
    'itemCount',(select count(*) from public.routine_delivery_items item where item.delivery_record_id=v_record.id)); end if;
  if not coalesce((v_preview->>'valid')::boolean,false)
     or (v_preview->>'expectedFinishSequence')::integer<>v_run.current_finish_sequence then
    raise exception using errcode='P0001',message='Routine delivery finalization failed validation: '||(v_preview->'blockers')::text;
  end if;
  select record.* into v_previous from public.routine_delivery_records record where record.source_run_id=v_run.id
    and record.source_finish_sequence<v_run.current_finish_sequence order by record.source_finish_sequence desc limit 1;
  select profile.display_name into v_actor_name from public.user_profiles profile where profile.id=v_run.finished_by_auth_user_id;
  v_verification:=coalesce(v_preview->'runVerificationSnapshot','{}'::jsonb);
  perform set_config('mesh.routine_delivery_internal','finalize',true);
  insert into public.routine_delivery_records(
    organization_id,source_run_id,operational_date,source_routine_key_snapshot,scope_key_snapshot,
    source_template_id_snapshot,source_template_version_id_snapshot,source_template_version_number_snapshot,
    source_template_content_hash_snapshot,source_run_snapshot_hash_snapshot,source_run_timing_snapshot_hash_snapshot,
    source_run_revision_snapshot,source_finish_sequence,supersedes_delivery_record_id,final_run_verification_id,
    responsibility_snapshot,run_verification_snapshot,generated_at,generated_by_auth_user_id,
    generated_by_name_snapshot,record_hash,delivery_schema_version
  ) values(v_run.organization_id,v_run.id,v_run.operational_date,v_run.routine_key,v_run.scope_key,
    v_run.template_id,v_run.template_version_id,v_run.template_version_number_snapshot,
    v_run.template_content_hash_snapshot,v_run.snapshot_hash,v_run.timing_snapshot_hash,v_run.revision,
    v_run.current_finish_sequence,v_previous.id,nullif(v_verification->>'id','')::uuid,
    v_preview->'responsibilitySnapshot',v_verification,v_run.finished_at,v_run.finished_by_auth_user_id,
    v_actor_name,v_preview->>'proposedRecordHash','phase10h-v2') returning * into v_record;
  for v_item in select value from jsonb_array_elements(v_preview->'proposedItems') value
    order by (value->>'sortOrder')::integer,value->>'deliveryKey'
  loop
    insert into public.routine_delivery_items(
      organization_id,delivery_record_id,source_run_id,source_run_task_id,source_run_relation_id,
      delivery_key,label,category,target_routine_key,target_task_key,comparison_mode,required_snapshot,
      allow_not_applicable_snapshot,scope_policy_snapshot,evidence_item_keys_snapshot,
      require_valid_task_verification_snapshot,require_valid_run_verification_snapshot,sort_order_snapshot,
      reported_status,source_task_status_snapshot,source_task_outcome_snapshot,source_task_initial_assessment_snapshot,
      source_task_revision_snapshot,source_task_completed_at_snapshot,source_task_completed_by_auth_user_id_snapshot,
      source_task_completed_by_name_snapshot,task_verification_snapshot,task_item_evidence_snapshot,deviation_snapshot,
      override_snapshot,standard_snapshot,reference_image_snapshot,item_hash,item_schema_version,transfer_evidence_snapshot
    ) values(v_run.organization_id,v_record.id,v_run.id,(v_item->>'sourceTaskId')::uuid,
      (v_item->>'sourceRelationId')::uuid,v_item->>'deliveryKey',v_item->>'label',v_item->>'category',
      v_item->>'targetRoutineKey',v_item->>'targetTaskKey',v_item->>'comparisonMode',(v_item->>'required')::boolean,
      (v_item->>'allowNotApplicable')::boolean,v_item->>'scopePolicy',array(select value from jsonb_array_elements_text(v_item->'evidenceItemKeys') value),
      (v_item->>'requireValidTaskVerification')::boolean,(v_item->>'requireValidRunVerification')::boolean,
      (v_item->>'sortOrder')::integer,v_item->>'reportedStatus',v_item->>'sourceTaskStatus',
      nullif(v_item->>'sourceTaskOutcome',''),nullif(v_item->>'sourceTaskInitialAssessment',''),
      (v_item->>'sourceTaskRevision')::bigint,nullif(v_item->>'sourceTaskCompletedAt','')::timestamptz,
      nullif(v_item->>'sourceTaskCompletedByAuthUserId','')::uuid,nullif(v_item->>'sourceTaskCompletedByName',''),
      v_item->'taskVerificationSnapshot',v_item->'taskItemEvidenceSnapshot',v_item->'deviationSnapshot',
      v_item->'overrideSnapshot',v_item->'standardSnapshot',v_item->'referenceImageSnapshot',v_item->>'itemHash',
      v_item->>'itemSchemaVersion',v_item->'transferEvidenceSnapshot') returning id into v_item_id;
    if not coalesce((public.routine_verify_delivery_item(v_item_id)->>'valid')::boolean,false) then
      raise exception using errcode='P0001',message='Generated Phase 10H delivery item failed hash verification.';
    end if;
  end loop;
  if not coalesce((public.routine_verify_delivery_record(v_record.id)->>'valid')::boolean,false) then
    raise exception using errcode='P0001',message='Generated Phase 10H delivery record failed hash verification.';
  end if;
  return jsonb_build_object('applied',true,'idempotentReplay',false,'deliveryRecordId',v_record.id,
    'recordHash',v_record.record_hash,'sourceFinishSequence',v_record.source_finish_sequence,
    'supersedesDeliveryRecordId',v_record.supersedes_delivery_record_id,
    'itemCount',(select count(*) from public.routine_delivery_items item where item.delivery_record_id=v_record.id));
end;
$$;

create or replace function public.routine_ensure_run_participant(
  input_run_id uuid,input_profile_id uuid,input_created_by uuid,input_key uuid
)
returns public.routine_run_participants language plpgsql security definer set search_path=pg_catalog
as $$
declare v_run public.routine_runs%rowtype; v_profile public.user_profiles%rowtype;
  v_participant public.routine_run_participants%rowtype;
begin
  select run.* into v_run from public.routine_runs run where run.id=input_run_id;
  select profile.* into v_profile from public.user_profiles profile where profile.id=input_profile_id;
  if v_run.id is null or v_profile.id is null or v_profile.organization_id is distinct from v_run.organization_id
     or not v_profile.active or coalesce(v_profile.is_shared_device,false)
     or v_profile.role not in ('manager','shift_lead','staff') then
    raise exception using errcode='P0001',message='An active personal same-organization routine participant is required.';
  end if;
  select participant.* into v_participant from public.routine_run_participants participant
    where participant.run_id=v_run.id and participant.user_profile_id=v_profile.id;
  if v_participant.id is not null then return v_participant; end if;
  insert into public.routine_run_participants(
    organization_id,run_id,user_profile_id,display_name_snapshot,role_snapshot,
    participation_status,joined_at,creation_idempotency_key,created_by_auth_user_id,updated_by_auth_user_id
  ) values(v_run.organization_id,v_run.id,v_profile.id,v_profile.display_name,v_profile.role,
    'assigned',clock_timestamp(),input_key,input_created_by,input_created_by)
  on conflict(run_id,user_profile_id) do nothing returning * into v_participant;
  if v_participant.id is null then select participant.* into v_participant from public.routine_run_participants participant
    where participant.run_id=v_run.id and participant.user_profile_id=v_profile.id; end if;
  return v_participant;
end;
$$;

create or replace function public.routine_ensure_bundle_participant(
  input_bundle_id uuid,input_profile_id uuid,input_created_by uuid,input_key uuid
)
returns public.routine_bundle_participants language plpgsql security definer set search_path=pg_catalog
as $$
declare v_bundle public.routine_bundles%rowtype; v_profile public.user_profiles%rowtype;
  v_opening_run uuid; v_closing_run uuid; v_opening_participant public.routine_run_participants%rowtype;
  v_closing_participant public.routine_run_participants%rowtype; v_participant public.routine_bundle_participants%rowtype;
  v_step_key text;
begin
  select bundle.* into v_bundle from public.routine_bundles bundle where bundle.id=input_bundle_id;
  select profile.* into v_profile from public.user_profiles profile where profile.id=input_profile_id;
  select
    (select link.run_id from public.routine_bundle_runs link where link.bundle_id=v_bundle.id and link.phase='opening'),
    (select link.run_id from public.routine_bundle_runs link where link.bundle_id=v_bundle.id and link.phase='closing')
    into v_opening_run,v_closing_run;
  if v_bundle.id is null or v_opening_run is null or v_closing_run is null or v_profile.id is null
     or v_profile.organization_id is distinct from v_bundle.organization_id or not v_profile.active
     or coalesce(v_profile.is_shared_device,false) or v_profile.role not in ('manager','shift_lead','staff') then
    raise exception using errcode='P0001',message='Bundle participant and both linked runs must be valid.';
  end if;
  v_opening_participant:=public.routine_ensure_run_participant(v_opening_run,v_profile.id,input_created_by,
    public.routine_phase10h_uuid(input_key::text||'|opening'));
  v_closing_participant:=public.routine_ensure_run_participant(v_closing_run,v_profile.id,input_created_by,
    public.routine_phase10h_uuid(input_key::text||'|closing'));
  select participant.* into v_participant from public.routine_bundle_participants participant
    where participant.bundle_id=v_bundle.id and participant.user_profile_id=v_profile.id;
  if v_participant.id is null then
    insert into public.routine_bundle_participants(
      organization_id,bundle_id,user_profile_id,opening_run_participant_id,closing_run_participant_id,
      display_name_snapshot,role_snapshot,creation_idempotency_key,created_by_auth_user_id,updated_by_auth_user_id
    ) values(v_bundle.organization_id,v_bundle.id,v_profile.id,v_opening_participant.id,v_closing_participant.id,
      v_profile.display_name,v_profile.role,input_key,input_created_by,input_created_by)
    on conflict(bundle_id,user_profile_id) do nothing returning * into v_participant;
    if v_participant.id is null then select participant.* into v_participant from public.routine_bundle_participants participant
      where participant.bundle_id=v_bundle.id and participant.user_profile_id=v_profile.id; end if;
  end if;
  foreach v_step_key in array array['ds01_confirm_plan','ds02_opening_transition','ds03_return_review'] loop
    insert into public.routine_bundle_steps(organization_id,bundle_id,bundle_participant_id,step_key)
    values(v_bundle.organization_id,v_bundle.id,v_participant.id,v_step_key)
    on conflict(bundle_id,bundle_participant_id,step_key) where bundle_participant_id is not null do nothing;
  end loop;
  insert into public.routine_bundle_steps(organization_id,bundle_id,bundle_participant_id,step_key)
    values(v_bundle.organization_id,v_bundle.id,null,'ds04_bundle_finalized')
    on conflict(bundle_id,step_key) where bundle_participant_id is null do nothing;
  return v_participant;
end;
$$;

create or replace function public.create_or_get_double_shift_bundle(
  input_opening_routine_key text,input_closing_routine_key text,input_scope_key text,
  input_operational_date date default null,input_idempotency_key uuid default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record; v_opening_key text:=lower(trim(coalesce(input_opening_routine_key,'')));
  v_closing_key text:=lower(trim(coalesce(input_closing_routine_key,'')));
  v_scope text:=lower(trim(coalesce(input_scope_key,'default'))); v_date date; v_derived record;
  v_request_hash text; v_replay jsonb; v_opening_response jsonb; v_closing_response jsonb;
  v_opening public.routine_runs%rowtype; v_closing public.routine_runs%rowtype; v_bundle public.routine_bundles%rowtype;
  v_participant public.routine_bundle_participants%rowtype; v_operation_id uuid; v_response jsonb;
  v_created boolean:=false; v_opening_child uuid; v_closing_child uuid;
begin
  select * into v_actor from public.routine_resolve_actor();
  if not public.routine_current_user_can_perform_tasks() or input_idempotency_key is null
     or v_opening_key=v_closing_key or v_opening_key !~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
     or v_closing_key !~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
     or v_scope !~ '^[a-z][a-z0-9]*(?:[-_:][a-z0-9]+)*$' then
    raise exception using errcode='P0001',message='Valid distinct routine keys, scope, personal actor, and idempotency key are required.';
  end if;
  v_request_hash:=public.routine_run_request_hash(jsonb_build_object('openingRoutineKey',v_opening_key,
    'closingRoutineKey',v_closing_key,'scopeKey',v_scope,'operationalDate',input_operational_date));
  v_replay:=public.routine_bundle_operation_replay(v_actor.organization_id,v_actor.actor_auth_user_id,
    'create_double_shift_bundle',input_idempotency_key,v_request_hash);
  if v_replay is not null then return v_replay; end if;
  if input_operational_date is null then
    select * into v_derived from public.routine_derive_operational_date(v_actor.organization_id,clock_timestamp());
    v_date:=v_derived.operational_date;
  else v_date:=input_operational_date; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor.organization_id::text||'|'||v_date::text||'|'||v_scope||'|'||v_opening_key||'|'||v_closing_key,31));
  v_opening_child:=public.routine_phase10h_uuid(v_actor.organization_id::text||'|'||v_date::text||'|'||v_scope||'|'||v_opening_key||'|double-shift-opening');
  v_closing_child:=public.routine_phase10h_uuid(v_actor.organization_id::text||'|'||v_date::text||'|'||v_scope||'|'||v_closing_key||'|double-shift-closing');
  v_opening_response:=public.create_or_get_routine_run(v_opening_key,v_scope,v_date,v_opening_child);
  v_closing_response:=public.create_or_get_routine_run(v_closing_key,v_scope,v_date,v_closing_child);
  select run.* into v_opening from public.routine_runs run where run.id=(v_opening_response->'run'->>'id')::uuid;
  select run.* into v_closing from public.routine_runs run where run.id=(v_closing_response->'run'->>'id')::uuid;
  if v_opening.snapshot_state<>'ready' or v_closing.snapshot_state<>'ready'
     or v_opening.status not in ('scheduled','in_progress','finished','reopened')
     or v_closing.status not in ('scheduled','in_progress','finished','reopened') then
    raise exception using errcode='P0001',message='Both authoritative Double Shift runs must be ready and compatible.';
  end if;
  select bundle.* into v_bundle from public.routine_bundles bundle where bundle.organization_id=v_actor.organization_id
    and bundle.operational_date=v_date and bundle.bundle_type='double_shift' and bundle.scope_key=v_scope
    and bundle.opening_routine_key=v_opening_key and bundle.closing_routine_key=v_closing_key and bundle.status<>'cancelled' for update;
  if v_bundle.id is null then
    insert into public.routine_bundles(organization_id,operational_date,timezone,scope_key,opening_routine_key,
      closing_routine_key,creation_idempotency_key,creation_request_hash,created_by_auth_user_id,updated_by_auth_user_id)
    values(v_actor.organization_id,v_date,'Europe/Oslo',v_scope,v_opening_key,v_closing_key,input_idempotency_key,
      v_request_hash,v_actor.actor_auth_user_id,v_actor.actor_auth_user_id) returning * into v_bundle;
    insert into public.routine_bundle_runs(organization_id,bundle_id,run_id,phase,run_snapshot_hash_snapshot,
      timing_snapshot_hash_snapshot,template_version_id_snapshot,template_content_hash_snapshot)
    values(v_actor.organization_id,v_bundle.id,v_opening.id,'opening',v_opening.snapshot_hash,v_opening.timing_snapshot_hash,
      v_opening.template_version_id,v_opening.template_content_hash_snapshot),
      (v_actor.organization_id,v_bundle.id,v_closing.id,'closing',v_closing.snapshot_hash,v_closing.timing_snapshot_hash,
      v_closing.template_version_id,v_closing.template_content_hash_snapshot);
    v_created:=true;
  end if;
  v_participant:=public.routine_ensure_bundle_participant(v_bundle.id,v_actor.actor_profile_id,v_actor.actor_auth_user_id,
    public.routine_phase10h_uuid(v_bundle.id::text||'|'||v_actor.actor_profile_id::text||'|bundle-participant'));
  v_response:=jsonb_build_object('bundle',to_jsonb(v_bundle),'openingRun',to_jsonb(v_opening),'closingRun',to_jsonb(v_closing),
    'participant',to_jsonb(v_participant),'steps',coalesce((select jsonb_agg(to_jsonb(step) order by step.step_key)
      from public.routine_bundle_steps step where step.bundle_id=v_bundle.id
        and (step.bundle_participant_id=v_participant.id or step.bundle_participant_id is null)),'[]'::jsonb),
    'roles',jsonb_build_object('opening',coalesce((select jsonb_agg(to_jsonb(role) order by role.role_key,role.scope_key)
      from public.routine_run_role_assignments role where role.run_id=v_opening.id and role.status='active'),'[]'::jsonb),
      'closing',coalesce((select jsonb_agg(to_jsonb(role) order by role.role_key,role.scope_key)
      from public.routine_run_role_assignments role where role.run_id=v_closing.id and role.status='active'),'[]'::jsonb)),
    'timingSummary',jsonb_build_object('operationalDate',v_date,'timezone','Europe/Oslo',
      'openingTimingHash',v_opening.timing_snapshot_hash,'closingTimingHash',v_closing.timing_snapshot_hash),
    'idempotentReplay',false);
  v_operation_id:=public.routine_record_bundle_operation(v_actor.organization_id,v_actor.actor_auth_user_id,
    'create_double_shift_bundle',input_idempotency_key,v_request_hash,'bundle',v_bundle.id,v_response);
  if v_created then
    perform public.routine_record_bundle_event(v_bundle.id,v_opening.id,'double_shift_bundle_created','user',
      v_actor.actor_auth_user_id,v_actor.actor_profile_id,v_actor.actor_display_name,v_actor.actor_role,
      jsonb_build_object('bundleId',v_bundle.id,'operationalDate',v_date,'scopeKey',v_scope),v_operation_id,1);
    perform public.routine_record_bundle_event(v_bundle.id,v_opening.id,'double_shift_run_linked','system',null,null,
      'Routine Double Shift engine',null,jsonb_build_object('phase','opening','runId',v_opening.id),v_operation_id,2);
    perform public.routine_record_bundle_event(v_bundle.id,v_closing.id,'double_shift_run_linked','system',null,null,
      'Routine Double Shift engine',null,jsonb_build_object('phase','closing','runId',v_closing.id),v_operation_id,3);
    perform public.routine_record_bundle_event(v_bundle.id,v_opening.id,'double_shift_participant_joined','user',
      v_actor.actor_auth_user_id,v_actor.actor_profile_id,v_actor.actor_display_name,v_actor.actor_role,
      jsonb_build_object('bundleParticipantId',v_participant.id),v_operation_id,4);
  end if;
  return v_response;
end;
$$;

create or replace function public.confirm_double_shift_plan(
  input_bundle_id uuid,input_bundle_participant_id uuid,input_expected_return_local_time time,
  input_expected_bundle_revision bigint,input_expected_participant_revision bigint,input_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record; v_bundle public.routine_bundles%rowtype; v_participant public.routine_bundle_participants%rowtype;
  v_step public.routine_bundle_steps%rowtype; v_opening public.routine_runs%rowtype; v_closing public.routine_runs%rowtype;
  v_expected timestamptz; v_resolution jsonb; v_payload jsonb; v_hash text; v_request_hash text;
  v_replay jsonb; v_response jsonb; v_operation_id uuid; v_previous bigint;
begin
  select * into v_actor from public.routine_resolve_actor();
  v_request_hash:=public.routine_run_request_hash(jsonb_build_object('bundleId',input_bundle_id,
    'bundleParticipantId',input_bundle_participant_id,'expectedReturnLocalTime',input_expected_return_local_time,
    'expectedBundleRevision',input_expected_bundle_revision,'expectedParticipantRevision',input_expected_participant_revision));
  v_replay:=public.routine_bundle_operation_replay(v_actor.organization_id,v_actor.actor_auth_user_id,
    'confirm_double_shift_plan',input_idempotency_key,v_request_hash); if v_replay is not null then return v_replay; end if;
  select bundle.* into v_bundle from public.routine_bundles bundle where bundle.id=input_bundle_id
    and bundle.organization_id=v_actor.organization_id for update;
  select participant.* into v_participant from public.routine_bundle_participants participant
    where participant.id=input_bundle_participant_id and participant.bundle_id=v_bundle.id for update;
  if v_bundle.id is null or v_participant.id is null
     or (v_participant.user_profile_id<>v_actor.actor_profile_id and v_actor.actor_role not in ('manager','shift_lead')) then
    raise exception using errcode='42501',message='The participant or a coordinator is required to confirm this Double Shift plan.';
  end if;
  if v_bundle.revision<>input_expected_bundle_revision or v_participant.revision<>input_expected_participant_revision then
    raise exception using errcode='40001',message='Stale Double Shift bundle or participant revision.';
  end if;
  select run.* into v_opening from public.routine_bundle_runs link join public.routine_runs run on run.id=link.run_id
    where link.bundle_id=v_bundle.id and link.phase='opening';
  select run.* into v_closing from public.routine_bundle_runs link join public.routine_runs run on run.id=link.run_id
    where link.bundle_id=v_bundle.id and link.phase='closing';
  if input_expected_return_local_time is not null then
    v_resolution:=public.routine_resolve_local_schedule_instant(v_bundle.operational_date,0,input_expected_return_local_time,
      v_bundle.timezone,'target'); v_expected:=nullif(v_resolution->>'instant','')::timestamptz;
    if v_expected is null then raise exception using errcode='P0001',message='Expected return time could not be resolved in Europe/Oslo.'; end if;
  end if;
  v_payload:=jsonb_build_object('schemaVersion','phase10h-ds01-v1','operationalDate',v_bundle.operational_date,
    'openingRun',jsonb_build_object('id',v_opening.id,'snapshotHash',v_opening.snapshot_hash,'timingHash',v_opening.timing_snapshot_hash),
    'closingRun',jsonb_build_object('id',v_closing.id,'snapshotHash',v_closing.snapshot_hash,'timingHash',v_closing.timing_snapshot_hash),
    'expectedClosingStart',(select min(timing.start_at) from public.routine_run_task_timings timing where timing.run_id=v_closing.id),
    'expectedReturnAt',v_expected,'expectedReturnMissing',v_expected is null,
    'activeRoles',coalesce((select jsonb_agg(jsonb_build_object('runId',role.run_id,'roleKey',role.role_key,
      'scopeKey',role.scope_key,'participantId',role.participant_id) order by role.run_id,role.role_key,role.scope_key)
      from public.routine_run_role_assignments role where role.run_id in (v_opening.id,v_closing.id) and role.status='active'),'[]'::jsonb),
    'missingCriticalRoles',to_jsonb(array(select required.role_key from unnest(array[
      'opening_responsible','closing_responsible','cash_register_responsible','locking_alarm_responsible']) as required(role_key)
      where not exists(select 1 from public.routine_run_role_assignments role where role.run_id in (v_opening.id,v_closing.id)
        and role.role_key=required.role_key and role.status='active') order by required.role_key)),
    'eventContext',coalesce((select resolution.source_payload_snapshot from public.routine_run_external_context_states state
      join public.routine_run_external_context_resolutions resolution on resolution.id=state.current_resolution_id
      where state.run_id in (v_opening.id,v_closing.id) order by resolution.resolved_at desc limit 1),'{}'::jsonb));
  v_hash:=public.routine_run_sha256(v_payload); v_previous:=v_bundle.revision;
  select step.* into v_step from public.routine_bundle_steps step where step.bundle_id=v_bundle.id
    and step.bundle_participant_id=v_participant.id and step.step_key='ds01_confirm_plan' for update;
  if v_step.status<>'not_started' then raise exception using errcode='P0001',message='DS01 is already completed.'; end if;
  perform set_config('mesh.routine_bundle_internal','ds01',true);
  update public.routine_bundle_steps set status='completed',payload_snapshot=v_payload,payload_hash=v_hash,
    completed_at=clock_timestamp(),completed_by_auth_user_id=v_actor.actor_auth_user_id,
    completed_by_name_snapshot=v_actor.actor_display_name,completed_by_actor_type='user',revision=revision+1
    where id=v_step.id returning * into v_step;
  update public.routine_bundle_participants set expected_return_at=v_expected,
    status=case when v_opening.status in ('in_progress','reopened') then 'working_opening' else status end,
    revision=revision+1,updated_by_auth_user_id=v_actor.actor_auth_user_id where id=v_participant.id returning * into v_participant;
  update public.routine_bundles set revision=revision+1,updated_by_auth_user_id=v_actor.actor_auth_user_id
    where id=v_bundle.id returning * into v_bundle;
  v_response:=jsonb_build_object('bundle',to_jsonb(v_bundle),'participant',to_jsonb(v_participant),'step',to_jsonb(v_step),
    'expectedReturnResolution',v_resolution,'idempotentReplay',false);
  v_operation_id:=public.routine_record_bundle_operation(v_actor.organization_id,v_actor.actor_auth_user_id,
    'confirm_double_shift_plan',input_idempotency_key,v_request_hash,'bundle_step',v_step.id,v_response);
  perform public.routine_record_bundle_event(v_bundle.id,v_opening.id,'double_shift_plan_confirmed','user',
    v_actor.actor_auth_user_id,v_actor.actor_profile_id,v_actor.actor_display_name,v_actor.actor_role,
    jsonb_build_object('bundleParticipantId',v_participant.id,'stepId',v_step.id,'payloadHash',v_hash,
      'expectedReturnAt',v_expected),v_operation_id,1);
  return v_response;
end;
$$;

create or replace function public.complete_double_shift_opening_transition(
  input_bundle_id uuid,input_bundle_participant_id uuid,input_transition_status text,
  input_expected_return_local_time time,input_interim_owner_profile_id uuid,input_note text,
  input_expected_bundle_revision bigint,input_expected_participant_revision bigint,input_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record; v_bundle public.routine_bundles%rowtype; v_participant public.routine_bundle_participants%rowtype;
  v_interim public.routine_bundle_participants%rowtype; v_step public.routine_bundle_steps%rowtype;
  v_ds01 public.routine_bundle_steps%rowtype; v_opening public.routine_runs%rowtype; v_closing public.routine_runs%rowtype;
  v_transition text:=lower(trim(coalesce(input_transition_status,''))); v_note text:=nullif(trim(coalesce(input_note,'')),'');
  v_expected timestamptz; v_resolution jsonb; v_payload jsonb; v_payload_hash text; v_request_hash text;
  v_replay jsonb; v_response jsonb; v_operation_id uuid; v_handover public.routine_handovers%rowtype;
  v_handover_count integer; v_participant_status text;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_transition not in ('continuing_on_site','temporarily_away','handing_operation_to_another','unable_to_complete_closing') then
    raise exception using errcode='P0001',message='Invalid Double Shift transition status.';
  end if;
  if v_transition='temporarily_away' and input_expected_return_local_time is null then
    raise exception using errcode='P0001',message='Expected return is required when temporarily away.';
  end if;
  if v_transition='handing_operation_to_another' and input_interim_owner_profile_id is null then
    raise exception using errcode='P0001',message='An interim owner is required for an operation handover.';
  end if;
  if v_transition='unable_to_complete_closing' and v_note is null then
    raise exception using errcode='P0001',message='A substantive reason is required when unable to complete Closing.';
  end if;
  v_request_hash:=public.routine_run_request_hash(jsonb_build_object('bundleId',input_bundle_id,
    'bundleParticipantId',input_bundle_participant_id,'transitionStatus',v_transition,
    'expectedReturnLocalTime',input_expected_return_local_time,'interimOwnerProfileId',input_interim_owner_profile_id,
    'note',v_note,'expectedBundleRevision',input_expected_bundle_revision,
    'expectedParticipantRevision',input_expected_participant_revision));
  v_replay:=public.routine_bundle_operation_replay(v_actor.organization_id,v_actor.actor_auth_user_id,
    'complete_double_shift_opening_transition',input_idempotency_key,v_request_hash);
  if v_replay is not null then return v_replay; end if;
  select bundle.* into v_bundle from public.routine_bundles bundle where bundle.id=input_bundle_id
    and bundle.organization_id=v_actor.organization_id for update;
  select participant.* into v_participant from public.routine_bundle_participants participant
    where participant.id=input_bundle_participant_id and participant.bundle_id=v_bundle.id for update;
  if v_bundle.id is null or v_participant.id is null
     or (v_participant.user_profile_id<>v_actor.actor_profile_id and v_actor.actor_role not in ('manager','shift_lead')) then
    raise exception using errcode='42501',message='The participant or a coordinator is required for DS02.';
  end if;
  if v_bundle.revision<>input_expected_bundle_revision or v_participant.revision<>input_expected_participant_revision then
    raise exception using errcode='40001',message='Stale Double Shift bundle or participant revision.';
  end if;
  select run.* into v_opening from public.routine_bundle_runs link join public.routine_runs run on run.id=link.run_id
    where link.bundle_id=v_bundle.id and link.phase='opening';
  select run.* into v_closing from public.routine_bundle_runs link join public.routine_runs run on run.id=link.run_id
    where link.bundle_id=v_bundle.id and link.phase='closing';
  if v_opening.status<>'finished' then raise exception using errcode='P0001',message='Opening run must be finished before DS02.'; end if;
  select step.* into v_ds01 from public.routine_bundle_steps step where step.bundle_id=v_bundle.id
    and step.bundle_participant_id=v_participant.id and step.step_key='ds01_confirm_plan';
  if v_ds01.status<>'completed' then raise exception using errcode='P0001',message='DS01 must be completed before DS02.'; end if;
  select step.* into v_step from public.routine_bundle_steps step where step.bundle_id=v_bundle.id
    and step.bundle_participant_id=v_participant.id and step.step_key='ds02_opening_transition' for update;
  if v_step.status<>'not_started' then raise exception using errcode='P0001',message='DS02 is already completed.'; end if;
  if input_expected_return_local_time is not null then
    v_resolution:=public.routine_resolve_local_schedule_instant(v_bundle.operational_date,0,
      input_expected_return_local_time,v_bundle.timezone,'target');
    v_expected:=nullif(v_resolution->>'instant','')::timestamptz;
  else v_expected:=v_participant.expected_return_at; end if;
  if input_interim_owner_profile_id is not null then
    if input_interim_owner_profile_id=v_participant.user_profile_id then
      raise exception using errcode='P0001',message='Interim owner must be a different person.';
    end if;
    v_interim:=public.routine_ensure_bundle_participant(v_bundle.id,input_interim_owner_profile_id,
      v_actor.actor_auth_user_id,public.routine_phase10h_uuid(v_bundle.id::text||'|'||input_interim_owner_profile_id::text||'|interim'));
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_opening.id::text||'|opening_transition|'||v_closing.id::text,37));
  select handover.* into v_handover from public.routine_handovers handover
    where handover.from_run_id=v_opening.id and handover.to_run_id=v_closing.id
      and handover.handover_type='opening_transition' and handover.status in ('draft','submitted','accepted')
    order by handover.created_at,handover.id limit 1 for update;
  perform set_config('mesh.routine_run_internal','handover',true);
  if v_handover.id is null then
    insert into public.routine_handovers(organization_id,handover_type,from_run_id,to_run_id,status,summary,
      created_by_auth_user_id,updated_by_auth_user_id)
    values(v_bundle.organization_id,'opening_transition',v_opening.id,v_closing.id,'draft',
      'Server-generated Double Shift Opening transition.',v_actor.actor_auth_user_id,v_actor.actor_auth_user_id)
    returning * into v_handover;
  end if;
  if v_handover.status='draft' then
    v_handover_count:=public.routine_refresh_handover_items_internal(v_handover.id);
    perform set_config('mesh.routine_run_internal','handover',true);
    update public.routine_handovers set status='submitted',submitted_at=clock_timestamp(),
      submitted_by_auth_user_id=v_actor.actor_auth_user_id,revision=revision+1,
      updated_by_auth_user_id=v_actor.actor_auth_user_id where id=v_handover.id returning * into v_handover;
  else select count(*) into v_handover_count from public.routine_handover_items item where item.handover_id=v_handover.id; end if;
  v_payload:=jsonb_build_object('schemaVersion','phase10h-ds02-v1','transitionStatus',v_transition,
    'openingRun',jsonb_build_object('id',v_opening.id,'status',v_opening.status,'snapshotHash',v_opening.snapshot_hash,
      'timingHash',v_opening.timing_snapshot_hash,'finishedAt',v_opening.finished_at),
    'closingRun',jsonb_build_object('id',v_closing.id,'status',v_closing.status,'snapshotHash',v_closing.snapshot_hash,
      'timingHash',v_closing.timing_snapshot_hash),
    'openingSummary',jsonb_build_object(
      'taskCounts',(select jsonb_object_agg(status,count) from (select status,count(*) count from public.routine_run_tasks
        where run_id=v_opening.id group by status order by status) counts),
      'openDeviations',(select count(*) from public.routine_deviations deviation where deviation.run_id=v_opening.id
        and deviation.status in ('open','mitigated','accepted_temporarily')),
      'overrides',(select count(*) from public.routine_manager_overrides manager_override where manager_override.run_id=v_opening.id),
      'corrections',(select count(*) from public.routine_corrections correction where correction.run_id=v_opening.id),
      'transfers',(select count(*) from public.routine_run_transfers transfer where transfer.from_run_id=v_opening.id)),
    'operationalSummary',jsonb_build_object('stockDeviations',(select count(*) from public.routine_deviations deviation
      where deviation.run_id=v_opening.id and deviation.source_type='stock_issue'),
      'servicewareDeviations',(select count(*) from public.routine_deviations deviation where deviation.run_id=v_opening.id
        and deviation.category in ('serviceware','service')),
      'eventContext',(select count(*) from public.routine_run_external_context_states state where state.run_id=v_opening.id),
      'technicalDeviations',(select count(*) from public.routine_deviations deviation where deviation.run_id=v_opening.id
        and deviation.category in ('technical','equipment'))),
    'expectedReturnAt',v_expected,'interimOwnerBundleParticipantId',v_interim.id,
    'note',v_note,'handoverId',v_handover.id,'handoverItemCount',v_handover_count);
  v_payload_hash:=public.routine_run_sha256(v_payload);
  v_participant_status:=case v_transition when 'continuing_on_site' then 'continuing_on_site'
    when 'temporarily_away' then 'expected_back' when 'handing_operation_to_another' then
      case when v_expected is null then 'temporarily_away' else 'expected_back' end
    else 'unable_to_return' end;
  perform set_config('mesh.routine_bundle_internal','ds02',true);
  update public.routine_bundle_steps set status='completed',payload_snapshot=v_payload,payload_hash=v_payload_hash,
    completed_at=clock_timestamp(),completed_by_auth_user_id=v_actor.actor_auth_user_id,
    completed_by_name_snapshot=v_actor.actor_display_name,completed_by_actor_type='user',revision=revision+1
    where id=v_step.id returning * into v_step;
  update public.routine_bundle_participants set status=v_participant_status,expected_return_at=v_expected,
    interim_owner_participant_id=v_interim.id,status_reason=v_note,revision=revision+1,
    updated_by_auth_user_id=v_actor.actor_auth_user_id where id=v_participant.id returning * into v_participant;
  update public.routine_bundles set status='between_shifts',revision=revision+1,
    updated_by_auth_user_id=v_actor.actor_auth_user_id where id=v_bundle.id returning * into v_bundle;
  v_response:=jsonb_build_object('bundle',to_jsonb(v_bundle),'participant',to_jsonb(v_participant),
    'step',to_jsonb(v_step),'handover',to_jsonb(v_handover),'transitionSummary',v_payload,'idempotentReplay',false);
  v_operation_id:=public.routine_record_bundle_operation(v_actor.organization_id,v_actor.actor_auth_user_id,
    'complete_double_shift_opening_transition',input_idempotency_key,v_request_hash,'bundle_step',v_step.id,v_response);
  perform public.routine_record_bundle_event(v_bundle.id,v_opening.id,'double_shift_opening_transition_completed','user',
    v_actor.actor_auth_user_id,v_actor.actor_profile_id,v_actor.actor_display_name,v_actor.actor_role,
    jsonb_build_object('bundleParticipantId',v_participant.id,'stepId',v_step.id,'transitionStatus',v_transition,
      'payloadHash',v_payload_hash,'handoverId',v_handover.id),v_operation_id,1);
  if v_transition<>'continuing_on_site' then
    perform public.routine_record_bundle_event(v_bundle.id,v_opening.id,'double_shift_departure_recorded','user',
      v_actor.actor_auth_user_id,v_actor.actor_profile_id,v_actor.actor_display_name,v_actor.actor_role,
      jsonb_build_object('bundleParticipantId',v_participant.id,'status',v_participant_status,
        'expectedReturnAt',v_expected,'interimOwnerBundleParticipantId',v_interim.id),v_operation_id,2);
  end if;
  return v_response;
end;
$$;

create or replace function public.routine_get_bundle_transition_instant(
  input_bundle_id uuid,input_bundle_participant_id uuid default null
)
returns timestamptz language sql stable security definer set search_path=pg_catalog
as $$ select min(step.completed_at) from public.routine_bundle_steps step
  where step.bundle_id=input_bundle_id and step.step_key='ds02_opening_transition' and step.status='completed'
    and (input_bundle_participant_id is null or step.bundle_participant_id=input_bundle_participant_id) $$;

create or replace function public.routine_build_double_shift_change_feed(
  input_bundle_id uuid,input_bundle_participant_id uuid
)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_transition timestamptz; v_entries jsonb;
begin
  v_transition:=public.routine_get_bundle_transition_instant(input_bundle_id,input_bundle_participant_id);
  if v_transition is null then return jsonb_build_object('transitionCompletedAt',null,'entries','[]'::jsonb); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'entryId','routine-event:'||event.id::text,'serverTimestamp',event.server_created_at,
    'sourceType','routine_event','category',case
      when event.event_type like '%deviation%' then 'deviation'
      when event.event_type like '%override%' or event.event_type like '%correction%' then 'control'
      when event.event_type like '%transfer%' then 'transfer'
      when event.event_type like '%role%' or event.event_type like '%participant%' then 'staffing'
      when event.event_type like '%external%' then 'event_context' else 'routine' end,
    'title',replace(initcap(replace(event.event_type,'_',' ')),'  ',' '),
    'summary','Authoritative '||replace(event.event_type,'_',' ')||' recorded.',
    'actor',jsonb_build_object('type',event.actor_type,'name',event.actor_name_snapshot),
    'phase',link.phase,'runId',event.run_id,'taskId',event.task_id,'transferId',event.transfer_id,
    'severity',coalesce(nullif(event.payload->>'severity',''),'normal'),
    'actionRequired',event.event_type in ('deviation_opened','transfer_proposed','run_waiting_for_transfers','task_blocked')
  ) order by event.server_created_at,event.id),'[]'::jsonb) into v_entries
  from public.routine_events event join public.routine_bundle_runs link on link.run_id=event.run_id
    and link.bundle_id=input_bundle_id and link.organization_id=event.organization_id
  where event.server_created_at>=v_transition;
  return jsonb_build_object('transitionCompletedAt',v_transition,'entries',v_entries);
end;
$$;

create or replace function public.routine_compute_double_shift_change_feed_hash(input_entries jsonb)
returns text language sql immutable set search_path=pg_catalog
as $$ select public.routine_run_sha256(jsonb_build_object('schemaVersion','phase10h-change-feed-v1','entries',input_entries)) $$;

create or replace function public.get_double_shift_change_feed(
  input_bundle_id uuid,input_bundle_participant_id uuid
)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_bundle public.routine_bundles%rowtype; v_feed jsonb; v_entries jsonb;
begin
  select bundle.* into v_bundle from public.routine_bundles bundle where bundle.id=input_bundle_id;
  if v_bundle.id is null or not public.routine_bundle_is_visible(v_bundle.id,v_bundle.organization_id)
     or not exists(select 1 from public.routine_bundle_participants participant
       where participant.id=input_bundle_participant_id and participant.bundle_id=v_bundle.id) then
    raise exception using errcode='42501',message='Double Shift change-feed access is denied.';
  end if;
  v_feed:=public.routine_build_double_shift_change_feed(input_bundle_id,input_bundle_participant_id);
  v_entries:=v_feed->'entries';
  return v_feed||jsonb_build_object('serverNow',clock_timestamp(),
    'feedHash',public.routine_compute_double_shift_change_feed_hash(v_entries),
    'counts',jsonb_build_object('total',jsonb_array_length(v_entries),
      'important',(select count(*) from jsonb_array_elements(v_entries) entry where entry->>'severity'='important'),
      'critical',(select count(*) from jsonb_array_elements(v_entries) entry where entry->>'severity'='critical')),
    'unresolvedActionCount',(select count(*) from jsonb_array_elements(v_entries) entry
      where coalesce((entry->>'actionRequired')::boolean,false)));
end;
$$;

create or replace function public.return_to_double_shift(
  input_bundle_id uuid,input_bundle_participant_id uuid,input_expected_change_feed_hash text,
  input_expected_bundle_revision bigint,input_expected_participant_revision bigint,input_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record; v_bundle public.routine_bundles%rowtype; v_participant public.routine_bundle_participants%rowtype;
  v_step public.routine_bundle_steps%rowtype; v_ds02 public.routine_bundle_steps%rowtype;
  v_opening public.routine_runs%rowtype; v_closing public.routine_runs%rowtype; v_handover public.routine_handovers%rowtype;
  v_context jsonb; v_feed jsonb; v_entries jsonb; v_feed_hash text; v_payload jsonb; v_payload_hash text;
  v_request_hash text; v_replay jsonb; v_response jsonb; v_operation_id uuid; v_now timestamptz:=clock_timestamp();
begin
  select * into v_actor from public.routine_resolve_actor();
  v_request_hash:=public.routine_run_request_hash(jsonb_build_object('bundleId',input_bundle_id,
    'bundleParticipantId',input_bundle_participant_id,'expectedChangeFeedHash',input_expected_change_feed_hash,
    'expectedBundleRevision',input_expected_bundle_revision,'expectedParticipantRevision',input_expected_participant_revision));
  v_replay:=public.routine_bundle_operation_replay(v_actor.organization_id,v_actor.actor_auth_user_id,
    'return_to_double_shift',input_idempotency_key,v_request_hash); if v_replay is not null then return v_replay; end if;
  select bundle.* into v_bundle from public.routine_bundles bundle where bundle.id=input_bundle_id
    and bundle.organization_id=v_actor.organization_id for update;
  select participant.* into v_participant from public.routine_bundle_participants participant
    where participant.id=input_bundle_participant_id and participant.bundle_id=v_bundle.id for update;
  if v_bundle.id is null or v_participant.id is null
     or (v_participant.user_profile_id<>v_actor.actor_profile_id and v_actor.actor_role not in ('manager','shift_lead')) then
    raise exception using errcode='42501',message='The participant or a coordinator is required for DS03.';
  end if;
  if v_participant.status in ('closing_reassigned','removed','completed') then
    raise exception using errcode='P0001',message='This Double Shift assignment cannot return without explicit reopening.';
  end if;
  if v_bundle.revision<>input_expected_bundle_revision or v_participant.revision<>input_expected_participant_revision then
    raise exception using errcode='40001',message='Stale Double Shift bundle or participant revision.';
  end if;
  select step.* into v_ds02 from public.routine_bundle_steps step where step.bundle_id=v_bundle.id
    and step.bundle_participant_id=v_participant.id and step.step_key='ds02_opening_transition';
  if v_ds02.status<>'completed' then raise exception using errcode='P0001',message='DS02 must be completed before return.'; end if;
  select run.* into v_opening from public.routine_bundle_runs link join public.routine_runs run on run.id=link.run_id
    where link.bundle_id=v_bundle.id and link.phase='opening';
  select run.* into v_closing from public.routine_bundle_runs link join public.routine_runs run on run.id=link.run_id
    where link.bundle_id=v_bundle.id and link.phase='closing';
  v_context:=public.routine_resolve_run_event_context(v_closing.id,'system');
  perform public.routine_evaluate_run_conditions(v_closing.id,v_now);
  perform public.routine_refresh_run_timing_internal(v_closing.id,v_now);
  v_feed:=public.routine_build_double_shift_change_feed(v_bundle.id,v_participant.id);
  v_entries:=v_feed->'entries'; v_feed_hash:=public.routine_compute_double_shift_change_feed_hash(v_entries);
  if input_expected_change_feed_hash is null or input_expected_change_feed_hash<>v_feed_hash then
    raise exception using errcode='40001',message='double_shift_changes_updated';
  end if;
  select step.* into v_step from public.routine_bundle_steps step where step.bundle_id=v_bundle.id
    and step.bundle_participant_id=v_participant.id and step.step_key='ds03_return_review' for update;
  if v_step.status<>'not_started' then raise exception using errcode='P0001',message='DS03 is already completed.'; end if;
  select handover.* into v_handover from public.routine_handovers handover where handover.from_run_id=v_opening.id
    and handover.to_run_id=v_closing.id and handover.handover_type='opening_transition'
    order by handover.created_at limit 1 for update;
  if v_handover.status='submitted' then
    perform set_config('mesh.routine_run_internal','handover',true);
    update public.routine_handovers set status='accepted',accepted_at=v_now,
      accepted_by_auth_user_id=v_actor.actor_auth_user_id,revision=revision+1,
      updated_by_auth_user_id=v_actor.actor_auth_user_id where id=v_handover.id returning * into v_handover;
  end if;
  v_payload:=jsonb_build_object('schemaVersion','phase10h-ds03-v1','feedHash',v_feed_hash,
    'reviewedThroughInstant',v_now,'transitionCompletedAt',v_feed->'transitionCompletedAt',
    'entryCount',jsonb_array_length(v_entries),'unresolvedActionCount',(select count(*) from jsonb_array_elements(v_entries) entry
      where coalesce((entry->>'actionRequired')::boolean,false)),'handoverId',v_handover.id,
    'externalContextResolutionCount',jsonb_array_length(coalesce(v_context->'resolutions','[]'::jsonb)));
  v_payload_hash:=public.routine_run_sha256(v_payload);
  perform set_config('mesh.routine_bundle_internal','ds03',true);
  update public.routine_bundle_steps set status='completed',payload_snapshot=v_payload,payload_hash=v_payload_hash,
    completed_at=v_now,completed_by_auth_user_id=v_actor.actor_auth_user_id,
    completed_by_name_snapshot=v_actor.actor_display_name,completed_by_actor_type='user',revision=revision+1
    where id=v_step.id returning * into v_step;
  update public.routine_bundle_participants set actual_return_at=v_now,
    status=case when v_closing.status in ('in_progress','reopened') then 'working_closing' else 'returned' end,
    revision=revision+1,updated_by_auth_user_id=v_actor.actor_auth_user_id where id=v_participant.id returning * into v_participant;
  update public.routine_bundles set status=case when v_closing.status in ('in_progress','reopened') then 'closing_in_progress' else 'closing_due' end,
    revision=revision+1,updated_by_auth_user_id=v_actor.actor_auth_user_id where id=v_bundle.id returning * into v_bundle;
  v_response:=jsonb_build_object('bundle',to_jsonb(v_bundle),'participant',to_jsonb(v_participant),'step',to_jsonb(v_step),
    'changeFeed',v_feed||jsonb_build_object('feedHash',v_feed_hash),'handover',to_jsonb(v_handover),'idempotentReplay',false);
  v_operation_id:=public.routine_record_bundle_operation(v_actor.organization_id,v_actor.actor_auth_user_id,
    'return_to_double_shift',input_idempotency_key,v_request_hash,'bundle_step',v_step.id,v_response);
  perform public.routine_record_bundle_event(v_bundle.id,v_closing.id,'double_shift_change_feed_reviewed','user',
    v_actor.actor_auth_user_id,v_actor.actor_profile_id,v_actor.actor_display_name,v_actor.actor_role,
    jsonb_build_object('bundleParticipantId',v_participant.id,'feedHash',v_feed_hash,
      'reviewedThroughInstant',v_now,'entryCount',jsonb_array_length(v_entries)),v_operation_id,1);
  perform public.routine_record_bundle_event(v_bundle.id,v_closing.id,'double_shift_returned','user',
    v_actor.actor_auth_user_id,v_actor.actor_profile_id,v_actor.actor_display_name,v_actor.actor_role,
    jsonb_build_object('bundleParticipantId',v_participant.id,'actualReturnAt',v_now,'stepId',v_step.id,
      'payloadHash',v_payload_hash),v_operation_id,2);
  return v_response;
end;
$$;

create or replace function public.routine_ensure_closing_bundle_participant(
  input_bundle_id uuid,input_profile_id uuid,input_created_by uuid,input_key uuid
)
returns public.routine_bundle_participants language plpgsql security definer set search_path=pg_catalog
as $$
declare v_bundle public.routine_bundles%rowtype; v_profile public.user_profiles%rowtype;
  v_closing_run uuid; v_closing_participant public.routine_run_participants%rowtype;
  v_participant public.routine_bundle_participants%rowtype; v_step_key text;
begin
  select bundle.* into v_bundle from public.routine_bundles bundle where bundle.id=input_bundle_id;
  select profile.* into v_profile from public.user_profiles profile where profile.id=input_profile_id;
  select link.run_id into v_closing_run from public.routine_bundle_runs link
    where link.bundle_id=input_bundle_id and link.phase='closing';
  if v_bundle.id is null or v_closing_run is null or v_profile.id is null
     or v_profile.organization_id is distinct from v_bundle.organization_id or not v_profile.active
     or coalesce(v_profile.is_shared_device,false) or v_profile.role not in ('manager','shift_lead','staff') then
    raise exception using errcode='P0001',message='An active personal same-organization Closing participant is required.';
  end if;
  v_closing_participant:=public.routine_ensure_run_participant(v_closing_run,v_profile.id,input_created_by,
    public.routine_phase10h_uuid(input_key::text||'|closing'));
  select participant.* into v_participant from public.routine_bundle_participants participant
    where participant.bundle_id=v_bundle.id and participant.user_profile_id=v_profile.id;
  if v_participant.id is null then
    insert into public.routine_bundle_participants(
      organization_id,bundle_id,user_profile_id,closing_run_participant_id,display_name_snapshot,role_snapshot,
      creation_idempotency_key,created_by_auth_user_id,updated_by_auth_user_id
    ) values(v_bundle.organization_id,v_bundle.id,v_profile.id,v_closing_participant.id,v_profile.display_name,
      v_profile.role,input_key,input_created_by,input_created_by)
    on conflict(bundle_id,user_profile_id) do nothing returning * into v_participant;
    if v_participant.id is null then
      select participant.* into v_participant from public.routine_bundle_participants participant
        where participant.bundle_id=v_bundle.id and participant.user_profile_id=v_profile.id;
    end if;
  elsif v_participant.closing_run_participant_id is null then
    perform set_config('mesh.routine_bundle_internal','closing-participant',true);
    update public.routine_bundle_participants set closing_run_participant_id=v_closing_participant.id,
      revision=revision+1,updated_by_auth_user_id=input_created_by
      where id=v_participant.id returning * into v_participant;
  end if;
  foreach v_step_key in array array['ds01_confirm_plan','ds02_opening_transition','ds03_return_review'] loop
    insert into public.routine_bundle_steps(organization_id,bundle_id,bundle_participant_id,step_key)
      values(v_bundle.organization_id,v_bundle.id,v_participant.id,v_step_key)
      on conflict(bundle_id,bundle_participant_id,step_key) where bundle_participant_id is not null do nothing;
  end loop;
  return v_participant;
end;
$$;

create or replace function public.reassign_double_shift_closing(
  input_bundle_id uuid,input_from_bundle_participant_id uuid,input_to_user_profile_id uuid,input_reason text,
  input_expected_bundle_revision bigint,input_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record; v_bundle public.routine_bundles%rowtype; v_from public.routine_bundle_participants%rowtype;
  v_to public.routine_bundle_participants%rowtype; v_closing_run uuid; v_reason text:=nullif(trim(coalesce(input_reason,'')),'');
  v_request_hash text; v_replay jsonb; v_response jsonb; v_operation_id uuid:=gen_random_uuid();
  v_reassignment_id uuid:=gen_random_uuid();
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role not in ('manager','shift_lead') or v_reason is null then
    raise exception using errcode='42501',message='Coordinator authority and a substantive reassignment reason are required.';
  end if;
  v_request_hash:=public.routine_run_request_hash(jsonb_build_object('bundleId',input_bundle_id,
    'fromBundleParticipantId',input_from_bundle_participant_id,'toUserProfileId',input_to_user_profile_id,
    'reason',v_reason,'expectedBundleRevision',input_expected_bundle_revision));
  v_replay:=public.routine_bundle_operation_replay(v_actor.organization_id,v_actor.actor_auth_user_id,
    'reassign_double_shift_closing',input_idempotency_key,v_request_hash);
  if v_replay is not null then return v_replay; end if;
  select bundle.* into v_bundle from public.routine_bundles bundle where bundle.id=input_bundle_id
    and bundle.organization_id=v_actor.organization_id for update;
  if v_bundle.id is null then raise exception using errcode='42501',message='A same-organization Double Shift bundle is required.'; end if;
  if v_bundle.revision<>input_expected_bundle_revision then
    raise exception using errcode='40001',message='Stale Double Shift bundle revision.';
  end if;
  if v_bundle.status in ('completed','cancelled') then
    raise exception using errcode='P0001',message='A terminal Double Shift bundle cannot be reassigned.';
  end if;
  select participant.* into v_from from public.routine_bundle_participants participant
    where participant.id=input_from_bundle_participant_id and participant.bundle_id=v_bundle.id for update;
  if v_from.id is null or v_from.status in ('closing_reassigned','completed','removed')
     or v_from.user_profile_id=input_to_user_profile_id then
    raise exception using errcode='P0001',message='The source assignment is not eligible for Closing reassignment.';
  end if;
  select link.run_id into v_closing_run from public.routine_bundle_runs link
    where link.bundle_id=v_bundle.id and link.phase='closing';
  v_to:=public.routine_ensure_closing_bundle_participant(v_bundle.id,input_to_user_profile_id,
    v_actor.actor_auth_user_id,public.routine_phase10h_uuid(v_bundle.id::text||'|'||input_to_user_profile_id::text||'|closing-reassignment'));
  perform set_config('mesh.routine_bundle_internal','reassignment',true);
  update public.routine_bundle_participants set status='closing_reassigned',
    closing_reassigned_to_participant_id=v_to.id,status_reason=v_reason,revision=revision+1,
    updated_by_auth_user_id=v_actor.actor_auth_user_id where id=v_from.id returning * into v_from;
  update public.routine_bundles set revision=revision+1,updated_by_auth_user_id=v_actor.actor_auth_user_id
    where id=v_bundle.id returning * into v_bundle;
  v_response:=jsonb_build_object('bundle',to_jsonb(v_bundle),'fromParticipant',to_jsonb(v_from),
    'toParticipant',to_jsonb(v_to),'reassignmentId',v_reassignment_id,'closingRunId',v_closing_run,
    'idempotentReplay',false);
  insert into public.routine_bundle_operations(id,organization_id,actor_auth_user_id,operation_type,idempotency_key,
    request_hash,resource_type,resource_id,response_payload)
  values(v_operation_id,v_actor.organization_id,v_actor.actor_auth_user_id,'reassign_double_shift_closing',
    input_idempotency_key,v_request_hash,'bundle_reassignment',v_reassignment_id,v_response);
  insert into public.routine_bundle_reassignments(id,organization_id,bundle_id,from_bundle_participant_id,
    to_bundle_participant_id,closing_run_id,reason,created_by_auth_user_id,created_by_name_snapshot,operation_id)
  values(v_reassignment_id,v_bundle.organization_id,v_bundle.id,v_from.id,v_to.id,v_closing_run,v_reason,
    v_actor.actor_auth_user_id,v_actor.actor_display_name,v_operation_id);
  perform public.routine_record_bundle_event(v_bundle.id,v_closing_run,'double_shift_closing_reassigned','user',
    v_actor.actor_auth_user_id,v_actor.actor_profile_id,v_actor.actor_display_name,v_actor.actor_role,
    jsonb_build_object('fromBundleParticipantId',v_from.id,'toBundleParticipantId',v_to.id,
      'reassignmentId',v_reassignment_id,'reason',v_reason),v_operation_id,1);
  perform public.routine_reconcile_double_shift_bundle(v_bundle.id);
  return v_response;
end;
$$;

create or replace function public.routine_double_shift_personal_outcome(input_participant_id uuid)
returns text language sql stable security definer set search_path=pg_catalog
as $$
  select case
    when participant.status='closing_reassigned' then 'opening_completed_closing_reassigned'
    when participant.status='unable_to_return' then 'opening_completed_unable_to_return'
    when participant.status='completed' and participant.opening_run_participant_id is null then 'closing_completed_as_replacement'
    when participant.status='completed' then 'opening_and_closing_completed'
    else participant.status end
  from public.routine_bundle_participants participant where participant.id=input_participant_id
$$;

create or replace function public.routine_reconcile_double_shift_bundle(input_bundle_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_bundle public.routine_bundles%rowtype; v_opening public.routine_runs%rowtype; v_closing public.routine_runs%rowtype;
  v_previous text; v_next text; v_ds02 boolean; v_pending_event integer; v_invalid_event integer;
  v_step public.routine_bundle_steps%rowtype; v_payload jsonb; v_payload_hash text; v_event_key uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(input_bundle_id::text||'|reconcile',43));
  select bundle.* into v_bundle from public.routine_bundles bundle where bundle.id=input_bundle_id for update;
  if v_bundle.id is null then return jsonb_build_object('found',false); end if;
  if v_bundle.status='cancelled' then return jsonb_build_object('found',true,'status','cancelled','changed',false); end if;
  select run.* into v_opening from public.routine_bundle_runs link join public.routine_runs run on run.id=link.run_id
    where link.bundle_id=v_bundle.id and link.phase='opening';
  select run.* into v_closing from public.routine_bundle_runs link join public.routine_runs run on run.id=link.run_id
    where link.bundle_id=v_bundle.id and link.phase='closing';
  select exists(select 1 from public.routine_bundle_steps step where step.bundle_id=v_bundle.id
    and step.step_key='ds02_opening_transition' and step.status='completed') into v_ds02;
  select count(*) filter(where transfer.status='accepted'),count(*) filter(where transfer.status='completed' and
      (acceptance.id is null or completion.id is null))
    into v_pending_event,v_invalid_event
  from public.routine_run_transfers transfer
  left join public.routine_event_transfer_acceptances acceptance on acceptance.transfer_id=transfer.id
  left join public.routine_event_transfer_completions completion on completion.transfer_id=transfer.id
  where transfer.from_run_id=v_closing.id and transfer.target_type='event_operation';
  v_previous:=v_bundle.status;
  v_next:=case
    when v_opening.status in ('in_progress','reopened') then 'opening_in_progress'
    when v_closing.status='waiting_for_transfers' or v_pending_event>0 or v_invalid_event>0 then 'waiting_for_transferred_event_close'
    when v_closing.status in ('in_progress','reopened','awaiting_final_verification') then 'closing_in_progress'
    when v_opening.status='finished' and v_closing.status='finished' then 'completed'
    when v_opening.status='finished' and not v_ds02 then 'opening_complete'
    when v_opening.status='finished' and v_ds02 then
      case when exists(select 1 from public.routine_bundle_participants participant where participant.bundle_id=v_bundle.id
        and participant.status in ('returned','working_closing')) then 'closing_due' else 'between_shifts' end
    else 'scheduled' end;
  perform set_config('mesh.routine_bundle_internal','reconcile',true);
  if v_next='completed' then
    select step.* into v_step from public.routine_bundle_steps step where step.bundle_id=v_bundle.id
      and step.step_key='ds04_bundle_finalized' and step.bundle_participant_id is null for update;
    if v_step.status='not_started' then
      v_payload:=jsonb_build_object('schemaVersion','phase10h-ds04-v1',
        'openingRun',jsonb_build_object('id',v_opening.id,'status',v_opening.status,'snapshotHash',v_opening.snapshot_hash,
          'timingHash',v_opening.timing_snapshot_hash,'finishedAt',v_opening.finished_at),
        'closingRun',jsonb_build_object('id',v_closing.id,'status',v_closing.status,'snapshotHash',v_closing.snapshot_hash,
          'timingHash',v_closing.timing_snapshot_hash,'finishedAt',v_closing.finished_at),
        'participants',coalesce((select jsonb_agg(jsonb_build_object('participantId',participant.id,
          'userProfileId',participant.user_profile_id,'openingRunParticipantId',participant.opening_run_participant_id,
          'closingRunParticipantId',participant.closing_run_participant_id,'statusBeforeFinalization',participant.status,
          'personalOutcome',case when participant.status='closing_reassigned' then 'opening_completed_closing_reassigned'
            when participant.status='unable_to_return' then 'opening_completed_unable_to_return'
            when participant.opening_run_participant_id is null then 'closing_completed_as_replacement'
            else 'opening_and_closing_completed' end) order by participant.id)
          from public.routine_bundle_participants participant where participant.bundle_id=v_bundle.id),'[]'::jsonb),
        'reassignments',coalesce((select jsonb_agg(jsonb_build_object('id',reassignment.id,
          'fromParticipantId',reassignment.from_bundle_participant_id,'toParticipantId',reassignment.to_bundle_participant_id,
          'reason',reassignment.reason,'createdAt',reassignment.created_at) order by reassignment.created_at,reassignment.id)
          from public.routine_bundle_reassignments reassignment where reassignment.bundle_id=v_bundle.id),'[]'::jsonb),
        'deviationCount',(select count(*) from public.routine_deviations deviation where deviation.run_id in (v_opening.id,v_closing.id)),
        'overrideCount',(select count(*) from public.routine_manager_overrides manager_override where manager_override.run_id in (v_opening.id,v_closing.id)),
        'eventTransfers',coalesce((select jsonb_agg(jsonb_build_object('transferId',transfer.id,'status',transfer.status,
          'acceptanceHash',acceptance.acceptance_hash,'completionHash',completion.completion_hash) order by transfer.id)
          from public.routine_run_transfers transfer
          left join public.routine_event_transfer_acceptances acceptance on acceptance.transfer_id=transfer.id
          left join public.routine_event_transfer_completions completion on completion.transfer_id=transfer.id
          where transfer.from_run_id in (v_opening.id,v_closing.id) and transfer.target_type='event_operation'),'[]'::jsonb),
        'finalDeliveryRecord',(select to_jsonb(record) from public.routine_delivery_records record
          where record.source_run_id=v_closing.id order by record.source_finish_sequence desc,record.id desc limit 1),
        'physicalCompletionTime',v_closing.finished_at,
        'serverState',jsonb_build_object('openingRevision',v_opening.revision,'closingRevision',v_closing.revision,
          'bundleRevisionBeforeFinalization',v_bundle.revision));
      v_payload_hash:=public.routine_run_sha256(v_payload);
      update public.routine_bundle_steps set status='completed',payload_snapshot=v_payload,payload_hash=v_payload_hash,
        completed_at=clock_timestamp(),completed_by_auth_user_id=null,completed_by_name_snapshot='Routine Double Shift engine',
        completed_by_actor_type='system',revision=revision+1 where id=v_step.id returning * into v_step;
      update public.routine_bundle_participants set status='completed',revision=revision+1,
        updated_by_auth_user_id=v_bundle.updated_by_auth_user_id
        where bundle_id=v_bundle.id and status not in ('closing_reassigned','unable_to_return','removed');
      v_event_key:=public.routine_phase10h_uuid(v_bundle.id::text||'|ds04|'||v_payload_hash);
      perform public.routine_record_bundle_event(v_bundle.id,v_closing.id,'double_shift_finalized','system',null,null,
        'Routine Double Shift engine',null,jsonb_build_object('stepId',v_step.id,'payloadHash',v_payload_hash,
          'physicalCompletionTime',v_closing.finished_at),v_event_key,1);
    end if;
  end if;
  if v_next is distinct from v_previous or (v_next='completed' and v_bundle.completed_at is null) then
    update public.routine_bundles set status=v_next,
      started_at=case when v_next in ('opening_in_progress','opening_complete','between_shifts','closing_due',
        'closing_in_progress','closing_scope_complete','waiting_for_transferred_event_close','completed')
        then coalesce(started_at,v_opening.started_at,clock_timestamp()) else started_at end,
      completed_at=case when v_next='completed' then coalesce(completed_at,v_closing.finished_at,clock_timestamp()) else null end,
      revision=revision+1,updated_by_auth_user_id=v_bundle.updated_by_auth_user_id
      where id=v_bundle.id returning * into v_bundle;
    v_event_key:=public.routine_phase10h_uuid(v_bundle.id::text||'|status|'||v_bundle.revision::text||'|'||v_next);
    perform public.routine_record_bundle_event(v_bundle.id,case when v_next like 'opening%' then v_opening.id else v_closing.id end,
      'double_shift_status_changed','system',null,null,'Routine Double Shift engine',null,
      jsonb_build_object('previousStatus',v_previous,'status',v_next,'bundleRevision',v_bundle.revision),v_event_key,1);
  end if;
  return jsonb_build_object('found',true,'changed',v_next is distinct from v_previous,'previousStatus',v_previous,
    'status',v_next,'bundleRevision',v_bundle.revision,'ds04Completed',v_next='completed');
end;
$$;

create or replace function public.routine_reconcile_double_shift_for_run(input_run_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_bundle_id uuid;
begin
  select link.bundle_id into v_bundle_id from public.routine_bundle_runs link where link.run_id=input_run_id limit 1;
  if v_bundle_id is null then return jsonb_build_object('linked',false); end if;
  return jsonb_build_object('linked',true,'bundleId',v_bundle_id,
    'reconciliation',public.routine_reconcile_double_shift_bundle(v_bundle_id));
end;
$$;

do $phase10h_lifecycle_rpc_rename$
begin
  if to_regprocedure('public.start_routine_run_phase10h_base(uuid,bigint,uuid)') is null then
    alter function public.start_routine_run(uuid,bigint,uuid) rename to start_routine_run_phase10h_base;
  end if;
  if to_regprocedure('public.finish_routine_run_phase10h_base(uuid,bigint,uuid)') is null then
    alter function public.finish_routine_run(uuid,bigint,uuid) rename to finish_routine_run_phase10h_base;
  end if;
  if to_regprocedure('public.reopen_routine_run_phase10h_base(uuid,text,bigint,uuid)') is null then
    alter function public.reopen_routine_run(uuid,text,bigint,uuid) rename to reopen_routine_run_phase10h_base;
  end if;
  if to_regprocedure('public.cancel_routine_run_phase10h_base(uuid,text,bigint,uuid)') is null then
    alter function public.cancel_routine_run(uuid,text,bigint,uuid) rename to cancel_routine_run_phase10h_base;
  end if;
end;
$phase10h_lifecycle_rpc_rename$;

create or replace function public.start_routine_run(input_run_id uuid,input_expected_revision bigint,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_response jsonb; v_bundle jsonb;
begin
  v_response:=public.start_routine_run_phase10h_base(input_run_id,input_expected_revision,input_idempotency_key);
  v_bundle:=public.routine_reconcile_double_shift_for_run(input_run_id);
  return v_response||jsonb_build_object('doubleShift',v_bundle);
end;
$$;

create or replace function public.finish_routine_run(input_run_id uuid,input_expected_run_revision bigint,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_response jsonb; v_bundle jsonb;
begin
  v_response:=public.finish_routine_run_phase10h_base(input_run_id,input_expected_run_revision,input_idempotency_key);
  v_bundle:=public.routine_reconcile_double_shift_for_run(input_run_id);
  return v_response||jsonb_build_object('doubleShift',v_bundle);
end;
$$;

create or replace function public.reopen_routine_run(
  input_run_id uuid,input_reason text,input_expected_run_revision bigint,input_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_response jsonb; v_bundle jsonb;
begin
  v_response:=public.reopen_routine_run_phase10h_base(input_run_id,input_reason,input_expected_run_revision,input_idempotency_key);
  v_bundle:=public.routine_reconcile_double_shift_for_run(input_run_id);
  return v_response||jsonb_build_object('doubleShift',v_bundle);
end;
$$;

create or replace function public.cancel_routine_run(
  input_run_id uuid,input_reason text,input_expected_run_revision bigint,input_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_response jsonb; v_bundle public.routine_bundles%rowtype; v_actor record; v_run_id uuid;
begin
  v_response:=public.cancel_routine_run_phase10h_base(input_run_id,input_reason,input_expected_run_revision,input_idempotency_key);
  select bundle.* into v_bundle from public.routine_bundle_runs link join public.routine_bundles bundle on bundle.id=link.bundle_id
    where link.run_id=input_run_id for update;
  if v_bundle.id is not null and v_bundle.status<>'cancelled' then
    select * into v_actor from public.routine_resolve_actor();
    perform set_config('mesh.routine_bundle_internal','cancel',true);
    update public.routine_bundles set status='cancelled',cancelled_at=clock_timestamp(),
      cancelled_by_auth_user_id=v_actor.actor_auth_user_id,cancellation_reason=nullif(trim(input_reason),''),
      revision=revision+1,updated_by_auth_user_id=v_actor.actor_auth_user_id where id=v_bundle.id returning * into v_bundle;
    update public.routine_bundle_steps set status='cancelled',revision=revision+1
      where bundle_id=v_bundle.id and status='not_started';
    select link.run_id into v_run_id from public.routine_bundle_runs link where link.bundle_id=v_bundle.id
      order by case when link.phase='closing' then 0 else 1 end limit 1;
    perform public.routine_record_bundle_event(v_bundle.id,v_run_id,'double_shift_status_changed','user',
      v_actor.actor_auth_user_id,v_actor.actor_profile_id,v_actor.actor_display_name,v_actor.actor_role,
      jsonb_build_object('previousStatus','active','status','cancelled','reason',input_reason),input_idempotency_key,1);
  end if;
  return v_response||jsonb_build_object('doubleShift',case when v_bundle.id is null then jsonb_build_object('linked',false)
    else jsonb_build_object('linked',true,'bundle',to_jsonb(v_bundle)) end);
end;
$$;

create or replace function public.get_routine_event_transfer_workspace(input_transfer_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_transfer public.routine_run_transfers%rowtype; v_task public.routine_run_tasks%rowtype;
begin
  select transfer.* into v_transfer from public.routine_run_transfers transfer where transfer.id=input_transfer_id;
  if v_transfer.id is null or not public.routine_event_transfer_is_visible(v_transfer.id,v_transfer.organization_id) then
    raise exception using errcode='42501',message='Event-transfer access is denied.';
  end if;
  select task.* into v_task from public.routine_run_tasks task where task.id=v_transfer.from_task_id;
  return jsonb_build_object('transfer',to_jsonb(v_transfer),
    'sourceTask',jsonb_build_object('id',v_task.id,'taskKey',v_task.task_key_snapshot,'title',v_task.title_snapshot,
      'criticality',v_task.criticality_snapshot,'status',v_task.status,'rowSnapshotHash',v_task.row_snapshot_hash),
    'evidenceRequirements',coalesce((select jsonb_agg(jsonb_build_object('sourceTaskItemId',item.id,
      'itemKey',item.item_key_snapshot,'label',item.label_snapshot,'itemType',item.item_type_snapshot,
      'required',item.required_snapshot,'inputSchema',item.input_schema_snapshot,'rowSnapshotHash',item.row_snapshot_hash)
      order by item.sort_order_snapshot,item.item_key_snapshot) from public.routine_run_task_items item
      where item.run_task_id=v_task.id and item.active_snapshot),'[]'::jsonb),
    'acceptance',(select to_jsonb(acceptance) from public.routine_event_transfer_acceptances acceptance
      where acceptance.transfer_id=v_transfer.id),
    'completion',(select to_jsonb(completion) from public.routine_event_transfer_completions completion
      where completion.transfer_id=v_transfer.id),
    'authority',public.routine_current_user_event_transfer_authority(v_transfer.target_event_id));
end;
$$;

create or replace function public.get_double_shift_workspace(input_bundle_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare v_bundle public.routine_bundles%rowtype; v_opening public.routine_runs%rowtype; v_closing public.routine_runs%rowtype;
  v_current public.routine_bundle_participants%rowtype; v_feed jsonb;
begin
  select bundle.* into v_bundle from public.routine_bundles bundle where bundle.id=input_bundle_id;
  if v_bundle.id is null or not public.routine_bundle_is_visible(v_bundle.id,v_bundle.organization_id) then
    raise exception using errcode='42501',message='Double Shift workspace access is denied.';
  end if;
  select run.* into v_opening from public.routine_bundle_runs link join public.routine_runs run on run.id=link.run_id
    where link.bundle_id=v_bundle.id and link.phase='opening';
  select run.* into v_closing from public.routine_bundle_runs link join public.routine_runs run on run.id=link.run_id
    where link.bundle_id=v_bundle.id and link.phase='closing';
  select participant.* into v_current from public.routine_bundle_participants participant
    where participant.bundle_id=v_bundle.id and participant.user_profile_id=auth.uid();
  if v_current.id is not null then
    v_feed:=public.get_double_shift_change_feed(v_bundle.id,v_current.id);
  else
    v_feed:=jsonb_build_object('transitionCompletedAt',public.routine_get_bundle_transition_instant(v_bundle.id,null),
      'serverNow',clock_timestamp(),'entries','[]'::jsonb,'feedHash',public.routine_compute_double_shift_change_feed_hash('[]'::jsonb));
  end if;
  return jsonb_build_object('bundle',to_jsonb(v_bundle),
    'runs',jsonb_build_object('opening',to_jsonb(v_opening),'closing',to_jsonb(v_closing)),
    'pinnedRuns',coalesce((select jsonb_agg(to_jsonb(link) order by link.phase)
      from public.routine_bundle_runs link where link.bundle_id=v_bundle.id),'[]'::jsonb),
    'currentParticipant',to_jsonb(v_current),
    'participants',coalesce((select jsonb_agg(to_jsonb(participant)||jsonb_build_object(
      'personalOutcome',public.routine_double_shift_personal_outcome(participant.id)) order by participant.created_at,participant.id)
      from public.routine_bundle_participants participant where participant.bundle_id=v_bundle.id),'[]'::jsonb),
    'steps',coalesce((select jsonb_agg(to_jsonb(step) order by step.step_key,step.bundle_participant_id nulls first)
      from public.routine_bundle_steps step where step.bundle_id=v_bundle.id),'[]'::jsonb),
    'roles',coalesce((select jsonb_agg(to_jsonb(role) order by role.run_id,role.role_key,role.scope_key)
      from public.routine_run_role_assignments role where role.run_id in (v_opening.id,v_closing.id) and role.status='active'),'[]'::jsonb),
    'reassignments',coalesce((select jsonb_agg(to_jsonb(reassignment) order by reassignment.created_at,reassignment.id)
      from public.routine_bundle_reassignments reassignment where reassignment.bundle_id=v_bundle.id),'[]'::jsonb),
    'openingTransitionHandover',(select to_jsonb(handover) from public.routine_handovers handover
      where handover.from_run_id=v_opening.id and handover.to_run_id=v_closing.id and handover.handover_type='opening_transition'
      order by handover.created_at limit 1),
    'changeFeed',v_feed,
    'externalEventContext',coalesce((select jsonb_agg(jsonb_build_object('state',to_jsonb(state),
      'resolution',to_jsonb(resolution)) order by state.snapshot_source_id)
      from public.routine_run_external_context_states state
      left join public.routine_run_external_context_resolutions resolution on resolution.id=state.current_resolution_id
      where state.run_id in (v_opening.id,v_closing.id)),'[]'::jsonb),
    'transfers',coalesce((select jsonb_agg(jsonb_build_object('transfer',to_jsonb(transfer),
      'acceptance',to_jsonb(acceptance),'completion',to_jsonb(completion)) order by transfer.proposed_at,transfer.id)
      from public.routine_run_transfers transfer
      left join public.routine_event_transfer_acceptances acceptance on acceptance.transfer_id=transfer.id
      left join public.routine_event_transfer_completions completion on completion.transfer_id=transfer.id
      where transfer.from_run_id in (v_opening.id,v_closing.id)),'[]'::jsonb),
    'delivery',jsonb_build_object('preview',public.routine_preview_run_delivery(v_closing.id),
      'latestRecord',(select to_jsonb(record) from public.routine_delivery_records record where record.source_run_id=v_closing.id
        order by record.source_finish_sequence desc,record.id desc limit 1)),
    'completionEligibility',jsonb_build_object('openingFinished',v_opening.status='finished',
      'closingFinished',v_closing.status='finished','bundleCompleted',v_bundle.status='completed'),
    'serverTiming',jsonb_build_object('serverNow',clock_timestamp(),'timezone',v_bundle.timezone,
      'operationalDate',v_bundle.operational_date),
    'personalOutcome',case when v_current.id is null then null else public.routine_double_shift_personal_outcome(v_current.id) end,
    'sync',jsonb_build_object('readOnlyPhase','10H','serverAuthoritative',true));
end;
$$;

create or replace function public.list_double_shift_bundles_for_date(input_operational_date date default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_date date; v_derived record; v_org uuid;
begin
  v_org:=public.routine_current_user_organization_id();
  if v_org is null or not public.routine_current_user_is_active() or public.current_user_is_shared_device() then
    raise exception using errcode='42501',message='Active personal Routine access is required.';
  end if;
  if input_operational_date is null then
    select * into v_derived from public.routine_derive_operational_date(v_org,clock_timestamp());
    v_date:=v_derived.operational_date;
  else v_date:=input_operational_date; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('bundle',to_jsonb(bundle),
    'participantCount',(select count(*) from public.routine_bundle_participants participant where participant.bundle_id=bundle.id),
    'currentParticipantId',(select participant.id from public.routine_bundle_participants participant
      where participant.bundle_id=bundle.id and participant.user_profile_id=auth.uid())) order by bundle.scope_key,bundle.id)
    from public.routine_bundles bundle where bundle.organization_id=v_org and bundle.operational_date=v_date
      and public.routine_bundle_is_visible(bundle.id,bundle.organization_id)),'[]'::jsonb);
end;
$$;

create or replace function public.get_double_shift_participant_summary(input_bundle_participant_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_participant public.routine_bundle_participants%rowtype;
begin
  select participant.* into v_participant from public.routine_bundle_participants participant
    where participant.id=input_bundle_participant_id;
  if v_participant.id is null or not public.routine_bundle_is_visible(v_participant.bundle_id,v_participant.organization_id) then
    raise exception using errcode='42501',message='Double Shift participant summary access is denied.';
  end if;
  return jsonb_build_object('participant',to_jsonb(v_participant),
    'steps',coalesce((select jsonb_agg(to_jsonb(step) order by step.step_key) from public.routine_bundle_steps step
      where step.bundle_participant_id=v_participant.id),'[]'::jsonb),
    'reassignments',coalesce((select jsonb_agg(to_jsonb(reassignment) order by reassignment.created_at,reassignment.id)
      from public.routine_bundle_reassignments reassignment where reassignment.from_bundle_participant_id=v_participant.id
        or reassignment.to_bundle_participant_id=v_participant.id),'[]'::jsonb),
    'personalOutcome',public.routine_double_shift_personal_outcome(v_participant.id));
end;
$$;

create or replace function public.verify_double_shift_bundle(input_bundle_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_bundle public.routine_bundles%rowtype; v_link_errors jsonb; v_step_errors jsonb; v_participant_errors jsonb;
  v_reassignment_errors jsonb; v_context_errors jsonb; v_transfer_errors jsonb; v_delivery_errors jsonb; v_ds04_errors jsonb;
  v_errors jsonb;
begin
  select bundle.* into v_bundle from public.routine_bundles bundle where bundle.id=input_bundle_id;
  if v_bundle.id is null or not public.routine_bundle_is_visible(v_bundle.id,v_bundle.organization_id) then
    raise exception using errcode='42501',message='Double Shift verification access is denied.';
  end if;
  select coalesce(jsonb_agg(link.id order by link.id),'[]'::jsonb) into v_link_errors
  from public.routine_bundle_runs link join public.routine_runs run on run.id=link.run_id
  where link.bundle_id=v_bundle.id and (run.organization_id<>link.organization_id or run.operational_date<>v_bundle.operational_date
    or run.scope_key<>v_bundle.scope_key or link.run_snapshot_hash_snapshot<>run.snapshot_hash
    or link.timing_snapshot_hash_snapshot<>run.timing_snapshot_hash
    or link.template_version_id_snapshot<>run.template_version_id
    or link.template_content_hash_snapshot<>run.template_content_hash_snapshot
    or (link.phase='opening' and run.routine_key<>v_bundle.opening_routine_key)
    or (link.phase='closing' and run.routine_key<>v_bundle.closing_routine_key));
  select coalesce(jsonb_agg(step.id order by step.id),'[]'::jsonb) into v_step_errors
  from public.routine_bundle_steps step where step.bundle_id=v_bundle.id and step.status='completed'
    and (step.payload_hash is null or step.payload_hash<>public.routine_run_sha256(step.payload_snapshot));
  select coalesce(jsonb_agg(participant.id order by participant.id),'[]'::jsonb) into v_participant_errors
  from public.routine_bundle_participants participant
  left join public.routine_run_participants opening_participant on opening_participant.id=participant.opening_run_participant_id
  left join public.routine_run_participants closing_participant on closing_participant.id=participant.closing_run_participant_id
  where participant.bundle_id=v_bundle.id and ((opening_participant.id is not null and
      (opening_participant.organization_id<>participant.organization_id or opening_participant.user_profile_id<>participant.user_profile_id))
    or (closing_participant.id is not null and
      (closing_participant.organization_id<>participant.organization_id or closing_participant.user_profile_id<>participant.user_profile_id)));
  select coalesce(jsonb_agg(reassignment.id order by reassignment.id),'[]'::jsonb) into v_reassignment_errors
  from public.routine_bundle_reassignments reassignment
  where reassignment.bundle_id=v_bundle.id and (reassignment.from_bundle_participant_id=reassignment.to_bundle_participant_id
    or not exists(select 1 from public.routine_bundle_runs link where link.bundle_id=v_bundle.id
      and link.phase='closing' and link.run_id=reassignment.closing_run_id));
  select coalesce(jsonb_agg(state.id order by state.id),'[]'::jsonb) into v_context_errors
  from public.routine_run_external_context_states state join public.routine_bundle_runs link on link.run_id=state.run_id
  left join public.routine_run_external_context_resolutions resolution on resolution.id=state.current_resolution_id
  where link.bundle_id=v_bundle.id and (state.current_resolution_id is not null and
    (resolution.id is null or resolution.source_hash<>public.routine_compute_event_context_hash(
      resolution.source_config_snapshot,resolution.source_payload_snapshot)));
  select coalesce(jsonb_agg(transfer.id order by transfer.id),'[]'::jsonb) into v_transfer_errors
  from public.routine_run_transfers transfer join public.routine_bundle_runs link on link.run_id=transfer.from_run_id
  left join public.routine_event_transfer_acceptances acceptance on acceptance.transfer_id=transfer.id
  left join public.routine_event_transfer_completions completion on completion.transfer_id=transfer.id
  where link.bundle_id=v_bundle.id and transfer.target_type='event_operation' and (
    (transfer.status in ('accepted','completed') and acceptance.id is null)
    or (transfer.status='completed' and completion.id is null)
    or (completion.id is not null and not coalesce((public.routine_build_event_transfer_delivery_evidence(transfer.from_task_id)->>'valid')::boolean,false)));
  select coalesce(jsonb_agg(record.id order by record.id),'[]'::jsonb) into v_delivery_errors
  from public.routine_delivery_records record join public.routine_bundle_runs link on link.run_id=record.source_run_id
  where link.bundle_id=v_bundle.id and not coalesce((public.routine_verify_delivery_record(record.id)->>'valid')::boolean,false);
  select coalesce(jsonb_agg(step.id order by step.id),'[]'::jsonb) into v_ds04_errors
  from public.routine_bundle_steps step where step.bundle_id=v_bundle.id and step.step_key='ds04_bundle_finalized'
    and ((v_bundle.status='completed' and step.status<>'completed')
      or (step.status='completed' and step.payload_hash<>public.routine_run_sha256(step.payload_snapshot)));
  v_errors:=case when (select count(*) from public.routine_bundle_runs where bundle_id=v_bundle.id)<>2
    then jsonb_build_array('linked_run_count_invalid') else '[]'::jsonb end;
  if jsonb_array_length(v_link_errors)>0 then v_errors:=v_errors||jsonb_build_array('linked_run_integrity_invalid'); end if;
  if jsonb_array_length(v_step_errors)>0 then v_errors:=v_errors||jsonb_build_array('step_hash_invalid'); end if;
  if jsonb_array_length(v_participant_errors)>0 then v_errors:=v_errors||jsonb_build_array('participant_run_link_invalid'); end if;
  if jsonb_array_length(v_reassignment_errors)>0 then v_errors:=v_errors||jsonb_build_array('reassignment_integrity_invalid'); end if;
  if jsonb_array_length(v_context_errors)>0 then v_errors:=v_errors||jsonb_build_array('event_context_integrity_invalid'); end if;
  if jsonb_array_length(v_transfer_errors)>0 then v_errors:=v_errors||jsonb_build_array('event_transfer_evidence_invalid'); end if;
  if jsonb_array_length(v_delivery_errors)>0 then v_errors:=v_errors||jsonb_build_array('delivery_evidence_invalid'); end if;
  if jsonb_array_length(v_ds04_errors)>0 then v_errors:=v_errors||jsonb_build_array('ds04_integrity_invalid'); end if;
  return jsonb_build_object('valid',jsonb_array_length(v_errors)=0,'errors',v_errors,
    'linkedRunIntegrity',jsonb_build_object('valid',jsonb_array_length(v_link_errors)=0,'invalidIds',v_link_errors),
    'stepHashes',jsonb_build_object('valid',jsonb_array_length(v_step_errors)=0,'invalidIds',v_step_errors),
    'participantRunLinks',jsonb_build_object('valid',jsonb_array_length(v_participant_errors)=0,'invalidIds',v_participant_errors),
    'reassignmentIntegrity',jsonb_build_object('valid',jsonb_array_length(v_reassignment_errors)=0,'invalidIds',v_reassignment_errors),
    'eventContextIntegrity',jsonb_build_object('valid',jsonb_array_length(v_context_errors)=0,'invalidIds',v_context_errors),
    'transferEvidenceIntegrity',jsonb_build_object('valid',jsonb_array_length(v_transfer_errors)=0,'invalidIds',v_transfer_errors),
    'deliveryEvidenceIntegrity',jsonb_build_object('valid',jsonb_array_length(v_delivery_errors)=0,'invalidIds',v_delivery_errors),
    'ds04Integrity',jsonb_build_object('valid',jsonb_array_length(v_ds04_errors)=0,'invalidIds',v_ds04_errors),
    'bundleStatus',v_bundle.status);
end;
$$;

do $phase10h_read_rpc_rename$
begin
  if to_regprocedure('public.get_routine_run_workspace_phase10h_base(uuid)') is null then
    alter function public.get_routine_run_workspace(uuid) rename to get_routine_run_workspace_phase10h_base;
  end if;
  if to_regprocedure('public.get_routine_run_timeline_phase10h_base(uuid)') is null then
    alter function public.get_routine_run_timeline(uuid) rename to get_routine_run_timeline_phase10h_base;
  end if;
  if to_regprocedure('public.get_routine_task_timeline_phase10h_base(uuid)') is null then
    alter function public.get_routine_task_timeline(uuid) rename to get_routine_task_timeline_phase10h_base;
  end if;
  if to_regprocedure('public.get_routine_delivery_record_phase10h_base(uuid)') is null then
    alter function public.get_routine_delivery_record(uuid) rename to get_routine_delivery_record_phase10h_base;
  end if;
end;
$phase10h_read_rpc_rename$;

create or replace function public.get_routine_run_workspace(input_run_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare v_workspace jsonb; v_bundle_id uuid;
begin
  v_workspace:=public.get_routine_run_workspace_phase10h_base(input_run_id);
  select link.bundle_id into v_bundle_id from public.routine_bundle_runs link where link.run_id=input_run_id limit 1;
  return v_workspace||jsonb_build_object('doubleShift',case when v_bundle_id is null then null else
    jsonb_build_object('bundleId',v_bundle_id,'workspace',public.get_double_shift_workspace(v_bundle_id)) end,
    'sync',(v_workspace->'sync')||jsonb_build_object('readOnlyPhase','10H'));
end;
$$;

create or replace function public.get_routine_run_timeline(input_run_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_timeline jsonb; v_bundle_id uuid;
begin
  v_timeline:=public.get_routine_run_timeline_phase10h_base(input_run_id);
  select link.bundle_id into v_bundle_id from public.routine_bundle_runs link where link.run_id=input_run_id limit 1;
  return v_timeline||jsonb_build_object('doubleShiftBundleId',v_bundle_id,
    'doubleShiftEvents',case when v_bundle_id is null then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(event)
      order by event.server_created_at,event.id) from public.routine_events event where event.bundle_id=v_bundle_id),'[]'::jsonb) end);
end;
$$;

create or replace function public.get_routine_task_timeline(input_task_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_timeline jsonb;
begin
  v_timeline:=public.get_routine_task_timeline_phase10h_base(input_task_id);
  return v_timeline||jsonb_build_object('eventTransfers',coalesce((select jsonb_agg(jsonb_build_object(
    'transfer',to_jsonb(transfer),'acceptance',to_jsonb(acceptance),'completion',to_jsonb(completion))
    order by transfer.proposed_at,transfer.id) from public.routine_run_transfers transfer
    left join public.routine_event_transfer_acceptances acceptance on acceptance.transfer_id=transfer.id
    left join public.routine_event_transfer_completions completion on completion.transfer_id=transfer.id
    where transfer.from_task_id=input_task_id and transfer.target_type='event_operation'),'[]'::jsonb));
end;
$$;

create or replace function public.get_routine_delivery_record(input_delivery_record_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_record jsonb;
begin
  v_record:=public.get_routine_delivery_record_phase10h_base(input_delivery_record_id);
  return v_record||jsonb_build_object('transferEvidence',coalesce((select jsonb_agg(jsonb_build_object(
    'deliveryItemId',item.id,'itemSchemaVersion',item.item_schema_version,
    'transferEvidenceSnapshot',item.transfer_evidence_snapshot) order by item.sort_order_snapshot,item.id)
    from public.routine_delivery_items item where item.delivery_record_id=input_delivery_record_id
      and item.transfer_evidence_snapshot<>'{}'::jsonb),'[]'::jsonb));
end;
$$;

alter table public.routine_bundles enable row level security;
alter table public.routine_bundle_runs enable row level security;
alter table public.routine_bundle_participants enable row level security;
alter table public.routine_bundle_steps enable row level security;
alter table public.routine_bundle_operations enable row level security;
alter table public.routine_bundle_reassignments enable row level security;
alter table public.routine_run_external_context_states enable row level security;
alter table public.routine_run_external_context_resolutions enable row level security;
alter table public.routine_event_transfer_acceptances enable row level security;
alter table public.routine_event_transfer_completions enable row level security;

drop policy if exists routine_bundles_select on public.routine_bundles;
create policy routine_bundles_select on public.routine_bundles for select to authenticated
  using(public.routine_bundle_is_visible(id,organization_id));
drop policy if exists routine_bundle_runs_select on public.routine_bundle_runs;
create policy routine_bundle_runs_select on public.routine_bundle_runs for select to authenticated
  using(public.routine_bundle_is_visible(bundle_id,organization_id));
drop policy if exists routine_bundle_participants_select on public.routine_bundle_participants;
create policy routine_bundle_participants_select on public.routine_bundle_participants for select to authenticated
  using(public.routine_bundle_is_visible(bundle_id,organization_id));
drop policy if exists routine_bundle_steps_select on public.routine_bundle_steps;
create policy routine_bundle_steps_select on public.routine_bundle_steps for select to authenticated
  using(public.routine_bundle_is_visible(bundle_id,organization_id));
drop policy if exists routine_bundle_reassignments_select on public.routine_bundle_reassignments;
create policy routine_bundle_reassignments_select on public.routine_bundle_reassignments for select to authenticated
  using(public.routine_bundle_is_visible(bundle_id,organization_id));
drop policy if exists routine_bundle_operations_manager_select on public.routine_bundle_operations;
create policy routine_bundle_operations_manager_select on public.routine_bundle_operations for select to authenticated
  using(organization_id=public.routine_current_user_organization_id()
    and public.routine_current_user_is_active() and not public.current_user_is_shared_device()
    and public.routine_current_user_role()='manager');
drop policy if exists routine_external_states_select on public.routine_run_external_context_states;
create policy routine_external_states_select on public.routine_run_external_context_states for select to authenticated
  using(public.routine_run_is_visible(run_id,organization_id));
drop policy if exists routine_external_resolutions_select on public.routine_run_external_context_resolutions;
create policy routine_external_resolutions_select on public.routine_run_external_context_resolutions for select to authenticated
  using(public.routine_run_is_visible(run_id,organization_id));
drop policy if exists routine_event_acceptances_select on public.routine_event_transfer_acceptances;
create policy routine_event_acceptances_select on public.routine_event_transfer_acceptances for select to authenticated
  using(public.routine_event_transfer_is_visible(transfer_id,organization_id));
drop policy if exists routine_event_completions_select on public.routine_event_transfer_completions;
create policy routine_event_completions_select on public.routine_event_transfer_completions for select to authenticated
  using(public.routine_event_transfer_is_visible(transfer_id,organization_id));
drop policy if exists routine_event_transfers_recipient_select on public.routine_run_transfers;
create policy routine_event_transfers_recipient_select on public.routine_run_transfers for select to authenticated
  using(target_type='event_operation' and public.routine_event_transfer_is_visible(id,organization_id));

revoke all on public.routine_bundles,public.routine_bundle_runs,public.routine_bundle_participants,
  public.routine_bundle_steps,public.routine_bundle_operations,public.routine_bundle_reassignments,
  public.routine_run_external_context_states,public.routine_run_external_context_resolutions,
  public.routine_event_transfer_acceptances,public.routine_event_transfer_completions from anon,authenticated;
grant select on public.routine_bundles,public.routine_bundle_runs,public.routine_bundle_participants,
  public.routine_bundle_steps,public.routine_bundle_reassignments,public.routine_run_external_context_states,
  public.routine_run_external_context_resolutions,public.routine_event_transfer_acceptances,
  public.routine_event_transfer_completions to authenticated;
grant select on public.routine_bundle_operations to authenticated;

revoke all on function public.routine_phase10h_uuid(text),
  public.routine_bundle_reassignment_validate(),public.routine_event_acceptance_guard(),
  public.routine_event_completion_guard(),
  public.routine_bundle_operation_replay(uuid,uuid,text,uuid,text),
  public.routine_record_bundle_operation(uuid,uuid,text,uuid,text,text,uuid,jsonb),
  public.routine_current_user_event_transfer_authority(text),public.routine_bundle_is_visible(uuid,uuid),
  public.routine_event_transfer_is_visible(uuid,uuid),
  public.routine_record_bundle_event(uuid,uuid,text,text,uuid,uuid,text,text,jsonb,uuid,integer),
  public.routine_validate_event_context_source_config(jsonb),public.routine_event_operation_summary(text,uuid),
  public.routine_build_event_context_payload(uuid,uuid),public.routine_compute_event_context_hash(jsonb,jsonb),
  public.routine_resolve_run_event_context(uuid,text),public.routine_phase10h_actor(),
  public.routine_compute_event_transfer_acceptance_hash(jsonb),public.routine_compute_event_transfer_completion_hash(jsonb),
  public.routine_get_current_event_transfer_authorization(uuid),
  public.routine_validate_event_transfer_evidence(uuid,text,jsonb,boolean,boolean,text),
  public.routine_event_transfer_reported_status(text),public.routine_build_event_transfer_delivery_evidence(uuid),
  public.routine_validate_run_completion_core(uuid),public.routine_validate_run_completion_core_phase10e(uuid),
  public.routine_get_bundle_transition_instant(uuid,uuid),public.routine_build_double_shift_change_feed(uuid,uuid),
  public.routine_compute_double_shift_change_feed_hash(jsonb),public.routine_ensure_run_participant(uuid,uuid,uuid,uuid),
  public.routine_ensure_bundle_participant(uuid,uuid,uuid,uuid),
  public.routine_ensure_closing_bundle_participant(uuid,uuid,uuid,uuid),
  public.routine_double_shift_personal_outcome(uuid),public.routine_reconcile_double_shift_bundle(uuid),
  public.routine_reconcile_double_shift_for_run(uuid) from public,anon,authenticated;

revoke all on function public.create_or_get_double_shift_bundle(text,text,text,date,uuid),
  public.confirm_double_shift_plan(uuid,uuid,time,bigint,bigint,uuid),
  public.complete_double_shift_opening_transition(uuid,uuid,text,time,uuid,text,bigint,bigint,uuid),
  public.get_double_shift_change_feed(uuid,uuid),public.return_to_double_shift(uuid,uuid,text,bigint,bigint,uuid),
  public.reassign_double_shift_closing(uuid,uuid,uuid,text,bigint,uuid),
  public.refresh_routine_run_external_context(uuid,uuid),public.accept_routine_event_transfer(uuid,bigint,uuid),
  public.reject_routine_event_transfer(uuid,text,bigint,uuid),
  public.complete_routine_event_transfer(uuid,text,jsonb,boolean,boolean,text,bigint,uuid),
  public.get_routine_event_transfer_workspace(uuid),public.get_double_shift_workspace(uuid),
  public.list_double_shift_bundles_for_date(date),public.get_double_shift_participant_summary(uuid),
  public.verify_double_shift_bundle(uuid) from public,anon;
grant execute on function public.create_or_get_double_shift_bundle(text,text,text,date,uuid),
  public.confirm_double_shift_plan(uuid,uuid,time,bigint,bigint,uuid),
  public.complete_double_shift_opening_transition(uuid,uuid,text,time,uuid,text,bigint,bigint,uuid),
  public.get_double_shift_change_feed(uuid,uuid),public.return_to_double_shift(uuid,uuid,text,bigint,bigint,uuid),
  public.reassign_double_shift_closing(uuid,uuid,uuid,text,bigint,uuid),
  public.refresh_routine_run_external_context(uuid,uuid),public.accept_routine_event_transfer(uuid,bigint,uuid),
  public.reject_routine_event_transfer(uuid,text,bigint,uuid),
  public.complete_routine_event_transfer(uuid,text,jsonb,boolean,boolean,text,bigint,uuid),
  public.get_routine_event_transfer_workspace(uuid),public.get_double_shift_workspace(uuid),
  public.list_double_shift_bundles_for_date(date),public.get_double_shift_participant_summary(uuid),
  public.verify_double_shift_bundle(uuid) to authenticated;
grant execute on function public.routine_bundle_is_visible(uuid,uuid),
  public.routine_event_transfer_is_visible(uuid,uuid) to authenticated;

-- Recreated public wrappers must establish their final ACL on first install.
revoke all on function public.validate_routine_template_version(uuid,uuid[]),
  public.routine_bundle_guard(),public.routine_bundle_step_guard(),public.routine_bundle_run_validate(),
  public.routine_external_state_guard(),public.routine_phase10h_immutable_guard(),
  public.routine_resolve_condition_fact(uuid,jsonb,timestamptz),
  public.propose_routine_transfer(uuid,text,text,uuid,uuid,text,text,timestamptz,bigint,uuid),
  public.routine_delivery_item_canonical_json(uuid),public.routine_delivery_record_canonical_json(uuid),
  public.routine_preview_delivery_item_canonical(jsonb),public.routine_preview_run_delivery(uuid),
  public.routine_finalize_run_extension(uuid),public.reopen_routine_run(uuid,text,bigint,uuid),
  public.cancel_routine_run(uuid,text,bigint,uuid),public.get_routine_run_workspace(uuid),
  public.get_routine_run_timeline(uuid),public.get_routine_task_timeline(uuid),
  public.get_routine_delivery_record(uuid) from public,anon,authenticated;
grant execute on function public.validate_routine_template_version(uuid,uuid[]),
  public.propose_routine_transfer(uuid,text,text,uuid,uuid,text,text,timestamptz,bigint,uuid),
  public.reopen_routine_run(uuid,text,bigint,uuid),public.cancel_routine_run(uuid,text,bigint,uuid),
  public.get_routine_run_workspace(uuid),public.get_routine_run_timeline(uuid),
  public.get_routine_task_timeline(uuid),public.get_routine_delivery_record(uuid) to authenticated;

do $phase10h_reload$
begin perform pg_notify('pgrst','reload schema'); exception when others then null; end;
$phase10h_reload$;

-- Phase 10F: Europe/Oslo Operational Date and Timing Engine.
--
-- Apply after Phase 10A through Phase 10E. This migration is additive and
-- contains no organization activation, routine content, production data, or
-- writes to Inventory, Asset, Event Operations, Auth configuration, legacy
-- routine tables, or Storage.

alter table public.routine_organization_settings
  add column if not exists flags jsonb not null default '{}'::jsonb,
  add column if not exists time_engine_version text not null default 'phase10f-v1';

create or replace function public.routine_flags_are_valid(input_flags jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select jsonb_typeof(input_flags) = 'object'
    and octet_length(input_flags::text) <= 20000
    and not exists (
      select 1
      from jsonb_each(input_flags) entry
      where entry.key !~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
         or char_length(entry.key) > 80
         or jsonb_typeof(entry.value) not in ('boolean', 'string', 'number', 'null')
         or (jsonb_typeof(entry.value) = 'string' and char_length(entry.value #>> '{}') > 1000)
         or (jsonb_typeof(entry.value) = 'number'
             and (entry.value::text ~* '(nan|infinity)' or length(entry.value::text) > 100))
    )
$$;

do $phase10f_settings_constraints$
begin
  if not exists (select 1 from pg_catalog.pg_constraint
    where conname = 'routine_organization_settings_flags_check'
      and conrelid = 'public.routine_organization_settings'::regclass) then
    alter table public.routine_organization_settings
      add constraint routine_organization_settings_flags_check
      check (public.routine_flags_are_valid(flags));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
    where conname = 'routine_organization_settings_time_engine_check'
      and conrelid = 'public.routine_organization_settings'::regclass) then
    alter table public.routine_organization_settings
      add constraint routine_organization_settings_time_engine_check
      check (time_engine_version = trim(time_engine_version)
        and char_length(time_engine_version) between 1 and 80);
  end if;
end;
$phase10f_settings_constraints$;

alter table public.routine_run_tasks
  add column if not exists core_inclusion_state_snapshot text;
alter table public.routine_run_condition_evaluations
  add column if not exists core_evaluation_state_snapshot text,
  add column if not exists core_facts_snapshot jsonb,
  add column if not exists core_evaluator_version_snapshot text,
  add column if not exists core_error_message_snapshot text;

-- Backfill the newly introduced immutable shadow without treating the one-time
-- migration as an operational task transition.
alter table public.routine_run_tasks disable trigger routine_run_tasks_guard;
update public.routine_run_tasks
set core_inclusion_state_snapshot = inclusion_state
where core_inclusion_state_snapshot is null;
alter table public.routine_run_tasks enable trigger routine_run_tasks_guard;
select set_config('mesh.routine_run_internal','phase10f_core_backfill',true);
update public.routine_run_condition_evaluations
set core_evaluation_state_snapshot = evaluation_state,
    core_facts_snapshot = facts_snapshot,
    core_evaluator_version_snapshot = evaluator_version,
    core_error_message_snapshot = error_message
where core_evaluation_state_snapshot is null;
select set_config('mesh.routine_run_internal','',true);

alter table public.routine_run_tasks
  alter column core_inclusion_state_snapshot set not null;
alter table public.routine_run_condition_evaluations
  alter column core_evaluation_state_snapshot set not null,
  alter column core_facts_snapshot set not null;

create or replace function public.routine_capture_task_core_inclusion_snapshot()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.core_inclusion_state_snapshot := new.inclusion_state;
  return new;
end;
$$;

create or replace function public.routine_capture_condition_core_snapshot()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.core_evaluation_state_snapshot := new.evaluation_state;
  new.core_facts_snapshot := new.facts_snapshot;
  new.core_evaluator_version_snapshot := new.evaluator_version;
  new.core_error_message_snapshot := new.error_message;
  return new;
end;
$$;

drop trigger if exists routine_run_tasks_core_snapshot on public.routine_run_tasks;
create trigger routine_run_tasks_core_snapshot before insert on public.routine_run_tasks
for each row execute function public.routine_capture_task_core_inclusion_snapshot();
drop trigger if exists routine_run_conditions_core_snapshot on public.routine_run_condition_evaluations;
create trigger routine_run_conditions_core_snapshot before insert on public.routine_run_condition_evaluations
for each row execute function public.routine_capture_condition_core_snapshot();

-- Preserve the exact Phase 10D hash contract while condition and inclusion
-- projections advance. At initial snapshot time these replacements are
-- byte-for-byte equal to the original canonical values.
create or replace function public.routine_compute_run_snapshot_hash(input_run_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with original as (
    select public.routine_run_snapshot_canonical_json(input_run_id) value
  ), stable_tasks as (
    select coalesce(jsonb_agg(
      jsonb_set(element.value, '{inclusionState}', to_jsonb(task.core_inclusion_state_snapshot), false)
      order by element.ordinality
    ), '[]'::jsonb) value
    from original
    cross join lateral jsonb_array_elements(original.value->'tasks') with ordinality element(value, ordinality)
    join public.routine_run_tasks task
      on task.run_id = input_run_id and task.task_key_snapshot = element.value->>'key'
  ), stable_conditions as (
    select coalesce(jsonb_agg(
      jsonb_set(jsonb_set(jsonb_set(jsonb_set(
        element.value,
        '{state}', to_jsonb(condition.core_evaluation_state_snapshot), false),
        '{facts}', condition.core_facts_snapshot, false),
        '{evaluatorVersion}', coalesce(to_jsonb(condition.core_evaluator_version_snapshot), 'null'::jsonb), false),
        '{error}', coalesce(to_jsonb(condition.core_error_message_snapshot), 'null'::jsonb), false)
      order by element.ordinality
    ), '[]'::jsonb) value
    from original
    cross join lateral jsonb_array_elements(original.value->'conditions') with ordinality element(value, ordinality)
    join public.routine_run_tasks task
      on task.run_id = input_run_id and task.task_key_snapshot = element.value->>'taskKey'
    join public.routine_run_condition_evaluations condition on condition.run_task_id = task.id
  )
  select public.routine_run_sha256(
    jsonb_set(jsonb_set(original.value, '{tasks}', stable_tasks.value, false),
      '{conditions}', stable_conditions.value, false)
  )
  from original, stable_tasks, stable_conditions
$$;

create table if not exists public.routine_run_operational_contexts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  run_id uuid not null,
  timezone_snapshot text not null,
  operational_day_cutoff_snapshot time without time zone not null,
  operational_date_snapshot date not null,
  date_source text not null,
  resolution_instant timestamptz not null,
  local_timestamp_snapshot timestamp without time zone not null,
  local_date_snapshot date not null,
  local_time_snapshot time without time zone not null,
  local_iso_weekday_snapshot smallint not null,
  settings_revision_snapshot bigint not null,
  organization_flags_snapshot jsonb not null,
  time_engine_version_snapshot text not null,
  context_hash text not null,
  created_at timestamptz not null default now(),
  constraint routine_run_operational_contexts_run_fkey
    foreign key (run_id, organization_id) references public.routine_runs(id, organization_id),
  constraint routine_run_operational_contexts_run_unique unique (run_id),
  constraint routine_run_operational_contexts_identity_unique unique (id, organization_id, run_id),
  constraint routine_run_operational_contexts_timezone_check check (timezone_snapshot = 'Europe/Oslo'),
  constraint routine_run_operational_contexts_source_check check
    (date_source in ('derived','explicit','superseded_copy','legacy_backfill')),
  constraint routine_run_operational_contexts_weekday_check check (local_iso_weekday_snapshot between 1 and 7),
  constraint routine_run_operational_contexts_settings_revision_check check (settings_revision_snapshot > 0),
  constraint routine_run_operational_contexts_flags_check check (public.routine_flags_are_valid(organization_flags_snapshot)),
  constraint routine_run_operational_contexts_version_check check
    (time_engine_version_snapshot = trim(time_engine_version_snapshot) and char_length(time_engine_version_snapshot) between 1 and 80),
  constraint routine_run_operational_contexts_hash_check check (context_hash ~ '^[0-9a-f]{64}$')
);

alter table public.routine_runs
  add column if not exists operational_context_id uuid,
  add column if not exists timing_snapshot_state text not null default 'building',
  add column if not exists timing_snapshot_hash text,
  add column if not exists time_engine_version_snapshot text;

do $phase10f_run_constraints$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'routine_runs_operational_context_fkey') then
    alter table public.routine_runs add constraint routine_runs_operational_context_fkey
      foreign key (operational_context_id, organization_id, id)
      references public.routine_run_operational_contexts(id, organization_id, run_id)
      deferrable initially deferred;
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'routine_runs_timing_state_check') then
    alter table public.routine_runs add constraint routine_runs_timing_state_check
      check (timing_snapshot_state in ('building','ready','invalid'));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'routine_runs_timing_snapshot_check') then
    alter table public.routine_runs add constraint routine_runs_timing_snapshot_check check (
      (timing_snapshot_state = 'building' and timing_snapshot_hash is null)
      or (timing_snapshot_state = 'ready' and operational_context_id is not null
          and timing_snapshot_hash ~ '^[0-9a-f]{64}$'
          and nullif(trim(time_engine_version_snapshot), '') is not null)
      or timing_snapshot_state = 'invalid'
    );
  end if;
end;
$phase10f_run_constraints$;

create table if not exists public.routine_run_task_timings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  run_id uuid not null,
  task_id uuid not null,
  operational_context_id uuid not null,
  availability_mode_snapshot text not null,
  visible_day_offset_snapshot integer not null,
  visible_local_time_snapshot time without time zone,
  visible_at timestamptz,
  start_day_offset_snapshot integer not null,
  start_local_time_snapshot time without time zone,
  start_at timestamptz,
  target_day_offset_snapshot integer not null,
  target_local_time_snapshot time without time zone,
  target_at timestamptz,
  overdue_day_offset_snapshot integer not null,
  overdue_local_time_snapshot time without time zone,
  overdue_at timestamptz,
  hard_deadline_day_offset_snapshot integer not null,
  hard_deadline_local_time_snapshot time without time zone,
  hard_deadline_at timestamptz,
  resolution_details jsonb not null default '{}'::jsonb,
  schedule_state text not null,
  timing_snapshot_hash text not null,
  created_at timestamptz not null default now(),
  current_phase text not null,
  last_evaluated_at timestamptz,
  first_visible_at timestamptz,
  first_available_at timestamptz,
  first_due_at timestamptz,
  first_overdue_at timestamptz,
  first_hard_deadline_at timestamptz,
  completion_phase text,
  completion_lateness_seconds bigint,
  hard_deadline_deviation_id uuid,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by_auth_user_id uuid references auth.users(id),
  constraint routine_run_task_timings_run_fkey foreign key (run_id, organization_id)
    references public.routine_runs(id, organization_id),
  constraint routine_run_task_timings_task_fkey foreign key (task_id, organization_id, run_id)
    references public.routine_run_tasks(id, organization_id, run_id),
  constraint routine_run_task_timings_context_fkey
    foreign key (operational_context_id, organization_id, run_id)
    references public.routine_run_operational_contexts(id, organization_id, run_id),
  constraint routine_run_task_timings_task_unique unique (task_id),
  constraint routine_run_task_timings_run_task_unique unique (run_id, task_id),
  constraint routine_run_task_timings_identity_unique unique (id, organization_id, run_id, task_id),
  constraint routine_run_task_timings_schedule_check check (schedule_state in ('not_scheduled','resolved','invalid')),
  constraint routine_run_task_timings_phase_check check (current_phase in (
    'unscheduled','pending_condition','excluded','hidden','upcoming','available','due','overdue',
    'hard_deadline_passed','handled','cancelled')),
  constraint routine_run_task_timings_completion_phase_check check (completion_phase is null or completion_phase in (
    'before_target','on_time','due','overdue','after_hard_deadline')),
  constraint routine_run_task_timings_resolution_check check (jsonb_typeof(resolution_details) = 'object'),
  constraint routine_run_task_timings_hash_check check (timing_snapshot_hash ~ '^[0-9a-f]{64}$'),
  constraint routine_run_task_timings_lateness_check check (completion_lateness_seconds is null or completion_lateness_seconds >= 0),
  constraint routine_run_task_timings_revision_check check (revision > 0)
);

alter table public.routine_deviations add column if not exists blocking boolean not null default true;
alter table public.routine_deviations alter column detected_by_auth_user_id drop not null;
alter table public.routine_deviations drop constraint if exists routine_deviations_source_check;
alter table public.routine_deviations add constraint routine_deviations_source_check check (source_type in (
  'initial_check','control_result','blocked_task','opening_closing_mismatch','equipment_issue',
  'stock_issue','manager_override','manual','timing_issue'
));

do $phase10f_timing_deviation_fkey$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'routine_run_task_timings_deviation_fkey') then
    alter table public.routine_run_task_timings add constraint routine_run_task_timings_deviation_fkey
      foreign key (hard_deadline_deviation_id, organization_id, run_id, task_id)
      references public.routine_deviations(id, organization_id, run_id, task_id)
      deferrable initially deferred;
  end if;
end;
$phase10f_timing_deviation_fkey$;

create unique index if not exists routine_deviations_one_open_hard_deadline_idx
  on public.routine_deviations(task_id)
  where source_type = 'timing_issue' and reason_code = 'hard_deadline_missed'
    and status in ('open','mitigated','accepted_temporarily');

create table if not exists public.routine_run_date_supersessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  original_run_id uuid not null,
  replacement_run_id uuid not null,
  original_operational_date date not null,
  replacement_operational_date date not null,
  reason text not null,
  operation_id uuid not null,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  created_by_name_snapshot text not null,
  constraint routine_run_date_supersessions_original_fkey
    foreign key (original_run_id, organization_id) references public.routine_runs(id, organization_id),
  constraint routine_run_date_supersessions_replacement_fkey
    foreign key (replacement_run_id, organization_id) references public.routine_runs(id, organization_id),
  constraint routine_run_date_supersessions_operation_fkey
    foreign key (operation_id, organization_id) references public.routine_run_operations(id, organization_id)
    deferrable initially deferred,
  constraint routine_run_date_supersessions_identity_unique unique (id, organization_id, original_run_id),
  constraint routine_run_date_supersessions_original_unique unique (original_run_id),
  constraint routine_run_date_supersessions_runs_check check (original_run_id <> replacement_run_id),
  constraint routine_run_date_supersessions_dates_check check (original_operational_date <> replacement_operational_date),
  constraint routine_run_date_supersessions_reason_check check
    (char_length(trim(reason)) between 1 and 4000 and char_length(trim(created_by_name_snapshot)) between 1 and 200)
);

create index if not exists routine_run_operational_contexts_org_run_idx
  on public.routine_run_operational_contexts(organization_id, run_id);
create index if not exists routine_run_task_timings_run_phase_idx
  on public.routine_run_task_timings(run_id, current_phase, task_id);
create index if not exists routine_run_task_timings_context_idx
  on public.routine_run_task_timings(operational_context_id, organization_id, run_id);
create index if not exists routine_run_task_timings_deviation_idx
  on public.routine_run_task_timings(hard_deadline_deviation_id, organization_id, run_id, task_id)
  where hard_deadline_deviation_id is not null;
create index if not exists routine_run_date_supersessions_replacement_idx
  on public.routine_run_date_supersessions(replacement_run_id, organization_id);

create or replace function public.routine_operational_context_immutable_guard()
returns trigger language plpgsql set search_path = pg_catalog
as $$ begin raise exception using errcode='P0001', message='Routine operational contexts are immutable.'; end $$;

create or replace function public.routine_run_date_supersession_immutable_guard()
returns trigger language plpgsql set search_path = pg_catalog
as $$ begin raise exception using errcode='P0001', message='Routine run date supersessions are immutable.'; end $$;

create or replace function public.routine_run_task_timing_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode='P0001', message='Routine task timings cannot be deleted.';
  end if;
  if row(new.organization_id,new.run_id,new.task_id,new.operational_context_id,
      new.availability_mode_snapshot,new.visible_day_offset_snapshot,new.visible_local_time_snapshot,new.visible_at,
      new.start_day_offset_snapshot,new.start_local_time_snapshot,new.start_at,new.target_day_offset_snapshot,
      new.target_local_time_snapshot,new.target_at,new.overdue_day_offset_snapshot,new.overdue_local_time_snapshot,
      new.overdue_at,new.hard_deadline_day_offset_snapshot,new.hard_deadline_local_time_snapshot,
      new.hard_deadline_at,new.resolution_details,new.schedule_state,new.timing_snapshot_hash,new.created_at)
    is distinct from
    row(old.organization_id,old.run_id,old.task_id,old.operational_context_id,
      old.availability_mode_snapshot,old.visible_day_offset_snapshot,old.visible_local_time_snapshot,old.visible_at,
      old.start_day_offset_snapshot,old.start_local_time_snapshot,old.start_at,old.target_day_offset_snapshot,
      old.target_local_time_snapshot,old.target_at,old.overdue_day_offset_snapshot,old.overdue_local_time_snapshot,
      old.overdue_at,old.hard_deadline_day_offset_snapshot,old.hard_deadline_local_time_snapshot,
      old.hard_deadline_at,old.resolution_details,old.schedule_state,old.timing_snapshot_hash,old.created_at) then
    raise exception using errcode='P0001', message='Routine task timing snapshot fields are immutable.';
  end if;
  if current_setting('mesh.routine_run_internal',true) is null then
    raise exception using errcode='P0001', message='Routine task timing projections require an authorized RPC.';
  end if;
  if new.revision <= old.revision then
    raise exception using errcode='P0001', message='Routine task timing revision must increase.';
  end if;
  if (old.first_visible_at is not null and new.first_visible_at is distinct from old.first_visible_at)
    or (old.first_available_at is not null and new.first_available_at is distinct from old.first_available_at)
    or (old.first_due_at is not null and new.first_due_at is distinct from old.first_due_at)
    or (old.first_overdue_at is not null and new.first_overdue_at is distinct from old.first_overdue_at)
    or (old.first_hard_deadline_at is not null and new.first_hard_deadline_at is distinct from old.first_hard_deadline_at) then
    raise exception using errcode='P0001', message='Routine timing first-crossing timestamps are write-once.';
  end if;
  if row(new.completion_phase,new.completion_lateness_seconds)
     is distinct from row(old.completion_phase,old.completion_lateness_seconds)
     and current_setting('mesh.routine_run_internal',true) not in ('timing_completion','timing_reopen','system_completion') then
    raise exception using errcode='P0001', message='Routine timing completion projection requires the lifecycle hook.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists routine_run_operational_contexts_guard on public.routine_run_operational_contexts;
create trigger routine_run_operational_contexts_guard before update or delete on public.routine_run_operational_contexts
for each row execute function public.routine_operational_context_immutable_guard();
drop trigger if exists routine_run_task_timings_guard on public.routine_run_task_timings;
create trigger routine_run_task_timings_guard before update or delete on public.routine_run_task_timings
for each row execute function public.routine_run_task_timing_guard();
drop trigger if exists routine_run_date_supersessions_guard on public.routine_run_date_supersessions;
create trigger routine_run_date_supersessions_guard before update or delete on public.routine_run_date_supersessions
for each row execute function public.routine_run_date_supersession_immutable_guard();

create or replace function public.routine_get_organization_time_settings(input_organization_id uuid)
returns table (
  timezone text,
  operational_day_cutoff time without time zone,
  settings_revision bigint,
  organization_flags jsonb,
  time_engine_version text
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  return query
  select settings.timezone, settings.operational_day_cutoff, settings.revision,
    settings.flags, settings.time_engine_version
  from public.routine_organization_settings settings
  where settings.organization_id = input_organization_id;
  if not found then
    raise exception using errcode='P0001',
      message='Routine organization time settings are required.';
  end if;
end;
$$;

create or replace function public.routine_derive_operational_date(
  input_organization_id uuid,
  input_effective_at timestamptz
)
returns table (
  operational_date date,
  timezone text,
  cutoff time without time zone,
  local_timestamp timestamp without time zone,
  local_date date,
  local_time time without time zone,
  local_iso_weekday smallint,
  settings_revision bigint,
  organization_flags jsonb,
  time_engine_version text
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_settings record;
  v_local timestamp without time zone;
begin
  if input_organization_id is null or input_effective_at is null then
    raise exception using errcode='P0001', message='Organization and server instant are required.';
  end if;
  select * into v_settings from public.routine_get_organization_time_settings(input_organization_id);
  if v_settings.timezone <> 'Europe/Oslo' then
    raise exception using errcode='P0001', message='Europe/Oslo routine time settings are required.';
  end if;
  v_local := input_effective_at at time zone v_settings.timezone;
  return query select
    case when v_local::time < v_settings.operational_day_cutoff
      then v_local::date - 1 else v_local::date end,
    v_settings.timezone, v_settings.operational_day_cutoff, v_local,
    v_local::date, v_local::time,
    extract(isodow from v_local)::smallint,
    v_settings.settings_revision, v_settings.organization_flags,
    v_settings.time_engine_version;
end;
$$;

create or replace function public.routine_compute_operational_context_hash(
  input_run_id uuid,
  input_operational_date date,
  input_timezone text,
  input_cutoff time without time zone,
  input_date_source text,
  input_resolution_instant timestamptz,
  input_local_timestamp timestamp without time zone,
  input_settings_revision bigint,
  input_flags jsonb,
  input_time_engine_version text
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select public.routine_run_sha256(jsonb_build_object(
    'runId', input_run_id,
    'operationalDate', input_operational_date,
    'timezone', input_timezone,
    'cutoff', input_cutoff,
    'dateSource', input_date_source,
    'resolutionInstant', input_resolution_instant,
    'localTimestamp', input_local_timestamp,
    'settingsRevision', input_settings_revision,
    'flags', input_flags,
    'timeEngineVersion', input_time_engine_version
  ))
$$;

create or replace function public.routine_build_operational_context(
  input_run_id uuid,
  input_date_source text,
  input_resolution_instant timestamptz
)
returns public.routine_run_operational_contexts
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_run public.routine_runs%rowtype;
  v_derived record;
  v_context public.routine_run_operational_contexts%rowtype;
  v_hash text;
begin
  if input_date_source not in ('derived','explicit','superseded_copy','legacy_backfill')
     or input_resolution_instant is null then
    raise exception using errcode='P0001', message='Valid operational date source and server instant are required.';
  end if;
  select run.* into v_run from public.routine_runs run where run.id=input_run_id for update;
  if v_run.id is null then raise exception using errcode='P0001', message='Routine run was not found.'; end if;
  select context.* into v_context from public.routine_run_operational_contexts context
    where context.run_id=v_run.id;
  if v_context.id is not null then return v_context; end if;
  select * into v_derived from public.routine_derive_operational_date(v_run.organization_id,input_resolution_instant);
  v_hash := public.routine_compute_operational_context_hash(
    v_run.id,v_run.operational_date,v_derived.timezone,v_derived.cutoff,input_date_source,
    input_resolution_instant,v_derived.local_timestamp,v_derived.settings_revision,
    v_derived.organization_flags,v_derived.time_engine_version
  );
  insert into public.routine_run_operational_contexts(
    organization_id,run_id,timezone_snapshot,operational_day_cutoff_snapshot,
    operational_date_snapshot,date_source,resolution_instant,local_timestamp_snapshot,
    local_date_snapshot,local_time_snapshot,local_iso_weekday_snapshot,
    settings_revision_snapshot,organization_flags_snapshot,time_engine_version_snapshot,context_hash
  ) values (
    v_run.organization_id,v_run.id,v_derived.timezone,v_derived.cutoff,
    v_run.operational_date,input_date_source,input_resolution_instant,v_derived.local_timestamp,
    v_derived.local_date,v_derived.local_time,v_derived.local_iso_weekday,
    v_derived.settings_revision,v_derived.organization_flags,v_derived.time_engine_version,v_hash
  ) returning * into v_context;
  return v_context;
end;
$$;

create or replace function public.routine_resolve_local_schedule_instant(
  input_operational_date date,
  input_day_offset integer,
  input_local_time time without time zone,
  input_timezone text,
  input_boundary_kind text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_requested timestamp without time zone;
  v_probe timestamp without time zone;
  v_candidates timestamptz[];
  v_candidate timestamptz;
  v_shift integer := 0;
  v_step integer;
  v_count integer := 0;
  v_kind text;
begin
  if input_operational_date is null or input_day_offset is null or input_local_time is null
     or input_timezone <> 'Europe/Oslo'
     or input_boundary_kind not in ('visible','start','target','overdue','hard_deadline')
     or input_day_offset not between -7 and 31 then
    raise exception using errcode='P0001', message='Invalid local schedule resolver input.';
  end if;
  v_requested := input_operational_date::timestamp
    + make_interval(days=>input_day_offset) + input_local_time;
  for v_step in 0..180 loop
    v_shift := v_step;
    v_probe := v_requested + make_interval(mins=>v_step);
    select array_agg(candidate order by candidate), count(*)
      into v_candidates, v_count
    from (
      select candidate
      from (
        select (v_probe at time zone 'UTC') + make_interval(mins=>offset_minute) candidate
        from generate_series(-180,180) offset_minute
      ) possibilities
      where candidate at time zone input_timezone = v_probe
      group by candidate
    ) exact_candidates;
    exit when v_count > 0;
  end loop;
  if v_count = 0 then
    return jsonb_build_object('instant',null,'resolutionKind','invalid','shiftedMinutes',null,
      'candidateCount',0,'requestedLocalTimestamp',v_requested,'resolvedLocalTimestamp',null);
  end if;
  if v_shift > 0 then
    v_candidate := v_candidates[1]; v_kind := 'shifted_forward';
  elsif v_count = 1 then
    v_candidate := v_candidates[1]; v_kind := 'exact';
  elsif input_boundary_kind in ('visible','start') then
    v_candidate := v_candidates[1]; v_kind := 'ambiguous_earliest';
  else
    v_candidate := v_candidates[array_length(v_candidates,1)]; v_kind := 'ambiguous_latest';
  end if;
  return jsonb_build_object(
    'instant',v_candidate,'resolutionKind',v_kind,'shiftedMinutes',v_shift,
    'candidateCount',v_count,'requestedLocalTimestamp',v_requested,
    'resolvedLocalTimestamp',v_candidate at time zone input_timezone,
    'roundTripValid',(v_candidate at time zone input_timezone)=v_probe
  );
end;
$$;

create or replace function public.routine_absent_schedule_resolution()
returns jsonb language sql immutable set search_path=pg_catalog
as $$ select jsonb_build_object('instant',null,'resolutionKind','absent','shiftedMinutes',0,'candidateCount',0) $$;

create or replace function public.routine_compute_task_timing_hash(input_payload jsonb)
returns text language sql immutable set search_path=pg_catalog
as $$ select public.routine_run_sha256(input_payload) $$;

create or replace function public.routine_compute_run_timing_snapshot_hash(input_run_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select public.routine_run_sha256(jsonb_build_object(
    'operationalContextHash',context.context_hash,
    'tasks',coalesce((
      select jsonb_agg(jsonb_build_object(
        'taskKey',task.task_key_snapshot,
        'availabilityMode',timing.availability_mode_snapshot,
        'visibleDayOffset',timing.visible_day_offset_snapshot,
        'visibleLocalTime',timing.visible_local_time_snapshot,
        'visibleAt',timing.visible_at,
        'startDayOffset',timing.start_day_offset_snapshot,
        'startLocalTime',timing.start_local_time_snapshot,
        'startAt',timing.start_at,
        'targetDayOffset',timing.target_day_offset_snapshot,
        'targetLocalTime',timing.target_local_time_snapshot,
        'targetAt',timing.target_at,
        'overdueDayOffset',timing.overdue_day_offset_snapshot,
        'overdueLocalTime',timing.overdue_local_time_snapshot,
        'overdueAt',timing.overdue_at,
        'hardDeadlineDayOffset',timing.hard_deadline_day_offset_snapshot,
        'hardDeadlineLocalTime',timing.hard_deadline_local_time_snapshot,
        'hardDeadlineAt',timing.hard_deadline_at,
        'resolutionDetails',timing.resolution_details,
        'scheduleState',timing.schedule_state,
        'rowHash',timing.timing_snapshot_hash
      ) order by task.task_key_snapshot)
      from public.routine_run_task_timings timing
      join public.routine_run_tasks task on task.id=timing.task_id
      where timing.run_id=input_run_id
    ),'[]'::jsonb)
  ))
  from public.routine_run_operational_contexts context
  where context.run_id=input_run_id
$$;

create or replace function public.routine_validate_operational_context_insert()
returns trigger
language plpgsql
set search_path=pg_catalog
as $$
declare v_date date;
begin
  select run.operational_date into v_date from public.routine_runs run
    where run.id=new.run_id and run.organization_id=new.organization_id;
  if v_date is distinct from new.operational_date_snapshot then
    raise exception using errcode='P0001', message='Operational context date must equal the run operational date.';
  end if;
  return new;
end;
$$;
drop trigger if exists routine_run_operational_contexts_validate on public.routine_run_operational_contexts;
create trigger routine_run_operational_contexts_validate before insert on public.routine_run_operational_contexts
for each row execute function public.routine_validate_operational_context_insert();

create or replace function public.routine_compute_task_timing_phase(
  input_task_id uuid,
  input_effective_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_task public.routine_run_tasks%rowtype;
  v_timing public.routine_run_task_timings%rowtype;
  v_condition public.routine_run_condition_evaluations%rowtype;
  v_phase text;
  v_next timestamptz;
  v_late bigint := 0;
  v_reason text;
begin
  if input_effective_at is null then
    raise exception using errcode='P0001', message='A server timing instant is required.';
  end if;
  select task.* into v_task from public.routine_run_tasks task where task.id=input_task_id;
  select timing.* into v_timing from public.routine_run_task_timings timing where timing.task_id=input_task_id;
  if v_task.id is null or v_timing.id is null then
    return jsonb_build_object('phase','unscheduled','reasonCode','routine_task_timing_unavailable',
      'nextBoundaryAt',null,'secondsUntilNextBoundary',null,'secondsLate',0,
      'canClaim',false,'canStart',false,'canComplete',false);
  end if;
  select condition.* into v_condition from public.routine_run_condition_evaluations condition
    where condition.run_task_id=v_task.id;
  if v_task.inclusion_state='excluded' then v_phase:='excluded'; v_reason:='routine_task_excluded';
  elsif v_condition.evaluation_state in ('pending','error') then v_phase:='pending_condition'; v_reason:='routine_task_condition_pending';
  elsif v_task.status in ('completed','not_applicable','transferred') then v_phase:='handled'; v_reason:='routine_task_handled';
  elsif v_task.status='cancelled' then v_phase:='cancelled'; v_reason:='routine_task_cancelled';
  elsif v_timing.schedule_state='invalid' then v_phase:='unscheduled'; v_reason:='timing_snapshot_invalid';
  elsif v_timing.schedule_state='not_scheduled' then v_phase:='available'; v_reason:='available';
  elsif v_timing.visible_at is not null and input_effective_at < v_timing.visible_at then v_phase:='hidden'; v_reason:='routine_task_hidden';
  elsif v_timing.start_at is not null and input_effective_at < v_timing.start_at then v_phase:='upcoming'; v_reason:='routine_task_too_early';
  elsif v_timing.target_at is null or input_effective_at < v_timing.target_at then v_phase:='available'; v_reason:='available';
  elsif v_timing.overdue_at is null or input_effective_at < v_timing.overdue_at then v_phase:='due'; v_reason:='due';
  elsif v_timing.hard_deadline_at is null or input_effective_at < v_timing.hard_deadline_at then v_phase:='overdue'; v_reason:='overdue';
  else v_phase:='hard_deadline_passed'; v_reason:='hard_deadline_passed'; end if;

  select min(boundary) into v_next from unnest(array[
    v_timing.visible_at,v_timing.start_at,v_timing.target_at,v_timing.overdue_at,v_timing.hard_deadline_at
  ]) boundary where boundary > input_effective_at;
  if v_timing.target_at is not null and input_effective_at > v_timing.target_at then
    v_late := greatest(0,floor(extract(epoch from input_effective_at-v_timing.target_at))::bigint);
  end if;
  return jsonb_build_object(
    'phase',v_phase,'nextBoundaryAt',v_next,
    'secondsUntilNextBoundary',case when v_next is null then null
      else greatest(0,ceil(extract(epoch from v_next-input_effective_at))::bigint) end,
    'secondsLate',v_late,
    'canClaim',v_phase in ('upcoming','available','due','overdue','hard_deadline_passed')
      and v_task.status in ('not_started','waiting'),
    'canStart',v_phase in ('available','due','overdue','hard_deadline_passed')
      and v_task.status in ('not_started','waiting'),
    'canComplete',v_phase in ('available','due','overdue','hard_deadline_passed')
      and v_task.status in ('in_progress','blocked'),
    'reasonCode',v_reason
  );
end;
$$;

create or replace function public.routine_build_run_timing_snapshot(
  input_run_id uuid,
  input_date_source text,
  input_resolution_instant timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_run public.routine_runs%rowtype;
  v_context public.routine_run_operational_contexts%rowtype;
  v_task public.routine_run_tasks%rowtype;
  v_visible jsonb; v_start jsonb; v_target jsonb; v_overdue jsonb; v_hard jsonb;
  v_visible_at timestamptz; v_start_at timestamptz; v_target_at timestamptz;
  v_overdue_at timestamptz; v_hard_at timestamptz;
  v_details jsonb; v_schedule text; v_phase text; v_row_hash text; v_run_hash text;
  v_payload jsonb; v_count integer := 0; v_core_hash text;
begin
  if input_resolution_instant is null then
    raise exception using errcode='P0001', message='A server timing snapshot instant is required.';
  end if;
  select run.* into v_run from public.routine_runs run where run.id=input_run_id for update;
  if v_run.id is null or v_run.snapshot_state <> 'ready' then
    raise exception using errcode='P0001', message='A ready core run is required for timing snapshot construction.';
  end if;
  if v_run.timing_snapshot_state='ready' then
    return jsonb_build_object('timingSnapshotHash',v_run.timing_snapshot_hash,
      'taskTimingCount',(select count(*) from public.routine_run_task_timings where run_id=v_run.id),
      'idempotentBuild',true);
  end if;
  if exists(select 1 from public.routine_run_task_timings where run_id=v_run.id)
     or exists(select 1 from public.routine_run_operational_contexts where run_id=v_run.id) then
    raise exception using errcode='P0001', message='Partial timing snapshot state cannot be rebuilt.';
  end if;
  v_core_hash := v_run.snapshot_hash;
  v_context := public.routine_build_operational_context(v_run.id,input_date_source,input_resolution_instant);

  for v_task in select task.* from public.routine_run_tasks task
    where task.run_id=v_run.id order by task.task_key_snapshot,task.id
  loop
    v_visible := case when v_task.visible_from_local_time_snapshot is null
      then public.routine_absent_schedule_resolution()
      else public.routine_resolve_local_schedule_instant(v_run.operational_date,v_task.visible_day_offset_snapshot,
        v_task.visible_from_local_time_snapshot,v_context.timezone_snapshot,'visible') end;
    v_start := case when v_task.start_from_local_time_snapshot is null
      then public.routine_absent_schedule_resolution()
      else public.routine_resolve_local_schedule_instant(v_run.operational_date,v_task.start_day_offset_snapshot,
        v_task.start_from_local_time_snapshot,v_context.timezone_snapshot,'start') end;
    v_target := case when v_task.target_local_time_snapshot is null
      then public.routine_absent_schedule_resolution()
      else public.routine_resolve_local_schedule_instant(v_run.operational_date,v_task.target_day_offset_snapshot,
        v_task.target_local_time_snapshot,v_context.timezone_snapshot,'target') end;
    v_overdue := case when v_task.overdue_local_time_snapshot is null
      then public.routine_absent_schedule_resolution()
      else public.routine_resolve_local_schedule_instant(v_run.operational_date,v_task.overdue_day_offset_snapshot,
        v_task.overdue_local_time_snapshot,v_context.timezone_snapshot,'overdue') end;
    v_hard := case when v_task.hard_deadline_local_time_snapshot is null
      then public.routine_absent_schedule_resolution()
      else public.routine_resolve_local_schedule_instant(v_run.operational_date,v_task.hard_deadline_day_offset_snapshot,
        v_task.hard_deadline_local_time_snapshot,v_context.timezone_snapshot,'hard_deadline') end;
    if 'invalid'=any(array[v_visible->>'resolutionKind',v_start->>'resolutionKind',v_target->>'resolutionKind',
      v_overdue->>'resolutionKind',v_hard->>'resolutionKind']) then
      raise exception using errcode='P0001', message='A local task schedule could not be resolved within 180 minutes.';
    end if;
    v_visible_at := nullif(v_visible->>'instant','')::timestamptz;
    v_start_at := nullif(v_start->>'instant','')::timestamptz;
    v_target_at := nullif(v_target->>'instant','')::timestamptz;
    v_overdue_at := nullif(v_overdue->>'instant','')::timestamptz;
    v_hard_at := nullif(v_hard->>'instant','')::timestamptz;
    if v_task.availability_mode_snapshot='time_window' and v_start_at is null then
      raise exception using errcode='P0001', message='A time-window task requires a resolved start time.';
    end if;
    if v_task.task_type_snapshot='checkpoint' and v_target_at is null then
      raise exception using errcode='P0001', message='A checkpoint task requires a resolved target time.';
    end if;
    if exists (
      select 1 from unnest(array[v_visible_at,v_start_at,v_target_at,v_overdue_at,v_hard_at]) with ordinality a(value,position)
      join unnest(array[v_visible_at,v_start_at,v_target_at,v_overdue_at,v_hard_at]) with ordinality b(value,position)
        on b.position>a.position
      where a.value is not null and b.value is not null and a.value>b.value
    ) then
      raise exception using errcode='P0001', message='Resolved routine task schedule is not monotonic in UTC.';
    end if;
    v_details := jsonb_build_object('visible',v_visible,'start',v_start,'target',v_target,
      'overdue',v_overdue,'hardDeadline',v_hard);
    v_schedule := case when v_visible_at is null and v_start_at is null and v_target_at is null
      and v_overdue_at is null and v_hard_at is null then 'not_scheduled' else 'resolved' end;
    if v_task.inclusion_state='excluded' then v_phase:='excluded';
    elsif exists(select 1 from public.routine_run_condition_evaluations condition
      where condition.run_task_id=v_task.id and condition.evaluation_state in ('pending','error')) then v_phase:='pending_condition';
    elsif v_task.status in ('completed','not_applicable','transferred') then v_phase:='handled';
    elsif v_task.status='cancelled' then v_phase:='cancelled';
    elsif v_schedule='not_scheduled' then v_phase:='available';
    elsif v_visible_at is not null and input_resolution_instant<v_visible_at then v_phase:='hidden';
    elsif v_start_at is not null and input_resolution_instant<v_start_at then v_phase:='upcoming';
    elsif v_target_at is null or input_resolution_instant<v_target_at then v_phase:='available';
    elsif v_overdue_at is null or input_resolution_instant<v_overdue_at then v_phase:='due';
    elsif v_hard_at is null or input_resolution_instant<v_hard_at then v_phase:='overdue';
    else v_phase:='hard_deadline_passed'; end if;
    v_payload := jsonb_build_object(
      'operationalContextHash',v_context.context_hash,'taskKey',v_task.task_key_snapshot,
      'availabilityMode',v_task.availability_mode_snapshot,
      'visibleDayOffset',v_task.visible_day_offset_snapshot,'visibleLocalTime',v_task.visible_from_local_time_snapshot,'visibleAt',v_visible_at,
      'startDayOffset',v_task.start_day_offset_snapshot,'startLocalTime',v_task.start_from_local_time_snapshot,'startAt',v_start_at,
      'targetDayOffset',v_task.target_day_offset_snapshot,'targetLocalTime',v_task.target_local_time_snapshot,'targetAt',v_target_at,
      'overdueDayOffset',v_task.overdue_day_offset_snapshot,'overdueLocalTime',v_task.overdue_local_time_snapshot,'overdueAt',v_overdue_at,
      'hardDeadlineDayOffset',v_task.hard_deadline_day_offset_snapshot,
      'hardDeadlineLocalTime',v_task.hard_deadline_local_time_snapshot,'hardDeadlineAt',v_hard_at,
      'resolutionDetails',v_details,'scheduleState',v_schedule);
    v_row_hash := public.routine_compute_task_timing_hash(v_payload);
    insert into public.routine_run_task_timings(
      organization_id,run_id,task_id,operational_context_id,availability_mode_snapshot,
      visible_day_offset_snapshot,visible_local_time_snapshot,visible_at,
      start_day_offset_snapshot,start_local_time_snapshot,start_at,
      target_day_offset_snapshot,target_local_time_snapshot,target_at,
      overdue_day_offset_snapshot,overdue_local_time_snapshot,overdue_at,
      hard_deadline_day_offset_snapshot,hard_deadline_local_time_snapshot,hard_deadline_at,
      resolution_details,schedule_state,timing_snapshot_hash,current_phase,last_evaluated_at
    ) values (
      v_run.organization_id,v_run.id,v_task.id,v_context.id,v_task.availability_mode_snapshot,
      v_task.visible_day_offset_snapshot,v_task.visible_from_local_time_snapshot,v_visible_at,
      v_task.start_day_offset_snapshot,v_task.start_from_local_time_snapshot,v_start_at,
      v_task.target_day_offset_snapshot,v_task.target_local_time_snapshot,v_target_at,
      v_task.overdue_day_offset_snapshot,v_task.overdue_local_time_snapshot,v_overdue_at,
      v_task.hard_deadline_day_offset_snapshot,v_task.hard_deadline_local_time_snapshot,v_hard_at,
      v_details,v_schedule,v_row_hash,v_phase,input_resolution_instant
    );
    v_count := v_count+1;
  end loop;
  if v_count<>(select count(*) from public.routine_run_tasks where run_id=v_run.id) then
    raise exception using errcode='P0001', message='Timing snapshot did not cover every run task.';
  end if;
  v_run_hash := public.routine_compute_run_timing_snapshot_hash(v_run.id);
  if v_run_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='P0001', message='Timing snapshot hash construction failed.';
  end if;
  perform set_config('mesh.routine_run_internal','timing_build',true);
  update public.routine_runs set operational_context_id=v_context.id,timing_snapshot_state='ready',
    timing_snapshot_hash=v_run_hash,time_engine_version_snapshot=v_context.time_engine_version_snapshot
  where id=v_run.id;
  if (select snapshot_hash from public.routine_runs where id=v_run.id) is distinct from v_core_hash
     or public.routine_compute_run_snapshot_hash(v_run.id) is distinct from v_core_hash then
    raise exception using errcode='P0001', message='Core routine snapshot hash changed during timing construction.';
  end if;
  return jsonb_build_object('operationalContext',to_jsonb(v_context),
    'timingSnapshotHash',v_run_hash,'taskTimingCount',v_count,'idempotentBuild',false);
end;
$$;

create or replace function public.routine_verify_run_timing_snapshot(input_run_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog
as $$
declare v_run public.routine_runs%rowtype; v_context public.routine_run_operational_contexts%rowtype;
  v_recomputed text; v_invalid jsonb; v_summary jsonb;
begin
  select run.* into v_run from public.routine_runs run where run.id=input_run_id;
  select context.* into v_context from public.routine_run_operational_contexts context where context.run_id=input_run_id;
  v_recomputed := public.routine_compute_run_timing_snapshot_hash(input_run_id);
  select coalesce(jsonb_agg(timing.id order by timing.id),'[]'::jsonb) into v_invalid
    from public.routine_run_task_timings timing where timing.run_id=input_run_id
      and (timing.schedule_state='invalid' or timing.timing_snapshot_hash !~ '^[0-9a-f]{64}$');
  select coalesce(jsonb_object_agg(kind,count_value),'{}'::jsonb) into v_summary from (
    select detail.value->>'resolutionKind' kind,count(*) count_value
    from public.routine_run_task_timings timing
    cross join lateral jsonb_each(timing.resolution_details) detail
    where timing.run_id=input_run_id group by detail.value->>'resolutionKind'
  ) values_by_kind;
  return jsonb_build_object('valid',v_run.timing_snapshot_state='ready'
      and v_run.timing_snapshot_hash=v_recomputed and v_context.context_hash~'^[0-9a-f]{64}$'
      and jsonb_array_length(v_invalid)=0,
    'storedHash',v_run.timing_snapshot_hash,'recomputedHash',v_recomputed,
    'operationalContextHash',v_context.context_hash,
    'taskTimingCount',(select count(*) from public.routine_run_task_timings where run_id=input_run_id),
    'invalidRows',v_invalid,'dstResolutionSummary',v_summary,
    'pendingConditionCount',(select count(*) from public.routine_run_condition_evaluations
      where run_id=input_run_id and evaluation_state in ('pending','error')));
end;
$$;

create or replace function public.routine_backfill_run_timing_snapshot(
  input_run_id uuid,
  input_resolution_instant timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare v_context record;
begin
  select * into v_context from public.routine_lifecycle_context(input_run_id);
  if not v_context.is_manager then
    raise exception using errcode='P0001', message='Manager authority is required for timing backfill.';
  end if;
  return public.routine_build_run_timing_snapshot(input_run_id,'legacy_backfill',
    coalesce(input_resolution_instant,clock_timestamp()));
end;
$$;

-- Phase 10F operation and event vocabulary. Existing lifecycle values remain
-- accepted verbatim.
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
  'record_correction', 'replace_flags', 'create_run_with_time', 'refresh_timing',
  'evaluate_conditions', 'supersede_run_date', 'timing_system_transition'
));
alter table public.routine_run_operations drop constraint if exists routine_run_operations_resource_check;
alter table public.routine_run_operations add constraint routine_run_operations_resource_check check (resource_type in (
  'run', 'participant', 'role_assignment', 'task', 'task_item', 'deviation', 'manager_override',
  'task_verification', 'run_verification', 'handover', 'transfer', 'correction', 'event',
  'settings', 'timing', 'condition', 'supersession'
));

alter table public.routine_events drop constraint if exists routine_events_event_type_check;
alter table public.routine_events add constraint routine_events_event_type_check check (event_type in (
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
  'history_correction_recorded', 'operational_date_resolved', 'task_became_visible',
  'task_became_available', 'task_became_due', 'task_became_overdue',
  'task_hard_deadline_missed', 'task_system_started', 'task_system_completed',
  'condition_evaluated', 'condition_matched', 'condition_not_matched',
  'condition_evaluation_error', 'run_operational_date_superseded',
  'timing_deviation_resolved'
));

alter table public.routine_template_task_dependencies
  drop constraint if exists routine_template_task_dependencies_type_check;
alter table public.routine_template_task_dependencies
  add constraint routine_template_task_dependencies_type_check check (dependency_type in (
    'must_complete','must_resolve','must_reach_time','must_receive_transfer',
    'complete_predecessor_on_successor'
  ));
alter table public.routine_run_task_dependencies
  drop constraint if exists routine_run_task_dependencies_type_check;
alter table public.routine_run_task_dependencies
  add constraint routine_run_task_dependencies_type_check check (dependency_type_snapshot in (
    'must_complete','must_resolve','must_reach_time','must_receive_transfer',
    'complete_predecessor_on_successor'
  ));

-- Preserve the core immutable run contract and additionally freeze timing
-- identity once the timing snapshot is ready.
create or replace function public.routine_runs_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode='P0001', message='Routine runs cannot be deleted.';
  end if;
  if old.snapshot_state='ready' and row(
      new.organization_id,new.routine_key,new.scope_key,new.operational_date,new.timezone,
      new.template_id,new.template_version_id,new.template_version_number_snapshot,
      new.template_content_hash_snapshot,new.snapshot_schema_version,new.snapshot_state,
      new.snapshot_hash,new.creation_idempotency_key,new.creation_request_hash,new.created_at,
      new.created_by_auth_user_id
    ) is distinct from row(
      old.organization_id,old.routine_key,old.scope_key,old.operational_date,old.timezone,
      old.template_id,old.template_version_id,old.template_version_number_snapshot,
      old.template_content_hash_snapshot,old.snapshot_schema_version,old.snapshot_state,
      old.snapshot_hash,old.creation_idempotency_key,old.creation_request_hash,old.created_at,
      old.created_by_auth_user_id
    ) then
    raise exception using errcode='P0001', message='Ready routine run identity and snapshot fields are immutable.';
  end if;
  if old.timing_snapshot_state='ready' and row(
      new.operational_context_id,new.timing_snapshot_state,new.timing_snapshot_hash,
      new.time_engine_version_snapshot
    ) is distinct from row(
      old.operational_context_id,old.timing_snapshot_state,old.timing_snapshot_hash,
      old.time_engine_version_snapshot
    ) then
    raise exception using errcode='P0001', message='Ready routine run timing snapshot fields are immutable.';
  end if;
  if current_setting('mesh.routine_run_internal',true) is null then
    raise exception using errcode='P0001', message='Routine run projections can be changed only through an authorized RPC.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.replace_routine_organization_flags(
  input_flags jsonb,
  input_expected_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  v_actor record; v_settings public.routine_organization_settings%rowtype;
  v_hash text; v_replay jsonb; v_response jsonb;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then
    raise exception using errcode='42501', message='Manager access is required to replace routine organization flags.';
  end if;
  if input_expected_revision is null or input_idempotency_key is null
     or not public.routine_flags_are_valid(input_flags) then
    raise exception using errcode='P0001', message='Valid flags, expected revision, and idempotency key are required.';
  end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object(
    'flags',input_flags,'expectedRevision',input_expected_revision));
  v_replay := public.routine_run_operation_replay(v_actor.organization_id,
    v_actor.actor_auth_user_id,'replace_flags',input_idempotency_key,v_hash);
  if v_replay is not null then return v_replay; end if;
  select settings.* into v_settings from public.routine_organization_settings settings
    where settings.organization_id=v_actor.organization_id for update;
  v_replay := public.routine_run_operation_replay(v_actor.organization_id,
    v_actor.actor_auth_user_id,'replace_flags',input_idempotency_key,v_hash);
  if v_replay is not null then return v_replay; end if;
  if v_settings.organization_id is null or v_settings.revision <> input_expected_revision then
    raise exception using errcode='40001', message='Stale routine settings revision; refresh before replacing flags.';
  end if;
  update public.routine_organization_settings settings
    set flags=input_flags,revision=settings.revision+1,
        updated_by_auth_user_id=v_actor.actor_auth_user_id
    where settings.organization_id=v_actor.organization_id returning * into v_settings;
  v_response := jsonb_build_object('settings',to_jsonb(v_settings),'idempotentReplay',false);
  perform public.routine_record_run_operation(v_actor.organization_id,v_actor.actor_auth_user_id,
    'replace_flags',input_idempotency_key,v_hash,'settings',v_actor.organization_id,v_response);
  return v_response;
end;
$$;

create or replace function public.get_routine_operational_clock()
returns jsonb
language plpgsql
volatile
security definer
set search_path=pg_catalog
as $$
declare v_actor record; v_now timestamptz := clock_timestamp(); v_clock record;
begin
  select * into v_actor from public.routine_resolve_actor();
  select * into v_clock from public.routine_derive_operational_date(v_actor.organization_id,v_now);
  return jsonb_build_object(
    'serverNow',v_now,'timezone',v_clock.timezone,'localTimestamp',v_clock.local_timestamp,
    'localDate',v_clock.local_date,'localTime',v_clock.local_time,
    'operationalDate',v_clock.operational_date,'cutoff',v_clock.cutoff,
    'settingsRevision',v_clock.settings_revision,'timeEngineVersion',v_clock.time_engine_version
  );
end;
$$;

do $phase10f_create_run_rename$
begin
  if to_regprocedure('public.create_or_get_routine_run_phase10e(text,text,date,uuid)') is null then
    alter function public.create_or_get_routine_run(text,text,date,uuid)
      rename to create_or_get_routine_run_phase10e;
  end if;
end;
$phase10f_create_run_rename$;

create or replace function public.create_or_get_routine_run(
  input_routine_key text,
  input_scope_key text,
  input_operational_date date,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  v_actor record; v_now timestamptz := clock_timestamp(); v_date date;
  v_date_source text; v_hash text; v_replay jsonb; v_response jsonb;
  v_run public.routine_runs%rowtype; v_timing jsonb; v_operation_id uuid;
begin
  select * into v_actor from public.routine_resolve_actor();
  if input_idempotency_key is null then
    raise exception using errcode='P0001', message='Idempotency key is required.';
  end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object(
    'routineKey',lower(trim(coalesce(input_routine_key,''))),
    'scopeKey',lower(trim(coalesce(input_scope_key,''))),
    'operationalDate',input_operational_date));
  -- Raw replay is intentionally checked before the server derives a date.
  v_replay := public.routine_run_operation_replay(v_actor.organization_id,
    v_actor.actor_auth_user_id,'create_run_with_time',input_idempotency_key,v_hash);
  if v_replay is not null then return v_replay; end if;
  if input_operational_date is null then
    select derived.operational_date into v_date
      from public.routine_derive_operational_date(v_actor.organization_id,v_now) derived;
    v_date_source := 'derived';
  else
    v_date := input_operational_date;
    v_date_source := 'explicit';
  end if;
  v_response := public.create_or_get_routine_run_phase10e(
    input_routine_key,input_scope_key,v_date,input_idempotency_key);
  select run.* into v_run from public.routine_runs run
    where run.id=(v_response->'run'->>'id')::uuid for update;
  if v_run.timing_snapshot_state='building' then
    v_timing := public.routine_build_run_timing_snapshot(v_run.id,v_date_source,v_now);
  elsif v_run.timing_snapshot_state='ready' then
    v_timing := public.routine_verify_run_timing_snapshot(v_run.id);
  else
    raise exception using errcode='P0001', message='timing_snapshot_invalid';
  end if;
  select run.* into v_run from public.routine_runs run where run.id=v_run.id;
  v_response := jsonb_set(v_response,'{run}',to_jsonb(v_run),true)
    || jsonb_build_object('timing',v_timing,'dateSource',v_date_source,'idempotentReplay',false);
  perform public.routine_record_run_operation(v_actor.organization_id,v_actor.actor_auth_user_id,
    'create_run_with_time',input_idempotency_key,v_hash,'run',v_run.id,v_response);
  v_operation_id := public.routine_lifecycle_operation_id(v_actor.organization_id,
    v_actor.actor_auth_user_id,'create_run_with_time',input_idempotency_key);
  perform public.routine_record_event(v_run.id,'operational_date_resolved','system',null,null,
    'Routine timing engine','system',jsonb_build_object(),null,null,
    jsonb_build_object('dateSource',v_date_source,'operationalDate',v_date,
      'contextHash',(select context_hash from public.routine_run_operational_contexts where run_id=v_run.id)),
    v_operation_id,1);
  return v_response;
end;
$$;

-- Phase 10F template validation layers timing and continuous-task contracts
-- over the committed Phase 10E validator.
create or replace function public.routine_validate_condition_json(
  input_condition jsonb,
  input_depth integer default 0
)
returns boolean
language plpgsql
immutable
set search_path=pg_catalog
as $$
declare v_key text; v_value jsonb; v_fact text; v_operator text; v_entry jsonb; v_count integer;
begin
  if input_condition is null or jsonb_typeof(input_condition)<>'object'
     or input_depth<0 or input_depth>5 or octet_length(input_condition::text)>20000 then return false; end if;
  select count(*) into v_count from jsonb_object_keys(input_condition);
  if v_count=0 then return true; end if;
  if v_count=1 and input_condition ?| array['all','any','not'] then
    select key,value into v_key,v_value from jsonb_each(input_condition);
    if v_key in ('all','any') then
      if jsonb_typeof(v_value)<>'array' or jsonb_array_length(v_value) not between 1 and 20 then return false; end if;
      for v_entry in select value from jsonb_array_elements(v_value) loop
        if not public.routine_validate_condition_json(v_entry,input_depth+1) then return false; end if;
      end loop;
      return true;
    end if;
    return jsonb_typeof(v_value)='object' and public.routine_validate_condition_json(v_value,input_depth+1);
  end if;
  if not input_condition ? 'fact' or not input_condition ? 'operator'
     or exists(select 1 from jsonb_object_keys(input_condition) name
       where name not in ('fact','operator','value','key'))
     or jsonb_typeof(input_condition->'fact')<>'string'
     or jsonb_typeof(input_condition->'operator')<>'string' then return false; end if;
  v_fact:=input_condition->>'fact'; v_operator:=input_condition->>'operator';
  if v_fact not in ('weekday','local_time','organization_flag','location_active','event_zone_active',
    'booking_exists','asset_used_today','standard_value_exists','previous_task_status','transfer_status')
    or v_operator not in ('equals','not_equals','in','greater_than','less_than','exists') then return false; end if;
  if input_condition ? 'key' and (jsonb_typeof(input_condition->'key')<>'string'
     or input_condition->>'key' !~ '^[a-zA-Z][a-zA-Z0-9]*(?:[-_:][a-zA-Z0-9]+)*$'
     or char_length(input_condition->>'key')>120) then return false; end if;
  if v_fact in ('organization_flag','previous_task_status','transfer_status') and not input_condition ? 'key' then return false; end if;
  if v_fact not in ('organization_flag','previous_task_status','transfer_status') and input_condition ? 'key' then return false; end if;
  if v_operator='exists' then return not input_condition ? 'value'; end if;
  if not input_condition ? 'value' or input_condition->'value'='null'::jsonb then return false; end if;
  if v_operator='in' then
    if jsonb_typeof(input_condition->'value')<>'array' or jsonb_array_length(input_condition->'value') not between 1 and 50 then return false; end if;
    if exists(select 1 from jsonb_array_elements(input_condition->'value') element
      where jsonb_typeof(element) in ('object','array','null'))
    then return false; end if;
    if v_fact='weekday' then
      return (
        not exists(select 1 from jsonb_array_elements(input_condition->'value') element
          where case when jsonb_typeof(element)='number' then
            (element#>>'{}')::numeric<>trunc((element#>>'{}')::numeric)
              or (element#>>'{}')::numeric not between 1 and 7
            else true end)
        or not exists(select 1 from jsonb_array_elements(input_condition->'value') element
          where jsonb_typeof(element)<>'string'
            or element#>>'{}' not in ('monday','tuesday','wednesday','thursday','friday','saturday','sunday'))
      );
    end if;
    if v_fact='local_time' then
      return not exists(select 1 from jsonb_array_elements(input_condition->'value') element
        where jsonb_typeof(element)<>'string'
          or element#>>'{}' !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,6})?)?$');
    end if;
    return true;
  end if;
  if jsonb_typeof(input_condition->'value') not in ('string','number','boolean') then return false; end if;
  if v_fact='weekday' then
    return case jsonb_typeof(input_condition->'value')
      when 'number' then (input_condition->>'value')::numeric=trunc((input_condition->>'value')::numeric)
        and (input_condition->>'value')::numeric between 1 and 7
      when 'string' then input_condition->>'value' in (
        'monday','tuesday','wednesday','thursday','friday','saturday','sunday')
      else false end;
  end if;
  if v_fact='local_time' then
    return jsonb_typeof(input_condition->'value')='string'
      and input_condition->>'value' ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,6})?)?$';
  end if;
  return true;
end;
$$;

do $phase10f_template_validator_rename$
begin
  if to_regprocedure('public.validate_routine_template_version_phase10e(uuid,uuid[])') is null then
    alter function public.validate_routine_template_version(uuid,uuid[])
      rename to validate_routine_template_version_phase10e;
  end if;
end;
$phase10f_template_validator_rename$;

create or replace function public.validate_routine_template_version(
  input_version_id uuid,
  input_batch_version_ids uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog
as $$
declare v_result jsonb; v_blockers jsonb; v_warnings jsonb;
begin
  v_result := public.validate_routine_template_version_phase10e(input_version_id,input_batch_version_ids);
  v_blockers := coalesce(v_result->'blockers','[]'::jsonb);
  v_warnings := coalesce(v_result->'warnings','[]'::jsonb);

  -- Phase 10B treated absent later boundaries as midnight. Phase 10F permits
  -- nullable boundaries and validates only the boundaries that are present.
  select coalesce(jsonb_agg(entry.value order by entry.ordinality),'[]'::jsonb)
    into v_blockers
  from jsonb_array_elements(v_blockers) with ordinality entry(value,ordinality)
  where entry.value not in (
    to_jsonb('Task visibility, start, target, overdue, and deadline times must be ordered.'::text),
    to_jsonb('Task availability mode and its time, dependency, condition, or repeat fields are inconsistent.'::text)
  );
  if exists (
    select 1
    from public.routine_template_tasks task
    where task.version_id=input_version_id and task.active
      and exists (
        select 1
        from unnest(array[
          case when task.visible_from_local_time is null then null else
            task.visible_day_offset*86400+extract(epoch from task.visible_from_local_time) end,
          case when task.start_from_local_time is null then null else
            task.start_day_offset*86400+extract(epoch from task.start_from_local_time) end,
          case when task.target_local_time is null then null else
            task.target_day_offset*86400+extract(epoch from task.target_local_time) end,
          case when task.overdue_local_time is null then null else
            task.overdue_day_offset*86400+extract(epoch from task.overdue_local_time) end,
          case when task.hard_deadline_local_time is null then null else
            task.hard_deadline_day_offset*86400+extract(epoch from task.hard_deadline_local_time) end
        ]) with ordinality earlier(value,position)
        join unnest(array[
          case when task.visible_from_local_time is null then null else
            task.visible_day_offset*86400+extract(epoch from task.visible_from_local_time) end,
          case when task.start_from_local_time is null then null else
            task.start_day_offset*86400+extract(epoch from task.start_from_local_time) end,
          case when task.target_local_time is null then null else
            task.target_day_offset*86400+extract(epoch from task.target_local_time) end,
          case when task.overdue_local_time is null then null else
            task.overdue_day_offset*86400+extract(epoch from task.overdue_local_time) end,
          case when task.hard_deadline_local_time is null then null else
            task.hard_deadline_day_offset*86400+extract(epoch from task.hard_deadline_local_time) end
        ]) with ordinality later(value,position)
          on later.position>earlier.position
        where earlier.value is not null and later.value is not null
          and earlier.value>later.value
      )
  ) then
    v_blockers := v_blockers || jsonb_build_array(
      'Task visibility, start, target, overdue, and deadline times must be ordered.');
  end if;
  if exists (
    select 1 from public.routine_template_tasks task
    where task.version_id=input_version_id and task.active and (
      (task.availability_mode='time_window' and task.start_from_local_time is null)
      or (task.availability_mode='after_task' and not exists (
        select 1 from public.routine_template_task_dependencies dependency
        where dependency.version_id=task.version_id and dependency.successor_task_id=task.id))
      or (task.availability_mode='condition' and task.condition_json='{}'::jsonb)
      or (task.availability_mode='continuous' and task.repeat_policy<>'continuous')
    )
  ) then
    v_blockers := v_blockers || jsonb_build_array(
      'Task availability mode and its time, dependency, condition, or repeat fields are inconsistent.');
  end if;
  if exists (
    select 1 from public.routine_template_task_dependencies dependency
    left join public.routine_template_tasks predecessor on predecessor.id=dependency.predecessor_task_id
    left join public.routine_template_tasks successor on successor.id=dependency.successor_task_id
    where dependency.version_id=input_version_id and (
      (dependency.dependency_type='must_reach_time' and (
        exists(select 1 from jsonb_object_keys(dependency.metadata) key where key<>'boundary')
        or coalesce(dependency.metadata->>'boundary','start') not in ('visible','start','target','overdue','hard_deadline')
        or case coalesce(dependency.metadata->>'boundary','start')
          when 'visible' then predecessor.visible_from_local_time
          when 'start' then predecessor.start_from_local_time
          when 'target' then predecessor.target_local_time
          when 'overdue' then predecessor.overdue_local_time
          when 'hard_deadline' then predecessor.hard_deadline_local_time end is null
      ))
      or (dependency.dependency_type='complete_predecessor_on_successor' and (
        predecessor.task_type<>'continuous' or successor.task_type not in ('checkpoint','gate')
      ))
    )
  ) then
    v_blockers := v_blockers || jsonb_build_array('Invalid Phase 10F dependency timing or continuous completion metadata.');
  end if;
  if exists (
    select 1 from public.routine_template_task_dependencies dependency
    where dependency.version_id=input_version_id
      and dependency.dependency_type='complete_predecessor_on_successor'
    group by dependency.predecessor_task_id having count(*)>1
  ) then
    v_blockers := v_blockers || jsonb_build_array('A continuous predecessor can have only one automatic completion successor.');
  end if;
  if exists (
    select 1 from public.routine_template_tasks task
    where task.version_id=input_version_id and task.active
      and task.task_type='checkpoint' and task.target_local_time is null
  ) then
    v_blockers := v_blockers || jsonb_build_array('Every active checkpoint requires a target local time.');
  end if;
  if exists (
    select 1 from public.routine_template_tasks task
    where task.version_id=input_version_id and task.active
      and task.availability_mode='time_window' and task.start_from_local_time is null
  ) then
    v_blockers := v_blockers || jsonb_build_array('Every time-window task requires a start local time.');
  end if;
  if exists (
    select 1 from public.routine_template_tasks task
    where task.version_id=input_version_id and task.active
      and task.task_type='continuous' and not exists (
        select 1 from public.routine_template_task_dependencies dependency
        where dependency.version_id=task.version_id
          and dependency.predecessor_task_id=task.id
          and dependency.dependency_type='complete_predecessor_on_successor'
      )
  ) then
    v_warnings := v_warnings || jsonb_build_array('A continuous task has no automatic completion trigger and requires manual handling.');
  end if;
  if exists (
    select 1 from public.routine_template_tasks task
    where task.version_id=input_version_id and task.active
      and task.target_local_time is not null and task.overdue_local_time is null
  ) then
    v_warnings := v_warnings || jsonb_build_array('A target time has no overdue boundary.');
  end if;
  if exists (
    select 1 from public.routine_template_tasks task
    where task.version_id=input_version_id and task.active
      and task.overdue_local_time is not null and task.hard_deadline_local_time is null
  ) then
    v_warnings := v_warnings || jsonb_build_array('An overdue boundary has no hard deadline.');
  end if;
  if exists (
    select 1 from public.routine_template_tasks task
    cross join lateral unnest(array[task.visible_from_local_time,task.start_from_local_time,
      task.target_local_time,task.overdue_local_time,task.hard_deadline_local_time]) boundary(local_time)
    where task.version_id=input_version_id and task.active
      and boundary.local_time>='02:00:00'::time and boundary.local_time<'03:00:00'::time
  ) then
    v_warnings := v_warnings || jsonb_build_array(
      'A local schedule boundary falls in the Europe/Oslo DST transition window.');
  end if;
  return jsonb_set(jsonb_set(jsonb_set(v_result,'{blockers}',v_blockers,true),
    '{warnings}',v_warnings,true),'{valid}',to_jsonb(jsonb_array_length(v_blockers)=0),true);
end;
$$;

create or replace function public.routine_task_dependency_validation_at(
  input_task_id uuid,
  input_effective_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog
as $$
declare v_blockers jsonb := '[]'::jsonb; v_statuses jsonb := '[]'::jsonb;
  v_dependency record; v_boundary text; v_boundary_at timestamptz; v_met boolean;
begin
  if input_effective_at is null then
    raise exception using errcode='P0001', message='A server dependency instant is required.';
  end if;
  for v_dependency in
    select dependency.*,predecessor.status predecessor_status,timing.visible_at,timing.start_at,
      timing.target_at,timing.overdue_at,timing.hard_deadline_at
    from public.routine_run_task_dependencies dependency
    join public.routine_run_tasks predecessor on predecessor.id=dependency.predecessor_run_task_id
    left join public.routine_run_task_timings timing on timing.task_id=predecessor.id
    where dependency.successor_run_task_id=input_task_id
    order by dependency.id
  loop
    v_met := true; v_boundary := null; v_boundary_at := null;
    if v_dependency.dependency_type_snapshot='must_complete' then
      v_met := v_dependency.predecessor_status='completed';
      if not v_met then v_blockers:=v_blockers||jsonb_build_array('must_complete_dependency_pending'); end if;
    elsif v_dependency.dependency_type_snapshot='must_resolve' then
      v_met := v_dependency.predecessor_status in ('completed','not_applicable','transferred');
      if not v_met then v_blockers:=v_blockers||jsonb_build_array('must_resolve_dependency_pending'); end if;
    elsif v_dependency.dependency_type_snapshot='must_receive_transfer' then
      v_met := exists(select 1 from public.routine_run_transfers transfer
        where transfer.target_run_id=v_dependency.run_id and transfer.status='completed');
      if not v_met then v_blockers:=v_blockers||jsonb_build_array('must_receive_transfer_pending'); end if;
    elsif v_dependency.dependency_type_snapshot='must_reach_time' then
      v_boundary := coalesce(v_dependency.metadata_snapshot->>'boundary','start');
      v_boundary_at := case v_boundary when 'visible' then v_dependency.visible_at
        when 'start' then v_dependency.start_at when 'target' then v_dependency.target_at
        when 'overdue' then v_dependency.overdue_at when 'hard_deadline' then v_dependency.hard_deadline_at end;
      v_met := v_boundary_at is not null and input_effective_at>=v_boundary_at;
      if not v_met then v_blockers:=v_blockers||jsonb_build_array(
        case when v_boundary_at is null then 'must_reach_time_boundary_missing'
          else 'must_reach_time_dependency_pending' end); end if;
    end if;
    v_statuses := v_statuses || jsonb_build_array(jsonb_build_object(
      'dependencyId',v_dependency.id,'type',v_dependency.dependency_type_snapshot,
      'boundary',v_boundary,'boundaryAt',v_boundary_at,'met',v_met));
  end loop;
  return jsonb_build_object('valid',jsonb_array_length(v_blockers)=0,
    'blockers',v_blockers,'dependencies',v_statuses,'effectiveAt',input_effective_at);
end;
$$;

create or replace function public.routine_task_dependency_validation(input_task_id uuid)
returns jsonb language sql volatile security definer set search_path=pg_catalog
as $$ select public.routine_task_dependency_validation_at(input_task_id,clock_timestamp()) $$;

create or replace function public.routine_compare_condition_value(
  input_actual jsonb,
  input_operator text,
  input_expected jsonb
)
returns boolean
language plpgsql immutable set search_path=pg_catalog
as $$
begin
  if input_operator='exists' then return input_actual is not null and input_actual<>'null'::jsonb; end if;
  if input_operator='equals' then return input_actual=input_expected; end if;
  if input_operator='not_equals' then return input_actual<>input_expected; end if;
  if input_operator='in' then return exists(select 1 from jsonb_array_elements(input_expected) item where item=input_actual); end if;
  if input_operator='greater_than' and jsonb_typeof(input_actual)='number' and jsonb_typeof(input_expected)='number' then
    return (input_actual#>>'{}')::numeric>(input_expected#>>'{}')::numeric;
  end if;
  if input_operator='less_than' and jsonb_typeof(input_actual)='number' and jsonb_typeof(input_expected)='number' then
    return (input_actual#>>'{}')::numeric<(input_expected#>>'{}')::numeric;
  end if;
  return false;
end;
$$;

create or replace function public.routine_resolve_condition_fact(
  input_task_id uuid,
  input_node jsonb,
  input_effective_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog
as $$
declare v_task public.routine_run_tasks%rowtype; v_context public.routine_run_operational_contexts%rowtype;
  v_fact text:=input_node->>'fact'; v_key text:=input_node->>'key'; v_actual jsonb;
  v_weekday integer; v_name text;
begin
  select task.* into v_task from public.routine_run_tasks task where task.id=input_task_id;
  select context.* into v_context from public.routine_run_operational_contexts context where context.run_id=v_task.run_id;
  if v_task.id is null or v_context.id is null then
    return jsonb_build_object('state','error','fact',v_fact,'error','condition_context_missing');
  end if;
  if v_fact='weekday' then
    v_weekday:=v_context.local_iso_weekday_snapshot;
    v_name:=(array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])[v_weekday];
    if jsonb_typeof(input_node->'value')='string'
       or (jsonb_typeof(input_node->'value')='array'
         and jsonb_typeof(input_node->'value'->0)='string') then
      v_actual:=to_jsonb(v_name);
    else
      v_actual:=to_jsonb(v_weekday);
    end if;
  elsif v_fact='local_time' then
    v_actual:=to_jsonb(to_char(input_effective_at at time zone v_context.timezone_snapshot,'HH24:MI:SS'));
  elsif v_fact='organization_flag' then
    v_actual:=v_context.organization_flags_snapshot->v_key;
  elsif v_fact='location_active' then
    v_actual:=to_jsonb(v_task.active_snapshot and (v_task.location_id_snapshot is not null
      or v_task.location_set_id_snapshot is not null or v_task.location_description_snapshot is not null));
  elsif v_fact='standard_value_exists' then
    v_actual:=to_jsonb(exists(select 1 from public.routine_run_task_items item
      where item.run_task_id=v_task.id and item.standard_revision_id_snapshot is not null
        and item.standard_value_snapshot is not null));
  elsif v_fact='previous_task_status' then
    select to_jsonb(predecessor.status) into v_actual from public.routine_run_tasks predecessor
      where predecessor.run_id=v_task.run_id and predecessor.task_key_snapshot=v_key;
  elsif v_fact='transfer_status' then
    select to_jsonb(transfer.status) into v_actual from public.routine_run_transfers transfer
      where transfer.from_run_id=v_task.run_id
        and (v_key is null or transfer.scope_key=v_key)
      order by transfer.created_at desc limit 1;
  elsif v_fact in ('event_zone_active','booking_exists') then
    return jsonb_build_object('state','pending_external','fact',v_fact);
  elsif v_fact='asset_used_today' then
    select source.snapshot_payload->'assetUsedToday' into v_actual
      from public.routine_run_snapshot_sources source
      where source.run_id=v_task.run_id and source.source_kind='asset_registry_readonly'
        and source.snapshot_payload ? 'assetUsedToday' limit 1;
    if v_actual is null then return jsonb_build_object('state','pending_external','fact',v_fact); end if;
  else
    return jsonb_build_object('state','error','fact',v_fact,'error','unsupported_condition_fact');
  end if;
  return jsonb_build_object('state','resolved','fact',v_fact,'key',v_key,'value',v_actual);
exception when others then
  return jsonb_build_object('state','error','fact',v_fact,'error','condition_fact_resolution_failed');
end;
$$;

create or replace function public.routine_evaluate_condition_node(
  input_task_id uuid,
  input_node jsonb,
  input_effective_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog
as $$
declare v_key text; v_value jsonb; v_child jsonb; v_results jsonb:='[]'::jsonb;
  v_fact jsonb; v_match boolean;
begin
  if input_node='{}'::jsonb then return jsonb_build_object('state','matched','facts','{}'::jsonb); end if;
  if input_node ? 'all' then
    for v_child in select value from jsonb_array_elements(input_node->'all') loop
      v_fact:=public.routine_evaluate_condition_node(input_task_id,v_child,input_effective_at);
      v_results:=v_results||jsonb_build_array(v_fact);
      if v_fact->>'state'='error' then return jsonb_build_object('state','error','facts',v_results); end if;
      if v_fact->>'state'='pending' then return jsonb_build_object('state','pending','facts',v_results); end if;
      if v_fact->>'state'='not_matched' then return jsonb_build_object('state','not_matched','facts',v_results); end if;
    end loop;
    return jsonb_build_object('state','matched','facts',v_results);
  elsif input_node ? 'any' then
    v_match:=false;
    for v_child in select value from jsonb_array_elements(input_node->'any') loop
      v_fact:=public.routine_evaluate_condition_node(input_task_id,v_child,input_effective_at);
      v_results:=v_results||jsonb_build_array(v_fact);
      if v_fact->>'state'='matched' then v_match:=true; end if;
    end loop;
    if v_match then return jsonb_build_object('state','matched','facts',v_results); end if;
    if exists(select 1 from jsonb_array_elements(v_results) item where item->>'state'='error') then
      return jsonb_build_object('state','error','facts',v_results);
    end if;
    if exists(select 1 from jsonb_array_elements(v_results) item where item->>'state'='pending') then
      return jsonb_build_object('state','pending','facts',v_results);
    end if;
    return jsonb_build_object('state','not_matched','facts',v_results);
  elsif input_node ? 'not' then
    v_fact:=public.routine_evaluate_condition_node(input_task_id,input_node->'not',input_effective_at);
    if v_fact->>'state'='matched' then v_fact:=jsonb_set(v_fact,'{state}','"not_matched"'::jsonb);
    elsif v_fact->>'state'='not_matched' then v_fact:=jsonb_set(v_fact,'{state}','"matched"'::jsonb); end if;
    return v_fact;
  end if;
  v_fact:=public.routine_resolve_condition_fact(input_task_id,input_node,input_effective_at);
  if v_fact->>'state'='pending_external' then return jsonb_build_object('state','pending','facts',v_fact); end if;
  if v_fact->>'state'='error' then return jsonb_build_object('state','error','facts',v_fact); end if;
  if input_node->>'fact'='local_time' and input_node->>'operator' in (
    'greater_than','less_than','equals','not_equals','in') then
    begin
      v_match:=case input_node->>'operator'
        when 'greater_than' then (v_fact->>'value')::time>(input_node->>'value')::time
        when 'less_than' then (v_fact->>'value')::time<(input_node->>'value')::time
        when 'equals' then (v_fact->>'value')::time=(input_node->>'value')::time
        when 'not_equals' then (v_fact->>'value')::time<>(input_node->>'value')::time
        when 'in' then exists(select 1 from jsonb_array_elements_text(input_node->'value') expected(value)
          where (v_fact->>'value')::time=expected.value::time) end;
    exception when others then return jsonb_build_object('state','error','facts',v_fact); end;
  else
    v_match:=public.routine_compare_condition_value(v_fact->'value',input_node->>'operator',input_node->'value');
  end if;
  return jsonb_build_object('state',case when v_match then 'matched' else 'not_matched' end,'facts',v_fact);
end;
$$;

create or replace function public.routine_evaluate_task_condition(
  input_task_id uuid,
  input_effective_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare v_task public.routine_run_tasks%rowtype; v_condition public.routine_run_condition_evaluations%rowtype;
  v_result jsonb; v_state text; v_previous text; v_inclusion text; v_transition boolean;
begin
  select task.* into v_task from public.routine_run_tasks task where task.id=input_task_id for update;
  select condition.* into v_condition from public.routine_run_condition_evaluations condition
    where condition.run_task_id=input_task_id for update;
  if v_condition.id is null then return jsonb_build_object('changed',false,'state','not_required'); end if;
  v_previous:=v_condition.evaluation_state;
  if v_condition.condition_json_snapshot='{}'::jsonb then
    v_result:=jsonb_build_object('state','not_required','facts','{}'::jsonb);
  else
    v_result:=public.routine_evaluate_condition_node(input_task_id,v_condition.condition_json_snapshot,input_effective_at);
  end if;
  v_state:=v_result->>'state';
  if v_state not in ('not_required','pending','matched','not_matched','error') then v_state:='error'; end if;
  v_inclusion:=case when v_state in ('not_required','matched') then 'included'
    when v_state='not_matched' then 'excluded' else 'pending' end;
  if v_task.status not in ('not_started','waiting') and v_task.inclusion_state='included' then v_inclusion:='included'; end if;
  v_transition:=v_previous is distinct from v_state
    or v_task.inclusion_state is distinct from v_inclusion;
  if v_previous is distinct from v_state or v_task.inclusion_state is distinct from v_inclusion
     or v_condition.facts_snapshot is distinct from coalesce(v_result->'facts','{}'::jsonb) then
    perform set_config('mesh.routine_run_internal','condition_evaluation',true);
    update public.routine_run_condition_evaluations set evaluation_state=v_state,
      facts_snapshot=coalesce(v_result->'facts','{}'::jsonb),evaluator_version='phase10f-v1',
      evaluated_at=input_effective_at,evaluated_by_auth_user_id=null,
      error_message=case when v_state='error' then 'condition_evaluation_error' else null end,
      revision=revision+1 where id=v_condition.id;
    if v_task.inclusion_state is distinct from v_inclusion then
      update public.routine_run_tasks set inclusion_state=v_inclusion,revision=revision+1,
        last_status_changed_at=input_effective_at,last_status_changed_by_auth_user_id=null
        where id=v_task.id;
    end if;
    return jsonb_build_object('changed',v_transition,'projectionUpdated',true,
      'taskId',v_task.id,'previousState',v_previous,
      'state',v_state,'inclusionState',v_inclusion,'facts',coalesce(v_result->'facts','{}'::jsonb));
  end if;
  return jsonb_build_object('changed',false,'projectionUpdated',false,
    'taskId',v_task.id,'state',v_state,
    'inclusionState',v_task.inclusion_state,'facts',v_condition.facts_snapshot);
end;
$$;

create or replace function public.routine_evaluate_run_conditions(
  input_run_id uuid,
  input_effective_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare v_row record; v_result jsonb; v_changed jsonb:='[]'::jsonb; v_event text;
begin
  for v_row in select task.id from public.routine_run_tasks task
    where task.run_id=input_run_id order by task.task_key_snapshot
  loop
    v_result:=public.routine_evaluate_task_condition(v_row.id,input_effective_at);
    if coalesce((v_result->>'changed')::boolean,false) then
      v_changed:=v_changed||jsonb_build_array(v_result);
      v_event:=case v_result->>'state' when 'matched' then 'condition_matched'
        when 'not_matched' then 'condition_not_matched' when 'error' then 'condition_evaluation_error'
        else 'condition_evaluated' end;
      perform public.routine_record_event(input_run_id,v_event,'system',null,null,
        'Routine condition engine','system',jsonb_build_object('taskId',v_row.id),null,null,
        jsonb_build_object('state',v_result->>'state'),null,1);
    end if;
  end loop;
  return jsonb_build_object('changedConditions',v_changed,'effectiveAt',input_effective_at);
end;
$$;

create or replace function public.evaluate_routine_run_conditions(
  input_run_id uuid,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare v_context record; v_now timestamptz:=clock_timestamp(); v_hash text;
  v_replay jsonb; v_response jsonb;
begin
  select * into v_context from public.routine_lifecycle_context(input_run_id);
  if input_idempotency_key is null then raise exception using errcode='P0001', message='Idempotency key is required.'; end if;
  v_hash:=public.routine_run_request_hash(jsonb_build_object('runId',input_run_id));
  v_replay:=public.routine_run_operation_replay(v_context.organization_id,v_context.actor_auth_user_id,
    'evaluate_conditions',input_idempotency_key,v_hash);
  if v_replay is not null then return v_replay; end if;
  perform 1 from public.routine_runs where id=input_run_id for update;
  v_replay:=public.routine_run_operation_replay(v_context.organization_id,v_context.actor_auth_user_id,
    'evaluate_conditions',input_idempotency_key,v_hash);
  if v_replay is not null then return v_replay; end if;
  v_response:=public.routine_evaluate_run_conditions(input_run_id,v_now)
    || jsonb_build_object('idempotentReplay',false);
  perform public.routine_record_run_operation(v_context.organization_id,v_context.actor_auth_user_id,
    'evaluate_conditions',input_idempotency_key,v_hash,'condition',input_run_id,v_response);
  return v_response;
end;
$$;

alter table public.routine_deviations drop constraint if exists routine_deviations_resolution_check;
alter table public.routine_deviations add constraint routine_deviations_resolution_check check (
  (status='resolved' and resolved_at is not null and resolution_note is not null
    and (resolved_by_auth_user_id is not null or source_type='timing_issue'))
  or status<>'resolved'
);

create or replace function public.routine_open_hard_deadline_deviation(
  input_task_id uuid,
  input_effective_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare v_task public.routine_run_tasks%rowtype; v_timing public.routine_run_task_timings%rowtype;
  v_deviation public.routine_deviations%rowtype; v_seconds bigint; v_severity text;
begin
  select task.* into v_task from public.routine_run_tasks task where task.id=input_task_id for update;
  select timing.* into v_timing from public.routine_run_task_timings timing where timing.task_id=input_task_id for update;
  if v_task.inclusion_state<>'included'
     or v_timing.hard_deadline_at is null or input_effective_at<v_timing.hard_deadline_at
     or v_task.status in ('completed','not_applicable','transferred','cancelled') then return null; end if;
  select deviation.* into v_deviation from public.routine_deviations deviation
    where deviation.task_id=input_task_id and deviation.source_type='timing_issue'
      and deviation.reason_code='hard_deadline_missed'
      and deviation.status in ('open','mitigated','accepted_temporarily') for update;
  if v_deviation.id is not null then return v_deviation.id; end if;
  v_seconds:=greatest(0,floor(extract(epoch from input_effective_at-v_timing.hard_deadline_at))::bigint);
  v_severity:=case v_task.criticality_snapshot when 'critical' then 'critical'
    when 'important' then 'important' else 'normal' end;
  perform set_config('mesh.routine_run_internal','timing_refresh',true);
  insert into public.routine_deviations(
    organization_id,run_id,task_id,source_type,category,reason_code,details,severity,
    detected_at,detected_by_auth_user_id,detected_by_name_snapshot,blocking
  ) values (
    v_task.organization_id,v_task.run_id,v_task.id,'timing_issue','timing','hard_deadline_missed',
    'Hard deadline missed at '||v_timing.hard_deadline_at::text||'; seconds late at detection: '||v_seconds::text,
    v_severity,input_effective_at,null,'Routine timing engine',false
  ) returning * into v_deviation;
  update public.routine_run_task_timings set hard_deadline_deviation_id=v_deviation.id,
    revision=revision+1,updated_by_auth_user_id=null where id=v_timing.id;
  update public.routine_runs set revision=revision+1,
    updated_by_auth_user_id=coalesce(auth.uid(),created_by_auth_user_id) where id=v_task.run_id;
  perform public.routine_record_event(v_task.run_id,'task_hard_deadline_missed','system',null,null,
    'Routine timing engine','system',jsonb_build_object('taskId',v_task.id,'deviationId',v_deviation.id),
    null,null,jsonb_build_object('hardDeadlineAt',v_timing.hard_deadline_at,
      'secondsLate',v_seconds,'severity',v_severity),null,1);
  return v_deviation.id;
end;
$$;

create or replace function public.routine_start_eligible_continuous_tasks(
  input_run_id uuid,
  input_effective_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare v_task record; v_phase jsonb; v_dependency jsonb; v_started jsonb:='[]'::jsonb;
begin
  if not exists(select 1 from public.routine_runs where id=input_run_id and status in ('in_progress','reopened')) then
    return jsonb_build_object('startedTaskIds',v_started);
  end if;
  for v_task in select task.* from public.routine_run_tasks task
    where task.run_id=input_run_id and task.task_type_snapshot='continuous'
      and task.availability_mode_snapshot='continuous' and task.inclusion_state='included'
      and task.status='not_started' order by task.id for update
  loop
    v_phase:=public.routine_compute_task_timing_phase(v_task.id,input_effective_at);
    v_dependency:=public.routine_task_dependency_validation_at(v_task.id,input_effective_at);
    if v_phase->>'phase' in ('available','due','overdue','hard_deadline_passed')
       and (v_dependency->>'valid')::boolean then
      perform set_config('mesh.routine_run_internal','system_transition',true);
      update public.routine_run_tasks set status='in_progress',started_at=input_effective_at,
        started_by_auth_user_id=(select created_by_auth_user_id from public.routine_runs where id=input_run_id),
        revision=revision+1,last_status_changed_at=input_effective_at,
        last_status_changed_by_auth_user_id=null where id=v_task.id;
      update public.routine_runs set revision=revision+1,
        updated_by_auth_user_id=coalesce(auth.uid(),created_by_auth_user_id) where id=input_run_id;
      perform public.routine_record_event(input_run_id,'task_system_started','system',null,null,
        'Routine timing engine','system',jsonb_build_object('taskId',v_task.id),v_task.revision,
        v_task.revision+1,jsonb_build_object('rule','continuous_start_at'),null,1);
      v_started:=v_started||to_jsonb(v_task.id);
    end if;
  end loop;
  return jsonb_build_object('startedTaskIds',v_started);
end;
$$;

create or replace function public.routine_refresh_run_timing_internal(
  input_run_id uuid,
  input_effective_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare v_run public.routine_runs%rowtype; v_timing public.routine_run_task_timings%rowtype;
  v_phase jsonb; v_new_phase text; v_changed jsonb:='[]'::jsonb; v_events jsonb:='[]'::jsonb;
  v_event_id uuid; v_condition jsonb; v_continuous jsonb; v_deviation_id uuid;
  v_cross_visible boolean; v_cross_available boolean; v_cross_due boolean;
  v_cross_overdue boolean; v_cross_hard boolean;
begin
  select run.* into v_run from public.routine_runs run where run.id=input_run_id for update;
  if v_run.id is null then raise exception using errcode='P0001', message='Routine run was not found.'; end if;
  if v_run.timing_snapshot_state='building' then raise exception using errcode='P0001', message='timing_snapshot_not_ready'; end if;
  if v_run.timing_snapshot_state<>'ready' then raise exception using errcode='P0001', message='timing_snapshot_invalid'; end if;
  v_condition:=public.routine_evaluate_run_conditions(input_run_id,input_effective_at);
  for v_timing in select timing.* from public.routine_run_task_timings timing
    where timing.run_id=input_run_id order by timing.task_id for update
  loop
    v_phase:=public.routine_compute_task_timing_phase(v_timing.task_id,input_effective_at);
    v_new_phase:=v_phase->>'phase';
    v_cross_visible:=v_timing.first_visible_at is null
      and v_new_phase in ('upcoming','available','due','overdue','hard_deadline_passed');
    v_cross_available:=v_timing.first_available_at is null
      and v_new_phase in ('available','due','overdue','hard_deadline_passed');
    v_cross_due:=v_timing.first_due_at is null
      and v_new_phase in ('due','overdue','hard_deadline_passed');
    v_cross_overdue:=v_timing.first_overdue_at is null
      and v_new_phase in ('overdue','hard_deadline_passed');
    v_cross_hard:=v_timing.first_hard_deadline_at is null
      and v_new_phase='hard_deadline_passed';
    perform set_config('mesh.routine_run_internal','timing_refresh',true);
    update public.routine_run_task_timings timing set
      current_phase=v_new_phase,last_evaluated_at=input_effective_at,
      first_visible_at=case when v_cross_visible then input_effective_at else timing.first_visible_at end,
      first_available_at=case when v_cross_available then input_effective_at else timing.first_available_at end,
      first_due_at=case when v_cross_due then input_effective_at else timing.first_due_at end,
      first_overdue_at=case when v_cross_overdue then input_effective_at else timing.first_overdue_at end,
      first_hard_deadline_at=case when v_cross_hard then input_effective_at else timing.first_hard_deadline_at end,
      revision=timing.revision+1,updated_by_auth_user_id=null
    where timing.id=v_timing.id and (
      timing.current_phase is distinct from v_new_phase or timing.last_evaluated_at is distinct from input_effective_at
      or v_cross_visible or v_cross_available or v_cross_due or v_cross_overdue or v_cross_hard
    );
    if v_timing.current_phase is distinct from v_new_phase then
      v_changed:=v_changed||jsonb_build_array(jsonb_build_object('taskId',v_timing.task_id,
        'previousPhase',v_timing.current_phase,'phase',v_new_phase,'hints',v_phase));
    end if;
    if v_cross_visible then
      v_event_id:=public.routine_record_event(input_run_id,'task_became_visible','system',null,null,
        'Routine timing engine','system',jsonb_build_object('taskId',v_timing.task_id),null,null,
        jsonb_build_object('boundaryAt',v_timing.visible_at),null,1); v_events:=v_events||to_jsonb(v_event_id);
    end if;
    if v_cross_available then
      v_event_id:=public.routine_record_event(input_run_id,'task_became_available','system',null,null,
        'Routine timing engine','system',jsonb_build_object('taskId',v_timing.task_id),null,null,
        jsonb_build_object('boundaryAt',v_timing.start_at),null,1); v_events:=v_events||to_jsonb(v_event_id);
    end if;
    if v_cross_due then
      v_event_id:=public.routine_record_event(input_run_id,'task_became_due','system',null,null,
        'Routine timing engine','system',jsonb_build_object('taskId',v_timing.task_id),null,null,
        jsonb_build_object('boundaryAt',v_timing.target_at),null,1); v_events:=v_events||to_jsonb(v_event_id);
    end if;
    if v_cross_overdue then
      v_event_id:=public.routine_record_event(input_run_id,'task_became_overdue','system',null,null,
        'Routine timing engine','system',jsonb_build_object('taskId',v_timing.task_id),null,null,
        jsonb_build_object('boundaryAt',v_timing.overdue_at),null,1); v_events:=v_events||to_jsonb(v_event_id);
    end if;
    if v_new_phase='hard_deadline_passed' then
      v_deviation_id:=public.routine_open_hard_deadline_deviation(v_timing.task_id,input_effective_at);
    end if;
  end loop;
  v_continuous:=public.routine_start_eligible_continuous_tasks(input_run_id,input_effective_at);
  return jsonb_build_object('effectiveAt',input_effective_at,'changedTasks',v_changed,
    'eventIds',v_events,'conditions',v_condition,'continuous',v_continuous);
end;
$$;

create or replace function public.refresh_routine_run_timing(
  input_run_id uuid,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare v_context record; v_now timestamptz:=clock_timestamp(); v_hash text;
  v_replay jsonb; v_response jsonb;
begin
  select * into v_context from public.routine_lifecycle_context(input_run_id);
  if not (v_context.is_coordinator or v_context.participant_id is not null) then
    raise exception using errcode='42501', message='Coordinator or active participant access is required to refresh timing.';
  end if;
  if input_idempotency_key is null then raise exception using errcode='P0001', message='Idempotency key is required.'; end if;
  v_hash:=public.routine_run_request_hash(jsonb_build_object('runId',input_run_id));
  v_replay:=public.routine_run_operation_replay(v_context.organization_id,v_context.actor_auth_user_id,
    'refresh_timing',input_idempotency_key,v_hash);
  if v_replay is not null then return v_replay; end if;
  v_response:=public.routine_refresh_run_timing_internal(input_run_id,v_now)
    || jsonb_build_object('idempotentReplay',false);
  perform public.routine_record_run_operation(v_context.organization_id,v_context.actor_auth_user_id,
    'refresh_timing',input_idempotency_key,v_hash,'timing',input_run_id,v_response);
  return v_response;
end;
$$;

create or replace function public.routine_validate_task_timing_action(
  input_task_id uuid,
  input_action text,
  input_effective_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog
as $$
declare v_task public.routine_run_tasks%rowtype; v_run public.routine_runs%rowtype;
  v_phase jsonb; v_name text; v_allowed boolean:=false; v_error text;
begin
  if input_action not in ('claim','start','block','not_applicable','complete','verify') then
    raise exception using errcode='P0001', message='Unknown routine timing action.';
  end if;
  select task.* into v_task from public.routine_run_tasks task where task.id=input_task_id;
  select run.* into v_run from public.routine_runs run where run.id=v_task.run_id;
  if v_run.timing_snapshot_state='building' then v_error:='timing_snapshot_not_ready';
  elsif v_run.timing_snapshot_state<>'ready' then v_error:='timing_snapshot_invalid';
  elsif not exists(select 1 from public.routine_run_task_timings where task_id=input_task_id) then v_error:='routine_task_timing_unavailable';
  else
    v_phase:=public.routine_compute_task_timing_phase(input_task_id,input_effective_at); v_name:=v_phase->>'phase';
    if v_name='pending_condition' then v_error:='routine_task_condition_pending';
    elsif v_name='excluded' then v_error:='routine_task_excluded';
    elsif input_action='claim' then
      v_allowed:=v_name in ('upcoming','available','due','overdue','hard_deadline_passed');
      if not v_allowed then v_error:=case when v_name='hidden' then 'routine_task_hidden' else 'routine_task_timing_unavailable' end; end if;
    elsif input_action in ('start','complete') then
      v_allowed:=v_name in ('available','due','overdue','hard_deadline_passed');
      if not v_allowed then v_error:=case when v_name='hidden' then 'routine_task_hidden'
        when v_name='upcoming' then 'routine_task_too_early' else 'routine_task_timing_unavailable' end; end if;
    elsif input_action='not_applicable' then
      v_allowed:=v_name in ('available','due','overdue','hard_deadline_passed')
        or public.routine_current_user_role() in ('manager','shift_lead');
      if not v_allowed then v_error:='routine_task_too_early'; end if;
    elsif input_action='block' then
      v_allowed:=v_name<>'hidden' or public.routine_current_user_role() in ('manager','shift_lead');
      if not v_allowed then v_error:='routine_task_hidden'; end if;
    else v_allowed:=v_task.status='completed'; if not v_allowed then v_error:='routine_task_timing_unavailable'; end if;
    end if;
  end if;
  return jsonb_build_object('valid',v_allowed,'errorCode',v_error,'phase',coalesce(v_phase,'{}'::jsonb));
end;
$$;

create or replace function public.routine_validate_task_completion(input_task_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog
as $$
declare v_task public.routine_run_tasks%rowtype; v_blockers jsonb:='[]'::jsonb;
  v_dependency jsonb; v_override_valid boolean; v_outcome text;
begin
  select task.* into v_task from public.routine_run_tasks task where task.id=input_task_id;
  if v_task.id is null then return jsonb_build_object('valid',false,'blockers',jsonb_build_array('task_not_found')); end if;
  if v_task.inclusion_state<>'included' then v_blockers:=v_blockers||jsonb_build_array('task_not_included'); end if;
  if v_task.status not in ('in_progress','blocked') then v_blockers:=v_blockers||jsonb_build_array('task_not_started'); end if;
  v_dependency:=public.routine_task_dependency_validation_at(v_task.id,clock_timestamp());
  v_blockers:=v_blockers||coalesce(v_dependency->'blockers','[]'::jsonb);
  if v_task.initial_assessment_policy_snapshot<>'none' and v_task.initial_assessment is null then
    v_blockers:=v_blockers||jsonb_build_array('initial_assessment_required');
  end if;
  if exists(select 1 from public.routine_run_task_items item where item.run_task_id=v_task.id
    and item.active_snapshot and item.required_snapshot and item.status not in ('completed','not_applicable')) then
    v_blockers:=v_blockers||jsonb_build_array('required_task_items_incomplete');
  end if;
  v_override_valid:=public.routine_override_is_current(v_task.current_override_id);
  if exists(select 1 from public.routine_deviations deviation where deviation.task_id=v_task.id
    and deviation.blocking and deviation.status in ('open','mitigated') and (
      deviation.severity='critical' or v_task.completion_policy_snapshot='standard_required'
    )) and not v_override_valid then
    v_blockers:=v_blockers||jsonb_build_array('open_blocking_deviation');
  end if;
  if v_task.status='blocked' and not v_override_valid then v_blockers:=v_blockers||jsonb_build_array('blocked_task_requires_override'); end if;
  if v_task.completion_policy_snapshot='manager_override' and not v_override_valid then
    v_blockers:=v_blockers||jsonb_build_array('manager_override_required');
  end if;
  if v_override_valid then v_outcome:='completed_with_manager_override';
  elsif v_task.initial_assessment='ready' and v_task.initial_assessment_policy_snapshot='ready_on_arrival' then v_outcome:='ready_on_arrival';
  elsif v_task.initial_assessment='correction_required' then v_outcome:='completed_after_correction';
  elsif v_task.task_type_snapshot='control' or v_task.initial_assessment_policy_snapshot='control_result' then
    if exists(select 1 from public.routine_deviations deviation where deviation.task_id=v_task.id
      and deviation.blocking and deviation.status in ('open','mitigated','accepted_temporarily'))
      then v_outcome:='control_completed_with_deviation'; else v_outcome:='control_passed'; end if;
  else v_outcome:='standard_met'; end if;
  return jsonb_build_object('valid',jsonb_array_length(v_blockers)=0,'blockers',v_blockers,
    'computedOutcome',v_outcome);
end;
$$;

create or replace function public.routine_apply_task_timing_completion(
  input_task_id uuid,
  input_effective_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare v_task public.routine_run_tasks%rowtype; v_timing public.routine_run_task_timings%rowtype;
  v_phase text; v_lateness bigint:=0; v_predecessor record; v_completed jsonb:='[]'::jsonb;
begin
  select task.* into v_task from public.routine_run_tasks task where task.id=input_task_id for update;
  select timing.* into v_timing from public.routine_run_task_timings timing where timing.task_id=input_task_id for update;
  if v_task.status not in ('completed','not_applicable','transferred') then
    raise exception using errcode='P0001', message='Timing completion requires handled routine work.';
  end if;
  if v_task.status='completed' and v_timing.start_at is not null
     and input_effective_at<v_timing.start_at then
    raise exception using errcode='P0001', message='routine_task_too_early';
  end if;
  if v_timing.target_at is null or input_effective_at<v_timing.target_at then v_phase:='before_target';
  elsif input_effective_at=v_timing.target_at then v_phase:='on_time';
  elsif v_timing.overdue_at is null or input_effective_at<v_timing.overdue_at then v_phase:='due';
  elsif v_timing.hard_deadline_at is null or input_effective_at<v_timing.hard_deadline_at then v_phase:='overdue';
  else v_phase:='after_hard_deadline'; end if;
  if v_timing.target_at is not null then
    v_lateness:=greatest(0,floor(extract(epoch from input_effective_at-v_timing.target_at))::bigint);
  end if;
  perform set_config('mesh.routine_run_internal','timing_completion',true);
  update public.routine_run_task_timings set current_phase='handled',completion_phase=v_phase,
    completion_lateness_seconds=v_lateness,last_evaluated_at=input_effective_at,
    revision=revision+1,updated_by_auth_user_id=v_task.completed_by_auth_user_id where id=v_timing.id;
  if v_timing.hard_deadline_deviation_id is not null then
    update public.routine_deviations set status='resolved',
      resolution_note='Resolved automatically when corrective task completion was recorded.',
      resolved_at=input_effective_at,resolved_by_auth_user_id=null,revision=revision+1
      where id=v_timing.hard_deadline_deviation_id and status in ('open','mitigated','accepted_temporarily');
    if found then
      perform public.routine_record_event(v_task.run_id,'timing_deviation_resolved','system',null,null,
        'Routine timing engine','system',jsonb_build_object('taskId',v_task.id,
          'deviationId',v_timing.hard_deadline_deviation_id),null,null,
        jsonb_build_object('completionPhase',v_phase,'latenessSeconds',v_lateness),null,1);
    end if;
  end if;
  for v_predecessor in
    select predecessor.* from public.routine_run_task_dependencies dependency
    join public.routine_run_tasks predecessor on predecessor.id=dependency.predecessor_run_task_id
    where dependency.successor_run_task_id=input_task_id
      and dependency.dependency_type_snapshot='complete_predecessor_on_successor'
    order by predecessor.id for update of predecessor
  loop
    if v_predecessor.status in ('in_progress','waiting')
       and not exists(select 1 from public.routine_run_task_items item
         where item.run_task_id=v_predecessor.id and item.required_snapshot and item.active_snapshot
           and item.status not in ('completed','not_applicable'))
       and not exists(select 1 from public.routine_deviations deviation
         where deviation.task_id=v_predecessor.id and deviation.blocking
           and deviation.status in ('open','mitigated','accepted_temporarily')) then
      perform set_config('mesh.routine_run_internal','system_completion',true);
      update public.routine_run_tasks set status='completed',outcome='system_completed',
        completed_at=input_effective_at,completed_by_auth_user_id=v_task.completed_by_auth_user_id,
        waiting_reason=null,revision=revision+1,last_status_changed_at=input_effective_at,
        last_status_changed_by_auth_user_id=null where id=v_predecessor.id;
      update public.routine_run_task_timings set current_phase='handled',
        completion_phase=case when target_at is null or input_effective_at<target_at then 'before_target'
          when input_effective_at=target_at then 'on_time'
          when overdue_at is null or input_effective_at<overdue_at then 'due'
          when hard_deadline_at is null or input_effective_at<hard_deadline_at then 'overdue'
          else 'after_hard_deadline' end,
        completion_lateness_seconds=case when target_at is null then 0 else
          greatest(0,floor(extract(epoch from input_effective_at-target_at))::bigint) end,
        last_evaluated_at=input_effective_at,revision=revision+1,updated_by_auth_user_id=null
        where task_id=v_predecessor.id;
      update public.routine_runs set revision=revision+1,
        updated_by_auth_user_id=coalesce(auth.uid(),created_by_auth_user_id) where id=v_task.run_id;
      perform public.routine_record_event(v_task.run_id,'task_system_completed','system',null,null,
        'Routine timing engine','system',jsonb_build_object('taskId',v_predecessor.id),
        v_predecessor.revision,v_predecessor.revision+1,
        jsonb_build_object('successorTaskId',input_task_id,'outcome','system_completed'),null,1);
      v_completed:=v_completed||to_jsonb(v_predecessor.id);
    end if;
  end loop;
  return jsonb_build_object('completionPhase',v_phase,'completionLatenessSeconds',v_lateness,
    'systemCompletedTaskIds',v_completed);
end;
$$;

do $phase10f_lifecycle_rpc_rename$
begin
  if to_regprocedure('public.start_routine_run_phase10e(uuid,bigint,uuid)') is null then
    alter function public.start_routine_run(uuid,bigint,uuid) rename to start_routine_run_phase10e;
    alter function public.claim_routine_task(uuid,bigint,uuid) rename to claim_routine_task_phase10e;
    alter function public.start_routine_task(uuid,bigint,uuid) rename to start_routine_task_phase10e;
    alter function public.block_routine_task(uuid,text,text,text,text,timestamptz,bigint,uuid) rename to block_routine_task_phase10e;
    alter function public.mark_routine_task_not_applicable(uuid,text,bigint,uuid) rename to mark_routine_task_not_applicable_phase10e;
    alter function public.complete_routine_task(uuid,text,boolean,bigint,uuid) rename to complete_routine_task_phase10e;
    alter function public.reopen_routine_task(uuid,text,bigint,uuid) rename to reopen_routine_task_phase10e;
  end if;
  if to_regprocedure('public.verify_routine_task_phase10e(uuid,text,text,boolean,bigint,uuid)') is null then
    alter function public.verify_routine_task(uuid,text,text,boolean,bigint,uuid)
      rename to verify_routine_task_phase10e;
  end if;
end;
$phase10f_lifecycle_rpc_rename$;

create or replace function public.start_routine_run(input_run_id uuid,input_expected_revision bigint,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_now timestamptz:=clock_timestamp(); v_run public.routine_runs%rowtype; v_response jsonb; v_refresh jsonb;
begin
  select run.* into v_run from public.routine_runs run where run.id=input_run_id;
  if v_run.timing_snapshot_state='building' then raise exception using errcode='P0001', message='timing_snapshot_not_ready'; end if;
  if v_run.timing_snapshot_state<>'ready' or not (public.routine_verify_run_timing_snapshot(input_run_id)->>'valid')::boolean then
    raise exception using errcode='P0001', message='timing_snapshot_invalid';
  end if;
  perform public.routine_evaluate_run_conditions(input_run_id,v_now);
  v_response:=public.start_routine_run_phase10e(input_run_id,input_expected_revision,input_idempotency_key);
  if not coalesce((v_response->>'idempotentReplay')::boolean,false) then
    v_refresh:=public.routine_refresh_run_timing_internal(input_run_id,v_now);
    select run.* into v_run from public.routine_runs run where run.id=input_run_id;
    v_response:=v_response||jsonb_build_object('run',to_jsonb(v_run),'timingRefresh',v_refresh);
  end if;
  return v_response;
end;
$$;

create or replace function public.claim_routine_task(input_task_id uuid,input_expected_revision bigint,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$ declare v_gate jsonb; v_response jsonb; v_context record; v_run_id uuid;
  v_hash text; v_replay jsonb;
begin
  select task.run_id into v_run_id from public.routine_run_tasks task where task.id=input_task_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  v_hash:=public.routine_run_request_hash(jsonb_build_object(
    'taskId',input_task_id,'expectedRevision',input_expected_revision));
  v_replay:=public.routine_run_operation_replay(v_context.organization_id,
    v_context.actor_auth_user_id,'claim_task',input_idempotency_key,v_hash);
  if v_replay is not null then return v_replay; end if;
  v_gate:=public.routine_validate_task_timing_action(input_task_id,'claim',clock_timestamp());
  if not (v_gate->>'valid')::boolean then raise exception using errcode='P0001', message=v_gate->>'errorCode'; end if;
  v_response:=public.claim_routine_task_phase10e(input_task_id,input_expected_revision,input_idempotency_key);
  return v_response||jsonb_build_object('timing',v_gate->'phase');
end $$;

create or replace function public.start_routine_task(input_task_id uuid,input_expected_revision bigint,input_idempotency_key uuid)
returns jsonb
language plpgsql security definer set search_path=pg_catalog
as $$
declare v_context record; v_task public.routine_run_tasks%rowtype; v_run public.routine_runs%rowtype;
  v_run_id uuid; v_now timestamptz:=clock_timestamp(); v_hash text; v_replay jsonb;
  v_response jsonb; v_previous bigint; v_dependency jsonb; v_gate jsonb;
begin
  select task.run_id into v_run_id from public.routine_run_tasks task where task.id=input_task_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  if v_context.participant_id is null then raise exception using errcode='P0001', message='An active run participant is required to start a task.'; end if;
  v_hash:=public.routine_run_request_hash(jsonb_build_object('taskId',input_task_id,'expectedRevision',input_expected_revision));
  v_replay:=public.routine_run_operation_replay(v_context.organization_id,v_context.actor_auth_user_id,'start_task',input_idempotency_key,v_hash);
  if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id=v_run_id for update;
  select task.* into v_task from public.routine_run_tasks task where task.id=input_task_id for update;
  if v_task.revision<>input_expected_revision then raise exception using errcode='40001', message='Stale routine task revision; refresh before starting.'; end if;
  if v_run.status not in ('in_progress','reopened') or v_task.inclusion_state<>'included'
     or v_task.status not in ('not_started','waiting') then raise exception using errcode='P0001', message='Routine task is not available to start.'; end if;
  v_gate:=public.routine_validate_task_timing_action(input_task_id,'start',v_now);
  if not (v_gate->>'valid')::boolean then raise exception using errcode='P0001', message=v_gate->>'errorCode'; end if;
  v_dependency:=public.routine_task_dependency_validation_at(input_task_id,v_now);
  if not (v_dependency->>'valid')::boolean then raise exception using errcode='P0001', message=v_dependency->'blockers'->>0; end if;
  if v_task.assigned_participant_id is not null and v_task.assigned_participant_id<>v_context.participant_id then
    raise exception using errcode='P0001', message='Routine task is assigned to another participant.';
  end if;
  perform public.routine_open_hard_deadline_deviation(input_task_id,v_now);
  v_previous:=v_task.revision; perform set_config('mesh.routine_run_internal','lifecycle',true);
  update public.routine_run_tasks set status='in_progress',waiting_reason=null,
    assigned_participant_id=coalesce(assigned_participant_id,v_context.participant_id),
    claimed_at=coalesce(claimed_at,v_now),started_at=coalesce(started_at,v_now),
    started_by_auth_user_id=coalesce(started_by_auth_user_id,v_context.actor_auth_user_id),
    revision=revision+1,last_status_changed_at=v_now,
    last_status_changed_by_auth_user_id=v_context.actor_auth_user_id where id=v_task.id returning * into v_task;
  update public.routine_runs set revision=revision+1,updated_by_auth_user_id=v_context.actor_auth_user_id
    where id=v_run.id returning * into v_run;
  v_response:=jsonb_build_object('task',to_jsonb(v_task),'runRevision',v_run.revision,
    'timing',v_gate->'phase','idempotentReplay',false);
  perform public.routine_complete_lifecycle_operation(v_context.organization_id,v_context.actor_auth_user_id,
    v_context.actor_profile_id,v_context.actor_display_name,v_context.actor_role,'start_task',input_idempotency_key,
    v_hash,'task',v_task.id,v_response,v_run.id,'task_started',jsonb_build_object('taskId',v_task.id),
    v_previous,v_task.revision,jsonb_build_object('participantId',v_context.participant_id));
  return v_response;
end;
$$;

create or replace function public.block_routine_task(input_task_id uuid,input_category text,input_reason_code text,
  input_details text,input_severity text,input_due_at timestamptz,input_expected_revision bigint,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$ declare v_gate jsonb; v_response jsonb; begin
  v_gate:=public.routine_validate_task_timing_action(input_task_id,'block',clock_timestamp());
  if not (v_gate->>'valid')::boolean then raise exception using errcode='P0001', message=v_gate->>'errorCode'; end if;
  v_response:=public.block_routine_task_phase10e(input_task_id,input_category,input_reason_code,input_details,
    input_severity,input_due_at,input_expected_revision,input_idempotency_key);
  return v_response||jsonb_build_object('timing',v_gate->'phase');
end $$;

create or replace function public.mark_routine_task_not_applicable(input_task_id uuid,input_reason text,
  input_expected_revision bigint,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$ declare v_gate jsonb; v_response jsonb; v_context record; v_run_id uuid;
  v_reason text:=nullif(trim(coalesce(input_reason,'')),''); v_hash text; v_replay jsonb;
begin
  select task.run_id into v_run_id from public.routine_run_tasks task where task.id=input_task_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  v_hash:=public.routine_run_request_hash(jsonb_build_object('taskId',input_task_id,
    'reason',v_reason,'expectedRevision',input_expected_revision));
  v_replay:=public.routine_run_operation_replay(v_context.organization_id,
    v_context.actor_auth_user_id,'task_not_applicable',input_idempotency_key,v_hash);
  if v_replay is not null then return v_replay; end if;
  v_gate:=public.routine_validate_task_timing_action(input_task_id,'not_applicable',clock_timestamp());
  if not (v_gate->>'valid')::boolean then raise exception using errcode='P0001', message=v_gate->>'errorCode'; end if;
  v_response:=public.mark_routine_task_not_applicable_phase10e(input_task_id,input_reason,input_expected_revision,input_idempotency_key);
  perform public.routine_apply_task_timing_completion(input_task_id,
    (select last_status_changed_at from public.routine_run_tasks where id=input_task_id));
  return v_response;
end $$;

create or replace function public.complete_routine_task(input_task_id uuid,input_completion_note text,
  input_critical_confirmation boolean,input_expected_revision bigint,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$ declare v_now timestamptz:=clock_timestamp(); v_gate jsonb; v_response jsonb;
  v_context record; v_run_id uuid; v_note text:=nullif(trim(coalesce(input_completion_note,'')),'');
  v_hash text; v_replay jsonb;
begin
  select task.run_id into v_run_id from public.routine_run_tasks task where task.id=input_task_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  v_hash:=public.routine_run_request_hash(jsonb_build_object('taskId',input_task_id,
    'completionNote',v_note,'criticalConfirmation',coalesce(input_critical_confirmation,false),
    'expectedRevision',input_expected_revision));
  v_replay:=public.routine_run_operation_replay(v_context.organization_id,
    v_context.actor_auth_user_id,'complete_task',input_idempotency_key,v_hash);
  if v_replay is not null then return v_replay; end if;
  v_gate:=public.routine_validate_task_timing_action(input_task_id,'complete',v_now);
  if not (v_gate->>'valid')::boolean then raise exception using errcode='P0001', message=v_gate->>'errorCode'; end if;
  perform public.routine_open_hard_deadline_deviation(input_task_id,v_now);
  v_response:=public.complete_routine_task_phase10e(input_task_id,input_completion_note,input_critical_confirmation,
    input_expected_revision,input_idempotency_key);
  if not coalesce((v_response->>'idempotentReplay')::boolean,false) then
    perform public.routine_apply_task_timing_completion(input_task_id,
      (select completed_at from public.routine_run_tasks where id=input_task_id));
  end if;
  return v_response;
end $$;

create or replace function public.reopen_routine_task(input_task_id uuid,input_reason text,
  input_expected_revision bigint,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$ declare v_response jsonb; begin
  v_response:=public.reopen_routine_task_phase10e(input_task_id,input_reason,input_expected_revision,input_idempotency_key);
  if not coalesce((v_response->>'idempotentReplay')::boolean,false) then
    perform set_config('mesh.routine_run_internal','timing_reopen',true);
    update public.routine_run_task_timings set completion_phase=null,completion_lateness_seconds=null,
      current_phase=(public.routine_compute_task_timing_phase(input_task_id,clock_timestamp())->>'phase'),
      revision=revision+1,updated_by_auth_user_id=auth.uid() where task_id=input_task_id;
  end if;
  return v_response;
end $$;

create or replace function public.verify_routine_task(
  input_task_id uuid,input_result text,input_note text,
  input_physical_recheck_confirmed boolean,input_expected_task_revision bigint,
  input_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$ declare v_gate jsonb; v_response jsonb; v_context record; v_run_id uuid;
  v_result text:=lower(trim(coalesce(input_result,'')));
  v_note text:=nullif(trim(coalesce(input_note,'')),''); v_hash text; v_replay jsonb;
begin
  select task.run_id into v_run_id from public.routine_run_tasks task where task.id=input_task_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  v_hash:=public.routine_run_request_hash(jsonb_build_object('taskId',input_task_id,
    'result',v_result,'note',v_note,
    'physicalRecheckConfirmed',coalesce(input_physical_recheck_confirmed,false),
    'expectedTaskRevision',input_expected_task_revision));
  v_replay:=public.routine_run_operation_replay(v_context.organization_id,
    v_context.actor_auth_user_id,'verify_task',input_idempotency_key,v_hash);
  if v_replay is not null then
    return v_replay||jsonb_build_object('timingHistory',(
      select jsonb_build_object('completionPhase',timing.completion_phase,
        'completionLatenessSeconds',timing.completion_lateness_seconds,
        'hardDeadlineDeviationId',timing.hard_deadline_deviation_id)
      from public.routine_run_task_timings timing where timing.task_id=input_task_id));
  end if;
  v_gate:=public.routine_validate_task_timing_action(input_task_id,'verify',clock_timestamp());
  if not (v_gate->>'valid')::boolean then
    raise exception using errcode='P0001', message=v_gate->>'errorCode';
  end if;
  v_response:=public.verify_routine_task_phase10e(input_task_id,input_result,input_note,
    input_physical_recheck_confirmed,input_expected_task_revision,input_idempotency_key);
  return v_response||jsonb_build_object('timingHistory',(
    select jsonb_build_object('completionPhase',timing.completion_phase,
      'completionLatenessSeconds',timing.completion_lateness_seconds,
      'hardDeadlineDeviationId',timing.hard_deadline_deviation_id)
    from public.routine_run_task_timings timing where timing.task_id=input_task_id
  ));
end $$;

create or replace function public.supersede_routine_run_operational_date(
  input_run_id uuid,
  input_replacement_operational_date date,
  input_reason text,
  input_expected_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare v_context record; v_original public.routine_runs%rowtype; v_replacement public.routine_runs%rowtype;
  v_reason text:=nullif(trim(coalesce(input_reason,'')),''); v_hash text; v_replay jsonb;
  v_create jsonb; v_response jsonb; v_supersession_id uuid:=gen_random_uuid(); v_operation_id uuid;
  v_participant record; v_new_participant_id uuid;
begin
  select * into v_context from public.routine_lifecycle_context(input_run_id);
  if not v_context.is_manager then raise exception using errcode='42501', message='Manager authority is required to supersede a routine run date.'; end if;
  if v_reason is null or char_length(v_reason)>4000 or input_replacement_operational_date is null
     or input_expected_revision is null or input_idempotency_key is null then
    raise exception using errcode='P0001', message='Replacement date, reason, expected revision, and idempotency key are required.';
  end if;
  v_hash:=public.routine_run_request_hash(jsonb_build_object('runId',input_run_id,
    'replacementOperationalDate',input_replacement_operational_date,'reason',v_reason,
    'expectedRevision',input_expected_revision));
  v_replay:=public.routine_run_operation_replay(v_context.organization_id,v_context.actor_auth_user_id,
    'supersede_run_date',input_idempotency_key,v_hash);
  if v_replay is not null then return v_replay; end if;
  select run.* into v_original from public.routine_runs run where run.id=input_run_id for update;
  v_replay:=public.routine_run_operation_replay(v_context.organization_id,v_context.actor_auth_user_id,
    'supersede_run_date',input_idempotency_key,v_hash);
  if v_replay is not null then return v_replay; end if;
  if v_original.revision<>input_expected_revision then raise exception using errcode='40001', message='Stale routine run revision.'; end if;
  if input_replacement_operational_date=v_original.operational_date then
    raise exception using errcode='P0001', message='Replacement operational date must differ from the original date.';
  end if;
  if v_original.status<>'scheduled' or v_original.started_at is not null
     or exists(select 1 from public.routine_run_tasks task where task.run_id=input_run_id and (
       task.status<>'not_started' or task.started_at is not null or task.initial_assessment is not null)) then
    raise exception using errcode='P0001', message='started_run_date_correction_requires_history_correction';
  end if;
  if exists(select 1 from public.routine_deviations where run_id=input_run_id)
    or exists(select 1 from public.routine_handovers where from_run_id=input_run_id or to_run_id=input_run_id)
    or exists(select 1 from public.routine_run_transfers where from_run_id=input_run_id or target_run_id=input_run_id) then
    raise exception using errcode='P0001', message='Run date supersession requires an untouched scheduled run.';
  end if;
  if exists(select 1 from public.routine_run_date_supersessions where original_run_id=input_run_id) then
    raise exception using errcode='P0001', message='Routine run operational date was already superseded.';
  end if;
  v_create:=public.create_or_get_routine_run(v_original.routine_key,v_original.scope_key,
    input_replacement_operational_date,input_idempotency_key);
  select run.* into v_replacement from public.routine_runs run where run.id=(v_create->'run'->>'id')::uuid;
  if v_replacement.id=v_original.id then raise exception using errcode='P0001', message='Supersession requires a distinct replacement run.'; end if;
  for v_participant in
    select participant.* from public.routine_run_participants participant
    where participant.run_id=v_original.id and participant.participation_status not in ('removed','completed')
      and not exists(select 1 from public.routine_run_participants existing
        where existing.run_id=v_replacement.id and existing.user_profile_id=participant.user_profile_id)
    order by participant.id
  loop
    insert into public.routine_run_participants(organization_id,run_id,user_profile_id,
      display_name_snapshot,role_snapshot,participation_status,joined_at,creation_idempotency_key,
      created_by_auth_user_id,updated_by_auth_user_id)
    values(v_original.organization_id,v_replacement.id,v_participant.user_profile_id,
      v_participant.display_name_snapshot,v_participant.role_snapshot,
      case when v_participant.participation_status='assigned' then 'assigned' else 'active' end,
      clock_timestamp(),gen_random_uuid(),v_context.actor_auth_user_id,v_context.actor_auth_user_id);
  end loop;
  insert into public.routine_run_role_assignments(organization_id,run_id,participant_id,role_key,
    scope_key,status,assigned_at,assigned_by_auth_user_id,replacement_reason)
  select v_original.organization_id,v_replacement.id,new_participant.id,assignment.role_key,
    assignment.scope_key,'active',clock_timestamp(),v_context.actor_auth_user_id,
    'Copied from superseded run assignment '||assignment.id::text
  from public.routine_run_role_assignments assignment
  join public.routine_run_participants old_participant on old_participant.id=assignment.participant_id
  join public.routine_run_participants new_participant on new_participant.run_id=v_replacement.id
    and new_participant.user_profile_id=old_participant.user_profile_id
  where assignment.run_id=v_original.id and assignment.status='active'
  on conflict (run_id,role_key,scope_key) where status='active' do nothing;
  perform set_config('mesh.routine_run_internal','date_supersession',true);
  update public.routine_runs set status='superseded',revision=revision+1,
    updated_by_auth_user_id=v_context.actor_auth_user_id where id=v_original.id returning * into v_original;
  v_response:=jsonb_build_object('originalRun',to_jsonb(v_original),'replacementRun',to_jsonb(v_replacement),
    'supersessionId',v_supersession_id,'idempotentReplay',false);
  perform public.routine_record_run_operation(v_context.organization_id,v_context.actor_auth_user_id,
    'supersede_run_date',input_idempotency_key,v_hash,'supersession',v_supersession_id,v_response);
  v_operation_id:=public.routine_lifecycle_operation_id(v_context.organization_id,v_context.actor_auth_user_id,
    'supersede_run_date',input_idempotency_key);
  insert into public.routine_run_date_supersessions(id,organization_id,original_run_id,replacement_run_id,
    original_operational_date,replacement_operational_date,reason,operation_id,created_by_auth_user_id,
    created_by_name_snapshot)
  values(v_supersession_id,v_original.organization_id,v_original.id,v_replacement.id,
    v_original.operational_date,v_replacement.operational_date,v_reason,v_operation_id,
    v_context.actor_auth_user_id,v_context.actor_display_name);
  perform public.routine_record_event(v_original.id,'run_operational_date_superseded','user',
    v_context.actor_auth_user_id,v_context.actor_profile_id,v_context.actor_display_name,v_context.actor_role,
    '{}'::jsonb,input_expected_revision,v_original.revision,
    jsonb_build_object('replacementRunId',v_replacement.id,'replacementOperationalDate',v_replacement.operational_date,
      'reason',v_reason),v_operation_id,1);
  return v_response;
end;
$$;

create or replace function public.routine_validate_run_completion_time(input_run_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog
as $$
declare v_run public.routine_runs%rowtype; v_now timestamptz:=clock_timestamp();
  v_blockers jsonb:='[]'::jsonb; v_warnings jsonb:='[]'::jsonb;
  v_next timestamptz; v_overdue jsonb; v_hard jsonb; v_pending jsonb; v_counts jsonb;
begin
  select run.* into v_run from public.routine_runs run where run.id=input_run_id;
  if v_run.timing_snapshot_state='building' then v_blockers:=v_blockers||jsonb_build_array('timing_snapshot_not_ready');
  elsif v_run.timing_snapshot_state<>'ready' then v_blockers:=v_blockers||jsonb_build_array('timing_snapshot_invalid');
  elsif not (public.routine_verify_run_timing_snapshot(input_run_id)->>'valid')::boolean then
    v_blockers:=v_blockers||jsonb_build_array('timing_snapshot_hash_mismatch');
  end if;
  if exists(select 1 from public.routine_run_condition_evaluations condition
    where condition.run_id=input_run_id and condition.evaluation_state='error') then
    v_blockers:=v_blockers||jsonb_build_array('condition_evaluation_error');
  end if;
  if exists(select 1 from public.routine_run_condition_evaluations condition
    where condition.run_id=input_run_id and condition.evaluation_state='pending') then
    v_blockers:=v_blockers||jsonb_build_array('pending_condition_evaluation');
  end if;
  if exists(select 1 from public.routine_run_tasks task left join public.routine_run_task_timings timing on timing.task_id=task.id
    where task.run_id=input_run_id and task.inclusion_state='included'
      and (task.availability_mode_snapshot in ('time_window','continuous')
        or task.task_type_snapshot='checkpoint') and timing.id is null) then
    v_blockers:=v_blockers||jsonb_build_array('required_task_timing_missing');
  end if;
  if exists(select 1 from public.routine_run_tasks task
    join public.routine_run_task_timings timing on timing.task_id=task.id
    where task.run_id=input_run_id and task.inclusion_state='included'
      and task.mandatory_snapshot and timing.schedule_state='resolved'
      and task.status not in ('completed','not_applicable','transferred','cancelled')) then
    v_blockers:=v_blockers||jsonb_build_array('mandatory_scheduled_task_unhandled');
  end if;
  if exists(select 1 from public.routine_run_tasks task join public.routine_run_task_timings timing on timing.task_id=task.id
    where task.run_id=input_run_id and task.inclusion_state='included' and task.mandatory_snapshot
      and task.status not in ('completed','not_applicable','transferred','cancelled')
      and v_now<case when task.task_type_snapshot='checkpoint' then timing.target_at
        else timing.start_at end) then
    v_blockers:=v_blockers||jsonb_build_array('future_mandatory_task_window_not_reached');
  end if;
  if exists(select 1 from public.routine_run_tasks task where task.run_id=input_run_id
    and task.task_type_snapshot='continuous' and task.inclusion_state='included'
    and task.status not in ('completed','not_applicable','transferred','cancelled')) then
    v_blockers:=v_blockers||jsonb_build_array('continuous_task_still_open');
  end if;
  if exists(select 1 from public.routine_run_task_dependencies dependency
    where dependency.run_id=input_run_id and dependency.dependency_type_snapshot='must_reach_time'
      and not (public.routine_task_dependency_validation_at(dependency.successor_run_task_id,v_now)->>'valid')::boolean) then
    v_blockers:=v_blockers||jsonb_build_array('must_reach_time_dependency_pending');
  end if;
  if exists(select 1 from public.routine_run_tasks task join public.routine_run_task_timings timing on timing.task_id=task.id
    where task.run_id=input_run_id and task.status='completed'
      and timing.start_at is not null and task.completed_at<timing.start_at) then
    v_blockers:=v_blockers||jsonb_build_array('task_completed_before_start');
  end if;
  if exists(select 1 from public.routine_run_tasks task join public.routine_run_task_timings timing on timing.task_id=task.id
    where task.run_id=input_run_id and task.status='completed'
      and (timing.completion_phase is null or timing.completion_lateness_seconds is null)) then
    v_blockers:=v_blockers||jsonb_build_array('task_timing_result_missing');
  end if;
  if exists(select 1 from public.routine_run_task_timings timing where timing.run_id=input_run_id
    and timing.completion_phase in ('due','overdue')) then v_warnings:=v_warnings||jsonb_build_array('task_completed_late'); end if;
  if exists(select 1 from public.routine_run_task_timings timing where timing.run_id=input_run_id
    and timing.completion_phase='after_hard_deadline') then v_warnings:=v_warnings||jsonb_build_array('task_completed_after_hard_deadline'); end if;
  if exists(select 1 from public.routine_deviations deviation where deviation.run_id=input_run_id
    and not deviation.blocking and deviation.status<>'cancelled') then v_warnings:=v_warnings||jsonb_build_array('nonblocking_timing_deviation'); end if;
  if exists(select 1 from public.routine_run_condition_evaluations condition where condition.run_id=input_run_id
    and condition.evaluation_state='pending') then v_warnings:=v_warnings||jsonb_build_array('pending_external_condition'); end if;
  if exists(select 1 from public.routine_run_tasks task join public.routine_run_task_timings timing on timing.task_id=task.id
    where task.run_id=input_run_id and task.task_type_snapshot='checkpoint' and timing.target_at>v_now) then
    v_warnings:=v_warnings||jsonb_build_array('upcoming_future_checkpoint');
  end if;
  select min(case when task.task_type_snapshot='checkpoint' then timing.target_at
    else timing.start_at end) into v_next from public.routine_run_tasks task
    join public.routine_run_task_timings timing on timing.task_id=task.id
    where task.run_id=input_run_id and task.mandatory_snapshot and task.inclusion_state='included'
      and task.status not in ('completed','not_applicable','transferred','cancelled')
      and case when task.task_type_snapshot='checkpoint' then timing.target_at
        else timing.start_at end>v_now;
  select coalesce(jsonb_agg(task.id order by task.id),'[]'::jsonb) into v_overdue
    from public.routine_run_tasks task join public.routine_run_task_timings timing on timing.task_id=task.id
    where task.run_id=input_run_id and timing.current_phase='overdue';
  select coalesce(jsonb_agg(task.id order by task.id),'[]'::jsonb) into v_hard
    from public.routine_run_tasks task join public.routine_run_task_timings timing on timing.task_id=task.id
    where task.run_id=input_run_id and timing.current_phase='hard_deadline_passed';
  select coalesce(jsonb_agg(task.id order by task.id),'[]'::jsonb) into v_pending
    from public.routine_run_tasks task join public.routine_run_condition_evaluations condition on condition.run_task_id=task.id
    where task.run_id=input_run_id and condition.evaluation_state in ('pending','error');
  select jsonb_object_agg(current_phase,count_value) into v_counts from (
    select current_phase,count(*) count_value from public.routine_run_task_timings where run_id=input_run_id group by current_phase
  ) phases;
  return jsonb_build_object('valid',jsonb_array_length(v_blockers)=0,'blockers',v_blockers,'warnings',v_warnings,
    'timingCounts',coalesce(v_counts,'{}'::jsonb),'nextRequiredBoundaryAt',v_next,
    'overdueTaskIds',v_overdue,'hardDeadlineTaskIds',v_hard,'pendingConditionTaskIds',v_pending);
end;
$$;

create or replace function public.routine_validate_run_completion(input_run_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path=pg_catalog
as $$
declare v_core jsonb; v_time jsonb; v_delivery jsonb; v_blockers jsonb; v_warnings jsonb;
begin
  perform public.routine_evaluate_run_conditions(input_run_id,clock_timestamp());
  v_core:=public.routine_validate_run_completion_core(input_run_id);
  v_time:=public.routine_validate_run_completion_time(input_run_id);
  v_delivery:=public.routine_validate_run_completion_delivery(input_run_id);
  v_blockers:=coalesce(v_core->'blockers','[]'::jsonb)||coalesce(v_time->'blockers','[]'::jsonb)||coalesce(v_delivery->'blockers','[]'::jsonb);
  v_warnings:=coalesce(v_core->'warnings','[]'::jsonb)||coalesce(v_time->'warnings','[]'::jsonb)||coalesce(v_delivery->'warnings','[]'::jsonb);
  return jsonb_build_object('valid',jsonb_array_length(v_blockers)=0,'blockers',v_blockers,'warnings',v_warnings,
    'acceptedTransferCount',coalesce((v_core->>'acceptedTransferCount')::integer,0),
    'timing',v_time,'delivery',v_delivery);
end;
$$;

create or replace function public.get_routine_run_timing_state(input_run_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare v_context record; v_now timestamptz:=clock_timestamp(); v_run public.routine_runs%rowtype;
  v_operational public.routine_run_operational_contexts%rowtype;
begin
  select * into v_context from public.routine_lifecycle_context(input_run_id);
  select * into v_run from public.routine_runs where id=input_run_id;
  select * into v_operational from public.routine_run_operational_contexts where run_id=input_run_id;
  return jsonb_build_object('serverNow',v_now,'timezone',v_operational.timezone_snapshot,
    'operationalDate',v_run.operational_date,'cutoff',v_operational.operational_day_cutoff_snapshot,
    'timingSnapshotHash',v_run.timing_snapshot_hash,
    'timingSnapshotValid',coalesce((public.routine_verify_run_timing_snapshot(input_run_id)->>'valid')::boolean,false),
    'tasks',coalesce((select jsonb_agg(to_jsonb(timing)||jsonb_build_object(
      'live',public.routine_compute_task_timing_phase(timing.task_id,v_now),
      'dependency',public.routine_task_dependency_validation_at(timing.task_id,v_now)) order by task.task_key_snapshot)
      from public.routine_run_task_timings timing join public.routine_run_tasks task on task.id=timing.task_id
      where timing.run_id=input_run_id),'[]'::jsonb),
    'timingDeviations',coalesce((select jsonb_agg(to_jsonb(deviation) order by deviation.detected_at)
      from public.routine_deviations deviation where deviation.run_id=input_run_id and deviation.source_type='timing_issue'),'[]'::jsonb),
    'conditions',coalesce((select jsonb_agg(to_jsonb(condition) order by task.task_key_snapshot)
      from public.routine_run_condition_evaluations condition join public.routine_run_tasks task on task.id=condition.run_task_id
      where condition.run_id=input_run_id),'[]'::jsonb));
end $$;

create or replace function public.verify_routine_run_timing_snapshot(input_run_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$ declare v_context record; begin
  select * into v_context from public.routine_lifecycle_context(input_run_id);
  return public.routine_verify_run_timing_snapshot(input_run_id);
end $$;

create or replace function public.list_current_routine_runs()
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare v_actor record; v_now timestamptz:=clock_timestamp(); v_date date;
begin
  select * into v_actor from public.routine_resolve_actor();
  select operational_date into v_date from public.routine_derive_operational_date(v_actor.organization_id,v_now);
  return jsonb_build_object('serverNow',v_now,'operationalDate',v_date,'runs',coalesce((
    select jsonb_agg(to_jsonb(run) order by run.routine_key,run.scope_key,run.id)
    from public.routine_runs run where run.organization_id=v_actor.organization_id
      and run.operational_date=v_date and run.status not in ('cancelled','superseded')
      and (v_actor.actor_role in ('manager','shift_lead') or exists(
        select 1 from public.routine_run_participants participant
        where participant.run_id=run.id and participant.user_profile_id=v_actor.actor_profile_id
          and participant.participation_status not in ('removed','completed')))
  ),'[]'::jsonb));
end $$;

create or replace function public.get_routine_task_timing(input_task_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare v_run_id uuid; v_context record; v_now timestamptz:=clock_timestamp();
begin
  select run_id into v_run_id from public.routine_run_tasks where id=input_task_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  return jsonb_build_object('serverNow',v_now,
    'timing',(select to_jsonb(timing) from public.routine_run_task_timings timing where timing.task_id=input_task_id),
    'live',public.routine_compute_task_timing_phase(input_task_id,v_now),
    'dependency',public.routine_task_dependency_validation_at(input_task_id,v_now),
    'eventSummary',coalesce((select jsonb_object_agg(event_type,count_value) from (
      select event_type,count(*) count_value from public.routine_events where task_id=input_task_id group by event_type
    ) summary),'{}'::jsonb));
end $$;

do $phase10f_read_rpc_rename$
begin
  if to_regprocedure('public.get_routine_run_workspace_phase10e(uuid)') is null then
    alter function public.get_routine_run_workspace(uuid) rename to get_routine_run_workspace_phase10e;
    alter function public.verify_routine_run_snapshot(uuid) rename to verify_routine_run_snapshot_phase10e;
  end if;
end;
$phase10f_read_rpc_rename$;

create or replace function public.get_routine_run_workspace(input_run_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog
as $$ declare v_workspace jsonb; begin
  v_workspace:=public.get_routine_run_workspace_phase10e(input_run_id);
  return v_workspace||jsonb_build_object('timing',public.get_routine_run_timing_state(input_run_id),
    'completionValidation',public.routine_validate_run_completion(input_run_id),
    'sync',(v_workspace->'sync')||jsonb_build_object('readOnlyPhase','10F'));
end $$;

create or replace function public.verify_routine_run_snapshot(input_run_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$ declare v_core jsonb; begin
  v_core:=public.verify_routine_run_snapshot_phase10e(input_run_id);
  return v_core||jsonb_build_object('timing',public.verify_routine_run_timing_snapshot(input_run_id));
end $$;

alter table public.routine_run_operational_contexts enable row level security;
alter table public.routine_run_task_timings enable row level security;
alter table public.routine_run_date_supersessions enable row level security;

drop policy if exists routine_run_operational_contexts_read on public.routine_run_operational_contexts;
create policy routine_run_operational_contexts_read
on public.routine_run_operational_contexts for select to authenticated
using (
  organization_id=(select public.routine_current_user_organization_id())
  and public.routine_run_is_visible(run_id,organization_id)
);
drop policy if exists routine_run_task_timings_read on public.routine_run_task_timings;
create policy routine_run_task_timings_read
on public.routine_run_task_timings for select to authenticated
using (
  organization_id=(select public.routine_current_user_organization_id())
  and public.routine_run_is_visible(run_id,organization_id)
);
drop policy if exists routine_run_date_supersessions_manager_read on public.routine_run_date_supersessions;
create policy routine_run_date_supersessions_manager_read
on public.routine_run_date_supersessions for select to authenticated
using (
  organization_id=(select public.routine_current_user_organization_id())
  and (select public.routine_current_user_can_manage_templates())
);

revoke all privileges on table public.routine_run_operational_contexts from public,anon,authenticated;
revoke all privileges on table public.routine_run_task_timings from public,anon,authenticated;
revoke all privileges on table public.routine_run_date_supersessions from public,anon,authenticated;
grant select on table public.routine_run_operational_contexts,
  public.routine_run_task_timings,public.routine_run_date_supersessions to authenticated;

do $phase10f_function_privileges$
declare v_function record;
begin
  for v_function in
    select procedure.oid::regprocedure signature
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='public' and procedure.proname in (
      'routine_flags_are_valid','routine_capture_task_core_inclusion_snapshot',
      'routine_capture_condition_core_snapshot','routine_compute_run_snapshot_hash',
      'routine_operational_context_immutable_guard','routine_run_date_supersession_immutable_guard',
      'routine_run_task_timing_guard','routine_get_organization_time_settings',
      'routine_derive_operational_date','routine_compute_operational_context_hash',
      'routine_build_operational_context','routine_resolve_local_schedule_instant',
      'routine_absent_schedule_resolution','routine_compute_task_timing_hash',
      'routine_compute_run_timing_snapshot_hash','routine_validate_operational_context_insert',
      'routine_compute_task_timing_phase','routine_build_run_timing_snapshot',
      'routine_verify_run_timing_snapshot','routine_backfill_run_timing_snapshot',
      'routine_task_dependency_validation_at','routine_compare_condition_value',
      'routine_resolve_condition_fact','routine_evaluate_condition_node',
      'routine_evaluate_task_condition','routine_evaluate_run_conditions',
      'routine_open_hard_deadline_deviation','routine_start_eligible_continuous_tasks',
      'routine_refresh_run_timing_internal','routine_validate_task_timing_action',
      'routine_apply_task_timing_completion','create_or_get_routine_run_phase10e',
      'validate_routine_template_version_phase10e','start_routine_run_phase10e',
      'claim_routine_task_phase10e','start_routine_task_phase10e','block_routine_task_phase10e',
      'mark_routine_task_not_applicable_phase10e','complete_routine_task_phase10e',
      'reopen_routine_task_phase10e','verify_routine_task_phase10e',
      'get_routine_run_workspace_phase10e',
      'verify_routine_run_snapshot_phase10e'
    )
  loop
    execute format('revoke all on function %s from public, anon, authenticated',v_function.signature);
  end loop;
end;
$phase10f_function_privileges$;

revoke all on function public.replace_routine_organization_flags(jsonb,bigint,uuid) from public,anon,authenticated;
revoke all on function public.get_routine_operational_clock() from public,anon,authenticated;
revoke all on function public.create_or_get_routine_run(text,text,date,uuid) from public,anon,authenticated;
revoke all on function public.validate_routine_template_version(uuid,uuid[]) from public,anon,authenticated;
revoke all on function public.evaluate_routine_run_conditions(uuid,uuid) from public,anon,authenticated;
revoke all on function public.refresh_routine_run_timing(uuid,uuid) from public,anon,authenticated;
revoke all on function public.start_routine_run(uuid,bigint,uuid) from public,anon,authenticated;
revoke all on function public.claim_routine_task(uuid,bigint,uuid) from public,anon,authenticated;
revoke all on function public.start_routine_task(uuid,bigint,uuid) from public,anon,authenticated;
revoke all on function public.block_routine_task(uuid,text,text,text,text,timestamptz,bigint,uuid) from public,anon,authenticated;
revoke all on function public.mark_routine_task_not_applicable(uuid,text,bigint,uuid) from public,anon,authenticated;
revoke all on function public.complete_routine_task(uuid,text,boolean,bigint,uuid) from public,anon,authenticated;
revoke all on function public.reopen_routine_task(uuid,text,bigint,uuid) from public,anon,authenticated;
revoke all on function public.verify_routine_task(uuid,text,text,boolean,bigint,uuid) from public,anon,authenticated;
revoke all on function public.supersede_routine_run_operational_date(uuid,date,text,bigint,uuid) from public,anon,authenticated;
revoke all on function public.validate_routine_run_completion(uuid) from public,anon,authenticated;
revoke all on function public.get_routine_run_timing_state(uuid) from public,anon,authenticated;
revoke all on function public.verify_routine_run_timing_snapshot(uuid) from public,anon,authenticated;
revoke all on function public.list_current_routine_runs() from public,anon,authenticated;
revoke all on function public.get_routine_task_timing(uuid) from public,anon,authenticated;
revoke all on function public.get_routine_run_workspace(uuid) from public,anon,authenticated;
revoke all on function public.verify_routine_run_snapshot(uuid) from public,anon,authenticated;

grant execute on function public.replace_routine_organization_flags(jsonb,bigint,uuid) to authenticated;
grant execute on function public.get_routine_operational_clock() to authenticated;
grant execute on function public.create_or_get_routine_run(text,text,date,uuid) to authenticated;
grant execute on function public.validate_routine_template_version(uuid,uuid[]) to authenticated;
grant execute on function public.evaluate_routine_run_conditions(uuid,uuid) to authenticated;
grant execute on function public.refresh_routine_run_timing(uuid,uuid) to authenticated;
grant execute on function public.start_routine_run(uuid,bigint,uuid) to authenticated;
grant execute on function public.claim_routine_task(uuid,bigint,uuid) to authenticated;
grant execute on function public.start_routine_task(uuid,bigint,uuid) to authenticated;
grant execute on function public.block_routine_task(uuid,text,text,text,text,timestamptz,bigint,uuid) to authenticated;
grant execute on function public.mark_routine_task_not_applicable(uuid,text,bigint,uuid) to authenticated;
grant execute on function public.complete_routine_task(uuid,text,boolean,bigint,uuid) to authenticated;
grant execute on function public.reopen_routine_task(uuid,text,bigint,uuid) to authenticated;
grant execute on function public.verify_routine_task(uuid,text,text,boolean,bigint,uuid) to authenticated;
grant execute on function public.supersede_routine_run_operational_date(uuid,date,text,bigint,uuid) to authenticated;
grant execute on function public.validate_routine_run_completion(uuid) to authenticated;
grant execute on function public.get_routine_run_timing_state(uuid) to authenticated;
grant execute on function public.verify_routine_run_timing_snapshot(uuid) to authenticated;
grant execute on function public.list_current_routine_runs() to authenticated;
grant execute on function public.get_routine_task_timing(uuid) to authenticated;
grant execute on function public.get_routine_run_workspace(uuid) to authenticated;
grant execute on function public.verify_routine_run_snapshot(uuid) to authenticated;

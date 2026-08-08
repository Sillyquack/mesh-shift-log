-- Phase 10G: immutable Closing delivery records and next-Opening comparisons.
--
-- Apply after Phase 10A, 10A1, and Phase 10B through Phase 10F. This migration is additive and
-- repeatable. It seeds no routine content, creates no runs, and has no write
-- dependency on Inventory, Asset Registry, Event Operations, Auth config,
-- legacy routines, or either Inventory Storage surface.

create or replace function public.routine_delivery_evidence_keys_valid(input_keys text[])
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select input_keys is not null
    and not exists (
      select 1 from unnest(input_keys) key_value
      where key_value <> trim(key_value)
        or key_value !~ '^[a-z][a-z0-9]*(?:[-_:][a-z0-9]+)*$'
        or char_length(key_value) not between 1 and 200
    )
    and cardinality(input_keys) = cardinality(array(
      select distinct key_value from unnest(input_keys) key_value
    ))
$$;

create table if not exists public.routine_delivery_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  source_run_id uuid not null,
  operational_date date not null,
  source_routine_key_snapshot text not null,
  scope_key_snapshot text not null,
  source_template_id_snapshot uuid not null,
  source_template_version_id_snapshot uuid not null,
  source_template_version_number_snapshot bigint not null,
  source_template_content_hash_snapshot text not null,
  source_run_snapshot_hash_snapshot text not null,
  source_run_timing_snapshot_hash_snapshot text not null,
  source_run_revision_snapshot bigint not null,
  source_finish_sequence integer not null,
  supersedes_delivery_record_id uuid,
  final_run_verification_id uuid,
  responsibility_snapshot jsonb not null default '{}'::jsonb,
  run_verification_snapshot jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null,
  generated_by_auth_user_id uuid not null references auth.users(id),
  generated_by_name_snapshot text not null,
  record_hash text not null,
  created_at timestamptz not null default now(),
  constraint routine_delivery_records_source_run_fkey
    foreign key (source_run_id, organization_id)
    references public.routine_runs(id, organization_id),
  constraint routine_delivery_records_run_verification_fkey
    foreign key (final_run_verification_id, organization_id, source_run_id)
    references public.routine_run_verifications(id, organization_id, run_id),
  constraint routine_delivery_records_id_org_unique unique (id, organization_id),
  constraint routine_delivery_records_id_org_run_unique unique (id, organization_id, source_run_id),
  constraint routine_delivery_records_run_sequence_unique unique (source_run_id, source_finish_sequence),
  constraint routine_delivery_records_sequence_check check (source_finish_sequence > 0),
  constraint routine_delivery_records_revision_check check (
    source_run_revision_snapshot > 0 and source_template_version_number_snapshot > 0
  ),
  constraint routine_delivery_records_keys_check check (
    source_routine_key_snapshot = trim(source_routine_key_snapshot)
    and source_routine_key_snapshot ~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
    and char_length(source_routine_key_snapshot) between 1 and 80
    and scope_key_snapshot = trim(scope_key_snapshot)
    and scope_key_snapshot ~ '^[a-z][a-z0-9]*(?:[-_:][a-z0-9]+)*$'
    and char_length(scope_key_snapshot) between 1 and 120
  ),
  constraint routine_delivery_records_hashes_check check (
    source_template_content_hash_snapshot ~ '^[0-9a-f]{64}$'
    and source_run_snapshot_hash_snapshot ~ '^[0-9a-f]{64}$'
    and source_run_timing_snapshot_hash_snapshot ~ '^[0-9a-f]{64}$'
    and record_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint routine_delivery_records_json_check check (
    jsonb_typeof(responsibility_snapshot) = 'object'
    and jsonb_typeof(run_verification_snapshot) = 'object'
  ),
  constraint routine_delivery_records_actor_check check (
    generated_by_name_snapshot = trim(generated_by_name_snapshot)
    and char_length(generated_by_name_snapshot) between 1 and 200
  ),
  constraint routine_delivery_records_not_self_supersede check (
    supersedes_delivery_record_id is null or supersedes_delivery_record_id <> id
  )
);

do $phase10g_record_supersession_fkey$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'routine_delivery_records_supersedes_same_run_fkey'
      and conrelid = 'public.routine_delivery_records'::regclass
  ) then
    alter table public.routine_delivery_records
      add constraint routine_delivery_records_supersedes_same_run_fkey
      foreign key (supersedes_delivery_record_id, organization_id, source_run_id)
      references public.routine_delivery_records(id, organization_id, source_run_id);
  end if;
end;
$phase10g_record_supersession_fkey$;

create table if not exists public.routine_delivery_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  delivery_record_id uuid not null,
  source_run_id uuid not null,
  source_run_task_id uuid not null,
  source_run_relation_id uuid not null,
  delivery_key text not null,
  label text not null,
  category text not null,
  target_routine_key text not null,
  target_task_key text not null,
  comparison_mode text not null,
  required_snapshot boolean not null,
  allow_not_applicable_snapshot boolean not null,
  scope_policy_snapshot text not null,
  evidence_item_keys_snapshot text[] not null default '{}',
  require_valid_task_verification_snapshot boolean not null,
  require_valid_run_verification_snapshot boolean not null,
  sort_order_snapshot integer not null,
  reported_status text not null,
  source_task_status_snapshot text not null,
  source_task_outcome_snapshot text,
  source_task_initial_assessment_snapshot text,
  source_task_revision_snapshot bigint not null,
  source_task_completed_at_snapshot timestamptz,
  source_task_completed_by_auth_user_id_snapshot uuid references auth.users(id),
  source_task_completed_by_name_snapshot text,
  task_verification_snapshot jsonb not null default '{}'::jsonb,
  task_item_evidence_snapshot jsonb not null default '{}'::jsonb,
  deviation_snapshot jsonb not null default '{}'::jsonb,
  override_snapshot jsonb not null default '{}'::jsonb,
  standard_snapshot jsonb not null default '{}'::jsonb,
  reference_image_snapshot jsonb not null default '{}'::jsonb,
  item_hash text not null,
  created_at timestamptz not null default now(),
  constraint routine_delivery_items_record_same_run_fkey
    foreign key (delivery_record_id, organization_id, source_run_id)
    references public.routine_delivery_records(id, organization_id, source_run_id),
  constraint routine_delivery_items_task_same_run_fkey
    foreign key (source_run_task_id, organization_id, source_run_id)
    references public.routine_run_tasks(id, organization_id, run_id),
  constraint routine_delivery_items_relation_same_run_fkey
    foreign key (source_run_relation_id, organization_id, source_run_id)
    references public.routine_run_task_relations(id, organization_id, run_id),
  constraint routine_delivery_items_id_org_unique unique (id, organization_id),
  constraint routine_delivery_items_id_org_source_unique
    unique (id, organization_id, source_run_id, source_run_task_id, delivery_record_id),
  constraint routine_delivery_items_record_key_unique unique (delivery_record_id, delivery_key),
  constraint routine_delivery_items_record_target_unique
    unique (delivery_record_id, target_routine_key, target_task_key, scope_policy_snapshot),
  constraint routine_delivery_items_record_sort_unique unique (delivery_record_id, sort_order_snapshot),
  constraint routine_delivery_items_key_check check (
    delivery_key = trim(delivery_key)
    and delivery_key ~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
    and char_length(delivery_key) between 1 and 80
    and category = trim(category)
    and category ~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
    and char_length(category) between 1 and 80
    and target_routine_key = trim(target_routine_key)
    and target_routine_key ~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
    and char_length(target_routine_key) between 1 and 80
    and target_task_key = trim(target_task_key)
    and target_task_key ~ '^[A-Za-z][A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)*$'
    and char_length(target_task_key) between 1 and 80
  ),
  constraint routine_delivery_items_label_check check (
    label = trim(label) and char_length(label) between 1 and 200
  ),
  constraint routine_delivery_items_comparison_mode_check check (
    comparison_mode in ('ready_on_arrival', 'control_result')
  ),
  constraint routine_delivery_items_scope_policy_check check (scope_policy_snapshot = 'same_scope'),
  constraint routine_delivery_items_reported_status_check check (reported_status in (
    'delivered_to_standard', 'delivered_after_correction', 'delivered_with_override',
    'delivered_with_deviation', 'not_applicable', 'transferred', 'unavailable'
  )),
  constraint routine_delivery_items_source_status_check check (source_task_status_snapshot in (
    'not_started', 'in_progress', 'waiting', 'completed', 'blocked',
    'not_applicable', 'transferred', 'cancelled'
  )),
  constraint routine_delivery_items_source_revision_check check (source_task_revision_snapshot > 0),
  constraint routine_delivery_items_sort_check check (sort_order_snapshot >= 0),
  constraint routine_delivery_items_evidence_keys_check check (
    public.routine_delivery_evidence_keys_valid(evidence_item_keys_snapshot)
  ),
  constraint routine_delivery_items_json_check check (
    jsonb_typeof(task_verification_snapshot) = 'object'
    and jsonb_typeof(task_item_evidence_snapshot) = 'object'
    and jsonb_typeof(deviation_snapshot) = 'object'
    and jsonb_typeof(override_snapshot) = 'object'
    and jsonb_typeof(standard_snapshot) = 'object'
    and jsonb_typeof(reference_image_snapshot) = 'object'
  ),
  constraint routine_delivery_items_hash_check check (item_hash ~ '^[0-9a-f]{64}$'),
  constraint routine_delivery_items_completion_actor_check check (
    source_task_completed_by_name_snapshot is null
    or (source_task_completed_by_name_snapshot = trim(source_task_completed_by_name_snapshot)
      and char_length(source_task_completed_by_name_snapshot) between 1 and 200)
  )
);

create table if not exists public.routine_delivery_comparisons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  opening_run_id uuid not null,
  opening_task_id uuid not null,
  comparison_sequence bigint not null default 1,
  supersedes_comparison_id uuid,
  delivery_record_id uuid,
  delivery_item_id uuid,
  source_closing_run_id uuid,
  source_closing_task_id uuid,
  source_operational_date date,
  opening_operational_date date not null,
  opening_initial_assessment text not null,
  comparison_mode text not null,
  delivery_reported_status text,
  comparison_result text not null,
  previous_delivery_had_override boolean not null default false,
  previous_delivery_had_deviation boolean not null default false,
  linked_deviation_id uuid,
  assessment_operation_id uuid not null,
  compared_at timestamptz not null,
  compared_by_auth_user_id uuid not null references auth.users(id),
  compared_by_name_snapshot text not null,
  comparison_hash text not null,
  created_at timestamptz not null default now(),
  constraint routine_delivery_comparisons_opening_run_fkey
    foreign key (opening_run_id, organization_id)
    references public.routine_runs(id, organization_id),
  constraint routine_delivery_comparisons_opening_task_fkey
    foreign key (opening_task_id, organization_id, opening_run_id)
    references public.routine_run_tasks(id, organization_id, run_id),
  constraint routine_delivery_comparisons_record_fkey
    foreign key (delivery_record_id, organization_id, source_closing_run_id)
    references public.routine_delivery_records(id, organization_id, source_run_id),
  constraint routine_delivery_comparisons_item_source_fkey
    foreign key (delivery_item_id, organization_id, source_closing_run_id,
                 source_closing_task_id, delivery_record_id)
    references public.routine_delivery_items(
      id, organization_id, source_run_id, source_run_task_id, delivery_record_id
    ),
  constraint routine_delivery_comparisons_deviation_fkey
    foreign key (linked_deviation_id, organization_id, opening_run_id, opening_task_id)
    references public.routine_deviations(id, organization_id, run_id, task_id),
  constraint routine_delivery_comparisons_operation_fkey
    foreign key (assessment_operation_id, organization_id)
    references public.routine_run_operations(id, organization_id)
    deferrable initially deferred,
  constraint routine_delivery_comparisons_id_org_unique unique (id, organization_id),
  constraint routine_delivery_comparisons_identity_unique
    unique (id, organization_id, opening_run_id, opening_task_id),
  constraint routine_delivery_comparisons_task_sequence_unique unique (opening_task_id, comparison_sequence),
  constraint routine_delivery_comparisons_sequence_check check (comparison_sequence > 0),
  constraint routine_delivery_comparisons_first_shape_check check (
    (comparison_sequence = 1 and supersedes_comparison_id is null)
    or (comparison_sequence > 1 and supersedes_comparison_id is not null)
  ),
  constraint routine_delivery_comparisons_not_self_supersede check (
    supersedes_comparison_id is null or supersedes_comparison_id <> id
  ),
  constraint routine_delivery_comparisons_assessment_check check (
    opening_initial_assessment in ('ready', 'correction_required', 'control_issue_found')
  ),
  constraint routine_delivery_comparisons_mode_check check (
    comparison_mode in ('ready_on_arrival', 'control_result')
  ),
  constraint routine_delivery_comparisons_delivery_status_check check (
    delivery_reported_status is null or delivery_reported_status in (
      'delivered_to_standard', 'delivered_after_correction', 'delivered_with_override',
      'delivered_with_deviation', 'not_applicable', 'transferred', 'unavailable'
    )
  ),
  constraint routine_delivery_comparisons_result_check check (comparison_result in (
    'matched', 'mismatch', 'confirmed_prior_deviation', 'resolved_after_delivery',
    'no_previous_delivery', 'not_comparable'
  )),
  constraint routine_delivery_comparisons_delivery_shape_check check (
    (comparison_result = 'no_previous_delivery'
      and delivery_record_id is null and delivery_item_id is null
      and source_closing_run_id is null and source_closing_task_id is null
      and source_operational_date is null and delivery_reported_status is null)
    or (comparison_result <> 'no_previous_delivery'
      and delivery_record_id is not null and delivery_item_id is not null
      and source_closing_run_id is not null and source_closing_task_id is not null
      and source_operational_date is not null and delivery_reported_status is not null)
  ),
  constraint routine_delivery_comparisons_date_check check (
    source_operational_date is null or source_operational_date < opening_operational_date
  ),
  constraint routine_delivery_comparisons_actor_check check (
    compared_by_name_snapshot = trim(compared_by_name_snapshot)
    and char_length(compared_by_name_snapshot) between 1 and 200
  ),
  constraint routine_delivery_comparisons_hash_check check (comparison_hash ~ '^[0-9a-f]{64}$')
);

do $phase10g_comparison_supersession_fkey$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'routine_delivery_comparisons_supersedes_same_task_fkey'
      and conrelid = 'public.routine_delivery_comparisons'::regclass
  ) then
    alter table public.routine_delivery_comparisons
      add constraint routine_delivery_comparisons_supersedes_same_task_fkey
      foreign key (supersedes_comparison_id, organization_id, opening_run_id, opening_task_id)
      references public.routine_delivery_comparisons(id, organization_id, opening_run_id, opening_task_id);
  end if;
end;
$phase10g_comparison_supersession_fkey$;

create index if not exists routine_delivery_records_source_current_idx
  on public.routine_delivery_records (source_run_id, source_finish_sequence desc, id);
create index if not exists routine_delivery_records_org_date_idx
  on public.routine_delivery_records (organization_id, operational_date desc, source_routine_key_snapshot, scope_key_snapshot);
create index if not exists routine_delivery_records_supersedes_idx
  on public.routine_delivery_records (supersedes_delivery_record_id) where supersedes_delivery_record_id is not null;
create index if not exists routine_delivery_items_target_idx
  on public.routine_delivery_items (organization_id, target_routine_key, target_task_key, scope_policy_snapshot, delivery_record_id);
create index if not exists routine_delivery_items_source_task_idx
  on public.routine_delivery_items (source_run_task_id, source_run_id, delivery_record_id);
create index if not exists routine_delivery_items_relation_idx
  on public.routine_delivery_items (source_run_relation_id, source_run_id);
create index if not exists routine_delivery_comparisons_opening_idx
  on public.routine_delivery_comparisons (opening_run_id, opening_task_id, comparison_sequence desc);
create index if not exists routine_delivery_comparisons_delivery_idx
  on public.routine_delivery_comparisons (delivery_record_id, delivery_item_id);
create index if not exists routine_delivery_comparisons_result_idx
  on public.routine_delivery_comparisons (organization_id, opening_operational_date desc, comparison_result);

create or replace function public.routine_delivery_immutable_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = 'P0001', message = 'Routine delivery and comparison history is immutable.';
end;
$$;

create or replace function public.routine_delivery_insert_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare v_previous public.routine_delivery_records%rowtype;
begin
  if current_setting('mesh.routine_delivery_internal', true) is null then
    raise exception using errcode = '42501', message = 'Routine delivery rows can be created only by an authorized internal hook.';
  end if;
  if new.supersedes_delivery_record_id is not null then
    select record.* into v_previous
    from public.routine_delivery_records record
    where record.id = new.supersedes_delivery_record_id;
    if v_previous.id is null
       or v_previous.organization_id <> new.organization_id
       or v_previous.source_run_id <> new.source_run_id
       or v_previous.source_finish_sequence >= new.source_finish_sequence then
      raise exception using errcode = 'P0001', message = 'Delivery record supersession must advance the same source run.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.routine_delivery_item_insert_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if current_setting('mesh.routine_delivery_internal', true) is null then
    raise exception using errcode = '42501', message = 'Routine delivery rows can be created only by an authorized internal hook.';
  end if;
  if not exists (
    select 1 from public.routine_run_task_relations relation
    where relation.id = new.source_run_relation_id
      and relation.organization_id = new.organization_id
      and relation.run_id = new.source_run_id
      and relation.source_run_task_id = new.source_run_task_id
      and relation.relation_type_snapshot = 'delivery_comparison'
  ) then
    raise exception using errcode = 'P0001', message = 'Delivery item source must be a same-run delivery_comparison relation.';
  end if;
  return new;
end;
$$;

create or replace function public.routine_delivery_comparison_insert_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare v_previous public.routine_delivery_comparisons%rowtype; v_policy text; v_item public.routine_delivery_items%rowtype;
begin
  if current_setting('mesh.routine_delivery_internal', true) is null then
    raise exception using errcode = '42501', message = 'Routine comparisons can be created only by an authorized assessment hook.';
  end if;
  select task.initial_assessment_policy_snapshot into v_policy
  from public.routine_run_tasks task where task.id = new.opening_task_id;
  if v_policy is distinct from new.comparison_mode then
    raise exception using errcode = 'P0001', message = 'Opening assessment policy must match the delivery comparison mode.';
  end if;
  if new.comparison_sequence > 1 then
    select comparison.* into v_previous
    from public.routine_delivery_comparisons comparison
    where comparison.id = new.supersedes_comparison_id;
    if v_previous.id is null
       or v_previous.organization_id <> new.organization_id
       or v_previous.opening_run_id <> new.opening_run_id
       or v_previous.opening_task_id <> new.opening_task_id
       or v_previous.comparison_sequence <> new.comparison_sequence - 1 then
      raise exception using errcode = 'P0001', message = 'Comparison supersession must point to the immediately previous sequence.';
    end if;
  end if;
  if new.delivery_item_id is not null then
    select item.* into v_item from public.routine_delivery_items item where item.id = new.delivery_item_id;
    if v_item.comparison_mode is distinct from new.comparison_mode
       or v_item.reported_status is distinct from new.delivery_reported_status then
      raise exception using errcode = 'P0001', message = 'Comparison mode and status must match the immutable delivery item.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists routine_delivery_records_insert_guard on public.routine_delivery_records;
create trigger routine_delivery_records_insert_guard before insert on public.routine_delivery_records
for each row execute function public.routine_delivery_insert_guard();
drop trigger if exists routine_delivery_records_immutable on public.routine_delivery_records;
create trigger routine_delivery_records_immutable before update or delete on public.routine_delivery_records
for each row execute function public.routine_delivery_immutable_guard();
drop trigger if exists routine_delivery_items_insert_guard on public.routine_delivery_items;
create trigger routine_delivery_items_insert_guard before insert on public.routine_delivery_items
for each row execute function public.routine_delivery_item_insert_guard();
drop trigger if exists routine_delivery_items_immutable on public.routine_delivery_items;
create trigger routine_delivery_items_immutable before update or delete on public.routine_delivery_items
for each row execute function public.routine_delivery_immutable_guard();
drop trigger if exists routine_delivery_comparisons_insert_guard on public.routine_delivery_comparisons;
create trigger routine_delivery_comparisons_insert_guard before insert on public.routine_delivery_comparisons
for each row execute function public.routine_delivery_comparison_insert_guard();
drop trigger if exists routine_delivery_comparisons_immutable on public.routine_delivery_comparisons;
create trigger routine_delivery_comparisons_immutable before update or delete on public.routine_delivery_comparisons
for each row execute function public.routine_delivery_immutable_guard();

create or replace function public.routine_compute_delivery_item_hash(input_payload jsonb)
returns text
language sql
immutable
set search_path = pg_catalog
as $$ select public.routine_run_sha256(coalesce(input_payload, '{}'::jsonb)) $$;

create or replace function public.routine_compute_delivery_record_hash(input_payload jsonb)
returns text
language sql
immutable
set search_path = pg_catalog
as $$ select public.routine_run_sha256(coalesce(input_payload, '{}'::jsonb)) $$;

create or replace function public.routine_compute_delivery_comparison_hash(input_payload jsonb)
returns text
language sql
immutable
set search_path = pg_catalog
as $$ select public.routine_run_sha256(coalesce(input_payload, '{}'::jsonb)) $$;

create or replace function public.routine_reported_delivery_status(
  input_task_status text,
  input_task_outcome text,
  input_allow_not_applicable boolean
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when input_task_status = 'completed' and input_task_outcome in (
      'ready_on_arrival', 'standard_met', 'control_passed', 'system_completed'
    ) then 'delivered_to_standard'
    when input_task_status = 'completed' and input_task_outcome = 'completed_after_correction'
      then 'delivered_after_correction'
    when input_task_status = 'completed' and input_task_outcome = 'completed_with_manager_override'
      then 'delivered_with_override'
    when input_task_status = 'completed' and input_task_outcome = 'control_completed_with_deviation'
      then 'delivered_with_deviation'
    when input_task_status = 'not_applicable' and input_allow_not_applicable then 'not_applicable'
    when input_task_status = 'transferred' then 'transferred'
    else 'unavailable'
  end
$$;

create or replace function public.routine_validate_delivery_relation_metadata(input_metadata jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_input jsonb := coalesce(input_metadata, '{}'::jsonb);
  v_errors jsonb := '[]'::jsonb;
  v_keys text[];
  v_normalized jsonb;
begin
  if jsonb_typeof(v_input) <> 'object' then
    return jsonb_build_object('valid', false, 'blockers', jsonb_build_array('delivery_metadata_must_be_object'), 'metadata', '{}'::jsonb);
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_input) key_value
    where key_value not in (
      'deliveryKey', 'label', 'category', 'comparisonMode', 'required',
      'allowNotApplicable', 'scopePolicy', 'evidenceItemKeys',
      'requireValidTaskVerification', 'requireValidRunVerification'
    )
  ) then v_errors := v_errors || jsonb_build_array('delivery_metadata_unknown_field'); end if;
  if coalesce(v_input->>'deliveryKey', '') !~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
     or v_input->>'deliveryKey' is distinct from trim(v_input->>'deliveryKey')
     or char_length(coalesce(v_input->>'deliveryKey', '')) not between 1 and 80 then
    v_errors := v_errors || jsonb_build_array('delivery_key_invalid');
  end if;
  if nullif(trim(coalesce(v_input->>'label', '')), '') is null
     or v_input->>'label' is distinct from trim(v_input->>'label')
     or char_length(coalesce(v_input->>'label', '')) > 200 then
    v_errors := v_errors || jsonb_build_array('delivery_label_invalid');
  end if;
  if coalesce(v_input->>'category', 'general') !~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
     or char_length(coalesce(v_input->>'category', 'general')) > 80 then
    v_errors := v_errors || jsonb_build_array('delivery_category_invalid');
  end if;
  if coalesce(v_input->>'comparisonMode', '') not in ('ready_on_arrival', 'control_result') then
    v_errors := v_errors || jsonb_build_array('delivery_comparison_mode_invalid');
  end if;
  if coalesce(v_input->>'scopePolicy', '') <> 'same_scope' then
    v_errors := v_errors || jsonb_build_array('delivery_scope_policy_invalid');
  end if;
  if (v_input ? 'required' and jsonb_typeof(v_input->'required') <> 'boolean')
     or (v_input ? 'allowNotApplicable' and jsonb_typeof(v_input->'allowNotApplicable') <> 'boolean')
     or (v_input ? 'requireValidTaskVerification' and jsonb_typeof(v_input->'requireValidTaskVerification') <> 'boolean')
     or (v_input ? 'requireValidRunVerification' and jsonb_typeof(v_input->'requireValidRunVerification') <> 'boolean') then
    v_errors := v_errors || jsonb_build_array('delivery_boolean_metadata_invalid');
  end if;
  if v_input ? 'evidenceItemKeys' then
    if jsonb_typeof(v_input->'evidenceItemKeys') <> 'array' then
      v_errors := v_errors || jsonb_build_array('delivery_evidence_item_keys_must_be_array');
      v_keys := '{}'::text[];
    else
      select coalesce(array_agg(value order by ordinality), '{}'::text[]) into v_keys
      from jsonb_array_elements_text(v_input->'evidenceItemKeys') with ordinality entry(value, ordinality);
      if exists (
        select 1 from unnest(v_keys) key_value
        where key_value !~ '^[a-z][a-z0-9]*(?:[-_:][a-z0-9]+)*$'
          or key_value <> trim(key_value) or char_length(key_value) not between 1 and 200
      ) then v_errors := v_errors || jsonb_build_array('delivery_evidence_item_key_invalid'); end if;
      if cardinality(v_keys) <> cardinality(array(select distinct key_value from unnest(v_keys) key_value)) then
        v_errors := v_errors || jsonb_build_array('delivery_evidence_item_key_duplicate');
      end if;
    end if;
  else v_keys := '{}'::text[]; end if;
  v_normalized := jsonb_build_object(
    'deliveryKey', coalesce(v_input->>'deliveryKey', ''),
    'label', coalesce(v_input->>'label', ''),
    'category', coalesce(v_input->>'category', 'general'),
    'comparisonMode', coalesce(v_input->>'comparisonMode', ''),
    'required', coalesce((v_input->>'required')::boolean, true),
    'allowNotApplicable', coalesce((v_input->>'allowNotApplicable')::boolean, false),
    'scopePolicy', coalesce(v_input->>'scopePolicy', ''),
    'evidenceItemKeys', to_jsonb(coalesce(v_keys, '{}'::text[])),
    'requireValidTaskVerification', coalesce((v_input->>'requireValidTaskVerification')::boolean, false),
    'requireValidRunVerification', coalesce((v_input->>'requireValidRunVerification')::boolean, false)
  );
  return jsonb_build_object('valid', jsonb_array_length(v_errors) = 0, 'blockers', v_errors, 'metadata', v_normalized);
exception when invalid_text_representation then
  return jsonb_build_object('valid', false, 'blockers', jsonb_build_array('delivery_metadata_type_invalid'), 'metadata', '{}'::jsonb);
end;
$$;

do $phase10g_template_validator_rename$
begin
  if to_regprocedure('public.validate_routine_template_version_phase10f(uuid,uuid[])') is null then
    alter function public.validate_routine_template_version(uuid, uuid[])
      rename to validate_routine_template_version_phase10f;
  end if;
end;
$phase10g_template_validator_rename$;

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
  v_warnings jsonb;
  v_relation record;
  v_metadata jsonb;
  v_normalized jsonb;
  v_source public.routine_template_tasks%rowtype;
  v_version public.routine_template_versions%rowtype;
  v_template public.routine_templates%rowtype;
  v_target_version_id uuid;
  v_target_count integer;
  v_target_task public.routine_template_tasks%rowtype;
  v_batch uuid[] := coalesce(input_publication_version_ids, array[input_version_id]::uuid[]);
begin
  v_result := public.validate_routine_template_version_phase10f(input_version_id, input_publication_version_ids);
  v_blockers := coalesce(v_result->'blockers', '[]'::jsonb);
  v_warnings := coalesce(v_result->'warnings', '[]'::jsonb);
  select version.* into v_version from public.routine_template_versions version where version.id = input_version_id;
  select template.* into v_template from public.routine_templates template where template.id = v_version.template_id;

  if exists (
    select 1 from public.routine_template_task_relations relation
    where relation.version_id = input_version_id and relation.relation_type = 'delivery_comparison'
    group by relation.metadata->>'deliveryKey' having count(*) > 1
  ) then v_blockers := v_blockers || jsonb_build_array('delivery_key_duplicate'); end if;
  if exists (
    select 1 from public.routine_template_task_relations relation
    where relation.version_id = input_version_id and relation.relation_type = 'delivery_comparison'
    group by relation.target_routine_key, relation.target_task_key,
      coalesce(relation.metadata->>'scopePolicy', '') having count(*) > 1
  ) then v_blockers := v_blockers || jsonb_build_array('delivery_target_duplicate'); end if;

  for v_relation in
    select relation.*
    from public.routine_template_task_relations relation
    where relation.version_id = input_version_id
      and relation.organization_id = v_version.organization_id
      and relation.relation_type = 'delivery_comparison'
    order by relation.source_task_id, relation.target_routine_key, relation.target_task_key, relation.id
  loop
    v_metadata := public.routine_validate_delivery_relation_metadata(v_relation.metadata);
    v_normalized := coalesce(v_metadata->'metadata', '{}'::jsonb);
    if not coalesce((v_metadata->>'valid')::boolean, false) then
      v_blockers := v_blockers || coalesce(v_metadata->'blockers', '[]'::jsonb);
    end if;
    select task.* into v_source
    from public.routine_template_tasks task
    where task.id = v_relation.source_task_id
      and task.organization_id = v_version.organization_id
      and task.version_id = input_version_id;
    if v_source.id is null or not v_source.active then
      v_blockers := v_blockers || jsonb_build_array('delivery_source_task_missing_or_inactive');
      continue;
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(coalesce(v_normalized->'evidenceItemKeys', '[]'::jsonb)) key_value
      where not exists (
        select 1 from public.routine_template_task_items item
        where item.task_id = v_source.id and item.version_id = input_version_id
          and item.organization_id = v_version.organization_id
          and item.item_key = key_value and item.active
      )
    ) then v_blockers := v_blockers || jsonb_build_array('delivery_evidence_item_missing_or_inactive'); end if;
    if coalesce((v_normalized->>'required')::boolean, true)
       and v_source.not_applicable_policy <> 'forbidden'
       and not coalesce((v_normalized->>'allowNotApplicable')::boolean, false) then
      v_blockers := v_blockers || jsonb_build_array('delivery_required_not_applicable_contract_inconsistent');
    end if;
    if coalesce((v_normalized->>'requireValidTaskVerification')::boolean, false)
       and v_source.verification_policy = 'none' then
      v_blockers := v_blockers || jsonb_build_array('delivery_task_verification_contract_missing');
    end if;
    if coalesce((v_normalized->>'requireValidRunVerification')::boolean, false)
       and coalesce(v_source.metadata->>'runVerificationType', '') not in ('closing_responsible', 'manager', 'custom') then
      v_blockers := v_blockers || jsonb_build_array('delivery_run_verification_contract_missing');
    end if;

    select count(*), (array_agg(candidate.id order by candidate.id))[1]
      into v_target_count, v_target_version_id
    from (
      select distinct candidate_version.id
      from public.routine_templates target_template
      join public.routine_template_versions candidate_version
        on candidate_version.template_id = target_template.id
       and candidate_version.organization_id = target_template.organization_id
      where target_template.organization_id = v_version.organization_id
        and target_template.routine_key = v_relation.target_routine_key
        and (
          (candidate_version.id = any(v_batch) and candidate_version.state = 'draft')
          or (
            candidate_version.id = target_template.current_published_version_id
            and not exists (
              select 1
              from public.routine_template_versions batch_version
              where batch_version.template_id = target_template.id
                and batch_version.organization_id = target_template.organization_id
                and batch_version.id = any(v_batch)
                and batch_version.state = 'draft'
            )
          )
        )
    ) candidate;
    if v_target_count <> 1 then
      v_blockers := v_blockers || jsonb_build_array(
        case when v_target_count = 0 then 'delivery_target_version_missing' else 'delivery_target_version_ambiguous' end
      );
      if exists (
        select 1 from public.routine_templates other_template
        where other_template.routine_key = v_relation.target_routine_key
          and other_template.organization_id <> v_version.organization_id
      ) then v_blockers := v_blockers || jsonb_build_array('delivery_cross_organization_target_forbidden'); end if;
      continue;
    end if;
    select task.* into v_target_task
    from public.routine_template_tasks task
    join public.routine_template_sections section
      on section.id = task.section_id and section.version_id = task.version_id
     and section.organization_id = task.organization_id
    where task.version_id = v_target_version_id
      and task.organization_id = v_version.organization_id
      and task.task_key = v_relation.target_task_key
      and task.active and section.active;
    if v_target_task.id is null then
      v_blockers := v_blockers || jsonb_build_array('delivery_target_task_missing_or_inactive');
    elsif v_target_task.initial_assessment_policy is distinct from v_normalized->>'comparisonMode' then
      v_blockers := v_blockers || jsonb_build_array('delivery_target_assessment_policy_mismatch');
    end if;
    if v_template.routine_key = v_relation.target_routine_key
       and v_source.task_key = v_relation.target_task_key then
      v_blockers := v_blockers || jsonb_build_array('delivery_comparison_self_cycle');
    elsif v_target_task.id is not null and exists (
      select 1 from public.routine_template_task_relations reverse_relation
      where reverse_relation.version_id = v_target_version_id
        and reverse_relation.organization_id = v_version.organization_id
        and reverse_relation.source_task_id = v_target_task.id
        and reverse_relation.relation_type = 'delivery_comparison'
        and reverse_relation.target_routine_key = v_template.routine_key
        and reverse_relation.target_task_key = v_source.task_key
    ) then v_blockers := v_blockers || jsonb_build_array('delivery_comparison_cycle'); end if;

    if coalesce((v_normalized->>'required')::boolean, true)
       and coalesce((v_normalized->>'allowNotApplicable')::boolean, false) then
      v_warnings := v_warnings || jsonb_build_array('delivery_required_allows_not_applicable');
    end if;
    if v_source.completion_policy = 'manager_override' then
      v_warnings := v_warnings || jsonb_build_array('delivery_source_allows_manager_override');
    end if;
    if not exists (
      select 1 from public.routine_template_task_items item
      where item.task_id = v_source.id and item.active
    ) then v_warnings := v_warnings || jsonb_build_array('delivery_source_has_no_structured_evidence_items'); end if;
    if v_source.verification_policy <> 'none'
       and not coalesce((v_normalized->>'requireValidTaskVerification')::boolean, false) then
      v_warnings := v_warnings || jsonb_build_array('delivery_task_verification_recommended');
    end if;
    if exists (
      select 1 from public.routine_template_task_reference_images link
      join public.routine_reference_images reference on reference.id = link.reference_id
      join public.routine_reference_image_versions image_version on image_version.id = reference.current_version_id
      where link.task_id = v_source.id and link.active and image_version.state = 'placeholder'
    ) then v_warnings := v_warnings || jsonb_build_array('delivery_source_uses_placeholder_image'); end if;
  end loop;

  if exists (
    select 1
    from public.routine_template_task_relations relation
    where relation.version_id = any(v_batch) and relation.relation_type = 'delivery_comparison'
    group by relation.organization_id, relation.metadata->>'deliveryKey',
      relation.target_routine_key, relation.target_task_key
    having count(distinct relation.version_id) > 1
  ) then v_blockers := v_blockers || jsonb_build_array('delivery_publication_batch_target_ambiguous'); end if;

  return jsonb_set(
    jsonb_set(
      jsonb_set(v_result, '{blockers}', coalesce(v_blockers, '[]'::jsonb), true),
      '{warnings}', coalesce(v_warnings, '[]'::jsonb), true
    ),
    '{valid}', to_jsonb(jsonb_array_length(coalesce(v_blockers, '[]'::jsonb)) = 0), true
  );
end;
$$;

create or replace function public.routine_select_current_valid_task_verification(input_task_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce((
    select jsonb_build_object(
      'id', verification.id,
      'verificationType', verification.verification_policy_snapshot,
      'taskRevisionVerified', verification.task_revision_verified,
      'result', verification.result,
      'physicalRecheckConfirmed', verification.physical_recheck_confirmed,
      'completedByAuthUserId', verification.completed_by_auth_user_id_snapshot,
      'verifierParticipantId', verification.verifier_participant_id,
      'verifierAuthUserId', verification.verifier_auth_user_id,
      'verifierName', verification.verifier_name_snapshot,
      'verifiedAt', verification.verified_at
    )
    from public.routine_task_verifications verification
    join public.routine_run_tasks task on task.id = verification.task_id
    where verification.task_id = input_task_id
      and verification.organization_id = task.organization_id
      and verification.run_id = task.run_id
      and verification.task_revision_verified = task.revision
      and verification.result = 'passed'
    order by verification.verified_at desc, verification.id desc
    limit 1
  ), '{}'::jsonb)
$$;

create or replace function public.routine_select_current_valid_run_verification(input_run_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with current_run as (
    select run.*, case when run.status = 'finished' then run.revision - 1 else run.revision end verified_revision
    from public.routine_runs run where run.id = input_run_id
  ), selected as (
    select verification.*
    from public.routine_run_verifications verification
    join current_run run on run.id = verification.run_id
      and run.organization_id = verification.organization_id
    where verification.result = 'passed'
      and verification.run_revision_verified = run.verified_revision
      and not exists (
        select 1
        from public.routine_run_verification_items verification_item
        join public.routine_run_tasks task on task.id = verification_item.task_id
        where verification_item.run_verification_id = verification.id
          and verification_item.required
          and (verification_item.result <> 'passed'
            or verification_item.task_revision_verified <> task.revision)
      )
    order by verification.verified_at desc, verification.id desc
    limit 1
  )
  select coalesce((
    select jsonb_build_object(
      'id', selected.id,
      'verificationType', selected.verification_type,
      'runRevisionVerified', selected.run_revision_verified,
      'result', selected.result,
      'verifierParticipantId', selected.verifier_participant_id,
      'verifierAuthUserId', selected.verifier_auth_user_id,
      'verifierName', selected.verifier_name_snapshot,
      'verifiedAt', selected.verified_at,
      'taskRevisions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'taskId', item.task_id,
          'taskRevisionVerified', item.task_revision_verified,
          'required', item.required,
          'result', item.result,
          'physicalCheckConfirmed', item.physical_check_confirmed
        ) order by item.sort_order, item.task_id)
        from public.routine_run_verification_items item
        where item.run_verification_id = selected.id
      ), '[]'::jsonb)
    ) from selected
  ), '{}'::jsonb)
$$;

create or replace function public.routine_snapshot_delivery_responsibilities(input_run_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object('roles', coalesce(jsonb_agg(jsonb_build_object(
    'roleKey', assignment.role_key,
    'scope', assignment.scope_key,
    'participantId', participant.id,
    'profileId', participant.user_profile_id,
    'name', participant.display_name_snapshot,
    'role', participant.role_snapshot,
    'assignmentId', assignment.id,
    'assignedAt', assignment.assigned_at
  ) order by assignment.role_key, assignment.scope_key, assignment.id)
  filter (where assignment.id is not null), '[]'::jsonb))
  from public.routine_run_role_assignments assignment
  join public.routine_run_participants participant
    on participant.id = assignment.participant_id
   and participant.organization_id = assignment.organization_id
   and participant.run_id = assignment.run_id
  where assignment.run_id = input_run_id and assignment.status = 'active'
    and assignment.role_key in (
      'opening_responsible', 'closing_responsible', 'cash_register_responsible',
      'locking_alarm_responsible', 'asset_responsible', 'event_area_responsible'
    )
$$;

create or replace function public.routine_get_run_delivery_contract(input_run_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'relationId', relation.id,
    'sourceRunId', relation.run_id,
    'sourceTaskId', relation.source_run_task_id,
    'targetRoutineKey', relation.target_routine_key_snapshot,
    'targetTaskKey', relation.target_task_key_snapshot,
    'sortOrder', task.sort_order_snapshot,
    'metadataValidation', public.routine_validate_delivery_relation_metadata(relation.metadata_snapshot)
  ) order by task.sort_order_snapshot, relation.target_routine_key_snapshot,
    relation.target_task_key_snapshot, relation.id), '[]'::jsonb)
  from public.routine_run_task_relations relation
  join public.routine_run_tasks task
    on task.id = relation.source_run_task_id
   and task.organization_id = relation.organization_id
   and task.run_id = relation.run_id
  where relation.run_id = input_run_id
    and relation.relation_type_snapshot = 'delivery_comparison'
$$;

create or replace function public.routine_build_delivery_item_preview(input_relation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_relation public.routine_run_task_relations%rowtype;
  v_task public.routine_run_tasks%rowtype;
  v_metadata jsonb;
  v_keys text[];
  v_task_verification jsonb;
  v_evidence jsonb;
  v_deviations jsonb;
  v_overrides jsonb;
  v_standards jsonb;
  v_images jsonb;
  v_status text;
  v_completer_name text;
  v_payload jsonb;
begin
  select relation.* into v_relation
  from public.routine_run_task_relations relation
  where relation.id = input_relation_id and relation.relation_type_snapshot = 'delivery_comparison';
  if v_relation.id is null then
    return jsonb_build_object('valid', false, 'error', 'delivery_relation_missing');
  end if;
  select task.* into v_task from public.routine_run_tasks task
  where task.id = v_relation.source_run_task_id
    and task.organization_id = v_relation.organization_id
    and task.run_id = v_relation.run_id;
  v_metadata := public.routine_validate_delivery_relation_metadata(v_relation.metadata_snapshot);
  if not coalesce((v_metadata->>'valid')::boolean, false) or v_task.id is null then
    return jsonb_build_object('valid', false, 'error', 'delivery_relation_or_source_invalid',
      'metadataValidation', v_metadata);
  end if;
  v_metadata := v_metadata->'metadata';
  select coalesce(array_agg(value order by ordinality), '{}'::text[]) into v_keys
  from jsonb_array_elements_text(v_metadata->'evidenceItemKeys') with ordinality entry(value, ordinality);
  select profile.display_name into v_completer_name
  from public.user_profiles profile where profile.id = v_task.completed_by_auth_user_id;
  v_task_verification := public.routine_select_current_valid_task_verification(v_task.id);
  select jsonb_build_object('items', coalesce(jsonb_agg(jsonb_build_object(
    'itemId', item.id,
    'itemKey', item.item_key_snapshot,
    'label', item.label_snapshot,
    'itemType', item.item_type_snapshot,
    'required', item.required_snapshot,
    'sourceKind', item.source_kind_snapshot,
    'status', item.status,
    'value', item.value_json,
    'resultCode', item.result_code,
    'standardKey', item.standard_key_snapshot,
    'standardRevisionId', item.standard_revision_id_snapshot,
    'standardRevisionNumber', item.standard_revision_number_snapshot,
    'standardValue', item.standard_value_snapshot,
    'locationId', item.location_id_snapshot,
    'locationKey', item.location_key_snapshot,
    'locationName', item.location_name_snapshot,
    'externalSourceType', item.external_source_type_snapshot,
    'externalSourceId', item.external_source_id_snapshot,
    'externalSourceRevision', item.external_source_revision_snapshot,
    'sourceRecord', item.source_record_snapshot,
    'completedAt', item.completed_at,
    'completedByAuthUserId', item.completed_by_auth_user_id,
    'revision', item.revision
  ) order by item.sort_order_snapshot, item.item_key_snapshot, item.id), '[]'::jsonb))
  into v_evidence
  from public.routine_run_task_items item
  where item.run_task_id = v_task.id and item.active_snapshot
    and (cardinality(v_keys) = 0 or item.item_key_snapshot = any(v_keys));
  select jsonb_build_object('deviations', coalesce(jsonb_agg(jsonb_build_object(
    'id', deviation.id,
    'sourceType', deviation.source_type,
    'category', deviation.category,
    'reasonCode', deviation.reason_code,
    'severity', deviation.severity,
    'blocking', deviation.blocking,
    'status', deviation.status,
    'detectedAt', deviation.detected_at,
    'detectedByAuthUserId', deviation.detected_by_auth_user_id,
    'detectedByName', deviation.detected_by_name_snapshot,
    'resolvedAt', deviation.resolved_at,
    'resolvedByAuthUserId', deviation.resolved_by_auth_user_id,
    'linkedPreviousRunId', deviation.linked_previous_run_id,
    'linkedPreviousTaskId', deviation.linked_previous_task_id,
    'currentOverrideId', deviation.current_override_id,
    'revision', deviation.revision
  ) order by deviation.detected_at, deviation.id), '[]'::jsonb))
  into v_deviations
  from public.routine_deviations deviation where deviation.task_id = v_task.id;
  select jsonb_build_object(
    'overrides', coalesce(jsonb_agg(jsonb_build_object(
      'id', manager_override.id,
      'overrideType', manager_override.override_type,
      'reason', manager_override.reason,
      'remainingRisk', manager_override.remaining_risk,
      'temporaryMeasure', manager_override.temporary_measure,
      'followUpOwnerParticipantId', manager_override.follow_up_owner_participant_id,
      'followUpDueAt', manager_override.follow_up_due_at,
      'expiresAt', manager_override.expires_at,
      'supersedesOverrideId', manager_override.supersedes_override_id,
      'createdAt', manager_override.created_at,
      'createdByAuthUserId', manager_override.created_by_auth_user_id,
      'createdByName', manager_override.created_by_name_snapshot,
      'validAtFinish', manager_override.id = v_task.current_override_id
        and (manager_override.expires_at is null or manager_override.expires_at >= coalesce(v_task.completed_at, clock_timestamp()))
    ) order by manager_override.created_at, manager_override.id), '[]'::jsonb),
    'currentOverrideId', v_task.current_override_id
  ) into v_overrides
  from public.routine_manager_overrides manager_override where manager_override.task_id = v_task.id;
  select jsonb_build_object('standards', coalesce(jsonb_agg(jsonb_build_object(
    'itemKey', item.item_key_snapshot,
    'standardId', item.standard_id_snapshot,
    'standardKey', item.standard_key_snapshot,
    'standardRevisionId', item.standard_revision_id_snapshot,
    'standardRevisionNumber', item.standard_revision_number_snapshot,
    'standardValue', item.standard_value_snapshot
  ) order by item.sort_order_snapshot, item.item_key_snapshot)
  filter (where item.standard_id_snapshot is not null), '[]'::jsonb))
  into v_standards
  from public.routine_run_task_items item
  where item.run_task_id = v_task.id and item.active_snapshot
    and (cardinality(v_keys) = 0 or item.item_key_snapshot = any(v_keys));
  select jsonb_build_object('images', coalesce(jsonb_agg(jsonb_build_object(
    'referenceKey', image.reference_key_snapshot,
    'referenceLabel', image.reference_label_snapshot,
    'referenceVersionId', image.reference_version_id_snapshot,
    'referenceVersionNumber', image.reference_version_number_snapshot,
    'imageState', image.image_state_snapshot,
    'objectPath', image.object_path_snapshot,
    'mimeType', image.mime_type_snapshot,
    'byteSize', image.byte_size_snapshot,
    'caption', image.caption_snapshot,
    'altText', image.alt_text_snapshot,
    'placeholderText', image.placeholder_text_snapshot,
    'buttonLabel', image.button_label_snapshot,
    'contextNote', image.context_note_snapshot
  ) order by image.sort_order_snapshot, image.reference_key_snapshot,
    image.reference_version_id_snapshot), '[]'::jsonb))
  into v_images
  from public.routine_run_task_reference_images image
  where image.run_task_id = v_task.id and image.active_snapshot
    and (image.run_task_item_id is null or cardinality(v_keys) = 0 or exists (
      select 1 from public.routine_run_task_items item
      where item.id = image.run_task_item_id and item.item_key_snapshot = any(v_keys)
    ));
  v_status := public.routine_reported_delivery_status(
    v_task.status, v_task.outcome, (v_metadata->>'allowNotApplicable')::boolean
  );
  v_payload := jsonb_build_object(
    'contract', jsonb_build_object(
      'deliveryKey', v_metadata->>'deliveryKey', 'label', v_metadata->>'label',
      'category', v_metadata->>'category',
      'targetRoutineKey', v_relation.target_routine_key_snapshot,
      'targetTaskKey', v_relation.target_task_key_snapshot,
      'comparisonMode', v_metadata->>'comparisonMode',
      'required', (v_metadata->>'required')::boolean,
      'allowNotApplicable', (v_metadata->>'allowNotApplicable')::boolean,
      'scopePolicy', v_metadata->>'scopePolicy',
      'evidenceItemKeys', v_metadata->'evidenceItemKeys',
      'requireValidTaskVerification', (v_metadata->>'requireValidTaskVerification')::boolean,
      'requireValidRunVerification', (v_metadata->>'requireValidRunVerification')::boolean,
      'sortOrder', v_task.sort_order_snapshot
    ),
    'source', jsonb_build_object(
      'runId', v_task.run_id, 'taskId', v_task.id, 'relationId', v_relation.id,
      'taskKey', v_task.task_key_snapshot, 'status', v_task.status,
      'outcome', v_task.outcome, 'initialAssessment', v_task.initial_assessment,
      'revision', v_task.revision, 'completedAt', v_task.completed_at,
      'completedByAuthUserId', v_task.completed_by_auth_user_id,
      'completedByName', v_completer_name, 'reportedStatus', v_status
    ),
    'taskVerification', v_task_verification,
    'taskItemEvidence', v_evidence,
    'deviations', v_deviations,
    'overrides', v_overrides,
    'standards', v_standards,
    'referenceImages', v_images
  );
  return jsonb_build_object(
    'valid', true,
    'sourceRunId', v_task.run_id,
    'sourceTaskId', v_task.id,
    'sourceRelationId', v_relation.id,
    'deliveryKey', v_metadata->>'deliveryKey',
    'label', v_metadata->>'label',
    'category', v_metadata->>'category',
    'targetRoutineKey', v_relation.target_routine_key_snapshot,
    'targetTaskKey', v_relation.target_task_key_snapshot,
    'comparisonMode', v_metadata->>'comparisonMode',
    'required', (v_metadata->>'required')::boolean,
    'allowNotApplicable', (v_metadata->>'allowNotApplicable')::boolean,
    'scopePolicy', v_metadata->>'scopePolicy',
    'evidenceItemKeys', v_metadata->'evidenceItemKeys',
    'requireValidTaskVerification', (v_metadata->>'requireValidTaskVerification')::boolean,
    'requireValidRunVerification', (v_metadata->>'requireValidRunVerification')::boolean,
    'sortOrder', v_task.sort_order_snapshot,
    'reportedStatus', v_status,
    'sourceTaskStatus', v_task.status,
    'sourceTaskOutcome', v_task.outcome,
    'sourceTaskInitialAssessment', v_task.initial_assessment,
    'sourceTaskRevision', v_task.revision,
    'sourceTaskCompletedAt', v_task.completed_at,
    'sourceTaskCompletedByAuthUserId', v_task.completed_by_auth_user_id,
    'sourceTaskCompletedByName', v_completer_name,
    'taskVerificationSnapshot', v_task_verification,
    'taskItemEvidenceSnapshot', v_evidence,
    'deviationSnapshot', v_deviations,
    'overrideSnapshot', v_overrides,
    'standardSnapshot', v_standards,
    'referenceImageSnapshot', v_images,
    'hasPriorOverride', jsonb_array_length(v_overrides->'overrides') > 0,
    'hasPriorDeviation', jsonb_array_length(v_deviations->'deviations') > 0,
    'canonicalPayload', v_payload,
    'itemHash', public.routine_compute_delivery_item_hash(v_payload)
  );
end;
$$;

create or replace function public.routine_delivery_item_canonical_json(input_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'contract', jsonb_build_object(
      'deliveryKey', item.delivery_key, 'label', item.label,
      'category', item.category, 'targetRoutineKey', item.target_routine_key,
      'targetTaskKey', item.target_task_key, 'comparisonMode', item.comparison_mode,
      'required', item.required_snapshot,
      'allowNotApplicable', item.allow_not_applicable_snapshot,
      'scopePolicy', item.scope_policy_snapshot,
      'evidenceItemKeys', to_jsonb(item.evidence_item_keys_snapshot),
      'requireValidTaskVerification', item.require_valid_task_verification_snapshot,
      'requireValidRunVerification', item.require_valid_run_verification_snapshot,
      'sortOrder', item.sort_order_snapshot
    ),
    'source', jsonb_build_object(
      'runId', item.source_run_id, 'taskId', item.source_run_task_id,
      'relationId', item.source_run_relation_id, 'taskKey', task.task_key_snapshot,
      'status', item.source_task_status_snapshot,
      'outcome', item.source_task_outcome_snapshot,
      'initialAssessment', item.source_task_initial_assessment_snapshot,
      'revision', item.source_task_revision_snapshot,
      'completedAt', item.source_task_completed_at_snapshot,
      'completedByAuthUserId', item.source_task_completed_by_auth_user_id_snapshot,
      'completedByName', item.source_task_completed_by_name_snapshot,
      'reportedStatus', item.reported_status
    ),
    'taskVerification', item.task_verification_snapshot,
    'taskItemEvidence', item.task_item_evidence_snapshot,
    'deviations', item.deviation_snapshot,
    'overrides', item.override_snapshot,
    'standards', item.standard_snapshot,
    'referenceImages', item.reference_image_snapshot
  )
  from public.routine_delivery_items item
  join public.routine_run_tasks task on task.id = item.source_run_task_id
  where item.id = input_item_id
$$;

create or replace function public.routine_delivery_record_canonical_json(input_record_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'sourceRunId', record.source_run_id,
    'operationalDate', record.operational_date,
    'sourceRoutineKey', record.source_routine_key_snapshot,
    'scopeKey', record.scope_key_snapshot,
    'sourceTemplateId', record.source_template_id_snapshot,
    'sourceTemplateVersionId', record.source_template_version_id_snapshot,
    'sourceTemplateVersionNumber', record.source_template_version_number_snapshot,
    'sourceTemplateContentHash', record.source_template_content_hash_snapshot,
    'sourceRunSnapshotHash', record.source_run_snapshot_hash_snapshot,
    'sourceRunTimingSnapshotHash', record.source_run_timing_snapshot_hash_snapshot,
    'sourceRunRevision', record.source_run_revision_snapshot,
    'sourceFinishSequence', record.source_finish_sequence,
    'supersededRecordHash', previous.record_hash,
    'responsibilitySnapshot', record.responsibility_snapshot,
    'runVerificationSnapshot', record.run_verification_snapshot,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'deliveryKey', item.delivery_key,
        'sortOrder', item.sort_order_snapshot,
        'itemHash', item.item_hash
      ) order by item.sort_order_snapshot, item.delivery_key)
      from public.routine_delivery_items item where item.delivery_record_id = record.id
    ), '[]'::jsonb)
  )
  from public.routine_delivery_records record
  left join public.routine_delivery_records previous on previous.id = record.supersedes_delivery_record_id
  where record.id = input_record_id
$$;

create or replace function public.routine_verify_delivery_item(input_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'itemId', item.id,
    'valid', item.item_hash = public.routine_compute_delivery_item_hash(
      public.routine_delivery_item_canonical_json(item.id)
    ),
    'storedItemHash', item.item_hash,
    'recomputedItemHash', public.routine_compute_delivery_item_hash(
      public.routine_delivery_item_canonical_json(item.id)
    )
  )
  from public.routine_delivery_items item where item.id = input_item_id
$$;

create or replace function public.routine_verify_delivery_record(input_record_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_record public.routine_delivery_records%rowtype;
  v_run public.routine_runs%rowtype;
  v_recomputed text;
  v_items jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_supersession_valid boolean;
begin
  select record.* into v_record from public.routine_delivery_records record where record.id = input_record_id;
  if v_record.id is null then return jsonb_build_object('valid', false, 'errors', jsonb_build_array('delivery_record_not_found')); end if;
  select run.* into v_run from public.routine_runs run where run.id = v_record.source_run_id;
  v_recomputed := public.routine_compute_delivery_record_hash(
    public.routine_delivery_record_canonical_json(v_record.id)
  );
  select coalesce(jsonb_agg(public.routine_verify_delivery_item(item.id)
    order by item.sort_order_snapshot, item.delivery_key), '[]'::jsonb)
  into v_items from public.routine_delivery_items item where item.delivery_record_id = v_record.id;
  v_supersession_valid := v_record.supersedes_delivery_record_id is null or exists (
    select 1 from public.routine_delivery_records previous
    where previous.id = v_record.supersedes_delivery_record_id
      and previous.organization_id = v_record.organization_id
      and previous.source_run_id = v_record.source_run_id
      and previous.source_finish_sequence < v_record.source_finish_sequence
  );
  if v_record.record_hash <> v_recomputed then v_errors := v_errors || jsonb_build_array('delivery_record_hash_mismatch'); end if;
  if exists (select 1 from jsonb_array_elements(v_items) result where not (result->>'valid')::boolean) then
    v_errors := v_errors || jsonb_build_array('delivery_item_hash_mismatch');
  end if;
  if not v_supersession_valid then v_errors := v_errors || jsonb_build_array('delivery_supersession_invalid'); end if;
  return jsonb_build_object(
    'valid', jsonb_array_length(v_errors) = 0,
    'storedRecordHash', v_record.record_hash,
    'recomputedRecordHash', v_recomputed,
    'itemVerificationResults', v_items,
    'sourceFinishSequenceValid', v_record.source_finish_sequence = v_run.current_finish_sequence,
    'sourceRunCurrentStateValid', v_run.status = 'finished'
      and v_record.source_finish_sequence = v_run.current_finish_sequence,
    'supersessionIntegrity', v_supersession_valid,
    'errors', v_errors
  );
end;
$$;

create or replace function public.routine_preview_run_delivery(input_run_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_run public.routine_runs%rowtype;
  v_relation record;
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_responsibility jsonb;
  v_run_verification jsonb;
  v_expected_sequence integer;
  v_previous public.routine_delivery_records%rowtype;
  v_record_payload jsonb;
  v_record_hash text;
  v_required boolean;
  v_evidence_count integer;
  v_requested_count integer;
begin
  select run.* into v_run from public.routine_runs run where run.id = input_run_id;
  if v_run.id is null then return jsonb_build_object('hasDeliveryContract', false, 'valid', false,
    'blockers', jsonb_build_array('delivery_run_not_found'), 'warnings', '[]'::jsonb,
    'proposedItems', '[]'::jsonb); end if;
  if not exists (
    select 1 from public.routine_run_task_relations relation
    where relation.run_id = input_run_id and relation.relation_type_snapshot = 'delivery_comparison'
  ) then return jsonb_build_object(
    'hasDeliveryContract', false, 'valid', true, 'blockers', '[]'::jsonb,
    'warnings', '[]'::jsonb, 'proposedItems', '[]'::jsonb,
    'responsibilitySnapshot', public.routine_snapshot_delivery_responsibilities(input_run_id),
    'runVerificationSnapshot', public.routine_select_current_valid_run_verification(input_run_id),
    'expectedFinishSequence', case when v_run.status = 'finished' then v_run.current_finish_sequence else v_run.current_finish_sequence + 1 end,
    'previousDeliveryRecordId', null, 'proposedRecordHash', null
  ); end if;
  if v_run.snapshot_state <> 'ready' or v_run.snapshot_hash is null
     or not coalesce((public.routine_compute_run_snapshot_hash(input_run_id) = v_run.snapshot_hash), false) then
    v_blockers := v_blockers || jsonb_build_array('delivery_run_snapshot_not_ready_or_invalid');
  end if;
  if v_run.timing_snapshot_state <> 'ready' or v_run.timing_snapshot_hash is null
     or not coalesce((public.routine_verify_run_timing_snapshot(input_run_id)->>'valid')::boolean, false) then
    v_blockers := v_blockers || jsonb_build_array('delivery_timing_snapshot_not_ready_or_invalid');
  end if;
  if exists (
    select 1 from public.routine_run_task_relations relation
    where relation.run_id = input_run_id and relation.relation_type_snapshot = 'delivery_comparison'
      and not (public.routine_validate_delivery_relation_metadata(relation.metadata_snapshot)->>'valid')::boolean
  ) then v_blockers := v_blockers || jsonb_build_array('delivery_relation_metadata_invalid'); end if;
  if exists (
    select 1 from public.routine_run_task_relations relation
    where relation.run_id = input_run_id and relation.relation_type_snapshot = 'delivery_comparison'
    group by relation.metadata_snapshot->>'deliveryKey' having count(*) > 1
  ) then v_blockers := v_blockers || jsonb_build_array('delivery_key_duplicate'); end if;
  if exists (
    select 1 from public.routine_run_task_relations relation
    where relation.run_id = input_run_id and relation.relation_type_snapshot = 'delivery_comparison'
    group by relation.target_routine_key_snapshot, relation.target_task_key_snapshot,
      coalesce(relation.metadata_snapshot->>'scopePolicy', '') having count(*) > 1
  ) then v_blockers := v_blockers || jsonb_build_array('delivery_target_duplicate'); end if;

  for v_relation in
    select relation.*, task.sort_order_snapshot, task.status task_status,
      task.outcome task_outcome, task.mandatory_snapshot, task.current_override_id,
      task.verification_policy_snapshot, task.completed_at
    from public.routine_run_task_relations relation
    left join public.routine_run_tasks task
      on task.id = relation.source_run_task_id and task.run_id = relation.run_id
     and task.organization_id = relation.organization_id
    where relation.run_id = input_run_id and relation.relation_type_snapshot = 'delivery_comparison'
    order by task.sort_order_snapshot, relation.target_routine_key_snapshot,
      relation.target_task_key_snapshot, relation.id
  loop
    v_item := public.routine_build_delivery_item_preview(v_relation.id);
    if not coalesce((v_item->>'valid')::boolean, false) then
      v_blockers := v_blockers || jsonb_build_array('delivery_source_task_or_relation_invalid');
      continue;
    end if;
    v_required := coalesce((v_item->>'required')::boolean, true);
    if v_required and v_relation.task_status not in ('completed', 'not_applicable', 'transferred') then
      v_blockers := v_blockers || jsonb_build_array(
        case when v_relation.task_status = 'blocked' then 'delivery_required_source_task_blocked'
          else 'delivery_required_source_task_unhandled' end
      );
    end if;
    if v_required and v_relation.task_status = 'not_applicable'
       and not (v_item->>'allowNotApplicable')::boolean then
      v_blockers := v_blockers || jsonb_build_array('delivery_required_not_applicable_forbidden');
    elsif v_relation.task_status = 'not_applicable' then
      v_warnings := v_warnings || jsonb_build_array('delivery_allowed_not_applicable');
    end if;
    if v_relation.task_status = 'transferred' then
      v_blockers := v_blockers || jsonb_build_array('delivery_transfer_resolution_pending_phase10h');
    end if;
    if v_required and v_item->>'reportedStatus' = 'unavailable' then
      v_blockers := v_blockers || jsonb_build_array('delivery_source_status_outcome_inconsistent');
    end if;
    if exists (
      select 1 from public.routine_deviations deviation
      where deviation.task_id = v_relation.source_run_task_id and deviation.blocking
        and deviation.status in ('open', 'mitigated', 'accepted_temporarily')
    ) then v_blockers := v_blockers || jsonb_build_array('delivery_open_blocking_deviation'); end if;
    if v_relation.current_override_id is not null and not exists (
      select 1 from public.routine_manager_overrides manager_override
      where manager_override.id = v_relation.current_override_id
        and (manager_override.expires_at is null
          or manager_override.expires_at >= coalesce(v_relation.completed_at, clock_timestamp()))
    ) then v_blockers := v_blockers || jsonb_build_array('delivery_override_expired_or_invalid'); end if;
    if (v_item->>'requireValidTaskVerification')::boolean
       and v_item->'taskVerificationSnapshot' = '{}'::jsonb then
      v_blockers := v_blockers || jsonb_build_array('delivery_task_verification_missing_or_stale');
    elsif not (v_item->>'requireValidTaskVerification')::boolean
       and v_item->'taskVerificationSnapshot' <> '{}'::jsonb then
      v_warnings := v_warnings || jsonb_build_array('delivery_optional_task_verification_present');
    end if;
    v_requested_count := jsonb_array_length(v_item->'evidenceItemKeys');
    v_evidence_count := jsonb_array_length(v_item->'taskItemEvidenceSnapshot'->'items');
    if v_requested_count > 0 and v_evidence_count <> v_requested_count then
      v_blockers := v_blockers || jsonb_build_array('delivery_evidence_item_missing');
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_item->'taskItemEvidenceSnapshot'->'items') evidence
      where coalesce((evidence->>'required')::boolean, false)
        and evidence->>'status' not in ('completed', 'not_applicable')
    ) then v_blockers := v_blockers || jsonb_build_array('delivery_required_evidence_item_unhandled'); end if;
    if exists (
      select 1 from jsonb_array_elements(v_item->'taskItemEvidenceSnapshot'->'items') evidence
      where evidence->>'sourceKind' = 'routine_standard'
        and (evidence->>'standardRevisionId' is null or evidence->'standardValue' is null)
    ) then v_blockers := v_blockers || jsonb_build_array('delivery_standard_snapshot_missing'); end if;
    if exists (
      select 1 from jsonb_array_elements(v_item->'referenceImageSnapshot'->'images') image
      where image->>'imageState' = 'active_image'
        and (image->>'referenceVersionId' is null or image->>'objectPath' is null
          or image->>'mimeType' is null or image->>'byteSize' is null)
    ) then v_blockers := v_blockers || jsonb_build_array('delivery_reference_image_snapshot_invalid'); end if;
    if exists (
      select 1 from jsonb_array_elements(v_item->'referenceImageSnapshot'->'images') image
      where image->>'imageState' = 'placeholder'
    ) then v_warnings := v_warnings || jsonb_build_array('delivery_placeholder_image'); end if;
    if exists (
      select 1 from jsonb_array_elements(v_item->'referenceImageSnapshot'->'images') image
      where image->>'imageState' = 'active_image' and image->>'caption' is null
    ) then v_warnings := v_warnings || jsonb_build_array('delivery_image_caption_missing'); end if;
    if v_item->>'reportedStatus' = 'delivered_after_correction' then
      v_warnings := v_warnings || jsonb_build_array('delivery_after_correction');
    elsif v_item->>'reportedStatus' = 'delivered_with_override' then
      v_warnings := v_warnings || jsonb_build_array('delivery_with_override');
    elsif v_item->>'reportedStatus' = 'delivered_with_deviation' then
      v_warnings := v_warnings || jsonb_build_array('delivery_with_deviation');
    end if;
    if exists (
      select 1 from public.routine_run_task_timings timing
      where timing.task_id = v_relation.source_run_task_id
        and timing.completion_phase in ('due', 'overdue')
    ) then v_warnings := v_warnings || jsonb_build_array('delivery_source_completed_overdue'); end if;
    if exists (
      select 1 from public.routine_run_task_timings timing
      where timing.task_id = v_relation.source_run_task_id
        and timing.completion_phase = 'after_hard_deadline'
    ) then v_warnings := v_warnings || jsonb_build_array('delivery_source_completed_after_hard_deadline'); end if;
    v_items := v_items || jsonb_build_array(v_item - 'canonicalPayload');
  end loop;
  if exists (
    select 1 from public.routine_deviations deviation
    where deviation.run_id = input_run_id and not deviation.blocking
      and deviation.status <> 'cancelled'
  ) then v_warnings := v_warnings || jsonb_build_array('delivery_nonblocking_timing_deviation'); end if;

  v_responsibility := public.routine_snapshot_delivery_responsibilities(input_run_id);
  v_run_verification := public.routine_select_current_valid_run_verification(input_run_id);
  if exists (
    select 1 from jsonb_array_elements(v_items) item
    where (item->>'requireValidRunVerification')::boolean
  ) and v_run_verification = '{}'::jsonb then
    v_blockers := v_blockers || jsonb_build_array('delivery_run_verification_missing_or_stale');
  end if;
  v_expected_sequence := case when v_run.status = 'finished'
    then v_run.current_finish_sequence else v_run.current_finish_sequence + 1 end;
  select record.* into v_previous
  from public.routine_delivery_records record
  where record.source_run_id = input_run_id and record.source_finish_sequence < v_expected_sequence
  order by record.source_finish_sequence desc, record.id desc limit 1;
  if v_previous.id is not null then
    v_warnings := v_warnings || jsonb_build_array('delivery_previous_record_will_be_superseded');
  end if;
  v_record_payload := jsonb_build_object(
    'sourceRunId', v_run.id, 'operationalDate', v_run.operational_date,
    'sourceRoutineKey', v_run.routine_key, 'scopeKey', v_run.scope_key,
    'sourceTemplateId', v_run.template_id,
    'sourceTemplateVersionId', v_run.template_version_id,
    'sourceTemplateVersionNumber', v_run.template_version_number_snapshot,
    'sourceTemplateContentHash', v_run.template_content_hash_snapshot,
    'sourceRunSnapshotHash', v_run.snapshot_hash,
    'sourceRunTimingSnapshotHash', v_run.timing_snapshot_hash,
    'sourceRunRevision', case when v_run.status = 'finished' then v_run.revision else v_run.revision + 1 end,
    'sourceFinishSequence', v_expected_sequence,
    'supersededRecordHash', v_previous.record_hash,
    'responsibilitySnapshot', v_responsibility,
    'runVerificationSnapshot', v_run_verification,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'deliveryKey', item->>'deliveryKey', 'sortOrder', (item->>'sortOrder')::integer,
      'itemHash', item->>'itemHash'
    ) order by (item->>'sortOrder')::integer, item->>'deliveryKey')
      from jsonb_array_elements(v_items) item), '[]'::jsonb)
  );
  if jsonb_array_length(v_blockers) = 0 then
    v_record_hash := public.routine_compute_delivery_record_hash(v_record_payload);
    if v_record_hash !~ '^[0-9a-f]{64}$' or exists (
      select 1 from jsonb_array_elements(v_items) item where item->>'itemHash' !~ '^[0-9a-f]{64}$'
    ) then
      v_blockers := v_blockers || jsonb_build_array('delivery_hash_not_deterministic');
      v_record_hash := null;
    end if;
  end if;
  return jsonb_build_object(
    'hasDeliveryContract', true,
    'valid', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers,
    'warnings', v_warnings,
    'proposedItems', v_items,
    'responsibilitySnapshot', v_responsibility,
    'runVerificationSnapshot', v_run_verification,
    'expectedFinishSequence', v_expected_sequence,
    'previousDeliveryRecordId', v_previous.id,
    'proposedRecordHash', v_record_hash
  );
end;
$$;

create or replace function public.routine_validate_run_delivery_contract(input_run_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$ select public.routine_preview_run_delivery(input_run_id) $$;

create or replace function public.routine_validate_run_completion_delivery(input_run_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare v_preview jsonb;
begin
  v_preview := public.routine_preview_run_delivery(input_run_id);
  return jsonb_build_object(
    'valid', coalesce((v_preview->>'valid')::boolean, false),
    'blockers', coalesce(v_preview->'blockers', '[]'::jsonb),
    'warnings', coalesce(v_preview->'warnings', '[]'::jsonb),
    'deliveryContractPresent', coalesce((v_preview->>'hasDeliveryContract')::boolean, false),
    'deliveryValid', coalesce((v_preview->>'valid')::boolean, false),
    'deliveryBlockers', coalesce(v_preview->'blockers', '[]'::jsonb),
    'deliveryWarnings', coalesce(v_preview->'warnings', '[]'::jsonb),
    'proposedDeliveryItems', coalesce(v_preview->'proposedItems', '[]'::jsonb),
    'previousDeliveryRecordId', v_preview->'previousDeliveryRecordId',
    'expectedDeliverySequence', v_preview->'expectedFinishSequence'
  );
end;
$$;

create or replace function public.routine_finalize_run_extension(input_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_run public.routine_runs%rowtype;
  v_preview jsonb;
  v_item jsonb;
  v_record public.routine_delivery_records%rowtype;
  v_previous public.routine_delivery_records%rowtype;
  v_actor_name text;
  v_item_row public.routine_delivery_items%rowtype;
  v_verification jsonb;
begin
  select run.* into v_run from public.routine_runs run where run.id = input_run_id for update;
  if v_run.id is null or v_run.status <> 'finished' then
    return jsonb_build_object('applied', false, 'reason', 'run_not_finished');
  end if;
  if not exists (
    select 1 from public.routine_run_task_relations relation
    where relation.run_id = v_run.id and relation.relation_type_snapshot = 'delivery_comparison'
  ) then return jsonb_build_object('applied', false, 'hasDeliveryContract', false); end if;
  select record.* into v_record from public.routine_delivery_records record
  where record.source_run_id = v_run.id and record.source_finish_sequence = v_run.current_finish_sequence;
  if v_record.id is not null then
    return jsonb_build_object(
      'applied', true, 'idempotentReplay', true,
      'deliveryRecordId', v_record.id, 'recordHash', v_record.record_hash,
      'sourceFinishSequence', v_record.source_finish_sequence,
      'supersedesDeliveryRecordId', v_record.supersedes_delivery_record_id,
      'itemCount', (select count(*) from public.routine_delivery_items item where item.delivery_record_id = v_record.id)
    );
  end if;
  v_preview := public.routine_preview_run_delivery(v_run.id);
  if not coalesce((v_preview->>'valid')::boolean, false)
     or (v_preview->>'expectedFinishSequence')::integer <> v_run.current_finish_sequence then
    raise exception using errcode = 'P0001', message = 'Routine delivery finalization failed validation: '
      || coalesce((v_preview->'blockers')::text, '[]');
  end if;
  select record.* into v_previous from public.routine_delivery_records record
  where record.source_run_id = v_run.id and record.source_finish_sequence < v_run.current_finish_sequence
  order by record.source_finish_sequence desc, record.id desc limit 1;
  select profile.display_name into v_actor_name
  from public.user_profiles profile where profile.id = v_run.finished_by_auth_user_id;
  if nullif(trim(coalesce(v_actor_name, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'Delivery generation requires the authenticated finish actor snapshot.';
  end if;
  v_verification := coalesce(v_preview->'runVerificationSnapshot', '{}'::jsonb);
  perform set_config('mesh.routine_delivery_internal', 'finalize', true);
  insert into public.routine_delivery_records (
    organization_id, source_run_id, operational_date,
    source_routine_key_snapshot, scope_key_snapshot,
    source_template_id_snapshot, source_template_version_id_snapshot,
    source_template_version_number_snapshot, source_template_content_hash_snapshot,
    source_run_snapshot_hash_snapshot, source_run_timing_snapshot_hash_snapshot,
    source_run_revision_snapshot, source_finish_sequence,
    supersedes_delivery_record_id, final_run_verification_id,
    responsibility_snapshot, run_verification_snapshot,
    generated_at, generated_by_auth_user_id, generated_by_name_snapshot, record_hash
  ) values (
    v_run.organization_id, v_run.id, v_run.operational_date,
    v_run.routine_key, v_run.scope_key, v_run.template_id, v_run.template_version_id,
    v_run.template_version_number_snapshot, v_run.template_content_hash_snapshot,
    v_run.snapshot_hash, v_run.timing_snapshot_hash, v_run.revision,
    v_run.current_finish_sequence, v_previous.id,
    nullif(v_verification->>'id', '')::uuid,
    v_preview->'responsibilitySnapshot', v_verification,
    v_run.finished_at, v_run.finished_by_auth_user_id, v_actor_name,
    v_preview->>'proposedRecordHash'
  ) returning * into v_record;
  for v_item in
    select item from jsonb_array_elements(v_preview->'proposedItems') item
    order by (item->>'sortOrder')::integer, item->>'deliveryKey'
  loop
    insert into public.routine_delivery_items (
      organization_id, delivery_record_id, source_run_id, source_run_task_id,
      source_run_relation_id, delivery_key, label, category, target_routine_key,
      target_task_key, comparison_mode, required_snapshot,
      allow_not_applicable_snapshot, scope_policy_snapshot,
      evidence_item_keys_snapshot, require_valid_task_verification_snapshot,
      require_valid_run_verification_snapshot, sort_order_snapshot,
      reported_status, source_task_status_snapshot, source_task_outcome_snapshot,
      source_task_initial_assessment_snapshot, source_task_revision_snapshot,
      source_task_completed_at_snapshot, source_task_completed_by_auth_user_id_snapshot,
      source_task_completed_by_name_snapshot, task_verification_snapshot,
      task_item_evidence_snapshot, deviation_snapshot, override_snapshot,
      standard_snapshot, reference_image_snapshot, item_hash
    ) values (
      v_run.organization_id, v_record.id, v_run.id,
      (v_item->>'sourceTaskId')::uuid, (v_item->>'sourceRelationId')::uuid,
      v_item->>'deliveryKey', v_item->>'label', v_item->>'category',
      v_item->>'targetRoutineKey', v_item->>'targetTaskKey', v_item->>'comparisonMode',
      (v_item->>'required')::boolean, (v_item->>'allowNotApplicable')::boolean,
      v_item->>'scopePolicy', array(
        select value from jsonb_array_elements_text(v_item->'evidenceItemKeys') value
      ),
      (v_item->>'requireValidTaskVerification')::boolean,
      (v_item->>'requireValidRunVerification')::boolean,
      (v_item->>'sortOrder')::integer, v_item->>'reportedStatus',
      v_item->>'sourceTaskStatus', nullif(v_item->>'sourceTaskOutcome', ''),
      nullif(v_item->>'sourceTaskInitialAssessment', ''),
      (v_item->>'sourceTaskRevision')::bigint,
      nullif(v_item->>'sourceTaskCompletedAt', '')::timestamptz,
      nullif(v_item->>'sourceTaskCompletedByAuthUserId', '')::uuid,
      nullif(v_item->>'sourceTaskCompletedByName', ''),
      v_item->'taskVerificationSnapshot', v_item->'taskItemEvidenceSnapshot',
      v_item->'deviationSnapshot', v_item->'overrideSnapshot',
      v_item->'standardSnapshot', v_item->'referenceImageSnapshot', v_item->>'itemHash'
    ) returning * into v_item_row;
    if not coalesce((public.routine_verify_delivery_item(v_item_row.id)->>'valid')::boolean, false) then
      raise exception using errcode = 'P0001', message = 'Generated delivery item failed deterministic hash verification.';
    end if;
  end loop;
  if not coalesce((public.routine_verify_delivery_record(v_record.id)->>'valid')::boolean, false) then
    raise exception using errcode = 'P0001', message = 'Generated delivery record failed deterministic hash verification.';
  end if;
  return jsonb_build_object(
    'applied', true, 'idempotentReplay', false,
    'deliveryRecordId', v_record.id, 'recordHash', v_record.record_hash,
    'sourceFinishSequence', v_record.source_finish_sequence,
    'supersedesDeliveryRecordId', v_record.supersedes_delivery_record_id,
    'itemCount', (select count(*) from public.routine_delivery_items item where item.delivery_record_id = v_record.id)
  );
end;
$$;

create or replace function public.routine_record_delivery_generation_events(
  input_run_id uuid,
  input_delivery_summary jsonb,
  input_operation_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_record_id uuid := nullif(input_delivery_summary->>'deliveryRecordId', '')::uuid;
  v_item record; v_sequence integer := 3; v_previous uuid;
begin
  if not coalesce((input_delivery_summary->>'applied')::boolean, false) or v_record_id is null then return; end if;
  perform public.routine_record_event(
    input_run_id, 'delivery_record_generated', 'system', null, null,
    'Routine delivery engine', null, '{}'::jsonb, null, null,
    jsonb_build_object('deliveryRecordId', v_record_id,
      'recordHash', input_delivery_summary->>'recordHash',
      'sourceFinishSequence', (input_delivery_summary->>'sourceFinishSequence')::integer),
    input_operation_id, 2
  );
  for v_item in
    select item.* from public.routine_delivery_items item
    where item.delivery_record_id = v_record_id
    order by item.sort_order_snapshot, item.delivery_key, item.id
  loop
    perform public.routine_record_event(
      input_run_id, 'delivery_item_generated', 'system', null, null,
      'Routine delivery engine', null,
      jsonb_build_object('taskId', v_item.source_run_task_id), null, null,
      jsonb_build_object('deliveryRecordId', v_record_id,
        'deliveryItemId', v_item.id, 'deliveryKey', v_item.delivery_key,
        'reportedStatus', v_item.reported_status, 'itemHash', v_item.item_hash),
      input_operation_id, v_sequence
    );
    v_sequence := v_sequence + 1;
  end loop;
  v_previous := nullif(input_delivery_summary->>'supersedesDeliveryRecordId', '')::uuid;
  if v_previous is not null then
    perform public.routine_record_event(
      input_run_id, 'delivery_record_superseded', 'system', null, null,
      'Routine delivery engine', null, '{}'::jsonb, null, null,
      jsonb_build_object('deliveryRecordId', v_record_id,
        'supersededDeliveryRecordId', v_previous), input_operation_id, v_sequence
    );
  end if;
end;
$$;

create or replace function public.routine_validate_run_completion(input_run_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare v_core jsonb; v_time jsonb; v_delivery jsonb; v_blockers jsonb; v_warnings jsonb;
begin
  perform public.routine_evaluate_run_conditions(input_run_id, clock_timestamp());
  v_core := public.routine_validate_run_completion_core(input_run_id);
  v_time := public.routine_validate_run_completion_time(input_run_id);
  v_delivery := public.routine_validate_run_completion_delivery(input_run_id);
  v_blockers := coalesce(v_core->'blockers', '[]'::jsonb)
    || coalesce(v_time->'blockers', '[]'::jsonb)
    || coalesce(v_delivery->'blockers', '[]'::jsonb);
  v_warnings := coalesce(v_core->'warnings', '[]'::jsonb)
    || coalesce(v_time->'warnings', '[]'::jsonb)
    || coalesce(v_delivery->'warnings', '[]'::jsonb);
  return jsonb_build_object(
    'valid', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers, 'warnings', v_warnings,
    'acceptedTransferCount', coalesce((v_core->>'acceptedTransferCount')::integer, 0),
    'timing', v_time, 'delivery', v_delivery,
    'deliveryContractPresent', coalesce((v_delivery->>'deliveryContractPresent')::boolean, false),
    'deliveryValid', coalesce((v_delivery->>'deliveryValid')::boolean, false),
    'deliveryBlockers', coalesce(v_delivery->'deliveryBlockers', '[]'::jsonb),
    'deliveryWarnings', coalesce(v_delivery->'deliveryWarnings', '[]'::jsonb),
    'proposedDeliveryItems', coalesce(v_delivery->'proposedDeliveryItems', '[]'::jsonb),
    'previousDeliveryRecordId', v_delivery->'previousDeliveryRecordId',
    'expectedDeliverySequence', v_delivery->'expectedDeliverySequence'
  );
end;
$$;

create or replace function public.finish_routine_run(
  input_run_id uuid, input_expected_run_revision bigint, input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_context record; v_run public.routine_runs%rowtype; v_validation jsonb;
  v_hash text; v_replay jsonb; v_response jsonb; v_previous bigint; v_only_accepted boolean;
  v_delivery jsonb := jsonb_build_object('applied', false); v_operation_id uuid;
begin
  select * into v_context from public.routine_lifecycle_context(input_run_id);
  if not v_context.is_coordinator then raise exception using errcode = 'P0001', message = 'Coordinator authority is required to finish a routine run.'; end if;
  v_hash := public.routine_run_request_hash(jsonb_build_object('runId', input_run_id,
    'expectedRunRevision', input_expected_run_revision));
  v_replay := public.routine_run_operation_replay(v_context.organization_id, v_context.actor_auth_user_id,
    'finish_run', input_idempotency_key, v_hash);
  if v_replay is not null then return v_replay; end if;
  select run.* into v_run from public.routine_runs run where run.id = input_run_id for update;
  if v_run.revision <> input_expected_run_revision then raise exception using errcode = '40001', message = 'Stale routine run revision.'; end if;
  v_validation := public.routine_validate_run_completion(v_run.id);
  v_only_accepted := jsonb_array_length(v_validation->'blockers') = 1
    and v_validation->'blockers' ? 'accepted_transfers_pending';
  if not coalesce((v_validation->>'valid')::boolean, false) and not v_only_accepted then
    raise exception using errcode = 'P0001', message = 'Routine run cannot finish: ' || (v_validation->'blockers')::text;
  end if;
  v_previous := v_run.revision;
  perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  if v_only_accepted then
    update public.routine_runs set status = 'waiting_for_transfers', revision = revision + 1,
      updated_by_auth_user_id = v_context.actor_auth_user_id
    where id = v_run.id returning * into v_run;
  else
    update public.routine_runs set status = 'finished', finished_at = now(),
      finished_by_auth_user_id = v_context.actor_auth_user_id,
      current_finish_sequence = current_finish_sequence + 1,
      revision = revision + 1, updated_by_auth_user_id = v_context.actor_auth_user_id
    where id = v_run.id returning * into v_run;
    v_delivery := public.routine_finalize_run_extension(v_run.id);
  end if;
  v_response := jsonb_build_object(
    'run', to_jsonb(v_run), 'validation', v_validation,
    'delivery', v_delivery, 'idempotentReplay', false
  );
  v_operation_id := public.routine_complete_lifecycle_operation(
    v_context.organization_id, v_context.actor_auth_user_id,
    v_context.actor_profile_id, v_context.actor_display_name, v_context.actor_role,
    'finish_run', input_idempotency_key, v_hash, 'run', v_run.id, v_response, v_run.id,
    case when v_only_accepted then 'run_waiting_for_transfers' else 'run_finished' end,
    '{}'::jsonb, v_previous, v_run.revision, jsonb_build_object('validation', v_validation)
  );
  if not v_only_accepted then
    perform public.routine_record_delivery_generation_events(v_run.id, v_delivery, v_operation_id);
  end if;
  return v_response;
end;
$$;

create or replace function public.routine_select_previous_delivery_item_for_opening_task(
  input_opening_task_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_task public.routine_run_tasks%rowtype;
  v_run public.routine_runs%rowtype;
  v_candidate record;
  v_top_count integer;
begin
  select task.* into v_task from public.routine_run_tasks task where task.id = input_opening_task_id;
  select run.* into v_run from public.routine_runs run where run.id = v_task.run_id;
  if v_task.id is null or v_run.id is null then
    return jsonb_build_object('selectionState', 'opening_task_not_found');
  end if;
  with eligible as (
    select record.id record_id, item.id item_id, record.source_run_id,
      item.source_run_task_id, record.operational_date, record.source_finish_sequence,
      item.reported_status, item.comparison_mode, item.delivery_key, item.label,
      item.item_hash, item.override_snapshot, item.deviation_snapshot,
      item.source_task_completed_at_snapshot, item.source_task_completed_by_name_snapshot,
      item.task_verification_snapshot, record.responsibility_snapshot
    from public.routine_delivery_records record
    join public.routine_delivery_items item on item.delivery_record_id = record.id
    join public.routine_runs source_run on source_run.id = record.source_run_id
      and source_run.organization_id = record.organization_id
    where record.organization_id = v_run.organization_id
      and item.target_routine_key = v_run.routine_key
      and item.target_task_key = v_task.task_key_snapshot
      and item.scope_policy_snapshot = 'same_scope'
      and record.scope_key_snapshot = v_run.scope_key
      and record.operational_date < v_run.operational_date
      and source_run.status = 'finished'
      and source_run.current_finish_sequence = record.source_finish_sequence
      and item.comparison_mode = v_task.initial_assessment_policy_snapshot
  ), ranked as (
    select eligible.*, max(operational_date) over () top_date from eligible
  )
  select count(*) into v_top_count from ranked where operational_date = top_date;
  with eligible as (
    select record.id record_id, item.id item_id, record.source_run_id,
      item.source_run_task_id, record.operational_date, record.source_finish_sequence,
      item.reported_status, item.comparison_mode, item.delivery_key, item.label,
      item.item_hash, item.override_snapshot, item.deviation_snapshot,
      item.source_task_completed_at_snapshot, item.source_task_completed_by_name_snapshot,
      item.task_verification_snapshot, record.responsibility_snapshot
    from public.routine_delivery_records record
    join public.routine_delivery_items item on item.delivery_record_id = record.id
    join public.routine_runs source_run on source_run.id = record.source_run_id
      and source_run.organization_id = record.organization_id
    where record.organization_id = v_run.organization_id
      and item.target_routine_key = v_run.routine_key
      and item.target_task_key = v_task.task_key_snapshot
      and item.scope_policy_snapshot = 'same_scope'
      and record.scope_key_snapshot = v_run.scope_key
      and record.operational_date < v_run.operational_date
      and source_run.status = 'finished'
      and source_run.current_finish_sequence = record.source_finish_sequence
      and item.comparison_mode = v_task.initial_assessment_policy_snapshot
  )
  select * into v_candidate from eligible
  order by operational_date desc, source_finish_sequence desc, record_id, item_id limit 1;
  if v_candidate.record_id is null then
    return jsonb_build_object('selectionState', 'no_previous_delivery');
  end if;
  return jsonb_build_object(
    'selectionState', case when v_top_count > 1 then 'ambiguous_previous_delivery' else 'selected' end,
    'deliveryRecordId', v_candidate.record_id,
    'deliveryItemId', v_candidate.item_id,
    'sourceRunId', v_candidate.source_run_id,
    'sourceTaskId', v_candidate.source_run_task_id,
    'sourceOperationalDate', v_candidate.operational_date,
    'ageInOperationalDays', v_run.operational_date - v_candidate.operational_date,
    'sourceFinishSequence', v_candidate.source_finish_sequence,
    'deliveryKey', v_candidate.delivery_key,
    'label', v_candidate.label,
    'comparisonMode', v_candidate.comparison_mode,
    'reportedStatus', v_candidate.reported_status,
    'itemHash', v_candidate.item_hash,
    'previousDeliveryHadOverride', jsonb_array_length(coalesce(v_candidate.override_snapshot->'overrides', '[]'::jsonb)) > 0,
    'previousDeliveryHadDeviation', jsonb_array_length(coalesce(v_candidate.deviation_snapshot->'deviations', '[]'::jsonb)) > 0,
    'completion', jsonb_build_object('completedAt', v_candidate.source_task_completed_at_snapshot,
      'completedByName', v_candidate.source_task_completed_by_name_snapshot),
    'verification', v_candidate.task_verification_snapshot,
    'responsibility', v_candidate.responsibility_snapshot
  );
end;
$$;

create or replace function public.routine_compare_opening_assessment_to_delivery(
  input_opening_task_id uuid,
  input_initial_assessment text,
  input_assessment_operation_id uuid,
  input_actor jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_task public.routine_run_tasks%rowtype;
  v_run public.routine_runs%rowtype;
  v_selection jsonb;
  v_result text;
  v_status text;
  v_assessment text := lower(trim(coalesce(input_initial_assessment, '')));
  v_contract_exists boolean;
begin
  select task.* into v_task from public.routine_run_tasks task where task.id = input_opening_task_id;
  select run.* into v_run from public.routine_runs run where run.id = v_task.run_id;
  select exists (
    select 1
    from public.routine_templates source_template
    join public.routine_template_versions source_version
      on source_version.id = source_template.current_published_version_id
    join public.routine_template_task_relations relation
      on relation.version_id = source_version.id
     and relation.organization_id = source_version.organization_id
    where source_template.organization_id = v_run.organization_id
      and relation.relation_type = 'delivery_comparison'
      and relation.target_routine_key = v_run.routine_key
      and relation.target_task_key = v_task.task_key_snapshot
  ) into v_contract_exists;
  if not v_contract_exists then
    return jsonb_build_object('createComparison', false, 'selectionState', 'no_target_contract');
  end if;
  v_selection := public.routine_select_previous_delivery_item_for_opening_task(input_opening_task_id);
  if v_selection->>'selectionState' = 'no_previous_delivery' then
    v_result := 'no_previous_delivery';
  elsif v_selection->>'selectionState' <> 'selected' then
    v_result := 'not_comparable';
  else
    v_status := v_selection->>'reportedStatus';
    if v_status in ('delivered_to_standard', 'delivered_after_correction') then
      v_result := case when v_assessment = 'ready' then 'matched' else 'mismatch' end;
    elsif v_status in ('delivered_with_override', 'delivered_with_deviation') then
      v_result := case when v_assessment = 'ready' then 'resolved_after_delivery' else 'confirmed_prior_deviation' end;
    else v_result := 'not_comparable'; end if;
  end if;
  return jsonb_build_object(
    'createComparison', true,
    'selectionState', v_selection->>'selectionState',
    'selection', v_selection,
    'comparisonResult', v_result,
    'comparisonMode', v_task.initial_assessment_policy_snapshot,
    'openingInitialAssessment', v_assessment,
    'assessmentOperationId', input_assessment_operation_id,
    'actor', coalesce(input_actor, '{}'::jsonb)
  );
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
  v_reason text := lower(trim(coalesce(input_reason_code, '')));
  v_details text := nullif(trim(coalesce(input_details, '')), '');
  v_hash text; v_replay jsonb; v_response jsonb; v_previous bigint;
  v_deviation public.routine_deviations%rowtype; v_operation_id uuid := gen_random_uuid();
  v_comparison_plan jsonb; v_selection jsonb; v_comparison public.routine_delivery_comparisons%rowtype;
  v_comparison_id uuid := gen_random_uuid();
  v_comparison_payload jsonb; v_comparison_hash text; v_event_sequence integer := 2;
  v_timing jsonb; v_source_type text; v_category text; v_effective_reason text;
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
  ) then raise exception using errcode = 'P0001', message = 'Issue assessment requires a stable reason code and substantive details.'; end if;
  v_timing := public.routine_validate_task_timing_action(v_task.id, 'start', clock_timestamp());
  if not coalesce((v_timing->>'valid')::boolean, false) then
    raise exception using errcode = 'P0001', message = coalesce(v_timing->>'errorCode', 'routine_task_timing_unavailable');
  end if;
  v_comparison_plan := public.routine_compare_opening_assessment_to_delivery(
    v_task.id, v_assessment, v_operation_id,
    jsonb_build_object('authUserId', v_context.actor_auth_user_id,
      'profileId', v_context.actor_profile_id, 'name', v_context.actor_display_name,
      'role', v_context.actor_role)
  );
  v_selection := coalesce(v_comparison_plan->'selection', '{}'::jsonb);
  v_previous := v_task.revision;
  perform set_config('mesh.routine_run_internal', 'lifecycle', true);
  if v_assessment in ('correction_required', 'control_issue_found') then
    if v_comparison_plan->>'comparisonResult' = 'mismatch' then
      v_source_type := 'opening_closing_mismatch';
      v_category := 'opening_closing_mismatch';
      v_effective_reason := coalesce(nullif(v_selection->>'deliveryKey', ''), v_reason);
    else
      v_source_type := case when v_assessment = 'correction_required' then 'initial_check' else 'control_result' end;
      v_category := case when v_assessment = 'correction_required' then 'initial_condition' else 'control_issue' end;
      v_effective_reason := v_reason;
    end if;
    insert into public.routine_deviations (
      organization_id, run_id, task_id, source_type, category, reason_code,
      details, severity, detected_by_auth_user_id, detected_by_name_snapshot,
      linked_previous_run_id, linked_previous_task_id
    ) values (
      v_context.organization_id, v_run.id, v_task.id, v_source_type, v_category,
      v_effective_reason, v_details,
      case when v_task.criticality_snapshot = 'critical' then 'critical' else 'important' end,
      v_context.actor_auth_user_id, v_context.actor_display_name,
      case when v_comparison_plan->>'comparisonResult' in ('mismatch', 'confirmed_prior_deviation')
        then nullif(v_selection->>'sourceRunId', '')::uuid end,
      case when v_comparison_plan->>'comparisonResult' in ('mismatch', 'confirmed_prior_deviation')
        then nullif(v_selection->>'sourceTaskId', '')::uuid end
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
  update public.routine_runs set revision = revision + 1,
    updated_by_auth_user_id = v_context.actor_auth_user_id
  where id = v_run.id returning * into v_run;

  if coalesce((v_comparison_plan->>'createComparison')::boolean, false) then
    v_comparison_payload := jsonb_build_object(
      'openingRunId', v_run.id, 'openingTaskId', v_task.id,
      'openingOperationalDate', v_run.operational_date,
      'openingInitialAssessment', v_assessment,
      'deliveryRecordId', nullif(v_selection->>'deliveryRecordId', '')::uuid,
      'deliveryItemId', nullif(v_selection->>'deliveryItemId', '')::uuid,
      'deliveryItemHash', nullif(v_selection->>'itemHash', ''),
      'sourceClosingRunId', nullif(v_selection->>'sourceRunId', '')::uuid,
      'sourceClosingTaskId', nullif(v_selection->>'sourceTaskId', '')::uuid,
      'sourceOperationalDate', nullif(v_selection->>'sourceOperationalDate', '')::date,
      'comparisonMode', v_comparison_plan->>'comparisonMode',
      'deliveryReportedStatus', nullif(v_selection->>'reportedStatus', ''),
      'comparisonResult', v_comparison_plan->>'comparisonResult',
      'linkedDeviationId', v_deviation.id,
      'previousDeliveryHadOverride', coalesce((v_selection->>'previousDeliveryHadOverride')::boolean, false),
      'previousDeliveryHadDeviation', coalesce((v_selection->>'previousDeliveryHadDeviation')::boolean, false)
    );
    v_comparison_hash := public.routine_compute_delivery_comparison_hash(v_comparison_payload);
    v_response := jsonb_build_object('task', to_jsonb(v_task),
      'deviation', case when v_deviation.id is null then null else to_jsonb(v_deviation) end,
      'runRevision', v_run.revision,
      'comparison', v_comparison_payload || jsonb_build_object(
        'id', v_comparison_id, 'selectionState', v_comparison_plan->>'selectionState',
        'comparisonHash', v_comparison_hash),
      'idempotentReplay', false);
  else
    v_response := jsonb_build_object('task', to_jsonb(v_task),
      'deviation', case when v_deviation.id is null then null else to_jsonb(v_deviation) end,
      'runRevision', v_run.revision, 'comparison', null, 'idempotentReplay', false);
  end if;
  insert into public.routine_run_operations (
    id, organization_id, actor_auth_user_id, operation_type, idempotency_key,
    request_hash, resource_type, resource_id, response_payload
  ) values (
    v_operation_id, v_context.organization_id, v_context.actor_auth_user_id,
    'initial_assessment', input_idempotency_key, v_hash, 'task', v_task.id, v_response
  );
  if coalesce((v_comparison_plan->>'createComparison')::boolean, false) then
    perform set_config('mesh.routine_delivery_internal', 'assessment', true);
    insert into public.routine_delivery_comparisons (
      id, organization_id, opening_run_id, opening_task_id, comparison_sequence,
      delivery_record_id, delivery_item_id, source_closing_run_id,
      source_closing_task_id, source_operational_date, opening_operational_date,
      opening_initial_assessment, comparison_mode, delivery_reported_status,
      comparison_result, previous_delivery_had_override,
      previous_delivery_had_deviation, linked_deviation_id,
      assessment_operation_id, compared_at, compared_by_auth_user_id,
      compared_by_name_snapshot, comparison_hash
    ) values (
      v_comparison_id, v_context.organization_id, v_run.id, v_task.id, 1,
      nullif(v_selection->>'deliveryRecordId', '')::uuid,
      nullif(v_selection->>'deliveryItemId', '')::uuid,
      nullif(v_selection->>'sourceRunId', '')::uuid,
      nullif(v_selection->>'sourceTaskId', '')::uuid,
      nullif(v_selection->>'sourceOperationalDate', '')::date,
      v_run.operational_date, v_assessment, v_comparison_plan->>'comparisonMode',
      nullif(v_selection->>'reportedStatus', ''), v_comparison_plan->>'comparisonResult',
      coalesce((v_selection->>'previousDeliveryHadOverride')::boolean, false),
      coalesce((v_selection->>'previousDeliveryHadDeviation')::boolean, false),
      v_deviation.id, v_operation_id, now(), v_context.actor_auth_user_id,
      v_context.actor_display_name, v_comparison_hash
    ) returning * into v_comparison;
  end if;
  perform public.routine_record_event(v_run.id, 'initial_assessment_recorded', 'user',
    v_context.actor_auth_user_id, v_context.actor_profile_id, v_context.actor_display_name,
    v_context.actor_role, jsonb_build_object('taskId', v_task.id), v_previous, v_task.revision,
    jsonb_build_object('assessment', v_assessment, 'reasonCode', nullif(v_reason, '')),
    v_operation_id, 1);
  if v_deviation.id is not null then
    perform public.routine_record_event(v_run.id, 'deviation_opened', 'user',
      v_context.actor_auth_user_id, v_context.actor_profile_id, v_context.actor_display_name,
      v_context.actor_role, jsonb_build_object('taskId', v_task.id, 'deviationId', v_deviation.id),
      null, v_deviation.revision, jsonb_build_object('sourceType', v_deviation.source_type,
      'severity', v_deviation.severity), v_operation_id, v_event_sequence);
    v_event_sequence := v_event_sequence + 1;
  end if;
  if v_comparison.id is not null then
    perform public.routine_record_event(v_run.id, 'delivery_comparison_recorded', 'user',
      v_context.actor_auth_user_id, v_context.actor_profile_id, v_context.actor_display_name,
      v_context.actor_role, jsonb_build_object('taskId', v_task.id), null, null,
      jsonb_build_object('deliveryComparisonId', v_comparison.id,
        'comparisonResult', v_comparison.comparison_result,
        'deliveryRecordId', v_comparison.delivery_record_id,
        'deliveryItemId', v_comparison.delivery_item_id), v_operation_id, v_event_sequence);
    v_event_sequence := v_event_sequence + 1;
    if v_comparison.comparison_result = 'mismatch' then
      perform public.routine_record_event(v_run.id, 'delivery_mismatch_detected', 'user',
        v_context.actor_auth_user_id, v_context.actor_profile_id, v_context.actor_display_name,
        v_context.actor_role, jsonb_build_object('taskId', v_task.id, 'deviationId', v_deviation.id),
        null, null, jsonb_build_object('deliveryComparisonId', v_comparison.id,
          'sourceClosingRunId', v_comparison.source_closing_run_id,
          'sourceClosingTaskId', v_comparison.source_closing_task_id),
        v_operation_id, v_event_sequence);
    elsif v_comparison.comparison_result = 'confirmed_prior_deviation' then
      perform public.routine_record_event(v_run.id, 'prior_delivery_deviation_confirmed', 'user',
        v_context.actor_auth_user_id, v_context.actor_profile_id, v_context.actor_display_name,
        v_context.actor_role, jsonb_build_object('taskId', v_task.id, 'deviationId', v_deviation.id),
        null, null, jsonb_build_object('deliveryComparisonId', v_comparison.id),
        v_operation_id, v_event_sequence);
    elsif v_comparison.comparison_result = 'resolved_after_delivery' then
      perform public.routine_record_event(v_run.id, 'prior_delivery_resolved_after_close', 'user',
        v_context.actor_auth_user_id, v_context.actor_profile_id, v_context.actor_display_name,
        v_context.actor_role, jsonb_build_object('taskId', v_task.id), null, null,
        jsonb_build_object('deliveryComparisonId', v_comparison.id),
        v_operation_id, v_event_sequence);
    end if;
  end if;
  return v_response;
end;
$$;

alter table public.routine_corrections drop constraint if exists routine_corrections_type_check;
alter table public.routine_corrections add constraint routine_corrections_type_check check (entity_type in (
  'run', 'task', 'task_item', 'deviation', 'handover', 'transfer', 'verification', 'event',
  'delivery_record', 'delivery_item', 'delivery_comparison'
));

alter table public.routine_events drop constraint if exists routine_events_event_type_check;
alter table public.routine_events add constraint routine_events_event_type_check check (event_type in (
  'run_created', 'participant_joined', 'role_assigned', 'role_replaced',
  'run_started', 'run_final_verification_requested', 'task_claimed', 'task_released',
  'task_started', 'task_system_started', 'task_paused', 'initial_assessment_recorded',
  'task_item_updated', 'task_comment_added', 'task_blocked', 'task_not_applicable',
  'task_completed', 'task_system_completed', 'task_reopened', 'deviation_opened',
  'deviation_assigned', 'deviation_mitigated', 'deviation_resolved',
  'deviation_cancelled', 'timing_deviation_opened', 'manager_override_created',
  'task_verification_completed', 'run_verification_completed', 'handover_created',
  'handover_updated', 'handover_submitted', 'handover_accepted', 'transfer_proposed',
  'transfer_accepted', 'transfer_rejected', 'transfer_completed', 'transfer_cancelled',
  'run_waiting_for_transfers', 'run_finished', 'run_reopened', 'run_cancelled',
  'history_correction_recorded', 'operational_date_resolved', 'task_became_visible',
  'task_became_available', 'task_became_due', 'task_became_overdue',
  'task_hard_deadline_missed', 'condition_evaluated', 'condition_matched',
  'condition_not_matched', 'condition_evaluation_error',
  'run_operational_date_superseded', 'timing_deviation_resolved',
  'delivery_record_generated', 'delivery_item_generated', 'delivery_record_superseded',
  'delivery_comparison_recorded', 'delivery_mismatch_detected',
  'prior_delivery_deviation_confirmed', 'prior_delivery_resolved_after_close'
));

do $phase10g_correction_rpc_rename$
begin
  if to_regprocedure('public.record_routine_history_correction_phase10f(uuid,text,uuid,text,jsonb,jsonb,text,uuid)') is null then
    alter function public.record_routine_history_correction(uuid, text, uuid, text, jsonb, jsonb, text, uuid)
      rename to record_routine_history_correction_phase10f;
  end if;
end;
$phase10g_correction_rpc_rename$;

create or replace function public.record_routine_history_correction(
  input_run_id uuid, input_entity_type text, input_entity_id uuid, input_field_or_claim text,
  input_original_value jsonb, input_corrected_value jsonb, input_reason text, input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_type text := lower(trim(coalesce(input_entity_type, ''))); v_context record;
begin
  select * into v_context from public.routine_lifecycle_context(input_run_id);
  if not v_context.is_manager then
    raise exception using errcode = '42501', message = 'Manager authority is required to record a history correction.';
  end if;
  if v_type = 'delivery_record' and not exists (
    select 1 from public.routine_delivery_records record
    where record.id = input_entity_id and record.organization_id = v_context.organization_id
      and record.source_run_id = input_run_id
  ) then raise exception using errcode = 'P0001', message = 'Delivery record correction target must belong to this run and organization.';
  elsif v_type = 'delivery_item' and not exists (
    select 1 from public.routine_delivery_items item
    where item.id = input_entity_id and item.organization_id = v_context.organization_id
      and item.source_run_id = input_run_id
  ) then raise exception using errcode = 'P0001', message = 'Delivery item correction target must belong to this run and organization.';
  elsif v_type = 'delivery_comparison' and not exists (
    select 1 from public.routine_delivery_comparisons comparison
    where comparison.id = input_entity_id and comparison.organization_id = v_context.organization_id
      and comparison.opening_run_id = input_run_id
  ) then raise exception using errcode = 'P0001', message = 'Delivery comparison correction target must belong to this run and organization.';
  end if;
  return public.record_routine_history_correction_phase10f(
    input_run_id, v_type, input_entity_id, input_field_or_claim,
    input_original_value, input_corrected_value, input_reason, input_idempotency_key
  );
end;
$$;

create or replace function public.routine_delivery_record_is_visible(
  input_record_id uuid,
  input_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select public.routine_current_user_is_active()
    and input_organization_id = public.routine_current_user_organization_id()
    and exists (
      select 1 from public.routine_delivery_records record
      where record.id = input_record_id and record.organization_id = input_organization_id
        and (
          public.routine_current_user_role() in ('manager', 'shift_lead')
          or exists (
            select 1 from public.routine_run_participants participant
            where participant.run_id = record.source_run_id
              and participant.organization_id = record.organization_id
              and participant.user_profile_id = auth.uid()
              and participant.participation_status <> 'removed'
          )
        )
    )
$$;

create or replace function public.routine_delivery_item_is_visible(
  input_item_id uuid,
  input_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select public.routine_current_user_is_active()
    and input_organization_id = public.routine_current_user_organization_id()
    and exists (
      select 1 from public.routine_delivery_items item
      join public.routine_delivery_records record on record.id = item.delivery_record_id
      where item.id = input_item_id and item.organization_id = input_organization_id
        and (
          public.routine_current_user_role() in ('manager', 'shift_lead')
          or exists (
            select 1 from public.routine_run_participants source_participant
            where source_participant.run_id = item.source_run_id
              and source_participant.organization_id = item.organization_id
              and source_participant.user_profile_id = auth.uid()
              and source_participant.participation_status <> 'removed'
          )
          or exists (
            select 1
            from public.routine_runs opening_run
            join public.routine_run_tasks opening_task
              on opening_task.run_id = opening_run.id
             and opening_task.organization_id = opening_run.organization_id
            join public.routine_run_participants opening_participant
              on opening_participant.run_id = opening_run.id
             and opening_participant.organization_id = opening_run.organization_id
            where opening_run.organization_id = item.organization_id
              and opening_run.routine_key = item.target_routine_key
              and opening_run.scope_key = record.scope_key_snapshot
              and opening_task.task_key_snapshot = item.target_task_key
              and opening_participant.user_profile_id = auth.uid()
              and opening_participant.participation_status <> 'removed'
              and public.routine_select_previous_delivery_item_for_opening_task(opening_task.id)
                    ->>'deliveryItemId' = item.id::text
          )
        )
    )
$$;

create or replace function public.routine_delivery_comparison_is_visible(
  input_comparison_id uuid,
  input_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select public.routine_current_user_is_active()
    and input_organization_id = public.routine_current_user_organization_id()
    and exists (
      select 1 from public.routine_delivery_comparisons comparison
      where comparison.id = input_comparison_id
        and comparison.organization_id = input_organization_id
        and (
          public.routine_current_user_role() in ('manager', 'shift_lead')
          or exists (
            select 1 from public.routine_run_participants participant
            where participant.run_id = comparison.opening_run_id
              and participant.organization_id = comparison.organization_id
              and participant.user_profile_id = auth.uid()
              and participant.participation_status <> 'removed'
          )
        )
    )
$$;

create or replace function public.preview_routine_run_delivery(input_run_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare v_context record;
begin
  select * into v_context from public.routine_lifecycle_context(input_run_id);
  return public.routine_preview_run_delivery(input_run_id);
end;
$$;

create or replace function public.get_routine_delivery_record(input_delivery_record_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare v_record public.routine_delivery_records%rowtype; v_actor record; v_corrections jsonb;
begin
  select * into v_actor from public.routine_resolve_actor();
  select record.* into v_record from public.routine_delivery_records record where record.id = input_delivery_record_id;
  if v_record.id is null or not public.routine_delivery_record_is_visible(v_record.id, v_record.organization_id) then
    raise exception using errcode = '42501', message = 'Routine delivery record access is denied.';
  end if;
  if v_actor.actor_role in ('manager', 'shift_lead') then
    select coalesce(jsonb_agg(to_jsonb(correction) order by correction.created_at, correction.id), '[]'::jsonb)
    into v_corrections
    from public.routine_corrections correction
    where correction.entity_type in ('delivery_record', 'delivery_item')
      and (correction.entity_id = v_record.id or correction.entity_id in (
        select item.id from public.routine_delivery_items item where item.delivery_record_id = v_record.id
      ));
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', correction.id, 'entityType', correction.entity_type,
      'entityId', correction.entity_id, 'fieldOrClaim', correction.field_or_claim,
      'createdAt', correction.created_at, 'createdByName', correction.created_by_name_snapshot
    ) order by correction.created_at, correction.id), '[]'::jsonb)
    into v_corrections
    from public.routine_corrections correction
    where correction.entity_type in ('delivery_record', 'delivery_item')
      and (correction.entity_id = v_record.id or correction.entity_id in (
        select item.id from public.routine_delivery_items item where item.delivery_record_id = v_record.id
      ));
  end if;
  return jsonb_build_object(
    'record', to_jsonb(v_record),
    'items', coalesce((select jsonb_agg(to_jsonb(item) order by item.sort_order_snapshot, item.delivery_key)
      from public.routine_delivery_items item where item.delivery_record_id = v_record.id), '[]'::jsonb),
    'responsibilitySnapshot', v_record.responsibility_snapshot,
    'runVerificationSnapshot', v_record.run_verification_snapshot,
    'sourceRun', (select jsonb_build_object('id', run.id, 'status', run.status,
      'routineKey', run.routine_key, 'scopeKey', run.scope_key,
      'operationalDate', run.operational_date, 'currentFinishSequence', run.current_finish_sequence)
      from public.routine_runs run where run.id = v_record.source_run_id),
    'supersessionChain', coalesce((
      with recursive chain as (
        select record.id, record.supersedes_delivery_record_id, record.source_finish_sequence,
          record.record_hash, 0 depth
        from public.routine_delivery_records record where record.id = v_record.id
        union all
        select previous.id, previous.supersedes_delivery_record_id,
          previous.source_finish_sequence, previous.record_hash, chain.depth + 1
        from chain join public.routine_delivery_records previous
          on previous.id = chain.supersedes_delivery_record_id
        where chain.depth < 100
      ) select jsonb_agg(to_jsonb(chain) order by chain.depth) from chain
    ), '[]'::jsonb),
    'supersedingRecords', coalesce((select jsonb_agg(jsonb_build_object(
      'id', newer.id, 'sourceFinishSequence', newer.source_finish_sequence,
      'recordHash', newer.record_hash) order by newer.source_finish_sequence)
      from public.routine_delivery_records newer
      where newer.supersedes_delivery_record_id = v_record.id), '[]'::jsonb),
    'verification', public.routine_verify_delivery_record(v_record.id),
    'corrections', v_corrections
  );
end;
$$;

create or replace function public.verify_routine_delivery_record(input_delivery_record_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare v_record public.routine_delivery_records%rowtype;
begin
  select record.* into v_record from public.routine_delivery_records record where record.id = input_delivery_record_id;
  if v_record.id is null or not public.routine_delivery_record_is_visible(v_record.id, v_record.organization_id) then
    raise exception using errcode = '42501', message = 'Routine delivery verification access is denied.';
  end if;
  return public.routine_verify_delivery_record(v_record.id);
end;
$$;

create or replace function public.get_previous_routine_delivery_for_task(input_opening_task_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare v_run_id uuid; v_context record;
begin
  select task.run_id into v_run_id from public.routine_run_tasks task where task.id = input_opening_task_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  return public.routine_select_previous_delivery_item_for_opening_task(input_opening_task_id);
end;
$$;

create or replace function public.get_routine_delivery_comparison(input_opening_task_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare v_run_id uuid; v_context record;
begin
  select task.run_id into v_run_id from public.routine_run_tasks task where task.id = input_opening_task_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  return jsonb_build_object(
    'latest', (select to_jsonb(comparison) from public.routine_delivery_comparisons comparison
      where comparison.opening_task_id = input_opening_task_id
      order by comparison.comparison_sequence desc, comparison.id desc limit 1),
    'history', coalesce((select jsonb_agg(to_jsonb(comparison)
      order by comparison.comparison_sequence, comparison.id)
      from public.routine_delivery_comparisons comparison
      where comparison.opening_task_id = input_opening_task_id), '[]'::jsonb)
  );
end;
$$;

create or replace function public.list_routine_delivery_history(
  input_date_from date,
  input_date_to date,
  input_delivery_key text default null,
  input_result_filter text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare v_actor record; v_key text := nullif(trim(coalesce(input_delivery_key, '')), '');
  v_result text := nullif(trim(coalesce(input_result_filter, '')), '');
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role not in ('manager', 'shift_lead') then
    raise exception using errcode = '42501', message = 'Coordinator authority is required for routine delivery history.';
  end if;
  if input_date_from is null or input_date_to is null or input_date_to < input_date_from
     or input_date_to - input_date_from > 366 then
    raise exception using errcode = 'P0001', message = 'Delivery history requires a valid date interval of at most 366 days.';
  end if;
  if v_result is not null and v_result not in (
    'matched', 'mismatch', 'confirmed_prior_deviation', 'resolved_after_delivery',
    'no_previous_delivery', 'not_comparable'
  ) then raise exception using errcode = 'P0001', message = 'Unknown delivery comparison result filter.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'record', to_jsonb(record), 'item', to_jsonb(item),
      'latestComparison', (select to_jsonb(comparison)
        from public.routine_delivery_comparisons comparison
        where comparison.delivery_item_id = item.id
          and (v_result is null or comparison.comparison_result = v_result)
        order by comparison.opening_operational_date desc,
          comparison.comparison_sequence desc, comparison.id desc limit 1),
      'correctionCount', (select count(*) from public.routine_corrections correction
        where correction.entity_id in (record.id, item.id))
    ) order by record.operational_date desc, record.source_run_id,
      item.sort_order_snapshot, item.delivery_key)
    from public.routine_delivery_records record
    join public.routine_delivery_items item on item.delivery_record_id = record.id
    where record.organization_id = v_actor.organization_id
      and record.operational_date between input_date_from and input_date_to
      and (v_key is null or item.delivery_key = v_key)
      and (v_result is null or exists (
        select 1 from public.routine_delivery_comparisons comparison
        where comparison.delivery_item_id = item.id and comparison.comparison_result = v_result
      ))
  ), '[]'::jsonb);
end;
$$;

create or replace function public.list_routine_delivery_mismatches(
  input_date_from date,
  input_date_to date,
  input_status_filter text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare v_actor record; v_status text := nullif(trim(coalesce(input_status_filter, '')), '');
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role not in ('manager', 'shift_lead') then
    raise exception using errcode = '42501', message = 'Coordinator authority is required for routine mismatch history.';
  end if;
  if input_date_from is null or input_date_to is null or input_date_to < input_date_from
     or input_date_to - input_date_from > 366 then
    raise exception using errcode = 'P0001', message = 'Mismatch history requires a valid date interval of at most 366 days.';
  end if;
  if v_status is not null and v_status not in (
    'open', 'mitigated', 'resolved', 'accepted_temporarily', 'cancelled', 'unlinked'
  ) then raise exception using errcode = 'P0001', message = 'Unknown mismatch status filter.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'closingDate', comparison.source_operational_date,
      'closingRunId', comparison.source_closing_run_id,
      'closingTaskId', comparison.source_closing_task_id,
      'deliveryKey', item.delivery_key, 'deliveryLabel', item.label,
      'closingReportedStatus', comparison.delivery_reported_status,
      'closingCompleter', item.source_task_completed_by_name_snapshot,
      'closingVerifier', item.task_verification_snapshot->>'verifierName',
      'closingResponsible', record.responsibility_snapshot,
      'openingDate', comparison.opening_operational_date,
      'openingRunId', comparison.opening_run_id,
      'openingTaskId', comparison.opening_task_id,
      'openingAssessment', comparison.opening_initial_assessment,
      'comparisonResult', comparison.comparison_result,
      'openingDetector', comparison.compared_by_name_snapshot,
      'linkedDeviation', case when deviation.id is null then null else to_jsonb(deviation) end,
      'managerOverride', item.override_snapshot,
      'corrections', coalesce((select jsonb_agg(to_jsonb(correction)
        order by correction.created_at, correction.id)
        from public.routine_corrections correction
        where correction.entity_id in (record.id, item.id, comparison.id)), '[]'::jsonb)
    ) order by comparison.opening_operational_date desc,
      comparison.opening_run_id, comparison.opening_task_id, comparison.comparison_sequence desc)
    from public.routine_delivery_comparisons comparison
    join public.routine_delivery_items item on item.id = comparison.delivery_item_id
    join public.routine_delivery_records record on record.id = comparison.delivery_record_id
    left join public.routine_deviations deviation on deviation.id = comparison.linked_deviation_id
    where comparison.organization_id = v_actor.organization_id
      and comparison.opening_operational_date between input_date_from and input_date_to
      and comparison.comparison_result in ('mismatch', 'confirmed_prior_deviation')
      and (v_status is null or coalesce(deviation.status, 'unlinked') = v_status)
  ), '[]'::jsonb);
end;
$$;

do $phase10g_read_rpc_rename$
begin
  if to_regprocedure('public.get_routine_run_workspace_phase10f(uuid)') is null then
    alter function public.get_routine_run_workspace(uuid) rename to get_routine_run_workspace_phase10f;
  end if;
  if to_regprocedure('public.get_routine_run_timeline_phase10f(uuid)') is null then
    alter function public.get_routine_run_timeline(uuid) rename to get_routine_run_timeline_phase10f;
  end if;
  if to_regprocedure('public.get_routine_task_timeline_phase10f(uuid)') is null then
    alter function public.get_routine_task_timeline(uuid) rename to get_routine_task_timeline_phase10f;
  end if;
end;
$phase10g_read_rpc_rename$;

create or replace function public.get_routine_run_workspace(input_run_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare v_workspace jsonb; v_context record; v_run public.routine_runs%rowtype;
  v_previous_by_task jsonb; v_comparisons jsonb; v_delivery_records jsonb; v_corrections jsonb;
begin
  select * into v_context from public.routine_lifecycle_context(input_run_id);
  select run.* into v_run from public.routine_runs run where run.id = input_run_id;
  v_workspace := public.get_routine_run_workspace_phase10f(input_run_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'taskId', task.id, 'taskKey', task.task_key_snapshot,
    'previousDeliverySummary', public.routine_select_previous_delivery_item_for_opening_task(task.id),
    'comparison', (select to_jsonb(comparison)
      from public.routine_delivery_comparisons comparison
      where comparison.opening_task_id = task.id
      order by comparison.comparison_sequence desc, comparison.id desc limit 1)
  ) order by task.sort_order_snapshot, task.task_key_snapshot), '[]'::jsonb)
  into v_previous_by_task
  from public.routine_run_tasks task
  where task.run_id = input_run_id and task.initial_assessment_policy_snapshot <> 'none';
  select coalesce(jsonb_agg(to_jsonb(comparison)
    order by comparison.opening_task_id, comparison.comparison_sequence), '[]'::jsonb)
  into v_comparisons from public.routine_delivery_comparisons comparison
  where comparison.opening_run_id = input_run_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'record', to_jsonb(record),
    'items', (select jsonb_agg(to_jsonb(item) order by item.sort_order_snapshot, item.delivery_key)
      from public.routine_delivery_items item where item.delivery_record_id = record.id),
    'current', record.source_finish_sequence = v_run.current_finish_sequence and v_run.status = 'finished'
  ) order by record.source_finish_sequence), '[]'::jsonb)
  into v_delivery_records from public.routine_delivery_records record
  where record.source_run_id = input_run_id;
  if v_context.actor_role in ('manager', 'shift_lead') then
    v_corrections := coalesce(v_workspace->'corrections', '[]'::jsonb);
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', correction.id, 'entityType', correction.entity_type,
      'entityId', correction.entity_id, 'fieldOrClaim', correction.field_or_claim,
      'createdAt', correction.created_at, 'createdByName', correction.created_by_name_snapshot
    ) order by correction.created_at, correction.id), '[]'::jsonb)
    into v_corrections from public.routine_corrections correction where correction.run_id = input_run_id;
  end if;
  return (v_workspace - 'corrections') || jsonb_build_object(
    'corrections', v_corrections,
    'delivery', jsonb_build_object(
      'preview', public.routine_preview_run_delivery(input_run_id),
      'records', v_delivery_records,
      'currentRecord', (select to_jsonb(record) from public.routine_delivery_records record
        where record.source_run_id = input_run_id
          and record.source_finish_sequence = v_run.current_finish_sequence
          and v_run.status = 'finished'),
      'supersessionCount', jsonb_array_length(v_delivery_records)
    ),
    'previousDeliveryByTask', v_previous_by_task,
    'deliveryComparisons', v_comparisons,
    'sync', (v_workspace->'sync') || jsonb_build_object('readOnlyPhase', '10G')
  );
end;
$$;

create or replace function public.get_routine_run_timeline(input_run_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare v_timeline jsonb; v_context record;
begin
  select * into v_context from public.routine_lifecycle_context(input_run_id);
  v_timeline := public.get_routine_run_timeline_phase10f(input_run_id);
  return v_timeline || jsonb_build_object(
    'deliveryRecords', coalesce((select jsonb_agg(to_jsonb(record)
      order by record.source_finish_sequence) from public.routine_delivery_records record
      where record.source_run_id = input_run_id), '[]'::jsonb),
    'deliveryComparisons', coalesce((select jsonb_agg(to_jsonb(comparison)
      order by comparison.compared_at, comparison.id)
      from public.routine_delivery_comparisons comparison
      where comparison.opening_run_id = input_run_id), '[]'::jsonb),
    'deliveryCorrections', coalesce((select jsonb_agg(to_jsonb(correction)
      order by correction.created_at, correction.id)
      from public.routine_corrections correction where correction.run_id = input_run_id
        and correction.entity_type in ('delivery_record', 'delivery_item', 'delivery_comparison')), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_routine_task_timeline(input_task_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare v_timeline jsonb; v_run_id uuid; v_context record;
begin
  select task.run_id into v_run_id from public.routine_run_tasks task where task.id = input_task_id;
  select * into v_context from public.routine_lifecycle_context(v_run_id);
  v_timeline := public.get_routine_task_timeline_phase10f(input_task_id);
  return v_timeline || jsonb_build_object(
    'deliveryItems', coalesce((select jsonb_agg(to_jsonb(item)
      order by record.source_finish_sequence, item.sort_order_snapshot)
      from public.routine_delivery_items item
      join public.routine_delivery_records record on record.id = item.delivery_record_id
      where item.source_run_task_id = input_task_id), '[]'::jsonb),
    'deliveryComparisons', coalesce((select jsonb_agg(to_jsonb(comparison)
      order by comparison.comparison_sequence)
      from public.routine_delivery_comparisons comparison
      where comparison.opening_task_id = input_task_id), '[]'::jsonb),
    'deliveryCorrections', coalesce((select jsonb_agg(to_jsonb(correction)
      order by correction.created_at, correction.id)
      from public.routine_corrections correction where correction.run_id = v_run_id
        and correction.entity_type in ('delivery_record', 'delivery_item', 'delivery_comparison')), '[]'::jsonb)
  );
end;
$$;

alter table public.routine_delivery_records enable row level security;
alter table public.routine_delivery_items enable row level security;
alter table public.routine_delivery_comparisons enable row level security;

drop policy if exists routine_delivery_records_read on public.routine_delivery_records;
create policy routine_delivery_records_read on public.routine_delivery_records
for select to authenticated using (
  organization_id = (select public.routine_current_user_organization_id())
  and public.routine_delivery_record_is_visible(id, organization_id)
);
drop policy if exists routine_delivery_items_read on public.routine_delivery_items;
create policy routine_delivery_items_read on public.routine_delivery_items
for select to authenticated using (
  organization_id = (select public.routine_current_user_organization_id())
  and public.routine_delivery_item_is_visible(id, organization_id)
);
drop policy if exists routine_delivery_comparisons_read on public.routine_delivery_comparisons;
create policy routine_delivery_comparisons_read on public.routine_delivery_comparisons
for select to authenticated using (
  organization_id = (select public.routine_current_user_organization_id())
  and public.routine_delivery_comparison_is_visible(id, organization_id)
);

revoke all privileges on table public.routine_delivery_records from public, anon, authenticated;
revoke all privileges on table public.routine_delivery_items from public, anon, authenticated;
revoke all privileges on table public.routine_delivery_comparisons from public, anon, authenticated;
grant select on table public.routine_delivery_records to authenticated;
grant select on table public.routine_delivery_items to authenticated;
grant select on table public.routine_delivery_comparisons to authenticated;

do $phase10g_function_privileges$
declare v_function record;
begin
  for v_function in
    select procedure.oid::regprocedure signature
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public' and (
      procedure.proname like 'routine%delivery%'
      or procedure.proname in (
        'finish_routine_run', 'record_routine_initial_assessment',
        'record_routine_history_correction', 'validate_routine_template_version',
        'preview_routine_run_delivery', 'get_routine_delivery_record',
        'verify_routine_delivery_record', 'get_previous_routine_delivery_for_task',
        'get_routine_delivery_comparison', 'list_routine_delivery_history',
        'list_routine_delivery_mismatches', 'get_routine_run_workspace',
        'get_routine_run_timeline', 'get_routine_task_timeline'
      )
    )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_function.signature);
  end loop;
end;
$phase10g_function_privileges$;

revoke all on function public.routine_select_current_valid_task_verification(uuid),
  public.routine_select_current_valid_run_verification(uuid) from public,anon,authenticated;

grant execute on function public.validate_routine_template_version(uuid, uuid[]) to authenticated;
grant execute on function public.finish_routine_run(uuid, bigint, uuid) to authenticated;
grant execute on function public.record_routine_initial_assessment(uuid, text, text, text, bigint, uuid) to authenticated;
grant execute on function public.record_routine_history_correction(uuid, text, uuid, text, jsonb, jsonb, text, uuid) to authenticated;
grant execute on function public.preview_routine_run_delivery(uuid) to authenticated;
grant execute on function public.get_routine_delivery_record(uuid) to authenticated;
grant execute on function public.verify_routine_delivery_record(uuid) to authenticated;
grant execute on function public.get_previous_routine_delivery_for_task(uuid) to authenticated;
grant execute on function public.get_routine_delivery_comparison(uuid) to authenticated;
grant execute on function public.list_routine_delivery_history(date, date, text, text) to authenticated;
grant execute on function public.list_routine_delivery_mismatches(date, date, text) to authenticated;
grant execute on function public.get_routine_run_workspace(uuid) to authenticated;
grant execute on function public.get_routine_run_timeline(uuid) to authenticated;
grant execute on function public.get_routine_task_timeline(uuid) to authenticated;
grant execute on function public.routine_delivery_record_is_visible(uuid, uuid) to authenticated;
grant execute on function public.routine_delivery_item_is_visible(uuid, uuid) to authenticated;
grant execute on function public.routine_delivery_comparison_is_visible(uuid, uuid) to authenticated;

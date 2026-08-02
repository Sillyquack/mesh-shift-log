-- Phase 9D: Stock Count session integrity.
-- Apply after phase9c_inventory_security_hardening.sql. This is the terminal,
-- repeatable Phase 9 migration.

alter table public.inventory_count_sessions
  add column if not exists idempotency_key uuid,
  add column if not exists session_kind text not null default 'standard',
  add column if not exists original_session_id uuid,
  add column if not exists correction_reason text,
  add column if not exists correction_created_by_auth_user_id uuid,
  add column if not exists correction_created_by_name text,
  add column if not exists correction_created_at timestamptz,
  add column if not exists finalized_with_exceptions boolean not null default false,
  add column if not exists exception_reason text,
  add column if not exists exception_skipped_count integer not null default 0,
  add column if not exists exception_uncounted_count integer not null default 0,
  add column if not exists exception_needs_review_count integer not null default 0,
  add column if not exists exception_incomplete_location_count integer not null default 0,
  add column if not exists exception_location_ids uuid[] not null default '{}'::uuid[],
  add column if not exists finalized_by_auth_user_id uuid,
  add column if not exists finalized_by_name text,
  add column if not exists finalized_at timestamptz;

update public.inventory_count_sessions
set idempotency_key = gen_random_uuid()
where idempotency_key is null;

update public.inventory_count_sessions session
set finalized_with_exceptions = coalesce((session.metadata->'completionExceptions'->>'allowed')::boolean, false)
      and (
        coalesce((session.metadata->'completionExceptions'->>'skipped')::integer, 0)
        + coalesce((session.metadata->'completionExceptions'->>'uncounted')::integer, 0)
        + coalesce((session.metadata->'completionExceptions'->>'needsReview')::integer, 0)
        + coalesce((session.metadata->'completionExceptions'->>'incompleteLocations')::integer, 0)
      ) > 0,
    exception_reason = case
      when coalesce((session.metadata->'completionExceptions'->>'allowed')::boolean, false)
        and (
          coalesce((session.metadata->'completionExceptions'->>'skipped')::integer, 0)
          + coalesce((session.metadata->'completionExceptions'->>'uncounted')::integer, 0)
          + coalesce((session.metadata->'completionExceptions'->>'needsReview')::integer, 0)
          + coalesce((session.metadata->'completionExceptions'->>'incompleteLocations')::integer, 0)
        ) > 0
        then nullif(trim(coalesce(session.completion_note, '')), '')
      else null
    end,
    exception_skipped_count = coalesce((session.metadata->'completionExceptions'->>'skipped')::integer, 0),
    exception_uncounted_count = coalesce((session.metadata->'completionExceptions'->>'uncounted')::integer, 0),
    exception_needs_review_count = coalesce((session.metadata->'completionExceptions'->>'needsReview')::integer, 0),
    exception_incomplete_location_count = coalesce((session.metadata->'completionExceptions'->>'incompleteLocations')::integer, 0),
    finalized_by_auth_user_id = session.completed_by_auth_user_id,
    finalized_by_name = session.completed_by_name,
    finalized_at = session.completed_at
where session.status in ('completed', 'approved')
  and session.finalized_at is null;

alter table public.inventory_count_sessions
  alter column idempotency_key set default gen_random_uuid(),
  alter column idempotency_key set not null;

alter table public.inventory_count_sessions
  drop constraint if exists inventory_count_sessions_kind_check,
  drop constraint if exists inventory_count_sessions_original_fk,
  drop constraint if exists inventory_count_sessions_id_org_unique,
  drop constraint if exists inventory_count_sessions_correction_actor_fk,
  drop constraint if exists inventory_count_sessions_finalized_actor_fk,
  drop constraint if exists inventory_count_sessions_correction_consistency,
  drop constraint if exists inventory_count_sessions_exception_counts_check,
  drop constraint if exists inventory_count_sessions_exception_consistency,
  drop constraint if exists inventory_count_sessions_approval_consistency,
  drop constraint if exists inventory_count_sessions_finalization_consistency;

alter table public.inventory_count_sessions
  add constraint inventory_count_sessions_kind_check
    check (session_kind in ('standard', 'correction')),
  add constraint inventory_count_sessions_id_org_unique
    unique (id, organization_id),
  add constraint inventory_count_sessions_original_fk
    foreign key (original_session_id, organization_id)
    references public.inventory_count_sessions(id, organization_id),
  add constraint inventory_count_sessions_correction_actor_fk
    foreign key (correction_created_by_auth_user_id) references auth.users(id),
  add constraint inventory_count_sessions_finalized_actor_fk
    foreign key (finalized_by_auth_user_id) references auth.users(id),
  add constraint inventory_count_sessions_correction_consistency check (
    (session_kind = 'standard'
      and original_session_id is null
      and correction_reason is null
      and correction_created_by_auth_user_id is null
      and correction_created_by_name is null
      and correction_created_at is null)
    or
    (session_kind = 'correction'
      and original_session_id is not null
      and nullif(trim(coalesce(correction_reason, '')), '') is not null
      and correction_created_by_auth_user_id is not null
      and nullif(trim(coalesce(correction_created_by_name, '')), '') is not null
      and correction_created_at is not null)
  ),
  add constraint inventory_count_sessions_exception_counts_check check (
    exception_skipped_count >= 0
    and exception_uncounted_count >= 0
    and exception_needs_review_count >= 0
    and exception_incomplete_location_count >= 0
  ),
  add constraint inventory_count_sessions_exception_consistency check (
    (finalized_with_exceptions
      and nullif(trim(coalesce(exception_reason, '')), '') is not null
      and (
        exception_skipped_count > 0
        or exception_uncounted_count > 0
        or exception_needs_review_count > 0
        or exception_incomplete_location_count > 0
      ))
    or
    (not finalized_with_exceptions
      and exception_reason is null
      and exception_skipped_count = 0
      and exception_uncounted_count = 0
      and exception_needs_review_count = 0
      and exception_incomplete_location_count = 0
      and cardinality(exception_location_ids) = 0)
  ),
  add constraint inventory_count_sessions_approval_consistency check (
    (status = 'approved'
      and approved_at is not null
      and approved_by_auth_user_id is not null
      and nullif(trim(coalesce(approved_by_name, '')), '') is not null)
    or
    (status <> 'approved'
      and approved_at is null
      and approved_by_auth_user_id is null
      and approved_by_name is null)
  ),
  add constraint inventory_count_sessions_finalization_consistency check (
    (status in ('completed', 'approved')
      and finalized_by_auth_user_id is not null
      and nullif(trim(coalesce(finalized_by_name, '')), '') is not null
      and finalized_at is not null)
    or
    (status = 'cancelled' and (
      (finalized_by_auth_user_id is null and finalized_by_name is null and finalized_at is null)
      or
      (finalized_by_auth_user_id is not null
        and nullif(trim(coalesce(finalized_by_name, '')), '') is not null
        and finalized_at is not null)
    ))
    or
    (status in ('draft', 'in_progress')
      and finalized_by_auth_user_id is null
      and finalized_by_name is null
      and finalized_at is null
      and not finalized_with_exceptions)
  );

do $$
declare
  v_conflicts text;
begin
  select string_agg(conflict.organization_id::text || ' (' || conflict.active_count || ')', ', ' order by conflict.organization_id)
  into v_conflicts
  from (
    select session.organization_id, count(*) active_count
    from public.inventory_count_sessions session
    where session.status in ('draft', 'in_progress', 'completed')
    group by session.organization_id
    having count(*) > 1
  ) conflict;

  if v_conflicts is not null then
    raise exception using
      errcode = 'P0001',
      message = 'Phase 9D cannot enforce one active Stock Count because existing organizations have conflicts: ' || v_conflicts;
  end if;
end;
$$;

drop function if exists public.complete_inventory_count_session(uuid, text, boolean, text);

create function public.complete_inventory_count_session(
  input_session_id uuid,
  input_completion_note text default null,
  input_allow_exceptions boolean default false,
  input_exception_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_session public.inventory_count_sessions%rowtype;
  v_skipped integer := 0;
  v_uncounted integer := 0;
  v_review integer := 0;
  v_locations integer := 0;
  v_completed_locations integer := 0;
  v_incomplete_locations integer := 0;
  v_exception_location_ids uuid[] := '{}'::uuid[];
  v_note text := nullif(trim(coalesce(input_completion_note, '')), '');
  v_reason text := nullif(trim(coalesce(input_exception_reason, '')), '');
  v_has_exceptions boolean := false;
begin
  if not public.current_user_can_coordinate_inventory() then
    raise exception 'Manager access is required to complete the full Stock Count.';
  end if;
  select * into v_actor from public.inventory_resolve_actor(null);
  select session.* into v_session
  from public.inventory_count_sessions session
  where session.id = input_session_id and session.organization_id = v_actor.organization_id
  for update;
  if v_session.id is null then raise exception 'Inventory count session was not found.'; end if;
  if v_session.status = 'completed' then return public.get_inventory_count_session_record(v_session.id); end if;
  if v_session.status not in ('draft', 'in_progress') then raise exception 'Only an open Stock Count can be completed.'; end if;
  perform line.id from public.inventory_count_lines line
  where line.session_id = v_session.id order by line.id for update;
  select count(*) filter (where count_status = 'skipped'),
         count(*) filter (where count_status = 'not_counted'),
         count(*) filter (where count_status = 'needs_review'),
         count(distinct location_id)
  into v_skipped, v_uncounted, v_review, v_locations
  from public.inventory_count_lines where session_id = v_session.id;
  select count(*) into v_completed_locations
  from jsonb_object_keys(coalesce(v_session.metadata->'locationCompletions', '{}'::jsonb));
  v_incomplete_locations := greatest(v_locations - v_completed_locations, 0);
  v_has_exceptions := v_skipped > 0 or v_uncounted > 0 or v_review > 0 or v_incomplete_locations > 0;

  select coalesce(array_agg(distinct problem.location_id order by problem.location_id), '{}'::uuid[])
  into v_exception_location_ids
  from (
    select line.location_id
    from public.inventory_count_lines line
    where line.session_id = v_session.id
      and line.count_status in ('skipped', 'not_counted', 'needs_review')
    union
    select line.location_id
    from public.inventory_count_lines line
    where line.session_id = v_session.id
      and not (coalesce(v_session.metadata->'locationCompletions', '{}'::jsonb) ? line.location_id::text)
  ) problem;

  if v_has_exceptions and not coalesce(input_allow_exceptions, false) then
    raise exception 'Complete every location and resolve skipped, uncounted, or review lines before completing the session.';
  end if;
  if not v_has_exceptions and coalesce(input_allow_exceptions, false) then
    raise exception 'Exception finalization is only available when unresolved Stock Count exceptions exist.';
  end if;
  if v_has_exceptions and v_reason is null then
    raise exception 'An explicit exception reason is required to finalize with exceptions.';
  end if;

  update public.inventory_count_sessions session
  set status = 'completed',
      completed_at = now(),
      completed_by_auth_user_id = v_actor.actor_auth_user_id,
      completed_by_name = v_actor.actor_name,
      completion_note = v_note,
      finalized_with_exceptions = v_has_exceptions,
      exception_reason = case when v_has_exceptions then v_reason else null end,
      exception_skipped_count = case when v_has_exceptions then v_skipped else 0 end,
      exception_uncounted_count = case when v_has_exceptions then v_uncounted else 0 end,
      exception_needs_review_count = case when v_has_exceptions then v_review else 0 end,
      exception_incomplete_location_count = case when v_has_exceptions then v_incomplete_locations else 0 end,
      exception_location_ids = case when v_has_exceptions then v_exception_location_ids else '{}'::uuid[] end,
      finalized_by_auth_user_id = v_actor.actor_auth_user_id,
      finalized_by_name = v_actor.actor_name,
      finalized_at = now(),
      metadata = jsonb_set(
        coalesce(session.metadata, '{}'::jsonb),
        '{completionExceptions}',
        jsonb_build_object(
          'allowed', v_has_exceptions,
          'reason', case when v_has_exceptions then v_reason else null end,
          'skipped', case when v_has_exceptions then v_skipped else 0 end,
          'uncounted', case when v_has_exceptions then v_uncounted else 0 end,
          'needsReview', case when v_has_exceptions then v_review else 0 end,
          'incompleteLocations', case when v_has_exceptions then v_incomplete_locations else 0 end,
          'locationIds', case when v_has_exceptions then to_jsonb(v_exception_location_ids) else '[]'::jsonb end
        ),
        true
      )
  where session.id = v_session.id returning * into v_session;
  return public.get_inventory_count_session_record(v_session.id);
end;
$$;

create or replace function public.create_inventory_correction_session(
  input_original_session_id uuid,
  input_reason text,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_original public.inventory_count_sessions%rowtype;
  v_session public.inventory_count_sessions%rowtype;
  v_reason text := nullif(trim(coalesce(input_reason, '')), '');
  v_line_count integer := 0;
  v_location_count integer := 0;
begin
  if not public.current_user_can_manage_inventory_config() then
    raise exception 'Manager access is required to create a correction Stock Count.';
  end if;
  select * into v_actor from public.inventory_resolve_actor(null);
  if input_idempotency_key is null then raise exception 'A correction idempotency key is required.'; end if;
  if v_reason is null then raise exception 'A correction reason is required.'; end if;
  select session.* into v_original
  from public.inventory_count_sessions session
  where session.id = input_original_session_id
    and session.organization_id = v_actor.organization_id
  for share;
  if v_original.id is null then raise exception 'The original Stock Count was not found.'; end if;
  if v_original.status <> 'approved' then raise exception 'Corrections can only be created from an approved Stock Count.'; end if;

  perform pg_advisory_xact_lock(hashtextextended('inventory-active:' || v_actor.organization_id::text, 0));
  select session.* into v_session
  from public.inventory_count_sessions session
  where session.organization_id = v_actor.organization_id
    and session.idempotency_key = input_idempotency_key;
  if v_session.id is not null then
    if v_session.session_kind <> 'correction' or v_session.original_session_id is distinct from v_original.id then
      raise exception 'This idempotency key was already used for another Stock Count.';
    end if;
    select count(*), count(distinct line.location_id)
    into v_line_count, v_location_count
    from public.inventory_count_lines line where line.session_id = v_session.id;
    return jsonb_build_object(
      'session', public.get_inventory_count_session_record(v_session.id),
      'summary', jsonb_build_object('lineCount', v_line_count, 'locationCount', v_location_count),
      'idempotentReplay', true
    );
  end if;
  if exists (
    select 1 from public.inventory_count_sessions session
    where session.organization_id = v_actor.organization_id
      and session.status in ('draft', 'in_progress', 'completed')
  ) then
    raise exception using errcode = 'P0001', message = 'This organization already has an active Stock Count. Complete and approve or cancel it before creating a correction.';
  end if;

  insert into public.inventory_count_sessions (
    organization_id, title, count_type, status, count_date, idempotency_key,
    session_kind, original_session_id, correction_reason,
    correction_created_by_auth_user_id, correction_created_by_name, correction_created_at,
    started_by_auth_user_id, started_by_name, metadata
  ) values (
    v_actor.organization_id, 'Correction: ' || v_original.title, v_original.count_type,
    'in_progress', (now() at time zone 'Europe/Oslo')::date, input_idempotency_key,
    'correction', v_original.id, v_reason,
    v_actor.actor_auth_user_id, v_actor.actor_name, now(),
    v_actor.actor_auth_user_id, v_actor.actor_name,
    jsonb_build_object('correctionOf', v_original.id, 'correctionReason', v_reason)
  ) returning * into v_session;

  insert into public.inventory_count_lines (
    organization_id, session_id, location_id, product_id,
    product_name_snapshot, location_name_snapshot, unit_label_snapshot, category_snapshot,
    location_sort_order_snapshot, count_order_snapshot, product_sort_order_snapshot,
    par_quantity_snapshot, minimum_quantity_snapshot,
    stock_policy_snapshot, target_mode_snapshot, effective_target_quantity_snapshot,
    service_target_basis_snapshot, reserve_multiplier_snapshot, case_size_snapshot,
    target_cases_snapshot, target_loose_quantity_snapshot,
    physical_recount_interval_days_snapshot, previous_verified_count_line_id,
    previous_physical_count_quantity_snapshot, previous_physical_counted_at_snapshot
  )
  select source.organization_id, v_session.id, source.location_id, source.product_id,
    source.product_name_snapshot, source.location_name_snapshot, source.unit_label_snapshot, source.category_snapshot,
    source.location_sort_order_snapshot, source.count_order_snapshot, source.product_sort_order_snapshot,
    source.par_quantity_snapshot, source.minimum_quantity_snapshot,
    source.stock_policy_snapshot, source.target_mode_snapshot, source.effective_target_quantity_snapshot,
    source.service_target_basis_snapshot, source.reserve_multiplier_snapshot, source.case_size_snapshot,
    source.target_cases_snapshot, source.target_loose_quantity_snapshot,
    source.physical_recount_interval_days_snapshot, source.previous_verified_count_line_id,
    source.previous_physical_count_quantity_snapshot, source.previous_physical_counted_at_snapshot
  from public.inventory_count_lines source
  where source.session_id = v_original.id and source.organization_id = v_actor.organization_id
  order by source.location_sort_order_snapshot, source.location_name_snapshot,
    source.count_order_snapshot, source.product_sort_order_snapshot, source.product_name_snapshot;
  get diagnostics v_line_count = row_count;
  if v_line_count = 0 then raise exception 'The approved Stock Count has no lines to correct.'; end if;
  select count(distinct line.location_id) into v_location_count
  from public.inventory_count_lines line where line.session_id = v_session.id;
  return jsonb_build_object(
    'session', public.get_inventory_count_session_record(v_session.id),
    'summary', jsonb_build_object('lineCount', v_line_count, 'locationCount', v_location_count),
    'idempotentReplay', false
  );
end;
$$;

drop function if exists public.reopen_inventory_count_session(uuid, text);

revoke all privileges on table public.inventory_count_sessions from authenticated;
grant select (
  id, organization_id, title, count_type, status, count_date, started_at,
  completed_at, approved_at, started_by_name, completed_by_name, approved_by_name,
  completion_note, approval_note, session_kind, original_session_id,
  correction_reason, correction_created_by_name, correction_created_at,
  finalized_with_exceptions, exception_reason, exception_skipped_count,
  exception_uncounted_count, exception_needs_review_count,
  exception_incomplete_location_count, exception_location_ids,
  finalized_by_name, finalized_at, updated_at
) on table public.inventory_count_sessions to authenticated;

create or replace function public.inventory_lock_mutable_count_line(
  input_line_id uuid,
  input_organization_id uuid,
  input_expected_updated_at timestamptz,
  input_action text
)
returns public.inventory_count_lines
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_session_id uuid;
  v_status text;
  v_line public.inventory_count_lines%rowtype;
begin
  if input_expected_updated_at is null then
    raise exception using errcode = 'P0001', message = 'A current line version is required. Refresh before ' || coalesce(input_action, 'saving') || '.';
  end if;
  select line.session_id into v_session_id
  from public.inventory_count_lines line
  where line.id = input_line_id and line.organization_id = input_organization_id;
  if v_session_id is null then raise exception 'Inventory count line was not found.'; end if;
  select session.status into v_status
  from public.inventory_count_sessions session
  where session.id = v_session_id and session.organization_id = input_organization_id
  for update;
  if v_status is null then raise exception 'Inventory count session was not found.'; end if;
  if v_status not in ('draft', 'in_progress') then
    raise exception 'This Stock Count is read-only because it is %.', v_status;
  end if;
  select line.* into v_line
  from public.inventory_count_lines line
  where line.id = input_line_id
    and line.session_id = v_session_id
    and line.organization_id = input_organization_id
  for update;
  if v_line.id is null then raise exception 'Inventory count line was not found.'; end if;
  if v_line.updated_at is distinct from input_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'This count line changed on another device. Refresh before saving your value.';
  end if;
  return v_line;
end;
$$;

create or replace function public.set_inventory_count_line_quantity(
  input_line_id uuid,
  input_counted_quantity numeric,
  input_note text default null,
  input_actor_name text default null,
  input_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_line public.inventory_count_lines%rowtype;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  if input_counted_quantity is null then raise exception 'Enter a counted quantity or use Clear.'; end if;
  if input_counted_quantity < 0 then raise exception 'Counted quantity cannot be negative.'; end if;
  v_line := public.inventory_lock_mutable_count_line(input_line_id, v_actor.organization_id, input_expected_updated_at, 'saving this count');
  update public.inventory_count_lines line
  set counted_quantity = input_counted_quantity,
      count_full_cases = null,
      count_loose_quantity = null,
      count_method = 'manual',
      count_status = 'counted',
      note = nullif(trim(coalesce(input_note, '')), ''),
      counted_at = now(),
      counted_by_auth_user_id = v_actor.actor_auth_user_id,
      counted_by_name = v_actor.actor_name
  where line.id = v_line.id returning * into v_line;
  update public.inventory_count_sessions session
  set metadata = session.metadata #- array['locationCompletions', v_line.location_id::text]
  where session.id = v_line.session_id;
  return public.inventory_count_line_client_record(v_line.id);
end;
$$;

create or replace function public.set_inventory_count_line_case_quantity(
  input_line_id uuid,
  input_full_cases integer,
  input_loose_quantity numeric default 0,
  input_note text default null,
  input_actor_name text default null,
  input_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_line public.inventory_count_lines%rowtype;
  v_total numeric;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  if input_full_cases is null or input_full_cases < 0 then raise exception 'Full cases cannot be negative.'; end if;
  if input_loose_quantity is null or input_loose_quantity < 0 then raise exception 'Loose units cannot be negative.'; end if;
  v_line := public.inventory_lock_mutable_count_line(input_line_id, v_actor.organization_id, input_expected_updated_at, 'saving this case count');
  if v_line.stock_policy_snapshot <> 'protected_event_reserve' or v_line.case_size_snapshot is null then
    raise exception 'Case counting is only available for configured protected event reserve stock.';
  end if;
  v_total := input_full_cases * v_line.case_size_snapshot + input_loose_quantity;
  update public.inventory_count_lines line
  set counted_quantity = v_total,
      count_full_cases = input_full_cases,
      count_loose_quantity = input_loose_quantity,
      count_method = 'manual',
      count_status = 'counted',
      note = nullif(trim(coalesce(input_note, '')), ''),
      counted_at = now(),
      counted_by_auth_user_id = v_actor.actor_auth_user_id,
      counted_by_name = v_actor.actor_name
  where line.id = v_line.id returning * into v_line;
  update public.inventory_count_sessions session
  set metadata = session.metadata #- array['locationCompletions', v_line.location_id::text]
  where session.id = v_line.session_id;
  return public.inventory_count_line_client_record(v_line.id);
end;
$$;

create or replace function public.mark_inventory_count_line_use_par(
  input_line_id uuid,
  input_note text default null,
  input_actor_name text default null,
  input_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_line public.inventory_count_lines%rowtype;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  v_line := public.inventory_lock_mutable_count_line(input_line_id, v_actor.organization_id, input_expected_updated_at, 'marking it fully stocked');
  if v_line.stock_policy_snapshot <> 'exact_par' then
    raise exception 'Mark fully stocked is only available for exact-par service stock.';
  end if;
  if v_line.count_method = 'use_par' and v_line.count_status = 'counted'
     and v_line.counted_quantity = v_line.par_quantity_snapshot then
    return public.inventory_count_line_client_record(v_line.id);
  end if;
  update public.inventory_count_lines line
  set counted_quantity = line.par_quantity_snapshot,
      count_full_cases = null,
      count_loose_quantity = null,
      count_method = 'use_par',
      count_status = 'counted',
      note = nullif(trim(coalesce(input_note, '')), ''),
      counted_at = now(),
      counted_by_auth_user_id = v_actor.actor_auth_user_id,
      counted_by_name = v_actor.actor_name
  where line.id = v_line.id returning * into v_line;
  update public.inventory_count_sessions session
  set metadata = session.metadata #- array['locationCompletions', v_line.location_id::text]
  where session.id = v_line.session_id;
  return public.inventory_count_line_client_record(v_line.id);
end;
$$;

create or replace function public.clear_inventory_count_line(
  input_line_id uuid,
  input_actor_name text default null,
  input_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_line public.inventory_count_lines%rowtype;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  v_line := public.inventory_lock_mutable_count_line(input_line_id, v_actor.organization_id, input_expected_updated_at, 'clearing it');
  update public.inventory_count_lines line
  set counted_quantity = null,
      count_full_cases = null,
      count_loose_quantity = null,
      count_method = 'uncounted',
      count_status = 'not_counted',
      note = null,
      counted_at = null,
      counted_by_auth_user_id = null,
      counted_by_name = null
  where line.id = v_line.id returning * into v_line;
  update public.inventory_count_sessions session
  set metadata = session.metadata #- array['locationCompletions', v_line.location_id::text]
  where session.id = v_line.session_id;
  return public.inventory_count_line_client_record(v_line.id);
end;
$$;

create or replace function public.skip_inventory_count_line(
  input_line_id uuid,
  input_note text,
  input_actor_name text default null,
  input_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_line public.inventory_count_lines%rowtype;
  v_note text := nullif(trim(coalesce(input_note, '')), '');
begin
  if v_note is null then raise exception 'A note is required when a count line is skipped.'; end if;
  select * into v_actor from public.inventory_resolve_actor(null);
  v_line := public.inventory_lock_mutable_count_line(input_line_id, v_actor.organization_id, input_expected_updated_at, 'skipping it');
  update public.inventory_count_lines line
  set counted_quantity = null,
      count_full_cases = null,
      count_loose_quantity = null,
      count_method = 'uncounted',
      count_status = 'skipped',
      note = v_note,
      counted_at = now(),
      counted_by_auth_user_id = v_actor.actor_auth_user_id,
      counted_by_name = v_actor.actor_name
  where line.id = v_line.id returning * into v_line;
  update public.inventory_count_sessions session
  set metadata = session.metadata #- array['locationCompletions', v_line.location_id::text]
  where session.id = v_line.session_id;
  return public.inventory_count_line_client_record(v_line.id);
end;
$$;

create or replace function public.confirm_inventory_count_line_unchanged(
  input_line_id uuid,
  input_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_line public.inventory_count_lines%rowtype;
  v_previous_session public.inventory_count_sessions%rowtype;
  v_previous public.inventory_count_lines%rowtype;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  v_line := public.inventory_lock_mutable_count_line(input_line_id, v_actor.organization_id, input_expected_updated_at, 'confirming unchanged');
  if v_line.stock_policy_snapshot <> 'verify_unchanged' then
    raise exception 'Unchanged confirmation is only available for dormant-stock lines.';
  end if;
  if v_line.count_method = 'confirmed_unchanged' and v_line.count_status = 'counted' then
    return public.inventory_count_line_client_record(v_line.id);
  end if;
  if v_line.count_method <> 'uncounted' or v_line.count_status <> 'not_counted' or v_line.counted_quantity is not null then
    raise exception 'A current count already exists for this line. Clear it before confirming unchanged.';
  end if;
  if v_line.previous_verified_count_line_id is null
     or v_line.previous_physical_counted_at_snapshot is null
     or v_line.previous_physical_count_quantity_snapshot is null then
    raise exception 'A previous finalized physical count is required before unchanged confirmation.';
  end if;
  select session.* into v_previous_session
  from public.inventory_count_sessions session
  join public.inventory_count_lines previous on previous.session_id = session.id
  where previous.id = v_line.previous_verified_count_line_id
    and previous.organization_id = v_actor.organization_id
    and session.organization_id = v_actor.organization_id
    and session.status in ('completed', 'approved')
  for share of session;
  if v_previous_session.id is null then raise exception 'The previous physical count is no longer in a finalized session.'; end if;
  select previous.* into v_previous
  from public.inventory_count_lines previous
  where previous.id = v_line.previous_verified_count_line_id
    and previous.organization_id = v_actor.organization_id
    and previous.session_id = v_previous_session.id
    and previous.location_id = v_line.location_id
    and previous.product_id = v_line.product_id
    and previous.count_method in ('manual', 'imported', 'adjusted')
    and previous.count_status = 'counted'
  for share;
  if v_previous.id is null
     or v_previous.counted_quantity is distinct from v_line.previous_physical_count_quantity_snapshot
     or v_previous.counted_at is distinct from v_line.previous_physical_counted_at_snapshot then
    raise exception 'The previous physical count changed after this session started. Enter a physical count instead.';
  end if;
  if v_line.previous_physical_counted_at_snapshot
     < now() - make_interval(days => v_line.physical_recount_interval_days_snapshot) then
    raise exception 'Physical recount required because the previous physical count is outside the configured interval.';
  end if;
  update public.inventory_count_lines line
  set counted_quantity = v_line.previous_physical_count_quantity_snapshot,
      count_full_cases = null,
      count_loose_quantity = null,
      count_method = 'confirmed_unchanged',
      count_status = 'counted',
      note = 'Manager attestation: no known movement since the previous physical count. Shopbox movement validation is not connected.',
      counted_at = now(),
      counted_by_auth_user_id = v_actor.actor_auth_user_id,
      counted_by_name = v_actor.actor_name
  where line.id = v_line.id returning * into v_line;
  update public.inventory_count_sessions session
  set metadata = session.metadata #- array['locationCompletions', v_line.location_id::text]
  where session.id = v_line.session_id;
  return public.inventory_count_line_client_record(v_line.id);
end;
$$;

drop function if exists public.mark_inventory_location_use_par(uuid, uuid, boolean, text);

create or replace function public.mark_inventory_location_use_par(
  input_session_id uuid,
  input_location_id uuid,
  input_replace_existing boolean default false,
  input_actor_name text default null,
  input_expected_session_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_session public.inventory_count_sessions%rowtype;
  v_updated integer := 0;
  v_preserved_manual integer := 0;
  v_already_standard integer := 0;
  v_skipped integer := 0;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  select session.* into v_session
  from public.inventory_count_sessions session
  where session.id = input_session_id and session.organization_id = v_actor.organization_id
  for update;
  if v_session.id is null or v_session.status not in ('draft', 'in_progress') then
    raise exception 'This Stock Count is not available for changes.';
  end if;
  if coalesce(input_replace_existing, false) then
    if input_expected_session_updated_at is null then
      raise exception 'A current session version is required before replacing existing counts.';
    end if;
    if v_session.updated_at is distinct from input_expected_session_updated_at then
      raise exception 'This Stock Count changed on another device. Refresh before replacing existing counts.';
    end if;
  end if;
  if not exists (
    select 1 from public.inventory_count_lines line
    where line.session_id = v_session.id and line.location_id = input_location_id
  ) then raise exception 'This location is not part of the Stock Count.'; end if;
  perform line.id from public.inventory_count_lines line
  where line.session_id = v_session.id and line.location_id = input_location_id
  order by line.id for update;
  select count(*) filter (where count_method = 'manual' and count_status in ('counted', 'needs_review')),
         count(*) filter (where count_method = 'use_par' and count_status = 'counted'),
         count(*) filter (where count_status = 'skipped')
  into v_preserved_manual, v_already_standard, v_skipped
  from public.inventory_count_lines
  where session_id = v_session.id and location_id = input_location_id;
  update public.inventory_count_lines line
  set counted_quantity = line.par_quantity_snapshot,
      count_full_cases = null,
      count_loose_quantity = null,
      count_method = 'use_par',
      count_status = 'counted',
      counted_at = now(),
      counted_by_auth_user_id = v_actor.actor_auth_user_id,
      counted_by_name = v_actor.actor_name,
      note = case when coalesce(input_replace_existing, false) then 'Replaced with stocking standard by manager.' else line.note end
  where line.session_id = v_session.id
    and line.location_id = input_location_id
    and line.stock_policy_snapshot = 'exact_par'
    and (
      (coalesce(input_replace_existing, false) and line.count_status <> 'skipped' and (
        line.counted_quantity is distinct from line.par_quantity_snapshot
        or line.count_method <> 'use_par'
        or line.count_status <> 'counted'
        or line.note is distinct from 'Replaced with stocking standard by manager.'
      ))
      or (not coalesce(input_replace_existing, false) and line.count_status = 'not_counted')
    );
  get diagnostics v_updated = row_count;
  if v_updated > 0 then
    update public.inventory_count_sessions session
    set metadata = session.metadata #- array['locationCompletions', input_location_id::text]
    where session.id = v_session.id;
  end if;
  return jsonb_build_object(
    'updated', v_updated,
    'preservedManual', case when input_replace_existing then 0 else v_preserved_manual end,
    'alreadyStandard', v_already_standard,
    'skipped', v_skipped
  );
end;
$$;

create unique index if not exists inventory_count_sessions_org_idempotency_unique
  on public.inventory_count_sessions (organization_id, idempotency_key);
create unique index if not exists inventory_count_sessions_one_active_per_org
  on public.inventory_count_sessions (organization_id)
  where status in ('draft', 'in_progress', 'completed');
create index if not exists inventory_count_sessions_original_idx
  on public.inventory_count_sessions (original_session_id)
  where original_session_id is not null;

create or replace function public.inventory_enforce_count_session_integrity()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('completed', 'approved', 'cancelled') then
      raise exception using errcode = 'P0001', message = 'Finalized Stock Count sessions cannot be deleted.';
    end if;
    return old;
  end if;

  if old.status in ('approved', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'Approved or cancelled Stock Count sessions are immutable.';
  end if;

  if old.status = 'completed' then
    if new.status = 'approved' then
      if (to_jsonb(new) - array['status','approved_at','approved_by_auth_user_id','approved_by_name','approval_note','updated_at'])
         is distinct from
         (to_jsonb(old) - array['status','approved_at','approved_by_auth_user_id','approved_by_name','approval_note','updated_at']) then
        raise exception using errcode = 'P0001', message = 'A completed Stock Count can only receive approval audit fields.';
      end if;
    elsif new.status = 'cancelled' then
      if (to_jsonb(new) - array['status','metadata','updated_at'])
         is distinct from
         (to_jsonb(old) - array['status','metadata','updated_at']) then
        raise exception using errcode = 'P0001', message = 'A completed Stock Count can only be approved or cancelled.';
      end if;
    else
      raise exception using errcode = 'P0001', message = 'Completed Stock Counts are read-only while awaiting approval.';
    end if;
    return new;
  end if;

  if new.status not in ('draft', 'in_progress', 'completed', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'This Stock Count status transition is not allowed.';
  end if;
  return new;
end;
$$;

create or replace function public.inventory_enforce_count_line_integrity()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_status text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select session.status into v_status
    from public.inventory_count_sessions session
    where session.id = old.session_id
    for key share;
    if v_status not in ('draft', 'in_progress') then
      raise exception using errcode = 'P0001', message = 'Lines in a completed, approved, or cancelled Stock Count are immutable.';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select session.status into v_status
    from public.inventory_count_sessions session
    where session.id = new.session_id
    for key share;
    if v_status is null then
      raise exception using errcode = 'P0001', message = 'The parent Stock Count session was not found.';
    end if;
    if v_status not in ('draft', 'in_progress') then
      raise exception using errcode = 'P0001', message = 'Lines can only be changed in an open Stock Count.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists inventory_count_sessions_integrity on public.inventory_count_sessions;
create trigger inventory_count_sessions_integrity
before update or delete on public.inventory_count_sessions
for each row execute function public.inventory_enforce_count_session_integrity();

drop trigger if exists inventory_count_lines_integrity on public.inventory_count_lines;
create trigger inventory_count_lines_integrity
before insert or update or delete on public.inventory_count_lines
for each row execute function public.inventory_enforce_count_line_integrity();

create or replace function public.get_inventory_count_session_record(input_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_session public.inventory_count_sessions%rowtype;
  v_location_completions jsonb := '{}'::jsonb;
begin
  if not public.inventory_session_is_visible(input_session_id) then
    raise exception 'Inventory count session was not found or is not available.';
  end if;
  select session.* into v_session
  from public.inventory_count_sessions session
  where session.id = input_session_id
    and session.organization_id = public.current_user_organization_id();
  if v_session.id is null then raise exception 'Inventory count session was not found.'; end if;
  select coalesce(jsonb_object_agg(entry.key, entry.value - 'completedByAuthUserId'), '{}'::jsonb)
  into v_location_completions
  from jsonb_each(coalesce(v_session.metadata->'locationCompletions', '{}'::jsonb)) entry;
  return jsonb_build_object(
    'id', v_session.id,
    'title', v_session.title,
    'count_type', v_session.count_type,
    'status', v_session.status,
    'count_date', v_session.count_date,
    'started_at', v_session.started_at,
    'completed_at', v_session.completed_at,
    'approved_at', v_session.approved_at,
    'started_by_name', v_session.started_by_name,
    'completed_by_name', v_session.completed_by_name,
    'approved_by_name', v_session.approved_by_name,
    'completion_note', v_session.completion_note,
    'approval_note', v_session.approval_note,
    'session_kind', v_session.session_kind,
    'original_session_id', v_session.original_session_id,
    'correction_reason', v_session.correction_reason,
    'correction_created_by_name', v_session.correction_created_by_name,
    'correction_created_at', v_session.correction_created_at,
    'finalized_with_exceptions', v_session.finalized_with_exceptions,
    'exception_reason', v_session.exception_reason,
    'exception_skipped_count', v_session.exception_skipped_count,
    'exception_uncounted_count', v_session.exception_uncounted_count,
    'exception_needs_review_count', v_session.exception_needs_review_count,
    'exception_incomplete_location_count', v_session.exception_incomplete_location_count,
    'exception_location_ids', v_session.exception_location_ids,
    'finalized_by_name', v_session.finalized_by_name,
    'finalized_at', v_session.finalized_at,
    'metadata', jsonb_strip_nulls(jsonb_build_object(
      'startNote', v_session.metadata->'startNote',
      'locationCompletions', v_location_completions,
      'completionExceptions', v_session.metadata->'completionExceptions'
    )),
    'updated_at', v_session.updated_at
  );
end;
$$;

drop function if exists public.create_inventory_count_session(text, text, date, uuid[], text, text);

create or replace function public.create_inventory_count_session(
  input_title text,
  input_count_type text,
  input_idempotency_key uuid,
  input_count_date date default null,
  input_location_ids uuid[] default null,
  input_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_session public.inventory_count_sessions%rowtype;
  v_line_count integer := 0;
  v_location_count integer := 0;
  v_title text := nullif(trim(coalesce(input_title, '')), '');
  v_type text := lower(trim(coalesce(input_count_type, '')));
begin
  if not public.current_user_can_coordinate_inventory() then
    raise exception 'Manager access is required to start a Stock Count.';
  end if;
  select * into v_actor from public.inventory_resolve_actor(null);
  if input_idempotency_key is null then raise exception 'A Stock Count idempotency key is required.'; end if;
  if v_title is null then raise exception 'Count session title is required.'; end if;
  if v_type not in ('opening', 'closing', 'daily', 'weekly', 'monthly', 'ad_hoc', 'event', 'other') then
    raise exception 'Choose a valid stock count type.';
  end if;
  if input_location_ids is not null and cardinality(input_location_ids) = 0 then
    raise exception 'Choose at least one inventory location.';
  end if;
  if input_location_ids is not null and exists (
    select 1 from unnest(input_location_ids) selected(id)
    where not exists (
      select 1 from public.inventory_locations location
      where location.id = selected.id
        and location.organization_id = v_actor.organization_id
        and location.active = true
    )
  ) then
    raise exception 'One or more selected inventory locations are unavailable.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('inventory-active:' || v_actor.organization_id::text, 0));
  select session.* into v_session
  from public.inventory_count_sessions session
  where session.organization_id = v_actor.organization_id
    and session.idempotency_key = input_idempotency_key;
  if v_session.id is not null then
    select count(*), count(distinct line.location_id)
    into v_line_count, v_location_count
    from public.inventory_count_lines line where line.session_id = v_session.id;
    return jsonb_build_object(
      'session', public.get_inventory_count_session_record(v_session.id),
      'summary', jsonb_build_object('lineCount', v_line_count, 'locationCount', v_location_count),
      'idempotentReplay', true
    );
  end if;
  if exists (
    select 1 from public.inventory_count_sessions session
    where session.organization_id = v_actor.organization_id
      and session.status in ('draft', 'in_progress', 'completed')
  ) then
    raise exception using errcode = 'P0001', message = 'This organization already has an active Stock Count. Complete and approve or cancel it before starting another.';
  end if;

  insert into public.inventory_count_sessions (
    organization_id, title, count_type, status, count_date, idempotency_key,
    started_by_auth_user_id, started_by_name, metadata
  ) values (
    v_actor.organization_id, v_title, v_type, 'in_progress',
    coalesce(input_count_date, (now() at time zone 'Europe/Oslo')::date), input_idempotency_key,
    v_actor.actor_auth_user_id, v_actor.actor_name,
    jsonb_strip_nulls(jsonb_build_object('startNote', nullif(trim(coalesce(input_note, '')), '')))
  ) returning * into v_session;

  with recursive selected_locations as (
    select location.id
    from public.inventory_locations location
    where location.organization_id = v_actor.organization_id
      and location.active = true
      and (input_location_ids is null or location.id = any(input_location_ids))
    union
    select child.id
    from public.inventory_locations child
    join selected_locations parent on child.parent_location_id = parent.id
    where child.organization_id = v_actor.organization_id and child.active = true
  )
  insert into public.inventory_count_lines (
    organization_id, session_id, location_id, product_id,
    product_name_snapshot, location_name_snapshot, unit_label_snapshot,
    category_snapshot, location_sort_order_snapshot, count_order_snapshot,
    product_sort_order_snapshot, par_quantity_snapshot, minimum_quantity_snapshot,
    stock_policy_snapshot, target_mode_snapshot, effective_target_quantity_snapshot,
    service_target_basis_snapshot, reserve_multiplier_snapshot, case_size_snapshot,
    target_cases_snapshot, target_loose_quantity_snapshot,
    physical_recount_interval_days_snapshot, previous_verified_count_line_id,
    previous_physical_count_quantity_snapshot, previous_physical_counted_at_snapshot
  )
  select standard.organization_id, v_session.id, standard.location_id, standard.product_id,
    product.name, location.name, product.unit_label, product.category,
    location.sort_order, standard.count_order, product.sort_order,
    coalesce(target.effective_target_quantity, 0), standard.minimum_quantity,
    standard.stock_policy, standard.target_mode, target.effective_target_quantity,
    target.service_target_basis, standard.reserve_multiplier, standard.case_size,
    standard.target_cases, standard.target_loose_quantity,
    standard.physical_recount_interval_days, previous.id,
    previous.counted_quantity, previous.counted_at
  from public.inventory_location_products standard
  join public.inventory_products product
    on product.id = standard.product_id and product.organization_id = standard.organization_id and product.active = true
  join public.inventory_locations location
    on location.id = standard.location_id and location.organization_id = standard.organization_id and location.active = true
  cross join lateral public.inventory_stock_policy_target(standard.id) target
  left join lateral (
    select old_line.id, old_line.counted_quantity, old_line.counted_at
    from public.inventory_count_lines old_line
    join public.inventory_count_sessions old_session
      on old_session.id = old_line.session_id
      and old_session.organization_id = old_line.organization_id
      and old_session.status in ('completed', 'approved')
    where old_line.organization_id = standard.organization_id
      and old_line.location_id = standard.location_id
      and old_line.product_id = standard.product_id
      and old_line.count_method in ('manual', 'imported', 'adjusted')
      and old_line.count_status = 'counted'
      and old_line.counted_quantity is not null
      and old_line.counted_at is not null
    order by old_line.counted_at desc, old_line.id desc limit 1
  ) previous on standard.stock_policy = 'verify_unchanged'
  where standard.organization_id = v_actor.organization_id
    and standard.active = true
    and (input_location_ids is null or standard.location_id in (select id from selected_locations))
  order by location.sort_order, location.name, standard.count_order, product.sort_order, product.name;
  get diagnostics v_line_count = row_count;
  if v_line_count = 0 then raise exception 'No active inventory products are configured for the selected locations.'; end if;
  select count(distinct line.location_id) into v_location_count
  from public.inventory_count_lines line where line.session_id = v_session.id;
  return jsonb_build_object(
    'session', public.get_inventory_count_session_record(v_session.id),
    'summary', jsonb_build_object('lineCount', v_line_count, 'locationCount', v_location_count),
    'idempotentReplay', false
  );
end;
$$;

create or replace function public.complete_inventory_count_location(
  input_session_id uuid,
  input_location_id uuid,
  input_actor_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_session public.inventory_count_sessions%rowtype;
  v_uncounted integer := 0;
  v_review integer := 0;
  v_total integer := 0;
  v_completion jsonb;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  select session.* into v_session
  from public.inventory_count_sessions session
  where session.id = input_session_id and session.organization_id = v_actor.organization_id
  for update;
  if v_session.id is null then raise exception 'Inventory count session was not found.'; end if;
  if v_session.status not in ('draft', 'in_progress') then
    raise exception 'This Stock Count is read-only because it is %.', v_session.status;
  end if;
  if coalesce(v_session.metadata->'locationCompletions', '{}'::jsonb) ? input_location_id::text then
    return jsonb_build_object('session', public.get_inventory_count_session_record(v_session.id), 'locationId', input_location_id, 'complete', true);
  end if;
  perform line.id from public.inventory_count_lines line
  where line.session_id = v_session.id and line.location_id = input_location_id
  order by line.id for update;
  select count(*),
         count(*) filter (where count_status = 'not_counted'),
         count(*) filter (where count_status = 'needs_review')
  into v_total, v_uncounted, v_review
  from public.inventory_count_lines
  where session_id = v_session.id and location_id = input_location_id;
  if v_total = 0 then raise exception 'This location is not part of the Stock Count.'; end if;
  if v_uncounted > 0 then raise exception '% product(s) still need a count or a documented skip.', v_uncounted; end if;
  if v_review > 0 then raise exception '% product(s) still need review.', v_review; end if;
  v_completion := jsonb_build_object(
    'completedAt', now(),
    'completedByName', v_actor.actor_name,
    'completedByAuthUserId', v_actor.actor_auth_user_id
  );
  update public.inventory_count_sessions session
  set metadata = jsonb_set(
    coalesce(session.metadata, '{}'::jsonb),
    '{locationCompletions}',
    coalesce(session.metadata->'locationCompletions', '{}'::jsonb)
      || jsonb_build_object(input_location_id::text, v_completion),
    true
  )
  where session.id = v_session.id returning * into v_session;
  return jsonb_build_object('session', public.get_inventory_count_session_record(v_session.id), 'locationId', input_location_id, 'complete', true);
end;
$$;

revoke all on function public.inventory_enforce_count_session_integrity() from public, anon, authenticated;
revoke all on function public.inventory_enforce_count_line_integrity() from public, anon, authenticated;
revoke all on function public.inventory_lock_mutable_count_line(uuid, uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.get_inventory_count_session_record(uuid) from public, anon, authenticated;
revoke all on function public.create_inventory_count_session(text, text, uuid, date, uuid[], text) from public, anon, authenticated;
revoke all on function public.create_inventory_correction_session(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.set_inventory_count_line_quantity(uuid, numeric, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.set_inventory_count_line_case_quantity(uuid, integer, numeric, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.mark_inventory_count_line_use_par(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.clear_inventory_count_line(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.skip_inventory_count_line(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.confirm_inventory_count_line_unchanged(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.mark_inventory_location_use_par(uuid, uuid, boolean, text, timestamptz) from public, anon, authenticated;
revoke all on function public.complete_inventory_count_location(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.complete_inventory_count_session(uuid, text, boolean, text) from public, anon, authenticated;
revoke all on function public.approve_inventory_count_session(uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_inventory_count_session(uuid, text) from public, anon, authenticated;

grant execute on function public.get_inventory_count_session_record(uuid) to authenticated;
grant execute on function public.create_inventory_count_session(text, text, uuid, date, uuid[], text) to authenticated;
grant execute on function public.create_inventory_correction_session(uuid, text, uuid) to authenticated;
grant execute on function public.set_inventory_count_line_quantity(uuid, numeric, text, text, timestamptz) to authenticated;
grant execute on function public.set_inventory_count_line_case_quantity(uuid, integer, numeric, text, text, timestamptz) to authenticated;
grant execute on function public.mark_inventory_count_line_use_par(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.clear_inventory_count_line(uuid, text, timestamptz) to authenticated;
grant execute on function public.skip_inventory_count_line(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.confirm_inventory_count_line_unchanged(uuid, timestamptz) to authenticated;
grant execute on function public.mark_inventory_location_use_par(uuid, uuid, boolean, text, timestamptz) to authenticated;
grant execute on function public.complete_inventory_count_location(uuid, uuid, text) to authenticated;
grant execute on function public.complete_inventory_count_session(uuid, text, boolean, text) to authenticated;
grant execute on function public.approve_inventory_count_session(uuid, text) to authenticated;
grant execute on function public.cancel_inventory_count_session(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- Phase 9G-B2: manager-controlled replacement of an unavailable Stock Count
-- counter. Apply after Phase 9G-B. This terminal layer is repeatable.

alter table public.inventory_count_assignments
  add column if not exists replaces_assignment_id uuid,
  add column if not exists superseded_by_assignment_id uuid,
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by_auth_user_id uuid references auth.users(id),
  add column if not exists superseded_by_name text,
  add column if not exists supersession_reason text,
  add column if not exists replacement_data_action text,
  add column if not exists superseded_recorded_line_count integer,
  add column if not exists superseded_total_line_count integer,
  add column if not exists superseded_line_snapshot jsonb not null default '[]'::jsonb;

alter table public.inventory_count_assignments
  drop constraint if exists inventory_count_assignments_session_location_unique,
  drop constraint if exists inventory_count_assignments_state_check,
  drop constraint if exists inventory_count_assignments_state_audit,
  drop constraint if exists inventory_count_assignments_replacement_audit,
  drop constraint if exists inventory_count_assignments_replacement_link_check,
  drop constraint if exists inventory_count_assignments_replacement_counts_check,
  drop constraint if exists inventory_count_assignments_replacement_snapshot_array;

alter table public.inventory_count_assignments
  add constraint inventory_count_assignments_state_check
    check (state in ('assigned', 'submitted', 'returned', 'accepted', 'superseded')),
  add constraint inventory_count_assignments_state_audit check (
    (state = 'assigned' and submitted_at is null and returned_at is null and accepted_at is null)
    or (state = 'submitted' and submitted_at is not null and accepted_at is null)
    or (state = 'returned' and submitted_at is not null and returned_at is not null and accepted_at is null)
    or (state = 'accepted' and submitted_at is not null and accepted_at is not null)
    or (state = 'superseded' and accepted_at is null)
  ),
  add constraint inventory_count_assignments_replacement_audit check (
    (
      state <> 'superseded'
      and superseded_by_assignment_id is null
      and superseded_at is null
      and superseded_by_auth_user_id is null
      and superseded_by_name is null
      and supersession_reason is null
      and replacement_data_action is null
      and superseded_recorded_line_count is null
      and superseded_total_line_count is null
      and superseded_line_snapshot = '[]'::jsonb
    )
    or (
      state = 'superseded'
      and superseded_by_assignment_id is not null
      and superseded_at is not null
      and superseded_by_auth_user_id is not null
      and nullif(trim(superseded_by_name), '') is not null
      and nullif(trim(supersession_reason), '') is not null
      and replacement_data_action in ('preserve', 'clear_unsubmitted')
      and superseded_recorded_line_count is not null
      and superseded_total_line_count is not null
    )
  ),
  add constraint inventory_count_assignments_replacement_link_check check (
    (replaces_assignment_id is null or replaces_assignment_id <> id)
    and (superseded_by_assignment_id is null or superseded_by_assignment_id <> id)
  ),
  add constraint inventory_count_assignments_replacement_counts_check check (
    superseded_recorded_line_count is null
    or (
      superseded_recorded_line_count >= 0
      and superseded_total_line_count >= superseded_recorded_line_count
    )
  ),
  add constraint inventory_count_assignments_replacement_snapshot_array
    check (jsonb_typeof(superseded_line_snapshot) = 'array');

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'inventory_count_assignments_replaces_fkey'
      and conrelid = 'public.inventory_count_assignments'::regclass
  ) then
    alter table public.inventory_count_assignments
      add constraint inventory_count_assignments_replaces_fkey
      foreign key (replaces_assignment_id)
      references public.inventory_count_assignments(id);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'inventory_count_assignments_superseded_by_fkey'
      and conrelid = 'public.inventory_count_assignments'::regclass
  ) then
    alter table public.inventory_count_assignments
      add constraint inventory_count_assignments_superseded_by_fkey
      foreign key (superseded_by_assignment_id)
      references public.inventory_count_assignments(id)
      deferrable initially deferred;
  end if;
end;
$$;

create unique index if not exists inventory_count_assignments_one_current_location_idx
  on public.inventory_count_assignments (organization_id, session_id, location_id)
  where state <> 'superseded';
create unique index if not exists inventory_count_assignments_replaces_unique_idx
  on public.inventory_count_assignments (replaces_assignment_id)
  where replaces_assignment_id is not null;
create unique index if not exists inventory_count_assignments_superseded_by_unique_idx
  on public.inventory_count_assignments (superseded_by_assignment_id)
  where superseded_by_assignment_id is not null;
create index if not exists inventory_count_assignments_superseded_by_actor_idx
  on public.inventory_count_assignments (superseded_by_auth_user_id)
  where superseded_by_auth_user_id is not null;

create or replace function public.inventory_validate_count_assignment()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_session public.inventory_count_sessions%rowtype;
  v_location public.inventory_locations%rowtype;
  v_membership public.inventory_counter_memberships%rowtype;
  v_profile public.user_profiles%rowtype;
  v_replaced public.inventory_count_assignments%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception 'Stock Count assignment history cannot be deleted.';
  end if;
  select session.* into v_session
  from public.inventory_count_sessions session
  where session.id = new.session_id;
  select location.* into v_location
  from public.inventory_locations location
  where location.id = new.location_id;
  select membership.* into v_membership
  from public.inventory_counter_memberships membership
  where membership.id = new.counter_membership_id;
  select profile.* into v_profile
  from public.user_profiles profile
  where profile.id = v_membership.counter_auth_user_id;
  if v_session.id is null or v_session.organization_id is distinct from new.organization_id then
    raise exception 'Assignment and Stock Count session must belong to one organization.';
  end if;
  if v_location.id is null or v_location.organization_id is distinct from new.organization_id
     or not v_location.active
     or not public.inventory_phase9g_is_refrigerator(v_location.id, new.organization_id) then
    raise exception 'Assignment requires an active operational refrigerator in the same organization.';
  end if;
  if v_membership.id is null or v_membership.organization_id is distinct from new.organization_id
     or v_profile.id is null or v_profile.organization_id is distinct from new.organization_id then
    raise exception 'Assignment counter identity must remain in the same organization.';
  end if;
  if tg_op = 'INSERT' and (
    not v_membership.active
    or v_profile.role <> 'counter'
    or not v_profile.active
    or coalesce(v_profile.is_shared_device, false)
  ) then
    raise exception 'Assignment requires an active same-organization counter membership.';
  end if;
  if v_session.status not in ('draft', 'in_progress') then
    raise exception 'Assignments can only change in an active editable Stock Count.';
  end if;
  if not exists (
    select 1 from public.inventory_count_lines line
    where line.session_id = new.session_id
      and line.organization_id = new.organization_id
      and line.location_id = new.location_id
  ) then
    raise exception 'Assigned refrigerator is not part of this Stock Count.';
  end if;
  if tg_op = 'INSERT' then
    if new.state <> 'assigned' or new.revision <> 1 then
      raise exception 'New assignments must begin in assigned state at revision 1.';
    end if;
    if new.replaces_assignment_id is not null then
      select assignment.* into v_replaced
      from public.inventory_count_assignments assignment
      where assignment.id = new.replaces_assignment_id;
      if v_replaced.id is null
         or v_replaced.organization_id is distinct from new.organization_id
         or v_replaced.session_id is distinct from new.session_id
         or v_replaced.location_id is distinct from new.location_id
         or v_replaced.counter_membership_id = new.counter_membership_id
         or v_replaced.state <> 'superseded'
         or v_replaced.superseded_by_assignment_id is distinct from new.id then
        raise exception 'Replacement assignment must be linked to the superseded assignment for the same refrigerator.';
      end if;
    end if;
  else
    if new.id is distinct from old.id
       or new.organization_id is distinct from old.organization_id
       or new.session_id is distinct from old.session_id
       or new.location_id is distinct from old.location_id
       or new.counter_membership_id is distinct from old.counter_membership_id
       or new.replaces_assignment_id is distinct from old.replaces_assignment_id
       or new.assigned_at is distinct from old.assigned_at
       or new.assigned_by_auth_user_id is distinct from old.assigned_by_auth_user_id
       or new.assigned_by_name is distinct from old.assigned_by_name
       or new.created_at is distinct from old.created_at then
      raise exception 'Assignment identity and original assignment audit are immutable.';
    end if;
    if new.revision <> old.revision + 1 then
      raise exception 'Every assignment change must advance the revision exactly once.';
    end if;
    if new.state = old.state then
      if new.state not in ('assigned', 'returned')
         or (to_jsonb(new) - array['revision','updated_at'])
            is distinct from (to_jsonb(old) - array['revision','updated_at']) then
        raise exception 'Only editable assignment work may advance an unchanged state.';
      end if;
    elsif not (
      (old.state in ('assigned', 'returned') and new.state = 'submitted')
      or (old.state = 'submitted' and new.state in ('returned', 'accepted'))
      or (old.state in ('assigned', 'returned') and new.state = 'superseded')
    ) then
      raise exception 'Invalid Stock Count assignment state transition.';
    end if;
    if new.state = 'superseded' and (
      new.superseded_by_assignment_id is null
      or new.superseded_at is null
      or new.superseded_by_auth_user_id is null
      or nullif(trim(new.superseded_by_name), '') is null
      or nullif(trim(new.supersession_reason), '') is null
      or new.replacement_data_action not in ('preserve', 'clear_unsubmitted')
    ) then
      raise exception 'Superseding an assignment requires complete manager replacement audit.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists inventory_count_assignments_validate on public.inventory_count_assignments;
create trigger inventory_count_assignments_validate
before insert or update or delete on public.inventory_count_assignments
for each row execute function public.inventory_validate_count_assignment();

create or replace function public.inventory_require_accepted_assignments_before_completion()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.status in ('draft', 'in_progress') and new.status = 'completed'
     and exists (
       select 1 from public.inventory_count_assignments assignment
       where assignment.session_id = old.id
         and assignment.organization_id = old.organization_id
         and assignment.state not in ('accepted', 'superseded')
     ) then
    raise exception 'Every current assigned refrigerator must be accepted before completing this Stock Count.';
  end if;
  return new;
end;
$$;

create or replace function public.get_inventory_counter_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_assignments jsonb;
begin
  select * into v_actor from public.inventory_resolve_counter();
  select coalesce(jsonb_agg(assignment_record order by assignment_record->'location'->>'name'), '[]'::jsonb)
  into v_assignments
  from (
    select jsonb_build_object(
      'id', assignment.id,
      'state', assignment.state,
      'revision', assignment.revision,
      'assigned_at', assignment.assigned_at,
      'submitted_at', assignment.submitted_at,
      'returned_at', assignment.returned_at,
      'accepted_at', assignment.accepted_at,
      'return_message', assignment.return_message,
      'session', jsonb_build_object(
        'id', session.id,
        'title', session.title,
        'count_date', session.count_date,
        'status', session.status,
        'updated_at', session.updated_at
      ),
      'location', jsonb_build_object('id', location.id, 'name', location.name),
      'lines', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', line.id,
          'location_id', line.location_id,
          'product_id', line.product_id,
          'product_name_snapshot', line.product_name_snapshot,
          'practical_name', product.short_name,
          'millum_item_ref', product.millum_item_ref,
          'unit_label_snapshot', line.unit_label_snapshot,
          'category_snapshot', line.category_snapshot,
          'count_order_snapshot', line.count_order_snapshot,
          'product_sort_order_snapshot', line.product_sort_order_snapshot,
          'count_mode_snapshot', line.count_mode_snapshot,
          'container_capacity_liters_snapshot', line.container_capacity_liters_snapshot,
          'counted_whole_units', line.counted_whole_units,
          'counted_open_volume_liters', line.counted_open_volume_liters,
          'counted_full_kegs', line.counted_full_kegs,
          'counted_partial_keg_fraction', line.counted_partial_keg_fraction,
          'counted_quantity', line.counted_quantity,
          'count_method', line.count_method,
          'count_status', line.count_status,
          'note', line.note,
          'counted_at', line.counted_at,
          'counted_by_name', line.counted_by_name,
          'updated_at', line.updated_at
        ) order by line.count_order_snapshot, line.product_sort_order_snapshot, line.product_name_snapshot), '[]'::jsonb)
        from public.inventory_count_lines line
        join public.inventory_products product
          on product.id = line.product_id and product.organization_id = line.organization_id
        where line.session_id = assignment.session_id
          and line.location_id = assignment.location_id
          and line.organization_id = assignment.organization_id
      )
    ) assignment_record
    from public.inventory_count_assignments assignment
    join public.inventory_count_sessions session
      on session.id = assignment.session_id and session.organization_id = assignment.organization_id
    join public.inventory_locations location
      on location.id = assignment.location_id and location.organization_id = assignment.organization_id
    where assignment.organization_id = v_actor.organization_id
      and assignment.counter_membership_id = v_actor.membership_id
      and assignment.state <> 'superseded'
      and session.status in ('draft', 'in_progress')
  ) scoped;
  return jsonb_build_object('assignments', v_assignments, 'refreshed_at', now());
end;
$$;

create or replace function public.set_inventory_counter_membership(
  input_counter_auth_user_id uuid,
  input_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_profile public.user_profiles%rowtype;
  v_membership public.inventory_counter_memberships%rowtype;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  if input_counter_auth_user_id is null or input_active is null then
    raise exception 'Counter profile and authorization state are required.';
  end if;
  select profile.* into v_profile
  from public.user_profiles profile
  where profile.id = input_counter_auth_user_id
    and profile.organization_id = v_actor.organization_id
  for update;
  if v_profile.id is null or v_profile.role <> 'counter' or not v_profile.active
     or coalesce(v_profile.is_shared_device, false) then
    raise exception 'Choose an active same-organization non-shared counter profile.';
  end if;
  select membership.* into v_membership
  from public.inventory_counter_memberships membership
  where membership.counter_auth_user_id = v_profile.id
  for update;
  if input_active then
    if v_membership.id is null then
      insert into public.inventory_counter_memberships (
        organization_id, counter_auth_user_id, active,
        authorized_by_auth_user_id, authorized_by_name
      ) values (
        v_actor.organization_id, v_profile.id, true,
        v_actor.actor_auth_user_id, v_actor.actor_name
      ) returning * into v_membership;
    elsif not v_membership.active then
      update public.inventory_counter_memberships membership
      set active = true,
          authorized_at = now(),
          authorized_by_auth_user_id = v_actor.actor_auth_user_id,
          authorized_by_name = v_actor.actor_name,
          revoked_at = null,
          revoked_by_auth_user_id = null,
          revoked_by_name = null
      where membership.id = v_membership.id
      returning * into v_membership;
    end if;
  else
    if v_membership.id is null then raise exception 'Counter authorization was not found.'; end if;
    if v_membership.active and exists (
      select 1
      from public.inventory_count_assignments assignment
      join public.inventory_count_sessions session
        on session.id = assignment.session_id and session.organization_id = assignment.organization_id
      where assignment.counter_membership_id = v_membership.id
        and assignment.organization_id = v_actor.organization_id
        and assignment.state not in ('accepted', 'superseded')
        and session.status in ('draft', 'in_progress')
    ) then
      raise exception 'Accept, replace, or cancel active refrigerator assignments before revoking this counter.';
    end if;
    if v_membership.active then
      update public.inventory_counter_memberships membership
      set active = false,
          revoked_at = now(),
          revoked_by_auth_user_id = v_actor.actor_auth_user_id,
          revoked_by_name = v_actor.actor_name
      where membership.id = v_membership.id
      returning * into v_membership;
    end if;
  end if;
  return jsonb_build_object(
    'id', v_membership.id,
    'counter_auth_user_id', v_membership.counter_auth_user_id,
    'active', v_membership.active,
    'updated_at', v_membership.updated_at
  );
end;
$$;

create or replace function public.replace_inventory_count_assignment(
  input_assignment_id uuid,
  input_replacement_counter_membership_id uuid,
  input_reason text,
  input_data_action text,
  input_confirm_clear boolean,
  input_expected_assignment_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_session public.inventory_count_sessions%rowtype;
  v_assignment public.inventory_count_assignments%rowtype;
  v_replacement_membership public.inventory_counter_memberships%rowtype;
  v_replacement_profile public.user_profiles%rowtype;
  v_new_assignment public.inventory_count_assignments%rowtype;
  v_session_id uuid;
  v_new_assignment_id uuid := gen_random_uuid();
  v_reason text := nullif(trim(coalesce(input_reason, '')), '');
  v_data_action text := nullif(trim(coalesce(input_data_action, '')), '');
  v_recorded integer;
  v_total integer;
  v_line_snapshot jsonb;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  if input_assignment_id is null or input_replacement_counter_membership_id is null then
    raise exception 'Current assignment and replacement counter authorization are required.';
  end if;
  if v_reason is null then raise exception 'A replacement reason is required.'; end if;
  if v_data_action not in ('preserve', 'clear_unsubmitted') then
    raise exception 'Choose whether to preserve data or clear eligible unsubmitted working data.';
  end if;
  if input_expected_assignment_revision is null then
    raise exception 'A current assignment revision is required before replacing the counter.';
  end if;

  select assignment.session_id into v_session_id
  from public.inventory_count_assignments assignment
  where assignment.id = input_assignment_id
    and assignment.organization_id = v_actor.organization_id;
  if v_session_id is null then raise exception 'Assigned refrigerator was not found.'; end if;

  select session.* into v_session
  from public.inventory_count_sessions session
  where session.id = v_session_id
    and session.organization_id = v_actor.organization_id
  for update;
  if v_session.id is null or v_session.status not in ('draft', 'in_progress') then
    raise exception 'Counters can only be replaced in an active editable Stock Count.';
  end if;

  select assignment.* into v_assignment
  from public.inventory_count_assignments assignment
  where assignment.id = input_assignment_id
    and assignment.organization_id = v_actor.organization_id
    and assignment.session_id = v_session.id
  for update;
  if v_assignment.id is null then raise exception 'Assigned refrigerator was not found.'; end if;
  if v_assignment.revision is distinct from input_expected_assignment_revision then
    raise exception 'This assignment changed on another device. Refresh before replacing the counter.';
  end if;
  if v_assignment.state = 'accepted' then
    raise exception 'An accepted refrigerator cannot be reassigned.';
  elsif v_assignment.state = 'submitted' then
    raise exception 'Return the submitted refrigerator before replacing its counter.';
  elsif v_assignment.state = 'superseded' then
    raise exception 'This assignment has already been superseded.';
  elsif v_assignment.state not in ('assigned', 'returned') then
    raise exception 'This assignment cannot be replaced in its current state.';
  end if;

  select membership.* into v_replacement_membership
  from public.inventory_counter_memberships membership
  where membership.id = input_replacement_counter_membership_id
    and membership.organization_id = v_actor.organization_id
  for update;
  if v_replacement_membership.id is null or not v_replacement_membership.active then
    raise exception 'Choose an active authorized replacement counter in this organization.';
  end if;
  if v_replacement_membership.id = v_assignment.counter_membership_id then
    raise exception 'Choose a different counter for this replacement.';
  end if;
  select profile.* into v_replacement_profile
  from public.user_profiles profile
  where profile.id = v_replacement_membership.counter_auth_user_id
    and profile.organization_id = v_actor.organization_id
  for update;
  if v_replacement_profile.id is null
     or v_replacement_profile.role <> 'counter'
     or not v_replacement_profile.active
     or coalesce(v_replacement_profile.is_shared_device, false) then
    raise exception 'Replacement requires an active non-shared Supabase Auth counter profile.';
  end if;

  perform line.id
  from public.inventory_count_lines line
  where line.organization_id = v_assignment.organization_id
    and line.session_id = v_assignment.session_id
    and line.location_id = v_assignment.location_id
  order by line.id
  for update;

  select count(*), count(*) filter (where line.count_status <> 'not_counted')
  into v_total, v_recorded
  from public.inventory_count_lines line
  where line.organization_id = v_assignment.organization_id
    and line.session_id = v_assignment.session_id
    and line.location_id = v_assignment.location_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'line_id', line.id,
    'product_id', line.product_id,
    'counted_quantity', line.counted_quantity,
    'counted_whole_units', line.counted_whole_units,
    'counted_open_volume_liters', line.counted_open_volume_liters,
    'counted_full_kegs', line.counted_full_kegs,
    'counted_partial_keg_fraction', line.counted_partial_keg_fraction,
    'count_full_cases', line.count_full_cases,
    'count_loose_quantity', line.count_loose_quantity,
    'count_method', line.count_method,
    'count_status', line.count_status,
    'note', line.note,
    'counted_at', line.counted_at,
    'counted_by_auth_user_id', line.counted_by_auth_user_id,
    'counted_by_name', line.counted_by_name,
    'line_updated_at', line.updated_at
  ) order by line.id), '[]'::jsonb)
  into v_line_snapshot
  from public.inventory_count_lines line
  where line.organization_id = v_assignment.organization_id
    and line.session_id = v_assignment.session_id
    and line.location_id = v_assignment.location_id
    and (line.count_status <> 'not_counted' or line.note is not null);

  if v_data_action = 'clear_unsubmitted' then
    if v_assignment.state <> 'assigned' or v_assignment.submitted_at is not null then
      raise exception 'Only working data that has never been submitted can be cleared during replacement.';
    end if;
    if input_confirm_clear is not true then
      raise exception 'Confirm clearing the unsubmitted working data before replacing the counter.';
    end if;
  end if;

  update public.inventory_count_assignments assignment
  set state = 'superseded',
      revision = assignment.revision + 1,
      superseded_by_assignment_id = v_new_assignment_id,
      superseded_at = now(),
      superseded_by_auth_user_id = v_actor.actor_auth_user_id,
      superseded_by_name = v_actor.actor_name,
      supersession_reason = v_reason,
      replacement_data_action = v_data_action,
      superseded_recorded_line_count = v_recorded,
      superseded_total_line_count = v_total,
      superseded_line_snapshot = v_line_snapshot
  where assignment.id = v_assignment.id
  returning * into v_assignment;

  if v_data_action = 'clear_unsubmitted' then
    update public.inventory_count_lines line
    set counted_quantity = null,
        counted_whole_units = null,
        counted_open_volume_liters = null,
        counted_full_kegs = null,
        counted_partial_keg_fraction = null,
        count_full_cases = null,
        count_loose_quantity = null,
        count_method = 'uncounted',
        count_status = 'not_counted',
        note = null,
        counted_at = null,
        counted_by_auth_user_id = null,
        counted_by_name = null
    where line.organization_id = v_assignment.organization_id
      and line.session_id = v_assignment.session_id
      and line.location_id = v_assignment.location_id;
  end if;

  insert into public.inventory_count_assignments (
    id, organization_id, session_id, location_id, counter_membership_id,
    state, revision, assigned_at, assigned_by_auth_user_id, assigned_by_name,
    replaces_assignment_id
  ) values (
    v_new_assignment_id, v_assignment.organization_id, v_assignment.session_id,
    v_assignment.location_id, v_replacement_membership.id,
    'assigned', 1, now(), v_actor.actor_auth_user_id, v_actor.actor_name,
    v_assignment.id
  ) returning * into v_new_assignment;

  update public.inventory_count_sessions session
  set metadata = session.metadata #- array['locationCompletions', v_assignment.location_id::text],
      updated_at = now()
  where session.id = v_assignment.session_id;

  return jsonb_build_object(
    'superseded_assignment_id', v_assignment.id,
    'superseded_revision', v_assignment.revision,
    'replacement_assignment_id', v_new_assignment.id,
    'replacement_revision', v_new_assignment.revision,
    'replacement_state', v_new_assignment.state,
    'data_action', v_assignment.replacement_data_action,
    'recorded_line_count', v_assignment.superseded_recorded_line_count,
    'total_line_count', v_assignment.superseded_total_line_count,
    'replaced_at', v_assignment.superseded_at
  );
end;
$$;

drop policy if exists inventory_count_assignments_read on public.inventory_count_assignments;
create policy inventory_count_assignments_read
on public.inventory_count_assignments for select to authenticated
using (
  (
    (select public.current_user_can_manage_inventory_config())
    and organization_id = (select public.current_user_organization_id())
  )
  or (
    state <> 'superseded'
    and (select public.current_user_can_count_inventory())
    and organization_id = (select public.current_user_organization_id())
    and counter_membership_id in (
      select membership.id
      from public.inventory_counter_memberships membership
      where membership.counter_auth_user_id = (select auth.uid())
        and membership.organization_id = public.inventory_count_assignments.organization_id
        and membership.active = true
    )
    and (select public.inventory_counter_session_is_active(session_id, organization_id))
  )
);

revoke all privileges on table public.inventory_count_assignments from public, anon, authenticated, service_role;
grant select (
  id, organization_id, session_id, location_id, counter_membership_id,
  state, revision, assigned_at, assigned_by_name,
  submitted_at, submitted_by_name, returned_at, returned_by_name,
  return_message, accepted_at, accepted_by_name,
  replaces_assignment_id, superseded_by_assignment_id,
  superseded_at, superseded_by_name, supersession_reason, replacement_data_action,
  superseded_recorded_line_count, superseded_total_line_count,
  created_at, updated_at
) on table public.inventory_count_assignments to authenticated;
grant select, insert, update, delete on table public.inventory_count_assignments to service_role;

revoke all on function public.replace_inventory_count_assignment(uuid, uuid, text, text, boolean, bigint)
  from public, anon, authenticated;
grant execute on function public.replace_inventory_count_assignment(uuid, uuid, text, text, boolean, bigint)
  to authenticated;

notify pgrst, 'reload schema';

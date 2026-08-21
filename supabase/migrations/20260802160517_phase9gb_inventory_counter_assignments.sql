-- Phase 9G-B: least-privilege Stock Count counter memberships, refrigerator
-- assignments, submission, and manager review. Apply after Phase 9G-A.
-- This terminal layer is repeatable and never rewrites count history.

alter table public.user_profiles
  drop constraint if exists user_profiles_role_check;
alter table public.user_profiles
  add constraint user_profiles_role_check
  check (role in ('manager', 'shift_lead', 'event_floor_manager', 'staff', 'time2staff', 'counter'));

create table if not exists public.inventory_counter_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  counter_auth_user_id uuid not null references public.user_profiles(id),
  active boolean not null default true,
  authorized_at timestamptz not null default now(),
  authorized_by_auth_user_id uuid not null references auth.users(id),
  authorized_by_name text not null,
  revoked_at timestamptz,
  revoked_by_auth_user_id uuid references auth.users(id),
  revoked_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_counter_memberships_counter_unique unique (counter_auth_user_id),
  constraint inventory_counter_memberships_org_counter_unique unique (organization_id, counter_auth_user_id),
  constraint inventory_counter_memberships_authorizer_required
    check (nullif(trim(authorized_by_name), '') is not null),
  constraint inventory_counter_memberships_revocation_audit check (
    (active and revoked_at is null and revoked_by_auth_user_id is null and revoked_by_name is null)
    or (
      not active and revoked_at is not null and revoked_by_auth_user_id is not null
      and nullif(trim(revoked_by_name), '') is not null
    )
  )
);

create table if not exists public.inventory_count_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  session_id uuid not null references public.inventory_count_sessions(id),
  location_id uuid not null references public.inventory_locations(id),
  counter_membership_id uuid not null references public.inventory_counter_memberships(id),
  state text not null default 'assigned',
  revision bigint not null default 1,
  assigned_at timestamptz not null default now(),
  assigned_by_auth_user_id uuid not null references auth.users(id),
  assigned_by_name text not null,
  submitted_at timestamptz,
  submitted_by_auth_user_id uuid references auth.users(id),
  submitted_by_name text,
  returned_at timestamptz,
  returned_by_auth_user_id uuid references auth.users(id),
  returned_by_name text,
  return_message text,
  accepted_at timestamptz,
  accepted_by_auth_user_id uuid references auth.users(id),
  accepted_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_count_assignments_session_location_unique
    unique (organization_id, session_id, location_id),
  constraint inventory_count_assignments_state_check
    check (state in ('assigned', 'submitted', 'returned', 'accepted')),
  constraint inventory_count_assignments_revision_positive check (revision > 0),
  constraint inventory_count_assignments_assigner_required
    check (nullif(trim(assigned_by_name), '') is not null),
  constraint inventory_count_assignments_submission_audit check (
    (submitted_at is null and submitted_by_auth_user_id is null and submitted_by_name is null)
    or (
      submitted_at is not null and submitted_by_auth_user_id is not null
      and nullif(trim(submitted_by_name), '') is not null
    )
  ),
  constraint inventory_count_assignments_return_audit check (
    (returned_at is null and returned_by_auth_user_id is null and returned_by_name is null and return_message is null)
    or (
      returned_at is not null and returned_by_auth_user_id is not null
      and nullif(trim(returned_by_name), '') is not null
      and nullif(trim(return_message), '') is not null
    )
  ),
  constraint inventory_count_assignments_acceptance_audit check (
    (accepted_at is null and accepted_by_auth_user_id is null and accepted_by_name is null)
    or (
      accepted_at is not null and accepted_by_auth_user_id is not null
      and nullif(trim(accepted_by_name), '') is not null
    )
  ),
  constraint inventory_count_assignments_state_audit check (
    (state = 'assigned' and submitted_at is null and returned_at is null and accepted_at is null)
    or (state = 'submitted' and submitted_at is not null and accepted_at is null)
    or (state = 'returned' and submitted_at is not null and returned_at is not null and accepted_at is null)
    or (state = 'accepted' and submitted_at is not null and accepted_at is not null)
  )
);

create index if not exists inventory_counter_memberships_org_active_idx
  on public.inventory_counter_memberships (organization_id, active, counter_auth_user_id);
create index if not exists inventory_count_assignments_membership_session_idx
  on public.inventory_count_assignments (counter_membership_id, session_id, state);
create index if not exists inventory_count_assignments_session_state_idx
  on public.inventory_count_assignments (session_id, state, location_id);

create or replace function public.inventory_validate_counter_membership()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_profile public.user_profiles%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception 'Stock Count counter membership history cannot be deleted.';
  end if;
  select profile.* into v_profile
  from public.user_profiles profile
  where profile.id = new.counter_auth_user_id;
  if v_profile.id is null
     or v_profile.organization_id is distinct from new.organization_id
     or v_profile.role <> 'counter'
     or not v_profile.active
     or coalesce(v_profile.is_shared_device, false) then
    raise exception 'Counter membership requires an active same-organization non-shared counter profile.';
  end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.organization_id is distinct from old.organization_id
       or new.counter_auth_user_id is distinct from old.counter_auth_user_id
       or new.created_at is distinct from old.created_at then
      raise exception 'Counter membership identity is immutable.';
    end if;
    if new.active is distinct from old.active then
      if new.active then
        if new.authorized_at <= old.updated_at
           or new.authorized_by_auth_user_id is null
           or nullif(trim(new.authorized_by_name), '') is null then
          raise exception 'Counter reauthorization requires fresh manager audit fields.';
        end if;
      elsif new.revoked_at is null
            or new.revoked_by_auth_user_id is null
            or nullif(trim(new.revoked_by_name), '') is null then
        raise exception 'Counter revocation requires manager audit fields.';
      end if;
    elsif (to_jsonb(new) - array['updated_at']) is distinct from (to_jsonb(old) - array['updated_at']) then
      raise exception 'Counter membership changes must use an explicit authorization transition.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists inventory_counter_memberships_validate on public.inventory_counter_memberships;
create trigger inventory_counter_memberships_validate
before insert or update or delete on public.inventory_counter_memberships
for each row execute function public.inventory_validate_counter_membership();

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
     or not v_membership.active
     or v_profile.id is null or v_profile.organization_id is distinct from new.organization_id
     or v_profile.role <> 'counter' or not v_profile.active
     or coalesce(v_profile.is_shared_device, false) then
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
  else
    if new.id is distinct from old.id
       or new.organization_id is distinct from old.organization_id
       or new.session_id is distinct from old.session_id
       or new.location_id is distinct from old.location_id
       or new.counter_membership_id is distinct from old.counter_membership_id
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
    ) then
      raise exception 'Invalid Stock Count assignment state transition.';
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
         and assignment.state <> 'accepted'
     ) then
    raise exception 'Every assigned refrigerator must be accepted before completing this Stock Count.';
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_count_sessions_phase9gb_assignments on public.inventory_count_sessions;
create trigger inventory_count_sessions_phase9gb_assignments
before update of status on public.inventory_count_sessions
for each row execute function public.inventory_require_accepted_assignments_before_completion();

create or replace function public.current_user_can_count_inventory()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.user_profiles profile
    join public.inventory_counter_memberships membership
      on membership.counter_auth_user_id = profile.id
     and membership.organization_id = profile.organization_id
     and membership.active = true
    where profile.id = (select auth.uid())
      and profile.active = true
      and profile.role = 'counter'
      and profile.organization_id is not null
      and coalesce(profile.is_shared_device, false) = false
  );
$$;

create or replace function public.inventory_counter_session_is_active(
  input_session_id uuid,
  input_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select public.current_user_can_count_inventory()
    and input_organization_id = public.current_user_organization_id()
    and exists (
      select 1 from public.inventory_count_sessions session
      where session.id = input_session_id
        and session.organization_id = input_organization_id
        and session.status in ('draft', 'in_progress')
    );
$$;

create or replace function public.inventory_resolve_counter()
returns table (
  organization_id uuid,
  membership_id uuid,
  actor_auth_user_id uuid,
  actor_name text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_profile public.user_profiles%rowtype;
  v_membership public.inventory_counter_memberships%rowtype;
begin
  if v_auth_user_id is null then
    raise exception 'Supabase Auth counter access is required for Stock Count.';
  end if;
  select profile.* into v_profile
  from public.user_profiles profile
  where profile.id = v_auth_user_id
    and profile.active = true
    and profile.role = 'counter'
    and profile.organization_id is not null
    and coalesce(profile.is_shared_device, false) = false;
  if v_profile.id is null then
    raise exception 'An active non-shared counter profile is required for Stock Count.';
  end if;
  select membership.* into v_membership
  from public.inventory_counter_memberships membership
  where membership.counter_auth_user_id = v_profile.id
    and membership.organization_id = v_profile.organization_id
    and membership.active = true;
  if v_membership.id is null then
    raise exception 'Active Stock Count counter authorization is required.';
  end if;
  return query select v_profile.organization_id, v_membership.id, v_auth_user_id, v_profile.display_name;
end;
$$;

create or replace function public.inventory_counter_lock_assignment(
  input_assignment_id uuid,
  input_expected_revision bigint,
  input_require_editable boolean,
  input_action text
)
returns public.inventory_count_assignments
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_session_id uuid;
  v_session_status text;
  v_assignment public.inventory_count_assignments%rowtype;
begin
  select * into v_actor from public.inventory_resolve_counter();
  if input_expected_revision is null then
    raise exception 'A current assignment revision is required. Refresh before %.', coalesce(input_action, 'continuing');
  end if;
  select assignment.session_id into v_session_id
  from public.inventory_count_assignments assignment
  where assignment.id = input_assignment_id
    and assignment.organization_id = v_actor.organization_id
    and assignment.counter_membership_id = v_actor.membership_id;
  if v_session_id is null then raise exception 'Assigned refrigerator was not found or is not available.'; end if;
  select session.status into v_session_status
  from public.inventory_count_sessions session
  where session.id = v_session_id and session.organization_id = v_actor.organization_id
  for update;
  if v_session_status is null then raise exception 'Assigned Stock Count was not found.'; end if;
  if v_session_status not in ('draft', 'in_progress') then
    raise exception 'This assigned Stock Count is read-only because it is %.', v_session_status;
  end if;
  select assignment.* into v_assignment
  from public.inventory_count_assignments assignment
  where assignment.id = input_assignment_id
    and assignment.organization_id = v_actor.organization_id
    and assignment.counter_membership_id = v_actor.membership_id
    and assignment.session_id = v_session_id
  for update;
  if v_assignment.id is null then raise exception 'Assigned refrigerator was not found or is not available.'; end if;
  if v_assignment.revision is distinct from input_expected_revision then
    raise exception 'This assignment changed on another device. Refresh before %.', coalesce(input_action, 'continuing');
  end if;
  if input_require_editable and v_assignment.state not in ('assigned', 'returned') then
    raise exception 'This assigned refrigerator is read-only while it is %.', v_assignment.state;
  end if;
  return v_assignment;
end;
$$;

create or replace function public.inventory_manager_lock_assignment(
  input_assignment_id uuid,
  input_expected_revision bigint,
  input_action text
)
returns public.inventory_count_assignments
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_session_id uuid;
  v_session_status text;
  v_assignment public.inventory_count_assignments%rowtype;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  if input_expected_revision is null then
    raise exception 'A current assignment revision is required. Refresh before %.', coalesce(input_action, 'continuing');
  end if;
  select assignment.session_id into v_session_id
  from public.inventory_count_assignments assignment
  where assignment.id = input_assignment_id
    and assignment.organization_id = v_actor.organization_id;
  if v_session_id is null then raise exception 'Assigned refrigerator was not found.'; end if;
  select session.status into v_session_status
  from public.inventory_count_sessions session
  where session.id = v_session_id and session.organization_id = v_actor.organization_id
  for update;
  if v_session_status is null or v_session_status not in ('draft', 'in_progress') then
    raise exception 'Assignments can only change in an active editable Stock Count.';
  end if;
  select assignment.* into v_assignment
  from public.inventory_count_assignments assignment
  where assignment.id = input_assignment_id
    and assignment.organization_id = v_actor.organization_id
    and assignment.session_id = v_session_id
  for update;
  if v_assignment.id is null then raise exception 'Assigned refrigerator was not found.'; end if;
  if v_assignment.revision is distinct from input_expected_revision then
    raise exception 'This assignment changed on another device. Refresh before %.', coalesce(input_action, 'continuing');
  end if;
  return v_assignment;
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
        and assignment.state <> 'accepted'
        and session.status in ('draft', 'in_progress')
    ) then
      raise exception 'Accept or cancel active refrigerator assignments before revoking this counter.';
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

create or replace function public.create_inventory_count_assignment(
  input_session_id uuid,
  input_location_id uuid,
  input_counter_membership_id uuid,
  input_expected_session_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_session public.inventory_count_sessions%rowtype;
  v_membership public.inventory_counter_memberships%rowtype;
  v_assignment public.inventory_count_assignments%rowtype;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  if input_expected_session_updated_at is null then
    raise exception 'A current session version is required before assigning a refrigerator.';
  end if;
  select session.* into v_session
  from public.inventory_count_sessions session
  where session.id = input_session_id and session.organization_id = v_actor.organization_id
  for update;
  if v_session.id is null or v_session.status not in ('draft', 'in_progress') then
    raise exception 'Assignments require an active editable Stock Count in this organization.';
  end if;
  if v_session.updated_at is distinct from input_expected_session_updated_at then
    raise exception 'This Stock Count changed on another device. Refresh before assigning a refrigerator.';
  end if;
  select membership.* into v_membership
  from public.inventory_counter_memberships membership
  where membership.id = input_counter_membership_id
    and membership.organization_id = v_actor.organization_id
    and membership.active = true
  for update;
  if v_membership.id is null then raise exception 'Active counter authorization was not found.'; end if;
  if not public.inventory_phase9g_is_refrigerator(input_location_id, v_actor.organization_id) then
    raise exception 'Choose one of the six active operational refrigerators.';
  end if;
  insert into public.inventory_count_assignments (
    organization_id, session_id, location_id, counter_membership_id,
    assigned_by_auth_user_id, assigned_by_name
  ) values (
    v_actor.organization_id, v_session.id, input_location_id, v_membership.id,
    v_actor.actor_auth_user_id, v_actor.actor_name
  ) returning * into v_assignment;
  update public.inventory_count_sessions session set updated_at = now()
  where session.id = v_session.id;
  return jsonb_build_object(
    'id', v_assignment.id, 'state', v_assignment.state,
    'revision', v_assignment.revision, 'updated_at', v_assignment.updated_at
  );
end;
$$;

create or replace function public.inventory_counter_set_count_line_quantity(
  input_assignment_id uuid,
  input_line_id uuid,
  input_counted_quantity numeric,
  input_note text,
  input_expected_assignment_revision bigint,
  input_expected_line_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_assignment public.inventory_count_assignments%rowtype;
  v_line public.inventory_count_lines%rowtype;
  v_new_revision bigint;
begin
  select * into v_actor from public.inventory_resolve_counter();
  if input_counted_quantity is null or input_counted_quantity < 0
     or input_counted_quantity::text in ('NaN', 'Infinity', '-Infinity')
     or round(input_counted_quantity, 6) <> input_counted_quantity then
    raise exception 'Counted quantity must be a non-negative value with no more than 6 decimal places.';
  end if;
  if input_expected_line_updated_at is null then
    raise exception 'A current line version is required. Refresh before saving.';
  end if;
  v_assignment := public.inventory_counter_lock_assignment(
    input_assignment_id, input_expected_assignment_revision, true, 'saving this count'
  );
  select line.* into v_line
  from public.inventory_count_lines line
  where line.id = input_line_id
    and line.organization_id = v_assignment.organization_id
    and line.session_id = v_assignment.session_id
    and line.location_id = v_assignment.location_id
  for update;
  if v_line.id is null then raise exception 'Count line is not part of this assigned refrigerator.'; end if;
  if v_line.updated_at is distinct from input_expected_line_updated_at then
    raise exception 'This count line changed on another device. Refresh before saving your value.';
  end if;
  if v_line.count_mode_snapshot <> 'unit' or v_line.stock_policy_snapshot = 'protected_event_reserve' then
    raise exception 'Use the structured inputs available for this assigned product.';
  end if;
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
  where line.id = v_line.id;
  update public.inventory_count_assignments assignment
  set revision = assignment.revision + 1
  where assignment.id = v_assignment.id
  returning revision into v_new_revision;
  update public.inventory_count_sessions session
  set metadata = session.metadata #- array['locationCompletions', v_assignment.location_id::text]
  where session.id = v_assignment.session_id;
  return jsonb_build_object('line_id', v_line.id, 'assignment_revision', v_new_revision);
end;
$$;

create or replace function public.inventory_counter_set_count_line_structured_quantity(
  input_assignment_id uuid,
  input_line_id uuid,
  input_whole_units numeric,
  input_open_volume_liters numeric,
  input_full_kegs numeric,
  input_partial_keg_fraction numeric,
  input_note text,
  input_expected_assignment_revision bigint,
  input_expected_line_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_assignment public.inventory_count_assignments%rowtype;
  v_line public.inventory_count_lines%rowtype;
  v_total numeric;
  v_whole bigint;
  v_full bigint;
  v_partial numeric;
  v_new_revision bigint;
begin
  select * into v_actor from public.inventory_resolve_counter();
  if input_expected_line_updated_at is null then
    raise exception 'A current line version is required. Refresh before saving.';
  end if;
  v_assignment := public.inventory_counter_lock_assignment(
    input_assignment_id, input_expected_assignment_revision, true, 'saving this structured count'
  );
  select line.* into v_line
  from public.inventory_count_lines line
  where line.id = input_line_id
    and line.organization_id = v_assignment.organization_id
    and line.session_id = v_assignment.session_id
    and line.location_id = v_assignment.location_id
  for update;
  if v_line.id is null then raise exception 'Count line is not part of this assigned refrigerator.'; end if;
  if v_line.updated_at is distinct from input_expected_line_updated_at then
    raise exception 'This count line changed on another device. Refresh before saving your value.';
  end if;
  if v_line.count_mode_snapshot = 'container_plus_volume' then
    if input_whole_units is null or input_whole_units < 0 or trunc(input_whole_units) <> input_whole_units then
      raise exception 'Sealed bottle count must be a non-negative whole number.';
    end if;
    if input_open_volume_liters is null or input_open_volume_liters < 0
       or input_open_volume_liters::text in ('NaN', 'Infinity', '-Infinity')
       or round(input_open_volume_liters, 6) <> input_open_volume_liters then
      raise exception 'Open liters must be non-negative with no more than 6 decimal places.';
    end if;
    if input_full_kegs is not null or input_partial_keg_fraction is not null then
      raise exception 'Keg components do not apply to bottle counts.';
    end if;
    if v_line.container_capacity_liters_snapshot is null or v_line.container_capacity_liters_snapshot <= 0 then
      raise exception 'A positive snapshotted bottle capacity is required.';
    end if;
    v_whole := input_whole_units::bigint;
    v_total := v_whole * v_line.container_capacity_liters_snapshot + input_open_volume_liters;
    update public.inventory_count_lines line
    set counted_quantity = v_total,
        counted_whole_units = v_whole,
        counted_open_volume_liters = input_open_volume_liters,
        counted_full_kegs = null,
        counted_partial_keg_fraction = null,
        count_full_cases = null,
        count_loose_quantity = null,
        count_method = 'manual',
        count_status = 'counted',
        note = nullif(trim(coalesce(input_note, '')), ''),
        counted_at = now(),
        counted_by_auth_user_id = v_actor.actor_auth_user_id,
        counted_by_name = v_actor.actor_name
    where line.id = v_line.id;
  elsif v_line.count_mode_snapshot = 'keg_fraction' then
    if input_full_kegs is null or input_full_kegs < 0 or trunc(input_full_kegs) <> input_full_kegs then
      raise exception 'Full keg count must be a non-negative whole number.';
    end if;
    if input_partial_keg_fraction is null or input_partial_keg_fraction < 0
       or input_partial_keg_fraction > 1
       or input_partial_keg_fraction::text in ('NaN', 'Infinity', '-Infinity')
       or round(input_partial_keg_fraction, 6) <> input_partial_keg_fraction then
      raise exception 'Partial keg fraction must be from 0 through 1 with no more than 6 decimal places.';
    end if;
    if input_whole_units is not null or input_open_volume_liters is not null then
      raise exception 'Bottle components do not apply to keg counts.';
    end if;
    v_full := input_full_kegs::bigint;
    v_partial := input_partial_keg_fraction;
    if v_partial = 1 then v_full := v_full + 1; v_partial := 0; end if;
    v_total := v_full + v_partial;
    update public.inventory_count_lines line
    set counted_quantity = v_total,
        counted_whole_units = null,
        counted_open_volume_liters = null,
        counted_full_kegs = v_full,
        counted_partial_keg_fraction = v_partial,
        count_full_cases = null,
        count_loose_quantity = null,
        count_method = 'manual',
        count_status = 'counted',
        note = nullif(trim(coalesce(input_note, '')), ''),
        counted_at = now(),
        counted_by_auth_user_id = v_actor.actor_auth_user_id,
        counted_by_name = v_actor.actor_name
    where line.id = v_line.id;
  else
    raise exception 'Structured counting is only available for bottle or keg products.';
  end if;
  update public.inventory_count_assignments assignment
  set revision = assignment.revision + 1
  where assignment.id = v_assignment.id
  returning revision into v_new_revision;
  update public.inventory_count_sessions session
  set metadata = session.metadata #- array['locationCompletions', v_assignment.location_id::text]
  where session.id = v_assignment.session_id;
  return jsonb_build_object('line_id', v_line.id, 'assignment_revision', v_new_revision);
end;
$$;

create or replace function public.inventory_counter_apply_refrigerator_default(
  input_assignment_id uuid,
  input_physical_confirmation boolean,
  input_expected_assignment_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_assignment public.inventory_count_assignments%rowtype;
  v_updated integer := 0;
  v_preserved integer := 0;
  v_new_revision bigint;
begin
  select * into v_actor from public.inventory_resolve_counter();
  if input_physical_confirmation is not true then
    raise exception 'Confirm that this refrigerator was physically checked before applying its default.';
  end if;
  v_assignment := public.inventory_counter_lock_assignment(
    input_assignment_id, input_expected_assignment_revision, true, 'applying the refrigerator default'
  );
  perform line.id
  from public.inventory_count_lines line
  where line.organization_id = v_assignment.organization_id
    and line.session_id = v_assignment.session_id
    and line.location_id = v_assignment.location_id
  order by line.id
  for update;
  select count(*) into v_preserved
  from public.inventory_count_lines line
  where line.organization_id = v_assignment.organization_id
    and line.session_id = v_assignment.session_id
    and line.location_id = v_assignment.location_id
    and line.count_status <> 'not_counted';
  update public.inventory_count_lines line
  set counted_quantity = line.par_quantity_snapshot,
      count_full_cases = null,
      count_loose_quantity = null,
      count_method = 'use_par',
      count_status = 'counted',
      counted_at = now(),
      counted_by_auth_user_id = v_actor.actor_auth_user_id,
      counted_by_name = v_actor.actor_name
  where line.organization_id = v_assignment.organization_id
    and line.session_id = v_assignment.session_id
    and line.location_id = v_assignment.location_id
    and line.product_id is not null
    and line.stock_policy_snapshot = 'exact_par'
    and line.count_status = 'not_counted';
  get diagnostics v_updated = row_count;
  update public.inventory_count_assignments assignment
  set revision = assignment.revision + 1
  where assignment.id = v_assignment.id
  returning revision into v_new_revision;
  if v_updated > 0 then
    update public.inventory_count_sessions session
    set metadata = session.metadata #- array['locationCompletions', v_assignment.location_id::text]
    where session.id = v_assignment.session_id;
  end if;
  return jsonb_build_object(
    'updated', v_updated,
    'preserved', v_preserved,
    'assignment_revision', v_new_revision,
    'physically_confirmed', true
  );
end;
$$;

create or replace function public.submit_inventory_count_assignment(
  input_assignment_id uuid,
  input_expected_assignment_revision bigint,
  input_expected_session_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_assignment public.inventory_count_assignments%rowtype;
  v_session_updated_at timestamptz;
begin
  select * into v_actor from public.inventory_resolve_counter();
  if input_expected_session_updated_at is null then
    raise exception 'A current Stock Count version is required before submitting.';
  end if;
  v_assignment := public.inventory_counter_lock_assignment(
    input_assignment_id, input_expected_assignment_revision, true, 'submitting this refrigerator'
  );
  select session.updated_at into v_session_updated_at
  from public.inventory_count_sessions session
  where session.id = v_assignment.session_id;
  if v_session_updated_at is distinct from input_expected_session_updated_at then
    raise exception 'This Stock Count changed on another device. Refresh before submitting this refrigerator.';
  end if;
  perform line.id
  from public.inventory_count_lines line
  where line.organization_id = v_assignment.organization_id
    and line.session_id = v_assignment.session_id
    and line.location_id = v_assignment.location_id
  order by line.id
  for update;
  if exists (
    select 1 from public.inventory_count_lines line
    where line.organization_id = v_assignment.organization_id
      and line.session_id = v_assignment.session_id
      and line.location_id = v_assignment.location_id
      and line.count_status <> 'counted'
  ) then
    raise exception 'Count every assigned line before submitting this refrigerator.';
  end if;
  update public.inventory_count_assignments assignment
  set state = 'submitted',
      revision = assignment.revision + 1,
      submitted_at = now(),
      submitted_by_auth_user_id = v_actor.actor_auth_user_id,
      submitted_by_name = v_actor.actor_name
  where assignment.id = v_assignment.id
  returning * into v_assignment;
  update public.inventory_count_sessions session set updated_at = now()
  where session.id = v_assignment.session_id;
  return jsonb_build_object(
    'id', v_assignment.id,
    'state', v_assignment.state,
    'revision', v_assignment.revision,
    'submitted_at', v_assignment.submitted_at
  );
end;
$$;

create or replace function public.return_inventory_count_assignment(
  input_assignment_id uuid,
  input_return_message text,
  input_expected_assignment_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_assignment public.inventory_count_assignments%rowtype;
  v_message text := nullif(trim(coalesce(input_return_message, '')), '');
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  if v_message is null then raise exception 'A return message is required.'; end if;
  v_assignment := public.inventory_manager_lock_assignment(
    input_assignment_id, input_expected_assignment_revision, 'returning this refrigerator'
  );
  if v_assignment.state <> 'submitted' then
    raise exception 'Only a submitted refrigerator can be returned.';
  end if;
  update public.inventory_count_assignments assignment
  set state = 'returned',
      revision = assignment.revision + 1,
      returned_at = now(),
      returned_by_auth_user_id = v_actor.actor_auth_user_id,
      returned_by_name = v_actor.actor_name,
      return_message = v_message
  where assignment.id = v_assignment.id
  returning * into v_assignment;
  update public.inventory_count_sessions session set updated_at = now()
  where session.id = v_assignment.session_id;
  return jsonb_build_object(
    'id', v_assignment.id, 'state', v_assignment.state,
    'revision', v_assignment.revision, 'return_message', v_assignment.return_message
  );
end;
$$;

create or replace function public.accept_inventory_count_assignment(
  input_assignment_id uuid,
  input_expected_assignment_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_assignment public.inventory_count_assignments%rowtype;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  v_assignment := public.inventory_manager_lock_assignment(
    input_assignment_id, input_expected_assignment_revision, 'accepting this refrigerator'
  );
  if v_assignment.state <> 'submitted' then
    raise exception 'Only a submitted refrigerator can be accepted.';
  end if;
  update public.inventory_count_assignments assignment
  set state = 'accepted',
      revision = assignment.revision + 1,
      accepted_at = now(),
      accepted_by_auth_user_id = v_actor.actor_auth_user_id,
      accepted_by_name = v_actor.actor_name
  where assignment.id = v_assignment.id
  returning * into v_assignment;
  update public.inventory_count_sessions session set updated_at = now()
  where session.id = v_assignment.session_id;
  return jsonb_build_object(
    'id', v_assignment.id, 'state', v_assignment.state,
    'revision', v_assignment.revision, 'accepted_at', v_assignment.accepted_at
  );
end;
$$;

alter table public.inventory_counter_memberships enable row level security;
alter table public.inventory_count_assignments enable row level security;

drop policy if exists inventory_counter_memberships_read on public.inventory_counter_memberships;
create policy inventory_counter_memberships_read
on public.inventory_counter_memberships for select to authenticated
using (
  (
    (select public.current_user_can_manage_inventory_config())
    and organization_id = (select public.current_user_organization_id())
  )
  or (
    counter_auth_user_id = (select auth.uid())
    and organization_id = (select public.current_user_organization_id())
  )
);

drop policy if exists inventory_count_assignments_read on public.inventory_count_assignments;
create policy inventory_count_assignments_read
on public.inventory_count_assignments for select to authenticated
using (
  (
    (select public.current_user_can_manage_inventory_config())
    and organization_id = (select public.current_user_organization_id())
  )
  or (
    (select public.current_user_can_count_inventory())
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

revoke all privileges on table public.inventory_counter_memberships from public, anon, authenticated, service_role;
grant select (
  id, organization_id, counter_auth_user_id, active,
  authorized_at, authorized_by_name, revoked_at, revoked_by_name,
  created_at, updated_at
) on table public.inventory_counter_memberships to authenticated;
grant select, insert, update, delete on table public.inventory_counter_memberships to service_role;

revoke all privileges on table public.inventory_count_assignments from public, anon, authenticated, service_role;
grant select (
  id, organization_id, session_id, location_id, counter_membership_id,
  state, revision, assigned_at, assigned_by_name,
  submitted_at, submitted_by_name, returned_at, returned_by_name,
  return_message, accepted_at, accepted_by_name, created_at, updated_at
) on table public.inventory_count_assignments to authenticated;
grant select, insert, update, delete on table public.inventory_count_assignments to service_role;

revoke all on function public.inventory_validate_counter_membership() from public, anon, authenticated;
revoke all on function public.inventory_validate_count_assignment() from public, anon, authenticated;
revoke all on function public.inventory_require_accepted_assignments_before_completion() from public, anon, authenticated;
revoke all on function public.current_user_can_count_inventory() from public, anon, authenticated;
revoke all on function public.inventory_counter_session_is_active(uuid, uuid) from public, anon, authenticated;
revoke all on function public.inventory_resolve_counter() from public, anon, authenticated;
revoke all on function public.inventory_counter_lock_assignment(uuid, bigint, boolean, text) from public, anon, authenticated;
revoke all on function public.inventory_manager_lock_assignment(uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.get_inventory_counter_workspace() from public, anon, authenticated;
revoke all on function public.set_inventory_counter_membership(uuid, boolean) from public, anon, authenticated;
revoke all on function public.create_inventory_count_assignment(uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.inventory_counter_set_count_line_quantity(uuid, uuid, numeric, text, bigint, timestamptz) from public, anon, authenticated;
revoke all on function public.inventory_counter_set_count_line_structured_quantity(uuid, uuid, numeric, numeric, numeric, numeric, text, bigint, timestamptz) from public, anon, authenticated;
revoke all on function public.inventory_counter_apply_refrigerator_default(uuid, boolean, bigint) from public, anon, authenticated;
revoke all on function public.submit_inventory_count_assignment(uuid, bigint, timestamptz) from public, anon, authenticated;
revoke all on function public.return_inventory_count_assignment(uuid, text, bigint) from public, anon, authenticated;
revoke all on function public.accept_inventory_count_assignment(uuid, bigint) from public, anon, authenticated;

grant execute on function public.current_user_can_count_inventory() to authenticated;
grant execute on function public.inventory_counter_session_is_active(uuid, uuid) to authenticated;
grant execute on function public.get_inventory_counter_workspace() to authenticated;
grant execute on function public.set_inventory_counter_membership(uuid, boolean) to authenticated;
grant execute on function public.create_inventory_count_assignment(uuid, uuid, uuid, timestamptz) to authenticated;
grant execute on function public.inventory_counter_set_count_line_quantity(uuid, uuid, numeric, text, bigint, timestamptz) to authenticated;
grant execute on function public.inventory_counter_set_count_line_structured_quantity(uuid, uuid, numeric, numeric, numeric, numeric, text, bigint, timestamptz) to authenticated;
grant execute on function public.inventory_counter_apply_refrigerator_default(uuid, boolean, bigint) to authenticated;
grant execute on function public.submit_inventory_count_assignment(uuid, bigint, timestamptz) to authenticated;
grant execute on function public.return_inventory_count_assignment(uuid, text, bigint) to authenticated;
grant execute on function public.accept_inventory_count_assignment(uuid, bigint) to authenticated;

notify pgrst, 'reload schema';

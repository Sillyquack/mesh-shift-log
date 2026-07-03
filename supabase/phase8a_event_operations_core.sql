-- Phase 8A: Event Operations Core
--
-- Purpose:
-- Event-specific operations for Mesh Youngstorget: event boards, staff
-- presence, role assignments, task board, and responsibility handover.
--
-- Not included in this phase:
-- - Push notifications / alarms
-- - Google Calendar or OfficeRND import
-- - WiFi/network enforcement

create table if not exists public.event_operations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.current_user_organization_id(),
  event_date date not null,
  title text not null,
  venue text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'active', 'finished', 'cancelled')),
  description text,
  source text,
  source_ref text,
  created_by_auth_user_id uuid default auth.uid(),
  created_by_name text,
  active_responsible_name text,
  active_responsible_auth_user_id uuid,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.event_staff_presence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.current_user_organization_id(),
  presence_date date not null,
  auth_user_id uuid,
  operator_name text not null,
  operator_source text,
  role_label text,
  selected_shift_scope text,
  available boolean not null default true,
  checked_in_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  checked_out_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.event_role_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.current_user_organization_id(),
  event_id uuid references public.event_operations(id) on delete cascade,
  role_key text not null,
  role_label text not null,
  zone text,
  assigned_auth_user_id uuid,
  assigned_operator_name text,
  assigned_operator_source text,
  assigned_by_auth_user_id uuid default auth.uid(),
  assigned_by_name text,
  active boolean not null default true,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.event_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.current_user_organization_id(),
  event_id uuid references public.event_operations(id) on delete cascade,
  title text not null,
  description text,
  zone text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'important', 'critical')),
  due_at timestamptz,
  remind_at timestamptz,
  assigned_role_key text,
  assigned_auth_user_id uuid,
  assigned_operator_name text,
  assigned_operator_source text,
  status text not null default 'pending' check (status in ('pending', 'acknowledged', 'done', 'missed', 'cancelled')),
  acknowledged_at timestamptz,
  acknowledged_by_name text,
  completed_at timestamptz,
  completed_by_auth_user_id uuid,
  completed_by_name text,
  completion_comment text,
  created_by_auth_user_id uuid default auth.uid(),
  created_by_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.event_responsibility_handovers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.current_user_organization_id(),
  event_id uuid references public.event_operations(id) on delete cascade,
  from_auth_user_id uuid,
  from_name text,
  to_auth_user_id uuid,
  to_name text not null,
  responsibility_scope text,
  notes text,
  created_by_auth_user_id uuid default auth.uid(),
  created_by_name text,
  created_at timestamptz default now()
);

create index if not exists event_operations_org_date_idx
on public.event_operations (organization_id, event_date, status);

create index if not exists event_staff_presence_org_date_idx
on public.event_staff_presence (organization_id, presence_date, lower(operator_name));

create unique index if not exists event_staff_presence_unique_person_idx
on public.event_staff_presence (
  organization_id,
  presence_date,
  lower(operator_name),
  coalesce(auth_user_id::text, '')
);

create index if not exists event_role_assignments_event_idx
on public.event_role_assignments (event_id, active);

create index if not exists event_tasks_event_status_idx
on public.event_tasks (event_id, status, due_at);

create index if not exists event_tasks_assignee_idx
on public.event_tasks (assigned_auth_user_id, lower(assigned_operator_name), assigned_role_key);

create index if not exists event_responsibility_handovers_event_idx
on public.event_responsibility_handovers (event_id, created_at desc);

drop trigger if exists event_operations_set_updated_at on public.event_operations;
create trigger event_operations_set_updated_at
before update on public.event_operations
for each row execute function public.set_updated_at();

drop trigger if exists event_staff_presence_set_updated_at on public.event_staff_presence;
create trigger event_staff_presence_set_updated_at
before update on public.event_staff_presence
for each row execute function public.set_updated_at();

drop trigger if exists event_role_assignments_set_updated_at on public.event_role_assignments;
create trigger event_role_assignments_set_updated_at
before update on public.event_role_assignments
for each row execute function public.set_updated_at();

drop trigger if exists event_tasks_set_updated_at on public.event_tasks;
create trigger event_tasks_set_updated_at
before update on public.event_tasks
for each row execute function public.set_updated_at();

alter table public.event_operations enable row level security;
alter table public.event_staff_presence enable row level security;
alter table public.event_role_assignments enable row level security;
alter table public.event_tasks enable row level security;
alter table public.event_responsibility_handovers enable row level security;

grant select, insert, update on public.event_operations to authenticated;
grant select, insert, update on public.event_staff_presence to authenticated;
grant select, insert, update on public.event_role_assignments to authenticated;
grant select, insert, update on public.event_tasks to authenticated;
grant select, insert on public.event_responsibility_handovers to authenticated;

create or replace function public.current_user_can_manage_event_ops()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.current_user_is_active()
    and public.current_user_profile_role() in ('manager', 'event_floor_manager')
    and not public.current_user_is_shared_device();
$$;

create or replace function public.same_event_ops_organization(target_org uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select target_org is not null
    and public.current_user_organization_id() is not null
    and target_org = public.current_user_organization_id();
$$;

create or replace function public.event_ops_event_belongs_to_current_org(input_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_operations event_record
    where event_record.id = input_event_id
      and public.same_event_ops_organization(event_record.organization_id)
  );
$$;

drop policy if exists "event_operations_read_active" on public.event_operations;
create policy "event_operations_read_active"
on public.event_operations for select
to authenticated
using (
  public.current_user_is_active()
  and public.same_event_ops_organization(organization_id)
);

drop policy if exists "event_operations_manage" on public.event_operations;
create policy "event_operations_manage"
on public.event_operations for all
to authenticated
using (
  public.current_user_can_manage_event_ops()
  and public.same_event_ops_organization(organization_id)
)
with check (
  public.current_user_can_manage_event_ops()
  and public.same_event_ops_organization(organization_id)
);

drop policy if exists "event_staff_presence_read_active" on public.event_staff_presence;
create policy "event_staff_presence_read_active"
on public.event_staff_presence for select
to authenticated
using (
  public.current_user_is_active()
  and public.same_event_ops_organization(organization_id)
);

drop policy if exists "event_staff_presence_self_insert" on public.event_staff_presence;
create policy "event_staff_presence_self_insert"
on public.event_staff_presence for insert
to authenticated
with check (
  public.current_user_is_active()
  and public.same_event_ops_organization(organization_id)
  and (
    public.current_user_can_manage_event_ops()
    or auth_user_id = auth.uid()
  )
);

drop policy if exists "event_staff_presence_self_update" on public.event_staff_presence;
create policy "event_staff_presence_self_update"
on public.event_staff_presence for update
to authenticated
using (
  public.current_user_is_active()
  and public.same_event_ops_organization(organization_id)
  and (
    public.current_user_can_manage_event_ops()
    or auth_user_id = auth.uid()
  )
)
with check (
  public.current_user_is_active()
  and public.same_event_ops_organization(organization_id)
  and (
    public.current_user_can_manage_event_ops()
    or auth_user_id = auth.uid()
  )
);

drop policy if exists "event_role_assignments_read_active" on public.event_role_assignments;
create policy "event_role_assignments_read_active"
on public.event_role_assignments for select
to authenticated
using (
  public.current_user_is_active()
  and public.same_event_ops_organization(organization_id)
);

drop policy if exists "event_role_assignments_manage" on public.event_role_assignments;
create policy "event_role_assignments_manage"
on public.event_role_assignments for all
to authenticated
using (
  public.current_user_can_manage_event_ops()
  and public.same_event_ops_organization(organization_id)
  and public.event_ops_event_belongs_to_current_org(event_id)
)
with check (
  public.current_user_can_manage_event_ops()
  and public.same_event_ops_organization(organization_id)
  and public.event_ops_event_belongs_to_current_org(event_id)
);

drop policy if exists "event_tasks_read_active" on public.event_tasks;
create policy "event_tasks_read_active"
on public.event_tasks for select
to authenticated
using (
  public.current_user_is_active()
  and public.same_event_ops_organization(organization_id)
);

drop policy if exists "event_tasks_manage" on public.event_tasks;
create policy "event_tasks_manage"
on public.event_tasks for insert
to authenticated
with check (
  public.current_user_can_manage_event_ops()
  and public.same_event_ops_organization(organization_id)
  and public.event_ops_event_belongs_to_current_org(event_id)
);

drop policy if exists "event_tasks_update_managers" on public.event_tasks;
create policy "event_tasks_update_managers"
on public.event_tasks for update
to authenticated
using (
  public.current_user_can_manage_event_ops()
  and public.same_event_ops_organization(organization_id)
  and public.event_ops_event_belongs_to_current_org(event_id)
)
with check (
  public.current_user_can_manage_event_ops()
  and public.same_event_ops_organization(organization_id)
  and public.event_ops_event_belongs_to_current_org(event_id)
);

drop policy if exists "event_handovers_read_active" on public.event_responsibility_handovers;
create policy "event_handovers_read_active"
on public.event_responsibility_handovers for select
to authenticated
using (
  public.current_user_is_active()
  and public.same_event_ops_organization(organization_id)
);

drop policy if exists "event_handovers_insert_managers" on public.event_responsibility_handovers;
create policy "event_handovers_insert_managers"
on public.event_responsibility_handovers for insert
to authenticated
with check (
  public.current_user_can_manage_event_ops()
  and public.same_event_ops_organization(organization_id)
  and public.event_ops_event_belongs_to_current_org(event_id)
);

create or replace function public.upsert_event_staff_presence(
  input_presence_date date,
  input_operator_name text,
  input_operator_source text default null,
  input_role_label text default null,
  input_selected_shift_scope text default null,
  input_available boolean default true,
  input_metadata jsonb default '{}'::jsonb
)
returns public.event_staff_presence
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_user_organization_id();
  v_record public.event_staff_presence;
  v_existing_id uuid;
  v_profile_display_name text;
begin
  if not public.current_user_is_active() then
    raise exception 'Active authenticated user required.';
  end if;
  if v_org is null then
    raise exception 'User organization is required for event staff presence.';
  end if;
  if coalesce(trim(input_operator_name), '') = '' then
    raise exception 'Operator name is required.';
  end if;
  if not public.current_user_can_manage_event_ops()
    and not public.current_user_is_shared_device()
  then
    select display_name
    into v_profile_display_name
    from public.user_profiles
    where id = auth.uid()
    limit 1;

    if coalesce(trim(v_profile_display_name), '') = '' then
      raise exception 'Profile display name is required for event staff presence.';
    end if;

    if lower(trim(input_operator_name)) <> lower(trim(v_profile_display_name)) then
      raise exception 'Personal users can only register event presence as their own profile display name.';
    end if;
  end if;

  select id
  into v_existing_id
  from public.event_staff_presence
  where organization_id = v_org
    and presence_date = input_presence_date
    and lower(operator_name) = lower(trim(input_operator_name))
    and coalesce(auth_user_id::text, '') = coalesce(auth.uid()::text, '')
  limit 1;

  if v_existing_id is not null then
    update public.event_staff_presence
    set
      operator_source = input_operator_source,
      role_label = input_role_label,
      selected_shift_scope = input_selected_shift_scope,
      available = coalesce(input_available, true),
      last_seen_at = now(),
      checked_out_at = case when coalesce(input_available, true) then null else checked_out_at end,
      metadata = coalesce(input_metadata, '{}'::jsonb),
      updated_at = now()
    where id = v_existing_id
    returning * into v_record;
  else
    insert into public.event_staff_presence (
      organization_id,
      presence_date,
      auth_user_id,
      operator_name,
      operator_source,
      role_label,
      selected_shift_scope,
      available,
      last_seen_at,
      metadata
    )
    values (
      v_org,
      input_presence_date,
      auth.uid(),
      trim(input_operator_name),
      input_operator_source,
      input_role_label,
      input_selected_shift_scope,
      coalesce(input_available, true),
      now(),
      coalesce(input_metadata, '{}'::jsonb)
    )
    returning * into v_record;
  end if;

  return v_record;
end;
$$;

create or replace function public.create_event_role_assignment(
  input_event_id uuid,
  input_role_key text,
  input_role_label text,
  input_zone text default null,
  input_assigned_auth_user_id uuid default null,
  input_assigned_operator_name text default null,
  input_assigned_operator_source text default null,
  input_assigned_by_name text default null,
  input_notes text default null
)
returns public.event_role_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_user_organization_id();
  v_record public.event_role_assignments;
begin
  if not public.current_user_can_manage_event_ops() then
    raise exception 'Only manager or event floor manager can assign event roles.';
  end if;
  if v_org is null then
    raise exception 'User organization is required for event role assignment.';
  end if;
  if not public.event_ops_event_belongs_to_current_org(input_event_id) then
    raise exception 'Event does not belong to the current organization.';
  end if;

  update public.event_role_assignments
  set active = false, updated_at = now()
  where event_id = input_event_id
    and role_key = input_role_key
    and active = true
    and organization_id = v_org;

  insert into public.event_role_assignments (
    organization_id,
    event_id,
    role_key,
    role_label,
    zone,
    assigned_auth_user_id,
    assigned_operator_name,
    assigned_operator_source,
    assigned_by_auth_user_id,
    assigned_by_name,
    active,
    notes
  )
  values (
    v_org,
    input_event_id,
    input_role_key,
    input_role_label,
    input_zone,
    input_assigned_auth_user_id,
    input_assigned_operator_name,
    input_assigned_operator_source,
    auth.uid(),
    input_assigned_by_name,
    true,
    input_notes
  )
  returning * into v_record;

  return v_record;
end;
$$;

create or replace function public.update_event_task_status(
  input_task_id uuid,
  input_status text,
  input_completed_by_name text default null,
  input_completion_comment text default null,
  input_actor_name text default null
)
returns public.event_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.event_tasks;
  v_org uuid := public.current_user_organization_id();
  v_event_date date;
  v_actor_name text;
  v_can_update boolean;
begin
  if not public.current_user_is_active() then
    raise exception 'Active authenticated user required.';
  end if;
  if v_org is null then
    raise exception 'User organization is required for event task status update.';
  end if;
  if input_status not in ('pending', 'acknowledged', 'done', 'missed', 'cancelled') then
    raise exception 'Invalid event task status.';
  end if;
  if not public.current_user_can_manage_event_ops()
    and input_status not in ('acknowledged', 'done')
  then
    raise exception 'Operational users can only acknowledge or complete event tasks.';
  end if;

  v_actor_name := nullif(trim(coalesce(input_actor_name, input_completed_by_name, '')), '');

  select task.*
  into v_task
  from public.event_tasks task
  join public.event_operations event_record on event_record.id = task.event_id
  where task.id = input_task_id
    and task.organization_id = v_org
    and event_record.organization_id = v_org
  for update;

  if not found then
    raise exception 'Event task not found.';
  end if;
  select event_date
  into v_event_date
  from public.event_operations
  where id = v_task.event_id
    and organization_id = v_org;

  if public.current_user_can_manage_event_ops() then
    v_can_update := true;
  else
    v_can_update := false;

    if v_task.assigned_auth_user_id = auth.uid() then
      v_can_update := true;
    end if;

    if not v_can_update
      and v_actor_name is not null
      and v_task.assigned_operator_name is not null
      and lower(v_task.assigned_operator_name) = lower(v_actor_name)
      and exists (
        select 1
        from public.event_staff_presence presence
        where presence.organization_id = v_org
          and presence.presence_date = v_event_date
          and presence.auth_user_id = auth.uid()
          and lower(presence.operator_name) = lower(v_actor_name)
          and presence.available = true
      )
    then
      v_can_update := true;
    end if;

    if not v_can_update
      and v_task.assigned_role_key is not null
      and exists (
        select 1
        from public.event_role_assignments assignment
        where assignment.organization_id = v_org
          and assignment.event_id = v_task.event_id
          and assignment.role_key = v_task.assigned_role_key
          and assignment.active = true
          and assignment.assigned_auth_user_id = auth.uid()
      )
    then
      v_can_update := true;
    end if;

    if not v_can_update
      and v_actor_name is not null
      and v_task.assigned_role_key is not null
      and exists (
        select 1
        from public.event_role_assignments assignment
        join public.event_staff_presence presence
          on presence.organization_id = assignment.organization_id
         and presence.presence_date = v_event_date
         and presence.auth_user_id = auth.uid()
         and lower(presence.operator_name) = lower(v_actor_name)
         and presence.available = true
        where assignment.organization_id = v_org
          and assignment.event_id = v_task.event_id
          and assignment.role_key = v_task.assigned_role_key
          and assignment.active = true
          and lower(assignment.assigned_operator_name) = lower(v_actor_name)
      )
    then
      v_can_update := true;
    end if;
  end if;

  if not v_can_update then
    raise exception 'This event task is not assigned to the current actor.';
  end if;

  update public.event_tasks
  set
    status = input_status,
    acknowledged_at = case when input_status = 'acknowledged' then now() else acknowledged_at end,
    acknowledged_by_name = case when input_status = 'acknowledged' then input_completed_by_name else acknowledged_by_name end,
    completed_at = case when input_status = 'done' then now() else completed_at end,
    completed_by_auth_user_id = case when input_status = 'done' then auth.uid() else completed_by_auth_user_id end,
    completed_by_name = case when input_status = 'done' then input_completed_by_name else completed_by_name end,
    completion_comment = case when input_status = 'done' then input_completion_comment else completion_comment end,
    updated_at = now()
  where id = input_task_id
  returning * into v_task;

  return v_task;
end;
$$;

create or replace function public.create_event_responsibility_handover(
  input_event_id uuid,
  input_from_name text,
  input_to_auth_user_id uuid,
  input_to_name text,
  input_responsibility_scope text,
  input_notes text,
  input_created_by_name text
)
returns public.event_responsibility_handovers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_user_organization_id();
  v_record public.event_responsibility_handovers;
begin
  if not public.current_user_can_manage_event_ops() then
    raise exception 'Only manager or event floor manager can create event responsibility handovers.';
  end if;
  if v_org is null then
    raise exception 'User organization is required for event responsibility handover.';
  end if;
  if not public.event_ops_event_belongs_to_current_org(input_event_id) then
    raise exception 'Event does not belong to the current organization.';
  end if;

  insert into public.event_responsibility_handovers (
    organization_id,
    event_id,
    from_auth_user_id,
    from_name,
    to_auth_user_id,
    to_name,
    responsibility_scope,
    notes,
    created_by_auth_user_id,
    created_by_name
  )
  values (
    v_org,
    input_event_id,
    auth.uid(),
    input_from_name,
    input_to_auth_user_id,
    input_to_name,
    input_responsibility_scope,
    input_notes,
    auth.uid(),
    input_created_by_name
  )
  returning * into v_record;

  update public.event_operations
  set
    active_responsible_name = input_to_name,
    active_responsible_auth_user_id = input_to_auth_user_id,
    updated_at = now()
  where id = input_event_id
    and organization_id = v_org;

  return v_record;
end;
$$;

-- Phase 8I: event-specific live operational updates.
-- Do not run automatically. Apply manually after review.

create table if not exists public.event_live_updates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_user_organization_id(),
  event_id uuid not null references public.event_operations(id) on delete cascade,
  update_type text not null check (update_type in (
    'note', 'issue', 'delay', 'client_request', 'decision', 'change',
    'safety', 'stock', 'technical', 'catering', 'staffing', 'handover'
  )),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved', 'cancelled')),
  title text not null,
  details text,
  zone text,
  priority text not null default 'normal' check (priority in ('normal', 'important', 'critical')),
  owner_role_key text,
  owner_auth_user_id uuid references auth.users(id),
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_auth_user_id uuid references auth.users(id),
  resolution_note text,
  created_by_auth_user_id uuid not null default auth.uid(),
  created_by_name text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_live_updates_event_status_idx
on public.event_live_updates (event_id, status, occurred_at desc);
create index if not exists event_live_updates_org_idx
on public.event_live_updates (organization_id, occurred_at desc);
create index if not exists event_live_updates_owner_idx
on public.event_live_updates (owner_auth_user_id, status);

create or replace function public.event_live_update_event_access(input_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    auth.uid() is not null
    and public.current_user_is_active()
    and public.event_ops_event_belongs_to_current_org(input_event_id)
    and (
      public.current_user_can_manage_event_ops()
      or exists (
        select 1
        from public.event_role_assignments assignment
        where assignment.event_id = input_event_id
          and assignment.organization_id = public.current_user_organization_id()
          and assignment.active = true
          and assignment.assigned_auth_user_id = auth.uid()
      )
      or exists (
        select 1
        from public.event_operations event_record
        join public.event_staff_presence presence
          on presence.organization_id = event_record.organization_id
         and presence.presence_date = event_record.event_date
         and presence.auth_user_id = auth.uid()
         and presence.available = true
        join public.event_role_assignments assignment
          on assignment.event_id = event_record.id
         and assignment.organization_id = event_record.organization_id
         and assignment.active = true
         and assignment.assigned_auth_user_id is null
         and lower(trim(assignment.assigned_operator_name)) = lower(trim(presence.operator_name))
        where event_record.id = input_event_id
          and public.current_user_is_shared_device()
      )
    );
$$;

create or replace function public.event_live_update_can_manage(input_update_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.event_live_updates live_update
    where live_update.id = input_update_id
      and live_update.organization_id = public.current_user_organization_id()
      and public.current_user_is_active()
      and public.event_ops_event_belongs_to_current_org(live_update.event_id)
      and (
        public.current_user_can_manage_event_ops()
        or (
          not public.current_user_is_shared_device()
          and exists (
            select 1
            from public.event_role_assignments assignment
            where assignment.event_id = live_update.event_id
              and assignment.organization_id = live_update.organization_id
              and assignment.active = true
              and assignment.role_key in (
                'event_floor_manager', 'cornerbar_manager', 'atrium_manager',
                'workbar_manager', 'headrunner'
              )
              and assignment.assigned_auth_user_id = auth.uid()
              and (
                (
                  lower(coalesce(nullif(trim(live_update.zone), ''), 'all')) = 'all'
                  and lower(coalesce(nullif(trim(assignment.zone), ''), 'all')) = 'all'
                )
                or (
                  lower(coalesce(nullif(trim(live_update.zone), ''), 'all')) <> 'all'
                  and lower(coalesce(nullif(trim(assignment.zone), ''), 'all')) in (
                    'all',
                    lower(coalesce(nullif(trim(live_update.zone), ''), 'all'))
                  )
                )
              )
          )
        )
      )
  );
$$;

create or replace function public.event_live_update_is_relevant(
  input_event_id uuid,
  input_zone text,
  input_priority text,
  input_operator_name text default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    public.current_user_can_manage_event_ops()
    or (
      public.event_live_update_event_access(input_event_id)
      and (
        (
          not public.current_user_is_shared_device()
          and (
            coalesce(nullif(trim(input_zone), ''), 'all') = 'all'
            or coalesce(input_priority, 'normal') = 'critical'
            or exists (
              select 1
              from public.event_role_assignments assignment
              where assignment.event_id = input_event_id
                and assignment.organization_id = public.current_user_organization_id()
                and assignment.active = true
                and assignment.assigned_auth_user_id = auth.uid()
                and (
                  coalesce(nullif(trim(assignment.zone), ''), 'all') = 'all'
                  or coalesce(nullif(trim(assignment.zone), ''), 'all') = coalesce(nullif(trim(input_zone), ''), 'all')
                )
            )
          )
        )
        or (
          public.current_user_is_shared_device()
          and nullif(trim(coalesce(input_operator_name, '')), '') is not null
          and exists (
            select 1
            from public.event_role_assignments assignment
            join public.event_operations event_record
              on event_record.id = assignment.event_id
             and event_record.organization_id = assignment.organization_id
            join public.event_staff_presence presence
              on presence.organization_id = event_record.organization_id
             and presence.presence_date = event_record.event_date
             and presence.auth_user_id = auth.uid()
             and presence.available = true
             and lower(trim(presence.operator_name)) = lower(trim(input_operator_name))
            where assignment.event_id = input_event_id
              and assignment.organization_id = public.current_user_organization_id()
              and assignment.active = true
              and assignment.assigned_auth_user_id is null
              and lower(trim(assignment.assigned_operator_name)) = lower(trim(input_operator_name))
              and (
                coalesce(nullif(trim(input_zone), ''), 'all') = 'all'
                or coalesce(input_priority, 'normal') = 'critical'
                or coalesce(nullif(trim(assignment.zone), ''), 'all') = 'all'
                or coalesce(nullif(trim(assignment.zone), ''), 'all') = coalesce(nullif(trim(input_zone), ''), 'all')
              )
          )
        )
      )
    );
$$;

create or replace function public.enforce_event_live_update_organization()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_event_org uuid;
begin
  select event_record.organization_id into v_event_org
  from public.event_operations event_record
  where event_record.id = new.event_id;
  if v_event_org is null then
    raise exception 'Event Board not found.';
  end if;
  if new.organization_id is distinct from v_event_org then
    raise exception 'Live update organization must match its Event Board.';
  end if;
  return new;
end;
$$;

drop trigger if exists event_live_updates_enforce_org on public.event_live_updates;
create trigger event_live_updates_enforce_org
before insert or update on public.event_live_updates
for each row execute function public.enforce_event_live_update_organization();

drop trigger if exists event_live_updates_set_updated_at on public.event_live_updates;
create trigger event_live_updates_set_updated_at
before update on public.event_live_updates
for each row execute function public.set_updated_at();

alter table public.event_live_updates enable row level security;
revoke all privileges on table public.event_live_updates from anon;
revoke all privileges on table public.event_live_updates from authenticated;
grant select on table public.event_live_updates to authenticated;
revoke all privileges on table public.event_live_updates from service_role;
grant select, insert, update, delete on table public.event_live_updates to service_role;

drop policy if exists "event_live_updates_read_relevant" on public.event_live_updates;
create policy "event_live_updates_read_relevant"
on public.event_live_updates for select
to authenticated
using (
  not public.current_user_is_shared_device()
  and
  public.same_event_ops_organization(organization_id)
  and public.event_live_update_event_access(event_id)
  and public.event_live_update_is_relevant(event_id, zone, priority, null)
);

create or replace function public.list_event_live_updates(
  input_event_id uuid,
  input_operator_name text default null
)
returns setof public.event_live_updates
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if input_event_id is null or not public.event_live_update_event_access(input_event_id) then
    raise exception 'Event access required for live updates.';
  end if;
  if public.current_user_is_shared_device()
    and nullif(trim(coalesce(input_operator_name, '')), '') is null then
    raise exception 'Selected shared-device operator is required.';
  end if;
  return query
    select live_update.*
    from public.event_live_updates live_update
    where live_update.event_id = input_event_id
      and live_update.organization_id = public.current_user_organization_id()
      and public.event_live_update_is_relevant(
        live_update.event_id,
        live_update.zone,
        live_update.priority,
        input_operator_name
      )
    order by live_update.occurred_at desc;
end;
$$;

create or replace function public.create_event_live_update(
  input_event_id uuid,
  input_update_type text,
  input_title text,
  input_details text default null,
  input_zone text default 'all',
  input_priority text default 'normal',
  input_owner_role_key text default null,
  input_owner_auth_user_id uuid default null,
  input_occurred_at timestamptz default now(),
  input_created_by_name text default null,
  input_metadata jsonb default '{}'::jsonb
)
returns public.event_live_updates
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := public.current_user_organization_id();
  v_profile public.user_profiles;
  v_record public.event_live_updates;
  v_actor_name text := nullif(trim(coalesce(input_created_by_name, '')), '');
  v_zone text := coalesce(nullif(lower(trim(coalesce(input_zone, ''))), ''), 'all');
  v_type text := lower(trim(coalesce(input_update_type, '')));
  v_priority text := lower(trim(coalesce(input_priority, 'normal')));
  v_is_zone_lead boolean := false;
begin
  if auth.uid() is null or not public.current_user_is_active() then
    raise exception 'Active authenticated user required.';
  end if;
  if v_org is null or not public.event_live_update_event_access(input_event_id) then
    raise exception 'Event access required for live updates.';
  end if;
  if nullif(trim(coalesce(input_title, '')), '') is null then
    raise exception 'Live update title is required.';
  end if;
  if v_type not in (
    'note', 'issue', 'delay', 'client_request', 'decision', 'change',
    'safety', 'stock', 'technical', 'catering', 'staffing', 'handover'
  ) then raise exception 'Invalid live update type.'; end if;
  if v_priority not in ('normal', 'important', 'critical') then
    raise exception 'Invalid live update priority.';
  end if;
  if v_zone not in (
    'all', 'cornerbar', 'atrium', 'workbar', 'runners',
    'bar', 'support', 'other', 'backstage', 'project_rooms'
  ) then raise exception 'Invalid live update zone.'; end if;

  select profile.* into v_profile
  from public.user_profiles profile
  where profile.id = auth.uid();
  if v_profile.id is null or v_profile.active is not true or v_profile.organization_id is distinct from v_org then
    raise exception 'Active organization profile required.';
  end if;
  if coalesce(v_profile.is_shared_device, false) then
    if v_actor_name is null or not exists (
      select 1
      from public.event_operations event_record
      join public.event_staff_presence presence
        on presence.organization_id = event_record.organization_id
       and presence.presence_date = event_record.event_date
       and presence.auth_user_id = auth.uid()
       and presence.available = true
       and lower(trim(presence.operator_name)) = lower(v_actor_name)
      join public.event_role_assignments assignment
        on assignment.event_id = event_record.id
       and assignment.organization_id = event_record.organization_id
       and assignment.active = true
       and assignment.assigned_auth_user_id is null
       and lower(trim(assignment.assigned_operator_name)) = lower(v_actor_name)
      where event_record.id = input_event_id
    ) then
      raise exception 'Selected shared-device operator is not assigned to this event.';
    end if;
  else
    v_actor_name := trim(v_profile.display_name);
    select exists (
      select 1
      from public.event_role_assignments assignment
      where assignment.event_id = input_event_id
        and assignment.organization_id = v_org
        and assignment.active = true
        and assignment.role_key in (
          'event_floor_manager', 'cornerbar_manager', 'atrium_manager',
          'workbar_manager', 'headrunner'
        )
        and assignment.assigned_auth_user_id = auth.uid()
        and (
          (
            v_zone = 'all'
            and lower(coalesce(nullif(trim(assignment.zone), ''), 'all')) = 'all'
          )
          or (
            v_zone <> 'all'
            and lower(coalesce(nullif(trim(assignment.zone), ''), 'all')) in ('all', v_zone)
          )
        )
    ) into v_is_zone_lead;
  end if;

  if not public.current_user_can_manage_event_ops()
    and not v_is_zone_lead
    and v_type not in ('note', 'issue') then
    raise exception 'Event staff may create notes or issues. Operational changes require a zone lead or Event Operations manager.';
  end if;

  if not public.event_live_update_is_relevant(input_event_id, v_zone, v_priority, v_actor_name) then
    raise exception 'Live update zone is outside your event assignment.';
  end if;

  if input_owner_auth_user_id is not null and not exists (
    select 1 from public.user_profiles owner_profile
    where owner_profile.id = input_owner_auth_user_id
      and owner_profile.organization_id = v_org
      and owner_profile.active = true
      and coalesce(owner_profile.is_shared_device, false) = false
  ) then raise exception 'Live update owner is not an active organization user.'; end if;

  insert into public.event_live_updates (
    organization_id, event_id, update_type, status, title, details, zone,
    priority, owner_role_key, owner_auth_user_id, occurred_at,
    created_by_auth_user_id, created_by_name, metadata
  ) values (
    v_org, input_event_id, v_type, 'open', trim(input_title),
    nullif(trim(coalesce(input_details, '')), ''), v_zone, v_priority,
    nullif(trim(coalesce(input_owner_role_key, '')), ''), input_owner_auth_user_id,
    coalesce(input_occurred_at, now()), auth.uid(), v_actor_name,
    coalesce(input_metadata, '{}'::jsonb)
  ) returning * into v_record;
  return v_record;
end;
$$;

create or replace function public.update_event_live_update(
  input_update_id uuid,
  input_title text,
  input_details text default null,
  input_zone text default 'all',
  input_priority text default 'normal',
  input_owner_role_key text default null,
  input_occurred_at timestamptz default now(),
  input_metadata jsonb default '{}'::jsonb
)
returns public.event_live_updates
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_record public.event_live_updates;
  v_zone text := coalesce(nullif(lower(trim(coalesce(input_zone, ''))), ''), 'all');
  v_priority text := lower(trim(coalesce(input_priority, 'normal')));
begin
  if input_update_id is null or not public.current_user_can_manage_event_ops() then
    raise exception 'Event Operations manager access required.';
  end if;
  if nullif(trim(coalesce(input_title, '')), '') is null then raise exception 'Live update title is required.'; end if;
  if v_zone not in ('all', 'cornerbar', 'atrium', 'workbar', 'runners', 'bar', 'support', 'other', 'backstage', 'project_rooms') then raise exception 'Invalid live update zone.'; end if;
  if v_priority not in ('normal', 'important', 'critical') then raise exception 'Invalid live update priority.'; end if;
  update public.event_live_updates
  set title = trim(input_title),
      details = nullif(trim(coalesce(input_details, '')), ''),
      zone = v_zone,
      priority = v_priority,
      owner_role_key = nullif(trim(coalesce(input_owner_role_key, '')), ''),
      occurred_at = coalesce(input_occurred_at, occurred_at),
      metadata = coalesce(input_metadata, metadata)
  where id = input_update_id
    and organization_id = public.current_user_organization_id()
    and public.event_ops_event_belongs_to_current_org(event_id)
  returning * into v_record;
  if v_record.id is null then raise exception 'Live update not found.'; end if;
  return v_record;
end;
$$;

create or replace function public.set_event_live_update_status(
  input_update_id uuid,
  input_status text,
  input_resolution_note text default null
)
returns public.event_live_updates
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_record public.event_live_updates;
  v_status text := lower(trim(coalesce(input_status, '')));
  v_current_status text;
begin
  if auth.uid() is null or not public.current_user_is_active() then
    raise exception 'Active authenticated user required.';
  end if;
  if input_update_id is null then raise exception 'Live update is required.'; end if;
  if v_status not in ('acknowledged', 'resolved', 'cancelled') then
    raise exception 'Invalid live update status.';
  end if;

  select live_update.* into v_record
  from public.event_live_updates live_update
  where live_update.id = input_update_id
    and live_update.organization_id = public.current_user_organization_id()
    and public.event_ops_event_belongs_to_current_org(live_update.event_id)
  for update;

  if v_record.id is null then
    raise exception 'Live update not found or access denied.';
  end if;
  if not public.event_live_update_can_manage(v_record.id) then
    raise exception 'You cannot change this live update.';
  end if;
  if v_status = 'cancelled' and not public.current_user_can_manage_event_ops() then
    raise exception 'Only an Event Operations manager can cancel a live update.';
  end if;

  v_current_status := v_record.status;
  if v_current_status = v_status then
    return v_record;
  end if;
  if v_current_status in ('resolved', 'cancelled') then
    raise exception 'Live update is already closed and cannot change status.';
  end if;

  update public.event_live_updates
  set status = v_status,
      resolved_at = case when v_status in ('resolved', 'cancelled') then now() else null end,
      resolved_by_auth_user_id = case when v_status in ('resolved', 'cancelled') then auth.uid() else null end,
      resolution_note = case when v_status in ('resolved', 'cancelled') then nullif(trim(coalesce(input_resolution_note, '')), '') else resolution_note end
  where id = v_record.id
    and organization_id = v_record.organization_id
    and status = v_current_status
  returning * into v_record;
  if v_record.id is null then
    raise exception 'Live update changed while this request was being processed. Refresh and try again.';
  end if;
  return v_record;
end;
$$;

revoke all on function public.event_live_update_event_access(uuid) from public, anon;
revoke all on function public.event_live_update_can_manage(uuid) from public, anon;
revoke all on function public.event_live_update_is_relevant(uuid, text, text, text) from public, anon;
revoke all on function public.enforce_event_live_update_organization() from public, anon, authenticated;
revoke all on function public.list_event_live_updates(uuid, text) from public, anon;
revoke all on function public.create_event_live_update(uuid, text, text, text, text, text, text, uuid, timestamptz, text, jsonb) from public, anon;
revoke all on function public.update_event_live_update(uuid, text, text, text, text, text, timestamptz, jsonb) from public, anon;
revoke all on function public.set_event_live_update_status(uuid, text, text) from public, anon;
grant execute on function public.event_live_update_event_access(uuid) to authenticated, service_role;
grant execute on function public.event_live_update_can_manage(uuid) to authenticated, service_role;
grant execute on function public.event_live_update_is_relevant(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.list_event_live_updates(uuid, text) to authenticated, service_role;
grant execute on function public.enforce_event_live_update_organization() to service_role;
grant execute on function public.create_event_live_update(uuid, text, text, text, text, text, text, uuid, timestamptz, text, jsonb) to authenticated, service_role;
grant execute on function public.update_event_live_update(uuid, text, text, text, text, text, timestamptz, jsonb) to authenticated, service_role;
grant execute on function public.set_event_live_update_status(uuid, text, text) to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'event_live_updates'
    )
  then
    alter publication supabase_realtime add table public.event_live_updates;
  end if;
end;
$$;

notify pgrst, 'reload schema';

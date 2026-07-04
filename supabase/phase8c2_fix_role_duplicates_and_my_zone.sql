-- Phase 8C.2: prevent duplicate active team role assignments.
-- Do not run automatically. Apply manually in Supabase SQL editor after review.

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
  v_role_key text := nullif(trim(coalesce(input_role_key, '')), '');
  v_role_label text := nullif(trim(coalesce(input_role_label, '')), '');
  v_zone text := nullif(trim(coalesce(input_zone, '')), '');
  v_assigned_auth_user_id uuid := input_assigned_auth_user_id;
  v_assigned_auth_is_shared_device boolean := false;
  v_assigned_operator_name text := nullif(trim(coalesce(input_assigned_operator_name, '')), '');
  v_assigned_operator_source text := nullif(trim(coalesce(input_assigned_operator_source, '')), '');
  v_assigned_by_name text := nullif(trim(coalesce(input_assigned_by_name, '')), '');
  v_notes text := nullif(trim(coalesce(input_notes, '')), '');
  v_effective_zone text;
  v_is_single_lead boolean;
begin
  if not public.current_user_can_manage_event_ops() then
    raise exception 'Only manager or event floor manager can assign event roles.';
  end if;

  if public.current_user_is_shared_device() then
    raise exception 'Shared devices cannot assign event roles.';
  end if;

  if v_org is null then
    raise exception 'User organization is required for event role assignment.';
  end if;

  if v_role_key is null then
    raise exception 'Event role key is required.';
  end if;

  if v_role_label is null then
    raise exception 'Event role label is required.';
  end if;

  if v_role_key not in (
    'event_floor_manager',
    'cornerbar_manager',
    'atrium_manager',
    'workbar_manager',
    'headrunner',
    'runner',
    'cornerbar_staff',
    'atrium_staff',
    'workbar_staff',
    'bar_staff',
    'support',
    'other'
  ) then
    raise exception 'Invalid event role key: %', v_role_key;
  end if;

  if v_assigned_auth_user_id is not null then
    select coalesce(profile.is_shared_device, false)
    into v_assigned_auth_is_shared_device
    from public.user_profiles profile
    where profile.id = v_assigned_auth_user_id;

    if coalesce(v_assigned_auth_is_shared_device, false) and v_assigned_operator_name is null then
      raise exception 'Shared-device role assignments require an operator name.';
    end if;

    if coalesce(v_assigned_auth_is_shared_device, false) and v_assigned_operator_name is not null then
      v_assigned_auth_user_id := null;
    end if;
  end if;

  if v_assigned_auth_user_id is null and v_assigned_operator_name is null then
    raise exception 'Event role assignment requires a user id or operator name.';
  end if;

  if not public.event_ops_event_belongs_to_current_org(input_event_id) then
    raise exception 'Event does not belong to the current organization.';
  end if;

  v_effective_zone := case v_role_key
    when 'event_floor_manager' then 'all'
    when 'cornerbar_manager' then 'cornerbar'
    when 'atrium_manager' then 'atrium'
    when 'workbar_manager' then 'workbar'
    when 'headrunner' then 'runners'
    when 'runner' then 'runners'
    when 'cornerbar_staff' then 'cornerbar'
    when 'atrium_staff' then 'atrium'
    when 'workbar_staff' then 'workbar'
    when 'bar_staff' then 'all'
    when 'support' then 'support'
    when 'other' then 'other'
    else coalesce(v_zone, 'all')
  end;

  v_is_single_lead := v_role_key in (
    'event_floor_manager',
    'cornerbar_manager',
    'atrium_manager',
    'workbar_manager',
    'headrunner'
  );

  if v_is_single_lead then
    update public.event_role_assignments
    set active = false, updated_at = now()
    where event_id = input_event_id
      and role_key = v_role_key
      and active = true
      and organization_id = v_org;
  else
    update public.event_role_assignments
    set active = false, updated_at = now()
    where event_id = input_event_id
      and role_key = v_role_key
      and active = true
      and organization_id = v_org
      and (
        (
          v_assigned_operator_name is not null
          and lower(trim(coalesce(assigned_operator_name, ''))) =
              lower(v_assigned_operator_name)
        )
        or (
          v_assigned_operator_name is null
          and v_assigned_auth_user_id is not null
          and assigned_auth_user_id = v_assigned_auth_user_id
        )
      );
  end if;

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
    v_role_key,
    v_role_label,
    v_effective_zone,
    v_assigned_auth_user_id,
    v_assigned_operator_name,
    v_assigned_operator_source,
    auth.uid(),
    v_assigned_by_name,
    true,
    v_notes
  )
  returning * into v_record;

  return v_record;
end;
$$;

update public.event_role_assignments assignments
set assigned_auth_user_id = null,
    updated_at = now()
from public.user_profiles profile
where assignments.assigned_auth_user_id = profile.id
  and coalesce(profile.is_shared_device, false) = true
  and nullif(trim(coalesce(assignments.assigned_operator_name, '')), '') is not null;

with ranked_team_assignments as (
  select
    id,
    row_number() over (
      partition by
        organization_id,
        event_id,
        role_key,
        case
          when nullif(trim(coalesce(assigned_operator_name, '')), '') is not null
            then 'name:' || lower(trim(assigned_operator_name))
          when assigned_auth_user_id is not null
            then 'auth:' || assigned_auth_user_id::text
          else 'unique:' || id::text
        end
      order by created_at desc nulls last, updated_at desc nulls last, id desc
    ) as duplicate_rank
  from public.event_role_assignments
  where active = true
    and role_key in (
      'runner',
      'cornerbar_staff',
      'atrium_staff',
      'workbar_staff',
      'bar_staff',
      'support',
      'other'
    )
)
update public.event_role_assignments assignments
set active = false, updated_at = now()
from ranked_team_assignments ranked
where assignments.id = ranked.id
  and ranked.duplicate_rank > 1;

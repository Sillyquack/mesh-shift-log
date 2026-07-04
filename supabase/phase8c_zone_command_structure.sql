-- Phase 8C: Zone command structure role assignment behavior.
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
  v_assigned_operator_name text := nullif(trim(coalesce(input_assigned_operator_name, '')), '');
  v_assigned_operator_source text := nullif(trim(coalesce(input_assigned_operator_source, '')), '');
  v_assigned_by_name text := nullif(trim(coalesce(input_assigned_by_name, '')), '');
  v_notes text := nullif(trim(coalesce(input_notes, '')), '');
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

  if input_assigned_auth_user_id is null and v_assigned_operator_name is null then
    raise exception 'Event role assignment requires a user id or operator name.';
  end if;

  if not public.event_ops_event_belongs_to_current_org(input_event_id) then
    raise exception 'Event does not belong to the current organization.';
  end if;

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
      and coalesce(nullif(trim(coalesce(zone, '')), ''), '') = coalesce(v_zone, '')
      and active = true
      and organization_id = v_org
      and (
        (input_assigned_auth_user_id is not null and assigned_auth_user_id = input_assigned_auth_user_id)
        or (
          v_assigned_operator_name is not null
          and lower(trim(coalesce(assigned_operator_name, ''))) =
              lower(v_assigned_operator_name)
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
    v_zone,
    input_assigned_auth_user_id,
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

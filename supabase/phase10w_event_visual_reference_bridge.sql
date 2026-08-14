-- Phase 10W: least-privilege Event Mode visual-reference bridge.
--
-- This migration does not broaden Routine Engine task permissions and does not
-- grant Event Floor Managers table access. It exposes only an immutable allowlist
-- of event visual-reference keys through one sanitized metadata RPC and extends
-- the existing private Storage read predicate for current active images only.

create or replace function public.event_visual_current_user_organization_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select profile.organization_id
  from public.user_profiles profile
  where profile.id = (select auth.uid())
    and profile.active = true
    and profile.organization_id is not null
    and coalesce(profile.is_shared_device, false) = false
    and profile.role in ('manager', 'event_floor_manager')
  limit 1;
$$;

create or replace function public.event_visual_current_user_can_read()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.user_profiles profile
    where profile.id = (select auth.uid())
      and profile.active = true
      and profile.organization_id is not null
      and coalesce(profile.is_shared_device, false) = false
      and profile.role in ('manager', 'event_floor_manager')
  );
$$;

create or replace function public.event_visual_reference_key_allowed(
  input_reference_key text
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select trim(coalesce(input_reference_key, '')) = any (array[
    'atrium-cafe',
    'atrium-classroom',
    'atrium-parking-lot',
    'atrium-cinema-cafe',
    'atrium-cinema-stage',
    'atrium-empty',
    'atrium-standing',
    'atrium-cocktail',
    'atrium-bar-ready',
    'atrium-bar-closed',
    'atrium-drinks-under-25',
    'atrium-drinks-over-25',
    'atrium-coffee-tea',
    'atrium-used-dishes',
    'atrium-check-in',
    'atrium-food',
    'atrium-water',
    'atrium-wine-beer',
    'atrium-stage-tech-overview',
    'atrium-hdmi-inputs',
    'atrium-microphones',
    'atrium-clicker-batteries',
    'cornerbar-event-ready',
    'cornerbar-bar-ready',
    'cornerbar-final-reset',
    'coffee-tea-complete',
    'coffee-tea-refill',
    'food-main',
    'food-snacks',
    'food-cheese-jam',
    'food-allergens'
  ]::text[]);
$$;

create or replace function public.get_event_visual_references(
  input_reference_keys text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_organization_id uuid;
  v_rows jsonb;
begin
  if not public.event_visual_current_user_can_read() then
    raise exception using
      errcode = '42501',
      message = 'Event visual-reference access requires an active personal Event Floor Manager or manager profile.';
  end if;

  v_organization_id := public.event_visual_current_user_organization_id();
  if v_organization_id is null then
    raise exception using
      errcode = '42501',
      message = 'Event visual-reference access requires an organization.';
  end if;

  if input_reference_keys is null
     or cardinality(input_reference_keys) = 0
     or cardinality(input_reference_keys) > 100 then
    raise exception using
      errcode = '22023',
      message = 'Event visual-reference requests require between 1 and 100 keys.';
  end if;

  if exists (
    select 1
    from unnest(input_reference_keys) requested(reference_key)
    where not public.event_visual_reference_key_allowed(requested.reference_key)
  ) then
    raise exception using
      errcode = '22023',
      message = 'The event visual-reference request contains an unsupported key.';
  end if;

  with requested as (
    select distinct on (trim(item.reference_key))
      trim(item.reference_key) as reference_key,
      item.ordinality
    from unnest(input_reference_keys) with ordinality
      item(reference_key, ordinality)
    order by trim(item.reference_key), item.ordinality
  ), reference_rows as (
    select
      requested.reference_key,
      requested.ordinality,
      reference.id as reference_id,
      reference.label,
      reference.description,
      reference.placeholder_text,
      reference.revision as reference_revision,
      current_version.id as version_id,
      current_version.version_number,
      current_version.state,
      current_version.object_path,
      current_version.mime_type,
      current_version.byte_size,
      current_version.caption,
      current_version.alt_text
    from requested
    left join public.routine_reference_images reference
      on reference.organization_id = v_organization_id
     and reference.reference_key = requested.reference_key
     and reference.active
    left join public.routine_reference_image_versions current_version
      on current_version.id = reference.current_version_id
     and current_version.organization_id = reference.organization_id
     and current_version.reference_id = reference.id
     and current_version.state in ('active_image', 'placeholder')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'referenceKey', row.reference_key,
    'referenceId', row.reference_id,
    'label', coalesce(row.label, row.reference_key),
    'description', row.description,
    'placeholderText', coalesce(row.placeholder_text, 'Reference image coming soon'),
    'referenceRevision', row.reference_revision,
    'versionId', row.version_id,
    'versionNumber', row.version_number,
    'state', coalesce(row.state, 'missing'),
    'objectPath', case when row.state = 'active_image' then row.object_path else null end,
    'mimeType', case when row.state = 'active_image' then row.mime_type else null end,
    'byteSize', case when row.state = 'active_image' then row.byte_size else null end,
    'caption', case when row.state = 'active_image' then row.caption else null end,
    'altText', case when row.state = 'active_image' then row.alt_text else null end
  ) order by row.ordinality), '[]'::jsonb)
  into v_rows
  from reference_rows row;

  return jsonb_build_object(
    'references', v_rows,
    'requestedCount', jsonb_array_length(v_rows)
  );
end;
$$;

create or replace function public.routine_reference_storage_can_read(
  input_object_path text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.routine_reference_image_versions version
    join public.routine_reference_images reference
      on reference.id = version.reference_id
     and reference.organization_id = version.organization_id
    where version.object_path = input_object_path
      and (
        (
          version.organization_id = public.routine_current_user_organization_id()
          and (
            public.routine_current_user_can_manage_templates()
            or (
              public.routine_current_user_can_perform_tasks()
              and version.id = reference.current_version_id
              and version.state = 'active_image'
              and reference.active
              and public.routine_reference_is_published_linked(
                reference.id,
                reference.organization_id
              )
            )
          )
        )
        or (
          version.organization_id = public.event_visual_current_user_organization_id()
          and public.event_visual_current_user_can_read()
          and public.event_visual_reference_key_allowed(reference.reference_key)
          and reference.active
          and version.id = reference.current_version_id
          and version.state = 'active_image'
        )
      )
  );
$$;

revoke all on function public.event_visual_current_user_organization_id()
  from public, anon, authenticated;
revoke all on function public.event_visual_current_user_can_read()
  from public, anon, authenticated;
revoke all on function public.event_visual_reference_key_allowed(text)
  from public, anon, authenticated;
revoke all on function public.get_event_visual_references(text[])
  from public, anon, authenticated;
revoke all on function public.routine_reference_storage_can_read(text)
  from public, anon, authenticated;

grant execute on function public.get_event_visual_references(text[])
  to authenticated;
grant execute on function public.routine_reference_storage_can_read(text)
  to authenticated;

notify pgrst, 'reload schema';

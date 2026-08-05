-- Phase 9K: complete, immutable multi-session Millum Stock Count exports.
-- Apply after Phase 9J. This additive terminal migration is repeatable.

create or replace function inventory_private.inventory_install_millum_profile_v2(
  input_organization_id uuid,
  input_actor_auth_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_source_profile public.inventory_millum_export_profiles%rowtype;
  v_profile public.inventory_millum_export_profiles%rowtype;
begin
  if input_organization_id is null then raise exception 'Organization is required for a Millum export profile.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('millum-profile-v2:' || input_organization_id::text, 0));

  select profile.* into v_profile
  from public.inventory_millum_export_profiles profile
  where profile.organization_id = input_organization_id
    and profile.profile_key = 'my-work-bar-jul'
    and profile.profile_version = 2;
  if v_profile.id is not null then
    if v_profile.status <> 'published'
       or v_profile.manifest_row_count <> 97
       or (select count(*) from public.inventory_millum_export_rows row where row.profile_id = v_profile.id) <> 97
       or (select count(*) from public.inventory_millum_export_rows row where row.profile_id = v_profile.id and row.enabled) <> 89
       or (select count(*) from inventory_private.inventory_millum_export_transforms transform where transform.profile_id = v_profile.id) <> 3 then
      raise exception 'Existing Millum export profile v2 is incomplete or inconsistent.';
    end if;
    return v_profile.id;
  end if;

  select profile.* into v_source_profile
  from public.inventory_millum_export_profiles profile
  where profile.organization_id = input_organization_id
    and profile.profile_key = 'my-work-bar-jul'
    and profile.profile_version = 1
    and profile.status = 'published';
  if v_source_profile.id is null then
    perform inventory_private.inventory_install_millum_profile_v1(input_organization_id, input_actor_auth_user_id);
    select profile.* into v_source_profile
    from public.inventory_millum_export_profiles profile
    where profile.organization_id = input_organization_id
      and profile.profile_key = 'my-work-bar-jul'
      and profile.profile_version = 1
      and profile.status = 'published';
  end if;
  if v_source_profile.id is null then raise exception 'Published Millum export profile v1 is required before v2.'; end if;

  insert into public.inventory_millum_export_profiles (
    organization_id, profile_key, profile_version, title, source_document,
    status, manifest_row_count, created_by_auth_user_id
  ) values (
    input_organization_id, 'my-work-bar-jul', 2, 'MY WORK-BAR JUL',
    v_source_profile.source_document || ' · complete multi-session count',
    'draft', 97, input_actor_auth_user_id
  ) returning * into v_profile;

  insert into public.inventory_millum_export_rows (
    profile_id, organization_id, row_key, group_name, group_order, row_order,
    item_number, occurrence, official_name, enabled, mapped_product_id
  )
  select v_profile.id, row.organization_id, row.row_key, row.group_name, row.group_order, row.row_order,
         row.item_number, row.occurrence, row.official_name, row.enabled, row.mapped_product_id
  from public.inventory_millum_export_rows row
  where row.profile_id = v_source_profile.id
  order by row.group_order, row.row_order;

  insert into inventory_private.inventory_millum_export_transforms (profile_id, row_key, operation, divisor)
  select v_profile.id, transform.row_key, transform.operation, transform.divisor
  from inventory_private.inventory_millum_export_transforms transform
  where transform.profile_id = v_source_profile.id;

  if (select count(*) from public.inventory_millum_export_rows row where row.profile_id = v_profile.id) <> 97
     or (select count(*) from public.inventory_millum_export_rows row where row.profile_id = v_profile.id and row.enabled) <> 89
     or (select count(*) from inventory_private.inventory_millum_export_transforms transform where transform.profile_id = v_profile.id) <> 3 then
    raise exception 'Millum export profile v2 failed manifest validation.';
  end if;
  update public.inventory_millum_export_profiles set status = 'published', published_at = now()
  where id = v_profile.id returning * into v_profile;
  return v_profile.id;
end;
$$;

create or replace function public.get_inventory_millum_export(input_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_session public.inventory_count_sessions%rowtype;
  v_profile public.inventory_millum_export_profiles%rowtype;
  v_snapshot public.inventory_millum_export_snapshots%rowtype;
  v_profile_id uuid;
  v_source_session_ids uuid[] := '{}'::uuid[];
  v_source_sessions jsonb := '[]'::jsonb;
  v_missing_locations jsonb := '[]'::jsonb;
  v_group record;
  v_row record;
  v_source record;
  v_extra record;
  v_transform record;
  v_groups jsonb := '[]'::jsonb;
  v_rows jsonb;
  v_diagnostics jsonb := '[]'::jsonb;
  v_mapping_diagnostics jsonb := '[]'::jsonb;
  v_notices jsonb := '[]'::jsonb;
  v_final numeric;
  v_state text;
  v_payload jsonb;
  v_source_digest text;
begin
  if not public.current_user_can_manage_inventory_config() or public.current_user_is_shared_device() then
    raise exception 'Active non-shared manager access is required for Millum exports.';
  end if;
  select * into v_actor from public.inventory_resolve_actor(null);
  select session.* into v_session from public.inventory_count_sessions session
  where session.id = input_session_id and session.organization_id = v_actor.organization_id for share;
  if v_session.id is null then raise exception 'Approved Stock Count not found for this organization.'; end if;
  if v_session.status <> 'approved' then raise exception 'Only approved immutable Stock Counts can be exported to Millum.'; end if;

  v_profile_id := inventory_private.inventory_install_millum_profile_v2(v_actor.organization_id, v_actor.actor_auth_user_id);
  select profile.* into v_profile from public.inventory_millum_export_profiles profile where profile.id = v_profile_id;
  select snapshot.* into v_snapshot from public.inventory_millum_export_snapshots snapshot
  where snapshot.session_id = v_session.id and snapshot.profile_id = v_profile.id;
  if v_snapshot.id is not null then
    return jsonb_set(v_snapshot.payload, '{snapshotId}', to_jsonb(v_snapshot.id), true);
  end if;

  with required_locations as (
    select location.id, location.name, location.sort_order
    from public.inventory_locations location
    where location.organization_id = v_actor.organization_id and location.active and location.countable
  ), ranked_sources as (
    select required.id as location_id, source_session.id as session_id,
           row_number() over (partition by required.id
             order by source_session.count_date desc, source_session.approved_at desc, source_session.id) as source_rank
    from required_locations required
    join public.inventory_count_lines line on line.location_id = required.id
    join public.inventory_count_sessions source_session on source_session.id = line.session_id
    where source_session.organization_id = v_actor.organization_id
      and source_session.status = 'approved'
      and source_session.count_type = v_session.count_type
      and source_session.approved_at <= v_session.approved_at
      and source_session.count_date between (v_session.count_date - 3) and v_session.count_date
  ), selected_sources as (
    select location_id, session_id from ranked_sources where source_rank = 1
  )
  select coalesce(array_agg(distinct selected.session_id order by selected.session_id), '{}'::uuid[]),
         coalesce(jsonb_agg(jsonb_build_object('locationId', required.id, 'locationName', required.name)
           order by required.sort_order, required.name) filter (where selected.session_id is null), '[]'::jsonb)
  into v_source_session_ids, v_missing_locations
  from required_locations required left join selected_sources selected on selected.location_id = required.id;
  if not (v_session.id = any(v_source_session_ids)) then v_source_session_ids := array_append(v_source_session_ids, v_session.id); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'sessionId', source_session.id,
    'sessionShortRef', upper(substr(replace(source_session.id::text, '-', ''), 1, 8)),
    'title', source_session.title, 'countDate', source_session.count_date,
    'approvedAt', source_session.approved_at, 'locations', source.locations
  ) order by source_session.count_date, source_session.approved_at, source_session.id), '[]'::jsonb)
  into v_source_sessions
  from public.inventory_count_sessions source_session
  join lateral (
    select jsonb_agg(distinct line.location_name_snapshot order by line.location_name_snapshot) as locations
    from public.inventory_count_lines line where line.session_id = source_session.id
  ) source on true
  where source_session.id = any(v_source_session_ids);

  for v_row in select row.* from public.inventory_millum_export_rows row
    where row.profile_id = v_profile.id and (not row.enabled or row.mapped_product_id is null)
    order by row.group_order, row.row_order
  loop
    v_mapping_diagnostics := v_mapping_diagnostics || jsonb_build_array(jsonb_build_object(
      'rowKey', v_row.row_key, 'group', v_row.group_name, 'rowOrder', v_row.row_order,
      'itemNumber', v_row.item_number, 'officialName', v_row.official_name,
      'enabled', v_row.enabled, 'mapped', v_row.mapped_product_id is not null,
      'message', case when not v_row.enabled then 'Disabled in export profile v2' else 'No stable product mapping' end));
  end loop;
  if jsonb_array_length(v_missing_locations) > 0 then
    v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object(
      'code', 'missing_location_source',
      'message', 'No approved monthly source count was found for every active countable location.',
      'locations', v_missing_locations));
  end if;

  for v_group in select row.group_name, row.group_order from public.inventory_millum_export_rows row
    where row.profile_id = v_profile.id and row.enabled
    group by row.group_name, row.group_order order by row.group_order
  loop
    v_rows := '[]'::jsonb;
    for v_row in select row.* from public.inventory_millum_export_rows row
      where row.profile_id = v_profile.id and row.enabled and row.group_order = v_group.group_order order by row.row_order
    loop
      v_source := null;
      select count(*)::integer as line_count,
             count(*) filter (where source.canonical_quantity is null)::integer as missing_count,
             sum(source.canonical_quantity) as canonical_quantity
      into v_source from (
        select case
          when line.count_mode_snapshot = 'container_plus_volume' then
            case when line.counted_whole_units is null or line.counted_open_volume_liters is null
                       or line.container_capacity_liters_snapshot is null or line.container_capacity_liters_snapshot <= 0
              then null else line.counted_whole_units + line.counted_open_volume_liters / line.container_capacity_liters_snapshot end
          when line.count_mode_snapshot = 'keg_fraction' then
            case when line.counted_full_kegs is null or line.counted_partial_keg_fraction is null
              then null else line.counted_full_kegs + line.counted_partial_keg_fraction end
          when line.count_mode_snapshot = 'case_plus_loose' then
            case when line.count_full_cases is null or line.count_loose_quantity is null
                       or line.case_size_snapshot is null or line.case_size_snapshot <= 0
              then null else line.count_full_cases * line.case_size_snapshot + line.count_loose_quantity end
          else line.counted_quantity end as canonical_quantity
        from public.inventory_count_lines line
        where line.session_id = any(v_source_session_ids) and line.product_id = v_row.mapped_product_id
      ) source;

      v_final := null;
      if v_row.mapped_product_id is null then
        v_state := 'unmapped';
        v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object(
          'code', 'unmapped_row', 'rowKey', v_row.row_key, 'itemNumber', v_row.item_number,
          'productName', v_row.official_name, 'message', 'Enabled Millum row has no stable product mapping.'));
      elsif coalesce(v_source.line_count, 0) = 0 or coalesce(v_source.missing_count, 0) > 0 or v_source.canonical_quantity is null then
        v_state := 'missing';
        v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object(
          'code', 'missing_quantity', 'rowKey', v_row.row_key, 'itemNumber', v_row.item_number,
          'productName', v_row.official_name, 'message', 'Approved source counts are missing a final physical quantity.'));
      else
        v_state := 'ready';
        select transform.operation, transform.divisor into v_transform
        from inventory_private.inventory_millum_export_transforms transform
        where transform.profile_id = v_profile.id and transform.row_key = v_row.row_key;
        v_final := case when v_transform.operation is null then v_source.canonical_quantity
          else inventory_private.inventory_millum_apply_transform(v_source.canonical_quantity, v_transform.operation, v_transform.divisor) end;
      end if;
      v_rows := v_rows || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'rowKey', v_row.row_key, 'rowOrder', v_row.row_order, 'itemNumber', v_row.item_number,
        'productName', v_row.official_name, 'state', v_state,
        'finalValueNumeric', v_final,
        'finalValue', case when v_final is null then null else inventory_private.inventory_millum_format_value(v_final) end)));
    end loop;
    v_groups := v_groups || jsonb_build_array(jsonb_build_object(
      'name', v_group.group_name, 'order', v_group.group_order, 'rows', v_rows));
  end loop;

  for v_extra in
    with source_values as (
      select line.product_id, max(line.product_name_snapshot) as product_name,
             max(product.millum_item_ref) as millum_item_ref,
             sum(case
               when line.count_mode_snapshot = 'container_plus_volume' then
                 case when line.counted_whole_units is null or line.counted_open_volume_liters is null
                            or line.container_capacity_liters_snapshot is null or line.container_capacity_liters_snapshot <= 0
                   then null else line.counted_whole_units + line.counted_open_volume_liters / line.container_capacity_liters_snapshot end
               when line.count_mode_snapshot = 'keg_fraction' then
                 case when line.counted_full_kegs is null or line.counted_partial_keg_fraction is null
                   then null else line.counted_full_kegs + line.counted_partial_keg_fraction end
               when line.count_mode_snapshot = 'case_plus_loose' then
                 case when line.count_full_cases is null or line.count_loose_quantity is null
                            or line.case_size_snapshot is null or line.case_size_snapshot <= 0
                   then null else line.count_full_cases * line.case_size_snapshot + line.count_loose_quantity end
               else line.counted_quantity end) as canonical_quantity
      from public.inventory_count_lines line
      left join public.inventory_products product on product.id = line.product_id and product.organization_id = line.organization_id
      where line.session_id = any(v_source_session_ids) group by line.product_id
    )
    select source.* from source_values source where not exists (
      select 1 from public.inventory_millum_export_rows row
      where row.profile_id = v_profile.id and row.enabled and row.mapped_product_id = source.product_id)
    order by source.product_name, source.product_id
  loop
    if v_extra.canonical_quantity is null or v_extra.canonical_quantity <> 0 then
      v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object(
        'code', 'counted_product_not_in_profile', 'productId', v_extra.product_id,
        'itemNumber', v_extra.millum_item_ref, 'productName', v_extra.product_name,
        'message', 'A non-zero Mesh product has no enabled row in Millum export profile v2.'));
    else
      v_notices := v_notices || jsonb_build_array(jsonb_build_object(
        'code', 'zero_product_not_in_profile', 'productId', v_extra.product_id,
        'itemNumber', v_extra.millum_item_ref, 'productName', v_extra.product_name,
        'message', 'A zero-count Mesh product is outside the published Millum entry order and does not block the export.'));
    end if;
  end loop;

  select md5(jsonb_build_object(
    'sessions', (select jsonb_agg(to_jsonb(source_session) order by source_session.id)
      from public.inventory_count_sessions source_session where source_session.id = any(v_source_session_ids)),
    'lines', (select jsonb_agg(to_jsonb(line) order by line.session_id, line.id)
      from public.inventory_count_lines line where line.session_id = any(v_source_session_ids)))::text)
  into v_source_digest;

  v_payload := jsonb_build_object(
    'snapshotId', null,
    'organizationName', (select organization.name from public.organizations organization where organization.id = v_actor.organization_id),
    'sessionId', v_session.id,
    'sessionShortRef', upper(substr(replace(v_session.id::text, '-', ''), 1, 8)),
    'sessionTitle', v_session.title, 'countDate', v_session.count_date, 'approvedAt', v_session.approved_at,
    'profileKey', v_profile.profile_key, 'profileVersion', v_profile.profile_version, 'profileTitle', v_profile.title,
    'ready', jsonb_array_length(v_diagnostics) = 0, 'groups', v_groups, 'diagnostics', v_diagnostics,
    'mappingDiagnostics', v_mapping_diagnostics, 'notices', v_notices, 'sourceSessions', v_source_sessions);

  -- A blocked preview must never become the permanent snapshot for an approved
  -- count. Persist only the first clean result, after every source gap is fixed.
  if jsonb_array_length(v_diagnostics) > 0 then
    return v_payload;
  end if;

  insert into public.inventory_millum_export_snapshots (
    organization_id, session_id, profile_id, profile_version, source_digest, payload, created_by_auth_user_id
  ) values (v_actor.organization_id, v_session.id, v_profile.id, v_profile.profile_version,
    v_source_digest, v_payload, v_actor.actor_auth_user_id)
  on conflict (session_id, profile_id) do nothing;
  select snapshot.* into v_snapshot from public.inventory_millum_export_snapshots snapshot
  where snapshot.session_id = v_session.id and snapshot.profile_id = v_profile.id;
  return jsonb_set(v_snapshot.payload, '{snapshotId}', to_jsonb(v_snapshot.id), true);
end;
$$;

revoke all on function public.get_inventory_millum_export(uuid) from public, anon, authenticated;
grant execute on function public.get_inventory_millum_export(uuid) to authenticated;
revoke all on function inventory_private.inventory_install_millum_profile_v2(uuid, uuid) from public, anon, authenticated;

do $$
declare v_organization record;
begin
  for v_organization in select distinct product.organization_id from public.inventory_products product
    where product.millum_item_ref is not null
  loop
    perform inventory_private.inventory_install_millum_profile_v2(v_organization.organization_id, null);
  end loop;
end;
$$;

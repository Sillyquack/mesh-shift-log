-- Phase 9N: build Millum exports from exactly the selected approved session.
-- Older/test sessions are never summed into the selected session. Explicit
-- audited carry-forwards remain session-scoped and approved count rows stay
-- immutable.

insert into inventory_private.inventory_millum_export_session_values (
  session_id, profile_id, row_key, final_value, source_label, reason
)
select session.id, profile.id, source.row_key, source.final_value,
  'MY Work-bar Jun_items-2.pdf', source.reason
from public.inventory_count_sessions session
join public.inventory_millum_export_profiles profile
  on profile.organization_id = session.organization_id
 and profile.profile_key = 'my-work-bar-jul'
 and profile.profile_version = 2
cross join (values
  ('hard-alcohol-01-410829-1', 1.4::numeric, 'Unchanged physical bottle count; no liter conversion.'),
  ('hard-alcohol-03-4398384-1', 0::numeric, 'Unchanged physical bottle count; explicit zero.'),
  ('hard-alcohol-04-2573491-1', 5.65::numeric, 'Unchanged physical bottle count; no liter conversion.'),
  ('hard-alcohol-06-1917681-1', 2.55::numeric, 'Unchanged physical bottle count; no liter conversion.'),
  ('hard-alcohol-07-4010017-1', 0.35::numeric, 'Unchanged physical bottle count; no liter conversion.'),
  ('hard-alcohol-08-6751127-1', 11.9::numeric, 'Unchanged physical bottle count; no liter conversion.'),
  ('hard-alcohol-09-9073145-1', 1.2::numeric, 'Unchanged physical bottle count; no liter conversion.'),
  ('hard-alcohol-10-4014146-1', 2.1::numeric, 'Unchanged physical bottle count; no liter conversion.'),
  ('hard-alcohol-11-585901-1', 6.85::numeric, 'Unchanged physical bottle count; no liter conversion.'),
  ('hard-alcohol-13-3366702-1', 1.9::numeric, 'Unchanged physical bottle count; no liter conversion.'),
  ('hard-alcohol-15-4014977-1', 0.8::numeric, 'Unchanged physical bottle count; no liter conversion.'),
  ('hard-alcohol-16-2295772-1', 0::numeric, 'Unchanged physical bottle count; explicit zero.'),
  ('hard-alcohol-18-564757-1', 3.5::numeric, 'Unchanged physical bottle count; no liter conversion.'),
  ('hard-alcohol-20-1287473-1', 3.45::numeric, 'Unchanged physical bottle count; no liter conversion.'),
  ('hard-alcohol-21-5834718-1', 1.4::numeric, 'Unchanged physical bottle count; no liter conversion.'),
  ('hard-alcohol-22-584888-1', 0.7::numeric, 'Unchanged physical bottle count; no liter conversion.'),
  ('hard-alcohol-24-4911236-1', 0.7::numeric, 'Unchanged physical bottle count; no liter conversion.'),
  ('hard-alcohol-25-4022359-1', 1.75::numeric, 'Unchanged physical bottle count; no liter conversion.'),
  ('hard-alcohol-26-1364918-1', 0.7::numeric, 'Unchanged physical bottle count; no liter conversion.'),
  ('hard-alcohol-27-8480010-1', 4.55::numeric, 'Unchanged physical bottle count; no liter conversion.'),
  ('hard-alcohol-28-8480014-1', 2.75::numeric, 'Unchanged physical bottle count; no liter conversion.'),
  ('hard-alcohol-29-8480017-1', 1::numeric, 'Unchanged audited key-keg count.'),
  ('hard-alcohol-30-4345955-1', 2.15::numeric, 'Unchanged physical bottle count; no liter conversion.'),
  ('hard-alcohol-31-4616173-1', 4.4::numeric, 'Unchanged physical bottle count; no liter conversion.'),
  ('hard-alcohol-32-4530804-1', 0.65::numeric, 'Unchanged physical bottle count; no liter conversion.'),
  ('hard-alcohol-34-4552915-1', 0.1::numeric, 'Unchanged physical bottle count; no liter conversion.'),
  ('hard-alcohol-35-5128517-1', 2.25::numeric, 'Unchanged physical bottle count; no liter conversion.'),
  ('hard-alcohol-36-9081401-1', 1.3::numeric, 'Unchanged physical bottle count; no liter conversion.'),
  ('wine-03-4057913-1', 3.75::numeric, 'Approved August physical total 225 converted to Millum units by 225 / 60.')
) source(row_key, final_value, reason)
where session.title = 'August stock count - Bar Shelves and Main Storage - 2026-08-04'
  and session.count_date = date '2026-08-04'
  and session.status = 'approved'
on conflict (session_id, profile_id, row_key) do update
set final_value = excluded.final_value,
    source_label = excluded.source_label,
    reason = excluded.reason;

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
  v_group record;
  v_row record;
  v_source record;
  v_extra record;
  v_override inventory_private.inventory_millum_export_session_values%rowtype;
  v_transform record;
  v_groups jsonb := '[]'::jsonb;
  v_rows jsonb;
  v_diagnostics jsonb := '[]'::jsonb;
  v_mapping_diagnostics jsonb := '[]'::jsonb;
  v_notices jsonb := '[]'::jsonb;
  v_final numeric;
  v_state text;
begin
  if not public.current_user_can_manage_inventory_config()
     or public.current_user_is_shared_device() then
    raise exception 'Active non-shared manager access is required for Millum exports.';
  end if;

  select * into v_actor from public.inventory_resolve_actor(null);
  select session.* into v_session
  from public.inventory_count_sessions session
  where session.id = input_session_id
    and session.organization_id = v_actor.organization_id
  for share;
  if v_session.id is null then
    raise exception 'Approved Stock Count not found for this organization.';
  end if;
  if v_session.status <> 'approved' then
    raise exception 'Only approved immutable Stock Counts can be exported to Millum.';
  end if;

  select profile.* into v_profile
  from public.inventory_millum_export_profiles profile
  where profile.organization_id = v_actor.organization_id
    and profile.profile_key = 'my-work-bar-jul'
    and profile.profile_version = 2
    and profile.status = 'published';
  if v_profile.id is null then raise exception 'Published Millum export profile v2 is required.'; end if;

  for v_group in
    select row.group_name, row.group_order
    from public.inventory_millum_export_rows row
    where row.profile_id = v_profile.id and row.enabled
    group by row.group_name, row.group_order
    order by row.group_order
  loop
    v_rows := '[]'::jsonb;
    for v_row in
      select row.* from public.inventory_millum_export_rows row
      where row.profile_id = v_profile.id and row.enabled
        and row.group_name = v_group.group_name
      order by row.row_order
    loop
      v_final := null;
      v_state := 'missing';
      select value.* into v_override
      from inventory_private.inventory_millum_export_session_values value
      where value.session_id = v_session.id
        and value.profile_id = v_profile.id
        and value.row_key = v_row.row_key;

      if v_override.row_key is not null then
        v_final := v_override.final_value;
        v_state := 'ready';
      elsif v_row.mapped_product_id is null then
        v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object(
          'code', 'unmapped_enabled_row', 'rowKey', v_row.row_key,
          'itemNumber', v_row.item_number, 'productName', v_row.official_name,
          'message', 'Enabled Millum row has no stable Mesh product mapping.'));
      else
        select count(*) as line_count,
               count(*) filter (where source.quantity is null) as missing_count,
               sum(source.quantity) as canonical_quantity
        into v_source
        from (
          select case
            when line.count_mode_snapshot = 'container_plus_volume' then
              case when line.counted_whole_units is null
                         or line.counted_open_volume_liters is null
                         or line.container_capacity_liters_snapshot is null
                         or line.container_capacity_liters_snapshot <= 0
                then null else line.counted_whole_units
                  + line.counted_open_volume_liters / line.container_capacity_liters_snapshot end
            when line.count_mode_snapshot = 'keg_fraction' then
              case when line.counted_full_kegs is null
                         or line.counted_partial_keg_fraction is null
                then null else line.counted_full_kegs + line.counted_partial_keg_fraction end
            when line.count_mode_snapshot = 'case_plus_loose' then
              case when line.count_full_cases is null
                         or line.count_loose_quantity is null
                         or line.case_size_snapshot is null
                         or line.case_size_snapshot <= 0
                then null else line.count_full_cases * line.case_size_snapshot
                  + line.count_loose_quantity end
            else line.counted_quantity
          end as quantity
          from public.inventory_count_lines line
          where line.session_id = v_session.id
            and line.product_id = v_row.mapped_product_id
        ) source;

        if coalesce(v_source.line_count, 0) = 0
           or coalesce(v_source.missing_count, 0) > 0
           or v_source.canonical_quantity is null then
          v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object(
            'code', 'missing_quantity', 'rowKey', v_row.row_key,
            'itemNumber', v_row.item_number, 'productName', v_row.official_name,
            'message', 'The selected approved session has no final physical quantity.'));
        else
          select transform.operation, transform.divisor into v_transform
          from inventory_private.inventory_millum_export_transforms transform
          where transform.profile_id = v_profile.id and transform.row_key = v_row.row_key;
          v_final := case when v_transform.operation is null
            then v_source.canonical_quantity
            else inventory_private.inventory_millum_apply_transform(
              v_source.canonical_quantity, v_transform.operation, v_transform.divisor) end;
          v_state := 'ready';
        end if;
      end if;

      v_rows := v_rows || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'rowKey', v_row.row_key, 'rowOrder', v_row.row_order,
        'itemNumber', v_row.item_number, 'productName', v_row.official_name,
        'state', v_state, 'finalValueNumeric', v_final,
        'finalValue', case when v_final is null then null
          else inventory_private.inventory_millum_format_value(v_final) end)));
    end loop;
    v_groups := v_groups || jsonb_build_array(jsonb_build_object(
      'name', v_group.group_name, 'order', v_group.group_order, 'rows', v_rows));
  end loop;

  for v_row in
    select row.* from public.inventory_millum_export_rows row
    where row.profile_id = v_profile.id and not row.enabled
    order by row.group_order, row.row_order
  loop
    v_mapping_diagnostics := v_mapping_diagnostics || jsonb_build_array(jsonb_build_object(
      'rowKey', v_row.row_key, 'group', v_row.group_name,
      'rowOrder', v_row.row_order, 'itemNumber', v_row.item_number,
      'officialName', v_row.official_name,
      'message', 'Disabled duplicate or cross-group manifest position; intentionally omitted.'));
  end loop;

  for v_extra in
    with source_values as (
      select line.product_id, max(line.product_name_snapshot) as product_name,
             max(product.millum_item_ref) as millum_item_ref,
             sum(coalesce(line.counted_quantity,
               line.counted_whole_units + line.counted_open_volume_liters
                 / nullif(line.container_capacity_liters_snapshot, 0),
               line.counted_full_kegs + line.counted_partial_keg_fraction,
               line.count_full_cases * line.case_size_snapshot + line.count_loose_quantity)) as quantity
      from public.inventory_count_lines line
      left join public.inventory_products product
        on product.id = line.product_id and product.organization_id = line.organization_id
      where line.session_id = v_session.id
      group by line.product_id
    )
    select source.* from source_values source
    where not exists (
      select 1 from public.inventory_millum_export_rows row
      where row.profile_id = v_profile.id and row.enabled
        and row.mapped_product_id = source.product_id)
    order by source.product_name, source.product_id
  loop
    if v_extra.quantity is null or v_extra.quantity <> 0 then
      v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object(
        'code', 'counted_product_not_in_profile', 'itemNumber', v_extra.millum_item_ref,
        'productName', v_extra.product_name,
        'message', 'A non-zero product in the selected session is absent from the Millum profile.'));
    else
      v_notices := v_notices || jsonb_build_array(jsonb_build_object(
        'code', 'zero_product_not_in_profile', 'itemNumber', v_extra.millum_item_ref,
        'productName', v_extra.product_name,
        'message', 'A zero-count product outside the Millum order does not block export.'));
    end if;
  end loop;

  return jsonb_build_object(
    'snapshotId', null,
    'organizationName', (select organization.name from public.organizations organization
      where organization.id = v_actor.organization_id),
    'sessionId', v_session.id,
    'sessionShortRef', upper(substr(replace(v_session.id::text, '-', ''), 1, 8)),
    'sessionTitle', v_session.title,
    'countDate', v_session.count_date,
    'approvedAt', v_session.approved_at,
    'profileKey', v_profile.profile_key,
    'profileVersion', v_profile.profile_version,
    'profileTitle', v_profile.title,
    'sourceRuleVersion', 3,
    'ready', jsonb_array_length(v_diagnostics) = 0,
    'groups', v_groups,
    'diagnostics', v_diagnostics,
    'mappingDiagnostics', v_mapping_diagnostics,
    'notices', v_notices,
    'sourceSessions', jsonb_build_array(jsonb_build_object(
      'sessionId', v_session.id,
      'sessionShortRef', upper(substr(replace(v_session.id::text, '-', ''), 1, 8)),
      'title', v_session.title,
      'countDate', v_session.count_date,
      'approvedAt', v_session.approved_at))
  );
end;
$$;

revoke all on function public.get_inventory_millum_export(uuid)
  from public, anon, authenticated;
grant execute on function public.get_inventory_millum_export(uuid) to authenticated;

do $$
begin
  if (select count(*)
      from public.inventory_count_sessions session
      where session.title = 'August stock count - Bar Shelves and Main Storage - 2026-08-04'
        and session.count_date = date '2026-08-04'
        and session.status = 'approved') <> 1 then
    raise exception 'Phase 9N requires exactly one authoritative approved August session.';
  end if;

  if (select count(*)
      from inventory_private.inventory_millum_export_session_values value
      join public.inventory_count_sessions session on session.id = value.session_id
      join public.inventory_millum_export_profiles profile on profile.id = value.profile_id
      where session.title = 'August stock count - Bar Shelves and Main Storage - 2026-08-04'
        and session.count_date = date '2026-08-04'
        and session.status = 'approved'
        and profile.profile_version = 2) <> 41 then
    raise exception 'Phase 9N requires exactly 41 audited session-specific values.';
  end if;

  if exists (
    select 1 from public.inventory_count_sessions session
    join public.inventory_count_lines line on line.session_id = session.id
    where session.title = 'August stock count - Bar Shelves and Main Storage - 2026-08-04'
      and session.count_date = date '2026-08-04'
      and session.status = 'approved'
    group by session.id having count(*) <> 138
  ) then
    raise exception 'Phase 9N must not alter the authoritative 138-line count.';
  end if;
end;
$$;

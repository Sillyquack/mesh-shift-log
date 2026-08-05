-- Phase 9P: explain every final Millum value without changing approved counts.
--
-- The Phase 9O function remains the authoritative value builder. This wrapper
-- adds manager-facing source, physical quantity, and calculation metadata to
-- each enabled row so a final value can be reviewed before PDF generation.

alter function public.get_inventory_millum_export(uuid)
  set schema inventory_private;
alter function inventory_private.get_inventory_millum_export(uuid)
  rename to get_inventory_millum_export_value_base;
revoke all on function inventory_private.get_inventory_millum_export_value_base(uuid)
  from public, anon, authenticated;

create or replace function public.get_inventory_millum_export(input_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_payload jsonb;
  v_profile public.inventory_millum_export_profiles%rowtype;
  v_profile_row public.inventory_millum_export_rows%rowtype;
  v_override inventory_private.inventory_millum_export_session_values%rowtype;
  v_group_index integer;
  v_row_index integer;
  v_row jsonb;
  v_physical numeric;
  v_actual_price numeric;
  v_millum_price numeric;
  v_source_kind text;
  v_source_label text;
  v_explanation text;
begin
  -- This private base enforces manager access, non-shared identity,
  -- organization ownership, approved state, single-session sourcing,
  -- diagnostics, and the protected wine value calculation before any audit
  -- metadata is added here.
  v_payload := inventory_private.get_inventory_millum_export_value_base(input_session_id);

  select profile.* into v_profile
  from public.inventory_millum_export_profiles profile
  where profile.profile_key = v_payload->>'profileKey'
    and profile.profile_version = (v_payload->>'profileVersion')::integer
    and profile.status = 'published'
    and profile.organization_id = (
      select session.organization_id
      from public.inventory_count_sessions session
      where session.id = input_session_id
    );
  if v_profile.id is null then
    raise exception 'Published Millum export profile not found for the approved count.';
  end if;

  for v_group_index in 0..jsonb_array_length(v_payload->'groups') - 1 loop
    for v_row_index in 0..jsonb_array_length(v_payload->'groups'->v_group_index->'rows') - 1 loop
      v_row := v_payload->'groups'->v_group_index->'rows'->v_row_index;
      v_profile_row := null;
      v_override := null;
      v_physical := null;
      v_actual_price := null;
      v_millum_price := null;

      select export_row.* into v_profile_row
      from public.inventory_millum_export_rows export_row
      where export_row.profile_id = v_profile.id
        and export_row.row_key = v_row->>'rowKey';

      if v_profile_row.mapped_product_id is not null then
        select sum(case
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
        end) into v_physical
        from public.inventory_count_lines line
        where line.session_id = input_session_id
          and line.product_id = v_profile_row.mapped_product_id;
      end if;

      select value.* into v_override
      from inventory_private.inventory_millum_export_session_values value
      where value.session_id = input_session_id
        and value.profile_id = v_profile.id
        and value.row_key = v_profile_row.row_key;

      select price.actual_purchase_price, price.millum_market_price
      into v_actual_price, v_millum_price
      from (values
        ('4000232'::text, 75::numeric, 111.89::numeric),
        ('4057913'::text, 100::numeric, 154::numeric),
        ('4004935'::text, 100::numeric, 208.87::numeric)
      ) price(item_number, actual_purchase_price, millum_market_price)
      where price.item_number = v_row->>'itemNumber';

      if v_actual_price is not null and v_physical is not null then
        v_source_kind := 'value_conversion';
        v_source_label := 'Physical count from selected approved session';
        v_explanation := format(
          '%s physical × %s NOK purchase price / %s NOK Millum price = %s',
          inventory_private.inventory_millum_format_value(v_physical),
          inventory_private.inventory_millum_format_value(v_actual_price),
          inventory_private.inventory_millum_format_value(v_millum_price),
          v_row->>'finalValue'
        );
      elsif v_override.row_key is not null then
        v_source_kind := 'audited_carry_forward';
        v_source_label := v_override.source_label;
        v_explanation := v_override.reason;
      elsif v_physical is not null then
        v_source_kind := 'selected_session';
        v_source_label := 'Physical count from selected approved session';
        v_explanation := format(
          'Physical count %s is used directly as the Millum value.',
          inventory_private.inventory_millum_format_value(v_physical)
        );
      else
        v_source_kind := 'unavailable';
        v_source_label := 'No physical source quantity';
        v_explanation := 'Resolve the blocking export diagnostic before generating the PDF.';
      end if;

      v_row := v_row || jsonb_strip_nulls(jsonb_build_object(
        'sourceKind', v_source_kind,
        'sourceLabel', v_source_label,
        'physicalValueNumeric', v_physical,
        'physicalValue', case when v_physical is null then null
          else inventory_private.inventory_millum_format_value(v_physical) end,
        'calculation', v_explanation
      ));
      v_payload := jsonb_set(
        v_payload,
        array['groups', v_group_index::text, 'rows', v_row_index::text],
        v_row,
        true
      );
    end loop;
  end loop;

  return jsonb_set(v_payload, '{exportAuditRuleVersion}', '1'::jsonb, true);
end;
$$;

revoke all on function public.get_inventory_millum_export(uuid)
  from public, anon, authenticated;
grant execute on function public.get_inventory_millum_export(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'inventory_private'
      and procedure.proname = 'get_inventory_millum_export_value_base'
      and procedure.prosecdef
  ) then
    raise exception 'Phase 9P requires the guarded Phase 9O value base.';
  end if;
end;
$$;

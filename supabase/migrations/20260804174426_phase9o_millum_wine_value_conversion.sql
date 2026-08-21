-- Phase 9O: correct the three protected wine exports to value-equivalent units.
--
-- Millum values these products at its market unit price, while Mesh counts
-- physical bottles bought at a lower actual unit price. The exported quantity
-- must therefore preserve inventory value:
--   physical bottles * actual purchase price / Millum market price
--
-- The approved count remains immutable. This wrapper recalculates only the
-- three protected wine rows from the selected session's physical quantities.

alter function public.get_inventory_millum_export(uuid)
  set schema inventory_private;
alter function inventory_private.get_inventory_millum_export(uuid)
  rename to get_inventory_millum_export_single_session_base;
revoke all on function inventory_private.get_inventory_millum_export_single_session_base(uuid)
  from public, anon, authenticated;

create or replace function public.get_inventory_millum_export(input_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_payload jsonb;
  v_wine record;
  v_group_index integer;
  v_row_index integer;
  v_row jsonb;
  v_physical numeric;
  v_final numeric;
begin
  -- The private base function enforces manager access, organization ownership,
  -- approved-session status, single-session sourcing, and all diagnostics.
  v_payload := inventory_private.get_inventory_millum_export_single_session_base(input_session_id);

  for v_wine in
    select *
    from (values
      ('4000232'::text, 75::numeric, 111.89::numeric),
      ('4057913'::text, 100::numeric, 154::numeric),
      ('4004935'::text, 100::numeric, 208.87::numeric)
    ) as wine(item_number, actual_purchase_price, millum_market_price)
  loop
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
    end)
    into v_physical
    from public.inventory_count_lines line
    join public.inventory_products product
      on product.id = line.product_id
     and product.organization_id = line.organization_id
    where line.session_id = input_session_id
      and product.millum_item_ref = v_wine.item_number;

    if v_physical is null then
      continue;
    end if;

    v_final := round(
      v_physical * v_wine.actual_purchase_price / v_wine.millum_market_price,
      2
    );

    for v_group_index in 0..jsonb_array_length(v_payload->'groups') - 1 loop
      for v_row_index in 0..jsonb_array_length(v_payload->'groups'->v_group_index->'rows') - 1 loop
        v_row := v_payload->'groups'->v_group_index->'rows'->v_row_index;
        if v_row->>'itemNumber' = v_wine.item_number then
          v_row := jsonb_set(v_row, '{state}', '"ready"'::jsonb, true);
          v_row := jsonb_set(v_row, '{finalValueNumeric}', to_jsonb(v_final), true);
          v_row := jsonb_set(
            v_row,
            '{finalValue}',
            to_jsonb(inventory_private.inventory_millum_format_value(v_final)),
            true
          );
          v_payload := jsonb_set(
            v_payload,
            array['groups', v_group_index::text, 'rows', v_row_index::text],
            v_row,
            true
          );
        end if;
      end loop;
    end loop;
  end loop;

  return jsonb_set(v_payload, '{wineValueRuleVersion}', '1'::jsonb, true);
end;
$$;

revoke all on function public.get_inventory_millum_export(uuid)
  from public, anon, authenticated;
grant execute on function public.get_inventory_millum_export(uuid) to authenticated;

do $$
begin
  if (select count(*) from public.inventory_count_sessions session
      where session.title = 'August stock count - Bar Shelves and Main Storage - 2026-08-04'
        and session.count_date = date '2026-08-04'
        and session.status = 'approved') <> 1 then
    raise exception 'Phase 9O requires exactly one authoritative approved August session.';
  end if;

  if exists (
    select 1 from public.inventory_count_sessions session
    join public.inventory_count_lines line on line.session_id = session.id
    where session.title = 'August stock count - Bar Shelves and Main Storage - 2026-08-04'
      and session.count_date = date '2026-08-04'
      and session.status = 'approved'
    group by session.id having count(*) <> 138
  ) then
    raise exception 'Phase 9O must not alter the authoritative 138-line count.';
  end if;
end;
$$;

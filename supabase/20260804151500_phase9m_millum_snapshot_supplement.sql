-- Phase 9M: apply audited carry-forward values even when a blocked v2 export
-- snapshot was created before the carry-forward rows existed.
-- Approved count sessions and count lines remain immutable.

-- Complete the prior physical-count carry-forward. These two rows were present
-- in Youngs_stocktaking_Millum_tydelig.xlsx but were not included in Phase 9L.
insert into inventory_private.inventory_millum_export_session_values (
  session_id, profile_id, row_key, final_value, source_label, reason
)
select session.id, profile.id, source.row_key, source.final_value,
  'Youngs_stocktaking_Millum_tydelig.xlsx', 'Unchanged from prior physical count.'
from public.inventory_count_sessions session
join public.inventory_millum_export_profiles profile
  on profile.organization_id = session.organization_id
 and profile.profile_key = 'my-work-bar-jul'
 and profile.profile_version = 2
cross join (values
  ('sodas-12-4014701-1', 22::numeric),
  ('sodas-23-4030686-1', 9::numeric)
) source(row_key, final_value)
where session.title = 'August stock count - Bar Shelves and Main Storage - 2026-08-04'
  and session.count_date = date '2026-08-04'
  and session.status = 'approved'
on conflict (session_id, profile_id, row_key) do update
set final_value = excluded.final_value,
    source_label = excluded.source_label,
    reason = excluded.reason;

-- Future counts collect both products physically instead of carrying them.
insert into public.inventory_location_products (
  organization_id, location_id, product_id, par_quantity, count_order,
  active, notes, stock_policy, contributes_to_storage_target
)
select location.organization_id, location.id, product.id, 0, source.count_order,
  true, 'Required physical line for complete Millum monthly export.',
  'physical_count_only', false
from public.inventory_locations location
join public.inventory_products product on product.organization_id = location.organization_id
join (values
  ('4014701', 36),
  ('4030686', 37)
) source(millum_item_ref, count_order) on source.millum_item_ref = product.millum_item_ref
where upper(trim(location.code)) = 'MAIN_STORAGE'
on conflict (location_id, product_id) do update
set active = true,
    par_quantity = 0,
    count_order = excluded.count_order,
    notes = excluded.notes,
    stock_policy = 'physical_count_only',
    contributes_to_storage_target = false,
    updated_at = now();

-- Preserve the Phase 9L function, including all authorization checks, then
-- supplement its payload after it reads any earlier immutable snapshot.
alter function public.get_inventory_millum_export(uuid)
  set schema inventory_private;
alter function inventory_private.get_inventory_millum_export(uuid)
  rename to get_inventory_millum_export_v2_carry_base;
revoke all on function inventory_private.get_inventory_millum_export_v2_carry_base(uuid)
  from public, anon, authenticated;

create or replace function public.get_inventory_millum_export(input_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_payload jsonb;
  v_override inventory_private.inventory_millum_export_session_values%rowtype;
  v_row jsonb;
  v_group_index integer;
  v_row_index integer;
  v_diagnostics jsonb;
begin
  -- The private function enforces active non-shared manager access,
  -- organization ownership, and approved-session status.
  v_payload := inventory_private.get_inventory_millum_export_v2_carry_base(input_session_id);

  for v_override in
    select value.*
    from inventory_private.inventory_millum_export_session_values value
    where value.session_id = input_session_id
    order by value.row_key
  loop
    for v_group_index in 0..jsonb_array_length(v_payload->'groups') - 1 loop
      for v_row_index in 0..jsonb_array_length(v_payload->'groups'->v_group_index->'rows') - 1 loop
        v_row := v_payload->'groups'->v_group_index->'rows'->v_row_index;
        if v_row->>'rowKey' = v_override.row_key and v_row->>'state' = 'missing' then
          v_row := jsonb_set(v_row, '{state}', '"ready"'::jsonb, true);
          v_row := jsonb_set(v_row, '{finalValueNumeric}', to_jsonb(v_override.final_value), true);
          v_row := jsonb_set(
            v_row,
            '{finalValue}',
            to_jsonb(inventory_private.inventory_millum_format_value(v_override.final_value)),
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

  select coalesce(jsonb_agg(diagnostic order by ordinal), '[]'::jsonb)
  into v_diagnostics
  from jsonb_array_elements(coalesce(v_payload->'diagnostics', '[]'::jsonb))
    with ordinality as item(diagnostic, ordinal)
  where not (
    diagnostic->>'code' = 'missing_quantity'
    and exists (
      select 1
      from inventory_private.inventory_millum_export_session_values value
      where value.session_id = input_session_id
        and value.row_key = diagnostic->>'rowKey'
    )
  );

  v_payload := jsonb_set(v_payload, '{diagnostics}', v_diagnostics, true);
  v_payload := jsonb_set(v_payload, '{ready}', to_jsonb(jsonb_array_length(v_diagnostics) = 0), true);
  v_payload := jsonb_set(v_payload, '{supplementVersion}', '1'::jsonb, true);
  return v_payload;
end;
$$;

revoke all on function public.get_inventory_millum_export(uuid)
  from public, anon, authenticated;
grant execute on function public.get_inventory_millum_export(uuid) to authenticated;

do $$
begin
  if (select count(*) from inventory_private.inventory_millum_export_session_values value
      join public.inventory_count_sessions session on session.id = value.session_id
      where session.title = 'August stock count - Bar Shelves and Main Storage - 2026-08-04'
        and session.count_date = date '2026-08-04'
        and session.status = 'approved') <> 12 then
    raise exception 'Phase 9M requires exactly twelve audited August carry-forward values.';
  end if;

  if exists (
    select 1
    from public.inventory_count_sessions session
    join public.inventory_count_lines line on line.session_id = session.id
    where session.title = 'August stock count - Bar Shelves and Main Storage - 2026-08-04'
      and session.count_date = date '2026-08-04'
      and session.status = 'approved'
    group by session.id
    having count(*) <> 138
  ) then
    raise exception 'Phase 9M must not alter the approved 138-line August count.';
  end if;
end;
$$;

-- Phase 9E: make stable product identity available to every Stock Count client path.
-- This terminal layer is intentionally repeatable and performs no historical backfill.

do $$
declare
  v_invalid_line_ids text;
begin
  select string_agg(line.id::text, ', ' order by line.id)
  into v_invalid_line_ids
    from public.inventory_count_lines line
    left join public.inventory_products product
      on product.id = line.product_id
     and product.organization_id = line.organization_id
    where line.product_id is null or product.id is null;
  if v_invalid_line_ids is not null then
    raise exception using
      message = 'Phase 9E cannot expose stable product identity because these legacy count lines contain a missing or cross-organization product reference: ' || v_invalid_line_ids,
      hint = 'Repair each count line from authoritative source records. Do not infer identity from product name or unit snapshots.';
  end if;
end;
$$;

create or replace function public.inventory_count_line_client_record(input_line_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_line public.inventory_count_lines%rowtype;
begin
  select line.* into v_line
  from public.inventory_count_lines line
  where line.id = input_line_id
    and line.organization_id = public.current_user_organization_id()
    and public.inventory_session_is_visible(line.session_id);
  if v_line.id is null then
    raise exception 'Inventory count line was not found or is not available.';
  end if;
  return jsonb_build_object(
    'id', v_line.id,
    'location_id', v_line.location_id,
    'product_id', v_line.product_id,
    'product_name_snapshot', v_line.product_name_snapshot,
    'location_name_snapshot', v_line.location_name_snapshot,
    'unit_label_snapshot', v_line.unit_label_snapshot,
    'category_snapshot', v_line.category_snapshot,
    'location_sort_order_snapshot', v_line.location_sort_order_snapshot,
    'count_order_snapshot', v_line.count_order_snapshot,
    'product_sort_order_snapshot', v_line.product_sort_order_snapshot,
    'par_quantity_snapshot', v_line.par_quantity_snapshot,
    'minimum_quantity_snapshot', v_line.minimum_quantity_snapshot,
    'stock_policy_snapshot', v_line.stock_policy_snapshot,
    'target_mode_snapshot', v_line.target_mode_snapshot,
    'effective_target_quantity_snapshot', v_line.effective_target_quantity_snapshot,
    'service_target_basis_snapshot', v_line.service_target_basis_snapshot,
    'reserve_multiplier_snapshot', v_line.reserve_multiplier_snapshot,
    'case_size_snapshot', v_line.case_size_snapshot,
    'target_cases_snapshot', v_line.target_cases_snapshot,
    'target_loose_quantity_snapshot', v_line.target_loose_quantity_snapshot,
    'physical_recount_interval_days_snapshot', v_line.physical_recount_interval_days_snapshot,
    'previous_physical_count_quantity_snapshot', v_line.previous_physical_count_quantity_snapshot,
    'previous_physical_counted_at_snapshot', v_line.previous_physical_counted_at_snapshot,
    'count_full_cases', v_line.count_full_cases,
    'count_loose_quantity', v_line.count_loose_quantity,
    'counted_quantity', v_line.counted_quantity,
    'count_method', v_line.count_method,
    'count_status', v_line.count_status,
    'variance_quantity', v_line.variance_quantity,
    'restock_quantity', v_line.restock_quantity,
    'note', v_line.note,
    'counted_at', v_line.counted_at,
    'counted_by_name', v_line.counted_by_name,
    'updated_at', v_line.updated_at
  );
end;
$$;

-- Keep direct count-line reads explicit: stable product identity is safe to expose,
-- while organization and RLS continue to bound rows and all mutations remain RPC-only.
revoke all privileges on table public.inventory_count_lines from authenticated;
grant select (
  id, organization_id, session_id, location_id, product_id,
  product_name_snapshot, location_name_snapshot, unit_label_snapshot,
  category_snapshot, location_sort_order_snapshot, count_order_snapshot,
  product_sort_order_snapshot, par_quantity_snapshot, minimum_quantity_snapshot,
  stock_policy_snapshot, target_mode_snapshot, effective_target_quantity_snapshot,
  service_target_basis_snapshot, reserve_multiplier_snapshot, case_size_snapshot,
  target_cases_snapshot, target_loose_quantity_snapshot,
  physical_recount_interval_days_snapshot,
  previous_physical_count_quantity_snapshot, previous_physical_counted_at_snapshot,
  count_full_cases, count_loose_quantity, counted_quantity, count_method,
  count_status, variance_quantity, restock_quantity, note, counted_at,
  counted_by_name, updated_at
) on table public.inventory_count_lines to authenticated;

-- The sanitized line helper is internal to guarded mutation RPCs, not a Data API endpoint.
revoke all on function public.inventory_count_line_client_record(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';

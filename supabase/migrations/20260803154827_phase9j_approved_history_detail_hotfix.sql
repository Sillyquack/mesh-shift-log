-- Manager history detail is returned atomically so the UI never combines a
-- privileged session record with a separately authorized or delayed line read.
-- The SECURITY DEFINER boundary is intentionally narrow: the existing manager-
-- only visibility helper runs before any row is returned, and every line is
-- constrained to the authenticated manager's organization and session.
create or replace function public.get_inventory_manager_count_session_detail(input_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_organization_id uuid;
  v_session jsonb;
  v_lines jsonb := '[]'::jsonb;
begin
  if not public.inventory_session_is_visible(input_session_id) then
    raise exception 'Inventory count session was not found or is not available.';
  end if;

  v_organization_id := public.current_user_organization_id();
  v_session := public.get_inventory_count_session_record(input_session_id);

  select coalesce(
    jsonb_agg(
      public.inventory_count_line_client_record(line.id)
      || jsonb_build_object(
        'historical_suggestion_quantity_snapshot', line.historical_suggestion_quantity_snapshot,
        'historical_suggestion_note_snapshot', line.historical_suggestion_note_snapshot,
        'historical_suggestion_source_snapshot', line.historical_suggestion_source_snapshot,
        'storage_rule_version_snapshot', line.storage_rule_version_snapshot
      )
      order by
        line.location_sort_order_snapshot,
        line.location_name_snapshot,
        line.count_order_snapshot,
        line.product_sort_order_snapshot,
        line.product_name_snapshot,
        line.id
    ),
    '[]'::jsonb
  )
  into v_lines
  from public.inventory_count_lines line
  where line.session_id = input_session_id
    and line.organization_id = v_organization_id;

  return jsonb_build_object('session', v_session, 'lines', v_lines);
end;
$$;

revoke all on function public.get_inventory_manager_count_session_detail(uuid)
  from public, anon, authenticated;
grant execute on function public.get_inventory_manager_count_session_detail(uuid)
  to authenticated;

notify pgrst, 'reload schema';

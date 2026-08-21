-- Phase 9G-C: mobile counter workspace support. Apply after Phase 9G-B2.
-- This terminal layer is repeatable and changes no table grants or write paths.

create or replace function public.get_inventory_counter_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_assignments jsonb;
begin
  select * into v_actor from public.inventory_resolve_counter();
  select coalesce(jsonb_agg(assignment_record order by assignment_record->'location'->>'name'), '[]'::jsonb)
  into v_assignments
  from (
    select jsonb_build_object(
      'id', assignment.id,
      'state', assignment.state,
      'revision', assignment.revision,
      'assigned_at', assignment.assigned_at,
      'submitted_at', assignment.submitted_at,
      'returned_at', assignment.returned_at,
      'accepted_at', assignment.accepted_at,
      'return_message', assignment.return_message,
      'session', jsonb_build_object(
        'id', session.id,
        'title', session.title,
        'count_date', session.count_date,
        'status', session.status,
        'updated_at', session.updated_at
      ),
      'location', jsonb_build_object('id', location.id, 'name', location.name),
      'lines', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', line.id,
          'location_id', line.location_id,
          'product_id', line.product_id,
          'product_name_snapshot', line.product_name_snapshot,
          'practical_name', product.short_name,
          'millum_item_ref', product.millum_item_ref,
          'unit_label_snapshot', line.unit_label_snapshot,
          'category_snapshot', line.category_snapshot,
          'count_order_snapshot', line.count_order_snapshot,
          'product_sort_order_snapshot', line.product_sort_order_snapshot,
          'standard_quantity', line.par_quantity_snapshot,
          'count_mode_snapshot', line.count_mode_snapshot,
          'container_capacity_liters_snapshot', line.container_capacity_liters_snapshot,
          'counted_whole_units', line.counted_whole_units,
          'counted_open_volume_liters', line.counted_open_volume_liters,
          'counted_full_kegs', line.counted_full_kegs,
          'counted_partial_keg_fraction', line.counted_partial_keg_fraction,
          'counted_quantity', line.counted_quantity,
          'count_method', line.count_method,
          'count_status', line.count_status,
          'note', line.note,
          'counted_at', line.counted_at,
          'counted_by_name', line.counted_by_name,
          'updated_at', line.updated_at
        ) order by line.count_order_snapshot, line.product_sort_order_snapshot, line.product_name_snapshot), '[]'::jsonb)
        from public.inventory_count_lines line
        join public.inventory_products product
          on product.id = line.product_id and product.organization_id = line.organization_id
        where line.session_id = assignment.session_id
          and line.location_id = assignment.location_id
          and line.organization_id = assignment.organization_id
      )
    ) assignment_record
    from public.inventory_count_assignments assignment
    join public.inventory_count_sessions session
      on session.id = assignment.session_id and session.organization_id = assignment.organization_id
    join public.inventory_locations location
      on location.id = assignment.location_id and location.organization_id = assignment.organization_id
    where assignment.organization_id = v_actor.organization_id
      and assignment.counter_membership_id = v_actor.membership_id
      and assignment.state <> 'superseded'
      and session.status in ('draft', 'in_progress')
  ) scoped;
  return jsonb_build_object('assignments', v_assignments, 'refreshed_at', now());
end;
$$;

revoke all on function public.get_inventory_counter_workspace() from public, anon, authenticated;
grant execute on function public.get_inventory_counter_workspace() to authenticated;

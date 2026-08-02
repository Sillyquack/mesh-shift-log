-- Phase 9H: scope new Stock Count sessions to operational refrigerators that
-- have at least one active persisted default for an active product.
-- Apply after Phase 9G-D. This function-only migration is repeatable.

create or replace function public.create_inventory_count_session(
  input_title text,
  input_count_type text,
  input_idempotency_key uuid,
  input_count_date date default null,
  input_location_ids uuid[] default null,
  input_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_session public.inventory_count_sessions%rowtype;
  v_line_count integer := 0;
  v_location_count integer := 0;
  v_location_id uuid;
  v_selected_location_ids uuid[];
  v_title text := nullif(trim(coalesce(input_title, '')), '');
  v_type text := lower(trim(coalesce(input_count_type, '')));
begin
  if not public.current_user_can_coordinate_inventory() then
    raise exception 'Manager access is required to start a Stock Count.';
  end if;
  select * into v_actor from public.inventory_resolve_actor(null);
  if input_idempotency_key is null then raise exception 'A Stock Count idempotency key is required.'; end if;
  if v_title is null then raise exception 'Count session title is required.'; end if;
  if v_type not in ('opening', 'closing', 'daily', 'weekly', 'monthly', 'ad_hoc', 'event', 'other') then
    raise exception 'Choose a valid stock count type.';
  end if;
  if input_location_ids is not null and cardinality(input_location_ids) = 0 then
    raise exception 'Choose at least one eligible refrigerator.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('inventory-active:' || v_actor.organization_id::text, 0));
  select session.* into v_session
  from public.inventory_count_sessions session
  where session.organization_id = v_actor.organization_id
    and session.idempotency_key = input_idempotency_key;
  if v_session.id is not null then
    select count(*), count(distinct line.location_id)
    into v_line_count, v_location_count
    from public.inventory_count_lines line where line.session_id = v_session.id;
    return jsonb_build_object(
      'session', public.get_inventory_count_session_record(v_session.id),
      'summary', jsonb_build_object('lineCount', v_line_count, 'locationCount', v_location_count),
      'idempotentReplay', true
    );
  end if;

  if input_location_ids is null then
    select array_agg(eligible.id order by eligible.id)
    into v_selected_location_ids
    from (
      select distinct location.id
      from public.inventory_locations location
      join public.inventory_refrigerator_templates template
        on template.location_id = location.id
       and template.organization_id = location.organization_id
      join public.inventory_location_products standard
        on standard.location_id = location.id
       and standard.organization_id = location.organization_id
       and standard.active = true
      join public.inventory_products product
        on product.id = standard.product_id
       and product.organization_id = standard.organization_id
       and product.active = true
      where location.organization_id = v_actor.organization_id
        and location.active = true
        and location.location_type = 'fridge'
        and public.inventory_phase9g_is_refrigerator(location.id, location.organization_id)
    ) eligible;
  else
    select array_agg(selected.id order by selected.id)
    into v_selected_location_ids
    from (select distinct unnest(input_location_ids) as id) selected;
  end if;

  if coalesce(cardinality(v_selected_location_ids), 0) = 0 then
    raise exception 'Choose at least one eligible refrigerator with active defaults.';
  end if;

  foreach v_location_id in array v_selected_location_ids
  loop
    -- Lock every row that establishes eligibility so concurrent configuration
    -- changes cannot turn a validated selection into an empty session scope.
    perform 1
    from public.inventory_locations location
    join public.inventory_refrigerator_templates template
      on template.location_id = location.id
     and template.organization_id = location.organization_id
    join public.inventory_location_products standard
      on standard.location_id = location.id
     and standard.organization_id = location.organization_id
     and standard.active = true
    join public.inventory_products product
      on product.id = standard.product_id
     and product.organization_id = standard.organization_id
     and product.active = true
    where location.id = v_location_id
      and location.organization_id = v_actor.organization_id
      and location.active = true
      and location.location_type = 'fridge'
      and public.inventory_phase9g_is_refrigerator(location.id, location.organization_id)
    for share of location, template, standard, product;
    if not found then
      raise exception 'Every selected location must be an eligible refrigerator with active defaults in this organization.';
    end if;
  end loop;

  if exists (
    select 1 from public.inventory_count_sessions session
    where session.organization_id = v_actor.organization_id
      and session.status in ('draft', 'in_progress', 'completed')
  ) then
    raise exception using errcode = 'P0001', message = 'This organization already has an active Stock Count. Complete and approve or cancel it before starting another.';
  end if;

  insert into public.inventory_count_sessions (
    organization_id, title, count_type, status, count_date, idempotency_key,
    started_by_auth_user_id, started_by_name, metadata
  ) values (
    v_actor.organization_id, v_title, v_type, 'in_progress',
    coalesce(input_count_date, (now() at time zone 'Europe/Oslo')::date), input_idempotency_key,
    v_actor.actor_auth_user_id, v_actor.actor_name,
    jsonb_strip_nulls(jsonb_build_object('startNote', nullif(trim(coalesce(input_note, '')), '')))
  ) returning * into v_session;

  insert into public.inventory_count_lines (
    organization_id, session_id, location_id, product_id,
    product_name_snapshot, location_name_snapshot, unit_label_snapshot,
    category_snapshot, location_sort_order_snapshot, count_order_snapshot,
    product_sort_order_snapshot, par_quantity_snapshot, minimum_quantity_snapshot,
    stock_policy_snapshot, target_mode_snapshot, effective_target_quantity_snapshot,
    service_target_basis_snapshot, reserve_multiplier_snapshot, case_size_snapshot,
    target_cases_snapshot, target_loose_quantity_snapshot,
    physical_recount_interval_days_snapshot, previous_verified_count_line_id,
    previous_physical_count_quantity_snapshot, previous_physical_counted_at_snapshot
  )
  select standard.organization_id, v_session.id, standard.location_id, standard.product_id,
    product.name, location.name, product.unit_label, product.category,
    location.sort_order, standard.count_order, product.sort_order,
    coalesce(target.effective_target_quantity, 0), standard.minimum_quantity,
    standard.stock_policy, standard.target_mode, target.effective_target_quantity,
    target.service_target_basis, standard.reserve_multiplier, standard.case_size,
    standard.target_cases, standard.target_loose_quantity,
    standard.physical_recount_interval_days, previous.id,
    previous.counted_quantity, previous.counted_at
  from public.inventory_location_products standard
  join public.inventory_products product
    on product.id = standard.product_id
   and product.organization_id = standard.organization_id
   and product.active = true
  join public.inventory_locations location
    on location.id = standard.location_id
   and location.organization_id = standard.organization_id
   and location.active = true
  join public.inventory_refrigerator_templates template
    on template.location_id = location.id
   and template.organization_id = location.organization_id
  cross join lateral public.inventory_stock_policy_target(standard.id) target
  left join lateral (
    select old_line.id, old_line.counted_quantity, old_line.counted_at
    from public.inventory_count_lines old_line
    join public.inventory_count_sessions old_session
      on old_session.id = old_line.session_id
     and old_session.organization_id = old_line.organization_id
     and old_session.status in ('completed', 'approved')
    where old_line.organization_id = standard.organization_id
      and old_line.location_id = standard.location_id
      and old_line.product_id = standard.product_id
      and old_line.count_method in ('manual', 'imported', 'adjusted')
      and old_line.count_status = 'counted'
      and old_line.counted_quantity is not null
      and old_line.counted_at is not null
    order by old_line.counted_at desc, old_line.id desc limit 1
  ) previous on standard.stock_policy = 'verify_unchanged'
  where standard.organization_id = v_actor.organization_id
    and standard.active = true
    and standard.location_id = any(v_selected_location_ids)
  order by location.sort_order, location.name, standard.count_order, product.sort_order, product.name;
  get diagnostics v_line_count = row_count;
  if v_line_count = 0 then raise exception 'No active inventory products are configured for the selected refrigerators.'; end if;
  select count(distinct line.location_id) into v_location_count
  from public.inventory_count_lines line where line.session_id = v_session.id;
  if v_location_count <> cardinality(v_selected_location_ids) then
    raise exception 'Every selected refrigerator must create at least one Stock Count line.';
  end if;
  return jsonb_build_object(
    'session', public.get_inventory_count_session_record(v_session.id),
    'summary', jsonb_build_object('lineCount', v_line_count, 'locationCount', v_location_count),
    'idempotentReplay', false
  );
end;
$$;

revoke all on function public.create_inventory_count_session(text, text, uuid, date, uuid[], text)
from public, anon, authenticated;
grant execute on function public.create_inventory_count_session(text, text, uuid, date, uuid[], text)
to authenticated;

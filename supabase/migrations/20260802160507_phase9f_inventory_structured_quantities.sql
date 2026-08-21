-- Phase 9F: exact, structured Stock Count quantities.
-- Terminal after Phase 9E. This layer classifies legacy rows as unit counts without
-- changing any target, canonical count, approved row, or historical display label.

do $$
declare
  v_invalid text;
begin
  select string_agg(problem, '; ' order by problem) into v_invalid
  from (
    select 'count line ' || line.id || ' has a missing or cross-organization product' as problem
    from public.inventory_count_lines line
    left join public.inventory_products product
      on product.id = line.product_id and product.organization_id = line.organization_id
    where line.product_id is null or product.id is null
    union all
    select 'standard ' || standard.id || ' has a cross-organization product or location'
    from public.inventory_location_products standard
    left join public.inventory_products product
      on product.id = standard.product_id and product.organization_id = standard.organization_id
    left join public.inventory_locations location
      on location.id = standard.location_id and location.organization_id = standard.organization_id
    where product.id is null or location.id is null
    union all
    select 'product ' || product.id || ' has a non-finite default pack size'
    from public.inventory_products product
    where product.default_pack_size is not null
      and product.default_pack_size::text in ('NaN', 'Infinity', '-Infinity')
    union all
    select 'standard ' || standard.id || ' has a non-finite quantity'
    from public.inventory_location_products standard
    where standard.par_quantity::text in ('NaN', 'Infinity', '-Infinity')
       or standard.minimum_quantity::text in ('NaN', 'Infinity', '-Infinity')
       or standard.default_restock_quantity::text in ('NaN', 'Infinity', '-Infinity')
       or standard.reserve_multiplier::text in ('NaN', 'Infinity', '-Infinity')
       or standard.case_size::text in ('NaN', 'Infinity', '-Infinity')
       or standard.target_loose_quantity::text in ('NaN', 'Infinity', '-Infinity')
    union all
    select 'count line ' || line.id || ' has a non-finite quantity'
    from public.inventory_count_lines line
    where line.par_quantity_snapshot::text in ('NaN', 'Infinity', '-Infinity')
       or line.minimum_quantity_snapshot::text in ('NaN', 'Infinity', '-Infinity')
       or line.effective_target_quantity_snapshot::text in ('NaN', 'Infinity', '-Infinity')
       or line.service_target_basis_snapshot::text in ('NaN', 'Infinity', '-Infinity')
       or line.reserve_multiplier_snapshot::text in ('NaN', 'Infinity', '-Infinity')
       or line.case_size_snapshot::text in ('NaN', 'Infinity', '-Infinity')
       or line.target_loose_quantity_snapshot::text in ('NaN', 'Infinity', '-Infinity')
       or line.count_loose_quantity::text in ('NaN', 'Infinity', '-Infinity')
       or line.counted_quantity::text in ('NaN', 'Infinity', '-Infinity')
    union all
    select 'count line ' || line.id || ' has contradictory protected-reserve case components'
    from public.inventory_count_lines line
    where (line.count_full_cases is null) <> (line.count_loose_quantity is null)
       or (line.count_full_cases is not null and (
         line.stock_policy_snapshot <> 'protected_event_reserve'
         or line.case_size_snapshot is null
         or line.counted_quantity is distinct from line.count_full_cases * line.case_size_snapshot + line.count_loose_quantity
       ))
  ) problems;
  if v_invalid is not null then
    raise exception using
      message = 'Phase 9F preflight failed: ' || v_invalid,
      hint = 'Repair the listed authoritative records. Do not infer a count mode from a product name, category, or unit.';
  end if;
end;
$$;

alter table public.inventory_products
  add column if not exists count_mode text not null default 'unit',
  add column if not exists container_capacity_liters numeric(20,6);

alter table public.inventory_count_lines
  add column if not exists count_mode_snapshot text not null default 'unit',
  add column if not exists container_capacity_liters_snapshot numeric(20,6),
  add column if not exists counted_whole_units bigint,
  add column if not exists counted_open_volume_liters numeric(20,6),
  add column if not exists counted_full_kegs bigint,
  add column if not exists counted_partial_keg_fraction numeric(7,6);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inventory_products_count_mode_check') then
    alter table public.inventory_products add constraint inventory_products_count_mode_check
      check (count_mode in ('unit', 'container_plus_volume', 'keg_fraction'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'inventory_products_measurement_config_check') then
    alter table public.inventory_products add constraint inventory_products_measurement_config_check
      check (
        (count_mode = 'container_plus_volume' and container_capacity_liters > 0)
        or (count_mode in ('unit', 'keg_fraction') and container_capacity_liters is null)
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'inventory_products_phase9f_finite_check') then
    alter table public.inventory_products add constraint inventory_products_phase9f_finite_check
      check (
        coalesce(default_pack_size::text not in ('NaN', 'Infinity', '-Infinity'), true)
        and coalesce(container_capacity_liters::text not in ('NaN', 'Infinity', '-Infinity'), true)
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'inventory_location_products_phase9f_finite_check') then
    alter table public.inventory_location_products add constraint inventory_location_products_phase9f_finite_check
      check (
        coalesce(par_quantity::text not in ('NaN', 'Infinity', '-Infinity'), true)
        and coalesce(minimum_quantity::text not in ('NaN', 'Infinity', '-Infinity'), true)
        and coalesce(default_restock_quantity::text not in ('NaN', 'Infinity', '-Infinity'), true)
        and coalesce(reserve_multiplier::text not in ('NaN', 'Infinity', '-Infinity'), true)
        and coalesce(case_size::text not in ('NaN', 'Infinity', '-Infinity'), true)
        and coalesce(target_loose_quantity::text not in ('NaN', 'Infinity', '-Infinity'), true)
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'inventory_count_lines_count_mode_check') then
    alter table public.inventory_count_lines add constraint inventory_count_lines_count_mode_check
      check (count_mode_snapshot in ('unit', 'container_plus_volume', 'keg_fraction'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'inventory_count_lines_measurement_snapshot_check') then
    alter table public.inventory_count_lines add constraint inventory_count_lines_measurement_snapshot_check
      check (
        (count_mode_snapshot = 'container_plus_volume' and container_capacity_liters_snapshot > 0)
        or (count_mode_snapshot in ('unit', 'keg_fraction') and container_capacity_liters_snapshot is null)
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'inventory_count_lines_structured_components_check') then
    alter table public.inventory_count_lines add constraint inventory_count_lines_structured_components_check
      check (
        (count_mode_snapshot = 'unit'
          and counted_whole_units is null
          and counted_open_volume_liters is null
          and counted_full_kegs is null
          and counted_partial_keg_fraction is null)
        or
        (count_mode_snapshot = 'container_plus_volume'
          and counted_full_kegs is null
          and counted_partial_keg_fraction is null
          and (
            (counted_quantity is null and counted_whole_units is null and counted_open_volume_liters is null)
            or
            (counted_quantity is not null
              and counted_whole_units >= 0
              and counted_open_volume_liters >= 0
              and counted_quantity = counted_whole_units * container_capacity_liters_snapshot + counted_open_volume_liters)
          ))
        or
        (count_mode_snapshot = 'keg_fraction'
          and counted_whole_units is null
          and counted_open_volume_liters is null
          and (
            (counted_quantity is null and counted_full_kegs is null and counted_partial_keg_fraction is null)
            or
            (counted_quantity is not null
              and counted_full_kegs >= 0
              and counted_partial_keg_fraction >= 0
              and counted_partial_keg_fraction < 1
              and counted_quantity = counted_full_kegs + counted_partial_keg_fraction)
          ))
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'inventory_count_lines_phase9f_finite_check') then
    alter table public.inventory_count_lines add constraint inventory_count_lines_phase9f_finite_check
      check (
        coalesce(par_quantity_snapshot::text not in ('NaN', 'Infinity', '-Infinity'), true)
        and coalesce(minimum_quantity_snapshot::text not in ('NaN', 'Infinity', '-Infinity'), true)
        and coalesce(effective_target_quantity_snapshot::text not in ('NaN', 'Infinity', '-Infinity'), true)
        and coalesce(service_target_basis_snapshot::text not in ('NaN', 'Infinity', '-Infinity'), true)
        and coalesce(reserve_multiplier_snapshot::text not in ('NaN', 'Infinity', '-Infinity'), true)
        and coalesce(case_size_snapshot::text not in ('NaN', 'Infinity', '-Infinity'), true)
        and coalesce(target_loose_quantity_snapshot::text not in ('NaN', 'Infinity', '-Infinity'), true)
        and coalesce(container_capacity_liters_snapshot::text not in ('NaN', 'Infinity', '-Infinity'), true)
        and coalesce(count_loose_quantity::text not in ('NaN', 'Infinity', '-Infinity'), true)
        and coalesce(counted_open_volume_liters::text not in ('NaN', 'Infinity', '-Infinity'), true)
        and coalesce(counted_partial_keg_fraction::text not in ('NaN', 'Infinity', '-Infinity'), true)
        and coalesce(counted_quantity::text not in ('NaN', 'Infinity', '-Infinity'), true)
      );
  end if;
end;
$$;

create or replace function public.inventory_snapshot_count_measurement()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_session public.inventory_count_sessions%rowtype;
  v_source public.inventory_count_lines%rowtype;
  v_product public.inventory_products%rowtype;
begin
  select session.* into v_session
  from public.inventory_count_sessions session
  where session.id = new.session_id and session.organization_id = new.organization_id;
  if v_session.id is null then raise exception 'Inventory count session was not found for the count line.'; end if;

  if v_session.session_kind = 'correction' then
    select source.* into v_source
    from public.inventory_count_lines source
    where source.session_id = v_session.original_session_id
      and source.organization_id = new.organization_id
      and source.location_id = new.location_id
      and source.product_id = new.product_id;
    if v_source.id is null then
      raise exception 'The original measurement snapshot was not found for this correction line.';
    end if;
    new.count_mode_snapshot := v_source.count_mode_snapshot;
    new.container_capacity_liters_snapshot := v_source.container_capacity_liters_snapshot;
    new.unit_label_snapshot := v_source.unit_label_snapshot;
  else
    select product.* into v_product
    from public.inventory_products product
    where product.id = new.product_id and product.organization_id = new.organization_id;
    if v_product.id is null then raise exception 'Inventory product was not found for the count line.'; end if;
    new.count_mode_snapshot := v_product.count_mode;
    new.container_capacity_liters_snapshot := v_product.container_capacity_liters;
    new.unit_label_snapshot := case v_product.count_mode
      when 'container_plus_volume' then 'L'
      when 'keg_fraction' then 'keg equivalents'
      else v_product.unit_label
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_count_lines_phase9f_snapshot on public.inventory_count_lines;
create trigger inventory_count_lines_phase9f_snapshot
before insert on public.inventory_count_lines
for each row execute function public.inventory_snapshot_count_measurement();

create or replace function public.inventory_enforce_structured_count_components()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_previous public.inventory_count_lines%rowtype;
  v_target numeric;
begin
  if new.counted_quantity is null then
    new.counted_whole_units := null;
    new.counted_open_volume_liters := null;
    new.counted_full_kegs := null;
    new.counted_partial_keg_fraction := null;
    return new;
  end if;

  if new.count_mode_snapshot = 'unit' then
    new.counted_whole_units := null;
    new.counted_open_volume_liters := null;
    new.counted_full_kegs := null;
    new.counted_partial_keg_fraction := null;
    return new;
  end if;

  if new.count_method = 'use_par' and (
    old.count_method is distinct from 'use_par'
    or old.counted_quantity is distinct from new.counted_quantity
    or old.count_status is distinct from 'counted'
  ) then
    v_target := new.counted_quantity;
    if round(v_target, 6) <> v_target then
      raise exception 'Structured targets must use no more than 6 decimal places before Mark fully stocked can be used.';
    end if;
    if new.count_mode_snapshot = 'container_plus_volume' then
      if new.container_capacity_liters_snapshot is null or new.container_capacity_liters_snapshot <= 0 then
        raise exception 'A positive snapshotted container capacity is required.';
      end if;
      new.counted_whole_units := trunc(v_target / new.container_capacity_liters_snapshot)::bigint;
      new.counted_open_volume_liters := v_target - new.counted_whole_units * new.container_capacity_liters_snapshot;
      new.counted_full_kegs := null;
      new.counted_partial_keg_fraction := null;
    else
      new.counted_whole_units := null;
      new.counted_open_volume_liters := null;
      new.counted_full_kegs := trunc(v_target)::bigint;
      new.counted_partial_keg_fraction := v_target - trunc(v_target);
    end if;
    return new;
  end if;

  if new.count_method = 'confirmed_unchanged'
     and old.count_method is distinct from 'confirmed_unchanged' then
    select previous.* into v_previous
    from public.inventory_count_lines previous
    where previous.id = new.previous_verified_count_line_id
      and previous.organization_id = new.organization_id;
    if v_previous.id is null then raise exception 'The previous structured physical count was not found.'; end if;
    if v_previous.count_mode_snapshot is distinct from new.count_mode_snapshot
       or v_previous.container_capacity_liters_snapshot is distinct from new.container_capacity_liters_snapshot
       or v_previous.unit_label_snapshot is distinct from new.unit_label_snapshot then
      raise exception 'Product measurement configuration changed since the previous physical count. Enter a new physical count.';
    end if;
    new.counted_whole_units := v_previous.counted_whole_units;
    new.counted_open_volume_liters := v_previous.counted_open_volume_liters;
    new.counted_full_kegs := v_previous.counted_full_kegs;
    new.counted_partial_keg_fraction := v_previous.counted_partial_keg_fraction;
    return new;
  end if;

  if new.count_mode_snapshot = 'container_plus_volume'
     and (new.counted_whole_units is null or new.counted_open_volume_liters is null) then
    raise exception 'Save sealed containers and open liters together for this product.';
  end if;
  if new.count_mode_snapshot = 'keg_fraction'
     and (new.counted_full_kegs is null or new.counted_partial_keg_fraction is null) then
    raise exception 'Save full and partial kegs together for this product.';
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_count_lines_phase9f_components on public.inventory_count_lines;
create trigger inventory_count_lines_phase9f_components
before update on public.inventory_count_lines
for each row execute function public.inventory_enforce_structured_count_components();

drop function if exists public.upsert_inventory_product(uuid, text, text, text, text, text, text, numeric, text, text, boolean, integer, jsonb, text[]);

create or replace function public.upsert_inventory_product(
  input_product_id uuid default null,
  input_name text default null,
  input_short_name text default null,
  input_sku text default null,
  input_barcode text default null,
  input_category text default null,
  input_unit_label text default null,
  input_default_pack_size numeric default null,
  input_supplier_name text default null,
  input_notes text default null,
  input_active boolean default null,
  input_sort_order integer default null,
  input_metadata jsonb default null,
  input_count_mode text default null,
  input_container_capacity_liters numeric default null,
  input_fields text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := public.current_user_organization_id();
  v_record public.inventory_products%rowtype;
  v_name text := nullif(trim(coalesce(input_name, '')), '');
  v_unit text := nullif(trim(coalesce(input_unit_label, '')), '');
  v_fields text[] := coalesce(input_fields, array[
    'name', 'short_name', 'sku', 'barcode', 'category', 'unit_label',
    'default_pack_size', 'supplier_name', 'notes', 'active', 'sort_order', 'metadata',
    'count_mode', 'container_capacity_liters'
  ]::text[]);
  v_mode text;
  v_capacity numeric;
begin
  if not public.current_user_can_manage_inventory_config() or v_org is null then
    raise exception 'Manager inventory configuration access required.';
  end if;
  if input_default_pack_size is not null and input_default_pack_size < 0 then
    raise exception 'Default pack size cannot be negative.';
  end if;

  if input_product_id is null then
    v_mode := coalesce(input_count_mode, 'unit');
    v_capacity := input_container_capacity_liters;
  else
    select product.* into v_record
    from public.inventory_products product
    where product.id = input_product_id and product.organization_id = v_org
    for update;
    if v_record.id is null then raise exception 'Inventory product was not found.'; end if;
    v_mode := case when 'count_mode' = any(v_fields) then input_count_mode else v_record.count_mode end;
    v_capacity := case when 'container_capacity_liters' = any(v_fields) then input_container_capacity_liters else v_record.container_capacity_liters end;
  end if;
  if v_mode not in ('unit', 'container_plus_volume', 'keg_fraction') then
    raise exception 'Count mode must be unit, container_plus_volume, or keg_fraction.';
  end if;
  if v_mode = 'container_plus_volume' then
    if v_capacity is null or v_capacity <= 0 then raise exception 'A positive container capacity in liters is required.'; end if;
    if round(v_capacity, 6) <> v_capacity then raise exception 'Container capacity supports no more than 6 decimal places.'; end if;
  elsif v_capacity is not null then
    raise exception 'Container capacity must be empty unless the count mode is container_plus_volume.';
  end if;

  if input_product_id is null then
    if v_name is null then raise exception 'Product name is required.'; end if;
    if v_unit is null then raise exception 'Product unit is required.'; end if;
    insert into public.inventory_products (
      organization_id, name, short_name, sku, barcode, category, unit_label,
      default_pack_size, supplier_name, notes, active, sort_order, metadata,
      count_mode, container_capacity_liters, created_by_auth_user_id, updated_by_auth_user_id
    ) values (
      v_org, v_name, nullif(trim(coalesce(input_short_name, '')), ''),
      nullif(trim(coalesce(input_sku, '')), ''), nullif(trim(coalesce(input_barcode, '')), ''),
      nullif(trim(coalesce(input_category, '')), ''), v_unit, input_default_pack_size,
      nullif(trim(coalesce(input_supplier_name, '')), ''), nullif(trim(coalesce(input_notes, '')), ''),
      coalesce(input_active, true), coalesce(input_sort_order, 0), coalesce(input_metadata, '{}'::jsonb),
      v_mode, v_capacity, auth.uid(), auth.uid()
    ) returning * into v_record;
  else
    if 'name' = any(v_fields) and v_name is null then raise exception 'Product name is required.'; end if;
    if 'unit_label' = any(v_fields) and v_unit is null then raise exception 'Product unit is required.'; end if;
    update public.inventory_products product
    set name = case when 'name' = any(v_fields) then v_name else product.name end,
        short_name = case when 'short_name' = any(v_fields) then nullif(trim(coalesce(input_short_name, '')), '') else product.short_name end,
        sku = case when 'sku' = any(v_fields) then nullif(trim(coalesce(input_sku, '')), '') else product.sku end,
        barcode = case when 'barcode' = any(v_fields) then nullif(trim(coalesce(input_barcode, '')), '') else product.barcode end,
        category = case when 'category' = any(v_fields) then nullif(trim(coalesce(input_category, '')), '') else product.category end,
        unit_label = case when 'unit_label' = any(v_fields) then v_unit else product.unit_label end,
        default_pack_size = case when 'default_pack_size' = any(v_fields) then input_default_pack_size else product.default_pack_size end,
        supplier_name = case when 'supplier_name' = any(v_fields) then nullif(trim(coalesce(input_supplier_name, '')), '') else product.supplier_name end,
        notes = case when 'notes' = any(v_fields) then nullif(trim(coalesce(input_notes, '')), '') else product.notes end,
        active = case when 'active' = any(v_fields) then coalesce(input_active, product.active) else product.active end,
        sort_order = case when 'sort_order' = any(v_fields) then coalesce(input_sort_order, product.sort_order) else product.sort_order end,
        metadata = case when 'metadata' = any(v_fields) then coalesce(input_metadata, '{}'::jsonb) else product.metadata end,
        count_mode = v_mode,
        container_capacity_liters = v_capacity,
        updated_by_auth_user_id = auth.uid()
    where product.id = input_product_id and product.organization_id = v_org
    returning * into v_record;
  end if;
  return jsonb_build_object(
    'id', v_record.id, 'name', v_record.name, 'short_name', v_record.short_name,
    'sku', v_record.sku, 'barcode', v_record.barcode, 'category', v_record.category,
    'unit_label', v_record.unit_label, 'default_pack_size', v_record.default_pack_size,
    'count_mode', v_record.count_mode, 'container_capacity_liters', v_record.container_capacity_liters,
    'supplier_name', v_record.supplier_name, 'notes', v_record.notes,
    'active', v_record.active, 'sort_order', v_record.sort_order
  );
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
  if v_line.id is null then raise exception 'Inventory count line was not found or is not available.'; end if;
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
    'count_mode_snapshot', v_line.count_mode_snapshot,
    'container_capacity_liters_snapshot', v_line.container_capacity_liters_snapshot,
    'counted_whole_units', v_line.counted_whole_units,
    'counted_open_volume_liters', v_line.counted_open_volume_liters,
    'counted_full_kegs', v_line.counted_full_kegs,
    'counted_partial_keg_fraction', v_line.counted_partial_keg_fraction,
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

create or replace function public.set_inventory_count_line_quantity(
  input_line_id uuid,
  input_counted_quantity numeric,
  input_note text default null,
  input_actor_name text default null,
  input_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_line public.inventory_count_lines%rowtype;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  if input_counted_quantity is null then raise exception 'Enter a counted quantity or use Clear.'; end if;
  if input_counted_quantity < 0 then raise exception 'Counted quantity cannot be negative.'; end if;
  v_line := public.inventory_lock_mutable_count_line(input_line_id, v_actor.organization_id, input_expected_updated_at, 'saving this count');
  if v_line.count_mode_snapshot <> 'unit' then
    raise exception 'Use the structured count inputs captured for this product.';
  end if;
  update public.inventory_count_lines line
  set counted_quantity = input_counted_quantity,
      count_full_cases = null, count_loose_quantity = null,
      count_method = 'manual', count_status = 'counted',
      note = nullif(trim(coalesce(input_note, '')), ''), counted_at = now(),
      counted_by_auth_user_id = v_actor.actor_auth_user_id, counted_by_name = v_actor.actor_name
  where line.id = v_line.id returning * into v_line;
  update public.inventory_count_sessions session
  set metadata = session.metadata #- array['locationCompletions', v_line.location_id::text]
  where session.id = v_line.session_id;
  return public.inventory_count_line_client_record(v_line.id);
end;
$$;

create or replace function public.set_inventory_count_line_case_quantity(
  input_line_id uuid,
  input_full_cases integer,
  input_loose_quantity numeric default 0,
  input_note text default null,
  input_actor_name text default null,
  input_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_line public.inventory_count_lines%rowtype;
  v_total numeric;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  if input_full_cases is null or input_full_cases < 0 then raise exception 'Full cases cannot be negative.'; end if;
  if input_loose_quantity is null or input_loose_quantity < 0 then raise exception 'Loose units cannot be negative.'; end if;
  v_line := public.inventory_lock_mutable_count_line(input_line_id, v_actor.organization_id, input_expected_updated_at, 'saving this case count');
  if v_line.count_mode_snapshot <> 'unit' then
    raise exception 'Protected-reserve case counting is only available for unit-mode products.';
  end if;
  if v_line.stock_policy_snapshot <> 'protected_event_reserve' or v_line.case_size_snapshot is null then
    raise exception 'Case counting is only available for configured protected event reserve stock.';
  end if;
  v_total := input_full_cases * v_line.case_size_snapshot + input_loose_quantity;
  update public.inventory_count_lines line
  set counted_quantity = v_total,
      count_full_cases = input_full_cases, count_loose_quantity = input_loose_quantity,
      count_method = 'manual', count_status = 'counted',
      note = nullif(trim(coalesce(input_note, '')), ''), counted_at = now(),
      counted_by_auth_user_id = v_actor.actor_auth_user_id, counted_by_name = v_actor.actor_name
  where line.id = v_line.id returning * into v_line;
  update public.inventory_count_sessions session
  set metadata = session.metadata #- array['locationCompletions', v_line.location_id::text]
  where session.id = v_line.session_id;
  return public.inventory_count_line_client_record(v_line.id);
end;
$$;

create or replace function public.set_inventory_count_line_structured_quantity(
  input_line_id uuid,
  input_whole_units numeric default null,
  input_open_volume_liters numeric default null,
  input_full_kegs numeric default null,
  input_partial_keg_fraction numeric default null,
  input_note text default null,
  input_actor_name text default null,
  input_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_line public.inventory_count_lines%rowtype;
  v_total numeric;
  v_whole bigint;
  v_full bigint;
  v_partial numeric;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  v_line := public.inventory_lock_mutable_count_line(input_line_id, v_actor.organization_id, input_expected_updated_at, 'saving this structured count');
  if v_line.count_mode_snapshot = 'container_plus_volume' then
    if input_whole_units is null or input_whole_units < 0 or trunc(input_whole_units) <> input_whole_units then
      raise exception 'Sealed container count must be a non-negative whole number.';
    end if;
    if input_open_volume_liters is null or input_open_volume_liters < 0 then
      raise exception 'Open volume cannot be negative.';
    end if;
    if round(input_open_volume_liters, 6) <> input_open_volume_liters then
      raise exception 'Open volume supports no more than 6 decimal places.';
    end if;
    if input_full_kegs is not null or input_partial_keg_fraction is not null then
      raise exception 'Keg components do not apply to container-plus-volume products.';
    end if;
    if v_line.container_capacity_liters_snapshot is null or v_line.container_capacity_liters_snapshot <= 0 then
      raise exception 'A positive snapshotted container capacity is required.';
    end if;
    v_whole := input_whole_units::bigint;
    v_total := v_whole * v_line.container_capacity_liters_snapshot + input_open_volume_liters;
    update public.inventory_count_lines line
    set counted_quantity = v_total,
        counted_whole_units = v_whole,
        counted_open_volume_liters = input_open_volume_liters,
        counted_full_kegs = null,
        counted_partial_keg_fraction = null,
        count_full_cases = null,
        count_loose_quantity = null,
        count_method = 'manual', count_status = 'counted',
        note = nullif(trim(coalesce(input_note, '')), ''), counted_at = now(),
        counted_by_auth_user_id = v_actor.actor_auth_user_id, counted_by_name = v_actor.actor_name
    where line.id = v_line.id returning * into v_line;
  elsif v_line.count_mode_snapshot = 'keg_fraction' then
    if input_full_kegs is null or input_full_kegs < 0 or trunc(input_full_kegs) <> input_full_kegs then
      raise exception 'Full keg count must be a non-negative whole number.';
    end if;
    if input_partial_keg_fraction is null or input_partial_keg_fraction < 0 or input_partial_keg_fraction > 1 then
      raise exception 'Partial keg fraction must be from 0 through 1.';
    end if;
    if round(input_partial_keg_fraction, 6) <> input_partial_keg_fraction then
      raise exception 'Partial keg fraction supports no more than 6 decimal places.';
    end if;
    if input_whole_units is not null or input_open_volume_liters is not null then
      raise exception 'Container components do not apply to keg-fraction products.';
    end if;
    v_full := input_full_kegs::bigint;
    v_partial := input_partial_keg_fraction;
    if v_partial = 1 then
      v_full := v_full + 1;
      v_partial := 0;
    end if;
    v_total := v_full + v_partial;
    update public.inventory_count_lines line
    set counted_quantity = v_total,
        counted_whole_units = null,
        counted_open_volume_liters = null,
        counted_full_kegs = v_full,
        counted_partial_keg_fraction = v_partial,
        count_full_cases = null,
        count_loose_quantity = null,
        count_method = 'manual', count_status = 'counted',
        note = nullif(trim(coalesce(input_note, '')), ''), counted_at = now(),
        counted_by_auth_user_id = v_actor.actor_auth_user_id, counted_by_name = v_actor.actor_name
    where line.id = v_line.id returning * into v_line;
  else
    raise exception 'Structured counting is only available for container-plus-volume or keg-fraction products.';
  end if;
  update public.inventory_count_sessions session
  set metadata = session.metadata #- array['locationCompletions', v_line.location_id::text]
  where session.id = v_line.session_id;
  return public.inventory_count_line_client_record(v_line.id);
end;
$$;

-- Existing ordinary and protected-reserve RPCs stay backward compatible for unit
-- snapshots. The component trigger rejects them for structured modes and supplies
-- exact use-par/unchanged decomposition for all existing single/bulk lifecycle RPCs.

revoke all privileges on table public.inventory_products from authenticated;
grant select (
  id, organization_id, name, short_name, sku, barcode, category, unit_label,
  default_pack_size, count_mode, container_capacity_liters,
  supplier_name, notes, active, sort_order
) on table public.inventory_products to authenticated;

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
  count_mode_snapshot, container_capacity_liters_snapshot,
  counted_whole_units, counted_open_volume_liters,
  counted_full_kegs, counted_partial_keg_fraction,
  count_full_cases, count_loose_quantity, counted_quantity, count_method,
  count_status, variance_quantity, restock_quantity, note, counted_at,
  counted_by_name, updated_at
) on table public.inventory_count_lines to authenticated;

revoke all on function public.inventory_snapshot_count_measurement() from public, anon, authenticated;
revoke all on function public.inventory_enforce_structured_count_components() from public, anon, authenticated;
revoke all on function public.inventory_count_line_client_record(uuid) from public, anon, authenticated;
revoke all on function public.upsert_inventory_product(uuid, text, text, text, text, text, text, numeric, text, text, boolean, integer, jsonb, text, numeric, text[]) from public, anon, authenticated;
revoke all on function public.set_inventory_count_line_quantity(uuid, numeric, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.set_inventory_count_line_case_quantity(uuid, integer, numeric, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.set_inventory_count_line_structured_quantity(uuid, numeric, numeric, numeric, numeric, text, text, timestamptz) from public, anon, authenticated;

grant execute on function public.upsert_inventory_product(uuid, text, text, text, text, text, text, numeric, text, text, boolean, integer, jsonb, text, numeric, text[]) to authenticated;
grant execute on function public.set_inventory_count_line_quantity(uuid, numeric, text, text, timestamptz) to authenticated;
grant execute on function public.set_inventory_count_line_case_quantity(uuid, integer, numeric, text, text, timestamptz) to authenticated;
grant execute on function public.set_inventory_count_line_structured_quantity(uuid, numeric, numeric, numeric, numeric, text, text, timestamptz) to authenticated;

notify pgrst, 'reload schema';

-- Phase 9A.4: Mesh Youngstorget inventory location template and bulk standards setup.
-- Apply after phase9a_inventory_stocktaking.sql.

create or replace function public.setup_mesh_youngstorget_inventory_locations()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := public.current_user_organization_id();
  v_template record;
  v_existing public.inventory_locations%rowtype;
  v_parent_id uuid;
  v_created integer := 0;
  v_reused integer := 0;
  v_restored integer := 0;
  v_updated integer := 0;
  v_locations jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authenticated manager access is required.';
  end if;
  if v_org is null or not public.current_user_can_manage_inventory_config() then
    raise exception 'Active manager inventory configuration access is required.';
  end if;
  if public.current_user_is_shared_device() then
    raise exception 'Shared-device accounts cannot set up inventory locations.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('inventory-template:' || v_org::text, 0));

  for v_template in
    select *
    from jsonb_to_recordset('[
      {"code":"WORKBAR","name":"Workbar","location_type":"bar","parent_code":null,"zone":"workbar","sort_order":10},
      {"code":"WORKBAR_FRIDGE_1","name":"Fridge 1","location_type":"fridge","parent_code":"WORKBAR","zone":"workbar","sort_order":11},
      {"code":"WORKBAR_FRIDGE_2","name":"Fridge 2","location_type":"fridge","parent_code":"WORKBAR","zone":"workbar","sort_order":12},
      {"code":"WORKBAR_FRIDGE_3","name":"Fridge 3","location_type":"fridge","parent_code":"WORKBAR","zone":"workbar","sort_order":13},
      {"code":"WORKBAR_COFFEE","name":"Coffee station","location_type":"area","parent_code":"WORKBAR","zone":"workbar","sort_order":14},
      {"code":"WORKBAR_SNACKS","name":"Snack shelf","location_type":"shelf","parent_code":"WORKBAR","zone":"workbar","sort_order":15},
      {"code":"WORKBAR_BACKBAR","name":"Backbar shelves","location_type":"shelf","parent_code":"WORKBAR","zone":"workbar","sort_order":16},
      {"code":"CORNERBAR","name":"Cornerbar","location_type":"bar","parent_code":null,"zone":"cornerbar","sort_order":20},
      {"code":"CORNERBAR_FRIDGE_1","name":"Fridge 1","location_type":"fridge","parent_code":"CORNERBAR","zone":"cornerbar","sort_order":21},
      {"code":"CORNERBAR_FRIDGE_2","name":"Fridge 2","location_type":"fridge","parent_code":"CORNERBAR","zone":"cornerbar","sort_order":22},
      {"code":"CORNERBAR_BACKBAR","name":"Backbar shelves","location_type":"shelf","parent_code":"CORNERBAR","zone":"cornerbar","sort_order":23},
      {"code":"DRY_STORAGE","name":"Dry Storage","location_type":"storage","parent_code":null,"zone":"storage","sort_order":30},
      {"code":"MAIN_STORAGE","name":"Main Storage","location_type":"storage","parent_code":null,"zone":"storage","sort_order":31},
      {"code":"BEVERAGE_STORAGE","name":"Beverage Storage","location_type":"area","parent_code":null,"zone":"beverage_storage","sort_order":40},
      {"code":"BEVERAGE_STORAGE_BOTTLES","name":"Wine & bottle storage","location_type":"storage","parent_code":"BEVERAGE_STORAGE","zone":"beverage_storage","sort_order":41},
      {"code":"BEVERAGE_STORAGE_KEGS","name":"Beer kegs","location_type":"storage","parent_code":"BEVERAGE_STORAGE","zone":"beverage_storage","sort_order":42},
      {"code":"BEVERAGE_STORAGE_COCKTAIL","name":"Cocktail ingredients","location_type":"storage","parent_code":"BEVERAGE_STORAGE","zone":"beverage_storage","sort_order":43}
    ]'::jsonb) as template(
      code text,
      name text,
      location_type text,
      parent_code text,
      zone text,
      sort_order integer
    )
    order by template.sort_order
  loop
    v_parent_id := null;
    if v_template.parent_code is not null then
      select location.id into v_parent_id
      from public.inventory_locations location
      where location.organization_id = v_org
        and lower(trim(location.code)) = lower(v_template.parent_code);
      if v_parent_id is null then
        raise exception 'Template parent location % is unavailable.', v_template.parent_code;
      end if;
    end if;

    v_existing := null;
    select location.* into v_existing
    from public.inventory_locations location
    where location.organization_id = v_org
      and lower(trim(location.code)) = lower(v_template.code)
    for update;

    if v_existing.id is null then
      insert into public.inventory_locations (
        organization_id, name, code, location_type, parent_location_id, zone,
        active, sort_order, created_by_auth_user_id, updated_by_auth_user_id
      ) values (
        v_org, v_template.name, v_template.code, v_template.location_type,
        v_parent_id, v_template.zone, true, v_template.sort_order, auth.uid(), auth.uid()
      );
      v_created := v_created + 1;
    else
      if not v_existing.active then
        v_restored := v_restored + 1;
      else
        v_reused := v_reused + 1;
      end if;
      if v_existing.name is distinct from v_template.name
         or v_existing.code is distinct from v_template.code
         or v_existing.location_type is distinct from v_template.location_type
         or v_existing.parent_location_id is distinct from v_parent_id
         or v_existing.zone is distinct from v_template.zone
         or v_existing.sort_order is distinct from v_template.sort_order
         or not v_existing.active then
        update public.inventory_locations location
        set name = v_template.name,
            code = v_template.code,
            location_type = v_template.location_type,
            parent_location_id = v_parent_id,
            zone = v_template.zone,
            sort_order = v_template.sort_order,
            active = true,
            updated_by_auth_user_id = auth.uid()
        where location.id = v_existing.id
          and location.organization_id = v_org;
        v_updated := v_updated + 1;
      end if;
    end if;
  end loop;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', location.id,
      'name', location.name,
      'code', location.code,
      'location_type', location.location_type,
      'parent_location_id', location.parent_location_id,
      'zone', location.zone,
      'active', location.active,
      'sort_order', location.sort_order
    ) order by location.sort_order, location.name
  ), '[]'::jsonb)
  into v_locations
  from public.inventory_locations location
  where location.organization_id = v_org
    and location.code = any(array[
      'WORKBAR', 'WORKBAR_FRIDGE_1', 'WORKBAR_FRIDGE_2', 'WORKBAR_FRIDGE_3',
      'WORKBAR_COFFEE', 'WORKBAR_SNACKS', 'WORKBAR_BACKBAR', 'CORNERBAR',
      'CORNERBAR_FRIDGE_1', 'CORNERBAR_FRIDGE_2', 'CORNERBAR_BACKBAR',
      'DRY_STORAGE', 'MAIN_STORAGE', 'BEVERAGE_STORAGE',
      'BEVERAGE_STORAGE_BOTTLES', 'BEVERAGE_STORAGE_KEGS',
      'BEVERAGE_STORAGE_COCKTAIL'
    ]::text[]);

  return jsonb_build_object(
    'created', v_created,
    'reused', v_reused,
    'restored', v_restored,
    'updated', v_updated,
    'locations', v_locations
  );
end;
$$;

create or replace function public.bulk_upsert_inventory_location_standards(
  input_location_id uuid,
  input_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := public.current_user_organization_id();
  v_row jsonb;
  v_product_id uuid;
  v_assigned boolean;
  v_par numeric;
  v_minimum numeric;
  v_order integer;
  v_existing public.inventory_location_products%rowtype;
  v_seen uuid[] := array[]::uuid[];
  v_created integer := 0;
  v_updated integer := 0;
  v_archived integer := 0;
  v_preserved integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authenticated manager access is required.';
  end if;
  if v_org is null or not public.current_user_can_manage_inventory_config() then
    raise exception 'Active manager inventory configuration access is required.';
  end if;
  if public.current_user_is_shared_device() then
    raise exception 'Shared-device accounts cannot configure inventory standards.';
  end if;
  if not exists (
    select 1 from public.inventory_locations location
    where location.id = input_location_id
      and location.organization_id = v_org
      and location.active = true
  ) then
    raise exception 'Active inventory location was not found in this organization.';
  end if;
  if input_rows is null or jsonb_typeof(input_rows) <> 'array' then
    raise exception 'Inventory standard rows must be an array.';
  end if;

  for v_row in select value from jsonb_array_elements(input_rows)
  loop
    begin
      v_product_id := nullif(trim(coalesce(v_row->>'productId', '')), '')::uuid;
      v_assigned := coalesce((v_row->>'assigned')::boolean, true);
    exception when invalid_text_representation then
      raise exception 'A standard row contains an invalid product or assigned value.';
    end;
    if v_product_id is null then
      raise exception 'Every standard row requires a product.';
    end if;
    if v_product_id = any(v_seen) then
      raise exception 'A product appears more than once in the standards update.';
    end if;
    v_seen := array_append(v_seen, v_product_id);
    if not exists (
      select 1 from public.inventory_products product
      where product.id = v_product_id and product.organization_id = v_org
    ) then
      raise exception 'Inventory product was not found in this organization.';
    end if;

    v_existing := null;
    select standard.* into v_existing
    from public.inventory_location_products standard
    where standard.organization_id = v_org
      and standard.location_id = input_location_id
      and standard.product_id = v_product_id
    for update;

    if not v_assigned then
      if v_existing.id is not null and v_existing.active then
        update public.inventory_location_products standard
        set active = false, updated_by_auth_user_id = auth.uid()
        where standard.id = v_existing.id and standard.organization_id = v_org;
        v_archived := v_archived + 1;
      else
        v_preserved := v_preserved + 1;
      end if;
      continue;
    end if;

    begin
      if not (v_row ? 'parQuantity') or nullif(trim(coalesce(v_row->>'parQuantity', '')), '') is null then
        raise exception 'Par quantity is required for assigned products.';
      end if;
      v_par := (v_row->>'parQuantity')::numeric;
      v_minimum := case
        when nullif(trim(coalesce(v_row->>'minimumQuantity', '')), '') is null then null
        else (v_row->>'minimumQuantity')::numeric
      end;
      v_order := case
        when nullif(trim(coalesce(v_row->>'countOrder', '')), '') is null then 0
        else (v_row->>'countOrder')::integer
      end;
    exception when invalid_text_representation then
      raise exception 'A standard row contains an invalid quantity or count order.';
    end;
    if v_par < 0 or v_minimum < 0 or v_order < 0 then
      raise exception 'Par, minimum and count order cannot be negative.';
    end if;

    if v_existing.id is null then
      insert into public.inventory_location_products (
        organization_id, location_id, product_id, par_quantity, minimum_quantity,
        count_order, active, created_by_auth_user_id, updated_by_auth_user_id
      ) values (
        v_org, input_location_id, v_product_id, v_par, v_minimum,
        v_order, true, auth.uid(), auth.uid()
      );
      v_created := v_created + 1;
    elsif v_existing.par_quantity is distinct from v_par
       or v_existing.minimum_quantity is distinct from v_minimum
       or v_existing.count_order is distinct from v_order
       or not v_existing.active then
      update public.inventory_location_products standard
      set par_quantity = v_par,
          minimum_quantity = v_minimum,
          count_order = v_order,
          active = true,
          updated_by_auth_user_id = auth.uid()
      where standard.id = v_existing.id and standard.organization_id = v_org;
      v_updated := v_updated + 1;
    else
      v_preserved := v_preserved + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'created', v_created,
    'updated', v_updated,
    'archived', v_archived,
    'preserved', v_preserved
  );
end;
$$;

revoke all on function public.setup_mesh_youngstorget_inventory_locations() from public, anon, authenticated;
revoke all on function public.bulk_upsert_inventory_location_standards(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.setup_mesh_youngstorget_inventory_locations() to authenticated;
grant execute on function public.bulk_upsert_inventory_location_standards(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';

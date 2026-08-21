-- Phase 9G-D: Bobby-confirmed refrigerator product mappings.
-- Apply after Phase 9G-C. This terminal data layer is repeatable, resolves stable
-- product IDs only through authoritative Millum references, and preserves the
-- original unresolved-mapping records as audit evidence.

do $$
declare
  v_organization_id uuid;
  v_location_id uuid;
  v_product_id uuid;
  v_product_count integer;
  v_row_count integer;
  v_item record;
begin
  for v_organization_id in
    select distinct mapping.organization_id
    from public.inventory_catalogue_unresolved_mappings mapping
    where lower(trim(mapping.requested_name)) = any(array[
      'blonde', 'passion', 'pils', 'ginger ninja', 'skog', 'eple',
      'rabarbra', 'hylle', 'pepsi', 'farris', 'schweppes indian tonic',
      'eple & eple', 'appelsinjuice'
    ])
  loop
    -- Validate the complete authoritative identity before changing any row. The
    -- UUID remains installation-specific and is always selected from the stable
    -- Millum reference; no UUID is guessed or hard-coded here.
    for v_item in
      select * from jsonb_to_recordset($phase9gd_products$
      [
        {"ref":"707000631","officialName":"Norwegian Blonde 24*33cl","displayName":"Norwegian Blonde","category":"Beer","inventoryUnit":"unit"},
        {"ref":"4966818","officialName":"OSLOVE PASSION BLONDE 0,33L FL OSLO (0.33 ltr)","displayName":"Oslove Passion Blonde","category":"Beer","inventoryUnit":"unit"},
        {"ref":"5932918","officialName":"AASS PILSNER 0,33L FL (0.33 ltr)","displayName":"Aass Pils","category":"Beer","inventoryUnit":"unit"},
        {"ref":"6181002","officialName":"7FJELL GINGER NINJA NORDIC BERRIES 0,33L (0.33 ltr)","displayName":"Ginger Ninja Nordic Berries","category":"Beer","inventoryUnit":"unit"},
        {"ref":"6631634","officialName":"SKOG 03 0,33L FL VILLBRYGG (0.33 ltr)","displayName":"Villbrygg Skog 03","category":"Sodas","inventoryUnit":"unit"},
        {"ref":"6388581","officialName":"FRUKTSMEKK EPLE 0,33L BX SAFTERIET (0.33 ltr)","displayName":"Fruktsmekk Eple","category":"Sodas","inventoryUnit":"unit"},
        {"ref":"5804190","officialName":"FRUKTSMEKK RABARBARA&HYLLEBLOMST 0,33L (0.33 ltr)","displayName":"Fruktsmekk Rabarbra & Hylleblomst","category":"Sodas","inventoryUnit":"unit"},
        {"ref":"6503346","officialName":"FRUKTSMEKK HYLLEBLOMST&SITRON 0,33L BX (0.33 ltr)","displayName":"Fruktsmekk Hylleblomst & Sitron","category":"Sodas","inventoryUnit":"unit"},
        {"ref":"814467","officialName":"PEPSI MAX 0,3L FL PROFIL (0.3 ltr)","displayName":"Pepsi Max","category":"Sodas","inventoryUnit":"unit"},
        {"ref":"5104666","officialName":"FARRIS NATURELL 0,375L FL PROFIL (0.375 ltr)","displayName":"Farris Naturell","category":"Sodas","inventoryUnit":"unit"},
        {"ref":"5010707","officialName":"TONIC WATER PREMIUM 0,5L FL FEVER-TREE (0.5 ltr)","displayName":"Fever-Tree Premium Indian Tonic Water","category":"Sodas","inventoryUnit":"unit"},
        {"ref":"5010715","officialName":"GINGER BEER MIXER 0,5L FL FEVER-TREE (0.5 ltr)","displayName":"Fever-Tree Ginger Beer","category":"Sodas","inventoryUnit":"unit"},
        {"ref":"6752422","officialName":"APPELSINJUICE 250ML JUICERIET (0.25 ltr)","displayName":"Appelsinjuice 250 ml","category":"Sodas","inventoryUnit":"unit"}
      ]
      $phase9gd_products$::jsonb) as item(
        ref text, "officialName" text, "displayName" text,
        category text, "inventoryUnit" text
      )
    loop
      select count(*), max(product.id::text)::uuid
      into v_product_count, v_product_id
      from public.inventory_products product
      where product.organization_id = v_organization_id
        and product.millum_item_ref = v_item.ref
        and product.name = v_item."officialName"
        and product.category = v_item.category
        and product.unit_label = v_item."inventoryUnit";

      if v_product_count <> 1 then
        raise exception 'Phase 9G-D requires exactly one authoritative product for Millum ref % in organization %.',
          v_item.ref, v_organization_id;
      end if;

      update public.inventory_products product
      set short_name = v_item."displayName"
      where product.id = v_product_id
        and product.short_name is distinct from v_item."displayName";
    end loop;

    -- These are individual refrigerator units. Millum order-package units such
    -- as crates and cases never multiply the persisted par quantity.
    for v_item in
      select * from jsonb_to_recordset($phase9gd_defaults$
      [
        {"location":"CORNERBAR_RIGHT_FRIDGE","ref":"707000631","quantity":25,"order":1},
        {"location":"CORNERBAR_RIGHT_FRIDGE","ref":"4966818","quantity":20,"order":2},
        {"location":"CORNERBAR_RIGHT_FRIDGE","ref":"5932918","quantity":20,"order":4},
        {"location":"CORNERBAR_RIGHT_FRIDGE","ref":"6181002","quantity":10,"order":7},
        {"location":"CORNERBAR_RIGHT_FRIDGE","ref":"6631634","quantity":5,"order":8},
        {"location":"CORNERBAR_RIGHT_FRIDGE","ref":"6388581","quantity":4,"order":13},
        {"location":"CORNERBAR_RIGHT_FRIDGE","ref":"5804190","quantity":4,"order":14},
        {"location":"CORNERBAR_RIGHT_FRIDGE","ref":"6503346","quantity":4,"order":15},
        {"location":"CORNERBAR_RIGHT_FRIDGE","ref":"814467","quantity":6,"order":16},
        {"location":"CORNERBAR_RIGHT_FRIDGE","ref":"5104666","quantity":6,"order":17},
        {"location":"WORKBAR_BAR_RIGHT_FRIDGE","ref":"5010715","quantity":2,"order":3},
        {"location":"WORKBAR_BAR_RIGHT_FRIDGE","ref":"5010707","quantity":2,"order":4},
        {"location":"WORKBAR_BAR_RIGHT_FRIDGE","ref":"5104666","quantity":6,"order":8},
        {"location":"WORKBAR_NON_ALCO_FRIDGE","ref":"6388581","quantity":12,"order":3},
        {"location":"WORKBAR_NON_ALCO_FRIDGE","ref":"6752422","quantity":16,"order":5},
        {"location":"WORKBAR_NON_ALCO_FRIDGE","ref":"5104666","quantity":20,"order":7},
        {"location":"WORKBAR_NON_ALCO_FRIDGE","ref":"6631634","quantity":20,"order":15}
      ]
      $phase9gd_defaults$::jsonb) as item(
        location text, ref text, quantity numeric, "order" integer
      )
    loop
      select count(*), max(location.id::text)::uuid
      into v_row_count, v_location_id
      from public.inventory_locations location
      where location.organization_id = v_organization_id
        and upper(trim(location.code)) = v_item.location;
      if v_row_count <> 1 then
        raise exception 'Phase 9G-D requires exactly one refrigerator % in organization %.',
          v_item.location, v_organization_id;
      end if;

      select count(*), max(product.id::text)::uuid
      into v_product_count, v_product_id
      from public.inventory_products product
      where product.organization_id = v_organization_id
        and product.millum_item_ref = v_item.ref;
      if v_product_count <> 1 then
        raise exception 'Phase 9G-D requires exactly one stable product for Millum ref % in organization %.',
          v_item.ref, v_organization_id;
      end if;

      insert into public.inventory_location_products as existing_standard (
        organization_id, location_id, product_id, par_quantity, count_order,
        active, stock_policy
      ) values (
        v_organization_id, v_location_id, v_product_id, v_item.quantity,
        v_item."order", true, 'exact_par'
      )
      on conflict (location_id, product_id) do update
      set par_quantity = excluded.par_quantity,
          count_order = excluded.count_order,
          active = true,
          stock_policy = 'exact_par'
      where existing_standard.par_quantity is distinct from excluded.par_quantity
         or existing_standard.count_order is distinct from excluded.count_order
         or existing_standard.active is distinct from true
         or existing_standard.stock_policy is distinct from 'exact_par';
    end loop;

    -- Preserve the discontinued product identity and any historical standard
    -- row, but never leave Aass Eplemost active in an operational refrigerator.
    update public.inventory_location_products standard
    set active = false
    from public.inventory_locations location, public.inventory_products product
    where standard.organization_id = v_organization_id
      and location.id = standard.location_id
      and product.id = standard.product_id
      and location.organization_id = v_organization_id
      and product.organization_id = v_organization_id
      and upper(trim(location.code)) = any(array[
        'CORNERBAR_LEFT_FRIDGE', 'CORNERBAR_MIDDLE_FRIDGE', 'CORNERBAR_RIGHT_FRIDGE',
        'WORKBAR_BAR_LEFT_FRIDGE', 'WORKBAR_BAR_RIGHT_FRIDGE', 'WORKBAR_NON_ALCO_FRIDGE'
      ])
      and product.millum_item_ref = '5744222'
      and standard.active;

    for v_item in
      select * from jsonb_to_recordset($phase9gd_resolutions$
      [
        {"location":"CORNERBAR_RIGHT_FRIDGE","name":"Blonde","ref":"707000631"},
        {"location":"CORNERBAR_RIGHT_FRIDGE","name":"Passion","ref":"4966818"},
        {"location":"CORNERBAR_RIGHT_FRIDGE","name":"Pils","ref":"5932918"},
        {"location":"CORNERBAR_RIGHT_FRIDGE","name":"Ginger Ninja","ref":"6181002"},
        {"location":"CORNERBAR_RIGHT_FRIDGE","name":"Skog","ref":"6631634"},
        {"location":"CORNERBAR_RIGHT_FRIDGE","name":"Eple","ref":"6388581"},
        {"location":"CORNERBAR_RIGHT_FRIDGE","name":"Rabarbra","ref":"5804190"},
        {"location":"CORNERBAR_RIGHT_FRIDGE","name":"Hylle","ref":"6503346"},
        {"location":"CORNERBAR_RIGHT_FRIDGE","name":"Pepsi","ref":"814467"},
        {"location":"CORNERBAR_RIGHT_FRIDGE","name":"Farris","ref":"5104666"},
        {"location":"WORKBAR_BAR_RIGHT_FRIDGE","name":"Farris","ref":"5104666"},
        {"location":"WORKBAR_NON_ALCO_FRIDGE","name":"Eple & Eple","ref":"6388581"},
        {"location":"WORKBAR_NON_ALCO_FRIDGE","name":"Appelsinjuice","ref":"6752422"},
        {"location":"WORKBAR_NON_ALCO_FRIDGE","name":"Farris","ref":"5104666"},
        {"location":"WORKBAR_NON_ALCO_FRIDGE","name":"Skog","ref":"6631634"}
      ]
      $phase9gd_resolutions$::jsonb) as item(location text, name text, ref text)
    loop
      select count(*), max(location.id::text)::uuid
      into v_row_count, v_location_id
      from public.inventory_locations location
      where location.organization_id = v_organization_id
        and upper(trim(location.code)) = v_item.location;
      if v_row_count <> 1 then
        raise exception 'Phase 9G-D cannot resolve mapping without refrigerator % in organization %.',
          v_item.location, v_organization_id;
      end if;

      select count(*), max(product.id::text)::uuid
      into v_product_count, v_product_id
      from public.inventory_products product
      where product.organization_id = v_organization_id
        and product.millum_item_ref = v_item.ref;
      if v_product_count <> 1 then
        raise exception 'Phase 9G-D cannot resolve mapping without Millum ref % in organization %.',
          v_item.ref, v_organization_id;
      end if;

      update public.inventory_catalogue_unresolved_mappings mapping
      set resolution_status = 'resolved', resolved_product_id = v_product_id
      where mapping.organization_id = v_organization_id
        and mapping.location_id = v_location_id
        and lower(trim(mapping.requested_name)) = lower(trim(v_item.name))
        and (
          mapping.resolution_status is distinct from 'resolved'
          or mapping.resolved_product_id is distinct from v_product_id
        );
      select count(*) into v_row_count
      from public.inventory_catalogue_unresolved_mappings mapping
      where mapping.organization_id = v_organization_id
        and mapping.location_id = v_location_id
        and lower(trim(mapping.requested_name)) = lower(trim(v_item.name))
        and mapping.resolution_status = 'resolved'
        and mapping.resolved_product_id = v_product_id;
      if v_row_count <> 1 then
        raise exception 'Phase 9G-D expected one audit mapping for % / % in organization %, found %.',
          v_item.location, v_item.name, v_organization_id, v_row_count;
      end if;
    end loop;

    select count(*), max(location.id::text)::uuid
    into v_row_count, v_location_id
    from public.inventory_locations location
    where location.organization_id = v_organization_id
      and upper(trim(location.code)) = 'WORKBAR_BAR_RIGHT_FRIDGE';
    if v_row_count <> 1 then
      raise exception 'Phase 9G-D cannot retire Schweppes without Workbar Bar Right Fridge in organization %.',
        v_organization_id;
    end if;

    update public.inventory_catalogue_unresolved_mappings mapping
    set resolution_status = 'dismissed', resolved_product_id = null
    where mapping.organization_id = v_organization_id
      and mapping.location_id = v_location_id
      and lower(trim(mapping.requested_name)) = 'schweppes indian tonic'
      and (
        mapping.resolution_status is distinct from 'dismissed'
        or mapping.resolved_product_id is not null
      );
    select count(*) into v_row_count
    from public.inventory_catalogue_unresolved_mappings mapping
    where mapping.organization_id = v_organization_id
      and mapping.location_id = v_location_id
      and lower(trim(mapping.requested_name)) = 'schweppes indian tonic'
      and mapping.resolution_status = 'dismissed'
      and mapping.resolved_product_id is null;
    if v_row_count <> 1 then
      raise exception 'Phase 9G-D expected one Schweppes audit mapping in organization %, found %.',
        v_organization_id, v_row_count;
    end if;
  end loop;
end;
$$;

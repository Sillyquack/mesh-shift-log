-- Phase 10Z: terminal inventory location and Express Shelf alignment.
-- Apply after Phase 10Y. This migration is additive, repeatable, and performs
-- no content installation/publication, image upload, run creation, mode change,
-- UI-stage change, or Millum profile mutation.

begin;

-- Reference guidance remains manager-maintained for active countable locations,
-- and may also be enabled explicitly for an active operational pick face such
-- as Express Shelf without making that pick face a Stock Count assignment.
create or replace function public.inventory_validate_reference_guidance()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if not exists (
    select 1 from public.inventory_locations location
    where location.id = new.location_id
      and location.organization_id = new.organization_id
      and location.active
      and (
        location.countable
        or coalesce((location.metadata->>'referenceGuidanceEnabled')::boolean, false)
      )
  ) then
    raise exception 'Reference guidance requires an active enabled location in the same organization.';
  end if;
  new.caption := nullif(trim(coalesce(new.caption, '')), '');
  if new.object_path is not null
     and not public.inventory_reference_image_path_valid(new.organization_id, new.location_id, new.object_path) then
    raise exception 'Reference image object path is invalid for this organization and location.';
  end if;
  return new;
end;
$$;

do $phase10z$
declare
  v_org uuid;
  v_workbar uuid;
  v_main_storage uuid;
  v_milk_fridge uuid;
  v_express_shelf uuid;
  v_planeta_before jsonb;
  v_planeta_after jsonb;
  v_profile_before text;
  v_profile_after text;
  v_expected_refs text[] := array[
    '9082081','4000232','9020587','9031232','9078232',
    '9082082','4026939','9082515','4004935','4057913'
  ];
  v_expected_ids uuid[] := array[
    '6bc1e704-9a6a-440d-81ff-9ee6c4b9b284'::uuid,
    'c4b469cb-498a-474d-874f-e65558071d50'::uuid,
    'bcf2dcbd-db37-481b-b1d4-1028bc57f8c1'::uuid,
    'bf0e5c33-f877-46ef-b88f-69d6bf691f8d'::uuid,
    '79df4e73-8b8f-4b90-8ad4-163897663331'::uuid,
    'de5a5358-9f7f-4bad-afe9-2e11473cc8b9'::uuid,
    'ca6eed4f-775d-41ff-96d2-edcafb2a1ecb'::uuid,
    '430bac91-ffd8-4d07-957b-73f1e2372e22'::uuid,
    'ba83b551-f408-40d1-8325-22b5f2edafe9'::uuid,
    'b9895c67-32ab-41f3-85bb-8266fd0a31cd'::uuid
  ];
  v_index integer;
  v_legacy record;
begin
  -- The exact Planeta UUID makes this a production-shaped opt-in. Generic test
  -- organizations without the reviewed catalogue remain untouched.
  for v_org in
    select organization.id
    from public.organizations organization
    where exists (
      select 1 from public.inventory_products product
      where product.organization_id = organization.id
        and product.id = '73054357-e1af-423b-bf8a-1c32968275f5'::uuid
        and product.millum_item_ref = '2295798'
    )
      and exists (
        select 1 from public.inventory_locations location
        where location.organization_id = organization.id
          and upper(trim(location.code)) = 'WORKBAR'
      )
      and exists (
        select 1 from public.inventory_locations location
        where location.organization_id = organization.id
          and upper(trim(location.code)) = 'MAIN_STORAGE'
      )
  loop
    if (select count(*) from public.inventory_locations location
        where location.organization_id = v_org and upper(trim(location.code)) = 'WORKBAR') <> 1 then
      raise exception 'Phase 10Z requires exactly one WORKBAR location for organization %.', v_org;
    end if;
    if (select count(*) from public.inventory_locations location
        where location.organization_id = v_org and upper(trim(location.code)) = 'MAIN_STORAGE') <> 1 then
      raise exception 'Phase 10Z requires exactly one MAIN_STORAGE location for organization %.', v_org;
    end if;

    select location.id into v_workbar from public.inventory_locations location
    where location.organization_id = v_org and upper(trim(location.code)) = 'WORKBAR' for update;
    select location.id into v_main_storage from public.inventory_locations location
    where location.organization_id = v_org and upper(trim(location.code)) = 'MAIN_STORAGE' for update;

    select to_jsonb(product) into v_planeta_before
    from public.inventory_products product
    where product.organization_id = v_org
      and product.id = '73054357-e1af-423b-bf8a-1c32968275f5'::uuid
      and product.millum_item_ref = '2295798'
      and product.active
      and product.ownership_status = 'owned';
    if v_planeta_before is null then
      raise exception 'Phase 10Z Planeta identity guard failed for organization %.', v_org;
    end if;

    select md5(coalesce(string_agg(value, E'\n' order by value), '')) into v_profile_before
    from (
      select 'profile|' || to_jsonb(profile)::text value
      from public.inventory_millum_export_profiles profile where profile.organization_id = v_org
      union all
      select 'row|' || to_jsonb(row_value)::text
      from public.inventory_millum_export_rows row_value where row_value.organization_id = v_org
      union all
      select 'transform|' || to_jsonb(transform)::text
      from inventory_private.inventory_millum_export_transforms transform
      join public.inventory_millum_export_profiles profile on profile.id = transform.profile_id
      where profile.organization_id = v_org
    ) immutable_profile;

    if (select count(*) from public.inventory_millum_export_profiles profile
        where profile.organization_id = v_org and profile.profile_key = 'my-work-bar-jul'
          and profile.profile_version = 2 and profile.status = 'published') <> 1 then
      raise exception 'Phase 10Z requires one published immutable Millum profile v2 for organization %.', v_org;
    end if;
    if exists (
      select 1 from public.inventory_millum_export_profiles profile
      where profile.organization_id = v_org and profile.profile_version >= 3
    ) then raise exception 'Phase 10Z refuses an unexpected Millum profile v3 or later.'; end if;

    for v_index in 1..array_length(v_expected_refs, 1)
    loop
      if (select count(*) from public.inventory_products product
          where product.organization_id = v_org
            and product.id = v_expected_ids[v_index]
            and product.millum_item_ref = v_expected_refs[v_index]
            and product.active and product.ownership_status = 'owned') <> 1 then
        raise exception 'Phase 10Z product identity guard failed for Millum item %.', v_expected_refs[v_index];
      end if;
      if (select count(*)
          from public.inventory_millum_export_rows export_row
          join public.inventory_millum_export_profiles profile on profile.id = export_row.profile_id
          where profile.organization_id = v_org and profile.profile_key = 'my-work-bar-jul'
            and profile.profile_version = 2 and profile.status = 'published'
            and export_row.enabled and export_row.mapped_product_id = v_expected_ids[v_index]) <> 1 then
        raise exception 'Phase 10Z requires one enabled profile-v2 row for Millum item %.', v_expected_refs[v_index];
      end if;
    end loop;
    if exists (
      select 1 from public.inventory_millum_export_rows export_row
      join public.inventory_millum_export_profiles profile on profile.id = export_row.profile_id
      where profile.organization_id = v_org and profile.profile_version = 2
        and export_row.enabled
        and export_row.mapped_product_id = '73054357-e1af-423b-bf8a-1c32968275f5'::uuid
    ) then raise exception 'Planeta must remain outside immutable profile v2.'; end if;

    update public.inventory_locations location
    set name = 'Main Storage Fridge',
        description = 'One combined Stock Count across Left Reserve, Express Shelf and Keg Storage.',
        metadata = location.metadata || jsonb_build_object(
          'phase10zAligned', true,
          'orientation', 'Left and right are always described while standing in front of and facing the Main Storage Fridge.',
          'zones', jsonb_build_array(
            jsonb_build_object('key','left-reserve','name','Left Reserve','position','left'),
            jsonb_build_object('key','express-shelf','name','Express Shelf','position','middle'),
            jsonb_build_object('key','keg-storage','name','Keg Storage','position','right')
          ),
          'countScope', 'combined-main-storage',
          'refillChain', jsonb_build_array('Service fridge','Express Shelf','Left Reserve'),
          'kegStorageInRefillChain', false
        )
    where location.id = v_main_storage
      and (
        location.name is distinct from 'Main Storage Fridge'
        or location.description is distinct from 'One combined Stock Count across Left Reserve, Express Shelf and Keg Storage.'
        or not location.metadata @> jsonb_build_object(
          'phase10zAligned', true,
          'orientation', 'Left and right are always described while standing in front of and facing the Main Storage Fridge.',
          'zones', jsonb_build_array(
            jsonb_build_object('key','left-reserve','name','Left Reserve','position','left'),
            jsonb_build_object('key','express-shelf','name','Express Shelf','position','middle'),
            jsonb_build_object('key','keg-storage','name','Keg Storage','position','right')
          ),
          'countScope', 'combined-main-storage',
          'refillChain', jsonb_build_array('Service fridge','Express Shelf','Left Reserve'),
          'kegStorageInRefillChain', false
        )
      );

    insert into public.inventory_locations (
      organization_id, name, code, location_type, parent_location_id,
      description, active, countable, sort_order, metadata
    )
    select v_org, 'Express Shelf', 'MAIN_STORAGE_EXPRESS_SHELF', 'shelf', v_main_storage,
      'Fast pick-up point for daily fridge replenishment', true, false, 41,
      jsonb_build_object(
        'phase10zAligned', true, 'countabilityLocked', true,
        'referenceGuidanceEnabled', true,
        'standardStatus', 'Saved standard incomplete — manager setup required.',
        'imageStatus', 'Default image awaiting upload.',
        'countScope', 'combined-main-storage',
        'contributesToStorageTarget', false
      )
    where not exists (
      select 1 from public.inventory_locations location
      where location.organization_id = v_org
        and upper(trim(location.code)) = 'MAIN_STORAGE_EXPRESS_SHELF'
    );
    if (select count(*) from public.inventory_locations location
        where location.organization_id = v_org and upper(trim(location.code)) = 'MAIN_STORAGE_EXPRESS_SHELF') <> 1 then
      raise exception 'Phase 10Z requires exactly one Express Shelf.';
    end if;
    select location.id into v_express_shelf from public.inventory_locations location
    where location.organization_id = v_org and upper(trim(location.code)) = 'MAIN_STORAGE_EXPRESS_SHELF' for update;
    update public.inventory_locations location
    set name = 'Express Shelf', location_type = 'shelf', parent_location_id = v_main_storage,
        description = 'Fast pick-up point for daily fridge replenishment', active = true,
        countable = false, sort_order = 41,
        metadata = location.metadata || jsonb_build_object(
          'phase10zAligned', true, 'countabilityLocked', true,
          'referenceGuidanceEnabled', true,
          'standardStatus', case when exists (
            select 1 from public.inventory_location_products standard
            where standard.location_id = location.id and standard.active
          ) then 'Manager-maintained saved standard.' else 'Saved standard incomplete — manager setup required.' end,
          'imageStatus', case when exists (
            select 1 from public.inventory_location_reference_guidance guidance
            where guidance.location_id = location.id and guidance.object_path is not null
          ) then 'Current manager image available.' else 'Default image awaiting upload.' end,
          'countScope', 'combined-main-storage', 'contributesToStorageTarget', false
        )
    where location.id = v_express_shelf
      and (
        location.name is distinct from 'Express Shelf'
        or location.location_type is distinct from 'shelf'
        or location.parent_location_id is distinct from v_main_storage
        or location.description is distinct from 'Fast pick-up point for daily fridge replenishment'
        or location.active is distinct from true
        or location.countable is distinct from false
        or location.sort_order is distinct from 41
        or not location.metadata @> jsonb_build_object(
          'phase10zAligned', true, 'countabilityLocked', true,
          'referenceGuidanceEnabled', true,
          'standardStatus', case when exists (
            select 1 from public.inventory_location_products standard
            where standard.location_id = location.id and standard.active
          ) then 'Manager-maintained saved standard.' else 'Saved standard incomplete — manager setup required.' end,
          'imageStatus', case when exists (
            select 1 from public.inventory_location_reference_guidance guidance
            where guidance.location_id = location.id and guidance.object_path is not null
          ) then 'Current manager image available.' else 'Default image awaiting upload.' end,
          'countScope', 'combined-main-storage', 'contributesToStorageTarget', false
        )
      );
    if exists (
      select 1 from public.inventory_location_products standard
      where standard.location_id = v_express_shelf
        and (standard.contributes_to_storage_target or standard.stock_policy <> 'physical_count_only')
    ) then raise exception 'Express Shelf standards cannot create targets or reserve contributions.'; end if;

    insert into public.inventory_locations (
      organization_id, name, code, location_type, parent_location_id,
      description, active, countable, sort_order, metadata
    )
    select v_org, 'Workbar Milk Fridge', 'WORKBAR_MILK_FRIDGE', 'fridge', v_workbar,
      'Top shelf exactly 2 regular milk and 2 Oatly. Lower shelves opened and visibly date-labelled wine only. Keep powered on.',
      true, true, 26,
      jsonb_build_object(
        'phase10zAligned', true, 'referenceGuidanceEnabled', true,
        'permanentStandard', jsonb_build_object(
          'topShelf', jsonb_build_object('regularMilk',2,'oatly',2,'routineOnly',true),
          'lowerShelves','opened visibly date-labelled wine only',
          'poweredOn',true,'eventOverrideAllowed',false
        ),
        'stockCountScope','ten-configured-opened-wines-actual-physical-quantity'
      )
    where not exists (
      select 1 from public.inventory_locations location
      where location.organization_id = v_org and upper(trim(location.code)) = 'WORKBAR_MILK_FRIDGE'
    );
    if (select count(*) from public.inventory_locations location
        where location.organization_id = v_org and upper(trim(location.code)) = 'WORKBAR_MILK_FRIDGE') <> 1 then
      raise exception 'Phase 10Z requires exactly one Workbar Milk Fridge.';
    end if;
    select location.id into v_milk_fridge from public.inventory_locations location
    where location.organization_id = v_org and upper(trim(location.code)) = 'WORKBAR_MILK_FRIDGE' for update;
    update public.inventory_locations location
    set name = 'Workbar Milk Fridge', location_type = 'fridge', parent_location_id = v_workbar,
        description = 'Top shelf exactly 2 regular milk and 2 Oatly. Lower shelves opened and visibly date-labelled wine only. Keep powered on.',
        active = true, countable = true, sort_order = 26,
        metadata = location.metadata || jsonb_build_object(
          'phase10zAligned', true, 'referenceGuidanceEnabled', true,
          'permanentStandard', jsonb_build_object(
            'topShelf', jsonb_build_object('regularMilk',2,'oatly',2,'routineOnly',true),
            'lowerShelves','opened visibly date-labelled wine only',
            'poweredOn',true,'eventOverrideAllowed',false
          ),
          'stockCountScope','ten-configured-opened-wines-actual-physical-quantity'
        )
    where location.id = v_milk_fridge
      and (
        location.name is distinct from 'Workbar Milk Fridge'
        or location.location_type is distinct from 'fridge'
        or location.parent_location_id is distinct from v_workbar
        or location.description is distinct from 'Top shelf exactly 2 regular milk and 2 Oatly. Lower shelves opened and visibly date-labelled wine only. Keep powered on.'
        or location.active is distinct from true
        or location.countable is distinct from true
        or location.sort_order is distinct from 26
        or not location.metadata @> jsonb_build_object(
          'phase10zAligned', true, 'referenceGuidanceEnabled', true,
          'permanentStandard', jsonb_build_object(
            'topShelf', jsonb_build_object('regularMilk',2,'oatly',2,'routineOnly',true),
            'lowerShelves','opened visibly date-labelled wine only',
            'poweredOn',true,'eventOverrideAllowed',false
          ),
          'stockCountScope','ten-configured-opened-wines-actual-physical-quantity'
        )
      );

    if exists (
      select 1 from public.inventory_location_products standard
      where standard.location_id = v_milk_fridge
        and standard.product_id <> all(v_expected_ids)
    ) then raise exception 'Workbar Milk Fridge contains an unreviewed product link.'; end if;
    if exists (
      select 1 from public.inventory_location_products standard
      where standard.location_id = v_milk_fridge
        and standard.product_id = '73054357-e1af-423b-bf8a-1c32968275f5'::uuid
    ) then raise exception 'Planeta must remain unlinked from Workbar Milk Fridge.'; end if;

    for v_index in 1..array_length(v_expected_ids, 1)
    loop
      insert into public.inventory_location_products (
        organization_id, location_id, product_id, par_quantity,
        count_order, active, notes, stock_policy,
        contributes_to_storage_target, historical_suggestion_quantity,
        historical_suggestion_note, historical_suggestion_source, metadata
      ) values (
        v_org, v_milk_fridge, v_expected_ids[v_index], 0,
        v_index, true,
        'Opened and visibly date-labelled wine only. Count the actual physical quantity stored in this refrigerator.',
        'physical_count_only', false, null, null, null,
        jsonb_build_object('phase10zAligned',true,'actualPhysicalQuantityOnly',true)
      ) on conflict (location_id, product_id) do update
      set par_quantity = 0, count_order = excluded.count_order, active = true,
          notes = excluded.notes, stock_policy = 'physical_count_only',
          contributes_to_storage_target = false,
          historical_suggestion_quantity = null,
          historical_suggestion_note = null,
          historical_suggestion_source = null,
          metadata = public.inventory_location_products.metadata || excluded.metadata
      where public.inventory_location_products.organization_id = excluded.organization_id
        and (
          public.inventory_location_products.par_quantity is distinct from 0
          or public.inventory_location_products.count_order is distinct from excluded.count_order
          or public.inventory_location_products.active is distinct from true
          or public.inventory_location_products.notes is distinct from excluded.notes
          or public.inventory_location_products.stock_policy is distinct from 'physical_count_only'
          or public.inventory_location_products.contributes_to_storage_target is distinct from false
          or public.inventory_location_products.historical_suggestion_quantity is not null
          or public.inventory_location_products.historical_suggestion_note is not null
          or public.inventory_location_products.historical_suggestion_source is not null
          or not public.inventory_location_products.metadata @> excluded.metadata
        );
    end loop;
    if (select count(*) from public.inventory_location_products standard
        where standard.location_id = v_milk_fridge and standard.active) <> 10 then
      raise exception 'Workbar Milk Fridge must have exactly ten active wine links.';
    end if;
    if exists (
      select 1 from public.inventory_location_products standard
      where standard.location_id = v_milk_fridge and standard.active
        and (standard.stock_policy <> 'physical_count_only'
          or standard.par_quantity <> 0
          or standard.contributes_to_storage_target
          or standard.historical_suggestion_quantity is not null)
    ) then raise exception 'Workbar Milk Fridge wine policy normalization failed.'; end if;

    insert into public.inventory_location_reference_guidance (
      organization_id, location_id, caption
    ) values (
      v_org, v_milk_fridge,
      'Top shelf exactly 2 regular milk and 2 Oatly. Lower shelves: opened and visibly date-labelled wine only. Keep the refrigerator powered on.'
    ) on conflict (organization_id, location_id) do nothing;
    insert into public.inventory_location_reference_guidance (
      organization_id, location_id, caption
    ) values (
      v_org, v_express_shelf,
      'Fill the service fridge from Express Shelf first. Restore Express Shelf from Left Reserve. Confirm both current saved standards.'
    ) on conflict (organization_id, location_id) do nothing;

    update public.inventory_locations location
    set name = 'Workbar Coffee Station',
        metadata = location.metadata || jsonb_build_object('phase10zAligned',true)
    where location.organization_id = v_org and upper(trim(location.code)) = 'WORKBAR_COFFEE'
      and (location.name is distinct from 'Workbar Coffee Station'
        or not location.metadata @> jsonb_build_object('phase10zAligned',true));
    if not exists (select 1 from public.inventory_locations location
        where location.organization_id = v_org and upper(trim(location.code)) = 'WORKBAR_COFFEE') then
      raise exception 'WORKBAR_COFFEE identity is required.';
    end if;
    update public.inventory_locations location
    set name = 'Workbar Snack Shelf', countable = false,
        metadata = location.metadata || jsonb_build_object(
          'phase10zAligned',true,'countabilityLocked',true,'referenceGuidanceEnabled',true,
          'standardStatus','Setup in progress — standard awaiting completion.',
          'imageStatus','Default image awaiting upload.'
        )
    where location.organization_id = v_org and upper(trim(location.code)) = 'WORKBAR_SNACKS'
      and (
        location.name is distinct from 'Workbar Snack Shelf'
        or location.countable is distinct from false
        or not location.metadata @> jsonb_build_object(
          'phase10zAligned',true,'countabilityLocked',true,'referenceGuidanceEnabled',true,
          'standardStatus','Setup in progress — standard awaiting completion.',
          'imageStatus','Default image awaiting upload.'
        )
      );
    if not exists (select 1 from public.inventory_locations location
        where location.organization_id = v_org and upper(trim(location.code)) = 'WORKBAR_SNACKS') then
      raise exception 'WORKBAR_SNACKS identity is required.';
    end if;

    for v_legacy in
      select location.* from public.inventory_locations location
      where location.organization_id = v_org
        and upper(trim(location.code)) in (
          'BEVERAGE_STORAGE','BEVERAGE_STORAGE_BOTTLES','BEVERAGE_STORAGE_COCKTAIL',
          'BEVERAGE_STORAGE_EVENT_RESERVE','BEVERAGE_STORAGE_DORMANT_SPIRITS','BEVERAGE_STORAGE_KEGS'
        ) for update
    loop
      if exists (select 1 from public.inventory_location_products row_value where row_value.location_id = v_legacy.id)
        or exists (select 1 from public.inventory_count_lines row_value where row_value.location_id = v_legacy.id)
        or exists (select 1 from public.inventory_count_assignments row_value where row_value.location_id = v_legacy.id)
        or exists (select 1 from public.inventory_location_reference_guidance row_value where row_value.location_id = v_legacy.id)
        or exists (select 1 from public.inventory_refrigerator_templates row_value where row_value.location_id = v_legacy.id)
        or exists (select 1 from public.inventory_catalogue_unresolved_mappings row_value where row_value.location_id = v_legacy.id)
      then raise exception 'Legacy Beverage Storage location % has an operative dependency.', v_legacy.code; end if;
      update public.inventory_locations location
      set active = false, countable = false,
          metadata = location.metadata || jsonb_build_object(
            'phase10zAligned',true,'retiredBy','phase10z','retiredReason','dependency-free legacy placeholder',
            'canonicalMapping', case when upper(trim(location.code)) = 'BEVERAGE_STORAGE_KEGS'
              then 'Main Storage Fridge / Keg Storage'
              else 'Main Storage Fridge / Left Reserve' end
          )
      where location.id = v_legacy.id
        and (
          location.active is distinct from false
          or location.countable is distinct from false
          or not location.metadata @> jsonb_build_object(
            'phase10zAligned',true,'retiredBy','phase10z','retiredReason','dependency-free legacy placeholder',
            'canonicalMapping', case when upper(trim(location.code)) = 'BEVERAGE_STORAGE_KEGS'
              then 'Main Storage Fridge / Keg Storage'
              else 'Main Storage Fridge / Left Reserve' end
          )
        );
    end loop;

    -- Negative scope guards: no milk/Oatly product or generic Other Wine is
    -- introduced, Dry Storage is never targeted, and Planeta remains unchanged.
    if exists (
      select 1 from public.inventory_location_products standard
      join public.inventory_products product on product.id = standard.product_id
      where standard.location_id = v_milk_fridge
        and (lower(product.name) ~ '(milk|oatly|oat milk|test oatly)'
          or lower(product.name) in ('other wine','opened wine not listed'))
    ) then raise exception 'Phase 10Z cannot create milk, Oatly, or generic wine count lines.'; end if;

    select to_jsonb(product) into v_planeta_after
    from public.inventory_products product
    where product.organization_id = v_org
      and product.id = '73054357-e1af-423b-bf8a-1c32968275f5'::uuid;
    if v_planeta_after is distinct from v_planeta_before then
      raise exception 'Phase 10Z must preserve the Planeta product record byte-for-byte.';
    end if;
    select md5(coalesce(string_agg(value, E'\n' order by value), '')) into v_profile_after
    from (
      select 'profile|' || to_jsonb(profile)::text value
      from public.inventory_millum_export_profiles profile where profile.organization_id = v_org
      union all
      select 'row|' || to_jsonb(row_value)::text
      from public.inventory_millum_export_rows row_value where row_value.organization_id = v_org
      union all
      select 'transform|' || to_jsonb(transform)::text
      from inventory_private.inventory_millum_export_transforms transform
      join public.inventory_millum_export_profiles profile on profile.id = transform.profile_id
      where profile.organization_id = v_org
    ) immutable_profile;
    if v_profile_after is distinct from v_profile_before then
      raise exception 'Phase 10Z must preserve every Millum profile, row, and transform.';
    end if;
  end loop;
end;
$phase10z$;

-- Active non-countable operational pick faces may own manager-maintained
-- written/image guidance without becoming Stock Count assignments.
create or replace function public.set_inventory_location_reference_guidance(
  input_location_id uuid,
  input_object_path text,
  input_caption text,
  input_mime_type text,
  input_byte_size bigint,
  input_original_file_name text,
  input_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_location public.inventory_locations%rowtype;
  v_existing public.inventory_location_reference_guidance%rowtype;
  v_guidance public.inventory_location_reference_guidance%rowtype;
  v_caption text := nullif(trim(coalesce(input_caption, '')), '');
  v_cleanup_path text;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  select location.* into v_location from public.inventory_locations location
  where location.id = input_location_id and location.organization_id = v_actor.organization_id;
  if v_location.id is null or not v_location.active
     or not (v_location.countable or coalesce((v_location.metadata->>'referenceGuidanceEnabled')::boolean, false)) then
    raise exception 'Active inventory location with reference guidance enabled was not found in this organization.';
  end if;
  if v_caption is not null and char_length(v_caption) > 500 then raise exception 'Reference caption cannot exceed 500 characters.'; end if;
  if input_object_path is not null then
    if input_mime_type not in ('image/jpeg','image/png','image/webp') then raise exception 'Reference image type must be JPEG, PNG, or WebP.'; end if;
    if input_byte_size is null or input_byte_size <= 0 or input_byte_size > 5242880 then raise exception 'Reference image must be no larger than 5 MB.'; end if;
    if nullif(trim(coalesce(input_original_file_name,'')), '') is null or char_length(input_original_file_name) > 255 then raise exception 'Reference image file name is invalid.'; end if;
    if not public.inventory_reference_image_path_valid(v_actor.organization_id,input_location_id,input_object_path) then raise exception 'Reference image object path is invalid for this organization and location.'; end if;
  elsif input_mime_type is not null or input_byte_size is not null or input_original_file_name is not null then
    raise exception 'Reference image metadata requires an object path.';
  end if;
  select guidance.* into v_existing from public.inventory_location_reference_guidance guidance
  where guidance.organization_id = v_actor.organization_id and guidance.location_id = input_location_id for update;
  if coalesce(input_expected_revision,0) <> coalesce(v_existing.revision,0) then raise exception 'Reference guidance changed on another device. Refresh before saving.'; end if;
  if v_existing.object_path is not null and v_existing.object_path is distinct from input_object_path then
    v_cleanup_path := v_existing.object_path;
    insert into public.inventory_reference_image_cleanup_queue(organization_id,location_id,object_path,cleanup_reason)
    values(v_actor.organization_id,input_location_id,v_cleanup_path,'replaced')
    on conflict (organization_id,object_path) where completed_at is null do nothing;
  end if;
  if v_existing.id is null then
    insert into public.inventory_location_reference_guidance(
      organization_id,location_id,object_path,caption,mime_type,byte_size,original_file_name,
      created_by_auth_user_id,updated_by_auth_user_id
    ) values(
      v_actor.organization_id,input_location_id,input_object_path,v_caption,input_mime_type,input_byte_size,
      input_original_file_name,v_actor.actor_auth_user_id,v_actor.actor_auth_user_id
    ) returning * into v_guidance;
  else
    update public.inventory_location_reference_guidance guidance
    set object_path=input_object_path,caption=v_caption,mime_type=input_mime_type,byte_size=input_byte_size,
        original_file_name=input_original_file_name,revision=guidance.revision+1,
        updated_by_auth_user_id=v_actor.actor_auth_user_id
    where guidance.id=v_existing.id returning * into v_guidance;
  end if;
  return jsonb_build_object('id',v_guidance.id,'location_id',v_guidance.location_id,
    'object_path',v_guidance.object_path,'caption',v_guidance.caption,'mime_type',v_guidance.mime_type,
    'byte_size',v_guidance.byte_size,'original_file_name',v_guidance.original_file_name,
    'revision',v_guidance.revision,'updated_at',v_guidance.updated_at,'cleanup_path',v_cleanup_path);
end;
$$;

create or replace function public.set_inventory_location_countable(
  input_location_id uuid,
  input_countable boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_location public.inventory_locations%rowtype;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  if input_countable is null then raise exception 'Countable state is required.'; end if;
  select location.* into v_location from public.inventory_locations location
  where location.id=input_location_id and location.organization_id=v_actor.organization_id for update;
  if v_location.id is null then raise exception 'Inventory location was not found in this organization.'; end if;
  if coalesce((v_location.metadata->>'countabilityLocked')::boolean,false) then
    raise exception 'This location count scope is locked by the approved physical-layout contract.';
  end if;
  insert into public.inventory_storage_settings(organization_id,location_scope_initialized_at,created_by_auth_user_id,updated_by_auth_user_id)
  values(v_actor.organization_id,now(),v_actor.actor_auth_user_id,v_actor.actor_auth_user_id)
  on conflict(organization_id) do nothing;
  update public.inventory_locations location set countable=input_countable,updated_by_auth_user_id=v_actor.actor_auth_user_id
  where location.id=v_location.id and location.countable is distinct from input_countable returning * into v_location;
  if v_location.id is null then select location.* into v_location from public.inventory_locations location where location.id=input_location_id; end if;
  return jsonb_build_object('id',v_location.id,'countable',v_location.countable,'updated_at',v_location.updated_at);
end;
$$;

create or replace function public.report_inventory_counter_unlisted_wine(
  input_assignment_id uuid,
  input_visible_product_name text,
  input_note text,
  input_expected_assignment_revision bigint,
  input_expected_session_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_assignment public.inventory_count_assignments%rowtype;
  v_session public.inventory_count_sessions%rowtype;
  v_location public.inventory_locations%rowtype;
  v_attention_id uuid := gen_random_uuid();
  v_name text := nullif(trim(coalesce(input_visible_product_name,'')), '');
  v_note text := nullif(trim(coalesce(input_note,'')), '');
  v_record jsonb;
begin
  select * into v_actor from public.inventory_resolve_counter();
  if v_name is null or char_length(v_name) > 160 then raise exception 'Visible product name is required and cannot exceed 160 characters.'; end if;
  if v_note is not null and char_length(v_note) > 1000 then raise exception 'Unlisted wine note cannot exceed 1000 characters.'; end if;
  v_assignment := public.inventory_counter_lock_assignment(
    input_assignment_id,input_expected_assignment_revision,true,'recording an unlisted opened wine'
  );
  select location.* into v_location from public.inventory_locations location
  where location.id=v_assignment.location_id and location.organization_id=v_assignment.organization_id;
  if upper(trim(coalesce(v_location.code,''))) <> 'WORKBAR_MILK_FRIDGE' then
    raise exception 'Opened wine manager attention is available only for Workbar Milk Fridge.';
  end if;
  select session.* into v_session from public.inventory_count_sessions session
  where session.id=v_assignment.session_id and session.organization_id=v_assignment.organization_id for update;
  if input_expected_session_updated_at is null or v_session.updated_at is distinct from input_expected_session_updated_at then
    raise exception 'This Stock Count changed on another device. Refresh before recording the unlisted wine.';
  end if;
  v_record := jsonb_build_object(
    'id',v_attention_id,'type','unlisted_opened_wine','status','open',
    'assignmentId',v_assignment.id,'locationId',v_assignment.location_id,
    'visibleProductName',v_name,'note',v_note,
    'reportedAt',now(),'reportedByAuthUserId',v_actor.actor_auth_user_id,
    'reportedByName',v_actor.actor_name,
    'frontlineMessage','This wine is not configured for Stock Count. Record it for manager review. Do not count it under another product.'
  );
  update public.inventory_count_sessions session
  set metadata=jsonb_set(
        jsonb_set(coalesce(session.metadata,'{}'::jsonb),'{inventoryManagerAttention}',
          case when jsonb_typeof(session.metadata->'inventoryManagerAttention')='object'
            then session.metadata->'inventoryManagerAttention' else '{}'::jsonb end,true),
        array['inventoryManagerAttention',v_attention_id::text],v_record,true
      ),
      updated_at=now()
  where session.id=v_session.id returning * into v_session;
  return jsonb_build_object('attention',v_record,'session_updated_at',v_session.updated_at);
end;
$$;

create or replace function public.resolve_inventory_unlisted_wine_attention(
  input_assignment_id uuid,
  input_attention_id uuid,
  input_resolution_note text,
  input_expected_assignment_revision bigint,
  input_expected_session_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_assignment public.inventory_count_assignments%rowtype;
  v_session public.inventory_count_sessions%rowtype;
  v_record jsonb;
  v_note text := nullif(trim(coalesce(input_resolution_note,'')), '');
begin
  if not public.current_user_can_manage_inventory_config() or public.current_user_is_shared_device() then
    raise exception 'Active non-shared manager access is required to resolve Stock Count attention.';
  end if;
  select * into v_actor from public.inventory_resolve_actor(null);
  if input_attention_id is null then raise exception 'Manager-attention identity is required.'; end if;
  if v_note is null or char_length(v_note) > 1000 then raise exception 'A resolution note is required and cannot exceed 1000 characters.'; end if;
  v_assignment := public.inventory_manager_lock_assignment(
    input_assignment_id,input_expected_assignment_revision,'resolving unlisted opened wine attention'
  );
  select session.* into v_session from public.inventory_count_sessions session
  where session.id=v_assignment.session_id and session.organization_id=v_assignment.organization_id for update;
  if input_expected_session_updated_at is null or v_session.updated_at is distinct from input_expected_session_updated_at then
    raise exception 'This Stock Count changed on another device. Refresh before resolving manager attention.';
  end if;
  v_record := v_session.metadata #> array['inventoryManagerAttention',input_attention_id::text];
  if v_record is null or v_record->>'type' <> 'unlisted_opened_wine'
     or v_record->>'assignmentId' <> v_assignment.id::text then
    raise exception 'Unlisted wine manager attention was not found for this assignment.';
  end if;
  if v_record->>'status' <> 'open' then
    return jsonb_build_object('attention',v_record,'session_updated_at',v_session.updated_at,'idempotentReplay',true);
  end if;
  v_record := v_record || jsonb_build_object(
    'status','resolved','resolutionNote',v_note,'resolvedAt',now(),
    'resolvedByAuthUserId',v_actor.actor_auth_user_id,'resolvedByName',v_actor.actor_name
  );
  update public.inventory_count_sessions session
  set metadata=jsonb_set(session.metadata,array['inventoryManagerAttention',input_attention_id::text],v_record,false),
      updated_at=now()
  where session.id=v_session.id returning * into v_session;
  return jsonb_build_object('attention',v_record,'session_updated_at',v_session.updated_at,'idempotentReplay',false);
end;
$$;

create or replace function public.accept_inventory_count_assignment(
  input_assignment_id uuid,
  input_expected_assignment_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_assignment public.inventory_count_assignments%rowtype;
  v_session public.inventory_count_sessions%rowtype;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  v_assignment := public.inventory_manager_lock_assignment(
    input_assignment_id,input_expected_assignment_revision,'accepting this refrigerator'
  );
  if v_assignment.state <> 'submitted' then raise exception 'Only a submitted refrigerator can be accepted.'; end if;
  select session.* into v_session from public.inventory_count_sessions session
  where session.id=v_assignment.session_id and session.organization_id=v_assignment.organization_id for update;
  if exists (
    select 1 from jsonb_each(coalesce(v_session.metadata->'inventoryManagerAttention','{}'::jsonb)) attention
    where attention.value->>'type'='unlisted_opened_wine'
      and attention.value->>'assignmentId'=v_assignment.id::text
      and attention.value->>'status'='open'
  ) then raise exception 'Resolve every unlisted opened wine manager-attention record before accepting this location.'; end if;
  update public.inventory_count_assignments assignment
  set state='accepted',revision=assignment.revision+1,accepted_at=now(),
      accepted_by_auth_user_id=v_actor.actor_auth_user_id,accepted_by_name=v_actor.actor_name
  where assignment.id=v_assignment.id returning * into v_assignment;
  update public.inventory_count_sessions session set updated_at=now() where session.id=v_assignment.session_id;
  return jsonb_build_object('id',v_assignment.id,'state',v_assignment.state,
    'revision',v_assignment.revision,'accepted_at',v_assignment.accepted_at);
end;
$$;

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
  select coalesce(jsonb_agg(assignment_record order by assignment_record->'location'->>'name'),'[]'::jsonb)
  into v_assignments
  from (
    select jsonb_build_object(
      'id',assignment.id,'state',assignment.state,'revision',assignment.revision,
      'assigned_at',assignment.assigned_at,'submitted_at',assignment.submitted_at,
      'returned_at',assignment.returned_at,'accepted_at',assignment.accepted_at,
      'return_message',assignment.return_message,
      'session',jsonb_build_object(
        'id',session.id,'title',session.title,'count_date',session.count_date,
        'status',session.status,'metadata',session.metadata,'updated_at',session.updated_at
      ),
      'location',jsonb_build_object(
        'id',location.id,'name',location.name,'code',location.code,
        'location_type',location.location_type,'description',location.description,
        'metadata',location.metadata
      ),
      'reference_guidance',(
        select jsonb_build_object(
          'location_id',guidance.location_id,'object_path',guidance.object_path,
          'caption',guidance.caption,'mime_type',guidance.mime_type,'byte_size',guidance.byte_size,
          'revision',guidance.revision,'updated_at',guidance.updated_at
        ) from public.inventory_location_reference_guidance guidance
        where guidance.organization_id=assignment.organization_id and guidance.location_id=assignment.location_id
      ),
      'lines',(
        select coalesce(jsonb_agg(jsonb_build_object(
          'id',line.id,'location_id',line.location_id,'product_id',line.product_id,
          'product_name_snapshot',line.product_name_snapshot,'practical_name',product.short_name,
          'millum_item_ref',product.millum_item_ref,'unit_label_snapshot',line.unit_label_snapshot,
          'category_snapshot',line.category_snapshot,'count_order_snapshot',line.count_order_snapshot,
          'product_sort_order_snapshot',line.product_sort_order_snapshot,
          'stock_policy_snapshot',line.stock_policy_snapshot,
          'standard_quantity',case when line.stock_policy_snapshot='physical_count_only' then null
            else coalesce(line.effective_target_quantity_snapshot,line.par_quantity_snapshot) end,
          'historical_suggestion_quantity_snapshot',line.historical_suggestion_quantity_snapshot,
          'historical_suggestion_note_snapshot',line.historical_suggestion_note_snapshot,
          'historical_suggestion_source_snapshot',line.historical_suggestion_source_snapshot,
          'count_mode_snapshot',line.count_mode_snapshot,
          'container_capacity_liters_snapshot',line.container_capacity_liters_snapshot,
          'counted_whole_units',line.counted_whole_units,'counted_open_volume_liters',line.counted_open_volume_liters,
          'counted_full_kegs',line.counted_full_kegs,'counted_partial_keg_fraction',line.counted_partial_keg_fraction,
          'counted_quantity',line.counted_quantity,'count_method',line.count_method,
          'count_status',line.count_status,'note',line.note,'counted_at',line.counted_at,
          'counted_by_name',line.counted_by_name,'updated_at',line.updated_at
        ) order by line.count_order_snapshot,line.product_sort_order_snapshot,line.product_name_snapshot),'[]'::jsonb)
        from public.inventory_count_lines line
        join public.inventory_products product on product.id=line.product_id and product.organization_id=line.organization_id
        where line.session_id=assignment.session_id and line.location_id=assignment.location_id
          and line.organization_id=assignment.organization_id
      )
    ) assignment_record
    from public.inventory_count_assignments assignment
    join public.inventory_count_sessions session on session.id=assignment.session_id and session.organization_id=assignment.organization_id
    join public.inventory_locations location on location.id=assignment.location_id and location.organization_id=assignment.organization_id
    where assignment.organization_id=v_actor.organization_id
      and assignment.counter_membership_id=v_actor.membership_id
      and assignment.state<>'superseded' and session.status in('draft','in_progress')
  ) scoped;
  return jsonb_build_object('assignments',v_assignments,'refreshed_at',now());
end;
$$;

revoke all on function public.report_inventory_counter_unlisted_wine(uuid,text,text,bigint,timestamptz) from public,anon,authenticated;
revoke all on function public.resolve_inventory_unlisted_wine_attention(uuid,uuid,text,bigint,timestamptz) from public,anon,authenticated;
revoke all on function public.get_inventory_counter_workspace() from public,anon,authenticated;
revoke all on function public.accept_inventory_count_assignment(uuid,bigint) from public,anon,authenticated;
revoke all on function public.set_inventory_location_countable(uuid,boolean) from public,anon,authenticated;
revoke all on function public.set_inventory_location_reference_guidance(uuid,text,text,text,bigint,text,bigint) from public,anon,authenticated;
grant execute on function public.report_inventory_counter_unlisted_wine(uuid,text,text,bigint,timestamptz) to authenticated;
grant execute on function public.resolve_inventory_unlisted_wine_attention(uuid,uuid,text,bigint,timestamptz) to authenticated;
grant execute on function public.get_inventory_counter_workspace() to authenticated;
grant execute on function public.accept_inventory_count_assignment(uuid,bigint) to authenticated;
grant execute on function public.set_inventory_location_countable(uuid,boolean) to authenticated;
grant execute on function public.set_inventory_location_reference_guidance(uuid,text,text,text,bigint,text,bigint) to authenticated;

notify pgrst,'reload schema';

commit;

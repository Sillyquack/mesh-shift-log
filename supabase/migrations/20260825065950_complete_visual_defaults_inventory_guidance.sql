begin;

-- Canonical rows are additive. Existing Self-Service rows, assets, visibility,
-- versions, and aliases are deliberately not touched by this migration.
insert into public.visual_standards (
  canonical_key,
  area,
  section,
  label
)
values
  ('workbar-bar-left-fridge-standard', 'Workbar', 'Fridges', 'Workbar Bar Left Fridge standard'),
  ('workbar-bar-right-fridge-standard', 'Workbar', 'Fridges', 'Workbar Bar Right Fridge standard'),
  ('workbar-lower-back-bar-glass-setup-standard', 'Workbar', 'Back bar & glassware', 'Workbar lower back-bar glass setup standard'),
  ('workbar-wine-prosecco-shelf-standard', 'Workbar', 'Back bar & glassware', 'Workbar wine / prosecco shelf standard'),
  ('workbar-back-bar-bottle-layout-standard', 'Workbar', 'Back bar & glassware', 'Workbar back-bar bottle layout standard'),
  ('workbar-hanging-wine-prosecco-glass-layout-standard', 'Workbar', 'Back bar & glassware', 'Workbar hanging wine / prosecco glass layout standard'),
  ('workbar-glass-rack-storage-standard', 'Workbar', 'Back bar & glassware', 'Workbar glass-rack storage standard'),
  ('workbar-cleaning-station-opening-standard', 'Workbar', 'Cleaning station', 'Workbar cleaning-station opening standard'),
  ('workbar-cleaning-station-closing-standard', 'Workbar', 'Cleaning station', 'Workbar cleaning-station closing reset standard'),
  ('workbar-cabinet-below-main-pc-storage-standard', 'Workbar', 'Storage & security', 'Workbar cabinet below main PC storage standard')
on conflict (canonical_key) do nothing;

insert into public.visual_standard_detail_slots (
  visual_standard_id,
  canonical_key,
  detail_key,
  label,
  sort_order
)
select
  standard.id,
  standard.canonical_key,
  seed.detail_key,
  seed.label,
  seed.sort_order
from public.visual_standards standard
join (
  values
    ('workbar-lower-back-bar-glass-setup-standard', 'second-view', 'Second glass-setup view', 1),
    ('workbar-back-bar-bottle-layout-standard', 'right-side-layout', 'Right-side red-wine / spirit layout', 1)
) as seed(canonical_key, detail_key, label, sort_order)
  on seed.canonical_key = standard.canonical_key
on conflict (visual_standard_id, detail_key) do nothing;

-- Workbar Milk Fridge uses the same existing invariant as every other fridge:
-- an active location plus at least one active product. Par, default-restock,
-- and reference-image values remain separate concepts and are not added as
-- verification requirements.
create or replace function public.inventory_phase9g_is_refrigerator(
  input_location_id uuid,
  input_organization_id uuid
)
returns boolean
language sql
stable
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.inventory_locations location
    where location.id = input_location_id
      and location.organization_id = input_organization_id
      and location.active = true
      and upper(trim(location.code)) in (
        'CORNERBAR_LEFT_FRIDGE',
        'CORNERBAR_MIDDLE_FRIDGE',
        'CORNERBAR_RIGHT_FRIDGE',
        'WORKBAR_BAR_LEFT_FRIDGE',
        'WORKBAR_BAR_RIGHT_FRIDGE',
        'WORKBAR_NON_ALCO_FRIDGE',
        'WORKBAR_MILK_FRIDGE'
      )
  );
$$;

insert into public.inventory_refrigerator_templates (
  organization_id,
  location_id,
  template_status
)
select
  location.organization_id,
  location.id,
  'incomplete'
from public.inventory_locations location
where location.active
  and upper(trim(location.code)) = 'WORKBAR_MILK_FRIDGE'
on conflict (organization_id, location_id) do nothing;

-- Express Shelf is intentionally non-countable but explicitly opts into
-- reference guidance. Keep manager authorization and path validation intact
-- while aligning Storage with the already-established database function.
do $storage$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists inventory_reference_images_insert on storage.objects';
    execute $policy$
      create policy inventory_reference_images_insert
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'inventory-location-reference-images'
        and public.current_user_can_manage_inventory_config()
        and public.inventory_reference_image_path_valid(
          public.current_user_organization_id(),
          split_part(storage.objects.name, '/', 2)::uuid,
          storage.objects.name
        )
        and exists (
          select 1
          from public.inventory_locations location
          where location.id = split_part(storage.objects.name, '/', 2)::uuid
            and location.organization_id = public.current_user_organization_id()
            and location.active
            and (
              location.countable
              or coalesce(
                (location.metadata->>'referenceGuidanceEnabled')::boolean,
                false
              )
            )
        )
      )
    $policy$;
  end if;
end;
$storage$;

notify pgrst, 'reload schema';

commit;

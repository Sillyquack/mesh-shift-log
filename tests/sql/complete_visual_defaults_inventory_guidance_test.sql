\set ON_ERROR_STOP on

\ir visual_standards_prelude.sql
\ir ../../supabase/migrations/20260821102613_visual_standards.sql
\ir ../../supabase/migrations/20260821125127_recover_visual_standard_details_and_taxonomy.sql

-- Minimal inventory surface needed to execute the additive completion
-- migration in isolation. The production tables contain additional columns
-- and constraints that are exercised by the repository's inventory migrations.
create table public.inventory_locations (
  id uuid primary key,
  organization_id uuid not null,
  name text not null,
  code text not null,
  location_type text not null,
  active boolean not null default true,
  countable boolean not null default false,
  metadata jsonb not null default '{}'::jsonb
);

create table public.inventory_refrigerator_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null references public.inventory_locations(id),
  template_status text not null default 'incomplete',
  verified_at timestamptz,
  verified_by_auth_user_id uuid,
  verified_by_name text,
  unique (organization_id, location_id)
);

grant select on public.inventory_locations to authenticated;

create or replace function public.current_user_can_manage_inventory_config()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_is_manager();
$$;

create or replace function public.current_user_organization_id()
returns uuid
language sql
stable
as $$
  select '10000000-0000-4000-8000-000000000001'::uuid;
$$;

create or replace function public.inventory_reference_image_path_valid(
  input_organization_id uuid,
  input_location_id uuid,
  input_path text
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select input_path is not null
    and array_length(string_to_array(input_path, '/'), 1) = 3
    and split_part(input_path, '/', 1) = input_organization_id::text
    and split_part(input_path, '/', 2) = input_location_id::text
    and split_part(input_path, '/', 3)
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$';
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inventory-location-reference-images',
  'inventory-location-reference-images',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']::text[]
);

insert into public.inventory_locations (
  id, organization_id, name, code, location_type, active, countable, metadata
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Workbar Milk Fridge',
    'WORKBAR_MILK_FRIDGE',
    'fridge',
    true,
    true,
    '{"referenceGuidanceEnabled":true}'::jsonb
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'Workbar Bar Left Fridge',
    'WORKBAR_BAR_LEFT_FRIDGE',
    'fridge',
    true,
    true,
    '{}'::jsonb
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    'Express Shelf',
    'MAIN_STORAGE_EXPRESS_SHELF',
    'shelf',
    true,
    false,
    '{"referenceGuidanceEnabled":true}'::jsonb
  ),
  (
    '20000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    'Abstract Parent',
    'ABSTRACT_PARENT',
    'bar',
    true,
    false,
    '{}'::jsonb
  );

insert into public.inventory_refrigerator_templates (
  organization_id,
  location_id,
  template_status,
  verified_at,
  verified_by_auth_user_id,
  verified_by_name
)
values (
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  'verified',
  '2026-08-24T10:00:00Z',
  '00000000-0000-0000-0000-000000000001',
  'Existing Manager'
);

create temporary table self_service_before as
select
  canonical_key,
  area,
  section,
  label,
  active_asset_path,
  active_version_id,
  active_version,
  status,
  notes,
  is_visible
from public.visual_standards
where canonical_key like 'self-service-%';

\ir ../../supabase/migrations/20260825065950_complete_visual_defaults_inventory_guidance.sql
\ir ../../supabase/migrations/20260825065950_complete_visual_defaults_inventory_guidance.sql

do $$
begin
  if (
    select count(*)
    from public.visual_standards
    where is_visible
  ) <> 21 then
    raise exception 'Expected 21 visible canonical standards after idempotent application.';
  end if;

  if (
    select count(*)
    from public.visual_standards
    where is_visible and area = 'Workbar'
  ) <> 12 then
    raise exception 'Expected twelve visible Workbar standards.';
  end if;

  if exists (
    (select * from self_service_before
     except
     select canonical_key, area, section, label, active_asset_path,
            active_version_id, active_version, status, notes, is_visible
     from public.visual_standards
     where canonical_key like 'self-service-%')
    union all
    (select canonical_key, area, section, label, active_asset_path,
            active_version_id, active_version, status, notes, is_visible
     from public.visual_standards
     where canonical_key like 'self-service-%'
     except
     select * from self_service_before)
  ) then
    raise exception 'Existing Self-Service rows were mutated.';
  end if;

  if (
    select count(*)
    from public.visual_standard_aliases
  ) <> 4 then
    raise exception 'Legacy Self-Service alias behavior changed.';
  end if;

  if (
    select count(*)
    from public.visual_standards
    where area = 'Workbar'
      and status = 'awaiting_asset'
      and active_asset_path is null
      and active_version_id is null
      and active_version = 0
  ) <> 12 then
    raise exception 'New Workbar standards were unexpectedly published.';
  end if;

  if (
    select count(*)
    from public.visual_standard_detail_slots
    where (canonical_key, detail_key, sort_order) in (
      ('workbar-lower-back-bar-glass-setup-standard', 'second-view', 1),
      ('workbar-back-bar-bottle-layout-standard', 'right-side-layout', 1)
    )
      and status = 'awaiting_asset'
  ) <> 2 then
    raise exception 'Workbar ordered detail slots are missing or duplicated.';
  end if;

  if not public.inventory_phase9g_is_refrigerator(
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Workbar Milk Fridge did not join the refrigerator lifecycle.';
  end if;

  if (
    select template_status
    from public.inventory_refrigerator_templates
    where location_id = '20000000-0000-4000-8000-000000000001'
  ) <> 'incomplete' then
    raise exception 'Workbar Milk Fridge was automatically verified.';
  end if;

  if (
    select template_status || ':' || verified_by_name
    from public.inventory_refrigerator_templates
    where location_id = '20000000-0000-4000-8000-000000000002'
  ) <> 'verified:Existing Manager' then
    raise exception 'An existing verified refrigerator template was reset.';
  end if;
end;
$$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

insert into storage.objects (bucket_id, name, owner_id, metadata)
values (
  'inventory-location-reference-images',
  '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000003/30000000-0000-4000-8000-000000000001.jpg',
  '00000000-0000-0000-0000-000000000001',
  '{"mimetype":"image/jpeg","size":2048}'::jsonb
);

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'inventory-location-reference-images',
      '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000004/30000000-0000-4000-8000-000000000002.jpg',
      '00000000-0000-0000-0000-000000000001',
      '{"mimetype":"image/jpeg","size":2048}'::jsonb
    );
    raise exception 'Abstract non-enabled parent unexpectedly accepted an upload.';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
set role authenticated;

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'inventory-location-reference-images',
      '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000003.jpg',
      '00000000-0000-0000-0000-000000000002',
      '{"mimetype":"image/jpeg","size":2048}'::jsonb
    );
    raise exception 'Unauthorized staff reference upload unexpectedly succeeded.';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

select 'complete visual defaults and inventory guidance migration tests passed' as result;

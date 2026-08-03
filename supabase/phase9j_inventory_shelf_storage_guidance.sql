-- Phase 9J: generic countable locations, explicit Main Storage targets,
-- passive-count suggestions, and mutable location reference guidance.
-- Apply after Phase 9I. This terminal migration is repeatable.

alter table public.inventory_locations
  add column if not exists countable boolean not null default false;

alter table public.inventory_location_products
  add column if not exists contributes_to_storage_target boolean not null default false,
  add column if not exists historical_suggestion_quantity numeric,
  add column if not exists historical_suggestion_note text,
  add column if not exists historical_suggestion_source text;

alter table public.inventory_count_lines
  add column if not exists historical_suggestion_quantity_snapshot numeric,
  add column if not exists historical_suggestion_note_snapshot text,
  add column if not exists historical_suggestion_source_snapshot text,
  add column if not exists storage_rule_version_snapshot text;

alter table public.inventory_location_products
  drop constraint if exists inventory_location_products_stock_policy_check,
  drop constraint if exists inventory_location_products_target_mode_check,
  drop constraint if exists inventory_location_products_policy_configuration_check,
  drop constraint if exists inventory_location_products_phase9j_source_check,
  drop constraint if exists inventory_location_products_phase9j_suggestion_check;

alter table public.inventory_location_products
  add constraint inventory_location_products_stock_policy_check check (
    stock_policy in (
      'exact_par', 'physical_count_only', 'operating_reserve',
      'protected_event_reserve', 'verify_unchanged'
    )
  ),
  add constraint inventory_location_products_target_mode_check check (
    target_mode is null or target_mode in ('fixed_quantity', 'derived_multiplier')
  ),
  add constraint inventory_location_products_phase9j_source_check check (
    not contributes_to_storage_target or stock_policy = 'exact_par'
  ),
  add constraint inventory_location_products_phase9j_suggestion_check check (
    historical_suggestion_quantity is null
    or (
      stock_policy = 'physical_count_only'
      and historical_suggestion_quantity >= 0
      and historical_suggestion_quantity::text not in ('NaN', 'Infinity', '-Infinity')
      and round(historical_suggestion_quantity, 6) = historical_suggestion_quantity
    )
  ),
  add constraint inventory_location_products_policy_configuration_check check (
    stock_policy in ('exact_par', 'physical_count_only')
    or (
      stock_policy = 'operating_reserve'
      and target_mode in ('fixed_quantity', 'derived_multiplier')
    )
    or (
      stock_policy = 'protected_event_reserve'
      and case_size > 0
      and target_cases >= 0
      and target_loose_quantity >= 0
    )
    or (
      stock_policy = 'verify_unchanged'
      and physical_recount_interval_days > 0
    )
  );

alter table public.inventory_count_lines
  drop constraint if exists inventory_count_lines_stock_policy_check,
  drop constraint if exists inventory_count_lines_phase9j_suggestion_check;

alter table public.inventory_count_lines
  add constraint inventory_count_lines_stock_policy_check check (
    stock_policy_snapshot in (
      'exact_par', 'physical_count_only', 'operating_reserve',
      'protected_event_reserve', 'verify_unchanged'
    )
  ),
  add constraint inventory_count_lines_phase9j_suggestion_check check (
    historical_suggestion_quantity_snapshot is null
    or (
      historical_suggestion_quantity_snapshot >= 0
      and historical_suggestion_quantity_snapshot::text not in ('NaN', 'Infinity', '-Infinity')
      and round(historical_suggestion_quantity_snapshot, 6) = historical_suggestion_quantity_snapshot
    )
  );

create table if not exists public.inventory_storage_settings (
  organization_id uuid primary key references public.organizations(id),
  target_multiplier numeric not null default 3,
  rule_version text not null default 'refrigerator-targets-v1',
  location_scope_initialized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_auth_user_id uuid default auth.uid() references auth.users(id),
  updated_by_auth_user_id uuid default auth.uid() references auth.users(id),
  constraint inventory_storage_settings_multiplier_check check (
    target_multiplier > 0
    and target_multiplier <= 100
    and target_multiplier::text not in ('NaN', 'Infinity', '-Infinity')
    and round(target_multiplier, 6) = target_multiplier
  ),
  constraint inventory_storage_settings_rule_required check (
    nullif(trim(rule_version), '') is not null
  )
);

alter table public.inventory_storage_settings
  add column if not exists location_scope_initialized_at timestamptz;

create table if not exists public.inventory_location_reference_guidance (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  location_id uuid not null references public.inventory_locations(id) on delete cascade,
  object_path text,
  caption text,
  mime_type text,
  byte_size bigint,
  original_file_name text,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_auth_user_id uuid default auth.uid() references auth.users(id),
  updated_by_auth_user_id uuid default auth.uid() references auth.users(id),
  constraint inventory_location_reference_guidance_unique unique (organization_id, location_id),
  constraint inventory_location_reference_guidance_caption_check check (
    caption is null or char_length(caption) <= 500
  ),
  constraint inventory_location_reference_guidance_revision_check check (revision > 0),
  constraint inventory_location_reference_guidance_file_check check (
    (
      object_path is null and mime_type is null and byte_size is null
      and original_file_name is null
    )
    or (
      nullif(trim(object_path), '') is not null
      and mime_type in ('image/jpeg', 'image/png', 'image/webp')
      and byte_size > 0 and byte_size <= 5242880
      and nullif(trim(original_file_name), '') is not null
      and char_length(original_file_name) <= 255
    )
  )
);

create table if not exists public.inventory_reference_image_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  location_id uuid references public.inventory_locations(id) on delete set null,
  object_path text not null,
  cleanup_reason text not null,
  queued_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by_auth_user_id uuid references auth.users(id),
  constraint inventory_reference_image_cleanup_path_required check (
    nullif(trim(object_path), '') is not null
  ),
  constraint inventory_reference_image_cleanup_reason_required check (
    nullif(trim(cleanup_reason), '') is not null
  )
);

create unique index if not exists inventory_reference_image_cleanup_pending_idx
  on public.inventory_reference_image_cleanup_queue (organization_id, object_path)
  where completed_at is null;
create index if not exists inventory_location_reference_guidance_location_idx
  on public.inventory_location_reference_guidance (organization_id, location_id);
create index if not exists inventory_location_products_storage_source_idx
  on public.inventory_location_products (organization_id, product_id, location_id)
  where active and contributes_to_storage_target and stock_policy = 'exact_par';
create index if not exists inventory_locations_countable_idx
  on public.inventory_locations (organization_id, active, countable, sort_order, name);

insert into public.inventory_storage_settings (organization_id)
select organization.id
from public.organizations organization
where exists (
  select 1 from public.inventory_locations location
  where location.organization_id = organization.id
)
on conflict (organization_id) do nothing;

-- Reuse the earlier backbar and Main Storage identities instead of creating
-- duplicate physical locations. The update is a no-op on repeat application.
update public.inventory_locations location
set code = 'WORKBAR_BAR_SHELVES',
    name = 'Workbar Bar Shelves',
    location_type = 'shelf',
    parent_location_id = parent.id,
    countable = true,
    active = true,
    sort_order = 27
from public.inventory_locations parent
where parent.organization_id = location.organization_id
  and upper(trim(parent.code)) = 'WORKBAR'
  and upper(trim(location.code)) = 'WORKBAR_BACKBAR'
  and exists (
    select 1 from public.inventory_storage_settings settings
    where settings.organization_id = location.organization_id
      and settings.location_scope_initialized_at is null
  )
  and not exists (
    select 1 from public.inventory_locations existing
    where existing.organization_id = location.organization_id
      and upper(trim(existing.code)) = 'WORKBAR_BAR_SHELVES'
      and existing.id <> location.id
  )
  and (location.code, location.name, location.location_type, location.parent_location_id,
       location.countable, location.active, location.sort_order)
      is distinct from
      ('WORKBAR_BAR_SHELVES', 'Workbar Bar Shelves', 'shelf', parent.id, true, true, 27);

update public.inventory_locations location
set code = 'CORNERBAR_BAR_SHELVES',
    name = 'Cornerbar Bar Shelves',
    location_type = 'shelf',
    parent_location_id = parent.id,
    countable = true,
    active = true,
    sort_order = 17
from public.inventory_locations parent
where parent.organization_id = location.organization_id
  and upper(trim(parent.code)) = 'CORNERBAR'
  and upper(trim(location.code)) = 'CORNERBAR_BACKBAR'
  and exists (
    select 1 from public.inventory_storage_settings settings
    where settings.organization_id = location.organization_id
      and settings.location_scope_initialized_at is null
  )
  and not exists (
    select 1 from public.inventory_locations existing
    where existing.organization_id = location.organization_id
      and upper(trim(existing.code)) = 'CORNERBAR_BAR_SHELVES'
      and existing.id <> location.id
  )
  and (location.code, location.name, location.location_type, location.parent_location_id,
       location.countable, location.active, location.sort_order)
      is distinct from
      ('CORNERBAR_BAR_SHELVES', 'Cornerbar Bar Shelves', 'shelf', parent.id, true, true, 17);

insert into public.inventory_locations (
  organization_id, name, code, location_type, parent_location_id,
  active, countable, sort_order
)
select parent.organization_id, 'Workbar Bar Shelves', 'WORKBAR_BAR_SHELVES',
  'shelf', parent.id, true, true, 27
from public.inventory_locations parent
where upper(trim(parent.code)) = 'WORKBAR'
  and exists (
    select 1 from public.inventory_storage_settings settings
    where settings.organization_id = parent.organization_id
      and settings.location_scope_initialized_at is null
  )
  and not exists (
    select 1 from public.inventory_locations location
    where location.organization_id = parent.organization_id
      and upper(trim(location.code)) = 'WORKBAR_BAR_SHELVES'
  );

insert into public.inventory_locations (
  organization_id, name, code, location_type, parent_location_id,
  active, countable, sort_order
)
select parent.organization_id, 'Cornerbar Bar Shelves', 'CORNERBAR_BAR_SHELVES',
  'shelf', parent.id, true, true, 17
from public.inventory_locations parent
where upper(trim(parent.code)) = 'CORNERBAR'
  and exists (
    select 1 from public.inventory_storage_settings settings
    where settings.organization_id = parent.organization_id
      and settings.location_scope_initialized_at is null
  )
  and not exists (
    select 1 from public.inventory_locations location
    where location.organization_id = parent.organization_id
      and upper(trim(location.code)) = 'CORNERBAR_BAR_SHELVES'
  );

insert into public.inventory_locations (
  organization_id, name, code, location_type, active, countable, sort_order
)
select organization.id, 'Main Storage', 'MAIN_STORAGE', 'storage', true, true, 40
from public.organizations organization
where exists (
  select 1 from public.inventory_locations location
  where location.organization_id = organization.id
)
and exists (
  select 1 from public.inventory_storage_settings settings
  where settings.organization_id = organization.id
    and settings.location_scope_initialized_at is null
)
and not exists (
  select 1 from public.inventory_locations location
  where location.organization_id = organization.id
    and upper(trim(location.code)) = 'MAIN_STORAGE'
);

update public.inventory_locations location
set name = case
      when upper(trim(location.code)) = 'MAIN_STORAGE' then 'Main Storage'
      when upper(trim(location.code)) = 'WORKBAR_BAR_SHELVES' then 'Workbar Bar Shelves'
      when upper(trim(location.code)) = 'CORNERBAR_BAR_SHELVES' then 'Cornerbar Bar Shelves'
      else location.name
    end,
    location_type = case
      when upper(trim(location.code)) = 'MAIN_STORAGE' then 'storage'
      when upper(trim(location.code)) in ('WORKBAR_BAR_SHELVES', 'CORNERBAR_BAR_SHELVES') then 'shelf'
      else location.location_type
    end,
    countable = true,
    active = true
where upper(trim(location.code)) in (
  'CORNERBAR_LEFT_FRIDGE', 'CORNERBAR_MIDDLE_FRIDGE', 'CORNERBAR_RIGHT_FRIDGE',
  'WORKBAR_BAR_LEFT_FRIDGE', 'WORKBAR_BAR_RIGHT_FRIDGE', 'WORKBAR_NON_ALCO_FRIDGE',
  'WORKBAR_BAR_SHELVES', 'CORNERBAR_BAR_SHELVES', 'MAIN_STORAGE'
)
and exists (
  select 1 from public.inventory_storage_settings settings
  where settings.organization_id = location.organization_id
    and settings.location_scope_initialized_at is null
)
and (location.name, location.location_type, location.countable, location.active)
  is distinct from (
    case
      when upper(trim(location.code)) = 'MAIN_STORAGE' then 'Main Storage'
      when upper(trim(location.code)) = 'WORKBAR_BAR_SHELVES' then 'Workbar Bar Shelves'
      when upper(trim(location.code)) = 'CORNERBAR_BAR_SHELVES' then 'Cornerbar Bar Shelves'
      else location.name
    end,
    case
      when upper(trim(location.code)) = 'MAIN_STORAGE' then 'storage'
      when upper(trim(location.code)) in ('WORKBAR_BAR_SHELVES', 'CORNERBAR_BAR_SHELVES') then 'shelf'
      else location.location_type
    end,
    true,
    true
  );

update public.inventory_location_products standard
set contributes_to_storage_target = true
from public.inventory_locations location
where location.id = standard.location_id
  and location.organization_id = standard.organization_id
  and exists (
    select 1 from public.inventory_storage_settings settings
    where settings.organization_id = standard.organization_id
      and settings.location_scope_initialized_at is null
  )
  and location.active and location.countable
  and location.location_type = 'fridge'
  and standard.active
  and standard.stock_policy = 'exact_par'
  and not standard.contributes_to_storage_target;

-- Mark the one-time operational scope bootstrap complete. Repeat application
-- must never reactivate locations or restore manager-controlled source flags.
update public.inventory_storage_settings settings
set location_scope_initialized_at = now()
where settings.location_scope_initialized_at is null;

create or replace function public.inventory_normalize_stock_policy_configuration()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.stock_policy := lower(trim(coalesce(new.stock_policy, 'exact_par')));
  if new.stock_policy = 'operating_reserve' then
    new.target_mode := lower(trim(coalesce(new.target_mode, 'fixed_quantity')));
    new.reserve_multiplier := null;
    new.case_size := null;
    new.target_cases := null;
    new.target_loose_quantity := null;
    new.physical_recount_interval_days := null;
    new.contributes_to_storage_target := false;
    new.historical_suggestion_quantity := null;
    new.historical_suggestion_note := null;
    new.historical_suggestion_source := null;
  elsif new.stock_policy = 'protected_event_reserve' then
    new.target_mode := null;
    new.reserve_multiplier := null;
    new.target_loose_quantity := coalesce(new.target_loose_quantity, 0);
    new.physical_recount_interval_days := null;
    new.contributes_to_storage_target := false;
    new.historical_suggestion_quantity := null;
    new.historical_suggestion_note := null;
    new.historical_suggestion_source := null;
    if new.case_size is not null and new.target_cases is not null then
      new.par_quantity := new.case_size * new.target_cases + new.target_loose_quantity;
    end if;
  elsif new.stock_policy = 'verify_unchanged' then
    new.target_mode := null;
    new.reserve_multiplier := null;
    new.case_size := null;
    new.target_cases := null;
    new.target_loose_quantity := null;
    new.physical_recount_interval_days := coalesce(new.physical_recount_interval_days, 90);
    new.contributes_to_storage_target := false;
    new.historical_suggestion_quantity := null;
    new.historical_suggestion_note := null;
    new.historical_suggestion_source := null;
  elsif new.stock_policy = 'physical_count_only' then
    new.par_quantity := 0;
    new.target_mode := null;
    new.reserve_multiplier := null;
    new.case_size := null;
    new.target_cases := null;
    new.target_loose_quantity := null;
    new.physical_recount_interval_days := null;
    new.contributes_to_storage_target := false;
  else
    new.stock_policy := 'exact_par';
    new.target_mode := null;
    new.reserve_multiplier := null;
    new.case_size := null;
    new.target_cases := null;
    new.target_loose_quantity := null;
    new.physical_recount_interval_days := null;
    new.historical_suggestion_quantity := null;
    new.historical_suggestion_note := null;
    new.historical_suggestion_source := null;
  end if;
  return new;
end;
$$;

create or replace function public.inventory_location_is_countable(
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
      and location.active
      and location.countable
  );
$$;

create or replace function public.inventory_stock_policy_target_details(input_standard_id uuid)
returns table (
  effective_target_quantity numeric,
  service_target_basis numeric,
  applied_multiplier numeric,
  rule_version text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_standard public.inventory_location_products%rowtype;
  v_basis numeric := 0;
  v_multiplier numeric := 3;
  v_rule_version text := 'refrigerator-targets-v1';
begin
  select standard.* into v_standard
  from public.inventory_location_products standard
  where standard.id = input_standard_id;
  if v_standard.id is null then
    raise exception 'Inventory standard was not found.';
  end if;

  if v_standard.stock_policy = 'exact_par' then
    return query select v_standard.par_quantity, null::numeric, null::numeric, null::text;
  elsif v_standard.stock_policy = 'physical_count_only' then
    return query select null::numeric, null::numeric, null::numeric, null::text;
  elsif v_standard.stock_policy = 'operating_reserve' and v_standard.target_mode = 'fixed_quantity' then
    return query select v_standard.par_quantity, null::numeric, null::numeric, null::text;
  elsif v_standard.stock_policy = 'operating_reserve' and v_standard.target_mode = 'derived_multiplier' then
    select settings.target_multiplier, settings.rule_version
    into v_multiplier, v_rule_version
    from public.inventory_storage_settings settings
    where settings.organization_id = v_standard.organization_id;
    v_multiplier := coalesce(v_multiplier, 3);
    v_rule_version := coalesce(v_rule_version, 'refrigerator-targets-v1');

    select coalesce(sum(source.par_quantity), 0)
    into v_basis
    from public.inventory_location_products source
    join public.inventory_locations location
      on location.id = source.location_id
     and location.organization_id = source.organization_id
     and location.active
     and location.countable
     and location.location_type = 'fridge'
    join public.inventory_products product
      on product.id = source.product_id
     and product.organization_id = source.organization_id
     and product.active
    where source.organization_id = v_standard.organization_id
      and source.product_id = v_standard.product_id
      and source.active
      and source.stock_policy = 'exact_par'
      and source.contributes_to_storage_target;
    return query select v_basis * v_multiplier, v_basis, v_multiplier, v_rule_version;
  elsif v_standard.stock_policy = 'protected_event_reserve' then
    return query select
      v_standard.case_size * v_standard.target_cases + coalesce(v_standard.target_loose_quantity, 0),
      null::numeric, null::numeric, null::text;
  else
    return query select null::numeric, null::numeric, null::numeric, null::text;
  end if;
end;
$$;

create or replace function public.inventory_stock_policy_target(input_standard_id uuid)
returns table (
  effective_target_quantity numeric,
  service_target_basis numeric
)
language sql
security definer
set search_path = pg_catalog
as $$
  select details.effective_target_quantity, details.service_target_basis
  from public.inventory_stock_policy_target_details(input_standard_id) details;
$$;

create or replace view public.inventory_refrigerator_reserve_targets
with (security_invoker = true)
as
select
  product.id as product_id,
  coalesce(sum(standard.par_quantity) filter (
    where standard.active
      and standard.stock_policy = 'exact_par'
      and standard.contributes_to_storage_target
      and location.active
      and location.countable
      and location.location_type = 'fridge'
  ), 0)::numeric as refrigerator_default_quantity,
  null::numeric as reserve_target_override,
  (
    coalesce(sum(standard.par_quantity) filter (
      where standard.active
        and standard.stock_policy = 'exact_par'
        and standard.contributes_to_storage_target
        and location.active
        and location.countable
        and location.location_type = 'fridge'
    ), 0) * coalesce(settings.target_multiplier, 3)
  )::numeric as reserve_target_quantity,
  (
    coalesce(sum(standard.par_quantity) filter (
      where standard.active
        and standard.stock_policy = 'exact_par'
        and standard.contributes_to_storage_target
        and location.active
        and location.countable
        and location.location_type = 'fridge'
    ), 0) * (1 + coalesce(settings.target_multiplier, 3))
  )::numeric as combined_desired_quantity
from public.inventory_products product
left join public.inventory_location_products standard
  on standard.organization_id = product.organization_id
 and standard.product_id = product.id
left join public.inventory_locations location
  on location.organization_id = standard.organization_id
 and location.id = standard.location_id
left join public.inventory_storage_settings settings
  on settings.organization_id = product.organization_id
where product.active
group by product.id, settings.target_multiplier;

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
  select location.* into v_location
  from public.inventory_locations location
  where location.id = input_location_id
    and location.organization_id = v_actor.organization_id
  for update;
  if v_location.id is null then raise exception 'Inventory location was not found in this organization.'; end if;
  insert into public.inventory_storage_settings (
    organization_id, location_scope_initialized_at,
    created_by_auth_user_id, updated_by_auth_user_id
  ) values (
    v_actor.organization_id, now(),
    v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
  ) on conflict (organization_id) do nothing;
  update public.inventory_locations location
  set countable = input_countable,
      updated_by_auth_user_id = v_actor.actor_auth_user_id
  where location.id = v_location.id
    and location.countable is distinct from input_countable
  returning * into v_location;
  if v_location.id is null then
    select location.* into v_location from public.inventory_locations location where location.id = input_location_id;
  end if;
  return jsonb_build_object(
    'id', v_location.id, 'countable', v_location.countable,
    'updated_at', v_location.updated_at
  );
end;
$$;

create or replace function public.set_inventory_storage_multiplier(input_multiplier numeric)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_settings public.inventory_storage_settings%rowtype;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  if input_multiplier is null or input_multiplier <= 0 or input_multiplier > 100
     or input_multiplier::text in ('NaN', 'Infinity', '-Infinity')
     or round(input_multiplier, 6) <> input_multiplier then
    raise exception 'Storage multiplier must be greater than zero, at most 100, and use no more than 6 decimals.';
  end if;
  insert into public.inventory_storage_settings (
    organization_id, target_multiplier, location_scope_initialized_at,
    created_by_auth_user_id, updated_by_auth_user_id
  ) values (
    v_actor.organization_id, input_multiplier, now(),
    v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
  ) on conflict (organization_id) do update
    set target_multiplier = excluded.target_multiplier,
        updated_by_auth_user_id = excluded.updated_by_auth_user_id
  where inventory_storage_settings.target_multiplier is distinct from excluded.target_multiplier
  returning * into v_settings;
  if v_settings.organization_id is null then
    select settings.* into v_settings
    from public.inventory_storage_settings settings
    where settings.organization_id = v_actor.organization_id;
  end if;
  return jsonb_build_object(
    'organization_id', v_settings.organization_id,
    'target_multiplier', v_settings.target_multiplier,
    'rule_version', v_settings.rule_version,
    'updated_at', v_settings.updated_at
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
  v_actor record;
  v_row jsonb;
  v_product_id uuid;
  v_assigned boolean;
  v_policy text;
  v_target_mode text;
  v_par numeric;
  v_case_size numeric;
  v_target_cases integer;
  v_target_loose numeric;
  v_recount_days integer;
  v_order integer;
  v_contributes boolean;
  v_suggestion numeric;
  v_suggestion_note text;
  v_suggestion_source text;
  v_existing public.inventory_location_products%rowtype;
  v_seen uuid[] := array[]::uuid[];
  v_created integer := 0;
  v_updated integer := 0;
  v_archived integer := 0;
  v_preserved integer := 0;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  if not exists (
    select 1 from public.inventory_locations location
    where location.id = input_location_id
      and location.organization_id = v_actor.organization_id
      and location.active
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
    if v_product_id is null then raise exception 'Every standard row requires a product.'; end if;
    if v_product_id = any(v_seen) then raise exception 'A product appears more than once in the standards update.'; end if;
    v_seen := array_append(v_seen, v_product_id);
    if not exists (
      select 1 from public.inventory_products product
      where product.id = v_product_id and product.organization_id = v_actor.organization_id
    ) then
      raise exception 'Inventory product was not found in this organization.';
    end if;

    v_existing := null;
    select standard.* into v_existing
    from public.inventory_location_products standard
    where standard.organization_id = v_actor.organization_id
      and standard.location_id = input_location_id
      and standard.product_id = v_product_id
    for update;

    if not v_assigned then
      if v_existing.id is not null and v_existing.active then
        update public.inventory_location_products standard
        set active = false, updated_by_auth_user_id = v_actor.actor_auth_user_id
        where standard.id = v_existing.id;
        v_archived := v_archived + 1;
      else
        v_preserved := v_preserved + 1;
      end if;
      continue;
    end if;

    v_policy := lower(trim(coalesce(nullif(v_row->>'stockPolicy', ''), v_existing.stock_policy, 'exact_par')));
    if v_policy not in ('exact_par', 'physical_count_only', 'operating_reserve', 'protected_event_reserve', 'verify_unchanged') then
      raise exception 'Choose a valid stock policy.';
    end if;
    begin
      v_order := coalesce(nullif(trim(coalesce(v_row->>'countOrder', '')), '')::integer, coalesce(v_existing.count_order, 0));
      v_par := coalesce(nullif(trim(coalesce(v_row->>'parQuantity', '')), '')::numeric, v_existing.par_quantity, 0);
      v_target_mode := null;
      v_case_size := null;
      v_target_cases := null;
      v_target_loose := null;
      v_recount_days := null;
      v_contributes := coalesce(nullif(v_row->>'contributesToStorageTarget', '')::boolean, v_existing.contributes_to_storage_target, false);
      v_suggestion := case
        when nullif(trim(coalesce(v_row->>'historicalSuggestionQuantity', '')), '') is null then null
        else (v_row->>'historicalSuggestionQuantity')::numeric
      end;
      v_suggestion_note := nullif(trim(coalesce(v_row->>'historicalSuggestionNote', '')), '');
      v_suggestion_source := nullif(trim(coalesce(v_row->>'historicalSuggestionSource', '')), '');

      if v_policy = 'exact_par' then
        if nullif(trim(coalesce(v_row->>'parQuantity', '')), '') is null and v_existing.id is null then
          raise exception 'Target quantity is required for exact-par stock.';
        end if;
        v_suggestion := null; v_suggestion_note := null; v_suggestion_source := null;
      elsif v_policy = 'physical_count_only' then
        v_par := 0; v_contributes := false;
        if v_suggestion is not null and (
          v_suggestion < 0 or v_suggestion::text in ('NaN', 'Infinity', '-Infinity')
          or round(v_suggestion, 6) <> v_suggestion
        ) then raise exception 'Historical suggestion must be non-negative and use no more than 6 decimals.'; end if;
      elsif v_policy = 'operating_reserve' then
        v_contributes := false; v_suggestion := null; v_suggestion_note := null; v_suggestion_source := null;
        v_target_mode := lower(trim(coalesce(nullif(v_row->>'targetMode', ''), v_existing.target_mode, 'fixed_quantity')));
        if v_target_mode not in ('fixed_quantity', 'derived_multiplier') then raise exception 'Choose a valid operating reserve target mode.'; end if;
        if v_target_mode = 'fixed_quantity' and nullif(trim(coalesce(v_row->>'parQuantity', '')), '') is null and v_existing.id is null then
          raise exception 'Target quantity is required for fixed operating reserve.';
        end if;
      elsif v_policy = 'protected_event_reserve' then
        v_contributes := false; v_suggestion := null; v_suggestion_note := null; v_suggestion_source := null;
        v_case_size := coalesce(nullif(trim(coalesce(v_row->>'caseSize', '')), '')::numeric, v_existing.case_size);
        v_target_cases := coalesce(nullif(trim(coalesce(v_row->>'targetCases', '')), '')::integer, v_existing.target_cases);
        v_target_loose := coalesce(nullif(trim(coalesce(v_row->>'targetLooseQuantity', '')), '')::numeric, v_existing.target_loose_quantity, 0);
        if v_case_size is null or v_case_size <= 0 then raise exception 'Case size must be greater than zero.'; end if;
        if v_target_cases is null or v_target_cases < 0 then raise exception 'Target cases cannot be negative.'; end if;
        if v_target_loose < 0 then raise exception 'Loose target cannot be negative.'; end if;
        v_par := v_case_size * v_target_cases + v_target_loose;
      else
        v_contributes := false; v_suggestion := null; v_suggestion_note := null; v_suggestion_source := null;
        v_recount_days := coalesce(nullif(trim(coalesce(v_row->>'physicalRecountIntervalDays', '')), '')::integer, v_existing.physical_recount_interval_days, 90);
        if v_recount_days <= 0 then raise exception 'Physical recount interval must be greater than zero.'; end if;
      end if;
    exception when invalid_text_representation then
      raise exception 'A standard row contains an invalid policy value or count order.';
    end;
    if v_par < 0 or v_order < 0 then raise exception 'Target quantity and count order cannot be negative.'; end if;

    if v_existing.id is null then
      insert into public.inventory_location_products (
        organization_id, location_id, product_id, par_quantity, count_order, active,
        stock_policy, target_mode, reserve_multiplier, case_size, target_cases,
        target_loose_quantity, physical_recount_interval_days,
        contributes_to_storage_target, historical_suggestion_quantity,
        historical_suggestion_note, historical_suggestion_source,
        created_by_auth_user_id, updated_by_auth_user_id
      ) values (
        v_actor.organization_id, input_location_id, v_product_id, v_par, v_order, true,
        v_policy, v_target_mode, null, v_case_size, v_target_cases,
        v_target_loose, v_recount_days, v_contributes, v_suggestion,
        v_suggestion_note, v_suggestion_source,
        v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
      );
      v_created := v_created + 1;
    elsif v_existing.par_quantity is distinct from v_par
       or v_existing.count_order is distinct from v_order
       or v_existing.stock_policy is distinct from v_policy
       or v_existing.target_mode is distinct from v_target_mode
       or v_existing.reserve_multiplier is not null
       or v_existing.case_size is distinct from v_case_size
       or v_existing.target_cases is distinct from v_target_cases
       or v_existing.target_loose_quantity is distinct from v_target_loose
       or v_existing.physical_recount_interval_days is distinct from v_recount_days
       or v_existing.contributes_to_storage_target is distinct from v_contributes
       or v_existing.historical_suggestion_quantity is distinct from v_suggestion
       or v_existing.historical_suggestion_note is distinct from v_suggestion_note
       or v_existing.historical_suggestion_source is distinct from v_suggestion_source
       or not v_existing.active then
      update public.inventory_location_products standard
      set par_quantity = v_par, count_order = v_order, active = true,
          stock_policy = v_policy, target_mode = v_target_mode,
          reserve_multiplier = null, case_size = v_case_size,
          target_cases = v_target_cases, target_loose_quantity = v_target_loose,
          physical_recount_interval_days = v_recount_days,
          contributes_to_storage_target = v_contributes,
          historical_suggestion_quantity = v_suggestion,
          historical_suggestion_note = v_suggestion_note,
          historical_suggestion_source = v_suggestion_source,
          updated_by_auth_user_id = v_actor.actor_auth_user_id
      where standard.id = v_existing.id;
      v_updated := v_updated + 1;
    else
      v_preserved := v_preserved + 1;
    end if;
  end loop;
  return jsonb_build_object('created', v_created, 'updated', v_updated, 'archived', v_archived, 'preserved', v_preserved);
end;
$$;

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
    raise exception 'Choose at least one eligible counting location.';
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
      join public.inventory_location_products standard
        on standard.location_id = location.id
       and standard.organization_id = location.organization_id
       and standard.active
      join public.inventory_products product
        on product.id = standard.product_id
       and product.organization_id = standard.organization_id
       and product.active
      where location.organization_id = v_actor.organization_id
        and location.active
        and location.countable
    ) eligible;
  else
    select array_agg(selected.id order by selected.id)
    into v_selected_location_ids
    from (select distinct unnest(input_location_ids) as id) selected;
  end if;

  if coalesce(cardinality(v_selected_location_ids), 0) = 0 then
    raise exception 'Choose at least one eligible counting location with active standards.';
  end if;

  foreach v_location_id in array v_selected_location_ids
  loop
    perform 1
    from public.inventory_locations location
    join public.inventory_location_products standard
      on standard.location_id = location.id
     and standard.organization_id = location.organization_id
     and standard.active
    join public.inventory_products product
      on product.id = standard.product_id
     and product.organization_id = standard.organization_id
     and product.active
    where location.id = v_location_id
      and location.organization_id = v_actor.organization_id
      and location.active
      and location.countable
    for share of location, standard, product;
    if not found then
      raise exception 'Every selected location must be active, countable, and have active product standards in this organization.';
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
    previous_physical_count_quantity_snapshot, previous_physical_counted_at_snapshot,
    historical_suggestion_quantity_snapshot, historical_suggestion_note_snapshot,
    historical_suggestion_source_snapshot, storage_rule_version_snapshot
  )
  select standard.organization_id, v_session.id, standard.location_id, standard.product_id,
    product.name, location.name, product.unit_label, product.category,
    location.sort_order, standard.count_order, product.sort_order,
    coalesce(target.effective_target_quantity, standard.par_quantity, 0), standard.minimum_quantity,
    standard.stock_policy, standard.target_mode, target.effective_target_quantity,
    target.service_target_basis, target.applied_multiplier, standard.case_size,
    standard.target_cases, standard.target_loose_quantity,
    standard.physical_recount_interval_days, previous.id,
    previous.counted_quantity, previous.counted_at,
    standard.historical_suggestion_quantity, standard.historical_suggestion_note,
    standard.historical_suggestion_source, target.rule_version
  from public.inventory_location_products standard
  join public.inventory_products product
    on product.id = standard.product_id
   and product.organization_id = standard.organization_id
   and product.active
  join public.inventory_locations location
    on location.id = standard.location_id
   and location.organization_id = standard.organization_id
   and location.active
   and location.countable
  cross join lateral public.inventory_stock_policy_target_details(standard.id) target
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
    and standard.active
    and standard.location_id = any(v_selected_location_ids)
  order by location.sort_order, location.name, standard.count_order, product.sort_order, product.name;
  get diagnostics v_line_count = row_count;
  if v_line_count = 0 then raise exception 'No active inventory products are configured for the selected locations.'; end if;
  select count(distinct line.location_id) into v_location_count
  from public.inventory_count_lines line where line.session_id = v_session.id;
  if v_location_count <> cardinality(v_selected_location_ids) then
    raise exception 'Every selected location must create at least one Stock Count line.';
  end if;
  return jsonb_build_object(
    'session', public.get_inventory_count_session_record(v_session.id),
    'summary', jsonb_build_object('lineCount', v_line_count, 'locationCount', v_location_count),
    'idempotentReplay', false
  );
end;
$$;

create or replace function public.inventory_validate_count_assignment()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_session public.inventory_count_sessions%rowtype;
  v_location public.inventory_locations%rowtype;
  v_membership public.inventory_counter_memberships%rowtype;
  v_profile public.user_profiles%rowtype;
  v_replaced public.inventory_count_assignments%rowtype;
begin
  if tg_op = 'DELETE' then raise exception 'Stock Count assignment history cannot be deleted.'; end if;
  select session.* into v_session from public.inventory_count_sessions session where session.id = new.session_id;
  select location.* into v_location from public.inventory_locations location where location.id = new.location_id;
  select membership.* into v_membership from public.inventory_counter_memberships membership where membership.id = new.counter_membership_id;
  select profile.* into v_profile from public.user_profiles profile where profile.id = v_membership.counter_auth_user_id;
  if v_session.id is null or v_session.organization_id is distinct from new.organization_id then
    raise exception 'Assignment and Stock Count session must belong to one organization.';
  end if;
  if v_location.id is null or v_location.organization_id is distinct from new.organization_id
     or not v_location.active or not v_location.countable then
    raise exception 'Assignment requires an active countable location in the same organization.';
  end if;
  if v_membership.id is null or v_membership.organization_id is distinct from new.organization_id
     or v_profile.id is null or v_profile.organization_id is distinct from new.organization_id then
    raise exception 'Assignment counter identity must remain in the same organization.';
  end if;
  if tg_op = 'INSERT' and (
    not v_membership.active or v_profile.role <> 'counter' or not v_profile.active
    or coalesce(v_profile.is_shared_device, false)
  ) then raise exception 'Assignment requires an active same-organization counter membership.'; end if;
  if v_session.status not in ('draft', 'in_progress') then
    raise exception 'Assignments can only change in an active editable Stock Count.';
  end if;
  if not exists (
    select 1 from public.inventory_count_lines line
    where line.session_id = new.session_id and line.organization_id = new.organization_id
      and line.location_id = new.location_id
  ) then raise exception 'Assigned location is not part of this Stock Count.'; end if;
  if tg_op = 'INSERT' then
    if new.state <> 'assigned' or new.revision <> 1 then
      raise exception 'New assignments must begin in assigned state at revision 1.';
    end if;
    if new.replaces_assignment_id is not null then
      select assignment.* into v_replaced from public.inventory_count_assignments assignment where assignment.id = new.replaces_assignment_id;
      if v_replaced.id is null or v_replaced.organization_id is distinct from new.organization_id
         or v_replaced.session_id is distinct from new.session_id
         or v_replaced.location_id is distinct from new.location_id
         or v_replaced.counter_membership_id = new.counter_membership_id
         or v_replaced.state <> 'superseded'
         or v_replaced.superseded_by_assignment_id is distinct from new.id then
        raise exception 'Replacement assignment must be linked to the superseded assignment for the same location.';
      end if;
    end if;
  else
    if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id
       or new.session_id is distinct from old.session_id or new.location_id is distinct from old.location_id
       or new.counter_membership_id is distinct from old.counter_membership_id
       or new.replaces_assignment_id is distinct from old.replaces_assignment_id
       or new.assigned_at is distinct from old.assigned_at
       or new.assigned_by_auth_user_id is distinct from old.assigned_by_auth_user_id
       or new.assigned_by_name is distinct from old.assigned_by_name
       or new.created_at is distinct from old.created_at then
      raise exception 'Assignment identity and original assignment audit are immutable.';
    end if;
    if new.revision <> old.revision + 1 then raise exception 'Every assignment change must advance the revision exactly once.'; end if;
    if new.state = old.state then
      if new.state not in ('assigned', 'returned')
         or (to_jsonb(new) - array['revision','updated_at']) is distinct from (to_jsonb(old) - array['revision','updated_at']) then
        raise exception 'Only editable assignment work may advance an unchanged state.';
      end if;
    elsif not (
      (old.state in ('assigned', 'returned') and new.state = 'submitted')
      or (old.state = 'submitted' and new.state in ('returned', 'accepted'))
      or (old.state in ('assigned', 'returned') and new.state = 'superseded')
    ) then raise exception 'Invalid Stock Count assignment state transition.'; end if;
    if new.state = 'superseded' and (
      new.superseded_by_assignment_id is null or new.superseded_at is null
      or new.superseded_by_auth_user_id is null or nullif(trim(new.superseded_by_name), '') is null
      or nullif(trim(new.supersession_reason), '') is null
      or new.replacement_data_action not in ('preserve', 'clear_unsubmitted')
    ) then raise exception 'Superseding an assignment requires complete manager replacement audit.'; end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.create_inventory_count_assignment(
  input_session_id uuid,
  input_location_id uuid,
  input_counter_membership_id uuid,
  input_expected_session_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_session public.inventory_count_sessions%rowtype;
  v_membership public.inventory_counter_memberships%rowtype;
  v_assignment public.inventory_count_assignments%rowtype;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  if input_expected_session_updated_at is null then raise exception 'A current session version is required before assigning a location.'; end if;
  select session.* into v_session
  from public.inventory_count_sessions session
  where session.id = input_session_id and session.organization_id = v_actor.organization_id
  for update;
  if v_session.id is null or v_session.status not in ('draft', 'in_progress') then
    raise exception 'Assignments require an active editable Stock Count in this organization.';
  end if;
  if v_session.updated_at is distinct from input_expected_session_updated_at then
    raise exception 'This Stock Count changed on another device. Refresh before assigning a location.';
  end if;
  select membership.* into v_membership
  from public.inventory_counter_memberships membership
  where membership.id = input_counter_membership_id
    and membership.organization_id = v_actor.organization_id and membership.active
  for update;
  if v_membership.id is null then raise exception 'Active counter authorization was not found.'; end if;
  if not public.inventory_location_is_countable(input_location_id, v_actor.organization_id)
     or not exists (
       select 1 from public.inventory_count_lines line
       where line.session_id = v_session.id and line.location_id = input_location_id
         and line.organization_id = v_actor.organization_id
     ) then raise exception 'Choose an active countable location in this Stock Count.'; end if;
  insert into public.inventory_count_assignments (
    organization_id, session_id, location_id, counter_membership_id,
    assigned_by_auth_user_id, assigned_by_name
  ) values (
    v_actor.organization_id, v_session.id, input_location_id, v_membership.id,
    v_actor.actor_auth_user_id, v_actor.actor_name
  ) returning * into v_assignment;
  update public.inventory_count_sessions session set updated_at = now() where session.id = v_session.id;
  return jsonb_build_object('id', v_assignment.id, 'state', v_assignment.state, 'revision', v_assignment.revision, 'updated_at', v_assignment.updated_at);
end;
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
    and split_part(input_path, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$';
$$;

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
      and location.countable
  ) then raise exception 'Reference guidance requires a countable location in the same organization.'; end if;
  new.caption := nullif(trim(coalesce(new.caption, '')), '');
  if new.object_path is not null and not public.inventory_reference_image_path_valid(new.organization_id, new.location_id, new.object_path) then
    raise exception 'Reference image object path is invalid for this organization and location.';
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_location_reference_guidance_validate on public.inventory_location_reference_guidance;
create trigger inventory_location_reference_guidance_validate
before insert or update on public.inventory_location_reference_guidance
for each row execute function public.inventory_validate_reference_guidance();

drop trigger if exists inventory_location_reference_guidance_set_updated_at on public.inventory_location_reference_guidance;
create trigger inventory_location_reference_guidance_set_updated_at
before update on public.inventory_location_reference_guidance
for each row execute function public.set_updated_at();

drop trigger if exists inventory_storage_settings_set_updated_at on public.inventory_storage_settings;
create trigger inventory_storage_settings_set_updated_at
before update on public.inventory_storage_settings
for each row execute function public.set_updated_at();

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
  v_existing public.inventory_location_reference_guidance%rowtype;
  v_guidance public.inventory_location_reference_guidance%rowtype;
  v_caption text := nullif(trim(coalesce(input_caption, '')), '');
  v_cleanup_path text;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  if not exists (
    select 1 from public.inventory_locations location
    where location.id = input_location_id
      and location.organization_id = v_actor.organization_id
      and location.countable
  ) then raise exception 'Countable inventory location was not found in this organization.'; end if;
  if v_caption is not null and char_length(v_caption) > 500 then raise exception 'Reference caption cannot exceed 500 characters.'; end if;
  if input_object_path is not null then
    if input_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then raise exception 'Reference image type must be JPEG, PNG, or WebP.'; end if;
    if input_byte_size is null or input_byte_size <= 0 or input_byte_size > 5242880 then raise exception 'Reference image must be no larger than 5 MB.'; end if;
    if nullif(trim(coalesce(input_original_file_name, '')), '') is null or char_length(input_original_file_name) > 255 then raise exception 'Reference image file name is invalid.'; end if;
    if not public.inventory_reference_image_path_valid(v_actor.organization_id, input_location_id, input_object_path) then
      raise exception 'Reference image object path is invalid for this organization and location.';
    end if;
  elsif input_mime_type is not null or input_byte_size is not null or input_original_file_name is not null then
    raise exception 'Reference image metadata requires an object path.';
  end if;

  select guidance.* into v_existing
  from public.inventory_location_reference_guidance guidance
  where guidance.organization_id = v_actor.organization_id
    and guidance.location_id = input_location_id
  for update;
  if coalesce(input_expected_revision, 0) <> coalesce(v_existing.revision, 0) then
    raise exception 'Reference guidance changed on another device. Refresh before saving.';
  end if;
  if v_existing.object_path is not null and v_existing.object_path is distinct from input_object_path then
    v_cleanup_path := v_existing.object_path;
    insert into public.inventory_reference_image_cleanup_queue (
      organization_id, location_id, object_path, cleanup_reason
    ) values (
      v_actor.organization_id, input_location_id, v_cleanup_path, 'replaced'
    ) on conflict (organization_id, object_path) where completed_at is null do nothing;
  end if;
  if v_existing.id is null then
    insert into public.inventory_location_reference_guidance (
      organization_id, location_id, object_path, caption, mime_type, byte_size,
      original_file_name, created_by_auth_user_id, updated_by_auth_user_id
    ) values (
      v_actor.organization_id, input_location_id, input_object_path, v_caption,
      input_mime_type, input_byte_size, input_original_file_name,
      v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
    ) returning * into v_guidance;
  else
    update public.inventory_location_reference_guidance guidance
    set object_path = input_object_path, caption = v_caption,
        mime_type = input_mime_type, byte_size = input_byte_size,
        original_file_name = input_original_file_name,
        revision = guidance.revision + 1,
        updated_by_auth_user_id = v_actor.actor_auth_user_id
    where guidance.id = v_existing.id
    returning * into v_guidance;
  end if;
  return jsonb_build_object(
    'id', v_guidance.id, 'location_id', v_guidance.location_id,
    'object_path', v_guidance.object_path, 'caption', v_guidance.caption,
    'mime_type', v_guidance.mime_type, 'byte_size', v_guidance.byte_size,
    'original_file_name', v_guidance.original_file_name,
    'revision', v_guidance.revision, 'updated_at', v_guidance.updated_at,
    'cleanup_path', v_cleanup_path
  );
end;
$$;

create or replace function public.remove_inventory_location_reference_image(
  input_location_id uuid,
  input_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_existing public.inventory_location_reference_guidance%rowtype;
  v_guidance public.inventory_location_reference_guidance%rowtype;
  v_cleanup_path text;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  select guidance.* into v_existing
  from public.inventory_location_reference_guidance guidance
  where guidance.organization_id = v_actor.organization_id
    and guidance.location_id = input_location_id
  for update;
  if v_existing.id is null then raise exception 'Reference guidance was not found for this location.'; end if;
  if input_expected_revision is distinct from v_existing.revision then
    raise exception 'Reference guidance changed on another device. Refresh before removing the image.';
  end if;
  v_cleanup_path := v_existing.object_path;
  if v_cleanup_path is not null then
    insert into public.inventory_reference_image_cleanup_queue (
      organization_id, location_id, object_path, cleanup_reason
    ) values (
      v_actor.organization_id, input_location_id, v_cleanup_path, 'removed'
    ) on conflict (organization_id, object_path) where completed_at is null do nothing;
  end if;
  update public.inventory_location_reference_guidance guidance
  set object_path = null, mime_type = null, byte_size = null,
      original_file_name = null, revision = guidance.revision + 1,
      updated_by_auth_user_id = v_actor.actor_auth_user_id
  where guidance.id = v_existing.id
  returning * into v_guidance;
  return jsonb_build_object(
    'id', v_guidance.id, 'location_id', v_guidance.location_id,
    'caption', v_guidance.caption, 'revision', v_guidance.revision,
    'updated_at', v_guidance.updated_at, 'cleanup_path', v_cleanup_path
  );
end;
$$;

create or replace function public.list_inventory_reference_cleanup_paths()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_paths jsonb;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  select coalesce(jsonb_agg(jsonb_build_object('id', queue.id, 'object_path', queue.object_path) order by queue.queued_at), '[]'::jsonb)
  into v_paths
  from public.inventory_reference_image_cleanup_queue queue
  where queue.organization_id = v_actor.organization_id and queue.completed_at is null;
  return v_paths;
end;
$$;

create or replace function public.queue_inventory_reference_cleanup_path(
  input_location_id uuid,
  input_object_path text,
  input_reason text default 'failed_upload_cleanup'
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  if not public.inventory_reference_image_path_valid(v_actor.organization_id, input_location_id, input_object_path)
     or not exists (
       select 1 from public.inventory_locations location
       where location.id = input_location_id
         and location.organization_id = v_actor.organization_id
     ) then raise exception 'Cleanup path is invalid for this organization and location.'; end if;
  insert into public.inventory_reference_image_cleanup_queue (
    organization_id, location_id, object_path, cleanup_reason
  ) values (
    v_actor.organization_id, input_location_id, input_object_path,
    coalesce(nullif(trim(input_reason), ''), 'failed_upload_cleanup')
  ) on conflict (organization_id, object_path) where completed_at is null do nothing;
end;
$$;

create or replace function public.acknowledge_inventory_reference_cleanup(input_object_path text)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  update public.inventory_reference_image_cleanup_queue queue
  set completed_at = now(), completed_by_auth_user_id = v_actor.actor_auth_user_id
  where queue.organization_id = v_actor.organization_id
    and queue.object_path = input_object_path
    and queue.completed_at is null;
end;
$$;

create or replace function public.inventory_detach_reference_on_location_archive()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_path text;
begin
  if tg_op = 'UPDATE' and not (old.active and not new.active) then return new; end if;
  select guidance.object_path into v_path
  from public.inventory_location_reference_guidance guidance
  where guidance.organization_id = old.organization_id and guidance.location_id = old.id
  for update;
  if v_path is not null then
    insert into public.inventory_reference_image_cleanup_queue (
      organization_id, location_id, object_path, cleanup_reason
    ) values (
      old.organization_id, old.id, v_path,
      case when tg_op = 'DELETE' then 'location_deleted' else 'location_archived' end
    ) on conflict (organization_id, object_path) where completed_at is null do nothing;
    update public.inventory_location_reference_guidance guidance
    set object_path = null, mime_type = null, byte_size = null,
        original_file_name = null, revision = guidance.revision + 1,
        updated_by_auth_user_id = auth.uid()
    where guidance.organization_id = old.organization_id and guidance.location_id = old.id;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists inventory_locations_reference_cleanup on public.inventory_locations;
create trigger inventory_locations_reference_cleanup
before update of active or delete on public.inventory_locations
for each row execute function public.inventory_detach_reference_on_location_archive();

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
      'id', assignment.id, 'state', assignment.state, 'revision', assignment.revision,
      'assigned_at', assignment.assigned_at, 'submitted_at', assignment.submitted_at,
      'returned_at', assignment.returned_at, 'accepted_at', assignment.accepted_at,
      'return_message', assignment.return_message,
      'session', jsonb_build_object(
        'id', session.id, 'title', session.title, 'count_date', session.count_date,
        'status', session.status, 'updated_at', session.updated_at
      ),
      'location', jsonb_build_object('id', location.id, 'name', location.name),
      'reference_guidance', (
        select jsonb_build_object(
          'location_id', guidance.location_id, 'object_path', guidance.object_path,
          'caption', guidance.caption, 'mime_type', guidance.mime_type,
          'byte_size', guidance.byte_size, 'revision', guidance.revision,
          'updated_at', guidance.updated_at
        )
        from public.inventory_location_reference_guidance guidance
        where guidance.organization_id = assignment.organization_id
          and guidance.location_id = assignment.location_id
      ),
      'lines', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', line.id, 'location_id', line.location_id, 'product_id', line.product_id,
          'product_name_snapshot', line.product_name_snapshot, 'practical_name', product.short_name,
          'millum_item_ref', product.millum_item_ref, 'unit_label_snapshot', line.unit_label_snapshot,
          'category_snapshot', line.category_snapshot, 'count_order_snapshot', line.count_order_snapshot,
          'product_sort_order_snapshot', line.product_sort_order_snapshot,
          'stock_policy_snapshot', line.stock_policy_snapshot,
          'standard_quantity', case
            when line.stock_policy_snapshot = 'physical_count_only' then null
            else coalesce(line.effective_target_quantity_snapshot, line.par_quantity_snapshot)
          end,
          'historical_suggestion_quantity_snapshot', line.historical_suggestion_quantity_snapshot,
          'historical_suggestion_note_snapshot', line.historical_suggestion_note_snapshot,
          'historical_suggestion_source_snapshot', line.historical_suggestion_source_snapshot,
          'count_mode_snapshot', line.count_mode_snapshot,
          'container_capacity_liters_snapshot', line.container_capacity_liters_snapshot,
          'counted_whole_units', line.counted_whole_units,
          'counted_open_volume_liters', line.counted_open_volume_liters,
          'counted_full_kegs', line.counted_full_kegs,
          'counted_partial_keg_fraction', line.counted_partial_keg_fraction,
          'counted_quantity', line.counted_quantity, 'count_method', line.count_method,
          'count_status', line.count_status, 'note', line.note, 'counted_at', line.counted_at,
          'counted_by_name', line.counted_by_name, 'updated_at', line.updated_at
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

alter table public.inventory_storage_settings enable row level security;
alter table public.inventory_location_reference_guidance enable row level security;
alter table public.inventory_reference_image_cleanup_queue enable row level security;

drop policy if exists inventory_storage_settings_manager_read on public.inventory_storage_settings;
create policy inventory_storage_settings_manager_read
on public.inventory_storage_settings for select to authenticated
using (
  organization_id = public.current_user_organization_id()
  and public.current_user_can_manage_inventory_config()
);

drop policy if exists inventory_location_reference_guidance_manager_read on public.inventory_location_reference_guidance;
create policy inventory_location_reference_guidance_manager_read
on public.inventory_location_reference_guidance for select to authenticated
using (
  organization_id = public.current_user_organization_id()
  and public.current_user_can_manage_inventory_config()
);

revoke all privileges on table public.inventory_storage_settings from public, anon, authenticated, service_role;
grant select (organization_id, target_multiplier, rule_version, updated_at)
  on table public.inventory_storage_settings to authenticated;
grant select, insert, update, delete on table public.inventory_storage_settings to service_role;

revoke all privileges on table public.inventory_location_reference_guidance from public, anon, authenticated, service_role;
grant select (
  id, location_id, object_path, caption, mime_type, byte_size,
  original_file_name, revision, updated_at
) on table public.inventory_location_reference_guidance to authenticated;
grant select, insert, update, delete on table public.inventory_location_reference_guidance to service_role;

revoke all privileges on table public.inventory_reference_image_cleanup_queue from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.inventory_reference_image_cleanup_queue to service_role;

revoke all privileges on table public.inventory_locations from authenticated;
grant select (
  id, organization_id, name, code, location_type, parent_location_id, zone, description,
  active, countable, sort_order, metadata, created_at, updated_at
) on table public.inventory_locations to authenticated;

revoke all privileges on table public.inventory_location_products from authenticated;
grant select (
  id, organization_id, location_id, product_id, par_quantity, minimum_quantity,
  default_restock_quantity, count_order, active, notes, metadata,
  stock_policy, target_mode, reserve_multiplier, case_size, target_cases,
  target_loose_quantity, physical_recount_interval_days,
  contributes_to_storage_target, historical_suggestion_quantity,
  historical_suggestion_note, historical_suggestion_source,
  created_at, updated_at
) on table public.inventory_location_products to authenticated;

revoke all privileges on table public.inventory_count_lines from authenticated;
grant select (
  id, organization_id, session_id, location_id, product_id,
  product_name_snapshot, location_name_snapshot, unit_label_snapshot,
  category_snapshot, location_sort_order_snapshot, count_order_snapshot,
  product_sort_order_snapshot, par_quantity_snapshot, minimum_quantity_snapshot,
  stock_policy_snapshot, target_mode_snapshot, effective_target_quantity_snapshot,
  service_target_basis_snapshot, reserve_multiplier_snapshot, case_size_snapshot,
  target_cases_snapshot, target_loose_quantity_snapshot,
  physical_recount_interval_days_snapshot, previous_verified_count_line_id,
  previous_physical_count_quantity_snapshot, previous_physical_counted_at_snapshot,
  historical_suggestion_quantity_snapshot, historical_suggestion_note_snapshot,
  historical_suggestion_source_snapshot, storage_rule_version_snapshot,
  count_mode_snapshot, container_capacity_liters_snapshot,
  counted_whole_units, counted_open_volume_liters, counted_full_kegs,
  counted_partial_keg_fraction, count_full_cases, count_loose_quantity,
  counted_quantity, count_method, count_status, variance_quantity,
  restock_quantity, note, counted_at, counted_by_name, metadata,
  created_at, updated_at
) on table public.inventory_count_lines to authenticated;

revoke all on function public.inventory_location_is_countable(uuid, uuid) from public, anon, authenticated;
revoke all on function public.inventory_stock_policy_target_details(uuid) from public, anon, authenticated;
revoke all on function public.inventory_stock_policy_target(uuid) from public, anon, authenticated;
revoke all on function public.inventory_reference_image_path_valid(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.inventory_validate_reference_guidance() from public, anon, authenticated;
revoke all on function public.inventory_detach_reference_on_location_archive() from public, anon, authenticated;
revoke all on function public.set_inventory_location_countable(uuid, boolean) from public, anon, authenticated;
revoke all on function public.set_inventory_storage_multiplier(numeric) from public, anon, authenticated;
revoke all on function public.set_inventory_location_reference_guidance(uuid, text, text, text, bigint, text, bigint) from public, anon, authenticated;
revoke all on function public.remove_inventory_location_reference_image(uuid, bigint) from public, anon, authenticated;
revoke all on function public.list_inventory_reference_cleanup_paths() from public, anon, authenticated;
revoke all on function public.queue_inventory_reference_cleanup_path(uuid, text, text) from public, anon, authenticated;
revoke all on function public.acknowledge_inventory_reference_cleanup(text) from public, anon, authenticated;
revoke all on function public.create_inventory_count_session(text, text, uuid, date, uuid[], text) from public, anon, authenticated;
revoke all on function public.create_inventory_count_assignment(uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.get_inventory_counter_workspace() from public, anon, authenticated;

grant execute on function public.set_inventory_location_countable(uuid, boolean) to authenticated;
grant execute on function public.set_inventory_storage_multiplier(numeric) to authenticated;
grant execute on function public.set_inventory_location_reference_guidance(uuid, text, text, text, bigint, text, bigint) to authenticated;
grant execute on function public.remove_inventory_location_reference_image(uuid, bigint) to authenticated;
grant execute on function public.list_inventory_reference_cleanup_paths() to authenticated;
grant execute on function public.queue_inventory_reference_cleanup_path(uuid, text, text) to authenticated;
grant execute on function public.acknowledge_inventory_reference_cleanup(text) to authenticated;
grant execute on function public.create_inventory_count_session(text, text, uuid, date, uuid[], text) to authenticated;
grant execute on function public.create_inventory_count_assignment(uuid, uuid, uuid, timestamptz) to authenticated;
grant execute on function public.get_inventory_counter_workspace() to authenticated;

-- Supabase Storage is present in hosted projects. The conditional block keeps
-- repository-only PostgreSQL verification explicit when the Storage schema is
-- bootstrapped by the disposable test runner.
do $storage$
begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    execute $sql$
      insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values (
        'inventory-location-reference-images',
        'inventory-location-reference-images',
        false,
        5242880,
        array['image/jpeg','image/png','image/webp']::text[]
      )
      on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types
      where storage.buckets.public is distinct from false
         or storage.buckets.file_size_limit is distinct from excluded.file_size_limit
         or storage.buckets.allowed_mime_types is distinct from excluded.allowed_mime_types
    $sql$;

    execute 'drop policy if exists inventory_reference_images_insert on storage.objects';
    execute 'drop policy if exists inventory_reference_images_select on storage.objects';
    execute 'drop policy if exists inventory_reference_images_delete on storage.objects';
    execute $sql$
      create policy inventory_reference_images_insert
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'inventory-location-reference-images'
        and public.current_user_can_manage_inventory_config()
        and public.inventory_reference_image_path_valid(
          public.current_user_organization_id(),
          split_part(name, '/', 2)::uuid,
          name
        )
        and exists (
          select 1 from public.inventory_locations location
          where location.id = split_part(name, '/', 2)::uuid
            and location.organization_id = public.current_user_organization_id()
            and location.countable
        )
      )
    $sql$;
    execute $sql$
      create policy inventory_reference_images_select
      on storage.objects for select to authenticated
      using (
        bucket_id = 'inventory-location-reference-images'
        and exists (
          select 1
          from public.inventory_location_reference_guidance guidance
          where guidance.organization_id = public.current_user_organization_id()
            and guidance.object_path = name
            and (
              public.current_user_can_manage_inventory_config()
              or exists (
                select 1
                from public.inventory_count_assignments assignment
                join public.inventory_counter_memberships membership
                  on membership.id = assignment.counter_membership_id
                 and membership.organization_id = assignment.organization_id
                join public.inventory_count_sessions session
                  on session.id = assignment.session_id
                 and session.organization_id = assignment.organization_id
                where assignment.organization_id = guidance.organization_id
                  and assignment.location_id = guidance.location_id
                  and membership.counter_auth_user_id = auth.uid()
                  and membership.active
                  and assignment.state <> 'superseded'
                  and session.status in ('draft', 'in_progress')
              )
            )
        )
      )
    $sql$;
    execute $sql$
      create policy inventory_reference_images_delete
      on storage.objects for delete to authenticated
      using (
        bucket_id = 'inventory-location-reference-images'
        and public.current_user_can_manage_inventory_config()
        and split_part(name, '/', 1) = public.current_user_organization_id()::text
        and (
          exists (
            select 1 from public.inventory_locations location
            where location.id = split_part(name, '/', 2)::uuid
              and location.organization_id = public.current_user_organization_id()
              and public.inventory_reference_image_path_valid(location.organization_id, location.id, name)
          )
          or exists (
            select 1 from public.inventory_reference_image_cleanup_queue queue
            where queue.organization_id = public.current_user_organization_id()
              and queue.object_path = name
              and queue.completed_at is null
          )
        )
      )
    $sql$;
  end if;
end;
$storage$;

notify pgrst, 'reload schema';

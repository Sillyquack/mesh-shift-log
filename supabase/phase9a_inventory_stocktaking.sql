-- Phase 9A: organization-scoped inventory, par levels, and auditable stocktaking.
-- Apply after schema.sql and the Phase 7A shared-device migration.

create extension if not exists pgcrypto;

create table if not exists public.inventory_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_user_organization_id() references public.organizations(id),
  name text not null,
  short_name text,
  sku text,
  barcode text,
  category text,
  unit_label text not null,
  default_pack_size numeric,
  supplier_name text,
  notes text,
  active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_auth_user_id uuid default auth.uid() references auth.users(id),
  updated_by_auth_user_id uuid default auth.uid() references auth.users(id),
  constraint inventory_products_name_required check (nullif(trim(name), '') is not null),
  constraint inventory_products_unit_required check (nullif(trim(unit_label), '') is not null),
  constraint inventory_products_pack_nonnegative check (default_pack_size is null or default_pack_size >= 0),
  constraint inventory_products_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_user_organization_id() references public.organizations(id),
  name text not null,
  code text,
  location_type text,
  parent_location_id uuid references public.inventory_locations(id),
  zone text,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_auth_user_id uuid default auth.uid() references auth.users(id),
  updated_by_auth_user_id uuid default auth.uid() references auth.users(id),
  constraint inventory_locations_name_required check (nullif(trim(name), '') is not null),
  constraint inventory_locations_not_self_parent check (parent_location_id is null or parent_location_id <> id),
  constraint inventory_locations_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.inventory_location_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_user_organization_id() references public.organizations(id),
  location_id uuid not null references public.inventory_locations(id),
  product_id uuid not null references public.inventory_products(id),
  par_quantity numeric not null default 0,
  minimum_quantity numeric,
  default_restock_quantity numeric,
  count_order integer not null default 0,
  active boolean not null default true,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_auth_user_id uuid default auth.uid() references auth.users(id),
  updated_by_auth_user_id uuid default auth.uid() references auth.users(id),
  constraint inventory_location_products_par_nonnegative check (par_quantity >= 0),
  constraint inventory_location_products_minimum_nonnegative check (minimum_quantity is null or minimum_quantity >= 0),
  constraint inventory_location_products_restock_nonnegative check (default_restock_quantity is null or default_restock_quantity >= 0),
  constraint inventory_location_products_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint inventory_location_products_unique unique (location_id, product_id)
);

create table if not exists public.inventory_count_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_user_organization_id() references public.organizations(id),
  title text not null,
  count_type text not null,
  status text not null default 'in_progress',
  count_date date not null default ((now() at time zone 'Europe/Oslo')::date),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  approved_at timestamptz,
  started_by_auth_user_id uuid default auth.uid() references auth.users(id),
  started_by_name text not null,
  completed_by_auth_user_id uuid references auth.users(id),
  completed_by_name text,
  approved_by_auth_user_id uuid references auth.users(id),
  approved_by_name text,
  completion_note text,
  approval_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_count_sessions_title_required check (nullif(trim(title), '') is not null),
  constraint inventory_count_sessions_type_check check (count_type in ('opening', 'closing', 'daily', 'weekly', 'monthly', 'ad_hoc', 'event', 'other')),
  constraint inventory_count_sessions_status_check check (status in ('draft', 'in_progress', 'completed', 'approved', 'cancelled')),
  constraint inventory_count_sessions_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.inventory_count_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  session_id uuid not null references public.inventory_count_sessions(id),
  location_id uuid not null references public.inventory_locations(id),
  product_id uuid not null references public.inventory_products(id),
  product_name_snapshot text not null,
  location_name_snapshot text not null,
  unit_label_snapshot text not null,
  category_snapshot text,
  location_sort_order_snapshot integer not null default 0,
  count_order_snapshot integer not null default 0,
  product_sort_order_snapshot integer not null default 0,
  par_quantity_snapshot numeric not null,
  minimum_quantity_snapshot numeric,
  counted_quantity numeric,
  count_method text not null default 'uncounted',
  count_status text not null default 'not_counted',
  variance_quantity numeric generated always as (
    case when counted_quantity is null then null else counted_quantity - par_quantity_snapshot end
  ) stored,
  restock_quantity numeric generated always as (
    case when counted_quantity is null then null else greatest(par_quantity_snapshot - counted_quantity, 0) end
  ) stored,
  note text,
  counted_at timestamptz,
  counted_by_auth_user_id uuid references auth.users(id),
  counted_by_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_count_lines_product_snapshot_required check (nullif(trim(product_name_snapshot), '') is not null),
  constraint inventory_count_lines_location_snapshot_required check (nullif(trim(location_name_snapshot), '') is not null),
  constraint inventory_count_lines_unit_snapshot_required check (nullif(trim(unit_label_snapshot), '') is not null),
  constraint inventory_count_lines_par_nonnegative check (par_quantity_snapshot >= 0),
  constraint inventory_count_lines_minimum_nonnegative check (minimum_quantity_snapshot is null or minimum_quantity_snapshot >= 0),
  constraint inventory_count_lines_quantity_nonnegative check (counted_quantity is null or counted_quantity >= 0),
  constraint inventory_count_lines_method_check check (count_method in ('uncounted', 'manual', 'use_par', 'imported', 'adjusted')),
  constraint inventory_count_lines_status_check check (count_status in ('not_counted', 'counted', 'skipped', 'needs_review')),
  constraint inventory_count_lines_method_quantity_consistency check (
    (count_method = 'uncounted' and count_status in ('not_counted', 'skipped') and counted_quantity is null)
    or (count_method = 'use_par' and count_status = 'counted' and counted_quantity = par_quantity_snapshot)
    or (count_method in ('manual', 'imported', 'adjusted') and count_status in ('counted', 'needs_review') and counted_quantity is not null)
  ),
  constraint inventory_count_lines_skipped_note_required check (
    count_status <> 'skipped' or nullif(trim(coalesce(note, '')), '') is not null
  ),
  constraint inventory_count_lines_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint inventory_count_lines_unique unique (session_id, location_id, product_id)
);

create unique index if not exists inventory_products_org_sku_unique
  on public.inventory_products (organization_id, lower(trim(sku)))
  where nullif(trim(sku), '') is not null;
create unique index if not exists inventory_products_org_barcode_unique
  on public.inventory_products (organization_id, lower(trim(barcode)))
  where nullif(trim(barcode), '') is not null;
create index if not exists inventory_products_org_active_idx on public.inventory_products (organization_id, active);
create index if not exists inventory_products_org_name_idx on public.inventory_products (organization_id, lower(name));
create unique index if not exists inventory_locations_org_code_unique
  on public.inventory_locations (organization_id, lower(trim(code)))
  where nullif(trim(code), '') is not null;
create index if not exists inventory_locations_org_active_order_idx on public.inventory_locations (organization_id, active, sort_order, name);
create index if not exists inventory_locations_parent_idx on public.inventory_locations (parent_location_id);
create index if not exists inventory_location_products_location_idx on public.inventory_location_products (organization_id, location_id, active, count_order);
create index if not exists inventory_location_products_product_idx on public.inventory_location_products (organization_id, product_id);
create index if not exists inventory_count_sessions_org_date_idx on public.inventory_count_sessions (organization_id, count_date desc);
create index if not exists inventory_count_sessions_org_status_idx on public.inventory_count_sessions (organization_id, status);
create index if not exists inventory_count_sessions_created_idx on public.inventory_count_sessions (created_at desc);
create index if not exists inventory_count_lines_session_idx on public.inventory_count_lines (organization_id, session_id);
create index if not exists inventory_count_lines_session_order_idx on public.inventory_count_lines (
  session_id, location_sort_order_snapshot, location_name_snapshot,
  count_order_snapshot, product_sort_order_snapshot, product_name_snapshot
);
create index if not exists inventory_count_lines_location_idx on public.inventory_count_lines (session_id, location_id);
create index if not exists inventory_count_lines_status_idx on public.inventory_count_lines (session_id, count_status);
create index if not exists inventory_count_lines_product_idx on public.inventory_count_lines (product_id);
create index if not exists inventory_count_lines_restock_idx on public.inventory_count_lines (session_id, restock_quantity)
  where restock_quantity > 0;

create or replace function public.inventory_validate_location()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_parent_org uuid;
begin
  if new.parent_location_id is null then
    return new;
  end if;
  if new.parent_location_id = new.id then
    raise exception 'Inventory location cannot be its own parent.';
  end if;
  select location.organization_id into v_parent_org
  from public.inventory_locations location
  where location.id = new.parent_location_id;
  if v_parent_org is null or v_parent_org is distinct from new.organization_id then
    raise exception 'Inventory location parent must belong to the same organization.';
  end if;
  if exists (
    with recursive ancestors as (
      select location.id, location.parent_location_id
      from public.inventory_locations location
      where location.id = new.parent_location_id
      union all
      select parent.id, parent.parent_location_id
      from public.inventory_locations parent
      join ancestors child on parent.id = child.parent_location_id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'Inventory location parent would create a cycle.';
  end if;
  return new;
end;
$$;

create or replace function public.inventory_validate_location_product()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_location_org uuid;
  v_product_org uuid;
begin
  select organization_id into v_location_org from public.inventory_locations where id = new.location_id;
  select organization_id into v_product_org from public.inventory_products where id = new.product_id;
  if v_location_org is null or v_product_org is null
     or v_location_org is distinct from new.organization_id
     or v_product_org is distinct from new.organization_id then
    raise exception 'Inventory product and location must belong to the same organization.';
  end if;
  return new;
end;
$$;

create or replace function public.inventory_validate_count_line()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_session_org uuid;
  v_location_org uuid;
  v_product_org uuid;
begin
  select organization_id into v_session_org from public.inventory_count_sessions where id = new.session_id;
  select organization_id into v_location_org from public.inventory_locations where id = new.location_id;
  select organization_id into v_product_org from public.inventory_products where id = new.product_id;
  if v_session_org is null or v_location_org is null or v_product_org is null
     or v_session_org is distinct from new.organization_id
     or v_location_org is distinct from new.organization_id
     or v_product_org is distinct from new.organization_id then
    raise exception 'Inventory count line references must belong to one organization.';
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_locations_validate on public.inventory_locations;
create trigger inventory_locations_validate before insert or update on public.inventory_locations
for each row execute function public.inventory_validate_location();
drop trigger if exists inventory_location_products_validate on public.inventory_location_products;
create trigger inventory_location_products_validate before insert or update on public.inventory_location_products
for each row execute function public.inventory_validate_location_product();
drop trigger if exists inventory_count_lines_validate on public.inventory_count_lines;
create trigger inventory_count_lines_validate before insert or update on public.inventory_count_lines
for each row execute function public.inventory_validate_count_line();

drop trigger if exists inventory_products_set_updated_at on public.inventory_products;
create trigger inventory_products_set_updated_at before update on public.inventory_products
for each row execute function public.set_updated_at();
drop trigger if exists inventory_locations_set_updated_at on public.inventory_locations;
create trigger inventory_locations_set_updated_at before update on public.inventory_locations
for each row execute function public.set_updated_at();
drop trigger if exists inventory_location_products_set_updated_at on public.inventory_location_products;
create trigger inventory_location_products_set_updated_at before update on public.inventory_location_products
for each row execute function public.set_updated_at();
drop trigger if exists inventory_count_sessions_set_updated_at on public.inventory_count_sessions;
create trigger inventory_count_sessions_set_updated_at before update on public.inventory_count_sessions
for each row execute function public.set_updated_at();
drop trigger if exists inventory_count_lines_set_updated_at on public.inventory_count_lines;
create trigger inventory_count_lines_set_updated_at before update on public.inventory_count_lines
for each row execute function public.set_updated_at();

create or replace function public.current_user_can_manage_inventory_config()
returns boolean
language sql
security definer
set search_path = pg_catalog
as $$
  select public.current_user_is_active()
    and public.current_user_profile_role() = 'manager'
    and not public.current_user_is_shared_device();
$$;

create or replace function public.current_user_can_coordinate_inventory()
returns boolean
language sql
security definer
set search_path = pg_catalog
as $$
  select public.current_user_is_active()
    and public.current_user_profile_role() in ('manager', 'event_floor_manager')
    and not public.current_user_is_shared_device();
$$;

create or replace function public.inventory_resolve_actor(input_actor_name text default null)
returns table (
  organization_id uuid,
  actor_auth_user_id uuid,
  actor_name text,
  shared_device boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_profile public.user_profiles%rowtype;
  v_actor_name text := nullif(trim(coalesce(input_actor_name, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Authenticated inventory access is required.';
  end if;
  select profile.* into v_profile
  from public.user_profiles profile
  where profile.id = auth.uid()
    and profile.active = true;
  if v_profile.id is null or v_profile.organization_id is null then
    raise exception 'Active organization profile required for inventory access.';
  end if;

  if coalesce(v_profile.is_shared_device, false) then
    if v_actor_name is null then
      raise exception 'Select the current operator before using stocktaking.';
    end if;
    if not exists (
      select 1
      from public.shift_sessions session
      where session.organization_id = v_profile.organization_id
        and session.auth_user_id = auth.uid()
        and session.shift_date = ((pg_catalog.now() at time zone 'Europe/Oslo')::date)
        and session.status = 'active'
        and lower(trim(coalesce(session.operator_name, session.display_name, ''))) = lower(v_actor_name)
    ) then
      raise exception 'Selected operator does not match an active shared-device shift session.';
    end if;
  else
    v_actor_name := nullif(trim(v_profile.display_name), '');
    if v_actor_name is null then
      raise exception 'Personal user profile requires a display name.';
    end if;
  end if;

  return query select v_profile.organization_id, auth.uid(), v_actor_name, coalesce(v_profile.is_shared_device, false);
end;
$$;

create or replace function public.inventory_session_is_visible(input_session_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.inventory_count_sessions session
    where session.id = input_session_id
      and session.organization_id = public.current_user_organization_id()
      and public.current_user_is_active()
      and (
        public.current_user_can_coordinate_inventory()
        or session.status in ('draft', 'in_progress')
      )
  );
$$;

create or replace function public.get_inventory_count_session_record(input_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_session public.inventory_count_sessions%rowtype;
  v_location_completions jsonb := '{}'::jsonb;
begin
  if not public.inventory_session_is_visible(input_session_id) then
    raise exception 'Inventory count session was not found or is not available.';
  end if;
  select session.* into v_session
  from public.inventory_count_sessions session
  where session.id = input_session_id
    and session.organization_id = public.current_user_organization_id();
  if v_session.id is null then
    raise exception 'Inventory count session was not found.';
  end if;
  select coalesce(jsonb_object_agg(entry.key, entry.value - 'completedByAuthUserId'), '{}'::jsonb)
  into v_location_completions
  from jsonb_each(coalesce(v_session.metadata->'locationCompletions', '{}'::jsonb)) entry;
  return jsonb_build_object(
    'id', v_session.id,
    'title', v_session.title,
    'count_type', v_session.count_type,
    'status', v_session.status,
    'count_date', v_session.count_date,
    'started_at', v_session.started_at,
    'completed_at', v_session.completed_at,
    'approved_at', v_session.approved_at,
    'started_by_name', v_session.started_by_name,
    'completed_by_name', v_session.completed_by_name,
    'approved_by_name', v_session.approved_by_name,
    'completion_note', v_session.completion_note,
    'approval_note', v_session.approval_note,
    'metadata', jsonb_strip_nulls(jsonb_build_object(
      'startNote', v_session.metadata->'startNote',
      'locationCompletions', v_location_completions,
      'completionExceptions', v_session.metadata->'completionExceptions'
    )),
    'updated_at', v_session.updated_at
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
  if v_line.id is null then
    raise exception 'Inventory count line was not found or is not available.';
  end if;
  return jsonb_build_object(
    'id', v_line.id,
    'location_id', v_line.location_id,
    'product_name_snapshot', v_line.product_name_snapshot,
    'location_name_snapshot', v_line.location_name_snapshot,
    'unit_label_snapshot', v_line.unit_label_snapshot,
    'category_snapshot', v_line.category_snapshot,
    'location_sort_order_snapshot', v_line.location_sort_order_snapshot,
    'count_order_snapshot', v_line.count_order_snapshot,
    'product_sort_order_snapshot', v_line.product_sort_order_snapshot,
    'par_quantity_snapshot', v_line.par_quantity_snapshot,
    'minimum_quantity_snapshot', v_line.minimum_quantity_snapshot,
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

alter table public.inventory_products enable row level security;
alter table public.inventory_locations enable row level security;
alter table public.inventory_location_products enable row level security;
alter table public.inventory_count_sessions enable row level security;
alter table public.inventory_count_lines enable row level security;

drop policy if exists inventory_products_read on public.inventory_products;
create policy inventory_products_read on public.inventory_products for select to authenticated
using (
  public.current_user_is_active()
  and organization_id = public.current_user_organization_id()
  and (active or public.current_user_can_manage_inventory_config())
);
drop policy if exists inventory_locations_read on public.inventory_locations;
create policy inventory_locations_read on public.inventory_locations for select to authenticated
using (
  public.current_user_is_active()
  and organization_id = public.current_user_organization_id()
  and (active or public.current_user_can_manage_inventory_config())
);
drop policy if exists inventory_location_products_read on public.inventory_location_products;
create policy inventory_location_products_read on public.inventory_location_products for select to authenticated
using (
  public.current_user_is_active()
  and organization_id = public.current_user_organization_id()
  and (active or public.current_user_can_manage_inventory_config())
);
drop policy if exists inventory_count_sessions_read on public.inventory_count_sessions;
create policy inventory_count_sessions_read on public.inventory_count_sessions for select to authenticated
using (
  public.current_user_is_active()
  and organization_id = public.current_user_organization_id()
  and (public.current_user_can_coordinate_inventory() or status in ('draft', 'in_progress'))
);
drop policy if exists inventory_count_lines_read on public.inventory_count_lines;
create policy inventory_count_lines_read on public.inventory_count_lines for select to authenticated
using (
  public.current_user_is_active()
  and organization_id = public.current_user_organization_id()
  and public.inventory_session_is_visible(session_id)
);

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
    'default_pack_size', 'supplier_name', 'notes', 'active', 'sort_order', 'metadata'
  ]::text[]);
begin
  if not public.current_user_can_manage_inventory_config() or v_org is null then
    raise exception 'Manager inventory configuration access required.';
  end if;
  if input_default_pack_size is not null and input_default_pack_size < 0 then
    raise exception 'Default pack size cannot be negative.';
  end if;

  if input_product_id is null then
    if v_name is null then raise exception 'Product name is required.'; end if;
    if v_unit is null then raise exception 'Product unit is required.'; end if;
    insert into public.inventory_products (
      organization_id, name, short_name, sku, barcode, category, unit_label,
      default_pack_size, supplier_name, notes, active, sort_order, metadata,
      created_by_auth_user_id, updated_by_auth_user_id
    ) values (
      v_org, v_name, nullif(trim(coalesce(input_short_name, '')), ''),
      nullif(trim(coalesce(input_sku, '')), ''), nullif(trim(coalesce(input_barcode, '')), ''),
      nullif(trim(coalesce(input_category, '')), ''), v_unit, input_default_pack_size,
      nullif(trim(coalesce(input_supplier_name, '')), ''), nullif(trim(coalesce(input_notes, '')), ''),
      coalesce(input_active, true), coalesce(input_sort_order, 0), coalesce(input_metadata, '{}'::jsonb),
      auth.uid(), auth.uid()
    ) returning * into v_record;
  else
    select product.* into v_record
    from public.inventory_products product
    where product.id = input_product_id and product.organization_id = v_org
    for update;
    if v_record.id is null then raise exception 'Inventory product was not found.'; end if;
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
        updated_by_auth_user_id = auth.uid()
    where product.id = input_product_id and product.organization_id = v_org
    returning * into v_record;
  end if;
  return jsonb_build_object(
    'id', v_record.id,
    'name', v_record.name,
    'short_name', v_record.short_name,
    'sku', v_record.sku,
    'barcode', v_record.barcode,
    'category', v_record.category,
    'unit_label', v_record.unit_label,
    'default_pack_size', v_record.default_pack_size,
    'supplier_name', v_record.supplier_name,
    'notes', v_record.notes,
    'active', v_record.active,
    'sort_order', v_record.sort_order
  );
end;
$$;

create or replace function public.upsert_inventory_location(
  input_location_id uuid default null,
  input_name text default null,
  input_code text default null,
  input_location_type text default null,
  input_parent_location_id uuid default null,
  input_zone text default null,
  input_description text default null,
  input_active boolean default null,
  input_sort_order integer default null,
  input_metadata jsonb default null,
  input_fields text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := public.current_user_organization_id();
  v_record public.inventory_locations%rowtype;
  v_name text := nullif(trim(coalesce(input_name, '')), '');
  v_fields text[] := coalesce(input_fields, array[
    'name', 'code', 'location_type', 'parent_location_id', 'zone',
    'description', 'active', 'sort_order', 'metadata'
  ]::text[]);
begin
  if not public.current_user_can_manage_inventory_config() or v_org is null then
    raise exception 'Manager inventory configuration access required.';
  end if;
  if input_parent_location_id is not null
     and (input_location_id is null or 'parent_location_id' = any(v_fields))
     and not exists (
    select 1 from public.inventory_locations location
    where location.id = input_parent_location_id and location.organization_id = v_org
  ) then
    raise exception 'Parent inventory location was not found in this organization.';
  end if;

  if input_location_id is null then
    if v_name is null then raise exception 'Location name is required.'; end if;
    insert into public.inventory_locations (
      organization_id, name, code, location_type, parent_location_id, zone,
      description, active, sort_order, metadata, created_by_auth_user_id, updated_by_auth_user_id
    ) values (
      v_org, v_name, nullif(trim(coalesce(input_code, '')), ''),
      nullif(trim(coalesce(input_location_type, '')), ''), input_parent_location_id,
      nullif(lower(trim(coalesce(input_zone, ''))), ''), nullif(trim(coalesce(input_description, '')), ''),
      coalesce(input_active, true), coalesce(input_sort_order, 0), coalesce(input_metadata, '{}'::jsonb),
      auth.uid(), auth.uid()
    ) returning * into v_record;
  else
    select location.* into v_record
    from public.inventory_locations location
    where location.id = input_location_id and location.organization_id = v_org
    for update;
    if v_record.id is null then raise exception 'Inventory location was not found.'; end if;
    if 'name' = any(v_fields) and v_name is null then raise exception 'Location name is required.'; end if;
    update public.inventory_locations location
    set name = case when 'name' = any(v_fields) then v_name else location.name end,
        code = case when 'code' = any(v_fields) then nullif(trim(coalesce(input_code, '')), '') else location.code end,
        location_type = case when 'location_type' = any(v_fields) then nullif(trim(coalesce(input_location_type, '')), '') else location.location_type end,
        parent_location_id = case when 'parent_location_id' = any(v_fields) then input_parent_location_id else location.parent_location_id end,
        zone = case when 'zone' = any(v_fields) then nullif(lower(trim(coalesce(input_zone, ''))), '') else location.zone end,
        description = case when 'description' = any(v_fields) then nullif(trim(coalesce(input_description, '')), '') else location.description end,
        active = case when 'active' = any(v_fields) then coalesce(input_active, location.active) else location.active end,
        sort_order = case when 'sort_order' = any(v_fields) then coalesce(input_sort_order, location.sort_order) else location.sort_order end,
        metadata = case when 'metadata' = any(v_fields) then coalesce(input_metadata, '{}'::jsonb) else location.metadata end,
        updated_by_auth_user_id = auth.uid()
    where location.id = input_location_id and location.organization_id = v_org
    returning * into v_record;
  end if;
  return jsonb_build_object(
    'id', v_record.id,
    'name', v_record.name,
    'code', v_record.code,
    'location_type', v_record.location_type,
    'parent_location_id', v_record.parent_location_id,
    'zone', v_record.zone,
    'description', v_record.description,
    'active', v_record.active,
    'sort_order', v_record.sort_order
  );
end;
$$;

create or replace function public.upsert_inventory_location_product(
  input_location_product_id uuid default null,
  input_location_id uuid default null,
  input_product_id uuid default null,
  input_par_quantity numeric default null,
  input_minimum_quantity numeric default null,
  input_default_restock_quantity numeric default null,
  input_count_order integer default null,
  input_active boolean default null,
  input_notes text default null,
  input_metadata jsonb default null,
  input_fields text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := public.current_user_organization_id();
  v_record public.inventory_location_products%rowtype;
  v_location_id uuid;
  v_product_id uuid;
  v_fields text[] := coalesce(input_fields, array[
    'location_id', 'product_id', 'par_quantity', 'minimum_quantity',
    'default_restock_quantity', 'count_order', 'active', 'notes', 'metadata'
  ]::text[]);
begin
  if not public.current_user_can_manage_inventory_config() or v_org is null then
    raise exception 'Manager inventory configuration access required.';
  end if;
  if input_par_quantity < 0 or input_minimum_quantity < 0 or input_default_restock_quantity < 0 then
    raise exception 'Inventory standard quantities cannot be negative.';
  end if;

  if input_location_product_id is not null then
    select * into v_record from public.inventory_location_products
    where id = input_location_product_id and organization_id = v_org for update;
    if v_record.id is null then raise exception 'Inventory stocking standard was not found.'; end if;
  elsif input_location_id is not null and input_product_id is not null then
    select * into v_record from public.inventory_location_products
    where organization_id = v_org and location_id = input_location_id and product_id = input_product_id
    for update;
  end if;

  if v_record.id is null then
    if input_location_id is null or input_product_id is null then
      raise exception 'Location and product are required for a stocking standard.';
    end if;
    v_location_id := input_location_id;
    v_product_id := input_product_id;
  else
    v_location_id := case when 'location_id' = any(v_fields) then input_location_id else v_record.location_id end;
    v_product_id := case when 'product_id' = any(v_fields) then input_product_id else v_record.product_id end;
  end if;
  if v_location_id is null or not exists (
    select 1 from public.inventory_locations where id = v_location_id and organization_id = v_org
  ) then raise exception 'Inventory location was not found.'; end if;
  if v_product_id is null or not exists (
    select 1 from public.inventory_products where id = v_product_id and organization_id = v_org
  ) then raise exception 'Inventory product was not found.'; end if;

  if v_record.id is null then
    insert into public.inventory_location_products (
      organization_id, location_id, product_id, par_quantity, minimum_quantity,
      default_restock_quantity, count_order, active, notes, metadata,
      created_by_auth_user_id, updated_by_auth_user_id
    ) values (
      v_org, v_location_id, v_product_id, coalesce(input_par_quantity, 0), input_minimum_quantity,
      input_default_restock_quantity, coalesce(input_count_order, 0), coalesce(input_active, true),
      nullif(trim(coalesce(input_notes, '')), ''), coalesce(input_metadata, '{}'::jsonb), auth.uid(), auth.uid()
    ) returning * into v_record;
  else
    update public.inventory_location_products standard
    set location_id = v_location_id,
        product_id = v_product_id,
        par_quantity = case when 'par_quantity' = any(v_fields) then coalesce(input_par_quantity, standard.par_quantity) else standard.par_quantity end,
        minimum_quantity = case when 'minimum_quantity' = any(v_fields) then input_minimum_quantity else standard.minimum_quantity end,
        default_restock_quantity = case when 'default_restock_quantity' = any(v_fields) then input_default_restock_quantity else standard.default_restock_quantity end,
        count_order = case when 'count_order' = any(v_fields) then coalesce(input_count_order, standard.count_order) else standard.count_order end,
        active = case when 'active' = any(v_fields) then coalesce(input_active, standard.active) else standard.active end,
        notes = case when 'notes' = any(v_fields) then nullif(trim(coalesce(input_notes, '')), '') else standard.notes end,
        metadata = case when 'metadata' = any(v_fields) then coalesce(input_metadata, '{}'::jsonb) else standard.metadata end,
        updated_by_auth_user_id = auth.uid()
    where standard.id = v_record.id
    returning * into v_record;
  end if;
  return jsonb_build_object(
    'id', v_record.id,
    'location_id', v_record.location_id,
    'product_id', v_record.product_id,
    'par_quantity', v_record.par_quantity,
    'minimum_quantity', v_record.minimum_quantity,
    'default_restock_quantity', v_record.default_restock_quantity,
    'count_order', v_record.count_order,
    'active', v_record.active,
    'notes', v_record.notes
  );
end;
$$;

create or replace function public.copy_inventory_location_standards(
  input_source_location_id uuid,
  input_destination_location_id uuid,
  input_overwrite_existing boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := public.current_user_organization_id();
  v_source_count integer := 0;
  v_added integer := 0;
  v_preserved integer := 0;
  v_updated integer := 0;
begin
  if not public.current_user_can_manage_inventory_config() or v_org is null then
    raise exception 'Manager inventory configuration access required.';
  end if;
  if input_source_location_id = input_destination_location_id then
    raise exception 'Choose two different inventory locations.';
  end if;
  if not exists (select 1 from public.inventory_locations where id = input_source_location_id and organization_id = v_org)
     or not exists (select 1 from public.inventory_locations where id = input_destination_location_id and organization_id = v_org) then
    raise exception 'Source and destination locations must belong to the current organization.';
  end if;
  select count(*) into v_source_count from public.inventory_location_products
  where organization_id = v_org and location_id = input_source_location_id and active = true;

  select count(*) into v_preserved
  from public.inventory_location_products source
  join public.inventory_location_products destination
    on destination.organization_id = source.organization_id
   and destination.location_id = input_destination_location_id
   and destination.product_id = source.product_id
  where source.organization_id = v_org and source.location_id = input_source_location_id and source.active = true;

  if input_overwrite_existing then
    update public.inventory_location_products destination
    set par_quantity = source.par_quantity,
        minimum_quantity = source.minimum_quantity,
        default_restock_quantity = source.default_restock_quantity,
        count_order = source.count_order,
        active = true,
        notes = source.notes,
        updated_by_auth_user_id = auth.uid()
    from public.inventory_location_products source
    where source.organization_id = v_org
      and source.location_id = input_source_location_id
      and source.active = true
      and destination.organization_id = v_org
      and destination.location_id = input_destination_location_id
      and destination.product_id = source.product_id;
    get diagnostics v_updated = row_count;
  end if;

  insert into public.inventory_location_products (
    organization_id, location_id, product_id, par_quantity, minimum_quantity,
    default_restock_quantity, count_order, active, notes, metadata,
    created_by_auth_user_id, updated_by_auth_user_id
  )
  select v_org, input_destination_location_id, source.product_id, source.par_quantity,
    source.minimum_quantity, source.default_restock_quantity, source.count_order,
    true, source.notes, source.metadata, auth.uid(), auth.uid()
  from public.inventory_location_products source
  where source.organization_id = v_org
    and source.location_id = input_source_location_id
    and source.active = true
    and not exists (
      select 1 from public.inventory_location_products destination
      where destination.organization_id = v_org
        and destination.location_id = input_destination_location_id
        and destination.product_id = source.product_id
    );
  get diagnostics v_added = row_count;

  return jsonb_build_object(
    'sourceCount', v_source_count,
    'added', v_added,
    'preserved', case when input_overwrite_existing then 0 else v_preserved end,
    'updated', v_updated
  );
end;
$$;

create or replace function public.create_inventory_count_session(
  input_title text,
  input_count_type text,
  input_count_date date default null,
  input_location_ids uuid[] default null,
  input_actor_name text default null,
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
  v_title text := nullif(trim(coalesce(input_title, '')), '');
  v_type text := lower(trim(coalesce(input_count_type, '')));
begin
  if not public.current_user_can_coordinate_inventory() then
    raise exception 'Manager or Event Floor Manager access is required to start a stock count.';
  end if;
  select * into v_actor from public.inventory_resolve_actor(input_actor_name);
  if v_title is null then raise exception 'Count session title is required.'; end if;
  if v_type not in ('opening', 'closing', 'daily', 'weekly', 'monthly', 'ad_hoc', 'event', 'other') then
    raise exception 'Choose a valid stock count type.';
  end if;
  if input_location_ids is not null and cardinality(input_location_ids) = 0 then
    raise exception 'Choose at least one inventory location.';
  end if;
  if input_location_ids is not null and exists (
    select 1 from unnest(input_location_ids) selected(id)
    where not exists (
      select 1 from public.inventory_locations location
      where location.id = selected.id
        and location.organization_id = v_actor.organization_id
        and location.active = true
    )
  ) then
    raise exception 'One or more selected inventory locations are unavailable.';
  end if;

  insert into public.inventory_count_sessions (
    organization_id, title, count_type, status, count_date,
    started_by_auth_user_id, started_by_name, metadata
  ) values (
    v_actor.organization_id, v_title, v_type, 'in_progress',
    coalesce(input_count_date, (now() at time zone 'Europe/Oslo')::date),
    v_actor.actor_auth_user_id, v_actor.actor_name,
    jsonb_strip_nulls(jsonb_build_object('startNote', nullif(trim(coalesce(input_note, '')), '')))
  ) returning * into v_session;

  with recursive selected_locations as (
    select location.id
    from public.inventory_locations location
    where location.organization_id = v_actor.organization_id
      and location.active = true
      and (input_location_ids is null or location.id = any(input_location_ids))
    union
    select child.id
    from public.inventory_locations child
    join selected_locations parent on child.parent_location_id = parent.id
    where child.organization_id = v_actor.organization_id
      and child.active = true
  )
  insert into public.inventory_count_lines (
    organization_id, session_id, location_id, product_id,
    product_name_snapshot, location_name_snapshot, unit_label_snapshot,
    category_snapshot, location_sort_order_snapshot, count_order_snapshot,
    product_sort_order_snapshot, par_quantity_snapshot, minimum_quantity_snapshot
  )
  select standard.organization_id, v_session.id, standard.location_id, standard.product_id,
    product.name, location.name, product.unit_label, product.category,
    location.sort_order, standard.count_order, product.sort_order,
    standard.par_quantity, standard.minimum_quantity
  from public.inventory_location_products standard
  join public.inventory_products product
    on product.id = standard.product_id
   and product.organization_id = standard.organization_id
   and product.active = true
  join public.inventory_locations location
    on location.id = standard.location_id
   and location.organization_id = standard.organization_id
   and location.active = true
  where standard.organization_id = v_actor.organization_id
    and standard.active = true
    and (input_location_ids is null or standard.location_id in (select id from selected_locations))
  order by location.sort_order, location.name, standard.count_order, product.sort_order, product.name;
  get diagnostics v_line_count = row_count;

  if v_line_count = 0 then
    raise exception 'No active inventory products are configured for the selected locations.';
  end if;
  select count(distinct line.location_id) into v_location_count
  from public.inventory_count_lines line where line.session_id = v_session.id;

  return jsonb_build_object(
    'session', public.get_inventory_count_session_record(v_session.id),
    'summary', jsonb_build_object('lineCount', v_line_count, 'locationCount', v_location_count)
  );
end;
$$;

-- Inventory count mutations always lock in this order: actor/org resolution,
-- unlocked session-id lookup, session FOR UPDATE, then count line(s) FOR UPDATE.
-- Keeping the session lock first prevents line/session lock inversion between
-- single-line, bulk, location-completion, and session lifecycle operations.
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
  v_session_id uuid;
  v_line public.inventory_count_lines%rowtype;
  v_session public.inventory_count_sessions%rowtype;
begin
  select * into v_actor from public.inventory_resolve_actor(input_actor_name);
  if input_counted_quantity is null then raise exception 'Enter a counted quantity or use Clear.'; end if;
  if input_counted_quantity < 0 then raise exception 'Counted quantity cannot be negative.'; end if;
  select line.session_id into v_session_id from public.inventory_count_lines line
  where line.id = input_line_id and line.organization_id = v_actor.organization_id;
  if v_session_id is null then raise exception 'Inventory count line was not found.'; end if;
  select session.* into v_session from public.inventory_count_sessions session
  where session.id = v_session_id and session.organization_id = v_actor.organization_id for update;
  if v_session.id is null then raise exception 'Inventory count session was not found.'; end if;
  if v_session.status not in ('draft', 'in_progress') then
    raise exception 'This stock count is read-only because it is %.', v_session.status;
  end if;
  select line.* into v_line from public.inventory_count_lines line
  where line.id = input_line_id and line.session_id = v_session.id
    and line.organization_id = v_actor.organization_id for update;
  if v_line.id is null then raise exception 'Inventory count line was not found.'; end if;
  if input_expected_updated_at is not null and v_line.updated_at is distinct from input_expected_updated_at then
    raise exception 'This count line changed on another device. Refresh before saving your value.';
  end if;
  update public.inventory_count_lines line
  set counted_quantity = input_counted_quantity,
      count_method = 'manual',
      count_status = 'counted',
      note = nullif(trim(coalesce(input_note, '')), ''),
      counted_at = now(),
      counted_by_auth_user_id = v_actor.actor_auth_user_id,
      counted_by_name = v_actor.actor_name
  where line.id = v_line.id returning * into v_line;
  update public.inventory_count_sessions session
  set metadata = session.metadata #- array['locationCompletions', v_line.location_id::text]
  where session.id = v_session.id;
  return public.inventory_count_line_client_record(v_line.id);
end;
$$;

create or replace function public.mark_inventory_count_line_use_par(
  input_line_id uuid,
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
  v_session_id uuid;
  v_line public.inventory_count_lines%rowtype;
  v_session public.inventory_count_sessions%rowtype;
begin
  select * into v_actor from public.inventory_resolve_actor(input_actor_name);
  select line.session_id into v_session_id from public.inventory_count_lines line
  where line.id = input_line_id and line.organization_id = v_actor.organization_id;
  if v_session_id is null then raise exception 'Inventory count line was not found.'; end if;
  select session.* into v_session from public.inventory_count_sessions session
  where session.id = v_session_id and session.organization_id = v_actor.organization_id for update;
  if v_session.id is null then raise exception 'Inventory count session was not found.'; end if;
  if v_session.status not in ('draft', 'in_progress') then
    raise exception 'This stock count is read-only because it is %.', v_session.status;
  end if;
  select line.* into v_line from public.inventory_count_lines line
  where line.id = input_line_id and line.session_id = v_session.id
    and line.organization_id = v_actor.organization_id for update;
  if v_line.id is null then raise exception 'Inventory count line was not found.'; end if;
  if input_expected_updated_at is not null and v_line.updated_at is distinct from input_expected_updated_at then
    raise exception 'This count line changed on another device. Refresh before applying the stocking standard.';
  end if;
  if v_line.count_method = 'use_par' and v_line.count_status = 'counted'
     and v_line.counted_quantity = v_line.par_quantity_snapshot then
    return public.inventory_count_line_client_record(v_line.id);
  end if;
  update public.inventory_count_lines line
  set counted_quantity = line.par_quantity_snapshot,
      count_method = 'use_par',
      count_status = 'counted',
      note = nullif(trim(coalesce(input_note, '')), ''),
      counted_at = now(),
      counted_by_auth_user_id = v_actor.actor_auth_user_id,
      counted_by_name = v_actor.actor_name
  where line.id = v_line.id returning * into v_line;
  update public.inventory_count_sessions session
  set metadata = session.metadata #- array['locationCompletions', v_line.location_id::text]
  where session.id = v_session.id;
  return public.inventory_count_line_client_record(v_line.id);
end;
$$;

create or replace function public.clear_inventory_count_line(
  input_line_id uuid,
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
  v_session_id uuid;
  v_line public.inventory_count_lines%rowtype;
  v_session public.inventory_count_sessions%rowtype;
begin
  select * into v_actor from public.inventory_resolve_actor(input_actor_name);
  select line.session_id into v_session_id from public.inventory_count_lines line
  where line.id = input_line_id and line.organization_id = v_actor.organization_id;
  if v_session_id is null then raise exception 'Inventory count line was not found.'; end if;
  select session.* into v_session from public.inventory_count_sessions session
  where session.id = v_session_id and session.organization_id = v_actor.organization_id for update;
  if v_session.id is null then raise exception 'Inventory count session was not found.'; end if;
  if v_session.status not in ('draft', 'in_progress') then
    raise exception 'This stock count is read-only because it is %.', v_session.status;
  end if;
  select line.* into v_line from public.inventory_count_lines line
  where line.id = input_line_id and line.session_id = v_session.id
    and line.organization_id = v_actor.organization_id for update;
  if v_line.id is null then raise exception 'Inventory count line was not found.'; end if;
  if input_expected_updated_at is not null and v_line.updated_at is distinct from input_expected_updated_at then
    raise exception 'This count line changed on another device. Refresh before clearing it.';
  end if;
  update public.inventory_count_lines line
  set counted_quantity = null, count_method = 'uncounted', count_status = 'not_counted',
      note = null, counted_at = null, counted_by_auth_user_id = null, counted_by_name = null
  where line.id = v_line.id returning * into v_line;
  update public.inventory_count_sessions session
  set metadata = session.metadata #- array['locationCompletions', v_line.location_id::text]
  where session.id = v_session.id;
  return public.inventory_count_line_client_record(v_line.id);
end;
$$;

create or replace function public.skip_inventory_count_line(
  input_line_id uuid,
  input_note text,
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
  v_session_id uuid;
  v_line public.inventory_count_lines%rowtype;
  v_session public.inventory_count_sessions%rowtype;
  v_note text := nullif(trim(coalesce(input_note, '')), '');
begin
  if v_note is null then raise exception 'A note is required when a count line is skipped.'; end if;
  select * into v_actor from public.inventory_resolve_actor(input_actor_name);
  select line.session_id into v_session_id from public.inventory_count_lines line
  where line.id = input_line_id and line.organization_id = v_actor.organization_id;
  if v_session_id is null then raise exception 'Inventory count line was not found.'; end if;
  select session.* into v_session from public.inventory_count_sessions session
  where session.id = v_session_id and session.organization_id = v_actor.organization_id for update;
  if v_session.id is null then raise exception 'Inventory count session was not found.'; end if;
  if v_session.status not in ('draft', 'in_progress') then
    raise exception 'This stock count is read-only because it is %.', v_session.status;
  end if;
  select line.* into v_line from public.inventory_count_lines line
  where line.id = input_line_id and line.session_id = v_session.id
    and line.organization_id = v_actor.organization_id for update;
  if v_line.id is null then raise exception 'Inventory count line was not found.'; end if;
  if input_expected_updated_at is not null and v_line.updated_at is distinct from input_expected_updated_at then
    raise exception 'This count line changed on another device. Refresh before skipping it.';
  end if;
  update public.inventory_count_lines line
  set counted_quantity = null, count_method = 'uncounted', count_status = 'skipped', note = v_note,
      counted_at = now(), counted_by_auth_user_id = v_actor.actor_auth_user_id,
      counted_by_name = v_actor.actor_name
  where line.id = v_line.id returning * into v_line;
  update public.inventory_count_sessions session
  set metadata = session.metadata #- array['locationCompletions', v_line.location_id::text]
  where session.id = v_session.id;
  return public.inventory_count_line_client_record(v_line.id);
end;
$$;

create or replace function public.mark_inventory_location_use_par(
  input_session_id uuid,
  input_location_id uuid,
  input_replace_existing boolean default false,
  input_actor_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_session public.inventory_count_sessions%rowtype;
  v_updated integer := 0;
  v_preserved_manual integer := 0;
  v_already_standard integer := 0;
  v_skipped integer := 0;
begin
  select * into v_actor from public.inventory_resolve_actor(input_actor_name);
  if coalesce(input_replace_existing, false) and not public.current_user_can_manage_inventory_config() then
    raise exception 'Only a manager can replace existing counts with stocking standards.';
  end if;
  select session.* into v_session from public.inventory_count_sessions session
  where session.id = input_session_id and session.organization_id = v_actor.organization_id for update;
  if v_session.id is null then raise exception 'Inventory count session was not found.'; end if;
  if v_session.status not in ('draft', 'in_progress') then
    raise exception 'This stock count is read-only because it is %.', v_session.status;
  end if;
  if not exists (select 1 from public.inventory_count_lines where session_id = v_session.id and location_id = input_location_id) then
    raise exception 'This location is not part of the stock count.';
  end if;
  perform line.id
  from public.inventory_count_lines line
  where line.session_id = v_session.id and line.location_id = input_location_id
  order by line.id
  for update;

  select count(*) filter (where count_method = 'manual' and count_status in ('counted', 'needs_review')),
         count(*) filter (where count_method = 'use_par' and count_status = 'counted'),
         count(*) filter (where count_status = 'skipped')
  into v_preserved_manual, v_already_standard, v_skipped
  from public.inventory_count_lines
  where session_id = v_session.id and location_id = input_location_id;

  update public.inventory_count_lines line
  set counted_quantity = line.par_quantity_snapshot,
      count_method = 'use_par', count_status = 'counted',
      counted_at = now(), counted_by_auth_user_id = v_actor.actor_auth_user_id,
      counted_by_name = v_actor.actor_name,
      note = case when coalesce(input_replace_existing, false) then 'Replaced with stocking standard by manager.' else line.note end
  where line.session_id = v_session.id
    and line.location_id = input_location_id
    and (
      (
        coalesce(input_replace_existing, false)
        and line.count_status <> 'skipped'
        and (
          line.counted_quantity is distinct from line.par_quantity_snapshot
          or line.count_method <> 'use_par'
          or line.count_status <> 'counted'
          or line.note is distinct from 'Replaced with stocking standard by manager.'
        )
      )
      or (not coalesce(input_replace_existing, false) and line.count_status = 'not_counted')
    );
  get diagnostics v_updated = row_count;
  if v_updated > 0 then
    update public.inventory_count_sessions session
    set metadata = session.metadata #- array['locationCompletions', input_location_id::text]
    where session.id = v_session.id;
  end if;
  return jsonb_build_object(
    'updated', v_updated,
    'preservedManual', case when input_replace_existing then 0 else v_preserved_manual end,
    'alreadyStandard', v_already_standard,
    'skipped', v_skipped,
    'failed', 0
  );
end;
$$;

create or replace function public.complete_inventory_count_location(
  input_session_id uuid,
  input_location_id uuid,
  input_actor_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_session public.inventory_count_sessions%rowtype;
  v_uncounted integer := 0;
  v_review integer := 0;
  v_total integer := 0;
  v_path text[] := array['locationCompletions', input_location_id::text];
begin
  select * into v_actor from public.inventory_resolve_actor(input_actor_name);
  select session.* into v_session from public.inventory_count_sessions session
  where session.id = input_session_id and session.organization_id = v_actor.organization_id for update;
  if v_session.id is null then raise exception 'Inventory count session was not found.'; end if;
  if v_session.status not in ('draft', 'in_progress') then
    raise exception 'This stock count is read-only because it is %.', v_session.status;
  end if;
  if v_session.metadata->'locationCompletions' ? input_location_id::text then
    return jsonb_build_object('session', public.get_inventory_count_session_record(v_session.id), 'locationId', input_location_id, 'complete', true);
  end if;
  perform line.id
  from public.inventory_count_lines line
  where line.session_id = v_session.id and line.location_id = input_location_id
  order by line.id
  for update;
  select count(*), count(*) filter (where count_status = 'not_counted'),
    count(*) filter (where count_status = 'needs_review')
  into v_total, v_uncounted, v_review
  from public.inventory_count_lines
  where session_id = v_session.id and location_id = input_location_id;
  if v_total = 0 then raise exception 'This location is not part of the stock count.'; end if;
  if v_uncounted > 0 then raise exception '% product(s) still need a count or a documented skip.', v_uncounted; end if;
  if v_review > 0 then raise exception '% product(s) still need review.', v_review; end if;
  update public.inventory_count_sessions session
  set metadata = jsonb_set(
    coalesce(session.metadata, '{}'::jsonb), v_path,
    jsonb_build_object('completedAt', now(), 'completedByName', v_actor.actor_name,
      'completedByAuthUserId', v_actor.actor_auth_user_id), true
  )
  where session.id = v_session.id returning * into v_session;
  return jsonb_build_object('session', public.get_inventory_count_session_record(v_session.id), 'locationId', input_location_id, 'complete', true);
end;
$$;

create or replace function public.complete_inventory_count_session(
  input_session_id uuid,
  input_completion_note text default null,
  input_allow_exceptions boolean default false,
  input_actor_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_session public.inventory_count_sessions%rowtype;
  v_uncounted integer := 0;
  v_review integer := 0;
  v_locations integer := 0;
  v_completed_locations integer := 0;
  v_note text := nullif(trim(coalesce(input_completion_note, '')), '');
begin
  if not public.current_user_can_coordinate_inventory() then
    raise exception 'Manager or Event Floor Manager access is required to complete the full stock count.';
  end if;
  select * into v_actor from public.inventory_resolve_actor(input_actor_name);
  select session.* into v_session from public.inventory_count_sessions session
  where session.id = input_session_id and session.organization_id = v_actor.organization_id for update;
  if v_session.id is null then raise exception 'Inventory count session was not found.'; end if;
  if v_session.status = 'completed' then return public.get_inventory_count_session_record(v_session.id); end if;
  if v_session.status not in ('draft', 'in_progress') then
    raise exception 'Only an open stock count can be completed.';
  end if;
  perform line.id
  from public.inventory_count_lines line
  where line.session_id = v_session.id
  order by line.id
  for update;
  select count(*) filter (where count_status = 'not_counted'),
         count(*) filter (where count_status = 'needs_review'),
         count(distinct location_id)
  into v_uncounted, v_review, v_locations
  from public.inventory_count_lines where session_id = v_session.id;
  select count(*) into v_completed_locations
  from jsonb_object_keys(coalesce(v_session.metadata->'locationCompletions', '{}'::jsonb));
  if (v_uncounted > 0 or v_review > 0 or v_completed_locations < v_locations)
     and not coalesce(input_allow_exceptions, false) then
    raise exception 'Complete every location and resolve uncounted or review lines before completing the session.';
  end if;
  if (v_uncounted > 0 or v_review > 0 or v_completed_locations < v_locations) and v_note is null then
    raise exception 'A completion note is required when completing with exceptions.';
  end if;
  update public.inventory_count_sessions session
  set status = 'completed', completed_at = now(), completed_by_auth_user_id = v_actor.actor_auth_user_id,
      completed_by_name = v_actor.actor_name, completion_note = v_note,
      metadata = jsonb_set(coalesce(session.metadata, '{}'::jsonb), '{completionExceptions}',
        jsonb_build_object('allowed', coalesce(input_allow_exceptions, false), 'uncounted', v_uncounted,
          'needsReview', v_review, 'incompleteLocations', greatest(v_locations - v_completed_locations, 0)), true)
  where session.id = v_session.id returning * into v_session;
  return public.get_inventory_count_session_record(v_session.id);
end;
$$;

create or replace function public.approve_inventory_count_session(
  input_session_id uuid,
  input_approval_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_session public.inventory_count_sessions%rowtype;
begin
  if not public.current_user_can_manage_inventory_config() then raise exception 'Manager approval is required.'; end if;
  select * into v_actor from public.inventory_resolve_actor(null);
  select session.* into v_session from public.inventory_count_sessions session
  where session.id = input_session_id and session.organization_id = v_actor.organization_id for update;
  if v_session.id is null then raise exception 'Inventory count session was not found.'; end if;
  if v_session.status = 'approved' then return public.get_inventory_count_session_record(v_session.id); end if;
  if v_session.status <> 'completed' then raise exception 'Complete the stock count before approval.'; end if;
  update public.inventory_count_sessions session
  set status = 'approved', approved_at = now(), approved_by_auth_user_id = v_actor.actor_auth_user_id,
      approved_by_name = v_actor.actor_name,
      approval_note = nullif(trim(coalesce(input_approval_note, '')), '')
  where session.id = v_session.id returning * into v_session;
  return public.get_inventory_count_session_record(v_session.id);
end;
$$;

create or replace function public.reopen_inventory_count_session(
  input_session_id uuid,
  input_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_session public.inventory_count_sessions%rowtype;
  v_reason text := nullif(trim(coalesce(input_reason, '')), '');
  v_audit jsonb;
begin
  if not public.current_user_can_manage_inventory_config() then raise exception 'Manager access is required to reopen a stock count.'; end if;
  if v_reason is null then raise exception 'A reopening reason is required.'; end if;
  select * into v_actor from public.inventory_resolve_actor(null);
  select session.* into v_session from public.inventory_count_sessions session
  where session.id = input_session_id and session.organization_id = v_actor.organization_id for update;
  if v_session.id is null then raise exception 'Inventory count session was not found.'; end if;
  if v_session.status not in ('completed', 'approved') then raise exception 'Only a completed or approved stock count can be reopened.'; end if;
  v_audit := coalesce(v_session.metadata->'reopenHistory', '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
      'previousStatus', v_session.status,
      'previousCompletedAt', v_session.completed_at,
      'previousCompletedByAuthUserId', v_session.completed_by_auth_user_id,
      'previousCompletedByName', v_session.completed_by_name,
      'previousCompletionNote', v_session.completion_note,
      'previousApprovedAt', v_session.approved_at,
      'previousApprovedByAuthUserId', v_session.approved_by_auth_user_id,
      'previousApprovedByName', v_session.approved_by_name,
      'previousApprovalNote', v_session.approval_note,
      'previousCompletionExceptions', v_session.metadata->'completionExceptions',
      'reason', v_reason,
      'reopenedAt', now(),
      'reopenedByAuthUserId', v_actor.actor_auth_user_id,
      'reopenedByName', v_actor.actor_name
    )
  );
  update public.inventory_count_sessions session
  set status = 'in_progress', completed_at = null, completed_by_auth_user_id = null,
      completed_by_name = null, completion_note = null,
      approved_at = null, approved_by_auth_user_id = null,
      approved_by_name = null, approval_note = null,
      metadata = (coalesce(session.metadata, '{}'::jsonb) - 'locationCompletions' - 'completionExceptions')
        || jsonb_build_object('reopenHistory', v_audit)
  where session.id = v_session.id returning * into v_session;
  return public.get_inventory_count_session_record(v_session.id);
end;
$$;

create or replace function public.cancel_inventory_count_session(
  input_session_id uuid,
  input_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_session public.inventory_count_sessions%rowtype;
  v_reason text := nullif(trim(coalesce(input_reason, '')), '');
begin
  if not public.current_user_can_manage_inventory_config() then raise exception 'Manager access is required to cancel a stock count.'; end if;
  if v_reason is null then raise exception 'A cancellation reason is required.'; end if;
  select * into v_actor from public.inventory_resolve_actor(null);
  select session.* into v_session from public.inventory_count_sessions session
  where session.id = input_session_id and session.organization_id = v_actor.organization_id for update;
  if v_session.id is null then raise exception 'Inventory count session was not found.'; end if;
  if v_session.status = 'cancelled' then return public.get_inventory_count_session_record(v_session.id); end if;
  if v_session.status = 'approved' then raise exception 'Approved stock counts cannot be cancelled.'; end if;
  update public.inventory_count_sessions session
  set status = 'cancelled', metadata = coalesce(session.metadata, '{}'::jsonb) ||
    jsonb_build_object('cancellation', jsonb_build_object('reason', v_reason, 'cancelledAt', now(),
      'cancelledByAuthUserId', v_actor.actor_auth_user_id, 'cancelledByName', v_actor.actor_name))
  where session.id = v_session.id returning * into v_session;
  return public.get_inventory_count_session_record(v_session.id);
end;
$$;

create or replace function public.import_inventory_catalog(input_rows jsonb, input_overwrite_standards boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := public.current_user_organization_id();
  v_item jsonb;
  v_product public.inventory_products%rowtype;
  v_location public.inventory_locations%rowtype;
  v_standard public.inventory_location_products%rowtype;
  v_name text;
  v_unit text;
  v_sku text;
  v_barcode text;
  v_location_name text;
  v_location_code text;
  v_product_id uuid;
  v_location_id uuid;
  v_match_count integer := 0;
  v_par numeric;
  v_minimum numeric;
  v_order integer;
  v_row integer := 0;
  v_products_added integer := 0;
  v_products_updated integer := 0;
  v_standards_added integer := 0;
  v_standards_updated integer := 0;
  v_standards_preserved integer := 0;
begin
  if not public.current_user_can_manage_inventory_config() or v_org is null then
    raise exception 'Manager inventory import access required.';
  end if;
  if input_rows is null or jsonb_typeof(input_rows) <> 'array' or jsonb_array_length(input_rows) = 0 then
    raise exception 'Validated inventory import rows are required.';
  end if;
  for v_item in select value from jsonb_array_elements(input_rows)
  loop
    v_row := v_row + 1;
    v_name := nullif(trim(coalesce(v_item->>'name', '')), '');
    v_unit := nullif(trim(coalesce(v_item->>'unitLabel', '')), '');
    v_sku := nullif(trim(coalesce(v_item->>'sku', '')), '');
    v_barcode := nullif(trim(coalesce(v_item->>'barcode', '')), '');
    v_location_name := nullif(trim(coalesce(v_item->>'location', '')), '');
    v_location_code := nullif(trim(coalesce(v_item->>'locationCode', '')), '');
    begin
      v_product_id := nullif(trim(coalesce(v_item->>'productId', '')), '')::uuid;
      v_location_id := nullif(trim(coalesce(v_item->>'locationId', '')), '')::uuid;
    exception when invalid_text_representation then
      raise exception 'Row % contains an invalid internal product or location selection.', v_row;
    end;
    if v_name is null or v_unit is null then raise exception 'Row % requires product name and unit.', v_row; end if;
    begin
      v_par := case when nullif(trim(coalesce(v_item->>'parQuantity', '')), '') is null then null else (v_item->>'parQuantity')::numeric end;
      v_minimum := case when nullif(trim(coalesce(v_item->>'minimumQuantity', '')), '') is null then null else (v_item->>'minimumQuantity')::numeric end;
      v_order := case when nullif(trim(coalesce(v_item->>'countOrder', '')), '') is null then 0 else (v_item->>'countOrder')::integer end;
    exception when invalid_text_representation then
      raise exception 'Row % contains an invalid quantity or count order.', v_row;
    end;
    if v_par < 0 or v_minimum < 0 then raise exception 'Row % contains a negative inventory quantity.', v_row; end if;

    v_product := null;
    if v_product_id is not null then
      select product.* into v_product
      from public.inventory_products product
      where product.id = v_product_id and product.organization_id = v_org
      for update;
      if v_product.id is null then
        raise exception 'Row % references a product outside the current organization or no longer available.', v_row;
      end if;
    end if;
    if v_product.id is null and v_sku is not null then
      select count(*) into v_match_count
      from public.inventory_products product
      where product.organization_id = v_org and lower(trim(product.sku)) = lower(v_sku);
      if v_match_count > 1 then raise exception 'Row % has an ambiguous SKU match.', v_row; end if;
      if v_match_count = 1 then
        select product.* into v_product from public.inventory_products product
        where product.organization_id = v_org and lower(trim(product.sku)) = lower(v_sku)
        for update;
      end if;
    end if;
    if v_product.id is null and v_barcode is not null then
      select count(*) into v_match_count
      from public.inventory_products product
      where product.organization_id = v_org and lower(trim(product.barcode)) = lower(v_barcode);
      if v_match_count > 1 then raise exception 'Row % has an ambiguous barcode match.', v_row; end if;
      if v_match_count = 1 then
        select product.* into v_product from public.inventory_products product
        where product.organization_id = v_org and lower(trim(product.barcode)) = lower(v_barcode)
        for update;
      end if;
    end if;
    if v_product.id is null then
      select count(*) into v_match_count
      from public.inventory_products product
      where product.organization_id = v_org and lower(trim(product.name)) = lower(v_name);
      if v_match_count > 1 then
        raise exception 'Row % has multiple products named "%". Add a unique SKU or barcode, or select the existing product explicitly.', v_row, v_name;
      end if;
      if v_match_count = 1 then
        select product.* into v_product from public.inventory_products product
        where product.organization_id = v_org and lower(trim(product.name)) = lower(v_name)
        for update;
      end if;
    end if;
    if v_product.id is null then
      insert into public.inventory_products (
        organization_id, name, sku, barcode, category, unit_label, supplier_name, notes,
        created_by_auth_user_id, updated_by_auth_user_id
      ) values (
        v_org, v_name, v_sku, v_barcode, nullif(trim(coalesce(v_item->>'category', '')), ''), v_unit,
        nullif(trim(coalesce(v_item->>'supplierName', '')), ''), nullif(trim(coalesce(v_item->>'notes', '')), ''),
        auth.uid(), auth.uid()
      ) returning * into v_product;
      v_products_added := v_products_added + 1;
    else
      update public.inventory_products product
      set name = v_name, unit_label = v_unit,
          sku = coalesce(v_sku, product.sku), barcode = coalesce(v_barcode, product.barcode),
          category = coalesce(nullif(trim(coalesce(v_item->>'category', '')), ''), product.category),
          supplier_name = coalesce(nullif(trim(coalesce(v_item->>'supplierName', '')), ''), product.supplier_name),
          notes = coalesce(nullif(trim(coalesce(v_item->>'notes', '')), ''), product.notes),
          updated_by_auth_user_id = auth.uid()
      where product.id = v_product.id returning * into v_product;
      v_products_updated := v_products_updated + 1;
    end if;

    if v_location_id is not null or v_location_code is not null or v_location_name is not null then
      v_location := null;
      if v_location_id is not null then
        select location.* into v_location
        from public.inventory_locations location
        where location.id = v_location_id and location.organization_id = v_org and location.active = true;
        if v_location.id is null then
          raise exception 'Row % references a location outside the current organization, archived, or no longer available.', v_row;
        end if;
      end if;
      if v_location.id is null and v_location_code is not null then
        select count(*) into v_match_count
        from public.inventory_locations location
        where location.organization_id = v_org and location.active = true
          and lower(trim(location.code)) = lower(v_location_code);
        if v_match_count > 1 then raise exception 'Row % has an ambiguous location-code match.', v_row; end if;
        if v_match_count = 1 then
          select location.* into v_location from public.inventory_locations location
          where location.organization_id = v_org and location.active = true
            and lower(trim(location.code)) = lower(v_location_code);
        end if;
      end if;
      if v_location.id is null and v_location_name is not null then
        select count(*) into v_match_count
        from public.inventory_locations location
        where location.organization_id = v_org and location.active = true
          and lower(trim(location.name)) = lower(v_location_name);
        if v_match_count > 1 then
          raise exception 'Row % has multiple active locations named "%". Add a unique location code or select the location explicitly.', v_row, v_location_name;
        end if;
        if v_match_count = 1 then
          select location.* into v_location from public.inventory_locations location
          where location.organization_id = v_org and location.active = true
            and lower(trim(location.name)) = lower(v_location_name);
        end if;
      end if;
      if v_location.id is null then
        raise exception 'Row % references an unknown inventory location.', v_row;
      end if;
      if v_par is null then raise exception 'Row % requires a par quantity when a location is provided.', v_row; end if;
      v_standard := null;
      select * into v_standard from public.inventory_location_products
      where organization_id = v_org and location_id = v_location.id and product_id = v_product.id for update;
      if v_standard.id is null then
        insert into public.inventory_location_products (
          organization_id, location_id, product_id, par_quantity, minimum_quantity, count_order,
          created_by_auth_user_id, updated_by_auth_user_id
        ) values (v_org, v_location.id, v_product.id, v_par, v_minimum, v_order, auth.uid(), auth.uid());
        v_standards_added := v_standards_added + 1;
      elsif input_overwrite_standards then
        update public.inventory_location_products standard
        set par_quantity = v_par, minimum_quantity = v_minimum, count_order = v_order,
            active = true, updated_by_auth_user_id = auth.uid()
        where standard.id = v_standard.id;
        v_standards_updated := v_standards_updated + 1;
      else
        v_standards_preserved := v_standards_preserved + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('rows', v_row, 'productsAdded', v_products_added,
    'productsUpdated', v_products_updated, 'standardsAdded', v_standards_added,
    'standardsUpdated', v_standards_updated, 'standardsPreserved', v_standards_preserved);
end;
$$;

revoke all privileges on table public.inventory_products from public;
revoke all privileges on table public.inventory_products from anon;
revoke all privileges on table public.inventory_products from authenticated;
revoke all privileges on table public.inventory_products from service_role;
grant select (
  id, organization_id, name, short_name, sku, barcode, category, unit_label,
  default_pack_size, supplier_name, notes, active, sort_order
) on table public.inventory_products to authenticated;
grant select, insert, update, delete on table public.inventory_products to service_role;
revoke all privileges on table public.inventory_locations from public;
revoke all privileges on table public.inventory_locations from anon;
revoke all privileges on table public.inventory_locations from authenticated;
revoke all privileges on table public.inventory_locations from service_role;
grant select (
  id, organization_id, name, code, location_type, parent_location_id, zone,
  description, active, sort_order
) on table public.inventory_locations to authenticated;
grant select, insert, update, delete on table public.inventory_locations to service_role;
revoke all privileges on table public.inventory_location_products from public;
revoke all privileges on table public.inventory_location_products from anon;
revoke all privileges on table public.inventory_location_products from authenticated;
revoke all privileges on table public.inventory_location_products from service_role;
grant select (
  id, organization_id, location_id, product_id, par_quantity, minimum_quantity,
  default_restock_quantity, count_order, active, notes
) on table public.inventory_location_products to authenticated;
grant select, insert, update, delete on table public.inventory_location_products to service_role;
revoke all privileges on table public.inventory_count_sessions from public;
revoke all privileges on table public.inventory_count_sessions from anon;
revoke all privileges on table public.inventory_count_sessions from authenticated;
revoke all privileges on table public.inventory_count_sessions from service_role;
grant select (
  id, organization_id, title, count_type, status, count_date, started_at,
  completed_at, approved_at, started_by_name, completed_by_name, approved_by_name,
  completion_note, approval_note
) on table public.inventory_count_sessions to authenticated;
grant select, insert, update, delete on table public.inventory_count_sessions to service_role;
revoke all privileges on table public.inventory_count_lines from public;
revoke all privileges on table public.inventory_count_lines from anon;
revoke all privileges on table public.inventory_count_lines from authenticated;
revoke all privileges on table public.inventory_count_lines from service_role;
grant select (
  id, organization_id, session_id, location_id, product_name_snapshot,
  location_name_snapshot, unit_label_snapshot, category_snapshot,
  location_sort_order_snapshot, count_order_snapshot, product_sort_order_snapshot,
  par_quantity_snapshot, minimum_quantity_snapshot, counted_quantity, count_method,
  count_status, variance_quantity, restock_quantity, note, counted_at,
  counted_by_name, updated_at
) on table public.inventory_count_lines to authenticated;
grant select, insert, update, delete on table public.inventory_count_lines to service_role;

revoke all on function public.current_user_can_manage_inventory_config() from public, anon;
revoke all on function public.current_user_can_coordinate_inventory() from public, anon;
revoke all on function public.inventory_resolve_actor(text) from public, anon;
revoke all on function public.inventory_session_is_visible(uuid) from public, anon;
revoke all on function public.get_inventory_count_session_record(uuid) from public, anon;
revoke all on function public.inventory_count_line_client_record(uuid) from public, anon, authenticated;
grant execute on function public.current_user_can_manage_inventory_config() to authenticated;
grant execute on function public.current_user_can_coordinate_inventory() to authenticated;
grant execute on function public.inventory_resolve_actor(text) to authenticated;
grant execute on function public.inventory_session_is_visible(uuid) to authenticated;
grant execute on function public.get_inventory_count_session_record(uuid) to authenticated;

revoke all on function public.upsert_inventory_product(uuid, text, text, text, text, text, text, numeric, text, text, boolean, integer, jsonb, text[]) from public, anon;
revoke all on function public.upsert_inventory_location(uuid, text, text, text, uuid, text, text, boolean, integer, jsonb, text[]) from public, anon;
revoke all on function public.upsert_inventory_location_product(uuid, uuid, uuid, numeric, numeric, numeric, integer, boolean, text, jsonb, text[]) from public, anon;
revoke all on function public.copy_inventory_location_standards(uuid, uuid, boolean) from public, anon;
revoke all on function public.create_inventory_count_session(text, text, date, uuid[], text, text) from public, anon;
revoke all on function public.set_inventory_count_line_quantity(uuid, numeric, text, text, timestamptz) from public, anon;
revoke all on function public.mark_inventory_count_line_use_par(uuid, text, text, timestamptz) from public, anon;
revoke all on function public.clear_inventory_count_line(uuid, text, timestamptz) from public, anon;
revoke all on function public.skip_inventory_count_line(uuid, text, text, timestamptz) from public, anon;
revoke all on function public.mark_inventory_location_use_par(uuid, uuid, boolean, text) from public, anon;
revoke all on function public.complete_inventory_count_location(uuid, uuid, text) from public, anon;
revoke all on function public.complete_inventory_count_session(uuid, text, boolean, text) from public, anon;
revoke all on function public.approve_inventory_count_session(uuid, text) from public, anon;
revoke all on function public.reopen_inventory_count_session(uuid, text) from public, anon;
revoke all on function public.cancel_inventory_count_session(uuid, text) from public, anon;
revoke all on function public.import_inventory_catalog(jsonb, boolean) from public, anon;

grant execute on function public.upsert_inventory_product(uuid, text, text, text, text, text, text, numeric, text, text, boolean, integer, jsonb, text[]) to authenticated;
grant execute on function public.upsert_inventory_location(uuid, text, text, text, uuid, text, text, boolean, integer, jsonb, text[]) to authenticated;
grant execute on function public.upsert_inventory_location_product(uuid, uuid, uuid, numeric, numeric, numeric, integer, boolean, text, jsonb, text[]) to authenticated;
grant execute on function public.copy_inventory_location_standards(uuid, uuid, boolean) to authenticated;
grant execute on function public.create_inventory_count_session(text, text, date, uuid[], text, text) to authenticated;
grant execute on function public.set_inventory_count_line_quantity(uuid, numeric, text, text, timestamptz) to authenticated;
grant execute on function public.mark_inventory_count_line_use_par(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.clear_inventory_count_line(uuid, text, timestamptz) to authenticated;
grant execute on function public.skip_inventory_count_line(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.mark_inventory_location_use_par(uuid, uuid, boolean, text) to authenticated;
grant execute on function public.complete_inventory_count_location(uuid, uuid, text) to authenticated;
grant execute on function public.complete_inventory_count_session(uuid, text, boolean, text) to authenticated;
grant execute on function public.approve_inventory_count_session(uuid, text) to authenticated;
grant execute on function public.reopen_inventory_count_session(uuid, text) to authenticated;
grant execute on function public.cancel_inventory_count_session(uuid, text) to authenticated;
grant execute on function public.import_inventory_catalog(jsonb, boolean) to authenticated;

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_products'
  ) then alter publication supabase_realtime add table public.inventory_products; end if;
  if exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_locations'
  ) then alter publication supabase_realtime add table public.inventory_locations; end if;
  if exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_location_products'
  ) then alter publication supabase_realtime add table public.inventory_location_products; end if;
  if exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_count_sessions'
  ) then alter publication supabase_realtime add table public.inventory_count_sessions; end if;
  if exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_count_lines'
  ) then alter publication supabase_realtime add table public.inventory_count_lines; end if;
end
$$;

notify pgrst, 'reload schema';

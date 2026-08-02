-- Phase 9G-A: Millum-backed operational scope, six refrigerator defaults,
-- unresolved mapping records, and product-ID-derived fixed reserve targets.
-- Apply after Phase 9F. This terminal layer is repeatable and never rewrites
-- Stock Count session or line history.

alter table public.inventory_products
  add column if not exists millum_item_ref text,
  add column if not exists ownership_status text not null default 'unverified',
  add column if not exists reserve_target_override numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inventory_products_ownership_status_check') then
    alter table public.inventory_products add constraint inventory_products_ownership_status_check
      check (ownership_status in ('owned', 'excluded', 'unverified'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'inventory_products_reserve_override_check') then
    alter table public.inventory_products add constraint inventory_products_reserve_override_check
      check (
        reserve_target_override is null
        or (
          reserve_target_override >= 0
          and reserve_target_override::text not in ('NaN', 'Infinity', '-Infinity')
        )
      );
  end if;
end;
$$;
create unique index if not exists inventory_products_org_millum_ref_unique
  on public.inventory_products (organization_id, lower(trim(millum_item_ref)))
  where millum_item_ref is not null and nullif(trim(millum_item_ref), '') is not null;

create table if not exists public.inventory_product_catalogue_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  product_id uuid not null references public.inventory_products(id),
  millum_group text not null,
  group_sort_order integer not null,
  item_sort_order integer not null,
  millum_count_unit text not null,
  source_occurrence_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_auth_user_id uuid default auth.uid() references auth.users(id),
  updated_by_auth_user_id uuid default auth.uid() references auth.users(id),
  constraint inventory_product_catalogue_groups_group_required check (nullif(trim(millum_group), '') is not null),
  constraint inventory_product_catalogue_groups_unit_required check (nullif(trim(millum_count_unit), '') is not null),
  constraint inventory_product_catalogue_groups_orders_nonnegative check (group_sort_order >= 0 and item_sort_order >= 0),
  constraint inventory_product_catalogue_groups_occurrences_positive check (source_occurrence_count > 0),
  constraint inventory_product_catalogue_groups_unique unique (organization_id, product_id, millum_group)
);

create table if not exists public.inventory_product_aliases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  product_id uuid not null references public.inventory_products(id),
  alias text not null,
  alias_source text not null default 'verified_operational',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_auth_user_id uuid default auth.uid() references auth.users(id),
  updated_by_auth_user_id uuid default auth.uid() references auth.users(id),
  constraint inventory_product_aliases_alias_required check (nullif(trim(alias), '') is not null),
  constraint inventory_product_aliases_source_required check (nullif(trim(alias_source), '') is not null)
);

create unique index if not exists inventory_product_aliases_org_alias_unique
  on public.inventory_product_aliases (organization_id, lower(trim(alias)));
create index if not exists inventory_product_aliases_product_idx
  on public.inventory_product_aliases (organization_id, product_id, active);

create table if not exists public.inventory_refrigerator_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  location_id uuid not null references public.inventory_locations(id),
  template_status text not null default 'incomplete',
  verified_at timestamptz,
  verified_by_auth_user_id uuid references auth.users(id),
  verified_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_auth_user_id uuid default auth.uid() references auth.users(id),
  updated_by_auth_user_id uuid default auth.uid() references auth.users(id),
  constraint inventory_refrigerator_templates_status_check check (template_status in ('incomplete', 'verified')),
  constraint inventory_refrigerator_templates_verification_check check (
    (template_status = 'incomplete' and verified_at is null and verified_by_auth_user_id is null and verified_by_name is null)
    or (template_status = 'verified' and verified_at is not null and verified_by_auth_user_id is not null and nullif(trim(verified_by_name), '') is not null)
  ),
  constraint inventory_refrigerator_templates_location_unique unique (organization_id, location_id)
);

create table if not exists public.inventory_catalogue_unresolved_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  location_id uuid not null references public.inventory_locations(id),
  requested_name text not null,
  requested_default_quantity numeric not null,
  requested_count_order integer not null,
  candidate_millum_item_refs text[] not null default '{}',
  reason text not null,
  resolution_status text not null default 'unresolved',
  resolved_product_id uuid references public.inventory_products(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_auth_user_id uuid default auth.uid() references auth.users(id),
  updated_by_auth_user_id uuid default auth.uid() references auth.users(id),
  constraint inventory_catalogue_unresolved_name_required check (nullif(trim(requested_name), '') is not null),
  constraint inventory_catalogue_unresolved_quantity_nonnegative check (
    requested_default_quantity >= 0
    and requested_default_quantity::text not in ('NaN', 'Infinity', '-Infinity')
  ),
  constraint inventory_catalogue_unresolved_order_nonnegative check (requested_count_order >= 0),
  constraint inventory_catalogue_unresolved_reason_required check (nullif(trim(reason), '') is not null),
  constraint inventory_catalogue_unresolved_status_check check (resolution_status in ('unresolved', 'resolved', 'dismissed')),
  constraint inventory_catalogue_unresolved_resolution_check check (
    (resolution_status = 'resolved' and resolved_product_id is not null)
    or (resolution_status <> 'resolved' and resolved_product_id is null)
  )
);

create unique index if not exists inventory_catalogue_unresolved_location_name_unique
  on public.inventory_catalogue_unresolved_mappings (organization_id, location_id, lower(trim(requested_name)));

create or replace function public.inventory_phase9g_validate_product_org()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_product_org uuid;
begin
  select product.organization_id into v_product_org
  from public.inventory_products product where product.id = new.product_id;
  if v_product_org is null or v_product_org is distinct from new.organization_id then
    raise exception 'Phase 9G product relationship must remain in one organization.';
  end if;
  return new;
end;
$$;

create or replace function public.inventory_phase9g_prevent_catalogue_duplicate()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if exists (
    select 1 from public.inventory_products product
    where product.organization_id = new.organization_id
      and product.id <> new.id
      and product.ownership_status = 'owned'
      and product.millum_item_ref is not null
      and lower(trim(product.name)) = lower(trim(new.name))
  ) or exists (
    select 1
    from public.inventory_product_aliases alias
    join public.inventory_products product on product.id = alias.product_id
    where alias.organization_id = new.organization_id
      and alias.active = true
      and product.id <> new.id
      and product.ownership_status = 'owned'
      and product.millum_item_ref is not null
      and lower(trim(alias.alias)) = lower(trim(new.name))
  ) then
    raise exception 'An existing stable Millum product or verified alias already represents this product name.';
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_products_phase9g_prevent_duplicate on public.inventory_products;
create trigger inventory_products_phase9g_prevent_duplicate
before insert or update of name on public.inventory_products
for each row execute function public.inventory_phase9g_prevent_catalogue_duplicate();

create or replace function public.verify_inventory_refrigerator_template(input_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_template public.inventory_refrigerator_templates%rowtype;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  if not public.inventory_phase9g_is_refrigerator(input_location_id, v_actor.organization_id) then
    raise exception 'Active Phase 9G refrigerator not found for this organization.';
  end if;
  if not exists (
    select 1 from public.inventory_location_products standard
    where standard.organization_id = v_actor.organization_id
      and standard.location_id = input_location_id
      and standard.active = true
  ) then
    raise exception 'Add at least one refrigerator default before marking the template verified.';
  end if;

  insert into public.inventory_refrigerator_templates (
    organization_id, location_id, template_status, verified_at,
    verified_by_auth_user_id, verified_by_name,
    created_by_auth_user_id, updated_by_auth_user_id
  ) values (
    v_actor.organization_id, input_location_id, 'verified', now(),
    v_actor.actor_auth_user_id, v_actor.actor_name,
    v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
  ) on conflict (organization_id, location_id) do update
    set template_status = 'verified', verified_at = now(),
        verified_by_auth_user_id = excluded.verified_by_auth_user_id,
        verified_by_name = excluded.verified_by_name,
        updated_by_auth_user_id = excluded.updated_by_auth_user_id
  returning * into v_template;

  return jsonb_build_object(
    'id', v_template.id,
    'location_id', v_template.location_id,
    'template_status', v_template.template_status,
    'verified_at', v_template.verified_at,
    'verified_by_name', v_template.verified_by_name,
    'updated_at', v_template.updated_at
  );
end;
$$;

create or replace function public.set_inventory_product_reserve_override(
  input_product_id uuid,
  input_reserve_target_override numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_product public.inventory_products%rowtype;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  if input_reserve_target_override is not null and (
    input_reserve_target_override < 0
    or input_reserve_target_override::text in ('NaN', 'Infinity', '-Infinity')
  ) then
    raise exception 'Reserve target override must be a non-negative finite quantity.';
  end if;

  select product.* into v_product
  from public.inventory_products product
  where product.id = input_product_id
    and product.organization_id = v_actor.organization_id
    and product.ownership_status = 'owned'
  for update;
  if v_product.id is null then
    raise exception 'Owned inventory product not found for this organization.';
  end if;

  update public.inventory_products product
  set reserve_target_override = input_reserve_target_override,
      updated_by_auth_user_id = v_actor.actor_auth_user_id
  where product.id = v_product.id
  returning * into v_product;

  return jsonb_build_object(
    'product_id', v_product.id,
    'reserve_target_override', v_product.reserve_target_override,
    'updated_at', v_product.updated_at
  );
end;
$$;

create or replace view public.inventory_refrigerator_reserve_targets
with (security_invoker = true)
as
select
  product.id as product_id,
  coalesce(sum(standard.par_quantity) filter (
    where standard.active = true
      and location.active = true
      and upper(trim(location.code)) in (
        'CORNERBAR_LEFT_FRIDGE', 'CORNERBAR_MIDDLE_FRIDGE', 'CORNERBAR_RIGHT_FRIDGE',
        'WORKBAR_BAR_LEFT_FRIDGE', 'WORKBAR_BAR_RIGHT_FRIDGE', 'WORKBAR_NON_ALCO_FRIDGE'
      )
  ), 0)::numeric as refrigerator_default_quantity,
  product.reserve_target_override,
  coalesce(
    product.reserve_target_override,
    coalesce(sum(standard.par_quantity) filter (
      where standard.active = true
        and location.active = true
        and upper(trim(location.code)) in (
          'CORNERBAR_LEFT_FRIDGE', 'CORNERBAR_MIDDLE_FRIDGE', 'CORNERBAR_RIGHT_FRIDGE',
          'WORKBAR_BAR_LEFT_FRIDGE', 'WORKBAR_BAR_RIGHT_FRIDGE', 'WORKBAR_NON_ALCO_FRIDGE'
        )
    ), 0) * 3
  )::numeric as reserve_target_quantity,
  (
    coalesce(sum(standard.par_quantity) filter (
      where standard.active = true
        and location.active = true
        and upper(trim(location.code)) in (
          'CORNERBAR_LEFT_FRIDGE', 'CORNERBAR_MIDDLE_FRIDGE', 'CORNERBAR_RIGHT_FRIDGE',
          'WORKBAR_BAR_LEFT_FRIDGE', 'WORKBAR_BAR_RIGHT_FRIDGE', 'WORKBAR_NON_ALCO_FRIDGE'
        )
    ), 0)
    + coalesce(
      product.reserve_target_override,
      coalesce(sum(standard.par_quantity) filter (
        where standard.active = true
          and location.active = true
          and upper(trim(location.code)) in (
            'CORNERBAR_LEFT_FRIDGE', 'CORNERBAR_MIDDLE_FRIDGE', 'CORNERBAR_RIGHT_FRIDGE',
            'WORKBAR_BAR_LEFT_FRIDGE', 'WORKBAR_BAR_RIGHT_FRIDGE', 'WORKBAR_NON_ALCO_FRIDGE'
          )
      ), 0) * 3
    )
  )::numeric as combined_desired_quantity
from public.inventory_products product
left join public.inventory_location_products standard
  on standard.organization_id = product.organization_id
 and standard.product_id = product.id
left join public.inventory_locations location
  on location.organization_id = product.organization_id
 and location.id = standard.location_id
where product.ownership_status = 'owned'
group by product.id, product.reserve_target_override;

alter table public.inventory_product_catalogue_groups enable row level security;
alter table public.inventory_product_aliases enable row level security;
alter table public.inventory_refrigerator_templates enable row level security;
alter table public.inventory_catalogue_unresolved_mappings enable row level security;

drop policy if exists inventory_product_catalogue_groups_read on public.inventory_product_catalogue_groups;
create policy inventory_product_catalogue_groups_read
on public.inventory_product_catalogue_groups for select to authenticated
using (
  (select public.current_user_can_manage_inventory_config())
  and organization_id = (select public.current_user_organization_id())
);
drop policy if exists inventory_product_aliases_read on public.inventory_product_aliases;
create policy inventory_product_aliases_read
on public.inventory_product_aliases for select to authenticated
using (
  (select public.current_user_can_manage_inventory_config())
  and organization_id = (select public.current_user_organization_id())
);
drop policy if exists inventory_refrigerator_templates_read on public.inventory_refrigerator_templates;
create policy inventory_refrigerator_templates_read
on public.inventory_refrigerator_templates for select to authenticated
using (
  (select public.current_user_can_manage_inventory_config())
  and organization_id = (select public.current_user_organization_id())
);
drop policy if exists inventory_catalogue_unresolved_mappings_read on public.inventory_catalogue_unresolved_mappings;
create policy inventory_catalogue_unresolved_mappings_read
on public.inventory_catalogue_unresolved_mappings for select to authenticated
using (
  (select public.current_user_can_manage_inventory_config())
  and organization_id = (select public.current_user_organization_id())
);

revoke all privileges on table public.inventory_products from authenticated;
grant select (
  id, organization_id, name, short_name, sku, barcode, category, unit_label,
  default_pack_size, supplier_name, notes, active, sort_order, metadata,
  created_at, updated_at, count_mode, container_capacity_liters,
  millum_item_ref, ownership_status, reserve_target_override
) on table public.inventory_products to authenticated;

revoke all privileges on table public.inventory_product_catalogue_groups from public, anon, authenticated, service_role;
grant select (
  id, product_id, millum_group, group_sort_order, item_sort_order,
  millum_count_unit, source_occurrence_count, created_at, updated_at
) on table public.inventory_product_catalogue_groups to authenticated;
grant select, insert, update, delete on table public.inventory_product_catalogue_groups to service_role;

revoke all privileges on table public.inventory_product_aliases from public, anon, authenticated, service_role;
grant select (id, product_id, alias, alias_source, active, created_at, updated_at)
  on table public.inventory_product_aliases to authenticated;
grant select, insert, update, delete on table public.inventory_product_aliases to service_role;

revoke all privileges on table public.inventory_refrigerator_templates from public, anon, authenticated, service_role;
grant select (
  id, location_id, template_status, verified_at, verified_by_name,
  created_at, updated_at
) on table public.inventory_refrigerator_templates to authenticated;
grant select, insert, update, delete on table public.inventory_refrigerator_templates to service_role;

revoke all privileges on table public.inventory_catalogue_unresolved_mappings from public, anon, authenticated, service_role;
grant select (
  id, location_id, requested_name, requested_default_quantity,
  requested_count_order, candidate_millum_item_refs, reason,
  resolution_status, resolved_product_id, created_at, updated_at
) on table public.inventory_catalogue_unresolved_mappings to authenticated;
grant select, insert, update, delete on table public.inventory_catalogue_unresolved_mappings to service_role;

revoke all privileges on table public.inventory_refrigerator_reserve_targets from public, anon, authenticated, service_role;
grant select on table public.inventory_refrigerator_reserve_targets to authenticated, service_role;

revoke all on function public.inventory_phase9g_validate_product_org() from public, anon, authenticated;
revoke all on function public.inventory_phase9g_prevent_catalogue_duplicate() from public, anon, authenticated;

revoke all on function public.setup_mesh_youngstorget_inventory_locations() from public, anon, authenticated;
grant execute on function public.setup_mesh_youngstorget_inventory_locations() to authenticated;
revoke all on function public.verify_inventory_refrigerator_template(uuid) from public, anon, authenticated;
grant execute on function public.verify_inventory_refrigerator_template(uuid) to authenticated;
revoke all on function public.set_inventory_product_reserve_override(uuid, numeric) from public, anon, authenticated;
grant execute on function public.set_inventory_product_reserve_override(uuid, numeric) to authenticated;

drop trigger if exists inventory_product_catalogue_groups_validate_org on public.inventory_product_catalogue_groups;
create trigger inventory_product_catalogue_groups_validate_org
before insert or update on public.inventory_product_catalogue_groups
for each row execute function public.inventory_phase9g_validate_product_org();

drop trigger if exists inventory_product_aliases_validate_org on public.inventory_product_aliases;
create trigger inventory_product_aliases_validate_org
before insert or update on public.inventory_product_aliases
for each row execute function public.inventory_phase9g_validate_product_org();

create or replace function public.inventory_phase9g_validate_location_org()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_location_org uuid;
  v_product_org uuid;
  v_resolved_product_id uuid := nullif(to_jsonb(new)->>'resolved_product_id', '')::uuid;
begin
  select location.organization_id into v_location_org
  from public.inventory_locations location where location.id = new.location_id;
  if v_location_org is null or v_location_org is distinct from new.organization_id then
    raise exception 'Phase 9G location relationship must remain in one organization.';
  end if;
  if v_resolved_product_id is not null then
    select product.organization_id into v_product_org
    from public.inventory_products product where product.id = v_resolved_product_id;
    if v_product_org is null or v_product_org is distinct from new.organization_id then
      raise exception 'Resolved Phase 9G product must remain in the mapping organization.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.inventory_phase9g_validate_location_org() from public, anon, authenticated;

drop trigger if exists inventory_refrigerator_templates_validate_org on public.inventory_refrigerator_templates;
create trigger inventory_refrigerator_templates_validate_org
before insert or update on public.inventory_refrigerator_templates
for each row execute function public.inventory_phase9g_validate_location_org();

drop trigger if exists inventory_catalogue_unresolved_validate_org on public.inventory_catalogue_unresolved_mappings;
create trigger inventory_catalogue_unresolved_validate_org
before insert or update on public.inventory_catalogue_unresolved_mappings
for each row execute function public.inventory_phase9g_validate_location_org();

drop trigger if exists inventory_product_catalogue_groups_set_updated_at on public.inventory_product_catalogue_groups;
create trigger inventory_product_catalogue_groups_set_updated_at
before update on public.inventory_product_catalogue_groups
for each row execute function public.set_updated_at();
drop trigger if exists inventory_product_aliases_set_updated_at on public.inventory_product_aliases;
create trigger inventory_product_aliases_set_updated_at
before update on public.inventory_product_aliases
for each row execute function public.set_updated_at();
drop trigger if exists inventory_refrigerator_templates_set_updated_at on public.inventory_refrigerator_templates;
create trigger inventory_refrigerator_templates_set_updated_at
before update on public.inventory_refrigerator_templates
for each row execute function public.set_updated_at();
drop trigger if exists inventory_catalogue_unresolved_set_updated_at on public.inventory_catalogue_unresolved_mappings;
create trigger inventory_catalogue_unresolved_set_updated_at
before update on public.inventory_catalogue_unresolved_mappings
for each row execute function public.set_updated_at();

create or replace function public.inventory_phase9g_is_refrigerator(input_location_id uuid, input_organization_id uuid)
returns boolean
language sql
stable
set search_path = pg_catalog
as $$
  select exists (
    select 1 from public.inventory_locations location
    where location.id = input_location_id
      and location.organization_id = input_organization_id
      and location.active = true
      and upper(trim(location.code)) in (
        'CORNERBAR_LEFT_FRIDGE', 'CORNERBAR_MIDDLE_FRIDGE', 'CORNERBAR_RIGHT_FRIDGE',
        'WORKBAR_BAR_LEFT_FRIDGE', 'WORKBAR_BAR_RIGHT_FRIDGE', 'WORKBAR_NON_ALCO_FRIDGE'
      )
  );
$$;

create or replace function public.inventory_phase9g_mark_template_incomplete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_location_id uuid := coalesce(new.location_id, old.location_id);
  v_org uuid := coalesce(new.organization_id, old.organization_id);
begin
  if public.inventory_phase9g_is_refrigerator(v_location_id, v_org) then
    insert into public.inventory_refrigerator_templates (
      organization_id, location_id, template_status,
      created_by_auth_user_id, updated_by_auth_user_id
    ) values (v_org, v_location_id, 'incomplete', auth.uid(), auth.uid())
    on conflict (organization_id, location_id) do update
      set template_status = 'incomplete', verified_at = null,
          verified_by_auth_user_id = null, verified_by_name = null,
          updated_by_auth_user_id = auth.uid();
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists inventory_location_products_phase9g_template_state on public.inventory_location_products;
create trigger inventory_location_products_phase9g_template_state
after insert or update or delete on public.inventory_location_products
for each row execute function public.inventory_phase9g_mark_template_incomplete();

create or replace function public.inventory_phase9g_ensure_location(
  input_organization_id uuid,
  input_actor_auth_user_id uuid,
  input_code text,
  input_name text,
  input_location_type text,
  input_parent_location_id uuid,
  input_zone text,
  input_sort_order integer,
  input_legacy_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_location public.inventory_locations%rowtype;
  v_legacy public.inventory_locations%rowtype;
begin
  select location.* into v_location
  from public.inventory_locations location
  where location.organization_id = input_organization_id
    and lower(trim(location.code)) = lower(trim(input_code))
  order by location.created_at, location.id
  limit 1 for update;

  if input_legacy_code is not null then
    select location.* into v_legacy
    from public.inventory_locations location
    where location.organization_id = input_organization_id
      and lower(trim(location.code)) = lower(trim(input_legacy_code))
      and (v_location.id is null or location.id <> v_location.id)
    order by location.created_at, location.id
    limit 1 for update;
  end if;

  if v_location.id is null and v_legacy.id is not null then
    v_location := v_legacy;
  elsif v_location.id is not null and v_legacy.id is not null then
    update public.inventory_locations location
      set active = false, updated_by_auth_user_id = input_actor_auth_user_id
    where location.id = v_legacy.id;
  end if;

  if v_location.id is null then
    insert into public.inventory_locations (
      organization_id, name, code, location_type, parent_location_id, zone,
      active, sort_order, created_by_auth_user_id, updated_by_auth_user_id
    ) values (
      input_organization_id, input_name, input_code, input_location_type,
      input_parent_location_id, input_zone, true, input_sort_order,
      input_actor_auth_user_id, input_actor_auth_user_id
    ) returning * into v_location;
  else
    update public.inventory_locations location
      set name = input_name, code = input_code, location_type = input_location_type,
          parent_location_id = input_parent_location_id, zone = input_zone,
          active = true, sort_order = input_sort_order,
          updated_by_auth_user_id = input_actor_auth_user_id
    where location.id = v_location.id
    returning * into v_location;
  end if;

  return v_location.id;
end;
$$;

create or replace function public.setup_mesh_youngstorget_inventory_locations()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_workbar_id uuid;
  v_cornerbar_id uuid;
  v_product public.inventory_products%rowtype;
  v_location_id uuid;
  v_item record;
  v_existing_alias public.inventory_product_aliases%rowtype;
  v_catalogue jsonb := $catalogue$
  [
    {"ref":"6751127","name":"DIPLOMATICO MANTUANO (0.7 ltr)","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":1,"unit":"fl","occurrences":1,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"585901","name":"GALLIANO VANILLA, 70 CL (0.7 ltr)","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":2,"unit":"fl","occurrences":2,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"2295772","name":"HAVANA CLUB 3 ANOS 37.5% 70CL (0.7 ltr)","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":4,"unit":"fl","occurrences":2,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"564757","name":"HAVANA CLUB 7 ANOS 40% 70CL (0.7 ltr)","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":6,"unit":"fl","occurrences":2,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"5834718","name":"KAHLUA 70CL (0.7 ltr)","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":8,"unit":"fl","occurrences":1,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"8480014","name":"Nuet Moments Toddy 50cl ENKELTFLASKER","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":9,"unit":"fl","occurrences":1,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"1917681","name":"CAMPARI BITTER 70CL (0.7 ltr)","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":10,"unit":"fl","occurrences":1,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"8480017","name":"Nuet Spritz 20L KeyKeg","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":11,"unit":"fat","occurrences":1,"category":"Spirits","unitLabel":"unit"},
    {"ref":"9081401","name":"Veritas White Blended Rum","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":12,"unit":"fl","occurrences":1,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"4345955","name":"OHD MARKA BITTER 35% 50CL (0.5 ltr)","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":13,"unit":"fl","occurrences":1,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"5128517","name":"TUBI 60. (0.7 ltr)","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":14,"unit":"fl","occurrences":1,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"410829","name":"ABSOLUT VODKA 40% 70CL (0.7 ltr)","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":15,"unit":"fl","occurrences":2,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"9073145","name":"Fernet Branca 50cl","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":17,"unit":"fl","occurrences":1,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"1287473","name":"JAGERMEISTER, 100 CL (1.0 ltr)","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":18,"unit":"fl","occurrences":1,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"4552915","name":"ST. GERMAIN, 50 CL (0.5 ltr)","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":19,"unit":"fl","occurrences":1,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"4616173","name":"OHD VIDDA TØRR GIN 43% 70CL (0.7 ltr)","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":20,"unit":"fl","occurrences":1,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"3957701","name":"Michters Us*1 Bourbon Whiskey","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":21,"unit":"fl","occurrences":1,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"3366702","name":"Giffard Blue Curacao Liqueur 50cl","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":22,"unit":"fl","occurrences":1,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"8480010","name":"Nuet Dry Aquavit","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":23,"unit":"fl","occurrences":1,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"1216399","name":"JAMESON 40% 1L (1.0 ltr)","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":24,"unit":"fl","occurrences":1,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"4911236","name":"MARTINI RISERVA RUBINO 18% (0.75 ltr)","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":25,"unit":"fl","occurrences":1,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"1364918","name":"NOILLY PRAT 18 %, 100 CL. (1.0 ltr)","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":26,"unit":"fl","occurrences":1,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"5201827","name":"FIREBALL 70CL (0.7 ltr)","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":27,"unit":"fl","occurrences":1,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"4033936","name":"Tanqueray London Dry Gin","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":28,"unit":"stk","occurrences":1,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"4014977","name":"Glenmorangie Original","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":29,"unit":"stk","occurrences":1,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"4010017","name":"Cuvee Anna VS","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":30,"unit":"stk","occurrences":1,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"4022359","name":"Mezcal Koch Espadin","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":31,"unit":"stk","occurrences":1,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"2573491","name":"BUFFALO TRACE, 70 CL (0.7 ltr)","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":32,"unit":"fl","occurrences":2,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"4014146","name":"Galliano Espresso 50Cl","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":34,"unit":"stk","occurrences":1,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"584888","name":"LIQUEUR COINTREAU, 70 CL (0.7 ltr)","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":35,"unit":"fl","occurrences":2,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"4530804","name":"PÈRE KERMANN'S ABSINTHE (0.7 ltr)","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":37,"unit":"fl","occurrences":2,"category":"Spirits","unitLabel":"bottle"},
    {"ref":"4054613","name":"Ginger Ninja Hot Chili 20L Keykeg","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":39,"unit":"stk","occurrences":1,"category":"Beer","unitLabel":"unit"},
    {"ref":"4398384","name":"BAILEYS ORIGINAL 70CL (0.7 ltr)","group":"HARD ALCOHOL","groupOrder":1,"itemOrder":40,"unit":"fl","occurrences":1,"category":"Spirits","unitLabel":"bottle"},

    {"ref":"131125","name":"Bønner - Start Up Blend","group":"COFFEE","groupOrder":4,"itemOrder":1,"unit":"pose","occurrences":1,"category":"Coffee","unitLabel":"bag"},
    {"ref":"131124","name":"Filter-malt Start Up Blend","group":"COFFEE","groupOrder":4,"itemOrder":2,"unit":"pose","occurrences":1,"category":"Coffee","unitLabel":"bag"},
    {"ref":"8577032","name":"Magnat Kvadraturen Espresso","group":"COFFEE","groupOrder":4,"itemOrder":3,"unit":"pose","occurrences":1,"category":"Coffee","unitLabel":"bag"},

    {"ref":"3195823","name":"BARMIX NØTTER 200G ELDORADO (0.2 kg)","group":"SNACKS","groupOrder":5,"itemOrder":1,"unit":"pos","occurrences":1,"category":"Snacks","unitLabel":"item"},
    {"ref":"3196318","name":"PEANØTTER 275G ELDORADO (0.275 kg)","group":"SNACKS","groupOrder":5,"itemOrder":2,"unit":"pos","occurrences":1,"category":"Snacks","unitLabel":"item"},
    {"ref":"6198758","name":"FROSTACHIPS GRILLA PAPRIKA 40G (0.04 kg)","group":"SNACKS","groupOrder":5,"itemOrder":3,"unit":"pos","occurrences":1,"category":"Snacks","unitLabel":"item"},
    {"ref":"6198360","name":"FROSTACHIPS HAVSNØ FLAKSALT 40G (0.04 kg)","group":"SNACKS","groupOrder":5,"itemOrder":4,"unit":"pos","occurrences":1,"category":"Snacks","unitLabel":"item"},
    {"ref":"5876099","name":"BE-KIND BAR CARAMEL ALMOND&SEASALT 40G (0.04 kg)","group":"SNACKS","groupOrder":5,"itemOrder":5,"unit":"pk","occurrences":1,"category":"Snacks","unitLabel":"item"},
    {"ref":"5887468","name":"BE-KIND BAR PEANUTBUTTER DARK CHOC 40G (0.04 kg)","group":"SNACKS","groupOrder":5,"itemOrder":6,"unit":"pk","occurrences":1,"category":"Snacks","unitLabel":"item"},
    {"ref":"6193338","name":"SPESIAL 190G DEN LILLE NØTTEFABRIKKEN (0.19 kg)","group":"SNACKS","groupOrder":5,"itemOrder":7,"unit":"pos","occurrences":1,"category":"Snacks","unitLabel":"item"},
    {"ref":"6566640","name":"SPESIAL NØTTER 50G DLN (0.05 kg)","group":"SNACKS","groupOrder":5,"itemOrder":8,"unit":"pos","occurrences":1,"category":"Snacks","unitLabel":"item"},
    {"ref":"6566665","name":"NØTTI FRUTTI 50G DLN (0.05 kg)","group":"SNACKS","groupOrder":5,"itemOrder":9,"unit":"pos","occurrences":1,"category":"Snacks","unitLabel":"item"},
    {"ref":"5350731","name":"FJELLSNACKS TØRKET REINKJØTT POSE A 25G (0.025 kg)","group":"SNACKS","groupOrder":5,"itemOrder":10,"unit":"pk","occurrences":1,"category":"Snacks","unitLabel":"item"},

    {"ref":"4014701","name":"Ginger Ninja - Hot Chili Ginger Beer 12*33Cl","group":"SODAS","groupOrder":8,"itemOrder":1,"unit":"stk","occurrences":1,"category":"Sodas","unitLabel":"unit"},
    {"ref":"6681001","name":"COCOMAX KOKOSVANN 1L (1.0 ltr)","group":"SODAS","groupOrder":8,"itemOrder":2,"unit":"fl","occurrences":1,"category":"Sodas","unitLabel":"unit"},
    {"ref":"1831718","name":"COCIO CLASSIC SJOKOMELK 400ML (0.4 ltr)","group":"SODAS","groupOrder":8,"itemOrder":3,"unit":"fl","occurrences":1,"category":"Sodas","unitLabel":"unit","short":"Cocio"},
    {"ref":"5744222","name":"AASS EPLEMOST 0,33L FL (0.33 ltr)","group":"SODAS","groupOrder":8,"itemOrder":4,"unit":"fl","occurrences":1,"category":"Sodas","unitLabel":"unit"},
    {"ref":"5907001","name":"SAN PELLEGRINO ARANCIATA ROSSA 0,33L (0.33 ltr)","group":"SODAS","groupOrder":8,"itemOrder":5,"unit":"bx","occurrences":1,"category":"Sodas","unitLabel":"unit","short":"Aranciata Rossa"},
    {"ref":"5906961","name":"SAN PELLEGRINO LIMONATA 0,33L (0.33 ltr)","group":"SODAS","groupOrder":8,"itemOrder":6,"unit":"bx","occurrences":1,"category":"Sodas","unitLabel":"unit","short":"Limonata"},
    {"ref":"5906748","name":"SAN PELLEGRINO ARANCIATA 0,33L BX (0.33 ltr)","group":"SODAS","groupOrder":8,"itemOrder":7,"unit":"bx","occurrences":1,"category":"Sodas","unitLabel":"unit","short":"Aranciata"},
    {"ref":"5059183","name":"SURF KOMBUCHA TROPISK INGEFÆR (0.33 ltr)","group":"SODAS","groupOrder":8,"itemOrder":8,"unit":"fl","occurrences":1,"category":"Sodas","unitLabel":"unit","short":"Tropisk Ingefær Kombucha"},
    {"ref":"5285960","name":"SURF KOMBUCHA LIME 0,33L FL (0.33 ltr)","group":"SODAS","groupOrder":8,"itemOrder":9,"unit":"fl","occurrences":1,"category":"Sodas","unitLabel":"unit","short":"Lime Kombucha"},
    {"ref":"5010707","name":"TONIC WATER PREMIUM 0,5L FL FEVER-TREE (0.5 ltr)","group":"SODAS","groupOrder":8,"itemOrder":10,"unit":"fl","occurrences":1,"category":"Sodas","unitLabel":"unit","short":"Fever-Tree Tonic"},
    {"ref":"5010715","name":"GINGER BEER MIXER 0,5L FL FEVER-TREE (0.5 ltr)","group":"SODAS","groupOrder":8,"itemOrder":11,"unit":"fl","occurrences":1,"category":"Sodas","unitLabel":"unit","short":"Fever-Tree Ginger Beer"},
    {"ref":"814467","name":"PEPSI MAX 0,3L FL PROFIL (0.3 ltr)","group":"SODAS","groupOrder":8,"itemOrder":12,"unit":"fl","occurrences":1,"category":"Sodas","unitLabel":"unit","short":"Pepsi Max"},
    {"ref":"4013279","name":"Fever Tree Pink Grapefruit 24*20Cl","group":"SODAS","groupOrder":8,"itemOrder":13,"unit":"stk","occurrences":1,"category":"Sodas","unitLabel":"unit","short":"Pink Grapefruit Soda"},
    {"ref":"6017933","name":"SPARKLING TEA BLÅ ALKOHOLFRI MUSSERENDE (0.75 ltr)","group":"SODAS","groupOrder":8,"itemOrder":14,"unit":"fl","occurrences":1,"category":"Sodas","unitLabel":"unit"},
    {"ref":"6752422","name":"APPELSINJUICE 250ML JUICERIET (0.25 ltr)","group":"SODAS","groupOrder":8,"itemOrder":15,"unit":"fl","occurrences":1,"category":"Sodas","unitLabel":"unit"},
    {"ref":"6752463","name":"RØDBETJUICE 250ML JUICERIET (0.25 ltr)","group":"SODAS","groupOrder":8,"itemOrder":16,"unit":"fl","occurrences":1,"category":"Sodas","unitLabel":"unit"},
    {"ref":"6757157","name":"ISKAFFE LATTE 250ML OSLO COLD BREW (0.25 ltr)","group":"SODAS","groupOrder":8,"itemOrder":17,"unit":"fl","occurrences":1,"category":"Sodas","unitLabel":"unit","short":"Iskaffe"},
    {"ref":"5804190","name":"FRUKTSMEKK RABARBARA&HYLLEBLOMST 0,33L (0.33 ltr)","group":"SODAS","groupOrder":8,"itemOrder":18,"unit":"bx","occurrences":1,"category":"Sodas","unitLabel":"unit","short":"Rabarbra & Hylleblomst"},
    {"ref":"6388581","name":"FRUKTSMEKK EPLE 0,33L BX SAFTERIET (0.33 ltr)","group":"SODAS","groupOrder":8,"itemOrder":19,"unit":"bx","occurrences":1,"category":"Sodas","unitLabel":"unit"},
    {"ref":"6503346","name":"FRUKTSMEKK HYLLEBLOMST&SITRON 0,33L BX (0.33 ltr)","group":"SODAS","groupOrder":8,"itemOrder":20,"unit":"bx","occurrences":1,"category":"Sodas","unitLabel":"unit","short":"Hylleblomst & Sitron"},
    {"ref":"6631634","name":"SKOG 03 0,33L FL VILLBRYGG (0.33 ltr)","group":"SODAS","groupOrder":8,"itemOrder":21,"unit":"fl","occurrences":1,"category":"Sodas","unitLabel":"unit"},
    {"ref":"4013209","name":"Fentimans Soda Water 0% 24*20Cl","group":"SODAS","groupOrder":8,"itemOrder":22,"unit":"stk","occurrences":1,"category":"Sodas","unitLabel":"unit","short":"Soda Water"},
    {"ref":"4030686","name":"Villbrygg Skog 03 75Cl","group":"SODAS","groupOrder":8,"itemOrder":23,"unit":"stk","occurrences":1,"category":"Sodas","unitLabel":"unit"},
    {"ref":"5104641","name":"FARRIS LIME 0,375L FL PROFIL (0.375 ltr)","group":"SODAS","groupOrder":8,"itemOrder":24,"unit":"fl","occurrences":1,"category":"Sodas","unitLabel":"unit"},
    {"ref":"5104666","name":"FARRIS NATURELL 0,375L FL PROFIL (0.375 ltr)","group":"SODAS","groupOrder":8,"itemOrder":25,"unit":"fl","occurrences":1,"category":"Sodas","unitLabel":"unit"},

    {"ref":"4004935","name":"Ca'N Verdura Negre","group":"WINE","groupOrder":9,"itemOrder":1,"unit":"stk","occurrences":1,"category":"Wine","unitLabel":"bottle"},
    {"ref":"4057913","name":"Ca'Di Rajo Pinot Grigio","group":"WINE","groupOrder":9,"itemOrder":2,"unit":"stk","occurrences":1,"category":"Wine","unitLabel":"bottle","short":"CA' DI RAJO Pinot Grigio"},
    {"ref":"4000232","name":"Abbazia Prosecco Extra Dry","group":"WINE","groupOrder":9,"itemOrder":3,"unit":"stk","occurrences":1,"category":"Wine","unitLabel":"bottle"},
    {"ref":"9082082","name":"Lanzando Pet-Nat White Wine","group":"WINE","groupOrder":9,"itemOrder":4,"unit":"fl","occurrences":1,"category":"Wine","unitLabel":"bottle"},
    {"ref":"9082081","name":"20.000 Leguas","group":"WINE","groupOrder":9,"itemOrder":5,"unit":"fl","occurrences":1,"category":"Wine","unitLabel":"bottle"},
    {"ref":"9078232","name":"Castellroig Reserva Brut Nature","group":"WINE","groupOrder":9,"itemOrder":6,"unit":"fl","occurrences":1,"category":"Wine","unitLabel":"bottle","short":"Castellroig"},
    {"ref":"2295798","name":"PLANETA CHARDONNAY. (0.75 ltr)","group":"WINE","groupOrder":9,"itemOrder":7,"unit":"fl","occurrences":1,"category":"Wine","unitLabel":"bottle"},
    {"ref":"9031232","name":"Casamatta Rosso","group":"WINE","groupOrder":9,"itemOrder":8,"unit":"fl","occurrences":1,"category":"Wine","unitLabel":"bottle"},
    {"ref":"9082515","name":"Nugues Beaujolais Lancie","group":"WINE","groupOrder":9,"itemOrder":9,"unit":"fl","occurrences":1,"category":"Wine","unitLabel":"bottle"},
    {"ref":"9020587","name":"Casamatta Bianco","group":"WINE","groupOrder":9,"itemOrder":10,"unit":"fl","occurrences":1,"category":"Wine","unitLabel":"bottle"},
    {"ref":"4026939","name":"Maschio Prosecco Ca'Bertaldo","group":"WINE","groupOrder":9,"itemOrder":11,"unit":"stk","occurrences":1,"category":"Wine","unitLabel":"bottle","short":"Ca'Bertaldo"},

    {"ref":"5746938","name":"ATTÅT SIDER EPLE/JORDBÆR/RABARBRA 0,33L (0.33 ltr)","group":"BEER","groupOrder":11,"itemOrder":1,"unit":"bx","occurrences":1,"category":"Beer","unitLabel":"unit","short":"Attåt"},
    {"ref":"5932900","name":"AASS UTEN 0,33L FL (0.33 ltr)","group":"BEER","groupOrder":11,"itemOrder":2,"unit":"fl","occurrences":1,"category":"Beer","unitLabel":"unit","short":"Uten"},
    {"ref":"9082254","name":"Noam Bavaria 24*34Cl","group":"BEER","groupOrder":11,"itemOrder":3,"unit":"crt","occurrences":1,"category":"Beer","unitLabel":"unit","short":"Noam"},
    {"ref":"4019089","name":"AASS PILS 30L FAT (30.0 ltr)","group":"BEER","groupOrder":11,"itemOrder":4,"unit":"fat","occurrences":1,"category":"Beer","unitLabel":"unit"},
    {"ref":"5932918","name":"AASS PILSNER 0,33L FL (0.33 ltr)","group":"BEER","groupOrder":11,"itemOrder":5,"unit":"fl","occurrences":1,"category":"Beer","unitLabel":"unit","short":"Aass Pils bottle"},
    {"ref":"6152979","name":"AASS LITE VIENNA LAGER 20L STÅLFAT (20.0 ltr)","group":"BEER","groupOrder":11,"itemOrder":6,"unit":"fat","occurrences":1,"category":"Beer","unitLabel":"unit"},
    {"ref":"6152995","name":"AASS IPA MANGO 20L STÅLFAT (20.0 ltr)","group":"BEER","groupOrder":11,"itemOrder":7,"unit":"fat","occurrences":1,"category":"Beer","unitLabel":"unit"},
    {"ref":"6274237","name":"FRIPA 0,33L BX KLOKK&CO (0.33 ltr)","group":"BEER","groupOrder":11,"itemOrder":8,"unit":"bx","occurrences":1,"category":"Beer","unitLabel":"unit","short":"Fripa"},
    {"ref":"707000631","name":"Norwegian Blonde 24*33cl","group":"BEER","groupOrder":11,"itemOrder":9,"unit":"crt","occurrences":1,"category":"Beer","unitLabel":"unit","short":"Norwegian Blonde"},
    {"ref":"4966818","name":"OSLOVE PASSION BLONDE 0,33L FL OSLO (0.33 ltr)","group":"BEER","groupOrder":11,"itemOrder":10,"unit":"fl","occurrences":1,"category":"Beer","unitLabel":"unit","short":"Oslove"},
    {"ref":"6181002","name":"7FJELL GINGER NINJA NORDIC BERRIES 0,33L (0.33 ltr)","group":"BEER","groupOrder":11,"itemOrder":11,"unit":"fl","occurrences":1,"category":"Beer","unitLabel":"unit","short":"Ginger Ninja Nordic Berries"},
    {"ref":"4054613","name":"Ginger Ninja Hot Chili 20L Keykeg","group":"BEER","groupOrder":11,"itemOrder":12,"unit":"stk","occurrences":1,"category":"Beer","unitLabel":"unit"},

    {"ref":"2446276","name":"FINEST CALL GRENADINE SIRUP 1L (1.0 ltr)","group":"Cocktail ingredients","groupOrder":12,"itemOrder":1,"unit":"fl","occurrences":1,"category":"Cocktail ingredients","unitLabel":"unit"},
    {"ref":"4043495","name":"Monin Passionfruit Syrup 70cl","group":"Cocktail ingredients","groupOrder":12,"itemOrder":2,"unit":"stk","occurrences":1,"category":"Cocktail ingredients","unitLabel":"unit"},
    {"ref":"4043535","name":"Monin Violet Syrup","group":"Cocktail ingredients","groupOrder":12,"itemOrder":3,"unit":"stk","occurrences":1,"category":"Cocktail ingredients","unitLabel":"unit"},
    {"ref":"4744330","name":"ANANASJUICE 1L CEVITA (1.0 ltr)","group":"Cocktail ingredients","groupOrder":12,"itemOrder":4,"unit":"esk","occurrences":1,"category":"Cocktail ingredients","unitLabel":"unit"},
    {"ref":"3221686","name":"APPELSINJUICE 1,5L ELDORADO (1.5 ltr)","group":"Cocktail ingredients","groupOrder":12,"itemOrder":5,"unit":"krt","occurrences":1,"category":"Cocktail ingredients","unitLabel":"unit"},
    {"ref":"4043579","name":"Monin Agave Syrup","group":"Cocktail ingredients","groupOrder":12,"itemOrder":6,"unit":"stk","occurrences":1,"category":"Cocktail ingredients","unitLabel":"unit"}
  ]
  $catalogue$::jsonb;
begin
  select * into v_actor from public.inventory_resolve_actor(null);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('phase9g-operational:' || v_actor.organization_id::text, 0));

  v_workbar_id := public.inventory_phase9g_ensure_location(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'WORKBAR', 'Workbar',
    'bar', null, 'workbar', 10, null
  );
  v_cornerbar_id := public.inventory_phase9g_ensure_location(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'CORNERBAR', 'Cornerbar',
    'bar', null, 'cornerbar', 20, null
  );

  perform public.inventory_phase9g_ensure_location(v_actor.organization_id, v_actor.actor_auth_user_id, 'CORNERBAR_LEFT_FRIDGE', 'Cornerbar Left Fridge', 'fridge', v_cornerbar_id, 'cornerbar', 21, 'CORNERBAR_FRIDGE_1');
  perform public.inventory_phase9g_ensure_location(v_actor.organization_id, v_actor.actor_auth_user_id, 'CORNERBAR_MIDDLE_FRIDGE', 'Cornerbar Middle Fridge', 'fridge', v_cornerbar_id, 'cornerbar', 22, 'CORNERBAR_FRIDGE_2');
  perform public.inventory_phase9g_ensure_location(v_actor.organization_id, v_actor.actor_auth_user_id, 'CORNERBAR_RIGHT_FRIDGE', 'Cornerbar Right Fridge', 'fridge', v_cornerbar_id, 'cornerbar', 23, 'CORNERBAR_FRIDGE_3');
  perform public.inventory_phase9g_ensure_location(v_actor.organization_id, v_actor.actor_auth_user_id, 'WORKBAR_BAR_LEFT_FRIDGE', 'Workbar Bar Left Fridge', 'fridge', v_workbar_id, 'workbar', 11, 'WORKBAR_FRIDGE_1');
  perform public.inventory_phase9g_ensure_location(v_actor.organization_id, v_actor.actor_auth_user_id, 'WORKBAR_BAR_RIGHT_FRIDGE', 'Workbar Bar Right Fridge', 'fridge', v_workbar_id, 'workbar', 12, 'WORKBAR_FRIDGE_2');
  perform public.inventory_phase9g_ensure_location(v_actor.organization_id, v_actor.actor_auth_user_id, 'WORKBAR_NON_ALCO_FRIDGE', 'Workbar Non-Alco Fridge', 'fridge', v_workbar_id, 'workbar', 13, 'WORKBAR_FRIDGE_3');

  update public.inventory_locations location
  set active = false, updated_by_auth_user_id = v_actor.actor_auth_user_id
  where location.organization_id = v_actor.organization_id
    and location.location_type = 'fridge'
    and upper(trim(coalesce(location.code, ''))) not in (
      'CORNERBAR_LEFT_FRIDGE', 'CORNERBAR_MIDDLE_FRIDGE', 'CORNERBAR_RIGHT_FRIDGE',
      'WORKBAR_BAR_LEFT_FRIDGE', 'WORKBAR_BAR_RIGHT_FRIDGE', 'WORKBAR_NON_ALCO_FRIDGE'
    );

  insert into public.inventory_refrigerator_templates (
    organization_id, location_id, template_status,
    created_by_auth_user_id, updated_by_auth_user_id
  )
  select location.organization_id, location.id, 'incomplete',
         v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
  from public.inventory_locations location
  where location.organization_id = v_actor.organization_id
    and location.active = true
    and public.inventory_phase9g_is_refrigerator(location.id, v_actor.organization_id)
  on conflict (organization_id, location_id) do nothing;

  for v_item in
    select * from jsonb_to_recordset(v_catalogue) as item(
      ref text, name text, "group" text, "groupOrder" integer,
      "itemOrder" integer, unit text, occurrences integer,
      category text, "unitLabel" text, short text
    )
  loop
    v_product := null;
    select product.* into v_product
    from public.inventory_products product
    where product.organization_id = v_actor.organization_id
      and lower(trim(product.millum_item_ref)) = lower(trim(v_item.ref))
    order by product.created_at, product.id
    limit 1 for update;

    if v_product.id is null then
      select product.* into v_product
      from public.inventory_products product
      where product.organization_id = v_actor.organization_id
        and lower(trim(product.name)) = lower(trim(v_item.name))
      order by product.created_at, product.id
      limit 1 for update;
      if v_product.id is not null and exists (
        select 1 from public.inventory_products duplicate
        where duplicate.organization_id = v_actor.organization_id
          and lower(trim(duplicate.name)) = lower(trim(v_item.name))
          and duplicate.id <> v_product.id
      ) then
        raise exception 'Multiple stable products match Millum item % (%); resolve duplicates before setup.', v_item.ref, v_item.name;
      end if;
    end if;

    if v_product.id is null then
      insert into public.inventory_products (
        organization_id, name, short_name, sku, category, unit_label,
        active, sort_order, millum_item_ref, ownership_status,
        created_by_auth_user_id, updated_by_auth_user_id
      ) values (
        v_actor.organization_id, v_item.name, nullif(trim(coalesce(v_item.short, '')), ''),
        v_item.ref, v_item.category, v_item."unitLabel", true,
        v_item."groupOrder" * 1000 + v_item."itemOrder", v_item.ref, 'owned',
        v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
      ) returning * into v_product;
    else
      update public.inventory_products product
      set name = v_item.name,
          short_name = coalesce(product.short_name, nullif(trim(coalesce(v_item.short, '')), '')),
          sku = coalesce(product.sku, v_item.ref),
          category = v_item.category,
          unit_label = coalesce(nullif(trim(product.unit_label), ''), v_item."unitLabel"),
          active = true,
          sort_order = least(product.sort_order, v_item."groupOrder" * 1000 + v_item."itemOrder"),
          millum_item_ref = v_item.ref,
          ownership_status = 'owned',
          updated_by_auth_user_id = v_actor.actor_auth_user_id
      where product.id = v_product.id
      returning * into v_product;
    end if;

    insert into public.inventory_product_catalogue_groups (
      organization_id, product_id, millum_group, group_sort_order,
      item_sort_order, millum_count_unit, source_occurrence_count,
      created_by_auth_user_id, updated_by_auth_user_id
    ) values (
      v_actor.organization_id, v_product.id, v_item."group", v_item."groupOrder",
      v_item."itemOrder", v_item.unit, v_item.occurrences,
      v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
    ) on conflict (organization_id, product_id, millum_group) do update
      set group_sort_order = excluded.group_sort_order,
          item_sort_order = excluded.item_sort_order,
          millum_count_unit = excluded.millum_count_unit,
          source_occurrence_count = excluded.source_occurrence_count,
          updated_by_auth_user_id = excluded.updated_by_auth_user_id;
  end loop;

  for v_item in
    select * from jsonb_to_recordset($aliases$
    [
      {"ref":"1831718","alias":"Cocio"},
      {"ref":"5907001","alias":"Aranciata Rossa"},
      {"ref":"5906961","alias":"Limonata"},
      {"ref":"5906748","alias":"Aranciata"},
      {"ref":"5059183","alias":"Tropisk Ingefær Kombucha"},
      {"ref":"5285960","alias":"Lime Kombucha"},
      {"ref":"5010707","alias":"Fever-Tree Tonic"},
      {"ref":"5010715","alias":"Fever-Tree Ginger Beer"},
      {"ref":"814467","alias":"Pepsi Max"},
      {"ref":"4013279","alias":"Pink Grapefruit Soda"},
      {"ref":"6757157","alias":"Iskaffe"},
      {"ref":"5804190","alias":"Rabarbra & Hylleblomst"},
      {"ref":"6503346","alias":"Hylleblomst & Sitron"},
      {"ref":"4013209","alias":"Soda Water"},
      {"ref":"4057913","alias":"CA' DI RAJO Pinot Grigio"},
      {"ref":"9078232","alias":"Castellroig"},
      {"ref":"4026939","alias":"Ca'Bertaldo"},
      {"ref":"5746938","alias":"Attåt"},
      {"ref":"5932900","alias":"Uten"},
      {"ref":"9082254","alias":"Noam"},
      {"ref":"5932918","alias":"Aass Pils bottle"},
      {"ref":"6274237","alias":"Fripa"},
      {"ref":"707000631","alias":"Norwegian Blonde"},
      {"ref":"4966818","alias":"Oslove"},
      {"ref":"6181002","alias":"Ginger Ninja Nordic Berries"}
    ]
    $aliases$::jsonb) as item(ref text, alias text)
  loop
    select product.* into v_product
    from public.inventory_products product
    where product.organization_id = v_actor.organization_id
      and product.millum_item_ref = v_item.ref;

    select alias.* into v_existing_alias
    from public.inventory_product_aliases alias
    where alias.organization_id = v_actor.organization_id
      and lower(trim(alias.alias)) = lower(trim(v_item.alias))
    limit 1 for update;

    if v_existing_alias.id is not null and v_existing_alias.product_id <> v_product.id then
      raise exception 'Verified alias % is already attached to another stable product.', v_item.alias;
    elsif v_existing_alias.id is null then
      insert into public.inventory_product_aliases (
        organization_id, product_id, alias, alias_source, active,
        created_by_auth_user_id, updated_by_auth_user_id
      ) values (
        v_actor.organization_id, v_product.id, v_item.alias,
        'phase9g_confirmed_default', true,
        v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
      );
    else
      update public.inventory_product_aliases alias
      set active = true, updated_by_auth_user_id = v_actor.actor_auth_user_id
      where alias.id = v_existing_alias.id;
    end if;
  end loop;

  for v_item in
    select * from jsonb_to_recordset($defaults$
    [
      {"location":"CORNERBAR_RIGHT_FRIDGE","ref":"9082254","quantity":20,"order":3},
      {"location":"CORNERBAR_RIGHT_FRIDGE","ref":"5746938","quantity":20,"order":5},
      {"location":"CORNERBAR_RIGHT_FRIDGE","ref":"5932900","quantity":10,"order":6},
      {"location":"CORNERBAR_RIGHT_FRIDGE","ref":"6274237","quantity":20,"order":9},
      {"location":"CORNERBAR_RIGHT_FRIDGE","ref":"5906961","quantity":6,"order":10},
      {"location":"CORNERBAR_RIGHT_FRIDGE","ref":"5906748","quantity":6,"order":11},
      {"location":"CORNERBAR_RIGHT_FRIDGE","ref":"5907001","quantity":6,"order":12},

      {"location":"CORNERBAR_MIDDLE_FRIDGE","ref":"4026939","quantity":9,"order":1},
      {"location":"CORNERBAR_MIDDLE_FRIDGE","ref":"9078232","quantity":3,"order":2},
      {"location":"CORNERBAR_MIDDLE_FRIDGE","ref":"4057913","quantity":20,"order":3},

      {"location":"CORNERBAR_LEFT_FRIDGE","ref":"5010707","quantity":8,"order":1},
      {"location":"CORNERBAR_LEFT_FRIDGE","ref":"5010715","quantity":8,"order":2},
      {"location":"CORNERBAR_LEFT_FRIDGE","ref":"4013279","quantity":12,"order":3},
      {"location":"CORNERBAR_LEFT_FRIDGE","ref":"4013209","quantity":12,"order":4},

      {"location":"WORKBAR_BAR_LEFT_FRIDGE","ref":"6181002","quantity":25,"order":1},
      {"location":"WORKBAR_BAR_LEFT_FRIDGE","ref":"9082254","quantity":40,"order":2},
      {"location":"WORKBAR_BAR_LEFT_FRIDGE","ref":"4966818","quantity":35,"order":3},
      {"location":"WORKBAR_BAR_LEFT_FRIDGE","ref":"707000631","quantity":30,"order":4},
      {"location":"WORKBAR_BAR_LEFT_FRIDGE","ref":"5746938","quantity":20,"order":5},
      {"location":"WORKBAR_BAR_LEFT_FRIDGE","ref":"5932918","quantity":16,"order":6},

      {"location":"WORKBAR_BAR_RIGHT_FRIDGE","ref":"4057913","quantity":20,"order":1},
      {"location":"WORKBAR_BAR_RIGHT_FRIDGE","ref":"4026939","quantity":9,"order":2},
      {"location":"WORKBAR_BAR_RIGHT_FRIDGE","ref":"5010715","quantity":4,"order":3},
      {"location":"WORKBAR_BAR_RIGHT_FRIDGE","ref":"4013279","quantity":12,"order":5},
      {"location":"WORKBAR_BAR_RIGHT_FRIDGE","ref":"6274237","quantity":24,"order":6},
      {"location":"WORKBAR_BAR_RIGHT_FRIDGE","ref":"814467","quantity":11,"order":7},

      {"location":"WORKBAR_NON_ALCO_FRIDGE","ref":"5804190","quantity":12,"order":1},
      {"location":"WORKBAR_NON_ALCO_FRIDGE","ref":"6503346","quantity":12,"order":2},
      {"location":"WORKBAR_NON_ALCO_FRIDGE","ref":"6757157","quantity":16,"order":4},
      {"location":"WORKBAR_NON_ALCO_FRIDGE","ref":"6274237","quantity":30,"order":6},
      {"location":"WORKBAR_NON_ALCO_FRIDGE","ref":"814467","quantity":24,"order":8},
      {"location":"WORKBAR_NON_ALCO_FRIDGE","ref":"5059183","quantity":8,"order":9},
      {"location":"WORKBAR_NON_ALCO_FRIDGE","ref":"5285960","quantity":8,"order":10},
      {"location":"WORKBAR_NON_ALCO_FRIDGE","ref":"5907001","quantity":8,"order":11},
      {"location":"WORKBAR_NON_ALCO_FRIDGE","ref":"5906748","quantity":8,"order":12},
      {"location":"WORKBAR_NON_ALCO_FRIDGE","ref":"5906961","quantity":8,"order":13},
      {"location":"WORKBAR_NON_ALCO_FRIDGE","ref":"1831718","quantity":8,"order":14}
    ]
    $defaults$::jsonb) as item(location text, ref text, quantity numeric, "order" integer)
  loop
    select location.id into v_location_id
    from public.inventory_locations location
    where location.organization_id = v_actor.organization_id
      and location.code = v_item.location;
    select product.* into v_product
    from public.inventory_products product
    where product.organization_id = v_actor.organization_id
      and product.millum_item_ref = v_item.ref;

    insert into public.inventory_location_products (
      organization_id, location_id, product_id, par_quantity, count_order,
      active, stock_policy, created_by_auth_user_id, updated_by_auth_user_id
    ) values (
      v_actor.organization_id, v_location_id, v_product.id, v_item.quantity,
      v_item."order", true, 'exact_par',
      v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
    ) on conflict (location_id, product_id) do nothing;
  end loop;

  for v_item in
    select * from jsonb_to_recordset($unresolved$
    [
      {"location":"CORNERBAR_RIGHT_FRIDGE","name":"Blonde","quantity":25,"order":1,"candidates":["707000631","4966818"],"reason":"Possible Blonde / Norwegian Blonde alias is not authoritative, and another Millum beer also contains Blonde."},
      {"location":"CORNERBAR_RIGHT_FRIDGE","name":"Passion","quantity":20,"order":2,"candidates":["4966818"],"reason":"The practical name is not a verified alias for the Millum product."},
      {"location":"CORNERBAR_RIGHT_FRIDGE","name":"Pils","quantity":20,"order":4,"candidates":["4019089","5932918"],"reason":"Millum contains both keg and bottle Aass Pils identities."},
      {"location":"CORNERBAR_RIGHT_FRIDGE","name":"Ginger Ninja","quantity":10,"order":7,"candidates":["4014701","6181002","4054613"],"reason":"Millum contains Hot Chili soda, Nordic Berries beer, and Hot Chili Keykeg identities."},
      {"location":"CORNERBAR_RIGHT_FRIDGE","name":"Skog","quantity":5,"order":8,"candidates":["6631634","4030686"],"reason":"Millum contains 0.33 L and 0.75 L Skog identities."},
      {"location":"CORNERBAR_RIGHT_FRIDGE","name":"Eple","quantity":4,"order":13,"candidates":["5744222","6388581"],"reason":"The short Cornerbar name is not a verified alias and matches multiple apple drinks."},
      {"location":"CORNERBAR_RIGHT_FRIDGE","name":"Rabarbra","quantity":4,"order":14,"candidates":["5804190","5746938"],"reason":"The short Cornerbar name is not a verified alias and appears in multiple products."},
      {"location":"CORNERBAR_RIGHT_FRIDGE","name":"Hylle","quantity":4,"order":15,"candidates":["5804190","6503346"],"reason":"The short Cornerbar name is not a verified alias and matches multiple elderflower drinks."},
      {"location":"CORNERBAR_RIGHT_FRIDGE","name":"Pepsi","quantity":6,"order":16,"candidates":["814467"],"reason":"Pepsi / Pepsi Max is listed as a possible, not authoritative, alias."},
      {"location":"CORNERBAR_RIGHT_FRIDGE","name":"Farris","quantity":6,"order":17,"candidates":["5104641","5104666"],"reason":"Millum contains Lime and Naturell Farris identities."},

      {"location":"WORKBAR_BAR_RIGHT_FRIDGE","name":"Schweppes Indian Tonic","quantity":3,"order":4,"candidates":[],"reason":"No matching Millum item reference appears in the supplied export."},
      {"location":"WORKBAR_BAR_RIGHT_FRIDGE","name":"Farris","quantity":6,"order":8,"candidates":["5104641","5104666"],"reason":"Millum contains Lime and Naturell Farris identities."},

      {"location":"WORKBAR_NON_ALCO_FRIDGE","name":"Eple & Eple","quantity":12,"order":3,"candidates":["6388581"],"reason":"The longer practical name is not proven as an alias by the Millum export."},
      {"location":"WORKBAR_NON_ALCO_FRIDGE","name":"Appelsinjuice","quantity":16,"order":5,"candidates":["6752422","3221686"],"reason":"Millum contains individual 250 ml and 1.5 L orange juice identities."},
      {"location":"WORKBAR_NON_ALCO_FRIDGE","name":"Farris","quantity":20,"order":7,"candidates":["5104641","5104666"],"reason":"Millum contains Lime and Naturell Farris identities."},
      {"location":"WORKBAR_NON_ALCO_FRIDGE","name":"Skog","quantity":20,"order":15,"candidates":["6631634","4030686"],"reason":"Millum contains 0.33 L and 0.75 L Skog identities."}
    ]
    $unresolved$::jsonb) as item(
      location text, name text, quantity numeric, "order" integer,
      candidates text[], reason text
    )
  loop
    select location.id into v_location_id
    from public.inventory_locations location
    where location.organization_id = v_actor.organization_id
      and location.code = v_item.location;

    insert into public.inventory_catalogue_unresolved_mappings (
      organization_id, location_id, requested_name, requested_default_quantity,
      requested_count_order, candidate_millum_item_refs, reason,
      created_by_auth_user_id, updated_by_auth_user_id
    ) values (
      v_actor.organization_id, v_location_id, v_item.name, v_item.quantity,
      v_item."order", coalesce(v_item.candidates, '{}'), v_item.reason,
      v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
    ) on conflict (organization_id, location_id, lower(trim(requested_name))) do nothing;
  end loop;

  return jsonb_build_object(
    'created', 0,
    'reused', 6,
    'restored', 0,
    'refrigerators', (
      select count(*) from public.inventory_locations location
      where location.organization_id = v_actor.organization_id
        and location.active and location.location_type = 'fridge'
    ),
    'catalogueProducts', (
      select count(*) from public.inventory_products product
      where product.organization_id = v_actor.organization_id
        and product.ownership_status = 'owned'
        and product.millum_item_ref is not null
    ),
    'defaultRows', (
      select count(*) from public.inventory_location_products standard
      join public.inventory_locations location on location.id = standard.location_id
      where standard.organization_id = v_actor.organization_id
        and standard.active
        and public.inventory_phase9g_is_refrigerator(location.id, v_actor.organization_id)
    ),
    'unresolvedMappings', (
      select count(*) from public.inventory_catalogue_unresolved_mappings mapping
      where mapping.organization_id = v_actor.organization_id
        and mapping.resolution_status = 'unresolved'
    )
  );
end;
$$;

revoke all on function public.inventory_phase9g_is_refrigerator(uuid, uuid) from public, anon, authenticated;
revoke all on function public.inventory_phase9g_mark_template_incomplete() from public, anon, authenticated;
revoke all on function public.inventory_phase9g_ensure_location(uuid, uuid, text, text, text, uuid, text, integer, text) from public, anon, authenticated;

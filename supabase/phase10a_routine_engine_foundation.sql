-- Phase 10A: Routine Engine v2 database foundation.
--
-- This migration is additive and intentionally does not seed organization-
-- specific routine content. It does not activate Routine Engine v2 and does
-- not read from or write to Stock Count, Event Operations, or legacy routine
-- records.

create table if not exists public.routine_organization_settings (
  organization_id uuid primary key references public.organizations(id),
  mode text not null default 'legacy',
  timezone text not null default 'Europe/Oslo',
  operational_day_cutoff time without time zone not null default '04:00',
  shared_device_enabled boolean not null default false,
  reopen_window_hours integer not null default 24,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_auth_user_id uuid references auth.users(id),
  updated_by_auth_user_id uuid references auth.users(id),
  constraint routine_organization_settings_mode_check
    check (mode in ('legacy', 'shadow', 'pilot', 'active')),
  constraint routine_organization_settings_timezone_check
    check (timezone = 'Europe/Oslo'),
  constraint routine_organization_settings_reopen_window_check
    check (reopen_window_hours between 0 and 168),
  constraint routine_organization_settings_revision_check check (revision > 0)
);

create table if not exists public.routine_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  location_key text not null,
  name text not null,
  location_type text not null,
  parent_location_id uuid,
  active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_auth_user_id uuid references auth.users(id),
  updated_by_auth_user_id uuid references auth.users(id),
  constraint routine_locations_org_key_unique unique (organization_id, location_key),
  constraint routine_locations_id_org_unique unique (id, organization_id),
  constraint routine_locations_parent_same_org_fkey
    foreign key (parent_location_id, organization_id)
    references public.routine_locations(id, organization_id),
  constraint routine_locations_key_required
    check (nullif(trim(location_key), '') is not null and location_key = trim(location_key)),
  constraint routine_locations_name_required
    check (nullif(trim(name), '') is not null and name = trim(name)),
  constraint routine_locations_type_check check (
    location_type in (
      'zone', 'room', 'station', 'storage', 'fridge', 'toilet',
      'door', 'equipment', 'collection_point', 'other'
    )
  ),
  constraint routine_locations_parent_not_self_check
    check (parent_location_id is null or parent_location_id <> id),
  constraint routine_locations_sort_order_check check (sort_order >= 0),
  constraint routine_locations_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint routine_locations_revision_check check (revision > 0)
);

create table if not exists public.routine_location_sets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  set_key text not null,
  name text not null,
  description text,
  active boolean not null default true,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_auth_user_id uuid references auth.users(id),
  updated_by_auth_user_id uuid references auth.users(id),
  constraint routine_location_sets_org_key_unique unique (organization_id, set_key),
  constraint routine_location_sets_id_org_unique unique (id, organization_id),
  constraint routine_location_sets_key_required
    check (nullif(trim(set_key), '') is not null and set_key = trim(set_key)),
  constraint routine_location_sets_name_required
    check (nullif(trim(name), '') is not null and name = trim(name)),
  constraint routine_location_sets_revision_check check (revision > 0)
);

create table if not exists public.routine_location_set_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  location_set_id uuid not null,
  location_id uuid not null,
  sort_order integer not null default 0,
  required boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_auth_user_id uuid references auth.users(id),
  updated_by_auth_user_id uuid references auth.users(id),
  constraint routine_location_set_members_set_same_org_fkey
    foreign key (location_set_id, organization_id)
    references public.routine_location_sets(id, organization_id),
  constraint routine_location_set_members_location_same_org_fkey
    foreign key (location_id, organization_id)
    references public.routine_locations(id, organization_id),
  constraint routine_location_set_members_location_unique unique (location_set_id, location_id),
  constraint routine_location_set_members_sort_unique unique (location_set_id, sort_order),
  constraint routine_location_set_members_sort_order_check check (sort_order >= 0),
  constraint routine_location_set_members_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.routine_standards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  standard_key text not null,
  label text not null,
  description text,
  value_type text not null,
  unit text,
  source_kind text not null,
  current_revision_id uuid,
  active boolean not null default true,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_auth_user_id uuid references auth.users(id),
  updated_by_auth_user_id uuid references auth.users(id),
  constraint routine_standards_org_key_unique unique (organization_id, standard_key),
  constraint routine_standards_id_org_unique unique (id, organization_id),
  constraint routine_standards_key_required
    check (nullif(trim(standard_key), '') is not null and standard_key = trim(standard_key)),
  constraint routine_standards_label_required
    check (nullif(trim(label), '') is not null and label = trim(label)),
  constraint routine_standards_value_type_check
    check (value_type in ('integer', 'decimal', 'boolean', 'text', 'object', 'list')),
  constraint routine_standards_source_kind_check
    check (source_kind in ('manual', 'inventory_readonly', 'asset_registry_readonly', 'location_set')),
  constraint routine_standards_revision_check check (revision > 0)
);

create table if not exists public.routine_standard_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  standard_id uuid not null,
  revision_number bigint not null,
  value_json jsonb not null,
  effective_from timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid references auth.users(id),
  content_hash text not null,
  idempotency_key uuid not null,
  constraint routine_standard_revisions_standard_same_org_fkey
    foreign key (standard_id, organization_id)
    references public.routine_standards(id, organization_id),
  constraint routine_standard_revisions_number_unique unique (standard_id, revision_number),
  constraint routine_standard_revisions_idempotency_unique unique (standard_id, idempotency_key),
  constraint routine_standard_revisions_identity_unique unique (id, standard_id, organization_id),
  constraint routine_standard_revisions_number_check check (revision_number > 0),
  constraint routine_standard_revisions_hash_check check (content_hash ~ '^[0-9a-f]{32}$'),
  constraint routine_standard_revisions_reason_check
    check (reason is null or nullif(trim(reason), '') is not null)
);

do $phase10a$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'routine_standards_current_revision_same_standard_fkey'
      and conrelid = 'public.routine_standards'::regclass
  ) then
    alter table public.routine_standards
      add constraint routine_standards_current_revision_same_standard_fkey
      foreign key (current_revision_id, id, organization_id)
      references public.routine_standard_revisions(id, standard_id, organization_id);
  end if;
end;
$phase10a$;

create index if not exists routine_locations_parent_idx
  on public.routine_locations (parent_location_id, organization_id)
  where parent_location_id is not null;
create index if not exists routine_locations_org_active_order_idx
  on public.routine_locations (organization_id, active, sort_order, name);
create index if not exists routine_location_sets_org_active_idx
  on public.routine_location_sets (organization_id, active, name);
create index if not exists routine_location_set_members_org_idx
  on public.routine_location_set_members (organization_id);
create index if not exists routine_location_set_members_location_idx
  on public.routine_location_set_members (location_id, organization_id);
create index if not exists routine_standards_org_active_idx
  on public.routine_standards (organization_id, active, standard_key);
create index if not exists routine_standards_current_revision_idx
  on public.routine_standards (current_revision_id, id, organization_id)
  where current_revision_id is not null;
create index if not exists routine_standard_revisions_org_idx
  on public.routine_standard_revisions (organization_id, standard_id);

create or replace function public.routine_set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace function public.routine_prepare_standard_revision()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.content_hash := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'standardId', new.standard_id,
      'revisionNumber', new.revision_number,
      'value', new.value_json,
      'effectiveFrom', new.effective_from,
      'reason', new.reason
    )::text
  );
  return new;
end;
$$;

create or replace function public.routine_standard_revision_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'Routine standard revisions are immutable.';
end;
$$;

drop trigger if exists routine_organization_settings_set_updated_at
  on public.routine_organization_settings;
create trigger routine_organization_settings_set_updated_at
before update on public.routine_organization_settings
for each row execute function public.routine_set_updated_at();

drop trigger if exists routine_locations_set_updated_at on public.routine_locations;
create trigger routine_locations_set_updated_at
before update on public.routine_locations
for each row execute function public.routine_set_updated_at();

drop trigger if exists routine_location_sets_set_updated_at on public.routine_location_sets;
create trigger routine_location_sets_set_updated_at
before update on public.routine_location_sets
for each row execute function public.routine_set_updated_at();

drop trigger if exists routine_location_set_members_set_updated_at
  on public.routine_location_set_members;
create trigger routine_location_set_members_set_updated_at
before update on public.routine_location_set_members
for each row execute function public.routine_set_updated_at();

drop trigger if exists routine_standards_set_updated_at on public.routine_standards;
create trigger routine_standards_set_updated_at
before update on public.routine_standards
for each row execute function public.routine_set_updated_at();

drop trigger if exists routine_standard_revisions_prepare
  on public.routine_standard_revisions;
create trigger routine_standard_revisions_prepare
before insert on public.routine_standard_revisions
for each row execute function public.routine_prepare_standard_revision();

drop trigger if exists routine_standard_revisions_immutable
  on public.routine_standard_revisions;
create trigger routine_standard_revisions_immutable
before update or delete on public.routine_standard_revisions
for each row execute function public.routine_standard_revision_immutable();

create or replace function public.routine_current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.user_profiles profile
    where profile.id = (select auth.uid())
      and profile.active = true
      and profile.organization_id is not null
      and coalesce(profile.is_shared_device, false) = false
      and profile.role in ('manager', 'shift_lead', 'staff')
  );
$$;

create or replace function public.routine_current_user_organization_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select profile.organization_id
  from public.user_profiles profile
  where profile.id = (select auth.uid())
    and profile.active = true
    and profile.organization_id is not null
    and coalesce(profile.is_shared_device, false) = false
    and profile.role in ('manager', 'shift_lead', 'staff')
  limit 1;
$$;

create or replace function public.routine_current_user_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select profile.role
  from public.user_profiles profile
  where profile.id = (select auth.uid())
    and profile.active = true
    and profile.organization_id is not null
    and coalesce(profile.is_shared_device, false) = false
    and profile.role in ('manager', 'shift_lead', 'staff')
  limit 1;
$$;

create or replace function public.routine_current_user_can_manage_templates()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(public.routine_current_user_role() = 'manager', false);
$$;

create or replace function public.routine_current_user_can_coordinate_runs()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(public.routine_current_user_role() in ('manager', 'shift_lead'), false);
$$;

create or replace function public.routine_current_user_can_perform_tasks()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(public.routine_current_user_role() in ('manager', 'shift_lead', 'staff'), false);
$$;

create or replace function public.routine_resolve_actor()
returns table (
  actor_auth_user_id uuid,
  actor_profile_id uuid,
  organization_id uuid,
  actor_role text,
  actor_display_name text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_profile public.user_profiles%rowtype;
begin
  if v_auth_user_id is null then
    raise exception using errcode = 'P0001', message = 'Authenticated routine access is required.';
  end if;

  select profile.*
  into v_profile
  from public.user_profiles profile
  where profile.id = v_auth_user_id
    and profile.active = true
    and profile.organization_id is not null
    and coalesce(profile.is_shared_device, false) = false
    and profile.role in ('manager', 'shift_lead', 'staff');

  if v_profile.id is null then
    raise exception using
      errcode = 'P0001',
      message = 'An active personal routine profile with an organization is required.';
  end if;

  return query select
    v_auth_user_id,
    v_profile.id,
    v_profile.organization_id,
    v_profile.role,
    v_profile.display_name;
end;
$$;

create or replace function public.create_or_update_routine_organization_settings(
  input_mode text,
  input_timezone text,
  input_operational_day_cutoff time without time zone,
  input_shared_device_enabled boolean,
  input_reopen_window_hours integer,
  input_expected_revision bigint default null
)
returns public.routine_organization_settings
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_settings public.routine_organization_settings%rowtype;
begin
  if not public.routine_current_user_can_manage_templates() then
    raise exception using errcode = 'P0001', message = 'Manager access is required to manage routine settings.';
  end if;
  select * into v_actor from public.routine_resolve_actor();

  select settings.*
  into v_settings
  from public.routine_organization_settings settings
  where settings.organization_id = v_actor.organization_id
  for update;

  if v_settings.organization_id is null then
    if input_expected_revision is not null then
      raise exception using errcode = '40001', message = 'Stale routine settings revision.';
    end if;
    insert into public.routine_organization_settings (
      organization_id, mode, timezone, operational_day_cutoff,
      shared_device_enabled, reopen_window_hours,
      created_by_auth_user_id, updated_by_auth_user_id
    ) values (
      v_actor.organization_id, input_mode, input_timezone, input_operational_day_cutoff,
      input_shared_device_enabled, input_reopen_window_hours,
      v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
    ) returning * into v_settings;
  else
    if input_expected_revision is distinct from v_settings.revision then
      raise exception using errcode = '40001', message = 'Stale routine settings revision.';
    end if;
    update public.routine_organization_settings settings
    set mode = input_mode,
        timezone = input_timezone,
        operational_day_cutoff = input_operational_day_cutoff,
        shared_device_enabled = input_shared_device_enabled,
        reopen_window_hours = input_reopen_window_hours,
        revision = settings.revision + 1,
        updated_by_auth_user_id = v_actor.actor_auth_user_id
    where settings.organization_id = v_actor.organization_id
    returning * into v_settings;
  end if;

  return v_settings;
end;
$$;

create or replace function public.upsert_routine_location(
  input_location_key text,
  input_name text,
  input_location_type text,
  input_parent_location_id uuid,
  input_sort_order integer,
  input_metadata jsonb,
  input_location_id uuid default null,
  input_expected_revision bigint default null
)
returns public.routine_locations
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_location public.routine_locations%rowtype;
  v_key text := pg_catalog.btrim(input_location_key);
  v_name text := pg_catalog.btrim(input_name);
begin
  if not public.routine_current_user_can_manage_templates() then
    raise exception using errcode = 'P0001', message = 'Manager access is required to manage routine locations.';
  end if;
  select * into v_actor from public.routine_resolve_actor();

  if input_parent_location_id is not null and not exists (
    select 1 from public.routine_locations parent
    where parent.id = input_parent_location_id
      and parent.organization_id = v_actor.organization_id
  ) then
    raise exception using errcode = 'P0001', message = 'Routine parent location was not found in this organization.';
  end if;

  if input_location_id is not null then
    select location.* into v_location
    from public.routine_locations location
    where location.id = input_location_id
      and location.organization_id = v_actor.organization_id
    for update;
    if v_location.id is null then
      raise exception using errcode = 'P0001', message = 'Routine location was not found in this organization.';
    end if;
  else
    select location.* into v_location
    from public.routine_locations location
    where location.organization_id = v_actor.organization_id
      and location.location_key = v_key
    for update;
  end if;

  if v_location.id is null then
    if input_expected_revision is not null then
      raise exception using errcode = '40001', message = 'Stale routine location revision.';
    end if;
    insert into public.routine_locations (
      organization_id, location_key, name, location_type, parent_location_id,
      sort_order, metadata, created_by_auth_user_id, updated_by_auth_user_id
    ) values (
      v_actor.organization_id, v_key, v_name, input_location_type, input_parent_location_id,
      input_sort_order, input_metadata, v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
    ) returning * into v_location;
  else
    if input_expected_revision is distinct from v_location.revision then
      raise exception using errcode = '40001', message = 'Stale routine location revision.';
    end if;
    update public.routine_locations location
    set location_key = v_key,
        name = v_name,
        location_type = input_location_type,
        parent_location_id = input_parent_location_id,
        sort_order = input_sort_order,
        metadata = input_metadata,
        revision = location.revision + 1,
        updated_by_auth_user_id = v_actor.actor_auth_user_id
    where location.id = v_location.id
      and location.organization_id = v_actor.organization_id
    returning * into v_location;
  end if;

  return v_location;
end;
$$;

create or replace function public.set_routine_location_active(
  input_location_id uuid,
  input_active boolean,
  input_expected_revision bigint
)
returns public.routine_locations
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_location public.routine_locations%rowtype;
begin
  if not public.routine_current_user_can_manage_templates() then
    raise exception using errcode = 'P0001', message = 'Manager access is required to manage routine locations.';
  end if;
  select * into v_actor from public.routine_resolve_actor();
  select location.* into v_location
  from public.routine_locations location
  where location.id = input_location_id
    and location.organization_id = v_actor.organization_id
  for update;
  if v_location.id is null then
    raise exception using errcode = 'P0001', message = 'Routine location was not found in this organization.';
  end if;
  if input_expected_revision is distinct from v_location.revision then
    raise exception using errcode = '40001', message = 'Stale routine location revision.';
  end if;
  update public.routine_locations location
  set active = input_active,
      revision = location.revision + 1,
      updated_by_auth_user_id = v_actor.actor_auth_user_id
  where location.id = v_location.id
    and location.organization_id = v_actor.organization_id
  returning * into v_location;
  return v_location;
end;
$$;

create or replace function public.upsert_routine_location_set(
  input_set_key text,
  input_name text,
  input_description text,
  input_active boolean,
  input_location_set_id uuid default null,
  input_expected_revision bigint default null
)
returns public.routine_location_sets
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_set public.routine_location_sets%rowtype;
  v_key text := pg_catalog.btrim(input_set_key);
  v_name text := pg_catalog.btrim(input_name);
begin
  if not public.routine_current_user_can_manage_templates() then
    raise exception using errcode = 'P0001', message = 'Manager access is required to manage routine location sets.';
  end if;
  select * into v_actor from public.routine_resolve_actor();

  if input_location_set_id is not null then
    select location_set.* into v_set
    from public.routine_location_sets location_set
    where location_set.id = input_location_set_id
      and location_set.organization_id = v_actor.organization_id
    for update;
    if v_set.id is null then
      raise exception using errcode = 'P0001', message = 'Routine location set was not found in this organization.';
    end if;
  else
    select location_set.* into v_set
    from public.routine_location_sets location_set
    where location_set.organization_id = v_actor.organization_id
      and location_set.set_key = v_key
    for update;
  end if;

  if v_set.id is null then
    if input_expected_revision is not null then
      raise exception using errcode = '40001', message = 'Stale routine location set revision.';
    end if;
    insert into public.routine_location_sets (
      organization_id, set_key, name, description, active,
      created_by_auth_user_id, updated_by_auth_user_id
    ) values (
      v_actor.organization_id, v_key, v_name, input_description, input_active,
      v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
    ) returning * into v_set;
  else
    if input_expected_revision is distinct from v_set.revision then
      raise exception using errcode = '40001', message = 'Stale routine location set revision.';
    end if;
    update public.routine_location_sets location_set
    set set_key = v_key,
        name = v_name,
        description = input_description,
        active = input_active,
        revision = location_set.revision + 1,
        updated_by_auth_user_id = v_actor.actor_auth_user_id
    where location_set.id = v_set.id
      and location_set.organization_id = v_actor.organization_id
    returning * into v_set;
  end if;
  return v_set;
end;
$$;

create or replace function public.replace_routine_location_set_members(
  input_location_set_id uuid,
  input_members jsonb,
  input_expected_revision bigint
)
returns public.routine_location_sets
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_set public.routine_location_sets%rowtype;
  v_member_count integer;
begin
  if not public.routine_current_user_can_manage_templates() then
    raise exception using errcode = 'P0001', message = 'Manager access is required to manage routine location sets.';
  end if;
  select * into v_actor from public.routine_resolve_actor();
  if input_members is null or pg_catalog.jsonb_typeof(input_members) <> 'array' then
    raise exception using errcode = '22023', message = 'Routine location set members must be a JSON array.';
  end if;

  select location_set.* into v_set
  from public.routine_location_sets location_set
  where location_set.id = input_location_set_id
    and location_set.organization_id = v_actor.organization_id
  for update;
  if v_set.id is null then
    raise exception using errcode = 'P0001', message = 'Routine location set was not found in this organization.';
  end if;
  if input_expected_revision is distinct from v_set.revision then
    raise exception using errcode = '40001', message = 'Stale routine location set revision.';
  end if;

  select pg_catalog.count(*) into v_member_count
  from pg_catalog.jsonb_array_elements(input_members) item;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(input_members) item
    where pg_catalog.jsonb_typeof(item) <> 'object'
      or nullif(item ->> 'locationId', '') is null
  ) then
    raise exception using errcode = '22023', message = 'Every routine location set member requires a locationId.';
  end if;

  if (
    select pg_catalog.count(*) <> pg_catalog.count(distinct (item ->> 'locationId'))
    from pg_catalog.jsonb_array_elements(input_members) item
  ) then
    raise exception using errcode = '22023', message = 'Routine location set members cannot contain duplicate locations.';
  end if;

  if (
    select pg_catalog.count(*) <> pg_catalog.count(distinct coalesce((item ->> 'sortOrder')::integer, ordinality::integer - 1))
    from pg_catalog.jsonb_array_elements(input_members) with ordinality member(item, ordinality)
  ) then
    raise exception using errcode = '22023', message = 'Routine location set member sort orders must be unique.';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(input_members) with ordinality member(item, ordinality)
    where coalesce((item ->> 'sortOrder')::integer, ordinality::integer - 1) < 0
      or coalesce(item -> 'metadata', '{}'::jsonb) is null
      or pg_catalog.jsonb_typeof(coalesce(item -> 'metadata', '{}'::jsonb)) <> 'object'
  ) then
    raise exception using errcode = '22023', message = 'Routine location set member configuration is invalid.';
  end if;

  if (
    select pg_catalog.count(*)
    from public.routine_locations location
    where location.organization_id = v_actor.organization_id
      and location.id in (
        select (item ->> 'locationId')::uuid
        from pg_catalog.jsonb_array_elements(input_members) item
      )
  ) <> v_member_count then
    raise exception using errcode = 'P0001', message = 'Every routine location set member must belong to this organization.';
  end if;

  delete from public.routine_location_set_members member
  where member.location_set_id = v_set.id
    and member.organization_id = v_actor.organization_id;

  insert into public.routine_location_set_members (
    organization_id, location_set_id, location_id, sort_order, required, metadata,
    created_by_auth_user_id, updated_by_auth_user_id
  )
  select
    v_actor.organization_id,
    v_set.id,
    (item ->> 'locationId')::uuid,
    coalesce((item ->> 'sortOrder')::integer, ordinality::integer - 1),
    coalesce((item ->> 'required')::boolean, true),
    coalesce(item -> 'metadata', '{}'::jsonb),
    v_actor.actor_auth_user_id,
    v_actor.actor_auth_user_id
  from pg_catalog.jsonb_array_elements(input_members) with ordinality member(item, ordinality)
  order by coalesce((item ->> 'sortOrder')::integer, ordinality::integer - 1),
           (item ->> 'locationId')::uuid;

  update public.routine_location_sets location_set
  set revision = location_set.revision + 1,
      updated_by_auth_user_id = v_actor.actor_auth_user_id
  where location_set.id = v_set.id
    and location_set.organization_id = v_actor.organization_id
  returning * into v_set;
  return v_set;
end;
$$;

create or replace function public.create_routine_standard(
  input_standard_key text,
  input_label text,
  input_description text,
  input_value_type text,
  input_unit text,
  input_source_kind text,
  input_active boolean default true
)
returns public.routine_standards
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_standard public.routine_standards%rowtype;
begin
  if not public.routine_current_user_can_manage_templates() then
    raise exception using errcode = 'P0001', message = 'Manager access is required to create routine standards.';
  end if;
  select * into v_actor from public.routine_resolve_actor();
  insert into public.routine_standards (
    organization_id, standard_key, label, description, value_type, unit,
    source_kind, active, created_by_auth_user_id, updated_by_auth_user_id
  ) values (
    v_actor.organization_id, pg_catalog.btrim(input_standard_key), pg_catalog.btrim(input_label),
    input_description, input_value_type, input_unit, input_source_kind, input_active,
    v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
  ) returning * into v_standard;
  return v_standard;
end;
$$;

create or replace function public.create_routine_standard_revision(
  input_standard_id uuid,
  input_value_json jsonb,
  input_effective_from timestamptz,
  input_reason text,
  input_idempotency_key uuid,
  input_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_standard public.routine_standards%rowtype;
  v_revision public.routine_standard_revisions%rowtype;
  v_next_revision bigint;
begin
  if not public.routine_current_user_can_manage_templates() then
    raise exception using errcode = 'P0001', message = 'Manager access is required to create routine standard revisions.';
  end if;
  select * into v_actor from public.routine_resolve_actor();
  if input_idempotency_key is null then
    raise exception using errcode = '22023', message = 'A routine standard revision idempotency key is required.';
  end if;
  if input_value_json is null then
    raise exception using errcode = '23502', message = 'A routine standard revision value is required.';
  end if;

  select standard.* into v_standard
  from public.routine_standards standard
  where standard.id = input_standard_id
    and standard.organization_id = v_actor.organization_id
  for update;
  if v_standard.id is null then
    raise exception using errcode = 'P0001', message = 'Routine standard was not found in this organization.';
  end if;

  select revision.* into v_revision
  from public.routine_standard_revisions revision
  where revision.standard_id = v_standard.id
    and revision.organization_id = v_actor.organization_id
    and revision.idempotency_key = input_idempotency_key;

  if v_revision.id is not null then
    if v_revision.value_json is distinct from input_value_json
       or v_revision.effective_from is distinct from input_effective_from
       or v_revision.reason is distinct from input_reason then
      raise exception using
        errcode = 'P0001',
        message = 'This routine standard idempotency key was already used with different content.';
    end if;
    return pg_catalog.jsonb_build_object(
      'standard', pg_catalog.to_jsonb(v_standard),
      'revision', pg_catalog.to_jsonb(v_revision),
      'idempotentReplay', true
    );
  end if;

  if input_expected_revision is distinct from v_standard.revision then
    raise exception using errcode = '40001', message = 'Stale routine standard revision.';
  end if;

  select coalesce(pg_catalog.max(revision.revision_number), 0) + 1
  into v_next_revision
  from public.routine_standard_revisions revision
  where revision.standard_id = v_standard.id;

  insert into public.routine_standard_revisions (
    organization_id, standard_id, revision_number, value_json, effective_from,
    reason, created_by_auth_user_id, idempotency_key, content_hash
  ) values (
    v_actor.organization_id, v_standard.id, v_next_revision, input_value_json,
    input_effective_from, input_reason, v_actor.actor_auth_user_id,
    input_idempotency_key, pg_catalog.md5('phase10a-trigger-replaces-this')
  ) returning * into v_revision;

  update public.routine_standards standard
  set current_revision_id = v_revision.id,
      revision = standard.revision + 1,
      updated_by_auth_user_id = v_actor.actor_auth_user_id
  where standard.id = v_standard.id
    and standard.organization_id = v_actor.organization_id
  returning * into v_standard;

  return pg_catalog.jsonb_build_object(
    'standard', pg_catalog.to_jsonb(v_standard),
    'revision', pg_catalog.to_jsonb(v_revision),
    'idempotentReplay', false
  );
end;
$$;

alter table public.routine_organization_settings enable row level security;
alter table public.routine_locations enable row level security;
alter table public.routine_location_sets enable row level security;
alter table public.routine_location_set_members enable row level security;
alter table public.routine_standards enable row level security;
alter table public.routine_standard_revisions enable row level security;

drop policy if exists routine_organization_settings_read on public.routine_organization_settings;
create policy routine_organization_settings_read
on public.routine_organization_settings for select
to authenticated
using (
  (select public.routine_current_user_can_manage_templates())
  and organization_id = (select public.routine_current_user_organization_id())
);

drop policy if exists routine_locations_read on public.routine_locations;
create policy routine_locations_read
on public.routine_locations for select
to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and (
    (select public.routine_current_user_can_manage_templates())
    or ((select public.routine_current_user_can_perform_tasks()) and active)
  )
);

drop policy if exists routine_location_sets_read on public.routine_location_sets;
create policy routine_location_sets_read
on public.routine_location_sets for select
to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and (
    (select public.routine_current_user_can_manage_templates())
    or ((select public.routine_current_user_can_perform_tasks()) and active)
  )
);

drop policy if exists routine_location_set_members_read on public.routine_location_set_members;
create policy routine_location_set_members_read
on public.routine_location_set_members for select
to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and (
    (select public.routine_current_user_can_manage_templates())
    or (
      (select public.routine_current_user_can_perform_tasks())
      and exists (
        select 1 from public.routine_location_sets location_set
        where location_set.id = location_set_id
          and location_set.organization_id = routine_location_set_members.organization_id
          and location_set.active
      )
      and exists (
        select 1 from public.routine_locations location
        where location.id = location_id
          and location.organization_id = routine_location_set_members.organization_id
          and location.active
      )
    )
  )
);

drop policy if exists routine_standards_read on public.routine_standards;
create policy routine_standards_read
on public.routine_standards for select
to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and (
    (select public.routine_current_user_can_manage_templates())
    or ((select public.routine_current_user_can_perform_tasks()) and active)
  )
);

drop policy if exists routine_standard_revisions_read on public.routine_standard_revisions;
create policy routine_standard_revisions_read
on public.routine_standard_revisions for select
to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and (
    (select public.routine_current_user_can_manage_templates())
    or (
      (select public.routine_current_user_can_perform_tasks())
      and exists (
        select 1 from public.routine_standards standard
        where standard.id = standard_id
          and standard.organization_id = routine_standard_revisions.organization_id
          and standard.active
      )
    )
  )
);

revoke all privileges on table public.routine_organization_settings from public, anon, authenticated;
revoke all privileges on table public.routine_locations from public, anon, authenticated;
revoke all privileges on table public.routine_location_sets from public, anon, authenticated;
revoke all privileges on table public.routine_location_set_members from public, anon, authenticated;
revoke all privileges on table public.routine_standards from public, anon, authenticated;
revoke all privileges on table public.routine_standard_revisions from public, anon, authenticated;

grant select on table public.routine_organization_settings to authenticated;
grant select on table public.routine_locations to authenticated;
grant select on table public.routine_location_sets to authenticated;
grant select on table public.routine_location_set_members to authenticated;
grant select on table public.routine_standards to authenticated;
grant select on table public.routine_standard_revisions to authenticated;

revoke all on function public.routine_set_updated_at() from public, anon, authenticated;
revoke all on function public.routine_prepare_standard_revision() from public, anon, authenticated;
revoke all on function public.routine_standard_revision_immutable() from public, anon, authenticated;
revoke all on function public.routine_current_user_is_active() from public, anon, authenticated;
revoke all on function public.routine_current_user_organization_id() from public, anon, authenticated;
revoke all on function public.routine_current_user_role() from public, anon, authenticated;
revoke all on function public.routine_current_user_can_manage_templates() from public, anon, authenticated;
revoke all on function public.routine_current_user_can_coordinate_runs() from public, anon, authenticated;
revoke all on function public.routine_current_user_can_perform_tasks() from public, anon, authenticated;
revoke all on function public.routine_resolve_actor() from public, anon, authenticated;
revoke all on function public.create_or_update_routine_organization_settings(
  text, text, time without time zone, boolean, integer, bigint
) from public, anon, authenticated;
revoke all on function public.upsert_routine_location(
  text, text, text, uuid, integer, jsonb, uuid, bigint
) from public, anon, authenticated;
revoke all on function public.set_routine_location_active(uuid, boolean, bigint)
  from public, anon, authenticated;
revoke all on function public.upsert_routine_location_set(
  text, text, text, boolean, uuid, bigint
) from public, anon, authenticated;
revoke all on function public.replace_routine_location_set_members(uuid, jsonb, bigint)
  from public, anon, authenticated;
revoke all on function public.create_routine_standard(
  text, text, text, text, text, text, boolean
) from public, anon, authenticated;
revoke all on function public.create_routine_standard_revision(
  uuid, jsonb, timestamptz, text, uuid, bigint
) from public, anon, authenticated;

grant execute on function public.routine_current_user_is_active() to authenticated;
grant execute on function public.routine_current_user_organization_id() to authenticated;
grant execute on function public.routine_current_user_role() to authenticated;
grant execute on function public.routine_current_user_can_manage_templates() to authenticated;
grant execute on function public.routine_current_user_can_coordinate_runs() to authenticated;
grant execute on function public.routine_current_user_can_perform_tasks() to authenticated;
grant execute on function public.create_or_update_routine_organization_settings(
  text, text, time without time zone, boolean, integer, bigint
) to authenticated;
grant execute on function public.upsert_routine_location(
  text, text, text, uuid, integer, jsonb, uuid, bigint
) to authenticated;
grant execute on function public.set_routine_location_active(uuid, boolean, bigint)
  to authenticated;
grant execute on function public.upsert_routine_location_set(
  text, text, text, boolean, uuid, bigint
) to authenticated;
grant execute on function public.replace_routine_location_set_members(uuid, jsonb, bigint)
  to authenticated;
grant execute on function public.create_routine_standard(
  text, text, text, text, text, text, boolean
) to authenticated;
grant execute on function public.create_routine_standard_revision(
  uuid, jsonb, timestamptz, text, uuid, bigint
) to authenticated;

-- Visual Standards: physical Self-Service taxonomy and ordered detail images.
--
-- This migration is forward-only. Legacy canonical rows and their immutable
-- assets/history are retained for auditability, hidden from ordinary lists,
-- and mapped to the closest replacement key through explicit aliases.

alter table public.visual_standards
  add column is_visible boolean not null default true;

create table public.visual_standard_aliases (
  alias_key text primary key
    check (alias_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  canonical_key text not null references public.visual_standards(canonical_key) on delete restrict,
  created_at timestamptz not null default now(),
  check (alias_key <> canonical_key)
);

update public.visual_standards
set is_visible = false
where canonical_key in (
  'self-service-coffee-service-standard',
  'self-service-takeaway-coffee-standard',
  'self-service-glassware-serviceware-standard',
  'self-service-food-display-standard'
);

insert into public.visual_standards (
  canonical_key,
  area,
  section,
  label,
  is_visible
)
values
  ('self-service-station-overview-standard', 'Self-Service Station', 'Full station overview', 'Self-Service Station overview standard', true),
  ('self-service-bakery-fruit-display-standard', 'Self-Service Station', 'Bakery & fruit display', 'Self-Service bakery & fruit display standard', true),
  ('self-service-coffee-retail-filter-standard', 'Self-Service Station', 'Coffee retail & filter coffee', 'Self-Service coffee retail & filter coffee standard', true),
  ('self-service-espresso-machine-cups-standard', 'Self-Service Station', 'Espresso machine & cups', 'Self-Service espresso machine & cups standard', true),
  ('self-service-tea-condiments-standard', 'Self-Service Station', 'Tea & condiments', 'Self-Service tea and condiments standard', true),
  ('self-service-snacks-standard', 'Self-Service Station', 'Snacks', 'Self-Service snacks standard', true),
  ('self-service-water-glassware-standard', 'Self-Service Station', 'Water & glassware', 'Self-Service water & glassware standard', true),
  ('self-service-serviceware-takeaway-standard', 'Self-Service Station', 'Serviceware & takeaway', 'Self-Service serviceware & takeaway standard', true),
  ('self-service-backstock-standard', 'Self-Service Station', 'Backstock / three cabinets', 'Self-Service backstock standard', true)
on conflict (canonical_key) do update
set
  area = excluded.area,
  section = excluded.section,
  label = excluded.label,
  is_visible = excluded.is_visible;

insert into public.visual_standard_aliases (alias_key, canonical_key)
values
  ('self-service-coffee-service-standard', 'self-service-espresso-machine-cups-standard'),
  ('self-service-takeaway-coffee-standard', 'self-service-serviceware-takeaway-standard'),
  ('self-service-glassware-serviceware-standard', 'self-service-water-glassware-standard'),
  ('self-service-food-display-standard', 'self-service-bakery-fruit-display-standard')
on conflict (alias_key) do update
set canonical_key = excluded.canonical_key;

alter table public.visual_standard_versions
  add column asset_role text not null default 'primary';
alter table public.visual_standard_versions
  add column detail_key text;
alter table public.visual_standard_versions
  add column detail_label text;
alter table public.visual_standard_versions
  add column detail_order integer;

alter table public.visual_standard_versions
  add constraint visual_standard_versions_asset_role_check check (
    (
      asset_role = 'primary'
      and detail_key is null
      and detail_label is null
      and detail_order is null
    )
    or
    (
      asset_role = 'detail'
      and detail_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      and nullif(trim(detail_label), '') is not null
      and detail_order >= 0
      and asset_path ~ (
        '^'
        || canonical_key
        || '/details/'
        || detail_key
        || '/[0-9]+-[A-Za-z0-9-]+\.(jpg|jpeg|png|webp|gif|avif)$'
      )
    )
  );

create table public.visual_standard_detail_slots (
  id uuid primary key default gen_random_uuid(),
  visual_standard_id uuid not null,
  canonical_key text not null,
  detail_key text not null
    check (detail_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  label text not null check (nullif(trim(label), '') is not null),
  sort_order integer not null default 0 check (sort_order >= 0),
  active_asset_path text,
  active_version_id uuid references public.visual_standard_versions(id) on delete restrict,
  active_version integer not null default 0 check (active_version >= 0),
  status text not null default 'awaiting_asset'
    check (status in ('awaiting_asset', 'published')),
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_by_name text,
  foreign key (visual_standard_id, canonical_key)
    references public.visual_standards(id, canonical_key) on delete restrict,
  unique (visual_standard_id, detail_key),
  unique (id, canonical_key, detail_key),
  constraint visual_standard_detail_slots_asset_state_check check (
    (
      status = 'awaiting_asset'
      and active_asset_path is null
      and active_version_id is null
      and active_version = 0
    )
    or
    (
      status = 'published'
      and active_asset_path is not null
      and active_asset_path ~ (
        '^'
        || canonical_key
        || '/details/'
        || detail_key
        || '/[0-9]+-[A-Za-z0-9-]+\.(jpg|jpeg|png|webp|gif|avif)$'
      )
      and active_version_id is not null
      and active_version > 0
    )
  )
);

create index visual_standard_detail_slots_visible_idx
  on public.visual_standard_detail_slots (canonical_key, sort_order, detail_key);
create index visual_standard_versions_detail_idx
  on public.visual_standard_versions (canonical_key, detail_key, version desc)
  where asset_role = 'detail';

create trigger visual_standard_detail_slots_set_updated_at
before update on public.visual_standard_detail_slots
for each row execute function public.set_updated_at();

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
cross join (
  values
    ('cabinet-1', 'Cabinet 1', 1),
    ('cabinet-2', 'Cabinet 2', 2),
    ('cabinet-3', 'Cabinet 3', 3)
) as seed(detail_key, label, sort_order)
where standard.canonical_key = 'self-service-backstock-standard'
on conflict (visual_standard_id, detail_key) do update
set
  label = excluded.label,
  sort_order = excluded.sort_order;

alter table public.visual_standard_aliases enable row level security;
alter table public.visual_standard_detail_slots enable row level security;

revoke all on table public.visual_standard_aliases from anon, authenticated;
revoke all on table public.visual_standard_detail_slots from anon, authenticated;
grant select on table public.visual_standard_aliases to anon, authenticated;
grant select on table public.visual_standard_detail_slots to anon, authenticated;
grant select, insert, update, delete on table public.visual_standard_aliases to service_role;
grant select, insert, update, delete on table public.visual_standard_detail_slots to service_role;

create policy "visual_standard_aliases_read"
on public.visual_standard_aliases
for select
to anon, authenticated
using (true);

create policy "visual_standard_details_read_published_anon"
on public.visual_standard_detail_slots
for select
to anon
using (status = 'published' and active_asset_path is not null);

create policy "visual_standard_details_read_active_staff_or_manager"
on public.visual_standard_detail_slots
for select
to authenticated
using (
  (public.current_user_is_active() and status = 'published' and active_asset_path is not null)
  or public.current_user_is_manager()
);

drop policy "visual_standards_read_published_anon" on public.visual_standards;
create policy "visual_standards_read_published_anon"
on public.visual_standards
for select
to anon
using (
  is_visible
  and status = 'published'
  and active_asset_path is not null
);

drop policy "visual_standards_read_active_staff_or_manager" on public.visual_standards;
create policy "visual_standards_read_active_staff_or_manager"
on public.visual_standards
for select
to authenticated
using (
  (
    public.current_user_is_active()
    and is_visible
    and status = 'published'
    and active_asset_path is not null
  )
  or public.current_user_is_manager()
);

drop policy "visual_standard_assets_insert_manager" on storage.objects;
create policy "visual_standard_assets_insert_manager"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'visual-standards'
  and public.current_user_is_manager()
  and owner_id = auth.uid()::text
  and exists (
    select 1
    from public.visual_standards standard
    where standard.is_visible
      and (
        storage.objects.name ~ (
          '^'
          || standard.canonical_key
          || '/[0-9]+-[A-Za-z0-9-]+\.(jpg|jpeg|png|webp|gif|avif)$'
        )
        or storage.objects.name ~ (
          '^'
          || standard.canonical_key
          || '/details/[a-z0-9]+(?:-[a-z0-9]+)*/[0-9]+-[A-Za-z0-9-]+\.(jpg|jpeg|png|webp|gif|avif)$'
        )
      )
  )
);

create or replace function public.publish_visual_standard_detail(
  input_canonical_key text,
  input_detail_key text,
  input_label text,
  input_sort_order integer,
  input_asset_path text,
  input_mime_type text,
  input_byte_size bigint,
  input_notes text default null
)
returns public.visual_standard_detail_slots
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_standard public.visual_standards;
  v_detail public.visual_standard_detail_slots;
  v_next_version integer;
  v_version_id uuid;
  v_actor_name text;
  v_object_metadata jsonb;
  v_mime_type text;
  v_byte_size bigint;
begin
  if auth.uid() is null or not public.current_user_is_manager() then
    raise exception 'Manager access required to publish a Visual Standard detail.';
  end if;

  if input_canonical_key is null
     or input_canonical_key !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'A valid canonical Visual Standard key is required.';
  end if;
  if input_detail_key is null
     or input_detail_key !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'A valid Visual Standard detail key is required.';
  end if;
  if nullif(trim(coalesce(input_label, '')), '') is null
     or input_sort_order is null
     or input_sort_order < 0 then
    raise exception 'A detail label and non-negative order are required.';
  end if;

  select standard.*
  into v_standard
  from public.visual_standards standard
  where standard.canonical_key = input_canonical_key
    and standard.is_visible
  for update;

  if not found then
    raise exception 'Unknown canonical Visual Standard: %', input_canonical_key;
  end if;

  if input_asset_path is null
     or input_asset_path !~ (
       '^'
       || v_standard.canonical_key
       || '/details/'
       || input_detail_key
       || '/[0-9]+-[A-Za-z0-9-]+\.(jpg|jpeg|png|webp|gif|avif)$'
     ) then
    raise exception 'Detail asset path must be immutable and remain inside its canonical detail namespace.';
  end if;

  select object.metadata
  into v_object_metadata
  from storage.objects object
  where object.bucket_id = 'visual-standards'
    and object.name = input_asset_path
    and object.owner_id = auth.uid()::text
  limit 1;

  if not found then
    raise exception 'Uploaded Visual Standard detail asset was not found or is not owned by the current manager.';
  end if;

  v_mime_type := nullif(v_object_metadata ->> 'mimetype', '');
  v_byte_size := nullif(v_object_metadata ->> 'size', '')::bigint;
  if v_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif') then
    raise exception 'Unsupported Visual Standard image type.';
  end if;
  if v_byte_size is null or v_byte_size <= 0 or v_byte_size > 15728640 then
    raise exception 'Visual Standard image size is invalid.';
  end if;

  insert into public.visual_standard_detail_slots (
    visual_standard_id,
    canonical_key,
    detail_key,
    label,
    sort_order
  )
  values (
    v_standard.id,
    v_standard.canonical_key,
    input_detail_key,
    trim(input_label),
    input_sort_order
  )
  on conflict (visual_standard_id, detail_key) do update
  set
    label = excluded.label,
    sort_order = excluded.sort_order
  returning * into v_detail;

  select coalesce(max(version.version), 0) + 1
  into v_next_version
  from public.visual_standard_versions version
  where version.visual_standard_id = v_standard.id;

  select profile.display_name
  into v_actor_name
  from public.user_profiles profile
  where profile.id = auth.uid()
  limit 1;

  insert into public.visual_standard_versions (
    visual_standard_id,
    canonical_key,
    version,
    asset_path,
    mime_type,
    byte_size,
    notes,
    created_by,
    created_by_name,
    asset_role,
    detail_key,
    detail_label,
    detail_order
  )
  values (
    v_standard.id,
    v_standard.canonical_key,
    v_next_version,
    input_asset_path,
    v_mime_type,
    v_byte_size,
    nullif(trim(coalesce(input_notes, '')), ''),
    auth.uid(),
    v_actor_name,
    'detail',
    input_detail_key,
    trim(input_label),
    input_sort_order
  )
  returning id into v_version_id;

  update public.visual_standard_detail_slots
  set
    label = trim(input_label),
    sort_order = input_sort_order,
    active_asset_path = input_asset_path,
    active_version_id = v_version_id,
    active_version = v_next_version,
    status = 'published',
    notes = nullif(trim(coalesce(input_notes, '')), ''),
    updated_by = auth.uid(),
    updated_by_name = v_actor_name
  where id = v_detail.id
  returning * into v_detail;

  return v_detail;
end;
$$;

create or replace function public.restore_visual_standard_version(
  input_canonical_key text,
  input_version_id uuid,
  input_notes text default null
)
returns public.visual_standards
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_standard public.visual_standards;
  v_source public.visual_standard_versions;
  v_next_version integer;
  v_version_id uuid;
  v_actor_name text;
begin
  if auth.uid() is null or not public.current_user_is_manager() then
    raise exception 'Manager access required to restore a Visual Standard.';
  end if;

  select standard.*
  into v_standard
  from public.visual_standards standard
  where standard.canonical_key = input_canonical_key
    and standard.is_visible
  for update;

  if not found then
    raise exception 'Unknown canonical Visual Standard: %', input_canonical_key;
  end if;

  select version.*
  into v_source
  from public.visual_standard_versions version
  where version.id = input_version_id
    and version.visual_standard_id = v_standard.id
    and version.asset_role = 'primary';

  if not found then
    raise exception 'The requested primary version does not belong to this canonical Visual Standard.';
  end if;

  if v_source.asset_path !~ (
    '^'
    || v_standard.canonical_key
    || '/[0-9]+-[A-Za-z0-9-]+\.(jpg|jpeg|png|webp|gif|avif)$'
  ) then
    raise exception 'The retained asset path is outside the canonical namespace.';
  end if;

  if not exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'visual-standards'
      and object.name = v_source.asset_path
  ) then
    raise exception 'The retained asset for this version is missing.';
  end if;

  select coalesce(max(version.version), 0) + 1
  into v_next_version
  from public.visual_standard_versions version
  where version.visual_standard_id = v_standard.id;

  select profile.display_name
  into v_actor_name
  from public.user_profiles profile
  where profile.id = auth.uid()
  limit 1;

  insert into public.visual_standard_versions (
    visual_standard_id,
    canonical_key,
    version,
    asset_path,
    mime_type,
    byte_size,
    notes,
    created_by,
    created_by_name,
    restored_from_version_id
  )
  values (
    v_standard.id,
    v_standard.canonical_key,
    v_next_version,
    v_source.asset_path,
    v_source.mime_type,
    v_source.byte_size,
    coalesce(
      nullif(trim(coalesce(input_notes, '')), ''),
      'Restored from version ' || v_source.version
    ),
    auth.uid(),
    v_actor_name,
    v_source.id
  )
  returning id into v_version_id;

  update public.visual_standards
  set
    active_asset_path = v_source.asset_path,
    active_version_id = v_version_id,
    active_version = v_next_version,
    status = 'published',
    notes = coalesce(
      nullif(trim(coalesce(input_notes, '')), ''),
      'Restored from version ' || v_source.version
    ),
    updated_by = auth.uid(),
    updated_by_name = v_actor_name
  where id = v_standard.id
  returning * into v_standard;

  return v_standard;
end;
$$;

create or replace function public.restore_visual_standard_detail_version(
  input_canonical_key text,
  input_detail_key text,
  input_version_id uuid,
  input_notes text default null
)
returns public.visual_standard_detail_slots
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_standard public.visual_standards;
  v_detail public.visual_standard_detail_slots;
  v_source public.visual_standard_versions;
  v_next_version integer;
  v_version_id uuid;
  v_actor_name text;
begin
  if auth.uid() is null or not public.current_user_is_manager() then
    raise exception 'Manager access required to restore a Visual Standard detail.';
  end if;

  select standard.*
  into v_standard
  from public.visual_standards standard
  where standard.canonical_key = input_canonical_key
    and standard.is_visible
  for update;

  if not found then
    raise exception 'Unknown canonical Visual Standard: %', input_canonical_key;
  end if;

  select detail.*
  into v_detail
  from public.visual_standard_detail_slots detail
  where detail.visual_standard_id = v_standard.id
    and detail.detail_key = input_detail_key
  for update;

  if not found then
    raise exception 'Unknown Visual Standard detail: %', input_detail_key;
  end if;

  select version.*
  into v_source
  from public.visual_standard_versions version
  where version.id = input_version_id
    and version.visual_standard_id = v_standard.id
    and version.asset_role = 'detail'
    and version.detail_key = input_detail_key;

  if not found then
    raise exception 'The requested detail version does not belong to this Visual Standard detail.';
  end if;

  if not exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'visual-standards'
      and object.name = v_source.asset_path
  ) then
    raise exception 'The retained asset for this detail version is missing.';
  end if;

  select coalesce(max(version.version), 0) + 1
  into v_next_version
  from public.visual_standard_versions version
  where version.visual_standard_id = v_standard.id;

  select profile.display_name
  into v_actor_name
  from public.user_profiles profile
  where profile.id = auth.uid()
  limit 1;

  insert into public.visual_standard_versions (
    visual_standard_id,
    canonical_key,
    version,
    asset_path,
    mime_type,
    byte_size,
    notes,
    created_by,
    created_by_name,
    restored_from_version_id,
    asset_role,
    detail_key,
    detail_label,
    detail_order
  )
  values (
    v_standard.id,
    v_standard.canonical_key,
    v_next_version,
    v_source.asset_path,
    v_source.mime_type,
    v_source.byte_size,
    coalesce(
      nullif(trim(coalesce(input_notes, '')), ''),
      'Restored from version ' || v_source.version
    ),
    auth.uid(),
    v_actor_name,
    v_source.id,
    'detail',
    input_detail_key,
    v_source.detail_label,
    v_source.detail_order
  )
  returning id into v_version_id;

  update public.visual_standard_detail_slots
  set
    label = v_source.detail_label,
    sort_order = v_source.detail_order,
    active_asset_path = v_source.asset_path,
    active_version_id = v_version_id,
    active_version = v_next_version,
    status = 'published',
    notes = coalesce(
      nullif(trim(coalesce(input_notes, '')), ''),
      'Restored from version ' || v_source.version
    ),
    updated_by = auth.uid(),
    updated_by_name = v_actor_name
  where id = v_detail.id
  returning * into v_detail;

  return v_detail;
end;
$$;

revoke all on function public.publish_visual_standard_detail(text, text, text, integer, text, text, bigint, text) from public, anon;
revoke all on function public.restore_visual_standard_detail_version(text, text, uuid, text) from public, anon;
grant execute on function public.publish_visual_standard_detail(text, text, text, integer, text, text, bigint, text) to authenticated;
grant execute on function public.restore_visual_standard_detail_version(text, text, uuid, text) to authenticated;

-- Canonical Visual Standards
--
-- Assets are uploaded under a versioned object path first. They do not become
-- live until publish_visual_standard atomically inserts the history row and
-- switches the active pointer for an existing canonical key.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'visual-standards',
  'visual-standards',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.visual_standards (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique
    check (canonical_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  area text not null,
  section text not null,
  label text not null,
  active_asset_path text,
  active_version integer not null default 0 check (active_version >= 0),
  status text not null default 'awaiting_asset'
    check (status in ('awaiting_asset', 'published')),
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_by_name text,
  unique (id, canonical_key)
);

create table if not exists public.visual_standard_versions (
  id uuid primary key default gen_random_uuid(),
  visual_standard_id uuid not null,
  canonical_key text not null,
  version integer not null check (version > 0),
  asset_path text not null check (asset_path like canonical_key || '/%'),
  mime_type text not null check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif')
  ),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 15728640),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  created_by_name text,
  restored_from_version_id uuid references public.visual_standard_versions(id) on delete restrict,
  foreign key (visual_standard_id, canonical_key)
    references public.visual_standards(id, canonical_key) on delete restrict,
  unique (visual_standard_id, version)
);

alter table public.visual_standards
  add column if not exists active_version_id uuid
  references public.visual_standard_versions(id) on delete restrict;

alter table public.visual_standards
  add constraint visual_standards_asset_state_check check (
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
      and active_asset_path like canonical_key || '/%'
      and active_version_id is not null
      and active_version > 0
    )
  );

create index if not exists visual_standard_versions_key_version_idx
  on public.visual_standard_versions (canonical_key, version desc);
create index if not exists visual_standard_versions_asset_path_idx
  on public.visual_standard_versions (asset_path);
create index if not exists visual_standards_status_idx
  on public.visual_standards (status, canonical_key);

drop trigger if exists visual_standards_set_updated_at on public.visual_standards;
create trigger visual_standards_set_updated_at
before update on public.visual_standards
for each row execute function public.set_updated_at();

insert into public.visual_standards (canonical_key, area, section, label)
values
  ('workbar-bar-milk-fridge-standard', 'Workbar', 'Fridges', 'Workbar Bar milk-fridge standard'),
  ('workbar-non-alco-fridge-standard', 'Workbar', 'Fridges', 'Workbar non-alcoholic fridge standard'),
  ('self-service-station-overview-standard', 'Self-Service Station', 'Overview', 'Self-Service Station overview standard'),
  ('self-service-coffee-service-standard', 'Self-Service Station', 'Coffee service', 'Self-Service coffee service standard'),
  ('self-service-takeaway-coffee-standard', 'Self-Service Station', 'Takeaway coffee', 'Self-Service takeaway coffee standard'),
  ('self-service-tea-condiments-standard', 'Self-Service Station', 'Tea & condiments', 'Self-Service tea and condiments standard'),
  ('self-service-glassware-serviceware-standard', 'Self-Service Station', 'Glassware & serviceware', 'Self-Service glassware and serviceware standard'),
  ('self-service-snacks-standard', 'Self-Service Station', 'Snacks', 'Self-Service snacks standard'),
  ('self-service-food-display-standard', 'Self-Service Station', 'Food display', 'Self-Service food display standard'),
  ('self-service-backstock-standard', 'Self-Service Station', 'Backstock / refill', 'Self-Service backstock standard')
on conflict (canonical_key) do update
set
  area = excluded.area,
  section = excluded.section,
  label = excluded.label;

alter table public.visual_standards enable row level security;
alter table public.visual_standard_versions enable row level security;

revoke all on table public.visual_standards from anon, authenticated;
revoke all on table public.visual_standard_versions from anon, authenticated;
grant select on table public.visual_standards to anon, authenticated;
grant select on table public.visual_standard_versions to authenticated;
grant select, insert, update, delete on table public.visual_standards to service_role;
grant select, insert, update, delete on table public.visual_standard_versions to service_role;

drop policy if exists "visual_standards_read_published_anon" on public.visual_standards;
create policy "visual_standards_read_published_anon"
on public.visual_standards
for select
to anon
using (status = 'published' and active_asset_path is not null);

drop policy if exists "visual_standards_read_active_staff_or_manager" on public.visual_standards;
create policy "visual_standards_read_active_staff_or_manager"
on public.visual_standards
for select
to authenticated
using (
  (public.current_user_is_active() and status = 'published' and active_asset_path is not null)
  or public.current_user_is_manager()
);

drop policy if exists "visual_standard_versions_read_manager" on public.visual_standard_versions;
create policy "visual_standard_versions_read_manager"
on public.visual_standard_versions
for select
to authenticated
using (public.current_user_is_manager());

drop policy if exists "visual_standard_assets_insert_manager" on storage.objects;
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
    where storage.objects.name ~ (
      '^'
      || standard.canonical_key
      || '/[0-9]+-[A-Za-z0-9-]+\.(jpg|jpeg|png|webp|gif|avif)$'
    )
  )
);

drop policy if exists "visual_standard_assets_select_manager" on storage.objects;
create policy "visual_standard_assets_select_manager"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'visual-standards'
  and public.current_user_is_manager()
);

drop policy if exists "visual_standard_orphans_delete_manager" on storage.objects;
create policy "visual_standard_orphans_delete_manager"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'visual-standards'
  and public.current_user_is_manager()
  and not exists (
    select 1
    from public.visual_standard_versions version
    where version.asset_path = storage.objects.name
  )
);

create or replace function public.publish_visual_standard(
  input_canonical_key text,
  input_asset_path text,
  input_mime_type text,
  input_byte_size bigint,
  input_notes text default null
)
returns public.visual_standards
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_standard public.visual_standards;
  v_next_version integer;
  v_version_id uuid;
  v_actor_name text;
  v_object_metadata jsonb;
  v_mime_type text;
  v_byte_size bigint;
begin
  if auth.uid() is null or not public.current_user_is_manager() then
    raise exception 'Manager access required to publish a Visual Standard.';
  end if;

  if input_canonical_key is null
     or input_canonical_key !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'A valid canonical Visual Standard key is required.';
  end if;

  select standard.*
  into v_standard
  from public.visual_standards standard
  where standard.canonical_key = input_canonical_key
  for update;

  if not found then
    raise exception 'Unknown canonical Visual Standard: %', input_canonical_key;
  end if;

  if input_asset_path is null
     or input_asset_path !~ (
       '^'
       || v_standard.canonical_key
       || '/[0-9]+-[A-Za-z0-9-]+\.(jpg|jpeg|png|webp|gif|avif)$'
     ) then
    raise exception 'Asset path must be an immutable versioned object under its canonical key.';
  end if;

  select object.metadata
  into v_object_metadata
  from storage.objects object
  where object.bucket_id = 'visual-standards'
    and object.name = input_asset_path
    and object.owner_id = auth.uid()::text
  limit 1;

  if not found then
    raise exception 'Uploaded Visual Standard asset was not found or is not owned by the current manager.';
  end if;

  v_mime_type := nullif(v_object_metadata ->> 'mimetype', '');
  v_byte_size := nullif(v_object_metadata ->> 'size', '')::bigint;

  if v_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif') then
    raise exception 'Unsupported Visual Standard image type.';
  end if;
  if v_byte_size is null or v_byte_size <= 0 or v_byte_size > 15728640 then
    raise exception 'Visual Standard image size is invalid.';
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
    created_by_name
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
    v_actor_name
  )
  returning id into v_version_id;

  update public.visual_standards
  set
    active_asset_path = input_asset_path,
    active_version_id = v_version_id,
    active_version = v_next_version,
    status = 'published',
    notes = nullif(trim(coalesce(input_notes, '')), ''),
    updated_by = auth.uid(),
    updated_by_name = v_actor_name
  where id = v_standard.id
  returning * into v_standard;

  return v_standard;
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

  if input_canonical_key is null
     or input_canonical_key !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'A valid canonical Visual Standard key is required.';
  end if;

  select standard.*
  into v_standard
  from public.visual_standards standard
  where standard.canonical_key = input_canonical_key
  for update;

  if not found then
    raise exception 'Unknown canonical Visual Standard: %', input_canonical_key;
  end if;

  select version.*
  into v_source
  from public.visual_standard_versions version
  where version.id = input_version_id
    and version.visual_standard_id = v_standard.id;

  if not found then
    raise exception 'The requested version does not belong to this canonical Visual Standard.';
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

revoke all on function public.publish_visual_standard(text, text, text, bigint, text) from public, anon;
revoke all on function public.restore_visual_standard_version(text, uuid, text) from public, anon;
grant execute on function public.publish_visual_standard(text, text, text, bigint, text) to authenticated;
grant execute on function public.restore_visual_standard_version(text, uuid, text) to authenticated;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create schema storage;

grant usage on schema public, auth, storage to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  email text
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name text not null,
  owner_id text,
  metadata jsonb,
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated, service_role;

create table public.user_profiles (
  id uuid primary key references auth.users(id),
  display_name text not null,
  role text not null,
  active boolean not null default true
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_user_is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles profile
    where profile.id = auth.uid()
      and profile.active
      and profile.role = 'manager'
  );
$$;

create or replace function public.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles profile
    where profile.id = auth.uid()
      and profile.active
  );
$$;

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000001', 'manager@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'staff@example.test');

insert into public.user_profiles (id, display_name, role)
values
  ('00000000-0000-0000-0000-000000000001', 'Test Manager', 'manager'),
  ('00000000-0000-0000-0000-000000000002', 'Test Staff', 'staff');

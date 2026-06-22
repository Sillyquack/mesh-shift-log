-- Mesh Shift Log Supabase Phase 1/2/3C schema.
-- Phase 3C prepares authenticated-only alert backend access.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamptz default now()
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  local_id text,
  alert_date date not null default current_date,
  created_at timestamptz default now(),
  created_by text not null,
  category text not null,
  severity text not null,
  area text not null,
  message text not null,
  needs_immediate_help boolean default false,
  status text not null default 'open',
  acknowledged_by text,
  acknowledged_at timestamptz,
  resolved_by text,
  resolved_at timestamptz,
  created_by_auth_user_id uuid references auth.users(id),
  acknowledged_by_auth_user_id uuid references auth.users(id),
  resolved_by_auth_user_id uuid references auth.users(id),
  last_updated_by_auth_user_id uuid references auth.users(id),
  manager_note text,
  email_notification_status text default 'not_required',
  email_notification_attempted_at timestamptz,
  email_notification_error text,
  updated_at timestamptz default now()
);

-- Phase 3A/3B: Supabase Auth profile foundation and role-aware policy prep.
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id),
  display_name text not null,
  role text not null default 'staff',
  active boolean not null default true,
  staff_code_alias text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint user_profiles_role_check check (role in ('manager', 'shift_lead', 'event_floor_manager', 'staff', 'time2staff'))
);

alter table public.alerts add column if not exists email_notification_status text default 'not_required';
alter table public.alerts add column if not exists email_notification_attempted_at timestamptz;
alter table public.alerts add column if not exists email_notification_error text;
alter table public.alerts add column if not exists created_by_auth_user_id uuid references auth.users(id);
alter table public.alerts add column if not exists acknowledged_by_auth_user_id uuid references auth.users(id);
alter table public.alerts add column if not exists resolved_by_auth_user_id uuid references auth.users(id);
alter table public.alerts add column if not exists last_updated_by_auth_user_id uuid references auth.users(id);

create index if not exists alerts_organization_id_idx on public.alerts (organization_id);
create index if not exists alerts_alert_date_idx on public.alerts (alert_date);
create index if not exists alerts_status_idx on public.alerts (status);
create index if not exists alerts_severity_idx on public.alerts (severity);
create index if not exists alerts_created_at_idx on public.alerts (created_at);
create index if not exists alerts_created_by_auth_user_id_idx on public.alerts (created_by_auth_user_id);
create index if not exists alerts_last_updated_by_auth_user_id_idx on public.alerts (last_updated_by_auth_user_id);
create unique index if not exists alerts_organization_local_id_idx on public.alerts (organization_id, local_id) where local_id is not null;
create index if not exists user_profiles_organization_id_idx on public.user_profiles (organization_id);
create index if not exists user_profiles_role_idx on public.user_profiles (role);
create index if not exists user_profiles_active_idx on public.user_profiles (active);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace function public.current_user_profile_role()
returns text
security definer
set search_path = public
as $$
  select role
  from public.user_profiles
  where id = auth.uid()
    and active = true
  limit 1;
$$ language sql stable;

create or replace function public.current_user_organization_id()
returns uuid
security definer
set search_path = public
as $$
  select organization_id
  from public.user_profiles
  where id = auth.uid()
    and active = true
  limit 1;
$$ language sql stable;

create or replace function public.current_user_is_active()
returns boolean
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
  );
$$ language sql stable;

create or replace function public.current_user_is_manager()
returns boolean
security definer
set search_path = public
as $$
  select public.current_user_profile_role() = 'manager';
$$ language sql stable;

drop trigger if exists alerts_set_updated_at on public.alerts;
create trigger alerts_set_updated_at
before update on public.alerts
for each row
execute function public.set_updated_at();

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

alter table public.organizations enable row level security;
alter table public.alerts enable row level security;
alter table public.user_profiles enable row level security;

grant select on public.user_profiles to authenticated;
grant update on public.user_profiles to authenticated;
grant select, insert, update on public.alerts to authenticated;
grant select on public.organizations to authenticated;

-- Legacy pilot anon policies.
-- The Phase 3C lockdown section near the end of this file removes anon alert table access.
drop policy if exists "pilot anon can read organizations" on public.organizations;
create policy "pilot anon can read organizations"
on public.organizations for select
to anon
using (true);

drop policy if exists "authenticated users can read organizations" on public.organizations;
create policy "authenticated users can read organizations"
on public.organizations for select
to authenticated
using (true);

drop policy if exists "pilot anon can read alerts" on public.alerts;
create policy "pilot anon can read alerts"
on public.alerts for select
to anon
using (true);

drop policy if exists "pilot anon can insert alerts" on public.alerts;
create policy "pilot anon can insert alerts"
on public.alerts for insert
to anon
with check (true);

drop policy if exists "pilot anon can update alerts" on public.alerts;
create policy "pilot anon can update alerts"
on public.alerts for update
to anon
using (true)
with check (true);

drop policy if exists "authenticated active users can read alerts" on public.alerts;
create policy "authenticated active users can read alerts"
on public.alerts for select
to authenticated
using (
  public.current_user_is_active()
  and (
    organization_id is null
    or public.current_user_organization_id() is null
    or organization_id = public.current_user_organization_id()
  )
);

drop policy if exists "authenticated active users can insert alerts" on public.alerts;
create policy "authenticated active users can insert alerts"
on public.alerts for insert
to authenticated
with check (
  public.current_user_profile_role() in ('manager', 'shift_lead', 'event_floor_manager', 'staff', 'time2staff')
  and (
    organization_id is null
    or public.current_user_organization_id() is null
    or organization_id = public.current_user_organization_id()
  )
);

drop policy if exists "authenticated managers can update alerts" on public.alerts;
create policy "authenticated managers can update alerts"
on public.alerts for update
to authenticated
using (
  public.current_user_is_manager()
  and (
    organization_id is null
    or public.current_user_organization_id() is null
    or organization_id = public.current_user_organization_id()
  )
)
with check (
  public.current_user_is_manager()
  and (
    organization_id is null
    or public.current_user_organization_id() is null
    or organization_id = public.current_user_organization_id()
  )
);

drop policy if exists "authenticated creators can update own alerts" on public.alerts;
create policy "authenticated creators can update own alerts"
on public.alerts for update
to authenticated
using (
  public.current_user_is_active()
  and created_by_auth_user_id = auth.uid()
  and status = 'open'
  and (
    organization_id is null
    or public.current_user_organization_id() is null
    or organization_id = public.current_user_organization_id()
  )
)
with check (
  public.current_user_is_active()
  and created_by_auth_user_id = auth.uid()
  and (
    organization_id is null
    or public.current_user_organization_id() is null
    or organization_id = public.current_user_organization_id()
  )
);

drop policy if exists "authenticated users can read own profile" on public.user_profiles;
create policy "authenticated users can read own profile"
on public.user_profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "pilot managers can read profiles" on public.user_profiles;
create policy "pilot managers can read profiles"
on public.user_profiles for select
to authenticated
using (public.current_user_is_manager());

drop policy if exists "pilot managers can update profiles" on public.user_profiles;
create policy "pilot managers can update profiles"
on public.user_profiles for update
to authenticated
using (public.current_user_is_manager())
with check (public.current_user_is_manager());

-- Phase 3C authenticated backend lockdown.
-- Running this section means staff-code users no longer sync alerts to Supabase.
-- Staff-code mode still works locally through localStorage, but backend reads/writes require Email login.
drop policy if exists "pilot anon can read alerts" on public.alerts;
drop policy if exists "pilot anon can insert alerts" on public.alerts;
drop policy if exists "pilot anon can update alerts" on public.alerts;
revoke select, insert, update on public.alerts from anon;

-- Rollback snippet for emergency pilot fallback only:
-- grant select, insert, update on public.alerts to anon;
-- create policy "pilot anon can read alerts"
-- on public.alerts for select
-- to anon
-- using (true);
-- create policy "pilot anon can insert alerts"
-- on public.alerts for insert
-- to anon
-- with check (true);
-- create policy "pilot anon can update alerts"
-- on public.alerts for update
-- to anon
-- using (true)
-- with check (true);

-- Organization transition notes:
-- Current pilot profiles and alerts may have organization_id = null.
-- Phase 3C policies intentionally allow null organization_id so existing pilot rows remain visible.
-- Later, create a Mesh Youngstorget organization row, set user_profiles.organization_id,
-- backfill alerts.organization_id, then tighten policies to organization-only.

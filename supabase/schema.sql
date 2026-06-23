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

-- Phase 4A: shift/checklist backend foundation.
create table if not exists public.shift_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  local_id text,
  shift_date date not null,
  shift_key text not null,
  shift_label text,
  started_at timestamptz default now(),
  finished_at timestamptz,
  user_profile_id uuid references public.user_profiles(id),
  auth_user_id uuid references auth.users(id),
  display_name text not null,
  role text,
  login_source text,
  status text not null default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.task_completions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  local_id text,
  shift_session_id uuid references public.shift_sessions(id) on delete set null,
  shift_date date not null,
  shift_key text not null,
  routine_key text,
  section_key text,
  task_id text not null,
  task_title text,
  status text not null,
  completed_at timestamptz,
  completed_by_profile_id uuid references public.user_profiles(id),
  completed_by_auth_user_id uuid references auth.users(id),
  completed_by_name text,
  input_values jsonb default '{}'::jsonb,
  critical_confirmed boolean default false,
  not_relevant_reason text,
  sync_status text default 'synced',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.handover_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  local_id text,
  shift_session_id uuid references public.shift_sessions(id) on delete set null,
  note_date date not null,
  shift_key text,
  note_text text not null,
  created_by_profile_id uuid references public.user_profiles(id),
  created_by_auth_user_id uuid references auth.users(id),
  created_by_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
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
create index if not exists shift_sessions_shift_date_idx on public.shift_sessions (shift_date);
create index if not exists shift_sessions_shift_key_idx on public.shift_sessions (shift_key);
create index if not exists shift_sessions_auth_user_id_idx on public.shift_sessions (auth_user_id);
create index if not exists shift_sessions_user_profile_id_idx on public.shift_sessions (user_profile_id);
create index if not exists shift_sessions_organization_id_idx on public.shift_sessions (organization_id);
create unique index if not exists shift_sessions_local_id_idx on public.shift_sessions (local_id) where local_id is not null;
create index if not exists task_completions_shift_date_idx on public.task_completions (shift_date);
create index if not exists task_completions_shift_key_idx on public.task_completions (shift_key);
create index if not exists task_completions_task_id_idx on public.task_completions (task_id);
create index if not exists task_completions_completed_by_auth_user_id_idx on public.task_completions (completed_by_auth_user_id);
create index if not exists task_completions_organization_id_idx on public.task_completions (organization_id);
create unique index if not exists task_completions_local_id_idx on public.task_completions (local_id) where local_id is not null;
create index if not exists handover_notes_note_date_idx on public.handover_notes (note_date);
create index if not exists handover_notes_shift_key_idx on public.handover_notes (shift_key);
create index if not exists handover_notes_created_by_auth_user_id_idx on public.handover_notes (created_by_auth_user_id);
create index if not exists handover_notes_organization_id_idx on public.handover_notes (organization_id);
create unique index if not exists handover_notes_local_id_idx on public.handover_notes (local_id) where local_id is not null;

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

drop trigger if exists shift_sessions_set_updated_at on public.shift_sessions;
create trigger shift_sessions_set_updated_at
before update on public.shift_sessions
for each row
execute function public.set_updated_at();

drop trigger if exists task_completions_set_updated_at on public.task_completions;
create trigger task_completions_set_updated_at
before update on public.task_completions
for each row
execute function public.set_updated_at();

drop trigger if exists handover_notes_set_updated_at on public.handover_notes;
create trigger handover_notes_set_updated_at
before update on public.handover_notes
for each row
execute function public.set_updated_at();

alter table public.organizations enable row level security;
alter table public.alerts enable row level security;
alter table public.user_profiles enable row level security;
alter table public.shift_sessions enable row level security;
alter table public.task_completions enable row level security;
alter table public.handover_notes enable row level security;

grant select on public.user_profiles to authenticated;
grant update on public.user_profiles to authenticated;
grant select, insert, update on public.alerts to authenticated;
grant select, insert, update on public.shift_sessions to authenticated;
grant select, insert, update on public.task_completions to authenticated;
grant select, insert, update on public.handover_notes to authenticated;
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

drop policy if exists "authenticated active users can read shift sessions" on public.shift_sessions;
create policy "authenticated active users can read shift sessions"
on public.shift_sessions for select
to authenticated
using (
  public.current_user_is_active()
  and (
    organization_id is null
    or public.current_user_organization_id() is null
    or organization_id = public.current_user_organization_id()
  )
);

drop policy if exists "authenticated users can insert own shift sessions" on public.shift_sessions;
create policy "authenticated users can insert own shift sessions"
on public.shift_sessions for insert
to authenticated
with check (
  public.current_user_is_active()
  and auth_user_id = auth.uid()
  and (
    organization_id is null
    or public.current_user_organization_id() is null
    or organization_id = public.current_user_organization_id()
  )
);

drop policy if exists "authenticated users can update own shift sessions" on public.shift_sessions;
create policy "authenticated users can update own shift sessions"
on public.shift_sessions for update
to authenticated
using (
  public.current_user_is_active()
  and (auth_user_id = auth.uid() or public.current_user_is_manager())
  and (
    organization_id is null
    or public.current_user_organization_id() is null
    or organization_id = public.current_user_organization_id()
  )
)
with check (
  public.current_user_is_active()
  and (auth_user_id = auth.uid() or public.current_user_is_manager())
  and (
    organization_id is null
    or public.current_user_organization_id() is null
    or organization_id = public.current_user_organization_id()
  )
);

drop policy if exists "authenticated active users can read task completions" on public.task_completions;
create policy "authenticated active users can read task completions"
on public.task_completions for select
to authenticated
using (
  public.current_user_is_active()
  and (
    organization_id is null
    or public.current_user_organization_id() is null
    or organization_id = public.current_user_organization_id()
  )
);

drop policy if exists "authenticated users can insert own task completions" on public.task_completions;
create policy "authenticated users can insert own task completions"
on public.task_completions for insert
to authenticated
with check (
  public.current_user_is_active()
  and completed_by_auth_user_id = auth.uid()
  and (
    organization_id is null
    or public.current_user_organization_id() is null
    or organization_id = public.current_user_organization_id()
  )
);

drop policy if exists "authenticated users can update own task completions" on public.task_completions;
create policy "authenticated users can update own task completions"
on public.task_completions for update
to authenticated
using (
  public.current_user_is_active()
  and (completed_by_auth_user_id = auth.uid() or public.current_user_is_manager())
  and (
    organization_id is null
    or public.current_user_organization_id() is null
    or organization_id = public.current_user_organization_id()
  )
)
with check (
  public.current_user_is_active()
  and (completed_by_auth_user_id = auth.uid() or public.current_user_is_manager())
  and (
    organization_id is null
    or public.current_user_organization_id() is null
    or organization_id = public.current_user_organization_id()
  )
);

drop policy if exists "authenticated active users can read handover notes" on public.handover_notes;
create policy "authenticated active users can read handover notes"
on public.handover_notes for select
to authenticated
using (
  public.current_user_is_active()
  and (
    organization_id is null
    or public.current_user_organization_id() is null
    or organization_id = public.current_user_organization_id()
  )
);

drop policy if exists "authenticated users can insert own handover notes" on public.handover_notes;
create policy "authenticated users can insert own handover notes"
on public.handover_notes for insert
to authenticated
with check (
  public.current_user_is_active()
  and created_by_auth_user_id = auth.uid()
  and (
    organization_id is null
    or public.current_user_organization_id() is null
    or organization_id = public.current_user_organization_id()
  )
);

drop policy if exists "authenticated users can update own handover notes" on public.handover_notes;
create policy "authenticated users can update own handover notes"
on public.handover_notes for update
to authenticated
using (
  public.current_user_is_active()
  and (created_by_auth_user_id = auth.uid() or public.current_user_is_manager())
  and (
    organization_id is null
    or public.current_user_organization_id() is null
    or organization_id = public.current_user_organization_id()
  )
)
with check (
  public.current_user_is_active()
  and (created_by_auth_user_id = auth.uid() or public.current_user_is_manager())
  and (
    organization_id is null
    or public.current_user_organization_id() is null
    or organization_id = public.current_user_organization_id()
  )
);

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

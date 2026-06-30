-- Phase 7A: Workbar Device Auth / Time2Staff Backend Sync
--
-- Purpose:
-- A shared Workbar iPad/Mac Supabase Auth account can sync normal operational
-- records while Mesh Shift Log still records the actual person working.
--
-- Manual setup after running this migration:
-- 1. Create a Supabase Auth user for myworkbar@meshcommunity.com or a dedicated
--    workbar-device email.
-- 2. Add or update the matching public.user_profiles row for that auth user.
-- 3. Set active = true.
-- 4. Set role = 'staff' or an equivalent non-manager role.
-- 5. Set is_shared_device = true.
-- 6. Set display_name = 'Workbar Device'.
-- 7. Optionally set shared_device_label = 'Workbar Device'.
-- 8. Do not give this account manager role or admin privileges.
--
-- Do not store real passwords, PINs, access codes, internal IPs or private
-- credentials in SQL or frontend source code.

alter table public.user_profiles
add column if not exists is_shared_device boolean not null default false;

alter table public.user_profiles
add column if not exists shared_device_label text;

alter table public.shift_sessions
add column if not exists operator_name text;

alter table public.shift_sessions
add column if not exists operator_source text;

alter table public.shift_sessions
add column if not exists operator_role_label text;

alter table public.shift_sessions
add column if not exists auth_display_name text;

alter table public.task_completions
add column if not exists operator_name text;

alter table public.task_completions
add column if not exists operator_source text;

alter table public.task_completions
add column if not exists operator_role_label text;

alter table public.task_completions
add column if not exists auth_display_name text;

alter table public.handover_notes
add column if not exists operator_name text;

alter table public.handover_notes
add column if not exists operator_source text;

alter table public.handover_notes
add column if not exists operator_role_label text;

alter table public.handover_notes
add column if not exists auth_display_name text;

create index if not exists user_profiles_shared_device_idx
on public.user_profiles (is_shared_device);

create or replace function public.current_user_is_shared_device()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((
    select is_shared_device
    from public.user_profiles
    where id = auth.uid()
    limit 1
  ), false);
$$;

create or replace function public.current_user_is_manager()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.current_user_profile_role() = 'manager'
    and not public.current_user_is_shared_device();
$$;

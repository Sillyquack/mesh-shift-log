-- Mesh Shift Log Supabase Phase 1 schema: alerts only.
-- This is pilot-only. Replace with authenticated RLS before production.

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
  manager_note text,
  updated_at timestamptz default now()
);

create index if not exists alerts_organization_id_idx on public.alerts (organization_id);
create index if not exists alerts_alert_date_idx on public.alerts (alert_date);
create index if not exists alerts_status_idx on public.alerts (status);
create index if not exists alerts_severity_idx on public.alerts (severity);
create index if not exists alerts_created_at_idx on public.alerts (created_at);
create unique index if not exists alerts_organization_local_id_idx on public.alerts (organization_id, local_id) where local_id is not null;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists alerts_set_updated_at on public.alerts;
create trigger alerts_set_updated_at
before update on public.alerts
for each row
execute function public.set_updated_at();

alter table public.organizations enable row level security;
alter table public.alerts enable row level security;

-- Pilot-only policies for testing without auth.
-- Replace with authenticated, role-aware RLS before production.
drop policy if exists "pilot anon can read organizations" on public.organizations;
create policy "pilot anon can read organizations"
on public.organizations for select
to anon
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

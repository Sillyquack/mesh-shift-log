-- Phase 5F.4 Close Day Backend Archive

create table if not exists public.close_day_archives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade default public.current_user_organization_id(),
  close_date date not null,
  status text not null default 'closed',
  closed_by_auth_user_id uuid references auth.users(id),
  closed_by_name text not null default '',
  closed_at timestamptz,
  reopened_by_auth_user_id uuid references auth.users(id),
  reopened_by_name text not null default '',
  reopened_at timestamptz,
  checks_passed integer not null default 0,
  total_checks integer not null default 0,
  blocking_items jsonb not null default '[]'::jsonb,
  summary text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  local_id text not null,
  source text not null default 'app',
  created_by_auth_user_id uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint close_day_archives_status_check check (status in ('closed', 'reopened')),
  constraint close_day_archives_local_id_key unique (local_id),
  constraint close_day_archives_org_date_key unique (organization_id, close_date)
);

create index if not exists close_day_archives_org_date_idx
  on public.close_day_archives (organization_id, close_date desc);

create index if not exists close_day_archives_status_idx
  on public.close_day_archives (status);

drop trigger if exists set_close_day_archives_updated_at on public.close_day_archives;

create trigger set_close_day_archives_updated_at
before update on public.close_day_archives
for each row
execute function public.set_updated_at();

alter table public.close_day_archives enable row level security;

drop policy if exists "close_day_archives_select_authenticated" on public.close_day_archives;
create policy "close_day_archives_select_authenticated"
on public.close_day_archives
for select
to authenticated
using (
  public.current_user_is_active()
  and (
    organization_id is null
    or public.current_user_organization_id() is null
    or organization_id = public.current_user_organization_id()
  )
);

drop policy if exists "close_day_archives_insert_manager" on public.close_day_archives;
create policy "close_day_archives_insert_manager"
on public.close_day_archives
for insert
to authenticated
with check (
  public.current_user_is_manager()
  and created_by_auth_user_id = auth.uid()
  and (
    organization_id is null
    or public.current_user_organization_id() is null
    or organization_id = public.current_user_organization_id()
  )
);

drop policy if exists "close_day_archives_update_manager" on public.close_day_archives;
create policy "close_day_archives_update_manager"
on public.close_day_archives
for update
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

grant select, insert, update on public.close_day_archives to authenticated;

notify pgrst, 'reload schema';

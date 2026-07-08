-- Phase 8F: Google Calendar Import + Event Operations Realtime Foundation
--
-- Do not store Google credentials, refresh tokens, private keys, service role
-- keys, private calendar URLs, alarm codes, passwords, PINs or private phone
-- numbers in these tables. Calendar source settings are metadata only.

create table if not exists public.event_calendar_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade default public.current_user_organization_id(),
  provider text not null default 'google',
  name text not null,
  calendar_id text,
  active boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.external_calendar_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_id uuid not null references public.event_calendar_sources(id) on delete cascade,
  provider text not null default 'google',
  provider_event_id text not null,
  provider_calendar_id text,
  ical_uid text,
  title text not null,
  description text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean not null default false,
  status text,
  html_link text,
  raw_payload jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  provider_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_id, provider_event_id)
);

create table if not exists public.calendar_import_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_id uuid references public.event_calendar_sources(id) on delete set null,
  provider text not null default 'google',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  imported_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_message text,
  created_by uuid references auth.users(id) default auth.uid(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.event_operation_calendar_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_operation_id uuid not null references public.event_operations(id) on delete cascade,
  external_calendar_event_id uuid not null references public.external_calendar_events(id) on delete cascade,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (organization_id, event_operation_id, external_calendar_event_id),
  unique (organization_id, external_calendar_event_id)
);

create index if not exists event_calendar_sources_org_idx
on public.event_calendar_sources (organization_id, active, provider);

create index if not exists external_calendar_events_org_time_idx
on public.external_calendar_events (organization_id, starts_at, ends_at);

create index if not exists calendar_import_runs_org_started_idx
on public.calendar_import_runs (organization_id, started_at desc);

create index if not exists event_operation_calendar_links_event_idx
on public.event_operation_calendar_links (event_operation_id);

drop trigger if exists event_calendar_sources_set_updated_at on public.event_calendar_sources;
create trigger event_calendar_sources_set_updated_at
before update on public.event_calendar_sources
for each row execute function public.set_updated_at();

drop trigger if exists external_calendar_events_set_updated_at on public.external_calendar_events;
create trigger external_calendar_events_set_updated_at
before update on public.external_calendar_events
for each row execute function public.set_updated_at();

alter table public.event_calendar_sources enable row level security;
alter table public.external_calendar_events enable row level security;
alter table public.calendar_import_runs enable row level security;
alter table public.event_operation_calendar_links enable row level security;

grant select, insert, update on public.event_calendar_sources to authenticated;
grant select, insert, update on public.external_calendar_events to authenticated;
grant select, insert, update on public.calendar_import_runs to authenticated;
grant select, insert on public.event_operation_calendar_links to authenticated;

grant select, insert, update, delete on public.event_calendar_sources to service_role;
grant select, insert, update, delete on public.external_calendar_events to service_role;
grant select, insert, update, delete on public.calendar_import_runs to service_role;
grant select, insert, update, delete on public.event_operation_calendar_links to service_role;

drop policy if exists "event_calendar_sources_manage" on public.event_calendar_sources;
create policy "event_calendar_sources_manage"
on public.event_calendar_sources for all
to authenticated
using (
  public.current_user_can_manage_event_ops()
  and public.same_event_ops_organization(organization_id)
)
with check (
  public.current_user_can_manage_event_ops()
  and public.same_event_ops_organization(organization_id)
);

drop policy if exists "external_calendar_events_manage" on public.external_calendar_events;
create policy "external_calendar_events_manage"
on public.external_calendar_events for all
to authenticated
using (
  public.current_user_can_manage_event_ops()
  and public.same_event_ops_organization(organization_id)
)
with check (
  public.current_user_can_manage_event_ops()
  and public.same_event_ops_organization(organization_id)
);

drop policy if exists "calendar_import_runs_manage" on public.calendar_import_runs;
create policy "calendar_import_runs_manage"
on public.calendar_import_runs for all
to authenticated
using (
  public.current_user_can_manage_event_ops()
  and public.same_event_ops_organization(organization_id)
)
with check (
  public.current_user_can_manage_event_ops()
  and public.same_event_ops_organization(organization_id)
);

drop policy if exists "event_operation_calendar_links_manage" on public.event_operation_calendar_links;
create policy "event_operation_calendar_links_manage"
on public.event_operation_calendar_links for all
to authenticated
using (
  public.current_user_can_manage_event_ops()
  and public.same_event_ops_organization(organization_id)
)
with check (
  public.current_user_can_manage_event_ops()
  and public.same_event_ops_organization(organization_id)
);

create or replace function public.link_calendar_event_to_event_operation(
  input_external_event_id uuid,
  input_event_operation_id uuid
)
returns public.event_operation_calendar_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_user_organization_id();
  v_calendar_org uuid;
  v_event_org uuid;
  v_record public.event_operation_calendar_links;
begin
  if not public.current_user_can_manage_event_ops() then
    raise exception 'Only manager or event floor manager can link calendar events.';
  end if;
  if v_org is null then
    raise exception 'User organization is required.';
  end if;

  select organization_id into v_calendar_org
  from public.external_calendar_events
  where id = input_external_event_id;

  select organization_id into v_event_org
  from public.event_operations
  where id = input_event_operation_id;

  if v_calendar_org is distinct from v_org or v_event_org is distinct from v_org then
    raise exception 'Calendar event and event board must belong to the current organization.';
  end if;

  insert into public.event_operation_calendar_links (
    organization_id,
    event_operation_id,
    external_calendar_event_id,
    created_by
  )
  values (
    v_org,
    input_event_operation_id,
    input_external_event_id,
    auth.uid()
  )
  on conflict (organization_id, external_calendar_event_id)
  do update set event_operation_id = excluded.event_operation_id
  returning * into v_record;

  return v_record;
end;
$$;

create or replace function public.create_event_operation_from_calendar_event(
  input_external_event_id uuid
)
returns public.event_operations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_user_organization_id();
  v_external public.external_calendar_events;
  v_existing public.event_operations;
  v_event public.event_operations;
  v_claims_text text;
  v_claims jsonb;
  v_created_by_name text;
begin
  if not public.current_user_can_manage_event_ops() then
    raise exception 'Only manager or event floor manager can create event boards from calendar events.';
  end if;
  if v_org is null then
    raise exception 'User organization is required.';
  end if;

  select *
  into v_external
  from public.external_calendar_events
  where id = input_external_event_id
    and organization_id = v_org;

  if not found then
    raise exception 'Imported calendar event not found.';
  end if;

  select event_record.*
  into v_existing
  from public.event_operations event_record
  join public.event_operation_calendar_links link
    on link.event_operation_id = event_record.id
   and link.external_calendar_event_id = v_external.id
   and link.organization_id = v_org
  limit 1;

  if found then
    return v_existing;
  end if;

  v_claims_text := nullif(current_setting('request.jwt.claims', true), '');
  if v_claims_text is not null then
    begin
      v_claims := v_claims_text::jsonb;
      v_created_by_name := nullif(v_claims ->> 'email', '');
    exception when others then
      v_created_by_name := null;
    end;
  end if;

  insert into public.event_operations (
    organization_id,
    event_date,
    title,
    venue,
    starts_at,
    ends_at,
    status,
    description,
    source,
    source_ref,
    created_by_auth_user_id,
    created_by_name,
    active_responsible_name,
    notes,
    metadata
  )
  values (
    v_org,
    coalesce((v_external.starts_at at time zone 'Europe/Oslo')::date, current_date),
    v_external.title,
    v_external.location,
    v_external.starts_at,
    v_external.ends_at,
    'draft',
    v_external.description,
    'google_calendar',
    v_external.provider_event_id,
    auth.uid(),
    v_created_by_name,
    null,
    v_external.description,
    jsonb_build_object(
      'calendarEventId', v_external.id,
      'calendarSourceId', v_external.source_id,
      'provider', v_external.provider,
      'htmlLink', v_external.html_link
    )
  )
  returning * into v_event;

  perform public.link_calendar_event_to_event_operation(v_external.id, v_event.id);
  return v_event;
end;
$$;

grant execute on function public.link_calendar_event_to_event_operation(uuid, uuid) to authenticated;
grant execute on function public.create_event_operation_from_calendar_event(uuid) to authenticated;

do $$
declare
  v_table text;
  v_tables text[] := array[
    'event_operations',
    'event_tasks',
    'event_staff_presence',
    'event_role_assignments',
    'event_responsibility_handovers',
    'event_operation_calendar_links'
  ];
begin
  foreach v_table in array v_tables loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
      and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table
      )
    then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;

alter table public.event_operations replica identity full;
alter table public.event_tasks replica identity full;
alter table public.event_staff_presence replica identity full;
alter table public.event_role_assignments replica identity full;
alter table public.event_responsibility_handovers replica identity full;
alter table public.event_operation_calendar_links replica identity full;

notify pgrst, 'reload schema';

\set ON_ERROR_STOP on

begin;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;

grant usage on schema public, auth to anon, authenticated, service_role;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table public.organizations (
  id uuid primary key,
  name text not null
);

create table public.user_profiles (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  display_name text not null,
  role text not null,
  active boolean not null default true,
  is_shared_device boolean not null default false
);

create table public.event_operations (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  event_date date not null,
  title text not null
);

alter table public.event_operations enable row level security;
grant select, insert, update on public.event_operations to authenticated;

create or replace function public.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles profile
    where profile.id = auth.uid()
      and profile.active
  );
$$;

create or replace function public.current_user_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select profile.role
  from public.user_profiles profile
  where profile.id = auth.uid()
    and profile.active
  limit 1;
$$;

create or replace function public.current_user_is_shared_device()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select profile.is_shared_device
    from public.user_profiles profile
    where profile.id = auth.uid()
      and profile.active
    limit 1
  ), false);
$$;

create or replace function public.current_user_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select profile.organization_id
  from public.user_profiles profile
  where profile.id = auth.uid()
    and profile.active
  limit 1;
$$;

create or replace function public.current_user_can_manage_event_ops()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.current_user_is_active()
    and public.current_user_profile_role() in ('manager', 'event_floor_manager')
    and not public.current_user_is_shared_device();
$$;

create or replace function public.same_event_ops_organization(target_org uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select target_org is not null
    and public.current_user_organization_id() is not null
    and target_org = public.current_user_organization_id();
$$;

create or replace function public.event_ops_event_belongs_to_current_org(
  input_event_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_operations event_record
    where event_record.id = input_event_id
      and public.same_event_ops_organization(event_record.organization_id)
  );
$$;

create policy "event_operations_read_active"
on public.event_operations for select
to authenticated
using (
  public.current_user_is_active()
  and public.same_event_ops_organization(organization_id)
);

create policy "event_operations_manage"
on public.event_operations for all
to authenticated
using (
  public.current_user_can_manage_event_ops()
  and public.same_event_ops_organization(organization_id)
)
with check (
  public.current_user_can_manage_event_ops()
  and public.same_event_ops_organization(organization_id)
);

-- Reproduce the Phase 10X hardening state before applying the hotfix.
revoke all on function public.current_user_can_manage_event_ops()
  from public, anon, authenticated;
revoke all on function public.same_event_ops_organization(uuid)
  from public, anon, authenticated;
revoke all on function public.event_ops_event_belongs_to_current_org(uuid)
  from public, anon, authenticated;

\ir ../../supabase/migrations/20260825122315_fix_event_ops_helper_execute_permissions.sql
\ir ../../supabase/migrations/20260825122315_fix_event_ops_helper_execute_permissions.sql

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.current_user_can_manage_event_ops()',
    'public.same_event_ops_organization(uuid)',
    'public.event_ops_event_belongs_to_current_org(uuid)'
  ]
  loop
    if not has_function_privilege('authenticated', v_signature, 'execute') then
      raise exception 'Authenticated execute is missing for %.', v_signature;
    end if;

    if has_function_privilege('anon', v_signature, 'execute') then
      raise exception 'Anonymous execute was unexpectedly granted for %.', v_signature;
    end if;

    if has_function_privilege('service_role', v_signature, 'execute') then
      raise exception 'Service-role execute was unexpectedly granted for %.', v_signature;
    end if;
  end loop;
end;
$$;

insert into public.organizations (id, name)
values
  ('10000000-0000-4000-8000-000000000001', 'Event Ops test organization A'),
  ('10000000-0000-4000-8000-000000000002', 'Event Ops test organization B');

insert into public.user_profiles (
  id,
  organization_id,
  display_name,
  role
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Organization A manager',
    'manager'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'Organization A staff',
    'staff'
  );

insert into public.event_operations (
  id,
  organization_id,
  event_date,
  title
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '2026-08-25',
    'Organization A event'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '2026-08-25',
    'Organization B event'
  );

set request.jwt.claim.sub = '20000000-0000-4000-8000-000000000001';
set role authenticated;

do $$
declare
  v_visible_count integer;
begin
  select count(*)
  into v_visible_count
  from public.event_operations;

  if v_visible_count <> 1 then
    raise exception 'Manager should see exactly one same-organization event, saw %.',
      v_visible_count;
  end if;

  if not public.same_event_ops_organization(
    '10000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Same-organization helper rejected the current organization.';
  end if;

  if public.same_event_ops_organization(
    '10000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Same-organization helper accepted a different organization.';
  end if;

  if not public.current_user_can_manage_event_ops() then
    raise exception 'Manager helper rejected an active manager.';
  end if;

  if not public.event_ops_event_belongs_to_current_org(
    '30000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Event-organization helper rejected the same-organization event.';
  end if;

  if public.event_ops_event_belongs_to_current_org(
    '30000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Event-organization helper accepted a cross-organization event.';
  end if;

  begin
    insert into public.event_operations (
      id,
      organization_id,
      event_date,
      title
    ) values (
      '30000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000002',
      '2026-08-25',
      'Forbidden cross-organization event'
    );
    raise exception 'Manager cross-organization insert unexpectedly succeeded.';
  exception
    when insufficient_privilege then null;
  end;

  insert into public.event_operations (
    id,
    organization_id,
    event_date,
    title
  ) values (
    '30000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    '2026-08-25',
    'Allowed manager event'
  );
end;
$$;

reset role;
set request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
set role authenticated;

do $$
begin
  if public.current_user_can_manage_event_ops() then
    raise exception 'Staff user unexpectedly passed the manager helper.';
  end if;

  begin
    insert into public.event_operations (
      id,
      organization_id,
      event_date,
      title
    ) values (
      '30000000-0000-4000-8000-000000000005',
      '10000000-0000-4000-8000-000000000001',
      '2026-08-25',
      'Forbidden staff event'
    );
    raise exception 'Staff manager-only insert unexpectedly succeeded.';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set role anon;

do $$
begin
  begin
    perform public.same_event_ops_organization(
      '10000000-0000-4000-8000-000000000001'
    );
    raise exception 'Anonymous Event Operations helper execution unexpectedly succeeded.';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

rollback;

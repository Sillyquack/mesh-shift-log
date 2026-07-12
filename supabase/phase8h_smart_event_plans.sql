create table if not exists public.event_run_sheet_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_user_organization_id() references public.organizations(id) on delete cascade,
  event_operation_id uuid not null references public.event_operations(id) on delete cascade,
  status text not null default 'suggested'
    check (status in ('suggested', 'draft', 'applied', 'dismissed', 'superseded')),
  source text not null default 'automatic'
    check (source in ('automatic', 'manual', 'template')),
  title text not null,
  suggested_template_id text,
  confidence numeric,
  detected_signals jsonb not null default '{}'::jsonb,
  rationale jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  setup jsonb not null default '{}'::jsonb,
  plan_items jsonb not null default '[]'::jsonb,
  guide_refs jsonb not null default '[]'::jsonb,
  rig_refs jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  created_by uuid references auth.users(id) default auth.uid(),
  updated_by uuid references auth.users(id),
  applied_by uuid references auth.users(id),
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.event_run_sheet_plans
add column if not exists warnings jsonb not null default '[]'::jsonb;

create index if not exists event_run_sheet_plans_org_idx
on public.event_run_sheet_plans (organization_id);

create index if not exists event_run_sheet_plans_event_idx
on public.event_run_sheet_plans (event_operation_id);

create index if not exists event_run_sheet_plans_status_idx
on public.event_run_sheet_plans (status);

create unique index if not exists event_tasks_smart_plan_item_unique_idx
on public.event_tasks (
  event_id,
  (metadata ->> 'eventPlanId'),
  (metadata ->> 'planItemId')
)
where metadata ->> 'source' = 'smart_event_plan'
  and coalesce(metadata ->> 'eventPlanId', '') <> ''
  and coalesce(metadata ->> 'planItemId', '') <> '';

create or replace function public.enforce_event_run_sheet_plan_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_organization_id uuid;
begin
  select organization_id
  into v_event_organization_id
  from public.event_operations
  where id = new.event_operation_id;

  if v_event_organization_id is null then
    raise exception 'Event operation with an organization is required for an event plan.';
  end if;

  if new.organization_id is distinct from v_event_organization_id then
    raise exception 'Event plan organization must match the event operation organization.';
  end if;

  return new;
end;
$$;

drop trigger if exists event_run_sheet_plans_enforce_organization on public.event_run_sheet_plans;
create trigger event_run_sheet_plans_enforce_organization
before insert or update
on public.event_run_sheet_plans
for each row execute function public.enforce_event_run_sheet_plan_organization();

drop trigger if exists event_run_sheet_plans_set_updated_at on public.event_run_sheet_plans;
create trigger event_run_sheet_plans_set_updated_at
before update on public.event_run_sheet_plans
for each row execute function public.set_updated_at();

alter table public.event_run_sheet_plans enable row level security;

grant select, insert, update on public.event_run_sheet_plans to authenticated;
grant select, insert, update, delete on public.event_run_sheet_plans to service_role;

drop policy if exists "event_run_sheet_plans_manage" on public.event_run_sheet_plans;
create policy "event_run_sheet_plans_manage"
on public.event_run_sheet_plans for all
to authenticated
using (
  public.current_user_can_manage_event_ops()
  and not public.current_user_is_shared_device()
  and public.same_event_ops_organization(organization_id)
  and public.event_ops_event_belongs_to_current_org(event_operation_id)
)
with check (
  public.current_user_can_manage_event_ops()
  and not public.current_user_is_shared_device()
  and public.same_event_ops_organization(organization_id)
  and public.event_ops_event_belongs_to_current_org(event_operation_id)
);

drop policy if exists "event_run_sheet_plans_read_applied" on public.event_run_sheet_plans;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'event_run_sheet_plans'
    )
  then
    alter publication supabase_realtime add table public.event_run_sheet_plans;
  end if;
end;
$$;

alter table public.event_run_sheet_plans replica identity full;

notify pgrst, 'reload schema';

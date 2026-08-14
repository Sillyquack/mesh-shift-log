-- Disposable-only fixture for Phase 10W.
--
-- These two identities exist in production but are not recreated by the current
-- canonical Event Operations migration chain:
-- 1. Supabase's platform event-trigger helper.
-- 2. The retained legacy four-argument event task status overload.
--
-- Phase 10W changes only their ACLs. This fixture gives the isolated database
-- the production-compatible signatures and bodies so the verifier can prove
-- that ACL hardening leaves function definitions byte-stable.

create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $fixture$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name is not null
       and cmd.schema_name in ('public')
       and cmd.schema_name not in ('pg_catalog', 'information_schema')
       and cmd.schema_name not like 'pg_toast%'
       and cmd.schema_name not like 'pg_temp%'
    then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
      exception when others then
        null;
      end;
    end if;
  end loop;
end;
$fixture$;

create or replace function public.update_event_task_status(
  input_task_id uuid,
  input_status text,
  input_completed_by_name text default null,
  input_completion_comment text default null
)
returns public.event_tasks
language plpgsql
security definer
set search_path = public
as $fixture$
declare
  v_task public.event_tasks;
  v_org uuid := public.current_user_organization_id();
begin
  if not public.current_user_is_active() then
    raise exception 'Active authenticated user required.';
  end if;
  if input_status not in ('pending', 'acknowledged', 'done', 'missed', 'cancelled') then
    raise exception 'Invalid event task status.';
  end if;

  select *
  into v_task
  from public.event_tasks
  where id = input_task_id
    and organization_id is not distinct from v_org
  for update;

  if not found then
    raise exception 'Event task not found.';
  end if;

  if not public.current_user_can_manage_event_ops()
     and v_task.assigned_auth_user_id is not null
     and v_task.assigned_auth_user_id <> auth.uid()
  then
    raise exception 'This event task is assigned to another user.';
  end if;

  update public.event_tasks
  set
    status = input_status,
    acknowledged_at = case when input_status = 'acknowledged' then now() else acknowledged_at end,
    acknowledged_by_name = case when input_status = 'acknowledged' then input_completed_by_name else acknowledged_by_name end,
    completed_at = case when input_status = 'done' then now() else completed_at end,
    completed_by_auth_user_id = case when input_status = 'done' then auth.uid() else completed_by_auth_user_id end,
    completed_by_name = case when input_status = 'done' then input_completed_by_name else completed_by_name end,
    completion_comment = case when input_status = 'done' then input_completion_comment else completion_comment end,
    updated_at = now()
  where id = input_task_id
  returning * into v_task;

  return v_task;
end;
$fixture$;

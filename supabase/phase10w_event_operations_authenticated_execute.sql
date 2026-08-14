begin;

-- Phase 10W closes inherited PUBLIC/anon EXECUTE on the Event Operations
-- surface. Frontend callers already require a verified Supabase session.
-- Policy helpers remain executable by authenticated because RLS expressions
-- call them directly. Trigger helpers become internal-only.
--
-- This migration changes no rows, table grants, RLS policies, event records,
-- routine records, inventory records, or release mode.

-- Fail closed if the expected production function identities have drifted.
do $phase10w_preflight$
declare
  signature text;
  required_signatures constant text[] := array[
    'public.create_event_operation_from_calendar_event(uuid)',
    'public.create_event_responsibility_handover(uuid,text,uuid,text,text,text,text)',
    'public.current_user_can_manage_event_codes()',
    'public.current_user_can_manage_event_ops()',
    'public.current_user_is_active()',
    'public.current_user_is_manager()',
    'public.current_user_is_shared_device()',
    'public.current_user_organization_id()',
    'public.current_user_profile_role()',
    'public.enforce_event_run_sheet_plan_organization()',
    'public.event_ops_event_belongs_to_current_org(uuid)',
    'public.generate_daily_event_code()',
    'public.link_calendar_event_to_event_operation(uuid,uuid)',
    'public.rls_auto_enable()',
    'public.same_event_ops_organization(uuid)',
    'public.set_updated_at()',
    'public.update_event_task_status(uuid,text,text,text)',
    'public.update_event_task_status(uuid,text,text,text,text)',
    'public.upsert_event_staff_presence(date,text,text,text,text,boolean,jsonb)',
    'public.validate_daily_event_code(text)'
  ];
begin
  foreach signature in array required_signatures loop
    if to_regprocedure(signature) is null then
      raise exception 'Phase 10W expected function is missing: %', signature;
    end if;
  end loop;
end
$phase10w_preflight$;

-- Authenticated frontend RPCs.
revoke all on function public.create_event_operation_from_calendar_event(uuid) from public, anon, authenticated;
grant execute on function public.create_event_operation_from_calendar_event(uuid) to authenticated;

revoke all on function public.create_event_responsibility_handover(uuid,text,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.create_event_responsibility_handover(uuid,text,uuid,text,text,text,text) to authenticated;

revoke all on function public.generate_daily_event_code() from public, anon, authenticated;
grant execute on function public.generate_daily_event_code() to authenticated;

revoke all on function public.link_calendar_event_to_event_operation(uuid,uuid) from public, anon, authenticated;
grant execute on function public.link_calendar_event_to_event_operation(uuid,uuid) to authenticated;

revoke all on function public.update_event_task_status(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.update_event_task_status(uuid,text,text,text) to authenticated;

revoke all on function public.update_event_task_status(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.update_event_task_status(uuid,text,text,text,text) to authenticated;

revoke all on function public.upsert_event_staff_presence(date,text,text,text,text,boolean,jsonb) from public, anon, authenticated;
grant execute on function public.upsert_event_staff_presence(date,text,text,text,text,boolean,jsonb) to authenticated;

revoke all on function public.validate_daily_event_code(text) from public, anon, authenticated;
grant execute on function public.validate_daily_event_code(text) to authenticated;

-- RLS and authorization helpers invoked directly from authenticated policies.
revoke all on function public.current_user_can_manage_event_codes() from public, anon, authenticated;
grant execute on function public.current_user_can_manage_event_codes() to authenticated;

revoke all on function public.current_user_can_manage_event_ops() from public, anon, authenticated;
grant execute on function public.current_user_can_manage_event_ops() to authenticated;

revoke all on function public.current_user_is_active() from public, anon, authenticated;
grant execute on function public.current_user_is_active() to authenticated;

revoke all on function public.current_user_is_manager() from public, anon, authenticated;
grant execute on function public.current_user_is_manager() to authenticated;

revoke all on function public.current_user_is_shared_device() from public, anon, authenticated;
grant execute on function public.current_user_is_shared_device() to authenticated;

revoke all on function public.current_user_organization_id() from public, anon, authenticated;
grant execute on function public.current_user_organization_id() to authenticated;

revoke all on function public.current_user_profile_role() from public, anon, authenticated;
grant execute on function public.current_user_profile_role() to authenticated;

revoke all on function public.event_ops_event_belongs_to_current_org(uuid) from public, anon, authenticated;
grant execute on function public.event_ops_event_belongs_to_current_org(uuid) to authenticated;

revoke all on function public.same_event_ops_organization(uuid) from public, anon, authenticated;
grant execute on function public.same_event_ops_organization(uuid) to authenticated;

-- Trigger/event-trigger helpers are not client APIs.
revoke all on function public.enforce_event_run_sheet_plan_organization() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- Fix the mutable-path advisor finding without replacing the trigger function.
alter function public.set_updated_at() set search_path = pg_catalog, public;

-- Verify the effective boundary before commit.
do $phase10w_postcondition$
declare
  signature text;
  authenticated_signatures constant text[] := array[
    'public.create_event_operation_from_calendar_event(uuid)',
    'public.create_event_responsibility_handover(uuid,text,uuid,text,text,text,text)',
    'public.current_user_can_manage_event_codes()',
    'public.current_user_can_manage_event_ops()',
    'public.current_user_is_active()',
    'public.current_user_is_manager()',
    'public.current_user_is_shared_device()',
    'public.current_user_organization_id()',
    'public.current_user_profile_role()',
    'public.event_ops_event_belongs_to_current_org(uuid)',
    'public.generate_daily_event_code()',
    'public.link_calendar_event_to_event_operation(uuid,uuid)',
    'public.same_event_ops_organization(uuid)',
    'public.update_event_task_status(uuid,text,text,text)',
    'public.update_event_task_status(uuid,text,text,text,text)',
    'public.upsert_event_staff_presence(date,text,text,text,text,boolean,jsonb)',
    'public.validate_daily_event_code(text)'
  ];
  internal_signatures constant text[] := array[
    'public.enforce_event_run_sheet_plan_organization()',
    'public.rls_auto_enable()',
    'public.set_updated_at()'
  ];
begin
  foreach signature in array authenticated_signatures loop
    if has_function_privilege('anon', signature, 'execute') then
      raise exception 'Phase 10W anon still has EXECUTE: %', signature;
    end if;
    if not has_function_privilege('authenticated', signature, 'execute') then
      raise exception 'Phase 10W authenticated lost EXECUTE: %', signature;
    end if;
  end loop;

  foreach signature in array internal_signatures loop
    if has_function_privilege('anon', signature, 'execute')
       or has_function_privilege('authenticated', signature, 'execute') then
      raise exception 'Phase 10W internal helper remains client-executable: %', signature;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'set_updated_at'
      and p.proconfig @> array['search_path=pg_catalog, public']::text[]
  ) then
    raise exception 'Phase 10W set_updated_at search_path was not fixed';
  end if;
end
$phase10w_postcondition$;

commit;

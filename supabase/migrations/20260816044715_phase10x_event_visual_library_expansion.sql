-- Phase 10X: canonical Event visual-library expansion and Event Ops privilege repair.
--
-- Generated from src/data/eventRigGuides.js. This migration is additive: it
-- replaces only the immutable visual-key allowlist, fixes one trigger-function
-- search_path, and removes unintended anonymous Event Ops function execution.
-- It performs no content installation, publication, mode change, table DML,
-- Storage upload, migration-ledger repair, or destructive schema operation.

-- Fail closed unless the reviewed Phase 10W metadata boundary is already
-- installed. Phase 10X must never become a standalone substitute for 10W.
do $$
begin
  if to_regprocedure('public.event_visual_current_user_can_read()') is null
    or to_regprocedure('public.get_event_visual_references(text[])') is null then
    raise exception 'Phase 10X requires Phase 10W Event visual-reference bridge';
  end if;
end;
$$;

create or replace function public.event_visual_reference_key_allowed(
  input_reference_key text
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select trim(coalesce(input_reference_key, '')) = any (array[
    'atrium-cafe',
    'atrium-cafe-room-flow',
    'atrium-cafe-main-floor-tables',
    'atrium-cafe-upper-lounge',
    'atrium-cafe-upper-lounge-reverse',
    'atrium-cafe-entrance-wardrobe',
    'atrium-cafe-entrance-wardrobe-detail',
    'atrium-cafe-serving-zone',
    'atrium-cafe-serving-station-detail',
    'atrium-cinema-cafe',
    'atrium-cinema-stage',
    'atrium-group-tables-overview',
    'atrium-group-tables-lounge',
    'atrium-group-tables-tribune',
    'atrium-classroom',
    'atrium-horseshoe-overview',
    'atrium-horseshoe-stage',
    'atrium-horseshoe-join-detail',
    'atrium-buffet-table',
    'atrium-mingle-concert',
    'atrium-standing',
    'atrium-cocktail',
    'atrium-empty',
    'atrium-parking-lot',
    'cornerbar-event-ready',
    'cornerbar-default-window-seating',
    'cornerbar-default-centre-floor',
    'cornerbar-default-bar-stage',
    'cornerbar-default-reverse-wardrobe',
    'cornerbar-cinema',
    'cornerbar-group-tables-overview',
    'cornerbar-group-tables-stage',
    'cornerbar-group-tables-reverse',
    'cornerbar-classroom',
    'cornerbar-horseshoe-overview',
    'cornerbar-horseshoe-reverse',
    'cornerbar-mingle-concert',
    'atrium-drinks-under-25',
    'atrium-drinks-over-25',
    'atrium-coffee-tea',
    'cornerbar-serving-station-overview',
    'cornerbar-coffee-water-tea-complete',
    'coffee-tea-complete',
    'coffee-tea-refill',
    'atrium-stage-tech-overview',
    'atrium-hdmi-inputs',
    'atrium-microphones',
    'atrium-clicker-batteries',
    'cornerbar-stage-tech-overview',
    'cornerbar-stage-light-control',
    'atrium-bar-ready',
    'atrium-bar-closed',
    'cornerbar-bar-ready',
    'cornerbar-final-reset',
    'cornerbar-closing-devices',
    'cornerbar-closing-products',
    'atrium-used-dishes',
    'atrium-check-in',
    'food-main',
    'food-snacks',
    'food-cheese-jam',
    'food-allergens',
    'atrium-food',
    'atrium-water',
    'atrium-wine-beer'
  ]::text[]);
$$;

revoke all on function public.event_visual_reference_key_allowed(text)
  from public, anon, authenticated;

-- Supabase advisor repair: this trigger body needs only pg_catalog.now().
alter function public.set_updated_at() set search_path = pg_catalog;
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- Repair only functions present in the target schema so a clean partial replay
-- remains possible. Internal helpers lose all client execution. Client RPCs
-- retain authenticated execution and their existing in-function role checks.
-- The historical four-argument task-status overload is repaired when present.
do $$
declare
  v_signature text;
  v_client_boundary boolean;
begin
  for v_signature, v_client_boundary in
    select repair.signature, repair.client_boundary
    from (values
      ('public.current_user_can_manage_event_ops()', false),
      ('public.same_event_ops_organization(uuid)', false),
      ('public.event_ops_event_belongs_to_current_org(uuid)', false),
      ('public.enforce_event_run_sheet_plan_organization()', false),
      ('public.upsert_event_staff_presence(date,text,text,text,text,boolean,jsonb)', true),
      ('public.update_event_task_status(uuid,text,text,text,text)', true),
      ('public.update_event_task_status(uuid,text,text,text)', true),
      ('public.create_event_responsibility_handover(uuid,text,uuid,text,text,text,text)', true),
      ('public.link_calendar_event_to_event_operation(uuid,uuid)', true),
      ('public.create_event_operation_from_calendar_event(uuid)', true)
    ) as repair(signature, client_boundary)
  loop
    if to_regprocedure(v_signature) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', v_signature);
      if v_client_boundary then
        execute format('grant execute on function %s to authenticated', v_signature);
      end if;
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';

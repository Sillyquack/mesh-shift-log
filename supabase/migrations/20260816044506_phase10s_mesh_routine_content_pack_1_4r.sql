-- Ledger-only reconciliation for an already-installed, exact Phase 10S state.
-- No Phase 10S DDL is executed.
do $phase10s_ledger_only$
declare
  v_actual text;
  v_pack jsonb;
  v_acl text;
begin
  if exists (
    select 1 from supabase_migrations.schema_migrations
    where name = 'phase10s_mesh_routine_content_pack_1_4r'
  ) then
    raise exception 'phase10s_ledger_entry_already_exists';
  end if;

  select encode(digest(pg_get_functiondef('public.routine_mesh_content_pack_v1()'::regprocedure),'sha256'),'hex'),
         public.routine_mesh_content_pack_v1(),
         proacl::text
    into v_actual,v_pack,v_acl
  from pg_proc
  where oid='public.routine_mesh_content_pack_v1()'::regprocedure;

  if v_actual <> '360c96d9e04307c89a25fcf8fb13be9a6beef9573753707ca25900a68201bd80'
     or v_pack->>'packKey' <> 'mesh-routine-content'
     or v_pack->>'packVersion' <> '1.4R'
     or v_pack->>'packHash' <> '48b7c4dfdb1340ddff14748a3c6d57df504f33fe822f25b6dde0d4ab48a6caf8'
     or v_acl <> '{postgres=X/postgres}'
  then
    raise exception 'phase10s_live_state_mismatch';
  end if;
end
$phase10s_ledger_only$;
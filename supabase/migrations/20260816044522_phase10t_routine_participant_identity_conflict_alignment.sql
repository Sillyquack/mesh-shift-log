-- Ledger-only reconciliation for an already-installed, exact Phase 10T state.
-- No Phase 10T function replacement is executed.
do $phase10t_ledger_only$
declare
  v_match_count integer;
begin
  if exists (
    select 1 from supabase_migrations.schema_migrations
    where name = 'phase10t_routine_participant_identity_conflict_alignment'
  ) then
    raise exception 'phase10t_ledger_entry_already_exists';
  end if;

  select count(*) into v_match_count
  from (values
    ('public.create_or_get_routine_run_phase10d(text,text,date,uuid)','1e1594c8f306a190edf27b955d59e83b328152745c96926cff7ed277a91e3a3c'),
    ('public.join_routine_run_phase10d(uuid,uuid)','385bdd85fed19bc8bd5518a2c9621e9de0f9ea55b781acdbd6651e00cb339da3'),
    ('public.routine_ensure_run_participant(uuid,uuid,uuid,uuid)','472ce9f602a1bfcf06dbc62eb2897421711c64a94f3c4c3305b060d89ac92700'),
    ('public.routine_ensure_bundle_participant(uuid,uuid,uuid,uuid)','6510659506434b7844ee0f64c0ec61fc96eb9a4bf2764d2933b727c9a08f8d77'),
    ('public.routine_ensure_closing_bundle_participant(uuid,uuid,uuid,uuid)','82e3dde6d62267a217d31abe9f3683ed97b06525f0dbae7f9d5e658721b12932')
  ) expected(signature,definition_hash)
  join pg_proc p on p.oid=to_regprocedure(expected.signature)
  where encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex')=expected.definition_hash
    and p.prosecdef
    and p.provolatile='v'
    and p.proconfig=array['search_path=pg_catalog']
    and p.proacl::text='{postgres=X/postgres}';

  if v_match_count <> 5 then
    raise exception 'phase10t_live_state_mismatch';
  end if;
end
$phase10t_ledger_only$;
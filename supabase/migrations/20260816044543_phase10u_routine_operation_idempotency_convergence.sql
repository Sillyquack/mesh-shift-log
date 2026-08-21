-- Ledger-only reconciliation for an already-installed, exact Phase 10U state.
-- No Phase 10U function replacement is executed.
do $phase10u_ledger_only$
declare
  v_match_count integer;
  v_uniqueness_contract text;
begin
  if exists (
    select 1 from supabase_migrations.schema_migrations
    where name = 'phase10u_routine_operation_idempotency_convergence'
  ) then
    raise exception 'phase10u_ledger_entry_already_exists';
  end if;

  select count(*) into v_match_count
  from (values
    ('public.routine_run_operation_replay(uuid,uuid,text,uuid,text)','0b3ceda5f63139a27ce505cc7dc932074e742af66f55e441b07fcb25bc03675b'),
    ('public.routine_record_run_operation(uuid,uuid,text,uuid,text,text,uuid,jsonb)','dea542f87108ff956202359eda372c6ed343bdd6dc3286ae786566f7da395fa4'),
    ('public.routine_bundle_operation_replay(uuid,uuid,text,uuid,text)','cd816b9a0d91899d740a58f5a22d926f2dee8f3c67b0ace34a77e7d231943ae8'),
    ('public.routine_record_bundle_operation(uuid,uuid,text,uuid,text,text,uuid,jsonb)','527156c129e8a54064dc1b662d4b4672c9fe724919db94ec8d3e218e6c1e0362')
  ) expected(signature,definition_hash)
  join pg_proc p on p.oid=to_regprocedure(expected.signature)
  where encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex')=expected.definition_hash
    and p.prosecdef
    and p.provolatile='v'
    and p.proconfig=array['search_path=pg_catalog']
    and p.proacl::text='{postgres=X/postgres}';

  select
    (select count(*) from pg_index i join pg_class c on c.oid=i.indexrelid
     where c.relname in('routine_run_operations_personal_idempotency','routine_run_operations_operator_idempotency')
       and i.indisunique and i.indisvalid and i.indpred is not null)::text||':'||
    (select count(*) from pg_constraint where conrelid='public.routine_bundle_operations'::regclass
       and conname='routine_bundle_operations_idempotency_unique' and contype='u')::text
  into v_uniqueness_contract;

  if v_match_count <> 4 or v_uniqueness_contract <> '2:1' then
    raise exception 'phase10u_live_state_mismatch';
  end if;
end
$phase10u_ledger_only$;
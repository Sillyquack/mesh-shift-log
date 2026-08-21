-- Ledger-only reconciliation for an already-installed, exact Phase 10V state.
-- No Phase 10V constraint drop or other DDL is executed.
do $phase10v_ledger_only$
declare
  v_obsolete integer;
  v_provenance integer;
  v_identity_indexes integer;
begin
  if exists (
    select 1 from supabase_migrations.schema_migrations
    where name = 'phase10v_routine_creation_idempotency_provenance_alignment'
  ) then
    raise exception 'phase10v_ledger_entry_already_exists';
  end if;

  select count(*) into v_obsolete
  from pg_constraint
  where conname in(
    'routine_runs_org_creation_idempotency_unique',
    'routine_run_participants_org_idempotency_unique',
    'routine_bundles_org_idempotency_unique',
    'routine_bundle_participants_idempotency_unique'
  );

  select count(*) into v_provenance
  from information_schema.columns
  where table_schema='public'
    and table_name in('routine_runs','routine_run_participants','routine_bundles','routine_bundle_participants')
    and column_name='creation_idempotency_key'
    and data_type='uuid'
    and is_nullable='NO';

  select count(*) into v_identity_indexes
  from pg_index i
  join pg_class c on c.oid=i.indexrelid
  where c.relname in(
    'routine_runs_authoritative_identity_idx',
    'routine_run_participants_personal_unique',
    'routine_run_participants_operator_unique',
    'routine_bundles_active_identity_unique',
    'routine_bundle_participants_personal_unique',
    'routine_bundle_participants_operator_unique'
  )
  and i.indisunique and i.indisvalid and i.indisready;

  if v_obsolete <> 0 or v_provenance <> 4 or v_identity_indexes <> 6 then
    raise exception 'phase10v_live_state_mismatch';
  end if;
end
$phase10v_ledger_only$;
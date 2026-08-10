begin;

alter table public.routine_runs
  drop constraint if exists routine_runs_org_creation_idempotency_unique;

alter table public.routine_run_participants
  drop constraint if exists routine_run_participants_org_idempotency_unique;

alter table public.routine_bundles
  drop constraint if exists routine_bundles_org_idempotency_unique;

alter table public.routine_bundle_participants
  drop constraint if exists routine_bundle_participants_idempotency_unique;

commit;

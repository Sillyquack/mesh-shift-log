# Phase 10U — Routine operation-ledger concurrency convergence

Date: 2026-08-10  
Scope: local forward migration only  
Production status: not applied

## Purpose

Phase 10U makes idempotent Routine operation replay and recording converge under concurrent requests. It changes no table, index, constraint, policy, grant, operational data, release setting, or content-provider state.

The migration replaces exactly these effective functions:

- `routine_run_operation_replay(uuid,uuid,text,uuid,text)`
- `routine_record_run_operation(uuid,uuid,text,uuid,text,text,uuid,jsonb)`
- `routine_bundle_operation_replay(uuid,uuid,text,uuid,text)`
- `routine_record_bundle_operation(uuid,uuid,text,uuid,text,text,uuid,jsonb)`

## Final-catalog audit

The pre-implementation `pg_proc` audit found these direct run-ledger insertors:

- `routine_record_run_operation(uuid,uuid,text,uuid,text,text,uuid,jsonb)`
- `routine_record_run_operation_with_id(uuid,uuid,uuid,text,uuid,text,text,uuid,jsonb)`
- `record_routine_initial_assessment(uuid,text,text,text,bigint,uuid)`

It found these direct bundle-ledger insertors:

- `routine_record_bundle_operation(uuid,uuid,text,uuid,text,text,uuid,jsonb)`
- `accept_routine_event_transfer(uuid,bigint,uuid)`
- `complete_routine_event_transfer_phase10j_base(uuid,text,jsonb,boolean,boolean,text,bigint,uuid)`
- `reassign_double_shift_closing(uuid,uuid,uuid,text,bigint,uuid)`

All three non-primary direct insert paths call the relevant replay helper before their first row lock, advisory resource lock, external snapshot, insert, update, or event mutation. Some functions initialize transaction-local UUID variables in their declaration block before entering the replay boundary; those values are never persisted by a loser. Moving those side-effect-free initializers would require an additional wrapper replacement even though no protected mutation precedes replay, so it is outside the explicitly authorized additional-wrapper condition. `routine_record_run_operation_with_id` is an internal writer reached only after its public lifecycle callers have called run replay. No wrapper replacement is therefore required.

Run-writer callers in the effective catalog are:

- `assign_routine_run_role_phase10d(uuid,uuid,text,text,text,bigint,uuid)`
- `create_or_get_routine_run_phase10d(text,text,date,uuid)`
- `create_or_get_routine_run_phase10k4_base(text,text,date,uuid)`
- `evaluate_routine_run_conditions(uuid,uuid)`
- `join_routine_run_phase10d(uuid,uuid)`
- `join_routine_run(uuid,uuid)`
- `refresh_routine_run_timing(uuid,uuid)`
- `replace_routine_organization_flags(jsonb,bigint,uuid)`
- `routine_complete_lifecycle_operation(uuid,uuid,uuid,text,text,text,uuid,text,text,uuid,jsonb,uuid,text,jsonb,bigint,bigint,jsonb)`
- `supersede_routine_run_operational_date(uuid,date,text,bigint,uuid)`

The internal explicit-ID run writer is called by:

- `complete_routine_run_verification_phase10j_base(uuid,text,jsonb,text,text,bigint,uuid)`
- `verify_routine_task_phase10e(uuid,text,text,boolean,bigint,uuid)`

Bundle-writer callers in the effective catalog are:

- `complete_double_shift_opening_transition(uuid,uuid,text,time,uuid,text,bigint,bigint,uuid)`
- `confirm_double_shift_plan(uuid,uuid,time,bigint,bigint,uuid)`
- `create_or_get_double_shift_bundle_phase10k4_base(text,text,text,date,uuid)`
- `refresh_routine_run_external_context(uuid,uuid)`
- `reject_routine_event_transfer(uuid,text,bigint,uuid)`
- `return_to_double_shift(uuid,uuid,text,bigint,bigint,uuid)`

The complete run-replay caller set is:

- `accept_routine_handover`, `add_routine_task_comment`, `assign_routine_deviation`, `assign_routine_run_role_phase10d`, `block_routine_task_phase10e`, `cancel_routine_deviation`, `cancel_routine_run_phase10h_base`, `claim_routine_task_phase10e`, `claim_routine_task`, `complete_routine_run_verification_phase10j_base`, `complete_routine_task_phase10e`, `complete_routine_task_phase10j_base`, `create_or_get_routine_handover`, `create_or_get_routine_run_phase10d`, `create_or_get_routine_run_phase10k4_base`, `create_routine_deviation`, `create_routine_manager_override`, `evaluate_routine_run_conditions`, `finish_routine_run_phase10h_base`, `join_routine_run_phase10d`, `join_routine_run`, `mark_routine_task_not_applicable_phase10e`, `mark_routine_task_not_applicable`, `mitigate_routine_deviation`, `pause_routine_task`, `propose_routine_transfer_phase10e`, `propose_routine_transfer`, `record_routine_history_correction_phase10f`, `record_routine_initial_assessment`, `refresh_routine_handover_generated_items`, `refresh_routine_run_timing`, `release_routine_task`, `reopen_routine_run_phase10h_base`, `reopen_routine_task_phase10e`, `replace_routine_handover_draft`, `replace_routine_organization_flags`, `request_routine_run_final_verification`, `resolve_routine_deviation`, `routine_change_transfer_status`, `start_routine_run_phase10e`, `start_routine_task_phase10e`, `start_routine_task`, `submit_routine_handover`, `supersede_routine_run_operational_date`, `update_routine_task_item`, `verify_routine_task_phase10e`, and `verify_routine_task_phase10j_base`.

The complete bundle-replay caller set is:

- `accept_routine_event_transfer`, `complete_double_shift_opening_transition`, `complete_routine_event_transfer_phase10j_base`, `confirm_double_shift_plan`, `create_or_get_double_shift_bundle_phase10k4_base`, `reassign_double_shift_closing`, `refresh_routine_run_external_context`, `reject_routine_event_transfer`, and `return_to_double_shift`.

## Lock identity and uniqueness contract

Run operations retain the Phase 10J partial uniqueness model:

- personal: organization, authenticated actor, operation type, idempotency key
- shared-device operator: organization, authenticated device actor, effective operator, operation type, idempotency key

The run advisory-lock tuple includes those fields plus the actor source and an explicit personal-auth sentinel. Bundle operations retain their exact unique constraint on organization, authenticated actor, operation type, and idempotency key. Bundle locking mirrors exactly that identity. Run and bundle use separate fixed domains and seeds. Neither lock includes request hash, resource identity, timestamps, session randomness, or generated resource IDs.

Both replay helpers take the transaction-scoped advisory lock before reading the ledger. Both writers take the identical domain lock before attempting `INSERT ... ON CONFLICT DO NOTHING RETURNING` and then perform exact-identity readback on conflict.

## Conflict behavior

- Same identity, request, and resource converges on the original immutable ledger row and response.
- A reused identity with a different request hash raises the pre-existing deterministic idempotency-reuse error.
- A reused identity with a different resource type or resource ID raises a deterministic resource-conflict error.
- A conflict without an exact identity row raises a deterministic internal ledger-conflict error.
- Stored response payloads are never updated by retry handling.

## Lifecycle boundaries

Phase 10U does not change Routine content 1.4R, Phase 10T participant identity semantics, schemas, indexes, grants, RLS, mode, release stage, memberships, attestations, drafts, publications, runs, bundles, deliveries, or production state. The migration is intentionally local, unstaged, uncommitted, and unapplied to production pending a separate review and authorization.

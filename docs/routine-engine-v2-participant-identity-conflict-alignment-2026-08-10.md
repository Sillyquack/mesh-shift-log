# Routine Engine v2 participant identity conflict alignment

Date: 2026-08-10  
Phase: 10T  
Scope: local lifecycle migration and verification only

## Decision

Phase 10T aligns the final effective personal-participant inserts with the
partial identity indexes introduced by Phase 10J. It is not a content-pack
amendment and does not change `mesh-routine-content@1.4R`.

The final catalog audit after the complete migration chain through Phase 10S
found exactly these stale effective functions:

1. `public.create_or_get_routine_run_phase10d(text,text,date,uuid)`
2. `public.join_routine_run_phase10d(uuid,uuid)`
3. `public.routine_ensure_run_participant(uuid,uuid,uuid,uuid)`
4. `public.routine_ensure_bundle_participant(uuid,uuid,uuid,uuid)`
5. `public.routine_ensure_closing_bundle_participant(uuid,uuid,uuid,uuid)`

No additional effective function used an unqualified personal-participant
conflict target.

## Root cause

Phase 10D used full unique constraints and therefore specified
`ON CONFLICT (run_id, user_profile_id)`. Phase 10E retained those definitions
behind private wrapper names. Phase 10J introduced separate personal and
shared-device identities, removed the full constraints, and added partial
indexes with `identity_type` predicates. The retained personal functions could
no longer infer a matching unique index in the final schema.

## Exact allowed functional delta

Each repaired personal run-participant insert:

- explicitly inserts `identity_type = 'personal_profile'`;
- uses `ON CONFLICT (run_id, user_profile_id) WHERE identity_type =
  'personal_profile' DO NOTHING`;
- filters personal-participant readback with
  `identity_type = 'personal_profile'`.

Each repaired personal bundle-participant insert applies the corresponding
`bundle_id` conflict target and readback filter.

Everything else in the five definitions is preserved from the effective
historical source: signatures, argument names and order, return types,
language, volatility, strictness, security-definer state, search path,
validation, tenant checks, locks, idempotency, timestamps, events, operation
records, payloads and exception messages.

The generated migration uses `CREATE OR REPLACE`, so the existing owner and
ACL remain attached to each function. Phase 10T adds no grants or revokes and
does not expose the internal Phase 10D or Phase 10H helpers.

## Preserved identity model

- Personal participants use `identity_type = 'personal_profile'`.
- Shared-device participants use
  `identity_type = 'shared_device_operator'`.
- The four Phase 10J partial unique indexes remain authoritative.
- The removed full run/profile and bundle/profile constraints are not
  restored.

## Migration properties

`supabase/phase10t_routine_participant_identity_conflict_alignment.sql` is:

- one explicit transaction;
- forward-only and deterministic;
- reapply-safe;
- limited to five `CREATE OR REPLACE FUNCTION` statements;
- free of top-level DML, grants, revokes, policy changes and configuration
  changes.

It creates no application rows, content, run, participant or bundle during
migration and does not touch settings, Auth, Storage, Realtime, Inventory,
Assets, Event Operations or legacy data.

## Verification contract

Disposable verification compares normalized pre-10T and post-10T
`pg_get_functiondef` values after removing only the authorized identity
fragments. It also compares function metadata, owner and ACL, validates the
final constraint/index catalog, checks effective EXECUTE and table DML access,
and exercises personal runs, joins, Double Shift helpers, shared-device
coexistence, concurrent creation, reapply and protected-domain fingerprints.

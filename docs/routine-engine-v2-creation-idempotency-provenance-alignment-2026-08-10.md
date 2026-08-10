# Phase 10V creation-idempotency provenance alignment

Date: 2026-08-10  
Scope: local forward-only schema-contract correction after Phase 10U

## Decision

The run and bundle operation ledgers own request idempotency. Their identity includes organization, final actor identity, operation type, and the raw client UUID. The `creation_idempotency_key` stored on a run, bundle, or participant is immutable provenance for the operation that first created that row; it is not organization-global uniqueness and is never rewritten by later convergence, join, replay, or another operation type.

No actor-scoped replacement resource index is valid because the four resource/participant tables do not store `operation_type`. No generated operation-type column, copied ledger identity, or replacement non-unique lookup index is introduced.

## Final post-10U audit

The effective catalog contains ten Routine tables with a `uuid NOT NULL` `creation_idempotency_key`:

1. In-scope run/bundle resources: `routine_runs`, `routine_bundles`.
2. In-scope run/bundle participants: `routine_run_participants`, `routine_bundle_participants`.
3. Operation/audit ledgers: none use this column name; the run and bundle ledgers use their actor- and operation-scoped `idempotency_key` contract.
4. Operator/device administration: `routine_shared_devices`, `routine_operators`.
5. Other: `routine_templates`, `routine_template_versions`, `routine_reference_images`, `routine_pilot_memberships`.

The effective `pg_proc` audit found no run, bundle, run-participant, or bundle-participant lookup by `creation_idempotency_key`, no `ON CONFLICT` target involving that column, and no update of that column. The template-draft/template/reference manager functions retain their separate, in-domain `organization_id + creation_idempotency_key` lookups and constraints. They are outside Phase 10V.

## Exact forward delta

`supabase/phase10v_routine_creation_idempotency_provenance_alignment.sql` drops only:

- `routine_runs_org_creation_idempotency_unique`;
- `routine_run_participants_org_idempotency_unique`;
- `routine_bundles_org_idempotency_unique`;
- `routine_bundle_participants_idempotency_unique`.

PostgreSQL removes the four constraint-owned unique indexes with those constraints. The migration performs no DML, function replacement, grant/revoke, owner/RLS/policy/trigger/default-privilege change, settings change, content operation, publication, or operative creation.

## Preserved authority

Resource and participant convergence remains enforced by these valid unique indexes:

- `routine_runs_authoritative_identity_idx`;
- `routine_run_participants_personal_unique`;
- `routine_run_participants_operator_unique`;
- `routine_bundles_active_identity_unique`;
- `routine_bundle_participants_personal_unique`;
- `routine_bundle_participants_operator_unique`.

Immutable guards continue to protect the creation key, creator, timestamp, and resource/participant identity snapshots. Operation-ledger request-hash mismatch and resource-consistency checks remain unchanged.

## Acceptance contract

The local disposable verification must prove:

- same UUID across two personal actors can converge on one run and one bundle while retaining two actor receipts and two participant identities;
- the same UUID across different valid run or bundle business identities can create distinct resources;
- the same actor can use the same UUID for `create_run_with_time` and `join_run` without overwriting participant provenance;
- personal and shared-device operator identities remain independent;
- same-actor/same-operation UUID reuse with a different request remains rejected;
- no semantic duplicate exists under any preserved business/participant identity;
- Phase 10V reapply is a schema/data/ACL no-op;
- all three complete 24-migration sequences have identical portable schema, raw/effective ACL, settings, data, protected-domain, and provider fingerprints.

The accepted `routine-canonical-catalog-forensics-v1` portable schema fingerprint is `1285920a3b13f2337871e3355751fc9043f17e380c55dec43f86ca01cff612e5` in both tested owner contexts.

Phase 10V carries no production authorization. It must remain unstaged and uncommitted with the surrounding Phase 10S/10T/10U work until separately approved.

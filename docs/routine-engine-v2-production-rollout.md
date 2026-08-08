# Routine Engine v2 production rollout runbook

Status: plan only. Phase 10A1 repairs the local migration chain but does not execute this runbook, connect to a production project, install content, publish, promote a release stage, change mode, pause work, or create an operational record.

## Phase 10A1 stop record and renewed gates

The staffed production attempt stopped before 10A because the production-shaped contract exposed a missing organization-settings bootstrap: 10A creates the table and manager mutation RPC but does not create a row for organizations that already exist. No production DDL, DML or mutating RPC was executed. The separate manager RPC must never be used as an installation workaround.

Phase 10A1 is the system bootstrap. It inserts one inert `legacy` settings row for every organization missing one, uses `Europe/Oslo`, cutoff `04:00`, shared device disabled, reopen window 24, revision 1 and null actor-audit fields, and never updates an existing row. K1 then supplies `foundation/phase10k1-v1`; K2 advances only foundation rows to `manager_preview/phase10k2-v1` and increments the revision once; K3 advances only manager-preview rows to `staff_preview/phase10k3-v1` and increments once; K4 keeps mode/stage/revision, sets contract `phase10k4-v1` and leaves pause metadata inert; 10L leaves settings unchanged and installs no content.

All previously captured recovery snapshots remain untouched. After the Phase 10A1 branch is reviewed and merged, repeat Gate 0 and Gate 1 against the new exact commit, reconfirm a successful physical backup inside the required pre-window interval, and rerun the final zero-delta/write-quiescence gate. None of this documentation or local evidence grants production authorization.

## Required approval and exact migration order

Obtain explicit production-change approval and record the approved Supabase project ref before any command is run. Apply the existing schema and canonical Phase 9 chain first, then these migrations exactly once in order:

1. `phase10a_routine_engine_foundation.sql`
2. `phase10a1_routine_organization_settings_bootstrap.sql`
3. `phase10b_routine_templates.sql`
4. `phase10c_routine_reference_images.sql`
5. `phase10d_routine_runs_and_snapshots.sql`
6. `phase10e_routine_task_lifecycle.sql`
7. `phase10f_routine_operational_time.sql`
8. `phase10g_routine_closing_delivery.sql`
9. `phase10h_routine_double_shift.sql`
10. `phase10i_routine_realtime_offline_sync.sql`
11. `phase10j_routine_shared_device_identity.sql`
12. `phase10k1_routine_ui_pilot_gate.sql`
13. `phase10k2_routine_manager_control_center.sql`
14. `phase10k3_routine_employee_workflow.sql`
15. `phase10k4_routine_history_pilot_hardening.sql`
16. `phase10l_mesh_routine_content_pack.sql`

The 10L migration installs the reviewed content-pack mechanism but does not install organization content. Never reorder, squash, or edit an already-applied phase migration.

## Project-ref preflight

Have two people compare the intended project ref, organization ID, environment label, CLI link target and browser project URL. Stop if any value is empty or differs between the CLI and dashboard. Record only non-secret identifiers. Do not print tokens, database passwords, service-role keys, PINs or operator session tokens.

## Backup and verification

Create and verify a recoverable database backup using the approved production procedure. Record its restore point and retention. Export catalog-only fingerprints for Auth, Inventory, Inventory Storage, Event Operations and the five legacy tables. Capture row counts and hashes for all existing Routine Engine history/operation tables. Run the complete local regression matrix against the exact release commit.

Apply the chain to an empty disposable database and a restored production-shaped staging database first. Verify that K4 leaves every current mode and later release stage unchanged, advances only K3 contract rows, creates no run/task/bundle/template/content row and is stable on reapply.

## Storage, Realtime, RLS and grants

Create or verify `routine-reference-images` as private, 5 MiB maximum, and JPEG/PNG/WebP only. Verify Phase 10C policies and prepare → server-selected path upload → finalize; clients never build paths. Confirm signed/private downloads and ensure service-worker caches cannot contain private image responses.

Verify that `routine_events`, and only approved tables, are members of `supabase_realtime`. Shared-device operators continue with authenticated cursor polling; do not broaden table SELECT or Realtime grants.

Compare RLS enablement, policies, function owners, fixed search paths and exact authenticated `EXECUTE` grants with the disposable catalog fingerprint. Confirm anon has no Routine Engine access, authenticated clients have no direct mutation DML, and release/E2E attestation tables expose no client DML. Scan the build and repository for service-role keys, secrets, PINs, bearer/session tokens and production URLs.

Before any production migration, run `npm run verify:routine-full-migration-reapply`. Its network-isolated PostgreSQL 17.6 rehearsal must complete three exact 16-migration Phase 10A → 10A1 → 10B–10L sequences (48/48 applications) without a manager-RPC bootstrap and with identical Routine schema (`f44dc34640c684d2dc1cbb072f88f7d111c49f13a9b5a934905a07c73733c33a` for the reviewed 1.1R payload), raw function ACL (`ac86a7505043d1db53b1b9bd8d9b43561b520a7bf1c8d5a99e8d09f55e17a2ad`) and effective function ACL (`2ef51b540d59b3288f508993ce0d6b6f824fa2e4300cf219f11f23e3956fa9c4`) fingerprints. It must also prove multi-organization bootstrap, complete preservation of a non-default existing row, exact K1/K2/K3/K4 stage progression, and data/revision/timestamp stability on reapply. The validator parameters must remain `input_version_id` and `input_publication_version_ids`. Recreated wrappers must revoke default `PUBLIC`/`anon` execution in the phase that creates them and explicitly grant only the authenticated public/RLS accessors. Do not substitute broad default-privilege changes, an all-functions revoke, or drop/recreate behavior. Stop if any first-install or reapply ACL differs from these reviewed fingerprints.

## Phase 10A1 and 10M migration-manifest checkpoint

The affected artifacts for the current review tree are pinned below. These hashes are local-review evidence, not migration approval:

| Artifact | SHA-256 |
|---|---|
| `supabase/phase10a1_routine_organization_settings_bootstrap.sql` | `56ac1afa16d5676bd0c7118b4e246d5d7558aa65e18cd88f0e1dbd4cb86ba2cd` |
| `content/routine-engine/mesh-routine-content-v1.json` | `fc2e639d692a3850200f73738946f40d8cde16ffc8cae7f65ab38fd077a56a3c` |
| `supabase/phase10l_mesh_routine_content_pack.sql` | `f91b0479bffc9456954c5f1de388b5713039aa9ad8cc72042aab4da7f213a1fa` |
| `docs/routine-engine-v2-mesh-content-v1.md` | `dd0483555368f2cd9f3ad2774e211157dc3774d87e0f3785e3d1798f4488cc20` |
| `docs/routine-engine-v2-mesh-operational-standards-amendment-2026-08-07.md` | `aed94b69e98e7f7ed6ace5a37d84cf50770ea6fd3337b536898179f9c4f8c2a8` |

Gate 0 and Gate 1 must be rerun against the eventual new commit before any production migration. A later edit requires regenerating these affected hashes; never rely on this uncommitted-tree table as production authorization.

## Shadow and manager preview

Keep the installed preview stage and explicitly select `shadow` only after migration verification. Shadow remains read-only for operational mutations. Verify legacy Opening/Closing operation, Stock Count, Inventory Storage and Event Operations. Never move directly from legacy to pilot.

Managers review foundation, locations/routes, standards, reference images, devices/operators, pilot membership candidates, history sources and the legacy unscoped aggregate. Shared-device identities must not open manager surfaces. Resolve blockers with existing manager RPCs; do not edit tables directly.

## Phase 10L content installation and publication

Keep the organization in `legacy` for migration verification. After fresh Gate 0/Gate 1 approval, a manager may explicitly choose `shadow`, open Operational content, verify `mesh-routine-content@1.1R` and hash `c149a8416a867dcb7d87224f3ae8e2a214e5ca4954613b118521ebe5ae3aff2a`, review create/reuse/conflict analysis, and explicitly install editable Opening and Closing drafts. Re-preview after installation and compare the content audit, IDs, draft hashes and divergence state. Installation must not publish, create a run or bundle, or change mode/stage.

The 1.1R pack resolves the cup/glass layouts, four Workbar-assigned Coffee Canisters, six tea names, door/lock rules and fridge rules through approved structured revisions. Full and service-ready cup/glass standards are visually identical, not numeric; O29/O35 recheck independently. Cornerbar has a separate structured operating standard but no third routine. Event-active scope uses formal transfer/evidence and never N/A. The sole remaining original blocker is **Exact serviceware recovery route through the relevant office floors**; resolve it later only through the existing manager standard/location-set mutations using an approved complete route. Never guess office-floor points or create room 005.

Managers may upload actual approved reference images gradually through Manager Control Center using prepare → upload → finalize and must never construct Storage paths. Placeholders remain warnings and are not required for draft installation. Validate and compare both drafts; any change from the installed pack remains visible in the audit. Publish Opening and Closing atomically with the existing batch-publish RPC, including when publishing only one version. Recompute readiness after publication. DS01–DS04 remain bundle system steps and no `double_shift` template is created.

Only after all content, reference, security, Chromium/WebKit and disposable E2E evidence is green may a separate explicit approval authorize `pilot_ready` attestation and later pilot activation. Content installation itself is never such approval and this runbook contains no production activation authorization.

## Pilot membership, E2E evidence and readiness

Create the smallest approved, time-bounded pilot membership set through the K1 RPC. Run Chromium and WebKit end-to-end verification against the release candidate and disposable/staging backend. Record an E2E verification attestation only after both engines pass; a shared operator never records it.

Recompute `get_routine_pilot_readiness()` immediately before promotion. Review every category, blocker, warning, evidence hash, current stage/mode and settings revision. A personal manager submits `promote_routine_ui_release_stage` with the exact current readiness hash, revision, real note and one idempotency key. The server recomputes readiness inside the transaction and writes an immutable attestation. Promotion changes stage only; it does not activate pilot mode.

## Pilot activation and observation

After explicit activation approval, a personal manager invokes the mode RPC for `shadow → pilot` with current revision and a real reason. The server requires `pilot_ready`, current green readiness, a matching accepted attestation and an active participant membership. Start with the smallest window and observe application, database, Realtime/cursor polling, delivery and operator-session health.

## Emergency pause

For an operational incident, first use `set_routine_pilot_new_work_paused(true, …)`. It blocks new runs, new bundles and scheduled-run starts while allowing joined/active work, deviations, handovers, transfers and finish flows to complete. Resume only through the same RPC after review.

## Rollback to shadow

Stop new work, let or deliberately close all active runs and Double Shift bundles, verify immutable history, then invoke the mode RPC for `pilot → shadow` with current revision and a real reason. The server refuses downgrade while active work exists. Do not delete runs, events, deliveries, comparisons, corrections, overrides, attestations or operation receipts. Keep the release stage and database schema unless a separately reviewed forward migration changes them.

Routine snapshots, events, deliveries, reconciliations, manager overrides, history corrections, release/E2E attestations and idempotency receipts are historical evidence. Rollback changes availability/mode, not those records. Never use direct DML or trigger disablement to hide a completed action.

## Legacy continuity

The five legacy tables stay unchanged and usable. The K4 adapter reads only rows explicitly scoped to the current organization, labels them `legacy_shift_log`, does not infer v2 audit fields, and exposes NULL-organization data only as a manager-only aggregate. There is no automatic backfill or ownership assignment. Verify legacy navigation before and after every web deployment.

## Web and service-worker rollout

Deploy only after database compatibility is verified. Network-first navigation must receive the current `index.html`; hashed lazy manager, employee and history chunks must load from that document. A chunk mismatch presents a controlled reload and sends no mutation. Verify that the service worker caches no Auth/RPC request, PIN/token, private reference image or claimed-fresh server status.

## Local release-candidate evidence

The Phase 10K4 local release candidate passed 226 E2E/browser checks across all 36 required scenarios: 26 in Chromium and 10 in WebKit. The matrix covered concurrent contexts, 320 px and 390×844 mobile layouts, IndexedDB, ephemeral sessionStorage operator-token handling, offline/reconnect, lazy chunks, controlled chunk recovery, dark mode, 200% zoom, reduced motion, keyboard-only navigation and dialog focus lifecycle. Personal staff, shared operator and personal manager browser scenarios used the actual production Routine Engine clients and components through a loopback-locked test-only proxy to PostgREST and a disposable PostgreSQL 17 database; both participant identities returned positively scoped history, while manager evidence confirmed immutable history and the final shadow rollback state. The manager scenarios also sent exact mode/pause idempotency replays through the production mutation clients, and the server returned prior receipts without a state change. Each scenario completed without an unexpected console error, Vite overlay, horizontal page overflow or automated accessibility violation, and interactive controls met the 48-pixel minimum where present. Evidence screenshots were stored outside the repository. This disposable evidence neither promotes a production release stage nor activates, pauses or changes a production mode.

## Stop conditions

Stop on any project-ref mismatch, new Phase 9 error, RLS/grant drift, protected-domain fingerprint change, missing backup verification, failed Chromium/WebKit scenario, readiness mismatch, unexpected active work, legacy mutation or secret finding. No production activation is permitted without a fresh explicit approval naming the organization, release hash, pilot participants, time window and rollback owner.

# Routine Engine v2 production rollout runbook

Status: review plan through the Phase 10R serviceware-route finalization. The production organization remains `shadow/staff_preview`; the existing 1.1R installation ledger and editable drafts remain unpublished. This document does not apply a migration, install content, publish, promote a release stage, change mode, pause work, or create an operational record.

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
17. `phase10p_routine_readiness_finalization.sql`
18. `phase10q_mesh_routine_content_pack_1_2r.sql`
19. `phase10o_routine_default_privilege_hardening.sql`
20. `phase10r_mesh_routine_content_pack_1_3r.sql`

The 10L migration installs the reviewed content-pack mechanism but does not install organization content. Phase 10P replaces only a private readiness calculation. Phase 10Q replaces only the private provider with 1.2R and never installs or edits organization content. Phase 10O is a forward-only default-privilege hardening for objects created later by the effective migration role; it changes no existing object, grant, policy, row, Storage policy or Realtime membership. Phase 10R replaces only the same private provider with canonical 1.3R and likewise installs or edits nothing. The ordering above is the canonical clean/disposable manifest. A production environment that already has 10O applies only newly approved forward migrations after separate authorization and then repeats the ACL attestations; it never rewrites migration history. No database rollback is required.

## Project-ref preflight

Have two people compare the intended project ref, organization ID, environment label, CLI link target and browser project URL. Stop if any value is empty or differs between the CLI and dashboard. Record only non-secret identifiers. Do not print tokens, database passwords, service-role keys, PINs or operator session tokens.

Immediately before authorizing 10O, use the approved read-only connection to record `session_user` and `current_user`. If the connection uses `SET ROLE`, `current_user` must be the role that will create later objects. Stop unless the intended object-creation role is proven; 10O intentionally contains no hardcoded `FOR ROLE` clause. Production 10O application is not authorized by this document.

## Backup and verification

Create and verify a recoverable database backup using the approved production procedure. Record its restore point and retention. Export catalog-only fingerprints for Auth, Inventory, Inventory Storage, Event Operations and the five legacy tables. Capture row counts and hashes for all existing Routine Engine history/operation tables. Run the complete local regression matrix against the exact release commit.

Apply the chain to an empty disposable database and a restored production-shaped staging database first. Verify that K4 leaves every current mode and later release stage unchanged, advances only K3 contract rows, creates no run/task/bundle/template/content row and is stable on reapply.

## Storage, Realtime, RLS and grants

Create or verify `routine-reference-images` as private, 5 MiB maximum, and JPEG/PNG/WebP only. Verify Phase 10C policies and prepare → server-selected path upload → finalize; clients never build paths. Confirm signed/private downloads and ensure service-worker caches cannot contain private image responses.

Verify that `routine_events`, and only approved tables, are members of `supabase_realtime`. Shared-device operators continue with authenticated cursor polling; do not broaden table SELECT or Realtime grants.

Compare RLS enablement, policies, function owners, fixed search paths and exact authenticated `EXECUTE` grants with the disposable catalog fingerprint. Confirm anon has no Routine Engine access, authenticated clients have no direct mutation DML, and release/E2E attestation tables expose no client DML. Scan the build and repository for service-role keys, secrets, PINs, bearer/session tokens and production URLs.

Before any production migration, run `npm run verify:routine-full-migration-reapply`. Its network-isolated PostgreSQL 17.6 matrix must apply the exact 29-migration Phase 10 sequence through 10AA three times in both the rehearsal (`supabase_admin`) and production-shaped (`postgres`) owner contexts: 87/87 applications per context. Both must produce portable semantic schema fingerprint `f53315ccdfa8d2636c0baad8cd8c3a9d90e5a4033a9225cb0b7493c6ffb05f4f`. The portable payload uses fixed deparser `search_path=pg_catalog`, explicit schema-qualified identities, deterministic records, all non-owner semantic fields, and excludes owners and every ACL category. The former schema/raw/effective fingerprints are environment-dependent diagnostics only.

Acceptance also requires separate literal attestations. Existing-object client access must retain zero `PUBLIC`/`anon` Routine function execution, the exact authenticated 218-signature function allowlist, the reviewed 32/32 public/internal signature contract, zero direct client Routine DML, the exact authenticated 65-relation SELECT allowlist, zero unconditional or broad (`PUBLIC`/`anon`) Routine RLS, and canonical validator argument names. The existing authenticated policies remain predicate-constrained even though PostgreSQL labels their policy-combination mode `PERMISSIVE`. Default ACL must separately prove that future public tables, sequences and functions created by the effective `current_user` give `PUBLIC`, `anon` and `authenticated` no privilege while owner access remains. Actual owners, `postgres`, `supabase_admin`, `service_role`, privileged grants and `pg_default_acl.defaclrole` are reported as environment evidence and never normalized into browser access. Stop on any client/default-ACL mismatch or an owner outside the narrow Routine variants (`postgres`/`supabase_admin`) and the reviewed infrastructure owners (`pg_database_owner`/`supabase_storage_admin`).

## Phase 10A1 and 10M migration-manifest checkpoint

The affected artifacts for the current review tree are pinned below. These hashes are local-review evidence, not migration approval:

| Artifact | SHA-256 |
|---|---|
| `supabase/phase10a1_routine_organization_settings_bootstrap.sql` | `56ac1afa16d5676bd0c7118b4e246d5d7558aa65e18cd88f0e1dbd4cb86ba2cd` |
| `content/routine-engine/mesh-routine-content-v1.json` | `fc2e639d692a3850200f73738946f40d8cde16ffc8cae7f65ab38fd077a56a3c` |
| `content/routine-engine/mesh-routine-content-v1-2r.json` | `cc135dadb310cf87cd1af4589179ebef20de429130f9dfb5c54dcd5340a28b41` |
| `supabase/phase10l_mesh_routine_content_pack.sql` | `f91b0479bffc9456954c5f1de388b5713039aa9ad8cc72042aab4da7f213a1fa` |
| `supabase/phase10p_routine_readiness_finalization.sql` | `53488c334bfcc86a24df98fe1bb0ab1ac694d950f4684268a1d8742a912a04f5` |
| `supabase/phase10q_mesh_routine_content_pack_1_2r.sql` | `73004f725d077879843daa5c6d0caf322955a32b85f823abb65d86985255b296` |
| `supabase/phase10o_routine_default_privilege_hardening.sql` | `ca8c96adb59d936a4b36d360da260e535fbe92b50ecfcf68137c8fe113b400ce` |
| `content/routine-engine/mesh-routine-content-v1-3r.json` | `f75e194ab450e1c381e463698d219f13042d45a366819a56c3ebfe1450974b67` |
| `supabase/phase10r_mesh_routine_content_pack_1_3r.sql` | `f62d9464d70eaca7e1e0e9e2f937e3294cf6faafbd0f702a59fab5558f260822` |
| `docs/routine-engine-v2-mesh-content-v1.md` | `dd0483555368f2cd9f3ad2774e211157dc3774d87e0f3785e3d1798f4488cc20` |
| `docs/routine-engine-v2-mesh-operational-standards-amendment-2026-08-07.md` | `aed94b69e98e7f7ed6ace5a37d84cf50770ea6fd3337b536898179f9c4f8c2a8` |

Gate 0 and Gate 1 must be rerun against the eventual new commit before any production migration. A later edit requires regenerating these affected hashes; never rely on this uncommitted-tree table as production authorization.

## Shadow and manager preview

Preserve the installed `shadow/staff_preview` state. The portable schema, literal client ACL, literal default ACL and owner/platform attestations remain mandatory for every forward migration. Verify legacy Opening/Closing operation, Stock Count, Inventory Storage and Event Operations. Never move from shadow to pilot without a separate approval.

Managers review foundation, locations/routes, standards, reference images, devices/operators, pilot membership candidates, history sources and the legacy unscoped aggregate. Shared-device identities must not open manager surfaces. Resolve blockers with existing manager RPCs; do not edit tables directly.

## Phase 10L content installation and publication

Production already has the immutable `mesh-routine-content@1.1R` installation ledger and two editable drafts. Do not reinstall or rewrite that historical ledger. After fresh Gate 0/Gate 1 approval, apply the reviewed 1.2R and 1.3R amendments only through supported personal-manager draft/Foundation RPCs with expected revisions and stable idempotency keys. Re-preview after every semantic group and compare IDs, draft hashes and expected divergence. Amendments must not publish, create a run or bundle, or change mode/stage.

The 1.2R amendment preserves the cup/glass layouts, four Workbar-assigned Coffee Canisters, six tea names, door/lock rules and fridge rules, and corrects only reviewed terminology and seven task groups. Full and service-ready cup/glass standards are visually identical, not numeric; O29/O35 recheck independently. Cornerbar has a separate structured operating standard but no third routine. Event-active scope uses formal transfer/evidence and never N/A. The 1.3R amendment resolves the former serviceware-route blocker with one shared authoritative standard, the exact 12-step route, eight-kitchen scope, clean/dirty tray separation, Opening deadline 10:45, post-lunch target around 13:30 and physical Workbar-default completion. O15 and C03 execute the route for their distinct windows; C27 reuses its evidence rather than forcing a duplicate walk. Never create room 005.

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

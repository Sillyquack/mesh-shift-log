# Mesh Shift Log — production runbook for Monday 17 August 2026

**Status:** production-candidate plan. No step in this document authorizes a production change by itself.

**Timezone:** every timestamp below is Europe/Oslo (CEST, UTC+2).

## Objective

Have the role-aware Mesh Shift Log experience available for official operational use from **Monday 17 August 2026 at 07:00**, with enough earlier windows to stop safely, correct a blocker, and try again without forcing a risky launch.

The production candidate consists of:

1. Julie’s current event routines and focused Event Mode.
2. Shared Mesh Experience System and focused Shift Mode.
3. Focused Inventory Count Mode.
4. Role-aware login and launch surfaces.
5. Manager home with Today / Attention / Control.
6. Operations Studio with grouped manager tools.
7. Permanent Visual Standards upload queue.
8. Least-privilege Event Mode access to current allowlisted event images.

## Proposed deployment windows

These are recommended working windows, not automatic jobs.

| Window | Oslo time | Purpose |
|---|---|---|
| Primary | **Friday 14 August 23:30 → Saturday 15 August 02:00** | Preferred database migration, app deployment and first smoke test |
| Fallback 1 | **Saturday 15 August 23:30 → Sunday 16 August 02:00** | Correct and retry any blocker found in the primary window |
| Fallback 2 | **Sunday 16 August 22:30 → Monday 17 August 01:30** | Final controlled opportunity before launch morning |
| Launch check | **Monday 17 August 06:15 → 07:00** | Final role checks, operational briefing and go/no-go |
| Official use | **Monday 17 August 07:00** | Staff begin using the released workflow |

Do not continue past a stop condition merely to preserve the preferred date. A controlled fallback is better than a half-working Monday launch.

## Change stack and merge order

Merge only after the complete production-candidate review is approved.

1. **PR #13** — Julie routines and focused Event Mode.
2. **PR #14** — shared Mesh Experience System and focused Shift Mode.
3. **PR #15** — focused Inventory Count Mode.
4. **Production-candidate PR** — login, manager experience, Operations Studio, Visual Standards and Event image bridge.

Each PR is stacked on the previous one. Do not squash or merge them out of order unless the final combined diff has been independently reverified.

## Database migration order

The production preflight must first establish the exact migration currently installed in production. Apply only migrations not already installed, while preserving this repository order:

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
21. `phase10s_mesh_routine_content_pack_1_4r.sql`
22. `phase10t_routine_participant_identity_conflict_alignment.sql`
23. `phase10u_routine_operation_idempotency_convergence.sql`
24. `phase10v_routine_creation_idempotency_provenance_alignment.sql`
25. `phase10w_event_visual_reference_bridge.sql`

`phase10w` is additive. It adds a sanitized event-image metadata RPC and extends the existing private Storage read predicate for current allowlisted event images. It does not grant Event Floor Managers routine-table writes or manager permissions.

## Required evidence before the first window

All of the following must be present before Friday 14 August 23:30:

- PR stack is conflict-free and the final branch is ahead of, not behind, PR #15.
- Production build succeeds from a clean dependency install.
- Julie event routine verification passes.
- Event Mode, Shift Mode and Count Mode experience verification passes.
- Auth and permission checks pass.
- Routine manager, reference-image and history checks pass.
- Full Phase 10 migration reapply verifier passes in a disposable database.
- Event visual-reference bridge passes its dedicated disposable-database authorization matrix.
- The current production migration state is documented.
- Backup / point-in-time recovery availability has been checked in the production Supabase project.
- No unresolved Sev-1 or Sev-2 production incident exists.
- No active Stock Count, routine finalization or event transition is underway when the write freeze begins.
- Bobby has the production app rollback target and the previous known-good commit readily available.

## Pre-window preparation

Complete before 23:00:

1. Review every frontline instruction in the combined preview.
2. Prepare all images locally using the Visual Standards checklist.
3. Confirm all images are free of credentials, alarm codes, personal data and unintended customer information.
4. Confirm manager, Julie, one staff profile, one shared-device profile and one counter profile can be used for smoke testing.
5. Record the current production app commit, deployment identifier and database migration state.
6. Export or otherwise record any operational data needed for comparison after deployment.
7. Notify affected users of the maintenance window and expected login interruption.

## Window procedure

### 1. Open the window

- Confirm current time and announce the write freeze.
- Confirm no user is actively completing a critical workflow.
- Confirm production backup / PITR health.
- Confirm the release candidate commit has not changed since verification.
- Re-run the final static/build checks against that exact commit.

**Stop immediately** if the candidate differs from the verified commit or backup health cannot be confirmed.

### 2. Database preflight

- Read the production migration ledger and schema state.
- Produce the exact list of pending migrations from the ordered list above.
- Confirm no pending migration attempts to reapply an unsafe older phase after a terminal hardening migration.
- Run a dry-run or equivalent schema comparison where the production workflow supports it.
- Confirm migrations contain no production URL, service-role credential or destructive down step.

**Stop immediately** for an unexpected destructive statement, unknown drift, missing prerequisite or migration-order mismatch.

### 3. Apply database migrations

- Apply pending migrations in the exact approved order.
- Capture output for every migration separately.
- After each logical group, run its minimal readback rather than waiting until the end.
- Do not manually edit production rows to “help” a migration pass.
- Do not bypass RPCs with ad-hoc administrative SQL for normal application setup.

Suggested checkpoints:

- After 10A–10C: manager workspace, templates, private image bucket and reference metadata exist.
- After 10D–10K4: runs, lifecycle, offline behavior, shared-device identity, manager and employee contracts exist.
- After content-pack and hardening phases: published content and privilege fingerprints match the approved candidate.
- After 10W: manager and Event Floor Manager can read only the intended visual-standard paths; ordinary staff behavior remains unchanged.

### 4. Database smoke tests before app deployment

Run with real production identities but non-destructive reads wherever possible:

- Manager can open the manager workspace.
- Julie’s Event Floor Manager profile can call the sanitized event visual-reference metadata RPC for an allowlisted key.
- Julie cannot read routine reference tables directly through the app role.
- Julie cannot request an unsupported reference key.
- Julie cannot read an old image version or another organization’s image.
- Ordinary staff retains the existing published-routine image path only.
- Counter remains restricted to assigned Stock Count locations.
- Shared device retains shared-device restrictions.

**Stop immediately** if a role sees more data than intended. Permission broadening is a release blocker.

### 5. Deploy the application candidate

- Deploy the exact verified combined commit.
- Keep the previous production deployment available for immediate app rollback.
- Wait for the deployment platform to report a healthy build and ready state.
- Open the production URL in a fresh private browser session before asking any staff member to test.

### 6. Role smoke-test matrix

#### Manager

- Login screen is usable and auth errors remain visible.
- Manager home opens with Today / Attention / Control.
- Existing manager actions still work inside the grouped sections.
- Operations Studio opens and all five groups are reachable.
- Visual Standards shows the event upload queue.
- Missing event slots can be created as placeholders.
- One small test image can be uploaded, opened and replaced without losing version history.
- History opens without exposing stale data as current data.

#### Event Floor Manager / Julie

- Event Mode opens directly for the assigned event.
- Focus shows one next task.
- Journey shows the complete event path.
- Help can send a live update.
- “Show visual guide” opens the written checklist even before images are uploaded.
- An uploaded current image opens.
- A placeholder is clearly shown as a placeholder.
- Closing the visual guide returns focus to Event Mode.

#### Staff / shared device

- Shift Mode opens with Now / Shift / Help.
- A routine can be opened without manager or database noise.
- Offline and reauthentication messages remain honest.
- Shared device cannot enter manager or personal-only areas.

#### Inventory Counter

- Count Mode opens only assigned locations.
- Blank and zero remain distinct.
- Save advances to the next incomplete product.
- Progress and Review work.
- Submission does not approve the whole Stock Count.

### 7. Upload production Visual Standards

After manager and Julie smoke tests are green:

1. Open Operations Studio → Build → Visual standards.
2. Create any remaining safe placeholders.
3. Upload images one by one using the prepared checklist.
4. Add a meaningful image description for every actual image.
5. Open each image from the manager view after upload.
6. Open the same guide from Julie’s Event Mode.
7. Record any slot intentionally left as a placeholder.

A placeholder is allowed and must remain honest. A broken image, wrong image or inaccessible current image is not allowed.

### 8. Close the window

- Record the final database migration state.
- Record the deployed app commit and deployment identifier.
- Record smoke-test results by role.
- Record uploaded image counts and remaining placeholders.
- Lift the write freeze only after go/no-go is explicit.
- Notify users whether the release is ready, delayed to the next window or rolled back.

## Go / no-go criteria

### Go

Proceed when all are true:

- Database migrations completed without unexpected drift.
- No permission boundary widened.
- Production build and role smoke tests pass.
- Critical operational content is understandable.
- Current images open for manager and Julie where uploaded.
- Missing images show placeholders, not broken states.
- No unsent local draft was lost during testing.
- Rollback target is still available.

### No-go

Stop and use the next window for any of the following:

- Cross-organization or cross-role data exposure.
- Manager or Event Floor Manager cannot authenticate reliably.
- Event Mode cannot complete or report tasks.
- Shift Mode loses offline drafts or conflict handling.
- Count Mode overwrites or loses a local count.
- Migration order or schema drift is uncertain.
- Current image cannot be read after a successful upload.
- Build differs from the reviewed candidate.
- A critical instruction is materially wrong or unsafe.

## Rollback and forward-fix strategy

The database work is additive and hardening-oriented. Do not improvise destructive reverse SQL.

1. **Application regression with healthy database:** roll the app back to the previous known-good deployment. Leave additive database objects in place while the frontend is corrected.
2. **New Phase 10W permission defect:** disable use of Event visual guides in the app and apply a reviewed forward-fix migration that narrows the affected function or grant. Do not broadly disable RLS.
3. **Migration stopped before commit:** keep the transaction rolled back and diagnose before retrying.
4. **Migration committed but readback fails:** freeze affected actions, capture state, and use a forward repair. Restore from backup only when integrity cannot be recovered safely through a reviewed forward fix.
5. **Content or image error:** restore the previous current image through the versioned manager workflow or return the reference to an honest placeholder. Do not delete immutable history.

## Monday launch check — 06:15

- Confirm production URL and deployment commit.
- Confirm Supabase health and no overnight alert.
- Login as manager, Julie, staff/shared device and counter.
- Open one routine, one event guide, one historical record and one assigned count location.
- Confirm all remaining placeholders are known and accepted.
- Brief the morning team on the new role-specific navigation.
- Make the final go/no-go decision by 06:50.

If no-go at 06:50, keep the previous app experience active and communicate the delay before the first shift begins.

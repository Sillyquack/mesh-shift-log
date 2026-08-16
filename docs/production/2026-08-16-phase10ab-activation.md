# Phase 10AB supported activation surface

This document is the review and cutover contract for PR #19. It does not authorize a production write by itself.

## Reviewed source and rollback guards

- target branch before PR #19: `phase-9a-inventory-par-levels-stocktaking` at `6f558f44c730733c89e4d463231e439c855ebca8`;
- recovery branch: `codex/activation-surface-2026-08-16`;
- production Pages before PR #19: `11f903d220f42ac0d5a612e4d667cbd6c29fb9fc`;
- preserved Pages rollback: `e712001b1706ec4175c1dd29472a1b35d7844338`;
- exact provider: `mesh-routine-content@1.5R` / `710c9412eabc8f2e9c5a6488499ac4654cd7c94b62138eaed9563ab5f0203c9c`;
- Phase 10AB SQL SHA-256: `2935a960b2cd22429d02d4594ce68bb874d909fcdbd5eeea64e120a09e5160a3`;
- portable 30-migration schema fingerprint: `34d7797a5e8b992d422dbc39bb6dc91c83082d09f2fef749d9ca58a61be0da3d`.

The production write freeze stays active until the complete pilot readback is green. The migration may be applied only after PR #19 exact-head Core and Browser jobs pass and the PR merges normally.

## Migration boundary

`supabase/phase10ab_mesh_routine_content_1_5r_activation_recovery.sql` adds exactly two `security definer`, fixed-search-path functions:

- `preview_mesh_routine_content_1_5r_activation_recovery()`;
- `apply_mesh_routine_content_1_5r_activation_recovery(text,text,uuid)`.

Both derive organization and actor from a personal authenticated manager, grant only `authenticated`, and reject anonymous, shared-device, Event Floor Manager, counter, and staff callers. Applying the migration changes no content, publication, membership, E2E, mode, stage, Routine work, Stock Count, or image state.

The apply operation accepts only the exact known production baseline or its exact target for seven resources. It takes one organization-and-pack advisory lock, compares the transaction-local state hash, preserves the two reviewed drafts as discarded history, creates deterministic empty drafts, requires the provider analysis to become conflict-free, and invokes the existing normal installer. One immutable `routine_ui_operations` response records the operation and its sanitized before/after evidence.

## Preserved draft proof

The sanitized proof is versioned at `docs/production/artifacts/activation-recovery/preserved-draft-field-proof.json`. Its source report SHA-256 is `7ce653388b1c5c815ee07e7f642492bf388c2de6333d063d0c3d42eda6efc02a`; it proves 15 edited tasks, 19 edited items, 129 field differences, zero conflicts, and zero unknown edits without including operational task text or credentials.

The apply transaction must retain every child row and the exact canonical content/export hashes. The fixed discard reason is:

> Preserved immutable pre-1.5R reviewed draft before installing exact mesh-routine-content@1.5R.

## Visible manager workflow

Activation exists only under the authenticated Operations Studio System area. Every write requires one exact phrase and one stable per-render idempotency key:

1. `INSTALL 1.5R` — exact recovery RPC;
2. `PUBLISH PILOT` — normal two-version batch publication;
3. `ADD JULIE` — normal complete desired-state membership replacement, using the server readiness timestamp;
4. `ATTEST E2E` — normal E2E attestation RPC after canonical evidence-hash validation;
5. `PROMOTE PILOT READY` — normal readiness-hash promotion;
6. `START PILOT` — normal mode RPC limited to `pilot`.

No control exposes `active`, `production_ready`, shared-device enablement, image upload, profile mutation, or operational Routine/Stock Count creation. After `pilot_ready` plus `pilot`, the workflow is read-only evidence.

## Production browser evidence

`npm run verify:production-activation-browser -- --source-commit <merged-head> --pages-commit <pages-head>` runs headed Chromium and WebKit against the canonical production URL. It uses separate local browser profiles for Bobby, Julie, and the real counter, opens only visible application surfaces, never reads browser storage, and writes no credential or token data. When a session is missing it emits `AUTHENTICATED_LOGIN_REQUIRED|<engine>|<profile>|<profile-dir>` and performs no activation write.

After all in-scope journeys pass, it generates the ignored local artifact `docs/production/artifacts/activation-browser/activation-e2e-evidence.json` plus eight hashed screenshots. The Activation UI accepts that JSON only when its exact schema, two published IDs/hashes, Julie membership UUID, both-engine results, disabled shared-device claim, zero console/network counts, screenshot hashes, and canonical artifact SHA-256 all validate.

## Ordered production cutover

1. Re-run repository, Pages, production-ledger, provider, profile, draft, and zero-operative-state guards.
2. Merge PR #19 only after fresh exact-head Core and Browser success.
3. Apply only Phase 10AB and read back its ledger row, definitions, owners, search paths, and grants.
4. Deploy the exact merged frontend and confirm Pages commit, HTTP 200, assets, and zero console errors.
5. Use Bobby’s visible Activation tab to prepare/install 1.5R, then read back preserved drafts, new drafts, installation, seven alignments, and unchanged safety counts.
6. Run the visible safety scan, publish both versions together, and read back exact publication IDs, hashes, group, note, and no active draft.
7. Add Julie as the only active participant and read back her unchanged `event_floor_manager` role and `participant` access.
8. Run headed Bobby/Julie/counter/disabled-shared-device journeys in Chromium and WebKit, then validate and attest the generated evidence.
9. Promote to `pilot_ready`, confirm mode still `shadow`, then set mode to `pilot` and repeat essential role smoke.
10. Lift the freeze only after shared-device is still false and no Routine run, bundle, or Stock Count was created.

Any drift, third resource state, failed CI, failed deployment, unsupported identity, console/network error, or incomplete readback is a stop condition. No SQL content operation, replayed prior migration, hidden-module invocation, request-claim impersonation, role change, image upload, inventory mutation, or gate weakening is permitted.

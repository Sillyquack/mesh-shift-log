# Inventory Counter Experience — Count Mode

Date: 2026-08-14

## Purpose

Bring the same calm, premium and guided product direction established by Event Mode and Shift Mode to the inventory counter role without weakening any Stock Count integrity, access or audit boundary.

## Experience

The counter-facing Stock Count is now organized around three operational surfaces:

- **Count** — one active product at a time, one clear save action and automatic movement to the next incomplete product.
- **Progress** — the whole assigned location with counted, incomplete, deviation and unsaved states visible at a glance.
- **Review** — explicit blockers, deviations, comments and a guarded location submission to Bobby.

The location home prioritizes returned work first, then the next incomplete assignment. Multiple assignments remain available without presenting manager configuration or catalogue access.

## Visual language

Count Mode uses the shared Mesh Experience System:

- charcoal and warm-black operational canvas
- warm cream primary focus surfaces
- muted gold progress and current-state treatment
- restrained completion, warning and error colors
- prominent progress rings
- 48 px minimum operational touch targets
- fixed mobile Count / Progress / Review navigation
- safe-area handling, responsive layouts and reduced-motion support

## Preserved operational integrity

The redesign retains the existing counter model:

- verified Supabase Auth counter identity
- assignment- and location-scoped reads and writes
- one sanitized counter workspace RPC
- exact distinction between blank, explicit zero and saved zero
- unit, container-plus-volume and keg-fraction quantities
- expected assignment revision and expected line timestamp on writes
- stale-write detection without discarding the local draft
- stable single-operation and single-save guards against rapid duplicate taps
- safe refresh while keeping local drafts
- before-unload and logout protection for unsaved or failed work
- explicit physical confirmation before applying exact standards
- submitted and accepted assignments remain read-only
- returned assignments remain editable and auto-open with the manager message
- superseded assignments remain non-actionable
- location submission never completes or approves the manager-owned Stock Count session

## Architecture

The prior combined counter/manager module is preserved as `InventoryCounterWorkflowsLegacy.jsx` so the manager assignment, replacement and review controls remain unchanged.

`InventoryCounterWorkflows.jsx` is now a narrow router:

- counter users receive `InventoryCounterExperience`
- manager tools continue to consume the preserved `CounterAssignmentManager`

This separation keeps the frontline experience focused while minimizing regression risk in manager operations.

## Verification

The slice is covered by a dedicated Count Mode verifier and the full existing Phase 9 verification suite, including source contracts, access boundaries, stale writes, assignment lifecycle, concurrency, immutable history, export behavior, disposable PostgreSQL checks and the production Vite build.

## Not included

- no Supabase migration
- no production data change
- no merge
- no production deployment
- no redesign of the manager inventory workspace in this slice

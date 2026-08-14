# Mesh Shift Log pre-production experience — 14 August 2026

## Scope

This slice completes the reviewable experience layer before production cutover. It is stacked on PRs #13–#15 and changes no production data by itself.

### Role-aware entry

- Manager: **Today / Attention / Control**
- Staff and shared device: **Now / Shift / Help**
- Event Floor Manager: focused **Event Mode**
- Counter: **Count / Progress / Review**

Technical diagnostics remain available behind deliberate disclosures rather than appearing as frontline navigation.

### Manager

- Today summarizes active work, content and visual readiness.
- Attention shows only missing images, foundation warnings, release risks and exception review.
- Control contains templates, content pack, visual standards, operators, pilot access, foundation, history, review and release controls.

### Visual Standards

- gallery of all logical references;
- placeholder versus approved-image status;
- existing prepare/upload/finalize contract;
- JPEG, PNG and WebP only, maximum 5 MiB;
- required alt text, optional caption;
- version history and task usage preserved;
- private Storage and stale-revision safeguards remain unchanged.

### History and release

- History is organized as **Recent / Find / Review**.
- Routine Engine v2 and legacy history remain visibly separate.
- Production Readiness is a clear **GO / NO-GO** surface.
- Readiness hash, expected revision, attestation and pause controls remain server-authoritative and audited.

## Security hardening

Phase 10W removes unnecessary `PUBLIC`/`anon` execution from the Event Operations `SECURITY DEFINER` surface, preserves exact authenticated frontend/RLS access, makes trigger helpers internal-only and fixes `public.set_updated_at()` to a fixed search path.

It changes no rows, table grants, RLS policies, event records, Routine Engine records, inventory records or release mode.

Verification includes:

- exact identity preflight and postcondition;
- static frontend/auth contract checks;
- disposable Supabase/PostgreSQL application;
- runtime `anon` denial and `authenticated` preservation;
- unchanged function source code and event/calendar table ACLs;
- exact second application with the same effective result.

## Live read-only preflight

Production remains `ACTIVE_HEALTHY` in `eu-west-1` on PostgreSQL `17.6.1.127`.

- Routine settings: `shadow`, `staff_preview`, revision 4.
- Routine content: 2 draft templates, 0 published templates, 0 runs.
- Visual standards: 40 logical references, all linked, all currently placeholders.
- Content provider: 1.4R; recorded installed pack: 1.1R.
- Event Operations: 9 events, 37 tasks and 18 imported calendar events.
- Inventory: 6 sessions, 563 lines, 0 counter assignments.
- Phase 10S–10V outcomes are present in live definitions although their ledger entries require reconciliation.

## Production boundary

No merge, production deployment, Supabase migration, content installation, image upload, template publication, UI-stage promotion or mode change is performed by this branch.

The exact cutover order is documented in `docs/production/2026-08-14-cutover.md`.

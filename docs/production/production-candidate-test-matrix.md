# Mesh Shift Log — production-candidate test matrix

This matrix separates four different kinds of evidence so that a missing local dependency is not confused with an application failure.

## Evidence levels

| Level | Meaning |
|---|---|
| Automated source / model | Deterministic assertions against code, data models and UI contracts |
| Disposable database | Real PostgreSQL migrations, roles, RLS, grants, stale writes and concurrency in a network-isolated container |
| Browser matrix | The actual Vite bundle exercised in Chromium and WebKit across required desktop, tablet and mobile viewports |
| Production build | Clean dependency install and Vite production bundle |
| Manual role journey | Human review of the complete experience at desktop and mobile widths |

A production go decision requires all applicable automated and database checks plus the manual critical journeys.

## Automated production-candidate checks

| Area | Command | Required result |
|---|---|---|
| Password and auth safety | `npm run verify:auth-password-security` | Pass |
| Operations-owned event content | `npm run verify:event-routine-content` | 7 templates, 99 tasks and 31 guides verified |
| Canonical Event visual library | `npm run verify:event-visual-library` | 29 guides (27 canonical + 2 compatibility), 49 zones and 65 unique ordered angles; generated SQL/manifest equality and source-safety checks pass |
| Event Mode experience | `npm run verify:event-operator-experience` | Role-gated English low-noise Event Mode; manager cockpit preserved |
| Event visual bridge | `npm run verify:event-visual-reference-bridge` | Allowlist, same-org metadata, current-image Storage access and denial matrix pass |
| Shared experience system | `npm run verify:mesh-experience-system` | Shared tokens and Shift Mode pass |
| Combined production experience | `npm run verify:production-candidate-experience` | Login, manager hierarchy, Operations Studio and image queue pass |
| Inventory Count Mode | `npm run verify:inventory-counter-experience` | Count / Progress / Review and integrity controls pass |
| Routine manager | `npm run verify:routine-manager-ui` | Manager control contracts and accessibility pass |
| Routine references | `npm run verify:routine-reference-images` | Private versioned image workflow and PostgreSQL assertions pass |
| Routine history | `npm run verify:routine-history-pilot` | Atomic history, permissions and read-only detail pass |
| Routine UI foundation | `npm run verify:routine-ui-foundation` | Role routing and shared UI contracts pass |
| Full Phase 10 reapply | `npm run verify:routine-full-migration-reapply` | Exact ordered Phase 10 migration stack reapplies safely in disposable PostgreSQL |
| Event visual browser matrix | `npm run verify:event-visual-library-browser` | 71/71 checks across 13 Chromium/WebKit scenarios at 1440, 1280, 1180, 1024, 430, 390, 375 and 360 px |
| Release-review role surfaces | `npm run verify:release-review-browser` | 37/37 checks: Manager Today/Attention/Control and Event Mode Focus/Journey/Help across Chromium/WebKit desktop, tablet and mobile fixtures |
| Count Mode browser flow | `npm run verify:inventory-count-mode-browser` | 11/11 checks: the saved-standard action submits once, preserves separate-location/no-overwrite copy and opens the next fridge |
| Routine content browser matrix | `npm run verify:routine-content-visual` | 365/365 checks across 70 Chromium/WebKit scenarios |
| Shift/History end-to-end browser matrix | `npm run verify:routine-e2e-pilot` | 411/411 checks across 36 scenarios with a disposable PostgREST/PostgreSQL backend |
| Production bundle | `npm run build` | Vite build succeeds with no unresolved import or syntax error |

## Disposable database authorization matrix

### Visual Standards and Event Mode

| Actor | Metadata RPC | Current allowed event image | Old image version | Unsupported key | Other organization | Direct reference-table rows |
|---|---:|---:|---:|---:|---:|---:|
| Manager, same organization | Allowed | Allowed | Allowed | Manager workflow only | Denied | Manager RLS only |
| Event Floor Manager, same organization | Allowlisted keys only | Allowed | Denied | Denied | Denied | Zero rows |
| Staff | Denied | Existing published-routine path only | Denied | Denied | Denied | Existing published RLS only |
| Shared device | Denied | Denied unless separately authorized by existing routine contract | Denied | Denied | Denied | Denied |
| Inactive profile | Denied | Denied | Denied | Denied | Denied | Denied |
| Counter | Denied | Denied | Denied | Denied | Denied | Denied |

The Event visual bridge must not modify the manager upload boundary or the existing staff published-routine boundary.

### Existing critical integrity checks

- One active Stock Count session per organization.
- Approved Stock Count history remains immutable.
- Blank, explicit zero and saved zero remain distinct.
- Stale writes preserve local drafts.
- Rapid repeated taps do not execute duplicate mutations.
- Routine task and run mutations remain idempotent.
- Shared-device identity remains separate from personal identity.
- Offline queue conflicts require an explicit user decision.
- Routine reference versions remain immutable after finalization.
- Cross-organization reads and writes remain denied.

## Browser matrix evidence

The exact release worktree was exercised locally on 15 August 2026 with the repository's isolated Vite/Playwright harnesses:

- Chromium and WebKit.
- Event reconstruction and grouped manager queue at 1440, 1280, 1180, 1024, 430, 390, 375 and 360 CSS pixels.
- Explicit placeholder, failed-image, written-only Workbar, keyboard-only and reduced-motion states.
- Count Mode saved-standard one-tap flow at 430 and 360 CSS pixels.
- Shift Mode, shared-device, offline/reconnect, History, readiness and rollback scenarios against a disposable backend.
- The 70-scenario content/operational-standards matrix, including light/dark, mobile, keyboard and 200% zoom states.
- Assertions include console/page errors, Vite overlays, horizontal overflow, 48 px operational targets, duplicate IDs and accessible control names/labels.

Retained release evidence is in `docs/production/artifacts/release-review-browser/`, `docs/production/artifacts/event-visual-browser/` and `docs/production/artifacts/count-mode-browser/`. The larger pre-existing matrices wrote ephemeral screenshots under `/private/tmp` and completed successfully; no production service was used.

## Manual review journeys

### 1. Login and role routing

Test at 390 px mobile width and desktop width.

- Personal login, shared-device login and password reset are visually clear.
- Wrong password and expired session remain visible errors.
- Manager lands in the manager experience.
- Julie lands in Event Mode.
- Staff/shared device lands in Shift Mode.
- Counter lands in Count Mode.
- No role can navigate to a higher-privilege home through browser history or stale local state.

### 2. Manager — Today / Attention / Control

- Today contains the current operational areas and not the full administration catalogue.
- Attention contains items that require a decision, without hiding critical errors.
- Control retains every previous manager action.
- Switching views does not reset a form draft or execute a write.
- Mobile bottom navigation does not cover actionable content.

### 3. Operations Studio

- Today, Build, People, History and System groups are obvious.
- Secondary tabs remain keyboard reachable.
- All former manager sections still exist.
- Content, routine and reference edits preserve drafts on failure.
- Publish remains a deliberate manager action.

### 4. Visual Standards

- The grouped queue contains all 65 canonical Event visual angle slots.
- Missing slots can be created as placeholders through the guarded manager RPC.
- An actual image cannot upload without a meaningful description.
- JPEG, PNG and WebP work; unsupported or oversized files fail safely.
- A successful replacement creates a new immutable version.
- The previous image remains intact when a replacement fails.
- A placeholder remains a warning, not a publication blocker.
- Manager can open the current image after upload.

### 5. Julie — Event Mode

- Focus, Journey and Help remain low-noise.
- Complete task advances the operational journey.
- Help can send a plan change, technical problem, missing item or support request.
- Show visual guide opens the correct guide.
- Current uploaded images render.
- Missing images render honest placeholders.
- Written checklists remain usable if an image download fails.
- Escape, close button and backdrop close work.
- Keyboard focus enters the modal, remains trapped and returns to the triggering control.
- Old versions and unsupported keys are not visible.

### 6. Staff/shared device — Shift Mode

- Now presents one primary mission.
- Shift shows the full work journey without database or transport language.
- Help contains conflicts, deviations and handovers.
- Offline drafts survive refresh and failed writes.
- Reauthentication does not erase input.
- Shared device cannot impersonate a personal manager.

### 7. Counter — Count Mode

- Only assigned physical locations or refrigerators are visible.
- The same product in different refrigerators remains separate count lines.
- A fully matching refrigerator presents the saved-standard decision first.
- “Done — count & next fridge” physically confirms the whole refrigerator, fills only eligible exact-standard lines, submits only that assignment for manager review and opens the next assigned refrigerator.
- Manager acceptance of the assignment and approval of the whole Stock Count session remain separate.
- “No — count differences” opens manual counting only inside the current refrigerator.
- Blank and explicit zero remain distinct.
- Existing notes, counts, deviations and targetless rows are never overwritten.
- The three protected wines remain physical units until the final Millum export conversion.
- Progress shows full location state and Review blocks incomplete, invalid or unsaved work.
- Submitted and accepted assignments are read-only.
- Returned work opens with the manager message.

### 8. History

- Recent history loads without showing prior selected detail as the new record.
- Failed or incomplete loads show an error, not a false zero result.
- Approved records are read-only.
- Search and filters are reachable on mobile.
- Legacy history remains clearly identified.

## Content source provenance

`npm run verify:routine-content-pack` passed 372/372 checks against the exact approved source documents retained under `content/routine-engine/source-evidence/` and their pinned SHA-256 hashes. The hash gate was not disabled, relaxed or bypassed. This authorizes review of the later draft-only 1.4R installation plan; it does not install or publish content.

## Remote release evidence

`.github/workflows/release-review.yml` is a review-only pull-request check for PR #17. It has read-only repository permission, receives no production secret, performs no deployment or production write, and runs the required migration-plan, combined-experience, visual-library, authorization, Stock Count, content-provenance and build checks. The exact PR #17 head must have a clean run before the separately approved merge.

## Production smoke-test evidence template

| Check | Actor | Device / width | Result | Evidence / note |
|---|---|---|---|---|
| Login and route | Manager |  |  |  |
| Today / Attention / Control | Manager |  |  |  |
| Visual placeholder creation | Manager |  |  |  |
| Image upload and open | Manager |  |  |  |
| Focus / Journey / Help | Julie |  |  |  |
| Current visual image | Julie |  |  |  |
| Placeholder fallback | Julie |  |  |  |
| Now / Shift / Help | Staff |  |  |  |
| Offline draft preservation | Staff/shared device |  |  |  |
| Count / Progress / Review | Counter |  |  |  |
| History detail | Manager |  |  |  |
| Cross-role denial | All restricted roles |  |  |  |

## Release decision

- **Green:** every critical automated, database and manual row passes.
- **Amber:** only documented non-critical image placeholders remain; written instructions and operational safety are complete.
- **Red:** any permission leak, lost draft, broken critical workflow, uncertain migration state or materially incorrect instruction.

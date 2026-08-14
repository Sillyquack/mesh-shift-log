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
| Julie’s event content | `npm run verify:julie-event-routines` | 7 templates, 96 tasks and 10 guides verified |
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
| Browser visual matrix | `npm run verify:routine-content-visual` | 70/70 scenarios pass in Chromium and WebKit at 1440, 1280, 1024, 430, 390, 375 and 360 px in light and dark modes |
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

The production-candidate bundle passed the isolated Playwright matrix in GitHub Actions on Friday 14 August 2026:

- Chromium and WebKit.
- Five operational scenarios: Opening, Closing, Double Shift, counter daily and manager preview.
- Seven viewports: 1440, 1280, 1024, 430, 390, 375 and 360 CSS pixels.
- Light and dark mode.
- 70 scenarios in total.
- Assertions include horizontal overflow, covered controls, 48 px operational targets, duplicate IDs, label relationships, English frontline copy and visual screenshots.

The retained browser-evidence artifact contains the matrix log and generated screenshot set. This test exercises the actual Vite application bundle; it is separate from the static product walkthrough.

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

- The queue contains all 31 required event image slots.
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

- One product at a time.
- Saving advances to the next incomplete product.
- Progress shows full location state.
- Review blocks incomplete, invalid or unsaved work.
- Exact-standard fast path requires physical confirmation.
- Submitted and accepted assignments are read-only.
- Returned work opens with the manager message.
- Submission sends one location only and never approves the session.

### 8. History

- Recent history loads without showing prior selected detail as the new record.
- Failed or incomplete loads show an error, not a false zero result.
- Approved records are read-only.
- Search and filters are reachable on mobile.
- Legacy history remains clearly identified.

## Remaining source-evidence gate

### Content-pack source verification

`npm run verify:routine-content-pack` expects the exact approved source documents currently referenced from Robert’s local Downloads paths. Before production:

1. Put the exact approved source files in the expected local paths or update the verifier to a retained, reviewed fixture location.
2. Confirm the source hashes match the approved content pack.
3. Run the verifier locally.
4. Save the output with the production evidence.

Expected source hashes remain pinned in the verifier. Do not disable or weaken the hash checks merely to make the command green. This is a provenance gate for the content source files, not an application, database or browser failure.

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

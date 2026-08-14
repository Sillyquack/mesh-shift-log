# Mesh Experience System

## Purpose

Mesh Shift Log should feel like one calm, premium operational product even though it serves several very different jobs.

The Event Mode experience is the reference implementation. The rest of the app must adopt the same experience principles without copying the same layout blindly onto every role.

The system should make the right operational action obvious, keep implementation details behind the scenes, and reveal complexity only when the user genuinely needs it.

## Non-negotiable principles

1. **Role before feature**
   - The first question is what this person needs to accomplish now, not which database module owns the data.
   - Operator, counter and manager surfaces are separate experiences.

2. **One primary action per state**
   - Every operational screen has one visibly dominant next action.
   - Secondary actions stay available without competing for attention.

3. **Progress, not dashboards**
   - Frontline users see progress, next step and completion.
   - They do not see internal health, imports, table names, confidence scores, sync architecture or backend terminology.

4. **Progressive disclosure**
   - Explanations, visual standards, deviations and audit details open when needed.
   - Long instructions do not sit permanently in the main flow.

5. **Gamification must support the work**
   - Useful: stages, completion, visible momentum, calm success feedback and a clear finish.
   - Not useful: streaks, leaderboards, artificial scores or competitive pressure.

6. **Mobile is the operational default**
   - Core actions use at least 48 px touch targets.
   - Sticky navigation and one-handed use are first-class requirements.

7. **English operational UI**
   - Frontline labels and instructions remain simple English.
   - Product names and necessary local terminology may remain unchanged.

8. **Manager density is allowed, manager noise is not**
   - Managers need more information than operators.
   - The manager home still starts with Today, Attention and the next decision, not a wall of configuration panels.

9. **Safety and auditability remain intact**
   - Simplifying the interface must never weaken permissions, confirmation, conflict handling, immutable history or stale-write protection.

## Role experience matrix

### Event Floor Manager

Primary navigation:

- **Focus** — the next operational mission
- **Journey** — Prepare, Welcome, Run and Close
- **Help** — fast support signals and visual standards

Status: reference implementation in PR #13.

### Shift employee / shared-device operator

Primary navigation:

- **Now** — one current routine or assigned task
- **Shift** — Opening, Service, Handover and Closing journey
- **Help** — deviations, transfer, visual standards and support

The current routine engine exposes server clock, actor source, release stage, sync internals and several equal-weight collections. These must be translated into a calm shift home while keeping the existing operational contracts behind it.

### Inventory counter

Primary navigation:

- **Count** — one product at a time, with the next incomplete item
- **Progress** — location completion and remaining products
- **Review** — deviations, notes and final send-to-manager confirmation

The counter should never see manager configuration, session approval machinery or database language.

### Manager

Primary navigation:

- **Today** — shift health, active event, active stock count and urgent decisions
- **Attention** — blockers, returned work, overdue tasks and unresolved exceptions
- **Control** — planning, templates, staffing, inventory, content and administration

Advanced tools remain available, but they move behind focused entry points instead of filling the landing page.

### History and reporting

Primary navigation:

- **Recent** — latest completed shifts, events and counts
- **Find** — filters and search
- **Review** — audit detail and export

History is calm and read-oriented. It does not imitate an operational task screen.

### Authentication and role selection

The entry flow should contain only:

- identity
- role or operator choice when required
- the one action needed to continue

Recovery, connection and diagnostic detail appears only after an actual problem.

## Shared visual language

The system uses the Event Mode palette and hierarchy:

- charcoal and warm-black operational canvas
- warm cream for the primary focus surface
- muted gold for momentum and current state
- restrained green for completion
- restrained red only for actionable failure or safety risk
- large confident headings
- generous spacing and rounded surfaces
- minimal borders and soft depth
- strong contrast and clear focus states

Reusable CSS tokens and primitives live in:

`src/design-system/MeshExperienceSystem.css`

The shared primitives include:

- experience shell and sticky top bar
- hero and facts
- progress ring
- focus card
- mission map
- primary, secondary and text actions
- status feedback
- mobile bottom navigation

## Migration sequence

### Slice 1 — Foundation

- shared tokens and primitives
- experience contract and verification
- no broad behavioural changes

### Slice 2 — Routine employee experience

- replace the collection-heavy home with Now / Shift / Help
- preserve all mutation, offline, conflict, handover and transfer behaviour
- make one active routine or next task the dominant action

### Slice 3 — Inventory counter experience

- Count / Progress / Review
- one active product card at a time on mobile
- keep unsaved-draft, stale-write and assignment protections unchanged

### Slice 4 — App entry and role launchpad

- premium login and role-aware landing
- no technical state unless something fails
- direct entry to the user’s current operational mission

### Slice 5 — Manager home

- Today / Attention / Control
- operational summary first
- configuration grouped behind purposeful launchers

### Slice 6 — Manager modules

- event planning
- routine content and templates
- stock-count coordination
- staff, history, reports and system administration

### Slice 7 — Cleanup and consistency

- remove obsolete parallel surfaces
- unify language, empty states and confirmation patterns
- complete accessibility, mobile and reduced-motion review

## Engineering boundaries

- Do not place the whole redesign inside PR #13.
- PR #13 remains the Event Mode and Julie-routines change.
- App-wide work continues on the stacked branch `agent/mesh-experience-system`.
- Each major role migration gets its own reviewable slice.
- Existing permissions, backend clients and integrity checks remain the source of truth.
- UI simplification must be implemented as a presentation and workflow layer, not by bypassing operational controls.

## Acceptance criteria for every migrated surface

A surface is not complete until all of the following are true:

- a first-time user can identify the next action within five seconds
- the screen has no implementation terminology unless it is an explicit admin diagnostic view
- only one action is visually primary
- progress and completion are understandable without explanation
- visual guidance is contextual rather than permanently expanded
- mobile touch targets are at least 48 px
- keyboard focus is visible
- reduced-motion preference is respected
- offline, stale-write and conflict states preserve user work
- no permission or audit capability has been weakened
- production build and the relevant integrity verifiers pass

## Product rule

The app should feel intelligent because it removes decisions from the interface, not because it displays how complicated the system is.

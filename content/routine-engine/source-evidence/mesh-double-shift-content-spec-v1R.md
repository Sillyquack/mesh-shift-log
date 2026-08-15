# Mesh Shift Log — Double Shift Content Spec v1.0R

**Status:** Re-locked authoritative Double Shift source for Phase 10L  
**Scope:** DS01–DS04 and bundle/continuity copy  
**Operational timezone:** `Europe/Oslo`  
**Operational date:** One explicit date shared by the linked Opening and Closing runs  
**Employee-facing language:** English  
**Critical architecture rule:** Double Shift is a bundle around Opening and Closing. It is never a third routine template.

> This specification consolidates the previously locked Double Shift content and Phase 10H operational model. It does not create or copy the 37 Opening tasks and 46 Closing tasks. Phase 10L stores these four system-step definitions in the canonical content pack and verifies that runtime/UI copy matches them.

# 1. Authoritative model

```text
Double Shift bundle
├── Linked authoritative Opening run
├── DS01 — Confirm plan
├── Opening work
├── DS02 — Opening-to-Closing transition
├── Between-shifts continuity and change feed
├── DS03 — Return and review changes
├── Linked authoritative Closing run
├── Event-transfer completion when required
└── DS04 — System-generated finalization
```

There is:

- one authoritative Opening run per organization/date/routine/scope
- one authoritative Closing run per organization/date/routine/scope
- one active Double Shift bundle per organization/date/scope/Opening–Closing pair
- one personal bundle-participant record per assigned employee/operator
- one DS01, DS02 and DS03 step per participant
- one global DS04 step per bundle

Multiple employees share the linked runs. The system never creates separate Opening/Closing runs per participant.

Double Shift does not automatically grant:

- Closing Responsible
- cash/register responsibility
- locking/alarm responsibility
- asset responsibility
- Event Operations role
- manager access
- template/configuration access

These are separately assigned server-authoritative roles/capabilities.

# 2. Stable snapshots

When the bundle is created, it links and snapshots:

- Opening run ID, template version, core snapshot hash and timing hash
- Closing run ID, template version, core snapshot hash and timing hash
- organization
- operational date
- timezone
- scope
- participant identity
- known role assignments
- external event context available at the time

A later template edit never silently changes either linked run.

# 3. Operational date

The bundle has one explicit operational date:

```text
Operational date: 5 August 2026
Timezone: Europe/Oslo
```

If Closing finishes after midnight:

```text
Operational date: 5 August 2026
Physical completion: 6 August 2026 at 00:47
```

Midnight does not create a new Closing date.

# 4. Bundle status

Allowed bundle states:

- `scheduled`
- `opening_in_progress`
- `opening_complete`
- `between_shifts`
- `closing_due`
- `closing_in_progress`
- `closing_scope_complete`
- `waiting_for_transferred_event_close`
- `completed`
- `cancelled`

Bundle status is server-reconciled from linked run states, participant steps and transfers.

# 5. Participant status

Allowed participant states:

- `assigned`
- `working_opening`
- `continuing_on_site`
- `temporarily_away`
- `expected_back`
- `returned`
- `working_closing`
- `closing_reassigned`
- `unable_to_return`
- `completed`
- `removed`

Participant status and bundle status are separate. A participant can complete their ordinary Closing scope while the bundle waits for transferred event close.

# 6. Global Double Shift rules

1. Opening completion never auto-completes a physical Closing task.
2. Morning history is context, not completion.
3. A task completed by another employee is shown with that actor/time.
4. A condition/N/A result from Opening is re-evaluated for Closing.
5. Deviations carry forward until resolved, accepted or transferred.
6. A participant who cannot return keeps their Opening history.
7. Reassignment joins another participant to the existing Closing run; it never creates a new Closing run.
8. Event Shift/Event Operations remains a separate domain.
9. Event-transfer acceptance/completion requires real server-authorized event authority.
10. Shared-device operators use their actual operator identity.
11. DS03 requires the latest server change-feed hash.
12. Offline DS03, event acceptance/completion and critical Closing finish are not allowed as unverifiable local completions.
13. DS04 is system-generated and immutable.
14. No Double Shift template with copied O/C tasks may exist.

---

# DS01 — Confirm the Double Shift plan

**Step key:** `ds01_confirm_plan`  
**Actor:** Assigned participant or authorized coordinator  
**Step type:** user-completed assignment gate  
**Mandatory:** yes  
**Repeat:** once per participant  
**Offline policy:** online/server-confirmed  
**Criticality:** important

## Employee instruction

Review and confirm the complete Double Shift plan before beginning the assignment.

The screen must show:

- operational date
- linked Opening run
- linked Closing run
- pinned template versions/hashes
- expected Opening window
- expected Closing start
- expected return time, when set
- current Opening/Closing participants
- current operational roles
- Closing Responsible
- cash/register responsibility
- locking/alarm responsibility
- known events and affected zones
- missing critical roles or plan information

The participant confirms:

`I understand that this assignment includes both Opening and Closing.`

This does not assign Closing Responsible or any other critical role.

## Structured step payload

- `operationalDate`
- `timezone`
- `openingRunId`
- `openingSnapshotHash`
- `closingRunId`
- `closingSnapshotHash`
- `expectedClosingStart`
- `expectedReturnAt` or explicit missing state
- `roleAssignments`
- `eventContextSummary`
- `missingCriticalRoles`
- `participantIdentity`
- `confirmedStatement`

## Done when

- The linked runs and operational date are confirmed.
- The participant understands the assignment includes both phases.
- Expected return is recorded or explicitly missing.
- Missing responsibilities remain visible.
- The step is server-confirmed with one immutable payload hash.

## Blocking/deviation rules

- Linked run or snapshot integrity failure.
- Operational date mismatch.
- Participant is not assigned/authorized.
- Expected return cannot be resolved when the plan requires it.
- Missing role remains a plan warning/blocker; it is not silently assigned.

---

# Opening phase

The participant performs the linked Opening run through the ordinary generic run workspace.

Rules:

- O01–O37 keep their own task statuses and actors.
- Tasks completed by others appear as completed by those people.
- The Double Shift participant does not re-complete another person’s task.
- Later timed checkpoints remain separate even when earlier physical setup was correct.
- Opening history remains immutable if Closing is later reassigned.

---

# DS02 — Complete the Opening-to-Closing transition

**Step key:** `ds02_opening_transition`  
**Actor:** Bundle participant or authorized coordinator  
**Step type:** user-completed transition/handover  
**Mandatory:** yes  
**Prerequisite:** linked Opening run is finished and DS01 is complete  
**Repeat:** once per participant  
**Offline policy:** online/server-confirmed  
**Criticality:** critical

## Employee instruction

Review the server-generated Opening summary and record how operational responsibility continues until Closing.

The summary must include:

### Opening result

- tasks completed
- tasks completed after correction
- ready-on-arrival results
- initial shortcomings
- unresolved deviations
- manager overrides
- delayed checkpoints

### Stock and presentation

- Workbar food/non-alcoholic fridge
- Workbar milk fridge
- self-service
- baked goods, fruit and snacks
- Coffee Canisters
- coffee cups and wine glasses
- unresolved product/serviceware issues

### Rooms and venue

- project rooms/Boardroom
- furniture/venue plan
- rooms still in use
- named later resets

### Bookings/events

- latest bookings and changes
- active zones
- expected final service
- Event-transfer risks

### Technical and maintenance

- coffee machine
- dishwashers
- POS/Weorder
- music/screen/lighting
- other equipment/maintenance issues

The participant chooses one transition status:

- `continuing_on_site`
- `temporarily_away`
- `handing_operation_to_another`
- `unable_to_complete_closing`

## Status-specific requirements

### Continuing on site

- no return time required
- participant becomes `continuing_on_site`
- Opening history freezes as finished

### Temporarily away

- expected return required
- interim owner required when policy/open issues require it
- participant becomes `expected_back`

### Handing operation to another

- interim owner required
- recipient must be a valid same-organization routine user/operator
- recipient is joined to linked work when required
- responsibilities and open conditions are explicit

### Unable to complete Closing

- reason required
- participant becomes `unable_to_return`
- bundle shows Closing reassignment required
- existing Closing run remains intact

## Structured step payload

- server-generated Opening summary
- transition status
- expected return
- interim owner
- open deviations/overrides
- active handovers/transfers
- unresolved action count
- supplementary note
- shared Opening-transition handover ID/hash

## Done when

- Opening is finished.
- DS01 is completed.
- The transition choice is valid.
- Required return/interim owner/reason data exists.
- One shared `opening_transition` handover is regenerated and submitted.
- The step and handover are server-confirmed without duplicates.

## Blocking/deviation rules

- Opening is not finished.
- DS01 is missing/stale.
- Required return/interim owner/reason missing.
- Open critical/important issue is absent from the handover.
- Target user is invalid.
- No silent cancellation or deletion of Closing is allowed.

---

# Between-shifts continuity

After DS02, the workspace shows:

```text
Double Shift — Between shifts
Opening completed: 10:58
Expected Closing return: 14:45
Current operational owner: [name]
```

## Read-only continuity summary

- Opening summary
- unresolved deviations
- manager decisions
- handover
- event/booking changes
- current roles
- planned Closing responsibility
- event-zone status
- sync status

## Change feed

The feed begins at DS02 completion and includes relevant server events from:

- Opening and Closing runs
- task actions by other employees
- deviations
- overrides
- corrections
- handovers
- transfers
- participant joins/leaves
- role changes
- external event/context resolutions
- booking/event changes
- asset/stock-related deviations

It excludes:

- operation ledgers
- secrets
- unrelated runs
- unnecessary customer details

Each entry contains:

- stable ID
- server timestamp
- source/category
- title/summary
- actor or system
- run phase
- severity
- relevant entity IDs
- whether action remains required

The feed hash covers semantic entries and order, not the time it was read.

---

# DS03 — Return and review changes before Closing

**Step key:** `ds03_return_review`  
**Actor:** Returning bundle participant or authorized coordinator  
**Step type:** user-completed re-entry gate  
**Mandatory:** yes for a returning Double Shift participant  
**Prerequisite:** DS02 complete  
**Repeat:** once per participant  
**Offline policy:** online/server-confirmed; stale feed cannot be accepted  
**Criticality:** critical

## Employee instruction

Before joining Closing, review every relevant change since the Opening transition.

The screen must show:

- booking/event changes
- stock/serviceware changes
- equipment/maintenance changes
- tasks completed by others
- unresolved deviations
- role/responsibility changes
- event transfers
- current Closing status
- current change-feed hash

On a shared device, a valid operator session is required. The system never assumes the morning operator still holds the device.

## Structured step payload

- reviewed feed hash
- reviewed-through server instant
- entry/category counts
- unresolved action count
- current external event context
- actual return time from server
- participant/Closing join state
- Opening-transition handover acceptance state

## Done when

- DS02 is complete.
- External context is refreshed.
- The submitted expected feed hash matches the latest server feed.
- The participant has reviewed current changes.
- Actual return is server-recorded.
- Participant is joined to the existing Closing run.
- Relevant handover is accepted where authorized.
- Participant status becomes `returned` or `working_closing`.

## Blocking/deviation rules

- Feed has changed: return `double_shift_changes_updated`.
- Participant was reassigned/removed/completed and lacks explicit coordinator action.
- Operator session is invalid/expired.
- Closing run integrity/access failure.
- No fallback to device identity.

---

# Closing phase

The linked Closing run is rendered through the same generic run workspace.

Rules:

- Opening history may appear on relevant Closing tasks.
- Morning completion never sets a Closing task to complete.
- Tasks already completed by Closing coworkers show their true actor/time.
- The returning participant joins the existing Closing run.
- Event-controlled work remains transferred until completed evidence exists.
- Closing delivery is generated only by a valid server finish.

---

# Closing reassignment

An authorized manager/coordinator can reassign the Closing obligation.

The operation:

- requires a reason
- targets an active same-organization routine performer
- joins the target to the existing Closing run
- creates/reuses a bundle participant
- sets the original participant to `closing_reassigned`
- records `closing_reassigned_to`
- creates one immutable reassignment record/event
- never creates a new Closing run
- never moves or rewrites task completions
- preserves the original participant’s Opening contribution

Personal result for the reassigned employee:

`Opening completed; Closing reassigned`

---

# Event Operations and transfers

Double Shift and Event Shift are separate.

## Double Shift may read

- active events
- affected zones
- expected event end
- authorized event roles
- proposed/accepted/completed transfers
- event-related blockers

## Double Shift does not automatically grant

- Event Floor Manager
- event task access
- event plan mutation
- Event Operations write access

## Event-transfer evidence

A transfer records:

- source task/run
- target event
- scope
- responsible event actor/role
- expected due time
- acceptance evidence
- completion evidence
- physical check
- critical confirmation when required
- typed item evidence
- completion result

Allowed event completion results:

- `standard_met`
- `completed_after_correction`
- `control_completed_with_deviation`
- `completed_with_manager_override`

A proposed or merely accepted transfer never becomes final Closing delivery. Only completed valid evidence can satisfy the delivery contract.

---

# DS04 — Finalize the Double Shift assignment

**Step key:** `ds04_bundle_finalized`  
**Actor:** system  
**Step type:** system-generated finalization  
**Mandatory:** yes  
**Participant:** none — global bundle step  
**Repeat:** once per bundle  
**Offline policy:** server-only  
**Criticality:** critical

## Eligibility

DS04 is generated only when:

- linked Opening run is finished
- linked Closing run is finished
- no accepted incomplete Event-transfer remains
- transfer-based delivery evidence is valid where required
- bundle has no blocking integrity condition
- final Closing delivery exists when the Closing contract requires it

## System-generated payload

### Opening summary

- run ID/status
- template/snapshot hashes
- participants
- task contributions
- corrections/deviations
- completion time

### Closing summary

- run ID/status
- template/snapshot/timing hashes
- participants
- task contributions
- final verification
- completion time
- delivery record

### Continuity

- DS01/DS02/DS03 summaries
- expected/actual return
- interim owner
- change-feed review
- reassignments

### Exceptions

- deviations
- manager overrides
- corrections
- handovers
- transfers and event evidence

### Personal outcomes

Examples:

- `Completed Opening and Closing`
- `Completed Opening; Closing reassigned`
- `Joined Closing after Opening`
- `Completed assigned Closing scope; event close transferred`
- `Physically completed; critical sync pending` only as a temporary client display before server finalization — not a completed DS04

## Done when

- Payload is built from authoritative server data.
- Payload hash is deterministic and verified.
- Global DS04 becomes completed once.
- Bundle becomes `completed`.
- Relevant participant statuses become completed without erasing reassignment outcomes.
- Immutable system events are written once.

## Blocking rules

- Opening or Closing not finished.
- Accepted incomplete transfer.
- Missing/invalid event-transfer delivery evidence.
- Missing required final delivery.
- Run/bundle/step hash or link integrity failure.
- No client may manually complete DS04.

---

# Cross-run relationship classes

## `shared_context`

Facts are reused without auto-completing physical work:

- operational date
- scope
- locations
- standards
- room list
- image/reference versions
- event IDs
- role history

## `repeat_required`

A physical state must be checked again:

- fridges
- milk
- self-service
- project rooms
- cups/glasses
- Coffee Canisters
- toilets
- opened bottles
- bookings/events

## `complementary_action`

Opening and Closing perform opposite lifecycle steps:

- machine on → clean/night state
- dishwashers on → drain/clean/off
- music on → off
- screen on → off
- Café lighting → closed lighting
- register open → close/settle/secure
- Coffee Canisters ready for service → recover/clean/store

## `carry_forward_until_resolved`

A deviation stays visible until resolved, accepted or transferred.

## `independent_verification`

Critical work can require a later authorized verifier.

## `conditional_companion`

A generated Opening condition creates a required Closing companion, such as seasonal candle removal.

## `delivery_comparison`

Closing evidence is compared with the next Opening assessment. It never auto-completes the Opening task.

---

# Mobile copy

## Before Opening

```text
DOUBLE SHIFT
Opening now
Closing later
Operational date: [date]
Expected return for Closing: [time or Not set]
[Confirm and start Opening]
```

## Between shifts

```text
DOUBLE SHIFT · BETWEEN SHIFTS
Expected Closing return: [time]
Current operational owner: [name]
Since Opening:
[booking changes]
[stock issues]
[equipment alerts]
[View changes]
```

## Return

```text
WELCOME BACK
Changes since Opening:
[counts]
[Review changes]
[Join Closing]
```

## Completion

```text
DOUBLE SHIFT COMPLETE
Opening contribution: [...]
Closing contribution: [...]
Final delivery: [...]
Manager overrides: [...]
```

# Canonical implementation note for Codex

Treat this document as the authoritative Double Shift content/copy source for Phase 10L.

- Store DS01–DS04 definitions in the canonical content pack.
- Verify runtime/UI step keys and copy against this source.
- Do not create a `double_shift` routine template.
- Do not copy O01–O37 or C01–C46.
- Do not publish anything.
- Do not create runs or bundles.
- Do not change mode or release stage.
- DS04 remains system-generated.
- Any semantic difference between the pack’s DS step definitions and this document is a content-integrity failure.

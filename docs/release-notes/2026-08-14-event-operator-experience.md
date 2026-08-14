# Event Mode — focused operator experience

## Purpose

The Event Floor Manager should operate the event, not administer the systems behind it. This change separates the staff-facing experience from the existing Manager Cockpit.

## Event Floor Manager experience

The role now receives an English, mobile-first **Event Mode** with three surfaces only:

- **Focus** — one clear next task, progress, current event facts and a large completion action
- **Journey** — the full event sequence grouped into Prepare, Welcome, Run and Close
- **Help** — one-tap issue reporting and contextual visual guides

The home dashboard becomes a focused launcher. Calendar imports, linked resources, staffing configuration, confidence scores, backend state, database concepts and other implementation details are not shown to the operator.

Gamification is intentionally restrained and operational:

- completion percentage and task count
- a four-stage mission map
- clear phase completion states
- optimistic task completion feedback
- a completion moment when every active task is done

No artificial streaks, leaderboards or fabricated performance metrics are used.

## Manager experience

The existing Manager Cockpit remains available and retains planning integrations, staffing, live-update controls, risk review, handover, completion controls and technical context.

The split is role-based. `event_floor_manager` users receive Event Mode, while managers continue to receive the advanced cockpit.

## Operational controls preserved

Event Mode still writes through the existing event operations callbacks:

- task status updates
- live issue/client/technical/stock/support updates
- linked visual and rig guides
- normal refresh and event navigation

Alarm PINs and security codes are not present in the operator UI.

## Validation

Run:

```bash
npm run verify:event-operator-experience
```

The verifier checks role gating, English-only operator labels, removal of technical noise, task/update/guide actions, mobile and reduced-motion support, focused page cleanup, preserved Manager Cockpit and absence of alarm codes.

The focused UI was also rendered at desktop and 390 px mobile widths before publication to the branch.

# Event Floor Manager cinematic demo — production narration

Target runtime: **3 minutes 45 seconds**. Narration word count: **467 words**. Average pace across the complete track: **124.5 spoken words per minute**, including the breathing space built into each chapter.

This is the final recording script and timing sheet. Chapter and cue times are authoritative. The same cues drive the on-screen captions and visual state changes.

## Voice direction

- British English.
- Warm, calm, sophisticated and reassuring.
- Premium documentary delivery with a measured pace and understated authority.
- Mature, but not old-fashioned. Pleasant and natural over several minutes.
- Use subtle cinematic warmth. Keep the operational details precise and grounded.
- Allow the final seconds of each chapter to breathe. Important statements should land without theatrical pauses.
- Do not imitate, clone, reference or reproduce any identifiable broadcaster, actor, presenter or other real person.
- Avoid movie-trailer weight, upbeat software-commercial energy, training-video cheerfulness and robotic text-to-speech rhythm.
- Do not read capability labels such as `LIVE NOW`, `PARTIAL / PILOT` or `PLANNED CAPABILITY`.

## 00 — Opening

**Timeline:** 00:00–00:14 · **14 seconds**

- **00:00** — A good event plan begins before anyone steps onto the floor.
- **00:04.5** — It becomes operational when readiness, ownership and the next action are visible.
- **00:09.5** — That is the story we will follow.
- **00:12–00:14** — Hold the final frame and breathe.

## 01 — Before doors

**Timeline:** 00:14–00:39 · **25 seconds**

- **00:14** — Before the doors open, every dependency has somewhere to live.
- **00:20** — Julie can see the event, its timings, and the checks that make the room ready.
- **00:26** — She can see what is confirmed, what is still open, and which final check is critical.
- **00:33** — No repeated questions. No plan held together in one person’s head.
- **00:37–00:39** — Hold on complete readiness.

## 02 — Exact standards at the point of work

**Timeline:** 00:39–01:02 · **23 seconds**

- **00:39** — A standard is most useful where the work happens.
- **00:44** — Each task can show the exact arrangement and finish the team is aiming for.
- **00:49.5** — An approved setup photograph can sit beside the instruction, making the expectation clear at a glance.
- **00:56.5** — The result is consistency, without waiting for a manager.
- **01:00–01:02** — Hold the visual standard.

## 03 — Who owns what

**Timeline:** 01:02–01:24 · **22 seconds**

- **01:02** — Julie leads the event. She does not own every responsibility.
- **01:07** — Closing, settlement, locking, assets and the overall shift each have a named owner.
- **01:12.5** — When responsibility is clear, managers spend less time asking who is doing what.
- **01:18.5** — Julie remains focused on the whole floor.
- **01:21–01:24** — Hold on the complete ownership map.

## 04 — During the event

**Timeline:** 01:24–01:52 · **28 seconds**

- **01:24** — Once guests arrive, the plan must stay useful.
- **01:29** — A missing presenter adapter appears as an exception, with an owner and a deadline.
- **01:35** — Mircea acknowledges it. The welcome speech moves by six minutes, and everyone sees the change.
- **01:41.5** — If something changes on the floor, the plan changes with it.
- **01:46** — The message is resolved, but its context remains for the next person.
- **01:50–01:52** — Hold on the resolved state.

## 05 — Financial control

**Timeline:** 01:52–02:06 · **14 seconds**

- **01:52** — Financial closeout has one clear owner and one visible state.
- **01:56.5** — Rebekka confirms the checks, records settlement, and signs off.
- **02:01.5** — The floor can see completion without becoming an accounting office.
- **02:04–02:06** — Hold on recorded sign-off.

## 06 — Asset control

**Timeline:** 02:06–02:23 · **17 seconds**

- **02:06** — Shared equipment is checked where it belongs.
- **02:10** — A misplaced iPad is visible early, with its serial number and the action required.
- **02:15** — Mircea returns it before settlement.
- **02:18.5** — Small exceptions are handled before they become expensive ones.
- **02:21–02:23** — Hold on the resolved asset action.

## 07 — Closeout

**Timeline:** 02:23–02:43 · **20 seconds**

- **02:23** — Closeout should feel calm, not uncertain.
- **02:27** — Client goodbye, sales, settlement, assets, reset, waste, handover and locking are confirmed in one place.
- **02:33** — At the end of the event, completion is no longer an assumption. It is visible.
- **02:38.5** — Nothing critical is left open.
- **02:41–02:43** — Hold on the closed event.

## 08 — Management visibility

**Timeline:** 02:43–03:04 · **21 seconds**

- **02:43** — Management does not need to interrupt the floor to understand it.
- **02:48** — Progress, critical work, handovers, sign-offs and resolved exceptions are visible from one view.
- **02:54** — The record shows who acted, what changed, and when.
- **02:59** — The floor keeps moving. Leadership keeps control.
- **03:02–03:04** — Hold on the complete management view.

## 09 — Live event runbook / kjøreplan

**Timeline:** 03:04–03:34 · **30 seconds**

- **03:04** — Now consider the live event runbook — the kjøreplan.
- **03:08.5** — It follows the rhythm from setup, through doors and service, to teardown and locking.
- **03:14** — Every cue has a time, an owner, a dependency and a current state.
- **03:19.5** — When one cue moves, the plan moves with it.
- **03:24** — Notes, blockers and escalation stay beside the work.
- **03:28** — The team operates the run-of-show, instead of chasing a document.
- **03:32–03:34** — Hold on the complete runbook.

## 10 — Final frame

**Timeline:** 03:34–03:45 · **11 seconds**

- **03:34** — Good hospitality operations are not hurried.
- **03:37.5** — They are prepared, clearly owned, responsive to change, and finished with certainty.
- **03:41.5** — Plan. Assign. Execute. See change. Act. Close. Review.
- **03:44–03:45** — End cleanly and hold.

## Audio production and attachment

No narration audio is included in this revision. The application has no speech synthesis or external audio runtime dependency.

Once a recording is approved:

1. Deliver one static, mastered MP3 matching this **03:45** timeline, including the documented pauses.
2. Add it at `public/audio/event-floor-manager-narration.mp3`.
3. In `src/data/julieEventDemo.js`, set `narration.audioSrc` to `./audio/event-floor-manager-narration.mp3` and `narration.assetIncluded` to `true`.
4. Re-run the demo registry tests, production build and browser synchronization checks.

The audio element never autoplays on opening. The viewer must choose **Play with narration**. In narrated mode, the static audio track becomes the master clock for scenes and captions. Pause, resume, chapter jumps, replay and mute operate on that same track. If the asset fails to load, the tour falls back to the silent master timeline and keeps captions available.

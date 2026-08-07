# Mesh operational standards amendment — 2026-08-07

Status: approved content decision for local review. This amendment is not a verbatim copy of an earlier Content Spec. It amends the three re-locked v1R content sources without changing their text, and it authorizes generation of `mesh-routine-content@1.1R` for review only.

This document contains no alarm, safe, Salto or other access credential. It does not authorize production migration, pack installation, publication, run creation, release-stage promotion or mode activation.

## Coffee-cup visual layout

The former numeric `coffee-cups-full-target` and `coffee-cups-service-ready-target` blockers are resolved as structured visual-layout standards. Both logical identities have the same physical contract:

- every defined cup position is filled;
- ordinary coffee cups are stacked four high with handles pointing right;
- cappuccino cups fill every defined shelf and coffee-machine-top position;
- espresso cups fill every defined coffee-machine-top position;
- the correct cup type is in each defined position;
- missing cups are located, washed and returned;
- cups still in a dishwasher or wash flow are not ready;
- exact physical placement is shown by `ordinary-coffee-cup-layout`, `cappuccino-cup-shelf-layout` and `cappuccino-and-espresso-machine-top-layout`.

O29 at 09:45 and O35 at 10:45 each require a new physical assessment. Neither inherits prior completion, and service-ready is not a lower threshold than full.

## Wine-glass visual layout

The former numeric `wine-glasses-full-target` and `wine-glasses-service-ready-target` blockers are resolved as structured visual-layout standards with identical physical meaning:

- every fixed defined glass position is filled;
- the correct glass type is in each position;
- the exact arrangement follows `wine-glass-layout`;
- glasses still in washing or a dishwasher are not ready;
- missing glasses are located, washed and returned;
- O29 and O35 perform independent physical checks;
- C27 records final physical layout/accountability evidence before delivery.

No artificial cup or glass inventory total is introduced.

## Workbar Coffee Canisters

The misleading hospitality-wide `coffee-canister-total-inventory-target` is removed. The authoritative `workbar-coffee-canister-assigned-target` is:

```json
{
  "assignedToWorkbar": 4,
  "membersLoungeDuringService": 1,
  "kitchenReserveDuringService": 3,
  "overnightStorage": "workbar-bar-coffee-canister-cupboard"
}
```

Opening requires four ready Workbar-assigned Coffee Canisters. During service, one is in Members lounge and three are ready in the Workbar/kitchen reserve. Closing C17 accounts only for these four: each must be physically located, emptied of old coffee, cleaned, complete with required parts, dry or stored under the approved procedure, and returned to the fixed Coffee Canister cupboard in Workbar bar. Other hospitality Coffee Canisters are outside this accountability scope.

## Self-service tea positions

The six tea positions are resolved in this exact order and spelling:

1. Peppermynte
2. Chai Masala
3. Earl Grey Fransk
4. Bestemors Frukthave
5. Sencha
6. Rooibos Chile

Opening and overnight self-service content reference this ordered standard.

## Door and lock rules

The structured `door-and-lock-rules` revision applies these global Closing rules:

- every hospitality entrance door is physically closed before the alarm is set;
- every door that must be locked is physically checked as locked;
- unauthorized manual Salto unlocks are removed;
- an open or unlocked door may trigger the alarm;
- no alarm, safe or Salto credential is stored.

The front door is automatically open on weekdays from 08:00 to 18:00 and closed/locked outside that window. An event may use an approved manual Salto unlock. Opening/event work confirms the event need, performs the approved unlock and physically checks state. Closing removes the override after the event, closes the door and confirms locked state.

Vindfang door, Kitchen / Atrium door, Atrium / Workbar door, Cornerbar / Atrium door and Garbage hallway / Atrium door are normally locked unless manually opened through Salto. Closing physically closes each door, removes any manual unlock and checks the locked state.

Cornerbar street door requires separate Salto locking, engagement of the physical upper security lock and physical verification. Cornerbar Opening unlocks and checks both separately. Cornerbar Closing closes the door, locks it in Salto, engages the upper lock and verifies both separately. C42 retains distinct street-door and upper-lock items; C43 checks Salto status without credentials.

## Fridge rules

The structured `fridge-closing-rules` revision records that bar-fridge keys are universal and interchangeable. A fridge that must be locked is checked physically after the key is turned. Event-active fridge work is transferred with scope-specific evidence and is never N/A.

- Workbar Bar Left and Right are unlocked and physically checked by Opening. Final Closing full-restocks each, closes it completely, locks it with a universal key and physically checks the lock.
- Workbar Non-Alcoholic Fridge is never locked. Opening raises the grille fully. Closing full-restocks it, including eggs under the product standard, leaves it unlocked, lowers the grille fully and checks both the grille and closed fridge door.
- Workbar Milk Fridge remains unlocked in the old small wine cabinet in Workbar bar. Its top shelf holds two regular milk and two Oatly; remaining standing space is reserved for opened wine bottles. Its door is physically closed and it is not locked.
- Cornerbar Left, Middle and Right are each unlocked with a universal key and physically checked when Cornerbar is active, then restocked to their own layout. Final Closing full-restocks, closes, locks and physically checks each one. Event-active scope is transferred to an authorized Event Operations person and final evidence requires a physical check.

## Cornerbar operating standard

`cornerbar-operating-standard` is a structured standard used by existing Opening, Closing and event-context tasks. It is not a routine, a third template or a copy of Closing.

When Cornerbar is used, Opening confirms booking/event, expected opening time and operational owner; unlocks relevant Salto doors and the upper physical street-door lock; unlocks all three fridges with a universal key; checks and restocks each fridge to its own layout; sets glassware, bar equipment and presentation; activates relevant music and lighting; and physically confirms readiness.

At final Cornerbar close, the responsible person confirms service/event completion; full-restocks, closes, locks and checks all three fridges; cleans and returns bar equipment, beer-tap parts and drip trays; resets the bar; turns off music; applies closed lighting; completes the area sweep; closes and locks relevant inner doors; removes unauthorized manual Salto unlocks; locks the street door in Salto; engages the upper physical lock; and verifies both locks separately.

If Cornerbar remains active, ordinary Closing does not claim completion or use N/A. A formal transfer names the authorized recipient and explicitly covers relevant fridges, doors/locks, equipment, music/lighting, final sweep and reset controls. Final Closing requires physical completion evidence.

Cornerbar references are logical placeholders until approved images are added through Manager Control Center using prepare → upload → finalize. Placeholder text is `Referansebilde kommer`; the employee action is `Vis hvordan det skal se ut`. Missing images are warnings and do not block draft installation.

## Task and relation application

The amendment updates the content projections for Opening O09, O13, O14, O15, O29, O35 and O37, and Closing C10, C17, C20, C27, C28, C29, C30, C32, C33, C41, C42, C43, C45 and C46. Cornerbar standard linkage also applies to C38 and C40.

O29 and O35 remain independent physical checkpoints. C27 delivers layout/accountability evidence rather than artificial numeric totals. Previous Closing evidence is context only and never auto-completes Opening. Pre-restock does not complete final restock. Event-active work uses transfer/evidence rather than N/A. Server rules remain authoritative; the client does not evaluate security or completion authority.

## Remaining publication and readiness blocker

The only unresolved requirement from the original nine is `serviceware-office-recovery-route-confirmation`: **Exact serviceware recovery route through the relevant office floors**. No office-floor point is guessed, no fake location is created, and room 005 remains forbidden. Known recovery areas may remain guidance, but only a later manager-approved complete route resolves this blocker.

The cup, glass, Workbar Coffee Canister, tea, door/lock and fridge requirements are resolved by this amendment. Reference-image placeholders remain warnings.

## Scope and provenance

The three re-locked v1R source documents remain the source for all unchanged O01–O37, C01–C46 and DS01–DS04 content. This amendment is the source only for the operational-standard changes above. `content/routine-engine/mesh-routine-content-v1.json` remains the sole canonical machine-readable pack. The generator must verify the unchanged source hashes, hash this decision body, apply the amendment deterministically and regenerate the embedded SQL payload and human audit.

No historical runtime row is rewritten. No content is auto-installed or published. No run, task, bundle or delivery is created. Double Shift remains four system steps over Opening and Closing, not a third template.

## Generated pack metadata

This section is generated from the canonical pack and is excluded from the amendment decision-body hash.

- Pack: `mesh-routine-content@1.1R`
- Canonical pack SHA-256: `c149a8416a867dcb7d87224f3ae8e2a214e5ca4954613b118521ebe5ae3aff2a`
- Amendment decision-body SHA-256: `8ebedb39be888dfa118a429fa2046ba2b7b5dc49c868d9d5b811f2aa89b45351`
- Production action: none

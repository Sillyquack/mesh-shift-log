# Mesh Shift Log — Closing Content Spec v1.0R

**Status:** Reconstructed and re-locked as the authoritative Closing source for Phase 10L  
**Scope:** Closing only — C01–C46  
**Operational timezone:** `Europe/Oslo`  
**Operational date:** The linked run’s server-derived operational date; a Closing completed after midnight keeps the same operational date  
**Employee-facing language:** English  
**Installation rule:** Editable draft only — never auto-publish and never create a run

> This document is a consolidated authoritative replacement for the earlier Closing content blocks. It does not claim to be a word-for-word recovery of inaccessible earlier chat messages. It preserves all confirmed Closing decisions, task titles, operational rules, dependencies, delivery relationships and unresolved configuration blockers. Phase 10L must treat any semantic difference between this source and the installed draft as a content-integrity failure.

# Global Closing rules

1. There is one authoritative Closing run per organization, operational date, routine key and scope. Several employees may participate in the same run.
2. Closing is a physical delivery to the next Opening. A task is not complete because the item exists somewhere else, looked correct earlier, or was pre-restocked.
3. Pre-restock and final restock are separate actions. C08–C10 never complete C28–C30.
4. Every task records the actual actor. Shared-device work records the actual operator, not “Workbar Device”.
5. `Not applicable` is forbidden unless the task explicitly allows it. An active event area is transferred through the Event-transfer flow; it is not marked N/A.
6. A manager override never becomes ordinary `standard met`. It remains visibly separate with risk, temporary measure, owner and follow-up.
7. Missing stock, serviceware, equipment, access, evidence or responsibility creates a deviation or transfer. It must never be disguised as completion.
8. Timed tasks use server time. Phone/browser time is not authoritative.
9. Critical shared-device actions require fresh PIN reauthentication when the server requires it.
10. Reference images open inline through `Show how it should look`. A missing file shows `Reference image coming` and does not itself block the task.
11. Final serviceware accountability is strict. Coffee cups and wine glasses must be located, cleaned and returned. “Could not find them” is not a completed state.
12. Every Coffee Canister must be physically accounted for. Empty, dirty, incomplete, event-transferred and missing canisters are distinct states.
13. Closing after midnight remains attached to the operational date locked when the run was created.
14. Customer, payment, alarm, safe and Salto credentials must never be written into task notes, images or evidence.
15. Submitted handovers, verifications, deliveries and audit events are immutable.
16. Event Operations is read-only. Event-transfer acceptance/completion writes only Routine Engine evidence.
17. The following remain unresolved and must block publication where referenced:
    - Coffee cups full target
    - Wine glasses full target
    - Total Coffee Canister inventory target
    - Exact serviceware recovery route through relevant office floors
    - Door-and-lock rules
    - Fridge-closing rules
    - Six named tea slots where the self-service standard requires them
18. Actual reference images are optional at first. Placeholders are warnings, not publication blockers.
19. Project rooms are exactly `001`, `002`, `003`, `004`, `006` and `Boardroom`. Room `005` must never be generated.
20. Use the term **Coffee Canisters** everywhere.

# Block 1 — Closing 15:00–18:00

## Purpose

Prepare the venue for an orderly close without ending service early. Recover serviceware, establish responsibility, pre-restock physical standards, resolve or transfer active-zone work and reach a fresh 17:45 pre-close checkpoint.

## C01 — Review remaining bookings, events and closing constraints

**Stable key:** `closing.c01.review-remaining-bookings-events-constraints`  
**Type:** `control`  
**Criticality:** `important`  
**Mandatory:** `true`  
**Initial assessment policy:** `control_result`  
**Completion policy:** `control_allows_deviation`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** At the beginning of Closing and again when external context changes.  
**Location:** Calendar, booking sources and resolved Event Operations context.

### Employee instruction

Review every booking, event and room use that can affect Closing. Identify active zones, expected final service times, late room use, event-controlled areas, coffee orders still in progress, access restrictions and work that must be transferred rather than closed by the ordinary Closing team.

Compare the live plan with the Opening/Double Shift transition. Record only current operational facts; never assume the morning plan is still correct.

### Structured task items

- `bookings_rechecked` — all remaining bookings reviewed.
- `events_rechecked` — all active/relevant events reviewed.
- `active_zones` — Workbar, Atrium, Cornerbar and other authorized zones identified.
- `expected_final_service_times` — one current time or explicit unknown state per active zone.
- `project_room_constraints` — remaining room use recorded.
- `closing_constraints` — access, furniture, technical or staffing restrictions recorded.
- `event_transfer_needs` — work that must continue under Event Operations identified.

### Done when

- Every active booking, event, room and zone that affects Closing is represented.
- Expected final service/close times are current.
- Unknown or conflicting information has a visible deviation or named follow-up.
- Event-controlled work is prepared for transfer instead of hidden as N/A.

### Deviation and blocking rules

- Calendar/Event Operations unavailable.
- Conflicting event or booking information.
- Final service time or responsibility is unclear.
- Required transfer target cannot be identified.

### Reference guidance

- No image is required; do not capture sensitive booking/customer text.


## C02 — Confirm closing responsibilities

**Stable key:** `closing.c02.confirm-closing-responsibilities`  
**Type:** `control`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `control_result`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** Immediately after C01 and before critical Closing work is assigned.  
**Location:** Closing run responsibility panel.

### Employee instruction

Confirm the actual people responsible for the critical Closing scopes. Do not infer responsibility from who opened the run or from a Double Shift assignment.

Required scopes must be explicitly assigned when applicable. Missing responsibility remains visible and blocks the relevant critical work.

### Structured task items

- `closing_responsible`
- `cash_register_responsible`
- `locking_alarm_responsible`
- `asset_responsible`
- `event_area_responsible_by_scope`
- `responsibility_changes_since_opening`
- `missing_role_follow_up`

### Done when

- Every required critical scope has an active, server-confirmed assignment.
- Each responsible person is a valid participant/operator for the run.
- Replacements and scope changes are recorded without overwriting earlier assignments.
- No critical role is silently assigned to the person holding the device.

### Deviation and blocking rules

- Closing Responsible is missing.
- Cash/register or lock/alarm responsibility is missing.
- Assigned person is unavailable or lacks permission.
- Event area has no valid responsibility/transfer target.

### Reference guidance

- No image is required.

### Dependencies and relations

- Double Shift does not automatically grant any of these roles.


## C03 — Complete the first serviceware recovery sweep

**Stable key:** `closing.c03.first-serviceware-recovery-sweep`  
**Type:** `measurement`  
**Criticality:** `important`  
**Mandatory:** `true`  
**Initial assessment policy:** `control_result`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** Early in Closing while service continues; final accountability is repeated at C27.  
**Location:** Workbar, Members lounge, Atrium, project rooms, Boardroom, Kitchen/support areas and configured recovery route.

### Employee instruction

Perform the first physical recovery sweep. Collect available coffee cups, wine glasses, plates, cutlery and other Workbar serviceware without disturbing active guests or removing items still in legitimate use.

Record items that are in washing, in known active use, recovered or still unlocated. The first sweep prepares the final count but never completes C27.

### Structured task items

- `recovery_locations_checked`
- `coffee_cups_recovered`
- `wine_glasses_recovered`
- `plates_and_cutlery_recovered`
- `items_in_washing`
- `items_in_known_use`
- `items_unlocated`
- `areas_requiring_later_return`

### Done when

- Every currently available recovery area has been physically checked.
- Recovered serviceware is in the correct washing/storage flow.
- Active-use and later-return areas are named and timed.
- Unlocated items remain visible for C27 follow-up.

### Deviation and blocking rules

- Area inaccessible or actively occupied.
- Serviceware missing or damaged.
- Exact office-floor recovery route is not configured.
- An item remains unlocated without owner/follow-up.

### Reference guidance

- `coffee-cups-full-storage`.
- `wine-glasses-full-storage`.

### Dependencies and relations

- This is a preliminary sweep. C27 requires a new full accountability check.


## C04 — Reset available project rooms and schedule the remaining resets

**Stable key:** `closing.c04.reset-project-rooms-schedule-remaining`  
**Type:** `control`  
**Criticality:** `important`  
**Mandatory:** `true`  
**Initial assessment policy:** `ready_on_arrival`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** During the pre-close period; each room is checked again after its last use.  
**Location:** Project rooms 001, 002, 003, 004, 006 and Boardroom.

### Employee instruction

Visit each project room. Reset rooms that are available now, and create a named, timed final reset for rooms still in legitimate use.

A room cannot disappear from the Closing plan merely because it is booked. Unexpected use, missing serviceware or equipment problems require a deviation.

### Structured task items

- `room_001`
- `room_002`
- `room_003`
- `room_004`
- `room_006`
- `boardroom`
- `later_reset_owner_and_due_time`

### Done when

- Every available room is physically reset to the approved standard.
- Every room still in use has a named owner and due time after last use.
- Used serviceware and waste are removed where access is available.
- Room 005 is not generated.

### Deviation and blocking rules

- Unexpected occupation or conflicting booking.
- Access unavailable.
- Serviceware or equipment missing.
- Final reset cannot be assigned.

### Reference guidance

- `project-room-standard`.

### Dependencies and relations

- Relevant final room delivery may be compared with the next Opening O16.


## C05 — Clear and clean available Workbar and Atrium tables

**Stable key:** `closing.c05.maintain-available-workbar-atrium-tables`  
**Type:** `continuous`  
**Criticality:** `important`  
**Mandatory:** `true`  
**Initial assessment policy:** `none`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `continuous`  
**Timing:** Continuous from pre-close until C15 confirms final service end for the relevant zones.  
**Location:** Workbar and Atrium guest tables.

### Employee instruction

Continuously clear tables that are no longer in use. Recover serviceware and waste, wipe visible spills and preserve a professional guest-service environment without ending service early or disturbing active guests.

This task remains active until final service end is confirmed. It is not manually completed after one sweep.

### Structured task items

- `available_tables_cleared`
- `serviceware_recovered`
- `waste_removed`
- `visible_spills_cleaned`
- `active_guests_not_disturbed`
- `walkways_clear`
- `late_area_follow_up`

### Done when

- Available tables are maintained throughout the pre-close period.
- C15 confirms final service end for the relevant zones.
- No unresolved blocking cleanliness or safety issue remains.
- The system records the continuous task as completed through its successor relationship.

### Deviation and blocking rules

- Unsafe spill or cleaning issue cannot be corrected.
- Area access is blocked.
- Serviceware/waste cannot be removed.
- Blocked continuous task is not auto-completed.

### Reference guidance

- `workbar-standard-layout`.
- `atrium-standard-layout`.

### Dependencies and relations

- Continuous predecessor completed by C15 when no blocker remains.


## C06 — Rinse empty Coffee Canisters and preserve service capacity

**Stable key:** `closing.c06.rinse-empty-canisters-preserve-service`  
**Type:** `measurement`  
**Criticality:** `important`  
**Mandatory:** `true`  
**Initial assessment policy:** `control_result`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** Throughout pre-close as canisters become empty; final accounting is C17.  
**Location:** Members lounge, Workbar and Coffee Canister kitchen reserve.

### Employee instruction

As Coffee Canisters become empty, recover and rinse them through the approved cleaning flow. Keep enough fresh coffee available for remaining service and known orders.

Do not empty or remove the last required service canister merely to finish cleaning early. Record each canister’s current physical state.

### Structured task items

- `empty_canisters_recovered`
- `empty_canisters_rinsed`
- `canisters_still_in_service`
- `canisters_in_washing`
- `canisters_clean_and_ready`
- `service_capacity_preserved`
- `missing_or_damaged_parts`

### Done when

- Every currently empty canister is recovered and rinsed when operationally possible.
- Remaining service capacity matches the live plan.
- Each canister is in a known physical state.
- Missing or damaged canisters/parts are visible for C17.

### Deviation and blocking rules

- Coffee Canister or part missing/damaged.
- Cleaning equipment unavailable.
- Remaining service capacity cannot be preserved.
- Canister location/state is unknown.

### Reference guidance

- `coffee-canister-rinsed-storage`.

### Dependencies and relations

- C17 performs the final full inventory and cleaning delivery.


## C07 — Pre-restock the self-service counter to standard

**Stable key:** `closing.c07.pre-restock-self-service`  
**Type:** `control`  
**Criticality:** `important`  
**Mandatory:** `true`  
**Initial assessment policy:** `ready_on_arrival`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** During pre-close while service remains active; final overnight delivery is C32.  
**Location:** Workbar self-service counter.

### Employee instruction

Record whether the counter is currently at service standard, then pre-restock dry goods, consumables and serviceware without removing fresh products still needed for active service.

Keep the area orderly and ready for the remaining service period. C07 does not complete the overnight standard in C32.

### Structured task items

- `sugar_and_sweetener`
- `stirrers`
- `tea_slots_and_tea_bags`
- `honey_toothpicks_napkins`
- `takeaway_cups_and_lids`
- `teaspoons_cutlery_plates`
- `fruit_snacks_baked_goods_service_state`
- `small_waste_container`
- `surfaces_orderly`

### Done when

- First-check state is recorded.
- Required service consumables are restored for the remaining period.
- Fresh milk/coffee/food remains available according to live service needs.
- Shortages remain visible for final C32 delivery.

### Deviation and blocking rules

- Required consumable or serviceware unavailable.
- Tea-slot standard unresolved.
- Damaged container or unsafe presentation.
- Area cannot be used safely.

### Reference guidance

- `self-service-opening-standard`.
- `self-service-overnight-standard`.

### Dependencies and relations

- C32 performs a new final overnight check and never inherits C07 completion.


## C08 — Pre-restock the Workbar food and non-alcoholic fridge

**Stable key:** `closing.c08.pre-restock-workbar-food-nonalcoholic-fridge`  
**Type:** `measurement`  
**Criticality:** `important`  
**Mandatory:** `true`  
**Initial assessment policy:** `ready_on_arrival`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** During pre-close; final delivery is repeated at C28.  
**Location:** Workbar Non-Alcoholic Fridge.

### Employee instruction

Record the current physical state before moving stock. Pre-restock every active product line, including eggs, using the authoritative read-only fridge standard. Rotate dates, correct placement and front products while service continues.

This is not the next-day delivery; C28 must perform a fresh final check.

### Structured task items

- `inventory_standard_items` — dynamic authoritative product/target lines.
- `eggs_present_and_to_standard`
- `date_rotation`
- `correct_shelf_placement`
- `fronting_complete`
- `fridge_clean_and_operating`

### Done when

- First-check state is recorded.
- Every currently restockable line is restored.
- Eggs are included.
- Unresolved shortages have a visible deviation and final follow-up.

### Deviation and blocking rules

- Reserve stock missing.
- Expired/damaged product.
- Inventory mapping/source inconsistent.
- Fridge fault.

### Reference guidance

- `workbar-food-non-alcoholic-fridge`.

### Dependencies and relations

- C28 repeats the complete physical final delivery.


## C09 — Pre-restock the Workbar milk fridge

**Stable key:** `closing.c09.pre-restock-workbar-milk-fridge`  
**Type:** `measurement`  
**Criticality:** `important`  
**Mandatory:** `true`  
**Initial assessment policy:** `ready_on_arrival`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** During pre-close; final delivery is repeated at C29.  
**Location:** Workbar Milk Fridge.

### Employee instruction

Record the current count before restocking. Restore two regular milk and two Oatly where stock allows, rotate dates and confirm normal fridge condition.

### Structured task items

- `regular_milk_count` — target 2.
- `oatly_count` — target 2.
- `date_rotation`
- `fridge_clean_and_operating`
- `door_closed`

### Done when

- First-check state is recorded.
- The fridge reaches 2 regular + 2 Oatly or a visible blocker remains.
- Products are usable, rotated and correctly placed.

### Deviation and blocking rules

- Target cannot be reached.
- Expired/damaged product.
- Reserve stock unavailable.
- Fridge fault.

### Reference guidance

- `workbar-milk-fridge`.

### Dependencies and relations

- C29 repeats the complete physical final delivery.


## C10 — Pre-restock all active beverage and bar fridges

**Stable key:** `closing.c10.pre-restock-active-beverage-bar-fridges`  
**Type:** `measurement`  
**Criticality:** `important`  
**Mandatory:** `true`  
**Initial assessment policy:** `ready_on_arrival`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** During pre-close for every fridge not covered by C08/C09 and active for the day.  
**Location:** Workbar Bar Left, Workbar Bar Right, Cornerbar Left, Cornerbar Middle and Cornerbar Right, subject to active-zone context.

### Employee instruction

For each active beverage/bar fridge, record first-check state and pre-restock the authoritative product standard. Maintain correct placement, rotation, fronting and operating condition.

An area that remains open under an event is not N/A. Remaining work is transferred with an explicit target and due time.

### Structured task items

- `workbar_bar_left`
- `workbar_bar_right`
- `cornerbar_left`
- `cornerbar_middle`
- `cornerbar_right`
- `event_controlled_fridge_follow_up`

### Done when

- Every active fridge has been physically checked.
- Restockable shortages are corrected.
- Event-controlled remaining work has a valid transfer or named follow-up.
- Fridge faults and unavailable reserve stock remain visible.

### Deviation and blocking rules

- Required product cannot be restored.
- Fridge unavailable/faulty.
- Event responsibility unclear.
- Inventory standard unavailable.

### Reference guidance

- `workbar-bar-left-fridge`.
- `workbar-bar-right-fridge`.
- `cornerbar-left-fridge`.
- `cornerbar-middle-fridge`.
- `cornerbar-right-fridge`.

### Dependencies and relations

- C30 performs a new final restock and never inherits C10 completion.


## C11 — Check and date every opened wine and prosecco bottle

**Stable key:** `closing.c11.check-date-opened-wine-prosecco`  
**Type:** `control`  
**Criticality:** `important`  
**Mandatory:** `true`  
**Initial assessment policy:** `control_result`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** First pre-close check while sales remain active; repeated finally at C31.  
**Location:** Every active wine/prosecco storage and service location.

### Employee instruction

Inspect every opened wine and prosecco bottle. Confirm the approved opened-date label is present, readable and correct. Correct missing/incorrect labels and identify bottles that are unsuitable, empty or require manager review.

Do not write customer, transaction or unrelated sensitive data on labels or evidence.

### Structured task items

- `all_open_bottles_identified`
- `date_labels_present`
- `date_labels_readable_and_correct`
- `empty_or_unusable_bottles_handled`
- `bottle_location_recorded`
- `late_service_follow_up`

### Done when

- Every currently opened wine/prosecco bottle has a valid readable date label.
- Unusable or unclear bottles are handled or deviated.
- Remaining active-service bottles are identified for C31.

### Deviation and blocking rules

- Opened date cannot be established.
- Product appears expired/damaged.
- Required label material unavailable.
- Active area inaccessible.

### Reference guidance

- `opened-wine-date-label`.

### Dependencies and relations

- C31 is the final repeated bottle check after service ends.


## C12 — Prepare Too Good To Go and SVINN without ending sales early

**Stable key:** `closing.c12.prepare-too-good-to-go-svinn`  
**Type:** `procedure`  
**Criticality:** `important`  
**Mandatory:** `true`  
**Initial assessment policy:** `control_result`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** Prepare during pre-close; finalize only after the last sale in C16.  
**Location:** Food display, approved packing area and waste/SVINN recording flow.

### Employee instruction

Identify likely Too Good To Go and SVINN items and prepare packaging/recording so final handling can be completed quickly after the last sale.

Do not remove sellable products from normal sale, close availability or finalize counts early. Provisional preparation must remain clearly provisional.

### Structured task items

- `candidate_products_identified`
- `packaging_ready`
- `provisional_quantities_recorded`
- `sellable_stock_left_available`
- `svinn_categories_ready`
- `finalization_waits_for_last_sale`

### Done when

- Required packaging and provisional information are ready.
- No sellable product has been removed early.
- Final counts remain open for C16.

### Deviation and blocking rules

- Packaging unavailable.
- Product status unclear.
- System/recording flow unavailable.
- Risk of ending sales early.

### Reference guidance

- No image is required unless an approved packing layout later reduces mistakes.

### Dependencies and relations

- C16 completes the final handling after the last sale.


## C13 — Clean and reset the cleaning station for final close

**Stable key:** `closing.c13.clean-reset-cleaning-station-final-close`  
**Type:** `control`  
**Criticality:** `important`  
**Mandatory:** `true`  
**Initial assessment policy:** `ready_on_arrival`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** Prepare during pre-close and leave ready for the final Closing work.  
**Location:** Workbar cleaning station.

### Employee instruction

Record the first-check state, remove unnecessary clutter, separate clean and dirty items, replenish required approved supplies and set the station to the approved final-close working standard.

The station must remain usable for the rest of Closing; do not dismantle required capacity too early.

### Structured task items

- `station_clear_and_safe`
- `clean_dirty_separation`
- `approved_supplies_available`
- `clean_cloths_available`
- `containers_correctly_positioned`
- `final_close_capacity_preserved`

### Done when

- First-check state is recorded.
- The station matches the approved final-close setup.
- Required cleaning/dish capacity remains available.
- Missing equipment or supplies are visible.

### Deviation and blocking rules

- Required supply/equipment missing.
- Unsafe or blocked station.
- Leak or equipment damage.
- Reference/standard unresolved.

### Reference guidance

- `cleaning-station-final-close`.

### Dependencies and relations

- May provide comparable final delivery to the next Opening O07.


## C14 — Complete the 17:45 pre-close readiness checkpoint

**Stable key:** `closing.c14.pre-close-readiness-checkpoint-1745`  
**Type:** `checkpoint`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `control_result`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_phase`  
**Timing:** Visible 17:35; target 17:45; overdue 17:55. Server time is authoritative.  
**Location:** All pre-close scopes.

### Employee instruction

Perform a new physical 17:45 checkpoint. Do not complete it from the progress count alone. Confirm that Closing can proceed without ending service early and that every remaining issue has an owner.

Each item records `At standard`, `Correction required` or `Blocked`.

### Structured task items

- `remaining_bookings_events_current`
- `closing_responsibilities_confirmed`
- `first_serviceware_sweep_complete`
- `project_room_reset_plan_current`
- `workbar_atrium_tables_maintained`
- `coffee_canister_service_capacity_preserved`
- `self_service_pre_restocked`
- `workbar_nonalcoholic_fridge_pre_restocked`
- `milk_fridge_pre_restocked`
- `active_bar_fridges_pre_restocked`
- `opened_wine_first_check_complete`
- `too_good_to_go_svinn_prepared_without_early_close`
- `cleaning_station_ready_for_final_close`
- `no_hidden_preclose_blocker`

### Done when

- Every required checkpoint item is freshly checked at the checkpoint.
- Corrections are completed or visible as blockers.
- Remaining service capacity is preserved.
- Known late/event work has a valid owner or transfer path.

### Deviation and blocking rules

- Any critical pre-close scope is unprepared.
- Responsibility or final service timing is unclear.
- Stock/serviceware/equipment blocker has no owner.
- Checkpoint is assumed from earlier tasks instead of physically checked.

### Reference guidance

- Use task-specific references rather than a new generic image.

### Dependencies and relations

- C14 never completes the final checks C27–C46.


# Block 2 — Closing 18:00–19:00

## Purpose

End service only when each zone is legitimately finished, complete the final physical reset and delivery, secure money, assets, doors and access controls, submit the handover, perform Closing Responsible verification and exit through the final critical gate.

## C15 — Confirm final service end for each active zone

**Stable key:** `closing.c15.confirm-final-service-end-by-zone`  
**Type:** `checkpoint`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `control_result`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** At the actual final service end for each zone; no zone may be closed early for convenience.  
**Location:** Active service zones: Workbar, Atrium, Cornerbar and any authorized additional scope.

### Employee instruction

For each active zone, confirm the authoritative final service state. Verify guests/orders/events are finished or that the remaining work is formally transferred to an authorized Event Operations recipient.

Do not close a zone because the scheduled time passed if service is still active.

### Structured task items

- `workbar_final_service_state`
- `atrium_final_service_state`
- `cornerbar_final_service_state`
- `other_active_zone_state`
- `event_transfer_target_and_due_time`
- `remaining_guest_or_order_check`

### Done when

- Every active zone is either legitimately closed or has an accepted transfer.
- Final service end is server-recorded or supported by current event context.
- No guest/order/event work is silently abandoned.
- C05 can be system-completed when its zones are finished and no blocker remains.

### Deviation and blocking rules

- Guests/orders remain without responsible service owner.
- Event close time/authority unclear.
- Transfer cannot be accepted.
- Zone is being closed early.

### Reference guidance

- No image is required.

### Dependencies and relations

- Completes continuous C05 when no blocking deviation remains.


## C16 — Finalize Too Good To Go and SVINN after the last sale

**Stable key:** `closing.c16.finalize-too-good-to-go-svinn`  
**Type:** `procedure`  
**Criticality:** `important`  
**Mandatory:** `true`  
**Initial assessment policy:** `none`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** Only after the last relevant sale; must not be finalized early.  
**Location:** Food display, approved packing area and reporting flow.

### Employee instruction

After the final sale, perform the actual final count and handling. Package approved Too Good To Go items, record SVINN using the approved categories and remove/clean the remaining display according to policy.

Use the current physical quantity, not the provisional C12 estimate.

### Structured task items

- `last_sale_confirmed`
- `too_good_to_go_final_items_and_count`
- `svinn_final_items_and_count`
- `approved_packaging_and_labels`
- `remaining_display_cleared`
- `reporting_completed`

### Done when

- Final sale is confirmed.
- Actual products are correctly assigned and recorded.
- Packing/reporting is complete.
- The display area is left in the required final state.

### Deviation and blocking rules

- Final sale cannot be confirmed.
- Packaging/reporting system unavailable.
- Product disposition unclear.
- Count cannot be reconciled.

### Reference guidance

- No image is required unless an approved packing standard is later added.

### Dependencies and relations

- Requires C12 preparation and the relevant service end from C15.


## C17 — Recover, clean and account for every Coffee Canister

**Stable key:** `closing.c17.recover-clean-account-all-coffee-canisters`  
**Type:** `measurement`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `control_result`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** After final coffee service, or through a completed Event-transfer for canisters still in event use.  
**Location:** Members lounge, Workbar, Kitchen reserve, washing/storage and event scopes.

### Employee instruction

Perform a full physical Coffee Canister inventory. Recover every available canister and all required parts. Empty old coffee, wash/rinse through the approved procedure, dry and store each item in the approved position.

A canister still in event use must have accepted and completed transfer evidence. A missing canister is not completion.

### Structured task items

- `configured_total_inventory_target` — unresolved numeric standard.
- `clean_and_stored_count`
- `in_washing_count`
- `in_known_event_use_count`
- `transferred_with_evidence_count`
- `missing_or_unlocated_count`
- `lids_and_required_parts_accounted_for`
- `old_coffee_remaining_count`

### Done when

- Every configured canister and required part is physically accounted for.
- No old coffee remains.
- All ordinary Closing canisters are clean, dry and stored.
- Any event-used canister has completed transfer evidence.
- `missing_or_unlocated_count = 0`.

### Deviation and blocking rules

- Total inventory target unresolved — publication blocker.
- Canister/part missing or damaged.
- Old coffee cannot be removed/cleaned.
- Event transfer incomplete or unsupported.

### Reference guidance

- `coffee-canister-rinsed-storage`.

### Dependencies and relations

- Complementary to Opening Coffee Canister service tasks. Provides final canister evidence.


## C18 — Run and complete the coffee machine cleaning cycle

**Stable key:** `closing.c18.coffee-machine-cleaning-cycle`  
**Type:** `procedure`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `none`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** After final coffee-machine use.  
**Location:** Workbar coffee machine.

### Employee instruction

Follow the approved machine-specific night-cleaning procedure. Prepare the machine, run the required cleaning cycle, complete the rinse/confirmation steps and leave the machine in the approved overnight state.

Do not improvise chemical quantities or bypass a machine error. The reference may show controls but never credentials.

### Structured task items

- `final_service_ended`
- `approved_cleaning_materials_used`
- `cleaning_cycle_completed`
- `rinse_confirmation_completed`
- `waste_and_removable_parts_handled`
- `machine_in_approved_night_state`
- `no_unresolved_error_or_leak`

### Done when

- The approved cleaning cycle completes successfully.
- Required rinse/confirmation steps are complete.
- The machine is in the approved overnight state.
- No unresolved error, leak or cleaning failure remains.

### Deviation and blocking rules

- Machine error or leak.
- Approved cleaning material unavailable.
- Cycle cannot complete.
- Night state cannot be confirmed.

### Reference guidance

- `coffee-machine-night-state`.

### Dependencies and relations

- Complementary to Opening O03.


## C19 — Complete the scheduled milk-system deep clean

**Stable key:** `closing.c19.milk-system-deep-clean`  
**Type:** `conditional`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `none`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `system_only`  
**Verification policy:** `none`  
**Repeat policy:** `conditional`  
**Timing:** After final milk service on Wednesday or Friday. Excluded by system condition on other weekdays.  
**Location:** Workbar coffee machine milk system and approved washing/storage position.

### Employee instruction

When the scheduled condition matches Wednesday or Friday, perform the approved deep-clean procedure for the milk system and its removable parts.

The task is system-conditioned. Employees do not choose N/A. Follow the approved machine guide; do not invent chemical or dismantling steps beyond the configured procedure.

### Structured task items

- `milk_service_ended`
- `removable_parts_identified`
- `approved_deep_clean_completed`
- `parts_rinsed_and_visibly_clean`
- `parts_dried_or_stored_as_approved`
- `system_reassembled_or_left_in_approved_night_state`
- `no_unresolved_milk_system_error`

### Done when

- The weekday condition is matched.
- Every required deep-clean step is complete.
- Parts and system are left in the approved night state.
- No residue, damage or unresolved error remains.

### Deviation and blocking rules

- Approved deep-clean material/equipment unavailable.
- Part missing or damaged.
- Procedure cannot be completed.
- System error or hygiene concern.

### Reference guidance

- `milk-system-cleaning-parts`.

### Dependencies and relations

- Condition: weekday is Wednesday OR Friday.


## C20 — Clean and return all bar equipment and beer-tap parts

**Stable key:** `closing.c20.clean-return-bar-equipment-beer-tap-parts`  
**Type:** `procedure`  
**Criticality:** `important`  
**Mandatory:** `true`  
**Initial assessment policy:** `none`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** After the relevant bar/equipment is no longer needed, or through completed Event-transfer evidence.  
**Location:** Workbar/Cornerbar equipment, washing points and approved storage.

### Employee instruction

Recover, clean, dry and return every required bar tool and removable beer-tap component to its approved storage. Do not leave dirty tools, loose parts or wet components hidden on the bar.

Event-controlled equipment remains transferred until completed evidence is recorded.

### Structured task items

- `shakers_jiggers_strainers_and_bar_tools`
- `knives_and_other_approved_bar_tools`
- `beer_tap_removable_parts`
- `silver_or_small_metal_parts`
- `beer_drip_trays`
- `all_parts_dry_and_stored`
- `missing_or_damaged_items`

### Done when

- All ordinary Closing equipment/parts are recovered.
- Items are clean, dry and in approved storage.
- Nothing required remains unlocated.
- Event-controlled items have completed transfer evidence.

### Deviation and blocking rules

- Equipment/part missing or damaged.
- Cleaning cannot be completed.
- Storage standard unavailable.
- Event transfer incomplete.

### Reference guidance

- `bar-equipment-storage`.
- `beer-tap-parts`.
- `beer-drip-trays`.


## C21 — Clean the self-service surfaces and the Workbar bar area

**Stable key:** `closing.c21.clean-self-service-workbar-bar-area`  
**Type:** `procedure`  
**Criticality:** `important`  
**Mandatory:** `true`  
**Initial assessment policy:** `control_result`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** After final use of each surface; C32 separately completes overnight stock/presentation.  
**Location:** Workbar self-service counter and Workbar bar area.

### Employee instruction

Clear the surfaces, remove spills/crumbs/waste and clean them through the approved procedure. Keep required equipment accessible until its own final task is complete.

This task concerns clean, dry working surfaces. C32 controls the final overnight self-service contents.

### Structured task items

- `self_service_surface_cleared`
- `self_service_surface_clean_and_dry`
- `workbar_bar_surface_cleared`
- `workbar_bar_surface_clean_and_dry`
- `small_waste_removed`
- `no_hidden_dirty_serviceware`

### Done when

- All relevant surfaces are visibly clean and dry.
- Waste and dirty serviceware are removed.
- No required later procedure has been blocked by premature dismantling.

### Deviation and blocking rules

- Surface cannot be cleaned safely.
- Water/equipment/cleaning supply unavailable.
- Active service still legitimately uses the area.
- Damage or hygiene issue.

### Reference guidance

- `self-service-overnight-standard`.
- `cleaning-station-final-close`.


## C22 — Complete the final Workbar and Atrium reset

**Stable key:** `closing.c22.final-workbar-atrium-reset`  
**Type:** `control`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `ready_on_arrival`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `after_last_use`  
**Timing:** After final use of the relevant zones and remaining project rooms.  
**Location:** Workbar, Atrium, Members lounge and project rooms requiring final reset.

### Employee instruction

Perform the final physical reset after service. Restore furniture, clear guest/service items, complete remaining room resets and leave the approved overnight presentation.

When the seasonal-candle condition was included during Opening, extinguish/remove all candles and return candle holders to approved storage.

### Structured task items

- `workbar_furniture_and_tables_reset`
- `atrium_furniture_and_tables_reset`
- `members_lounge_final_reset`
- `remaining_project_room_resets`
- `service_items_and_waste_removed`
- `walkways_and_exits_clear`
- `seasonal_candles_extinguished_and_removed_when_required`

### Done when

- All closed guest areas match the approved final layout.
- Remaining rooms are reset or formally transferred.
- No used service items/waste remain.
- Conditional seasonal candle companion is handled.

### Deviation and blocking rules

- Active event prevents final reset and no transfer exists.
- Furniture/equipment missing or damaged.
- Room remains inaccessible.
- Safety or layout standard cannot be met.

### Reference guidance

- `workbar-standard-layout`.
- `atrium-standard-layout`.
- `project-room-standard`.

### Dependencies and relations

- Conditional companion to Opening O22 when seasonal candles were included.


## C23 — Drain, clean and turn off the Workbar dishwashers

**Stable key:** `closing.c23.drain-clean-turn-off-workbar-dishwashers`  
**Type:** `procedure`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `none`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** After final Workbar washing is complete.  
**Location:** Workbar dishwashing station.

### Employee instruction

Complete the approved shutdown procedure for every required Workbar dishwasher. Finish required washing first, then drain, clean removable parts and internal/visible surfaces, turn the machine off and leave it in the approved overnight state.

Do not leave a machine powered, full of dirty water or incorrectly assembled.

### Structured task items

- `final_wash_complete`
- `machine_drained`
- `filters_and_removable_parts_cleaned`
- `interior_and_visible_surfaces_cleaned`
- `machine_powered_off`
- `approved_night_state_confirmed`
- `no_leak_or_error`

### Done when

- Every required Workbar dishwasher is drained, clean and off.
- Removable parts are clean and correctly left/stored.
- No dirty water, leak or unresolved error remains.

### Deviation and blocking rules

- Machine cannot drain or power off.
- Filter/part missing or damaged.
- Leak/error.
- Final washing remains incomplete.

### Reference guidance

- `workbar-dishwasher-night-state`.

### Dependencies and relations

- Complementary to Opening O04.


## C24 — Complete the kitchen close and shut down the kitchen dishwashers

**Stable key:** `closing.c24.kitchen-close-dishwasher-shutdown`  
**Type:** `procedure`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `none`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** After final kitchen/support use.  
**Location:** Kitchen and kitchen dishwashers.

### Employee instruction

Complete the approved kitchen Closing scope: remove remaining dirty serviceware/waste, clean required work surfaces, complete final washing and shut down every required kitchen dishwasher through its approved drain/clean/off procedure.

Do not invent food-safety procedures beyond the manager-configured standard; unresolved kitchen hygiene/equipment issues remain visible.

### Structured task items

- `remaining_dirty_serviceware_handled`
- `required_kitchen_surfaces_clean_and_dry`
- `waste_removed`
- `final_dishwasher_wash_complete`
- `dishwashers_drained_and_cleaned`
- `dishwashers_powered_off`
- `approved_night_state_confirmed`

### Done when

- Required kitchen support surfaces are closed to the approved standard.
- Every kitchen dishwasher is drained, clean and off.
- No dirty serviceware/waste or unresolved critical hygiene issue remains.

### Deviation and blocking rules

- Dishwasher fault.
- Kitchen area inaccessible or still legitimately active.
- Required cleaning cannot be completed.
- Hygiene/safety issue.

### Reference guidance

- `kitchen-dishwasher-night-state`.

### Dependencies and relations

- Complementary to Opening O05.


## C25 — Return all dirty cloths and rags to cleaning storage

**Stable key:** `closing.c25.return-dirty-cloths-rags`  
**Type:** `action`  
**Criticality:** `normal`  
**Mandatory:** `true`  
**Initial assessment policy:** `none`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** After final cleaning tasks have released the cloths/rags.  
**Location:** All Closing areas and approved cleaning storage.

### Employee instruction

Collect every used cloth and rag from Workbar, Atrium, Kitchen, bars, cleaning station and support areas. Place them in the approved dirty-textile storage/return flow. Leave no dirty textile hidden on a surface, machine or in a container.

### Structured task items

- `workbar_checked`
- `atrium_checked`
- `kitchen_checked`
- `bar_areas_checked`
- `cleaning_station_checked`
- `dirty_textiles_returned`
- `no_used_textiles_remaining`

### Done when

- All required areas are checked.
- Every dirty cloth/rag is in the approved return/storage.
- No used textile remains in a guest/service area.

### Deviation and blocking rules

- Approved storage unavailable.
- Area inaccessible.
- Contaminated/damaged textile requires special handling.

### Reference guidance

- No image is required unless a storage-location reference later reduces mistakes.


## C26 — Remove all waste, PANT, glass and cardboard and rinse the bins

**Stable key:** `closing.c26.remove-waste-pant-glass-cardboard-rinse-bins`  
**Type:** `procedure`  
**Criticality:** `important`  
**Mandatory:** `true`  
**Initial assessment policy:** `none`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** After final waste-producing tasks, before the security sweep.  
**Location:** All operational areas and the approved waste route.

### Employee instruction

Collect and separate all ordinary waste, PANT, glass and cardboard through the approved route. Empty the relevant bins, rinse bins that require rinsing and return them clean enough for the next day.

Do not mix waste streams or leave full bags/containers hidden in support areas.

### Structured task items

- `ordinary_waste_removed`
- `pant_removed`
- `glass_removed`
- `cardboard_removed`
- `relevant_bins_emptied`
- `required_bins_rinsed`
- `bins_returned`
- `waste_route_clear`

### Done when

- All required waste streams are removed.
- Required bins are emptied/rinsed and returned.
- No full waste container remains in the closed operational areas.

### Deviation and blocking rules

- Waste route/access blocked.
- Container damaged or unsafe.
- Collection point unavailable.
- Spill/breakage cannot be handled safely.

### Reference guidance

- A waste-route reference may be added after the exact route is confirmed.


## C27 — Complete the final serviceware recovery and full inventory accountability

**Stable key:** `closing.c27.final-serviceware-accountability`  
**Type:** `measurement`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `control_result`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** After final ordinary serviceware use; event-used items require completed transfer evidence.  
**Location:** Serviceware storage, washing areas and the complete configured recovery route.

### Employee instruction

Perform the final physical count and recovery. Search every approved recovery point, including relevant office floors once configured. Wash and return all recovered items.

Coffee cups and wine glasses are separate evidence lines. Completion requires full configured targets, nothing left in washing and nothing unlocated, except items supported by completed Event-transfer evidence.

### Structured task items

- `coffee_cups_full_target` — unresolved numeric standard.
- `coffee_cups_clean_and_stored`
- `coffee_cups_in_washing`
- `coffee_cups_known_event_use`
- `coffee_cups_transferred_with_evidence`
- `coffee_cups_unlocated`
- `wine_glasses_full_target` — unresolved numeric standard.
- `wine_glasses_clean_and_stored`
- `wine_glasses_in_washing`
- `wine_glasses_known_event_use`
- `wine_glasses_transferred_with_evidence`
- `wine_glasses_unlocated`
- `full_recovery_route_checked`

### Done when

- Full targets are configured.
- All required recovery points are physically checked.
- Clean/stored plus completed transfer evidence accounts for each target.
- `in_washing = 0` for final ordinary Closing.
- `unlocated = 0`.
- Missing serviceware is not hidden as completion.

### Deviation and blocking rules

- Full targets unresolved — publication blocker.
- Recovery route unresolved — publication blocker.
- Any cup/glass remains unlocated.
- Required item cannot be washed/returned.
- Event transfer is incomplete.

### Reference guidance

- `coffee-cups-full-storage`.
- `wine-glasses-full-storage`.

### Dependencies and relations

- Delivery evidence to Opening O15 coffee-cup and wine-glass items.
- Final check never inherits C03.


## C28 — Final-restock the Workbar food and non-alcoholic fridge

**Stable key:** `closing.c28.final-restock-workbar-food-nonalcoholic-fridge`  
**Type:** `measurement`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `ready_on_arrival`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** After final sales/use affecting the fridge.  
**Location:** Workbar Non-Alcoholic Fridge.

### Employee instruction

Perform a new final first-check assessment. Restock every active authoritative product line, including eggs, to the configured target. Rotate dates, correct placement, front the fridge and confirm it is clean, closed and operating.

C08 completion does not count. The final evidence must describe the state delivered to the next Opening.

### Structured task items

- `inventory_standard_items` — dynamic authoritative product/target lines.
- `eggs_present_and_to_standard`
- `date_rotation`
- `correct_shelf_placement`
- `fronting_complete`
- `fridge_clean_and_operating`
- `door_closed`

### Done when

- Final first-check state is recorded.
- Every active product and eggs are physically at target.
- Products are usable, rotated and correctly placed.
- Fridge is clean, fronted, closed and operating.
- Required verification/override evidence is valid.

### Deviation and blocking rules

- Any product cannot reach target.
- Reserve stock missing.
- Expired/damaged product.
- Inventory source inconsistent.
- Fridge fault.

### Reference guidance

- `workbar-food-non-alcoholic-fridge`.

### Dependencies and relations

- `delivery_comparison` to Opening O13, `ready_on_arrival`, same scope.


## C29 — Final-restock the Workbar milk fridge

**Stable key:** `closing.c29.final-restock-workbar-milk-fridge`  
**Type:** `measurement`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `ready_on_arrival`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** After final use affecting reserve milk.  
**Location:** Workbar Milk Fridge.

### Employee instruction

Perform a new final first-check assessment. Restore exactly two regular milk and two Oatly, rotate dates, confirm correct placement and leave the fridge clean, closed and operating normally.

C09 does not complete this task.

### Structured task items

- `regular_milk_count` — target 2.
- `oatly_count` — target 2.
- `date_rotation`
- `correct_placement`
- `fridge_clean_and_operating`
- `door_closed`

### Done when

- Final first-check state is recorded.
- Two regular milk and two Oatly are physically present.
- Products are in date and rotated.
- Fridge is clean, closed and operating.

### Deviation and blocking rules

- 2 + 2 cannot be reached.
- Reserve stock missing.
- Expired/damaged product.
- Fridge fault.

### Reference guidance

- `workbar-milk-fridge`.

### Dependencies and relations

- `delivery_comparison` to Opening O09, `ready_on_arrival`, same scope.


## C30 — Final-restock every required beverage and bar fridge

**Stable key:** `closing.c30.final-restock-required-beverage-bar-fridges`  
**Type:** `measurement`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `ready_on_arrival`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** After final use of each fridge, or through completed Event-transfer evidence.  
**Location:** Workbar Bar Left, Workbar Bar Right, Cornerbar Left, Cornerbar Middle and Cornerbar Right.

### Employee instruction

Perform a fresh final check for every required beverage/bar fridge. Restock the authoritative product lines, rotate dates, front products and confirm clean, normal operation.

A fridge still serving an event is transferred; it is not marked N/A. Delivery remains blocked until valid transfer completion evidence exists.

### Structured task items

- `workbar_bar_left`
- `workbar_bar_right`
- `cornerbar_left`
- `cornerbar_middle`
- `cornerbar_right`
- `per_fridge_inventory_evidence`
- `event_transfer_evidence_when_required`

### Done when

- Every required ordinary Closing fridge is physically at standard.
- Event-controlled fridges have completed, valid evidence.
- Placement, rotation, fronting and operation are correct.
- No required product shortage is hidden.

### Deviation and blocking rules

- Product target cannot be reached.
- Fridge fault.
- Inventory standard unavailable.
- Event transfer incomplete/unauthorized.

### Reference guidance

- `workbar-bar-left-fridge`.
- `workbar-bar-right-fridge`.
- `cornerbar-left-fridge`.
- `cornerbar-middle-fridge`.
- `cornerbar-right-fridge`.

### Dependencies and relations

- C10 pre-restock never completes C30.


## C31 — Complete the final opened-wine and prosecco check

**Stable key:** `closing.c31.final-opened-wine-prosecco-check`  
**Type:** `control`  
**Criticality:** `important`  
**Mandatory:** `true`  
**Initial assessment policy:** `control_result`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** After final wine/prosecco sale in each relevant zone.  
**Location:** Every wine/prosecco service and storage location.

### Employee instruction

Repeat the complete physical opened-bottle check. Identify every opened wine/prosecco bottle, confirm the approved date label, handle empty/unusable/unclear bottles and store each bottle in the correct final position.

C11 is only the pre-close check.

### Structured task items

- `all_final_open_bottles_identified`
- `date_labels_present_readable_correct`
- `empty_bottles_handled`
- `unusable_or_unclear_bottles_handled`
- `correct_final_storage`
- `event_transfer_evidence_when_required`

### Done when

- Every final opened bottle is identified and correctly labelled.
- Empty/unusable items are handled.
- All retained bottles are in correct storage.
- Event-controlled bottles have valid completed transfer evidence.

### Deviation and blocking rules

- Opened date cannot be confirmed.
- Product quality/safety concern.
- Label material unavailable.
- Event transfer incomplete.

### Reference guidance

- `opened-wine-date-label`.

### Dependencies and relations

- Final repeat; never inherits C11.


## C32 — Reset and restock the self-service counter to the overnight standard

**Stable key:** `closing.c32.self-service-overnight-standard`  
**Type:** `control`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `ready_on_arrival`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** After final self-service use.  
**Location:** Workbar self-service counter.

### Employee instruction

Perform a new final assessment and leave the counter at the approved overnight standard.

Fresh service milk and old coffee must not remain out overnight. Dry goods and serviceware must be full, surfaces clean/dry and the waste container emptied.

### Structured task items

- `no_fresh_milk_left_out`
- `no_old_coffee_left_out`
- `milk_jug_emptied_and_cleaned`
- `coffee_canisters_cleaned_and_stored`
- `sugar_sweetener_stirrers_full`
- `six_tea_slots_and_tea_supplies_full`
- `honey_toothpicks_napkins_full`
- `takeaway_cups_and_lids_full`
- `teaspoons_cutlery_and_plate_sets_full`
- `baked_goods_surface_clean_and_empty`
- `fruit_snacks_at_approved_overnight_standard`
- `small_waste_container_emptied`
- `surfaces_clean_and_dry`

### Done when

- Final first-check state is recorded.
- No fresh milk or old coffee is left out.
- Milk jug and Coffee Canisters are correctly cleaned/stored.
- Dry goods and serviceware are at overnight standard.
- Food/display/waste/surfaces meet the overnight policy.

### Deviation and blocking rules

- Required dry good/serviceware unavailable.
- Tea-slot standard unresolved.
- Milk/coffee equipment cannot be cleaned/stored.
- Surface/waste/food presentation cannot meet overnight standard.

### Reference guidance

- `self-service-overnight-standard`.

### Dependencies and relations

- `delivery_comparison` to Opening O14, `ready_on_arrival`, same scope.


## C33 — Close and lock every required fridge

**Stable key:** `closing.c33.close-lock-required-fridges`  
**Type:** `control`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `control_result`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** After final restock and final use of each fridge.  
**Location:** All operational fridges.

### Employee instruction

Apply the manager-configured closing rule to each fridge. Physically confirm door/lock/power state as required. Do not guess whether a fridge should be locked, powered or left available.

A fridge still required for an event remains transferred until the event close is evidenced.

### Structured task items

- `workbar_bar_left_rule`
- `workbar_bar_right_rule`
- `workbar_nonalcoholic_rule`
- `workbar_milk_rule`
- `cornerbar_left_rule`
- `cornerbar_middle_rule`
- `cornerbar_right_rule`
- `event_transfer_evidence_when_required`

### Done when

- Fridge-closing rules are configured.
- Every required fridge physically matches its rule.
- Event-controlled exceptions have completed evidence.
- No door/lock/power state is assumed.

### Deviation and blocking rules

- Fridge-closing rules unresolved — publication blocker.
- Door/lock cannot secure.
- Power/operating state abnormal.
- Event transfer incomplete.

### Reference guidance

- Use the fridge-specific references where available.

### Dependencies and relations

- Requires relevant final restock C28–C30.


## C34 — Close every open POS table and customer account

**Stable key:** `closing.c34.close-open-pos-tables-accounts`  
**Type:** `control`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `control_result`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** After the final sale/order for the ordinary Closing scope.  
**Location:** POS/Weorder/customer-account systems.

### Employee instruction

Review every POS table, open order and customer account that must be closed. Complete or transfer legitimate outstanding activity and confirm no ordinary Closing item remains open.

Do not place customer, card or payment details in notes/evidence.

### Structured task items

- `all_pos_tables_reviewed`
- `all_open_orders_reviewed`
- `customer_accounts_reviewed`
- `ordinary_scope_open_count_zero`
- `event_scope_transferred_when_required`
- `system_errors_recorded`

### Done when

- Every ordinary Closing table/order/account is closed.
- Event-controlled activity has valid transfer evidence.
- No unresolved open transaction remains hidden.
- Sensitive payment/customer data is absent from evidence.

### Deviation and blocking rules

- POS/Weorder unavailable.
- Open transaction cannot be resolved.
- Responsibility/transfer unclear.
- Account discrepancy requires manager.

### Reference guidance

- No screenshot containing customer/payment data.

### Dependencies and relations

- C35 depends on C34.


## C35 — Close the register and complete settlement

**Stable key:** `closing.c35.close-register-complete-settlement`  
**Type:** `procedure`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `none`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `self_recheck`  
**Repeat policy:** `once_per_run`  
**Timing:** After C34 and final sales for the ordinary Closing scope.  
**Location:** Register/POS and physical cash drawer.

### Employee instruction

Use the approved register-close procedure. Complete settlement, count/confirm the required physical and system results and record any discrepancy through the approved deviation path.

Never record card data, credentials or safe codes.

### Structured task items

- `c34_open_tables_zero_or_transferred`
- `register_close_started`
- `settlement_completed`
- `physical_cash_count_completed`
- `system_totals_reviewed`
- `discrepancy_recorded_and_owned`
- `register_closed`

### Done when

- C34 is handled.
- Settlement and required count/review are complete.
- Any discrepancy is explicitly recorded and owned.
- The register is closed through the approved procedure.

### Deviation and blocking rules

- Open tables/orders remain.
- Settlement/register system failure.
- Cash/system discrepancy.
- Required manager review unavailable.

### Reference guidance

- No security-sensitive image.

### Dependencies and relations

- C36 depends on C35. Complementary to Opening O17.


## C36 — Secure the till and all required keys in the safe

**Stable key:** `closing.c36.secure-till-keys-safe`  
**Type:** `procedure`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `none`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `closing_responsible`  
**Repeat policy:** `once_per_run`  
**Timing:** Immediately after C35.  
**Location:** Approved till/key security flow and safe.

### Employee instruction

Physically secure the closed till and every required key through the approved safe procedure. Confirm all required items are present before securing them.

Never write or photograph the safe code. Completion evidence records items and actors, not credentials.

### Structured task items

- `till_present_and_secured`
- `required_keys_accounted_for`
- `items_placed_in_approved_safe_position`
- `safe_physically_closed`
- `credential_not_recorded`
- `closing_responsible_verification_required`

### Done when

- C35 is complete.
- The till and all required keys are physically accounted for and secured.
- The safe is physically closed.
- Required Closing Responsible verification is valid.

### Deviation and blocking rules

- Till/key missing.
- Safe cannot be secured.
- Required verification unavailable.
- Security concern.

### Reference guidance

- No image or note may expose the safe code.

### Dependencies and relations

- C45 verifies safe/key control. C42/C46 rely on the remaining key plan.


## C37 — Return all iPads, POS devices and payment terminals to their charging positions

**Stable key:** `closing.c37.return-devices-to-charging`  
**Type:** `measurement`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `control_result`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** After devices are released from final service or through completed Event-transfer evidence.  
**Location:** Device Charging Station and event scopes.

### Employee instruction

Use the snapshotted active asset registry. Physically account for every required iPad, POS device and payment terminal, return it to the approved charging position and confirm charging indication.

Do not record device credentials or payment data.

### Structured task items

- `active_asset_registry_items` — generated read-only per asset.
- `device_physically_accounted_for`
- `correct_charging_position`
- `charging_confirmed`
- `damage_or_fault_recorded`
- `event_transfer_evidence_when_required`

### Done when

- Every required asset is physically accounted for.
- Ordinary Closing devices are in the correct charging positions.
- Charging is confirmed.
- Event-controlled devices have completed transfer evidence.

### Deviation and blocking rules

- Device missing/damaged.
- Charging point/cable fault.
- Asset registry inconsistency.
- Event transfer incomplete.

### Reference guidance

- `device-charging-station`.

### Dependencies and relations

- Asset evidence remains read-only and never writes the asset domain.


## C38 — Turn off music in every closed zone

**Stable key:** `closing.c38.turn-off-music-closed-zones`  
**Type:** `control`  
**Criticality:** `important`  
**Mandatory:** `true`  
**Initial assessment policy:** `none`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** After each zone’s final service end.  
**Location:** All active audio zones.

### Employee instruction

For each closed zone, stop the approved music source and physically confirm the zone is silent. Do not switch off music in a zone still operating under an event.

Event-controlled zones require transfer evidence.

### Structured task items

- `workbar_music_off`
- `atrium_music_off`
- `cornerbar_music_off_or_transferred`
- `other_zone_music_state`
- `controls_returned`

### Done when

- Every closed zone is silent.
- Active event zones remain correctly controlled through transfer.
- No unrelated zone is changed incorrectly.

### Deviation and blocking rules

- Audio control/system unavailable.
- Zone status unclear.
- Event transfer incomplete.

### Reference guidance

- Optional audio-control guide without credentials.

### Dependencies and relations

- Complementary to Opening O19.


## C39 — Turn off the Workbar screen

**Stable key:** `closing.c39.turn-off-workbar-screen`  
**Type:** `action`  
**Criticality:** `important`  
**Mandatory:** `true`  
**Initial assessment policy:** `none`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** After Workbar visual service is finished.  
**Location:** Workbar screen.

### Employee instruction

Turn off the Workbar screen through the approved control, confirm the display is off and return any control equipment to its approved position. Do not edit slide content.

### Structured task items

- `screen_powered_off`
- `display_visibly_off`
- `control_returned`
- `no_unresolved_error`

### Done when

- The Workbar screen is visibly off.
- Control equipment is returned.
- No error or unintended content remains.

### Deviation and blocking rules

- Screen/control unavailable.
- Screen will not power off.
- Control equipment missing.

### Reference guidance

- `workbar-screen-night-state`.

### Dependencies and relations

- Complementary to Opening O20.


## C40 — Set all closed zones to the approved lighting mode

**Stable key:** `closing.c40.closed-zone-lighting-mode`  
**Type:** `control`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `none`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** After final service end for each zone.  
**Location:** Lighting control and all closed zones.

### Employee instruction

Apply the approved closed lighting preset/state to every closed zone and physically confirm the result. Preserve required safety/emergency lighting. Event-controlled zones remain transferred until their close.

### Structured task items

- `workbar_closed_lighting`
- `atrium_closed_lighting`
- `cornerbar_closed_lighting_or_transferred`
- `other_zone_closed_lighting`
- `safety_lighting_preserved`

### Done when

- Every closed zone visibly matches the approved closed lighting state.
- Safety lighting is unaffected.
- Event-controlled zones have completed transfer evidence.

### Deviation and blocking rules

- Lighting control/preset failure.
- Physical result does not match approved state.
- Zone responsibility unclear.
- Event transfer incomplete.

### Reference guidance

- `closed-lighting-preset`.

### Dependencies and relations

- Complementary to Opening O21.


## C41 — Complete the final guest, toilet and area sweep

**Stable key:** `closing.c41.final-guest-toilet-area-sweep`  
**Type:** `control`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `control_result`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** Immediately before the door/security sequence, after final ordinary service.  
**Location:** `final-guest-area-sweep` location set.

### Employee instruction

Walk the complete configured final sweep route. Physically confirm closed areas contain no remaining guests, forgotten serviceware/waste, visible hazards or unhandled room/toilet issues.

An area still active under an event is transferred; it is not marked N/A.

### Structured task items

- `workbar_sweep`
- `members_lounge_sweep`
- `workbar_toilets_sweep`
- `basement_toilets_sweep`
- `cornerbar_toilets_sweep`
- `atrium_sweep`
- `project_rooms_and_boardroom_sweep`
- `kitchen_support_sweep`
- `no_remaining_guest_in_closed_scope`
- `event_active_area_transfer_evidence`

### Done when

- Every required location is physically visited.
- No guest remains in an ordinary closed area.
- No unhandled serviceware, waste or visible hazard remains.
- Event-active areas have valid responsibility and evidence.

### Deviation and blocking rules

- Person remains without responsible owner.
- Area inaccessible.
- Safety/hygiene issue.
- Event transfer incomplete.

### Reference guidance

- Use location-specific references only when they materially reduce mistakes.

### Dependencies and relations

- C42 follows the completed physical sweep.


## C42 — Physically lock and verify every required door

**Stable key:** `closing.c42.lock-verify-required-doors`  
**Type:** `verification`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `control_result`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `self_recheck`  
**Repeat policy:** `once_per_run`  
**Timing:** After C41 and before Salto/alarm.  
**Location:** `closing-door-check` location set.

### Employee instruction

Follow the configured physical door/lock route. For each required point, close it, apply the configured lock/security rule and physically verify the result using the approved pull/visual check.

The Cornerbar street upper security lock must be a separate item. Never record a code or credential.

### Structured task items

- `front_door`
- `vindfang_door`
- `kitchen_atrium_door`
- `atrium_workbar_door`
- `cornerbar_atrium_door`
- `garbage_hallway_atrium_door`
- `cornerbar_street_door`
- `cornerbar_street_upper_security_lock`
- `all_physical_checks_confirmed`

### Done when

- Door-and-lock rules are configured.
- Every required door/security point is physically checked.
- Every item meets its configured rule.
- The upper security lock is separately confirmed.
- No credential is recorded.

### Deviation and blocking rules

- Door-and-lock rules unresolved — publication blocker.
- Door/lock cannot secure.
- Physical verification fails.
- Required key unavailable.

### Reference guidance

- `closing-door-check`.
- `cornerbar-upper-security-lock`.

### Dependencies and relations

- Requires C41. C43 verifies system/access state after physical checks.


## C43 — Verify Salto and clear all unauthorized manual overrides

**Stable key:** `closing.c43.verify-salto-clear-overrides`  
**Type:** `verification`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `control_result`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** After the physical door check and before alarm/exit.  
**Location:** Salto control and approved access-status view.

### Employee instruction

Verify the approved Closing access state in Salto. Identify manual overrides and clear every override that is not explicitly authorized for the current operational plan.

Record only status and authorized reason. Never record credentials, PINs, codes or sensitive access data.

### Structured task items

- `salto_status_checked`
- `manual_overrides_reviewed`
- `unauthorized_overrides_cleared`
- `authorized_overrides_have_owner_reason_expiry`
- `door_status_consistent_with_c42`
- `no_credentials_recorded`

### Done when

- Salto/access state is checked.
- No unauthorized manual override remains.
- Authorized exceptions are explicit, owned and time-bounded.
- System status is consistent with the physical door check.

### Deviation and blocking rules

- Salto unavailable.
- Override cannot be cleared.
- Physical/system status mismatch.
- Authorized exception lacks owner/reason/expiry.

### Reference guidance

- `salto-closing-status` — status guidance only, never credentials.

### Dependencies and relations

- Requires C42.


## C44 — Write and submit the final handover

**Stable key:** `closing.c44.write-submit-final-handover`  
**Type:** `handover`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `none`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `none`  
**Repeat policy:** `once_per_run`  
**Timing:** After operational issues, transfers and final delivery status are known; before C45.  
**Location:** Final Closing handover.

### Employee instruction

Create or refresh the final Closing handover. Generated items from open/temporarily accepted deviations and active transfers must remain. Add concise manual information needed by the next manager/Opening team.

Submit the handover when complete. Do not hide an issue by omitting it.

### Structured task items

- `low_stock_and_missing_products`
- `equipment_and_maintenance`
- `bookings_events_and_room_follow_up`
- `security_and_access`
- `financial_discrepancies`
- `open_responsibilities`
- `active_or_completed_transfers`
- `manager_overrides_and_follow_up`
- `manual_summary`

### Done when

- Generated items are current.
- All open critical/important conditions are represented.
- Manual summary is concise and operationally useful.
- Handover is submitted and immutable.

### Deviation and blocking rules

- Open issue is missing from the handover.
- Required target/recipient unavailable.
- Handover cannot be submitted.
- Sensitive credentials or payment data appear in text.

### Reference guidance

- No image is required.

### Dependencies and relations

- C45 requires the submitted final handover.


## C45 — Complete the Closing Responsible final verification

**Stable key:** `closing.c45.closing-responsible-final-verification`  
**Type:** `verification`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `none`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `closing_responsible`  
**Repeat policy:** `once_per_run`  
**Timing:** After all required Closing work and C44, immediately before C46.  
**Location:** Whole Closing run; physical recheck of critical delivery/security scopes.

### Employee instruction

The active Closing Responsible performs the final server-generated run verification. Review the complete required task list and physically recheck the critical delivery/security items. The client cannot omit tasks.

A passed verification snapshots the current run/task revisions. Any material later change makes it stale.

### Structured task items

- `final_fridge_deliveries_verified`
- `self_service_overnight_verified`
- `coffee_canisters_accounted_for`
- `serviceware_accountability_verified`
- `coffee_machine_and_dishwashers_verified`
- `bar_equipment_and_waste_verified`
- `pos_settlement_verified`
- `till_and_keys_secured_verified`
- `assets_charging_verified`
- `music_screen_lighting_verified`
- `final_sweep_verified`
- `doors_and_upper_security_lock_verified`
- `salto_status_verified`
- `handover_submitted_verified`
- `event_transfers_and_delivery_evidence_verified`

### Done when

- Verifier holds the active Closing Responsible role.
- Server-required tasks/revisions are complete and current.
- Physical checks are explicitly confirmed.
- Result is passed.
- No later material change has invalidated the verification.

### Deviation and blocking rules

- Required task/item remains incomplete.
- Physical verification fails.
- Verification actor lacks the role.
- Task/run revision is stale.
- Failed verification creates a deviation and returns the run to work.

### Reference guidance

- Use the task-specific references during physical verification.

### Dependencies and relations

- C46 requires a current passed C45 run verification.


## C46 — Set the alarm, exit and finish Closing

**Stable key:** `closing.c46.set-alarm-exit-finish`  
**Type:** `gate`  
**Criticality:** `critical`  
**Mandatory:** `true`  
**Initial assessment policy:** `none`  
**Completion policy:** `standard_required`  
**Not-applicable policy:** `forbidden`  
**Verification policy:** `self_recheck`  
**Repeat policy:** `once_per_run`  
**Timing:** Final action after C45. Completion after midnight keeps the locked operational date.  
**Location:** Final exit/security sequence.

### Employee instruction

Perform the approved final exit sequence. Confirm the venue is clear, required doors/access states are verified, keys/till/security responsibilities are complete, set the alarm through the approved procedure, exit and physically verify the final required door.

Never record the alarm code. The run is not finished until the server accepts the final gate and all completion/delivery checks.

### Structured task items

- `current_c45_verification_passed`
- `venue_clear_for_ordinary_closing_scope`
- `required_keys_and_till_secured`
- `doors_and_salto_current`
- `alarm_set_through_approved_procedure`
- `final_exit_completed`
- `final_door_physically_verified`
- `no_alarm_or_safe_code_recorded`
- `server_finish_confirmed`

### Done when

- C45 is current and passed.
- All finish blockers are clear.
- Alarm is physically set through the approved procedure.
- Final exit/door verification is complete.
- Server confirms the run finish and generates any required delivery record.
- No credential is stored in evidence.

### Deviation and blocking rules

- Alarm cannot be set.
- Person/active area remains without valid transfer.
- Door/access state not secure.
- C45 is stale or failed.
- Server finish/delivery validation fails.

### Reference guidance

- No image may expose the alarm code. Use `closing-door-check` and `salto-closing-status` only for non-secret status guidance.

### Dependencies and relations

- Final critical gate. Requires C45 and the full server completion validation.


# Closing dependencies and relationships

## Within Closing

- C05 is continuous through ordinary service and is system-completed by C15 when no blocking deviation remains.
- C08, C09 and C10 are pre-restocks only. C28, C29 and C30 require fresh final assessments.
- C11 is the first opened-bottle check. C31 is a fresh final check.
- C12 prepares Too Good To Go/SVINN; C16 finalizes only after the last sale.
- C03 is a preliminary serviceware sweep; C27 is the strict final accountability.
- C15 gates procedures that require actual service end.
- C34 must be handled before C35.
- C35 must be handled before C36.
- C41 precedes C42.
- C42 precedes C43.
- C44 must be submitted before C45.
- C45 must be current and passed before C46.
- Accepted incomplete transfers place the run in `waiting_for_transfers`; they do not create final delivery.
- Event-active work uses explicit transfer evidence and never disappears through employee N/A.

## Complementary Opening/Closing lifecycle

- Opening O03 espresso machine on → Closing C18 clean/night state.
- Opening O04 Workbar dishwashers on → Closing C23 drain/clean/off.
- Opening O05 kitchen dishwashers on → Closing C24 kitchen/dishwasher close.
- Opening O17 register open/count → Closing C34/C35/C36 close/settle/secure.
- Opening O19 music on → Closing C38 music off.
- Opening O20 screen/slides on → Closing C39 screen off.
- Opening O21 Café lighting → Closing C40 closed lighting.
- Opening O22 seasonal candles → conditional candle item in C22.
- Opening Coffee Canister service tasks → Closing C17 full recovery/accountability.

## Delivery comparisons to the next Opening

1. C28 → O13  
   `deliveryKey: workbar-food-nonalcoholic-fridge`  
   `comparisonMode: ready_on_arrival`  
   `scopePolicy: same_scope`

2. C29 → O09  
   `deliveryKey: workbar-milk-fridge`  
   `comparisonMode: ready_on_arrival`  
   `scopePolicy: same_scope`

3. C32 → O14  
   `deliveryKey: self-service-overnight-standard`  
   `comparisonMode: ready_on_arrival`  
   `scopePolicy: same_scope`

4. C27 coffee-cup evidence → O15 coffee-cup item  
   `deliveryKey: coffee-cups-full-target`

5. C27 wine-glass evidence → O15 wine-glass item  
   `deliveryKey: wine-glasses-full-target`

6. Relevant C22/C04 room final evidence → O16 room items where target identity is unambiguous.

7. C13 cleaning-station final evidence → O07 when comparable.

Previous delivery is context only. It never auto-completes an Opening task.

# Unresolved Closing configuration — publication blockers

1. `coffee-cups-full-target`
2. `wine-glasses-full-target`
3. `coffee-canister-total-inventory-target`
4. `serviceware-recovery-route` through relevant office floors
5. `door-and-lock-rules`
6. `fridge-closing-rules`
7. Six tea-slot names where the self-service standards require them
8. Any authoritative inventory location mapping that cannot be resolved unambiguously

No zero, empty value, guessed rule, fake office-floor location or “TBD” may satisfy these blockers.

# Closing count

| Section | Tasks | Count |
|---|---|---:|
| Closing 15:00–18:00 | C01–C14 | 14 |
| Closing 18:00–19:00 | C15–C46 | 32 |
| **Total** | **C01–C46** | **46** |

# Canonical implementation note for Codex

Treat this document as the authoritative re-locked Closing Content Spec for Phase 10L.

- Preserve all C-IDs and titles exactly.
- Install as one editable Closing draft.
- Do not publish.
- Do not create runs, bundles or delivery records.
- Do not change mode or release stage.
- Do not invent unresolved targets, routes or security rules.
- Never include alarm, safe or Salto credentials.
- Do not create room 005.
- Do not create a third Double Shift template.
- Any semantic difference between the installed Closing draft and this document is a content-integrity failure.

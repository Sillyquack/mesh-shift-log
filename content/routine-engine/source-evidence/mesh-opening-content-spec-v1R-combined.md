# Mesh Shift Log — Opening Content Spec v1.0R

**Status:** Reconstructed and re-locked for Phase 10L  
**Scope:** Opening only — O01–O37  
**Operational timezone:** `Europe/Oslo`  
**Operational date:** Server-derived and fixed for the run  
**Employee-facing language:** English

> This specification is a consolidated re-locking of the confirmed Opening decisions in the project. The original three assistant messages are no longer retrievable word-for-word. This document therefore becomes the authoritative Opening content source for Phase 10L once supplied to Codex. It does not invent unresolved target quantities, tea names, office-floor recovery points, door rules, or fridge-closing rules.

## Global rules for all three Opening blocks

1. There is one authoritative Opening run per organization, operational date, routine key and scope. Several employees participate in the same run.
2. Yesterday’s checkmarks are never reused. A previous Closing may be shown as evidence, but the Opening task must record a new physical assessment.
3. For tasks with `ready_on_arrival`, the first immutable choice is:
   - `Already at standard`
   - `Correction required`
4. When correction is required, the task is not complete until the standard is physically restored. The original finding remains visible for manager follow-up.
5. Missing stock, serviceware, equipment or access must never be disguised as completion. Use a deviation with a short reason.
6. `Not applicable` is forbidden unless the task explicitly says `system_only` or `allowed_with_reason`.
7. A manager override never means `standard met`. It remains visibly separate.
8. Employees see who is working on a task, who completed it and when.
9. Timed checkpoints use server time. The phone or browser clock is never authoritative.
10. Timed completion and timed N/A require an online server confirmation.
11. Reference images are hidden by default and open inline through `Show how it should look`.
12. Missing images show `Reference image coming` and never block the task.
13. Project rooms are exactly `001`, `002`, `003`, `004`, `006` and `Boardroom`. Room `005` must never be generated.
14. Use the term **Coffee Canisters** everywhere.
15. Baked goods are required every operating day.
16. Workbar milk-fridge standard is exactly:
    - `2 regular milk`
    - `2 Oatly`
17. Lunch coffee readiness is exactly:
    - `1 Coffee Canister in the members lounge`
    - `3 ready Coffee Canisters in the kitchen reserve`
    - `4 ready in total`
18. Coffee cups and wine glasses must reach their configured targets. If they are short, employees must search the approved recovery route, including relevant office floors once configured. “Could not find them” is not a completed status.
19. The following remain deliberately unresolved and must block publication where referenced:
    - Coffee cups full target
    - Coffee cups service-ready target
    - Wine glasses full target
    - Wine glasses service-ready target
    - Total Coffee Canister inventory target
    - Names of the six loose-leaf tea slots
    - Exact serviceware recovery route through relevant office floors
20. Deviations raised during Opening carry forward until resolved or formally transferred.

# Block 1 — Opening 07:00–08:00

## O01 — Review today’s bookings and events

    **Stable key:** `opening.o01.review-bookings-events`  
    **Type:** `control`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `control_result`  
    **Completion policy:** `control_allows_deviation`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** Start immediately at the beginning of the Opening run; complete before other setup decisions depend on it.  
    **Location:** Calendar, booking sources and Event Operations context.

    ### Employee instruction

    Review all bookings, room reservations and events for the operational date. Identify which zones and rooms are in use, expected guest arrival times, expected end times, furniture or access constraints and any event activity that changes normal Opening.

    ### Structured task items

    - `bookings_checked` — all current bookings reviewed.
- `events_checked` — all current events reviewed.
- `zones_affected` — Workbar, Atrium, Cornerbar or other authorized zone impact recorded.
- `room_use_checked` — project-room and Boardroom use recorded.
- `operational_constraints` — access, setup or timing constraints recorded.

    ### Done when

    - All available booking and event sources have been checked.
- Every affected room or zone is identified.
- Known constraints have an owner or a follow-up task.
- `No bookings or events` is a valid control result only after the sources are physically checked.

    ### Deviation and blocking rules

    - Calendar or Event Operations unavailable.
- Conflicting booking information.
- Unknown room or zone use.
- Event timing or responsibility unclear.
- An unresolved issue remains visible and is not converted to a normal completion.

    ### Reference guidance

    - No image is required. A short guide may identify the authoritative booking sources.

## O02 — Review today’s meeting-room coffee orders

    **Stable key:** `opening.o02.review-meeting-room-coffee-orders`  
    **Type:** `control`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `control_result`  
    **Completion policy:** `control_allows_deviation`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** Immediately after O01 and before the first Coffee Canister brewing plan is finalized.  
    **Location:** Booking and meeting-room coffee-order sources.

    ### Employee instruction

    Review all meeting-room coffee orders for rooms 001, 002, 003, 004, 006 and the Boardroom. Confirm room, requested service time, requested amount and any change since the booking was created.

    ### Structured task items

    - `orders_checked` — all order sources checked.
- `room` — exact room.
- `service_time` — expected delivery time.
- `quantity_or_service_need` — order demand recorded without inventing an amount.
- `change_or_uncertainty` — change, cancellation or unclear order recorded.

    ### Done when

    - Every current coffee order is accounted for.
- No order is assigned to room 005.
- The brewing and delivery plan can be understood by another employee.
- `No coffee orders` is recorded only after the source is checked.

    ### Deviation and blocking rules

    - Order details are unclear or contradictory.
- Required delivery time cannot be met.
- Available Coffee Canisters or brewing capacity are insufficient.
- Room or booking cannot be matched.

    ### Reference guidance

    - No image is required.

## O03 — Turn on the espresso machine

    **Stable key:** `opening.o03.turn-on-espresso-machine`  
    **Type:** `action`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `none`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** Early enough for the machine to reach normal operating state before guest service.  
    **Location:** Workbar coffee machine.

    ### Employee instruction

    Turn on the espresso machine using the approved machine procedure. Observe the startup and leave it in the correct service-ready state.

    ### Structured task items

    - `power_on` — machine is on.
- `startup_complete` — normal startup completes.
- `error_state` — no unresolved error or warning.
- `service_ready` — machine reaches the approved operating state.

    ### Done when

    - The machine is powered on.
- Startup completes without an unresolved error.
- The machine is physically ready for service.

    ### Deviation and blocking rules

    - Machine does not start.
- Error message, leak, missing part or abnormal sound.
- Machine cannot reach service-ready state.
- Create a technical deviation and do not mark the task complete.

    ### Reference guidance

    - Optional inline guide for the approved start state; placeholder is allowed.

## O04 — Turn on the Workbar dishwashers

    **Stable key:** `opening.o04.turn-on-workbar-dishwashers`  
    **Type:** `procedure`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `none`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** Early Opening; before the first serviceware wash is needed.  
    **Location:** Workbar dishwasher station.

    ### Employee instruction

    Prepare and start each Workbar dishwasher according to the approved machine procedure. Confirm that each required machine is correctly assembled, on and operating normally.

    ### Structured task items

    - `machine_accounted_for` — each required Workbar dishwasher checked.
- `setup_complete` — required filters, parts and normal setup are in place.
- `power_on` — machine is on.
- `normal_state` — no unresolved fault or leak.

    ### Done when

    - Every required Workbar dishwasher is started.
- Each machine shows normal operating status.
- No required part is missing.

    ### Deviation and blocking rules

    - Machine, filter or required part missing.
- Leak, drainage problem or fault.
- Machine cannot be started or made ready.
- Blocked task and technical deviation are required.

    ### Reference guidance

    - Optional reference for the correct ready state; placeholder is allowed.

## O05 — Turn on the kitchen dishwashers

    **Stable key:** `opening.o05.turn-on-kitchen-dishwashers`  
    **Type:** `procedure`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `none`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** Early Opening; before kitchen or serviceware demand.  
    **Location:** Kitchen dishwasher station.

    ### Employee instruction

    Prepare and start each required kitchen dishwasher using the approved machine procedure. Confirm normal operating status.

    ### Structured task items

    - `machine_accounted_for` — each required kitchen dishwasher checked.
- `setup_complete` — required parts and normal setup are in place.
- `power_on` — machine is on.
- `normal_state` — no unresolved fault or leak.

    ### Done when

    - Every required kitchen dishwasher is started.
- Each machine is correctly assembled and operating normally.

    ### Deviation and blocking rules

    - Machine or part missing.
- Leak, drainage problem or fault.
- Machine cannot be made ready.
- Create a technical deviation and keep the task blocked.

    ### Reference guidance

    - Optional reference for the correct ready state; placeholder is allowed.

## O06 — Brew four Coffee Canisters

    **Stable key:** `opening.o06.brew-four-coffee-canisters`  
    **Type:** `procedure`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `none`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** Early Opening; complete before O11 and before the first service demand.  
    **Location:** Kitchen coffee station.

    ### Employee instruction

    Brew four fresh Coffee Canisters. Use the approved coffee procedure and stage the completed canisters safely for service and reserve use.

    ### Structured task items

    - `coffee_canister_1_ready`
- `coffee_canister_2_ready`
- `coffee_canister_3_ready`
- `coffee_canister_4_ready`

    ### Done when

    - Four fresh Coffee Canisters are physically ready.
- Each canister has its required lid and parts.
- All four are accounted for and staged in approved positions.
- No canister is counted merely because it is expected to exist.

    ### Deviation and blocking rules

    - Fewer than four canisters can be brewed.
- A Coffee Canister, lid or part is missing or damaged.
- Coffee, filters or required equipment are unavailable.
- Record the shortfall and block completion.

    ### Reference guidance

    - `coffee-canister-lunch-reserve` — four-canister ready standard.
- `coffee-canister-rinsed-storage` is a Closing reference and is not used as Opening completion evidence.

## O07 — Set up the cleaning station

    **Stable key:** `opening.o07.set-up-cleaning-station`  
    **Type:** `control`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `ready_on_arrival`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** Complete before normal guest service begins.  
    **Location:** Workbar cleaning station.

    ### Employee instruction

    First record whether the cleaning station was ready on arrival. If correction is required, restore the station to the approved Opening standard before completing the task.

    ### Structured task items

    - `station_clear_and_clean`
- `approved_containers_ready`
- `clean_cloths_ready`
- `approved_cleaning_supplies_ready`
- `waste_handled`
- `walkway_clear`

    ### Done when

    - The immutable arrival assessment is recorded.
- The station is clean, orderly and ready for use.
- Required approved containers, cloths and supplies are present.
- The walkway and working area are clear.
- Any correction is completed and attributed.

    ### Deviation and blocking rules

    - Required cleaning supply or equipment is missing.
- Station cannot be safely used.
- Leak, damage or access issue.
- Do not use N/A; record a deviation.

    ### Reference guidance

    - `workbar-cleaning-station-opening` — actual approved Opening layout.
- Previous Closing delivery may be shown, but a new physical Opening assessment is required.

## O08 — Refill milk and oat milk in the coffee machine

    **Stable key:** `opening.o08.refill-coffee-machine-milk`  
    **Type:** `procedure`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `none`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** After machine startup and before the first milk-based drink is served.  
    **Location:** Workbar coffee machine milk system.

    ### Employee instruction

    Use fresh, in-date regular milk and Oatly to refill the coffee machine’s approved milk containers. Connect the system correctly and confirm normal status.

    ### Structured task items

    - `regular_milk_refilled`
- `oatly_refilled`
- `milk_within_date`
- `connections_secure`
- `milk_system_normal`

    ### Done when

    - Regular milk and Oatly are physically available to the machine.
- Only fresh, in-date products are used.
- Containers and connections are correctly positioned.
- No unresolved milk-system error remains.

    ### Deviation and blocking rules

    - Regular milk or Oatly unavailable.
- Expired or damaged product.
- Container, connection or milk-system fault.
- Create a stock or equipment deviation and block completion.

    ### Reference guidance

    - Use an approved machine-specific guide when available; image is optional.

## O09 — Verify and restore the Workbar milk fridge to standard

    **Stable key:** `opening.o09.verify-restore-workbar-milk-fridge`  
    **Type:** `measurement`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `ready_on_arrival`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** Complete before guest service and recheck at O29 and O35.  
    **Location:** Workbar Milk Fridge.

    ### Employee instruction

    Record whether the fridge was at standard on arrival. The required standard is exactly two regular milk and two Oatly. If correction is required, physically restock it before completion.

    ### Structured task items

    - `regular_milk_count` — target 2.
- `oatly_count` — target 2.
- `date_rotation` — oldest usable products first.
- `fridge_clean_and_operating`
- `door_closed`

    ### Done when

    - Arrival assessment is recorded.
- Two regular milk are physically in place.
- Two Oatly are physically in place.
- Products are in date and correctly rotated.
- The fridge is clean, closed and operating normally.

    ### Deviation and blocking rules

    - Target 2 + 2 cannot be reached.
- Reserve stock unavailable.
- Expired or damaged product.
- Fridge fault or door problem.
- Task remains blocked; manager override remains visibly separate.

    ### Reference guidance

    - `workbar-milk-fridge` — exact physical arrangement.
- Closing C29 delivery is displayed as previous evidence when available.

## O10 — Remove used cups and glasses from the members lounge

    **Stable key:** `opening.o10.clear-members-lounge-serviceware`  
    **Type:** `action`  
    **Criticality:** `normal`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `none`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** Before the members lounge coffee point is reset.  
    **Location:** Members lounge.

    ### Employee instruction

    Collect used or abandoned cups, glasses, plates and related serviceware from the members lounge. Send dirty items to washing and return clean items to their approved storage or service position.

    ### Structured task items

    - `used_cups_removed`
- `used_glasses_removed`
- `other_serviceware_removed`
- `items_sent_to_washing_or_storage`

    ### Done when

    - No abandoned serviceware remains.
- Dirty items are in the correct washing flow.
- Clean items are returned correctly.
- Active guest use is respected and any later collection is assigned.

    ### Deviation and blocking rules

    - Area inaccessible or unexpectedly occupied.
- Serviceware is damaged or missing.
- An item cannot be accounted for.
- Create a follow-up or deviation rather than marking it complete.

    ### Reference guidance

    - No image is required.

## O11 — Set out one fresh Coffee Canister in the members lounge

    **Stable key:** `opening.o11.set-out-members-lounge-coffee-canister`  
    **Type:** `action`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `none`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** After O06 and O10; before the members lounge coffee point opens.  
    **Location:** Members lounge coffee point.

    ### Employee instruction

    Place one fresh Coffee Canister in the approved members lounge position and confirm that it is service-ready.

    ### Structured task items

    - `fresh_canister_present`
- `lid_and_parts_secure`
- `correct_position`
- `coffee_point_accessible`

    ### Done when

    - One fresh Coffee Canister is physically present.
- It is correctly assembled and positioned.
- The coffee point is accessible and ready.

    ### Deviation and blocking rules

    - No fresh canister is available.
- Canister or lid is missing or damaged.
- Area cannot be safely set up.

    ### Reference guidance

    - `members-lounge-coffee-point` — approved coffee-point layout.

## O12 — Set out baked goods, fruit and snacks

    **Stable key:** `opening.o12.set-out-baked-goods-fruit-snacks`  
    **Type:** `procedure`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `none`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** Complete before normal morning guest service.  
    **Location:** Workbar self-service and approved food presentation area.

    ### Employee instruction

    Set out the day’s baked goods, fruit and snacks in the approved presentation. Baked goods are required every operating day.

    ### Structured task items

    - `baked_goods_present`
- `fruit_present`
- `snacks_present`
- `presentation_area_clean`
- `approved_serviceware_present`

    ### Done when

    - Baked goods are presented every operating day.
- Fruit and snacks are available to the approved standard.
- The presentation area is clean and orderly.
- Empty or damaged packaging is removed.

    ### Deviation and blocking rules

    - Baked-goods delivery missing or incomplete.
- Fruit or snacks unavailable.
- Product damaged or unsuitable for presentation.
- Record the exact missing category; do not use N/A.

    ### Reference guidance

    - `self-service-opening-standard` — full opening presentation.
- A dedicated baked-goods reference may be added later without changing the task.

## O13 — Verify and fully restock the Workbar food and non-alcoholic fridge, including eggs

    **Stable key:** `opening.o13.verify-restock-food-nonalcoholic-fridge`  
    **Type:** `measurement`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `ready_on_arrival`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** Complete before guest service; repeat at O29 and O35.  
    **Location:** Workbar Non-Alcoholic Fridge.

    ### Employee instruction

    Record whether the fridge was fully stocked on arrival. If not, select correction required and physically restore every active product to the authoritative standard. Eggs are explicitly included.

    ### Structured task items

    - `inventory_standard_items` — generated from the approved read-only inventory standard.
- `eggs_present_and_to_standard`
- `date_rotation`
- `correct_shelf_placement`
- `fronting_complete`
- `fridge_clean_and_operating`
- `door_closed`

    ### Done when

    - Arrival assessment is recorded.
- Every active standard line is physically at target.
- Eggs are included.
- Products are in date, rotated and placed correctly.
- The fridge is clean, fronted, closed and operating normally.

    ### Deviation and blocking rules

    - Any active product cannot be brought to target.
- Reserve stock missing.
- Expired or damaged product.
- Inventory source is inconsistent or required location cannot be resolved.
- Fridge fault.
- Never mark complete because stock exists elsewhere; it must be in the fridge.

    ### Reference guidance

    - `workbar-food-non-alcoholic-fridge` — actual shelf layout.
- Closing C28 delivery is displayed as previous evidence when available.

## O14 — Set up the self-service counter to standard

    **Stable key:** `opening.o14.set-up-self-service-counter`  
    **Type:** `control`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `ready_on_arrival`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** Complete before guest service; repeat at O29 and O35.  
    **Location:** Workbar self-service counter.

    ### Employee instruction

    Record whether the self-service counter was at Opening service standard on arrival. If correction is required, restore every required component before completion.

    ### Structured task items

    - `one_fresh_coffee_canister`
- `milk_jug_with_fresh_milk`
- `sugar`
- `sweetener`
- `stirrers`
- `six_named_loose_leaf_tea_slots` — unresolved names remain a publication blocker.
- `measuring_spoon_glass`
- `empty_tea_bags`
- `honey`
- `toothpicks`
- `napkins`
- `small_waste_container_ready`
- `takeaway_cups`
- `small_lids`
- `large_lids`
- `teaspoons_container`
- `knives_and_forks_basket`
- `two_complete_plate_sets`
- `baked_goods`
- `fruit`
- `snacks`
- `adjacent_food_nonalcoholic_products_and_eggs_confirmed`
- `surfaces_clean_and_orderly`

    ### Done when

    - Arrival assessment is recorded.
- Every listed component is present and correctly placed.
- One fresh Coffee Canister and a milk jug with fresh milk are ready for service.
- All six tea positions are filled with manager-approved names once configured.
- Two complete plate sets are present.
- Surfaces are clean and the small-waste container is ready.

    ### Deviation and blocking rules

    - Any required component is missing.
- Tea-slot names are unresolved at publication time.
- Milk, coffee, serviceware or food presentation cannot be completed.
- Damaged container or unsafe presentation.
- Do not mark complete with a generic note.

    ### Reference guidance

    - `self-service-opening-standard` — full actual Mesh setup.
- Closing C32 overnight delivery is shown as previous evidence, but Opening must add fresh coffee, fresh milk and the day’s baked goods.

## O15 — Restore coffee cups and wine glasses to their full target counts

    **Stable key:** `opening.o15.restore-cups-wine-glasses-full-targets`  
    **Type:** `measurement`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `ready_on_arrival`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** Complete before opening; service-ready counts are rechecked at O29 and O35.  
    **Location:** Serviceware storage, washing areas and the approved recovery route.

    ### Employee instruction

    Physically count clean coffee cups and wine glasses against their configured full targets. If either is short, search all approved recovery points, including relevant office floors once the route is configured, wash the items and restore the full target.

    ### Structured task items

    - `coffee_cups_full_target` — unresolved numeric standard.
- `coffee_cups_clean_and_stored`
- `coffee_cups_in_washing`
- `coffee_cups_known_use`
- `coffee_cups_unlocated`
- `wine_glasses_full_target` — unresolved numeric standard.
- `wine_glasses_clean_and_stored`
- `wine_glasses_in_washing`
- `wine_glasses_known_use`
- `wine_glasses_unlocated`
- `recovery_route_checked` — exact office route unresolved.

    ### Done when

    - Arrival assessment is recorded separately for cups and glasses.
- Clean and stored coffee cups equal the configured full target.
- Clean and stored wine glasses equal the configured full target.
- `In washing = 0` and `Unlocated = 0` at final Opening completion.
- All required recovery points have been physically checked when a shortage existed.

    ### Deviation and blocking rules

    - Full target not configured — publication blocker.
- Recovery route not configured — publication blocker.
- Shortage remains after the full search.
- Broken, lost or damaged serviceware.
- “Could not find them” is blocked, not complete.

    ### Reference guidance

    - `coffee-cups-full-storage`.
- `wine-glasses-full-storage`.
- Closing C27 delivery is shown as previous evidence when available.

## O16 — Prepare project rooms 001, 002, 003, 004, 006 and the Boardroom

    **Stable key:** `opening.o16.prepare-project-rooms`  
    **Type:** `control`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `ready_on_arrival`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** Complete before the first relevant booking.  
    **Location:** Location set `opening-project-rooms`.

    ### Employee instruction

    Physically inspect each listed room. Record whether it was ready on arrival and correct anything that is not at the approved room standard.

    ### Structured task items

    - `room_001`
- `room_002`
- `room_003`
- `room_004`
- `room_006`
- `boardroom`

    ### Done when

    - Every listed room has an explicit status.
- Used cups, glasses, plates and waste are removed.
- Required cups, glasses and meeting supplies are restored.
- Tables and chairs match the approved standard or current booking plan.
- Visible equipment and screens are ready.
- Surfaces are orderly and the room is ready for use.
- Room 005 is absent.

    ### Deviation and blocking rules

    - Room unexpectedly occupied.
- Room cannot be accessed.
- Serviceware or equipment missing.
- Furniture or technical setup cannot be corrected.
- An active planned booking may create a scheduled follow-up, but the room must not silently disappear as N/A.

    ### Reference guidance

    - `project-room-standard` — approved standard per room type.
- Previous Closing room delivery may be shown; Opening still performs a new room-by-room assessment.

## O17 — Open the register and count the cash drawer

    **Stable key:** `opening.o17.open-register-count-cash`  
    **Type:** `procedure`  
    **Criticality:** `critical`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `none`  
    **Completion policy:** `control_allows_deviation`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `self_recheck`  
    **Repeat policy:** `once_per_run`  
    **Timing:** Before the first sale.  
    **Location:** Workbar register and approved cash-handling area.

    ### Employee instruction

    Count the cash drawer using the approved financial procedure, record the result, open the register and secure the working cash correctly.

    ### Structured task items

    - `cash_count_completed`
- `variance_result`
- `register_opened`
- `drawer_secured_for_service`
- `financial_follow_up`

    ### Done when

    - The physical cash count is completed.
- The register is open and ready.
- Any variance is recorded through the approved financial deviation/sign-off flow.
- Cash and keys are not left unsecured.

    ### Deviation and blocking rules

    - Cash variance.
- Register cannot be opened.
- Drawer, key or required equipment missing.
- System or payment failure.
- A completed control with variance is not presented as a clean pass.

    ### Reference guidance

    - No image may reveal safe, key or security details.

## O18 — Review all items marked sold out in POS

    **Stable key:** `opening.o18.review-pos-sold-out-items`  
    **Type:** `control`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `control_result`  
    **Completion policy:** `control_allows_deviation`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** Before normal sales; repeat the lunch-specific control at O36.  
    **Location:** POS and physical stock locations.

    ### Employee instruction

    Review every item currently marked sold out in POS. Compare the status to physical availability. Remove an incorrect sold-out flag when the product is actually available; keep legitimate sold-out items unavailable and record the reason.

    ### Structured task items

    - `sold_out_items_reviewed` — dynamic item per POS product.
- `physical_stock_confirmed`
- `pos_status_corrected_or_confirmed`
- `unavailable_product_reason`

    ### Done when

    - No product is incorrectly marked sold out.
- No unavailable product is falsely shown as available.
- Every retained sold-out status has a physical reason.

    ### Deviation and blocking rules

    - POS unavailable.
- Physical stock cannot be determined.
- Product mapping is unclear.
- Status cannot be corrected.
- Use a system/stock deviation rather than guessing.

    ### Reference guidance

    - No screenshot containing customer or payment information.

## O19 — Start music in all relevant zones

    **Stable key:** `opening.o19.start-music-relevant-zones`  
    **Type:** `action`  
    **Criticality:** `normal`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `none`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** Before guest service in each active zone.  
    **Location:** Location set `active-audio-zones` and approved audio controls.

    ### Employee instruction

    Start music in every zone that is open for normal service. Respect active events and do not change a zone that is under separate event control.

    ### Structured task items

    - `workbar_audio`
- `atrium_audio`
- `cornerbar_audio`

    ### Done when

    - Every active service zone has the approved audio status.
- Music is actually audible where required.
- No event-controlled zone is changed incorrectly.

    ### Deviation and blocking rules

    - Audio system unavailable.
- Zone cannot be controlled.
- Conflicting event responsibility.
- Unexpected sound or technical issue.

    ### Reference guidance

    - A control-surface guide may be added later; no image is required now.

## O20 — Verify that the Workbar screen is showing its automatic slides

    **Stable key:** `opening.o20.verify-workbar-screen-slides`  
    **Type:** `control`  
    **Criticality:** `normal`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `control_result`  
    **Completion policy:** `control_allows_deviation`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** Before normal guest service.  
    **Location:** Workbar screen.

    ### Employee instruction

    Physically verify that the Workbar screen is on, on the correct input and showing the automatic slide presentation.

    ### Structured task items

    - `screen_on`
- `correct_input`
- `automatic_slides_visible`
- `no_error_message`
- `control_equipment_returned`

    ### Done when

    - The automatic slides are visibly running.
- The screen shows no unresolved error or unintended input.
- Control equipment is returned to its approved position.

    ### Deviation and blocking rules

    - Screen will not turn on.
- Slides do not run.
- Wrong input or technical error.
- Do not attempt unauthorized content changes; record the issue.

    ### Reference guidance

    - A future reference may show the correct opening state. Training for changing slides is outside this task.

## O21 — Set the lights to Café mode

    **Stable key:** `opening.o21.set-lights-cafe-mode`  
    **Type:** `action`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `none`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** Before guests enter the relevant areas.  
    **Location:** Workbar and other applicable lighting-control zones.

    ### Employee instruction

    Set the relevant zones to the approved Café lighting preset. Confirm the visible result, not only the control-panel selection.

    ### Structured task items

    - `cafe_preset_selected`
- `public_areas_correctly_lit`
- `cleaning_lights_not_left_on`
- `event_zone_not_changed_incorrectly`

    ### Done when

    - The approved Café lighting state is visibly active.
- Public and service areas are correctly lit.
- No event-controlled or safety lighting is changed incorrectly.

    ### Deviation and blocking rules

    - Lighting control unavailable.
- Preset does not produce the correct result.
- Zone responsibility is unclear.
- Lighting fault.

    ### Reference guidance

    - `cafe-lighting-preset` — actual control and visible Café result; placeholder is allowed.

## O22 — Set out candles when the seasonal candle rule is active

    **Stable key:** `opening.o22.set-out-seasonal-candles`  
    **Type:** `conditional`  
    **Criticality:** `normal`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `none`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `system_only`  
    **Verification policy:** `none`  
    **Repeat policy:** `conditional`  
    **Timing:** Before guest service when the system condition is matched.  
    **Location:** Manager-approved candle positions.

    ### Employee instruction

    This task exists only when the snapshotted organization flag `seasonal_candles` is true. Place candles and holders in the approved positions and leave them in the approved service state.

    ### Structured task items

    - `approved_positions_complete`
- `holders_present_and_safe`
- `damaged_items_removed`

    ### Done when

    - The task is included only by the system condition.
- All approved candle positions are prepared.
- No damaged or unsafe candle holder remains.

    ### Deviation and blocking rules

    - Required candle or holder missing.
- Approved placement cannot be completed.
- Safety concern.
- Employees cannot choose N/A; false condition excludes the task.

    ### Reference guidance

    - `seasonal-candle-placement` — optional future reference.
- Closing C22 receives the conditional companion to remove/extinguish them after use.

## O23 — Complete the final opening readiness check

    **Stable key:** `opening.o23.final-opening-readiness-check`  
    **Type:** `checkpoint`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `none`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** Final Opening gate; target completion by 08:00.  
    **Location:** All Opening areas.

    ### Employee instruction

    Perform a final physical readiness check. This is not a summary click: verify that the venue can open safely and professionally at 08:00.

    ### Structured task items

    - `bookings_and_events_understood`
- `coffee_orders_understood`
- `espresso_machine_ready`
- `workbar_dishwashers_ready`
- `kitchen_dishwashers_ready`
- `four_coffee_canisters_ready`
- `cleaning_station_ready`
- `coffee_machine_milk_ready`
- `milk_fridge_2_plus_2`
- `members_lounge_ready`
- `baked_goods_fruit_snacks_ready`
- `food_nonalcoholic_fridge_ready`
- `self_service_ready`
- `cups_and_glasses_full`
- `project_rooms_ready`
- `register_pos_music_screen_lighting_ready`
- `seasonal_task_handled_when_included`
- `no_unresolved_opening_blocker`

    ### Done when

    - Every included required Opening task has been handled.
- All physical readiness items are checked at the final gate.
- Unresolved blockers prevent a normal pass.
- Known authorized deviations remain visible and owned.
- The venue is ready for 08:00.

    ### Deviation and blocking rules

    - Any critical setup is not ready.
- Unresolved stock, serviceware, machine, access, cash or safety blocker.
- An item is merely assumed from an earlier check.
- Do not use a manager override to display ordinary green readiness.

    ### Reference guidance

    - This checkpoint may link to the task-specific references but does not require a new generic image.

# Block 2 — Opening 08:00–10:00

## O24 — Recheck bookings and events for changes

    **Stable key:** `opening.o24.recheck-bookings-events`  
    **Type:** `control`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `control_result`  
    **Completion policy:** `control_allows_deviation`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** At the beginning of the 08:00–10:00 block and again when the server reports a relevant change.  
    **Location:** Calendar, bookings and Event Operations context.

    ### Employee instruction

    Recheck the current day for new, moved, cancelled or changed bookings and events since O01. Record only new or changed operational facts.

    ### Structured task items

    - `booking_changes_checked`
- `event_changes_checked`
- `room_changes`
- `zone_or_timing_changes`
- `new_owner_or_follow_up`

    ### Done when

    - All relevant changes since O01 are identified.
- Affected rooms, zones and employees are updated.
- No change is hidden in a free-text note only.

    ### Deviation and blocking rules

    - Sources unavailable.
- Conflicting or unclear changes.
- New work cannot be assigned or completed.

    ### Reference guidance

    - No image is required.

## O25 — Verify venue and furniture setup against the current booking plan

    **Stable key:** `opening.o25.verify-venue-furniture-setup`  
    **Type:** `control`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `control_result`  
    **Completion policy:** `control_allows_deviation`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** After O24 and before affected guests or events arrive.  
    **Location:** Workbar, Atrium, Cornerbar and other active booked areas.

    ### Employee instruction

    Compare the physical venue and furniture layout to the latest booking plan. Correct ordinary setup differences and record any event-controlled or blocked area.

    ### Structured task items

    - `workbar_layout`
- `atrium_layout`
- `cornerbar_layout_when_relevant`
- `walkways_and_access`
- `booking_specific_setup`

    ### Done when

    - Every relevant area matches the current plan.
- Tables and chairs are correctly placed.
- Walkways and access are clear.
- An event-controlled area has a named owner and is not falsely marked N/A.

    ### Deviation and blocking rules

    - Furniture or equipment missing.
- Area inaccessible or still in use.
- Booking plan conflicts with physical setup.
- Event responsibility unclear.

    ### Reference guidance

    - `workbar-standard-layout`.
- `atrium-standard-layout`.
- Zone-specific event layouts may be added as separate references.

## O26 — Clear and reset the members lounge coffee point

    **Stable key:** `opening.o26.reset-members-lounge-coffee-point`  
    **Type:** `control`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `ready_on_arrival`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** During the morning and before the 09:45 checkpoint.  
    **Location:** Members lounge coffee point.

    ### Employee instruction

    Clear used serviceware, wipe the point and restore it to service standard. Confirm the fresh Coffee Canister remains available or replace it.

    ### Structured task items

    - `used_serviceware_removed`
- `surface_clean`
- `fresh_canister_available`
- `approved_point_components_ready`
- `waste_handled`

    ### Done when

    - The point is clean and orderly.
- No abandoned serviceware remains.
- One fresh Coffee Canister is available.
- Required service components are in place.

    ### Deviation and blocking rules

    - Coffee Canister unavailable.
- Serviceware shortage.
- Area cannot be reset because of active use or access.
- Damage or cleanliness issue.

    ### Reference guidance

    - `members-lounge-coffee-point`.

## O27 — Maintain the Workbar guest-service zone until the 09:45 checkpoint

    **Stable key:** `opening.o27.maintain-guest-service-until-0945`  
    **Type:** `continuous`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `none`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `continuous`  
    **Timing:** System-started after the morning service zone becomes active; continues until O29 completes.  
    **Location:** Workbar guest-service zone.

    ### Employee instruction

    Continuously maintain the guest-facing Workbar area. Clear available tables, collect serviceware, handle spills, keep the self-service area orderly and monitor guest-facing stock without disrupting active guests.

    ### Structured task items

    - `available_tables_maintained`
- `serviceware_recovered`
- `spills_handled`
- `self_service_orderly`
- `guest_facing_stock_monitored`
- `walkways_clear`

    ### Done when

    - The task remains in progress through the service period.
- O29 completes successfully.
- No unresolved blocking deviation remains on the continuous task.
- The system records `system_completed`; an employee does not manually close it early.

    ### Deviation and blocking rules

    - Spill, equipment problem or unsafe condition.
- Serviceware or stock cannot be restored.
- Area remains blocked.
- A blocked continuous task is not auto-completed by O29.

    ### Reference guidance

    - No new image is required; use the relevant Workbar and self-service references when needed.

## O28 — Restore the lunch coffee reserve to four ready Coffee Canisters

    **Stable key:** `opening.o28.restore-lunch-coffee-reserve`  
    **Type:** `measurement`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `none`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** Complete before O29.  
    **Location:** Members lounge and Coffee Canister kitchen reserve.

    ### Employee instruction

    Make sure the lunch coffee reserve is physically restored to four ready Coffee Canisters: one at the members lounge coffee point and three in the kitchen reserve.

    ### Structured task items

    - `members_lounge_ready_count` — target 1.
- `kitchen_reserve_ready_count` — target 3.
- `total_ready_count` — target 4.
- `canisters_accounted_for_and_serviceable`

    ### Done when

    - One ready Coffee Canister is in the members lounge.
- Three ready Coffee Canisters are in the kitchen reserve.
- Four are ready in total.
- All four are physically accounted for.

    ### Deviation and blocking rules

    - Fewer than four ready canisters.
- Canister, lid or part missing or damaged.
- Insufficient coffee or brewing capacity.
- Do not count a canister still being washed or not service-ready.

    ### Reference guidance

    - `coffee-canister-lunch-reserve`.

## O29 — Complete the 09:45 full restock checkpoint

    **Stable key:** `opening.o29.full-restock-checkpoint-0945`  
    **Type:** `checkpoint`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `control_result`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_phase`  
    **Timing:** Visible 09:35; start permitted 09:40; target 09:45; overdue 09:55. Server time is authoritative.  
    **Location:** All guest-facing Workbar stock and service points.

    ### Employee instruction

    At the checkpoint, physically assess every listed category. For each item, record whether it was already at standard or required correction, then restore it before completing the checkpoint.

    ### Structured task items

    - `food_nonalcoholic_fridge_including_eggs`
- `milk_fridge_two_regular_two_oatly`
- `self_service_components`
- `baked_goods_fruit_snacks`
- `coffee_canisters_one_plus_three`
- `coffee_cups_service_ready_target` — unresolved numeric standard.
- `wine_glasses_service_ready_target` — unresolved numeric standard.
- `members_lounge_coffee_point`

    ### Done when

    - Every checkpoint category has an explicit first result.
- Every correction is physically completed and attributed.
- Food/non-alcoholic products, eggs, milk, coffee, tea, serviceware, fruit, snacks and baked goods are ready for the next period.
- One Coffee Canister is in the members lounge and three are in reserve.
- Configured service-ready cup and glass targets are met.
- O27 is system-completed only after this checkpoint succeeds.

    ### Deviation and blocking rules

    - Service-ready cup or glass targets are unresolved — publication blocker.
- Any category cannot be restored.
- Missing stock, serviceware, Coffee Canister or access.
- Do not link normal morning consumption to the previous Closing automatically; record the current finding accurately.

    ### Reference guidance

    - `workbar-food-non-alcoholic-fridge`.
- `workbar-milk-fridge`.
- `self-service-opening-standard`.
- `coffee-canister-lunch-reserve`.
- `coffee-cups-full-storage` and `wine-glasses-full-storage` may illustrate placement, while service-ready numeric targets remain separate standards.

# Block 3 — Opening 10:00–11:00

## O30 — Recheck lunch bookings, events and coffee orders

    **Stable key:** `opening.o30.recheck-lunch-demand`  
    **Type:** `control`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `control_result`  
    **Completion policy:** `control_allows_deviation`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** At the beginning of the 10:00–11:00 block and before final lunch setup decisions.  
    **Location:** Bookings, Event Operations and coffee-order sources.

    ### Employee instruction

    Perform the final pre-lunch review of bookings, event changes and coffee orders. Identify late changes that affect rooms, stock, coffee, furniture or staffing.

    ### Structured task items

    - `lunch_bookings_checked`
- `event_changes_checked`
- `coffee_orders_checked`
- `room_and_zone_impact`
- `late_change_owner`

    ### Done when

    - Current lunch demand is understood.
- Late changes are assigned.
- Coffee and room needs are reflected in the remaining Opening work.

    ### Deviation and blocking rules

    - Source unavailable.
- Late change cannot be fulfilled.
- Conflicting booking, room or coffee information.
- Responsibility unclear.

    ### Reference guidance

    - No image is required.

## O31 — Reset project rooms 001, 002, 003, 004, 006 and the Boardroom

    **Stable key:** `opening.o31.reset-project-rooms-before-lunch`  
    **Type:** `control`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `ready_on_arrival`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** After morning use and before the final lunch readiness gate.  
    **Location:** Location set `opening-project-rooms`.

    ### Employee instruction

    Inspect each room again after morning use. Remove serviceware and waste, restore the room standard and prepare it for the current booking plan.

    ### Structured task items

    - `room_001`
- `room_002`
- `room_003`
- `room_004`
- `room_006`
- `boardroom`

    ### Done when

    - Every listed room has a current status.
- Available rooms are reset to approved standard.
- Serviceware is removed and restored.
- Furniture and visible equipment match the next booking.
- Active planned use has a named final-reset owner.
- Room 005 is absent.

    ### Deviation and blocking rules

    - Unexpected room use.
- Room inaccessible.
- Missing serviceware, supplies, furniture or equipment.
- Room cannot be made ready before the booking.

    ### Reference guidance

    - `project-room-standard`.

## O32 — Complete the Workbar toilet readiness check

    **Stable key:** `opening.o32.workbar-toilet-readiness`  
    **Type:** `control`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `control_result`  
    **Completion policy:** `control_allows_deviation`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** Complete before lunch service.  
    **Location:** Workbar toilets.

    ### Employee instruction

    Physically inspect the Workbar toilets. Confirm cleanliness, required consumables, normal operation and absence of an unresolved guest or maintenance issue.

    ### Structured task items

    - `area_physically_checked`
- `cleanliness_ready`
- `required_consumables_ready`
- `fixtures_operating_normally`
- `no_guest_or_access_issue`

    ### Done when

    - The toilets have been physically visited.
- They are clean, stocked and operating normally.
- Any issue is corrected or assigned with a visible deviation.

    ### Deviation and blocking rules

    - Cleaning required but cannot be completed.
- Consumables missing.
- Fixture, leak, blockage or maintenance issue.
- Unexpected person/access condition.

    ### Reference guidance

    - A toilet standard reference may be added later if it materially reduces mistakes.

## O33 — Maintain the Workbar guest-service zone until the 10:45 checkpoint

    **Stable key:** `opening.o33.maintain-guest-service-until-1045`  
    **Type:** `continuous`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `none`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `continuous`  
    **Timing:** System-started after the 09:45 checkpoint; continues until O35 completes.  
    **Location:** Workbar guest-service zone.

    ### Employee instruction

    Continue maintaining the guest-facing Workbar area through the final pre-lunch period. Clear available tables, recover serviceware, handle spills, keep self-service orderly and monitor stock without disturbing active guests.

    ### Structured task items

    - `available_tables_maintained`
- `serviceware_recovered`
- `spills_handled`
- `self_service_orderly`
- `guest_facing_stock_monitored`
- `walkways_clear`

    ### Done when

    - The task remains active through the period.
- O35 completes successfully.
- No blocking deviation remains.
- The system records `system_completed`; the task cannot be manually closed early.

    ### Deviation and blocking rules

    - Unsafe or unclean condition.
- Stock/serviceware cannot be restored.
- Blocked area or equipment issue.
- A blocked continuous task is not auto-completed.

    ### Reference guidance

    - No new image is required.

## O34 — Restore four ready Coffee Canisters before the final lunch check

    **Stable key:** `opening.o34.restore-four-coffee-canisters-before-1045`  
    **Type:** `measurement`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `none`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** Complete before O35.  
    **Location:** Members lounge and Coffee Canister kitchen reserve.

    ### Employee instruction

    Restore the final lunch coffee position: one ready Coffee Canister in the members lounge and three ready in the kitchen reserve.

    ### Structured task items

    - `members_lounge_ready_count` — target 1.
- `kitchen_reserve_ready_count` — target 3.
- `total_ready_count` — target 4.
- `all_canisters_serviceable`

    ### Done when

    - One ready canister is in the members lounge.
- Three ready canisters are in reserve.
- Four are ready in total.
- All canisters and required parts are accounted for.

    ### Deviation and blocking rules

    - Fewer than four ready.
- Missing or damaged Coffee Canister/part.
- Insufficient brewing supplies or capacity.

    ### Reference guidance

    - `coffee-canister-lunch-reserve`.

## O35 — Complete the final 10:45 full restock checkpoint

    **Stable key:** `opening.o35.final-full-restock-checkpoint-1045`  
    **Type:** `checkpoint`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `control_result`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_phase`  
    **Timing:** Visible 10:35; start permitted 10:40; target 10:45; overdue 10:50; hard deadline 10:55. Server time is authoritative.  
    **Location:** All guest-facing Workbar stock and service points.

    ### Employee instruction

    Perform the final full physical restock before lunch. For each category, record whether it was already at standard or required correction, then restore it. The task cannot inherit O29 completion.

    ### Structured task items

    - `food_nonalcoholic_fridge_including_eggs`
- `milk_fridge_two_regular_two_oatly`
- `self_service_components`
- `baked_goods_fruit_snacks`
- `coffee_canisters_one_plus_three`
- `coffee_cups_service_ready_target` — unresolved numeric standard.
- `wine_glasses_service_ready_target` — unresolved numeric standard.
- `members_lounge_coffee_point`

    ### Done when

    - Every category has a new 10:45 assessment.
- Every correction is physically complete.
- All guest-facing lunch products are available.
- Food/non-alcoholic fridge including eggs is full.
- Milk fridge is 2 regular + 2 Oatly.
- Self-service, baked goods, fruit and snacks are ready.
- Four ready Coffee Canisters are in the 1 + 3 positions.
- Configured service-ready cup and glass targets are met.
- O33 is system-completed only after this checkpoint succeeds.

    ### Deviation and blocking rules

    - Service-ready targets unresolved — publication blocker.
- Any product, serviceware or Coffee Canister shortage.
- Hard deadline missed — nonblocking timing deviation is recorded, but corrective completion is still required.
- Do not mark complete with unresolved stock.

    ### Reference guidance

    - `workbar-food-non-alcoholic-fridge`.
- `workbar-milk-fridge`.
- `self-service-opening-standard`.
- `coffee-canister-lunch-reserve`.
- `coffee-cups-full-storage`.
- `wine-glasses-full-storage`.

## O36 — Verify lunch product availability in POS and Weorder

    **Stable key:** `opening.o36.verify-lunch-product-availability-pos-weorder`  
    **Type:** `control`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `control_result`  
    **Completion policy:** `control_allows_deviation`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** After O35 and before the 11:00 lunch-readiness gate.  
    **Location:** POS, Weorder and physical product locations.

    ### Employee instruction

    Compare every lunch-relevant product’s physical availability with POS and Weorder. Correct incorrect sold-out or available states so both systems match reality.

    ### Structured task items

    - `physical_lunch_products_checked`
- `pos_availability_matches`
- `weorder_availability_matches`
- `sold_out_items_correctly_disabled`
- `available_items_correctly_enabled`
- `system_mapping_issues_recorded`

    ### Done when

    - POS matches physical availability.
- Weorder matches physical availability.
- No unavailable lunch product is offered.
- No available product remains incorrectly sold out.
- Any unresolved system mapping is visible.

    ### Deviation and blocking rules

    - POS or Weorder unavailable.
- Physical availability cannot be determined.
- Product mapping mismatch.
- System status cannot be corrected.
- Use a system/stock deviation; do not guess.

    ### Reference guidance

    - No screenshot containing customer, payment or account data.

## O37 — Confirm lunch readiness for 11:00

    **Stable key:** `opening.o37.confirm-lunch-readiness-1100`  
    **Type:** `gate`  
    **Criticality:** `important`  
    **Mandatory:** `true`  
    **Initial assessment policy:** `none`  
    **Completion policy:** `standard_required`  
    **Not-applicable policy:** `forbidden`  
    **Verification policy:** `none`  
    **Repeat policy:** `once_per_run`  
    **Timing:** Final target 11:00. It cannot complete before the 10:45 checkpoint and all required dependencies.  
    **Location:** All lunch-relevant Workbar, room, toilet and service areas.

    ### Employee instruction

    Perform the final lunch readiness gate. Confirm the current booking plan, rooms, toilets, guest-service zone, coffee, stock, self-service and digital availability are ready for 11:00.

    ### Structured task items

    - `bookings_events_and_coffee_orders_final`
- `project_rooms_ready_or_owned`
- `workbar_toilets_ready`
- `guest_service_zone_maintained`
- `four_ready_coffee_canisters`
- `final_1045_restock_passed`
- `pos_and_weorder_aligned`
- `no_unresolved_critical_blocker`
- `known_deviations_have_owner`

    ### Done when

    - O30–O36 required results are current.
- The 10:45 checkpoint is completed.
- Rooms and toilets are ready.
- Coffee, milk, tea, water, snacks, baked goods, serviceware and lunch products are available.
- POS and Weorder match physical availability.
- No unresolved critical blocker remains.
- The venue is ready for lunch at 11:00.

    ### Deviation and blocking rules

    - Any required dependency is incomplete.
- Critical stock, serviceware, room, toilet, equipment or system blocker.
- Checkpoint result is stale or assumed.
- An override remains visible and cannot be presented as ordinary green readiness.

    ### Reference guidance

    - This is an aggregate gate; use the task-specific references rather than a generic image.

# Opening dependencies and cross-run relations

## Within Opening

- O23 requires all included mandatory tasks O01–O22 to be handled.
- O27 is a continuous predecessor and is system-completed when O29 succeeds through `complete_predecessor_on_successor`.
- O29 never inherits completion from earlier setup tasks; it records a new 09:45 assessment.
- O33 is a continuous predecessor and is system-completed when O35 succeeds.
- O35 never inherits O29 completion; it records a new 10:45 assessment.
- O37 requires current results from O30–O36 and cannot complete before O35.
- Timed tasks use the server timing engine.
- Open deviations carry forward until resolved or formally transferred.

## Closing delivery shown to Opening

- Closing C28 → Opening O13: `delivery_comparison`, `ready_on_arrival`, same scope.
- Closing C29 → Opening O09: `delivery_comparison`, `ready_on_arrival`, same scope.
- Closing C32 → Opening O14: `delivery_comparison`, `ready_on_arrival`, same scope.
- Closing C27 coffee-cup evidence → Opening O15 coffee-cup item.
- Closing C27 wine-glass evidence → Opening O15 wine-glass item.
- Relevant project-room final delivery → Opening O16 room items.
- Relevant cleaning-station final delivery → Opening O07 when the evidence is comparable.
- Previous delivery is context only. It never auto-completes the Opening assessment.

## Complementary Opening/Closing lifecycle

- O03 espresso machine on → C18 clean and set to night state.
- O04 Workbar dishwashers on → C23 drain, clean and turn off.
- O05 kitchen dishwashers on → C24 drain, clean and turn off.
- O19 music on → C38 music off.
- O20 screen on/slides → C39 screen off.
- O21 Café lighting → C40 closed lighting preset.
- O17 register open/count → C34/C35/C36 close, settle and secure.
- O06/O11/O28/O34 Coffee Canisters ready for service → C17 recover, clean and account for all.
- O22 seasonal candles → conditional C22 removal/extinguishing companion.

# Unresolved Opening configuration — must remain blockers

1. `coffee-cups-full-target`
2. `coffee-cups-service-ready-target`
3. `wine-glasses-full-target`
4. `wine-glasses-service-ready-target`
5. `coffee-canister-total-inventory-target`
6. Six names for `self-service-tea-slot-names`
7. Exact `serviceware-recovery-route` through the relevant office floors

No numeric zero, empty string, “TBD” value or guessed office-floor location may satisfy these blockers.

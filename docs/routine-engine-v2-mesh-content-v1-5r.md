# Mesh Routine Content Pack 1.5R

> Generated from `content/routine-engine/mesh-routine-content-v1-5r.json`. Do not edit by hand.

- Pack: `mesh-routine-content@1.5R`
- Schema: `1.0`
- SHA-256: `710c9412eabc8f2e9c5a6488499ac4654cd7c94b62138eaed9563ab5f0203c9c`
- Opening: 37 tasks in 3 sections
- Closing: 46 tasks in 2 sections
- Double Shift: 4 system steps; no third template
- Locations / sets / standards / references: 48 / 12 / 15 / 42
- Unresolved publication/readiness blockers: 0

The task audit below records the exact locked-source plus amendment provenance hash for all 83 O/C tasks. Each canonical task also retains its full instruction, structured-item text, done criteria, deviation/blocking rules and reference guidance in the JSON manifest.

## Source and amendment provenance

- `opening` — `mesh-opening-content-spec-v1R-combined.md`: `ea00e80bde6c17ea1d3f1095949363d79d606dcee16f05f742426c1c5248e079`
- `closing` — `mesh-closing-content-spec-v1R-combined.md`: `27698f86716a141268546c623609f8b956213e53f20d00c03935cad01bd9244c`
- `double_shift` — `mesh-double-shift-content-spec-v1R.md`: `f4fce4d5a3dcafecd7dfca2a5bf780f7c3652634da2cb0f068daa5d4f506a0eb`
- `operational_standards_amendment` — `routine-engine-v2-mesh-operational-standards-amendment-2026-08-07.md`: `8ebedb39be888dfa118a429fa2046ba2b7b5dc49c868d9d5b811f2aa89b45351` (content-before-generated-pack-metadata)
- `production_readiness_amendment` — `routine-engine-v2-production-readiness-amendment-2026-08-09.md`: `d0280ca6e780f8f6876ad8747f0ee80693ebb1aa0a15761b63962376f8e54224` (content-before-generated-pack-metadata)
- `serviceware_route_amendment` — `routine-engine-v2-serviceware-route-amendment-2026-08-09.md`: `7ee5032edc7518e80aec18e5f4ce50a3c7a12e48aa9e560727c87d672c3c72f1` (content-before-generated-pack-metadata)
- `runtime_contract_alignment_amendment` — `routine-engine-v2-runtime-contract-alignment-amendment-2026-08-09.md`: `56cc1ac9b6fc1cdc89586f8539e185dfef6e6a5d54d483bbdffcbb1d7ff4c2af` (content-before-generated-pack-metadata)
- `fridge_standards_amendment` — `routine-engine-v2-fridge-standards-amendment-2026-08-15.md`: `2a57f578128b6a6b696bf4f93d721fd6c56837ae413c9599a2845885c6c7a834` (content-before-generated-pack-metadata)

## Opening

| ID | Title | Section | Type | Criticality | Required | Initial | Completion | N/A | Verification | Repeat | Items | Dependencies | References | Relations | Unresolved blockers | Location/set | Server timing | Provenance SHA-256 |
|---|---|---|---|---|---|---|---|---|---|---|---:|---:|---:|---:|---|---|---|---|
| O01 | Review today’s bookings and events | opening-07-08 | control | important | yes | control_result | control_allows_deviation | forbidden | none | once_per_run | 5 | 0 | 0 | 1 | — | — | — | ea7c4cdd5b922e8b77b399df5912bd423b689253d4c12f92b971ef7167d6709d |
| O02 | Review today’s meeting-room coffee orders | opening-07-08 | control | important | yes | control_result | control_allows_deviation | forbidden | none | once_per_run | 5 | 0 | 0 | 0 | — | — | — | e31108d7b873eded6f5c4a50756d8f0668df12cfea23f96d111bcba90fcfab60 |
| O03 | Turn on the espresso machine | opening-07-08 | action | important | yes | none | standard_required | forbidden | none | once_per_run | 4 | 0 | 0 | 1 | — | coffee-machine | — | 28248b8ff2aefcc83be16b6bc859ab53425d6f60ada77acecb6f3130aa08c9fd |
| O04 | Turn on the Workbar dishwashers | opening-07-08 | procedure | important | yes | none | standard_required | forbidden | none | once_per_run | 4 | 0 | 0 | 1 | — | workbar-dishwashers | — | e65dcbc0cfdca6a43b2f30e5b7bdd9ffac24452a0bb7a92d7ff4731137cda15e |
| O05 | Turn on the kitchen dishwashers | opening-07-08 | procedure | important | yes | none | standard_required | forbidden | none | once_per_run | 4 | 0 | 0 | 1 | — | kitchen-dishwashers | — | 971e1cd1b171e84c11c5d48e6bc0af8303af5bde5c61fa21b6e4c1192cbd5844 |
| O06 | Brew four Coffee Canisters | opening-07-08 | procedure | important | yes | none | standard_required | forbidden | none | once_per_run | 4 | 0 | 1 | 1 | — | — | — | 5634d3af6f89a18cbdfaa5ec7734c3d54fcd494d7bb8569452c8425314e3bff9 |
| O07 | Set up the cleaning station | opening-07-08 | control | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 6 | 0 | 1 | 1 | — | cleaning-station | — | dd35677bebdc962bf4e56a0fdfcd175dd843ad7540e511f0a7beab00a3d3f83e |
| O08 | Refill milk and oat milk in the coffee machine | opening-07-08 | procedure | important | yes | none | standard_required | forbidden | none | once_per_run | 5 | 0 | 0 | 0 | — | — | — | 01f71a76485b48fcba51d4e59fbc4003205d7e2f480ed638b7c0626a37ca320f |
| O09 | Verify and restore the Workbar milk fridge to standard | opening-07-08 | measurement | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 7 | 0 | 1 | 1 | — | workbar-milk-fridge | — | eee6c38531c27d753b70539cb7df086fcf190787edcf1f726dd9ba8afec92a55 |
| O10 | Remove used cups and glasses from the members lounge | opening-07-08 | action | normal | yes | none | standard_required | forbidden | none | once_per_run | 4 | 0 | 1 | 0 | — | members-lounge | — | 509a7de6e926dcbada2473fc70976c75ab504da8bb98af3003d1bb14e73a4e38 |
| O11 | Set out one fresh Coffee Canister in the members lounge | opening-07-08 | action | important | yes | none | standard_required | forbidden | none | once_per_run | 4 | 0 | 1 | 0 | — | members-lounge | — | ffba354bd376a782cf9bdeb5e1434fe6a7ddba10d435fbda950bb591f595ab8d |
| O12 | Set out baked goods, fruit and snacks | opening-07-08 | procedure | important | yes | none | standard_required | forbidden | none | once_per_run | 5 | 0 | 0 | 0 | — | — | — | 356ac244c5bb41a7c15d89db5d175c591fd3335efb0b8597fda8f2e4209a420c |
| O13 | Verify and restore the Workbar Non-Alco Fridge | opening-07-08 | measurement | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 10 | 0 | 3 | 1 | — | workbar-non-alcoholic-fridge | — | 087bf6fccc3dafc0212a02f49f32f7ba33a385f982b3133a60120f36c10a1cc8 |
| O14 | Set up the self-service counter to standard | opening-07-08 | control | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 23 | 0 | 1 | 1 | — | self-service-counter | — | 4da68db37e9429304c7194a2f709f9263f714654af5862f8a4f0a9d7426198a2 |
| O15 | Restore coffee cups and wine glasses to their full visual layouts | opening-07-08 | measurement | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 12 | 0 | 4 | 2 | — | serviceware-recovery-route | 10:45:00 / 10:45:00 | 21f4d7f4775269638c5fdefbc960507cda500e01f67b912ff32ebca46d8eceb2 |
| O16 | Prepare project rooms 001, 002, 003, 004, 006 and the Boardroom | opening-07-08 | control | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 6 | 0 | 1 | 2 | — | opening-project-rooms | — | f153edaa885dfae5fa822087acabc8d816cd9f3b13057ed5901775c491bc550d |
| O17 | Open the register and count the cash drawer | opening-07-08 | procedure | critical | yes | none | control_allows_deviation | forbidden | self_recheck | once_per_run | 5 | 0 | 0 | 1 | — | register | — | 327bf79283b86f027a8a5168b18a503607c1ec63ab56002112c514e0b965019e |
| O18 | Review all items marked sold out in POS | opening-07-08 | control | important | yes | control_result | control_allows_deviation | forbidden | none | once_per_run | 4 | 0 | 0 | 0 | — | — | — | 6100691f6f47e692027e4c04ad49a72059bb1e5b8cb7f2f47c652438012d2777 |
| O19 | Start music in all relevant zones | opening-07-08 | action | normal | yes | none | standard_required | forbidden | none | once_per_run | 3 | 0 | 0 | 1 | — | active-audio-zones | — | ab8c3855907e264c977f34f1eed20869aca2d010967189bc9027d6ec973a3ecc |
| O20 | Verify that the Workbar screen is showing its automatic slides | opening-07-08 | control | normal | yes | control_result | control_allows_deviation | forbidden | none | once_per_run | 5 | 0 | 0 | 1 | — | workbar-screen | — | 5ef88495b1da3643e34282ef84ef86f79aaf336b2c4b112d317c06b35c30f6f1 |
| O21 | Set the lights to Café mode | opening-07-08 | action | important | yes | none | standard_required | forbidden | none | once_per_run | 4 | 0 | 0 | 1 | — | — | — | ed7aee45776e3d4fe8df14ee02dd621b888663aa61868ed1d30bfa1304a1bef6 |
| O22 | Set out candles when the seasonal candle rule is active | opening-07-08 | action | normal | yes | none | standard_required | system_only | none | conditional | 3 | 0 | 0 | 1 | — | — | — | 93e82228d7cdc188a6bd288e13ef26f5d1ea4d7b6106f5fde685e27b56d0698a |
| O23 | Complete the final opening readiness check | opening-07-08 | checkpoint | important | yes | none | standard_required | forbidden | none | once_per_run | 18 | 0 | 2 | 0 | — | — | 08:00:00 | 19da26c01a88bec2e3bc5553f186f08adb6cd0a58471e4e4ed0d0512a3ef97af |
| O24 | Recheck bookings and events for changes | opening-08-10 | control | important | yes | control_result | control_allows_deviation | forbidden | none | once_per_run | 5 | 0 | 0 | 0 | — | — | — | 51327606338e2a4dd6df44d333af263216e06c2f970f8338dcc1699bc51f92a5 |
| O25 | Verify venue and furniture setup against the current booking plan | opening-08-10 | control | important | yes | control_result | control_allows_deviation | forbidden | none | once_per_run | 5 | 0 | 2 | 0 | — | — | — | c31b687466af635e388109ae2cbe5775be82cf92ef32fd02bfecc572e656b8c1 |
| O26 | Clear and reset the members lounge coffee point | opening-08-10 | control | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 5 | 0 | 1 | 0 | — | — | — | 4b4efb780e07047e9b55c6bcea1a3f3a38cd096c41486c06256c6e604480d123 |
| O27 | Maintain the Workbar guest-service zone until the 09:45 checkpoint | opening-08-10 | continuous | important | yes | none | standard_required | forbidden | none | continuous | 6 | 1 | 0 | 0 | — | — | — | 57bf0102a2c4dbf17685174df41485f73fc7172ef5bafff274ef4ee6e3447b91 |
| O28 | Restore the lunch coffee reserve to four ready Coffee Canisters | opening-08-10 | measurement | important | yes | none | standard_required | forbidden | none | once_per_run | 4 | 0 | 1 | 0 | — | — | — | f8ccfcdf6b7a8e735f18f48964253075742cddfad7bf5514311d826b7f7cece0 |
| O29 | Complete the 09:45 full restock checkpoint | opening-08-10 | checkpoint | important | yes | control_result | standard_required | forbidden | none | once_per_phase | 11 | 1 | 5 | 0 | — | — | 09:35:00 / 09:40:00 / 09:45:00 / 09:55:00 | 07b88be442147a11ab067dbe8fd68260da3ef6d20188e274e68748d2a3fada2f |
| O30 | Recheck lunch bookings, events and coffee orders | opening-10-11 | control | important | yes | control_result | control_allows_deviation | forbidden | none | once_per_run | 5 | 1 | 0 | 0 | — | — | — | d91a05c1a2db3416e60589dc6b9aad8899d37b6718de0339dac996de1fde05b7 |
| O31 | Reset project rooms 001, 002, 003, 004, 006 and the Boardroom | opening-10-11 | control | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 6 | 1 | 1 | 0 | — | opening-project-rooms | — | a65a3cdd2c3df974df63d09610cd92e675ba8f113ffe10c68031d306c40af39c |
| O32 | Complete the Workbar toilet readiness check | opening-10-11 | control | important | yes | control_result | control_allows_deviation | forbidden | none | once_per_run | 5 | 1 | 0 | 0 | — | workbar-public-toilets | — | 46dbd4e3004d0272a5d72480daf6e907bbbfbf6f19c5db127aeff11a90cc848b |
| O33 | Maintain the Workbar guest-service zone until the 10:45 checkpoint | opening-10-11 | continuous | important | yes | none | standard_required | forbidden | none | continuous | 6 | 2 | 0 | 0 | — | — | — | 0852723f6913d446155ec431f910d09dc76d79e2180e18aa188eef97bbb1a4aa |
| O34 | Restore four ready Coffee Canisters before the final lunch check | opening-10-11 | measurement | important | yes | none | standard_required | forbidden | none | once_per_run | 4 | 1 | 1 | 0 | — | — | — | 6cfe0254065a329dfab8709ab8830d07fbdeb04496fd09c4be2286f220f98903 |
| O35 | Complete the final 10:45 full restock checkpoint | opening-10-11 | checkpoint | important | yes | control_result | standard_required | forbidden | none | once_per_phase | 11 | 2 | 5 | 0 | — | — | 10:35:00 / 10:40:00 / 10:45:00 / 10:50:00 / 10:55:00 | 95f523f35cf63205fe82bb22151fc4f060651ec95102bf1a48355aea6d070e71 |
| O36 | Verify lunch product availability in POS and Weorder | opening-10-11 | control | important | yes | control_result | control_allows_deviation | forbidden | none | once_per_run | 6 | 1 | 0 | 0 | — | — | — | 5a589c078953ace614c9a9e8461602d4b9ddc7ef8ca7dce344016f1f93f3ef18 |
| O37 | Confirm lunch readiness for 11:00 | opening-10-11 | gate | important | yes | none | standard_required | forbidden | none | once_per_run | 11 | 7 | 0 | 0 | — | — | 11:00:00 | 1b7673ad7f435ab853c68809affb6b755764218dfec764ccf9cfddd18d723bc0 |

## Closing

| ID | Title | Section | Type | Criticality | Required | Initial | Completion | N/A | Verification | Repeat | Items | Dependencies | References | Relations | Unresolved blockers | Location/set | Server timing | Provenance SHA-256 |
|---|---|---|---|---|---|---|---|---|---|---:|---:|---:|---:|---|---|---|---|
| C01 | Review remaining bookings, events and closing constraints | closing-15-18 | control | important | yes | control_result | control_allows_deviation | forbidden | none | once_per_run | 7 | 0 | 0 | 1 | — | — | — | dd8450401f2f5115eeeb774c101b22ebbd162abf6871cb031a2dae9579229041 |
| C02 | Confirm closing responsibilities | closing-15-18 | control | critical | yes | control_result | standard_required | forbidden | none | once_per_run | 7 | 0 | 0 | 0 | — | — | — | cfb4b882122b4b943dbe7f0750cb033d98a2be017ebcf225b61e6d88ea5ccbce |
| C03 | Complete the first serviceware recovery sweep | closing-15-18 | measurement | important | yes | control_result | standard_required | forbidden | none | once_per_run | 8 | 1 | 0 | 0 | — | serviceware-recovery-route | — | b6fe4bc8aa54f14e4406f613e56ae404071d94b6850adb321761b48e977d3e53 |
| C04 | Reset available project rooms and schedule the remaining resets | closing-15-18 | control | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 7 | 1 | 1 | 2 | — | closing-project-rooms | — | 3acdd0e4b60dd19330ca0e39a13e4d7e8b6c79f0bbd049112cffa4fb47c94b47 |
| C05 | Clear and clean available Workbar and Atrium tables | closing-15-18 | continuous | important | yes | none | standard_required | forbidden | none | continuous | 7 | 1 | 2 | 0 | — | — | — | 9cc659fad48d6ed44b3445de5261d9bf94f531508d1a5616111f14c91bcdd556 |
| C06 | Rinse empty Coffee Canisters and preserve service capacity | closing-15-18 | measurement | important | yes | control_result | standard_required | forbidden | none | once_per_run | 7 | 1 | 1 | 0 | — | — | — | 956a620c13b22f2c4277d40df8366563df8786ff81ef81b464b9963133ed8953 |
| C07 | Pre-restock the self-service counter to standard | closing-15-18 | control | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 9 | 1 | 1 | 0 | — | — | — | 5f0bc1c1868cab7e876dcf941b6c0cbacad9923791a56728c8f6f394350f2581 |
| C08 | Pre-restore the Workbar Non-Alco Fridge | closing-15-18 | measurement | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 7 | 1 | 3 | 0 | — | workbar-non-alcoholic-fridge | — | 9e41a8d56439ed69062e6604a13d66886358ba3357e3f9009e6541bf800a3014 |
| C09 | Pre-restock the Workbar milk fridge | closing-15-18 | measurement | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 7 | 1 | 1 | 0 | — | — | — | 97d5da36484c7c2353772506ea319fa04789eca0ddd229f7bdd167494ceef6e5 |
| C10 | Pre-restock all active beverage and bar fridges | closing-15-18 | measurement | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 8 | 1 | 5 | 0 | — | all-operational-fridges | — | 7cc430d65ac4625d023ef57507f574bf2bae005f85f94092bfcf3c30ba6f00b7 |
| C11 | Check and date every opened wine and prosecco bottle | closing-15-18 | control | important | yes | control_result | standard_required | forbidden | none | once_per_run | 6 | 1 | 1 | 0 | — | — | — | 4eee4baa33746a7b37e4f3cb1279f892cf4e3d97b4471a6b2ca258abacd9b92a |
| C12 | Prepare Too Good To Go and SVINN without ending sales early | closing-15-18 | procedure | important | yes | control_result | standard_required | forbidden | none | once_per_run | 6 | 1 | 0 | 0 | — | — | — | 0a75b72ed1ff01ec9a66ebe3ab4db5767a7b724c73c4f082c43ea2a33089a6ac |
| C13 | Clean and reset the cleaning station for final close | closing-15-18 | control | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 6 | 1 | 1 | 1 | — | cleaning-station | — | b097c91cafb4d63a73dc5568527ee79f3799a4ff33a26c70b05056086522c1b0 |
| C14 | Complete the 17:45 pre-close readiness checkpoint | closing-15-18 | checkpoint | critical | yes | control_result | standard_required | forbidden | none | once_per_phase | 14 | 10 | 2 | 0 | — | — | 17:35:00 / 17:35:00 / 17:45:00 / 17:55:00 | 65d3585650cb7470553e81b1a1735a970765164bb57f661952cf782bf1d519ec |
| C15 | Confirm final service end for each active zone | closing-15-18 | gate | critical | yes | control_result | standard_required | forbidden | none | once_per_run | 6 | 1 | 0 | 0 | — | active-service-zones | — | 0ba2b10818e9743bf1e5d67aa8a1c95b7f9805483e8b4f7c5ffcff7deeaaafbc |
| C16 | Finalize Too Good To Go and SVINN after the last sale | closing-18-19 | procedure | important | yes | none | standard_required | forbidden | none | once_per_run | 6 | 0 | 0 | 0 | — | — | — | 732d06a90d269d627a055d5b60e76f0a7fa8376c13c6b3372b3e5bac533a300a |
| C17 | Recover, clean and account for the four Workbar-assigned Coffee Canisters | closing-18-19 | measurement | critical | yes | control_result | standard_required | forbidden | none | once_per_run | 8 | 0 | 1 | 1 | — | — | — | 9eb4c9a3f8667c7a52f9c3b56ba56a30f5b23d054f0e0b47842b8c3fd2fda92d |
| C18 | Run and complete the coffee machine cleaning cycle | closing-18-19 | procedure | critical | yes | none | standard_required | forbidden | none | once_per_run | 7 | 0 | 1 | 1 | — | coffee-machine | — | ba0d3de34a4366092735e66e248d20fdffa7f2f5ecb3fb975632aaa969e086f1 |
| C19 | Complete the scheduled milk-system deep clean | closing-18-19 | action | critical | yes | none | standard_required | system_only | none | conditional | 7 | 0 | 1 | 0 | — | — | — | a3c2cb17182aeef81a7970744c4d86e073d4219055d381e681683cf0b69e4168 |
| C20 | Clean and return all bar equipment and beer-tap parts | closing-18-19 | procedure | important | yes | none | standard_required | forbidden | none | once_per_run | 9 | 0 | 6 | 0 | — | — | — | fb8175e5ceeb4e7e84f322c289f105df3f403f2ce2fd9a9bdcb89672c548787f |
| C21 | Clean the self-service surfaces and the Workbar bar area | closing-18-19 | procedure | important | yes | control_result | standard_required | forbidden | none | once_per_run | 6 | 0 | 0 | 0 | — | — | — | 670b211d546150fa418fe80a8b0ecc29149af1dae5d5dd4047b8e8d78a6d18ad |
| C22 | Complete the final Workbar and Atrium reset | closing-18-19 | control | critical | yes | ready_on_arrival | standard_required | forbidden | none | after_last_use | 7 | 0 | 2 | 1 | — | — | — | a7c6c9a036a868da9ed729dc96e099c6c88f6ca9491ba297068a3492001e2372 |
| C23 | Drain, clean and turn off the Workbar dishwashers | closing-18-19 | procedure | critical | yes | none | standard_required | forbidden | none | once_per_run | 7 | 0 | 1 | 1 | — | workbar-dishwashers | — | 4922aa28b2458f5a7df28c80d72aa0f58933a8b7e23dc91e0dac480e97ed2072 |
| C24 | Complete the kitchen close and shut down the kitchen dishwashers | closing-18-19 | procedure | critical | yes | none | standard_required | forbidden | none | once_per_run | 7 | 0 | 1 | 1 | — | kitchen-dishwashers | — | 91a831cc0c1ce886c3a498316787206191e7b72df5ee348e9d4acebf599aff01 |
| C25 | Return all dirty cloths and rags to cleaning storage | closing-18-19 | action | normal | yes | none | standard_required | forbidden | none | once_per_run | 7 | 0 | 0 | 0 | — | — | — | 14141638a339b02b0cdac973591f03166403017d9e455c132dc2f77d50efdbf4 |
| C26 | Remove all waste, PANT, glass and cardboard and rinse the bins | closing-18-19 | procedure | important | yes | none | standard_required | forbidden | none | once_per_run | 8 | 0 | 0 | 0 | — | — | — | 1f6d8d01c561b21249eb919f7f02e5dc74e96c78afdf7ac4b55b4b9e6d2c3326 |
| C27 | Complete final serviceware recovery and visual-layout accountability | closing-18-19 | measurement | critical | yes | control_result | standard_required | forbidden | none | once_per_run | 12 | 1 | 4 | 2 | — | serviceware-recovery-route | — | a7cee6e1b5152ac96b592ebf8a31d1b1c4b651b3530ba418d6e01670ede9eecf |
| C28 | Final-restore the Workbar Non-Alco Fridge | closing-18-19 | measurement | critical | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 10 | 1 | 3 | 1 | — | workbar-non-alcoholic-fridge | — | aaabddea8da7e9b26ef9b23e6dd43e81d846b9898f00e18fe5990c6f24d9530d |
| C29 | Final-restock the Workbar milk fridge | closing-18-19 | measurement | critical | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 7 | 1 | 1 | 1 | — | workbar-milk-fridge | — | 7f0a209d4abdbe26d55dc9958e997f09788d3acc7094645b9c4890e18174369c |
| C30 | Final-restock every required beverage and bar fridge | closing-18-19 | measurement | critical | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 9 | 1 | 5 | 0 | — | all-operational-fridges | — | 1f914a519c2a60832e563e1da6b1c4a90426a99ae1826c4795d5c609fea247cc |
| C31 | Complete the final opened-wine and prosecco check | closing-18-19 | control | important | yes | control_result | standard_required | forbidden | none | once_per_run | 6 | 1 | 1 | 0 | — | — | — | f45c78e3018793ee7e8b3beb215ba348625319b5c4883db403cdd84419962b95 |
| C32 | Reset and restock the self-service counter to the overnight standard | closing-18-19 | control | critical | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 13 | 1 | 1 | 1 | — | self-service-counter | — | f9cc8f8eba918f02effb6e15ce83bb9aab5788e23971b840b306959b5d3af54c |
| C33 | Close and lock every required fridge | closing-18-19 | control | critical | yes | control_result | standard_required | forbidden | none | once_per_run | 10 | 1 | 5 | 0 | — | all-operational-fridges | — | c8114b251c5b1098c484f8665cdd53e22b0c32ec986fe434741408abc776dcad |
| C34 | Close every open POS table and customer account | closing-18-19 | control | critical | yes | control_result | standard_required | forbidden | none | once_per_run | 6 | 1 | 0 | 0 | — | — | — | 8904264cf769aa5363a61b7b2ff90b10e5608939dc34f22cfec40804dfbca0e4 |
| C35 | Close the register and complete settlement | closing-18-19 | procedure | critical | yes | none | standard_required | forbidden | self_recheck | once_per_run | 7 | 2 | 0 | 1 | — | register | — | abc93941152a088adce54850c421227057fadbdd57ddbc840b8520d006bbfb77 |
| C36 | Secure the till and all required keys in the safe | closing-18-19 | procedure | critical | yes | none | standard_required | forbidden | closing_responsible | once_per_run | 6 | 2 | 0 | 0 | — | — | — | 508bf35b6bce189bf0d7caa636252e1c53e386306ff818af1f0a11c03b54067e |
| C37 | Return all iPads, POS devices and payment terminals to their charging positions | closing-18-19 | measurement | critical | yes | control_result | standard_required | forbidden | none | once_per_run | 6 | 1 | 1 | 0 | — | device-charging-station | — | c1e9500ab7088e9d305e837fdaed45432fa831cf38a606f8ff785c40b4f8ce9f |
| C38 | Turn off music in every closed zone | closing-18-19 | control | important | yes | none | standard_required | forbidden | none | once_per_run | 6 | 1 | 0 | 1 | — | active-audio-zones | — | d3fa567ea201a6e2519e9a669233a274bd971911d243363905b58c847b42d30d |
| C39 | Turn off the Workbar screen | closing-18-19 | action | important | yes | none | standard_required | forbidden | none | once_per_run | 4 | 1 | 1 | 1 | — | workbar-screen | — | e9cc69972d7417f3adc5d0aea3a73ed7f91496e9c724f2d2b67b6df1ccb7e3d5 |
| C40 | Set all closed zones to the approved lighting mode | closing-18-19 | control | critical | yes | none | standard_required | forbidden | none | once_per_run | 6 | 1 | 2 | 1 | — | — | — | a82c560c7221af1e2aab6b2331ea685fff3268128398499d43576f3680f52f3f |
| C41 | Complete the final guest, toilet and area sweep | closing-18-19 | control | critical | yes | control_result | standard_required | forbidden | none | once_per_run | 11 | 2 | 2 | 0 | — | final-guest-area-sweep | — | 251fce1977764622c384db314dd42df713eb21fe63ab36586e770c601e564a28 |
| C42 | Physically lock and verify every required door | closing-18-19 | verification | critical | yes | control_result | standard_required | forbidden | self_recheck | once_per_run | 10 | 3 | 3 | 0 | — | closing-door-check | — | 4154731bf25835dbd7d19099c9343da92d715fc117591291fdf763b0ac07ceb6 |
| C43 | Verify Salto and clear all unauthorized manual overrides | closing-18-19 | verification | critical | yes | control_result | standard_required | forbidden | none | once_per_run | 7 | 2 | 2 | 0 | — | salto-control | — | 6ccf2ef9cbf0b2399790619b061153c713096c25b02cd228943f450e01439185 |
| C44 | Write and submit the final handover | closing-18-19 | handover | critical | yes | none | standard_required | forbidden | none | once_per_run | 9 | 1 | 0 | 0 | — | — | — | 4943e60db4f35b18a0cc679ccffb0e978fa64bd81f60698e5605e20fc0a65d03 |
| C45 | Complete the Closing Responsible final verification | closing-18-19 | verification | critical | yes | none | standard_required | forbidden | closing_responsible | once_per_run | 16 | 17 | 0 | 0 | — | — | — | 8b1bdc74796e2e8958bb9ae107cf46e24d2c72e191faac35375b34bf1cb0db66 |
| C46 | Set the alarm, exit and finish Closing | closing-18-19 | gate | critical | yes | none | standard_required | forbidden | self_recheck | once_per_run | 10 | 1 | 0 | 0 | — | — | — | d4d26f99c344704e1db437f1547365152a55573abd66f5f7cb7af9968713d906 |

## Double Shift system steps

- DS01 / `ds01_confirm_plan` — Confirm the Double Shift plan; source `aef348c12a8ab1ff90d2455dc7b9f5c57398dbfdd0df3d11f09d21238cd752b3`
- DS02 / `ds02_opening_transition` — Complete the Opening-to-Closing transition; source `7422f8dfc4ee3cceb9d7eb844bd5a769e096b2e18d1654d7a8f2a59fb2a5383e`
- DS03 / `ds03_return_review` — Return and review changes before Closing; source `0f0b322f0f774352739ab030310f922abf658f41bfc0d5bb670754e98c6de6cc`
- DS04 / `ds04_bundle_finalized` — Finalize the Double Shift assignment (system-generated); source `fccba664f9f909a2915854463ad8e61da74d8d258cd6cfd97fe94ecac7e9f674`

### Bundle copy

- **beforeOpening**

  ```text
  DOUBLE SHIFT
  Opening now
  Closing later
  Operational date: [date]
  Expected return for Closing: [time or Not set]
  [Confirm and start Opening]
  ```
- **betweenShifts**

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
- **return**

  ```text
  WELCOME BACK
  Changes since Opening:
  [counts]
  [Review changes]
  [Join Closing]
  ```
- **completion**

  ```text
  DOUBLE SHIFT COMPLETE
  Opening contribution: [...]
  Closing contribution: [...]
  Final delivery: [...]
  Manager overrides: [...]
  ```

## Unresolved publication and readiness blockers



## Logical references

- `main-storage-fridge` — Main Storage Fridge orientation and combined count; tasks O13, C08, C28
- `main-storage-express-shelf` — Express Shelf current saved standard; tasks O13, C08, C28
- `workbar-cleaning-station-opening` — Workbar cleaning station opening; tasks O07
- `members-lounge-coffee-point` — Members lounge coffee point; tasks O10, O11, O26
- `workbar-food-non-alcoholic-fridge` — Workbar food and non-alcoholic fridge; tasks O13, C08, C28
- `workbar-milk-fridge` — Workbar Milk Fridge; tasks O09, C09, C29
- `self-service-opening-standard` — Self-service opening standard; tasks O14
- `self-service-overnight-standard` — Self-service overnight standard; tasks C07, C32
- `project-room-standard` — Project-room standard; tasks O16, O31, C04
- `workbar-standard-layout` — Workbar standard layout; tasks O23, O25, O29, O35, C05, C14, C22
- `atrium-standard-layout` — Atrium standard layout; tasks O23, O25, C05, C14, C22
- `coffee-canister-lunch-reserve` — Coffee Canisters lunch reserve; tasks O06, O28, O34
- `coffee-canister-rinsed-storage` — Coffee Canisters rinsed storage; tasks C06, C17
- `ordinary-coffee-cup-layout` — Ordinary coffee-cup layout; tasks O15, O29, O35, C27
- `cappuccino-cup-shelf-layout` — Cappuccino-cup shelf layout; tasks O15, O29, O35, C27
- `cappuccino-and-espresso-machine-top-layout` — Cappuccino and espresso machine-top layout; tasks O15, O29, O35, C27
- `wine-glass-layout` — Wine-glass layout; tasks O15, O29, O35, C27
- `workbar-bar-left-fridge` — Workbar Bar Left fridge; tasks C10, C30, C33
- `workbar-bar-right-fridge` — Workbar Bar Right fridge; tasks C10, C30, C33
- `cornerbar-left-fridge` — Cornerbar Left fridge; tasks C10, C30, C33
- `cornerbar-middle-fridge` — Cornerbar Middle fridge; tasks C10, C30, C33
- `cornerbar-right-fridge` — Cornerbar Right fridge; tasks C10, C30, C33
- `cornerbar-glass-layout` — Cornerbar glass layout; tasks C20, C41
- `cornerbar-bar-equipment-storage` — Cornerbar bar-equipment storage; tasks C20
- `cornerbar-final-reset` — Cornerbar final reset; tasks C20, C41
- `cornerbar-street-door` — Cornerbar street door; tasks C42, C43
- `cornerbar-closed-lighting-standard` — Cornerbar closed lighting standard; tasks C40
- `opened-wine-date-label` — Opened wine date label; tasks C11, C31
- `cleaning-station-final-close` — Cleaning station final close; tasks C13
- `coffee-machine-night-state` — Coffee machine night state; tasks C18
- `milk-system-cleaning-parts` — Milk-system cleaning parts; tasks C19
- `bar-equipment-storage` — Bar equipment storage; tasks C20
- `beer-tap-parts` — Beer-tap parts; tasks C20
- `beer-drip-trays` — Beer drip trays; tasks C20
- `workbar-dishwasher-night-state` — Workbar dishwasher night state; tasks C23
- `kitchen-dishwasher-night-state` — Kitchen dishwasher night state; tasks C24
- `device-charging-station` — Device charging station; tasks C37
- `workbar-screen-night-state` — Workbar screen night state; tasks C39
- `closed-lighting-preset` — Closed lighting preset; tasks C40
- `closing-door-check` — Closing door check; tasks C42
- `cornerbar-upper-security-lock` — Cornerbar upper security lock; tasks C42
- `salto-closing-status` — Salto closing status; tasks C43

## Cross-run relations

| Source | Type | Target | Delivery key |
|---|---|---|---|
| O01 | repeat_required | closing/C01 | — |
| O03 | complementary_action | closing/C18 | — |
| O04 | complementary_action | closing/C23 | — |
| O05 | complementary_action | closing/C24 | — |
| O19 | complementary_action | closing/C38 | — |
| O20 | complementary_action | closing/C39 | — |
| O21 | complementary_action | closing/C40 | — |
| O17 | complementary_action | closing/C35 | — |
| O06 | complementary_action | closing/C17 | — |
| O22 | conditional_companion | closing/C22 | — |
| O16 | repeat_required | closing/C04 | — |
| O15 | repeat_required | closing/C27 | — |
| C28 | delivery_comparison | opening/O13 | workbar-food-non-alcoholic-fridge |
| C29 | delivery_comparison | opening/O09 | workbar-milk-fridge |
| C32 | delivery_comparison | opening/O14 | self-service-overnight-standard |
| C27 | delivery_comparison | opening/O15 | serviceware-full-targets |
| C04 | delivery_comparison | opening/O16 | project-rooms-final-standard |
| C13 | delivery_comparison | opening/O07 | cleaning-station-final-standard |

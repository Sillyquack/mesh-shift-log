# Mesh Routine Content Pack v1

> Generated from `content/routine-engine/mesh-routine-content-v1.json`. Do not edit by hand.

- Pack: `mesh-routine-content@1.0R`
- Schema: `1.0`
- SHA-256: `d8daf5e8c887c59023a99b741bc5f13ba46b4e74f23b4b003583eafc9f17c574`
- Opening: 37 tasks in 3 sections
- Closing: 46 tasks in 2 sections
- Double Shift: 4 system steps; no third template
- Locations / sets / standards / references: 43 / 12 / 14 / 33

The task audit below records the exact source-derived policy mapping and source-block SHA-256 for all 83 O/C tasks. Each canonical task also retains its full instruction, structured-item text, done criteria, deviation/blocking rules and reference guidance in the JSON manifest.

## Opening

| ID | Title | Section | Type | Criticality | Required | Initial | Completion | N/A | Verification | Repeat | Items | Dependencies | References | Relations | Unresolved blockers | Location/set | Server timing | Source SHA-256 |
|---|---|---|---|---|---|---|---|---|---|---|---:|---:|---:|---:|---|---|---|---|
| O01 | Review today’s bookings and events | opening-07-08 | control | important | yes | control_result | control_allows_deviation | forbidden | none | once_per_run | 5 | 0 | 0 | 1 | — | — | — | ea7c4cdd5b922e8b77b399df5912bd423b689253d4c12f92b971ef7167d6709d |
| O02 | Review today’s meeting-room coffee orders | opening-07-08 | control | important | yes | control_result | control_allows_deviation | forbidden | none | once_per_run | 5 | 0 | 0 | 0 | — | — | — | f58a0452cd892f76b98063f7c54b5979ac589167f4c5ad3d71a49c1bd6dbc12e |
| O03 | Turn on the espresso machine | opening-07-08 | action | important | yes | none | standard_required | forbidden | none | once_per_run | 4 | 0 | 0 | 1 | — | coffee-machine | — | 28248b8ff2aefcc83be16b6bc859ab53425d6f60ada77acecb6f3130aa08c9fd |
| O04 | Turn on the Workbar dishwashers | opening-07-08 | procedure | important | yes | none | standard_required | forbidden | none | once_per_run | 4 | 0 | 0 | 1 | — | workbar-dishwashers | — | e65dcbc0cfdca6a43b2f30e5b7bdd9ffac24452a0bb7a92d7ff4731137cda15e |
| O05 | Turn on the kitchen dishwashers | opening-07-08 | procedure | important | yes | none | standard_required | forbidden | none | once_per_run | 4 | 0 | 0 | 1 | — | kitchen-dishwashers | — | 971e1cd1b171e84c11c5d48e6bc0af8303af5bde5c61fa21b6e4c1192cbd5844 |
| O06 | Brew four Coffee Canisters | opening-07-08 | procedure | important | yes | none | standard_required | forbidden | none | once_per_run | 4 | 0 | 1 | 1 | — | — | — | 5634d3af6f89a18cbdfaa5ec7734c3d54fcd494d7bb8569452c8425314e3bff9 |
| O07 | Set up the cleaning station | opening-07-08 | control | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 6 | 0 | 1 | 1 | — | cleaning-station | — | dd35677bebdc962bf4e56a0fdfcd175dd843ad7540e511f0a7beab00a3d3f83e |
| O08 | Refill milk and oat milk in the coffee machine | opening-07-08 | procedure | important | yes | none | standard_required | forbidden | none | once_per_run | 5 | 0 | 0 | 0 | — | — | — | a45f61c456aa8156782e134fe4184eeca5058830e21feacbe12c14603a4bbd51 |
| O09 | Verify and restore the Workbar milk fridge to standard | opening-07-08 | measurement | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 5 | 0 | 1 | 1 | — | workbar-milk-fridge | — | c86ba76032d206d34b2905ec71303f85cfa139b783ff25c2f00df3552a6288a4 |
| O10 | Remove used cups and glasses from the members lounge | opening-07-08 | action | normal | yes | none | standard_required | forbidden | none | once_per_run | 4 | 0 | 1 | 0 | — | members-lounge | — | 509a7de6e926dcbada2473fc70976c75ab504da8bb98af3003d1bb14e73a4e38 |
| O11 | Set out one fresh Coffee Canister in the members lounge | opening-07-08 | action | important | yes | none | standard_required | forbidden | none | once_per_run | 4 | 0 | 1 | 0 | — | members-lounge | — | ffba354bd376a782cf9bdeb5e1434fe6a7ddba10d435fbda950bb591f595ab8d |
| O12 | Set out baked goods, fruit and snacks | opening-07-08 | procedure | important | yes | none | standard_required | forbidden | none | once_per_run | 5 | 0 | 0 | 0 | — | — | — | 356ac244c5bb41a7c15d89db5d175c591fd3335efb0b8597fda8f2e4209a420c |
| O13 | Verify and fully restock the Workbar food and non-alcoholic fridge, including eggs | opening-07-08 | measurement | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 7 | 0 | 1 | 1 | — | workbar-non-alcoholic-fridge | — | fb7bf1bf8dc58667a5af4d8adbcd2c24d50295d77a15e5882731f132f5472a0e |
| O14 | Set up the self-service counter to standard | opening-07-08 | control | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 23 | 0 | 1 | 1 | self-service-tea-slot-names | self-service-counter | — | b6ce68510389bd64f14728eec4ee7eb42f6d96852c1ad236412ba317d73d5c0c |
| O15 | Restore coffee cups and wine glasses to their full target counts | opening-07-08 | measurement | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 11 | 0 | 2 | 2 | coffee-cups-full-target; wine-glasses-full-target; serviceware-office-recovery-route-confirmation | serviceware-recovery-route | — | cad2f285e482e3f60f55f43b52a4146ece672dcf534347b40f47fb08f1c64222 |
| O16 | Prepare project rooms 001, 002, 003, 004, 006 and the Boardroom | opening-07-08 | control | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 6 | 0 | 1 | 2 | — | opening-project-rooms | — | f153edaa885dfae5fa822087acabc8d816cd9f3b13057ed5901775c491bc550d |
| O17 | Open the register and count the cash drawer | opening-07-08 | procedure | critical | yes | none | control_allows_deviation | forbidden | self_recheck | once_per_run | 5 | 0 | 0 | 1 | — | register | — | 327bf79283b86f027a8a5168b18a503607c1ec63ab56002112c514e0b965019e |
| O18 | Review all items marked sold out in POS | opening-07-08 | control | important | yes | control_result | control_allows_deviation | forbidden | none | once_per_run | 4 | 0 | 0 | 0 | — | — | — | 6100691f6f47e692027e4c04ad49a72059bb1e5b8cb7f2f47c652438012d2777 |
| O19 | Start music in all relevant zones | opening-07-08 | action | normal | yes | none | standard_required | forbidden | none | once_per_run | 3 | 0 | 0 | 1 | — | active-audio-zones | — | ab8c3855907e264c977f34f1eed20869aca2d010967189bc9027d6ec973a3ecc |
| O20 | Verify that the Workbar screen is showing its automatic slides | opening-07-08 | control | normal | yes | control_result | control_allows_deviation | forbidden | none | once_per_run | 5 | 0 | 0 | 1 | — | workbar-screen | — | 5ef88495b1da3643e34282ef84ef86f79aaf336b2c4b112d317c06b35c30f6f1 |
| O21 | Set the lights to Café mode | opening-07-08 | action | important | yes | none | standard_required | forbidden | none | once_per_run | 4 | 0 | 0 | 1 | — | — | — | ed7aee45776e3d4fe8df14ee02dd621b888663aa61868ed1d30bfa1304a1bef6 |
| O22 | Set out candles when the seasonal candle rule is active | opening-07-08 | action | normal | yes | none | standard_required | system_only | none | conditional | 3 | 0 | 0 | 1 | — | — | — | 730124b8ecb5fa4861e72ad6a17e8da18319098418cb521b22a865b1f5344395 |
| O23 | Complete the final opening readiness check | opening-07-08 | checkpoint | important | yes | none | standard_required | forbidden | none | once_per_run | 18 | 0 | 2 | 0 | — | — | 08:00:00 | a69ba58ac6d3693d63a2440a80005fd8408b378c9ffac90ec52201b6654cb4c6 |
| O24 | Recheck bookings and events for changes | opening-08-10 | control | important | yes | control_result | control_allows_deviation | forbidden | none | once_per_run | 5 | 0 | 0 | 0 | — | — | — | 51327606338e2a4dd6df44d333af263216e06c2f970f8338dcc1699bc51f92a5 |
| O25 | Verify venue and furniture setup against the current booking plan | opening-08-10 | control | important | yes | control_result | control_allows_deviation | forbidden | none | once_per_run | 5 | 0 | 2 | 0 | — | — | — | c31b687466af635e388109ae2cbe5775be82cf92ef32fd02bfecc572e656b8c1 |
| O26 | Clear and reset the members lounge coffee point | opening-08-10 | control | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 5 | 0 | 1 | 0 | — | — | — | 4b4efb780e07047e9b55c6bcea1a3f3a38cd096c41486c06256c6e604480d123 |
| O27 | Maintain the Workbar guest-service zone until the 09:45 checkpoint | opening-08-10 | continuous | important | yes | none | standard_required | forbidden | none | continuous | 6 | 1 | 0 | 0 | — | — | — | 57bf0102a2c4dbf17685174df41485f73fc7172ef5bafff274ef4ee6e3447b91 |
| O28 | Restore the lunch coffee reserve to four ready Coffee Canisters | opening-08-10 | measurement | important | yes | none | standard_required | forbidden | none | once_per_run | 4 | 0 | 1 | 0 | — | — | — | d71b1489f8b4b17ac8fe0c16fa3b09e363b84e52611035403bc725b07b0ebd05 |
| O29 | Complete the 09:45 full restock checkpoint | opening-08-10 | checkpoint | important | yes | control_result | standard_required | forbidden | none | once_per_phase | 8 | 1 | 3 | 0 | coffee-cups-service-ready-target; wine-glasses-service-ready-target | — | 09:35:00 / 09:40:00 / 09:45:00 / 09:55:00 | 15d2c24e6a4f702d4bbb24b0f07729439c6063d1169c77ca83fca896171c3984 |
| O30 | Recheck lunch bookings, events and coffee orders | opening-10-11 | control | important | yes | control_result | control_allows_deviation | forbidden | none | once_per_run | 5 | 1 | 0 | 0 | — | — | — | d91a05c1a2db3416e60589dc6b9aad8899d37b6718de0339dac996de1fde05b7 |
| O31 | Reset project rooms 001, 002, 003, 004, 006 and the Boardroom | opening-10-11 | control | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 6 | 1 | 1 | 0 | — | opening-project-rooms | — | a65a3cdd2c3df974df63d09610cd92e675ba8f113ffe10c68031d306c40af39c |
| O32 | Complete the Workbar toilet readiness check | opening-10-11 | control | important | yes | control_result | control_allows_deviation | forbidden | none | once_per_run | 5 | 1 | 0 | 0 | — | workbar-public-toilets | — | 46dbd4e3004d0272a5d72480daf6e907bbbfbf6f19c5db127aeff11a90cc848b |
| O33 | Maintain the Workbar guest-service zone until the 10:45 checkpoint | opening-10-11 | continuous | important | yes | none | standard_required | forbidden | none | continuous | 6 | 2 | 0 | 0 | — | — | — | 0852723f6913d446155ec431f910d09dc76d79e2180e18aa188eef97bbb1a4aa |
| O34 | Restore four ready Coffee Canisters before the final lunch check | opening-10-11 | measurement | important | yes | none | standard_required | forbidden | none | once_per_run | 4 | 1 | 1 | 0 | — | — | — | 0164dcd8bfe5fd5ff1221b505fcaef9fc7f1cbeb32c81a656b57f844a32a7504 |
| O35 | Complete the final 10:45 full restock checkpoint | opening-10-11 | checkpoint | important | yes | control_result | standard_required | forbidden | none | once_per_phase | 8 | 2 | 3 | 0 | coffee-cups-service-ready-target; wine-glasses-service-ready-target | — | 10:35:00 / 10:40:00 / 10:45:00 / 10:50:00 / 10:55:00 | 079b0ab80078eb2ef177185cf57bd57286b94994a30e9694ac086f667cd26d57 |
| O36 | Verify lunch product availability in POS and Weorder | opening-10-11 | control | important | yes | control_result | control_allows_deviation | forbidden | none | once_per_run | 6 | 1 | 0 | 0 | — | — | — | 5a589c078953ace614c9a9e8461602d4b9ddc7ef8ca7dce344016f1f93f3ef18 |
| O37 | Confirm lunch readiness for 11:00 | opening-10-11 | gate | important | yes | none | standard_required | forbidden | none | once_per_run | 9 | 7 | 0 | 0 | — | — | 11:00:00 | 0f247d9d59ced72c535ede8d82eb49e2ac88c985a8c9996461fa8d5eff3314c7 |

## Closing

| ID | Title | Section | Type | Criticality | Required | Initial | Completion | N/A | Verification | Repeat | Items | Dependencies | References | Relations | Unresolved blockers | Location/set | Server timing | Source SHA-256 |
|---|---|---|---|---|---|---|---|---|---|---|---:|---:|---:|---:|---|---|---|---|
| C01 | Review remaining bookings, events and closing constraints | closing-15-18 | control | important | yes | control_result | control_allows_deviation | forbidden | none | once_per_run | 7 | 0 | 0 | 1 | — | — | — | dd8450401f2f5115eeeb774c101b22ebbd162abf6871cb031a2dae9579229041 |
| C02 | Confirm closing responsibilities | closing-15-18 | control | critical | yes | control_result | standard_required | forbidden | none | once_per_run | 7 | 0 | 0 | 0 | — | — | — | cfb4b882122b4b943dbe7f0750cb033d98a2be017ebcf225b61e6d88ea5ccbce |
| C03 | Complete the first serviceware recovery sweep | closing-15-18 | measurement | important | yes | control_result | standard_required | forbidden | none | once_per_run | 8 | 1 | 0 | 0 | serviceware-office-recovery-route-confirmation | serviceware-recovery-route | — | 683588730fbc26c7bd627846313b78fc2b74a71b695d8934cdda22931d2ecf55 |
| C04 | Reset available project rooms and schedule the remaining resets | closing-15-18 | control | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 7 | 1 | 1 | 2 | — | closing-project-rooms | — | 3acdd0e4b60dd19330ca0e39a13e4d7e8b6c79f0bbd049112cffa4fb47c94b47 |
| C05 | Clear and clean available Workbar and Atrium tables | closing-15-18 | continuous | important | yes | none | standard_required | forbidden | none | continuous | 7 | 1 | 2 | 0 | — | — | — | 9cc659fad48d6ed44b3445de5261d9bf94f531508d1a5616111f14c91bcdd556 |
| C06 | Rinse empty Coffee Canisters and preserve service capacity | closing-15-18 | measurement | important | yes | control_result | standard_required | forbidden | none | once_per_run | 7 | 1 | 1 | 0 | — | — | — | 06e5aa61b000b13ffa4ac0666d548096ec69fd74af9fb7aa2c51a6365a1a6ae2 |
| C07 | Pre-restock the self-service counter to standard | closing-15-18 | control | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 9 | 1 | 1 | 0 | — | — | — | 201242d943eacefaf1cf9a2a96f43c286e227376040f278bedef9d588021a9f5 |
| C08 | Pre-restock the Workbar food and non-alcoholic fridge | closing-15-18 | measurement | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 6 | 1 | 1 | 0 | — | — | — | beb0335bcdd1a1ba9d1759f2b2f0f6b7beddce2c2e2c34a680a7f23835a09c5f |
| C09 | Pre-restock the Workbar milk fridge | closing-15-18 | measurement | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 5 | 1 | 1 | 0 | — | — | — | dfb998b64a8847d0629e2d819941702f59801ca2ae52eaab886fdcb6026cf468 |
| C10 | Pre-restock all active beverage and bar fridges | closing-15-18 | measurement | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 6 | 1 | 5 | 0 | — | all-operational-fridges | — | 69db5e6b6874b86368a60cfe0d7dab929cfb887eb1b5e17aad42a6d1133485fb |
| C11 | Check and date every opened wine and prosecco bottle | closing-15-18 | control | important | yes | control_result | standard_required | forbidden | none | once_per_run | 6 | 1 | 1 | 0 | — | — | — | 4eee4baa33746a7b37e4f3cb1279f892cf4e3d97b4471a6b2ca258abacd9b92a |
| C12 | Prepare Too Good To Go and SVINN without ending sales early | closing-15-18 | procedure | important | yes | control_result | standard_required | forbidden | none | once_per_run | 6 | 1 | 0 | 0 | — | — | — | 0a75b72ed1ff01ec9a66ebe3ab4db5767a7b724c73c4f082c43ea2a33089a6ac |
| C13 | Clean and reset the cleaning station for final close | closing-15-18 | control | important | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 6 | 1 | 1 | 1 | — | cleaning-station | — | b097c91cafb4d63a73dc5568527ee79f3799a4ff33a26c70b05056086522c1b0 |
| C14 | Complete the 17:45 pre-close readiness checkpoint | closing-15-18 | checkpoint | critical | yes | control_result | standard_required | forbidden | none | once_per_phase | 14 | 11 | 2 | 0 | — | — | 17:35:00 / 17:45:00 / 17:55:00 | 03e1adae0a332ed970d1443e0e3ca4b238121d200e48f40307797f52b158b7ed |
| C15 | Confirm final service end for each active zone | closing-15-18 | checkpoint | critical | yes | control_result | standard_required | forbidden | none | once_per_run | 6 | 0 | 0 | 0 | — | active-service-zones | — | 6b491d3d38b4e93205549ee6259e92a555add2a6b28a644f0bd6bd6dacde0094 |
| C16 | Finalize Too Good To Go and SVINN after the last sale | closing-18-19 | procedure | important | yes | none | standard_required | forbidden | none | once_per_run | 6 | 0 | 0 | 0 | — | — | — | 732d06a90d269d627a055d5b60e76f0a7fa8376c13c6b3372b3e5bac533a300a |
| C17 | Recover, clean and account for every Coffee Canister | closing-18-19 | measurement | critical | yes | control_result | standard_required | forbidden | none | once_per_run | 8 | 0 | 1 | 1 | coffee-canister-total-inventory-target | — | — | e14620b812ce5dd5ef7d5d5c49fed65c7d3475b7a5fd237f5b742c690ea284ce |
| C18 | Run and complete the coffee machine cleaning cycle | closing-18-19 | procedure | critical | yes | none | standard_required | forbidden | none | once_per_run | 7 | 0 | 1 | 1 | — | coffee-machine | — | ba0d3de34a4366092735e66e248d20fdffa7f2f5ecb3fb975632aaa969e086f1 |
| C19 | Complete the scheduled milk-system deep clean | closing-18-19 | action | critical | yes | none | standard_required | system_only | none | conditional | 7 | 0 | 1 | 0 | — | — | — | a3c2cb17182aeef81a7970744c4d86e073d4219055d381e681683cf0b69e4168 |
| C20 | Clean and return all bar equipment and beer-tap parts | closing-18-19 | procedure | important | yes | none | standard_required | forbidden | none | once_per_run | 7 | 0 | 3 | 0 | — | — | — | f8380ce77d5c0d9b7b8a9ab40e581a0a65f3ca00d7d2d3d865c096c27043ca49 |
| C21 | Clean the self-service surfaces and the Workbar bar area | closing-18-19 | procedure | important | yes | control_result | standard_required | forbidden | none | once_per_run | 6 | 0 | 0 | 0 | — | — | — | 670b211d546150fa418fe80a8b0ecc29149af1dae5d5dd4047b8e8d78a6d18ad |
| C22 | Complete the final Workbar and Atrium reset | closing-18-19 | control | critical | yes | ready_on_arrival | standard_required | forbidden | none | after_last_use | 7 | 0 | 2 | 1 | — | — | — | a7c6c9a036a868da9ed729dc96e099c6c88f6ca9491ba297068a3492001e2372 |
| C23 | Drain, clean and turn off the Workbar dishwashers | closing-18-19 | procedure | critical | yes | none | standard_required | forbidden | none | once_per_run | 7 | 0 | 1 | 1 | — | workbar-dishwashers | — | 4922aa28b2458f5a7df28c80d72aa0f58933a8b7e23dc91e0dac480e97ed2072 |
| C24 | Complete the kitchen close and shut down the kitchen dishwashers | closing-18-19 | procedure | critical | yes | none | standard_required | forbidden | none | once_per_run | 7 | 0 | 1 | 1 | — | kitchen-dishwashers | — | 91a831cc0c1ce886c3a498316787206191e7b72df5ee348e9d4acebf599aff01 |
| C25 | Return all dirty cloths and rags to cleaning storage | closing-18-19 | action | normal | yes | none | standard_required | forbidden | none | once_per_run | 7 | 0 | 0 | 0 | — | — | — | 14141638a339b02b0cdac973591f03166403017d9e455c132dc2f77d50efdbf4 |
| C26 | Remove all waste, PANT, glass and cardboard and rinse the bins | closing-18-19 | procedure | important | yes | none | standard_required | forbidden | none | once_per_run | 8 | 0 | 0 | 0 | — | — | — | 1f6d8d01c561b21249eb919f7f02e5dc74e96c78afdf7ac4b55b4b9e6d2c3326 |
| C27 | Complete the final serviceware recovery and full inventory accountability | closing-18-19 | measurement | critical | yes | control_result | standard_required | forbidden | none | once_per_run | 13 | 1 | 2 | 2 | coffee-cups-full-target; wine-glasses-full-target; serviceware-office-recovery-route-confirmation | serviceware-recovery-route | — | 05822ea7ffecea952100985cfef5bcff15c68e6b1581b63c67743b1a6e743f3e |
| C28 | Final-restock the Workbar food and non-alcoholic fridge | closing-18-19 | measurement | critical | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 7 | 1 | 1 | 1 | — | — | — | d7bc937d9cd51d75feecb403e2dc58a68f457a4d99de24350549865a35fc1b8a |
| C29 | Final-restock the Workbar milk fridge | closing-18-19 | measurement | critical | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 6 | 1 | 1 | 1 | — | workbar-milk-fridge | — | 8113f59254b1a9b87ec9de300bf80e97a1ff05370f41c0d1e2e38c6392de13b4 |
| C30 | Final-restock every required beverage and bar fridge | closing-18-19 | measurement | critical | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 7 | 1 | 5 | 0 | — | all-operational-fridges | — | 4f264a2e61a76c251c504daeb4fd7b89c9c5967b8986d486c759998cf074054c |
| C31 | Complete the final opened-wine and prosecco check | closing-18-19 | control | important | yes | control_result | standard_required | forbidden | none | once_per_run | 6 | 1 | 1 | 0 | — | — | — | f45c78e3018793ee7e8b3beb215ba348625319b5c4883db403cdd84419962b95 |
| C32 | Reset and restock the self-service counter to the overnight standard | closing-18-19 | control | critical | yes | ready_on_arrival | standard_required | forbidden | none | once_per_run | 13 | 1 | 1 | 1 | self-service-tea-slot-names | self-service-counter | — | a0b09db81aa84a55ed0a5a6e8c719c26e09a40317b2c8406d8d6628a581037ee |
| C33 | Close and lock every required fridge | closing-18-19 | control | critical | yes | control_result | standard_required | forbidden | none | once_per_run | 8 | 1 | 5 | 0 | fridge-closing-rules | all-operational-fridges | — | 231dba424b50185884f225d81791658826f69fd1086a23000a1c42701357c86d |
| C34 | Close every open POS table and customer account | closing-18-19 | control | critical | yes | control_result | standard_required | forbidden | none | once_per_run | 6 | 1 | 0 | 0 | — | — | — | 8904264cf769aa5363a61b7b2ff90b10e5608939dc34f22cfec40804dfbca0e4 |
| C35 | Close the register and complete settlement | closing-18-19 | procedure | critical | yes | none | standard_required | forbidden | self_recheck | once_per_run | 7 | 2 | 0 | 1 | — | register | — | abc93941152a088adce54850c421227057fadbdd57ddbc840b8520d006bbfb77 |
| C36 | Secure the till and all required keys in the safe | closing-18-19 | procedure | critical | yes | none | standard_required | forbidden | closing_responsible | once_per_run | 6 | 2 | 0 | 0 | — | — | — | 508bf35b6bce189bf0d7caa636252e1c53e386306ff818af1f0a11c03b54067e |
| C37 | Return all iPads, POS devices and payment terminals to their charging positions | closing-18-19 | measurement | critical | yes | control_result | standard_required | forbidden | none | once_per_run | 6 | 1 | 1 | 0 | — | device-charging-station | — | c1e9500ab7088e9d305e837fdaed45432fa831cf38a606f8ff785c40b4f8ce9f |
| C38 | Turn off music in every closed zone | closing-18-19 | control | important | yes | none | standard_required | forbidden | none | once_per_run | 5 | 1 | 0 | 1 | — | active-audio-zones | — | 748b2ded1f9e521fd15150713433704e41fb9607553584694341dd4dd2fd7a8b |
| C39 | Turn off the Workbar screen | closing-18-19 | action | important | yes | none | standard_required | forbidden | none | once_per_run | 4 | 1 | 1 | 1 | — | workbar-screen | — | e9cc69972d7417f3adc5d0aea3a73ed7f91496e9c724f2d2b67b6df1ccb7e3d5 |
| C40 | Set all closed zones to the approved lighting mode | closing-18-19 | control | critical | yes | none | standard_required | forbidden | none | once_per_run | 5 | 1 | 1 | 1 | — | — | — | 20c0ce1b6204b1e5ec2f6f28d1e290d18b3e7f2eebf9d3e751ce2e2cecd2915e |
| C41 | Complete the final guest, toilet and area sweep | closing-18-19 | control | critical | yes | control_result | standard_required | forbidden | none | once_per_run | 10 | 2 | 0 | 0 | — | final-guest-area-sweep | — | 974f30088a64b05c4beff0de7da1e12bc38a71ac9996311e3670212c3b87d6d8 |
| C42 | Physically lock and verify every required door | closing-18-19 | verification | critical | yes | control_result | standard_required | forbidden | self_recheck | once_per_run | 9 | 3 | 2 | 0 | door-and-lock-rules | closing-door-check | — | daf5fd9c0f00dc7abce7499e8eadbd25713e8b6b18683f6e73d1db390d40081f |
| C43 | Verify Salto and clear all unauthorized manual overrides | closing-18-19 | verification | critical | yes | control_result | standard_required | forbidden | none | once_per_run | 6 | 2 | 1 | 0 | — | salto-control | — | 65ffa69d25e8755991d486e3bc12f127a56816173230164fd424078567c978b2 |
| C44 | Write and submit the final handover | closing-18-19 | handover | critical | yes | none | standard_required | forbidden | none | once_per_run | 9 | 1 | 0 | 0 | — | — | — | 4943e60db4f35b18a0cc679ccffb0e978fa64bd81f60698e5605e20fc0a65d03 |
| C45 | Complete the Closing Responsible final verification | closing-18-19 | verification | critical | yes | none | standard_required | forbidden | closing_responsible | once_per_run | 15 | 17 | 0 | 0 | — | — | — | f2c9f617744e0fa49bda0ba3b01e0d1add790f80fb1de6e866b80f05ca6f3ea0 |
| C46 | Set the alarm, exit and finish Closing | closing-18-19 | gate | critical | yes | none | standard_required | forbidden | self_recheck | once_per_run | 9 | 1 | 0 | 0 | door-and-lock-rules | — | — | 5b035c64f9bb3ad05b16fabd8e39402672e25cd4de638328568a4dc13cd38791 |

## Double Shift system steps

- DS01 / `ds01_confirm_plan` — Confirm the Double Shift plan; source `aef348c12a8ab1ff90d2455dc7b9f5c57398dbfdd0df3d11f09d21238cd752b3`
- DS02 / `ds02_opening_transition` — Complete the Opening-to-Closing transition; source `8887206cb8ce5bfffd4f4430fe9e55340fe09d94b5f813ab1b4bcf705603a7bb`
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

- `coffee-cups-full-target`: Coffee cups full target (O15, C27)
- `coffee-cups-service-ready-target`: Coffee cups service-ready target (O29, O35)
- `wine-glasses-full-target`: Wine glasses full target (O15, C27)
- `wine-glasses-service-ready-target`: Wine glasses service-ready target (O29, O35)
- `coffee-canister-total-inventory-target`: Total Coffee Canister inventory target (C17)
- `self-service-tea-slot-names`: Names of the six loose-leaf tea slots (O14, C32)
- `serviceware-office-recovery-route-confirmation`: Exact serviceware recovery route through relevant office floors (O15, C03, C27)
- `door-and-lock-rules`: Door and lock rules (C42, C46)
- `fridge-closing-rules`: Fridge closing rules (C33)

## Logical references

- `workbar-cleaning-station-opening` — Workbar cleaning station opening; tasks O07
- `members-lounge-coffee-point` — Members lounge coffee point; tasks O10, O11, O26
- `workbar-food-non-alcoholic-fridge` — Workbar food and non-alcoholic fridge; tasks O13, C08, C28
- `workbar-milk-fridge` — Workbar Milk Fridge; tasks O09, C09, C29
- `self-service-opening-standard` — Self-service opening standard; tasks O14
- `self-service-overnight-standard` — Self-service overnight standard; tasks C07, C32
- `project-room-standard` — Project-room standard; tasks O16, O31, C04
- `workbar-standard-layout` — Workbar standard layout; tasks O23, O25, O29, O35, C05, C14, C22
- `atrium-standard-layout` — Atrium standard layout; tasks O23, O25, C05, C14, C22
- `coffee-canister-lunch-reserve` — Coffee Canister lunch reserve; tasks O06, O28, O34
- `coffee-canister-rinsed-storage` — Coffee Canister rinsed storage; tasks C06, C17
- `coffee-cups-full-storage` — Coffee cups full storage; tasks O15, O29, O35, C27
- `wine-glasses-full-storage` — Wine glasses full storage; tasks O15, O29, O35, C27
- `workbar-bar-left-fridge` — Workbar Bar Left fridge; tasks C10, C30, C33
- `workbar-bar-right-fridge` — Workbar Bar Right fridge; tasks C10, C30, C33
- `cornerbar-left-fridge` — Cornerbar Left fridge; tasks C10, C30, C33
- `cornerbar-middle-fridge` — Cornerbar Middle fridge; tasks C10, C30, C33
- `cornerbar-right-fridge` — Cornerbar Right fridge; tasks C10, C30, C33
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

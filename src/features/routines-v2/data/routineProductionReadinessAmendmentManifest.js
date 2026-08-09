// Byte-derived projection of the reviewed fields in the locked 1.1R and 1.2R packs.
// The canonical hashes remain the authority; unrelated pack fields are deliberately absent.
export const productionAmendmentBaseline = Object.freeze({
  packVersion: "1.1R",
  locations: [
    { key: "coffee-canister-kitchen-reserve", name: "Coffee Canister kitchen reserve" },
    { key: "workbar-bar-coffee-canister-cupboard", name: "Workbar bar Coffee Canister cupboard" },
  ],
  references: [
    { key: "coffee-canister-lunch-reserve", label: "Coffee Canister lunch reserve", description: "Placeholder reference for Coffee Canister lunch reserve." },
    { key: "coffee-canister-rinsed-storage", label: "Coffee Canister rinsed storage", description: "Placeholder reference for Coffee Canister rinsed storage." },
  ],
  standards: [{ key: "workbar-coffee-canister-assigned-target", label: "Workbar-assigned Coffee Canister target" }],
  opening: { tasks: [
    { id: "O02", taskKey: "o02-review-meeting-room-coffee-orders", metadata: { timingSourceText: "Immediately after O01 and before the first Coffee Canister brewing plan is finalized." } },
    { id: "O28", taskKey: "o28-restore-lunch-coffee-reserve", locationDescription: "Members lounge and Coffee Canister kitchen reserve." },
    { id: "O29", taskKey: "o29-full-restock-checkpoint-0945", metadata: { deviationRules: [
      "Any defined cup/glass position is empty, has the wrong type, or still depends on washing; service-ready is not a lower minimum.",
      "Any category cannot be restored.", "Missing stock, serviceware, Coffee Canister or access.",
      "Do not link normal morning consumption to the previous Closing automatically; record the current finding accurately.",
    ] } },
    { id: "O34", taskKey: "o34-restore-four-coffee-canisters-before-1045", locationDescription: "Members lounge and Coffee Canister kitchen reserve.", metadata: { deviationRules: [
      "Fewer than four ready.", "Missing or damaged Coffee Canister/part.", "Insufficient brewing supplies or capacity.",
    ] } },
    { id: "O35", taskKey: "o35-final-full-restock-checkpoint-1045", metadata: { deviationRules: [
      "Any defined cup/glass position is empty, has the wrong type, or still depends on washing; service-ready is not a lower minimum.",
      "Any product, serviceware or Coffee Canister shortage.",
      "Hard deadline missed — nonblocking timing deviation is recorded, but corrective completion is still required.",
      "Do not mark complete with unresolved stock.",
    ] } },
  ] },
  closing: { tasks: [
    { id: "C06", taskKey: "c06-rinse-empty-canisters-preserve-service", locationDescription: "Members lounge, Workbar and Coffee Canister kitchen reserve.", metadata: { deviationRules: [
      "Coffee Canister or part missing/damaged.", "Cleaning equipment unavailable.",
      "Remaining service capacity cannot be preserved.", "Canister location/state is unknown.",
    ] } },
    { id: "C17", taskKey: "c17-recover-clean-account-all-coffee-canisters",
      instructions: "Physically locate the four Coffee Canisters assigned to Workbar. Empty old coffee, clean each canister and required part, leave it complete and dry or stored under the approved procedure, then return it to the fixed Coffee Canister cupboard in Workbar bar. Coffee Canisters elsewhere in hospitality are outside this task's accountability.",
      structuredItemsText: "- `workbar_assigned_canisters` — exactly four Coffee Canisters assigned to Workbar\n- `physically_located_count` — physically located Workbar-assigned Coffee Canisters\n- `old_coffee_removed` — old coffee emptied from all four\n- `clean_and_complete` — all four cleaned and complete with required parts\n- `dry_or_approved_storage` — all four dry or stored under the approved procedure\n- `returned_to_workbar_cupboard` — all four returned to the fixed Workbar bar Coffee Canister cupboard\n- `missing_workbar_canisters` — missing Workbar-assigned Coffee Canisters; must be zero\n- `event_transfer_evidence` — completed transfer evidence when one of the four remains in authorized event use",
      items: [{ key: "returned_to_workbar_cupboard", label: "all four returned to the fixed Workbar bar Coffee Canister cupboard", metadata: { sourceText: "`returned_to_workbar_cupboard` — all four returned to the fixed Workbar bar Coffee Canister cupboard" } }],
    },
  ] },
});

export const productionAmendmentTarget = Object.freeze({
  packVersion: "1.2R",
  packHash: "2dcfc69b822f973c23e54934b6799faa5b9400ae0529096f049067811a417f25",
  locations: [
    { key: "coffee-canister-kitchen-reserve", name: "Coffee Canisters kitchen reserve" },
    { key: "workbar-bar-coffee-canister-cupboard", name: "Workbar bar Coffee Canisters cupboard" },
  ],
  references: [
    { key: "coffee-canister-lunch-reserve", label: "Coffee Canisters lunch reserve", description: "Placeholder reference for Coffee Canisters lunch reserve." },
    { key: "coffee-canister-rinsed-storage", label: "Coffee Canisters rinsed storage", description: "Placeholder reference for Coffee Canisters rinsed storage." },
  ],
  standards: [{ key: "workbar-coffee-canister-assigned-target", label: "Workbar-assigned Coffee Canisters target" }],
  opening: { tasks: [
    { id: "O02", taskKey: "o02-review-meeting-room-coffee-orders", metadata: { timingSourceText: "Immediately after O01 and before the first brewing plan for Coffee Canisters is finalized." } },
    { id: "O28", taskKey: "o28-restore-lunch-coffee-reserve", locationDescription: "Members lounge and Coffee Canisters kitchen reserve." },
    { id: "O29", taskKey: "o29-full-restock-checkpoint-0945", metadata: { deviationRules: [
      "Any defined cup/glass position is empty, has the wrong type, or still depends on washing; service-ready is not a lower minimum.",
      "Any category cannot be restored.", "Missing stock, serviceware, Coffee Canisters or access.",
      "Do not link normal morning consumption to the previous Closing automatically; record the current finding accurately.",
    ] } },
    { id: "O34", taskKey: "o34-restore-four-coffee-canisters-before-1045", locationDescription: "Members lounge and Coffee Canisters kitchen reserve.", metadata: { deviationRules: [
      "Fewer than four ready.", "One or more Coffee Canisters or parts are missing or damaged.", "Insufficient brewing supplies or capacity.",
    ] } },
    { id: "O35", taskKey: "o35-final-full-restock-checkpoint-1045", metadata: { deviationRules: [
      "Any defined cup/glass position is empty, has the wrong type, or still depends on washing; service-ready is not a lower minimum.",
      "Any product, serviceware or Coffee Canisters shortage.",
      "Hard deadline missed — nonblocking timing deviation is recorded, but corrective completion is still required.",
      "Do not mark complete with unresolved stock.",
    ] } },
  ] },
  closing: { tasks: [
    { id: "C06", taskKey: "c06-rinse-empty-canisters-preserve-service", locationDescription: "Members lounge, Workbar and Coffee Canisters kitchen reserve.", metadata: { deviationRules: [
      "Coffee Canisters or parts missing/damaged.", "Cleaning equipment unavailable.",
      "Remaining service capacity cannot be preserved.", "Canister location/state is unknown.",
    ] } },
    { id: "C17", taskKey: "c17-recover-clean-account-all-coffee-canisters",
      instructions: "Physically locate the four Coffee Canisters assigned to Workbar. Empty old coffee, clean each canister and required part, leave it complete and dry or stored under the approved procedure, then return it to the fixed Coffee Canisters cupboard in Workbar bar. Coffee Canisters elsewhere in hospitality are outside this task's accountability.",
      structuredItemsText: "- `workbar_assigned_canisters` — exactly four Coffee Canisters assigned to Workbar\n- `physically_located_count` — physically located Workbar-assigned Coffee Canisters\n- `old_coffee_removed` — old coffee emptied from all four\n- `clean_and_complete` — all four cleaned and complete with required parts\n- `dry_or_approved_storage` — all four dry or stored under the approved procedure\n- `returned_to_workbar_cupboard` — all four returned to the fixed Workbar bar Coffee Canisters cupboard\n- `missing_workbar_canisters` — missing Workbar-assigned Coffee Canisters; must be zero\n- `event_transfer_evidence` — completed transfer evidence when one of the four remains in authorized event use",
      items: [{ key: "returned_to_workbar_cupboard", label: "all four returned to the fixed Workbar bar Coffee Canisters cupboard", metadata: { sourceText: "`returned_to_workbar_cupboard` — all four returned to the fixed Workbar bar Coffee Canisters cupboard" } }],
    },
  ] },
});

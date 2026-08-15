const freezeList = (items) => Object.freeze([...items]);

export const WORKBAR_MILK_FRIDGE_STANDARD_KEY = "workbar-milk-fridge-target";

export const workbarMilkFridgeStandard = Object.freeze({
  key: WORKBAR_MILK_FRIDGE_STANDARD_KEY,
  displayName: "Workbar Milk Fridge",
  subtitle: "Top shelf: milk reserve · Lower shelves: opened, date-labelled wine only",
  ownership: "organization",
  physicalPurpose: "Permanent mixed-purpose refrigerator in the old wine cabinet at Workbar.",
  topShelf: Object.freeze({
    exclusiveUse: "milk-reserve",
    regularMilkCartons: 2,
    oatlyCartons: 2,
    exactQuantitiesRequired: true,
    supplies: freezeList(["espresso-machine milk reservoirs", "self-service milk jug"]),
  }),
  lowerShelves: Object.freeze({
    exclusiveUse: "opened-wine-bottles",
    openedBottlesOnly: true,
    visibleDateLabelRequired: true,
    unopenedWineAllowed: false,
    generalStorageAllowed: false,
  }),
  applicability: Object.freeze({
    alwaysApplicable: true,
    appliesDuring: freezeList(["Opening", "Daytime", "Double Shift", "Closing", "Event Mode", "ordinary daily operation"]),
    notOverridableByEvent: true,
    temporaryStorageOverrideAllowed: false,
  }),
  operatingState: Object.freeze({
    poweredOn: true,
    doorClosed: true,
    locking: "remain-unlocked",
    cleanAndOperating: true,
  }),
  forbiddenItemCategories: freezeList([
    "additional milk cartons",
    "unopened wine",
    "beer",
    "soft drinks",
    "food",
    "unrelated event products",
    "general temporary storage",
    "opened bottles without a visible date label",
    "bottles whose opened/date status cannot be understood",
  ]),
  mainInstruction: "Restore the top shelf to exactly 2 regular milk cartons and 2 Oatly cartons. Every other shelf is reserved exclusively for opened wine bottles with a visible date label. Do not store additional milk, unopened wine, food, soft drinks, beer, unrelated event products or unlabelled bottles here. This standard does not change for events or different shift types.",
  doneCriteria: freezeList([
    "top shelf contains exactly 2 regular milk and 2 Oatly",
    "every bottle below is opened",
    "every bottle below has a clearly visible date label",
    "no unrelated item is stored in the refrigerator",
    "refrigerator is clean, operating and correctly organised",
  ]),
  stockCount: Object.freeze({
    regularMilk: Object.freeze({ policy: "exact_standard", quantity: 2 }),
    oatly: Object.freeze({ policy: "exact_standard", quantity: 2 }),
    openedWine: Object.freeze({ policy: "actual_physical_quantity", exactStandardQuantity: null, partialBottleRulesRemainAuthoritative: true }),
    fastStandardPathRequiresEveryApplicableLineEligible: true,
    preserveCountsNotesAndDeviations: true,
    routineCompletionCompletesStockCount: false,
    protectedBelowMarketWinesRemainPhysicalUnitsUntilMillumExport: true,
  }),
  provenance: "Operations-approved standard · confirmed 15 August 2026",
});

export const ESPRESSO_MACHINE_MILK_RESERVOIR_INSTRUCTION =
  "Refill both espresso-machine milk reservoirs. Use regular milk in the dairy reservoir and Oatly in the oat reservoir. Use fresh, in-date cartons from the Workbar Milk Fridge and confirm both reservoirs are correctly connected.";

export const CORNERBAR_SAVED_STANDARD_INSTRUCTION =
  "Refill each Cornerbar fridge to its current saved location standard. Keep every refrigerator and its internal light on.";

export const CORNERBAR_SAVED_STANDARD_INCOMPLETE =
  "Saved standard incomplete — manager confirmation required.";

export const cornerbarSavedLocationStandardBinding = Object.freeze({
  mode: "location_standards",
  locationCodes: freezeList(["CORNERBAR_LEFT_FRIDGE", "CORNERBAR_MIDDLE_FRIDGE", "CORNERBAR_RIGHT_FRIDGE"]),
  activeOnly: true,
  resolution: "current-manager-maintained-location-standard",
  incompleteMessage: CORNERBAR_SAVED_STANDARD_INCOMPLETE,
  embeddedProductQuantitiesAllowed: false,
});

export const WORKBAR_SALAD_FRIDGE_LIGHT_INSTRUCTION =
  "Clean the Workbar salad fridge. Switch off the internal light only using the light-bulb control. Do not switch off the refrigerator.";

export const fridgeReviewStandards = Object.freeze({
  workbarMilkFridge: workbarMilkFridgeStandard,
  espressoMachineMilkReservoirs: Object.freeze({
    key: "espresso-machine-milk-reservoirs",
    displayName: "Espresso-machine milk reservoirs",
    ownership: "organization",
    instruction: ESPRESSO_MACHINE_MILK_RESERVOIR_INSTRUCTION,
    distinctFrom: WORKBAR_MILK_FRIDGE_STANDARD_KEY,
  }),
  cornerbarSavedStandards: Object.freeze({
    key: "cornerbar-current-saved-location-standards",
    displayName: "Cornerbar saved location standards",
    ownership: "organization",
    instruction: CORNERBAR_SAVED_STANDARD_INSTRUCTION,
    binding: cornerbarSavedLocationStandardBinding,
  }),
  workbarSaladFridgeLight: Object.freeze({
    key: "workbar-salad-fridge-internal-light",
    displayName: "Workbar salad-fridge internal light",
    ownership: "organization",
    instruction: WORKBAR_SALAD_FRIDGE_LIGHT_INSTRUCTION,
  }),
});

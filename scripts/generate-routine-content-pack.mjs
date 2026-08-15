import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CORNERBAR_SAVED_STANDARD_INCOMPLETE,
  CORNERBAR_SAVED_STANDARD_INSTRUCTION,
  ESPRESSO_MACHINE_MILK_RESERVOIR_INSTRUCTION,
  WORKBAR_MILK_FRIDGE_STANDARD_KEY,
  WORKBAR_NON_ALCO_LOCATION_KEY,
  WORKBAR_NON_ALCO_SAVED_STANDARD_INSTRUCTION,
  cornerbarSavedLocationStandardBinding,
  workbarNonAlcoSavedLocationStandardBinding,
  workbarMilkFridgeStandard,
} from "../src/data/fridgeOperationalStandards.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACK_PATH = resolve(ROOT, "content/routine-engine/mesh-routine-content-v1-5r.json");
const PREVIOUS_PACK_PATH = resolve(ROOT, "content/routine-engine/mesh-routine-content-v1-4r.json");
const RUNTIME_BASELINE_PACK_PATH = resolve(ROOT, "content/routine-engine/mesh-routine-content-v1-3r.json");
const RUNTIME_TARGET_PACK_PATH = resolve(ROOT, "content/routine-engine/mesh-routine-content-v1-4r.json");
const DOC_PATH = resolve(ROOT, "docs/routine-engine-v2-mesh-content-v1-5r.md");
const SQL_PATH = resolve(ROOT, "supabase/phase10y_mesh_routine_content_pack_1_5r.sql");
const MANIFEST_PATH = resolve(ROOT, "src/features/routines-v2/data/routineRuntimeContractAlignmentManifest.js");
const BASE_AMENDMENT_PATH = resolve(ROOT, "docs/routine-engine-v2-mesh-operational-standards-amendment-2026-08-07.md");
const PRODUCTION_AMENDMENT_PATH = resolve(ROOT, "docs/routine-engine-v2-production-readiness-amendment-2026-08-09.md");
const SERVICEWARE_AMENDMENT_PATH = resolve(ROOT, "docs/routine-engine-v2-serviceware-route-amendment-2026-08-09.md");
const AMENDMENT_PATH = resolve(ROOT, "docs/routine-engine-v2-runtime-contract-alignment-amendment-2026-08-09.md");
const FRIDGE_AMENDMENT_PATH = resolve(ROOT, "docs/routine-engine-v2-fridge-standards-amendment-2026-08-15.md");
const AMENDMENT_METADATA_HEADING = "## Generated pack metadata";
const PACK_START = "-- BEGIN GENERATED MESH CONTENT PACK PAYLOAD";
const PACK_END = "-- END GENERATED MESH CONTENT PACK PAYLOAD";

const SOURCE_HASHES = Object.freeze({
  opening: "ea00e80bde6c17ea1d3f1095949363d79d606dcee16f05f742426c1c5248e079",
  closing: "27698f86716a141268546c623609f8b956213e53f20d00c03935cad01bd9244c",
  doubleShift: "f4fce4d5a3dcafecd7dfca2a5bf780f7c3652634da2cb0f068daa5d4f506a0eb",
});

const WORKBAR_NON_ALCO_LOCATION_STANDARD_SOURCE = Object.freeze({
  mode: workbarNonAlcoSavedLocationStandardBinding.mode,
  locationCodes: workbarNonAlcoSavedLocationStandardBinding.locationCodes,
  activeOnly: workbarNonAlcoSavedLocationStandardBinding.activeOnly,
});
const INVENTORY_ITEM_BINDINGS = Object.freeze({
  O13: Object.freeze(["inventory_standard_items"]),
  C08: Object.freeze(["inventory_standard_items"]),
  C28: Object.freeze(["inventory_standard_items"]),
});
const CORNERBAR_LOCATION_CODE_BY_ITEM = Object.freeze({
  cornerbar_left: "CORNERBAR_LEFT_FRIDGE",
  cornerbar_middle: "CORNERBAR_MIDDLE_FRIDGE",
  cornerbar_right: "CORNERBAR_RIGHT_FRIDGE",
});
const CORNERBAR_INVENTORY_ITEM_BINDINGS = Object.freeze({
  C10: Object.freeze(Object.keys(CORNERBAR_LOCATION_CODE_BY_ITEM)),
  C30: Object.freeze(Object.keys(CORNERBAR_LOCATION_CODE_BY_ITEM)),
});
const REQUIRED_CLOSING_ASSET_SOURCE = Object.freeze({
  mode: "active_assets",
  requiredForClosing: true,
});
const ASSET_REGISTRY_ITEM_BINDINGS = Object.freeze({
  C37: Object.freeze(["active_asset_registry_items"]),
});

const TOP_LEVEL_FIELDS = Object.freeze([
  "schemaVersion", "packKey", "packVersion", "name", "description", "sections",
  "locations", "locationSets", "standards", "references", "opening", "closing",
  "doubleShiftSteps", "doubleShiftCopy", "unresolvedRequirements", "sourceDocuments", "packHash",
]);

const ROOM_KEYS = ["project-room-001", "project-room-002", "project-room-003", "project-room-004", "project-room-006", "boardroom"];
const FRIDGE_KEYS = ["workbar-bar-left-fridge", "workbar-bar-right-fridge", "workbar-non-alcoholic-fridge", "workbar-milk-fridge", "cornerbar-left-fridge", "cornerbar-middle-fridge", "cornerbar-right-fridge"];
const TOILET_KEYS = ["workbar-toilets", "basement-toilets", "cornerbar-toilets"];
const DOOR_KEYS = ["front-door", "vindfang-door", "kitchen-atrium-door", "atrium-workbar-door", "cornerbar-atrium-door", "garbage-hallway-atrium-door", "cornerbar-street-door", "cornerbar-street-upper-security-lock"];

const LOCATIONS = [
  ["workbar", "Workbar", "zone"], ["atrium", "Atrium", "zone"], ["cornerbar", "Cornerbar", "zone"],
  ["members-lounge", "Members lounge", "zone"], ["kitchen", "Kitchen", "zone"],
  ["cleaning-station", "Cleaning station", "station"], ["self-service-counter", "Self-service counter", "station"],
  ["coffee-machine", "Coffee machine", "equipment"], ["coffee-canister-kitchen-reserve", "Coffee Canisters kitchen reserve", "storage"],
  ["workbar-bar-coffee-canister-cupboard", "Workbar bar Coffee Canisters cupboard", "storage"],
  ["register", "Register", "station"], ["workbar-screen", "Workbar screen", "equipment"],
  ["serviceware-storage", "Serviceware storage", "storage"], ["waste-room-route", "Waste room / waste route", "collection_point"],
  ["project-room-001", "001", "room"], ["project-room-002", "002", "room"], ["project-room-003", "003", "room"],
  ["project-room-004", "004", "room"], ["project-room-006", "006", "room"], ["boardroom", "Boardroom", "room"],
  ["workbar-bar-left-fridge", "Workbar Bar Left", "fridge"], ["workbar-bar-right-fridge", "Workbar Bar Right", "fridge"],
  ["workbar-non-alcoholic-fridge", "Workbar Non-Alco Fridge", "fridge"], ["workbar-milk-fridge", "Workbar Milk Fridge", "fridge"],
  ["cornerbar-left-fridge", "Cornerbar Left", "fridge"], ["cornerbar-middle-fridge", "Cornerbar Middle", "fridge"], ["cornerbar-right-fridge", "Cornerbar Right", "fridge"],
  ["workbar-toilets", "Workbar toilets", "toilet"], ["basement-toilets", "Basement toilets", "toilet"], ["cornerbar-toilets", "Cornerbar toilets", "toilet"],
  ["front-door", "Front door", "door"], ["vindfang-door", "Vindfang door", "door"], ["kitchen-atrium-door", "Kitchen / Atrium door", "door"],
  ["atrium-workbar-door", "Atrium / Workbar door", "door"], ["cornerbar-atrium-door", "Cornerbar / Atrium door", "door"],
  ["garbage-hallway-atrium-door", "Garbage hallway / Atrium door", "door"], ["cornerbar-street-door", "Cornerbar street door", "door"],
  ["cornerbar-street-upper-security-lock", "Cornerbar street upper security lock", "door"],
  ["workbar-dishwashers", "Workbar dishwashers", "equipment"], ["kitchen-dishwashers", "Kitchen dishwashers", "equipment"],
  ["device-charging-station", "Device charging station", "equipment"], ["music-control", "Music control", "equipment"],
  ["lighting-control", "Lighting control", "equipment"], ["salto-control", "Salto control", "equipment"],
].map(([key, name, type], sortOrder) => ({ key, name, type, sortOrder, metadata: {} }));

const LOCATION_SETS = [
  ["opening-project-rooms", "Opening project rooms", ROOM_KEYS, {}],
  ["closing-project-rooms", "Closing project rooms", ROOM_KEYS, {}],
  ["workbar-public-toilets", "Workbar public toilets", ["workbar-toilets"], {}],
  ["all-operational-toilets", "All operational toilets", TOILET_KEYS, {}],
  ["active-audio-zones", "Active audio zones", ["workbar", "atrium", "cornerbar"], {}],
  ["active-service-zones", "Active service zones", ["workbar", "atrium", "cornerbar"], {}],
  ["all-operational-fridges", "All operational fridges", FRIDGE_KEYS, {}],
  ["workbar-bar-fridges", "Workbar bar fridges", FRIDGE_KEYS.slice(0, 2), {}],
  ["cornerbar-fridges", "Cornerbar fridges", FRIDGE_KEYS.slice(4), {}],
  ["closing-door-check", "Closing door check", DOOR_KEYS, {}],
  ["final-guest-area-sweep", "Final guest area sweep", ["workbar", "members-lounge", ...TOILET_KEYS, "cornerbar", "atrium", ...ROOM_KEYS, "kitchen"], {}],
  ["serviceware-recovery-route", "Serviceware recovery route", ["workbar", "members-lounge", "atrium", "cornerbar", ...ROOM_KEYS, "kitchen", "serviceware-storage"], { managerIncomplete: false, authoritativeStandardKey: "serviceware-office-recovery-route-confirmation" }],
].map(([key, name, members, metadata], sortOrder) => ({ key, name, description: key === "serviceware-recovery-route" ? "Scope anchor for serviceware recovery; the authoritative office-floor kitchen sequence is stored in the shared serviceware route standard." : null, members, sortOrder, metadata }));

const SELF_SERVICE_COMPONENTS = [
  "milk jug with milk during service", "sugar", "sweetener", "stirrers", "loose-leaf tea slots",
  "measuring spoon glass", "empty tea bags", "honey", "toothpicks", "napkins", "small-waste container",
  "one Coffee Canister during service", "one basket with knives and forks", "one container with teaspoons",
  "takeaway cups", "large lids", "small lids", "two sets/stacks of plates", "baked goods", "fruit", "snacks",
  "food/non-alcoholic fridge products", "eggs",
];
const OVERNIGHT_POLICY = [
  "no fresh milk left out", "no old coffee left out", "milk jug emptied and cleaned",
  "Coffee Canisters cleaned and stored", "dry goods/serviceware full", "baked-goods surface clean and empty",
  "fruit/snacks at approved overnight standard", "waste container emptied", "surfaces clean and dry",
];

const COFFEE_CUP_LAYOUT = Object.freeze({
  contractKey: "mesh-coffee-cup-visual-layout-v1",
  allDefinedPositionsFilled: true,
  ordinaryCoffeeCups: { stackHeight: 4, handleDirection: "right" },
  cappuccinoCups: { requiredPositions: ["shelf", "coffee-machine-top"], allDefinedPositionsFilled: true },
  espressoCups: { requiredPositions: ["coffee-machine-top"], allDefinedPositionsFilled: true },
  correctCupTypeAtDefinedPosition: true,
  missingItemAction: ["locate", "wash", "return"],
  dishwasherOrWashFlowCountsAsReady: false,
  referenceKeys: ["ordinary-coffee-cup-layout", "cappuccino-cup-shelf-layout", "cappuccino-and-espresso-machine-top-layout"],
});
const WINE_GLASS_LAYOUT = Object.freeze({
  contractKey: "mesh-wine-glass-visual-layout-v1",
  allDefinedPositionsFilled: true,
  correctGlassTypeAtDefinedPosition: true,
  exactArrangementFromReference: true,
  missingItemAction: ["locate", "wash", "return"],
  dishwasherOrWashFlowCountsAsReady: false,
  referenceKeys: ["wine-glass-layout"],
});
const WORKBAR_CANISTER_TARGET = Object.freeze({
  assignedToWorkbar: 4,
  membersLoungeDuringService: 1,
  kitchenReserveDuringService: 3,
  overnightStorage: "workbar-bar-coffee-canister-cupboard",
});
const TEA_SLOT_NAMES = Object.freeze(["Peppermynte", "Chai Masala", "Earl Grey Fransk", "Bestemors Frukthave", "Sencha", "Rooibos Chile"]);
const DOOR_AND_LOCK_RULES = Object.freeze({
  globalClosing: {
    hospitalityDoorsPhysicallyClosedBeforeAlarm: true,
    requiredLocksPhysicallyChecked: true,
    unauthorizedManualSaltoUnlocksRemoved: true,
    openOrUnlockedDoorMayTriggerAlarm: true,
    credentialsStored: false,
  },
  frontDoor: {
    weekdayAutomaticOpen: { fromLocalTime: "08:00", toLocalTime: "18:00" },
    outsideSchedule: "closed_and_locked",
    eventManualSaltoUnlock: "approved_when_required",
    openingEventSteps: ["confirm-event-need", "perform-approved-manual-salto-unlock", "physically-verify-correct-state"],
    closingSteps: ["remove-manual-salto-unlock-after-event", "physically-close", "confirm-locked"],
  },
  normallyLockedUnlessManualSaltoUnlock: ["vindfang-door", "kitchen-atrium-door", "atrium-workbar-door", "cornerbar-atrium-door", "garbage-hallway-atrium-door"],
  perDoorClosingSteps: ["physically-close", "remove-manual-salto-unlock", "verify-locked"],
  cornerbarStreetDoor: {
    requiredSecurity: ["salto-locked", "upper-physical-security-lock-engaged", "physical-verification-completed"],
    openingSteps: ["unlock-in-salto", "unlock-upper-physical-security-lock", "physically-verify-both-open"],
    closingSteps: ["physically-close", "lock-in-salto", "engage-upper-physical-security-lock", "verify-both-separately"],
  },
});
const FRIDGE_CLOSING_RULES = Object.freeze({
  sharedBarFridgeRule: { universalInterchangeableKeys: true, physicallyVerifyLockAfterKeyTurn: true, eventActivePolicy: "formal-transfer-with-scope-and-physical-evidence-never-not-applicable" },
  workbarBarLeft: { opening: ["unlock-with-universal-key", "physically-verify-unlocked"], finalClosing: ["full-restock", "close-door-completely", "lock-with-universal-key", "physically-verify-locked"] },
  workbarBarRight: { opening: ["unlock-with-universal-key", "physically-verify-unlocked"], finalClosing: ["full-restock", "close-door-completely", "lock-with-universal-key", "physically-verify-locked"] },
  workbarNonAlcoholic: {
    locationKey: WORKBAR_NON_ALCO_LOCATION_KEY,
    standardSource: workbarNonAlcoSavedLocationStandardBinding,
    locking: "never-lock",
    power: "remain-on",
    internalLight: "remain-on",
    opening: ["resolve-current-saved-location-standard", "clean-and-restore", "check-dates-and-fifo", "correct-placement-and-fronting", "raise-grille-fully", "close-door", "confirm-normal-operation"],
    finalClosing: ["resolve-current-saved-location-standard", "clean-and-restore", "check-dates-and-fifo", "correct-placement-and-fronting", "remain-unlocked", "lower-grille-fully", "close-door", "confirm-refrigerator-and-internal-light-on", "confirm-normal-operation"],
  },
  workbarMilk: { standardKey: WORKBAR_MILK_FRIDGE_STANDARD_KEY, locking: "remain-unlocked", power: "remain-on", door: "physically-closed" },
  cornerbarLeft: { standardSource: { ...cornerbarSavedLocationStandardBinding, locationCodes: ["CORNERBAR_LEFT_FRIDGE"] }, openingWhenActive: ["unlock-with-universal-key", "physically-verify-unlocked", "restock-current-saved-location-standard", "keep-refrigerator-and-internal-light-on"], finalClosing: ["restock-current-saved-location-standard", "keep-refrigerator-and-internal-light-on", "close-door", "lock-with-universal-key", "physically-verify-locked"] },
  cornerbarMiddle: { standardSource: { ...cornerbarSavedLocationStandardBinding, locationCodes: ["CORNERBAR_MIDDLE_FRIDGE"] }, openingWhenActive: ["unlock-with-universal-key", "physically-verify-unlocked", "restock-current-saved-location-standard", "keep-refrigerator-and-internal-light-on"], finalClosing: ["restock-current-saved-location-standard", "keep-refrigerator-and-internal-light-on", "close-door", "lock-with-universal-key", "physically-verify-locked"] },
  cornerbarRight: { standardSource: { ...cornerbarSavedLocationStandardBinding, locationCodes: ["CORNERBAR_RIGHT_FRIDGE"] }, openingWhenActive: ["unlock-with-universal-key", "physically-verify-unlocked", "restock-current-saved-location-standard", "keep-refrigerator-and-internal-light-on"], finalClosing: ["restock-current-saved-location-standard", "keep-refrigerator-and-internal-light-on", "close-door", "lock-with-universal-key", "physically-verify-locked"] },
  cornerbarEventActive: { result: "formal-transfer-not-not-applicable", recipient: "authorized-event-operations-person", scope: "each-relevant-fridge", finalEvidence: "physical-check-required" },
});
const CORNERBAR_OPERATING_STANDARD = Object.freeze({
  openingWhenUsed: ["confirm-booking-event-and-expected-opening-time", "confirm-operational-owner", "unlock-relevant-doors-in-salto", "unlock-cornerbar-street-upper-physical-security-lock", "unlock-left-middle-right-fridges-with-universal-key", "check-and-restock-each-fridge-to-own-layout", "set-glassware-bar-equipment-and-presentation", "activate-relevant-music-and-lighting", "physically-confirm-ready"],
  fridgeStandardSource: cornerbarSavedLocationStandardBinding,
  fridgeStandardIncompleteMessage: CORNERBAR_SAVED_STANDARD_INCOMPLETE,
  finalClosing: ["confirm-last-service-and-event-operation-ended", "refill-left-middle-right-fridges-to-current-saved-location-standard", "keep-every-cornerbar-refrigerator-and-internal-light-on", "close-lock-and-check-left-middle-right-fridges", "clean-and-return-bar-equipment", "clean-and-return-beer-tap-parts-and-drip-trays", "reset-cornerbar-to-approved-final-standard", "turn-off-room-music", "apply-closed-room-lighting", "complete-physical-area-sweep", "close-and-lock-relevant-inner-doors", "remove-unauthorized-manual-salto-unlocks", "lock-cornerbar-street-door-in-salto", "engage-upper-physical-security-lock", "verify-salto-lock-and-upper-physical-lock-separately"],
  eventActive: { ordinaryClosingMayClaimComplete: false, notApplicableAllowed: false, transferRequired: true, transferScopes: ["fridges", "doors-and-locks", "equipment", "music-and-lighting", "final-sweep", "reset-controls"], finalEvidence: "physical-completion-evidence-required" },
});
const SERVICEWARE_RECOVERY_ROUTE = Object.freeze({
  contractKey: "mesh-serviceware-office-recovery-route-v1",
  purpose: "Collect all café/Workbar serviceware that has migrated to office-floor kitchens and restore the full Workbar default before completion.",
  equipment: {
    trolley: 1,
    emptyTraysMinimum: 2,
    cleanTray: 1,
    dirtyTray: 1,
    cleanDirtySeparationRequiredThroughout: true,
    sameTrayMixingAllowed: false,
  },
  route: [
    "Start in Workbar.",
    "Take the Workbar elevator to floor 2.",
    "Inspect both kitchens on floor 2, beginning on the Workbar-elevator side and finishing at the other elevator.",
    "Take the other elevator to floor 3.",
    "Inspect both kitchens on floor 3, moving from the other-elevator side toward the Workbar elevator.",
    "Take the Workbar elevator to floor 4.",
    "Inspect both kitchens on floor 4, moving from the Workbar-elevator side toward the other elevator.",
    "Take the other elevator to floor 5 and inspect the kitchen on that side.",
    "Never pass through the office that separates the two sides of floor 5.",
    "Take the other elevator back to floor 4, return to the Workbar elevator without repeating the completed kitchen inspection, and take the Workbar elevator to floor 5.",
    "Inspect the kitchen closest to the Workbar elevator.",
    "Return to Workbar using the Workbar elevator.",
  ],
  scope: {
    floors: [2, 3, 4, 5],
    kitchensPerFloor: 2,
    kitchenTypesPerFloor: ["large", "small"],
    totalKitchens: 8,
    officeAreasIncluded: false,
    floor5SeparatingOffice: "explicitly_excluded_never_pass_through",
  },
  collect: [
    "cappuccino cups", "espresso cups", "cocktail glasses", "wine glasses", "beer glasses", "coffee cups",
    "other glassware or serviceware belonging to Workbar/Café",
    "such equipment present in excess of what belongs on the office floor",
  ],
  sorting: {
    clean: "Return directly to the correct shelf or fixed place.",
    dirty: "Take to the prep kitchen, wash, and return to the correct place.",
    cleanSurplus: "Return to the correct prep-kitchen storage when not needed in active service.",
    cleanDirtyNeverMixedInSameTray: true,
  },
  timing: {
    opening: { performAtAnyAppropriatePoint: true, completeNoLaterThanLocalTime: "10:45" },
    closingDailyRecovery: { after: ["lunch service", "staff lunch"], normalTargetLocalTimeApprox: "13:30" },
  },
  responsibility: { performer: "responsible person for the shift", designedForPeople: 1 },
  completion: {
    requiredState: "full configured Workbar default stock of cups, glasses and relevant serviceware physically restored",
    completingWalkAloneIsSufficient: false,
    missingEquipmentActions: ["find", "wash if dirty", "return to correct position"],
    openingWorkerArrivalState: "fully prepared Workbar",
  },
  unavailableArea: {
    wait: false,
    bypassAccessControl: false,
    actions: ["notify manager", "record the specific inaccessible area as a deviation", "continue the remainder of the route"],
    defaultRestorationRequirementRemains: true,
  },
  referenceMedia: { mandatoryImage: false, mandatoryRouteDiagram: false, logicalImageBlocker: false },
});

const STANDARDS = [
  [WORKBAR_MILK_FRIDGE_STANDARD_KEY, workbarMilkFridgeStandard.displayName, "object", "manual", workbarMilkFridgeStandard, workbarMilkFridgeStandard.provenance],
  ["workbar-coffee-canister-assigned-target", "Workbar-assigned Coffee Canisters target", "object", "manual", WORKBAR_CANISTER_TARGET],
  ["baked-goods-daily", "Baked goods daily", "object", "manual", { requiredEveryDay: true }],
  ["self-service-fixed-components", "Self-service fixed components", "list", "manual", SELF_SERVICE_COMPONENTS],
  ["self-service-overnight-policy", "Self-service overnight policy", "list", "manual", OVERNIGHT_POLICY],
  ["coffee-cups-full-target", "Coffee cups full visual layout", "object", "manual", COFFEE_CUP_LAYOUT],
  ["coffee-cups-service-ready-target", "Coffee cups service-ready visual layout", "object", "manual", COFFEE_CUP_LAYOUT],
  ["wine-glasses-full-target", "Wine glasses full visual layout", "object", "manual", WINE_GLASS_LAYOUT],
  ["wine-glasses-service-ready-target", "Wine glasses service-ready visual layout", "object", "manual", WINE_GLASS_LAYOUT],
  ["self-service-tea-slot-names", "Six named loose-leaf tea slots", "list", "manual", TEA_SLOT_NAMES],
  ["serviceware-office-recovery-route-confirmation", "Serviceware office recovery route confirmation", "object", "location_set", SERVICEWARE_RECOVERY_ROUTE, "Authoritative serviceware route supplied by Robert on 2026-08-09."],
  ["door-and-lock-rules", "Door and lock rules", "object", "manual", DOOR_AND_LOCK_RULES],
  ["fridge-closing-rules", "Fridge closing rules", "object", "manual", FRIDGE_CLOSING_RULES],
  ["cornerbar-operating-standard", "Cornerbar Operating Standard", "object", "manual", CORNERBAR_OPERATING_STANDARD],
].map(([key, label, valueType, sourceKind, currentValue, revisionReason]) => ({
  key, label, description: currentValue === undefined ? "Unresolved publication and readiness blocker." : null,
  valueType, sourceKind, ...(currentValue === undefined ? {} : { currentRevision: { value: currentValue, reason: revisionReason || "Approved Mesh operational standards amendment 2026-08-07." } }),
}));

const REFERENCES = [
  ["workbar-cleaning-station-opening", "Workbar cleaning station opening", ["O07"]],
  ["members-lounge-coffee-point", "Members lounge coffee point", ["O10", "O11", "O26"]],
  ["workbar-food-non-alcoholic-fridge", "Workbar food and non-alcoholic fridge", ["O13", "C08", "C28"]],
  ["workbar-milk-fridge", "Workbar Milk Fridge", ["O09", "C09", "C29"]],
  ["self-service-opening-standard", "Self-service opening standard", ["O14"]],
  ["self-service-overnight-standard", "Self-service overnight standard", ["C07", "C32"]],
  ["project-room-standard", "Project-room standard", ["O16", "O31", "C04"]],
  ["workbar-standard-layout", "Workbar standard layout", ["O23", "O25", "O29", "O35", "C05", "C14", "C22"]],
  ["atrium-standard-layout", "Atrium standard layout", ["O23", "O25", "C05", "C14", "C22"]],
  ["coffee-canister-lunch-reserve", "Coffee Canisters lunch reserve", ["O06", "O28", "O34"]],
  ["coffee-canister-rinsed-storage", "Coffee Canisters rinsed storage", ["C06", "C17"]],
  ["ordinary-coffee-cup-layout", "Ordinary coffee-cup layout", ["O15", "O29", "O35", "C27"]],
  ["cappuccino-cup-shelf-layout", "Cappuccino-cup shelf layout", ["O15", "O29", "O35", "C27"]],
  ["cappuccino-and-espresso-machine-top-layout", "Cappuccino and espresso machine-top layout", ["O15", "O29", "O35", "C27"]],
  ["wine-glass-layout", "Wine-glass layout", ["O15", "O29", "O35", "C27"]],
  ["workbar-bar-left-fridge", "Workbar Bar Left fridge", ["C10", "C30", "C33"]],
  ["workbar-bar-right-fridge", "Workbar Bar Right fridge", ["C10", "C30", "C33"]],
  ["cornerbar-left-fridge", "Cornerbar Left fridge", ["C10", "C30", "C33"]],
  ["cornerbar-middle-fridge", "Cornerbar Middle fridge", ["C10", "C30", "C33"]],
  ["cornerbar-right-fridge", "Cornerbar Right fridge", ["C10", "C30", "C33"]],
  ["cornerbar-glass-layout", "Cornerbar glass layout", ["C20", "C41"]],
  ["cornerbar-bar-equipment-storage", "Cornerbar bar-equipment storage", ["C20"]],
  ["cornerbar-final-reset", "Cornerbar final reset", ["C20", "C41"]],
  ["cornerbar-street-door", "Cornerbar street door", ["C42", "C43"]],
  ["cornerbar-closed-lighting-standard", "Cornerbar closed lighting standard", ["C40"]],
  ["opened-wine-date-label", "Opened wine date label", ["C11", "C31"]],
  ["cleaning-station-final-close", "Cleaning station final close", ["C13"]],
  ["coffee-machine-night-state", "Coffee machine night state", ["C18"]],
  ["milk-system-cleaning-parts", "Milk-system cleaning parts", ["C19"]],
  ["bar-equipment-storage", "Bar equipment storage", ["C20"]],
  ["beer-tap-parts", "Beer-tap parts", ["C20"]],
  ["beer-drip-trays", "Beer drip trays", ["C20"]],
  ["workbar-dishwasher-night-state", "Workbar dishwasher night state", ["C23"]],
  ["kitchen-dishwasher-night-state", "Kitchen dishwasher night state", ["C24"]],
  ["device-charging-station", "Device charging station", ["C37"]],
  ["workbar-screen-night-state", "Workbar screen night state", ["C39"]],
  ["closed-lighting-preset", "Closed lighting preset", ["C40"]],
  ["closing-door-check", "Closing door check", ["C42"]],
  ["cornerbar-upper-security-lock", "Cornerbar upper security lock", ["C42"]],
  ["salto-closing-status", "Salto closing status", ["C43"]],
].map(([key, label, taskIds]) => ({ key, label, description: `Placeholder reference for ${label}.`, placeholderText: "Referansebilde kommer", buttonLabel: "Vis hvordan det skal se ut", taskIds }));

const UNRESOLVED = [];

const SECTION_CONFIG = {
  O: [
    { key: "opening-07-08", title: "Opening 07:00–08:00", phaseType: "startup", taskRange: [1, 23] },
    { key: "opening-08-10", title: "Opening 08:00–10:00", phaseType: "service", taskRange: [24, 29] },
    { key: "opening-10-11", title: "Opening 10:00–11:00", phaseType: "checkpoint", taskRange: [30, 37] },
  ],
  C: [
    { key: "closing-15-18", title: "Closing 15:00–18:00", phaseType: "preclose", taskRange: [1, 15] },
    { key: "closing-18-19", title: "Closing 18:00–19:00", phaseType: "final_close", taskRange: [16, 46] },
  ],
};

const TASK_LOCATION_SETS = {
  O15: "serviceware-recovery-route", O16: "opening-project-rooms", O19: "active-audio-zones", O31: "opening-project-rooms", O32: "workbar-public-toilets",
  C03: "serviceware-recovery-route", C04: "closing-project-rooms", C10: "all-operational-fridges", C15: "active-service-zones", C27: "serviceware-recovery-route",
  C30: "all-operational-fridges", C33: "all-operational-fridges", C38: "active-audio-zones", C41: "final-guest-area-sweep", C42: "closing-door-check",
};

const TASK_LOCATIONS = {
  O03: "coffee-machine", O04: "workbar-dishwashers", O05: "kitchen-dishwashers", O07: "cleaning-station", O09: "workbar-milk-fridge",
  O10: "members-lounge", O11: "members-lounge", O13: "workbar-non-alcoholic-fridge", O14: "self-service-counter", O17: "register", O20: "workbar-screen",
  C13: "cleaning-station", C18: "coffee-machine", C23: "workbar-dishwashers", C24: "kitchen-dishwashers", C29: "workbar-milk-fridge",
  C32: "self-service-counter", C35: "register", C37: "device-charging-station", C39: "workbar-screen", C43: "salto-control",
};

const TIMING = {
  O15: { targetLocalTime: "10:45:00", hardDeadlineLocalTime: "10:45:00" },
  O23: { targetLocalTime: "08:00:00" },
  O29: { visibleFromLocalTime: "09:35:00", startFromLocalTime: "09:40:00", targetLocalTime: "09:45:00", overdueLocalTime: "09:55:00" },
  O35: { visibleFromLocalTime: "10:35:00", startFromLocalTime: "10:40:00", targetLocalTime: "10:45:00", overdueLocalTime: "10:50:00", hardDeadlineLocalTime: "10:55:00" },
  O37: { targetLocalTime: "11:00:00" },
  C14: { visibleFromLocalTime: "17:35:00", startFromLocalTime: "17:35:00", targetLocalTime: "17:45:00", overdueLocalTime: "17:55:00" },
};

const CONDITIONS = {
  O22: { fact: "organization_flag", key: "seasonal_candles", operator: "equals", value: true },
  C19: { fact: "weekday", operator: "in", value: ["wednesday", "friday"] },
};

const TASK_TYPE_OVERRIDES = Object.freeze({ C15: "gate" });

const AVAILABILITY_MODE_OVERRIDES = Object.freeze({
  O15: "immediate",
  O22: "condition",
  O23: "immediate",
  O29: "time_window",
  O35: "time_window",
  O37: "after_task",
  C14: "time_window",
  C19: "condition",
});

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function normalizedLines(value) { return value.replaceAll("\r\n", "\n").split("\n").map((line) => line.replace(/^ {4}/, "")); }
function sectionText(block, heading, nextHeadings, level = 3) {
  const lines = normalizedLines(block);
  const marker = "#".repeat(level);
  const start = lines.findIndex((line) => line.trim() === `${marker} ${heading}`);
  if (start < 0) return "";
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (nextHeadings.some((next) => lines[index].trim() === `${marker} ${next}`)) { end = index; break; }
  }
  return lines.slice(start + 1, end).join("\n").trim().replace(/\n\n---\s*$/, "");
}
function bullets(value) {
  const result = [];
  for (const rawLine of value.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("- ")) result.push(line.slice(2).trim());
    else if (line && result.length) result[result.length - 1] += ` ${line}`;
  }
  return result;
}
function parseItems(value, taskId) {
  return bullets(value).map((entry, sortOrder) => {
    const match = entry.match(/^`([^`]+)`\s*(?:—|-)?\s*(.*)$/);
    if (!match) throw new Error(`${taskId}: structured item lacks a backticked stable key: ${entry}`);
    const label = match[2] || match[1].replaceAll("_", " ");
    if (label.length > 300) throw new Error(`${taskId}/${match[1]} label exceeds 300 characters.`);
    return { key: match[1], label, itemType: inferItemType(match[1], label), required: true, sourceKind: "static", sourceConfig: {}, inputSchema: inferInputSchema(match[1], label), sortOrder, metadata: { sourceText: entry } };
  });
}
function inferItemType(key, label) {
  const text = `${key} ${label}`.toLowerCase();
  if (/count|quantity|number|amount|inventory/.test(text)) return "count";
  if (/time|date|expected|owner|responsib|reason|constraint|note|summary|details|route|zones|room_use/.test(text)) return "text";
  if (/status|state|result|outcome/.test(text)) return "status";
  if (/room|location|area|zone/.test(text)) return "location";
  if (/asset|ipad|terminal|device|equipment|part/.test(text)) return "asset";
  return "check";
}
function inferInputSchema(key, label) {
  const type = inferItemType(key, label);
  if (type === "count") return { type: "integer", minimum: 0 };
  if (type === "check") return { type: "boolean" };
  return { type: "string", minLength: 1, maxLength: 1000 };
}
function metadataValue(block, label) {
  const lines = normalizedLines(block);
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(`^\\s*\\*\\*${escaped}:\\*\\*\\s*\\x60?([^\\x60]+?)\\x60?\\s*$`, "i");
  return lines.map((line) => line.match(matcher)?.[1]?.trim()).find(Boolean) || null;
}
function normalizePolicy(value) { return value?.replaceAll("-", "_").replaceAll(" ", "_").toLowerCase(); }
function sourceTypeToTaskType(sourceType) { return sourceType === "conditional" ? "action" : sourceType; }
function applyItemSources(task) {
  const inventoryItemKeys = new Set(INVENTORY_ITEM_BINDINGS[task.id] || []);
  const cornerbarInventoryItemKeys = new Set(CORNERBAR_INVENTORY_ITEM_BINDINGS[task.id] || []);
  const assetRegistryItemKeys = new Set(ASSET_REGISTRY_ITEM_BINDINGS[task.id] || []);
  for (const item of task.items) {
    const text = `${item.key} ${item.label}`.toLowerCase();
    let standardKey = null;
    if (["O09", "C09", "C29"].includes(task.id) && /(milk|oat|fridge|standard)/.test(text)) standardKey = "workbar-milk-fridge-target";
    if (["O06", "O11", "O28", "O34"].includes(task.id) && /(canister|reserve|ready|coffee)/.test(text)) standardKey = "workbar-coffee-canister-assigned-target";
    if (["O12"].includes(task.id) && /baked/.test(text)) standardKey = "baked-goods-daily";
    if (task.id === "O14") standardKey = /tea/.test(text) ? "self-service-tea-slot-names" : "self-service-fixed-components";
    if (task.id === "C32") standardKey = /tea/.test(text) ? "self-service-tea-slot-names" : "self-service-overnight-policy";
    if (["O15", "C27"].includes(task.id) && /coffee.*cup|cup/.test(text)) standardKey = "coffee-cups-full-target";
    if (["O15", "C27"].includes(task.id) && /wine.*glass|glass/.test(text)) standardKey = "wine-glasses-full-target";
    if (["O29", "O35"].includes(task.id) && /coffee.*cup|cup/.test(text)) standardKey = "coffee-cups-service-ready-target";
    if (["O29", "O35"].includes(task.id) && /wine.*glass|glass/.test(text)) standardKey = "wine-glasses-service-ready-target";
    if (task.id === "C17" && /(canister|workbar|assigned|account|part)/.test(text)) standardKey = "workbar-coffee-canister-assigned-target";
    if (task.id === "C33") standardKey = "fridge-closing-rules";
    if (task.id === "C42") standardKey = "door-and-lock-rules";
    if (standardKey) { item.sourceKind = "routine_standard"; item.standardKey = standardKey; item.sourceConfig = {}; }
    if (inventoryItemKeys.has(item.key)) {
      delete item.standardKey;
      delete item.locationSetKey;
      item.sourceKind = "inventory_readonly";
      item.sourceConfig = {
        ...WORKBAR_NON_ALCO_LOCATION_STANDARD_SOURCE,
        locationCodes: [...WORKBAR_NON_ALCO_LOCATION_STANDARD_SOURCE.locationCodes],
      };
    }
    if (cornerbarInventoryItemKeys.has(item.key)) {
      delete item.standardKey;
      delete item.locationSetKey;
      item.sourceKind = "inventory_readonly";
      item.sourceConfig = {
        mode: "location_standards",
        locationCodes: [CORNERBAR_LOCATION_CODE_BY_ITEM[item.key]],
        activeOnly: true,
      };
    }
    if (assetRegistryItemKeys.has(item.key)) {
      delete item.standardKey;
      delete item.locationSetKey;
      item.sourceKind = "asset_registry_readonly";
      item.sourceConfig = { ...REQUIRED_CLOSING_ASSET_SOURCE };
    }
  }
  for (const itemKey of inventoryItemKeys) {
    if (!task.items.some((item) => item.key === itemKey)) throw new Error(`${task.id}/${itemKey}: explicit inventory source binding was not found.`);
  }
  for (const itemKey of cornerbarInventoryItemKeys) {
    if (!task.items.some((item) => item.key === itemKey)) throw new Error(`${task.id}/${itemKey}: Cornerbar location-standard source binding was not found.`);
  }
  for (const itemKey of assetRegistryItemKeys) {
    if (!task.items.some((item) => item.key === itemKey)) throw new Error(`${task.id}/${itemKey}: explicit asset-registry source binding was not found.`);
  }
  if (TASK_LOCATION_SETS[task.id]) {
    const routeItem = task.items.find((item) => /location|route|room|fridge|door|sweep|area|zone/.test(`${item.key} ${item.label}`.toLowerCase()));
    if (routeItem && routeItem.sourceKind === "static") { routeItem.sourceKind = "location_set"; routeItem.locationSetKey = TASK_LOCATION_SETS[task.id]; routeItem.sourceConfig = {}; }
  }
}
function parseRoutine(source, prefix) {
  const matcher = new RegExp(`^## ${prefix}(\\d{2}) — ([^\\n]+)\\n([\\s\\S]*?)(?=^## ${prefix}\\d{2} — |$(?![\\s\\S]))`, "gm");
  const tasks = [];
  let match;
  while ((match = matcher.exec(source)) !== null) {
    const id = `${prefix}${match[1]}`;
    const block = match[0].trim();
    const sourceType = normalizePolicy(metadataValue(block, "Type"));
    const instructions = sectionText(block, "Employee instruction", ["Structured task items", "Done when", "Deviation and blocking rules", "Reference guidance", "Dependencies and relations"]);
    const structuredItemsText = sectionText(block, "Structured task items", ["Done when", "Deviation and blocking rules", "Reference guidance", "Dependencies and relations"]);
    const doneCriteriaText = sectionText(block, "Done when", ["Deviation and blocking rules", "Reference guidance", "Dependencies and relations"]);
    const deviationRulesText = sectionText(block, "Deviation and blocking rules", ["Reference guidance", "Dependencies and relations"]);
    const referenceGuidanceText = sectionText(block, "Reference guidance", ["Dependencies and relations"]);
    const taskNumber = Number(match[1]);
    const section = SECTION_CONFIG[prefix].find((entry) => taskNumber >= entry.taskRange[0] && taskNumber <= entry.taskRange[1]);
    const task = {
      id, taskKey: `${prefix.toLowerCase()}${match[1]}-${metadataValue(block, "Stable key").split(".").slice(2).join("-")}`,
      stableKey: metadataValue(block, "Stable key"), title: match[2].trim(), sectionKey: section.key,
      sourceType, taskType: TASK_TYPE_OVERRIDES[id] || sourceTypeToTaskType(sourceType), criticality: normalizePolicy(metadataValue(block, "Criticality")),
      mandatory: metadataValue(block, "Mandatory") === "true", initialAssessmentPolicy: normalizePolicy(metadataValue(block, "Initial assessment policy")),
      completionPolicy: normalizePolicy(metadataValue(block, "Completion policy")), notApplicablePolicy: normalizePolicy(metadataValue(block, "Not-applicable policy")),
      verificationPolicy: normalizePolicy(metadataValue(block, "Verification policy")), repeatPolicy: normalizePolicy(metadataValue(block, "Repeat policy")),
      timingText: metadataValue(block, "Timing"), locationDescription: metadataValue(block, "Location"), instructions,
      structuredItemsText, items: parseItems(structuredItemsText, id), doneCriteriaText, deviationRulesText, referenceGuidanceText,
      availabilityMode: AVAILABILITY_MODE_OVERRIDES[id] || (sourceType === "continuous" ? "continuous" : "immediate"),
      condition: CONDITIONS[id] || {}, timing: TIMING[id] || {}, locationKey: TASK_LOCATIONS[id] || null, locationSetKey: TASK_LOCATION_SETS[id] || null,
      metadata: { authoritativeSourceId: id, sourceType, deviationRules: bullets(deviationRulesText), referenceGuidance: bullets(referenceGuidanceText), timingSourceText: metadataValue(block, "Timing") },
      sourceHash: sha256(block),
    };
    applyItemSources(task);
    tasks.push(task);
  }
  return tasks;
}

function amendedItem(key, label, { standardKey = null, locationSetKey = null, sourceKind = null, sourceConfig = {} } = {}, sortOrder = 0) {
  const resolvedSourceKind = sourceKind || (standardKey ? "routine_standard" : locationSetKey ? "location_set" : "static");
  return {
    key, label, itemType: inferItemType(key, label), required: true, sourceKind: resolvedSourceKind, sourceConfig,
    ...(standardKey ? { standardKey } : {}), ...(locationSetKey ? { locationSetKey } : {}),
    inputSchema: inferInputSchema(key, label), sortOrder, metadata: { sourceText: `\`${key}\` — ${label}` },
  };
}
function setTaskItems(task, items) { task.items = items.map((item, index) => amendedItem(item[0], item[1], item[2], index)); }
function addTaskItem(task, key, label, options = {}) {
  if (task.items.some((item) => item.key === key)) return;
  task.items.push(amendedItem(key, label, options, task.items.length));
}
function appendTaskText(task, field, text) { if (!task[field].includes(text)) task[field] = `${task[field]}\n\n${text}`.trim(); }
function replaceTaskText(task, field, from, to) {
  if (!task[field].includes(from)) throw new Error(`${task.id}/${field}: expected amendment source text is missing: ${from}`);
  task[field] = task[field].replace(from, to);
}
function finalizeTaskAmendment(task, amendmentDecisionHash) {
  task.items.forEach((item, sortOrder) => { item.sortOrder = sortOrder; item.metadata.sourceText = `\`${item.key}\` — ${item.label}`; });
  task.structuredItemsText = task.items.map((item) => `- \`${item.key}\` — ${item.label}`).join("\n");
  task.metadata.deviationRules = bullets(task.deviationRulesText);
  task.metadata.referenceGuidance = bullets(task.referenceGuidanceText);
  task.metadata.operationalStandardsAmendment = { date: "2026-08-07", decisionHash: amendmentDecisionHash };
  task.sourceHash = sha256(canonical({ originalSourceHash: task.sourceHash, title: task.title, instructions: task.instructions, structuredItemsText: task.structuredItemsText, doneCriteriaText: task.doneCriteriaText, deviationRulesText: task.deviationRulesText, referenceGuidanceText: task.referenceGuidanceText, amendmentDecisionHash }));
}
function applyOperationalStandardsAmendment(openingTasks, closingTasks, amendmentDecisionHash) {
  const tasks = new Map([...openingTasks, ...closingTasks].map((task) => [task.id, task]));
  const touched = new Set();
  const task = (id) => { const value = tasks.get(id); if (!value) throw new Error(`Missing task for operational amendment: ${id}`); touched.add(id); return value; };

  {
    const value = task("O09");
    appendTaskText(value, "instructions", "The fridge remains unlocked in the old small wine cabinet in Workbar bar. Keep 2 regular milk and 2 Oatly on the top shelf, reserve the remaining standing space for opened wine bottles, and physically close the door.");
    addTaskItem(value, "opened_wine_standing_space_reserved", "remaining standing space reserved for opened wine bottles", { standardKey: "fridge-closing-rules" });
    addTaskItem(value, "fridge_remains_unlocked", "fridge remains unlocked", { standardKey: "fridge-closing-rules" });
    appendTaskText(value, "doneCriteriaText", "- The remaining standing space is reserved for opened wine bottles.\n- The door is physically closed and the fridge remains unlocked.");
  }
  {
    const value = task("O13");
    appendTaskText(value, "instructions", "This fridge is never locked. Pull the grille fully up for Opening and physically verify the grille position and closed fridge door.");
    addTaskItem(value, "fridge_remains_unlocked", "food and non-alcoholic fridge remains unlocked", { standardKey: "fridge-closing-rules" });
    addTaskItem(value, "grille_fully_up", "grille pulled fully up for Opening", { standardKey: "fridge-closing-rules" });
    appendTaskText(value, "doneCriteriaText", "- The fridge remains unlocked and the grille is fully up for service.");
  }
  {
    const value = task("O14");
    replaceTaskText(value, "instructions", "restore every required component before completion.", "restore every required component before completion, including the six tea positions in their approved order.");
    const tea = value.items.find((item) => item.key === "six_named_loose_leaf_tea_slots");
    tea.label = "Peppermynte, Chai Masala, Earl Grey Fransk, Bestemors Frukthave, Sencha and Rooibos Chile in this exact order";
    tea.metadata.sourceText = `\`${tea.key}\` — ${tea.label}`;
    replaceTaskText(value, "doneCriteriaText", "All six tea positions are filled with manager-approved names once configured.", "All six tea positions are filled in this order: Peppermynte, Chai Masala, Earl Grey Fransk, Bestemors Frukthave, Sencha, Rooibos Chile.");
    replaceTaskText(value, "deviationRulesText", "Tea-slot names are unresolved at publication time.", "Tea-slot names or order do not match the approved standard.");
  }
  {
    const value = task("O15");
    value.title = "Restore coffee cups and wine glasses to their full visual layouts";
    value.instructions = "Physically check coffee cups and wine glasses against their structured visual layouts. Fill every defined position with the correct type. Ordinary coffee cups are four high with handles right; cappuccino cups fill shelf and coffee-machine-top positions; espresso cups fill machine-top positions. Locate, wash and return missing items. Items still in washing are not ready. Search every approved recovery point, including office floors only after the complete route is manager-approved.";
    setTaskItems(value, [
      ["coffee_cups_full_layout", "all defined coffee-cup positions filled", { standardKey: "coffee-cups-full-target" }],
      ["ordinary_cups_four_high", "ordinary coffee cups stacked four high", { standardKey: "coffee-cups-full-target" }],
      ["ordinary_cup_handles_right", "ordinary coffee-cup handles point right", { standardKey: "coffee-cups-full-target" }],
      ["cappuccino_shelf_positions_filled", "all defined cappuccino shelf positions filled", { standardKey: "coffee-cups-full-target" }],
      ["cappuccino_machine_top_positions_filled", "all defined cappuccino machine-top positions filled", { standardKey: "coffee-cups-full-target" }],
      ["espresso_machine_top_positions_filled", "all defined espresso machine-top positions filled", { standardKey: "coffee-cups-full-target" }],
      ["coffee_cups_in_washing", "coffee cups still in washing; must be zero before readiness", { standardKey: "coffee-cups-full-target" }],
      ["coffee_cups_unlocated", "unlocated coffee cups; must be zero", { standardKey: "coffee-cups-full-target" }],
      ["wine_glasses_full_layout", "all defined wine-glass positions filled with the correct type and layout", { standardKey: "wine-glasses-full-target" }],
      ["wine_glasses_in_washing", "wine glasses still in washing; must be zero before readiness", { standardKey: "wine-glasses-full-target" }],
      ["wine_glasses_unlocated", "unlocated wine glasses; must be zero", { standardKey: "wine-glasses-full-target" }],
      ["recovery_route_checked", "known recovery points checked; complete office-floor route remains unresolved", { locationSetKey: "serviceware-recovery-route" }],
    ]);
    value.doneCriteriaText = "- Arrival assessment is recorded separately for cups and glasses.\n- Every defined cup and glass position matches its visual layout.\n- Ordinary cups are four high with handles right.\n- Cappuccino shelf/machine-top and espresso machine-top positions are filled.\n- Items in washing and unlocated items are zero.\n- Missing items were located, washed and returned.\n- Required approved recovery points were physically checked.";
    value.deviationRulesText = "- Complete office-floor recovery route unresolved — publication blocker.\n- Any defined layout position remains empty or contains the wrong type.\n- Any required item remains in washing or unlocated.\n- Broken, lost or damaged serviceware.\n- Do not guess office-floor recovery points or mark missing items complete.";
    value.referenceGuidanceText = "- `ordinary-coffee-cup-layout`.\n- `cappuccino-cup-shelf-layout`.\n- `cappuccino-and-espresso-machine-top-layout`.\n- `wine-glass-layout`.\n- Previous Closing evidence is context only and never completes this Opening task.";
  }
  for (const id of ["O29", "O35"]) {
    const value = task(id);
    const time = id === "O29" ? "09:45" : "10:45";
    const predecessor = id === "O29" ? "O27" : "O33";
    replaceTaskText(value, "instructions", id === "O29" ? "At the checkpoint, physically assess every listed category." : "Perform the final full physical restock before lunch.", `${id === "O29" ? "At the checkpoint" : "Before lunch"}, perform a new ${time} physical assessment of every listed category and both cup/glass visual layouts.`);
    const cup = value.items.find((item) => item.key === "coffee_cups_service_ready_target");
    const wine = value.items.find((item) => item.key === "wine_glasses_service_ready_target");
    cup.label = "new physical check: full coffee-cup visual layout, with no inherited completion";
    wine.label = "new physical check: full wine-glass visual layout, with no inherited completion";
    addTaskItem(value, "ordinary_cups_four_high_handles_right", "ordinary cups four high with handles right", { standardKey: "coffee-cups-service-ready-target" });
    addTaskItem(value, "cappuccino_shelf_and_machine_top_filled", "cappuccino shelf and machine-top positions filled", { standardKey: "coffee-cups-service-ready-target" });
    addTaskItem(value, "espresso_machine_top_filled", "espresso machine-top positions filled", { standardKey: "coffee-cups-service-ready-target" });
    replaceTaskText(value, "doneCriteriaText", "Configured service-ready cup and glass targets are met.", "Coffee-cup and wine-glass service-ready layouts exactly match their full visual layouts after a new physical check.");
    replaceTaskText(value, "deviationRulesText", id === "O29" ? "Service-ready cup or glass targets are unresolved — publication blocker." : "Service-ready targets unresolved — publication blocker.", "Any defined cup/glass position is empty, has the wrong type, or still depends on washing; service-ready is not a lower minimum.");
    appendTaskText(value, "doneCriteriaText", `- ${predecessor} is system-completed only after this independent ${time} checkpoint succeeds; earlier completion is never inherited.`);
    value.referenceGuidanceText = "- `ordinary-coffee-cup-layout`.\n- `cappuccino-cup-shelf-layout`.\n- `cappuccino-and-espresso-machine-top-layout`.\n- `wine-glass-layout`.\n- `workbar-food-non-alcoholic-fridge`.\n- `workbar-milk-fridge`.\n- `coffee-canister-lunch-reserve`.";
  }
  {
    const value = task("O37");
    addTaskItem(value, "workbar_assigned_canisters_four_ready", "four Workbar-assigned Coffee Canisters ready in the 1 + 3 service distribution", { standardKey: "workbar-coffee-canister-assigned-target" });
    addTaskItem(value, "cornerbar_event_scope_ready_or_transferred", "Cornerbar event scope ready or formally transferred with evidence", { standardKey: "cornerbar-operating-standard" });
    appendTaskText(value, "doneCriteriaText", "- Any active Cornerbar scope is physically ready or formally transferred with evidence; it is never assumed or marked N/A.");
    value.referenceGuidanceText = "- This is an aggregate gate; use the task-specific references rather than a generic image.\n- Previous Closing evidence remains context and never auto-completes Opening.\n- O29 and O35 remain independent physical checkpoints.";
  }
  for (const id of ["C10", "C30"]) {
    const value = task(id);
    addTaskItem(value, "universal_fridge_key_and_physical_lock_rule", "universal fridge-key rule and physical lock verification", { standardKey: "fridge-closing-rules" });
    addTaskItem(value, "cornerbar_operating_scope", "Cornerbar fridge scope follows the Cornerbar Operating Standard", { standardKey: "cornerbar-operating-standard" });
    appendTaskText(value, "instructions", id === "C10" ? "This is pre-restock only and cannot complete the fresh final restock. Event-active Cornerbar fridge work is transferred per fridge scope with evidence, never marked N/A." : "Use universal keys for the three Cornerbar fridges. This fresh final restock does not inherit pre-restock; event-active work requires scope-specific transfer and final physical evidence.");
    appendTaskText(value, "doneCriteriaText", "- Each Cornerbar fridge has its own current result; transfer/evidence is scoped per fridge when event-active.");
  }
  {
    const value = task("C17");
    value.title = "Recover, clean and account for the four Workbar-assigned Coffee Canisters";
    value.instructions = "Physically locate the four Coffee Canisters assigned to Workbar. Empty old coffee, clean each canister and required part, leave it complete and dry or stored under the approved procedure, then return it to the fixed Coffee Canister cupboard in Workbar bar. Coffee Canisters elsewhere in hospitality are outside this task's accountability.";
    setTaskItems(value, [
      ["workbar_assigned_canisters", "exactly four Coffee Canisters assigned to Workbar", { standardKey: "workbar-coffee-canister-assigned-target" }],
      ["physically_located_count", "physically located Workbar-assigned Coffee Canisters", { standardKey: "workbar-coffee-canister-assigned-target" }],
      ["old_coffee_removed", "old coffee emptied from all four", { standardKey: "workbar-coffee-canister-assigned-target" }],
      ["clean_and_complete", "all four cleaned and complete with required parts", { standardKey: "workbar-coffee-canister-assigned-target" }],
      ["dry_or_approved_storage", "all four dry or stored under the approved procedure", { standardKey: "workbar-coffee-canister-assigned-target" }],
      ["returned_to_workbar_cupboard", "all four returned to the fixed Workbar bar Coffee Canister cupboard", { standardKey: "workbar-coffee-canister-assigned-target" }],
      ["missing_workbar_canisters", "missing Workbar-assigned Coffee Canisters; must be zero", { standardKey: "workbar-coffee-canister-assigned-target" }],
      ["event_transfer_evidence", "completed transfer evidence when one of the four remains in authorized event use", { standardKey: "workbar-coffee-canister-assigned-target" }],
    ]);
    value.doneCriteriaText = "- Exactly the four Workbar-assigned Coffee Canisters are accounted for.\n- No old coffee remains.\n- All four are clean, complete and dry or stored under the approved procedure.\n- All four are returned to the fixed Workbar bar cupboard, except a canister with completed authorized event-transfer evidence.\n- Missing count is zero.";
    value.deviationRulesText = "- Any of the four Workbar-assigned Coffee Canisters or required parts is missing or damaged.\n- Old coffee cannot be removed or cleaning cannot be completed.\n- Approved storage condition cannot be met.\n- Event transfer is incomplete or unsupported.\n- Do not include other hospitality Coffee Canisters to satisfy the four-item scope.";
    value.referenceGuidanceText = "- `coffee-canister-rinsed-storage` — fixed Workbar bar cupboard and approved stored state.";
  }
  {
    const value = task("C20");
    addTaskItem(value, "cornerbar_bar_equipment_returned", "Cornerbar bar equipment returned to approved storage", { standardKey: "cornerbar-operating-standard" });
    addTaskItem(value, "cornerbar_beer_parts_and_drip_trays_returned", "Cornerbar beer-tap parts and drip trays clean, dry and returned", { standardKey: "cornerbar-operating-standard" });
    appendTaskText(value, "instructions", "Apply the Cornerbar Operating Standard when Cornerbar is in scope. Event-active equipment is transferred by named scope and requires final physical completion evidence; it is not N/A.");
    appendTaskText(value, "referenceGuidanceText", "- `cornerbar-bar-equipment-storage`.\n- `cornerbar-final-reset`.");
  }
  {
    const value = task("C27");
    value.title = "Complete final serviceware recovery and visual-layout accountability";
    value.instructions = "Perform the final physical recovery and layout check. Search every approved recovery point, including office floors only after the complete route is manager-approved. Locate, wash and return missing items. Coffee cups and wine glasses are separate evidence lines. Every defined layout position must be filled with the correct type; items still in washing are not ready. Event-held items require completed transfer evidence and never become an artificial numeric total.";
    setTaskItems(value, [
      ["coffee_cups_full_layout", "final coffee-cup visual layout physically complete", { standardKey: "coffee-cups-full-target" }],
      ["ordinary_cups_four_high_handles_right", "ordinary cups four high with handles right", { standardKey: "coffee-cups-full-target" }],
      ["cappuccino_shelf_and_machine_top_filled", "cappuccino shelf and machine-top positions filled", { standardKey: "coffee-cups-full-target" }],
      ["espresso_machine_top_filled", "espresso machine-top positions filled", { standardKey: "coffee-cups-full-target" }],
      ["coffee_cups_in_washing", "coffee cups still in washing; must be zero for ordinary final Closing", { standardKey: "coffee-cups-full-target" }],
      ["coffee_cups_transferred_with_evidence", "coffee-cup event scope transferred with completed evidence", { standardKey: "coffee-cups-full-target" }],
      ["coffee_cups_unlocated", "unlocated coffee cups; must be zero", { standardKey: "coffee-cups-full-target" }],
      ["wine_glasses_full_layout", "final wine-glass visual layout physically complete", { standardKey: "wine-glasses-full-target" }],
      ["wine_glasses_in_washing", "wine glasses still in washing; must be zero for ordinary final Closing", { standardKey: "wine-glasses-full-target" }],
      ["wine_glasses_transferred_with_evidence", "wine-glass event scope transferred with completed evidence", { standardKey: "wine-glasses-full-target" }],
      ["wine_glasses_unlocated", "unlocated wine glasses; must be zero", { standardKey: "wine-glasses-full-target" }],
      ["full_recovery_route_checked", "approved recovery route physically checked; office-floor completion remains unresolved", { locationSetKey: "serviceware-recovery-route" }],
    ]);
    value.doneCriteriaText = "- Every approved recovery point is physically checked.\n- Coffee-cup and wine-glass layouts are separately complete with correct types and positions.\n- Ordinary cups are four high with handles right; cappuccino and espresso positions are filled.\n- Items in washing and unlocated items are zero for ordinary final Closing.\n- Any event scope has completed transfer evidence.\n- Delivery evidence describes physical layout/accountability, not an artificial total.";
    value.deviationRulesText = "- Complete office-floor recovery route unresolved — publication blocker.\n- Any layout position is empty or contains the wrong type.\n- Any item remains in washing or unlocated.\n- Required item cannot be washed and returned.\n- Event transfer/evidence is incomplete.";
    value.referenceGuidanceText = "- `ordinary-coffee-cup-layout`.\n- `cappuccino-cup-shelf-layout`.\n- `cappuccino-and-espresso-machine-top-layout`.\n- `wine-glass-layout`.";
  }
  {
    const value = task("C28");
    appendTaskText(value, "instructions", "The fridge remains unlocked. Pull the grille fully down after full restock and physically check both the grille and the closed fridge door.");
    addTaskItem(value, "fridge_remains_unlocked", "food and non-alcoholic fridge remains unlocked", { standardKey: "fridge-closing-rules" });
    addTaskItem(value, "grille_fully_down", "grille pulled fully down and physically checked", { standardKey: "fridge-closing-rules" });
    appendTaskText(value, "doneCriteriaText", "- The fridge remains unlocked; the grille is fully down and both grille and door were physically checked.");
  }
  {
    const value = task("C29");
    appendTaskText(value, "instructions", "Leave the fridge unlocked in the old small wine cabinet. Keep 2 regular milk and 2 Oatly on the top shelf, reserve remaining standing space for opened wine bottles and physically close the door.");
    addTaskItem(value, "opened_wine_standing_space_reserved", "remaining standing space reserved for opened wine bottles", { standardKey: "fridge-closing-rules" });
    addTaskItem(value, "fridge_remains_unlocked", "milk fridge remains unlocked", { standardKey: "fridge-closing-rules" });
    appendTaskText(value, "doneCriteriaText", "- Remaining standing space is reserved for opened wine bottles; the door is closed and the fridge remains unlocked.");
  }
  {
    const value = task("C32");
    const tea = value.items.find((item) => item.key === "six_tea_slots_and_tea_supplies_full");
    tea.label = "six tea slots full in exact order: Peppermynte, Chai Masala, Earl Grey Fransk, Bestemors Frukthave, Sencha, Rooibos Chile";
    tea.metadata.sourceText = `\`${tea.key}\` — ${tea.label}`;
    replaceTaskText(value, "deviationRulesText", "Tea-slot standard unresolved.", "Tea names/order do not match the approved six-position standard.");
    appendTaskText(value, "doneCriteriaText", "- Tea positions match the exact approved names and order.");
  }
  {
    const value = task("C07");
    replaceTaskText(value, "deviationRulesText", "Tea-slot standard unresolved.", "Tea names/order do not match the approved six-position standard.");
    const tea = value.items.find((item) => item.key === "tea_slots_and_tea_bags");
    if (tea) { tea.label = "tea slots and supplies match the six approved names in exact order"; tea.sourceKind = "routine_standard"; tea.standardKey = "self-service-tea-slot-names"; tea.sourceConfig = {}; }
    appendTaskText(value, "doneCriteriaText", "- Tea positions match Peppermynte, Chai Masala, Earl Grey Fransk, Bestemors Frukthave, Sencha and Rooibos Chile in that order.");
  }
  {
    const value = task("C03");
    value.referenceGuidanceText = "- Use `ordinary-coffee-cup-layout`, `cappuccino-cup-shelf-layout`, `cappuccino-and-espresso-machine-top-layout` and `wine-glass-layout` when recovered items are returned.\n- The complete office-floor recovery route remains manager-unresolved; do not guess locations.";
  }
  {
    const value = task("C33");
    value.instructions = "Apply the structured fridge rules and physically verify every door, grille and required lock. Workbar Left/Right and active Cornerbar Left/Middle/Right use universal keys and are locked after final full restock. The non-alcoholic fridge remains unlocked with grille down. The milk fridge remains unlocked with its door closed. Event-active Cornerbar fridge work is formally transferred per fridge scope with final physical evidence, never N/A.";
    setTaskItems(value, [
      ["workbar_bar_left_rule", "Workbar Bar Left closed, universally keyed, locked and physically verified", { standardKey: "fridge-closing-rules" }],
      ["workbar_bar_right_rule", "Workbar Bar Right closed, universally keyed, locked and physically verified", { standardKey: "fridge-closing-rules" }],
      ["workbar_nonalcoholic_rule", "Workbar Non-Alcoholic Fridge unlocked, grille fully down and door closed", { standardKey: "fridge-closing-rules" }],
      ["workbar_milk_rule", "Workbar Milk Fridge unlocked, 2 + 2 top shelf, opened-wine space reserved and door closed", { standardKey: "fridge-closing-rules" }],
      ["cornerbar_left_rule", "Cornerbar Left final-restocked, closed, universally keyed, locked and checked", { standardKey: "fridge-closing-rules" }],
      ["cornerbar_middle_rule", "Cornerbar Middle final-restocked, closed, universally keyed, locked and checked", { standardKey: "fridge-closing-rules" }],
      ["cornerbar_right_rule", "Cornerbar Right final-restocked, closed, universally keyed, locked and checked", { standardKey: "fridge-closing-rules" }],
      ["cornerbar_operating_scope", "Cornerbar final fridge state or formal event transfer follows the operating standard", { standardKey: "cornerbar-operating-standard" }],
      ["event_transfer_evidence_when_required", "scope-specific authorized transfer and final physical evidence; never N/A", { standardKey: "fridge-closing-rules" }],
    ]);
    value.doneCriteriaText = "- Every fridge physically matches its structured rule.\n- Required locks are physically checked after the universal key is turned.\n- Non-alcoholic grille/door and unlocked state are checked.\n- Milk-fridge closed/unlocked state and 2 + 2/opened-wine layout are checked.\n- Event-active Cornerbar scope has authorized transfer and final physical evidence.";
    value.deviationRulesText = "- Required door, grille or lock state cannot be achieved or verified.\n- Full restock remains incomplete.\n- Universal key is unavailable.\n- Event-active scope lacks authorized transfer or physical completion evidence.\n- Never substitute N/A for active event work.";
    value.referenceGuidanceText = "- Use each fridge-specific reference.\n- `cornerbar-left-fridge`, `cornerbar-middle-fridge`, `cornerbar-right-fridge`.";
  }
  for (const id of ["C38", "C40", "C41", "C43", "C45", "C46"]) {
    const value = task(id);
    addTaskItem(value, "cornerbar_operating_scope", "Cornerbar scope complete or formally transferred with physical evidence", { standardKey: "cornerbar-operating-standard" });
    appendTaskText(value, "doneCriteriaText", "- Any active Cornerbar scope follows formal transfer/evidence and is never treated as N/A.");
  }
  appendTaskText(tasks.get("C40"), "referenceGuidanceText", "- `cornerbar-closed-lighting-standard`.");
  appendTaskText(tasks.get("C41"), "referenceGuidanceText", "- `cornerbar-final-reset`.\n- `cornerbar-glass-layout`.");
  appendTaskText(tasks.get("C43"), "referenceGuidanceText", "- `cornerbar-street-door` — status only; no access secret.");
  {
    const value = task("C42");
    value.instructions = "Physically close every hospitality entrance door before alarm. Remove unauthorized manual Salto unlocks, apply each structured lock rule and verify locked state. The front door follows the weekday 08:00–18:00 schedule and any event override is removed after use. Verify Cornerbar street door Salto lock and the upper physical security lock as separate items. Never record access secrets.";
    setTaskItems(value, [
      ["front_door", "front door closed/locked outside weekday 08:00–18:00; event override removed after use", { standardKey: "door-and-lock-rules" }],
      ["vindfang_door", "Vindfang door physically closed, manual unlock removed and locked", { standardKey: "door-and-lock-rules" }],
      ["kitchen_atrium_door", "Kitchen / Atrium door physically closed, manual unlock removed and locked", { standardKey: "door-and-lock-rules" }],
      ["atrium_workbar_door", "Atrium / Workbar door physically closed, manual unlock removed and locked", { standardKey: "door-and-lock-rules" }],
      ["cornerbar_atrium_door", "Cornerbar / Atrium door physically closed, manual unlock removed and locked", { standardKey: "door-and-lock-rules" }],
      ["garbage_hallway_atrium_door", "Garbage hallway / Atrium door physically closed, manual unlock removed and locked", { standardKey: "door-and-lock-rules" }],
      ["cornerbar_street_door", "Cornerbar street door physically closed and locked in Salto", { standardKey: "door-and-lock-rules" }],
      ["cornerbar_street_upper_security_lock", "Cornerbar upper physical security lock separately engaged and verified", { standardKey: "door-and-lock-rules" }],
      ["cornerbar_operating_scope", "Cornerbar door/lock scope follows final close or formal event transfer", { standardKey: "cornerbar-operating-standard" }],
      ["all_physical_checks_confirmed", "all physical door and lock checks confirmed", { standardKey: "door-and-lock-rules" }],
    ]);
    value.doneCriteriaText = "- Every hospitality door in ordinary Closing scope is physically closed before alarm.\n- Every required lock is physically verified.\n- Unauthorized manual Salto unlocks are removed.\n- Cornerbar street Salto lock and upper physical lock are separately confirmed.\n- Any event-active scope has formal transfer evidence.\n- No access secret is recorded.";
    value.deviationRulesText = "- Door or lock cannot close, secure or pass physical verification.\n- Unauthorized manual Salto unlock cannot be removed.\n- Event-active door scope lacks authorized transfer.\n- Required key is unavailable.\n- An open or unlocked door may trigger the alarm and remains blocked.";
    value.referenceGuidanceText = "- `closing-door-check`.\n- `cornerbar-street-door`.\n- `cornerbar-upper-security-lock`.";
  }

  for (const id of touched) finalizeTaskAmendment(tasks.get(id), amendmentDecisionHash);
}
function finalizeProductionReadinessAmendment(task, amendmentDecisionHash) {
  task.metadata.deviationRules = bullets(task.deviationRulesText);
  task.metadata.referenceGuidance = bullets(task.referenceGuidanceText);
  task.metadata.productionReadinessAmendment = { date: "2026-08-09", decisionHash: amendmentDecisionHash };
  task.sourceHash = sha256(canonical({ priorSourceHash: task.sourceHash, title: task.title, instructions: task.instructions,
    structuredItemsText: task.structuredItemsText, doneCriteriaText: task.doneCriteriaText,
    deviationRulesText: task.deviationRulesText, referenceGuidanceText: task.referenceGuidanceText, amendmentDecisionHash }));
}
function applyProductionReadinessAmendment(openingTasks, closingTasks, amendmentDecisionHash) {
  const tasks = new Map([...openingTasks, ...closingTasks].map((task) => [task.id, task]));
  const touched = new Set();
  const task = (id) => { const value = tasks.get(id); if (!value) throw new Error(`Missing task for production-readiness amendment: ${id}`); touched.add(id); return value; };

  {
    const value = task("O02");
    replaceTaskText(value, "timingText", "before the first Coffee Canister brewing plan is finalized", "before the first brewing plan for Coffee Canisters is finalized");
    replaceTaskText(value.metadata, "timingSourceText", "before the first Coffee Canister brewing plan is finalized", "before the first brewing plan for Coffee Canisters is finalized");
  }
  replaceTaskText(task("O28"), "locationDescription", "Coffee Canister kitchen reserve", "Coffee Canisters kitchen reserve");
  replaceTaskText(task("O29"), "deviationRulesText", "Missing stock, serviceware, Coffee Canister or access.", "Missing stock, serviceware, Coffee Canisters or access.");
  {
    const value = task("O34");
    replaceTaskText(value, "locationDescription", "Coffee Canister kitchen reserve", "Coffee Canisters kitchen reserve");
    replaceTaskText(value, "deviationRulesText", "Missing or damaged Coffee Canister/part.", "One or more Coffee Canisters or parts are missing or damaged.");
  }
  replaceTaskText(task("O35"), "deviationRulesText", "Any product, serviceware or Coffee Canister shortage.", "Any product, serviceware or Coffee Canisters shortage.");
  {
    const value = task("C06");
    replaceTaskText(value, "locationDescription", "Coffee Canister kitchen reserve", "Coffee Canisters kitchen reserve");
    replaceTaskText(value, "deviationRulesText", "Coffee Canister or part missing/damaged.", "Coffee Canisters or parts missing/damaged.");
  }
  {
    const value = task("C17");
    replaceTaskText(value, "instructions", "fixed Coffee Canister cupboard", "fixed Coffee Canisters cupboard");
    const returned = value.items.find((item) => item.key === "returned_to_workbar_cupboard");
    if (!returned) throw new Error("C17 returned-to-cupboard item is missing.");
    returned.label = returned.label.replace("Coffee Canister cupboard", "Coffee Canisters cupboard");
    returned.metadata.sourceText = returned.metadata.sourceText.replace("Coffee Canister cupboard", "Coffee Canisters cupboard");
    replaceTaskText(value, "structuredItemsText", "Coffee Canister cupboard", "Coffee Canisters cupboard");
  }
  for (const id of touched) finalizeProductionReadinessAmendment(tasks.get(id), amendmentDecisionHash);
}
function finalizeServicewareRouteAmendment(task, amendmentDecisionHash) {
  task.items.forEach((item, sortOrder) => { item.sortOrder = sortOrder; item.metadata.sourceText = `\`${item.key}\` — ${item.label}`; });
  task.structuredItemsText = task.items.map((item) => `- \`${item.key}\` — ${item.label}`).join("\n");
  task.metadata.deviationRules = bullets(task.deviationRulesText);
  task.metadata.referenceGuidance = bullets(task.referenceGuidanceText);
  task.metadata.servicewareRouteAmendment = { date: "2026-08-09", decisionHash: amendmentDecisionHash,
    standardKey: "serviceware-office-recovery-route-confirmation" };
  task.sourceHash = sha256(canonical({ priorSourceHash: task.sourceHash, title: task.title, timingText: task.timingText,
    instructions: task.instructions, structuredItemsText: task.structuredItemsText, doneCriteriaText: task.doneCriteriaText,
    deviationRulesText: task.deviationRulesText, referenceGuidanceText: task.referenceGuidanceText, timing: task.timing, amendmentDecisionHash }));
}
function applyServicewareRouteAmendment(openingTasks, closingTasks, amendmentDecisionHash) {
  const tasks = new Map([...openingTasks, ...closingTasks].map((task) => [task.id, task]));
  const routeItem = (task, key, label) => {
    const item = task.items.find((entry) => entry.key === key);
    if (!item) throw new Error(`${task.id}/${key}: route evidence item is missing.`);
    item.label = label;
    item.sourceKind = "routine_standard";
    item.standardKey = "serviceware-office-recovery-route-confirmation";
    item.sourceConfig = {};
    delete item.locationSetKey;
  };

  const opening = tasks.get("O15");
  opening.timingText = "Perform at any appropriate point during Opening; the shared route and full Workbar default restoration must be complete no later than 10:45.";
  opening.metadata.timingSourceText = opening.timingText;
  opening.locationDescription = "Workbar, office-floor kitchens on floors 2–5, prep kitchen, and the shared serviceware recovery route.";
  opening.instructions = "During Opening, the responsible person for the shift performs the current shared serviceware office-recovery standard in its configured sequence. Follow its one-person equipment, clean/dirty separation, collection, sorting and inaccessible-area rules. Restore the full configured Workbar default physically; completing the walk alone is insufficient. Complete the route and restoration no later than 10:45. Previous Closing evidence is context only and never completes this Opening task.";
  routeItem(opening, "recovery_route_checked", "shared serviceware office-recovery route completed in its configured sequence by the shift-responsible person");
  opening.doneCriteriaText = "- The current shared route standard is completed by the shift-responsible person no later than 10:45.\n- Every accessible kitchen in the configured eight-kitchen scope was inspected without entering office areas.\n- Any inaccessible area was reported to the manager, recorded specifically as a deviation, and the remainder of the route continued.\n- Clean and dirty items remained separated.\n- Every defined cup and glass position matches its visual layout.\n- Missing or dirty serviceware was found, washed where required, and returned to the correct position.\n- The full configured Workbar default is physically restored; completing the walk alone is not enough.";
  opening.deviationRulesText = "- The shared route is incomplete or the 10:45 deadline is missed.\n- A floor or kitchen is inaccessible: do not wait or bypass access control; notify the manager, record the specific area and continue the remainder.\n- Clean and dirty serviceware is mixed.\n- Any defined layout position remains empty or contains the wrong type.\n- Any required item remains in washing or unlocated.\n- Workbar's configured default is not physically restored.\n- Broken, lost or damaged serviceware.";
  opening.referenceGuidanceText = "- Shared route source: `serviceware-office-recovery-route-confirmation`; no image or route diagram is mandatory.\n- `ordinary-coffee-cup-layout`.\n- `cappuccino-cup-shelf-layout`.\n- `cappuccino-and-espresso-machine-top-layout`.\n- `wine-glass-layout`.\n- Previous Closing evidence is context only and never completes this Opening task.";
  finalizeServicewareRouteAmendment(opening, amendmentDecisionHash);

  const closingRoute = tasks.get("C03");
  closingRoute.timingText = "Perform after lunch service and staff lunch; the normal daily-recovery target is approximately 13:30. C27 later verifies the evidence and final state without forcing a second route.";
  closingRoute.metadata.timingSourceText = closingRoute.timingText;
  closingRoute.locationDescription = "Workbar, office-floor kitchens on floors 2–5, prep kitchen, and the shared serviceware recovery route.";
  closingRoute.instructions = "After lunch service and staff lunch, the responsible person for the shift performs the current shared serviceware office-recovery standard, normally around 13:30. Follow its one-person route, equipment, clean/dirty separation, collection, sorting and inaccessible-area rules. Return clean items, wash and return dirty items, store clean surplus correctly, and restore the full configured Workbar default. C27 later reviews this route evidence and final accountability; C27 does not require the route to be walked again.";
  routeItem(closingRoute, "recovery_locations_checked", "shared serviceware office-recovery route completed in its configured sequence after lunch and staff lunch");
  closingRoute.doneCriteriaText = "- The shift-responsible person completed the current shared route after lunch service and staff lunch, normally around 13:30.\n- Every accessible kitchen in the eight-kitchen scope was inspected; office areas were excluded.\n- Clean and dirty items remained separated and followed the correct return, wash or surplus-storage flow.\n- Any inaccessible area was reported to the manager and recorded specifically while the remainder continued.\n- The full configured Workbar default was physically restored; completing the walk alone was not enough.\n- Route evidence remains available for C27 final accountability.";
  closingRoute.deviationRulesText = "- A floor or kitchen is inaccessible: do not wait or bypass access control; notify the manager, record the specific area and continue the remainder.\n- The shared route or Workbar default restoration is incomplete.\n- Clean and dirty serviceware is mixed.\n- Serviceware is missing or damaged.\n- An item remains unlocated without owner/follow-up.\n- The normal approximately 13:30 target is missed; record the actual completion/deviation without skipping the route.";
  closingRoute.referenceGuidanceText = "- Shared route source: `serviceware-office-recovery-route-confirmation`; no image or route diagram is mandatory.\n- Use `ordinary-coffee-cup-layout`, `cappuccino-cup-shelf-layout`, `cappuccino-and-espresso-machine-top-layout` and `wine-glass-layout` when recovered items are returned.";
  finalizeServicewareRouteAmendment(closingRoute, amendmentDecisionHash);

  const finalAccountability = tasks.get("C27");
  finalAccountability.locationDescription = "Workbar serviceware storage and washing areas; shared C03 route evidence supplies the office-floor recovery context.";
  finalAccountability.instructions = "Review the current C03 evidence against the shared serviceware office-recovery standard; do not repeat the physical route solely for C27. Perform the final physical layout and accountability check, locate, wash and return any remaining missing items, and restore the full configured Workbar default. Coffee cups and wine glasses remain separate evidence lines. Event-held items require completed transfer evidence and never become an artificial numeric total.";
  routeItem(finalAccountability, "full_recovery_route_checked", "current C03 shared-route evidence reviewed against the authoritative standard; no duplicate route required");
  finalAccountability.doneCriteriaText = "- Current C03 route evidence validates against the shared serviceware office-recovery standard.\n- C27 did not force an unnecessary second route.\n- Coffee-cup and wine-glass layouts are separately complete with correct types and positions.\n- Items in washing and unlocated items are zero for ordinary final Closing.\n- Any event scope has completed transfer evidence.\n- The full configured Workbar default is physically restored.\n- Delivery evidence describes physical layout/accountability, not an artificial total.";
  finalAccountability.deviationRulesText = "- C03 route evidence is absent, stale, incomplete or does not match the shared standard.\n- The full configured Workbar default is not physically restored.\n- Any layout position is empty or contains the wrong type.\n- Any item remains in washing or unlocated.\n- Required serviceware cannot be washed and returned.\n- Event transfer/evidence is incomplete.";
  finalAccountability.referenceGuidanceText = "- Shared route source and C03 evidence: `serviceware-office-recovery-route-confirmation`; do not walk a duplicate route solely for C27.\n- `ordinary-coffee-cup-layout`.\n- `cappuccino-cup-shelf-layout`.\n- `cappuccino-and-espresso-machine-top-layout`.\n- `wine-glass-layout`.";
  finalizeServicewareRouteAmendment(finalAccountability, amendmentDecisionHash);
}
function applyRuntimeContractAlignment(openingTasks, closingTasks, amendmentDecisionHash) {
  const tasks = new Map([...openingTasks, ...closingTasks].map((task) => [task.id, task]));
  const expected = {
    O15: { sourceType: "measurement", taskType: "measurement", availabilityMode: "immediate", condition: {}, timing: TIMING.O15 },
    O22: { sourceType: "conditional", taskType: "action", availabilityMode: "condition", condition: CONDITIONS.O22, timing: {} },
    O23: { sourceType: "checkpoint", taskType: "checkpoint", availabilityMode: "immediate", condition: {}, timing: TIMING.O23 },
    O37: { sourceType: "gate", taskType: "gate", availabilityMode: "after_task", condition: {}, timing: TIMING.O37 },
    C14: { sourceType: "checkpoint", taskType: "checkpoint", availabilityMode: "time_window", condition: {}, timing: TIMING.C14 },
    C15: { sourceType: "checkpoint", taskType: "gate", availabilityMode: "immediate", condition: {}, timing: {} },
  };

  for (const [id, contract] of Object.entries(expected)) {
    const task = tasks.get(id);
    if (!task) throw new Error(`Missing task for runtime-contract alignment: ${id}`);
    for (const field of ["sourceType", "taskType", "availabilityMode"]) {
      if (task[field] !== contract[field]) throw new Error(`${id} has an unexpected ${field}: ${task[field]}`);
    }
    if (canonical(task.condition) !== canonical(contract.condition) || canonical(task.timing) !== canonical(contract.timing)) {
      throw new Error(`${id} has an unexpected condition or timing contract.`);
    }
    if (id === "O15") continue;
    task.metadata.runtimeContractAlignment = {
      date: "2026-08-09",
      decisionHash: amendmentDecisionHash,
      originalSourceClassification: task.sourceType,
      operationalTaskType: task.taskType,
    };
    task.sourceHash = sha256(canonical({
      priorSourceHash: task.sourceHash,
      sourceType: task.sourceType,
      taskType: task.taskType,
      availabilityMode: task.availabilityMode,
      condition: task.condition,
      timing: task.timing,
      amendmentDecisionHash,
    }));
  }
}
function finalizeFridgeStandardsAmendment(task, amendmentDecisionHash) {
  task.items.forEach((item, sortOrder) => { item.sortOrder = sortOrder; item.metadata.sourceText = `\`${item.key}\` — ${item.label}`; });
  task.structuredItemsText = task.items.map((item) => `- \`${item.key}\` — ${item.label}`).join("\n");
  task.metadata.deviationRules = bullets(task.deviationRulesText);
  task.metadata.referenceGuidance = bullets(task.referenceGuidanceText);
  task.metadata.fridgeStandardsAmendment = {
    date: "2026-08-15",
    decisionHash: amendmentDecisionHash,
    ownership: "organization",
    standardKeys: [...new Set(task.items.map((item) => item.standardKey).filter(Boolean))],
    locationKeys: [...new Set([
      task.locationKey,
      ...task.items.map((item) => item.metadata?.locationKey),
    ].filter(Boolean))],
  };
  task.sourceHash = sha256(canonical({
    priorSourceHash: task.sourceHash,
    title: task.title,
    instructions: task.instructions,
    structuredItemsText: task.structuredItemsText,
    doneCriteriaText: task.doneCriteriaText,
    deviationRulesText: task.deviationRulesText,
    referenceGuidanceText: task.referenceGuidanceText,
    amendmentDecisionHash,
  }));
}
function applyFridgeStandardsAmendment(openingTasks, closingTasks, doubleShiftSteps, amendmentDecisionHash) {
  const tasks = new Map([...openingTasks, ...closingTasks].map((task) => [task.id, task]));
  const touched = new Set();
  const task = (id) => {
    const value = tasks.get(id);
    if (!value) throw new Error(`Missing task for fridge-standards amendment: ${id}`);
    touched.add(id);
    return value;
  };
  const fullFridgeItems = () => [
    ["regular_milk_count", "top shelf contains exactly 2 regular milk cartons", { standardKey: WORKBAR_MILK_FRIDGE_STANDARD_KEY }],
    ["oatly_count", "top shelf contains exactly 2 Oatly cartons", { standardKey: WORKBAR_MILK_FRIDGE_STANDARD_KEY }],
    ["lower_shelves_opened_wine_only", "every bottle below the top shelf is opened wine", { standardKey: WORKBAR_MILK_FRIDGE_STANDARD_KEY }],
    ["lower_shelves_visible_date_labels", "every bottle below has a clearly visible date label", { standardKey: WORKBAR_MILK_FRIDGE_STANDARD_KEY }],
    ["no_unrelated_items", "no unrelated item or temporary event product is stored in the refrigerator", { standardKey: WORKBAR_MILK_FRIDGE_STANDARD_KEY }],
    ["fridge_clean_and_operating", "refrigerator is clean, operating and correctly organised", { standardKey: WORKBAR_MILK_FRIDGE_STANDARD_KEY }],
    ["door_closed_and_powered_on", "door is closed and refrigerator remains powered on", { standardKey: WORKBAR_MILK_FRIDGE_STANDARD_KEY }],
  ];
  const fullFridgeDone = `- Arrival or checkpoint assessment is recorded.\n${workbarMilkFridgeStandard.doneCriteria.map((criterion) => `- ${criterion}.`).join("\n")}\n- The refrigerator remains powered on and its door is closed.`;
  const fullFridgeDeviation = "- The top shelf is not exactly 2 regular milk cartons and 2 Oatly cartons.\n- A lower shelf contains anything other than opened wine with a clearly visible date label.\n- An unrelated product, extra milk carton or temporary event product is present.\n- The refrigerator is not clean, operating, correctly organised and powered on.\n- Completing this routine check never completes a Stock Count assignment.";
  const bindWorkbarNonAlcoItem = (entry) => {
    if (!entry) throw new Error("Workbar Non-Alco Fridge inventory item is missing.");
    entry.sourceKind = "inventory_readonly";
    entry.sourceConfig = {
      ...WORKBAR_NON_ALCO_LOCATION_STANDARD_SOURCE,
      locationCodes: [...WORKBAR_NON_ALCO_LOCATION_STANDARD_SOURCE.locationCodes],
    };
    delete entry.standardKey;
    delete entry.locationSetKey;
    entry.metadata = { ...entry.metadata, locationKey: WORKBAR_NON_ALCO_LOCATION_KEY };
  };
  const workbarNonAlcoDone = "- The current manager-maintained saved location standard is resolved.\n- Every active product line is restored without embedding product names or quantities in routine copy.\n- Dates and FIFO are checked.\n- Placement and fronting are correct.\n- The door is closed.\n- The refrigerator and its internal light remain on.\n- The refrigerator is clean and operating normally.\n- Completing this routine check does not complete Stock Count.";
  const workbarNonAlcoDeviations = `- ${workbarNonAlcoSavedLocationStandardBinding.incompleteMessage}\n- A shortage, date or FIFO issue remains unresolved.\n- Placement or fronting differs from the current saved standard.\n- The door is open or the refrigerator is not operating normally.\n- The refrigerator or its internal light is switched off.\n- Counts, notes, zeroes, deviations and targetless Stock Count lines remain separate and must never be overwritten.`;

  {
    const value = task("O13");
    value.title = "Verify and restore the Workbar Non-Alco Fridge";
    value.locationKey = WORKBAR_NON_ALCO_LOCATION_KEY;
    value.instructions = `${WORKBAR_NON_ALCO_SAVED_STANDARD_INSTRUCTION}\n\nFor Opening, pull the grille fully up and physically verify the grille position and closed door. Record cleaning, date, FIFO or saved-standard issues as deviations.`;
    bindWorkbarNonAlcoItem(value.items.find((entry) => entry.key === "inventory_standard_items"));
    value.items = value.items.filter((entry) => entry.key !== "eggs_present_and_to_standard");
    const unlocked = value.items.find((entry) => entry.key === "fridge_remains_unlocked");
    if (unlocked) unlocked.label = "Workbar Non-Alco Fridge remains unlocked";
    addTaskItem(value, "refrigerator_and_internal_light_remain_on", "refrigerator and internal light remain on");
    value.doneCriteriaText = `${workbarNonAlcoDone}\n- The grille is fully up for Opening and the fridge remains unlocked.`;
    value.deviationRulesText = workbarNonAlcoDeviations;
    value.referenceGuidanceText = "- `workbar-non-alcoholic-fridge` — canonical saved-location reference; image awaiting upload.";
  }
  for (const id of ["C08", "C28"]) {
    const value = task(id);
    value.title = `${id === "C08" ? "Pre-restore" : "Final-restore"} the Workbar Non-Alco Fridge`;
    value.locationKey = WORKBAR_NON_ALCO_LOCATION_KEY;
    value.instructions = `${WORKBAR_NON_ALCO_SAVED_STANDARD_INSTRUCTION}\n\n${id === "C08" ? "Record the current physical state before correction; C28 still requires a fresh final assessment." : "Perform a fresh final assessment, keep the fridge unlocked and pull the grille fully down after restoration."}`;
    bindWorkbarNonAlcoItem(value.items.find((entry) => entry.key === "inventory_standard_items"));
    value.items = value.items.filter((entry) => entry.key !== "eggs_present_and_to_standard");
    const unlocked = value.items.find((entry) => entry.key === "fridge_remains_unlocked");
    if (unlocked) unlocked.label = "Workbar Non-Alco Fridge remains unlocked";
    addTaskItem(value, "refrigerator_and_internal_light_remain_on", "refrigerator and internal light remain on");
    value.doneCriteriaText = `${workbarNonAlcoDone}${id === "C28" ? "\n- The fridge remains unlocked and the grille is fully down and physically checked." : ""}`;
    value.deviationRulesText = workbarNonAlcoDeviations;
    value.referenceGuidanceText = "- `workbar-non-alcoholic-fridge` — canonical saved-location reference; image awaiting upload.";
  }

  {
    const value = task("O08");
    value.instructions = ESPRESSO_MACHINE_MILK_RESERVOIR_INSTRUCTION;
    setTaskItems(value, [
      ["dairy_reservoir_regular_milk", "dairy reservoir contains regular milk"],
      ["oat_reservoir_oatly", "oat reservoir contains Oatly"],
      ["fresh_in_date_cartons_from_workbar_milk_fridge", "fresh, in-date cartons are taken from the Workbar Milk Fridge", { standardKey: WORKBAR_MILK_FRIDGE_STANDARD_KEY }],
      ["both_reservoirs_connected", "both espresso-machine milk reservoirs are correctly connected"],
      ["milk_system_normal", "espresso-machine milk system reports normal status"],
    ]);
    value.doneCriteriaText = "- The dairy reservoir contains regular milk.\n- The oat reservoir contains Oatly.\n- Only fresh, in-date cartons from the Workbar Milk Fridge are used.\n- Both reservoirs are correctly connected.\n- No unresolved milk-system error remains.";
    value.deviationRulesText = "- Dairy and oat reservoirs are confused.\n- A carton is out of date or did not come from the Workbar Milk Fridge.\n- Either reservoir is disconnected or the milk system reports an error.\n- Espresso-machine reservoirs are never treated as carton-storage or a Stock Count location.";
    value.referenceGuidanceText = "- `workbar-milk-fridge` supplies fresh cartons but remains a separate physical system.";
  }
  for (const id of ["O09", "C09", "C29"]) {
    const value = task(id);
    value.instructions = `${workbarMilkFridgeStandard.mainInstruction}\n\nCompleting this routine-standard check does not complete any Stock Count assignment.`;
    setTaskItems(value, fullFridgeItems());
    value.doneCriteriaText = fullFridgeDone;
    value.deviationRulesText = fullFridgeDeviation;
    value.referenceGuidanceText = "- `workbar-milk-fridge` — written organization-owned standard; image awaiting upload.";
  }
  {
    const value = task("O23");
    const machine = value.items.find((item) => item.key === "coffee_machine_milk_ready");
    const fridge = value.items.find((item) => item.key === "milk_fridge_2_plus_2");
    const nonAlco = value.items.find((item) => item.key === "food_nonalcoholic_fridge_ready");
    if (!machine || !fridge || !nonAlco) throw new Error("O23 refrigerator readiness items are missing.");
    machine.label = "both espresso-machine milk reservoirs correctly filled and connected";
    nonAlco.key = "workbar_non_alco_fridge_standard";
    nonAlco.label = "Workbar Non-Alco Fridge matches its current saved location standard; refrigerator and internal light remain on";
    bindWorkbarNonAlcoItem(nonAlco);
    fridge.label = "complete Workbar Milk Fridge standard: 2 + 2 on top and opened, visibly date-labelled wine only below";
    fridge.sourceKind = "routine_standard";
    fridge.standardKey = WORKBAR_MILK_FRIDGE_STANDARD_KEY;
    fridge.sourceConfig = {};
    appendTaskText(value, "doneCriteriaText", "- Workbar Non-Alco Fridge matches its current manager-maintained saved location standard, is clean and operating normally, and its refrigerator and internal light remain on.\n- Espresso-machine reservoirs and Workbar Milk Fridge carton storage are verified as separate physical systems.\n- The full refrigerator standard is required; a correct 2 + 2 top shelf alone is insufficient.");
    appendTaskText(value, "deviationRulesText", `- ${workbarNonAlcoSavedLocationStandardBinding.incompleteMessage}\n- A Workbar Non-Alco Fridge shortage, date, FIFO, placement, fronting, door, power or internal-light issue blocks final Opening readiness.`);
  }
  for (const id of ["O29", "O35"]) {
    const value = task(id);
    const fridge = value.items.find((item) => item.key === "milk_fridge_two_regular_two_oatly");
    const nonAlco = value.items.find((item) => item.key === "food_nonalcoholic_fridge_including_eggs");
    if (!fridge || !nonAlco) throw new Error(`${id} refrigerator checkpoint item is missing.`);
    nonAlco.key = "workbar_non_alco_fridge_standard";
    nonAlco.label = "Workbar Non-Alco Fridge — current saved location standard";
    bindWorkbarNonAlcoItem(nonAlco);
    fridge.label = "complete Workbar Milk Fridge standard: exact 2 + 2 top shelf and compliant lower shelves";
    fridge.sourceKind = "routine_standard";
    fridge.standardKey = WORKBAR_MILK_FRIDGE_STANDARD_KEY;
    fridge.sourceConfig = {};
    appendTaskText(value, "instructions", `${WORKBAR_NON_ALCO_SAVED_STANDARD_INSTRUCTION} ${workbarNonAlcoSavedLocationStandardBinding.incompleteMessage}\n\nFor the Workbar Milk Fridge, confirm both the exact milk reserve and opened, visibly date-labelled wine only on every lower shelf. Temporary event storage is prohibited.`);
    appendTaskText(value, "doneCriteriaText", "- Workbar Non-Alco Fridge matches its current saved location standard, is clean, closed and operating normally, and its refrigerator and internal light remain on.\n- Workbar Milk Fridge top and lower shelves both comply with the permanent standard; 2 + 2 alone is not a pass.");
    appendTaskText(value, "deviationRulesText", `- ${workbarNonAlcoSavedLocationStandardBinding.incompleteMessage}\n- A Workbar Non-Alco Fridge shortage, date, FIFO, placement, fronting, door, power or internal-light issue blocks the checkpoint.\n- Workbar Milk Fridge lower-shelf or temporary-storage noncompliance blocks the checkpoint even when 2 + 2 milk is present.`);
  }
  for (const id of ["C10", "C30"]) {
    const value = task(id);
    appendTaskText(value, "instructions", `${CORNERBAR_SAVED_STANDARD_INSTRUCTION} Resolve Left, Middle and Right independently from their current manager-maintained location standards. ${CORNERBAR_SAVED_STANDARD_INCOMPLETE}`);
    for (const [itemKey, locationCode] of Object.entries(CORNERBAR_LOCATION_CODE_BY_ITEM)) {
      const item = value.items.find((entry) => entry.key === itemKey);
      if (!item) throw new Error(`${id}/${itemKey}: Cornerbar fridge item is missing.`);
      item.label = `${itemKey.replaceAll("_", " ")} — current saved location standard`;
      item.sourceKind = "inventory_readonly";
      item.sourceConfig = { mode: "location_standards", locationCodes: [locationCode], activeOnly: true };
      delete item.standardKey;
      delete item.locationSetKey;
    }
    appendTaskText(value, "doneCriteriaText", "- Cornerbar Left, Middle and Right each match the current saved location standard.\n- Every Cornerbar refrigerator and internal light remains on.\n- No product quantity is embedded in Event or Closing content.");
    appendTaskText(value, "deviationRulesText", `- ${CORNERBAR_SAVED_STANDARD_INCOMPLETE}\n- Never invent a missing product or quantity, and never switch off a Cornerbar refrigerator or its internal light.`);
  }
  {
    const value = task("C33");
    value.instructions = "Apply the structured fridge rules and physically verify every door, grille and required lock. Workbar Left/Right are locked after final full restock. Workbar Non-Alco Fridge matches its current manager-maintained saved location standard, remains unlocked with its grille down, and keeps the refrigerator and internal light on. The Workbar Milk Fridge remains unlocked, powered on and fully compliant with its permanent top- and lower-shelf standard. Cornerbar Left/Middle/Right remain powered on with internal lights on, match their current saved location standards, and may then be closed, locked and physically checked. Event-active Cornerbar work is formally transferred per fridge scope with final physical evidence, never N/A.";
    const milk = value.items.find((item) => item.key === "workbar_milk_rule");
    const nonAlco = value.items.find((item) => item.key === "workbar_nonalcoholic_rule");
    if (!milk || !nonAlco) throw new Error("C33 Workbar refrigerator rules are missing.");
    nonAlco.key = "workbar_non_alco_fridge_standard";
    nonAlco.label = "Workbar Non-Alco Fridge matches its current saved location standard, remains unlocked with grille down and door closed, and keeps refrigerator and internal light on";
    bindWorkbarNonAlcoItem(nonAlco);
    milk.label = "Workbar Milk Fridge powered on and fully compliant: exact 2 + 2 top shelf; opened, visibly date-labelled wine only below";
    milk.sourceKind = "routine_standard";
    milk.standardKey = WORKBAR_MILK_FRIDGE_STANDARD_KEY;
    milk.sourceConfig = {};
    addTaskItem(value, "cornerbar_refrigerators_and_internal_lights_on", "every Cornerbar refrigerator and internal light remains on", { standardKey: "cornerbar-operating-standard" });
    value.doneCriteriaText = "- Every fridge physically matches its structured rule.\n- Required locks are physically checked after the universal key is turned.\n- Workbar Non-Alco Fridge matches its current saved location standard; dates, FIFO, placement and fronting are correct; the grille is checked; the door is closed; the refrigerator is clean and operating normally; refrigerator and internal light remain on.\n- Workbar Milk Fridge top and lower shelves fully comply; the refrigerator remains powered on, closed and unlocked.\n- Cornerbar refrigerators and internal lights remain on and each fridge matches its current saved location standard.\n- Event-active Cornerbar scope has authorized transfer and final physical evidence.";
    appendTaskText(value, "deviationRulesText", `- ${workbarNonAlcoSavedLocationStandardBinding.incompleteMessage}\n- Switching off the Workbar Non-Alco Fridge or its internal light is forbidden.\n- A correct Workbar Milk Fridge top shelf never compensates for noncompliant lower shelves.\n- Switching off a Cornerbar refrigerator or its internal light is forbidden.`);
  }

  const transition = doubleShiftSteps.find((step) => step.id === "DS02");
  if (!transition) throw new Error("DS02 is missing from the fridge-standards amendment.");
  transition.instructions = transition.instructions.replace(
    "- Workbar milk fridge",
    "- espresso-machine dairy and oat reservoirs\n- self-service milk jug\n- Workbar Milk Fridge top-shelf 2 + 2 reserve\n- Workbar Milk Fridge lower shelves: opened, visibly date-labelled wine only",
  );
  transition.instructions = transition.instructions.replace(
    "- Workbar food/non-alcoholic fridge",
    "- Workbar Non-Alco Fridge actual saved-standard status, including shortages, date/FIFO issues and incomplete-standard escalation",
  );
  transition.doneCriteriaText = `${transition.doneCriteriaText}\n- The handover reports actual Workbar Non-Alco Fridge saved-standard status, shortages, date/FIFO issues and incomplete-standard escalation without duplicating product quantities.\n- The handover reports espresso reservoirs, self-service milk jug, Workbar Milk Fridge top shelf and lower shelves separately.\n- A 2 + 2 top shelf alone never reports the full refrigerator standard as compliant.`;
  transition.sourceHash = sha256(canonical({ priorSourceHash: transition.sourceHash, instructions: transition.instructions, doneCriteriaText: transition.doneCriteriaText, amendmentDecisionHash }));
  transition.fridgeStandardsAmendment = { date: "2026-08-15", decisionHash: amendmentDecisionHash, ownership: "organization" };

  for (const id of touched) finalizeFridgeStandardsAmendment(tasks.get(id), amendmentDecisionHash);
}
function parseDoubleShift(source) {
  const matcher = /^# (DS\d{2}) — ([^\n]+)\n([\s\S]*?)(?=^# [^\n]+|$(?![\s\S]))/gm;
  const steps = [];
  const stable = { DS01: "ds01_confirm_plan", DS02: "ds02_opening_transition", DS03: "ds03_return_review", DS04: "ds04_bundle_finalized" };
  let match;
  while ((match = matcher.exec(source)) !== null) {
    const block = match[0].trim();
    const id = match[1];
    const payloadHeading = id === "DS04" ? "System-generated payload" : "Structured step payload";
    const mandatoryText = metadataValue(block, "Mandatory") || "";
    const structuredPayloadText = sectionText(block, payloadHeading, ["Done when", "Blocking/deviation rules", "Blocking rules"], 2);
    steps.push({
      id, stepKey: stable[id], title: match[2].trim(), actor: metadataValue(block, "Actor"), stepType: metadataValue(block, "Step type"),
      mandatory: /^yes\b/i.test(mandatoryText), mandatoryText, prerequisiteText: metadataValue(block, "Prerequisite"), participantText: metadataValue(block, "Participant"),
      repeat: metadataValue(block, "Repeat"), offlinePolicy: metadataValue(block, "Offline policy"),
      criticality: normalizePolicy(metadataValue(block, "Criticality")), instructions: sectionText(block, "Employee instruction", [payloadHeading, "Done when", "Blocking/deviation rules"], 2),
      eligibilityText: sectionText(block, "Eligibility", [payloadHeading, "Done when", "Blocking rules"], 2),
      structuredPayloadText, structuredPayload: bullets(structuredPayloadText),
      doneCriteriaText: sectionText(block, "Done when", ["Blocking/deviation rules", "Blocking rules"], 2),
      blockingRulesText: sectionText(block, id === "DS04" ? "Blocking rules" : "Blocking/deviation rules", [], 2),
      systemGenerated: id === "DS04", sourceHash: sha256(block),
    });
  }
  return steps;
}
function parseDoubleShiftCopy(source) {
  const mobile = source.match(/^# Mobile copy\n([\s\S]*?)(?=^# [^\n]+|$(?![\s\S]))/m)?.[1] || "";
  const copy = {};
  for (const [key, heading] of [["beforeOpening", "Before Opening"], ["betweenShifts", "Between shifts"], ["return", "Return"], ["completion", "Completion"]]) {
    const section = sectionText(`## ${heading}\n${sectionText(mobile, heading, ["Before Opening", "Between shifts", "Return", "Completion"], 2)}`, heading, [], 2);
    const fenced = section.match(/```text\n([\s\S]*?)\n```/);
    if (!fenced) throw new Error(`Double Shift mobile copy is missing ${heading}.`);
    copy[key] = fenced[1];
  }
  return copy;
}
function runtimeContractMetadata(amendmentDecisionHash) {
  return { runtimeContractAlignment: { date: "2026-08-09", decisionHash: amendmentDecisionHash } };
}
function dependencies(amendmentDecisionHash) {
  const result = [
    ["O27", "O29", "complete_predecessor_on_successor"], ["O33", "O35", "complete_predecessor_on_successor"],
    ...["O30", "O31", "O32", "O33", "O34", "O35", "O36"].map((id) => [id, "O37", "must_complete"]),
    ...["C03", "C04", "C06", "C07", "C08", "C09", "C10", "C11", "C12", "C13"].map((id) => [id, "C14", "must_complete"]),
    ["C05", "C15", "complete_predecessor_on_successor", runtimeContractMetadata(amendmentDecisionHash)],
    ["C34", "C35", "must_complete"], ["C35", "C36", "must_complete"], ["C41", "C42", "must_complete"], ["C42", "C43", "must_complete"],
    ...["C27", "C28", "C29", "C30", "C31", "C32", "C33", "C36", "C37", "C38", "C39", "C40", "C41", "C42", "C43", "C44"].map((id) => [id, "C45", "must_complete"]),
    ["C45", "C46", "must_complete"],
  ];
  return result.map(([predecessorTaskId, successorTaskId, dependencyType, metadata = {}]) => ({ predecessorTaskId, successorTaskId, dependencyType, metadata }));
}
function relation(sourceTaskId, targetRoutineKey, targetTaskId, relationType, metadata = {}) { return { sourceTaskId, targetRoutineKey, targetTaskId, relationType, metadata }; }
function delivery(sourceTaskId, targetTaskId, deliveryKey, label, evidenceItemKeys) {
  return relation(sourceTaskId, "opening", targetTaskId, "delivery_comparison", { deliveryKey, label, category: "opening_readiness", comparisonMode: "ready_on_arrival", required: true, allowNotApplicable: false, scopePolicy: "same_scope", evidenceItemKeys, requireValidTaskVerification: false, requireValidRunVerification: false });
}
function relations(closingTasks, amendmentDecisionHash) {
  const itemKeys = (id, pattern) => closingTasks.find((task) => task.id === id).items.filter((item) => pattern.test(`${item.key} ${item.label}`.toLowerCase())).map((item) => item.key);
  return [
    relation("O01", "closing", "C01", "repeat_required"), relation("O03", "closing", "C18", "complementary_action"),
    relation("O04", "closing", "C23", "complementary_action"), relation("O05", "closing", "C24", "complementary_action"),
    relation("O19", "closing", "C38", "complementary_action"), relation("O20", "closing", "C39", "complementary_action"),
    relation("O21", "closing", "C40", "complementary_action"), relation("O17", "closing", "C35", "complementary_action"),
    relation("O06", "closing", "C17", "complementary_action"), relation("O22", "closing", "C22", "conditional_companion", { condition: CONDITIONS.O22, ...runtimeContractMetadata(amendmentDecisionHash) }),
    relation("O16", "closing", "C04", "repeat_required"), relation("O15", "closing", "C27", "repeat_required"),
    delivery("C28", "O13", "workbar-food-non-alcoholic-fridge", "Workbar food/non-alcoholic fridge ready for Opening", itemKeys("C28", /product|stock|fridge|egg|food|non-alcohol/)),
    delivery("C29", "O09", "workbar-milk-fridge", "Workbar Milk Fridge ready for Opening", itemKeys("C29", /milk|oat|fridge|standard/)),
    delivery("C32", "O14", "self-service-overnight-standard", "Self-service overnight standard ready for Opening", itemKeys("C32", /standard|surface|milk|coffee|serviceware|waste|tea/)),
    delivery("C27", "O15", "serviceware-full-targets", "Coffee cups and wine glasses physically accountable for Opening", itemKeys("C27", /coffee.*cup|cup|wine.*glass|glass/)),
    delivery("C04", "O16", "project-rooms-final-standard", "Project rooms physically ready for Opening", itemKeys("C04", /room|boardroom/)),
    delivery("C13", "O07", "cleaning-station-final-standard", "Cleaning station ready for Opening", itemKeys("C13", /clean|station|supply|surface/)),
  ];
}
function validateSource(source, kind, expectedHash) {
  const actualHash = sha256(source);
  if (actualHash !== expectedHash) throw new Error(`${kind} source SHA-256 mismatch: ${actualHash}`);
}
function amendmentDecisionBody(source) {
  const marker = `\n${AMENDMENT_METADATA_HEADING}\n`;
  const index = source.replaceAll("\r\n", "\n").indexOf(marker);
  if (index < 0) throw new Error("Operational standards amendment is missing the generated metadata boundary.");
  return `${source.replaceAll("\r\n", "\n").slice(0, index).trimEnd()}\n`;
}
function buildPack(openingSource, closingSource, doubleShiftSource, baseAmendmentSource, productionAmendmentSource, servicewareAmendmentSource, amendmentSource, fridgeAmendmentSource) {
  validateSource(openingSource, "Opening", SOURCE_HASHES.opening);
  validateSource(closingSource, "Closing", SOURCE_HASHES.closing);
  validateSource(doubleShiftSource, "Double Shift", SOURCE_HASHES.doubleShift);
  const baseAmendmentDecisionHash = sha256(amendmentDecisionBody(baseAmendmentSource));
  const productionAmendmentDecisionHash = sha256(amendmentDecisionBody(productionAmendmentSource));
  const servicewareAmendmentDecisionHash = sha256(amendmentDecisionBody(servicewareAmendmentSource));
  const amendmentDecisionHash = sha256(amendmentDecisionBody(amendmentSource));
  const fridgeAmendmentDecisionHash = sha256(amendmentDecisionBody(fridgeAmendmentSource));
  const openingTasks = parseRoutine(openingSource, "O");
  const closingTasks = parseRoutine(closingSource, "C");
  applyOperationalStandardsAmendment(openingTasks, closingTasks, baseAmendmentDecisionHash);
  applyProductionReadinessAmendment(openingTasks, closingTasks, productionAmendmentDecisionHash);
  applyServicewareRouteAmendment(openingTasks, closingTasks, servicewareAmendmentDecisionHash);
  applyRuntimeContractAlignment(openingTasks, closingTasks, amendmentDecisionHash);
  const doubleShiftSteps = parseDoubleShift(doubleShiftSource);
  applyFridgeStandardsAmendment(openingTasks, closingTasks, doubleShiftSteps, fridgeAmendmentDecisionHash);
  const allRelations = relations(closingTasks, amendmentDecisionHash);
  const pack = {
    schemaVersion: "1.0", packKey: "mesh-routine-content", packVersion: "1.5R",
    name: "Mesh Opening and Closing operational content", description: "Editable Opening and Closing drafts plus Double Shift system-step copy. Installation never publishes or creates operative state.",
    sections: [...SECTION_CONFIG.O.map((value, sortOrder) => ({ ...value, routineKey: "opening", sortOrder })), ...SECTION_CONFIG.C.map((value, sortOrder) => ({ ...value, routineKey: "closing", sortOrder }))],
    locations: LOCATIONS, locationSets: LOCATION_SETS, standards: STANDARDS, references: REFERENCES,
    opening: { routineKey: "opening", name: "Opening", description: "Mesh Opening content from the authoritative v1R source.", sections: SECTION_CONFIG.O.map((value, sortOrder) => ({ ...value, sortOrder })), tasks: openingTasks, dependencies: dependencies(amendmentDecisionHash).filter((entry) => entry.predecessorTaskId.startsWith("O")), relations: allRelations.filter((entry) => entry.sourceTaskId.startsWith("O")) },
    closing: { routineKey: "closing", name: "Closing", description: "Mesh Closing content from the authoritative v1R source.", sections: SECTION_CONFIG.C.map((value, sortOrder) => ({ ...value, sortOrder })), tasks: closingTasks, dependencies: dependencies(amendmentDecisionHash).filter((entry) => entry.predecessorTaskId.startsWith("C")), relations: allRelations.filter((entry) => entry.sourceTaskId.startsWith("C")) },
    doubleShiftSteps, doubleShiftCopy: parseDoubleShiftCopy(doubleShiftSource), unresolvedRequirements: UNRESOLVED,
    sourceDocuments: [
      { kind: "opening", fileName: "mesh-opening-content-spec-v1R-combined.md", sha256: SOURCE_HASHES.opening },
      { kind: "closing", fileName: "mesh-closing-content-spec-v1R-combined.md", sha256: SOURCE_HASHES.closing },
      { kind: "double_shift", fileName: "mesh-double-shift-content-spec-v1R.md", sha256: SOURCE_HASHES.doubleShift },
      { kind: "operational_standards_amendment", fileName: "routine-engine-v2-mesh-operational-standards-amendment-2026-08-07.md", sha256: baseAmendmentDecisionHash, hashScope: "content-before-generated-pack-metadata" },
      { kind: "production_readiness_amendment", fileName: "routine-engine-v2-production-readiness-amendment-2026-08-09.md", sha256: productionAmendmentDecisionHash, hashScope: "content-before-generated-pack-metadata" },
      { kind: "serviceware_route_amendment", fileName: "routine-engine-v2-serviceware-route-amendment-2026-08-09.md", sha256: servicewareAmendmentDecisionHash, hashScope: "content-before-generated-pack-metadata" },
      { kind: "runtime_contract_alignment_amendment", fileName: "routine-engine-v2-runtime-contract-alignment-amendment-2026-08-09.md", sha256: amendmentDecisionHash, hashScope: "content-before-generated-pack-metadata" },
      { kind: "fridge_standards_amendment", fileName: "routine-engine-v2-fridge-standards-amendment-2026-08-15.md", sha256: fridgeAmendmentDecisionHash, hashScope: "content-before-generated-pack-metadata" },
    ],
  };
  validatePack(pack);
  pack.packHash = sha256(canonical(pack));
  return pack;
}
function generatedAmendment(pack) {
  const source = readFileSync(FRIDGE_AMENDMENT_PATH, "utf8");
  const body = amendmentDecisionBody(source);
  const amendment = pack.sourceDocuments.find((entry) => entry.kind === "fridge_standards_amendment");
  return `${body}\n${AMENDMENT_METADATA_HEADING}\n\nThis section is generated from the canonical pack and is excluded from the amendment decision-body hash.\n\n- Pack: \`${pack.packKey}@${pack.packVersion}\`\n- Canonical pack SHA-256: \`${pack.packHash}\`\n- Amendment decision-body SHA-256: \`${amendment.sha256}\`\n- Production action: none; this artifact is local implementation and review only\n`;
}
function syncAmendment(pack, checkOnly) {
  const expected = generatedAmendment(pack);
  const source = readFileSync(FRIDGE_AMENDMENT_PATH, "utf8");
  if (checkOnly) { if (source !== expected) throw new Error("Fridge-standards amendment metadata is stale."); }
  else writeFileSync(FRIDGE_AMENDMENT_PATH, expected);
}
function validatePack(pack, withHash = false) {
  const keys = Object.keys(pack);
  const allowed = new Set(TOP_LEVEL_FIELDS);
  const unknown = keys.filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`Unknown top-level fields: ${unknown.join(", ")}`);
  for (const key of TOP_LEVEL_FIELDS.filter((key) => key !== "packHash")) if (!(key in pack)) throw new Error(`Missing top-level field: ${key}`);
  if (pack.opening.tasks.length !== 37 || pack.closing.tasks.length !== 46 || pack.doubleShiftSteps.length !== 4) throw new Error("Content counts must be Opening 37, Closing 46, Double Shift 4.");
  if (pack.locations.length !== 44 || pack.locationSets.length !== 12 || pack.standards.length !== 14 || pack.references.length !== 40) throw new Error("Foundation counts must be 44 locations, 12 sets, 14 standards, and 40 references.");
  if (pack.packVersion !== "1.5R") throw new Error("Fridge-standards pack version must be 1.5R.");
  for (const [tasks, prefix, count] of [[pack.opening.tasks, "O", 37], [pack.closing.tasks, "C", 46]]) {
    const expected = new Set(Array.from({ length: count }, (_, index) => `${prefix}${String(index + 1).padStart(2, "0")}`));
    for (const task of tasks) {
      expected.delete(task.id);
      for (const field of ["instructions", "structuredItemsText", "doneCriteriaText", "deviationRulesText", "referenceGuidanceText"]) if (!task[field]) throw new Error(`${task.id} missing ${field}.`);
      if (!task.items.length) throw new Error(`${task.id} has no structured items.`);
      if (task.availabilityMode === "time_window" && !task.timing.startFromLocalTime) throw new Error(`${task.id}: every time-window task requires startFromLocalTime.`);
      if (task.taskType === "checkpoint" && !task.timing.targetLocalTime) throw new Error(`${task.id}: every active checkpoint requires targetLocalTime.`);
      if (task.condition.fact === "organization_flag" && !task.condition.key) throw new Error(`${task.id}: organization_flag requires key.`);
      if (task.condition.fact === "organization_flag" && typeof task.condition.value === "string" && task.condition.value === task.condition.key) throw new Error(`${task.id}: organization flag name must not be placed in value.`);
    }
    if (expected.size) throw new Error(`Missing ${prefix} IDs: ${[...expected].join(", ")}`);
  }
  if (pack.locations.some((location) => /(^|\D)005(\D|$)/.test(`${location.key} ${location.name}`))) throw new Error("Room 005 is forbidden.");
  if (/coffee container|coffee urn|coffee pot/i.test(canonical(pack))) throw new Error("Content violates Coffee Canister terminology.");
  const milkFridgeStandard = pack.standards.find((standard) => standard.key === WORKBAR_MILK_FRIDGE_STANDARD_KEY)?.currentRevision?.value;
  if (milkFridgeStandard?.topShelf?.regularMilkCartons !== 2 || milkFridgeStandard?.topShelf?.oatlyCartons !== 2
    || milkFridgeStandard?.lowerShelves?.exclusiveUse !== "opened-wine-bottles"
    || milkFridgeStandard?.lowerShelves?.visibleDateLabelRequired !== true
    || milkFridgeStandard?.applicability?.notOverridableByEvent !== true) throw new Error("Workbar Milk Fridge organization-owned standard is incomplete.");
  if (!pack.standards.find((standard) => standard.key === "self-service-fixed-components").currentRevision.value.includes("eggs")) throw new Error("Self-service fixed components must include eggs.");
  if (pack.unresolvedRequirements.length !== 0) throw new Error("The authoritative serviceware route must leave no unresolved content requirements.");
  const servicewareStandard = pack.standards.find((standard) => standard.key === "serviceware-office-recovery-route-confirmation");
  if (!servicewareStandard?.currentRevision?.value || servicewareStandard.currentRevision.value.scope?.totalKitchens !== 8
    || servicewareStandard.currentRevision.value.scope?.officeAreasIncluded !== false
    || servicewareStandard.currentRevision.value.timing?.opening?.completeNoLaterThanLocalTime !== "10:45"
    || servicewareStandard.currentRevision.value.timing?.closingDailyRecovery?.normalTargetLocalTimeApprox !== "13:30") {
    throw new Error("The shared serviceware route standard is incomplete.");
  }
  if (canonical(pack.standards.find((standard) => standard.key === "coffee-cups-full-target")?.currentRevision?.value) !== canonical(pack.standards.find((standard) => standard.key === "coffee-cups-service-ready-target")?.currentRevision?.value)) throw new Error("Coffee-cup full and service-ready layouts must be semantically identical.");
  if (canonical(pack.standards.find((standard) => standard.key === "wine-glasses-full-target")?.currentRevision?.value) !== canonical(pack.standards.find((standard) => standard.key === "wine-glasses-service-ready-target")?.currentRevision?.value)) throw new Error("Wine-glass full and service-ready layouts must be semantically identical.");
  if (pack.sourceDocuments.filter((entry) => entry.kind.endsWith("_amendment")).some((entry) => entry.hashScope !== "content-before-generated-pack-metadata")) throw new Error("Amendment provenance is incomplete.");
  const allTasks = [...pack.opening.tasks, ...pack.closing.tasks];
  const allDependencies = [...pack.opening.dependencies, ...pack.closing.dependencies];
  for (const task of allTasks.filter((entry) => entry.taskType === "continuous")) {
    const automaticSuccessors = allDependencies.filter((entry) => entry.predecessorTaskId === task.id && entry.dependencyType === "complete_predecessor_on_successor");
    if (automaticSuccessors.length !== 1) throw new Error(`${task.id}: continuous task requires exactly one actual automatic-completion dependency.`);
  }
  if (pack.opening.tasks.find((task) => task.id === "O23")?.availabilityMode !== "immediate"
    || pack.opening.tasks.find((task) => task.id === "O37")?.availabilityMode !== "after_task") {
    throw new Error("Timing fields must not cause O23 or O37 to be assigned time_window.");
  }
  const o15 = pack.opening.tasks.find((task) => task.id === "O15");
  if (o15?.taskType !== "measurement" || o15.availabilityMode !== "immediate"
    || o15.timing.visibleFromLocalTime || o15.timing.startFromLocalTime
    || o15.timing.targetLocalTime !== "10:45:00" || o15.timing.hardDeadlineLocalTime !== "10:45:00"
    || !o15.items.some((item) => item.standardKey === "serviceware-office-recovery-route-confirmation")) {
    throw new Error("O15 runtime timing and serviceware binding are not exact.");
  }
  const o22Condition = pack.opening.tasks.find((task) => task.id === "O22")?.condition;
  const o22RelationCondition = pack.opening.relations.find((entry) => entry.sourceTaskId === "O22" && entry.targetTaskId === "C22")?.metadata?.condition;
  if (canonical(o22Condition) !== canonical(CONDITIONS.O22) || canonical(o22RelationCondition) !== canonical(CONDITIONS.O22)) throw new Error("O22 condition wire format is not aligned with Phase 10F.");
  const c05Automatic = pack.closing.dependencies.filter((entry) => entry.predecessorTaskId === "C05" && entry.dependencyType === "complete_predecessor_on_successor");
  if (c05Automatic.length !== 1 || c05Automatic[0].successorTaskId !== "C15" || pack.closing.dependencies.some((entry) => entry.predecessorTaskId === "C05" && entry.successorTaskId === "C14")) throw new Error("C05 must have exactly one automatic successor, C15, and no C14 dependency.");
  const canonicalInventoryConfig = canonical(WORKBAR_NON_ALCO_LOCATION_STANDARD_SOURCE);
  const expectedCornerbarInventoryConfigs = new Map(
    ["C10", "C30"].flatMap((taskId) => Object.entries(CORNERBAR_LOCATION_CODE_BY_ITEM)
      .map(([itemKey, locationCode]) => [`${taskId}/${itemKey}`, canonical({ mode: "location_standards", locationCodes: [locationCode], activeOnly: true })])),
  );
  const canonicalAssetConfig = canonical(REQUIRED_CLOSING_ASSET_SOURCE);
  const inventoryPairs = [];
  const assetPairs = [];
  for (const task of allTasks) {
    for (const item of task.items) {
      const pair = `${task.id}/${item.key}`;
      if (item.sourceKind === "inventory_readonly") {
        inventoryPairs.push(pair);
        const expectedConfig = expectedCornerbarInventoryConfigs.get(pair) || canonicalInventoryConfig;
        if (canonical(item.sourceConfig) !== expectedConfig
          || item.standardKey || item.locationSetKey
          || item.sourceConfig.locationCodes.some((code) => !/^[A-Z][A-Z0-9_]*$/.test(code))) {
          throw new Error(`${pair}: inventory_readonly source does not match the canonical location_standards contract.`);
        }
      }
      if (["O13", "C08", "C28"].includes(task.id) && item.key === "fridge_clean_and_operating"
        && (item.sourceKind !== "static" || canonical(item.sourceConfig) !== "{}" || item.standardKey || item.locationSetKey)) {
        throw new Error(`${pair}: the explicit physical check must remain one static item.`);
      }
      if (["O13", "C08", "C28"].includes(task.id) && item.key === "inventory_standard_items" && item.sourceKind !== "inventory_readonly") {
        throw new Error(`${pair}: inventory_standard_items must use the explicit inventory source binding.`);
      }
      if (item.sourceConfig?.locationCode !== undefined
        || (item.sourceKind === "inventory_readonly" && item.sourceConfig?.access !== undefined)) {
        throw new Error(`${pair}: legacy inventory source configuration is forbidden.`);
      }
      if (item.sourceKind === "asset_registry_readonly") {
        assetPairs.push(pair);
        if (canonical(item.sourceConfig) !== canonicalAssetConfig
          || item.standardKey || item.locationSetKey
          || item.sourceConfig?.venue !== undefined
          || item.sourceConfig?.venues !== undefined
          || item.sourceConfig?.assetTypes !== undefined
          || item.sourceConfig?.access !== undefined) {
          throw new Error(`${pair}: asset_registry_readonly source does not match the canonical active required-for-closing contract.`);
        }
      }
      if (task.id === "C37" && item.key === "active_asset_registry_items" && item.sourceKind !== "asset_registry_readonly") {
        throw new Error(`${pair}: active_asset_registry_items must use the explicit asset-registry source binding.`);
      }
      if (task.id === "C37" && [
        "device_physically_accounted_for",
        "correct_charging_position",
        "charging_confirmed",
        "damage_or_fault_recorded",
        "event_transfer_evidence_when_required",
      ].includes(item.key) && (item.sourceKind !== "static" || canonical(item.sourceConfig) !== "{}" || item.standardKey || item.locationSetKey)) {
        throw new Error(`${pair}: the aggregate physical control must remain one static item.`);
      }
    }
  }
  const expectedInventoryPairs = [
    "C08/inventory_standard_items",
    "C28/inventory_standard_items",
    "C33/workbar_non_alco_fridge_standard",
    "O13/inventory_standard_items",
    "O23/workbar_non_alco_fridge_standard",
    "O29/workbar_non_alco_fridge_standard",
    "O35/workbar_non_alco_fridge_standard",
    ...expectedCornerbarInventoryConfigs.keys(),
  ].sort();
  if (canonical(inventoryPairs.sort()) !== canonical(expectedInventoryPairs)) {
    throw new Error("Only the approved Workbar and Cornerbar location-standard bindings may use inventory_readonly.");
  }
  if (canonical(assetPairs.sort()) !== canonical(["C37/active_asset_registry_items"])) {
    throw new Error("Only C37/active_asset_registry_items may use asset_registry_readonly.");
  }
  if (pack.opening.routineKey === "double_shift" || pack.closing.routineKey === "double_shift" || "doubleShiftTemplate" in pack) throw new Error("Double Shift must not be a third template.");
  if (pack.doubleShiftSteps.some((step, index) => step.id !== `DS${String(index + 1).padStart(2, "0")}` || !step.stepKey || !step.title || !step.mandatory || !step.structuredPayloadText || (step.id !== "DS04" && (!step.instructions || !step.structuredPayload.length || !step.doneCriteriaText || !step.blockingRulesText)))) throw new Error("Double Shift definitions are incomplete or out of order.");
  if (pack.doubleShiftSteps.find((step) => step.id === "DS03")?.mandatoryText !== "yes for a returning Double Shift participant") throw new Error("DS03 conditional mandatory semantics must remain exact.");
  if (!pack.doubleShiftSteps.find((step) => step.id === "DS04")?.systemGenerated || !pack.doubleShiftSteps.find((step) => step.id === "DS04")?.eligibilityText) throw new Error("DS04 must be a system-generated definition with eligibility rules.");
  if (Object.keys(pack.doubleShiftCopy).join("|") !== "beforeOpening|betweenShifts|return|completion" || Object.values(pack.doubleShiftCopy).some((value) => !value)) throw new Error("Double Shift bundle copy is incomplete.");
  for (const taskId of ["O15", "C03", "C27"]) {
    const routine = taskId.startsWith("O") ? pack.opening : pack.closing;
    const task = routine.tasks.find((entry) => entry.id === taskId);
    if (!task?.items.some((item) => item.standardKey === "serviceware-office-recovery-route-confirmation" && item.sourceKind === "routine_standard")) {
      throw new Error(`${taskId} must validate against the shared serviceware route standard.`);
    }
  }
  const serialized = canonical(pack).toLowerCase();
  if (/"(?:alarmCode|safeCode|saltoPassword|saltoPin)"\s*:/i.test(serialized)) throw new Error("Credential fields are forbidden.");
  if (withHash) {
    const { packHash, ...withoutHash } = pack;
    const expectedHash = sha256(canonical(withoutHash));
    if (packHash !== expectedHash) throw new Error(`Pack hash mismatch: expected ${expectedHash}, got ${packHash}.`);
  }
}
function generatedDocBase(pack) {
  const allDependencies = [...pack.opening.dependencies, ...pack.closing.dependencies];
  const allRelations = [...pack.opening.relations, ...pack.closing.relations];
  const rows = (tasks) => tasks.map((task) => {
    const dependencyCount = allDependencies.filter((entry) => entry.predecessorTaskId === task.id || entry.successorTaskId === task.id).length;
    const referenceCount = pack.references.filter((entry) => entry.taskIds.includes(task.id)).length;
    const relationCount = allRelations.filter((entry) => entry.sourceTaskId === task.id || entry.targetTaskId === task.id).length;
    const blockers = pack.unresolvedRequirements.filter((entry) => entry.affectedTaskIds.includes(task.id)).map((entry) => entry.standardKey).join("; ") || "—";
    return `| ${task.id} | ${task.title.replaceAll("|", "\\|")} | ${task.sectionKey} | ${task.taskType} | ${task.criticality} | ${task.mandatory ? "yes" : "no"} | ${task.initialAssessmentPolicy} | ${task.completionPolicy} | ${task.notApplicablePolicy} | ${task.verificationPolicy} | ${task.repeatPolicy} | ${task.items.length} | ${dependencyCount} | ${referenceCount} | ${relationCount} | ${blockers} | ${task.locationKey || task.locationSetKey || "—"} | ${Object.values(task.timing).filter(Boolean).join(" / ") || "—"} | ${task.sourceHash} |`;
  }).join("\n");
  const relationRows = [...pack.opening.relations, ...pack.closing.relations].map((entry) => `| ${entry.sourceTaskId} | ${entry.relationType} | ${entry.targetRoutineKey}/${entry.targetTaskId} | ${entry.metadata.deliveryKey || "—"} |`).join("\n");
  return `# Mesh Routine Content Pack v1\n\n> Generated from \`content/routine-engine/mesh-routine-content-v1.json\`. Do not edit by hand.\n\n- Pack: \`${pack.packKey}@${pack.packVersion}\`\n- Schema: \`${pack.schemaVersion}\`\n- SHA-256: \`${pack.packHash}\`\n- Opening: ${pack.opening.tasks.length} tasks in ${pack.opening.sections.length} sections\n- Closing: ${pack.closing.tasks.length} tasks in ${pack.closing.sections.length} sections\n- Double Shift: ${pack.doubleShiftSteps.length} system steps; no third template\n- Locations / sets / standards / references: ${pack.locations.length} / ${pack.locationSets.length} / ${pack.standards.length} / ${pack.references.length}\n- Unresolved publication/readiness blockers: ${pack.unresolvedRequirements.length}\n\nThe task audit below records the exact locked-source plus amendment provenance hash for all 83 O/C tasks. Each canonical task also retains its full instruction, structured-item text, done criteria, deviation/blocking rules and reference guidance in the JSON manifest.\n\n## Source and amendment provenance\n\n${pack.sourceDocuments.map((entry) => `- \`${entry.kind}\` — \`${entry.fileName}\`: \`${entry.sha256}\`${entry.hashScope ? ` (${entry.hashScope})` : ""}`).join("\n")}\n\n## Opening\n\n| ID | Title | Section | Type | Criticality | Required | Initial | Completion | N/A | Verification | Repeat | Items | Dependencies | References | Relations | Unresolved blockers | Location/set | Server timing | Provenance SHA-256 |\n|---|---|---|---|---|---|---|---|---|---|---|---:|---:|---:|---:|---|---|---|---|\n${rows(pack.opening.tasks)}\n\n## Closing\n\n| ID | Title | Section | Type | Criticality | Required | Initial | Completion | N/A | Verification | Repeat | Items | Dependencies | References | Relations | Unresolved blockers | Location/set | Server timing | Provenance SHA-256 |\n|---|---|---|---|---|---|---|---|---|---|---:|---:|---:|---:|---|---|---|---|\n${rows(pack.closing.tasks)}\n\n## Double Shift system steps\n\n${pack.doubleShiftSteps.map((step) => `- ${step.id} / \`${step.stepKey}\` — ${step.title}${step.systemGenerated ? " (system-generated)" : ""}; source \`${step.sourceHash}\``).join("\n")}\n\n### Bundle copy\n\n${Object.entries(pack.doubleShiftCopy).map(([key, value]) => `- **${key}**\n\n  \`\`\`text\n${value.split("\n").map((line) => `  ${line}`).join("\n")}\n  \`\`\``).join("\n")}\n\n## Unresolved publication and readiness blockers\n\n${pack.unresolvedRequirements.map((entry) => `- \`${entry.standardKey}\`: ${entry.label} (${entry.affectedTaskIds.join(", ")})`).join("\n")}\n\n## Logical references\n\n${pack.references.map((entry) => `- \`${entry.key}\` — ${entry.label}; tasks ${entry.taskIds.join(", ")}`).join("\n")}\n\n## Cross-run relations\n\n| Source | Type | Target | Delivery key |\n|---|---|---|---|\n${relationRows}\n`;
}
function generatedDoc(pack) {
  return generatedDocBase(pack)
    .replace("# Mesh Routine Content Pack v1", `# Mesh Routine Content Pack ${pack.packVersion}`)
    .replace("content/routine-engine/mesh-routine-content-v1.json", "content/routine-engine/mesh-routine-content-v1-5r.json");
}
function runtimeContractTaskProjection(task) {
  return {
    id: task.id,
    taskKey: task.taskKey,
    sourceType: task.sourceType,
    taskType: task.taskType,
    availabilityMode: task.availabilityMode,
    condition: task.condition,
    timing: task.timing,
    runtimeContractAlignment: task.metadata.runtimeContractAlignment || null,
  };
}
function runtimeContractInventoryProjection(pack) {
  const taskIds = new Set(["O13", "C08", "C28"]);
  const itemKeys = new Set(["inventory_standard_items", "eggs_present_and_to_standard", "fridge_clean_and_operating"]);
  return [...pack.opening.tasks, ...pack.closing.tasks]
    .filter((task) => taskIds.has(task.id))
    .flatMap((task) => task.items
      .filter((item) => itemKeys.has(item.key))
      .map((item) => ({
        taskId: task.id,
        itemKey: item.key,
        sourceKind: item.sourceKind,
        sourceConfig: item.sourceConfig,
        standardKey: item.standardKey || null,
        locationSetKey: item.locationSetKey || null,
      })))
    .sort((left, right) => `${left.taskId}/${left.itemKey}`.localeCompare(`${right.taskId}/${right.itemKey}`));
}
function runtimeContractAssetProjection(pack) {
  const task = pack.closing.tasks.find((entry) => entry.id === "C37");
  if (!task) throw new Error("C37 is missing from the runtime-contract asset projection.");
  const itemKeys = new Set([
    "active_asset_registry_items",
    "device_physically_accounted_for",
    "correct_charging_position",
    "charging_confirmed",
    "damage_or_fault_recorded",
    "event_transfer_evidence_when_required",
  ]);
  return task.items
    .filter((item) => itemKeys.has(item.key))
    .map((item) => ({
      taskId: task.id,
      itemKey: item.key,
      sourceKind: item.sourceKind,
      sourceConfig: item.sourceConfig,
      standardKey: item.standardKey || null,
      locationSetKey: item.locationSetKey || null,
    }))
    .sort((left, right) => `${left.taskId}/${left.itemKey}`.localeCompare(`${right.taskId}/${right.itemKey}`));
}
function runtimeContractPackProjection(pack) {
  const tasks = new Map([...pack.opening.tasks, ...pack.closing.tasks].map((task) => [task.id, task]));
  const selectedTasks = ["O15", "O22", "O23", "O37", "C14", "C15"].map((id) => {
    const task = tasks.get(id);
    if (!task) throw new Error(`${id} is missing from the runtime-contract projection.`);
    return runtimeContractTaskProjection(task);
  });
  const selectedDependencies = [...pack.opening.dependencies, ...pack.closing.dependencies]
    .filter((entry) => entry.predecessorTaskId === "C05" && ["C14", "C15"].includes(entry.successorTaskId));
  const companion = [...pack.opening.relations, ...pack.closing.relations]
    .find((entry) => entry.sourceTaskId === "O22" && entry.targetTaskId === "C22" && entry.relationType === "conditional_companion");
  if (!companion) throw new Error("O22 → C22 is missing from the runtime-contract projection.");
  return {
    packVersion: pack.packVersion,
    packHash: pack.packHash,
    tasks: selectedTasks,
    inventoryItems: runtimeContractInventoryProjection(pack),
    assetItems: runtimeContractAssetProjection(pack),
    dependencies: selectedDependencies,
    relations: [companion],
  };
}
function generatedRuntimeContractManifest() {
  const baselinePack = JSON.parse(readFileSync(RUNTIME_BASELINE_PACK_PATH, "utf8"));
  const targetPack = JSON.parse(readFileSync(RUNTIME_TARGET_PACK_PATH, "utf8"));
  const baseline = runtimeContractPackProjection(baselinePack);
  const target = runtimeContractPackProjection(targetPack);
  return `// Generated byte-derived projection of the reviewed 1.3R → 1.4R runtime-contract alignment.\n// Canonical pack hashes remain authoritative; unrelated fields are deliberately absent.\nexport const runtimeContractAlignmentBaseline = Object.freeze(${JSON.stringify(baseline, null, 2)});\n\nexport const runtimeContractAlignmentTarget = Object.freeze(${JSON.stringify(target, null, 2)});\n`;
}
function syncRuntimeContractManifest(pack, checkOnly) {
  const expected = generatedRuntimeContractManifest();
  if (checkOnly) {
    if (readFileSync(MANIFEST_PATH, "utf8") !== expected) throw new Error("Generated runtime-contract alignment manifest is stale.");
  } else writeFileSync(MANIFEST_PATH, expected);
}
function generatedSql(pack) {
  const payload = JSON.stringify(pack);
  if (payload.includes("$mesh_content$")) throw new Error("Pack payload contains the SQL dollar-quote sentinel.");
  return `${PACK_START}\ncreate or replace function public.routine_mesh_content_pack_v1()\nreturns jsonb\nlanguage sql\nimmutable\nset search_path = pg_catalog\nas $routine_mesh_content_pack_v1$\n  select $mesh_content$${payload}$mesh_content$::jsonb;\n$routine_mesh_content_pack_v1$;\n${PACK_END}`;
}
function syncSql(pack, checkOnly) {
  if (!existsSync(SQL_PATH)) return;
  const source = readFileSync(SQL_PATH, "utf8");
  const start = source.indexOf(PACK_START);
  const end = source.indexOf(PACK_END);
  if (start < 0 || end < start) throw new Error("Phase 10Y SQL is missing generated payload markers.");
  const expected = `${source.slice(0, start)}${generatedSql(pack)}${source.slice(end + PACK_END.length)}`;
  if (checkOnly) { if (source !== expected) throw new Error("Generated SQL content payload is stale."); }
  else writeFileSync(SQL_PATH, expected);
}
function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) if (argv[index].startsWith("--")) args.set(argv[index], argv[index + 1]?.startsWith("--") ? true : argv[++index] ?? true);
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.has("--bootstrap") || args.has("--verify-sources")) {
  const openingPath = resolve(String(args.get("--opening")));
  const closingPath = resolve(String(args.get("--closing")));
  const doubleShiftPath = resolve(String(args.get("--double-shift")));
  const pack = buildPack(readFileSync(openingPath, "utf8"), readFileSync(closingPath, "utf8"), readFileSync(doubleShiftPath, "utf8"),
    readFileSync(BASE_AMENDMENT_PATH, "utf8"), readFileSync(PRODUCTION_AMENDMENT_PATH, "utf8"),
    readFileSync(SERVICEWARE_AMENDMENT_PATH, "utf8"), readFileSync(AMENDMENT_PATH, "utf8"), readFileSync(FRIDGE_AMENDMENT_PATH, "utf8"));
  if (args.has("--verify-sources")) {
    const existing = JSON.parse(readFileSync(PACK_PATH, "utf8"));
    if (canonical(existing) !== canonical(pack)) throw new Error("Canonical pack differs from the three locked authoritative sources.");
    console.log(`Verified authoritative sources for ${pack.packKey}@${pack.packVersion} ${pack.packHash}`);
  } else {
    mkdirSync(dirname(PACK_PATH), { recursive: true });
    writeFileSync(PACK_PATH, `${JSON.stringify(pack, null, 2)}\n`);
    writeFileSync(DOC_PATH, generatedDoc(pack));
    syncSql(pack, false);
    syncAmendment(pack, false);
    syncRuntimeContractManifest(pack, false);
    console.log(`Generated ${pack.packKey}@${pack.packVersion} ${pack.packHash}`);
  }
} else {
  const pack = JSON.parse(readFileSync(PACK_PATH, "utf8"));
  validatePack(pack, true);
  const expectedDoc = generatedDoc(pack);
  const checkOnly = args.has("--check");
  if (checkOnly) {
    if (readFileSync(DOC_PATH, "utf8") !== expectedDoc) throw new Error("Generated content documentation is stale.");
  } else writeFileSync(DOC_PATH, expectedDoc);
  syncSql(pack, checkOnly);
  syncAmendment(pack, checkOnly);
  syncRuntimeContractManifest(pack, checkOnly);
  console.log(`${checkOnly ? "Verified" : "Synchronized"} ${pack.packKey}@${pack.packVersion} ${pack.packHash}`);
}

import {
  fridgeReviewStandards,
  workbarMilkFridgeStandard,
} from "./fridgeOperationalStandards.js";

const DEFAULT_PLACEHOLDER = "Reference image awaiting production upload";

const source = (pageId, title, lastReviewedAt = "2026-08-15", note = "") => ({
  system: "notion",
  pageId,
  title,
  lastReviewedAt,
  note,
});

const makeAngle = (key, label, operationalDescription, imageRole, options = {}) => ({
  key,
  stableKey: key,
  label,
  operationalDescription,
  description: operationalDescription,
  imageRole,
  required: options.required !== false,
  sourceNote: options.sourceNote || "Operations-approved source; stable production binary not uploaded yet.",
  placeholderText: options.placeholderText || DEFAULT_PLACEHOLDER,
  suggestedFileName: options.suggestedFileName || `${key}.jpg`,
  caption: options.caption || label,
  altText: options.altText || operationalDescription,
  proves: options.proves || operationalDescription,
  uploadStatus: "awaiting_production_upload",
  sourceStatus: options.sourceStatus || "notion_source_reference",
  compatibilityOnly: Boolean(options.compatibilityOnly),
});

const receivedAngle = (key, label, description, role, options = {}) =>
  makeAngle(key, label, description, role, {
    ...options,
    sourceStatus: "received_outside_codex",
    sourceNote: options.sourceNote || "Image received outside this Codex task; production upload is still pending.",
  });

const zone = (key, label, description, angles = [], options = {}) => ({
  key,
  label,
  description,
  required: options.required !== false,
  angles,
});

const guide = ({
  key,
  legacyId,
  venueKey,
  title,
  guideType,
  selectionKind,
  summary,
  operationalFacts = [],
  zones = [],
  finalWalkthrough = [],
  commonMisses = [],
  provenance = [],
  tags = [],
  sourceStatus = "current",
  notes = "",
}) => ({
  key,
  id: legacyId || key,
  venueKey,
  venueKeys: venueKey === "shared" ? ["atrium", "cornerbar", "all"] : [venueKey],
  title,
  guideType,
  selectionKind,
  scope: venueKey === "shared" ? "generic" : "venue",
  summary,
  operationalFacts,
  zones,
  finalWalkthrough,
  checklist: finalWalkthrough,
  commonMisses,
  provenance,
  source: provenance[0],
  sourceStatus,
  imageRefs: [],
  captions: [],
  notes,
  tags: [...new Set([venueKey, guideType, ...tags])],
});

const ATRIUM_RIG_SOURCE = source(
  "3b90d8d1-a8b2-80af-bfde-db0e9d7a9170",
  "RIGGING FURNITURE PHOTOS",
);
const ATRIUM_CAFE_SOURCE = source(
  "3b90d8d1-a8b2-8085-b7a5-c4d48fef2080",
  "CAFE = DEFAULT ATRIUM",
);
const CORNERBAR_RIG_SOURCE = source(
  "3b90d8d1-a8b2-8043-9041-fcdaed851e70",
  "RIGGING PHOTOS",
);
const SERVING_SOURCE = source(
  "3b90d8d1-a8b2-80ef-867c-c9ade5fedc0d",
  "SERVING STATIONS PHOTOS",
);
const ATRIUM_STAGE_SOURCE = source(
  "3b90d8d1-a8b2-80cb-a4f6-f6ee57a50555",
  "ATRIUM STAGE TECH DEFAULT",
  "2026-08-15",
  "Latest page resolves the microphone conflict at two handheld and two headset microphones.",
);
const CORNERBAR_STAGE_SOURCE = source(
  "3b90d8d1-a8b2-806a-a02c-fae86c5292de",
  "CORNERBAR STAGE TECH DEFAULT",
);
const CORNERBAR_EVENT_SOURCE = source(
  "3910d8d1-a8b2-8025-bce7-ed08132f23de",
  "CORNERBAR EVENT ROUTINES",
);
const WORKBAR_SOURCE = source(
  "3b90d8d1-a8b2-8093-b35e-de3d747ab890",
  "WORKBAR PHOTOS",
  "2026-08-15",
  "The updated source page is empty; the existing written Workbar standard is preserved.",
);
const WORKBAR_MILK_FRIDGE_SOURCE = {
  system: "operations",
  title: workbarMilkFridgeStandard.provenance,
  lastReviewedAt: "2026-08-15",
  note: "Written organization-owned standard; image awaiting upload.",
};
const WORKBAR_NON_ALCO_FRIDGE_SOURCE = {
  system: "operations",
  title: fridgeReviewStandards.workbarNonAlcoFridge.sourceStatus,
  lastReviewedAt: "2026-08-15",
  note: "Canonical saved-location reference; no separate refrigerator or image binary is claimed.",
};

const layoutWalkthrough = [
  "Compare the room from the entrance and the reverse angle",
  "Confirm furniture counts and exact placement facts",
  "Keep exits, accessible routes and service routes clear",
  "Check that every required zone matches its target state",
];

export const eventRigGuides = [
  guide({
    key: "atrium-cafe-default",
    legacyId: "atrium-standard-rig",
    venueKey: "atrium",
    title: "Restore Atrium Café / Default",
    guideType: "default_restore",
    selectionKind: "default_target",
    summary: "Return Atrium to the authoritative everyday target after a customer-specific setup.",
    operationalFacts: [
      "6 round café tables",
      "4 event chairs at each table",
      "24 event chairs in total",
      "One wardrobe rack on each side of the entrance",
      "Serving station uses 4 tables and 1 garbage bin",
    ],
    zones: [
      zone("finish-line", "Finish line", "See the complete room before rebuilding individual zones.", [
        receivedAngle("atrium-cafe", "Full main-floor overview", "Complete Atrium Café target viewed as the finish line.", "overview"),
        receivedAngle("atrium-cafe-room-flow", "Full-room flow", "Walking routes, guest flow, exits and the relationship between all zones.", "overview"),
      ]),
      zone("main-floor", "Main floor", "Rebuild the café table rhythm and chair count.", [
        receivedAngle("atrium-cafe-main-floor-tables", "Café tables and chairs", "Six round café tables with four event chairs at each table; twenty-four chairs total.", "zone"),
      ]),
      zone("upper-lounge", "Upper lounge", "Restore the sofa and lounge-chair arrangement above the stairs.", [
        receivedAngle("atrium-cafe-upper-lounge", "Upper lounge", "Complete upper lounge from the main approach.", "zone"),
        receivedAngle("atrium-cafe-upper-lounge-reverse", "Upper lounge · reverse", "Reverse comparison proving sofa and lounge-chair spacing.", "zone"),
      ]),
      zone("entrance-wardrobe", "Entrance & wardrobe", "Keep the arrival path clear and place one rack on each side.", [
        receivedAngle("atrium-cafe-entrance-wardrobe", "Entrance placement", "Entrance and wardrobe placement with one rack on each side.", "zone"),
        receivedAngle("atrium-cafe-entrance-wardrobe-detail", "Wardrobe spacing", "Detail proving both wardrobe racks and the clear arrival route.", "detail"),
      ]),
      zone("serving-zone", "Serving zone", "Restore the four-table station and garbage-bin position.", [
        receivedAngle("atrium-cafe-serving-zone", "Serving zone", "Serving zone in relation to the room and guest route.", "zone"),
        receivedAngle("atrium-cafe-serving-station-detail", "Serving station detail", "Four serving tables plus one garbage bin in the exact target arrangement.", "detail"),
      ]),
    ],
    finalWalkthrough: [
      "Count 6 round tables and 24 event chairs",
      "Confirm 4 chairs at every café table",
      "Confirm one wardrobe rack on each side of the entrance",
      "Confirm 4 serving tables and the garbage bin",
      "Walk the full guest, service and accessible routes",
    ],
    commonMisses: ["Leaving an extra chair at a table", "Blocking the arrival route with wardrobe racks", "Treating lounge angles as duplicates"],
    provenance: [ATRIUM_RIG_SOURCE, ATRIUM_CAFE_SOURCE],
    tags: ["cafe", "setup", "default"],
  }),
  guide({
    key: "atrium-cinema-maximum",
    venueKey: "atrium",
    title: "Atrium Cinema / Maximum Seating",
    guideType: "customer_layout",
    selectionKind: "customer_selectable",
    summary: "Build the booked cinema arrangement; maximum seating varies with orange-cushion occupancy.",
    operationalFacts: ["Maximum source range: 173–194 seats", "For smaller groups retain the rear upper lounge"],
    zones: [
      zone("cafe-orientation", "Cinema toward café side", "Compare the complete seating field from the café side.", [
        makeAngle("atrium-cinema-cafe", "Cinema · café side", "Maximum cinema seating from the café-side comparison point.", "overview"),
      ]),
      zone("stage-orientation", "Cinema toward stage", "Check seat orientation, stage sightlines and clear aisles.", [
        makeAngle("atrium-cinema-stage", "Cinema · stage side", "Cinema seating aligned to the stage with clear aisles.", "zone"),
      ]),
    ],
    finalWalkthrough: [...layoutWalkthrough, "Confirm the booked capacity rather than assuming maximum seating"],
    provenance: [ATRIUM_RIG_SOURCE, source("3b90d8d1-a8b2-807f-a71b-c38d8a820db6", "CINEMA (INCLUDES MAX SEATING)")],
    tags: ["cinema", "seating"],
  }),
  guide({
    key: "atrium-group-tables",
    venueKey: "atrium",
    title: "Atrium Group Tables",
    guideType: "customer_layout",
    selectionKind: "customer_selectable",
    summary: "Build the selected group-working layout without converting it into the default café target.",
    operationalFacts: ["7 table-and-chair groups maximum on the main floor", "Up to 15 groups only when all documented alternatives are used"],
    zones: [zone("group-map", "Group map", "Use all distinct source angles to prove table distribution.", [
      makeAngle("atrium-group-tables-overview", "Group tables · overview", "Full group-table arrangement and circulation.", "overview"),
      makeAngle("atrium-group-tables-lounge", "Group tables · lounge", "How lounge positions can support additional groups.", "zone"),
      makeAngle("atrium-group-tables-tribune", "Group tables · tribune", "Tribune-side alternative group positions.", "zone"),
    ])],
    finalWalkthrough: [...layoutWalkthrough, "Confirm the booked group count and which alternatives are in use"],
    provenance: [ATRIUM_RIG_SOURCE, source("3b90d8d1-a8b2-8062-b54c-d751312462f5", "GROUP TABLES")],
    tags: ["groups", "tables"],
  }),
  guide({
    key: "atrium-classroom",
    venueKey: "atrium",
    title: "Atrium Classroom",
    guideType: "customer_layout",
    selectionKind: "customer_selectable",
    summary: "Use the written classroom target while the source image slot remains an honest placeholder.",
    zones: [zone("classroom", "Classroom field", "Desk, chair, aisle and stage sightline target.", [
      makeAngle("atrium-classroom", "Classroom overview", "Complete classroom layout; source page currently has no usable binary in this task.", "overview"),
    ])],
    finalWalkthrough: layoutWalkthrough,
    commonMisses: ["Inventing a capacity where the current source gives none"],
    provenance: [ATRIUM_RIG_SOURCE, source("3b90d8d1-a8b2-80bb-a4ec-d5b2e4669b29", "CLASSROOM")],
    tags: ["classroom"],
  }),
  guide({
    key: "atrium-horseshoe",
    venueKey: "atrium",
    title: "Atrium Horseshoe",
    guideType: "customer_layout",
    selectionKind: "customer_selectable",
    summary: "Reconstruct the booked horseshoe from each meaningful comparison angle.",
    zones: [zone("horseshoe", "Horseshoe", "Check opening, table joins and sightlines.", [
      makeAngle("atrium-horseshoe-overview", "Horseshoe · entrance view", "Full horseshoe from the primary approach.", "overview"),
      makeAngle("atrium-horseshoe-stage", "Horseshoe · stage view", "Reverse view proving the opening and stage sightlines.", "zone"),
      makeAngle("atrium-horseshoe-join-detail", "Horseshoe · joins", "Detail proving table joins and chair spacing.", "detail"),
    ])],
    finalWalkthrough: layoutWalkthrough,
    provenance: [ATRIUM_RIG_SOURCE, source("3b90d8d1-a8b2-80f4-82f9-cd983a3db52c", "HORSESHOE")],
    tags: ["horseshoe"],
  }),
  guide({
    key: "atrium-buffet-table",
    venueKey: "atrium",
    title: "Atrium Buffet Table",
    guideType: "customer_layout",
    selectionKind: "customer_selectable",
    summary: "Preserve the named layout and written checks while the updated source page is blank.",
    zones: [zone("buffet", "Buffet table", "Booked buffet position, queue approach and service clearance.", [
      makeAngle("atrium-buffet-table", "Buffet table overview", "Complete Atrium buffet-table target awaiting an authoritative image.", "overview"),
    ])],
    finalWalkthrough: ["Confirm the booked buffet position", "Keep the queue and service route clear", "Do not infer dimensions from a blank source page"],
    provenance: [ATRIUM_RIG_SOURCE, source("3b90d8d1-a8b2-80f9-be38-f8d39624b444", "BUFFET TABLE")],
    tags: ["buffet"],
  }),
  guide({
    key: "atrium-mingle-concert",
    venueKey: "atrium",
    title: "Atrium Mingle / Concert",
    guideType: "customer_layout",
    selectionKind: "customer_selectable",
    summary: "Build the booked standing or concert flow and retain legacy comparison slots until source review closes them.",
    zones: [zone("mingle", "Mingle field", "Open guest flow, standing positions and stage approach.", [
      makeAngle("atrium-mingle-concert", "Mingle / concert overview", "Complete booked mingle or concert layout.", "overview"),
      makeAngle("atrium-standing", "Legacy standing comparison", "Preserved existing standing-layout slot pending source reconciliation.", "zone", { required: false, compatibilityOnly: true }),
      makeAngle("atrium-cocktail", "Legacy cocktail comparison", "Preserved existing cocktail-layout slot pending source reconciliation.", "zone", { required: false, compatibilityOnly: true }),
      makeAngle("atrium-empty", "Legacy empty-room comparison", "Preserved existing empty-room slot; not proof of a booked mingle layout.", "overview", { required: false, compatibilityOnly: true }),
      makeAngle("atrium-parking-lot", "Legacy Parking Lot comparison", "Preserved existing named slot pending authoritative source review.", "zone", { required: false, compatibilityOnly: true }),
    ])],
    finalWalkthrough: ["Confirm the booked variant", "Keep exits and service routes clear", "Do not treat a legacy optional slot as the selected target"],
    provenance: [ATRIUM_RIG_SOURCE, source("3b90d8d1-a8b2-8072-8428-c8b3bad7155f", "MINGLE / CONCERT")],
    tags: ["mingle", "concert", "standing"],
  }),
  guide({
    key: "cornerbar-default-restore",
    legacyId: "cornerbar-standard-service",
    venueKey: "cornerbar",
    title: "Restore Cornerbar",
    guideType: "default_restore",
    selectionKind: "default_target",
    summary: "Return furniture and room flow to the authoritative everyday Cornerbar target.",
    operationalFacts: ["This guide proves furniture placement only", "Bar and operational closing checks remain a separate linked guide"],
    zones: [
      zone("entrance-window-overview", "Finish line", "Start with the complete room from the entrance and window side.", [
        receivedAngle("cornerbar-event-ready", "Entrance / window overview", "Complete default furniture layout viewed from the entrance and window side.", "overview"),
      ]),
      zone("window-seating", "Window seating", "Restore the exact window-side seating rhythm.", [
        receivedAngle("cornerbar-default-window-seating", "Window seating", "Window-side furniture placement and clear route.", "zone"),
      ]),
      zone("centre-floor", "Centre floor", "Restore centre-floor spacing and circulation.", [
        receivedAngle("cornerbar-default-centre-floor", "Centre floor", "Centre furniture placement with walkable spacing.", "zone"),
      ]),
      zone("bar-stage", "Bar & stage side", "Compare the room edge against the bar and stage.", [
        receivedAngle("cornerbar-default-bar-stage", "Bar and stage side", "Furniture alignment along the bar and stage side.", "zone"),
      ]),
      zone("wardrobe-curtain", "Wardrobe & curtain", "Use the reverse view to finish wardrobe and curtain placement.", [
        receivedAngle("cornerbar-default-reverse-wardrobe", "Reverse room view", "Reverse whole-room comparison including wardrobe and curtain zone.", "overview"),
      ]),
    ],
    finalWalkthrough: [...layoutWalkthrough, "Open Cornerbar Bar & Closing Reset separately; furniture proof does not complete closing"],
    commonMisses: ["Using a customer layout as the default", "Claiming device, fridge or product checks from a furniture photo"],
    provenance: [CORNERBAR_RIG_SOURCE, source("3b90d8d1-a8b2-80d3-a522-c6d6d76de97e", "CAFE = DEFAULT CORNERBAR")],
    tags: ["cafe", "default", "furniture"],
  }),
  guide({
    key: "cornerbar-cinema",
    venueKey: "cornerbar",
    title: "Cornerbar Cinema",
    guideType: "customer_layout",
    selectionKind: "customer_selectable",
    summary: "Build the booked cinema arrangement; never use it as the default restore target.",
    zones: [zone("cinema", "Cinema field", "Seating, aisle and stage sightline target.", [
      makeAngle("cornerbar-cinema", "Cinema overview", "Complete Cornerbar cinema layout awaiting authoritative upload.", "overview"),
    ])],
    finalWalkthrough: layoutWalkthrough,
    provenance: [CORNERBAR_RIG_SOURCE, source("3b90d8d1-a8b2-800a-8fff-e7431bcfe41f", "CINEMA")],
    tags: ["cinema"],
  }),
  guide({
    key: "cornerbar-group-tables",
    venueKey: "cornerbar",
    title: "Cornerbar Group Tables",
    guideType: "customer_layout",
    selectionKind: "customer_selectable",
    summary: "Use all three received angles to reconstruct the customer-selected group-table layout.",
    zones: [zone("group-map", "Group-table map", "Three complementary views prove distribution, spacing and reverse comparison.", [
      receivedAngle("cornerbar-group-tables-overview", "Group tables · entrance", "Full customer-selected group-table layout from the entrance.", "overview"),
      receivedAngle("cornerbar-group-tables-stage", "Group tables · stage", "Stage-side comparison proving group placement.", "zone"),
      receivedAngle("cornerbar-group-tables-reverse", "Group tables · reverse", "Reverse comparison proving spacing and circulation.", "zone"),
    ])],
    finalWalkthrough: [...layoutWalkthrough, "Confirm this customer-selectable layout was actually booked"],
    provenance: [CORNERBAR_RIG_SOURCE, source("3b90d8d1-a8b2-8003-b1eb-d28bfcb813f1", "GROUP TABLES")],
    tags: ["groups", "tables"],
  }),
  guide({
    key: "cornerbar-classroom",
    venueKey: "cornerbar",
    title: "Cornerbar Classroom",
    guideType: "customer_layout",
    selectionKind: "customer_selectable",
    summary: "Keep the classroom category explicit while its source image remains a placeholder.",
    zones: [zone("classroom", "Classroom field", "Desk, chair, aisle and sightline target.", [
      makeAngle("cornerbar-classroom", "Classroom overview", "Complete Cornerbar classroom target awaiting authoritative upload.", "overview"),
    ])],
    finalWalkthrough: layoutWalkthrough,
    provenance: [CORNERBAR_RIG_SOURCE, source("3b90d8d1-a8b2-802b-953b-c1e355c68052", "CLASSROOM")],
    tags: ["classroom"],
  }),
  guide({
    key: "cornerbar-horseshoe",
    venueKey: "cornerbar",
    title: "Cornerbar Horseshoe",
    guideType: "customer_layout",
    selectionKind: "customer_selectable",
    summary: "Use both received angles; this is a customer-selectable layout, not the default.",
    zones: [zone("horseshoe", "Horseshoe", "Entrance and reverse comparisons prove the complete shape.", [
      receivedAngle("cornerbar-horseshoe-overview", "Horseshoe · entrance", "Complete horseshoe from the primary approach.", "overview"),
      receivedAngle("cornerbar-horseshoe-reverse", "Horseshoe · reverse", "Reverse comparison proving opening, joins and spacing.", "zone"),
    ])],
    finalWalkthrough: [...layoutWalkthrough, "Confirm the horseshoe layout was booked"],
    provenance: [CORNERBAR_RIG_SOURCE, source("3b90d8d1-a8b2-80d5-ab30-e319bed402aa", "HORSESHOE")],
    tags: ["horseshoe"],
  }),
  guide({
    key: "cornerbar-mingle-concert",
    venueKey: "cornerbar",
    title: "Cornerbar Mingle / Concert",
    guideType: "customer_layout",
    selectionKind: "customer_selectable",
    summary: "Protect open guest flow and stage approach without inventing facts from an empty source page.",
    zones: [zone("mingle", "Mingle field", "Open-floor, stage and service-route target.", [
      makeAngle("cornerbar-mingle-concert", "Mingle / concert overview", "Complete customer-selected mingle or concert layout awaiting authoritative upload.", "overview"),
    ])],
    finalWalkthrough: ["Confirm the booked layout", "Keep guest and service routes clear", "Check stage approach and exits"],
    provenance: [CORNERBAR_RIG_SOURCE, source("3b90d8d1-a8b2-8043-8c48-e9e09f022d3b", "MINGLE / CONCERT")],
    tags: ["mingle", "concert"],
  }),
  guide({
    key: "atrium-serving-stations",
    venueKey: "atrium",
    title: "Atrium Serving Stations",
    guideType: "service_station",
    selectionKind: "operational_target",
    summary: "Build the ordered station from the micro-default, then adapt only for the client order.",
    operationalFacts: [
      "Wash tables first",
      "Set cups and glasses from guest count",
      "Fill water containers half with ice, then water",
      "Record every new coffee placed out for counting and invoicing",
      "Add products only when they are in the order",
    ],
    zones: [
      zone("small-station", "Small station", "Guest-count-adjusted compact station.", [makeAngle("atrium-drinks-under-25", "Drinks · under 25", "Small Atrium drinks-station target.", "overview")]),
      zone("large-station", "Large station", "Guest-count-adjusted expanded station.", [makeAngle("atrium-drinks-over-25", "Drinks · over 25", "Expanded Atrium drinks-station target.", "overview")]),
      zone("coffee-tea", "Coffee, water & tea", "Core coffee, water and tea micro-default.", [makeAngle("atrium-coffee-tea", "Atrium coffee / water / tea", "Complete Atrium coffee, water and tea station.", "zone")]),
    ],
    finalWalkthrough: ["Tables are washed", "Cups and glasses match guest count", "Water is half ice then water", "Coffee count sheet is ready", "Ordered additions are present"],
    commonMisses: ["Using a fixed cup count", "Forgetting the coffee invoice record", "Adding unordered products"],
    provenance: [SERVING_SOURCE],
    tags: ["coffee", "tea", "water", "catering"],
  }),
  guide({
    key: "cornerbar-serving-stations",
    venueKey: "cornerbar",
    title: "Cornerbar Serving Stations",
    guideType: "service_station",
    selectionKind: "operational_target",
    summary: "Use the complete micro-default, then adjust for guest count and ordered additions.",
    operationalFacts: ["Wash tables first", "Guest count controls cups and glasses", "Water is half ice, then water", "Record every new coffee placed out"],
    zones: [zone("serving-overview", "Serving station", "Complete ordered serving station with a clear guest and refill route.", [
      makeAngle("cornerbar-serving-station-overview", "Cornerbar serving station", "Complete Cornerbar serving-station target adjusted for guest count and order.", "overview"),
    ])],
    finalWalkthrough: ["Tables are washed", "Cups and glasses match guest count", "Water is half ice then water", "Coffee count sheet is ready", "Ordered additions are present"],
    provenance: [SERVING_SOURCE, CORNERBAR_EVENT_SOURCE],
    tags: ["coffee", "tea", "water", "catering"],
  }),
  guide({
    key: "coffee-water-tea",
    legacyId: "coffee-water-station",
    venueKey: "shared",
    title: "Coffee, Water & Tea",
    guideType: "service_station",
    selectionKind: "operational_target",
    summary: "Use the complete micro-default, then adjust for guest count, break timing and ordered additions.",
    operationalFacts: ["Complete the station at least 15 minutes before service", "Water is half ice, then water", "Record every new coffee placed out"],
    zones: [zone("complete-station", "Complete station", "The received Cornerbar angle and retained shared comparison slots prove the full station and refill plan.", [
      receivedAngle("cornerbar-coffee-water-tea-complete", "Complete Cornerbar station", "Complete coffee, water and tea micro-default for Cornerbar.", "overview"),
      makeAngle("coffee-tea-complete", "Shared station comparison", "Complete shared coffee and tea station comparison.", "zone"),
      makeAngle("coffee-tea-refill", "Refill stock", "Correct refill stock kept out of guest view.", "detail"),
    ])],
    finalWalkthrough: ["Station is complete 15 minutes before service", "Cups and glasses match guest count", "Water is half ice then water", "Tea choices and hot water are obvious", "Coffee and refill counts are ready"],
    provenance: [SERVING_SOURCE, CORNERBAR_EVENT_SOURCE],
    tags: ["coffee", "tea", "water", "catering", "conference"],
  }),
  guide({
    key: "atrium-stage-tech-default",
    venueKey: "atrium",
    title: "Atrium Stage & Tech Default",
    guideType: "stage_tech",
    selectionKind: "default_target",
    summary: "Restore the latest authoritative stage and technical starting point before booked changes.",
    operationalFacts: ["1 high table", "2 handheld microphones", "2 headset microphones", "HDMI plus USB-C adaptor", "4 receivers plus 2 extra handheld receivers", "Extra new batteries", "Green DI box"],
    zones: [
      zone("stage-overview", "Stage overview", "Complete default equipment placement.", [makeAngle("atrium-stage-tech-overview", "Complete stage default", "Full Atrium stage and technical default.", "overview")]),
      zone("inputs", "Inputs & routing", "HDMI, USB-C adaptor and cable routing.", [makeAngle("atrium-hdmi-inputs", "HDMI and USB-C", "HDMI input, USB-C adaptor and safe cable routing.", "detail")]),
      zone("microphones", "Microphones & receivers", "Exact latest microphone and receiver quantities.", [makeAngle("atrium-microphones", "Microphones and receivers", "Two handheld, two headset, four receivers and two extra handheld receivers.", "detail")]),
      zone("power-light", "Batteries & stage light", "New spare batteries and controller position in the sound rack.", [makeAngle("atrium-clicker-batteries", "Batteries and control", "New spare batteries and stage-light control position.", "detail")]),
    ],
    finalWalkthrough: ["Count 2 handheld and 2 headset microphones", "Confirm all 6 receivers", "Confirm HDMI and USB-C adaptor", "Confirm extra new batteries and green DI box", "Test the stage light and screen"],
    commonMisses: ["Using the superseded three-headset/throwable-microphone list", "Silently resolving a quantity from memory"],
    provenance: [ATRIUM_STAGE_SOURCE],
    tags: ["stage", "tech", "microphone"],
  }),
  guide({
    key: "cornerbar-stage-tech-default",
    venueKey: "cornerbar",
    title: "Cornerbar Stage & Tech Default",
    guideType: "stage_tech",
    selectionKind: "default_target",
    summary: "Restore the equipment that always belongs on the Cornerbar stage.",
    operationalFacts: ["1 high table", "1 tablet", "1 handheld microphone", "1 headset microphone", "HDMI plus USB-C adaptor", "Extra new batteries"],
    zones: [
      zone("stage-overview", "Stage overview", "Complete default equipment placement.", [makeAngle("cornerbar-stage-tech-overview", "Complete stage default", "Full Cornerbar stage and technical default.", "overview")]),
      zone("controls", "Stage light", "Controller under the left bar and master position.", [makeAngle("cornerbar-stage-light-control", "Stage-light control", "Stage-light controller position under the left bar.", "detail")]),
    ],
    finalWalkthrough: ["Confirm the high table and tablet", "Confirm 1 handheld and 1 headset microphone", "Confirm HDMI, USB-C adaptor and new batteries", "Test the stage light and screen"],
    provenance: [CORNERBAR_STAGE_SOURCE],
    tags: ["stage", "tech", "microphone"],
  }),
  guide({
    key: "atrium-bar-ready-closed",
    legacyId: "atrium-popup-bar-1",
    venueKey: "atrium",
    title: "Atrium Bar Ready / Bar Closed",
    guideType: "bar_ready",
    selectionKind: "operational_target",
    summary: "Compare the bar against the correct ready or closed target, not a room-layout image.",
    zones: [
      zone("bar-ready", "Bar ready", "Stock, clean glassware, ice, tools and working surface.", [makeAngle("atrium-bar-ready", "Atrium bar ready", "Complete Atrium bar-ready target.", "overview")]),
      zone("bar-closed", "Bar closed", "Cleaned, restocked and product-handled final target.", [makeAngle("atrium-bar-closed", "Atrium bar closed", "Complete Atrium bar-closed target.", "overview")]),
    ],
    finalWalkthrough: ["Confirm the booked product range", "Check clean glassware, ice and tools", "Seal, date and refrigerate opened wine", "Complete the approved closed reset"],
    provenance: [source("3910d8d1-a8b2-8073-afe2-cbbe4d281144", "ATRIUM EVENT ROUTINES")],
    tags: ["bar", "ready", "closed"],
  }),
  guide({
    key: "cornerbar-bar-ready",
    venueKey: "cornerbar",
    title: "Cornerbar Bar Ready",
    guideType: "bar_ready",
    selectionKind: "operational_target",
    summary: "Prove the bar is ready independently of the furniture restore.",
    zones: [zone("bar-ready", "Bar ready", "Stock, ice, glassware, devices, tools and clean working surface.", [
      makeAngle("cornerbar-bar-ready", "Cornerbar bar ready", "Complete operational bar-ready target.", "overview"),
    ])],
    finalWalkthrough: ["Check stock, ice and clean glassware", "Confirm devices and terminals are ready", "Confirm tools and garnish", "Keep the restock route clear"],
    provenance: [CORNERBAR_EVENT_SOURCE],
    tags: ["bar", "ready"],
  }),
  guide({
    key: "cornerbar-bar-closing-reset",
    venueKey: "cornerbar",
    title: "Cornerbar Bar & Closing Reset",
    guideType: "closing_reset",
    selectionKind: "operational_target",
    summary: "Complete the operational close after the furniture target is restored; a room photo never proves these checks.",
    operationalFacts: ["Devices charging", "Fridges and internal lights remain on", "Each fridge resolves its current saved location standard", "Labels reviewed", "Bottles washed", "Sliced fruit discarded", "Sparkling wine dated with date and time"],
    zones: [
      zone("final-reset", "Final reset", "Current wide comparison; future detail images remain explicit placeholders.", [makeAngle("cornerbar-final-reset", "Cornerbar final reset", "Whole closing-reset target without implying unseen device or product checks.", "overview")]),
      zone("device-charge", "Devices", "Charging position and powered-down checks.", [makeAngle("cornerbar-closing-devices", "Device closing checks", "Approved charging and powered-down target.", "detail", { required: false })], { required: false }),
      zone("product-close", "Fridges & products", "Fridge, label, bottle, fruit and sparkling-wine checks.", [makeAngle("cornerbar-closing-products", "Product closing checks", "Approved fridge and product-handling target.", "detail", { required: false })], { required: false }),
    ],
    finalWalkthrough: ["Confirm devices are charging in approved positions", "Refill each Cornerbar fridge to its current saved location standard", "Keep every Cornerbar refrigerator and its internal light on", "Remove superseded labels and wash applicable bottles", "Discard sliced fruit and citrus", "Date sparkling wine with date and time", "Complete the final security close"],
    commonMisses: ["Treating correct furniture as proof of operational closing", "Claiming a future detail image already exists"],
    provenance: [CORNERBAR_EVENT_SOURCE],
    tags: ["bar", "closing", "reset"],
  }),
  guide({
    key: "used-dishes",
    venueKey: "shared",
    title: "Used Dishes",
    guideType: "service_station",
    selectionKind: "operational_target",
    summary: "Create an obvious, safe return point away from clean service flow.",
    zones: [zone("return-point", "Return point", "Tray, separation and guest approach target.", [makeAngle("atrium-used-dishes", "Used-dish return", "Complete used-dish return-point standard.", "overview")])],
    finalWalkthrough: ["Return point is obvious", "Clean and used items stay separate", "Guest and service routes remain clear"],
    provenance: [SERVING_SOURCE],
    tags: ["dishes", "return"],
  }),
  guide({
    key: "check-in",
    venueKey: "shared",
    title: "Check-in",
    guideType: "service_station",
    selectionKind: "operational_target",
    summary: "Set a calm, visible check-in point without blocking arrival flow.",
    zones: [zone("check-in", "Check-in point", "Complete unattended check-in target.", [makeAngle("atrium-check-in", "Check-in overview", "Unattended check-in standard and clear arrival route.", "overview")])],
    finalWalkthrough: ["Check-in is visible on arrival", "Instructions are readable", "The arrival and wardrobe routes remain clear"],
    provenance: [SERVING_SOURCE],
    tags: ["check-in", "arrival"],
  }),
  guide({
    key: "food-allergen-stations",
    legacyId: "buffet-food-station",
    venueKey: "shared",
    title: "Food & Allergen Stations",
    guideType: "service_station",
    selectionKind: "operational_target",
    summary: "Build the ordered food presentation with visible allergen information and complete serviceware.",
    zones: [
      zone("main-food", "Main food", "Complete main food-station target.", [makeAngle("food-main", "Main food station", "Complete food service presentation.", "overview")]),
      zone("snacks", "Snacks & pastry", "Snack and pastry presentation.", [makeAngle("food-snacks", "Snacks and pastry", "Ordered snack and pastry target.", "zone")]),
      zone("cheese-jam", "Cheese & jam", "Cheese, jam and accompaniment presentation.", [makeAngle("food-cheese-jam", "Cheese and jam", "Ordered cheese, jam and accompaniment target.", "zone")]),
      zone("allergens", "Allergen information", "Visible labels with allergens emphasized.", [makeAngle("food-allergens", "Allergen signs", "Visible food labels with allergens emphasized.", "detail")]),
      zone("atrium-example", "Atrium comparison", "Preserved current Atrium food slot.", [makeAngle("atrium-food", "Atrium food example", "Atrium-specific food-station comparison.", "overview", { required: false, compatibilityOnly: true })], { required: false }),
    ],
    finalWalkthrough: ["Every ordered item is present", "Plates, cutlery, napkins and serving tools are ready", "Allergen information is visible", "Waste and used-dish routes are clear"],
    provenance: [SERVING_SOURCE],
    tags: ["food", "allergen", "buffet"],
  }),
  guide({
    key: "water-mineral-water",
    venueKey: "shared",
    title: "Water & Mineral Water",
    guideType: "service_station",
    selectionKind: "operational_target",
    summary: "Present water correctly and add mineral water only when ordered.",
    operationalFacts: ["Water containers are half ice, then water", "Count placed-out and remaining mineral water for invoicing"],
    zones: [zone("water", "Water service", "Water, glasses and ordered mineral water.", [makeAngle("atrium-water", "Water and mineral water", "Complete water-service target with ordered mineral-water additions.", "overview")])],
    finalWalkthrough: ["Water is half ice then water", "Glasses match guest count", "Ordered mineral water is counted", "Refill and invoice records are ready"],
    provenance: [SERVING_SOURCE],
    tags: ["water", "mineral-water"],
  }),
  guide({
    key: "wine-beer",
    venueKey: "shared",
    title: "Wine & Beer",
    guideType: "service_station",
    selectionKind: "operational_target",
    summary: "Build the ordered hosted or self-service beverage target and keep invoice counts current.",
    zones: [zone("wine-beer", "Wine & beer", "Complete ordered beverage presentation.", [makeAngle("atrium-wine-beer", "Wine and beer station", "Complete ordered wine and beer station target.", "overview")])],
    finalWalkthrough: ["Only ordered products are displayed", "Glassware and ice are ready", "Placed-out quantities are recorded", "Refill stock is accessible but out of guest view"],
    provenance: [SERVING_SOURCE],
    tags: ["wine", "beer", "drinks"],
  }),
  guide({
    key: "workbar-conference-setup",
    venueKey: "workbar",
    title: "Workbar Conference Setup",
    guideType: "service_station",
    selectionKind: "preserved_existing",
    summary: "Preserved written standard: the updated Workbar Photos source is empty and must not erase existing guidance.",
    operationalFacts: ["Check screen or projector", "Prepare water, coffee and tea", "Set signs and host information", "Confirm breaks, lunch and refill timing"],
    zones: [zone("written-standard", "Written standard", "Existing Workbar operational guidance remains authoritative until an updated source is supplied.", [], { required: true })],
    finalWalkthrough: ["Check screen or projector", "Prepare water, coffee and tea", "Set signs and host information", "Confirm breaks, lunch and refill timing"],
    provenance: [WORKBAR_SOURCE],
    sourceStatus: "source_empty_preserved",
    notes: "The updated Notion page named Workbar Photos is empty; the existing written standard is preserved.",
    tags: ["conference", "workbar"],
  }),
  guide({
    key: "workbar-milk-fridge-standard",
    venueKey: "workbar",
    title: workbarMilkFridgeStandard.displayName,
    guideType: "default_restore",
    selectionKind: "default_target",
    summary: workbarMilkFridgeStandard.subtitle,
    operationalFacts: [
      "Top shelf: exactly 2 regular milk cartons and 2 Oatly cartons",
      "Lower shelves: opened wine bottles with visible date labels only",
      "No extra milk, unopened wine, event products, food or general temporary storage",
      "Always active and never overridden by an event or shift type",
    ],
    zones: [
      zone("full-refrigerator", "Full refrigerator", "Complete cabinet and permanent shelf allocation. Written standard only; image awaiting upload.", [], { required: true }),
      zone("top-shelf", "Top shelf", "Exactly 2 regular milk cartons and 2 Oatly cartons. Written standard only; image awaiting upload.", [], { required: true }),
      zone("lower-shelves", "Lower shelves", "Opened and visibly date-labelled wine only. Written standard only; image awaiting upload.", [], { required: true }),
    ],
    finalWalkthrough: workbarMilkFridgeStandard.doneCriteria,
    commonMisses: ["Checking only the 2 + 2 milk reserve", "Using lower shelves for temporary event products", "Accepting an opened bottle without a visible date label"],
    provenance: [WORKBAR_MILK_FRIDGE_SOURCE],
    sourceStatus: "operations_approved_image_awaiting_upload",
    notes: "Operations-approved standard · image awaiting upload. No image binary is claimed or uploaded.",
    tags: ["milk", "fridge", "wine", "default", "always-active"],
  }),
  guide({
    key: "workbar-non-alcoholic-fridge-standard",
    venueKey: "workbar",
    title: fridgeReviewStandards.workbarNonAlcoFridge.displayName,
    guideType: "default_restore",
    selectionKind: "default_target",
    summary: "Canonical Workbar refrigerator resolved from its current manager-maintained saved location standard.",
    operationalFacts: [
      "Resolve the current saved location standard dynamically",
      "Clean, check dates and FIFO, and restore placement and fronting",
      "Close the door and confirm normal operation",
      "Keep the refrigerator and its internal light on",
    ],
    zones: [
      zone("full-refrigerator", "Full refrigerator", "Canonical saved-location reference. Written standard only; image awaiting upload.", [], { required: true }),
    ],
    finalWalkthrough: fridgeReviewStandards.workbarNonAlcoFridge.doneCriteria,
    commonMisses: ["Using a stale or incomplete saved standard", "Leaving date or FIFO issues unresolved", "Switching off the refrigerator or its internal light"],
    provenance: [WORKBAR_NON_ALCO_FRIDGE_SOURCE],
    sourceStatus: "saved_location_standard_image_awaiting_upload",
    notes: "Current saved location standard · image awaiting upload. No duplicate refrigerator, angle or image binary is created.",
    tags: ["fridge", "saved-standard", "default", "always-on"],
  }),
  guide({
    key: "communitystage-presentation",
    venueKey: "communitystage",
    title: "CommunityStage Presentation / Stage Setup",
    guideType: "stage_tech",
    selectionKind: "preserved_existing",
    summary: "Preserved written standard; no updated operations reference set was found for this venue.",
    zones: [],
    finalWalkthrough: ["Check microphones", "Check screen input", "Test sound", "Confirm speaker position"],
    notes: "No updated operations reference set was found for this venue in the Event Routines page.",
    tags: ["stage", "microphone", "screen", "presentation"],
  }),
  guide({
    key: "loungevenue-mingling",
    venueKey: "loungevenue",
    title: "LoungeVenue Mingling Setup",
    guideType: "customer_layout",
    selectionKind: "preserved_existing",
    summary: "Preserved written standard; no updated operations reference set was found for this venue.",
    zones: [],
    finalWalkthrough: ["Set furniture for flow", "Check lighting", "Place bins", "Confirm bar and restock route"],
    notes: "No updated operations reference set was found for this venue in the Event Routines page.",
    tags: ["mingling", "afterwork", "ambience"],
  }),
];

const venueDefinitions = [
  { key: "atrium", label: "Atrium", sortOrder: 0 },
  { key: "cornerbar", label: "Cornerbar", sortOrder: 1 },
  { key: "shared", label: "Shared service standards", sortOrder: 2 },
  { key: "workbar", label: "Workbar", sortOrder: 3 },
];

eventRigGuides.forEach((item, guideSortOrder) => {
  item.sortOrder = guideSortOrder;
  item.zones.forEach((zoneItem, zoneSortOrder) => {
    zoneItem.venueKey = item.venueKey;
    zoneItem.guideKey = item.key;
    zoneItem.sortOrder = zoneSortOrder;
    zoneItem.angles = zoneItem.angles.map((angleItem, angleSortOrder) => ({
      ...angleItem,
      venueKey: item.venueKey,
      guideKey: item.key,
      zoneKey: zoneItem.key,
      sortOrder: angleSortOrder,
      status: "pending-stable-upload",
    }));
  });
  item.requiredImageSlots = item.zones.flatMap((zoneItem) =>
    zoneItem.angles.map((angleItem) => ({
      id: angleItem.stableKey,
      label: angleItem.label,
      description: angleItem.operationalDescription,
      status: angleItem.status,
      required: angleItem.required,
      venueKey: angleItem.venueKey,
      guideKey: angleItem.guideKey,
      zoneKey: angleItem.zoneKey,
      imageRole: angleItem.imageRole,
      placeholderText: angleItem.placeholderText,
    })),
  );
});

export const eventVisualAngles = Object.freeze(
  eventRigGuides.flatMap((item) => item.zones.flatMap((zoneItem) => zoneItem.angles)),
);

export const eventVisualReferenceKeys = Object.freeze(
  eventVisualAngles.map((angleItem) => angleItem.stableKey),
);

export const eventVisualVenues = Object.freeze(
  venueDefinitions.map((venue) => ({
    ...venue,
    guides: eventRigGuides
      .filter((item) => item.venueKey === venue.key)
      .sort((left, right) => left.sortOrder - right.sortOrder),
  })),
);

export const eventVisualLibrary = Object.freeze({
  schemaVersion: "phase10x-v1",
  lastReviewedAt: "2026-08-15",
  guideTypes: Object.freeze([
    "default_restore",
    "customer_layout",
    "service_station",
    "stage_tech",
    "bar_ready",
    "closing_reset",
  ]),
  venues: eventVisualVenues,
  guides: eventRigGuides,
  angles: eventVisualAngles,
  referenceKeys: eventVisualReferenceKeys,
});

export function guideForVisualReferenceKey(referenceKey) {
  const angleItem = eventVisualAngles.find((candidate) => candidate.stableKey === referenceKey);
  return angleItem
    ? eventRigGuides.find((candidate) => candidate.key === angleItem.guideKey) || null
    : null;
}

export function rigGuidesForSignals(signals = {}) {
  const venueKeys = new Set((signals.venues || []).map((value) => String(value).toLowerCase()));
  const genericSignalKeys = new Set(
    [...(signals.keywords || []), ...(signals.zones || [])].map((value) => String(value).toLowerCase()),
  );
  return eventRigGuides.filter((item) => {
    if (item.venueKey === "shared") return item.tags.some((tag) => genericSignalKeys.has(tag));
    return venueKeys.has(item.venueKey) || item.tags.some((tag) => genericSignalKeys.has(tag));
  });
}

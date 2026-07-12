export const eventRigGuides = [
  {
    id: "atrium-standard-rig",
    title: "Atrium standard event rig",
    scope: "venue",
    venueKeys: ["atrium"],
    tags: ["atrium", "setup", "bar", "mingling"],
    imageRefs: [],
    captions: [],
    checklist: ["Confirm furniture layout", "Check guest flow", "Place bins and water station", "Confirm sound/light mood"],
    notes: "Rig image not added yet.",
  },
  {
    id: "atrium-popup-bar-1",
    title: "Atrium pop-up bar 1",
    scope: "venue",
    venueKeys: ["atrium"],
    tags: ["atrium", "bar", "drinks"],
    imageRefs: [],
    captions: [],
    checklist: ["Check beer/wine stock", "Prepare glassware", "Confirm payment terminal", "Agree restock route"],
    notes: "Rig image not added yet.",
  },
  {
    id: "workbar-conference-setup",
    title: "Workbar conference setup",
    scope: "venue",
    venueKeys: ["workbar"],
    tags: ["conference", "presentation", "coffee", "water"],
    imageRefs: [],
    captions: [],
    checklist: ["Check screen/projector", "Prepare water and coffee", "Set signs", "Confirm break timing"],
    notes: "Rig image not added yet.",
  },
  {
    id: "cornerbar-standard-service",
    title: "Cornerbar standard service setup",
    scope: "venue",
    venueKeys: ["cornerbar", "bar"],
    tags: ["cornerbar", "bar", "service"],
    imageRefs: [],
    captions: [],
    checklist: ["Unlock and check access", "Stock fast sellers", "Prepare ice/glassware", "Confirm queue flow"],
    notes: "Rig image not added yet.",
  },
  {
    id: "communitystage-presentation",
    title: "CommunityStage presentation/stage setup",
    scope: "venue",
    venueKeys: ["communitystage"],
    tags: ["stage", "microphone", "screen", "presentation"],
    imageRefs: [],
    captions: [],
    checklist: ["Check microphones", "Check screen input", "Test sound", "Confirm speaker position"],
    notes: "Rig image not added yet.",
  },
  {
    id: "loungevenue-mingling",
    title: "LoungeVenue mingling setup",
    scope: "venue",
    venueKeys: ["loungevenue"],
    tags: ["mingling", "afterwork", "ambience"],
    imageRefs: [],
    captions: [],
    checklist: ["Set furniture for flow", "Check lighting", "Place bins", "Confirm bar/restock route"],
    notes: "Rig image not added yet.",
  },
  {
    id: "coffee-water-station",
    title: "Coffee and water station",
    scope: "generic",
    venueKeys: ["workbar", "atrium", "all"],
    tags: ["coffee", "tea", "water", "catering", "conference"],
    imageRefs: [],
    captions: [],
    checklist: ["Start coffee early", "Prepare cups/napkins", "Label water/mineral water", "Track usage for invoice"],
    notes: "Rig image not added yet.",
  },
  {
    id: "buffet-food-station",
    title: "Buffet/food station",
    scope: "generic",
    venueKeys: ["support", "all"],
    tags: ["food", "catering", "buffet", "allergens"],
    imageRefs: [],
    captions: [],
    checklist: ["Confirm serving time", "Set allergen labels", "Prepare plates/cutlery", "Agree dish return plan"],
    notes: "Rig image not added yet.",
  },
];

export function rigGuidesForSignals(signals = {}) {
  const venueKeys = new Set(
    (signals.venues || []).map((value) => String(value).toLowerCase()),
  );
  const genericSignalKeys = new Set([
    ...(signals.keywords || []),
    ...(signals.zones || []),
  ].map((value) => String(value).toLowerCase()));
  return eventRigGuides.filter((guide) => {
    if (guide.scope === "venue")
      return guide.venueKeys.some((key) => venueKeys.has(key));
    return guide.tags.some((tag) => genericSignalKeys.has(tag));
  });
}

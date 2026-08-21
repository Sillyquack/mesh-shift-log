export const WORKBAR_VISUAL_STANDARD_KEYS = Object.freeze({
  BAR_MILK_FRIDGE: 'workbar-bar-milk-fridge-standard',
  NON_ALCO_FRIDGE: 'workbar-non-alco-fridge-standard',
});

export const SELF_SERVICE_VISUAL_STANDARD_KEYS = Object.freeze({
  OVERVIEW: 'self-service-station-overview-standard',
  COFFEE_SERVICE: 'self-service-coffee-service-standard',
  TAKEAWAY_COFFEE: 'self-service-takeaway-coffee-standard',
  TEA_CONDIMENTS: 'self-service-tea-condiments-standard',
  GLASSWARE_SERVICEWARE: 'self-service-glassware-serviceware-standard',
  SNACKS: 'self-service-snacks-standard',
  FOOD_DISPLAY: 'self-service-food-display-standard',
  BACKSTOCK: 'self-service-backstock-standard',
});

const visualStandard = ({ id, label, area, section, src = '' }) => Object.freeze({
  id,
  label,
  area,
  section,
  src,
  bundledFallbackSrc: src,
  status: src ? 'bundled-fallback' : 'awaiting-approved-photo',
});

export const workbarVisualStandards = Object.freeze({
  [WORKBAR_VISUAL_STANDARD_KEYS.BAR_MILK_FRIDGE]: visualStandard({
    id: WORKBAR_VISUAL_STANDARD_KEYS.BAR_MILK_FRIDGE,
    label: 'Workbar Bar milk-fridge standard',
    area: 'Workbar',
    section: 'Fridges',
    src: './guides/workbar-bar-milk-fridge-standard.jpeg',
  }),
  [WORKBAR_VISUAL_STANDARD_KEYS.NON_ALCO_FRIDGE]: visualStandard({
    id: WORKBAR_VISUAL_STANDARD_KEYS.NON_ALCO_FRIDGE,
    label: 'Workbar non-alcoholic fridge standard',
    area: 'Workbar',
    section: 'Fridges',
    src: './guides/workbar-non-alco-fridge-standard.jpeg',
  }),
  [SELF_SERVICE_VISUAL_STANDARD_KEYS.OVERVIEW]: visualStandard({
    id: SELF_SERVICE_VISUAL_STANDARD_KEYS.OVERVIEW,
    label: 'Self-Service Station overview standard',
    area: 'Self-Service Station',
    section: 'Overview',
  }),
  [SELF_SERVICE_VISUAL_STANDARD_KEYS.COFFEE_SERVICE]: visualStandard({
    id: SELF_SERVICE_VISUAL_STANDARD_KEYS.COFFEE_SERVICE,
    label: 'Self-Service coffee service standard',
    area: 'Self-Service Station',
    section: 'Coffee service',
  }),
  [SELF_SERVICE_VISUAL_STANDARD_KEYS.TAKEAWAY_COFFEE]: visualStandard({
    id: SELF_SERVICE_VISUAL_STANDARD_KEYS.TAKEAWAY_COFFEE,
    label: 'Self-Service takeaway coffee standard',
    area: 'Self-Service Station',
    section: 'Takeaway coffee',
  }),
  [SELF_SERVICE_VISUAL_STANDARD_KEYS.TEA_CONDIMENTS]: visualStandard({
    id: SELF_SERVICE_VISUAL_STANDARD_KEYS.TEA_CONDIMENTS,
    label: 'Self-Service tea and condiments standard',
    area: 'Self-Service Station',
    section: 'Tea & condiments',
  }),
  [SELF_SERVICE_VISUAL_STANDARD_KEYS.GLASSWARE_SERVICEWARE]: visualStandard({
    id: SELF_SERVICE_VISUAL_STANDARD_KEYS.GLASSWARE_SERVICEWARE,
    label: 'Self-Service glassware and serviceware standard',
    area: 'Self-Service Station',
    section: 'Glassware & serviceware',
  }),
  [SELF_SERVICE_VISUAL_STANDARD_KEYS.SNACKS]: visualStandard({
    id: SELF_SERVICE_VISUAL_STANDARD_KEYS.SNACKS,
    label: 'Self-Service snacks standard',
    area: 'Self-Service Station',
    section: 'Snacks',
  }),
  [SELF_SERVICE_VISUAL_STANDARD_KEYS.FOOD_DISPLAY]: visualStandard({
    id: SELF_SERVICE_VISUAL_STANDARD_KEYS.FOOD_DISPLAY,
    label: 'Self-Service food display standard',
    area: 'Self-Service Station',
    section: 'Food display',
  }),
  [SELF_SERVICE_VISUAL_STANDARD_KEYS.BACKSTOCK]: visualStandard({
    id: SELF_SERVICE_VISUAL_STANDARD_KEYS.BACKSTOCK,
    label: 'Self-Service backstock standard',
    area: 'Self-Service Station',
    section: 'Backstock / refill',
  }),
});

export const canonicalVisualStandards = Object.freeze(
  Object.values(workbarVisualStandards),
);

export const CANONICAL_VISUAL_STANDARD_KEYS = Object.freeze(
  canonicalVisualStandards.map((standard) => standard.id),
);

export function getWorkbarVisualStandard(key) {
  return workbarVisualStandards[key] || null;
}

export const getCanonicalVisualStandard = getWorkbarVisualStandard;

export const WORKBAR_VISUAL_STANDARD_KEYS = Object.freeze({
  BAR_LEFT_FRIDGE: 'workbar-bar-left-fridge-standard',
  BAR_RIGHT_FRIDGE: 'workbar-bar-right-fridge-standard',
  BAR_MILK_FRIDGE: 'workbar-bar-milk-fridge-standard',
  NON_ALCO_FRIDGE: 'workbar-non-alco-fridge-standard',
  LOWER_BACK_BAR_GLASS_SETUP: 'workbar-lower-back-bar-glass-setup-standard',
  WINE_PROSECCO_SHELF: 'workbar-wine-prosecco-shelf-standard',
  BACK_BAR_BOTTLE_LAYOUT: 'workbar-back-bar-bottle-layout-standard',
  HANGING_WINE_PROSECCO_GLASS_LAYOUT:
    'workbar-hanging-wine-prosecco-glass-layout-standard',
  GLASS_RACK_STORAGE: 'workbar-glass-rack-storage-standard',
  CLEANING_STATION_OPENING: 'workbar-cleaning-station-opening-standard',
  CLEANING_STATION_CLOSING: 'workbar-cleaning-station-closing-standard',
  CABINET_BELOW_MAIN_PC_STORAGE:
    'workbar-cabinet-below-main-pc-storage-standard',
});

export const SELF_SERVICE_VISUAL_STANDARD_KEYS = Object.freeze({
  OVERVIEW: 'self-service-station-overview-standard',
  BAKERY_FRUIT_DISPLAY: 'self-service-bakery-fruit-display-standard',
  COFFEE_RETAIL_FILTER: 'self-service-coffee-retail-filter-standard',
  ESPRESSO_MACHINE_CUPS: 'self-service-espresso-machine-cups-standard',
  TEA_CONDIMENTS: 'self-service-tea-condiments-standard',
  SNACKS: 'self-service-snacks-standard',
  WATER_GLASSWARE: 'self-service-water-glassware-standard',
  SERVICEWARE_TAKEAWAY: 'self-service-serviceware-takeaway-standard',
  BACKSTOCK: 'self-service-backstock-standard',
});

export const LEGACY_SELF_SERVICE_VISUAL_STANDARD_KEYS = Object.freeze({
  COFFEE_SERVICE: 'self-service-coffee-service-standard',
  TAKEAWAY_COFFEE: 'self-service-takeaway-coffee-standard',
  GLASSWARE_SERVICEWARE: 'self-service-glassware-serviceware-standard',
  FOOD_DISPLAY: 'self-service-food-display-standard',
});

export const VISUAL_STANDARD_KEY_ALIASES = Object.freeze({
  [LEGACY_SELF_SERVICE_VISUAL_STANDARD_KEYS.COFFEE_SERVICE]:
    SELF_SERVICE_VISUAL_STANDARD_KEYS.ESPRESSO_MACHINE_CUPS,
  [LEGACY_SELF_SERVICE_VISUAL_STANDARD_KEYS.TAKEAWAY_COFFEE]:
    SELF_SERVICE_VISUAL_STANDARD_KEYS.SERVICEWARE_TAKEAWAY,
  [LEGACY_SELF_SERVICE_VISUAL_STANDARD_KEYS.GLASSWARE_SERVICEWARE]:
    SELF_SERVICE_VISUAL_STANDARD_KEYS.WATER_GLASSWARE,
  [LEGACY_SELF_SERVICE_VISUAL_STANDARD_KEYS.FOOD_DISPLAY]:
    SELF_SERVICE_VISUAL_STANDARD_KEYS.BAKERY_FRUIT_DISPLAY,
});

const visualStandard = ({
  id,
  label,
  area,
  section,
  src = '',
  primaryLabel = '',
  detailSlots = [],
}) => Object.freeze({
  id,
  label,
  area,
  section,
  src,
  primaryLabel,
  detailSlots: Object.freeze(detailSlots.map((slot) => Object.freeze(slot))),
  bundledFallbackSrc: src,
  status: src ? 'bundled-fallback' : 'awaiting-approved-photo',
});

export const workbarVisualStandards = Object.freeze({
  [WORKBAR_VISUAL_STANDARD_KEYS.BAR_LEFT_FRIDGE]: visualStandard({
    id: WORKBAR_VISUAL_STANDARD_KEYS.BAR_LEFT_FRIDGE,
    label: 'Workbar Bar Left Fridge standard',
    area: 'Workbar',
    section: 'Fridges',
  }),
  [WORKBAR_VISUAL_STANDARD_KEYS.BAR_RIGHT_FRIDGE]: visualStandard({
    id: WORKBAR_VISUAL_STANDARD_KEYS.BAR_RIGHT_FRIDGE,
    label: 'Workbar Bar Right Fridge standard',
    area: 'Workbar',
    section: 'Fridges',
  }),
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
  [WORKBAR_VISUAL_STANDARD_KEYS.LOWER_BACK_BAR_GLASS_SETUP]: visualStandard({
    id: WORKBAR_VISUAL_STANDARD_KEYS.LOWER_BACK_BAR_GLASS_SETUP,
    label: 'Workbar lower back-bar glass setup standard',
    area: 'Workbar',
    section: 'Back bar & glassware',
    primaryLabel: 'Primary glass-setup view',
    detailSlots: [
      { key: 'second-view', label: 'Second glass-setup view', order: 1 },
    ],
  }),
  [WORKBAR_VISUAL_STANDARD_KEYS.WINE_PROSECCO_SHELF]: visualStandard({
    id: WORKBAR_VISUAL_STANDARD_KEYS.WINE_PROSECCO_SHELF,
    label: 'Workbar wine / prosecco shelf standard',
    area: 'Workbar',
    section: 'Back bar & glassware',
  }),
  [WORKBAR_VISUAL_STANDARD_KEYS.BACK_BAR_BOTTLE_LAYOUT]: visualStandard({
    id: WORKBAR_VISUAL_STANDARD_KEYS.BACK_BAR_BOTTLE_LAYOUT,
    label: 'Workbar back-bar bottle layout standard',
    area: 'Workbar',
    section: 'Back bar & glassware',
    primaryLabel: 'Left-side spirit layout',
    detailSlots: [
      { key: 'right-side-layout', label: 'Right-side red-wine / spirit layout', order: 1 },
    ],
  }),
  [WORKBAR_VISUAL_STANDARD_KEYS.HANGING_WINE_PROSECCO_GLASS_LAYOUT]: visualStandard({
    id: WORKBAR_VISUAL_STANDARD_KEYS.HANGING_WINE_PROSECCO_GLASS_LAYOUT,
    label: 'Workbar hanging wine / prosecco glass layout standard',
    area: 'Workbar',
    section: 'Back bar & glassware',
  }),
  [WORKBAR_VISUAL_STANDARD_KEYS.GLASS_RACK_STORAGE]: visualStandard({
    id: WORKBAR_VISUAL_STANDARD_KEYS.GLASS_RACK_STORAGE,
    label: 'Workbar glass-rack storage standard',
    area: 'Workbar',
    section: 'Back bar & glassware',
  }),
  [WORKBAR_VISUAL_STANDARD_KEYS.CLEANING_STATION_OPENING]: visualStandard({
    id: WORKBAR_VISUAL_STANDARD_KEYS.CLEANING_STATION_OPENING,
    label: 'Workbar cleaning-station opening standard',
    area: 'Workbar',
    section: 'Cleaning station',
  }),
  [WORKBAR_VISUAL_STANDARD_KEYS.CLEANING_STATION_CLOSING]: visualStandard({
    id: WORKBAR_VISUAL_STANDARD_KEYS.CLEANING_STATION_CLOSING,
    label: 'Workbar cleaning-station closing reset standard',
    area: 'Workbar',
    section: 'Cleaning station',
  }),
  [WORKBAR_VISUAL_STANDARD_KEYS.CABINET_BELOW_MAIN_PC_STORAGE]: visualStandard({
    id: WORKBAR_VISUAL_STANDARD_KEYS.CABINET_BELOW_MAIN_PC_STORAGE,
    label: 'Workbar cabinet below main PC storage standard',
    area: 'Workbar',
    section: 'Storage & security',
  }),
  [SELF_SERVICE_VISUAL_STANDARD_KEYS.OVERVIEW]: visualStandard({
    id: SELF_SERVICE_VISUAL_STANDARD_KEYS.OVERVIEW,
    label: 'Self-Service Station overview standard',
    area: 'Self-Service Station',
    section: 'Overview',
  }),
  [SELF_SERVICE_VISUAL_STANDARD_KEYS.BAKERY_FRUIT_DISPLAY]: visualStandard({
    id: SELF_SERVICE_VISUAL_STANDARD_KEYS.BAKERY_FRUIT_DISPLAY,
    label: 'Self-Service bakery & fruit display standard',
    area: 'Self-Service Station',
    section: 'Bakery & fruit display',
  }),
  [SELF_SERVICE_VISUAL_STANDARD_KEYS.COFFEE_RETAIL_FILTER]: visualStandard({
    id: SELF_SERVICE_VISUAL_STANDARD_KEYS.COFFEE_RETAIL_FILTER,
    label: 'Self-Service coffee retail & filter coffee standard',
    area: 'Self-Service Station',
    section: 'Coffee retail & filter coffee',
  }),
  [SELF_SERVICE_VISUAL_STANDARD_KEYS.ESPRESSO_MACHINE_CUPS]: visualStandard({
    id: SELF_SERVICE_VISUAL_STANDARD_KEYS.ESPRESSO_MACHINE_CUPS,
    label: 'Self-Service espresso machine & cups standard',
    area: 'Self-Service Station',
    section: 'Espresso machine & cups',
  }),
  [SELF_SERVICE_VISUAL_STANDARD_KEYS.TEA_CONDIMENTS]: visualStandard({
    id: SELF_SERVICE_VISUAL_STANDARD_KEYS.TEA_CONDIMENTS,
    label: 'Self-Service tea and condiments standard',
    area: 'Self-Service Station',
    section: 'Tea & condiments',
  }),
  [SELF_SERVICE_VISUAL_STANDARD_KEYS.SNACKS]: visualStandard({
    id: SELF_SERVICE_VISUAL_STANDARD_KEYS.SNACKS,
    label: 'Self-Service snacks standard',
    area: 'Self-Service Station',
    section: 'Snacks',
  }),
  [SELF_SERVICE_VISUAL_STANDARD_KEYS.WATER_GLASSWARE]: visualStandard({
    id: SELF_SERVICE_VISUAL_STANDARD_KEYS.WATER_GLASSWARE,
    label: 'Self-Service water & glassware standard',
    area: 'Self-Service Station',
    section: 'Water & glassware',
  }),
  [SELF_SERVICE_VISUAL_STANDARD_KEYS.SERVICEWARE_TAKEAWAY]: visualStandard({
    id: SELF_SERVICE_VISUAL_STANDARD_KEYS.SERVICEWARE_TAKEAWAY,
    label: 'Self-Service serviceware & takeaway standard',
    area: 'Self-Service Station',
    section: 'Serviceware & takeaway',
  }),
  [SELF_SERVICE_VISUAL_STANDARD_KEYS.BACKSTOCK]: visualStandard({
    id: SELF_SERVICE_VISUAL_STANDARD_KEYS.BACKSTOCK,
    label: 'Self-Service backstock standard',
    area: 'Self-Service Station',
    section: 'Backstock / three cabinets',
    detailSlots: [
      { key: 'cabinet-1', label: 'Cabinet 1', order: 1 },
      { key: 'cabinet-2', label: 'Cabinet 2', order: 2 },
      { key: 'cabinet-3', label: 'Cabinet 3', order: 3 },
    ],
  }),
});

export const canonicalVisualStandards = Object.freeze(
  Object.values(workbarVisualStandards),
);

export const CANONICAL_VISUAL_STANDARD_KEYS = Object.freeze(
  canonicalVisualStandards.map((standard) => standard.id),
);

export function getWorkbarVisualStandard(key) {
  const canonicalKey = VISUAL_STANDARD_KEY_ALIASES[key] || key;
  return workbarVisualStandards[canonicalKey] || null;
}

export const getCanonicalVisualStandard = getWorkbarVisualStandard;

export function resolveCanonicalVisualStandardKey(key) {
  return VISUAL_STANDARD_KEY_ALIASES[key] || key;
}

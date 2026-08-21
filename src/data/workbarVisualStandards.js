export const WORKBAR_VISUAL_STANDARD_KEYS = Object.freeze({
  BAR_MILK_FRIDGE: 'workbar-bar-milk-fridge-standard',
  NON_ALCO_FRIDGE: 'workbar-non-alco-fridge-standard',
});

export const workbarVisualStandards = Object.freeze({
  [WORKBAR_VISUAL_STANDARD_KEYS.BAR_MILK_FRIDGE]: Object.freeze({
    id: WORKBAR_VISUAL_STANDARD_KEYS.BAR_MILK_FRIDGE,
    label: 'Workbar Bar milk-fridge standard',
    src: './guides/workbar-bar-milk-fridge-standard.jpeg',
  }),
  [WORKBAR_VISUAL_STANDARD_KEYS.NON_ALCO_FRIDGE]: Object.freeze({
    id: WORKBAR_VISUAL_STANDARD_KEYS.NON_ALCO_FRIDGE,
    label: 'Workbar non-alcoholic fridge standard',
    src: './guides/workbar-non-alco-fridge-standard.jpeg',
  }),
});

export function getWorkbarVisualStandard(key) {
  return workbarVisualStandards[key] || null;
}

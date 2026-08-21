import {
  SELF_SERVICE_VISUAL_STANDARD_KEYS,
  getWorkbarVisualStandard,
} from './workbarVisualStandards.js';

export const SELF_SERVICE_STATION_GUIDE_ID = 'self-service-station-standard';

export const SELF_SERVICE_STATION_GUIDE_ALIASES = Object.freeze([
  'coffee-station-standard',
]);

const section = (id, title, audience, visualKey, summary, items) =>
  Object.freeze({
    id,
    title,
    audience,
    visualKey,
    visualStandard: getWorkbarVisualStandard(visualKey),
    summary,
    items: Object.freeze(items.map((item) => Object.freeze(item))),
  });

export const selfServiceStationSections = Object.freeze([
  section(
    'overview',
    'Full station overview',
    'Entire physical Self-Service Station',
    SELF_SERVICE_VISUAL_STANDARD_KEYS.OVERVIEW,
    'Use this as the whole-station reference. The eight physical zones below define their own placement without duplicating opening, daytime or closing procedures.',
    [
      {
        name: 'One complete station',
        detail: 'The overview includes every guest-facing zone and the three lower backstock cabinets as one coherent, clean and service-ready station.',
      },
      {
        name: 'Facing and cleanliness',
        detail: 'Products face forward, fixed positions remain clear, and shelves, display glass, machine surrounds and counter surfaces are clean, dry and free of spills or crumbs.',
      },
      {
        name: 'Guest-facing vs backstock',
        detail: 'Active service stock belongs in its defined guest-facing position. Reserve stock stays organized in the three lower cabinets and does not overflow onto the counter.',
      },
    ],
  ),
  section(
    'bakery-fruit-display',
    'Bakery & fruit display',
    'Guest-facing; includes perishables',
    SELF_SERVICE_VISUAL_STANDARD_KEYS.BAKERY_FRUIT_DISPLAY,
    'Keep the glass bakery zone and its surrounding fixed display ready for the current service period. Existing bakery handling and SVINN tasks still govern food operations.',
    [
      {
        name: 'Glass bakery display',
        detail: 'Present the established baked goods in the glass display and keep the cabinet and service area clean and crumb-free.',
      },
      {
        name: 'Fruit',
        detail: 'Place guest-ready fruit in its designated position where applicable.',
      },
      {
        name: 'Fixed surrounding display',
        detail: 'Keep only the approved products assigned immediately above or around the bakery zone, grouped and faced without inventing a new counter position.',
      },
    ],
  ),
  section(
    'coffee-retail-filter',
    'Coffee retail & filter coffee',
    'Guest-facing retail + filter-coffee service',
    SELF_SERVICE_VISUAL_STANDARD_KEYS.COFFEE_RETAIL_FILTER,
    'Keep retail coffee and filter-coffee placement together in this physical zone. Brewing and canister-care procedures remain separate operational tasks.',
    [
      {
        name: 'Retail coffee bags',
        detail: 'Face the established retail coffee range in its fixed display positions, with labels visible and reserve stock kept below.',
      },
      {
        name: 'Regular coffee cups',
        detail: 'Keep the cups associated with filter coffee clean, orderly and stocked in their established position.',
      },
      {
        name: 'Filter coffee urn / pot',
        detail: 'Keep the correct urn, pot or canister and its adjacent fixed service placement ready where applicable. Follow the existing Coffee — grind, brew & clean guide for preparation and cleaning.',
      },
    ],
  ),
  section(
    'espresso-machine-cups',
    'Espresso machine & cups',
    'Guest-facing + operational equipment',
    SELF_SERVICE_VISUAL_STANDARD_KEYS.ESPRESSO_MACHINE_CUPS,
    'Treat the Eversys and its cup placement as one setup standard. Machine startup, milk-system work and cleaning remain distinct operating procedures.',
    [
      {
        name: 'Eversys machine',
        detail: 'Keep the machine exterior and surrounding setup clean, unobstructed and ready for the current service period.',
      },
      {
        name: 'Espresso cups',
        detail: 'Stock clean espresso cups in their established position on top of the machine.',
      },
      {
        name: 'Cappuccino cups',
        detail: 'Stock clean cappuccino cups separately in their established position on top of the machine.',
      },
    ],
  ),
  section(
    'tea-condiments',
    'Tea & condiments',
    'Guest-facing',
    SELF_SERVICE_VISUAL_STANDARD_KEYS.TEA_CONDIMENTS,
    'Keep loose-leaf tea and the guest condiment tray complete, clean and easy to scan.',
    [
      {
        name: 'Loose-leaf tea jars',
        detail: 'Keep jars closed when not in use, labelled and in their established positions.',
      },
      {
        name: 'Sugar, honey and sweeteners',
        detail: 'Group the approved range together, upright, faced and free of loose residue.',
      },
      {
        name: 'Stirrers, spoons and accessories',
        detail: 'Keep the guest condiment tray and directly related fixed accessories filled, clean and free of unrelated items.',
      },
    ],
  ),
  section(
    'snacks',
    'Snacks',
    'Guest-facing display + matching reserve stock',
    SELF_SERVICE_VISUAL_STANDARD_KEYS.SNACKS,
    'Keep the permanent snack range faced and easy to identify; reserve packs stay in the backstock cabinets.',
    [
      {
        name: 'Nuts',
        detail: 'Keep nut jars clean and closed, and face portioned nut products together in their assigned position.',
      },
      {
        name: 'Chips and BE-KIND bars',
        detail: 'Keep bags upright and bars grouped with labels visible inside the designated snack zone.',
      },
      {
        name: 'Other permanent snack products',
        detail: 'Maintain products already assigned to this physical zone; do not create a new category or placement without an approved standard.',
      },
    ],
  ),
  section(
    'water-glassware',
    'Water & glassware',
    'Guest-facing physical workstation',
    SELF_SERVICE_VISUAL_STANDARD_KEYS.WATER_GLASSWARE,
    'Keep the water tap and glass presentation together as a distinct, clean workstation.',
    [
      {
        name: 'Water glasses',
        detail: 'Fill the designated position with clean, undamaged glasses in orderly rows.',
      },
      {
        name: 'Water tap',
        detail: 'Keep the tap, drip area and surrounding fixed presentation clean, dry, accessible and free of unrelated supplies.',
      },
    ],
  ),
  section(
    'serviceware-takeaway',
    'Serviceware & takeaway',
    'Guest-facing service supplies + matching reserve stock',
    SELF_SERVICE_VISUAL_STANDARD_KEYS.SERVICEWARE_TAKEAWAY,
    'Keep side plates, takeaway cup sizes, matching lids and their fixed organizers together as one understandable service zone.',
    [
      {
        name: 'Side plates',
        detail: 'Stack clean side plates in their established position without mixing other plate sizes.',
      },
      {
        name: 'Takeaway cups and lids',
        detail: 'Keep large and small cups separate and align each lid size with its matching cups.',
      },
      {
        name: 'Teaspoons, stirrers and holders',
        detail: 'Keep teaspoons or takeaway stirrers and the wooden or fixed organizers filled, faced and free of mixed accessories.',
      },
    ],
  ),
  section(
    'backstock',
    'Backstock / three cabinets',
    'Backstock only; overview plus optional cabinet details',
    SELF_SERVICE_VISUAL_STANDARD_KEYS.BACKSTOCK,
    'Use the primary image for the full lower-cabinet overview. Optional ordered detail images document Cabinet 1, Cabinet 2 and Cabinet 3 without requiring all three at once.',
    [
      {
        name: 'Three lower cabinets',
        detail: 'Use them only for station refill stock. Group stock by the guest-facing zone it replenishes, keep labels visible and exclude loose or unrelated items.',
      },
      {
        name: 'Cup and lid reserve',
        detail: 'Keep large cups with large lids and small cups with small lids so refills cannot mix sizes.',
      },
      {
        name: 'Coffee buffer stock',
        detail: 'Keep the established coffee stock grouped, dated and rotated oldest first in its assigned cabinet position.',
      },
      {
        name: 'Low stock',
        detail: 'No numeric par is established here. Record low or missing reserve stock in the existing handover flow instead of inventing a quantity.',
      },
    ],
  ),
]);

export const selfServiceStationStandard = Object.freeze({
  id: SELF_SERVICE_STATION_GUIDE_ID,
  aliases: SELF_SERVICE_STATION_GUIDE_ALIASES,
  title: 'Self-Service Station',
  category: 'Workbar standard',
  area: 'workbar',
  body: 'Canonical setup and reset standard for the complete physical Self-Service Station. Opening, daytime and closing routines link here instead of maintaining separate copies.',
  steps: Object.freeze([]),
  images: Object.freeze([]),
  sections: selfServiceStationSections,
  relatedTaskIds: Object.freeze([
    'opening-opening-07-00-08-00-brew-4-coffee-cannisters-and-check-meeting-room-coffee-orders',
    'opening-opening-07-00-08-00-turn-on-espresso-machine',
    'opening-opening-07-00-08-00-refill-milk-and-oat-milk-in-coffee-machine',
    'opening-opening-07-00-08-00-put-out-baked-goods',
    'opening-opening-07-00-08-00-refill-self-service-station',
    'opening-opening-08-00-10-00-refill-cutlery-napkins-glasses-cups-plates-salt-and-pepper',
    'opening-opening-08-00-10-00-refill-takeaway-cups-and-lids',
    'opening-opening-08-00-10-00-make-sure-enough-coffee-is-ready-for-lunch-rush',
    'daytime-lunch-11-00-13-00-refill-water-glasses-coffee-cups-and-cutlery',
    'daytime-daytime-13-00-16-00-refill-sugar-tea-teaspoons-coffee-napkins-takeaway-cups-and-lids',
    'daytime-daytime-13-00-16-00-clean-self-service-area',
    'closing-pre-closing-15-00-18-00-rinse-used-coffee-jugs',
    'closing-after-closing-18-00-19-00-put-leftover-food-and-pastry-in-svinn',
    'closing-after-closing-18-00-19-00-run-coffee-machine-cleaning-mode',
    'closing-after-closing-18-00-19-00-clean-self-service-surfaces-lift-trays-and-clean-underneath',
  ]),
  tags: Object.freeze([
    'self-service station',
    'coffee',
    'tea',
    'snacks',
    'opening',
    'closing',
    'backstock',
  ]),
});

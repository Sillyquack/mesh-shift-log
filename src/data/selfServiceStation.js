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
    'Overview',
    'Guest-facing station + refill backstock',
    SELF_SERVICE_VISUAL_STANDARD_KEYS.OVERVIEW,
    'Treat the entire Self-Service Station as one operational zone. The detailed positions below are the standard; opening and closing routines check against this one source.',
    [
      {
        name: 'What belongs here',
        detail: 'Coffee service, takeaway coffee, tea and condiments, water glasses and side plates, fixed snacks, the bakery/fruit display, coffee retail or coffee-break products where applicable, and the three refill cabinets below.',
      },
      {
        name: 'What “full” means',
        detail: 'Every established guest-facing position has its correct item and is ready for service. The repository does not establish numeric par levels; report low reserve stock instead of inventing a quantity.',
      },
      {
        name: 'Facing and cleanliness',
        detail: 'Guest-facing products face forward with labels and access clear. Trays, shelves, display glass and the machine surround are clean, dry and free of crumbs or spills.',
      },
      {
        name: 'Guest-facing vs backstock',
        detail: 'Only active service stock belongs on the guest side. Reserve/refill stock stays organized in the three lower cabinets and must not overflow onto the counter.',
      },
    ],
  ),
  section(
    'coffee-service',
    'Coffee service',
    'Guest-facing + operational equipment',
    SELF_SERVICE_VISUAL_STANDARD_KEYS.COFFEE_SERVICE,
    'Keep the espresso and filter-coffee service ready without duplicating the separate brewing and machine-cleaning procedures.',
    [
      {
        name: 'Espresso machine',
        detail: 'The Eversys is clean and ready for the current service period. Opening, milk-system and closing-clean tasks remain separate routine checks.',
      },
      {
        name: 'Cappuccino cups',
        detail: 'Stock in the established position on top of the Eversys, clean and easy to reach.',
      },
      {
        name: 'Espresso cups',
        detail: 'Stock separately in the established position on top of the Eversys, clean and easy to reach.',
      },
      {
        name: 'Regular coffee cups',
        detail: 'Keep the designated guest-facing cup position filled, clean and orderly.',
      },
      {
        name: 'Filter coffee / coffee pot',
        detail: 'Have filter coffee and the correct coffee pot/canister ready where applicable. Use the existing Coffee — grind, brew & clean guide for brewing and canister care.',
      },
    ],
  ),
  section(
    'takeaway-coffee',
    'Takeaway coffee',
    'Guest-facing service supplies + matching reserve stock',
    SELF_SERVICE_VISUAL_STANDARD_KEYS.TAKEAWAY_COFFEE,
    'Keep every cup and lid size paired and immediately understandable to guests.',
    [
      {
        name: 'Large takeaway cups',
        detail: 'Large cups are on the left in the established guest-facing cup position.',
      },
      {
        name: 'Small takeaway cups',
        detail: 'Small cups are on the right in the established guest-facing cup position.',
      },
      {
        name: 'Large and small lids',
        detail: 'Keep sizes separate in the service organiser and aligned with the matching cup sizes. Reserve cups and matching lids stay together below.',
      },
      {
        name: 'Teaspoons',
        detail: 'Keep the designated teaspoon compartment filled, clean and free of mixed accessories.',
      },
      {
        name: 'Wooden takeaway accessory holder',
        detail: 'Use the wooden holder/service organiser for the established takeaway accessories, including the lid sizes, teaspoons and knife basket. Keep each compartment faced and remove unrelated items.',
      },
    ],
  ),
  section(
    'tea-condiments',
    'Tea & condiments',
    'Guest-facing',
    SELF_SERVICE_VISUAL_STANDARD_KEYS.TEA_CONDIMENTS,
    'Keep the tea and condiment range complete, clean and easy to scan.',
    [
      {
        name: 'Loose-leaf tea container',
        detail: 'Keep the container in its established position, closed when not in use and stocked with the represented loose-leaf tea range.',
      },
      {
        name: 'Sugar',
        detail: 'Keep the established sugar service stocked, faced and free of loose residue.',
      },
      {
        name: 'Honey',
        detail: 'Keep honey with the tea condiments, upright, clean and ready for guests.',
      },
      {
        name: 'Accompaniments',
        detail: 'Keep the established stirrers, napkins and small waste bin in their designated positions. Teaspoons remain in the takeaway service organiser.',
      },
    ],
  ),
  section(
    'glassware-serviceware',
    'Glassware & serviceware',
    'Guest-facing',
    SELF_SERVICE_VISUAL_STANDARD_KEYS.GLASSWARE_SERVICEWARE,
    'Only clean, guest-ready glassware and serviceware belongs in these positions.',
    [
      {
        name: 'Water glasses',
        detail: 'Fill the designated water-glass position with clean, undamaged glasses in orderly rows.',
      },
      {
        name: 'Side plates / small plates',
        detail: 'Stack clean side plates in the established position without mixing in other plate sizes.',
      },
    ],
  ),
  section(
    'snacks',
    'Snacks',
    'Guest-facing display + refill backstock',
    SELF_SERVICE_VISUAL_STANDARD_KEYS.SNACKS,
    'Keep the fixed snack range faced and easy to identify; reserve packs stay below the station.',
    [
      {
        name: 'Nuts in jars',
        detail: 'Keep the represented nut jars clean, closed and in their established display positions.',
      },
      {
        name: 'Individual nut portions',
        detail: 'Face portioned nut bags together in their designated guest-facing position.',
      },
      {
        name: 'BE-KIND bars',
        detail: 'Face the established BE-KIND range together with labels visible.',
      },
      {
        name: 'Chip shelf',
        detail: 'Keep chip bags upright, faced and within the designated shelf area.',
      },
      {
        name: 'Other fixed snack products',
        detail: 'Maintain any other products already assigned to the display; do not create a new category or counter position without an approved standard.',
      },
    ],
  ),
  section(
    'food-display',
    'Food display',
    'Guest-facing; includes perishables',
    SELF_SERVICE_VISUAL_STANDARD_KEYS.FOOD_DISPLAY,
    'Prepare the display for the current service period and follow the existing waste/SVINN routine for remaining perishables.',
    [
      {
        name: 'Bakery display case',
        detail: 'Use the glass cabinet for the established baked-goods presentation. Keep the case and service area clean and crumb-free.',
      },
      {
        name: 'Fruit',
        detail: 'Place guest-ready fruit in its designated display position where applicable.',
      },
      {
        name: 'Coffee-break / display products',
        detail: 'Place only products assigned to the current coffee-break or display setup; keep categories grouped and faced.',
      },
      {
        name: 'Coffee retail display',
        detail: 'Startup Blend is on the left display shelf and Kvadraturen Espresso on the right. Refill from the established coffee buffer stock.',
      },
    ],
  ),
  section(
    'backstock',
    'Backstock / refill',
    'Backstock only',
    SELF_SERVICE_VISUAL_STANDARD_KEYS.BACKSTOCK,
    'The three cabinets below the station hold refill stock for the entire Self-Service Station.',
    [
      {
        name: 'All three lower cabinets',
        detail: 'Use them for station refill stock only. Group stock by the guest-facing subsection it replenishes, keep labels visible and keep loose or unrelated items out.',
      },
      {
        name: 'Cup and lid reserve',
        detail: 'Keep large cups with large lids and small cups with small lids so a refill cannot mix sizes.',
      },
      {
        name: 'Coffee buffer stock',
        detail: 'In the established lower-right cabinet, keep Startup Blend beans on the labelled upper shelf and Kvadraturen Espresso beans below. Date coffee stock and use the oldest first.',
      },
      {
        name: 'Sufficient backstock',
        detail: 'Keep enough reserve for the expected service period. Because no fixed par is established in the repository, record low or missing stock in handover notes.',
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
  body: 'Canonical setup and reset standard for the complete Self-Service Station. Opening, daytime and closing routines link here instead of maintaining separate copies.',
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

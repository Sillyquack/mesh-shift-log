import React, { useState } from 'react';
import GuideSubsections from './components/GuideSubsections.jsx';
import { useVisualStandards } from './components/VisualStandardsProvider.jsx';
import {
  WORKBAR_VISUAL_STANDARD_KEYS,
  getWorkbarVisualStandard,
} from './data/workbarVisualStandards.js';
import { selfServiceStationStandard } from './data/selfServiceStation.js';

const sections = [
  {
    id: selfServiceStationStandard.id,
    title: selfServiceStationStandard.title,
    body: selfServiceStationStandard.body,
    subsections: selfServiceStationStandard.sections,
  },
  {
    id: 'coffee',
    title: 'Coffee — grind, brew & clean',
    items: [
      ['Coffee types', 'Startup Blend BEANS: Workbar, Cornerbar and event batch coffee. Startup Blend FILTER: shared kitchens upstairs + Members Lounge. Kvadraturen Espresso BEANS: Eversys only.'],
      ['Grind one batch', 'Kitchen grinder. Fill hopper with Startup Blend beans; hopper holds about 3 bags. Do not change the grinder setting. Black switch = power. Place one LARGE takeaway cup on top of one regular coffee cup under the chute, then lightly press the white grind button behind the cups. One run is pre-set for one full coffee canister.'],
      ['Load brewer', 'Pour the ground coffee into a coffee filter. Put the filter into the brew basket / brew cup and slide it into the top of the batch brewer.'],
      ['Brew', 'Only use two controls: power and the button showing the largest coffee canister. One canister takes about 8 minutes and yields about 10 cups.'],
      ['Between every brew — mandatory', 'Even during rush: rinse the just-emptied coffee canister AND its inner coffee column before starting the next brew. This prevents burnt coffee residue building up in the bottom.'],
      ['Periodic deep clean', 'Use Stuns powder according to the package. Fill with boiling water to the top, insert the coffee column, close the lid and pump/press a few times so solution runs through the column. Leave up to 30 minutes depending on soil level, then rinse canister and column thoroughly with clean water. Final photos of the inner column + Stuns package coming.'],
      ['Buffer stock', 'Lower-right cabinet: Startup Blend beans on the labelled upper shelf, Kvadraturen Espresso beans below. Date stock and use oldest first. Buffer stock refills the retail display.'],
    ],
  },
  {
    id: 'fridges',
    title: 'Fridges & beverage storage',
    items: [
      ['Non-alcoholic fridge', 'Use the photographed setup as the standard. Closing: switch off the fridge light and pull down the front grille.', WORKBAR_VISUAL_STANDARD_KEYS.NON_ALCO_FRIDGE],
      ['Workbar left fridge', 'Use the photographed layout as the standard; no extra category rule is currently defined.'],
      ['Workbar right fridge', 'Use the photographed layout as the standard; no extra category rule is currently defined.'],
      ['Milk / opened-wine fridge', 'Use the photographed milk shelf and opened-wine storage as the standard. Milk serves the espresso station; opened wine bottles below must have corks and date labels.', WORKBAR_VISUAL_STANDARD_KEYS.BAR_MILK_FRIDGE],
      ['Milk system', 'One two-part container: LEFT = regular milk / blue hose. RIGHT = Oatly / green hose.'],
      ['Locks', 'All bar cabinets / fridges are locked at close using the key kept in the cash drawer.'],
    ],
  },
  {
    id: 'bar',
    title: 'Back bar, glassware & POS stations',
    items: [
      ['Lower back-bar glass setup', 'Left → right: drink/soda glasses, highball glasses, beer glasses. Shot glasses sit behind. Use the two captured photos together as the standard.'],
      ['Wine / prosecco glasses', 'Use the photographed wine/prosecco shelf setup as the standard.'],
      ['Back-bar bottles', 'Use the photographed left-side spirit layout and right-side red-wine/spirit layout as the standard.'],
      ['Hanging glasses', 'Reset hanging red/white wine and prosecco glasses to the photographed layout.'],
      ['Left POS + main computer', 'iPad, printer and payment terminal at the left POS. Devices charge via the printer. The main Workbar computer sits directly beside it.'],
      ['Right POS', 'iPad, printer and payment terminal. Devices charge via the printer.'],
      ['Glass-rack storage', 'Use the photographed racks below the POS/main-PC zones as the storage standard.'],
      ['Small Workbar TV', 'Two Workbar screens exist. The large one remains on. The smaller screen is switched ON in the morning and OFF at closing. Remote is in the basket below the cash drawer.'],
    ],
  },
  {
    id: 'lighting',
    title: 'Workbar lighting',
    items: [
      ['Opening', 'Ignore the old DAY/LUNCH/WASH/NIGHT labels. Only use TRACKS and GLOBES. Arrow down = less light, arrow up = more light. Morning starts with cleaners’ flood lighting. As a practical starting point, hold globes DOWN about 4 seconds and tracks DOWN about 6 seconds.'],
      ['Minimum acceptable result', 'Do NOT switch off the globes above the kitchen window or the globes along the Workbar window line. Anything above that light level is acceptable and can be adjusted by feel / daylight.'],
      ['If it gets too dark', 'Hold the relevant UP arrow for a couple of seconds until the room is back at a comfortable level.'],
      ['Closing', 'Single press — once — on every DOWN-arrow button. Do not hold.'],
    ],
  },
  {
    id: 'cleaning-station',
    title: 'Cleaning station',
    items: [
      ['Black racks only', 'Only BLACK dishwasher racks are used at the cleaning station.'],
      ['Upper racks', 'Upper left = coffee cups. Upper right = glass.'],
      ['Lower racks', 'Both lower black racks = plates / bowls / similar tableware.'],
      ['Waste holes', 'Four round holes left → right: PANT, GLASS/METAL, MIXED, FOOD.'],
      ['Cutlery', 'Rectangular opening on the right = CUTLERY. Under it: fine-mesh cutlery rack on a drip tray, raised on two empty racks so the cutlery rack sits high enough.'],
      ['Opening vs closing', 'Opening uses the fully assembled photographed setup. Closing uses the stripped / reset photographed setup. Final task-level photo wiring pending.'],
    ],
  },
  {
    id: 'beer',
    title: 'Beer taps & drip tray',
    items: [
      ['Tap nozzles — remove', 'After service, pull the nozzles straight off by hand.'],
      ['Clean nozzles', 'Spray the OUTSIDE with all-purpose cleaner. Fill one large takeaway cup with boiling water and repeatedly move each nozzle in and out of the boiling water to clean the inside while washing off the exterior cleaner. Dry with paper and refit.'],
      ['Drip tray', 'Pour one full coffee canister of boiling water over the drip tray. This loosens residue; remaining liquid drains through the tray outlet.'],
      ['Glass rinser', 'Remove the rinser by undoing the small screw on top, then lift it out of its mount. Final close-up photos of nozzle removal and rinser screw coming.'],
    ],
  },
  {
    id: 'dishwashers',
    title: 'Dishwashers',
    items: [
      ['Critical separation', 'Food / protein / fat NEVER goes into the Workbar glass machines. Use the large prep-kitchen dishwasher for anything that has touched food, protein or fat.'],
      ['Three similar machines', 'There are 3 machines with the same interface: 2 beer-glass washers + 1 general glass washer. From OFF, press the only available touchscreen button. The machine fills automatically and tells you when ready.'],
      ['Shut down similar machines', 'Swipe / drag the screen to the RIGHT and choose the BUCKET + DOWN ARROW icon. This runs wash/rinse/drain and the machine switches itself off.'],
      ['Workbar beer-glass washer', 'ONLY BEER GLASSES.'],
      ['Workbar general glass washer — opening', 'Install FILTER → insert PLUG into filter → place RACK on top → close door → power on. Machine fills automatically. There are 3 programs; only use program 3.'],
      ['Workbar general glass washer — closing', 'Remove left rack → remove plug underneath → remove filter. Remove and rinse/wash all racks, filter and loose equipment. Close door and press the DOWN-ARROW drain button.'],
      ['Prep-kitchen large dishwasher', 'Dedicated to items that have touched food / protein / fat. Full illustrated instruction coming after final photos.'],
      ['Other units', 'Two machines in Cornerbar + two in prep kitchen. Final location/menu photos coming.'],
    ],
  },
  {
    id: 'storage-cash',
    title: 'Storage, cash & security',
    items: [
      ['Office / meeting-room supplies', 'Upper-left cabinet right of the coffee brewer: daily stationery and refill supplies for project / meeting rooms.'],
      ['Technical cabinet', 'Upper-right cabinet: bar technical equipment, laminator, electrical/chargers, laminated signs, podcast gear, Community Stage microphones and small Lost & Found.'],
      ['Batteries + clean coffee canisters', 'Lower-left cabinet: battery stock and empty clean Workbar coffee canisters. Keep new batteries separate from used batteries for recycling.'],
      ['Cabinet below main PC', 'Cash drawer at top; below it emergency high-vis vest, PPD basket, Workbar-TV remote and AC remote; tool basket below; used-battery recycling at bottom. Use the captured overview photo as the location standard.'],
      ['Cash count', 'Cash drawer must count 1000 NOK at opening and closing. Excess cash goes into an envelope in the safe.'],
      ['Safe', 'Safe is in technical storage, entered from Atrium. It is the steel cabinet furthest right of the three. Key ring is in the fuse box to the right of the technical-storage entrance; of the three keys, use the one without a label.'],
      ['Shopbox', 'Use the existing Notion guides for opening/closing register and invoicing. Do not duplicate the illustrated Shopbox guide here.'],
    ],
  },
];

function GuideCard({ title, text, visualKey }) {
  const { resolve } = useVisualStandards();
  const image = visualKey
    ? resolve(visualKey, getWorkbarVisualStandard(visualKey))
    : null;
  return (
    <div style={{ border: '1px solid #d8d8d8', borderRadius: 12, padding: 12, background: '#fff' }}>
      <strong style={{ display: 'block', marginBottom: 5 }}>{title}</strong>
      <div style={{ color: '#3d3d3d', lineHeight: 1.45 }}>{text}</div>
      {image?.src && (
        <figure style={{ margin: '12px 0 0' }}>
          <img
            src={image.src}
            alt={image.label}
            loading="lazy"
            style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 10 }}
          />
          <figcaption style={{ marginTop: 6, color: '#606060', fontSize: '.82rem', fontWeight: 700 }}>
            {image.label}
          </figcaption>
        </figure>
      )}
    </div>
  );
}

export default function WorkbarGuideOverlay() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="workbar-guide-launcher"
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', right: 14, bottom: 14, zIndex: 90,
          border: 0, borderRadius: 999, padding: '11px 15px',
          background: '#111', color: '#fff', fontWeight: 700,
          boxShadow: '0 5px 20px rgba(0,0,0,.25)', cursor: 'pointer'
        }}
      >
        Workbar guide · NEW
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.52)', overflow: 'auto' }}>
          <div className="workbar-guide-panel" style={{ maxWidth: 820, margin: '18px auto', background: '#f6f6f4', borderRadius: 18, padding: 16, minHeight: '90vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', position: 'sticky', top: 0, background: '#f6f6f4', paddingBottom: 10, zIndex: 2 }}>
              <div>
                <h2 style={{ margin: 0 }}>Workbar operating guide</h2>
                <p style={{ margin: '5px 0 0', color: '#555' }}>Working v1 · 18 Aug 2026. Canonical standards are linked below; visual slots stay empty until approved photos are added.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} style={{ flexShrink: 0, whiteSpace: 'nowrap', border: '1px solid #bbb', borderRadius: 10, background: '#fff', padding: '8px 11px', cursor: 'pointer' }}>Close</button>
            </div>

            <div style={{ display: 'grid', gap: 16 }}>
              {sections.map((section) => (
                <section key={section.id} style={{ background: '#ecece8', borderRadius: 14, padding: 12 }}>
                  <h3 style={{ margin: '0 0 10px' }}>{section.title}</h3>
                  {section.subsections ? (
                    <>
                      <p style={{ margin: '0 0 10px', color: '#555', lineHeight: 1.45 }}>{section.body}</p>
                      <GuideSubsections sections={section.subsections} />
                    </>
                  ) : (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {section.items.map(([title, text, visualKey]) => <GuideCard key={title} title={title} text={text} visualKey={visualKey} />)}
                    </div>
                  )}
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

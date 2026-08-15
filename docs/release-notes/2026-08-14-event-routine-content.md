# Operations-owned event routines — Notion integration

## Source

- Notion workspace: Mesh Community
- Parent page: `Event Routines`
- Author: Julie Bolid
- Last edited in the reviewed source: 2026-08-12
- Reviewed and integrated: 2026-08-14

## What changed

The existing `atrium-bar-event` and `cornerbar-event` templates keep their stable IDs, but their short task lists are replaced with the complete operational sequence from the current operations-maintained Notion routines.

The sequence now covers:

- booking and client-arrival review
- next-event and rig decisions before furniture is moved
- venue condition, doors, toilets, smell, and temperature
- catering contacts, storage, returns, serving stations, and allergens
- coffee and tea readiness 15 minutes before service
- bar, dishwasher, stock, ice, wine, POS, and device readiness
- Atrium stage and hybrid-tech default
- one main client contact and timed break loops
- quiet-period cleanup and invoice preparation
- client feedback, product counts, payment, and invoicing
- waste, pant, glass, lost property, and next-event reset
- the correct daytime handover or final evening security path

Cornerbar also includes the exact final reset for chairs, iPads, terminals, fridges, bottle labels, washed bottles, sliced fruit, sparkling wine, and product-count verification.

## Visual standards

`eventRigGuides.js` now records the organization-owned Atrium furniture layouts, serving-station variants, Atrium stage-tech default, and Cornerbar opening/closing standards.

Each known reference image has a stable `requiredImageSlots` identifier. `imageRefs` remain empty until the images are uploaded to permanent app/Supabase storage. Signed Notion image URLs are intentionally not copied because they expire and are not suitable as app data.

## Preserved content and known gap

- Existing football, runner, conference, afterwork, CommunityStage, and LoungeVenue content is preserved.
- The Notion page `Workbar Photos` is currently empty. Existing Workbar content remains unchanged and the guide records this source gap explicitly.
- Alarm instructions are included only as process text. No alarm code or PIN is stored in the repository or app content.

## Verification

Run:

```bash
npm run verify:event-routine-content
```

The verification checks template and task uniqueness, timing anchors, rig references, required Atrium and Cornerbar controls, image-field compatibility, the empty Workbar-source safeguard, and absence of embedded external URLs or alarm codes.

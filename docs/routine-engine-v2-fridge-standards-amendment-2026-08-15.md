# CONFIRMED OPERATIONS STANDARDS — 15 AUGUST 2026

Status: operations-approved additive source amendment

Ownership: organization
Scope: refrigerator terminology, physical distinctions and runtime standard resolution only

This amendment is the authoritative source for the `mesh-routine-content@1.5R` refrigerator-only delta. It does not alter the three locked v1R source files or any historical provider.

## Confirmed source reconciliation

- Julie’s statement that there is room for 4 regular and 4 oat milk does not redefine the old wine-cabinet top-shelf standard.
- Espresso-machine milk reservoirs and Workbar Milk Fridge are separate physical systems.
- Workbar Milk Fridge top shelf is exactly 2 regular milk + 2 Oatly.
- Every lower shelf is exclusively for opened and visibly date-labelled wine.
- This standard applies continuously across all shifts and events.
- Cornerbar quantities come only from current manager-maintained saved location standards.
- All Cornerbar refrigerators and internal lights remain on.
- Legacy source alias “salad fridge” maps to the existing canonical Workbar Non-Alco Fridge at `workbar-non-alcoholic-fridge` / `WORKBAR_NON_ALCO_FRIDGE`.
- The earlier separate refrigerator and internal-light interpretation is superseded. Workbar Non-Alco Fridge and its internal light remain on.
- Workbar Non-Alco Fridge resolves its current manager-maintained saved location standard dynamically; Event and routine copy embeds no product or shelf quantities.
- Operational standards are organization-owned and must not be named after an individual.

## Canonical Workbar Milk Fridge standard

Stable key: `workbar-milk-fridge-target`

Display name: Workbar Milk Fridge

Subtitle: Top shelf: milk reserve · Lower shelves: opened, date-labelled wine only
Provenance: Operations-approved standard · confirmed 15 August 2026

The canonical machine-readable value records the physical purpose, exact top-shelf quantities, lower-shelf exclusive-use rule, visible date-label requirement, always-applicable status, event non-override, forbidden item categories, Done criteria and Stock Count separation rules. Opening, Daytime checkpoints, Double Shift handover, Closing and Event content resolve the same standard key.

Approved instruction:

> Restore the top shelf to exactly 2 regular milk cartons and 2 Oatly cartons. Every other shelf is reserved exclusively for opened wine bottles with a visible date label. Do not store additional milk, unopened wine, food, soft drinks, beer, unrelated event products or unlabelled bottles here. This standard does not change for events or different shift types.

## Espresso-machine milk reservoirs

The integrated cooler has separate dairy and oat reservoirs. The reservoirs use fresh, in-date cartons from the Workbar Milk Fridge but are not carton storage and are not a Stock Count location. Opening content must restore the Workbar Milk Fridge after the reservoirs and self-service milk jug are supplied.

## Cornerbar saved standards

Cornerbar Left, Middle and Right resolve their current saved location standards at runtime. Event and Closing content contains no embedded product quantities. An incomplete saved standard produces: “Saved standard incomplete — manager confirmation required.” Every Cornerbar refrigerator and internal light remains on.

## Canonical Workbar Non-Alco Fridge mapping

The quoted legacy source term “salad fridge” does not identify another physical refrigerator, operational standard, task scope or Visual Standard. It is source-provenance shorthand for the existing Workbar Non-Alco Fridge.

- Stable content/location key: `workbar-non-alcoholic-fridge`
- Existing database/location code: `WORKBAR_NON_ALCO_FRIDGE`
- Canonical application display name: Workbar Non-Alco Fridge
- Runtime source: current manager-maintained saved location standard
- Incomplete state: “Saved standard incomplete — manager confirmation required.”

Approved instruction:

> Clean and restore the Workbar Non-Alco Fridge to its current saved location standard. Check dates and FIFO, place and front every product correctly, close the door, and confirm that the refrigerator and its internal light remain on.

Opening, Daytime, Double Shift, Closing and relevant Workbar Event paths use this one physical identity. The saved standard is resolved dynamically. Shortages, date/FIFO issues and incomplete-standard status are recorded as deviations or handover facts without copying product names or quantities into routine/Event content. Routine completion remains separate from Stock Count.

## Stock Count boundary

Regular milk and Oatly are routine-standard items only. They create no inventory products, Stock Count lines, Millum rows or reserve-target contributions. The initial Workbar Milk Fridge Stock Count contains exactly ten approved profile-v2-mapped wines, each as `physical_count_only` with actual physical quantity and no fabricated exact quantity. Blank remains uncounted; explicit zero means none is present. Partial/open-bottle rules, counts, notes, deviations and the protected below-market wine export rules remain authoritative. Routine completion never completes a Stock Count assignment, and Workbar Milk Fridge has no one-tap exact-standard count shortcut.

Planeta Chardonnay item `2295798` is deferred from the initial scope because immutable Millum profile v2 has no enabled row for it. It remains unchanged and unlinked. An unlisted opened wine is recorded by visible product name for manager attention and is never guessed, mapped to another product or assigned a Millum value.

## Main Storage Fridge and Express Shelf refill chain

While standing in front of and facing Main Storage Fridge: Left Reserve is left, Express Shelf is middle and Keg Storage is right. These zones remain one combined Main Storage Fridge Stock Count. Express Shelf is an active, non-countable manager-maintained pick face with an initially incomplete saved standard and an image initially awaiting upload.

The canonical replenishment flow is `Service fridge ← Express Shelf ← Left Reserve`. Fill the service fridge from Express Shelf first, restore Express Shelf from Left Reserve, then confirm both current saved standards. Keg Storage is outside this refill chain. When the Express Shelf standard is incomplete, finish the service-fridge refill where possible and notify the manager; no product or quantity is invented.

## Explicit exclusions and unresolved review items

- Fire and evacuation-plan content remains unresolved and unchanged.
- Shopbox test-sale, customer-creation and subscription-field content remains unresolved and unchanged.
- No provider is installed, no template is published and no production run is created by this amendment.
- No production image is invented, uploaded or claimed present.

## Generated pack metadata

This section is generated from the canonical pack and is excluded from the amendment decision-body hash.

- Pack: `mesh-routine-content@1.5R`
- Canonical pack SHA-256: `710c9412eabc8f2e9c5a6488499ac4654cd7c94b62138eaed9563ab5f0203c9c`
- Amendment decision-body SHA-256: `2a57f578128b6a6b696bf4f93d721fd6c56837ae413c9599a2845885c6c7a834`
- Production action: none; this artifact is local implementation and review only

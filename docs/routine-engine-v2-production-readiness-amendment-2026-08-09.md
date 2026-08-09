# Mesh production-readiness content amendment — 2026-08-09

Status: approved terminology correction for `mesh-routine-content@1.2R`. This amendment preserves the three re-locked v1R source documents and the approved 2026-08-07 operational-standards amendment. It changes terminology only; quantities, physical layouts, routes, timing, dependencies, policies and completion authority are unchanged.

This document does not resolve or guess the serviceware office-floor recovery route. It does not authorize installation, publication, release promotion, pilot membership, operative data or fabricated reference images.

## Locked terminology contract

- Use **Coffee Canisters** for the category, stock, multiple or assigned canisters, operational system, storage serving multiple canisters and shortage states that may affect multiple canisters.
- Use **Coffee Canister** only for one specific physical canister.
- Stable keys remain unchanged.

The canonical 1.1R payload contained 38 exact case-sensitive singular occurrences. Fourteen already refer to one physical canister and remain unchanged. Twenty-four are corrected as follows:

| # | Canonical field | Before | After |
|---:|---|---|---|
| 1 | `locations.8.name` | Coffee Canister kitchen reserve | Coffee Canisters kitchen reserve |
| 2 | `locations.9.name` | Workbar bar Coffee Canister cupboard | Workbar bar Coffee Canisters cupboard |
| 3 | `standards.1.label` | Workbar-assigned Coffee Canister target | Workbar-assigned Coffee Canisters target |
| 5–8 | `references.9/10.label/description` | Coffee Canister lunch reserve / rinsed storage | Coffee Canisters lunch reserve / rinsed storage |
| 9–10 | `O02.timingText` and mirrored metadata | before the first Coffee Canister brewing plan | before the first brewing plan for Coffee Canisters |
| 21 | `O28.locationDescription` | Coffee Canister kitchen reserve | Coffee Canisters kitchen reserve |
| 24–25 | `O29.deviationRulesText` and mirrored metadata | Missing stock, serviceware, Coffee Canister or access. | Missing stock, serviceware, Coffee Canisters or access. |
| 26 | `O34.locationDescription` | Coffee Canister kitchen reserve | Coffee Canisters kitchen reserve |
| 28–29 | `O34.deviationRulesText` and mirrored metadata | Missing or damaged Coffee Canister/part. | One or more Coffee Canisters or parts are missing or damaged. |
| 30–31 | `O35.deviationRulesText` and mirrored metadata | product, serviceware or Coffee Canister shortage | product, serviceware or Coffee Canisters shortage |
| 32–34 | `C06.locationDescription`, deviation and mirrored metadata | Coffee Canister kitchen reserve / Coffee Canister or part missing | Coffee Canisters kitchen reserve / Coffee Canisters or parts missing |
| 35–38 | `C17` instruction, structured text, item label and mirrored source text | Workbar bar Coffee Canister cupboard | Workbar bar Coffee Canisters cupboard |

The fourteen retained singular occurrences are the one-canister self-service requirement, one missing/damaged canister case in O06, the one-canister members-lounge actions in O11/O14/O26, and the explicit one-canister positions in O28/O29/O34. Mirrored metadata fields account for repeated occurrences. Their singular meaning remains physical and specific.

## Production amendment scope

The semantic draft amendment affects task projections O02, O28, O29, O34, O35, C06 and C17. It also updates two location display names, one standard display label and two logical reference labels/descriptions. Existing stable keys, IDs, relationships, reference links and current physical values are preserved.

Production application, if performed, must use only the existing personal-manager RPC contracts with optimistic revisions and stable idempotency keys:

- `upsert_routine_location` for the two display names;
- `create_routine_standard_revision` is **not** required because no structured standard value changes;
- existing standard metadata mutation support for the display label only if available; otherwise leave the server label unchanged and record that non-semantic remainder;
- reference metadata through the existing Reference Manager mutation contract;
- `upsert_routine_draft_task` for the seven task projections;
- no direct table DML, no install, no publish and no run creation.

The original `mesh-routine-content@1.1R` installation ledger remains historical truth. Divergence after supported draft amendments is expected only where this manifest lists it.

## Unresolved physical fact

`serviceware-office-recovery-route-confirmation` remains unresolved without a current revision. O15, C03 and C27 remain truthful publication/readiness blockers. No floor, room, pickup point, route order, handling method or completion proof is inferred.

## Generated pack metadata

This section is generated from the canonical pack and is excluded from the amendment decision-body hash.

- Pack: `mesh-routine-content@1.2R`
- Canonical pack SHA-256: `2dcfc69b822f973c23e54934b6799faa5b9400ae0529096f049067811a417f25`
- Amendment decision-body SHA-256: `d0280ca6e780f8f6876ad8747f0ee80693ebb1aa0a15761b63962376f8e54224`
- Production action: supported draft amendment only; never installation or publication

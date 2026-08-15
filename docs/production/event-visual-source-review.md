# Event visual source review — 15 August 2026

This review records the operational interpretation used by the release candidate. It stores source page IDs and decisions only. No signed Notion URL, credential, alarm detail, personal phone information, customer-sensitive binary, or production object path is committed.

## Reviewed sources

| Area | Source page ID | Review outcome |
|---|---|---|
| Atrium layouts | `3b90d8d1-a8b2-80af-bfde-db0e9d7a9170` | Parent source reviewed with Café, Cinema, Group Tables, Classroom, Horseshoe, Buffet and Mingle / Concert children retained as distinct targets. |
| Atrium Café / Default | `3b90d8d1-a8b2-8085-b7a5-c4d48fef2080` | Authoritative default: 6 round tables, 4 chairs each, 24 chairs total, one wardrobe rack on each entrance side, 4 serving tables and 1 bin. |
| Atrium Cinema | `3b90d8d1-a8b2-807f-a71b-c38d8a820db6` | Capacity is a documented range of 173–194 depending on orange-cushion occupancy; smaller bookings retain the rear lounge. |
| Atrium Group Tables | `3b90d8d1-a8b2-8062-b54c-d751312462f5` | Main-floor maximum 7 groups; documented alternatives can reach 15. |
| Atrium Classroom | `3b90d8d1-a8b2-80bb-a4ec-d5b2e4669b29` | Current source page is blank; category retained with an honest placeholder and no invented capacity. |
| Atrium Horseshoe | `3b90d8d1-a8b2-80f4-82f9-cd983a3db52c` | Three meaningful source angles retained. |
| Atrium Buffet | `3b90d8d1-a8b2-80f9-be38-f8d39624b444` | Current source page is blank; named target retained without invented dimensions. |
| Atrium Mingle / Concert | `3b90d8d1-a8b2-8072-8428-c8b3bad7155f` | Current source page is empty; named target and older comparison keys retained explicitly. |
| Cornerbar layouts | `3b90d8d1-a8b2-8043-9041-fcdaed851e70` | Café / Default, Cinema, Group, Classroom, Horseshoe and Mingle / Concert remain distinct. |
| Cornerbar Café / Default | `3b90d8d1-a8b2-80d3-a522-c6d6d76de97e` | Five distinct furniture angles treated as one default restore journey. |
| Serving stations | `3b90d8d1-a8b2-80ef-867c-c9ade5fedc0d` | Wash tables; guest count controls cups/glasses; water is half ice then water; record every new coffee; add only ordered products. |
| Atrium Stage Tech | `3b90d8d1-a8b2-80cb-a4f6-f6ee57a50555` | Latest source resolves the conflict to 2 handheld and 2 headset microphones, 4 receivers plus 2 extra handheld receivers, HDMI + USB-C, new batteries and green DI box. |
| Cornerbar Stage Tech | `3b90d8d1-a8b2-806a-a02c-fae86c5292de` | 1 high table, 1 tablet, 1 handheld, 1 headset, HDMI + USB-C and new batteries; stage-light controller under left bar. |
| Cornerbar operations | `3910d8d1-a8b2-8025-bce7-ed08132f23de` | Bar-ready and closing-reset proof are kept separate from furniture restoration. Sensitive operational contact/security details were excluded. |
| Workbar Photos | `3b90d8d1-a8b2-8093-b35e-de3d747ab890` | Updated page is empty. Existing written Workbar conference guidance is preserved and no fake image slot is claimed. |

## Received image metadata

The supplied sets are represented as 20 distinct angle records only: Atrium Café 9, Cornerbar Default 5, Cornerbar Group 3, Cornerbar Horseshoe 2, and Cornerbar Coffee / Water / Tea 1. Every record is `awaiting_production_upload`; no image binary was added to the repository or uploaded to production.

## Conflict decisions

- The latest explicit Atrium Stage Tech source wins over the older task copy that mentioned three headsets and a throwable microphone. The UI calls out the superseded combination as a common miss.
- Default venue targets and customer-selectable layouts are separate guide selections. A customer layout can never silently become the restore default.
- Cornerbar furniture restoration does not prove device charging, fridge state, labels, bottle washing, fruit disposal, or sparkling-wine dating. Those checks remain in the separate closing-reset journey.
- Blank or empty source pages remain honest written-only or placeholder states. No visual fact is inferred from absence.

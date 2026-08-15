# Read-only production observations — 15 August 2026

Scope: Supabase project `jzuegkbzgynknnvivhia`, `eu-west-1`, PostgreSQL 17.6.1.127. Every SQL observation ran inside a read-only transaction and rolled back. No application, database, Storage, content, publication, mode, UI-stage or migration-ledger write was made.

| Area | Observation |
|---|---|
| Project | `ACTIVE_HEALTHY` |
| Migration ledger | Visible terminal entry is Phase 10R; S–V objects are semantically equivalent to the repository according to the separate matrix. |
| Organization settings | One organization; mode `shadow`, UI stage `staff_preview`, shared mode false. |
| Routine state | 2 templates, 0 published versions, 0 runs, 0 assignments. |
| Routine content | 563 task lines; installed pack remains 1.1R with hash `c149…`; 1.4R provider hash is `48b7c4dfdb1340ddff14748a3c6d57df504f33fe822f25b6dde0d4ab48a6caf8`. |
| Inventory | 3 approved + 3 cancelled sessions; 0 active sessions. |
| Events | 9 events; none on 15 August 2026. |
| Visual references | 40 references, all placeholders; 0 active images; 0 object paths. |
| Storage | `routine-reference-images` exists and is private (`public=false`). |
| Security advisor | `set_updated_at()` mutable search path and unintended anonymous Event Ops function execution were confirmed; Phase 10X is the reviewed forward repair. Generic authenticated security-definer findings were not broadened beyond this task. |

The currently deployed `gh-pages` observation remained `e712001b1706ec4175c1dd29472a1b35d7844338`; no Pages deployment was attempted.

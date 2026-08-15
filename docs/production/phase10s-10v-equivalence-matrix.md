# Phase 10S–10V production equivalence matrix

Observed read-only on 15 August 2026 against Supabase project `jzuegkbzgynknnvivhia`. Expected fingerprints were reproduced in a network-disabled disposable PostgreSQL 17.6 container by applying the repository migrations through Phase 10V. SHA-256 is over `pg_get_functiondef`. No production migration, ledger repair, data write, content installation, publication or mode change was performed.

| Migration | Intended effect | Live object / signature | Live fingerprint / catalog | Expected repository fingerprint / catalog | Result | Safe ledger action proposal |
|---|---|---|---|---|---|---|
| 10S | Expose the inert 1.4R content provider without installing or publishing | `routine_mesh_content_pack_v1()` | `360c96d9e04307c89a25fcf8fb13be9a6beef9573753707ca25900a68201bd80` | `360c96d9e04307c89a25fcf8fb13be9a6beef9573753707ca25900a68201bd80` | Exact match | Do not reapply. Under a separate approved ledger-reconciliation procedure, record only the already-proven S state. |
| 10T | Align personal participant conflict targets with the validated partial identities | `create_or_get_routine_run_phase10d(text,text,date,uuid)` | `1e1594c8f306a190edf27b955d59e83b328152745c96926cff7ed277a91e3a3c` | `1e1594c8f306a190edf27b955d59e83b328152745c96926cff7ed277a91e3a3c` | Exact match | Same S–V ledger-only reconciliation proposal; no function replacement. |
| 10T | Same | `join_routine_run_phase10d(uuid,uuid)` | `385bdd85fed19bc8bd5518a2c9621e9de0f9ea55b781acdbd6651e00cb339da3` | `385bdd85fed19bc8bd5518a2c9621e9de0f9ea55b781acdbd6651e00cb339da3` | Exact match | Same; no function replacement. |
| 10T | Same | `routine_ensure_run_participant(uuid,uuid,uuid,uuid)` | `472ce9f602a1bfcf06dbc62eb2897421711c64a94f3c4c3305b060d89ac92700` | `472ce9f602a1bfcf06dbc62eb2897421711c64a94f3c4c3305b060d89ac92700` | Exact match | Same; no function replacement. |
| 10T | Same | `routine_ensure_bundle_participant(uuid,uuid,uuid,uuid)` | `6510659506434b7844ee0f64c0ec61fc96eb9a4bf2764d2933b727c9a08f8d77` | `6510659506434b7844ee0f64c0ec61fc96eb9a4bf2764d2933b727c9a08f8d77` | Exact match | Same; no function replacement. |
| 10T | Same | `routine_ensure_closing_bundle_participant(uuid,uuid,uuid,uuid)` | `82e3dde6d62267a217d31abe9f3683ed97b06525f0dbae7f9d5e658721b12932` | `82e3dde6d62267a217d31abe9f3683ed97b06525f0dbae7f9d5e658721b12932` | Exact match | Same; no function replacement. |
| 10U | Converge operation-ledger replay and immutable writer behavior under concurrency | `routine_run_operation_replay(uuid,uuid,text,uuid,text)` | `0b3ceda5f63139a27ce505cc7dc932074e742af66f55e441b07fcb25bc03675b` | `0b3ceda5f63139a27ce505cc7dc932074e742af66f55e441b07fcb25bc03675b` | Exact match | Same S–V ledger-only reconciliation proposal; no function replacement. |
| 10U | Same | `routine_record_run_operation(uuid,uuid,text,uuid,text,text,uuid,jsonb)` | `dea542f87108ff956202359eda372c6ed343bdd6dc3286ae786566f7da395fa4` | `dea542f87108ff956202359eda372c6ed343bdd6dc3286ae786566f7da395fa4` | Exact match | Same; no function replacement. |
| 10U | Same | `routine_bundle_operation_replay(uuid,uuid,text,uuid,text)` | `cd816b9a0d91899d740a58f5a22d926f2dee8f3c67b0ace34a77e7d231943ae8` | `cd816b9a0d91899d740a58f5a22d926f2dee8f3c67b0ace34a77e7d231943ae8` | Exact match | Same; no function replacement. |
| 10U | Same | `routine_record_bundle_operation(uuid,uuid,text,uuid,text,text,uuid,jsonb)` | `527156c129e8a54064dc1b662d4b4672c9fe724919db94ec8d3e218e6c1e0362` | `527156c129e8a54064dc1b662d4b4672c9fe724919db94ec8d3e218e6c1e0362` | Exact match | Same; no function replacement. |
| 10V | Remove four obsolete creation-key uniqueness constraints while retaining provenance columns and business-identity indexes | `routine_runs_org_creation_idempotency_unique` | absent | absent | Exact match | Under the same separately approved reconciliation, record V only; do not drop anything again. |
| 10V | Same | `routine_run_participants_org_idempotency_unique` | absent | absent | Exact match | Same; no DDL. |
| 10V | Same | `routine_bundles_org_idempotency_unique` | absent | absent | Exact match | Same; no DDL. |
| 10V | Same | `routine_bundle_participants_idempotency_unique` | absent | absent | Exact match | Same; no DDL. |

## Conclusion and proposed pending order

The visible production migration ledger ends at Phase 10R, while every reviewed Phase 10S–10V object is an exact semantic match. A safe cutover proposal is therefore:

1. Stop and obtain Bobby’s explicit approval for a ledger-only S–V reconciliation procedure that records the already-present exact states without re-running their function or constraint DDL.
2. Independently re-read and fingerprint S–V immediately before that procedure; any mismatch or unknown stops the cutover.
3. After the ledger is coherent, apply the genuinely pending additive migrations in order: `phase10w_event_visual_reference_bridge.sql`, then `phase10x_event_visual_library_expansion.sql`.
4. Keep 1.4R content installation draft-only and separate; do not publish or change mode / UI stage in the migration step.

This is a proposal for a later authorized window, not an action performed by this release-preparation task.

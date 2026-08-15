# Event visual and Phase 10X authorization matrix

Verified in a network-disabled disposable PostgreSQL 17.6 container. Production was observed read-only only.

| Actor / boundary | Sanitized visual metadata | Current allowed private image | Old / manager-only / other-org image | Reference tables | Event Ops client RPC after X |
|---|---|---|---|---|---|
| Manager, active personal profile | Allowed, same organization | Allowed | Manager workflow retains its existing same-org version access | Existing manager access unchanged | Allowed through existing in-function authorization |
| Event Floor Manager, active personal profile | Allowed, allowlisted keys only | Allowed, current active version only | Denied | Zero rows | Allowed through existing in-function authorization |
| Ordinary staff | Denied unless existing published-routine path applies | Existing published-routine behavior unchanged | Denied | Existing RLS unchanged | Existing authenticated boundary unchanged |
| Inactive Event Floor Manager | Denied | Denied | Denied | Zero rows | Existing in-function authorization denies |
| Shared-device Event Floor Manager | Denied | Denied | Denied | Zero rows | Existing in-function authorization denies |
| Anonymous | Denied | Denied | Denied | Denied | Execute removed from all reviewed Event Ops client RPCs |

Internal Event Ops predicates and trigger helpers are not direct `authenticated` boundaries after Phase 10X. `set_updated_at()` has `search_path=pg_catalog` and no client execution grant. Storage remains private; no public bucket or broad `using (true)` policy is introduced.

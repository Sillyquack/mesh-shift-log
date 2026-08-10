# Phase 10F Runtime-Contract Alignment Amendment

Date: 2026-08-09  
Authority: Robert, supplied as the reviewed Phase 10S runtime-contract decisions  
Scope: `mesh-routine-content@1.4R` derived from the frozen `mesh-routine-content@1.3R`

This amendment changes only the reviewed runtime-contract decisions, nine inventory item-source bindings and six C37 asset item-source bindings below. It preserves the complete 1.3R serviceware-route content, all other task semantics, all Foundation values, every reference, and all Double Shift content.

## O15 availability

O15 remains an operational `measurement` with target and hard-deadline local time `10:45:00`. Its availability mode is `immediate`, not `time_window`, because the route may be performed at any appropriate point during Opening and must be fully complete no later than 10:45. No visible or start time is invented.

O15 retains its original source/provenance classification and source hash, all serviceware-route text and bindings, every policy, its stable key, ID, location set, dependencies and all other timing fields.

## O22 organization-flag condition

The O22 task condition uses the Phase 10F wire format:

```json
{
  "fact": "organization_flag",
  "key": "seasonal_candles",
  "operator": "equals",
  "value": true
}
```

The O22 to C22 `conditional_companion` relation carries the same condition object in its metadata. The organization-flag name belongs in `key`; `value` is the boolean expected state.

## O23 availability

O23 remains an operational `checkpoint` with target local time `08:00:00`. Its availability mode is `immediate`, not `time_window`. No start time is invented. All text, structured items, references, policies, location data and other timing remain unchanged.

## O37 availability

O37 remains an operational `gate` with target local time `11:00:00`. Its availability mode is `after_task`, not `time_window`. No start time is invented. The existing O30 through O36 `must_complete` dependencies and every other field remain unchanged.

## C14 time window

C14 remains a `checkpoint` with `time_window` availability. Its complete local timing is:

- visible: `17:35:00`
- start: `17:35:00`
- target: `17:45:00`
- overdue: `17:55:00`

Visible and start are intentionally identical because no distinct later start was authorized.

## C15 source classification and operational type

C15 retains its original source/provenance classification `checkpoint`. Its operational `taskType` is `gate`. These are separate concepts: source classification records what the locked content source called the task, while operational task type controls Phase 10F runtime behavior.

C15 keeps its title, instructions, structured items, done criteria, deviation rules, references, repeat policy, location set and every other semantic field. It has no invented target time.

## C05, C14 and C15 dependency graph

The former `C05 → C14 / must_complete` dependency is removed. A single `C05 → C15 / complete_predecessor_on_successor` dependency is added. C05 therefore remains active through pre-close until C15 confirms actual final service end. C14 may assess current table-maintenance state without automatically completing C05.

## O13, C08 and C28 inventory item-source bindings

The generator uses explicit task/item bindings rather than label or key substring inference. In each of O13, C08 and C28, only `inventory_standard_items` uses `inventory_readonly`, with the exact Phase 10D configuration:

```json
{
  "mode": "location_standards",
  "locationCodes": ["WORKBAR_NON_ALCO_FRIDGE"],
  "activeOnly": true
}
```

These three items expand once per active matching Inventory product standard. In the same three tasks, `eggs_present_and_to_standard` and `fridge_clean_and_operating` remain static and each produces exactly one physical run check. The explicit egg check remains intentional even when Inventory also contains an egg product. No item retains the legacy `locationCode`/`access` configuration, and no source binding is derived from free-text labels.

## C37 asset-registry item-source bindings

The generator uses an explicit task/item binding for C37 rather than treating every item in that task as dynamic. Only `C37/active_asset_registry_items` uses `asset_registry_readonly`, with the exact Phase 10D configuration:

```json
{
  "mode": "active_assets",
  "requiredForClosing": true
}
```

This item expands once per active asset in the run organization that is required for Closing, without narrowing by venue, station or asset type. The other five C37 controls remain aggregate static checks with an empty source configuration: `device_physically_accounted_for` is a count, while `correct_charging_position`, `charging_confirmed`, `damage_or_fault_recorded` and `event_transfer_evidence_when_required` are checks. No C37 item retains the legacy `access` configuration, and no source binding is derived from free-text labels.

## Validator policy

The Phase 10F validator remains unchanged. Its requirements were already correct: time-window tasks need a start, active checkpoints need a target, conditional tasks need a valid condition, after-task tasks need a dependency, and continuous automatic completion must be represented by a valid `complete_predecessor_on_successor` dependency. Phase 10S aligns content with that contract instead of weakening or replacing it.

## Provenance and scope

The generator records amendment provenance on the changed source document, O22, O23, O37, C14, C15, the corrected O22/C22 relation, and the new C05/C15 dependency. The nine inventory and six C37 asset item corrections retain their locked item metadata and differ only in their explicitly allowlisted source binding fields. O15 changes only availability mode and retains its prior source hash. Generated pack metadata below is excluded from this decision-body hash. The immutable 1.1R, 1.2R and 1.3R packs and their provider migrations are not rewritten.

## Generated pack metadata

This section is generated from the canonical pack and is excluded from the amendment decision-body hash.

- Pack: `mesh-routine-content@1.4R`
- Canonical pack SHA-256: `48b7c4dfdb1340ddff14748a3c6d57df504f33fe822f25b6dde0d4ab48a6caf8`
- Amendment decision-body SHA-256: `56cc1ac9b6fc1cdc89586f8539e185dfef6e6a5d54d483bbdffcbb1d7ff4c2af`
- Production action: none; this artifact is local implementation and review only

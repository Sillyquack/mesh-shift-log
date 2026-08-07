import { managerRpc } from "./routineManagerClient.js";
export const routineConfigurationClient = Object.freeze({
  saveSettings: (p) => managerRpc("create_or_update_routine_organization_settings", { input_mode:p.mode,input_timezone:p.timezone,input_operational_day_cutoff:p.operationalDayCutoff,input_shared_device_enabled:p.sharedDeviceEnabled,input_reopen_window_hours:p.reopenWindowHours,input_expected_revision:p.expectedRevision }),
  saveLocation: (p) => managerRpc("upsert_routine_location", { input_location_key:p.stableKey,input_name:p.name,input_location_type:p.locationType,input_parent_location_id:p.parentLocationId||null,input_sort_order:p.sortOrder,input_metadata:p.metadata||{},input_location_id:p.id||null,input_expected_revision:p.expectedRevision??null }),
  setLocationActive: (p) => managerRpc("set_routine_location_active", { input_location_id:p.id,input_active:p.active,input_expected_revision:p.expectedRevision }),
  saveLocationSet: (p) => managerRpc("upsert_routine_location_set", { input_set_key:p.stableKey,input_name:p.name,input_description:p.description||null,input_active:p.active,input_location_set_id:p.id||null,input_expected_revision:p.expectedRevision??null }),
  replaceLocationSetMembers: (p) => managerRpc("replace_routine_location_set_members", { input_location_set_id:p.id,input_members:p.members,input_expected_revision:p.expectedRevision }),
  createStandard: (p) => managerRpc("create_routine_standard", { input_standard_key:p.stableKey,input_label:p.label,input_description:p.description||null,input_value_type:p.valueType,input_unit:p.unit||null,input_source_kind:p.sourceKind,input_active:p.active }),
  createStandardRevision: (p) => managerRpc("create_routine_standard_revision", { input_standard_id:p.standardId,input_value_json:p.value,input_effective_from:p.effectiveFrom||null,input_reason:p.reason,input_idempotency_key:p.idempotencyKey,input_expected_revision:p.expectedRevision }),
});

export const ROUTINE_STANDARD_CREATABLE_SOURCE_KINDS = Object.freeze([
  "manual",
  "inventory_readonly",
  "asset_registry_readonly",
  "location_set",
]);

export const ROUTINE_STANDARD_SOURCE_KIND_LABELS = Object.freeze({
  manual: "Manual",
  inventory_readonly: "Inventory · read only",
  asset_registry_readonly: "Asset registry · read only",
  location_set: "Location set",
  location_standards: "Location standards · read only",
});

export function routineStandardSourceKindLabel(value) {
  return ROUTINE_STANDARD_SOURCE_KIND_LABELS[value] || value || "Unknown source";
}

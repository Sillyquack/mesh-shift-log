import { readFileSync } from 'node:fs';

export const PHASE9_MIGRATION_MANIFEST_URL = new URL(
  '../supabase/phase9-migration-order.json',
  import.meta.url,
);

export const EXPECTED_PHASE9_MIGRATION_ORDER = [
  'supabase/schema.sql',
  'supabase/phase7a_workbar_device_auth.sql',
  'supabase/phase9a_inventory_stocktaking.sql',
  'supabase/phase9a4_inventory_location_template.sql',
  'supabase/phase9b_stock_policies.sql',
  'supabase/phase9c_inventory_security_hardening.sql',
  'supabase/phase9d_inventory_session_integrity.sql',
  'supabase/phase9e_inventory_product_identity_csv.sql',
  'supabase/phase9f_inventory_structured_quantities.sql',
  'supabase/phase9g_inventory_operational_scope.sql',
  'supabase/phase9gb_inventory_counter_assignments.sql',
  'supabase/phase9gb2_inventory_counter_replacement.sql',
  'supabase/phase9gc_inventory_counter_mobile.sql',
  'supabase/phase9gd_inventory_product_mappings.sql',
  'supabase/phase9h_inventory_session_location_scope.sql',
  'supabase/phase9i_millum_stock_count_exports.sql',
  'supabase/phase9j_inventory_shelf_storage_guidance.sql',
  'supabase/phase9k_millum_complete_count_export.sql',
  'supabase/20260804123921_phase9l_millum_august_carry_forward_and_future_scope.sql',
  'supabase/20260804151500_phase9m_millum_snapshot_supplement.sql',
  'supabase/20260804180000_phase9n_millum_single_authoritative_session.sql',
  'supabase/20260804200000_phase9o_millum_wine_value_conversion.sql',
  'supabase/20260805035957_phase9p_millum_export_explanations.sql',
];

export const PHASE9_TERMINAL_MIGRATION =
  'supabase/20260805035957_phase9p_millum_export_explanations.sql';

export const PHASE9_REPEATABLE_MIGRATIONS = new Set([
  'supabase/phase9h_inventory_session_location_scope.sql',
  'supabase/phase9i_millum_stock_count_exports.sql',
  'supabase/phase9j_inventory_shelf_storage_guidance.sql',
  'supabase/phase9k_millum_complete_count_export.sql',
]);

export const PHASE9_PRODUCT_MAPPING_MIGRATION =
  'supabase/phase9gd_inventory_product_mappings.sql';

export const PHASE9_SESSION_INTEGRITY_MIGRATION =
  'supabase/phase9d_inventory_session_integrity.sql';

export function readPhase9MigrationManifest() {
  return JSON.parse(readFileSync(PHASE9_MIGRATION_MANIFEST_URL, 'utf8'));
}

export function validatePhase9MigrationOrder(paths) {
  if (!Array.isArray(paths)) throw new Error('Phase 9 migration order must be an array.');
  if (paths.length !== EXPECTED_PHASE9_MIGRATION_ORDER.length) {
    throw new Error('Phase 9 migration order has missing or additional files.');
  }
  for (const [index, expectedPath] of EXPECTED_PHASE9_MIGRATION_ORDER.entries()) {
    if (paths[index] !== expectedPath) {
      throw new Error(`Phase 9 migration ${index + 1} must be ${expectedPath}.`);
    }
  }
  if (paths.at(-1) !== PHASE9_TERMINAL_MIGRATION) {
    throw new Error('Phase 9P export explanations must be the terminal migration.');
  }
  return paths;
}

export function validatedPhase9MigrationEntries(manifest = readPhase9MigrationManifest()) {
  if (manifest?.manifestVersion !== 1) {
    throw new Error('Unsupported Phase 9 migration manifest version.');
  }
  const entries = manifest?.orderedMigrations;
  if (!Array.isArray(entries) || entries.some((entry) => !entry?.id || !entry?.path)) {
    throw new Error('Phase 9 migration manifest entries are invalid.');
  }
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) {
    throw new Error('Phase 9 migration manifest contains a duplicate path.');
  }
  for (const entry of entries) {
    const expectedRepeatable = PHASE9_REPEATABLE_MIGRATIONS.has(entry.path);
    if (entry.repeatable !== expectedRepeatable) {
      throw new Error(`Phase 9 migration repeatability is incorrect for ${entry.path}.`);
    }
  }
  if (manifest.terminalMigration !== PHASE9_TERMINAL_MIGRATION) {
    throw new Error('Phase 9 migration manifest has the wrong terminal migration.');
  }
  validatePhase9MigrationOrder(entries.map((entry) => entry.path));
  return entries;
}

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
];

export const PHASE9_TERMINAL_SECURITY_MIGRATION =
  'supabase/phase9c_inventory_security_hardening.sql';

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
  if (paths.at(-1) !== PHASE9_TERMINAL_SECURITY_MIGRATION) {
    throw new Error('Phase 9C security hardening must be the terminal migration.');
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
    const expectedRepeatable = entry.path === PHASE9_TERMINAL_SECURITY_MIGRATION;
    if (entry.repeatable !== expectedRepeatable) {
      throw new Error(`Phase 9 migration repeatability is incorrect for ${entry.path}.`);
    }
  }
  if (manifest.terminalSecurityMigration !== PHASE9_TERMINAL_SECURITY_MIGRATION) {
    throw new Error('Phase 9 migration manifest has the wrong terminal security migration.');
  }
  validatePhase9MigrationOrder(entries.map((entry) => entry.path));
  return entries;
}

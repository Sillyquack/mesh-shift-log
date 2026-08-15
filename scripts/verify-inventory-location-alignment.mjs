import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXPRESS_SHELF_STANDARD,
  MAIN_STORAGE_ORIENTATION,
  MAIN_STORAGE_ZONES,
  PLANETA_INITIAL_SCOPE_DEFERRAL,
  UNLISTED_OPENED_WINE,
  WORKBAR_MILK_FRIDGE_LINE_NOTE,
  WORKBAR_MILK_FRIDGE_WINES,
} from '../src/data/inventoryLocationAlignment.js';
import { workbarMilkFridgeStandard } from '../src/data/fridgeOperationalStandards.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const migration = read('supabase/phase10z_inventory_location_and_express_shelf_alignment.sql');
const alignmentSource = read('src/data/inventoryLocationAlignment.js');
const client = read('src/lib/inventoryClient.js');
const counter = read('src/components/InventoryCounterExperience.jsx');
const manager = read('src/components/InventoryCounterWorkflowsLegacy.jsx');
const pack = JSON.parse(read('content/routine-engine/mesh-routine-content-v1-5r.json'));
const historical = read('content/routine-engine/mesh-routine-content-v1-4r.json');
const manifest = read('scripts/phase10ProductionMigrationOrder.mjs');
const runbook = read('docs/production/2026-08-17-production-runbook.md');
let passed = 0;
const check = (label, condition) => {
  assert.ok(condition, label);
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, '0')} ${label}`);
};

check('exactly ten reviewed wines have unique stable product and Millum identities', WORKBAR_MILK_FRIDGE_WINES.length === 10
  && new Set(WORKBAR_MILK_FRIDGE_WINES.map((wine) => wine.productId)).size === 10
  && new Set(WORKBAR_MILK_FRIDGE_WINES.map((wine) => wine.millumItemRef)).size === 10
  && WORKBAR_MILK_FRIDGE_WINES.every((wine, index) => wine.countOrder === index + 1));
for (const wine of WORKBAR_MILK_FRIDGE_WINES) {
  check(`${wine.millumItemRef} is bound by stable UUID and profile-v2 guard`, migration.includes(wine.productId)
    && migration.includes(`'${wine.millumItemRef}'`));
}
check('approved physical-count note is exact', migration.includes(WORKBAR_MILK_FRIDGE_LINE_NOTE));
check('all wine lines are targetless actual physical quantities', /stock_policy = 'physical_count_only'/.test(migration)
  && /par_quantity = 0/.test(migration)
  && /contributes_to_storage_target = false/.test(migration)
  && /historical_suggestion_quantity = null/.test(migration));
check('Planeta is guarded unchanged and excluded from location/profile scope', PLANETA_INITIAL_SCOPE_DEFERRAL.productId === '73054357-e1af-423b-bf8a-1c32968275f5'
  && PLANETA_INITIAL_SCOPE_DEFERRAL.millumItemRef === '2295798'
  && /v_planeta_after is distinct from v_planeta_before/.test(migration)
  && /Planeta must remain unlinked/.test(migration)
  && /Planeta must remain outside immutable profile v2/.test(migration));
check('Millum profiles are fingerprinted before and after without profile writes', /v_profile_after is distinct from v_profile_before/.test(migration)
  && !/insert into public\.inventory_millum_export_(?:profiles|rows)/i.test(migration)
  && !/update public\.inventory_millum_export_profiles/i.test(migration));
check('profile v3 is neither created nor tolerated', /refuses an unexpected Millum profile v3/i.test(migration)
  && !/profile_version\s*[,)][^;]*\b3\b/i.test(migration));
check('milk, Oatly, Test Oatly and generic Other Wine are negative-guarded', /milk, Oatly, or generic wine count lines/i.test(migration)
  && /test oatly/.test(migration.toLowerCase())
  && /other wine/.test(migration.toLowerCase()));
check('routine 2 + 2 is separate from ten-line Stock Count', workbarMilkFridgeStandard.stockCount.regularMilk.policy === 'routine_only'
  && workbarMilkFridgeStandard.stockCount.oatly.policy === 'routine_only'
  && workbarMilkFridgeStandard.stockCount.openedWine.configuredLineCount === 10
  && workbarMilkFridgeStandard.stockCount.fastStandardPathAllowed === false);
check('Count Mode has physical-only copy and no fast shortcut for milk assignment', /physicalCountOnly \?/.test(counter)
  && /Count every configured wine\. No quantity is predetermined\./.test(counter)
  && /blank remains uncounted/i.test(counter));
check('unlisted wine creates manager attention and acceptance blocks while open', client.includes('report_inventory_counter_unlisted_wine')
  && client.includes('resolve_inventory_unlisted_wine_attention')
  && alignmentSource.includes(UNLISTED_OPENED_WINE.frontline)
  && manager.includes('UnlistedWineAttentionManager')
  && /Resolve every unlisted opened wine manager-attention record before accepting/.test(migration));
check('Main Storage orientation and zones are canonical', MAIN_STORAGE_ZONES.map((zone) => zone.position).join('|') === 'left|middle|right'
  && migration.includes(MAIN_STORAGE_ORIENTATION)
  && /one combined Stock Count/i.test(migration));
check('Express Shelf is idempotent, non-countable and targetless', /MAIN_STORAGE_EXPRESS_SHELF/.test(migration)
  && /'Express Shelf'.*true, false/s.test(migration)
  && /Express Shelf standards cannot create targets or reserve contributions/.test(migration)
  && /countabilityLocked/.test(migration));
check('Express Shelf supports manager-maintained live image replacement', /referenceGuidanceEnabled/.test(migration)
  && /Active non-countable operational pick faces/.test(migration)
  && EXPRESS_SHELF_STANDARD.imageStatus === 'Default image awaiting upload.');
check('refill chain and incomplete fallback are present in corrected 1.5R', JSON.stringify(pack).includes('Service fridge')
  && JSON.stringify(pack).includes('Express Shelf')
  && JSON.stringify(pack).includes('Left Reserve')
  && JSON.stringify(pack).includes(EXPRESS_SHELF_STANDARD.incomplete));
check('historical 1.4R stays byte-identical', createHash('sha256').update(historical).digest('hex') === 'a69042a4e8f25d07e952821a0fdcadb24a8f1cb55a4e53044b6f28909ea8fba4');
check('corrected content remains 1.5R and no 1.6R exists', pack.packVersion === '1.5R'
  && !read('scripts/generate-routine-content-pack.mjs').includes('1.6R'));
check('Phase 10Z is terminal in manifest and runbook', manifest.includes("'supabase/phase10z_inventory_location_and_express_shelf_alignment.sql'")
  && /Phase 10W, then Phase 10X, then Phase 10Y, then Phase 10Z/.test(runbook));
check('migration excludes production execution and unrelated domains', !/(?:install_mesh_routine|publish_routine|create_or_get_routine_run|ui_release_stage\s*=|mode\s*=|shopbox|evacuation)/i.test(migration)
  && !/storage\.objects|\.upload\(/i.test(migration));

console.log(`Inventory location alignment verification: ${passed}/${passed} passed.`);

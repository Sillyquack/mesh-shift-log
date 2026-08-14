import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  assertKnownPhase10ProductionMigration,
  pendingPhase10ProductionMigrations,
  PHASE10_PRODUCTION_MIGRATIONS,
  PHASE10_PRODUCTION_TERMINAL_MIGRATION,
} from './phase10ProductionMigrationOrder.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const absolute = (path) => resolve(ROOT, path);
const runbook = readFileSync(
  absolute('docs/production/2026-08-17-production-runbook.md'),
  'utf8',
);
const bridge = readFileSync(
  absolute('supabase/phase10w_event_visual_reference_bridge.sql'),
  'utf8',
);

test('production migration manifest is unique, complete on disk and terminal at Phase 10W', () => {
  assert.equal(PHASE10_PRODUCTION_MIGRATIONS.length, 25);
  assert.equal(new Set(PHASE10_PRODUCTION_MIGRATIONS).size, 25);
  assert.ok(PHASE10_PRODUCTION_MIGRATIONS.every((path) => existsSync(absolute(path))));
  assert.equal(
    PHASE10_PRODUCTION_TERMINAL_MIGRATION,
    'supabase/phase10w_event_visual_reference_bridge.sql',
  );
  assert.equal(
    PHASE10_PRODUCTION_MIGRATIONS.at(-2),
    'supabase/phase10v_routine_creation_idempotency_provenance_alignment.sql',
  );
});

test('runbook lists every migration exactly once in manifest order', () => {
  let previousIndex = -1;
  for (const path of PHASE10_PRODUCTION_MIGRATIONS) {
    const filename = path.split('/').at(-1);
    const matches = runbook.match(new RegExp(filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || [];
    assert.equal(matches.length, 1, `${filename} must appear exactly once in the runbook order`);
    const index = runbook.indexOf(filename);
    assert.ok(index > previousIndex, `${filename} is out of order in the runbook`);
    previousIndex = index;
  }
});

test('pending migration calculation preserves canonical order and rejects unknown files', () => {
  const applied = PHASE10_PRODUCTION_MIGRATIONS.slice(0, 22);
  assert.deepEqual(
    pendingPhase10ProductionMigrations(applied),
    PHASE10_PRODUCTION_MIGRATIONS.slice(22),
  );
  assert.equal(
    assertKnownPhase10ProductionMigration(PHASE10_PRODUCTION_TERMINAL_MIGRATION),
    PHASE10_PRODUCTION_TERMINAL_MIGRATION,
  );
  assert.throws(
    () => assertKnownPhase10ProductionMigration('supabase/manual-hotfix.sql'),
    /Unknown Phase 10 production migration/,
  );
});

test('Phase 10W stays additive and least privilege', () => {
  assert.doesNotMatch(bridge, /\bdrop\s+(?:table|schema|column)\b/i);
  assert.doesNotMatch(bridge, /\btruncate\b|\bdelete\s+from\b/i);
  assert.doesNotMatch(bridge, /grant\s+(?:select|insert|update|delete)\s+on\s+table/i);
  assert.doesNotMatch(bridge, /using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)/i);
  assert.match(bridge, /security definer\nset search_path = pg_catalog/i);
  assert.match(bridge, /revoke all on function public\.event_visual_current_user_can_read\(\)/i);
  assert.match(bridge, /grant execute on function public\.get_event_visual_references\(text\[\]\)\s+to authenticated/i);
});

test('runbook declares all three Oslo fallback windows and Monday go/no-go', () => {
  for (const phrase of [
    'Friday 14 August 23:30',
    'Saturday 15 August 23:30',
    'Sunday 16 August 22:30',
    'Monday 17 August 06:15',
    'Monday 17 August 07:00',
    'Go / no-go criteria',
    'Rollback and forward-fix strategy',
  ]) {
    assert.ok(runbook.includes(phrase), phrase);
  }
});

console.log(`Verified ${PHASE10_PRODUCTION_MIGRATIONS.length} ordered production migrations and the Monday launch runbook.`);

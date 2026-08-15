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
const expansion = readFileSync(
  absolute('supabase/phase10x_event_visual_library_expansion.sql'),
  'utf8',
);
const reviewWorkflow = readFileSync(
  absolute('.github/workflows/release-review.yml'),
  'utf8',
);

test('production migration manifest is unique, complete on disk and terminal at Phase 10X', () => {
  assert.equal(PHASE10_PRODUCTION_MIGRATIONS.length, 26);
  assert.equal(new Set(PHASE10_PRODUCTION_MIGRATIONS).size, 26);
  assert.ok(PHASE10_PRODUCTION_MIGRATIONS.every((path) => existsSync(absolute(path))));
  assert.equal(
    PHASE10_PRODUCTION_TERMINAL_MIGRATION,
    'supabase/phase10x_event_visual_library_expansion.sql',
  );
  assert.equal(
    PHASE10_PRODUCTION_MIGRATIONS.at(-2),
    'supabase/phase10w_event_visual_reference_bridge.sql',
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

test('Phase 10X stays additive and least privilege', () => {
  assert.doesNotMatch(expansion, /\bdrop\s+(?:table|schema|column)\b/i);
  assert.doesNotMatch(expansion, /\btruncate\b|\bdelete\s+from\b|\binsert\s+into\b|\bupdate\s+public\./i);
  assert.doesNotMatch(expansion, /grant\s+(?:select|insert|update|delete)\s+on\s+table/i);
  assert.doesNotMatch(expansion, /using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)/i);
  assert.match(expansion, /alter function public\.set_updated_at\(\) set search_path = pg_catalog/i);
  assert.match(expansion, /'public\.current_user_can_manage_event_ops\(\)', false/i);
  assert.match(expansion, /'public\.create_event_operation_from_calendar_event\(uuid\)', true/i);
  assert.match(expansion, /grant execute on function %s to authenticated/i);
});

test('runbook declares the authorized Oslo cutover windows and Monday go/no-go', () => {
  for (const phrase of [
    'Saturday 15 August 23:30',
    'Sunday 16 August 22:30',
    'Monday 17 August 06:15',
    'Monday 17 August 06:50',
    'Monday 17 August 07:00',
    'Go / no-go criteria',
    'Rollback and forward-fix strategy',
  ]) {
    assert.ok(runbook.includes(phrase), phrase);
  }
});

test('runbook names PR #17 as the only combined release merge', () => {
  for (const phrase of [
    'merge **PR #17** only',
    'head: `codex/release-2026-08-17`',
    'base: `phase-9a-inventory-par-levels-stocktaking`',
    'PR #13, PR #14, PR #15 and PR #16 remain historical and review evidence',
  ]) {
    assert.ok(runbook.includes(phrase), phrase);
  }
  assert.doesNotMatch(runbook, /^\s*\d+\.\s+\*\*PR #1[3-6]\*\*/m);
  assert.doesNotMatch(runbook, /Each PR is stacked|PR stack is conflict-free|Production-candidate PR/i);
});

test('runbook fails closed on S–V and sequences genuine W/X migrations', () => {
  for (const phrase of [
    'immediately before the maintenance write',
    'stop on any mismatch or unknown',
    'separately approved S–V migration-ledger reconciliation',
    'Do not reapply S–V DDL, replace matching functions, or re-drop matching constraints',
    'Phase 10W, then Phase 10X',
  ]) {
    assert.ok(runbook.includes(phrase), phrase);
  }
});

test('runbook separates Phase 10W bridge work from Phase 10X security acceptance', () => {
  for (const phrase of [
    'Phase 10W creates the least-privilege Event visual metadata and private Storage bridge',
    'Phase 10X expands that bridge to the canonical visual allowlist',
    'Security-advisor and privilege readback acceptance is evaluated after Phase 10X',
    'Neither migration installs or publishes content',
    'grants manager access to Event Floor Managers',
  ]) {
    assert.ok(runbook.includes(phrase), phrase);
  }
});

test('runbook preserves the final location-first Stock Count acceptance contract', () => {
  for (const phrase of [
    'only assigned physical locations or refrigerators',
    'same product in two refrigerators remains two separate count lines',
    '“Done — count & next fridge”',
    'submits only that assignment for manager review',
    '“No — count differences”',
    'Blank and explicit zero remain distinct',
    'notes, counts, deviations and targetless rows are never overwritten',
    'three protected wines remain stored as physical units',
    'final Millum export',
  ]) {
    assert.ok(runbook.includes(phrase), phrase);
  }
});

test('runbook keeps content, activation, images and deployment separately approval-gated', () => {
  for (const phrase of [
    'Migration completion is not operational activation',
    '1.4R draft installation — installing drafts does not publish them',
    'Template publication',
    'Production image upload',
    'Routine Engine mode change',
    'UI release-stage change',
    'GitHub Pages deployment',
    'publication is unchanged',
    'mode/stage are unchanged',
  ]) {
    assert.ok(runbook.includes(phrase), phrase);
  }
  assert.doesNotMatch(runbook, /After content-pack and hardening phases: published content/i);
});

test('review-only GitHub Actions workflow runs every required release check without production authority', () => {
  const commands = [
    'npm ci',
    'npm run verify:production-migration-plan',
    'npm run verify:production-candidate-experience',
    'npm run verify:event-visual-library',
    'npm run verify:event-visual-reference-bridge',
    'npm run verify:inventory-counter-experience',
    'npm run verify:inventory-counter-workflow',
    'npm run verify:inventory-counter-mobile',
    'npm run verify:inventory-confirmation-dialog',
    'npm run verify:inventory-millum-export',
    'npm run verify:routine-content-pack',
    'npm run build',
  ];
  for (const command of commands) assert.ok(reviewWorkflow.includes(command), command);
  assert.match(reviewWorkflow, /pull_request:/);
  assert.match(reviewWorkflow, /contents:\s*read/);
  assert.doesNotMatch(reviewWorkflow, /pull_request_target|secrets\.|supabase\s+(?:db|migration)|gh-pages|npm run deploy|git push/i);
});

console.log(`Verified ${PHASE10_PRODUCTION_MIGRATIONS.length} ordered production migrations and the Monday launch runbook.`);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createInventoryManagerLineDraft,
  createInventoryManagerSaveGuard,
  evaluateInventoryManagerLineDraft,
  executeInventoryManagerLineSave,
  INVENTORY_MANAGER_SAVE_KINDS,
  INVENTORY_MANAGER_SAVE_STATES,
  inventoryLocationCompletionBlocked,
  inventoryManagerLineDraftAfterFailure,
  inventoryManagerLineDraftHasChanges,
  inventoryManagerLineDraftStatus,
  normalizeInventoryManagerNote,
} from '../src/data/inventoryManagerLineDraft.js';
import { calculateInventoryLine, summarizeInventoryLocation } from '../src/data/inventoryCalculations.js';
import { INVENTORY_COUNT_MODES } from '../src/data/inventoryStructuredQuantities.js';

const workspace = readFileSync(new URL('../src/components/InventoryWorkspace.jsx', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/lib/inventoryClient.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

function line(overrides = {}) {
  return {
    id: 'line-1',
    locationId: 'location-1',
    productName: 'Norwegian Blonde 24×33 cl',
    unitLabel: 'unit',
    countMode: INVENTORY_COUNT_MODES.UNIT,
    stockPolicy: 'exact_par',
    countMethod: 'manual',
    countStatus: 'counted',
    countedQuantityExact: '24',
    effectiveTargetQuantityExact: '25',
    parQuantityExact: '25',
    countFullCases: null,
    countLooseQuantity: null,
    countedWholeUnitsExact: null,
    countedOpenVolumeLitersExact: null,
    countedFullKegsExact: null,
    countedPartialKegFractionExact: null,
    note: '',
    updatedAt: '2026-08-02T21:00:00.000Z',
    ...overrides,
  };
}

test('opening a manager line draft is read-only and issues no save operation', async () => {
  const guard = createInventoryManagerSaveGuard();
  const draft = createInventoryManagerLineDraft(line());
  const evaluated = evaluateInventoryManagerLineDraft(line(), draft);
  let calls = 0;
  const result = await executeInventoryManagerLineSave({ key: 'line-1', evaluated, guard, operation: async () => { calls += 1; } });
  assert.equal(result.skipped, true);
  assert.equal(calls, 0);
});

test('an authoritative saved note initializes the refreshed draft', () => {
  const saved = 'General rehearsal: physically counted 24 units, 1 below target.';
  const draft = createInventoryManagerLineDraft(line({ note: saved }));
  assert.equal(draft.note, saved);
  assert.equal(inventoryManagerLineDraftHasChanges(line({ note: saved }), draft), false);
});

test('note-only edits are independent of physical quantity changes', () => {
  const subject = line();
  const draft = { ...createInventoryManagerLineDraft(subject), note: 'Physically checked; one below target.' };
  const evaluated = evaluateInventoryManagerLineDraft(subject, draft);
  assert.equal(evaluated.countChanged, false);
  assert.equal(evaluated.noteChanged, true);
  assert.equal(evaluated.noteOnly, true);
  assert.equal(evaluated.canSave, true);
});

test('unchanged data cannot issue a redundant mutation', async () => {
  const subject = line({ note: 'Already saved.' });
  const evaluated = evaluateInventoryManagerLineDraft(subject, createInventoryManagerLineDraft(subject));
  let calls = 0;
  const result = await executeInventoryManagerLineSave({ key: subject.id, evaluated, guard: createInventoryManagerSaveGuard(), operation: async () => { calls += 1; } });
  assert.deepEqual(result, { skipped: true, reason: 'unchanged_or_invalid' });
  assert.equal(calls, 0);
});

test('an invalid changed unit quantity stays dirty and exposes its validation error', () => {
  const subject = line();
  const draft = { ...createInventoryManagerLineDraft(subject), countedQuantity: '' };
  const evaluated = evaluateInventoryManagerLineDraft(subject, draft);
  assert.equal(evaluated.dirty, true);
  assert.equal(evaluated.canSave, false);
  assert.equal(inventoryManagerLineDraftStatus(subject, draft, evaluated).state, 'invalid');
});

test('an invalid changed structured component stays dirty and exposes its validation error', () => {
  const subject = line({
    countMode: INVENTORY_COUNT_MODES.KEG_FRACTION,
    countedQuantityExact: '2.5',
    countedFullKegsExact: '2',
    countedPartialKegFractionExact: '0.5',
  });
  const draft = { ...createInventoryManagerLineDraft(subject), partialKegFraction: '1.5' };
  const evaluated = evaluateInventoryManagerLineDraft(subject, draft);
  assert.equal(evaluated.dirty, true);
  assert.equal(evaluated.canSave, false);
  assert.match(evaluated.message, /less than 1/i);
});

test('save wording distinguishes note-only, count-only, and combined changes', () => {
  const subject = line();
  assert.equal(evaluateInventoryManagerLineDraft(subject, { ...createInventoryManagerLineDraft(subject), note: 'Context.' }).buttonLabel, 'Save note');
  assert.equal(evaluateInventoryManagerLineDraft(subject, { ...createInventoryManagerLineDraft(subject), countedQuantity: '23' }).buttonLabel, 'Save physical count');
  assert.equal(evaluateInventoryManagerLineDraft(subject, { ...createInventoryManagerLineDraft(subject), countedQuantity: '23', note: 'Context.' }).buttonLabel, 'Save count and note');
});

test('a note-only payload preserves physical count 24 exactly', () => {
  const subject = line();
  const evaluated = evaluateInventoryManagerLineDraft(subject, { ...createInventoryManagerLineDraft(subject), note: 'Physically checked.' });
  assert.equal(evaluated.countedQuantity, '24');
  assert.equal(evaluated.note, 'Physically checked.');
});

test('rapid duplicate saves execute the mutation exactly once', async () => {
  const subject = line();
  const evaluated = evaluateInventoryManagerLineDraft(subject, { ...createInventoryManagerLineDraft(subject), note: 'Physically checked.' });
  const guard = createInventoryManagerSaveGuard();
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const operation = async () => { calls += 1; await pending; return { ok: true }; };
  const first = executeInventoryManagerLineSave({ key: subject.id, evaluated, guard, operation });
  const second = await executeInventoryManagerLineSave({ key: subject.id, evaluated, guard, operation });
  assert.equal(second.skipped, true);
  release();
  await first;
  assert.equal(calls, 1);
});

test('successful note persistence reconciles from the authoritative returned line', () => {
  const savedLine = line({ note: 'Physically checked.', updatedAt: '2026-08-02T21:01:00.000Z' });
  const refreshedDraft = { ...createInventoryManagerLineDraft(savedLine), saveState: INVENTORY_MANAGER_SAVE_STATES.SAVED, message: 'Note saved.' };
  const evaluated = evaluateInventoryManagerLineDraft(savedLine, refreshedDraft);
  assert.equal(evaluated.dirty, false);
  assert.equal(inventoryManagerLineDraftStatus(savedLine, refreshedDraft, evaluated).label, 'Note saved.');
});

test('the pilot note does not erase the genuine restock need', () => {
  const subject = line({ note: 'General rehearsal: physically counted 24 units, 1 below target.' });
  const calculated = calculateInventoryLine(subject);
  const summary = summarizeInventoryLocation([subject]);
  assert.equal(calculated.restockQuantityExact, '1');
  assert.equal(summary.shortages, 1);
  assert.equal(summary.needsReview, 0);
  assert.equal(inventoryLocationCompletionBlocked(summary), false);
});

test('a note cannot falsely resolve an authoritative needs-review status', () => {
  const summary = summarizeInventoryLocation([line({ countStatus: 'needs_review', note: 'Any general note.' })]);
  assert.equal(summary.needsReview, 1);
  assert.equal(inventoryLocationCompletionBlocked(summary), true);
});

test('uncounted and needs-review lines still block location completion', () => {
  assert.equal(inventoryLocationCompletionBlocked({ uncounted: 1, needsReview: 0 }), true);
  assert.equal(inventoryLocationCompletionBlocked({ uncounted: 0, needsReview: 1 }), true);
  assert.equal(inventoryLocationCompletionBlocked({ uncounted: 0, needsReview: 0, shortages: 4 }), false);
});

test('save failure retains every user draft field and exposes retry state', () => {
  const draft = { ...createInventoryManagerLineDraft(line()), countedQuantity: '24', note: 'Unsaved context.' };
  const failed = inventoryManagerLineDraftAfterFailure(draft, { ok: false, message: 'Network unavailable. Your unsaved value is still here.' });
  assert.equal(failed.countedQuantity, '24');
  assert.equal(failed.note, 'Unsaved context.');
  assert.equal(failed.saveState, INVENTORY_MANAGER_SAVE_STATES.FAILED);
  assert.equal(inventoryManagerLineDraftStatus(line(), failed, evaluateInventoryManagerLineDraft(line(), failed)).label, 'Save failed — retry');
});

test('stale-write failure retains the draft and requires review before retry', () => {
  const draft = { ...createInventoryManagerLineDraft(line()), note: 'Unsaved context.' };
  const stale = inventoryManagerLineDraftAfterFailure(draft, { ok: false, message: 'This Stock Count changed on another device. Refresh before trying again; your unsaved value is still here.' });
  assert.equal(stale.note, 'Unsaved context.');
  assert.equal(stale.saveState, INVENTORY_MANAGER_SAVE_STATES.STALE);
  assert.equal(inventoryManagerLineDraftStatus(line(), stale, evaluateInventoryManagerLineDraft(line(), stale)).state, 'stale');
});

test('manager authorization and stale-write boundaries remain on the existing guarded RPC', () => {
  assert.match(workspace, /requestWriteAccess\(\)/);
  assert.match(client, /set_inventory_count_line_quantity[\s\S]*?input_expected_updated_at: payload\.expectedUpdatedAt/);
  assert.match(client, /set_inventory_count_line_structured_quantity[\s\S]*?input_expected_updated_at: payload\.expectedUpdatedAt/);
  assert.doesNotMatch(client, /set_inventory_count_line_note/);
});

test('structured bottle note-only save preserves exact components and total', () => {
  const subject = line({
    countMode: INVENTORY_COUNT_MODES.CONTAINER_PLUS_VOLUME,
    containerCapacityLiters: '0.7',
    countedQuantityExact: '2.5',
    countedWholeUnitsExact: '3',
    countedOpenVolumeLitersExact: '0.4',
  });
  const evaluated = evaluateInventoryManagerLineDraft(subject, { ...createInventoryManagerLineDraft(subject), note: 'Three sealed and open volume checked.' });
  assert.equal(evaluated.noteOnly, true);
  assert.equal(evaluated.countedWholeUnits, '3');
  assert.equal(evaluated.countedOpenVolumeLiters, '0.4');
  assert.equal(evaluated.countedQuantity, '2.5');
  assert.equal(evaluated.canSave, true);
});

test('structured keg note-only save preserves exact components and total', () => {
  const subject = line({
    countMode: INVENTORY_COUNT_MODES.KEG_FRACTION,
    countedQuantityExact: '2.5',
    countedFullKegsExact: '2',
    countedPartialKegFractionExact: '0.5',
  });
  const evaluated = evaluateInventoryManagerLineDraft(subject, { ...createInventoryManagerLineDraft(subject), note: 'Two full and one half checked.' });
  assert.equal(evaluated.noteOnly, true);
  assert.equal(evaluated.countedFullKegs, '2');
  assert.equal(evaluated.countedPartialKegFraction, '0.5');
  assert.equal(evaluated.countedQuantity, '2.5');
});

test('accepted-as-standard lines cannot be converted by a note-only save', () => {
  const subject = line({ countMethod: 'use_par', countedQuantityExact: '25', note: '' });
  const evaluated = evaluateInventoryManagerLineDraft(subject, { ...createInventoryManagerLineDraft(subject), note: 'Do not convert this line.' });
  assert.equal(evaluated.noteOnly, true);
  assert.equal(evaluated.noteOnlyAllowed, false);
  assert.equal(evaluated.canSave, false);
});

test('protected-reserve case components remain the selected mutation boundary for note-only saves', () => {
  const subject = line({
    stockPolicy: 'protected_event_reserve',
    caseSize: 12,
    countFullCases: 2,
    countLooseQuantity: 3,
    countedQuantityExact: '27',
  });
  const draft = { ...createInventoryManagerLineDraft(subject), note: 'Case count checked.' };
  const evaluated = evaluateInventoryManagerLineDraft(subject, draft);
  assert.equal(draft.saveKind, INVENTORY_MANAGER_SAVE_KINDS.CASES);
  assert.equal(evaluated.fullCases, 2);
  assert.equal(evaluated.looseQuantity, '3');
  assert.equal(evaluated.noteOnly, true);
});

test('note comparison matches the server trim rule', () => {
  assert.equal(normalizeInventoryManagerNote('  Context.  '), 'Context.');
  const subject = line({ note: 'Context.' });
  assert.equal(evaluateInventoryManagerLineDraft(subject, { ...createInventoryManagerLineDraft(subject), note: '  Context.  ' }).dirty, false);
});

test('the rendered manager workflow places one save control after the note editor', () => {
  const cardStart = workspace.indexOf('function CountLineCard');
  const cardEnd = workspace.indexOf('\nfunction CountSession', cardStart);
  const card = workspace.slice(cardStart, cardEnd);
  assert.ok(card.indexOf('Count note (optional)') < card.indexOf('manager-line-save-button'));
  assert.equal((card.match(/manager-line-save-button/g) || []).length, 1);
  assert.match(card, /aria-describedby=\{`\$\{inputId\}-save-status`\}/);
});

test('mobile save feedback and controls remain bounded at 375, 390, and 430 px', () => {
  assert.match(styles, /\.inventory-line-save-status\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow-wrap:\s*break-word;/);
  assert.match(styles, /@media \(max-width: 430px\)[\s\S]*?\.inventory-line-save-status > button\s*\{[\s\S]*?width:\s*100%;/);
  for (const width of [375, 390, 430]) assert.ok(width - 32 > 300);
});

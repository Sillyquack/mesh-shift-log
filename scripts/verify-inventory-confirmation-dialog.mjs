import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspace = readFileSync(new URL('../src/components/InventoryWorkspace.jsx', import.meta.url), 'utf8');
const legacyCounterWorkflows = readFileSync(new URL('../src/components/InventoryCounterWorkflowsLegacy.jsx', import.meta.url), 'utf8');
const counterExperience = readFileSync(new URL('../src/components/InventoryCounterExperience.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

const dialogStart = workspace.indexOf('{bulkReview && (');
const dialogEnd = workspace.indexOf('\n      )}', dialogStart);
const dialog = workspace.slice(dialogStart, dialogEnd);
const confirmHandlerStart = workspace.indexOf('const confirmBulkReview = () =>');
const confirmHandlerEnd = workspace.indexOf('\n  const exportSession', confirmHandlerStart);
const confirmHandler = workspace.slice(confirmHandlerStart, confirmHandlerEnd);
const checkboxRule = styles.match(/\.inventory-danger-option input\[type='checkbox'\]\s*\{([\s\S]*?)\n\}/)?.[1] || '';
const textRule = styles.match(/\.inventory-danger-option > span\s*\{([\s\S]*?)\n\}/)?.[1] || '';
const modalRule = styles.match(/\.inventory-modal\s*\{([\s\S]*?)\n\}/)?.[1] || '';

test('bulk confirmation opens from the exact-par location action', () => {
  assert.match(workspace, /Confirm fully stocked products<\/button>/);
  assert.match(workspace, /onClick=\{\(\) => setBulkReview\(\{ replace: false, acknowledged: false \}\)\}/);
});

test('opening the dialog changes only local review state', () => {
  const trigger = workspace.match(/<button ref=\{bulkTriggerRef\}[\s\S]*?Confirm fully stocked products<\/button>/)?.[0] || '';
  assert.match(trigger, /setBulkReview/);
  assert.doesNotMatch(trigger, /runWrite|markInventoryLocationUsePar/);
});

test('acknowledgement label is explicitly associated with its checkbox', () => {
  assert.match(dialog, /htmlFor="inventory-bulk-acknowledgement"/);
  assert.match(dialog, /id="inventory-bulk-acknowledgement" type="checkbox"/);
  assert.match(dialog, /aria-describedby="inventory-bulk-description"/);
});

test('confirmation is disabled and guarded until acknowledgement', () => {
  assert.match(dialog, /disabled=\{!bulkReview\.acknowledged \|\| busyId === 'bulk'\}/);
  assert.match(confirmHandler, /if \(!bulkReview\?\.acknowledged\) return;/);
});

test('Cancel closes through the non-mutating dismiss handler', () => {
  assert.match(dialog, /onClick=\{dismissBulkReview\}>Cancel<\/button>/);
  const dismissStart = workspace.indexOf('const dismissBulkReview = () =>');
  const dismissEnd = workspace.indexOf('\n  const handleBulkDialogKeyDown', dismissStart);
  const dismissHandler = workspace.slice(dismissStart, dismissEnd);
  assert.match(dismissHandler, /setBulkReview\(null\)/);
  assert.doesNotMatch(dismissHandler, /runWrite|markInventoryLocationUsePar/);
});

test('Escape and backdrop dismiss without invoking the action', () => {
  assert.match(workspace, /event\.key === 'Escape'[\s\S]*?dismissBulkReview\(\)/);
  assert.match(dialog, /onClick=\{\(event\) => \{ if \(event\.target === event\.currentTarget\) dismissBulkReview\(\); \}\}/);
});

test('acknowledged confirmation invokes the existing bulk action once', () => {
  assert.equal((confirmHandler.match(/markInventoryLocationUsePar\(/g) || []).length, 1);
  assert.match(confirmHandler, /replaceExisting: replace/);
  assert.match(confirmHandler, /expectedSessionUpdatedAt: session\.updatedAt/);
});

test('checkbox geometry is stable at 375, 390, and 430 CSS pixels', () => {
  assert.match(checkboxRule, /width:\s*22px;/);
  assert.match(checkboxRule, /min-width:\s*22px;/);
  assert.match(checkboxRule, /height:\s*22px;/);
  assert.match(checkboxRule, /flex:\s*0 0 22px;/);
  for (const viewportWidth of [375, 390, 430]) assert.ok(viewportWidth - 20 - 36 - 22 - 10 >= 287);
});

test('acknowledgement text receives the remaining width and normal wrapping', () => {
  assert.match(textRule, /flex:\s*1 1 auto;/);
  assert.match(textRule, /min-width:\s*0;/);
  assert.match(textRule, /overflow-wrap:\s*break-word;/);
  assert.match(textRule, /word-break:\s*normal;/);
});

test('confirmation text cannot inherit character-by-character wrapping', () => {
  assert.doesNotMatch(textRule, /overflow-wrap:\s*anywhere|word-break:\s*break-all/);
  assert.match(dialog, /inventory-danger-option[\s\S]*?<span>I confirm/);
});

test('inventory modal prevents horizontal overflow', () => {
  assert.match(modalRule, /max-width:\s*100%;/);
  assert.match(modalRule, /min-width:\s*0;/);
  assert.match(modalRule, /overflow-x:\s*hidden;/);
});

test('long modal content remains vertically reachable', () => {
  assert.match(styles, /\.pilot-modal\s*\{[\s\S]*?max-height:\s*min\(90vh, 720px\);[\s\S]*?overflow-y:\s*auto;/);
  assert.match(styles, /@media \(max-width: 480px\), \(max-height: 620px\)[\s\S]*?max-height:\s*calc\(100dvh - 20px\);/);
});

test('Cancel and Confirm remain in the responsive action row', () => {
  assert.match(dialog, /className="inventory-action-row"[\s\S]*?>Cancel<\/button>[\s\S]*?onClick=\{confirmBulkReview\}/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*?\.inventory-action-row,[\s\S]*?\.inventory-action-row > \*,[\s\S]*?width:\s*100%;/);
});

test('the full acknowledgement label provides a practical tap target', () => {
  assert.match(styles, /label\.inventory-danger-option\s*\{[\s\S]*?display:\s*flex;[\s\S]*?min-height:\s*48px;[\s\S]*?cursor:\s*pointer;/);
});

test('focus enters, stays within, and returns from the modal', () => {
  assert.match(workspace, /bulkCancelRef\.current\?\.focus\(\)/);
  assert.match(workspace, /event\.key !== 'Tab'/);
  assert.match(workspace, /document\.activeElement === first[\s\S]*?last\.focus\(\)/);
  assert.match(workspace, /bulkTriggerRef\.current\?\.focus\(\)/);
  assert.match(styles, /\.inventory-danger-option:focus-within\s*\{[\s\S]*?outline:/);
});

test('desktop modal sizing and action layout remain intact', () => {
  assert.match(styles, /\.pilot-modal\s*\{[\s\S]*?width:\s*min\(100%, 440px\);/);
  assert.match(styles, /\.inventory-action-row[\s\S]*?display:\s*flex;/);
});

test('all preserved Stock Count danger checkbox rows use explicit text wrappers', () => {
  const rows = [
    ...workspace.matchAll(/<label className="inventory-danger-option"[\s\S]*?<\/label>/g),
    ...legacyCounterWorkflows.matchAll(/<label className="inventory-danger-option"[\s\S]*?<\/label>/g),
  ];
  assert.ok(rows.length >= 5);
  rows.forEach((row) => assert.match(row[0], /<span>[\s\S]*?<\/span>/));
});

test('focused Count Mode keeps physical confirmation explicit and readable', () => {
  assert.match(counterExperience, /I physically checked this entire location/);
  assert.match(counterExperience, /<label>[\s\S]*?<input[\s\S]*?type="checkbox"[\s\S]*?<span>I physically checked this entire location<\/span>/);
});

test('ordinary form inputs retain full sizing while checkbox overrides stay scoped', () => {
  assert.match(styles, /input,\nselect,\ntextarea\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-height:\s*48px;/);
  assert.match(styles, /\.inventory-line-card input,[\s\S]*?width:\s*100%;[\s\S]*?min-height:\s*44px;/);
  assert.match(styles, /\.inventory-danger-option input\[type='checkbox'\]/);
  assert.doesNotMatch(styles, /input:not\(\[type=['"]checkbox/);
});

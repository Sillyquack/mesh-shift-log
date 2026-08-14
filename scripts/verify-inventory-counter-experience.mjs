import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [router, legacy, experience, styles, designSystem, workspace] = await Promise.all([
  readFile(new URL('../src/components/InventoryCounterWorkflows.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/InventoryCounterWorkflowsLegacy.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/InventoryCounterExperience.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/InventoryCounterExperience.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/design-system/MeshExperienceSystem.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/InventoryWorkspace.jsx', import.meta.url), 'utf8'),
]);

assert.match(router, /InventoryCounterExperience/);
assert.match(router, /export \{ CounterAssignmentManager \} from '\.\/InventoryCounterWorkflowsLegacy\.jsx'/);
assert.match(router, /export function CounterInventoryWorkspace/);
assert.match(workspace, /if \(isInventoryCounter\(props\.user\)\)[\s\S]*?<CounterInventoryWorkspace/);
assert.match(legacy, /export function CounterInventoryWorkspace/);
assert.match(legacy, /export function CounterAssignmentManager/);

for (const label of [
  'COUNT MODE',
  'One location at a time.',
  'Count',
  'Progress',
  'Review',
  'Current product',
  'Save & next product',
  'Show how this location should look',
  'Ready to send.',
  'Send location to Bobby',
  'Submitting sends only this location.',
]) {
  assert.ok(experience.includes(label), `Count Mode missing label: ${label}`);
}

for (const capability of [
  'loadInventoryCounterWorkspace',
  'setInventoryCounterLineQuantity',
  'setInventoryCounterLineStructuredQuantity',
  'applyInventoryCounterRefrigeratorDefault',
  'submitInventoryCountAssignment',
  'reconcileCounterDrafts',
  'findAdjacentIncompleteLineId',
  'counterAssignmentIsEditable',
]) {
  assert.ok(experience.includes(capability), `Count Mode missing protected capability: ${capability}`);
}

// A Stock Count line is meaningful only inside its physical assignment/location.
// The same product in two fridges must remain two separate lines and two separate saves.
for (const scopedContract of [
  /const assignment = assignments\.find\(\(item\) => item\.id === selectedId\) \|\| assignments\[0\] \|\| null/,
  /summarizeCounterAssignment\(assignment, drafts\)/,
  /const requestedLine = assignment\?\.lines\.find\(\(line\) => line\.id === activeLineId\) \|\| null/,
  /findAdjacentIncompleteLineId\(assignment\?\.lines \|\| \[\], currentLineId, direction\)/,
  /assignmentId: assignment\.id/,
  /submitInventoryCountAssignment\(\{[\s\S]*?assignmentId: assignment\.id/,
  /<strong>\{assignment\.location\.name\}<\/strong>/,
  /<h1>\{assignment\.location\.name\}<\/h1>/,
]) {
  assert.match(experience, scopedContract, `Count Mode lost a location-scoping contract: ${scopedContract}`);
}
assert.doesNotMatch(
  experience,
  /findAdjacentIncompleteLineId\(assignments\.flatMap/,
  'Product navigation must never cross from one location/fridge assignment into another.',
);
assert.doesNotMatch(
  experience,
  /submitInventoryCountAssignment\(\{[\s\S]*?(?:sessionId|productId):/,
  'Counter submission must remain assignment/location scoped, not global product or whole-session scoped.',
);


// The original Stock Count product promise: saved standards make a matching fridge a one-tap count.
assert.match(experience, /function StandardMatchPanel/);
assert.match(experience, /Done — \$\{locationKind\} matches standard/);
assert.match(experience, /No — count differences/);
assert.match(experience, /By tapping Done, you confirm that you physically checked this entire \{locationKind\}/);
assert.match(experience, /one tap counts this \{locationKind\} and opens Review/);
assert.match(experience, /message: `\$\{assignment\.location\.name\} matches its saved standard and is counted\.`/);
assert.match(experience, /setView\('review'\)/);
assert.match(experience, /Your next location is ready/);
assert.match(experience, /setView\('home'\)/);
assert.doesNotMatch(experience, /<ExactStandardPanel/);
assert.doesNotMatch(experience, /I physically checked this entire location/);
assert.doesNotMatch(experience, /Apply exact targets to eligible products/);
assert.doesNotMatch(experience, /type="checkbox"[\s\S]*?saved standard/);
assert.match(styles, /One-tap saved-standard decision/);
assert.match(styles, /counter-experience-standard-actions/);

assert.match(experience, /const operationRef = useRef\(''\)/);
assert.match(experience, /if \(operationRef\.current\)/);
assert.match(experience, /const savingRef = useRef\(false\)/);
assert.match(experience, /beforeunload/);
assert.match(experience, /window\.confirm\('Unsaved or failed Stock Count values/);
assert.match(experience, /physicalConfirmation: true/);
assert.match(experience, /expectedAssignmentRevision/);
assert.match(experience, /expectedLineUpdatedAt/);
assert.match(experience, /summary\.incomplete\.length[\s\S]*summary\.unsafeDrafts\.length[\s\S]*summary\.invalidDrafts\.length/);
assert.match(experience, /Your entry is still here/);
assert.match(experience, /Refresh safely — keep local drafts/);
assert.match(experience, /LocationReferenceViewer/);
assert.match(experience, /inputMode="decimal"/);
assert.match(experience, /inputMode="numeric"/);
assert.match(experience, /aria-live="polite"/);
assert.match(experience, /role="progressbar"/);
assert.match(experience, /autoComplete="off"/);
assert.doesNotMatch(experience, /\b(?:alarm|safe|salto)\s*(?:pin|code)\b/i);
assert.doesNotMatch(experience, /[æøå]/i);

for (const noisyLabel of [
  'Supabase',
  'database',
  'backend',
  'realtime',
  'RPC',
  'Millum export',
  'manager configuration',
]) {
  assert.ok(!experience.includes(noisyLabel), `Frontline Count Mode exposes implementation noise: ${noisyLabel}`);
}

assert.match(styles, /\.counter-experience/);
assert.match(styles, /\.counter-experience-nav/);
assert.match(styles, /position: fixed/);
assert.match(styles, /env\(safe-area-inset-bottom\)/);
assert.match(styles, /min-height: var\(--mesh-touch-target\)/);
assert.match(styles, /@media \(max-width: 760px\)/);
assert.match(styles, /@media \(max-width: 430px\)/);
assert.match(styles, /prefers-reduced-motion/);
assert.match(styles, /overflow-x: clip/);
assert.match(designSystem, /--mesh-gold/);
assert.match(designSystem, /\.mesh-progress-ring/);
assert.match(designSystem, /\.mesh-bottom-nav/);

console.log('Verified location-scoped, saved-standard-first Count Mode and preserved inventory integrity controls.');

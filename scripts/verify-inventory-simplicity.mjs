import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspace = readFileSync(new URL('../src/components/InventoryWorkspace.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('the normal manager path has only Home, Count, and Tools', () => {
  const nav = workspace.match(/<nav className="inventory-main-tabs"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.match(nav, />Home<\/button>/);
  assert.match(nav, />Count<\/button>/);
  assert.match(nav, />Tools<\/button>/);
  assert.doesNotMatch(nav, />Assignments<\/button>|>Restock<\/button>|>History<\/button>|>Manage<\/button>/);
});

test('secondary manager capabilities remain available from one tools screen', () => {
  for (const title of ['Counters', 'Restock', 'History', 'Setup']) assert.match(workspace, new RegExp(`'${title}'`));
  assert.match(workspace, /Open only when you need them/);
  assert.match(workspace, /Back to tools/);
});

test('new counts default to the monthly complete-location workflow', () => {
  assert.match(workspace, /title: `Monthly stock count - \$\{osloDate\(\)\}`/);
  assert.match(workspace, /countType: 'monthly'/);
  assert.match(workspace, /Start monthly stock count/);
  assert.match(workspace, /Start with \$\{selection\.locationCount\} locations/);
  assert.match(workspace, /<summary>Advanced options<\/summary>/);
});

test('the active count presents one four-step operational path', () => {
  for (const label of ['Count locations', 'Review', 'Approve', 'Millum PDF']) assert.match(workspace, new RegExp(`'${label}'`));
  assert.match(workspace, /Stock Count step \$\{workflowStep\} of 4/);
  assert.match(workspace, /Send for manager approval/);
  assert.match(workspace, /Approve and continue to Millum/);
  assert.match(workspace, /Review and download Millum PDF/);
});

test('finishing a location advances to the next incomplete location only after success', () => {
  const handler = workspace.match(/const completeCurrentLocation = async \(\) => \{[\s\S]*?\n  \};/)?.[0] || '';
  assert.match(handler, /locationIds\.find\(\(id\) => id !== locationId && !completionMap\[id\]\)/);
  assert.match(handler, /await runWrite/);
  assert.match(handler, /result\?\.ok && nextLocationId/);
  assert.match(workspace, /onClick=\{completeCurrentLocation\}>\{completionMap\[locationId\] \? 'Location complete' : 'Finish location and continue'\}/);
});

test('the guided path remains usable on narrow mobile screens', () => {
  assert.match(styles, /\.inventory-workflow-steps\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*?\.inventory-workflow-steps\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,/);
  assert.match(styles, /\.inventory-next-action,[\s\S]*?\.inventory-tool-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr;/);
});

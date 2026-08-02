import assert from 'node:assert/strict';
import {
  ensureInventoryIdempotencyKey,
  inventoryIdempotencyKeyAfterAttempt,
  inventorySessionExceptionSummary,
  inventorySessionKindLabel,
  inventorySessionLockLabel,
  isInventorySessionActive,
  isInventorySessionEditable,
  isInventorySessionFinal,
} from '../src/data/inventorySessionLifecycle.js';

let passes = 0;
function test(name, assertion) {
  assertion();
  passes += 1;
  console.log(`PASS LIFECYCLE-${passes}: ${name}`);
}

test('draft, in-progress, and completed sessions consume the organization active slot', () => {
  assert.deepEqual(['draft', 'in_progress', 'completed'].map(isInventorySessionActive), [true, true, true]);
  assert.equal(isInventorySessionActive('approved'), false);
  assert.equal(isInventorySessionActive('cancelled'), false);
});
test('only open sessions are editable', () => {
  assert.equal(isInventorySessionEditable('draft'), true);
  assert.equal(isInventorySessionEditable('in_progress'), true);
  assert.equal(isInventorySessionEditable('completed'), false);
  assert.equal(isInventorySessionEditable('approved'), false);
});
test('approved and cancelled sessions are final', () => {
  assert.equal(isInventorySessionFinal('approved'), true);
  assert.equal(isInventorySessionFinal('cancelled'), true);
  assert.equal(isInventorySessionFinal('completed'), false);
});
test('locked lifecycle states have explicit operator labels', () => {
  assert.match(inventorySessionLockLabel('completed'), /awaiting manager approval/i);
  assert.match(inventorySessionLockLabel('approved'), /permanently locked/i);
  assert.equal(inventorySessionLockLabel('in_progress'), '');
});
test('correction sessions are labeled independently from standard counts', () => {
  assert.equal(inventorySessionKindLabel({ sessionKind: 'correction' }), 'Correction count');
  assert.equal(inventorySessionKindLabel({ sessionKind: 'standard' }), 'Stock count');
});
test('structured exception summaries do not infer exceptions from review notes', () => {
  assert.deepEqual(inventorySessionExceptionSummary({ completionNote: 'Reviewed by manager.' }), {
    hasExceptions: false,
    reason: '',
    counts: { skipped: 0, uncounted: 0, needsReview: 0, incompleteLocations: 0 },
    total: 0,
    locationIds: [],
  });
});
test('structured exception summaries retain explicit reason, counts, and locations', () => {
  const summary = inventorySessionExceptionSummary({
    finalizedWithExceptions: true,
    exceptionReason: 'Freezer inaccessible.',
    exceptionSkippedCount: 2,
    exceptionUncountedCount: 1,
    exceptionNeedsReviewCount: 3,
    exceptionIncompleteLocationCount: 1,
    exceptionLocationIds: ['location-a'],
  });
  assert.equal(summary.total, 7);
  assert.equal(summary.reason, 'Freezer inaccessible.');
  assert.deepEqual(summary.locationIds, ['location-a']);
});
test('creation retries retain one idempotency key', () => {
  let generated = 0;
  const createKey = () => `key-${++generated}`;
  const first = ensureInventoryIdempotencyKey('', createKey);
  const retry = inventoryIdempotencyKeyAfterAttempt(first, false, createKey);
  assert.equal(first, 'key-1');
  assert.equal(retry, first);
  assert.equal(generated, 1);
});
test('a successful creation rotates the idempotency key for the next session', () => {
  let generated = 1;
  const next = inventoryIdempotencyKeyAfterAttempt('key-1', true, () => `key-${++generated}`);
  assert.equal(next, 'key-2');
});

console.log(`Inventory session lifecycle assertions: ${passes}/${passes} passed.`);

export const INVENTORY_ACTIVE_SESSION_STATUSES = Object.freeze(['draft', 'in_progress', 'completed']);
export const INVENTORY_EDITABLE_SESSION_STATUSES = Object.freeze(['draft', 'in_progress']);
export const INVENTORY_FINAL_SESSION_STATUSES = Object.freeze(['approved', 'cancelled']);

export function isInventorySessionActive(status) {
  return INVENTORY_ACTIVE_SESSION_STATUSES.includes(status);
}

export function isInventorySessionEditable(status) {
  return INVENTORY_EDITABLE_SESSION_STATUSES.includes(status);
}

export function isInventorySessionFinal(status) {
  return INVENTORY_FINAL_SESSION_STATUSES.includes(status);
}

export function inventorySessionLockLabel(status) {
  if (status === 'completed') return 'Completed — awaiting manager approval';
  if (status === 'approved') return 'Approved — permanently locked';
  if (status === 'cancelled') return 'Cancelled — locked';
  return '';
}

export function inventorySessionKindLabel(session) {
  return session?.sessionKind === 'correction' ? 'Correction count' : 'Stock count';
}

export function inventorySessionExceptionSummary(session) {
  const counts = {
    skipped: Number(session?.exceptionSkippedCount || 0),
    uncounted: Number(session?.exceptionUncountedCount || 0),
    needsReview: Number(session?.exceptionNeedsReviewCount || 0),
    incompleteLocations: Number(session?.exceptionIncompleteLocationCount || 0),
  };
  return {
    hasExceptions: session?.finalizedWithExceptions === true,
    reason: session?.exceptionReason || '',
    counts,
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    locationIds: Array.isArray(session?.exceptionLocationIds) ? session.exceptionLocationIds : [],
  };
}

function browserUuid() {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure UUID generation is unavailable.');
  return globalThis.crypto.randomUUID();
}

export function ensureInventoryIdempotencyKey(currentKey, createKey = browserUuid) {
  return currentKey || createKey();
}

export function inventoryIdempotencyKeyAfterAttempt(currentKey, succeeded, createKey = browserUuid) {
  return succeeded ? createKey() : ensureInventoryIdempotencyKey(currentKey, createKey);
}

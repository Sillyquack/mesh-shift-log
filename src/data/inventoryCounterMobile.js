import {
  calculateStructuredInventoryQuantity,
  compareInventoryDecimals,
  inventoryDecimalDraftState,
  INVENTORY_COUNT_MODES,
  normalizeInventoryDecimal,
} from './inventoryStructuredQuantities.js';

export const COUNTER_DRAFT_STATES = Object.freeze({
  IDLE: 'idle',
  UNSAVED: 'unsaved',
  SAVING: 'saving',
  SAVED: 'saved',
  FAILED: 'failed',
  STALE: 'stale',
});

export function counterAssignmentIsEditable(state) {
  return state === 'assigned' || state === 'returned';
}

export function createCounterLineDraft(line) {
  return {
    countedQuantity: line.countedQuantityExact ?? '',
    wholeUnits: line.countedWholeUnitsExact ?? '',
    openVolumeLiters: line.countedOpenVolumeLitersExact ?? '',
    fullKegs: line.countedFullKegsExact ?? '',
    partialKegFraction: line.countedPartialKegFractionExact ?? '',
    note: line.note || '',
    baseUpdatedAt: line.updatedAt || '',
    saveState: line.countStatus === 'counted' ? COUNTER_DRAFT_STATES.SAVED : COUNTER_DRAFT_STATES.IDLE,
    error: '',
  };
}

function comparableDecimal(value) {
  if (value === null || value === undefined || value === '') return '';
  try {
    return normalizeInventoryDecimal(value, { maxScale: 6, allowNegative: false });
  } catch {
    return String(value);
  }
}

export function counterLineDraftHasChanges(line, draft) {
  if (!draft) return false;
  if ((draft.note || '') !== (line.note || '')) return true;
  if (line.countMode === INVENTORY_COUNT_MODES.CONTAINER_PLUS_VOLUME) {
    return comparableDecimal(draft.wholeUnits) !== comparableDecimal(line.countedWholeUnitsExact)
      || comparableDecimal(draft.openVolumeLiters) !== comparableDecimal(line.countedOpenVolumeLitersExact);
  }
  if (line.countMode === INVENTORY_COUNT_MODES.KEG_FRACTION) {
    return comparableDecimal(draft.fullKegs) !== comparableDecimal(line.countedFullKegsExact)
      || comparableDecimal(draft.partialKegFraction) !== comparableDecimal(line.countedPartialKegFractionExact);
  }
  return comparableDecimal(draft.countedQuantity) !== comparableDecimal(line.countedQuantityExact);
}

export function evaluateCounterLineDraft(line, draft) {
  if (line.countMode === INVENTORY_COUNT_MODES.UNIT) {
    const state = inventoryDecimalDraftState(draft.countedQuantity, { maxScale: 6, allowNegative: false });
    if (!(state.complete && state.valid)) {
      return { ok: false, message: state.message || 'Enter an actual quantity. Empty is not zero.' };
    }
    return {
      ok: true,
      countedQuantity: normalizeInventoryDecimal(draft.countedQuantity, { maxScale: 6, allowNegative: false }),
      note: draft.note || '',
    };
  }
  try {
    if (line.countMode === INVENTORY_COUNT_MODES.CONTAINER_PLUS_VOLUME) {
      return {
        ok: true,
        ...calculateStructuredInventoryQuantity({
          countMode: line.countMode,
          wholeCount: draft.wholeUnits,
          openVolumeLiters: draft.openVolumeLiters,
          containerCapacityLiters: line.containerCapacityLiters,
        }),
        note: draft.note || '',
      };
    }
    if (line.countMode === INVENTORY_COUNT_MODES.KEG_FRACTION) {
      return {
        ok: true,
        ...calculateStructuredInventoryQuantity({
          countMode: line.countMode,
          fullKegs: draft.fullKegs,
          partialKegFraction: draft.partialKegFraction,
        }),
        note: draft.note || '',
      };
    }
  } catch (error) {
    return { ok: false, message: error.message };
  }
  return { ok: false, message: 'This count mode is not supported.' };
}

export function counterLineDraftQuantity(line, draft) {
  const evaluated = evaluateCounterLineDraft(line, draft);
  return evaluated.ok ? evaluated.countedQuantity : null;
}

export function counterLineIsDeviation(line, draft = null) {
  if (line.standardQuantityExact === null) return false;
  const actual = draft ? counterLineDraftQuantity(line, draft) : line.countedQuantityExact;
  if (actual === null || actual === undefined || actual === '') return false;
  return compareInventoryDecimals(actual, line.standardQuantityExact) !== 0;
}

export function findAdjacentIncompleteLineId(lines, currentLineId = '', direction = 1) {
  if (!lines.length) return '';
  if (!currentLineId) {
    const incomplete = lines.filter((line) => line.countStatus !== 'counted');
    return (direction < 0 ? incomplete.at(-1) : incomplete[0])?.id || '';
  }
  const currentIndex = Math.max(0, lines.findIndex((line) => line.id === currentLineId));
  for (let offset = 1; offset <= lines.length; offset += 1) {
    const index = (currentIndex + (direction < 0 ? -offset : offset) + lines.length) % lines.length;
    const candidate = lines[index];
    if (candidate.id !== currentLineId && candidate.countStatus !== 'counted') return candidate.id;
  }
  return '';
}

export function reconcileCounterDrafts(currentDrafts, assignments) {
  const next = {};
  for (const assignment of assignments) {
    for (const line of assignment.lines) {
      const existing = currentDrafts[line.id];
      if (!existing) {
        next[line.id] = createCounterLineDraft(line);
        continue;
      }
      const changed = counterLineDraftHasChanges(line, existing);
      if (changed || [COUNTER_DRAFT_STATES.FAILED, COUNTER_DRAFT_STATES.STALE, COUNTER_DRAFT_STATES.SAVING].includes(existing.saveState)) {
        const serverChanged = Boolean(existing.baseUpdatedAt && line.updatedAt && existing.baseUpdatedAt !== line.updatedAt);
        next[line.id] = serverChanged && changed
          ? { ...existing, saveState: COUNTER_DRAFT_STATES.STALE, error: 'The saved line changed. Review this draft, then retry.' }
          : existing;
      } else {
        next[line.id] = createCounterLineDraft(line);
      }
    }
  }
  return next;
}

export function summarizeCounterAssignment(assignment, drafts = {}) {
  const lines = assignment?.lines || [];
  const counted = lines.filter((line) => line.countStatus === 'counted');
  const incomplete = lines.filter((line) => line.countStatus !== 'counted');
  const deviations = counted.filter((line) => counterLineIsDeviation(line));
  const notes = lines.filter((line) => line.note);
  const unsafeDrafts = lines.filter((line) => {
    const draft = drafts[line.id];
    return counterLineDraftHasChanges(line, draft)
      || [COUNTER_DRAFT_STATES.SAVING, COUNTER_DRAFT_STATES.FAILED, COUNTER_DRAFT_STATES.STALE].includes(draft?.saveState);
  });
  const invalidDrafts = unsafeDrafts.filter((line) => !evaluateCounterLineDraft(line, drafts[line.id]).ok);
  return { lines, counted, incomplete, deviations, notes, unsafeDrafts, invalidDrafts };
}

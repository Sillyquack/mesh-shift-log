import {
  calculateStructuredInventoryQuantity,
  inventoryDecimalDraftState,
  INVENTORY_COUNT_MODES,
  normalizeInventoryDecimal,
} from './inventoryStructuredQuantities.js';

export const INVENTORY_MANAGER_SAVE_STATES = Object.freeze({
  IDLE: 'idle',
  UNSAVED: 'unsaved',
  SAVING: 'saving',
  SAVED: 'saved',
  FAILED: 'failed',
  STALE: 'stale',
});

export const INVENTORY_MANAGER_SAVE_KINDS = Object.freeze({
  QUANTITY: 'quantity',
  CASES: 'cases',
  STRUCTURED: 'structured',
});

export function normalizeInventoryManagerNote(value) {
  return String(value ?? '').trim();
}

function comparableDecimal(value) {
  if (value === null || value === undefined || value === '') return '';
  try {
    return normalizeInventoryDecimal(value, { maxScale: 6, allowNegative: false });
  } catch {
    return String(value);
  }
}

function defaultSaveKind(line) {
  if ([INVENTORY_COUNT_MODES.CONTAINER_PLUS_VOLUME, INVENTORY_COUNT_MODES.KEG_FRACTION].includes(line.countMode)) {
    return INVENTORY_MANAGER_SAVE_KINDS.STRUCTURED;
  }
  if (line.stockPolicy === 'protected_event_reserve' && (line.countFullCases !== null || line.countedQuantityExact === null)) {
    return INVENTORY_MANAGER_SAVE_KINDS.CASES;
  }
  return INVENTORY_MANAGER_SAVE_KINDS.QUANTITY;
}

export function createInventoryManagerLineDraft(line) {
  return {
    countedQuantity: line.countedQuantityExact ?? '',
    fullCases: line.countFullCases ?? '',
    looseQuantity: line.countLooseQuantity ?? 0,
    wholeUnits: line.countedWholeUnitsExact ?? '',
    openVolumeLiters: line.countedOpenVolumeLitersExact ?? '',
    fullKegs: line.countedFullKegsExact ?? '',
    partialKegFraction: line.countedPartialKegFractionExact ?? '',
    note: line.note || '',
    saveKind: defaultSaveKind(line),
    baseUpdatedAt: line.updatedAt || '',
    saveState: line.countStatus === 'counted' ? INVENTORY_MANAGER_SAVE_STATES.SAVED : INVENTORY_MANAGER_SAVE_STATES.IDLE,
    message: '',
    error: '',
  };
}

function evaluateQuantity(line, draft) {
  const countChanged = comparableDecimal(draft.countedQuantity) !== comparableDecimal(line.countedQuantityExact);
  const state = inventoryDecimalDraftState(draft.countedQuantity, { maxScale: 6, allowNegative: false });
  if (!(state.complete && state.valid)) {
    return { ok: false, countChanged, message: state.message || 'Enter a physical quantity. Blank is not zero.' };
  }
  const countedQuantity = normalizeInventoryDecimal(draft.countedQuantity, { maxScale: 6, allowNegative: false });
  return {
    ok: true,
    countedQuantity,
    countChanged,
  };
}

function evaluateCases(line, draft) {
  const fullCasesChanged = draft.fullCases === ''
    ? line.countFullCases !== null
    : Number(draft.fullCases) !== Number(line.countFullCases ?? 0);
  const looseQuantityChanged = comparableDecimal(draft.looseQuantity) !== comparableDecimal(line.countLooseQuantity ?? 0);
  const countChanged = fullCasesChanged || looseQuantityChanged;
  const fullCases = Number(draft.fullCases);
  const looseState = inventoryDecimalDraftState(draft.looseQuantity, { maxScale: 6, allowNegative: false });
  if (draft.fullCases === '' || !Number.isInteger(fullCases) || fullCases < 0) {
    return { ok: false, countChanged, message: 'Enter full cases as a non-negative whole number.' };
  }
  if (!(looseState.complete && looseState.valid)) {
    return { ok: false, countChanged, message: looseState.message || 'Enter a non-negative loose quantity.' };
  }
  const looseQuantity = normalizeInventoryDecimal(draft.looseQuantity, { maxScale: 6, allowNegative: false });
  return {
    ok: true,
    fullCases,
    looseQuantity,
    countChanged: countChanged || line.countFullCases === null,
  };
}

function evaluateStructured(line, draft) {
  const inputChanged = line.countMode === INVENTORY_COUNT_MODES.CONTAINER_PLUS_VOLUME
    ? comparableDecimal(draft.wholeUnits) !== comparableDecimal(line.countedWholeUnitsExact)
      || comparableDecimal(draft.openVolumeLiters) !== comparableDecimal(line.countedOpenVolumeLitersExact)
    : comparableDecimal(draft.fullKegs) !== comparableDecimal(line.countedFullKegsExact)
      || comparableDecimal(draft.partialKegFraction) !== comparableDecimal(line.countedPartialKegFractionExact);
  try {
    const result = line.countMode === INVENTORY_COUNT_MODES.CONTAINER_PLUS_VOLUME
      ? calculateStructuredInventoryQuantity({
        countMode: line.countMode,
        wholeCount: draft.wholeUnits,
        openVolumeLiters: draft.openVolumeLiters,
        containerCapacityLiters: line.containerCapacityLiters,
      })
      : calculateStructuredInventoryQuantity({
        countMode: line.countMode,
        fullKegs: draft.fullKegs,
        partialKegFraction: draft.partialKegFraction,
      });
    return { ok: true, ...result, countChanged: inputChanged };
  } catch (error) {
    return { ok: false, countChanged: inputChanged, message: error.message };
  }
}

export function evaluateInventoryManagerLineDraft(line, draft) {
  const note = normalizeInventoryManagerNote(draft.note);
  const noteChanged = note !== normalizeInventoryManagerNote(line.note);
  const evaluated = draft.saveKind === INVENTORY_MANAGER_SAVE_KINDS.CASES
    ? evaluateCases(line, draft)
    : draft.saveKind === INVENTORY_MANAGER_SAVE_KINDS.STRUCTURED
      ? evaluateStructured(line, draft)
      : evaluateQuantity(line, draft);
  const countChanged = evaluated.countChanged === true;
  const dirty = countChanged || noteChanged;
  const noteOnly = noteChanged && !countChanged;
  const noteOnlyAllowed = line.countMethod === 'manual' && line.countStatus === 'counted' && line.countedQuantityExact !== null;
  const noteOnlyMessage = noteOnly && !noteOnlyAllowed
    ? 'This line was not saved as a manual physical count. Record a physical count before saving a note; a note-only edit will not change its recorded method.'
    : '';
  const canSave = evaluated.ok && dirty && !noteOnlyMessage;
  const countLabel = draft.saveKind === INVENTORY_MANAGER_SAVE_KINDS.CASES
    ? 'Save case count'
    : line.countMode === INVENTORY_COUNT_MODES.CONTAINER_PLUS_VOLUME
      ? 'Save bottle count'
      : line.countMode === INVENTORY_COUNT_MODES.KEG_FRACTION
        ? 'Save keg count'
        : line.stockPolicy === 'protected_event_reserve'
          ? 'Save total count'
          : 'Save physical count';
  return {
    ...evaluated,
    note,
    noteChanged,
    countChanged,
    dirty,
    noteOnly,
    noteOnlyAllowed,
    canSave,
    message: evaluated.ok ? noteOnlyMessage : evaluated.message,
    buttonLabel: noteOnly ? 'Save note' : noteChanged && countChanged ? 'Save count and note' : countLabel,
  };
}

export function inventoryManagerLineDraftHasChanges(line, draft) {
  return evaluateInventoryManagerLineDraft(line, draft).dirty;
}

export function inventoryLocationCompletionBlocked(summary) {
  return Number(summary?.uncounted || 0) > 0 || Number(summary?.needsReview || 0) > 0;
}

export function inventoryManagerLineDraftStatus(line, draft, evaluated) {
  if (draft.saveState === INVENTORY_MANAGER_SAVE_STATES.SAVING) {
    return { state: 'saving', label: evaluated.noteOnly ? 'Saving note…' : 'Saving…', message: '' };
  }
  if (draft.saveState === INVENTORY_MANAGER_SAVE_STATES.STALE) {
    return { state: 'stale', label: 'Changed elsewhere — review before retrying', message: draft.error };
  }
  if (draft.saveState === INVENTORY_MANAGER_SAVE_STATES.FAILED) {
    return { state: 'failed', label: 'Save failed — retry', message: draft.error };
  }
  if (evaluated.dirty && !evaluated.ok) {
    return { state: 'invalid', label: 'Cannot save yet', message: evaluated.message };
  }
  if (evaluated.dirty && !evaluated.canSave) {
    return { state: 'invalid', label: 'Cannot save this note alone', message: evaluated.message };
  }
  if (evaluated.dirty) {
    return { state: 'unsaved', label: evaluated.noteOnly ? 'Unsaved note' : 'Unsaved changes', message: '' };
  }
  if (draft.saveState === INVENTORY_MANAGER_SAVE_STATES.SAVED && draft.message) {
    return { state: 'saved', label: draft.message, message: '' };
  }
  return line.countStatus === 'counted'
    ? { state: 'saved', label: 'Saved — no unsaved changes', message: '' }
    : { state: 'idle', label: 'Not counted', message: 'Enter a physical count or use another explicit line action.' };
}

export function inventoryManagerLineDraftAfterFailure(draft, result) {
  const stale = /changed on another device|refresh before trying again/i.test(result?.message || '');
  return {
    ...draft,
    saveState: stale ? INVENTORY_MANAGER_SAVE_STATES.STALE : INVENTORY_MANAGER_SAVE_STATES.FAILED,
    error: result?.message || 'The count was not saved. Check the connection and retry.',
    message: '',
  };
}

export function createInventoryManagerSaveGuard() {
  const active = new Set();
  return {
    has(key) {
      return active.has(key);
    },
    async run(key, operation) {
      if (active.has(key)) return { skipped: true };
      active.add(key);
      try {
        return await operation();
      } finally {
        active.delete(key);
      }
    },
  };
}

export function executeInventoryManagerLineSave({ key, evaluated, guard, operation }) {
  if (!evaluated?.canSave) return Promise.resolve({ skipped: true, reason: 'unchanged_or_invalid' });
  return guard.run(key, operation);
}

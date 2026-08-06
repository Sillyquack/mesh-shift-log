export const ROUTINE_DELIVERY_REPORTED_STATUSES = Object.freeze([
  'delivered_to_standard',
  'delivered_after_correction',
  'delivered_with_override',
  'delivered_with_deviation',
  'not_applicable',
  'transferred',
  'unavailable',
]);

export const ROUTINE_DELIVERY_COMPARISON_MODES = Object.freeze([
  'ready_on_arrival',
  'control_result',
]);

export const ROUTINE_DELIVERY_COMPARISON_RESULTS = Object.freeze([
  'matched',
  'mismatch',
  'confirmed_prior_deviation',
  'resolved_after_delivery',
  'no_previous_delivery',
  'not_comparable',
]);

export const ROUTINE_DELIVERY_SELECTION_STATES = Object.freeze([
  'selected',
  'no_previous_delivery',
  'ambiguous_previous_delivery',
  'no_target_contract',
  'opening_task_not_found',
]);

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function array(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeRoutineDeliveryItem(row = {}) {
  return Object.freeze({
    ...row,
    id: row.id || null,
    organizationId: row.organization_id || row.organizationId || null,
    deliveryRecordId: row.delivery_record_id || row.deliveryRecordId || null,
    sourceRunId: row.source_run_id || row.sourceRunId || null,
    sourceTaskId: row.source_run_task_id || row.sourceTaskId || null,
    sourceRelationId: row.source_run_relation_id || row.sourceRelationId || null,
    deliveryKey: row.delivery_key || row.deliveryKey || '',
    label: row.label || '',
    category: row.category || 'general',
    targetRoutineKey: row.target_routine_key || row.targetRoutineKey || '',
    targetTaskKey: row.target_task_key || row.targetTaskKey || '',
    comparisonMode: row.comparison_mode || row.comparisonMode || null,
    reportedStatus: row.reported_status || row.reportedStatus || 'unavailable',
    required: row.required_snapshot ?? row.required ?? true,
    allowNotApplicable:
      row.allow_not_applicable_snapshot ?? row.allowNotApplicable ?? false,
    scopePolicy: row.scope_policy_snapshot || row.scopePolicy || 'same_scope',
    evidenceItemKeys: Object.freeze(array(
      row.evidence_item_keys_snapshot || row.evidenceItemKeys,
    ).map(String)),
    sortOrder: number(row.sort_order_snapshot ?? row.sortOrder),
    taskVerificationSnapshot: object(
      row.task_verification_snapshot || row.taskVerificationSnapshot,
    ),
    taskItemEvidenceSnapshot: object(
      row.task_item_evidence_snapshot || row.taskItemEvidenceSnapshot,
    ),
    deviationSnapshot: object(row.deviation_snapshot || row.deviationSnapshot),
    overrideSnapshot: object(row.override_snapshot || row.overrideSnapshot),
    standardSnapshot: object(row.standard_snapshot || row.standardSnapshot),
    referenceImageSnapshot: object(
      row.reference_image_snapshot || row.referenceImageSnapshot,
    ),
    itemHash: row.item_hash || row.itemHash || null,
  });
}

export function normalizeRoutineDeliveryRecord(row = {}) {
  return Object.freeze({
    ...row,
    id: row.id || row.deliveryRecordId || null,
    organizationId: row.organization_id || row.organizationId || null,
    sourceRunId: row.source_run_id || row.sourceRunId || null,
    operationalDate: row.operational_date || row.operationalDate || null,
    sourceRoutineKey:
      row.source_routine_key_snapshot || row.sourceRoutineKey || '',
    scopeKey: row.scope_key_snapshot || row.scopeKey || 'default',
    sourceFinishSequence: number(
      row.source_finish_sequence ?? row.sourceFinishSequence,
    ),
    supersedesDeliveryRecordId:
      row.supersedes_delivery_record_id || row.supersedesDeliveryRecordId || null,
    responsibilitySnapshot: object(
      row.responsibility_snapshot || row.responsibilitySnapshot,
    ),
    runVerificationSnapshot: object(
      row.run_verification_snapshot || row.runVerificationSnapshot,
    ),
    recordHash: row.record_hash || row.recordHash || null,
    generatedAt: row.generated_at || row.generatedAt || null,
    generatedByName:
      row.generated_by_name_snapshot || row.generatedByName || null,
  });
}

export function normalizeRoutineDeliveryComparison(row = {}) {
  if (!row || typeof row !== 'object') return null;
  return Object.freeze({
    ...row,
    id: row.id || null,
    organizationId: row.organization_id || row.organizationId || null,
    openingRunId: row.opening_run_id || row.openingRunId || null,
    openingTaskId: row.opening_task_id || row.openingTaskId || null,
    comparisonSequence: number(
      row.comparison_sequence ?? row.comparisonSequence,
      1,
    ),
    deliveryRecordId: row.delivery_record_id || row.deliveryRecordId || null,
    deliveryItemId: row.delivery_item_id || row.deliveryItemId || null,
    sourceClosingRunId:
      row.source_closing_run_id || row.sourceClosingRunId || null,
    sourceClosingTaskId:
      row.source_closing_task_id || row.sourceClosingTaskId || null,
    sourceOperationalDate:
      row.source_operational_date || row.sourceOperationalDate || null,
    openingOperationalDate:
      row.opening_operational_date || row.openingOperationalDate || null,
    openingInitialAssessment:
      row.opening_initial_assessment || row.openingInitialAssessment || null,
    comparisonMode: row.comparison_mode || row.comparisonMode || null,
    deliveryReportedStatus:
      row.delivery_reported_status || row.deliveryReportedStatus || null,
    comparisonResult: row.comparison_result || row.comparisonResult || null,
    previousDeliveryHadOverride:
      row.previous_delivery_had_override
      ?? row.previousDeliveryHadOverride
      ?? false,
    previousDeliveryHadDeviation:
      row.previous_delivery_had_deviation
      ?? row.previousDeliveryHadDeviation
      ?? false,
    linkedDeviationId:
      row.linked_deviation_id || row.linkedDeviationId || null,
    comparisonHash: row.comparison_hash || row.comparisonHash || null,
    comparedAt: row.compared_at || row.comparedAt || null,
    comparedByName:
      row.compared_by_name_snapshot || row.comparedByName || null,
  });
}

export function normalizeRoutineDeliverySelection(payload = {}) {
  return Object.freeze({
    ...payload,
    selectionState:
      payload.selectionState || payload.selection_state || 'no_previous_delivery',
    deliveryRecordId:
      payload.deliveryRecordId || payload.delivery_record_id || null,
    deliveryItemId: payload.deliveryItemId || payload.delivery_item_id || null,
    sourceRunId: payload.sourceRunId || payload.source_run_id || null,
    sourceTaskId: payload.sourceTaskId || payload.source_task_id || null,
    sourceOperationalDate:
      payload.sourceOperationalDate || payload.source_operational_date || null,
    ageInOperationalDays: number(
      payload.ageInOperationalDays ?? payload.age_in_operational_days,
    ),
    reportedStatus:
      payload.reportedStatus || payload.reported_status || null,
    previousDeliveryHadOverride:
      payload.previousDeliveryHadOverride
      ?? payload.previous_delivery_had_override
      ?? false,
    previousDeliveryHadDeviation:
      payload.previousDeliveryHadDeviation
      ?? payload.previous_delivery_had_deviation
      ?? false,
    completion: object(payload.completion),
    verification: object(payload.verification),
    responsibility: object(payload.responsibility),
  });
}

export function normalizeRoutineDeliveryPreview(payload = {}) {
  return Object.freeze({
    hasDeliveryContract:
      payload.hasDeliveryContract === true
      || payload.has_delivery_contract === true,
    valid: payload.valid === true,
    blockers: Object.freeze(array(payload.blockers).map(String)),
    warnings: Object.freeze(array(payload.warnings).map(String)),
    proposedItems: Object.freeze(array(
      payload.proposedItems || payload.proposed_items,
    ).map(normalizeRoutineDeliveryItem)),
    responsibilitySnapshot: object(
      payload.responsibilitySnapshot || payload.responsibility_snapshot,
    ),
    runVerificationSnapshot: object(
      payload.runVerificationSnapshot || payload.run_verification_snapshot,
    ),
    expectedFinishSequence: number(
      payload.expectedFinishSequence ?? payload.expected_finish_sequence,
    ),
    previousDeliveryRecordId:
      payload.previousDeliveryRecordId
      || payload.previous_delivery_record_id
      || null,
    proposedRecordHash:
      payload.proposedRecordHash || payload.proposed_record_hash || null,
  });
}

export function normalizeRoutineDeliverySummary(payload = {}) {
  return Object.freeze({
    ...payload,
    applied: payload.applied === true,
    deliveryRecordId:
      payload.deliveryRecordId || payload.delivery_record_id || null,
    recordHash: payload.recordHash || payload.record_hash || null,
    sourceFinishSequence: number(
      payload.sourceFinishSequence ?? payload.source_finish_sequence,
    ),
    supersedesDeliveryRecordId:
      payload.supersedesDeliveryRecordId
      || payload.supersedes_delivery_record_id
      || null,
    itemCount: number(payload.itemCount ?? payload.item_count),
  });
}

export function normalizeRoutineDeliveryWorkspace(payload = {}) {
  const delivery = object(payload.delivery);
  return Object.freeze({
    delivery: Object.freeze({
      ...delivery,
      preview: normalizeRoutineDeliveryPreview(delivery.preview),
      records: Object.freeze(array(delivery.records).map((entry) => Object.freeze({
        ...entry,
        record: normalizeRoutineDeliveryRecord(entry.record),
        items: Object.freeze(array(entry.items).map(normalizeRoutineDeliveryItem)),
      }))),
      currentRecord: delivery.currentRecord
        ? normalizeRoutineDeliveryRecord(delivery.currentRecord)
        : null,
    }),
    previousDeliveryByTask: Object.freeze(array(
      payload.previousDeliveryByTask || payload.previous_delivery_by_task,
    ).map((entry) => Object.freeze({
      ...entry,
      previousDeliverySummary: normalizeRoutineDeliverySelection(
        entry.previousDeliverySummary || entry.previous_delivery_summary,
      ),
      comparison: normalizeRoutineDeliveryComparison(entry.comparison),
    }))),
    deliveryComparisons: Object.freeze(array(
      payload.deliveryComparisons || payload.delivery_comparisons,
    ).map(normalizeRoutineDeliveryComparison)),
  });
}

export function isRoutineDeliveryMatched(value = {}) {
  return normalizeRoutineDeliveryComparison(value)?.comparisonResult === 'matched';
}

export function isRoutineDeliveryMismatch(value = {}) {
  return normalizeRoutineDeliveryComparison(value)?.comparisonResult === 'mismatch';
}

export function hasPriorRoutineDeliveryDeviation(value = {}) {
  const comparison = normalizeRoutineDeliveryComparison(value);
  return comparison?.previousDeliveryHadDeviation === true
    || comparison?.comparisonResult === 'confirmed_prior_deviation';
}

export function inspectRoutineDeliveryIntegrity(payload = {}) {
  const stored = payload.storedRecordHash || payload.stored_record_hash || null;
  const recomputed =
    payload.recomputedRecordHash || payload.recomputed_record_hash || null;
  const items = array(
    payload.itemVerificationResults || payload.item_verification_results,
  );
  const errors = array(payload.errors).map(String);
  return Object.freeze({
    valid: payload.valid === true
      && SHA256_PATTERN.test(stored || '')
      && SHA256_PATTERN.test(recomputed || '')
      && stored === recomputed
      && items.every((item) => item?.valid === true)
      && errors.length === 0,
    storedRecordHash: stored,
    recomputedRecordHash: recomputed,
    itemVerificationResults: Object.freeze(items),
    sourceFinishSequenceValid:
      payload.sourceFinishSequenceValid === true
      || payload.source_finish_sequence_valid === true,
    sourceRunCurrentStateValid:
      payload.sourceRunCurrentStateValid === true
      || payload.source_run_current_state_valid === true,
    supersessionIntegrity:
      payload.supersessionIntegrity === true
      || payload.supersession_integrity === true,
    errors: Object.freeze(errors),
  });
}

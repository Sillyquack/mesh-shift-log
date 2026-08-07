export const ROUTINE_RUN_STATUSES = Object.freeze([
  'scheduled',
  'in_progress',
  'awaiting_final_verification',
  'waiting_for_transfers',
  'finished',
  'reopened',
  'cancelled',
  'superseded',
]);

export const ROUTINE_TASK_STATUSES = Object.freeze([
  'not_started', 'in_progress', 'waiting', 'completed', 'blocked',
  'not_applicable', 'transferred', 'cancelled',
]);

export const ROUTINE_TASK_OUTCOMES = Object.freeze([
  'ready_on_arrival',
  'standard_met',
  'completed_after_correction',
  'control_passed',
  'control_completed_with_deviation',
  'completed_with_manager_override',
  'system_completed',
]);

export const ROUTINE_TASK_INCLUSION_STATES = Object.freeze(['included', 'excluded', 'pending']);
export const ROUTINE_CONDITION_STATES = Object.freeze([
  'not_required', 'pending', 'matched', 'not_matched', 'error',
]);
export const ROUTINE_PARTICIPATION_STATUSES = Object.freeze([
  'assigned', 'active', 'temporarily_away', 'expected_back',
  'returned', 'completed', 'removed',
]);
export const ROUTINE_RUN_ROLE_KEYS = Object.freeze([
  'opening_responsible',
  'closing_responsible',
  'cash_register_responsible',
  'locking_alarm_responsible',
  'asset_responsible',
  'event_area_responsible',
]);

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function array(value) {
  return Array.isArray(value) ? value : [];
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeRoutineRunRecord(row = {}) {
  return {
    id: row.id || null,
    organizationId: row.organization_id || row.organizationId || null,
    routineKey: row.routine_key || row.routineKey || '',
    scopeKey: row.scope_key || row.scopeKey || 'default',
    operationalDate: row.operational_date || row.operationalDate || null,
    timezone: row.timezone || 'Europe/Oslo',
    templateId: row.template_id || row.templateId || null,
    templateVersionId: row.template_version_id || row.templateVersionId || null,
    templateVersionNumber: number(
      row.template_version_number_snapshot ?? row.templateVersionNumber,
    ),
    templateContentHash:
      row.template_content_hash_snapshot || row.templateContentHash || null,
    snapshotSchemaVersion:
      row.snapshot_schema_version || row.snapshotSchemaVersion || null,
    snapshotState: row.snapshot_state || row.snapshotState || null,
    snapshotHash: row.snapshot_hash || row.snapshotHash || null,
    status: row.status || 'scheduled',
    revision: number(row.revision, 1),
    reopenCount: number(row.reopen_count ?? row.reopenCount),
    currentFinishSequence: number(
      row.current_finish_sequence ?? row.currentFinishSequence,
    ),
    startedAt: row.started_at || row.startedAt || null,
    finishedAt: row.finished_at || row.finishedAt || null,
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  };
}

export function normalizeRoutineRunTask(row = {}) {
  return {
    ...row,
    id: row.id || null,
    runId: row.run_id || row.runId || null,
    runSectionId: row.run_section_id || row.runSectionId || null,
    taskKey: row.task_key_snapshot || row.taskKey || '',
    title: row.title_snapshot || row.title || '',
    inclusionState: row.inclusion_state || row.inclusionState || 'pending',
    conditionEvaluationId:
      row.condition_evaluation_id || row.conditionEvaluationId || null,
    status: row.status || 'not_started',
    outcome: row.outcome || null,
    assignedParticipantId:
      row.assigned_participant_id || row.assignedParticipantId || null,
    revision: number(row.revision, 1),
  };
}

export function normalizeRoutineRunTaskItem(row = {}) {
  return {
    ...row,
    id: row.id || null,
    runId: row.run_id || row.runId || null,
    runTaskId: row.run_task_id || row.runTaskId || null,
    itemKey: row.item_key_snapshot || row.itemKey || '',
    label: row.label_snapshot || row.label || '',
    sourceKind: row.source_kind_snapshot || row.sourceKind || 'static',
    sourceRecord: row.source_record_snapshot || row.sourceRecord || {},
    generatedFromSource:
      row.generated_from_source ?? row.generatedFromSource ?? false,
    status: row.status || 'not_started',
    value: row.value_json || row.value || {},
    revision: number(row.revision, 1),
  };
}

export function normalizeRoutineRunReferenceImage(row = {}) {
  return {
    ...row,
    id: row.id || null,
    runId: row.run_id || row.runId || null,
    runTaskId: row.run_task_id || row.runTaskId || null,
    runTaskItemId: row.run_task_item_id || row.runTaskItemId || null,
    referenceKey: row.reference_key_snapshot || row.referenceKey || '',
    referenceLabel: row.reference_label_snapshot || row.referenceLabel || '',
    referenceVersionId:
      row.reference_version_id_snapshot || row.referenceVersionId || null,
    imageState: row.image_state_snapshot || row.imageState || 'placeholder',
    objectPath: row.object_path_snapshot || row.objectPath || null,
    mimeType: row.mime_type_snapshot || row.mimeType || null,
    byteSize: row.byte_size_snapshot ?? row.byteSize ?? null,
    caption: row.caption_snapshot || row.caption || null,
    altText: row.alt_text_snapshot || row.altText || null,
    placeholderText:
      row.placeholder_text_snapshot || row.placeholderText || '',
    buttonLabel: row.button_label_snapshot || row.buttonLabel || '',
    contextNote: row.context_note_snapshot || row.contextNote || null,
  };
}

export function normalizeRoutineRunWorkspace(payload = {}) {
  return {
    run: normalizeRoutineRunRecord(payload.run || {}),
    sections: array(payload.sections),
    tasks: array(payload.tasks).map(normalizeRoutineRunTask),
    taskItems: array(payload.taskItems || payload.task_items).map(
      normalizeRoutineRunTaskItem,
    ),
    referenceImages: array(
      payload.referenceImages || payload.reference_images,
    ).map(normalizeRoutineRunReferenceImage),
    conditions: array(payload.conditions),
    dependencies: array(payload.dependencies),
    relations: array(payload.relations),
    participants: array(payload.participants),
    activeRoleAssignments: array(
      payload.activeRoleAssignments || payload.active_role_assignments,
    ),
    snapshotSources: array(payload.snapshotSources || payload.snapshot_sources),
    sync: payload.sync && typeof payload.sync === 'object' ? payload.sync : {},
  };
}

export function inspectRoutineSnapshotIntegrity(payload = {}) {
  const stored = payload.storedSnapshotHash || payload.stored_snapshot_hash || null;
  const recomputed =
    payload.recomputedSnapshotHash || payload.recomputed_snapshot_hash || null;
  const errors = array(payload.integrityErrors || payload.integrity_errors);
  return {
    valid:
      payload.valid === true
      && SHA256_PATTERN.test(stored || '')
      && SHA256_PATTERN.test(recomputed || '')
      && stored === recomputed
      && errors.length === 0,
    storedSnapshotHash: stored,
    recomputedSnapshotHash: recomputed,
    counts: payload.counts && typeof payload.counts === 'object' ? payload.counts : {},
    integrityErrors: errors,
    sourceWarnings: array(payload.sourceWarnings || payload.source_warnings),
    pendingConditionCount: number(
      payload.pendingConditionCount ?? payload.pending_condition_count,
    ),
    pendingExternalSourceCount: number(
      payload.pendingExternalSourceCount
        ?? payload.pending_external_source_count,
    ),
  };
}

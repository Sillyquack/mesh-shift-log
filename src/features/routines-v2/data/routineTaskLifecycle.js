export const ROUTINE_LIFECYCLE_RUN_STATUSES = Object.freeze([
  'scheduled', 'in_progress', 'awaiting_final_verification',
  'waiting_for_transfers', 'finished', 'reopened', 'cancelled', 'superseded',
]);

export const ROUTINE_LIFECYCLE_TASK_STATUSES = Object.freeze([
  'not_started', 'in_progress', 'waiting', 'completed', 'blocked',
  'not_applicable', 'transferred', 'cancelled',
]);

export const ROUTINE_DEVIATION_STATUSES = Object.freeze([
  'open', 'mitigated', 'resolved', 'accepted_temporarily', 'cancelled',
]);

export const ROUTINE_TRANSFER_STATUSES = Object.freeze([
  'proposed', 'accepted', 'rejected', 'completed', 'cancelled',
]);

export const ROUTINE_HANDOVER_STATUSES = Object.freeze([
  'draft', 'submitted', 'accepted', 'superseded',
]);

export const ROUTINE_LIFECYCLE_OUTCOMES = Object.freeze([
  'ready_on_arrival', 'standard_met', 'completed_after_correction',
  'control_passed', 'control_completed_with_deviation',
  'completed_with_manager_override', 'system_completed',
]);

export const ROUTINE_VERIFICATION_POLICIES = Object.freeze([
  'none', 'self_recheck', 'independent', 'second_person_required',
  'manager_required', 'closing_responsible',
]);

function array(value) {
  return Array.isArray(value) ? value : [];
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function normalizeRoutineLifecycleRecord(row = {}) {
  return {
    ...row,
    id: row.id || null,
    organizationId: row.organization_id || row.organizationId || null,
    runId: row.run_id || row.from_run_id || row.runId || row.fromRunId || null,
    taskId: row.task_id || row.from_task_id || row.taskId || row.fromTaskId || null,
    taskItemId: row.task_item_id || row.taskItemId || null,
    status: row.status || null,
    revision: number(row.revision, 1),
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  };
}

export function normalizeRoutineEvent(row = {}) {
  const record = normalizeRoutineLifecycleRecord(row);
  return {
    ...record,
    eventType: row.event_type || row.eventType || '',
    actorType: row.actor_type || row.actorType || 'user',
    actorName: row.actor_name_snapshot || row.actorName || '',
    actorRole: row.actor_role_snapshot || row.actorRole || null,
    payload: object(row.payload),
    previousRevision: number(row.previous_revision ?? row.previousRevision, 0) || null,
    newRevision: number(row.new_revision ?? row.newRevision, 0) || null,
    serverCreatedAt: row.server_created_at || row.serverCreatedAt || null,
  };
}

export function normalizeRoutineLifecycleWorkspace(payload = {}) {
  return {
    deviations: array(payload.deviations).map(normalizeRoutineLifecycleRecord),
    managerOverrides: array(payload.managerOverrides || payload.manager_overrides)
      .map(normalizeRoutineLifecycleRecord),
    taskVerifications: array(payload.taskVerifications || payload.task_verifications)
      .map(normalizeRoutineLifecycleRecord),
    runVerifications: array(payload.runVerifications || payload.run_verifications)
      .map(normalizeRoutineLifecycleRecord),
    runVerificationItems: array(payload.runVerificationItems || payload.run_verification_items)
      .map(normalizeRoutineLifecycleRecord),
    handovers: array(payload.handovers).map(normalizeRoutineLifecycleRecord),
    handoverItems: array(payload.handoverItems || payload.handover_items)
      .map(normalizeRoutineLifecycleRecord),
    transfers: array(payload.transfers).map(normalizeRoutineLifecycleRecord),
    recentTaskComments: array(payload.recentTaskComments || payload.recent_task_comments)
      .map(normalizeRoutineEvent),
    corrections: array(payload.corrections).map(normalizeRoutineLifecycleRecord),
    completionValidation: normalizeRoutineCompletionValidation(
      payload.completionValidation || payload.completion_validation,
    ),
  };
}

export function normalizeRoutineTimeline(payload = {}) {
  return {
    events: array(payload.events).map(normalizeRoutineEvent),
    corrections: array(payload.corrections).map(normalizeRoutineLifecycleRecord),
  };
}

export function normalizeRoutineCompletionValidation(payload = {}) {
  return {
    valid: payload.valid === true,
    blockers: array(payload.blockers).map(String),
    warnings: array(payload.warnings).map(String),
    acceptedTransferCount: number(
      payload.acceptedTransferCount ?? payload.accepted_transfer_count,
    ),
  };
}

export function isRoutineLifecycleHandled(record = {}) {
  return ['completed', 'resolved', 'accepted', 'rejected', 'cancelled',
    'not_applicable', 'transferred', 'finished', 'superseded']
    .includes(record.status);
}

export function hasRoutineLifecycleBlockers(validation = {}) {
  return normalizeRoutineCompletionValidation(validation).blockers.length > 0;
}

// Display hints only. PostgreSQL remains authoritative for every transition.
export function getClientVisibleTaskActions(task = {}, { isCoordinator = false } = {}) {
  const actions = [];
  if (task.status === 'not_started') actions.push('claim', 'start');
  if (task.status === 'in_progress') actions.push('pause', 'complete', 'block', 'comment');
  if (task.status === 'waiting') actions.push('release', 'start', 'comment');
  if (['completed', 'not_applicable'].includes(task.status) && isCoordinator) actions.push('reopen');
  if (isCoordinator && !['completed', 'cancelled', 'transferred'].includes(task.status)) actions.push('transfer');
  return Object.freeze([...new Set(actions)]);
}

export function getClientVisibleRunActions(run = {}, { isCoordinator = false, isManager = false } = {}) {
  const actions = [];
  if (run.status === 'scheduled' && isCoordinator) actions.push('start');
  if (['in_progress', 'reopened', 'awaiting_final_verification', 'waiting_for_transfers'].includes(run.status)
      && isCoordinator) actions.push('validate_completion', 'finish', 'cancel');
  if (run.status === 'finished' && isManager) actions.push('reopen');
  return Object.freeze(actions);
}

export function buildRoutineLifecycleRequest(payload = {}) {
  if (!payload.idempotencyKey) {
    throw new TypeError('A stable idempotencyKey is required and must be reused for retries.');
  }
  return Object.freeze({ ...payload, idempotencyKey: payload.idempotencyKey });
}

export const ROUTINE_DOUBLE_SHIFT_BUNDLE_STATUSES = Object.freeze([
  'scheduled',
  'opening_in_progress',
  'opening_complete',
  'between_shifts',
  'closing_due',
  'closing_in_progress',
  'closing_scope_complete',
  'waiting_for_transferred_event_close',
  'completed',
  'cancelled',
]);

export const ROUTINE_DOUBLE_SHIFT_PARTICIPANT_STATUSES = Object.freeze([
  'assigned',
  'working_opening',
  'continuing_on_site',
  'temporarily_away',
  'expected_back',
  'returned',
  'working_closing',
  'closing_reassigned',
  'unable_to_return',
  'completed',
  'removed',
]);

export const ROUTINE_DOUBLE_SHIFT_STEP_KEYS = Object.freeze([
  'ds01_confirm_plan',
  'ds02_opening_transition',
  'ds03_return_review',
  'ds04_bundle_finalized',
]);

export const ROUTINE_DOUBLE_SHIFT_TRANSITION_STATUSES = Object.freeze([
  'continuing_on_site',
  'temporarily_away',
  'handing_operation_to_another',
  'unable_to_complete_closing',
]);

export const ROUTINE_EVENT_TRANSFER_RESULTS = Object.freeze([
  'standard_met',
  'completed_after_correction',
  'control_completed_with_deviation',
  'completed_with_manager_override',
]);

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

export function normalizeRoutineDoubleShiftBundle(row = {}) {
  return Object.freeze({
    ...row,
    id: row.id || null,
    organizationId: row.organization_id || row.organizationId || null,
    bundleType: row.bundle_type || row.bundleType || 'double_shift',
    operationalDate: row.operational_date || row.operationalDate || null,
    timezone: row.timezone || 'Europe/Oslo',
    scopeKey: row.scope_key || row.scopeKey || 'default',
    openingRoutineKey: row.opening_routine_key || row.openingRoutineKey || '',
    closingRoutineKey: row.closing_routine_key || row.closingRoutineKey || '',
    status: row.status || 'scheduled',
    revision: number(row.revision, 1),
    startedAt: row.started_at || row.startedAt || null,
    completedAt: row.completed_at || row.completedAt || null,
    cancelledAt: row.cancelled_at || row.cancelledAt || null,
  });
}

export function normalizeRoutineDoubleShiftParticipant(row = {}) {
  return Object.freeze({
    ...row,
    id: row.id || null,
    bundleId: row.bundle_id || row.bundleId || null,
    userProfileId: row.user_profile_id || row.userProfileId || null,
    openingRunParticipantId:
      row.opening_run_participant_id || row.openingRunParticipantId || null,
    closingRunParticipantId:
      row.closing_run_participant_id || row.closingRunParticipantId || null,
    displayName: row.display_name_snapshot || row.displayName || '',
    role: row.role_snapshot || row.role || '',
    status: row.status || 'assigned',
    expectedReturnAt: row.expected_return_at || row.expectedReturnAt || null,
    actualReturnAt: row.actual_return_at || row.actualReturnAt || null,
    interimOwnerParticipantId:
      row.interim_owner_participant_id || row.interimOwnerParticipantId || null,
    closingReassignedToParticipantId:
      row.closing_reassigned_to_participant_id
      || row.closingReassignedToParticipantId
      || null,
    revision: number(row.revision, 1),
    personalOutcome: row.personalOutcome || row.personal_outcome || null,
  });
}

export function normalizeRoutineDoubleShiftStep(row = {}) {
  return Object.freeze({
    ...row,
    id: row.id || null,
    bundleId: row.bundle_id || row.bundleId || null,
    bundleParticipantId:
      row.bundle_participant_id || row.bundleParticipantId || null,
    stepKey: row.step_key || row.stepKey || '',
    status: row.status || 'not_started',
    revision: number(row.revision, 1),
    payload: object(row.payload_snapshot || row.payload),
    payloadHash: row.payload_hash || row.payloadHash || null,
    completedAt: row.completed_at || row.completedAt || null,
  });
}

export function normalizeRoutineDoubleShiftFeed(payload = {}) {
  const entries = array(payload.entries).map((entry) => Object.freeze({
    ...entry,
    entryId: entry.entryId || entry.entry_id || null,
    serverTimestamp: entry.serverTimestamp || entry.server_timestamp || null,
    sourceType: entry.sourceType || entry.source_type || null,
    category: entry.category || 'routine',
    actor: object(entry.actor),
    severity: entry.severity || 'normal',
    actionRequired: entry.actionRequired === true || entry.action_required === true,
  }));
  return Object.freeze({
    transitionCompletedAt:
      payload.transitionCompletedAt || payload.transition_completed_at || null,
    serverNow: payload.serverNow || payload.server_now || null,
    entries: Object.freeze(entries),
    feedHash: payload.feedHash || payload.feed_hash || null,
    counts: Object.freeze(object(payload.counts)),
    unresolvedActionCount: number(
      payload.unresolvedActionCount ?? payload.unresolved_action_count,
    ),
  });
}

export function normalizeRoutineEventTransferEvidence(payload = {}) {
  const acceptance = object(payload.acceptance);
  const completion = object(payload.completion);
  return Object.freeze({
    ...payload,
    transfer: Object.freeze(object(payload.transfer)),
    acceptance: Object.keys(acceptance).length ? Object.freeze(acceptance) : null,
    completion: Object.keys(completion).length ? Object.freeze(completion) : null,
    evidenceRequirements: Object.freeze(array(
      payload.evidenceRequirements || payload.evidence_requirements,
    ).map((item) => Object.freeze({ ...item }))),
    authority: Object.freeze(object(payload.authority)),
  });
}

export function getRoutineDoubleShiftPersonalOutcome(participant = {}) {
  const normalized = normalizeRoutineDoubleShiftParticipant(participant);
  if (normalized.personalOutcome) return normalized.personalOutcome;
  if (normalized.status === 'closing_reassigned') {
    return 'opening_completed_closing_reassigned';
  }
  if (normalized.status === 'unable_to_return') {
    return 'opening_completed_unable_to_return';
  }
  if (normalized.status === 'completed' && !normalized.openingRunParticipantId) {
    return 'closing_completed_as_replacement';
  }
  if (normalized.status === 'completed') return 'opening_and_closing_completed';
  return normalized.status;
}

// Display-only. Both instants must come from the server response; this helper
// never gates an action or derives an operational date.
export function getRoutineDoubleShiftReturnLateness({ expectedReturnAt, serverNow }) {
  const expected = Date.parse(expectedReturnAt || '');
  const observed = Date.parse(serverNow || '');
  if (!Number.isFinite(expected) || !Number.isFinite(observed)) {
    return Object.freeze({ available: false, late: false, seconds: 0 });
  }
  const seconds = Math.max(0, Math.floor((observed - expected) / 1000));
  return Object.freeze({ available: true, late: seconds > 0, seconds });
}

export function normalizeRoutineDoubleShiftWorkspace(payload = {}) {
  const runs = object(payload.runs);
  const current = payload.currentParticipant || payload.current_participant;
  return Object.freeze({
    ...payload,
    bundle: normalizeRoutineDoubleShiftBundle(payload.bundle),
    runs: Object.freeze({
      opening: Object.freeze(object(runs.opening)),
      closing: Object.freeze(object(runs.closing)),
    }),
    pinnedRuns: Object.freeze(array(payload.pinnedRuns || payload.pinned_runs)),
    currentParticipant: current
      ? normalizeRoutineDoubleShiftParticipant(current)
      : null,
    participants: Object.freeze(array(payload.participants).map(
      normalizeRoutineDoubleShiftParticipant,
    )),
    steps: Object.freeze(array(payload.steps).map(normalizeRoutineDoubleShiftStep)),
    roles: Object.freeze(array(payload.roles)),
    reassignments: Object.freeze(array(payload.reassignments)),
    changeFeed: normalizeRoutineDoubleShiftFeed(
      payload.changeFeed || payload.change_feed,
    ),
    externalEventContext: Object.freeze(array(
      payload.externalEventContext || payload.external_event_context,
    )),
    transfers: Object.freeze(array(payload.transfers).map(
      normalizeRoutineEventTransferEvidence,
    )),
    completionEligibility: Object.freeze(object(
      payload.completionEligibility || payload.completion_eligibility,
    )),
    serverTiming: Object.freeze(object(payload.serverTiming || payload.server_timing)),
    personalOutcome: payload.personalOutcome || payload.personal_outcome || null,
  });
}

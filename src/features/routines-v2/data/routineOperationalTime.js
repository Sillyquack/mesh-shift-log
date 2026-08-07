export const ROUTINE_TIME_ENGINE_VERSION = 'phase10f-v1';

export const ROUTINE_TIMING_PHASES = Object.freeze([
  'unscheduled', 'pending_condition', 'excluded', 'hidden', 'upcoming',
  'available', 'due', 'overdue', 'hard_deadline_passed', 'handled', 'cancelled',
]);

export const ROUTINE_COMPLETION_PHASES = Object.freeze([
  'before_target', 'on_time', 'due', 'overdue', 'after_hard_deadline',
]);

export const ROUTINE_TIME_CONDITION_STATES = Object.freeze([
  'not_required', 'pending', 'matched', 'not_matched', 'error',
]);

export const ROUTINE_OPERATIONAL_DATE_SOURCES = Object.freeze([
  'derived', 'explicit', 'superseded_copy', 'legacy_backfill',
]);

function array(value) { return Array.isArray(value) ? value : []; }
function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeRoutineOperationalClock(payload = {}) {
  return Object.freeze({
    serverNow: payload.serverNow || payload.server_now || null,
    timezone: payload.timezone || 'Europe/Oslo',
    localTimestamp: payload.localTimestamp || payload.local_timestamp || null,
    localDate: payload.localDate || payload.local_date || null,
    localTime: payload.localTime || payload.local_time || null,
    operationalDate: payload.operationalDate || payload.operational_date || null,
    cutoff: payload.cutoff || null,
    settingsRevision: finite(payload.settingsRevision ?? payload.settings_revision, 1),
    timeEngineVersion:
      payload.timeEngineVersion || payload.time_engine_version || ROUTINE_TIME_ENGINE_VERSION,
  });
}

export function normalizeRoutineTaskTiming(row = {}) {
  const live = object(row.live);
  return Object.freeze({
    ...row,
    id: row.id || null,
    runId: row.run_id || row.runId || null,
    taskId: row.task_id || row.taskId || null,
    currentPhase: row.current_phase || row.currentPhase || live.phase || 'unscheduled',
    live: Object.freeze({
      phase: live.phase || row.current_phase || row.currentPhase || 'unscheduled',
      nextBoundaryAt: live.nextBoundaryAt || live.next_boundary_at || null,
      secondsUntilNextBoundary: finite(
        live.secondsUntilNextBoundary ?? live.seconds_until_next_boundary,
        0,
      ),
      secondsLate: finite(live.secondsLate ?? live.seconds_late, 0),
      canClaim: live.canClaim === true || live.can_claim === true,
      canStart: live.canStart === true || live.can_start === true,
      canComplete: live.canComplete === true || live.can_complete === true,
      reasonCode: live.reasonCode || live.reason_code || null,
    }),
    completionPhase: row.completion_phase || row.completionPhase || null,
    completionLatenessSeconds: finite(
      row.completion_lateness_seconds ?? row.completionLatenessSeconds,
      0,
    ),
    revision: finite(row.revision, 1),
  });
}

export function normalizeRoutineTimingState(payload = {}) {
  return Object.freeze({
    serverNow: payload.serverNow || payload.server_now || null,
    timezone: payload.timezone || 'Europe/Oslo',
    operationalDate: payload.operationalDate || payload.operational_date || null,
    cutoff: payload.cutoff || null,
    timingSnapshotHash: payload.timingSnapshotHash || payload.timing_snapshot_hash || null,
    timingSnapshotValid:
      payload.timingSnapshotValid === true || payload.timing_snapshot_valid === true,
    tasks: Object.freeze(array(payload.tasks).map(normalizeRoutineTaskTiming)),
    timingDeviations: Object.freeze(array(
      payload.timingDeviations || payload.timing_deviations,
    )),
    conditions: Object.freeze(array(payload.conditions)),
  });
}

export function formatRoutineDuration(seconds) {
  const total = Math.max(0, Math.floor(finite(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${remainder}s`;
  return `${remainder}s`;
}

export function formatRoutineLateness(seconds) {
  const total = Math.max(0, finite(seconds));
  return total > 0 ? `${formatRoutineDuration(total)} late` : 'On time';
}

// Display-only. The server repeats every gate check with its own clock.
export function getServerHintedTimingActions(value = {}) {
  const live = object(value.live || value);
  return Object.freeze([
    ...(live.canClaim === true ? ['claim'] : []),
    ...(live.canStart === true ? ['start'] : []),
    ...(live.canComplete === true ? ['complete'] : []),
  ]);
}

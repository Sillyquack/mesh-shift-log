import { routineRpcClient } from "./routineRpcClient.js";
import {
  assignRoutineDeviation,
  cancelRoutineDeviation,
  cancelRoutineRun,
  createRoutineManagerOverride,
  mitigateRoutineDeviation,
  recordRoutineHistoryCorrection,
  reopenRoutineRun,
  reopenRoutineTask,
  resolveRoutineDeviation,
} from "./routineLifecycleClient.js";
import { normalizeHistoryPage, normalizeHistoryRun, normalizeHistoryTask } from "../data/routineHistoryModel.js";

async function read(name, payload, normalize = (value) => value) {
  const { data, error } = await routineRpcClient.request(name, payload, { operatorSession: true });
  if (error) throw error;
  return normalize(data);
}

export const listRoutineV2History = (filters = {}) => read("list_routine_v2_history", {
  input_date_from: filters.dateFrom,
  input_date_to: filters.dateTo,
  input_routine_key: filters.routineKey || null,
  input_status: filters.status || null,
  input_actor_id: filters.actorId || null,
  input_has_deviation: filters.hasDeviation ?? null,
  input_has_mismatch: filters.hasMismatch ?? null,
  input_limit: filters.limit || 100,
  input_cursor: filters.cursor || null,
}, normalizeHistoryPage);
export const getRoutineV2HistoryRun = (runId) => read("get_routine_v2_history_run", { input_run_id: runId }, normalizeHistoryRun);
export const getRoutineV2HistoryTask = (taskId) => read("get_routine_v2_history_task", { input_task_id: taskId }, normalizeHistoryTask);
export const getRoutineManagerReviewDashboard = (dateFrom, dateTo) => read("get_routine_manager_review_dashboard", { input_date_from: dateFrom, input_date_to: dateTo });
export const listRoutineOverrideFollowups = (status = null) => read("list_routine_override_followups", { input_status_filter: status });
export const listRoutineHistoryCorrections = (dateFrom, dateTo) => read("list_routine_history_corrections", { input_date_from: dateFrom, input_date_to: dateTo });
export const getRoutineLegacyHistorySummary = () => read("get_routine_legacy_history_summary", {});
export const listRoutineLegacyHistory = (filters = {}) => read("list_routine_legacy_history", { input_date_from: filters.dateFrom, input_date_to: filters.dateTo, input_limit: filters.limit || 100, input_cursor: filters.cursor || null });
export const getUnifiedRoutineHistory = (filters = {}) => read("get_unified_routine_history", { input_date_from: filters.dateFrom, input_date_to: filters.dateTo, input_limit: filters.limit || 100, input_cursor: filters.cursor || null });

export const routineHistoryMutations = Object.freeze({
  createManagerOverride: createRoutineManagerOverride,
  recordCorrection: recordRoutineHistoryCorrection,
  reopenTask: reopenRoutineTask,
  reopenRun: reopenRoutineRun,
  cancelRun: cancelRoutineRun,
  assignDeviation: assignRoutineDeviation,
  mitigateDeviation: mitigateRoutineDeviation,
  resolveDeviation: resolveRoutineDeviation,
  cancelDeviation: cancelRoutineDeviation,
});

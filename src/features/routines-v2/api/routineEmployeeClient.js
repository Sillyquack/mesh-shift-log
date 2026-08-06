import { routineRpcClient } from "./routineRpcClient.js";
import { createOrGetRoutineRun, joinRoutineRun, downloadRoutineRunSnapshotImage } from "./routineRunClient.js";
import * as lifecycle from "./routineLifecycleClient.js";
import * as doubleShift from "./routineDoubleShiftClient.js";
import { reauthenticateRoutineOperatorSession } from "./routineOperatorClient.js";
import { normalizeRoutineEmployeeHome, normalizeRoutineRelatedContext, normalizeRoutineRunActionContext,
  normalizeRoutineTaskActionContext, routineEmployeeError } from "../data/routineEmployeeModel.js";

async function read(name, payload, normalize) {
  const { data, error } = await routineRpcClient.request(name, payload);
  if (error) throw routineEmployeeError(error);
  return normalize(data);
}

export const getRoutineEmployeeHome = () => read("get_routine_employee_home", {}, normalizeRoutineEmployeeHome);
export const getRoutineRunActionContext = (runId) => read("get_routine_run_action_context", { input_run_id: runId }, normalizeRoutineRunActionContext);
export const getRoutineTaskActionContext = (taskId) => read("get_routine_task_action_context", { input_task_id: taskId }, normalizeRoutineTaskActionContext);
export const getRoutineHandoverActionContext = (handoverId) => read("get_routine_handover_action_context", { input_handover_id: handoverId }, normalizeRoutineRelatedContext);
export const getRoutineTransferActionContext = (transferId) => read("get_routine_transfer_action_context", { input_transfer_id: transferId }, normalizeRoutineRelatedContext);
export const getDoubleShiftActionContext = (bundleId) => read("get_double_shift_action_context", { input_bundle_id: bundleId }, normalizeRoutineRelatedContext);

export const routineEmployeeRunMutations = Object.freeze({ createOrGetRoutineRun, joinRoutineRun, startRoutineRun: lifecycle.startRoutineRun,
  requestFinalVerification: lifecycle.requestRoutineRunFinalVerification, completeRunVerification: lifecycle.completeRoutineRunVerification,
  finishRoutineRun: lifecycle.finishRoutineRun, reopenRoutineRun: lifecycle.reopenRoutineRun, cancelRoutineRun: lifecycle.cancelRoutineRun });

export const routineEmployeeTaskMutations = Object.freeze({ claimRoutineTask: lifecycle.claimRoutineTask, releaseRoutineTask: lifecycle.releaseRoutineTask,
  startRoutineTask: lifecycle.startRoutineTask, pauseRoutineTask: lifecycle.pauseRoutineTask, recordInitialAssessment: lifecycle.recordRoutineInitialAssessment,
  updateRoutineTaskItem: lifecycle.updateRoutineTaskItem, addRoutineTaskComment: lifecycle.addRoutineTaskComment, blockRoutineTask: lifecycle.blockRoutineTask,
  markNotApplicable: lifecycle.markRoutineTaskNotApplicable, completeRoutineTask: lifecycle.completeRoutineTask, reopenRoutineTask: lifecycle.reopenRoutineTask,
  createDeviation: lifecycle.createRoutineDeviation, assignDeviation: lifecycle.assignRoutineDeviation, mitigateDeviation: lifecycle.mitigateRoutineDeviation,
  resolveDeviation: lifecycle.resolveRoutineDeviation, cancelDeviation: lifecycle.cancelRoutineDeviation, verifyRoutineTask: lifecycle.verifyRoutineTask,
  proposeTransfer: lifecycle.proposeRoutineTransfer });

export const routineEmployeeHandoverMutations = Object.freeze({ createOrGet: lifecycle.createOrGetRoutineHandover,
  replaceDraft: lifecycle.replaceRoutineHandoverDraft, refreshGenerated: lifecycle.refreshRoutineHandoverGeneratedItems,
  submit: lifecycle.submitRoutineHandover, accept: lifecycle.acceptRoutineHandover });

export const routineEmployeeTransferMutations = Object.freeze({ accept: lifecycle.acceptRoutineTransfer, reject: lifecycle.rejectRoutineTransfer,
  complete: lifecycle.completeRoutineTransfer, cancel: lifecycle.cancelRoutineTransfer, acceptEvent: doubleShift.acceptRoutineEventTransfer,
  rejectEvent: doubleShift.rejectRoutineEventTransfer, completeEvent: doubleShift.completeRoutineEventTransfer });

export const routineEmployeeDoubleShiftMutations = Object.freeze({ createOrGet: doubleShift.createOrGetDoubleShiftBundle,
  confirmPlan: doubleShift.confirmDoubleShiftPlan, completeOpeningTransition: doubleShift.completeDoubleShiftOpeningTransition,
  getChangeFeed: doubleShift.getDoubleShiftChangeFeed, returnToDoubleShift: doubleShift.returnToDoubleShift,
  reassignClosing: doubleShift.reassignDoubleShiftClosing });

export { downloadRoutineRunSnapshotImage, reauthenticateRoutineOperatorSession };

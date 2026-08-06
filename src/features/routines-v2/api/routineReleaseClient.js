import { routineRpcClient } from "./routineRpcClient.js";
import { normalizeReleaseReadiness, releaseError } from "../data/routineReleaseModel.js";

async function rpc(name, payload = {}, normalize = (value) => value) {
  const { data, error } = await routineRpcClient.request(name, payload, { operatorSession: false });
  if (error) throw releaseError(error);
  return normalize(data);
}

export const getRoutinePilotReadiness = () => rpc("get_routine_pilot_readiness", {}, normalizeReleaseReadiness);
export const recordRoutineE2EVerificationAttestation = (payload) => rpc("record_routine_e2e_verification_attestation", {
  input_evidence_snapshot: payload.evidenceSnapshot,
  input_attestation_note: payload.note,
  input_idempotency_key: payload.idempotencyKey,
});
export const promoteRoutineUiReleaseStage = (payload) => rpc("promote_routine_ui_release_stage", {
  input_target_stage: "pilot_ready",
  input_expected_settings_revision: payload.expectedRevision,
  input_expected_readiness_hash: payload.expectedReadinessHash,
  input_attestation_note: payload.note,
  input_idempotency_key: payload.idempotencyKey,
});
export const setRoutinePilotNewWorkPaused = (payload) => rpc("set_routine_pilot_new_work_paused", {
  input_paused: payload.paused === true,
  input_reason: payload.reason,
  input_expected_revision: payload.expectedRevision,
  input_idempotency_key: payload.idempotencyKey,
});

import { routineRpcClient } from "./routineRpcClient.js";
import {
  clearRoutineOperatorSession,
  createRoutineOperatorSessionMaterial,
  setRoutineOperatorSession,
} from "../auth/routineOperatorSession.js";
import {
  mapRoutineOperatorAuthError,
  normalizeRoutineOperator,
  normalizeRoutineOperatorAdminWorkspace,
  normalizeRoutineOperatorSession,
  normalizeRoutineSharedDevice,
} from "../data/routineOperatorIdentity.js";

function failure(error) { return { ok: false, errorCode: mapRoutineOperatorAuthError(error), error }; }
async function call(name, payload = {}, options = {}) {
  const { data, error } = await routineRpcClient.request(name, payload, options);
  return error ? failure(error) : { ok: true, data };
}

export async function listAvailableRoutineOperators(clientInstanceId) {
  const result = await call("list_available_routine_operators", { input_client_instance_id: clientInstanceId }, { operatorSession: false });
  return result.ok ? { ...result, data: (result.data ?? []).map(normalizeRoutineOperator) } : result;
}

export async function authenticateRoutineOperator({
  clientInstanceId, operatorId, pin, idempotencyKey, organizationId, deviceAuthUserId,
}, { cryptoImpl = globalThis.crypto, storage } = {}) {
  const material = await createRoutineOperatorSessionMaterial(cryptoImpl);
  const result = await call("authenticate_routine_operator", {
    input_client_instance_id: clientInstanceId,
    input_operator_id: operatorId,
    input_session_id: material.sessionId,
    input_session_secret_hash: material.secretHash,
    input_pin: pin,
    input_idempotency_key: idempotencyKey,
  }, { operatorSession: false });
  if (!result.ok || result.data?.authenticated !== true) return result.ok
    ? { ok: false, errorCode: result.data?.errorCode ?? "operator_auth_failed", error: null }
    : result;
  setRoutineOperatorSession({ token: material.token, organizationId, deviceAuthUserId, operatorId,
    sessionMetadata: result.data.session }, { storage });
  return { ok: true, data: normalizeRoutineOperatorSession(result.data.session) };
}

export async function getCurrentRoutineOperatorSession() {
  const result = await call("get_current_routine_operator_session");
  return result.ok ? { ...result, data: normalizeRoutineOperatorSession(result.data) } : result;
}
export const touchRoutineOperatorSession = () => call("touch_routine_operator_session");
export const reauthenticateRoutineOperatorSession = (pin, idempotencyKey) => call("reauthenticate_routine_operator_session", {
  input_pin: pin, input_idempotency_key: idempotencyKey,
});
export async function endRoutineOperatorSession(reason, idempotencyKey) {
  const result = await call("end_routine_operator_session", { input_reason: reason, input_idempotency_key: idempotencyKey });
  if (result.ok) clearRoutineOperatorSession();
  return result;
}
export async function getRoutineSharedDeviceContext() {
  const result = await call("get_routine_shared_device_context", {}, { operatorSession: false });
  return result.ok ? { ...result, data: normalizeRoutineSharedDevice(result.data) } : result;
}
export const getRoutineOperatorSessionContext = () => call("get_routine_operator_session_context");
export async function getRoutineOperatorAdminWorkspace() {
  const result = await call("get_routine_operator_admin_workspace", {}, { operatorSession: false });
  return result.ok ? { ...result, data: normalizeRoutineOperatorAdminWorkspace(result.data) } : result;
}
export const getRoutineOperatorSecurityHistory = (p) => call("get_routine_operator_security_history", {
  input_date_from: p.dateFrom, input_date_to: p.dateTo, input_operator_id: p.operatorId ?? null,
  input_shared_device_id: p.sharedDeviceId ?? null,
}, { operatorSession: false });

export const routineOperatorAdmin = Object.freeze({
  registerDevice: (p) => call("register_routine_shared_device", { input_user_profile_id: p.userProfileId,
    input_device_key: p.deviceKey, input_label: p.label, input_settings: p.settings ?? {}, input_idempotency_key: p.idempotencyKey }, { operatorSession: false }),
  updateDevice: (p) => call("update_routine_shared_device", { input_shared_device_id: p.sharedDeviceId,
    input_label: p.label, input_settings: p.settings ?? {}, input_expected_revision: p.expectedRevision,
    input_idempotency_key: p.idempotencyKey }, { operatorSession: false }),
  setDeviceActive: (p) => call("set_routine_shared_device_active", { input_shared_device_id: p.sharedDeviceId,
    input_active: p.active === true, input_reason: p.reason, input_expected_revision: p.expectedRevision,
    input_idempotency_key: p.idempotencyKey }, { operatorSession: false }),
  createOperator: (p) => call("create_routine_operator", { input_operator_key: p.operatorKey, input_operator_type: p.operatorType,
    input_linked_user_profile_id: p.linkedUserProfileId ?? null, input_display_name: p.displayName,
    input_effective_role: p.effectiveRole, input_valid_from: p.validFrom ?? null, input_valid_until: p.validUntil ?? null,
    input_initial_pin: p.initialPin, input_idempotency_key: p.idempotencyKey }, { operatorSession: false }),
  updateOperator: (p) => call("update_routine_operator", { input_operator_id: p.operatorId, input_display_name: p.displayName,
    input_effective_role: p.effectiveRole, input_valid_from: p.validFrom ?? null, input_valid_until: p.validUntil ?? null,
    input_expected_revision: p.expectedRevision, input_idempotency_key: p.idempotencyKey }, { operatorSession: false }),
  setOperatorActive: (p) => call("set_routine_operator_active", { input_operator_id: p.operatorId, input_active: p.active === true,
    input_reason: p.reason, input_expected_revision: p.expectedRevision, input_idempotency_key: p.idempotencyKey }, { operatorSession: false }),
  rotatePin: (p) => call("rotate_routine_operator_pin", { input_operator_id: p.operatorId, input_new_pin: p.newPin,
    input_reason: p.reason, input_expected_operator_revision: p.expectedOperatorRevision,
    input_idempotency_key: p.idempotencyKey }, { operatorSession: false }),
  revokeCredential: (p) => call("revoke_routine_operator_credential", { input_credential_id: p.credentialId,
    input_reason: p.reason, input_idempotency_key: p.idempotencyKey }, { operatorSession: false }),
  replaceAccess: (p) => call("replace_routine_shared_device_operator_access", { input_shared_device_id: p.sharedDeviceId,
    input_access_entries: p.accessEntries ?? [], input_expected_device_revision: p.expectedDeviceRevision,
    input_idempotency_key: p.idempotencyKey }, { operatorSession: false }),
  revokeSession: (p) => call("revoke_routine_operator_session", { input_operator_session_id: p.operatorSessionId,
    input_reason: p.reason, input_expected_revision: p.expectedRevision,
    input_idempotency_key: p.idempotencyKey }, { operatorSession: false }),
});

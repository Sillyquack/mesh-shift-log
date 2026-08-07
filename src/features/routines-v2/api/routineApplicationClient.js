import { routineRpcClient } from "./routineRpcClient.js";
import { normalizeRoutineApplicationBootstrap } from "../data/routineApplicationModel.js";

export class RoutineApplicationClientError extends Error {
  constructor(kind, message, cause = null) {
    super(message);
    this.name = "RoutineApplicationClientError";
    this.kind = kind;
    this.cause = cause;
  }
}

export function classifyRoutineApplicationError(error) {
  const message = String(error?.message ?? error ?? "");
  const code = String(error?.code ?? "");
  if (/operator.*session|operator_auth_failed/i.test(message)) return "operator_auth_required";
  if (/does not exist|schema cache|PGRST202|PGRST204/i.test(`${code} ${message}`)) return "backend_not_ready";
  if (/row-level security|permission denied|42501/i.test(`${code} ${message}`)) return "not_authorized";
  if (/auth|required|jwt/i.test(`${code} ${message}`)) return "auth_required";
  if (/network|failed to fetch|timeout|offline/i.test(message)) return "network";
  return "backend_error";
}

async function request(name, payload = {}, options = {}) {
  const { data, error } = await routineRpcClient.request(name, payload, options);
  if (error) throw new RoutineApplicationClientError(classifyRoutineApplicationError(error), error.message, error);
  return data;
}

export async function getRoutineApplicationBootstrap() {
  return normalizeRoutineApplicationBootstrap(await request("get_routine_application_bootstrap"));
}

export async function setRoutineEngineMode({ mode, expectedRevision, reason, idempotencyKey }) {
  return request("set_routine_engine_mode", {
    input_mode: mode,
    input_expected_revision: expectedRevision,
    input_reason: reason,
    input_idempotency_key: idempotencyKey,
  }, { operatorSession: false });
}

export async function replaceRoutinePilotMemberships({ entries, expectedSettingsRevision, idempotencyKey }) {
  return request("replace_routine_pilot_memberships", {
    input_entries: entries,
    input_expected_settings_revision: expectedSettingsRevision,
    input_idempotency_key: idempotencyKey,
  }, { operatorSession: false });
}

export const getRoutinePilotAdminWorkspace = () => request("get_routine_pilot_admin_workspace", {}, { operatorSession: false });

export const registerRoutineUiClientInstance = ({ clientInstanceId, appVersion, platformLabel, idempotencyKey }) => request(
  "register_routine_client_instance",
  {
    input_client_instance_id: clientInstanceId,
    input_app_version: appVersion,
    input_offline_schema_version: "phase10j-v1",
    input_platform_label: platformLabel,
    input_idempotency_key: idempotencyKey,
  },
  { operatorSession: false },
);

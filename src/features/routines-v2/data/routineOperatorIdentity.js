export const ROUTINE_OPERATOR_SESSION_HEADER = "x-mesh-routine-operator-session";
export const ROUTINE_OPERATOR_TOKEN_VERSION = "v1";
export const ROUTINE_OPERATOR_SECRET_BYTES = 32;

export const ROUTINE_SHARED_DEVICE_STATUS = Object.freeze({ ACTIVE: "active", DISABLED: "disabled" });
export const ROUTINE_OPERATOR_STATUS = Object.freeze({ ACTIVE: "active", INACTIVE: "inactive" });
export const ROUTINE_OPERATOR_SESSION_STATUS = Object.freeze({
  ACTIVE: "active", ENDED: "ended", REVOKED: "revoked", EXPIRED: "expired",
});
export const ROUTINE_OPERATOR_ROLES = Object.freeze([
  "staff", "time2staff", "shift_lead", "event_floor_manager",
]);
export const ROUTINE_OPERATOR_CAPABILITIES = Object.freeze([
  "taskActions", "criticalActions", "runCoordination", "eventTransferActions", "offlineNoncritical",
]);
export const ROUTINE_OPERATOR_PIN_POLICY = Object.freeze({ minDigits: 6, maxDigits: 12, hashAlgorithm: "bcrypt", minimumCost: 12 });

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isRoutineOperatorUuid(value) {
  return typeof value === "string" && uuidPattern.test(value);
}

export function createSharedDeviceOperatorPrincipalKey(organizationId, deviceAuthUserId, operatorId) {
  if (![organizationId, deviceAuthUserId, operatorId].every(isRoutineOperatorUuid)) {
    throw new Error("shared_device_operator_principal_invalid");
  }
  return `${organizationId}:${deviceAuthUserId}:operator:${operatorId}`;
}

export function normalizeRoutineSharedDevice(value) {
  if (!value || typeof value !== "object") return null;
  return Object.freeze({
    id: value.id ?? value.sharedDeviceId ?? null,
    label: value.label ?? "",
    deviceKey: value.device_key ?? value.deviceKey ?? "",
    active: value.active === true,
    revision: Number(value.revision ?? 0),
    sessionPolicy: Object.freeze({ ...(value.sessionPolicy ?? value.session_policy ?? {}) }),
  });
}

export function normalizeRoutineOperator(value) {
  if (!value || typeof value !== "object") return null;
  return Object.freeze({
    id: value.id ?? value.operatorId ?? null,
    operatorKey: value.operator_key ?? value.operatorKey ?? "",
    operatorType: value.operator_type ?? value.operatorType ?? null,
    displayName: value.display_name ?? value.displayName ?? "",
    role: value.effective_role ?? value.role ?? null,
    active: value.active === true,
    linkedProfileId: value.linked_user_profile_id ?? value.linkedProfileId ?? null,
    capabilities: Object.freeze({ ...(value.capabilities ?? {}) }),
    locked: value.locked === true,
    validUntil: value.valid_until ?? value.validUntil ?? null,
  });
}

export function normalizeRoutineOperatorSession(value) {
  if (!value || typeof value !== "object") return null;
  return Object.freeze({
    id: value.id ?? value.sessionId ?? null,
    status: value.status ?? null,
    operator: normalizeRoutineOperator(value.operator ?? value),
    sharedDevice: normalizeRoutineSharedDevice(value.sharedDevice ?? value.device),
    authenticatedAt: value.authenticated_at ?? value.authenticatedAt ?? null,
    expiresAt: value.expires_at ?? value.expiresAt ?? null,
    idleExpiresAt: value.idle_expires_at ?? value.idleExpiresAt ?? null,
    lastCredentialVerifiedAt: value.last_credential_verified_at ?? value.lastCredentialVerifiedAt ?? null,
    credentialFreshUntil: value.credential_fresh_until ?? value.credentialFreshUntil ?? null,
    revision: Number(value.revision ?? 0),
  });
}

export function normalizeRoutineOperatorAdminWorkspace(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.freeze({
    devices: Object.freeze((source.devices ?? []).map(normalizeRoutineSharedDevice)),
    operators: Object.freeze((source.operators ?? []).map(normalizeRoutineOperator)),
    access: Object.freeze([...(source.access ?? [])]),
    credentials: Object.freeze([...(source.credentials ?? [])]),
    sessions: Object.freeze([...(source.sessions ?? [])]),
    lockouts: Object.freeze([...(source.lockouts ?? [])]),
    authAttemptAggregates: Object.freeze([...(source.authAttemptAggregates ?? [])]),
  });
}

export function mapRoutineOperatorAuthError(error) {
  const message = String(error?.message ?? error ?? "");
  if (/operator_reauthentication_required/i.test(message)) return "operator_reauthentication_required";
  if (/operator_auth_failed/i.test(message)) return "operator_auth_failed";
  if (/operator.*session|shared.*device/i.test(message)) return "operator_auth_required";
  if (/network|fetch|timeout/i.test(message)) return "network";
  return "operator_auth_failed";
}

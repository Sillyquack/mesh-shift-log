export const ROUTINE_OFFLINE_SCHEMA_VERSION = 3;
export const ROUTINE_OFFLINE_SCHEMA_LABEL = "phase10j-v1";
export const ROUTINE_SYNC_EVENT_LOOKBACK_DAYS = 14;
export const ROUTINE_CONFIRMED_RETENTION_DAYS = 30;
export const ROUTINE_MAX_LOCAL_PAYLOAD_BYTES = 256 * 1024;

export const RECEIPT_STATUS = Object.freeze({
  APPLIED: "applied",
  CONFLICT: "conflict",
  REJECTED: "rejected",
});

export const OUTBOX_STATUS = Object.freeze({
  QUEUED: "queued",
  SENDING: "sending",
  RETRY_WAIT: "retry_wait",
  PAUSED_AUTH: "paused_auth",
  PAUSED_OPERATOR_AUTH: "paused_operator_auth",
  CONFLICT: "conflict",
  REJECTED: "rejected",
  CONFIRMED: "confirmed",
});

export const SYNC_ENGINE_STATUS = Object.freeze({
  IDLE: "idle",
  ACQUIRING_LEADER: "acquiring_leader",
  CATCHING_UP: "catching_up",
  REFRESHING: "refreshing",
  SENDING: "sending",
  PAUSED_AUTH: "paused_auth",
  CURRENT: "current",
  OFFLINE: "offline",
  STOPPED: "stopped",
});

export const OPERATION_POLICY = Object.freeze({
  QUEUEABLE: "queueable",
  DRAFT_ONLY_OFFLINE: "draft_only_offline",
  ONLINE_ONLY: "online_only",
  REQUIRES_FRESH_SERVER_STATE: "requires_fresh_server_state",
  CRITICAL_SERVER_CONFIRMATION: "critical_server_confirmation",
});

export const CONFLICT_CODE = Object.freeze({
  STALE_REVISION: "stale_revision",
  TIMED_ACTION_REQUIRES_ONLINE: "offline_timed_action_requires_online_confirmation",
  REQUEST_HASH_MISMATCH: "request_hash_mismatch",
  SERVER_REJECTED: "server_rejected",
  AUTH_REQUIRED: "auth_required",
});

export const FORBIDDEN_LOCAL_KEYS = Object.freeze([
  "password",
  "pin",
  "pin_hash",
  "credential_hash",
  "session_secret",
  "session_secret_hash",
  "session_token",
  "x-mesh-routine-operator-session",
  "token",
  "access_token",
  "refresh_token",
  "service_role",
  "api_key",
  "alarm_code",
  "safe_code",
  "payment_data",
  "card_number",
]);

const FORBIDDEN_SET = new Set(FORBIDDEN_LOCAL_KEYS);

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

export function utf8Size(value) {
  return new TextEncoder().encode(stableStringify(value)).byteLength;
}

export function assertNoForbiddenRoutineKeys(value, path = "payload") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenRoutineKeys(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_SET.has(key.toLowerCase())) {
      throw new RoutineSyncValidationError("forbidden_sensitive_key", `${path}.${key}`);
    }
    assertNoForbiddenRoutineKeys(entry, `${path}.${key}`);
  }
}

export function assertRoutinePayloadSafe(value, maxBytes = ROUTINE_MAX_LOCAL_PAYLOAD_BYTES) {
  assertNoForbiddenRoutineKeys(value);
  const bytes = utf8Size(value);
  if (bytes > maxBytes) throw new RoutineSyncValidationError("payload_too_large", `${bytes} bytes`);
  return bytes;
}

export async function sha256Canonical(value, cryptoImpl = globalThis.crypto) {
  if (!cryptoImpl?.subtle) throw new RoutineSyncValidationError("crypto_unavailable");
  const digest = await cryptoImpl.subtle.digest("SHA-256", new TextEncoder().encode(stableStringify(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createRoutinePrincipalKey(organizationId, authUserId) {
  if (!isUuid(organizationId) || !isUuid(authUserId)) {
    throw new RoutineSyncValidationError("principal_identity_invalid");
  }
  return `${organizationId}:${authUserId}`;
}

export function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function normalizeEventCursor(value) {
  if (!value?.serverCreatedAt && !value?.eventId) return null;
  if (typeof value.serverCreatedAt !== "string" || !isUuid(value.eventId)) {
    throw new RoutineSyncValidationError("event_cursor_invalid");
  }
  return Object.freeze({ serverCreatedAt: value.serverCreatedAt, eventId: value.eventId });
}

export function normalizeOfflineReceipt(value) {
  if (!value || typeof value !== "object") return null;
  if (!Object.values(RECEIPT_STATUS).includes(value.receipt_status ?? value.receiptStatus)) {
    throw new RoutineSyncValidationError("receipt_status_invalid");
  }
  assertRoutinePayloadSafe(value, 384 * 1024);
  return Object.freeze({
    ...value,
    receiptStatus: value.receipt_status ?? value.receiptStatus,
    clientTimeAuthoritative: false,
  });
}

export function normalizeSyncHealth(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.freeze({
    activeClientInstances: Number(source.activeClientInstances ?? 0),
    lastSeenAt: source.lastSeenAt ?? null,
    receiptCounts: Object.freeze({ ...(source.receiptCounts ?? {}) }),
    lateReconciliationCount: Number(source.lateReconciliationCount ?? 0),
    affectedRunCount: Number(source.affectedRunCount ?? 0),
  });
}

export function classifyRoutineSyncError(error) {
  const message = String(error?.message ?? error ?? "");
  const code = String(error?.code ?? "");
  if (/operator.*auth|operator.*session|shared.*device/i.test(message)) return "operator_auth_required";
  if (/auth|jwt|session/i.test(message) || code === "PGRST301") return "auth_required";
  if (/offline_timed_action_requires_online_confirmation/i.test(message)) return "timed_action_requires_online_confirmation";
  if (code === "40001" || /stale|revision conflict/i.test(message)) return "stale_conflict";
  if (/network|fetch|timeout|aborted/i.test(message)) return "network";
  if (/rejected|permission|not authorized|forbidden/i.test(message) || code === "42501") return "server_rejected";
  return "unknown_outcome";
}

export function retryDelayMs(attempt, random = Math.random) {
  const boundedAttempt = Math.max(0, Math.min(Number(attempt) || 0, 8));
  const base = Math.min(60_000, 1_000 * 2 ** boundedAttempt);
  return Math.round(base * (0.85 + Math.max(0, Math.min(1, random())) * 0.3));
}

export function buildRoutinePendingOverlay({ serverState, draft = null, outboxRecord = null }) {
  const status = outboxRecord?.status ?? (draft ? "draft" : "confirmed");
  return Object.freeze({
    serverState,
    pending: draft || outboxRecord ? { status, draft, operation: outboxRecord } : null,
    serverConfirmed: status === OUTBOX_STATUS.CONFIRMED || (!draft && !outboxRecord),
    conflict: status === OUTBOX_STATUS.CONFLICT
      ? { serverState, localDraft: draft, operation: outboxRecord }
      : null,
  });
}

export class RoutineSyncValidationError extends Error {
  constructor(code, detail = "") {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "RoutineSyncValidationError";
    this.code = code;
  }
}

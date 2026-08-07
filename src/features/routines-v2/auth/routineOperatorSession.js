import {
  ROUTINE_OPERATOR_SECRET_BYTES,
  ROUTINE_OPERATOR_TOKEN_VERSION,
  createSharedDeviceOperatorPrincipalKey,
} from "../data/routineOperatorIdentity.js";

const STORAGE_KEY = "mesh:routine:operator-session:v1";
const TOKEN_PATTERN = /^v1\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/i;
let memorySession = null;

function encodeBase64Url(bytes) {
  let binary = "";
  bytes.forEach((value) => { binary += String.fromCharCode(value); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function sessionStorageOrNull(storage) {
  if (storage !== undefined) return storage ?? null;
  try { return globalThis.sessionStorage ?? null; } catch { return null; }
}

function assertSafeSessionMetadata(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:pin|pin_hash|credential_hash|session_secret|session_secret_hash|session_token|token|access_token|refresh_token)$/i.test(key)) {
      throw new Error("operator_session_metadata_sensitive");
    }
    assertSafeSessionMetadata(entry);
  }
}

export async function createRoutineOperatorSessionMaterial(cryptoImpl = globalThis.crypto) {
  if (!cryptoImpl?.randomUUID || !cryptoImpl?.getRandomValues || !cryptoImpl?.subtle) {
    throw new Error("operator_session_crypto_unavailable");
  }
  const sessionId = cryptoImpl.randomUUID();
  const secretBytes = cryptoImpl.getRandomValues(new Uint8Array(ROUTINE_OPERATOR_SECRET_BYTES));
  const digest = await cryptoImpl.subtle.digest("SHA-256", secretBytes);
  const secretHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const token = `${ROUTINE_OPERATOR_TOKEN_VERSION}.${sessionId}.${encodeBase64Url(secretBytes)}`;
  secretBytes.fill(0);
  return Object.freeze({ sessionId, secretHash, token });
}

export function setRoutineOperatorSession({ token, organizationId, deviceAuthUserId, operatorId, sessionMetadata }, {
  storage = sessionStorageOrNull(), persist = true,
} = {}) {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) {
    throw new Error("operator_session_token_invalid");
  }
  assertSafeSessionMetadata(sessionMetadata);
  const principalKey = createSharedDeviceOperatorPrincipalKey(organizationId, deviceAuthUserId, operatorId);
  memorySession = Object.freeze({ token, organizationId, deviceAuthUserId, operatorId, principalKey,
    sessionMetadata: Object.freeze({ ...(sessionMetadata ?? {}) }) });
  if (persist && storage) storage.setItem(STORAGE_KEY, JSON.stringify(memorySession));
  return getRoutineOperatorPrincipalMetadata();
}

export function restoreRoutineOperatorSession({ storage = sessionStorageOrNull() } = {}) {
  if (memorySession) return getRoutineOperatorPrincipalMetadata();
  const serialized = storage?.getItem(STORAGE_KEY);
  if (!serialized) return null;
  try {
    const value = JSON.parse(serialized);
    setRoutineOperatorSession(value, { storage, persist: false });
    return getRoutineOperatorPrincipalMetadata();
  } catch {
    storage?.removeItem(STORAGE_KEY);
    return null;
  }
}

export function getRoutineOperatorSessionToken() {
  restoreRoutineOperatorSession();
  return memorySession?.token ?? null;
}

export function getRoutineOperatorPrincipalMetadata() {
  if (!memorySession) return null;
  const { organizationId, deviceAuthUserId, operatorId, principalKey, sessionMetadata } = memorySession;
  return Object.freeze({ organizationId, deviceAuthUserId, operatorId, principalKey, sessionMetadata });
}

export function clearRoutineOperatorSession({ storage = sessionStorageOrNull() } = {}) {
  memorySession = null;
  storage?.removeItem(STORAGE_KEY);
}

export function routineOperatorSessionStorageKey() { return STORAGE_KEY; }

export function clearRoutineOperatorSessionForAuthPrincipal(authUserId, options) {
  if (memorySession && memorySession.deviceAuthUserId !== authUserId) clearRoutineOperatorSession(options);
  return getRoutineOperatorPrincipalMetadata();
}

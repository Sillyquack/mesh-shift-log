import { useCallback, useEffect, useMemo, useState } from "react";
import {
  authenticateRoutineOperator,
  endRoutineOperatorSession,
  getCurrentRoutineOperatorSession,
  getRoutineSharedDeviceContext,
  listAvailableRoutineOperators,
} from "../api/routineOperatorClient.js";
import { registerRoutineUiClientInstance } from "../api/routineApplicationClient.js";
import { clearRoutineOperatorSession, getRoutineOperatorPrincipalMetadata } from "../auth/routineOperatorSession.js";
import { openRoutineOfflineDb, restoreRoutineOfflineDataForPrincipal } from "../offline/routineOfflineDb.js";

const CLIENT_INSTANCE_KEY = "mesh:routine:ui-client-instance:v1";

function sessionStorageOrNull() {
  try { return globalThis.sessionStorage ?? null; } catch { return null; }
}

function ensureClientIdentity(cryptoImpl = globalThis.crypto, storage = sessionStorageOrNull()) {
  const stored = storage?.getItem(CLIENT_INSTANCE_KEY);
  if (stored) {
    try {
      const value = JSON.parse(stored);
      if (value.clientInstanceId && value.idempotencyKey) return value;
    } catch { storage?.removeItem(CLIENT_INSTANCE_KEY); }
  }
  const value = { clientInstanceId: cryptoImpl.randomUUID(), idempotencyKey: cryptoImpl.randomUUID() };
  storage?.setItem(CLIENT_INSTANCE_KEY, JSON.stringify(value));
  return value;
}

const defaultApi = Object.freeze({
  authenticate: authenticateRoutineOperator,
  endSession: endRoutineOperatorSession,
  getCurrentSession: getCurrentRoutineOperatorSession,
  getDeviceContext: getRoutineSharedDeviceContext,
  listOperators: listAvailableRoutineOperators,
  registerClient: registerRoutineUiClientInstance,
});

async function restorePrincipalDrafts() {
  const principal = getRoutineOperatorPrincipalMetadata();
  if (!principal?.principalKey) return;
  const db = await openRoutineOfflineDb();
  try { await restoreRoutineOfflineDataForPrincipal(db, principal.principalKey); } finally { db.close(); }
}

export function useRoutineOperatorIdentity({ enabled = true, api = defaultApi, cryptoImpl = globalThis.crypto,
  organizationId = null, deviceAuthUserId = null } = {}) {
  const [state, setState] = useState({ status: enabled ? "loading" : "idle", device: null, operators: [], session: null, error: null });
  const clientIdentity = useMemo(() => enabled ? ensureClientIdentity(cryptoImpl) : null, [enabled, cryptoImpl]);

  const load = useCallback(async () => {
    if (!enabled || !clientIdentity) return;
    setState((current) => ({ ...current, status: "loading", error: null }));
    try {
      const deviceResult = await api.getDeviceContext();
      if (!deviceResult.ok) throw deviceResult.error ?? new Error(deviceResult.errorCode);
      await api.registerClient({ ...clientIdentity, appVersion: "phase10k1-v1", platformLabel: "routine-ui-shell" });
      const currentResult = await api.getCurrentSession();
      const session = currentResult.ok ? currentResult.data : null;
      if (!session && getRoutineOperatorPrincipalMetadata()) clearRoutineOperatorSession();
      const listResult = await api.listOperators(clientIdentity.clientInstanceId);
      if (!listResult.ok) throw listResult.error ?? new Error(listResult.errorCode);
      setState({ status: "ready", device: deviceResult.data, operators: listResult.data, session, error: null });
    } catch (error) {
      setState((current) => ({ ...current, status: "error", error }));
    }
  }, [api, clientIdentity, enabled]);

  useEffect(() => { if (enabled) void load(); }, [enabled, load]);

  const authenticate = useCallback(async ({ operatorId, pin }) => {
    if (!clientIdentity) return { ok: false, errorCode: "operator_auth_failed" };
    setState((current) => ({ ...current, status: "authenticating", error: null }));
    const result = await api.authenticate({ clientInstanceId: clientIdentity.clientInstanceId, operatorId, pin,
      idempotencyKey: cryptoImpl.randomUUID(), organizationId, deviceAuthUserId });
    if (!result.ok) {
      setState((current) => ({ ...current, status: "ready", error: result.error ?? new Error(result.errorCode) }));
      return result;
    }
    await restorePrincipalDrafts().catch(() => {});
    setState((current) => ({ ...current, status: "ready", session: result.data, error: null }));
    return result;
  }, [api, clientIdentity, cryptoImpl, deviceAuthUserId, organizationId]);

  const endSession = useCallback(async (reason = "Operator ended the Routine Engine session.") => {
    setState((current) => ({ ...current, status: "ending" }));
    try { await api.endSession(reason, cryptoImpl.randomUUID()); } finally {
      clearRoutineOperatorSession();
      setState((current) => ({ ...current, status: "ready", session: null }));
    }
  }, [api, cryptoImpl]);

  return Object.freeze({ ...state, clientInstanceId: clientIdentity?.clientInstanceId ?? null, authenticate, endSession, switchOperator: endSession, refresh: load });
}

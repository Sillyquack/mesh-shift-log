import { useCallback, useEffect, useRef, useState } from "react";
import { getDoubleShiftActionContext, routineEmployeeDoubleShiftMutations } from "../api/routineEmployeeClient.js";

export function useRoutineDoubleShiftWorkspace(bundleId, { loader = getDoubleShiftActionContext, api = routineEmployeeDoubleShiftMutations, refreshSignal = 0 } = {}) {
  const [state, setState] = useState({ status: bundleId ? "loading" : "idle", data: null, error: null, pending: null });
  const retryKeys = useRef(new Map()); const busy = useRef(false); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refresh = useCallback(async () => {
    if (!bundleId) return null;
    try { const data = await loader(bundleId); if (mounted.current) setState((current) => ({ ...current, status: "ready", data, error: null })); return data; }
    catch (error) { if (mounted.current) setState((current) => ({ ...current, status: "error", error })); return null; }
  }, [bundleId, loader]);
  useEffect(() => { void refresh(); }, [refresh, refreshSignal]);
  const execute = useCallback(async (action, payload) => {
    if (busy.current || typeof api[action] !== "function") return { ok: false, mode: "busy" };
    const operation = `${action}:${payload?.bundleId ?? bundleId ?? "bundle"}`; const idempotencyKey = payload?.idempotencyKey
      ?? retryKeys.current.get(operation) ?? globalThis.crypto.randomUUID();
    retryKeys.current.set(operation, idempotencyKey); busy.current = true; if (mounted.current) setState((current) => ({ ...current, pending: action }));
    try { const response = await api[action]({ ...payload, idempotencyKey });
      if (response?.ok) { retryKeys.current.delete(operation); await refresh(); }
      else if (mounted.current) setState((current) => ({ ...current, error: response })); return response; }
    catch (error) { if (mounted.current) setState((current) => ({ ...current, error })); return { ok: false, mode: "network_error", error, message: String(error?.message ?? error) }; }
    finally { busy.current = false; if (mounted.current) setState((current) => ({ ...current, pending: null })); }
  }, [api, bundleId, refresh]);
  return Object.freeze({ ...state, refresh, execute });
}

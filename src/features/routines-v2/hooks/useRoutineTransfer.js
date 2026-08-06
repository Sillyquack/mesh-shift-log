import { useCallback, useEffect, useRef, useState } from "react";
import { getRoutineTransferActionContext, routineEmployeeTransferMutations } from "../api/routineEmployeeClient.js";

export function useRoutineTransfer(transferId, { loader = getRoutineTransferActionContext, api = routineEmployeeTransferMutations } = {}) {
  const [state, setState] = useState({ context: null, pending: null, error: null }); const retryKeys = useRef(new Map()); const busy = useRef(false); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refresh = useCallback(async () => { if (!transferId) return null; try { const context = await loader(transferId); if (mounted.current) setState((current) => ({ ...current, context, error: null })); return context; } catch (error) { if (mounted.current) setState((current) => ({ ...current, error })); return null; } }, [loader, transferId]);
  useEffect(() => { void refresh(); }, [refresh]);
  const execute = useCallback(async (action, payload = {}) => { if (busy.current || typeof api[action] !== "function") return { ok: false, mode: "busy" };
    const operation = `${action}:${payload.transferId ?? "transfer"}`; const idempotencyKey = retryKeys.current.get(operation) ?? globalThis.crypto.randomUUID();
    retryKeys.current.set(operation, idempotencyKey); busy.current = true; if (mounted.current) setState((current) => ({ ...current, pending: action }));
    try { const response = await api[action]({ ...payload, idempotencyKey }); if (response?.ok) { retryKeys.current.delete(operation); await refresh(); }
      else if (mounted.current) setState((current) => ({ ...current, error: response })); return response; }
    catch (error) { if (mounted.current) setState((current) => ({ ...current, error })); return { ok: false, mode: "network_error", error, message: String(error?.message ?? error) }; }
    finally { busy.current = false; if (mounted.current) setState((current) => ({ ...current, pending: null })); } }, [api, refresh]);
  return Object.freeze({ ...state, refresh, execute });
}

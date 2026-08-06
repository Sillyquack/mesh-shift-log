import { useCallback, useEffect, useRef, useState } from "react";
import { getRoutineHandoverActionContext, routineEmployeeHandoverMutations } from "../api/routineEmployeeClient.js";

export function useRoutineHandover(handoverId, { loader = getRoutineHandoverActionContext, api = routineEmployeeHandoverMutations } = {}) {
  const [context, setContext] = useState(null); const [pending, setPending] = useState(null); const [error, setError] = useState(null);
  const keys = useRef(new Map()); const busy = useRef(false); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refresh = useCallback(async () => { if (!handoverId) return null; try { const value = await loader(handoverId); if (mounted.current) { setContext(value); setError(null); } return value; } catch (cause) { if (mounted.current) setError(cause); return null; } }, [handoverId, loader]);
  useEffect(() => { void refresh(); }, [refresh]);
  const execute = useCallback(async (action, payload = {}) => { if (busy.current || typeof api[action] !== "function") return { ok: false, mode: "busy" };
    const operation = `${action}:${payload.handoverId ?? payload.fromRunId ?? "handover"}`; const idempotencyKey = keys.current.get(operation) ?? globalThis.crypto.randomUUID();
    keys.current.set(operation, idempotencyKey); busy.current = true; if (mounted.current) setPending(action);
    try { const response = await api[action]({ ...payload, idempotencyKey }); if (response?.ok) { keys.current.delete(operation); if (mounted.current) setError(null); await refresh(); }
      else if (mounted.current) setError(response); return response; }
    catch (cause) { if (mounted.current) setError(cause); return { ok: false, mode: "network_error", error: cause, message: String(cause?.message ?? cause) }; }
    finally { busy.current = false; if (mounted.current) setPending(null); } }, [api, refresh]);
  return Object.freeze({ context, pending, error, refresh, execute });
}

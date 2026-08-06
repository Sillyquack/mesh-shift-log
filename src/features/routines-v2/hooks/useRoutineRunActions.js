import { useCallback, useEffect, useRef, useState } from "react";
import { routineEmployeeRunMutations } from "../api/routineEmployeeClient.js";

export function useRoutineRunActions({ api = routineEmployeeRunMutations, onConfirmed } = {}) {
  const keys = useRef(new Map()); const busy = useRef(false); const mounted = useRef(true);
  const [pending, setPending] = useState(null);
  const [result, setResult] = useState(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const execute = useCallback(async (action, payload) => {
    if (busy.current || typeof api[action] !== "function") return { ok: false, mode: "busy" };
    const operation = `${action}:${payload?.runId ?? "run"}`;
    const idempotencyKey = keys.current.get(operation) ?? globalThis.crypto.randomUUID();
    keys.current.set(operation, idempotencyKey); busy.current = true;
    if (mounted.current) setPending(action);
    try {
      const response = await api[action]({ ...payload, idempotencyKey });
      if (mounted.current) setResult(response);
      if (response?.ok) { keys.current.delete(operation); if (mounted.current) await onConfirmed?.(response.data); }
      return response;
    } catch (error) {
      const response = { ok: false, mode: "network_error", error, message: String(error?.message ?? error) };
      if (mounted.current) setResult(response);
      return response;
    } finally { busy.current = false; if (mounted.current) setPending(null); }
  }, [api, onConfirmed]);
  return Object.freeze({ execute, pending, result });
}

import { useCallback, useEffect, useRef, useState } from "react";
import { routineEmployeeTaskMutations } from "../api/routineEmployeeClient.js";

export function useRoutineTaskAction({ api = routineEmployeeTaskMutations, onConfirmed } = {}) {
  const keys = useRef(new Map()); const busy = useRef(false); const mounted = useRef(true);
  const [pendingAction, setPendingAction] = useState(null);
  const [result, setResult] = useState(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const run = useCallback(async (action, payload = {}) => {
    if (busy.current || typeof api[action] !== "function") return { ok: false, mode: "busy" };
    const operation = `${action}:${payload.taskId ?? payload.taskItemId ?? payload.deviationId ?? "task"}`;
    const idempotencyKey = keys.current.get(operation) ?? globalThis.crypto.randomUUID();
    keys.current.set(operation, idempotencyKey);
    busy.current = true; if (mounted.current) setPendingAction(action);
    try {
      const response = await api[action]({ ...payload, idempotencyKey });
      if (mounted.current) setResult(response);
      if (response?.ok) {
        keys.current.delete(operation);
        if (mounted.current) await onConfirmed?.(response.data);
      }
      return response;
    } catch (error) {
      const response = { ok: false, mode: "network_error", error, message: String(error?.message ?? error) };
      if (mounted.current) setResult(response);
      return response;
    } finally {
      busy.current = false; if (mounted.current) setPendingAction(null);
    }
  }, [api, onConfirmed]);
  const abandonRetry = useCallback((action, resourceId = "task") => keys.current.delete(`${action}:${resourceId}`), []);
  return Object.freeze({ run, pendingAction, result, abandonRetry });
}

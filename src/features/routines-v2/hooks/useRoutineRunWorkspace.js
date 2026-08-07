import { useCallback, useEffect, useRef, useState } from "react";
import { getRoutineRunActionContext } from "../api/routineEmployeeClient.js";

export function useRoutineRunWorkspace(runId, { loader = getRoutineRunActionContext, subscribe, refreshSignal = 0 } = {}) {
  const mounted = useRef(true);
  const [state, setState] = useState({ status: runId ? "loading" : "idle", data: null, error: null });
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const refresh = useCallback(async () => {
    if (!runId) return null;
    setState((current) => ({ ...current, status: current.data ? "refreshing" : "loading", error: null }));
    try {
      const data = await loader(runId);
      if (mounted.current) setState({ status: "ready", data, error: null });
      return data;
    } catch (error) {
      if (mounted.current) setState((current) => ({ ...current, status: "error", error }));
      return null;
    }
  }, [loader, runId]);
  useEffect(() => { void refresh(); }, [refresh, refreshSignal]);
  useEffect(() => {
    if (!runId || !subscribe) return undefined;
    const subscription = subscribe({ runIds: [runId], onEvent: refresh, cursorPolling: true });
    return typeof subscription === "function" ? subscription : () => subscription?.unsubscribe?.();
  }, [refresh, runId, subscribe]);
  return Object.freeze({ ...state, refresh });
}

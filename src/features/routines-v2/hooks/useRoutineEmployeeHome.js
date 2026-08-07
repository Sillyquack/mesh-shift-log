import { useCallback, useEffect, useRef, useState } from "react";
import { getRoutineEmployeeHome } from "../api/routineEmployeeClient.js";

export function useRoutineEmployeeHome({ enabled = true, loader = getRoutineEmployeeHome, refreshSignal = 0 } = {}) {
  const mounted = useRef(true);
  const [state, setState] = useState({ status: enabled ? "loading" : "idle", data: null, error: null });
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const refresh = useCallback(async () => {
    if (!enabled) return null;
    setState((current) => ({ ...current, status: current.data ? "refreshing" : "loading", error: null }));
    try {
      const data = await loader();
      if (mounted.current) setState({ status: "ready", data, error: null });
      return data;
    } catch (error) {
      if (mounted.current) setState((current) => ({ ...current, status: "error", error }));
      return null;
    }
  }, [enabled, loader]);
  useEffect(() => { if (enabled) void refresh(); }, [enabled, refresh, refreshSignal]);
  return Object.freeze({ ...state, refresh });
}

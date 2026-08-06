import { useCallback, useEffect, useRef, useState } from "react";
import { getRoutineApplicationBootstrap } from "../api/routineApplicationClient.js";

export function useRoutineApplicationBootstrap({ enabled = true, loader = getRoutineApplicationBootstrap } = {}) {
  const mounted = useRef(true);
  const [state, setState] = useState({ status: enabled ? "loading" : "idle", data: null, error: null });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return null;
    setState((current) => ({ ...current, status: current.data ? "refreshing" : "loading", error: null }));
    try {
      const data = await loader();
      if (mounted.current) setState({ status: "ready", data, error: null });
      return data;
    } catch (error) {
      if (mounted.current) setState({ status: "error", data: null, error });
      return null;
    }
  }, [enabled, loader]);

  useEffect(() => { if (enabled) void refresh(); else setState({ status: "idle", data: null, error: null }); }, [enabled, refresh]);
  return Object.freeze({ ...state, refresh });
}

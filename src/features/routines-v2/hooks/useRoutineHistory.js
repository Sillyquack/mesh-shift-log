import { useCallback, useEffect, useRef, useState } from "react";
import { listRoutineV2History } from "../api/routineHistoryClient.js";
import { historyError } from "../data/routineHistoryModel.js";

export function useRoutineHistory({ filters, loader = listRoutineV2History, enabled = true }) {
  const [state, setState] = useState({ status: enabled ? "loading" : "idle", data: null, error: null });
  const request = useRef(0);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const current = ++request.current;
    setState((value) => ({ ...value, status: "loading", error: null }));
    try { const data = await loader(filters); if (current === request.current) setState({ status: "ready", data, error: null }); }
    catch (error) { if (current === request.current) setState((value) => ({ ...value, status: "error", error: historyError(error) })); }
  }, [enabled, filters, loader]);
  useEffect(() => { refresh(); return () => { request.current += 1; }; }, [refresh]);
  return { ...state, refresh };
}

import { useCallback, useEffect, useRef, useState } from "react";
import { getRoutinePilotReadiness } from "../api/routineReleaseClient.js";

export function useRoutineReleaseGate({ loader = getRoutinePilotReadiness } = {}) {
  const [state, setState] = useState({ status: "loading", data: null, error: null });
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++request.current;
    setState((value) => ({ ...value, status: "loading", error: null }));
    try { const data = await loader(); if (current === request.current) setState({ status: "ready", data, error: null }); }
    catch (error) { if (current === request.current) setState((value) => ({ ...value, status: "error", error })); }
  }, [loader]);
  useEffect(() => { refresh(); return () => { request.current += 1; }; }, [refresh]);
  return { ...state, refresh };
}

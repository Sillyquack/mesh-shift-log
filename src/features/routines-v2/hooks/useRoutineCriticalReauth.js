import { useCallback, useEffect, useRef, useState } from "react";
import { reauthenticateRoutineOperatorSession } from "../api/routineEmployeeClient.js";

export function useRoutineCriticalReauth({ api = reauthenticateRoutineOperatorSession } = {}) {
  const [state, setState] = useState({ pending: false, error: null, lockout: null });
  const mounted = useRef(true); useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const reauthenticate = useCallback(async (pin) => {
    if (mounted.current) setState({ pending: true, error: null, lockout: null });
    try {
      const response = await api(pin, globalThis.crypto.randomUUID());
      if (!response?.ok && mounted.current) setState({ pending: false, error: "Authentication failed. Try again or ask a shift lead.", lockout: response?.data?.lockedUntil ?? null });
      else if (mounted.current) setState({ pending: false, error: null, lockout: null });
      return response;
    } catch (error) {
      if (mounted.current) setState({ pending: false, error: "Authentication failed. Try again or ask a shift lead.", lockout: null });
      return { ok: false, error };
    }
  }, [api]);
  return Object.freeze({ ...state, reauthenticate });
}

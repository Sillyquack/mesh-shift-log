import { useEffect, useState } from "react";
import { supabaseAuthClient } from "../../../lib/supabaseAuthClient.js";
import { ROUTINE_REALTIME_MODE, subscribeRoutineRealtime } from "../realtime/routineRealtime.js";

export function useRoutineEngineSync({ open, bootstrap, onRefresh, subscribe = subscribeRoutineRealtime } = {}) {
  const [status, setStatus] = useState({ status: "disabled", mode: "disabled" });
  const previewAllowed = bootstrap?.previewAllowed === true;
  const organizationId = bootstrap?.organizationId;
  const actorSource = bootstrap?.identity?.actorSource;
  const effectiveOperatorId = bootstrap?.identity?.effectiveOperatorId;
  const operatorSessionId = bootstrap?.identity?.session?.id || bootstrap?.identity?.operatorSessionId;
  const personalPrincipal = actorSource === "personal_auth";
  const sharedPrincipal = actorSource === "shared_device_operator" && Boolean(effectiveOperatorId && operatorSessionId);
  const mode = bootstrap?.sync?.cursorPollingRequired ? ROUTINE_REALTIME_MODE.CURSOR_POLLING : ROUTINE_REALTIME_MODE.POSTGRES_REALTIME;
  useEffect(() => {
    if (!open || !previewAllowed || !organizationId || (!personalPrincipal && !sharedPrincipal)) {
      setStatus({ status: "disabled", mode: "disabled" });
      return undefined;
    }
    setStatus({ status: "connecting", mode });
    const subscription = subscribe({
      organizationId,
      enabled: true,
      mode,
      client: supabaseAuthClient,
      BroadcastChannelImpl: mode === ROUTINE_REALTIME_MODE.CURSOR_POLLING ? null : globalThis.BroadcastChannel,
      onSignal: async () => { await onRefresh?.(); },
      onStatus: (next) => setStatus({ ...next, mode }),
    });
    return () => { subscription.unsubscribe(); };
  }, [mode, onRefresh, open, organizationId, personalPrincipal, previewAllowed, sharedPrincipal, subscribe]);
  return status;
}

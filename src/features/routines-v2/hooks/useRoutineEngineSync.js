import { useEffect, useState } from "react";
import { supabaseAuthClient } from "../../../lib/supabaseAuthClient.js";
import { ROUTINE_REALTIME_MODE, subscribeRoutineRealtime } from "../realtime/routineRealtime.js";

export function useRoutineEngineSync({ open, bootstrap, onRefresh, subscribe = subscribeRoutineRealtime } = {}) {
  const [status, setStatus] = useState({ status: "disabled", mode: "disabled" });
  useEffect(() => {
    const personalPrincipal = bootstrap?.identity?.actorSource === "personal_auth";
    const sharedPrincipal = bootstrap?.identity?.actorSource === "shared_device_operator"
      && Boolean(bootstrap?.identity?.effectiveOperatorId && (bootstrap?.identity?.session?.id || bootstrap?.identity?.operatorSessionId));
    if (!open || !bootstrap?.previewAllowed || !bootstrap.organizationId || (!personalPrincipal && !sharedPrincipal)) {
      setStatus({ status: "disabled", mode: "disabled" });
      return undefined;
    }
    const mode = bootstrap.sync.cursorPollingRequired
      ? ROUTINE_REALTIME_MODE.CURSOR_POLLING
      : ROUTINE_REALTIME_MODE.POSTGRES_REALTIME;
    setStatus({ status: "connecting", mode });
    const subscription = subscribe({
      organizationId: bootstrap.organizationId,
      enabled: true,
      mode,
      client: supabaseAuthClient,
      BroadcastChannelImpl: mode === ROUTINE_REALTIME_MODE.CURSOR_POLLING ? null : globalThis.BroadcastChannel,
      onSignal: async () => { await onRefresh?.(); },
      onStatus: (next) => setStatus({ ...next, mode }),
    });
    return () => { subscription.unsubscribe(); };
  }, [bootstrap, onRefresh, open, subscribe]);
  return status;
}

export const ROUTINE_REALTIME_MODE = Object.freeze({
  POSTGRES_REALTIME: "postgres_realtime",
  CURSOR_POLLING: "cursor_polling",
  DISABLED: "disabled",
});

function safeStatusDetail(detail) {
  const { error, ...rest } = detail ?? {};
  return error ? { ...rest, error: { kind: error?.kind ?? "unknown", code: error?.code ?? null } } : rest;
}

export function subscribeRoutineRealtime({
  organizationId,
  visibleRunIds = [],
  visibleBundleIds = [],
  enabled = true,
  onSignal = () => {},
  onStatus = () => {},
  debounceMs = 200,
  client,
  BroadcastChannelImpl = globalThis.BroadcastChannel,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
  mode = ROUTINE_REALTIME_MODE.POSTGRES_REALTIME,
  pollIntervalMs = 15_000,
  windowImpl = globalThis.window,
} = {}) {
  if (!enabled || mode === ROUTINE_REALTIME_MODE.DISABLED || !organizationId) return { unsubscribe() {}, channel: null, mode: ROUTINE_REALTIME_MODE.DISABLED };
  const runIds = new Set(visibleRunIds);
  const bundleIds = new Set(visibleBundleIds);
  const seen = new Set();
  const pending = new Map();
  let timer = null;
  let closed = false;
  let subscribedOnce = false;
  const broadcast = BroadcastChannelImpl ? new BroadcastChannelImpl(`mesh-routine-sync:${organizationId}`) : null;
  if (broadcast) broadcast.onmessage = (message) => {
    if (!closed && message.data?.kind === "routine_sync_status") onStatus({ ...message.data, remote: true });
  };

  const emitStatus = (status, detail = {}) => {
    if (closed) return;
    const safeDetail = safeStatusDetail(detail);
    onStatus({ status, ...safeDetail });
    broadcast?.postMessage({ kind: "routine_sync_status", status, ...safeDetail });
  };

  const catchUp = async (reason) => {
    emitStatus("catching_up", { reason });
    try {
      await onSignal({ kind: "cursor_catch_up", reason });
      emitStatus("current", { reason });
    } catch (error) {
      emitStatus("catch_up_failed", { reason, error });
    }
  };

  if (mode === ROUTINE_REALTIME_MODE.CURSOR_POLLING) {
    let pollTimer = null;
    const schedule = () => {
      if (!closed) pollTimer = setTimer(async () => { await catchUp("interval"); schedule(); }, Math.max(5_000, pollIntervalMs));
    };
    const focus = () => { if (!closed) void catchUp("focus"); };
    const online = () => { if (!closed) void catchUp("reconnect"); };
    windowImpl?.addEventListener?.("focus", focus);
    windowImpl?.addEventListener?.("online", online);
    void catchUp("session_start").finally(schedule);
    return {
      channel: null,
      mode,
      unsubscribe() {
        if (closed) return;
        closed = true;
        if (pollTimer !== null) clearTimer(pollTimer);
        windowImpl?.removeEventListener?.("focus", focus);
        windowImpl?.removeEventListener?.("online", online);
        broadcast?.close();
      },
    };
  }
  if (!client) return { unsubscribe() {}, channel: null, mode: ROUTINE_REALTIME_MODE.DISABLED };

  const flush = () => {
    timer = null;
    if (closed || !pending.size) return;
    const signals = [...pending.values()];
    pending.clear();
    onSignal({ kind: "realtime_signal", events: signals });
  };

  const queueSignal = (payload) => {
    const event = payload?.new;
    if (!event?.id || event.organization_id !== organizationId || seen.has(event.id)) return;
    const hasScopeFilter = runIds.size > 0 || bundleIds.size > 0;
    if (hasScopeFilter && !runIds.has(event.run_id) && !bundleIds.has(event.bundle_id)) return;
    seen.add(event.id);
    if (seen.size > 2_000) seen.delete(seen.values().next().value);
    pending.set(event.id, Object.freeze({
      id: event.id,
      runId: event.run_id ?? null,
      bundleId: event.bundle_id ?? null,
      taskId: event.task_id ?? null,
      serverCreatedAt: event.server_created_at,
    }));
    if (timer === null) timer = setTimer(flush, Math.max(0, debounceMs));
  };

  const channel = client
    .channel(`routine-events:${organizationId}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "routine_events",
      filter: `organization_id=eq.${organizationId}`,
    }, queueSignal)
    .subscribe((status) => {
      if (closed) return;
      if (status === "SUBSCRIBED") {
        const reason = subscribedOnce ? "reconnect" : "subscribed";
        subscribedOnce = true;
        void catchUp(reason);
      } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
        emitStatus("disconnected", { transportStatus: status });
      } else emitStatus("connecting", { transportStatus: status });
    });

  return {
    channel,
    mode,
    unsubscribe() {
      if (closed) return;
      closed = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
      pending.clear();
      broadcast?.close();
      client.removeChannel(channel);
    },
  };
}

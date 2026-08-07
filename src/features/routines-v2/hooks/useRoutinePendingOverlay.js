import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoutineSyncEngine } from "../offline/routineSyncEngine.js";
import { createRoutineOperationAfterConflict, enqueueRoutineOperation } from "../offline/routineOutbox.js";
import { deleteRoutineOutboxRecord, getRoutineMeta, listRoutineOutbox, openRoutineOfflineDb } from "../offline/routineOfflineDb.js";
import { createRoutinePrincipalKey, OUTBOX_STATUS } from "../data/routineSyncModel.js";
import { createSharedDeviceOperatorPrincipalKey } from "../data/routineOperatorIdentity.js";
import { routineSyncClient } from "../api/routineSyncClient.js";

const visibleState = (status) => ({ retry_wait: "sync_pending", paused_auth: "auth_required",
  paused_operator_auth: "operator_auth_required", confirmed: "server_confirmed" })[status] ?? status;

export function useRoutinePendingOverlay({ identity, enabled = false, onAuthoritativeRefresh } = {}) {
  const [records, setRecords] = useState([]); const [localEntries, setLocalEntries] = useState([]); const engine = useRef(null); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const organizationId = identity?.organizationId; const authUserId = identity?.actorAuthUserId;
  const operatorId = identity?.actorSource === "shared_device_operator" ? identity?.effectiveOperatorId : null;
  const principalKey = useMemo(() => {
    if (!organizationId || !authUserId) return null;
    try { return operatorId ? createSharedDeviceOperatorPrincipalKey(organizationId, authUserId, operatorId)
      : createRoutinePrincipalKey(organizationId, authUserId); } catch { return null; }
  }, [authUserId, operatorId, organizationId]);
  const clientPrincipalKey = useMemo(() => {
    if (!organizationId || !authUserId) return null;
    try { return createRoutinePrincipalKey(organizationId, authUserId); } catch { return null; }
  }, [authUserId, organizationId]);
  const refresh = useCallback(async () => {
    if (!enabled || !principalKey) { if (mounted.current) setRecords([]); return []; }
    try { const db = await openRoutineOfflineDb(); const next = await listRoutineOutbox(db, principalKey); if (mounted.current) setRecords(next); return next; }
    catch { return []; }
  }, [enabled, principalKey]);
  useEffect(() => {
    if (!enabled || !principalKey || !clientPrincipalKey) return undefined;
    let active = true;
    const instance = createRoutineSyncEngine({ resolvePrincipal: async () => ({ organizationId, authUserId,
      actorSource: identity.actorSource, operatorId }), syncClient: routineSyncClient,
    refreshAuthoritative: async (detail) => { await onAuthoritativeRefresh?.(detail); if (active) await refresh(); },
    appVersion: "phase10k3-v1", platformLabel: "routine-employee-workflow", onStatus: () => { if (active) void refresh(); } });
    engine.current = instance; void instance.start().finally(() => { if (active) void refresh(); });
    const online = () => instance.wake(); globalThis.addEventListener?.("online", online);
    return () => { active = false; globalThis.removeEventListener?.("online", online); instance.stop(); if (engine.current === instance) engine.current = null; };
  }, [authUserId, clientPrincipalKey, enabled, identity?.actorSource, onAuthoritativeRefresh, operatorId, organizationId, principalKey, refresh]);
  const queueTaskBundle = useCallback(async ({ payload, runId, timed = false, critical = false }) => {
    if (!enabled || !principalKey || !clientPrincipalKey) return { ok: false, mode: "offline_not_available" };
    try {
      await engine.current?.runOnce(); const db = await openRoutineOfflineDb(); const client = await getRoutineMeta(db, clientPrincipalKey, "client_instance");
      if (!client?.clientInstanceId) return { ok: false, mode: "offline_not_ready", message: "Offline sync is still preparing." };
      const record = await enqueueRoutineOperation(db, { principalKey, clientInstanceId: client.clientInstanceId,
        operationType: "task_bundle", payload, runId, timed, actorSource: identity.actorSource,
        effectiveOperatorId: operatorId, critical });
      await refresh(); engine.current?.wake(); return { ok: true, mode: "queued", data: record };
    } catch (error) { return { ok: false, mode: "offline_rejected", error, message: String(error?.message ?? error) }; }
  }, [clientPrincipalKey, enabled, identity?.actorSource, operatorId, principalKey, refresh]);
  const queueRunFinish = useCallback(async ({ runId, baseRunRevision }) => {
    if (!enabled || operatorId || !principalKey || !clientPrincipalKey) return { ok: false, mode: "offline_rejected",
      message: "This run finish requires an online server confirmation." };
    try {
      await engine.current?.runOnce(); const db = await openRoutineOfflineDb(); const client = await getRoutineMeta(db, clientPrincipalKey, "client_instance");
      if (!client?.clientInstanceId) return { ok: false, mode: "offline_not_ready", message: "Offline sync is still preparing." };
      const payload = { runId, baseRunRevision, clientRecordedAt: new Date().toISOString() };
      const record = await enqueueRoutineOperation(db, { principalKey, clientInstanceId: client.clientInstanceId,
        operationType: "run_finish_intent", payload, runId, actorSource: identity.actorSource });
      await refresh(); engine.current?.wake(); return { ok: true, mode: "queued", data: record };
    } catch (error) { return { ok: false, mode: "offline_rejected", error, message: String(error?.message ?? error) }; }
  }, [clientPrincipalKey, enabled, identity?.actorSource, operatorId, principalKey, refresh]);
  const add = useCallback((entry) => setLocalEntries((current) => [...current.filter((value) => value.operationId !== entry.operationId),
    { ...entry, serverConfirmed: false }]), []);
  const update = useCallback((operationId, patch) => setLocalEntries((current) => current.map((entry) => entry.operationId === operationId ? { ...entry, ...patch } : entry)), []);
  const discard = useCallback(async (operationId) => {
    setLocalEntries((current) => current.filter((entry) => entry.operationId !== operationId));
    if (!enabled || !principalKey || !records.some((record) => record.clientOperationId === operationId)) return true;
    const db = await openRoutineOfflineDb(); await deleteRoutineOutboxRecord(db, principalKey, operationId); await refresh(); return true;
  }, [enabled, principalKey, records, refresh]);
  const createAfterConflict = useCallback(async (operationId, payload, options = {}) => {
    if (!enabled || !principalKey) return { ok: false, mode: "offline_not_available" };
    try {
      const db = await openRoutineOfflineDb();
      const record = await createRoutineOperationAfterConflict(db, principalKey, operationId, payload,
        { ...options, actorSource: identity?.actorSource, effectiveOperatorId: operatorId });
      await deleteRoutineOutboxRecord(db, principalKey, operationId); await refresh(); engine.current?.wake();
      return { ok: true, mode: "queued", data: record };
    } catch (error) { return { ok: false, mode: "offline_rejected", error, message: String(error?.message ?? error) }; }
  }, [enabled, identity?.actorSource, operatorId, principalKey, refresh]);
  const mapped = useMemo(() => records.filter((record) => record.status !== OUTBOX_STATUS.CONFIRMED).map((record) => ({
    operationId: record.clientOperationId, label: record.operationType === "task_bundle" ? "Routine task update" : "Run finish",
    state: visibleState(record.status), serverConfirmed: false, localDraft: record.payload, serverReceipt: record.serverReceipt,
    baseRevisions: record.baseRevisions, taskId: record.taskId, runId: record.runId,
    serverRevision: record.serverReceipt?.currentRevision ?? record.serverReceipt?.serverRevision
      ?? record.serverReceipt?.serverState?.revision ?? "current",
    serverSummary: record.serverReceipt?.serverState ?? record.serverReceipt ?? record.lastError ?? "Refresh to load the current server state.",
    localRevision: record.baseRevisions?.task ?? record.baseRevisions?.run ?? "unknown",
    localSummary: record.payload, actor: record.serverReceipt?.actorDisplayName ?? record.effectiveOperatorId ?? record.actorSource,
    at: record.serverReceipt?.serverCreatedAt ?? record.updatedAt,
  })), [records]);
  const entries = useMemo(() => [...mapped, ...localEntries], [localEntries, mapped]);
  return Object.freeze({ entries: Object.freeze(entries), add, update, applyReceipt: refresh, discard, createAfterConflict, refresh, queueTaskBundle, queueRunFinish,
    pendingCount: entries.filter((entry) => ["queued", "sending", "sync_pending"].includes(entry.state)).length,
    conflictCount: entries.filter((entry) => entry.state === "conflict").length });
}

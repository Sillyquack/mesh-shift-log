import {
  OUTBOX_STATUS,
  ROUTINE_OFFLINE_SCHEMA_LABEL,
  SYNC_ENGINE_STATUS,
  createRoutinePrincipalKey,
  retryDelayMs,
} from "../data/routineSyncModel.js";
import { createSharedDeviceOperatorPrincipalKey } from "../data/routineOperatorIdentity.js";
import {
  acquireRoutineFallbackLease,
  getRoutineMeta,
  getRoutineSyncCursor,
  markRoutineWorkspacesDirty,
  openRoutineOfflineDb,
  putRoutineMeta,
  putRoutineSyncCursor,
  releaseRoutineFallbackLease,
  quarantineRoutineOfflineDataForPrincipal,
  restoreRoutineOfflineDataForPrincipal,
  updateRoutineOutboxRecord,
} from "./routineOfflineDb.js";
import { listReadyRoutineOperations } from "./routineOutbox.js";

function receiptStatus(result) {
  return result?.receipt?.receipt_status ?? result?.receipt?.receiptStatus ?? null;
}

function safeStatusDetail(detail) {
  const { error, ...rest } = detail ?? {};
  return error ? { ...rest, error: { kind: error?.kind ?? "unknown", code: error?.code ?? null } } : rest;
}

export function createRoutineSyncEngine({
  resolvePrincipal,
  syncClient,
  refreshAuthoritative,
  appVersion,
  platformLabel = null,
  openDb = openRoutineOfflineDb,
  webLocks = globalThis.navigator?.locks,
  BroadcastChannelImpl = globalThis.BroadcastChannel,
  cryptoImpl = globalThis.crypto,
  now = Date.now,
  random = Math.random,
  onStatus = () => {},
  channelKey = "routine-events",
  leaseTtlMs = 15_000,
} = {}) {
  if (typeof resolvePrincipal !== "function" || !syncClient || typeof refreshAuthoritative !== "function") {
    throw new Error("Routine sync engine requires principal, client, and authoritative refresh providers.");
  }
  let stopped = true;
  let running = null;
  let broadcast = null;
  let db = null;
  let activePrincipalKey = null;

  const publish = (status, detail = {}) => {
    const value = { status, ...safeStatusDetail(detail) };
    onStatus(value);
    broadcast?.postMessage({ kind: "routine_sync_status", ...value });
  };

  async function resolveContext() {
    const principal = await resolvePrincipal();
    if (!principal?.organizationId || !principal?.authUserId) throw Object.assign(new Error("auth_required"), { kind: "auth_required" });
    const sharedOperator = principal.actorSource === "shared_device_operator";
    if (sharedOperator && !principal.operatorId) throw Object.assign(new Error("operator_auth_required"), { kind: "operator_auth_required" });
    const principalKey = sharedOperator
      ? createSharedDeviceOperatorPrincipalKey(principal.organizationId, principal.authUserId, principal.operatorId)
      : createRoutinePrincipalKey(principal.organizationId, principal.authUserId);
    const clientPrincipalKey = createRoutinePrincipalKey(principal.organizationId, principal.authUserId);
    db ??= await openDb();
    if (activePrincipalKey && activePrincipalKey !== principalKey) {
      await quarantineRoutineOfflineDataForPrincipal(db, activePrincipalKey, "operator_switch");
    }
    activePrincipalKey = principalKey;
    await restoreRoutineOfflineDataForPrincipal(db, principalKey);
    let identity = await getRoutineMeta(db, clientPrincipalKey, "client_instance");
    if (!identity?.clientInstanceId) {
      identity = {
        clientInstanceId: cryptoImpl.randomUUID(),
        registrationIdempotencyKey: cryptoImpl.randomUUID(),
        createdAt: now(),
      };
      await putRoutineMeta(db, clientPrincipalKey, "client_instance", identity);
    }
    if (!identity.registered) {
      await syncClient.registerClientInstance({
        ...identity,
        appVersion,
        offlineSchemaVersion: ROUTINE_OFFLINE_SCHEMA_LABEL,
        platformLabel,
        idempotencyKey: identity.registrationIdempotencyKey,
      });
      identity = { ...identity, registered: true, registeredAt: now() };
      await putRoutineMeta(db, clientPrincipalKey, "client_instance", identity);
    } else {
      await syncClient.touchClientInstance({
        clientInstanceId: identity.clientInstanceId,
        appVersion,
        offlineSchemaVersion: ROUTINE_OFFLINE_SCHEMA_LABEL,
      });
    }
    return { principal, principalKey, clientPrincipalKey, clientInstanceId: identity.clientInstanceId,
      transportMode: sharedOperator ? "cursor_polling" : "postgres_realtime" };
  }

  async function catchUp(context, renewLease = async () => true) {
    publish(SYNC_ENGINE_STATUS.CATCHING_UP);
    let cursorRecord = await getRoutineSyncCursor(db, context.principalKey, channelKey);
    let cursor = cursorRecord?.serverCreatedAt
      ? { serverCreatedAt: cursorRecord.serverCreatedAt, eventId: cursorRecord.eventId }
      : null;
    do {
      if (!(await renewLease())) return false;
      const page = await syncClient.getSyncEvents({ cursor, limit: 200 });
      const affected = [...new Set([
        ...(page.affectedRunIds ?? []),
        ...(page.affectedBundleIds ?? []),
        ...(page.affectedTaskIds ?? []),
      ])];
      if (affected.length) await markRoutineWorkspacesDirty(db, context.principalKey, affected);
      if ((page.events ?? []).length) {
        publish(SYNC_ENGINE_STATUS.REFRESHING, { eventCount: page.events.length });
        await refreshAuthoritative({
          principal: context.principal,
          runIds: page.affectedRunIds ?? [],
          bundleIds: page.affectedBundleIds ?? [],
          taskIds: page.affectedTaskIds ?? [],
          events: page.events,
        });
      }
      if (page.nextCursor?.serverCreatedAt) {
        cursor = page.nextCursor;
        cursorRecord = {
          principalKey: context.principalKey,
          channelKey,
          serverCreatedAt: cursor.serverCreatedAt,
          eventId: cursor.eventId,
          updatedAt: now(),
        };
        await putRoutineSyncCursor(db, cursorRecord);
      }
      if (!page.hasMore) break;
    } while (!stopped);
    return true;
  }

  async function processOutbox(context, renewLease = async () => true) {
    while (!stopped) {
      const ready = await listReadyRoutineOperations(db, context.principalKey, now());
      if (!ready.length) break;
      for (const original of ready) {
      if (stopped || !(await renewLease())) return;
      const livePrincipal = await resolvePrincipal().catch(() => null);
      if (!livePrincipal || livePrincipal.authUserId !== context.principal.authUserId
          || livePrincipal.operatorId !== context.principal.operatorId
          || livePrincipal.actorSource !== context.principal.actorSource) {
        publish(SYNC_ENGINE_STATUS.PAUSED_AUTH, { operatorId: context.principal.operatorId ?? null });
        return;
      }
      if (context.principal.actorSource === "shared_device_operator"
          && (original.actorSource !== "shared_device_operator"
            || original.effectiveOperatorId !== context.principal.operatorId)) {
        await updateRoutineOutboxRecord(db, context.principalKey, original.clientOperationId, {
          ...original, status: OUTBOX_STATUS.PAUSED_OPERATOR_AUTH, nextRetryAt: Number.MAX_SAFE_INTEGER,
          lastError: { kind: "operator_auth_required", message: "operator_identity_mismatch" }, updatedAt: now(),
        });
        publish(SYNC_ENGINE_STATUS.PAUSED_AUTH, { operatorId: context.principal.operatorId });
        return;
      }
      publish(SYNC_ENGINE_STATUS.SENDING, { clientOperationId: original.clientOperationId });
      const sending = await updateRoutineOutboxRecord(db, context.principalKey, original.clientOperationId, (record) => ({
        ...record,
        status: OUTBOX_STATUS.SENDING,
        attempts: record.attempts + 1,
        sendingStartedAt: now(),
        updatedAt: now(),
      }));
      try {
        const result = await syncClient.applyWithReceiptRecovery({
          ...sending,
          ...sending.payload,
          clientInstanceId: context.clientInstanceId,
        });
        const status = receiptStatus(result);
        const nextStatus = status === "applied" ? OUTBOX_STATUS.CONFIRMED
          : status === "conflict" ? OUTBOX_STATUS.CONFLICT
            : status === "rejected" ? OUTBOX_STATUS.REJECTED
              : OUTBOX_STATUS.RETRY_WAIT;
        await updateRoutineOutboxRecord(db, context.principalKey, sending.clientOperationId, {
          ...sending,
          status: nextStatus,
          serverReceipt: result?.receipt ?? null,
          nextRetryAt: nextStatus === OUTBOX_STATUS.RETRY_WAIT
            ? now() + retryDelayMs(sending.attempts, random)
            : Number.MAX_SAFE_INTEGER,
          lastError: nextStatus === OUTBOX_STATUS.RETRY_WAIT ? "unknown_outcome" : null,
          updatedAt: now(),
          sendingStartedAt: null,
        });
        if (nextStatus === OUTBOX_STATUS.CONFIRMED) {
          try {
            if (!(await catchUp(context, renewLease))) return;
          } catch (refreshError) {
            publish(SYNC_ENGINE_STATUS.OFFLINE, { error: refreshError });
            return;
          }
        }
      } catch (error) {
        const kind = error?.kind ?? "unknown_outcome";
        const nextStatus = kind === "operator_auth_required" ? OUTBOX_STATUS.PAUSED_OPERATOR_AUTH
          : kind === "auth_required" ? OUTBOX_STATUS.PAUSED_AUTH
          : kind === "stale_conflict" || kind === "timed_action_requires_online_confirmation" ? OUTBOX_STATUS.CONFLICT
            : kind === "server_rejected" ? OUTBOX_STATUS.REJECTED
              : OUTBOX_STATUS.RETRY_WAIT;
        await updateRoutineOutboxRecord(db, context.principalKey, sending.clientOperationId, {
          ...sending,
          status: nextStatus,
          nextRetryAt: nextStatus === OUTBOX_STATUS.RETRY_WAIT
            ? now() + retryDelayMs(sending.attempts, random)
            : Number.MAX_SAFE_INTEGER,
          lastError: { kind, message: String(error?.message ?? error) },
          updatedAt: now(),
          sendingStartedAt: null,
        });
        if ([OUTBOX_STATUS.PAUSED_AUTH, OUTBOX_STATUS.PAUSED_OPERATOR_AUTH].includes(nextStatus)) {
          publish(SYNC_ENGINE_STATUS.PAUSED_AUTH, { operatorId: context.principal.operatorId ?? null });
          return;
        }
      }
      }
    }
  }

  async function synchronizedWork(context, renewLease) {
    if (!(await catchUp(context, renewLease))) return;
    if (!stopped) await processOutbox(context, renewLease);
    if (!stopped) publish(SYNC_ENGINE_STATUS.CURRENT, { transportMode: context.transportMode,
      operatorId: context.principal.operatorId ?? null });
  }

  async function runCycle() {
    if (running) return running;
    running = (async () => {
      publish(SYNC_ENGINE_STATUS.ACQUIRING_LEADER);
      let context;
      try {
        context = await resolveContext();
      } catch (error) {
        publish(["auth_required", "operator_auth_required"].includes(error?.kind)
          ? SYNC_ENGINE_STATUS.PAUSED_AUTH : SYNC_ENGINE_STATUS.OFFLINE, { error });
        return false;
      }
      const lockName = `mesh-routine-sync:${context.principalKey}`;
      if (webLocks?.request) {
        let acquired = false;
        await webLocks.request(lockName, { ifAvailable: true }, async (lock) => {
          if (!lock || stopped) return;
          acquired = true;
          await synchronizedWork(context, async () => true);
        });
        return acquired;
      }
      const ownerId = cryptoImpl.randomUUID();
      const acquire = () => acquireRoutineFallbackLease(db, context.principalKey, "sync-leader", ownerId, now(), leaseTtlMs);
      if (!(await acquire())) return false;
      try {
        await synchronizedWork(context, acquire);
        return true;
      } finally {
        await releaseRoutineFallbackLease(db, context.principalKey, "sync-leader", ownerId);
      }
    })().finally(() => { running = null; });
    return running;
  }

  return Object.freeze({
    async start() {
      if (!stopped) return runCycle();
      stopped = false;
      const principal = await resolvePrincipal().catch(() => null);
      if (principal?.organizationId) {
        broadcast = BroadcastChannelImpl ? new BroadcastChannelImpl(`mesh-routine-sync:${principal.organizationId}`) : null;
        if (broadcast) broadcast.onmessage = (event) => {
          if (event.data?.kind === "routine_sync_wake" && !stopped) void runCycle();
        };
      }
      return runCycle();
    },
    wake() {
      if (stopped) return;
      broadcast?.postMessage({ kind: "routine_sync_wake" });
      void runCycle();
    },
    stop({ quarantine = false } = {}) {
      stopped = true;
      if (quarantine && db && activePrincipalKey) {
        void quarantineRoutineOfflineDataForPrincipal(db, activePrincipalKey, "operator_session_end");
      }
      broadcast?.close();
      broadcast = null;
      publish(SYNC_ENGINE_STATUS.STOPPED);
    },
    runOnce: runCycle,
    get running() { return Boolean(running); },
  });
}

import {
  OUTBOX_STATUS,
  ROUTINE_CONFIRMED_RETENTION_DAYS,
  ROUTINE_OFFLINE_SCHEMA_VERSION,
  assertRoutinePayloadSafe,
  createRoutinePrincipalKey,
} from "../data/routineSyncModel.js";

export const ROUTINE_OFFLINE_DB_NAME = "mesh-routine-offline";
export const ROUTINE_OFFLINE_STORES = Object.freeze({
  WORKSPACE_CACHE: "workspace_cache",
  DRAFTS: "drafts",
  OUTBOX: "outbox",
  SYNC_CURSORS: "sync_cursors",
  LEASES: "leases",
  META: "meta",
});

const STORE_DEFINITIONS = Object.freeze({
  workspace_cache: {
    keyPath: ["principalKey", "resourceType", "resourceId"],
    indexes: [["by_principal", "principalKey"], ["by_expiry", ["principalKey", "expiresAt"]]],
  },
  drafts: {
    keyPath: ["principalKey", "draftKey"],
    indexes: [["by_principal", "principalKey"], ["by_resource", ["principalKey", "resourceType", "resourceId"]]],
  },
  outbox: {
    keyPath: ["principalKey", "clientOperationId"],
    indexes: [
      ["by_principal", "principalKey"],
      ["by_status", ["principalKey", "status", "createdAt"]],
      ["by_resource", ["principalKey", "resourceType", "resourceId", "createdAt"]],
      ["by_retry", ["principalKey", "nextRetryAt"]],
    ],
  },
  sync_cursors: {
    keyPath: ["principalKey", "channelKey"],
    indexes: [["by_principal", "principalKey"]],
  },
  leases: {
    keyPath: ["principalKey", "leaseKey"],
    indexes: [["by_expiry", "expiresAt"]],
  },
  meta: {
    keyPath: ["principalKey", "key"],
    indexes: [["by_principal", "principalKey"]],
  },
});

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

export function openRoutineOfflineDb({
  indexedDBImpl = globalThis.indexedDB,
  name = ROUTINE_OFFLINE_DB_NAME,
  version = ROUTINE_OFFLINE_SCHEMA_VERSION,
} = {}) {
  if (!indexedDBImpl) return Promise.reject(new Error("IndexedDB is unavailable."));
  const request = indexedDBImpl.open(name, version);
  request.onupgradeneeded = () => {
    const db = request.result;
    for (const [storeName, definition] of Object.entries(STORE_DEFINITIONS)) {
      const store = db.objectStoreNames.contains(storeName)
        ? request.transaction.objectStore(storeName)
        : db.createObjectStore(storeName, { keyPath: definition.keyPath });
      for (const [indexName, keyPath] of definition.indexes) {
        if (!store.indexNames.contains(indexName)) store.createIndex(indexName, keyPath, { unique: false });
      }
    }
  };
  return requestResult(request);
}

export async function runRoutineOfflineTransaction(db, stores, mode, callback) {
  const transaction = db.transaction(stores, mode);
  const result = await callback(transaction);
  await transactionDone(transaction);
  return result;
}

function assertPrincipal(record, principalKey) {
  if (!record || record.principalKey !== principalKey) throw new Error("Routine offline principal partition mismatch.");
}

function isBasicRecord(record, principalKey) {
  return Boolean(record && typeof record === "object" && record.principalKey === principalKey);
}

export async function isRoutinePrincipalQuarantined(db, principalKey) {
  const transaction = db.transaction(ROUTINE_OFFLINE_STORES.META, "readonly");
  const value = await requestResult(transaction.objectStore(ROUTINE_OFFLINE_STORES.META).get([principalKey, "quarantine"]));
  return Boolean(value?.quarantined);
}

async function assertPrincipalAvailable(db, principalKey) {
  if (await isRoutinePrincipalQuarantined(db, principalKey)) throw new Error("Routine offline data is quarantined for this principal.");
}

export async function putRoutineWorkspaceCache(db, record) {
  assertRoutinePayloadSafe(record.payload);
  if (record.dirty !== false) throw new Error("Workspace cache only accepts server-confirmed snapshots.");
  return runRoutineOfflineTransaction(db, [ROUTINE_OFFLINE_STORES.WORKSPACE_CACHE], "readwrite", async (tx) =>
    requestResult(tx.objectStore(ROUTINE_OFFLINE_STORES.WORKSPACE_CACHE).put({ ...record })));
}

export async function getRoutineWorkspaceCache(db, principalKey, resourceType, resourceId) {
  await assertPrincipalAvailable(db, principalKey);
  const tx = db.transaction(ROUTINE_OFFLINE_STORES.WORKSPACE_CACHE, "readonly");
  const value = await requestResult(tx.objectStore(ROUTINE_OFFLINE_STORES.WORKSPACE_CACHE)
    .get([principalKey, resourceType, resourceId]));
  return isBasicRecord(value, principalKey) ? value : null;
}

export async function markRoutineWorkspacesDirty(db, principalKey, resourceIds) {
  const ids = new Set(resourceIds.filter(Boolean));
  if (!ids.size) return 0;
  return runRoutineOfflineTransaction(db, [ROUTINE_OFFLINE_STORES.WORKSPACE_CACHE], "readwrite", async (tx) => {
    const store = tx.objectStore(ROUTINE_OFFLINE_STORES.WORKSPACE_CACHE);
    const records = await requestResult(store.index("by_principal").getAll(principalKey));
    let changed = 0;
    for (const record of records) {
      if (ids.has(record.resourceId)) {
        store.put({ ...record, dirty: true });
        changed += 1;
      }
    }
    return changed;
  });
}

export async function putRoutineDraft(db, record) {
  assertRoutinePayloadSafe(record.payload);
  return runRoutineOfflineTransaction(db, [ROUTINE_OFFLINE_STORES.DRAFTS], "readwrite", async (tx) =>
    requestResult(tx.objectStore(ROUTINE_OFFLINE_STORES.DRAFTS).put({ ...record })));
}

export async function getRoutineDraft(db, principalKey, draftKey) {
  await assertPrincipalAvailable(db, principalKey);
  const tx = db.transaction(ROUTINE_OFFLINE_STORES.DRAFTS, "readonly");
  const value = await requestResult(tx.objectStore(ROUTINE_OFFLINE_STORES.DRAFTS).get([principalKey, draftKey]));
  return isBasicRecord(value, principalKey) ? value : null;
}

export async function putRoutineOutboxRecord(db, record) {
  assertRoutinePayloadSafe(record.payload);
  assertPrincipal(record, record.principalKey);
  return runRoutineOfflineTransaction(db, [ROUTINE_OFFLINE_STORES.OUTBOX], "readwrite", async (tx) =>
    requestResult(tx.objectStore(ROUTINE_OFFLINE_STORES.OUTBOX).put({ ...record })));
}

export async function updateRoutineOutboxRecord(db, principalKey, clientOperationId, update) {
  return runRoutineOfflineTransaction(db, [ROUTINE_OFFLINE_STORES.OUTBOX], "readwrite", async (tx) => {
    const store = tx.objectStore(ROUTINE_OFFLINE_STORES.OUTBOX);
    const current = await requestResult(store.get([principalKey, clientOperationId]));
    if (!isBasicRecord(current, principalKey)) throw new Error("Outbox record was not found for this principal.");
    const next = typeof update === "function" ? update(Object.freeze({ ...current })) : { ...current, ...update };
    assertPrincipal(next, principalKey);
    if (current.status === OUTBOX_STATUS.SENDING
      && (next.clientOperationId !== current.clientOperationId
        || JSON.stringify(next.payload) !== JSON.stringify(current.payload)
        || next.requestHash !== current.requestHash)) {
      throw new Error("A sending outbox record has immutable payload and idempotency identity.");
    }
    assertRoutinePayloadSafe(next.payload);
    await requestResult(store.put(next));
    return next;
  });
}

export async function deleteRoutineOutboxRecord(db, principalKey, clientOperationId) {
  if (!principalKey || !clientOperationId) throw new Error("Outbox identity is required.");
  return runRoutineOfflineTransaction(db, [ROUTINE_OFFLINE_STORES.OUTBOX], "readwrite", async (tx) => {
    const store = tx.objectStore(ROUTINE_OFFLINE_STORES.OUTBOX);
    const current = await requestResult(store.get([principalKey, clientOperationId]));
    if (!isBasicRecord(current, principalKey)) throw new Error("Outbox record was not found for this principal.");
    await requestResult(store.delete([principalKey, clientOperationId]));
    return true;
  });
}

export async function listRoutineOutbox(db, principalKey) {
  await assertPrincipalAvailable(db, principalKey);
  const tx = db.transaction(ROUTINE_OFFLINE_STORES.OUTBOX, "readonly");
  const values = await requestResult(tx.objectStore(ROUTINE_OFFLINE_STORES.OUTBOX).index("by_principal").getAll(principalKey));
  return values.filter((value) => isBasicRecord(value, principalKey) && value.clientOperationId && value.operationType)
    .sort((a, b) => a.createdAt - b.createdAt || a.clientOperationId.localeCompare(b.clientOperationId));
}

export async function putRoutineSyncCursor(db, record) {
  return runRoutineOfflineTransaction(db, [ROUTINE_OFFLINE_STORES.SYNC_CURSORS], "readwrite", async (tx) =>
    requestResult(tx.objectStore(ROUTINE_OFFLINE_STORES.SYNC_CURSORS).put({ ...record })));
}

export async function getRoutineSyncCursor(db, principalKey, channelKey) {
  const tx = db.transaction(ROUTINE_OFFLINE_STORES.SYNC_CURSORS, "readonly");
  return (await requestResult(tx.objectStore(ROUTINE_OFFLINE_STORES.SYNC_CURSORS)
    .get([principalKey, channelKey]))) ?? null;
}

export async function getRoutineMeta(db, principalKey, key) {
  const tx = db.transaction(ROUTINE_OFFLINE_STORES.META, "readonly");
  return (await requestResult(tx.objectStore(ROUTINE_OFFLINE_STORES.META).get([principalKey, key]))) ?? null;
}

export async function putRoutineMeta(db, principalKey, key, value) {
  assertRoutinePayloadSafe(value, 32 * 1024);
  return runRoutineOfflineTransaction(db, [ROUTINE_OFFLINE_STORES.META], "readwrite", async (tx) =>
    requestResult(tx.objectStore(ROUTINE_OFFLINE_STORES.META).put({ ...value, principalKey, key })));
}

export async function acquireRoutineFallbackLease(db, principalKey, leaseKey, ownerId, now, ttlMs) {
  return runRoutineOfflineTransaction(db, [ROUTINE_OFFLINE_STORES.LEASES], "readwrite", async (tx) => {
    const store = tx.objectStore(ROUTINE_OFFLINE_STORES.LEASES);
    const current = await requestResult(store.get([principalKey, leaseKey]));
    if (current && current.ownerId !== ownerId && current.expiresAt > now) return false;
    await requestResult(store.put({ principalKey, leaseKey, ownerId, acquiredAt: current?.acquiredAt ?? now, expiresAt: now + ttlMs }));
    return true;
  });
}

export async function releaseRoutineFallbackLease(db, principalKey, leaseKey, ownerId) {
  return runRoutineOfflineTransaction(db, [ROUTINE_OFFLINE_STORES.LEASES], "readwrite", async (tx) => {
    const store = tx.objectStore(ROUTINE_OFFLINE_STORES.LEASES);
    const current = await requestResult(store.get([principalKey, leaseKey]));
    if (current?.ownerId === ownerId) await requestResult(store.delete([principalKey, leaseKey]));
  });
}

export async function clearRoutineOfflineDataForPrincipal(db, principalKey) {
  const stores = Object.values(ROUTINE_OFFLINE_STORES);
  return runRoutineOfflineTransaction(db, stores, "readwrite", async (tx) => {
    for (const storeName of stores) {
      const store = tx.objectStore(storeName);
      const records = store.indexNames.contains("by_principal")
        ? await requestResult(store.index("by_principal").getAll(principalKey))
        : await requestResult(store.getAll());
      for (const record of records.filter((entry) => entry?.principalKey === principalKey)) store.delete(store.keyPath.map((key) => record[key]));
    }
  });
}

export function quarantineRoutineOfflineDataForPrincipal(db, principalKey, reason = "logout") {
  return putRoutineMeta(db, principalKey, "quarantine", { quarantined: true, reason, updatedAt: Date.now() });
}

export function restoreRoutineOfflineDataForPrincipal(db, principalKey) {
  return putRoutineMeta(db, principalKey, "quarantine", { quarantined: false, reason: null, updatedAt: Date.now() });
}

export async function pruneRoutineOfflineData(db, { now = Date.now(), confirmedRetentionDays = ROUTINE_CONFIRMED_RETENTION_DAYS } = {}) {
  const cutoff = now - confirmedRetentionDays * 86_400_000;
  let pruned = 0;
  await runRoutineOfflineTransaction(db, [ROUTINE_OFFLINE_STORES.WORKSPACE_CACHE, ROUTINE_OFFLINE_STORES.DRAFTS,
    ROUTINE_OFFLINE_STORES.OUTBOX], "readwrite", async (tx) => {
    for (const storeName of [ROUTINE_OFFLINE_STORES.WORKSPACE_CACHE, ROUTINE_OFFLINE_STORES.DRAFTS]) {
      const store = tx.objectStore(storeName);
      for (const record of await requestResult(store.getAll())) {
        if (record.expiresAt && record.expiresAt < now) { store.delete(store.keyPath.map((key) => record[key])); pruned += 1; }
      }
    }
    const outbox = tx.objectStore(ROUTINE_OFFLINE_STORES.OUTBOX);
    for (const record of await requestResult(outbox.getAll())) {
      if (record.status === OUTBOX_STATUS.CONFIRMED && record.updatedAt < cutoff) {
        outbox.delete([record.principalKey, record.clientOperationId]);
        pruned += 1;
      }
    }
  });
  return pruned;
}

export async function listRoutineOfflineDiagnostics(db, principalKey) {
  const diagnostics = { principalKey, stores: {}, malformed: [], containsSecrets: false };
  for (const storeName of Object.values(ROUTINE_OFFLINE_STORES)) {
    const tx = db.transaction(storeName, "readonly");
    const records = (await requestResult(tx.objectStore(storeName).getAll())).filter((record) => record?.principalKey === principalKey);
    diagnostics.stores[storeName] = records.length;
    records.forEach((record, index) => {
      if (!isBasicRecord(record, principalKey)) diagnostics.malformed.push({ storeName, index });
      try { assertRoutinePayloadSafe(record, 512 * 1024); } catch (error) {
        if (error.code === "forbidden_sensitive_key") diagnostics.containsSecrets = true;
        diagnostics.malformed.push({ storeName, index, code: error.code ?? "invalid" });
      }
    });
  }
  return diagnostics;
}

export { createRoutinePrincipalKey };

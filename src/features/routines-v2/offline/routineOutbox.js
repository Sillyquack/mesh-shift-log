import {
  OPERATION_POLICY,
  OUTBOX_STATUS,
  RoutineSyncValidationError,
  assertRoutinePayloadSafe,
  isUuid,
  sha256Canonical,
} from "../data/routineSyncModel.js";
import { listRoutineOutbox, putRoutineOutboxRecord, updateRoutineOutboxRecord } from "./routineOfflineDb.js";

export const ROUTINE_OUTBOX_REGISTRY = Object.freeze({
  task_bundle: Object.freeze({
    policy: OPERATION_POLICY.QUEUEABLE,
    resourceType: "task",
    safetyClass: OPERATION_POLICY.CRITICAL_SERVER_CONFIRMATION,
  }),
  run_finish_intent: Object.freeze({
    policy: OPERATION_POLICY.QUEUEABLE,
    resourceType: "run",
    safetyClass: OPERATION_POLICY.CRITICAL_SERVER_CONFIRMATION,
  }),
});

export const ROUTINE_NON_QUEUEABLE_POLICIES = Object.freeze({
  timed_task_completion: OPERATION_POLICY.DRAFT_ONLY_OFFLINE,
  timed_task_not_applicable: OPERATION_POLICY.DRAFT_ONLY_OFFLINE,
  double_shift_change_feed_review: OPERATION_POLICY.ONLINE_ONLY,
  event_transfer_acceptance: OPERATION_POLICY.ONLINE_ONLY,
  event_transfer_completion: OPERATION_POLICY.ONLINE_ONLY,
  manager_override: OPERATION_POLICY.ONLINE_ONLY,
  history_correction: OPERATION_POLICY.ONLINE_ONLY,
  role_assignment: OPERATION_POLICY.ONLINE_ONLY,
  run_date_supersession: OPERATION_POLICY.ONLINE_ONLY,
  template_mutation: OPERATION_POLICY.ONLINE_ONLY,
  image_mutation: OPERATION_POLICY.ONLINE_ONLY,
  auth_or_shared_device: OPERATION_POLICY.ONLINE_ONLY,
});

const TASK_BUNDLE_KEYS = new Set([
  "taskId", "baseTaskRevision", "clientRecordedAt", "initialAssessment", "itemUpdates", "comments",
  "finalAction", "pauseReason", "block", "notApplicableReason", "completionNote", "criticalConfirmation",
]);

export function validateRoutineTaskBundlePayload(payload) {
  assertRoutinePayloadSafe(payload);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new RoutineSyncValidationError("task_bundle_invalid");
  if (Object.keys(payload).some((key) => !TASK_BUNDLE_KEYS.has(key))) throw new RoutineSyncValidationError("task_bundle_unknown_key");
  if (!isUuid(payload.taskId) || !Number.isInteger(payload.baseTaskRevision) || payload.baseTaskRevision <= 0) {
    throw new RoutineSyncValidationError("task_bundle_identity_invalid");
  }
  if (!Array.isArray(payload.itemUpdates) || payload.itemUpdates.length > 100) throw new RoutineSyncValidationError("task_bundle_item_limit");
  if (!Array.isArray(payload.comments) || payload.comments.length > 20) throw new RoutineSyncValidationError("task_bundle_comment_limit");
  if (new Set(payload.itemUpdates.map((item) => item.taskItemId)).size !== payload.itemUpdates.length) {
    throw new RoutineSyncValidationError("task_bundle_duplicate_item");
  }
  if (payload.itemUpdates.some((item) => !isUuid(item.taskItemId) || !Number.isInteger(item.baseRevision) || item.baseRevision <= 0)) {
    throw new RoutineSyncValidationError("task_bundle_item_revision_invalid");
  }
  if (payload.comments.some((comment) => typeof comment !== "string" || !comment.trim() || comment.trim().length > 4000)) {
    throw new RoutineSyncValidationError("task_bundle_comment_invalid");
  }
  if (!new Set(["save_progress", "pause", "block", "not_applicable", "complete"]).has(payload.finalAction)) {
    throw new RoutineSyncValidationError("task_bundle_final_action_invalid");
  }
  const hasText = (value) => typeof value === "string" && Boolean(value.trim());
  if ((payload.finalAction === "pause" && !hasText(payload.pauseReason))
    || (payload.finalAction !== "pause" && hasText(payload.pauseReason))
    || (payload.finalAction === "block" && (!payload.block || typeof payload.block !== "object"
      || !hasText(payload.block.category) || !hasText(payload.block.reasonCode)))
    || (payload.finalAction !== "block" && payload.block != null)
    || (payload.finalAction === "not_applicable" && !hasText(payload.notApplicableReason))
    || (payload.finalAction !== "not_applicable" && hasText(payload.notApplicableReason))
    || (payload.finalAction !== "complete" && hasText(payload.completionNote))) {
    throw new RoutineSyncValidationError("task_bundle_action_payload_inconsistent");
  }
  return payload;
}

function validateFinishIntentPayload(payload) {
  assertRoutinePayloadSafe(payload);
  if (!isUuid(payload?.runId) || !Number.isInteger(payload.baseRunRevision) || payload.baseRunRevision <= 0) {
    throw new RoutineSyncValidationError("run_finish_intent_invalid");
  }
  return payload;
}

export async function enqueueRoutineOperation(db, {
  principalKey,
  clientInstanceId,
  operationType,
  payload,
  dependencies = [],
  runId: inputRunId = null,
  now = Date.now(),
  cryptoImpl = globalThis.crypto,
  timed = false,
  actorSource = "personal_auth",
  effectiveOperatorId = null,
  critical = false,
}) {
  const definition = ROUTINE_OUTBOX_REGISTRY[operationType];
  if (!definition) throw new RoutineSyncValidationError("outbox_operation_not_registered", operationType);
  if (definition.policy !== OPERATION_POLICY.QUEUEABLE) throw new RoutineSyncValidationError("outbox_operation_not_queueable");
  if (!isUuid(clientInstanceId)) throw new RoutineSyncValidationError("client_instance_id_invalid");
  const sharedOperator = actorSource === "shared_device_operator";
  if (sharedOperator && !isUuid(effectiveOperatorId)) throw new RoutineSyncValidationError("operator_identity_required");
  if (sharedOperator && operationType === "run_finish_intent") {
    throw new RoutineSyncValidationError("shared_device_run_finish_requires_online_reauthentication");
  }
  if (operationType === "task_bundle") validateRoutineTaskBundlePayload(payload);
  else validateFinishIntentPayload(payload);
  if (operationType === "task_bundle" && timed && new Set(["complete", "not_applicable"]).has(payload.finalAction)) {
    throw new RoutineSyncValidationError("offline_timed_action_requires_online_confirmation");
  }
  if (sharedOperator && critical && new Set(["complete", "not_applicable"]).has(payload.finalAction)) {
    throw new RoutineSyncValidationError("shared_device_critical_action_requires_online_reauthentication");
  }
  if (!cryptoImpl?.randomUUID) throw new RoutineSyncValidationError("crypto_unavailable");
  const resourceId = operationType === "task_bundle" ? payload.taskId : payload.runId;
  const runId = operationType === "run_finish_intent" ? payload.runId : inputRunId;
  const records = await listRoutineOutbox(db, principalKey);
  if (operationType === "task_bundle") {
    const existing = records.find((record) => record.operationType === operationType
      && record.taskId === payload.taskId && record.status === OUTBOX_STATUS.QUEUED);
    if (existing) {
      const requestHash = await sha256Canonical(payload, cryptoImpl);
      return updateRoutineOutboxRecord(db, principalKey, existing.clientOperationId, {
        ...existing,
        payload,
        requestHash,
        baseRevisions: {
          task: payload.baseTaskRevision,
          items: Object.fromEntries(payload.itemUpdates.map((item) => [item.taskItemId, item.baseRevision])),
        },
        dependencies: [...new Set([...existing.dependencies, ...dependencies])],
        updatedAt: now,
        actorSource,
        effectiveOperatorId,
      });
    }
  }
  const clientOperationId = cryptoImpl.randomUUID();
  const requestHash = await sha256Canonical(payload, cryptoImpl);
  const record = {
    principalKey,
    clientInstanceId,
    clientOperationId,
    operationType,
    operationPolicy: definition.policy,
    resourceType: definition.resourceType,
    resourceId,
    runId,
    taskId: operationType === "task_bundle" ? payload.taskId : null,
    payload,
    actorSource,
    effectiveOperatorId,
    requestHash,
    baseRevisions: operationType === "task_bundle"
      ? { task: payload.baseTaskRevision, items: Object.fromEntries(payload.itemUpdates.map((item) => [item.taskItemId, item.baseRevision])) }
      : { run: payload.baseRunRevision },
    dependencies: [...new Set(dependencies)],
    status: OUTBOX_STATUS.QUEUED,
    safetyClass: definition.safetyClass,
    attempts: 0,
    nextRetryAt: now,
    lastError: null,
    serverReceipt: null,
    createdAt: now,
    updatedAt: now,
    sendingStartedAt: null,
  };
  await putRoutineOutboxRecord(db, record);
  return record;
}

export async function listReadyRoutineOperations(db, principalKey, now = Date.now()) {
  const records = await listRoutineOutbox(db, principalKey);
  const confirmed = new Set(records.filter((record) => record.status === OUTBOX_STATUS.CONFIRMED)
    .map((record) => record.clientOperationId));
  const blockedResources = new Set();
  const ready = [];
  for (const record of records) {
    const resourceKey = `${record.resourceType}:${record.resourceId}`;
    if (blockedResources.has(resourceKey)) continue;
    if (![OUTBOX_STATUS.QUEUED, OUTBOX_STATUS.RETRY_WAIT].includes(record.status) || record.nextRetryAt > now) {
      if (record.status !== OUTBOX_STATUS.CONFIRMED) blockedResources.add(resourceKey);
      continue;
    }
    if (!record.dependencies.every((dependency) => confirmed.has(dependency))) {
      blockedResources.add(resourceKey);
      continue;
    }
    if (record.operationType === "run_finish_intent" && records.some((candidate) =>
      candidate.createdAt < record.createdAt && candidate.runId === record.runId
      && candidate.status !== OUTBOX_STATUS.CONFIRMED)) {
      blockedResources.add(resourceKey);
      continue;
    }
    ready.push(record);
    blockedResources.add(resourceKey);
  }
  return ready;
}

export async function createRoutineOperationAfterConflict(db, principalKey, previousOperationId, payload, options = {}) {
  const records = await listRoutineOutbox(db, principalKey);
  const previous = records.find((record) => record.clientOperationId === previousOperationId);
  if (!previous || previous.status !== OUTBOX_STATUS.CONFLICT) throw new RoutineSyncValidationError("conflict_record_required");
  return enqueueRoutineOperation(db, {
    ...options,
    principalKey,
    clientInstanceId: previous.clientInstanceId,
    operationType: previous.operationType,
    payload,
    dependencies: previous.dependencies,
  });
}

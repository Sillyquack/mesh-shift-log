import { getCurrentSession, supabaseAuthClient } from "../../../lib/supabaseAuthClient.js";
import { isSupabaseConfigured } from "../../../lib/supabaseClient.js";
import { routineRpcClient } from "./routineRpcClient.js";
import {
  classifyRoutineSyncError,
  normalizeEventCursor,
  normalizeOfflineReceipt,
  normalizeSyncHealth,
} from "../data/routineSyncModel.js";

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

export class RoutineSyncClientError extends Error {
  constructor(kind, message, cause = null) {
    super(message);
    this.name = "RoutineSyncClientError";
    this.kind = kind;
    this.cause = cause;
  }
}

export function createRoutineSyncClient({
  client = supabaseAuthClient,
  sessionProvider = getCurrentSession,
  configured = isSupabaseConfigured,
} = {}) {
  async function assertContext() {
    if (!configured || !client) throw new RoutineSyncClientError("auth_required", "Routine sync is not configured.");
    const session = await sessionProvider().catch(() => null);
    if (!session?.user?.id) throw new RoutineSyncClientError("auth_required", "Sign in again to synchronize routines.");
    return session;
  }

  async function rpc(name, payload = {}) {
    await assertContext();
    let result;
    try {
      result = client === supabaseAuthClient
        ? await routineRpcClient.request(name, compact(payload))
        : await client.rpc(name, compact(payload));
    } catch (error) {
      throw new RoutineSyncClientError(classifyRoutineSyncError(error), String(error?.message ?? error), error);
    }
    if (result?.error) {
      throw new RoutineSyncClientError(classifyRoutineSyncError(result.error), result.error.message, result.error);
    }
    return result?.data ?? null;
  }

  const api = {
    registerClientInstance(input) {
      return rpc("register_routine_client_instance", {
        input_client_instance_id: input.clientInstanceId,
        input_app_version: input.appVersion,
        input_offline_schema_version: input.offlineSchemaVersion,
        input_platform_label: input.platformLabel ?? null,
        input_idempotency_key: input.idempotencyKey,
      });
    },
    touchClientInstance(input) {
      return rpc("touch_routine_client_instance", {
        input_client_instance_id: input.clientInstanceId,
        input_app_version: input.appVersion,
        input_offline_schema_version: input.offlineSchemaVersion,
      });
    },
    revokeClientInstance(input) {
      return rpc("revoke_routine_client_instance", {
        input_client_instance_id: input.clientInstanceId,
        input_expected_revision: input.expectedRevision,
        input_reason: input.reason,
        input_idempotency_key: input.idempotencyKey,
      });
    },
    async getSyncEvents(input = {}) {
      const data = await rpc("get_routine_sync_events", {
        input_after_server_created_at: input.cursor?.serverCreatedAt ?? null,
        input_after_event_id: input.cursor?.eventId ?? null,
        input_limit: input.limit ?? 200,
        input_run_ids: input.runIds ?? null,
        input_bundle_ids: input.bundleIds ?? null,
      });
      return { ...data, nextCursor: normalizeEventCursor(data?.nextCursor) };
    },
    async getOfflineReceipt(input) {
      const data = await rpc("get_routine_offline_operation_receipt", {
        input_client_instance_id: input.clientInstanceId,
        input_client_operation_id: input.clientOperationId,
      });
      return normalizeOfflineReceipt(data);
    },
    applyOfflineTaskBundle(input) {
      return rpc("apply_routine_offline_task_bundle", {
        input_client_instance_id: input.clientInstanceId,
        input_client_operation_id: input.clientOperationId,
        input_payload: input.payload,
        input_request_hash: input.requestHash,
      });
    },
    applyOfflineRunFinishIntent(input) {
      return rpc("apply_routine_offline_run_finish_intent", {
        input_client_instance_id: input.clientInstanceId,
        input_client_operation_id: input.clientOperationId,
        input_run_id: input.runId,
        input_base_run_revision: input.baseRunRevision,
        input_client_recorded_at: input.clientRecordedAt ?? null,
        input_request_hash: input.requestHash,
      });
    },
    async getSyncHealth(input) {
      return normalizeSyncHealth(await rpc("get_routine_sync_health", {
        input_date_from: input.dateFrom,
        input_date_to: input.dateTo,
      }));
    },
    getReconciliationHistory(openingTaskId) {
      return rpc("get_routine_delivery_reconciliation_history", { input_opening_task_id: openingTaskId });
    },
  };

  api.applyWithReceiptRecovery = async (record) => {
    const apply = record.operationType === "task_bundle"
      ? api.applyOfflineTaskBundle
      : record.operationType === "run_finish_intent"
        ? api.applyOfflineRunFinishIntent
        : null;
    if (!apply) throw new RoutineSyncClientError("server_rejected", "Unknown offline operation type.");
    try {
      return await apply(record);
    } catch (error) {
      if (!new Set(["network", "unknown_outcome"]).has(error.kind)) throw error;
      let receipt;
      try {
        receipt = await api.getOfflineReceipt(record);
      } catch (probeError) {
        throw new RoutineSyncClientError("unknown_outcome", "Operation outcome and receipt lookup are unknown.", probeError);
      }
      if (receipt) return { receipt, recoveredFromReceipt: true };
      throw new RoutineSyncClientError("unknown_outcome", "No receipt was found; retry with the same operation ID.", error);
    }
  };

  return Object.freeze(api);
}

export const routineSyncClient = createRoutineSyncClient();

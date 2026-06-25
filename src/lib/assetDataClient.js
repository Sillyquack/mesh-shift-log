import { getCurrentSession, supabaseAuthClient } from "./supabaseAuthClient.js";
import { supabase } from "./supabaseClient.js";

function authRequiredResult() {
  return {
    ok: false,
    mode: "auth_required",
    message: "Email login is required for asset backend sync.",
  };
}

async function authenticatedContext() {
  if (!supabaseAuthClient) return authRequiredResult();

  const session = await getCurrentSession().catch(() => null);

  if (!session?.user?.id) return authRequiredResult();

  return {
    ok: true,
    mode: "authenticated",
    session,
    authUserId: session.user.id,
  };
}

function organizationId() {
  return supabase.organizationId || null;
}

function textValue(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function boolValue(value, fallback = true) {
  if (value === null || value === undefined) return fallback;
  return Boolean(value);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

export async function isAssetBackendAvailable() {
  const context = await authenticatedContext();
  return context.ok;
}

export function buildAssetLocalId(record = {}) {
  return (
    record.localId ||
    record.local_id ||
    record.id ||
    [
      "asset",
      record.type || record.assetType || "other",
      record.provider || "unknown-provider",
      record.model || "unknown-model",
      record.serialNumber || record.serial_number || "unknown-serial",
      record.expectedVenue || record.expected_venue || "unknown-venue",
      record.expectedStation || record.expected_station || "unknown-station",
    ]
      .map((part) =>
        String(part || "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
      )
      .join(":")
  );
}

export function buildAssetCheckLocalId({
  date,
  shiftKey,
  eventId = "",
  assetId = "",
  authUserId = "",
}) {
  return [
    "asset_check",
    date || "unknown-date",
    shiftKey || "unknown-shift",
    eventId || "shift",
    assetId || "unknown-asset",
    authUserId || "default",
  ].join(":");
}

export function normalizeAssetRegistryRow(row) {
  if (!row) return null;

  return {
    backendId: row.id || "",
    localId: row.local_id || "",
    id: row.local_id || row.id || "",
    type: row.asset_type || "other",
    assetType: row.asset_type || "other",
    provider: row.provider || "",
    model: row.model || "",
    serialNumber: row.serial_number || "",
    expectedVenue: row.expected_venue || "",
    expectedStation: row.expected_station || "",
    notes: row.notes || "",
    active: row.active !== false,
    condition: row.condition || "ok",
    defaultRequiredForClosing: row.default_required_for_closing !== false,
    source: row.source || "app",
    syncStatus: "synced",
    syncError: "",
    updatedAt: row.updated_at || row.created_at || "",
    createdAt: row.created_at || "",
  };
}

export function normalizeAssetCheckRow(row) {
  if (!row) return null;

  return {
    backendId: row.id || "",
    localId: row.local_id || "",
    id: row.local_id || row.id || "",
    date: row.check_date || "",
    shiftType: row.shift_key || "",
    eventId: row.event_id || "",
    assetBackendId: row.asset_backend_id || "",
    assetId: row.asset_local_id || row.asset_backend_id || "",
    assetLocalId: row.asset_local_id || "",
    assetLabel: row.asset_label || "",
    expectedVenue: row.expected_venue || "",
    expectedStation: row.expected_station || "",
    present: row.present || "",
    correctLocation: row.correct_location || "",
    condition: row.condition || "",
    charging: row.charging || "",
    serialChecked: row.serial_checked || "",
    serialLast4: row.serial_last4 || "",
    comment: row.comment || "",
    signedByAuthUserId: row.signed_by_auth_user_id || "",
    signedOffBy: row.signed_by_name || "",
    signedOffAt: row.signed_at || "",
    source: row.source || "app",
    syncStatus: "synced",
    syncError: "",
    updatedAt: row.updated_at || row.signed_at || row.created_at || "",
    createdAt: row.created_at || "",
  };
}

export function assetRegistryRecordToPayload(record) {
  const localId = buildAssetLocalId(record);

  return {
    organization_id: organizationId(),
    asset_type: record.assetType || record.type || "other",
    provider: record.provider || null,
    model: record.model || null,
    serial_number: record.serialNumber || null,
    expected_venue: record.expectedVenue || null,
    expected_station: record.expectedStation || null,
    notes: record.notes || null,
    active: record.active !== false,
    condition: record.condition || "ok",
    default_required_for_closing:
      record.defaultRequiredForClosing !== false,
    local_id: localId,
    source: "app",
  };
}

export function assetCheckRecordToPayload(record, authUserId) {
  const assetId = record.assetLocalId || record.assetId || record.asset_id || "";
  const localId =
    record.localId ||
    buildAssetCheckLocalId({
      date: record.date,
      shiftKey: record.shiftType,
      eventId: record.eventId,
      assetId,
      authUserId,
    });

  return {
    organization_id: organizationId(),
    check_date: record.date,
    shift_key: record.shiftType || null,
    event_id: record.eventId || null,
    asset_backend_id: isUuid(record.assetBackendId) ? record.assetBackendId : null,
    asset_local_id: assetId || null,
    asset_label: record.assetLabel || null,
    expected_venue: record.expectedVenue || null,
    expected_station: record.expectedStation || null,
    present: record.present || null,
    correct_location: record.correctLocation || null,
    condition: record.condition || null,
    charging: record.charging || null,
    serial_checked: record.serialChecked || null,
    serial_last4: record.serialLast4 || null,
    comment: record.comment || null,
    signed_by_auth_user_id: record.signedByAuthUserId || authUserId,
    signed_by_name: record.signedOffBy || record.signedByName || "Unknown user",
    signed_at: record.signedOffAt || new Date().toISOString(),
    local_id: localId,
    source: "app",
  };
}

async function saveByLocalId(tableName, payload) {
  const existing = await supabaseAuthClient
    .from(tableName)
    .select("id")
    .eq("local_id", payload.local_id)
    .maybeSingle();

  if (existing.error) return { data: null, error: existing.error };

  if (existing.data?.id) {
    return supabaseAuthClient
      .from(tableName)
      .update(payload)
      .eq("id", existing.data.id)
      .select("*")
      .single();
  }

  return supabaseAuthClient
    .from(tableName)
    .insert(payload)
    .select("*")
    .single();
}

export async function upsertAssetRegistryRecord(record) {
  const context = await authenticatedContext();
  if (!context.ok) return context;

  const payload = assetRegistryRecordToPayload(record);
  const { data, error } = await saveByLocalId("asset_registry", payload);

  if (error) {
    return { ok: false, mode: "sync_error", message: error.message, error };
  }

  return {
    ok: true,
    mode: "authenticated",
    record: normalizeAssetRegistryRow(data),
    row: data,
  };
}

export async function upsertAssetCheckRecord(record) {
  const context = await authenticatedContext();
  if (!context.ok) return context;

  if (!record?.date) {
    return {
      ok: false,
      mode: "validation_error",
      message: "Missing asset check date.",
    };
  }

  const payload = assetCheckRecordToPayload(record, context.authUserId);
  const { data, error } = await saveByLocalId("asset_check_records", payload);

  if (error) {
    return { ok: false, mode: "sync_error", message: error.message, error };
  }

  return {
    ok: true,
    mode: "authenticated",
    record: normalizeAssetCheckRow(data),
    row: data,
  };
}

export async function fetchAssetRegistry() {
  const context = await authenticatedContext();
  if (!context.ok) return { ...context, records: [] };

  const { data, error } = await supabaseAuthClient
    .from("asset_registry")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return {
      ok: false,
      mode: "sync_error",
      message: error.message,
      error,
      records: [],
    };
  }

  return {
    ok: true,
    mode: "authenticated",
    records: (data || []).map(normalizeAssetRegistryRow).filter(Boolean),
    rows: data || [],
  };
}

export async function fetchAssetChecksForDate(date) {
  const context = await authenticatedContext();
  if (!context.ok) return { ...context, records: [] };

  const { data, error } = await supabaseAuthClient
    .from("asset_check_records")
    .select("*")
    .eq("check_date", date)
    .order("updated_at", { ascending: false });

  if (error) {
    return {
      ok: false,
      mode: "sync_error",
      message: error.message,
      error,
      records: [],
    };
  }

  return {
    ok: true,
    mode: "authenticated",
    records: (data || []).map(normalizeAssetCheckRow).filter(Boolean),
    rows: data || [],
  };
}

export async function fetchAssetChecksRange(startDate, endDate) {
  const context = await authenticatedContext();
  if (!context.ok) return { ...context, records: [] };

  const { data, error } = await supabaseAuthClient
    .from("asset_check_records")
    .select("*")
    .gte("check_date", startDate)
    .lte("check_date", endDate)
    .order("check_date", { ascending: false });

  if (error) {
    return {
      ok: false,
      mode: "sync_error",
      message: error.message,
      error,
      records: [],
    };
  }

  return {
    ok: true,
    mode: "authenticated",
    records: (data || []).map(normalizeAssetCheckRow).filter(Boolean),
    rows: data || [],
  };
}

function freshness(record) {
  return (
    new Date(record.updatedAt || record.signedOffAt || record.createdAt || 0)
      .getTime() || 0
  );
}

function assetRegistryLogicalKeys(record) {
  return [
    ...new Set(
      [
        record.localId,
        record.backendId,
        record.id,
        record.serialNumber
          ? `serial:${String(record.serialNumber).toLowerCase()}`
          : "",
        [
          "asset",
          record.type || record.assetType || "other",
          record.provider || "",
          record.model || "",
          record.expectedVenue || "",
          record.expectedStation || "",
        ].join(":"),
      ].filter(Boolean),
    ),
  ];
}

function assetCheckBaseLogicalKey(record) {
  return [
    record.date,
    record.shiftType,
    record.eventId || "shift",
    record.assetLocalId || record.assetId || record.assetBackendId || "asset",
  ].join(":");
}

function assetCheckLogicalKeys(record) {
  return [
    ...new Set(
      [
        record.localId,
        record.backendId,
        record.id,
        assetCheckBaseLogicalKey(record),
      ].filter(Boolean),
    ),
  ];
}

export function mergeAssetRegistry(localAssets = [], backendAssets = []) {
  const merged = new Map();
  let duplicatesIgnored = 0;

  const assignRecord = (record) => {
    assetRegistryLogicalKeys(record).forEach((key) => merged.set(key, record));
  };

  localAssets.forEach((record) => {
    assignRecord({
      ...record,
      localId: record.localId || record.id || "",
      syncStatus: record.syncStatus || "local_only",
    });
  });

  backendAssets.forEach((record) => {
    const existing = assetRegistryLogicalKeys(record)
      .map((key) => merged.get(key))
      .find(Boolean);

    if (existing) duplicatesIgnored += 1;

    if (
      existing &&
      ["pending_backend", "sync_error"].includes(existing.syncStatus) &&
      freshness(existing) > freshness(record)
    ) {
      assignRecord(existing);
      return;
    }

    assignRecord({
      ...existing,
      ...record,
      syncStatus: "synced",
      syncError: "",
    });
  });

  return { records: [...new Set(merged.values())], duplicatesIgnored };
}

export function mergeAssetChecks(localChecks = [], backendChecks = []) {
  const merged = new Map();
  let duplicatesIgnored = 0;

  const assignRecord = (record) => {
    assetCheckLogicalKeys(record).forEach((key) => merged.set(key, record));
  };

  localChecks.forEach((record) => {
    assignRecord(record);
  });

  backendChecks.forEach((record) => {
    const existing = assetCheckLogicalKeys(record)
      .map((key) => merged.get(key))
      .find(Boolean);

    if (existing) duplicatesIgnored += 1;

    if (
      existing &&
      ["pending_backend", "sync_error"].includes(existing.syncStatus) &&
      freshness(existing) > freshness(record)
    ) {
      assignRecord(existing);
      return;
    }

    assignRecord({
      ...existing,
      ...record,
      syncStatus: "synced",
      syncError: "",
    });
  });

  return { records: [...new Set(merged.values())], duplicatesIgnored };
}

export function cleanupSyncedAssetPendingRecords(localChecks = []) {
  const syncedKeys = new Set(
    localChecks
      .filter(
        (record) =>
          record.syncStatus === "synced" &&
          (record.backendId || record.localId),
      )
      .flatMap(assetCheckLogicalKeys),
  );

  let removed = 0;

  const records = localChecks.filter((record) => {
    const shouldRemove =
      ["pending_backend", "sync_error"].includes(record.syncStatus) &&
      assetCheckLogicalKeys(record).some((key) => syncedKeys.has(key));

    if (shouldRemove) removed += 1;

    return !shouldRemove;
  });

  return {
    records,
    removed,
    localOnlyRemaining: records.filter((record) =>
      ["pending_auth", "local_only"].includes(record.syncStatus),
    ).length,
  };
}

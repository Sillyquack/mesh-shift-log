import { getCurrentSession, supabaseAuthClient } from "./supabaseAuthClient.js";
import { supabase } from "./supabaseClient.js";

function authRequiredResult() {
  return {
    ok: false,
    mode: "auth_required",
    message: "Email login is required for financial backend sync.",
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

export async function isFinancialBackendAvailable() {
  const context = await authenticatedContext();
  return context.ok;
}

export function buildFinancialLocalId({
  date,
  shiftKey,
  signoffType,
  terminalId = "",
  invoiceReference = "",
  authUserId = "",
  eventId = "",
}) {
  return [
    "financial",
    date || "unknown-date",
    shiftKey || "unknown-shift",
    eventId || "shift",
    signoffType || "daily_finance",
    terminalId || invoiceReference || authUserId || "default",
  ].join(":");
}
function textValue(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function yesNoLabel(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (["yes", "true", "1", "y", "ja"].includes(normalized)) return "Yes";
  if (["no", "false", "0", "n", "nei"].includes(normalized)) return "No";

  return normalized ? String(value) : "Not filled";
}

export function parseFinancialSignoffNotes(notes) {
  const empty = {
    eventId: "",
    tableCreated: "",
    tableCreatedLabel: "Not filled",
    salesPunched: "",
    salesPunchedLabel: "Not filled",
    invoiceSent: "",
    invoiceSentLabel: "Not filled",
    settlementPerformed: "",
    settlementPerformedLabel: "Not filled",
    settlementPerformedBy: "",
    signedOffBy: "",
    comments: "",
    rawNotes: "",
    isStructuredCashInvoice: false,
  };

  if (!notes) return empty;

  let payload = notes;

  if (typeof notes === "string") {
    const trimmed = notes.trim();

    if (!trimmed) return empty;

    try {
      payload = JSON.parse(trimmed);
    } catch {
      return {
        ...empty,
        comments: trimmed,
        rawNotes: notes,
        isStructuredCashInvoice: false,
      };
    }
  }

  if (!payload || typeof payload !== "object") {
    return {
      ...empty,
      comments: textValue(notes),
      rawNotes: textValue(notes),
      isStructuredCashInvoice: false,
    };
  }

  const hasStructuredCashInvoiceFields = [
    "eventId",
    "tableCreated",
    "salesPunched",
    "invoiceSent",
    "settlementPerformed",
    "settlementPerformedBy",
    "signedOffBy",
    "comments",
  ].some((key) => Object.prototype.hasOwnProperty.call(payload, key));

  return {
    eventId: textValue(payload.eventId),
    tableCreated: textValue(payload.tableCreated),
    tableCreatedLabel: yesNoLabel(payload.tableCreated),
    salesPunched: textValue(payload.salesPunched),
    salesPunchedLabel: yesNoLabel(payload.salesPunched),
    invoiceSent: textValue(payload.invoiceSent),
    invoiceSentLabel: yesNoLabel(payload.invoiceSent),
    settlementPerformed: textValue(payload.settlementPerformed),
    settlementPerformedLabel: yesNoLabel(payload.settlementPerformed),
    settlementPerformedBy: textValue(payload.settlementPerformedBy),
    signedOffBy: textValue(payload.signedOffBy),
    comments: textValue(payload.comments),
    rawNotes: typeof notes === "string" ? notes : JSON.stringify(payload),
    isStructuredCashInvoice: hasStructuredCashInvoiceFields,
  };
}

export function normalizeFinancialSignoff(row) {
  if (!row) return null;
  const notePayload = parseFinancialSignoffNotes(row.notes);

  return {
    backendId: row.id || "",
    localId: row.local_id || "",
    id: row.local_id || row.id || "",
    date: row.signoff_date || "",
    shiftType: row.shift_key || "",
    eventId: notePayload.eventId || "",
    signoffType: row.signoff_type || "daily_finance",
    status: row.status || "draft",
    amountExpected: row.amount_expected ?? "",
    amountActual: row.amount_actual ?? "",
    variance: row.variance ?? "",
    currency: row.currency || "NOK",
    terminalId: row.terminal_id || "",
    terminalLabel: row.terminal_label || "",
    invoiceReference: row.invoice_reference || "",
    paymentMethod: row.payment_method || "",
    tableCreated: notePayload.tableCreated || "",
    tableCreatedLabel: notePayload.tableCreatedLabel || "Not filled",

    salesPunched: notePayload.salesPunched || "",
    salesPunchedLabel: notePayload.salesPunchedLabel || "Not filled",

    invoiceSent: notePayload.invoiceSent || "",
    invoiceSentLabel: notePayload.invoiceSentLabel || "Not filled",

    settlementPerformed: notePayload.settlementPerformed || "",
    settlementPerformedLabel:
      notePayload.settlementPerformedLabel || "Not filled",

    settlementPerformedBy: notePayload.settlementPerformedBy || "",
    comments: notePayload.comments || "",
    notes: row.notes || "",
    rawNotes: notePayload.rawNotes || row.notes || "",
    isStructuredCashInvoice: Boolean(notePayload.isStructuredCashInvoice),
    cashInvoiceDetails: notePayload,

    issueNotes: row.issue_notes || "",
    signedOffBy: row.signed_by_name || notePayload.signedOffBy || "",
    formSignedOffBy: notePayload.signedOffBy || row.signed_by_name || "",
    signedOffAt: row.signed_at || "",
    signedByAuthUserId: row.signed_by_auth_user_id || "",
    reviewedByAuthUserId: row.reviewed_by_auth_user_id || "",
    reviewedBy: row.reviewed_by_name || "",
    reviewedAt: row.reviewed_at || "",
    source: row.source || "app",
    syncStatus: "synced",
    syncError: "",
    updatedAt: row.updated_at || row.created_at || "",
  };
}

function statusForRecord(record) {
  const hasIssue = ["invoiceSent", "salesPunched", "settlementPerformed"].some(
    (field) => record[field] !== "yes",
  );
  if (record.status === "reviewed" || record.reviewedAt) return "reviewed";
  if (hasIssue) return "issue";
  if (record.signedOffAt || record.signedOffBy) return "completed";
  return record.status || "draft";
}

function recordToPayload(record, authUserId) {
  const signoffType = record.signoffType || "daily_finance";
  const localId =
    record.localId ||
    buildFinancialLocalId({
      date: record.date,
      shiftKey: record.shiftType,
      signoffType,
      terminalId: record.terminalId,
      invoiceReference: record.invoiceReference,
      authUserId,
      eventId: record.eventId,
    });
  const notes = JSON.stringify({
    eventId: record.eventId || "",
    tableCreated: record.tableCreated || "",
    salesPunched: record.salesPunched || "",
    invoiceSent: record.invoiceSent || "",
    settlementPerformed: record.settlementPerformed || "",
    settlementPerformedBy: record.settlementPerformedBy || "",
    signedOffBy: record.signedOffBy || "",
    comments: record.comments || "",
  });
  return {
    organization_id: organizationId(),
    signoff_date: record.date,
    shift_key: record.shiftType || null,
    signoff_type: signoffType,
    status: statusForRecord(record),
    amount_expected:
      record.amountExpected === "" ? null : record.amountExpected,
    amount_actual: record.amountActual === "" ? null : record.amountActual,
    variance: record.variance === "" ? null : record.variance,
    currency: record.currency || "NOK",
    terminal_id: record.terminalId || null,
    terminal_label: record.terminalLabel || null,
    invoice_reference: record.invoiceReference || null,
    payment_method: record.paymentMethod || null,
    notes,
    issue_notes: record.issueNotes || record.comments || null,
    signed_by_auth_user_id: record.signedByAuthUserId || authUserId,
    signed_by_name: record.signedOffBy || record.signedByName || "Unknown user",
    signed_at: record.signedOffAt || new Date().toISOString(),
    reviewed_by_auth_user_id: record.reviewedByAuthUserId || null,
    reviewed_by_name: record.reviewedBy || null,
    reviewed_at: record.reviewedAt || null,
    local_id: localId,
    source: "app",
  };
}

async function saveByLocalId(payload) {
  const existing = await supabaseAuthClient
    .from("financial_signoffs")
    .select("id")
    .eq("local_id", payload.local_id)
    .maybeSingle();
  if (existing.error) return { data: null, error: existing.error };
  if (existing.data?.id) {
    return supabaseAuthClient
      .from("financial_signoffs")
      .update(payload)
      .eq("id", existing.data.id)
      .select("*")
      .single();
  }
  return supabaseAuthClient
    .from("financial_signoffs")
    .insert(payload)
    .select("*")
    .single();
}

export async function upsertFinancialSignoff(record) {
  const context = await authenticatedContext();
  if (!context.ok) return context;
  if (!record?.date)
    return {
      ok: false,
      mode: "validation_error",
      message: "Missing signoff date.",
    };
  const payload = recordToPayload(record, context.authUserId);
  const { data, error } = await saveByLocalId(payload);
  if (error)
    return { ok: false, mode: "sync_error", message: error.message, error };
  return {
    ok: true,
    mode: "authenticated",
    record: normalizeFinancialSignoff(data),
    row: data,
  };
}

export async function reviewFinancialSignoff(recordId, reviewData = {}) {
  const context = await authenticatedContext();
  if (!context.ok) return context;
  const { data, error } = await supabaseAuthClient
    .from("financial_signoffs")
    .update({
      status: "reviewed",
      reviewed_by_auth_user_id: context.authUserId,
      reviewed_by_name: reviewData.reviewedBy || "Manager",
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", recordId)
    .select("*")
    .single();
  if (error)
    return { ok: false, mode: "sync_error", message: error.message, error };
  return {
    ok: true,
    mode: "authenticated",
    record: normalizeFinancialSignoff(data),
    row: data,
  };
}

export async function fetchFinancialSignoffsForDate(date) {
  const context = await authenticatedContext();
  if (!context.ok) return { ...context, records: [] };
  const { data, error } = await supabaseAuthClient
    .from("financial_signoffs")
    .select("*")
    .eq("signoff_date", date)
    .order("updated_at", { ascending: false });
  if (error)
    return {
      ok: false,
      mode: "sync_error",
      message: error.message,
      error,
      records: [],
    };
  return {
    ok: true,
    mode: "authenticated",
    records: (data || []).map(normalizeFinancialSignoff).filter(Boolean),
    rows: data || [],
  };
}

export async function fetchFinancialSignoffsRange(startDate, endDate) {
  const context = await authenticatedContext();
  if (!context.ok) return { ...context, records: [] };
  const { data, error } = await supabaseAuthClient
    .from("financial_signoffs")
    .select("*")
    .gte("signoff_date", startDate)
    .lte("signoff_date", endDate)
    .order("signoff_date", { ascending: false });
  if (error)
    return {
      ok: false,
      mode: "sync_error",
      message: error.message,
      error,
      records: [],
    };
  return {
    ok: true,
    mode: "authenticated",
    records: (data || []).map(normalizeFinancialSignoff).filter(Boolean),
    rows: data || [],
  };
}

function freshness(record) {
  return new Date(record.updatedAt || record.signedOffAt || 0).getTime() || 0;
}

function baseLogicalKey(record) {
  return [
    record.date,
    record.shiftType,
    record.eventId || "shift",
    record.signoffType || "daily_finance",
    record.terminalId || record.invoiceReference || "default",
  ].join(":");
}

function logicalKeys(record) {
  return [
    ...new Set(
      [record.localId, record.backendId, baseLogicalKey(record)].filter(
        Boolean,
      ),
    ),
  ];
}

export function mergeFinancialSignoffs(localRecords = [], backendRecords = []) {
  const merged = new Map();
  let duplicatesIgnored = 0;
  const assignRecord = (record) => {
    logicalKeys(record).forEach((key) => merged.set(key, record));
  };
  localRecords.forEach((record) => {
    assignRecord(record);
  });
  backendRecords.forEach((record) => {
    const existing = logicalKeys(record)
      .map((key) => merged.get(key))
      .find(Boolean);
    if (existing) duplicatesIgnored += 1;
    if (
      !existing ||
      (["pending_backend", "sync_error"].includes(existing.syncStatus) &&
        freshness(existing) > freshness(record))
    ) {
      assignRecord(existing || record);
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

export function cleanupSyncedFinancialPendingRecords(localRecords = []) {
  const syncedKeys = new Set(
    localRecords
      .filter(
        (record) =>
          record.syncStatus === "synced" &&
          (record.backendId || record.localId),
      )
      .flatMap(logicalKeys),
  );
  let removed = 0;
  const records = localRecords.filter((record) => {
    const shouldRemove =
      ["pending_backend", "sync_error"].includes(record.syncStatus) &&
      logicalKeys(record).some((key) => syncedKeys.has(key));
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

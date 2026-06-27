import { getCurrentSession, supabaseAuthClient } from "./supabaseAuthClient.js";
import { supabase } from "./supabaseClient.js";

function authRequiredResult() {
  return {
    ok: false,
    mode: "auth_required",
    message: "Email login is required for close day archive sync.",
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

export function normalizeCloseDayArchive(row) {
  if (!row) return null;

  return {
    backendId: row.id || "",
    localId: row.local_id || "",
    date: row.close_date || "",
    status: row.status || "closed",
    closedBy: row.closed_by_name || "",
    closedAt: row.closed_at || "",
    reopenedBy: row.reopened_by_name || "",
    reopenedAt: row.reopened_at || "",
    checksPassed: row.checks_passed || 0,
    totalChecks: row.total_checks || 0,
    blockingItems: Array.isArray(row.blocking_items) ? row.blocking_items : [],
    summary: row.summary || "",
    metadata: row.metadata || {},
    syncStatus: "synced",
    updatedAt: row.updated_at || "",
    createdAt: row.created_at || "",
  };
}

function archiveToPayload(record, authUserId) {
  const status = record.status || "closed";
  const localId = record.localId || "close-day:" + (record.date || "unknown-date");

  return {
    organization_id: organizationId(),
    close_date: record.date,
    status,
    closed_by_auth_user_id: record.closedByAuthUserId || authUserId,
    closed_by_name: record.closedBy || "Manager",
    closed_at: record.closedAt || null,
    reopened_by_auth_user_id: record.reopenedByAuthUserId || (status === "reopened" ? authUserId : null),
    reopened_by_name: record.reopenedBy || "",
    reopened_at: record.reopenedAt || null,
    checks_passed: record.checksPassed || 0,
    total_checks: record.totalChecks || 0,
    blocking_items: record.blockingItems || [],
    summary: record.summary || "",
    metadata: record.metadata || {},
    local_id: localId,
    source: "app",
    created_by_auth_user_id: authUserId,
  };
}

export async function upsertCloseDayArchive(record) {
  const context = await authenticatedContext();

  if (!context.ok) return context;
  if (!record?.date) {
    return {
      ok: false,
      mode: "validation_error",
      message: "Missing close day archive date.",
    };
  }

  const payload = archiveToPayload(record, context.authUserId);

  const { data, error } = await supabaseAuthClient
    .from("close_day_archives")
    .upsert(payload, { onConflict: "local_id" })
    .select("*")
    .single();

  if (error) {
    return {
      ok: false,
      mode: "sync_error",
      message: error.message,
      error,
    };
  }

  return {
    ok: true,
    mode: "authenticated",
    record: normalizeCloseDayArchive(data),
    row: data,
  };
}

export async function fetchCloseDayArchive(date) {
  const context = await authenticatedContext();

  if (!context.ok) return { ...context, record: null };

  const { data, error } = await supabaseAuthClient
    .from("close_day_archives")
    .select("*")
    .eq("close_date", date)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      mode: "sync_error",
      message: error.message,
      error,
      record: null,
    };
  }

  return {
    ok: true,
    mode: "authenticated",
    record: normalizeCloseDayArchive(data),
    row: data,
    message: data ? "Close day archive restored." : "No close day archive found.",
  };
}

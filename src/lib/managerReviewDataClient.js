import {
  getCurrentSession,
  supabaseAuthClient,
} from "./supabaseAuthClient.js";

function authRequiredResult(message = "Email login required for manager review backend.") {
  return {
    ok: false,
    mode: "auth_required",
    message,
    record: null,
    records: [],
  };
}

async function authenticatedContext() {
  const session = await getCurrentSession();

  if (!session?.user?.id) return null;

  return {
    authUserId: session.user.id,
  };
}

async function currentUserOrganizationId(authUserId) {
  const { data, error } = await supabaseAuthClient
    .from("user_profiles")
    .select("organization_id")
    .eq("id", authUserId)
    .maybeSingle();

  if (error) throw error;

  return data?.organization_id || null;
}

function buildManagerReviewLocalId(date) {
  return `manager-review:${date}`;
}

function normalizeManagerReviewRow(row) {
  if (!row) return null;

  return {
    backendId: row.id,
    date: row.review_date,
    checked: row.checked || {},
    notes: row.notes || "",
    signedOffBy: row.signed_off_by_name || "",
    signedOffByAuthUserId: row.signed_off_by_auth_user_id || "",
    signedOffAt: row.signed_off_at || "",
    localId: row.local_id || buildManagerReviewLocalId(row.review_date),
    syncStatus: "synced",
    syncError: "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function managerReviewToPayload(review, organizationId, authUserId) {
  const date = review.date;

  return {
    organization_id: organizationId,
    review_date: date,
    checked: review.checked || {},
    notes: review.notes || "",
    signed_off_by_name: review.signedOffBy || "",
    signed_off_by_auth_user_id:
      review.signedOffByAuthUserId || authUserId || null,
    signed_off_at: review.signedOffAt || null,
    local_id: review.localId || buildManagerReviewLocalId(date),
    created_by: authUserId,
    updated_by: authUserId,
  };
}

export async function upsertManagerDailyReview(review) {
  const context = await authenticatedContext();

  if (!context) return authRequiredResult();

  const organizationId = await currentUserOrganizationId(context.authUserId);
  const payload = managerReviewToPayload(
    review,
    organizationId,
    context.authUserId,
  );

  const { data, error } = await supabaseAuthClient
    .from("manager_daily_reviews")
    .upsert(payload, {
      onConflict: "local_id",
    })
    .select("*")
    .single();

  if (error) {
    return {
      ok: false,
      mode: "sync_error",
      message: error.message || "Could not save manager daily review.",
      record: null,
      records: [],
    };
  }

  return {
    ok: true,
    mode: "authenticated",
    message: "Manager daily review synced to Supabase.",
    record: normalizeManagerReviewRow(data),
    records: data ? [normalizeManagerReviewRow(data)] : [],
  };
}

export async function fetchManagerDailyReview(date) {
  const context = await authenticatedContext();

  if (!context) return authRequiredResult();

  const localId = buildManagerReviewLocalId(date);

  const { data, error } = await supabaseAuthClient
    .from("manager_daily_reviews")
    .select("*")
    .eq("local_id", localId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      mode: "sync_error",
      message: error.message || "Could not fetch manager daily review.",
      record: null,
      records: [],
    };
  }

  return {
    ok: true,
    mode: "authenticated",
    message: data
      ? "Manager daily review restored from Supabase."
      : "No manager daily review found in backend.",
    record: normalizeManagerReviewRow(data),
    records: data ? [normalizeManagerReviewRow(data)] : [],
  };
}


export async function fetchManagerDailyReviewHistory({ limit = 14 } = {}) {
  const context = await authenticatedContext();

  if (!context) return authRequiredResult();

  const organizationId = await currentUserOrganizationId(context.authUserId);

  let query = supabaseAuthClient
    .from("manager_daily_reviews")
    .select("*")
    .ilike("local_id", "manager-review:%")
    .order("review_date", { ascending: false })
    .limit(limit);

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  } else {
    query = query.is("organization_id", null);
  }

  const { data, error } = await query;

  if (error) {
    return {
      ok: false,
      mode: "sync_error",
      message: error.message || "Could not fetch manager review history.",
      record: null,
      records: [],
    };
  }

  return {
    ok: true,
    mode: "authenticated",
    message: data?.length
      ? "Manager review history loaded."
      : "No manager review history found.",
    record: null,
    records: (data || []).map(normalizeManagerReviewRow).filter(Boolean),
  };
}

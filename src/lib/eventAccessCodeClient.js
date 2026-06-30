import { getCurrentSession, supabaseAuthClient } from "./supabaseAuthClient.js";

function authRequiredResult(message = "Email login required for event code backend.") {
  return {
    ok: false,
    mode: "auth_required",
    message,
  };
}

async function authenticatedContext() {
  const session = await getCurrentSession();
  if (!session?.user?.id) return null;
  return {
    authUserId: session.user.id,
  };
}

export async function generateDailyEventCode() {
  const context = await authenticatedContext();
  if (!context) return authRequiredResult();

  const { data, error } = await supabaseAuthClient.rpc(
    "generate_daily_event_code",
  );

  if (error) {
    return {
      ok: false,
      mode: "sync_error",
      message: error.message || "Could not generate event code.",
      error,
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    ok: true,
    mode: "authenticated",
    message: "Event code generated.",
    code: row?.code || "",
    codeDate: row?.code_date || "",
    expiresAt: row?.expires_at || "",
  };
}

export async function validateDailyEventCode(inputCode) {
  const context = await authenticatedContext();
  if (!context) return authRequiredResult();

  const { data, error } = await supabaseAuthClient.rpc(
    "validate_daily_event_code",
    { input_code: inputCode },
  );

  if (error) {
    return {
      ok: false,
      mode: "sync_error",
      valid: false,
      message: error.message || "Could not validate event code.",
      error,
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    ok: Boolean(row?.valid),
    mode: "authenticated",
    valid: Boolean(row?.valid),
    status: row?.status || "",
    message: row?.message || "",
    codeDate: row?.code_date || "",
    expiresAt: row?.expires_at || "",
  };
}

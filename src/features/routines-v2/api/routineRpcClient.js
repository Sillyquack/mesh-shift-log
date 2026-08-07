import { getCurrentSession, supabaseAuthClient } from "../../../lib/supabaseAuthClient.js";
import { isSupabaseConfigured } from "../../../lib/supabaseClient.js";
import { ROUTINE_OPERATOR_SESSION_HEADER } from "../data/routineOperatorIdentity.js";
import { clearRoutineOperatorSession, getRoutineOperatorSessionToken } from "../auth/routineOperatorSession.js";

function compact(value) {
  return Object.fromEntries(Object.entries(value ?? {}).filter(([, entry]) => entry !== undefined));
}

export function createRoutineRpcClient({
  client = supabaseAuthClient,
  sessionProvider = getCurrentSession,
  configured = isSupabaseConfigured,
  tokenProvider = getRoutineOperatorSessionToken,
  clearToken = clearRoutineOperatorSession,
} = {}) {
  async function request(name, payload = {}, { operatorSession = "auto" } = {}) {
    if (!configured || !client) return { data: null, error: Object.assign(new Error("Routine RPC is not configured."), { code: "auth_required" }) };
    const session = await sessionProvider().catch(() => null);
    if (!session?.user?.id) return { data: null, error: Object.assign(new Error("Sign in again to access routines."), { code: "auth_required" }) };
    let builder = client.rpc(name, compact(payload));
    const token = operatorSession === false ? null : tokenProvider();
    if (token) builder = builder.setHeader(ROUTINE_OPERATOR_SESSION_HEADER, token);
    const result = await builder;
    if (result?.error && token && /operator.*session|operator_auth_failed/i.test(String(result.error.message))) clearToken();
    return result;
  }
  return Object.freeze({ request });
}

export const routineRpcClient = createRoutineRpcClient();

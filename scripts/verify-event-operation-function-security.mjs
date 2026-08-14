import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/phase10w_event_operations_authenticated_execute.sql");
const accessClient = read("src/lib/eventAccessCodeClient.js");
const operationsClient = read("src/lib/eventOperationsClient.js");
const calendarClient = read("src/lib/calendarImportClient.js");

const authenticated = [
  "create_event_operation_from_calendar_event(uuid)",
  "create_event_responsibility_handover(uuid,text,uuid,text,text,text,text)",
  "current_user_can_manage_event_codes()",
  "current_user_can_manage_event_ops()",
  "current_user_is_active()",
  "current_user_is_manager()",
  "current_user_is_shared_device()",
  "current_user_organization_id()",
  "current_user_profile_role()",
  "event_ops_event_belongs_to_current_org(uuid)",
  "generate_daily_event_code()",
  "link_calendar_event_to_event_operation(uuid,uuid)",
  "same_event_ops_organization(uuid)",
  "update_event_task_status(uuid,text,text,text)",
  "update_event_task_status(uuid,text,text,text,text)",
  "upsert_event_staff_presence(date,text,text,text,text,boolean,jsonb)",
  "validate_daily_event_code(text)",
];
const internal = [
  "enforce_event_run_sheet_plan_organization()",
  "rls_auto_enable()",
  "set_updated_at()",
];

assert.match(migration, /^begin;/);
assert.match(migration, /commit;\s*$/);
assert.match(migration, /Phase 10W expected function is missing/);
assert.match(migration, /Phase 10W anon still has EXECUTE/);
assert.match(migration, /Phase 10W authenticated lost EXECUTE/);
assert.match(migration, /Phase 10W internal helper remains client-executable/);

for (const signature of authenticated) {
  const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(migration, new RegExp(`revoke all on function public\\.${escaped} from public, anon, authenticated;`, "i"), `missing exact revoke for ${signature}`);
  assert.match(migration, new RegExp(`grant execute on function public\\.${escaped} to authenticated;`, "i"), `missing authenticated grant for ${signature}`);
  assert.ok(migration.includes(`'public.${signature}'`), `pre/postcondition does not name ${signature}`);
}
for (const signature of internal) {
  const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(migration, new RegExp(`revoke all on function public\\.${escaped} from public, anon, authenticated;`, "i"), `missing internal revoke for ${signature}`);
  assert.doesNotMatch(migration, new RegExp(`grant execute on function public\\.${escaped} to authenticated;`, "i"), `internal helper granted to authenticated: ${signature}`);
}

assert.match(migration, /alter function public\.set_updated_at\(\) set search_path = pg_catalog, public;/i);
assert.match(migration, /p\.proconfig @> array\['search_path=pg_catalog, public'\]::text\[\]/i);
assert.doesNotMatch(migration, /grant\s+(?:all|execute)[\s\S]*?\b(?:public|anon)\s*;/i);
assert.doesNotMatch(migration, /revoke\s+all\s+on\s+all\s+functions/i);
assert.doesNotMatch(migration, /\b(?:insert\s+into|update\s+public\.|delete\s+from|alter\s+table|create\s+table|drop\s+table|truncate)\b/i);
assert.doesNotMatch(migration, /service_role|authorization:\s*bearer|eyJ[A-Za-z0-9_-]{20,}\./i);

assert.match(accessClient, /getCurrentSession/);
assert.match(accessClient, /if \(!session\?\.user\?\.id\) return null/);
assert.match(accessClient, /if \(!context\) return authRequiredResult\(\)/);
assert.match(accessClient, /rpc\(\s*"generate_daily_event_code"/);
assert.match(accessClient, /rpc\(\s*"validate_daily_event_code"/);

assert.match(operationsClient, /async function context\(\)/);
assert.match(operationsClient, /const session = await getCurrentSession/);
assert.match(operationsClient, /if \(!session\?\.user\?\.id\) return authRequired\(\)/);
assert.match(operationsClient, /const ctx = await context\(\)/g);
assert.match(operationsClient, /rpc\('upsert_event_staff_presence'/);
assert.match(operationsClient, /rpc\('update_event_task_status'/);
assert.match(operationsClient, /rpc\('create_event_responsibility_handover'/);

assert.match(calendarClient, /getCurrentSession|supabaseAuthClient/);
assert.match(calendarClient, /create_event_operation_from_calendar_event/);
assert.match(calendarClient, /link_calendar_event_to_event_operation/);

console.log(`Verified Phase 10W: ${authenticated.length} authenticated functions, ${internal.length} internal helpers, fixed trigger search_path, and authenticated frontend callers.`);

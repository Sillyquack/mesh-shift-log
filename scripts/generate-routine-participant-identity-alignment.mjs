import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = "supabase/phase10t_routine_participant_identity_conflict_alignment.sql";

if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== "--check")) {
  throw new Error("Usage: node scripts/generate-routine-participant-identity-alignment.mjs [--check]");
}

const read = (path) => readFileSync(resolve(ROOT, path), "utf8");

function extractFunction(source, name) {
  const marker = `create or replace function public.${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing source function ${name}.`);
  const endMarker = "\n$$;";
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`Unterminated source function ${name}.`);
  return source.slice(start, end + endMarker.length);
}

function replaceExact(source, before, after, expectedCount, label) {
  const actualCount = source.split(before).length - 1;
  if (actualCount !== expectedCount) {
    throw new Error(`${label}: expected ${expectedCount} exact source matches, found ${actualCount}.`);
  }
  return source.split(before).join(after);
}

function alignRunFunction(source, sourceName, targetName) {
  let output = replaceExact(
    source,
    `create or replace function public.${sourceName}(`,
    `create or replace function public.${targetName}(`,
    1,
    `${targetName} name`,
  );
  output = replaceExact(
    output,
    "organization_id, run_id, user_profile_id, display_name_snapshot,",
    "organization_id, run_id, user_profile_id, identity_type, display_name_snapshot,",
    1,
    `${targetName} insert columns`,
  );
  output = replaceExact(
    output,
    "v_actor.organization_id, v_run.id, v_actor.actor_profile_id,\n    v_actor.actor_display_name",
    "v_actor.organization_id, v_run.id, v_actor.actor_profile_id, 'personal_profile',\n    v_actor.actor_display_name",
    1,
    `${targetName} insert values`,
  );
  output = replaceExact(
    output,
    "on conflict (run_id, user_profile_id) do nothing;",
    "on conflict (run_id, user_profile_id) where identity_type = 'personal_profile' do nothing;",
    1,
    `${targetName} conflict target`,
  );
  output = replaceExact(
    output,
    "and participant.user_profile_id = v_actor.actor_profile_id;",
    "and participant.user_profile_id = v_actor.actor_profile_id\n    and participant.identity_type = 'personal_profile';",
    1,
    `${targetName} participant readback`,
  );
  return output;
}

function alignEnsureRunParticipant(source) {
  let output = replaceExact(
    source,
    "where participant.run_id=v_run.id and participant.user_profile_id=v_profile.id;",
    "where participant.run_id=v_run.id and participant.user_profile_id=v_profile.id\n      and participant.identity_type='personal_profile';",
    2,
    "routine_ensure_run_participant readbacks",
  );
  output = replaceExact(
    output,
    "organization_id,run_id,user_profile_id,display_name_snapshot,role_snapshot,",
    "organization_id,run_id,user_profile_id,identity_type,display_name_snapshot,role_snapshot,",
    1,
    "routine_ensure_run_participant insert columns",
  );
  output = replaceExact(
    output,
    "values(v_run.organization_id,v_run.id,v_profile.id,v_profile.display_name,v_profile.role,",
    "values(v_run.organization_id,v_run.id,v_profile.id,'personal_profile',v_profile.display_name,v_profile.role,",
    1,
    "routine_ensure_run_participant insert values",
  );
  output = replaceExact(
    output,
    "on conflict(run_id,user_profile_id) do nothing returning * into v_participant;",
    "on conflict(run_id,user_profile_id) where identity_type='personal_profile' do nothing returning * into v_participant;",
    1,
    "routine_ensure_run_participant conflict target",
  );
  return output;
}

function alignBundleParticipant(source, functionName, linkColumn) {
  let output = replaceExact(
    source,
    "where participant.bundle_id=v_bundle.id and participant.user_profile_id=v_profile.id;",
    "where participant.bundle_id=v_bundle.id and participant.user_profile_id=v_profile.id\n      and participant.identity_type='personal_profile';",
    2,
    `${functionName} readbacks`,
  );
  output = replaceExact(
    output,
    `organization_id,bundle_id,user_profile_id,${linkColumn}`,
    `organization_id,bundle_id,user_profile_id,identity_type,${linkColumn}`,
    1,
    `${functionName} insert columns`,
  );
  output = replaceExact(
    output,
    "values(v_bundle.organization_id,v_bundle.id,v_profile.id,",
    "values(v_bundle.organization_id,v_bundle.id,v_profile.id,'personal_profile',",
    1,
    `${functionName} insert values`,
  );
  output = replaceExact(
    output,
    "on conflict(bundle_id,user_profile_id) do nothing returning * into v_participant;",
    "on conflict(bundle_id,user_profile_id) where identity_type='personal_profile' do nothing returning * into v_participant;",
    1,
    `${functionName} conflict target`,
  );
  return output;
}

const phase10d = read("supabase/phase10d_routine_runs_and_snapshots.sql");
const phase10h = read("supabase/phase10h_routine_double_shift.sql");
const definitions = [
  alignRunFunction(
    extractFunction(phase10d, "create_or_get_routine_run"),
    "create_or_get_routine_run",
    "create_or_get_routine_run_phase10d",
  ),
  alignRunFunction(
    extractFunction(phase10d, "join_routine_run"),
    "join_routine_run",
    "join_routine_run_phase10d",
  ),
  alignEnsureRunParticipant(extractFunction(phase10h, "routine_ensure_run_participant")),
  alignBundleParticipant(
    extractFunction(phase10h, "routine_ensure_bundle_participant"),
    "routine_ensure_bundle_participant",
    "opening_run_participant_id,closing_run_participant_id,",
  ),
  alignBundleParticipant(
    extractFunction(phase10h, "routine_ensure_closing_bundle_participant"),
    "routine_ensure_closing_bundle_participant",
    "closing_run_participant_id,",
  ),
];

const generated = `begin;

-- Phase 10T aligns the five final effective personal-participant inserts with
-- the partial identity indexes introduced by Phase 10J. CREATE OR REPLACE
-- preserves each existing function's owner and ACL; no grants are changed.

${definitions.join("\n\n")}

commit;
`;

const staleTarget = /on\s+conflict\s*\(\s*(?:run_id|bundle_id)\s*,\s*user_profile_id\s*\)\s+do\s+nothing/gi;
if (staleTarget.test(generated)) throw new Error("Generated Phase 10T contains a stale personal conflict target.");
if ((generated.match(/where identity_type\s*=\s*'personal_profile'\s+do nothing/gi) ?? []).length !== 5) {
  throw new Error("Generated Phase 10T must contain exactly five personal partial-index conflict predicates.");
}
if ((generated.match(/identity_type\s*=\s*'personal_profile'/gi) ?? []).length !== 13) {
  throw new Error("Generated Phase 10T must contain five conflict predicates and eight identity-qualified readbacks.");
}

if (process.argv[2] === "--check") {
  const existing = read(OUTPUT);
  if (existing !== generated) throw new Error(`${OUTPUT} is not the deterministic generated output.`);
  console.log(`Verified ${OUTPUT}`);
} else {
  writeFileSync(resolve(ROOT, OUTPUT), generated);
  console.log(`Generated ${OUTPUT}`);
}

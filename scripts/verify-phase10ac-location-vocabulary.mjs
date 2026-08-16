import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { ROUTINE_LOCATION_TYPES } from "../src/features/routines-v2/data/routineLocationTypes.js";
import {
  ROUTINE_STANDARD_CREATABLE_SOURCE_KINDS,
  ROUTINE_STANDARD_SOURCE_KIND_LABELS,
} from "../src/features/routines-v2/data/routineStandardSourceKinds.js";
import * as templateVocabulary from "../src/features/routines-v2/data/routineTemplateEditorModel.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.141";
const DATABASE = "phase10ac_provider_vocabulary_test";
const CONTAINER = `mesh-shift-log-phase10ac-${process.pid}-${randomUUID().slice(0, 8)}`;
const PASSWORD = `phase10ac-${randomUUID()}`;
const ORGANIZATION_ID = "ac000000-0000-4000-8000-000000000001";
const MANAGER_ID = "ac100000-0000-4000-8000-000000000001";
const TARGET_TYPES = [
  "zone", "room", "station", "storage", "storage_zone", "shelf", "fridge",
  "toilet", "door", "equipment", "collection_point", "other",
];
const BASELINE_TYPES = TARGET_TYPES.filter((value) => !["storage_zone", "shelf"].includes(value));
const REJECTED_TYPES = ["shelf_zone", "storage-shelf", "inventory_shelf", "", "arbitrary_unknown_type"];
const BASELINE_STANDARD_SOURCES = ["manual", "inventory_readonly", "asset_registry_readonly", "location_set"];
const TARGET_STANDARD_SOURCES = [...BASELINE_STANDARD_SOURCES, "location_standards"];
const REJECTED_STANDARD_SOURCES = ["location_standard", "inventory_location_standards", "location-targets", "", "arbitrary_unknown_value"];
const TARGET_DEPENDENCY_TYPES = ["must_complete", "must_resolve", "must_reach_time", "must_receive_transfer", "complete_predecessor_on_successor"];
const migrationPath = resolve(ROOT, "supabase/phase10ac_routine_provider_vocabulary_alignment.sql");
const migrationSql = readFileSync(migrationPath, "utf8");
const pack = JSON.parse(readFileSync(resolve(ROOT, "content/routine-engine/mesh-routine-content-v1-5r.json"), "utf8"));
const managerSource = readFileSync(resolve(ROOT, "src/features/routines-v2/manager/RoutineStandardsManager.jsx"), "utf8");
const sectionSource = readFileSync(resolve(ROOT, "src/features/routines-v2/manager/RoutineSectionEditor.jsx"), "utf8");
const workspaceSource = readFileSync(resolve(ROOT, "supabase/phase10k2_routine_manager_control_center.sql"), "utf8");
const operationalTimeSource = readFileSync(resolve(ROOT, "supabase/phase10f_routine_operational_time.sql"), "utf8");
let started = false;
let passed = 0;

if (process.argv.length > 2) throw new Error("This verifier accepts no external database or network arguments.");

function check(label, condition) {
  if (!condition) throw new Error(`FAIL ${String(passed + 1).padStart(3, "0")} ${label}`);
  passed += 1;
  console.log(`PASS ${String(passed).padStart(3, "0")} ${label}`);
}

function command(name, args, options = {}) {
  const result = spawnSync(name, args, {
    cwd: ROOT,
    encoding: "utf8",
    input: options.input,
    timeout: options.timeout ?? 300_000,
    maxBuffer: 64 * 1024 * 1024,
    stdio: "pipe",
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${name} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

const docker = (args, options) => command("docker", args, options);
function psql(sql, { tuplesOnly = false, allowFailure = false } = {}) {
  const args = [
    "exec", "-i", CONTAINER, "psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1",
    "--username=postgres", `--dbname=${DATABASE}`,
  ];
  if (tuplesOnly) args.push("--tuples-only", "--no-align", "--quiet");
  return docker(args, { input: sql.replace(/^\uFEFF/, ""), allowFailure });
}
const scalar = (sql) => psql(sql, { tuplesOnly: true }).stdout.trim();
const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;

function cleanup() {
  if (!started) return;
  if (!/^mesh-shift-log-phase10ac-[0-9]+-[a-f0-9]{8}$/.test(CONTAINER)) {
    throw new Error("Unsafe Phase 10AC verifier container name.");
  }
  docker(["rm", "--force", CONTAINER], { allowFailure: true, timeout: 30_000 });
  started = docker(["container", "inspect", CONTAINER], { allowFailure: true, timeout: 30_000 }).status === 0;
}

const constraintDefinition = (table, constraint) => scalar(`
  select pg_get_constraintdef(oid,true)||'|validated='||convalidated::text
  from pg_constraint
  where conrelid='public.${table}'::regclass
    and conname='${constraint}';
`);
const allowedValues = (table, constraint) => [...constraintDefinition(table, constraint)
  .matchAll(/'([^']+)'::text/g)].map((match) => match[1]).sort();
const locationRowFingerprint = () => scalar(`
  select encode(extensions.digest(convert_to(coalesce(jsonb_agg(to_jsonb(location) order by location.id),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex')
  from public.routine_locations location;
`);
const standardRowFingerprint = () => scalar(`
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'standards',(select coalesce(jsonb_agg(to_jsonb(standard) order by standard.id),'[]'::jsonb) from public.routine_standards standard),
    'revisions',(select coalesce(jsonb_agg(to_jsonb(revision) order by revision.id),'[]'::jsonb) from public.routine_standard_revisions revision)
  )::text,'UTF8'),'sha256'),'hex');
`);
const schemaFingerprint = () => scalar(`
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'constraints',(select jsonb_agg(jsonb_build_object(
      'table',relation.relname,'name',constraint_row.conname,'definition',pg_get_constraintdef(constraint_row.oid,true),
      'validated',constraint_row.convalidated,'local',constraint_row.conislocal
    ) order by relation.relname,constraint_row.conname)
      from pg_constraint constraint_row join pg_class relation on relation.oid=constraint_row.conrelid
      where (constraint_row.conrelid='public.routine_locations'::regclass and constraint_row.conname='routine_locations_type_check')
         or (constraint_row.conrelid='public.routine_standards'::regclass and constraint_row.conname='routine_standards_source_kind_check')),
    'functions',(select jsonb_agg(pg_get_functiondef(procedure.oid) order by procedure.oid)
      from pg_proc procedure where procedure.oid=any(array[
        'public.create_routine_standard(text,text,text,text,text,text,boolean)'::regprocedure,
        'public.create_routine_standard_revision(uuid,jsonb,timestamp with time zone,text,uuid,bigint)'::regprocedure
      ]))
  )::text,'UTF8'),'sha256'),'hex');
`);

const managerCall = (type, key, id = null, expectedRevision = null, name = null) => `
  select set_config('request.jwt.claim.sub','${MANAGER_ID}',false);
  set role authenticated;
  select row_to_json(saved)::text from public.upsert_routine_location(
    ${sqlLiteral(key)},${sqlLiteral(name ?? `Phase 10AC ${key}`)},${sqlLiteral(type)},null,10,'{}'::jsonb,
    ${id ? sqlLiteral(id) : "null"}::uuid,${expectedRevision ?? "null"}::bigint
  ) saved;
`;

const managerStandardCall = (sourceKind, key) => `
  select set_config('request.jwt.claim.sub','${MANAGER_ID}',false);
  set role authenticated;
  select row_to_json(saved)::text from public.create_routine_standard(
    ${sqlLiteral(key)},${sqlLiteral(`Phase 10AC ${key}`)},null,'object',null,${sqlLiteral(sourceKind)},true
  ) saved;
`;

const managerStandardRevisionCall = (standardId) => `
  select set_config('request.jwt.claim.sub','${MANAGER_ID}',false);
  set role authenticated;
  select public.create_routine_standard_revision(
    '${standardId}','{"impersonated":true}'::jsonb,null,'Manager impersonation rejection probe.',
    'ac400000-0000-4000-8000-000000000001',1
  );
`;

const allTasks = [...pack.opening.tasks, ...pack.closing.tasks];
const providerVocabularyContracts = [
  ["routine_locations", "routine_locations_type_check", pack.locations.map((item) => item.type)],
  ["routine_standards", "routine_standards_source_kind_check", pack.standards.map((item) => item.sourceKind)],
  ["routine_standards", "routine_standards_value_type_check", pack.standards.map((item) => item.valueType)],
  ["routine_template_sections", "routine_template_sections_phase_check", pack.sections.map((item) => item.phaseType)],
  ["routine_template_tasks", "routine_template_tasks_type_check", allTasks.map((item) => item.taskType)],
  ["routine_template_tasks", "routine_template_tasks_criticality_check", allTasks.map((item) => item.criticality)],
  ["routine_template_tasks", "routine_template_tasks_initial_assessment_check", allTasks.map((item) => item.initialAssessmentPolicy)],
  ["routine_template_tasks", "routine_template_tasks_completion_check", allTasks.map((item) => item.completionPolicy)],
  ["routine_template_tasks", "routine_template_tasks_na_check", allTasks.map((item) => item.notApplicablePolicy)],
  ["routine_template_tasks", "routine_template_tasks_verification_check", allTasks.map((item) => item.verificationPolicy)],
  ["routine_template_tasks", "routine_template_tasks_repeat_check", allTasks.map((item) => item.repeatPolicy)],
  ["routine_template_tasks", "routine_template_tasks_availability_check", allTasks.map((item) => item.availabilityMode)],
  ["routine_template_task_items", "routine_template_task_items_type_check", allTasks.flatMap((task) => task.items || []).map((item) => item.itemType)],
  ["routine_template_task_items", "routine_template_task_items_source_check", allTasks.flatMap((task) => task.items || []).map((item) => item.sourceKind)],
  ["routine_template_task_dependencies", "routine_template_task_dependencies_type_check", [...pack.opening.dependencies, ...pack.closing.dependencies].map((item) => item.dependencyType)],
  ["routine_template_task_relations", "routine_template_task_relations_type_check", [...pack.opening.relations, ...pack.closing.relations].map((item) => item.relationType)],
];

const resetBothConstraintsToBaseline = () => psql(`
  alter table public.routine_locations drop constraint routine_locations_type_check;
  alter table public.routine_locations add constraint routine_locations_type_check check(location_type in(
    'zone','room','station','storage','fridge','toilet','door','equipment','collection_point','other'
  ));
  alter table public.routine_standards drop constraint routine_standards_source_kind_check;
  alter table public.routine_standards add constraint routine_standards_source_kind_check check(source_kind in(
    'manual','inventory_readonly','asset_registry_readonly','location_set'
  ));
`);

async function main() {
  check("Phase 10AC migration file exists", existsSync(migrationPath));
  check("migration is one explicit transaction", /^-- Phase 10AC:[\s\S]*\nbegin;/i.test(migrationSql) && /commit;\s*$/i.test(migrationSql));
  check("migration classifies both exact constraints before either replacement",
    migrationSql.indexOf("v_location_state :=") < migrationSql.indexOf("drop constraint routine_locations_type_check")
      && migrationSql.indexOf("v_standard_state :=") < migrationSql.indexOf("drop constraint routine_locations_type_check")
      && migrationSql.includes("THIRD_STATE routine_locations_type_check")
      && migrationSql.includes("THIRD_STATE routine_standards_source_kind_check"));
  check("migration keeps location_standards provider/system-managed at both manager mutation RPCs",
    (migrationSql.match(/source_kind = 'location_standards'/g) || []).length >= 2
      && /cannot be created through the manager standard contract/.test(migrationSql)
      && /cannot be authored through the manager revision contract/.test(migrationSql));
  check("canonical provider is unchanged and exact", pack.packVersion === "1.5R" && pack.packHash === "710c9412eabc8f2e9c5a6488499ac4654cd7c94b62138eaed9563ab5f0203c9c");
  const providerTypes = [...new Set(pack.locations.map((location) => location.type))].sort();
  check("provider location types are a subset of the target vocabulary", providerTypes.every((value) => TARGET_TYPES.includes(value)));
  check("provider uses shelf once and storage_zone twice", pack.locations.filter((item) => item.type === "shelf").length === 1 && pack.locations.filter((item) => item.type === "storage_zone").length === 2);
  const providerStandardSources = [...new Set(pack.standards.map((standard) => standard.sourceKind))].sort();
  check("provider standard source kinds are a subset of the target vocabulary",
    providerStandardSources.every((value) => TARGET_STANDARD_SOURCES.includes(value)));
  check("provider standard source distribution is exact",
    pack.standards.filter((item) => item.sourceKind === "manual").length === 13
      && pack.standards.filter((item) => item.sourceKind === "location_set").length === 1
      && pack.standards.filter((item) => item.sourceKind === "location_standards").length === 1
      && pack.standards.find((item) => item.sourceKind === "location_standards")?.key === "main-storage-express-shelf-refill");
  const providerDependencies = [...pack.opening.dependencies, ...pack.closing.dependencies];
  check("provider dependency distribution is exact",
    providerDependencies.filter((item) => item.dependencyType === "must_complete").length === 38
      && providerDependencies.filter((item) => item.dependencyType === "complete_predecessor_on_successor").length === 3
      && providerDependencies.length === 41);
  check("manager display knows location_standards without making it creatable",
    JSON.stringify(ROUTINE_STANDARD_CREATABLE_SOURCE_KINDS) === JSON.stringify(BASELINE_STANDARD_SOURCES)
      && ROUTINE_STANDARD_SOURCE_KIND_LABELS.location_standards === "Location standards · read only"
      && !ROUTINE_STANDARD_CREATABLE_SOURCE_KINDS.includes("location_standards")
      && managerSource.includes("ROUTINE_STANDARD_CREATABLE_SOURCE_KINDS")
      && workspaceSource.includes("'externalReadonly', standard.source_kind <> 'manual'"));
  check("all mirrored manager closed vocabularies contain the exact provider values",
    JSON.stringify(ROUTINE_LOCATION_TYPES) === JSON.stringify(TARGET_TYPES)
      && JSON.stringify(templateVocabulary.DEPENDENCY_TYPES) === JSON.stringify(TARGET_DEPENDENCY_TYPES)
      && sectionSource.includes('"overview", "startup", "service", "checkpoint", "preclose", "final_close", "verification", "security", "handover", "other"')
      && [
        ["TASK_TYPES", [...pack.opening.tasks, ...pack.closing.tasks].map((item) => item.taskType)],
        ["CRITICALITIES", [...pack.opening.tasks, ...pack.closing.tasks].map((item) => item.criticality)],
        ["INITIAL_POLICIES", [...pack.opening.tasks, ...pack.closing.tasks].map((item) => item.initialAssessmentPolicy)],
        ["COMPLETION_POLICIES", [...pack.opening.tasks, ...pack.closing.tasks].map((item) => item.completionPolicy)],
        ["NA_POLICIES", [...pack.opening.tasks, ...pack.closing.tasks].map((item) => item.notApplicablePolicy)],
        ["VERIFICATION_POLICIES", [...pack.opening.tasks, ...pack.closing.tasks].map((item) => item.verificationPolicy)],
        ["REPEAT_POLICIES", [...pack.opening.tasks, ...pack.closing.tasks].map((item) => item.repeatPolicy)],
        ["AVAILABILITY_MODES", [...pack.opening.tasks, ...pack.closing.tasks].map((item) => item.availabilityMode)],
        ["ITEM_TYPES", [...pack.opening.tasks, ...pack.closing.tasks].flatMap((task) => task.items || []).map((item) => item.itemType)],
        ["SOURCE_KINDS", [...pack.opening.tasks, ...pack.closing.tasks].flatMap((task) => task.items || []).map((item) => item.sourceKind)],
        ["DEPENDENCY_TYPES", [...pack.opening.dependencies, ...pack.closing.dependencies].map((item) => item.dependencyType)],
        ["RELATION_TYPES", [...pack.opening.relations, ...pack.closing.relations].map((item) => item.relationType)],
      ].every(([name, values]) => [...new Set(values)].every((value) => templateVocabulary[name].includes(value))));

  command("docker", ["--version"]);
  docker(["image", "inspect", IMAGE]);
  docker([
    "run", "--detach", "--rm", "--pull", "never", "--name", CONTAINER, "--network", "none",
    "--env", `POSTGRES_PASSWORD=${PASSWORD}`, "--env", `POSTGRES_DB=${DATABASE}`, IMAGE,
  ]);
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const logs = docker(["logs", CONTAINER], { allowFailure: true });
    const state = docker(["exec", CONTAINER, "pg_isready", "--username=postgres", `--dbname=${DATABASE}`], { allowFailure: true });
    if (/PostgreSQL init process complete; ready for start up/i.test(`${logs.stdout}\n${logs.stderr}`) && state.status === 0) { ready = true; break; }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  check("network-isolated disposable PostgreSQL is ready", ready);

  docker([
    "exec", "-i", CONTAINER, "psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1",
    "--username=supabase_admin", `--dbname=${DATABASE}`,
  ], { input: `grant connect,create,temporary on database ${DATABASE} to postgres; grant usage,create on schema public to postgres;` });

  for (const path of ["supabase/schema.sql", "supabase/phase7a_workbar_device_auth.sql", "supabase/phase10a_routine_engine_foundation.sql", "supabase/phase10b_routine_templates.sql"]) {
    psql(readFileSync(resolve(ROOT, path), "utf8"));
  }
  check("Phase 10F contains the only later provider-vocabulary constraint update",
    operationalTimeSource.includes("add constraint routine_template_task_dependencies_type_check")
      && operationalTimeSource.includes("'complete_predecessor_on_successor'"));
  psql(`
    alter table public.routine_template_task_dependencies
      drop constraint routine_template_task_dependencies_type_check;
    alter table public.routine_template_task_dependencies
      add constraint routine_template_task_dependencies_type_check check (dependency_type in (
        'must_complete','must_resolve','must_reach_time','must_receive_transfer','complete_predecessor_on_successor'
      ));
  `);
  psql(`
    insert into public.organizations(id,name,slug) values ('${ORGANIZATION_ID}','Phase 10AC','phase10ac');
    insert into auth.users(id) values ('${MANAGER_ID}');
    insert into public.user_profiles(id,organization_id,display_name,role,active,is_shared_device)
    values ('${MANAGER_ID}','${ORGANIZATION_ID}','Phase 10AC Manager','manager',true,false);
    insert into public.routine_locations(
      id,organization_id,location_key,name,location_type,sort_order,metadata,revision,
      created_at,updated_at,created_by_auth_user_id,updated_by_auth_user_id
    ) values (
      'ac200000-0000-4000-8000-000000000001','${ORGANIZATION_ID}','baseline-storage','Baseline storage','storage',1,
      '{"fixture":true}',7,'2026-08-16 01:02:03+00','2026-08-16 04:05:06+00','${MANAGER_ID}','${MANAGER_ID}'
    );
    insert into public.routine_standards(
      id,organization_id,standard_key,label,description,value_type,unit,source_kind,current_revision_id,
      active,revision,created_at,updated_at,created_by_auth_user_id,updated_by_auth_user_id
    ) values
      ('ac300000-0000-4000-8000-000000000001','${ORGANIZATION_ID}','baseline-manual','Baseline manual','Manual fixture','object',null,'manual',null,true,7,'2026-08-16 01:02:03+00','2026-08-16 04:05:06+00','${MANAGER_ID}','${MANAGER_ID}'),
      ('ac300000-0000-4000-8000-000000000002','${ORGANIZATION_ID}','baseline-inventory','Baseline inventory','Inventory fixture','object',null,'inventory_readonly',null,true,7,'2026-08-16 01:02:03+00','2026-08-16 04:05:06+00','${MANAGER_ID}','${MANAGER_ID}'),
      ('ac300000-0000-4000-8000-000000000003','${ORGANIZATION_ID}','baseline-assets','Baseline assets','Asset fixture','object',null,'asset_registry_readonly',null,true,7,'2026-08-16 01:02:03+00','2026-08-16 04:05:06+00','${MANAGER_ID}','${MANAGER_ID}'),
      ('ac300000-0000-4000-8000-000000000004','${ORGANIZATION_ID}','baseline-location-set','Baseline location set','Location set fixture','object',null,'location_set',null,true,7,'2026-08-16 01:02:03+00','2026-08-16 04:05:06+00','${MANAGER_ID}','${MANAGER_ID}');
    insert into public.routine_standard_revisions(
      id,organization_id,standard_id,revision_number,value_json,effective_from,reason,created_at,
      created_by_auth_user_id,content_hash,idempotency_key
    ) values
      ('ac500000-0000-4000-8000-000000000001','${ORGANIZATION_ID}','ac300000-0000-4000-8000-000000000001',1,'{"fixture":"manual"}','2026-08-16 00:00:00+00','Preservation fixture.','2026-08-16 01:02:03+00','${MANAGER_ID}',md5('trigger-replaces'),'ac600000-0000-4000-8000-000000000001'),
      ('ac500000-0000-4000-8000-000000000002','${ORGANIZATION_ID}','ac300000-0000-4000-8000-000000000002',1,'{"fixture":"inventory"}','2026-08-16 00:00:00+00','Preservation fixture.','2026-08-16 01:02:03+00','${MANAGER_ID}',md5('trigger-replaces'),'ac600000-0000-4000-8000-000000000002'),
      ('ac500000-0000-4000-8000-000000000003','${ORGANIZATION_ID}','ac300000-0000-4000-8000-000000000003',1,'{"fixture":"assets"}','2026-08-16 00:00:00+00','Preservation fixture.','2026-08-16 01:02:03+00','${MANAGER_ID}',md5('trigger-replaces'),'ac600000-0000-4000-8000-000000000003'),
      ('ac500000-0000-4000-8000-000000000004','${ORGANIZATION_ID}','ac300000-0000-4000-8000-000000000004',1,'{"fixture":"location-set"}','2026-08-16 00:00:00+00','Preservation fixture.','2026-08-16 01:02:03+00','${MANAGER_ID}',md5('trigger-replaces'),'ac600000-0000-4000-8000-000000000004');
    update public.routine_standards
    set current_revision_id = ('ac500000-0000-4000-8000-' || right(id::text,12))::uuid
    where id between 'ac300000-0000-4000-8000-000000000001' and 'ac300000-0000-4000-8000-000000000004';
  `);
  const missingProviderValues = providerVocabularyContracts.flatMap(([table, constraint, values]) => {
    const accepted = allowedValues(table, constraint);
    return [...new Set(values)].filter((value) => !accepted.includes(value)).map((value) => `${table}.${constraint}:${value}`);
  }).sort();
  check("complete disposable preflight finds exactly the three authorized provider gaps",
    JSON.stringify(missingProviderValues) === JSON.stringify([
      "routine_locations.routine_locations_type_check:shelf",
      "routine_locations.routine_locations_type_check:storage_zone",
      "routine_standards.routine_standards_source_kind_check:location_standards",
    ]));
  check("BASELINE starts with the exact historical location and standard-source vocabularies",
    JSON.stringify(allowedValues("routine_locations", "routine_locations_type_check")) === JSON.stringify([...BASELINE_TYPES].sort())
      && JSON.stringify(allowedValues("routine_standards", "routine_standards_source_kind_check")) === JSON.stringify([...BASELINE_STANDARD_SOURCES].sort()));
  const baselineLocationRows = locationRowFingerprint();
  const baselineStandardRows = standardRowFingerprint();

  psql(migrationSql);
  check("BASELINE applies both exact validated target vocabularies",
    JSON.stringify(allowedValues("routine_locations", "routine_locations_type_check")) === JSON.stringify([...TARGET_TYPES].sort())
      && JSON.stringify(allowedValues("routine_standards", "routine_standards_source_kind_check")) === JSON.stringify([...TARGET_STANDARD_SOURCES].sort())
      && constraintDefinition("routine_locations", "routine_locations_type_check").endsWith("|validated=true")
      && constraintDefinition("routine_standards", "routine_standards_source_kind_check").endsWith("|validated=true"));
  const unresolvedAfterPhase10ac = providerVocabularyContracts.flatMap(([table, constraint, values]) => {
    const accepted = allowedValues(table, constraint);
    return [...new Set(values)].filter((value) => !accepted.includes(value)).map((value) => `${table}.${constraint}:${value}`);
  });
  check("complete provider/database parity has zero unresolved closed-vocabulary values after Phase 10AC", unresolvedAfterPhase10ac.length === 0);
  check("migration preserves every location field, revision, actor, and timestamp", locationRowFingerprint() === baselineLocationRows);
  check("migration preserves every standard and immutable revision field", standardRowFingerprint() === baselineStandardRows);
  check("manager RPC security and grants remain narrow",
    scalar(`select has_function_privilege('authenticated','public.create_routine_standard(text,text,text,text,text,text,boolean)','execute')
      and not has_function_privilege('anon','public.create_routine_standard(text,text,text,text,text,text,boolean)','execute')
      and has_function_privilege('authenticated','public.create_routine_standard_revision(uuid,jsonb,timestamptz,text,uuid,bigint)','execute')
      and not has_function_privilege('anon','public.create_routine_standard_revision(uuid,jsonb,timestamptz,text,uuid,bigint)','execute');`) === "t"
      && scalar(`select bool_and(prosecdef and proconfig = array['search_path=pg_catalog']) from pg_proc
        where oid=any(array['public.create_routine_standard(text,text,text,text,text,text,boolean)'::regprocedure,
          'public.create_routine_standard_revision(uuid,jsonb,timestamptz,text,uuid,bigint)'::regprocedure]);`) === "t");

  const shelfResult = JSON.parse(psql(managerCall("shelf", "manager-shelf"), { tuplesOnly: true }).stdout.trim().split("\n").at(-1));
  const zoneResult = JSON.parse(psql(managerCall("storage_zone", "manager-storage-zone"), { tuplesOnly: true }).stdout.trim().split("\n").at(-1));
  check("normal manager location contract accepts shelf and storage_zone", shelfResult.location_type === "shelf" && zoneResult.location_type === "storage_zone");
  const editedShelf = JSON.parse(psql(managerCall("shelf", "manager-shelf", shelfResult.id, shelfResult.revision, "Edited shelf name"), { tuplesOnly: true }).stdout.trim().split("\n").at(-1));
  check("editing another field round-trips shelf without coercion", editedShelf.name === "Edited shelf name" && editedShelf.location_type === "shelf" && editedShelf.revision === shelfResult.revision + 1);

  for (const value of REJECTED_TYPES) {
    const result = psql(managerCall(value, `rejected-${value || "empty"}`), { allowFailure: true });
    check(`database rejects invalid location type ${JSON.stringify(value)}`, result.status !== 0 && /routine_locations_type_check/i.test(result.stderr));
  }

  const providerStandard = pack.standards.find((item) => item.sourceKind === "location_standards");
  const providerSourceAcceptance = psql(`
    begin;
    insert into public.routine_standards(organization_id,standard_key,label,description,value_type,unit,source_kind,active)
    values ('${ORGANIZATION_ID}',${sqlLiteral(providerStandard.key)},${sqlLiteral(providerStandard.label)},null,
      ${sqlLiteral(providerStandard.valueType)},null,${sqlLiteral(providerStandard.sourceKind)},true);
    rollback;
  `);
  check("exact provider location_standards row is accepted by the system/installer database contract", providerSourceAcceptance.status === 0);
  check("all four existing source kinds and immutable histories remain accepted and unchanged", standardRowFingerprint() === baselineStandardRows);
  const managerProviderCreate = psql(managerStandardCall("location_standards", "manager-provider-impersonation"), { allowFailure: true });
  check("manager cannot create an arbitrary location_standards standard",
    managerProviderCreate.status !== 0 && /provider\/system managed/i.test(managerProviderCreate.stderr));
  for (const value of REJECTED_STANDARD_SOURCES) {
    const result = psql(managerStandardCall(value, `rejected-standard-${value || "empty"}`), { allowFailure: true });
    check(`database rejects invalid standard source kind ${JSON.stringify(value)}`,
      result.status !== 0 && /routine_standards_source_kind_check/i.test(result.stderr));
  }
  psql(`insert into public.routine_standards(
    id,organization_id,standard_key,label,value_type,source_kind,active,revision,created_by_auth_user_id,updated_by_auth_user_id
  ) values (
    'ac300000-0000-4000-8000-000000000099','${ORGANIZATION_ID}','provider-readonly-probe','Provider readonly probe',
    'object','location_standards',true,1,'${MANAGER_ID}','${MANAGER_ID}'
  );`);
  const managerProviderRevision = psql(managerStandardRevisionCall("ac300000-0000-4000-8000-000000000099"), { allowFailure: true });
  check("manager cannot author immutable values for a location_standards standard",
    managerProviderRevision.status !== 0 && /authoritative inventory location standards/i.test(managerProviderRevision.stderr));
  psql("delete from public.routine_standards where id='ac300000-0000-4000-8000-000000000099';");

  const beforeReapplyLocations = locationRowFingerprint();
  const beforeReapplyStandards = standardRowFingerprint();
  const beforeReapplySchema = schemaFingerprint();
  psql(migrationSql);
  check("TARGET reapplication is an exact schema no-op", schemaFingerprint() === beforeReapplySchema);
  check("TARGET reapplication preserves all location, standard, and revision rows",
    locationRowFingerprint() === beforeReapplyLocations && standardRowFingerprint() === beforeReapplyStandards);

  psql(`
    delete from public.routine_locations where location_key in ('manager-shelf','manager-storage-zone');
    alter table public.routine_locations drop constraint routine_locations_type_check;
    alter table public.routine_locations add constraint routine_locations_type_check check(location_type in(
      'zone','room','station','storage','fridge','toilet','door','equipment','collection_point','other'
    ));
    alter table public.routine_standards drop constraint routine_standards_source_kind_check;
    alter table public.routine_standards add constraint routine_standards_source_kind_check check(source_kind in(
      'manual','inventory_readonly','asset_registry_readonly','location_set','third_state'
    ));
  `);
  const thirdStateLocation = constraintDefinition("routine_locations", "routine_locations_type_check");
  const thirdStateStandard = constraintDefinition("routine_standards", "routine_standards_source_kind_check");
  const thirdStateLocations = locationRowFingerprint();
  const thirdStateStandards = standardRowFingerprint();
  const thirdStateResult = psql(migrationSql, { allowFailure: true });
  check("standard-source THIRD_STATE fails closed before either constraint changes",
    thirdStateResult.status !== 0 && /THIRD_STATE routine_standards_source_kind_check/i.test(thirdStateResult.stderr));
  check("THIRD_STATE rejection preserves both constraints and every row",
    constraintDefinition("routine_locations", "routine_locations_type_check") === thirdStateLocation
      && constraintDefinition("routine_standards", "routine_standards_source_kind_check") === thirdStateStandard
      && locationRowFingerprint() === thirdStateLocations && standardRowFingerprint() === thirdStateStandards);

  resetBothConstraintsToBaseline();
  const beforeRollbackLocations = locationRowFingerprint();
  const beforeRollbackStandards = standardRowFingerprint();
  const beforeRollbackLocationDefinition = constraintDefinition("routine_locations", "routine_locations_type_check");
  const beforeRollbackStandardDefinition = constraintDefinition("routine_standards", "routine_standards_source_kind_check");
  for (const [label, marker] of [
    ["first", "-- Phase 10AC first constraint replacement complete."],
    ["second", "-- Phase 10AC second constraint replacement complete."],
  ]) {
    const injectedSql = migrationSql.replace(marker, `${marker}\n    raise exception 'Injected Phase 10AC ${label} replacement rollback probe.';`);
    const rollbackResult = psql(injectedSql, { allowFailure: true });
    check(`injected failure after the ${label} replacement aborts the migration`,
      rollbackResult.status !== 0 && new RegExp(`Injected Phase 10AC ${label} replacement rollback probe`, "i").test(rollbackResult.stderr));
    check(`failure after the ${label} replacement restores both constraints and every row`,
      constraintDefinition("routine_locations", "routine_locations_type_check") === beforeRollbackLocationDefinition
        && constraintDefinition("routine_standards", "routine_standards_source_kind_check") === beforeRollbackStandardDefinition
        && locationRowFingerprint() === beforeRollbackLocations && standardRowFingerprint() === beforeRollbackStandards);
  }
  psql(migrationSql);

  const providerLocationInsertSql = `
    begin;
    ${providerTypes.map((type, index) => managerCall(type, `provider-${index}-${type}`).replace(/set role authenticated;/g, "set local role authenticated;")).join("\n")}
    rollback;
  `;
  check("every distinct 1.5R provider location type passes the post-10AC manager/database contract", psql(providerLocationInsertSql).status === 0);
  const providerStandardInsertSql = `
    begin;
    ${providerStandardSources.map((sourceKind, index) => `
      insert into public.routine_standards(organization_id,standard_key,label,value_type,source_kind,active)
      values ('${ORGANIZATION_ID}','provider-source-${index}','Provider source ${index}','object',${sqlLiteral(sourceKind)},true);`).join("\n")}
    rollback;
  `;
  check("every distinct 1.5R standard source kind passes the post-10AC provider/system contract", psql(providerStandardInsertSql).status === 0);
  check("provider contract probes roll back without changing any fixture row",
    locationRowFingerprint() === beforeRollbackLocations && standardRowFingerprint() === beforeRollbackStandards);

  console.log(`Phase 10AC provider vocabulary verification: ${passed}/${passed} passed.`);
}

try { await main(); }
catch (error) { console.error(String(error?.stack ?? error)); process.exitCode = 1; }
finally { cleanup(); console.log(`Disposable database cleanup: ${started ? "FAILED" : "complete"}`); }

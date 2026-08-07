import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.141";
const DATABASE = "phase10l_routine_content_test";
const ROLE = "supabase_admin";
const CONTAINER = `mesh-shift-log-phase10l-${process.pid}-${randomUUID().slice(0,8)}`;
const PASSWORD = `phase10l-${randomUUID()}`;
let started = false;
let passCount = 0;

if (process.argv.length > 2) throw new Error("This verifier accepts no network, URL, host, project, or production arguments.");
const absolute = (path) => resolve(ROOT,path);
function check(label, condition) { if (!condition) throw new Error(`FAIL ${String(passCount+1).padStart(3,"0")} ${label}`); passCount += 1; console.log(`PASS ${String(passCount).padStart(3,"0")} ${label}`); }
function command(name,args,options={}) { const result=spawnSync(name,args,{cwd:ROOT,encoding:"utf8",input:options.input,timeout:options.timeout??300_000,stdio:"pipe"}); if(result.error)throw result.error; if(result.status!==0&&!options.allowFailure)throw new Error(`${name} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`); return result; }
const docker=(args,options)=>command("docker",args,options);
function psql(sql,{tuplesOnly=false,transaction=false,allowFailure=false}={}) { const args=["exec","-i",CONTAINER,"psql","--no-psqlrc","--set=ON_ERROR_STOP=1",`--username=${ROLE}`,`--dbname=${DATABASE}`]; if(tuplesOnly)args.push("--tuples-only","--no-align","--quiet"); if(transaction)args.push("--single-transaction"); return docker(args,{input:sql,allowFailure,timeout:300_000}); }
const scalar=(sql)=>psql(sql,{tuplesOnly:true}).stdout.trim();
function psqlAsync(sql) { return new Promise((resolvePromise)=>{ const child=spawn("docker",["exec","-i",CONTAINER,"psql","--no-psqlrc","--set=ON_ERROR_STOP=1",`--username=${ROLE}`,`--dbname=${DATABASE}`],{cwd:ROOT,stdio:["pipe","pipe","pipe"]}); let stdout="",stderr=""; child.stdout.on("data",(data)=>stdout+=data); child.stderr.on("data",(data)=>stderr+=data); child.on("close",(status)=>resolvePromise({status,stdout,stderr})); child.stdin.end(sql); }); }
function cleanup(){if(!started)return;if(!/^mesh-shift-log-phase10l-[0-9]+-[a-f0-9]{8}$/.test(CONTAINER))throw new Error("Unsafe verifier container name.");docker(["rm","--force",CONTAINER],{allowFailure:true,timeout:30_000});started=false;}
process.once("SIGINT",()=>{cleanup();process.exit(130);});process.once("SIGTERM",()=>{cleanup();process.exit(143);});

const baseline=["supabase/schema.sql","supabase/phase7a_workbar_device_auth.sql","supabase/phase5f4_close_day_archives.sql","supabase/phase8a_event_operations_core.sql","supabase/phase8c_zone_command_structure.sql","supabase/phase8c2_fix_role_duplicates_and_my_zone.sql","supabase/phase8f_calendar_import_realtime.sql","supabase/phase8h3_smart_staffing_permissions.sql","supabase/phase8i_event_live_updates.sql","supabase/phase9a_inventory_stocktaking.sql","supabase/phase9b_stock_policies.sql"];
const migrations=["supabase/phase10a_routine_engine_foundation.sql","supabase/phase10b_routine_templates.sql","supabase/phase10c_routine_reference_images.sql","supabase/phase10d_routine_runs_and_snapshots.sql","supabase/phase10e_routine_task_lifecycle.sql","supabase/phase10f_routine_operational_time.sql","supabase/phase10g_routine_closing_delivery.sql","supabase/phase10h_routine_double_shift.sql","supabase/phase10i_routine_realtime_offline_sync.sql","supabase/phase10j_routine_shared_device_identity.sql","supabase/phase10k1_routine_ui_pilot_gate.sql","supabase/phase10k2_routine_manager_control_center.sql","supabase/phase10k3_routine_employee_workflow.sql","supabase/phase10k4_routine_history_pilot_hardening.sql","supabase/phase10l_mesh_routine_content_pack.sql"];
const paths={pack:"content/routine-engine/mesh-routine-content-v1.json",generator:"scripts/generate-routine-content-pack.mjs",doc:"docs/routine-engine-v2-mesh-content-v1.md",fixture:"supabase/tests/phase10/content-pack-fixtures.sql",assertions:"supabase/tests/phase10/content-pack-assertions.sql"};
const authoritativeSources={opening:"/Users/robert/Downloads/mesh-opening-content-spec-v1R-combined.md",closing:"/Users/robert/Downloads/mesh-closing-content-spec-v1R-combined.md",doubleShift:"/Users/robert/Downloads/mesh-double-shift-content-spec-v1R.md"};
const protectedSchemaFingerprintSql=String.raw`
with protected_relations as (
  select relation.oid,namespace.nspname,relation.relname,relation.relacl,relation.relrowsecurity
  from pg_catalog.pg_class relation join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
  where relation.relkind in ('r','p','v') and (namespace.nspname in ('auth','storage') or
    (namespace.nspname='public' and (relation.relname like 'inventory_%' or relation.relname like 'asset_%'
      or relation.relname like 'event_%' or relation.relname like 'external_calendar_%'
      or relation.relname in ('shift_sessions','task_completions','handover_notes','close_day_archives','manager_daily_reviews'))))
), entries as (
  select 'r|'||nspname||'.'||relname||'|'||coalesce(relacl::text,'')||'|'||relrowsecurity entry from protected_relations
  union all select 'c|'||attribute.attrelid::regclass::text||'|'||attribute.attname||'|'||attribute.atttypid::regtype::text
    from pg_catalog.pg_attribute attribute where attribute.attrelid in (select oid from protected_relations) and attribute.attnum>0 and not attribute.attisdropped
  union all select 'k|'||constraint_row.conrelid::regclass::text||'|'||constraint_row.conname||'|'||pg_get_constraintdef(constraint_row.oid,true)
    from pg_catalog.pg_constraint constraint_row where constraint_row.conrelid in (select oid from protected_relations)
  union all select 'p|'||schemaname||'.'||tablename||'|'||policyname||'|'||cmd||'|'||roles::text||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'')
    from pg_catalog.pg_policies where (schemaname,tablename) in (select nspname,relname from protected_relations)
  union all select 'f|'||namespace.nspname||'.'||procedure.proname||'|'||pg_get_function_identity_arguments(procedure.oid)||'|'||pg_get_functiondef(procedure.oid)
    from pg_catalog.pg_proc procedure join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname in ('auth','storage') or (namespace.nspname='public' and (procedure.proname like 'inventory_%' or procedure.proname like 'asset_%' or procedure.proname like 'event_%'))
) select md5(coalesce(string_agg(entry,E'\n' order by entry),'')) from entries;`;
const protectedDataFingerprintSql=String.raw`select md5(
  coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_operations value),'[]')||
  coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_role_assignments value),'[]')||
  coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_responsibility_handovers value),'[]')||
  coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_calendar_sources value),'[]')||
  coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.external_calendar_events value),'[]')||
  coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_operation_calendar_links value),'[]'));`;

function sourceChecks(){
  for(const path of [...baseline,...migrations,...Object.values(paths)])check(`required file exists: ${path}`,existsSync(absolute(path)));
  const pack=JSON.parse(readFileSync(absolute(paths.pack),"utf8"));const generator=readFileSync(absolute(paths.generator),"utf8");const sql=readFileSync(absolute(migrations.at(-1)),"utf8");
  check("authoritative source hashes are pinned",pack.sourceDocuments.map((entry)=>entry.sha256).join("|")==="ea00e80bde6c17ea1d3f1095949363d79d606dcee16f05f742426c1c5248e079|27698f86716a141268546c623609f8b956213e53f20d00c03935cad01bd9244c|f4fce4d5a3dcafecd7dfca2a5bf780f7c3652634da2cb0f068daa5d4f506a0eb");
  check("pack has exact O/C/DS counts",pack.opening.tasks.length===37&&pack.closing.tasks.length===46&&pack.doubleShiftSteps.length===4);
  check("all O/C content fields exist",[...pack.opening.tasks,...pack.closing.tasks].every((task)=>task.instructions&&task.items.length&&task.doneCriteriaText&&task.deviationRulesText&&task.referenceGuidanceText));
  check("Double Shift remains system steps only",pack.doubleShiftSteps[3].systemGenerated&&!JSON.stringify(pack).includes('"doubleShiftTemplate"'));
  check("Double Shift definitions and bundle copy are complete",pack.doubleShiftSteps.every((step)=>step.mandatory&&step.mandatoryText&&step.structuredPayloadText)&&pack.doubleShiftSteps.slice(0,3).every((step)=>step.instructions&&step.structuredPayload.length&&step.doneCriteriaText&&step.blockingRulesText)&&pack.doubleShiftSteps[2].mandatoryText==="yes for a returning Double Shift participant"&&pack.doubleShiftSteps[3].eligibilityText&&Object.values(pack.doubleShiftCopy).every(Boolean));
  check("room 005 is absent from generated locations and sets",!pack.locations.some((location)=>/(?:room|project)[-_ ]?005|^005$/i.test(`${location.key} ${location.name}`))&&!pack.locationSets.some((set)=>set.members.some((member)=>/005/.test(member))));
  check("unresolved standards have no current revision",pack.unresolvedRequirements.length===9&&pack.unresolvedRequirements.every((requirement)=>!Object.hasOwn(pack.standards.find((standard)=>standard.key===requirement.standardKey),"currentRevision")));
  check("no unresolved sentinel substitution",!pack.unresolvedRequirements.some((requirement)=>{const value=pack.standards.find((standard)=>standard.key===requirement.standardKey)?.currentRevision?.value;return value===0||value===""||value==="TBD";}));
  check("generator rejects unknown fields",generator.includes("Unknown top-level fields"));
  check("SQL payload is generated",sql.includes(`$mesh_content$${JSON.stringify(pack)}$mesh_content$`));
  check("migration has no top-level install",!/do\s+\$[^$]*\$[\s\S]{0,1600}install_mesh_routine_content_pack_v1/i.test(sql));
  check("migration has no publish call",!/(perform|select)\s+public\.publish_routine_template_versions/i.test(sql));
  check("migration has no run or bundle creation call",!/(perform|select)\s+public\.(create_or_get_routine_run|create_or_get_double_shift_bundle)/i.test(sql));
  check("migration has no mode or stage assignment",!/set\s+(mode|ui_release_stage)\s*=/i.test(sql));
  check("explicit grants are authenticated-only",/grant execute on function public\.preview_mesh_routine_content_pack_v1\(\) to authenticated/.test(sql)&&!/grant execute[\s\S]{0,180}to (?:public|anon)/i.test(sql));
  check("inventory source is read-only",JSON.stringify(pack).includes('"locationCode":"WORKBAR_NON_ALCO_FRIDGE"')&&!/(insert|update|delete)[\s\S]{0,100}inventory_/i.test(sql));
  check("pack contains no organization ID, credential, or actual image path",!/(organizationId|organization_id|service_role|password|\bpin\b|pinCode|operatorToken|authToken|alarmCode|safeCode|saltoPassword|saltoPin)/i.test(JSON.stringify(pack))&&!/(storage\/v1\/object|https?:\/\/|\.png|\.jpe?g|\.webp)/i.test(JSON.stringify(pack)));
  const uiSources=["src/features/routines-v2/employee/RoutineDoubleShiftPlan.jsx","src/features/routines-v2/employee/RoutineDoubleShiftTransition.jsx","src/features/routines-v2/employee/RoutineDoubleShiftReturn.jsx","src/features/routines-v2/employee/RoutineDoubleShiftWorkspace.jsx"].map((path)=>readFileSync(absolute(path),"utf8")).join("\n");
  check("runtime Double Shift titles match canonical copy",pack.doubleShiftSteps.every((step)=>uiSources.includes(step.title)));
  check("canonical hash is SHA-256",/^[0-9a-f]{64}$/.test(pack.packHash)&&createHash("sha256").update(readFileSync(absolute(paths.pack))).digest("hex").length===64);
}

async function main(){
  sourceChecks();command("node",[paths.generator,"--verify-sources","--opening",authoritativeSources.opening,"--closing",authoritativeSources.closing,"--double-shift",authoritativeSources.doubleShift]);command("node",[paths.generator,"--check"]);command("docker",["--version"]);docker(["image","inspect",IMAGE]);
  docker(["run","--detach","--rm","--pull","never","--name",CONTAINER,"--network","none","--env",`POSTGRES_PASSWORD=${PASSWORD}`,"--env",`POSTGRES_DB=${DATABASE}`,IMAGE]);started=true;
  let ready=false;for(let attempt=0;attempt<60;attempt+=1){const logs=docker(["logs",CONTAINER],{allowFailure:true});const state=docker(["exec",CONTAINER,"pg_isready","--username=postgres",`--dbname=${DATABASE}`],{allowFailure:true});if(/PostgreSQL init process complete; ready for start up/i.test(`${logs.stdout}\n${logs.stderr}`)&&state.status===0){ready=true;break;}await new Promise((resolveWait)=>setTimeout(resolveWait,500));}if(!ready)throw new Error("Disposable PostgreSQL did not become ready.");
  console.log(`PostgreSQL ${scalar("show server_version;")} in network-isolated disposable container`);
  psql("create schema if not exists storage; create table if not exists storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]); create table if not exists storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null,name text not null,owner_id uuid,metadata jsonb not null default '{}',unique(bucket_id,name)); alter table storage.objects enable row level security; grant usage on schema storage to authenticated,anon; grant select,insert,update,delete on storage.objects to authenticated;");
  for(const path of baseline)psql(readFileSync(absolute(path),"utf8"),{transaction:true});
  psql("alter table public.user_profiles drop constraint if exists user_profiles_role_check; alter table public.user_profiles add constraint user_profiles_role_check check(role in ('manager','shift_lead','event_floor_manager','staff','time2staff','counter')); ");
  psql(readFileSync(absolute(migrations[0]),"utf8"),{transaction:true});
  psql(readFileSync(absolute("supabase/tests/phase10/foundation-fixtures.sql"),"utf8"));
  psql("insert into auth.users(id) values('33000000-0000-4000-8000-000000000001'); insert into public.user_profiles(id,organization_id,display_name,role,active,is_shared_device) values('33000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','Routine C Manager','manager',true,false); select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',false); set role authenticated; select public.create_or_update_routine_organization_settings('legacy','Europe/Oslo','04:00'::time,false,24,null); reset role; reset request.jwt.claim.sub; select set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000001',false); set role authenticated; select public.create_or_update_routine_organization_settings('shadow','Europe/Oslo','04:00'::time,false,24,null); reset role; reset request.jwt.claim.sub; select set_config('request.jwt.claim.sub','33000000-0000-4000-8000-000000000001',false); set role authenticated; select public.create_or_update_routine_organization_settings('shadow','Europe/Oslo','04:00'::time,false,24,null); reset role; reset request.jwt.claim.sub;");
  for(let index=1;index<migrations.length-1;index+=1){if(index===8)psql("drop publication if exists supabase_realtime; create publication supabase_realtime;");psql(readFileSync(absolute(migrations[index]),"utf8"),{transaction:true});}
  const protectedSchemaBefore=scalar(protectedSchemaFingerprintSql);const protectedDataBefore=scalar(protectedDataFingerprintSql);
  psql(readFileSync(absolute(migrations.at(-1)),"utf8"),{transaction:true});
  check("Phase 10L preserves protected schema, functions, policies, and grants",protectedSchemaBefore===scalar(protectedSchemaFingerprintSql));
  check("Phase 10L preserves protected Event Operations and calendar rows",protectedDataBefore===scalar(protectedDataFingerprintSql));
  check("Phase 10L migration reapplies without state mutation",(()=>{const before=scalar("select md5(coalesce(jsonb_agg(to_jsonb(value) order by value.organization_id,value.pack_key),'[]'::jsonb)::text) from public.routine_content_pack_installations value;");psql(readFileSync(absolute(migrations.at(-1)),"utf8"),{transaction:true});return scalar("select md5(coalesce(jsonb_agg(to_jsonb(value) order by value.organization_id,value.pack_key),'[]'::jsonb)::text) from public.routine_content_pack_installations value;")===before;})());
  const cHash=scalar("select set_config('request.jwt.claim.sub','33000000-0000-4000-8000-000000000001',false); set role authenticated; select public.preview_mesh_routine_content_pack_v1()->>'organizationStateHash';").split("\n").at(-1);
  const concurrentSql=`select set_config('request.jwt.claim.sub','33000000-0000-4000-8000-000000000001',false); set role authenticated; select public.install_mesh_routine_content_pack_v1('${cHash}','Concurrent same-key content installation.','5c100000-0000-4000-8000-000000000001');`;
  const concurrent=await Promise.all([psqlAsync(concurrentSql),psqlAsync(concurrentSql)]);
  if(concurrent.some((result)=>result.status!==0))console.error(concurrent.map((result)=>`${result.status}: ${result.stderr}`).join("\n"));
  check("same-key concurrent installation converges",concurrent.every((result)=>result.status===0));
  check("concurrency creates one installation and one operation",scalar("select count(*)||':'||(select count(*) from public.routine_content_pack_operations where organization_id='c3000000-0000-4000-8000-000000000001') from public.routine_content_pack_installations where organization_id='c3000000-0000-4000-8000-000000000001';")==="1:1");
  const changedRequest=psql(`select set_config('request.jwt.claim.sub','33000000-0000-4000-8000-000000000001',false); set role authenticated; select public.install_mesh_routine_content_pack_v1('${cHash}','Different note must fail.','5c100000-0000-4000-8000-000000000001');`,{allowFailure:true});
  check("same idempotency key with a different request is rejected",changedRequest.status!==0&&/different request/i.test(changedRequest.stderr));
  psql(readFileSync(absolute(paths.fixture),"utf8"));
  const assertions=psql(readFileSync(absolute(paths.assertions),"utf8"));const passes=`${assertions.stdout}\n${assertions.stderr}`.split("\n").filter((line)=>line.includes("PASS "));
  check("content-pack SQL assertions executed",passes.length===40);passCount+=passes.length;console.log(`PASS ${passes.length} content-pack SQL fixture checks`);
  const conflictPreview=JSON.parse(scalar("select value::text from phase10l_test.state where key='conflict_preview';"));
  const conflictInstall=psql(`select set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000001',false); set role authenticated; select public.install_mesh_routine_content_pack_v1('${conflictPreview.organizationStateHash}','A single semantic conflict must roll back everything.','5b100000-0000-4000-8000-000000000099');`,{allowFailure:true});
  check("one semantic conflict rejects the atomic install",conflictInstall.status!==0&&/conflict/i.test(conflictInstall.stderr));
  check("conflicting install leaves no partial pack resources",scalar("select (select count(*) from public.routine_content_pack_installations where organization_id='b2000000-0000-4000-8000-000000000001')||':'||(select count(*) from public.routine_templates where organization_id='b2000000-0000-4000-8000-000000000001')||':'||(select count(*) from public.routine_locations where organization_id='b2000000-0000-4000-8000-000000000001');")==="0:0:1");
  const immutable=psql("update public.routine_content_pack_installations set install_status=install_status;",{allowFailure:true});check("immutable update is rejected",immutable.status!==0&&/immutable/i.test(immutable.stderr));
  const stale=psql("select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',false); set role authenticated; select public.install_mesh_routine_content_pack_v1('0000000000000000000000000000000000000000000000000000000000000000','Stale state must preserve manager input.','5a100000-0000-4000-8000-000000000099');",{allowFailure:true});check("stale organization hash is rejected",stale.status!==0&&/stale/i.test(stale.stderr));
  const modeBlocks=psql("select set_config('mesh.routine_ui_internal','mode',false); select set_config('mesh.routine_ui_release_internal','release',false); update public.routine_organization_settings set mode='pilot',ui_release_stage='pilot_ready' where organization_id='b2000000-0000-4000-8000-000000000001'; select set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000001',false); set role authenticated; select public.install_mesh_routine_content_pack_v1(repeat('0',64),'Pilot mode must fail.','5b100000-0000-4000-8000-000000000001');",{allowFailure:true});check("pilot mode installation is rejected",modeBlocks.status!==0&&/legacy or shadow/i.test(modeBlocks.stderr));
  const activeBlock=psql("select set_config('mesh.routine_ui_internal','mode',false); select set_config('mesh.routine_ui_release_internal','release',false); update public.routine_organization_settings set mode='active',ui_release_stage='production_ready' where organization_id='b2000000-0000-4000-8000-000000000001'; select set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000001',false); set role authenticated; select public.install_mesh_routine_content_pack_v1(repeat('0',64),'Active mode must fail.','5b100000-0000-4000-8000-000000000002');",{allowFailure:true});check("active mode installation is rejected",activeBlock.status!==0&&/legacy or shadow/i.test(activeBlock.stderr));
  const divergence=psql(String.raw`select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',false);
    with current_task as (
      select task.*,version.revision version_revision from public.routine_template_tasks task join public.routine_template_versions version on version.id=task.version_id
      where task.organization_id='a1000000-0000-4000-8000-000000000001' and task.metadata->>'authoritativeSourceId'='O01'
    ) select public.upsert_routine_draft_task(version_id,section_id,id,jsonb_build_object(
      'taskKey',task_key,'title',title||' — manager reviewed','instructions',instructions,'doneCriteria',done_criteria,'taskType',task_type,
      'criticality',criticality,'mandatory',mandatory,'initialAssessmentPolicy',initial_assessment_policy,'completionPolicy',completion_policy,
      'notApplicablePolicy',not_applicable_policy,'verificationPolicy',verification_policy,'repeatPolicy',repeat_policy,'availabilityMode',availability_mode,
      'condition',condition_json,'locationId',location_id,'locationSetId',location_set_id,'locationDescription',location_description,
      'visibleDayOffset',visible_day_offset,'visibleFromLocalTime',visible_from_local_time,'startDayOffset',start_day_offset,'startFromLocalTime',start_from_local_time,
      'targetDayOffset',target_day_offset,'targetLocalTime',target_local_time,'overdueDayOffset',overdue_day_offset,'overdueLocalTime',overdue_local_time,
      'hardDeadlineDayOffset',hard_deadline_day_offset,'hardDeadlineLocalTime',hard_deadline_local_time,'sortOrder',sort_order,'active',active,'metadata',metadata
    ),revision,version_revision) from current_task;`);
  check("manager edits use the existing Phase 10B task mutation RPC",divergence.status===0&&divergence.stdout.includes("manager reviewed"));
  const changedAudit=JSON.parse(scalar("select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',false); set role authenticated; select public.get_mesh_routine_content_pack_audit()::text;").split("\n").at(-1));
  check("manager-edited draft divergence is visible without auto-repair",changedAudit.semanticDivergence.opening===true&&changedAudit.semanticDivergence.closing===false&&changedAudit.contentInventory.taskTitles.O01.endsWith("manager reviewed"));
  check("protected rows remain stable after installation tests",protectedDataBefore===scalar(protectedDataFingerprintSql));
  console.log(`PASS ${passCount} Phase 10L content-pack checks`);
}

try{await main();}catch(error){console.error(String(error?.stack??error));process.exitCode=1;}finally{cleanup();console.log("Disposable database cleanup: complete");}

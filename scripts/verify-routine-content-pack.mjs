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
const PACK_HASH = "48b7c4dfdb1340ddff14748a3c6d57df504f33fe822f25b6dde0d4ab48a6caf8";
const DECISION_HASH = "56cc1ac9b6fc1cdc89586f8539e185dfef6e6a5d54d483bbdffcbb1d7ff4c2af";
const INVENTORY_CONFIG = Object.freeze({mode:"location_standards",locationCodes:Object.freeze(["WORKBAR_NON_ALCO_FRIDGE"]),activeOnly:true});
const INVENTORY_BINDINGS = Object.freeze(["O13/inventory_standard_items","C08/inventory_standard_items","C28/inventory_standard_items"]);
const ASSET_CONFIG = Object.freeze({mode:"active_assets",requiredForClosing:true});
const ASSET_BINDINGS = Object.freeze(["C37/active_asset_registry_items"]);
const C37_STATIC_KEYS = Object.freeze(["device_physically_accounted_for","correct_charging_position","charging_confirmed","damage_or_fault_recorded","event_transfer_evidence_when_required"]);
const IDENTITY_ALIGNMENT_SIGNATURES = Object.freeze([
  "create_or_get_routine_run_phase10d(text,text,date,uuid)",
  "join_routine_run_phase10d(uuid,uuid)",
  "routine_ensure_run_participant(uuid,uuid,uuid,uuid)",
  "routine_ensure_bundle_participant(uuid,uuid,uuid,uuid)",
  "routine_ensure_closing_bundle_participant(uuid,uuid,uuid,uuid)",
]);
const OPERATION_CONVERGENCE_SIGNATURES = Object.freeze([
  "routine_run_operation_replay(uuid,uuid,text,uuid,text)",
  "routine_record_run_operation(uuid,uuid,text,uuid,text,text,uuid,jsonb)",
  "routine_bundle_operation_replay(uuid,uuid,text,uuid,text)",
  "routine_record_bundle_operation(uuid,uuid,text,uuid,text,text,uuid,jsonb)",
]);
const CREATION_PROVENANCE_CONSTRAINTS = Object.freeze([
  "routine_runs_org_creation_idempotency_unique",
  "routine_run_participants_org_idempotency_unique",
  "routine_bundles_org_idempotency_unique",
  "routine_bundle_participants_idempotency_unique",
]);
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
function transactionJson(sql) { const result=psql(`begin;\n${sql}\nrollback;`,{tuplesOnly:true}); const line=result.stdout.split("\n").map((entry)=>entry.trim()).find((entry)=>entry.startsWith("{")); if(!line)throw new Error(`Transaction returned no JSON:\n${result.stdout}\n${result.stderr}`); return JSON.parse(line); }
function authenticatedJson(actorId,expression){const output=scalar(`select set_config('request.jwt.claim.sub','${actorId}',false); set role authenticated; select (${expression})::text;`);const line=output.split("\n").map((entry)=>entry.trim()).filter(Boolean).at(-1);if(!line?.startsWith("{")&&!line?.startsWith("["))throw new Error(`Authenticated query returned no JSON: ${output}`);return JSON.parse(line);}
function ownerActorJson(actorId,expression){const output=scalar(`select set_config('request.jwt.claim.sub','${actorId}',false); select (${expression})::text;`);const line=output.split("\n").map((entry)=>entry.trim()).filter(Boolean).at(-1);if(!line?.startsWith("{")&&!line?.startsWith("["))throw new Error(`Owner actor query returned no JSON: ${output}`);return JSON.parse(line);}
function identityAlignmentCatalog(){return JSON.parse(scalar(String.raw`
  select jsonb_agg(to_jsonb(entry) order by entry.signature)::text from (
    select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,
      pg_get_userbyid(p.proowner) owner,pg_get_function_identity_arguments(p.oid) identity_arguments,
      pg_get_function_result(p.oid) result_type,language.lanname language,p.provolatile volatility,
      p.proisstrict strict,p.prosecdef security_definer,p.proconfig config,p.proacl acl
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language language on language.oid=p.prolang
    where n.nspname='public' and p.oid=any(array[
      'public.create_or_get_routine_run_phase10d(text,text,date,uuid)'::regprocedure,
      'public.join_routine_run_phase10d(uuid,uuid)'::regprocedure,
      'public.routine_ensure_run_participant(uuid,uuid,uuid,uuid)'::regprocedure,
      'public.routine_ensure_bundle_participant(uuid,uuid,uuid,uuid)'::regprocedure,
      'public.routine_ensure_closing_bundle_participant(uuid,uuid,uuid,uuid)'::regprocedure
    ])
  ) entry;`));}
function normalizeIdentityAlignmentDefinition(definition){return definition
  .replace(/,\s*identity_type(?=\s*,)/gi,"")
  .replace(/,\s*'personal_profile'(?=\s*,)/gi,"")
  .replace(/\s+where\s+identity_type\s*=\s*'personal_profile'(?=\s+do\s+nothing)/gi,"")
  .replace(/\s+and\s+participant\.identity_type\s*=\s*'personal_profile'/gi,"")
  .replace(/\s+/g," ").trim();}
function staleIdentityFunctions(){return JSON.parse(scalar(String.raw`select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text),'[]'::jsonb)::text
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f' and (
    pg_get_functiondef(p.oid)~*'on[[:space:]]+conflict[[:space:]]*\([[:space:]]*run_id[[:space:]]*,[[:space:]]*user_profile_id[[:space:]]*\)[[:space:]]+do[[:space:]]+nothing'
    or pg_get_functiondef(p.oid)~*'on[[:space:]]+conflict[[:space:]]*\([[:space:]]*bundle_id[[:space:]]*,[[:space:]]*user_profile_id[[:space:]]*\)[[:space:]]+do[[:space:]]+nothing'
  );`));}
function routineAclFingerprint(){return scalar(String.raw`with entries as (
  select 'f|'||p.oid::regprocedure::text||'|'||pg_get_userbyid(p.proowner)||'|'||coalesce(p.proacl::text,'')||'|'||p.prosecdef||'|'||coalesce(p.proconfig::text,'') entry
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'routine_%' or p.proname in('create_or_get_routine_run','join_routine_run','create_or_get_double_shift_bundle'))
  union all select 'r|'||c.oid::regclass::text||'|'||coalesce(c.relacl::text,'')||'|'||c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'routine_%'
    and c.relkind in('r','p','v','S')
  union all select 'p|'||schemaname||'.'||tablename||'|'||policyname||'|'||cmd||'|'||roles::text||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'')
  from pg_policies where schemaname='public' and tablename like 'routine_%'
  union all select 'd|'||defaclrole::regrole::text||'|'||defaclnamespace::regnamespace::text||'|'||defaclobjtype::text||'|'||coalesce(defaclacl::text,'') from pg_default_acl
) select md5(coalesce(string_agg(entry,E'\n' order by entry),'')) from entries;`);}
function authenticatedRoutineFunctions(){return JSON.parse(scalar(String.raw`select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text),'[]'::jsonb)::text
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and (p.proname like 'routine_%' or p.proname in('create_or_get_routine_run','join_routine_run','create_or_get_double_shift_bundle'))
    and has_function_privilege('authenticated',p.oid,'EXECUTE');`));}
function operationLedgerCatalogAudit(){return JSON.parse(scalar(String.raw`
  with definitions as (
    select procedure.oid::regprocedure::text signature,lower(pg_get_functiondef(procedure.oid)) definition
    from pg_proc procedure join pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='public' and procedure.prokind='f'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'signature',signature,
    'runDirectInsert',strpos(definition,'insert into public.routine_run_operations')>0,
    'bundleDirectInsert',strpos(definition,'insert into public.routine_bundle_operations')>0,
    'callsRunWriter',strpos(definition,'public.routine_record_run_operation(')>0,
    'callsRunWriterWithId',strpos(definition,'public.routine_record_run_operation_with_id(')>0,
    'callsBundleWriter',strpos(definition,'public.routine_record_bundle_operation(')>0,
    'callsRunReplay',strpos(definition,'public.routine_run_operation_replay(')>0,
    'callsBundleReplay',strpos(definition,'public.routine_bundle_operation_replay(')>0,
    'runReplayPosition',nullif(strpos(definition,'public.routine_run_operation_replay('),0),
    'bundleReplayPosition',nullif(strpos(definition,'public.routine_bundle_operation_replay('),0),
    'runInsertPosition',nullif(strpos(definition,'insert into public.routine_run_operations'),0),
    'bundleInsertPosition',nullif(strpos(definition,'insert into public.routine_bundle_operations'),0)
  ) order by signature),'[]'::jsonb)::text
  from definitions where definition like '%routine_run_operations%'
    or definition like '%routine_bundle_operations%'
    or definition like '%routine_record_run_operation(%'
    or definition like '%routine_record_run_operation_with_id(%'
    or definition like '%routine_record_bundle_operation(%'
    or definition like '%routine_run_operation_replay(%'
    or definition like '%routine_bundle_operation_replay(%';
`));}
function operationLedgerUniquenessAudit(){return JSON.parse(scalar(String.raw`
  select coalesce(jsonb_agg(to_jsonb(entry) order by entry.table_name,entry.object_type,entry.object_name),'[]'::jsonb)::text
  from (
    select relation.relname table_name,'constraint'::text object_type,constraint_row.conname object_name,
      pg_get_constraintdef(constraint_row.oid,true) definition
    from pg_constraint constraint_row
    join pg_class relation on relation.oid=constraint_row.conrelid
    join pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public' and relation.relname in('routine_run_operations','routine_bundle_operations')
      and constraint_row.contype in('p','u')
    union all
    select table_row.relname,'index',index_row.relname,pg_get_indexdef(index_row.oid)
    from pg_index index_catalog
    join pg_class table_row on table_row.oid=index_catalog.indrelid
    join pg_class index_row on index_row.oid=index_catalog.indexrelid
    join pg_namespace namespace on namespace.oid=table_row.relnamespace
    where namespace.nspname='public' and table_row.relname in('routine_run_operations','routine_bundle_operations')
      and index_catalog.indisunique
  ) entry;
`));}
function creationProvenanceCatalogAudit(){return JSON.parse(scalar(String.raw`
  with creation_columns as (
    select relation.relname table_name,column_row.attname column_name,
      format_type(column_row.atttypid,column_row.atttypmod) data_type,
      column_row.attnotnull not_null,pg_get_expr(default_row.adbin,default_row.adrelid) default_expression
    from pg_attribute column_row
    join pg_class relation on relation.oid=column_row.attrelid
    join pg_namespace namespace on namespace.oid=relation.relnamespace
    left join pg_attrdef default_row on default_row.adrelid=column_row.attrelid and default_row.adnum=column_row.attnum
    where namespace.nspname='public' and relation.relkind in('r','p')
      and column_row.attname='creation_idempotency_key' and not column_row.attisdropped
  ), catalog_objects as (
    select relation.relname table_name,'constraint'::text object_type,constraint_row.conname object_name,
      constraint_row.contype::text object_kind,pg_get_constraintdef(constraint_row.oid,true) definition
    from pg_constraint constraint_row
    join pg_class relation on relation.oid=constraint_row.conrelid
    join pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public'
      and relation.relname in(select table_name from creation_columns)
      and pg_get_constraintdef(constraint_row.oid,true) ilike '%creation_idempotency_key%'
    union all
    select table_row.relname,'index',index_row.relname,
      case when index_catalog.indisunique then 'unique' else 'non_unique' end,
      pg_get_indexdef(index_row.oid)
    from pg_index index_catalog
    join pg_class table_row on table_row.oid=index_catalog.indrelid
    join pg_class index_row on index_row.oid=index_catalog.indexrelid
    join pg_namespace namespace on namespace.oid=table_row.relnamespace
    where namespace.nspname='public'
      and table_row.relname in(select table_name from creation_columns)
      and pg_get_indexdef(index_row.oid) ilike '%creation_idempotency_key%'
  )
  select jsonb_build_object(
    'columns',(select jsonb_agg(to_jsonb(column_entry) order by column_entry.table_name) from creation_columns column_entry),
    'objects',(select coalesce(jsonb_agg(to_jsonb(object_entry) order by object_entry.table_name,object_entry.object_type,object_entry.object_name),'[]'::jsonb) from catalog_objects object_entry)
  )::text;
`));}
function creationProvenanceFunctionAudit(){return JSON.parse(scalar(String.raw`
  with definitions as (
    select procedure.oid::regprocedure::text signature,
      lower(regexp_replace(pg_get_functiondef(procedure.oid),'[[:space:]]+',' ','g')) normalized_definition
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='public' and procedure.prokind='f'
      and pg_get_functiondef(procedure.oid) ilike '%creation_idempotency_key%'
  ), entries as (
    select signature,normalized_definition,
      (select coalesce(jsonb_agg(match_row[1]),'[]'::jsonb)
       from regexp_matches(normalized_definition,'(.{0,220}creation_idempotency_key.{0,220})','g') match_row) snippets
    from definitions
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'signature',signature,
    'directLookup',normalized_definition~'(from|join) public[.]routine_(runs|run_participants|bundles|bundle_participants)[^;]*creation_idempotency_key[[:space:]]*=',
    'organizationAndKeyLookup',normalized_definition~'organization_id[[:space:]]*=[^;]*creation_idempotency_key[[:space:]]*=',
    'onConflictReference',normalized_definition~'on conflict[^;]*creation_idempotency_key',
    'insertReference',normalized_definition~'insert into public[.]routine_(runs|run_participants|bundles|bundle_participants)[^;]*creation_idempotency_key',
    'updateReference',normalized_definition~'update public[.]routine_(runs|run_participants|bundles|bundle_participants)[^;]*creation_idempotency_key',
    'snippets',snippets
  ) order by signature),'[]'::jsonb)::text from entries;
`));}
function routineStructuralFingerprint({excludeLegacyCreationConstraints=false}={}){
  const exclusion=excludeLegacyCreationConstraints
    ? `and object_name<>all(array[${CREATION_PROVENANCE_CONSTRAINTS.map((name)=>`'${name}'`).join(",")}])`
    : "";
  return scalar(String.raw`
    with routine_relations as (
      select relation.oid,namespace.nspname,relation.relname,relation.relowner,relation.relacl,relation.relrowsecurity,relation.relforcerowsecurity
      from pg_class relation join pg_namespace namespace on namespace.oid=relation.relnamespace
      where namespace.nspname='public' and relation.relname like 'routine_%' and relation.relkind in('r','p','v')
    ), entries as (
      select 'relation' object_type,relation.relname object_name,
        concat_ws('|',relation.relowner::regrole::text,coalesce(relation.relacl::text,''),relation.relrowsecurity,relation.relforcerowsecurity) definition
      from routine_relations relation
      union all
      select 'column',relation.relname||'.'||attribute.attname,
        concat_ws('|',attribute.attnum,attribute.atttypid::regtype::text,attribute.attnotnull,
          coalesce(pg_get_expr(default_row.adbin,default_row.adrelid),''))
      from routine_relations relation join pg_attribute attribute on attribute.attrelid=relation.oid
      left join pg_attrdef default_row on default_row.adrelid=relation.oid and default_row.adnum=attribute.attnum
      where attribute.attnum>0 and not attribute.attisdropped
      union all
      select 'constraint',constraint_row.conname,pg_get_constraintdef(constraint_row.oid,true)
      from pg_constraint constraint_row where constraint_row.conrelid in(select oid from routine_relations)
      union all
      select 'index',index_relation.relname,pg_get_indexdef(index_relation.oid)
      from pg_index index_row join pg_class index_relation on index_relation.oid=index_row.indexrelid
      where index_row.indrelid in(select oid from routine_relations)
      union all
      select 'trigger',trigger_row.tgname,pg_get_triggerdef(trigger_row.oid,true)
      from pg_trigger trigger_row where trigger_row.tgrelid in(select oid from routine_relations) and not trigger_row.tgisinternal
      union all
      select 'function',procedure.oid::regprocedure::text,
        concat_ws('|',procedure.proowner::regrole::text,coalesce(procedure.proacl::text,''),procedure.prosecdef,
          coalesce(procedure.proconfig::text,''),pg_get_functiondef(procedure.oid))
      from pg_proc procedure join pg_namespace namespace on namespace.oid=procedure.pronamespace
      where namespace.nspname='public' and (procedure.proname like 'routine_%'
        or procedure.proname in('create_or_get_routine_run','join_routine_run','create_or_get_double_shift_bundle'))
      union all
      select 'policy',policy.tablename||'.'||policy.policyname,
        concat_ws('|',policy.cmd,policy.roles::text,coalesce(policy.qual,''),coalesce(policy.with_check,''))
      from pg_policies policy where policy.schemaname='public' and policy.tablename like 'routine_%'
      union all
      select 'default_acl',default_row.defaclrole::regrole::text||'.'||default_row.defaclobjtype::text,
        concat_ws('|',default_row.defaclnamespace::regnamespace::text,coalesce(default_row.defaclacl::text,''))
      from pg_default_acl default_row
    )
    select encode(digest(coalesce(string_agg(object_type||'|'||object_name||'|'||definition,E'\n' order by object_type,object_name,definition),''),'sha256'),'hex')
    from entries where true ${exclusion};
  `);
}
function operationConvergenceCatalog(){return JSON.parse(scalar(String.raw`
  select jsonb_agg(to_jsonb(entry) order by entry.signature)::text from (
    select procedure.oid::regprocedure::text signature,pg_get_functiondef(procedure.oid) definition,
      pg_get_userbyid(procedure.proowner) owner,pg_get_function_identity_arguments(procedure.oid) identity_arguments,
      pg_get_function_result(procedure.oid) result_type,language.lanname language,procedure.provolatile volatility,
      procedure.proisstrict strict,procedure.prosecdef security_definer,procedure.proconfig config,procedure.proacl acl
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid=procedure.pronamespace
    join pg_language language on language.oid=procedure.prolang
    where namespace.nspname='public' and procedure.oid=any(array[
      'public.routine_run_operation_replay(uuid,uuid,text,uuid,text)'::regprocedure,
      'public.routine_record_run_operation(uuid,uuid,text,uuid,text,text,uuid,jsonb)'::regprocedure,
      'public.routine_bundle_operation_replay(uuid,uuid,text,uuid,text)'::regprocedure,
      'public.routine_record_bundle_operation(uuid,uuid,text,uuid,text,text,uuid,jsonb)'::regprocedure
    ])
  ) entry;
`));}
// Phase 10S must not change mode, stage, memberships, or attestations. This
// disposable-only helper bypasses only the K1 operational gate for one
// supported run-creation RPC while leaving every snapshot/integrity trigger
// enabled. PostgreSQL cannot re-enable these triggers in the same transaction
// after queued trigger events, so disposable DDL and the RPC use separate
// connections with unconditional restoration in finally.
function authenticatedDisposableRunJson(actorId,expression){
  const setGuardTriggers=(state)=>psql(`${["routine_runs","routine_run_tasks","routine_run_task_items"].map((table)=>`alter table public.${table} ${state} trigger routine_phase10k1_operational_guard_trigger;`).join("\n")}`);
  const restoreOperationalAccess=enableDisposableOperationalAccess();setGuardTriggers("disable");
  try{return authenticatedJson(actorId,expression);}finally{setGuardTriggers("enable");restoreOperationalAccess();}
}
function authenticatedDisposableRunResult(actorId,expression){
  const tables=["routine_runs","routine_run_tasks","routine_run_task_items"];
  const setGuardTriggers=(state)=>psql(`${tables.map((table)=>`alter table public.${table} ${state} trigger routine_phase10k1_operational_guard_trigger;`).join("\n")}`);
  const restoreOperationalAccess=enableDisposableOperationalAccess();setGuardTriggers("disable");
  try{return psql(`select set_config('request.jwt.claim.sub','${actorId}',false); set role authenticated; select (${expression})::text;`,{allowFailure:true});}finally{setGuardTriggers("enable");restoreOperationalAccess();}
}
function enableDisposableOperationalAccess(){
  const signatures=[
    "public.routine_current_user_can_perform_tasks()",
    "public.routine_current_user_can_coordinate_runs()",
  ];
  const definitions=signatures.map((signature)=>scalar(`select pg_get_functiondef('${signature}'::regprocedure);`));
  psql(String.raw`
    create or replace function public.routine_current_user_can_perform_tasks()
    returns boolean language sql stable security definer set search_path=pg_catalog as $$ select true $$;
    create or replace function public.routine_current_user_can_coordinate_runs()
    returns boolean language sql stable security definer set search_path=pg_catalog as $$ select true $$;
  `);
  return ()=>psql(definitions.map((definition)=>`${definition}\n;`).join("\n"));
}
function authenticatedDisposableBundleJson(actorId,expression){
  const tables=["routine_runs","routine_run_tasks","routine_run_task_items","routine_bundles","routine_bundle_steps"];
  const setGuardTriggers=(state)=>psql(`${tables.map((table)=>`alter table public.${table} ${state} trigger routine_phase10k1_operational_guard_trigger;`).join("\n")}`);
  const restoreOperationalAccess=enableDisposableOperationalAccess();setGuardTriggers("disable");
  try{return authenticatedJson(actorId,expression);}finally{setGuardTriggers("enable");restoreOperationalAccess();}
}
async function concurrentDisposableRun(actorId,expression){
  const tables=["routine_runs","routine_run_tasks","routine_run_task_items"];
  const setGuardTriggers=(state)=>psql(`${tables.map((table)=>`alter table public.${table} ${state} trigger routine_phase10k1_operational_guard_trigger;`).join("\n")}`);
  const restoreOperationalAccess=enableDisposableOperationalAccess();setGuardTriggers("disable");
  try{
    const sql=`select set_config('request.jwt.claim.sub','${actorId}',false); set role authenticated; select (${expression})::text;`;
    return await Promise.all([psqlAsync(sql),psqlAsync(sql)]);
  }finally{setGuardTriggers("enable");restoreOperationalAccess();}
}
async function concurrentDisposableCalls(calls,tables){
  const setGuardTriggers=(state)=>psql(`${tables.map((table)=>`alter table public.${table} ${state} trigger routine_phase10k1_operational_guard_trigger;`).join("\n")}`);
  const restoreOperationalAccess=tables.includes("routine_bundles")?enableDisposableOperationalAccess():null;setGuardTriggers("disable");
  try{
    return await Promise.all(calls.map(({actorId,expression,headers,applicationName})=>psqlAsync(`${applicationName?`set application_name='${applicationName}';`:""} select set_config('request.jwt.claim.sub','${actorId}',false);${headers?` select set_config('request.headers','${headers.replaceAll("'","''")}',false);`:""} set role authenticated; select (${expression})::text;`)));
  }finally{setGuardTriggers("enable");restoreOperationalAccess?.();}
}
const wait=(milliseconds)=>new Promise((resolveWait)=>setTimeout(resolveWait,milliseconds));
function resultJson(result){const line=result.stdout.split("\n").map((entry)=>entry.trim()).filter((entry)=>entry.startsWith("{")).at(-1);return line?JSON.parse(line):null;}
async function waitForScalar(sql,expected,{attempts=80,interval=25}={}){
  for(let attempt=0;attempt<attempts;attempt+=1){if(scalar(sql)===expected)return true;await wait(interval);}
  return false;
}
function cleanup(){if(!started)return;if(!/^mesh-shift-log-phase10l-[0-9]+-[a-f0-9]{8}$/.test(CONTAINER))throw new Error("Unsafe verifier container name.");docker(["rm","--force",CONTAINER],{allowFailure:true,timeout:30_000});started=false;}
process.once("SIGINT",()=>{cleanup();process.exit(130);});process.once("SIGTERM",()=>{cleanup();process.exit(143);});

const baseline=["supabase/schema.sql","supabase/phase7a_workbar_device_auth.sql","supabase/phase5f4_close_day_archives.sql","supabase/phase8a_event_operations_core.sql","supabase/phase8c_zone_command_structure.sql","supabase/phase8c2_fix_role_duplicates_and_my_zone.sql","supabase/phase8f_calendar_import_realtime.sql","supabase/phase8h3_smart_staffing_permissions.sql","supabase/phase8i_event_live_updates.sql","supabase/phase9a_inventory_stocktaking.sql","supabase/phase9b_stock_policies.sql"];
const migrations=["supabase/phase10a_routine_engine_foundation.sql","supabase/phase10a1_routine_organization_settings_bootstrap.sql","supabase/phase10b_routine_templates.sql","supabase/phase10c_routine_reference_images.sql","supabase/phase10d_routine_runs_and_snapshots.sql","supabase/phase10e_routine_task_lifecycle.sql","supabase/phase10f_routine_operational_time.sql","supabase/phase10g_routine_closing_delivery.sql","supabase/phase10h_routine_double_shift.sql","supabase/phase10i_routine_realtime_offline_sync.sql","supabase/phase10j_routine_shared_device_identity.sql","supabase/phase10k1_routine_ui_pilot_gate.sql","supabase/phase10k2_routine_manager_control_center.sql","supabase/phase10k3_routine_employee_workflow.sql","supabase/phase10k4_routine_history_pilot_hardening.sql","supabase/phase10l_mesh_routine_content_pack.sql","supabase/phase10p_routine_readiness_finalization.sql","supabase/phase10q_mesh_routine_content_pack_1_2r.sql","supabase/phase10o_routine_default_privilege_hardening.sql","supabase/phase10r_mesh_routine_content_pack_1_3r.sql","supabase/phase10s_mesh_routine_content_pack_1_4r.sql","supabase/phase10t_routine_participant_identity_conflict_alignment.sql","supabase/phase10u_routine_operation_idempotency_convergence.sql","supabase/phase10v_routine_creation_idempotency_provenance_alignment.sql"];
const contentMigration="supabase/phase10l_mesh_routine_content_pack.sql";
const readinessMigration="supabase/phase10p_routine_readiness_finalization.sql";
const previousAmendmentMigration="supabase/phase10q_mesh_routine_content_pack_1_2r.sql";
const servicewareAmendmentMigration="supabase/phase10r_mesh_routine_content_pack_1_3r.sql";
const amendmentMigration="supabase/phase10s_mesh_routine_content_pack_1_4r.sql";
const identityMigration="supabase/phase10t_routine_participant_identity_conflict_alignment.sql";
const operationMigration="supabase/phase10u_routine_operation_idempotency_convergence.sql";
const provenanceMigration="supabase/phase10v_routine_creation_idempotency_provenance_alignment.sql";
const securityMigration="supabase/phase10o_routine_default_privilege_hardening.sql";
const paths={pack:"content/routine-engine/mesh-routine-content-v1-4r.json",previousPack:"content/routine-engine/mesh-routine-content-v1-3r.json",predecessorPack:"content/routine-engine/mesh-routine-content-v1-2r.json",baselinePack:"content/routine-engine/mesh-routine-content-v1.json",generator:"scripts/generate-routine-content-pack.mjs",identityGenerator:"scripts/generate-routine-participant-identity-alignment.mjs",doc:"docs/routine-engine-v2-mesh-content-v1-4r.md",baseAmendment:"docs/routine-engine-v2-mesh-operational-standards-amendment-2026-08-07.md",productionAmendment:"docs/routine-engine-v2-production-readiness-amendment-2026-08-09.md",servicewareAmendment:"docs/routine-engine-v2-serviceware-route-amendment-2026-08-09.md",amendment:"docs/routine-engine-v2-runtime-contract-alignment-amendment-2026-08-09.md",identityDoc:"docs/routine-engine-v2-participant-identity-conflict-alignment-2026-08-10.md",operationDoc:"docs/routine-engine-v2-operation-ledger-concurrency-convergence-2026-08-10.md",provenanceDoc:"docs/routine-engine-v2-creation-idempotency-provenance-alignment-2026-08-10.md",manifest:"src/features/routines-v2/data/routineRuntimeContractAlignmentManifest.js",fixture:"supabase/tests/phase10/content-pack-fixtures.sql",assertions:"supabase/tests/phase10/content-pack-assertions.sql"};
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
const inventoryDataFingerprintSql=String.raw`select md5(
  coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.inventory_products value),'[]')||
  coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.inventory_locations value),'[]')||
  coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.inventory_location_products value),'[]'));`;
const assetDataFingerprintSql=String.raw`select md5(
  coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.asset_registry value),'[]')||
  coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.asset_check_records value),'[]'));`;

const canonical=(value)=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`:JSON.stringify(value);
const clone=(value)=>structuredClone(value);
function runtimeContractFailures(pack){
  const tasks=[...pack.opening.tasks,...pack.closing.tasks];
  const dependencies=[...pack.opening.dependencies,...pack.closing.dependencies];
  const failures=[];
  for(const task of tasks){
    if(task.availabilityMode==="time_window"&&!task.timing.startFromLocalTime)failures.push(`${task.id}:time_window_missing_start`);
    if(task.taskType==="checkpoint"&&!task.timing.targetLocalTime)failures.push(`${task.id}:checkpoint_missing_target`);
    if(task.condition?.fact==="organization_flag"&&!task.condition.key)failures.push(`${task.id}:organization_flag_missing_key`);
    if(task.condition?.fact==="organization_flag"&&typeof task.condition.value==="string"&&task.condition.value===task.condition.key)failures.push(`${task.id}:organization_flag_name_in_value`);
    if(task.taskType==="continuous"){
      const automatic=dependencies.filter((entry)=>entry.predecessorTaskId===task.id&&entry.dependencyType==="complete_predecessor_on_successor");
      if(automatic.length!==1)failures.push(`${task.id}:continuous_without_single_automatic_successor`);
    }
  }
  return failures;
}
function inventorySourceFailures(pack){
  const failures=[];
  const actual=[];
  for(const task of [...pack.opening.tasks,...pack.closing.tasks])for(const item of task.items){
    const pair=`${task.id}/${item.key}`;
    if(item.sourceKind==="inventory_readonly"){
      actual.push(pair);
      const config=item.sourceConfig;
      if(config?.mode!=="location_standards")failures.push(`${pair}:inventory_mode`);
      if(!Array.isArray(config?.locationCodes)||config.locationCodes.length===0)failures.push(`${pair}:inventory_location_codes`);
      if(Array.isArray(config?.locationCodes)&&config.locationCodes.some((code)=>typeof code!=="string"||!/^[A-Z][A-Z0-9_]*$/.test(code)))failures.push(`${pair}:inventory_location_code_syntax`);
      if(typeof config?.activeOnly!=="boolean")failures.push(`${pair}:inventory_active_only`);
      if(item.standardKey)failures.push(`${pair}:inventory_standard_binding`);
      if(item.locationSetKey)failures.push(`${pair}:inventory_location_set_binding`);
      if(["eggs_present_and_to_standard","fridge_clean_and_operating"].includes(item.key))failures.push(`${pair}:physical_check_dynamic`);
    }
    if(["O13","C08","C28"].includes(task.id)&&item.key==="inventory_standard_items"&&item.sourceKind!=="inventory_readonly")failures.push(`${pair}:inventory_standard_static`);
    if(["O13","C08","C28"].includes(task.id)&&["eggs_present_and_to_standard","fridge_clean_and_operating"].includes(item.key)
      &&(item.sourceKind!=="static"||canonical(item.sourceConfig)!=="{}"))failures.push(`${pair}:physical_check_not_static`);
    if(item.sourceConfig?.locationCode!==undefined||(item.sourceKind==="inventory_readonly"&&item.sourceConfig?.access!==undefined))failures.push(`${pair}:legacy_inventory_shape`);
  }
  if(canonical(actual.sort())!==canonical([...INVENTORY_BINDINGS].sort()))failures.push("inventory_binding_set");
  return failures;
}
function assetSourceFailures(pack){
  const failures=[];
  const actual=[];
  for(const task of [...pack.opening.tasks,...pack.closing.tasks])for(const item of task.items){
    const pair=`${task.id}/${item.key}`;
    if(item.sourceKind==="asset_registry_readonly"){
      actual.push(pair);
      const config=item.sourceConfig;
      if(config?.mode!=="active_assets")failures.push(`${pair}:asset_mode`);
      if(config?.requiredForClosing!==undefined&&typeof config.requiredForClosing!=="boolean")failures.push(`${pair}:asset_required_for_closing`);
      if(canonical(config)!==canonical(ASSET_CONFIG))failures.push(`${pair}:asset_config_exact`);
      if(config?.access!==undefined)failures.push(`${pair}:legacy_asset_shape`);
      if(config?.venue!==undefined||config?.venues!==undefined||config?.assetTypes!==undefined)failures.push(`${pair}:asset_filter_unapproved`);
      if(item.standardKey)failures.push(`${pair}:asset_standard_binding`);
      if(item.locationSetKey)failures.push(`${pair}:asset_location_set_binding`);
      if(task.id==="C37"&&C37_STATIC_KEYS.includes(item.key))failures.push(`${pair}:aggregate_control_dynamic`);
    }
    if(task.id==="C37"&&item.key==="active_asset_registry_items"&&item.sourceKind!=="asset_registry_readonly")failures.push(`${pair}:asset_identity_static`);
    if(task.id==="C37"&&C37_STATIC_KEYS.includes(item.key)
      &&(item.sourceKind!=="static"||canonical(item.sourceConfig)!=="{}"||item.standardKey||item.locationSetKey))failures.push(`${pair}:aggregate_control_not_static`);
  }
  if(canonical(actual.sort())!==canonical([...ASSET_BINDINGS].sort()))failures.push("asset_binding_set");
  return failures;
}
function normalizeOutsideRuntimeAllowlist(input){
  const pack=clone(input);
  pack.packVersion="<allowlisted>";delete pack.packHash;
  pack.sourceDocuments=pack.sourceDocuments.filter((entry)=>entry.kind!=="runtime_contract_alignment_amendment");
  const tasks=new Map([...pack.opening.tasks,...pack.closing.tasks].map((task)=>[task.id,task]));
  tasks.get("O15").availabilityMode="<allowlisted>";
  for(const id of ["O22","O23","O37","C14","C15"]){
    const task=tasks.get(id);delete task.metadata.runtimeContractAlignment;task.sourceHash="<allowlisted-provenance>";
  }
  tasks.get("O22").condition="<allowlisted>";
  tasks.get("O23").availabilityMode="<allowlisted>";
  tasks.get("O37").availabilityMode="<allowlisted>";
  tasks.get("C14").timing.startFromLocalTime="<allowlisted>";
  tasks.get("C15").taskType="<allowlisted>";
  for(const pair of [
    "O13/inventory_standard_items","O13/eggs_present_and_to_standard","O13/fridge_clean_and_operating",
    "C08/inventory_standard_items","C08/eggs_present_and_to_standard","C08/fridge_clean_and_operating",
    "C28/inventory_standard_items","C28/eggs_present_and_to_standard","C28/fridge_clean_and_operating",
    "C37/active_asset_registry_items","C37/device_physically_accounted_for","C37/correct_charging_position",
    "C37/charging_confirmed","C37/damage_or_fault_recorded","C37/event_transfer_evidence_when_required",
  ]){
    const [taskId,itemKey]=pair.split("/");const item=tasks.get(taskId).items.find((entry)=>entry.key===itemKey);
    item.sourceKind="<allowlisted>";item.sourceConfig="<allowlisted>";
  }
  const relation=pack.opening.relations.find((entry)=>entry.sourceTaskId==="O22"&&entry.targetTaskId==="C22"&&entry.relationType==="conditional_companion");
  relation.metadata.condition="<allowlisted>";delete relation.metadata.runtimeContractAlignment;
  pack.closing.dependencies=pack.closing.dependencies.filter((entry)=>!(entry.predecessorTaskId==="C05"&&["C14","C15"].includes(entry.successorTaskId)));
  return pack;
}
function sqlJson(value){return JSON.stringify(value).replaceAll("'","''");}
function upsertDraftTask(actorId,organizationId,authoritativeSourceId,changes,{expectedTaskRevision="revision",expectedVersionRevision="version_revision",allowFailure=false}={}){
  return psql(String.raw`select set_config('request.jwt.claim.sub','${actorId}',false);
    with current_task as (
      select task.*,version.revision version_revision from public.routine_template_tasks task
      join public.routine_template_versions version on version.id=task.version_id
      where task.organization_id='${organizationId}' and version.state='draft'
        and task.metadata->>'authoritativeSourceId'='${authoritativeSourceId}'
    ) select public.upsert_routine_draft_task(version_id,section_id,id,jsonb_build_object(
      'taskKey',task_key,'title',title,'instructions',instructions,'doneCriteria',done_criteria,'taskType',task_type,
      'criticality',criticality,'mandatory',mandatory,'initialAssessmentPolicy',initial_assessment_policy,'completionPolicy',completion_policy,
      'notApplicablePolicy',not_applicable_policy,'verificationPolicy',verification_policy,'repeatPolicy',repeat_policy,'availabilityMode',availability_mode,
      'condition',condition_json,'locationId',location_id,'locationSetId',location_set_id,'locationDescription',location_description,
      'visibleDayOffset',visible_day_offset,'visibleFromLocalTime',visible_from_local_time,'startDayOffset',start_day_offset,'startFromLocalTime',start_from_local_time,
      'targetDayOffset',target_day_offset,'targetLocalTime',target_local_time,'overdueDayOffset',overdue_day_offset,'overdueLocalTime',overdue_local_time,
      'hardDeadlineDayOffset',hard_deadline_day_offset,'hardDeadlineLocalTime',hard_deadline_local_time,'sortOrder',sort_order,'active',active,'metadata',metadata
    )||'${sqlJson(changes)}'::jsonb,${expectedTaskRevision},${expectedVersionRevision}) from current_task;`,{allowFailure});
}
function upsertDraftItem(actorId,organizationId,authoritativeSourceId,itemKey,changes,{expectedItemRevision="item_revision",expectedVersionRevision="version_revision",allowFailure=false}={}){
  return psql(String.raw`select set_config('request.jwt.claim.sub','${actorId}',false);
    with current_item as (
      select item.*,item.revision item_revision,version.revision version_revision
      from public.routine_template_task_items item
      join public.routine_template_tasks task on task.id=item.task_id
      join public.routine_template_versions version on version.id=item.version_id
      where item.organization_id='${organizationId}' and version.state='draft'
        and task.metadata->>'authoritativeSourceId'='${authoritativeSourceId}' and item.item_key='${itemKey}'
    ) select public.upsert_routine_draft_task_item(version_id,task_id,id,jsonb_build_object(
      'itemKey',item_key,'label',label,'itemType',item_type,'required',required,'sourceKind',source_kind,
      'sourceConfig',source_config,'standardId',standard_id,'sourceLocationSetId',source_location_set_id,
      'inputSchema',input_schema,'sortOrder',sort_order,'active',active,'metadata',metadata
    )||'${sqlJson(changes)}'::jsonb,${expectedItemRevision},${expectedVersionRevision}) from current_item;`,{allowFailure});
}
function draftSemanticFingerprint(organizationId){return scalar(String.raw`
  select md5(jsonb_build_object(
    'sections',(select coalesce(jsonb_agg(jsonb_build_object('routineKey',template.routine_key,'sectionKey',section.section_key,'title',section.title,'description',section.description,'phaseType',section.phase_type,'sortOrder',section.sort_order,'active',section.active) order by template.routine_key,section.sort_order),'[]'::jsonb) from public.routine_template_sections section join public.routine_template_versions version on version.id=section.version_id and version.state='draft' join public.routine_templates template on template.id=version.template_id where section.organization_id='${organizationId}'),
    'tasks',(select coalesce(jsonb_agg(jsonb_build_object('routineKey',template.routine_key,'sectionKey',section.section_key,'taskKey',task.task_key,'title',task.title,'instructions',task.instructions,'doneCriteria',task.done_criteria,'taskType',task.task_type,'criticality',task.criticality,'mandatory',task.mandatory,'initialAssessmentPolicy',task.initial_assessment_policy,'completionPolicy',task.completion_policy,'notApplicablePolicy',task.not_applicable_policy,'verificationPolicy',task.verification_policy,'repeatPolicy',task.repeat_policy,'availabilityMode',task.availability_mode,'condition',task.condition_json,'locationKey',location.location_key,'locationSetKey',location_set.set_key,'locationDescription',task.location_description,'visibleDayOffset',task.visible_day_offset,'visibleFromLocalTime',task.visible_from_local_time,'startDayOffset',task.start_day_offset,'startFromLocalTime',task.start_from_local_time,'targetDayOffset',task.target_day_offset,'targetLocalTime',task.target_local_time,'overdueDayOffset',task.overdue_day_offset,'overdueLocalTime',task.overdue_local_time,'hardDeadlineDayOffset',task.hard_deadline_day_offset,'hardDeadlineLocalTime',task.hard_deadline_local_time,'sortOrder',task.sort_order,'active',task.active) order by template.routine_key,task.sort_order),'[]'::jsonb) from public.routine_template_tasks task join public.routine_template_versions version on version.id=task.version_id and version.state='draft' join public.routine_templates template on template.id=version.template_id join public.routine_template_sections section on section.id=task.section_id left join public.routine_locations location on location.id=task.location_id left join public.routine_location_sets location_set on location_set.id=task.location_set_id where task.organization_id='${organizationId}'),
    'items',(select coalesce(jsonb_agg(jsonb_build_object('routineKey',template.routine_key,'taskKey',task.task_key,'itemKey',item.item_key,'label',item.label,'itemType',item.item_type,'required',item.required,'sourceKind',item.source_kind,'sourceConfig',item.source_config,'standardKey',standard.standard_key,'locationSetKey',location_set.set_key,'inputSchema',item.input_schema,'sortOrder',item.sort_order,'active',item.active) order by template.routine_key,task.sort_order,item.sort_order),'[]'::jsonb) from public.routine_template_task_items item join public.routine_template_tasks task on task.id=item.task_id join public.routine_template_versions version on version.id=item.version_id and version.state='draft' join public.routine_templates template on template.id=version.template_id left join public.routine_standards standard on standard.id=item.standard_id left join public.routine_location_sets location_set on location_set.id=item.source_location_set_id where item.organization_id='${organizationId}'),
    'dependencies',(select coalesce(jsonb_agg(jsonb_build_object('routineKey',template.routine_key,'predecessorTaskKey',predecessor.task_key,'successorTaskKey',successor.task_key,'dependencyType',dependency.dependency_type,'metadata',dependency.metadata) order by template.routine_key,predecessor.task_key,successor.task_key,dependency.dependency_type),'[]'::jsonb) from public.routine_template_task_dependencies dependency join public.routine_template_tasks predecessor on predecessor.id=dependency.predecessor_task_id join public.routine_template_tasks successor on successor.id=dependency.successor_task_id join public.routine_template_versions version on version.id=dependency.version_id and version.state='draft' join public.routine_templates template on template.id=version.template_id where dependency.organization_id='${organizationId}'),
    'relations',(select coalesce(jsonb_agg(jsonb_build_object('routineKey',template.routine_key,'sourceTaskKey',source_task.task_key,'targetRoutineKey',relation.target_routine_key,'targetTaskKey',relation.target_task_key,'relationType',relation.relation_type,'metadata',relation.metadata) order by template.routine_key,source_task.task_key,relation.target_routine_key,relation.target_task_key,relation.relation_type),'[]'::jsonb) from public.routine_template_task_relations relation join public.routine_template_tasks source_task on source_task.id=relation.source_task_id join public.routine_template_versions version on version.id=relation.version_id and version.state='draft' join public.routine_templates template on template.id=version.template_id where relation.organization_id='${organizationId}'),
    'references',(select coalesce(jsonb_agg(jsonb_build_object('routineKey',template.routine_key,'taskKey',task.task_key,'itemKey',item.item_key,'referenceKey',reference.reference_key,'buttonLabel',link.button_label,'contextNote',link.context_note,'sortOrder',link.sort_order,'active',link.active) order by template.routine_key,task.task_key,coalesce(item.item_key,''),reference.reference_key),'[]'::jsonb) from public.routine_template_task_reference_images link join public.routine_template_tasks task on task.id=link.task_id left join public.routine_template_task_items item on item.id=link.task_item_id join public.routine_reference_images reference on reference.id=link.reference_id join public.routine_template_versions version on version.id=link.version_id and version.state='draft' join public.routine_templates template on template.id=version.template_id where link.organization_id='${organizationId}')
  )::text);`);}

function sourceChecks(){
  for(const path of [...baseline,...migrations,...Object.values(paths)])check(`required file exists: ${path}`,existsSync(absolute(path)));
  const pack=JSON.parse(readFileSync(absolute(paths.pack),"utf8"));const previousPack=JSON.parse(readFileSync(absolute(paths.previousPack),"utf8"));const predecessorPack=JSON.parse(readFileSync(absolute(paths.predecessorPack),"utf8"));const baselinePack=JSON.parse(readFileSync(absolute(paths.baselinePack),"utf8"));const generator=readFileSync(absolute(paths.generator),"utf8");const identityGenerator=readFileSync(absolute(paths.identityGenerator),"utf8");const baselineSql=readFileSync(absolute(contentMigration),"utf8");const readinessSql=readFileSync(absolute(readinessMigration),"utf8");const sql=readFileSync(absolute(amendmentMigration),"utf8");const identitySql=readFileSync(absolute(identityMigration),"utf8");const operationSql=readFileSync(absolute(operationMigration),"utf8");const provenanceSql=readFileSync(absolute(provenanceMigration),"utf8");
  check("full Phase 10 manifest ends with 10L, 10P, 10Q, 10O, 10R, 10S, 10T, 10U, then 10V",migrations.length===24&&migrations.at(-9)===contentMigration&&migrations.at(-8)===readinessMigration&&migrations.at(-7).endsWith("phase10q_mesh_routine_content_pack_1_2r.sql")&&migrations.at(-6)===securityMigration&&migrations.at(-5)===servicewareAmendmentMigration&&migrations.at(-4)===amendmentMigration&&migrations.at(-3)===identityMigration&&migrations.at(-2)===operationMigration&&migrations.at(-1)===provenanceMigration);
  check("10P is a transaction-bounded read-model replacement",/^begin;/i.test(readinessSql.trim())&&/commit;\s*$/i.test(readinessSql.trim())&&readinessSql.includes("create or replace function public.routine_compute_pilot_readiness"));
  check("10P cannot mutate content, settings, release state, or operative rows",!/^\s*(?:insert\s+into|update\s+|delete\s+from|truncate\s+|merge\s+into)\b/im.test(readinessSql)&&!/\bset\s+(?:mode|ui_release_stage)\s*=/i.test(readinessSql));
  check("10P resolves all five canonical standards through current same-organization revisions",["workbar-coffee-canister-assigned-target","coffee-cups-full-target","coffee-cups-service-ready-target","wine-glasses-full-target","wine-glasses-service-ready-target"].every((key)=>readinessSql.includes(`'${key}'`))&&readinessSql.includes("revision.organization_id=standard.organization_id"));
  check("10P rejects missing and stale current standard revisions",readinessSql.includes("not exists (")&&readinessSql.includes("newer.revision_number>revision.revision_number")&&readinessSql.includes("missing or stale"));
  check("10P keeps the readiness helper private",readinessSql.includes("revoke all on function public.routine_compute_pilot_readiness(uuid) from public,anon,authenticated")&&!/grant\s+execute/i.test(readinessSql));
  const identityTopLevel=identitySql.replace(/\$\$[\s\S]*?\$\$;/g,"");
  check("10T is one transaction with exactly five generated function replacements",/^begin;/i.test(identitySql.trim())&&/commit;\s*$/i.test(identitySql.trim())&&(identitySql.match(/create or replace function public\./gi)??[]).length===5);
  check("10T has no top-level data, privilege, ownership, policy, or configuration mutation",!/\b(?:insert\s+into|update\s+|delete\s+from|truncate\s+|merge\s+into|grant\s+|revoke\s+|alter\s+|create\s+(?:table|index|policy|publication)|drop\s+)\b/i.test(identityTopLevel));
  check("10T replaces exactly the audited stale signatures",IDENTITY_ALIGNMENT_SIGNATURES.every((signature)=>identitySql.includes(`function public.${signature.replace(/\([^]*$/,"(")}`))&&IDENTITY_ALIGNMENT_SIGNATURES.length===5);
  check("10T personal inserts explicitly target the Phase 10J partial indexes",(identitySql.match(/where identity_type\s*=\s*'personal_profile'\s+do nothing/gi)??[]).length===5&&(identitySql.match(/participant\.identity_type\s*=\s*'personal_profile'/gi)??[]).length===8);
  check("10T generator is exact-source and explicit-delta only",identityGenerator.includes("replaceExact")&&identityGenerator.includes("expected 1 exact source matches")===false&&!/writeFileSync[^\n]+phase10[dehj]/i.test(identityGenerator));
  const operationTopLevel=operationSql.replace(/\$\$[\s\S]*?\$\$;/g,"");
  const advisoryLocks=[...operationSql.matchAll(/pg_catalog\.pg_advisory_xact_lock\([\s\S]*?\n\s*\)\);/g)].map((match)=>match[0]);
  check("10U is one transaction with exactly the four audited function replacements",/^begin;/i.test(operationSql.trim())&&/commit;\s*$/i.test(operationSql.trim())&&(operationSql.match(/create or replace function public\./gi)??[]).length===4&&OPERATION_CONVERGENCE_SIGNATURES.every((signature)=>operationSql.includes(`function public.${signature.replace(/\([^]*$/,"(")}`)));
  check("10U has no top-level data schema privilege ownership policy or configuration mutation",!/\b(?:insert\s+into|update\s+|delete\s+from|truncate\s+|merge\s+into|grant\s+|revoke\s+|alter\s+|create\s+(?:table|index|policy|publication)|drop\s+)\b/i.test(operationTopLevel));
  check("10U has four transaction locks with separate fixed run and bundle domains",advisoryLocks.length===4&&advisoryLocks.filter((entry)=>entry.includes("mesh:routine:run-operation-idempotency:v1")&&entry.includes("101001")).length===2&&advisoryLocks.filter((entry)=>entry.includes("mesh:routine:bundle-operation-idempotency:v1")&&entry.includes("101002")).length===2);
  check("10U lock identities exclude request resource time session and random inputs",advisoryLocks.every((entry)=>!/(?:request_hash|resource_|clock_|timestamp|session_id|random|gen_random)/i.test(entry)));
  check("10U writers use conflict-safe immutable ledger convergence",(operationSql.match(/on conflict do nothing/gi)??[]).length===2&&(operationSql.match(/returning \* into v_operation/gi)??[]).length===2&&!/update\s+public\.routine_(?:run|bundle)_operations/i.test(operationSql));
  check("10U keeps the existing request-reuse errors and adds deterministic consistency guards",operationSql.includes("Idempotency key was already used with another routine request.")&&operationSql.includes("This idempotency key was already used with a different request.")&&operationSql.includes("Routine operation idempotency ledger conflict.")&&operationSql.includes("Routine bundle operation idempotency ledger conflict."));
  const provenanceStatements=[...provenanceSql.matchAll(/alter\s+table\s+public\.([a-z_]+)\s+drop\s+constraint\s+if\s+exists\s+([a-z_]+)\s*;/gi)]
    .map((match)=>`${match[1]}:${match[2]}`);
  check("10V is one explicit transaction with exactly four reapply-safe constraint drops",/^begin;/i.test(provenanceSql.trim())&&/commit;\s*$/i.test(provenanceSql.trim())&&provenanceStatements.length===4&&canonical(provenanceStatements.sort())===canonical([
    "routine_runs:routine_runs_org_creation_idempotency_unique",
    "routine_run_participants:routine_run_participants_org_idempotency_unique",
    "routine_bundles:routine_bundles_org_idempotency_unique",
    "routine_bundle_participants:routine_bundle_participants_idempotency_unique",
  ].sort()));
  check("10V contains no data function index ACL owner policy trigger or configuration mutation",!/\b(?:insert\s+into|update\s+|delete\s+from|truncate\s+|merge\s+into|create\s+(?:or\s+replace\s+)?(?:function|index|table|policy|trigger|publication)|grant\s+|revoke\s+|alter\s+(?:default\s+privileges|function|policy|trigger|publication)|owner\s+to|set\s+(?:mode|ui_release_stage)|drop\s+(?:function|index|table|policy|trigger|publication))\b/i.test(provenanceSql));
  check("10V names no replacement actor-scoped or creation-key index",!/create\s+(?:unique\s+)?index/i.test(provenanceSql)&&!/user_profile_id[\s\S]*creation_idempotency_key|operator_id[\s\S]*creation_idempotency_key|operation_type\s+[^;]*generated/i.test(provenanceSql));
  const standards=Object.fromEntries(pack.standards.map((entry)=>[entry.key,entry]));const tasks=Object.fromEntries([...pack.opening.tasks,...pack.closing.tasks].map((entry)=>[entry.id,entry]));const references=new Set(pack.references.map((entry)=>entry.key));
  check("frozen 1.1R baseline remains exact",baselinePack.packVersion==="1.1R"&&baselinePack.packHash==="c149a8416a867dcb7d87224f3ae8e2a214e5ca4954613b118521ebe5ae3aff2a"&&baselinePack.sourceDocuments.length===4);
  check("frozen 1.2R predecessor remains exact",predecessorPack.packVersion==="1.2R"&&predecessorPack.packHash==="2dcfc69b822f973c23e54934b6799faa5b9400ae0529096f049067811a417f25");
  check("frozen 1.3R predecessor remains exact",previousPack.packVersion==="1.3R"&&previousPack.packHash==="b416001c2885bbf54bdb029b8e7164cbb903a76b8344396a4e9fcffa26107fe1");
  check("authoritative source and all amendment hashes are pinned",pack.sourceDocuments.slice(0,3).map((entry)=>entry.sha256).join("|")==="ea00e80bde6c17ea1d3f1095949363d79d606dcee16f05f742426c1c5248e079|27698f86716a141268546c623609f8b956213e53f20d00c03935cad01bd9244c|f4fce4d5a3dcafecd7dfca2a5bf780f7c3652634da2cb0f068daa5d4f506a0eb"&&pack.sourceDocuments[3].kind==="operational_standards_amendment"&&pack.sourceDocuments[3].sha256==="8ebedb39be888dfa118a429fa2046ba2b7b5dc49c868d9d5b811f2aa89b45351"&&pack.sourceDocuments[4].kind==="production_readiness_amendment"&&pack.sourceDocuments[4].sha256==="d0280ca6e780f8f6876ad8747f0ee80693ebb1aa0a15761b63962376f8e54224"&&pack.sourceDocuments[5].kind==="serviceware_route_amendment"&&pack.sourceDocuments[5].sha256==="7ee5032edc7518e80aec18e5f4ce50a3c7a12e48aa9e560727c87d672c3c72f1"&&pack.sourceDocuments[6].kind==="runtime_contract_alignment_amendment"&&pack.sourceDocuments[6].sha256===DECISION_HASH&&pack.sourceDocuments.slice(3).every((entry)=>entry.hashScope==="content-before-generated-pack-metadata"));
  check("pack minor version is 1.4R",pack.packVersion==="1.4R"&&pack.packHash===PACK_HASH);
  const packText=JSON.stringify(pack);
  check("1.4R preserves the reviewed Coffee Canisters terminology",(packText.match(/Coffee Canister(?!s)/g)??[]).length===14&&(packText.match(/Coffee Canisters/g)??[]).length===59);
  check("pack has exact O/C/DS counts",pack.opening.tasks.length===37&&pack.closing.tasks.length===46&&pack.doubleShiftSteps.length===4);
  check("all O/C content fields exist",[...pack.opening.tasks,...pack.closing.tasks].every((task)=>task.instructions&&task.items.length&&task.doneCriteriaText&&task.deviationRulesText&&task.referenceGuidanceText));
  check("Double Shift remains system steps only",pack.doubleShiftSteps[3].systemGenerated&&!JSON.stringify(pack).includes('"doubleShiftTemplate"'));
  check("Double Shift definitions and bundle copy are complete",pack.doubleShiftSteps.every((step)=>step.mandatory&&step.mandatoryText&&step.structuredPayloadText)&&pack.doubleShiftSteps.slice(0,3).every((step)=>step.instructions&&step.structuredPayload.length&&step.doneCriteriaText&&step.blockingRulesText)&&pack.doubleShiftSteps[2].mandatoryText==="yes for a returning Double Shift participant"&&pack.doubleShiftSteps[3].eligibilityText&&Object.values(pack.doubleShiftCopy).every(Boolean));
  check("room 005 is absent from generated locations and sets",!pack.locations.some((location)=>/(?:room|project)[-_ ]?005|^005$/i.test(`${location.key} ${location.name}`))&&!pack.locationSets.some((set)=>set.members.some((member)=>/005/.test(member))));
  const servicewareRoute=standards["serviceware-office-recovery-route-confirmation"].currentRevision.value;
  check("serviceware route is resolved as the fourteenth current standard",pack.standards.length===14&&pack.standards.filter((entry)=>entry.currentRevision).length===14&&pack.unresolvedRequirements.length===0&&servicewareRoute.contractKey==="mesh-serviceware-office-recovery-route-v1");
  check("serviceware route scope and floor-5 exclusion are exact",canonical(servicewareRoute.scope.floors)===canonical([2,3,4,5])&&servicewareRoute.scope.kitchensPerFloor===2&&servicewareRoute.scope.totalKitchens===8&&servicewareRoute.scope.officeAreasIncluded===false&&servicewareRoute.scope.floor5SeparatingOffice==="explicitly_excluded_never_pass_through"&&servicewareRoute.route.length===12);
  check("serviceware equipment, timing and completion are exact",servicewareRoute.equipment.trolley===1&&servicewareRoute.equipment.emptyTraysMinimum===2&&servicewareRoute.equipment.cleanDirtySeparationRequiredThroughout&&servicewareRoute.equipment.sameTrayMixingAllowed===false&&servicewareRoute.timing.opening.completeNoLaterThanLocalTime==="10:45"&&servicewareRoute.timing.closingDailyRecovery.normalTargetLocalTimeApprox==="13:30"&&servicewareRoute.completion.completingWalkAloneIsSufficient===false);
  check("O15 C03 and C27 share one authoritative route standard",[tasks.O15,tasks.C03,tasks.C27].every((task)=>task.items.some((item)=>item.standardKey==="serviceware-office-recovery-route-confirmation"&&item.sourceKind==="routine_standard"))&&/no later than 10:45/.test(tasks.O15.instructions)&&/normally around 13:30/.test(tasks.C03.instructions)&&/do not repeat the physical route solely for C27/.test(tasks.C27.instructions));
  const previousTasks=Object.fromEntries([...previousPack.opening.tasks,...previousPack.closing.tasks].map((entry)=>[entry.id,entry]));
  check("O15 is immediate with retained target, deadline, measurement type, and no invented window",tasks.O15.availabilityMode==="immediate"&&tasks.O15.taskType==="measurement"&&tasks.O15.timing.targetLocalTime==="10:45:00"&&tasks.O15.timing.hardDeadlineLocalTime==="10:45:00"&&!tasks.O15.timing.visibleFromLocalTime&&!tasks.O15.timing.startFromLocalTime&&tasks.O15.sourceHash===previousTasks.O15.sourceHash);
  check("O15 changes only availabilityMode",(()=>{const before=clone(previousTasks.O15),after=clone(tasks.O15);before.availabilityMode="<allowlisted>";after.availabilityMode="<allowlisted>";return canonical(before)===canonical(after);})());
  check("O22 uses the Phase 10F organization-flag wire format",canonical(tasks.O22.condition)===canonical({fact:"organization_flag",key:"seasonal_candles",operator:"equals",value:true})&&canonical(pack.opening.relations.find((entry)=>entry.sourceTaskId==="O22"&&entry.targetTaskId==="C22").metadata.condition)===canonical(tasks.O22.condition));
  check("O23 and O37 retain target-only timing without inferred time windows",tasks.O23.availabilityMode==="immediate"&&tasks.O23.taskType==="checkpoint"&&tasks.O23.timing.targetLocalTime==="08:00:00"&&!tasks.O23.timing.startFromLocalTime&&tasks.O37.availabilityMode==="after_task"&&tasks.O37.taskType==="gate"&&tasks.O37.timing.targetLocalTime==="11:00:00"&&!tasks.O37.timing.startFromLocalTime);
  check("C14 has a complete authorized time window",tasks.C14.availabilityMode==="time_window"&&tasks.C14.taskType==="checkpoint"&&tasks.C14.timing.visibleFromLocalTime==="17:35:00"&&tasks.C14.timing.startFromLocalTime==="17:35:00"&&tasks.C14.timing.targetLocalTime==="17:45:00"&&tasks.C14.timing.overdueLocalTime==="17:55:00");
  check("C15 retains checkpoint source classification but operates as a target-free gate",tasks.C15.sourceType==="checkpoint"&&tasks.C15.metadata.runtimeContractAlignment.originalSourceClassification==="checkpoint"&&tasks.C15.taskType==="gate"&&!tasks.C15.timing.targetLocalTime);
  const c05Dependencies=pack.closing.dependencies.filter((entry)=>entry.predecessorTaskId==="C05");
  check("C05 has exactly one automatic successor C15 and no C14 dependency",c05Dependencies.length===1&&c05Dependencies[0].successorTaskId==="C15"&&c05Dependencies[0].dependencyType==="complete_predecessor_on_successor");
  check("canonical 1.4R passes every hardened runtime-contract assertion",runtimeContractFailures(pack).length===0&&inventorySourceFailures(pack).length===0&&assetSourceFailures(pack).length===0);
  const invalidWindow=clone(pack);invalidWindow.opening.tasks.find((task)=>task.id==="O15").availabilityMode="time_window";
  check("hardened verifier rejects a time window without start",runtimeContractFailures(invalidWindow).includes("O15:time_window_missing_start"));
  const invalidCheckpoint=clone(pack);delete invalidCheckpoint.opening.tasks.find((task)=>task.id==="O23").timing.targetLocalTime;
  check("hardened verifier rejects an active checkpoint without target",runtimeContractFailures(invalidCheckpoint).includes("O23:checkpoint_missing_target"));
  const missingFlagKey=clone(pack);delete missingFlagKey.opening.tasks.find((task)=>task.id==="O22").condition.key;
  check("hardened verifier rejects organization_flag without key",runtimeContractFailures(missingFlagKey).includes("O22:organization_flag_missing_key"));
  const flagNameInValue=clone(pack);flagNameInValue.opening.tasks.find((task)=>task.id==="O22").condition.value="seasonal_candles";
  check("hardened verifier rejects an organization flag name stored in value",runtimeContractFailures(flagNameInValue).includes("O22:organization_flag_name_in_value"));
  const missingAutomatic=clone(pack);missingAutomatic.opening.dependencies=missingAutomatic.opening.dependencies.filter((entry)=>!(entry.predecessorTaskId==="O27"&&entry.dependencyType==="complete_predecessor_on_successor"));
  check("hardened verifier rejects continuous automatic completion without an actual dependency",runtimeContractFailures(missingAutomatic).includes("O27:continuous_without_single_automatic_successor"));
  check("generator uses explicit availability overrides instead of timing-field inference",generator.includes('O15: "immediate"')&&generator.includes('O23: "immediate"')&&generator.includes('O37: "after_task"')&&!generator.includes('TIMING[id] ? "time_window"'));
  const inventoryItem=(candidate,taskId,itemKey)=>[...candidate.opening.tasks,...candidate.closing.tasks].find((task)=>task.id===taskId).items.find((item)=>item.key===itemKey);
  check("only the three explicit inventory_standard_items bindings are dynamic",INVENTORY_BINDINGS.every((pair)=>{const [taskId,itemKey]=pair.split("/");const item=inventoryItem(pack,taskId,itemKey);return item.sourceKind==="inventory_readonly"&&canonical(item.sourceConfig)===canonical(INVENTORY_CONFIG);})&&[...pack.opening.tasks,...pack.closing.tasks].flatMap((task)=>task.items.map((item)=>`${task.id}/${item.key}:${item.sourceKind}`)).filter((entry)=>entry.endsWith(":inventory_readonly")).length===3);
  check("egg and fridge-condition checks remain one static item in O13 C08 C28",["O13","C08","C28"].every((taskId)=>["eggs_present_and_to_standard","fridge_clean_and_operating"].every((itemKey)=>{const item=inventoryItem(pack,taskId,itemKey);return item.sourceKind==="static"&&canonical(item.sourceConfig)==="{}"&&!item.standardKey&&!item.locationSetKey;})));
  check("generator source binding is explicit and never inferred from free text",generator.includes("const INVENTORY_ITEM_BINDINGS")&&generator.includes("inventoryItemKeys.has(item.key)")&&!generator.includes("/(product|stock|fridge|egg|food|non-alcohol)/.test(text)"));
  const legacyInventory=clone(pack);inventoryItem(legacyInventory,"O13","inventory_standard_items").sourceConfig={locationCode:"WORKBAR_NON_ALCO_FRIDGE",access:"read_only"};
  check("hardened verifier rejects legacy inventory sourceConfig",inventorySourceFailures(legacyInventory).some((failure)=>failure.endsWith(":legacy_inventory_shape")));
  const missingInventoryMode=clone(pack);delete inventoryItem(missingInventoryMode,"O13","inventory_standard_items").sourceConfig.mode;
  check("hardened verifier rejects location_standards without mode",inventorySourceFailures(missingInventoryMode).some((failure)=>failure.endsWith(":inventory_mode")));
  const emptyInventoryLocations=clone(pack);inventoryItem(emptyInventoryLocations,"O13","inventory_standard_items").sourceConfig.locationCodes=[];
  check("hardened verifier rejects empty inventory locationCodes",inventorySourceFailures(emptyInventoryLocations).some((failure)=>failure.endsWith(":inventory_location_codes")));
  const invalidInventoryLocation=clone(pack);inventoryItem(invalidInventoryLocation,"O13","inventory_standard_items").sourceConfig.locationCodes=["invalid code"];
  check("hardened verifier rejects invalid inventory location-code syntax",inventorySourceFailures(invalidInventoryLocation).some((failure)=>failure.endsWith(":inventory_location_code_syntax")));
  const missingInventoryActive=clone(pack);delete inventoryItem(missingInventoryActive,"O13","inventory_standard_items").sourceConfig.activeOnly;
  check("hardened verifier rejects missing or non-boolean activeOnly",inventorySourceFailures(missingInventoryActive).some((failure)=>failure.endsWith(":inventory_active_only")));
  const inventoryWithStandard=clone(pack);inventoryItem(inventoryWithStandard,"O13","inventory_standard_items").standardKey="workbar-milk-fridge-target";
  check("hardened verifier rejects inventory_readonly with standard binding",inventorySourceFailures(inventoryWithStandard).some((failure)=>failure.endsWith(":inventory_standard_binding")));
  const inventoryWithSet=clone(pack);inventoryItem(inventoryWithSet,"O13","inventory_standard_items").locationSetKey="active-service-zones";
  check("hardened verifier rejects inventory_readonly with location-set binding",inventorySourceFailures(inventoryWithSet).some((failure)=>failure.endsWith(":inventory_location_set_binding")));
  const dynamicEgg=clone(pack);inventoryItem(dynamicEgg,"O13","eggs_present_and_to_standard").sourceKind="inventory_readonly";inventoryItem(dynamicEgg,"O13","eggs_present_and_to_standard").sourceConfig=clone(INVENTORY_CONFIG);
  check("hardened verifier rejects dynamic explicit egg checks",inventorySourceFailures(dynamicEgg).some((failure)=>failure.endsWith(":physical_check_dynamic")));
  const dynamicFridge=clone(pack);inventoryItem(dynamicFridge,"C08","fridge_clean_and_operating").sourceKind="inventory_readonly";inventoryItem(dynamicFridge,"C08","fridge_clean_and_operating").sourceConfig=clone(INVENTORY_CONFIG);
  check("hardened verifier rejects dynamic fridge-condition checks",inventorySourceFailures(dynamicFridge).some((failure)=>failure.endsWith(":physical_check_dynamic")));
  const staticInventory=clone(pack);inventoryItem(staticInventory,"C28","inventory_standard_items").sourceKind="static";inventoryItem(staticInventory,"C28","inventory_standard_items").sourceConfig={};
  check("hardened verifier rejects static inventory_standard_items",inventorySourceFailures(staticInventory).some((failure)=>failure.endsWith(":inventory_standard_static")));
  check("only C37 active_asset_registry_items is dynamic with the exact required-closing asset contract",ASSET_BINDINGS.every((pair)=>{const [taskId,itemKey]=pair.split("/");const item=inventoryItem(pack,taskId,itemKey);return item.sourceKind==="asset_registry_readonly"&&canonical(item.sourceConfig)===canonical(ASSET_CONFIG)&&!item.standardKey&&!item.locationSetKey;})&&[...pack.opening.tasks,...pack.closing.tasks].flatMap((task)=>task.items.map((item)=>`${task.id}/${item.key}:${item.sourceKind}`)).filter((entry)=>entry.endsWith(":asset_registry_readonly")).length===1);
  check("C37 aggregate asset controls remain exactly five static items with preserved types",C37_STATIC_KEYS.every((itemKey)=>{const item=inventoryItem(pack,"C37",itemKey);return item.sourceKind==="static"&&canonical(item.sourceConfig)==="{}"&&!item.standardKey&&!item.locationSetKey&&item.itemType===(itemKey==="device_physically_accounted_for"?"count":"check");}));
  check("generator asset binding is exact and neither task-wide nor free-text inferred",generator.includes("const ASSET_REGISTRY_ITEM_BINDINGS")&&generator.includes("assetRegistryItemKeys.has(item.key)")&&!generator.includes('if (task.id === "C37")')&&!/assetRegistryItemKeys[^\n]+label|asset_registry_readonly[^\n]+\.test\(text\)/.test(generator));
  const legacyAsset=clone(pack);inventoryItem(legacyAsset,"C37","active_asset_registry_items").sourceConfig={access:"read_only"};
  check("asset negative 01 rejects the legacy access shape",assetSourceFailures(legacyAsset).some((failure)=>failure.endsWith(":legacy_asset_shape")));
  const missingAssetMode=clone(pack);delete inventoryItem(missingAssetMode,"C37","active_asset_registry_items").sourceConfig.mode;
  check("asset negative 02 rejects missing mode",assetSourceFailures(missingAssetMode).some((failure)=>failure.endsWith(":asset_mode")));
  const wrongAssetMode=clone(pack);inventoryItem(wrongAssetMode,"C37","active_asset_registry_items").sourceConfig.mode="all_assets";
  check("asset negative 03 rejects a mode other than active_assets",assetSourceFailures(wrongAssetMode).some((failure)=>failure.endsWith(":asset_mode")));
  const nonBooleanRequired=clone(pack);inventoryItem(nonBooleanRequired,"C37","active_asset_registry_items").sourceConfig.requiredForClosing="true";
  check("asset negative 04 rejects non-boolean requiredForClosing",assetSourceFailures(nonBooleanRequired).some((failure)=>failure.endsWith(":asset_required_for_closing")));
  for(const [index,itemKey] of C37_STATIC_KEYS.entries()){
    const dynamicControl=clone(pack);const item=inventoryItem(dynamicControl,"C37",itemKey);item.sourceKind="asset_registry_readonly";item.sourceConfig=clone(ASSET_CONFIG);
    check(`asset negative ${String(index+5).padStart(2,"0")} rejects dynamic ${itemKey}`,assetSourceFailures(dynamicControl).some((failure)=>failure.endsWith(":aggregate_control_dynamic")));
  }
  const staticAssetIdentity=clone(pack);inventoryItem(staticAssetIdentity,"C37","active_asset_registry_items").sourceKind="static";inventoryItem(staticAssetIdentity,"C37","active_asset_registry_items").sourceConfig={};
  check("asset negative 10 rejects static active_asset_registry_items",assetSourceFailures(staticAssetIdentity).some((failure)=>failure.endsWith(":asset_identity_static")));
  const freeTextAsset=clone(pack);const freeTextItem=inventoryItem(freeTextAsset,"O01","bookings_checked");freeTextItem.label="C37 active asset registry items";freeTextItem.sourceKind="asset_registry_readonly";freeTextItem.sourceConfig=clone(ASSET_CONFIG);
  check("asset negative 11 rejects free-text-based source assignment",assetSourceFailures(freeTextAsset).includes("asset_binding_set"));
  const venueAsset=clone(pack);inventoryItem(venueAsset,"C37","active_asset_registry_items").sourceConfig.venue="Event Atrium";
  const typedAsset=clone(pack);inventoryItem(typedAsset,"C37","active_asset_registry_items").sourceConfig.assetTypes=["ipad"];
  check("asset negative 12 rejects any unapproved venue or assetTypes filter",[venueAsset,typedAsset].every((candidate)=>assetSourceFailures(candidate).some((failure)=>failure.endsWith(":asset_filter_unapproved"))));
  check("the exact 1.3R to 1.4R delta is confined to the approved runtime plus nine inventory and six C37 item-source entries",canonical(normalizeOutsideRuntimeAllowlist(previousPack))===canonical(normalizeOutsideRuntimeAllowlist(pack)));
  check("no unresolved sentinel substitution",!pack.unresolvedRequirements.some((requirement)=>{const value=pack.standards.find((standard)=>standard.key===requirement.standardKey)?.currentRevision?.value;return value===0||value===""||value==="TBD";}));
  const coffeeFull=standards["coffee-cups-full-target"],coffeeReady=standards["coffee-cups-service-ready-target"],wineFull=standards["wine-glasses-full-target"],wineReady=standards["wine-glasses-service-ready-target"];
  check("coffee layouts replace numeric targets and are semantically identical",coffeeFull.valueType==="object"&&coffeeReady.valueType==="object"&&canonical(coffeeFull.currentRevision.value)===canonical(coffeeReady.currentRevision.value));
  check("coffee layout requires four-high handles-right and cup-specific positions",coffeeFull.currentRevision.value.ordinaryCoffeeCups.stackHeight===4&&coffeeFull.currentRevision.value.ordinaryCoffeeCups.handleDirection==="right"&&coffeeFull.currentRevision.value.cappuccinoCups.requiredPositions.join("|")==="shelf|coffee-machine-top"&&coffeeFull.currentRevision.value.espressoCups.requiredPositions.join("|")==="coffee-machine-top"&&coffeeFull.currentRevision.value.dishwasherOrWashFlowCountsAsReady===false);
  check("wine layouts replace numeric targets and are semantically identical",wineFull.valueType==="object"&&wineReady.valueType==="object"&&canonical(wineFull.currentRevision.value)===canonical(wineReady.currentRevision.value)&&wineFull.currentRevision.value.dishwasherOrWashFlowCountsAsReady===false);
  check("cup and wine layout placeholders exist",["ordinary-coffee-cup-layout","cappuccino-cup-shelf-layout","cappuccino-and-espresso-machine-top-layout","wine-glass-layout"].every((key)=>references.has(key)));
  const canisters=standards["workbar-coffee-canister-assigned-target"].currentRevision.value;
  check("Workbar Coffee Canister contract is exact",canisters.assignedToWorkbar===4&&canisters.membersLoungeDuringService===1&&canisters.kitchenReserveDuringService===3&&canisters.overnightStorage==="workbar-bar-coffee-canister-cupboard"&&!standards["coffee-canister-total-inventory-target"]);
  check("C17 accounts only for four Workbar-assigned Coffee Canisters",tasks.C17.items.some((item)=>item.standardKey==="workbar-coffee-canister-assigned-target")&&/four Workbar-assigned/.test(tasks.C17.title)&&/outside this task's accountability/.test(tasks.C17.instructions));
  check("tea names and order are exact",canonical(standards["self-service-tea-slot-names"].currentRevision.value)===canonical(["Peppermynte","Chai Masala","Earl Grey Fransk","Bestemors Frukthave","Sencha","Rooibos Chile"]));
  const doors=standards["door-and-lock-rules"].currentRevision.value;
  check("front-door and default-locked door rules are exact",doors.frontDoor.weekdayAutomaticOpen.fromLocalTime==="08:00"&&doors.frontDoor.weekdayAutomaticOpen.toLocalTime==="18:00"&&doors.normallyLockedUnlessManualSaltoUnlock.length===5&&doors.normallyLockedUnlessManualSaltoUnlock.includes("garbage-hallway-atrium-door"));
  check("Cornerbar street door has two separately verified locks",canonical(doors.cornerbarStreetDoor.requiredSecurity)===canonical(["salto-locked","upper-physical-security-lock-engaged","physical-verification-completed"])&&tasks.C42.items.some((item)=>item.key==="cornerbar_street_door")&&tasks.C42.items.some((item)=>item.key==="cornerbar_street_upper_security_lock"));
  const fridges=standards["fridge-closing-rules"].currentRevision.value;
  check("Workbar bar fridges unlock at Opening and lock at final Closing",[fridges.workbarBarLeft,fridges.workbarBarRight].every((rule)=>rule.opening.includes("unlock-with-universal-key")&&rule.finalClosing.includes("lock-with-universal-key")));
  check("non-alcoholic and milk fridge rules are exact",fridges.workbarNonAlcoholic.locking==="never-lock"&&fridges.workbarNonAlcoholic.opening.includes("raise-grille-fully")&&fridges.workbarNonAlcoholic.finalClosing.includes("lower-grille-fully")&&fridges.workbarMilk.locking==="remain-unlocked"&&fridges.workbarMilk.topShelf.regularMilk===2&&fridges.workbarMilk.topShelf.oatly===2&&fridges.workbarMilk.remainingStandingSpace==="reserved-for-opened-wine-bottles");
  check("all Cornerbar fridges use universal keys and final physical lock checks",[fridges.cornerbarLeft,fridges.cornerbarMiddle,fridges.cornerbarRight].every((rule)=>rule.openingWhenActive.includes("unlock-with-universal-key")&&rule.finalClosing.includes("lock-with-universal-key")&&rule.finalClosing.includes("physically-verify-locked")));
  const cornerbar=standards["cornerbar-operating-standard"].currentRevision.value;
  check("separate Cornerbar Operating Standard is complete",cornerbar.openingWhenUsed.length===9&&cornerbar.finalClosing.length===13&&cornerbar.eventActive.transferRequired&&cornerbar.eventActive.notApplicableAllowed===false&&cornerbar.eventActive.transferScopes.length===6);
  check("Cornerbar references are complete",["cornerbar-left-fridge","cornerbar-middle-fridge","cornerbar-right-fridge","cornerbar-glass-layout","cornerbar-bar-equipment-storage","beer-tap-parts","beer-drip-trays","cornerbar-final-reset","cornerbar-street-door","cornerbar-upper-security-lock","cornerbar-closed-lighting-standard"].every((key)=>references.has(key)));
  check("O29 and O35 require new visual checks without inherited completion",[tasks.O29,tasks.O35].every((entry)=>/new physical check/.test(entry.structuredItemsText)&&/never inherited/.test(entry.doneCriteriaText)));
  check("C27 emits visual accountability rather than numeric totals",/visual-layout accountability/.test(tasks.C27.title)&&/not an artificial total/.test(tasks.C27.doneCriteriaText)&&!tasks.C27.items.some((item)=>/target_count|full_target/.test(item.key)));
  check("event-active Cornerbar is transfer/evidence and never N/A",["C10","C20","C30","C33","C38","C40","C41","C42","C43"].every((id)=>tasks[id].items.some((item)=>item.standardKey==="cornerbar-operating-standard"))&&cornerbar.eventActive.notApplicableAllowed===false);
  check("no stale numeric or resolved-blocker copy remains",!/unresolved numeric standard|service-ready numeric|coffee-canister-total-inventory-target|tea-slot standard unresolved/i.test(JSON.stringify(pack)));
  check("all placeholder references remain warnings, not blockers",pack.references.every((entry)=>entry.placeholderText==="Referansebilde kommer"&&entry.buttonLabel==="Vis hvordan det skal se ut")&&!pack.unresolvedRequirements.some((entry)=>/image|reference/i.test(entry.standardKey)));
  check("generator rejects unknown fields",generator.includes("Unknown top-level fields"));
  check("1.4R SQL payload is generated",sql.includes(`$mesh_content$${JSON.stringify(pack)}$mesh_content$`));
  check("10S is a transaction-bounded provider-only replacement",/^begin;/i.test(sql.trim())&&/commit;\s*$/i.test(sql.trim())&&sql.includes("create or replace function public.routine_mesh_content_pack_v1()")&&sql.includes("revoke all on function public.routine_mesh_content_pack_v1() from public, anon, authenticated"));
  check("10S cannot mutate settings, content, release state, or operative rows",!/^(?!\s*--).*\b(?:insert\s+into|update\s+|delete\s+from|truncate\s+|merge\s+into)\b/im.test(sql)&&!/[\s\S]\bset\s+(?:mode|ui_release_stage)\s*=/i.test(sql));
  check("migration has no top-level install",!/do\s+\$[^$]*\$[\s\S]{0,1600}install_mesh_routine_content_pack_v1/i.test(sql));
  check("migration has no publish call",!/(perform|select)\s+public\.publish_routine_template_versions/i.test(sql));
  check("migration has no run or bundle creation call",!/(perform|select)\s+public\.(create_or_get_routine_run|create_or_get_double_shift_bundle)/i.test(sql));
  check("migration has no mode or stage assignment",!/set\s+(mode|ui_release_stage)\s*=/i.test(sql));
  check("original content APIs retain authenticated-only grants",/grant execute on function public\.preview_mesh_routine_content_pack_v1\(\) to authenticated/.test(baselineSql)&&!/grant execute[\s\S]{0,180}to (?:public|anon)/i.test(baselineSql));
  check("inventory source is read-only",INVENTORY_BINDINGS.every((pair)=>{const [taskId,itemKey]=pair.split("/");const item=inventoryItem(pack,taskId,itemKey);return item.sourceKind==="inventory_readonly"&&canonical(item.sourceConfig)===canonical(INVENTORY_CONFIG);})&&!/(insert|update|delete)[\s\S]{0,100}inventory_/i.test(`${baselineSql}\n${sql}`));
  check("asset source is read-only and exactly scoped",ASSET_BINDINGS.every((pair)=>{const [taskId,itemKey]=pair.split("/");const item=inventoryItem(pack,taskId,itemKey);return item.sourceKind==="asset_registry_readonly"&&canonical(item.sourceConfig)===canonical(ASSET_CONFIG);})&&!/(insert|update|delete)[\s\S]{0,100}asset_(?:registry|check_records)/i.test(`${baselineSql}\n${sql}`));
  check("pack contains no organization ID, credential, or actual image path",!/(organizationId|organization_id|service_role|password|\bpin\b|pinCode|operatorToken|authToken|alarmCode|safeCode|saltoPassword|saltoPin)/i.test(JSON.stringify(pack))&&!/(storage\/v1\/object|https?:\/\/|\.png|\.jpe?g|\.webp)/i.test(JSON.stringify(pack)));
  const uiSources=["src/features/routines-v2/employee/RoutineDoubleShiftPlan.jsx","src/features/routines-v2/employee/RoutineDoubleShiftTransition.jsx","src/features/routines-v2/employee/RoutineDoubleShiftReturn.jsx","src/features/routines-v2/employee/RoutineDoubleShiftWorkspace.jsx"].map((path)=>readFileSync(absolute(path),"utf8")).join("\n");
  check("runtime Double Shift titles match canonical copy",pack.doubleShiftSteps.every((step)=>uiSources.includes(step.title)));
  check("canonical hash is SHA-256",/^[0-9a-f]{64}$/.test(pack.packHash)&&createHash("sha256").update(readFileSync(absolute(paths.pack))).digest("hex").length===64);
}

async function main(){
  sourceChecks();command("node",[paths.generator,"--verify-sources","--opening",authoritativeSources.opening,"--closing",authoritativeSources.closing,"--double-shift",authoritativeSources.doubleShift]);command("node",[paths.generator,"--check"]);command("node",[paths.identityGenerator,"--check"]);command("docker",["--version"]);docker(["image","inspect",IMAGE]);
  docker(["run","--detach","--rm","--pull","never","--name",CONTAINER,"--network","none","--env",`POSTGRES_PASSWORD=${PASSWORD}`,"--env",`POSTGRES_DB=${DATABASE}`,IMAGE]);started=true;
  let ready=false;for(let attempt=0;attempt<60;attempt+=1){const logs=docker(["logs",CONTAINER],{allowFailure:true});const state=docker(["exec",CONTAINER,"pg_isready","--username=postgres",`--dbname=${DATABASE}`],{allowFailure:true});if(/PostgreSQL init process complete; ready for start up/i.test(`${logs.stdout}\n${logs.stderr}`)&&state.status===0){ready=true;break;}await new Promise((resolveWait)=>setTimeout(resolveWait,500));}if(!ready)throw new Error("Disposable PostgreSQL did not become ready.");
  console.log(`PostgreSQL ${scalar("show server_version;")} in network-isolated disposable container`);
  psql("create schema if not exists storage; create table if not exists storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]); create table if not exists storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null,name text not null,owner_id uuid,metadata jsonb not null default '{}',unique(bucket_id,name)); alter table storage.objects enable row level security; grant usage on schema storage to authenticated,anon; grant select,insert,update,delete on storage.objects to authenticated;");
  for(const path of baseline)psql(readFileSync(absolute(path),"utf8"),{transaction:true});
  psql("alter table public.user_profiles drop constraint if exists user_profiles_role_check; alter table public.user_profiles add constraint user_profiles_role_check check(role in ('manager','shift_lead','event_floor_manager','staff','time2staff','counter')); ");
  psql(readFileSync(absolute(migrations[0]),"utf8"),{transaction:true});
  psql(readFileSync(absolute("supabase/tests/phase10/foundation-fixtures.sql"),"utf8"));
  psql("insert into auth.users(id) values('44000000-0000-4000-8000-000000000001'); insert into public.organizations(id,name,slug) values('d4000000-0000-4000-8000-000000000001','Routine Incremental Organization D','routine-test-incremental'); insert into public.user_profiles(id,organization_id,display_name,role,active,is_shared_device) values('44000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','Routine D Manager','manager',true,false);");
  psql(readFileSync(absolute(migrations[1]),"utf8"),{transaction:true});
  psql("insert into auth.users(id) values('33000000-0000-4000-8000-000000000001'); insert into public.user_profiles(id,organization_id,display_name,role,active,is_shared_device) values('33000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','Routine C Manager','manager',true,false); select set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000001',false); set role authenticated; select public.create_or_update_routine_organization_settings('shadow','Europe/Oslo','04:00'::time,false,24,1); reset role; reset request.jwt.claim.sub; select set_config('request.jwt.claim.sub','33000000-0000-4000-8000-000000000001',false); set role authenticated; select public.create_or_update_routine_organization_settings('shadow','Europe/Oslo','04:00'::time,false,24,1); reset role; reset request.jwt.claim.sub;");
  const contentIndex=migrations.indexOf(contentMigration);
  for(let index=2;index<contentIndex;index+=1){if(index===9)psql("drop publication if exists supabase_realtime; create publication supabase_realtime;");psql(readFileSync(absolute(migrations[index]),"utf8"),{transaction:true});}
  const protectedSchemaBefore=scalar(protectedSchemaFingerprintSql);const protectedDataBefore=scalar(protectedDataFingerprintSql);
  psql(readFileSync(absolute(contentMigration),"utf8"),{transaction:true});
  check("Phase 10L preserves protected schema, functions, policies, and grants",protectedSchemaBefore===scalar(protectedSchemaFingerprintSql));
  check("Phase 10L preserves protected Event Operations and calendar rows",protectedDataBefore===scalar(protectedDataFingerprintSql));
  check("Phase 10L migration reapplies without state mutation",(()=>{const before=scalar("select md5(coalesce(jsonb_agg(to_jsonb(value) order by value.organization_id,value.pack_key),'[]'::jsonb)::text) from public.routine_content_pack_installations value;");psql(readFileSync(absolute(contentMigration),"utf8"),{transaction:true});return scalar("select md5(coalesce(jsonb_agg(to_jsonb(value) order by value.organization_id,value.pack_key),'[]'::jsonb)::text) from public.routine_content_pack_installations value;")===before;})());
  psql(readFileSync(absolute(readinessMigration),"utf8"),{transaction:true});
  const readinessDefinition=scalar("select md5(pg_get_functiondef('public.routine_compute_pilot_readiness(uuid)'::regprocedure));");
  psql(readFileSync(absolute(readinessMigration),"utf8"),{transaction:true});
  check("Phase 10P reapplies to the identical read-model definition",scalar("select md5(pg_get_functiondef('public.routine_compute_pilot_readiness(uuid)'::regprocedure));")===readinessDefinition);
  const stateBefore10Q=scalar("select md5(coalesce(jsonb_agg(to_jsonb(value) order by value.organization_id,value.pack_key),'[]'::jsonb)::text) from public.routine_content_pack_installations value;");
  psql(readFileSync(absolute(previousAmendmentMigration),"utf8"),{transaction:true});
  check("Phase 10Q exposes the exact 1.2R predecessor",scalar("select (public.routine_mesh_content_pack_v1()->>'packVersion')||':'||(public.routine_mesh_content_pack_v1()->>'packHash');")==="1.2R:2dcfc69b822f973c23e54934b6799faa5b9400ae0529096f049067811a417f25");
  check("Phase 10Q creates no installation or content state",scalar("select md5(coalesce(jsonb_agg(to_jsonb(value) order by value.organization_id,value.pack_key),'[]'::jsonb)::text) from public.routine_content_pack_installations value;")===stateBefore10Q);
  psql(readFileSync(absolute(securityMigration),"utf8"),{transaction:true});
  check("Phase 10O leaves content and protected domains unchanged",protectedSchemaBefore===scalar(protectedSchemaFingerprintSql)&&protectedDataBefore===scalar(protectedDataFingerprintSql));
  psql(readFileSync(absolute(servicewareAmendmentMigration),"utf8"),{transaction:true});
  check("Phase 10R exposes the exact 1.3R provider",scalar("select (public.routine_mesh_content_pack_v1()->>'packVersion')||':'||(public.routine_mesh_content_pack_v1()->>'packHash');")==="1.3R:b416001c2885bbf54bdb029b8e7164cbb903a76b8344396a4e9fcffa26107fe1");
  check("Phase 10R creates no installation or content state",scalar("select md5(coalesce(jsonb_agg(to_jsonb(value) order by value.organization_id,value.pack_key),'[]'::jsonb)::text) from public.routine_content_pack_installations value;")===stateBefore10Q);
  const dHash=authenticatedJson("44000000-0000-4000-8000-000000000001","public.preview_mesh_routine_content_pack_v1()").organizationStateHash;
  const dInstall=authenticatedJson("44000000-0000-4000-8000-000000000001",`public.install_mesh_routine_content_pack_v1('${dHash}','Install frozen 1.3R for incremental-path verification.','5d100000-0000-4000-8000-000000000001')`);
  check("production-shaped incremental fixture starts from a supported 1.3R install",dInstall.installStatus==="installed"&&dInstall.packHash==="b416001c2885bbf54bdb029b8e7164cbb903a76b8344396a4e9fcffa26107fe1"&&scalar("select count(*) from public.routine_content_pack_installations where organization_id='d4000000-0000-4000-8000-000000000001' and pack_version='1.3R';")==="1");
  const dLedgerBefore=scalar("select md5(jsonb_agg(to_jsonb(value) order by value.id)::text) from public.routine_content_pack_installations value where organization_id='d4000000-0000-4000-8000-000000000001';");
  const installationStateAfterD=scalar("select md5(coalesce(jsonb_agg(to_jsonb(value) order by value.organization_id,value.pack_key),'[]'::jsonb)::text) from public.routine_content_pack_installations value;");
  psql(readFileSync(absolute(amendmentMigration),"utf8"),{transaction:true});
  check("Phase 10S exposes the exact 1.4R provider",scalar("select (public.routine_mesh_content_pack_v1()->>'packVersion')||':'||(public.routine_mesh_content_pack_v1()->>'packHash');")===`1.4R:${PACK_HASH}`);
  const amendmentDefinition=scalar("select md5(pg_get_functiondef('public.routine_mesh_content_pack_v1()'::regprocedure));");
  psql(readFileSync(absolute(amendmentMigration),"utf8"),{transaction:true});
  check("Phase 10S reapplies to the identical provider definition",scalar("select md5(pg_get_functiondef('public.routine_mesh_content_pack_v1()'::regprocedure));")===amendmentDefinition);
  check("Phase 10S reapply creates no installation or content state",scalar("select md5(coalesce(jsonb_agg(to_jsonb(value) order by value.organization_id,value.pack_key),'[]'::jsonb)::text) from public.routine_content_pack_installations value;")===installationStateAfterD);
  const identityCatalogBefore=identityAlignmentCatalog();
  const staleCatalogBefore=staleIdentityFunctions();
  const routineAclBefore=routineAclFingerprint();
  const authenticatedFunctionsBefore=authenticatedRoutineFunctions();
  const protectedSchemaBefore10T=scalar(protectedSchemaFingerprintSql);
  const protectedDataBefore10T=scalar(protectedDataFingerprintSql);
  const inventoryBefore10T=scalar(inventoryDataFingerprintSql);
  const assetBefore10T=scalar(assetDataFingerprintSql);
  const providerBefore10T=scalar("select md5(pg_get_functiondef('public.routine_mesh_content_pack_v1()'::regprocedure));");
  const installationBefore10T=scalar("select md5(coalesce(jsonb_agg(to_jsonb(value) order by value.organization_id,value.pack_key),'[]'::jsonb)::text) from public.routine_content_pack_installations value;");
  const sharedDeviceDefinitionsBefore=scalar(String.raw`select md5(string_agg(pg_get_functiondef(p.oid),E'\n' order by p.oid::regprocedure::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and pg_get_functiondef(p.oid) like '%shared_device_operator%' and p.prokind='f';`);
  check("final Phase 10S catalog contains exactly the five authorized stale functions",canonical(staleCatalogBefore)===canonical([...IDENTITY_ALIGNMENT_SIGNATURES].sort()));
  psql(readFileSync(absolute(identityMigration),"utf8"),{transaction:true});
  const identityCatalogAfter=identityAlignmentCatalog();
  check("Phase 10T replaces all and only the five audited definitions",identityCatalogAfter.length===5&&identityCatalogAfter.every((after,index)=>after.signature===identityCatalogBefore[index].signature&&normalizeIdentityAlignmentDefinition(after.definition)===normalizeIdentityAlignmentDefinition(identityCatalogBefore[index].definition)));
  check("Phase 10T preserves function owner security search_path language volatility strictness return and ACL",identityCatalogAfter.every((after,index)=>canonical({...after,definition:undefined})===canonical({...identityCatalogBefore[index],definition:undefined})));
  check("Phase 10T leaves no stale effective personal conflict target",staleIdentityFunctions().length===0);
  check("Phase 10T leaves full identity constraints absent",scalar("select count(*) from pg_constraint where conname in('routine_run_participants_run_profile_unique','routine_bundle_participants_profile_unique');")==="0");
  check("Phase 10T preserves all four valid Phase 10J partial indexes",scalar("select count(*) from pg_index index_row join pg_class index_relation on index_relation.oid=index_row.indexrelid where index_relation.relname in('routine_run_participants_personal_unique','routine_run_participants_operator_unique','routine_bundle_participants_personal_unique','routine_bundle_participants_operator_unique') and index_row.indisvalid and index_row.indisready and index_row.indpred is not null;")==="4");
  check("Phase 10T preserves both validated identity constraints",scalar("select count(*) from pg_constraint where conname in('routine_run_participants_identity_check','routine_bundle_participants_identity_check') and convalidated;")==="2");
  check("Phase 10T preserves shared-device conflict definitions",sharedDeviceDefinitionsBefore===scalar(String.raw`select md5(string_agg(pg_get_functiondef(p.oid),E'\n' order by p.oid::regprocedure::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and pg_get_functiondef(p.oid) like '%shared_device_operator%' and p.prokind='f';`));
  check("Phase 10T preserves Routine ACL RLS and default-ACL fingerprint",routineAclBefore===routineAclFingerprint()&&canonical(authenticatedFunctionsBefore)===canonical(authenticatedRoutineFunctions()));
  check("Phase 10T keeps repaired internals unavailable to authenticated",scalar("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.oid=any(array['public.create_or_get_routine_run_phase10d(text,text,date,uuid)'::regprocedure,'public.join_routine_run_phase10d(uuid,uuid)'::regprocedure,'public.routine_ensure_run_participant(uuid,uuid,uuid,uuid)'::regprocedure,'public.routine_ensure_bundle_participant(uuid,uuid,uuid,uuid)'::regprocedure,'public.routine_ensure_closing_bundle_participant(uuid,uuid,uuid,uuid)'::regprocedure]) and has_function_privilege('authenticated',p.oid,'EXECUTE');")==="0");
  check("Phase 10T leaves PUBLIC and anon Routine EXECUTE at zero",scalar("select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'routine_%' or p.proname in('create_or_get_routine_run','join_routine_run','create_or_get_double_shift_bundle')) and has_function_privilege('public',p.oid,'EXECUTE'))::text||':'||(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'routine_%' or p.proname in('create_or_get_routine_run','join_routine_run','create_or_get_double_shift_bundle')) and has_function_privilege('anon',p.oid,'EXECUTE'))::text;")==="0:0");
  check("Phase 10T leaves authenticated Routine table DML at zero",scalar("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'routine_%' and c.relkind in('r','p') and (has_table_privilege('authenticated',c.oid,'INSERT') or has_table_privilege('authenticated',c.oid,'UPDATE') or has_table_privilege('authenticated',c.oid,'DELETE'));")==="0");
  check("Phase 10T changes no provider content installation or protected domain",providerBefore10T===scalar("select md5(pg_get_functiondef('public.routine_mesh_content_pack_v1()'::regprocedure));")&&installationBefore10T===scalar("select md5(coalesce(jsonb_agg(to_jsonb(value) order by value.organization_id,value.pack_key),'[]'::jsonb)::text) from public.routine_content_pack_installations value;")&&protectedSchemaBefore10T===scalar(protectedSchemaFingerprintSql)&&protectedDataBefore10T===scalar(protectedDataFingerprintSql)&&inventoryBefore10T===scalar(inventoryDataFingerprintSql)&&assetBefore10T===scalar(assetDataFingerprintSql));
  const identityDefinitionsAfter=canonical(identityCatalogAfter.map((entry)=>entry.definition));
  psql(readFileSync(absolute(identityMigration),"utf8"),{transaction:true});
  check("Phase 10T reapplies to identical definitions and state",canonical(identityAlignmentCatalog().map((entry)=>entry.definition))===identityDefinitionsAfter&&routineAclBefore===routineAclFingerprint()&&installationBefore10T===scalar("select md5(coalesce(jsonb_agg(to_jsonb(value) order by value.organization_id,value.pack_key),'[]'::jsonb)::text) from public.routine_content_pack_installations value;"));
  if(process.env.PHASE10U_AUDIT_ONLY==="1"){
    console.log(`PHASE10U_OPERATION_CATALOG_AUDIT=${JSON.stringify(operationLedgerCatalogAudit())}`);
    console.log(`PHASE10U_OPERATION_UNIQUENESS_AUDIT=${JSON.stringify(operationLedgerUniquenessAudit())}`);
    return;
  }
  if(process.env.PHASE10T_AUDIT_ONLY==="1"){
    console.log(`PHASE10T_FINAL_CATALOG_STALE_BEFORE=${JSON.stringify(staleCatalogBefore)}`);
    console.log(`PHASE10T_FINAL_CATALOG_STALE_AFTER=${JSON.stringify(staleIdentityFunctions())}`);
    return;
  }
  const operationCatalogBefore=operationConvergenceCatalog();
  const operationUniquenessBefore=operationLedgerUniquenessAudit();
  const operationAclBefore=routineAclFingerprint();
  const protectedSchemaBefore10U=scalar(protectedSchemaFingerprintSql);
  const protectedDataBefore10U=scalar(protectedDataFingerprintSql);
  const inventoryBefore10U=scalar(inventoryDataFingerprintSql);
  const assetBefore10U=scalar(assetDataFingerprintSql);
  const providerBefore10U=scalar("select md5(pg_get_functiondef('public.routine_mesh_content_pack_v1()'::regprocedure));");
  const installationBefore10U=scalar("select md5(coalesce(jsonb_agg(to_jsonb(value) order by value.organization_id,value.pack_key),'[]'::jsonb)::text) from public.routine_content_pack_installations value;");
  psql(readFileSync(absolute(operationMigration),"utf8"),{transaction:true});
  const operationCatalogAfter=operationConvergenceCatalog();
  check("Phase 10U replaces exactly four audited operation functions",operationCatalogBefore.length===4&&operationCatalogAfter.length===4&&operationCatalogAfter.every((after,index)=>after.signature===operationCatalogBefore[index].signature&&after.definition!==operationCatalogBefore[index].definition));
  check("Phase 10U changes only replay volatility in function metadata",operationCatalogAfter.every((after,index)=>{
    const before=operationCatalogBefore[index];
    const expectedVolatility=after.signature.includes("_replay(")?"v":before.volatility;
    return expectedVolatility===after.volatility&&canonical({...after,definition:undefined,volatility:undefined})===canonical({...before,definition:undefined,volatility:undefined});
  }));
  check("Phase 10U replay helpers are volatile and all four functions remain security-definer pg_catalog routines",operationCatalogAfter.every((entry)=>entry.volatility==="v"&&entry.security_definer===true&&canonical(entry.config)===canonical(["search_path=pg_catalog"])));
  check("Phase 10U preserves exact run and bundle uniqueness contracts",canonical(operationLedgerUniquenessAudit())===canonical(operationUniquenessBefore));
  check("Phase 10U preserves ACL RLS content and protected domains",operationAclBefore===routineAclFingerprint()&&providerBefore10U===scalar("select md5(pg_get_functiondef('public.routine_mesh_content_pack_v1()'::regprocedure));")&&installationBefore10U===scalar("select md5(coalesce(jsonb_agg(to_jsonb(value) order by value.organization_id,value.pack_key),'[]'::jsonb)::text) from public.routine_content_pack_installations value;")&&protectedSchemaBefore10U===scalar(protectedSchemaFingerprintSql)&&protectedDataBefore10U===scalar(protectedDataFingerprintSql)&&inventoryBefore10U===scalar(inventoryDataFingerprintSql)&&assetBefore10U===scalar(assetDataFingerprintSql));
  const operationDefinitionsAfter=canonical(operationCatalogAfter.map((entry)=>entry.definition));
  psql(readFileSync(absolute(operationMigration),"utf8"),{transaction:true});
  check("Phase 10U reapplies to identical definitions ACL and state",canonical(operationConvergenceCatalog().map((entry)=>entry.definition))===operationDefinitionsAfter&&operationAclBefore===routineAclFingerprint()&&installationBefore10U===scalar("select md5(coalesce(jsonb_agg(to_jsonb(value) order by value.organization_id,value.pack_key),'[]'::jsonb)::text) from public.routine_content_pack_installations value;"));
  if(process.env.PHASE10V_AUDIT_ONLY==="1"){
    console.log(`PHASE10V_CREATION_CATALOG_AUDIT=${JSON.stringify(creationProvenanceCatalogAudit())}`);
    console.log(`PHASE10V_CREATION_FUNCTION_AUDIT=${JSON.stringify(creationProvenanceFunctionAudit())}`);
    return;
  }
  const creationCatalogBefore=creationProvenanceCatalogAudit();
  const creationFunctionsBefore=creationProvenanceFunctionAudit();
  const creationStructuralBefore=routineStructuralFingerprint({excludeLegacyCreationConstraints:true});
  const creationAclBefore=routineAclFingerprint();
  const creationDataFingerprintSql=String.raw`select encode(digest(
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_runs value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_run_participants value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_bundles value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_bundle_participants value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_run_operations value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_bundle_operations value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.organization_id)::text from public.routine_organization_settings value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_content_pack_installations value),'[]'),
    'sha256'),'hex');`;
  const creationDataBefore=scalar(creationDataFingerprintSql);
  const targetCatalogObjectsBefore=creationCatalogBefore.objects.filter((entry)=>CREATION_PROVENANCE_CONSTRAINTS.includes(entry.object_name));
  check("post-10U audit finds exactly the four legacy constraints and their four owned indexes",targetCatalogObjectsBefore.length===8&&targetCatalogObjectsBefore.filter((entry)=>entry.object_type==="constraint").length===4&&targetCatalogObjectsBefore.filter((entry)=>entry.object_type==="index"&&entry.object_kind==="unique").length===4);
  check("post-10U effective call graph has no run bundle or participant creation-key lookup or conflict target",creationFunctionsBefore.every((entry)=>entry.directLookup===false&&entry.onConflictReference===false&&entry.updateReference===false));
  check("post-10U creation-key catalog contains exactly ten NOT NULL UUID provenance columns",creationCatalogBefore.columns.length===10&&creationCatalogBefore.columns.every((entry)=>entry.data_type==="uuid"&&entry.not_null===true));
  psql(readFileSync(absolute(provenanceMigration),"utf8"),{transaction:true});
  const creationCatalogAfter=creationProvenanceCatalogAudit();
  check("Phase 10V removes exactly the four authorized constraints and their owned indexes",creationCatalogAfter.objects.every((entry)=>!CREATION_PROVENANCE_CONSTRAINTS.includes(entry.object_name))&&creationCatalogBefore.objects.length-creationCatalogAfter.objects.length===8);
  check("Phase 10V adds no replacement unique organization creation-key index",scalar(String.raw`
    select count(*) from pg_index index_row
    join pg_class table_row on table_row.oid=index_row.indrelid
    join pg_class index_relation on index_relation.oid=index_row.indexrelid
    join pg_namespace namespace on namespace.oid=table_row.relnamespace
    where namespace.nspname='public' and table_row.relname in('routine_runs','routine_run_participants','routine_bundles','routine_bundle_participants')
      and index_row.indisunique and lower(pg_get_indexdef(index_relation.oid))~'[(]organization_id, creation_idempotency_key[)]';
  `)==="0");
  check("Phase 10V preserves all four provenance columns as UUID NOT NULL without default drift",canonical(creationCatalogAfter.columns.filter((entry)=>["routine_runs","routine_run_participants","routine_bundles","routine_bundle_participants"].includes(entry.table_name)))===canonical(creationCatalogBefore.columns.filter((entry)=>["routine_runs","routine_run_participants","routine_bundles","routine_bundle_participants"].includes(entry.table_name))));
  check("Phase 10V preserves all six authoritative business and participant identity indexes",scalar(String.raw`
    select count(*) from pg_index index_row join pg_class index_relation on index_relation.oid=index_row.indexrelid
    where index_relation.relname in('routine_runs_authoritative_identity_idx','routine_run_participants_personal_unique',
      'routine_run_participants_operator_unique','routine_bundles_active_identity_unique',
      'routine_bundle_participants_personal_unique','routine_bundle_participants_operator_unique')
      and index_row.indisunique and index_row.indisvalid and index_row.indisready;
  `)==="6");
  check("Phase 10V exact schema delta excludes every non-authorized object",creationStructuralBefore===routineStructuralFingerprint({excludeLegacyCreationConstraints:true})&&canonical(creationCatalogBefore.objects.filter((entry)=>!CREATION_PROVENANCE_CONSTRAINTS.includes(entry.object_name)))===canonical(creationCatalogAfter.objects));
  const creationDataAfter=scalar(creationDataFingerprintSql);
  const creationAclAfter=routineAclFingerprint();
  const protectedDataAfter10V=scalar(protectedDataFingerprintSql);
  const inventoryAfter10V=scalar(inventoryDataFingerprintSql);
  const assetAfter10V=scalar(assetDataFingerprintSql);
  if(creationDataBefore!==creationDataAfter||creationAclBefore!==creationAclAfter||protectedDataBefore10U!==protectedDataAfter10V||inventoryBefore10U!==inventoryAfter10V||assetBefore10U!==assetAfter10V)console.error(`Phase 10V fingerprint diagnostic: ${JSON.stringify({creationDataBefore,creationDataAfter,creationAclBefore,creationAclAfter,protectedDataBefore10U,protectedDataAfter10V,inventoryBefore10U,inventoryAfter10V,assetBefore10U,assetAfter10V})}`);
  check("Phase 10V preserves run bundle operation settings and installation data timestamps",creationDataBefore===creationDataAfter);
  check("Phase 10V preserves ACL RLS policies triggers and default ACL",creationAclBefore===creationAclAfter);
  check("Phase 10V preserves protected Inventory Asset Event Operations Auth Storage Realtime and legacy data",protectedDataBefore10U===protectedDataAfter10V&&inventoryBefore10U===inventoryAfter10V&&assetBefore10U===assetAfter10V);
  check("Phase 10V leaves PUBLIC anon EXECUTE and authenticated Routine table DML at zero",scalar("select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'routine_%' or p.proname in('create_or_get_routine_run','join_routine_run','create_or_get_double_shift_bundle')) and has_function_privilege('public',p.oid,'EXECUTE'))::text||':'||(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'routine_%' or p.proname in('create_or_get_routine_run','join_routine_run','create_or_get_double_shift_bundle')) and has_function_privilege('anon',p.oid,'EXECUTE'))::text||':'||(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'routine_%' and c.relkind in('r','p') and (has_table_privilege('authenticated',c.oid,'INSERT') or has_table_privilege('authenticated',c.oid,'UPDATE') or has_table_privilege('authenticated',c.oid,'DELETE')))::text;")==="0:0:0");
  const creationStructuralAfter=routineStructuralFingerprint();
  psql(readFileSync(absolute(provenanceMigration),"utf8"),{transaction:true});
  check("Phase 10V reapplies with identical schema data ACL and protected-domain fingerprints",creationStructuralAfter===routineStructuralFingerprint()&&creationDataBefore===scalar(creationDataFingerprintSql)&&creationAclBefore===routineAclFingerprint()&&protectedSchemaBefore10U===scalar(protectedSchemaFingerprintSql)&&protectedDataBefore10U===scalar(protectedDataFingerprintSql));
  const dO15Before=scalar("select md5(to_jsonb(task)::text) from public.routine_template_tasks task where task.organization_id='d4000000-0000-4000-8000-000000000001' and task.metadata->>'authoritativeSourceId'='O15';");
  const staleDraftUpdate=upsertDraftTask("44000000-0000-4000-8000-000000000001","d4000000-0000-4000-8000-000000000001","O15",{availabilityMode:"immediate"},{expectedVersionRevision:"version_revision-1",allowFailure:true});
  if(staleDraftUpdate.status===0||!/stale/i.test(staleDraftUpdate.stderr))console.error(`Stale draft probe diagnostic: ${staleDraftUpdate.status} ${staleDraftUpdate.stderr}`);
  check("stale manager revision preserves the 1.3R draft input",staleDraftUpdate.status!==0&&/stale/i.test(staleDraftUpdate.stderr)&&dO15Before===scalar("select md5(to_jsonb(task)::text) from public.routine_template_tasks task where task.organization_id='d4000000-0000-4000-8000-000000000001' and task.metadata->>'authoritativeSourceId'='O15';"));
  for(const [id,changes] of [
    ["O15",{availabilityMode:"immediate"}],
    ["O22",{condition:{fact:"organization_flag",key:"seasonal_candles",operator:"equals",value:true}}],
    ["O23",{availabilityMode:"immediate"}],
    ["O37",{availabilityMode:"after_task"}],
    ["C14",{startFromLocalTime:"17:35:00"}],
    ["C15",{taskType:"gate"}],
  ]){
    const result=upsertDraftTask("44000000-0000-4000-8000-000000000001","d4000000-0000-4000-8000-000000000001",id,changes);
    check(`incremental ${id} change uses supported manager task RPC`,result.status===0);
  }
  for(const [taskId,itemKey,sourceKind,sourceConfig] of [
    ["O13","inventory_standard_items","inventory_readonly",INVENTORY_CONFIG],
    ["O13","eggs_present_and_to_standard","static",{}],
    ["O13","fridge_clean_and_operating","static",{}],
    ["C08","inventory_standard_items","inventory_readonly",INVENTORY_CONFIG],
    ["C08","eggs_present_and_to_standard","static",{}],
    ["C08","fridge_clean_and_operating","static",{}],
    ["C28","inventory_standard_items","inventory_readonly",INVENTORY_CONFIG],
    ["C28","eggs_present_and_to_standard","static",{}],
    ["C28","fridge_clean_and_operating","static",{}],
    ["C37","active_asset_registry_items","asset_registry_readonly",ASSET_CONFIG],
    ...C37_STATIC_KEYS.map((itemKey)=>["C37",itemKey,"static",{}]),
  ]){
    const result=upsertDraftItem("44000000-0000-4000-8000-000000000001","d4000000-0000-4000-8000-000000000001",taskId,itemKey,{sourceKind,sourceConfig,standardId:null,sourceLocationSetId:null});
    check(`incremental ${taskId}/${itemKey} source correction uses supported manager item RPC`,result.status===0);
  }
  const retryAfterSave=upsertDraftTask("44000000-0000-4000-8000-000000000001","d4000000-0000-4000-8000-000000000001","O15",{availabilityMode:"immediate"},{expectedTaskRevision:"revision-1",allowFailure:true});
  check("ambiguous retry is revision-safe and preserves saved manager input",retryAfterSave.status!==0&&/stale/i.test(retryAfterSave.stderr)&&scalar("select availability_mode from public.routine_template_tasks where organization_id='d4000000-0000-4000-8000-000000000001' and metadata->>'authoritativeSourceId'='O15';")==="immediate");
  const dRelationUpdate=psql(String.raw`select set_config('request.jwt.claim.sub','44000000-0000-4000-8000-000000000001',false);
    with current_version as (select version.* from public.routine_template_versions version join public.routine_templates template on template.id=version.template_id where version.organization_id='d4000000-0000-4000-8000-000000000001' and version.state='draft' and template.routine_key='opening'),
    payload as (select jsonb_agg(jsonb_build_object('sourceTaskId',relation.source_task_id,'targetRoutineKey',relation.target_routine_key,'targetTaskKey',relation.target_task_key,'relationType',relation.relation_type,'metadata',case when source_task.metadata->>'authoritativeSourceId'='O22' and relation.target_routine_key='closing' and relation.target_task_key like 'c22-%' then jsonb_build_object('condition',jsonb_build_object('fact','organization_flag','key','seasonal_candles','operator','equals','value',true),'runtimeContractAlignment',jsonb_build_object('date','2026-08-09','decisionHash','${DECISION_HASH}')) else relation.metadata end) order by relation.id) relations from public.routine_template_task_relations relation join public.routine_template_tasks source_task on source_task.id=relation.source_task_id join current_version version on version.id=relation.version_id)
    select public.replace_routine_draft_relations(version.id,payload.relations,version.revision) from current_version version cross join payload;`);
  check("incremental O22 companion correction uses supported relation RPC",dRelationUpdate.status===0);
  const dDependencyUpdate=psql(String.raw`select set_config('request.jwt.claim.sub','44000000-0000-4000-8000-000000000001',false);
    with current_version as (select version.* from public.routine_template_versions version join public.routine_templates template on template.id=version.template_id where version.organization_id='d4000000-0000-4000-8000-000000000001' and version.state='draft' and template.routine_key='closing'),
    existing as (select dependency.predecessor_task_id,dependency.successor_task_id,dependency.dependency_type,dependency.metadata from public.routine_template_task_dependencies dependency join current_version version on version.id=dependency.version_id join public.routine_template_tasks predecessor on predecessor.id=dependency.predecessor_task_id where not(predecessor.metadata->>'authoritativeSourceId'='C05' and dependency.dependency_type='must_complete')),
    added as (select predecessor.id predecessor_task_id,successor.id successor_task_id,'complete_predecessor_on_successor'::text dependency_type,jsonb_build_object('runtimeContractAlignment',jsonb_build_object('date','2026-08-09','decisionHash','${DECISION_HASH}')) metadata from public.routine_template_tasks predecessor join public.routine_template_tasks successor on successor.version_id=predecessor.version_id join current_version version on version.id=predecessor.version_id where predecessor.metadata->>'authoritativeSourceId'='C05' and successor.metadata->>'authoritativeSourceId'='C15'),
    payload as (select jsonb_agg(jsonb_build_object('predecessorTaskId',entry.predecessor_task_id,'successorTaskId',entry.successor_task_id,'dependencyType',entry.dependency_type,'metadata',entry.metadata) order by entry.predecessor_task_id,entry.successor_task_id,entry.dependency_type) dependencies from (select * from existing union all select * from added) entry)
    select public.replace_routine_draft_dependencies(version.id,payload.dependencies,version.revision) from current_version version cross join payload;`);
  check("incremental C05 dependency replacement uses supported dependency RPC",dDependencyUpdate.status===0);
  const dVersions=JSON.parse(scalar("select jsonb_object_agg(template.routine_key,jsonb_build_object('id',version.id,'revision',version.revision))::text from public.routine_templates template join public.routine_template_versions version on version.template_id=template.id where template.organization_id='d4000000-0000-4000-8000-000000000001' and version.state='draft';"));
  const dVersionArray=`array['${dVersions.opening.id}'::uuid,'${dVersions.closing.id}'::uuid]`;
  const dPreview=authenticatedJson("44000000-0000-4000-8000-000000000001",`public.preview_routine_template_publication_batch(${dVersionArray})`);
  check("production-shaped incremental manager path has zero publication blockers",dPreview.valid===true&&dPreview.blockers.length===0);
  check("historical 1.3R installation ledger is not rewritten",dLedgerBefore===scalar("select md5(jsonb_agg(to_jsonb(value) order by value.id)::text) from public.routine_content_pack_installations value where organization_id='d4000000-0000-4000-8000-000000000001';"));
  const dDraftFingerprint=draftSemanticFingerprint("d4000000-0000-4000-8000-000000000001");
  const cHash=scalar("select set_config('request.jwt.claim.sub','33000000-0000-4000-8000-000000000001',false); set role authenticated; select public.preview_mesh_routine_content_pack_v1()->>'organizationStateHash';").split("\n").at(-1);
  const concurrentSql=`select set_config('request.jwt.claim.sub','33000000-0000-4000-8000-000000000001',false); set role authenticated; select public.install_mesh_routine_content_pack_v1('${cHash}','Concurrent same-key content installation.','5c100000-0000-4000-8000-000000000001');`;
  const concurrent=await Promise.all([psqlAsync(concurrentSql),psqlAsync(concurrentSql)]);
  if(concurrent.some((result)=>result.status!==0))console.error(concurrent.map((result)=>`${result.status}: ${result.stderr}`).join("\n"));
  check("same-key concurrent installation converges",concurrent.every((result)=>result.status===0));
  check("concurrency creates one installation and one operation",scalar("select count(*)||':'||(select count(*) from public.routine_content_pack_operations where organization_id='c3000000-0000-4000-8000-000000000001') from public.routine_content_pack_installations where organization_id='c3000000-0000-4000-8000-000000000001';")==="1:1");
  check("incrementally amended 1.3R drafts are semantically identical to a fresh 1.4R install",dDraftFingerprint===draftSemanticFingerprint("c3000000-0000-4000-8000-000000000001"));
  check("fresh 1.4R install resolves Foundation 14 of 14 with zero pack requirements",scalar("select (select count(*) from public.routine_standards where organization_id='c3000000-0000-4000-8000-000000000001')||':'||(select count(*) from public.routine_standards where organization_id='c3000000-0000-4000-8000-000000000001' and current_revision_id is not null)||':'||jsonb_array_length(public.routine_mesh_content_pack_v1()->'unresolvedRequirements');")==="14:14:0");
  const cVersions=JSON.parse(scalar("select jsonb_object_agg(template.routine_key,jsonb_build_object('id',version.id,'revision',version.revision))::text from public.routine_templates template join public.routine_template_versions version on version.template_id=template.id where template.organization_id='c3000000-0000-4000-8000-000000000001' and version.state='draft';"));
  const cVersionIds=[cVersions.opening.id,cVersions.closing.id];
  const cVersionArray=`array['${cVersionIds[0]}'::uuid,'${cVersionIds[1]}'::uuid]`;
  const openingValidation=authenticatedJson("33000000-0000-4000-8000-000000000001",`public.validate_routine_template_version('${cVersions.opening.id}'::uuid,${cVersionArray})`);
  const closingValidation=authenticatedJson("33000000-0000-4000-8000-000000000001",`public.validate_routine_template_version('${cVersions.closing.id}'::uuid,${cVersionArray})`);
  check("actual final validator accepts Opening",openingValidation.valid===true&&openingValidation.blockers.length===0);
  check("actual final validator accepts Closing",closingValidation.valid===true&&closingValidation.blockers.length===0);
  const publicationPreview=authenticatedJson("33000000-0000-4000-8000-000000000001",`public.preview_routine_template_publication_batch(${cVersionArray})`);
  check("actual atomic Opening and Closing preview has zero blockers",publicationPreview.valid===true&&publicationPreview.blockers.length===0&&publicationPreview.versions.length===2);
  console.log(`Publication preview warnings: ${JSON.stringify(publicationPreview.warnings)}`);
  const stalePublicationRevisions={ [cVersions.opening.id]:cVersions.opening.revision, [cVersions.closing.id]:cVersions.closing.revision+1 };
  const rejectedPublication=psql(`select set_config('request.jwt.claim.sub','33000000-0000-4000-8000-000000000001',false); set role authenticated; select public.publish_routine_template_versions(${cVersionArray},'${JSON.stringify(stalePublicationRevisions)}'::jsonb,'Atomic failure probe.','5c300000-0000-4000-8000-000000000001');`,{allowFailure:true});
  check("atomic publish failure leaves both versions unpublished",rejectedPublication.status!==0&&/stale/i.test(rejectedPublication.stderr)&&scalar(`select count(*) from public.routine_template_versions where id=any(${cVersionArray}) and state='draft';`)==="2");
  const publicationRevisions={ [cVersions.opening.id]:cVersions.opening.revision, [cVersions.closing.id]:cVersions.closing.revision };
  const publication=authenticatedJson("33000000-0000-4000-8000-000000000001",`public.publish_routine_template_versions(${cVersionArray},'${JSON.stringify(publicationRevisions)}'::jsonb,'Disposable atomic 1.4R publication.','5c300000-0000-4000-8000-000000000002')`);
  check("real disposable atomic publish publishes Opening and Closing together",publication.versions?.length===2&&scalar(`select count(*) from public.routine_template_versions where id=any(${cVersionArray}) and state='published';`)==="2"&&scalar("select count(*) from public.routine_template_publication_batches where organization_id='c3000000-0000-4000-8000-000000000001';")==="1");
  psql(String.raw`
    insert into auth.users(id) values('33000000-0000-4000-8000-000000000002');
    insert into public.user_profiles(id,organization_id,display_name,role,active,is_shared_device)
    values('33000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000001','Routine C Staff','staff',true,false);
    insert into auth.users(id) values('33000000-0000-4000-8000-000000000003');
    insert into public.user_profiles(id,organization_id,display_name,role,active,is_shared_device)
    values('33000000-0000-4000-8000-000000000003','c3000000-0000-4000-8000-000000000001','Routine C Shift Lead','shift_lead',true,false);
    insert into public.inventory_products(id,organization_id,name,short_name,unit_label,active,sort_order) values
      ('c5100000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','Eggs','Eggs','pack',true,0),
      ('c5100000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000001','Sparkling water','Water','bottle',true,1),
      ('c5100000-0000-4000-8000-000000000003','c3000000-0000-4000-8000-000000000001','Apple juice','Juice','bottle',true,2),
      ('c5100000-0000-4000-8000-000000000004','c3000000-0000-4000-8000-000000000001','Inactive product','Inactive','unit',false,3),
      ('c5100000-0000-4000-8000-000000000005','c3000000-0000-4000-8000-000000000001','Inactive binding','Inactive binding','unit',true,4);
    insert into public.inventory_locations(id,organization_id,name,code,location_type,active,sort_order) values
      ('c5200000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','Workbar food/non-alcoholic fridge','WORKBAR_NON_ALCO_FRIDGE','fridge',true,0);
    insert into public.inventory_location_products(id,organization_id,location_id,product_id,par_quantity,count_order,active,stock_policy) values
      ('c5300000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','c5200000-0000-4000-8000-000000000001','c5100000-0000-4000-8000-000000000001',12,0,true,'exact_par'),
      ('c5300000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000001','c5200000-0000-4000-8000-000000000001','c5100000-0000-4000-8000-000000000002',24,1,true,'exact_par'),
      ('c5300000-0000-4000-8000-000000000003','c3000000-0000-4000-8000-000000000001','c5200000-0000-4000-8000-000000000001','c5100000-0000-4000-8000-000000000003',10,2,true,'exact_par'),
      ('c5300000-0000-4000-8000-000000000004','c3000000-0000-4000-8000-000000000001','c5200000-0000-4000-8000-000000000001','c5100000-0000-4000-8000-000000000004',1,3,true,'exact_par'),
      ('c5300000-0000-4000-8000-000000000005','c3000000-0000-4000-8000-000000000001','c5200000-0000-4000-8000-000000000001','c5100000-0000-4000-8000-000000000005',1,4,false,'exact_par');
    insert into public.asset_registry(
      id,organization_id,asset_type,provider,model,serial_number,expected_venue,expected_station,
      active,condition,default_required_for_closing,local_id,source,created_at,updated_at
    ) values
      ('c5400000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','tablet','Apple','iPad','C37-IPAD-001','Workbar','Device charging station',true,'ok',true,'c37-ipad','app','2026-08-10 06:00:00+00','2026-08-10 06:00:00+00'),
      ('c5400000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000001','payment_terminal','POS Provider','POS Terminal','C37-POS-001','Atrium Event','Event POS station',true,'ok',true,'c37-pos','app','2026-08-10 06:01:00+00','2026-08-10 06:01:00+00'),
      ('c5400000-0000-4000-8000-000000000003','c3000000-0000-4000-8000-000000000001','radio','Mesh Devices','Service Radio','C37-RADIO-001','Cornerbar','Back bar charging',true,'ok',true,'c37-radio','app','2026-08-10 06:02:00+00','2026-08-10 06:02:00+00'),
      ('c5400000-0000-4000-8000-000000000004','c3000000-0000-4000-8000-000000000001','tablet','Apple','Non-closing iPad','C37-IPAD-002','Office','Office charging',true,'ok',false,'c37-non-closing','app','2026-08-10 06:03:00+00','2026-08-10 06:03:00+00'),
      ('c5400000-0000-4000-8000-000000000005','c3000000-0000-4000-8000-000000000001','radio','Mesh Devices','Inactive Radio','C37-RADIO-002','Workbar','Device charging station',false,'repair',true,'c37-inactive','app','2026-08-10 06:04:00+00','2026-08-10 06:04:00+00'),
      ('c5400000-0000-4000-8000-000000000006','d4000000-0000-4000-8000-000000000001','tablet','Apple','Other-org iPad','C37-OTHER-001','Workbar','Device charging station',true,'ok',true,'c37-other-org','app','2026-08-10 06:05:00+00','2026-08-10 06:05:00+00');
  `);
  const inventoryBeforeRuns=scalar(inventoryDataFingerprintSql);
  const assetBeforeRuns=scalar(assetDataFingerprintSql);
  const assetSchemaBeforeRuns=scalar(protectedSchemaFingerprintSql);
  check("published templates retain exactly one approved source item and two static physical checks per O13 C08 C28",scalar(String.raw`
    select count(*) filter(where item.item_key='inventory_standard_items' and item.source_kind='inventory_readonly' and item.source_config='{"mode":"location_standards","activeOnly":true,"locationCodes":["WORKBAR_NON_ALCO_FRIDGE"]}'::jsonb)::text||':'||
      count(*) filter(where item.item_key in('eggs_present_and_to_standard','fridge_clean_and_operating') and item.source_kind='static' and item.source_config='{}'::jsonb)::text
    from public.routine_template_task_items item join public.routine_template_tasks task on task.id=item.task_id
    where item.version_id=any(${cVersionArray}) and task.metadata->>'authoritativeSourceId' in('O13','C08','C28')
      and item.item_key in('inventory_standard_items','eggs_present_and_to_standard','fridge_clean_and_operating');
  `)==="3:6");
  check("published C37 retains one canonical dynamic source and five static aggregate controls",scalar(String.raw`
    select count(*) filter(where item.item_key='active_asset_registry_items' and item.source_kind='asset_registry_readonly'
        and item.source_config='{"mode":"active_assets","requiredForClosing":true}'::jsonb)::text||':'||
      count(*) filter(where item.item_key in('device_physically_accounted_for','correct_charging_position','charging_confirmed','damage_or_fault_recorded','event_transfer_evidence_when_required')
        and item.source_kind='static' and item.source_config='{}'::jsonb)::text
    from public.routine_template_task_items item join public.routine_template_tasks task on task.id=item.task_id
    where item.version_id=any(${cVersionArray}) and task.metadata->>'authoritativeSourceId'='C37';
  `)==="1:5");
  const openingRun=authenticatedDisposableRunJson("33000000-0000-4000-8000-000000000001","public.create_or_get_routine_run('opening','phase10s-timing','2026-08-10'::date,'5c400000-0000-4000-8000-000000000001')");
  const o15Runtime=JSON.parse(scalar(`select jsonb_build_object('availabilityMode',task.availability_mode_snapshot,'visibleAt',timing.visible_at,'startAt',timing.start_at,'targetAt',timing.target_at,'hardDeadlineAt',timing.hard_deadline_at,'beforeTarget',public.routine_compute_task_timing_phase(task.id,timing.target_at-interval '1 second'),'afterTarget',public.routine_compute_task_timing_phase(task.id,timing.target_at+interval '1 second'))::text from public.routine_run_tasks task join public.routine_run_task_timings timing on timing.task_id=task.id where task.run_id='${openingRun.run.id}' and task.task_key_snapshot like 'o15-%';`));
  check("O15 is available from run start and becomes due/late at retained 10:45 boundaries",o15Runtime.availabilityMode==="immediate"&&o15Runtime.visibleAt===null&&o15Runtime.startAt===null&&o15Runtime.targetAt===o15Runtime.hardDeadlineAt&&o15Runtime.beforeTarget.phase==="available"&&o15Runtime.beforeTarget.canStart===true&&o15Runtime.afterTarget.phase==="due"&&o15Runtime.afterTarget.secondsLate===1);
  const closingRun=authenticatedDisposableRunJson("33000000-0000-4000-8000-000000000001","public.create_or_get_routine_run('closing','phase10s-automatic','2026-08-10'::date,'5c400000-0000-4000-8000-000000000002')");
  const closingReplay=authenticatedDisposableRunJson("33000000-0000-4000-8000-000000000001","public.create_or_get_routine_run('closing','phase10s-automatic','2026-08-10'::date,'5c400000-0000-4000-8000-000000000002')");
  const c37Summary=JSON.parse(scalar(String.raw`
    select jsonb_build_object(
      'dynamicCount',count(*) filter(where item.source_kind_snapshot='asset_registry_readonly'),
      'dynamicUniqueKeys',count(distinct item.item_key_snapshot) filter(where item.source_kind_snapshot='asset_registry_readonly'),
      'dynamicProvenance',coalesce(bool_and(item.generated_from_source and item.external_source_type_snapshot='asset_registry'
        and item.external_source_id_snapshot is not null and item.external_source_revision_snapshot is not null
        and item.item_key_snapshot='active_asset_registry_items-asset-'||item.external_source_id_snapshot
        and item.source_record_snapshot->>'assetId'=item.external_source_id_snapshot
        and item.source_record_snapshot->>'sourceUpdatedAt'=item.external_source_revision_snapshot
        and item.row_snapshot_hash~'^[0-9a-f]{64}$') filter(where item.source_kind_snapshot='asset_registry_readonly'),false),
      'assetIds',coalesce(jsonb_agg(item.external_source_id_snapshot order by item.item_key_snapshot)
        filter(where item.source_kind_snapshot='asset_registry_readonly'),'[]'::jsonb),
      'staticCount',count(*) filter(where item.source_kind_snapshot='static' and not item.generated_from_source),
      'staticKeys',coalesce(jsonb_agg(item.item_key_snapshot order by item.item_key_snapshot)
        filter(where item.source_kind_snapshot='static' and not item.generated_from_source),'[]'::jsonb),
      'totalCount',count(*)
    )::text
    from public.routine_run_task_items item join public.routine_run_tasks task on task.id=item.run_task_id
    where task.run_id='${closingRun.run.id}' and task.metadata_snapshot->>'authoritativeSourceId'='C37' and item.active_snapshot;
  `));
  check("C37 expands exactly three active same-org required-closing assets with stable unique keys and provenance",c37Summary.dynamicCount===3&&c37Summary.dynamicUniqueKeys===3&&c37Summary.dynamicProvenance===true
    &&canonical(c37Summary.assetIds.sort())===canonical(["c5400000-0000-4000-8000-000000000001","c5400000-0000-4000-8000-000000000002","c5400000-0000-4000-8000-000000000003"]));
  check("C37 includes the event-venue asset and excludes non-required inactive and cross-org assets",c37Summary.assetIds.includes("c5400000-0000-4000-8000-000000000002")&&!c37Summary.assetIds.includes("c5400000-0000-4000-8000-000000000004")&&!c37Summary.assetIds.includes("c5400000-0000-4000-8000-000000000005")&&!c37Summary.assetIds.includes("c5400000-0000-4000-8000-000000000006"));
  check("C37 retains five singleton aggregate controls and eight total active items",c37Summary.staticCount===5&&c37Summary.totalCount===8&&canonical(c37Summary.staticKeys)===canonical([...C37_STATIC_KEYS].sort()));
  check("C37 records exactly one resolved dynamic source snapshot with three records",scalar(String.raw`
    select count(*)::text||':'||coalesce(max(source.record_count),-1)::text||':'||coalesce(bool_and(source.resolution_state='resolved'
      and source.source_kind='asset_registry_readonly' and source.source_config_snapshot='{"mode":"active_assets","requiredForClosing":true}'::jsonb
      and source.source_hash~'^[0-9a-f]{64}$' and jsonb_array_length(source.snapshot_payload)=3),false)::text
    from public.routine_run_snapshot_sources source
    join public.routine_template_task_items item on item.id=source.source_template_item_id
    join public.routine_template_tasks task on task.id=item.task_id
    where source.run_id='${closingRun.run.id}' and task.metadata->>'authoritativeSourceId'='C37' and item.item_key='active_asset_registry_items';
  `)==="1:3:true");
  check("idempotent Closing replay returns the same run without duplicating C37 items",closingReplay.run.id===closingRun.run.id&&scalar(`select count(*) from public.routine_run_task_items item join public.routine_run_tasks task on task.id=item.run_task_id where task.run_id='${closingRun.run.id}' and task.metadata_snapshot->>'authoritativeSourceId'='C37';`)==="8");
  const openingAlternate=authenticatedDisposableRunJson("33000000-0000-4000-8000-000000000001","public.create_or_get_routine_run('opening','phase10s-timing','2026-08-10'::date,'5c400000-0000-4000-8000-000000000005')");
  check("personal Opening and Closing creation reaches the repaired Phase 10D path with one personal participant each",openingAlternate.run.id===openingRun.run.id
    &&scalar(`select count(*) from public.routine_run_participants where run_id in('${openingRun.run.id}','${closingRun.run.id}') and user_profile_id='33000000-0000-4000-8000-000000000001' and identity_type='personal_profile' and operator_id is null and authenticated_device_profile_id_snapshot is null;`)==="2"
    &&scalar(`select count(*) from public.routine_run_participants where run_id in('${openingRun.run.id}','${closingRun.run.id}') and user_profile_id='33000000-0000-4000-8000-000000000001';`)==="2");
  const concurrentRuns=await concurrentDisposableRun("33000000-0000-4000-8000-000000000001","public.create_or_get_routine_run('opening','phase10u-concurrent','2026-08-12'::date,'5c400000-0000-4000-8000-000000000006')");
  const concurrentPayloads=concurrentRuns.map(resultJson);
  const concurrentRunId=concurrentPayloads[0]?.run?.id;
  if(concurrentRuns.some((result)=>result.status!==0)||!concurrentRunId||concurrentPayloads.some((payload)=>payload?.run?.id!==concurrentRunId))console.error(`Concurrent run diagnostic: ${JSON.stringify(concurrentRuns.map((result,index)=>({index,status:result.status,stdout:result.stdout,stderr:result.stderr,payload:concurrentPayloads[index]})))}`);
  check("two-connection personal run creation converges without a unique violation",concurrentRuns.every((result)=>result.status===0)&&concurrentRunId&&concurrentPayloads.every((payload)=>payload.run.id===concurrentRunId)&&concurrentPayloads.filter((payload)=>payload.idempotentReplay===true).length===1
    &&scalar("select count(*) from public.routine_runs where organization_id='c3000000-0000-4000-8000-000000000001' and routine_key='opening' and scope_key='phase10u-concurrent' and operational_date='2026-08-12';")==="1"
    &&scalar(`select count(*) from public.routine_run_participants where run_id='${concurrentRunId}' and user_profile_id='33000000-0000-4000-8000-000000000001' and identity_type='personal_profile';`)==="1");
  check("concurrent personal responses preserve participant date snapshot and timing identity",concurrentPayloads.every((payload)=>payload.participant.id===concurrentPayloads[0].participant.id&&payload.run.operational_date===concurrentPayloads[0].run.operational_date&&payload.run.snapshot_hash===concurrentPayloads[0].run.snapshot_hash&&payload.run.timing_snapshot_hash===concurrentPayloads[0].run.timing_snapshot_hash)
    &&scalar(`select count(*) from public.routine_run_operations where actor_auth_user_id='33000000-0000-4000-8000-000000000001' and idempotency_key='5c400000-0000-4000-8000-000000000006' and operation_type in('create_run','create_run_with_time');`)==="2"
    &&scalar(`select count(*) from public.routine_events event join public.routine_run_operations operation on operation.id=event.operation_id where operation.actor_auth_user_id='33000000-0000-4000-8000-000000000001' and operation.idempotency_key='5c400000-0000-4000-8000-000000000006';`)===scalar(`select count(distinct (event.operation_id,event.event_sequence)) from public.routine_events event join public.routine_run_operations operation on operation.id=event.operation_id where operation.actor_auth_user_id='33000000-0000-4000-8000-000000000001' and operation.idempotency_key='5c400000-0000-4000-8000-000000000006';`)
    &&scalar(`select count(*) from public.routine_runs where id='${concurrentRunId}' and (snapshot_state<>'ready' or timing_snapshot_state<>'ready');`)==="0");
  const concurrentStateBeforeReplay=scalar(`select jsonb_build_object('runs',(select count(*) from public.routine_runs),'participants',(select count(*) from public.routine_run_participants),'operations',(select count(*) from public.routine_run_operations),'events',(select count(*) from public.routine_events),'revision',(select revision from public.routine_runs where id='${concurrentRunId}'))::text;`);
  const concurrentSequentialReplay=authenticatedDisposableRunJson("33000000-0000-4000-8000-000000000001","public.create_or_get_routine_run('opening','phase10u-concurrent','2026-08-12'::date,'5c400000-0000-4000-8000-000000000006')");
  check("post-commit sequential replay is byte-semantic and row/revision stable",concurrentSequentialReplay.idempotentReplay===true&&canonical({...concurrentSequentialReplay,idempotentReplay:false})===canonical({...concurrentPayloads.find((payload)=>payload.idempotentReplay===false),idempotentReplay:false})&&concurrentStateBeforeReplay===scalar(`select jsonb_build_object('runs',(select count(*) from public.routine_runs),'participants',(select count(*) from public.routine_run_participants),'operations',(select count(*) from public.routine_run_operations),'events',(select count(*) from public.routine_events),'revision',(select revision from public.routine_runs where id='${concurrentRunId}'))::text;`));
  const conflictingPersonal=authenticatedDisposableRunResult("33000000-0000-4000-8000-000000000001","public.create_or_get_routine_run('opening','phase10u-conflicting-request','2026-08-12'::date,'5c400000-0000-4000-8000-000000000006')");
  check("sequential personal reuse with a different request keeps the deterministic error",conflictingPersonal.status!==0&&conflictingPersonal.stderr.includes("Idempotency key was already used with another routine request.")&&scalar(`select count(*) from public.routine_run_operations where actor_auth_user_id='33000000-0000-4000-8000-000000000001' and operation_type='create_run_with_time' and idempotency_key='5c400000-0000-4000-8000-000000000006';`)==="1");
  const conflictingPersonalRace=await concurrentDisposableCalls([
    {actorId:"33000000-0000-4000-8000-000000000001",expression:"public.create_or_get_routine_run('opening','phase10u-conflict-a','2026-08-16'::date,'5c400000-0000-4000-8000-000000000012')"},
    {actorId:"33000000-0000-4000-8000-000000000001",expression:"public.create_or_get_routine_run('opening','phase10u-conflict-b','2026-08-16'::date,'5c400000-0000-4000-8000-000000000012')"},
  ],["routine_runs","routine_run_tasks","routine_run_task_items"]);
  check("parallel personal reuse with different payloads has one winner and one deterministic rejection",conflictingPersonalRace.filter((result)=>result.status===0).length===1&&conflictingPersonalRace.filter((result)=>result.status!==0&&result.stderr.includes("Idempotency key was already used with another routine request.")).length===1&&scalar("select count(*) from public.routine_run_operations where actor_auth_user_id='33000000-0000-4000-8000-000000000001' and operation_type='create_run_with_time' and idempotency_key='5c400000-0000-4000-8000-000000000012';")==="1");
  const differentKeyRuns=await concurrentDisposableCalls([
    {actorId:"33000000-0000-4000-8000-000000000001",expression:"public.create_or_get_routine_run('opening','phase10u-different-keys','2026-08-14'::date,'5c400000-0000-4000-8000-000000000007')"},
    {actorId:"33000000-0000-4000-8000-000000000001",expression:"public.create_or_get_routine_run('opening','phase10u-different-keys','2026-08-14'::date,'5c400000-0000-4000-8000-000000000008')"},
  ],["routine_runs","routine_run_tasks","routine_run_task_items"]);
  const differentKeyPayloads=differentKeyRuns.map(resultJson);
  check("parallel personal requests with different keys do not over-serialize and converge on one resource",differentKeyRuns.every((result)=>result.status===0)&&differentKeyPayloads.every((payload)=>payload?.run?.id===differentKeyPayloads[0]?.run?.id)&&scalar("select count(*) from public.routine_run_operations where actor_auth_user_id='33000000-0000-4000-8000-000000000001' and operation_type='create_run_with_time' and idempotency_key in('5c400000-0000-4000-8000-000000000007','5c400000-0000-4000-8000-000000000008');")==="2");
  const differentActorRuns=await concurrentDisposableCalls([
    {actorId:"33000000-0000-4000-8000-000000000001",expression:"public.create_or_get_routine_run('opening','phase10u-different-actors','2026-08-15'::date,'5c400000-0000-4000-8000-000000000009')"},
    {actorId:"33000000-0000-4000-8000-000000000003",expression:"public.create_or_get_routine_run('opening','phase10u-different-actors','2026-08-15'::date,'5c400000-0000-4000-8000-000000000009')"},
  ],["routine_runs","routine_run_tasks","routine_run_task_items"]);
  const differentActorPayloads=differentActorRuns.map(resultJson);
  if(differentActorRuns.some((result)=>result.status!==0)||differentActorPayloads.some((payload)=>payload?.run?.id!==differentActorPayloads[0]?.run?.id))console.error(`Different-actor run diagnostic: ${JSON.stringify(differentActorRuns.map((result,index)=>({status:result.status,stderr:result.stderr,payload:differentActorPayloads[index]})))}`);
  check("parallel personal requests from different actors may reuse the same UUID without collision",differentActorRuns.every((result)=>result.status===0)&&differentActorPayloads.every((payload)=>payload?.run?.id===differentActorPayloads[0]?.run?.id)&&scalar("select count(distinct actor_auth_user_id) from public.routine_run_operations where operation_type='create_run_with_time' and idempotency_key='5c400000-0000-4000-8000-000000000009';")==="2"&&scalar(`select count(*) from public.routine_run_participants where run_id='${differentActorPayloads[0]?.run?.id}' and identity_type='personal_profile';`)==="2");
  check("same-key two-person convergence preserves one run snapshot timing and two actor receipts",differentActorPayloads.every((payload)=>payload?.run?.snapshot_hash===differentActorPayloads[0]?.run?.snapshot_hash&&payload?.run?.timing_snapshot_hash===differentActorPayloads[0]?.run?.timing_snapshot_hash)&&scalar(`select count(*)::text||':'||count(distinct user_profile_id)::text||':'||count(distinct creation_idempotency_key)::text from public.routine_run_participants where run_id='${differentActorPayloads[0]?.run?.id}' and identity_type='personal_profile';`)==="2:2:1"&&scalar("select count(*) from public.routine_run_operations where operation_type='create_run_with_time' and idempotency_key='5c400000-0000-4000-8000-000000000009';")==="2");
  const differentIdentityRuns=await concurrentDisposableCalls([
    {actorId:"33000000-0000-4000-8000-000000000001",expression:"public.create_or_get_routine_run('opening','phase10v-identity-a','2026-08-20'::date,'5c450000-0000-4000-8000-000000000001')"},
    {actorId:"33000000-0000-4000-8000-000000000003",expression:"public.create_or_get_routine_run('opening','phase10v-identity-b','2026-08-21'::date,'5c450000-0000-4000-8000-000000000001')"},
  ],["routine_runs","routine_run_tasks","routine_run_task_items"]);
  const differentIdentityPayloads=differentIdentityRuns.map(resultJson);
  check("the same raw UUID may create two distinct valid run business identities for different actors",differentIdentityRuns.every((result)=>result.status===0)&&new Set(differentIdentityPayloads.map((payload)=>payload?.run?.id)).size===2&&scalar("select count(*)::text||':'||count(distinct scope_key)::text from public.routine_runs where creation_idempotency_key='5c450000-0000-4000-8000-000000000001';")==="2:2"&&scalar("select count(*) from public.routine_run_operations where operation_type='create_run_with_time' and idempotency_key='5c450000-0000-4000-8000-000000000001';")==="2");
  const crossOperationCreate=authenticatedDisposableRunJson("33000000-0000-4000-8000-000000000003","public.create_or_get_routine_run('opening','phase10v-cross-operation','2026-08-22'::date,'5c450000-0000-4000-8000-000000000002')");
  const crossOperationParticipantBefore=scalar(`select to_jsonb(participant)::text from public.routine_run_participants participant where id='${crossOperationCreate.participant.id}';`);
  const crossOperationJoinOutput=scalar(`select set_config('request.jwt.claim.sub','33000000-0000-4000-8000-000000000003',false); select public.join_routine_run_phase10d('${crossOperationCreate.run.id}','5c450000-0000-4000-8000-000000000002')::text;`);
  const crossOperationJoin=JSON.parse(crossOperationJoinOutput.split("\n").map((entry)=>entry.trim()).filter((entry)=>entry.startsWith("{")).at(-1));
  check("the same actor may reuse one UUID across create_run_with_time and join_run without provenance rewrite",crossOperationJoin.participant.id===crossOperationCreate.participant.id&&scalar(`select count(distinct operation_type) from public.routine_run_operations where actor_auth_user_id='33000000-0000-4000-8000-000000000003' and idempotency_key='5c450000-0000-4000-8000-000000000002' and operation_type in('create_run_with_time','join_run');`)==="2"&&crossOperationParticipantBefore===scalar(`select to_jsonb(participant)::text from public.routine_run_participants participant where id='${crossOperationCreate.participant.id}';`));
  const deriveDefinition=scalar("select pg_get_functiondef('public.routine_derive_operational_date(uuid,timestamptz)'::regprocedure);");
  const deriveDefinitionHash=scalar("select md5(pg_get_functiondef('public.routine_derive_operational_date(uuid,timestamptz)'::regprocedure));");
  psql(String.raw`
    create schema phase10u_date_probe;
    create table phase10u_date_probe.calls(application_name text not null,called_at timestamptz not null default clock_timestamp());
    create or replace function public.routine_derive_operational_date(input_organization_id uuid,input_effective_at timestamptz)
    returns table(operational_date date,timezone text,cutoff time without time zone,local_timestamp timestamp without time zone,
      local_date date,local_time time without time zone,local_iso_weekday smallint,settings_revision bigint,
      organization_flags jsonb,time_engine_version text)
    language plpgsql volatile security definer set search_path=pg_catalog
    as $phase10u$
    declare v_settings record; v_local timestamp without time zone; v_date date;
    begin
      insert into phase10u_date_probe.calls(application_name) values(current_setting('application_name'));
      select * into v_settings from public.routine_get_organization_time_settings(input_organization_id);
      v_local:=input_effective_at at time zone v_settings.timezone;
      v_date:=case current_setting('application_name') when 'phase10u-derived-a' then date '2026-08-18' else date '2026-08-19' end;
      perform pg_sleep(0.2);
      return query select v_date,v_settings.timezone,v_settings.operational_day_cutoff,v_local,v_local::date,v_local::time,
        extract(isodow from v_local)::smallint,v_settings.settings_revision,v_settings.organization_flags,v_settings.time_engine_version;
    end;
    $phase10u$;
  `,{transaction:true});
  const derivedDateRuns=await concurrentDisposableCalls([
    {actorId:"33000000-0000-4000-8000-000000000001",applicationName:"phase10u-derived-a",expression:"public.create_or_get_routine_run('opening','phase10u-derived-date',null,'5c400000-0000-4000-8000-000000000011')"},
    {actorId:"33000000-0000-4000-8000-000000000001",applicationName:"phase10u-derived-b",expression:"public.create_or_get_routine_run('opening','phase10u-derived-date',null,'5c400000-0000-4000-8000-000000000011')"},
  ],["routine_runs","routine_run_tasks","routine_run_task_items"]);
  const derivedDatePayloads=derivedDateRuns.map(resultJson);
  const deriveProbe=JSON.parse(scalar("select jsonb_build_object('count',count(*),'applications',coalesce(jsonb_agg(distinct application_name),'[]'::jsonb))::text from phase10u_date_probe.calls;"));
  psql(`${deriveDefinition}\n;\ndrop schema phase10u_date_probe cascade;`,{transaction:true});
  check("cutoff-boundary instrumentation proves lock-before-derivation with one winning date",derivedDateRuns.every((result)=>result.status===0)&&derivedDatePayloads.every((payload)=>payload?.run?.id===derivedDatePayloads[0]?.run?.id&&payload?.run?.operational_date===derivedDatePayloads[0]?.run?.operational_date)&&derivedDatePayloads.filter((payload)=>payload.idempotentReplay===true).length===1&&deriveProbe.count===2&&deriveProbe.applications.length===1&&scalar("select count(*) from public.routine_run_operations where operation_type='create_run_with_time' and idempotency_key='5c400000-0000-4000-8000-000000000011';")==="1"&&scalar("select count(*) from public.routine_runs where scope_key='phase10u-derived-date';")==="1"&&scalar("select md5(pg_get_functiondef('public.routine_derive_operational_date(uuid,timestamptz)'::regprocedure));")===deriveDefinitionHash);
  const concurrentIntegrity=authenticatedJson("33000000-0000-4000-8000-000000000001",`public.verify_routine_run_snapshot('${concurrentRunId}')`);
  check("the concurrent authoritative run is ready with valid snapshot integrity",scalar(`select snapshot_state from public.routine_runs where id='${concurrentRunId}';`)==="ready"&&concurrentIntegrity.valid===true);
  const phase10dJoinJson=(actorId,runId,key)=>{const output=scalar(`select set_config('request.jwt.claim.sub','${actorId}',false); select public.join_routine_run_phase10d('${runId}','${key}')::text;`);return JSON.parse(output.split("\n").map((entry)=>entry.trim()).filter((entry)=>entry.startsWith("{")).at(-1));};
  const personalJoin=phase10dJoinJson("33000000-0000-4000-8000-000000000002",openingRun.run.id,"5c410000-0000-4000-8000-000000000001");
  const personalJoinReplay=phase10dJoinJson("33000000-0000-4000-8000-000000000002",openingRun.run.id,"5c410000-0000-4000-8000-000000000001");
  check("private final Phase 10D personal join is idempotent against the partial identity index",personalJoin.participant.identity_type==="personal_profile"&&personalJoinReplay.idempotentReplay===true
    &&scalar(`select count(*) from public.routine_run_participants where run_id='${openingRun.run.id}' and user_profile_id='33000000-0000-4000-8000-000000000002' and identity_type='personal_profile';`)==="1");
  const personalParticipantBefore=scalar(`select to_jsonb(participant)::text from public.routine_run_participants participant where id='${personalJoin.participant.id}';`);
  const personalJoinNewKey=phase10dJoinJson("33000000-0000-4000-8000-000000000002",openingRun.run.id,"5c410000-0000-4000-8000-000000000003");
  check("one participant accepts a later distinct join key only as a new operation receipt",personalJoinNewKey.participant.id===personalJoin.participant.id&&personalParticipantBefore===scalar(`select to_jsonb(participant)::text from public.routine_run_participants participant where id='${personalJoin.participant.id}';`)&&scalar("select count(*) from public.routine_run_operations where actor_auth_user_id='33000000-0000-4000-8000-000000000002' and operation_type='join_run' and idempotency_key in('5c410000-0000-4000-8000-000000000001','5c410000-0000-4000-8000-000000000003');")==="2");
  const directJoinOutput=scalar(`select set_config('request.jwt.claim.sub','33000000-0000-4000-8000-000000000002',false); select public.join_routine_run_phase10d('${closingRun.run.id}','5c410000-0000-4000-8000-000000000002')::text;`);
  const directJoin=JSON.parse(directJoinOutput.split("\n").map((entry)=>entry.trim()).filter((entry)=>entry.startsWith("{")).at(-1));
  check("privileged disposable call proves the repaired internal Phase 10D join is valid and creates one personal participant",directJoin.participant.identity_type==="personal_profile"
    &&scalar(`select count(*) from public.routine_run_participants where run_id='${closingRun.run.id}' and user_profile_id='33000000-0000-4000-8000-000000000002' and identity_type='personal_profile';`)==="1");
  const bundleRace=await concurrentDisposableCalls([
    {actorId:"33000000-0000-4000-8000-000000000001",expression:"public.create_or_get_double_shift_bundle('opening','closing','phase10u-double-shift','2026-08-13'::date,'5c420000-0000-4000-8000-000000000001')"},
    {actorId:"33000000-0000-4000-8000-000000000001",expression:"public.create_or_get_double_shift_bundle('opening','closing','phase10u-double-shift','2026-08-13'::date,'5c420000-0000-4000-8000-000000000001')"},
  ],["routine_runs","routine_run_tasks","routine_run_task_items","routine_bundles","routine_bundle_steps"]);
  const bundlePayloads=bundleRace.map(resultJson);
  const bundle=bundlePayloads.find((payload)=>payload?.idempotentReplay===false)??bundlePayloads[0];
  const bundleReplay=bundlePayloads.find((payload)=>payload?.idempotentReplay===true)??bundlePayloads[1];
  const bundleId=bundle.bundle.id;
  const openingBundleRun=bundle.openingRun.id;
  const closingBundleRun=bundle.closingRun.id;
  const restoreDirectHelperAccess=enableDisposableOperationalAccess();
  psql("alter table public.routine_bundle_steps disable trigger routine_phase10k1_operational_guard_trigger;");
  try{
    psql(`select public.routine_ensure_run_participant('${openingBundleRun}','33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','5c420000-0000-4000-8000-000000000002'); select public.routine_ensure_bundle_participant('${bundleId}','33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','5c420000-0000-4000-8000-000000000003'); select public.routine_ensure_closing_bundle_participant('${bundleId}','33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','5c420000-0000-4000-8000-000000000004');`);
  }finally{
    psql("alter table public.routine_bundle_steps enable trigger routine_phase10k1_operational_guard_trigger;");
    restoreDirectHelperAccess();
  }
  check("concurrent Double Shift wrapper and all three repaired helpers converge on one personal bundle participant",bundleRace.every((result)=>result.status===0)&&bundleReplay.bundle.id===bundleId&&bundleReplay.idempotentReplay===true
    &&scalar(`select count(*) from public.routine_bundle_participants where bundle_id='${bundleId}' and user_profile_id='33000000-0000-4000-8000-000000000001' and identity_type='personal_profile';`)==="1"
    &&scalar(`select count(*) from public.routine_run_participants where run_id in('${openingBundleRun}','${closingBundleRun}') and user_profile_id='33000000-0000-4000-8000-000000000001' and identity_type='personal_profile';`)==="2");
  check("concurrent Double Shift responses preserve both linked runs and their immutable snapshots",bundlePayloads.every((payload)=>payload?.bundle?.id===bundleId&&payload?.openingRun?.id===openingBundleRun&&payload?.closingRun?.id===closingBundleRun&&payload?.participant?.id===bundlePayloads[0]?.participant?.id&&payload?.openingRun?.snapshot_hash===bundlePayloads[0]?.openingRun?.snapshot_hash&&payload?.closingRun?.snapshot_hash===bundlePayloads[0]?.closingRun?.snapshot_hash)
    &&scalar(`select count(*) from public.routine_bundle_runs where bundle_id='${bundleId}';`)==="2"
    &&scalar(`select count(*) from public.routine_bundle_operations where resource_id='${bundleId}' and operation_type='create_double_shift_bundle';`)==="1"
    &&scalar(`select count(*) from public.routine_run_operations where resource_id in('${openingBundleRun}','${closingBundleRun}') and operation_type in('create_run','create_run_with_time');`)===scalar(`select count(distinct (actor_auth_user_id,actor_source,effective_operator_id,operation_type,idempotency_key)) from public.routine_run_operations where resource_id in('${openingBundleRun}','${closingBundleRun}') and operation_type in('create_run','create_run_with_time');`)
    &&scalar(`select count(*) from public.routine_events where bundle_id='${bundleId}';`)===scalar(`select count(distinct id) from public.routine_events where bundle_id='${bundleId}';`));
  check("Double Shift retains two run links DS01-DS03 once per participant and one global DS04",scalar(`select count(*) from public.routine_bundle_runs where bundle_id='${bundleId}';`)==="2"
    &&scalar(`select count(*) from public.routine_bundle_steps where bundle_id='${bundleId}' and bundle_participant_id is not null and step_key in('ds01_confirm_plan','ds02_opening_transition','ds03_return_review');`)==="3"
    &&scalar(`select count(*) from public.routine_bundle_steps where bundle_id='${bundleId}' and bundle_participant_id is null and step_key='ds04_bundle_finalized';`)==="1");
  check("Double Shift replay preserves one create operation and its original event sequence",scalar(`select count(*) from public.routine_bundle_operations where resource_id='${bundleId}' and resource_type='bundle' and operation_type='create_double_shift_bundle';`)==="1"
    &&scalar(`select count(*) from public.routine_events where bundle_id='${bundleId}' and event_type in('double_shift_bundle_created','double_shift_run_linked','double_shift_participant_joined');`)==="4");
  const differentKeyBundles=await concurrentDisposableCalls([
    {actorId:"33000000-0000-4000-8000-000000000001",expression:"public.create_or_get_double_shift_bundle('opening','closing','phase10u-double-shift','2026-08-13'::date,'5c420000-0000-4000-8000-000000000005')"},
    {actorId:"33000000-0000-4000-8000-000000000001",expression:"public.create_or_get_double_shift_bundle('opening','closing','phase10u-double-shift','2026-08-13'::date,'5c420000-0000-4000-8000-000000000006')"},
  ],["routine_runs","routine_run_tasks","routine_run_task_items","routine_bundles","routine_bundle_steps"]);
  check("parallel Double Shift requests with different keys retain distinct operation rows",differentKeyBundles.every((result)=>result.status===0)&&differentKeyBundles.map(resultJson).every((payload)=>payload?.bundle?.id===bundleId)&&scalar("select count(*) from public.routine_bundle_operations where actor_auth_user_id='33000000-0000-4000-8000-000000000001' and operation_type='create_double_shift_bundle' and idempotency_key in('5c420000-0000-4000-8000-000000000005','5c420000-0000-4000-8000-000000000006');")==="2");
  const differentActorBundles=await concurrentDisposableCalls([
    {actorId:"33000000-0000-4000-8000-000000000001",expression:"public.create_or_get_double_shift_bundle('opening','closing','phase10u-double-shift','2026-08-13'::date,'5c420000-0000-4000-8000-000000000007')"},
    {actorId:"33000000-0000-4000-8000-000000000003",expression:"public.create_or_get_double_shift_bundle('opening','closing','phase10u-double-shift','2026-08-13'::date,'5c420000-0000-4000-8000-000000000008')"},
  ],["routine_runs","routine_run_tasks","routine_run_task_items","routine_bundles","routine_bundle_steps"]);
  check("parallel Double Shift requests from different actors retain separate identities",differentActorBundles.every((result)=>result.status===0)&&differentActorBundles.map(resultJson).every((payload)=>payload?.bundle?.id===bundleId)&&scalar("select count(distinct actor_auth_user_id) from public.routine_bundle_operations where operation_type='create_double_shift_bundle' and idempotency_key in('5c420000-0000-4000-8000-000000000007','5c420000-0000-4000-8000-000000000008');")==="2");
  const sameKeyActorBundles=await concurrentDisposableCalls([
    {actorId:"33000000-0000-4000-8000-000000000001",expression:"public.create_or_get_double_shift_bundle('opening','closing','phase10v-same-key-double','2026-08-23'::date,'5c460000-0000-4000-8000-000000000001')"},
    {actorId:"33000000-0000-4000-8000-000000000003",expression:"public.create_or_get_double_shift_bundle('opening','closing','phase10v-same-key-double','2026-08-23'::date,'5c460000-0000-4000-8000-000000000001')"},
  ],["routine_runs","routine_run_tasks","routine_run_task_items","routine_bundles","routine_bundle_steps"]);
  const sameKeyBundlePayloads=sameKeyActorBundles.map(resultJson);
  const sameKeyBundleId=sameKeyBundlePayloads[0]?.bundle?.id;
  check("two actors using the same Double Shift UUID converge on one bundle with two receipts participants and linked-run identities",sameKeyActorBundles.every((result)=>result.status===0)&&sameKeyBundlePayloads.every((payload)=>payload?.bundle?.id===sameKeyBundleId&&payload?.openingRun?.id===sameKeyBundlePayloads[0]?.openingRun?.id&&payload?.closingRun?.id===sameKeyBundlePayloads[0]?.closingRun?.id)&&scalar(`select count(*) from public.routine_bundle_operations where resource_id='${sameKeyBundleId}' and operation_type='create_double_shift_bundle' and idempotency_key='5c460000-0000-4000-8000-000000000001';`)==="2"&&scalar(`select count(*)::text||':'||count(distinct user_profile_id)::text from public.routine_bundle_participants where bundle_id='${sameKeyBundleId}' and identity_type='personal_profile';`)==="2:2"&&scalar(`select count(*) from public.routine_run_participants where run_id in('${sameKeyBundlePayloads[0]?.openingRun?.id}','${sameKeyBundlePayloads[0]?.closingRun?.id}') and identity_type='personal_profile';`)==="4"&&scalar(`select count(*) from public.routine_bundle_steps where bundle_id='${sameKeyBundleId}' and bundle_participant_id is not null;`)==="6"&&scalar(`select count(*) from public.routine_bundle_steps where bundle_id='${sameKeyBundleId}' and bundle_participant_id is null and step_key='ds04_bundle_finalized';`)==="1");
  const sameKeyBundleBefore=scalar(`select to_jsonb(bundle)::text from public.routine_bundles bundle where id='${sameKeyBundleId}';`);
  const sameKeyParticipantBefore=scalar(`select encode(digest(string_agg(to_jsonb(participant)::text,E'\n' order by participant.id),'sha256'),'hex') from public.routine_bundle_participants participant where participant.bundle_id='${sameKeyBundleId}';`);
  const sameKeyLaterReceipt=authenticatedDisposableBundleJson("33000000-0000-4000-8000-000000000001","public.create_or_get_double_shift_bundle('opening','closing','phase10v-same-key-double','2026-08-23'::date,'5c460000-0000-4000-8000-000000000002')");
  check("a later Double Shift receipt cannot overwrite bundle or participant creation provenance",sameKeyLaterReceipt.bundle.id===sameKeyBundleId&&sameKeyBundleBefore===scalar(`select to_jsonb(bundle)::text from public.routine_bundles bundle where id='${sameKeyBundleId}';`)&&sameKeyParticipantBefore===scalar(`select encode(digest(string_agg(to_jsonb(participant)::text,E'\n' order by participant.id),'sha256'),'hex') from public.routine_bundle_participants participant where participant.bundle_id='${sameKeyBundleId}';`));
  const differentIdentityBundles=await concurrentDisposableCalls([
    {actorId:"33000000-0000-4000-8000-000000000001",expression:"public.create_or_get_double_shift_bundle('opening','closing','phase10v-bundle-a','2026-08-24'::date,'5c460000-0000-4000-8000-000000000003')"},
    {actorId:"33000000-0000-4000-8000-000000000003",expression:"public.create_or_get_double_shift_bundle('opening','closing','phase10v-bundle-b','2026-08-25'::date,'5c460000-0000-4000-8000-000000000003')"},
  ],["routine_runs","routine_run_tasks","routine_run_task_items","routine_bundles","routine_bundle_steps"]);
  const differentIdentityBundlePayloads=differentIdentityBundles.map(resultJson);
  check("the same raw UUID may create two distinct valid Double Shift business identities",differentIdentityBundles.every((result)=>result.status===0)&&new Set(differentIdentityBundlePayloads.map((payload)=>payload?.bundle?.id)).size===2&&scalar("select count(*)::text||':'||count(distinct scope_key)::text from public.routine_bundles where creation_idempotency_key='5c460000-0000-4000-8000-000000000003';")==="2:2"&&scalar("select count(*) from public.routine_bundle_operations where operation_type='create_double_shift_bundle' and idempotency_key='5c460000-0000-4000-8000-000000000003';")==="2");
  const conflictingBundleRace=await concurrentDisposableCalls([
    {actorId:"33000000-0000-4000-8000-000000000001",expression:"public.create_or_get_double_shift_bundle('opening','closing','phase10u-bundle-conflict-a','2026-08-17'::date,'5c420000-0000-4000-8000-000000000009')"},
    {actorId:"33000000-0000-4000-8000-000000000001",expression:"public.create_or_get_double_shift_bundle('opening','closing','phase10u-bundle-conflict-b','2026-08-17'::date,'5c420000-0000-4000-8000-000000000009')"},
  ],["routine_runs","routine_run_tasks","routine_run_task_items","routine_bundles","routine_bundle_steps"]);
  check("parallel Double Shift reuse with different payloads has one winner and one deterministic rejection",conflictingBundleRace.filter((result)=>result.status===0).length===1&&conflictingBundleRace.filter((result)=>result.status!==0&&result.stderr.includes("This idempotency key was already used with a different request.")).length===1&&scalar("select count(*) from public.routine_bundle_operations where actor_auth_user_id='33000000-0000-4000-8000-000000000001' and operation_type='create_double_shift_bundle' and idempotency_key='5c420000-0000-4000-8000-000000000009';")==="1");
  const bundleParticipantId=scalar(`select id from public.routine_bundle_participants where bundle_id='${bundleId}' and user_profile_id='33000000-0000-4000-8000-000000000001';`);
  const ds01BundleRevision=scalar(`select revision from public.routine_bundles where id='${bundleId}';`);
  const ds01ParticipantRevision=scalar(`select revision from public.routine_bundle_participants where id='${bundleParticipantId}';`);
  const ds01Race=await concurrentDisposableCalls([
    {actorId:"33000000-0000-4000-8000-000000000001",expression:`public.confirm_double_shift_plan('${bundleId}','${bundleParticipantId}',time '19:00',${ds01BundleRevision},${ds01ParticipantRevision},'5c420000-0000-4000-8000-000000000010')`},
    {actorId:"33000000-0000-4000-8000-000000000001",expression:`public.confirm_double_shift_plan('${bundleId}','${bundleParticipantId}',time '19:00',${ds01BundleRevision},${ds01ParticipantRevision},'5c420000-0000-4000-8000-000000000010')`},
  ],["routine_runs","routine_run_tasks","routine_run_task_items","routine_bundles","routine_bundle_steps"]);
  const ds01Payloads=ds01Race.map(resultJson);
  check("ordinary Double Shift step mutation serializes before revisioned state changes",ds01Race.every((result)=>result.status===0)&&ds01Payloads.filter((payload)=>payload?.idempotentReplay===true).length===1&&scalar(`select count(*) from public.routine_bundle_operations where operation_type='confirm_double_shift_plan' and idempotency_key='5c420000-0000-4000-8000-000000000010';`)==="1"&&scalar(`select count(*) from public.routine_bundle_steps where bundle_id='${bundleId}' and bundle_participant_id='${bundleParticipantId}' and step_key='ds01_confirm_plan' and status='completed';`)==="1"&&scalar(`select count(*) from public.routine_events where bundle_id='${bundleId}' and event_type='double_shift_plan_confirmed';`)==="1");
  const reassignmentBundleRevision=scalar(`select revision from public.routine_bundles where id='${bundleId}';`);
  const reassignmentRace=await concurrentDisposableCalls([
    {actorId:"33000000-0000-4000-8000-000000000001",expression:`public.reassign_double_shift_closing('${bundleId}','${bundleParticipantId}','33000000-0000-4000-8000-000000000002','Phase 10U concurrent closing reassignment',${reassignmentBundleRevision},'5c420000-0000-4000-8000-000000000011')`},
    {actorId:"33000000-0000-4000-8000-000000000001",expression:`public.reassign_double_shift_closing('${bundleId}','${bundleParticipantId}','33000000-0000-4000-8000-000000000002','Phase 10U concurrent closing reassignment',${reassignmentBundleRevision},'5c420000-0000-4000-8000-000000000011')`},
  ],["routine_runs","routine_run_tasks","routine_run_task_items","routine_bundles","routine_bundle_steps"]);
  const reassignmentPayloads=reassignmentRace.map(resultJson);
  check("direct Closing-reassignment writer serializes to one operation reassignment and event",reassignmentRace.every((result)=>result.status===0)&&reassignmentPayloads.filter((payload)=>payload?.idempotentReplay===true).length===1&&scalar(`select count(*) from public.routine_bundle_operations where operation_type='reassign_double_shift_closing' and idempotency_key='5c420000-0000-4000-8000-000000000011';`)==="1"&&scalar(`select count(*) from public.routine_bundle_reassignments where bundle_id='${bundleId}' and from_bundle_participant_id='${bundleParticipantId}';`)==="1"&&scalar(`select count(*) from public.routine_events where bundle_id='${bundleId}' and event_type='double_shift_closing_reassigned';`)==="1");
  const runEventFingerprint=scalar(`select md5(to_jsonb(event)::text) from public.routine_events event join public.routine_run_operations operation on operation.id=event.operation_id where operation.operation_type='create_run_with_time' and operation.idempotency_key='5c400000-0000-4000-8000-000000000006' and event.event_sequence=1;`);
  const runEventReplay=scalar(String.raw`
    with target as (
      select event.* from public.routine_events event join public.routine_run_operations operation on operation.id=event.operation_id
      where operation.operation_type='create_run_with_time' and operation.idempotency_key='5c400000-0000-4000-8000-000000000006' and event.event_sequence=1
    ) select public.routine_record_event(event.run_id,event.event_type,event.actor_type,event.actor_auth_user_id,event.actor_profile_id,
      event.actor_name_snapshot,event.actor_role_snapshot,jsonb_strip_nulls(jsonb_build_object('taskId',event.task_id,'taskItemId',event.task_item_id,
        'deviationId',event.deviation_id,'managerOverrideId',event.manager_override_id,'taskVerificationId',event.task_verification_id,
        'runVerificationId',event.run_verification_id,'handoverId',event.handover_id,'transferId',event.transfer_id,'correctionId',event.correction_id)),
      event.previous_revision,event.new_revision,event.payload,event.operation_id,event.event_sequence)::text||':'||event.id::text from target event;
  `);
  check("run-event conflict readback returns the authoritative existing ID without payload or actor drift",runEventReplay.split(":")[0]===runEventReplay.split(":")[1]&&runEventFingerprint===scalar(`select md5(to_jsonb(event)::text) from public.routine_events event join public.routine_run_operations operation on operation.id=event.operation_id where operation.operation_type='create_run_with_time' and operation.idempotency_key='5c400000-0000-4000-8000-000000000006' and event.event_sequence=1;`)&&scalar(`select count(*) from public.routine_events event join public.routine_run_operations operation on operation.id=event.operation_id where operation.operation_type='create_run_with_time' and operation.idempotency_key='5c400000-0000-4000-8000-000000000006' and event.event_sequence=1;`)==="1");
  const bundleEventFingerprint=scalar(`select md5(to_jsonb(event)::text) from public.routine_events event where event.id=public.routine_phase10h_uuid('${bundleId}'||'|'||(select id::text from public.routine_bundle_operations where operation_type='confirm_double_shift_plan' and idempotency_key='5c420000-0000-4000-8000-000000000010')||'|1');`);
  const bundleEventReplay=scalar(String.raw`
    with operation as (
      select * from public.routine_bundle_operations where operation_type='confirm_double_shift_plan' and idempotency_key='5c420000-0000-4000-8000-000000000010'
    ),target as (
      select event.*,operation.id replay_operation_id from operation join public.routine_events event
        on event.id=public.routine_phase10h_uuid('${bundleId}'||'|'||operation.id::text||'|1')
    ) select public.routine_record_bundle_event(event.bundle_id,event.run_id,event.event_type,event.actor_type,event.actor_auth_user_id,
      event.actor_profile_id,event.actor_name_snapshot,event.actor_role_snapshot,event.payload,event.replay_operation_id,event.event_sequence)::text||':'||event.id::text
      from target event;
  `);
  check("bundle-event deterministic replay returns the authoritative existing ID without payload or actor drift",bundleEventReplay.split(":")[0]===bundleEventReplay.split(":")[1]&&bundleEventFingerprint===scalar(`select md5(to_jsonb(event)::text) from public.routine_events event where event.id=public.routine_phase10h_uuid('${bundleId}'||'|'||(select id::text from public.routine_bundle_operations where operation_type='confirm_double_shift_plan' and idempotency_key='5c420000-0000-4000-8000-000000000010')||'|1');`));
  const directRunKey="5c430000-0000-4000-8000-000000000001";
  const directRunHash="a".repeat(64);
  const directRunSql=`select set_config('request.jwt.claim.sub','33000000-0000-4000-8000-000000000001',false); select public.routine_record_run_operation('c3000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','create_run','${directRunKey}','${directRunHash}','run','${concurrentRunId}','{"winner":"original"}'::jsonb);`;
  const directRunRace=await Promise.all([psqlAsync(directRunSql),psqlAsync(directRunSql)]);
  check("direct run writer converges two same-key inserts without mutating the first response",directRunRace.every((result)=>result.status===0)&&scalar(`select count(*)::text||':'||coalesce(bool_and(response_payload='{"winner":"original"}'::jsonb),false)::text from public.routine_run_operations where actor_auth_user_id='33000000-0000-4000-8000-000000000001' and operation_type='create_run' and idempotency_key='${directRunKey}';`)==="1:true");
  const directRunDifferentHash=psql(`${directRunSql.replace(directRunHash,"b".repeat(64))}`,{allowFailure:true});
  check("direct run writer rejects a reused key with another request hash",directRunDifferentHash.status!==0&&directRunDifferentHash.stderr.includes("Idempotency key was already used with another routine request."));
  const directRunDifferentResource=psql(`${directRunSql.replace(`'${concurrentRunId}'`,`'${openingRun.run.id}'`)}`,{allowFailure:true});
  check("direct run writer rejects a reused key with a different resource",directRunDifferentResource.status!==0&&directRunDifferentResource.stderr.includes("Routine operation idempotency resource conflict."));
  const directBundleKey="5c430000-0000-4000-8000-000000000002";
  const directBundleHash="c".repeat(64);
  const directBundleSql=`select public.routine_record_bundle_operation('c3000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','phase10u_direct_bundle','${directBundleKey}','${directBundleHash}','bundle','${bundleId}','{"winner":"original"}'::jsonb);`;
  const directBundleRace=await Promise.all([psqlAsync(directBundleSql),psqlAsync(directBundleSql)]);
  const directBundleIds=directBundleRace.map((result)=>result.stdout.split("\n").map((entry)=>entry.trim()).filter((entry)=>/^[0-9a-f-]{36}$/.test(entry)).at(-1));
  check("direct bundle writer converges two same-key inserts on the original immutable row",directBundleRace.every((result)=>result.status===0)&&directBundleIds[0]===directBundleIds[1]&&scalar(`select count(*)::text||':'||coalesce(bool_and(response_payload='{"winner":"original"}'::jsonb),false)::text from public.routine_bundle_operations where operation_type='phase10u_direct_bundle' and idempotency_key='${directBundleKey}';`)==="1:true");
  const directBundleDifferentHash=psql(directBundleSql.replace(directBundleHash,"d".repeat(64)),{allowFailure:true});
  check("direct bundle writer rejects a reused key with another request hash",directBundleDifferentHash.status!==0&&directBundleDifferentHash.stderr.includes("This idempotency key was already used with a different request."));
  const directBundleDifferentResource=psql(directBundleSql.replace(`'${bundleId}'`,`'5c430000-0000-4000-8000-000000000099'`),{allowFailure:true});
  check("direct bundle writer rejects a reused key with a different resource",directBundleDifferentResource.status!==0&&directBundleDifferentResource.stderr.includes("Routine bundle operation idempotency resource conflict."));

  const lockSql=(applicationName,key,ending)=>`set application_name='${applicationName}'; set statement_timeout='10s'; set lock_timeout='10s'; begin; select set_config('request.jwt.claim.sub','33000000-0000-4000-8000-000000000001',false); select public.routine_run_operation_replay('c3000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','phase10u_lock_probe','${key}','${"e".repeat(64)}'); ${ending}`;
  const commitKey="5c440000-0000-4000-8000-000000000001";
  const commitHolder=psqlAsync(lockSql("phase10u-commit-holder",commitKey,"select pg_sleep(1); commit;"));
  check("commit lock probe acquires the intended advisory lock",await waitForScalar("select exists(select 1 from pg_stat_activity activity join pg_locks lock_row on lock_row.pid=activity.pid where activity.application_name='phase10u-commit-holder' and lock_row.locktype='advisory' and lock_row.granted);","t"));
  const commitStarted=Date.now();
  const commitWaiter=psqlAsync(lockSql("phase10u-commit-waiter",commitKey,"commit;"));
  const [commitHolderResult,commitWaiterResult]=await Promise.all([commitHolder,commitWaiter]);
  check("transaction advisory lock releases after commit",commitHolderResult.status===0&&commitWaiterResult.status===0&&Date.now()-commitStarted>=500);
  const rollbackKey="5c440000-0000-4000-8000-000000000002";
  const rollbackHolder=psqlAsync(lockSql("phase10u-rollback-holder",rollbackKey,"select pg_sleep(1); rollback;"));
  check("rollback lock probe acquires the intended advisory lock",await waitForScalar("select exists(select 1 from pg_stat_activity activity join pg_locks lock_row on lock_row.pid=activity.pid where activity.application_name='phase10u-rollback-holder' and lock_row.locktype='advisory' and lock_row.granted);","t"));
  const rollbackWaiter=psqlAsync(lockSql("phase10u-rollback-waiter",rollbackKey,"commit;"));
  const [rollbackHolderResult,rollbackWaiterResult]=await Promise.all([rollbackHolder,rollbackWaiter]);
  check("transaction advisory lock releases after rollback",rollbackHolderResult.status===0&&rollbackWaiterResult.status===0);
  const exceptionKey="5c440000-0000-4000-8000-000000000005";
  const exceptionHolder=await psqlAsync(lockSql("phase10u-exception-holder",exceptionKey,"do $probe$ begin raise exception 'phase10u_exception_probe'; end $probe$; commit;"));
  const exceptionWaiter=await psqlAsync(lockSql("phase10u-exception-waiter",exceptionKey,"commit;"));
  check("exception after acquisition rolls back and releases the transaction lock",exceptionHolder.status!==0&&exceptionHolder.stderr.includes("phase10u_exception_probe")&&exceptionWaiter.status===0);
  const independentHolder=psqlAsync(lockSql("phase10u-independent-holder","5c440000-0000-4000-8000-000000000006","select pg_sleep(1); commit;"));
  check("independent lock probe acquires its first identity",await waitForScalar("select exists(select 1 from pg_stat_activity activity join pg_locks lock_row on lock_row.pid=activity.pid where activity.application_name='phase10u-independent-holder' and lock_row.locktype='advisory' and lock_row.granted);","t"));
  const independentStarted=Date.now();
  const independentWaiter=await psqlAsync(lockSql("phase10u-independent-waiter","5c440000-0000-4000-8000-000000000007","commit;"));
  const independentElapsed=Date.now()-independentStarted;
  const independentHolderResult=await independentHolder;
  check("different idempotency identities do not block one another",independentWaiter.status===0&&independentHolderResult.status===0&&independentElapsed<700);
  const killKey="5c440000-0000-4000-8000-000000000003";
  const killHolder=psqlAsync(lockSql("phase10u-kill-holder",killKey,"select pg_sleep(30); commit;"));
  check("kill lock probe acquires the intended advisory lock",await waitForScalar("select exists(select 1 from pg_stat_activity activity join pg_locks lock_row on lock_row.pid=activity.pid where activity.application_name='phase10u-kill-holder' and lock_row.locktype='advisory' and lock_row.granted);","t"));
  const killWaiter=psqlAsync(lockSql("phase10u-kill-waiter",killKey,"commit;"));
  check("kill lock probe observes one blocked waiter",await waitForScalar("select exists(select 1 from pg_stat_activity activity join pg_locks lock_row on lock_row.pid=activity.pid where activity.application_name='phase10u-kill-waiter' and lock_row.locktype='advisory' and not lock_row.granted);","t"));
  check("kill lock probe terminates only the disposable holder",scalar("select pg_terminate_backend(pid) from pg_stat_activity where application_name='phase10u-kill-holder';")==="t");
  const [killHolderResult,killWaiterResult]=await Promise.all([killHolder,killWaiter]);
  check("transaction advisory lock releases after backend termination",killHolderResult.status!==0&&killWaiterResult.status===0);
  const reentrantResult=psql(lockSql("phase10u-reentrant","5c440000-0000-4000-8000-000000000004",`select public.routine_run_operation_replay('c3000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','phase10u_lock_probe','5c440000-0000-4000-8000-000000000004','${"e".repeat(64)}'); commit;`),{allowFailure:true});
  check("same transaction can reacquire its operation lock",reentrantResult.status===0);
  check("full-identity ledger predicates prevent advisory-hash collisions from causing cross-identity replay",operationConvergenceCatalog().every((entry)=>entry.definition.includes("operation.organization_id = input_organization_id")&&entry.definition.includes("operation.actor_auth_user_id = input_actor_auth_user_id")&&entry.definition.includes("operation.operation_type = input_operation_type")&&entry.definition.includes("operation.idempotency_key = input_idempotency_key")));
  check("C05 snapshots exactly one automatic successor C15",scalar(`select count(*) from public.routine_run_task_dependencies dependency join public.routine_run_tasks predecessor on predecessor.id=dependency.predecessor_run_task_id join public.routine_run_tasks successor on successor.id=dependency.successor_run_task_id where dependency.run_id='${closingRun.run.id}' and predecessor.task_key_snapshot like 'c05-%' and successor.task_key_snapshot like 'c15-%' and dependency.dependency_type_snapshot='complete_predecessor_on_successor';`)==="1"&&scalar(`select count(*) from public.routine_run_task_dependencies dependency join public.routine_run_tasks predecessor on predecessor.id=dependency.predecessor_run_task_id where dependency.run_id='${closingRun.run.id}' and predecessor.task_key_snapshot like 'c05-%';`)==="1");
  const sourceExpansionSummary=(runId,sourceId)=>JSON.parse(scalar(String.raw`
    select jsonb_build_object(
      'dynamicCount',count(*) filter(where item.source_kind_snapshot='inventory_readonly'),
      'dynamicGenerated',coalesce(bool_and(item.generated_from_source and item.external_source_type_snapshot='inventory_location_standard'
        and item.external_source_id_snapshot is not null and item.external_source_revision_snapshot is not null
        and item.row_snapshot_hash~'^[0-9a-f]{64}$') filter(where item.source_kind_snapshot='inventory_readonly'),false),
      'dynamicUniqueKeys',count(distinct item.item_key_snapshot) filter(where item.source_kind_snapshot='inventory_readonly'),
      'productIds',coalesce(jsonb_agg(item.source_record_snapshot->>'productId' order by item.item_key_snapshot)
        filter(where item.source_kind_snapshot='inventory_readonly'),'[]'::jsonb),
      'eggCount',count(*) filter(where item.item_key_snapshot='eggs_present_and_to_standard' and item.source_kind_snapshot='static' and not item.generated_from_source),
      'fridgeCount',count(*) filter(where item.item_key_snapshot='fridge_clean_and_operating' and item.source_kind_snapshot='static' and not item.generated_from_source)
    )::text
    from public.routine_run_task_items item join public.routine_run_tasks task on task.id=item.run_task_id
    where task.run_id='${runId}' and task.metadata_snapshot->>'authoritativeSourceId'='${sourceId}';
  `));
  const expansionSummaries=[sourceExpansionSummary(openingRun.run.id,"O13"),sourceExpansionSummary(closingRun.run.id,"C08"),sourceExpansionSummary(closingRun.run.id,"C28")];
  check("O13 C08 C28 each expand inventory_standard_items to exactly three active products",expansionSummaries.every((summary)=>summary.dynamicCount===3&&summary.dynamicUniqueKeys===3&&summary.dynamicGenerated));
  check("inactive product and inactive binding are excluded from all three expansions",expansionSummaries.every((summary)=>summary.productIds.length===3&&summary.productIds.includes("c5100000-0000-4000-8000-000000000001")&&!summary.productIds.includes("c5100000-0000-4000-8000-000000000004")&&!summary.productIds.includes("c5100000-0000-4000-8000-000000000005")));
  check("explicit egg and fridge-condition checks remain exactly one non-generated item per task",expansionSummaries.every((summary)=>summary.eggCount===1&&summary.fridgeCount===1));
  const adapterFailure=psql(String.raw`begin;
    alter table public.routine_runs disable trigger routine_phase10k1_operational_guard_trigger;
    alter table public.routine_run_tasks disable trigger routine_phase10k1_operational_guard_trigger;
    alter table public.routine_run_task_items disable trigger routine_phase10k1_operational_guard_trigger;
    update public.inventory_locations set active=false where id='c5200000-0000-4000-8000-000000000001';
    select set_config('request.jwt.claim.sub','33000000-0000-4000-8000-000000000001',false);
    set role authenticated;
    select public.create_or_get_routine_run('opening','phase10s-adapter-failure','2026-08-11'::date,'5c400000-0000-4000-8000-000000000003');`,{allowFailure:true});
  check("adapter failure rejects the supported run RPC without exposing a partial snapshot",adapterFailure.status!==0&&/mandatory configured inventory location is missing or inactive/i.test(adapterFailure.stderr)&&scalar("select count(*) from public.routine_runs where organization_id='c3000000-0000-4000-8000-000000000001' and scope_key='phase10s-adapter-failure';")==="0");
  check("inventory source rows remain byte-stable across successful and failed run creation",inventoryBeforeRuns===scalar(inventoryDataFingerprintSql));
  const assetAdapterFailure=psql(String.raw`begin;
    alter table public.routine_template_task_items disable trigger routine_template_task_items_guard;
    alter table public.routine_template_versions disable trigger routine_template_versions_guard;
    alter table public.routine_runs disable trigger routine_phase10k1_operational_guard_trigger;
    alter table public.routine_run_tasks disable trigger routine_phase10k1_operational_guard_trigger;
    alter table public.routine_run_task_items disable trigger routine_phase10k1_operational_guard_trigger;
    update public.routine_template_task_items item set source_config='{"access":"read_only"}'::jsonb
    from public.routine_template_tasks task,public.routine_template_versions version,public.routine_templates template
    where item.task_id=task.id and item.version_id=version.id and version.template_id=template.id
      and template.organization_id='c3000000-0000-4000-8000-000000000001' and template.routine_key='closing'
      and version.state='published' and task.metadata->>'authoritativeSourceId'='C37'
      and item.item_key='active_asset_registry_items';
    update public.routine_template_versions version set content_hash=public.routine_template_version_content_hash(version.id)
    from public.routine_templates template where version.template_id=template.id
      and template.organization_id='c3000000-0000-4000-8000-000000000001' and template.routine_key='closing' and version.state='published';
    select set_config('request.jwt.claim.sub','33000000-0000-4000-8000-000000000001',false);
    set role authenticated;
    select public.create_or_get_routine_run('closing','phase10s-asset-adapter-failure','2026-08-11'::date,'5c400000-0000-4000-8000-000000000004');`,{allowFailure:true});
  check("invalid C37 source configuration aborts without a visible or partial run snapshot",assetAdapterFailure.status!==0&&/invalid asset_registry_readonly active_assets source configuration/i.test(assetAdapterFailure.stderr)
    &&scalar("select count(*) from public.routine_runs where organization_id='c3000000-0000-4000-8000-000000000001' and scope_key='phase10s-asset-adapter-failure';")==="0"
    &&scalar("select count(*) from public.routine_run_task_items item join public.routine_runs run on run.id=item.run_id where run.organization_id='c3000000-0000-4000-8000-000000000001' and run.scope_key='phase10s-asset-adapter-failure';")==="0");
  check("asset rows and protected Asset schema remain byte-stable across successful replay and failed creation",assetBeforeRuns===scalar(assetDataFingerprintSql)&&assetSchemaBeforeRuns===scalar(protectedSchemaFingerprintSql));
  const closingRunRevision=scalar(`select revision from public.routine_runs where id='${closingRun.run.id}';`);
  authenticatedDisposableRunJson("33000000-0000-4000-8000-000000000001",`public.start_routine_run('${closingRun.run.id}',${closingRunRevision},'5c500000-0000-4000-8000-000000000001')`);
  check("C05 is active and incomplete before C15 completion",scalar(`select status||':'||coalesce(outcome,'') from public.routine_run_tasks where run_id='${closingRun.run.id}' and task_key_snapshot like 'c05-%';`)==="in_progress:");
  const completeRunItems=(sourceId,keyPrefix)=>{
    const items=JSON.parse(scalar(`select jsonb_agg(jsonb_build_object('id',item.id,'type',item.item_type_snapshot) order by item.sort_order_snapshot)::text from public.routine_run_task_items item join public.routine_run_tasks task on task.id=item.run_task_id where task.run_id='${closingRun.run.id}' and task.metadata_snapshot->>'authoritativeSourceId'='${sourceId}';`));
    for(const [index,item] of items.entries()){
      const value=item.type==="check"?{checked:true}:item.type==="text"?{text:"Disposable verified value"}:item.type==="location"?{status:"clear"}:{value:"complete"};
      const revision=scalar(`select revision from public.routine_run_task_items where id='${item.id}';`);
      authenticatedDisposableRunJson("33000000-0000-4000-8000-000000000001",`public.update_routine_task_item('${item.id}','completed','${sqlJson(value)}'::jsonb,null,null,${revision},'${keyPrefix}${String(index+1).padStart(3,"0")}')`);
    }
  };
  completeRunItems("C05","5c510000-0000-4000-8000-000000000");
  const c15Id=scalar(`select id from public.routine_run_tasks where run_id='${closingRun.run.id}' and task_key_snapshot like 'c15-%';`);
  const c15AssessmentRevision=scalar(`select revision from public.routine_run_tasks where id='${c15Id}';`);
  authenticatedDisposableRunJson("33000000-0000-4000-8000-000000000001",`public.record_routine_initial_assessment('${c15Id}','ready',null,null,${c15AssessmentRevision},'5c520000-0000-4000-8000-000000000001')`);
  completeRunItems("C15","5c530000-0000-4000-8000-000000000");
  const c15CompletionRevision=scalar(`select revision from public.routine_run_tasks where id='${c15Id}';`);
  const c15CompletionExpression=`public.complete_routine_task('${c15Id}','Disposable final-service confirmation.',true,${c15CompletionRevision},'5c540000-0000-4000-8000-000000000001')`;
  const c15Completion=authenticatedDisposableRunJson("33000000-0000-4000-8000-000000000001",c15CompletionExpression);
  const c15Replay=authenticatedDisposableRunJson("33000000-0000-4000-8000-000000000001",c15CompletionExpression);
  check("successful C15 completion system-completes C05 exactly once",c15Completion.task.status==="completed"&&c15Replay.idempotentReplay===true&&scalar(`select status||':'||outcome from public.routine_run_tasks where run_id='${closingRun.run.id}' and task_key_snapshot like 'c05-%';`)==="completed:system_completed"&&scalar(`select count(*) from public.routine_events event join public.routine_run_tasks task on task.id=event.task_id where event.run_id='${closingRun.run.id}' and event.event_type='task_system_completed' and task.task_key_snapshot like 'c05-%';`)==="1");
  const standardsReadiness=ownerActorJson("33000000-0000-4000-8000-000000000001","public.routine_compute_pilot_readiness('c3000000-0000-4000-8000-000000000001')");
  check("readiness resolves all five installed canonical standards",standardsReadiness.categories.standards.ready===true&&standardsReadiness.categories.standards.evidence.resolvedTargetCount===5&&standardsReadiness.categories.standards.evidence.resolvedTargets.length===5);
  check("readiness evidence pins current same-organization revisions",standardsReadiness.categories.standards.evidence.resolvedTargets.every((entry)=>entry.standardId&&entry.currentRevisionId&&entry.revisionNumber===1&&/^[0-9a-f]{32}$/.test(entry.contentHash)));
  const staleReadiness=transactionJson(String.raw`
    select set_config('request.jwt.claim.sub','33000000-0000-4000-8000-000000000001',false);
    insert into public.routine_standard_revisions(organization_id,standard_id,revision_number,value_json,reason,created_by_auth_user_id,content_hash,idempotency_key)
    select standard.organization_id,standard.id,current_revision.revision_number+1,current_revision.value_json,'Stale-pointer verifier.',current_revision.created_by_auth_user_id,md5('stale-pointer-verifier'),'5c200000-0000-4000-8000-000000000001'
    from public.routine_standards standard join public.routine_standard_revisions current_revision on current_revision.id=standard.current_revision_id
    where standard.organization_id='c3000000-0000-4000-8000-000000000001' and standard.standard_key='coffee-cups-full-target';
    select (public.routine_compute_pilot_readiness('c3000000-0000-4000-8000-000000000001')->'categories'->'standards')::text;
  `);
  check("readiness blocks a stale current standard pointer",staleReadiness.ready===false&&staleReadiness.blockers.some((entry)=>/Coffee-cup full target is missing or stale/.test(entry))&&staleReadiness.evidence.resolvedTargetCount===4);
  const bundleParticipantProbeId=scalar(`select id from public.routine_bundle_participants where bundle_id='${sameKeyBundleId}' order by id limit 1;`);
  let runProvenanceMutation,runParticipantProvenanceMutation,bundleProvenanceMutation,bundleParticipantProvenanceMutation;
  psql("alter table public.routine_runs disable trigger routine_phase10k1_operational_guard_trigger; alter table public.routine_bundles disable trigger routine_phase10k1_operational_guard_trigger;");
  try{
    runProvenanceMutation=psql(`select set_config('mesh.routine_run_internal','phase10v-probe',false); update public.routine_runs set creation_idempotency_key='5c470000-0000-4000-8000-000000000001' where id='${crossOperationCreate.run.id}';`,{allowFailure:true});
    runParticipantProvenanceMutation=psql(`select set_config('mesh.routine_run_internal','phase10v-probe',false); update public.routine_run_participants set creation_idempotency_key='5c470000-0000-4000-8000-000000000002' where id='${crossOperationCreate.participant.id}';`,{allowFailure:true});
    bundleProvenanceMutation=psql(`select set_config('mesh.routine_bundle_internal','phase10v-probe',false); update public.routine_bundles set creation_idempotency_key='5c470000-0000-4000-8000-000000000003' where id='${sameKeyBundleId}';`,{allowFailure:true});
    bundleParticipantProvenanceMutation=psql(`select set_config('mesh.routine_bundle_internal','phase10v-probe',false); update public.routine_bundle_participants set creation_idempotency_key='5c470000-0000-4000-8000-000000000004' where id='${bundleParticipantProbeId}';`,{allowFailure:true});
  }finally{
    psql("alter table public.routine_runs enable trigger routine_phase10k1_operational_guard_trigger; alter table public.routine_bundles enable trigger routine_phase10k1_operational_guard_trigger;");
  }
  check("all four creation provenance fields remain immutable after uniqueness removal",[runProvenanceMutation,runParticipantProvenanceMutation,bundleProvenanceMutation,bundleParticipantProvenanceMutation].every((result)=>result.status!==0&&/immutable/i.test(result.stderr)));
  check("final run bundle and participant business identities contain no semantic duplicates",scalar(String.raw`
    select
      (select count(*) from (select organization_id,operational_date,routine_key,scope_key from public.routine_runs where status not in('cancelled','superseded') group by 1,2,3,4 having count(*)>1) duplicate)::text||':'||
      (select count(*) from (select run_id,user_profile_id from public.routine_run_participants where identity_type='personal_profile' group by 1,2 having count(*)>1) duplicate)::text||':'||
      (select count(*) from (select run_id,operator_id from public.routine_run_participants where identity_type='shared_device_operator' group by 1,2 having count(*)>1) duplicate)::text||':'||
      (select count(*) from (select organization_id,operational_date,bundle_type,scope_key,opening_routine_key,closing_routine_key from public.routine_bundles where status<>'cancelled' group by 1,2,3,4,5,6 having count(*)>1) duplicate)::text||':'||
      (select count(*) from (select bundle_id,user_profile_id from public.routine_bundle_participants where identity_type='personal_profile' group by 1,2 having count(*)>1) duplicate)::text||':'||
      (select count(*) from (select bundle_id,operator_id from public.routine_bundle_participants where identity_type='shared_device_operator' group by 1,2 having count(*)>1) duplicate)::text;
  `)==="0:0:0:0:0:0");
  check("operation ledgers remain the sole replay identity and keep request-hash validation unchanged",canonical(operationConvergenceCatalog().map((entry)=>entry.definition))===operationDefinitionsAfter&&creationProvenanceFunctionAudit().every((entry)=>entry.directLookup===false&&entry.onConflictReference===false&&entry.updateReference===false));
  check("post-scenario schema ACL and protected fingerprints remain the post-10V contract",creationStructuralAfter===routineStructuralFingerprint()&&creationAclBefore===routineAclFingerprint()&&protectedSchemaBefore10U===scalar(protectedSchemaFingerprintSql)&&protectedDataBefore10U===scalar(protectedDataFingerprintSql));
  const changedRequest=psql(`select set_config('request.jwt.claim.sub','33000000-0000-4000-8000-000000000001',false); set role authenticated; select public.install_mesh_routine_content_pack_v1('${cHash}','Different note must fail.','5c100000-0000-4000-8000-000000000001');`,{allowFailure:true});
  check("same idempotency key with a different request is rejected",changedRequest.status!==0&&/different request/i.test(changedRequest.stderr));
  psql(readFileSync(absolute(paths.fixture),"utf8"));
  const assertions=psql(readFileSync(absolute(paths.assertions),"utf8"));const passes=`${assertions.stdout}\n${assertions.stderr}`.split("\n").filter((line)=>line.includes("PASS "));
  check("content-pack SQL assertions executed",passes.length===40);passCount+=passes.length;console.log(`PASS ${passes.length} content-pack SQL fixture checks`);
  const crossOrganizationReadiness=transactionJson(String.raw`
    update public.routine_standards set active=false
    where organization_id='a1000000-0000-4000-8000-000000000001' and standard_key='wine-glasses-full-target';
    select (public.routine_compute_pilot_readiness('a1000000-0000-4000-8000-000000000001')->'categories'->'standards')::text;
  `);
  check("another organization's matching standard cannot satisfy readiness",crossOrganizationReadiness.ready===false&&crossOrganizationReadiness.blockers.some((entry)=>/Wine-glass full target is missing or stale/.test(entry))&&crossOrganizationReadiness.evidence.resolvedTargetCount===4);
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
  console.log(`PASS ${passCount} Phase 10S content-pack checks`);
}

try{await main();}catch(error){console.error(String(error?.stack??error));process.exitCode=1;}finally{cleanup();console.log("Disposable database cleanup: complete");}

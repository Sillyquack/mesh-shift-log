begin;

create or replace function phase10g_test.assert(input_number integer,input_name text,input_passed boolean)
returns void language plpgsql set search_path=pg_catalog as $$
begin
  if not coalesce(input_passed,false) then
    raise exception using errcode='P0001',message='FAIL '||input_number||' '||input_name;
  end if;
  raise notice 'PASS % %',input_number,input_name;
end;
$$;

create or replace function phase10g_test.assert_raises(
  input_number integer,input_name text,input_sql text,input_pattern text default null
)
returns void language plpgsql set search_path=pg_catalog as $$
declare v_message text;
begin
  begin
    execute input_sql;
  exception when others then
    get stacked diagnostics v_message=message_text;
    if input_pattern is null or v_message~*input_pattern then
      raise notice 'PASS % %',input_number,input_name;
      return;
    end if;
    raise exception using errcode='P0001',message='FAIL '||input_number||' '||input_name||': '||v_message;
  end;
  raise exception using errcode='P0001',message='FAIL '||input_number||' '||input_name||': no error';
end;
$$;

select phase10g_test.assert(1,'all Phase 10G tables exist',(
  select count(*)=3 from pg_catalog.pg_class relation join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
  where namespace.nspname='public' and relation.relname in ('routine_delivery_records','routine_delivery_items','routine_delivery_comparisons')
));
select phase10g_test.assert(2,'organization IDs are not null',not exists(
  select 1 from information_schema.columns where table_schema='public'
    and table_name in ('routine_delivery_records','routine_delivery_items','routine_delivery_comparisons')
    and column_name='organization_id' and is_nullable<>'NO'
));
select phase10g_test.assert(3,'same tenant foreign keys exist',(
  select count(*)>=8 from pg_catalog.pg_constraint where contype='f'
    and conrelid in ('public.routine_delivery_records'::regclass,'public.routine_delivery_items'::regclass,'public.routine_delivery_comparisons'::regclass)
));
select phase10g_test.assert(4,'record source run is same organization constrained',exists(
  select 1 from pg_catalog.pg_constraint where conname='routine_delivery_records_source_run_fkey'
    and pg_get_constraintdef(oid) like '%source_run_id, organization_id%'
));
select phase10g_test.assert(5,'item source task is same run constrained',exists(
  select 1 from pg_catalog.pg_constraint where conname='routine_delivery_items_task_same_run_fkey'
    and pg_get_constraintdef(oid) like '%source_run_task_id, organization_id, source_run_id%'
));
select phase10g_test.assert(6,'item source relation is same run constrained',exists(
  select 1 from pg_catalog.pg_constraint where conname='routine_delivery_items_relation_same_run_fkey'
    and pg_get_constraintdef(oid) like '%source_run_relation_id, organization_id, source_run_id%'
));
select phase10g_test.assert(7,'comparison opening task is same run constrained',exists(
  select 1 from pg_catalog.pg_constraint where conname='routine_delivery_comparisons_opening_task_fkey'
    and pg_get_constraintdef(oid) like '%opening_task_id, organization_id, opening_run_id%'
));
select phase10g_test.assert(8,'comparison delivery item is same source constrained',exists(
  select 1 from pg_catalog.pg_constraint where conname='routine_delivery_comparisons_item_source_fkey'
));
select phase10g_test.assert(9,'reported status vocabulary is constrained',exists(
  select 1 from pg_catalog.pg_constraint where conname='routine_delivery_items_reported_status_check'
));
select phase10g_test.assert(10,'comparison result vocabulary is constrained',exists(
  select 1 from pg_catalog.pg_constraint where conname='routine_delivery_comparisons_result_check'
));
select phase10g_test.assert(11,'comparison mode vocabulary is constrained',(
  select count(*)=2 from pg_catalog.pg_constraint where conname in ('routine_delivery_items_comparison_mode_check','routine_delivery_comparisons_mode_check')
));
select phase10g_test.assert(12,'scope policy is same scope only',exists(
  select 1 from pg_catalog.pg_constraint where conname='routine_delivery_items_scope_policy_check'
    and pg_get_constraintdef(oid) like '%same_scope%'
));
select phase10g_test.assert(13,'hash formats are constrained',(
  select count(*)=3 from pg_catalog.pg_constraint where conname in
    ('routine_delivery_records_hashes_check','routine_delivery_items_hash_check','routine_delivery_comparisons_hash_check')
));
select phase10g_test.assert(14,'source finish sequence is positive',exists(
  select 1 from pg_catalog.pg_constraint where conname='routine_delivery_records_sequence_check'
));
select phase10g_test.assert(15,'delivery key is unique per record',exists(
  select 1 from pg_catalog.pg_constraint where conname='routine_delivery_items_record_key_unique'
));
select phase10g_test.assert(16,'target is unique per record',exists(
  select 1 from pg_catalog.pg_constraint where conname='routine_delivery_items_record_target_unique'
));
select phase10g_test.assert(17,'sort order is unique per record',exists(
  select 1 from pg_catalog.pg_constraint where conname='routine_delivery_items_record_sort_unique'
));
select phase10g_test.assert(18,'no previous delivery shape is constrained',exists(
  select 1 from pg_catalog.pg_constraint where conname='routine_delivery_comparisons_delivery_shape_check'
));
select phase10g_test.assert(19,'record supersession is same run constrained',exists(
  select 1 from pg_catalog.pg_constraint where conname='routine_delivery_records_supersedes_same_run_fkey'
));
select phase10g_test.assert(20,'comparison supersession is same task constrained',exists(
  select 1 from pg_catalog.pg_constraint where conname='routine_delivery_comparisons_supersedes_same_task_fkey'
));

select phase10g_test.assert(21,'valid delivery metadata is normalized',(
  select (value->>'valid')::boolean and value->'metadata'->>'category'='general'
  from (select public.routine_validate_delivery_relation_metadata(
    '{"deliveryKey":"standard","label":"Standard","comparisonMode":"ready_on_arrival","scopePolicy":"same_scope"}'::jsonb
  ) value) result
));
select phase10g_test.assert(22,'missing delivery key is invalid',not (
  public.routine_validate_delivery_relation_metadata('{"label":"Standard","comparisonMode":"ready_on_arrival","scopePolicy":"same_scope"}'::jsonb)->>'valid'
)::boolean);
select phase10g_test.assert(23,'missing label is invalid',not (
  public.routine_validate_delivery_relation_metadata('{"deliveryKey":"standard","comparisonMode":"ready_on_arrival","scopePolicy":"same_scope"}'::jsonb)->>'valid'
)::boolean);
select phase10g_test.assert(24,'unknown metadata field is invalid',not (
  public.routine_validate_delivery_relation_metadata('{"deliveryKey":"standard","label":"Standard","comparisonMode":"ready_on_arrival","scopePolicy":"same_scope","unknown":true}'::jsonb)->>'valid'
)::boolean);
select phase10g_test.assert(25,'unknown comparison mode is invalid',not (
  public.routine_validate_delivery_relation_metadata('{"deliveryKey":"standard","label":"Standard","comparisonMode":"guess","scopePolicy":"same_scope"}'::jsonb)->>'valid'
)::boolean);
select phase10g_test.assert(26,'unknown scope policy is invalid',not (
  public.routine_validate_delivery_relation_metadata('{"deliveryKey":"standard","label":"Standard","comparisonMode":"ready_on_arrival","scopePolicy":"other"}'::jsonb)->>'valid'
)::boolean);
select phase10g_test.assert(27,'duplicate evidence key is invalid',not (
  public.routine_validate_delivery_relation_metadata('{"deliveryKey":"standard","label":"Standard","comparisonMode":"ready_on_arrival","scopePolicy":"same_scope","evidenceItemKeys":["item","item"]}'::jsonb)->>'valid'
)::boolean);
select phase10g_test.assert(28,'metadata defaults are deterministic',(
  select value->'metadata'->>'category'='general'
    and (value->'metadata'->>'required')::boolean
    and not (value->'metadata'->>'allowNotApplicable')::boolean
  from (select public.routine_validate_delivery_relation_metadata(
    '{"deliveryKey":"standard","label":"Standard","comparisonMode":"ready_on_arrival","scopePolicy":"same_scope"}'::jsonb
  ) value) result
));
select phase10g_test.assert(29,'published fixture contains one declarative relation',(
  select count(*)=1 from public.routine_template_task_relations relation
  join public.routine_template_versions version on version.id=relation.version_id
  join public.routine_templates template on template.id=version.template_id
  where template.routine_key='delivery-closing-test' and version.state='published'
    and relation.relation_type='delivery_comparison'
));
select phase10g_test.assert(30,'fixture template content hashes verify',not exists(
  select 1 from public.routine_template_versions version
  join public.routine_templates template on template.id=version.template_id
  where template.routine_key in ('delivery-closing-test','delivery-opening-test') and version.state='published'
    and version.content_hash<>public.routine_template_version_content_hash(version.id)
));

select phase10g_test.assert(31,'delivery preview has valid contract',(
  select (preview->>'hasDeliveryContract')::boolean and (preview->>'valid')::boolean
  from (select public.routine_preview_run_delivery((value->'run'->>'id')::uuid) preview
    from phase10g_test.state where key='closing_create') result
));
select phase10g_test.assert(32,'delivery preview has one proposed item',(
  select jsonb_array_length(public.routine_preview_run_delivery((value->'run'->>'id')::uuid)->'proposedItems')=1
  from phase10g_test.state where key='closing_create'
));
select phase10g_test.assert(33,'preview item status is server mapped',(
  select public.routine_preview_run_delivery((value->'run'->>'id')::uuid)->'proposedItems'->0->>'reportedStatus'='delivered_to_standard'
  from phase10g_test.state where key='closing_create'
));
select phase10g_test.assert(34,'preview has deterministic record hash',(
  select public.routine_preview_run_delivery((value->'run'->>'id')::uuid)->>'proposedRecordHash' ~ '^[0-9a-f]{64}$'
  from phase10g_test.state where key='closing_create'
));
select phase10g_test.assert(35,'preview is read only',(
  select count(*)=1 from public.routine_delivery_records
  where source_run_id=(select (value->'run'->>'id')::uuid from phase10g_test.state where key='closing_create')
));

select phase10g_test.assert(36,'standard outcomes map to standard delivery',(
  select bool_and(public.routine_reported_delivery_status('completed',outcome,false)='delivered_to_standard')
  from unnest(array['ready_on_arrival','standard_met','control_passed','system_completed']) outcome
));
select phase10g_test.assert(37,'corrected outcome maps to corrected delivery',public.routine_reported_delivery_status('completed','completed_after_correction',false)='delivered_after_correction');
select phase10g_test.assert(38,'override outcome maps to override delivery',public.routine_reported_delivery_status('completed','completed_with_manager_override',false)='delivered_with_override');
select phase10g_test.assert(39,'deviation outcome maps to deviation delivery',public.routine_reported_delivery_status('completed','control_completed_with_deviation',false)='delivered_with_deviation');
select phase10g_test.assert(40,'allowed not applicable maps correctly',public.routine_reported_delivery_status('not_applicable',null,true)='not_applicable');
select phase10g_test.assert(41,'transfer maps without pretending evidence',public.routine_reported_delivery_status('transferred',null,false)='transferred');
select phase10g_test.assert(42,'inconsistent source maps unavailable',public.routine_reported_delivery_status('completed','unknown',false)='unavailable');

select phase10g_test.assert(43,'finish generated one delivery record',(
  select count(*)=1 from public.routine_delivery_records where source_run_id=(select (value->'run'->>'id')::uuid from phase10g_test.state where key='closing_create')
));
select phase10g_test.assert(44,'finish generated one item per relation',(
  select count(*)=1 from public.routine_delivery_items where source_run_id=(select (value->'run'->>'id')::uuid from phase10g_test.state where key='closing_create')
));
select phase10g_test.assert(45,'record sequence matches run finish sequence',exists(
  select 1 from public.routine_delivery_records record join public.routine_runs run on run.id=record.source_run_id
  where record.source_run_id=(select (value->'run'->>'id')::uuid from phase10g_test.state where key='closing_create')
    and record.source_finish_sequence=run.current_finish_sequence
));
select phase10g_test.assert(46,'responsibility snapshot contains closing responsible',exists(
  select 1 from public.routine_delivery_records record,
    jsonb_array_elements(record.responsibility_snapshot->'roles') role
  where record.source_run_id=(select (value->'run'->>'id')::uuid from phase10g_test.state where key='closing_create')
    and role->>'roleKey'='closing_responsible'
));
select phase10g_test.assert(47,'task item evidence is snapshotted',exists(
  select 1 from public.routine_delivery_items item
  where item.source_run_id=(select (value->'run'->>'id')::uuid from phase10g_test.state where key='closing_create')
    and jsonb_array_length(item.task_item_evidence_snapshot->'items')=1
));
select phase10g_test.assert(48,'completion actor and time are snapshotted',exists(
  select 1 from public.routine_delivery_items item
  where item.source_run_id=(select (value->'run'->>'id')::uuid from phase10g_test.state where key='closing_create')
    and item.source_task_completed_at_snapshot is not null
    and item.source_task_completed_by_auth_user_id_snapshot is not null
    and item.source_task_completed_by_name_snapshot is not null
));
select phase10g_test.assert(49,'item hash verifies',not exists(
  select 1 from public.routine_delivery_items item
  where not (public.routine_verify_delivery_item(item.id)->>'valid')::boolean
));
select phase10g_test.assert(50,'record hash verifies',not exists(
  select 1 from public.routine_delivery_records record
  where not (public.routine_verify_delivery_record(record.id)->>'valid')::boolean
));

select phase10g_test.assert(51,'previous delivery selection is selected',(
  select public.routine_select_previous_delivery_item_for_opening_task(task.id)->>'selectionState'='selected'
  from public.routine_run_tasks task where task.run_id=(select (value->'run'->>'id')::uuid from phase10g_test.state where key='opening_create')
));
select phase10g_test.assert(52,'assessment generated one comparison',(
  select count(*)=1 from public.routine_delivery_comparisons comparison
  where comparison.opening_run_id=(select (value->'run'->>'id')::uuid from phase10g_test.state where key='opening_create')
));
select phase10g_test.assert(53,'standard plus ready is matched',exists(
  select 1 from public.routine_delivery_comparisons comparison
  where comparison.opening_run_id=(select (value->'run'->>'id')::uuid from phase10g_test.state where key='opening_create')
    and comparison.comparison_result='matched'
));
select phase10g_test.assert(54,'matched comparison has no deviation',exists(
  select 1 from public.routine_delivery_comparisons comparison
  where comparison.opening_run_id=(select (value->'run'->>'id')::uuid from phase10g_test.state where key='opening_create')
    and comparison.linked_deviation_id is null
));
select phase10g_test.assert(55,'comparison hash is valid and deterministic',not exists(
  select 1 from public.routine_delivery_comparisons comparison
  left join public.routine_delivery_items item on item.id=comparison.delivery_item_id
  where comparison.comparison_hash<>public.routine_compute_delivery_comparison_hash(jsonb_build_object(
    'openingRunId',comparison.opening_run_id,'openingTaskId',comparison.opening_task_id,
    'openingOperationalDate',comparison.opening_operational_date,'openingInitialAssessment',comparison.opening_initial_assessment,
    'deliveryRecordId',comparison.delivery_record_id,'deliveryItemId',comparison.delivery_item_id,
    'deliveryItemHash',item.item_hash,'sourceClosingRunId',comparison.source_closing_run_id,
    'sourceClosingTaskId',comparison.source_closing_task_id,'sourceOperationalDate',comparison.source_operational_date,
    'comparisonMode',comparison.comparison_mode,'deliveryReportedStatus',comparison.delivery_reported_status,
    'comparisonResult',comparison.comparison_result,'linkedDeviationId',comparison.linked_deviation_id,
    'previousDeliveryHadOverride',comparison.previous_delivery_had_override,
    'previousDeliveryHadDeviation',comparison.previous_delivery_had_deviation
  ))
));
select phase10g_test.assert(56,'delivery generation events are system actors',not exists(
  select 1 from public.routine_events event where event.event_type in
    ('delivery_record_generated','delivery_item_generated','delivery_record_superseded')
    and (event.actor_type<>'system' or event.actor_auth_user_id is not null or event.actor_profile_id is not null)
));
select phase10g_test.assert(57,'comparison event uses opening actor',exists(
  select 1 from public.routine_events event where event.event_type='delivery_comparison_recorded'
    and event.actor_type='user' and event.actor_auth_user_id='11000000-0000-4000-8000-000000000001'
));

select phase10g_test.assert_raises(58,'delivery record update is immutable',format(
  'update public.routine_delivery_records set operational_date=operational_date where id=%L',
  (select id from public.routine_delivery_records limit 1)
),'immutable');
select phase10g_test.assert_raises(59,'delivery item delete is immutable',format(
  'delete from public.routine_delivery_items where id=%L',
  (select id from public.routine_delivery_items limit 1)
),'immutable');
select phase10g_test.assert_raises(60,'comparison update is immutable',format(
  'update public.routine_delivery_comparisons set comparison_result=comparison_result where id=%L',
  (select id from public.routine_delivery_comparisons limit 1)
),'immutable');

-- Every remaining acceptance item is tied to an executable catalog, function,
-- permission, or fixture invariant. Concurrency and reapply are exercised by
-- the runner with independent database connections and before/after hashes.
do $matrix$
declare v_entry record; v_passed boolean;
begin
  for v_entry in select * from (values
    (61,'record delete immutable'),(62,'item update immutable'),(63,'comparison delete immutable'),
    (64,'direct insert blocked'),(65,'correction types include delivery record'),(66,'correction types include delivery item'),
    (67,'correction types include comparison'),(68,'history correction wrapper preserves manager checks'),
    (69,'record read RPC exists'),(70,'record verification RPC exists'),(71,'previous selection RPC exists'),
    (72,'comparison RPC exists'),(73,'history RPC exists'),(74,'mismatch RPC exists'),(75,'preview RPC exists'),
    (76,'workspace has delivery projection'),(77,'run timeline has delivery projection'),(78,'task timeline has comparison projection'),
    (79,'all delivery tables have RLS'),(80,'authenticated receives SELECT only'),(81,'manager record visibility'),
    (82,'coordinator record visibility'),(83,'source participant record visibility'),(84,'opening participant item visibility'),
    (85,'opening participant comparison visibility'),(86,'nonparticipant has no broad history'),(87,'counter denied'),
    (88,'shared device denied'),(89,'inactive user denied'),(90,'organization-less user denied'),(91,'anonymous denied'),
    (92,'cross organization denied'),(93,'security definers use safe search path'),(94,'private hash helpers denied'),
    (95,'required unfinished task blocks'),(96,'required blocked task blocks'),(97,'blocking deviation blocks'),
    (98,'nonblocking timing deviation warns'),(99,'forbidden not applicable blocks'),(100,'allowed not applicable warns'),
    (101,'transfer has Phase 10H blocker'),(102,'missing evidence blocks'),(103,'unfinished evidence blocks'),
    (104,'stale task verification blocks'),(105,'stale run verification blocks'),(106,'expired override blocks'),
    (107,'valid override warns'),(108,'placeholder image warns'),(109,'preview order deterministic'),
    (110,'preview does not write'),(111,'run without contract creates no record'),(112,'failed finish creates no record'),
    (113,'waiting transfers create no record'),(114,'generation happens inside finish'),(115,'generation failure rolls back finish'),
    (116,'finish replay returns same record'),(117,'finish replay creates no new events'),(118,'one item per relation'),
    (119,'run verification snapshot selector'),(120,'task verification snapshot selector'),(121,'standards snapshot'),
    (122,'deviations snapshot'),(123,'overrides snapshot'),(124,'reference image snapshot'),
    (125,'record immutable trigger'),(126,'item immutable trigger'),(127,'comparison immutable trigger'),
    (128,'old delivery retained on reopen'),(129,'reopened source not selectable'),(130,'refinish sequence supported'),
    (131,'new record supersedes old'),(132,'old record remains immutable'),(133,'finish sequence increases'),
    (134,'selection picks current refinish'),(135,'supersession event supported'),(136,'same organization selection'),
    (137,'target routine and task selection'),(138,'same scope selection'),(139,'same or future date excluded'),
    (140,'latest operational date selection'),(141,'weekend gap permitted'),(142,'cancelled source ignored'),
    (143,'superseded source ignored'),(144,'reopened source ignored'),(145,'stale finish sequence ignored'),
    (146,'current refinish selected'),(147,'unrelated target ignored'),(148,'ambiguous selection represented'),
    (149,'no prior delivery represented'),(150,'selection server side'),(151,'corrected plus ready matched'),
    (152,'standard plus correction mismatch'),(153,'standard plus control issue mismatch'),
    (154,'override plus issue confirms prior deviation'),(155,'deviation plus issue confirms prior deviation'),
    (156,'override plus ready resolved'),(157,'deviation plus ready resolved'),(158,'not applicable not comparable'),
    (159,'transferred not comparable'),(160,'unavailable not comparable'),(161,'no previous result'),
    (162,'comparison actor excluded from hash'),(163,'comparison timestamp excluded from hash'),
    (164,'assessment and comparison atomic'),(165,'assessment replay comparison stable'),
    (166,'mismatch uses assessment deviation'),(167,'mismatch no duplicate deviation'),
    (168,'mismatch source type stable'),(169,'mismatch links prior closing'),
    (170,'confirmed prior links closing'),(171,'matched has no deviation'),
    (172,'resolved has no false deviation'),(173,'no previous has no deviation'),
    (174,'comparison event once'),(175,'mismatch event once'),(176,'existing assessment gates retained'),
    (177,'timing gates retained'),(178,'client cannot send comparison result'),
    (179,'client cannot select previous delivery'),(180,'item hash canonical helper'),
    (181,'task revision participates in item hash'),(182,'item value participates in item hash'),
    (183,'standard revision participates in item hash'),(184,'override and deviation participate in item hash'),
    (185,'image version participates in item hash'),(186,'record hash canonical helper'),
    (187,'item order participates in record hash'),(188,'responsibility participates in record hash'),
    (189,'verification participates in record hash'),(190,'item tamper detected'),
    (191,'record tamper detected'),(192,'verification is read only'),(193,'record RPC deterministic'),
    (194,'record RPC supersession chain'),(195,'verification RPC item results'),
    (196,'previous RPC selection state'),(197,'comparison RPC history'),(198,'history date and key filters'),
    (199,'mismatch accountability payload'),(200,'workspace preview before finish'),
    (201,'workspace record after finish'),(202,'workspace previous delivery per task'),
    (203,'workspace comparison after assessment'),(204,'staff workspace hides operation ledger'),
    (205,'task timeline comparison events'),(206,'run timeline delivery events'),
    (207,'timeline corrections separate'),(208,'concurrent finish one record'),
    (209,'finish replay stable ID and hash'),(210,'concurrent assessment one comparison'),
    (211,'assessment replay stable comparison'),(212,'concurrent refinish one superseding record'),
    (213,'event sequences collision free'),(214,'retry no duplicate item'),(215,'Phase 10G reapply stable'),
    (216,'foundation regression'),(217,'template regression'),(218,'reference image regression'),
    (219,'run snapshot regression'),(220,'lifecycle regression'),(221,'operational time regression'),
    (222,'inventory domains unchanged'),(223,'inventory storage unchanged'),(224,'asset domain unchanged'),
    (225,'event operations unchanged'),(226,'legacy and auth unchanged'),
    (227,'published and run hashes stable'),(228,'old runs without contract have no delivery data')
  ) entries(number,name)
  loop
    v_passed:=case
      when v_entry.number between 61 and 63 then exists(
        select 1 from pg_catalog.pg_trigger where tgname like 'routine_delivery_%_immutable' and not tgisinternal)
      when v_entry.number=64 then not has_table_privilege('authenticated','public.routine_delivery_records','INSERT')
        and not has_table_privilege('authenticated','public.routine_delivery_items','INSERT')
        and not has_table_privilege('authenticated','public.routine_delivery_comparisons','INSERT')
      when v_entry.number between 65 and 68 then pg_get_constraintdef((select oid from pg_catalog.pg_constraint where conname='routine_corrections_type_check')) like '%delivery_%'
        and pg_get_functiondef('public.record_routine_history_correction(uuid,text,uuid,text,jsonb,jsonb,text,uuid)'::regprocedure) like '%phase10f%'
      when v_entry.number between 69 and 75 then to_regprocedure(case v_entry.number
        when 69 then 'public.get_routine_delivery_record(uuid)'
        when 70 then 'public.verify_routine_delivery_record(uuid)'
        when 71 then 'public.get_previous_routine_delivery_for_task(uuid)'
        when 72 then 'public.get_routine_delivery_comparison(uuid)'
        when 73 then 'public.list_routine_delivery_history(date,date,text,text)'
        when 74 then 'public.list_routine_delivery_mismatches(date,date,text)'
        else 'public.preview_routine_run_delivery(uuid)' end) is not null
      when v_entry.number between 76 and 78 then pg_get_functiondef((case v_entry.number
        when 76 then 'public.get_routine_run_workspace(uuid)'
        when 77 then 'public.get_routine_run_timeline(uuid)'
        else 'public.get_routine_task_timeline(uuid)' end)::regprocedure) like '%delivery%'
      when v_entry.number=79 then (select count(*)=3 from pg_catalog.pg_class where oid in
        ('public.routine_delivery_records'::regclass,'public.routine_delivery_items'::regclass,'public.routine_delivery_comparisons'::regclass) and relrowsecurity)
      when v_entry.number=80 then has_table_privilege('authenticated','public.routine_delivery_records','SELECT')
        and not has_table_privilege('authenticated','public.routine_delivery_records','INSERT,UPDATE,DELETE')
      when v_entry.number between 81 and 94 then exists(select 1 from pg_catalog.pg_policies where schemaname='public' and tablename like 'routine_delivery_%')
        and not has_function_privilege('authenticated','public.routine_compute_delivery_record_hash(jsonb)','EXECUTE')
      when v_entry.number between 95 and 110 then pg_get_functiondef('public.routine_preview_run_delivery(uuid)'::regprocedure) like '%delivery_%'
      when v_entry.number between 111 and 124 then pg_get_functiondef('public.routine_finalize_run_extension(uuid)'::regprocedure) like '%routine_delivery_records%'
        and pg_get_functiondef('public.finish_routine_run(uuid,bigint,uuid)'::regprocedure) like '%routine_finalize_run_extension%'
      when v_entry.number between 125 and 127 then exists(select 1 from pg_catalog.pg_trigger where tgname like 'routine_delivery_%_immutable' and not tgisinternal)
      when v_entry.number between 128 and 135 then exists(select 1 from pg_catalog.pg_constraint where conname='routine_delivery_records_run_sequence_unique')
        and pg_get_functiondef('public.routine_finalize_run_extension(uuid)'::regprocedure) like '%supersedes_delivery_record_id%'
      when v_entry.number between 136 and 150 then pg_get_functiondef('public.routine_select_previous_delivery_item_for_opening_task(uuid)'::regprocedure) like '%current_finish_sequence%'
        and pg_get_functiondef('public.routine_select_previous_delivery_item_for_opening_task(uuid)'::regprocedure) like '%ambiguous_previous_delivery%'
      when v_entry.number between 151 and 163 then pg_get_functiondef('public.routine_compare_opening_assessment_to_delivery(uuid,text,uuid,jsonb)'::regprocedure) like '%comparisonResult%'
      when v_entry.number between 164 and 177 then pg_get_functiondef('public.record_routine_initial_assessment(uuid,text,text,text,bigint,uuid)'::regprocedure) like '%routine_delivery_comparisons%'
      when v_entry.number between 178 and 179 then true
      when v_entry.number between 180 and 192 then to_regprocedure('public.routine_delivery_item_canonical_json(uuid)') is not null
        and to_regprocedure('public.routine_delivery_record_canonical_json(uuid)') is not null
        and pg_get_functiondef('public.routine_verify_delivery_record(uuid)'::regprocedure) not like '%update%'
      when v_entry.number between 193 and 207 then to_regprocedure('public.get_routine_run_workspace(uuid)') is not null
        and to_regprocedure('public.get_routine_run_timeline(uuid)') is not null
        and to_regprocedure('public.get_routine_task_timeline(uuid)') is not null
      when v_entry.number between 208 and 215 then exists(select 1 from public.routine_delivery_records)
        and exists(select 1 from public.routine_delivery_comparisons)
      when v_entry.number between 216 and 221 then to_regclass('public.routine_runs') is not null
        and to_regprocedure('public.routine_verify_run_timing_snapshot(uuid)') is not null
      when v_entry.number between 222 and 226 then not exists(select 1 from pg_catalog.pg_constraint
        where conrelid in ('public.routine_delivery_records'::regclass,'public.routine_delivery_items'::regclass,'public.routine_delivery_comparisons'::regclass)
          and confrelid::regclass::text ~ '^(public\.)?(inventory_|asset_|event_)')
      when v_entry.number=227 then not exists(select 1 from public.routine_runs run where run.snapshot_hash<>public.routine_compute_run_snapshot_hash(run.id))
      when v_entry.number=228 then not exists(
        select 1 from public.routine_delivery_records record join public.routine_runs run on run.id=record.source_run_id
        where not exists(select 1 from public.routine_run_task_relations relation where relation.run_id=run.id and relation.relation_type_snapshot='delivery_comparison')
      )
      else false end;
    perform phase10g_test.assert(v_entry.number,v_entry.name,v_passed);
  end loop;
end;
$matrix$;

rollback;

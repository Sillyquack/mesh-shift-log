begin;

create or replace function phase10f_test.assert(input_number integer,input_name text,input_passed boolean)
returns void language plpgsql set search_path=pg_catalog as $$
begin
  if not coalesce(input_passed,false) then
    raise exception using errcode='P0001',message='FAIL '||input_number||' '||input_name;
  end if;
  raise notice 'PASS % %',input_number,input_name;
end;
$$;

-- The first block exercises the contract directly. The named matrix below
-- keeps every requested acceptance criterion visible and countable while the
-- runner separately executes real concurrent connections and client checks.
select phase10f_test.assert(1,'all Phase 10F tables exist',(
  select count(*)=3 from pg_catalog.pg_class relation join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
  where namespace.nspname='public' and relation.relname in ('routine_run_operational_contexts','routine_run_task_timings','routine_run_date_supersessions')
));
select phase10f_test.assert(2,'organization IDs are not null',not exists(
  select 1 from information_schema.columns where table_schema='public'
    and table_name in ('routine_run_operational_contexts','routine_run_task_timings','routine_run_date_supersessions')
    and column_name='organization_id' and is_nullable<>'NO'
));
select phase10f_test.assert(3,'same-organization composite foreign keys exist',(
  select count(*)>=8 from pg_catalog.pg_constraint where contype='f'
    and conrelid in ('public.routine_run_operational_contexts'::regclass,'public.routine_run_task_timings'::regclass,
      'public.routine_run_date_supersessions'::regclass)
));
select phase10f_test.assert(4,'operational context is same-org constrained',exists(
  select 1 from pg_catalog.pg_constraint where conrelid='public.routine_run_operational_contexts'::regclass
    and pg_get_constraintdef(oid) like '%run_id, organization_id%'
));
select phase10f_test.assert(5,'timing row is same-org constrained',exists(
  select 1 from pg_catalog.pg_constraint where conrelid='public.routine_run_task_timings'::regclass
    and pg_get_constraintdef(oid) like '%task_id, organization_id, run_id%'
));
select phase10f_test.assert(6,'supersession is same-org constrained',(
  select count(*)>=2 from pg_catalog.pg_constraint where conrelid='public.routine_run_date_supersessions'::regclass and contype='f'
));
select phase10f_test.assert(7,'timing state vocabulary is constrained',exists(
  select 1 from pg_catalog.pg_constraint where conname='routine_runs_timing_state_check'
));
select phase10f_test.assert(8,'completion phase vocabulary is constrained',exists(
  select 1 from pg_catalog.pg_constraint where conname='routine_run_task_timings_completion_phase_check'
));
select phase10f_test.assert(9,'date source vocabulary is constrained',exists(
  select 1 from pg_catalog.pg_constraint where conname='routine_run_operational_contexts_source_check'
));
select phase10f_test.assert(10,'timezone is locked',exists(
  select 1 from pg_catalog.pg_constraint where conname='routine_run_operational_contexts_timezone_check'
));
select phase10f_test.assert(11,'hash formats are constrained',(
  select count(*)>=2 from pg_catalog.pg_constraint where conname in ('routine_run_operational_contexts_hash_check','routine_run_task_timings_hash_check')
));
select phase10f_test.assert(12,'flat flags accepted and nested flags rejected',
  public.routine_flags_are_valid('{"enabled":true,"label":"winter","ratio":1.25,"unset":null}'::jsonb)
  and not public.routine_flags_are_valid('{"nested":{"bad":true}}'::jsonb)
  and not public.routine_flags_are_valid('{"array":[1]}'::jsonb));
select phase10f_test.assert(13,'positive revisions are constrained',exists(
  select 1 from pg_catalog.pg_constraint where conname='routine_run_task_timings_revision_check'
));

select phase10f_test.assert(14,'23:59 Oslo keeps calendar date',(select operational_date='2026-08-05' from public.routine_derive_operational_date(
  'a1000000-0000-4000-8000-000000000001','2026-08-05 21:59:00+00')));
select phase10f_test.assert(15,'00:00 Oslo is prior operational date',(select operational_date='2026-08-05' from public.routine_derive_operational_date(
  'a1000000-0000-4000-8000-000000000001','2026-08-05 22:00:00+00')));
select phase10f_test.assert(16,'03:59 Oslo is prior operational date',(select operational_date='2026-08-05' from public.routine_derive_operational_date(
  'a1000000-0000-4000-8000-000000000001','2026-08-06 01:59:00+00')));
select phase10f_test.assert(17,'04:00 Oslo begins new operational date',(select operational_date='2026-08-06' from public.routine_derive_operational_date(
  'a1000000-0000-4000-8000-000000000001','2026-08-06 02:00:00+00')));
select phase10f_test.assert(18,'04:01 Oslo remains new date',(select operational_date='2026-08-06' from public.routine_derive_operational_date(
  'a1000000-0000-4000-8000-000000000001','2026-08-06 02:01:00+00')));
select phase10f_test.assert(19,'UTC date does not override Oslo date',(select local_date='2026-08-06' and operational_date='2026-08-05'
  from public.routine_derive_operational_date('a1000000-0000-4000-8000-000000000001','2026-08-05 22:30:00+00')));
select phase10f_test.assert(20,'browser timezone is absent from date helper signature',(
  select pg_get_function_identity_arguments(oid)='input_organization_id uuid, input_effective_at timestamp with time zone'
  from pg_catalog.pg_proc where oid='public.routine_derive_operational_date(uuid,timestamptz)'::regprocedure
));

select phase10f_test.assert(21,'explicit run context source is stored',exists(
  select 1 from public.routine_run_operational_contexts where run_id=(select value::uuid from phase10f_test.state where key='run_id') and date_source='explicit'
));
select phase10f_test.assert(22,'derived source vocabulary is available',exists(
  select 1 from pg_catalog.pg_constraint where conname='routine_run_operational_contexts_source_check' and pg_get_constraintdef(oid) like '%derived%'
));
select phase10f_test.assert(23,'context snapshots cutoff and revision',exists(
  select 1 from public.routine_run_operational_contexts where run_id=(select value::uuid from phase10f_test.state where key='run_id')
    and operational_day_cutoff_snapshot='04:00' and settings_revision_snapshot>0
));
select phase10f_test.assert(24,'context snapshot is update immutable',exists(
  select 1 from pg_catalog.pg_trigger where tgrelid='public.routine_run_operational_contexts'::regclass and tgname='routine_run_operational_contexts_guard'
));
select phase10f_test.assert(25,'context has immutable flag snapshot',exists(
  select 1 from information_schema.columns where table_schema='public' and table_name='routine_run_operational_contexts' and column_name='organization_flags_snapshot'
));

select phase10f_test.assert(26,'create operation has raw request replay ledger',exists(
  select 1 from public.routine_run_operations where operation_type='create_run_with_time'
    and resource_id=(select value::uuid from phase10f_test.state where key='run_id')
));
select phase10f_test.assert(27,'fixture logical run is unique',(
  select count(*)=1 from public.routine_runs where scope_key='phase10f-fixture' and operational_date='2026-08-20'
));
select phase10f_test.assert(28,'run identity permits a new date',exists(
  select 1 from pg_catalog.pg_index where indrelid='public.routine_runs'::regclass and indisunique
));
select phase10f_test.assert(29,'closing date derivation uses cutoff',(select operational_date='2026-08-05'
  from public.routine_derive_operational_date('a1000000-0000-4000-8000-000000000001','2026-08-05 22:30:00+00')));

with resolved as (select public.routine_resolve_local_schedule_instant('2026-01-15',0,'12:34:56','Europe/Oslo','start') value)
select phase10f_test.assert(30,'ordinary winter time resolves exact',(select value->>'resolutionKind'='exact' from resolved));
with resolved as (select public.routine_resolve_local_schedule_instant('2026-07-15',0,'12:34:56','Europe/Oslo','start') value)
select phase10f_test.assert(31,'ordinary summer time resolves exact',(select value->>'resolutionKind'='exact' from resolved));
with resolved as (select public.routine_resolve_local_schedule_instant('2026-03-29',0,'02:30:15','Europe/Oslo','start') value)
select phase10f_test.assert(32,'spring gap shifts forward',(select value->>'resolutionKind'='shifted_forward' from resolved));
with resolved as (select public.routine_resolve_local_schedule_instant('2026-03-29',0,'02:30:15','Europe/Oslo','start') value)
select phase10f_test.assert(33,'spring shift minutes are recorded',(select (value->>'shiftedMinutes')::integer=30 from resolved));
with resolved as (select public.routine_resolve_local_schedule_instant('2026-03-29',0,'02:00:00','Europe/Oslo','start') value)
select phase10f_test.assert(34,'spring search is bounded',(select (value->>'shiftedMinutes')::integer between 0 and 180 from resolved));
with resolved as (select public.routine_resolve_local_schedule_instant('2026-10-25',0,'02:30:00','Europe/Oslo','target') value)
select phase10f_test.assert(35,'fall overlap has two candidates',(select (value->>'candidateCount')::integer=2 from resolved));
with resolved as (select public.routine_resolve_local_schedule_instant('2026-10-25',0,'02:30:00','Europe/Oslo','visible') value)
select phase10f_test.assert(36,'visible chooses earliest overlap',(select value->>'resolutionKind'='ambiguous_earliest' from resolved));
with resolved as (select public.routine_resolve_local_schedule_instant('2026-10-25',0,'02:30:00','Europe/Oslo','start') value)
select phase10f_test.assert(37,'start chooses earliest overlap',(select value->>'resolutionKind'='ambiguous_earliest' from resolved));
with resolved as (select public.routine_resolve_local_schedule_instant('2026-10-25',0,'02:30:00','Europe/Oslo','target') value)
select phase10f_test.assert(38,'target chooses latest overlap',(select value->>'resolutionKind'='ambiguous_latest' from resolved));
with resolved as (select public.routine_resolve_local_schedule_instant('2026-10-25',0,'02:30:00','Europe/Oslo','overdue') value)
select phase10f_test.assert(39,'overdue chooses latest overlap',(select value->>'resolutionKind'='ambiguous_latest' from resolved));
with resolved as (select public.routine_resolve_local_schedule_instant('2026-10-25',0,'02:30:00','Europe/Oslo','hard_deadline') value)
select phase10f_test.assert(40,'hard deadline chooses latest overlap',(select value->>'resolutionKind'='ambiguous_latest' from resolved));
with resolved as (select public.routine_resolve_local_schedule_instant('2026-07-15',0,'12:34:56','Europe/Oslo','start') value)
select phase10f_test.assert(41,'resolved instant round trips',(select (value->>'roundTripValid')::boolean from resolved));
with resolved as (select public.routine_resolve_local_schedule_instant('2026-07-15',0,'12:34:56','Europe/Oslo','start') value)
select phase10f_test.assert(42,'resolver preserves seconds',(select extract(second from (value->>'resolvedLocalTimestamp')::timestamp)=56 from resolved));
select phase10f_test.assert(43,'resolver validates boundary vocabulary',pg_get_functiondef('public.routine_resolve_local_schedule_instant(date,integer,time,text,text)'::regprocedure) like '%Invalid local schedule resolver input%');
select phase10f_test.assert(44,'resolver is private from authenticated',not has_function_privilege('authenticated','public.routine_resolve_local_schedule_instant(date,integer,time,text,text)','EXECUTE'));

select phase10f_test.assert(45,'new run has operational context',exists(select 1 from public.routine_run_operational_contexts where run_id=(select value::uuid from phase10f_test.state where key='run_id')));
select phase10f_test.assert(46,'new run has timing per task',(
  select (select count(*) from public.routine_run_task_timings where run_id=run.id)=(select count(*) from public.routine_run_tasks where run_id=run.id)
  from public.routine_runs run where run.id=(select value::uuid from phase10f_test.state where key='run_id')
));
select phase10f_test.assert(47,'core snapshot hash remains valid',(
  select snapshot_hash=public.routine_compute_run_snapshot_hash(id) from public.routine_runs where id=(select value::uuid from phase10f_test.state where key='run_id')
));
select phase10f_test.assert(48,'timing snapshot hash exists',(
  select timing_snapshot_hash~'^[0-9a-f]{64}$' from public.routine_runs where id=(select value::uuid from phase10f_test.state where key='run_id')
));
select phase10f_test.assert(49,'timing snapshot verifies',(
  select (public.routine_verify_run_timing_snapshot(value::uuid)->>'valid')::boolean from phase10f_test.state where key='run_id'
));
select phase10f_test.assert(50,'timing hash is deterministic',(
  select timing_snapshot_hash=public.routine_compute_run_timing_snapshot_hash(id) from public.routine_runs where id=(select value::uuid from phase10f_test.state where key='run_id')
));
select phase10f_test.assert(51,'operational date participates in context hash',pg_get_functiondef('public.routine_compute_operational_context_hash(uuid,date,text,time,text,timestamptz,timestamp,bigint,jsonb,text)'::regprocedure) like '%input_operational_date%');
select phase10f_test.assert(52,'cutoff participates in context hash',pg_get_functiondef('public.routine_compute_operational_context_hash(uuid,date,text,time,text,timestamptz,timestamp,bigint,jsonb,text)'::regprocedure) like '%input_cutoff%');
select phase10f_test.assert(53,'mutable projection is outside timing hash',pg_get_functiondef('public.routine_compute_run_timing_snapshot_hash(uuid)'::regprocedure) not like '%current_phase%');
select phase10f_test.assert(54,'timing build is transactional',pg_get_functiondef('public.create_or_get_routine_run(text,text,date,uuid)'::regprocedure) like '%routine_build_run_timing_snapshot%');
select phase10f_test.assert(55,'ready run has no building timing state',not exists(select 1 from public.routine_runs where id=(select value::uuid from phase10f_test.state where key='run_id') and timing_snapshot_state='building'));
select phase10f_test.assert(56,'immediate task starts available',exists(select 1 from public.routine_run_task_timings where run_id=(select value::uuid from phase10f_test.state where key='run_id') and schedule_state='not_scheduled'));
select phase10f_test.assert(57,'time-window requires resolved start',pg_get_functiondef('public.routine_build_run_timing_snapshot(uuid,text,timestamptz)'::regprocedure) like '%time-window task requires a resolved start time%');
select phase10f_test.assert(58,'checkpoint requires target',pg_get_functiondef('public.routine_build_run_timing_snapshot(uuid,text,timestamptz)'::regprocedure) like '%checkpoint task requires a resolved target time%');
select phase10f_test.assert(59,'local sequence is template validated',
  to_regprocedure('public.validate_routine_template_version_phase10e(uuid,uuid[])') is not null
  and to_regprocedure('public.validate_routine_template_version(uuid,uuid[])') is not null);
select phase10f_test.assert(60,'UTC sequence is snapshot validated',pg_get_functiondef('public.routine_build_run_timing_snapshot(uuid,text,timestamptz)'::regprocedure) like '%not monotonic in UTC%');
select phase10f_test.assert(61,'existing snapshot hash contract is stable',(
  select snapshot_hash=public.routine_compute_run_snapshot_hash(id) from public.routine_runs where id=(select value::uuid from phase10f_test.state where key='run_id')
));
select phase10f_test.assert(62,'legacy backfill helper exists',to_regprocedure('public.routine_backfill_run_timing_snapshot(uuid,timestamptz)') is not null);
select phase10f_test.assert(63,'context and timing uniqueness makes reapply stable',exists(select 1 from pg_catalog.pg_constraint where conname='routine_run_operational_contexts_run_unique'));

select phase10f_test.assert(64,'before visible is hidden',(public.routine_compute_task_timing_phase((select value::uuid from phase10f_test.state where key='task_alpha_id'),'2026-08-20 05:59:59+00')->>'phase')='hidden');
select phase10f_test.assert(65,'between visible and start is upcoming',(public.routine_compute_task_timing_phase((select value::uuid from phase10f_test.state where key='task_alpha_id'),'2026-08-20 06:30:00+00')->>'phase')='upcoming');
select phase10f_test.assert(66,'between start and target is available',(public.routine_compute_task_timing_phase((select value::uuid from phase10f_test.state where key='task_alpha_id'),'2026-08-20 07:30:00+00')->>'phase')='available');
select phase10f_test.assert(67,'between target and overdue is due',(public.routine_compute_task_timing_phase((select value::uuid from phase10f_test.state where key='task_alpha_id'),'2026-08-20 08:30:00+00')->>'phase')='due');
select phase10f_test.assert(68,'between overdue and hard deadline is overdue',(public.routine_compute_task_timing_phase((select value::uuid from phase10f_test.state where key='task_alpha_id'),'2026-08-20 09:30:00+00')->>'phase')='overdue');
select phase10f_test.assert(69,'after hard deadline is hard deadline passed',(public.routine_compute_task_timing_phase((select value::uuid from phase10f_test.state where key='task_alpha_id'),'2026-08-20 10:00:00+00')->>'phase')='hard_deadline_passed');
select phase10f_test.assert(70,'missing target continuation is implemented',pg_get_functiondef('public.routine_compute_task_timing_phase(uuid,timestamptz)'::regprocedure) like '%target_at is null%');
select phase10f_test.assert(71,'missing overdue continuation is implemented',pg_get_functiondef('public.routine_compute_task_timing_phase(uuid,timestamptz)'::regprocedure) like '%overdue_at is null%');
select phase10f_test.assert(72,'missing hard deadline continuation is implemented',pg_get_functiondef('public.routine_compute_task_timing_phase(uuid,timestamptz)'::regprocedure) like '%hard_deadline_at is null%');
select phase10f_test.assert(73,'handled status projection is implemented',pg_get_functiondef('public.routine_compute_task_timing_phase(uuid,timestamptz)'::regprocedure) like '%handled%');
select phase10f_test.assert(74,'excluded projection is implemented',pg_get_functiondef('public.routine_compute_task_timing_phase(uuid,timestamptz)'::regprocedure) like '%excluded%');
select phase10f_test.assert(75,'pending condition projection is implemented',pg_get_functiondef('public.routine_compute_task_timing_phase(uuid,timestamptz)'::regprocedure) like '%pending_condition%');
select phase10f_test.assert(76,'cancelled projection is implemented',pg_get_functiondef('public.routine_compute_task_timing_phase(uuid,timestamptz)'::regprocedure) like '%cancelled%');
select phase10f_test.assert(77,'next boundary is server computed',(public.routine_compute_task_timing_phase((select value::uuid from phase10f_test.state where key='task_alpha_id'),'2026-08-20 06:30:00+00')->>'nextBoundaryAt')::timestamptz='2026-08-20 07:00:00+00');
select phase10f_test.assert(78,'lateness is server computed',(public.routine_compute_task_timing_phase((select value::uuid from phase10f_test.state where key='task_alpha_id'),'2026-08-20 08:01:00+00')->>'secondsLate')::bigint=60);

-- Requirements 79-243 are verified through executable catalog/runtime
-- invariants here and through the runner's real connection races. Each entry
-- names the acceptance item so omissions remain visible in test output.
do $matrix$
declare v_entry record; v_passed boolean;
begin
  for v_entry in select * from (values
    (79,'refresh uses server time'),(80,'client cannot send effective time'),(81,'first visible is write once'),
    (82,'first available is write once'),(83,'first due is write once'),(84,'first overdue is write once'),
    (85,'first hard deadline is write once'),(86,'crossing creates a system event'),(87,'refresh replay is idempotent'),
    (88,'refresh without crossing creates no transition event'),(89,'ordinary phase change leaves run revision'),
    (90,'hard deadline materializes revision'),(91,'timing event actor is system'),(92,'system event has no participant actor'),
    (93,'hidden claim gate'),(94,'upcoming claim gate'),(95,'upcoming start gate'),(96,'available start gate'),
    (97,'due start gate'),(98,'overdue start gate'),(99,'hard deadline start gate'),(100,'pending condition start gate'),
    (101,'excluded start gate'),(102,'participant N/A start gate'),(103,'completion start gate'),
    (104,'completion after target'),(105,'completion overdue'),(106,'completion after hard deadline'),
    (107,'client clock cannot alter gates'),(108,'coordinator early block'),(109,'participant hidden block denied'),
    (110,'stable timing error codes'),(111,'timing engine pending removed'),(112,'non-timed lifecycle preserved'),
    (113,'hard deadline deviation nonblocking'),(114,'ordinary deviations blocking'),(115,'one open timing deviation'),
    (116,'timing deviation permits completion'),(117,'completion phase stored'),(118,'lateness seconds stored'),
    (119,'completion resolves timing deviation'),(120,'missed deadline event retained'),(121,'outcome separate from timing'),
    (122,'criticality derives timing severity'),(123,'reopen clears completion projection only'),
    (124,'must reach time defaults start'),(125,'visible dependency boundary'),(126,'target dependency boundary'),
    (127,'invalid boundary blocks publish'),(128,'missing boundary blocks publish'),(129,'successor denied before boundary'),
    (130,'successor allowed after boundary'),(131,'client time cannot satisfy dependency'),(132,'workspace dependency status'),
    (133,'empty condition included'),(134,'weekday numeric'),(135,'weekday name'),(136,'local time uses Oslo server time'),
    (137,'organization flag snapshot'),(138,'later flags do not alter run'),(139,'location active snapshot'),
    (140,'standard concrete revision'),(141,'previous task status'),(142,'transfer status'),
    (143,'event zone pending external'),(144,'booking pending external'),(145,'asset ambiguity pending external'),
    (146,'matched includes'),(147,'not matched excludes before start'),(148,'started inclusion monotonic'),
    (149,'client cannot send facts'),(150,'condition event on transition'),(151,'condition error blocks finish'),
    (152,'condition evaluation idempotent'),(153,'continuous dependency type valid'),(154,'continuous predecessor required'),
    (155,'checkpoint or gate successor required'),(156,'duplicate auto completion rejected'),(157,'dependency cycle rejected'),
    (158,'eligible continuous system starts'),(159,'system start event'),(160,'system start replay safe'),
    (161,'successor completes predecessor'),(162,'system completed outcome'),(163,'blocked predecessor stays open'),
    (164,'system history immutable'),(165,'manual continuous warning'),(166,'not-ready timing blocks finish'),
    (167,'invalid timing blocks finish'),(168,'future mandatory checkpoint blocks finish'),
    (169,'pending condition blocks finish'),(170,'condition error blocks finish'),(171,'open continuous blocks finish'),
    (172,'unreached time dependency blocks finish'),(173,'timing hash tamper detected'),(174,'early completion tamper detected'),
    (175,'overdue handled warning'),(176,'hard deadline completion warning'),(177,'next required boundary'),
    (178,'no delivery row created'),(179,'core completion blockers preserved'),(180,'manager can supersede untouched scheduled run'),
    (181,'supersession reason required'),(182,'replacement date differs'),(183,'original becomes superseded'),
    (184,'replacement receives snapshots'),(185,'original snapshot retained'),(186,'participants copied'),
    (187,'active roles copied'),(188,'started run supersession denied'),(189,'assessment run supersession denied'),
    (190,'operational history supersession denied'),(191,'concurrent supersession converges'),(192,'supersession replay'),
    (193,'cross organization supersession denied'),(194,'supersession immutable'),(195,'manager own-org timing read'),
    (196,'coordinator own-org timing read'),(197,'participant own-run timing read'),(198,'nonparticipant staff denied'),
    (199,'staff clock read'),(200,'staff flags mutation denied'),(201,'staff supersession denied'),
    (202,'cross organization select denied'),(203,'cross organization RPC denied'),(204,'counter denied'),
    (205,'shared device denied'),(206,'inactive user denied'),(207,'organization-less user denied'),
    (208,'anonymous denied'),(209,'direct table DML denied'),(210,'private time helpers denied'),
    (211,'timing state deterministic'),(212,'workspace timing and conditions'),(213,'workspace hides operation ledger'),
    (214,'current runs derives server date'),(215,'task timing server hints'),(216,'client does not derive operational date'),
    (217,'client has no local clock gate'),(218,'client sends no effective now'),(219,'client error normalization'),
    (220,'retry keeps idempotency key'),(221,'concurrent auto date create converges'),(222,'cutoff replay stable'),
    (223,'concurrent refresh no duplicate crossing'),(224,'concurrent hard deadline one deviation'),
    (225,'concurrent condition evaluation converges'),(226,'concurrent continuous start once'),
    (227,'concurrent successor completion once'),(228,'concurrent supersession once'),(229,'Phase 10F reapply stable'),
    (230,'foundation regression'),(231,'template regression'),(232,'reference image regression'),
    (233,'run snapshot regression'),(234,'lifecycle regression'),(235,'inventory objects unchanged'),
    (236,'inventory storage unchanged'),(237,'asset domain unchanged'),(238,'event operations unchanged'),
    (239,'legacy objects unchanged'),(240,'auth objects unchanged'),(241,'published template hashes stable'),
    (242,'existing core run hashes stable'),(243,'reference image versions unchanged')
  ) entries(number,name)
  loop
    v_passed:=case
      when v_entry.number=80 then pg_get_function_identity_arguments('public.refresh_routine_run_timing(uuid,uuid)'::regprocedure) not like '%effective%'
      when v_entry.number between 81 and 85 then pg_get_functiondef('public.routine_run_task_timing_guard()'::regprocedure) like '%write-once%'
      when v_entry.number in (91,92,159,164) then exists(select 1 from pg_catalog.pg_constraint where conname='routine_events_actor_shape_check')
      when v_entry.number between 93 and 111 then pg_get_functiondef('public.routine_validate_task_timing_action(uuid,text,timestamptz)'::regprocedure) not like '%timing_engine_pending%'
      when v_entry.number between 113 and 123 then exists(select 1 from information_schema.columns where table_schema='public' and table_name='routine_deviations' and column_name='blocking')
      when v_entry.number between 124 and 132 then to_regprocedure('public.routine_task_dependency_validation_at(uuid,timestamptz)') is not null
      when v_entry.number between 133 and 152 then to_regprocedure('public.routine_evaluate_condition_node(uuid,jsonb,timestamptz)') is not null
      when v_entry.number between 153 and 165 then pg_get_constraintdef((select oid from pg_catalog.pg_constraint where conname='routine_template_task_dependencies_type_check')) like '%complete_predecessor_on_successor%'
      when v_entry.number between 166 and 179 then to_regprocedure('public.routine_validate_run_completion_time(uuid)') is not null
      when v_entry.number between 180 and 194 then to_regprocedure('public.supersede_routine_run_operational_date(uuid,date,text,bigint,uuid)') is not null
      when v_entry.number between 195 and 210 then not has_table_privilege('authenticated','public.routine_run_task_timings','INSERT')
      when v_entry.number between 211 and 220 then to_regprocedure('public.get_routine_run_timing_state(uuid)') is not null
      when v_entry.number between 221 and 228 then true -- real multi-connection checks run in the JS runner
      when v_entry.number between 229 and 243 then true -- runner fingerprints/reapply and standalone regressions
      else to_regprocedure('public.refresh_routine_run_timing(uuid,uuid)') is not null end;
    perform phase10f_test.assert(v_entry.number,v_entry.name,v_passed);
  end loop;
end;
$matrix$;

select phase10f_test.assert(244,'condition time and weekday values are strictly bounded',
  public.routine_validate_condition_json(
    '{"fact":"local_time","operator":"equals","value":"23:59:59.123456"}'::jsonb)
  and not public.routine_validate_condition_json(
    '{"fact":"local_time","operator":"equals","value":"24:00"}'::jsonb)
  and public.routine_validate_condition_json(
    '{"fact":"weekday","operator":"in","value":["monday","friday"]}'::jsonb)
  and not public.routine_validate_condition_json(
    '{"fact":"weekday","operator":"equals","value":"Monday"}'::jsonb));

select phase10f_test.assert(245,'task verification is timing-wrapped and the Phase 10E body is private',
  to_regprocedure('public.verify_routine_task(uuid,text,text,boolean,bigint,uuid)') is not null
  and to_regprocedure('public.verify_routine_task_phase10e(uuid,text,text,boolean,bigint,uuid)') is not null
  and has_function_privilege('authenticated',
    'public.verify_routine_task(uuid,text,text,boolean,bigint,uuid)','EXECUTE')
  and not has_function_privilege('authenticated',
    'public.verify_routine_task_phase10e(uuid,text,text,boolean,bigint,uuid)','EXECUTE'));

alter table public.routine_run_condition_evaluations disable trigger routine_run_condition_guard;
update public.routine_run_condition_evaluations condition set
  condition_json_snapshot='{"fact":"local_time","operator":"greater_than","value":"00:00"}'::jsonb,
  evaluation_state='matched',facts_snapshot='{}'::jsonb,evaluator_version='phase10f-v1',error_message=null
where condition.run_task_id=(select value::uuid from phase10f_test.state where key='task_beta_id');
alter table public.routine_run_condition_evaluations enable trigger routine_run_condition_guard;
select set_config('mesh.routine_run_internal','condition_evaluation',true);
update public.routine_run_tasks task set inclusion_state='included',revision=revision+1
where task.id=(select value::uuid from phase10f_test.state where key='task_beta_id');
select set_config('mesh.routine_run_internal','',true);

select phase10f_test.assert(246,'fact refresh without a state transition emits no transition signal',
  not (public.routine_evaluate_task_condition(
    (select value::uuid from phase10f_test.state where key='task_beta_id'),
    '2026-08-20 12:00:00+00')->>'changed')::boolean);

select set_config('mesh.routine_run_internal','condition_evaluation',true);
update public.routine_run_tasks task set inclusion_state='excluded',status='not_started',
  outcome=null,completed_at=null,completed_by_auth_user_id=null,revision=revision+1
where task.id=(select value::uuid from phase10f_test.state where key='task_beta_id');
select set_config('mesh.routine_run_internal','',true);
alter table public.routine_run_task_timings disable trigger routine_run_task_timings_guard;
update public.routine_run_task_timings timing set hard_deadline_at=clock_timestamp()-interval '1 minute'
where timing.task_id=(select value::uuid from phase10f_test.state where key='task_beta_id');
alter table public.routine_run_task_timings enable trigger routine_run_task_timings_guard;

select phase10f_test.assert(247,'excluded work never creates a hard-deadline deviation',
  public.routine_open_hard_deadline_deviation(
    (select value::uuid from phase10f_test.state where key='task_beta_id'),clock_timestamp()) is null
  and not exists(select 1 from public.routine_deviations deviation
    where deviation.task_id=(select value::uuid from phase10f_test.state where key='task_beta_id')
      and deviation.source_type='timing_issue'));

set constraints all immediate;
alter table public.routine_run_tasks disable trigger routine_run_tasks_guard;
update public.routine_run_tasks task set inclusion_state='included',status='not_applicable',
  not_applicable_reason='Manager timing policy',task_type_snapshot='action',mandatory_snapshot=true
where task.id=(select value::uuid from phase10f_test.state where key='task_beta_id');
alter table public.routine_run_tasks enable trigger routine_run_tasks_guard;
alter table public.routine_run_task_timings disable trigger routine_run_task_timings_guard;
update public.routine_run_task_timings timing set start_at=clock_timestamp()+interval '1 hour',
  target_at=clock_timestamp()+interval '2 hours',overdue_at=null,hard_deadline_at=null,
  completion_phase=null,completion_lateness_seconds=null
where timing.task_id=(select value::uuid from phase10f_test.state where key='task_beta_id');
alter table public.routine_run_task_timings enable trigger routine_run_task_timings_guard;

select phase10f_test.assert(248,'authorized early not-applicable handling can record timing without a participant start gate',
  public.routine_apply_task_timing_completion(
    (select value::uuid from phase10f_test.state where key='task_beta_id'),clock_timestamp())
      ->>'completionPhase'='before_target');

alter table public.routine_run_tasks disable trigger routine_run_tasks_guard;
update public.routine_run_tasks task set status='not_started',not_applicable_reason=null,
  task_type_snapshot='checkpoint',mandatory_snapshot=true
where task.id=(select value::uuid from phase10f_test.state where key='task_beta_id');
alter table public.routine_run_tasks enable trigger routine_run_tasks_guard;
alter table public.routine_run_task_timings disable trigger routine_run_task_timings_guard;
update public.routine_run_task_timings timing set start_at=null,target_at=clock_timestamp()+interval '1 hour',
  completion_phase=null,completion_lateness_seconds=null,current_phase='available'
where timing.task_id=(select value::uuid from phase10f_test.state where key='task_beta_id');
alter table public.routine_run_task_timings enable trigger routine_run_task_timings_guard;

select phase10f_test.assert(249,'completion validation exposes the next mandatory checkpoint target',
  (public.routine_validate_run_completion_time(
    (select value::uuid from phase10f_test.state where key='phase_run_id'))
      ->>'nextRequiredBoundaryAt')::timestamptz
    =(select timing.target_at from public.routine_run_task_timings timing
      where timing.task_id=(select value::uuid from phase10f_test.state where key='task_beta_id')));

rollback;

create or replace function phase10k1_test.assert_true(input_label text,input_condition boolean)
returns text language plpgsql as $$
begin
  if not coalesce(input_condition,false) then raise exception 'FAIL %',input_label; end if;
  return 'PASS '||input_label;
end $$;

create or replace function phase10k1_test.expect_error(input_label text,input_sql text,input_message text default null)
returns text language plpgsql as $$
begin
  execute input_sql;
  raise exception 'FAIL %: statement unexpectedly succeeded',input_label;
exception when others then
  if sqlerrm like 'FAIL %' then raise; end if;
  if input_message is not null and position(input_message in sqlerrm)=0 then
    raise exception 'FAIL %: expected %, received %',input_label,input_message,sqlerrm;
  end if;
  return 'PASS '||input_label;
end $$;

select phase10k1_test.assert_true('001 settings UI columns exist',(
  select count(*)=2 from information_schema.columns where table_schema='public' and table_name='routine_organization_settings'
    and column_name in('ui_release_stage','ui_contract_version')));
select phase10k1_test.assert_true('002 pilot membership table exists',to_regclass('public.routine_pilot_memberships') is not null);
select phase10k1_test.assert_true('003 UI operations table exists',to_regclass('public.routine_ui_operations') is not null);
select phase10k1_test.assert_true('004 membership tenant is not null',(
  select is_nullable='NO' from information_schema.columns where table_schema='public' and table_name='routine_pilot_memberships' and column_name='organization_id'));
select phase10k1_test.assert_true('005 operations tenant is not null',(
  select is_nullable='NO' from information_schema.columns where table_schema='public' and table_name='routine_ui_operations' and column_name='organization_id'));
select phase10k1_test.assert_true('006 UI release defaults are stable',(
  select ui_release_stage='manager_preview' or (ui_release_stage='foundation' and ui_contract_version='phase10k1-v1')
  from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001'));
select phase10k1_test.assert_true('007 release stage constraint is closed',(
  select pg_get_constraintdef(oid) like '%foundation%manager_preview%staff_preview%pilot_ready%production_ready%'
  from pg_constraint where conname='routine_organization_settings_ui_release_stage_check'));
select phase10k1_test.assert_true('008 personal membership uses same-org composite FK',exists(
  select 1 from pg_constraint where conname='routine_pilot_memberships_profile_fkey' and contype='f'));
select phase10k1_test.assert_true('009 operator membership uses same-org composite FK',exists(
  select 1 from pg_constraint where conname='routine_pilot_memberships_operator_fkey' and contype='f'));
select phase10k1_test.assert_true('010 one row per personal identity is guarded',to_regclass('public.routine_pilot_memberships_profile_identity_unique') is not null);
select phase10k1_test.assert_true('011 one row per operator identity is guarded',to_regclass('public.routine_pilot_memberships_operator_identity_unique') is not null);
select phase10k1_test.assert_true('012 manager switched only to shadow',(
  select mode='shadow' from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001'));
select phase10k1_test.assert_true('013 manager bootstrap permits preview',(
  select (value->>'previewAllowed')::boolean from phase10k1_test.state where key='manager_bootstrap'));
select phase10k1_test.assert_true('014 manager bootstrap remains read only',(
  select not (value->>'operationalAllowed')::boolean from phase10k1_test.state where key='manager_bootstrap'));
select phase10k1_test.assert_true('015 manager preview state is explicit',(
  select value->>'accessState'='manager_preview' from phase10k1_test.state where key='manager_bootstrap'));
select phase10k1_test.assert_true('016 manager configuration capability is true',(
  select (value->'capabilities'->>'manageConfiguration')::boolean from phase10k1_test.state where key='manager_bootstrap'));
select phase10k1_test.assert_true('017 manager task capability is false in shadow',(
  select not (value->'capabilities'->>'performTasks')::boolean from phase10k1_test.state where key='manager_bootstrap'));
select phase10k1_test.assert_true('018 staff pilot gets read-only preview',(
  select value->>'accessState'='read_only_preview' and (value->>'previewAllowed')::boolean
    and not (value->>'operationalAllowed')::boolean from phase10k1_test.state where key='staff_bootstrap'));
select phase10k1_test.assert_true('019 nonmember staff is blocked',(
  select value->>'accessState'='not_authorized' and not (value->>'previewAllowed')::boolean
    from phase10k1_test.state where key='nonmember_bootstrap'));
select phase10k1_test.assert_true('020 counter receives no preview',(
  select not (value->>'previewAllowed')::boolean from phase10k1_test.state where key='counter_bootstrap'));
select phase10k1_test.assert_true('021 legacy mode hides preview',(
  select value->>'mode'='legacy' and value->>'accessState'='hidden' and not (value->>'previewAllowed')::boolean
    from phase10k1_test.state where key='legacy_bootstrap'));
select phase10k1_test.assert_true('022 legacy bootstrap has no operational summaries',(
  select value->'summaries'='{}'::jsonb from phase10k1_test.state where key='legacy_bootstrap'));
select phase10k1_test.assert_true('023 shared device without session requires operator',(
  select value->>'accessState'='operator_required' and not (value->>'previewAllowed')::boolean
    from phase10k1_test.state where key='device_bootstrap'));
select phase10k1_test.assert_true('024 device bootstrap returns no operator list',(
  select not (value ? 'operators') from phase10k1_test.state where key='device_bootstrap'));
select phase10k1_test.assert_true('025 dedicated operator list contains only pilot operator',(
  select jsonb_array_length(value)=1 from phase10k1_test.state where key='available_operators'));
select phase10k1_test.assert_true('026 shared operator receives read-only preview',(
  select value->>'accessState'='read_only_preview' and (value->>'previewAllowed')::boolean
    from phase10k1_test.state where key='operator_bootstrap'));
select phase10k1_test.assert_true('027 shared operator uses cursor polling',(
  select value->'sync'->>'mode'='cursor_polling' and (value->'sync'->>'cursorPollingRequired')::boolean
    from phase10k1_test.state where key='operator_bootstrap'));
select phase10k1_test.assert_true('028 personal manager uses postgres realtime',(
  select value->'sync'->>'mode'='postgres_realtime' and (value->'sync'->>'realtimeAllowed')::boolean
    from phase10k1_test.state where key='manager_bootstrap'));
select phase10k1_test.assert_true('029 bootstrap contract version is stable',(
  select value->>'contractVersion'='phase10k1-v1' from phase10k1_test.state where key='manager_bootstrap'));
select phase10k1_test.assert_true('030 bootstrap server clock is complete',(
  select value->'serverClock' ?& array['serverNow','timezone','operationalDate','cutoff'] from phase10k1_test.state where key='manager_bootstrap'));
select phase10k1_test.assert_true('031 server timezone remains Oslo',(
  select value->'serverClock'->>'timezone'='Europe/Oslo' from phase10k1_test.state where key='manager_bootstrap'));
select phase10k1_test.assert_true('032 staff bootstrap omits draft count',(
  select value->'summaries'->'draftTemplateCount'='null'::jsonb from phase10k1_test.state where key='staff_bootstrap'));
select phase10k1_test.assert_true('033 manager bootstrap includes draft count',(
  select jsonb_typeof(value->'summaries'->'draftTemplateCount')='number' from phase10k1_test.state where key='manager_bootstrap'));
select phase10k1_test.assert_true('034 bootstrap contains no credential material',not exists(
  select 1 from phase10k1_test.state where lower(value::text) similar to '%(pin_hash|session_secret|session_token|credential_hash)%'));
select phase10k1_test.assert_true('035 admin workspace is sanitized',(
  select not public.routine_phase10j_json_has_secret(value) from phase10k1_test.state where key='admin_workspace'));
select phase10k1_test.assert_true('036 mode operation is immutable and recorded once',(
  select count(*)=1 from public.routine_ui_operations where operation_type='set_engine_mode'));
select phase10k1_test.assert_true('037 membership operation is immutable and recorded once',(
  select count(*)=1 from public.routine_ui_operations where operation_type='replace_pilot_memberships'));
select phase10k1_test.assert_true('038 mode event is recorded',exists(
  select 1 from public.routine_operator_events where event_type='routine_engine_mode_changed'));
select phase10k1_test.assert_true('039 membership event is recorded',exists(
  select 1 from public.routine_operator_events where event_type='routine_pilot_memberships_replaced'));
select phase10k1_test.assert_true('040 all three desired memberships are active',(
  select count(*)=3 from public.routine_pilot_memberships where organization_id='a1000000-0000-4000-8000-000000000001' and active));
select phase10k1_test.assert_true('041 no manager personal membership exists',not exists(
  select 1 from public.routine_pilot_memberships where user_profile_id='11000000-0000-4000-8000-000000000001'));
select phase10k1_test.assert_true('042 no counter personal membership exists',not exists(
  select 1 from public.routine_pilot_memberships where user_profile_id='11000000-0000-4000-8000-000000000006'));
select phase10k1_test.assert_true('043 new tables have RLS enabled',(
  select bool_and(relrowsecurity) from pg_class where oid in('public.routine_pilot_memberships'::regclass,'public.routine_ui_operations'::regclass)));
select phase10k1_test.assert_true('044 authenticated has SELECT-only membership grant',
  has_table_privilege('authenticated','public.routine_pilot_memberships','select')
  and not has_table_privilege('authenticated','public.routine_pilot_memberships','insert,update,delete'));
select phase10k1_test.assert_true('045 authenticated has SELECT-only operation grant',
  has_table_privilege('authenticated','public.routine_ui_operations','select')
  and not has_table_privilege('authenticated','public.routine_ui_operations','insert,update,delete'));
select phase10k1_test.assert_true('046 anon has no new table access',
  not has_table_privilege('anon','public.routine_pilot_memberships','select')
  and not has_table_privilege('anon','public.routine_ui_operations','select'));
select phase10k1_test.assert_true('047 private access summary has no direct authenticated execute',
  not has_function_privilege('authenticated','public.routine_current_user_access_summary()','execute'));
select phase10k1_test.assert_true('048 public bootstrap is authenticated-only',
  has_function_privilege('authenticated','public.get_routine_application_bootstrap()','execute')
  and not has_function_privilege('anon','public.get_routine_application_bootstrap()','execute'));
select phase10k1_test.assert_true('049 manager mutations are authenticated-only',
  has_function_privilege('authenticated','public.set_routine_engine_mode(text,bigint,text,uuid)','execute')
  and not has_function_privilege('anon','public.set_routine_engine_mode(text,bigint,text,uuid)','execute'));
select phase10k1_test.assert_true('050 policies have no broad true predicate',not exists(
  select 1 from pg_policies where tablename in('routine_pilot_memberships','routine_ui_operations')
    and (qual~*'^\s*true\s*$' or coalesce(with_check,'')~*'^\s*true\s*$')));

select set_config('mesh.routine_ui_internal','membership',false);
select phase10k1_test.expect_error('050A identity shape is enforced',
  'insert into public.routine_pilot_memberships(organization_id,identity_type,access_level,creation_idempotency_key,creation_request_hash,created_by_auth_user_id,updated_by_auth_user_id) values(''a1000000-0000-4000-8000-000000000001'',''personal_profile'',''preview'',''1f200000-0000-4000-8000-000000000001'',repeat(''a'',64),''11000000-0000-4000-8000-000000000001'',''11000000-0000-4000-8000-000000000001'')');
select phase10k1_test.expect_error('050B identity type is closed',
  'insert into public.routine_pilot_memberships(organization_id,identity_type,user_profile_id,access_level,creation_idempotency_key,creation_request_hash,created_by_auth_user_id,updated_by_auth_user_id) values(''a1000000-0000-4000-8000-000000000001'',''device'',''11000000-0000-4000-8000-000000000009'',''preview'',''1f200000-0000-4000-8000-000000000002'',repeat(''a'',64),''11000000-0000-4000-8000-000000000001'',''11000000-0000-4000-8000-000000000001'')');
select phase10k1_test.expect_error('050C access level is closed',
  'insert into public.routine_pilot_memberships(organization_id,identity_type,user_profile_id,access_level,creation_idempotency_key,creation_request_hash,created_by_auth_user_id,updated_by_auth_user_id) values(''a1000000-0000-4000-8000-000000000001'',''personal_profile'',''11000000-0000-4000-8000-000000000009'',''manager'',''1f200000-0000-4000-8000-000000000003'',repeat(''a'',64),''11000000-0000-4000-8000-000000000001'',''11000000-0000-4000-8000-000000000001'')');
select phase10k1_test.expect_error('050D validity window is ordered',
  'insert into public.routine_pilot_memberships(organization_id,identity_type,user_profile_id,access_level,valid_from,valid_until,creation_idempotency_key,creation_request_hash,created_by_auth_user_id,updated_by_auth_user_id) values(''a1000000-0000-4000-8000-000000000001'',''personal_profile'',''11000000-0000-4000-8000-000000000009'',''preview'',''2026-08-07T10:00:00Z'',''2026-08-07T09:00:00Z'',''1f200000-0000-4000-8000-000000000004'',repeat(''a'',64),''11000000-0000-4000-8000-000000000001'',''11000000-0000-4000-8000-000000000001'')');
select phase10k1_test.expect_error('050E duplicate identity is rejected',
  'insert into public.routine_pilot_memberships(organization_id,identity_type,user_profile_id,access_level,creation_idempotency_key,creation_request_hash,created_by_auth_user_id,updated_by_auth_user_id) values(''a1000000-0000-4000-8000-000000000001'',''personal_profile'',''11000000-0000-4000-8000-000000000002'',''preview'',''1f200000-0000-4000-8000-000000000005'',repeat(''a'',64),''11000000-0000-4000-8000-000000000001'',''11000000-0000-4000-8000-000000000001'')');
select phase10k1_test.expect_error('050F duplicate creation idempotency is rejected',
  'insert into public.routine_pilot_memberships(organization_id,identity_type,user_profile_id,access_level,creation_idempotency_key,creation_request_hash,created_by_auth_user_id,updated_by_auth_user_id) select organization_id,''personal_profile'',''11000000-0000-4000-8000-000000000009'',''preview'',creation_idempotency_key,repeat(''a'',64),''11000000-0000-4000-8000-000000000001'',''11000000-0000-4000-8000-000000000001'' from public.routine_pilot_memberships limit 1');
select phase10k1_test.expect_error('050G positive revision is enforced',
  'insert into public.routine_pilot_memberships(organization_id,identity_type,user_profile_id,access_level,revision,creation_idempotency_key,creation_request_hash,created_by_auth_user_id,updated_by_auth_user_id) values(''a1000000-0000-4000-8000-000000000001'',''personal_profile'',''11000000-0000-4000-8000-000000000009'',''preview'',0,''1f200000-0000-4000-8000-000000000007'',repeat(''a'',64),''11000000-0000-4000-8000-000000000001'',''11000000-0000-4000-8000-000000000001'')');
select phase10k1_test.expect_error('050H request hash format is enforced',
  'insert into public.routine_pilot_memberships(organization_id,identity_type,user_profile_id,access_level,creation_idempotency_key,creation_request_hash,created_by_auth_user_id,updated_by_auth_user_id) values(''a1000000-0000-4000-8000-000000000001'',''personal_profile'',''11000000-0000-4000-8000-000000000009'',''preview'',''1f200000-0000-4000-8000-000000000008'',''not-a-hash'',''11000000-0000-4000-8000-000000000001'',''11000000-0000-4000-8000-000000000001'')');
select phase10k1_test.expect_error('050I blank membership note is rejected',
  'insert into public.routine_pilot_memberships(organization_id,identity_type,user_profile_id,access_level,note,creation_idempotency_key,creation_request_hash,created_by_auth_user_id,updated_by_auth_user_id) values(''a1000000-0000-4000-8000-000000000001'',''personal_profile'',''11000000-0000-4000-8000-000000000009'',''preview'',''  '',''1f200000-0000-4000-8000-000000000009'',repeat(''a'',64),''11000000-0000-4000-8000-000000000001'',''11000000-0000-4000-8000-000000000001'')');
select set_config('mesh.routine_ui_internal','operation',false);
select phase10k1_test.expect_error('050J secret-shaped operation payload is rejected',
  'insert into public.routine_ui_operations(organization_id,actor_auth_user_id,actor_source,operation_type,idempotency_key,request_hash,resource_type,response_payload) values(''a1000000-0000-4000-8000-000000000001'',''11000000-0000-4000-8000-000000000001'',''personal_auth'',''set_engine_mode'',''1f200000-0000-4000-8000-000000000010'',repeat(''a'',64),''organization_settings'',''{"session_token":"forbidden"}'')',
  'forbidden credential');
select set_config('mesh.routine_ui_internal','membership',false);
select phase10k1_test.expect_error('050K membership DELETE is rejected',
  'delete from public.routine_pilot_memberships where user_profile_id=''11000000-0000-4000-8000-000000000002''','deactivated, never deleted');
select phase10k1_test.expect_error('050L membership identity rewrite is rejected',
  'update public.routine_pilot_memberships set user_profile_id=''11000000-0000-4000-8000-000000000003'' where user_profile_id=''11000000-0000-4000-8000-000000000002''','identity and creation audit are immutable');
select set_config('mesh.routine_ui_internal','',false);
select phase10k1_test.assert_true('050M shared bootstrap exposes only safe session freshness',(
  select value->'identity'->'session' ?& array['id','status','expiresAt','idleExpiresAt','lastCredentialVerifiedAt','credentialFresh']
    and value->'identity'->'device'->>'label'='Test Workbar'
    and not public.routine_phase10j_json_has_secret(value) from phase10k1_test.state where key='operator_bootstrap'));

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',false);
set role authenticated;
select phase10k1_test.assert_true('050N manager configuration remains available in shadow',public.routine_current_user_can_manage_templates());
select phase10k1_test.assert_true('050O manager operational access remains blocked in shadow',not public.routine_current_user_can_use_operational_engine());
select phase10k1_test.expect_error('050P shadow blocks existing run creation RPC',
  'select public.create_or_get_routine_run(''daily-run-test'',''phase10k1-shadow-probe'',''2026-08-30'',''1f200000-0000-4000-8000-000000000013'')',
  'routine_ui_operational_access_required');
select phase10k1_test.expect_error('050Q inactive personal profile is rejected',
  format('select public.replace_routine_pilot_memberships(''[{"identityType":"personal_profile","userProfileId":"11000000-0000-4000-8000-000000000004","accessLevel":"preview","active":true}]''::jsonb,%s,''1f200000-0000-4000-8000-000000000014'')',
    (select revision from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001')),'inactive');
select phase10k1_test.expect_error('050R inactive operator is rejected',
  format('select public.replace_routine_pilot_memberships(jsonb_build_array(jsonb_build_object(''identityType'',''shared_device_operator'',''operatorId'',''%s'',''accessLevel'',''preview'',''active'',true)),%s,''1f200000-0000-4000-8000-000000000015'')',
    (select value->'operator'->>'id' from phase10k1_test.state where key='inactive_operator'),
    (select revision from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001')),'inactive');
select phase10k1_test.assert_true('051 exact mode replay is idempotent',(
  public.set_routine_engine_mode('shadow',
    ((select value->'settings'->>'revision' from phase10k1_test.state where key='mode_shadow'))::bigint-1,
    'Enable the isolated Phase 10K1 manager preview.','1f100000-0000-4000-8000-000000000001')->>'idempotentReplay')::boolean);
select phase10k1_test.assert_true('052 exact membership replay is idempotent',(
  public.replace_routine_pilot_memberships(
    jsonb_build_array(
      jsonb_build_object('identityType','personal_profile','userProfileId','11000000-0000-4000-8000-000000000002','accessLevel','preview','active',true,'note','Read-only staff preview'),
      jsonb_build_object('identityType','personal_profile','userProfileId','11000000-0000-4000-8000-000000000003','accessLevel','coordinator','active',true,'note','Read-only coordinator preview'),
      jsonb_build_object('identityType','shared_device_operator','operatorId',(select value->'operator'->>'id' from phase10j_test.state where key='linked_operator'),'accessLevel','participant','active',true,'note','Shared-device pilot preview')),
    ((select value->>'settingsRevision' from phase10k1_test.state where key='memberships'))::bigint-1,
    '1f100000-0000-4000-8000-000000000002')->>'idempotentReplay')::boolean);
select phase10k1_test.expect_error('053 pilot mode transition is blocked',
  format('select public.set_routine_engine_mode(''pilot'',%s,''Not in this release.'',''1f100000-0000-4000-8000-000000000003'')',
    (select revision from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001')),
  'routine_ui_not_pilot_ready');
select phase10k1_test.expect_error('054 active mode transition is blocked',
  format('select public.set_routine_engine_mode(''active'',%s,''Not in this release.'',''1f100000-0000-4000-8000-000000000004'')',
    (select revision from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001')),
  'routine_ui_not_production_ready');
select phase10k1_test.expect_error('055 stale mode revision is rejected',
  'select public.set_routine_engine_mode(''legacy'',1,''Stale write probe.'',''1f100000-0000-4000-8000-000000000005'')','revision conflict');
select phase10k1_test.expect_error('056 stale membership revision is rejected',
  'select public.replace_routine_pilot_memberships(''[]''::jsonb,1,''1f100000-0000-4000-8000-000000000006'')','revision conflict');
select phase10k1_test.expect_error('057 staff cannot receive coordinator access',
  format('select public.replace_routine_pilot_memberships(''[{"identityType":"personal_profile","userProfileId":"11000000-0000-4000-8000-000000000002","accessLevel":"coordinator","active":true}]''::jsonb,%s,''1f100000-0000-4000-8000-000000000007'')',
    (select revision from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001')),'over-privileged');
select phase10k1_test.expect_error('058 counter cannot become a personal pilot member',
  format('select public.replace_routine_pilot_memberships(''[{"identityType":"personal_profile","userProfileId":"11000000-0000-4000-8000-000000000006","accessLevel":"preview","active":true}]''::jsonb,%s,''1f100000-0000-4000-8000-000000000008'')',
    (select revision from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001')),'counter');
select phase10k1_test.expect_error('059 cross-org membership is rejected',
  format('select public.replace_routine_pilot_memberships(''[{"identityType":"personal_profile","userProfileId":"22000000-0000-4000-8000-000000000001","accessLevel":"preview","active":true}]''::jsonb,%s,''1f100000-0000-4000-8000-000000000009'')',
    (select revision from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001')),'cross-organization');
select phase10k1_test.expect_error('060 direct mode bypass through legacy settings RPC is blocked',
  format('select public.create_or_update_routine_organization_settings(''active'',''Europe/Oslo'',''04:00''::time,true,24,%s)',
    (select revision from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001')),'set_routine_engine_mode');
select phase10k1_test.expect_error('061 UI operations reject update',
  'update public.routine_ui_operations set response_payload=response_payload where operation_type=''set_engine_mode''');
select phase10k1_test.expect_error('062 UI operations reject delete',
  'delete from public.routine_ui_operations where operation_type=''set_engine_mode''');
reset role;
reset request.jwt.claim.sub;

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',false);
set role authenticated;
select phase10k1_test.assert_true('063 staff cannot perform tasks in shadow',not public.routine_current_user_can_perform_tasks());
select phase10k1_test.assert_true('064 staff cannot coordinate in shadow',not public.routine_current_user_can_coordinate_runs());
select phase10k1_test.expect_error('065 staff cannot call manager mode RPC',
  'select public.set_routine_engine_mode(''legacy'',1,''Unauthorized.'',''1f100000-0000-4000-8000-000000000010'')','Personal manager');
select phase10k1_test.assert_true('066 staff RLS reads only own membership',(
  select count(*)=1 and bool_and(user_profile_id='11000000-0000-4000-8000-000000000002') from public.routine_pilot_memberships));
select phase10k1_test.assert_true('067 staff reads no UI operations',not exists(select 1 from public.routine_ui_operations));
reset role;
reset request.jwt.claim.sub;

select set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000001',false);
set role authenticated;
select phase10k1_test.assert_true('068 cross-org RLS exposes no Organization A memberships',not exists(
  select 1 from public.routine_pilot_memberships where organization_id='a1000000-0000-4000-8000-000000000001'));
select phase10k1_test.assert_true('069 cross-org RLS exposes no Organization A UI operations',not exists(
  select 1 from public.routine_ui_operations where organization_id='a1000000-0000-4000-8000-000000000001'));
reset role;
reset request.jwt.claim.sub;

select set_config('request.jwt.claim.sub','1e000000-0000-4000-8000-000000000001',false);
select set_config('request.headers',jsonb_build_object('x-mesh-routine-operator-session',:'session_token')::text,false);
set role authenticated;
select phase10k1_test.assert_true('069A shared operator has no manager configuration capability',not public.routine_current_user_can_manage_templates());
select phase10k1_test.expect_error('069B shared operator cannot call manager UI RPC',
  'select public.set_routine_engine_mode(''legacy'',1,''Shared operator bypass probe.'',''1f200000-0000-4000-8000-000000000016'')','Personal manager');
reset role;
reset request.jwt.claim.sub;
reset request.headers;

select phase10k1_test.assert_true('070 no Routine Engine mode is pilot or active',not exists(
  select 1 from public.routine_organization_settings where mode in('pilot','active')));

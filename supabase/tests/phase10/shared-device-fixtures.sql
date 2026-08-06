-- Phase 10J fixtures. The verifier supplies test_pin, session_secret_hash and
-- session_token at runtime; no credential or token is embedded in this file.
create schema if not exists phase10j_test;
create table if not exists phase10j_test.state(key text primary key,value jsonb not null);
grant usage on schema phase10j_test to authenticated;
grant select,insert,update on phase10j_test.state to authenticated;

insert into auth.users(id) values
  ('1e000000-0000-4000-8000-000000000001'),
  ('2e000000-0000-4000-8000-000000000001') on conflict do nothing;
insert into public.user_profiles(id,organization_id,display_name,role,active,is_shared_device,shared_device_label)
values
  ('1e000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Routine Shared Device','staff',true,true,'Test workbar'),
  ('2e000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','Cross-org Shared Device','staff',true,true,'Other test workbar')
on conflict(id) do nothing;

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',false);
set role authenticated;
insert into phase10j_test.state(key,value) values('device',public.register_routine_shared_device(
  '1e000000-0000-4000-8000-000000000001','workbar-test-01','Test Workbar',
  '{"absoluteSessionMinutes":480,"idleTimeoutMinutes":30,"criticalReauthMinutes":5,"maxFailedAttempts":5,"failureWindowMinutes":15,"lockoutMinutes":15,"allowOfflineNoncriticalDrafts":true}'::jsonb,
  '1e100000-0000-4000-8000-000000000001')) on conflict(key) do update set value=excluded.value;
insert into phase10j_test.state(key,value) values('linked_operator',public.create_routine_operator(
  'linked-staff-01','linked_profile','11000000-0000-4000-8000-000000000002','Linked Test Operator','staff',null,null,
  :'test_pin','1e100000-0000-4000-8000-000000000002')) on conflict(key) do update set value=excluded.value;
insert into phase10j_test.state(key,value) values('temporary_operator',public.create_routine_operator(
  'temporary-staff-01','temporary',null,'Temporary Test Operator','staff',null,clock_timestamp()+interval '8 hours',
  :'test_pin','1e100000-0000-4000-8000-000000000003')) on conflict(key) do update set value=excluded.value;

insert into phase10j_test.state(key,value)
select 'access',public.replace_routine_shared_device_operator_access(
  (select (value->'device'->>'id')::uuid from phase10j_test.state where key='device'),
  jsonb_build_array(
    jsonb_build_object('operatorId',(select value->'operator'->>'id' from phase10j_test.state where key='linked_operator'),
      'sortOrder',1,'allowTaskActions',true,'allowCriticalActions',true,'allowRunCoordination',false,
      'allowEventTransferActions',false,'allowOfflineNoncritical',true),
    jsonb_build_object('operatorId',(select value->'operator'->>'id' from phase10j_test.state where key='temporary_operator'),
      'sortOrder',2,'allowTaskActions',true,'allowCriticalActions',false,'allowRunCoordination',false,
      'allowEventTransferActions',false,'allowOfflineNoncritical',true)),
  1,'1e100000-0000-4000-8000-000000000004')
on conflict(key) do update set value=excluded.value;
reset role;
reset request.jwt.claim.sub;

select set_config('request.jwt.claim.sub','1e000000-0000-4000-8000-000000000001',false);
set role authenticated;
insert into phase10j_test.state(key,value) values('client',public.register_routine_client_instance(
  '1e200000-0000-4000-8000-000000000001','phase10j-test','phase10j-v1','node-test',
  '1e200000-0000-4000-8000-000000000002')) on conflict(key) do update set value=excluded.value;
insert into phase10j_test.state(key,value) values('available',public.list_available_routine_operators(
  '1e200000-0000-4000-8000-000000000001')) on conflict(key) do update set value=excluded.value;
insert into phase10j_test.state(key,value)
select 'authenticated',public.authenticate_routine_operator(
  '1e200000-0000-4000-8000-000000000001',(select (value->'operator'->>'id')::uuid from phase10j_test.state where key='linked_operator'),
  '1e300000-0000-4000-8000-000000000001',:'session_secret_hash',:'test_pin',
  '1e300000-0000-4000-8000-000000000002')
on conflict(key) do update set value=excluded.value;
select set_config('request.headers',jsonb_build_object('x-mesh-routine-operator-session',:'session_token')::text,false);
insert into phase10j_test.state(key,value) values('session',public.get_current_routine_operator_session())
  on conflict(key) do update set value=excluded.value;
insert into phase10j_test.state(key,value) values('session_context',public.get_routine_operator_session_context())
  on conflict(key) do update set value=excluded.value;
reset role;
reset request.jwt.claim.sub;
reset request.headers;

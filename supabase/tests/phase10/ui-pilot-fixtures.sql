-- Phase 10K1 disposable fixtures. All identities and rows already belong to
-- the isolated Phase 10A-10J verifier database.
create schema if not exists phase10k1_test;
create table if not exists phase10k1_test.state(key text primary key,value jsonb not null);
grant usage on schema phase10k1_test to authenticated;
grant select,insert,update on phase10k1_test.state to authenticated;

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',false);
set role authenticated;

insert into phase10k1_test.state(key,value)
values('mode_shadow',public.set_routine_engine_mode(
  'shadow',(public.get_routine_application_bootstrap()->>'settingsRevision')::bigint,
  'Enable the isolated Phase 10K1 manager preview.','1f100000-0000-4000-8000-000000000001'));

insert into phase10k1_test.state(key,value)
values('inactive_operator',public.create_routine_operator(
  'phase10k1-inactive-operator','temporary',null,'Inactive Pilot Operator','staff',null,clock_timestamp()+interval '8 hours',
  :'test_pin','1f100000-0000-4000-8000-000000000011'));
insert into phase10k1_test.state(key,value)
select 'inactive_operator_disabled',public.set_routine_operator_active(
  (select (value->'operator'->>'id')::uuid from phase10k1_test.state where key='inactive_operator'),false,
  'Disposable inactive-membership validation fixture.',
  (select (value->'operator'->>'revision')::bigint from phase10k1_test.state where key='inactive_operator'),
  '1f100000-0000-4000-8000-000000000012');

select public.create_or_update_routine_organization_settings(
  'shadow','Europe/Oslo','04:00'::time,true,24,
  (select revision from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001'));

insert into phase10k1_test.state(key,value)
values('memberships',public.replace_routine_pilot_memberships(
  jsonb_build_array(
    jsonb_build_object('identityType','personal_profile','userProfileId','11000000-0000-4000-8000-000000000002',
      'accessLevel','preview','active',true,'note','Read-only staff preview'),
    jsonb_build_object('identityType','personal_profile','userProfileId','11000000-0000-4000-8000-000000000003',
      'accessLevel','coordinator','active',true,'note','Read-only coordinator preview'),
    jsonb_build_object('identityType','shared_device_operator',
      'operatorId',(select value->'operator'->>'id' from phase10j_test.state where key='linked_operator'),
      'accessLevel','participant','active',true,'note','Shared-device pilot preview')
  ),
  (select revision from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001'),
  '1f100000-0000-4000-8000-000000000002'));

insert into phase10k1_test.state(key,value)
values('manager_bootstrap',public.get_routine_application_bootstrap());
insert into phase10k1_test.state(key,value)
values('admin_workspace',public.get_routine_pilot_admin_workspace());
reset role;
reset request.jwt.claim.sub;

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',false);
set role authenticated;
insert into phase10k1_test.state(key,value) values('staff_bootstrap',public.get_routine_application_bootstrap());
reset role;
reset request.jwt.claim.sub;

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000009',false);
set role authenticated;
insert into phase10k1_test.state(key,value) values('nonmember_bootstrap',public.get_routine_application_bootstrap());
reset role;
reset request.jwt.claim.sub;

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000006',false);
set role authenticated;
insert into phase10k1_test.state(key,value) values('counter_bootstrap',public.get_routine_application_bootstrap());
reset role;
reset request.jwt.claim.sub;

select set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000001',false);
set role authenticated;
insert into phase10k1_test.state(key,value) values('legacy_bootstrap',public.get_routine_application_bootstrap());
reset role;
reset request.jwt.claim.sub;

select set_config('request.jwt.claim.sub','1e000000-0000-4000-8000-000000000001',false);
set role authenticated;
insert into phase10k1_test.state(key,value) values('device_bootstrap',public.get_routine_application_bootstrap());
insert into phase10k1_test.state(key,value) values('available_operators',public.list_available_routine_operators(
  '1e200000-0000-4000-8000-000000000001'));
select set_config('request.headers',jsonb_build_object('x-mesh-routine-operator-session',:'session_token')::text,false);
insert into phase10k1_test.state(key,value) values('operator_bootstrap',public.get_routine_application_bootstrap());
reset role;
reset request.jwt.claim.sub;
reset request.headers;

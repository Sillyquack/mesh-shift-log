-- Phase 10I fixtures run only in the disposable verifier database.
create schema if not exists phase10i_test;
create table if not exists phase10i_test.state(key text primary key,value jsonb not null);
grant usage on schema phase10i_test to authenticated;
grant select,insert,update on phase10i_test.state to authenticated;

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',false);
set role authenticated;

insert into phase10i_test.state(key,value) values('client_registration',
  public.register_routine_client_instance(
    '1d000000-0000-4000-8000-000000000001','test-app-10i','phase10i-v1','node-test',
    '1d000000-0000-4000-8000-000000000002'))
on conflict(key) do update set value=excluded.value;

reset role;
reset request.jwt.claim.sub;

select set_config('mesh.routine_sync_internal','fixture',false);
select public.routine_phase10i_record_receipt(
  jsonb_build_object(
    'organizationId',(select organization_id from public.user_profiles where id='11000000-0000-4000-8000-000000000001'),
    'authUserId','11000000-0000-4000-8000-000000000001',
    'profileId','11000000-0000-4000-8000-000000000001',
    'displayName','Phase 10 Manager','role','manager'),
  '1d000000-0000-4000-8000-000000000001','1d000000-0000-4000-8000-000000000003',
  'task_bundle',public.routine_phase10i_request_hash('{"fixture":true}'::jsonb),'rejected','task',null,
  '{}'::jsonb,'{"conflictCode":"fixture_rejected"}'::jsonb,null);

insert into phase10i_test.state(key,value) values('schema_fingerprint',jsonb_build_object(
  'instances',(select count(*) from public.routine_client_instances),
  'receipts',(select count(*) from public.routine_offline_operation_receipts),
  'events',(select count(*) from public.routine_events)))
on conflict(key) do update set value=excluded.value;

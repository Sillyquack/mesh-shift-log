-- Phase 10L fixtures execute only in the network-isolated disposable verifier.
create schema if not exists phase10l_test;
create table if not exists phase10l_test.state(key text primary key,value jsonb not null);
grant usage on schema phase10l_test to authenticated;
grant select,insert,update on phase10l_test.state to authenticated;

insert into phase10l_test.state(key,value) values('before_state',jsonb_build_object(
  'mode',(select mode from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001'),
  'stage',(select ui_release_stage from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001'),
  'runs',(select count(*) from public.routine_runs where organization_id='a1000000-0000-4000-8000-000000000001'),
  'bundles',(select count(*) from public.routine_bundles where organization_id='a1000000-0000-4000-8000-000000000001'),
  'deliveries',(select count(*) from public.routine_delivery_records where organization_id='a1000000-0000-4000-8000-000000000001')));

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',false);
set role authenticated;
insert into phase10l_test.state(key,value) values('preview',public.preview_mesh_routine_content_pack_v1());
insert into phase10l_test.state(key,value)
select 'install',public.install_mesh_routine_content_pack_v1(value->>'organizationStateHash','Install authoritative editable Mesh drafts.','5a100000-0000-4000-8000-000000000001')
from phase10l_test.state where key='preview';
insert into phase10l_test.state(key,value)
select 'replay',public.install_mesh_routine_content_pack_v1(
  (select value->>'organizationStateHash' from phase10l_test.state where key='preview'),
  'Install authoritative editable Mesh drafts.','5a100000-0000-4000-8000-000000000001');
insert into phase10l_test.state(key,value) values('installed_preview',public.preview_mesh_routine_content_pack_v1());
insert into phase10l_test.state(key,value)
select 'already_installed',public.install_mesh_routine_content_pack_v1(value->>'organizationStateHash','Confirm existing editable Mesh content.','5a100000-0000-4000-8000-000000000002')
from phase10l_test.state where key='installed_preview';
insert into phase10l_test.state(key,value) values('audit',public.get_mesh_routine_content_pack_audit());
insert into phase10l_test.state(key,value) values('readiness',public.get_routine_release_readiness());
reset role;
reset request.jwt.claim.sub;

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',false);
set role authenticated;
do $staff_denied$
begin
  perform public.preview_mesh_routine_content_pack_v1();
  raise exception 'Staff unexpectedly received content-pack preview.';
exception when insufficient_privilege then
  insert into phase10l_test.state values('staff_denied','true'::jsonb);
end;
$staff_denied$;
reset role;
reset request.jwt.claim.sub;

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000007',false);
set role authenticated;
do $shared_denied$
begin
  perform public.preview_mesh_routine_content_pack_v1();
  raise exception 'Shared-device identity unexpectedly received manager preview.';
exception when insufficient_privilege then
  insert into phase10l_test.state values('shared_denied','true'::jsonb);
end;
$shared_denied$;
reset role;
reset request.jwt.claim.sub;

-- Cross-organization semantic conflict fixture. Exact resources may be reused,
-- but a differing stable key must block the whole preview/install transaction.
select set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000001',false);
set role authenticated;
select public.upsert_routine_location('workbar','Wrong semantic label','zone',null,0,'{}'::jsonb,null,null);
insert into phase10l_test.state(key,value) values('conflict_preview',public.preview_mesh_routine_content_pack_v1());
reset role;
reset request.jwt.claim.sub;

insert into phase10l_test.state(key,value) values('after_state',jsonb_build_object(
  'mode',(select mode from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001'),
  'stage',(select ui_release_stage from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001'),
  'runs',(select count(*) from public.routine_runs where organization_id='a1000000-0000-4000-8000-000000000001'),
  'bundles',(select count(*) from public.routine_bundles where organization_id='a1000000-0000-4000-8000-000000000001'),
  'deliveries',(select count(*) from public.routine_delivery_records where organization_id='a1000000-0000-4000-8000-000000000001')));

-- Phase 10K2 disposable Manager Control Center fixtures.
-- The verifier applies this only inside a network-isolated PostgreSQL container.
create schema if not exists phase10k2_test;
create table if not exists phase10k2_test.state(key text primary key,value jsonb not null);
grant usage on schema phase10k2_test to authenticated;
grant select,insert,update on phase10k2_test.state to authenticated;

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',false);
set role authenticated;

insert into phase10k2_test.state(key,value)
values('draft',public.create_routine_template_draft(
  (select id from public.routine_templates where organization_id='a1000000-0000-4000-8000-000000000001' and routine_key='daily-run-test'),
  (select current_published_version_id from public.routine_templates where organization_id='a1000000-0000-4000-8000-000000000001' and routine_key='daily-run-test'),
  '2f100000-0000-4000-8000-000000000001'));

insert into phase10k2_test.state(key,value)
select 'metadata',public.update_routine_draft_metadata(
  (select (value->'draft'->>'id')::uuid from phase10k2_test.state where key='draft'),
  'Daily run manager preview','Disposable K2 editor comparison.',
  (select (value->'draft'->>'revision')::bigint from phase10k2_test.state where key='draft'));

insert into phase10k2_test.state(key,value)
select 'foundation',public.get_routine_foundation_editor_workspace();
insert into phase10k2_test.state(key,value)
select 'editor',public.get_routine_template_editor_workspace(
  (select id from public.routine_templates where organization_id='a1000000-0000-4000-8000-000000000001' and routine_key='daily-run-test'),
  (select (value->'draft'->>'id')::uuid from phase10k2_test.state where key='draft'));
insert into phase10k2_test.state(key,value)
select 'diff',public.get_routine_template_version_diff(
  (select current_published_version_id from public.routine_templates where organization_id='a1000000-0000-4000-8000-000000000001' and routine_key='daily-run-test'),
  (select (value->'draft'->>'id')::uuid from phase10k2_test.state where key='draft'));
insert into phase10k2_test.state(key,value)
select 'preview',public.preview_routine_template_publication_batch(array[
  (select (value->'draft'->>'id')::uuid from phase10k2_test.state where key='draft')]);
insert into phase10k2_test.state(key,value)
select 'references',public.get_routine_reference_manager_workspace();
insert into phase10k2_test.state(key,value)
select 'readiness',public.get_routine_release_readiness();
insert into phase10k2_test.state(key,value)
select 'control_center',public.get_routine_manager_control_center();

-- Completion contract: a published Opening template is toggled only through
-- the narrow K2 RPC. All surrounding version/run/snapshot state is captured
-- before the first call for immutable-state assertions.
insert into phase10k2_test.state(key,value)
select 'template_active_before',jsonb_build_object(
  'id',template.id,'active',template.active,'revision',template.revision,
  'currentPublishedVersionId',template.current_published_version_id,
  'updatedAt',template.updated_at,'updatedBy',template.updated_by_auth_user_id,
  'publishedRowHash',md5(to_jsonb(published)::text),
  'publishedContentHash',published.content_hash,
  'draftRowHash',(select md5(to_jsonb(draft)::text) from public.routine_template_versions draft
    where draft.template_id=template.id and draft.state='draft' order by draft.version_number desc limit 1),
  'runSnapshotState',(select md5(coalesce(jsonb_agg(jsonb_build_array(run.id,run.snapshot_hash,
    run.template_content_hash_snapshot,run.timing_snapshot_hash) order by run.id),'[]'::jsonb)::text)
    from public.routine_runs run where run.organization_id=template.organization_id),
  'runCount',(select count(*) from public.routine_runs run where run.organization_id=template.organization_id),
  'taskCount',(select count(*) from public.routine_run_tasks task where task.organization_id=template.organization_id))
from public.routine_templates template
join public.routine_template_versions published on published.id=template.current_published_version_id
where template.organization_id='a1000000-0000-4000-8000-000000000001'
  and template.routine_key='delivery-opening-test';

do $reason_required$
begin
  perform public.set_routine_template_active(
    (select (value->>'id')::uuid from phase10k2_test.state where key='template_active_before'),false,
    (select (value->>'revision')::bigint from phase10k2_test.state where key='template_active_before'),
    '   ','6f100000-0000-4000-8000-000000000010');
  raise exception 'Blank template state reason unexpectedly succeeded.';
exception when invalid_parameter_value then
  insert into phase10k2_test.state(key,value) values('reason_rejected','true'::jsonb);
end $reason_required$;

insert into phase10k2_test.state(key,value)
select 'template_deactivated',public.set_routine_template_active(
  (select (value->>'id')::uuid from phase10k2_test.state where key='template_active_before'),false,
  (select (value->>'revision')::bigint from phase10k2_test.state where key='template_active_before'),
  'Pause new Opening runs during manager review.','6f100000-0000-4000-8000-000000000001');

insert into phase10k2_test.state(key,value)
select 'readiness_inactive',public.get_routine_release_readiness();

insert into phase10k2_test.state(key,value)
select 'template_deactivate_replay',public.set_routine_template_active(
  (select (value->>'id')::uuid from phase10k2_test.state where key='template_active_before'),false,
  (select (value->>'revision')::bigint from phase10k2_test.state where key='template_active_before'),
  'Pause new Opening runs during manager review.','6f100000-0000-4000-8000-000000000001');

do $changed_replay$
begin
  perform public.set_routine_template_active(
    (select (value->>'id')::uuid from phase10k2_test.state where key='template_active_before'),true,
    (select (value->>'revision')::bigint from phase10k2_test.state where key='template_active_before'),
    'Changed request with a reused key.','6f100000-0000-4000-8000-000000000001');
  raise exception 'Changed idempotent template request unexpectedly succeeded.';
exception when unique_violation then
  insert into phase10k2_test.state(key,value) values('changed_replay_rejected','true'::jsonb);
end $changed_replay$;

do $stale_revision$
begin
  perform public.set_routine_template_active(
    (select (value->>'id')::uuid from phase10k2_test.state where key='template_active_before'),true,
    (select (value->>'revision')::bigint from phase10k2_test.state where key='template_active_before'),
    'Stale manager retry remains local.','6f100000-0000-4000-8000-000000000011');
  raise exception 'Stale template revision unexpectedly succeeded.';
exception when serialization_failure then
  insert into phase10k2_test.state(key,value) values('stale_rejected',jsonb_build_object(
    'rejected',true,'serverRevision',(select revision from public.routine_templates
      where id=(select (value->>'id')::uuid from phase10k2_test.state where key='template_active_before'))));
end $stale_revision$;

insert into phase10k2_test.state(key,value)
select 'template_reactivated',public.set_routine_template_active(
  (select (value->>'id')::uuid from phase10k2_test.state where key='template_active_before'),true,
  (select (value->>'revision')::bigint from phase10k2_test.state where key='template_deactivated'),
  'Manager review complete; allow new Opening runs.','6f100000-0000-4000-8000-000000000002');

insert into phase10k2_test.state(key,value)
select 'readiness_reactivated',public.get_routine_release_readiness();

insert into phase10k2_test.state(key,value)
select 'template_active_after',jsonb_build_object(
  'active',template.active,'revision',template.revision,
  'currentPublishedVersionId',template.current_published_version_id,
  'updatedAt',template.updated_at,'updatedBy',template.updated_by_auth_user_id,
  'publishedRowHash',md5(to_jsonb(published)::text),
  'publishedContentHash',published.content_hash,
  'draftRowHash',(select md5(to_jsonb(draft)::text) from public.routine_template_versions draft
    where draft.template_id=template.id and draft.state='draft' order by draft.version_number desc limit 1),
  'runSnapshotState',(select md5(coalesce(jsonb_agg(jsonb_build_array(run.id,run.snapshot_hash,
    run.template_content_hash_snapshot,run.timing_snapshot_hash) order by run.id),'[]'::jsonb)::text)
    from public.routine_runs run where run.organization_id=template.organization_id),
  'runCount',(select count(*) from public.routine_runs run where run.organization_id=template.organization_id),
  'taskCount',(select count(*) from public.routine_run_tasks task where task.organization_id=template.organization_id))
from public.routine_templates template
join public.routine_template_versions published on published.id=template.current_published_version_id
where template.id=(select (value->>'id')::uuid from phase10k2_test.state where key='template_active_before');
reset role;
reset request.jwt.claim.sub;

do $immutable_operation$
begin
  update public.routine_ui_operations operation
  set response_payload='{"tampered":true}'::jsonb
  where operation.operation_type='set_routine_template_active';
  raise exception 'Template UI operation unexpectedly changed.';
exception when insufficient_privilege then
  insert into phase10k2_test.state(key,value) values('template_operation_immutable','true'::jsonb);
end $immutable_operation$;

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',false);
set role authenticated;
do $staff$
begin
  perform public.get_routine_manager_control_center();
  raise exception 'Staff unexpectedly opened Routine Manager.';
exception when insufficient_privilege then
  insert into phase10k2_test.state(key,value) values('staff_rejected','true'::jsonb);
end $staff$;
do $staff_mutation$
begin
  perform public.set_routine_template_active(
    (select (value->>'id')::uuid from phase10k2_test.state where key='template_active_before'),false,
    (select (value->>'revision')::bigint from phase10k2_test.state where key='template_active_after'),
    'Staff must never toggle templates.','6f100000-0000-4000-8000-000000000020');
  raise exception 'Staff unexpectedly changed template active state.';
exception when insufficient_privilege then
  insert into phase10k2_test.state(key,value) values('staff_mutation_rejected','true'::jsonb);
end $staff_mutation$;
reset role;
reset request.jwt.claim.sub;

select set_config('request.jwt.claim.sub','1e000000-0000-4000-8000-000000000001',false);
select set_config('request.headers',jsonb_build_object('x-mesh-routine-operator-session',:'session_token')::text,false);
set role authenticated;
do $shared$
begin
  perform public.get_routine_manager_control_center();
  raise exception 'Shared operator unexpectedly opened Routine Manager.';
exception when insufficient_privilege then
  insert into phase10k2_test.state(key,value) values('shared_rejected','true'::jsonb);
end $shared$;
do $shared_mutation$
begin
  perform public.set_routine_template_active(
    (select (value->>'id')::uuid from phase10k2_test.state where key='template_active_before'),false,
    (select (value->>'revision')::bigint from phase10k2_test.state where key='template_active_after'),
    'Shared operator must never toggle templates.','6f100000-0000-4000-8000-000000000021');
  raise exception 'Shared operator unexpectedly changed template active state.';
exception when insufficient_privilege then
  insert into phase10k2_test.state(key,value) values('shared_mutation_rejected','true'::jsonb);
end $shared_mutation$;
reset role;
reset request.jwt.claim.sub;
reset request.headers;

select set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000001',false);
set role authenticated;
do $cross_org$
begin
  perform public.get_routine_template_editor_workspace(
    (select id from public.routine_templates where organization_id='a1000000-0000-4000-8000-000000000001' and routine_key='daily-run-test'),null);
  raise exception 'Cross-organization template unexpectedly opened.';
exception when others then
  if sqlstate not in ('P0001','42501') then raise; end if;
  insert into phase10k2_test.state(key,value) values('cross_org_rejected','true'::jsonb);
end $cross_org$;
do $cross_org_mutation$
begin
  perform public.set_routine_template_active(
    (select (value->>'id')::uuid from phase10k2_test.state where key='template_active_before'),false,
    (select (value->>'revision')::bigint from phase10k2_test.state where key='template_active_after'),
    'Cross organization manager must be rejected.','6f100000-0000-4000-8000-000000000022');
  raise exception 'Cross-organization manager unexpectedly changed template active state.';
exception when others then
  if sqlstate not in ('P0001','42501') then raise; end if;
  insert into phase10k2_test.state(key,value) values('cross_org_mutation_rejected','true'::jsonb);
end $cross_org_mutation$;
reset role;
reset request.jwt.claim.sub;

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000004',false);
set role authenticated;
do $inactive_manager$
begin
  perform public.set_routine_template_active(
    (select (value->>'id')::uuid from phase10k2_test.state where key='template_active_before'),false,
    (select (value->>'revision')::bigint from phase10k2_test.state where key='template_active_after'),
    'Inactive manager must be rejected.','6f100000-0000-4000-8000-000000000023');
  raise exception 'Inactive manager unexpectedly changed template active state.';
exception when insufficient_privilege then
  insert into phase10k2_test.state(key,value) values('inactive_manager_rejected','true'::jsonb);
end $inactive_manager$;
reset role;
reset request.jwt.claim.sub;

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000005',false);
set role authenticated;
do $organizationless_manager$
begin
  perform public.set_routine_template_active(
    (select (value->>'id')::uuid from phase10k2_test.state where key='template_active_before'),false,
    (select (value->>'revision')::bigint from phase10k2_test.state where key='template_active_after'),
    'Organizationless manager must be rejected.','6f100000-0000-4000-8000-000000000024');
  raise exception 'Organizationless manager unexpectedly changed template active state.';
exception when insufficient_privilege then
  insert into phase10k2_test.state(key,value) values('organizationless_manager_rejected','true'::jsonb);
end $organizationless_manager$;
reset role;
reset request.jwt.claim.sub;

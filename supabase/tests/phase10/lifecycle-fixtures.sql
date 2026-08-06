-- Disposable Phase 10E lifecycle fixture. Installed only in the runner's
-- network-isolated PostgreSQL container after the existing Phase 10 fixtures.
begin;

create schema if not exists phase10e_fixture;
create table if not exists phase10e_fixture.state (
  key text primary key,
  value jsonb not null
);
grant usage on schema phase10e_fixture to authenticated;
grant select, insert, update on table phase10e_fixture.state to authenticated;

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set local role authenticated;

insert into phase10e_fixture.state (key, value) values (
  'run', public.create_or_get_routine_run(
    'daily-run-test', 'lifecycle', '2026-08-21',
    'e2000000-0000-4000-8000-000000000001'
  )
);

reset role;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', false);
set local role authenticated;

insert into phase10e_fixture.state (key, value)
select 'staff_join', public.join_routine_run(
  (select (value->'run'->>'id')::uuid from phase10e_fixture.state where key = 'run'),
  'e2000000-0000-4000-8000-000000000002'
);

reset role;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set local role authenticated;

insert into phase10e_fixture.state (key, value)
select 'run_start', public.start_routine_run(run.id, run.revision,
  'e2000000-0000-4000-8000-000000000003')
from public.routine_runs run
where run.id = (select (value->'run'->>'id')::uuid from phase10e_fixture.state where key = 'run');

reset role;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', false);
set local role authenticated;

insert into phase10e_fixture.state (key, value)
select 'task_start', public.start_routine_task(task.id, task.revision,
  'e2000000-0000-4000-8000-000000000004')
from public.routine_run_tasks task
where task.run_id = (select (value->'run'->>'id')::uuid from phase10e_fixture.state where key = 'run')
  and task.task_key_snapshot = 'task-alpha';

insert into phase10e_fixture.state (key, value)
select 'comment', public.add_routine_task_comment(task.id,
  'Phase 10E immutable fixture comment',
  'e2000000-0000-4000-8000-000000000005')
from public.routine_run_tasks task
where task.run_id = (select (value->'run'->>'id')::uuid from phase10e_fixture.state where key = 'run')
  and task.task_key_snapshot = 'task-alpha';

insert into phase10e_fixture.state (key, value)
select 'block', public.block_routine_task(task.id, 'equipment', 'fixture_block',
  'Fixture condition requiring a recorded resolution.', 'important', null,
  task.revision, 'e2000000-0000-4000-8000-000000000006')
from public.routine_run_tasks task
where task.run_id = (select (value->'run'->>'id')::uuid from phase10e_fixture.state where key = 'run')
  and task.task_key_snapshot = 'task-alpha';

reset role;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set local role authenticated;

insert into phase10e_fixture.state (key, value)
select 'resolve', public.resolve_routine_deviation(
  (select (value->'deviation'->>'id')::uuid from phase10e_fixture.state where key = 'block'),
  'Fixture blocker was resolved and retained as history.',
  (select (value->'deviation'->>'revision')::bigint from phase10e_fixture.state where key = 'block'),
  'e2000000-0000-4000-8000-000000000007'
);

insert into phase10e_fixture.state (key, value)
select 'transfer', public.propose_routine_transfer(
  task.id, 'responsibility', 'participant', null,
  (select (value->'participant'->>'id')::uuid from phase10e_fixture.state where key = 'staff_join'),
  null, 'Fixture responsibility transfer.', null, task.revision,
  'e2000000-0000-4000-8000-000000000008'
)
from public.routine_run_tasks task
where task.run_id = (select (value->'run'->>'id')::uuid from phase10e_fixture.state where key = 'run')
  and task.task_key_snapshot = 'task-alpha';

reset role;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', false);
set local role authenticated;

insert into phase10e_fixture.state (key, value)
select 'transfer_accept', public.accept_routine_transfer(
  (select (value->'transfer'->>'id')::uuid from phase10e_fixture.state where key = 'transfer'),
  (select (value->'transfer'->>'revision')::bigint from phase10e_fixture.state where key = 'transfer'),
  'e2000000-0000-4000-8000-000000000009'
);

reset role;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set local role authenticated;

insert into phase10e_fixture.state (key, value)
select 'handover', public.create_or_get_routine_handover(
  (select (value->'run'->>'id')::uuid from phase10e_fixture.state where key = 'run'),
  'responsibility_transfer', null, 'participant',
  '11000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000010'
);

insert into phase10e_fixture.state (key, value)
select 'handover_replace', public.replace_routine_handover_draft(
  (select (value->'handover'->>'id')::uuid from phase10e_fixture.state where key = 'handover'),
  'Structured fixture handover.',
  jsonb_build_array(jsonb_build_object(
    'category', 'manual_note', 'title', 'Review the transferred responsibility',
    'details', 'Manual items remain separate from regenerated items.',
    'severity', 'normal'
  )),
  (select (value->'handover'->>'revision')::bigint from phase10e_fixture.state where key = 'handover'),
  'e2000000-0000-4000-8000-000000000011'
);

insert into phase10e_fixture.state (key, value)
select 'handover_refresh', public.refresh_routine_handover_generated_items(
  (select (value->'handover'->>'id')::uuid from phase10e_fixture.state where key = 'handover_replace'),
  (select (value->'handover'->>'revision')::bigint from phase10e_fixture.state where key = 'handover_replace'),
  'e2000000-0000-4000-8000-000000000012'
);

insert into phase10e_fixture.state (key, value)
select 'handover_submit', public.submit_routine_handover(
  (select (value->'handover'->>'id')::uuid from phase10e_fixture.state where key = 'handover_refresh'),
  (select (value->'handover'->>'revision')::bigint from phase10e_fixture.state where key = 'handover_refresh'),
  'e2000000-0000-4000-8000-000000000013'
);

insert into phase10e_fixture.state (key, value)
select 'handover_accept', public.accept_routine_handover(
  (select (value->'handover'->>'id')::uuid from phase10e_fixture.state where key = 'handover_submit'),
  (select (value->'handover'->>'revision')::bigint from phase10e_fixture.state where key = 'handover_submit'),
  'e2000000-0000-4000-8000-000000000014'
);

insert into phase10e_fixture.state (key, value)
select 'correction', public.record_routine_history_correction(
  run.id, 'task', task.id, 'fixture.observation',
  '"unclear"'::jsonb, '"clarified"'::jsonb,
  'Historical correction is additive and does not rewrite the task.',
  'e2000000-0000-4000-8000-000000000015'
)
from public.routine_runs run
join public.routine_run_tasks task on task.run_id = run.id and task.task_key_snapshot = 'task-alpha'
where run.id = (select (value->'run'->>'id')::uuid from phase10e_fixture.state where key = 'run');

reset role;
commit;

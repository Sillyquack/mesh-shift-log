create schema if not exists phase10f_test;
create table if not exists phase10f_test.state (
  key text primary key,
  value text not null
);
grant usage on schema phase10f_test to authenticated;
grant select,insert,update on phase10f_test.state to authenticated;

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',false);
set role authenticated;

with response as (
  select public.create_or_get_routine_run(
    'daily-run-test','phase10f-fixture','2026-08-20',
    'fa000000-0000-4000-8000-000000000001'
  ) payload
)
insert into phase10f_test.state(key,value)
select 'run_id',payload->'run'->>'id' from response
on conflict(key) do update set value=excluded.value;

with response as (
  select public.create_or_get_routine_run(
    'daily-run-test','phase10f-phase-projection','2026-08-20',
    'fa000000-0000-4000-8000-000000000002'
  ) payload
)
insert into phase10f_test.state(key,value)
select 'phase_run_id',payload->'run'->>'id' from response
on conflict(key) do update set value=excluded.value;

reset role;

insert into phase10f_test.state(key,value)
select 'task_alpha_id',task.id::text from public.routine_run_tasks task
where task.run_id=(select value::uuid from phase10f_test.state where key='phase_run_id')
order by task.task_key_snapshot limit 1
on conflict(key) do update set value=excluded.value;

insert into phase10f_test.state(key,value)
select 'task_beta_id',task.id::text from public.routine_run_tasks task
where task.run_id=(select value::uuid from phase10f_test.state where key='phase_run_id')
order by task.task_key_snapshot desc limit 1
on conflict(key) do update set value=excluded.value;

-- A dedicated projection row gets deterministic instants for private phase
-- helper tests. The fixture is disposable and never resembles production DML.
alter table public.routine_run_task_timings disable trigger routine_run_task_timings_guard;
update public.routine_run_task_timings timing set
  schedule_state='resolved',
  visible_at='2026-08-20 06:00:00+00',
  start_at='2026-08-20 07:00:00+00',
  target_at='2026-08-20 08:00:00+00',
  overdue_at='2026-08-20 09:00:00+00',
  hard_deadline_at='2026-08-20 10:00:00+00',
  current_phase='hidden',
  last_evaluated_at='2026-08-20 05:00:00+00'
where timing.task_id=(select value::uuid from phase10f_test.state where key='task_alpha_id');
alter table public.routine_run_task_timings enable trigger routine_run_task_timings_guard;

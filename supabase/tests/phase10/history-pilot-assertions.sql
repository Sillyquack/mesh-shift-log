do $phase10k4_assertions$
declare v_readiness jsonb; v_history jsonb; v_legacy jsonb;
begin
  select value into v_readiness from phase10k4_test.state where key='manager_readiness';
  select value into v_history from phase10k4_test.state where key='manager_history';
  select value into v_legacy from phase10k4_test.state where key='manager_legacy';
  if v_readiness->>'readinessHash' !~ '^[0-9a-f]{64}$' then raise exception 'readiness hash invalid'; end if;
  raise notice 'PASS readiness hash is SHA-256';
  if (v_readiness->>'ready')::boolean then raise exception 'pre-content readiness unexpectedly green'; end if;
  raise notice 'PASS readiness remains blocked before content seeding';
  if v_readiness->>'currentStage'<>'staff_preview' then raise exception 'stage changed'; end if;
  raise notice 'PASS stage remains staff_preview';
  if v_history->>'sourceSystem'<>'routine_engine_v2' then raise exception 'v2 source missing'; end if;
  raise notice 'PASS v2 history has explicit source';
  if not exists(select 1 from phase10k4_test.state where key='manager_history_detail'
    and jsonb_typeof(value->'actions')='object') then raise exception 'manager action context missing'; end if;
  raise notice 'PASS manager history detail carries server-authoritative action context';
  if exists(select 1 from phase10k4_test.state state_row,jsonb_array_elements(state_row.value->'events') event
    where state_row.key='manager_history_detail' and event ? 'operation_id') then raise exception 'operation ledger leaked'; end if;
  raise notice 'PASS ordinary history omits operation ledger identifiers';
  if v_legacy->>'sourceSystem'<>'legacy_shift_log' then raise exception 'legacy source missing'; end if;
  raise notice 'PASS legacy history has explicit source';
  if (v_legacy->>'automaticAssignment')::boolean then raise exception 'legacy assignment enabled'; end if;
  raise notice 'PASS unscoped legacy is never assigned automatically';
  if (select value from phase10k4_test.state where key='legacy_fingerprint_before') is distinct from
     (select value from phase10k4_test.state where key='legacy_fingerprint_after') then raise exception 'legacy data mutated'; end if;
  raise notice 'PASS legacy data is byte/row stable';
  if not exists(select 1 from phase10k4_test.state where key='staff_review_rejected') then raise exception 'staff review not rejected'; end if;
  raise notice 'PASS manager review rejects staff';
  if not exists(select 1 from phase10k4_test.state where key='shared_review_rejected') then raise exception 'shared review not rejected'; end if;
  raise notice 'PASS manager review rejects shared-device operator';
  if exists(select 1 from phase10k4_test.state state_row,jsonb_array_elements(state_row.value->'items') item
    where state_row.key='cross_org_history' and exists(select 1 from public.routine_runs run
      where run.id=(item->>'id')::uuid and run.organization_id='a1000000-0000-4000-8000-000000000001')) then raise exception 'cross-org history leaked'; end if;
  raise notice 'PASS cross-organization history is isolated';
  if exists(select 1 from phase10k4_test.state state_row,jsonb_array_elements(state_row.value->'items') item
    where state_row.key='shared_history' and not exists(select 1 from public.routine_run_participants participant
      where participant.run_id=(item->>'id')::uuid and participant.operator_id=(select (value->'operator'->>'id')::uuid from phase10j_test.state where key='linked_operator'))) then raise exception 'shared operator history exceeded participation'; end if;
  raise notice 'PASS shared-device operator history is participation-limited';
  if has_table_privilege('authenticated','public.routine_release_attestations','insert') then raise exception 'direct attestation insert granted'; end if;
  raise notice 'PASS direct attestation insert is denied';
  if (select value->>'stage' from phase10k4_test.state where key='migration_release_state')<>'staff_preview'
     or (select value->>'mode' from phase10k4_test.state where key='migration_release_state')<>'shadow'
     or (select (value->>'paused')::boolean from phase10k4_test.state where key='migration_release_state') then raise exception 'migration activated release state'; end if;
  raise notice 'PASS migration itself performs no pilot, active, promotion, or pause';
  if not (select (value->>'ready')::boolean from phase10k4_test.state where key='ready_before_promotion') then raise exception 'disposable readiness not green'; end if;
  raise notice 'PASS disposable readiness becomes green after explicit fixture setup';
  if not exists(select 1 from public.routine_release_attestations where target_release_stage='pilot_ready' and status='accepted') then raise exception 'pilot attestation missing'; end if;
  raise notice 'PASS disposable personal manager creates immutable pilot-ready attestation';
  if not (select (value->>'idempotentReplay')::boolean from phase10k4_test.state where key='pilot_activation_replay') then raise exception 'pilot activation replay failed'; end if;
  raise notice 'PASS disposable pilot activation replay is idempotent after mode and revision change';
  if not exists(select 1 from phase10k4_test.state where key='paused_creation_rejected') then raise exception 'pause did not block creation'; end if;
  raise notice 'PASS disposable pilot pause blocks new run creation';
  if not exists(select 1 from phase10k4_test.state where key='paused_bundle_rejected') then raise exception 'pause did not block bundle'; end if;
  raise notice 'PASS disposable pilot pause blocks new bundle creation';
  if not exists(select 1 from phase10k4_test.state where key='paused_start_rejected') then raise exception 'pause did not block scheduled start'; end if;
  raise notice 'PASS disposable pilot pause blocks scheduled run start';
  if not exists(select 1 from phase10k4_test.state where key='active_rollback_rejected') then raise exception 'active rollback not rejected'; end if;
  raise notice 'PASS disposable pilot rollback is blocked by active work';
  if (select mode from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001')<>'shadow' then raise exception 'rollback failed'; end if;
  raise notice 'PASS disposable pilot returns to shadow after work closes';
  if (select pilot_new_work_paused from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001') then raise exception 'pause remained active'; end if;
  raise notice 'PASS disposable pause is inactive after verification';
end;
$phase10k4_assertions$;

export const PHASE10_PRODUCTION_MIGRATIONS = Object.freeze([
  'supabase/phase10a_routine_engine_foundation.sql',
  'supabase/phase10a1_routine_organization_settings_bootstrap.sql',
  'supabase/phase10b_routine_templates.sql',
  'supabase/phase10c_routine_reference_images.sql',
  'supabase/phase10d_routine_runs_and_snapshots.sql',
  'supabase/phase10e_routine_task_lifecycle.sql',
  'supabase/phase10f_routine_operational_time.sql',
  'supabase/phase10g_routine_closing_delivery.sql',
  'supabase/phase10h_routine_double_shift.sql',
  'supabase/phase10i_routine_realtime_offline_sync.sql',
  'supabase/phase10j_routine_shared_device_identity.sql',
  'supabase/phase10k1_routine_ui_pilot_gate.sql',
  'supabase/phase10k2_routine_manager_control_center.sql',
  'supabase/phase10k3_routine_employee_workflow.sql',
  'supabase/phase10k4_routine_history_pilot_hardening.sql',
  'supabase/phase10l_mesh_routine_content_pack.sql',
  'supabase/phase10p_routine_readiness_finalization.sql',
  'supabase/phase10q_mesh_routine_content_pack_1_2r.sql',
  'supabase/phase10o_routine_default_privilege_hardening.sql',
  'supabase/phase10r_mesh_routine_content_pack_1_3r.sql',
  'supabase/phase10s_mesh_routine_content_pack_1_4r.sql',
  'supabase/phase10t_routine_participant_identity_conflict_alignment.sql',
  'supabase/phase10u_routine_operation_idempotency_convergence.sql',
  'supabase/phase10v_routine_creation_idempotency_provenance_alignment.sql',
  'supabase/phase10w_event_visual_reference_bridge.sql',
]);

export const PHASE10_PRODUCTION_TERMINAL_MIGRATION =
  PHASE10_PRODUCTION_MIGRATIONS.at(-1);

export function pendingPhase10ProductionMigrations(appliedPaths = []) {
  const applied = new Set(appliedPaths.map((path) => String(path || '').trim()));
  return PHASE10_PRODUCTION_MIGRATIONS.filter((path) => !applied.has(path));
}

export function assertKnownPhase10ProductionMigration(path) {
  const normalized = String(path || '').trim();
  if (!PHASE10_PRODUCTION_MIGRATIONS.includes(normalized)) {
    throw new Error(`Unknown Phase 10 production migration: ${normalized || '(blank)'}`);
  }
  return normalized;
}

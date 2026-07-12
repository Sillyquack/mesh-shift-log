import { getCurrentSession, supabaseAuthClient } from './supabaseAuthClient.js';
import { isSupabaseConfigured, supabase } from './supabaseClient.js';

function result(ok, fields = {}) {
  return { ok, ...fields };
}

async function context() {
  if (!isSupabaseConfigured || !supabaseAuthClient)
    return result(false, { mode: 'local_fallback', message: 'Supabase not configured.' });
  const session = await getCurrentSession().catch(() => null);
  if (!session?.user?.id)
    return result(false, { mode: 'auth_required', message: 'Email login required for smart event plans.' });
  return result(true, { mode: 'authenticated', authUserId: session.user.id });
}

function organizationId() {
  return supabase.organizationId || undefined;
}

function cleanPayload(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

function normalizePlan(row) {
  if (!row) return null;
  return {
    id: row.id || '',
    organizationId: row.organization_id || '',
    eventOperationId: row.event_operation_id || '',
    status: row.status || 'suggested',
    source: row.source || 'automatic',
    title: row.title || '',
    suggestedTemplateId: row.suggested_template_id || '',
    confidence: Number(row.confidence || 0),
    detectedSignals: row.detected_signals || {},
    rationale: row.rationale || [],
    warnings: row.warnings || row.setup?.warnings || [],
    setup: row.setup || {},
    planItems: row.plan_items || [],
    guideRefs: row.guide_refs || [],
    rigRefs: row.rig_refs || [],
    version: row.version || 1,
    createdBy: row.created_by || '',
    updatedBy: row.updated_by || '',
    appliedBy: row.applied_by || '',
    appliedAt: row.applied_at || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}

function planToRow(payload = {}) {
  return cleanPayload({
    organization_id: payload.organizationId || organizationId(),
    event_operation_id: payload.eventOperationId,
    status: payload.status,
    source: payload.source,
    title: payload.title,
    suggested_template_id: payload.suggestedTemplateId,
    confidence: payload.confidence,
    detected_signals: payload.detectedSignals,
    rationale: payload.rationale,
    warnings: payload.warnings,
    setup: payload.setup,
    plan_items: payload.planItems,
    guide_refs: payload.guideRefs,
    rig_refs: payload.rigRefs,
    version: payload.version,
    updated_by: payload.updatedBy,
    applied_by: payload.appliedBy,
    applied_at: payload.appliedAt,
  });
}

export async function listEventPlans(eventOperationId) {
  const ctx = await context();
  if (!ctx.ok) return { ...ctx, records: [] };
  if (!eventOperationId) return result(false, { message: 'Event board is required.', records: [] });
  const { data, error } = await supabaseAuthClient
    .from('event_run_sheet_plans')
    .select('*')
    .eq('event_operation_id', eventOperationId)
    .order('version', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) return result(false, { mode: 'sync_error', message: error.message, error, records: [] });
  return result(true, { mode: 'authenticated', records: (data || []).map(normalizePlan).filter(Boolean), rows: data || [] });
}

export async function getCurrentEventPlan(eventOperationId) {
  const listResult = await listEventPlans(eventOperationId);
  if (!listResult.ok) return listResult;
  const current =
    listResult.records.find((plan) => ['draft', 'suggested'].includes(plan.status)) ||
    listResult.records.find((plan) => plan.status === 'applied') ||
    listResult.records[0] ||
    null;
  return result(true, { mode: 'authenticated', record: current, records: listResult.records });
}

export async function createSuggestedEventPlan(plan) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const { data, error } = await supabaseAuthClient
    .from('event_run_sheet_plans')
    .insert(planToRow({
      ...plan,
      organizationId: plan.organizationId || organizationId(),
      status: plan.status || 'suggested',
      source: plan.source || 'automatic',
      version: plan.version || 1,
    }))
    .select('*')
    .single();
  if (error) return result(false, { mode: 'sync_error', message: error.message, error });
  return result(true, { mode: 'authenticated', record: normalizePlan(data), row: data });
}

export async function updateEventPlan(planId, patch) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  if (!planId) return result(false, { message: 'Plan id is required.' });
  const { data, error } = await supabaseAuthClient
    .from('event_run_sheet_plans')
    .update(planToRow({ ...patch, updatedBy: ctx.authUserId }))
    .eq('id', planId)
    .select('*')
    .single();
  if (error) return result(false, { mode: 'sync_error', message: error.message, error });
  return result(true, { mode: 'authenticated', record: normalizePlan(data), row: data });
}

export async function dismissEventPlan(planId) {
  return updateEventPlan(planId, { status: 'dismissed' });
}

export async function markEventPlanApplied(planId) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  return updateEventPlan(planId, {
    status: 'applied',
    appliedBy: ctx.authUserId,
    appliedAt: new Date().toISOString(),
  });
}

export async function supersedePreviousPlans(eventOperationId, exceptPlanId = '') {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  if (!eventOperationId) return result(false, { message: 'Event board is required.' });
  let query = supabaseAuthClient
    .from('event_run_sheet_plans')
    .update({ status: 'superseded', updated_by: ctx.authUserId })
    .eq('event_operation_id', eventOperationId)
    .in('status', ['suggested', 'draft']);
  if (exceptPlanId) query = query.neq('id', exceptPlanId);
  const { error } = await query;
  if (error) return result(false, { mode: 'sync_error', message: error.message, error });
  return result(true, { mode: 'authenticated', message: 'Previous plans superseded.' });
}

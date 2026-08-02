import { getCurrentSession, supabaseAuthClient } from './supabaseAuthClient.js';
import { isSupabaseConfigured } from './supabaseClient.js';
import { normalizeInventoryDecimal } from '../data/inventoryStructuredQuantities.js';

const PRODUCT_COLUMNS = 'id,name,short_name,sku,barcode,category,unit_label,default_pack_size,count_mode,container_capacity_liters,supplier_name,notes,active,sort_order,millum_item_ref,ownership_status,reserve_target_override';
const LOCATION_COLUMNS = 'id,name,code,location_type,parent_location_id,zone,description,active,sort_order';
const STANDARD_COLUMNS = 'id,location_id,product_id,par_quantity,minimum_quantity,default_restock_quantity,count_order,active,notes,stock_policy,target_mode,reserve_multiplier,case_size,target_cases,target_loose_quantity,physical_recount_interval_days';
const ALIAS_COLUMNS = 'id,product_id,alias,alias_source,active';
const CATALOGUE_GROUP_COLUMNS = 'id,product_id,millum_group,group_sort_order,item_sort_order,millum_count_unit,source_occurrence_count';
const REFRIGERATOR_TEMPLATE_COLUMNS = 'id,location_id,template_status,verified_at,verified_by_name,updated_at';
const UNRESOLVED_MAPPING_COLUMNS = 'id,location_id,requested_name,requested_default_quantity,requested_count_order,candidate_millum_item_refs,reason,resolution_status,resolved_product_id';
const RESERVE_COLUMNS = 'product_id,refrigerator_default_quantity,reserve_target_override,reserve_target_quantity,combined_desired_quantity';
const COUNTER_PROFILE_COLUMNS = 'id,display_name,role,active,is_shared_device';
const COUNTER_MEMBERSHIP_COLUMNS = 'id,counter_auth_user_id,active,authorized_at,authorized_by_name,revoked_at,revoked_by_name,updated_at';
const COUNT_ASSIGNMENT_COLUMNS = 'id,session_id,location_id,counter_membership_id,state,revision,assigned_at,assigned_by_name,submitted_at,submitted_by_name,returned_at,returned_by_name,return_message,accepted_at,accepted_by_name,replaces_assignment_id,superseded_by_assignment_id,superseded_at,superseded_by_name,supersession_reason,replacement_data_action,superseded_recorded_line_count,superseded_total_line_count,updated_at';
const SESSION_COLUMNS = 'id,title,count_type,status,count_date,started_at,completed_at,approved_at,started_by_name,completed_by_name,approved_by_name,completion_note,approval_note,session_kind,original_session_id,correction_reason,correction_created_by_name,correction_created_at,finalized_with_exceptions,exception_reason,exception_skipped_count,exception_uncounted_count,exception_needs_review_count,exception_incomplete_location_count,exception_location_ids,finalized_by_name,finalized_at,updated_at';
const LINE_COLUMNS = 'id,location_id,product_id,product_name_snapshot,location_name_snapshot,unit_label_snapshot,category_snapshot,location_sort_order_snapshot,count_order_snapshot,product_sort_order_snapshot,par_quantity_snapshot,minimum_quantity_snapshot,stock_policy_snapshot,target_mode_snapshot,effective_target_quantity_snapshot,service_target_basis_snapshot,reserve_multiplier_snapshot,case_size_snapshot,target_cases_snapshot,target_loose_quantity_snapshot,physical_recount_interval_days_snapshot,previous_physical_count_quantity_snapshot,previous_physical_counted_at_snapshot,count_mode_snapshot,container_capacity_liters_snapshot,counted_whole_units,counted_open_volume_liters,counted_full_kegs,counted_partial_keg_fraction,count_full_cases,count_loose_quantity,counted_quantity,count_method,count_status,variance_quantity,restock_quantity,note,counted_at,counted_by_name,updated_at';

function exactDecimal(value) {
  return value === null || value === undefined || value === '' ? null : normalizeInventoryDecimal(value);
}

function output(ok, fields = {}) {
  return { ok, ...fields };
}

async function context() {
  if (!isSupabaseConfigured || !supabaseAuthClient) {
    return output(false, { mode: 'not_configured', message: 'Inventory backend is not configured.' });
  }
  const session = await getCurrentSession().catch(() => null);
  if (!session?.user?.id) {
    return output(false, { mode: 'auth_required', message: 'Email login is required for inventory.' });
  }
  return output(true, { mode: 'authenticated' });
}

function failure(error, fallback = 'Inventory request failed.') {
  const rawMessage = error?.message || '';
  const message = /already has an active Stock Count|inventory_count_sessions_one_active_per_org/i.test(rawMessage)
    ? 'An active Stock Count already exists. Complete and approve or cancel it before starting another.'
    : /changed on another device|current (line|session|assignment|Stock Count) version is required|current assignment revision is required/i.test(rawMessage)
      ? 'This Stock Count changed on another device. Refresh before trying again; your unsaved value is still here.'
      : /duplicate key|unique constraint/i.test(rawMessage)
        ? 'A product or location already uses that SKU, barcode, code, or relationship.'
        : /row-level security|permission denied/i.test(rawMessage)
          ? 'You do not have permission for this inventory action.'
          : rawMessage || fallback;
  return output(false, { mode: 'sync_error', message, error });
}

function rpcPayload(payload = {}) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

function hasOwn(payload, field) {
  return Object.prototype.hasOwnProperty.call(payload, field);
}

function suppliedFields(payload, fieldMap) {
  return Object.entries(fieldMap)
    .filter(([clientField]) => hasOwn(payload, clientField))
    .map(([, databaseField]) => databaseField);
}

function normalizeProduct(row) {
  return row && {
    id: row.id,
    name: row.name || '',
    shortName: row.short_name || '',
    sku: row.sku || '',
    barcode: row.barcode || '',
    category: row.category || '',
    unitLabel: row.unit_label || '',
    defaultPackSize: row.default_pack_size,
    countMode: row.count_mode || 'unit',
    containerCapacityLiters: exactDecimal(row.container_capacity_liters),
    supplierName: row.supplier_name || '',
    notes: row.notes || '',
    active: row.active !== false,
    sortOrder: row.sort_order || 0,
    millumItemRef: row.millum_item_ref || '',
    ownershipStatus: row.ownership_status || 'unverified',
    reserveTargetOverride: exactDecimal(row.reserve_target_override),
    aliases: row.aliases || [],
    millumGroups: row.millumGroups || [],
  };
}

function normalizeLocation(row) {
  return row && {
    id: row.id,
    name: row.name || '',
    code: row.code || '',
    locationType: row.location_type || '',
    parentLocationId: row.parent_location_id || '',
    zone: row.zone || '',
    description: row.description || '',
    active: row.active !== false,
    sortOrder: row.sort_order || 0,
  };
}

function normalizeStandard(row) {
  return row && {
    id: row.id,
    locationId: row.location_id,
    productId: row.product_id,
    parQuantity: Number(row.par_quantity ?? 0),
    minimumQuantity: row.minimum_quantity === null ? null : Number(row.minimum_quantity),
    defaultRestockQuantity: row.default_restock_quantity === null ? null : Number(row.default_restock_quantity),
    countOrder: row.count_order || 0,
    active: row.active !== false,
    notes: row.notes || '',
    stockPolicy: row.stock_policy || 'exact_par',
    targetMode: row.target_mode || '',
    reserveMultiplier: row.reserve_multiplier == null ? null : Number(row.reserve_multiplier),
    caseSize: row.case_size == null ? null : Number(row.case_size),
    targetCases: row.target_cases == null ? null : Number(row.target_cases),
    targetLooseQuantity: row.target_loose_quantity == null ? null : Number(row.target_loose_quantity),
    physicalRecountIntervalDays: row.physical_recount_interval_days == null ? null : Number(row.physical_recount_interval_days),
  };
}

function normalizeSession(row) {
  return row && {
    id: row.id,
    title: row.title || '',
    countType: row.count_type || '',
    status: row.status || '',
    countDate: row.count_date || '',
    startedAt: row.started_at || '',
    completedAt: row.completed_at || '',
    approvedAt: row.approved_at || '',
    startedByName: row.started_by_name || '',
    completedByName: row.completed_by_name || '',
    approvedByName: row.approved_by_name || '',
    completionNote: row.completion_note || '',
    approvalNote: row.approval_note || '',
    sessionKind: row.session_kind || 'standard',
    originalSessionId: row.original_session_id || '',
    correctionReason: row.correction_reason || '',
    correctionCreatedByName: row.correction_created_by_name || '',
    correctionCreatedAt: row.correction_created_at || '',
    finalizedWithExceptions: row.finalized_with_exceptions === true,
    exceptionReason: row.exception_reason || '',
    exceptionSkippedCount: Number(row.exception_skipped_count || 0),
    exceptionUncountedCount: Number(row.exception_uncounted_count || 0),
    exceptionNeedsReviewCount: Number(row.exception_needs_review_count || 0),
    exceptionIncompleteLocationCount: Number(row.exception_incomplete_location_count || 0),
    exceptionLocationIds: row.exception_location_ids || [],
    finalizedByName: row.finalized_by_name || '',
    finalizedAt: row.finalized_at || '',
    metadata: row.metadata || {},
    updatedAt: row.updated_at || '',
  };
}

function normalizeLine(row) {
  return row && {
    id: row.id,
    locationId: row.location_id,
    productId: row.product_id,
    productName: row.product_name_snapshot || '',
    locationName: row.location_name_snapshot || '',
    unitLabel: row.unit_label_snapshot || '',
    category: row.category_snapshot || '',
    locationSortOrderSnapshot: Number(row.location_sort_order_snapshot ?? 0),
    countOrderSnapshot: Number(row.count_order_snapshot ?? 0),
    productSortOrderSnapshot: Number(row.product_sort_order_snapshot ?? 0),
    parQuantity: Number(row.par_quantity_snapshot ?? 0),
    parQuantityExact: exactDecimal(row.par_quantity_snapshot ?? 0),
    minimumQuantity: row.minimum_quantity_snapshot === null ? null : Number(row.minimum_quantity_snapshot),
    stockPolicy: row.stock_policy_snapshot || 'exact_par',
    targetMode: row.target_mode_snapshot || '',
    effectiveTargetQuantity: row.effective_target_quantity_snapshot == null ? null : Number(row.effective_target_quantity_snapshot),
    effectiveTargetQuantityExact: exactDecimal(row.effective_target_quantity_snapshot),
    serviceTargetBasis: row.service_target_basis_snapshot == null ? null : Number(row.service_target_basis_snapshot),
    reserveMultiplier: row.reserve_multiplier_snapshot == null ? null : Number(row.reserve_multiplier_snapshot),
    caseSize: row.case_size_snapshot == null ? null : Number(row.case_size_snapshot),
    targetCases: row.target_cases_snapshot == null ? null : Number(row.target_cases_snapshot),
    targetLooseQuantity: row.target_loose_quantity_snapshot == null ? null : Number(row.target_loose_quantity_snapshot),
    physicalRecountIntervalDays: row.physical_recount_interval_days_snapshot == null ? null : Number(row.physical_recount_interval_days_snapshot),
    previousPhysicalCountQuantity: row.previous_physical_count_quantity_snapshot == null ? null : Number(row.previous_physical_count_quantity_snapshot),
    previousPhysicalCountedAt: row.previous_physical_counted_at_snapshot || '',
    countMode: row.count_mode_snapshot || 'unit',
    containerCapacityLiters: exactDecimal(row.container_capacity_liters_snapshot),
    countedWholeUnits: row.counted_whole_units == null ? null : Number(row.counted_whole_units),
    countedWholeUnitsExact: exactDecimal(row.counted_whole_units),
    countedOpenVolumeLiters: row.counted_open_volume_liters == null ? null : Number(row.counted_open_volume_liters),
    countedOpenVolumeLitersExact: exactDecimal(row.counted_open_volume_liters),
    countedFullKegs: row.counted_full_kegs == null ? null : Number(row.counted_full_kegs),
    countedFullKegsExact: exactDecimal(row.counted_full_kegs),
    countedPartialKegFraction: row.counted_partial_keg_fraction == null ? null : Number(row.counted_partial_keg_fraction),
    countedPartialKegFractionExact: exactDecimal(row.counted_partial_keg_fraction),
    countFullCases: row.count_full_cases == null ? null : Number(row.count_full_cases),
    countLooseQuantity: row.count_loose_quantity == null ? null : Number(row.count_loose_quantity),
    countedQuantity: row.counted_quantity === null ? null : Number(row.counted_quantity),
    countedQuantityExact: exactDecimal(row.counted_quantity),
    countMethod: row.count_method || 'uncounted',
    countStatus: row.count_status || 'not_counted',
    varianceQuantity: row.variance_quantity === null ? null : Number(row.variance_quantity),
    varianceQuantityExact: exactDecimal(row.variance_quantity),
    restockQuantity: row.restock_quantity === null ? null : Number(row.restock_quantity),
    restockQuantityExact: exactDecimal(row.restock_quantity),
    note: row.note || '',
    countedAt: row.counted_at || '',
    countedByName: row.counted_by_name || '',
    updatedAt: row.updated_at || '',
  };
}

function normalizeCounterMembership(row) {
  return row && {
    id: row.id,
    counterAuthUserId: row.counter_auth_user_id,
    active: row.active === true,
    authorizedAt: row.authorized_at || '',
    authorizedByName: row.authorized_by_name || '',
    revokedAt: row.revoked_at || '',
    revokedByName: row.revoked_by_name || '',
    updatedAt: row.updated_at || '',
  };
}

function normalizeCountAssignment(row) {
  return row && {
    id: row.id,
    sessionId: row.session_id,
    locationId: row.location_id,
    counterMembershipId: row.counter_membership_id,
    state: row.state || 'assigned',
    revision: Number(row.revision || 0),
    assignedAt: row.assigned_at || '',
    assignedByName: row.assigned_by_name || '',
    submittedAt: row.submitted_at || '',
    submittedByName: row.submitted_by_name || '',
    returnedAt: row.returned_at || '',
    returnedByName: row.returned_by_name || '',
    returnMessage: row.return_message || '',
    acceptedAt: row.accepted_at || '',
    acceptedByName: row.accepted_by_name || '',
    replacesAssignmentId: row.replaces_assignment_id || '',
    supersededByAssignmentId: row.superseded_by_assignment_id || '',
    supersededAt: row.superseded_at || '',
    supersededByName: row.superseded_by_name || '',
    supersessionReason: row.supersession_reason || '',
    replacementDataAction: row.replacement_data_action || '',
    supersededRecordedLineCount: row.superseded_recorded_line_count == null ? null : Number(row.superseded_recorded_line_count),
    supersededTotalLineCount: row.superseded_total_line_count == null ? null : Number(row.superseded_total_line_count),
    updatedAt: row.updated_at || '',
  };
}

function normalizeCounterLine(row) {
  return row && {
    id: row.id,
    locationId: row.location_id,
    productId: row.product_id,
    productName: row.product_name_snapshot || '',
    practicalName: row.practical_name || '',
    millumItemRef: row.millum_item_ref || '',
    unitLabel: row.unit_label_snapshot || '',
    category: row.category_snapshot || '',
    countOrderSnapshot: Number(row.count_order_snapshot || 0),
    productSortOrderSnapshot: Number(row.product_sort_order_snapshot || 0),
    countMode: row.count_mode_snapshot || 'unit',
    containerCapacityLiters: exactDecimal(row.container_capacity_liters_snapshot),
    countedWholeUnits: row.counted_whole_units == null ? null : Number(row.counted_whole_units),
    countedWholeUnitsExact: exactDecimal(row.counted_whole_units),
    countedOpenVolumeLiters: row.counted_open_volume_liters == null ? null : Number(row.counted_open_volume_liters),
    countedOpenVolumeLitersExact: exactDecimal(row.counted_open_volume_liters),
    countedFullKegs: row.counted_full_kegs == null ? null : Number(row.counted_full_kegs),
    countedFullKegsExact: exactDecimal(row.counted_full_kegs),
    countedPartialKegFraction: row.counted_partial_keg_fraction == null ? null : Number(row.counted_partial_keg_fraction),
    countedPartialKegFractionExact: exactDecimal(row.counted_partial_keg_fraction),
    countedQuantity: row.counted_quantity == null ? null : Number(row.counted_quantity),
    countedQuantityExact: exactDecimal(row.counted_quantity),
    countMethod: row.count_method || 'uncounted',
    countStatus: row.count_status || 'not_counted',
    note: row.note || '',
    countedAt: row.counted_at || '',
    countedByName: row.counted_by_name || '',
    updatedAt: row.updated_at || '',
  };
}

function normalizeCounterAssignment(row) {
  const base = normalizeCountAssignment({
    ...row,
    session_id: row.session?.id,
    location_id: row.location?.id,
  });
  return base && {
    ...base,
    session: {
      id: row.session?.id || '',
      title: row.session?.title || '',
      countDate: row.session?.count_date || '',
      status: row.session?.status || '',
      updatedAt: row.session?.updated_at || '',
    },
    location: { id: row.location?.id || '', name: row.location?.name || '' },
    lines: (row.lines || []).map(normalizeCounterLine),
  };
}

async function callRpc(name, payload, normalizeRecord) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const { data, error } = await supabaseAuthClient.rpc(name, rpcPayload(payload));
  if (error) return failure(error);
  if (normalizeRecord) {
    return output(true, { mode: 'authenticated', record: normalizeRecord(data), message: 'Saved.' });
  }
  return output(true, { mode: 'authenticated', data, message: 'Saved.' });
}

export async function loadInventoryWorkspace({ includeArchived = false } = {}) {
  const ctx = await context();
  if (!ctx.ok) return { ...ctx, products: [], locations: [], standards: [], sessions: [] };
  const productQuery = supabaseAuthClient.from('inventory_products').select(PRODUCT_COLUMNS).order('sort_order').order('name');
  const locationQuery = supabaseAuthClient.from('inventory_locations').select(LOCATION_COLUMNS).order('sort_order').order('name');
  const standardQuery = supabaseAuthClient.from('inventory_location_products').select(STANDARD_COLUMNS).order('count_order');
  const sessionQuery = supabaseAuthClient.from('inventory_count_sessions').select(SESSION_COLUMNS).order('count_date', { ascending: false }).order('started_at', { ascending: false }).limit(60);
  const aliasQuery = supabaseAuthClient.from('inventory_product_aliases').select(ALIAS_COLUMNS).eq('active', true).order('alias');
  const groupQuery = supabaseAuthClient.from('inventory_product_catalogue_groups').select(CATALOGUE_GROUP_COLUMNS).order('group_sort_order').order('item_sort_order');
  const templateQuery = supabaseAuthClient.from('inventory_refrigerator_templates').select(REFRIGERATOR_TEMPLATE_COLUMNS).order('updated_at');
  const unresolvedQuery = supabaseAuthClient.from('inventory_catalogue_unresolved_mappings').select(UNRESOLVED_MAPPING_COLUMNS).eq('resolution_status', 'unresolved').order('requested_count_order');
  const reserveQuery = supabaseAuthClient.from('inventory_refrigerator_reserve_targets').select(RESERVE_COLUMNS);
  const counterProfileQuery = supabaseAuthClient.from('user_profiles').select(COUNTER_PROFILE_COLUMNS).eq('role', 'counter').order('display_name');
  const counterMembershipQuery = supabaseAuthClient.from('inventory_counter_memberships').select(COUNTER_MEMBERSHIP_COLUMNS).order('authorized_at');
  const assignmentQuery = supabaseAuthClient.from('inventory_count_assignments').select(COUNT_ASSIGNMENT_COLUMNS).order('assigned_at');
  if (!includeArchived) {
    productQuery.eq('active', true);
    locationQuery.eq('active', true);
    standardQuery.eq('active', true);
  }
  const [products, locations, standards, sessions, aliases, groups, templates, unresolved, reserves, counterProfiles, counterMemberships, assignments] = await Promise.all([
    productQuery, locationQuery, standardQuery, sessionQuery, aliasQuery, groupQuery,
    templateQuery, unresolvedQuery, reserveQuery, counterProfileQuery, counterMembershipQuery, assignmentQuery,
  ]);
  const error = products.error || locations.error || standards.error || sessions.error
    || aliases.error || groups.error || templates.error || unresolved.error || reserves.error
    || counterProfiles.error || counterMemberships.error || assignments.error;
  if (error) return { ...failure(error), products: [], locations: [], standards: [], sessions: [] };
  const aliasesByProduct = new Map();
  for (const row of aliases.data || []) aliasesByProduct.set(row.product_id, [...(aliasesByProduct.get(row.product_id) || []), row.alias]);
  const groupsByProduct = new Map();
  for (const row of groups.data || []) groupsByProduct.set(row.product_id, [...(groupsByProduct.get(row.product_id) || []), {
    id: row.id,
    name: row.millum_group,
    groupSortOrder: Number(row.group_sort_order || 0),
    itemSortOrder: Number(row.item_sort_order || 0),
    countUnit: row.millum_count_unit || '',
    sourceOccurrenceCount: Number(row.source_occurrence_count || 1),
  }]);
  return output(true, {
    mode: 'authenticated',
    products: (products.data || []).map((row) => normalizeProduct({
      ...row,
      aliases: aliasesByProduct.get(row.id) || [],
      millumGroups: groupsByProduct.get(row.id) || [],
    })),
    locations: (locations.data || []).map(normalizeLocation),
    standards: (standards.data || []).map(normalizeStandard),
    sessions: (sessions.data || []).map(normalizeSession),
    refrigeratorTemplates: (templates.data || []).map((row) => ({
      id: row.id,
      locationId: row.location_id,
      status: row.template_status || 'incomplete',
      verifiedAt: row.verified_at || '',
      verifiedByName: row.verified_by_name || '',
      updatedAt: row.updated_at || '',
    })),
    unresolvedMappings: (unresolved.data || []).map((row) => ({
      id: row.id,
      locationId: row.location_id,
      requestedName: row.requested_name || '',
      requestedDefaultQuantity: Number(row.requested_default_quantity || 0),
      requestedCountOrder: Number(row.requested_count_order || 0),
      candidateMillumItemRefs: row.candidate_millum_item_refs || [],
      reason: row.reason || '',
      resolutionStatus: row.resolution_status || 'unresolved',
      resolvedProductId: row.resolved_product_id || '',
    })),
    reserves: (reserves.data || []).map((row) => ({
      productId: row.product_id,
      refrigeratorDefaultQuantity: Number(row.refrigerator_default_quantity || 0),
      reserveTargetOverride: row.reserve_target_override == null ? null : Number(row.reserve_target_override),
      reserveTargetQuantity: Number(row.reserve_target_quantity || 0),
      combinedDesiredQuantity: Number(row.combined_desired_quantity || 0),
    })),
    counterProfiles: (counterProfiles.data || []).map((row) => ({
      id: row.id,
      displayName: row.display_name || '',
      role: row.role || '',
      active: row.active === true,
      isSharedDevice: row.is_shared_device === true,
    })),
    counterMemberships: (counterMemberships.data || []).map(normalizeCounterMembership),
    assignments: (assignments.data || []).map(normalizeCountAssignment),
    refreshedAt: new Date().toISOString(),
  });
}

export async function loadInventoryCounterWorkspace() {
  const ctx = await context();
  if (!ctx.ok) return { ...ctx, assignments: [] };
  const { data, error } = await supabaseAuthClient.rpc('get_inventory_counter_workspace');
  if (error) return { ...failure(error), assignments: [] };
  return output(true, {
    mode: 'authenticated',
    assignments: (data?.assignments || []).map(normalizeCounterAssignment),
    refreshedAt: data?.refreshed_at || new Date().toISOString(),
  });
}

export async function getInventoryCountSession(sessionId) {
  const ctx = await context();
  if (!ctx.ok) return { ...ctx, lines: [] };
  const [sessionResult, linesResult] = await Promise.all([
    supabaseAuthClient.rpc('get_inventory_count_session_record', { input_session_id: sessionId }),
    supabaseAuthClient.from('inventory_count_lines').select(LINE_COLUMNS).eq('session_id', sessionId)
      .order('location_sort_order_snapshot').order('location_name_snapshot')
      .order('count_order_snapshot').order('product_sort_order_snapshot').order('product_name_snapshot'),
  ]);
  const error = sessionResult.error || linesResult.error;
  if (error) return { ...failure(error), lines: [] };
  return output(true, { mode: 'authenticated', record: normalizeSession(sessionResult.data), lines: (linesResult.data || []).map(normalizeLine) });
}

export function saveInventoryProduct(payload) {
  const fieldMap = {
    name: 'name', shortName: 'short_name', sku: 'sku', barcode: 'barcode',
    category: 'category', unitLabel: 'unit_label', defaultPackSize: 'default_pack_size',
    countMode: 'count_mode', containerCapacityLiters: 'container_capacity_liters',
    supplierName: 'supplier_name', notes: 'notes', active: 'active',
    sortOrder: 'sort_order', metadata: 'metadata',
  };
  return callRpc('upsert_inventory_product', {
    input_product_id: payload.id || null,
    input_name: hasOwn(payload, 'name') ? payload.name : undefined,
    input_short_name: hasOwn(payload, 'shortName') ? payload.shortName : undefined,
    input_sku: hasOwn(payload, 'sku') ? payload.sku : undefined,
    input_barcode: hasOwn(payload, 'barcode') ? payload.barcode : undefined,
    input_category: hasOwn(payload, 'category') ? payload.category : undefined,
    input_unit_label: hasOwn(payload, 'unitLabel') ? payload.unitLabel : undefined,
    input_default_pack_size: hasOwn(payload, 'defaultPackSize') ? (payload.defaultPackSize === '' ? null : payload.defaultPackSize) : undefined,
    input_count_mode: hasOwn(payload, 'countMode') ? payload.countMode : undefined,
    input_container_capacity_liters: hasOwn(payload, 'containerCapacityLiters') ? (payload.containerCapacityLiters === '' ? null : payload.containerCapacityLiters) : undefined,
    input_supplier_name: hasOwn(payload, 'supplierName') ? payload.supplierName : undefined,
    input_notes: hasOwn(payload, 'notes') ? payload.notes : undefined,
    input_active: hasOwn(payload, 'active') ? payload.active : undefined,
    input_sort_order: hasOwn(payload, 'sortOrder') ? payload.sortOrder : undefined,
    input_metadata: hasOwn(payload, 'metadata') ? payload.metadata : undefined,
    input_fields: suppliedFields(payload, fieldMap),
  }, normalizeProduct);
}

export function saveInventoryLocation(payload) {
  const fieldMap = {
    name: 'name', code: 'code', locationType: 'location_type',
    parentLocationId: 'parent_location_id', zone: 'zone', description: 'description',
    active: 'active', sortOrder: 'sort_order', metadata: 'metadata',
  };
  return callRpc('upsert_inventory_location', {
    input_location_id: payload.id || null,
    input_name: hasOwn(payload, 'name') ? payload.name : undefined,
    input_code: hasOwn(payload, 'code') ? payload.code : undefined,
    input_location_type: hasOwn(payload, 'locationType') ? payload.locationType : undefined,
    input_parent_location_id: hasOwn(payload, 'parentLocationId') ? (payload.parentLocationId || null) : undefined,
    input_zone: hasOwn(payload, 'zone') ? payload.zone : undefined,
    input_description: hasOwn(payload, 'description') ? payload.description : undefined,
    input_active: hasOwn(payload, 'active') ? payload.active : undefined,
    input_sort_order: hasOwn(payload, 'sortOrder') ? payload.sortOrder : undefined,
    input_metadata: hasOwn(payload, 'metadata') ? payload.metadata : undefined,
    input_fields: suppliedFields(payload, fieldMap),
  }, normalizeLocation);
}

export function saveInventoryStandard(payload) {
  const fieldMap = {
    locationId: 'location_id', productId: 'product_id', parQuantity: 'par_quantity',
    minimumQuantity: 'minimum_quantity', defaultRestockQuantity: 'default_restock_quantity',
    countOrder: 'count_order', active: 'active', notes: 'notes', metadata: 'metadata',
  };
  return callRpc('upsert_inventory_location_product', {
    input_location_product_id: payload.id || null,
    input_location_id: hasOwn(payload, 'locationId') ? payload.locationId : undefined,
    input_product_id: hasOwn(payload, 'productId') ? payload.productId : undefined,
    input_par_quantity: hasOwn(payload, 'parQuantity') ? payload.parQuantity : undefined,
    input_minimum_quantity: hasOwn(payload, 'minimumQuantity') ? (payload.minimumQuantity === '' ? null : payload.minimumQuantity) : undefined,
    input_default_restock_quantity: hasOwn(payload, 'defaultRestockQuantity') ? (payload.defaultRestockQuantity === '' ? null : payload.defaultRestockQuantity) : undefined,
    input_count_order: hasOwn(payload, 'countOrder') ? payload.countOrder : undefined,
    input_active: hasOwn(payload, 'active') ? payload.active : undefined,
    input_notes: hasOwn(payload, 'notes') ? payload.notes : undefined,
    input_metadata: hasOwn(payload, 'metadata') ? payload.metadata : undefined,
    input_fields: suppliedFields(payload, fieldMap),
  }, normalizeStandard);
}

export function copyInventoryStandards(payload) {
  return callRpc('copy_inventory_location_standards', {
    input_source_location_id: payload.sourceLocationId,
    input_destination_location_id: payload.destinationLocationId,
    input_overwrite_existing: payload.overwriteExisting || false,
  });
}

export function setupMeshYoungstorgetInventoryLocations() {
  return callRpc('setup_mesh_youngstorget_inventory_locations', {});
}

export function verifyInventoryRefrigeratorTemplate(locationId) {
  return callRpc('verify_inventory_refrigerator_template', { input_location_id: locationId });
}

export function saveInventoryProductReserveOverride(productId, reserveTargetOverride) {
  return callRpc('set_inventory_product_reserve_override', {
    input_product_id: productId,
    input_reserve_target_override: reserveTargetOverride === '' ? null : reserveTargetOverride,
  });
}

export function saveInventoryStandardsBulk({ locationId, rows }) {
  return callRpc('bulk_upsert_inventory_location_standards', {
    input_location_id: locationId,
    input_rows: rows,
  });
}

export function createInventoryCountSession(payload) {
  return callRpc('create_inventory_count_session', {
    input_title: payload.title,
    input_count_type: payload.countType,
    input_idempotency_key: payload.idempotencyKey,
    input_count_date: payload.countDate,
    input_location_ids: payload.locationIds,
    input_note: payload.note || null,
  });
}

export function createInventoryCorrectionSession(payload) {
  return callRpc('create_inventory_correction_session', {
    input_original_session_id: payload.originalSessionId,
    input_reason: payload.reason,
    input_idempotency_key: payload.idempotencyKey,
  });
}

export function setInventoryCountLineQuantity(payload) {
  return callRpc('set_inventory_count_line_quantity', {
    input_line_id: payload.lineId,
    input_counted_quantity: payload.countedQuantity,
    input_note: payload.note || null,
    input_expected_updated_at: payload.expectedUpdatedAt || null,
  }, normalizeLine);
}

export function setInventoryCountLineCaseQuantity(payload) {
  return callRpc('set_inventory_count_line_case_quantity', {
    input_line_id: payload.lineId,
    input_full_cases: payload.fullCases,
    input_loose_quantity: payload.looseQuantity,
    input_note: payload.note || null,
    input_expected_updated_at: payload.expectedUpdatedAt || null,
  }, normalizeLine);
}

export function setInventoryCountLineStructuredQuantity(payload) {
  return callRpc('set_inventory_count_line_structured_quantity', {
    input_line_id: payload.lineId,
    input_whole_units: payload.wholeUnits,
    input_open_volume_liters: payload.openVolumeLiters,
    input_full_kegs: payload.fullKegs,
    input_partial_keg_fraction: payload.partialKegFraction,
    input_note: payload.note || null,
    input_expected_updated_at: payload.expectedUpdatedAt || null,
  }, normalizeLine);
}

export function confirmInventoryCountLineUnchanged(payload) {
  return callRpc('confirm_inventory_count_line_unchanged', {
    input_line_id: payload.lineId,
    input_expected_updated_at: payload.expectedUpdatedAt || null,
  }, normalizeLine);
}

export function markInventoryCountLineUsePar(payload) {
  return callRpc('mark_inventory_count_line_use_par', {
    input_line_id: payload.lineId,
    input_note: payload.note || null,
    input_expected_updated_at: payload.expectedUpdatedAt || null,
  }, normalizeLine);
}

export function clearInventoryCountLine(payload) {
  return callRpc('clear_inventory_count_line', {
    input_line_id: payload.lineId,
    input_expected_updated_at: payload.expectedUpdatedAt || null,
  }, normalizeLine);
}

export function skipInventoryCountLine(payload) {
  return callRpc('skip_inventory_count_line', {
    input_line_id: payload.lineId,
    input_note: payload.note,
    input_expected_updated_at: payload.expectedUpdatedAt || null,
  }, normalizeLine);
}

export function markInventoryLocationUsePar(payload) {
  return callRpc('mark_inventory_location_use_par', {
    input_session_id: payload.sessionId,
    input_location_id: payload.locationId,
    input_replace_existing: payload.replaceExisting || false,
    input_expected_session_updated_at: payload.expectedSessionUpdatedAt || null,
  });
}

export function completeInventoryCountLocation(payload) {
  return callRpc('complete_inventory_count_location', {
    input_session_id: payload.sessionId,
    input_location_id: payload.locationId,
  });
}

export function completeInventoryCountSession(payload) {
  return callRpc('complete_inventory_count_session', {
    input_session_id: payload.sessionId,
    input_completion_note: payload.note || null,
    input_allow_exceptions: payload.allowExceptions || false,
    input_exception_reason: payload.exceptionReason || null,
  }, normalizeSession);
}

export function approveInventoryCountSession(payload) {
  return callRpc('approve_inventory_count_session', { input_session_id: payload.sessionId, input_approval_note: payload.note || null }, normalizeSession);
}

export function cancelInventoryCountSession(payload) {
  return callRpc('cancel_inventory_count_session', { input_session_id: payload.sessionId, input_reason: payload.reason }, normalizeSession);
}

export function importInventoryCatalog(payload) {
  return callRpc('import_inventory_catalog', { input_rows: payload.rows, input_overwrite_standards: payload.overwriteStandards || false });
}

export function setInventoryCounterMembership(payload) {
  return callRpc('set_inventory_counter_membership', {
    input_counter_auth_user_id: payload.counterAuthUserId,
    input_active: payload.active,
  });
}

export function createInventoryCountAssignment(payload) {
  return callRpc('create_inventory_count_assignment', {
    input_session_id: payload.sessionId,
    input_location_id: payload.locationId,
    input_counter_membership_id: payload.counterMembershipId,
    input_expected_session_updated_at: payload.expectedSessionUpdatedAt,
  });
}

export function setInventoryCounterLineQuantity(payload) {
  return callRpc('inventory_counter_set_count_line_quantity', {
    input_assignment_id: payload.assignmentId,
    input_line_id: payload.lineId,
    input_counted_quantity: payload.countedQuantity,
    input_note: payload.note || null,
    input_expected_assignment_revision: payload.expectedAssignmentRevision,
    input_expected_line_updated_at: payload.expectedLineUpdatedAt,
  });
}

export function setInventoryCounterLineStructuredQuantity(payload) {
  return callRpc('inventory_counter_set_count_line_structured_quantity', {
    input_assignment_id: payload.assignmentId,
    input_line_id: payload.lineId,
    input_whole_units: payload.wholeUnits,
    input_open_volume_liters: payload.openVolumeLiters,
    input_full_kegs: payload.fullKegs,
    input_partial_keg_fraction: payload.partialKegFraction,
    input_note: payload.note || null,
    input_expected_assignment_revision: payload.expectedAssignmentRevision,
    input_expected_line_updated_at: payload.expectedLineUpdatedAt,
  });
}

export function applyInventoryCounterRefrigeratorDefault(payload) {
  return callRpc('inventory_counter_apply_refrigerator_default', {
    input_assignment_id: payload.assignmentId,
    input_physical_confirmation: payload.physicalConfirmation === true,
    input_expected_assignment_revision: payload.expectedAssignmentRevision,
  });
}

export function submitInventoryCountAssignment(payload) {
  return callRpc('submit_inventory_count_assignment', {
    input_assignment_id: payload.assignmentId,
    input_expected_assignment_revision: payload.expectedAssignmentRevision,
    input_expected_session_updated_at: payload.expectedSessionUpdatedAt,
  });
}

export function returnInventoryCountAssignment(payload) {
  return callRpc('return_inventory_count_assignment', {
    input_assignment_id: payload.assignmentId,
    input_return_message: payload.returnMessage,
    input_expected_assignment_revision: payload.expectedAssignmentRevision,
  });
}

export function acceptInventoryCountAssignment(payload) {
  return callRpc('accept_inventory_count_assignment', {
    input_assignment_id: payload.assignmentId,
    input_expected_assignment_revision: payload.expectedAssignmentRevision,
  });
}

export function replaceInventoryCountAssignment(payload) {
  return callRpc('replace_inventory_count_assignment', {
    input_assignment_id: payload.assignmentId,
    input_replacement_counter_membership_id: payload.replacementCounterMembershipId,
    input_reason: payload.reason,
    input_data_action: payload.dataAction,
    input_confirm_clear: payload.confirmClear === true,
    input_expected_assignment_revision: payload.expectedAssignmentRevision,
  });
}

export const inventoryNormalizers = {
  normalizeProduct,
  normalizeLocation,
  normalizeStandard,
  normalizeSession,
  normalizeLine,
  normalizeCounterLine,
  normalizeCounterAssignment,
  normalizeCounterMembership,
  normalizeCountAssignment,
};

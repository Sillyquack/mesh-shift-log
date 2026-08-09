import { routineConfigurationClient } from "./routineConfigurationClient.js";
import { getRoutineFoundationEditorWorkspace, getRoutineManagerControlCenter, getRoutineReferenceManagerWorkspace, getRoutineTemplateEditorWorkspace } from "./routineManagerClient.js";
import { updateRoutineReferenceImageMetadata } from "./routineReferenceClient.js";
import { routineTemplateClient } from "./routineTemplateClient.js";
import { buildTaskPayload } from "../data/routineTemplateEditorModel.js";
import { buildRoutineProductionAmendmentPlan } from "../data/routineProductionReadinessAmendmentModel.js";
import { productionAmendmentBaseline as baselinePack, productionAmendmentTarget as providerPack } from "../data/routineProductionReadinessAmendmentManifest.js";

const value = (entry, camelKey, snakeKey = camelKey) => entry?.[camelKey] ?? entry?.[snakeKey];
const stableKey = (entry) => value(entry, "stableKey", "stable_key");
const taskKey = (entry) => value(entry, "taskKey", "task_key");
const itemKey = (entry) => value(entry, "itemKey", "item_key");
const versionRevision = (workspace) => value(workspace?.version, "revision");

function normalizeTask(task) {
  return {
    ...task,
    taskKey: taskKey(task), sectionId: value(task, "sectionId", "section_id"),
    doneCriteria: value(task, "doneCriteria", "done_criteria") || "", taskType: value(task, "taskType", "task_type"),
    initialAssessmentPolicy: value(task, "initialAssessmentPolicy", "initial_assessment_policy"),
    completionPolicy: value(task, "completionPolicy", "completion_policy"), notApplicablePolicy: value(task, "notApplicablePolicy", "not_applicable_policy"),
    verificationPolicy: value(task, "verificationPolicy", "verification_policy"), repeatPolicy: value(task, "repeatPolicy", "repeat_policy"),
    availabilityMode: value(task, "availabilityMode", "availability_mode"), conditionJson: value(task, "conditionJson", "condition_json") || {},
    locationId: value(task, "locationId", "location_id") || "", locationSetId: value(task, "locationSetId", "location_set_id") || "",
    locationDescription: value(task, "locationDescription", "location_description") || "",
    visibleDayOffset: value(task, "visibleDayOffset", "visible_day_offset") || 0, visibleFromLocalTime: value(task, "visibleFromLocalTime", "visible_from_local_time") || "",
    startDayOffset: value(task, "startDayOffset", "start_day_offset") || 0, startFromLocalTime: value(task, "startFromLocalTime", "start_from_local_time") || "",
    targetDayOffset: value(task, "targetDayOffset", "target_day_offset") || 0, targetLocalTime: value(task, "targetLocalTime", "target_local_time") || "",
    overdueDayOffset: value(task, "overdueDayOffset", "overdue_day_offset") || 0, overdueLocalTime: value(task, "overdueLocalTime", "overdue_local_time") || "",
    hardDeadlineDayOffset: value(task, "hardDeadlineDayOffset", "hard_deadline_day_offset") || 0, hardDeadlineLocalTime: value(task, "hardDeadlineLocalTime", "hard_deadline_local_time") || "",
    sortOrder: value(task, "sortOrder", "sort_order") || 0, metadata: task.metadata || {},
  };
}

function templateIdentity(controlCenter, routineKey) {
  const template = controlCenter.templates?.find((entry) => value(entry, "routineKey", "routine_key") === routineKey);
  const draft = template?.activeDraft || template?.active_draft;
  if (!template?.id || !draft?.id) throw new Error(`${routineKey} editable draft is unavailable.`);
  return { templateId: template.id, versionId: draft.id };
}

async function loadWorkspaces(controlCenter = null) {
  const center = controlCenter || await getRoutineManagerControlCenter();
  const identities = Object.fromEntries(["opening", "closing"].map((routineKey) => [routineKey, templateIdentity(center, routineKey)]));
  const [opening, closing] = await Promise.all([
    getRoutineTemplateEditorWorkspace(identities.opening.templateId, identities.opening.versionId),
    getRoutineTemplateEditorWorkspace(identities.closing.templateId, identities.closing.versionId),
  ]);
  return { identities, workspaces: { opening, closing } };
}

export async function loadRoutineProductionAmendmentPlan() {
  const [controlCenter, foundation, references] = await Promise.all([
    getRoutineManagerControlCenter(), getRoutineFoundationEditorWorkspace(), getRoutineReferenceManagerWorkspace(),
  ]);
  const { identities, workspaces } = await loadWorkspaces(controlCenter);
  return { plan: buildRoutineProductionAmendmentPlan({ baselinePack, providerPack, foundation, references, workspaces }), context: { identities } };
}

function patchTask(current, operation) {
  const next = normalizeTask(current);
  for (const field of operation.fields) {
    if (field.field === "locationDescription") next.locationDescription = field.after;
    else if (field.field === "instructions") next.instructions = field.after;
    else if (field.field === "metadata.timingSourceText") next.metadata = { ...next.metadata, timingSourceText: field.after };
    else if (field.field === "metadata.deviationRules") next.metadata = { ...next.metadata, deviationRules: field.after };
    else if (field.field === "metadata.structuredItemsSource") next.metadata = { ...next.metadata, structuredItemsSource: field.after };
    else throw new Error(`Unsupported reviewed task field ${field.field}.`);
  }
  return next;
}

function patchedItem(current, operation) {
  const next = { ...current, itemKey: itemKey(current), itemType: value(current, "itemType", "item_type"), sourceKind: value(current, "sourceKind", "source_kind"),
    sourceConfig: value(current, "sourceConfig", "source_config") || {}, standardId: value(current, "standardId", "standard_id") || null,
    sourceLocationSetId: value(current, "sourceLocationSetId", "source_location_set_id") || null, inputSchema: value(current, "inputSchema", "input_schema") || {},
    sortOrder: value(current, "sortOrder", "sort_order") || 0, metadata: current.metadata || {} };
  for (const field of operation.fields) {
    if (field.field === "label") next.label = field.after;
    else if (field.field === "metadata.sourceText") next.metadata = { ...next.metadata, sourceText: field.after };
    else throw new Error(`Unsupported reviewed item field ${field.field}.`);
  }
  return next;
}

const revisionEvidence = (operation, beforeRevision, afterRevision, extra = {}) => ({ resource: `${operation.kind}:${operation.id || operation.key}`, beforeRevision, afterRevision, ...extra });

function taskMatches(operation, task) {
  const normalized = normalizeTask(task);
  return operation.fields.every((field) => {
    if (field.field === "locationDescription") return normalized.locationDescription === field.after;
    if (field.field === "instructions") return normalized.instructions === field.after;
    if (field.field === "metadata.timingSourceText") return normalized.metadata.timingSourceText === field.after;
    if (field.field === "metadata.deviationRules") return JSON.stringify(normalized.metadata.deviationRules) === JSON.stringify(field.after);
    if (field.field === "metadata.structuredItemsSource") return normalized.metadata.structuredItemsSource === field.after;
    return false;
  });
}

function itemMatches(operation, item) {
  return operation.fields.every((field) => field.field === "label"
    ? item.label === field.after
    : field.field === "metadata.sourceText" && item.metadata?.sourceText === field.after);
}

function partialFailure(error, operation, evidence) {
  const failure = error instanceof Error ? error : new Error(String(error));
  failure.completedEvidence = [...evidence];
  failure.remainingResource = `${operation.kind}:${operation.id || operation.key}`;
  return failure;
}

export async function applyRoutineProductionAmendment({ referenceIdempotencyKeys }) {
  const initial = await loadRoutineProductionAmendmentPlan();
  const evidence = [];
  for (const operation of initial.plan.operations) {
    try {
      if (operation.kind === "location") {
        const foundation = await getRoutineFoundationEditorWorkspace();
        const current = foundation.locations.find((entry) => stableKey(entry) === operation.key);
        const beforeRevision = current.revision;
        let mutationError = null;
        try { await routineConfigurationClient.saveLocation({ ...current, name: operation.fields.find((field) => field.field === "name").after, expectedRevision: beforeRevision }); }
        catch (error) { mutationError = error; }
        const readback = (await getRoutineFoundationEditorWorkspace()).locations.find((entry) => stableKey(entry) === operation.key);
        if (readback.name !== operation.fields[0].after) throw mutationError || new Error(`Location readback failed for ${operation.key}.`);
        evidence.push(revisionEvidence(operation, beforeRevision, readback.revision, { idempotency: "optimistic-revision-only", outcome: mutationError ? "authoritative-readback-after-unknown-outcome" : "confirmed" }));
        continue;
      }
      if (operation.kind === "reference") {
        const workspace = await getRoutineReferenceManagerWorkspace();
        const current = workspace.references.find((entry) => stableKey(entry) === operation.key);
        const beforeRevision = current.revision;
        const key = referenceIdempotencyKeys[operation.key];
        const desired = Object.fromEntries(operation.fields.map((field) => [field.field, field.after]));
        const request = () => updateRoutineReferenceImageMetadata({ referenceId: current.id, label: desired.label ?? current.label, description: desired.description ?? current.description,
          placeholderText: current.placeholderText, expectedRevision: beforeRevision, idempotencyKey: key });
        let result = await request();
        let readback = (await getRoutineReferenceManagerWorkspace()).references.find((entry) => stableKey(entry) === operation.key);
        const matches = () => (!desired.label || readback.label === desired.label) && (!desired.description || readback.description === desired.description);
        if (!result.ok && !matches() && result.mode === "network_error") {
          result = await request();
          readback = (await getRoutineReferenceManagerWorkspace()).references.find((entry) => stableKey(entry) === operation.key);
        }
        if (!matches()) throw result.error || new Error(result.message || `Reference readback failed for ${operation.key}.`);
        evidence.push(revisionEvidence(operation, beforeRevision, readback.revision, { idempotency: key.slice(0, 8), outcome: result.ok ? "confirmed" : "authoritative-readback-after-unknown-outcome" }));
        continue;
      }
      const routineKey = operation.routineKey;
      const center = await getRoutineManagerControlCenter();
      const identity = templateIdentity(center, routineKey);
      let workspace = await getRoutineTemplateEditorWorkspace(identity.templateId, identity.versionId);
      const currentTask = workspace.tasks.find((entry) => taskKey(entry) === (operation.taskKey || operation.key));
      if (!currentTask) throw new Error(`Task readback scope is missing ${operation.id}.`);
      if (operation.kind === "task") {
        const beforeTaskRevision = currentTask.revision;
        const beforeVersionRevision = versionRevision(workspace);
        const next = patchTask(currentTask, operation);
        let mutationError = null;
        try { await routineTemplateClient.saveTask({ versionId: workspace.version.id, sectionId: next.sectionId, taskId: currentTask.id, task: buildTaskPayload(next),
          expectedTaskRevision: beforeTaskRevision, expectedVersionRevision: beforeVersionRevision }); }
        catch (error) { mutationError = error; }
        workspace = await getRoutineTemplateEditorWorkspace(identity.templateId, identity.versionId);
        const readback = workspace.tasks.find((entry) => taskKey(entry) === operation.key);
        if (!taskMatches(operation, readback)) throw mutationError || new Error(`Task readback failed for ${operation.id}.`);
        evidence.push(revisionEvidence(operation, beforeTaskRevision, readback.revision, { versionBefore: beforeVersionRevision, versionAfter: versionRevision(workspace), idempotency: "optimistic-revision-only", outcome: mutationError ? "authoritative-readback-after-unknown-outcome" : "confirmed" }));
        continue;
      }
      if (operation.kind === "task_item") {
        const currentItem = workspace.taskItems.find((entry) => value(entry, "taskId", "task_id") === currentTask.id && itemKey(entry) === operation.key);
        const beforeItemRevision = currentItem.revision;
        const beforeVersionRevision = versionRevision(workspace);
        const next = patchedItem(currentItem, operation);
        let mutationError = null;
        try { await routineTemplateClient.saveItem({ versionId: workspace.version.id, taskId: currentTask.id, itemId: currentItem.id,
          item: { itemKey: next.itemKey, label: next.label, itemType: next.itemType, required: next.required !== false, sourceKind: next.sourceKind,
            sourceConfig: next.sourceConfig, standardId: next.standardId, sourceLocationSetId: next.sourceLocationSetId, inputSchema: next.inputSchema,
            sortOrder: next.sortOrder, active: next.active !== false, metadata: next.metadata }, expectedItemRevision: beforeItemRevision, expectedVersionRevision: beforeVersionRevision }); }
        catch (error) { mutationError = error; }
        workspace = await getRoutineTemplateEditorWorkspace(identity.templateId, identity.versionId);
        const readback = workspace.taskItems.find((entry) => value(entry, "taskId", "task_id") === currentTask.id && itemKey(entry) === operation.key);
        if (!itemMatches(operation, readback)) throw mutationError || new Error("C17 task-item readback failed.");
        evidence.push(revisionEvidence(operation, beforeItemRevision, readback.revision, { versionBefore: beforeVersionRevision, versionAfter: versionRevision(workspace), idempotency: "optimistic-revision-only", outcome: mutationError ? "authoritative-readback-after-unknown-outcome" : "confirmed" }));
      }
    } catch (error) {
      throw partialFailure(error, operation, evidence);
    }
  }
  const final = await loadRoutineProductionAmendmentPlan();
  if (!final.plan.complete) throw new Error("Reviewed amendment is not complete after authoritative readback.");
  return { plan: final.plan, evidence };
}

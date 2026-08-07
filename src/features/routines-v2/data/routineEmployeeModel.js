const array = (value) => (Array.isArray(value) ? value : []);
const object = (value) => (value && typeof value === "object" ? value : {});

export function normalizeRoutineAction(value) {
  const source = object(value);
  return Object.freeze({ allowed: source.allowed === true, reasonCode: source.reasonCode ?? "routine_action_not_allowed" });
}

export function normalizeRoutineActions(value) {
  return Object.freeze(Object.fromEntries(Object.entries(object(value)).map(([key, action]) => [key, normalizeRoutineAction(action)])));
}

export function normalizeRoutineEmployeeHome(value) {
  const source = object(value);
  const clock = object(source.operationalClock);
  const identity = object(source.identity);
  const sync = object(source.sync);
  const offline = object(source.offline);
  return Object.freeze({
    contractVersion: source.contractVersion ?? "phase10k3-v1",
    access: Object.freeze(object(source.access)),
    identity: Object.freeze(identity),
    operationalClock: Object.freeze(clock),
    mode: source.mode ?? "legacy",
    uiReleaseStage: source.uiReleaseStage ?? "foundation",
    readOnlyPreview: source.readOnlyPreview === true,
    operationalAllowed: source.operationalAllowed === true,
    reasonCodes: Object.freeze(array(source.reasonCodes)),
    readOnlyMessage: source.readOnlyMessage ?? null,
    currentRuns: Object.freeze(array(source.currentRuns)),
    joinableRuns: Object.freeze(array(source.joinableRuns)),
    startableTemplates: Object.freeze(array(source.startableTemplates)),
    doubleShiftBundles: Object.freeze(array(source.doubleShiftBundles)),
    assignedTasks: Object.freeze(array(source.assignedTasks)),
    openDeviations: Object.freeze(array(source.openDeviations)),
    pendingHandovers: Object.freeze(array(source.pendingHandovers)),
    pendingTransfers: Object.freeze(array(source.pendingTransfers)),
    eventTransferRequests: Object.freeze(array(source.eventTransferRequests)),
    sync: Object.freeze({ transport: sync.transport ?? "cursor_polling", serverConfirmed: sync.serverConfirmed === true,
      pendingCount: Number(sync.pendingCount ?? 0), conflictCount: Number(sync.conflictCount ?? 0) }),
    offline: Object.freeze(offline),
    emptyStateReason: source.emptyStateReason ?? null,
  });
}

export function normalizeRoutineRunActionContext(value) {
  const source = object(value);
  return Object.freeze({ ...source, run: Object.freeze(object(source.run)), participant: source.participant ?? null,
    actions: normalizeRoutineActions(source.actions), progress: Object.freeze(object(source.progress)),
    completionValidation: Object.freeze(object(source.completionValidation)), pendingTransfers: Object.freeze(array(source.pendingTransfers)),
    handoverRequirements: Object.freeze(array(source.handoverRequirements)), activeResponsibilities: Object.freeze(array(source.activeResponsibilities)) });
}

export function normalizeRoutineTaskActionContext(value) {
  const source = object(value);
  return Object.freeze({ ...source, task: Object.freeze(object(source.task)), timing: Object.freeze(object(source.timing)),
    dependencyStatus: Object.freeze(object(source.dependencyStatus)), actorRelationship: Object.freeze(object(source.actorRelationship)),
    initialAssessmentPolicy: Object.freeze(object(source.initialAssessmentPolicy)), items: Object.freeze(array(source.items)),
    activeDeviations: Object.freeze(array(source.activeDeviations)), referenceImages: Object.freeze(array(source.referenceImages)),
    actions: normalizeRoutineActions(source.actions), offlinePolicy: Object.freeze(object(source.offlinePolicy)) });
}

export function normalizeRoutineRelatedContext(value) {
  const source = object(value);
  return Object.freeze({ ...source, actions: normalizeRoutineActions(source.actions), items: Object.freeze(array(source.items)) });
}

export function routineEmployeeError(error) {
  const message = String(error?.message ?? error ?? "Routine employee request failed.");
  const kind = /operator.*(session|auth)|reauth/i.test(message) ? "operator_auth_required"
    : /jwt|auth session|sign in/i.test(message) ? "auth_required"
      : /stale|revision|40001/i.test(message) ? "stale_write"
        : /network|fetch|timeout|connection/i.test(message) ? "network"
          : /permission|42501|not visible|access/i.test(message) ? "permission_denied" : "server_rejected";
  return Object.freeze({ kind, message, cause: error });
}

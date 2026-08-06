export const ROUTINE_ENGINE_MODES = Object.freeze({
  LEGACY: "legacy",
  SHADOW: "shadow",
  PILOT: "pilot",
  ACTIVE: "active",
});

export const ROUTINE_UI_RELEASE_STAGES = Object.freeze({
  FOUNDATION: "foundation",
  MANAGER_PREVIEW: "manager_preview",
  STAFF_PREVIEW: "staff_preview",
  PILOT_READY: "pilot_ready",
  PRODUCTION_READY: "production_ready",
});

export const ROUTINE_UI_ACCESS_STATES = Object.freeze({
  HIDDEN: "hidden",
  OPERATOR_REQUIRED: "operator_required",
  NOT_AUTHORIZED: "not_authorized",
  READ_ONLY_PREVIEW: "read_only_preview",
  MANAGER_PREVIEW: "manager_preview",
  OPERATIONAL: "operational",
});

const capabilityKeys = Object.freeze([
  "manageConfiguration",
  "manageTemplates",
  "manageReferences",
  "manageOperators",
  "coordinateRuns",
  "performTasks",
  "eventTransferActions",
  "offlineNonCritical",
]);

export function normalizeRoutineCapabilities(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.freeze(Object.fromEntries(capabilityKeys.map((key) => [key, source[key] === true])));
}

export function normalizeRoutineServerClock(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.freeze({
    serverNow: source.serverNow ?? source.server_now ?? null,
    timezone: source.timezone ?? "Europe/Oslo",
    operationalDate: source.operationalDate ?? source.operational_date ?? null,
    cutoff: source.cutoff ?? null,
  });
}

export function normalizeRoutineApplicationBootstrap(value) {
  if (!value || typeof value !== "object") return null;
  const identity = value.identity && typeof value.identity === "object" ? value.identity : {};
  const sync = value.sync && typeof value.sync === "object" ? value.sync : {};
  const summaries = value.summaries && typeof value.summaries === "object" ? value.summaries : {};
  return Object.freeze({
    contractVersion: value.contractVersion ?? value.contract_version ?? "phase10k1-v1",
    uiReleaseStage: value.uiReleaseStage ?? value.ui_release_stage ?? ROUTINE_UI_RELEASE_STAGES.FOUNDATION,
    mode: value.mode ?? ROUTINE_ENGINE_MODES.LEGACY,
    accessState: value.accessState ?? value.access_state ?? ROUTINE_UI_ACCESS_STATES.HIDDEN,
    accessReasonCode: value.accessReasonCode ?? value.access_reason_code ?? "routine_ui_unavailable",
    previewAllowed: value.previewAllowed === true,
    operationalAllowed: value.operationalAllowed === true,
    managerPreviewAllowed: value.managerPreviewAllowed === true,
    organizationId: value.organizationId ?? value.organization_id ?? null,
    identity: Object.freeze({
      actorSource: identity.actorSource ?? identity.actor_source ?? null,
      kind: identity.kind ?? null,
      displayName: identity.displayName ?? identity.display_name ?? "",
      role: identity.role ?? null,
      effectiveOperatorId: identity.effectiveOperatorId ?? identity.effective_operator_id ?? null,
      linkedProfile: identity.linkedProfile ?? identity.linked_profile ?? null,
      device: identity.device ?? null,
      session: identity.session ?? null,
    }),
    capabilities: normalizeRoutineCapabilities(value.capabilities),
    serverClock: normalizeRoutineServerClock(value.serverClock ?? value.server_clock),
    sync: Object.freeze({
      mode: sync.mode ?? "disabled",
      realtimeAllowed: sync.realtimeAllowed === true,
      cursorPollingRequired: sync.cursorPollingRequired === true,
      offlineAvailable: sync.offlineAvailable === true,
    }),
    summaries: Object.freeze({
      publishedTemplateCount: Number(summaries.publishedTemplateCount ?? 0),
      draftTemplateCount: summaries.draftTemplateCount == null ? null : Number(summaries.draftTemplateCount),
      visibleRunCount: Number(summaries.visibleRunCount ?? 0),
      visibleBundleCount: Number(summaries.visibleBundleCount ?? 0),
      openDeviationCount: Number(summaries.openDeviationCount ?? 0),
    }),
    backendVersion: value.backendVersion ?? value.backend_version ?? null,
    emptyStateReason: value.emptyStateReason ?? value.empty_state_reason ?? null,
  });
}

export function shouldShowRoutineEngineLauncher(bootstrap) {
  return Boolean(bootstrap && bootstrap.mode !== ROUTINE_ENGINE_MODES.LEGACY
    && (bootstrap.previewAllowed || bootstrap.accessState === ROUTINE_UI_ACCESS_STATES.OPERATOR_REQUIRED));
}

export function isRoutineReadOnlyPreview(bootstrap) {
  return Boolean(bootstrap?.previewAllowed && !bootstrap?.operationalAllowed);
}

export function routineLauncherLabel(bootstrap) {
  return bootstrap?.mode === ROUTINE_ENGINE_MODES.SHADOW ? "Routine Engine v2 Preview" : "Routine Engine v2";
}

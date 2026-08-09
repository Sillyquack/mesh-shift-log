export const MANAGER_TABS = Object.freeze([
  { id: "overview", label: "Overview" },
  { id: "foundation", label: "Foundation" },
  { id: "content", label: "Operational content" },
  { id: "templates", label: "Templates" },
  { id: "references", label: "References" },
  { id: "operators", label: "Operators" },
  { id: "pilot", label: "Pilot access" },
  { id: "history", label: "History" },
  { id: "review", label: "Review" },
  { id: "release", label: "Release gate" },
]);

export const READINESS_LABELS = Object.freeze({ ready: "Ready", warning: "Warning", blocked: "Blocked" });

export function classifyManagerError(error) {
  const text = `${error?.code || ""} ${error?.message || error || ""}`;
  if (/40001|stale|refresh before/i.test(text)) return "stale";
  if (/jwt|auth.*expired|auth_required/i.test(text)) return "auth";
  if (/network|failed to fetch|timeout|offline/i.test(text)) return "network";
  if (/valid|block|22023|23514/i.test(text)) return "validation";
  if (/42501|permission|manager/i.test(text)) return "forbidden";
  return "server";
}

export function managerErrorMessage(kind) {
  return ({
    stale: "The server revision changed. Your local draft has been preserved.",
    auth: "Your sign-in expired. Your local draft has been preserved.",
    network: "The server could not be reached. Your local draft has been preserved.",
    validation: "The server rejected this draft. Review the highlighted fields; your values are preserved.",
    forbidden: "Personal manager access is required.",
    server: "The request failed. Your local draft has been preserved.",
  })[kind] || "The request failed.";
}

export function normalizeManagerWorkspace(value = {}) {
  const foundation = value.foundation || value;
  return {
    contractVersion: value.contractVersion || "phase10k2-v1",
    applicationBootstrap: value.applicationBootstrap || {},
    settings: foundation.settings || {},
    locations: Array.isArray(foundation.locations) ? foundation.locations : [],
    locationSets: Array.isArray(foundation.locationSets) ? foundation.locationSets : [],
    standards: Array.isArray(foundation.standards) ? foundation.standards : [],
    foundationWarnings: Array.isArray(foundation.validationWarnings) ? foundation.validationWarnings : [],
    templates: Array.isArray(value.templates) ? value.templates : [],
    references: value.references || { references: [], usage: [] },
    operators: value.operatorAdministration || value.operators || { devices: [], operators: [], access: [], credentials: [], sessions: [], lockouts: [] },
    pilotAccess: value.pilotAccess || { memberships: [], profiles: [], operators: [] },
    readiness: value.releaseReadiness || value.readiness || { ready: false, categories: {} },
    activeSessionSummary: value.activeSessionSummary || { active: 0, recent: 0 },
    profileChoices: Array.isArray(value.profileChoices) ? value.profileChoices : [],
  };
}

export function applyRoutineBatchValidations(workspace = {}, preview = {}) {
  const validations = new Map((preview.versions || []).map((entry) => [entry.versionId, entry.validation]));
  return {
    ...workspace,
    templates: (workspace.templates || []).map((template) => {
      const versionId = template.activeDraft?.id;
      return versionId && validations.has(versionId)
        ? { ...template, validation: validations.get(versionId) }
        : template;
    }),
    publicationValidationContext: {
      versionIds: (preview.versions || []).map((entry) => entry.versionId),
      blockerCount: (preview.blockers || []).length,
      warningCount: (preview.warnings || []).length,
    },
  };
}

export function readinessState(category = {}) {
  if (category.ready) return "ready";
  if ((category.blockers || []).length) return "blocked";
  return "warning";
}

export function moveEntry(entries, index, direction) {
  const target = index + direction;
  if (target < 0 || target >= entries.length) return entries;
  const next = entries.map((entry) => ({ ...entry }));
  [next[index], next[target]] = [next[target], next[index]];
  return next.map((entry, sortOrder) => ({ ...entry, sortOrder }));
}

export function shortHash(hash) { return hash ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : "Not computed"; }
export function createIdempotencyKey(cryptoImpl = globalThis.crypto) { return cryptoImpl.randomUUID(); }

export const MANAGER_TABS = Object.freeze([
  { id: "overview", label: "Today", group: "today" },
  { id: "review", label: "Attention", group: "today" },
  { id: "content", label: "Content", group: "build" },
  { id: "templates", label: "Routines", group: "build" },
  { id: "references", label: "Visual standards", group: "build" },
  { id: "operators", label: "People & devices", group: "people" },
  { id: "pilot", label: "Access", group: "people" },
  { id: "history", label: "History", group: "history" },
  { id: "foundation", label: "Places & standards", group: "system" },
  { id: "activation", label: "Activation", group: "system" },
  { id: "release", label: "Publish", group: "system" },
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
    stale: "The saved version changed. Your draft is still here — refresh before retrying.",
    auth: "Your sign-in expired. Your draft is still here.",
    network: "The server could not be reached. Your draft is still here.",
    validation: "This draft needs a correction. Review the highlighted fields; your values are preserved.",
    forbidden: "Manager access is required.",
    server: "The request failed. Your draft is still here.",
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

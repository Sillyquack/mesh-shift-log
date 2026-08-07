const array = (value) => Array.isArray(value) ? value : [];
export const HISTORY_SOURCES = Object.freeze({
  routine_engine_v2: { label: "Routine Engine v2", confidence: "Authoritative audit history" },
  legacy_shift_log: { label: "Legacy shift log", confidence: "Legacy record only" },
});

export function normalizeHistoryPage(value = {}) {
  return { sourceSystem: value.sourceSystem || "routine_engine_v2", items: array(value.items), hasMore: value.hasMore === true, nextCursor: value.nextCursor || null };
}
export function normalizeHistoryRun(value = {}) {
  return { ...value, actions: value.actions || {}, participants: array(value.participants), tasks: array(value.tasks), events: array(value.events), deviations: array(value.deviations),
    managerOverrides: array(value.managerOverrides), taskVerifications: array(value.taskVerifications), runVerifications: array(value.runVerifications),
    handovers: array(value.handovers), transfers: array(value.transfers), deliveries: array(value.deliveries), comparisons: array(value.comparisons),
    doubleShift: array(value.doubleShift), corrections: array(value.corrections), syncEvidence: array(value.syncEvidence) };
}
export function normalizeHistoryTask(value = {}) {
  return { ...value, items: array(value.items), events: array(value.events), deviations: array(value.deviations), managerOverrides: array(value.managerOverrides),
    verifications: array(value.verifications), corrections: array(value.corrections) };
}
export function historySource(value) { return HISTORY_SOURCES[value] || { label: value || "Unknown source", confidence: "Unknown confidence" }; }
export function formatHistoryDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
export function mergeHistoryTimeline(run = {}) {
  const entries = [
    ...array(run.events).map((item) => ({ ...item, kind: "event", at: item.server_created_at || item.created_at })),
    ...array(run.managerOverrides).map((item) => ({ ...item, kind: "override", at: item.created_at })),
    ...array(run.corrections).map((item) => ({ ...item, kind: "correction", at: item.created_at })),
  ];
  return entries.sort((a, b) => String(a.at).localeCompare(String(b.at)) || String(a.id).localeCompare(String(b.id)));
}
export function historyError(error) {
  const text = `${error?.code || ""} ${error?.message || error || ""}`;
  const kind = /40001|stale|revision/i.test(text) ? "stale" : /jwt|auth.*expired/i.test(text) ? "auth" : /network|failed to fetch|timeout/i.test(text) ? "network" : /42501|permission|manager/i.test(text) ? "forbidden" : /22023|valid/i.test(text) ? "validation" : "server";
  return Object.assign(error instanceof Error ? error : new Error(String(error)), { kind });
}

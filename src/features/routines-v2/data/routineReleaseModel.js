const array = (value) => Array.isArray(value) ? value : [];
export function normalizeReleaseReadiness(value = {}) {
  const categories = Object.fromEntries(Object.entries(value.categories || {}).map(([key, category]) => [key, {
    ready: category?.ready === true, blockers: array(category?.blockers), warnings: array(category?.warnings), evidence: category?.evidence || {}, evidenceHash: category?.evidenceHash || "",
  }]));
  return { ...value, ready: value.ready === true, blockers: array(value.blockers), warnings: array(value.warnings), categories,
    readinessHash: value.readinessHash || "", settingsRevision: Number(value.settingsRevision || 0), pilotNewWorkPaused: value.pilotNewWorkPaused === true };
}
export function releaseError(error) {
  const text = `${error?.code || ""} ${error?.message || error || ""}`;
  const kind = /40001|stale|readiness.*changed|hash/i.test(text) ? "stale" : /jwt|auth.*expired/i.test(text) ? "auth" : /network|failed to fetch|timeout/i.test(text) ? "network" : /42501|permission|manager/i.test(text) ? "forbidden" : /22023|valid|block/i.test(text) ? "validation" : "server";
  return Object.assign(error instanceof Error ? error : new Error(String(error)), { kind });
}
export const releaseErrorMessage = (kind) => ({ stale: "Readiness changed on the server. Your note is preserved; refresh before retrying.", auth: "Your manager sign-in expired. Your note is preserved.", network: "The service could not be reached. Your note is preserved.", forbidden: "Personal manager access is required.", validation: "The release gate rejected this request. Your note is preserved.", server: "The request failed. Your note is preserved." })[kind] || "The request failed.";

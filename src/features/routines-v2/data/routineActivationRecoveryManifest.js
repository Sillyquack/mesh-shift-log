export const ACTIVATION_RECOVERY = Object.freeze({
  contractVersion: "phase10ab-v1",
  sourceCommit: "6f558f44c730733c89e4d463231e439c855ebca8",
  previousPagesCommit: "11f903d220f42ac0d5a612e4d667cbd6c29fb9fc",
  rollbackPagesCommit: "e712001b1706ec4175c1dd29472a1b35d7844338",
  productionUrl: "https://sillyquack.github.io/mesh-shift-log/",
  provider: Object.freeze({
    key: "mesh-routine-content",
    version: "1.5R",
    hash: "710c9412eabc8f2e9c5a6488499ac4654cd7c94b62138eaed9563ab5f0203c9c",
  }),
  profileIds: Object.freeze({
    manager: "3327576f-35e6-4db5-b41c-221ba078fad5",
    julie: "6a44e4de-1637-40d1-b26c-acb0f3192596",
    counter: "737a741f-5a7a-418c-9b41-4e4997735ad0",
    sharedDevice: "1430ce8a-4a3d-46b2-9f9f-d08c534ab545",
  }),
  julieProfileId: "6a44e4de-1637-40d1-b26c-acb0f3192596",
  phrases: Object.freeze({
    install: "INSTALL 1.5R",
    publish: "PUBLISH PILOT",
    julie: "ADD JULIE",
    attest: "ATTEST E2E",
    promote: "PROMOTE PILOT READY",
    pilot: "START PILOT",
  }),
  notes: Object.freeze({
    publish: "[pilot-approved] Exact reviewed mesh-routine-content@1.5R for the controlled Mesh Youngstorget pilot. Previous drafts remain preserved as discarded history.",
    julie: "Initial controlled Event Floor Manager pilot participant.",
    promote: "Controlled pilot-ready promotion after exact 1.5R installation, batch publication, Julie participant membership and Chromium/WebKit production verification.",
    pilot: "Begin controlled Mesh Youngstorget pilot with Julie as the initial Event Floor Manager participant. Shared-device and full production activation remain disabled.",
    attestation: "Exact headed Chromium and WebKit production journeys reviewed for the controlled Mesh Youngstorget pilot.",
  }),
});

export function isExactPhrase(value, expected) {
  return String(value || "") === expected;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const FRONTLINE_PATH = /(?:title|instructions?|done[_A-Z]?criteria|items?|conditions?|guidance|source[_A-Z]?text|metadata)/i;
const EXCLUDED_PATH = /(?:file(?:name)?|audit|negative(?:Assertion|Regression)?)/i;
const FORBIDDEN = /fire|evacuation|assembly point|Peter Egges Plass|Møllergata 9|Shopbox test sale|sell one beer|always create new customer|Subscribed|subscription field/i;

export async function scanActivationWorkspace(workspaces = []) {
  const matches = [];
  const visit = async (value, path = "$") => {
    if (typeof value === "string") {
      if (FRONTLINE_PATH.test(path) && !EXCLUDED_PATH.test(path) && FORBIDDEN.test(value)) {
        matches.push({ path, textHash: await sha256(value) });
      }
      return;
    }
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) await visit(value[index], `${path}[${index}]`);
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) await visit(child, `${path}.${key}`);
    }
  };
  for (const workspace of workspaces) await visit(workspace, `$.${workspace?.template?.routine_key || workspace?.template?.routineKey || "template"}`);
  return Object.freeze({ valid: matches.length === 0, matches });
}

const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ENGINES = ["chromium", "webkit"];
function validateJourney(errors, name, value, expectedProfileId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${name} is required.`); return;
  }
  if (expectedProfileId && value.profileId !== expectedProfileId) errors.push(`${name}.profileId is not exact.`);
  for (const engine of ENGINES) {
    const result = value[engine];
    if (!result || result.passed !== true || !Array.isArray(result.checks) || result.checks.length === 0
        || result.checks.some((check) => typeof check !== "string" || !check.trim())) {
      errors.push(`${name}.${engine} must contain a passed result and named checks.`);
    }
  }
}
export function validateActivationEvidence(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, errors: ["Evidence must be one JSON object."] };
  if (!COMMIT.test(value.sourceCommit || "")) errors.push("sourceCommit must be an exact 40-character commit.");
  if (!COMMIT.test(value.pagesCommit || "")) errors.push("pagesCommit must be an exact 40-character commit.");
  if (value.productionUrl !== ACTIVATION_RECOVERY.productionUrl) errors.push("productionUrl is not the canonical production URL.");
  if (!Number.isFinite(Date.parse(value.timestamp))) errors.push("timestamp must be an ISO timestamp.");
  if (JSON.stringify(value.browserEngines) !== JSON.stringify(ENGINES)) errors.push("browserEngines must be exactly Chromium and WebKit.");
  if (value.allPassed !== true) errors.push("allPassed must be true.");
  validateJourney(errors, "managerResult", value.managerResult, ACTIVATION_RECOVERY.profileIds.manager);
  validateJourney(errors, "julieResult", value.julieResult, ACTIVATION_RECOVERY.profileIds.julie);
  validateJourney(errors, "counterResult", value.counterResult, ACTIVATION_RECOVERY.profileIds.counter);
  validateJourney(errors, "sharedDeviceDisabledResult", value.sharedDeviceDisabledResult, ACTIVATION_RECOVERY.profileIds.sharedDevice);
  if (value.sharedDeviceDisabledResult?.disabled !== true || value.sharedDeviceDisabledResult?.operativeJourneyClaimed !== false) {
    errors.push("sharedDeviceDisabledResult must prove disabled state without claiming an operative journey.");
  }
  if (!Number.isInteger(value.consoleErrorCount) || value.consoleErrorCount !== 0) errors.push("consoleErrorCount must be zero.");
  if (!Number.isInteger(value.failedNetworkCount) || value.failedNetworkCount !== 0) errors.push("failedNetworkCount must be zero.");
  if (!Array.isArray(value.screenshotManifest) || value.screenshotManifest.length < 8
      || value.screenshotManifest.some((entry) => !entry || !ENGINES.includes(entry.engine)
        || !["manager", "julie", "counter", "shared-device-disabled"].includes(entry.journey)
        || typeof entry.path !== "string" || entry.path.includes("..") || !SHA256.test(entry.sha256 || ""))) {
    errors.push("screenshotManifest must contain hashed evidence for four journeys in both engines.");
  }
  if (!SHA256.test(value.artifactSha256 || "")) errors.push("artifactSha256 must be SHA-256.");
  if (!Array.isArray(value.publishedTemplates) || value.publishedTemplates.length !== 2
      || value.publishedTemplates.some((entry) => !UUID.test(entry?.id || "") || !SHA256.test(entry?.contentHash || ""))) errors.push("Two exact published template IDs and hashes are required.");
  if (!UUID.test(value.julieMembershipId || "")) errors.push("julieMembershipId must be an exact UUID.");
  if (!/shared-device.*disabled|disabled.*shared-device/i.test(value.sharedDeviceOutOfScope || "")) errors.push("The disabled shared-device journey must be explicitly out of scope.");
  return { valid: errors.length === 0, errors };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export async function activationEvidenceArtifactHash(value) {
  const payload = { ...value };
  delete payload.artifactSha256;
  return sha256(canonicalJson(payload));
}

export function julieMembershipEntry(validFrom) {
  if (!Number.isFinite(Date.parse(validFrom))) throw new Error("A current server timestamp is required for Julie's membership.");
  return Object.freeze({
    identityType: "personal_profile",
    userProfileId: ACTIVATION_RECOVERY.julieProfileId,
    operatorId: null,
    accessLevel: "participant",
    active: true,
    validFrom,
    validUntil: null,
    note: ACTIVATION_RECOVERY.notes.julie,
  });
}

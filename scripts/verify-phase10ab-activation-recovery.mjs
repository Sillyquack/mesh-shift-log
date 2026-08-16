import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  ACTIVATION_RECOVERY,
  activationEvidenceArtifactHash,
  isExactPhrase,
  julieMembershipEntry,
  scanActivationWorkspace,
  validateActivationEvidence,
} from "../src/features/routines-v2/data/routineActivationRecoveryManifest.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path) => readFileSync(resolve(ROOT, path), "utf8");
const sql = source("supabase/phase10ab_mesh_routine_content_1_5r_activation_recovery.sql");
const component = source("src/features/routines-v2/manager/RoutineActivationRecovery.jsx");
const client = source("src/features/routines-v2/api/routineActivationRecoveryClient.js");
const workspace = source("src/features/routines-v2/manager/RoutineManagerWorkspace.jsx");
const model = source("src/features/routines-v2/data/routineManagerModel.js");
const productionBrowser = source("scripts/verify-production-activation-browser.mjs");

test("10AB is an exact two-entry-point security-definer migration", () => {
  assert.equal((sql.match(/create or replace function public\./gi) || []).length, 2);
  assert.equal((sql.match(/security definer/gi) || []).length, 2);
  assert.equal((sql.match(/set search_path = pg_catalog/gi) || []).length, 2);
  assert.equal((sql.match(/routine_phase10k2_require_personal_manager/g) || []).length, 2);
  assert.match(sql, /activation-recovery:'\|\|v_actor\.organization_id::text\|\|':mesh-routine-content@1\.5R/);
  assert.match(sql, /input_expected_state_hash[\s\S]*stateHash/);
  assert.match(sql, /resource_third_state/);
  assert.match(sql, /routine_phase10k1_existing_operation/);
  assert.match(sql, /insert into public\.routine_ui_operations/);
  assert.match(sql, /'content_pack_recovery'/);
  assert.match(sql, /install_mesh_routine_content_pack_v1/);
});

test("10AB pins the production provider, seven resources, and preserved drafts", () => {
  for (const value of [
    ACTIVATION_RECOVERY.provider.hash,
    "73896e75-1509-4215-ac4a-a36b033e6d18",
    "072fee93-eda7-406c-87b3-d5186cd26944",
    "a3d2038b7bc0d3b3e75baee5ce63a1c0ffeea8c4b13331c88ea474e10a4f2e4a",
    "04124b4ab3ddc94e384012e85201cf271efd335187e75f3dd1475fb81aa50d98",
    "5d279ff8-6e6c-4e2a-bde1-a27cd8763841",
    "c49581b2-e52b-4873-96b9-3579a5b85d96",
    "de6530b6-b5f3-44d5-b7e7-f1bfea37430d",
    "badc7c4d-8162-4d48-a4be-31e9ef65d36f",
    "34f83f63-279c-4294-b381-1417ce446692",
    "722ab761-19f0-4a36-ac2b-09c0f844c4f4",
    "693d07e5-dcd2-4c70-bbc5-54d13b6e83ed",
  ]) assert.ok(sql.includes(value), value);
  assert.match(sql, /resourcesToCreate'<>v_expected_creates/);
  assert.match(sql, /Preserved immutable pre-1\.5R reviewed draft before installing exact mesh-routine-content@1\.5R\./);
  assert.doesNotMatch(sql, /storage\.objects|production_ready|mode\s*=\s*'pilot'|ui_release_stage\s*=\s*'pilot_ready'/i);
});

test("Activation is nested only in the authenticated manager workspace", () => {
  assert.match(model, /id: "activation", label: "Activation", group: "system"/);
  assert.match(workspace, /RoutineActivationRecovery/);
  assert.match(workspace, /activation: <RoutineActivationRecovery/);
  assert.doesNotMatch(source("src/main.jsx"), /RoutineActivationRecovery/);
  assert.doesNotMatch(source("src/App.jsx"), /RoutineActivationRecovery/);
});

test("Activation uses RPC clients only and stable action idempotency keys", () => {
  assert.doesNotMatch(client, /\.(?:from|insert|update|delete)\s*\(/);
  for (const rpc of [
    "preview_mesh_routine_content_1_5r_activation_recovery",
    "apply_mesh_routine_content_1_5r_activation_recovery",
  ]) assert.ok(client.includes(rpc));
  for (const normalClient of [
    "routineTemplateClient.publish", "replaceRoutinePilotMemberships",
    "recordRoutineE2EVerificationAttestation", "promoteRoutineUiReleaseStage", "setRoutineEngineMode",
  ]) assert.ok(client.includes(normalClient), normalClient);
  assert.match(component, /const \[keys\] = useState\(\(\) =>/);
  assert.doesNotMatch(component, /useEffect\([^)]*(?:recoveryApi|publicationApi|membershipApi|attestationApi|promotionApi|pilotApi)/s);
});

test("all six exact phrases and ordering gates are present", () => {
  for (const phrase of Object.values(ACTIVATION_RECOVERY.phrases)) {
    assert.ok(component.includes(`ACTIVATION_RECOVERY.phrases.`) && isExactPhrase(phrase, phrase));
    assert.equal(isExactPhrase(`${phrase} `, phrase), false);
  }
  assert.match(component, /prepared && !published/);
  assert.match(component, /published && !julieAdded/);
  assert.match(component, /julieAdded && !attested/);
  assert.match(component, /attested && !pilotReady/);
  assert.match(component, /pilotReady && !pilotStarted/);
  assert.match(component, /fullyReadOnly/);
});

test("frontline scan reports exact paths and SHA-256 without false-positive audit text", async () => {
  const result = await scanActivationWorkspace([{ template: { routineKey: "opening" }, tasks: [{ title: "Evacuation assembly point" }], audit: { title: "Shopbox test sale negative assertion" } }]);
  assert.equal(result.valid, false);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].path, "$.opening.tasks[0].title");
  assert.match(result.matches[0].textHash, /^[0-9a-f]{64}$/);
});

test("Julie payload is exactly one personal participant with no role mutation", () => {
  const entry = julieMembershipEntry("2026-08-16T12:00:00.000Z");
  assert.deepEqual(entry, {
    identityType: "personal_profile", userProfileId: ACTIVATION_RECOVERY.julieProfileId,
    operatorId: null, accessLevel: "participant", active: true,
    validFrom: "2026-08-16T12:00:00.000Z", validUntil: null, note: ACTIVATION_RECOVERY.notes.julie,
  });
  assert.doesNotMatch(client, /update.*user_profiles|role\s*:/i);
});

test("E2E evidence rejects incomplete or unsafe claims and binds its canonical artifact hash", async () => {
  assert.equal(validateActivationEvidence({}).valid, false);
  const journey = (profileId) => ({
    profileId,
    chromium: { passed: true, checks: ["visible authorized surface"] },
    webkit: { passed: true, checks: ["visible authorized surface"] },
  });
  const evidence = {
    sourceCommit: "1".repeat(40), pagesCommit: "2".repeat(40), productionUrl: ACTIVATION_RECOVERY.productionUrl,
    timestamp: "2026-08-16T12:00:00.000Z", browserEngines: ["chromium", "webkit"], allPassed: true,
    managerResult: journey(ACTIVATION_RECOVERY.profileIds.manager),
    julieResult: journey(ACTIVATION_RECOVERY.profileIds.julie),
    counterResult: journey(ACTIVATION_RECOVERY.profileIds.counter),
    sharedDeviceDisabledResult: { ...journey(ACTIVATION_RECOVERY.profileIds.sharedDevice), disabled: true, operativeJourneyClaimed: false },
    consoleErrorCount: 0, failedNetworkCount: 0,
    screenshotManifest: ["chromium", "webkit"].flatMap((engine) => ["manager", "julie", "counter", "shared-device-disabled"].map((journeyName) => ({
      engine, journey: journeyName, path: `${engine}-${journeyName}.png`, sha256: "3".repeat(64),
    }))),
    artifactSha256: "3".repeat(64),
    publishedTemplates: [{ id: "11000000-0000-4000-8000-000000000001", contentHash: "4".repeat(64) }, { id: "12000000-0000-4000-8000-000000000001", contentHash: "5".repeat(64) }],
    julieMembershipId: "13000000-0000-4000-8000-000000000001", sharedDeviceOutOfScope: "Shared-device operation is disabled and out of scope.",
  };
  assert.deepEqual(validateActivationEvidence(evidence), { valid: true, errors: [] });
  evidence.artifactSha256 = await activationEvidenceArtifactHash(evidence);
  assert.match(evidence.artifactSha256, /^[0-9a-f]{64}$/);
  assert.equal(await activationEvidenceArtifactHash(evidence), evidence.artifactSha256);
  evidence.julieResult.webkit.passed = false;
  assert.equal(validateActivationEvidence(evidence).valid, false);
});

test("headed production evidence uses visible surfaces and never reads browser credential storage", () => {
  assert.match(productionBrowser, /headless: false/);
  assert.match(productionBrowser, /AUTHENTICATED_LOGIN_REQUIRED/);
  assert.match(productionBrowser, /getByRole\("tab", \{ name: "Activation"/);
  assert.match(productionBrowser, /activation-e2e-evidence\.json/);
  assert.doesNotMatch(productionBrowser, /localStorage|sessionStorage|storageState|document\.cookie|passwordValue|access_token|refresh_token/);
});

console.log("Verified Phase 10AB and the manager-authenticated Activation workflow.");

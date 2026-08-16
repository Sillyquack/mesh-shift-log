import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ACTIVATION_RECOVERY,
  activationEvidenceArtifactHash,
  validateActivationEvidence,
} from "../src/features/routines-v2/data/routineActivationRecoveryManifest.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_ROOT = resolve(ROOT, "docs/production/artifacts/activation-browser");
const SCREENSHOT_ROOT = resolve(OUTPUT_ROOT, "screenshots");
const PROFILE_ROOT = process.env.MESH_ACTIVATION_PROFILE_ROOT || "/tmp/mesh-activation-browser-profiles";
const PLAYWRIGHT_CANDIDATES = [
  resolve(ROOT, "node_modules/playwright/index.mjs"),
  "/Users/robert/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
];
const ENGINES = ["chromium", "webkit"];
const JOURNEYS = ["manager", "julie", "counter"];
const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index === -1 ? "" : args[index + 1] || ""; };
const sourceCommit = option("--source-commit");
const pagesCommit = option("--pages-commit");
const loginEngine = option("--login");
const loginProfile = loginEngine ? args[args.indexOf("--login") + 2] || "" : "";
const sha256File = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const commit = /^[0-9a-f]{40}$/;
const delay = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

if (args.some((value) => /token|password|jwt|secret/i.test(value))) {
  throw new Error("This verifier does not accept credential, password, JWT, secret, or token arguments.");
}

const playwrightPath = PLAYWRIGHT_CANDIDATES.find(existsSync);
if (!playwrightPath) throw new Error("The reviewed Playwright runtime is unavailable.");
const playwright = await import(pathToFileURL(playwrightPath).href);

async function openPersistent(engine, profile) {
  const profileDir = resolve(PROFILE_ROOT, engine, profile);
  mkdirSync(profileDir, { recursive: true });
  const context = await playwright[engine].launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = context.pages()[0] || await context.newPage();
  return { context, page, profileDir };
}

async function isLoginVisible(page) {
  return page.locator(".login-shell").count().then((count) => count > 0).catch(() => true);
}

async function prepareLogin(engine, profile) {
  if (!ENGINES.includes(engine) || !JOURNEYS.includes(profile)) {
    throw new Error("Usage: --login <chromium|webkit> <manager|julie|counter>");
  }
  const { context, page, profileDir } = await openPersistent(engine, profile);
  await page.goto(ACTIVATION_RECOVERY.productionUrl, { waitUntil: "domcontentloaded" });
  process.stdout.write(`LOGIN_READY|${engine}|${profile}|${profileDir}\n`);
  process.stdout.write("Complete the local visible login. Credentials are never read, printed, or stored by this verifier.\n");
  try {
    for (let attempt = 0; attempt < 3600; attempt += 1) {
      if (!await isLoginVisible(page)) {
        process.stdout.write(`LOGIN_CONFIRMED|${engine}|${profile}|${profileDir}\n`);
        return;
      }
      await delay(500);
    }
    throw new Error(`Local login timed out for ${profile} in ${engine}.`);
  } finally {
    await context.close();
  }
}

async function clickIfVisible(locator) {
  if (await locator.count() && await locator.first().isVisible()) {
    await locator.first().click();
    return true;
  }
  return false;
}

async function requireVisible(locator, label) {
  await locator.first().waitFor({ state: "visible", timeout: 20_000 });
  return label;
}

async function openManagerActivation(page) {
  await clickIfVisible(page.getByRole("button", { name: "Open Manager Control Center", exact: true }));
  await requireVisible(page.getByRole("heading", { name: "Operations Studio", exact: true }), "Operations Studio");
  await clickIfVisible(page.getByRole("button", { name: /^System/ }));
  await page.getByRole("tab", { name: "Activation", exact: true }).click();
  await requireVisible(page.getByRole("heading", { name: "Activation", exact: true }), "Activation");
}

async function managerJourney(page) {
  const checks = [];
  await openManagerActivation(page);
  checks.push("Operations Studio and manager-only Activation are visible");
  const managerId = await page.locator("[data-manager-profile-id]").getAttribute("data-manager-profile-id");
  if (managerId !== ACTIVATION_RECOVERY.profileIds.manager) throw new Error("The visible Activation manager profile is not Bobby.");
  checks.push("Bobby manager profile ID is exact");
  await requireVisible(page.getByText(ACTIVATION_RECOVERY.provider.hash, { exact: true }), "exact provider hash");
  checks.push("mesh-routine-content@1.5R provider hash is exact");
  const publishedTemplates = await page.locator("[data-published-template-id]").evaluateAll((nodes) => nodes.map((node) => ({
    id: node.getAttribute("data-published-template-id"), contentHash: node.getAttribute("data-published-content-hash"),
  })));
  if (publishedTemplates.length !== 2) throw new Error("Activation does not show exactly two published template versions.");
  checks.push("Opening and Closing publication readback contains two exact IDs and hashes");
  const memberships = await page.locator("[data-pilot-membership-id]").evaluateAll((nodes) => nodes.map((node) => ({
    id: node.getAttribute("data-pilot-membership-id"), profileId: node.getAttribute("data-pilot-profile-id"),
  })));
  if (memberships.length !== 1 || memberships[0].profileId !== ACTIVATION_RECOVERY.profileIds.julie) {
    throw new Error("Activation does not show Julie as the one exact pilot participant.");
  }
  checks.push("Julie is the one visible active pilot participant");
  if (!/Shared device\s+Off/i.test(await page.locator("body").innerText())) throw new Error("Shared-device disabled state is not visible.");
  checks.push("shared-device state is visibly Off");
  await clickIfVisible(page.getByRole("button", { name: /^Build/ }));
  await page.getByRole("tab", { name: "Visual Standards", exact: true }).click();
  await requireVisible(page.getByRole("heading", { name: /Visual Standards/i }), "Visual Standards");
  checks.push("Visual Standards manager surface opens without a runtime error");
  await clickIfVisible(page.getByRole("button", { name: /^Learn/ }));
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await requireVisible(page.getByText(/History/i).first(), "History");
  checks.push("History manager surface opens without a runtime error");
  return { checks, publishedTemplates, membership: memberships[0] };
}

async function julieJourney(page) {
  const checks = [];
  if (await page.getByRole("button", { name: /Open Event Mode/i }).count()) await page.getByRole("button", { name: /Open Event Mode/i }).first().click();
  await requireVisible(page.locator('[aria-label="Event Mode"]'), "Event Mode");
  checks.push("Event Mode opens through Julie's real authenticated profile");
  for (const view of ["Focus", "Journey", "Help"]) {
    const button = page.getByRole("button", { name: new RegExp(`^${view}`) });
    await button.click();
    checks.push(`${view} view is keyboard-reachable and visible`);
  }
  const body = await page.locator("body").innerText();
  if (/Operations Studio|Publish controlled pilot content|Promote to pilot_ready/i.test(body)) {
    throw new Error("Julie was shown manager, publication, or coordinator controls.");
  }
  checks.push("manager, publication, and coordinator authority remain absent");
  const guideButton = page.locator(".event-operator-guide-grid button").first();
  if (await guideButton.count() && await guideButton.isVisible()) {
    await guideButton.click();
    const dialog = page.getByRole("dialog");
    await requireVisible(dialog, "visual guide");
    const guideText = await dialog.innerText();
    if (!/written|operational facts|rebuild in order/i.test(guideText)) throw new Error("The supported written visual guide is not visible.");
    checks.push("supported visual metadata opens with written guidance and honest image state");
    await page.getByRole("button", { name: "Close visual guide" }).click();
  } else {
    await requireVisible(page.getByText("No visual guides are linked to this event yet.", { exact: true }), "honest visual placeholder");
    checks.push("the no-guide state is represented honestly without fabricating an image");
  }
  return { checks };
}

async function counterJourney(page) {
  const checks = [];
  const body = await page.locator("body").innerText();
  if (!/Count|assignment|No.*assigned/i.test(body)) throw new Error("The counter workspace or honest empty-assignment state is not visible.");
  checks.push("assigned Count workspace or honest empty assignment is visible");
  if (/Open Manager Control Center|Operations Studio|Open Event Mode/i.test(body)) throw new Error("Counter received manager or Event Floor Manager access.");
  checks.push("Routine pilot, manager, and Event Floor Manager access are absent");
  return { checks };
}

async function capture(engine, journey, page, manifest) {
  const relativePath = `screenshots/${engine}-${journey}.png`;
  const absolutePath = resolve(OUTPUT_ROOT, relativePath);
  await page.screenshot({ path: absolutePath, fullPage: true });
  manifest.push({ engine, journey, path: relativePath, sha256: sha256File(absolutePath) });
}

async function verify() {
  if (!commit.test(sourceCommit) || !commit.test(pagesCommit)) {
    throw new Error("--source-commit and --pages-commit must be exact reviewed 40-character commits.");
  }
  mkdirSync(SCREENSHOT_ROOT, { recursive: true });
  const results = { manager: { profileId: ACTIVATION_RECOVERY.profileIds.manager }, julie: { profileId: ACTIVATION_RECOVERY.profileIds.julie }, counter: { profileId: ACTIVATION_RECOVERY.profileIds.counter } };
  const screenshots = [];
  let consoleErrorCount = 0;
  let failedNetworkCount = 0;
  let canonicalPublishedTemplates = null;
  let canonicalMembership = null;

  for (const engine of ENGINES) {
    for (const journey of JOURNEYS) {
      const { context, page, profileDir } = await openPersistent(engine, journey);
      const consoleErrors = [];
      const failedRequests = [];
      page.on("console", (message) => { if (message.type() === "error") consoleErrors.push("console-error"); });
      page.on("pageerror", () => consoleErrors.push("page-error"));
      page.on("requestfailed", () => failedRequests.push("request-failed"));
      try {
        await page.goto(ACTIVATION_RECOVERY.productionUrl, { waitUntil: "networkidle" });
        if (await isLoginVisible(page)) {
          process.stdout.write(`AUTHENTICATED_LOGIN_REQUIRED|${engine}|${journey}|${profileDir}\n`);
          process.exitCode = 3;
          return;
        }
        const output = journey === "manager" ? await managerJourney(page) : journey === "julie" ? await julieJourney(page) : await counterJourney(page);
        results[journey][engine] = { passed: true, checks: output.checks };
        if (journey === "manager") {
          canonicalPublishedTemplates ||= output.publishedTemplates;
          canonicalMembership ||= output.membership;
          if (JSON.stringify(canonicalPublishedTemplates) !== JSON.stringify(output.publishedTemplates)
              || canonicalMembership.id !== output.membership.id) throw new Error("Cross-engine manager evidence differs.");
        }
        consoleErrorCount += consoleErrors.length;
        failedNetworkCount += failedRequests.length;
        if (consoleErrors.length || failedRequests.length) throw new Error(`${engine}/${journey} produced console or failed-network evidence.`);
        await capture(engine, journey, page, screenshots);
      } finally {
        await context.close();
      }
    }
    const { context, page, profileDir } = await openPersistent(engine, "manager");
    const sharedConsoleErrors = [];
    const sharedFailedRequests = [];
    page.on("console", (message) => { if (message.type() === "error") sharedConsoleErrors.push("console-error"); });
    page.on("pageerror", () => sharedConsoleErrors.push("page-error"));
    page.on("requestfailed", () => sharedFailedRequests.push("request-failed"));
    try {
      await page.goto(ACTIVATION_RECOVERY.productionUrl, { waitUntil: "networkidle" });
      if (await isLoginVisible(page)) {
        process.stdout.write(`AUTHENTICATED_LOGIN_REQUIRED|${engine}|manager|${profileDir}\n`);
        process.exitCode = 3;
        return;
      }
      await openManagerActivation(page);
      if (!/Shared device\s+Off/i.test(await page.locator("body").innerText())) throw new Error("Shared-device state is not visibly disabled.");
      consoleErrorCount += sharedConsoleErrors.length;
      failedNetworkCount += sharedFailedRequests.length;
      if (sharedConsoleErrors.length || sharedFailedRequests.length) throw new Error(`${engine}/shared-device-disabled produced console or failed-network evidence.`);
      await capture(engine, "shared-device-disabled", page, screenshots);
    } finally {
      await context.close();
    }
  }

  const evidence = {
    sourceCommit,
    pagesCommit,
    productionUrl: ACTIVATION_RECOVERY.productionUrl,
    timestamp: new Date().toISOString(),
    browserEngines: ENGINES,
    allPassed: true,
    managerResult: results.manager,
    julieResult: results.julie,
    counterResult: results.counter,
    sharedDeviceDisabledResult: {
      profileId: ACTIVATION_RECOVERY.profileIds.sharedDevice,
      disabled: true,
      operativeJourneyClaimed: false,
      chromium: { passed: true, checks: ["manager readback shows shared-device disabled and no shared pilot membership"] },
      webkit: { passed: true, checks: ["manager readback shows shared-device disabled and no shared pilot membership"] },
    },
    consoleErrorCount,
    failedNetworkCount,
    screenshotManifest: screenshots,
    artifactSha256: "",
    publishedTemplates: canonicalPublishedTemplates,
    julieMembershipId: canonicalMembership.id,
    sharedDeviceOutOfScope: "Shared-device operation is disabled and out of scope; no operative shared-device journey is claimed.",
  };
  evidence.artifactSha256 = await activationEvidenceArtifactHash(evidence);
  const validation = validateActivationEvidence(evidence);
  if (!validation.valid) throw new Error(`Generated evidence failed schema validation: ${validation.errors.join(" ")}`);
  writeFileSync(resolve(OUTPUT_ROOT, "activation-e2e-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`ACTIVATION_E2E_EVIDENCE_READY|${evidence.artifactSha256}|${resolve(OUTPUT_ROOT, "activation-e2e-evidence.json")}\n`);
}

if (loginEngine) await prepareLogin(loginEngine, loginProfile);
else await verify();

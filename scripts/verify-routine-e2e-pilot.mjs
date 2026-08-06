import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { startRoutineE2EDisposableBackend, stopRoutineE2EDisposableBackend } from "./routine-e2e-disposable-backend.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 43127;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SCREENSHOTS = `/private/tmp/mesh-shift-log-phase10k4-visual-${randomUUID().slice(0, 8)}`;
const PLAYWRIGHT_CANDIDATES = [
  resolve(ROOT, "node_modules/playwright/index.mjs"),
  "/Users/robert/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
];
let server;
let disposableBackend;
let passCount = 0;
let shuttingDown = false;
if (process.argv.length > 2) throw new Error("This verifier accepts no network, URL, host, project, or production arguments.");
const check = (label, condition) => { if (!condition) throw new Error(`FAIL ${String(passCount + 1).padStart(3, "0")} ${label}`); passCount += 1; console.log(`PASS ${String(passCount).padStart(3, "0")} ${label}`); };
function command(name, args, options = {}) { const result = spawnSync(name, args, { cwd: ROOT, encoding: "utf8", timeout: options.timeout ?? 600_000, stdio: "pipe", env: { ...process.env, ...options.env } }); if (result.error) throw result.error; if (result.status !== 0) throw new Error(`${name} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`); return result; }
const source = (path) => readFileSync(resolve(ROOT, path), "utf8");
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
async function stopAfterSignal(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopServer();
  await stopRoutineE2EDisposableBackend();
  process.exit(exitCode);
}
process.once("SIGINT", () => { void stopAfterSignal(130); });
process.once("SIGTERM", () => { void stopAfterSignal(143); });

const SCENARIOS = Object.freeze([
  [1, "Manager History desktop", "chromium", "routine-history-harness.html", "manager-history-desktop", 1440, 1000],
  [2, "Manager History 390 px", "chromium", "routine-history-harness.html", "manager-history-mobile", 390, 844],
  [3, "Staff My History", "chromium", "routine-history-harness.html", "staff-my-history", 1180, 900],
  [4, "Shared operator history", "chromium", "routine-history-harness.html", "shared-operator-history", 1024, 820],
  [5, "Run detail", "chromium", "routine-history-harness.html", "run-detail", 1280, 1000],
  [6, "Task timeline", "chromium", "routine-history-harness.html", "task-timeline", 1100, 900],
  [7, "Delivery evidence", "chromium", "routine-history-harness.html", "delivery-evidence", 1180, 950],
  [8, "Mismatch comparison", "chromium", "routine-history-harness.html", "mismatch-comparison", 1180, 950],
  [9, "Reconciliation history", "chromium", "routine-history-harness.html", "reconciliation-history", 1180, 950],
  [10, "Double Shift history", "chromium", "routine-history-harness.html", "double-shift-history", 1180, 950],
  [11, "Manager override dialog", "chromium", "routine-history-harness.html", "manager-override-dialog", 1180, 900],
  [12, "Override follow-up", "chromium", "routine-history-harness.html", "override-follow-up", 1180, 900],
  [13, "History correction dialog", "chromium", "routine-history-harness.html", "history-correction-dialog", 1180, 900],
  [14, "Legacy source label", "chromium", "routine-history-harness.html", "legacy-source-label", 1100, 820],
  [15, "Unscoped legacy warning", "chromium", "routine-history-harness.html", "unscoped-legacy-warning", 1100, 820],
  [16, "Unified history", "chromium", "routine-history-harness.html", "unified-history", 1100, 820],
  [17, "Release readiness blocked", "chromium", "routine-history-harness.html", "release-readiness-blocked", 1280, 1000],
  [18, "Readiness details", "chromium", "routine-history-harness.html", "readiness-details", 1280, 1000],
  [19, "Pilot attestation dialog", "chromium", "routine-history-harness.html", "pilot-attestation-dialog", 1180, 900],
  [20, "Stale readiness error", "chromium", "routine-history-harness.html", "stale-readiness-error", 1180, 900],
  [21, "Pilot pause control", "chromium", "routine-history-harness.html", "pilot-pause-control", 1180, 900],
  [22, "Active-work pause state", "chromium", "routine-history-harness.html", "active-work-pause-state", 1180, 900],
  [23, "Sync health", "chromium", "routine-history-harness.html", "sync-health", 1024, 820],
  [24, "WebKit employee flow", "webkit", "routine-employee-harness.html", "opening-run", 390, 844],
  [25, "WebKit shared operator", "webkit", "routine-employee-harness.html", "employee-home-shared", 390, 844],
  [26, "WebKit offline/reconnect", "webkit", "routine-employee-harness.html", "offline-queued", 390, 844],
  [27, "Mobile 320", "chromium", "routine-history-harness.html", "mobile-320", 320, 720],
  [28, "Mobile 390", "webkit", "routine-history-harness.html", "mobile-390", 390, 844],
  [29, "Dark mode", "webkit", "routine-history-harness.html", "dark-mode", 1180, 900],
  [30, "200% zoom", "chromium", "routine-history-harness.html", "zoom-200", 1440, 1000],
  [31, "Keyboard-only", "webkit", "routine-history-harness.html", "keyboard-only", 1180, 900],
  [32, "Reduced motion", "webkit", "routine-history-harness.html", "reduced-motion", 1180, 900],
  [33, "Legacy back-navigation", "webkit", "routine-history-harness.html", "legacy-back-navigation", 1024, 820],
  [34, "Chunk-load recovery", "webkit", "routine-history-harness.html", "chunk-load-recovery", 1024, 820],
  [35, "Disposable full pilot flow", "chromium", "routine-history-harness.html", "disposable-full-pilot-flow", 1280, 1000],
  [36, "Disposable rollback to shadow", "webkit", "routine-history-harness.html", "disposable-rollback-shadow", 1180, 900],
]);

function sourceChecks() {
  for (const path of ["routine-history-harness.html", "src/features/routines-v2/testing/routineHistoryHarnessEntry.jsx", "public/sw.js", "docs/routine-engine-v2-production-rollout.md"]) check(`required E2E artifact exists: ${path}`, existsSync(resolve(ROOT, path)));
  const sw = source("public/sw.js");
  check("service worker uses deterministic K4 cache version", sw.includes("mesh-shift-log-v0.8.2-phase10k4-shell-v1"));
  check("service worker is network-first for navigation", /request\.mode === 'navigate'[\s\S]+fetch\(event\.request\)/.test(sw));
  check("service worker keeps Auth/RPC/Storage/Functions network-only", sw.includes("(?:auth|rest|storage|functions)") && sw.includes("credentialBearing"));
  check("service worker caches only versioned assets and public shell files", sw.includes("requestUrl.pathname.startsWith('/assets/')") && sw.includes("cacheableStatic"));
  check("service worker sends no mutation", !/method:\s*['\"](?:POST|PATCH|PUT|DELETE)['\"]/.test(sw));
  check("chunk recovery gives controlled reload", source("src/features/routines-v2/components/RoutineChunkErrorBoundary.jsx").includes("Reload current version"));
  check("history harness is not imported by production source", !source("src/App.jsx").includes("routineHistoryHarness") && !source("src/main.jsx").includes("routineHistoryHarness"));
  check("all 36 scenarios are declared exactly once", SCENARIOS.length === 36 && new Set(SCENARIOS.map(([id]) => id)).size === 36);
}

async function loadPlaywright() {
  const path = PLAYWRIGHT_CANDIDATES.find(existsSync);
  if (!path) throw new Error("Playwright is not available in the local bundled runtime.");
  return import(pathToFileURL(path).href);
}

async function startServer() {
  const vite = resolve(ROOT, "node_modules/vite/bin/vite.js");
  server = spawn(process.execPath, [vite, "--config", "scripts/vite-routine-e2e.config.mjs", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], env: {
    ...process.env, NO_COLOR: "1", VITE_SUPABASE_URL: BASE_URL, VITE_SUPABASE_ANON_KEY: disposableBackend.anonKey,
    ROUTINE_E2E_POSTGREST_TARGET: disposableBackend.baseUrl,
  } });
  let output = ""; server.stdout.on("data", (chunk) => { output += chunk; }); server.stderr.on("data", (chunk) => { output += chunk; });
  for (let attempt = 0; attempt < 100; attempt += 1) { if (server.exitCode !== null) throw new Error(`Vite exited before readiness:\n${output}`); try { const response = await fetch(`${BASE_URL}/routine-history-harness.html`); if (response.ok) return; } catch {} await delay(100); }
  throw new Error(`Vite did not become ready:\n${output}`);
}
function stopServer() { if (server?.exitCode === null) server.kill("SIGTERM"); }

async function auditPage(page) {
  return page.evaluate(() => {
    const visible = (node) => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0; };
    const controls = [...document.querySelectorAll("button,a[href],input,select,textarea")].filter(visible);
    const unnamed = controls.filter((node) => !(node.getAttribute("aria-label") || node.getAttribute("aria-labelledby") || node.labels?.length || node.textContent?.trim() || node.getAttribute("title"))).length;
    const unlabeledFields = controls.filter((node) => /^(INPUT|SELECT|TEXTAREA)$/.test(node.tagName) && node.type !== "hidden" && !(node.labels?.length || node.getAttribute("aria-label") || node.getAttribute("aria-labelledby"))).length;
    const smallTargetNodes = controls.filter((node) => { if (node.tagName === "INPUT" && ["checkbox", "radio"].includes(node.type) && node.labels?.length) return false; const rect = node.getBoundingClientRect(); return rect.height < 47.5 || rect.width < 47.5; });
    const smallTargets = smallTargetNodes.length; const smallTargetDetails = smallTargetNodes.map((node) => { const rect = node.getBoundingClientRect(); return `${node.tagName}:${node.textContent?.trim() || node.getAttribute('aria-label') || node.type}:${rect.width.toFixed(1)}x${rect.height.toFixed(1)}`; });
    const ids = [...document.querySelectorAll("[id]")].map((node) => node.id); const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index).length;
    const badDialogs = [...document.querySelectorAll('[role="dialog"]')].filter((node) => node.getAttribute("aria-modal") !== "true" || !(node.getAttribute("aria-label") || node.getAttribute("aria-labelledby"))).length;
    const badTimelines = [...document.querySelectorAll(".rh-timeline")].filter((node) => !node.getAttribute("aria-label") && !node.closest("section")?.querySelector("h1,h2,h3")).length;
    return { unnamed, unlabeledFields, smallTargets, smallTargetDetails, duplicateIds, badDialogs, badTimelines,
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      activeName: document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim().slice(0, 80) || document.activeElement?.tagName };
  });
}

async function exerciseScenario(page, id, rpcStatuses = []) {
  if ([3, 4, 35, 36].includes(id)) {
    try {
      await page.locator('[data-live-backend="passed"]').waitFor();
    } catch {
      const diagnostic = await page.evaluate(async () => {
        const auth = await import("/src/lib/supabaseAuthClient.js");
        const session = await auth.getCurrentSession().catch(() => null);
        return { body: document.body.innerText.slice(0, 800), storageKeys: Object.keys(localStorage), sessionKeys: Object.keys(sessionStorage),
          authConfigured: auth.isSupabaseAuthConfigured, authUserId: session?.user?.id || null };
      });
      throw new Error(`Disposable browser RPC did not render: ${JSON.stringify({ ...diagnostic, rpcStatuses })}`);
    }
    check(`scenario ${id} uses production clients against disposable PostgREST`, true);
    if ([3, 4].includes(id)) check(`scenario ${id} returns positively scoped history`, Number(await page.locator('[data-live-backend="passed"]').getAttribute("data-live-count")) > 0);
    if ([35, 36].includes(id)) check(`scenario ${id} replays a production mutation client without changing state`, await page.locator('[data-live-write-replay="passed"]').isVisible());
  }
  if (id === 11) await page.getByRole("button", { name: "Open manager override dialog" }).click();
  if (id === 13) await page.getByRole("button", { name: "Open history correction dialog" }).click();
  if ([19, 20].includes(id)) { await page.getByRole("button", { name: "Attest and promote to pilot_ready" }).click(); }
  if (id === 20) { await page.getByLabel("Attestation note").fill("Preserved stale readiness note"); await page.getByRole("button", { name: "Confirm controlled action" }).click(); await page.getByRole("alert").waitFor(); }
  if (id === 21) await page.getByRole("button", { name: "Resume new pilot work" }).click();
  if ([11, 13, 19, 21].includes(id)) {
    const dialog = page.getByRole("dialog"); await dialog.waitFor();
    const focusedInside = await page.evaluate(() => document.activeElement?.closest?.('[role="dialog"]') !== null); check(`scenario ${id} dialog receives focus`, focusedInside);
    await page.keyboard.press("Shift+Tab");
    const wrappedToLast = await page.evaluate(() => document.activeElement === [...document.querySelectorAll('[role="dialog"] button:not([disabled]),[role="dialog"] a[href],[role="dialog"] input:not([disabled]),[role="dialog"] select:not([disabled]),[role="dialog"] textarea:not([disabled])')].at(-1));
    check(`scenario ${id} dialog traps backward focus`, wrappedToLast);
    await page.keyboard.press("Escape"); await dialog.waitFor({ state: "detached" });
    const returnName = id === 11 ? "Open manager override dialog" : id === 13 ? "Open history correction dialog" : id === 21 ? "Resume new pilot work" : "Attest and promote to pilot_ready";
    check(`scenario ${id} dialog returns focus`, await page.getByRole("button", { name: returnName }).evaluate((node) => node === document.activeElement));
    await page.getByRole("button", { name: returnName }).click(); await page.getByRole("dialog").waitFor();
  }
  if (id === 31) { await page.keyboard.press("Tab"); await page.keyboard.press("Tab"); const focused = await page.evaluate(() => document.activeElement !== document.body && document.activeElement !== document.documentElement); check("keyboard-only flow advances logical focus", focused); }
  if (id === 34) check("chunk failure exposes current-version reload", await page.getByRole("button", { name: "Reload current version" }).isVisible());
  if (id === 26) { const storage = await page.evaluate(async () => { sessionStorage.setItem("mesh-routine-operator-session-test", "ephemeral"); const sessionRoundTrip = sessionStorage.getItem("mesh-routine-operator-session-test") === "ephemeral"; sessionStorage.removeItem("mesh-routine-operator-session-test"); const indexedDb = await new Promise((resolveOpen) => { const request = indexedDB.open("phase10k4-webkit-probe", 1); request.onupgradeneeded = () => request.result.createObjectStore("drafts"); request.onsuccess = () => { request.result.close(); indexedDB.deleteDatabase("phase10k4-webkit-probe"); resolveOpen(true); }; request.onerror = () => resolveOpen(false); }); return { sessionRoundTrip, indexedDb }; }); check("WebKit sessionStorage operator-token boundary works", storage.sessionRoundTrip); check("WebKit IndexedDB lifecycle works", storage.indexedDb); await page.context().setOffline(true); await page.waitForTimeout(50); await page.context().setOffline(false); }
}

async function runVisuals() {
  const { chromium, webkit } = await loadPlaywright(); mkdirSync(SCREENSHOTS, { recursive: true });
  const browsers = { chromium: await chromium.launch({ headless: true }), webkit: await webkit.launch({ headless: true }) };
  const contexts = { chromium: [], webkit: [] };
  try {
    for (const engine of Object.keys(browsers)) {
      contexts[engine] = [await browsers[engine].newContext(), await browsers[engine].newContext()];
      check(`${engine} has two simultaneous browser contexts`, contexts[engine].length === 2);
    }
    const results = [];
    for (const [id, name, engine, harness, scenarioName, width, height] of SCENARIOS) {
      const context = contexts[engine][id % 2]; const page = await context.newPage(); const consoleErrors = []; const pageErrors = []; const rpcStatuses = [];
      const identity = id === 3 ? "staff" : id === 4 ? "shared" : "manager";
      await page.addInitScript(({ storageKey, session, operatorSession }) => {
        localStorage.setItem(storageKey, JSON.stringify(session));
        if (operatorSession) sessionStorage.setItem("mesh:routine:operator-session:v1", JSON.stringify(operatorSession));
        else sessionStorage.removeItem("mesh:routine:operator-session:v1");
      }, { storageKey: disposableBackend.storageKey, session: disposableBackend.sessions[identity],
        operatorSession: identity === "shared" ? disposableBackend.operatorSession : null });
      page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("response", (response) => { if (response.url().includes("/rest/v1/")) rpcStatuses.push({ status: response.status(), path: new URL(response.url()).pathname }); });
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: id === 29 ? "dark" : "light", reducedMotion: id === 32 ? "reduce" : "no-preference" });
      const live = [3, 4, 35, 36].includes(id) ? "&live=1" : "";
      await page.goto(`${BASE_URL}/${harness}?scenario=${encodeURIComponent(scenarioName)}${live}`, { waitUntil: "networkidle" });
      await page.locator("body").waitFor({ state: "visible" }); await exerciseScenario(page, id, rpcStatuses);
      const audit = await auditPage(page); const overlay = await page.locator("vite-error-overlay").count();
      const screenshotPath = `${SCREENSHOTS}/${String(id).padStart(2, "0")}-${scenarioName}-${engine}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      const expectedChunkError = id === 34 && [...consoleErrors, ...pageErrors].every((value) => /Failed to fetch dynamically imported module|ThrowChunk/.test(value));
      const unexpectedConsole = expectedChunkError ? [] : consoleErrors; const unexpectedPage = expectedChunkError ? [] : pageErrors;
      check(`scenario ${id} ${name}: no unexpected console error`, unexpectedConsole.length === 0 && unexpectedPage.length === 0);
      check(`scenario ${id} ${name}: no Vite overlay`, overlay === 0);
      check(`scenario ${id} ${name}: no horizontal overflow`, audit.overflow <= 1);
      check(`scenario ${id} ${name}: automated accessibility audit`, audit.unnamed === 0 && audit.unlabeledFields === 0 && audit.duplicateIds === 0 && audit.badDialogs === 0 && audit.badTimelines === 0);
      check(`scenario ${id} ${name}: minimum touch target${audit.smallTargetDetails.length ? ` (${audit.smallTargetDetails.join(', ')})` : ''}`, audit.smallTargets === 0);
      results.push({ id, name, engine, viewport: `${width}x${height}`, result: "PASS", consoleErrors: consoleErrors.length,
        expectedConsoleErrors: expectedChunkError ? consoleErrors.length + pageErrors.length : 0, viteOverlay: overlay,
        horizontalOverflow: audit.overflow, accessibilityViolations: audit.unnamed + audit.unlabeledFields + audit.duplicateIds + audit.badDialogs + audit.badTimelines,
        minimumTouchTarget: audit.smallTargets === 0 ? ">=48px" : `${audit.smallTargets} below 48px`, screenshotPath });
      console.log(`VISUAL ${String(id).padStart(2, "0")} ${engine} ${width}x${height} PASS ${screenshotPath}`); await page.close();
    }
    check("all 36 browser scenarios passed", results.length === 36 && results.every((result) => result.result === "PASS"));
    return results;
  } finally { for (const group of Object.values(contexts)) for (const context of group) await context.close().catch(() => {}); for (const browser of Object.values(browsers)) await browser.close().catch(() => {}); }
}

async function main() {
  sourceChecks();
  const database = command("npm", ["run", "verify:routine-history-pilot"], { timeout: 600_000 });
  check("disposable server/RPC pilot flow passes", database.stdout.includes("Phase 10K4 history/pilot contract checks"));
  const build = command("npm", ["run", "build"]); check("production build succeeds", build.stdout.includes("built in"));
  const distText = readdirSync(resolve(ROOT, "dist/assets")).filter((name) => name.endsWith(".js")).map((name) => source(`dist/assets/${name}`)).join("\n");
  check("production bundle contains no harness", !/routineHistoryHarness|routineEmployeeHarness|Visual harness/.test(distText));
  check("production build emits employee chunk", readdirSync(resolve(ROOT, "dist/assets")).some((name) => name.startsWith("RoutineEmployeeWorkspace-") && name.endsWith(".js")));
  check("production build emits manager chunk", readdirSync(resolve(ROOT, "dist/assets")).some((name) => name.startsWith("RoutineManagerWorkspace-") && name.endsWith(".js")));
  check("production build emits history chunk", readdirSync(resolve(ROOT, "dist/assets")).some((name) => name.startsWith("RoutineHistoryWorkspace-") && name.endsWith(".js")));
  disposableBackend = await startRoutineE2EDisposableBackend();
  check("isolated disposable database and loopback PostgREST browser backend start", Boolean(disposableBackend.baseUrl));
  await startServer(); const results = await runVisuals();
  console.log(`Visual evidence directory: ${SCREENSHOTS}`);
  console.log(`PASS ${passCount} Phase 10K4 E2E/browser checks across ${results.length} scenarios`);
}

try { await main(); } catch (error) { console.error(String(error?.stack ?? error).replace(/v1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}/gi, "[REDACTED_OPERATOR_TOKEN]").replace(/\b[0-9]{6,12}\b/g, "[REDACTED_NUMERIC_SECRET]")); process.exitCode = 1; }
finally { stopServer(); await stopRoutineE2EDisposableBackend(); }

import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 43131;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const EVIDENCE = resolve(ROOT, "docs/production/artifacts/event-visual-browser");
const PLAYWRIGHT_CANDIDATES = [
  resolve(ROOT, "node_modules/playwright/index.mjs"),
  "/Users/robert/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
];
const scenarios = [
  ["manager-desktop", "manager", "chromium", 1440, 1000],
  ["manager-compact", "manager", "chromium", 430, 932],
  ["manager-mobile", "manager", "webkit", 390, 844],
  ["atrium-desktop", "atrium", "chromium", 1280, 1000],
  ["atrium-mobile", "atrium", "webkit", 375, 812],
  ["atrium-narrow", "atrium", "chromium", 360, 800],
  ["cornerbar-tablet", "cornerbar", "webkit", 1024, 900],
  ["cornerbar-group", "cornerbar-group", "chromium", 1180, 900],
  ["cornerbar-horseshoe", "cornerbar-horseshoe", "webkit", 390, 844],
  ["cornerbar-coffee", "cornerbar-coffee", "chromium", 430, 932],
  ["workbar-written-only", "workbar", "chromium", 390, 844],
  ["image-error-fallback", "error", "webkit", 1180, 900],
  ["keyboard-reduced-motion", "atrium", "chromium", 1024, 900],
];
let server;
let passed = 0;
const check = (label, condition) => {
  if (!condition) throw new Error(`FAIL ${String(passed + 1).padStart(3, "0")} ${label}`);
  passed += 1;
  console.log(`PASS ${String(passed).padStart(3, "0")} ${label}`);
};
const delay = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

async function startServer() {
  server = spawn(process.execPath, [resolve(ROOT, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NO_COLOR: "1" } });
  let output = "";
  server.stdout.on("data", (chunk) => { output += chunk; });
  server.stderr.on("data", (chunk) => { output += chunk; });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Vite exited before readiness:\n${output}`);
    try {
      const response = await fetch(`${BASE_URL}/event-visual-library-harness.html`);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error(`Vite did not become ready:\n${output}`);
}

async function audit(page) {
  return page.evaluate(() => {
    const visible = (node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const surface = document.querySelector('[role="dialog"]') || document;
    const controls = [...surface.querySelectorAll("button,a[href],input,select,textarea,summary")].filter(visible);
    const unnamed = controls.filter((node) => !(node.getAttribute("aria-label") || node.getAttribute("aria-labelledby") || node.labels?.length || node.textContent?.trim())).length;
    const smallTargets = controls.filter((node) => {
      if (node.tagName === "INPUT" && ["checkbox", "radio"].includes(node.type) && node.labels?.length) return false;
      const rect = node.getBoundingClientRect();
      return rect.width < 47.5 || rect.height < 47.5;
    }).map((node) => {
      const rect = node.getBoundingClientRect();
      return `${node.tagName}:${node.textContent?.trim() || node.getAttribute("aria-label") || node.type}:${rect.width.toFixed(1)}x${rect.height.toFixed(1)}`;
    });
    return {
      unnamed,
      smallTargets,
      duplicateIds: [...document.querySelectorAll("[id]")].map((node) => node.id).filter((id, index, ids) => ids.indexOf(id) !== index).length,
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
    };
  });
}

async function main() {
  check("release harness and production components exist", ["event-visual-library-harness.html", "src/testing/eventVisualLibraryHarnessEntry.jsx", "src/components/EventVisualGuideModal.jsx", "src/features/routines-v2/manager/RoutineReferenceManager.jsx"].every((path) => existsSync(resolve(ROOT, path))));
  const playwrightPath = PLAYWRIGHT_CANDIDATES.find(existsSync);
  check("bundled Playwright runtime is available", Boolean(playwrightPath));
  const { chromium, webkit } = await import(pathToFileURL(playwrightPath).href);
  mkdirSync(EVIDENCE, { recursive: true });
  await startServer();
  const browsers = { chromium: await chromium.launch({ headless: true }), webkit: await webkit.launch({ headless: true }) };
  try {
    for (const [name, scenario, engine, width, height] of scenarios) {
      const page = await browsers[engine].newPage({ viewport: { width, height }, reducedMotion: "reduce" });
      const consoleErrors = [];
      const pageErrors = [];
      page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto(`${BASE_URL}/event-visual-library-harness.html?scenario=${scenario}`, { waitUntil: "networkidle" });
      await page.locator("body").waitFor({ state: "visible" });
      if (scenario === "manager") {
        await page.getByRole("heading", { name: "Visual standards", exact: true }).waitFor();
        check(`${name} exposes venue hierarchy`, await page.getByText("Atrium", { exact: true }).first().isVisible() && await page.getByText("Cornerbar", { exact: true }).first().isVisible());
      } else {
        await page.getByRole("dialog").waitFor();
        check(`${name} exposes reconstruction sequence`, await page.getByText(/KNOW THE TARGET/).isVisible() && await page.getByText(/FINAL WALK-THROUGH/).isVisible());
        if (scenario === "workbar") check(`${name} preserves written-only source`, await page.getByText(/Written standard only/).isVisible());
        if (scenario === "error") check(`${name} keeps written fallback after image error`, await page.getByText(/complete written reconstruction remains available/i).isVisible());
        if (name === "keyboard-reduced-motion") {
          await page.getByRole("button", { name: "Close visual guide" }).focus();
          await page.keyboard.press("Shift+Tab");
          check(`${name} keeps keyboard focus inside modal`, await page.evaluate(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement)));
        }
      }
      const result = await audit(page);
      check(`${name} has no runtime errors`, consoleErrors.length === 0 && pageErrors.length === 0 && await page.locator("vite-error-overlay").count() === 0);
      check(`${name} has no horizontal overflow`, result.overflow <= 1);
      check(`${name} has named controls and unique IDs`, result.unnamed === 0 && result.duplicateIds === 0);
      check(`${name} has 48 px operational touch targets${result.smallTargets.length ? ` (${result.smallTargets.join(", ")})` : ""}`, result.smallTargets.length === 0);
      await page.screenshot({ path: resolve(EVIDENCE, `${name}-${engine}-${width}x${height}.png`), fullPage: true });
      await page.close();
    }
    check("Chromium and WebKit cover desktop, tablet, 430/390/375/360 mobile, all Cornerbar preview variants, placeholder, error, keyboard and reduced-motion states", scenarios.length === 13 && new Set(scenarios.map((entry) => entry[2])).size === 2);
    console.log(`Event visual browser verification: ${passed}/${passed} passed; evidence ${EVIDENCE}`);
  } finally {
    await browsers.chromium.close().catch(() => {});
    await browsers.webkit.close().catch(() => {});
  }
}

try {
  await main();
} finally {
  if (server?.exitCode === null) server.kill("SIGTERM");
}

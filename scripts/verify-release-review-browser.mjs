import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 43134;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const EVIDENCE = resolve(ROOT, "docs/production/artifacts/release-review-browser");
const PLAYWRIGHT_CANDIDATES = [
  resolve(ROOT, "node_modules/playwright/index.mjs"),
  "/Users/robert/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
];
const scenarios = [
  ["manager-desktop", "manager", "today", "chromium", 1440, 1000],
  ["manager-mobile", "manager", "attention", "webkit", 430, 932],
  ["event-focus-desktop", "event", "focus", "chromium", 1440, 1000],
  ["event-journey-tablet", "event", "journey", "webkit", 1024, 900],
  ["event-help-mobile", "event", "help", "chromium", 430, 932],
  ["event-focus-mobile", "event", "focus", "webkit", 390, 844],
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
      const response = await fetch(`${BASE_URL}/release-review-harness.html`);
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
    const controls = [...document.querySelectorAll("button,a[href],input,select,textarea,summary")].filter(visible);
    return {
      unnamed: controls.filter((node) => !(node.getAttribute("aria-label") || node.getAttribute("aria-labelledby") || node.labels?.length || node.textContent?.trim())).length,
      smallTargets: controls.filter((node) => { const rect = node.getBoundingClientRect(); return rect.width < 47.5 || rect.height < 47.5; }).map((node) => `${node.tagName}:${node.textContent?.trim() || node.getAttribute("aria-label")}:${node.getBoundingClientRect().width.toFixed(1)}x${node.getBoundingClientRect().height.toFixed(1)}`),
      duplicateIds: [...document.querySelectorAll("[id]")].map((node) => node.id).filter((id, index, ids) => ids.indexOf(id) !== index).length,
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
    };
  });
}

async function main() {
  check("release review harness exists", ["release-review-harness.html", "src/testing/releaseReviewHarnessEntry.jsx"].every((path) => existsSync(resolve(ROOT, path))));
  const playwrightPath = PLAYWRIGHT_CANDIDATES.find(existsSync);
  check("bundled Playwright runtime is available", Boolean(playwrightPath));
  const { chromium, webkit } = await import(pathToFileURL(playwrightPath).href);
  mkdirSync(EVIDENCE, { recursive: true });
  await startServer();
  const browsers = { chromium: await chromium.launch({ headless: true }), webkit: await webkit.launch({ headless: true }) };
  try {
    for (const [name, surface, view, engine, width, height] of scenarios) {
      const page = await browsers[engine].newPage({ viewport: { width, height }, reducedMotion: "reduce" });
      const consoleErrors = [];
      const pageErrors = [];
      page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto(`${BASE_URL}/release-review-harness.html?surface=${surface}`, { waitUntil: "networkidle" });
      if (surface === "manager") {
        await page.getByRole("region", { name: "Manager home" }).waitFor();
        if (view === "attention") await page.getByRole("button", { name: /Attention/ }).click();
        check(`${name} shows Today, Attention and Control`, await page.getByRole("button", { name: /Today/ }).isVisible() && await page.getByRole("button", { name: /Attention/ }).isVisible() && await page.getByRole("button", { name: /Control/ }).isVisible());
      } else {
        await page.getByRole("region", { name: "Event Mode" }).waitFor();
        if (view !== "focus") await page.getByRole("button", { name: new RegExp(`^${view}`, "i") }).click();
        const expected = view === "journey" ? "Everything, in the right order." : view === "help" ? "Get unstuck in seconds." : "You’ve got this.";
        check(`${name} shows Event Mode ${view}`, await page.getByText(expected, { exact: true }).isVisible());
        check(`${name} exposes Focus, Journey and Help`, await page.getByRole("button", { name: "Focus", exact: true }).isVisible() && await page.getByRole("button", { name: "Journey", exact: true }).isVisible() && await page.getByRole("button", { name: /Help/ }).isVisible());
      }
      const result = await audit(page);
      check(`${name} has no runtime errors`, consoleErrors.length === 0 && pageErrors.length === 0 && await page.locator("vite-error-overlay").count() === 0);
      check(`${name} has no horizontal overflow`, result.overflow <= 1);
      check(`${name} has named controls and unique IDs`, result.unnamed === 0 && result.duplicateIds === 0);
      check(`${name} has 48 px operational touch targets${result.smallTargets.length ? ` (${result.smallTargets.join(", ")})` : ""}`, result.smallTargets.length === 0);
      await page.screenshot({ path: resolve(EVIDENCE, `${name}-${engine}-${width}x${height}.png`), fullPage: true });
      await page.close();
    }
    check("release review covers manager and Event Mode in Chromium and WebKit at desktop, tablet and mobile sizes", scenarios.length === 6 && new Set(scenarios.map((entry) => entry[3])).size === 2);
    console.log(`Release review browser verification: ${passed}/${passed} passed; evidence ${EVIDENCE}`);
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

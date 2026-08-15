import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 43132;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const EVIDENCE = resolve(ROOT, "docs/production/artifacts/count-mode-browser");
const PLAYWRIGHT_CANDIDATES = [
  resolve(ROOT, "node_modules/playwright/index.mjs"),
  "/Users/robert/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
];
const scenarios = [
  ["standard", "chromium", 430, 932],
  ["manual", "chromium", 390, 844],
  ["standard", "webkit", 430, 932],
  ["manual", "webkit", 360, 800],
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
      const response = await fetch(`${BASE_URL}/inventory-count-mode-harness.html`);
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
    const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
    const rgb = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const channel = (value) => { const item = value / 255; return item <= 0.04045 ? item / 12.92 : ((item + 0.055) / 1.055) ** 2.4; };
    const luminance = (value) => { const [red, green, blue] = rgb(value); return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue); };
    const contrast = (foreground, background) => { const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a); return (values[0] + 0.05) / (values[1] + 0.05); };
    const manualAction = [...document.querySelectorAll("button")].find((node) => node.textContent?.trim() === "No — count differences");
    const manualStyle = manualAction ? getComputedStyle(manualAction) : null;
    return {
      unnamed: controls.filter((node) => !(node.getAttribute("aria-label") || node.getAttribute("aria-labelledby") || node.labels?.length || node.textContent?.trim())).length,
      duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index).length,
      smallTargets: controls.filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width < 47.5 || rect.height < 47.5;
      }).length,
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      manualVisible: Boolean(manualAction && visible(manualAction) && !manualAction.disabled),
      manualContrast: manualStyle ? contrast(manualStyle.color, manualStyle.backgroundColor) : null,
      manualFocusDistinct: manualStyle ? manualStyle.outlineStyle !== "none" || manualStyle.boxShadow !== "none" : false,
    };
  });
}

async function main() {
  check("Count Mode harness and production component exist", ["inventory-count-mode-harness.html", "src/testing/inventoryCountModeHarnessEntry.jsx", "src/components/InventoryCounterExperience.jsx"].every((path) => existsSync(resolve(ROOT, path))));
  const playwrightPath = PLAYWRIGHT_CANDIDATES.find(existsSync);
  check("bundled Playwright runtime is available", Boolean(playwrightPath));
  const { chromium, webkit } = await import(pathToFileURL(playwrightPath).href);
  mkdirSync(EVIDENCE, { recursive: true });
  await startServer();
  const browsers = { chromium: await chromium.launch({ headless: true }), webkit: await webkit.launch({ headless: true }) };
  try {
    for (const [mode, engine, width, height] of scenarios) {
      const page = await browsers[engine].newPage({ viewport: { width, height }, reducedMotion: "reduce" });
      const consoleErrors = [];
      const pageErrors = [];
      page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto(`${BASE_URL}/inventory-count-mode-harness.html${mode === "manual" ? "?scenario=manual-differences" : ""}`, { waitUntil: "networkidle" });
      if (mode === "standard") {
        check(`${engine} ${width}px shows the saved-standard decision`, await page.getByRole("heading", { name: "Does this fridge match its saved standard?" }).isVisible());
        check(`${engine} ${width}px preserves separate-location and no-overwrite copy`, await page.getByText(/same product in another fridge remains a separate count/i).isVisible() && await page.getByText(/never overwritten/i).isVisible());
      } else {
        check(`${engine} ${width}px opens the manual path for the current refrigerator`, await page.getByRole("heading", { name: "Count differences in Cornerbar Fridge 1." }).isVisible() && await page.getByText(/Only this refrigerator is open/).isVisible());
      }
      const result = await audit(page);
      check(`${engine} ${width}px has no errors, overflow or accessibility defects`, consoleErrors.length === 0 && pageErrors.length === 0 && result.unnamed === 0 && result.duplicateIds === 0 && result.smallTargets === 0 && result.overflow <= 1);
      await page.screenshot({ path: resolve(EVIDENCE, `count-mode-${mode}-${engine}-${width}x${height}.png`), fullPage: true });
      if (mode === "standard") {
        check(`${engine} ${width}px keeps the manual action enabled with AA contrast`, result.manualVisible && result.manualContrast >= 4.5);
        await page.getByRole("button", { name: "No — count differences" }).focus();
        check(`${engine} ${width}px gives the manual action a visible focus state`, await page.evaluate(() => { const style = getComputedStyle(document.activeElement); return style.outlineStyle !== "none" || style.boxShadow !== "none"; }));
        await page.getByRole("button", { name: "Done — count & next fridge" }).click();
        check(`${engine} ${width}px submits once and opens only the next fridge`, await page.locator("main").getAttribute("data-submit-count") === "1" && await page.getByRole("heading", { name: "Workbar Fridge 2 is next." }).isVisible() && await page.getByText(/Only Cornerbar Fridge 1 was submitted/).isVisible());
        await page.screenshot({ path: resolve(EVIDENCE, `count-mode-next-${engine}-${width}x${height}.png`), fullPage: true });
      }
      await page.close();
    }
    check("Chromium and WebKit cover the standard, manual-difference and one-tap refrigerator handoff paths", scenarios.length === 4);
    console.log(`Count Mode browser verification: ${passed}/${passed} passed; evidence ${EVIDENCE}`);
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

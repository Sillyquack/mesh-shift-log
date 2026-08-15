import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 43134;
const EXTERNAL_BASE_URL = String(process.env.RELEASE_REVIEW_BASE_URL || "").replace(/\/$/, "");
const BASE_URL = EXTERNAL_BASE_URL || `http://127.0.0.1:${PORT}`;
const EVIDENCE = resolve(ROOT, "docs/production/artifacts/release-review-browser");
const PLAYWRIGHT_CANDIDATES = [
  resolve(ROOT, "node_modules/playwright/index.mjs"),
  "/Users/robert/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
];
const VIEWPORTS = [
  [1440, 1000],
  [1280, 900],
  [1024, 900],
  [430, 932],
  [390, 844],
  [375, 812],
  [360, 800],
];
const SURFACES = [
  ["review-index", "/release-review-preview.html", "index"],
  ["manager-home", "/release-review-harness.html?surface=manager", "manager"],
  ["event-mode", "/release-review-harness.html?surface=event", "event"],
  ["operations-today", "/routine-manager-harness.html?scenario=review-today", "operations"],
  ["operations-content", "/routine-manager-harness.html?scenario=review-content", "operations"],
  ["operations-routines", "/routine-manager-harness.html?scenario=review-routines", "operations"],
  ["operations-visual-standards", "/routine-manager-harness.html?scenario=review-visual-standards", "operations"],
  ["operations-places-standards", "/routine-manager-harness.html?scenario=review-places-standards", "operations"],
  ["operations-people-devices", "/routine-manager-harness.html?scenario=review-people-devices", "operations"],
  ["operations-access", "/routine-manager-harness.html?scenario=review-access", "operations"],
  ["operations-history", "/routine-manager-harness.html?scenario=review-history", "operations"],
  ["operations-release-readiness", "/routine-manager-harness.html?scenario=review-release-readiness", "operations"],
  ["workbar-milk-fridge", "/fridge-standards-review-harness.html?scenario=milk-fridge", "fridge-milk"],
  ["espresso-milk-reservoirs", "/fridge-standards-review-harness.html?scenario=espresso-reservoirs", "fridge-espresso"],
  ["cornerbar-saved-standard", "/fridge-standards-review-harness.html?scenario=cornerbar-saved-standard", "fridge-cornerbar"],
  ["workbar-non-alco-fridge", "/fridge-standards-review-harness.html?scenario=workbar-non-alco-fridge", "fridge-non-alco"],
  ["count-standard", "/inventory-count-mode-harness.html", "count-standard"],
  ["count-manual", "/inventory-count-mode-harness.html?scenario=manual-differences", "count-manual"],
];
const scenarios = ["chromium", "webkit"].flatMap((engine) => SURFACES.map(([name, path, kind], index) => {
  const [width, height] = VIEWPORTS[index % VIEWPORTS.length];
  return [`${name}-${engine}`, path, kind, engine, width, height];
}));
let server;
let passed = 0;
const check = (label, condition) => {
  if (!condition) throw new Error(`FAIL ${String(passed + 1).padStart(3, "0")} ${label}`);
  passed += 1;
  console.log(`PASS ${String(passed).padStart(3, "0")} ${label}`);
};
const delay = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

async function startServer() {
  if (EXTERNAL_BASE_URL) {
    const response = await fetch(`${BASE_URL}/release-review-harness.html`);
    if (!response.ok) throw new Error(`Existing review server returned HTTP ${response.status}.`);
    return;
  }
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
    const parseRgb = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const channel = (value) => {
      const normalized = value / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (value) => {
      const [red, green, blue] = parseRgb(value);
      return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
    };
    const ratio = (foreground, background) => {
      const light = Math.max(luminance(foreground), luminance(background));
      const dark = Math.min(luminance(foreground), luminance(background));
      return (light + 0.05) / (dark + 0.05);
    };
    const effectiveBackground = (node) => {
      let current = node;
      while (current) {
        const value = getComputedStyle(current).backgroundColor;
        const parts = value.match(/[\d.]+/g)?.map(Number) || [];
        if (parts.length >= 3 && (parts.length < 4 || parts[3] >= 0.8)) return value;
        current = current.parentElement;
      }
      return getComputedStyle(document.documentElement).backgroundColor;
    };
    const keyText = [...document.querySelectorAll("h1,h2,button,[role='alert'],.rh-callout,.mesh-review-context,.rm-review-fixture,.counter-standard-decision")].filter((node) => visible(node) && node.textContent?.trim());
    const contrastFailures = keyText.map((node) => {
      const style = getComputedStyle(node);
      const background = effectiveBackground(node);
      return { label: node.textContent.trim().replace(/\s+/g, " ").slice(0, 64), foreground: style.color, background, ratio: ratio(style.color, background) };
    }).filter((entry) => entry.ratio < 4.45);
    return {
      unnamed: controls.filter((node) => !(node.getAttribute("aria-label") || node.getAttribute("aria-labelledby") || node.labels?.length || node.textContent?.trim())).length,
      smallTargets: controls.filter((node) => {
        if (node.tagName === "INPUT" && ["checkbox", "radio"].includes(node.type) && node.labels?.length && node.labels[0].getBoundingClientRect().height >= 47.5) return false;
        const rect = node.getBoundingClientRect();
        return rect.width < 47.5 || rect.height < 47.5;
      }).map((node) => `${node.tagName}:${node.textContent?.trim() || node.getAttribute("aria-label")}:${node.getBoundingClientRect().width.toFixed(1)}x${node.getBoundingClientRect().height.toFixed(1)}`),
      duplicateIds: [...document.querySelectorAll("[id]")].map((node) => node.id).filter((id, index, ids) => ids.indexOf(id) !== index).length,
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      contrastFailures,
      labelsSeparated: [...document.querySelectorAll(".rm-experience-groups > button")].every((node) => node.querySelector(":scope > span") && node.querySelector(":scope > small")),
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
    for (const [name, path, kind, engine, width, height] of scenarios) {
      const page = await browsers[engine].newPage({ viewport: { width, height }, reducedMotion: "reduce" });
      const consoleErrors = [];
      const pageErrors = [];
      page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle" });
      if (kind === "index") {
        await page.getByRole("heading", { name: "17 August production candidate" }).waitFor();
        check(`${name} distinguishes target, legacy, pre-cutover and simulation`, await page.getByRole("heading", { name: "Final target experience" }).isVisible() && await page.getByRole("heading", { name: "Current stage-gated legacy experience" }).isVisible() && await page.getByText("Current pre-cutover state", { exact: true }).isVisible() && await page.getByRole("heading", { name: "Simulated review states" }).isVisible());
      } else if (kind === "manager") {
        await page.getByRole("region", { name: "Manager home" }).waitFor();
        check(`${name} shows Today, Attention and Control`, await page.getByRole("button", { name: /Today/ }).isVisible() && await page.getByRole("button", { name: /Attention/ }).isVisible() && await page.getByRole("button", { name: /Control/ }).isVisible());
        check(`${name} labels deterministic review data`, await page.getByRole("note").getByText(/Review fixture/).isVisible());
      } else if (kind === "event") {
        await page.getByRole("region", { name: "Event Mode" }).waitFor();
        check(`${name} exposes Focus, Journey and Help`, await page.getByRole("button", { name: "Focus", exact: true }).isVisible() && await page.getByRole("button", { name: "Journey", exact: true }).isVisible() && await page.getByRole("button", { name: /Help/ }).isVisible());
        check(`${name} labels the final-target fixture`, await page.getByRole("note").getByText(/Final target Event Mode/).isVisible());
      } else if (kind === "operations") {
        await page.getByRole("heading", { name: "Operations Studio", exact: true }).waitFor();
        await page.locator(".rm-review-fixture").waitFor();
        check(`${name} exposes the five structured work areas`, await page.evaluate(() => ["Today", "Build", "People", "History", "System"].every((label) => [...document.querySelectorAll(".rm-experience-groups > button > span")].some((node) => node.textContent?.trim() === label))));
        check(`${name} renders group labels and descriptions separately`, await page.evaluate(() => [...document.querySelectorAll(".rm-experience-groups > button")].length === 5 && [...document.querySelectorAll(".rm-experience-groups > button")].every((node) => node.querySelector(":scope > span") && node.querySelector(":scope > small"))));
        const activeGroupGeometry = await page.evaluate(() => {
          const nav = document.querySelector(".rm-experience-groups");
          const active = nav?.querySelector("button.is-active");
          if (!nav || !active) return { ok: false };
          const navRect = nav.getBoundingClientRect();
          const activeRect = active.getBoundingClientRect();
          const noPartialGroups = [...nav.querySelectorAll("button")].every((button) => {
            const rect = button.getBoundingClientRect();
            const outside = rect.right <= navRect.left + 1 || rect.left >= navRect.right - 1;
            const inside = rect.left >= navRect.left - 1 && rect.right <= navRect.right + 1;
            return outside || inside;
          });
          return {
            ok: activeRect.left >= navRect.left - 1 && activeRect.right <= navRect.right + 1 && noPartialGroups,
            noPartialGroups,
            navLeft: navRect.left,
            navRight: navRect.right,
            activeLeft: activeRect.left,
            activeRight: activeRect.right,
            scrollLeft: nav.scrollLeft,
            scrollWidth: nav.scrollWidth,
            clientWidth: nav.clientWidth,
          };
        });
        check(`${name} keeps the active work area fully visible ${JSON.stringify(activeGroupGeometry)}`, activeGroupGeometry.ok);
        check(`${name} marks fixture state explicitly`, await page.locator(".rm-review-fixture").getByText(/no backend writes/i).isVisible());
      } else if (kind.startsWith("fridge-")) {
        await page.getByRole("note").getByText(/no backend writes/i).waitFor();
        check(`${name} labels organization ownership`, await page.getByText("Organization-owned operational standard", { exact: true }).isVisible());
        check(`${name} uses no person-owned standard terminology`, await page.getByText(/(?:Bobby|Robert|Julie)(?:’s|'s)? (?:standard|source)/i).count() === 0);
        if (kind === "fridge-milk") {
          check(`${name} shows exact top and exclusive lower shelves`, await page.getByRole("heading", { name: "Exactly 2 regular milk + 2 Oatly" }).isVisible()
            && await page.getByRole("heading", { name: "Opened, visibly date-labelled wine only" }).isVisible());
        } else if (kind === "fridge-espresso") {
          check(`${name} keeps reservoirs distinct from carton storage`, await page.getByRole("heading", { name: "Espresso-machine milk reservoirs" }).isVisible()
            && await page.getByText(/confirm both reservoirs are correctly connected/i).isVisible());
        } else if (kind === "fridge-cornerbar") {
          check(`${name} resolves the saved standards and keeps equipment on`, await page.getByRole("heading", { name: "Current manager-maintained location standards" }).isVisible()
            && await page.getByText(/Keep every refrigerator and its internal light on/).isVisible());
        } else if (kind === "fridge-non-alco") {
          check(`${name} uses the canonical saved-standard flow and keeps equipment on`, await page.getByRole("heading", { name: "Workbar Non-Alco Fridge" }).isVisible()
            && await page.getByRole("heading", { name: "Current manager-maintained location standards" }).isVisible()
            && await page.getByText(/Check dates and FIFO, place and front every product correctly/i).isVisible()
            && await page.getByText(/refrigerator and its internal light remain on/i).isVisible()
            && await page.getByRole("heading", { name: "One saved standard · one refrigerator" }).isVisible());
        }
      } else if (kind === "count-standard") {
        await page.getByRole("heading", { name: "Does this fridge match its saved standard?" }).waitFor();
        check(`${name} exposes the manual difference action`, await page.getByRole("button", { name: "No — count differences" }).isVisible() && await page.getByRole("button", { name: "No — count differences" }).isEnabled());
      } else if (kind === "count-manual") {
        await page.getByRole("heading", { name: "Count differences in Cornerbar Fridge 1." }).waitFor();
        check(`${name} preserves current-fridge and no-overwrite context`, await page.getByText(/Only this refrigerator is open/).isVisible() && await page.getByText(/never overwritten/).isVisible());
      }
      const result = await audit(page);
      check(`${name} has no runtime errors`, consoleErrors.length === 0 && pageErrors.length === 0 && await page.locator("vite-error-overlay").count() === 0);
      check(`${name} has no horizontal overflow`, result.overflow <= 1);
      check(`${name} has named controls and unique IDs`, result.unnamed === 0 && result.duplicateIds === 0);
      check(`${name} has 48 px operational touch targets${result.smallTargets.length ? ` (${result.smallTargets.join(", ")})` : ""}`, result.smallTargets.length === 0);
      check(`${name} key text and controls meet AA contrast${result.contrastFailures.length ? ` (${result.contrastFailures.map((entry) => `${entry.label}:${entry.ratio.toFixed(2)} ${entry.foreground}/${entry.background}`).join(", ")})` : ""}`, result.contrastFailures.length === 0);
      await page.screenshot({ path: resolve(EVIDENCE, `${name}-${engine}-${width}x${height}.png`), fullPage: true });
      await page.close();
    }
    check("release review covers every requested surface in Chromium and WebKit and every requested viewport in each engine", scenarios.length === SURFACES.length * 2 && new Set(scenarios.map((entry) => entry[3])).size === 2 && ["chromium", "webkit"].every((engine) => new Set(scenarios.filter((entry) => entry[3] === engine).map((entry) => entry[4])).size === VIEWPORTS.length));
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

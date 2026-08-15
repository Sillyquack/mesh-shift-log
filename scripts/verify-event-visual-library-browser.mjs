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
const VIEWPORTS = [
  [1440, 1000],
  [1280, 900],
  [1024, 900],
  [430, 932],
  [390, 844],
  [375, 812],
  [360, 800],
];
const GUIDE_SCENARIOS = ["atrium", "cornerbar", "cornerbar-group", "cornerbar-horseshoe", "cornerbar-coffee", "workbar", "workbar-milk-fridge", "workbar-non-alco-fridge", "error"];
const scenarios = ["chromium", "webkit"].flatMap((engine) => GUIDE_SCENARIOS.map((scenario, index) => {
  const [width, height] = scenario === "error" ? VIEWPORTS[0] : VIEWPORTS[index % VIEWPORTS.length];
  return [
  `${scenario}-${engine}-${width}`,
  scenario,
  engine,
  width,
  height,
  ];
}));
const managerScenarios = [
  ["manager-desktop", "manager", "chromium", 1440, 1000],
  ["manager-mobile", "manager", "webkit", 390, 844],
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
    const dialog = document.querySelector('[role="dialog"]');
    const body = dialog?.querySelector(".event-visual-guide-body");
    const journey = dialog?.querySelector(".event-visual-guide-journey");
    const rail = dialog?.querySelector(".event-visual-guide-checklist");
    const footer = dialog?.querySelector(".event-visual-guide-footer");
    const dialogRect = dialog?.getBoundingClientRect();
    const bodyRect = body?.getBoundingClientRect();
    const journeyRect = journey?.getBoundingClientRect();
    const railRect = rail?.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();
    const sideBySide = Boolean(journeyRect && railRect && Math.abs(journeyRect.top - railRect.top) <= 2 && railRect.left > journeyRect.left);
    const wrapOffenders = dialog ? [...dialog.querySelectorAll("h2,h3,h4,p,li,strong,small")].filter((node) => {
      if (!visible(node)) return false;
      const style = getComputedStyle(node);
      return style.wordBreak === "break-all" || style.hyphens === "auto" || node.scrollWidth > node.clientWidth + 1;
    }).map((node) => `${node.tagName}:${node.textContent?.trim().slice(0, 48)}`) : [];
    const visibleCards = dialog && footerRect ? [...dialog.querySelectorAll(".event-visual-guide-card")].filter((node) => {
      const rect = node.getBoundingClientRect();
      return visible(node) && rect.bottom > (bodyRect?.top || 0) && rect.top < (bodyRect?.bottom || innerHeight);
    }) : [];
    const footerCardOverlap = visibleCards.some((node) => Math.min(node.getBoundingClientRect().bottom, bodyRect?.bottom || innerHeight) > footerRect.top + 1);
    const zoneActions = dialog ? [...dialog.querySelectorAll(".event-visual-guide-zone > header button")].filter(visible) : [];
    return {
      unnamed,
      smallTargets,
      duplicateIds: [...document.querySelectorAll("[id]")].map((node) => node.id).filter((id, index, ids) => ids.indexOf(id) !== index).length,
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      dialogWithinViewport: !dialogRect || (dialogRect.left >= -1 && dialogRect.right <= innerWidth + 1 && dialogRect.top >= -1 && dialogRect.bottom <= innerHeight + 1),
      bodyFooterSeparated: !bodyRect || !footerRect || bodyRect.bottom <= footerRect.top + 1,
      footerCardOverlap,
      sideBySide,
      railWidth: railRect?.width || 0,
      wrapOffenders,
      zoneActionCount: zoneActions.length,
      disabledZoneActions: zoneActions.filter((node) => node.disabled).length,
    };
  });
}

async function auditScrolledEnd(page) {
  return page.evaluate(() => {
    const body = document.querySelector(".event-visual-guide-body");
    const footer = document.querySelector(".event-visual-guide-footer");
    const lastCard = [...document.querySelectorAll(".event-visual-guide-card")].at(-1);
    if (!body || !footer || !lastCard) return { clear: true };
    body.scrollTop = body.scrollHeight;
    const cardRect = lastCard.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    return {
      clear: cardRect.bottom <= bodyRect.bottom + 1 && cardRect.bottom <= footerRect.top + 1,
      cardBottom: cardRect.bottom,
      bodyBottom: bodyRect.bottom,
      footerTop: footerRect.top,
      scrollTop: body.scrollTop,
      scrollHeight: body.scrollHeight,
      clientHeight: body.clientHeight,
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
    for (const [name, scenario, engine, width, height] of [...scenarios, ...managerScenarios]) {
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
        check(`${name} exposes honest readiness states`, await page.getByText(/required ready/i).first().isVisible() && await page.getByText(/awaiting upload/i).first().isVisible() && await page.getByText(/not created/i).first().isVisible() && await page.getByText(/optional angles/i).first().isVisible());
        check(`${name} does not fabricate a zero-item perfect score`, await page.getByText(/0\/0.*100%/).count() === 0 && await page.getByText("Written standard only", { exact: true }).count() > 0);
      } else {
        await page.getByRole("dialog").waitFor();
        check(`${name} exposes reconstruction sequence`, await page.getByText(/KNOW THE TARGET/).isVisible() && await page.getByText(/FINAL WALK-THROUGH/).isVisible());
        if (scenario === "workbar") check(`${name} preserves written-only source`, await page.getByText(/Written standard only/).isVisible());
        if (scenario === "workbar-milk-fridge") {
          check(`${name} exposes the complete three-zone fridge standard`, await page.getByText("Full refrigerator", { exact: true }).isVisible()
            && await page.getByText("Top shelf", { exact: true }).isVisible()
            && await page.getByText("Lower shelves", { exact: true }).isVisible());
          check(`${name} states the exact permanent shelf allocation`, await page.getByText(/Exactly 2 regular milk cartons and 2 Oatly cartons/).first().isVisible()
            && await page.getByText(/Opened and visibly date-labelled wine only/).first().isVisible());
        }
        if (scenario === "workbar-non-alco-fridge") {
          check(`${name} reuses the canonical Workbar Non-Alco Fridge reference`, await page.getByRole("heading", { name: "Workbar Non-Alco Fridge" }).isVisible()
            && await page.getByText("Full refrigerator", { exact: true }).isVisible());
          check(`${name} resolves the saved standard and keeps refrigerator and light on`, await page.getByText(/Resolve the current saved location standard dynamically/).isVisible()
            && await page.getByText(/Keep the refrigerator and its internal light on/).isVisible());
        }
        if (scenario === "error") check(`${name} keeps written fallback after image error`, await page.getByText(/complete written reconstruction remains available/i).isVisible());
        await page.getByRole("button", { name: "Close visual guide" }).focus();
        await page.keyboard.press("Shift+Tab");
        check(`${name} keeps keyboard focus inside modal`, await page.evaluate(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement)));
      }
      const result = await audit(page);
      check(`${name} has no runtime errors`, consoleErrors.length === 0 && pageErrors.length === 0 && await page.locator("vite-error-overlay").count() === 0);
      check(`${name} has no horizontal overflow`, result.overflow <= 1);
      check(`${name} has named controls and unique IDs`, result.unnamed === 0 && result.duplicateIds === 0);
      check(`${name} has 48 px operational touch targets${result.smallTargets.length ? ` (${result.smallTargets.join(", ")})` : ""}`, result.smallTargets.length === 0);
      check(`${name} keeps the review surface inside the viewport`, result.dialogWithinViewport);
      if (scenario !== "manager") {
        check(`${name} preserves normal wrapping${result.wrapOffenders.length ? ` (${result.wrapOffenders.join(", ")})` : ""}`, result.wrapOffenders.length === 0);
        const endState = await auditScrolledEnd(page);
        check(`${name} keeps the body and cards clear of the footer ${JSON.stringify({ bodyFooterSeparated: result.bodyFooterSeparated, footerCardOverlap: result.footerCardOverlap, endState })}`, result.bodyFooterSeparated && !result.footerCardOverlap && endState.clear);
        check(`${name} provides visible enabled zone actions`, result.zoneActionCount > 0 && result.disabledZoneActions === 0);
        check(`${name} uses a 280 px minimum rail when side-by-side`, !result.sideBySide || result.railWidth >= 279.5);
        await page.evaluate(() => {
          const body = document.querySelector(".event-visual-guide-body");
          if (body) body.scrollTop = 0;
        });
      }
      await page.screenshot({ path: resolve(EVIDENCE, `${name}-${engine}-${width}x${height}.png`), fullPage: true });
      if (scenario !== "manager") {
        await page.getByRole("button", { name: "Close visual guide" }).click();
        await page.getByRole("dialog").waitFor({ state: "detached" });
        await page.locator("#return-focus").focus();
        await page.keyboard.press("Enter");
        await page.getByRole("dialog").waitFor();
        await page.getByRole("button", { name: "Close visual guide" }).click();
        await page.getByRole("dialog").waitFor({ state: "detached" });
        check(`${name} returns focus to its launcher`, await page.evaluate(() => document.activeElement?.id === "return-focus"));
      }
      await page.close();
    }
    check("Chromium and WebKit each cover all nine guides, seven widths and manager states", scenarios.length === GUIDE_SCENARIOS.length * 2
      && managerScenarios.length === 2
      && new Set(scenarios.map((entry) => entry[2])).size === 2
      && ["chromium", "webkit"].every((engine) => new Set(scenarios.filter((entry) => entry[2] === engine).map((entry) => entry[3])).size === VIEWPORTS.length));
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

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 43136;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const PLAYWRIGHT_CANDIDATES = [
  resolve(ROOT, "node_modules/playwright/index.mjs"),
  "/Users/robert/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
];
const VIEWPORTS = [[1440,1000],[1280,900],[1024,900],[430,932],[390,844],[375,812],[360,800]];
let server;
let passed = 0;
const check = (label, condition) => {
  if (!condition) throw new Error(`FAIL ${String(passed + 1).padStart(3, "0")} ${label}`);
  passed += 1; console.log(`PASS ${String(passed).padStart(3, "0")} ${label}`);
};
const delay = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

async function startServer() {
  server = spawn(process.execPath, [resolve(ROOT,"node_modules/vite/bin/vite.js"),"--host","127.0.0.1","--port",String(PORT),"--strictPort"], { cwd: ROOT, stdio: ["ignore","pipe","pipe"], env: { ...process.env, NO_COLOR: "1" } });
  let output = ""; server.stdout.on("data", (chunk) => { output += chunk; }); server.stderr.on("data", (chunk) => { output += chunk; });
  for (let attempt=0; attempt<100; attempt+=1) {
    if (server.exitCode !== null) throw new Error(`Vite exited before readiness:\n${output}`);
    try { const response = await fetch(`${BASE_URL}/routine-manager-harness.html?scenario=review-activation`); if (response.ok) return; } catch {}
    await delay(100);
  }
  throw new Error(`Vite did not become ready:\n${output}`);
}

async function main() {
  check("existing manager harness contains Activation without a public standalone page", existsSync(resolve(ROOT,"routine-manager-harness.html")) && !existsSync(resolve(ROOT,"activation.html")));
  const playwrightPath = PLAYWRIGHT_CANDIDATES.find(existsSync); check("bundled Playwright runtime is available", Boolean(playwrightPath));
  const { chromium, webkit } = await import(pathToFileURL(playwrightPath).href); await startServer();
  const browsers = { chromium: await chromium.launch({ headless: true }), webkit: await webkit.launch({ headless: true }) };
  try {
    for (const engine of ["chromium","webkit"]) for (const [width,height] of VIEWPORTS) {
      const page = await browsers[engine].newPage({ viewport: { width,height }, reducedMotion: "reduce" });
      const errors = []; page.on("console", (message) => { if (message.type()==="error") errors.push(message.text()); }); page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${BASE_URL}/routine-manager-harness.html?scenario=review-activation`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "Activation", exact: true }).waitFor();
      const audit = await page.evaluate(() => ({
        overflow: Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
        selected: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim(),
        calls: globalThis.__activationHarnessCalls.length,
        unnamed: [...document.querySelectorAll("button,a[href],input,textarea")].filter((node) => { const rect=node.getBoundingClientRect(); return rect.width&&rect.height&&!(node.getAttribute("aria-label")||node.getAttribute("aria-labelledby")||node.labels?.length||node.textContent?.trim()); }).map((node)=>({tag:node.tagName,type:node.getAttribute("type"),id:node.id,className:node.className})),
        smallButtons: [...document.querySelectorAll("button")].filter((node) => { const rect=node.getBoundingClientRect(); return rect.width&&rect.height&&rect.height<44; }).length,
      }));
      check(`${engine} Activation ${width}x${height} has no write-on-render, overflow, runtime, naming, or touch-target failure ${JSON.stringify({ errors, audit })}`, errors.length===0 && audit.overflow<=1 && audit.selected==="Activation" && audit.calls===0 && audit.unnamed.length===0 && audit.smallButtons===0);
      if (width===390) {
        await page.getByLabel("Operation note").fill("Reviewed local retry evidence.");
        await page.getByLabel(/I confirm the current Opening and Closing drafts/i).check();
        const confirmation = page.getByLabel("Type INSTALL 1.5R");
        await confirmation.fill("INSTALL 1.5R");
        await page.getByRole("button", { name: "Prepare and install 1.5R" }).click();
        await page.getByText("The server could not be reached. Your draft is still here.").waitFor();
        check(`${engine} network failure preserves typed note and exact phrase`, await page.getByLabel("Operation note").inputValue()==="Reviewed local retry evidence." && await confirmation.inputValue()==="INSTALL 1.5R");
        await page.getByRole("button", { name: "Prepare and install 1.5R" }).click();
        const calls = await page.evaluate(() => globalThis.__activationHarnessCalls);
        check(`${engine} retry reuses one stable idempotency key and state hash`, calls.length===2 && calls[0].idempotencyKey===calls[1].idempotencyKey && calls[0].expectedStateHash===calls[1].expectedStateHash);
      }
      await page.close();
    }
    console.log(`Activation browser verification: ${passed}/${passed} passed.`);
  } finally { await browsers.chromium.close().catch(()=>{}); await browsers.webkit.close().catch(()=>{}); }
}

try { await main(); } finally { if (server?.exitCode===null) server.kill("SIGTERM"); }

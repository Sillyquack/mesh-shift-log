import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 43137;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const TARGET_TYPES = ["zone","room","station","storage","storage_zone","shelf","fridge","toilet","door","equipment","collection_point","other"];
const TARGET_DEPENDENCY_TYPES = ["must_complete","must_resolve","must_reach_time","must_receive_transfer","complete_predecessor_on_successor"];
const EVIDENCE_DIR = resolve(ROOT, "docs/production/artifacts/routine-provider-vocabulary-browser");
const PLAYWRIGHT_CANDIDATES = [
  resolve(ROOT, "node_modules/playwright/index.mjs"),
  "/Users/robert/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
];
let server;
let passed = 0;
const delay = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
const check = (label, condition) => {
  if (!condition) throw new Error(`FAIL ${String(passed + 1).padStart(3,"0")} ${label}`);
  passed += 1;
  console.log(`PASS ${String(passed).padStart(3,"0")} ${label}`);
};

async function startServer() {
  server = spawn(process.execPath, [resolve(ROOT,"node_modules/vite/bin/vite.js"),"--host","127.0.0.1","--port",String(PORT),"--strictPort"], {
    cwd: ROOT,
    stdio: ["ignore","pipe","pipe"],
    env: { ...process.env, NO_COLOR: "1" },
  });
  let output = "";
  server.stdout.on("data", (chunk) => { output += chunk; });
  server.stderr.on("data", (chunk) => { output += chunk; });
  for (let attempt=0; attempt<100; attempt+=1) {
    if (server.exitCode !== null) throw new Error(`Vite exited before readiness:\n${output}`);
    try {
      const response = await fetch(`${BASE_URL}/routine-manager-harness.html?scenario=location-vocabulary`);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error(`Vite did not become ready:\n${output}`);
}

async function main() {
  check("Routine manager harness exists", existsSync(resolve(ROOT,"routine-manager-harness.html")));
  const playwrightPath = PLAYWRIGHT_CANDIDATES.find(existsSync);
  check("bundled Playwright runtime is available", Boolean(playwrightPath));
  const { chromium, webkit } = await import(pathToFileURL(playwrightPath).href);
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  await startServer();
  const browsers = { chromium: await chromium.launch({ headless:true }), webkit: await webkit.launch({ headless:true }) };
  try {
    for (const engine of ["chromium","webkit"]) for (const [width,height] of [[1440,1000],[390,844]]) {
      const page = await browsers[engine].newPage({ viewport:{width,height}, reducedMotion:"reduce" });
      const errors = [];
      page.on("console", (message) => { if (message.type()==="error") errors.push(message.text()); });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${BASE_URL}/routine-manager-harness.html?scenario=location-vocabulary`, { waitUntil:"networkidle" });
      await page.getByRole("heading", { name:"Routine locations" }).waitFor();
      const typeSelect = page.getByLabel("Type");
      const options = await typeSelect.locator("option").allTextContents();
      check(`${engine} ${width} exposes the exact ordered twelve-value selector with no blank option`, JSON.stringify(options)===JSON.stringify(TARGET_TYPES));

      await page.getByRole("button", { name:/Express Shelf/ }).click();
      check(`${engine} ${width} renders existing shelf without fallback`, await typeSelect.inputValue()==="shelf");
      await page.getByLabel("Name").fill("Express Shelf edited");
      await page.getByRole("button", { name:"Save location" }).click();
      await page.getByText("Location saved with server revision.").waitFor();
      let saves = await page.evaluate(() => globalThis.__locationVocabularySaves);
      check(`${engine} ${width} save round-trips shelf while editing another field`, saves.at(-1)?.locationType==="shelf" && saves.at(-1)?.name==="Express Shelf edited");

      await page.getByRole("button", { name:/Left Reserve/ }).click();
      check(`${engine} ${width} renders existing storage_zone without fallback`, await typeSelect.inputValue()==="storage_zone");
      await page.getByLabel("Description").fill("Reserve area edited");
      await page.getByRole("button", { name:"Save location" }).click();
      await page.getByText("Location saved with server revision.").waitFor();
      saves = await page.evaluate(() => globalThis.__locationVocabularySaves);
      check(`${engine} ${width} save round-trips storage_zone while editing metadata`, saves.at(-1)?.locationType==="storage_zone" && saves.at(-1)?.metadata?.description==="Reserve area edited");

      await page.getByRole("button", { name:"New location" }).click();
      await typeSelect.focus();
      check(`${engine} ${width} keyboard focus reaches the canonical location selector`,
        await typeSelect.evaluate((node)=>node===document.activeElement));
      await page.keyboard.press("Tab");
      check(`${engine} ${width} keyboard traversal leaves the selector normally`,
        await typeSelect.evaluate((node)=>node!==document.activeElement));

      const audit = await page.evaluate(() => ({
        overflow: Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
        smallControls: [...document.querySelectorAll("button,input,select,textarea")].filter((node) => {
          const rect=node.getBoundingClientRect();
          return rect.width>0 && rect.height>0 && rect.height<44;
        }).map((node)=>({tag:node.tagName,id:node.id,height:node.getBoundingClientRect().height})),
      }));
      check(`${engine} ${width} has no overflow, console error, or undersized touch target ${JSON.stringify({errors,audit})}`, errors.length===0 && audit.overflow<=1 && audit.smallControls.length===0);
      await page.screenshot({ path:resolve(EVIDENCE_DIR,`location-vocabulary-${engine}-${width}x${height}.png`), fullPage:true });

      await page.goto(`${BASE_URL}/routine-manager-harness.html?scenario=standard-source-vocabulary`, { waitUntil:"networkidle" });
      await page.getByRole("heading", { name:"Routine standards" }).waitFor();
      await page.getByRole("button", { name:"Main Storage Fridge and Express Shelf refill" }).click();
      await page.getByText("Location standards · read only", { exact:true }).waitFor();
      await page.getByText(/authoritative inventory location standards and are provider\/system managed/i).waitFor();
      check(`${engine} ${width} renders location_standards as a known provider/system-managed read-only source`,
        await page.getByRole("button", { name:"Create immutable revision" }).count()===0);

      await page.getByRole("button", { name:"New logical standard" }).click();
      const sourceSelect = page.getByLabel("Source kind");
      const sourceValues = await sourceSelect.locator("option").evaluateAll((options)=>options.map((option)=>option.value));
      const sourceLabels = await sourceSelect.locator("option").allTextContents();
      check(`${engine} ${width} keeps location_standards out of manager-creatable choices`,
        JSON.stringify(sourceValues)===JSON.stringify(["manual","inventory_readonly","asset_registry_readonly","location_set"])
          && JSON.stringify(sourceLabels)===JSON.stringify(["Manual","Inventory · read only","Asset registry · read only","Location set"]));
      check(`${engine} ${width} read-only inspection performs no manager standard mutation`,
        (await page.evaluate(()=>globalThis.__standardVocabularyWrites)).length===0);

      const standardAudit = await page.evaluate(() => ({
        overflow: Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
        smallControls: [...document.querySelectorAll("button,input,select,textarea")].filter((node) => {
          const rect=node.getBoundingClientRect();
          return rect.width>0 && rect.height>0 && rect.height<44;
        }).map((node)=>({tag:node.tagName,id:node.id,height:node.getBoundingClientRect().height})),
      }));
      check(`${engine} ${width} standard-source view has no overflow, console error, or undersized touch target ${JSON.stringify({errors,standardAudit})}`,
        errors.length===0 && standardAudit.overflow<=1 && standardAudit.smallControls.length===0);
      await page.screenshot({ path:resolve(EVIDENCE_DIR,`standard-source-vocabulary-${engine}-${width}x${height}.png`), fullPage:true });

      await page.goto(`${BASE_URL}/routine-manager-harness.html?scenario=dependency-vocabulary`, { waitUntil:"networkidle" });
      await page.getByRole("heading", { name:"Dependency vocabulary fixture" }).waitFor();
      let dependencyType = page.getByLabel("Type").first();
      const dependencyValues = await dependencyType.locator("option").evaluateAll((options)=>options.map((option)=>option.value));
      check(`${engine} ${width} dependency selector exposes the exact five-value canonical vocabulary without a fallback`,
        JSON.stringify(dependencyValues)===JSON.stringify(TARGET_DEPENDENCY_TYPES)
          && await dependencyType.locator("option").count()===TARGET_DEPENDENCY_TYPES.length);
      check(`${engine} ${width} existing complete_predecessor_on_successor is visibly selected rather than blank`,
        await dependencyType.inputValue()==="complete_predecessor_on_successor"
          && await dependencyType.locator("option:checked").textContent()==="complete_predecessor_on_successor");
      await page.getByRole("button", { name:"Close editor" }).click();
      await page.getByText("Dependency editor closed.").waitFor();
      await page.getByRole("button", { name:"Open editor" }).click();
      dependencyType = page.getByLabel("Type").first();
      check(`${engine} ${width} closing and reopening preserves the exact provider dependency type`,
        await dependencyType.inputValue()==="complete_predecessor_on_successor");
      await page.getByLabel("Predecessor").first().selectOption("52000000-0000-4000-8000-000000000003");
      check(`${engine} ${width} changing predecessor preserves dependency type`, await dependencyType.inputValue()==="complete_predecessor_on_successor");
      await page.getByLabel("Successor").first().selectOption("52000000-0000-4000-8000-000000000001");
      check(`${engine} ${width} changing successor preserves dependency type`, await dependencyType.inputValue()==="complete_predecessor_on_successor");
      await page.getByLabel("Continuous completion relationship").first().check();
      check(`${engine} ${width} changing continuousCompletion metadata preserves dependency type`, await dependencyType.inputValue()==="complete_predecessor_on_successor");
      await dependencyType.focus();
      check(`${engine} ${width} dependency selector receives keyboard focus`, await dependencyType.evaluate((node)=>node===document.activeElement));
      await page.getByRole("button", { name:"Save complete dependency set" }).click();
      const dependencySaves = await page.evaluate(()=>globalThis.__dependencyVocabularySaves);
      check(`${engine} ${width} complete-set save submits the exact provider value and edited fields without coercion`,
        dependencySaves.length===1
          && dependencySaves[0][0].dependencyType==="complete_predecessor_on_successor"
          && dependencySaves[0][0].predecessorTaskId==="52000000-0000-4000-8000-000000000003"
          && dependencySaves[0][0].successorTaskId==="52000000-0000-4000-8000-000000000001"
          && dependencySaves[0][0].metadata.continuousCompletion===true
          && dependencySaves[0][0].metadata.fixture==="provider");
      await page.getByRole("button", { name:"Close editor" }).click();
      await page.getByRole("button", { name:"Open editor" }).click();
      dependencyType = page.getByLabel("Type").first();
      check(`${engine} ${width} authoritative reload returns complete_predecessor_on_successor unchanged`,
        await dependencyType.inputValue()==="complete_predecessor_on_successor");
      await page.getByRole("button", { name:"Add dependency" }).click();
      const dependencyTypeSelectors = page.getByLabel("Type");
      check(`${engine} ${width} newly added dependency still defaults to must_complete while all five choices remain available`,
        await dependencyTypeSelectors.count()===2
          && await dependencyTypeSelectors.nth(1).inputValue()==="must_complete"
          && JSON.stringify(await dependencyTypeSelectors.nth(1).locator("option").evaluateAll((options)=>options.map((option)=>option.value)))===JSON.stringify(TARGET_DEPENDENCY_TYPES));
      const dependencyAudit = await page.evaluate(() => ({
        overflow: Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
        smallControls: [...document.querySelectorAll("button,input,select,textarea")].filter((node) => {
          const rect=node.getBoundingClientRect();
          return rect.width>0 && rect.height>0 && rect.height<44;
        }).map((node)=>({tag:node.tagName,id:node.id,height:node.getBoundingClientRect().height})),
      }));
      check(`${engine} ${width} dependency editor has no overflow, console error, or undersized touch target ${JSON.stringify({errors,dependencyAudit})}`,
        errors.length===0 && dependencyAudit.overflow<=1 && dependencyAudit.smallControls.length===0);
      await page.screenshot({ path:resolve(EVIDENCE_DIR,`dependency-vocabulary-${engine}-${width}x${height}.png`), fullPage:true });

      await page.goto(`${BASE_URL}/routine-manager-harness.html?scenario=dependency-vocabulary-readonly`, { waitUntil:"networkidle" });
      const readOnlyDependencyType = page.getByLabel("Type").first();
      check(`${engine} ${width} read-only dependency editor displays the exact provider value`,
        await readOnlyDependencyType.isDisabled()
          && await readOnlyDependencyType.inputValue()==="complete_predecessor_on_successor"
          && await page.getByRole("button", { name:"Save complete dependency set" }).count()===0);
      await page.screenshot({ path:resolve(EVIDENCE_DIR,`dependency-vocabulary-readonly-${engine}-${width}x${height}.png`), fullPage:true });
      await page.close();
    }
    console.log(`Routine provider vocabulary browser verification: ${passed}/${passed} passed.`);
  } finally {
    await browsers.chromium.close().catch(()=>{});
    await browsers.webkit.close().catch(()=>{});
  }
}

try { await main(); }
finally { if (server?.exitCode===null) server.kill("SIGTERM"); }

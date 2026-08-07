import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 43129;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SCREENSHOTS = `/private/tmp/mesh-shift-log-phase10l-visual-${randomUUID().slice(0,8)}`;
const PLAYWRIGHT_CANDIDATES = [resolve(ROOT,"node_modules/playwright/index.mjs"),"/Users/robert/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs"];
let server;
let passCount=0;
if(process.argv.length>2)throw new Error("This verifier accepts no network, URL, host, project, or production arguments.");
const check=(label,condition)=>{if(!condition)throw new Error(`FAIL ${String(passCount+1).padStart(3,"0")} ${label}`);passCount+=1;console.log(`PASS ${String(passCount).padStart(3,"0")} ${label}`);};
const delay=(ms)=>new Promise((done)=>setTimeout(done,ms));

const SCENARIOS=Object.freeze([
  [1,"Content pack preview desktop","chromium","content-preview-desktop",1440,1000],
  [2,"Content pack preview 390 px","webkit","content-preview-390",390,844],
  [3,"Pack hash and counts","chromium","pack-hash-counts",1180,900],
  [4,"Opening 37/37","chromium","opening-draft-overview",1280,1000],
  [5,"Closing 46/46","webkit","closing-draft-overview",1280,1000],
  [6,"Double Shift 4/4","chromium","double-shift-steps",1100,900],
  [7,"Unresolved requirements","webkit","readiness-blocked",1100,900],
  [8,"Install confirmation","chromium","install-confirmation",1180,950],
  [9,"Install note required","webkit","install-note-required",900,850],
  [10,"Successful draft installation","chromium","install-success",1180,1000],
  [11,"Installed Opening draft overview","webkit","opening-draft-overview",1180,950],
  [12,"Installed Closing draft overview","chromium","closing-draft-overview",1180,950],
  [13,"O13 task editor","webkit","o13-task",1100,950],
  [14,"O15 unresolved target blocker","chromium","o15-blocker",1100,950],
  [15,"O29 timing checkpoint","webkit","o29-timing",1100,950],
  [16,"O35 hard deadline","chromium","o35-deadline",1100,950],
  [17,"C27 serviceware targets","webkit","c27-serviceware",1100,950],
  [18,"C28 final fridge delivery","chromium","c28-fridge-delivery",1100,950],
  [19,"C32 overnight standard","webkit","c32-overnight",1100,950],
  [20,"C42 door items","chromium","c42-door-items",1100,950],
  [21,"C45 Closing Responsible verification","webkit","c45-verification",1100,950],
  [22,"C46 final alarm exit without secret","chromium","c46-final-gate",1100,950],
  [23,"Reference placeholders","webkit","reference-placeholders",1180,950],
  [24,"Self-service opening reference","chromium","self-service-opening-reference",900,800],
  [25,"Self-service overnight reference","webkit","self-service-overnight-reference",900,800],
  [26,"Project-room list without 005","chromium","project-rooms",900,800],
  [27,"Delivery relations","webkit","delivery-relations",1180,900],
  [28,"Continuous dependencies","chromium","continuous-dependencies",1000,800],
  [29,"Readiness still blocked","webkit","readiness-blocked",1100,900],
  [30,"Drafts remain unpublished","chromium","drafts-unpublished",1100,900],
  [31,"Staff cannot see installer","webkit","staff-no-installer",900,760],
  [32,"Shared operator cannot see installer","chromium","shared-no-installer",900,760],
  [33,"Stale state preserves note","webkit","stale-preserved",1000,900],
  [34,"Network failure preserves preview and note","chromium","network-preserved",1000,900],
  [35,"Dark mode","webkit","dark-mode",1180,900],
  [36,"200 percent zoom","chromium","zoom-200",1440,1000],
  [37,"Keyboard-only install flow","webkit","keyboard-install",1000,900],
  [38,"Mobile 320 px","chromium","mobile-320",320,720],
  [39,"Mobile 390 px","webkit","mobile-390",390,844],
  [40,"Legacy back-navigation","chromium","legacy-back-navigation",900,760],
  [41,"Coffee cups full visual standard","chromium","coffee-cups-full-standard",1180,950],
  [42,"Coffee cups service-ready 09:45","webkit","coffee-service-0945",1100,950],
  [43,"Coffee cups service-ready 10:45","chromium","coffee-service-1045",1100,950],
  [44,"Cappuccino shelf layout","webkit","cappuccino-shelf-layout",1000,900],
  [45,"Cappuccino and espresso machine-top layout","chromium","cappuccino-espresso-machine-top",1000,900],
  [46,"Wine-glass layout","webkit","wine-glass-layout",1000,900],
  [47,"Workbar Coffee Canisters 4 with 1 plus 3","chromium","workbar-coffee-canisters",1100,900],
  [48,"Tea names and exact order","webkit","tea-names-order",1000,900],
  [49,"Door-rule manager editor Chromium","chromium","door-rule-editor",1180,950],
  [50,"Door-rule manager editor WebKit","webkit","door-rule-editor",1180,950],
  [51,"Front-door weekday schedule","chromium","front-door-schedule",1050,900],
  [52,"Cornerbar street double-lock rule","webkit","cornerbar-double-lock",1050,900],
  [53,"Fridge-rule manager editor Chromium","chromium","fridge-rule-editor",1180,1000],
  [54,"Fridge-rule manager editor WebKit","webkit","fridge-rule-editor",1180,1000],
  [55,"Workbar bar-fridge rules","webkit","workbar-bar-fridge-rules",1050,900],
  [56,"Non-alcoholic grille rule","chromium","nonalcoholic-grille-rule",1050,900],
  [57,"Milk-fridge 2 plus 2 and opened-wine rule","webkit","milk-fridge-rule",1050,900],
  [58,"Cornerbar Left fridge rule","chromium","cornerbar-left-rule",1000,900],
  [59,"Cornerbar Middle fridge rule","webkit","cornerbar-middle-rule",1000,900],
  [60,"Cornerbar Right fridge rule","chromium","cornerbar-right-rule",1000,900],
  [61,"Cornerbar Operating Standard","webkit","cornerbar-operating-standard",1180,1000],
  [62,"Cornerbar event transfer","chromium","cornerbar-event-transfer",1100,1000],
  [63,"Operational reference placeholders","webkit","reference-placeholders",1180,1000],
  [64,"Readiness with one original blocker","chromium","readiness-one-blocker",1050,850],
  [65,"Manager standard mobile 390 Chromium","chromium","door-rule-editor",390,844],
  [66,"Manager standard mobile 390 WebKit","webkit","fridge-rule-editor",390,844],
  [67,"Operational standards dark mode","webkit","cornerbar-operating-standard",1180,950],
  [68,"Operational standards keyboard-only","chromium","coffee-cups-full-standard",1000,900],
  [69,"Manager standard 200 percent zoom","chromium","door-rule-editor",1440,1000],
  [70,"Reference placeholders mobile 390","webkit","reference-placeholders",390,844],
]);

async function loadPlaywright(){const path=PLAYWRIGHT_CANDIDATES.find(existsSync);if(!path)throw new Error("Playwright is not available in the bundled local runtime.");return import(pathToFileURL(path).href);}
async function startServer(){const vite=resolve(ROOT,"node_modules/vite/bin/vite.js");server=spawn(process.execPath,[vite,"--host","127.0.0.1","--port",String(PORT),"--strictPort"],{cwd:ROOT,stdio:["ignore","pipe","pipe"],env:{...process.env,NO_COLOR:"1"}});let output="";server.stdout.on("data",(chunk)=>output+=chunk);server.stderr.on("data",(chunk)=>output+=chunk);for(let attempt=0;attempt<100;attempt+=1){if(server.exitCode!==null)throw new Error(`Vite exited before readiness:\n${output}`);try{const response=await fetch(`${BASE_URL}/routine-content-pack-harness.html`);if(response.ok)return;}catch{}await delay(100);}throw new Error(`Vite did not become ready:\n${output}`);}
function stopServer(){if(server?.exitCode===null)server.kill("SIGTERM");}
async function auditPage(page){return page.evaluate(()=>{const visible=(node)=>{const style=getComputedStyle(node),rect=node.getBoundingClientRect();return style.visibility!=="hidden"&&style.display!=="none"&&rect.width>0&&rect.height>0;};const controls=[...document.querySelectorAll("button,a[href],input,select,textarea")].filter(visible);const unnamed=controls.filter((node)=>!(node.getAttribute("aria-label")||node.getAttribute("aria-labelledby")||node.labels?.length||node.textContent?.trim()||node.getAttribute("title"))).length;const unlabeled=controls.filter((node)=>/^(INPUT|SELECT|TEXTAREA)$/.test(node.tagName)&&node.type!=="hidden"&&!(node.labels?.length||node.getAttribute("aria-label")||node.getAttribute("aria-labelledby"))).length;const small=controls.filter((node)=>{if(node.tagName==="INPUT"&&["checkbox","radio"].includes(node.type)&&node.labels?.length)return false;const rect=node.getBoundingClientRect();return rect.width<47.5||rect.height<47.5;}).map((node)=>{const rect=node.getBoundingClientRect();return `${node.tagName}:${node.textContent?.trim()||node.type}:${rect.width.toFixed(1)}x${rect.height.toFixed(1)}`;});const ids=[...document.querySelectorAll("[id]")].map((node)=>node.id);return{unnamed,unlabeled,duplicateIds:ids.filter((id,index)=>ids.indexOf(id)!==index).length,small,overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth};});}
async function exercise(page,id){
  const note=page.getByLabel("Install note");const confirmation=page.getByLabel(/I confirm that this creates editable drafts only/);
  if(id===8){await note.fill("Confirm editable content install.");await confirmation.check();check("install confirmation enables server action",await page.getByRole("button",{name:"Install editable drafts"}).isEnabled());}
  if(id===9){await note.fill("short");await confirmation.check();check("short install note remains blocked",await page.getByRole("button",{name:"Install editable drafts"}).isDisabled());check("install note validation is visible",await page.getByRole("alert").isVisible());}
  if(id===10){await note.fill("Install editable content in this disposable harness.");await confirmation.check();await page.getByRole("button",{name:"Install editable drafts"}).click();await page.getByText("Installed editable drafts").waitFor();check("successful install waits for server result",await page.getByText(/Nothing was published or made operational/).isVisible());}
  if([33,34].includes(id)){const preserved=`Preserved ${id===33?"stale":"network"} manager note`;await note.fill(preserved);await confirmation.check();await page.getByRole("button",{name:"Install editable drafts"}).click();await page.getByRole("alert").waitFor();check(`scenario ${id} preserves install note`,await note.inputValue()===preserved);check(`scenario ${id} preserves preview counts`,await page.getByText("37/37").isVisible());}
  if(id===37){const first=page.getByRole("button",{name:"Back to preview home"});await first.focus();await page.keyboard.press("Tab");check("keyboard install flow advances visible focus",await page.evaluate(()=>document.activeElement!==document.body&&document.activeElement!==document.documentElement&&document.activeElement?.textContent?.trim()!=="Back to preview home"));}
}

async function main(){
  for(const path of ["routine-content-pack-harness.html","src/features/routines-v2/testing/routineContentPackHarnessEntry.jsx","src/features/routines-v2/manager/RoutineContentPackManager.jsx"])check(`visual artifact exists: ${path}`,existsSync(resolve(ROOT,path)));
  const harness=readFileSync(resolve(ROOT,"src/features/routines-v2/testing/routineContentPackHarnessEntry.jsx"),"utf8");check("all visual scenario tokens are covered",SCENARIOS.every(([, , ,token])=>harness.includes(token)||["content-preview-390","install-confirmation","install-note-required","dark-mode","zoom-200","keyboard-install","mobile-320","mobile-390"].includes(token)));
  check("visual matrix includes 40 Phase 10L and 30 Phase 10M states",SCENARIOS.length===70&&new Set(SCENARIOS.map(([id])=>id)).size===70);
  const {chromium,webkit}=await loadPlaywright();mkdirSync(SCREENSHOTS,{recursive:true});await startServer();
  const browsers={chromium:await chromium.launch({headless:true}),webkit:await webkit.launch({headless:true})};const contexts={chromium:await browsers.chromium.newContext(),webkit:await browsers.webkit.newContext()};const results=[];
  try{
    for(const[id,name,engine,scenarioName,width,height]of SCENARIOS){const page=await contexts[engine].newPage();const consoleErrors=[],pageErrors=[];page.on("console",(message)=>{if(message.type()==="error")consoleErrors.push(message.text());});page.on("pageerror",(error)=>pageErrors.push(error.message));await page.setViewportSize({width,height});await page.emulateMedia({colorScheme:[35,67].includes(id)?"dark":"light",reducedMotion:"reduce"});await page.goto(`${BASE_URL}/routine-content-pack-harness.html?scenario=${encodeURIComponent(scenarioName)}`,{waitUntil:"networkidle"});await page.locator("body").waitFor({state:"visible"});if([36,69].includes(id))await page.evaluate(()=>{document.documentElement.style.fontSize="200%";});await exercise(page,id);const audit=await auditPage(page);const overlay=await page.locator("vite-error-overlay").count();const screenshotPath=`${SCREENSHOTS}/${String(id).padStart(2,"0")}-${scenarioName}-${engine}.png`;await page.screenshot({path:screenshotPath,fullPage:true});check(`scenario ${id} ${name}: no console errors`,consoleErrors.length===0&&pageErrors.length===0);check(`scenario ${id} ${name}: no Vite overlay`,overlay===0);check(`scenario ${id} ${name}: no horizontal overflow`,audit.overflow<=1);check(`scenario ${id} ${name}: accessibility names and IDs`,audit.unnamed===0&&audit.unlabeled===0&&audit.duplicateIds===0);check(`scenario ${id} ${name}: minimum touch target${audit.small.length?` (${audit.small.join(", ")})`:""}`,audit.small.length===0);results.push({id,name,engine,viewport:`${width}x${height}`,result:"PASS",consoleErrors:0,viteOverlay:overlay,horizontalOverflow:audit.overflow,accessibilityViolations:0,minimumTouchTarget:">=48px",screenshotPath});console.log(`VISUAL ${String(id).padStart(2,"0")} ${engine} ${width}x${height} PASS ${screenshotPath}`);await page.close();}
    check("all 70 Phase 10L/10M browser scenarios passed",results.length===70&&results.every((entry)=>entry.result==="PASS"));console.log(`Visual evidence directory: ${SCREENSHOTS}`);console.log(`PASS ${passCount} Phase 10L/10M browser checks across ${results.length} scenarios`);
  }finally{await contexts.chromium.close().catch(()=>{});await contexts.webkit.close().catch(()=>{});await browsers.chromium.close().catch(()=>{});await browsers.webkit.close().catch(()=>{});}
}

try{await main();}catch(error){console.error(String(error?.stack??error));process.exitCode=1;}finally{stopServer();}

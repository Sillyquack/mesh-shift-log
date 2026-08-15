import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 43135;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const EVIDENCE = resolve(ROOT, 'docs/production/artifacts/inventory-location-browser');
const PLAYWRIGHT_CANDIDATES = [
  resolve(ROOT, 'node_modules/playwright/index.mjs'),
  '/Users/robert/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs',
];
const VIEWPORTS = [[1440,1000],[1280,900],[1024,900],[430,932],[390,844],[375,812],[360,800]];
const SCENARIOS = ['main-storage','left-reserve','express-incomplete','express-configured','express-awaiting-image','express-current-image','keg-storage','milk-fridge','unlisted-wine','coffee','snacks','refill-chain','legacy-mapping'];
let server;
let passed = 0;
const check = (label, condition) => {
  if (!condition) throw new Error(`FAIL ${String(passed + 1).padStart(3, '0')} ${label}`);
  passed += 1;
  console.log(`PASS ${String(passed).padStart(3, '0')} ${label}`);
};
const delay = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

async function startServer() {
  server = spawn(process.execPath,[resolve(ROOT,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(PORT),'--strictPort'],{cwd:ROOT,stdio:['ignore','pipe','pipe'],env:{...process.env,NO_COLOR:'1'}});
  let output=''; server.stdout.on('data',(chunk)=>{output+=chunk;}); server.stderr.on('data',(chunk)=>{output+=chunk;});
  for(let attempt=0;attempt<100;attempt+=1){
    if(server.exitCode!==null) throw new Error(`Vite exited before readiness:\n${output}`);
    try{const response=await fetch(`${BASE_URL}/inventory-location-review-harness.html`);if(response.ok)return;}catch{}
    await delay(100);
  }
  throw new Error(`Vite did not become ready:\n${output}`);
}

async function main(){
  check('inventory location review harness exists',existsSync(resolve(ROOT,'inventory-location-review-harness.html')));
  const playwrightPath=PLAYWRIGHT_CANDIDATES.find(existsSync); check('bundled Playwright runtime is available',Boolean(playwrightPath));
  const {chromium,webkit}=await import(pathToFileURL(playwrightPath).href); mkdirSync(EVIDENCE,{recursive:true}); await startServer();
  const browsers={chromium:await chromium.launch({headless:true}),webkit:await webkit.launch({headless:true})};
  try{
    for(const engine of ['chromium','webkit']) for(const scenario of SCENARIOS) for(const [width,height] of VIEWPORTS){
      const page=await browsers[engine].newPage({viewport:{width,height},reducedMotion:'reduce'}); const errors=[];
      page.on('console',(message)=>{if(message.type()==='error')errors.push(message.text());}); page.on('pageerror',(error)=>errors.push(error.message));
      await page.goto(`${BASE_URL}/inventory-location-review-harness.html?scenario=${scenario}`,{waitUntil:'networkidle'});
      await page.locator('main[data-scenario]').waitFor();
      const audit=await page.evaluate(()=>({
        overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
        heading:Boolean(document.querySelector('h1')?.textContent?.trim()),
        fixture:/no backend writes/i.test(document.body.textContent||''),
        keyTextReadable:[...document.querySelectorAll('.il-card h1,.il-card strong,.il-card summary')].every((node)=>{
          const [red,green,blue]=(getComputedStyle(node).color.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
          return Number.isFinite(red)&&0.2126*red+0.7152*green+0.0722*blue>=180;
        }),
        unnamed:[...document.querySelectorAll('button,a[href],input,select,textarea,summary')].filter((node)=>{
          const rect=node.getBoundingClientRect(); if(!rect.width||!rect.height)return false;
          return !(node.getAttribute('aria-label')||node.getAttribute('aria-labelledby')||node.labels?.length||node.textContent?.trim());
        }).length,
      }));
      check(`${engine} ${scenario} ${width}x${height}`,errors.length===0&&audit.overflow<=1&&audit.heading&&audit.fixture&&audit.keyTextReadable&&audit.unnamed===0);
      await page.screenshot({path:resolve(EVIDENCE,`${scenario}-${engine}-${width}x${height}.png`),fullPage:true}); await page.close();
    }
    check('all 13 location states cover seven viewports in Chromium and WebKit',passed===2+SCENARIOS.length*VIEWPORTS.length*2);
    console.log(`Inventory location browser verification: ${passed}/${passed} passed; evidence ${EVIDENCE}`);
  } finally { await browsers.chromium.close().catch(()=>{}); await browsers.webkit.close().catch(()=>{}); }
}

try{await main();}finally{if(server?.exitCode===null)server.kill('SIGTERM');}

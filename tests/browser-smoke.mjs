import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.SIMSIM_PLAYWRIGHT ?? 'playwright');
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),folder=fs.mkdtempSync(path.join(os.tmpdir(),'simsim-browser-'));
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://local').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.statusCode=403;res.end();return;}
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:");
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'text/plain');
  try{res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try {
  browser=await chromium.launch({headless:true,...(process.env.SIMSIM_BROWSER_EXECUTABLE?{executablePath:process.env.SIMSIM_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForSelector('#boot[hidden]',{state:'attached'});
  assert(await page.locator('#play').isDisabled());
  assert.equal(await page.locator('#actions-open').count(),0);
  await page.waitForFunction(()=>document.getElementById('mission-status').textContent.includes('未計算'));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight));
  // Tasks open in the selected assignment context; graph authoring is a separate tab.
  await page.locator('.unit-item[data-id="patrol-uuv__1"]').click();
  await page.locator('#unit-task-open').click();
  assert.equal(await page.locator('#assignment-list').inputValue(),'island-watch');
  assert(await page.locator('#graph-editor').isHidden());
  await page.locator('#graph-edit-tab').click();
  await page.locator('[data-node="patrol"] rect').click();
  assert.deepEqual(await page.locator('#edge-condition option').evaluateAll(xs=>xs.map(x=>x.value)),['detected','received']);
  await page.locator('#task-edit-tab').click();
  await page.locator('#assignment-phase').fill('50');await page.locator('#assignment-phase').press('Tab');
  await page.locator('#behavior-apply').click();await page.waitForSelector('#behavior-dialog:not([open])',{state:'attached'});
  await page.locator('.unit-item[data-id="transit-submarine"]').click();
  await page.locator('#unit-task-open').click();assert.equal(await page.locator('#assignment-list').inputValue(),'');await page.locator('#behavior-cancel').click();
  // Save definition and verify the task parameter, not the obsolete raw unit route.
  const save=await Promise.all([page.waitForEvent('download'),page.locator('#save').click()]);
  await save[0].saveAs(path.join(folder,'scenario.jsn'));
  const source=JSON.parse(fs.readFileSync(path.join(folder,'scenario.jsn')));assert.equal(source.version,3);assert.equal(source.behaviorAssignments[0].phase,.5);
  // Compute once, seek backwards/forwards, export and reopen the record.
  await page.locator('#record-run').click();await page.waitForFunction(()=>!document.getElementById('play').disabled,{},{timeout:60000});
  const info=await page.locator('#recording-info').innerText();assert(info.includes('記録済み'));
  for(const t of [1000,20,1000]){
    await page.locator('#timeline').evaluate((el,t)=>{el.value=t;el.dispatchEvent(new Event('input',{bubbles:true}));},t);
    await page.waitForFunction(t=>{const seconds=document.getElementById('clock').textContent.split(':').map(Number);return seconds[0]*3600+seconds[1]*60+seconds[2]===t;},t);
  }
  assert.equal(await page.locator('#recording-info').innerText(),info);
  const record=await Promise.all([page.waitForEvent('download'),page.locator('#record-save').click()]);await record[0].saveAs(path.join(folder,'record.jsn'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(folder,'record.jsn'))).model,'unified-behavior-v2');
  await page.locator('#file').setInputFiles(path.join(folder,'record.jsn'));await page.waitForFunction(()=>!document.getElementById('play').disabled);assert((await page.locator('#recording-info').innerText()).includes('記録済み'));
  // New clears graph references, and Undo restores them.
  await page.locator('#new-scenario').click();assert.equal(await page.locator('.unit-item').count(),0);assert.equal(await page.locator('#task-list button').count(),0);
  await page.locator('#undo').click();assert.equal(await page.locator('.unit-item').count(),9);
  // Monte Carlo through the actual worker and trial replay.
  await page.locator('#analysis-open').click();await page.locator('#analysis-trials').fill('2');await page.locator('#analysis-trials').press('Tab');
  await page.locator('#analysis-run').click();await page.waitForFunction(()=>document.getElementById('analysis-progress').textContent.startsWith('完了'),{},{timeout:60000});
  assert((await page.locator('#analysis-progress').innerText()).includes('24 / 24'));
  await page.getByRole('button',{name:'再現',exact:true}).first().click();
  await page.waitForFunction(()=>!document.getElementById('play').disabled,{},{timeout:60000});
  // Narrow-screen layout and display controls retain their state.
  if(await page.locator('#analysis-dialog').isVisible())await page.locator('#analysis-close').click();
  await page.locator('.map-toolbar .menu-popover summary').click();await page.locator('#show-labels').uncheck();
  await page.locator('#viewtop').click();assert(!(await page.locator('#show-labels').isChecked()));
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);
  if(process.env.SIMSIM_SCREENSHOT)await page.screenshot({path:process.env.SIMSIM_SCREENSHOT,fullPage:true});
  console.log('PASS: offline CSP / static .jsn, desktop and mobile layout, contextual tasks, valid edge choices, definition save, worker calculation, seek, recording reopen, new/undo, Monte Carlo and trial replay, label toggle, no browser errors');
} finally {
  await browser?.close();await new Promise(r=>server.close(r));fs.rmSync(folder,{recursive:true,force:true});
}

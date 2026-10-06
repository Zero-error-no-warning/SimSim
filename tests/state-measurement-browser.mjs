import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const source=JSON.parse(fs.readFileSync(new URL('./fixtures/state-measurement.txt',import.meta.url)));
const {chromium}=await import(process.env.SIMSIM_PLAYWRIGHT??'playwright');
const root=path.resolve(process.env.SIMSIM_WEB_ROOT??fileURLToPath(new URL('..',import.meta.url))),folder=fs.mkdtempSync(path.join(os.tmpdir(),'simsim-navigation-'));
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://local').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.statusCode=403;res.end();return;}
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:");
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'text/plain');
  try{res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.SIMSIM_BROWSER_EXECUTABLE?{executablePath:process.env.SIMSIM_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('dialog',async d=>{await d.accept().catch(()=>{});});page.setDefaultTimeout(10000);
  page.on('pageerror',error=>errors.push(error.message));page.on('console',event=>{if(event.type()==='error')errors.push(event.text());});
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>document.getElementById('recording-info').textContent.includes('未計算'));

  const input=path.join(folder,'input.txt');fs.writeFileSync(input,JSON.stringify(source));await page.locator('#file').setInputFiles(input);
  assert.equal(await page.locator('.map-toolbar #analysis-open').count(),1);assert.equal(await page.locator('header #analysis-open').count(),0);
  await page.locator('.unit-item[data-id="template"]').click();assert(!(await page.locator('#unit-enabled').isChecked()));assert((await page.locator('.unit-item[data-id="template"]').textContent()).includes('無効'));
  await page.locator('#unit-enabled').check();assert(await page.locator('#unit-enabled').isChecked());await page.locator('#undo').click();assert(!(await page.locator('#unit-enabled').isChecked()));
  await page.locator('.unit-item[data-id="group__1"]').click();assert(await page.locator('#unit-enabled').isChecked());await page.locator('#unit-enabled').uncheck();assert((await page.locator('.unit-item[data-id="group__2"]').textContent()).includes('無効'));await page.locator('#undo').click();assert(await page.locator('#unit-enabled').isChecked());
  await page.locator('#unit-task-open').click();await page.locator('#graph-edit-tab').click();await page.locator('#behavior-fit').click();
  const node=id=>page.locator('#behavior-canvas [data-node="'+id+'"] > rect:first-child');
  await node('a').click();await page.locator('#node-measure').click();assert.equal(await page.locator('#behavior-canvas [data-node="a"] .measurement-label').textContent(),'計測対象');
  await page.locator('#behavior-undo').click();assert.equal(await page.locator('#behavior-canvas [data-node="b"] .measurement-label').textContent(),'計測対象');await page.locator('#behavior-redo').click();assert.equal(await page.locator('#behavior-canvas [data-node="a"] .measurement-label').count(),1);await page.locator('#behavior-undo').click();
  // Deleting a measured state removes its stale goal; undo restores both.
  await node('b').click();await page.locator('#behavior-canvas').focus();await page.keyboard.press('Delete');assert.equal(await page.locator('#behavior-canvas .measurement-label').count(),0);await page.locator('#behavior-undo').click();
  await node('b').click();await page.locator('#node-measure').click();await page.locator('#behavior-apply').click();assert(await page.locator('#behavior-dialog').isHidden());
  const save=async(name,button='save')=>{const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#'+button).click()]);assert(download.suggestedFilename().endsWith('.txt'));const file=path.join(folder,name);await download.saveAs(file);return JSON.parse(fs.readFileSync(file));};
  const saved=await save('scenario.txt');assert.equal(saved.units[0].enabled,false);assert.equal(saved.mission.nodeId,'b');assert.equal(saved.groups[0].enabled,undefined);
  assert((await page.locator('#file').getAttribute('accept')).includes('.txt'));assert((await page.locator('#file').getAttribute('accept')).includes('.jsn'));fs.copyFileSync(path.join(folder,'scenario.txt'),path.join(folder,'legacy.jsn'));await page.locator('#file').setInputFiles(path.join(folder,'legacy.jsn'));
  await page.locator('#analysis-open').click();assert.equal(await page.locator('#mission-type').inputValue(),'state');assert(await page.locator('#mission-factions').isHidden());assert.equal(await page.locator('#mission-assignment').inputValue(),'t');assert.equal(await page.locator('#mission-state').inputValue(),'b');
  await page.locator('#mission-join').selectOption('count');assert(await page.locator('#mission-count').isVisible());await page.locator('#mission-count').fill('2');await page.locator('#mission-count').press('Tab');
  await page.locator('#analysis-run').click();await page.waitForFunction(()=>!document.getElementById('analysis-run').disabled&&document.querySelectorAll('#analysis-rows tr').length===2,{},{timeout:60000});
  const text=await page.locator('#analysis-rows').textContent();assert(text.includes('0 / 2')&&text.includes('2 / 2'),text);assert(await page.locator('#state-time-distribution').isVisible());assert.equal(await page.locator('#state-time-chart svg').count(),1);
  await page.locator('#state-time-condition').selectOption({index:1});assert((await page.locator('#state-time-note').textContent()).includes('期限内成立 2 / 2'));
  if(process.env.SIMSIM_MEASUREMENT_SCREENSHOT){await page.waitForTimeout(400);await page.screenshot({path:process.env.SIMSIM_MEASUREMENT_SCREENSHOT});}
  const analysis=await save('analysis.txt','analysis-export');assert.equal(analysis.rows[1].trials[0].stateReachedCount,2);assert.equal(analysis.rows[1].trials[0].successTime,3);
  await page.locator('#analysis-close').click();await page.locator('#file').setInputFiles(path.join(folder,'analysis.txt'));await page.locator('#analysis-dialog').waitFor({state:'visible'});assert(await page.locator('#analysis-dialog').isVisible());assert((await page.locator('#analysis-progress').textContent()).includes('再計算なし'));await page.locator('#analysis-close').click();
  await page.locator('#record-run').click();await page.waitForFunction(()=>!document.getElementById('play').disabled,{},{timeout:60000});await page.locator('#timeline').evaluate(el=>{el.value=30;el.dispatchEvent(new Event('input',{bubbles:true}));});
  const recorded=await save('record.txt','record-save');assert.equal(recorded.unitIds.includes('template'),false);assert.equal(recorded.result.stateReachedCount,2);await page.locator('#file').setInputFiles(path.join(folder,'record.txt'));await page.waitForFunction(()=>!document.getElementById('play').disabled);
  await page.locator('.unit-item[data-id="template"]').click();assert(!(await page.locator('#unit-enabled').isChecked()));assert((await page.locator('#state-status').textContent()).includes('無効'));
  await page.locator('#analysis-open').click();await page.locator('#mission-state').selectOption('a');await page.locator('#analysis-close').click();await page.locator('#record-run').click();await page.waitForFunction(()=>!document.getElementById('play').disabled,{},{timeout:60000});assert.equal((await save('initial-record.txt','record-save')).result.successTime,0);
  assert.deepEqual(errors,[]);console.log('PASS: measurement toolbar, state/node selection and badge, Undo/Redo/deletion, single/group disabling, template independence, count-zero comparison, cumulative time chart, exports, replay, initial time zero and no browser errors');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(folder,{recursive:true,force:true});}

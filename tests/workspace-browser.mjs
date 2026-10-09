import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {clickWorkspace,showNavigator} from './workspace-browser-helpers.mjs';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),{chromium}=await import(process.env.SIMSIM_PLAYWRIGHT??'playwright');
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://local').pathname,file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(root+path.sep)){res.statusCode=403;return res.end();}
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'text/plain');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:");
 try{res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}
});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.SIMSIM_BROWSER_EXECUTABLE?{executablePath:process.env.SIMSIM_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto('http://127.0.0.1:'+server.address().port+(process.env.SIMSIM_PORTABLE?'/portable/index.html':''));await page.waitForSelector('#boot[hidden]',{state:'attached'});
 const geometry=()=>page.locator('#map').evaluate(e=>({width:e.clientWidth,height:e.clientHeight}));
 assert(await page.locator('.unit-panel').isVisible());assert(!(await page.locator('.task-panel').isVisible()));assert(!(await page.locator('.inspector').isVisible()));
 assert(!(await page.locator('#duration').isVisible()));assert(!(await page.locator('#task-summary').isVisible()));assert(!(await page.locator('.plan-toolbar').isVisible()));
 await page.locator('#inspector-toggle').click();await showNavigator(page,'task');const individual=await geometry();
 await page.locator('#task-aggregation').selectOption('tasks');
 assert(!(await page.locator('.unit-panel').isVisible()));assert(!(await page.locator('.task-panel').isVisible()));assert(!(await page.locator('.inspector').isVisible()));
 for(const viewport of [{width:1600,height:1000},{width:1200,height:900}]){
  await page.setViewportSize(viewport);await page.waitForFunction(()=>{const c=document.querySelector('#map>canvas'),m=document.getElementById('map');return c&&Math.abs(c.clientWidth-m.clientWidth)<2;});
  const map=await geometry();assert(map.width>=viewport.width*.98,JSON.stringify(map));assert(map.height>=viewport.height*.72,JSON.stringify(map));assert(map.width>individual.width);assert(map.height>=individual.height-110);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'/tmp/simsim-workspace-'+viewport.width+(process.env.SIMSIM_PORTABLE?'-portable':'')+'.png'});
 }
 await page.waitForFunction(()=>[...document.querySelectorAll('#labels line')].every(e=>getComputedStyle(e).display==='none'));
 const before=await geometry();await page.locator('#results-open').click();assert.equal(await page.locator('#task-summary tr').count(),3);assert((await page.locator('#workspace-result-time').innerText()).includes('初期状態'));
 // Many result rows stay inside the result sheet and never shrink the map.
 await page.locator('#task-summary').evaluate(host=>{const template=host.firstElementChild;for(let i=0;i<50;i++)host.append(template.cloneNode(true));});await page.locator('#workspace-results-close').click();assert.deepEqual(await geometry(),before);
 await page.locator('#task-aggregation').selectOption('units');assert(await page.locator('.task-panel').isVisible());assert(await page.locator('.inspector').isVisible());
 await page.locator('#task-aggregation').selectOption('tasks');await page.locator('#results-open').click();await page.locator('#task-summary tr').first().click();assert(!(await page.locator('#workspace-results-dialog').isVisible()));assert.equal(await page.locator('#task-aggregation').inputValue(),'units');assert(await page.locator('.task-panel').isVisible());
 await page.locator('#calculation-settings-open').click();await page.locator('#duration').fill('2');await page.locator('#duration').press('Tab');await page.locator('#calculation-settings-close').click();assert(!(await page.locator('#duration').isVisible()));
 await page.locator('#record-run').click();await page.waitForFunction(()=>document.getElementById('recording-info').textContent.startsWith('記録済み'));assert.equal(await page.locator('#run-state').innerText(),'記録済み');
 await clickWorkspace(page,'step');await page.waitForFunction(()=>document.getElementById('clock').textContent==='00:01:00');
 await clickWorkspace(page,'events-open');assert(await page.locator('#events-dialog').isVisible());assert(!(await page.locator('#workspace-results-dialog').isVisible()));await page.locator('#events-close').click();
 await clickWorkspace(page,'viewtop');assert.equal(await page.locator('#viewtop').getAttribute('aria-pressed'),'true');
 const selectStyle=await page.locator('#task-aggregation').evaluate(e=>({appearance:getComputedStyle(e).appearance,image:getComputedStyle(e).backgroundImage,padding:parseFloat(getComputedStyle(e).paddingRight)}));assert.equal(selectStyle.appearance,'none');assert(selectStyle.image.startsWith('url('));assert(selectStyle.padding>=30);
 await showNavigator(page);await page.locator('.unit-item').first().click();await clickWorkspace(page,'settings-open');assert(await page.locator('#settings-editor').isVisible());assert(await page.locator('.unit-panel').isVisible());await page.locator('#settings-back').click();
 await page.reload();await page.waitForSelector('#boot[hidden]',{state:'attached'});assert(await page.locator('.unit-panel').isVisible());assert(await page.locator('.inspector').isVisible());
 assert.deepEqual(errors,[]);assert(!(await page.locator('#error-dialog').isVisible()));console.log('PASS: one navigator, optional inspector, full-width aggregate map at 1600/1200px, modal settings/results, many result rows, layout restore, replay/history, native select affordance and saved preferences');
}finally{await browser?.close();server.close();}

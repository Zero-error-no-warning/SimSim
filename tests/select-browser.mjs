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
 const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto('http://127.0.0.1:'+server.address().port+(process.env.SIMSIM_PORTABLE?'/portable/index.html':''));await page.waitForSelector('#boot[hidden]',{state:'attached'});
 const list=page.locator('#simsim-select-options'),rows=()=>list.locator('[role=option]');
 const background=locator=>locator.evaluate(e=>getComputedStyle(e).backgroundColor);
 const closed=page.locator('#task-aggregation');
 const originalOptions=await closed.evaluate(e=>[...e.options].map(o=>({label:o.label,text:o.textContent,value:o.value})));
 const originalWidth=(await closed.boundingBox()).width;
 const save=async()=>{const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#save').click()]);const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);return JSON.parse(Buffer.concat(chunks));};
 const originalScenario=await save();
 await closed.click();await list.waitFor({state:'visible'});assert.equal(await rows().count(),2);
 assert.equal(await closed.inputValue(),'units');assert.equal(await rows().first().getAttribute('aria-selected'),'true');assert((await rows().first().innerText()).includes('✓'));
 assert.equal(await background(closed),await background(rows().first()));
 const rowWidth=await rows().first().evaluate(e=>({width:e.getBoundingClientRect().width,columns:getComputedStyle(e).gridTemplateColumns}));assert.equal(await background(rows().first()),await background(rows().last()));
 await rows().last().hover();assert.deepEqual(await rows().last().evaluate(e=>({width:e.getBoundingClientRect().width,columns:getComputedStyle(e).gridTemplateColumns})),rowWidth);assert.equal(await rows().last().getAttribute('aria-selected'),'false');assert(await rows().last().evaluate(e=>e.classList.contains('candidate')));assert.equal(await closed.inputValue(),'units');assert.equal(await background(closed),await background(rows().last()));
 await page.screenshot({path:'/tmp/simsim-select-two-options'+(process.env.SIMSIM_PORTABLE?'-portable':'')+'.png'});
 await rows().last().click();assert.equal(await closed.inputValue(),'tasks');assert(!(await list.isVisible()));assert(!(await page.locator('.unit-panel').isVisible()));
 await closed.click();assert.equal(await rows().first().getAttribute('aria-selected'),'false');assert.equal(await rows().last().getAttribute('aria-selected'),'true');assert.equal(await background(closed),await background(rows().last()));
 await rows().first().hover();assert.equal(await closed.inputValue(),'tasks');await closed.press('Escape');assert.equal(await closed.inputValue(),'tasks');assert(!(await list.isVisible()));
 // Arrow keys move only the candidate. Enter commits; Escape cancels.
 await closed.press('ArrowDown');await closed.press('Home');assert.equal(await closed.inputValue(),'tasks');assert.equal(await rows().last().getAttribute('aria-selected'),'true');await closed.press('Enter');assert.equal(await closed.inputValue(),'units');
 await closed.press('Space');await closed.press('End');await closed.press('Escape');assert.equal(await closed.inputValue(),'units');
 await closed.press('ArrowDown');await closed.press('End');await closed.press('Tab');assert.equal(await closed.inputValue(),'tasks');assert(!(await list.isVisible()));
 // Clicking outside dismisses a hovered candidate without applying it.
 await closed.click();await rows().first().hover();await page.locator('#clock').click();assert.equal(await closed.inputValue(),'tasks');assert(!(await list.isVisible()));
 // Existing programmatic changes and option replacement remain native and visible on reopen.
 await closed.selectOption('units');assert.equal((await closed.boundingBox()).width,originalWidth);assert.deepEqual(await closed.evaluate(e=>[...e.options].map(o=>({label:o.label,text:o.textContent,value:o.value}))),originalOptions);assert.deepEqual(await save(),originalScenario);await showNavigator(page);await page.locator('.unit-item[data-id="uav"]').click();await clickWorkspace(page,'settings-open');
 const domain=page.locator('#unit-domain');await domain.click();await list.waitFor({state:'visible'});const popup=await list.boundingBox(),dialog=await page.locator('#settings-editor').boundingBox();assert(popup.x>=0&&popup.x+popup.width<=1200);assert(popup.y>=0&&popup.y+popup.height<=900);assert(dialog);
 const selected=await domain.inputValue();await rows().filter({hasText:'地上'}).hover();await domain.press('Escape');assert.equal(await domain.inputValue(),selected);assert(await page.locator('#settings-editor').isVisible());
 // A generated settings select is covered by the same delegated controller.
 await page.locator('[data-settings-category=capabilities]').click();await page.locator('[data-settings-module="unit.resources"]').evaluate(e=>e.open=true);await page.locator('#resource-add').click();
 const resource=page.locator('[data-settings-module="entity.movement"] .settings-analysis select');await resource.click();assert(await list.isVisible());assert.equal(await list.locator('[aria-selected=true]').count(),1);await resource.press('Escape');await page.locator('#settings-apply').click();await page.waitForSelector('#settings-editor[hidden]',{state:'attached'});
 // A real settings choice is applied and saved without decoration entering the value.
 await showNavigator(page);await page.locator('.unit-item[data-id=relay]').click();await clickWorkspace(page,'settings-open');await page.locator('[data-settings-category=capabilities]').click();await page.locator('[data-settings-module="entity.communication"]').evaluate(e=>e.open=true);
 const medium=page.locator('#unit-communication-medium');await medium.click();await list.locator('[role=option]').filter({hasText:'無線'}).click();assert.equal(await medium.inputValue(),'rf');await page.locator('#settings-apply').click();await page.waitForSelector('#settings-editor[hidden]',{state:'attached'});
 // Modal dialogs do not obscure the popup and Escape closes only the popup.
 await clickWorkspace(page,'analysis-open');const join=page.locator('#mission-join');await join.click();assert(await list.isVisible());const nativeValue=await join.inputValue();await join.press('End');await join.press('Escape');assert.equal(await join.inputValue(),nativeValue);assert(await page.locator('#analysis-dialog').isVisible());await page.locator('#analysis-close').click();
 // Hidden/disabled options and dynamic labels, duplicate values, removal and reset.
 await page.evaluate(()=>{
  const select=document.createElement('select');select.id='select-fixture';select.setAttribute('aria-label','選択テスト');select.style.cssText='position:fixed;right:20px;bottom:80px;z-index:100';
  select.append(new Option('Alpha','same'),new Option('Bravo','same'),new Option('Blocked','blocked'),new Option('Hidden','hidden'));select.options[2].disabled=true;select.options[3].hidden=true;document.body.append(select);
  select.addEventListener('change',()=>select.dataset.changes=String(Number(select.dataset.changes??0)+1));
 });
 const fixture=page.locator('#select-fixture');await fixture.click();assert.equal(await rows().count(),3);const blockedBox=await rows().nth(2).boundingBox();await page.mouse.click(blockedBox.x+blockedBox.width/2,blockedBox.y+blockedBox.height/2);assert.equal(await fixture.evaluate(e=>e.selectedIndex),0);assert(await list.isVisible());await fixture.press('End');await fixture.press('Enter');assert.equal(await fixture.evaluate(e=>e.selectedIndex),1);assert.equal(await fixture.getAttribute('data-changes'),'1');
 await fixture.click();await fixture.evaluate(e=>{e.options[1].textContent='Renamed';e.value='blocked';});await page.waitForFunction(()=>document.querySelector('#simsim-select-options [aria-selected=true]')?.textContent.includes('Blocked'));assert((await rows().nth(1).innerText()).includes('Renamed'));await fixture.press('Escape');
 await fixture.evaluate(e=>{e.replaceChildren(...Array.from({length:200},(_,i)=>new Option('Choice '+i,String(i))));e.value='160';e.style.top='640px';e.style.bottom='auto';});await fixture.click();const selectedBox=await list.locator('[aria-selected=true]').boundingBox(),listBox=await list.boundingBox();assert(selectedBox.y>=listBox.y&&selectedBox.y+selectedBox.height<=listBox.y+listBox.height);assert(listBox.y>=0&&listBox.y+listBox.height<=900);assert(await list.evaluate(e=>e.scrollTop>0));await fixture.press('Escape');
 await fixture.evaluate(e=>e.disabled=true);await fixture.click({force:true});assert(!(await list.isVisible()));await fixture.evaluate(e=>e.disabled=false);await fixture.click();await fixture.evaluate(e=>e.remove());await page.waitForFunction(()=>!document.getElementById('simsim-select-options'));
 const saved=await save();assert.equal(saved.units.find(u=>u.id==='relay').communication.medium,'rf');assert.equal(saved.units.find(u=>u.id==='uav').domain,selected);assert.equal(saved.units.find(u=>u.id==='uav').resources.fuel.capacity,100);assert(!JSON.stringify(saved).includes('✓'));
 assert.deepEqual(errors,[]);assert(!(await page.locator('#error-dialog').isVisible()));console.log('PASS: two-option open/closed background consistency, persistent fixed-column check, independent hover candidate, mouse/keyboard/Tab/Escape, settings and modal popups, generated selects, native updates, unchanged labels/values/layout/file data, disabled/hidden options, duplicate values and removed control');
}finally{await browser?.close();server.close();}

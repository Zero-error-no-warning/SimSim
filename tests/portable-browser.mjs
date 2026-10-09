import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {importScenario} from '../src/scenario-import.js?v=20261009-select-state-30';
const {chromium}=await import(process.env.SIMSIM_PLAYWRIGHT??'playwright');
const root=fileURLToPath(new URL('..',import.meta.url)),copy=fs.mkdtempSync(path.join(os.tmpdir(),'simsim-portable-')),requests=[];
const names=['index.html','styles.css','main.js','worker.js','analysis-worker.js'];
let staleMain=false;
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://local'),isApp=url.pathname.startsWith('/deployed/site/'),base=isApp?copy:path.join(root,'portable');
  const relative=url.pathname.slice(isApp?'/deployed/site/'.length:'/copy/'.length)||'index.html',file=path.resolve(base,relative);
  requests.push({isApp,relative});
  if(!file.startsWith(base+path.sep)){res.writeHead(403);res.end();return;}
  res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'${relative==='copy.html'?" 'unsafe-inline'":''}; worker-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:`);
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'text/plain');
  try{const bytes=fs.readFileSync(file);res.end(staleMain&&relative==='main.js'?Buffer.from(bytes.toString('utf8').replace('SimSim portable','XimSim portable')):bytes);}catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.SIMSIM_BROWSER_EXECUTABLE?{executablePath:process.env.SIMSIM_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});page.on('dialog',d=>d.accept());
  const origin='http://127.0.0.1:'+server.address().port;
  await page.goto(origin+'/copy/copy.html');
  assert.equal(await page.locator('[data-file]').count(),5);
  staleMain=true;await page.locator('[data-file="main.js"]').click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('版が一致しません'));assert(await page.locator('#editor').isHidden());staleMain=false;
  for(const name of names){
    await page.locator('[data-file="'+name+'"]').click();await page.waitForFunction(name=>!document.getElementById('editor').hidden&&document.getElementById('filename').textContent===name,name);
    const text=await page.locator('#content').inputValue();assert.equal(text,fs.readFileSync(path.join(root,'portable',name),'utf8'));
    await page.locator('#select').click();assert(await page.locator('#content').evaluate(el=>el.selectionStart===0&&el.selectionEnd===el.value.length));
    fs.writeFileSync(path.join(copy,name),text);
  }
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copiedText=text;}},configurable:true}));
  await page.locator('#copy').click();assert.equal(await page.evaluate(()=>window.copiedText),fs.readFileSync(path.join(copy,'analysis-worker.js'),'utf8'));
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw Error('blocked');}},configurable:true}));
  await page.locator('#copy').click();assert((await page.locator('#status').textContent()).includes('Ctrl+C'));
  const [textDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#download').click()]);assert.equal(textDownload.suggestedFilename(),'analysis-worker.js.txt');await textDownload.saveAs(path.join(copy,'download.txt'));
  assert.equal(fs.readFileSync(path.join(copy,'download.txt'),'utf8'),fs.readFileSync(path.join(copy,'analysis-worker.js'),'utf8'));fs.unlinkSync(path.join(copy,'download.txt'));
  assert.deepEqual(fs.readdirSync(copy).sort(),[...names].sort());
  await page.addInitScript(()=>{
    const Original=Worker;window.portableWorkers=[];
    window.Worker=class extends Original{
      constructor(url,options){
        if(options?.type==='module')throw Error('Module Workers are unavailable in this test.');
        window.portableWorkers.push({url:String(url),type:options?.type??'classic'});super(url,options);
      }
    };
  });
  await page.goto(origin+'/deployed/site/index.html');await page.waitForFunction(()=>document.getElementById('recording-info').textContent.includes('未計算'));
  assert(!await page.locator('#error-dialog').isVisible());
  const samples=fs.readdirSync(path.join(root,'data')).filter(name=>name.endsWith('.txt'));
  for(const name of samples){
    const expected=importScenario(JSON.parse(fs.readFileSync(path.join(root,'data',name))));
    await page.locator('#sample-picker').selectOption(name);await page.waitForFunction(title=>document.getElementById('title').value===title,expected.title);
    const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#save').click()]);await download.saveAs(path.join(copy,'sample.txt'));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(copy,'sample.txt'))),expected);
  }
  const fixture=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/state-measurement.txt')));fs.writeFileSync(path.join(copy,'input.txt'),JSON.stringify(fixture));
  await page.locator('#file').setInputFiles(path.join(copy,'input.txt'));await page.waitForFunction(title=>document.getElementById('title').value===title,fixture.title);
  const [saved]=await Promise.all([page.waitForEvent('download'),page.locator('#save').click()]);await saved.saveAs(path.join(copy,'saved.txt'));assert.equal(JSON.parse(fs.readFileSync(path.join(copy,'saved.txt'))).version,3);
  await page.locator('#file').setInputFiles(path.join(copy,'saved.txt'));await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('saved.txt'));
  await page.locator('#record-run').click();await page.waitForFunction(()=>!document.getElementById('play').disabled,{},{timeout:60000});
  await page.locator('#analysis-open').click();await page.locator('#analysis-run').click();await page.waitForFunction(()=>document.getElementById('analysis-progress').textContent.startsWith('完了'),{},{timeout:60000});
  assert.equal(await page.locator('#analysis-rows tr').count(),2);
  const workers=await page.evaluate(()=>window.portableWorkers);assert.equal(workers.length,2);assert(workers.every(w=>w.type==='classic'&&w.url.startsWith(origin+'/deployed/site/')));
  assert(requests.filter(x=>x.isApp).every(x=>names.includes(x.relative)),JSON.stringify(requests));
  assert.deepEqual(errors,[]);
  await page.locator('#analysis-close').click();await page.waitForTimeout(400);
  if(process.env.SIMSIM_PORTABLE_SCREENSHOT)await page.screenshot({path:process.env.SIMSIM_PORTABLE_SCREENSHOT});
  console.log('PASS: copy-page text and TXT bytes; clipboard fallback; isolated five-file deployment; strict self-only CSP; classic Workers only; all embedded samples preserved; version-3 save/reopen; calculation and analysis; no src/vendor/data requests');
}finally{await browser?.close();await new Promise(r=>server.close(r));fs.rmSync(copy,{recursive:true,force:true});}

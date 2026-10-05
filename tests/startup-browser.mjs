import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {UI_BUILD} from '../src/ui-dom.js?v=20261005-startup-1';
const {chromium}=await import(process.env.SIMSIM_PLAYWRIGHT??'playwright');
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),requests=[];
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://local'),parts=url.pathname.split('/'),mode=parts[1];
  const relative=parts.slice(2).join('/')||'index.html',file=path.resolve(root,relative);
  requests.push({mode,relative,version:url.searchParams.get('v')});
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:");
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'text/plain');
  try{
    let source=fs.readFileSync(file,'utf8');
    if(relative==='index.html'&&mode==='legacy')source=source.replace(/ data-simsim-build="[^"]*"/,'');
    if(relative==='index.html'&&mode==='missing')source=source.replace('id="trigger-add"','id="removed-trigger-add"');
    // Simulate cached, unusable unversioned source URLs. The current loader and
    // every transitive import/worker must bypass these entries with the build URL.
    if(mode==='good'&&relative.startsWith('src/')&&url.searchParams.get('v')!==UI_BUILD)source="throw new Error('STALE MODULE');";
    if(mode==='silent'&&relative==='src/worker.js')source='self.onmessage=()=>{};';
    res.end(source);
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.SIMSIM_BROWSER_EXECUTABLE?{executablePath:process.env.SIMSIM_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const origin='http://127.0.0.1:'+server.address().port;
  await Promise.all(['good','missing','legacy','silent'].map(async mode=>{
    const page=await browser.newPage({viewport:{width:1500,height:1000}});
    await page.goto(origin+'/'+mode+'/');
    if(mode==='good'){
      await page.waitForSelector('#boot[hidden]',{state:'attached'});
      await page.waitForFunction(()=>document.getElementById('recording-info').textContent.includes('未計算'));
      assert(!await page.locator('#error-dialog').isVisible());
      await page.goto(origin+'/'+mode+'/environment-check/check.html');
      await page.waitForFunction(()=>document.getElementById('application-status').textContent==='成功');
      assert((await page.locator('#application-detail').innerText()).includes('依存モジュール'));
    }else if(mode==='silent'){
      await page.waitForSelector('#boot[hidden]',{state:'attached'});
      await page.waitForSelector('#error-dialog[open]',{timeout:16000});
      assert((await page.locator('#error-text').innerText()).includes('シナリオを計算Workerへ送信しました'));
    }else{
      await page.waitForFunction(()=>document.getElementById('boot').textContent.includes('起動できませんでした'));
      const message=await page.locator('#boot').innerText();
      assert(message.includes(mode==='missing'?'#trigger-add':'HTMLとJavaScriptの版が一致していません'));
      assert(!message.includes("Cannot set properties of null"));
      const report=await page.locator('#boot textarea').inputValue();
      assert(report.includes(UI_BUILD));assert(report.includes('Browser:'));assert(report.includes('Error:'));
      assert((await page.locator('#boot a').getAttribute('href')).includes('simsim-reload='));
      // Wait beyond the former timer: a DOM failure must retain its real cause.
      await page.waitForTimeout(13000);
      assert(!await page.locator('#error-dialog').isVisible());
      assert.equal(await page.locator('#boot').innerText(),message);
    }
    await page.close();
  }));
  assert(requests.filter(r=>r.mode==='good'&&r.relative.startsWith('src/')).every(r=>r.version===UI_BUILD));
  assert(!requests.some(r=>r.mode==='legacy'&&r.relative.endsWith('worker.js')));
  console.log('PASS: stale source URLs bypassed across imports and workers; old HTML blocked before workers; missing DOM ID shown with copyable stack; no false timeout after failed boot; actual worker timeout preserved; application worker diagnostic loads dependencies');
}finally{
  await browser?.close();await new Promise(r=>server.close(r));
}

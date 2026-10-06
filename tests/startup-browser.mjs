import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {UI_BUILD} from '../src/ui-dom.js?v=20261006-patrol-transition-18';
const {chromium}=await import(process.env.SIMSIM_PLAYWRIGHT??'playwright');
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),requests=[];
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://local'),parts=url.pathname.split('/'),mode=parts[1];
  const relative=parts.slice(2).join('/')||'index.html',file=path.resolve(root,relative);
  requests.push({mode,relative,version:url.searchParams.get('v'),delayedModule:url.searchParams.get('delay-module')==='1',applicationProbe:req.headers.referer?.includes('/environment-check/')});
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
    if(mode==='probe-timeout'&&relative==='environment-check/worker.js')source='self.onmessage=()=>{};';
    // Shorten only the probe deadline to exercise timeout classification quickly.
    if(mode==='probe-timeout'&&relative==='environment-check/check.js')source=source.replace('workerWaitMs=60000','workerWaitMs=1000');
    if(mode==='slow'&&(relative==='src/worker.js'||url.searchParams.get('delay-module')==='1')){
      setTimeout(()=>res.end(source),13000);return;
    }
    if(mode==='late'&&relative==='src/worker.js'){
      setTimeout(()=>res.end(source),3000);return;
    }
    res.end(source);
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.SIMSIM_BROWSER_EXECUTABLE?{executablePath:process.env.SIMSIM_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const origin='http://127.0.0.1:'+server.address().port;
  await Promise.all(['good','missing','legacy','silent','slow','late','probe-timeout'].map(async mode=>{
    const page=await browser.newPage({viewport:{width:1500,height:1000}});
    // Accelerate only the UI's final startup deadline in silence/recovery cases.
    if(['silent','late','missing','legacy'].includes(mode))await page.addInitScript(()=>{
      const original=setTimeout;
      window.setTimeout=(callback,ms,...args)=>original(callback,ms===60000?1000:ms,...args);
    });
    if(mode==='slow')await page.addInitScript(()=>{
      const Original=Worker;
      window.Worker=class extends Original{
        constructor(url,options){
          const next=new URL(url,document.baseURI);
          if(options?.type==='module'&&next.pathname.endsWith('/environment-check/worker.js'))next.searchParams.set('delay-module','1');
          super(next,options);
        }
      };
    });
    await page.goto(origin+'/'+mode+'/');
    if(mode==='good'){
      await page.waitForSelector('#boot[hidden]',{state:'attached'});
      await page.waitForFunction(()=>document.getElementById('recording-info').textContent.includes('未計算'));
      assert(!await page.locator('#error-dialog').isVisible());
      await page.goto(origin+'/'+mode+'/environment-check/check.html');
      await page.waitForFunction(()=>document.getElementById('application-status').textContent==='成功');
      assert((await page.locator('#application-detail').innerText()).includes('依存モジュール'));
    }else if(mode==='probe-timeout'){
      await page.goto(origin+'/'+mode+'/environment-check/check.html');
      await page.waitForFunction(()=>!document.getElementById('run').disabled);
      const report=await page.locator('#report').inputValue();
      assert(report.includes('v1.3'));assert(report.includes('module: timeout'));assert(report.includes('classic: timeout'));
      assert((await page.locator('#module-status').innerText()).includes('判定保留'));
      assert((await page.locator('#summary').innerText()).includes('区別できません'));
    }else if(mode==='slow'){
      await page.waitForFunction(()=>document.getElementById('recording-info').textContent.includes('最大60秒'));
      assert(!await page.locator('#error-dialog').isVisible());assert(await page.locator('#record-run').isDisabled());
      await page.waitForFunction(()=>document.getElementById('recording-info').textContent.includes('未計算'));
      assert(!await page.locator('#error-dialog').isVisible());assert(!await page.locator('#record-run').isDisabled());
      await page.goto(origin+'/'+mode+'/environment-check/check.html');
      await page.waitForFunction(()=>!document.getElementById('run').disabled,{},{timeout:45000});
      const report=await page.locator('#report').inputValue();
      assert(report.includes('module: ok'));assert(report.includes('application: ok'));
      assert((await page.locator('#module-detail').innerText()).includes('起動から応答まで'));
      // The next worker starts after the previous response has been accepted.
      assert(requests.findIndex(r=>r.mode==='slow'&&r.relative==='src/worker.js'&&r.applicationProbe)>requests.findIndex(r=>r.mode==='slow'&&r.relative==='environment-check/worker.js'&&r.delayedModule));
    }else if(mode==='late'){
      await page.waitForSelector('#error-dialog[open]',{timeout:5000});
      assert((await page.locator('#error-text').innerText()).includes('未判定'));
      await page.waitForFunction(()=>document.getElementById('recording-info').textContent.includes('未計算'));
      assert(!await page.locator('#error-dialog').isVisible());assert(!await page.locator('#record-run').isDisabled());
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
  console.log('PASS: stale source URLs bypassed; old HTML blocked; missing DOM details; no false boot timeout; real silence retained; 13-second worker startup and diagnostic replies accepted; sequential probes; timeout classified inconclusive; late worker response recovers UI');
}finally{
  await browser?.close();await new Promise(r=>server.close(r));
}

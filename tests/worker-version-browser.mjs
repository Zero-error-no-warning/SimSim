import assert from 'node:assert/strict';import fs from 'node:fs';import http from 'node:http';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {UI_BUILD} from '../src/ui-dom.js?v=20261007-worker-version-24';
const {chromium}=await import(process.env.SIMSIM_PLAYWRIGHT??'playwright'),root=fileURLToPath(new URL('..',import.meta.url)),requests=[];
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://local'),[,mode,...parts]=u.pathname.split('/'),name=parts.join('/')||'index.html',isPortable=mode.startsWith('portable'),base=path.resolve(root,isPortable?'portable':'.'),file=path.resolve(base,name);
 if(!file.startsWith(base+path.sep)){res.writeHead(403);res.end();return;}
 requests.push({mode,name});res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:");
 try{let source=fs.readFileSync(file,'utf8');
 if(mode.endsWith('old-worker')&&/^(?:src\/)?worker\.js$/.test(name))source="self.onmessage=({data})=>{if(data.type==='ping')self.postMessage({type:'pong'});else if(data.type==='scenario')self.postMessage({type:'error',revision:data.revision,message:'分析の種類はcomparison・sensitivityです。'});};";
 if(mode.endsWith('old-analysis')&&/^(?:src\/)?analysis-worker\.js$/.test(name))source="self.onmessage=({data})=>{if(data.type==='ping')self.postMessage({type:'pong',build:'20261007-sensitivity-22'});};";
 if(mode.endsWith('stale-hash')&&name==='worker.js')source=source.replaceAll(/20261007-worker-version-24-[a-f0-9]{12}/g,'20261007-worker-version-24-000000000000');
 res.end(source);}catch{res.writeHead(404);res.end();}
});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await chromium.launch({headless:true,...(process.env.SIMSIM_BROWSER_EXECUTABLE?{executablePath:process.env.SIMSIM_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const mode of ['normal-good','portable-good','normal-old-worker','portable-old-worker','normal-old-analysis','portable-old-analysis','portable-stale-hash']){
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/'+mode+'/');
  if(mode.endsWith('good')){await page.waitForFunction(()=>document.getElementById('recording-info').textContent.includes('未計算'));await page.locator('#sample-picker').selectOption('plans-demo.txt');await page.waitForFunction(()=>document.getElementById('title').value==='運用案比較：配置・経路・報告周期');assert(!await page.locator('#error-dialog').isVisible());}
  else{await page.waitForFunction(()=>document.getElementById('boot').textContent.includes('起動できませんでした'));const message=await page.locator('#boot').innerText();assert(message.includes('版が一致していません'));assert(message.includes('5')||message.includes('index.html'));assert(message.includes('Worker:'));assert(!message.includes('分析の種類はcomparison・sensitivityです。'));assert.equal(await page.locator('#title').inputValue(),'');
   assert((await page.locator('#boot textarea').inputValue()).includes(UI_BUILD));await page.waitForTimeout(150);assert.equal(await page.locator('#boot').innerText(),message);assert(!await page.locator('#error-dialog').isVisible());}
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: actual Worker build handshake, stale simulation/analysis Worker blocked before sample load, portable content hash mismatch, healthy normal/portable sample load and readable recovery guidance');
}finally{await browser?.close();await new Promise(r=>server.close(r));}

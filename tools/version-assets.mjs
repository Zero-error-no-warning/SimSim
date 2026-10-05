import fs from 'node:fs';
import {UI_BUILD} from '../src/ui-dom.js';
// Run before publishing after changing UI_BUILD. Version the entire module graph,
// including worker entry points; versioning only bootstrap leaves stale imports.
const root=new URL('../',import.meta.url);
for(const file of fs.readdirSync(new URL('src/',root)).filter(f=>f.endsWith('.js'))){
  const url=new URL('src/'+file,root),source=fs.readFileSync(url,'utf8');
  fs.writeFileSync(url,source.replace(/(['"])(\.\.?\/[^'"]+\.js)(?:\?v=[^'"]*)?\1/g,(all,quote,path)=>path.startsWith('../vendor/')?all:quote+path+'?v='+UI_BUILD+quote));
}
// Node also keys modules by URL. Test entry imports must use the same URL as
// transitive imports so instanceof checks exercise the actual shared instance.
for(const file of fs.readdirSync(new URL('tests/',root)).filter(f=>f.endsWith('.mjs'))){
  const url=new URL('tests/'+file,root),source=fs.readFileSync(url,'utf8');
  fs.writeFileSync(url,source.replace(/(['"])(\.\.\/src\/[^'"]+\.js)(?:\?v=[^'"]*)?\1/g,(_,quote,path)=>quote+path+'?v='+UI_BUILD+quote));
}
const index=new URL('index.html',root);
fs.writeFileSync(index,fs.readFileSync(index,'utf8').replace(/<html lang="ja"(?: data-simsim-build="[^"]*")?>/,'<html lang="ja" data-simsim-build="'+UI_BUILD+'">').replace(/(styles\.css|src\/bootstrap\.js)\?v=[^"\s]+/g,'$1?v='+UI_BUILD));
const check=new URL('environment-check/check.js',root);
fs.writeFileSync(check,fs.readFileSync(check,'utf8').replace(/\.\.\/src\/worker\.js\?v=[^'"]+/g,'../src/worker.js?v='+UI_BUILD));
const checkHtml=new URL('environment-check/check.html',root);
fs.writeFileSync(checkHtml,fs.readFileSync(checkHtml,'utf8').replace(/check\.js(?:\?v=[^"\s]+)?/g,'check.js?v='+UI_BUILD));

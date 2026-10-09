import {RUNTIME_BUILD} from './ui-dom.js?v=20261009-configuration-contract-28';
// Check the executable Worker, rather than trusting the requested URL or HTML.
export function verifiedWorker(url,options){
  const worker=new Worker(url,options),post=worker.postMessage.bind(worker),queue=[];
  let ready=false,finished=false,resolve,reject;
  worker.ready=new Promise((yes,no)=>{resolve=yes;reject=no;});
  // Initializers attach their aggregate handler after constructing the UI.
  worker.ready.catch(()=>{});
  const timer=setTimeout(()=>{const boot=document.getElementById('boot');if(boot&&!finished)boot.textContent=options.name+'の版確認に60秒以内の応答がありません。起動遅延・配信・旧ファイルのどれが原因かは未判定です。応答を引き続き待ちます。';},60000);
  const notice=setTimeout(()=>{const boot=document.getElementById('boot');if(boot&&!finished)boot.textContent='画面と計算Workerの版を確認しています。起動・応答を最大60秒待ちます。';},10000);
  function cleanup(){clearTimeout(timer);clearTimeout(notice);worker.removeEventListener('message',onMessage);worker.removeEventListener('error',onError);window.removeEventListener('simsim-boot-failed',onAbort);}
  function fail(error){if(finished)return;finished=true;cleanup();queue.length=0;worker.terminate();reject(error);}
  function onAbort(){fail(Error('起動処理を中止しました。'));}
  function onError(event){fail(Error(options.name+'の起動に失敗しました。'+(event.message??'')));}
  function onMessage(event){
    if(event.data?.type!=='pong')return;
    event.stopImmediatePropagation();
    const build=event.data.build;
    if(build!==RUNTIME_BUILD){fail(Error('画面と'+options.name+'の版が一致していません。\n画面: '+RUNTIME_BUILD+'\nWorker: '+(build??'版情報なし（旧版）')+'\n持ち込み版は同じ版のindex.html・styles.css・main.js・worker.js・analysis-worker.jsをすべて入れ替えてください。入れ替え済みの場合は配信側とブラウザのキャッシュを更新してください。'));return;}
    finished=ready=true;cleanup();resolve();for(const args of queue)post(...args);queue.length=0;
  }
  window.addEventListener('simsim-boot-failed',onAbort,{once:true});
  worker.addEventListener('message',onMessage);worker.addEventListener('error',onError);
  worker.postMessage=(...args)=>{if(ready)post(...args);else if(!finished)queue.push(args);};
  post({type:'ping'});return worker;
}

import('./app.js?v=20261005-worker-wait-2').catch(error => {
  window.dispatchEvent(new Event('simsim-boot-failed'));
  const status=document.getElementById('boot');
  if(!status)return;
  status.hidden=false;
  const message=document.createElement('p');
  message.textContent='起動できませんでした: '+error.message;
  const details=document.createElement('details'),title=document.createElement('summary'),report=document.createElement('textarea');
  title.textContent='エラー詳細（選択してコピーできます）';
  report.readOnly=true;report.rows=9;report.style.width='100%';
  report.value=['SimSim startup report',new Date().toISOString(),'HTML: '+(document.documentElement.dataset.simsimBuild||'版情報なし'),'Bootstrap: '+document.querySelector('script[src*="bootstrap.js"]')?.getAttribute('src'),'URL: '+location.href,'Browser: '+navigator.userAgent,error.stack||error.message].join('\n');
  details.append(title,report);
  const reload=document.createElement('a'),url=new URL(location.href);
  url.searchParams.set('simsim-reload',Date.now());
  reload.href=url.href;reload.textContent='最新版を読み直す';
  status.replaceChildren(message,reload,details);
});

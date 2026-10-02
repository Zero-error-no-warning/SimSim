import('./app.js?v=0.4.1').catch(error => {
  const status=document.getElementById('boot');
  status.hidden=false;status.textContent='起動できませんでした: '+error.message+'\nHTTP／HTTPSで開き、src・vendorフォルダの配信とF12のConsoleを確認してください。';
});

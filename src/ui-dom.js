export const UI_BUILD='20261005-desktop-7';

export function requireElement(id){
  const element=document.getElementById(id);
  if(!element)throw new Error('画面部品 #'+id+' がありません。HTMLとJavaScriptの版が一致していないか、HTMLが変更されています。最新版を読み直してください。');
  return element;
}

export function assertDocumentVersion(){
  const htmlBuild=document.documentElement.dataset.simsimBuild;
  if(htmlBuild!==UI_BUILD)throw new Error('HTMLとJavaScriptの版が一致していません。\nHTML: '+(htmlBuild||'旧版（版情報なし）')+'\nJavaScript: '+UI_BUILD+'\n最新版を読み直してください。');
}

// Display preferences never change scenario files. Aggregation temporarily frees the map.
export class WorkspaceUI {
  constructor() {
    this.element=document.querySelector('.workspace');
    this.widths={task:230,unit:230,inspector:280};
    this.pane='unit';this.navigatorOpen=true;this.inspectorOpen=false;this.aggregation=false;
    try {
      const saved=JSON.parse(localStorage.getItem('simsim-workspace')??'null');
      for(const key of Object.keys(this.widths))if(Number.isFinite(saved?.widths?.[key]))this.widths[key]=saved.widths[key];
      if(saved?.pane==='task')this.pane='task';
      if(typeof saved?.navigatorOpen==='boolean')this.navigatorOpen=saved.navigatorOpen;
      if(typeof saved?.inspectorOpen==='boolean')this.inspectorOpen=saved.inspectorOpen;
    }catch{}
    document.getElementById('navigator-toggle').onclick=()=>{this.navigatorOpen=!this.navigatorOpen;this.apply();};
    document.getElementById('inspector-toggle').onclick=()=>this.showInspector(!this.inspectorOpen);
    document.getElementById('tasks-toggle').onclick=()=>{this.navigatorOpen=false;this.apply();};
    for(const button of document.querySelectorAll('[data-browser-pane]'))button.onclick=()=>{this.pane=button.dataset.browserPane;this.navigatorOpen=true;this.apply();};
    for(const [name,trigger,close] of [['plan-manager','plan-manager-open','plan-manager-close'],['calculation-settings','calculation-settings-open','calculation-settings-close'],['workspace-results','results-open','workspace-results-close']]){
      const dialog=document.getElementById(name+'-dialog');
      document.getElementById(trigger).onclick=()=>dialog.showModal();
      document.getElementById(close).onclick=()=>dialog.close();
    }
    const planDialog=document.getElementById('plan-manager-dialog');
    for(const id of ['plan-save','plan-new','plan-rename','plan-delete'])document.getElementById(id).addEventListener('click',()=>{if(planDialog.open)planDialog.close();},{capture:true});
    document.getElementById('plan-select').addEventListener('change',()=>{if(planDialog.open)planDialog.close();},{capture:true});
    // Close the results sheet before opening its focused history or inspection view.
    for(const id of ['events-open','route-check-open','record-save'])document.getElementById(id).addEventListener('click',()=>this.closeResults(),{capture:true});
    document.addEventListener('click',event=>{
      for(const menu of document.querySelectorAll('.menu-popover[open]'))if(!menu.contains(event.target)||event.target.closest('button'))menu.open=false;
    });
    for(const handle of document.querySelectorAll('.pane-resizer')){
      const key=handle.dataset.pane;
      handle.addEventListener('pointerdown',event=>{
        if(event.button!==0)return;
        event.preventDefault();handle.setPointerCapture(event.pointerId);
        const start=event.clientX,width=this.widths[key];
        const move=e=>{this.widths[key]=width+(e.clientX-start)*(key==='inspector'?-1:1);this.apply();};
        const stop=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',stop);handle.removeEventListener('pointercancel',stop);};
        handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',stop);handle.addEventListener('pointercancel',stop);
      });
      handle.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
        event.preventDefault();this.widths[key]+=(event.key==='ArrowRight'?10:-10)*(key==='inspector'?-1:1);this.apply();
      });
    }
    window.addEventListener('resize',()=>this.apply());this.apply();
  }
  showInspector(open=true){this.inspectorOpen=open;this.apply();}
  closeResults(){const dialog=document.getElementById('workspace-results-dialog');if(dialog.open)dialog.close();}
  setAggregation(active){
    if(active===this.aggregation)return;
    if(active){this.normalLayout={pane:this.pane,navigatorOpen:this.navigatorOpen,inspectorOpen:this.inspectorOpen};this.navigatorOpen=false;this.inspectorOpen=false;}
    else if(this.normalLayout)Object.assign(this,this.normalLayout);
    this.aggregation=active;this.apply();
  }
  apply(){
    const limits={task:[190,360],unit:[190,360],inspector:[250,420]},widths={...this.widths};
    for(const [key,[min,max]] of Object.entries(limits))this.widths[key]=widths[key]=Math.max(min,Math.min(max,widths[key]));
    const visible={task:this.navigatorOpen&&this.pane==='task',unit:this.navigatorOpen&&this.pane==='unit',inspector:this.inspectorOpen};
    let excess=Object.entries(widths).reduce((sum,[key,width])=>sum+(visible[key]?width+6:0),0)+320-this.element.clientWidth;
    for(const key of [this.pane,'inspector']){const reduction=Math.min(Math.max(0,excess),widths[key]-limits[key][0]);widths[key]-=reduction;excess-=reduction;}
    for(const key of Object.keys(widths)){
      this.element.style.setProperty('--'+key+'-width',widths[key]+'px');
      this.element.style.setProperty('--'+key+'-slot',visible[key]?widths[key]+'px':'0px');
      this.element.style.setProperty('--'+key+'-divider',visible[key]?'6px':'0px');
      const handle=document.querySelector('[data-pane="'+key+'"]');
      handle.setAttribute('aria-valuenow',Math.round(widths[key]));handle.setAttribute('aria-valuemin',limits[key][0]);handle.setAttribute('aria-valuemax',limits[key][1]);
      this.element.classList.toggle(key+'-visible',visible[key]);
    }
    this.element.classList.toggle('aggregation-mode',this.aggregation);
    for(const [id,active] of [['navigator-toggle',this.navigatorOpen],['inspector-toggle',this.inspectorOpen]])document.getElementById(id).setAttribute('aria-pressed',String(active));
    for(const button of document.querySelectorAll('[data-browser-pane]'))button.setAttribute('aria-pressed',String(button.dataset.browserPane===this.pane));
    const toggle=document.getElementById('tasks-toggle');toggle.textContent='×';toggle.title='対象一覧を閉じる';toggle.setAttribute('aria-label',toggle.title);toggle.setAttribute('aria-expanded',String(this.navigatorOpen));
    const layout=this.aggregation?this.normalLayout:this;
    try{localStorage.setItem('simsim-workspace',JSON.stringify({widths:this.widths,pane:layout.pane,navigatorOpen:layout.navigatorOpen,inspectorOpen:layout.inspectorOpen}));}catch{}
  }
}

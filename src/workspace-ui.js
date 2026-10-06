// Pane widths are local display preferences; they do not change scenario files.
export class WorkspaceUI {
  constructor() {
    this.element=document.querySelector('.workspace');
    this.widths={task:180,unit:230,inspector:280};
    this.collapsed=false;
    try {
      const saved=JSON.parse(localStorage.getItem('simsim-workspace')??'null');
      for(const key of Object.keys(this.widths))if(Number.isFinite(saved?.widths?.[key]))this.widths[key]=saved.widths[key];
      this.collapsed=saved?.collapsed===true;
    } catch {}
    this.toggle=document.getElementById('tasks-toggle');
    this.toggle.onclick=()=>{this.collapsed=!this.collapsed;this.apply();};
    for(const handle of document.querySelectorAll('.pane-resizer')) {
      const key=handle.dataset.pane;
      handle.addEventListener('pointerdown',event=>{
        if(event.button!==0||key==='task'&&this.collapsed)return;
        event.preventDefault();handle.setPointerCapture(event.pointerId);
        const start=event.clientX,width=this.widths[key];
        const move=e=>{this.widths[key]=width+(e.clientX-start)*(key==='inspector'?-1:1);this.apply();};
        const stop=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',stop);handle.removeEventListener('pointercancel',stop);};
        handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',stop);handle.addEventListener('pointercancel',stop);
      });
      handle.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight'].includes(event.key)||key==='task'&&this.collapsed)return;
        event.preventDefault();this.widths[key]+=(event.key==='ArrowRight'?10:-10)*(key==='inspector'?-1:1);this.apply();
      });
    }
    window.addEventListener('resize',()=>this.apply());
    this.apply();
  }
  apply() {
    const limits={task:[150,320],unit:[190,360],inspector:[250,420]};
    for(const [key,[min,max]] of Object.entries(limits))this.widths[key]=Math.max(min,Math.min(max,this.widths[key]));
    // Reserve at least 320px for the map, reducing displayed pane widths when needed.
    const minima={task:this.collapsed?42:150,unit:190,inspector:250};
    const widths={...this.widths,task:this.collapsed?42:this.widths.task};
    let excess=Object.values(widths).reduce((a,b)=>a+b,0)+18+320-this.element.clientWidth;
    for(const key of ['task','unit','inspector']) {
      const reduction=Math.min(Math.max(0,excess),widths[key]-minima[key]);widths[key]-=reduction;excess-=reduction;
      this.element.style.setProperty('--'+key+'-width',widths[key]+'px');
      const handle=document.querySelector('.pane-resizer[data-pane="'+key+'"]');
      handle.setAttribute('aria-valuenow',Math.round(widths[key]));
      handle.setAttribute('aria-valuemin',minima[key]);handle.setAttribute('aria-valuemax',limits[key][1]);
    }
    this.element.classList.toggle('tasks-collapsed',this.collapsed);
    this.toggle.textContent=this.collapsed?'›':'‹';
    this.toggle.title=this.collapsed?'タスク一覧を開く':'タスク一覧を折りたたむ';
    this.toggle.setAttribute('aria-label',this.toggle.title);
    this.toggle.setAttribute('aria-expanded',String(!this.collapsed));
    document.getElementById('task-panel-content').hidden=this.collapsed;
    try {localStorage.setItem('simsim-workspace',JSON.stringify({widths:this.widths,collapsed:this.collapsed}));}catch {}
  }
}

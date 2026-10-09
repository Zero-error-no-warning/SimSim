// Keep native select values, labels and change handlers; only its popup is replaced.
// The committed selection and the candidate under the pointer are separate states.
export class SelectUI {
  constructor(root=document) {
    this.root=root;
    this.popup=document.createElement('div');
    this.popup.id='simsim-select-options';
    this.popup.className='select-popup';
    this.popup.setAttribute('popover','manual');
    this.popup.setAttribute('role','listbox');
    this.popup.addEventListener('mousedown',event=>event.preventDefault());
    this.popup.addEventListener('click',event=>{
      event.stopPropagation();
      const row=event.target.closest('[data-option-index]');
      if(row)this.commit(Number(row.dataset.optionIndex));
    });
    this.popup.addEventListener('pointermove',event=>{
      const row=event.target.closest('[data-option-index]');
      if(row&&row.getAttribute('aria-disabled')!=='true')this.activate(Number(row.dataset.optionIndex));
    });
    this.supported=typeof this.popup.showPopover==='function';
    if(!this.supported)return;
    root.addEventListener('mousedown',event=>{
      const select=this.selectTarget(event.target);
      if(select){event.preventDefault();select.focus({preventScroll:true});}
      else if(this.select&&!this.popup.contains(event.target))this.close();
    },true);
    root.addEventListener('click',event=>{
      const select=this.selectTarget(event.target);
      if(!select)return;
      event.preventDefault();
      if(select===this.select)this.close();else this.open(select);
    },true);
    root.addEventListener('keydown',event=>this.keydown(event),true);
    root.addEventListener('focusin',event=>{if(this.select&&event.target!==this.select&&!this.popup.contains(event.target))this.close();});
    root.addEventListener('change',event=>{if(event.target===this.select)this.close();});
    root.addEventListener('cancel',()=>this.close(),true);
    root.addEventListener('close',()=>this.close(),true);
    root.addEventListener('scroll',event=>{if(this.select&&!this.popup.contains(event.target))this.position();},true);
    window.addEventListener('resize',()=>this.position());
  }
  selectTarget(target){
    const select=target instanceof Element?target.closest('select'):null;
    return select&&!select.multiple&&select.size<=1&&!select.disabled?select:null;
  }
  options(){
    return [...this.select.options].map((option,index)=>({option,index})).filter(({option})=>!option.hidden&&!option.parentElement.hidden);
  }
  enabled(index){
    const option=this.select?.options[index];
    return option&&!option.disabled&&!option.hidden&&!option.parentElement.hidden&&!(option.parentElement.tagName==='OPTGROUP'&&option.parentElement.disabled);
  }
  open(select){
    this.close();
    this.select=select;this.active=select.selectedIndex;this.selected=select.selectedIndex;
    this.previousARIA=Object.fromEntries(['aria-expanded','aria-controls','aria-activedescendant','aria-haspopup'].map(name=>[name,select.getAttribute(name)]));
    select.setAttribute('aria-expanded','true');select.setAttribute('aria-controls',this.popup.id);select.setAttribute('aria-haspopup','listbox');
    const label=select.getAttribute('aria-label')||[...select.labels??[]].flatMap(label=>[...label.childNodes]).find(node=>node.nodeType===Node.TEXT_NODE&&node.textContent.trim())?.textContent.trim()||'選択肢';
    this.popup.setAttribute('aria-label',label);
    (select.closest('dialog')??document.body).append(this.popup);
    this.render();this.position();this.popup.showPopover();
    document.getElementById(this.popup.id+'-'+this.active)?.scrollIntoView({block:'nearest'});
    this.observer=new MutationObserver(()=>{
      if(!this.select)return;
      if(!this.enabled(this.active))this.active=this.select.selectedIndex;
      this.render();this.position();
    });
    this.observer.observe(select,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['disabled','hidden','label','selected']});
    this.watch();
  }
  render(){
    this.popup.replaceChildren();
    for(const {option,index} of this.options()){
      const row=document.createElement('div');
      row.id=this.popup.id+'-'+index;row.className='select-option';row.dataset.optionIndex=index;
      row.setAttribute('role','option');row.setAttribute('aria-disabled',String(!this.enabled(index)));
      const mark=document.createElement('span'),text=document.createElement('span');
      mark.className='select-mark';mark.setAttribute('aria-hidden','true');
      text.className='select-option-label';text.textContent=option.label;
      row.append(mark,text);this.popup.append(row);
    }
    this.updateStates();
  }
  updateStates(){
    const selected=this.select.selectedIndex;
    for(const row of this.popup.children){
      const index=Number(row.dataset.optionIndex),isSelected=index===selected,isActive=index===this.active;
      row.setAttribute('aria-selected',String(isSelected));row.classList.toggle('candidate',isActive);
      row.querySelector('.select-mark').textContent=isSelected?'✓':'';
    }
    const row=document.getElementById(this.popup.id+'-'+this.active);
    if(row)this.select.setAttribute('aria-activedescendant',row.id);else this.select.removeAttribute('aria-activedescendant');
  }
  activate(index,scroll=false){
    if(!this.enabled(index))return;
    this.active=index;this.updateStates();
    if(scroll)document.getElementById(this.popup.id+'-'+index)?.scrollIntoView({block:'nearest'});
  }
  move(offset){
    const options=this.options().filter(({index})=>this.enabled(index));
    if(!options.length)return;
    const current=options.findIndex(({index})=>index===this.active);
    this.activate(options[Math.max(0,Math.min(options.length-1,(current<0?0:current)+offset))].index,true);
  }
  commit(index=this.active){
    if(!this.enabled(index))return;
    const select=this.select,changed=select.selectedIndex!==index;
    select.selectedIndex=index;this.close();
    if(changed){select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));}
  }
  keydown(event){
    const select=this.selectTarget(event.target);
    if(!select)return;
    const key=event.key,open=this.select===select;
    const printable=key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&key!==' ';
    const handled=['ArrowDown','ArrowUp','Home','End','PageDown','PageUp','Enter',' ','F4'].includes(key)||open&&['Escape','Tab'].includes(key)||printable;
    if(!handled)return;
    event.stopPropagation();if(key!=='Tab')event.preventDefault();
    if(key==='Escape'){this.close();return;}
    if(key==='Tab'){this.commit();return;}
    if(open&&(['Enter',' ','F4'].includes(key)||key==='ArrowUp'&&event.altKey)){if(key==='F4')this.close();else this.commit();return;}
    if(!open)this.open(select);
    if(printable){
      const now=performance.now();this.typed=(now-(this.typedAt??0)<700?this.typed??'':'')+key.toLocaleLowerCase();this.typedAt=now;
      const options=this.options().filter(({index})=>this.enabled(index)),query=[...this.typed].every(c=>c===key.toLocaleLowerCase())?key.toLocaleLowerCase():this.typed;
      const start=query.length===1?options.findIndex(o=>o.index===this.active)+1:0;
      const ordered=[...options.slice(start),...options.slice(0,start)],match=ordered.find(({option})=>option.label.trim().toLocaleLowerCase().startsWith(query));
      if(match)this.activate(match.index,true);
    }else if(open&&key==='ArrowDown'&&!event.altKey)this.move(1);
    else if(open&&key==='ArrowUp')this.move(-1);
    else if(key==='Home'||key==='End'){
      const options=this.options().filter(({index})=>this.enabled(index));
      if(options.length)this.activate(options[key==='Home'?0:options.length-1].index,true);
    }else if(key==='PageDown'||key==='PageUp')this.move(key==='PageDown'?10:-10);
  }
  position(){
    if(!this.select)return;
    const rect=this.select.getBoundingClientRect(),gap=5,below=innerHeight-rect.bottom-gap-8,above=rect.top-gap-8;
    const openBelow=below>=Math.min(320,above);
    const height=Math.min(320,openBelow?below:above),width=Math.min(Math.max(rect.width,245),innerWidth-16);
    this.popup.style.width=width+'px';this.popup.style.maxHeight=Math.max(45,height)+'px';
    this.popup.style.left=Math.max(8,Math.min(rect.left,innerWidth-width-8))+'px';
    if(openBelow){this.popup.style.top=rect.bottom+gap+'px';this.popup.style.bottom='auto';}
    else{this.popup.style.top='auto';this.popup.style.bottom=innerHeight-rect.top+gap+'px';}
  }
  watch(){
    if(!this.select)return;
    const rect=this.select.getBoundingClientRect();
    if(!this.select.isConnected||this.select.disabled||!rect.width||getComputedStyle(this.select).visibility==='hidden'){this.close();return;}
    if(this.selected!==this.select.selectedIndex){this.selected=this.select.selectedIndex;this.active=this.selected;this.updateStates();}
    this.frame=requestAnimationFrame(()=>this.watch());
  }
  close(){
    cancelAnimationFrame(this.frame);this.observer?.disconnect();
    if(!this.select)return;
    const select=this.select;this.select=null;
    for(const [name,value] of Object.entries(this.previousARIA)){if(value===null)select.removeAttribute(name);else select.setAttribute(name,value);}
    if(this.popup.matches(':popover-open'))this.popup.hidePopover();
    this.popup.remove();this.typed='';this.typedAt=0;
  }
}

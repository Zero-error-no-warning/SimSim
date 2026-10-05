// Shared desktop menu: native context-menu key, arrow navigation and focus return.
export class ContextMenu{
  constructor(element){
    this.element=element;element.classList.add('map-menu');element.hidden=true;element.setAttribute('role','menu');
    document.addEventListener('pointerdown',e=>{if(!element.contains(e.target))this.close(false);},true);
    document.addEventListener('simsim-menu-open',e=>{if(e.detail!==this)this.close(false);});
    window.addEventListener('blur',()=>this.close(false));
    element.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.close();return;}
      if(e.key==='Tab'){this.close(false);return;}
      if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
      e.preventDefault();const items=[...element.querySelectorAll('button:not(:disabled)')],i=items.indexOf(document.activeElement);
      items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();
    });
  }
  open(x,y,items,origin=document.activeElement){
    document.dispatchEvent(new CustomEvent('simsim-menu-open',{detail:this}));this.origin=origin;
    const el=this.element;el.replaceChildren();
    for(const item of items){
      if(!item){const line=document.createElement('hr');line.setAttribute('role','separator');el.append(line);continue;}
      const b=document.createElement('button');b.textContent=item.label;b.disabled=!!item.disabled;b.setAttribute('role','menuitem');
      b.onclick=()=>{this.close();item.action();};el.append(b);
    }
    el.hidden=false;el.style.left=Math.max(4,Math.min(x,innerWidth-el.offsetWidth-4))+'px';el.style.top=Math.max(4,Math.min(y,innerHeight-el.offsetHeight-4))+'px';
    el.querySelector('button:not(:disabled)')?.focus();
  }
  close(restore=true){
    if(this.element.hidden)return;this.element.hidden=true;
    if(restore&&this.origin?.isConnected)this.origin.focus({preventScroll:true});
  }
}

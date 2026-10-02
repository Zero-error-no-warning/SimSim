// Numeric x coordinates; the data values are never shifted to separate overlapping conditions.
export function numericScale(values,log=false) {
  const valid=values.filter(v=>Number.isFinite(v)&&(!log||v>0));if(!valid.length)return null;
  let lo=Math.min(...valid),hi=Math.max(...valid),ticks=[];
  if(log){
    let a=Math.log10(lo),b=Math.log10(hi);if(a===b){a-=.5;b+=.5;}else {const pad=(b-a)*.04;a-=pad;b+=pad;}
    lo=10**a;hi=10**b;
    const stride=Math.max(1,Math.ceil((b-a)/6));
    for(let e=Math.floor(a);e<=Math.ceil(b);e+=stride)for(const m of stride===1?[1,2,5]:[1]){const v=m*10**e;if(v>=lo&&v<=hi)ticks.push(v);}
    if(ticks.length<2)ticks=[...new Set(valid)].sort((x,y)=>x-y);
    return {lo,hi,ticks,position:v=>(Math.log10(v)-a)/(b-a)};
  }
  if(lo===hi){const pad=Math.max(Math.abs(lo)*.1,1);lo-=pad;hi+=pad;}
  const raw=(hi-lo)/5,power=10**Math.floor(Math.log10(raw)),ratio=raw/power,step=(ratio<=1?1:ratio<=2?2:ratio<=5?5:10)*power;
  lo=Math.floor(lo/step)*step;hi=Math.ceil(hi/step)*step;
  for(let i=0;i<=Math.round((hi-lo)/step);i++)ticks.push(lo+i*step);
  return {lo,hi,ticks,position:v=>(v-lo)/(hi-lo)};
}

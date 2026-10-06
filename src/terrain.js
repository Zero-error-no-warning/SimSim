const finite=Number.isFinite;
export class Terrain {
  constructor(data) {
    this.data = data;
    this.minX = data.origin.x;
    this.minY = data.origin.y;
    this.maxX = this.minX+(data.columns-1)*data.spacing;
    this.maxY = this.minY+(data.rows-1)*(data.spacingY??data.spacing);
    this.cellSize=Math.min(data.spacing,data.spacingY??data.spacing);
  }
  contains(x,y) {
    return finite(x) && finite(y) && x >= this.minX && x <= this.maxX && y >= this.minY && y <= this.maxY;
  }
  height(x,y) {
    if (!this.contains(x,y)) return null;
    const d=this.data, gx=(x-this.minX)/d.spacing, gy=(y-this.minY)/(d.spacingY??d.spacing);
    const ix=Math.min(d.columns-2,Math.floor(gx)), iy=Math.min(d.rows-2,Math.floor(gy));
    const fx=gx-ix, fy=gy-iy, at=(dx,dy)=>d.elevations[(iy+dy)*d.columns+ix+dx];
    return (at(0,0)*(1-fx)+at(1,0)*fx)*(1-fy)+(at(0,1)*(1-fx)+at(1,1)*fx)*fy;
  }
  project(point,domain) {
    const p={
      ...point
    }, h=this.height(p.x,p.y), sea=this.data.seaLevel;
    if (h===null) return {
      point:p, error:'地形データの範囲外です'
    };
    if (domain==='ground') {
      p.z=h;
      if(h<=sea) return {
        point:p,error:'地上ユニットは陸上に配置してください'
      };
    }
    if (domain==='surface') {
      p.z=sea;
      if(h>sea-5) return {
        point:p,error:'水上ユニットには5m以上の水深が必要です'
      };
    }
    if (domain==='subsurface' && (p.z>sea-1 || p.z<h+5 || h>=sea)) return {
      point:p,error:'水中ユニットは海面下かつ海底から5m以上離してください'
    };
    if (domain==='air' && p.z<=Math.max(h,sea)+10) return {
      point:p,error:'空中ユニットは地表・海面から10mより高くしてください'
    };
    return {
      point:p,error:null
    };
  }
}

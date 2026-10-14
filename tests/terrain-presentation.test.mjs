import test from 'node:test';
import assert from 'node:assert/strict';
import {Terrain} from '../src/terrain.js?v=20261014-placement-height-33';
import {meshHeight,terrainGrid,coastline} from '../src/terrain-presentation.js?v=20261014-placement-height-33';
const terrain=()=>new Terrain({origin:{x:-1000,y:200},columns:2,rows:2,spacing:2000,spacingY:1000,seaLevel:100,elevations:[-100,300,300,-100]});
test('grid follows rendered triangles, including saddle and rectangular cells',()=>{
 const t=terrain(),grid=terrainGrid(t);assert.equal(meshHeight(t,0,700),300);assert(grid.spacing<5000);
 for(const points of [grid.positions,grid.major])for(let i=0;i<points.length;i+=6){
  const [x,z,y,a,b,c]=points.slice(i,i+6);assert.equal(z,meshHeight(t,x,y));assert.equal(b,meshHeight(t,a,c));
  assert(Math.abs((z+b)/2-meshHeight(t,(x+a)/2,(y+c)/2))<1e-8);
 }
});
test('coastline crosses each triangle at actual sea elevation',()=>{
 const t=terrain(),points=coastline(t);assert.equal(points.length,12);
 for(let i=0;i<points.length;i+=3){assert.equal(points[i+1],100);assert.equal(meshHeight(t,points[i],points[i+2]),100);}
 t.data.elevations.fill(200);assert.deepEqual(coastline(t),[]);
});

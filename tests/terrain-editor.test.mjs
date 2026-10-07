import assert from 'node:assert/strict';
import {paintTerrain} from '../src/terrain-editor.js?v=20261007-plans-23';
import {Terrain} from '../src/engine.js?v=20261007-plans-23';
import {terrainVisible} from '../src/contact.js?v=20261007-plans-23';
const data={columns:7,rows:7,spacing:100,origin:{x:0,y:0},seaLevel:0,elevations:Array(49).fill(-100)};
const original=structuredClone(data);const center={x:300,y:300};
assert(paintTerrain(data,center,{mode:'raise',radius:200,amount:300}));assert.equal(data.elevations[24],200);assert.equal(data.elevations[0],-100);assert.equal(data.elevations[22],-100);
const terrain=new Terrain(data);assert(terrain.project({x:300,y:300,z:0},'surface').error);assert.equal(terrain.project({x:300,y:300,z:0},'ground').point.z,200);
assert(!terrainVisible(terrain,{x:0,y:300,z:100},{x:600,y:300,z:100}));assert(terrainVisible(new Terrain(original),{x:0,y:300,z:100},{x:600,y:300,z:100}));
paintTerrain(data,center,{mode:'lower',radius:200,amount:300});assert.equal(data.elevations[24],-100);
paintTerrain(data,center,{mode:'flatten',radius:200,target:1000});assert.equal(data.elevations[24],1000);assert.equal(data.elevations[0],-100);
paintTerrain(data,center,{mode:'smooth',radius:200,amount:100});assert(data.elevations[24]<1000);assert(data.elevations[24]>-100);
paintTerrain(data,center,{mode:'raise',radius:200,amount:1e6});assert.equal(data.elevations[24],10000);paintTerrain(data,center,{mode:'lower',radius:200,amount:1e6});assert.equal(data.elevations[24],-12000);
assert.throws(()=>paintTerrain(data,center,{mode:'raise',radius:1,amount:10}),/ブラシ/);
console.log('PASS: terrain brush bounds/falloff, raise/lower/flatten/smooth, SI heights, domain constraints and sensor terrain occlusion');

const {resizeTerrain}=await import('../src/terrain-editor.js?v=20261007-plans-23');
const slope={...structuredClone(original),elevations:Array.from({length:49},(_,i)=>i%7+Math.floor(i/7)*10)};
const resized=resizeTerrain(slope,600,1200),rect=new Terrain(resized);
assert.equal(resized.columns,7);assert.equal(resized.rows,7);assert.equal(resized.spacing,100);assert.equal(resized.spacingY,200);
assert.equal(rect.maxX,600);assert.equal(rect.maxY,1200);assert.equal(rect.height(150,200),21.5);assert.equal(rect.height(300,1100),63);assert.equal(rect.height(300,1201),null);
assert.deepEqual(resized.origin,slope.origin);assert.deepEqual(slope.elevations,Array.from({length:49},(_,i)=>i%7+Math.floor(i/7)*10));
const brush={...resized,elevations:Array(49).fill(0)};paintTerrain(brush,{x:300,y:600},{mode:'raise',radius:250,amount:100});
assert.equal(brush.elevations[24],100);assert.equal(brush.elevations[10],0);assert(brush.elevations[23]>brush.elevations[17]);
const ridge={...resized,elevations:Array.from({length:49},(_,i)=>Math.floor(i/7)===3?200:0)};
assert(!terrainVisible(new Terrain(ridge),{x:300,y:0,z:100},{x:300,y:1200,z:100}));
assert.throws(()=>resizeTerrain(slope,0,100),/領域サイズ/);assert.throws(()=>resizeTerrain(slope,60001,100),/領域サイズ/);
assert(!('spacingY' in resizeTerrain(resized,600,600)));
console.log('PASS: fixed-count rectangular resize, exact independent dimensions, interpolation/edge fill, circular brush and sensor occlusion with unequal grid intervals');

// Refining a nested grid preserves the original samples and interpolated surface.
const island=structuredClone(original);island.origin={x:-1000,y:500};island.elevations[3*7+1]=100;
const refined=resizeTerrain(island,600,600,{columns:13,rows:25}),fineTerrain=new Terrain(refined);
assert.equal(refined.elevations.length,13*25);assert.equal(refined.spacing,50);assert.equal(refined.spacingY,25);
assert.equal(fineTerrain.maxX,-400);assert.equal(fineTerrain.maxY,1100);assert.deepEqual(refined.origin,island.origin);
for(let row=0;row<7;row++)for(let col=0;col<7;col++)assert.equal(refined.elevations[row*4*13+col*2],island.elevations[row*7+col]);
for(const p of [{x:-950,y:775},{x:-900,y:800},{x:-725,y:987}])assert.equal(fineTerrain.height(p.x,p.y),new Terrain(island).height(p.x,p.y));
assert.equal(fineTerrain.height(-900,800),100);assert.deepEqual(island.elevations,original.elevations.map((h,i)=>i===22?100:h));
assert.deepEqual(resizeTerrain(refined,600,600,{columns:7,rows:7}),island);
const coarse=resizeTerrain(island,600,600,{columns:4,rows:4});assert.equal(new Terrain(coarse).height(-900,800),-100);
const maximum=resizeTerrain(original,600,600,{columns:513,rows:513});assert.equal(maximum.elevations.length,513*513);assert.equal(new Terrain(maximum).height(123,456),-100);
for(const value of [1,514,2.5,NaN]){
  assert.throws(()=>resizeTerrain(original,600,600,{columns:value,rows:7}),/地形格子数/);
  assert.throws(()=>resizeTerrain(original,600,600,{columns:7,rows:value}),/地形格子数/);
}
assert.throws(()=>resizeTerrain(original,1,600,{columns:7,rows:7}),/領域サイズ/);
assert.throws(()=>resizeTerrain(original,20000,600,{columns:2,rows:7}),/領域サイズ/);
console.log('PASS: variable terrain grid counts, nested island preservation, world coordinates/bounds, exact interpolation, coarsening, limits and immutable input');

const {sampleTerrainHeight}=await import('../src/terrain-editor.js?v=20261007-plans-23');
const gradual={...structuredClone(original),elevations:Array(49).fill(0)};
paintTerrain(gradual,center,{mode:'flatten',radius:200,target:100,strength:.2});assert.equal(gradual.elevations[24],20);assert.equal(gradual.elevations[23],11.25);
paintTerrain(gradual,center,{mode:'flatten',radius:200,target:100,strength:.2});assert.equal(gradual.elevations[24],36);
paintTerrain(gradual,center,{mode:'flatten',radius:200,target:-100,strength:.25});assert.equal(gradual.elevations[24],2);
const unchanged=[...gradual.elevations];assert.equal(paintTerrain(gradual,center,{mode:'flatten',radius:200,target:100,strength:0}),0);assert.deepEqual(gradual.elevations,unchanged);
paintTerrain(gradual,center,{mode:'flatten',radius:200,target:123.456,strength:1});assert.equal(gradual.elevations[24],123.456);
assert.equal(sampleTerrainHeight(gradual,center),123.456);assert.equal(sampleTerrainHeight(original,{x:150,y:250,z:9999}),-100);
assert.equal(sampleTerrainHeight(resized,{x:150,y:200}),21.5);assert.equal(sampleTerrainHeight(resized,{x:300,y:1201}),null);assert.equal(sampleTerrainHeight(resized,null),null);
assert.throws(()=>paintTerrain(gradual,center,{mode:'flatten',radius:200,target:100,strength:1.01}),/ブラシ/);assert.throws(()=>paintTerrain(gradual,center,{mode:'smooth',radius:200,strength:NaN}),/ブラシ/);
const smooth={...structuredClone(original),elevations:Array(49).fill(0)};smooth.elevations[24]=90;
paintTerrain(smooth,center,{mode:'smooth',radius:200,amount:10000,strength:.5});assert.equal(smooth.elevations[24],50);
console.log('PASS: partial flatten convergence up/down, zero/full strength, circular falloff, independent smooth strength, fractional/underwater/current-draft sampling, rectangular interpolation and out-of-area guards');

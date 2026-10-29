import fs from 'node:fs';
import assert from 'node:assert/strict';
import initOC from '../_site/lib/cad/opencascade.js';
import * as cad from '../_site/lib/cad/replicad.js';
import { CadReplay } from '../js/cad-replay.js';
const oc=await initOC({wasmBinary:fs.readFileSync('_site/lib/cad/opencascade.wasm'),print:()=>{}});
cad.setOC(oc);
const name=process.argv[2]||'default';
const job=JSON.parse(fs.readFileSync(`step-output/fixtures/${name}.json`));
const replay=new CadReplay(oc,cad,job), items=[];
let maxVolume=0,maxBounds=0;
for (const [i,p] of [...job.parts,...job.assembly].entries()) {
  const shape=replay.checked(p.node), ref=p.reference;
  const volume=cad.measureVolume(shape), [lo,hi]=shape.boundingBox.bounds;
  const dv=Math.abs(volume-ref.volume)/ref.volume;
  const db=Math.max(...[...lo,...hi].map((v,i)=>Math.abs(v-ref.bounds[i])));
  assert(dv<0.02,`${name} ${p.name}: volume ${dv}`);assert(db<0.15,`${name} ${p.name}: bounds ${db}`);
  maxVolume=Math.max(maxVolume,dv);maxBounds=Math.max(maxBounds,db);
  if(i>=job.parts.length) items.push({name:p.name,shape});
}
fs.mkdirSync('step-output/web',{recursive:true});
const multibody=await replay.partSTEP(cad.makeCompound(items.map(p=>p.shape.clone()))).text();
assert.equal((multibody.match(/=\s*PRODUCT\(/g)||[]).length,1);
assert(!multibody.includes('NEXT_ASSEMBLY_USAGE_OCCURRENCE'));
fs.writeFileSync(`step-output/web/${name}-single-part.step`,multibody);
const assembly=await replay.assemblySTEP(items).text();
assert.equal((assembly.match(/NEXT_ASSEMBLY_USAGE_OCCURRENCE\(/g)||[]).length,items.length);
fs.writeFileSync(`step-output/web/${name}-assembly.step`,assembly);
console.log(`PASS browser kernel ${name}: ${job.parts.length} parts, ${items.length} assembly items; max volume ${maxVolume}, bounds ${maxBounds} mm; single product and assembly export`);

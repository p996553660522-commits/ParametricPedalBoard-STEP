import initOC from '../lib/cad/opencascade.js';
import * as cad from '../lib/cad/replicad.js';
import { CadReplay } from './cad-replay.js';
self.onmessage=async ({data:job})=>{
  try {
    self.postMessage({progress:'Loading CAD kernel …'});
    const oc=await initOC({locateFile:()=>new URL('../lib/cad/opencascade.wasm',import.meta.url).href});
    cad.setOC(oc);
    const replay=new CadReplay(oc,cad,job), files=[];
    if(job.assembly.length) {
      const items=job.assembly.map((p,i)=>{self.postMessage({progress:`Building component ${i+1}/${job.assembly.length} …`});return {name:p.name,shape:replay.checked(p.node)};});
      if(job.selection==='multibody') files.push({name:'Pedalboard-single-part.step',blob:replay.partSTEP(cad.makeCompound(items.map(p=>p.shape.clone())))});
      else files.push({name:'Pedalboard-assembly.step',blob:replay.assemblySTEP(items)});
    }
    for(const [i,p] of job.parts.entries()) {
      self.postMessage({progress:`Building part ${i+1}/${job.parts.length} …`});
      let shape=replay.checked(p.node);
      if(p.inlay!==undefined) shape=cad.makeCompound([shape.clone(),replay.checked(p.inlay).clone()]);
      const name=`${String(i+1).padStart(3,'0')}_${p.name.replace(/[^A-Za-z0-9.-]+/g,'_').slice(0,90)}.step`;
      files.push({name,blob:replay.partSTEP(shape,name.slice(0,-5))});
    }
    self.postMessage({files,quantities:job.parts.map(p=>({name:p.name,qty:p.qty}))});
  } catch(e) { self.postMessage({error:e.message || String(e)}); }
};

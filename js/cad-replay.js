// Replay the unchanged generator's operation graph in OpenCascade WebAssembly.
export class CadReplay {
  constructor(oc, cad, job) {
    if (job.version !== 1 || job.units !== 'mm') throw new Error('Unsupported CAD history');
    this.oc = oc; this.cad = cad; this.job = job; this.cache = new Map();
  }
  empty() { return this.cad.makeCompound([]); }
  bool(op, a, b) {
    const oc = this.oc;
    const builder = new oc[{add:'BRepAlgoAPI_Fuse',subtract:'BRepAlgoAPI_Cut',intersect:'BRepAlgoAPI_Common'}[op]](a.wrapped, b.wrapped);
    try {
      if (!builder.IsDone()) throw new Error('CAD boolean failed');
      builder.SimplifyResult(true, true);
      return this.cad.cast(builder.Shape());
    } finally { builder.delete(); }
  }
  union(shapes) {
    const nonempty = shapes.filter(s => s.faces.length);
    return nonempty.length ? nonempty.slice(1).reduce((a,b) => this.bool('add',a,b),nonempty[0]) : this.empty();
  }
  faces(wires) {
    const r = this.cad;
    const entries = wires.map(w => ({ wire:w, face:r.makeFace(w), parent:null, depth:0 }));
    entries.forEach(e => e.area = Math.abs(r.measureArea(e.face)));
    entries.sort((a,b) => b.area-a.area);
    for (let i=0;i<entries.length;i++) {
      const e = entries[i];
      for (let j=i-1;j>=0;j--) {
        const parent=entries[j];
        const common=this.bool('intersect', e.face, parent.face);
        if (Math.abs(r.measureArea(common)-e.area)<1e-5) { e.parent=parent; e.depth=parent.depth+1; break; }
      }
    }
    return this.union(entries.filter(e=>e.depth%2===0).map(e=>r.makeFace(e.wire,entries.filter(h=>h.parent===e).map(h=>h.wire))));
  }
  decode(a) {
    if (Array.isArray(a)) return a.map(x=>this.decode(x));
    if (a && typeof a==='object' && Object.hasOwn(a,'ref')) return this.get(a.ref);
    return a;
  }
  get(i) {
    if (this.cache.has(i)) return this.cache.get(i);
    if (!Number.isInteger(i) || i<0 || i>=this.job.nodes.length) throw new Error('Invalid CAD reference');
    const n=this.job.nodes[i];
    try {
      const shape=this.operation(n,this.decode(n.args),n.source===undefined?null:this.get(n.source));
      this.cache.set(i,shape); return shape;
    } catch(e) { throw new Error(`CAD node ${i} (${n.kind}.${n.op}): ${e.message || e}`); }
  }
  operation(n,a,s) {
    const r=this.cad, oc=this.oc, polygon=pts=>r.makePolygon(pts.map(p=>[...p,0]));
    switch(n.op) {
      case 'ofPolygons': {
        if (a[1] && a[1]!=='NonZero') throw new Error('Unsupported fill rule');
        return this.faces(a[0].filter(p=>p.length>=3).map(p=>polygon(p).outerWire()));
      }
      case 'circle': return a[1]===6 ? polygon(Array.from({length:6},(_,k)=>[a[0]*Math.cos(k*Math.PI/3),a[0]*Math.sin(k*Math.PI/3)])) : r.makeFace(r.assembleWire([r.makeCircle(a[0])]));
      case 'square': { const [x,y]=a[0]; let shape=polygon([[0,0],[x,0],[x,y],[0,y]]); return a[1]?shape.translate([-x/2,-y/2,0]):shape; }
      case 'cube': { const [x,y,z]=a[0]; let shape=r.makeBox([0,0,0],[x,y,z]); return a[1]?shape.translate([-x/2,-y/2,-z/2]):shape; }
      case 'cylinder': {
        const [h,r1,r2]=a;
        let shape=r1===r2?r.makeCylinder(r1,h):r.revolution(r.makePolygon([[0,0,0],[r1,0,0],[r2,0,h],[0,0,h]]),[0,0,0],[0,0,1],360);
        return a[4]?shape.translate([0,0,-h/2]):shape;
      }
      case 'union': return this.union(a[0]);
      case 'add': case 'subtract': case 'intersect': return this.bool(n.op,s,a[0]);
      case 'translate': return s.clone().translate(n.kind==='section'?[...a[0],0]:a[0]);
      case 'rotate': {
        let shape=s.clone(); const angles=n.kind==='section'?[0,0,a[0]]:a[0];
        angles.forEach((v,i)=>{if(v) shape=shape.rotate(v,[0,0,0],[[1,0,0],[0,1,0],[0,0,1]][i]);}); return shape;
      }
      case 'mirror': return s.clone().mirror(a[0]);
      case 'extrude': {
        if(a.length!==1) throw new Error('Unsupported extrusion');
        return this.union(s.faces.map(f=>r.basicFaceExtrusion(f,new r.Vector([0,0,a[0]]))));
      }
      case 'offset': {
        if (!['Round','Miter'].includes(a[1])) throw new Error('Unsupported offset');
        if(!a[0]) return s;
        return this.union(s.faces.map(f=>{
          const builder=new oc.BRepOffsetAPI_MakeOffset(f.wrapped,a[1]==='Round'?oc.GeomAbs_JoinType.GeomAbs_Arc:oc.GeomAbs_JoinType.GeomAbs_Intersection,false);
          try { builder.Perform(a[0],0); if(!builder.IsDone()) throw new Error('Offset failed'); return this.faces(r.cast(builder.Shape()).wires); }
          finally { builder.delete(); }
        }));
      }
      case 'decompose': {
        const distance=f=>{const [lo,hi]=f.boundingBox.bounds;return [lo[0],lo[1],hi[0],hi[1]].reduce((s,v,i)=>s+(v-[...n.bounds.min,...n.bounds.max][i])**2,0);};
        const faces=s.faces.sort((a,b)=>distance(a)-distance(b));
        if(!faces.length || distance(faces[0])>1) throw new Error('Cannot match original cross-section component'); return faces[0];
      }
      default: throw new Error('Unsupported construction operation');
    }
  }
  checked(i) {
    const s=this.get(i), check=new this.oc.BRepCheck_Analyzer(s.wrapped,true);
    try { if(!s.solids.length || !check.IsValid(s.wrapped)) throw new Error('Invalid CAD solid; export refused'); }
    finally { check.delete(); }
    return s;
  }
  partSTEP(shape,name='Pedalboard-single-part') {
    const oc=this.oc, writer=new oc.STEPControl_Writer(), progress=new oc.Message_ProgressRange();
    const previous=oc.Interface_Static.IVal('write.step.assembly');
    try {
      oc.Interface_Static.SetIVal('write.step.assembly',0);
      oc.Interface_Static.SetCVal('write.step.product.name',name);
      if(writer.Transfer(shape.wrapped,oc.STEPControl_StepModelType.STEPControl_AsIs,true,progress)!==oc.IFSelect_ReturnStatus.IFSelect_RetDone) throw new Error('STEP transfer failed');
      if(writer.Write('/part.step')!==oc.IFSelect_ReturnStatus.IFSelect_RetDone) throw new Error('STEP write failed');
      const bytes=oc.FS.readFile('/part.step'); oc.FS.unlink('/part.step'); return new Blob([bytes],{type:'application/step'});
    } finally { oc.Interface_Static.SetIVal('write.step.assembly',previous); writer.delete(); progress.delete(); }
  }
  assemblySTEP(items) {
    const oc=this.oc;
    const str=s=>new oc.TCollection_ExtendedString(s,true);
    const doc=new oc.TDocStd_Document(str('XmlOcaf'));
    const tool=oc.XCAFDoc_DocumentTool.ShapeTool(doc.Main());
    oc.XCAFDoc_ShapeTool.SetAutoNaming(false);
    const root=tool.NewShape(); oc.TDataStd_Name.Set(root,str('Pedalboard'));
    items.forEach((p,i)=>{
      const label=tool.NewShape();tool.SetShape(label,p.shape.wrapped);oc.TDataStd_Name.Set(label,str(p.name));
      tool.AddComponent(root,label,new oc.TopLoc_Location());
    }); tool.UpdateAssemblies();
    const writer=new oc.STEPCAFControl_Writer(), progress=new oc.Message_ProgressRange();
    try {
      writer.SetNameMode(true);
      if(!writer.Perform(doc,'/assembly.step',progress)) throw new Error('STEP assembly write failed');
      const bytes=oc.FS.readFile('/assembly.step');oc.FS.unlink('/assembly.step');return new Blob([bytes],{type:'application/step'});
    } finally {writer.delete(); progress.delete();doc.delete();}
  }
}

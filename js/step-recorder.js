// Record the existing CSG program without changing its results or decisions.
let nodes = [];
const ids = new WeakMap();
export function resetStepRecording() { nodes = []; }
export function stepNode(shape) { return ids.get(shape); }
export function stepGraph() { return nodes.slice(); }

export function installStepRecorder(wasm) {
  const encode = x => {
    if (x && ids.has(x)) return { ref: ids.get(x) };
    if (Array.isArray(x)) return x.map(encode);
    if (ArrayBuffer.isView(x)) return Array.from(x);
    return x;
  };
  const add = (shape, node) => { ids.set(shape, nodes.length); nodes.push(node); };
  for (const [kind, cls] of [['section', wasm.CrossSection], ['solid', wasm.Manifold]]) {
    for (const [isStatic, target] of [[true, cls], [false, cls.prototype]]) {
      const methods = isStatic ? ['ofPolygons', 'circle', 'square', 'cube', 'cylinder', 'union']
        : ['add', 'subtract', 'intersect', 'translate', 'rotate', 'mirror', 'offset', 'extrude', 'decompose'];
      for (const op of methods) {
        let owner = target;
        while (owner && !Object.hasOwn(owner, op)) owner = Object.getPrototypeOf(owner);
        if (!owner) continue;
        const original = owner[op];
        if (typeof original !== 'function') continue;
        owner[op] = function (...args) {
          const result = original.apply(this, args);
          // Drawing-only mesh reconstruction is intentionally not recorded.
          if (!isStatic && !ids.has(this)) return result;
          const node = { kind, op, args: args.map(encode) };
          if (!isStatic) node.source = ids.get(this);
          if (op === 'decompose') {
            result.forEach(part => add(part, { ...node, bounds: part.bounds(), area: part.area() }));
          } else add(result, node);
          return result;
        };
      }
    }
  }
}

export function stepRequest(result, selection = 'all') {
  if (result.errors.length) throw new Error('Resolve geometry errors before exporting STEP.');
  const meshRef = mesh => {
    if (!Number.isInteger(mesh.step)) throw new Error('Missing CAD construction history.');
    return mesh.step;
  };
  const parts = result.parts.map((p, i) => ({ name: p.name, qty: p.qty, node: meshRef(p.mesh),
    ...(p.inlay ? { inlay: meshRef(p.inlay) } : {}), index: i }));
  return { version: 1, units: 'mm', nodes: result.stepGraph,
    selection,
    parts: Number.isInteger(selection) ? parts.filter(p => p.index === selection) : ['assembly', 'multibody'].includes(selection) ? [] : parts,
    assembly: Number.isInteger(selection) || selection === 'parts' ? [] : result.assembly.map((a, i) => ({
      name: `${a.tag || a.role}_${i + 1}`, role: a.role, node: meshRef(a.mesh) })) };
}

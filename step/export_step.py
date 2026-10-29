"""Replay the generator's construction history as OpenCascade B-rep, never STL."""
import argparse
import json
import math
import hashlib
import os
from pathlib import Path
import re
import sys
import cadquery as cq
from cadquery.occ_impl.shapes import sortWiresByBuildOrder
from cadquery.occ_impl.exporters.assembly import exportAssembly
from OCP.BRepOffsetAPI import BRepOffsetAPI_MakeOffset
from OCP.GeomAbs import GeomAbs_Arc, GeomAbs_Intersection
from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
from OCP.Interface import Interface_Static
from OCP.IFSelect import IFSelect_RetDone


def compound(shapes):
    shapes = [s for s in shapes if not s.isNull()]
    return shapes[0] if len(shapes) == 1 else cq.Compound.makeCompound(shapes)


def union(shapes):
    shapes = [s for s in shapes if s.Faces()]
    return shapes[0].fuse(*shapes[1:]).clean() if len(shapes) > 1 else compound(shapes)


def polygon(points):
    return cq.Wire.makePolygon([cq.Vector(*p, 0) for p in points], close=True)


def faces_from_wires(wires):
    return compound([cq.Face.makeFromWires(g[0], g[1:]) for g in sortWiresByBuildOrder(wires)]) if wires else compound([])


class Replay:
    def __init__(self, job):
        if job.get('version') != 1 or job.get('units') != 'mm':
            raise ValueError('Unsupported STEP construction format')
        self.nodes = job['nodes']
        self.cache = {}
        self.active = set()
        self.validated = {}
        self.fingerprints = {}

    def fingerprint(self, i):
        """Exact construction identity, independent of recorder node numbering."""
        if i not in self.fingerprints:
            def replace(x):
                if isinstance(x, dict):
                    return {'shape': self.fingerprint(x['ref'])} if set(x) == {'ref'} else {k: replace(v) for k, v in x.items()}
                return list(map(replace, x)) if isinstance(x, list) else x
            n = dict(self.nodes[i])
            if 'source' in n:
                n['source'] = self.fingerprint(n['source'])
            self.fingerprints[i] = hashlib.sha256(json.dumps(replace(n), sort_keys=True).encode()).hexdigest()
        return self.fingerprints[i]

    def definition(self, node):
        """Separate the original rigid placement from a reusable part definition."""
        location = cq.Location()
        while self.nodes[node]['kind'] == 'solid' and self.nodes[node]['op'] in ('translate', 'rotate'):
            n = self.nodes[node]
            if n['op'] == 'translate':
                transform = cq.Location(cq.Vector(*n['args'][0]))
            else:
                transform = cq.Location()
                for angle, axis in zip(n['args'][0], [(1, 0, 0), (0, 1, 0), (0, 0, 1)]):
                    transform = cq.Location(cq.Vector(), cq.Vector(*axis), angle) * transform
            location = location * transform
            node = n['source']
        return node, location

    def decode(self, x):
        if isinstance(x, dict) and set(x) == {'ref'}:
            return self.get(x['ref'])
        if isinstance(x, list):
            return [self.decode(v) for v in x]
        return x

    def get(self, i):
        if not isinstance(i, int) or i < 0 or i >= len(self.nodes):
            raise ValueError('Invalid construction reference')
        if i in self.cache:
            return self.cache[i]
        if i in self.active:
            raise ValueError('Cyclic construction history')
        self.active.add(i)
        n = self.nodes[i]
        try:
            a = self.decode(n['args'])
            s = self.get(n['source']) if 'source' in n else None
            shape = self.operation(n, a, s)
            self.cache[i] = shape
            return shape
        except Exception as e:
            raise ValueError(f"CAD node {i} ({n['kind']}.{n['op']}): {e}") from e
        finally:
            self.active.remove(i)

    def operation(self, n, a, s):
        op, kind = n['op'], n['kind']
        if op == 'ofPolygons':
            if len(a) > 1 and a[1] != 'NonZero':
                raise ValueError('Unsupported polygon fill rule')
            return faces_from_wires([polygon(p) for p in a[0] if len(p) >= 3])
        if op == 'circle':
            r = a[0]
            # Six sides represent the designed hexagonal nut pocket, not tessellation.
            if len(a) > 1 and a[1] == 6:
                return cq.Face.makeFromWires(polygon([[r*math.cos(k*math.pi/3), r*math.sin(k*math.pi/3)] for k in range(6)]))
            return cq.Face.makeFromWires(cq.Wire.makeCircle(r, cq.Vector(), cq.Vector(0, 0, 1)))
        if op == 'square':
            x, y = a[0]
            p = cq.Face.makeFromWires(polygon([[0, 0], [x, 0], [x, y], [0, y]]))
            return p.translate((-x/2, -y/2, 0)) if len(a) > 1 and a[1] else p
        if op == 'cube':
            x, y, z = a[0]
            p = cq.Solid.makeBox(x, y, z)
            return p.translate((-x/2, -y/2, -z/2)) if len(a) > 1 and a[1] else p
        if op == 'cylinder':
            h, r1, r2 = a[:3]
            p = cq.Solid.makeCylinder(r1, h) if r1 == r2 else cq.Solid.makeCone(r1, r2, h)
            return p.translate((0, 0, -h/2)) if len(a) > 4 and a[4] else p
        if op == 'union':
            return union(a[0])
        if op == 'add':
            return union([s, a[0]])
        if op in ('subtract', 'intersect'):
            return (s.cut(a[0]) if op == 'subtract' else s.intersect(a[0])).clean()
        if op == 'translate':
            return s.translate(tuple(a[0]) + ((0,) if kind == 'section' else ()))
        if op == 'rotate':
            angles = [0, 0, a[0]] if kind == 'section' else a[0]
            for angle, axis in zip(angles, [(1, 0, 0), (0, 1, 0), (0, 0, 1)]):
                if angle:
                    s = s.rotate((0, 0, 0), axis, angle)
            return s
        if op == 'mirror':
            return s.mirror(tuple(a[0]))
        if op == 'extrude':
            if len(a) != 1:
                raise ValueError('Only the generator\'s straight extrusions are supported')
            return union([cq.Solid.extrudeLinear(f.outerWire(), f.innerWires(), cq.Vector(0, 0, a[0])) for f in s.Faces()])
        if op == 'offset':
            delta, join = a[:2]
            if not s.Faces() or abs(delta) < 1e-12:
                return s
            if join not in ('Round', 'Miter'):
                raise ValueError('Unsupported offset join')
            result = []
            for f in s.Faces():
                builder = BRepOffsetAPI_MakeOffset(f.wrapped, GeomAbs_Arc if join == 'Round' else GeomAbs_Intersection, False)
                builder.Perform(delta)
                if not builder.IsDone():
                    raise ValueError('Offset failed; mesh fallback is disabled')
                result.append(faces_from_wires(cq.Shape.cast(builder.Shape()).Wires()))
            return union(result)
        if op == 'decompose':
            # The original kernel still makes all branching decisions. Match its chosen component.
            b = n['bounds']
            def distance(f):
                bb = f.BoundingBox()
                return sum((x-y)**2 for x, y in zip([bb.xmin, bb.ymin, bb.xmax, bb.ymax], b['min'] + b['max']))
            candidates = sorted(s.Faces(), key=distance)
            if not candidates or distance(candidates[0]) > 1:
                raise ValueError('Cannot match original cross-section component')
            return candidates[0]
        raise ValueError(f'Unsupported construction operation: {op}')


def checked_shape(replay, node):
    if node in replay.validated:
        return replay.validated[node]
    s = replay.get(node).clean()
    if not s.Solids() or not s.isValid() or any(v.Volume() <= 0 for v in s.Solids()):
        raise ValueError(f'Invalid or empty solid at node {node}; export refused')
    replay.validated[node] = s
    return s


def build_assembly(job, replay):
    assembly = cq.Assembly(name='Pedalboard')
    definitions, instances = {}, []
    for i, p in enumerate(job.get('assembly', [])):
        base, location = replay.definition(p['node'])
        key = replay.fingerprint(base)
        if key not in definitions:
            definitions[key] = checked_shape(replay, base)
        shape = definitions[key]
        assembly.add(shape, loc=location, name=f'{i+1:03}_{p["name"]}')
        instances.append({'name': p['name'], 'definition': key, 'solids': len(shape.Solids()), 'volume_mm3': shape.Volume()})
    return assembly, instances, len(definitions)


def export_part(shape, filename):
    """Write a true single product, including when it has several solids.

    OCCT defaults to auto-assembly for compounds. Explicitly disabling this is
    essential: flattening the Python assembly alone does not flatten STEP.
    """
    writer = STEPControl_Writer()
    previous = Interface_Static.IVal_s('write.step.assembly')
    previous_name = Interface_Static.CVal_s('write.step.product.name')
    try:
        if not Interface_Static.SetIVal_s('write.step.assembly', 0):
            raise ValueError('Cannot disable automatic STEP assemblies')
        Interface_Static.SetCVal_s('write.step.product.name', Path(filename).stem)
        if writer.Transfer(shape.wrapped, STEPControl_AsIs) != IFSelect_RetDone:
            raise ValueError('STEP part transfer failed')
        if writer.Write(str(filename)) != IFSelect_RetDone:
            raise ValueError('STEP part writer failed')
    finally:
        Interface_Static.SetIVal_s('write.step.assembly', previous)
        Interface_Static.SetCVal_s('write.step.product.name', previous_name)


def export(job, output):
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    previous = Path.cwd()
    # OCCT on Windows cannot reliably write Unicode absolute paths. Relative ASCII
    # filenames work even when the project/output directory contains Cyrillic.
    os.chdir(output)
    try:
        return export_in_directory(job, Path('.'))
    finally:
        os.chdir(previous)


def export_in_directory(job, output):
    replay = Replay(job)
    report = {'units': 'mm', 'parts': [], 'assembly': []}
    for i, p in enumerate(job.get('parts', [])):
        name = re.sub(r'[^A-Za-z0-9.-]+', '_', p['name']).strip('._')[:90] or 'part'
        shape = checked_shape(replay, p['node'])
        filename = f'{i+1:03}_{name}.step'
        export_part(shape, output / filename)
        report['parts'].append({'name': p['name'], 'qty': p['qty'], 'file': filename, 'solids': len(shape.Solids()), 'volume_mm3': shape.Volume()})
        if 'inlay' in p:
            # Keep the insert as a separate solid inside the same part file.
            inlay = checked_shape(replay, p['inlay'])
            export_part(compound([shape, inlay]), output / filename)
            report['parts'][-1]['inlay_solids'] = len(inlay.Solids())
    if job.get('assembly'):
        assembly, report['assembly'], report['unique_definitions'] = build_assembly(job, replay)
        if job.get('selection') == 'multibody':
            export_part(assembly.toCompound(), output / 'Pedalboard-single-part.step')
        else:
            if not exportAssembly(assembly, str(output / 'Pedalboard-assembly.step')):
                raise ValueError('STEP assembly writer failed')
    (output / 'manifest.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    return report


if __name__ == '__main__':
    sys.setrecursionlimit(10000)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('job')
    parser.add_argument('output')
    args = parser.parse_args()
    export(json.loads(Path(args.job).read_text(encoding='utf-8')), args.output)

"""Compare analytic B-rep to the unchanged tessellated generator; round-trip STEP."""
import json
from pathlib import Path
import sys
import tempfile
import time
import cadquery as cq
from export_step import Replay, checked_shape

sys.setrecursionlimit(10000)
for path in (list(map(Path, sys.argv[1:])) or sorted(Path('step-output/fixtures').glob('*.json'))):
    start = time.monotonic()
    job = json.loads(path.read_text(encoding='utf-8'))
    replay = Replay(job)
    max_volume, max_bounds, count, curved = 0, 0, 0, 0
    for part in job['parts'] + job['assembly']:
        shape = checked_shape(replay, part['node'])
        ref = part['reference']
        bb = shape.BoundingBox()
        bounds = [bb.xmin, bb.ymin, bb.zmin, bb.xmax, bb.ymax, bb.zmax]
        dv = abs(shape.Volume()-ref['volume']) / ref['volume']
        db = max(abs(a-b) for a,b in zip(bounds, ref['bounds']))
        assert dv < 0.02, (path.name, part['name'], 'volume delta', dv)
        assert db < 0.15, (path.name, part['name'], 'bounds delta', db)
        max_volume, max_bounds = max(max_volume, dv), max(max_bounds, db)
        curved += sum(f.geomType() in ('CYLINDER', 'CONE', 'TORUS') for f in shape.Faces())
        with tempfile.TemporaryDirectory(dir='step-output') as tmp:
            filename = str(Path(tmp) / 'roundtrip.step')
            cq.exporters.export(shape, filename)
            loaded = cq.importers.importStep(filename).val()
            assert loaded.isValid() and len(loaded.Solids()) == len(shape.Solids())
            assert abs(loaded.Volume()-shape.Volume()) < max(0.001, shape.Volume()*1e-7)
        count += 1
    assert curved > 0
    print(f'PASS {path.stem}: {count} B-reps + STEP roundtrips, max volume delta={max_volume:.6%}, bounds={max_bounds:.6f} mm, curved faces={curved}, time={time.monotonic()-start:.1f}s', flush=True)

"""Check reusable STEP components, placements and a single embedded root."""
import json
from pathlib import Path
import re
import sys
import tempfile
import cadquery as cq
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TDocStd import TDocStd_Document
from OCP.TCollection import TCollection_ExtendedString
from OCP.TDF import TDF_LabelSequence
from OCP.XCAFDoc import XCAFDoc_DocumentTool
from cadquery.occ_impl.exporters.assembly import exportAssembly
from export_step import Replay, build_assembly, checked_shape

sys.setrecursionlimit(10000)
for path in (list(map(Path, sys.argv[1:])) or sorted(Path('step-output/fixtures').glob('*.json'))):
    job = json.loads(path.read_text(encoding='utf-8'))
    replay = Replay(job)
    assembly, instances, definitions = build_assembly(job, replay)
    assert definitions < len(instances), 'Repeated parts must share a definition'
    for p, child in zip(job['assembly'], assembly.children):
        placed = child.obj.moved(child.loc)
        original = checked_shape(replay, p['node'])
        a, b = placed.BoundingBox(), original.BoundingBox()
        assert max(abs(getattr(a, k)-getattr(b, k)) for k in ('xmin','ymin','zmin','xmax','ymax','zmax')) < 1e-6
        assert abs(placed.Volume()-original.Volume()) < 1e-5
        assert (placed.Center()-original.Center()).Length < 1e-6
    with tempfile.TemporaryDirectory(dir='step-output') as tmp:
        filename = str(Path(tmp) / 'assembly.step')
        assert exportAssembly(assembly, filename)
        text = Path(filename).read_text()
        assert 'FACETED_BREP' not in text and 'TESSELLATED' not in text
        assert 'EXTERNALLY_DEFINED' not in text and 'DOCUMENT_FILE' not in text
        products = len(re.findall(r'=\s*PRODUCT\(', text))
        assert products == definitions + 1, (products, definitions)
        doc = TDocStd_Document(TCollection_ExtendedString('BinXCAF'))
        reader = STEPCAFControl_Reader()
        assert reader.Perform(filename, doc)
        tool = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
        roots, children = TDF_LabelSequence(), TDF_LabelSequence()
        tool.GetFreeShapes(roots)
        assert roots.Length() == 1 and tool.IsAssembly_s(roots.Value(1))
        tool.GetComponents_s(roots.Value(1), children)
        assert children.Length() == len(instances)
        loaded = cq.Shape.cast(tool.GetShape_s(roots.Value(1)))
        expected = assembly.toCompound()
        assert loaded.isValid() and len(loaded.Solids()) == len(expected.Solids())
        assert abs(loaded.Volume()-expected.Volume()) < max(0.001, expected.Volume()*1e-7)
        assert sorted(p.name for p in Path(tmp).iterdir()) == ['assembly.step']
    print(f'PASS {path.stem}: one STEP assembly, {len(instances)} instances / {definitions} definitions, placements and solids preserved', flush=True)

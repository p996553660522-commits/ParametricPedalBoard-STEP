"""A multibody part must not silently turn back into a STEP assembly."""
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
from OCP.Interface import Interface_Static
from OCP.STEPControl import STEPControl_Writer
from export_step import Replay, build_assembly, export_part

sys.setrecursionlimit(10000)
for path in (list(map(Path, sys.argv[1:])) or sorted(Path('step-output/fixtures').glob('*.json'))):
    job = json.loads(path.read_text(encoding='utf-8'))
    assembly, _, _ = build_assembly(job, Replay(job))
    expected = assembly.toCompound()
    with tempfile.TemporaryDirectory(dir='step-output') as tmp:
        filename = Path(tmp) / 'multibody.step'
        STEPControl_Writer()  # initialize the OCCT parameters
        previous = Interface_Static.IVal_s('write.step.assembly')
        export_part(expected, filename)
        assert Interface_Static.IVal_s('write.step.assembly') == previous
        text = filename.read_text()
        assert len(re.findall(r'=\s*PRODUCT\(', text)) == 1
        assert 'NEXT_ASSEMBLY_USAGE_OCCURRENCE' not in text
        assert 'CONTEXT_DEPENDENT_SHAPE_REPRESENTATION' not in text
        assert text.count('MANIFOLD_SOLID_BREP(') == len(expected.Solids())
        doc = TDocStd_Document(TCollection_ExtendedString('BinXCAF'))
        assert STEPCAFControl_Reader().Perform(str(filename), doc)
        tool = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
        roots = TDF_LabelSequence()
        tool.GetFreeShapes(roots)
        assert roots.Length() == 1 and not tool.IsAssembly_s(roots.Value(1))
        loaded = cq.Shape.cast(tool.GetShape_s(roots.Value(1)))
        assert loaded.isValid() and len(loaded.Solids()) == len(expected.Solids())
        assert abs(loaded.Volume()-expected.Volume()) < max(0.001, expected.Volume()*1e-7)
        a, b = loaded.BoundingBox(), expected.BoundingBox()
        assert max(abs(getattr(a,k)-getattr(b,k)) for k in ('xmin','ymin','zmin','xmax','ymax','zmax')) < 1e-5
        assert len(list(Path(tmp).iterdir())) == 1
    print(f'PASS {path.stem}: one product, zero assembly occurrences, {len(loaded.Solids())} valid bodies', flush=True)

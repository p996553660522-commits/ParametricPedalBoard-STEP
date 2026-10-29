# ParametricPedalBoard-STEP

Analytic STEP export for [ParametricPedalBoard](https://github.com/maxxs78/ParametricPedalBoard), based on upstream `744bc93ae3c00bf745d0f7cbb07ec1cc33c6ff18`. Construction logic, dimensions, tolerances and placement are preserved. License: AGPL-3.0; upstream attribution and license remain in this repository.

## Run

On Windows install **Python 3.12 (64-bit)**, then run **`start-step.bat`**. The first run creates `.venv-step` and installs CadQuery 2.6.1 from PyPI. Open **http://127.0.0.1:8123/?lang=en**. GitHub Pages and the original `start.bat` only serve static files; STEP needs this local backend. Initial installation and the original preview's CDN dependencies need Internet access.

On Linux/macOS, create a Python 3.12 virtual environment, install `step/requirements.txt`, then run `python step/server.py` from the project directory.

## Export

* **STEP: assembly** downloads one self-contained `Pedalboard-assembly.step`. All geometry is embedded. Identical construction histories share one part definition with multiple placements. No companion files are required.
* **STEP: multibody part** downloads one `Pedalboard-multibody.step`, with the complete positioned board as separate solids inside one part. There is no assembly hierarchy. Components are not fused.
* **STEP: parts (ZIP)** downloads the printable part types in print orientation, with quantities in `manifest.json`. A row's **STEP** button downloads that part directly. Lettering inlays remain separate solids in the same file.

The assembly follows `result.assembly`: profiles, braces, placed clips and the PSU envelope are included. The original preview's schematic screws/nuts are in `result.hardware`, so they are not exported. Unplaced clips keep the original staging position.

## SolidWorks

Open the **assembly STEP alone** with **Assembly Structure Mapping → Default (As per the file)**. Its components are embedded, not external STEP dependencies. SolidWorks may create native part documents according to its import settings. For one document, use multibody export or **Import assembly as multiple body part**. When breaking a 3D Interconnect link, **Create virtual components** keeps parts internal; **Create external files** produces separate native files.

References: [STEP import and structure mapping](https://help.solidworks.com/2024/english/SolidWorks/sldworks/t_reading_step_iges_acis_sw.htm), [general import options](https://help.solidworks.com/2026/english/SolidWorks/sldworks/hidd_options_import_general.htm).

STEP contains editable B-rep solids, not a SolidWorks feature tree or mates. Verification here uses STEP read-back through OpenCascade; native SolidWorks import has not been automated.

## Construction and verification

`js/step-recorder.js` observes the original Manifold calls. Changes to `js/pedalboard.js` only install/reset the recorder, attach node references and snapshot the graph. The original geometry still makes every design and branching decision and produces all preview/STL/3MF meshes. The Python worker replays that program with CadQuery/OpenCascade.

Circles, cylinders, cones and round offsets become analytic geometry. Six-sided nut pockets remain hexagonal; lettering retains the original font polygons. Nominal parameters are unchanged, but analytic STEP bounds/volumes can differ slightly from the tessellated preview. Unsupported operations, invalid solids and unmatched cross-section components stop export. No mesh fallback is used. Arbitrary input combinations can still expose differences between geometry kernels.

Run from the repository root:

```text
node step/test-generator.mjs
.venv-step\Scripts\python.exe step/test_cad.py
.venv-step\Scripts\python.exe step/test_assembly.py
```

Generator regression compares all original outputs, including mesh buffers, BOM, warnings and drawings, against the pinned upstream source. Six cases cover printed board, aluminium, slotted plate with both clip types, bent board, three tiers, and lettering with an inlay. CAD tests validate solids, mesh-relative bounds/volume and STEP round trips. Assembly tests check shared definitions, placement, one embedded root and absence of mesh/external-file entities.

Headless default export:

```text
node step/make-fixture.mjs board.step-job.json
.venv-step\Scripts\python.exe step/export_step.py board.step-job.json step-output\board
```

Use a new output directory for each CLI job. The local server uses isolated temporary directories, limits jobs to 20 MB / 300 seconds, and listens only on `127.0.0.1:8123`.

🇩🇪 [Deutsch](README.de.md) · 🇬🇧 English (this file)

# Parametric Pedal Board — STEP edition

**[▶ Open this fork's live STEP configurator](https://p996553660522-commits.github.io/ParametricPedalBoard-STEP/?lang=en)**

This fork adds analytic STEP export for **individual parts, a self-contained assembly, and a multibody part**, preserving the original construction logic. The website computes CAD solids and STEP entirely in a browser worker; no server or Python installation is needed. The first export downloads the approximately 23 MB CAD kernel. See **[STEP export, SolidWorks import and verification](STEP.md)**. `start-step.bat` remains available as an optional local Python backend. The link below opens the original upstream configurator.

**[▶ Open the live configurator](https://maxxs78.github.io/ParametricPedalBoard/?lang=en)** · [🇩🇪 auf Deutsch](https://maxxs78.github.io/ParametricPedalBoard/?lang=de)

Browser-based generator for 3D-printable guitar pedalboards in the style of Rockboard, ModBoard, and similar designs. You set the dimensions and check live whether all parts fit on the print bed. Afterward, you export the STL files along with a parts list (BOM).

## Getting Started

ES modules and WebAssembly don't work over `file://`. That's why the configurator needs a small local web server:

```bat
start.bat
```

Alternatively, run `python -m http.server 8123` in the project folder and open http://localhost:8123. Three.js and JSZip are loaded from a CDN. The geometry core (manifold-3d) is bundled locally in `lib/`.

## How These Boards Are Built

| Reference | Construction | Adopted Features |
|---|---|---|
| Rockboard (commercial) | Aluminum frame, tilted, cross braces with gaps | Tilt angle, cable gaps between rails, power supply under the board, rubber feet, hook-and-loop tape |
| ModBoard Lite/Ultra (Hardwire Design) | 20-series T-slot extrusions as rails, printed end caps | Variant B: 2020/2040/3030/4040 profiles, mounted via through-hole and T-nuts |
| Modular Pedalboard (Erasing), FunkyCN, etc. | Fully printed, modular from segments | Variant A: rails butt against intermediate supports so every segment fits the print bed |

## Structure of the Generated Board

- **End caps (left/right)**: Wedge-shaped side pieces with pockets that the rails sit in. Fastened from the outside through a countersink — into the core hole for aluminum profiles (tapped thread).
- **Supports**: Intermediate feet, added once the span is exceeded or the rails would be too long for the bed. The rails are screwed from below; for aluminum, via T-nuts in the lower slot. The power-supply bay is automatically widened when needed.
- **Steps (optional, 2–3, construction types A/B only)**: Instead of a single tilt, the board gets a staircase profile. Step 1 behaves like a normal board (front/rear height, depth); every further step is its own shallow wedge with its own depth, its own riser (height jump), and its own front/rear height, automatically starting exactly at the top edge of the riser of the previous step. Each step must have room for at least 2 rails, otherwise validation reports an error.
  - End caps and supports get the same staircase profile; rails on each step are mounted in the same parts as before.
  - The power supply can sit on any step (the "Step" parameter).
  - **Not yet possible with multiple steps**: construction type C (print plate), weight-reduction windows, braces, bending, PedalClips. These are automatically ignored once steps are enabled, and construction type C is locked.
- **Bend (optional, construction types A/C only)**: The board bends at each support by the same angle — symmetric about the board's center, concave toward the player. The front edge (facing the player) stays nearly in one line, while the back-wall side fans out to the rear; the result is a shallow arc, as it would lie on the floor in front of the player.
  - Only possible with continuously printed rails or plate ribs; a continuous aluminum profile (construction type B) cannot bend.
  - The **supports become wedge-shaped** (like a miter joint): both support halves are each rotated by half the angle relative to each other and merged into a single solid. Every outer face — along with its dovetail pocket, screws, and bores — thus stands at a right angle to the rails of its bay. Toward the front the support stays as thick as configured; toward the back it becomes thicker. It is printed lying on a wedge face.
  - Up to 20° per support is possible when concave (positive angle). Convex (negative angle) makes the support thinner toward the back; the generator then limits the angle so the pockets of the rearmost rail don't touch (a thicker support allows more).
  - Rails, plates, braces, power-supply mounts, and end caps remain the same printed parts as in the unbent version. The technical drawing shows the bent board in all three views (as silhouettes of the actual parts, with the bend angle in the top-view title and a note above the title block); part sizes, rail length, and the parts lists stay unrolled.
- **Weight-reduction windows (optional)**: Cutouts in end caps and supports, with rounded corners.
  - Edge distance and web width are individually adjustable. This lets the windows reach close to the outer edge, including the front (lower) area of the end caps.
  - Full wall thickness is automatically preserved around rail pockets, brace pockets, rubber feet, and back-wall screws; vertical posts support each rail, wide bays get a diagonal rib, and every large, roughly rectangular window is additionally reinforced with a diagonal brace (rear-bottom to front-top) — keeping the parts stable despite less material.
- **Rails**: always displayed in black.
  - A: printed U-profile, printed upside-down. Optionally with a **dovetail** (flank angle adjustable):
    - The rail ends have tenons that flare inward. They are inserted from above into matching pockets in the end caps and supports and screwed from below.
    - In the supports, the pocket is doubled — one half for each adjoining rail segment.
  - B: T-slot extrusion 2020/2040/3030/4040, black anodized.
  - C: **slotted print plate** in the style of the Rockboard surface.
    - Ribs run underneath the plate — these are the printed rails from A with their dovetail tenons.
    - Between the ribs are webs (plate thickness adjustable), each with a row of rounded cable slots, offset from row to row.
    - The plate is split into strips per bay, and across the tilt direction where needed, to fit the print bed.
    - Adjacent strips interlock with puzzle-style dovetails. This joint web has no slots.
- **Multi-part side pieces are screwed together**:
  - Large dovetails (up to 32 mm tall, 13 mm deep) align the pieces.
  - A printed connecting bracket sits recessed on the inside and is fastened with M4 button-head screws (ISO 7380).
  - The nuts sit in hexagonal pockets on the outside.
- **Braces (optional, 1–2 pieces)**: Run lengthwise under the board, insert into pockets in the end caps and supports from below, and are screwed from below.
  - A: printed flat bars (width and height adjustable), one piece per bay with a countersink for the screw head.
  - B: off-the-shelf aluminum flat bar 20×5 mm with countersunk screws. Drill positions are listed in the BOM.
  - The position is chosen automatically. Braces avoid: power supplies, rubber feet, the support screw-access holes, and connecting brackets.
- **Back panel (optional)**:
  - Full-width plate, screwed to the end caps and supports from behind.
  - Behind each power-supply box there's a generous, rounded cutout for the connectors.
  - Split only behind the supports, where each piece is screwed on. Bay width is chosen so every back-panel piece fits the bed.
  - **Lettering (optional)**:
    - Up to 3 lines in a choice of fonts: Metal Mania, New Rocker, Pirata One, UnifrakturMaguntia, Black Ops One, Creepster, Bebas Neue, Russo One, Bungee, Orbitron, or Permanent Marker.
    - Recessed or raised, depth/height adjustable.
    - The lettering is placed in the widest free area next to cutouts and screws and is shrunk if needed.
    - "Color highlight" creates the lettering as a separate body. In the 3MF it's part of the same object with its own color; for STL export it's a separate file.
    - Recessed lettering is printed on the bed-facing side; raised lettering on top (allowing a filament change).
- **Power supply / battery box** (1–4 pieces, each in its own bay), available as either
  - **Box**: two halves made of side cheek, front wall, floor with ventilation slots, and top plate.
  - **Bracket**: two cheeks with a shelf, front lip, and top plate.

  For both variants:
  - The box sits far enough back that its open rear ends 2 mm before the back-panel plane (adjustable), even without a back panel.
  - The **rear is completely open** for the connectors. The power supply is slid in from behind and secured with a hook-and-loop cable tie.
  - Wall thickness adjustable (default 5 mm), top plate 8 mm. Screw heads sit recessed so the power supply sits flush.
  - **Screws always reachable:** every mounting screw has an opening in the bottom of the box (Ø 9.5 mm) on its axis, so a screwdriver reaches it from below before the power supply goes in.
  - **One piece or two halves:** the box is printed as two halves by default. "Print in one piece" makes it a single part – it lies on one side wall and the other side wall bridges the interior without supports, which is only offered up to a power supply height of 44 mm and if it fits on the print bed (otherwise the app falls back to two halves and says why).
  - Printed lying on the side cheek, with all walls vertical. No support material needed.
- **PedalClips (optional, any number)**: Quick mounts for one pedal each, consisting of two printed parts:
  - **Base plate** sized to the enclosure (Mini, 1590A, 1590B, 125B, Boss compact, 1590BB, 1590DD, or custom dimensions), optionally rotated 90°. The pedal is attached with hook-and-loop tape (hook side) or a dual-lock fastener.
  - **Clip insert**, screwed from above into a pocket in the base plate with countersunk screws 4×12. It's a flat, lying-printed profile; spring tongues and latches flex within the layer plane.
  - The insert grips into the cable gap between two rails for types A/B (holding under the rail's lower edge), or into a cable slot for type C (holding under the plate web). Its dimensions automatically adapt to the gap width, rail height, or plate thickness.
  - Two mechanisms to choose from:
    - **Spring clip**: two upright spring tongues with a latch nose. Place the pedal and press down until it clicks; pull firmly to remove.
    - **Bayonet**: square neck with a cross bolt. Hold the pedal at an angle, insert the bolt lengthwise into the opening, and turn 90°. Retaining lugs drop into the cavity of the printed rail or into the lower slot of the aluminum profile.
  - **Placement**: click the clip in the 3D model (or "Place" in the list). All valid positions are highlighted green; click to drop the clip there (5 mm grid, Esc cancels). Unplaced clips sit in front of the board.
  - Excluded are openings with a power supply, a brace, or too little clearance underneath. Overlapping clips, clips over the board edge, and (on a bent board) clips over a bend point are flagged by validation.
- **Standard hardware in the 3D model**: Screws, nuts, and T-nuts are shown. They can be toggled on/off and move along in the exploded view.

## Filament Usage and Material Choice

The "Printed Parts" tab shows an estimated filament amount per part (in grams, PETG) as well as the total for all plates (in kg). The estimate is based on the actual part surface (3 wall loops ≈ 1.2 mm with a 0.4 mm nozzle) plus 30% infill for the remaining core — more realistic than a flat factor on volume, since thin-walled parts (rails, window webs) would otherwise be overestimated. Real-world values depend on the slicer profile (±15–20% is normal).

The table calculates with PETG (1.27 g/cm³); to convert to a different filament, scale by the density ratio:

| Material | Density | Use Case | Temperature |
|---|---|---|---|
| PLA | 1.24 g/cm³ | indoor use only (home, rehearsal room); easiest to print, stiffest, but most brittle | softens from around 55–60 °C |
| PETG (recommended) | 1.27 g/cm³ | transport/stage, moisture-insensitive; avoid hours of direct sun (e.g., a car window) | briefly up to around 70–75 °C, sustained more like 60 °C |
| ASA | 1.05 g/cm³ | open-air, car, balcony — UV- and weather-resistant, barely discolors; needs a heated bed and ideally an enclosed printer | sustained around 90–100 °C |

## Technical Drawing

The "Drawing" tab generates an A3 sheet using first-angle projection with the following content:
- Front view, left side view, and top view with main dimensions, support spacing, tilt angle, and rail pitch
- Hidden pockets, split joints, connecting brackets, and power supply
- Cross-section through the rail (build type C: through the plate, across the ribs and cable slots)
- Parts lists (BOM) for printed parts and purchased parts
- Title block with scale

Export as SVG or via "Print / Save as PDF". The ZIP file includes the drawing as well.

## Display

- **Color schemes:** Hellfire, Toxic, High Voltage, Purple Haze, Cyber, Punk, Chrome & Blood, Goldtop, and Stealth.
- **Custom colors:** Every color can be set individually: printed parts, rails/profiles/plate, braces, back panel, lettering, standard hardware, and power supply.
- **Transparent mode:** Opacity is adjustable. Screws, nuts, and T-nuts stay opaque so they remain visible inside.
- **Language:** German and English. The app follows the browser language (English unless it is German); the DE | EN switch at the top of the side panel overrides it, and `?lang=en` / `?lang=de` in the URL selects a language directly. Part names, checks, parts list, drawing, and 3MF/ZIP file names follow the chosen language.
- **Storage:** Settings are persisted in the browser.

## Print Plates and 3MF

The "Print Plates" tab automatically arranges all printed parts onto plates sized to the configured bed, rotating parts where it saves space. In the 3D view you can see all plates in a grid or a single one.

**"All plates as one 3MF"** writes all plates into **a single .3mf file** (no ZIP). Individual plates can be exported the same way; the full ZIP includes this file as well.
- **OrcaSlicer and Bambu Studio** (and their derivatives) preserve the plate layout, plate names ("Plate 3: end cap, support"), and a preview image per plate (isometric and top view). The color-highlighted lettering insert is assigned there as its own part on filament 2.
- Plate data is stored in `Metadata/model_settings.config`, and the parts are arranged in the plate grid used by these slicers (columns = ⌈√n⌉, 20% spacing). For this to be recognized, the file carries the "BambuStudio-02.00.00.00" identifier in its header.
- **Important:** These slicers assign parts to plates by position when opening the file, and lay out the plates using the bed size *selected in the slicer*. If that's larger than the bed configured in the configurator (e.g., 250 instead of 220 mm), enter the slicer's printer bed size under "Printer build volume" → "Slicer bed X/Y"; the layout will then be centered on the larger plates. Otherwise the parts will be offset relative to the plates.
- **"Individually as ZIP"** provides a separate 3MF per plate (plate at the origin) for slicers without plate management, such as PrusaSlicer or Cura. These would otherwise display the shared file as all parts side by side.

## Files

```
index.html          User interface
js/app.js           UI, 3D preview (three.js), STL/ZIP export
js/pedalboard.js    Parametric geometry (manifold-3d CSG), standard hardware, validation, BOM
js/drawing.js       Technical drawing (SVG, A3)
js/i18n.js          Translation helper (t, tn, number formats)
js/lang/de.js, en.js  Texts per language (checked by `node tools/check-i18n.mjs`)
lib/manifold.*      manifold-3d 3.5.3 (Apache-2.0)
```

The geometry can also be used without the UI, e.g. in Node:

```js
import { initGeometry, generate } from './js/pedalboard.js';
import { initI18n } from './js/i18n.js';
await initI18n('en', async l => (await import(`./js/lang/${l}.js`)).default);   // texts of the checks, part names, BOM
await initGeometry();
const r = generate({ mode: 'alu', W: 600, D: 300, bedX: 220, bedY: 220 });
// r.parts[i].mesh = { positions, indices } in print orientation, r.bom, r.errors, r.warnings
```

## Support

This tool is free and open source. If it saved you time or helped you build something, you can support it with a coffee.

<a href="https://www.buymeacoffee.com/maxxs78" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" height="60" width="217"></a>

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0). If you run a modified version of this configurator as a public web service, you must make the source of your modifications available to its users.

Bundled dependencies keep their own licenses: [Three.js](https://threejs.org/) (MIT), [JSZip](https://stuk.github.io/jszip/) (MIT/GPLv3), and [manifold-3d](lib/LICENSE-manifold) (Apache-2.0).

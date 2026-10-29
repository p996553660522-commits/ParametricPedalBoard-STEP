// Parametrischer Pedalboard-Generator – Geometrie (manifold-3d, CSG)
//
// Koordinatensystem der Baugruppe (Z oben):
//   X = Board-Breite (links → rechts), Y = Tiefe (vorne → hinten), Z = Höhe.
// Die Schienen liegen auf der geneigten Oberseite. "Hangkoordinaten" (a, b):
//   a = Weg entlang der Oberseite ab Vorderkante, b = Normale zur Oberseite (0 = Oberfläche).

import { t as tr, tn as trn, fx, num } from './i18n.js';
import { installStepRecorder, resetStepRecording, stepNode, stepGraph } from './step-recorder.js';

let M = null;
const garbage = [];

// Liefert zu (Text, Schriftart) Konturen in Einheiten der Versalhöhe: { polys, x0, x1 } oder null
let textShaper = null;
export function setTextShaper(fn) { textShaper = fn; }

export async function initGeometry() {
  const { default: Module } = await import('../lib/manifold.js');
  const wasm = await Module();
  wasm.setup();
  installGC(wasm);
  installStepRecorder(wasm);
  M = wasm;
}

// --- Speicherverwaltung: alle WASM-Objekte einer Berechnung einsammeln und danach freigeben
function track(r) {
  if (r && typeof r === 'object') {
    if (Array.isArray(r)) r.forEach(track);
    else if (typeof r.delete === 'function') garbage.push(r);
  }
  return r;
}
function installGC(wasm) {
  const skip = new Set(['constructor', 'delete', 'isDeleted', 'deleteLater', 'isAliasOf', 'clone']);
  for (const cls of [wasm.Manifold, wasm.CrossSection]) {
    for (const target of [cls.prototype, cls]) {
      for (const name of Object.getOwnPropertyNames(target)) {
        if (skip.has(name)) continue;
        const d = Object.getOwnPropertyDescriptor(target, name);
        if (!d || typeof d.value !== 'function' || !d.writable) continue;
        const f = d.value;
        target[name] = function (...a) { return track(f.apply(this, a)); };
      }
    }
  }
}
function collect() {
  for (const o of garbage) {
    try { if (!(o.isDeleted && o.isDeleted())) o.delete(); } catch (e) { /* bereits frei */ }
  }
  garbage.length = 0;
}

// --- Normteile (Kopfmaße für Senkungen und Darstellung)
export const SCREW = {
  M4: { d: 4, clear: 4.5, hd: 7, hh: 4, name: 'M4' },
  M4L: { d: 4, clear: 4.5, hd: 7.6, hh: 2.2, name: 'M4' },           // Linsenkopf ISO 7380
  M5: { d: 5, clear: 5.5, hd: 8.5, hh: 5, name: 'M5' },
  M6: { d: 6, clear: 6.5, hd: 10, hh: 6, name: 'M6' },
  M8: { d: 8, clear: 8.5, hd: 13, hh: 8, name: 'M8' },
  S4: { d: 4, clear: 4.5, hd: 8, hh: 3.5, name: '4 mm' },            // Kunststoff-/Spanplattenschraube
  S4K: { d: 4, clear: 4.5, hd: 8, hh: 2.3, name: '4 mm' },           // dto. mit Senkkopf
};
const NUT_M4 = { af: 7, t: 3.2 };

// --- Aluminium-Profile (Nut-Maße für Darstellung, Schrauben für Stückliste)
export const PROFILES = {
  '2020': { get label() { return tr('profile.2020.label'); }, w: 20, h: 20, so: 6.2, lip: 1.8, si: 11, sd: 6.1, core: 4.2,
    wide: [0], side: [0], cores: [0], endScrew: 'M5', floorScrew: 'M5',
    get nut() { return tr('profile.2020.nut'); }, tnut: { l: 10, w: 10, t: 4 }, tap: 'M5' },
  '2040': { get label() { return tr('profile.2040.label'); }, w: 40, h: 20, so: 6.2, lip: 1.8, si: 11, sd: 6.1, core: 4.2,
    wide: [-10, 10], side: [0], cores: [-10, 10], endScrew: 'M5', floorScrew: 'M5',
    get nut() { return tr('profile.2040.nut'); }, tnut: { l: 10, w: 10, t: 4 }, tap: 'M5' },
  '3030': { get label() { return tr('profile.3030.label'); }, w: 30, h: 30, so: 8.2, lip: 2.2, si: 16.5, sd: 9, core: 6.8,
    wide: [0], side: [0], cores: [0], endScrew: 'M8', floorScrew: 'M6',
    get nut() { return tr('profile.3030.nut'); }, tnut: { l: 14, w: 15, t: 5 }, tap: 'M8' },
  '4040': { get label() { return tr('profile.4040.label'); }, w: 40, h: 40, so: 8.2, lip: 4.3, si: 20, sd: 12.5, core: 6.8,
    wide: [0], side: [0], cores: [0], endScrew: 'M8', floorScrew: 'M6',
    get nut() { return tr('profile.4040.nut'); }, tnut: { l: 14, w: 15, t: 5 }, tap: 'M8' },
};

export const DEFAULTS = {
  mode: 'print',
  bedX: 220, bedY: 220, bedZ: 250, bedMargin: 5, slicerDiffers: false, slicerX: 0, slicerY: 0,
  W: 600, D: 300, hF: 32, hB: 100,
  tiers: 1, psuTier: 1,
  tier2D: 220, tier2StepH: 35, tier2Hb: 150, tier2Rails: 2,
  tier3D: 180, tier3StepH: 35, tier3Hb: 190, tier3Rails: 2,
  nRails: 4, edge: 6,
  profile: '2020', railW: 40, railH: 20, railWall: 3, dovetail: true, dvAngle: 12,
  capT: 22, pocket: 10, supT: 24, maxSpan: 400,
  windows: true, winEdge: 6, wall: 6,
  feet: true, footD: 12, footH: 2,
  psu: true, psuOne: false, psuType: 'box', psuCount: 1, psuL: 150, psuW: 80, psuH: 30, psuGap: 2, psuBay: 0, psuWall: 5,
  brace: true, braceCount: 2, braceW: 20, braceH: 12,
  bend: false, bendAngle: 8,
  back: true, backT: 4,
  text: '', textFont: 'metal-mania', textSize: 16, textMode: 'engrave', textDepth: 1.2, textHi: true,
  plateT: 4, slotH: 22, slotL: 90, slotBridge: 18,
  clips: [],          // PedalClips: { size, w, d, type: 'spring'|'bayonet', rot, at: { site, x } | null }
  tol: 0.3,
};

const FLOOR_T = 5;        // Material unter der Schiene in den Stützen
const PILOT_R = 1.6;      // Vorbohrung für 4-mm-Kunststoffschraube
const PSU_BRIDGE_MAX = 45;  // einteilige Netzteilbox: größte freitragende Brücke (Innenhöhe) ohne Stützstrukturen
const BRACE_PILOT = 9;    // Tiefe der Vorbohrung über der Strebe
const ALU_BRACE_SINK = 0.5; // Alu-Strebe: Senkkopf liegt so viel unter der Unterseite der Leiste
const BRACE_CB = 3.5;     // Senkung für den Schraubenkopf an der Strebenunterseite
const DD = 13;            // Länge Schwalbenschwanz
const SPLICE_T = 6;       // Verbindungslasche Dicke
const SCREWS = [6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 60];

const rad = d => d * Math.PI / 180;
const deg = r => r * 180 / Math.PI;

// --- 2D/3D-Helfer
function poly(pts) { return M.CrossSection.ofPolygons([pts], 'NonZero'); }
function rect(x0, y0, x1, y1) { return poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]); }
function circle(cx, cy, r, seg = 32) { return M.CrossSection.circle(r, seg).translate([cx, cy]); }
function hex(cx, cy, af) { return M.CrossSection.circle(af / Math.sqrt(3), 6).rotate(30).translate([cx, cy]); }
function box(x0, x1, y0, y1, z0, z1) { return M.Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]); }
function csUnion(list) {
  list = list.filter(Boolean);
  if (!list.length) return null;
  return list.length === 1 ? list[0] : M.CrossSection.union(list);
}
function union(list) {
  list = list.filter(Boolean);
  if (!list.length) return null;
  return list.length === 1 ? list[0] : M.Manifold.union(list);
}
function minus(a, list) { const u = union(list); return u ? a.subtract(u) : a; }
// (y,z)-Profil entlang der Baugruppen-X-Achse von x0 bis x1 extrudieren
function ext(cs, x0, x1) { return cs.extrude(x1 - x0).translate([0, 0, x0]).rotate([90, 0, 90]); }
const polysOf = cs => cs ? cs.toPolygons().map(pg => pg.map(([x, y]) => [x, y])) : [];

export function fitOnBed(sx, sy, sz, bx, by, bz) {
  if (sz > bz + 1e-6) return { ok: false, reason: 'tooHigh' };
  for (let d = 0; d <= 90; d += 0.5) {
    const c = Math.cos(rad(d)), s = Math.sin(rad(d));
    if (sx * c + sy * s <= bx + 1e-6 && sx * s + sy * c <= by + 1e-6) return { ok: true, angle: d };
  }
  return { ok: false, reason: 'tooBig' };
}
function pickScrew(min, max = Infinity) {
  const s = SCREWS.find(v => v >= min);
  return s !== undefined && s <= max ? s : Math.ceil(min);
}
function pickScrewBelow(max) {
  const s = [...SCREWS].reverse().find(v => v <= max);
  return s === undefined ? Math.floor(max) : s;
}

// ================================================================ Ableitung aller Maße
function derive(p) {
  const errors = [], warnings = [];
  const alu = p.mode === 'alu';
  const plate = p.mode === 'plate';
  const prof = alu ? PROFILES[p.profile] : null;
  const w = alu ? prof.w : p.railW;
  const h = alu ? prof.h : p.railH;
  const tol = p.tol;
  const bx = p.bedX - 2 * p.bedMargin, by = p.bedY - 2 * p.bedMargin, bz = p.bedZ;

  const endS = alu ? SCREW[prof.endScrew] : SCREW.S4;
  const floorS = alu ? SCREW[prof.floorScrew] : SCREW.S4;
  const scr = { endS, floorS, cbD: endS.hd + 1.5, cbDepth: endS.hh + 0.5, accessD: floorS.hd + 1.5 };
  const coreOffsets = alu ? prof.cores : [0];
  const slotOffsets = alu ? prof.wide : [0];

  if (p.nRails < 1) errors.push(tr('e.minRail'));

  // --- Stufen (Multi-Tier): jede Stufe ein eigener flacher Keil, Stufe i+1 beginnt an der Absatzoberkante
  // von Stufe i (hF automatisch = vorheriges hB + Absatzhöhe). Stufe 1 verhält sich exakt wie das Board
  // ohne Stufen (volle Rückwärtskompatibilität bei tiers === 1).
  const nTiers = Math.max(1, Math.min(3, Math.round(p.tiers)));
  if (nTiers > 1 && plate) errors.push(tr('e.tierPlate'));
  if (nTiers > 1 && p.bend) warnings.push(tr('e.tierBend'));
  if (nTiers > 1 && p.windows) warnings.push(tr('e.tierWindows'));
  if (nTiers > 1 && p.brace) warnings.push(tr('e.tierBrace'));

  const tiersArr = [];
  { let y0 = 0, Lstart = 0, prevHb = p.hF;
    for (let ti = 0; ti < nTiers; ti++) {
      const first = ti === 0;
      const D_i = first ? p.D : p['tier' + (ti + 1) + 'D'];
      const stepH = first ? 0 : p['tier' + (ti + 1) + 'StepH'];
      const hF_i = first ? p.hF : prevHb + stepH;
      const hB_i = first ? p.hB : p['tier' + (ti + 1) + 'Hb'];
      const nRails_i = first ? Math.max(1, Math.round(p.nRails)) : Math.max(2, Math.round(p['tier' + (ti + 1) + 'Rails']));
      const rise_i = hB_i - hF_i;
      const alpha_i = Math.atan2(rise_i, D_i), ca_i = Math.cos(alpha_i), sa_i = Math.sin(alpha_i);
      const L_i = Math.hypot(D_i, rise_i);
      const label = first ? '' : tr('e.tierLabel', { n: ti + 1 });
      if (rise_i < 0) errors.push(tr('e.riseNeg', { label }));
      const aMin_i = p.edge, aMax_i = (D_i - p.edge - (h + tol) * sa_i) / ca_i;
      const railsLocal = [];
      if (nRails_i === 1) railsLocal.push((aMin_i + aMax_i) / 2);
      else for (let i = 0; i < nRails_i; i++) railsLocal.push(aMin_i + w / 2 + i * (aMax_i - aMin_i - w) / (nRails_i - 1));
      const pitch_i = nRails_i > 1 ? (aMax_i - aMin_i - w) / (nRails_i - 1) : L_i;
      const gap_i = pitch_i - w;
      if (nRails_i > 1 && gap_i < 2) errors.push(tr('e.railsOverlap', { label, gap: fx(gap_i, 1) }));
      else if (nRails_i > 1 && gap_i < 10) warnings.push(tr('e.gapNarrow', { label, gap: fx(gap_i, 1) }));
      if (!first && aMax_i - aMin_i < w) errors.push(tr('e.tierShallow', { n: ti + 1, rails: nRails_i, depth: fx(D_i) }));
      const tier = { idx: ti, y0, hF: hF_i, hB: hB_i, D: D_i, alpha: alpha_i, ca: ca_i, sa: sa_i, L: L_i, Lstart, gap: gap_i,
        railsLocal, railsGlobal: railsLocal.map(a => a + Lstart) };
      tiersArr.push(tier);
      y0 += D_i; Lstart += L_i; prevHb = hB_i;
    }
  }
  const Dtot = tiersArr.reduce((s, t) => s + t.D, 0);
  const hBlast = tiersArr[tiersArr.length - 1].hB;
  const tierOf = gA => { for (const t of tiersArr) if (gA <= t.Lstart + t.L + 1e-6) return t; return tiersArr[tiersArr.length - 1]; };
  const toYZ = (a, b) => { const t = tierOf(a), la = a - t.Lstart; return [t.y0 + la * t.ca - b * t.sa, t.hF + la * t.sa + b * t.ca]; };
  // Rückwärtskompatible Einzelwerte (Stufe 1 bzw. Gesamtboard) für Code, der noch von einer Neigung ausgeht
  const { alpha, ca, sa, L } = tiersArr[0];
  const rails = tiersArr.flatMap(t => t.railsGlobal);
  const gap = Math.min(...tiersArr.map(t => t.gap));
  const n = tiersArr[0].railsLocal.length;

  const frontLow = toYZ(rails[0] - w / 2 - tol, -h - tol)[1];
  if (frontLow < FLOOR_T + 1) {
    const need = p.hF + (FLOOR_T + 1 - frontLow);
    errors.push(tr('e.frontLow', { h: num(h), min: Math.ceil(need) }));
  }

  const wallEnd = p.capT - p.pocket;
  if (p.pocket < 6) errors.push(tr('e.pocketShallow'));
  if (wallEnd < scr.cbDepth + 3) errors.push(tr('e.capThin', { wall: num(wallEnd), min: num(scr.cbDepth + 3) }));
  if (p.capT > bz || p.supT > bz) errors.push(tr('e.capTall'));
  if (Math.min(p.capT, p.supT) < 16) errors.push(tr('e.capThinSup'));
  const interior = p.W - 2 * p.capT;
  if (interior < 60) errors.push(tr('e.narrow'));

  // --- Stützen / Schienensegmente
  const railX0 = p.capT - p.pocket + 0.5;
  const railLen = p.W - 2 * railX0;
  // Feldaufteilung: gleichmäßig, Netzteilfelder werden bei Bedarf verbreitert
  const psuCount = p.psu ? Math.max(1, Math.round(p.psuCount)) : 0;
  const psuNeed = p.psuL + 2 * p.psuWall + 6;
  const psuBaysOf = nb => {
    const c = Math.min(psuCount, nb);
    if (!c) return [];
    const start = p.psuBay >= 1 ? Math.max(0, Math.min(nb - c, Math.round(p.psuBay) - 1)) : Math.floor((nb - c) / 2);
    return Array.from({ length: c }, (_, i) => start + i);
  };
  const layout = nb => {
    const uni = interior / nb;
    const widths = Array(nb).fill(uni);
    const ks = psuBaysOf(nb);
    if (ks.length && nb > ks.length) {
      const need = k => Math.max(uni, psuNeed + (k === 0 || k === nb - 1 ? p.supT / 2 : p.supT));
      const total = ks.reduce((sum, k) => sum + need(k), 0);
      const rest = (interior - total) / (nb - ks.length);
      if (ks.some(k => need(k) > uni) && rest > p.supT + 20) { widths.fill(rest); ks.forEach(k => { widths[k] = need(k); }); }
    }
    const sup = [];
    let x = p.capT;
    for (let k = 0; k < nb - 1; k++) { x += widths[k]; sup.push(x); }
    return sup;
  };
  const segLens = sup => {
    const e = [railX0, ...sup.flatMap(c => [c - 0.25, c + 0.25]), p.W - railX0];
    const out = [];
    for (let k = 0; k < e.length; k += 2) out.push(e[k + 1] - e[k]);
    return out;
  };
  let nBays = Math.max(1, Math.ceil(interior / p.maxSpan), psuCount);
  let maxRail = null;
  if (!alu) {
    let lo = 0, hi = 2000;
    // Plattenmodus: kleinster Plattenstreifen = eine Rippe mit den halben Nachbarstegen
    const pw = plate && n > 1 ? Math.min(L, tiersArr[0].gap + w + 12) : w;
    if (!fitOnBed(1, pw, h, bx, by, bz).ok) { errors.push(tr(plate ? 'e.stripNoFit' : 'e.profileNoFit')); hi = 0; }
    while (hi - lo > 0.5) { const m = (lo + hi) / 2; if (fitOnBed(m, pw, h, bx, by, bz).ok) lo = m; else hi = m; }
    maxRail = lo;
  }
  // Rückwand wird nur hinter den Stützen geteilt: jedes Feld muss als ein Rückwandteil aufs Bett passen
  let backMax = null;
  if (p.back && fitOnBed(20, hBlast, p.backT, bx, by, bz).ok) {
    let lo = 0, hi = 3000;
    while (hi - lo > 0.5) { const m = (lo + hi) / 2; if (fitOnBed(m, hBlast, p.backT, bx, by, bz).ok) lo = m; else hi = m; }
    backMax = lo;
  }
  const backLens = sup => [0, ...sup, p.W].slice(1).map((x, i) => x - [0, ...sup][i]);
  while (nBays < 40 && ((maxRail !== null && Math.max(...segLens(layout(nBays))) > maxRail)
    || (backMax !== null && Math.max(...backLens(layout(nBays))) > backMax))) nBays++;
  const supports = layout(nBays);
  if (backMax !== null && psuCount && psuNeed + p.supT > backMax)
    errors.push(tr('e.backSplit', { need: fx(psuNeed + p.supT), max: fx(backMax) }));
  if (interior / nBays < p.supT + 20) errors.push(tr('e.fewSupports'));

  // Biegung: an jeder Stütze knickt das Board ab; die Vorderkante (dem Musiker zugewandt) bleibt dabei
  // praktisch auf einer Linie, die Hinterkante fächert nach hinten auf – konkav zum Musiker, wie ein
  // flacher Kreisbogen, der symmetrisch um die Board-Mitte liegt. Nur bei durchgehend gedruckten bzw.
  // Platten-Rippen möglich (Bauart B hat ein durchgehendes, starres Alu-Profil).
  // Grenzwinkel: Die Stütze wird zum Keil (Gehrung). Konkav (positiv) wird sie nach hinten dicker, die Taschen
  // laufen auseinander – bis 20° möglich. Konvex (negativ) wird sie nach hinten dünner; dann dürfen sich die
  // Taschen der beiden Felder bei der hintersten Schiene nicht berühren.
  let bendA = 0;
  if (p.bend && alu) warnings.push(tr('e.bendAlu'));
  if (p.bend && !alu && nTiers === 1) {
    const railYs = rails.map(a => toYZ(a, 0)[0]);
    const daMax = Math.max(0.01, ...railYs) + w / 2;
    const safeGap = Math.max(0, p.supT - 2 * p.pocket - 4);
    const maxNeg = Math.min(20, 2 * deg(Math.asin(Math.min(1, safeGap / (2 * daMax)))), 2 * deg(Math.atan((p.supT - 6) / (2 * p.D))));
    bendA = Math.max(-maxNeg, Math.min(20, p.bendAngle));
    if (p.bendAngle < -maxNeg - 0.05) warnings.push(tr('e.bendLimited', { max: fx(maxNeg, 1) }));
  }
  // Kette ab dem linken Rand aufbauen (Feld 0 = unverdreht), anschließend symmetrisch um die Board-Mitte
  // neu verankern – so öffnet sich der Bogen zu beiden Seiten gleich weit, statt einseitig aufzulaufen.
  const centerBay = supports.length / 2;
  const segT = [{ theta: 0, tx: 0, ty: 0 }];
  for (const c of supports) {
    const prev = segT[segT.length - 1];
    const [px, py] = bendXY(prev, c, 0);
    const theta = prev.theta - bendA;
    const c1 = Math.cos(rad(theta)), s1 = Math.sin(rad(theta));
    segT.push({ theta, tx: px - c * c1, ty: py - c * s1 });
  }
  if (bendA) {
    const ci = Math.round(centerBay), Tc = segT[ci];
    const cc = Math.cos(rad(-Tc.theta)), cs = Math.sin(rad(-Tc.theta));
    for (let i = 0; i < segT.length; i++) {
      const T = segT[i];
      const dx = T.tx - Tc.tx, dy = T.ty - Tc.ty;
      segT[i] = { theta: T.theta - Tc.theta, tx: dx * cc - dy * cs, ty: dx * cs + dy * cc };
    }
  }
  const G = { p, alu, plate, prof, w, h, tol, alpha, ca, sa, L, bx, by, bz, rails, gap, toYZ, tierOf, tiers: tiersArr,
    Dtot, hBlast, nTiers, scr, coreOffsets, slotOffsets, railX0, railLen, supports, nBays, maxRail, errors, warnings, bendA, segT };
  if (!alu) G.joint = deriveJoint(G);
  if (plate && p.plateT > h - 4) errors.push(tr('e.plateThick', { t: num(p.plateT), h: num(h) }));
  const psuTierIdx = Math.max(0, Math.min(tiersArr.length - 1, Math.round(p.psuTier) - 1));
  G.psuTier = tiersArr[psuTierIdx];
  G.psus = psuBaysOf(nBays).map(k => derivePsu(G, k, G.psuTier));
  if (psuCount > G.psus.length) errors.push(trn('e.psuCount', G.psus.length, { bays: nBays }));
  G.goodPsus = G.psus.filter(P => !P.bad);
  G.braces = [];                                   // folgt nach der Schnittplanung (generate)
  G.back = p.back ? deriveBack(G) : null;
  return G;
}

// --- Schwalbenschwanz der gedruckten Schienen in Endkappen und Stützen (Draufsicht, x–a-Ebene):
// Hals an der Stirnfläche (Breite wn), nach innen um dvAngle aufweitend; in der Stütze doppelt (Fliege).
function deriveJoint(G) {
  const { p, w, warnings } = G;
  const off = { on: false, wn: w, tanT: 0 };
  if (!p.dovetail) return off;
  const m = 4, tanT = Math.tan(rad(Math.min(20, Math.max(5, p.dvAngle))));
  const wn = w - 2 * m;
  if (wn < 10) {
    warnings.push(tr('e.dovetailNarrow'));
    return off;
  }
  return { on: true, m, tanT, wn };
}
// --- Biegung: an jeder Stütze um denselben Winkel geknickt (gleiche Richtung ⇒ Kreisbogen).
// Jedes Feld bekommt ein eigenes 2D-Transform (Drehung um Z + Verschiebung), das seine flach
// gerechnete (ungebogene) Geometrie an die richtige Stelle dreht. Angelpunkt je Stütze: ihre Mitte
// (lokal x = Stützenposition, y = D/2), damit sich das Board dort wie an einem Scharnier abknickt.
function bendXY(T, x, y) { const c = Math.cos(rad(T.theta)), s = Math.sin(rad(T.theta)); return [x * c - y * s + T.tx, x * s + y * c + T.ty]; }
function bendDir(T, x, y) { const c = Math.cos(rad(T.theta)), s = Math.sin(rad(T.theta)); return [x * c - y * s, x * s + y * c]; }
function bendPt(T, p3) { const [x, y] = bendXY(T, p3[0], p3[1]); return [x, y, p3[2]]; }
function bendVec(T, v3) { const [x, y] = bendDir(T, v3[0], v3[1]); return [x, y, v3[2]]; }
function bendMesh(T, m) { return T.theta ? m.rotate([0, 0, T.theta]).translate([T.tx, T.ty, 0]) : (T.tx || T.ty ? m.translate([T.tx, T.ty, 0]) : m); }
// Gebogene Stütze = Keil (Gehrung): Die Stütze selbst liegt auf der Winkelhalbierenden ihrer beiden Felder.
// Ihre linke Hälfte ist um +α/2, ihre rechte um −α/2 um den Drehpunkt an der Vorderkante (T/2, 0) gedreht –
// so steht jede Außenfläche samt Taschen, Schrauben und Bohrungen rechtwinklig zu den Schienen ihres Feldes.
function bendSide(G, T, m, right) {
  if (!G.bendA) return m;
  return m.translate([-T / 2, 0, 0]).rotate([0, 0, (right ? -1 : 1) * G.bendA / 2]).translate([T / 2, 0, 0]);
}
const bayIdxForX = (G, x) => G.supports.filter(c => c < x).length;
// Transform „drehe um (cx,cy) um den Winkel th“ (Standard: −Biegewinkel) in Welt-/Unrolled-Koordinaten
function localWedgeT(G, cx, cy, th = -G.bendA) {
  const c1 = Math.cos(rad(th)), s1 = Math.sin(rad(th));
  return { theta: th, tx: cx - (cx * c1 - cy * s1), ty: cy - (cx * s1 + cy * c1) };
}

// Halbe Breite des Zapfens im Abstand d von der Stirnfläche
const jHalf = (J, d) => J.wn / 2 + d * J.tanT;

// --- Netzteil-/Batteriebox: Lage, Befestigungspunkte, Kollisionen
function derivePsu(G, bayIdx, tier) {
  const { p, h, slotOffsets, supports, errors, alu, prof } = G;
  const rails = tier.railsGlobal;                      // Netzteil hängt nur an Schienen der eigenen Stufe
  const t = p.psuWall;
  const S = G.alu ? SCREW[prof.floorScrew] : SCREW.S4;
  const tp = Math.max(8, S.hh + 3.5);                  // Deckplatte, Schraubenkopf versenkt
  const cbDepth = S.hh + 0.5;

  const edgesX = [p.capT, ...supports.flatMap(c => [c - p.supT / 2, c + p.supT / 2]), p.W - p.capT];
  const bays = [];
  for (let k = 0; k < edgesX.length; k += 2) bays.push([edgesX[k], edgesX[k + 1]]);
  const xP = (bays[bayIdx][0] + bays[bayIdx][1]) / 2;
  const x0 = xP - p.psuL / 2 - 0.5, x1 = xP + p.psuL / 2 + 0.5;

  const bTop = -h, bIn = bTop - tp - 1 - p.psuH;        // bIn = Oberseite Boden

  // Befestigung: bevorzugt Schienen direkt über dem Netzteil, sonst die nächsten davor/dahinter
  const cand = [];
  rails.forEach((s, i) => slotOffsets.forEach(o => cand.push({ a: s + o, i })));
  const place = sP => {
    const aL = sP - p.psuW / 2 - 0.5, aR = sP + p.psuW / 2 + 0.5;
    let holes = cand.filter(c => c.a >= aL - t + 7 && c.a <= aR - 7);
    if (holes.length < 2) {
      const f = cand.filter(c => c.a < aL - t + 7).sort((x, y) => y.a - x.a)[0];
      const b = cand.filter(c => c.a > aR - 7).sort((x, y) => x.a - y.a)[0];
      for (const c of [f, b]) if (c && !holes.some(hh => hh.a === c.a)) holes.push(c);
    }
    holes.sort((x, y) => x.a - y.a);
    const pa0 = holes.length ? Math.min(aL - t, holes[0].a - 9) : aL - t;
    const pa1 = holes.length ? Math.max(aR, holes[holes.length - 1].a + 9) : aR;
    const yMax = Math.max(G.toYZ(aR, bIn - t)[0], G.toYZ(pa1, bTop)[0], G.toYZ(pa1, bTop - tp)[0]);
    return { sP, aL, aR, holes, pa0, pa1, yMax };
  };
  // Lage: die offene Rückseite endet psuGap vor der Rückwandebene der eigenen Stufe, auch ohne Rückwand
  const target = tier.y0 + tier.D - p.psuGap;
  let pl = place(tier.L - p.psuW / 2);
  for (let it = 0; it < 12; it++) pl = place(pl.sP + (target - pl.yMax) / tier.ca);
  for (let it = 0; it < 600 && pl.yMax > target + 0.01; it++) pl = place(pl.sP - 0.5);
  const { sP, aL, aR, holes, pa0, pa1 } = pl;

  const half = (x1 - x0) / 2;
  const isBox = p.psuType === 'box';
  const xPlate = isBox ? half - 0.25 : 26;
  const xBot = isBox ? half - 0.25 : 22;
  const screwXl = isBox && half > 60 ? [10, half - 16] : [10];
  const psu = { t, tp, cbDepth, S, xP, x0, x1, sP, aL, aR, bTop, bIn, holes, pa0, pa1, xPlate, xBot, screwXl,
    isBox, bay: bayIdx + 1, bays: bays.length, screwXs: [] };
  for (const xl of screwXl) psu.screwXs.push(x0 + xl, x1 - xl);

  if (holes.length < 2) {
    errors.push(tr('e.psuNoRails'));
    psu.bad = true; return psu;
  }
  const pts = [[aL - t, bIn - t], [aR, bIn - t], [pa0, bTop - tp], [pa1, bTop - tp]];
  const zMin = Math.min(...pts.map(([a, b]) => G.toYZ(a, b)[1]));
  if (zMin < 1) {
    errors.push(tr('e.psuTooHigh', { mm: fx(1 - zMin, 1) }));
    psu.bad = true;
  }
  if (pl.yMax > tier.y0 + tier.D + 0.01 || G.toYZ(pa0, bTop - tp)[0] < 1) {
    errors.push(tr('e.psuOverhang'));
    psu.bad = true;
  }
  const [b0, b1] = bays[bayIdx];
  if (x0 - t < b0 + 1 || x1 + t > b1 - 1) {
    errors.push(tr('e.psuNoFit', { need: fx(p.psuL + 2 * t + 1), bay: bayIdx + 1, free: fx(b1 - b0) }));
    psu.bad = true;
  }
  return psu;
}

// --- Streben: Flachstäbe entlang x, von unten in Seitenteile und Stützen eingesteckt
// gedruckt: braceW × braceH; Alu-Variante: handelsüblicher Flachstab 20×5 mit Senkkopfschrauben
const braceDims = G => G.alu ? { w: 20, h: 5, z0: 0 } : { w: G.p.braceW, h: G.p.braceH, z0: 0 };
const braceTop = G => { const d = braceDims(G); return d.z0 + d.h + G.tol; };
function deriveBraces(G, cuts) {
  const { p, h, tol, warnings } = G;
  const { w: bw, h: bh, z0 } = braceDims(G);
  const forb = [];
  const lo = bw / 2 + p.wall, hi = p.D - bw / 2 - p.wall;
  if (p.feet) for (const y of feetY(G)) forb.push([y - p.footD / 2 - bw / 2 - 2, y + p.footD / 2 + bw / 2 + 2]);
  // nur der Teil des Netzteilhalters, der tiefer als die Strebe reicht
  for (const P of G.goodPsus) {
    const prof = poly([[P.aL - P.t, P.bIn - P.t], [P.aR, P.bIn - P.t], [P.pa1, P.bTop], [P.pa0, P.bTop]].map(([a, b]) => G.toYZ(a, b)))
      .intersect(rect(-1000, -1000, 5000, z0 + bh + tol + 3));
    if (!prof.isEmpty()) { const bb = prof.bounds(); forb.push([bb.min[0] - bw / 2 - 3, bb.max[0] + bw / 2 + 3]); }
  }
  // Teilungsstellen mit Verbindungslasche freihalten
  for (const c of cuts) if (c.splice) forb.push([c.splice.y0 - bw / 2 - 2, c.splice.y1 + bw / 2 + 2]);
  // schräge Zugangsbohrungen der Stützen-Schrauben
  if (G.supports.length) for (const s of G.rails) for (const { a } of supportScrews(G)) {
    const [y0, zb] = G.toYZ(s + a, -h - tol - FLOOR_T);
    const t = G.sa / G.ca, r = G.scr.accessD / 2;
    forb.push([y0 + (zb - braceTop(G) - BRACE_PILOT - 2) * t - r - bw / 2 - 1, y0 + zb * t + r + bw / 2 + 1]);
  }
  const clearOK = y => { const b = -h - tol, a = (y + b * G.sa) / G.ca; return p.hF + a * G.sa + b * G.ca >= braceTop(G) + BRACE_PILOT + 4; };
  const valid = (y, placed) => y >= lo && y <= hi && clearOK(y) && !forb.some(([u, v]) => y > u && y < v)
    && placed.every(q => Math.abs(q - y) >= bw + 20);
  const want = p.braceCount >= 2 ? [p.D * 0.3, p.D * 0.75] : [p.D * 0.5];
  const out = [];
  for (const y0 of want) {
    let best = null;
    for (let d = 0; d < p.D && best === null; d += 1) for (const y of [y0 - d, y0 + d]) if (best === null && valid(y, out)) best = y;
    if (best === null) warnings.push(tr('e.braceNone'));
    else out.push(best);
  }
  return out.sort((u, v) => u - v).map(y => ({ y, w: bw, h: bh, z0 }));
}

// --- Rückwand: Platte an der Rückseite, Aussparungen hinter den Netzteilboxen
function deriveBack(G) {
  const { p, h, tol, errors } = G;
  const t = p.backT, hB = G.hBlast, lastCa = G.tiers[G.tiers.length - 1].ca;
  const sx = backScrewX(G);
  // Aussparung umfasst die ganze Stirnseite des Halters plus Rand, Ecken verrundet
  const cutouts = G.goodPsus.map(P => {
    const zb = G.toYZ(P.aR, P.bIn - P.t)[1], zt = G.toYZ(P.aR, P.bTop)[1];
    let x0 = P.x0 - P.t - 6, x1 = P.x1 + P.t + 6;
    for (const x of sx) { if (x < P.xP) x0 = Math.max(x0, x + 7); else x1 = Math.min(x1, x - 7); }
    const c = { x0, x1, z0: Math.max(4, zb - 6), z1: Math.min(hB - 6, zt + 4) };
    c.r = Math.max(1, Math.min(10, (c.z1 - c.z0) / 2 - 0.5, (c.x1 - c.x0) / 2 - 0.5));
    return c;
  }).filter(c => c.z1 - c.z0 > 8);
  const text = layoutText(G, cutouts, sx);
  const zLow = Math.max(8, hB * 0.2);
  const zHigh = hB - (h + tol) / lastCa - FLOOR_T - 6;
  const zs = zHigh - zLow >= 15 ? [zLow, zHigh] : [Math.max(6, (zLow + zHigh) / 2)];
  const depth = 10;                                                // Vorbohrung, Fenster halten Abstand
  if (!fitOnBed(20, hB, t, G.bx, G.by, G.bz).ok) { errors.push(tr('e.backNoFitH')); return null; }
  // Teilung ausschließlich hinter den Stützen (dort wird jedes Teil mit zwei Schraubenreihen befestigt)
  const seams = G.supports.map(x => ({ x, type: 'sup' }));
  const edges = [0, ...G.supports, p.W];
  for (let k = 0; k + 1 < edges.length; k++) {
    const wd = edges[k + 1] - edges[k];
    if (!fitOnBed(wd, hB, t, G.bx, G.by, G.bz).ok) { errors.push(tr('e.backPieceNoFit', { w: fx(wd) })); return null; }
  }
  seams.sort((u, v) => u.x - v.x);
  const tw = Math.min(14, hB * 0.22);
  const tails = (hB > 60 ? [hB * 0.3, hB * 0.7] : [hB * 0.5]).map(zc => ({ zc, tw, nw: tw * 0.6 }));
  return { t, cutouts, zs, depth, screwLen: pickScrewBelow(t + depth), seams, tails, dd: 8, text };
}

// Schriftzug auf der Außenseite der Rückwand: bis zu 3 Zeilen, im breitesten freien Bereich zentriert.
// Blick von hinten: Leserichtung läuft in -x, darum wird gespiegelt.
function layoutText(G, cutouts, sx) {
  const { p, warnings } = G;
  const lines = String(p.text || '').split('\n').map(l => l.trim()).slice(0, 3);
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  if (!lines.length) return null;
  const shaped = lines.map(l => (l ? (textShaper ? textShaper(l, p.textFont) : null) : { polys: [], x0: 0, x1: 0 }));
  if (shaped.some(x => !x)) { warnings.push(tr('e.fontMissing')); return null; }
  let free = [[4, p.W - 4]];
  for (const [u, v] of [...cutouts.map(c => [c.x0 - 6, c.x1 + 6]), ...sx.map(x => [x - 8, x + 8])]) {
    free = free.flatMap(([a, b]) => (v <= a || u >= b ? [[a, b]] : [[a, u], [v, b]].filter(([m, n]) => n - m > 1)));
  }
  if (!free.length) return null;
  free.sort((f1, f2) => (f2[1] - f2[0]) - (f1[1] - f1[0]) || Math.abs((f1[0] + f1[1]) / 2 - p.W / 2) - Math.abs((f2[0] + f2[1]) / 2 - p.W / 2));
  const [fa, fb] = free[0];
  const zLo = 6, zHi = G.hBlast - 6, lead = 1.45;
  const unitsH = 1 + (lines.length - 1) * lead + 0.3;               // inkl. Unterlängen
  const wUnits = Math.max(0.01, ...shaped.map(x => x.x1 - x.x0));
  const sz = Math.min(p.textSize, (fb - fa - 8) / wUnits, (zHi - zLo) / unitsH);
  if (sz < 4) { warnings.push(tr('e.textNoSpace')); return null; }
  if (sz < p.textSize - 0.05) warnings.push(tr('e.textShrunk', { h: fx(sz, 1) }));
  const cx = (fa + fb) / 2, zTop = (zLo + zHi) / 2 + sz * unitsH / 2;
  const polys = [];
  shaped.forEach((sh, i) => {
    const base = zTop - sz * (1 + i * lead), uc = (sh.x0 + sh.x1) / 2;
    for (const pg of sh.polys) polys.push(pg.map(([u, v]) => [cx - (u - uc) * sz, base + v * sz]));
  });
  return { polys, x0: cx - wUnits * sz / 2, x1: cx + wUnits * sz / 2, size: sz, lines };
}
const backScrewX = G => [G.p.capT / 2, G.p.W - G.p.capT / 2, ...G.supports.flatMap(c => [c - G.p.supT / 4, c + G.p.supT / 4])];

// ================================================================ Seitenteile (Endkappe / Stütze)
// Stufenaware Varianten: cs/y werden in einer WELT-Y-Position verortet, die passende Stufe wird gesucht.
const tierAtY = (G, y) => { for (const t of G.tiers) if (y <= t.y0 + t.D + 1e-6) return t; return G.tiers[G.tiers.length - 1]; };
function slopeCS(G, cs, tier = G.tiers[0]) { return cs.translate([-tier.Lstart, 0]).rotate(deg(tier.alpha)).translate([0, tier.hF]).translate([tier.y0, 0]); }
const topAtY = (G, y) => { const t = tierAtY(G, y); return t.hF + (y - t.y0) * Math.tan(t.alpha); };

// Teilungsstelle: Schwalbenschwänze (Ausrichtung) + Verbindungslasche mit Schrauben
function jointAt(G, c) {
  const { p } = G;
  const zlo = Math.max(p.wall, 5) + 2;
  const zhi = topAtY(G, c) - (G.h + G.tol) / tierAtY(G, c).ca - FLOOR_T - 4;
  const avail = zhi - zlo;
  const out = { c, dd: 0, tails: [], splice: null };
  if (avail < 12) return out;
  // große, hohe Schwalbenschwänze: bis 32 mm hoch, bei viel Platz zwei übereinander
  const tw = Math.min(32, avail * 0.75), nw = tw * 0.62;
  const count = avail > 2.4 * tw ? 2 : 1;
  for (let k = 0; k < count; k++) out.tails.push({ zc: zlo + avail * (k + 1) / (count + 1), tw, nw });
  out.dd = DD;
  if (avail >= 16) {
    const z0 = zlo, z1 = zlo + Math.min(avail, 46);
    const rows = z1 - z0 >= 30 ? [z0 + 9, z1 - 9] : [(z0 + z1) / 2];
    out.splice = { y0: c - 24, y1: c + DD + 24, z0, z1, rows, cols: [c - 13, c + DD + 13] };
  }
  return out;
}

// Teilungsschnitte planen, damit die Seitenteile aufs Bett passen
function planCuts(G, T) {
  const { p } = G;
  const candidates = [];
  for (let i = 0; i < G.rails.length - 1; i++) candidates.push(G.toYZ((G.rails[i] + G.rails[i + 1]) / 2, -G.h / 2)[0]);
  for (let k = 1; k <= 8; k++) {
    const cuts = [];
    for (let j = 1; j < k; j++) {
      const ideal = j * G.Dtot / k;
      let c = ideal, best = Infinity;
      for (const cand of candidates) if (Math.abs(cand - ideal) < best) { best = Math.abs(cand - ideal); c = cand; }
      if (best > G.Dtot / k / 3) c = ideal;
      if (cuts.length && c <= cuts[cuts.length - 1].c + 40) c = ideal;
      cuts.push(jointAt(G, c));
    }
    let ok = true;
    for (let i = 0; i < k && ok; i++) {
      const y0 = i === 0 ? 0 : cuts[i - 1].c;
      const y1 = i === k - 1 ? G.Dtot : cuts[i].c + cuts[i].dd;
      const zTop = i === k - 1 ? G.hBlast : topAtY(G, cuts[i].c);
      if (!fitOnBed(y1 - y0, zTop, T, G.bx, G.by, G.bz).ok) ok = false;
    }
    if (ok) return { cuts, ok: true };
  }
  return { cuts: [], ok: false };
}

// Umriss des Seitenteils (Endkappen/Stützen), von unten links im Uhrzeigersinn: Boden, Rückkante hoch,
// dann Stufe für Stufe die Neigung zurück nach vorne, an jedem Absatz senkrecht hinunter zur Vorstufe.
// Reduziert sich bei einer Stufe exakt auf das bisherige Trapez (Rückwärtskompatibilität).
function stairOutline(G) {
  const pts = [[0, 0], [G.Dtot, 0], [G.Dtot, G.hBlast]];
  for (let i = G.tiers.length - 1; i >= 0; i--) {
    const t = G.tiers[i];
    pts.push([t.y0, t.hF]);
    if (i > 0) pts.push([t.y0, G.tiers[i - 1].hB]);
  }
  return poly(pts);
}
function sideProfile(G, cuts) {
  const { p } = G;
  const outline = stairOutline(G);
  const body = outline.offset(-2, 'Round').offset(2, 'Round');
  if (!p.windows || G.nTiers > 1) return body;

  // Leichtbau-Fenster: überall innerhalb des Randabstands, außer um die Schienentaschen (Steg + Boden),
  // Strebentaschen, Gummifüße und Rückwand-Schrauben; Fachwerk-Rippen dazwischen
  const e = p.winEdge, wl = p.wall;
  let win = outline.offset(-e, 'Miter');
  const hold = G.rails.map(s0 => slopeCS(G, rect(s0 - G.w / 2 - G.tol - wl, -G.h - G.tol - FLOOR_T - wl, s0 + G.w / 2 + G.tol + wl, 80)));
  for (const b of G.braces) hold.push(rect(b.y - b.w / 2 - wl, -10, b.y + b.w / 2 + wl, braceTop(G) + BRACE_PILOT + 3));
  if (p.feet) for (const y of feetY(G)) hold.push(rect(y - p.footD / 2 - 3, -10, y + p.footD / 2 + 3, p.footH + wl));
  if (G.back) for (const z of G.back.zs) hold.push(rect(p.D - G.back.depth - 5, z - PILOT_R - 4, p.D + 10, z + PILOT_R + 4));
  win = win.subtract(csUnion(hold));
  if (win.isEmpty()) return body;
  // Pfosten unter jeder Schiene (dort wird die Last eingeleitet), breite Felder zusätzlich mit Diagonale
  const ribs = [];
  const posts = G.rails.map(s0 => G.toYZ(s0, -G.h - G.tol)[0]);
  for (const y of posts) ribs.push(rect(y - wl / 2, -10, y + wl / 2, 1000));
  const edgesY = [0, ...posts, p.D];
  for (let k = 0; k + 1 < edgesY.length; k++) {
    const ya = edgesY[k], yb = edgesY[k + 1], ym = (ya + yb) / 2, hm = topAtY(G, ym) - 2 * e;
    if (yb - ya > Math.max(55, 1.2 * hm)) {
      const th = deg(Math.atan2(yb - ya, hm));
      ribs.push(rect(-wl / 2, -1000, wl / 2, 1000).rotate(k % 2 ? th : -th).translate([ym, topAtY(G, ym) / 2]));
    }
  }
  for (const c of cuts) ribs.push(rect(c.c - 26 - wl, -1000, c.c + DD + 26 + wl, 1000));
  const r = csUnion(ribs);
  if (r) win = win.subtract(r);
  // Große, noch annähernd rechteckige Fenster (z. B. vorne vor der ersten Schiene) bekommen zusätzlich
  // eine Diagonalstrebe von unten hinten nach oben vorne – steift das Feld gegen Verschieben aus.
  const diag = [];
  for (const pc of win.decompose()) {
    const bb = pc.bounds(), bw = bb.max[0] - bb.min[0], bh = bb.max[1] - bb.min[1];
    if (bw < 30 || bh < 30 || pc.area() < 0.6 * bw * bh) continue;
    const th = -deg(Math.atan2(bh, bw));
    diag.push(rect(-2000, -wl / 2, 2000, wl / 2).rotate(th).translate([(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2]).intersect(pc.offset(1, 'Miter')));
  }
  const du = csUnion(diag);
  if (du) win = win.subtract(du);
  // Ecken der Aussparungen verrunden (Öffnen + Schließen), ohne die Sperrzonen selbst zu verändern:
  // die tragenden Stege um Schienen, Streben, Füße und Rückwandschrauben bleiben exakt in voller Breite stehen.
  const rr = Math.min(4, wl * 0.6);
  const keep = win.decompose()
    .filter(pc => pc.area() > 120)
    .map(pc => pc.offset(-rr, 'Round', 2, 32).offset(rr, 'Round', 2, 32).offset(rr, 'Round', 2, 32).offset(-rr, 'Round', 2, 32))
    .filter(pc => !pc.isEmpty());
  const wu = csUnion(keep);
  return wu ? body.subtract(wu) : body;
}

function notchCS(G) {
  const { w, h, tol } = G;
  return csUnion(G.rails.map(s => slopeCS(G, rect(s - w / 2 - tol, -h - tol, s + w / 2 + tol, 80), G.tierOf(s))));
}

// Schrauben der Verbindungslasche: Kopf in der Lasche (Innenseite x=T), Mutter außen (x=0)
function spliceBoltLen(T) { return pickScrewBelow(T - 2.6 - 0.8); }

function sideSolid(G, kind, profile2D, cuts) {
  const { p, h, tol, scr } = G;
  const T = kind === 'end' ? p.capT : p.supT;
  let body = ext(profile2D, 0, T);
  const isBentSup = kind === 'sup' && !!G.bendA;
  const sideOf = (m, right) => (isBentSup ? bendSide(G, T, m, right) : m);
  if (isBentSup) {
    // Keil: beide Stützen-Hälften je um den halben Winkel gegeneinander gedreht und vereinigt. Jede Hälfte
    // reicht dabei weit über die Mitte hinaus (sonst bliebe dort ein V-Spalt); begrenzt wird der Keil
    // durch die beiden gedrehten Außenflächen – dazwischen ist alles Vollmaterial.
    const E = T / 2 + 2 * p.D * Math.sin(rad(Math.abs(G.bendA) / 2)) + 2;
    const halfL = sideOf(ext(profile2D, -1, T / 2 + E), false);
    const halfR = sideOf(ext(profile2D, T / 2 - E, T + 1), true);
    // Die über die Mitte verlängerte Hälfte würde (konkav) hinten bzw. (konvex) vorne über die Fläche des
    // Nachbarfeldes hinausragen – dort auf die Hinter-/Vorderkante beider Felder begrenzen.
    const [ya, yb] = G.bendA > 0 ? [-5000, p.D] : [0, 5000];
    const clip = sideOf(box(0, 5000, ya, yb, -3000, 3000), false).intersect(sideOf(box(-5000, T, ya, yb, -3000, 3000), true));
    body = union([halfL, halfR]).intersect(clip);
  }
  const cut = [];
  if (G.alu) {
    const notches = notchCS(G);
    cut.push(kind === 'end' ? ext(notches, T - p.pocket, T + 1) : ext(notches, -1, T + 1));
  } else {
    // Schwalbenschwanz-Taschen (von oben offen): Draufsicht-Kontur entlang der Normalen extrudiert
    const J = G.joint;
    const shape = kind === 'end'
      ? poly([[T - p.pocket, -jHalf(J, p.pocket)], [T, -J.wn / 2], [T + 1, -J.wn / 2], [T + 1, J.wn / 2], [T, J.wn / 2], [T - p.pocket, jHalf(J, p.pocket)]])
      : poly([[-1, -J.wn / 2], [0, -J.wn / 2], [T / 2, -jHalf(J, T / 2)], [T, -J.wn / 2], [T + 1, -J.wn / 2],
        [T + 1, J.wn / 2], [T, J.wn / 2], [T / 2, jHalf(J, T / 2)], [0, J.wn / 2], [-1, J.wn / 2]]);
    const mk3D = cs => cs.offset(tol, 'Miter').extrude(h + tol + 80).translate([0, 0, -h - tol]);
    if (isBentSup) {
      const leftShape = poly([[p.pocket, -jHalf(J, p.pocket)], [0, -J.wn / 2], [-1, -J.wn / 2], [-1, J.wn / 2], [0, J.wn / 2], [p.pocket, jHalf(J, p.pocket)]]);
      const rightShape = poly([[T - p.pocket, -jHalf(J, p.pocket)], [T, -J.wn / 2], [T + 1, -J.wn / 2], [T + 1, J.wn / 2], [T, J.wn / 2], [T - p.pocket, jHalf(J, p.pocket)]]);
      const pocketL = mk3D(leftShape), pocketR = mk3D(rightShape);
      for (const s of G.rails) {
        const at = pk => pk.translate([0, s, 0]).rotate([deg(G.alpha), 0, 0]).translate([0, 0, p.hF]);
        cut.push(sideOf(at(pocketL), false), sideOf(at(pocketR), true));
      }
    } else {
      const pocket = mk3D(shape);
      // Jede Schienentasche wird um die Neigung IHRER EIGENEN Stufe gedreht (Mehrstufen-Boards).
      for (const s of G.rails) { const t = G.tierOf(s), la = s - t.Lstart;
        cut.push(pocket.translate([0, la, 0]).rotate([deg(t.alpha), 0, 0]).translate([0, t.y0, t.hF])); }
    }
  }

  if (kind === 'end') {
    for (const s of G.rails) for (const a of G.coreOffsets) {
      const [y, z] = G.toYZ(s + a, -h / 2);
      cut.push(ext(circle(y, z, scr.endS.clear / 2), -1, T - p.pocket + 1));
      cut.push(ext(circle(y, z, scr.cbD / 2), -1, scr.cbDepth));
    }
  } else {
    const cyl = (x, P, off, len, r, t) => M.Manifold.cylinder(len, r, r, 24)
      .rotate([deg(t.alpha), 0, 0])
      .translate([x, P[0] + off * t.sa, P[1] - off * t.ca]);
    for (const s of G.rails) for (const { x, a } of supportScrews(G)) {
      const t = G.tierOf(s);
      const P = G.toYZ(s + a, -h - tol);
      const bh = m => sideOf(m, x > T / 2);
      cut.push(bh(cyl(x, P, FLOOR_T + 2, FLOOR_T + 3, scr.floorS.clear / 2, t)));
      cut.push(bh(cyl(x, P, FLOOR_T + 400, 400, scr.accessD / 2, t)));
    }
  }
  // Streben: von unten offene Taschen, Vorbohrung für die Schraube von unten
  for (const b of G.braces) {
    if (kind === 'end') {
      cut.push(box(T - p.pocket, T + 1, b.y - b.w / 2 - tol, b.y + b.w / 2 + tol, -1, b.z0 + b.h + tol));
      cut.push(M.Manifold.cylinder(BRACE_PILOT + 0.5, PILOT_R, PILOT_R, 16).translate([T - p.pocket / 2, b.y, b.z0 + b.h + tol - 0.5]));
    } else {
      cut.push(sideOf(box(-1, T / 2, b.y - b.w / 2 - tol, b.y + b.w / 2 + tol, -1, b.z0 + b.h + tol), false));
      cut.push(sideOf(box(T / 2, T + 1, b.y - b.w / 2 - tol, b.y + b.w / 2 + tol, -1, b.z0 + b.h + tol), true));
      cut.push(sideOf(M.Manifold.cylinder(BRACE_PILOT + 0.5, PILOT_R, PILOT_R, 16).translate([T / 4, b.y, b.z0 + b.h + tol - 0.5]), false));
      cut.push(sideOf(M.Manifold.cylinder(BRACE_PILOT + 0.5, PILOT_R, PILOT_R, 16).translate([3 * T / 4, b.y, b.z0 + b.h + tol - 0.5]), true));
    }
  }
  // Rückwand: Vorbohrungen in der Hinterkante
  if (G.back) for (const x of kind === 'end' ? [T / 2] : [T / 4, 3 * T / 4]) for (const z of G.back.zs) {
    let m = M.Manifold.cylinder(G.back.depth + 1, PILOT_R, PILOT_R, 16).rotate([-90, 0, 0]).translate([x, G.Dtot - G.back.depth, z]);
    cut.push(kind === 'sup' ? sideOf(m, x > T / 2) : m);
  }
  if (p.feet) {
    const r = Math.min(p.footD / 2 + 0.3, T / 2 - 2);
    for (const y of feetY(G)) cut.push(M.Manifold.cylinder(p.footH + 1, r, r, 40).translate([T / 2, y, -1]));
  }
  // Verbindungslaschen: Tasche innen, Bohrungen, Mutternfallen außen
  const L = spliceBoltLen(T);
  // Die Verbindungslasche einer Stütze sitzt immer an deren Außenfläche (x = T), also auf der rechten
  // Keilhälfte (sd.wedge weiter unten). Beim Keil ist die Gegenseite weiter weg: Bohrung und Mutternfalle
  // reichen dann bis zur (schrägen) linken Außenfläche durch.
  const bhSplice = m => sideOf(m, true);
  const xOut = isBentSup ? -2 - p.D * Math.sin(rad(Math.abs(G.bendA))) : -1;
  for (const c of cuts) {
    if (!c.splice) continue;
    const sp = c.splice;
    cut.push(bhSplice(ext(rect(sp.y0 - tol, sp.z0 - tol, sp.y1 + tol, sp.z1 + tol), T - SPLICE_T - 0.2, T + 1)));
    for (const y of sp.cols) for (const z of sp.rows) {
      cut.push(bhSplice(ext(circle(y, z, SCREW.M4L.clear / 2, 20), xOut, T + 1)));
      const trap = T - 2.6 - L + NUT_M4.t + 0.3;
      cut.push(bhSplice(ext(hex(y, z, NUT_M4.af + 0.3), xOut, trap)));
    }
  }
  return minus(body, cut);
}
// Schraubpunkte in der Stütze (x lokal ab Stützen-Außenfläche, a quer zur Schiene)
const supportScrews = G => G.alu
  ? G.slotOffsets.map(a => ({ x: G.p.supT / 2, a }))
  : [{ x: G.p.supT / 4, a: 0 }, { x: 3 * G.p.supT / 4, a: 0 }];
const feetY = G => { const inset = Math.max(G.p.footD / 2 + 6, 15); return [inset, G.Dtot - inset]; };

function spliceSolid(G, sp) {
  const t2 = 0.2;
  const len = sp.y1 - sp.y0 - 2 * t2, hgt = sp.z1 - sp.z0 - 2 * t2;
  let m = M.Manifold.cube([len, hgt, SPLICE_T]);
  const cut = [];
  for (const y of sp.cols) for (const z of sp.rows) {
    const cx = y - sp.y0 - t2, cy = z - sp.z0 - t2;
    cut.push(M.Manifold.cylinder(SPLICE_T + 2, SCREW.M4L.clear / 2, SCREW.M4L.clear / 2, 20).translate([cx, cy, -1]));
    cut.push(M.Manifold.cylinder(3.6, SCREW.M4L.hd / 2 + 0.6, SCREW.M4L.hd / 2 + 0.6, 28).translate([cx, cy, SPLICE_T - 2.6]));
  }
  m = minus(m, cut);
  const r = 2;
  return m.intersect(M.CrossSection.square([len, hgt]).offset(-r, 'Round').offset(r, 'Round').extrude(SPLICE_T + 2).translate([0, 0, -1]));
}

function splitPieces(G, solid, T, cuts) {
  if (!cuts.length) return [solid];
  const t2 = G.tol / 2;
  const front = cuts.map(c => csUnion([rect(-1000, -1000, c.c, 1000), ...c.tails.map(t => poly([
    [c.c - 1, t.zc - t.nw / 2], [c.c + c.dd, t.zc - t.tw / 2], [c.c + c.dd, t.zc + t.tw / 2], [c.c - 1, t.zc + t.nw / 2]]))]));
  const pieces = [];
  for (let i = 0; i <= cuts.length; i++) {
    let region = i < cuts.length ? front[i].offset(-t2, 'Miter') : rect(-1000, -1000, 5000, 1000);
    if (i > 0) region = region.subtract(front[i - 1].offset(t2, 'Miter'));
    const pc = solid.intersect(ext(region, -1000, T + 1000));      // weit, damit auch ein Keil ganz erfasst wird
    if (!pc.isEmpty()) pieces.push(pc);
  }
  return pieces;
}

// ================================================================ Schienen
function aluSection(prof) {
  const { w, h, so, lip, si, sd } = prof;
  const slot = csUnion([rect(-so / 2, -0.01, so / 2, lip + 0.01),
    poly([[-si / 2, lip], [si / 2, lip], [so / 2 + 0.8, sd], [-so / 2 - 0.8, sd]])]);
  const cuts = [];
  for (const a of prof.wide) {
    cuts.push(slot.translate([a, -h]));
    cuts.push(slot.rotate(180).translate([a, 0]));
  }
  for (const b of prof.side) {
    cuts.push(slot.rotate(-90).translate([-w / 2, -h / 2 + b]));
    cuts.push(slot.rotate(90).translate([w / 2, -h / 2 + b]));
  }
  for (const a of prof.cores) cuts.push(circle(a, -h / 2, prof.core / 2, 20));
  return rect(-w / 2, -h, w / 2, 0).offset(-0.8, 'Round').offset(0.8, 'Round').subtract(csUnion(cuts));
}
function printedSection(G) {
  const { p, w, h } = G;
  const t = p.railWall;
  const webs = [rect(-w / 2, -h, -w / 2 + t, 0), rect(w / 2 - t, -h, w / 2, 0)];
  if (w >= 30) webs.push(rect(-t / 2, -h, t / 2, 0));
  return csUnion([rect(-w / 2, -t, w / 2, 0), ...webs]);
}

// Felder der gedruckten Schienen: Enden an Endkappe (cl/cr = null) oder Stütze (Stützenmitte)
function railBays(G) {
  const { p } = G, T = p.supT, t2 = G.tol / 2;
  const bays = [];
  const nb = G.supports.length + 1;
  for (let k = 0; k < nb; k++) {
    const cl = k === 0 ? null : G.supports[k - 1];
    const cr = k === nb - 1 ? null : G.supports[k];
    bays.push({
      idx: k, cl, cr,
      x0: cl === null ? p.capT - p.pocket + 0.5 : (G.bendA ? cl + T / 2 - p.pocket : cl + t2),
      x1: cr === null ? p.W - p.capT + p.pocket - 0.5 : (G.bendA ? cr - T / 2 + p.pocket : cr - t2),
      faceL: cl === null ? p.capT : cl + T / 2,
      faceR: cr === null ? p.W - p.capT : cr - T / 2,
    });
  }
  return bays;
}

// Gedrucktes Schienenstück, im globalen x gebaut und auf lokales x (ab x0) verschoben.
// Rahmen: x Länge, y = a quer, z = b Normale; Oberseite z = 0.
function printedRail(G, bay, bossesX) {
  const { p, h, w } = G, T = p.supT, J = G.joint;
  const { x0, x1, faceL, faceR, cl, cr } = bay;
  const u = printedSection(G);
  const full = rect(-w / 2, -h, w / 2, 0);
  const along = (cs, a0, a1) => cs.extrude(a1 - a0).translate([0, 0, a0]).rotate([90, 0, 90]);
  const vert = cs => cs.extrude(h).translate([0, 0, -h]);            // Draufsicht-Kontur (x,a) über die Höhe
  const parts = [along(u, faceL, faceR), along(full, faceL, faceL + 8), along(full, faceR - 8, faceR)];
  for (const xb of bossesX) parts.push(along(full, Math.max(faceL, xb - 8), Math.min(faceR, xb + 8)));
  // Enden: Schwalbenschwanz-Zapfen (Draufsicht), weitet sich zur Stirn hin auf
  {
    const d = faceL - x0;
    parts.push(vert(poly([[x0, -jHalf(J, d)], [faceL + 0.01, -J.wn / 2], [faceL + 0.01, J.wn / 2], [x0, jHalf(J, d)]])));
  }
  {
    const d = x1 - faceR;
    parts.push(vert(poly([[faceR - 0.01, -J.wn / 2], [x1, -jHalf(J, d)], [x1, jHalf(J, d)], [faceR - 0.01, J.wn / 2]])));
  }
  const seg = union(parts);
  const holes = [];
  const pilot = (x, a) => M.Manifold.cylinder(h - 2, PILOT_R, PILOT_R, 16).translate([x, a, -h - 1]);
  const dp = p.pocket + 6;
  if (cl === null) holes.push(M.Manifold.cylinder(dp + 1, PILOT_R, PILOT_R, 16).rotate([0, 90, 0]).translate([x0 - 1, 0, -h / 2]));
  else holes.push(pilot(cl + T / 4, 0));
  if (cr === null) holes.push(M.Manifold.cylinder(dp + 1, PILOT_R, PILOT_R, 16).rotate([0, 90, 0]).translate([x1 - dp, 0, -h / 2]));
  else holes.push(pilot(cr - T / 4, 0));
  for (const xb of bossesX) holes.push(pilot(xb, 0));
  return minus(seg, holes).translate([-x0, 0, 0]);
}

// ================================================================ Plattenmodus
// Die Platte besteht aus Streifen entlang x (je Feld); jeder Streifen trägt eine oder mehrere Rippen
// (= gedruckte Schienen mit Schwalbenschwanz-Zapfen). Zwischen den Rippen liegen Stege der Dicke plateT
// mit einer Reihe Kabelschlitze, versetzt wie bei Rockboard. Streifen greifen mit Puzzle-Schwalben ineinander.
const PLATE_DD = 9;
function plateStrips(G) {
  const { p, rails, w, h } = G, n = rails.length;
  const mid = i => (rails[i] + rails[i + 1]) / 2;
  const dd = Math.min(PLATE_DD, G.gap / 2 - 2);
  const bays = railBays(G);
  const len = Math.max(...bays.map(b => b.x1 - b.x0));
  for (let k = 1; k <= n; k++) {
    const strips = [];
    let i = 0;
    for (let g = 0; g < k; g++) {
      const cnt = Math.floor(n / k) + (g < n % k ? 1 : 0);
      const rs = Array.from({ length: cnt }, (_, q) => i + q);
      i += cnt;
      const f = rs[0], l = rs[rs.length - 1];
      const lo = f === 0 ? rails[0] - w / 2 : mid(f - 1);
      const hi = l === n - 1 ? rails[n - 1] + w / 2 : mid(l) + dd;
      strips.push({ rails: rs, lo, hi, seamLo: f > 0 ? mid(f - 1) : null, seamHi: l < n - 1 ? mid(l) : null, dd });
    }
    if (strips.every(st => fitOnBed(len, st.hi - st.lo, h, G.bx, G.by, G.bz).ok)) return strips;
  }
  return null;
}
// Schlitzreihe eines Stegs (Draufsicht x,a); versetzte Reihen je nach Steg-Nummer
// Rückgabe { slots, bridges }: slots sind die Kabelschlitze (für den Ausschnitt), bridges die vollen
// Stege dazwischen UND an beiden Streifenenden (für den Ausschnitt unverändert, zusätzlich als Grundlage
// für die verstärkenden Querstreben in plateStrip).
function slotRow(G, bay, webIdx, a0, a1) {
  const { p } = G, t2 = G.tol / 2;
  const sh = Math.min(p.slotH, a1 - a0 - 12);
  const fL = bay.faceL + t2 + 10, fR = bay.faceR - t2 - 10;
  if (sh < 8) return { slots: [], bridges: [{ x0: fL, x1: fR }] };
  const ac = (a0 + a1) / 2, r = Math.min(4, sh / 2 - 0.1);
  const bw = p.slotBridge;
  // Volle Stege auch an beiden Enden des Streifens (wie zwischen den Schlitzen), statt die Schlitze
  // bis an die Endkappe/Stütze bzw. den Nachbarstreifen laufen zu lassen – dort wirken beim Handling
  // und an der Verschraubung die größten Kräfte auf die Platte.
  const xa = fL + bw, xb = fR - bw, Lx = xb - xa;
  const slots = [];
  if (Lx < Math.max(20, sh)) return { slots, bridges: [{ x0: fL, x1: fR }] };
  const add = (u, v) => { if (v - u >= Math.max(20, sh)) slots.push({ x0: u, x1: v, a0: ac - sh / 2, a1: ac + sh / 2, r }); };
  const nS = Math.max(1, Math.round((Lx + bw) / (p.slotL + bw)));
  if (webIdx % 2 === 0) {
    const sl = (Lx - (nS - 1) * bw) / nS;
    for (let q = 0; q < nS; q++) add(xa + q * (sl + bw), xa + q * (sl + bw) + sl);
  } else {
    const sl = (Lx - nS * bw) / nS;                     // halbe Schlitze an den Enden
    let x = xa;
    for (let q = 0; q <= nS; q++) { const l = q === 0 || q === nS ? sl / 2 : sl; add(x, x + l); x += l + bw; }
  }
  const bridges = [];
  let prev = fL;
  for (const s of slots) { bridges.push({ x0: prev, x1: s.x0 }); prev = s.x1; }
  bridges.push({ x0: prev, x1: fR });
  return { slots, bridges };
}
const slotCS = sl => rect(sl.x0, sl.a0, sl.x1, sl.a1).offset(-sl.r, 'Round', 2, 32).offset(sl.r, 'Round', 2, 32);
// alle Schlitze (für Zeichnung): Stege zwischen Rippen, ohne die Stoßstege
function plateSlots(G) {
  const seams = new Set((G.plateStrips || []).filter(st => st.seamHi !== null).map(st => st.rails[st.rails.length - 1]));
  const out = [];
  for (const bay of railBays(G)) for (let i = 0; i + 1 < G.rails.length; i++) {
    if (seams.has(i)) continue;
    out.push(...slotRow(G, bay, i, G.rails[i] + G.w / 2, G.rails[i + 1] - G.w / 2).slots);
  }
  return out;
}
function plateStrip(G, bay, st, bosses) {
  const { p, rails, w, h } = G, t2 = G.tol / 2, pt = p.plateT;
  const xa = bay.faceL + t2, xb = bay.faceR - t2;
  const parts = st.rails.map((ri, q) => printedRail(G, bay, bosses[q]).translate([0, rails[ri], 0]));
  const webs = [], slots = [], ribs = [];
  // Verstärkungsstege: an denselben Stellen wie die Stege zwischen bzw. neben den Kabelschlitzen, aber
  // von Rippe zu Rippe durchgehend (statt nur in Schlitzhöhe) und tiefer als die Platte selbst – echte
  // Querstreben, die die Platte gegen Durchbiegen zwischen den Rippen versteifen.
  const ribH = Math.min(h - 2, Math.max(pt + 2, pt + 6));
  const tailXs = () => {
    const k = Math.max(1, Math.round((xb - xa - 50) / 70) + 1);
    return k === 1 ? [(xa + xb) / 2] : Array.from({ length: k }, (_, q) => xa + 25 + q * (xb - xa - 50) / (k - 1));
  };
  // Stoßlinie bei a = m: Schwalben ragen vom unteren Streifen in den oberen
  const lower = m => csUnion([rect(-1000, -1000, 5000, m), ...tailXs().map(x => poly([
    [x - 4.5, m - 1], [x + 4.5, m - 1], [x + 7, m + st.dd], [x - 7, m + st.dd]]))]);
  for (let q = 0; q + 1 < st.rails.length; q++) {
    const i = st.rails[q];
    const a0 = rails[i] + w / 2, a1 = rails[i + 1] - w / 2;
    webs.push(rect(xa, a0 - 0.5, xb, a1 + 0.5));
    const row = slotRow(G, bay, i, a0, a1);
    slots.push(...row.slots);
    for (const br of row.bridges) ribs.push(rect(br.x0, a0, br.x1, a1));
  }
  if (st.seamLo !== null) {
    const i = st.rails[0];
    webs.push(rect(xa, rails[i - 1] + w / 2, xb, rails[i] - w / 2 + 0.5).subtract(lower(st.seamLo).offset(t2, 'Miter')));
  }
  if (st.seamHi !== null) {
    const i = st.rails[st.rails.length - 1];
    webs.push(rect(xa, rails[i] + w / 2 - 0.5, xb, rails[i + 1] - w / 2).intersect(lower(st.seamHi).offset(-t2, 'Miter')));
  }
  let web = csUnion(webs);
  const sl = csUnion(slots.map(slotCS));
  if (web && sl) web = web.subtract(sl);
  if (web) parts.push(web.extrude(pt).translate([-bay.x0, 0, -pt]));
  const ribCS = csUnion(ribs);
  if (ribCS) parts.push(ribCS.extrude(ribH).translate([-bay.x0, 0, -ribH]));
  return union(parts);
}

// ================================================================ Netzteil-/Batteriebox
// Lokaler Rahmen: x ab linker Netzteil-Stirnseite nach innen, (a, b) Hangkoordinaten.
// Die Rückseite (+a) bleibt komplett offen für die Anschlüsse; das Netzteil wird von hinten eingeschoben.
// one = true: einteilige Box mit zwei Seitenwänden (Deckplatte, Boden und Vorderwand laufen durch).
function psuHolder(G, P, one = false) {
  const t = P.t, S = P.S;
  const L = P.x1 - P.x0;                                              // Innenlänge zwischen den Seitenwänden
  const xPlate = one ? L + t : P.xPlate, xBot = one ? L + t : P.xBot;
  const wallCS = poly([[P.aL - t, P.bIn - t], [P.aR, P.bIn - t], [P.pa1, P.bTop], [P.pa0, P.bTop]]);
  const wall = wallCS.extrude(t).rotate([90, 0, 90]).translate([-t, 0, 0]);
  const parts = [
    wall,
    box(-t, xPlate, P.pa0, P.pa1, P.bTop - P.tp, P.bTop),            // Deckplatte an den Schienen
    box(-t, xBot, P.aL - t, P.aR, P.bIn - t, P.bIn),                  // Boden
    box(-t, xBot, P.aL - t, P.aL, P.bIn - t, P.bTop - P.tp),          // Vorderwand
  ];
  if (one) parts.push(wall.translate([L + t, 0, 0]));
  let m = union(parts);
  const cut = [];
  const bLow = P.bIn - t - 1;
  for (const hole of P.holes) for (const xl of P.screwXl) for (const x of one ? [xl, L - xl] : [xl]) {
    cut.push(M.Manifold.cylinder(P.tp + 2, S.clear / 2, S.clear / 2, 20).translate([x, hole.a, P.bTop - P.tp - 1]));
    cut.push(M.Manifold.cylinder(P.cbDepth + 1, S.hd / 2 + 0.75, S.hd / 2 + 0.75, 28).translate([x, hole.a, P.bTop - P.tp - 1]));
    // Zugang von unten: Schraubendreher und Schraubenkopf passen durch Boden und (falls im Weg) Vorderwand
    cut.push(M.Manifold.cylinder(P.bTop - P.tp + 1 - bLow, S.hd / 2 + 0.75, S.hd / 2 + 0.75, 28).translate([x, hole.a, bLow]));
  }
  // Lüftungsschlitze im Boden (quer zur Druckrichtung schmal → brückenfrei)
  const xs = one ? [[10, P.xBot - 8], [L - P.xBot + 8, L - 10]] : [[10, P.xBot - 8]];   // einteilig: mittlerer Steg bleibt
  for (let av = P.aL + 10; av + 6 <= P.aR - 10; av += 13) {
    if (P.xBot - 10 > 16) for (const [x0, x1] of xs) cut.push(box(x0, x1, av, av + 6, P.bIn - t - 1, P.bIn + 1));
  }
  // Schlitze für Klett-/Kabelbinder, die das Netzteil hinten sichern
  cut.push(box(-t - 1, 0.01, P.aR - 16, P.aR - 11, P.bIn + 3, P.bIn + 11));
  if (one) cut.push(box(L - 0.01, L + t + 1, P.aR - 16, P.aR - 11, P.bIn + 3, P.bIn + 11));
  m = minus(m, cut);
  // Bricht der Zugang durch die Vorderwand, schließt eine dünnere Wand im Radius um die Bohrung die Lücke wieder
  const rB = S.hd / 2 + 0.75, tw = Math.min(1.2, t / 2), fill = [];
  for (const hole of P.holes) if (hole.a - rB < P.aL) for (const xl of P.screwXl) for (const x of one ? [xl, L - xl] : [xl]) {
    const ring = M.Manifold.cylinder(P.bTop - P.tp + 1 - bLow, rB + tw, rB + tw, 40).translate([x, hole.a, bLow])
      .subtract(M.Manifold.cylinder(P.bTop - P.tp + 3 - bLow, rB, rB, 40).translate([x, hole.a, bLow - 1]));
    fill.push(ring.intersect(box(-t, xBot, hole.a - rB - tw - 1, P.aL, P.bIn - t, P.bTop - P.tp)));   // auch außen an der Wand (halbes Rohr)
  }
  if (fill.length) m = union([m, ...fill]);
  return m;
}

// ================================================================ Streben und Rückwand
function braceSeg(G, bay, holesX, b) {
  let m = box(bay.x0, bay.x1, -b.w / 2, b.w / 2, 0, b.h);
  const cut = [];
  for (const x of holesX) {
    cut.push(M.Manifold.cylinder(b.h + 2, SCREW.S4.clear / 2, SCREW.S4.clear / 2, 20).translate([x, 0, -1]));
    cut.push(M.Manifold.cylinder(BRACE_CB + 1, SCREW.S4.hd / 2 + 0.75, SCREW.S4.hd / 2 + 0.75, 28).translate([x, 0, -1]));
  }
  m = minus(m, cut);
  return m.translate([-bay.x0, 0, 0]);
}
const braceHolesAlu = G => [G.p.capT - G.p.pocket / 2, G.p.W - G.p.capT + G.p.pocket / 2, ...G.supports.flatMap(c => [c - G.p.supT / 4, c + G.p.supT / 4])];
const braceHolesX = (G, bay) => {
  const { p } = G, T = p.supT;
  return [bay.cl === null ? p.capT - p.pocket / 2 : bay.cl + T / 4, bay.cr === null ? p.W - p.capT + p.pocket / 2 : bay.cr - T / 4];
};

// Rückwand als (x,z)-Platte; Rückgabe: Stücke als CrossSection
function backPieces(G) {
  const { p } = G, B = G.back;
  // An einer Biegestelle schwenkt die Rückwand des rechten Feldes zur Seite (die Rückwand liegt am
  // weitesten von der Stützenmitte entfernt); zusätzlicher Spalt an der Fuge, damit sich die Teile nicht schneiden.
  // (konkav/positiv laufen die Teile hinten auseinander; nur konvex/negativ laufen sie aufeinander zu)
  const t2 = G.bendA < 0 ? G.tol / 2 + p.D * Math.sin(rad(Math.abs(G.bendA))) + 2 : G.tol / 2;
  let cs = rect(0, 0, p.W, G.hBlast).offset(-1.5, 'Round').offset(1.5, 'Round');
  const holes = [];
  for (const c of B.cutouts) holes.push(rect(c.x0, c.z0, c.x1, c.z1).offset(-c.r, 'Round', 2, 64).offset(c.r, 'Round', 2, 64));
  for (const x of backScrewX(G)) for (const z of B.zs) holes.push(circle(x, z, SCREW.S4.clear / 2, 20));
  const hu = csUnion(holes);
  if (hu) cs = cs.subtract(hu);
  const front = B.seams.map(sm => sm.type === 'sup' ? rect(-1000, -1000, sm.x, 5000)
    : csUnion([rect(-1000, -1000, sm.x, 5000), ...B.tails.map(t => poly([
      [sm.x - 1, t.zc - t.nw / 2], [sm.x + B.dd, t.zc - t.tw / 2], [sm.x + B.dd, t.zc + t.tw / 2], [sm.x - 1, t.zc + t.nw / 2]]))]));
  const pieces = [];
  for (let i = 0; i <= front.length; i++) {
    let region = i < front.length ? front[i].offset(-t2, 'Miter') : rect(-1000, -1000, 10000, 5000);
    if (i > 0) region = region.subtract(front[i - 1].offset(t2, 'Miter'));
    const pc = cs.intersect(region);
    if (!pc.isEmpty()) pieces.push(pc);
  }
  return pieces;
}

// ================================================================ PedalClip
// Schnellhalter für ein Pedal: Grundplatte (Klett/Dual Lock oder Schrauben zum Pedal) + eingeschraubter
// Clip-Einsatz, der in eine Öffnung des Boards greift – bei A/B die Kabellücke zwischen zwei Schienen
// (hält unter der Schienen-Unterkante), bei C einen Kabelschlitz (hält unter dem Plattensteg).
// Der Einsatz ist ein 2D-Profil (a, b), entlang x extrudiert und liegend gedruckt: Federzungen und Querriegel
// biegen sich dadurch in der Schichtebene (belastbar), und nichts hängt über.
//   Federclip: zwei nach oben stehende Federzungen mit Rastnase unter der Kante; ohne Werkzeug abziehbar.
//   Bajonett: quadratischer Hals mit Querriegel; längs in die Öffnung stecken, Pedal um 90° drehen – der Riegel
//             greift unter beide Kanten, Rastnocken fallen in den Hohlraum der Schiene bzw. in die untere Nut.
export const CLIP_SIZES = {
  mini: { get label() { return tr('clipsize.mini'); }, w: 42, d: 94 },
  '1590a': { get label() { return tr('clipsize.1590a'); }, w: 39, d: 93 },
  '1590b': { get label() { return tr('clipsize.1590b'); }, w: 60, d: 112 },
  '125b': { get label() { return tr('clipsize.125b'); }, w: 66, d: 122 },
  boss: { get label() { return tr('clipsize.boss'); }, w: 73, d: 129 },
  '1590bb': { get label() { return tr('clipsize.1590bb'); }, w: 94, d: 120 },
  '1590dd': { get label() { return tr('clipsize.1590dd'); }, w: 188, d: 120 },
  custom: { get label() { return tr('clipsize.custom'); }, w: null, d: null },
};
export const CLIP_TYPES = { get spring() { return tr('cliptype.spring'); }, get bayonet() { return tr('cliptype.bayonet'); } };
const CLIP_PT = 5;          // Grundplatte
const CLIP_FT = 2.5;        // Flansch des Einsatzes in der Tasche der Grundplatte
const CLIP_SCREW = 12;      // Senkkopfschraube 4×12 (Grundplatte → Einsatz)

export function clipDims(c) {
  const s = CLIP_SIZES[c.size] || CLIP_SIZES['1590b'];
  const w = s.w ?? Math.max(30, Math.min(400, +c.w || 60)), d = s.d ?? Math.max(30, Math.min(400, +c.d || 112));
  return { w: w - 2, d: d - 2, label: s.w ? s.label : `${w}×${d} mm` };   // Platte 1 mm kleiner als das Gehäuse
}
// Öffnung, in die der Einsatz greift: Breite o (quer, a) und Materialdicke d darüber (Griffhöhe)
function clipSpec(G) {
  const { p } = G;
  if (G.nTiers > 1) return { err: tr('e.clipTiers') };
  if (G.rails.length < 2) return { err: tr('e.clipRails') };
  if (G.plate) {
    const sh = Math.min(p.slotH, G.gap - 12);
    return sh >= 8 ? { kind: 'slot', o: sh, d: p.plateT } : { err: tr('e.clipSlotNarrow') };
  }
  return { kind: 'gap', o: G.gap, d: G.h };
}
function clipProfile(G, S, type) {
  const { tol } = G;
  if (type === 'bayonet') {
    const s = Math.min(20, (S.o - 2 * tol - 0.6) / Math.SQRT2);       // Diagonale muss beim Drehen durch die Öffnung
    if (s < 8) return { err: tr('e.clipBayonetNarrow', { o: fx(S.o, 1) }) };
    const bR = -S.d - tol, cT = 5;
    let Lx, nub = null;
    if (S.kind === 'slot') Lx = Math.min(G.gap - 2, S.o + 20);
    else if (G.alu) {
      const pr = G.prof, mw = Math.max(...pr.wide.map(Math.abs));
      nub = { c: S.o / 2 + G.w / 2 - mw, w: pr.so - 1.6 };            // in die untere Nut
      Lx = 2 * (nub.c + nub.w / 2 + 4);
    } else {
      const t = G.p.railWall, nw = 2.2;
      nub = { c: S.o / 2 + t + tol + nw / 2 + 1.2, w: nw };            // in den Hohlraum des U-Profils
      const hollowEnd = S.o / 2 + (G.w >= 30 ? G.w / 2 - t / 2 : G.w - t);
      if (nub.c + nub.w / 2 > hollowEnd - 0.5) nub = null;
      Lx = 2 * ((nub ? nub.c + nub.w / 2 : S.o / 2 + t + 2) + 4);
    }
    const parts = [rect(-s / 2, bR - 0.01, s / 2, 0.01), rect(-Lx / 2, bR - cT, Lx / 2, bR), rect(-(s / 2 + 5), 0, s / 2 + 5, CLIP_FT)];
    if (nub) for (const sg of [-1, 1]) parts.push(poly([[nub.c - nub.w / 2 - 1, bR - 0.01], [nub.c + nub.w / 2 + 1, bR - 0.01], [nub.c + nub.w / 2, bR + 1 + tol], [nub.c - nub.w / 2, bR + 1 + tol]].map(([a, b]) => [sg * a, b])));
    let cs = csUnion(parts);
    cs = cs.offset(-0.4, 'Round').offset(0.4, 'Round');
    return { cs, len: s, sweep: Lx / 2, insertLen: Lx, fw: s + 10, screws: [0], bot: bR - cT, nub: !!nub, Lx };
  }
  // Federclip
  const armT = 2.4, slit = 1.8, ov = 1.4, armLen = 16, flT = 3;
  const Ao = S.o / 2 - tol;
  const C = Math.min(6, Ao - armT - slit);
  if (C < 3.5) return { err: tr('e.clipSpringNarrow', { o: fx(S.o, 1) }) };
  const bRet = -S.d - 0.2;
  const armTop = -S.d + Math.min(1.5, S.d - 0.8);
  const bFt = armTop - armLen, bBot = bFt - flT;
  const parts = [rect(-C, bBot, C, 0.01), rect(-Ao, bBot, Ao, bFt), rect(-(C + 5), 0, C + 5, CLIP_FT)];
  for (const sg of [-1, 1]) {
    parts.push(sg > 0 ? rect(Ao - armT, bFt - 0.01, Ao, armTop) : rect(-Ao, bFt - 0.01, -Ao + armT, armTop));
    parts.push(poly([[Ao - 0.01, bRet], [Ao + ov, bRet - ov], [Ao + ov, bRet - ov - 0.6], [Ao - 0.01, bRet - ov - 0.6 - 3 * ov]].map(([a, b]) => [sg * a, b])));
  }
  let cs = csUnion(parts);
  cs = cs.offset(-0.3, 'Round').offset(0.3, 'Round');
  const len = S.kind === 'slot' ? 26 : 30;
  return { cs, len, sweep: len / 2, insertLen: len, fw: 2 * C + 10, screws: [-len / 4, len / 4], bot: bBot };
}
function clipInsert(G, pr) {
  const m = ext(pr.cs, -pr.len / 2, pr.len / 2);
  return minus(m, pr.screws.map(x => M.Manifold.cylinder(11.5, PILOT_R, PILOT_R, 16).translate([x, 0, CLIP_FT - 11])));
}
// Grundplatte im Board-Rahmen (x längs, a quer, b = 0 Auflage); rot = Pedal quer
function clipPlate(G, pr, dims, rot) {
  const px = rot ? dims.d : dims.w, pa = rot ? dims.w : dims.d, tol = G.tol;
  let m = rect(-px / 2, -pa / 2, px / 2, pa / 2).offset(-5, 'Round', 2, 32).offset(5, 'Round', 2, 32).extrude(CLIP_PT);
  const cut = [box(-pr.len / 2 - tol, pr.len / 2 + tol, -pr.fw / 2 - tol, pr.fw / 2 + tol, -1, CLIP_FT + 0.2)];
  for (const x of pr.screws) {
    cut.push(M.Manifold.cylinder(CLIP_PT + 2, SCREW.S4K.clear / 2, SCREW.S4K.clear / 2, 20).translate([x, 0, -1]));
    cut.push(M.Manifold.cylinder(2.4, SCREW.S4K.clear / 2, SCREW.S4K.hd / 2 + 0.4, 28).translate([x, 0, CLIP_PT - 2.39]));
  }
  return { m: minus(m, cut), px, pa, ok: px >= pr.len + 8 && pa >= pr.fw + 8 };
}
// Alle möglichen Montagepositionen (je Öffnung ein oder mehrere x-Bereiche für die Clip-Mitte)
function clipSites(G, S, pr) {
  const out = [];
  const inAB = pr.cs.intersect(rect(-1000, -1000, 1000, 0));             // nur der Teil unter der Auflage
  const memo = new Map();
  const blocked = (cs, ac) => {
    const k = ac.toFixed(2);
    if (!memo.has(k)) memo.set(k, blockedAt(cs, ac));
    return memo.get(k);
  };
  const blockedAt = (cs, ac) => {
    const yz = cs.translate([ac, 0]).rotate(deg(G.alpha)).translate([0, G.p.hF]);
    if (yz.bounds().min[1] < 1) return true;                             // Boden
    return G.braces.some(b => !yz.intersect(rect(b.y - b.w / 2 - 1, b.z0 - 1, b.y + b.w / 2 + 1, b.z0 + b.h + 2)).isEmpty());
  };
  const psuHit = (bayIdx, ac) => G.goodPsus.filter(P => P.bay - 1 === bayIdx && !inAB.translate([ac, 0]).intersect(
    poly([[P.aL - P.t - 2, P.bIn - P.t - 2], [P.aR + 2, P.bIn - P.t - 2], [P.pa1 + 2, P.bTop + 1], [P.pa0 - 2, P.bTop + 1]])).isEmpty());
  const push = (bay, idx, ac, lo, hi, psus) => {
    let segs = [[lo, hi]];
    for (const P of psus) {
      const u = P.x0 - P.t - pr.sweep - 2, v = P.x1 + P.t + pr.sweep + 2;
      segs = segs.flatMap(([a, b]) => [[a, Math.min(b, u)], [Math.max(a, v), b]]).filter(([a, b]) => b - a > 0.5);
    }
    segs.forEach(([x0, x1], q) => out.push({ key: `${S.kind}${bay.idx}-${idx}`, seg: q, bay: bay.idx, idx, ac, x0, x1, o: S.o, kind: S.kind }));
  };
  const bays = railBays(G);
  if (S.kind === 'gap') {
    for (let i = 0; i + 1 < G.rails.length; i++) {
      const ac = (G.rails[i] + G.rails[i + 1]) / 2;
      if (blocked(inAB, ac)) continue;
      for (const bay of bays) push(bay, i, ac, bay.faceL + pr.sweep + 2, bay.faceR - pr.sweep - 2, psuHit(bay.idx, ac));
    }
  } else {
    const seams = new Set((G.plateStrips || []).filter(st => st.seamHi !== null).map(st => st.rails[st.rails.length - 1]));
    for (const bay of bays) {
      let q = 0;
      for (let i = 0; i + 1 < G.rails.length; i++) {
        if (seams.has(i)) continue;
        for (const sl of slotRow(G, bay, i, G.rails[i] + G.w / 2, G.rails[i + 1] - G.w / 2).slots) {
          const ac = (sl.a0 + sl.a1) / 2, idx = q++;
          if (blocked(inAB, ac)) continue;
          const half = pr.insertLen / 2 + sl.r + G.tol;
          push(bay, idx, ac, sl.x0 + half, sl.x1 - half, psuHit(bay.idx, ac));
        }
      }
    }
  }
  return out.filter(s => s.x1 >= s.x0);
}

// ================================================================ Meshes
function toMesh(m) {
  const mesh = m.getMesh();
  const np = mesh.numProp;
  let pos = mesh.vertProperties;
  if (np !== 3) {
    const nv = pos.length / np, out = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) { out[3 * i] = pos[np * i]; out[3 * i + 1] = pos[np * i + 1]; out[3 * i + 2] = pos[np * i + 2]; }
    pos = out;
  } else pos = new Float32Array(pos);
  return { positions: pos, indices: new Uint32Array(mesh.triVerts), step: stepNode(m) };
}

function printPart(G, m, name, qty, extra = {}, inlay = null) {
  const bb = inlay ? m.add(inlay).boundingBox() : m.boundingBox();
  const size = [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]];
  const fit = fitOnBed(size[0], size[1], size[2], G.bx, G.by, G.bz);
  const tf = x => { let r = x.translate([-(bb.min[0] + bb.max[0]) / 2, -(bb.min[1] + bb.max[1]) / 2, -bb.min[2]]); if (fit.ok && fit.angle > 0) r = r.rotate([0, 0, fit.angle]); return r; };
  const out = { name, qty, size, fit, volume: m.volume() / 1000, mesh: toMesh(tf(m)), ...extra };
  if (inlay) { out.inlay = toMesh(tf(inlay)); out.volume += inlay.volume() / 1000; }
  return out;
}

// ================================================================ Hauptfunktion
export function generate(params) {
  resetStepRecording();
  const p = { ...DEFAULTS, ...params };
  const G = derive(p);
  const result = { errors: G.errors, warnings: G.warnings, parts: [], assembly: [], hardware: [], bom: [], info: {}, drawing: null };
  const { h } = G;
  result.info = {
    angle: deg(G.alpha), slope: G.L, rails: G.rails.length, supports: G.supports.length,
    gap: G.gap, railLen: G.railLen, maxRail: G.maxRail, usable: [p.W - 2 * p.capT, G.L],
    bays: G.nBays, psuBays: G.psus.map(P => P.bay),
    bendAngle: G.bendA, bendTotal: G.bendA * G.supports.length,
    D: G.Dtot, hB: G.hBlast, tiers: G.nTiers,
  };
  if (G.errors.length) return result;

  const n = [0, -G.sa, G.ca];
  const hw = result.hardware;
  const Y = (a, b) => G.toYZ(a, b);
  try {
    // ---- Seitenteile
    const plan = planCuts(G, Math.max(p.capT, p.supT));
    if (!plan.ok) {
      G.errors.push(tr('e.sidesNoFit'));
      return result;
    }
    const cuts = plan.cuts;
    if (cuts.some(c => !c.splice)) G.warnings.push(tr('e.spliceLow'));
    G.braces = (p.brace && G.nTiers === 1) ? deriveBraces(G, cuts) : [];
    const prof2D = sideProfile(G, cuts);
    const endSolid = sideSolid(G, 'end', prof2D, cuts);
    const supSolid = G.supports.length ? sideSolid(G, 'sup', prof2D, cuts) : null;
    const endPieces = splitPieces(G, endSolid, p.capT, cuts);
    const supPieces = supSolid ? splitPieces(G, supSolid, p.supT, cuts) : [];
    const np = endPieces.length;
    const suffix = i => np > 1 ? tr('p.partOf', { i: i + 1, n: np }) : '';

    const Tn = G.segT.length - 1;                            // Index des letzten Feldes (rechte Endkappe)
    endPieces.forEach((pc, i) => {
      const flatL = pc.rotate([0, -90, 0]);
      result.parts.push(printPart(G, flatL, tr('p.capLeft') + suffix(i), 1, { group: 'side', short: tr('p.capLeft') }));
      result.parts.push(printPart(G, flatL.mirror([1, 0, 0]), tr('p.capRight') + suffix(i), 1, { group: 'side', short: tr('p.capRight') }));
      result.assembly.push({ mesh: toMesh(bendMesh(G.segT[0], pc)), role: 'printed', tag: 'side', explode: bendVec(G.segT[0], [-1, 0, 0]) });
      result.assembly.push({ mesh: toMesh(bendMesh(G.segT[Tn], pc.mirror([1, 0, 0]).translate([p.W, 0, 0]))), role: 'printed', tag: 'side', explode: bendVec(G.segT[Tn], [1, 0, 0]) });
    });
    supPieces.forEach((pc, i) => {
      // Keil: zum Drucken so zurückdrehen, dass die linke Außenfläche flach aufs Bett kommt
      const flat = G.bendA ? pc.translate([-p.supT / 2, 0, 0]).rotate([0, 0, -G.bendA / 2]).translate([p.supT / 2, 0, 0]) : pc;
      result.parts.push(printPart(G, flat.rotate([0, -90, 0]), tr('p.support') + suffix(i), G.supports.length, { group: 'side', short: tr('p.support') }));
      // Stütze sitzt auf der Winkelhalbierenden ihrer beiden Felder (Feld k um −α/2 um die Vorderkante gedreht)
      G.supports.forEach((c, k) => {
        const mid = m => bendMesh(G.segT[k], G.bendA ? bendMesh(localWedgeT(G, c, 0, -G.bendA / 2), m) : m);
        result.assembly.push({ mesh: toMesh(mid(pc.translate([c - p.supT / 2, 0, 0]))), role: 'printed', tag: 'side', explode: bendVec(G.segT[k], [0, 0, -0.4]) });
      });
    });

    // Instanzen der Seitenteile: x der Innenfläche (Laschenseite) und Richtung nach außen
    const sides = [
      { xIn: p.capT, out: -1, T: p.capT, ex: [-1, 0, 0], bay: 0 },
      { xIn: p.W - p.capT, out: 1, T: p.capT, ex: [1, 0, 0], bay: Tn },
      ...G.supports.map((c, k) => ({ xIn: c + p.supT / 2, out: -1, T: p.supT, ex: [0, 0, -0.4], bay: k, wedge: G.bendA ? localWedgeT(G, c, 0) : null })),
    ];
    // ---- Verbindungslaschen
    cuts.forEach((c, k) => {
      if (!c.splice) return;
      const sp = c.splice;
      const plate = spliceSolid(G, sp);
      result.parts.push(printPart(G, plate, tr('p.tab', { n: k + 1 }), sides.length, { group: 'side', short: tr('p.tab', { n: k + 1 }) }));
      for (const sd of sides) {
        const T2 = G.segT[sd.bay];
        const wm = m0 => (sd.wedge ? bendMesh(T2, bendMesh(sd.wedge, m0)) : bendMesh(T2, m0));
        const wp = v3 => (sd.wedge ? bendPt(T2, bendPt(sd.wedge, v3)) : bendPt(T2, v3));
        const wv = v3 => (sd.wedge ? bendVec(T2, bendVec(sd.wedge, v3)) : bendVec(T2, v3));
        // Lasche liegt in der Tasche an der Innenfläche, Senkungen zeigen nach innen
        let m = plate.translate([sp.y0 + 0.2, sp.z0 + 0.2, 0]).rotate([90, 0, 90]); // x=Dicke, y, z
        m = sd.out < 0 ? m.translate([sd.xIn - SPLICE_T, 0, 0]) : m.mirror([1, 0, 0]).translate([sd.xIn + SPLICE_T, 0, 0]);
        const ex = sd.ex.map((v, i) => v + (i === 0 ? -sd.out * 0.5 : 0));
        result.assembly.push({ mesh: toMesh(wm(m)), role: 'printed', tag: 'tab', explode: wv(ex) });
        const L = spliceBoltLen(sd.T);
        const dir3 = wv([sd.out, 0, 0]);
        for (const y of sp.cols) for (const z of sp.rows) {
          const seatX = sd.xIn + sd.out * 2.6;                   // Kopfauflage 2,6 mm unter der Innenfläche
          hw.push({ type: 'screw', s: 'M4L', len: L, p: wp([seatX, y, z]), dir: dir3, ex: wv(ex.map((v, i) => v - (i === 0 ? sd.out * 0.6 : 0))) });
          const nutX = seatX + sd.out * (L - NUT_M4.t / 2);
          hw.push({ type: 'nut', af: NUT_M4.af, t: NUT_M4.t, p: wp([nutX, y, z]), dir: dir3, ex: wv(sd.ex.map((v, i) => v + (i === 0 ? sd.out * 0.4 : 0))) });
        }
      }
    });

    // ---- Schrauben Endkappen → Schienen
    for (const [x, dir, ex, bay] of [[G.scr.cbDepth, 1, [-1.25, 0, 0], 0], [p.W - G.scr.cbDepth, -1, [1.25, 0, 0], Tn]]) {
      const grip = p.capT - p.pocket - G.scr.cbDepth;
      const len = G.alu ? pickScrew(grip + 8, grip + 16) : pickScrew(grip + 12);
      const T2 = G.segT[bay];
      for (const s of G.rails) for (const a of G.coreOffsets) {
        hw.push({ type: 'screw', s: G.alu ? G.prof.endScrew : 'S4', len, p: bendPt(T2, [x, ...Y(s + a, -h / 2)]), dir: bendVec(T2, [dir, 0, 0]), ex: bendVec(T2, ex) });
      }
    }
    // ---- Schrauben Stützen → Schienen (von unten), Nutensteine
    const floorLen = G.alu ? pickScrew(FLOOR_T + 4, FLOOR_T + 7) : pickScrew(FLOOR_T + 10, FLOOR_T + h - 3);
    G.supports.forEach((c, k) => { for (const s of G.rails) for (const { x: xs, a } of supportScrews(G)) {
      const x = c - p.supT / 2 + xs;
      const T2 = G.segT[xs > p.supT / 2 ? k + 1 : k];
      const nr = [0, -G.tierOf(s).sa, G.tierOf(s).ca];              // Bodennormale der Stufe dieser Schiene
      const seat = Y(s + a, -h - G.tol - FLOOR_T);
      hw.push({ type: 'screw', s: G.alu ? G.prof.floorScrew : 'S4', len: floorLen, p: bendPt(T2, [x, ...seat]), dir: bendVec(T2, nr), ex: bendVec(T2, [0, 0, -0.9]) });
      if (G.alu) hw.push({ type: 'tnut', ...G.prof.tnut, p: bendPt(T2, [x, ...Y(s + a, -h + G.prof.lip + G.prof.tnut.t / 2 + 0.3)]), dir: bendVec(T2, nr), along: bendVec(T2, [1, 0, 0]), ex: bendVec(T2, [0, nr[1] * 0.7, nr[2] * 0.7]) });
    } });

    // ---- Schienen (Platzierung stufenweise: jede Schiene wird um ihre eigene Stufe gedreht/verschoben)
    const place = (m, s, x0) => { const t = G.tierOf(s), la = s - t.Lstart; return m.translate([0, la, 0]).rotate([deg(t.alpha), 0, 0]).translate([x0, t.y0, t.hF]); };
    const railEx = n.map(v => v * 0.7);
    if (G.alu) {
      const sec = aluSection(G.prof);
      const bar = sec.extrude(G.railLen).rotate([90, 0, 90]);
      G.rails.forEach(s => result.assembly.push({ mesh: toMesh(place(bar, s, G.railX0)), role: 'alu', explode: railEx }));
    } else if (G.plate) {
      const bossOf = ri => G.goodPsus.filter(P => P.holes.some(hh => hh.i === ri)).flatMap(P => P.screwXs);
      const strips = plateStrips(G);
      if (!strips) { G.errors.push(tr('e.plateNoStrips')); return result; }
      const groups = new Map();
      railBays(G).forEach(bay => strips.forEach((st, j) => {
        const len = bay.x1 - bay.x0;
        const kind = `${bay.cl === null ? 'cap' : 'sup'}-${bay.cr === null ? 'cap' : 'sup'}`;
        const bosses = st.rails.map(ri => bossOf(ri).filter(x => x > bay.faceL + 12 && x < bay.faceR - 12));
        const key = [len.toFixed(1), kind, j, bosses.map(bs => bs.map(b => (b - bay.x0).toFixed(1)).join(',')).join(';')].join('|');
        if (!groups.has(key)) groups.set(key, { seg: plateStrip(G, bay, st, bosses), qty: 0, len, kind, j, bosses: bosses.some(bs => bs.length) });
        const g = groups.get(key);
        g.qty++;
        result.assembly.push({ mesh: toMesh(bendMesh(G.segT[bay.idx], place(g.seg, 0, bay.x0))), role: 'rail', explode: bendVec(G.segT[bay.idx], railEx) });
      }));
      for (const g of groups.values()) {
        const pos = tr({ 'cap-sup': 'p.pos.left', 'sup-sup': 'p.pos.mid', 'sup-cap': 'p.pos.right', 'cap-cap': 'p.pos.full' }[g.kind]);
        const nm = tr('p.strip', { pos, j: g.j + 1, n: strips.length, len: fx(g.len) }) + (g.bosses ? tr('p.withPsu') : '');
        const piece = printPart(G, g.seg.rotate([180, 0, 0]), nm, g.qty, { group: 'rail', short: tr('p.stripShort', { pos }) });
        if (!piece.fit.ok) G.errors.push(tr('e.stripNoFit2', { nm }));
        result.parts.push(piece);
      }
      G.plateStrips = strips;
    } else {
      const bossOf = ri => G.goodPsus.filter(P => P.holes.some(hh => hh.i === ri)).flatMap(P => P.screwXs);
      const groups = new Map();
      const bays = railBays(G);
      G.rails.forEach((s, ri) => bays.forEach(bay => {
        const len = bay.x1 - bay.x0;
        const kind = `${bay.cl === null ? 'cap' : 'sup'}-${bay.cr === null ? 'cap' : 'sup'}`;
        const bossesX = bossOf(ri).filter(x => x > bay.faceL + 12 && x < bay.faceR - 12);
        const key = [len.toFixed(1), kind, bossesX.map(b => (b - bay.x0).toFixed(1)).join(',')].join('|');
        const seg = groups.has(key) ? groups.get(key).seg : printedRail(G, bay, bossesX);
        result.assembly.push({ mesh: toMesh(bendMesh(G.segT[bay.idx], place(seg, s, bay.x0))), role: 'rail', explode: bendVec(G.segT[bay.idx], railEx) });
        if (groups.has(key)) groups.get(key).qty++;
        else groups.set(key, { seg, qty: 1, len, bosses: bossesX.length > 0, kind });
      }));
      let idx = 1;
      for (const g of groups.values()) {
        const pos = tr({ 'cap-sup': 'p.pos.left', 'sup-sup': 'p.pos.mid', 'sup-cap': 'p.pos.right', 'cap-cap': 'p.pos.full' }[g.kind]);
        const nm = tr('p.rail', { n: idx++, pos, len: fx(g.len) }) + (g.bosses ? tr('p.withPsu') : '');
        result.parts.push(printPart(G, g.seg.rotate([180, 0, 0]), nm, g.qty, { group: 'rail', short: tr('p.railShort') }));
      }
    }

    // ---- Netzteil-/Batteriebox (alle Felder nutzen denselben Halter)
    if (G.goodPsus.length) {
      const nP = G.goodPsus.length;
      const P0 = G.goodPsus[0];
      const label = tr(P0.isBox ? 'p.psuBox' : 'p.psuBracket');
      // einteilige Box: liegt auf einer Seitenwand, die andere Seitenwand überbrückt den Innenraum (Höhe psuH) ohne Stützen
      let one = null, holder1 = null;
      if (p.psuOne && P0.isBox) {
        if (p.psuH + 1 > PSU_BRIDGE_MAX) G.warnings.push(tr('e.psuOneBridge', { max: PSU_BRIDGE_MAX - 1 }));
        else {
          holder1 = psuHolder(G, P0, true);
          one = printPart(G, holder1.rotate([0, -90, 0]), label, nP, { group: 'psu', short: label });
          if (!one.fit.ok) { G.warnings.push(tr('e.psuOneBed', { size: one.size.map(v => fx(v)).join(' × ') })); one = null; }
        }
      }
      result.info.psuOne = !!one;
      const holder = one ? null : psuHolder(G, P0);
      if (one) result.parts.push(one);
      else {
        const flatL = holder.rotate([0, -90, 0]);
        result.parts.push(printPart(G, flatL, tr('p.sideLeft', { label }), nP, { group: 'psu', short: tr('p.sideLeft', { label }) }));
        result.parts.push(printPart(G, flatL.mirror([1, 0, 0]), tr('p.sideRight', { label }), nP, { group: 'psu', short: tr('p.sideRight', { label }) }));
      }
      const psuT = G.psuTier;
      const down = [0, psuT.sa, -psuT.ca], nPsu = [0, -psuT.sa, psuT.ca];
      // P.aL/P.aR/P.sP usw. sind globale a-Werte (inkl. Bogenlänge der vorherigen Stufen) – vor dem
      // Drehen um die eigene Stufe erst wieder auf lokale a-Werte zurückrechnen (wie place() für Schienen).
      const toAsm = m => m.translate([0, -psuT.Lstart, 0]).rotate([deg(psuT.alpha), 0, 0]).translate([0, psuT.y0, psuT.hF]);
      const hL = toAsm(one ? holder1 : holder), hR = one ? null : toAsm(holder.mirror([1, 0, 0]));
      for (const P of G.goodPsus) {
        const T2 = G.segT[P.bay - 1];
        result.assembly.push({ mesh: toMesh(bendMesh(T2, hL.translate([P.x0, 0, 0]))), role: 'printed', tag: 'psu', explode: bendVec(T2, down.map((v, i) => v + (i === 0 && !one ? -0.25 : 0))) });
        if (!one) result.assembly.push({ mesh: toMesh(bendMesh(T2, hR.translate([P.x1, 0, 0]))), role: 'printed', tag: 'psu', explode: bendVec(T2, down.map((v, i) => v + (i === 0 ? 0.25 : 0))) });
        const psuBox = box(P.x0 + 0.5, P.x1 - 0.5, P.sP - p.psuW / 2, P.sP + p.psuW / 2, P.bIn + 0.5, P.bIn + 0.5 + p.psuH);
        result.assembly.push({ mesh: toMesh(bendMesh(T2, toAsm(psuBox))), role: 'psu', explode: bendVec(T2, [0, 1.4, 0]) });
        const len = G.alu ? pickScrew(P.tp - P.cbDepth + 4, P.tp - P.cbDepth + 7) : pickScrew(P.tp - P.cbDepth + 8, P.tp - P.cbDepth + h - 3);
        for (const hole of P.holes) for (const xl of P.screwXl) for (const side of [-1, 1]) {
          const x = side < 0 ? P.x0 + xl : P.x1 - xl;
          const ex = down.map((v, i) => v * 1.15 + (i === 0 ? side * 0.25 : 0));
          hw.push({ type: 'screw', psu: true, s: G.alu ? G.prof.floorScrew : 'S4', len, p: bendPt(T2, [x, ...Y(hole.a, P.bTop - P.tp + P.cbDepth)]), dir: bendVec(T2, nPsu), ex: bendVec(T2, ex) });
          if (G.alu) hw.push({ type: 'tnut', ...G.prof.tnut, p: bendPt(T2, [x, ...Y(hole.a, -h + G.prof.lip + G.prof.tnut.t / 2 + 0.3)]), dir: bendVec(T2, nPsu), along: bendVec(T2, [1, 0, 0]), ex: bendVec(T2, railEx) });
        }
      }
    }

    // ---- Streben (von unten in Endkappen und Stützen, von unten verschraubt)
    if (G.braces.length && G.alu) {
      const hx = braceHolesAlu(G);
      const len = pickScrew(5 + BRACE_PILOT - 2 - ALU_BRACE_SINK);
      const sk = SCREW.S4K, rHead = sk.hd / 2 + 0.2, zHead = b0 => b0 + ALU_BRACE_SINK;
      for (const b of G.braces) {
        let bar = box(G.railX0, p.W - G.railX0, b.y - b.w / 2, b.y + b.w / 2, b.z0, b.z0 + b.h);
        // Senkung passend zum Senkkopf: Kopf liegt ALU_BRACE_SINK mm tiefer als die Unterseite der Strebe
        const cuts = hx.flatMap(x => [
          M.Manifold.cylinder(b.h + 2, sk.clear / 2, sk.clear / 2, 16).translate([x, b.y, b.z0 - 1]),
          M.Manifold.cylinder(ALU_BRACE_SINK + 1, rHead, rHead, 28).translate([x, b.y, b.z0 - 1]),
          M.Manifold.cylinder(sk.hh, rHead, sk.clear / 2 - 0.05, 28).translate([x, b.y, zHead(b.z0)]),
        ]);
        bar = minus(bar, cuts);
        result.assembly.push({ mesh: toMesh(bar), role: 'alu', explode: [0, 0, -1.2] });
        for (const x of hx) hw.push({ type: 'screw', s: 'S4K', len, drawLen: len - sk.hh, p: [x, b.y, b.z0 + ALU_BRACE_SINK + sk.hh], dir: [0, 0, 1], ex: [0, 0, -1.9] });
      }
    } else if (G.braces.length) {
      const groups = new Map();
      const braceLen = pickScrew(p.braceH - BRACE_CB + 7, p.braceH - BRACE_CB + BRACE_PILOT + 2);
      for (const b of G.braces) for (const bay of railBays(G)) {
        const hx = braceHolesX(G, bay);
        const len = bay.x1 - bay.x0;
        const kind = `${bay.cl === null ? 'cap' : 'sup'}-${bay.cr === null ? 'cap' : 'sup'}`;
        const key = `${len.toFixed(1)}|${kind}`;
        if (!groups.has(key)) groups.set(key, { seg: braceSeg(G, bay, hx, b), qty: 0, len, kind });
        const g = groups.get(key);
        g.qty++;
        const T2 = G.segT[bay.idx];
        result.assembly.push({ mesh: toMesh(bendMesh(T2, g.seg.translate([bay.x0, b.y, 0]))), role: 'brace', explode: bendVec(T2, [0, 0, -1.2]) });
        for (const x of hx) hw.push({ type: 'screw', s: 'S4', len: braceLen, p: bendPt(T2, [x, b.y, BRACE_CB]), dir: bendVec(T2, [0, 0, 1]), ex: bendVec(T2, [0, 0, -1.9]) });
      }
      let idx = 1;
      for (const g of groups.values()) {
        const pos = tr({ 'cap-sup': 'p.pos.left', 'sup-sup': 'p.pos.mid', 'sup-cap': 'p.pos.right', 'cap-cap': 'p.pos.full' }[g.kind]);
        const piece = printPart(G, g.seg, tr('p.brace', { n: idx++, pos, len: fx(g.len) }), g.qty, { group: 'brace', short: tr('p.braceShort') });
        if (!piece.fit.ok) G.errors.push(tr('e.braceNoFit', { len: fx(g.len) }));
        result.parts.push(piece);
      }
    }

    // ---- Rückwand
    if (G.back) {
      const B = G.back;
      const pieces = backPieces(G);
      // Schrift auf der Außenseite (Extrusions-z = 0); versenkt: Außenseite liegt beim Druck unten,
      // erhaben: Platte wird gewendet, die Buchstaben zeigen nach oben
      const textCS = B.text && B.text.polys.length ? M.CrossSection.ofPolygons(B.text.polys, 'NonZero') : null;
      const emb = p.textMode === 'emboss';
      const dT = emb ? p.textDepth : Math.min(p.textDepth, B.t - 1.2);
      pieces.forEach((pc, i) => {
        let plate = pc.extrude(B.t);                                     // x, z, Dicke (0 = außen)
        let inlay = null;
        const tc = textCS ? textCS.intersect(pc) : null;
        const hasText = tc && !tc.isEmpty() && dT > 0.2;
        if (hasText) {
          if (emb) {
            const raised = tc.extrude(dT).translate([0, 0, -dT]);
            if (p.textHi) inlay = raised; else plate = plate.add(raised);
          } else {
            plate = plate.subtract(tc.extrude(dT + 0.01).translate([0, 0, -0.01]));
            if (p.textHi) inlay = tc.extrude(dT);
          }
        }
        const toPrint = m => (hasText && emb ? m.rotate([180, 0, 0]) : m);
        const nm = tr('p.back') + (pieces.length > 1 ? tr('p.partOf', { i: i + 1, n: pieces.length }) : '') + (hasText ? tr('p.withText') : '');
        result.parts.push(printPart(G, toPrint(plate), nm, 1, { group: 'back', short: tr('p.back') }, inlay ? toPrint(inlay) : null));
        const T2 = G.segT[i];
        const toAsm = m => bendMesh(T2, m.rotate([90, 0, 0]).translate([0, G.Dtot + B.t, 0]));
        result.assembly.push({ mesh: toMesh(toAsm(plate)), role: 'panel', explode: bendVec(T2, [0, 1.1, 0]) });
        if (inlay) result.assembly.push({ mesh: toMesh(toAsm(inlay)), role: 'text', explode: bendVec(T2, [0, 1.1, 0]) });
      });
      if (textCS && emb === false && p.textDepth > B.t - 1.2) G.warnings.push(tr('e.engraveLimited', { d: fx(dT, 1) }));
      for (const x of backScrewX(G)) for (const z of B.zs) {
        const T2 = G.segT[bayIdxForX(G, x)];
        hw.push({ type: 'screw', s: 'S4', len: B.screwLen, p: bendPt(T2, [x, G.Dtot + B.t, z]), dir: bendVec(T2, [0, -1, 0]), ex: bendVec(T2, [0, 1.7, 0]) });
      }
    }

    // ---- PedalClips: mögliche Positionen (für die Auswahl in der Oberfläche), Platzierung, Druckteile
    const clips = Array.isArray(p.clips) ? p.clips : [];
    const S = clipSpec(G);
    const prs = {};
    result.clipSites = { spring: [], bayonet: [] };
    result.clipPlaced = [];
    if (S.err) { if (clips.length) G.warnings.push(S.err); }
    else for (const type of Object.keys(CLIP_TYPES)) {
      const pr = prs[type] = clipProfile(G, S, type);
      if (pr.err) continue;
      result.clipSites[type] = clipSites(G, S, pr).map(s => {
        const T2 = G.segT[s.bay], e = pr.sweep;
        const quad = [[s.x0 - e, s.ac - s.o / 2], [s.x1 + e, s.ac - s.o / 2], [s.x1 + e, s.ac + s.o / 2], [s.x0 - e, s.ac + s.o / 2]]
          .map(([x, a]) => bendPt(T2, [x, ...Y(a, 0.6)]));
        return { ...s, origin: bendPt(T2, [0, ...Y(s.ac, 0.6)]), dir: bendVec(T2, [1, 0, 0]), quad };
      });
    }
    result.info.clipOpening = S.err ? null : { kind: S.kind, o: S.o, d: S.d, err: { spring: prs.spring && prs.spring.err, bayonet: prs.bayonet && prs.bayonet.err } };
    const insG = new Map(), plG = new Map(), foot = [];
    const bays = railBays(G);
    let parkX = p.capT;
    clips.forEach((c, i) => {
      const nm = tr('p.clip', { n: i + 1 });
      const type = CLIP_TYPES[c.type] ? c.type : 'spring';
      const pr = prs[type];
      result.clipPlaced[i] = null;
      if (!pr) return;
      if (pr.err) { G.warnings.push(`${nm}: ${pr.err}`); return; }
      const dims = clipDims(c);
      const pl = clipPlate(G, pr, dims, !!c.rot);
      if (!pl.ok) G.warnings.push(tr('e.clipBaseSmall', { nm }));
      const ins = insG.get(type) || { m: clipInsert(G, pr), qty: 0 };
      ins.qty++; insG.set(type, ins);
      const pk = `${type}|${pl.px.toFixed(1)}|${pl.pa.toFixed(1)}|${c.rot ? 1 : 0}`;
      const pg = plG.get(pk) || { m: pl.m, qty: 0, name: tr('p.clipBase', { size: dims.label, rot: c.rot ? tr('p.rotated') : '' }) + ` · ${CLIP_TYPES[type]}`, short: tr('p.clipBase', { size: dims.label, rot: c.rot ? tr('p.rotated') : '' }).replace(/ \(.*\)$/, '') };
      pg.qty++; plG.set(pk, pg);

      // gespeicherte Position auflösen (bei geänderten Maßen auf den nächsten gültigen Punkt schieben)
      let site = null, x = 0;
      if (c.at && c.at.site) {
        const cand = result.clipSites[type].filter(s => s.key === c.at.site);
        let bd = Infinity;
        for (const s of cand) { const cx = Math.max(s.x0, Math.min(s.x1, +c.at.x || 0)); const d = Math.abs(cx - (+c.at.x || 0)); if (d < bd) { bd = d; site = s; x = cx; } }
        if (!site) G.warnings.push(tr('e.clipPosGone', { nm }));
        else if (bd > 1) G.warnings.push(tr('e.clipMoved', { nm, d: fx(bd) }));
      }
      if (site) {
        const T2 = G.segT[site.bay];
        const at = m => bendMesh(T2, place(m, site.ac, x));
        result.clipPlaced[i] = { key: site.key, x, bay: site.bay };
        result.assembly.push({ mesh: toMesh(at(pl.m)), role: 'clip', clip: i, explode: bendVec(T2, n.map(v => v * 1.6)) });
        result.assembly.push({ mesh: toMesh(at(ins.m)), role: 'clip', clip: i, explode: bendVec(T2, n.map(v => v * 1.1)) });
        for (const xs of pr.screws) hw.push({ type: 'screw', s: 'S4K', len: CLIP_SCREW, p: bendPt(T2, [x + xs, ...Y(site.ac, CLIP_PT - 2.3)]), dir: bendVec(T2, n.map(v => -v)), ex: bendVec(T2, n.map(v => v * 2.1)) });
        foot.push({ i, bay: site.bay, x0: x - pl.px / 2, x1: x + pl.px / 2, a0: site.ac - pl.pa / 2, a1: site.ac + pl.pa / 2 });
        if (site.ac - pl.pa / 2 < -1 || site.ac + pl.pa / 2 > G.L + 1) G.warnings.push(tr('e.clipOverhang', { nm }));
        const bay = bays[site.bay];
        if (G.bendA && ((bay.cl !== null && x - pl.px / 2 < bay.cl) || (bay.cr !== null && x + pl.px / 2 > bay.cr)))
          G.warnings.push(tr('e.clipKink', { nm }));
      } else {
        // noch nicht platziert: vor dem Board abgelegt
        const cx = parkX + pl.px / 2, cy = -40 - pl.pa / 2;
        parkX += pl.px + 20;
        const at = m => m.translate([cx, cy, -pr.bot]);
        result.assembly.push({ mesh: toMesh(at(pl.m)), role: 'clip', clip: i, explode: [0, -1, 0.6] });
        result.assembly.push({ mesh: toMesh(at(ins.m)), role: 'clip', clip: i, explode: [0, -1, 0.3] });
        for (const xs of pr.screws) hw.push({ type: 'screw', s: 'S4K', len: CLIP_SCREW, p: [cx + xs, cy, -pr.bot + CLIP_PT - 2.3], dir: [0, 0, -1], ex: [0, -1, 1] });
      }
    });
    for (let u = 0; u < foot.length; u++) for (let v = u + 1; v < foot.length; v++) {
      const A = foot[u], B = foot[v];
      if (G.bendA && A.bay !== B.bay) continue;
      if (Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0) > 0.05 && Math.min(A.a1, B.a1) - Math.max(A.a0, B.a0) > 0.05)
        G.warnings.push(tr('e.clipOverlap', { a: A.i + 1, b: B.i + 1 }));
    }
    for (const [type, g] of insG) result.parts.push(printPart(G, g.m.rotate([0, 90, 0]), tr('p.clipInsert', { type: CLIP_TYPES[type] }), g.qty, { group: 'clip', short: tr('p.clipInsert', { type: CLIP_TYPES[type] }) }));
    for (const g of plG.values()) result.parts.push(printPart(G, g.m.rotate([180, 0, 0]), g.name, g.qty, { group: 'clip', short: g.short }));
    G.clipCount = clips.length;

    result.bom = buildBom(G, np, cuts, hw);
    result.info.pieces = np;
    result.info.cuts = cuts.map(c => c.c);
    result.drawing = drawingData(G, prof2D, cuts);
    if (G.bendA) result.drawing.bent = bentViews(result.assembly);
  } catch (e) {
    console.error(e);
    G.errors.push(tr('e.geomError', { msg: e.message }));
  } finally {
    result.stepGraph = stepGraph();
    collect();
  }
  return result;
}

// ================================================================ Daten für die technische Zeichnung
// Gebogenes Board: Schattenriss jedes Bauteils in Draufsicht (x, y), Vorderansicht (x, z) und Seitenansicht von links (y, z)
function bentViews(assembly) {
  const out = [];
  for (const a of assembly) {
    if (!['rail', 'alu', 'printed', 'brace', 'panel', 'psu'].includes(a.role)) continue;
    const m = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: a.mesh.positions, triVerts: a.mesh.indices }));
    const bb = m.boundingBox();
    const shadow = cs => polysOf(cs.simplify(0.1));
    out.push({
      role: a.role, tag: a.tag || '', box: [...bb.min, ...bb.max],
      top: shadow(m.project()),
      front: shadow(m.rotate([-90, 0, 0]).project()),
      side: shadow(m.rotate([0, 90, 0]).project()).map(pg => pg.map(([u, v]) => [v, u])),
    });
  }
  return out;
}

// Schnitt durch die Platte (Bauart C) quer zu den Rippen, in Hangkoordinaten (a, b): Rippen, Platte und Querstreben;
// die Schnittebene liegt in einem Kabelschlitz des ersten Stegs, damit die Schlitze sichtbar werden.
function plateSectionData(G) {
  const { p, rails, w, h } = G, pt = p.plateT, n = rails.length;
  const bays = railBays(G), bay = bays[Math.floor(bays.length / 2)];
  const seams = new Set((G.plateStrips || []).filter(st => st.seamHi !== null).map(st => st.rails[st.rails.length - 1]));
  const ribH = Math.min(h - 2, Math.max(pt + 2, pt + 6));
  const rows = [];
  for (let i = 0; i + 1 < n; i++) rows.push(seams.has(i) ? { slots: [], bridges: [] } : slotRow(G, bay, i, rails[i] + w / 2, rails[i + 1] - w / 2));
  const first = rows.find(r => r.slots.length);
  const xc = first ? (first.slots[0].x0 + first.slots[0].x1) / 2 : (bay.faceL + bay.faceR) / 2;
  const parts = rails.map(a => printedSection(G).translate([a, 0]));
  for (let i = 0; i + 1 < n; i++) {
    const a0 = rails[i] + w / 2, a1 = rails[i + 1] - w / 2;
    const slot = rows[i].slots.find(sl => xc >= sl.x0 && xc <= sl.x1);
    const inBridge = rows[i].bridges.some(br => xc >= br.x0 && xc <= br.x1);
    let web = rect(a0 - 0.5, -pt, a1 + 0.5, 0);
    if (inBridge) web = csUnion([web, rect(a0, -ribH, a1, 0)]);
    if (slot) web = web.subtract(rect(slot.a0, -pt - 1, slot.a1, 1));
    parts.push(web);
  }
  return { polys: polysOf(csUnion(parts)), a0: rails[0] - w / 2, a1: rails[n - 1] + w / 2, xc };
}
function drawingData(G, prof2D, cuts) {
  const { p, w, h } = G;
  const sec = G.alu ? aluSection(G.prof) : printedSection(G);
  const secPolys = polysOf(sec);
  const rails = G.rails.map(s => {
    const polys = secPolys.map(pg => pg.map(([a, b]) => G.toYZ(s + a, b)));
    const pts = polys.flat();
    const top = [G.toYZ(s - w / 2, 0)[0], G.toYZ(s + w / 2, 0)[0]];
    return { s, polys, top, ymin: Math.min(...pts.map(q => q[0])), ymax: Math.max(...pts.map(q => q[0])),
      zmin: Math.min(...pts.map(q => q[1])), zmax: Math.max(...pts.map(q => q[1])) };
  });
  const cb = [];
  for (const s of G.rails) for (const a of G.coreOffsets) { const [y, z] = G.toYZ(s + a, -h / 2); cb.push({ y, z, r: G.scr.cbD / 2, r2: G.scr.endS.clear / 2 }); }
  const psus = G.goodPsus.map(P => {
    const wallPts = [[P.aL - P.t, P.bIn - P.t], [P.aR, P.bIn - P.t], [P.pa1, P.bTop], [P.pa0, P.bTop]].map(([a, b]) => G.toYZ(a, b));
    const boxPts = [[P.sP - p.psuW / 2, P.bIn + 0.5], [P.sP + p.psuW / 2, P.bIn + 0.5], [P.sP + p.psuW / 2, P.bIn + 0.5 + p.psuH], [P.sP - p.psuW / 2, P.bIn + 0.5 + p.psuH]].map(([a, b]) => G.toYZ(a, b));
    return { x0: P.x0 - P.t, x1: P.x1 + P.t, wall: wallPts, box: boxPts, isBox: P.isBox,
      ymin: Math.min(...wallPts.map(q => q[0])), ymax: Math.max(...wallPts.map(q => q[0])),
      zmin: Math.min(...wallPts.map(q => q[1])), zmax: Math.max(...wallPts.map(q => q[1])) };
  });
  return {
    mode: p.mode, W: p.W, D: G.Dtot, hF: p.hF, hB: G.hBlast, angle: deg(G.alpha), tiers: G.nTiers, capT: p.capT, supT: p.supT, pocket: p.pocket,
    supports: G.supports, railX0: G.railX0, railLen: G.railLen, w, h,
    profileLabel: G.alu ? tr('i.profileAlu', { label: G.prof.label }) : G.plate ? tr('i.profilePlate', { t: num(p.plateT), w: num(w), h: num(h) }) : tr('i.profileRail', { w: num(w), h: num(h), wall: num(p.railWall) }),
    outline: polysOf(prof2D), notches: polysOf(notchCS(G)), rails, section: secPolys, plateSection: G.plate ? plateSectionData(G) : null, cb,
    cuts: cuts.map(c => ({ c: c.c, dd: c.dd, tails: c.tails, splice: c.splice, top: topAtY(G, c.c) })),
    braces: G.braces, back: G.back ? { t: G.back.t, cutouts: G.back.cutouts, seams: G.back.seams, text: G.back.text ? { lines: G.back.text.lines, size: G.back.text.size, font: p.textFont, mode: p.textMode } : null } : null,
    plate: G.plate ? { t: p.plateT, slots: plateSlots(G).map(q => ({ x0: q.x0, x1: q.x1, y0: G.toYZ(q.a0, 0)[0], y1: G.toYZ(q.a1, 0)[0], r: q.r })),
      strips: (G.plateStrips || []).map(st => ({ lo: G.toYZ(st.lo, 0)[0], seam: st.seamHi !== null ? G.toYZ(st.seamHi, 0)[0] : null })) } : null,
    feet: p.feet ? feetY(G) : [], footD: p.footD, psus, pitch: G.rails.length > 1 ? G.rails[1] - G.rails[0] : 0,
    bendAngle: G.bendA, bendTotal: G.bendA * G.supports.length,
  };
}

function buildBom(G, pieces, cuts, hw) {
  const { p } = G;
  const bom = [];
  const nR = G.rails.length, nS = G.supports.length;
  const velcro = nR * G.railLen / 1000;
  // Schrauben, Muttern und Nutensteine aus der Hardware-Liste zählen
  const count = new Map();
  for (const x of hw) {
    let item, note = '';
    if (x.type === 'screw') {
      const s = SCREW[x.s];
      if (x.s === 'S4') { item = tr('b.screw.s4', { len: x.len }); note = tr('b.note.pilot'); }
      else if (x.s === 'S4K') {
        item = tr('b.screw.s4k', { len: x.len });
        if (x.len === CLIP_SCREW && G.clipCount) note = tr('b.note.clip') + (G.alu && G.braces.length ? tr('b.note.clipBrace') : '');
      } else if (x.s === 'M4L') { item = tr('b.screw.m4l', { len: x.len }); note = tr('b.note.tab'); }
      else item = tr('b.screw.cyl', { size: s.name, len: x.len });
    } else if (x.type === 'nut') { item = tr('b.nut'); note = tr('b.note.nut'); }
    else { item = G.prof.nut; note = tr('b.note.tnut'); }
    const c = count.get(item) || { n: 0, note };
    c.n++; count.set(item, c);
  }
  if (G.alu) {
    const pr = G.prof;
    bom.push({ item: tr('b.aluProfile', { label: pr.label }), qty: nR, note: tr('b.aluProfile.note', { len: fx(G.railLen), total: fx(nR * G.railLen / 1000, 2), tap: pr.tap }) });
    if (G.braces.length) {
      const pos = braceHolesAlu(G).map(x => x - G.railX0).sort((u, v) => u - v).map(v => fx(v)).join(' / ');
      bom.push({ item: tr('b.flat'), qty: G.braces.length, note: tr('b.flat.note', { len: fx(G.railLen), pos, cs: fx(SCREW.S4K.hd + 0.4, 1), sink: fx(ALU_BRACE_SINK, 1) }) });
    }
  }
  for (const [item, c] of count) bom.push({ item, qty: c.n, note: c.note });
  if (p.feet) bom.push({ item: tr('b.feet', { d: num(p.footD) }), qty: 2 * (2 + nS), note: tr('b.feet.note', { h: num(p.footH) }) });
  bom.push({ item: tr('b.velcro'), qty: tr('b.velcro.qty', { m: fx(velcro, 2) }), note: tr('b.velcro.note', { w: num(Math.min(G.w, 50)) }) });
  if (pieces > 1) bom.push({ item: tr('b.glue'), qty: '–', note: tr('b.glue.note') });
  if (G.clipCount) bom.push({ item: tr('b.hook'), qty: tr('b.hook.qty', { n: G.clipCount }), note: tr('b.hook.note') });
  if (G.goodPsus.length) bom.push({ item: tr('b.tie'), qty: 2 * G.goodPsus.length, note: tr('b.tie.note') });
  void cuts;
  return bom;
}

import * as THREE from 'three';
import { exportStep } from './step-export.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { initGeometry, generate, setTextShaper, DEFAULTS, PROFILES, SCREW, CLIP_SIZES, CLIP_TYPES } from './pedalboard.js';
import { buildDrawing } from './drawing.js';
import { build3MF, plateOrigin } from './threemf.js';
import { t, tn, has, fmt, fmtDateTime, initI18n, detectLang, getLocale, LANG_STORE } from './i18n.js';

const LANG = detectLang();
await initI18n(LANG, async l => (await import(`./lang/${l}.js`)).default);
document.documentElement.lang = LANG;
document.title = t('app.title');
const tl = s => (has(s) ? t(s) : s);          // Beschriftung: Übersetzungsschlüssel oder Klartext (Eigennamen)

// Statische Texte in index.html (data-i18n*) und Sprachumschalter. Ein Wechsel lädt die Seite neu.
function applyStatic() {
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  const md = document.querySelector('meta[name="description"]');
  if (md) md.content = t('app.description');
  for (const b of document.querySelectorAll('.langsw button')) {
    b.setAttribute('aria-pressed', String(b.dataset.lang === LANG));
    b.addEventListener('click', () => {
      if (b.dataset.lang === LANG) return;
      try { localStorage.setItem(LANG_STORE, b.dataset.lang); } catch (e) { /* ohne Speicher */ }
      const u = new URL(location.href);
      u.searchParams.set('lang', b.dataset.lang);
      location.href = u.href;
    });
  }
}
applyStatic();

// ------------------------------------------------------------------ Parameter-Definition
const isPrint = p => p.mode !== 'alu';           // A (Schienen) und C (Platte) sind gedruckt
const isPlate = p => p.mode === 'plate';
const isAlu = p => p.mode === 'alu';
const FONTS = [
  ['metal-mania', 'Metal Mania'], ['new-rocker', 'New Rocker'], ['pirata-one', 'Pirata One (Fraktur)'],
  ['unifrakturmaguntia', 'UnifrakturMaguntia'], ['black-ops-one', 'Black Ops One (Stencil)'], ['creepster', 'Creepster'],
  ['bebas-neue', 'Bebas Neue'], ['russo-one', 'Russo One'], ['bungee', 'Bungee'], ['orbitron', 'Orbitron'],
  ['permanent-marker', 'Permanent Marker'],
];
const hasText = p => p.back && String(p.text || '').trim() !== '';
// Bett-/Bauraumgrößen gängiger aktueller Drucker (Stand 2026), gruppiert nach Hersteller
const PRINTER_BEDS = {
  'bambu-a1mini': { brand: 'Bambu Lab', name: 'A1 mini', x: 180, y: 180, z: 180 },
  'bambu-a1': { brand: 'Bambu Lab', name: 'A1', x: 256, y: 256, z: 256 },
  'bambu-p1s': { brand: 'Bambu Lab', name: 'P1S', x: 256, y: 256, z: 256 },
  'bambu-p2s': { brand: 'Bambu Lab', name: 'P2S', x: 256, y: 256, z: 256 },
  'bambu-x2d': { brand: 'Bambu Lab', name: 'X2D', x: 256, y: 256, z: 260 },
  'bambu-a2l': { brand: 'Bambu Lab', name: 'A2L', x: 330, y: 320, z: 325 },
  'bambu-h2c': { brand: 'Bambu Lab', name: 'H2C', x: 325, y: 320, z: 320 },
  'bambu-h2d': { brand: 'Bambu Lab', name: 'H2D', x: 325, y: 320, z: 325 },
  'bambu-h2s': { brand: 'Bambu Lab', name: 'H2S', x: 340, y: 320, z: 340 },
  'prusa-mini': { brand: 'Prusa', name: 'MINI+', x: 180, y: 180, z: 180 },
  'prusa-mk4s': { brand: 'Prusa', name: 'MK4S', x: 250, y: 210, z: 220 },
  'prusa-coreone': { brand: 'Prusa', name: 'CORE One+', x: 250, y: 220, z: 270 },
  'prusa-coreonel': { brand: 'Prusa', name: 'CORE One L+', x: 300, y: 300, z: 330 },
  'prusa-xl': { brand: 'Prusa', name: 'XL+', x: 360, y: 360, z: 360 },
  'anycubic-kobras1': { brand: 'Anycubic', name: 'Kobra S1', x: 250, y: 250, z: 250 },
  'anycubic-kobra3': { brand: 'Anycubic', name: 'Kobra 3', x: 250, y: 250, z: 260 },
  'anycubic-kobrax': { brand: 'Anycubic', name: 'Kobra X', x: 260, y: 260, z: 260 },
  'anycubic-kobra4': { brand: 'Anycubic', name: 'Kobra 4', x: 260, y: 260, z: 260 },
  'anycubic-kobras1max': { brand: 'Anycubic', name: 'Kobra S1 Max', x: 350, y: 350, z: 350 },
  'anycubic-kobra3max': { brand: 'Anycubic', name: 'Kobra 3 Max', x: 420, y: 420, z: 500 },
};
const GROUPS = [
  { title: 'g.printer', open: true, fields: [
    { id: 'printerPreset', type: 'select', options: [
      ['', 'opt.printerCustom'],
      ...Object.entries(PRINTER_BEDS).map(([k, d]) => [k, `${d.brand} · ${d.name} (${d.x}×${d.y}×${d.z})`]),
    ] },
    { id: 'bedX', unit: 'mm', min: 100, max: 1000, step: 1 },
    { id: 'bedY', unit: 'mm', min: 100, max: 1000, step: 1 },
    { id: 'bedZ', unit: 'mm', min: 30, max: 1000, step: 1 },
    { id: 'bedMargin', unit: 'mm', min: 0, max: 30, step: 1 },
    { id: 'slicerDiffers', type: 'check' },
    { id: 'slicerX', unit: 'mm', min: 0, max: 2000, step: 1, show: p => p.slicerDiffers },
    { id: 'slicerY', unit: 'mm', min: 0, max: 2000, step: 1, show: p => p.slicerDiffers },
  ] },
  { title: 'g.board', open: true, fields: [
    { id: 'W', unit: 'mm', min: 200, max: 1500, step: 5 },
    { id: 'D', unit: 'mm', min: 120, max: 600, step: 5 },
    { id: 'hF', unit: 'mm', min: 15, max: 150, step: 1 },
    { id: 'hB', unit: 'mm', min: 15, max: 250, step: 1 },
  ] },
  { title: 'g.tiers', open: false, show: isPrint, fields: [
    { id: 'tiers', unit: '#', min: 1, max: 3, step: 1 },
    { id: 'tier2D', unit: 'mm', min: 80, max: 500, step: 5, show: p => p.tiers >= 2 },
    { id: 'tier2StepH', unit: 'mm', min: 10, max: 150, step: 1, show: p => p.tiers >= 2 },
    { id: 'tier2Hb', unit: 'mm', min: 20, max: 350, step: 1, show: p => p.tiers >= 2 },
    { id: 'tier2Rails', unit: 'pcs', min: 2, max: 8, step: 1, show: p => p.tiers >= 2 },
    { id: 'tier3D', unit: 'mm', min: 80, max: 500, step: 5, show: p => p.tiers >= 3 },
    { id: 'tier3StepH', unit: 'mm', min: 10, max: 150, step: 1, show: p => p.tiers >= 3 },
    { id: 'tier3Hb', unit: 'mm', min: 20, max: 400, step: 1, show: p => p.tiers >= 3 },
    { id: 'tier3Rails', unit: 'pcs', min: 2, max: 8, step: 1, show: p => p.tiers >= 3 },
  ] },
  { title: 'g.rails', open: true, fields: [
    { id: 'nRails', unit: 'pcs', min: 1, max: 12, step: 1 },
    { id: 'edge', unit: 'mm', min: 2, max: 40, step: 1 },
    { id: 'profile', type: 'select', show: isAlu,
      options: Object.entries(PROFILES).map(([k, v]) => [k, v.label]) },
    { id: 'railW', unit: 'mm', min: 15, max: 80, step: 1, show: isPrint },
    { id: 'railH', unit: 'mm', min: 10, max: 40, step: 1, show: isPrint },
    { id: 'railWall', unit: 'mm', min: 1.6, max: 6, step: 0.2, show: isPrint },
    { id: 'dovetail', type: 'check', show: isPrint },
    { id: 'dvAngle', unit: '°', min: 5, max: 20, step: 1, show: p => isPrint(p) && p.dovetail },
  ] },
  { title: 'g.plate', open: true, show: isPlate, fields: [
    { id: 'plateT', unit: 'mm', min: 2.4, max: 8, step: 0.2 },
    { id: 'slotH', unit: 'mm', min: 10, max: 60, step: 1 },
    { id: 'slotL', unit: 'mm', min: 30, max: 250, step: 1 },
    { id: 'slotBridge', unit: 'mm', min: 8, max: 60, step: 1 },
  ] },
  { title: 'g.sides', open: false, fields: [
    { id: 'capT', unit: 'mm', min: 12, max: 50, step: 1 },
    { id: 'pocket', unit: 'mm', min: 4, max: 30, step: 1 },
    { id: 'supT', unit: 'mm', min: 12, max: 50, step: 1 },
    { id: 'maxSpan', unit: 'mm', min: 150, max: 1500, step: 10 },
    { id: 'windows', type: 'check' },
    { id: 'winEdge', unit: 'mm', min: 3, max: 30, step: 0.5, show: p => p.windows },
    { id: 'wall', unit: 'mm', min: 3, max: 20, step: 0.5, show: p => p.windows },
    { id: 'feet', type: 'check' },
    { id: 'footD', unit: 'mm', min: 6, max: 30, step: 0.5, show: p => p.feet },
    { id: 'footH', unit: 'mm', min: 0.5, max: 5, step: 0.1, show: p => p.feet },
  ] },
  { title: 'g.bend', open: false, show: isPrint, fields: [
    { id: 'bend', type: 'check' },
    { id: 'bendAngle', unit: '°', min: -20, max: 20, step: 0.5, show: p => p.bend },
  ] },
  { title: 'g.bracing', open: false, fields: [
    { id: 'brace', type: 'check' },
    { id: 'braceCount', unit: 'pcs', min: 1, max: 2, step: 1, show: p => p.brace },
    { id: 'braceW', unit: 'mm', min: 12, max: 40, step: 1, show: p => p.brace && isPrint(p) },
    { id: 'braceH', unit: 'mm', min: 6, max: 20, step: 1, show: p => p.brace && isPrint(p) },
    { id: 'back', type: 'check' },
    { id: 'backT', unit: 'mm', min: 2.4, max: 8, step: 0.2, show: p => p.back },
  ] },
  { title: 'g.text', open: false, show: p => p.back, fields: [
    { id: 'text', type: 'textarea' },
    { id: 'textFont', type: 'select', options: FONTS },
    { id: 'textSize', unit: 'mm', min: 5, max: 80, step: 0.5 },
    { id: 'textMode', type: 'select', options: [['engrave', 'opt.textMode.engrave'], ['emboss', 'opt.textMode.emboss']] },
    { id: 'textDepth', unit: 'mm', min: 0.4, max: 4, step: 0.1 },
    { id: 'textHi', type: 'check' },
  ] },
  { title: 'g.psu', open: false, fields: [
    { id: 'psu', type: 'check' },
    { id: 'psuCount', unit: 'pcs', min: 1, max: 4, step: 1, show: p => p.psu },
    { id: 'psuType', type: 'select', show: p => p.psu,
      options: [['box', 'opt.psuType.box'], ['bracket', 'opt.psuType.bracket']] },
    { id: 'psuOne', type: 'check', show: p => p.psu && p.psuType === 'box' },
    { id: 'psuWall', unit: 'mm', min: 3, max: 10, step: 0.5, show: p => p.psu },
    { id: 'psuL', unit: 'mm', min: 40, max: 500, step: 1, show: p => p.psu },
    { id: 'psuW', unit: 'mm', min: 20, max: 300, step: 1, show: p => p.psu },
    { id: 'psuH', unit: 'mm', min: 10, max: 120, step: 1, show: p => p.psu },
    { id: 'psuGap', unit: 'mm', min: 0, max: 250, step: 0.5, show: p => p.psu },
    { id: 'psuBay', unit: '#', min: 0, max: 20, step: 1, show: p => p.psu },
    { id: 'psuTier', unit: '#', min: 1, max: 3, step: 1, show: p => p.psu && p.tiers > 1 },
  ] },
  { title: 'g.tol', open: false, fields: [
    { id: 'tol', unit: 'mm', min: 0, max: 1, step: 0.05 },
  ] },
];
const PRESETS = [
  { name: 'preset.compact', v: { W: 450, D: 250, hF: 30, hB: 85, nRails: 3, psuH: 28 } },
  { name: 'preset.standard', v: { W: 600, D: 300, hF: 32, hB: 100, nRails: 4, psuH: 30 } },
  { name: 'preset.large', v: { W: 800, D: 350, hF: 32, hB: 110, nRails: 5, psuH: 35 } },
  { name: 'preset.pro', v: { W: 1000, D: 400, hF: 35, hB: 120, nRails: 5, psuH: 40 } },
];

// ------------------------------------------------------------------ Zustand
const STORE = 'pedalboard-config-v2';
const fresh = () => ({ ...DEFAULTS, clips: [], printerPreset: '' });
let params = fresh();
try { Object.assign(params, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { /* ohne Speicher */ }
if (!Array.isArray(params.clips)) params.clips = [];
if (params.slicerDiffers === undefined) params.slicerDiffers = !!(params.slicerX || params.slicerY);
let clipSel = -1;                                 // ausgewählter PedalClip (Positionen werden markiert)
let result = null;
let selected = -1;
let tab = 'parts';

// ------------------------------------------------------------------ Formular
const form = document.getElementById('form');
function buildForm() {
  form.innerHTML = '';
  for (const g of GROUPS) {
    const det = document.createElement('details');
    det.className = 'grp'; det.open = g.open;
    if (g.show) det.dataset.grp = GROUPS.indexOf(g);
    det.innerHTML = `<summary>${t(g.title)}</summary>`;
    const box = document.createElement('div'); box.className = 'fields';
    for (const f of g.fields) {
      const row = document.createElement('div');
      row.className = 'field' + (f.type === 'check' ? ' check' : '');
      row.dataset.id = f.id;
      const lab = `<label for="f-${f.id}">${t('f.' + f.id)}${has('f.' + f.id + '.hint') ? `<small>${t('f.' + f.id + '.hint')}</small>` : ''}</label>`;
      if (f.type === 'select') {
        row.innerHTML = lab + `<select id="f-${f.id}">${f.options.map(([k, lb]) => `<option value="${k}">${tl(lb)}</option>`).join('')}</select>`;
      } else if (f.type === 'check') {
        row.innerHTML = lab + `<input type="checkbox" id="f-${f.id}">`;
      } else if (f.type === 'textarea') {
        row.className = 'field wide';
        row.innerHTML = lab + `<textarea id="f-${f.id}" rows="3" maxlength="130" spellcheck="false" placeholder="${t('ph.bandName')}"></textarea>`;
      } else {
        row.innerHTML = lab + `<div class="num"><input id="f-${f.id}" type="number" inputmode="decimal" min="${f.min}" max="${f.max}" step="${f.step}"><span>${f.unit === 'pcs' ? t('unit.pcs') : f.unit}</span></div>`;
      }
      box.appendChild(row);
    }
    det.appendChild(box);
    form.appendChild(det);
  }
  form.addEventListener('input', onInput);
  form.addEventListener('change', onInput);
}
function syncForm() {
  for (const g of GROUPS) for (const f of g.fields) {
    const el = document.getElementById('f-' + f.id);
    if (f.type === 'check') el.checked = !!params[f.id];
    else if (document.activeElement !== el) el.value = params[f.id];
    el.closest('.field').hidden = f.show ? !f.show(params) : false;
  }
  for (const det of form.querySelectorAll('[data-grp]')) det.hidden = !GROUPS[+det.dataset.grp].show(params);
  for (const b of document.querySelectorAll('.modes button')) b.setAttribute('aria-pressed', String(b.dataset.mode === params.mode));
  const plateBtn = document.getElementById('mode-plate');
  plateBtn.disabled = params.tiers > 1;
  plateBtn.title = params.tiers > 1 ? t('mode.plate.disabledTitle') : '';
}
function onInput(e) {
  const el = e.target; if (!el.id || !el.id.startsWith('f-')) return;
  const id = el.id.slice(2);
  const f = GROUPS.flatMap(g => g.fields).find(x => x.id === id);
  if (f.type === 'check') params[id] = el.checked;
  else if (f.type === 'select') params[id] = el.value;
  else if (f.type === 'textarea') params[id] = el.value.split('\n').slice(0, 3).map(l => l.slice(0, 40)).join('\n');
  else {
    const v = parseFloat(el.value);
    if (!Number.isFinite(v)) return;
    params[id] = Math.min(f.max, Math.max(f.min, v));
  }
  if (id === 'tiers' && params.tiers > 1 && params.mode === 'plate') params.mode = 'print';
  if (id === 'printerPreset' && params.printerPreset) {
    const pr = PRINTER_BEDS[params.printerPreset];
    params.bedX = pr.x; params.bedY = pr.y; params.bedZ = pr.z;
    params.slicerDiffers = false; params.slicerX = 0; params.slicerY = 0;
  }
  if (['bedX', 'bedY', 'bedZ'].includes(id) && params.printerPreset) {
    const pr = PRINTER_BEDS[params.printerPreset];
    if (pr.x !== params.bedX || pr.y !== params.bedY || pr.z !== params.bedZ) params.printerPreset = '';
  }
  if (id === 'slicerDiffers') {
    if (params.slicerDiffers) { if (!params.slicerX) params.slicerX = params.bedX; if (!params.slicerY) params.slicerY = params.bedY; }
    else { params.slicerX = 0; params.slicerY = 0; }
  }
  changed();
}
function changed() {
  syncForm();
  try { localStorage.setItem(STORE, JSON.stringify(params)); } catch (e) { /* ohne Speicher */ }
  schedule();
}
document.querySelectorAll('.modes button').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.mode === 'plate' && params.tiers > 1) return;
  params.mode = b.dataset.mode; changed();
}));
const presetBox = document.getElementById('presets');
for (const pr of PRESETS) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip'; b.textContent = t(pr.name);
  b.addEventListener('click', () => { Object.assign(params, pr.v); changed(); });
  presetBox.appendChild(b);
}
document.getElementById('reset').addEventListener('click', () => { params = fresh(); clipSel = -1; changed(); });

// ------------------------------------------------------------------ 3D-Ansicht
const vp = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
vp.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 1, 20000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(-400, -700, 1000); scene.add(sun);
const fill = new THREE.DirectionalLight(0xffffff, 0.6); fill.position.set(600, 500, 300); scene.add(fill);

const asmGroup = new THREE.Group(); scene.add(asmGroup);
const bedGroup = new THREE.Group(); scene.add(bedGroup);
let grid = null;

const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const MAT = {};
// Farbschemata für die 3D-Darstellung (und die Farbangaben im 3MF)
const SCHEMES = {
  hellfire: { printed: '#c8102e', rail: '#111214', brace: '#7a0a1c', panel: '#161616', hardware: '#d9dde2', psu: '#8b95a3', text: '#ff3b30' },
  toxic: { printed: '#3ee620', rail: '#0f1110', brace: '#1f7a12', panel: '#121412', hardware: '#cfd4d0', psu: '#8b95a3', text: '#5dff3a' },
  voltage: { printed: '#ffd400', rail: '#111111', brace: '#b39500', panel: '#151515', hardware: '#d5d8dc', psu: '#8b95a3', text: '#ffd400' },
  haze: { printed: '#8a2be2', rail: '#120f16', brace: '#5a1a99', panel: '#1a1422', hardware: '#cfcfd6', psu: '#8b95a3', text: '#e040fb' },
  cyber: { printed: '#00c8f0', rail: '#0c1014', brace: '#007a99', panel: '#10161b', hardware: '#d0d7de', psu: '#8b95a3', text: '#00f0ff' },
  punk: { printed: '#ff1f8e', rail: '#121012', brace: '#a3125a', panel: '#171217', hardware: '#d7d3d7', psu: '#8b95a3', text: '#ffffff' },
  chrome: { printed: '#b9bec4', rail: '#0e0f11', brace: '#8a9097', panel: '#141517', hardware: '#eef0f2', psu: '#8b95a3', text: '#d10a0a' },
  goldtop: { printed: '#d4af37', rail: '#101010', brace: '#9c7c1c', panel: '#161310', hardware: '#e3d9b8', psu: '#8b95a3', text: '#d4af37' },
  stealth: { printed: '#26272a', rail: '#0b0b0c', brace: '#34353a', panel: '#1b1c1e', hardware: '#6e737a', psu: '#5b636b', text: '#e10600' },
};
for (const s of Object.values(SCHEMES)) s.clip = s.brace;            // PedalClips in der dunkleren Akzentfarbe
const LOOK_KEYS = ['printed', 'rail', 'brace', 'panel', 'text', 'clip', 'hardware', 'psu'];
const LOOK_STORE = 'pedalboard-look-v2';
let look = { scheme: 'hellfire', ...SCHEMES.hellfire, transparent: false, opacity: 0.35 };
try { Object.assign(look, JSON.parse(localStorage.getItem(LOOK_STORE) || '{}')); } catch (e) { /* ohne Speicher */ }
if (!look.clip) look.clip = look.brace;

function makeMaterials() {
  MAT.printed = new THREE.MeshStandardMaterial({ roughness: 0.58, metalness: 0.0, flatShading: true });
  MAT.rail = new THREE.MeshStandardMaterial({ roughness: 0.72, flatShading: true });
  MAT.alu = new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.55, flatShading: true });
  MAT.brace = new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true });
  MAT.panel = new THREE.MeshStandardMaterial({ roughness: 0.65, flatShading: true });
  MAT.text = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1, flatShading: true });
  MAT.clip = new THREE.MeshStandardMaterial({ roughness: 0.55, flatShading: true });
  MAT.clipSel = new THREE.MeshStandardMaterial({ roughness: 0.55, flatShading: true, emissive: 0x1c7ed6, emissiveIntensity: 0.55 });
  MAT.site = new THREE.MeshBasicMaterial({ color: 0x2fb344, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  MAT.siteHover = new THREE.MeshBasicMaterial({ color: 0x51cf66, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  MAT.steel = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.85 });
  MAT.nut = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.85, flatShading: true });
  MAT.psu = new THREE.MeshStandardMaterial({ roughness: 0.5, transparent: true, opacity: 0.4, depthWrite: false });
  MAT.bad = new THREE.MeshStandardMaterial({ color: css('--bad'), roughness: 0.6, flatShading: true });
  applyLook();
}
// Farben und Transparenz auf die bestehenden Materialien anwenden (ohne Neuberechnung)
function applyLook() {
  const set = (m, c) => m.color.set(c);
  set(MAT.printed, look.printed); set(MAT.rail, look.rail); set(MAT.alu, look.rail); set(MAT.brace, look.brace);
  set(MAT.panel, look.panel); set(MAT.text, look.text || '#ffffff'); set(MAT.steel, look.hardware); set(MAT.nut, new THREE.Color(look.hardware).multiplyScalar(0.85));
  set(MAT.psu, look.psu); set(MAT.clip, look.clip || look.brace); set(MAT.clipSel, look.clip || look.brace);
  for (const k of ['printed', 'rail', 'alu', 'brace', 'panel', 'text', 'clip']) {
    MAT[k].transparent = look.transparent;
    MAT[k].opacity = look.transparent ? look.opacity : 1;
    MAT[k].depthWrite = !look.transparent;
    MAT[k].needsUpdate = true;
  }
}
makeMaterials();

function geom(mesh) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  return g;
}
function clear(group) {
  for (const c of [...group.children]) { group.remove(c); c.traverse(o => { if (o.geometry && !o.geometry.userData.cached) o.geometry.dispose(); }); }
}
function resize() {
  const r = vp.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(vp);

let viewMode = 'asm';
let explodeK = 0;
function buildAssembly() {
  clear(asmGroup);
  if (grid) scene.remove(grid);
  if (!result) return;
  const p = params;
  for (const a of result.assembly) {
    const m = new THREE.Mesh(geom(a.mesh), a.role === 'clip' && a.clip === clipSel ? MAT.clipSel : MAT[a.role]);
    m.userData.explode = a.explode;
    if (a.clip !== undefined) m.userData.clip = a.clip;
    asmGroup.add(m);
  }
  buildSites();
  for (const h of result.hardware) {
    const wrap = new THREE.Group();
    wrap.add(hardwareObj(h));
    wrap.userData.explode = h.ex;
    wrap.userData.hw = true;
    wrap.visible = showHw;
    asmGroup.add(wrap);
  }
  applyExplode();
  const size = Math.ceil(Math.max(p.W, p.D) * 1.6 / 100) * 100;
  grid = new THREE.GridHelper(size, size / 50, 0x9099a3, 0xb9c0c7);
  grid.rotation.x = Math.PI / 2; grid.position.set(p.W / 2, p.D / 2, -0.5);
  grid.material.transparent = true; grid.material.opacity = 0.35;
  scene.add(grid);
  grid.visible = viewMode === 'asm';
}
// Normteile: Schrauben, Muttern, Nutensteine (einfache Körper, Geometrie wird wiederverwendet)
let showHw = true;
const hwGeo = new Map();
const cached = (key, make) => {
  if (!hwGeo.has(key)) { const g = make(); g.userData.cached = true; hwGeo.set(key, g); }
  return hwGeo.get(key);
};
const UP = new THREE.Vector3(0, 1, 0);
function hardwareObj(h) {
  const g = new THREE.Group();
  const dir = new THREE.Vector3(...h.dir).normalize();
  if (h.type === 'screw') {
    const S = SCREW[h.s];
    const sl = h.drawLen ?? h.len;
    const shaft = new THREE.Mesh(cached(`sh${S.d}-${sl}`, () => new THREE.CylinderGeometry(S.d / 2, S.d / 2, sl, 16)), MAT.steel);
    shaft.position.y = sl / 2;
    const head = new THREE.Mesh(cached(`hd${h.s}`, () => h.s === 'M4L' || h.s === 'S4'
      ? new THREE.SphereGeometry(S.hd / 2, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, (S.hh * 1.1) / (S.hd / 2), 1).rotateX(Math.PI)
      : h.s === 'S4K'
        ? new THREE.CylinderGeometry(S.d / 2, S.hd / 2, S.hh, 20).translate(0, -S.hh / 2, 0)
        : new THREE.CylinderGeometry(S.hd / 2, S.hd / 2, S.hh, 20).translate(0, -S.hh / 2, 0)), MAT.steel);
    const sock = new THREE.Mesh(cached(`so${S.d}`, () => new THREE.CylinderGeometry(S.d * 0.45, S.d * 0.45, 0.8, 6)), MAT.rail);
    sock.position.y = -(h.s === 'M4L' || h.s === 'S4' ? S.hh * 1.1 : S.hh) + 0.3;
    g.add(shaft, head, sock);
    g.quaternion.setFromUnitVectors(UP, dir);
  } else if (h.type === 'nut') {
    const m = new THREE.Mesh(cached(`nut${h.af}`, () => new THREE.CylinderGeometry(h.af / Math.sqrt(3), h.af / Math.sqrt(3), h.t, 6)), MAT.nut);
    g.add(m);
    g.quaternion.setFromUnitVectors(UP, dir);
  } else if (h.type === 'tnut') {
    const body = new THREE.Mesh(cached(`tn${h.l}-${h.w}-${h.t}`, () => new THREE.BoxGeometry(h.l, h.w, h.t)), MAT.nut);
    const neck = new THREE.Mesh(cached(`tk${h.l}-${h.w}`, () => new THREE.BoxGeometry(h.l, h.w * 0.55, 1.6).translate(0, 0, -h.t / 2 - 0.8)), MAT.nut);
    g.add(body, neck);
    const along = new THREE.Vector3(...h.along).normalize();
    const side = new THREE.Vector3().crossVectors(dir, along);
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, side, dir));
  }
  g.position.set(...h.p);
  return g;
}
function applyExplode() {
  const k = explodeK * Math.max(params.W, params.D) * 0.18;
  for (const m of asmGroup.children) {
    const e = m.userData.explode || [0, 0, 0];
    m.position.set(e[0] * k, e[1] * k, e[2] * k);
  }
}
document.getElementById('explode').addEventListener('input', e => { explodeK = +e.target.value; applyExplode(); });

// ------------------------------------------------------------------ PedalClips: Auswahl, mögliche Positionen, Platzieren
const siteGroup = new THREE.Group(); scene.add(siteGroup);
const clipType = i => (params.clips[i] && CLIP_TYPES[params.clips[i].type] ? params.clips[i].type : 'spring');
const sitesFor = i => (result && result.clipSites ? result.clipSites[clipType(i)] || [] : []);
function buildSites() {
  clear(siteGroup);
  if (clipSel < 0 || !result || viewMode !== 'asm') return;
  for (const s of sitesFor(clipSel)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(s.quad.flat()), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const m = new THREE.Mesh(g, MAT.site);
    m.userData.site = s;
    siteGroup.add(m);
  }
}
function selectClip(i) {
  clipSel = i;
  for (const m of asmGroup.children) if (m.userData.clip !== undefined) m.material = m.userData.clip === clipSel ? MAT.clipSel : MAT.clip;
  buildSites(); renderClipEditor(); updateHud();
}
function placeClip(s, point) {
  const d = new THREE.Vector3(...s.dir), o = new THREE.Vector3(...s.origin);
  let x = point.clone().sub(o).dot(d);
  x = Math.max(s.x0, Math.min(s.x1, Math.round(x / 5) * 5));
  params.clips[clipSel].at = { site: s.key, x: +x.toFixed(2) };
  clipSel = -1;
  clear(siteGroup);
  changed();
}
// Klick (ohne Ziehen) im 3D-Fenster: Clip auswählen bzw. an der markierten Stelle absetzen
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let downAt = null, hoverSite = null;
const pick = (e, objs) => {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObjects(objs, false)[0] || null;
};
renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5 || viewMode !== 'asm' || !result) return;
  downAt = null;
  if (clipSel >= 0) {
    const hs = pick(e, siteGroup.children);
    if (hs) { placeClip(hs.object.userData.site, hs.point); return; }
  }
  const hc = pick(e, asmGroup.children.filter(m => m.userData.clip !== undefined && m.visible));
  if (hc) selectClip(hc.object.userData.clip === clipSel ? -1 : hc.object.userData.clip);
  else if (clipSel >= 0) selectClip(-1);
});
renderer.domElement.addEventListener('pointermove', e => {
  if (clipSel < 0 || viewMode !== 'asm') return;
  const hs = pick(e, siteGroup.children);
  const obj = hs ? hs.object : null;
  if (obj === hoverSite) return;
  if (hoverSite) hoverSite.material = MAT.site;
  hoverSite = obj;
  if (obj) obj.material = MAT.siteHover;
  renderer.domElement.style.cursor = obj ? 'copy' : '';
});
window.addEventListener('keydown', e => { if (e.key === 'Escape' && clipSel >= 0) selectClip(-1); });

const clipBox = document.getElementById('clips');
function clipStatus(i) {
  const pl = result && result.clipPlaced ? result.clipPlaced[i] : null;
  if (!pl) return `<span class="pill">${t('clip.parked')}</span>`;
  const idx = +pl.key.split('-')[1] + 1;
  return `<span class="pill ok">${t('clip.placed', { bay: pl.bay + 1, kind: t(pl.key.startsWith('gap') ? 'clip.gap' : 'clip.slot'), idx, x: fmt(pl.x) })}</span>`;
}
function renderClipEditor() {
  const op = result && result.info ? result.info.clipOpening : null;
  const opTxt = op ? t(op.kind === 'gap' ? 'clip.opening.gap' : 'clip.opening.slot', { o: fmt(op.o, 1) }) : '';
  const rows = params.clips.map((c, i) => {
    const custom = c.size === 'custom';
    return `<div class="clip${i === clipSel ? ' sel' : ''}" data-ci="${i}">
      <div class="clip-h"><b>${t('clip.title', { n: i + 1 })}</b>${clipStatus(i)}</div>
      <div class="field"><label>${t('clip.housing')}</label><select data-ck="size">${Object.entries(CLIP_SIZES).map(([k, v]) => `<option value="${k}"${k === c.size ? ' selected' : ''}>${esc(v.label)}${v.w ? ` · ${v.w}×${v.d}` : ''}</option>`).join('')}</select></div>
      ${custom ? `<div class="field"><label>${t('clip.width')}<small>${t('clip.width.hint')}</small></label><div class="num"><input type="number" data-ck="w" min="30" max="400" step="1" value="${+c.w || 60}"><span>mm</span></div></div>
      <div class="field"><label>${t('clip.depth')}<small>${t('clip.depth.hint')}</small></label><div class="num"><input type="number" data-ck="d" min="30" max="400" step="1" value="${+c.d || 112}"><span>mm</span></div></div>` : ''}
      <div class="field"><label>${t('clip.mechanism')}</label><select data-ck="type">${Object.entries(CLIP_TYPES).map(([k, v]) => `<option value="${k}"${k === clipType(i) ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field check"><label>${t('clip.rotated')}<small>${t('clip.rotated.hint')}</small></label><input type="checkbox" data-ck="rot"${c.rot ? ' checked' : ''}></div>
      <div class="clip-act">
        <button type="button" class="btn${i === clipSel ? ' primary' : ''}" data-cact="place">${t(i === clipSel ? 'clip.pickPos' : 'clip.place')}</button>
        ${c.at ? `<button type="button" class="btn" data-cact="park">${t('clip.park')}</button>` : ''}
        <button type="button" class="btn" data-cact="del">${t('clip.remove')}</button>
      </div></div>`;
  }).join('');
  clipBox.innerHTML = `<summary>${t('clips.title')} <span class="pill warn">${t('clips.experimental')}</span></summary><div class="fields">
    ${rows}
    <button type="button" class="btn" data-cact="add">${t('clip.add')}</button>
    <p class="notes" style="margin:0"><b style="color:var(--warn)">${t('clips.expLabel')}</b> ${t('clips.expText')}
    ${t('clips.intro')} ${opTxt}
    ${t('clips.howto')}</p></div>`;
}
clipBox.addEventListener('click', e => {
  const b = e.target.closest('[data-cact]'); if (!b) return;
  const row = b.closest('[data-ci]'), i = row ? +row.dataset.ci : -1;
  const act = b.dataset.cact;
  if (act === 'add') {
    const last = params.clips[params.clips.length - 1];
    params.clips.push({ size: last ? last.size : '1590b', w: 60, d: 112, type: last ? last.type : 'spring', rot: false, at: null });
    clipSel = params.clips.length - 1;
    if (viewMode !== 'asm') showAssembly();
    changed();
  } else if (act === 'place') { if (viewMode !== 'asm') showAssembly(); selectClip(i === clipSel ? -1 : i); }
  else if (act === 'park') { params.clips[i].at = null; changed(); }
  else if (act === 'del') { params.clips.splice(i, 1); clipSel = -1; changed(); }
});
clipBox.addEventListener('change', e => {
  const el = e.target, k = el.dataset.ck; if (!k) return;
  const i = +el.closest('[data-ci]').dataset.ci, c = params.clips[i];
  if (k === 'rot') c.rot = el.checked;
  else if (k === 'w' || k === 'd') { const v = parseFloat(el.value); if (!Number.isFinite(v)) return; c[k] = Math.max(30, Math.min(400, v)); }
  else c[k] = el.value;
  changed();
  if (k === 'size' || k === 'type') renderClipEditor();
});

const partMat = pt => ({ rail: MAT.rail, brace: MAT.brace, back: MAT.panel, clip: MAT.clip }[pt.group] || MAT.printed);
const partRole = pt => ({ rail: 'rail', brace: 'brace', back: 'panel', clip: 'clip' }[pt.group] || 'printed');

// Druckbett (Platte + Rand + nutzbare Fläche) an Position ox,oy (linke vordere Ecke)
function addBed(group, ox = 0, oy = 0) {
  const bx = params.bedX, by = params.bedY, mg = params.bedMargin;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(bx, by, 2), new THREE.MeshStandardMaterial({ color: 0xa7afb7, roughness: 0.9 }));
  plate.position.set(ox + bx / 2, oy + by / 2, -1); group.add(plate);
  const lines = (x0, y0, x1, y1, color, dashed) => {
    const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => new THREE.Vector3(x, y, 0.2));
    const mat = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 6, gapSize: 4 }) : new THREE.LineBasicMaterial({ color });
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
    if (dashed) l.computeLineDistances();
    group.add(l);
  };
  lines(ox, oy, ox + bx, oy + by, 0x5b636b, false);
  lines(ox + mg, oy + mg, ox + bx - mg, oy + by - mg, 0x6c757d, true);
}

function showBed(i) {
  const part = result && result.parts[i];
  if (!part) return;
  selected = i; viewMode = 'bed';
  clear(bedGroup); clear(siteGroup);
  const bx = params.bedX, by = params.bedY;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(bx, by, 2), new THREE.MeshStandardMaterial({ color: 0xa7afb7, roughness: 0.9 }));
  plate.position.set(0, 0, -1); bedGroup.add(plate);
  const lines = (w, h, color, dashed) => {
    const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2], [-w / 2, -h / 2]].map(([x, y]) => new THREE.Vector3(x, y, 0.2));
    const mat = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 6, gapSize: 4 }) : new THREE.LineBasicMaterial({ color });
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
    if (dashed) l.computeLineDistances();
    bedGroup.add(l);
  };
  lines(bx, by, 0x5b636b, false);
  lines(bx - 2 * params.bedMargin, by - 2 * params.bedMargin, 0x6c757d, true);
  const m = new THREE.Mesh(geom(part.mesh), part.fit.ok ? partMat(part) : MAT.bad);
  bedGroup.add(m);
  if (part.inlay) bedGroup.add(new THREE.Mesh(geom(part.inlay), MAT.text));
  asmGroup.visible = false; if (grid) grid.visible = false; bedGroup.visible = true;
  document.getElementById('view-asm').hidden = false;
  document.getElementById('explode-wrap').hidden = true;
  frame('iso');
  renderParts(); updateHud();
}
// Druckplatten: Regal-Packung der Bauteil-Grundflächen (mit 90°-Drehung), gleiche Anordnung wie im 3MF
function meshBox(mesh) {
  const P = mesh.positions;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 0; k < P.length; k += 3) {
    if (P[k] < x0) x0 = P[k]; if (P[k] > x1) x1 = P[k];
    if (P[k + 1] < y0) y0 = P[k + 1]; if (P[k + 1] > y1) y1 = P[k + 1];
  }
  return { w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
let plates = [];
function packPlates() {
  plates = [];
  if (!result) return;
  const mg = params.bedMargin, W = params.bedX - 2 * mg, H = params.bedY - 2 * mg, gap = 6;
  // je Farbrolle (partRole) getrennt packen, damit nie zwei Farben auf derselben Platte landen
  // (vermeidet unnoetige Filamentwechsel beim Ein-Filament-Druck)
  const byRole = new Map();
  result.parts.forEach((pt, i) => {
    if (!pt.fit.ok) return;
    const bb = meshBox(pt.mesh);
    const role = partRole(pt);
    if (!byRole.has(role)) byRole.set(role, []);
    for (let c = 0; c < pt.qty; c++) byRole.get(role).push({ i, c, ...bb });
  });
  const place = (pl, it, x, y, w, h, rot) => {
    // Mittelpunkt der Grundfläche nach Drehung auf (x + w/2, y + h/2) legen
    const [cx, cy] = rot ? [-it.cy, it.cx] : [it.cx, it.cy];
    pl.items.push({ i: it.i, rot, tx: mg + x + w / 2 - cx, ty: mg + y + h / 2 - cy, w, h });
    pl.area += it.w * it.h;
  };
  const tryPlace = (pl, it) => {
    const orients = [[it.w, it.h, 0], [it.h, it.w, 90]].filter(([w, h]) => w <= W + 1e-6 && h <= H + 1e-6);
    for (const sh of pl.shelves) for (const [w, h, rot] of orients) {
      if (h <= sh.h + 1e-6 && sh.x + w <= W + 1e-6) { place(pl, it, sh.x, sh.y, w, h, rot); sh.x += w + gap; return true; }
    }
    for (const [w, h, rot] of [...orients].sort((a, b) => a[1] - b[1])) {
      if (pl.usedH + h <= H + 1e-6) {
        const sh = { y: pl.usedH, h, x: 0 };
        pl.shelves.push(sh); pl.usedH += h + gap;
        place(pl, it, sh.x, sh.y, w, h, rot); sh.x += w + gap;
        return true;
      }
    }
    return false;
  };
  for (const items of byRole.values()) {
    items.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h);
    const rolePlates = [];
    for (const it of items) {
      if (rolePlates.some(pl => tryPlace(pl, it))) continue;
      const pl = { shelves: [], items: [], usedH: 0, area: 0 };
      rolePlates.push(pl);
      if (!tryPlace(pl, it)) {                              // diagonal liegendes Teil: mittig auf eigene Platte
        pl.items.push({ i: it.i, rot: 0, tx: params.bedX / 2 - it.cx, ty: params.bedY / 2 - it.cy, w: it.w, h: it.h });
        pl.area += it.w * it.h; pl.usedH = H;
      }
    }
    plates.push(...rolePlates);
  }
}
// Teile einer Platte als three.js-Objekte (Platte an ox, oy)
function plateMeshes(group, pl, ox, oy) {
  for (const it of pl.items) {
    const pt = result.parts[it.i];
    for (const [mesh, mat] of [[pt.mesh, partMat(pt)], ...(pt.inlay ? [[pt.inlay, MAT.text]] : [])]) {
      const m = new THREE.Mesh(geom(mesh), mat);
      m.rotation.z = THREE.MathUtils.degToRad(it.rot);
      m.position.set(ox + it.tx, oy + it.ty, 0);
      group.add(m);
    }
  }
}
function showPlates(only = null) {
  if (!result) return;
  viewMode = 'plates'; selected = -1; plateSel = only;
  clear(bedGroup); clear(siteGroup);
  plates.forEach((pl, j) => {
    if (only !== null && only !== j) return;
    // alle Platten im selben Raster wie im Slicer (Bambu Studio / OrcaSlicer), Platte 1 oben links
    const [ox, oy] = only !== null ? [0, 0] : plateOrigin(j, plates.length, params.bedX, params.bedY);
    addBed(bedGroup, ox, oy);
    plateMeshes(bedGroup, pl, ox, oy);
  });
  asmGroup.visible = false; if (grid) grid.visible = false; bedGroup.visible = true;
  document.getElementById('view-asm').hidden = false;
  document.getElementById('explode-wrap').hidden = true;
  frame(only !== null ? 'iso' : 'top');
  renderParts(); renderPlates(); updateHud();
}
let plateSel = null;

function showAssembly() {
  viewMode = 'asm'; selected = -1; plateSel = null;
  asmGroup.visible = true; if (grid) grid.visible = true; bedGroup.visible = false;
  document.getElementById('view-asm').hidden = true;
  document.getElementById('explode-wrap').hidden = false;
  buildSites();
  frame('iso'); renderParts(); updateHud();
}
document.getElementById('view-asm').addEventListener('click', showAssembly);

function frame(kind) {
  const box = new THREE.Box3().setFromObject(viewMode === 'asm' ? asmGroup : bedGroup);
  if (viewMode !== 'asm') box.expandByScalar(5);
  if (box.isEmpty()) box.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(params.W, params.D, params.hB));
  const c = box.getCenter(new THREE.Vector3());
  const r = box.getSize(new THREE.Vector3()).length() * 0.5;
  const dist = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05;
  const dir = kind === 'top' ? new THREE.Vector3(0, -0.001, 1)
    : kind === 'side' ? new THREE.Vector3(-1, 0, 0.08)
    : new THREE.Vector3(-0.55, -1, 0.75);
  camera.position.copy(c).addScaledVector(dir.normalize(), dist);
  controls.target.copy(c); controls.update();
}
document.getElementById('cam-iso').addEventListener('click', () => frame('iso'));
document.getElementById('cam-side').addEventListener('click', () => frame('side'));
document.getElementById('cam-top').addEventListener('click', () => frame('top'));

renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

// Theme-Wechsel
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { makeMaterials(); rebuildView(); });

// ------------------------------------------------------------------ Ausgabe
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function updateHud() {
  const dim = document.getElementById('hud-dim'), sub = document.getElementById('hud-sub');
  const leg = document.getElementById('legend');
  if (viewMode === 'plates') {
    const n = plates.length;
    dim.textContent = plateSel !== null ? t('hud.plateOf', { i: plateSel + 1, n }) : tn('hud.plates', n);
    const [sx, sy] = slicerBed();
    const exportNote = params.slicerDiffers && (sx !== params.bedX || sy !== params.bedY)
      ? t('hud.exportNote', { x: fmt(sx), y: fmt(sy) }) : '';
    sub.textContent = t('hud.plateSub', { x: params.bedX, y: params.bedY, m: params.bedMargin }) + exportNote;
    leg.innerHTML = `<span><i style="background:#a7afb7"></i>${t('hud.bed')}</span><span><i style="border:1px dashed #adb5bd"></i>${t('hud.usable')}</span>`;
    return;
  }
  if (viewMode === 'bed' && result && result.parts[selected]) {
    const pt = result.parts[selected];
    dim.textContent = `${pt.name}`;
    sub.textContent = t('hud.partSub', { size: pt.size.map(v => fmt(v, 1)).join(' × '), x: params.bedX, y: params.bedY }) + (pt.fit.ok && pt.fit.angle ? t('hud.rotated', { a: fmt(pt.fit.angle, 1) }) : '');
    leg.innerHTML = `<span><i style="background:#a7afb7"></i>${t('hud.bed')}</span><span><i style="border:1px dashed #adb5bd"></i>${t('hud.usable')}</span>`;
    return;
  }
  const p = params, i = result ? result.info : null;
  if (clipSel >= 0 && params.clips[clipSel]) {
    const n = sitesFor(clipSel).length, op = i && i.clipOpening;
    const err = op && op.err ? op.err[clipType(clipSel)] : null;
    dim.textContent = t('hud.clipPlace', { n: clipSel + 1, type: CLIP_TYPES[clipType(clipSel)] });
    sub.textContent = n ? t('hud.clipHint') : t('hud.clipNone', { why: err || t('hud.clipBlocked') });
    return;
  }
  const totalD = i ? i.D : p.D, totalHb = i ? i.hB : p.hB;
  dim.textContent = `${p.W} × ${fmt(totalD)} × ${p.hF}–${fmt(totalHb)} mm`;
  sub.textContent = i ? `${p.tiers > 1 ? t('hud.tiers', { n: p.tiers }) : ''}${t('hud.slope', { a: fmt(i.angle, 1) })} · ${tn('hud.rails', i.rails)} · ${tn('hud.supports', i.supports)} · ${t('hud.footprint', { x: fmt(i.usable[0]), y: fmt(i.usable[1]) })}` +
    (p.bend && i.bendAngle ? t('hud.bent', { a: fmt(i.bendAngle, 1), tot: fmt(Math.abs(i.bendTotal), 1) }) : '') : '';
  const sw = c => `<i style="background:${c}"></i>`;
  leg.innerHTML = `<span>${sw(look.printed)}${t('leg.printed')}</span>` +
    `<span>${sw(look.rail)}${t(p.mode === 'alu' ? 'leg.aluProfile' : p.mode === 'plate' ? 'leg.plate' : 'leg.rail')}</span>` +
    (p.brace ? `<span>${sw(p.mode === 'alu' ? look.rail : look.brace)}${t('leg.braces')}</span>` : '') +
    (p.back ? `<span>${sw(look.panel)}${t('leg.back')}</span>` : '') +
    (hasText(p) && p.textHi ? `<span>${sw(look.text)}${t('leg.text')}</span>` : '') +
    (p.clips.length ? `<span>${sw(look.clip)}${t('leg.clips')}</span>` : '') +
    (showHw ? `<span>${sw(look.hardware)}${t(p.mode === 'alu' ? 'leg.screwsNuts' : 'leg.screws')}</span>` : '') +
    (p.psu ? `<span><i style="background:${look.psu};opacity:.6"></i>${t('leg.psu')}</span>` : '');
}

// Filamentschätzung: Wandvolumen über die tatsächliche Netzoberfläche (Wandschleifen × Linienbreite),
// Rest des Vollkörpers mit dem Infill-Anteil – realistischer als ein pauschaler Faktor aufs Volumen,
// weil dünnwandige Teile (Schienen, Fenster-Stege) so nicht überschätzt werden.
const WALL_LOOPS = 3, LINE_W = 0.44, WALL_T = WALL_LOOPS * LINE_W / 10;  // cm, ≈1,2 mm bei 3 Schleifen/0,4-mm-Düse
const INFILL = 0.30;
const DENSITY = { PETG: 1.27, PLA: 1.24, ASA: 1.05 };                    // g/cm³
function meshArea(mesh) {                                                // Netzoberfläche in cm²
  const P = mesh.positions, I = mesh.indices;
  let a2 = 0;
  for (let t = 0; t < I.length; t += 3) {
    const p0 = 3 * I[t], p1 = 3 * I[t + 1], p2 = 3 * I[t + 2];
    const ux = P[p1] - P[p0], uy = P[p1 + 1] - P[p0 + 1], uz = P[p1 + 2] - P[p0 + 2];
    const vx = P[p2] - P[p0], vy = P[p2 + 1] - P[p0 + 1], vz = P[p2 + 2] - P[p0 + 2];
    a2 += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  }
  return a2 / 2 / 100;                                                   // mm² → cm²
}
function partGrams(pt, density) {
  const area = meshArea(pt.mesh) + (pt.inlay ? meshArea(pt.inlay) : 0);
  const shell = Math.min(pt.volume, area * WALL_T);                      // Wände + Deck-/Bodenlagen
  const core = Math.max(0, pt.volume - shell) * INFILL;
  return (shell + core) * density;
}
function renderParts() {
  const pane = document.getElementById('pane-parts');
  const cnt = document.getElementById('c-parts');
  if (!result || !result.parts.length) {
    cnt.textContent = '0';
    pane.innerHTML = `<p class="notes">${tn('parts.none', result ? result.errors.length : 0)}</p>`;
    return;
  }
  const total = result.parts.reduce((s, x) => s + x.qty, 0);
  cnt.textContent = total;
  const vol = result.parts.reduce((s, x) => s + x.qty * x.volume, 0);
  const gramsOf = pt => partGrams(pt, DENSITY.PETG) * pt.qty;
  const totalG = result.parts.reduce((s, x) => s + gramsOf(x), 0);
  const rows = result.parts.map((pt, i) => `<tr class="${i === selected ? 'sel' : ''}">
    <td><button type="button" class="linkbtn" data-show="${i}">${esc(pt.name)}</button></td>
    <td class="n">${pt.qty}×</td>
    <td class="n">${pt.size.map(v => fmt(v, 1)).join(' × ')}</td>
    <td>${pt.fit.ok ? `<span class="pill ok">${t('parts.fits')}${pt.fit.angle ? t('parts.diagonal', { a: fmt(pt.fit.angle, 1) }) : ''}</span>` : `<span class="pill bad">${t('parts.noFit')}</span>`}</td>
    <td class="n">${fmt(pt.volume * pt.qty, 0)} cm³</td>
    <td class="n">${fmt(gramsOf(pt), 0)} g</td>
    <td><button type="button" class="btn" data-step="${i}">STEP</button> <button type="button" class="btn" data-stl="${i}">STL</button>${pt.inlay ? ` <button type="button" class="btn" data-stlt="${i}" title="${t('parts.inlayTitle')}">${t('parts.inlay')}</button>` : ''}</td></tr>`).join('');
  pane.innerHTML = `<div class="tablewrap"><table>
    <thead><tr><th>${t('parts.th.part')}</th><th class="n">${t('parts.th.qty')}</th><th class="n">${t('parts.th.size')}</th><th>${t('parts.th.bed')}</th><th class="n">${t('parts.th.vol')}</th><th class="n">${t('parts.th.fil')}</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="notes">${t('parts.summary', { total, vol: fmt(vol), kg: fmt(totalG / 1000, 2), d: fmt(DENSITY.PETG, 2) })}
    ${t('parts.estimate', { loops: WALL_LOOPS, wall: fmt(WALL_T * 10, 1), infill: Math.round(INFILL * 100) })}</p>
    <p class="notes">${t('mat.intro', { d: fmt(DENSITY.PETG, 2) })}</p>
    <ul class="notes">
      <li>${t('mat.pla', { d: fmt(DENSITY.PLA, 2) })}</li>
      <li>${t('mat.petg', { d: fmt(DENSITY.PETG, 2) })}</li>
      <li>${t('mat.asa', { d: fmt(DENSITY.ASA, 2) })}</li>
    </ul>
    <p class="notes">${t('parts.orientation')}</p>`;
}

function renderBom() {
  const pane = document.getElementById('pane-bom');
  if (!result || !result.bom.length) { pane.innerHTML = `<p class="notes">${t('bom.empty')}</p>`; return; }
  const p = params;
  const rows = result.bom.map(b => `<tr><td class="n">${esc(b.qty)}</td><td>${esc(b.item)}</td><td style="color:var(--ink-2)">${esc(b.note)}</td></tr>`).join('');
  const joint = result.info.pieces > 1 ? [t('asm.joint')] : [];
  const bend = p.bend && result.info.bendAngle ? [t('asm.bend', { a: fmt(result.info.bendAngle, 1) })] : [];
  const psu = p.psu ? [t(p.psuType === 'box' ? (result.info.psuOne ? 'asm.psu.boxOne' : 'asm.psu.box') : 'asm.psu.bracket')] : [];
  const extra = [
    ...(p.brace ? [t(p.mode === 'alu' ? 'asm.brace.alu' : 'asm.brace.print')] : []),
    ...(p.back ? [t('asm.back')] : []),
    ...(p.clips.length ? [t('asm.clip.insert'),
      ...(p.clips.some(c => c.type !== 'bayonet') ? [t('asm.clip.spring')] : []),
      ...(p.clips.some(c => c.type === 'bayonet') ? [t('asm.clip.bayonet')] : [])] : []),
    ...(hasText(p) && p.textHi ? [t(p.textMode === 'emboss' ? 'asm.text.emboss' : 'asm.text.engrave')] : []),
  ];
  const steps = p.mode === 'alu' ? [
    t('asm.alu.cut', { len: fmt(result.info.railLen), tap: PROFILES[p.profile].tap }),
    ...joint,
    ...bend,
    t(result.info.supports ? 'asm.alu.tnuts.sup' : 'asm.alu.tnuts'),
    t('asm.alu.caps'),
    ...psu,
    ...extra,
    t('asm.alu.feet'),
  ] : p.mode === 'plate' ? [
    ...joint,
    ...bend,
    t('asm.plate.strips'),
    t('asm.plate.screw'),
    ...psu,
    ...extra,
    t('asm.plate.feet'),
  ] : [
    ...joint,
    ...bend,
    t(p.dovetail ? 'asm.print.rails.dt' : 'asm.print.rails'),
    t(p.dovetail ? 'asm.print.caps.dt' : 'asm.print.caps'),
    ...psu,
    ...extra,
    t('asm.print.feet'),
  ];

  pane.innerHTML = `<div class="tablewrap"><table><thead><tr><th class="n">${t('bom.th.qty')}</th><th>${t('bom.th.item')}</th><th>${t('bom.th.note')}</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="notes" style="margin-top:14px"><b style="color:var(--ink)">${t('bom.assembly')}</b></p><ol class="notes">${steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`;
}

function renderMsgs() {
  const pane = document.getElementById('pane-msgs'), cnt = document.getElementById('c-msgs');
  const e = result ? result.errors : [], w = result ? result.warnings : [];
  cnt.textContent = e.length + w.length;
  cnt.className = 'count' + (e.length ? ' bad' : w.length ? ' warn' : '');
  const items = [...e.map(m => `<div class="msg bad">${esc(m)}</div>`), ...w.map(m => `<div class="msg warn">${esc(m)}</div>`)];
  if (!items.length && result) {
    const i = result.info;
    items.push(`<div class="msg ok">${t('msg.allFit', { x: params.bedX, y: params.bedY, z: params.bedZ })}
      ${i.pieces > 1 ? t('msg.piecesSplit', { n: i.pieces }) : t('msg.piecesOne')}
      ${params.mode !== 'alu' ? t(params.mode === 'plate' ? 'msg.longestPlate' : 'msg.longestRail', { len: fmt(i.maxRail), bays: i.bays }) : ''}
      ${t('msg.gap', { g: fmt(i.gap, 1) })}</div>`);
  }
  pane.innerHTML = `<div class="msgs">${items.join('')}</div>`;
}

function setTab(t) {
  tab = t;
  for (const id of ['parts', 'plates', 'bom', 'draw', 'msgs']) {
    document.getElementById('tab-' + id).setAttribute('aria-selected', String(id === t));
    document.getElementById('pane-' + id).hidden = id !== t;
  }
}
for (const id of ['parts', 'plates', 'bom', 'draw', 'msgs']) document.getElementById('tab-' + id).addEventListener('click', () => {
  setTab(id);
  if (id === 'plates' && viewMode !== 'plates') showPlates();
});

// ------------------------------------------------------------------ Druckplatten-Liste und 3MF
function renderPlates() {
  const pane = document.getElementById('pane-plates');
  document.getElementById('c-plates').textContent = plates.length;
  if (!plates.length) { pane.innerHTML = `<p class="notes">${t('plates.none')}</p>`; return; }
  const usable = (params.bedX - 2 * params.bedMargin) * (params.bedY - 2 * params.bedMargin);
  const rows = plates.map((pl, j) => {
    const names = new Map();
    for (const it of pl.items) { const n = result.parts[it.i].name; names.set(n, (names.get(n) || 0) + 1); }
    const list = [...names].map(([n, c]) => `${c}× ${esc(n)}`).join(', ');
    return `<tr class="${plateSel === j ? 'sel' : ''}"><td class="n">${j + 1}</td>
      <td><button type="button" class="linkbtn" data-plate="${j}">${tn('plates.parts', pl.items.length)}</button>
      <div style="color:var(--ink-2);font-size:13px">${list}</div></td>
      <td class="n">${fmt(Math.min(100, pl.area / usable * 100))} %</td>
      <td><button type="button" class="btn" data-3mf="${j}">3MF</button></td></tr>`;
  }).join('');
  pane.innerHTML = `<div class="drawbar"><button type="button" class="btn" id="plates-all">${t('plates.showAll')}</button>
    <button type="button" class="btn primary" id="plates-3mf">${t('plates.all3mf')}</button>
    <button type="button" class="btn" id="plates-zip">${t('plates.zip')}</button>
    <span class="notes">${t('plates.note', { count: tn('plates.count', plates.length), bed: slicerBed().join(' × ') })}</span></div>
    <div class="tablewrap"><table><thead><tr><th class="n">${t('plates.th.plate')}</th><th>${t('plates.th.content')}</th><th class="n">${t('plates.th.fill')}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
document.getElementById('pane-plates').addEventListener('click', async e => {
  const v = e.target.closest('[data-plate]'); if (v) showPlates(+v.dataset.plate);
  if (e.target.closest('#plates-all')) showPlates();
  const d = e.target.closest('[data-3mf]');
  if (d) { const j = +d.dataset['3mf']; await withBusy(async () => save(await threeMF([j]), `pedalboard_${params.W}x${params.D}_${t('file.plate')}_${j + 1}.3mf`)); }
  if (e.target.closest('#plates-3mf')) await withBusy(async () => save(await threeMF(plates.map((_, j) => j)), `pedalboard_${params.W}x${params.D}_${t('file.plates')}.3mf`));
  if (e.target.closest('#plates-zip')) await withBusy(async () => {
    const zip = new JSZip();
    for (let j = 0; j < plates.length; j++) zip.file(`${t('file.plate')}_${j + 1}.3mf`, await threeMF([j]));
    save(await zip.generateAsync({ type: 'blob' }), `pedalboard_${params.W}x${params.D}_${t('file.platesSingle')}.zip`);
  });
});
async function withBusy(fn) {
  busy.textContent = t('busy.3mf'); busy.hidden = false;
  try { await fn(); } finally { busy.hidden = true; busy.textContent = t('busy.calc'); }
}

// Vorschaubilder je Platte (512×512 PNG): Schrägansicht und Draufsicht, wie sie der Slicer in der Plattenliste zeigt
let thumbR = null;
async function plateThumbs(pl) {
  if (!thumbR) {
    thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    thumbR.setPixelRatio(1); thumbR.setSize(512, 512, false);
  }
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 1.6));
  const l1 = new THREE.DirectionalLight(0xffffff, 1.8); l1.position.set(-400, -700, 1000); sc.add(l1);
  const g = new THREE.Group(); sc.add(g);
  addBed(g, 0, 0);
  const parts = new THREE.Group(); g.add(parts);
  plateMeshes(parts, pl, 0, 0);
  const bx = params.bedX, by = params.bedY;
  const shot = async (cam) => {
    thumbR.render(sc, cam);
    const blob = await new Promise(res => thumbR.domElement.toBlob(res, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  };
  // Schrägansicht: Teile bildfüllend
  const box = new THREE.Box3().setFromObject(parts.children.length ? parts : g);
  const c = box.getCenter(new THREE.Vector3()), r = Math.max(20, box.getSize(new THREE.Vector3()).length() * 0.5);
  const persp = new THREE.PerspectiveCamera(30, 1, 1, 20000); persp.up.set(0, 0, 1);
  persp.position.copy(c).addScaledVector(new THREE.Vector3(-0.55, -1, 0.85).normalize(), r / Math.sin(THREE.MathUtils.degToRad(15)) * 1.05);
  persp.lookAt(c);
  const plate = await shot(persp);
  // Draufsicht: ganze Platte, orthografisch
  const s = Math.max(bx, by) / 2;
  const ortho = new THREE.OrthographicCamera(-s, s, s, -s, 1, 5000); ortho.up.set(0, 1, 0);
  ortho.position.set(bx / 2, by / 2, 2000); ortho.lookAt(bx / 2, by / 2, 0);
  const top = await shot(ortho);
  clear(g);
  return { plate, top };
}

const slicerBed = () => [params.slicerX > 0 ? Math.max(params.slicerX, params.bedX) : params.bedX, params.slicerY > 0 ? Math.max(params.slicerY, params.bedY) : params.bedY];
// Eine 3MF-Datei mit allen gewählten Platten (Plattenzuordnung, Namen, Vorschaubilder; Schrift-Einlage als 2. Filament)
async function threeMF(idx) {
  const sel = idx.map(j => plates[j]);
  const parts = result.parts.map(pt => ({ name: pt.name, mesh: pt.mesh, inlay: pt.inlay, role: partRole(pt) }));
  // Der Slicer rastert die Platten mit SEINER Bettgröße; die Belegung wird darauf mittig gesetzt
  const [sx, sy] = slicerBed();
  const dx = (sx - params.bedX) / 2, dy = (sy - params.bedY) / 2;
  const named = sel.map((pl, k) => {
    const names = [...new Set(pl.items.map(it => result.parts[it.i].short))];
    const nm = t('threemf.plateName', { n: idx[k] + 1, names: names.slice(0, 2).join(', ') + (names.length > 2 ? ' …' : '') });
    return { name: nm, items: pl.items.map(it => ({ part: it.i, rot: it.rot, tx: it.tx + dx, ty: it.ty + dy, w: it.w, h: it.h })) };
  });
  const thumbs = [];
  for (const pl of sel) thumbs.push(await plateThumbs(pl));
  const files = build3MF(named, parts, {
    bedX: sx, bedY: sy, thumbs, locale: getLocale(), inlaySuffix: t('threemf.inlaySuffix'), description: t('threemf.description', { plates: tn('threemf.nPlates', sel.length) }),
    title: t('threemf.title', { w: params.W, d: params.D, what: sel.length === 1 ? t('threemf.onePlate', { n: idx[0] + 1 }) : tn('threemf.nPlates', sel.length) }),
    colors: Object.fromEntries(['printed', 'rail', 'brace', 'panel', 'text', 'clip'].map(r => [r, look[r]])),
  });
  const zip = new JSZip();
  for (const [k, v] of Object.entries(files)) zip.file(k, v, { createFolders: false });
  return zip.generateAsync({ type: 'blob', mimeType: 'model/3mf', compression: 'DEFLATE' });
}

// ------------------------------------------------------------------ Gespeicherte Konfigurationen (nur lokal im Browser, kein Server)
const SAVES_STORE = 'pedalboard-saves-v1';
const loadSaves = () => { try { return JSON.parse(localStorage.getItem(SAVES_STORE) || '{}'); } catch (e) { return {}; } };
const writeSaves = saves => { try { localStorage.setItem(SAVES_STORE, JSON.stringify(saves)); } catch (e) { /* ohne Speicher */ } };
function buildSaves() {
  const box = document.getElementById('saves');
  box.innerHTML = `<summary>${t('saves.title')}</summary>
    <div class="fields">
      <div class="field wide">
        <label for="save-name">${t('saves.name')}<small>${t('saves.name.hint')}</small></label>
        <div class="save-row"><input id="save-name" type="text" maxlength="50" placeholder="${t('saves.placeholder')}"><button type="button" class="btn primary" id="save-add">${t('saves.save')}</button></div>
      </div>
    </div>
    <ul class="save-list" id="save-list"></ul>
    <div class="save-io">
      <button type="button" class="btn" id="save-export">${t('saves.export')}</button>
      <button type="button" class="btn" id="save-import">${t('saves.import')}</button>
      <input type="file" id="save-file" accept="application/json" hidden>
    </div>`;
  const nameEl = document.getElementById('save-name');
  document.getElementById('save-add').addEventListener('click', () => {
    const name = nameEl.value.trim();
    if (!name) { nameEl.focus(); return; }
    const saves = loadSaves();
    saves[String(Date.now())] = { name, savedAt: new Date().toISOString(), params: JSON.parse(JSON.stringify(params)), look: JSON.parse(JSON.stringify(look)) };
    writeSaves(saves);
    nameEl.value = '';
    renderSaves();
  });
  nameEl.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('save-add').click(); });
  document.getElementById('save-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(loadSaves(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = t('file.saves'); a.click();
    URL.revokeObjectURL(a.href);
  });
  document.getElementById('save-import').addEventListener('click', () => document.getElementById('save-file').click());
  document.getElementById('save-file').addEventListener('change', async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const saves = loadSaves();
      for (const v of Object.values(data)) {
        if (v && v.name && v.params) saves[String(Date.now()) + Math.random().toString(36).slice(2, 6)] = v;
      }
      writeSaves(saves);
      renderSaves();
    } catch (err) { alert(t('saves.readError', { msg: err.message })); }
  });
  renderSaves();
}
function renderSaves() {
  const list = document.getElementById('save-list');
  const saves = loadSaves();
  const entries = Object.entries(saves).sort((a, b) => (b[1].savedAt || '').localeCompare(a[1].savedAt || ''));
  if (!entries.length) { list.innerHTML = `<li class="save-empty">${t('saves.none')}</li>`; return; }
  list.innerHTML = entries.map(([id, v]) => `
    <li class="save-item" data-id="${id}">
      <span class="save-name" title="${esc(v.name)}">${esc(v.name)}</span>
      <span class="save-date">${fmtDateTime(v.savedAt)}</span>
      <button type="button" data-act="load">${t('saves.load')}</button>
      <button type="button" data-act="del">${t('saves.delete')}</button>
    </li>`).join('');
  list.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    const id = b.closest('.save-item').dataset.id;
    const saves = loadSaves();
    const entry = saves[id]; if (!entry) return;
    if (b.dataset.act === 'load') {
      params = { ...fresh(), ...entry.params };
      if (!Array.isArray(params.clips)) params.clips = [];
      if (params.slicerDiffers === undefined) params.slicerDiffers = !!(params.slicerX || params.slicerY);
      clipSel = -1;
      if (entry.look) { for (const k of Object.keys(look)) delete look[k]; Object.assign(look, { scheme: 'hellfire', ...SCHEMES.hellfire, transparent: false, opacity: 0.35 }, entry.look); lookChanged(); }
      changed();
    } else if (b.dataset.act === 'del') {
      if (!confirm(t('saves.confirmDelete', { name: entry.name }))) return;
      delete saves[id]; writeSaves(saves); renderSaves();
    }
  }));
}

// ------------------------------------------------------------------ Darstellung: Farbschema, Einzelfarben, Transparenz
function buildLook() {
  const box = document.getElementById('look');
  box.innerHTML = `<summary>${t('look.title')}</summary><div class="fields">
    <div class="field"><label for="look-scheme">${t('look.scheme')}</label><select id="look-scheme">
      ${Object.keys(SCHEMES).map(k => `<option value="${k}">${t('scheme.' + k)}</option>`).join('')}<option value="custom">${t('look.custom')}</option></select></div>
    ${LOOK_KEYS.map(k => `<div class="field"><label for="look-${k}">${t('look.' + k)}</label><input type="color" id="look-${k}"></div>`).join('')}
    <div class="field check"><label for="look-transparent">${t('look.transparent')}<small>${t('look.transparent.hint')}</small></label><input type="checkbox" id="look-transparent"></div>
    <div class="field"><label for="look-opacity">${t('look.opacity')}</label><input type="range" id="look-opacity" min="0.1" max="0.8" step="0.05"></div>
  </div>`;
  box.addEventListener('input', onLook);
  box.addEventListener('change', onLook);
}
function syncLook() {
  document.getElementById('look-scheme').value = look.scheme;
  for (const k of LOOK_KEYS) document.getElementById('look-' + k).value = look[k];
  document.getElementById('look-transparent').checked = look.transparent;
  document.getElementById('look-opacity').value = look.opacity;
  document.getElementById('look-opacity').closest('.field').hidden = !look.transparent;
  document.getElementById('toggle-tr').setAttribute('aria-pressed', String(look.transparent));
}
function onLook(e) {
  const id = e.target.id;
  if (id === 'look-scheme') { if (SCHEMES[e.target.value]) Object.assign(look, SCHEMES[e.target.value]); look.scheme = e.target.value; }
  else if (id === 'look-transparent') look.transparent = e.target.checked;
  else if (id === 'look-opacity') look.opacity = +e.target.value;
  else if (id.startsWith('look-')) { look[id.slice(5)] = e.target.value; look.scheme = 'custom'; }
  lookChanged();
}
function lookChanged() {
  try { localStorage.setItem(LOOK_STORE, JSON.stringify(look)); } catch (e) { /* ohne Speicher */ }
  applyLook(); syncLook(); updateHud();
}
document.getElementById('toggle-tr').addEventListener('click', () => { look.transparent = !look.transparent; lookChanged(); });

// ------------------------------------------------------------------ Zeichnung
let drawingSvg = null;
function renderDrawing() {
  const box = document.getElementById('draw-preview'), info = document.getElementById('draw-info');
  drawingSvg = result && result.drawing ? buildDrawing(result, params) : null;
  document.getElementById('draw-svg').disabled = document.getElementById('draw-pdf').disabled = !drawingSvg;
  if (!drawingSvg) { box.innerHTML = ''; info.textContent = t('draw.empty'); return; }
  box.innerHTML = drawingSvg.replace(/^<\?xml[^>]*>\s*/, '');
  info.textContent = t('draw.info');
}
document.getElementById('draw-svg').addEventListener('click', () => {
  if (drawingSvg) save(new Blob([drawingSvg], { type: 'image/svg+xml' }), `pedalboard_${params.W}x${params.D}_${t('file.drawing')}.svg`);
});
document.getElementById('draw-pdf').addEventListener('click', () => {
  if (!drawingSvg) return;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${t('draw.printTitle', { w: params.W, d: params.D })}</title>
    <style>@page{size:A3 landscape;margin:0}html,body{margin:0}svg{width:420mm;height:297mm;display:block}</style></head>
    <body>${drawingSvg.replace(/^<\?xml[^>]*>\s*/, '')}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
});
document.getElementById('toggle-hw').addEventListener('click', e => {
  showHw = !showHw;
  e.currentTarget.setAttribute('aria-pressed', String(showHw));
  for (const c of asmGroup.children) if (c.userData.hw) c.visible = showHw;
  updateHud();
});

document.getElementById('pane-parts').addEventListener('click', e => {
  const s = e.target.closest('[data-show]'); if (s) showBed(+s.dataset.show);
  const d = e.target.closest('[data-stl]'); if (d) { const pt = result.parts[+d.dataset.stl]; save(new Blob([stl(pt)], { type: 'model/stl' }), fileName(pt) + '.stl'); }
  const dt = e.target.closest('[data-stlt]'); if (dt) { const pt = result.parts[+dt.dataset.stlt]; save(new Blob([stl({ name: pt.name + ' ' + t('file.inlayName'), mesh: pt.inlay })], { type: 'model/stl' }), fileName(pt) + `_${t('file.inlay')}.stl`); }
});

// ------------------------------------------------------------------ Export
function stl(part) {
  const { positions: P, indices: I } = part.mesh;
  const nt = I.length / 3;
  const buf = new ArrayBuffer(84 + nt * 50), dv = new DataView(buf);
  const head = 'Parametric Pedalboard - ' + part.name;
  for (let i = 0; i < 80; i++) dv.setUint8(i, i < head.length ? head.charCodeAt(i) & 0x7f : 32);
  dv.setUint32(80, nt, true);
  let o = 84;
  for (let t = 0; t < nt; t++) {
    const a = I[3 * t] * 3, b = I[3 * t + 1] * 3, c = I[3 * t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const v of [nx, ny, nz]) { dv.setFloat32(o, v, true); o += 4; }
    for (const idx of [a, b, c]) for (let k = 0; k < 3; k++) { dv.setFloat32(o, P[idx + k], true); o += 4; }
    dv.setUint16(o, 0, true); o += 2;
  }
  return buf;
}

document.getElementById('step-all').addEventListener('click', () => exportStep(result, 'parts'));
document.getElementById('step-assembly').addEventListener('click', () => exportStep(result, 'assembly'));
document.getElementById('step-multibody').addEventListener('click', () => exportStep(result, 'multibody'));
document.addEventListener('click', e => {
  const button = e.target.closest('[data-step]');
  if (button) exportStep(result, Number(button.dataset.step));
});
function fileName(pt) {
  return pt.name.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + (pt.qty > 1 ? `_x${pt.qty}` : '');
}
function save(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
document.getElementById('zip').addEventListener('click', async () => {
  if (!result || !result.parts.length) return;
  const zip = new JSZip();
  for (const pt of result.parts) {
    zip.file(fileName(pt) + '.stl', stl(pt));
    if (pt.inlay) zip.file(fileName(pt) + `_${t('file.inlay')}.stl`, stl({ name: pt.name + ' ' + t('file.inlayName'), mesh: pt.inlay }));
  }
  const bomTxt = [t('bomtxt.head', { w: params.W, d: params.D, mode: t(params.mode === 'alu' ? 'bomtxt.modeB' : params.mode === 'plate' ? 'bomtxt.modeC' : 'bomtxt.modeA') }), '',
    t('bomtxt.printed'), ...result.parts.map(pt => `${pt.qty} x ${pt.name}  (${pt.size.map(v => v.toFixed(1)).join(' x ')} mm)`), '',
    t('bomtxt.bought'), ...result.bom.map(b => `${b.qty} x ${b.item}  -- ${b.note}`)].join('\r\n');
  zip.file(t('file.bomTxt'), bomTxt);
  zip.file('parameter.json', JSON.stringify(params, null, 2));
  if (drawingSvg) zip.file(t('file.drawingSvg'), drawingSvg);
  if (plates.length) zip.file(`${t('file.plates')}_${params.W}x${params.D}.3mf`, await threeMF(plates.map((_, j) => j)));
  const blob = await zip.generateAsync({ type: 'blob' });
  save(blob, `pedalboard_${params.W}x${params.D}_${params.mode}.zip`);
});

// ------------------------------------------------------------------ Schriftzug: Schriftart laden, Text in Konturen umsetzen
const fontCache = new Map(), fontFail = new Set();
async function loadFont(key) {
  if (fontCache.has(key)) return fontCache.get(key);
  const res = await fetch(`https://cdn.jsdelivr.net/npm/@fontsource/${key}@5/files/${key}-latin-400-normal.woff`);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const font = window.opentype.parse(await res.arrayBuffer());
  fontCache.set(key, font);
  return font;
}
// Konturen in Einheiten der Versalhöhe, Grundlinie bei 0, y nach oben
function shapeLine(text, key) {
  const f = fontCache.get(key);
  if (!f) return null;
  let cap = f.tables.os2 && f.tables.os2.sCapHeight;
  if (!cap) { const bb = f.charToGlyph('H').getBoundingBox(); cap = bb.y2 - bb.y1 || f.unitsPerEm * 0.7; }
  const path = f.getPath(text, 0, 0, f.unitsPerEm, { kerning: true });
  const polys = [];
  let cur = null, px = 0, py = 0;
  const pt = (x, y) => { cur.push([x / cap, -y / cap]); px = x; py = y; };
  const close = () => {
    if (cur && cur.length > 2) {
      const [a, b] = [cur[0], cur[cur.length - 1]];
      if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) cur.pop();
      if (cur.length > 2) polys.push(cur);
    }
    cur = null;
  };
  for (const c of path.commands) {
    if (c.type === 'M') { close(); cur = []; pt(c.x, c.y); }
    else if (!cur) continue;
    else if (c.type === 'L') pt(c.x, c.y);
    else if (c.type === 'Q') {
      const x0 = px, y0 = py;
      for (let k = 1; k <= 6; k++) { const t = k / 6, u = 1 - t; pt(u * u * x0 + 2 * u * t * c.x1 + t * t * c.x, u * u * y0 + 2 * u * t * c.y1 + t * t * c.y); }
    } else if (c.type === 'C') {
      const x0 = px, y0 = py;
      for (let k = 1; k <= 8; k++) {
        const t = k / 8, u = 1 - t;
        pt(u * u * u * x0 + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x, u * u * u * y0 + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y);
      }
    } else if (c.type === 'Z') close();
  }
  close();
  let x0 = Infinity, x1 = -Infinity;
  for (const pg of polys) for (const [x] of pg) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
  return polys.length ? { polys, x0, x1 } : { polys: [], x0: 0, x1: 0 };
}
setTextShaper(shapeLine);

// ------------------------------------------------------------------ Berechnung
let timer = null;
const busy = document.getElementById('busy');
function schedule() {
  clearTimeout(timer);
  busy.hidden = false;
  timer = setTimeout(run, 220);
}
let firstRun = true;
async function run() {
  if (hasText(params) && !fontCache.has(params.textFont) && !fontFail.has(params.textFont)) {
    busy.hidden = false;
    try { await loadFont(params.textFont); } catch (err) { fontFail.add(params.textFont); console.warn('font', params.textFont, err); }
  }
  const prevView = viewMode, prevName = result && result.parts[selected] ? result.parts[selected].name : null;
  result = generate(params);
  busy.hidden = true;
  if (clipSel >= params.clips.length) clipSel = -1;
  renderClipEditor();
  buildAssembly();
  packPlates();
  renderParts(); renderBom(); renderDrawing(); renderPlates(); renderMsgs();
  document.getElementById('zip').disabled = !result.parts.length;
  if (result.errors.length && tab === 'parts' && !result.parts.length) setTab('msgs');
  const idx = prevName ? result.parts.findIndex(x => x.name === prevName) : -1;
  if (prevView === 'plates') showPlates(plateSel !== null && plateSel < plates.length ? plateSel : null);
  else if (prevView === 'bed' && idx >= 0) showBed(idx);
  else { if (prevView === 'bed') showAssembly(); if (firstRun) frame('iso'); updateHud(); }
  firstRun = false;
}
function rebuildView() { buildAssembly(); if (viewMode === 'bed') showBed(selected); else if (viewMode === 'plates') showPlates(plateSel); updateHud(); }

buildForm();
syncForm();
buildLook();
syncLook();
buildSaves();
renderClipEditor();
busy.hidden = false;
initGeometry().then(run).catch(err => {
  busy.textContent = t('err.geometryLoad', { msg: err.message });
  console.error(err);
});

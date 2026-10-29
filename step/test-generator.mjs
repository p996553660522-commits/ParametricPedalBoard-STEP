import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { initI18n } from '../js/i18n.js';
import * as current from '../js/pedalboard.js';
import { stepRequest } from '../js/step-recorder.js';

const upstream = '744bc93ae3c00bf745d0f7cbb07ec1cc33c6ff18';
const baselinePath = new URL('../js/pedalboard.baseline.js', import.meta.url);
fs.writeFileSync(baselinePath, execFileSync('git', ['show', `${upstream}:js/pedalboard.js`]));
await initI18n('en', async () => (await import('../js/lang/en.js')).default);
const baseline = await import(baselinePath.href);
await baseline.initGeometry();
await current.initGeometry();
const cases = {
  default: {},
  aluminium: { mode: 'alu', profile: '2040', psuType: 'bracket' },
  plate: { mode: 'plate', clips: [{ size: '1590b', type: 'spring' }, { size: 'mini', type: 'bayonet', rot: true }] },
  bent: { bend: true, bendAngle: 12, psuOne: true },
  tiers: { tiers: 3, W: 500, psuTier: 2 },
  text: { text: 'O', textMode: 'engrave', textHi: true },
};
const shaper = () => ({ polys: [[[0,0],[1,0],[1,1],[0,1]], [[0.3,0.3],[0.3,0.7],[0.7,0.7],[0.7,0.3]]], x0: 0, x1: 1 });
baseline.setTextShaper(shaper);
current.setTextShaper(shaper);
const hash = r => createHash('sha256').update(JSON.stringify(r, (k, v) => ['step', 'stepGraph'].includes(k) ? undefined : v)).digest('hex');
function metrics(mesh) {
  const p = mesh.positions, t = mesh.indices;
  const lo = [Infinity,Infinity,Infinity], hi = [-Infinity,-Infinity,-Infinity];
  for(let i=0; i<p.length; i++) { lo[i%3]=Math.min(lo[i%3],p[i]); hi[i%3]=Math.max(hi[i%3],p[i]); }
  let volume=0;
  for(let i=0; i<t.length; i+=3) {
    const a=t[i]*3,b=t[i+1]*3,c=t[i+2]*3;
    volume += (p[a]*(p[b+1]*p[c+2]-p[b+2]*p[c+1]) + p[a+1]*(p[b+2]*p[c]-p[b]*p[c+2]) + p[a+2]*(p[b]*p[c+1]-p[b+1]*p[c]))/6;
  }
  return { bounds: [...lo,...hi], volume: Math.abs(volume) };
}
fs.mkdirSync('step-output/fixtures', {recursive:true});
try {
  for (const [name, params] of Object.entries(cases)) {
    const old = baseline.generate(params), result = current.generate(params);
    assert.deepEqual(result.errors, []);
    assert.equal(hash(result), hash(old), `${name}: original output changed`);
    const job=stepRequest(result);
    job.parts.forEach((p,i) => { p.reference=metrics(result.parts[i].mesh); });
    job.assembly.forEach((p,i) => { p.reference=metrics(result.assembly[i].mesh); });
    fs.writeFileSync(`step-output/fixtures/${name}.json`, JSON.stringify(job));
    console.log(`PASS unchanged geometry: ${name}, ${job.parts.length} parts, ${job.assembly.length} assembly components`);
  }
} finally { fs.unlinkSync(baselinePath); }
process.exit(0);

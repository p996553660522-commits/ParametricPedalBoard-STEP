import { stepRequest } from './step-recorder.js';
import { getLang } from './i18n.js';

async function browserExport(job,status) {
  const worker=new Worker(new URL('./step-worker.js',import.meta.url),{type:'module'});
  try {
    const result=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('CAD export timed out after 5 minutes.')),300000);
      worker.onmessage=({data})=>{
        if(data.progress) {status.textContent=data.progress;return;}
        clearTimeout(timer);
        if(data.error) reject(new Error(data.error)); else resolve(data);
      };
      worker.onerror=e=>{clearTimeout(timer);reject(new Error(e.message || 'CAD worker failed to load.'));};
      worker.postMessage(job);
    });
    if(result.files.length===1) return result.files[0];
    const zip=new window.JSZip();
    for(const file of result.files) zip.file(file.name,file.blob);
    zip.file('manifest.json',JSON.stringify({units:'mm',parts:result.quantities},null,2));
    return {name:'Pedalboard-parts-STEP.zip',blob:await zip.generateAsync({type:'blob'})};
  } finally {worker.terminate();}
}

export async function exportStep(result, selection = 'assembly') {
  const status = document.getElementById('step-status');
  const de = getLang() === 'de';
  const buttons = [...document.querySelectorAll('[data-step], #step-all, #step-assembly, #step-multibody')];
  buttons.forEach(b => b.disabled = true);
  try {
    if (!result || !result.parts.length) throw new Error(de ? 'Bitte zuerst ein Board erzeugen.' : 'Generate a board first.');
    status.textContent = de ? 'STEP wird berechnet …' : 'Building CAD solids and STEP …';
    const job=stepRequest(result,selection);
    let file;
    if (!['localhost','127.0.0.1'].includes(location.hostname) || location.pathname.includes('/_site/')) {
      file=await browserExport(job,status);
    } else {
    const response = await fetch('/api/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(stepRequest(result, selection)) });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || 'Start the configurator with start-step.bat (STEP backend unavailable).');
    }
    const filename = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '');
    file={name:filename ? filename[1] : 'Pedalboard-STEP.zip',blob:await response.blob()};
    }
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    status.textContent = de ? 'STEP-Export fertig.' : 'STEP export complete.';
  } catch (e) {
    status.textContent = e.message;
  } finally {
    buttons.forEach(b => b.disabled = false);
  }
}

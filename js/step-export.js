import { stepRequest } from './step-recorder.js';
import { getLang } from './i18n.js';

export async function exportStep(result, selection = 'assembly') {
  const status = document.getElementById('step-status');
  const de = getLang() === 'de';
  const buttons = [...document.querySelectorAll('[data-step], #step-all, #step-assembly, #step-multibody')];
  buttons.forEach(b => b.disabled = true);
  try {
    if (!result || !result.parts.length) throw new Error(de ? 'Bitte zuerst ein Board erzeugen.' : 'Generate a board first.');
    if (!['localhost', '127.0.0.1'].includes(location.hostname)) {
      throw new Error(de ? 'STEP benötigt das lokale CAD-Backend: siehe STEP.md / start-step.bat.' : 'STEP requires the local CAD backend: see STEP.md / start-step.bat.');
    }
    status.textContent = de ? 'STEP wird berechnet …' : 'Building CAD solids and STEP …';
    const response = await fetch('/api/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(stepRequest(result, selection)) });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || 'Start the configurator with start-step.bat (STEP backend unavailable).');
    }
    const url = URL.createObjectURL(await response.blob());
    const a = document.createElement('a');
    a.href = url;
    const filename = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '');
    a.download = filename ? filename[1] : 'Pedalboard-STEP.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    status.textContent = de ? 'STEP-Export fertig.' : 'STEP export complete.';
  } catch (e) {
    status.textContent = e.message;
  } finally {
    buttons.forEach(b => b.disabled = false);
  }
}

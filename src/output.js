/* ---------- clean output window ----------
   A second window holding only the picture. The preview paints into it every frame, before the panel guides go on. */
let outWin = null, outCv = null, outG = null;
const outLive = () => !!(outWin && !outWin.closed && outCv);
function outOpen() {
  if (outLive()) { outWin.focus(); return true; }
  outWin = window.open('', 'mallcall-output', 'width=960,height=540');
  if (!outWin) { $('outNote').textContent = 'The window was blocked. Allow pop-ups for this page and press the button again.'; return false; }
  const d = outWin.document;
  d.title = 'Mall Call Output';
  d.documentElement.style.cssText = 'height:100%;background:#000';
  d.body.style.cssText = 'margin:0;height:100%;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center';
  d.body.textContent = '';
  outCv = d.createElement('canvas'); outG = outCv.getContext('2d', { alpha: false });
  d.body.append(outCv);
  d.addEventListener('dblclick', () => {
    if (window.nativeApp) window.nativeApp.outputPlace($('outDisp').value === 'window' ? 'toggle' : $('outDisp').value);
    else if (d.fullscreenElement) d.exitFullscreen(); else d.documentElement.requestFullscreen().catch(() => {});
  });
  outWin.addEventListener('pagehide', () => { outCv = null; outG = null; setTimeout(outSync, 0); });
  pscale = 1; slowFrames = 0; sizeStage();
  outSync();
  return true;
}
function outSync() {
  $('outOpen').textContent = outLive() ? 'Close output window' : 'Open output window';
  if (!outLive()) return;
  outCv.style.cssText = S.outFit === 'none' ? 'image-rendering:pixelated' : 'width:100%;height:100%;object-fit:' + S.outFit;
  outWin.document.body.style.cursor = 'none';
}
// called from paint with the finished frame
function outFrame() {
  if (!outLive()) return;
  if (outCv.width !== stage.width || outCv.height !== stage.height) { outCv.width = stage.width; outCv.height = stage.height; }
  outG.drawImage(stage, 0, 0);
}
$('outOpen').addEventListener('click', () => { if (outLive()) { outWin.close(); outWin = null; outCv = null; outSync(); } else outOpen(); });
$('outFit').addEventListener('change', e => { S.outFit = e.target.value; outSync(); touch(); });
addEventListener('pagehide', () => { if (outWin && !outWin.closed) outWin.close(); });
if (window.nativeApp && window.nativeApp.outputDisplays) {
  const fill = async () => {
    const list = await window.nativeApp.outputDisplays(), box = $('outDisp'), keep = box.value;
    box.textContent = '';
    const add = (v, n) => { const o = document.createElement('option'); o.value = v; o.textContent = n; box.append(o); };
    add('window', 'A window');
    list.forEach((s, i) => add(String(i), 'Screen ' + (i + 1) + ', ' + s.width + ' × ' + s.height + (s.primary ? ' (main)' : '')));
    box.value = [...box.options].some(o => o.value === keep) ? keep : 'window';
    $('outDispRow').hidden = false;
  };
  fill();
  $('outDisp').addEventListener('focus', fill);
  $('outDisp').addEventListener('change', e => { if (outLive() || outOpen()) window.nativeApp.outputPlace(e.target.value); });
}

/* ---------- timecode settings ---------- */
function tcPush() {
  $('tcRate').value = S.tcRate; $('tcShow').checked = S.tcShow;
  $('tcStart').value = tcString(S.tcStart, TC_RATES[S.tcRate]);
}
$('tcRate').addEventListener('change', e => {
  const was = TC_RATES[S.tcRate], c = framesToTc(S.tcStart, was);
  S.tcRate = e.target.value;
  const R = TC_RATES[S.tcRate];
  S.tcStart = tcToFrames(c.h, c.m, c.s, Math.min(c.f, R.fps - 1), R);       // keep the same clock time at the new rate
  tcPush(); syncUI();
});
$('tcStart').addEventListener('change', e => { const n = parseTc(e.target.value, TC_RATES[S.tcRate]); if (n !== null) S.tcStart = n; tcPush(); syncUI(); });
$('tcShow').addEventListener('change', e => { S.tcShow = e.target.checked; syncUI(); });

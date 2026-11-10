/* ---------- diagnostics: the app reporting on itself ----------
   So that whoever is helping does not need screenshots. The app keeps a short running record of how it is doing:
   timings, the settings that cost time, and anything that went wrong. Report copies it as text. In the Mac app the
   same record is also written every few seconds to a file in the project library folder (_diagnostics/latest.json);
   if that folder syncs somewhere the helper can read, they can fetch it themselves. Nothing is sent anywhere. */
const DIAG = { errors: [], hist: [], worst: 0, started: new Date().toISOString() };
addEventListener('error', e => { DIAG.errors.push({ at: new Date().toISOString(), msg: String(e.message).slice(0, 300), where: (e.filename || '').split('/').pop() + ':' + e.lineno }); if (DIAG.errors.length > 30) DIAG.errors.shift(); });
addEventListener('unhandledrejection', e => { DIAG.errors.push({ at: new Date().toISOString(), msg: 'promise: ' + String(e.reason && e.reason.message || e.reason).slice(0, 300) }); if (DIAG.errors.length > 30) DIAG.errors.shift(); });
function diagNow() {
  const d = dims(), P = parts[sel] ? parts[sel].P : {}, r = n => Math.round(n * 10) / 10, kinds = {};
  for (const e of score.all) kinds[e.type] = (kinds[e.type] || 0) + 1;
  return {
    build: BUILD, at: new Date().toISOString(), started: DIAG.started, macApp: !!window.nativeApp, shell: window.nativeApp ? Object.keys(window.nativeApp).length + ' bridge calls' : 'none',
    screen: innerWidth + 'x' + innerHeight + ' @' + (window.devicePixelRatio || 1), agent: navigator.userAgent.replace(/^.*?\((.*?)\).*?(Chrome\/[\d.]+).*?(Electron\/[\d.]+)?.*$/, '$1 $2 $3').trim(),
    playing: S.playing, time: r(tau) + ' / ' + r(score.D), sound: track ? track.name + ' ' + r(track.ab.duration) + ' s' : 'none',
    piece: d.W + 'x' + d.H + ' @' + S.fps, preview: stage.width + 'x' + stage.height + ' at ' + Math.round(paintFps) + ' fps (asked ' + S.pq + ')',
    frameMs: r(PERF.all), budgetMs: r(1000 / PREVIEW_FPS()), worstMs: r(DIAG.worst),
    whereMs: { layers: r(PERF.draw), base: r(PERF.layer[0]), glitch: r(PERF.layer[1]), logo: r(PERF.layer[2]), grade: r(PERF.grade), monitors: r(PERF.views), timeline: r(PERF.rest) },
    ring: { panels: S.panels, inside: S.panelsIn, faces: S.faces, gap: S.gap, panelPx: S.panelPx, view3d: S.view3d, webgl: typeof ringBad !== 'undefined' ? !ringBad : null },
    part: { n: sel + 1, of: parts.length, name: partName(sel), inner: P.inner, styles: [P.baseStyle, P.fxStyle, P.logoStyle], pixels: [r(P.baseDen), r(P.fxDen), r(P.logoDen)], dither: P.dither, mix: P.mix, busy: P.busy, glitch: P.glitch, lines: P.lines, lineMode: P.lineMode, logoMode: P.logoMode, logoEach: P.logoEach },
    grade: [S.gGain, S.gCon, S.gGam, S.gBlack], clips: { yours: userEv.length, auto: autoEv.length, kinds }, hits: score.hits, keys: Object.keys(auto).length,
    memoryMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, system: typeof statsSysNow === 'function' ? statsSysNow() : null,
    history: DIAG.hist.slice(-40), errors: DIAG.errors.slice(-12)
  };
}
// a line every five seconds while it plays: enough to see when it got slow and what was on screen
setInterval(() => {
  if (PERF.all > DIAG.worst) DIAG.worst = PERF.all;
  if (!S.playing || busy) return;
  DIAG.hist.push([Math.round(tau), Math.round(PERF.all), Math.round(paintFps), ST.lv, ST.bn, ST.pfN, ST.tyN + ST.syN].join(' '));
  if (DIAG.hist.length > 240) DIAG.hist.shift();
}, 5000);
function diagText() {
  const o = diagNow();
  return 'MALL CALL REPORT\n' + Object.entries(o).map(([k, v]) => k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v))).join('\n')
    + '\n(history lines: second, ms a frame, preview fps, logo state, base clips, pillar clips, words and symbols)';
}
{
  const say = t => { $('saveMsg').textContent = t; setTimeout(() => { if ($('saveMsg').textContent === t) $('saveMsg').textContent = ''; }, 6000); };
  $('reportBtn').replaceChildren(ic('info'), 'Report');
  $('reportBtn').addEventListener('click', async () => {
    const text = diagText();
    try { await navigator.clipboard.writeText(text); say('Report copied. Paste it in the chat'); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select(); try { document.execCommand('copy'); say('Report copied. Paste it in the chat'); } catch (x) { say('Could not copy the report'); } ta.remove(); }
  });
  if (window.nativeApp && window.nativeApp.diagWrite) setInterval(() => { try { window.nativeApp.diagWrite(JSON.stringify(diagNow())); } catch (e) {} }, 15000);
}

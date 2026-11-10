/* ---------- stats: how hard the machine is working ---------- */
let statsSys = null, statsTimer = 0;
function statsShow() {
  $('stats').hidden = !S.stats; $('statsBtn').setAttribute('aria-pressed', String(!!S.stats));
  clearInterval(statsTimer);
  if (!S.stats) return;
  const tick = async () => {
    if (window.nativeApp && window.nativeApp.metrics) { try { statsSys = await window.nativeApp.metrics(); } catch (e) {} }
    const f = n => n.toFixed(1).padStart(5), budget = 1000 / Math.min(60, S.fps), d = dims();
    const lines = ['FRAME     ' + f(PERF.all) + ' ms of ' + budget.toFixed(1) + (PERF.all > budget ? '  OVER' : ''),
      ' layers   ' + f(PERF.draw) + '   base ' + PERF.layer[0].toFixed(1) + '  glitch ' + PERF.layer[1].toFixed(1) + '  logo ' + PERF.layer[2].toFixed(1),
      ' grade    ' + f(PERF.grade), ' monitors ' + f(PERF.views), ' timeline ' + f(PERF.rest),
      'PREVIEW   ' + Math.round(paintFps) + ' fps at ' + stage.width + ' x ' + stage.height + (pscale < 1 ? ' (reduced)' : '') + ', piece is ' + d.W + ' x ' + d.H];
    if (statsSys) lines.push('PROCESSOR ' + Math.round(statsSys.cpu) + ' % of one core   page ' + Math.round(statsSys.page) + '  graphics ' + Math.round(statsSys.gpu), 'MEMORY    ' + Math.round(statsSys.mem) + ' MB');
    else if (performance.memory) lines.push('MEMORY    ' + Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB in the page');
    if (typeof playerLine === 'function') { const l = playerLine(); if (l) lines.push(l); }
    $('stats').textContent = lines.join('\n');
  };
  tick(); statsTimer = setInterval(tick, 500);
}

/* ---------- player: sound out, timecode out and timecode in ----------
   For running the piece straight out of this app. Music can go to a chosen output. Timecode can be sent as LTC, a sound,
   to another output so a desk can follow; or read as LTC from an input so the piece follows the desk.
   The LTC maths is in timecode.js; this is the plumbing to sound devices. */
const PL = { out: null, inn: null, devs: null };
const tcR = () => TC_RATES[S.tcRate];
async function plDevices(ask) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return { ins: [], outs: [] };
  if (ask) { try { if (window.nativeApp && window.nativeApp.micAccess) await window.nativeApp.micAccess(); const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); } catch (e) {} }
  const all = await navigator.mediaDevices.enumerateDevices();
  return (PL.devs = { ins: all.filter(d => d.kind === 'audioinput'), outs: all.filter(d => d.kind === 'audiooutput') });
}
// LTC out: sound blocks of five frames queued a little ahead, always describing the frame the piece is on
function plOutStart(sink) {
  plOutStop();
  const opt = { sampleRate: 48000 }; if (sink && sink !== 'default') opt.sinkId = sink;
  let ctx; try { ctx = new AudioContext(opt); } catch (e) { ctx = new AudioContext({ sampleRate: 48000 }); }
  const gain = ctx.createGain(); gain.gain.value = 0.5; gain.connect(ctx.destination);
  PL.out = { ctx, gain, t0: 0, f: -1, st: { lv: 0.5 }, sent: -1, tap: null };
  PL.out.timer = setInterval(plOutTick, 40);
  return PL.out;
}
function plOutStop() { const o = PL.out; if (!o) return; clearInterval(o.timer); try { o.ctx.close(); } catch (e) {} PL.out = null; }
function plOutTick() {
  const o = PL.out; if (!o) return;
  const R = tcR(), now = o.ctx.currentTime;
  if (!S.playing || busy) { if (o.f >= 0) { o.gain.disconnect(); o.gain = o.ctx.createGain(); o.gain.gain.value = 0.5; o.gain.connect(o.tap || o.ctx.destination); o.f = -1; } return; }   // standing still: silence, so the desk sees the clock stop
  const want = S.tcStart + tau * R.real;                     // the frame the piece is on right now
  const have = o.f >= 0 ? o.f - (o.t0 - now) * R.real : -1e9; // the frame the queued sound says it is right now
  if (o.f < 0 || Math.abs(have - want) > 1.5 || o.t0 < now) {  // start, seek or drift: line up afresh on a whole frame a moment from now
    const f = Math.ceil(want + 0.08 * R.real);
    o.f = f; o.t0 = now + (f - want) / R.real;
  }
  while (o.t0 < now + 0.3) {
    const pcm = ltcEncode(o.f, 5, R, 48000, o.st), buf = o.ctx.createBuffer(1, pcm.length, 48000);
    buf.copyToChannel(pcm, 0);
    const src = o.ctx.createBufferSource(); src.buffer = buf; src.connect(o.gain); src.start(o.t0);
    o.t0 += pcm.length / 48000; o.f += 5;
  }
  o.sent = want;
}
// LTC in: listen on an input, and hand the frame loop the time the desk is on
async function plInStart(dev, stream) {
  plInStop();
  if (!stream) stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: dev && dev !== 'default' ? { exact: dev } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
  const ctx = new AudioContext(), src = ctx.createMediaStreamSource(stream), node = ctx.createScriptProcessor(1024, 1, 1), mute = ctx.createGain();
  const dec = new LtcDecoder(ctx.sampleRate);
  mute.gain.value = 0; src.connect(node); node.connect(mute); mute.connect(ctx.destination);
  const I = PL.inn = { ctx, stream, node, dec, t: 0, at: -1, seen: null, level: 0, frames: 0 };
  node.onaudioprocess = e => {
    const x = e.inputBuffer.getChannelData(0);
    let pk = 0; for (let i = 0; i < x.length; i += 16) { const a = Math.abs(x[i]); if (a > pk) pk = a; }
    I.level = Math.max(pk, I.level * 0.9);
    dec.feed(x);
    if (dec.ref && dec.ref !== I.seen) {
      I.seen = dec.ref;
      const R = tcR(), c = dec.ref.c, fr = tcToFrames(c.h, c.m, c.s, Math.min(c.f, R.fps - 1), R) + 1 + (dec.n - dec.ref.at) / ctx.sampleRate * R.real;
      I.frames = fr; I.t = (fr - S.tcStart) / R.real; I.at = performance.now();
    }
  };
  return I;
}
function plInStop() { const I = PL.inn; if (!I) return; try { I.node.disconnect(); I.stream.getTracks().forEach(t => t.stop()); I.ctx.close(); } catch (e) {} PL.inn = null; }
// called from the frame loop: where incoming timecode says the piece should be, or null when there is none to follow
function plChase(now) {
  const I = PL.inn;
  if (!I || I.at < 0 || now - I.at > 250) return null;
  return I.t + (now - I.at) / 1000;
}
function playerLine() {
  const R = tcR(), parts = [];
  if (PL.out) parts.push('TC OUT    ' + (S.playing ? tcString(S.tcStart + tau * R.real + 1e-6, R) : 'stopped'));
  if (PL.inn) parts.push('TC IN     ' + (performance.now() - PL.inn.at < 250 && PL.inn.at >= 0 ? tcString(PL.inn.frames, R) + '  locked' : 'no timecode') + '  level ' + Math.round(PL.inn.level * 100) + ' %');
  return parts.join('\n');
}
function plSay() {
  const I = PL.inn, R = tcR();
  $('plNote').textContent = (PL.out ? 'Sending timecode' + (S.playing ? ' ' + tcString(S.tcStart + tau * R.real + 1e-6, R) : ', stopped while the piece stands still') + '. ' : '')
    + (I ? (I.at >= 0 && performance.now() - I.at < 250 ? 'Following timecode ' + tcString(I.frames, R) + '.' : 'Listening for timecode. Level ' + Math.round(I.level * 100) + ' %.') : '')
    || 'For playing straight out of this app. Music goes to the output you choose. Timecode can be sent as sound (LTC) for a desk to follow, or read from an input so the piece follows the desk. Set the rate and the start under Timecode.';
}
{
  const fill = (el, list, first) => { const was = el.value; el.textContent = ''; const add = (v, n) => { const o = document.createElement('option'); o.value = v; o.textContent = n; el.append(o); }; add('', first); list.forEach((d, i) => add(d.deviceId, d.label || 'Device ' + (i + 1))); if ([...el.options].some(o => o.value === was)) el.value = was; };
  const refresh = async ask => { const d = await plDevices(ask); fill($('plMusic'), d.outs, 'The computer\'s usual output'); fill($('plOutDev'), d.outs, 'The computer\'s usual output'); fill($('plInDev'), d.ins, 'The computer\'s usual input'); };
  $('plScan').addEventListener('click', () => refresh(true));
  $('plMusic').addEventListener('change', async e => { try { if (audio.setSinkId) await audio.setSinkId(e.target.value || 'default'); } catch (x) { $('plNote').textContent = 'That output could not be used for the music.'; } });
  const outSet = () => { if ($('plOut').checked) plOutStart($('plOutDev').value); else plOutStop(); plSay(); };
  $('plOut').addEventListener('change', outSet); $('plOutDev').addEventListener('change', () => { if ($('plOut').checked) outSet(); });
  const inSet = async () => { if (!$('plIn').checked) { plInStop(); plSay(); return; } try { await plInStart($('plInDev').value); } catch (e) { $('plIn').checked = false; $('plNote').textContent = 'That input could not be opened. On a Mac, allow the microphone for Mall Call under Privacy in System Settings.'; return; } plSay(); };
  $('plIn').addEventListener('change', inSet); $('plInDev').addEventListener('change', () => { if ($('plIn').checked) inSet(); });
  setInterval(() => { if (PL.out || PL.inn) plSay(); }, 500);
  refresh(false).catch(() => {});
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', () => refresh(false));
}

/* ---------- the few numbers that matter, small, by the level meter ---------- */
{
  let sys = null, n = 0;
  setInterval(async () => {
    if (window.nativeApp && window.nativeApp.metrics && n++ % 2 === 0) { try { sys = await window.nativeApp.metrics(); } catch (e) {} }
    const budget = 1000 / Math.min(60, S.fps), el = $('mini');
    const a = (S.playing ? Math.round(paintFps) + ' FPS  ' : 'PAUSED  ') + PERF.all.toFixed(0) + ' MS';
    const b = sys ? 'CPU ' + Math.round(sys.cpu) + '%  ' + Math.round(sys.mem) + ' MB' : performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB' : '';
    const t = a + '\n' + b;
    if (el.textContent !== t) el.textContent = t;
    el.classList.toggle('over', S.playing && PERF.all > budget);
  }, 500);
}

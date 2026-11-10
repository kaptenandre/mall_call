/* ---------- timeline editor ----------
   Rows, top to bottom: time ruler, level, parts, one lane of clips per layer, then one lane per animated setting.
   Clips are events (EV). The dim ones are the automatic cut; the filled ones are yours and can be moved, stretched and deleted.
   Keys animate a setting. They never run linear: each leaves with an ease, a snap or a cut. */
const AKEYS = [['glitch', 'Glitch'], ['lines', 'Lines'], ['chase', 'Chases'], ['bgLo', 'Bass blocks'], ['bgMid', 'Mid bars'], ['bgHi', 'High sparks'], ['wob', 'Wobble'], ['wobSize', 'Wobble size'],
  ['eqAmt', 'EQ strength'], ['trail', 'Trails'], ['glow', 'Glow'], ['pfill', 'Pixel fill'], ['baseDen', 'Base pixels'], ['fxDen', 'Glitch pixels'], ['logoDen', 'Logo pixels']];
const ANAME = Object.fromEntries(AKEYS), CURVES = ['Ease', 'Snap', 'Cut'];
const LAYERS = ['Base', 'Glitch', 'Logo'], LAYER_NEW = ['sweep', 'glitch', 'show'];
const layerOf = k => k < 4 ? 0 : k < 10 ? 1 : 2, CUTS = ['base', 'fx', 'logo'];
const TLH = { ruler: 20, over: 34, parts: 20, ev: 24, auto: 46 };
const tlv = { z: 1, x0: 0 };
let tlSel = null, tlDrag = null, tlSnap = true, tlHeadSig = '', tlInspSig = '';

// the slider behind a setting: its range as a 0..1 position, and the maps between position and value
function aRange(key) {
  const r = RANGES.find(x => x[1] === key), el = $(r[0]);
  return { el, lo: el.min / 100, hi: el.max / 100, to: r[3] || (v => v), back: r[4] || (v => v) };
}
// the settings in force at a time: the part's own, with every animated setting read off its keys
function PAt(t) {
  const P = parts[partIdx(t)].P;
  let o = null;
  for (const k in auto) if (auto[k].length) { if (!o) o = Object.assign({}, P); o[k] = autoVal(auto[k], t, score.D, score.cyclic); }
  return o || P;
}
function setKey(key, t, v, c) {
  const ks = auto[key] || (auto[key] = []), near = ks.find(k => Math.abs(k.t - t) < 0.5 / S.fps);
  if (near) { near.v = v; return near; }
  const k = { t, v, c: c === undefined ? 0 : c };
  ks.push(k); ks.sort((a, b) => a.t - b.t);
  return k;
}
function tlChanged() { tlCache = null; touch(); if (!S.playing && !busy) paint(); }

/* undo: a click or a key press marks the state as it was; the first real change after it puts that state on the stack */
const undoStack = [], redoStack = [];
let undoPending = null, undoing = false;
const editState = () => { const g = {}; for (const k of GLOBAL_KEYS) if (k !== 'range') g[k] = S[k]; return JSON.stringify({ S: g, parts, userEv: userEv.map(e => [e.t, e.type, e.seed, e.d]), auto, autoCut }); };
function undoMark() { if (!score || undoing || loadingProject || busy) return; if (tlDrag && tlDrag.moved) return; savePart(); undoPending = editState(); }
function undoCommit() {
  if (undoPending === null || undoing) return;
  const p = undoPending; savePart();
  if (p === editState()) return;
  undoPending = null; undoStack.push(p); if (undoStack.length > 200) undoStack.shift(); redoStack.length = 0;
}
function undoReset() { undoStack.length = 0; redoStack.length = 0; undoPending = null; }
function undoApply(s) {
  undoing = true;
  try {
    const o = JSON.parse(s), inv = S.invert;
    Object.assign(S, o.S);
    parts = o.parts; userEv = o.userEv.map(e => mkEv(e[0], e[1], e[2], e[3])); auto = o.auto; Object.assign(autoCut, o.autoCut);
    tlSel = null; sel = Math.min(sel, parts.length - 1); Object.assign(S, parts[sel].P);
    if (S.invert !== inv) { mask = buildMask(logoSrc.img, logoSrc.w, logoSrc.h, S.invert); maskN++; }
    rebuildScore(); sel = partIdx(tau); Object.assign(S, parts[sel].P);
    pushGlobals(); pushAll(); syncUI(); tlInsp();
  } finally { undoing = false; undoPending = null; }
}
function undoStep(from, to) {
  undoCommit();
  if (!from.length || busy) return false;
  savePart(); to.push(editState()); undoApply(from.pop());
  return true;
}
const undo = () => undoStep(undoStack, redoStack), redo = () => undoStep(redoStack, undoStack);
addEventListener('pointerdown', undoMark, true);
addEventListener('keydown', undoMark, true);

/* rows and view */
function tlRows() {
  const rows = [{ kind: 'ruler', h: TLH.ruler, name: 'Time' }, { kind: 'over', h: TLH.over, name: 'Level' }, { kind: 'parts', h: TLH.parts, name: 'Parts' }];
  for (let L = 0; L < 3; L++) rows.push({ kind: 'ev', L, h: TLH.ev, name: LAYERS[L] });
  for (const key in auto) rows.push({ kind: 'auto', key, h: TLH.auto, name: ANAME[key] });
  let y = 0; for (const r of rows) { r.y = y; y += r.h; }
  rows.H = y;
  return rows;
}
const tlSpan = () => score.D / tlv.z;
const tlW = () => Math.max(50, $('tl').clientWidth);
const t2x = t => (t - tlv.x0) / tlSpan() * tlW();
const x2t = x => tlv.x0 + x / tlW() * tlSpan();
function tlZoom(f, atX) {
  const W = tlW(), x = atX === undefined ? W / 2 : atX, t = x2t(x);
  tlv.z = Math.min(Math.max(1, score.D * 20), Math.max(1, tlv.z * f));
  tlv.x0 = Math.min(score.D - tlSpan(), Math.max(0, t - x / W * tlSpan()));
  tlCache = null;
}
function tlPan(dt) { tlv.x0 = Math.min(score.D - tlSpan(), Math.max(0, tlv.x0 + dt)); tlCache = null; }
function tlSnapT(t, e, skip) {
  if (!tlSnap || (e && (e.metaKey || e.ctrlKey))) return t;
  const lim = 7 / tlW() * tlSpan();
  let best = t, bd = lim;
  const tryT = c => { const d = Math.abs(c - t); if (d < bd) { bd = d; best = c; } };
  tryT(0); tryT(tau);
  for (const h of score.hitList) tryT(h.t);
  for (let i = 1; i < parts.length; i++) if (i !== skip) tryT(parts[i].t);
  return best;
}

// Logo state at a time, for the strip behind the logo lane: 0 gone, 1 loading, 2 up.
function logoAt(t) {
  let best = null, age = 1e9;
  for (const e of score.all) { if (e.k < 10) continue; let a = t - e.t; if (a < 0) { if (!score.cyclic) continue; a += score.D; } if (a < age && !(e.k === 11 && a >= e.d)) { age = a; best = e; } }
  if (!best) return 0;
  return best.k === 10 ? (age < best.d ? 1 : 2) : best.k === 11 && age < best.d ? 2 : 0;
}
const tcAt = t => tcString(S.tcStart + t * TC_RATES[S.tcRate].real + 1e-6, TC_RATES[S.tcRate]);
const tlStamp = t => S.tcShow ? tcAt(t) : t >= 60 ? Math.floor(t / 60) + ':' + (t % 60 < 10 ? '0' : '') + (Math.round(t % 60 * 100) / 100) : String(Math.round(t * 100) / 100);
// where a clip sits on screen; a clip that runs past the end of a loop comes back in at the start
function clipRects(e, W) {
  const D = score.D, w = Math.max(e.k === 12 ? 4 : 6, Math.min(e.d, D) / tlSpan() * W), out = [[t2x(e.t), w]];
  if (score.cyclic && e.t + e.d > D && e.d < D) out.push([t2x(e.t - D), w]);
  return out;
}
function tlHeads(rows) {
  const sig = rows.map(r => r.kind + (r.key || r.L || '')).join() + '|' + autoCut.base + autoCut.fx + autoCut.logo + '|' + Object.keys(auto).map(k => auto[k].length ? 1 : 0).join('');
  if (sig === tlHeadSig) return;
  tlHeadSig = sig;
  const box = $('tlHead'); box.textContent = '';
  const btn = (text, title, fn, pressed) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.title = title; if (pressed !== undefined) b.setAttribute('aria-pressed', String(pressed)); b.addEventListener('click', fn); return b; };
  for (const r of rows) {
    const d = document.createElement('div'), lab = document.createElement('span'), tools = document.createElement('span');
    d.style.height = r.h + 'px'; lab.textContent = r.name; d.append(lab, tools);
    if (r.kind === 'ev') {
      const name = CUTS[r.L];
      tools.append(btn('Auto', 'The automatic cut on this layer, on or off', () => { autoCut[name] = !autoCut[name]; tlSel = null; rebuildScore(); syncUI(); tlInsp(); }, autoCut[name]),
        btn('Bake', 'Turn the automatic clips into your own so they can be edited', () => tlBake(r.L)));
      tools.style.display = 'flex'; tools.style.gap = '2px';
    }
    if (r.kind === 'auto') tools.append(btn('×', 'Stop animating this setting', () => { delete auto[r.key]; tlSel = null; syncUI(); tlInsp(); }));
    box.append(d);
  }
  const add = $('tlAdd'); add.textContent = '';
  const first = document.createElement('option'); first.value = ''; first.textContent = 'Animate…'; add.append(first);
  for (const [key, name] of AKEYS) if (!(key in auto)) { const o = document.createElement('option'); o.value = key; o.textContent = name; add.append(o); }
  for (const r of RANGES) $(r[0]).closest('.row').classList.toggle('anim', !!(auto[r[1]] && auto[r[1]].length));
}
function tlBake(L) {
  const name = CUTS[L];
  if (!autoCut[name]) return;
  for (const e of autoEv) if (layerOf(e.k) === L) userEv.push(mkEv(e.t, e.type, e.seed, Math.min(e.d, score.D)));
  autoCut[name] = false; tlSel = null;
  rebuildScore(); syncUI(); tlInsp();
}

function drawTimeline() {
  const c = $('tl'), dpr = Math.min(2, window.devicePixelRatio || 1), rows = tlRows(), W = tlW(), H = rows.H, D = score.D;
  tlHeads(rows);
  if (c.style.height !== H + 'px') c.style.height = H + 'px';
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); tlCache = null; }
  if (tlv.x0 + tlSpan() > D) tlv.x0 = Math.max(0, D - tlSpan());
  if (S.playing && !tlDrag && tlv.z > 1 && (tau < tlv.x0 || tau > tlv.x0 + tlSpan())) { tlv.x0 = Math.min(D - tlSpan(), Math.max(0, tau - tlSpan() * 0.04)); tlCache = null; }
  const span = tlSpan(), g = c.getContext('2d');
  if (!tlCache) {
    tlCache = document.createElement('canvas'); tlCache.width = c.width; tlCache.height = c.height;
    const q = tlCache.getContext('2d');
    q.scale(dpr, dpr); q.fillStyle = '#000'; q.fillRect(0, 0, W, H);
    q.font = '500 9px "DM Mono", ui-monospace, monospace'; q.textBaseline = 'middle';
    for (const r of rows) {
      q.save(); q.beginPath(); q.rect(0, r.y, W, r.h); q.clip();
      if (r.kind === 'ruler') {
        const want = (S.tcShow ? 96 : 64) / W * span, step = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300].find(s => s >= want) || 600;
        for (let i = Math.floor(tlv.x0 / step); i * step <= tlv.x0 + span; i++) {
          const x = Math.round(t2x(i * step));
          q.fillStyle = '#4a4958'; q.fillRect(x, r.y + r.h - 7, 1, 7);
          q.fillStyle = '#8d8b9e'; q.fillText(tlStamp(i * step), x + 4, r.y + 8);
          q.fillStyle = '#2c2b36'; for (let j = 1; j < 4; j++) q.fillRect(Math.round(t2x((i + j / 4) * step)), r.y + r.h - 3, 1, 3);
        }
      } else if (r.kind === 'over') {
        for (let x = 0; x < W; x++) {
          const a = Math.floor(x2t(x) / D * score.nh), b = Math.max(a + 1, Math.floor(x2t(x + 1) / D * score.nh));
          let lv = 0, gl = 0;
          for (let h = a; h < b && h < score.nh; h++) { lv = Math.max(lv, score.gain[h] + 0.3 * score.pulse[h]); gl = Math.max(gl, score.G[h]); }
          const hh = Math.max(1, Math.round(Math.min(1, lv) * (r.h - 6))), Pp = PAt(x2t(x + 0.5));
          q.fillStyle = gl * Pp.glitch * 1.6 > 0.4 ? Pp.tint : '#34333f'; q.fillRect(x, r.y + r.h - hh, 1, hh);
        }
        q.fillStyle = '#8d8b9e';
        for (const h of score.hitList) { const x = t2x(h.t); if (x >= 0 && x <= W) q.fillRect(Math.round(x), r.y, 1, 2 + Math.round(3 * h.v)); }
      } else if (r.kind === 'parts') {
        parts.forEach((p, i) => {
          const x = Math.round(t2x(p.t)), x1 = Math.round(t2x(partEnd(i)));
          q.fillStyle = i % 2 ? '#15151c' : '#0f0f15'; q.fillRect(x, r.y + 1, x1 - x, r.h - 1);
          q.fillStyle = p.P.tint; q.fillRect(x, r.y + r.h - 2, x1 - x, 2);
          if (i) { q.fillStyle = '#eceaf4'; q.fillRect(x, r.y, 1, r.h); }
          q.fillStyle = '#8d8b9e'; q.fillText('PART ' + (i + 1), Math.max(x, 0) + 6, r.y + r.h / 2);
        });
      } else if (r.kind === 'ev') {
        if (r.L === 2) for (let x = 0; x < W; x++) { const ls = logoAt(x2t(x + 0.5)); if (ls) { q.fillStyle = ls === 2 ? '#3a3947' : (x & 2 ? '#3a3947' : '#000'); q.fillRect(x, r.y + r.h - 3, 1, 3); } }
        for (const e of score.all) {
          if (layerOf(e.k) !== r.L) continue;
          const user = userEv.includes(e);
          for (const [x, w] of clipRects(e, W)) {
            if (x > W || x + w < 0) continue;
            q.fillStyle = user ? S.tint : '#1b1b22'; q.fillRect(x, r.y + 3, w, r.h - 8);
            if (!user) { q.strokeStyle = '#5a5968'; q.lineWidth = 1; q.strokeRect(x + 0.5, r.y + 3.5, w - 1, r.h - 9); }
            if (w > 34) { q.save(); q.beginPath(); q.rect(x, r.y, w - 3, r.h); q.clip(); q.fillStyle = user ? '#000' : '#8d8b9e'; q.fillText(e.type.toUpperCase(), Math.max(x, 0) + 4, r.y + r.h / 2 - 0.5); q.restore(); }
          }
        }
      } else {
        const ks = auto[r.key], R = aRange(r.key), yOf = v => r.y + r.h - 5 - (clamp01((R.back(v) - R.lo) / (R.hi - R.lo))) * (r.h - 10);
        q.beginPath();
        for (let x = 0; x <= W; x += 2) { const t = x2t(x), v = ks.length ? autoVal(ks, t, D, score.cyclic) : parts[partIdx(t)].P[r.key], y = yOf(v); if (x) q.lineTo(x, y); else q.moveTo(x, y); }
        q.strokeStyle = ks.length ? S.tint : '#5a5968'; q.lineWidth = 1.5; q.stroke();
        q.lineTo(W, r.y + r.h); q.lineTo(0, r.y + r.h); q.closePath(); q.globalAlpha = 0.12; q.fillStyle = ks.length ? S.tint : '#5a5968'; q.fill(); q.globalAlpha = 1;
        for (const k of ks) { const x = t2x(k.t), y = yOf(k.v); q.fillStyle = '#000'; q.fillRect(x - 4, y - 4, 8, 8); q.fillStyle = k.c === 2 ? '#eceaf4' : S.tint; q.fillRect(x - 3, y - 3, 6, 6); }
      }
      q.restore();
      q.fillStyle = '#25252f'; q.fillRect(0, r.y + r.h - 0.5, W, 1);
    }
  }
  g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(tlCache, 0, 0); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pr = rows[2], px0 = t2x(parts[sel].t), px1 = t2x(partEnd(sel));
  g.strokeStyle = '#eceaf4'; g.lineWidth = 1; g.strokeRect(Math.round(px0) + 0.5, pr.y + 1.5, Math.round(px1 - px0) - 1, pr.h - 3);
  if (tlSel) {
    g.strokeStyle = '#fff'; g.lineWidth = 2;
    if (tlSel.kind === 'ev') { const r = rows[3 + layerOf(tlSel.e.k)]; for (const [x, w] of clipRects(tlSel.e, W)) g.strokeRect(x, r.y + 3, w, r.h - 8); }
    else { const r = rows.find(q => q.key === tlSel.key); if (r) { const R = aRange(r.key), y = r.y + r.h - 5 - clamp01((R.back(tlSel.k.v) - R.lo) / (R.hi - R.lo)) * (r.h - 10); g.strokeRect(t2x(tlSel.k.t) - 5, y - 5, 10, 10); } }
  }
  const x = Math.round(t2x(tau));
  g.fillStyle = '#fff'; g.fillRect(x, 0, 1.5, H); g.fillRect(x - 3, 0, 7.5, 4);
  c.setAttribute('aria-valuenow', String(Math.round(tau / D * 100)));
  $('tlTc').textContent = tcAt(tau);
}

/* what is under the pointer */
function tlHit(x, y) {
  const rows = tlRows(), W = tlW(), r = rows.find(q => y >= q.y && y < q.y + q.h);
  if (!r) return { kind: 'none' };
  if (r.kind === 'ev') {
    const list = score.all.filter(e => layerOf(e.k) === r.L).sort((a, b) => userEv.includes(a) - userEv.includes(b));
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i], user = userEv.includes(e);
      for (const [cx, w] of clipRects(e, W)) if (x >= cx - 1 && x <= cx + w + 1) return { kind: user && e.k !== 12 && w > 12 && x > cx + w - 6 ? 'edge' : 'clip', row: r, e, user };
    }
  } else if (r.kind === 'auto') {
    const R = aRange(r.key);
    for (const k of auto[r.key]) { const ky = r.y + r.h - 5 - clamp01((R.back(k.v) - R.lo) / (R.hi - R.lo)) * (r.h - 10); if (Math.abs(t2x(k.t) - x) < 7 && Math.abs(ky - y) < 8) return { kind: 'key', row: r, key: r.key, k }; }
  } else if (r.kind === 'parts') {
    for (let i = 1; i < parts.length; i++) if (Math.abs(t2x(parts[i].t) - x) < 5) return { kind: 'split', row: r, i };
  }
  return { kind: 'empty', row: r };
}
const rowVal = (r, y) => { const R = aRange(r.key); return R.to(R.lo + clamp01((r.y + r.h - 5 - y) / (r.h - 10)) * (R.hi - R.lo)); };
function splitAt(t) {
  const i = partIdx(t);
  if (t - parts[i].t < 0.5 || partEnd(i) - t < 0.5) { partSay('A part has to be at least half a second long. Move away from the part edge, then split.'); return false; }
  savePart(); parts.splice(i + 1, 0, { t, P: Object.assign({}, parts[i].P) });
  sel = partIdx(tau); Object.assign(S, parts[sel].P);
  rebuildScore(); pushAll(); syncUI();
  return true;
}
function tlDelete() {
  if (!tlSel) return false;
  if (tlSel.kind === 'ev') { if (!userEv.includes(tlSel.e)) return false; userEv = userEv.filter(e => e !== tlSel.e); tlSel = null; mergeEv(); }
  else { auto[tlSel.key] = auto[tlSel.key].filter(k => k !== tlSel.k); tlSel = null; }
  syncUI(); tlInsp();
  return true;
}
function tlNudge(dt) {
  if (!tlSel) return false;
  if (tlSel.kind === 'ev') { if (!userEv.includes(tlSel.e)) return false; tlSel.e.t = Math.min(score.D - 0.01, Math.max(0, tlSel.e.t + dt)); mergeEv(); }
  else { tlSel.k.t = Math.min(score.D, Math.max(0, tlSel.k.t + dt)); auto[tlSel.key].sort((a, b) => a.t - b.t); }
  tlChanged(); tlInsp();
  return true;
}

/* the strip under the timeline: what is selected, as numbers */
function tlInsp() {
  const box = $('tlInsp'), s = tlSel;
  const sig = !s ? 'none' : s.kind === 'ev' ? 'ev' + userEv.includes(s.e) + layerOf(s.e.k) : 'key' + s.key;
  const num = (id, v) => { const el = $(id); if (el && document.activeElement !== el) el.value = v; };
  if (sig !== tlInspSig) {
    tlInspSig = sig; box.textContent = '';
    const field = (label, el) => { const l = document.createElement('label'); l.append(label, el); box.append(l); return el; };
    const input = (id, type, step, fn) => { const el = document.createElement('input'); el.type = type; el.id = id; if (step) el.step = step; el.addEventListener('change', () => { fn(el); tlChanged(); tlInsp(); }); return el; };
    const select = (id, opts, fn) => { const el = document.createElement('select'); el.id = id; for (const [v, n] of opts) { const o = document.createElement('option'); o.value = v; o.textContent = n; el.append(o); } el.addEventListener('change', () => { fn(el); tlChanged(); tlInsp(); }); return el; };
    const del = () => { const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Delete'; b.addEventListener('click', tlDelete); box.append(b); };
    if (!s) box.textContent = 'Double-click a lane to add a clip or a key. Drag to move, drag a clip by its right edge for length, Alt-drag to copy, Backspace to delete.';
    else if (s.kind === 'ev' && !userEv.includes(s.e)) { const p = document.createElement('span'); p.id = 'inAuto'; box.append(p); }
    else if (s.kind === 'ev') {
      field('Clip', select('inType', Object.keys(EV).filter(t => layerOf(EV[t]) === layerOf(s.e.k)).map(t => [t, t[0].toUpperCase() + t.slice(1)]), el => { const e = tlSel.e; e.type = el.value; e.k = EV[e.type]; e.d = e.k === 12 ? 0 : e.d || EVD[e.type]; mergeEv(); }));
      field('Start', input('inStart', 'number', '0.01', el => { tlSel.e.t = Math.min(score.D - 0.01, Math.max(0, Number(el.value) || 0)); mergeEv(); }));
      field('Length', input('inLen', 'number', '0.01', el => { if (tlSel.e.k !== 12) tlSel.e.d = Math.max(0.05, Number(el.value) || 0.05); mergeEv(); }));
      field('Seed', input('inSeed', 'number', '1', el => { tlSel.e.seed = Math.max(0, Math.round(Number(el.value)) || 0); }));
      const tc = document.createElement('span'); tc.id = 'inTc'; box.append(tc);
      del();
    } else {
      const lab = document.createElement('span'); lab.textContent = ANAME[s.key]; box.append(lab);
      field('Time', input('inStart', 'number', '0.01', el => { tlSel.k.t = Math.min(score.D, Math.max(0, Number(el.value) || 0)); auto[tlSel.key].sort((a, b) => a.t - b.t); }));
      field('Value', input('inVal', 'number', '1', el => { const R = aRange(tlSel.key); tlSel.k.v = R.to(Math.min(R.hi, Math.max(R.lo, (Number(el.value) || 0) / 100))); }));
      field('Leaves with', select('inCurve', CURVES.map((n, i) => [i, n]), el => { tlSel.k.c = Number(el.value); }));
      const tc = document.createElement('span'); tc.id = 'inTc'; box.append(tc);
      del();
    }
  }
  if (!s) return;
  if (s.kind === 'ev') {
    if ($('inAuto')) $('inAuto').textContent = 'Automatic ' + s.e.type + ' at ' + s.e.t.toFixed(2) + ' s, ' + tcAt(s.e.t) + '. Press Bake on the lane to edit the automatic clips, or Auto to switch them off.';
    else { num('inType', s.e.type); num('inStart', s.e.t.toFixed(2)); num('inLen', s.e.d.toFixed(2)); num('inSeed', s.e.seed); $('inLen').disabled = s.e.k === 12; $('inTc').textContent = tcAt(s.e.t); }
  } else { num('inStart', s.k.t.toFixed(2)); num('inVal', Math.round(aRange(s.key).back(s.k.v) * 100)); num('inCurve', s.k.c); $('inTc').textContent = tcAt(s.k.t); }
}

{
  const tl = $('tl');
  const pos = e => { const r = tl.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  tl.addEventListener('pointerdown', e => {
    if (busy || e.button) return;
    const [x, y] = pos(e), h = tlHit(x, y);
    tl.setPointerCapture(e.pointerId);
    if (h.kind === 'clip' || h.kind === 'edge') { tlSel = { kind: 'ev', e: h.e }; tlDrag = h.user ? { mode: h.kind === 'edge' ? 'len' : 'move', x, grab: x2t(x) - h.e.t, dup: e.altKey, moved: false } : null; }
    else if (h.kind === 'key') { tlSel = { kind: 'key', key: h.key, k: h.k }; tlDrag = { mode: 'key', x, y, row: h.row, moved: false }; }
    else if (h.kind === 'split') { tlSel = null; tlDrag = { mode: 'split', i: h.i, x, moved: false }; }
    else { tlSel = null; tlDrag = { mode: 'scrub', moved: false }; seek(x2t(x) / score.D); }
    tlInsp(); if (!S.playing) paint();
  });
  tl.addEventListener('pointermove', e => {
    const [x, y] = pos(e), d = tlDrag;
    if (!d) { const h = tlHit(x, y); tl.style.cursor = h.kind === 'edge' || h.kind === 'split' ? 'ew-resize' : h.kind === 'key' || (h.kind === 'clip' && h.user) ? 'grab' : 'default'; return; }
    if (d.mode === 'scrub') { seek(x2t(x) / score.D); return; }
    if (!d.moved) {
      if (Math.abs(x - d.x) < 3 && (d.y === undefined || Math.abs(y - d.y) < 3)) return;
      d.moved = true;
      if (d.dup) { const o = tlSel.e, c = mkEv(o.t, o.type, o.seed, o.d); userEv.push(c); tlSel = { kind: 'ev', e: c }; }
    }
    const D = score.D;
    if (d.mode === 'move') { tlSel.e.t = Math.min(D - 0.01, Math.max(0, tlSnapT(x2t(x) - d.grab, e))); mergeEv(); }
    else if (d.mode === 'len') { tlSel.e.d = Math.max(0.05, tlSnapT(x2t(x), e) - tlSel.e.t); mergeEv(); }
    else if (d.mode === 'key') { tlSel.k.t = Math.min(D, Math.max(0, tlSnapT(x2t(x), e))); tlSel.k.v = rowVal(d.row, y); auto[tlSel.key].sort((a, b) => a.t - b.t); }
    else if (d.mode === 'split') { parts[d.i].t = Math.min(partEnd(d.i) - 0.5, Math.max(parts[d.i - 1].t + 0.5, tlSnapT(x2t(x), e, d.i))); partsSig = ''; }
    tlChanged(); tlInsp();
  });
  const up = () => { const d = tlDrag; tlDrag = null; if (d && d.mode === 'split' && d.moved) { sel = partIdx(tau); Object.assign(S, parts[sel].P); rebuildScore(); pushAll(); syncUI(); } };
  tl.addEventListener('pointerup', up);
  tl.addEventListener('pointercancel', up);
  tl.addEventListener('dblclick', e => {
    if (busy) return;
    const [x, y] = pos(e), h = tlHit(x, y), t = Math.min(score.D - 0.01, Math.max(0, tlSnapT(x2t(x), e)));
    if (h.kind === 'empty' && h.row.kind === 'ev') { const c = mkEv(t, LAYER_NEW[h.row.L], Math.floor(Math.random() * 1e6)); userEv.push(c); tlSel = { kind: 'ev', e: c }; mergeEv(); }
    else if (h.kind === 'empty' && h.row.kind === 'auto') tlSel = { kind: 'key', key: h.row.key, k: setKey(h.row.key, t, rowVal(h.row, y)) };
    else if (h.kind === 'key') h.k.c = (h.k.c + 1) % 3;
    else if (h.kind === 'empty' && h.row.kind === 'parts') splitAt(t);
    else return;
    syncUI(); tlInsp();
  });
  tl.addEventListener('wheel', e => {
    const [x] = pos(e);
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); tlZoom(Math.exp(-e.deltaY * 0.01), x); }
    else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); tlPan((e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) / tlW() * tlSpan()); }
    else return;
    if (!S.playing) paint();
  }, { passive: false });
  tl.addEventListener('keydown', e => {
    const step = (e.shiftKey ? 10 : 1) / S.fps;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const dt = e.key === 'ArrowRight' ? step : -step; if (!tlNudge(dt)) seek((tau + dt) / score.D); }
    else if (e.key === 'Escape') { tlSel = null; tlInsp(); if (!S.playing) paint(); }
  });
  $('tlPlay').addEventListener('click', () => setPlaying(!S.playing));
  $('tlIn').addEventListener('click', () => { tlZoom(1.6, t2x(tau) >= 0 && t2x(tau) <= tlW() ? t2x(tau) : undefined); if (!S.playing) paint(); });
  $('tlOut').addEventListener('click', () => { tlZoom(1 / 1.6); if (!S.playing) paint(); });
  $('tlFit').addEventListener('click', () => { tlv.z = 1; tlv.x0 = 0; tlCache = null; if (!S.playing) paint(); });
  $('tlSnap').addEventListener('click', e => { tlSnap = !tlSnap; e.currentTarget.setAttribute('aria-pressed', String(tlSnap)); });
  $('tlUndo').addEventListener('click', undo);
  $('tlRedo').addEventListener('click', redo);
  $('tlAdd').addEventListener('change', e => {
    const key = e.target.value; if (!key) return;
    auto[key] = []; tlSel = { kind: 'key', key, k: setKey(key, tau, S[key]) };
    syncUI(); tlInsp();
  });
}

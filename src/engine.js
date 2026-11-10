/* ---------- timing engine: sound analysis, choreography score, per-frame state ---------- */
const TAU = Math.PI * 2;
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const sstep = (a, b, x) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const wrapd = x => x - Math.round(x);
function hash(a, b, c) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// smooth one-dimensional noise, -1..1
function nz(x, s) {
  const i = Math.floor(x), f = x - i, a = hash(i, s, 5), b = hash(i + 1, s, 5);
  return (a + (b - a) * f * f * (3 - 2 * f)) * 2 - 1;
}
const ioExpo = x => x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2;
const ioQuint = x => x < 0.5 ? 16 * x * x * x * x * x : 1 - Math.pow(-2 * x + 2, 5) / 2;
const oExpo = x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
const ioCirc = x => x < 0.5 ? (1 - Math.sqrt(1 - 4 * x * x)) / 2 : (Math.sqrt(1 - Math.pow(-2 * x + 2, 2)) + 1) / 2;
const ioBack = x => { const c = 2.5949; return x < 0.5 ? (4 * x * x * ((c + 1) * 2 * x - c)) / 2 : (Math.pow(2 * x - 2, 2) * ((c + 1) * (x * 2 - 2) + c) + 2) / 2; };
const oBack = x => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);
const oElastic = x => x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * TAU / 3) + 1;
const stepped = x => Math.min(1, Math.floor(ioQuint(x) * 5 + 0.5) / 5);
// the first three are the clean expo glide; the rest come in as Chaos goes up
const EASES = [ioExpo, ioExpo, ioExpo, ioQuint, oExpo, ioCirc, ioBack, oBack, oElastic, stepped];

// A pose is where the logo sits and how much of it is lit. Every move invents its own.
function genPose(i, seed, ch, open) {
  const r = n => hash(i, seed, 60 + n);
  const P = { s: 1, ox: 0, oy: 0, rot: 0, kx: 1, sk: 0, y0: 0, y1: 1, x0: 0, x1: 1 };
  if (open) { P.s = 0.92 + 0.22 * r(1); P.ox = (r(2) - 0.5) * 0.12 * ch; P.oy = (r(3) - 0.5) * 0.1 * ch; P.rot = (r(4) - 0.5) * 0.14 * ch; return P; }
  switch (Math.floor(r(0) * 12)) {
    case 0: P.s = 1.3 + 1.4 * r(1); P.ox = (r(2) - 0.5) * 0.45; P.oy = (r(3) - 0.5) * 0.35; break;                  // push in on a detail
    case 1: P.s = 0.28 + 0.36 * r(1); P.ox = (r(2) - 0.5) * 0.55; P.oy = (r(3) - 0.5) * 0.45; break;                // pull out, off-centre
    case 2: { const h = 0.12 + 0.42 * r(1), c = h / 2 + r(2) * (1 - h); P.y0 = c - h / 2; P.y1 = c + h / 2; break; } // band
    case 3: { const w = 0.1 + 0.36 * r(1), c = w / 2 + r(2) * (1 - w); P.x0 = c - w / 2; P.x1 = c + w / 2; break; }  // slit
    case 4: { const q = Math.floor(r(1) * 4); if (q === 0) P.y1 = 0.5; else if (q === 1) P.y0 = 0.5; else if (q === 2) P.x1 = 0.5; else P.x0 = 0.5; break; }
    case 5: P.rot = (r(1) < 0.5 ? -1 : 1) * (0.14 + 0.5 * r(2) * ch); P.s = 0.9 + 0.4 * r(3); break;               // tilt
    case 6: P.kx = r(1) < 0.5 ? 0.35 + 0.3 * r(2) : 1.5 + 1.2 * r(2); break;                                       // squeeze or stretch
    case 7: P.sk = (r(1) - 0.5) * 1.5; P.s = 0.85 + 0.3 * r(2); break;                                             // shear
    case 8: if (r(1) < 0.6) { const c = 0.15 + 0.7 * r(2); P.y0 = c; P.y1 = c; } else { const c = 0.15 + 0.7 * r(2); P.x0 = c; P.x1 = c; } break; // shut to a line
    case 9: P.ox = (r(1) < 0.5 ? -1 : 1) * (0.14 + 0.26 * r(2)); P.oy = (r(3) - 0.5) * 0.22; break;                 // slide
    case 10: P.s = 0.6 + 1.2 * r(1); P.rot = (r(2) - 0.5) * 0.7 * ch; P.kx = 0.7 + 0.8 * r(3); P.ox = (r(4) - 0.5) * 0.3; break;
    default: { const w = 0.25 + 0.4 * r(1), h = 0.25 + 0.4 * r(2), cx = w / 2 + r(3) * (1 - w), cy = h / 2 + r(4) * (1 - h); P.x0 = cx - w / 2; P.x1 = cx + w / 2; P.y0 = cy - h / 2; P.y1 = cy + h / 2; }
  }
  return P;
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -TAU / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < half; j++) {
        const a = i + j, b = a + half, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
function pct(arr, p) {
  const s = Float32Array.from(arr).sort();
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}
// Attack and release in seconds; a second light pass rounds the corners so levels ease in and out.
function follow(src, hop, att, rel, round) {
  const n = src.length, out = new Float32Array(n), ka = Math.exp(-hop / att), kr = Math.exp(-hop / rel), ks = round ? Math.exp(-hop / round) : 0;
  let y = 0, z = 0;
  for (let i = 0; i < n; i++) {
    const x = src[i];
    y = x > y ? x + (y - x) * ka : x + (y - x) * kr;
    z = y + (z - y) * ks;
    out[i] = z;
  }
  return out;
}
// running count of hits in a band, so the background can re-roll on every one
function countHits(fl, nh) {
  const thr = 0.3 * (pct(fl, 0.99) || 1), idx = new Uint16Array(nh);
  let c = 0, lastAt = -9;
  for (let h = 1; h < nh - 1; h++) {
    if (fl[h] > thr && fl[h] >= fl[h - 1] && fl[h] > fl[h + 1] && h - lastAt > 4) { c++; lastAt = h; }
    idx[h] = c;
  }
  idx[nh - 1] = c;
  return idx;
}
function level(src, hop) {
  const f = follow(src, hop, 0.005, 0.14, 0.012), k = 1 / (pct(f, 0.98) || 1);
  for (let i = 0; i < f.length; i++) f[i] = Math.min(1, f[i] * k);
  return f;
}

const NB = 24;
function analyze(pcm, sr) {
  const N = 1024, hopN = Math.round(sr / 100), hop = hopN / sr;
  const nh = Math.max(2, Math.floor((pcm.length - N) / hopN));
  const binHz = sr / N, edges = [];
  for (let b = 0; b <= NB; b++) {
    let k = Math.round(50 * Math.pow(12000 / 50, b / NB) / binHz);
    if (b === 0) k = Math.max(1, k); else if (k <= edges[b - 1]) k = edges[b - 1] + 1;
    edges.push(Math.min(N / 2, k));
  }
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(TAU * i / (N - 1));
  const re = new Float32Array(N), im = new Float32Array(N);
  const raw = new Float32Array(nh * NB), full = new Float32Array(nh);
  for (let h = 0; h < nh; h++) {
    const o = h * hopN;
    let e = 0;
    for (let i = 0; i < N; i++) { const s = pcm[o + i]; re[i] = s * win[i]; im[i] = 0; e += s * s; }
    full[h] = Math.sqrt(e / N);
    fft(re, im);
    for (let b = 0; b < NB; b++) {
      let p = 0;
      for (let k = edges[b]; k < edges[b + 1]; k++) p += re[k] * re[k] + im[k] * im[k];
      raw[h * NB + b] = Math.sqrt(p);
    }
  }
  // each band is scaled to its own range, so quiet highs move as much as loud lows
  const col = new Float32Array(nh);
  let top = 0; const ref = [];
  for (let b = 0; b < NB; b++) { for (let h = 0; h < nh; h++) col[h] = raw[h * NB + b]; ref[b] = pct(col, 0.98); if (ref[b] > top) top = ref[b]; }
  for (let b = 0; b < NB; b++) {
    const k = ref[b] > top * 0.002 ? 1 / ref[b] : 0;
    for (let h = 0; h < nh; h++) raw[h * NB + b] = Math.min(1.25, raw[h * NB + b] * k);
  }
  const fr = pct(full, 0.98) || 1;
  for (let h = 0; h < nh; h++) full[h] = Math.min(1.25, full[h] / fr);
  // band groups: 0 bass (under 170 Hz), 1 mids (350 Hz to 3.5 kHz), 2 highs (over 4.5 kHz)
  const grp = [], cnt = [0, 0, 0]; let nMh = 0;
  for (let b = 0; b < NB; b++) { const c = 50 * Math.pow(12000 / 50, (b + 0.5) / NB); grp[b] = c < 170 ? 0 : c > 4500 ? 2 : c > 350 && c < 3500 ? 1 : -1; if (grp[b] >= 0) cnt[grp[b]]++; if (c > 350) nMh++; }
  const lv = [new Float32Array(nh), new Float32Array(nh), new Float32Array(nh)], fl = [new Float32Array(nh), new Float32Array(nh), new Float32Array(nh)];
  const mh = new Float32Array(nh), mhF = new Float32Array(nh), on = new Float32Array(nh);
  for (let h = 0; h < nh; h++) {
    let ft = 0, m = 0, fm = 0;
    for (let b = 0; b < NB; b++) {
      const v = raw[h * NB + b], d = h ? Math.max(0, v - raw[(h - 1) * NB + b]) : 0, g = grp[b];
      ft += d;
      if (g >= 0) { lv[g][h] += v / cnt[g]; fl[g][h] += d / cnt[g]; }
      if (g !== 0 && (g >= 1 || 50 * Math.pow(12000 / 50, (b + 0.5) / NB) > 350)) { m += v; fm += d; }
    }
    mh[h] = m / nMh; mhF[h] = fm / nMh; on[h] = ft / NB;
  }
  // smoothed band levels for the EQ: near-instant attack, eased release
  const spec = new Float32Array(nh * NB);
  for (let b = 0; b < NB; b++) {
    for (let h = 0; h < nh; h++) col[h] = raw[h * NB + b];
    const f = follow(col, hop, 0.006, 0.13, 0.016);
    for (let h = 0; h < nh; h++) spec[h * NB + b] = Math.min(1, f[h]);
  }
  return { D: pcm.length / sr, hop, nh, spec, full, mh, mhF, on, loF: fl[0],
    lo: level(lv[0], hop), mid: level(lv[1], hop), hi: level(lv[2], hop), loIdx: countHits(fl[0], nh), miIdx: countHits(fl[1], nh) };
}

function pickHits(an) {
  const { on, nh, hop } = an, pre = new Float64Array(nh + 1);
  for (let i = 0; i < nh; i++) pre[i + 1] = pre[i] + on[i];
  const p95 = pct(on, 0.95), W = Math.round(1 / hop), cand = [];
  for (let h = 3; h < nh - 3; h++) {
    const v = on[h];
    if (v < on[h - 1] || v < on[h + 1] || v < on[h - 2] || v < on[h + 2] || v < on[h - 3] || v < on[h + 3]) continue;
    const a = Math.max(0, h - W), b = Math.min(nh, h + W), mean = (pre[b] - pre[a]) / (b - a);
    if (v > 1.9 * mean + 0.35 * p95) cand.push({ t: h * hop, v });
  }
  cand.sort((x, y) => y.v - x.v);
  const keep = [];
  for (const c of cand) if (keep.every(k => Math.abs(k.t - c.t) > 0.3)) keep.push(c);
  return keep.sort((x, y) => x.t - y.t);
}

// Where the background lines rest after a move: four horizontal and four vertical, parked off-frame unless used.
function genLines(i, seed) {
  const r = n => hash(i, seed, 120 + n), off = n => r(n) < 0.5 ? -0.15 : 1.15;
  const h = [off(1), off(2), off(3), off(4)], v = [off(5), off(6), off(7), off(8)];
  const c = 0.25 + 0.5 * r(9), d = 0.04 + 0.4 * r(10);
  switch (Math.floor(r(0) * 9)) {
    case 0: h[0] = c - d; h[1] = c + d; break;                                             // a pair opening around a point
    case 1: v[0] = c - d; v[1] = c + d; break;
    case 2: for (let j = 0; j < 4; j++) h[j] = 0.08 + 0.84 * (j + r(11 + j)) / 4; break;   // ladder
    case 3: for (let j = 0; j < 4; j++) v[j] = 0.08 + 0.84 * (j + r(11 + j)) / 4; break;
    case 4: for (let j = 0; j < 4; j++) h[j] = c + (j - 1.5) * 0.028; break;               // tight bundle
    case 5: for (let j = 0; j < 4; j++) v[j] = c + (j - 1.5) * 0.02; break;
    case 6: h[0] = d * 0.6; h[1] = 1 - d * 0.6; v[0] = d * 0.5; v[1] = 1 - d * 0.5; break; // frame
    case 7: h[0] = c; v[0] = 0.25 + 0.5 * r(15); break;                                    // cross
    default: break;                                                                        // everything swept out
  }
  return { h, v };
}
const LEASES = [ioExpo, ioExpo, oExpo, ioQuint, ioCirc, ioBack, oBack, oElastic];

// ch is the Chaos amount, or a function giving it for a time, since each part of the piece can set its own
function makeMoves(times, D, seed, cyclic, ch) {
  const n = times.length, poses = [], lines = [], moves = [], cf = typeof ch === 'function' ? ch : () => ch;
  let since = 0;
  for (let i = 0; i < n; i++) {
    const c = cf(times[i]), open = i === 0 || since >= 3 || (since >= 1 && hash(i, seed, 41) < lerp(0.62, 0.3, c));
    poses.push(genPose(i, seed, c, open)); since = open ? 0 : since + 1;
    lines.push(genLines(i, seed));
  }
  const shut = { s: 1, ox: 0, oy: 0, rot: 0, kx: 1, sk: 0, y0: 0.5, y1: 0.5, x0: 0, x1: 1 };
  const parked = { h: [-0.15, 1.15, -0.15, 1.15], v: [-0.15, 1.15, -0.15, 1.15] };
  let sec = 0, left = 3 + Math.floor(hash(0, seed, 48) * 5);
  for (let i = 0; i < n; i++) {
    const next = i + 1 < n ? times[i + 1] : D, gap = next - times[i];
    if (i > 0 && --left < 0) { sec++; left = 2 + Math.floor(hash(sec, seed, 48) * 6); }
    const ldl = []; for (let j = 0; j < 8; j++) ldl.push(0.4 * hash(i * 8 + j, seed, 55));
    moves.push({ t: times[i], from: i === 0 ? (cyclic ? poses[n - 1] : shut) : poses[i - 1], to: poses[i],
      L0: i === 0 ? (cyclic ? lines[n - 1] : parked) : lines[i - 1], L: lines[i], le: LEASES[Math.floor(hash(i, seed, 46) * 7.99)],
      ld: Math.min(1.5, Math.max(0.3, gap * 0.86)), ldl,
      slab: hash(i, seed, 44) < 0.22 ? (hash(i, seed, 45) < 0.5 ? 1 : -1) : 0, slabW: 0.04 + 0.12 * hash(i, seed, 47), sec, i });
  }
  return moves;
}
// glitch runs in holds of one to five frames, never on a fixed clock
function makeSteps(D, seed) {
  const out = [];
  for (let t = 0, k = 0; t < D; k++) { out.push(t); const r = hash(k, seed, 54); t += (1 + Math.floor(r * r * 4.99)) / 30; }
  out.push(D + 1);
  return Float32Array.from(out);
}

// The organic clock: instead of running at one speed, everything that moves surges on a hit and eases out after it.
// phi maps real seconds to eased seconds and still arrives at D, so a loop stays a loop.
function makePhi(env, hop, D) {
  const n = env.length, phi = new Float32Array(n + 1);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += 0.1 + 3.2 * env[i];
  const k = D / (sum || 1);
  for (let i = 0; i < n; i++) phi[i + 1] = phi[i] + (0.1 + 3.2 * env[i]) * k;
  return phi;
}
function phiAt(sc, tau) {
  const hp = Math.max(0, tau / sc.hop), h = Math.min(sc.nh - 1, hp | 0);
  return sc.phi[h] + (sc.phi[h + 1] - sc.phi[h]) * Math.min(1, hp - h);
}
function buildTrackScore(an, seed, ch) {
  const { nh, hop, D } = an, hits = pickHits(an);
  let times = hits.map(h => h.t).filter(t => t > 0.25 && t < D - 0.2);
  times.unshift(0);
  for (let i = 0; i < times.length; i++) {       // long quiet stretches still get slow glides
    const next = i + 1 < times.length ? times[i + 1] : D;
    if (next - times[i] > 3) times.splice(i + 1, 0, times[i] + (next - times[i]) / 2);
  }
  const gain = follow(an.full, hop, 0.03, 0.28, 0.03);
  for (let i = 0; i < nh; i++) gain[i] = sstep(0.015, 0.09, gain[i]) * (0.34 + 0.66 * Math.min(1, gain[i]));
  const lf = pct(an.loF, 0.995) || 1, pulse = follow(Float32Array.from(an.loF, v => sstep(0.3, 0.95, v / lf)), hop, 0.004, 0.17, 0.012);
  const mf = pct(an.mhF, 0.97) || 1, ml = pct(an.mh, 0.97) || 1;
  const gsrc = new Float32Array(nh);
  for (let i = 0; i < nh; i++) gsrc[i] = 0.55 * Math.min(1.2, an.mhF[i] / mf) + 0.6 * Math.min(1.2, an.mh[i] / ml);
  const G = follow(gsrc, hop, 0.01, 0.16, 0.02);
  for (let i = 0; i < nh; i++) G[i] = sstep(0.3, 0.8, G[i]);
  // a short burst glitches hard; a long busy stretch settles down so the logo and the EQ can carry it
  const slow = follow(G, hop, 1.1, 1.1, 0);
  for (let i = 0; i < nh; i++) G[i] *= 1 - 0.72 * slow[i];
  // hits measured against what is going on around them, so a busy stretch still breathes hit by hit
  const op = pct(an.on, 0.985) || 1, hitEnv = follow(Float32Array.from(an.on, v => Math.min(1, v / op)), hop, 0.004, 0.14, 0.014);
  for (let i = 0; i < nh; i++) hitEnv[i] = Math.max(hitEnv[i], 0.8 * pulse[i]);
  const floor = follow(hitEnv, hop, 0.5, 0.5, 0);
  for (let i = 0; i < nh; i++) hitEnv[i] = Math.pow(clamp01((hitEnv[i] - 0.8 * floor[i]) / (1.02 - 0.8 * floor[i])), 1.3);
  return { D, hop, nh, phi: makePhi(hitEnv, hop, D), moves: makeMoves(times, D, seed, false, ch), steps: makeSteps(D, seed), gain, pulse, G, spec: an.spec,
    lo: an.lo, mid: an.mid, hi: an.hi, loIdx: an.loIdx, miIdx: an.miIdx, seed, cyclic: false, hits: hits.length, hitList: hits, all: [] };
}

// With no sound loaded: a seamless loop on a half-second beat, with its own made-up bass, mids and highs.
function buildLoopScore(L, seed, ch) {
  const hop = 0.01, nh = Math.round(L / hop), beat = 0.5, nb = Math.round(L / beat), times = [];
  for (let b = 0; b < nb; b++) if (b === 0 || hash(b, seed, 31) < 0.52) times.push(b * beat);
  const gain = new Float32Array(nh).fill(0.86), pulse = new Float32Array(nh), G = new Float32Array(nh);
  const mid = new Float32Array(nh), hi = new Float32Array(nh), loIdx = new Uint16Array(nh), miIdx = new Uint16Array(nh);
  const stamp = (arr, t, tail, amp) => { for (let h = Math.max(0, Math.round(t / hop)); h < nh; h++) { const v = amp * Math.exp(-(h * hop - t) / tail); if (v < 0.01) break; if (v > arr[h]) arr[h] = v; } };
  times.forEach((t, i) => {
    stamp(pulse, t, 0.17, 1);
    for (let h = Math.round(t / hop); h < nh; h++) loIdx[h] = i + 1;
    if (i > 0 && hash(i, seed, 32) < 0.5) {
      const len = 0.2 + 0.5 * hash(i, seed, 33), a = Math.max(0.05, t - len);
      for (let h = Math.round(a / hop); h < Math.round(t / hop); h++) G[h] = sstep(a, a + 0.04, h * hop);
    }
  });
  let mc = 0;
  for (let q = 0; q < nb * 4; q++) {             // sixteenth-note grid
    const t = q * beat / 4;
    if (hash(q, seed, 34) < 0.3) { stamp(mid, t, 0.12, 0.5 + 0.5 * hash(q, seed, 35)); mc++; }
    for (let h = Math.round(t / hop); h < Math.min(nh, Math.round((t + beat / 4) / hop)); h++) miIdx[h] = mc;
    if (hash(q, seed, 36) < 0.42) stamp(hi, t, 0.06, 0.4 + 0.6 * hash(q, seed, 37));
    if (q % 4 && hash(q, seed, 38) < 0.07 * (typeof ch === 'function' ? ch(t) : ch)) { const a = t, b = Math.min(L - 0.02, t + 0.12); for (let h = Math.round(a / hop); h < Math.round(b / hop); h++) G[h] = Math.max(G[h], 0.8); }
  }
  const env = new Float32Array(nh);
  times.forEach(t => { stamp(env, t, 0.3, 1); stamp(env, t - L, 0.3, 1); });
  return { D: L, hop, nh, phi: makePhi(env, hop, L), moves: makeMoves(times, L, seed, true, ch), steps: makeSteps(L, seed), gain, pulse, G, spec: null,
    lo: pulse, mid, hi, loIdx, miIdx, seed, cyclic: true, hits: times.length, hitList: times.map((t, i) => ({ t, v: hash(i, seed, 39) })), all: [] };
}

/* ---------- three layers: base (rare and big), glitch (lines, chases, debris), logo (loader or appearing) ---------- */
const EV = { sweep: 0, strobe: 1, flood: 2, blackout: 3, glitch: 4, chase: 5, lines: 6, sparks: 7, bars: 8, blocks: 9, load: 10, show: 11, hide: 12, type: 13, orbit: 14, spokes: 15, meet: 16, pillar: 17, sym: 18 };
const EVD = { sweep: 0.9, strobe: 0.6, flood: 0.9, blackout: 0.4, glitch: 0.6, chase: 4, lines: 0.7, sparks: 0.6, bars: 0.6, blocks: 0.6, load: 3, show: 2, hide: 0, type: 2.5, orbit: 1.4, spokes: 2.4, meet: 1.2, pillar: 4, sym: 3 };
// base clips are the first four and the three that run round the ring; which face of the ring a clip plays on is e.face: 0 both, 1 outside, 2 inside
const isBase = k => k < 4 || (k >= 14 && k <= 16);
// A Type clip carries its words and how they arrive: txt, mode (slam, typeon, roll, ticker), size and y as parts of the frame height, font.
// Also: x across the frame, caps, trk (letter spacing in ems), out ('cut', or 'same' to leave the way it came). A | in txt starts a new line.
const TYPE_NEW = { txt: 'MALL CALL', mode: 'slam', size: 0.5, y: 0.5, font: 'sans', x: 0.5, caps: true, trk: 0, out: 'cut' };
// A Pillar clip plays a pattern across the pillars, one value per pillar. fx: the pattern. pm: 'light' lights whole pillars,
// 'mask' shows the picture only where the pattern is. sp: speed. wd: how much of the ring is on, 0 to 1.
const PILLAR_FX = ['chase', 'spin', 'ping', 'wave', 'random', 'alt', 'pop', 'vu', 'echo', 'build', 'drain', 'split'];
// on: what a mask hides: 'all' layers, only the 'logo' layer, or only the 'glitch' layer. pm 'frame' lights just the outline of each pillar.
const PIL_NEW = { fx: 'chase', pm: 'mask', sp: 1, wd: 0.25, on: 'all' };
// A Symbol clip shows a shape from the bank. sy: which one. step: change to another on every hit. echo: how many delayed copies
// trail behind it, each ex, ey further off and each showing the shape from one hit earlier. each: one in every pillar, and then
// dl makes each pillar run that many hits behind the one before it, so the shapes chase round the ring like a delay.
const SYM_NEW = { sy: 'x', step: true, echo: 3, ex: 0.05, ey: -0.05, size: 0.6, x: 0.5, y: 0.5, each: false, dl: 0 };
const evMore = e => e.k === 18 ? { sy: e.sy, step: !!e.step, echo: e.echo | 0, ex: e.ex, ey: e.ey, size: e.size, x: e.x, y: e.y, each: !!e.each, dl: e.dl, face: e.face | 0 } : e.k === 13 ? { txt: e.txt, mode: e.mode, size: e.size, y: e.y, font: e.font, x: e.x, caps: e.caps, trk: e.trk, out: e.out, ol: !!e.ol, face: e.face | 0 } : e.k === 17 ? { fx: e.fx, pm: e.pm, sp: e.sp, wd: e.wd, on: e.on, face: e.face | 0 } : e.face || e.clean ? Object.assign(e.face ? { face: e.face } : {}, e.clean ? { clean: true } : {}) : null;
const mkEv = (t, type, seed, d, more) => { const e = { t, type, k: EV[type], seed: seed | 0, d: d === undefined || d === null ? EVD[type] : d }; if (more && more.mode === 'band' && (d === undefined || d === null)) e.d = 8; if (more && more.face) e.face = more.face | 0; if (more && more.clean && e.k === 11) { e.clean = true; if (d === undefined || d === null) e.d = 4; } return e.k === 13 ? Object.assign(e, TYPE_NEW, more) : e.k === 17 ? Object.assign(e, PIL_NEW, more) : e.k === 18 ? Object.assign(e, SYM_NEW, more) : e; };

// The shape of the piece, read off the score once: where it drops, the builds that lead into drops, the quiet stretches,
// and the moments each band of the spectrum jumps. The automatic cut hangs its clips on these.
function makeStructure(sc) {
  const { nh, hop, D } = sc, e = new Float32Array(nh);
  for (let i = 0; i < nh; i++) e[i] = 0.65 * sc.gain[i] + 0.35 * sc.lo[i];
  const fast = follow(e, hop, 0.12, 0.2, 0), pre = new Float64Array(nh + 1);
  for (let i = 0; i < nh; i++) pre[i + 1] = pre[i] + fast[i];
  const mean = (t0, t1) => { const i0 = Math.max(0, Math.min(nh - 1, Math.round(t0 / hop))), i1 = Math.max(i0 + 1, Math.min(nh, Math.round(t1 / hop))); return (pre[i1] - pre[i0]) / (i1 - i0); };
  const spaced = (list, gap) => { const keep = []; for (const c of list.slice().sort((x, y) => y.v - x.v)) if (keep.every(k => Math.abs(k.t - c.t) > gap)) keep.push(c); return keep.sort((x, y) => x.t - y.t); };
  // drops: a hit where the level after it stands well above the stretch before it
  let drops = [];
  for (const h of sc.hitList) {
    if (h.t < 2 || h.t > D - 1) continue;
    const before = mean(h.t - 2.5, h.t - 0.25), after = mean(h.t + 0.05, h.t + 1.5), gap = mean(h.t - 0.5, h.t - 0.05);
    const v = (after - before) + 0.6 * (after - gap);
    if (after - before > 0.14 && v > 0.22) drops.push({ t: h.t, v, gap: gap < 0.45 * after ? Math.min(0.5, 0.25 + 0.5 * (after - gap)) : 0 });
  }
  drops = spaced(drops, 6);
  // builds: before a drop, how far back the mids and highs have been climbing
  const mh = new Float32Array(nh);
  for (let i = 0; i < nh; i++) mh[i] = 0.5 * (sc.mid[i] + sc.hi[i]);
  const rise = follow(mh, hop, 0.8, 0.8, 0), builds = [];
  for (const d of drops) {
    let i = Math.round((d.t - 0.3) / hop), n = 0;
    const lim = Math.max(0, i - Math.round(10 / hop)), st = Math.round(0.5 / hop);
    while (i - st > lim && rise[i] > rise[i - st] + 0.004) { i -= st; n++; }
    const a = i * hop;
    if (d.t - a >= 1.5 && rise[Math.round((d.t - 0.3) / hop)] - rise[i] > 0.06) builds.push({ a, b: d.t });
  }
  // breaks: stretches that sit far under the piece's usual level
  const usual = pct(fast, 0.7) || 1, breaks = [];
  for (let i = 0, from = -1; i <= nh; i++) {
    const low = i < nh && fast[i] < 0.4 * usual;
    if (low && from < 0) from = i;
    else if (!low && from >= 0) { if ((i - from) * hop >= 1.2) breaks.push({ a: from * hop, b: i * hop }); from = -1; }
  }
  // the moments each band jumps: bass, mids, highs
  const peaks = [sc.lo, sc.mid, sc.hi].map(lv => {
    const on = new Float32Array(nh);
    for (let i = 3; i < nh; i++) on[i] = Math.max(0, lv[i] - lv[i - 3]);
    const thr = Math.max(0.08, 0.5 * (pct(on, 0.985) || 0)), out = [];
    for (let i = 4; i < nh - 2; i++) if (on[i] > thr && on[i] >= on[i - 1] && on[i] > on[i + 1]) out.push({ t: (i - 2) * hop, v: on[i] });
    return spaced(out, 0.2);
  });
  return { drops, builds, breaks, peaks };
}

// What the engine schedules by itself for one part of the piece, from a to b seconds.
// P: base (how often), fx (how many glitch clips), mode (0 loader, 1 appear, 2 always), presence. pi is the part's number.
function makeEvents(sc, P, a, b, pi) {
  const ev = [], D = sc.D, sd = sc.seed + pi * 977, cyc = sc.cyclic, whole = a <= 0 && b >= D;
  const hits = sc.hitList.filter(h => h.t >= a && h.t < b);
  const far = (x, y) => { const d = Math.abs(x - y); return cyc && whole ? Math.min(d, D - d) : d; };
  const st = sc.struct || (sc.struct = makeStructure(sc)), here = x => x.t >= a && x.t < b;
  const drops = st.drops.filter(here);
  if (P.base > 0.02) {                                       // base: the drops first, then only the strongest hits, well apart
    const gapMin = lerp(24, 4.5, P.base), chosen = [];
    const cand = drops.map(d => ({ t: d.t, v: 10 + d.v, drop: d })).concat(hits.slice().sort((x, y) => y.v - x.v));
    for (const h of cand) {
      if (!cyc && pi === 0 && h.t < 1.5) continue;
      if (chosen.every(c => far(c.t, h.t) > (h.drop && c.drop ? 5 : gapMin)) && (cyc && whole ? D >= gapMin * 0.6 || chosen.length === 0 : true)) chosen.push(h);
    }
    chosen.forEach((h, i) => {
      let type = h.drop ? ['flood', 'sweep', 'sweep', 'strobe'][Math.floor(hash(i, sd, 143) * 3.99)] : ['sweep', 'strobe', 'sweep', 'flood', 'sweep', 'blackout', 'strobe'][(i + Math.floor(hash(sd, 2, 140) * 7)) % 7];
      if (P.ring && type === 'sweep') type = ['orbit', 'meet', 'spokes', 'orbit'][Math.floor(hash(i, sd, 144) * 3.99)];      // on a ring, what sweeps goes round it
      const d = type === 'orbit' ? 1.1 + 0.8 * hash(i, sd, 142) : type === 'meet' ? 0.9 + 0.6 * hash(i, sd, 142) : type === 'spokes' ? 1.8 + 1.4 * hash(i, sd, 142) : type === 'sweep' ? 0.7 + 0.6 * hash(i, sd, 142) : type === 'strobe' ? 0.45 + 0.5 * hash(i, sd, 142) : type === 'flood' ? 0.9 : 0.3 + 0.3 * hash(i, sd, 142);
      ev.push(mkEv(h.t, type, hash(i, sd, 141) * 1e6, d));
      if (h.drop && h.drop.gap && P.base > 0.3 && h.t - h.drop.gap > a) ev.push(mkEv(h.t - h.drop.gap, 'blackout', 0, h.drop.gap));   // the breath before a drop goes dark
    });
  }
  if (P.fx > 0.02) {                                         // glitch clips: builds, drops, and each band's own jumps
    const fx = P.fx, pick = (list, gap, salt, keepP) => {
      const out = [];
      list.filter(here).sort((x, y) => y.v - x.v).forEach((c, i) => { if (hash(Math.round(c.t * 100), sd, salt) < keepP && out.every(o => far(o.t, c.t) > gap)) out.push(c); });
      return out;
    };
    st.builds.filter(u => u.b > a && u.a < b).forEach((u, i) => {
      const s0 = Math.max(a, u.a), L = Math.min(b, u.b) - s0;
      if (L < 1) return;
      ev.push(mkEv(s0, 'chase', hash(i, sd, 181) * 1e6, L));        // a build always gets its chase
      const n = 2 + Math.floor(fx * 4.99);                   // line volleys that come faster as the drop nears
      for (let j = 0; j < n; j++) { const x = j / n; ev.push(mkEv(s0 + L * (1 - (1 - x) * (1 - x)), 'lines', hash(i * 9 + j, sd, 182) * 1e6, Math.max(0.25, 0.7 * (1 - 0.6 * x)))); }
    });
    drops.forEach((d, i) => { if (hash(i, sd, 183) < 0.3 + 0.7 * fx) ev.push(mkEv(d.t, 'glitch', hash(i, sd, 184) * 1e6, 0.4 + 0.5 * hash(i, sd, 185))); });
    const kinds = [['blocks', lerp(7, 1.1, fx), 186], ['bars', lerp(6, 0.9, fx), 187], ['sparks', lerp(5, 0.7, fx), 188]];
    kinds.forEach(([type, gap, salt], band) => {
      for (const c of pick(st.peaks[band], gap, salt, 0.25 + 0.6 * fx)) {
        const lines = band === 1 && hash(Math.round(c.t * 100), sd, 189) < 0.4;      // the mids sometimes throw lines instead of bars
        ev.push(mkEv(c.t, lines ? 'lines' : type, hash(Math.round(c.t * 100), sd, 190) * 1e6, lines ? 0.45 + 0.4 * hash(Math.round(c.t * 100), sd, 191) : 0.35 + 0.4 * hash(Math.round(c.t * 100), sd, 191)));
      }
    });
    // the end of a quiet stretch tears before the sound comes back
    st.breaks.filter(u => u.b > a + 0.4 && u.b < b).forEach((u, i) => { if (hash(i, sd, 192) < fx) ev.push(mkEv(u.b - 0.3, 'glitch', hash(i, sd, 193) * 1e6, 0.3)); });
  }
  // the logo plain and steady as the piece opens and as it closes (a track only: a loop has no ends)
  if (P.cleanEnds && !cyc && P.mode !== undefined) { const len = Math.min(4, D * 0.12); if (a <= 0) ev.push(mkEv(0, 'show', 7, len, { clean: true })); if (b >= D) ev.push(mkEv(D - len, 'show', 8, len, { clean: true })); }
  const nextHit = (t, lo, hi) => { for (const h of hits) if (h.t >= t + lo && h.t <= t + hi) return h.t; return -1; };
  if (P.mode === 2) ev.push(mkEv(a, 'show', 1, whole ? D + 1 : b - a + 0.01));
  else if (P.mode === 0) {
    if (cyc && whole) {
      ev.push(mkEv(0.04 * D, 'load', hash(sd, 1, 150) * 1e6, 0.38 * D));
      if (P.presence < 0.97) ev.push(mkEv(lerp(0.6, 0.96, P.presence) * D, 'hide', 0));
    } else {
      if (pi > 0) ev.push(mkEv(a, 'hide', 0));
      for (let t = a + 0.3, n = 0; t < b - 2; n++) {         // loader, hold, gone; the load always lands on a hit
        let ld = 2.2 + 3.5 * hash(n, sd, 151); const hit = nextHit(t, 1.6, 7); if (hit > 0) ld = hit - t;
        ld = Math.min(ld, b - t - 0.3);
        ev.push(mkEv(t, 'load', hash(n, sd, 152) * 1e6, ld));
        let end = t + ld + lerp(1.5, 9, P.presence) * (0.6 + 0.8 * hash(n, sd, 153)); const h2 = nextHit(end, -0.6, 2.5); if (h2 > 0) end = h2;
        if (end < b - 0.5) ev.push(mkEv(end, 'hide', 0));
        t = end + lerp(9, 0.7, P.presence) * (0.6 + 0.8 * hash(n, sd, 154));
      }
    }
  } else {
    if (pi > 0) ev.push(mkEv(a, 'hide', 0));
    hits.forEach((h, i) => {
      if (hash(i, sd, 155) > 0.22 + 0.62 * P.presence) return;
      const nx = i + 1 < hits.length ? hits[i + 1].t : b;
      ev.push(mkEv(h.t, 'show', i, Math.min(Math.max(0.25, (nx - h.t) * 0.95), lerp(0.7, 3.2, P.presence), Math.max(0.1, b - h.t))));
    });
  }
  if (P.pil > 0.02) {                                        // pillar patterns: something different every few seconds, so a long piece keeps changing
    const pil = P.pil, r = (n, salt) => hash(n, sd, salt), busy = [];
    const quiet = t => st.breaks.some(u => t > u.a - 0.2 && t < u.b - 0.3);
    st.builds.filter(u => u.b > a && u.a < b).forEach((u, i) => {          // the picture fills in pillar by pillar through a build
      const s0 = Math.max(a, u.a), L = Math.min(b, u.b) - s0;
      if (L >= 1.2) { ev.push(mkEv(s0, 'pillar', r(i, 231) * 1e6, L, { fx: 'build', pm: 'mask', sp: 1, wd: 0.3 })); busy.push([s0, s0 + L]); }
    });
    drops.forEach((d, i) => {                                              // and a drop sets it spinning
      if (r(i, 232) > 0.3 + 0.7 * pil) return;
      const L = Math.min(b - d.t, 1.5 + 2.5 * r(i, 233));
      if (L >= 0.8) { ev.push(mkEv(d.t, 'pillar', r(i, 234) * 1e6, L, { fx: r(i, 235) < 0.6 ? 'spin' : 'chase', pm: r(i, 236) < 0.5 ? 'light' : 'mask', sp: 1.2 + 1.2 * r(i, 237), wd: 0.2 + 0.25 * r(i, 238) })); busy.push([d.t, d.t + L]); }
    });
    const free = PILLAR_FX.filter(f => f !== 'build' && f !== 'drain');
    let last = -1;
    for (let t = a + 0.5 + 3 * r(0, 239), n = 0; t < b - 1.5; n++) {
      const hit = hits.find(h => h.t >= t - 0.25 && h.t < t + 1.2), t0 = hit ? hit.t : t;                 // start on a hit when one is near
      const L = Math.min(b - t0 - 0.1, 2.5 + 6 * r(n, 240));
      if (L > 1.2 && r(n, 241) < 0.2 + 0.75 * pil && !quiet(t0) && !busy.some(q => t0 < q[1] + 0.3 && t0 + L > q[0] - 0.3)) {
        let k = Math.floor(r(n, 242) * free.length * 0.999); if (k === last) k = (k + 1) % free.length;   // never the same pattern twice running
        last = k;
        ev.push(mkEv(t0, 'pillar', r(n, 243) * 1e6, L, { fx: free[k], pm: r(n, 244) < 0.72 ? 'mask' : 'light', sp: 0.5 + 1.6 * r(n, 245) * r(n, 246), wd: 0.12 + 0.4 * r(n, 247) }));
      }
      t = t0 + L + lerp(7, 0.4, pil) * (0.4 + 1.2 * r(n, 248));
    }
  }
  if (P.sym > 0.02) {                                        // shapes from the bank: on drops, and now and then on a strong hit
    const r = (n, salt) => hash(n, sd, salt), strong = hits.slice().sort((x, y) => y.v - x.v).slice(0, Math.ceil(hits.length * 0.25));
    const cand = drops.map(d => d.t).concat(strong.map(h => h.t)), used = [];
    cand.forEach((t, n) => {
      if (r(Math.round(t * 100), 271) > 0.15 + 0.7 * P.sym || used.some(q => Math.abs(q - t) < lerp(16, 4, P.sym))) return;
      const L = Math.min(b - t - 0.05, 1.5 + 3.5 * r(n, 272));
      if (L < 0.8) return;
      used.push(t);
      const each = r(n, 273) < 0.35;
      ev.push(mkEv(t, 'sym', r(n, 274) * 1e6, L, { step: true, echo: each ? 0 : 1 + Math.floor(r(n, 275) * 3.99), ex: (r(n, 276) - 0.5) * 0.14, ey: (r(n, 277) - 0.5) * 0.14, size: each ? 0.8 : 0.45 + 0.35 * r(n, 278), each, dl: each ? [0, 1, 1, 2][Math.floor(r(n, 279) * 3.99)] * 0.5 : 0 }));
    });
  }
  return ev;
}
// Loader progress: it jumps between a handful of checkpoints, like a real one stalling and catching up.
function prog(x, seed) {
  if (x >= 1) return 1;
  const n = 5 + Math.floor(hash(seed, 1, 160) * 5);
  let tot = 0, cum = 0;
  for (let j = 0; j < n; j++) tot += 0.3 + hash(seed, j, 162);
  let p = 0;
  for (let j = 0; j < n; j++) {
    const tj = (j + 0.8 * hash(seed, j, 161)) / n;
    if (tj > x) break;
    const inc = 0.3 + hash(seed, j, 162);
    p = cum + inc * oExpo(clamp01((x - tj) * n * 1.6));       // each jump lands with an ease, never a step
    cum += inc;
  }
  return Math.min(0.97, p / tot);
}

function newState() {
  const sl = []; for (let i = 0; i < 6; i++) sl.push({ a: 0, b: 0, d: 0 });
  return { s: 1, ox: 0, oy: 0, rot: 0, kx: 1, sk: 0, y0: 0, y1: 1, x0: 0, x1: 1, slabX: 0, slabW: 0, gain: 1, flash: 0, pulse: 0,
    inv: false, black: false, crush: 0, rods: 0, hide: false, seed: 0, nSl: 0, sl, eq: 0, eqv: new Float32Array(NB), eqLay: 0,
    tx: 1, ty: 1, dens: 1, va: 0.3, vb: 0.7, tearA: 0, tearF: 3, tearP: 0, dropA: 0, dropF: 4, dropP: 0, gI: 0, gx: 0, gy: 0,
    bLo: 0, bMid: 0, bHi: 0, loK: 0, miK: 0, hiK: 0, fbx: 0, fby: 0,
    hl: new Float32Array(4), vl: new Float32Array(4), hI: new Float32Array(4), vI: new Float32Array(4), lines: false, pulseLines: false,
    pn: 0, pHz: false, pp: new Float32Array(12), pc: new Float32Array(12), pL: new Float32Array(12), pI: new Float32Array(12), pE: new Float32Array(12),
    bn: 0, bt: new Int8Array(3), bx: new Float32Array(3), ba: new Float32Array(3), bs: new Int32Array(3),
    lsN: 0, lsX: new Float32Array(2), lsS: new Int32Array(2), chase: 0, chSeed: 0, chI: 1, fxGain: 1, tau: 0,
    lv: 0, lp: 1, lseed: 0, lsince: 9, sty: new Int8Array(3), tyN: 0, tyE: [null, null], tyX: new Float32Array(2), tyA: new Float32Array(2),
    pfN: 0, pfE: [null, null, null], pfX: new Float32Array(3), pfA: new Float32Array(3), mi: 0, dtm: 9,
    syN: 0, syE: [null, null], syA: new Float32Array(2) };
}
// relative weights of the hard glitch states; every section of the piece leans on a different few
const GW = [0.2, 0.2, 0.22, 0.07, 0.12, 0.1, 0.14, 0.12, 0.12];
function stateAt(sc, tau, cfg, st) {
  const sd = sc.seed, ch = cfg.chaos, D = sc.D;
  st.tau = tau;
  // which hold of the glitch clock we are in, and how far through it
  const sp = sc.steps;
  let k = sc._k | 0;
  if (k >= sp.length - 1 || sp[k] > tau) k = 0;
  while (k + 2 < sp.length && sp[k + 1] <= tau) k++;
  sc._k = k;
  const ph = clamp01((tau - sp[k]) / (sp[k + 1] - sp[k])), settle = (1 - ph) * (1 - ph);
  const hp = Math.max(0, tau / sc.hop), h0 = Math.min(sc.nh - 1, hp | 0), h1 = Math.min(sc.nh - 1, h0 + 1), hf = hp - (hp | 0);
  const cv = a => a[h0] + (a[h1] - a[h0]) * hf;
  const pk = cv(sc.pulse);
  // everything scheduled or triggered that is live right now
  st.bn = 0; st.lsN = 0; st.tyN = 0; st.pfN = 0; st.syN = 0; st.black = false;
  let gX = 0, cz = 0, czSeed = 0, xLo = 0, xMid = 0, xHi = 0, lg = null, lgAge = 1e9, clAge = 1e9, strike = 0;
  const all = sc.live || sc.all;                          // without the lanes that are switched off or not soloed
  for (let q = 0; q < all.length; q++) {
    const e = all[q];
    if (e.face && cfg.face !== undefined && e.face !== cfg.face + 1) continue;      // a clip for the other face of the ring
    let age = tau - e.t;
    if (age < 0) { if (!sc.cyclic) continue; age += D; }
    if (e.k === 17) { if (age < e.d && st.pfN < 3) { st.pfE[st.pfN] = e; st.pfX[st.pfN] = age / e.d; st.pfA[st.pfN] = age; st.pfN++; } continue; }
    if (e.k >= 14 && e.k <= 16) { if (age < e.d && st.bn < 3) { st.bt[st.bn] = e.k; st.bx[st.bn] = age / e.d; st.ba[st.bn] = age; st.bs[st.bn] = e.seed; st.bn++; } continue; }
    if (e.k === 18) { if (age < e.d && st.syN < 2) { st.syE[st.syN] = e; st.syA[st.syN] = age; st.syN++; } continue; }
    if (e.k === 13) { if (age < e.d && st.tyN < 2) { st.tyE[st.tyN] = e; st.tyX[st.tyN] = age / e.d; st.tyA[st.tyN] = age; st.tyN++; } continue; }
    if (e.k === 11 && e.clean) { if (age < e.d && age < clAge) clAge = age; continue; }      // a clean Show wins over whatever else the logo is doing
    if (e.k >= 10) { if (age < lgAge && !(e.k === 11 && age >= e.d)) { lgAge = age; lg = e; } continue; }   // a Show that has run out hands back to whatever came before it
    if (age >= e.d) continue;
    const x = age / e.d;
    if (e.k <= 2) { if (st.bn < 3) { st.bt[st.bn] = e.k; st.bx[st.bn] = x; st.ba[st.bn] = age; st.bs[st.bn] = e.seed; st.bn++; } }
    else if (e.k === 3) st.black = true;
    else if (e.k === 4) gX = Math.max(gX, 1 - x * x);
    else if (e.k === 5) { cz = 1; czSeed = e.seed; }
    else if (e.k === 6) { if (cfg.lineMode) strike = Math.max(strike, Math.exp(-age / (0.3 * e.d))); else if (st.lsN < 2) { st.lsX[st.lsN] = x; st.lsS[st.lsN] = e.seed; st.lsN++; } }   // a Lines clip strikes every line, or in Slide mode sends a volley across
    else if (e.k === 7) xHi = Math.max(xHi, 1 - x);
    else if (e.k === 8) xMid = Math.max(xMid, 1 - x);
    else xLo = Math.max(xLo, 1 - x);
  }
  // logo: loading, shown or gone
  st.lv = 0; st.lp = 1; st.lsince = 9;
  if (lg) {
    st.lseed = lg.seed;
    if (lg.k === 10) { if (lgAge < lg.d) { st.lv = 1; st.lp = prog(lgAge / lg.d, lg.seed); } else { st.lv = 2; st.lsince = lgAge - lg.d; } }
    else if (lg.k === 11 && lgAge < lg.d) { st.lv = 2; st.lsince = lgAge; }
  }
  // the logo plain and steady, after the two wrong frames every cut goes through
  st.clean = clAge < 1e8 && clAge > 0.07;
  if (clAge < 1e8) { st.lv = 2; st.lp = 1; st.lsince = clAge; }
  const Gv = Math.min(1, Math.max(cv(sc.G) * cfg.glitch * 1.6, gX));
  // stutter: the motion freezes for a hold, or skips back and replays
  let te = tau;
  if (Gv > 0.3 && k > 0) {
    const hs = hash(k, sd, 70);
    if (hs < 0.2 * Gv) te = sp[k]; else if (hs < 0.32 * Gv) te = Math.max(0, tau - 0.08 - 0.25 * hash(k, sd, 71));
  }
  const mv = sc.moves;
  let i = sc._i | 0;
  if (i >= mv.length || mv[i].t > te) i = 0;
  while (i + 1 < mv.length && mv[i + 1].t <= te) i++;
  sc._i = i;
  const m = mv[i], dtm = te - m.t, A = m.from, B = m.to;
  st.mi = m.i; st.dtm = Math.max(0, tau - m.t);          // which hit we are after, and how long ago it was: pillar patterns key off these
  // the logo never glides: it cuts to its next pose through two or three wrong frames
  let a = 1;
  if (dtm < 0.1) { const j = Math.floor(dtm * 30 + 1e-6); a = j <= 0 ? 0.3 + 0.5 * hash(m.i, sd, 110) : j === 1 ? 0.75 + 0.45 * hash(m.i, sd, 111) : 0.92 + 0.16 * hash(m.i, sd, 112); }
  const burst = Math.max(Math.max(0, 1 - dtm / 0.24), st.lv === 2 ? Math.max(0, 1 - st.lsince / 0.3) : 0), b2 = burst * burst;
  if (st.lv === 1) { st.s = 1; st.ox = 0; st.oy = 0; st.rot = 0; st.kx = 1; st.sk = 0; st.y0 = 0; st.y1 = 1; st.x0 = 0; st.x1 = 1; }   // a loader sits still and centred
  else {
    st.s = Math.max(0.05, A.s + (B.s - A.s) * a); st.ox = A.ox + (B.ox - A.ox) * a; st.oy = A.oy + (B.oy - A.oy) * a;
    st.rot = A.rot + (B.rot - A.rot) * a; st.kx = Math.max(0.1, A.kx + (B.kx - A.kx) * a); st.sk = A.sk + (B.sk - A.sk) * a;
    st.y0 = clamp01(A.y0 + (B.y0 - A.y0) * a); st.y1 = Math.max(st.y0, clamp01(A.y1 + (B.y1 - A.y1) * a));
    st.x0 = clamp01(A.x0 + (B.x0 - A.x0) * a); st.x1 = Math.max(st.x0, clamp01(A.x1 + (B.x1 - A.x1) * a));
  }
  // twitch: a new random nudge every hold that snaps back, harder in a burst, after a cut and on a bass hit
  const ja = (0.05 * Gv + 0.035 * burst + 0.012 * pk * ch) * settle;
  st.ox += (hash(k, sd, 16) - 0.5) * 2 * ja; st.oy += (hash(k, sd, 17) - 0.5) * 1.4 * ja;
  // the fast eased motion belongs to the lines; each one leaves a touch later than the last
  st.lines = cfg.lines > 0.02; st.pulseLines = st.lines && !!cfg.lineMode;
  if (st.pulseLines) {
    // Pulse: a rack of parallel bars, each showing a short lit stretch. The whole rack strikes out in length and light the
    // instant the sound hits, then sinks back, every bar a little in its own way. Nothing glides: the stretches sit where
    // they are, creeping slightly, and stand somewhere else after the next hit.
    const bands = [sc.pulse, sc.mid, sc.hi], N = st.pn = 12;
    const at = (a, t) => { let hp = t / sc.hop; if (hp < 0) hp = sc.cyclic ? hp + sc.nh : 0; return a[Math.min(sc.nh - 1, hp | 0)]; };
    st.pHz = hash(m.sec, sd, 200) < 0.5;
    const c0 = 0.3 + 0.4 * hash(m.i, sd, 205), slope = (hash(m.i, sd, 207) - 0.5) * 0.9, bow = (hash(m.i, sd, 208) - 0.5) * 0.5;
    for (let j = 0; j < N; j++) {
      const dly = 0.03 * hash(j, sd, 201), x = j / (N - 1) - 0.5;
      const env = Math.max(strike, clamp01(Math.max(at(sc.pulse, tau - dly), 0.75 * at(bands[j % 3], tau - dly)) * (0.7 + 0.5 * hash(j, sd, 202))));
      const creep = sc.cyclic ? Math.sin(TAU * (tau / D + hash(j, sd, 206))) : nz(tau * 0.11 + j * 7.3, sd);
      st.pp[j] = (j + 0.5 + 0.5 * (hash(m.sec * 16 + j, sd, 209) - 0.5)) / N;
      st.pc[j] = c0 + slope * x + bow * (x * x - 0.08) + 0.06 * (hash(m.i * 16 + j, sd, 210) - 0.5) + 0.03 * creep;
      st.pL[j] = lerp(0.014, 0.14 + 0.3 * hash(m.i * 16 + j, sd, 204), Math.pow(env, 0.75));
      st.pI[j] = cfg.lines * (0.55 + 0.45 * env) * (1 - 0.12 * hash(k, j, 203));          // a lamp is never quite steady
      st.pE[j] = env;
    }
  } else if (st.lines) {
    for (let j = 0; j < 4; j++) {
      const eh = m.le(clamp01((dtm / m.ld - m.ldl[j]) / 0.6)), evv = m.le(clamp01((dtm / m.ld - m.ldl[j + 4]) / 0.6));
      st.hl[j] = m.L0.h[j] + (m.L.h[j] - m.L0.h[j]) * eh; st.hI[j] = cfg.lines * (0.5 + 2 * eh * (1 - eh));
      st.vl[j] = m.L0.v[j] + (m.L.v[j] - m.L0.v[j]) * evv; st.vI[j] = cfg.lines * (0.5 + 2 * evv * (1 - evv));
    }
  }
  if (st.lines && cfg.ease > 0.02) {
    const tw = cfg.tw, dr = 0.012 * cfg.ease;
    for (let j = 0; j < 4; j++) {
      const a1 = hash(j, sd, 113), a2 = hash(j, sd, 114);
      st.hl[j] += dr * (sc.cyclic ? Math.sin(TAU * ((1 + j % 2) * tau / D + a1)) : Math.sin(TAU * ((0.11 + 0.05 * j) * tw + a1)));
      st.vl[j] += dr * 0.6 * (sc.cyclic ? Math.sin(TAU * ((1 + (j + 1) % 2) * tau / D + a2)) : Math.sin(TAU * ((0.09 + 0.04 * j) * tw + a2)));
    }
  }
  const sx = clamp01(dtm / m.ld), se = m.le(sx);
  if (m.slab && st.lines && !st.pulseLines && sx > 0 && sx < 1) { st.slabX = m.slab > 0 ? -0.2 + 1.4 * se : 1.2 - 1.4 * se; st.slabW = m.slabW * 0.5; } else st.slabW = 0;
  st.pulse = pk;
  st.gain = Math.min(1, cv(sc.gain) + 0.3 * pk);
  st.flash = 0.45 * pk;
  if (sc.spec && cfg.eq) {
    st.eq = cfg.eq;
    for (let b = 0; b < NB; b++) st.eqv[b] = sc.spec[h0 * NB + b] + (sc.spec[h1 * NB + b] - sc.spec[h0 * NB + b]) * hf;
  } else st.eq = 0;
  // the piece falls into sections a few moves long; each has its own layout and habits
  const sec = m.sec, c1 = hash(sec, sd, 92), c2 = hash(sec, sd, 93), c3 = hash(sec, sd, 94), c4 = hash(sec, sd, 95);
  st.tx = 1; st.ty = 1; st.dens = 1; st.eqLay = sec ? Math.floor(c2 * 2.99) : 0;
  if (st.lv === 2) {
    if (sec && c1 < 0.3 * ch) { st.tx = 2 + Math.floor(c2 * 2.99); if (c3 < 0.4) st.ty = 2; }
    if (sec && c3 < 0.45 * ch) st.dens = c4 < 0.5 ? 0.6 : 1.5;
  }
  for (let L = 0; L < 3; L++) st.sty[L] = cfg.mix && sec ? Math.floor(hash(sec, sd, 98 + L) * 4.99) : -1;
  st.va = sec ? hash(sec, sd, 96) : 0.3; st.vb = sec ? hash(sec, sd, 97) : 0.7;
  if (!cz && cfg.chase > 0.02 && hash(sec, sd, 170) < cfg.chase) { cz = 1; czSeed = sec * 7 + 3 + sd; }
  st.chase = cz; st.chSeed = czSeed; st.chI = 0.55 + 0.45 * cv(sc.mid);
  // hard glitch states, one per hold
  st.inv = false; st.crush = 0; st.rods = 0; st.hide = false; st.nSl = 0; st.seed = k;
  let ghost = 0, hard = false;
  if (Gv > 0.25 && hash(k, sd, 10) < sstep(0.25, 0.85, Gv)) {
    const r1 = hash(k, sd, 12), r2 = hash(k, sd, 13);
    const wt = j => GW[j] * (0.25 + 1.5 * hash(sec * 16 + j, sd, 91)) * (j === 0 || j === 3 ? Gv : 1);
    let sum = 0, pick = -1;
    for (let j = 0; j < 9; j++) sum += wt(j);
    let h = hash(k, sd, 11) * sum;
    for (let j = 0; j < 9 && pick < 0; j++) { h -= wt(j); if (h <= 0) pick = j; }
    hard = true;
    if (pick === 0) st.black = true;
    else if (pick === 1) { st.rods = 0.1 + 0.4 * r1; st.hide = r2 < 0.5; }
    else if (pick === 2) {
      st.nSl = 2 + Math.floor(r1 * 4);
      for (let j = 0; j < st.nSl; j++) { const s = st.sl[j]; s.a = hash(k, j, 21); s.b = s.a + 0.04 + 0.2 * hash(k, j, 22); s.d = (hash(k, j, 23) - 0.5) * 0.55 * Gv * (0.35 + 0.65 * settle); }
    }
    else if (pick === 3) st.inv = true;
    else if (pick === 4) st.crush = 4 + Math.floor(r1 * 12);
    else if (pick === 5) { st.slabX = r1; st.slabW = 0.03 + 0.12 * r2; }
    else if (pick === 6) { st.ox += (r1 - 0.5) * 0.36 * settle; st.oy += (r2 - 0.5) * 0.26 * settle; st.s *= 1 + (hash(k, sd, 18) - 0.5) * 0.8 * settle; }
    else if (pick === 7) { st.tx = 2 + Math.floor(r1 * 3.99); st.ty = 1 + Math.floor(r2 * 2.99); }
    else ghost = 0.85 * (0.3 + 0.7 * settle);
    if (hash(k, sd, 14) < 0.2) st.flash += 0.6 * settle;
  }
  // between bursts, stray single tears keep the picture from ever sitting clean for long
  if (!hard && hash(k, sd, 15) < 0.16 * ch * cfg.glitch) {
    const s = st.sl[0]; st.nSl = 1; s.a = hash(k, sd, 24); s.b = s.a + 0.03 + 0.12 * hash(k, sd, 25); s.d = (hash(k, sd, 26) - 0.5) * 0.24 * settle;
  }
  // soft glitch: the frame tears sideways and columns slip, harder in a burst, after a cut and on a bass hit
  const live = Gv > 0.25, g2 = Gv * Gv;
  st.tearA = 0.14 * g2 * (0.3 + 0.7 * hash(k, sd, 72)) + 0.03 * pk * ch + 0.09 * b2;
  st.tearF = live ? 2 + 9 * hash(k, sd, 73) : 3.1; st.tearP = cfg.tw * 1.7 + (live ? k * 13.1 : 0);
  st.dropA = 0.11 * g2 * (0.3 + 0.7 * hash(k, sd, 74)) + 0.02 * pk * ch + 0.06 * b2;
  st.dropF = live ? 3 + 14 * hash(k, sd, 79) : 4.3; st.dropP = cfg.tw * 1.3 + (live ? k * 7.7 : 0);
  const ga = TAU * hash(m.i, sd, 75), gm = (0.02 + 0.09 * pk) * ch + 0.2 * ghost + 0.12 * b2;
  st.gI = Math.min(0.85, 0.45 * pk * ch + ghost + 0.6 * b2); st.gx = Math.cos(ga) * gm; st.gy = Math.sin(ga) * gm;
  // debris: bass, mids and highs each drive their own kind
  st.bLo = Math.max(cfg.bgLo * cv(sc.lo), xLo); st.bMid = Math.max(cfg.bgMid * cv(sc.mid), xMid); st.bHi = Math.max(cfg.bgHi * cv(sc.hi), xHi);
  st.loK = sc.loIdx[h0] + sec * 131; st.miK = sc.miIdx[h0] + sec * 57; st.hiK = k;
  // the glitch layer steps back while the logo is up
  st.fxGain = 1 - 0.4 * (st.lv === 2 ? 1 : st.lv === 1 ? 0.4 : 0);
  if (st.tyN || st.clean) st.fxGain *= 0.4;                           // words and big base moments get the frame to themselves
  if (st.bn) st.fxGain *= 0.6;
  // trails smear along a direction that changes with every cut
  const fa = TAU * hash(m.i, sd, 76);
  st.fbx = Math.cos(fa) * (2 + 10 * pk + 14 * b2); st.fby = Math.sin(fa) * (2 + 10 * pk + 14 * b2);
  return st;
}

/* ---------- automation: keyframes on a setting. Never linear: each key leaves with an ease, a snap or a cut ---------- */
// keys: [{t, v, c}] sorted by t. c: 0 ease, 1 snap, 2 cut (holds until the next key). On a loop the last key runs round into the first.
const ACURVE = [ioQuint, ioExpo, () => 0];
function autoVal(keys, t, D, cyclic) {
  const n = keys.length;
  if (n === 1) return keys[0].v;
  let i = -1;
  for (let j = 0; j < n && keys[j].t <= t; j++) i = j;
  let a, b, span, x;
  if (i >= 0 && i < n - 1) { a = keys[i]; b = keys[i + 1]; span = b.t - a.t; x = t - a.t; }
  else if (!cyclic) return i < 0 ? keys[0].v : keys[n - 1].v;
  else { a = keys[n - 1]; b = keys[0]; span = b.t + D - a.t; x = i < 0 ? t + D - a.t : t - a.t; }
  if (span <= 1e-6) return b.v;
  return a.v + (b.v - a.v) * ACURVE[a.c | 0](clamp01(x / span));
}

/* ---------- timecode: SMPTE maths, MIDI timecode and LTC. No DOM ---------- */
// real: frames per second of wall time. fps: the count the frame number runs to. mtc: the rate code MIDI timecode uses.
const TC_RATES = {
  '24': { fps: 24, real: 24, df: false, mtc: 0 },
  '25': { fps: 25, real: 25, df: false, mtc: 1 },
  '29.97': { fps: 30, real: 30000 / 1001, df: true, mtc: 2 },
  '30': { fps: 30, real: 30, df: false, mtc: 3 }
};
const TC_BY_MTC = ['24', '25', '29.97', '30'];
function tcToFrames(h, m, s, f, R) {
  let n = ((h * 60 + m) * 60 + s) * R.fps + f;
  if (R.df) { const tm = h * 60 + m; n -= 2 * (tm - Math.floor(tm / 10)); }
  return n;
}
function framesToTc(n, R) {
  const day = R.df ? 2589408 : R.fps * 86400;
  n = ((Math.floor(n) % day) + day) % day;
  if (R.df) { const d = Math.floor(n / 17982), r = n % 17982; n += 18 * d + 2 * Math.max(0, Math.floor((r - 2) / 1798)); }
  return { h: Math.floor(n / (R.fps * 3600)), m: Math.floor(n / (R.fps * 60)) % 60, s: Math.floor(n / R.fps) % 60, f: n % R.fps };
}
const tc2 = n => (n < 10 ? '0' : '') + n;
const tcString = (n, R) => { const c = framesToTc(n, R); return tc2(c.h) + ':' + tc2(c.m) + ':' + tc2(c.s) + (R.df ? ';' : ':') + tc2(c.f); };
// "01:00:00:00" to a frame count, or null when it is not a timecode at this rate
function parseTc(str, R) {
  const p = String(str).trim().split(/[:;.]/).map(Number);
  if (p.length !== 4 || p.some(x => !Number.isInteger(x) || x < 0)) return null;
  if (p[0] > 23 || p[1] > 59 || p[2] > 59 || p[3] >= R.fps) return null;
  if (R.df && p[2] === 0 && p[3] < 2 && p[1] % 10 !== 0) p[3] = 2;      // the two numbers drop-frame skips
  return tcToFrames(p[0], p[1], p[2], p[3], R);
}

/* MIDI timecode */
function mtcQuarter(piece, c, rate) {
  const v = [c.f & 15, c.f >> 4, c.s & 15, c.s >> 4, c.m & 15, c.m >> 4, c.h & 15, (rate << 1) | (c.h >> 4)][piece];
  return [0xF1, (piece << 4) | v];
}
const mtcFull = (c, rate) => [0xF0, 0x7F, 0x7F, 0x01, 0x01, (rate << 5) | c.h, c.m, c.s, c.f, 0xF7];
// Feed it MIDI messages with the time each arrived (seconds). read(now) gives where the incoming clock is.
class MtcReader {
  constructor() { this.nib = new Uint8Array(8); this.got = 0; this.p0 = 0; this.ref = null; this.last = -1; this.rate = null; }
  feed(d, now) {
    if (d[0] === 0xF1 && d.length > 1) {
      const piece = d[1] >> 4;
      if (piece === 0) { this.got = 0; this.p0 = now; }
      if (piece !== this.got) { this.got = 0; return; }       // out of order: wait for the next piece 0
      this.nib[piece] = d[1] & 15; this.got++; this.last = now;
      if (this.got === 8) {
        const n = this.nib, rate = TC_BY_MTC[(n[7] >> 1) & 3], R = TC_RATES[rate];
        this.rate = rate; this.got = 0;
        this.ref = { fr: tcToFrames(n[6] | ((n[7] & 1) << 4), n[4] | (n[5] << 4), n[2] | (n[3] << 4), n[0] | ((n[1] & 1) << 4), R), at: this.p0 };   // the time named is the moment piece 0 went out
      }
    } else if (d[0] === 0xF0 && d.length >= 10 && d[1] === 0x7F && d[3] === 0x01 && d[4] === 0x01) {
      const rate = TC_BY_MTC[(d[5] >> 5) & 3], R = TC_RATES[rate];
      this.rate = rate; this.got = 0; this.last = -1;
      this.ref = { fr: tcToFrames(d[5] & 31, d[6], d[7], d[8], R), at: now };
    }
  }
  read(now) {
    if (!this.ref) return null;
    const R = TC_RATES[this.rate], running = this.last >= 0 && now - this.last < 0.12;
    return { running, rate: this.rate, frames: this.ref.fr + (running ? (now - this.ref.at) * R.real : 0) };
  }
}

/* LTC: 80 bits a frame, biphase mark */
const LTC_SYNC = [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1];
function ltcBits(n, R, out) {
  const c = framesToTc(n, R), b = out || new Uint8Array(80);
  b.fill(0);
  const put = (at, v, len) => { for (let i = 0; i < len; i++) b[at + i] = (v >> i) & 1; };
  put(0, c.f % 10, 4); put(8, Math.floor(c.f / 10), 2); b[10] = R.df ? 1 : 0;
  put(16, c.s % 10, 4); put(24, Math.floor(c.s / 10), 3);
  put(32, c.m % 10, 4); put(40, Math.floor(c.m / 10), 3);
  put(48, c.h % 10, 4); put(56, Math.floor(c.h / 10), 2);
  for (let i = 0; i < 16; i++) b[64 + i] = LTC_SYNC[i];
  let ones = 0; for (let i = 0; i < 80; i++) ones += b[i];
  if (ones & 1) b[R.fps === 25 ? 59 : 27] = 1;                // keeps the phase of every frame the same
  return b;
}
// count frames of LTC as samples, starting at frame number n. st.lv carries the signal level from one block to the next.
function ltcEncode(n, count, R, sr, st) {
  const spb = sr / (R.real * 80), N = Math.round(count * 80 * spb), out = new Float32Array(N), bits = new Uint8Array(80);
  let lv = st && st.lv ? st.lv : 0.5, pos = 0;
  for (let j = 0; j < count; j++) {
    ltcBits(n + j, R, bits);
    for (let i = 0; i < 80; i++) {
      const a = Math.round((j * 80 + i) * spb), m = Math.round((j * 80 + i + 0.5) * spb), z = Math.min(N, Math.round((j * 80 + i + 1) * spb));
      lv = -lv;
      for (pos = a; pos < m; pos++) out[pos] = lv;
      if (bits[i]) lv = -lv;
      for (; pos < z; pos++) out[pos] = lv;
    }
  }
  if (st) st.lv = lv;
  return out;
}
// Feed it sound; after each feed, .ref is the last frame read: { fr: frame number that starts at sample .at, at, rate hints }.
class LtcDecoder {
  constructor(sr) { this.sr = sr; this.n = 0; this.hi = false; this.since = 0; this.T = 0; this.half = false; this.reg = new Uint8Array(80); this.fill = 0; this.peak = 0.02; this.ref = null; this.lastEnd = 0; this.fps = 0; }
  bit(v) {
    const r = this.reg;
    r.copyWithin(0, 1); r[79] = v; if (this.fill < 80) this.fill++;
    if (this.fill < 80) return;
    for (let i = 0; i < 16; i++) if (r[64 + i] !== LTC_SYNC[i]) return;
    const g = (at, len) => { let v = 0; for (let i = 0; i < len; i++) v |= r[at + i] << i; return v; };
    const c = { f: g(0, 4) + 10 * g(8, 2), s: g(16, 4) + 10 * g(24, 3), m: g(32, 4) + 10 * g(40, 3), h: g(48, 4) + 10 * g(56, 2), df: !!r[10] };
    if (c.f > 29 || c.s > 59 || c.m > 59 || c.h > 23) return;
    if (this.lastEnd) { const fr = this.sr / (this.n - this.lastEnd); if (fr > 20 && fr < 33) this.fps = this.fps ? 0.8 * this.fps + 0.2 * fr : fr; }
    this.lastEnd = this.n;
    this.ref = { c, at: this.n, fps: this.fps };            // this frame has just ended: the next one starts at sample .at
    this.fill = 0;
  }
  feed(buf) {
    for (let i = 0; i < buf.length; i++) {
      const x = buf[i], ax = x < 0 ? -x : x;
      this.peak = ax > this.peak ? ax : this.peak * 0.9999 + 0.000002;
      const th = this.peak * 0.2, was = this.hi;
      if (x > th) this.hi = true; else if (x < -th) this.hi = false;
      this.n++; this.since++;
      if (this.hi === was) continue;
      const d = this.since; this.since = 0;
      if (!this.T || d > 3 * this.T) { this.T = d; this.half = false; this.fill = 0; continue; }
      if (d > 1.5 * this.T) this.T = d;                      // we had locked onto the short spacing
      else if (d < 0.35 * this.T) this.T = 2 * d;            // or onto something too long
      if (d > 0.75 * this.T) { this.T += (d - this.T) * 0.1; this.half = false; this.bit(0); }
      else if (this.half) { this.half = false; this.T += (2 * d - this.T) * 0.05; this.bit(1); }
      else this.half = true;
    }
  }
}
// Which rate an LTC frame belongs to, from its measured speed and drop-frame flag.
const ltcRate = ref => ref.c.df ? '29.97' : ref.fps && ref.fps < 24.5 ? '24' : ref.fps && ref.fps < 27 ? '25' : ref.fps && ref.fps < 29.985 ? '29.97' : '30';

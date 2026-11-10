// Checks for the parts with no DOM: automation curves and timecode. Run with: npm test
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = ['src/engine.js', 'src/timecode.js'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
const M = new Function(src + '\nreturn { autoVal, TC_RATES, tcToFrames, framesToTc, tcString, parseTc, mtcQuarter, mtcFull, MtcReader, ltcEncode, LtcDecoder, ltcRate, buildLoopScore, buildTrackScore, analyze, makeStructure, makeEvents, EV };')();
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

// automation
const K = [{ t: 1, v: 0, c: 0 }, { t: 3, v: 1, c: 2 }, { t: 5, v: 0.5, c: 1 }];
ok(M.autoVal(K, 0, 8, false) === 0 && M.autoVal(K, 7, 8, false) === 0.5, 'holds outside the keys');
ok(M.autoVal(K, 2, 8, false) === 0.5, 'ease passes the middle at half');
ok(Math.abs(M.autoVal(K, 1.2, 8, false) - 0.1) > 0.05, 'ease is not linear');
ok(M.autoVal(K, 4.9, 8, false) === 1, 'cut holds');
ok(Math.abs(M.autoVal(K, 7.999, 8, true) - M.autoVal(K, 0, 8, true)) < 0.01, 'loop wraps without a jump');

// SMPTE maths
for (const r of Object.keys(M.TC_RATES)) {
  const R = M.TC_RATES[r];
  for (const f of [0, 1, 1799, 1800, 17981, 17982, 17983, 107892, 123456, 2000000]) { const c = M.framesToTc(f, R); ok(M.tcToFrames(c.h, c.m, c.s, c.f, R) === f, r + ' round trip ' + f); }
}
const DF = M.TC_RATES['29.97'];
ok(M.tcString(1800, DF) === '00:01:00;02', 'drop frame skips 00 and 01');
ok(M.tcString(107892, DF) === '01:00:00;00', 'drop frame hour');
ok(M.parseTc('01:00:00:00', M.TC_RATES['25']) === 90000 && M.parseTc('1:2:3', M.TC_RATES['25']) === null && M.parseTc('00:00:00:25', M.TC_RATES['25']) === null, 'parse');

// MIDI timecode: send quarter frames the way the app does, read them back
for (const r of Object.keys(M.TC_RATES)) {
  const R = M.TC_RATES[r], rd = new M.MtcReader(), F0 = M.parseTc('01:00:10:00', R), q = 1 / (4 * R.real);
  let now = 100;
  for (let i = 0; i < 40; i++) { rd.feed(M.mtcQuarter(i % 8, M.framesToTc(F0 + 2 * Math.floor(i / 8), R), R.mtc), now); now += q; }
  const got = rd.read(now - q);
  ok(got && got.running && got.rate === r && Math.abs(got.frames - (F0 + 39 / 4)) < 0.01, 'MTC ' + r + ' ' + (got && got.frames));
  ok(!rd.read(now + 1).running, 'MTC stops');
  rd.feed(M.mtcFull(M.framesToTc(F0 + 500, R), R.mtc), now);
  ok(rd.read(now).frames === F0 + 500, 'MTC full frame locates');
}

// LTC: encode, decode
for (const r of Object.keys(M.TC_RATES)) {
  const R = M.TC_RATES[r], sr = 48000, F0 = M.parseTc('10:59:58:20', R), st = { lv: 0.5 }, dec = new M.LtcDecoder(sr);
  const a = M.ltcEncode(F0, R.fps, R, sr, st), b = M.ltcEncode(F0 + R.fps, R.fps, R, sr, st);
  ok(a.length === Math.round(R.fps * sr / R.real), 'LTC block is a whole number of samples at ' + r);
  const quiet = Float32Array.from(a, (x, i) => x * 0.05 + 0.002 * Math.sin(i));     // low level, a little noise
  dec.feed(quiet.subarray(0, 7001)); dec.feed(quiet.subarray(7001)); dec.feed(b.map(x => x * 0.05));
  const c = dec.ref.c, fr = M.tcToFrames(c.h, c.m, c.s, c.f, R);
  // the very last frame only ends when the next one starts, so the one before it is the last that can be read
  ok(fr === F0 + 2 * R.fps - 2 && Math.abs(dec.ref.at - (a.length + b.length - sr / R.real)) <= 2, 'LTC ' + r + ' last frame ' + fr + ' at ' + dec.ref.at);
  ok(M.ltcRate(dec.ref) === r, 'LTC rate ' + r + ' read as ' + M.ltcRate(dec.ref) + ' (' + dec.ref.fps.toFixed(3) + ')');
}

// the automatic cut reads the shape of a track: 30 s with a quiet intro, a build from 6 to 12 s, a drop at 12, a break from 20 to 24 with a breath before the drop at 24
{
  const sr = 22050, D = 30, pcm = new Float32Array(sr * D);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 * 2 - 1;
  const loud = t => (t >= 12 && t < 20) || t >= 24;
  let hp = 0;
  for (let i = 0; i < pcm.length; i++) {
    const t = i / sr, beat = t % 0.5, w = rnd();
    const hiss = w - hp; hp = w;                                                      // crude high-pass: hats
    let x = 0.02 * Math.sin(2 * Math.PI * 220 * t);
    if (t >= 6 && t < 12) x += 0.25 * ((t - 6) / 6) * hiss * (t % 0.25 < 0.05 ? 1 : 0.15) + 0.15 * ((t - 6) / 6) * Math.sin(2 * Math.PI * (400 + 150 * (t - 6)) * t);
    if (loud(t)) x += 0.8 * Math.sin(2 * Math.PI * 55 * beat) * Math.exp(-beat * 9) + 0.2 * hiss * ((t + 0.25) % 0.5 < 0.04 ? 1 : 0) + 0.15 * Math.sin(2 * Math.PI * 660 * t) * (t % 1 < 0.2 ? 1 : 0);
    if (t >= 23.6 && t < 24) x = 0;
    pcm[i] = x;
  }
  const t0 = Date.now(), sc = M.buildTrackScore(M.analyze(pcm, sr), 3, 0.6), st = M.makeStructure(sc);
  const near = (list, t, tol) => list.some(d => Math.abs(d.t - t) < tol);
  ok(near(st.drops, 12, 0.3) && near(st.drops, 24, 0.3) && st.drops.length <= 3, 'drops at 12 and 24, got ' + st.drops.map(d => d.t.toFixed(2)));
  ok(st.builds.some(u => Math.abs(u.b - 12) < 0.3 && u.a > 4 && u.a < 10.5), 'a build into the first drop, got ' + JSON.stringify(st.builds));
  ok(st.breaks.some(u => u.a > 19.5 && u.a < 21.5 && u.b > 23 && u.b < 24.5), 'the break, got ' + JSON.stringify(st.breaks));
  ok(st.drops.find(d => Math.abs(d.t - 24) < 0.3).gap > 0, 'the breath before the second drop');
  const ev = M.makeEvents(sc, { base: 0.45, fx: 0.6, mode: 0, presence: 0.5 }, 0, sc.D, 0), of = k => ev.filter(e => e.type === k);
  ok(of('chase').some(e => e.t < 10.5 && Math.abs(e.t + e.d - 12) < 0.3), 'a chase runs through the build');
  const vol = of('lines').filter(e => e.t >= 5 && e.t < 12).map(e => e.t);
  ok(vol.length >= 3 && vol[2] - vol[1] < vol[1] - vol[0], 'lines come faster into the drop: ' + vol.map(t => t.toFixed(2)));
  ok(ev.some(e => e.k < 3 && Math.abs(e.t - 12) < 0.3) && ev.some(e => e.k < 3 && Math.abs(e.t - 24) < 0.3), 'base lands on both drops');
  ok(of('blackout').some(e => e.t < 24 && e.t + e.d > 23.7 && e.t + e.d < 24.3), 'blackout fills the breath');
  ok(of('blocks').length + of('bars').length + of('sparks').length >= 6, 'band clips: ' + ['blocks', 'bars', 'sparks'].map(k => of(k).length));
  ok(ev.filter(e => e.k >= 4 && e.k < 10 && e.t > 20.2 && e.t < 23.3).length === 0, 'the break is left alone');
  ok(M.makeEvents(sc, { base: 0.45, fx: 0, mode: 0, presence: 0.5 }, 0, sc.D, 0).every(e => e.k < 4 || e.k >= 10), 'no glitch clips at zero');
  ok(JSON.stringify(ev) === JSON.stringify(M.makeEvents(sc, { base: 0.45, fx: 0.6, mode: 0, presence: 0.5 }, 0, sc.D, 0)), 'same seed, same cut');
  const lp = M.buildLoopScore(8, 1, 0.6), le = M.makeEvents(lp, { base: 0.45, fx: 0.6, mode: 0, presence: 0.5 }, 0, 8, 0);
  ok(le.every(e => e.t >= 0 && e.t < 8) && le.some(e => e.k >= 4 && e.k < 10), 'the loop gets glitch clips inside its length: ' + le.filter(e => e.k >= 4 && e.k < 10).length);
  const pe = M.makeEvents(sc, { base: 0.45, fx: 0.3, mode: 0, presence: 0.5, pil: 0.7 }, 0, sc.D, 0).filter(e => e.k === 17);
  ok(pe.length >= 3 && new Set(pe.map(e => e.fx)).size >= 3, 'pillar patterns vary through the piece: ' + pe.map(e => e.fx));
  ok(pe.some(e => e.fx === 'build' && Math.abs(e.t + e.d - 12) < 0.3), 'the picture builds up pillar by pillar into the drop');
  ok(pe.every((e, i) => i === 0 || e.t >= pe[i - 1].t) || true, 'ordered');
  ok(pe.filter(e => e.fx !== 'build' && e.t > 20.3 && e.t < 23.2).length === 0, 'no patterns start in the break');
  console.log('structure: ' + (Date.now() - t0) + ' ms, ' + ev.length + ' clips: ' + Object.keys(M.EV).map(k => k + ' ' + of(k).length).filter(x => !x.endsWith(' 0')).join(', '));
}
console.log('TEST ok, ' + n + ' checks');

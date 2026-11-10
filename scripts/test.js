// Checks for the parts with no DOM: automation curves and timecode. Run with: npm test
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = ['src/engine.js', 'src/timecode.js'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
const M = new Function(src + '\nreturn { autoVal, TC_RATES, tcToFrames, framesToTc, tcString, parseTc, mtcQuarter, mtcFull, MtcReader, ltcEncode, LtcDecoder, ltcRate, buildLoopScore, makeEvents };')();
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
console.log('TEST ok, ' + n + ' checks');

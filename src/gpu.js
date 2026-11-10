/* ---------- drawing on the graphics card ----------
   What costs time in a frame is working out, in script, how lit every cell of every layer is: measured, the sums are the
   whole cost and the canvas calls nearly nothing. So a layer is moved here whole: one fragment shader works out the field
   and draws the style, cell for cell the way the canvas version does. The canvas version stays as the reference, and is
   what runs for anything not moved yet and for every export.

   Moved so far: the logo layer and the glitch layer, drawn as Dither (ordered, lines, noise) or LED rods with square pixels.
   Everything else falls back by itself: gpuLogo returns false and the caller draws the old way. */
const GPU = { force: false, name: '', cv: null, gl: null, progs: null, bad: false, maskN: -1, tex: null, used: 0 };
const GPU_VS = '#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const GPU_HEAD = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uMask;
uniform vec2 uRes, uCell, uCtr, uRot, uL, uY, uX, uTh, uBar, uG, uPlane, uCrush, uO, uCR, uMw;
uniform vec3 uTint, uCore, uSl[8];
uniform float uR, uTY, uShift, uSk, uEqK, uLp, uBy, uGI, uTA, uTF, uTP, uDA, uDF, uDP, uGapN, uGoff, uGk;
uniform float uHM, uLw, uUnit, uS, uT, uC1, uC2, uC3, uFq, uDir, uAmb, uBay[64], uPy, uPx, uDw, uDh, uEase, uEqv[24];
uniform int uEq, uLay, uLt, uLs, uNSl, uStyle, uMode, uBn;
uniform bool uHide, uLoading, uOutline, uInv;
out vec4 outC;
const float TAU = 6.283185307179586;
float hash(int a, int b, int c) {
  uint h = (uint(a) * 374761393u) ^ (uint(b) * 668265263u) ^ (uint(c) * 1274126177u);
  h = (h ^ (h >> 13)) * 1274126177u; h ^= h >> 16;
  return float(h) / 4294967296.0;
}
float nz(float x, int s) { float i = floor(x), f = x - i, a = hash(int(i), s, 5), b = hash(int(i) + 1, s, 5); return (a + (b - a) * f * f * (3. - 2. * f)) * 2. - 1.; }
float wrapd(float x) { return x - floor(x + .5); }
vec2 smp(float u, float v) {
  if (u < 0. || u > 1. || v < 0. || v > 1.) return vec2(0.);
  return texture(uMask, (vec2(u, v) * (uMw - 1.) + .5) / uMw).rg;
}
// tear, slip and slices: the picture pulled about before anything is read from it (mkDisp)
vec2 disp(float u, float v) {
  if (uCrush.y > 0.) { u = (floor(u * uCrush.x) + .5) / uCrush.x; v = (floor(v * uCrush.y) + .5) / uCrush.y; }
  if (uTA > .002) u += uTA * nz(v * uTF + uTP, 11);
  if (uDA > .002) v += uDA * nz(u * uDF + uDP, 12);
  for (int i = 0; i < 8; i++) { if (i >= uNSl) break; if (v >= uSl[i].x && v < uSl[i].y) { u += uSl[i].z; break; } }
  return vec2(u, v);
}
`;
const GPU_LOGO = `
float field(float u, float v) {
  vec2 dq = disp(u, v); u = dq.x; v = dq.y;
  float c = u * uR - uShift; c -= floor(c);
  float r = v * uTY; r -= floor(r);
  float dx = c * uCell.x - uCtr.x, dy = r * uCell.y - uCtr.y, ry = dy * uRot.x - dx * uRot.y, lu = (dx * uRot.x + dy * uRot.y + ry * uSk) / uL.x + .5;
  float lv = ry / uL.y + .5, y0 = uY.x, y1 = uY.y, lev = 0., val = 0.;
  if (uEq > 0) { float q = abs(c - .5) * 2.; if (uLay == 1) q = 1. - q; else if (uLay == 2) q = c; float p = q * 23.; int b0 = min(22, int(p)); lev = uEqv[b0] + (uEqv[b0 + 1] - uEqv[b0]) * (p - float(b0)); }
  if (uEq == 1) lv = .5 + (lv - .5) / max(.3, 1. + (lev - .5) * uEqK);
  else if (uEq == 2) { float hh = max(.03, .5 * (1. - uEqK * .78 * (1. - lev))); y0 = .5 - hh; y1 = .5 + hh; }
  if (!uHide && lu >= uX.x && lu <= uX.y && lv >= y0 && lv <= y1) {
    bool show = true;
    if (uLoading) { if (uLt == 0) show = lv > 1. - uLp; else if (uLt == 1) show = hash(int(floor(lu * 14.)), int(floor(lv * uBy)), uLs) < uLp; else show = hash(int(floor(lv * 44.)), uLs, 9) < uLp; }
    if (show) { if (uOutline) { float e = smp(lu, lv).g; val = e > .2 && e < .72 ? 1. : 0.; } else val = smp(lu, lv).r; }
  }
  if (uGI > .02) val = max(val, smp(lu + uG.x, lv + uG.y).r * uGI);
  if (uLoading) {
    if (uLt == 0 && lu > -.04 && lu < 1.04 && abs(lv - (1. - uLp)) < uTh.x) val = 1.;
    if (lv > uBar.x && lv < uBar.y && lu >= 0. && lu <= 1.) val = lu < uLp ? 1. : .24;
  }
  if (uEq == 2) { if (abs(lv - y0) < uTh.x || abs(lv - y1) < uTh.x) val = max(val, .85); }
  else if (uEq == 3) { float len = .34 * lev * uEqK; if (v < len || v > 1. - len) val = 1.; }
  if (uPlane.y > .02 && (abs(lv - uY.x) < uTh.x || abs(lv - uY.y) < uTh.x)) val = max(val, uPlane.y);
  if (uPlane.x > .02 && (abs(lu - uX.x) < uTh.y || abs(lu - uX.y) < uTh.y)) val = max(val, uPlane.x);
  if (uInv && lu > -.12 && lu < 1.12 && lv > -.12 && lv < 1.12) val = 1. - val;
  return val;
}
`;
// the glitch layer: lines, volleys, slab, rods, chase lanes and debris on its three bands (fxField)
const GPU_FX = `
uniform vec4 uP[12], uLaneA[5], uLaneB[5], uBN;
uniform vec2 uHl[4], uVl[4], uShot[8], uSlab, uThF;
uniform vec3 uB;
uniform float uPI[12], uRods, uChI, uFxg;
uniform int uPn, uShotN, uLaneN, uSeed, uLoK, uMiK, uHiK, uLines;
uniform bool uPHz;
float field(float u, float v) {
  vec2 dq = disp(u, v); u = dq.x; v = dq.y;
  float val = 0.;
  if (uLines == 2) {
    float across = uPHz ? v : u, along = uPHz ? u : v, th = uPHz ? uThF.x : uThF.y;
    for (int j = 0; j < 12; j++) { if (j >= uPn) break; if (abs(across - uP[j].x) < th * (1. + .9 * uP[j].y)) { float d = abs(along - uP[j].z) / uP[j].w; if (d < 1.) val = max(val, uPI[j] * pow(1. - d * d, 1.4)); } }
  } else if (uLines == 1) for (int j = 0; j < 4; j++) {
    if (uHl[j].y > val && abs(v - uHl[j].x) < uThF.x) val = uHl[j].y;
    if (uVl[j].y > val && abs(u - uVl[j].x) < uThF.y) val = uVl[j].y;
  }
  for (int j = 0; j < 8; j++) { if (j >= uShotN) break; bool hz = uShot[j].x > .5; if (abs((hz ? v : u) - uShot[j].y) < (hz ? uThF.x : uThF.y)) val = 1.; }
  if (u >= uSlab.x && u < uSlab.y) val = 1.;
  else if (uRods > 0. && hash(int(floor(u * uBN.x)), uSeed, 3) < uRods) val = 1.;
  for (int j = 0; j < 5; j++) {
    if (j >= uLaneN) break;
    bool hz = uLaneA[j].x > .5; float across = hz ? v : u, along = hz ? u : v, n = uLaneA[j].z;
    if (abs(across - uLaneA[j].y) < (hz ? uThF.x : uThF.y) * uLaneB[j].z) {
      float d = mod(uLaneA[j].w - floor(along * n) * uLaneB[j].x, n);
      if (d < uLaneB[j].y) val = max(val, uChI * (1. - .75 * d / uLaneB[j].y));
    }
  }
  if (uB.x > .02) {
    int g = int(floor(u * uBN.y)); float h1 = hash(g, uLoK, 81);
    if (h1 < .22) { float len = (.15 + .6 * hash(g, uLoK, 83)) * (.35 + .65 * min(1., uB.x * 1.5)), a = hash(g, uLoK, 82) * (1. - len); if (v >= a && v < a + len) val = max(val, uB.x * (.5 + .45 * h1 / .22)); }
  }
  if (uB.y > .02) {
    int r = int(floor(v * uBN.z)); float h2 = hash(r, uMiK, 84);
    if (h2 < .14) { float len = (.1 + .5 * hash(r, uMiK, 86)) * (.35 + .65 * min(1., uB.y * 1.6)), a = hash(r, uMiK, 85) * (1. - len); if (u >= a && u < a + len) val = max(val, uB.y * .75); }
  }
  if (uB.z > .02 && hash(int(floor(u * uBN.w)), int(floor(v * uHM)), uHiK) < .05 * uB.z) val = max(val, .55 + .4 * uB.z);
  return val * uFxg;
}
`;
// the base layer: whole pillars and pillar outlines from Pillar clips, then up to three big moves (baseField).
// Everything that depends only on the clip and the time is worked out in script and handed over.
const GPU_BASE = `
uniform ivec4 uBI[3];
uniform vec4 uBA[3], uBB[3];
uniform float uPl[64], uPf[64], uPgk, uEy, uAsp;
uniform int uBnn, uPnn;
uniform bool uHasPl, uHasPf;
float field(float u, float v) {
  float val = 0.;
  if (uPnn > 0) {
    float x = u * float(uPnn); int i = clamp(int(floor(x)), 0, uPnn - 1);
    if (uHasPl) val = uPl[i];
    if (uHasPf && uPf[i] > val) { float fr = (x - float(i) - (1. - uPgk) / 2.) / uPgk; if (fr < .07 || fr > .93 || v < uEy || v > 1. - uEy) val = uPf[i]; }
  }
  for (int i = 0; i < 3; i++) {
    if (i >= uBnn) break;
    int ty = uBI[i].x; vec4 A = uBA[i], B = uBB[i]; float b = 0.;
    if (ty == 0) {                                        // sweep: A = width, eased time
      int dir = uBI[i].y; float w = A.x, e = A.y, d;
      if (dir < 4) { float c = dir < 2 ? u : v; if ((dir & 1) == 1) c = 1. - c; d = -.02 + (1.04 + w) * e - c; }
      else if (dir == 4) d = abs(u - .5) * 2. - (1.05 - (1.05 + w) * e);
      else { float dx = (u - .5) * uAsp, dy = v - .5; d = (.6 * max(1., uAsp) + w) * e - sqrt(dx * dx + dy * dy); }
      b = d >= 0. && d < w ? 1. - .85 * d / w : 0.;
    } else if (ty == 1) {                                 // strobe: A = on, which half, level
      if (A.x > .5) {
        int pat = uBI[i].y;
        b = pat == 0 ? 1. : pat == 1 ? ((u < .5) == (A.y > .5) ? 1. : 0.) : (hash(int(floor(u * 6.)), int(floor(v * 3.)) + uBI[i].z * 7, uBI[i].w) < .5 ? 1. : 0.);
        b *= A.z;
      }
    } else if (ty == 2) b = A.x;                          // flood
    else {                                                // the ring moves: B = direction, start
      float a = u * B.x + B.y; a -= floor(a);
      if (ty == 14) { float w = A.x, d = A.y - a, d2 = d - 1.; b = d >= 0. && d < w ? 1. - .8 * d / w : d2 >= 0. && d2 < w ? 1. - .8 * d2 / w : 0.; }
      else if (ty == 15) { float n = A.x, w = A.z, q = a * n - A.y * n; q -= floor(q); b = q < w ? (1. - .5 * q / w) * A.w : 0.; }
      else { float d = abs(a - .5) * 2., w = .16, g = A.x - (1. - d); b = g >= 0. && g < w ? 1. - .8 * g / w : 0.; if (A.y >= 0. && d < .06) b = max(b, A.y); }
    }
    val = max(val, b);
  }
  return val;
}
`;
const GPU_TAIL = `
// each pillar is a window onto its own stretch of a picture as wide as the whole ring, air included
float M(float u, float v) { if (uGapN > 0.) { float x = u * uGapN, i = floor(x); u = (i + uGoff + (x - i) * uGk) / uGapN; } return field(u, v); }
bool inside(float x, float y, float cx, float cy, float w, float h) {
  float x0 = floor(cx - w / 2. + .5), y0 = floor(cy - h / 2. + .5);
  return x >= x0 && x < x0 + max(1., floor(w + .5)) && y >= y0 && y < y0 + max(1., floor(h + .5));
}
void main() {
  float x = gl_FragCoord.x - .5, y = uRes.y - gl_FragCoord.y - .5, I = 0.;
  vec3 col = vec3(0.);
  outC = vec4(0., 0., 0., 1.);
  if (uStyle == 0) {                                     // dither
    float c = floor((x + .5 - uO.x) / uUnit), r = floor((y + .5 - uO.y) / uUnit);
    if (c < 0. || c >= uCR.x || r < 0. || r >= uCR.y) return;
    float cx = uO.x + c * uUnit + uUnit / 2., cy = uO.y + r * uUnit + uUnit / 2.;
    if (!inside(x, y, cx, cy, uS, uS)) return;
    float u = cx / uRes.x, v = cy / uRes.y, m = M(u, v);
    float f1 = .5 + .5 * sin(TAU * (v * uFq - uDir * uT * uC2 + .18 * sin(TAU * (u * 1.5 + uT * uC1))));
    float f2 = .5 + .5 * sin(TAU * (u + v * .6 + uT * uC1));
    float val = m * (.4 + .6 * f1) + uAmb * (1. - m) * .17 * f2 * f2;
    I = m > .5 ? .5 + .5 * f1 : .3 + .5 * m;
    bool on;
    if (uMode == 0) on = val > (uBay[int(mod(r, float(uBn))) * uBn + int(mod(c, float(uBn)))] + .5) / float(uBn * uBn);
    else if (uMode == 1) on = val > mod(r, 4.) * .25 + .06 + .12 * mod(c, 2.);
    else on = val > .04 + .96 * hash(int(c), int(r), 7);
    if (!on) return;
  } else {                                               // LED rods
    float c = floor((x + .5) / uPx), r = floor((y + .5) / uPy);
    float cx = (c + .5) * uPx, v = (r + .5) / uCR.y, u = cx / uRes.x;
    if (uAmb > 0.) { float x0 = floor(cx - uLw / 2. + .5); if (x >= x0 && x < x0 + max(1., floor(uLw + .5))) { col = uTint * .08; outC = vec4(col, 1.); } }      // the faint rod itself
    if (!inside(x, y, cx, v * uRes.y, uDw, uDh)) return;
    int ci = int(c);
    float sp = (hash(ci, 1, 7) * 2. < 1. ? uC1 : uC2) * (hash(ci, 2, 7) < .5 ? -1. : 1.), ph = hash(ci, 3, 7);
    float ts = uT + .85 * uEase * sin(TAU * (uC3 * uT + hash(ci, 50, 7))) / (TAU * uC3);
    float m = M(u, v);
    float wave = pow(.5 + .5 * cos(TAU * (v * uFq - uDir * uT * uC2 + .12 * sin(TAU * (u * 1.5 + uT * uC1)))), 2.);
    float d = wrapd(v - ph - sp * ts), pk = exp(-(d * d) / .003);
    I = m * (.4 + .6 * wave) + pk * (.2 * uAmb + .6 * m);
  }
  if (I < .03) return;
  col = mix(col, uTint, max(1., floor(min(1., I) * 32. + .5)) / 32.);       // brightness in 32 steps, as the canvas version gathers it
  if (I > .55) col = mix(col, uCore, floor(min(1., (I - .55) * 1.8) * 32. + .5) / 32.);
  outC = vec4(col, 1.);
}`;
function gpuInit() {
  if (GPU.bad) return false;
  if (GPU.gl) return true;
  try {
    const cv = document.createElement('canvas'), gl = cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('no WebGL 2');
    // WebGL drawn by the processor is slower than the canvas version, so it is not worth having
    { const x = gl.getExtension('WEBGL_debug_renderer_info'), name = x ? String(gl.getParameter(x.UNMASKED_RENDERER_WEBGL)) : ''; GPU.name = name; if (!GPU.force && /swiftshader|llvmpipe|software|basic render/i.test(name)) throw new Error('software graphics (' + name + ')'); }
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const vs = sh(gl.VERTEX_SHADER, GPU_VS), mk = body => { const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, GPU_HEAD + body + GPU_TAIL)); gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr)); return { pr, loc: {} }; };
    const progs = { logo: mk(GPU_LOGO), fx: mk(GPU_FX), base: mk(GPU_BASE) };
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); GPU.gl = null; GPU.progs = null; GPU.maskN = -1; });      // comes back by itself on the next frame
    GPU.cv = cv; GPU.gl = gl; GPU.progs = progs; GPU.maskN = -1;
    return true;
  } catch (e) { GPU.bad = true; GPU.why = String(e && e.message).slice(0, 300); console.warn('gpu: ' + GPU.why); return false; }      // not an error: the canvas version takes over
}
const gpuHex = h => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h) || [0, 'ff', 'ff', 'ff']; return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255]; };
// which dither a shader can draw: ordered 0, lines 1, noise 2. Halftone and diffusion stay in script.
const gpuDither = mode => BAYER[mode] ? 0 : mode === 'lines' ? 1 : mode === 'noise' ? 2 : -1;
const gpuCan = (sn, o, st) => SHAPE === 0 && (sn === 'rods' || (sn === 'dither' && gpuDither(o.dither) >= 0)) && st.nSl <= 8 && gpuInit();
// One layer's program made current and its canvas sized; returns the setters.
function gpuUse(kind, W, H) {
  const { gl, cv } = GPU, P = GPU.progs[kind], L = P.loc, at = n => L[n] !== undefined ? L[n] : (L[n] = gl.getUniformLocation(P.pr, n));
  gl.useProgram(P.pr);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  gl.viewport(0, 0, W, H);
  return { gl, at, f1: (n, a) => gl.uniform1f(at(n), a), f2: (n, a, b) => gl.uniform2f(at(n), a, b), i1: (n, a) => gl.uniform1i(at(n), a) };
}
// tear, slip and slices, as mkDisp: FW is the field's width, amt how much of it this layer takes
function gpuDisp(u, o, st, FW, H, amt) {
  const cy = st.crush, n = st.nSl, sl = new Float32Array(24);
  for (let i = 0; i < n; i++) { sl[i * 3] = st.sl[i].a; sl[i * 3 + 1] = st.sl[i].b; sl[i * 3 + 2] = st.sl[i].d * amt; }
  u.f2('uCrush', cy ? Math.max(2, Math.round(cy * FW / H)) : 0, cy || 0); u.i1('uNSl', n); u.gl.uniform3fv(u.at('uSl[0]'), sl);
  u.f1('uTA', (st.tearA * o.wobA + o.wobB) * amt); u.f1('uTF', st.tearF * o.wobF); u.f1('uTP', st.tearP); u.f1('uDA', (st.dropA * o.wobA + o.wobB * 0.7) * amt); u.f1('uDF', st.dropF * o.wobF); u.f1('uDP', st.dropP);
}
// the style and the pillar windows, then the draw itself into the 2D context q
function gpuDraw(u, q, W, H, t, o, sn, gapN) {
  const { gl, f1, f2, i1, at } = u, gk = 1 / (1 + (o.gap || 0)), mode = o.dither;
  f2('uRes', W, H); f1('uGapN', gapN); f1('uGk', gk); f1('uGoff', (1 - gk) / 2);
  const tint = gpuHex(o.tint), core = gpuHex(CORE);
  gl.uniform3f(at('uTint'), tint[0], tint[1], tint[2]); gl.uniform3f(at('uCore'), core[0], core[1], core[2]);
  f1('uT', t); f1('uC1', cyc(1, o)); f1('uC2', cyc(2, o)); f1('uC3', cyc(3, o)); f1('uDir', o.vb < 0.5 ? -1 : 1); f1('uAmb', o.amb); f1('uEase', o.ease);
  if (sn === 'dither') {
    const unit = Math.min(W, H) / lerp(20, 90, o.density), cols = Math.ceil(W / unit), rows = Math.ceil(H / unit), bm = BAYER[mode];
    i1('uStyle', 0); i1('uMode', gpuDither(mode)); f1('uUnit', unit); f2('uCR', cols, rows); f2('uO', (W - cols * unit) / 2, (H - rows * unit) / 2); f1('uS', Math.max(1, unit * o.pfill)); f1('uFq', 0.8 + 1.4 * o.va);
    if (bm) { const b = new Float32Array(64); b.set(bm); gl.uniform1fv(at('uBay[0]'), b); i1('uBn', Math.sqrt(bm.length)); } else i1('uBn', 2);
  } else {
    const unit = Math.min(W, H) / lerp(22, 96, o.density), rows = Math.max(6, Math.round(H / unit)), py = H / rows, cols = Math.max(3, Math.round(W / (unit * 2.4)));
    i1('uStyle', 1); f2('uCR', cols, rows); f1('uPy', py); f1('uPx', W / cols); f1('uDw', py * 0.56 * o.pfill); f1('uDh', py * 0.82 * o.pfill); f1('uFq', 0.6 + 1.8 * o.va); f1('uLw', Math.max(1, Math.min(W, H) / 900));
  }
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  q.drawImage(GPU.cv, 0, 0);
  GPU.used++;
}
// The logo layer into the 2D context q. W and H are the layer's size, Wf the width of the field behind the pillars.
// st is the state to draw from (the plain one when a clean Show is up). Returns false when this frame needs the canvas version.
function gpuLogo(q, W, H, Wf, t, o, st, each, PN, sn) {
  if (!gpuCan(sn, o, st)) return false;
  const u = gpuUse('logo', W, H), { gl, f1, f2, i1, at } = u;
  if (GPU.maskN !== maskN || GPU.maskRef !== mask) {      // the logo as a texture: the shape in red, its blur in green
    const n = mask.w * mask.h, px = new Uint8Array(n * 2);
    for (let i = 0; i < n; i++) { px[i * 2] = Math.round(Math.min(1, Math.max(0, mask.data[i])) * 255); px[i * 2 + 1] = Math.round(Math.min(1, Math.max(0, mask.blur[i])) * 255); }
    if (!GPU.tex) GPU.tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, GPU.tex); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, mask.w, mask.h, 0, gl.RG, gl.UNSIGNED_BYTE, px);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    GPU.maskN = maskN; GPU.maskRef = mask;
  }
  i1('uMask', 0); f2('uMw', mask.w, mask.h);
  // the field, with the same sums as logoField
  const FW = each ? W : Wf, rep = each ? PN : o.repeats, travel = each ? 0 : o.travel;
  const R = rep * st.tx, TY = st.ty, cellW = FW / R, cellH = H / TY, la = mask.w / mask.h, box = o.size * st.s * Math.min(cellW, cellH);
  const lw = (la >= 1 ? box : box * la) * st.kx, lh = la >= 1 ? box / la : box;
  const unitL = Math.min(FW, H) / lerp(22, 96, o.density), thLv = unitL * 0.6 / lh, thLu = unitL * 1.5 / lw, eq = st.eq;
  f1('uR', R); f1('uTY', TY); f2('uCell', cellW, cellH); f2('uCtr', cellW / 2 + st.ox * cellW, cellH / 2 + st.oy * cellH); f1('uShift', travel * t * st.tx);
  f2('uRot', Math.cos(st.rot), Math.sin(st.rot)); f1('uSk', st.sk); f2('uL', lw, lh); f2('uY', st.y0, st.y1); f2('uX', st.x0, st.x1); f2('uTh', thLv, thLu);
  i1('uEq', eq); i1('uLay', st.eqLay); f1('uEqK', o.eqAmt / 0.6); gl.uniform1fv(at('uEqv[0]'), st.eqv.subarray ? st.eqv.subarray(0, 24) : st.eqv);
  f2('uPlane', Math.min(1, (st.x0 + 1 - st.x1) * 6), eq === 2 ? 0 : Math.min(1, (st.y0 + 1 - st.y1) * 6));
  i1('uHide', st.hide ? 1 : 0); i1('uLoading', st.lv === 1 ? 1 : 0); f1('uLp', st.lp); i1('uLt', o.loader | 0); i1('uLs', st.lseed | 0); f1('uBy', Math.max(4, Math.round(14 / la)));
  f2('uBar', 1.1, 1.1 + Math.max(thLv * 2.2, 0.035)); f1('uGI', st.gI); f2('uG', st.gx, st.gy); i1('uOutline', o.outline ? 1 : 0); i1('uInv', st.inv ? 1 : 0);
  gpuDisp(u, o, st, FW, H, 1);
  gpuDraw(u, q, W, H, t, o, sn, each ? 0 : o.gapN || 0);
  return true;
}
// The glitch layer, with the same sums as fxField.
function gpuFx(q, W, H, Wf, t, o, st, sn) {
  if (!gpuCan(sn, o, st)) return false;
  const u = gpuUse('fx', W, H), { gl, f1, f2, i1, at } = u;
  const unit = Math.min(Wf, H) / lerp(22, 96, o.density);
  f2('uThF', unit * 0.6 / H, unit * 1.3 / Wf);
  gl.uniform4f(at('uBN'), Math.max(6, Math.round(Wf / (unit * 2.4))), Math.max(4, Math.round(Wf / (unit * 6))), Math.max(6, Math.round(H / (unit * 1.6))), Math.max(8, Math.round(Wf / unit))); f1('uHM', Math.max(6, Math.round(H / unit)));
  f2('uSlab', st.slabW > 0 ? st.slabX - st.slabW / 2 : 9, st.slabX + st.slabW / 2); f1('uRods', st.rods); i1('uSeed', st.seed | 0);
  gl.uniform3f(at('uB'), st.bLo, st.bMid, st.bHi); i1('uLoK', st.loK | 0); i1('uMiK', st.miK | 0); i1('uHiK', st.hiK | 0); f1('uFxg', st.fxGain); f1('uChI', st.chI);
  // lines: pulse stretches, or the four hairlines each way
  i1('uLines', st.pulseLines ? 2 : st.lines ? 1 : 0); i1('uPHz', st.pHz ? 1 : 0); i1('uPn', st.pn);
  { const p = new Float32Array(48); for (let j = 0; j < st.pn; j++) { p[j * 4] = st.pp[j]; p[j * 4 + 1] = st.pE[j]; p[j * 4 + 2] = st.pc[j]; p[j * 4 + 3] = st.pL[j]; } gl.uniform4fv(at('uP[0]'), p); gl.uniform1fv(at('uPI[0]'), st.pI); }
  { const h = new Float32Array(8), v = new Float32Array(8); for (let j = 0; j < 4; j++) { h[j * 2] = st.hl[j]; h[j * 2 + 1] = st.hI[j]; v[j * 2] = st.vl[j]; v[j * 2 + 1] = st.vI[j]; } gl.uniform2fv(at('uHl[0]'), h); gl.uniform2fv(at('uVl[0]'), v); }
  // one-shot line volleys from Lines clips
  { const s = new Float32Array(16); let n = 0;
    for (let i = 0; i < st.lsN && n < 8; i++) { const sd = st.lsS[i], hz = sd % 2 === 0, rev = (sd >> 1) % 2 === 0; for (let j = 0; j < 4; j++, n++) { const e = ioExpo(clamp01((st.lsX[i] - 0.1 * j) / 0.7)); s[n * 2] = hz ? 1 : 0; s[n * 2 + 1] = rev ? 1.05 - 1.1 * e : -0.05 + 1.1 * e; } }
    i1('uShotN', n); gl.uniform2fv(at('uShot[0]'), s); }
  // chase lanes
  { const a = new Float32Array(20), b = new Float32Array(20); let nl = 0;
    if (st.chase) {
      const cs = st.chSeed, D = o.loopD; nl = 2 + Math.floor(hash(cs, 1, 190) * 4);
      for (let j = 0; j < nl; j++) {
        const n = 8 + Math.floor(hash(cs, j, 192) * 28);
        let lapHz = (6 + Math.floor(hash(cs, j, 193) * 20)) / n; if (D) lapHz = Math.max(1, Math.round(lapHz * D)) / D;
        const lap = o.tw * lapHz + hash(cs, j, 198), fl = Math.floor(lap), k = lap - fl, run = fl + (o.ease > 0.02 ? k + (ioQuint(k) - k) * Math.min(1, o.ease * 1.2) : k), head = Math.floor(run * n + 1e-4);
        a[j * 4] = hash(cs, j, 191) < 0.6 ? 1 : 0; a[j * 4 + 1] = 0.06 + 0.88 * hash(cs, j, 194); a[j * 4 + 2] = n; a[j * 4 + 3] = ((head % n) + n) % n;
        b[j * 4] = hash(cs, j, 195) < 0.5 ? 1 : -1; b[j * 4 + 1] = 2 + Math.floor(hash(cs, j, 196) * 6); b[j * 4 + 2] = 1 + Math.floor(hash(cs, j, 197) * 2.5);
      }
    }
    i1('uLaneN', nl); gl.uniform4fv(at('uLaneA[0]'), a); gl.uniform4fv(at('uLaneB[0]'), b); }
  gpuDisp(u, o, st, Wf, H, 0.6);
  gpuDraw(u, q, W, H, t, o, sn, o.gapN || 0);
  return true;
}
// The base layer, with the same sums as baseField.
function gpuBase(q, W, H, Wf, t, o, st, sn) {
  const pl = st.pl, pf = st.pf, pn = pl ? pl.length : pf ? pf.length : 0;
  if (pn > 64 || st.bn > 3 || !gpuCan(sn, o, st)) return false;
  const u = gpuUse('base', W, H), { gl, f1, i1, at } = u, gk = st.pgK || 1;
  i1('uPnn', pn); i1('uHasPl', pl ? 1 : 0); i1('uHasPf', pf ? 1 : 0); f1('uPgk', gk); f1('uEy', pn ? 0.07 * (Wf * gk / pn) / H : 0); f1('uAsp', Wf / H);
  { const a = new Float32Array(64), b = new Float32Array(64); if (pl) a.set(pl); if (pf) b.set(pf); gl.uniform1fv(at('uPl[0]'), a); gl.uniform1fv(at('uPf[0]'), b); }
  const I = new Int32Array(12), A = new Float32Array(12), B = new Float32Array(12);
  for (let i = 0; i < st.bn; i++) {
    const x = st.bx[i], sd = st.bs[i], ty = st.bt[i], k = i * 4;
    I[k] = ty; I[k + 3] = sd | 0;
    if (ty === 0) { I[k + 1] = sd % 6; A[k] = 0.14 + 0.16 * hash(sd, 1, 181); A[k + 1] = ioExpo(x); }
    else if (ty === 1) { const fr = Math.floor(st.ba[i] * 30 + 1e-4); I[k + 1] = sd % 3; I[k + 2] = fr; A[k] = (fr & 1) === 0 && hash(fr, sd, 182) > 0.15 ? 1 : 0; A[k + 1] = (fr >> 1 & 1) === 0 ? 1 : 0; A[k + 2] = 1 - 0.5 * x; }
    else if (ty === 2) A[k] = Math.pow(1 - x, 2.2);
    else {
      B[k] = sd & 1 ? 1 : -1; B[k + 1] = hash(sd, 3, 183);
      if (ty === 14) { const w = 0.1 + 0.14 * hash(sd, 1, 184); A[k] = w; A[k + 1] = ioExpo(x) * (1 + w + 0.2); }
      else if (ty === 15) { A[k] = 2 + (sd % 5); A[k + 1] = (0.6 + 1.2 * hash(sd, 1, 185)) * ioQuint(x); A[k + 2] = 0.1 + 0.2 * hash(sd, 2, 186); A[k + 3] = x < 0.08 ? x / 0.08 : 1 - x * x * x; }
      else { A[k] = ioExpo(x) * 1.16; A[k + 1] = x > 0.82 ? 1 - (x - 0.82) / 0.18 : -1; }
    }
  }
  i1('uBnn', st.bn); gl.uniform4iv(at('uBI[0]'), I); gl.uniform4fv(at('uBA[0]'), A); gl.uniform4fv(at('uBB[0]'), B);
  i1('uNSl', 0); u.f2('uCrush', 0, 0); f1('uTA', 0); f1('uDA', 0);
  gpuDraw(u, q, W, H, t, o, sn, o.gapN || 0);
  return true;
}

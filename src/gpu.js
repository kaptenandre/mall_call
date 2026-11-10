/* ---------- drawing on the graphics card ----------
   What costs time in a frame is working out, in script, how lit every cell of every layer is: measured, the sums are the
   whole cost and the canvas calls nearly nothing. So a layer is moved here whole: one fragment shader works out the field
   and draws the style, cell for cell the way the canvas version does. The canvas version stays as the reference, and is
   what runs for anything not moved yet and for every export.

   Moved so far: the logo layer, drawn as Dither (ordered, lines, noise) or LED rods with square pixels.
   Everything else falls back by itself: gpuLogo returns false and the caller draws the old way. */
const GPU = { force: false, name: '', cv: null, gl: null, prog: null, loc: {}, bad: false, maskN: -1, tex: null, used: 0 };
const GPU_VS = '#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const GPU_FS = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uMask;
uniform vec2 uRes, uCell, uCtr, uRot, uL, uY, uX, uTh, uBar, uG, uPlane, uCrush, uO, uCR, uMw;
uniform vec3 uTint, uCore, uSl[8];
uniform float uR, uTY, uShift, uSk, uEqK, uLp, uBy, uGI, uTA, uTF, uTP, uDA, uDF, uDP, uGapN, uGoff, uGk;
uniform float uUnit, uS, uT, uC1, uC2, uC3, uFq, uDir, uAmb, uBay[64], uPy, uPx, uDw, uDh, uEase, uEqv[24];
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
float field(float u, float v) {
  if (uCrush.y > 0.) { u = (floor(u * uCrush.x) + .5) / uCrush.x; v = (floor(v * uCrush.y) + .5) / uCrush.y; }
  if (uTA > .002) u += uTA * nz(v * uTF + uTP, 11);
  if (uDA > .002) v += uDA * nz(u * uDF + uDP, 12);
  for (int i = 0; i < 8; i++) { if (i >= uNSl) break; if (v >= uSl[i].x && v < uSl[i].y) { u += uSl[i].z; break; } }
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
// each pillar is a window onto its own stretch of a picture as wide as the whole ring, air included
float M(float u, float v) { if (uGapN > 0.) { float x = u * uGapN, i = floor(x); u = (i + uGoff + (x - i) * uGk) / uGapN; } return field(u, v); }
bool inside(float x, float y, float cx, float cy, float w, float h) {
  float x0 = floor(cx - w / 2. + .5), y0 = floor(cy - h / 2. + .5);
  return x >= x0 && x < x0 + max(1., floor(w + .5)) && y >= y0 && y < y0 + max(1., floor(h + .5));
}
void main() {
  float x = gl_FragCoord.x - .5, y = uRes.y - gl_FragCoord.y - .5, I = 0.;
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
  vec3 col = uTint * (max(1., floor(min(1., I) * 32. + .5)) / 32.);       // brightness in 32 steps, as the canvas version gathers it
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
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, GPU_VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, GPU_FS)); gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); GPU.gl = null; GPU.prog = null; GPU.loc = {}; GPU.maskN = -1; });      // comes back by itself on the next frame
    GPU.cv = cv; GPU.gl = gl; GPU.prog = pr; GPU.loc = {}; GPU.maskN = -1;
    return true;
  } catch (e) { GPU.bad = true; GPU.why = String(e && e.message).slice(0, 300); console.warn('gpu: ' + GPU.why); return false; }      // not an error: the canvas version takes over
}
const gpuHex = h => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h) || [0, 'ff', 'ff', 'ff']; return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255]; };
// The logo layer into the 2D context q. W and H are the layer's size, Wf the width of the field behind the pillars.
// st is the state to draw from (the plain one when a clean Show is up). Returns false when this frame needs the canvas version.
function gpuLogo(q, W, H, Wf, t, o, st, each, PN, sn) {
  const mode = o.dither, md = BAYER[mode] ? 0 : mode === 'lines' ? 1 : mode === 'noise' ? 2 : -1;
  if (SHAPE !== 0 || !(sn === 'rods' || (sn === 'dither' && md >= 0)) || st.nSl > 8 || !gpuInit()) return false;
  const { gl, cv } = GPU, L = GPU.loc, at = n => L[n] !== undefined ? L[n] : (L[n] = gl.getUniformLocation(GPU.prog, n));
  const f1 = (n, a) => gl.uniform1f(at(n), a), f2 = (n, a, b) => gl.uniform2f(at(n), a, b), i1 = (n, a) => gl.uniform1i(at(n), a);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  gl.viewport(0, 0, W, H);
  if (GPU.maskN !== maskN || GPU.maskRef !== mask) {      // the logo as a texture: the shape in red, its blur in green
    const n = mask.w * mask.h, px = new Uint8Array(n * 2);
    for (let i = 0; i < n; i++) { px[i * 2] = Math.round(Math.min(1, Math.max(0, mask.data[i])) * 255); px[i * 2 + 1] = Math.round(Math.min(1, Math.max(0, mask.blur[i])) * 255); }
    if (!GPU.tex) GPU.tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, GPU.tex); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, mask.w, mask.h, 0, gl.RG, gl.UNSIGNED_BYTE, px);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    GPU.maskN = maskN; GPU.maskRef = mask;
  }
  i1('uMask', 0); f2('uMw', mask.w, mask.h); f2('uRes', W, H);
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
  // tear, slip and slices, as mkDisp
  const cy = st.crush, n = st.nSl, sl = new Float32Array(24);
  for (let i = 0; i < n; i++) { sl[i * 3] = st.sl[i].a; sl[i * 3 + 1] = st.sl[i].b; sl[i * 3 + 2] = st.sl[i].d; }
  f2('uCrush', cy ? Math.max(2, Math.round(cy * FW / H)) : 0, cy || 0); i1('uNSl', n); gl.uniform3fv(at('uSl[0]'), sl);
  f1('uTA', st.tearA * o.wobA + o.wobB); f1('uTF', st.tearF * o.wobF); f1('uTP', st.tearP); f1('uDA', st.dropA * o.wobA + o.wobB * 0.7); f1('uDF', st.dropF * o.wobF); f1('uDP', st.dropP);
  const gapN = each ? 0 : o.gapN || 0, gk = 1 / (1 + (o.gap || 0));
  f1('uGapN', gapN); f1('uGk', gk); f1('uGoff', (1 - gk) / 2);
  // the style
  const tint = gpuHex(o.tint), core = gpuHex(CORE);
  gl.uniform3f(at('uTint'), tint[0], tint[1], tint[2]); gl.uniform3f(at('uCore'), core[0], core[1], core[2]);
  f1('uT', t); f1('uC1', cyc(1, o)); f1('uC2', cyc(2, o)); f1('uC3', cyc(3, o)); f1('uDir', o.vb < 0.5 ? -1 : 1); f1('uAmb', o.amb); f1('uEase', o.ease);
  if (sn === 'dither') {
    const unit = Math.min(W, H) / lerp(20, 90, o.density), cols = Math.ceil(W / unit), rows = Math.ceil(H / unit), bm = BAYER[mode];
    i1('uStyle', 0); i1('uMode', md); f1('uUnit', unit); f2('uCR', cols, rows); f2('uO', (W - cols * unit) / 2, (H - rows * unit) / 2); f1('uS', Math.max(1, unit * o.pfill)); f1('uFq', 0.8 + 1.4 * o.va);
    if (bm) { const b = new Float32Array(64); b.set(bm); gl.uniform1fv(at('uBay[0]'), b); i1('uBn', Math.sqrt(bm.length)); } else i1('uBn', 2);
  } else {
    const unit = Math.min(W, H) / lerp(22, 96, o.density), rows = Math.max(6, Math.round(H / unit)), py = H / rows, cols = Math.max(3, Math.round(W / (unit * 2.4)));
    i1('uStyle', 1); f2('uCR', cols, rows); f1('uPy', py); f1('uPx', W / cols); f1('uDw', py * 0.56 * o.pfill); f1('uDh', py * 0.82 * o.pfill); f1('uFq', 0.6 + 1.8 * o.va);
  }
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  q.drawImage(cv, 0, 0);
  GPU.used++;
  return true;
}

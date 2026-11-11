/* ---------- drawing on the graphics card ----------
   What costs time in a frame is working out, in script, how lit every cell of every layer is: measured, the sums are the
   whole cost and the canvas calls nearly nothing. So a layer is moved here whole: one fragment shader works out the field
   and draws the style, cell for cell the way the canvas version does. The canvas version stays as the reference, and is
   what runs for anything not moved yet and for every export.

   Moved so far: the base, glitch, logo and type layers and the symbols, drawn as Dither (ordered, halftone, lines, noise),
   LED rods or Light streaks, with square, dot or diamond pixels.
   Everything else falls back by itself: gpuLogo and the others return false and the caller draws the old way. */
const GPU = { acc: { on: false, open: false, has: false, w: 0, h: 0, lay: null, sum: null, copy: null, flat: null, broken: false }, force: false, name: '', cv: null, gl: null, progs: null, bad: false, maskN: -1, tex: null, used: 0, mt: new Map(), mtNew: false, rows: null, rd: null, maxT: 2048 };
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
// Words and symbols are lists of rows, each a mask with its own place. The list goes over as a table of numbers (uRows:
// one line a row, eight cells of settings, then a cell for each letter or pillar) and the masks as up to twelve textures.
const GPU_MT = 12, GPU_RW = 256, GPU_RH = 48;
const GPU_ROWS = `
uniform sampler2D uRows, uT0, uT1, uT2, uT3, uT4, uT5, uT6, uT7, uT8, uT9, uT10, uT11;
uniform int uRn;
#define R(k) texelFetch(uRows, ivec2(k, i), 0)
#define TX(s) { vec2 w = vec2(textureSize(s, 0)); return textureLod(s, (p * (w - 1.) + .5) / w, 0.).rg; }
// one mask read as sample() reads it: nothing outside it, the shape in red and its blur in green
vec2 tx(int n, float u, float v) {
  if (u < 0. || u > 1. || v < 0. || v > 1.) return vec2(0.);
  vec2 p = vec2(u, v);
  if (n == 0) TX(uT0) if (n == 1) TX(uT1) if (n == 2) TX(uT2) if (n == 3) TX(uT3) if (n == 4) TX(uT4) if (n == 5) TX(uT5)
  if (n == 6) TX(uT6) if (n == 7) TX(uT7) if (n == 8) TX(uT8) if (n == 9) TX(uT9) if (n == 10) TX(uT10) if (n == 11) TX(uT11)
  return vec2(0.);
}
`;
// the type layer: every row of words with its own way of showing (typeField). A row's cells: place and size; tile, gain,
// cut, cursor; roll, tear, phase, cursor width; mask, outline, wave or letters, letter count; letters shown, wave height,
// turned or not; then the turn itself in two cells. A letter's cell: its right edge, its moment, its wrong frame, its wave step.
const GPU_TYPE = `
uniform vec2 uFW;
float field(float u0, float v0) {
  vec2 dq = disp(u0, v0);
  float val = 0.;
  for (int i = 0; i < ${GPU_RH}; i++) {
    if (i >= uRn) break;
    vec4 A = R(0), B = R(1), C = R(2), D = R(3), E = R(4);
    float u = dq.x, v = dq.y;
    if (E.z > .5) {                                       // back through the block's own turn and scale, in real pixels
      vec4 F = R(5), G = R(6);
      if (abs(G.x) < .03 || G.y < .03) continue;
      float dx = (u - F.x) * uFW.x, dy = (v - F.y - G.z) * uFW.y, rx = dx * F.z + dy * F.w, ry = dy * F.z - dx * F.w;
      u = F.x + rx / (uFW.x * G.x); v = F.y + ry / (uFW.y * G.y);
    }
    if (C.x != 0.) { v += C.x; v -= floor(v); u += C.y * nz(v * 9. + C.z, 21); }
    float lv = (v - A.y) / A.w;
    if (lv < 0. || lv > 1.) continue;
    float lu = (u - A.x) / A.z;
    if (B.x >= 0.) { lu += B.x; lu -= floor(lu); }
    else if (lu < 0.) continue;
    if (B.w >= 0. && lu >= B.w - 4e-6 && lu < B.w + C.w && lv > .12 && lv < .88) { val = 1.; continue; }      // a cell that sits exactly on the cursor's edge is in, as the sums say
    if (lu > 1. || lu > B.z) continue;
    if (D.z > .5) {                                       // which letter this is, then its wave step or its own moment
      int n = int(D.w), c = 0;
      for (int k = 0; k < ${GPU_RW - 8}; k++) { if (c >= n - 1 || texelFetch(uRows, ivec2(8 + c, i), 0).x > lu) break; c++; }
      vec4 Lc = texelFetch(uRows, ivec2(8 + c, i), 0);
      if (D.z < 1.5) lv = (lv - .5) * E.y + .5 + Lc.w;
      else { if (Lc.y > E.x) continue; if (E.x - Lc.y < .07 && E.x < 1.) lv += Lc.z; }
      if (lv < 0. || lv > 1.) continue;
    }
    vec2 s = tx(int(D.x), lu, lv);
    float b = D.y > .5 ? (s.g > .22 && s.g < .7 ? B.y : 0.) : s.r * B.y;
    val = max(val, b);
  }
  return val;
}
`;
// symbols: shapes across the frame with their echoes, or one in every pillar (symField). A row's cells: place and size, then
// mask and gain; for a row of pillars size, height, pillar count and gain, then one cell a pillar saying which mask it shows.
const GPU_SYM = `
float field(float u, float v) {
  float val = 0.;
  for (int i = 0; i < ${GPU_RH}; i++) {
    if (i >= uRn) break;
    vec4 A = R(0), B = R(1);
    if (B.z > .5) {
      float x = u * A.w, pi = clamp(floor(x), 0., A.w - 1.), mi = texelFetch(uRows, ivec2(8 + int(pi), i), 0).x;
      if (mi >= 0.) val = max(val, tx(int(mi), (x - pi - .5) / A.x + .5, (v - A.y) / A.z + .5).r * B.y);
    } else if (B.x >= 0.) val = max(val, tx(int(B.x), (u - A.x) / A.z, (v - A.y) / A.w).r * B.y);
  }
  return val;
}
`;
const GPU_TAIL = `
uniform int uShape;
uniform vec2 uNb, uExt;
// each pillar is a window onto its own stretch of a picture as wide as the whole ring, air included
uniform float uFlip;
float M(float u, float v) { if (uFlip > .5) u = 1. - u; if (uGapN > 0.) { float x = u * uGapN, i = floor(x); u = (i + uGoff + (x - i) * uGk) / uGapN; } return field(u, v); }
bool inside(float x, float y, float cx, float cy, float w, float h) {
  float x0 = floor(cx - w / 2. + .5), y0 = floor(cy - h / 2. + .5);
  return x >= x0 && x < x0 + max(1., floor(w + .5)) && y >= y0 && y < y0 + max(1., floor(h + .5));
}
// how much of the pixel at x, y a cell's shape covers (litShape): a square on whole pixels, or a dot or a diamond with soft edges.
// The soft edge is the area covered, taken in eight slices down the pixel with each slice's width worked out exactly.
float cover(float x, float y, float cx, float cy, float w, float h) {
  if (uShape == 0) return inside(x, y, cx, cy, w, h) ? 1. : 0.;
  float hw = uShape == 1 ? max(.6, w / 2.) : .6 * w, hh = uShape == 1 ? max(.6, h / 2.) : .6 * h, a = 0.;
  if (x + 1. <= cx - hw || x >= cx + hw || y + 1. <= cy - hh || y >= cy + hh) return 0.;
  for (int k = 0; k < 8; k++) {
    float dy = abs(y + (float(k) + .5) / 8. - cy) / hh;
    if (dy >= 1.) continue;
    float half_ = hw * (uShape == 1 ? sqrt(1. - dy * dy) : 1. - dy);
    a += max(0., min(x + 1., cx + half_) - max(x, cx - half_));
  }
  return a / 8.;
}
// how much of the stretch from a to b the pixel starting at x holds
float span(float x, float a, float b) { return max(0., min(x + 1., b) - max(x, a)); }
// The cells that reach this pixel, at most four: how much each covers, its two brightness steps, and where its shape is
float eC[4]; int eI[4], eJ[4], eN = 0; vec4 eG[4];
void add(float cov, float I, float cx, float cy, float w, float h) {
  if (cov <= 0. || I < .03 || eN >= 4) return;
  eC[eN] = cov; eI[eN] = int(max(1., floor(min(1., I) * 32. + .5))); eJ[eN] = I > .55 ? int(floor(min(1., (I - .55) * 1.8) * 32. + .5)) : 0;
  eG[eN] = vec4(cx, cy, uShape == 1 ? max(.6, w / 2.) : .6 * w, uShape == 1 ? max(.6, h / 2.) : .6 * h); eN++;
}
// brightness in 32 steps, as the canvas version gathers it: every step of the tint from dim to bright, then the hot ones on top.
// mask says which of the cells lie over this spot.
vec3 over(vec3 col, int mask) {
  for (int pass = 0; pass < 2; pass++) {
    int last = 0;
    for (int k = 0; k < 4; k++) {
      int best = 99;
      for (int e = 0; e < eN; e++) { int s = pass == 0 ? eI[e] : eJ[e]; if ((mask >> e & 1) == 1 && s > last && s < best) best = s; }
      if (best == 99) break;
      col = mix(col, pass == 0 ? uTint : uCore, float(best) / 32.); last = best;
    }
  }
  return col;
}
void main() {
  float x = gl_FragCoord.x - .5, y = uRes.y - gl_FragCoord.y - .5;
  vec3 col = vec3(0.);
  if (uStyle == 0) {                                     // dither
    float c0 = floor((x + .5 - uO.x) / uUnit), r0 = floor((y + .5 - uO.y) / uUnit);
    for (float dr = -uNb.y; dr <= uNb.y; dr++) for (float dc = -uNb.x; dc <= uNb.x; dc++) {
      float c = c0 + dc, r = r0 + dr;
      if (c < 0. || c >= uCR.x || r < 0. || r >= uCR.y) continue;
      float cx = uO.x + c * uUnit + uUnit / 2., cy = uO.y + r * uUnit + uUnit / 2.;
      if (x + 1. <= cx - uExt.x || x >= cx + uExt.x || y + 1. <= cy - uExt.y || y >= cy + uExt.y) continue;
      float cov = uMode == 3 ? 1. : cover(x, y, cx, cy, uS, uS);
      if (cov <= 0.) continue;
      float u = cx / uRes.x, v = cy / uRes.y, m = M(u, v);
      float f1 = .5 + .5 * sin(TAU * (v * uFq - uDir * uT * uC2 + .18 * sin(TAU * (u * 1.5 + uT * uC1))));
      float f2 = .5 + .5 * sin(TAU * (u + v * .6 + uT * uC1));
      float val = m * (.4 + .6 * f1) + uAmb * (1. - m) * .17 * f2 * f2;
      if (uMode == 3) {                                  // halftone: the cell grows with the value
        if (val > .03) { float z = uS * 1.25 * sqrt(min(1., val)); add(cover(x, y, cx, cy, z, z), .45 + .55 * min(1., val), cx, cy, z, z); }
        continue;
      }
      bool on;
      if (uMode == 0) on = val > (uBay[int(mod(r, float(uBn))) * uBn + int(mod(c, float(uBn)))] + .5) / float(uBn * uBn);
      else if (uMode == 1) on = val > mod(r, 4.) * .25 + .06 + .12 * mod(c, 2.);
      else on = val > .04 + .96 * hash(int(c), int(r), 7);
      if (on) add(cov, m > .5 ? .5 + .5 * f1 : .3 + .5 * m, cx, cy, uS, uS);
    }
  } else if (uStyle == 1) {                              // LED rods
    float c = floor((x + .5) / uPx), r0 = floor((y + .5) / uPy);
    float cx = (c + .5) * uPx, u = cx / uRes.x;
    if (uAmb > 0.) { float x0 = floor(cx - uLw / 2. + .5); if (x >= x0 && x < x0 + max(1., floor(uLw + .5))) col = uTint * .08; }      // the faint rod itself
    int ci = int(c);
    float sp = (hash(ci, 1, 7) * 2. < 1. ? uC1 : uC2) * (hash(ci, 2, 7) < .5 ? -1. : 1.), ph = hash(ci, 3, 7);
    float ts = uT + .85 * uEase * sin(TAU * (uC3 * uT + hash(ci, 50, 7))) / (TAU * uC3);
    for (float dr = -uNb.y; dr <= uNb.y; dr++) {
      float r = r0 + dr, v = (r + .5) / uCR.y, cov = r < 0. || r >= uCR.y ? 0. : cover(x, y, cx, v * uRes.y, uDw, uDh);
      if (cov <= 0.) continue;
      float m = M(u, v);
      float wave = pow(.5 + .5 * cos(TAU * (v * uFq - uDir * uT * uC2 + .12 * sin(TAU * (u * 1.5 + uT * uC1)))), 2.);
      float d = wrapd(v - ph - sp * ts), pk = exp(-(d * d) / .003);
      add(cov, m * (.4 + .6 * wave) + pk * (.2 * uAmb + .6 * m), cx, v * uRes.y, uDw, uDh);
    }
  } else {                                               // light streaks: which wire, then the dashes this pixel touches, one or two of them
    float wi = floor((x + .5) / uPx), xc = (wi + .5) * uPx, u = xc / uRes.x, sh = uRes.y / uCR.y;
    int i = int(wi);
    if (uAmb > 0.) col = uTint * (.07 * span(x, xc - uLw / 2., xc + uLw / 2.));      // the faint wire itself
    float dir = hash(i, 5, 7) < .5 ? -1. : 1., p[3], L[3];
    for (int k = 0; k < 3; k++) {
      float sw = uT + .85 * uEase * sin(TAU * (uC3 * uT + hash(i * 3 + k, 50, 7))) / (TAU * uC3);
      p[k] = hash(i, 20 + k, 7) + dir * (hash(i, 10 + k, 7) * 2. < 1. ? uC1 : uC2) * sw; L[k] = .018 + .04 * hash(i, 30 + k, 7);
    }
    float breath = .72 + .28 * sin(TAU * (uT * uC1 + hash(i, 40, 7))), j0 = floor(y / sh);
    for (float j = j0; j <= j0 + 3.; j++) {
      if (j >= uCR.y || j * sh >= y + 1.) break;
      float cy = span(y, j * sh, (j + .7) * sh);
      if (cy <= 0.) continue;
      float sm = (j + .35) / uCR.y, m = M(u, sm), P = 0.;
      for (int k = 0; k < 3; k++) { float d = wrapd(sm - p[k]); P += exp(-(d * d) / (L[k] * L[k])); }
      float I = P * (.22 * uAmb + .9 * m) + m * .55 * breath;
      if (I < .03) continue;
      // a stroked line's soft edge is the whole pixel lit by its share, once for the tint and once more for the hot middle
      float a1 = min(1., I), hw = uLw * (.8 + 2.4 * a1) / 2., cov = min(cy, span(x, xc - hw, xc + hw));
      col = mix(col, uTint, cov * a1);
      if (I > .5) col = mix(col, uCore, cov * min(1., (I - .5) * 1.5));
    }
  }
  // A cell's soft edge is part of a pixel lit in full, not the whole pixel lit faintly. One cell: its share of the pixel. Several
  // (touching dots, halftone cells grown into each other): 32 spots in the pixel, each asked which cells lie over it.
  if (eN == 1) col = mix(col, over(col, 1), eC[0]);
  else if (eN > 1) {
    float w[16]; for (int m = 0; m < 16; m++) w[m] = 0.;
    if (uShape == 0) w[(1 << eN) - 1] = 1.;
    else for (int k = 0; k < 8; k++) for (int i = 0; i < 4; i++) {
      float sx = x + (float(i) + (mod(float(k) * 5., 8.) + .5) / 8.) / 4., sy = y + (float(k) + .5) / 8.; int m = 0;
      for (int e = 0; e < eN; e++) { vec2 d = abs(vec2(sx, sy) - eG[e].xy) / eG[e].zw; if (uShape == 1 ? dot(d, d) < 1. : d.x + d.y < 1.) m |= 1 << e; }
      w[m] += 1. / 32.;
    }
    vec3 base = col; col *= w[0];
    for (int m = 1; m < 16; m++) if (w[m] > 0.) col += w[m] * over(base, m);
  }
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
    const progs = { logo: mk(GPU_LOGO), fx: mk(GPU_FX), base: mk(GPU_BASE), type: mk(GPU_ROWS + GPU_TYPE), sym: mk(GPU_ROWS + GPU_SYM) };
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); if (GPU.cv !== cv) return; GPU.gl = null; GPU.progs = null; GPU.maskN = -1; Object.assign(GPU.acc, { on: false, w: 0, h: 0, lay: null, sum: null, copy: null, flat: null }); GPU.tex = null; GPU.mt.clear(); GPU.rows = null; });      // comes back by itself on the next frame
    GPU.cv = cv; GPU.gl = gl; GPU.progs = progs; GPU.maskN = -1; GPU.maxT = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    return true;
  } catch (e) { GPU.bad = true; GPU.why = String(e && e.message).slice(0, 300); console.warn('gpu: ' + GPU.why); return false; }      // not an error: the canvas version takes over
}
const gpuHex = h => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h) || [0, 'ff', 'ff', 'ff']; return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255]; };
// which dither a shader can draw: ordered 0, lines 1, noise 2, halftone 3. Diffusion carries its error from cell to cell, so it stays in script.
const gpuDither = mode => BAYER[mode] ? 0 : mode === 'lines' ? 1 : mode === 'noise' ? 2 : mode === 'halftone' ? 3 : -1;
// Dither, LED rods and Light streaks (without the fan, which only the old wide format had) in all three pixel shapes
const gpuCan = (sn, o, st) => (sn === 'rods' || (sn === 'dither' && gpuDither(o.dither) >= 0) || (sn === 'streaks' && !o.fan)) && st.nSl <= 8 && gpuInit();
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
  f2('uRes', W, H); f1('uGapN', gapN); f1('uGk', gk); f1('uGoff', (1 - gk) / 2); f1('uFlip', o.flipU ? 1 : 0);
  const tint = gpuHex(o.tint), core = gpuHex(CORE);
  gl.uniform3f(at('uTint'), tint[0], tint[1], tint[2]); gl.uniform3f(at('uCore'), core[0], core[1], core[2]);
  f1('uT', t); f1('uC1', cyc(1, o)); f1('uC2', cyc(2, o)); f1('uC3', cyc(3, o)); f1('uDir', o.vb < 0.5 ? -1 : 1); f1('uAmb', o.amb); f1('uEase', o.ease);
  // a dot or a diamond has soft edges and a halftone cell outgrows its place, so a pixel can belong to its neighbours too:
  // uNb is how many cells to look at either side, uExt how far a cell can reach from its middle
  i1('uShape', SHAPE);
  if (sn === 'streaks') {
    const unit = Math.min(W, H) / lerp(22, 90, o.density), n = Math.max(3, Math.round(W / (unit * 2.6)));
    i1('uStyle', 2); f2('uCR', n, Math.max(16, Math.round(H / (unit * 0.55)))); f1('uPx', W / n); f1('uLw', Math.max(1, Math.min(W, H) / 600));
  } else if (sn === 'dither') {
    const unit = Math.min(W, H) / lerp(20, 90, o.density), cols = Math.ceil(W / unit), rows = Math.ceil(H / unit), bm = BAYER[mode];
    i1('uStyle', 0); i1('uMode', gpuDither(mode)); f1('uUnit', unit); f2('uCR', cols, rows); f2('uO', (W - cols * unit) / 2, (H - rows * unit) / 2); f1('uS', Math.max(1, unit * o.pfill)); f1('uFq', 0.8 + 1.4 * o.va);
    const z = Math.max(1, unit * o.pfill) * (mode === 'halftone' ? 1.25 : 1), near = SHAPE || mode === 'halftone' ? 1 : 0, ext = !near ? 1e9 : SHAPE === 0 ? z / 2 + 1 : SHAPE === 1 ? Math.max(0.6, z / 2) : z * 0.6;
    f2('uNb', near, near); f2('uExt', ext, ext);
    if (bm) { const b = new Float32Array(64); b.set(bm); gl.uniform1fv(at('uBay[0]'), b); i1('uBn', Math.sqrt(bm.length)); } else i1('uBn', 2);
  } else {
    const unit = Math.min(W, H) / lerp(22, 96, o.density), rows = Math.max(6, Math.round(H / unit)), py = H / rows, cols = Math.max(3, Math.round(W / (unit * 2.4)));
    i1('uStyle', 1); f2('uCR', cols, rows); f1('uPy', py); f1('uPx', W / cols); f1('uDw', py * 0.56 * o.pfill); f1('uDh', py * 0.82 * o.pfill); f1('uFq', 0.6 + 1.8 * o.va); f1('uLw', Math.max(1, Math.min(W, H) / 900)); f2('uNb', 0, SHAPE ? 1 : 0);
  }
  const A = GPU.acc;
  if (A.on) {                                             // a frame is being put together on the card: this goes into the layer's own picture there
    gl.bindFramebuffer(gl.FRAMEBUFFER, A.lay.fb);
    if (!A.open) { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); A.open = true; }
    else if (q.globalCompositeOperation === 'lighten') { gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE); }      // symbols over the logo: the brighter of the two
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  } else { gl.drawArrays(gl.TRIANGLES, 0, 3); q.drawImage(GPU.cv, 0, 0); }
  GPU.used++;
}
/* Putting a face together on the card. Layers are added to each other, and adding does not care about order, so the layers
   the card drew are summed there (A.sum) and come back to the canvas in one copy at the end of the frame, on top of whatever
   layers the canvas version drew. That is one copy a face in place of one a layer. */
const GPU_COPY = '#version 300 es\nprecision highp float;uniform sampler2D s;out vec4 o;void main(){o=texelFetch(s,ivec2(gl_FragCoord.xy),0);}';
const GPU_FLAT = '#version 300 es\nprecision highp float;uniform vec4 c;out vec4 o;void main(){o=c;}';
// The card can be taken away at any moment: a driver reset, the laptop waking, another program. The browser says so with an
// event, but that comes late, so a frame asks first. A lost card is dropped on the spot and a new one made at once.
function gpuLost() {
  if (!GPU.gl || !GPU.gl.isContextLost()) return false;
  GPU.gl = null; GPU.progs = null; GPU.maskN = -1; GPU.tex = null; GPU.mt.clear(); GPU.rows = null; GPU.lostN = (GPU.lostN || 0) + 1;
  Object.assign(GPU.acc, { on: false, open: false, has: false, w: 0, h: 0, lay: null, sum: null, copy: null, flat: null });
  return true;
}
window.__gpuLose = () => { const x = GPU.gl && GPU.gl.getExtension('WEBGL_lose_context'); if (!x) return 'no card'; x.loseContext(); return 'lost'; };      // for checks
function gpuFrameBegin(W, H) {
  const A = GPU.acc; A.on = false;
  gpuLost();
  if (!gpuInit()) return false;
  const { gl, cv } = GPU;
  try {
    if (!A.copy) {
      const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
      const mk = fs => { const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, GPU_VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr)); return pr; };
      A.copy = mk(GPU_COPY); A.flat = mk(GPU_FLAT); A.copyS = gl.getUniformLocation(A.copy, 's'); A.flatC = gl.getUniformLocation(A.flat, 'c');
    }
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    if (A.w !== W || A.h !== H) {
      const target = old => { if (old) { gl.deleteTexture(old.tex); gl.deleteFramebuffer(old.fb); } const tex = gl.createTexture(), fb = gl.createFramebuffer(); gl.activeTexture(gl.TEXTURE15); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, W, H); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer'); return { tex, fb }; };
      A.lay = target(A.lay); A.sum = target(A.sum); A.w = W; A.h = H;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.activeTexture(gl.TEXTURE0);
    }
  } catch (e) { A.broken = true; console.warn('gpu: ' + (e && e.message)); }
  if (A.broken) return false;
  A.on = true; A.open = false; A.has = false;
  return true;
}
// a picture on the card over the whole of the current target
function gpuBlit(tex) {
  const { gl } = GPU, A = GPU.acc;
  gl.useProgram(A.copy); gl.activeTexture(gl.TEXTURE15); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(A.copyS, 15); gl.activeTexture(gl.TEXTURE0);
  gl.viewport(0, 0, A.w, A.h); gl.drawArrays(gl.TRIANGLES, 0, 3);
}
// The layer is done. If the card holds it: hide the pillars a pattern hides (lm, one value a pillar) and add it to the sum.
// Returns false when the layer is not on the card, and the caller finishes it the old way.
function gpuLayerEnd(lm, PN) {
  const { gl } = GPU, A = GPU.acc;
  if (!A.on || !A.open) return false;
  A.open = false;
  if (lm) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, A.lay.fb); gl.useProgram(A.flat); gl.viewport(0, 0, A.w, A.h);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.SCISSOR_TEST);
    const pw = A.w / PN;
    for (let i = 0; i < PN; i++) { const a = 1 - lm[i]; if (a > 0.01) { const x = Math.round(i * pw); gl.scissor(x, 0, Math.round((i + 1) * pw) - x, A.h); gl.uniform4f(A.flatC, 0, 0, 0, Math.min(1, a)); gl.drawArrays(gl.TRIANGLES, 0, 3); } }
    gl.disable(gl.SCISSOR_TEST);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, A.sum.fb);
  if (!A.has) { gl.disable(gl.BLEND); A.has = true; } else { gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE); }
  gpuBlit(A.lay.tex);
  gl.disable(gl.BLEND); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return true;
}
// The canvas version has more to draw in this layer (symbols the card could not): hand it what the card has so far.
function gpuLayerToCanvas(q) {
  const { gl } = GPU, A = GPU.acc;
  if (!A.on || !A.open) return;
  A.open = false;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.disable(gl.BLEND); gpuBlit(A.lay.tex);
  q.globalCompositeOperation = 'source-over'; q.globalAlpha = 1; q.drawImage(GPU.cv, 0, 0);
}
// The end of the frame: everything the card drew, onto the face in one copy.
function gpuFrameEnd(g) {
  const { gl } = GPU, A = GPU.acc;
  if (!A.on) return;
  A.on = false;
  if (!A.has) return;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.disable(gl.BLEND); gpuBlit(A.sum.tex);
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1; g.drawImage(GPU.cv, 0, 0); g.globalCompositeOperation = 'source-over';
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
// A mask as a texture, kept for as long as the mask itself is: the shape in red and, when an outline needs it, the blur in green.
function gpuMaskTex(m, blur) {
  const gl = GPU.gl; let e = GPU.mt.get(m);
  if (e && (e.blur || !blur)) return e.tex;
  if (m.w > GPU.maxT || m.h > GPU.maxT) return null;
  if (!e) { e = { tex: gl.createTexture(), blur: false }; GPU.mt.set(m, e); GPU.mtNew = true; }
  const n = m.w * m.h, bl = blur ? typeBlur(m) : null, px = bl ? new Float32Array(n * 2) : new Uint8Array(n);
  // the shape came from eight bits and goes back into eight; the blur has finer steps, and an outline is cut at set levels of it
  if (bl) for (let i = 0; i < n; i++) { px[i * 2] = m.data[i]; px[i * 2 + 1] = bl[i]; }
  else for (let i = 0; i < n; i++) px[i] = Math.round(Math.min(1, Math.max(0, m.data[i])) * 255);
  gl.activeTexture(gl.TEXTURE14); gl.bindTexture(gl.TEXTURE_2D, e.tex); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  if (bl) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, m.w, m.h, 0, gl.RG, gl.FLOAT, px);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, m.w, m.h, 0, gl.RED, gl.UNSIGNED_BYTE, px);
  for (const [a, b] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, a, b);
  e.blur = !!blur;
  return e.tex;
}
// Textures whose mask the word and symbol caches have let go of are freed. Looked at only after a new one was made.
function gpuMaskSweep() {
  GPU.mtNew = false;
  const live = new Set(typeMasks.values()); for (const m of symMasks.values()) live.add(m);
  for (const [m, e] of GPU.mt) if (!live.has(m)) { GPU.gl.deleteTexture(e.tex); GPU.mt.delete(m); }
}
// n rows of the table and their masks handed to the program in use
function gpuRows(u, d, n, tex) {
  const { gl, i1 } = u;
  for (let k = 0; k < GPU_MT; k++) { gl.activeTexture(gl.TEXTURE1 + k); gl.bindTexture(gl.TEXTURE_2D, tex[k] || tex[0]); i1('uT' + k, 1 + k); }
  gl.activeTexture(gl.TEXTURE13);
  if (!GPU.rows) {
    GPU.rows = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, GPU.rows); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, GPU_RW, GPU_RH, 0, gl.RGBA, gl.FLOAT, null);
    for (const [a, b] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, a, b);
  } else gl.bindTexture(gl.TEXTURE_2D, GPU.rows);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, GPU_RW, n, gl.RGBA, gl.FLOAT, d, 0);
  gl.activeTexture(gl.TEXTURE0);
  i1('uRows', 13); i1('uRn', n);
}
const gpuNoDisp = u => { u.i1('uNSl', 0); u.f2('uCrush', 0, 0); u.f1('uTA', 0); u.f1('uDA', 0); };
// The type layer, from the same rows as typeField. More than GPU_RH rows, more than GPU_MT different lines of words at once,
// or a wave or letters line too long for the table go back to the canvas version.
function gpuType(q, W, H, Wf, t, o, st, sn) {
  if (!gpuCan(sn, o, st)) return false;
  const rows = typeRows(Wf, H, o, st), n = rows.length, RW = GPU_RW * 4;
  if (n > GPU_RH) return false;
  if (!n) return true;                                   // nothing to show: the layer stays black
  const d = GPU.rd || (GPU.rd = new Float32Array(RW * GPU_RH)), ms = [], bl = [], tex = [];
  for (let i = 0; i < n; i++) {
    const it = rows[i], m = it.m, k = i * RW, lt = it.wv || it.sc ? m.adv.length - 1 : 0, tf = it.tf;
    let mi = ms.indexOf(m);
    if (mi < 0) { if (ms.length >= GPU_MT) return false; mi = ms.push(m) - 1; bl.push(false); }
    if (it.ol) bl[mi] = true;
    if (lt > GPU_RW - 8) return false;
    d.fill(0, k, k + 32);
    d[k] = it.left; d[k + 1] = it.top; d[k + 2] = it.wT; d[k + 3] = it.hT;
    d[k + 4] = it.tile === null ? -1 : it.tile - Math.floor(it.tile); d[k + 5] = it.gain; d[k + 6] = it.cut; d[k + 7] = it.cur;      // only the fraction of a tile's travel counts
    d[k + 8] = it.roll; d[k + 9] = it.tear; d[k + 10] = it.ph; d[k + 11] = 0.55 * m.h / m.w;
    d[k + 12] = mi; d[k + 13] = it.ol ? 1 : 0; d[k + 14] = it.wv ? 1 : it.sc ? 2 : 0; d[k + 15] = lt;
    d[k + 16] = it.sc ? it.sc.p : 0; d[k + 17] = it.wv ? 1 + it.wv.amp * 2 : 1; d[k + 18] = tf ? 1 : 0;
    if (tf) { d[k + 20] = tf.cx; d[k + 21] = tf.cy; d[k + 22] = tf.c; d[k + 23] = tf.s; d[k + 24] = tf.sx; d[k + 25] = tf.sy; d[k + 26] = tf.dy; }
    for (let c = 0; c < lt; c++) {
      const j = k + 32 + c * 4;
      d[j] = m.adv[c + 1]; d[j + 1] = it.sc ? hash(c, it.sc.sd, 260) : 0; d[j + 2] = it.sc ? (hash(c, it.sc.k, 261) - 0.5) * 0.5 : 0;
      d[j + 3] = it.wv ? Math.round(Math.sin(TAU * (c * it.wv.f - it.wv.ph)) * 3) / 3 * it.wv.amp : 0;
    }
  }
  for (let i = 0; i < ms.length; i++) { const x = gpuMaskTex(ms[i], bl[i]); if (!x) return false; tex.push(x); }
  const u = gpuUse('type', W, H), warp = o.tyWarp || 0;
  gpuRows(u, d, n, tex); u.f2('uFW', Wf, H);
  if (warp > 0.01) gpuDisp(u, o, st, Wf, H, warp); else gpuNoDisp(u);
  gpuDraw(u, q, W, H, t, o, sn, o.gapN || 0);
  if (GPU.mtNew) gpuMaskSweep();
  return true;
}
// Symbols, from the same list as symField: per false for the ones across the frame (Wf is then the width of the field behind
// the pillars), true for one in every pillar. Drawn with whatever blend q is set to, so the caller lays them over the logo.
// More shapes at once than GPU_MT are drawn in several goes. True when there is nothing left for the canvas version to do.
function gpuSym(q, W, H, Wf, t, o, st, per, N, sn) {
  if (!gpuCan(sn, o, st)) return false;
  const items = symItems(Wf, H, st, per), RW = GPU_RW * 4;
  if (!items.length) return true;
  if (items.length > GPU_RH || (per && N > GPU_RW - 8)) return false;
  const ms = [], at = m => { let i = ms.indexOf(m); if (i < 0) i = ms.push(m) - 1; return i; };
  const pil = items.map(it => { if (!it.per) { it.mi = at(it.m); return null; } const a = []; for (let i = 0; i < N; i++) a.push(at(it.at(i))); return a; });
  for (const m of ms) if (!gpuMaskTex(m, false)) return false;
  const d = GPU.rd || (GPU.rd = new Float32Array(RW * GPU_RH));
  for (let m0 = 0; m0 < ms.length; m0 += GPU_MT) {         // one go for each twelve shapes: a row or a pillar whose shape is in another go sits this one out
    const ix = i => i >= m0 && i < m0 + GPU_MT ? i - m0 : -1, tex = ms.slice(m0, m0 + GPU_MT).map(m => gpuMaskTex(m, false));
    items.forEach((it, i) => {
      const k = i * RW, e = it.e;
      d.fill(0, k, k + 32);
      if (it.per) { d[k] = e.size; d[k + 1] = e.y; d[k + 2] = e.size * (Wf / N) / H; d[k + 3] = N; d[k + 5] = it.hit; d[k + 6] = 1; for (let p = 0; p < N; p++) d[k + 32 + p * 4] = ix(pil[i][p]); }
      else { d[k] = it.left; d[k + 1] = it.top; d[k + 2] = it.w; d[k + 3] = it.h; d[k + 4] = ix(it.mi); d[k + 5] = it.gain; }
    });
    const u = gpuUse('sym', W, H);
    gpuRows(u, d, items.length, tex); gpuNoDisp(u);
    gpuDraw(u, q, W, H, t, o, sn, per ? 0 : o.gapN || 0);
  }
  if (GPU.mtNew) gpuMaskSweep();
  return true;
}

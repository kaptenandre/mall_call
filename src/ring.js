/* ---------- the ring in 3D ----------
   Shows the frame on a ring you can turn: the outside strip on the outer face, the inside strip on the inner face.
   Sizes follow the format: one panel is one unit wide, so the radius comes from how many panels go round.
   Plain WebGL, no library, so it travels with the page when the app updates itself. */
const ringCam = { yaw: 0.6, pitch: 0.16, dist: 0 };
// Set views for the monitor. dist is in ring radiuses; under 1 the eye is inside the ring looking across it.
const RING_VIEWS = [['Outside', { yaw: 0.6, pitch: 0.16, dist: 2.6 }], ['Eye level', { yaw: 0.6, pitch: 0.015, dist: 2.1 }], ['Close', { yaw: 0.6, pitch: 0.05, dist: 1.35 }],
  ['Inside', { yaw: 0.6, pitch: 0.03, dist: 0.5 }], ['Centre', { yaw: 0.6, pitch: 0.0, dist: 0.05 }], ['Above', { yaw: 0.6, pitch: 1.3, dist: 2.9 }]];
const RING_TURN = 0.22;            // radians a second when Turn is on
let ringTurn = false, ringLast = 0;
let ringMain = null, ringBad = false;
// set up drawing on a canvas; null when this machine has no WebGL
function ringMake(cv) {
  const gl = cv.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true }) || cv.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
  if (!gl) return null;
  const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 p; uniform mat4 m; uniform vec4 geo; uniform vec4 uv; varying vec2 t; varying float a;' +
    'void main(){ float an = p.x * 6.2831853; a = p.x; t = vec2(p.x * uv.x, mix(uv.z, uv.w, p.y)); gl_Position = m * vec4(cos(an) * geo.x, (p.y - 0.5) * geo.y, sin(an) * geo.x, 1.0); }'));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, 'precision mediump float; uniform sampler2D s; uniform vec4 fg; varying vec2 t; varying float a;' +
    // fg: pillars round the ring, lit or not, the part of each sector a pillar fills, how much of the texture's width this face uses
    'void main(){ float x = a * fg.x; float off = (1.0 - fg.z) * 0.5; float f = fract(x); if (f < off || f > 1.0 - off) discard; float g = (f - off) / fg.z;' +
    ' vec3 c = fg.y > 0.5 ? texture2D(s, vec2((floor(x) + g) / fg.x * fg.w, t.y)).rgb : vec3(0.0); float seam = (g < 0.012 || g > 0.988) ? 0.3 : 1.0; gl_FragColor = vec4((c + 0.035) * seam, 1.0); }'));
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { console.warn('ring preview: ' + gl.getProgramInfoLog(pr)); return null; }
  const seg = 180, v = new Float32Array((seg + 1) * 4);
  for (let i = 0; i <= seg; i++) { v[i * 4] = i / seg; v[i * 4 + 1] = 0; v[i * 4 + 2] = i / seg; v[i * 4 + 3] = 1; }
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
  const at = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.useProgram(pr); gl.enable(gl.DEPTH_TEST);
  const loc = {};
  for (const k of ['m', 'geo', 'uv', 'fg']) loc[k] = gl.getUniformLocation(pr, k);
  return { gl, loc, n: (seg + 1) * 2 };
}
// draw the frame held in src onto the ring, w by h pixels, from where the camera stands
function ringDraw(r, cv, src, w, h) {
  const gl = r.gl, d = dims();
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const air = 1 + S.gap, Ro = S.panels * air / TAU, two = d.two, Ri = two && S.panelsIn !== S.panels ? S.panelsIn * air / TAU : Ro - 0.12, H = S.shape;
  const dist = (ringCam.dist || 2.6) * Ro, cp = Math.cos(ringCam.pitch), ex = dist * cp * Math.sin(ringCam.yaw), ey = dist * Math.sin(ringCam.pitch), ez = dist * cp * Math.cos(ringCam.yaw);
  const fl = 1 / Math.hypot(ex, ey, ez), fx = -ex * fl, fy = -ey * fl, fz = -ez * fl;
  let sx = -fz, sz = fx; const sl = 1 / Math.max(1e-6, Math.hypot(sx, sz)); sx *= sl; sz *= sl;
  const ux = -sz * fy, uy = sz * fx - sx * fz, uz = sx * fy;
  const f = 1 / Math.tan(0.5 * 0.85), asp = w / h, near = Math.max(0.01, dist * 0.02), far = dist + Ro * 4 + H, nf = 1 / (near - far);
  const V = [sx, ux, -fx, 0, 0, uy, -fy, 0, sz, uz, -fz, 0, -(sx * ex + sz * ez), -(ux * ex + uy * ey + uz * ez), fx * ex + fy * ey + fz * ez, 1];
  const Pm = [f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0], M = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let q = 0; q < 4; q++) { let a = 0; for (let k = 0; k < 4; k++) a += Pm[k * 4 + q] * V[c * 4 + k]; M[c * 4 + q] = a; }
  gl.viewport(0, 0, w, h); gl.clearColor(0.012, 0.012, 0.018, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
  gl.uniformMatrix4fv(r.loc.m, false, M);
  gl.uniform4f(r.loc.geo, Ro, H, 0, 0); gl.uniform4f(r.loc.fg, S.panels, 1, 1 / air, d.Wo / d.W); gl.uniform4f(r.loc.uv, d.Wo / d.W, 0, two ? 0.5 : 0, 1);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, r.n);
  gl.uniform4f(r.loc.geo, Ri, H, 0, 0); gl.uniform4f(r.loc.fg, two ? S.panelsIn : S.panels, two ? 1 : 0, 1 / air, d.Wi / d.W); gl.uniform4f(r.loc.uv, d.Wi / d.W, 0, 0, 0.5);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, r.n);
}
{
  const cv = $('ring3d'); let down = null;
  const again = () => { if (!S.playing && !busy) paint(); };
  cv.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; });
  cv.addEventListener('pointermove', e => { if (!down) return; ringCam.yaw -= (e.clientX - down[0]) * 0.006; ringCam.pitch = Math.max(-1.4, Math.min(1.4, ringCam.pitch + (e.clientY - down[1]) * 0.005)); down = [e.clientX, e.clientY]; again(); });
  const up = () => { down = null; cv.style.cursor = 'grab'; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); ringCam.dist = Math.max(0.02, Math.min(8, (ringCam.dist || 2.6) * Math.exp(e.deltaY * 0.002))); again(); }, { passive: false });
  cv.addEventListener('dblclick', () => { ringCam.yaw = 0.6; ringCam.pitch = 0.16; ringCam.dist = 0; again(); });
}
// called from paint with the finished frame on the stage
function ringFrame() {
  const cv = $('ring3d');
  if (cv.hidden || ringBad) return;
  if (!ringMain) { ringMain = ringMake(cv); if (!ringMain) { ringBad = true; return; } }
  const dpr = Math.min(2, window.devicePixelRatio || 1), now = performance.now();
  if (ringTurn && S.playing && !busy && ringLast) ringCam.yaw += Math.min(0.1, (now - ringLast) / 1000) * RING_TURN;
  ringLast = now;
  ringDraw(ringMain, cv, stage, Math.max(2, Math.round(cv.clientWidth * dpr)), Math.max(2, Math.round(cv.clientHeight * dpr)));
}
{
  const bar = $('views');
  for (const [name, v] of RING_VIEWS) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = name;
    b.addEventListener('click', () => { ringCam.pitch = v.pitch; ringCam.dist = v.dist; if (!ringTurn) ringCam.yaw = v.yaw; if (!S.playing && !busy) paint(); });
    bar.append(b);
  }
  const t = document.createElement('button'); t.type = 'button'; t.textContent = 'Turn'; t.title = 'Walk slowly round the ring while it plays. A 3D film turns too.'; t.setAttribute('aria-pressed', 'false'); t.style.marginLeft = 'auto';
  t.addEventListener('click', () => { ringTurn = !ringTurn; t.setAttribute('aria-pressed', String(ringTurn)); });
  bar.append(t);
  const st = document.createElement('button'); st.type = 'button'; st.id = 'statsBtn'; st.textContent = 'Stats'; st.title = 'Show how hard the computer is working: time per frame, where it goes, processor and memory'; st.setAttribute('aria-pressed', 'false');
  st.addEventListener('click', () => { S.stats = !S.stats; statsShow(); touch(); });
  bar.append(st);
}

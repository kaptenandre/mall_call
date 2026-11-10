/* ---------- the ring in 3D ----------
   Shows the frame on a ring you can turn: the outside strip on the outer face, the inside strip on the inner face.
   Sizes follow the format: one panel is one unit wide, so the radius comes from how many panels go round.
   Plain WebGL, no library, so it travels with the page when the app updates itself. */
const ring = { gl: null, bad: false, yaw: 0.6, pitch: 0.16, dist: 0, prog: null, tex: null, n: 0, loc: {} };
function ringInit() {
  const cv = $('ring3d'), gl = cv.getContext('webgl2', { antialias: true }) || cv.getContext('webgl', { antialias: true });
  if (!gl) { ring.bad = true; return; }
  const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 p; uniform mat4 m; uniform vec4 geo; uniform vec4 uv; varying vec2 t; varying float a;' +
    'void main(){ float an = p.x * 6.2831853; a = p.x; t = vec2(p.x * uv.x, mix(uv.z, uv.w, p.y)); gl_Position = m * vec4(cos(an) * geo.x, (p.y - 0.5) * geo.y, sin(an) * geo.x, 1.0); }'));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, 'precision mediump float; uniform sampler2D s; uniform vec2 fg; varying vec2 t; varying float a;' +
    'void main(){ vec3 c = fg.y > 0.5 ? texture2D(s, t).rgb : vec3(0.0); float f = fract(a * fg.x); float seam = (f < 0.012 || f > 0.988) ? 0.3 : 1.0; gl_FragColor = vec4((c + 0.035) * seam, 1.0); }'));
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { ring.bad = true; console.warn('ring preview: ' + gl.getProgramInfoLog(pr)); return; }
  const seg = 180, v = new Float32Array((seg + 1) * 4);
  for (let i = 0; i <= seg; i++) { v[i * 4] = i / seg; v[i * 4 + 1] = 0; v[i * 4 + 2] = i / seg; v[i * 4 + 3] = 1; }
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
  const at = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  ring.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, ring.tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.useProgram(pr); gl.enable(gl.DEPTH_TEST);
  for (const k of ['m', 'geo', 'uv', 'fg']) ring.loc[k] = gl.getUniformLocation(pr, k);
  ring.gl = gl; ring.n = (seg + 1) * 2;
  let down = null;
  cv.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; });
  cv.addEventListener('pointermove', e => { if (!down) return; ring.yaw -= (e.clientX - down[0]) * 0.006; ring.pitch = Math.max(-1.4, Math.min(1.4, ring.pitch + (e.clientY - down[1]) * 0.005)); down = [e.clientX, e.clientY]; if (!S.playing && !busy) paint(); });
  const up = () => { down = null; cv.style.cursor = 'grab'; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); ring.dist = Math.max(0.02, Math.min(8, (ring.dist || 2.6) * Math.exp(e.deltaY * 0.002))); if (!S.playing && !busy) paint(); }, { passive: false });
  cv.addEventListener('dblclick', () => { ring.yaw = 0.6; ring.pitch = 0.16; ring.dist = 0; if (!S.playing && !busy) paint(); });
}
// called from paint with the finished frame on the stage
function ringFrame() {
  const cv = $('ring3d');
  if (cv.hidden || ring.bad) return;
  if (!ring.gl) { ringInit(); if (ring.bad) return; }
  const gl = ring.gl, d = dims(), dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.max(2, Math.round(cv.clientWidth * dpr)), h = Math.max(2, Math.round(cv.clientHeight * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const Ro = S.panels / TAU, two = d.two, Ri = two && S.panelsIn !== S.panels ? S.panelsIn / TAU : Ro - 0.12, H = S.shape;
  const dist = (ring.dist || 2.6) * Ro, cp = Math.cos(ring.pitch), ex = dist * cp * Math.sin(ring.yaw), ey = dist * Math.sin(ring.pitch), ez = dist * cp * Math.cos(ring.yaw);
  // view: look at the centre from the eye; then a perspective
  const fl = 1 / Math.hypot(ex, ey, ez), fx = -ex * fl, fy = -ey * fl, fz = -ez * fl;
  let sx = -fz, sz = fx; const sl = 1 / Math.max(1e-6, Math.hypot(sx, sz)); sx *= sl; sz *= sl;
  const ux = -sz * fy, uy = sz * fx - sx * fz, uz = sx * fy;
  const f = 1 / Math.tan(0.5 * 0.85), asp = w / h, near = Math.max(0.01, dist * 0.02), far = dist + Ro * 4 + H, nf = 1 / (near - far);
  const V = [sx, ux, -fx, 0, 0, uy, -fy, 0, sz, uz, -fz, 0, -(sx * ex + sz * ez), -(ux * ex + uy * ey + uz * ez), fx * ex + fy * ey + fz * ez, 1];
  const Pm = [f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0], M = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let a = 0; for (let k = 0; k < 4; k++) a += Pm[k * 4 + r] * V[c * 4 + k]; M[c * 4 + r] = a; }
  gl.viewport(0, 0, w, h); gl.clearColor(0.012, 0.012, 0.018, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, stage);
  gl.uniformMatrix4fv(ring.loc.m, false, M);
  gl.uniform4f(ring.loc.geo, Ro, H, 0, 0); gl.uniform2f(ring.loc.fg, S.panels, 1); gl.uniform4f(ring.loc.uv, d.Wo / d.W, 0, two ? 0.5 : 0, 1);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, ring.n);
  gl.uniform4f(ring.loc.geo, Ri, H, 0, 0); gl.uniform2f(ring.loc.fg, two ? S.panelsIn : S.panels, two ? 1 : 0); gl.uniform4f(ring.loc.uv, d.Wi / d.W, 0, 0, 0.5);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, ring.n);
}

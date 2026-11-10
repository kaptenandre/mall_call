// Mall Call: main process. One window, native menus, project files, autosave and file export.
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { spawn, execFile } = require('child_process');
const update = require('./update.js');

const NAME = 'Mall Call';
const SMOKE = process.argv.includes('--smoke');   // start-up check: load hidden, test, print one line, quit
let win = null, outWin = null, projectPath = null, lastDir = null;

app.setName(NAME);
if (SMOKE) app.setPath('userData', path.join(app.getPath('temp'), 'mallcall-smoke-' + process.pid));   // never touch the real session
const autosaveFile = () => path.join(app.getPath('userData'), 'autosave.json');
const oldAutosaveFile = () => path.join(app.getPath('appData'), 'Circle Logo Loops', 'autosave.json');   // session saved under the app's first name
const send = cmd => { if (win && !win.isDestroyed()) win.webContents.send('menu', cmd); };
const setTitle = () => { if (win && !win.isDestroyed()) win.setTitle(projectPath ? path.basename(projectPath) + ' · ' + NAME : NAME); };

async function readForPage(p) {
  try { const b = await fsp.readFile(p); return { name: path.basename(p), path: p, data: b }; }
  catch (e) { return null; }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1560, height: 1000, minWidth: 980, minHeight: 640, show: !SMOKE,
    backgroundColor: '#07070a', title: NAME,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,                    // keep animating when another app is in front
      autoplayPolicy: 'no-user-gesture-required'      // a reopened project may start its sound
    }
  });
  win.on('page-title-updated', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    // the page opens exactly one window of its own: the clean output. It paints into it directly.
    if ((url === '' || url === 'about:blank') && frameName === 'mallcall-output') return { action: 'allow', overrideBrowserWindowOptions: { width: 960, height: 540, backgroundColor: '#000000', title: NAME + ' Output', autoHideMenuBar: true, show: !SMOKE, webPreferences: { backgroundThrottling: false } } };
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-create-window', w => {
    outWin = w;
    w.on('page-title-updated', e => e.preventDefault());
    w.on('closed', () => { if (outWin === w) outWin = null; });
  });
  win.on('closed', () => { win = null; if (outWin && !outWin.isDestroyed()) outWin.close(); });
  if (SMOKE) smoke();
  win.loadFile(SMOKE ? path.join(__dirname, 'app', 'index.html') : update.pagePath());
  setTitle();
}

// Updates: look once at launch without holding the window up for long. A check from the menu loads what it finds at once;
// one that finishes late waits for Reload With Update, so work in the window is never thrown away unasked.
let updateWaiting = false;
function loadPage() { updateWaiting = false; buildMenu(); if (win && !win.isDestroyed()) win.loadFile(update.pagePath()); }
async function checkUpdates(reload, quick) {
  const got = await update.check(quick);
  if (got && reload === true) return loadPage();
  if (got) updateWaiting = true;
  buildMenu();
  // found while running: tell the page. It saves the session and asks to be reloaded as soon as it is not rendering.
  if (got && reload === 'ask') send('update-ready');
}
ipcMain.handle('reload-update', () => { if (updateWaiting) loadPage(); return true; });

function buildMenu() {
  const mac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [
      { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: () => { projectPath = null; setTitle(); send('new-project'); } },
      { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: () => send('open-project') },
      { type: 'separator' },
      { label: 'Save Project', accelerator: 'CmdOrCtrl+S', click: () => send('save-project') },
      { label: 'Save Project As…', accelerator: 'Shift+CmdOrCtrl+S', click: () => send('save-project-as') },
      { type: 'separator' },
      { label: 'Open Logo…', accelerator: 'CmdOrCtrl+L', click: () => send('open-logo') },
      { label: 'Open Sound…', accelerator: 'Shift+CmdOrCtrl+O', click: () => send('open-sound') },
      { type: 'separator' },
      { label: 'Export MP4…', accelerator: 'CmdOrCtrl+E', click: () => send('export') },
      ...(mac ? [] : [{ type: 'separator' }, { role: 'quit' }])
    ] },
    { label: 'Edit', submenu: [
      { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
      { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', click: () => send('redo') },
      { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
    ] },
    { label: 'Playback', submenu: [
      { label: 'Play / Pause', accelerator: 'CmdOrCtrl+Return', click: () => send('play') },
      { label: 'New Variation', accelerator: 'CmdOrCtrl+G', click: () => send('new-variation') },
      { type: 'separator' },
      { label: 'Output Window', accelerator: 'Shift+CmdOrCtrl+F', click: () => send('output') }
    ] },
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
      { role: 'togglefullscreen' }
    ] },
    { label: 'Updates', submenu: [
      { label: update.status(), enabled: false },
      { label: 'Check Now', click: () => checkUpdates(true) },
      { label: 'Reload With Update', enabled: updateWaiting, click: () => loadPage() },
      { type: 'separator' },
      { label: 'Follow', enabled: false },
      ...['latest', 'off', ...new Set(['main', ...update.state().branches, update.state().channel].filter(b => b && b !== 'off' && b !== 'latest'))].map(b => ({
        label: b === 'off' ? 'Nothing (use the built-in version)' : b === 'latest' ? 'The newest work, whichever branch' : b, type: 'radio', checked: update.state().channel === b,
        click: async () => { await update.setChannel(b); if (b === 'off') { buildMenu(); loadPage(); } else checkUpdates(true); }
      }))
    ] },
    { role: 'windowMenu' }
  ]));
}

ipcMain.handle('save-file', async (event, name, data) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(lastDir || app.getPath('movies'), String(name)) });
  if (r.canceled || !r.filePath) return false;
  await fsp.writeFile(r.filePath, Buffer.from(data));
  lastDir = path.dirname(r.filePath);
  return true;
});
ipcMain.handle('pick-file', async (event, kind) => {
  const filters = kind === 'logo'
    ? [{ name: 'Logo', extensions: ['svg', 'png', 'jpg', 'jpeg', 'webp'] }]
    : [{ name: 'Sound or video', extensions: ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg', 'aif', 'aiff', 'mp4', 'mov'] }];
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
  return r.canceled || !r.filePaths[0] ? null : readForPage(r.filePaths[0]);
});
ipcMain.handle('read-file', (event, p) => readForPage(String(p)));
ipcMain.handle('project-save', async (event, json, saveAs) => {
  let p = projectPath;
  if (!p || saveAs) {
    const r = await dialog.showSaveDialog(win, {
      defaultPath: p || path.join(lastDir || app.getPath('documents'), 'Untitled.mallcall'),
      filters: [{ name: NAME + ' project', extensions: ['mallcall'] }]
    });
    if (r.canceled || !r.filePath) return null;
    p = r.filePath;
  }
  await fsp.writeFile(p, String(json), 'utf8');
  projectPath = p; lastDir = path.dirname(p); setTitle();
  return p;
});
ipcMain.handle('project-open', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: NAME + ' project', extensions: ['mallcall', 'cllproj', 'json'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  try {
    const json = await fsp.readFile(r.filePaths[0], 'utf8');
    projectPath = r.filePaths[0]; lastDir = path.dirname(projectPath); setTitle();
    return { path: projectPath, json };
  } catch (e) { return null; }
});
ipcMain.handle('output-displays', () => {
  const main = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map(d => ({ width: d.size.width, height: d.size.height, primary: d.id === main }));
});
// where the output window sits: 'window' for a normal window, 'toggle' to flip full screen, or a screen number to fill that screen
ipcMain.handle('output-place', (event, where) => {
  if (!outWin || outWin.isDestroyed()) return false;
  if (where === 'toggle') { outWin.setFullScreen(!outWin.isFullScreen()); return true; }
  if (where === 'window') { outWin.setFullScreen(false); return true; }
  const d = screen.getAllDisplays()[Number(where)];
  if (!d) return false;
  outWin.setFullScreen(false); outWin.setBounds(d.bounds); outWin.setFullScreen(true);
  return true;
});
// Export through ffmpeg: ProRes or HAP in a .mov, with the start timecode and the sound. The page sends raw frames.
const FF_PATHS = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg', 'ffmpeg'];
let ffPath = null, ffJob = null;
const ffFind = async () => {
  for (const p of FF_PATHS) {
    const out = await new Promise(res => execFile(p, ['-hide_banner', '-encoders'], { maxBuffer: 4e6 }, (err, so) => res(err ? null : String(so))));
    if (out) { ffPath = p; return { ok: true, prores: /prores_ks/.test(out), hap: /\bhap\b/.test(out) }; }
  }
  return { ok: false, prores: false, hap: false };
};
ipcMain.handle('ff-check', () => ffFind());
ipcMain.handle('ff-start', async (event, o) => {
  if (ffJob) return { error: 'busy' };
  if (!ffPath && !(await ffFind()).ok) return { error: 'noffmpeg' };
  const W = o.w | 0, H = o.h | 0, fps = Number(o.fps), codec = String(o.codec);
  if (!(W > 0 && H > 0 && fps > 0) || !/^\d\d:\d\d:\d\d:\d\d$/.test(String(o.timecode)) || !['prores', 'prores4444', 'hap'].includes(codec)) return { error: 'bad' };
  let out = process.env.MALLCALL_FF_OUT || null;
  if (!out) {
    const r = await dialog.showSaveDialog(win, { defaultPath: path.join(lastDir || app.getPath('movies'), String(o.name)), filters: [{ name: 'QuickTime movie', extensions: ['mov'] }] });
    if (r.canceled || !r.filePath) return { error: 'declined' };
    out = r.filePath; lastDir = path.dirname(out);
  }
  const a = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', W + 'x' + H, '-r', String(fps), '-i', 'pipe:0'];
  const snd = o.audioPath && fs.existsSync(String(o.audioPath));
  if (snd) a.push('-ss', String(Number(o.t0) || 0), '-t', String(Number(o.dur) || 1), '-i', String(o.audioPath));
  a.push('-map', '0:v');
  if (snd) a.push('-map', '1:a:0', '-c:a', 'pcm_s16le');
  if (codec === 'hap') a.push('-vf', 'pad=ceil(iw/4)*4:ceil(ih/4)*4', '-c:v', 'hap', '-format', 'hap');     // HAP wants sizes in fours
  else a.push('-c:v', 'prores_ks', '-profile:v', codec === 'prores4444' ? '4' : '3', '-pix_fmt', codec === 'prores4444' ? 'yuv444p10le' : 'yuv422p10le', '-vendor', 'apl0');
  a.push('-timecode', String(o.timecode), '-shortest', out);
  const proc = spawn(ffPath, a, { stdio: ['pipe', 'ignore', 'pipe'] });
  const job = ffJob = { proc, out, log: '', done: null, snd };
  proc.stderr.on('data', d => { job.log = (job.log + d).slice(-2000); });
  proc.stdin.on('error', () => {});
  job.done = new Promise(res => proc.on('close', code => res(code)));
  proc.on('error', () => {});
  return { ok: true, sound: snd };
});
ipcMain.handle('ff-frame', async (event, data) => {
  const job = ffJob;
  if (!job || job.proc.exitCode !== null) return false;
  if (!job.proc.stdin.write(Buffer.from(data))) await new Promise(res => job.proc.stdin.once('drain', res));   // ffmpeg sets the pace
  return true;
});
ipcMain.handle('ff-end', async (event, abort) => {
  const job = ffJob;
  if (!job) return { error: 'nojob' };
  ffJob = null;
  if (abort) { job.proc.kill('SIGKILL'); await job.done; fsp.unlink(job.out).catch(() => {}); return { error: 'aborted' }; }
  job.proc.stdin.end();
  const code = await job.done;
  return code === 0 ? { ok: true, path: job.out } : { error: 'ffmpeg', log: job.log };
});
// The project library: a folder of projects, each a folder holding its sound and every saved version.
// Put the library in iCloud Drive, Dropbox or any synced folder and the projects are in the cloud, with their history.
//   <library>/<Project name>/versions/0001.json, 0002.json ...   whole projects; logo and font are inside the JSON
//   <library>/<Project name>/assets/<sound file>                 the sound, copied in once
const libFile = () => path.join(app.getPath('userData'), 'library.json');
const safeName = n => String(n || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 80);
async function libRoot() {
  try { const r = JSON.parse(await fsp.readFile(libFile(), 'utf8')).root; if (r) return r; } catch (e) {}
  if (SMOKE) return path.join(app.getPath('userData'), 'library');
  const icloud = path.join(app.getPath('home'), 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
  return path.join(fs.existsSync(icloud) ? icloud : app.getPath('documents'), NAME);
}
async function libVersions(dir) {
  let files = [];
  try { files = (await fsp.readdir(path.join(dir, 'versions'))).filter(f => /^\d{4}\.json$/.test(f)).sort(); } catch (e) {}
  return files.map(f => Number(f.slice(0, 4)));
}
ipcMain.handle('lib-root', async () => libRoot());
ipcMain.handle('lib-pick-root', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath: await libRoot(), message: 'Choose the folder that holds your Mall Call projects' });
  if (r.canceled || !r.filePaths[0]) return null;
  await fsp.writeFile(libFile(), JSON.stringify({ root: r.filePaths[0] }), 'utf8');
  return r.filePaths[0];
});
ipcMain.handle('lib-reveal', async (event, name) => { const root = await libRoot(), dir = path.join(root, safeName(name)); await fsp.mkdir(root, { recursive: true }); shell.openPath(name && fs.existsSync(dir) ? dir : root); return true; });
ipcMain.handle('lib-list', async () => {
  const root = await libRoot(), out = [];
  let names = [];
  try { names = await fsp.readdir(root); } catch (e) {}
  for (const n of names) { const v = await libVersions(path.join(root, n)); if (v.length) out.push({ name: n, versions: v.length, last: v[v.length - 1] }); }
  return out.sort((a, b) => a.name.localeCompare(b.name));
});
ipcMain.handle('lib-versions', async (event, name) => {
  const dir = path.join(await libRoot(), safeName(name)), out = [];
  for (const n of await libVersions(dir)) {
    try { const j = JSON.parse(await fsp.readFile(path.join(dir, 'versions', String(n).padStart(4, '0') + '.json'), 'utf8')); out.push({ n, at: j.savedAt || '', note: String(j.note || '') }); } catch (e) {}
  }
  return out;
});
ipcMain.handle('lib-save', async (event, o) => {
  const name = safeName(o && o.name);
  if (!name) return { error: 'name' };
  const dir = path.join(await libRoot(), name);
  await fsp.mkdir(path.join(dir, 'versions'), { recursive: true });
  await fsp.mkdir(path.join(dir, 'assets'), { recursive: true });
  const pj = JSON.parse(String(o.json));
  pj.savedAt = new Date().toISOString(); pj.note = String(o.note || '').slice(0, 200); pj.soundAsset = null;
  if (pj.soundPath) {                                     // the sound travels with the project
    const src = String(pj.soundPath), dst = path.join(dir, 'assets', safeName(path.basename(src)) || 'sound');
    try {
      const a = await fsp.stat(src), b = await fsp.stat(dst).catch(() => null);
      if (!b || b.size !== a.size) await fsp.copyFile(src, dst);
      pj.soundAsset = path.basename(dst);
    } catch (e) { return { error: 'sound' }; }
  }
  delete pj.soundPath;
  const v = await libVersions(dir), n = (v.length ? v[v.length - 1] : 0) + 1;
  await fsp.writeFile(path.join(dir, 'versions', String(n).padStart(4, '0') + '.json'), JSON.stringify(pj), 'utf8');
  return { ok: true, n, name, dir };
});
ipcMain.handle('lib-open', async (event, o) => {
  const name = safeName(o && o.name), dir = path.join(await libRoot(), name), v = await libVersions(dir);
  const n = o && o.n ? Number(o.n) : v[v.length - 1];
  if (!v.includes(n)) return null;
  try {
    const pj = JSON.parse(await fsp.readFile(path.join(dir, 'versions', String(n).padStart(4, '0') + '.json'), 'utf8'));
    pj.soundPath = pj.soundAsset ? path.join(dir, 'assets', path.basename(String(pj.soundAsset))) : null;
    projectPath = null; setTitle();
    return { json: JSON.stringify(pj), n, name };
  } catch (e) { return null; }
});
ipcMain.handle('autosave', async (event, json) => {
  await fsp.mkdir(path.dirname(autosaveFile()), { recursive: true });
  await fsp.writeFile(autosaveFile(), String(json), 'utf8');
  return true;
});
ipcMain.handle('autosave-load', async () => {
  for (const f of SMOKE ? [autosaveFile()] : [autosaveFile(), oldAutosaveFile()]) {
    try { return await fsp.readFile(f, 'utf8'); } catch (e) {}
  }
  return null;
});

// Start-up check, run with: npm run smoke. Prints one line starting with SMOKE and exits.
function smoke() {
  const errors = [];
  win.webContents.on('console-message', (...a) => {
    const ev = a[0] || {}, level = ev.level !== undefined ? ev.level : a[1], message = ev.message !== undefined ? ev.message : a[2];
    if (level === 'error' || level === 3) errors.push(String(message));
  });
  win.webContents.once('did-finish-load', async () => {
    let res;
    try {
      await new Promise(r => setTimeout(r, 900));
      res = await win.webContents.executeJavaScript('window.__selfTest()');
      await fsp.mkdir(path.dirname(autosaveFile()), { recursive: true });
      await fsp.writeFile(autosaveFile(), '{"probe":1}', 'utf8');
      res.diskWrite = (await fsp.readFile(autosaveFile(), 'utf8')) === '{"probe":1}';
    } catch (e) { res = { failed: String(e) }; }
    res.errors = errors; res.electron = process.versions.electron; res.chrome = process.versions.chrome; res.platform = process.platform + '-' + process.arch;
    console.log('SMOKE ' + JSON.stringify(res));
    app.exit(res.failed || errors.length ? 1 : 0);
  });
  setTimeout(() => { console.log('SMOKE ' + JSON.stringify({ failed: 'timed out', errors })); app.exit(1); }, 30000);
}

app.whenReady().then(async () => {
  if (!SMOKE) {
    await update.load();
    const first = checkUpdates(false);
    await Promise.race([first, new Promise(r => setTimeout(r, 2500))]);      // offline or slow: open with what we have
    if (update.takeFresh()) updateWaiting = false;
  }
  buildMenu(); createWindow();
  if (!SMOKE) setInterval(() => { if (update.state().channel !== 'off' && !updateWaiting) checkUpdates('ask', true); }, 180000);
  if (process.env.MALLCALL_EXPORT_TEST) win.webContents.once('did-finish-load', async () => {      // e.g. MALLCALL_EXPORT_TEST=prores or hap:3d, with MALLCALL_FF_OUT=/path/out.mov
    const [fmt, view] = process.env.MALLCALL_EXPORT_TEST.split(':');
    await new Promise(r => setTimeout(r, 1500));
    let res; try { res = await win.webContents.executeJavaScript('window.__exportTest(' + JSON.stringify(fmt) + ',' + JSON.stringify(view || '') + ')'); } catch (e) { res = { failed: String(e) }; }
    console.log('EXPORT ' + JSON.stringify(res)); app.exit(0);
  });
  if (process.env.MALLCALL_UPDATE_PROBE) win.webContents.once('did-finish-load', () => setTimeout(() => { console.log('PROBE ' + JSON.stringify({ url: win.webContents.getURL(), status: update.status(), state: update.state() })); app.exit(0); }, 600));
});
app.on('window-all-closed', () => app.quit());

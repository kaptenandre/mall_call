// Mall Call: main process. One window, native menus, project files, autosave and file export.
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, screen, session, systemPreferences } = require('electron');
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
  win.webContents.on('did-start-navigation', (e, url, inPlace, main) => { if (main && !inPlace) ffDrop(); });      // a reload in the middle of an export must not leave ffmpeg holding the job
  if (SMOKE) win.loadFile(path.join(__dirname, 'app', 'index.html')); else openPage();
  setTitle();
}
// Open the page and, when it is a fetched one, wait for it to say it started. One that does not is dropped for the built-in page.
let okTimer = null;
function openPage() {
  clearTimeout(okTimer);
  if (!win || win.isDestroyed()) return;
  if (update.reports()) okTimer = setTimeout(async () => { if (await update.markBad()) { buildMenu(); if (win && !win.isDestroyed()) win.loadFile(update.pagePath()); } }, 12000);
  win.loadFile(update.pagePath());
}
ipcMain.on('page-ok', () => clearTimeout(okTimer));

// Updates: look once at launch without holding the window up for long. A check from the menu loads what it finds at once;
// one that finishes late waits for Reload With Update, so work in the window is never thrown away unasked.
let updateWaiting = false;
function loadPage() { updateWaiting = false; buildMenu(); openPage(); }
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
      { label: 'Save a New Version', accelerator: 'CmdOrCtrl+S', click: () => send('save-version') },
      { label: 'Save as a File…', accelerator: 'Shift+CmdOrCtrl+S', click: () => send('save-project-as') },
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
// A large file is written piece by piece: a whole film in one message is more than the bridge will carry.
let saveJob = null;
const saveDrop = async () => { const j = saveJob; saveJob = null; if (j) { try { await j.fd.close(); } catch (e) {} await fsp.unlink(j.path).catch(() => {}); } };
ipcMain.handle('save-begin', async (event, name) => {
  await saveDrop();
  let out = process.env.MALLCALL_FF_OUT || null;
  if (!out) {
    const r = await dialog.showSaveDialog(win, { defaultPath: path.join(lastDir || app.getPath('movies'), String(name)) });
    if (r.canceled || !r.filePath) return { declined: true };
    out = r.filePath; lastDir = path.dirname(out);
  }
  try { saveJob = { fd: await fsp.open(out, 'w'), path: out, n: 0 }; return { ok: true }; } catch (e) { return { error: String(e && e.message) }; }
});
ipcMain.handle('save-chunk', async (event, data) => {
  if (!saveJob) return { error: 'no file open' };
  try { const b = Buffer.from(data); await saveJob.fd.write(b); saveJob.n += b.length; return { ok: true }; } catch (e) { const m = String(e && e.message); await saveDrop(); return { error: m }; }
});
ipcMain.handle('save-end', async (event, abort) => {
  if (!saveJob) return { error: 'no file open' };
  if (abort) { await saveDrop(); return { ok: true }; }
  const j = saveJob; saveJob = null;
  try { await j.fd.close(); return { ok: true, path: j.path, bytes: j.n }; } catch (e) { return { error: String(e && e.message) }; }
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
// How hard the app is working: processor use as a share of one core, by process, and memory. For the Stats box.
ipcMain.handle('metrics', () => {
  let cpu = 0, mem = 0, gpu = 0, page = 0;
  for (const m of app.getAppMetrics()) {
    const c = m.cpu ? m.cpu.percentCPUUsage : 0;
    cpu += c; mem += (m.memory ? m.memory.workingSetSize : 0) / 1024;
    if (m.type === 'GPU') gpu += c; else if (m.type === 'Tab') page += c;
  }
  return { cpu, gpu, page, mem };
});
// macOS asks the user once before an app may listen to a sound input; timecode in needs it
ipcMain.handle('mic-access', async () => { try { return process.platform === 'darwin' ? await systemPreferences.askForMediaAccess('microphone') : true; } catch (e) { return false; } });
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
function ffDrop() { const job = ffJob; if (!job) return; ffJob = null; try { job.proc.kill('SIGKILL'); } catch (e) {} job.done.then(() => fsp.unlink(job.out).catch(() => {})); }
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
  if (!job.proc.stdin.write(Buffer.from(data))) await Promise.race([new Promise(res => job.proc.stdin.once('drain', res)), job.done]);   // ffmpeg sets the pace; if it dies, stop waiting
  return job.proc.exitCode === null;
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
// The versions of a project, as numbers. When two people save at the same moment into a shared folder, both write the same
// number, and the syncing service keeps one and renames the other ("0005 (Anton's conflicted copy).json", "0005 2.json").
// Such a copy is a real version that would otherwise never show: it is taken in here under the next free number.
async function libVersions(dir) {
  const vd = path.join(dir, 'versions');
  let all = [];
  try { all = await fsp.readdir(vd); } catch (e) { return []; }
  const nums = all.filter(f => /^\d{4}\.json$/.test(f)).map(f => Number(f.slice(0, 4))).sort((a, b) => a - b);
  const strays = [];
  for (const f of all) if (/^\d{4}\D.*\.json$/i.test(f)) { try { strays.push({ f, at: (await fsp.stat(path.join(vd, f))).mtimeMs }); } catch (e) {} }
  strays.sort((a, b) => a.at - b.at);
  for (const s of strays) {
    const n = (nums.length ? nums[nums.length - 1] : 0) + 1;
    try { await fsp.rename(path.join(vd, s.f), path.join(vd, String(n).padStart(4, '0') + '.json')); nums.push(n); } catch (e) {}
  }
  return nums;
}
ipcMain.handle('lib-root', async () => libRoot());
ipcMain.handle('lib-pick-root', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath: await libRoot(), message: 'Choose the folder that holds your Mall Call projects' });
  if (r.canceled || !r.filePaths[0]) return null;
  await fsp.writeFile(libFile(), JSON.stringify({ root: r.filePaths[0] }), 'utf8');
  return r.filePaths[0];
});
ipcMain.handle('lib-reveal', async (event, name) => { const root = await libRoot(), dir = path.join(root, safeName(name)); await fsp.mkdir(root, { recursive: true }); shell.openPath(name && fs.existsSync(dir) ? dir : root); return true; });
// The app's own running record, for whoever is helping: the latest state, and a line a write so there is a history.
// It stays in the library folder. Nothing leaves the computer unless that folder is one the user syncs.
// Dropbox folders on this computer, if it has any (the old place and the one macOS uses now)
function dropboxDirs() {
  const home = app.getPath('home'), out = [];
  try { if (fs.statSync(path.join(home, 'Dropbox')).isDirectory()) out.push(path.join(home, 'Dropbox')); } catch (e) {}
  try { for (const n of fs.readdirSync(path.join(home, 'Library', 'CloudStorage'))) if (/^Dropbox/.test(n)) out.push(path.join(home, 'Library', 'CloudStorage', n)); } catch (e) {}
  return out.slice(0, 2);
}
ipcMain.handle('diag-write', async (event, json) => {
  try {
    const dir = path.join(await libRoot(), '_diagnostics'), text = String(json).slice(0, 200000);
    await fsp.mkdir(dir, { recursive: true });
    const o = JSON.parse(text); o.computer = { platform: process.platform + ' ' + process.arch, os: process.getSystemVersion ? process.getSystemVersion() : '', electron: process.versions.electron, cpus: require('os').cpus().length, cpu: (require('os').cpus()[0] || {}).model, memGB: Math.round(require('os').totalmem() / 1073741824) };
    await fsp.writeFile(path.join(dir, 'latest.json'), JSON.stringify(o, null, 1), 'utf8');
    for (const box of dropboxDirs()) {                     // and a copy where whoever is helping can read it without being sent anything
      const dd = path.join(box, 'Mall Call', '_diagnostics');
      try { await fsp.mkdir(dd, { recursive: true }); await fsp.writeFile(path.join(dd, 'latest.json'), JSON.stringify(o, null, 1), 'utf8'); } catch (e) {}
    }
    const log = path.join(dir, 'history.log'), line = [o.at, 'build ' + o.build, o.frameMs + ' ms', o.preview, o.playing ? 'playing' : 'paused', (o.errors || []).length + ' errors'].join('  ') + '\n';
    const st = await fsp.stat(log).catch(() => null);
    if (st && st.size > 400000) await fsp.writeFile(log, line, 'utf8'); else await fsp.appendFile(log, line, 'utf8');
    return true;
  } catch (e) { return false; }
});
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
    try { const j = JSON.parse(await fsp.readFile(path.join(dir, 'versions', String(n).padStart(4, '0') + '.json'), 'utf8')); out.push({ n, at: j.savedAt || '', note: String(j.note || ''), by: String(j.by || '').slice(0, 40) }); } catch (e) {}
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
    const src = String(pj.soundPath); let dst = path.join(dir, 'assets', safeName(path.basename(src)) || 'sound');
    try {
      const a = await fsp.stat(src);
      let b = await fsp.stat(dst).catch(() => null);
      if (b && b.size !== a.size) {                         // another sound under the same name: older versions keep theirs, this one gets its own copy
        const ext = path.extname(dst);
        dst = dst.slice(0, dst.length - ext.length) + '-' + a.size.toString(36) + ext;
        b = await fsp.stat(dst).catch(() => null);
      }
      if (!b || b.size !== a.size) await fsp.copyFile(src, dst);
      pj.soundAsset = path.basename(dst);
    } catch (e) { return { error: 'sound' }; }
  }
  delete pj.soundPath;
  const v = await libVersions(dir);
  let n = (v.length ? v[v.length - 1] : 0) + 1;
  for (let tries = 0; ; tries++, n++) {                   // never over a version that is already there, even one that arrived a moment ago
    try { await fsp.writeFile(path.join(dir, 'versions', String(n).padStart(4, '0') + '.json'), JSON.stringify(pj), { encoding: 'utf8', flag: 'wx' }); break; }
    catch (e) { if (e.code !== 'EEXIST' || tries > 50) return { error: 'write' }; }
  }
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
let saveN = 0;
ipcMain.handle('autosave', async (event, json) => {
  await fsp.mkdir(path.dirname(autosaveFile()), { recursive: true });
  const tmp = autosaveFile() + '.' + (++saveN) + '.tmp';      // written beside and swapped in, so a crash never leaves half a session
  await fsp.writeFile(tmp, String(json), 'utf8');
  await fsp.rename(tmp, autosaveFile());
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
  // the page may use sound inputs and choose sound outputs (timecode in and out, music out); nothing else is granted
  const OK = ['media', 'audioCapture', 'speaker-selection'];
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, d) => cb(OK.includes(perm) && !(perm === 'media' && d && d.mediaTypes && d.mediaTypes.includes('video'))));      // sound only, never the camera
  session.defaultSession.setPermissionCheckHandler((wc, perm) => OK.includes(perm));
  let first = null;
  if (!SMOKE) {
    await update.load();
    first = checkUpdates(false);
    await Promise.race([first, new Promise(r => setTimeout(r, 2500))]);      // offline or slow: open with what we have
    if (update.takeFresh()) updateWaiting = false;
  }
  buildMenu(); createWindow();
  // an update that arrived after the window opened, or that the page has not taken yet, is offered again
  if (first) first.then(() => setTimeout(() => { if (updateWaiting) send('update-ready'); }, 8000));
  if (!SMOKE) setInterval(() => { if (update.state().channel === 'off') return; if (updateWaiting) send('update-ready'); else checkUpdates('ask', true); }, 180000);
  if (process.env.MALLCALL_EXPORT_TEST) win.webContents.once('did-finish-load', async () => {      // e.g. MALLCALL_EXPORT_TEST=prores or hap:3d, with MALLCALL_FF_OUT=/path/out.mov
    const [fmt, view] = process.env.MALLCALL_EXPORT_TEST.split(':');
    await new Promise(r => setTimeout(r, 1500));
    let res; try { res = await win.webContents.executeJavaScript('window.__exportTest(' + JSON.stringify(fmt) + ',' + JSON.stringify(view || '') + ')'); } catch (e) { res = { failed: String(e) }; }
    console.log('EXPORT ' + JSON.stringify(res)); app.exit(0);
  });
  if (process.env.MALLCALL_UPDATE_PROBE) win.webContents.once('did-finish-load', () => setTimeout(() => { console.log('PROBE ' + JSON.stringify({ url: win.webContents.getURL(), status: update.status(), state: update.state() })); app.exit(0); }, 600));
});
app.on('window-all-closed', () => app.quit());

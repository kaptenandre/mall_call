// Mall Call: main process. One window, native menus, project files, autosave and file export.
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

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
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  setTitle();
}

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

app.whenReady().then(() => { buildMenu(); createWindow(); });
app.on('window-all-closed', () => app.quit());

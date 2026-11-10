// Bridge between the page and the Mac app. The page checks for window.nativeApp and falls back to browser behaviour without it.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('nativeApp', {
  saveFile: (name, data) => ipcRenderer.invoke('save-file', name, data),
  pickFile: kind => ipcRenderer.invoke('pick-file', kind),
  readFile: filePath => ipcRenderer.invoke('read-file', filePath),
  pathFor: file => { try { return webUtils.getPathForFile(file) || ''; } catch (e) { return ''; } },
  projectSave: (json, saveAs) => ipcRenderer.invoke('project-save', json, saveAs),
  projectOpen: () => ipcRenderer.invoke('project-open'),
  pageOk: build => ipcRenderer.send('page-ok', build),
  autosave: json => ipcRenderer.invoke('autosave', json),
  autosaveLoad: () => ipcRenderer.invoke('autosave-load'),
  outputDisplays: () => ipcRenderer.invoke('output-displays'),
  outputPlace: where => ipcRenderer.invoke('output-place', where),
  reloadUpdate: () => ipcRenderer.invoke('reload-update'),
  libRoot: () => ipcRenderer.invoke('lib-root'),
  libPickRoot: () => ipcRenderer.invoke('lib-pick-root'),
  libList: () => ipcRenderer.invoke('lib-list'),
  libVersions: name => ipcRenderer.invoke('lib-versions', name),
  libSave: o => ipcRenderer.invoke('lib-save', o),
  libOpen: o => ipcRenderer.invoke('lib-open', o),
  libReveal: name => ipcRenderer.invoke('lib-reveal', name),
  metrics: () => ipcRenderer.invoke('metrics'),
  diagWrite: json => ipcRenderer.invoke('diag-write', json),
  micAccess: () => ipcRenderer.invoke('mic-access'),
  ffCheck: () => ipcRenderer.invoke('ff-check'),
  ffStart: o => ipcRenderer.invoke('ff-start', o),
  ffFrame: data => ipcRenderer.invoke('ff-frame', data),
  ffEnd: abort => ipcRenderer.invoke('ff-end', abort),
  onMenu: fn => { ipcRenderer.on('menu', (event, cmd) => fn(cmd)); }
});

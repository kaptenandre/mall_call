// Bridge between the page and the Mac app. The page checks for window.nativeApp and falls back to browser behaviour without it.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('nativeApp', {
  saveFile: (name, data) => ipcRenderer.invoke('save-file', name, data),
  pickFile: kind => ipcRenderer.invoke('pick-file', kind),
  readFile: filePath => ipcRenderer.invoke('read-file', filePath),
  pathFor: file => { try { return webUtils.getPathForFile(file) || ''; } catch (e) { return ''; } },
  projectSave: (json, saveAs) => ipcRenderer.invoke('project-save', json, saveAs),
  projectOpen: () => ipcRenderer.invoke('project-open'),
  autosave: json => ipcRenderer.invoke('autosave', json),
  autosaveLoad: () => ipcRenderer.invoke('autosave-load'),
  outputDisplays: () => ipcRenderer.invoke('output-displays'),
  outputPlace: where => ipcRenderer.invoke('output-place', where),
  onMenu: fn => { ipcRenderer.on('menu', (event, cmd) => fn(cmd)); }
});

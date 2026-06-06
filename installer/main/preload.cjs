// contextBridge — exposes the installer IPC surface to the renderer.
// Mirrors the API shape consumed by `installer/ui/src/lib/ipc.js`.

const { contextBridge, ipcRenderer } = require('electron');

let progressCb = null;
let doneCb = null;
let errorCb = null;

ipcRenderer.on('installer:progress', (_evt, payload) => {
  if (progressCb) progressCb(payload);
});
ipcRenderer.on('installer:done', (_evt, payload) => {
  if (doneCb) doneCb(payload);
});
ipcRenderer.on('installer:error', (_evt, payload) => {
  if (errorCb) errorCb(payload);
});

contextBridge.exposeInMainWorld('installerAPI', {
  /* metadata */
  argv: () => ipcRenderer.sendSync('installer:argv') || [],
  defaults: () => ipcRenderer.sendSync('installer:defaults') || {},

  /* dialogs / inspection */
  pickDir: (initial) => ipcRenderer.invoke('installer:pickDir', initial),
  getDiskSpace: (p) => ipcRenderer.invoke('installer:getDiskSpace', p),
  runPrereqScan: (opts) => ipcRenderer.invoke('installer:runPrereqScan', opts),
  detectExistingInstall: () => ipcRenderer.invoke('installer:detectExistingInstall'),
  loadLicense: () => ipcRenderer.invoke('installer:loadLicense'),

  /* actions */
  killSuwayomi: () => ipcRenderer.invoke('installer:killSuwayomi'),
  startInstall: (opts) => ipcRenderer.invoke('installer:startInstall', opts),
  cancelInstall: () => ipcRenderer.invoke('installer:cancelInstall'),
  startUninstall: (opts) => ipcRenderer.invoke('installer:startUninstall', opts),

  /* finish hooks */
  launchApp: (opts) => ipcRenderer.invoke('installer:launchApp', opts),
  startInitialScan: (opts) => ipcRenderer.invoke('installer:startInitialScan', opts),
  openReadme: () => ipcRenderer.invoke('installer:openReadme'),

  /* window controls */
  minimize: () => ipcRenderer.send('installer:minimize'),
  quit: () => ipcRenderer.send('installer:quit'),

  /* event subscriptions — return an unsubscribe fn */
  onProgress: (cb) => {
    progressCb = cb;
    return () => {
      if (progressCb === cb) progressCb = null;
    };
  },
  onDone: (cb) => {
    doneCb = cb;
    return () => {
      if (doneCb === cb) doneCb = null;
    };
  },
  onError: (cb) => {
    errorCb = cb;
    return () => {
      if (errorCb === cb) errorCb = null;
    };
  },
});

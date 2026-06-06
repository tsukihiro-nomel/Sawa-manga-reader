// Thin wrapper around window.installerAPI (set up by preload.cjs via
// contextBridge). All IPC calls return Promises and are designed to be safe
// to call from a browser dev environment too — every method falls back to a
// reasonable mock that lets the UI render and the wizard be navigated.

const isElectron =
  typeof window !== 'undefined' && !!window.installerAPI;

const fakeOpts = {
  installPath: 'C:\\Users\\Ada\\AppData\\Local\\Programs\\Sawa Manga Library',
  userInstallPath: 'C:\\Users\\Ada\\AppData\\Local\\Programs\\Sawa Manga Library',
  machineInstallPath: 'C:\\Program Files\\Sawa Manga Library',
  libraryPath: 'D:\\Manga',
  diskFreeGB: 286.4,
  prereq: {
    os: { ok: true, label: 'Windows 10 build 19045 (x64)' },
    admin: { ok: true, label: 'Privilèges administrateur accordés' },
    disk: {
      ok: true,
      label: 'Espace disque — 1.82 Go requis · 286 Go libres',
    },
    java: {
      ok: 'warn',
      label: 'Java 21 non détecté — runtime bundled sera utilisé',
    },
    proc: { ok: true, label: 'Aucun process Suwayomi/Sawa en cours', pids: [] },
    prev: { ok: true, label: 'Aucune installation précédente détectée' },
  },
};

function callOrFallback(method, args, fallback) {
  if (isElectron && typeof window.installerAPI[method] === 'function') {
    try {
      return Promise.resolve(window.installerAPI[method](...args));
    } catch (err) {
      console.warn('installerAPI.' + method + ' threw:', err);
      return Promise.resolve(fallback);
    }
  }
  return Promise.resolve(fallback);
}

export const installerAPI = {
  isElectron,

  /* ---------- inspection ---------- */
  async pickDir(initial) {
    return callOrFallback('pickDir', [initial], initial);
  },
  async getDiskSpace(p) {
    return callOrFallback('getDiskSpace', [p], {
      free: fakeOpts.diskFreeGB,
      required: 1.82,
    });
  },
  async runPrereqScan() {
    return callOrFallback('runPrereqScan', [], fakeOpts.prereq);
  },
  async detectExistingInstall() {
    return callOrFallback('detectExistingInstall', [], null);
  },
  async loadLicense() {
    return callOrFallback('loadLicense', [], '');
  },

  /* ---------- actions ---------- */
  async killSuwayomi() {
    return callOrFallback('killSuwayomi', [], { killed: 0 });
  },
  async startInstall(opts) {
    return callOrFallback('startInstall', [opts], { started: false });
  },
  async cancelInstall() {
    return callOrFallback('cancelInstall', [], { ok: true });
  },
  async startUninstall(opts) {
    return callOrFallback('startUninstall', [opts], { started: false });
  },

  /* ---------- finish actions ---------- */
  async launchApp(opts) {
    return callOrFallback('launchApp', [opts], { launched: false });
  },
  async startInitialScan(opts) {
    return callOrFallback('startInitialScan', [opts], { ok: false });
  },
  async openReadme() {
    return callOrFallback('openReadme', [], { ok: false });
  },

  /* ---------- runtime ---------- */
  argv() {
    return (isElectron && window.installerAPI.argv && window.installerAPI.argv()) || [];
  },
  defaults() {
    return (isElectron && window.installerAPI.defaults && window.installerAPI.defaults()) || {
      installPath: fakeOpts.installPath,
      userInstallPath: fakeOpts.userInstallPath,
      machineInstallPath: fakeOpts.machineInstallPath,
      libraryPath: fakeOpts.libraryPath,
      scope: 'currentUser',
      runId: 'dev-' + Date.now().toString(16),
    };
  },

  minimize() {
    if (isElectron && window.installerAPI.minimize) window.installerAPI.minimize();
  },
  quit() {
    if (isElectron && window.installerAPI.quit) {
      window.installerAPI.quit();
    } else if (typeof window !== 'undefined' && window.close) {
      window.close();
    }
  },

  /* ---------- streaming events ---------- */
  // returns an unsubscribe fn
  onProgress(cb) {
    if (isElectron && window.installerAPI.onProgress)
      return window.installerAPI.onProgress(cb);
    return () => {};
  },
  onDone(cb) {
    if (isElectron && window.installerAPI.onDone)
      return window.installerAPI.onDone(cb);
    return () => {};
  },
  onError(cb) {
    if (isElectron && window.installerAPI.onError)
      return window.installerAPI.onError(cb);
    return () => {};
  },
};

export default installerAPI;

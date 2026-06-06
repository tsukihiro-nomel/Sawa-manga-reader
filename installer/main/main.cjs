// Electron main process for the Sawa installer wizard.

const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');

const suwayomiKill = require('./suwayomiKill.cjs');
const processGuard = require('./processGuard.cjs');
const { runPrereqScan } = require('./prereqScan.cjs');
const { getDiskSpace } = require('./diskSpace.cjs');
const nsisRunner = require('./nsisRunner.cjs');
const uninstallStage = require('./uninstall.cjs');
const {
  normalizeInstallOptions,
  resolveInstalledAppExe,
} = require('./installOptions.cjs');

const RUN_ID =
  Date.now().toString(16) + '-' + Math.random().toString(16).slice(2, 6);

let mainWindow = null;
let runningChild = null;
let runningScope = 'currentUser';

function progressTimestamp() {
  const d = new Date();
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${m}:${s}`;
}

function isUninstallMode() {
  return process.argv.includes('--uninstall');
}

function isStage2() {
  return process.argv.includes('--stage2');
}

function resolveBackend() {
  const candidates = [
    process.resourcesPath
      ? path.join(process.resourcesPath, 'backend', 'installer-backend.exe')
      : null,
    path.join(app.getAppPath(), '..', 'backend', 'installer-backend.exe'),
    path.join(app.getAppPath(), 'release', 'installer-backend.exe'),
    path.join(__dirname, '..', '..', 'release', 'installer-backend.exe'),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

function resolveLicense() {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'LICENSE.txt') : null,
    path.join(app.getAppPath(), 'build', 'LICENSE.txt'),
    path.join(__dirname, '..', '..', 'build', 'LICENSE.txt'),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p));
}

function getDefaults() {
  const currentUser = normalizeInstallOptions({ scope: 'currentUser', runId: RUN_ID });
  const allUsers = normalizeInstallOptions({ scope: 'allUsers', runId: RUN_ID });
  return {
    scope: 'currentUser',
    installPath: currentUser.installPath,
    userInstallPath: currentUser.installPath,
    machineInstallPath: allUsers.installPath,
    libraryPath: currentUser.libraryPath,
    runId: RUN_ID,
  };
}

function resolveUiBundlePath() {
  if (app.isPackaged) return path.dirname(process.execPath);
  return path.join(__dirname, '..');
}

function buildLogPath(runId) {
  return path.join(app.getPath('temp'), `sawa-setup-${runId || RUN_ID}.log`);
}

function writeInitialScanMarker(libraryPath) {
  try {
    const normalizedLibraryPath = String(libraryPath || '').trim();
    if (!normalizedLibraryPath) return { ok: false, error: 'missing-library-path' };
    const appdata =
      process.env.APPDATA ||
      path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
    const dir = path.join(appdata, 'sawa-manga-library');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'first-run-scan.json'),
      JSON.stringify({ requested: true, libraryPath: normalizedLibraryPath, ts: Date.now() }, null, 2),
      'utf8'
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 640,
    height: 480,
    useContentSize: true,
    resizable: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: true,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0e15',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  const devUrl = process.env.SAWA_INSTALLER_DEV_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist-ui', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
}

ipcMain.on('installer:argv', (e) => {
  e.returnValue = process.argv.slice();
});

ipcMain.on('installer:defaults', (e) => {
  e.returnValue = getDefaults();
});

ipcMain.handle('installer:pickDir', async (_e, initial) => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Choisir un dossier',
    defaultPath: initial,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return r.filePaths[0];
});

ipcMain.handle('installer:getDiskSpace', (_e, p) => getDiskSpace(p));
ipcMain.handle('installer:runPrereqScan', (_e, opts) => runPrereqScan(opts));
ipcMain.handle('installer:loadLicense', () => {
  const lp = resolveLicense();
  if (!lp) return '';
  try {
    return fs.readFileSync(lp, 'utf8');
  } catch (_err) {
    return '';
  }
});

ipcMain.handle('installer:detectExistingInstall', () => {
  for (const hive of ['HKCU', 'HKLM']) {
    const out = spawnSync(
      'reg',
      [
        'query',
        `${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\SawaMangaLibrary`,
        '/v',
        'DisplayVersion',
      ],
      { windowsHide: true, encoding: 'utf8', timeout: 4000 }
    );
    if (out.status === 0 && out.stdout) {
      const match = out.stdout.match(/DisplayVersion\s+REG_SZ\s+(\S+)/);
      if (match) return { version: match[1], hive };
    }
  }
  return null;
});

ipcMain.handle('installer:killSuwayomi', () => {
  const killed = suwayomiKill.kill();
  return { killed: killed.length, pids: killed };
});

ipcMain.handle('installer:startInstall', async (_e, opts = {}) => {
  const backendPath = resolveBackend();
  const normalized = normalizeInstallOptions({
    ...opts,
    backendPath,
    runId: opts.runId || RUN_ID,
    logPath: opts.logPath || buildLogPath(opts.runId || RUN_ID),
    uiBundlePath: opts.uiBundlePath || resolveUiBundlePath(),
    mode: 'install',
  });
  runningScope = normalized.scope;

  const handlers = {
    onProgress: (evt) =>
      mainWindow && mainWindow.webContents.send('installer:progress', evt),
    onDone: (res) => {
      runningChild = null;
      runningScope = 'currentUser';
      mainWindow && mainWindow.webContents.send('installer:done', res);
    },
    onError: (err) => {
      runningChild = null;
      runningScope = 'currentUser';
      mainWindow && mainWindow.webContents.send('installer:error', err);
    },
  };

  // Free locked install files before the silent backend runs. A running Sawa
  // instance keeps resources\app.asar open, which makes the backend's
  // "uninstall old version" step fail (code 2) and pop native NSIS dialogs over
  // our window. Terminating it first keeps the install silent and reliable.
  try {
    handlers.onProgress({
      t: progressTimestamp(),
      c: 'em',
      m: 'Fermeture des instances Sawa actives…',
      task: 'Préparation du système',
    });
    const guard = await processGuard.terminateRunningApp();
    const runtimeCount = guard.runtimePids ? guard.runtimePids.length : 0;
    handlers.onProgress({
      t: progressTimestamp(),
      c: guard.app.killed || runtimeCount > 0 ? 'ok' : 'mute',
      m:
        guard.app.killed || runtimeCount > 0
          ? `Instance Sawa fermée (app: ${guard.app.killed ? 'oui' : 'non'}, runtime: ${runtimeCount})`
          : 'Aucune instance Sawa active à fermer',
    });
  } catch (err) {
    handlers.onProgress({
      t: progressTimestamp(),
      c: 'warn',
      m: `Pré-nettoyage incomplet : ${err.message}`,
    });
  }

  const result = await nsisRunner.start(
    {
      ...normalized,
      backendPath,
    },
    handlers
  );
  if (result.child) runningChild = result.child;
  return {
    started: !!result.started,
    logPath: result.logPath || normalized.logPath,
    elevated: normalized.elevate,
  };
});

ipcMain.handle('installer:cancelInstall', () => {
  if (runningChild) {
    try {
      runningChild.kill('SIGTERM');
    } catch (_err) {
      /* ignore */
    }
    runningChild = null;
    runningScope = 'currentUser';
    return { ok: true };
  }
  if (runningScope === 'allUsers') {
    return {
      ok: false,
      unavailable: true,
      message: "Annulation indisponible pendant l'elevation administrateur.",
    };
  }
  return { ok: true };
});

ipcMain.handle('installer:startUninstall', async (_e, opts = {}) => {
  if (!isStage2()) {
    const installDir =
      uninstallStage.parseArg(process.argv, 'origin') ||
      path.dirname(path.dirname(process.execPath));
    const scope = uninstallStage.parseArg(process.argv, 'scope', 'currentUser');
    uninstallStage.relaunchFromTemp(process.execPath, installDir, { ...opts, scope });
    setTimeout(() => app.quit(), 200);
    return { started: true, stage: 1 };
  }

  const handlers = {
    onProgress: (evt) =>
      mainWindow && mainWindow.webContents.send('installer:progress', evt),
    onDone: (res) =>
      mainWindow && mainWindow.webContents.send('installer:done', res),
    onError: (err) =>
      mainWindow && mainWindow.webContents.send('installer:error', err),
  };
  uninstallStage.runStage2(process.argv, handlers).catch((err) =>
    handlers.onError({ kind: 'stage2', message: err.message })
  );
  return { started: true, stage: 2 };
});

ipcMain.handle('installer:launchApp', (_e, opts = {}) => {
  const installPath = opts.installPath || getDefaults().installPath;
  const exePath = resolveInstalledAppExe(installPath);
  if (opts.initialScan && opts.libraryPath) {
    writeInitialScanMarker(opts.libraryPath);
  }
  if (!fs.existsSync(exePath)) return { launched: false, exePath };

  const args = [];
  if (opts.initialScan && opts.libraryPath) {
    args.push(`--sawa-first-run-scan=${opts.libraryPath}`);
  }
  const child = spawn(exePath, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
  return { launched: true, exePath };
});

ipcMain.handle('installer:startInitialScan', (_e, opts = {}) => {
  return writeInitialScanMarker(opts.libraryPath || getDefaults().libraryPath);
});

ipcMain.handle('installer:openReadme', () => {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'README.md') : null,
    path.join(app.getAppPath(), 'README.md'),
    path.join(__dirname, '..', '..', 'README.md'),
  ].filter(Boolean);
  const readme = candidates.find((p) => fs.existsSync(p));
  if (readme) {
    shell.openPath(readme);
    return { ok: true };
  }
  return { ok: false };
});

ipcMain.on('installer:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('installer:quit', () => {
  app.quit();
});

app.whenReady().then(() => {
  if (isUninstallMode()) {
    // Same UI shell, different renderer route selected from argv.
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

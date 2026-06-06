// Self-deletion stage 2 logic for the shared install/uninstall binary.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const { runElevated } = require('./elevate.cjs');
const { assertSafeInstallOrigin } = require('./installOptions.cjs');
const processGuard = require('./processGuard.cjs');

function parseArg(argv, name, fallback) {
  const prefix = `--${name}=`;
  const found = argv.find((a) => a.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

function hasFlag(argv, flag) {
  return argv.includes(`--${flag}`);
}

function parseScope(value) {
  return value === 'allUsers' ? 'allUsers' : 'currentUser';
}

function boolArg(value, fallback) {
  if (value === undefined || value === null) return fallback;
  return value === true || value === '1' || value === 1 || value === 'true';
}

function winJoin(...parts) {
  return path.win32.normalize(path.win32.join(...parts));
}

function resolveUninstallBackend(env = {}) {
  const resourcesPath = env.resourcesPath || process.resourcesPath;
  const execPath = env.execPath || process.execPath;
  const candidates = [
    resourcesPath ? winJoin(resourcesPath, 'backend', 'installer-backend.exe') : null,
    execPath ? winJoin(path.win32.dirname(execPath), 'resources', 'backend', 'installer-backend.exe') : null,
    execPath ? winJoin(path.win32.dirname(execPath), 'backend', 'installer-backend.exe') : null,
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function buildUninstallCleanupPlan({
  origin,
  sawaData,
  keepData = true,
  keepLib = true,
  keepRuntime = false,
} = {}) {
  assertSafeInstallOrigin(origin);
  const dataRoot = path.win32.normalize(
    sawaData ||
      path.win32.join(
        process.env.APPDATA || path.win32.join(os.homedir(), 'AppData', 'Roaming'),
        'sawa-manga-library'
      )
  );
  const remove = [];

  if (!keepData) remove.push(winJoin(dataRoot, 'user-data'));
  if (!keepRuntime) {
    remove.push(winJoin(dataRoot, 'derived'));
    remove.push(winJoin(dataRoot, 'cache'));
    remove.push(winJoin(dataRoot, 'derived-cache'));
    remove.push(winJoin(dataRoot, 'source-runtime'));
  }
  if (!keepLib) remove.push(winJoin(dataRoot, 'library'));

  remove.push(path.win32.normalize(origin));
  return { remove };
}

function copyRecursive(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const sp = path.join(src, entry.name);
    const dp = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(sp, dp);
    } else if (entry.isSymbolicLink()) {
      try {
        fs.symlinkSync(fs.readlinkSync(sp), dp);
      } catch (_err) {
        fs.copyFileSync(sp, dp);
      }
    } else {
      fs.copyFileSync(sp, dp);
    }
  }
}

function rmrf(target) {
  if (!target || !fs.existsSync(target)) return;
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (err) {
    console.warn('[uninstall] rmrf failed:', target, err.message);
  }
}

function relaunchFromTemp(currentExe, originInstallDir, opts = {}) {
  assertSafeInstallOrigin(originInstallDir);
  const scope = parseScope(opts.scope);
  const stamp = Date.now().toString(16) + Math.random().toString(16).slice(2, 6);
  const stageDir = path.join(os.tmpdir(), `sawa-uninst-${stamp}`);
  const sourceDir = path.dirname(currentExe);

  copyRecursive(sourceDir, stageDir);

  const stageExe = path.join(stageDir, path.basename(currentExe));
  const args = [
    '--uninstall',
    '--stage2',
    `--origin=${originInstallDir}`,
    `--scope=${scope}`,
    `--keepData=${opts.keepData ? '1' : '0'}`,
    `--keepLib=${opts.keepLib ? '1' : '0'}`,
    `--keepRuntime=${opts.keepRuntime ? '1' : '0'}`,
  ];

  if (scope === 'allUsers') {
    runElevated(stageExe, args, { name: 'Sawa Manga Library Uninstall' }).catch((err) => {
      console.warn('[uninstall] elevated stage2 failed:', err.message);
    });
    return { stageExe, args, elevated: true };
  }

  const child = spawn(stageExe, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
  return { stageExe, args, elevated: false };
}

async function runStage2(argv, ipc) {
  const origin = parseArg(argv, 'origin');
  const scope = parseScope(parseArg(argv, 'scope', 'currentUser'));
  const keepData = boolArg(parseArg(argv, 'keepData'), true);
  const keepLib = boolArg(parseArg(argv, 'keepLib'), true);
  const keepRuntime = boolArg(parseArg(argv, 'keepRuntime'), false);
  assertSafeInstallOrigin(origin);

  function emit(progress, task, message, kind = '') {
    ipc.onProgress &&
      ipc.onProgress({
        t: new Date().toISOString().slice(11, 19),
        p: progress,
        task,
        m: message,
        c: kind,
      });
  }

  emit(5, 'Process Sawa', 'Arret des processus en cours');
  try {
    // Terminate the running app (it locks app.asar) AND the owned runtime so
    // the backend uninstaller can delete the install dir without tripping
    // "file in use" dialogs.
    const guard = await processGuard.terminateRunningApp();
    const runtimeCount = guard.runtimePids ? guard.runtimePids.length : 0;
    emit(
      12,
      'Process Sawa',
      `App ${guard.app.killed ? 'fermee' : 'inactive'}, ${runtimeCount} runtime termine(s)`
    );
  } catch (err) {
    emit(12, 'Process Sawa', `Avertissement: ${err.message}`, 'warn');
  }

  const backend = resolveUninstallBackend();
  if (backend && fs.existsSync(backend)) {
    emit(20, 'Fichiers', 'Desinstallation des binaires...');
    const r = spawnSync(backend, ['/S', '/uninstall', scope === 'allUsers' ? '/allusers' : '/currentuser'], {
      windowsHide: true,
      timeout: 120000,
    });
    if (r.status !== 0) {
      emit(40, 'Fichiers', `Backend code ${r.status}`, 'warn');
    } else {
      emit(50, 'Fichiers', 'Backend NSIS termine');
    }
  } else {
    emit(40, 'Fichiers', 'Backend non trouve - suppression directe', 'warn');
  }

  const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const sawaData = path.join(appdata, 'sawa-manga-library');
  const plan = buildUninstallCleanupPlan({ origin, sawaData, keepData, keepLib, keepRuntime });

  emit(70, 'Donnees', 'Nettoyage des donnees selectionnees');
  for (const target of plan.remove) {
    rmrf(target);
  }

  emit(100, 'Termine', 'Sawa desinstalle avec succes', 'ok');
  ipc.onDone && ipc.onDone({ ok: true });
}

module.exports = {
  buildUninstallCleanupPlan,
  hasFlag,
  parseArg,
  relaunchFromTemp,
  resolveUninstallBackend,
  runStage2,
};

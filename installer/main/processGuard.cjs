// Pre-flight process termination for install/uninstall.
//
// A running Sawa instance keeps `resources\app.asar` (and its GPU/renderer/
// utility children) open. While those handles are held, the silent NSIS
// backend cannot uninstall the previous version — its "uninstall old version"
// step exits with code 2 and electron-builder pops native dialogs
// ("Échec de désinstallation des anciens fichiers…", "le fichier est ouvert
// par un autre processus") ON TOP of our frameless wizard window.
//
// suwayomiKill only targets the owned Java/Suwayomi runtime. This module also
// terminates the Electron app itself (by image name) so the install dir is
// unlocked before the backend touches it. The installer UI (installer-ui.exe)
// and the backend (installer-backend.exe) have different image names, so they
// are never caught by this kill.

const { spawnSync } = require('child_process');
const suwayomiKill = require('./suwayomiKill.cjs');

const APP_IMAGE = 'Sawa Manga Library.exe';

function defaultDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// taskkill exit codes we treat as success/no-op:
//   0   -> at least one process terminated
//   128 -> no running process with that image name (nothing to do)
function killByImage(image, runner = spawnSync) {
  if (process.platform !== 'win32') {
    return { image, killed: false, status: null, notFound: true };
  }
  try {
    const result = runner('taskkill', ['/IM', image, '/T', '/F'], {
      windowsHide: true,
      timeout: 8000,
      encoding: 'utf8',
    });
    const status = result ? result.status : null;
    return {
      image,
      killed: status === 0,
      notFound: status === 128,
      status,
    };
  } catch (err) {
    return { image, killed: false, status: null, error: err.message };
  }
}

/**
 * Terminate a running Sawa app instance and its Suwayomi runtime, then wait a
 * short settle window so Windows releases the file handles before the backend
 * runs. Dependencies are injectable for tests.
 *
 *   deps.runner       -> spawnSync replacement (for killByImage)
 *   deps.killRuntime  -> suwayomiKill.kill replacement
 *   deps.delay        -> async sleep replacement
 *   opts.settleMs     -> handle-release grace period (default 700ms)
 */
async function terminateRunningApp(opts = {}, deps = {}) {
  const runner = deps.runner || spawnSync;
  const killRuntime = deps.killRuntime || suwayomiKill.kill;
  const delay = deps.delay || defaultDelay;
  const settleMs = typeof opts.settleMs === 'number' ? opts.settleMs : 700;

  // 1. The Electron app holds app.asar; /T also takes down its child processes.
  const app = killByImage(APP_IMAGE, runner);

  // 2. The owned Java/Suwayomi runtime (ownership scan keeps us from touching
  //    an unrelated java.exe).
  let runtimePids = [];
  try {
    runtimePids = killRuntime() || [];
  } catch (_err) {
    runtimePids = [];
  }

  // 3. Give the OS a moment to release locks before NSIS proceeds.
  if (app.killed || runtimePids.length > 0) {
    await delay(settleMs);
  }

  return { app, runtimePids };
}

module.exports = { terminateRunningApp, killByImage, APP_IMAGE };

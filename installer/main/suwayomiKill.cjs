// Wrapper around the existing Suwayomi runtime service. Lets the installer
// reuse the production logic for finding/killing owned Java + Sawa processes
// without duplicating the PowerShell scan.
//
// Resolution order:
//   1. packaged: <resourcesPath>/services/suwayomiRuntime.cjs (copied via extraResources)
//   2. dev:      <repo>/electron/services/suwayomiRuntime.cjs (relative to this file)

const path = require('node:path');
const fs = require('node:fs');

let runtime = null;

const candidates = [
  process.resourcesPath
    ? path.join(process.resourcesPath, 'services', 'suwayomiRuntime.cjs')
    : null,
  path.join(__dirname, '..', '..', 'electron', 'services', 'suwayomiRuntime.cjs'),
].filter(Boolean);

for (const candidate of candidates) {
  try {
    if (fs.existsSync(candidate)) {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      runtime = require(candidate);
      break;
    }
  } catch (err) {
    console.warn('[suwayomiKill] require failed at', candidate, '-', err.message);
  }
}

if (!runtime) {
  console.warn('[suwayomiKill] runtime service unavailable in any known location');
}

function listProcesses() {
  if (!runtime || typeof runtime.terminateOwnedRuntimeProcesses !== 'function') {
    return [];
  }
  try {
    return runtime.terminateOwnedRuntimeProcesses({ dryRun: true }) || [];
  } catch (err) {
    console.warn('[suwayomiKill] dryRun failed:', err.message);
    return [];
  }
}

function kill() {
  if (!runtime || typeof runtime.terminateOwnedRuntimeProcesses !== 'function') {
    return [];
  }
  try {
    return runtime.terminateOwnedRuntimeProcesses() || [];
  } catch (err) {
    console.warn('[suwayomiKill] terminate failed:', err.message);
    return [];
  }
}

module.exports = { listProcesses, kill };

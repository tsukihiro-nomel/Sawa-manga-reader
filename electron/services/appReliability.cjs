const fs = require('fs');
const path = require('path');

const SHUTDOWN_MARKER_FILE = 'last-shutdown-diagnostic.json';
const LAST_VALID_SNAPSHOT_FILE = 'last-valid-state.json';

function getDiagnosticDir(userDataPath) {
  const directory = path.join(path.resolve(userDataPath), 'diagnostics');
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function atomicWriteJson(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function writeLastValidSnapshot(userDataPath, state) {
  const filePath = path.join(getDiagnosticDir(userDataPath), LAST_VALID_SNAPSHOT_FILE);
  atomicWriteJson(filePath, state);
  return filePath;
}

function readLastValidSnapshot(userDataPath) {
  const filePath = path.join(getDiagnosticDir(userDataPath), LAST_VALID_SNAPSHOT_FILE);
  try {
    const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
    return { state, path: filePath };
  } catch (_error) {
    return null;
  }
}

function writeShutdownMarker(userDataPath, result = {}) {
  const filePath = path.join(getDiagnosticDir(userDataPath), SHUTDOWN_MARKER_FILE);
  atomicWriteJson(filePath, {
    version: 1,
    recordedAt: new Date().toISOString(),
    ok: false,
    timedOut: Boolean(result.timedOut),
    stateFlushed: Boolean(result.stateFlushed),
    sourcesFlushed: Boolean(result.sourcesFlushed),
    error: result.error ? String(result.error).slice(0, 500) : null
  });
  return filePath;
}

function readShutdownMarker(userDataPath) {
  const filePath = path.join(getDiagnosticDir(userDataPath), SHUTDOWN_MARKER_FILE);
  try {
    const marker = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { ...marker, path: filePath };
  } catch (_error) {
    return null;
  }
}

function clearShutdownMarker(userDataPath) {
  const filePath = path.join(getDiagnosticDir(userDataPath), SHUTDOWN_MARKER_FILE);
  try { fs.rmSync(filePath, { force: true }); } catch (_error) {}
}

async function flushWithDeadline(options = {}) {
  const timeoutMs = Math.max(100, Math.min(2000, Number(options.timeoutMs) || 2000));
  let timeoutId;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve({ ok: false, timedOut: true }), timeoutMs);
  });
  try {
    const flushing = Promise.allSettled([
      Promise.resolve().then(() => options.flushState?.()),
      Promise.resolve().then(() => options.flushSources?.())
    ]).then(([stateResult, sourcesResult]) => {
      const stateFlushed = stateResult.status === 'fulfilled' && stateResult.value === true;
      const sourcesFlushed = sourcesResult.status === 'fulfilled' && sourcesResult.value === true;
      return {
        ok: stateFlushed && sourcesFlushed,
        timedOut: false,
        stateFlushed,
        sourcesFlushed,
        error: [stateResult, sourcesResult]
          .filter((result) => result.status === 'rejected')
          .map((result) => result.reason?.message || String(result.reason))
          .join('; ') || null
      };
    });
    return await Promise.race([flushing, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  clearShutdownMarker,
  flushWithDeadline,
  getDiagnosticDir,
  readLastValidSnapshot,
  readShutdownMarker,
  writeLastValidSnapshot,
  writeShutdownMarker
};

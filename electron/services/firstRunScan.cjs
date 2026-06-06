const fs = require('fs');
const path = require('path');

const MARKER_NAME = 'first-run-scan.json';

function markerPath(userDataPath) {
  return path.join(userDataPath, MARKER_NAME);
}

function normalizeComparablePath(value) {
  try {
    return path.resolve(String(value || '')).replace(/[\\/]+$/, '').toLowerCase();
  } catch (_err) {
    return '';
  }
}

function writeFirstRunScanMarker(userDataPath, libraryPath, fsImpl = fs) {
  if (!userDataPath || !libraryPath) return { ok: false };
  fsImpl.mkdirSync(userDataPath, { recursive: true });
  fsImpl.writeFileSync(
    markerPath(userDataPath),
    JSON.stringify({ requested: true, libraryPath, ts: Date.now() }, null, 2),
    'utf8'
  );
  return { ok: true };
}

function consumeFirstRunScanMarker({
  userDataPath,
  loadState,
  updateState,
  makeId,
  enqueueScan,
  fsImpl = fs,
} = {}) {
  const file = markerPath(userDataPath || '');
  if (!userDataPath || !fsImpl.existsSync(file)) return { consumed: false };

  let marker = null;
  try {
    marker = JSON.parse(fsImpl.readFileSync(file, 'utf8'));
  } catch (_err) {
    try {
      fsImpl.rmSync(file, { force: true });
    } catch (_removeErr) {
      /* ignore */
    }
    return { consumed: true, categoryAdded: false, error: 'invalid-marker' };
  }

  const libraryPath = String(marker?.libraryPath || '').trim();
  let categoryAdded = false;

  try {
    if (libraryPath && fsImpl.existsSync(libraryPath)) {
      const current = loadState ? loadState() : {};
      const existingPaths = (current.categories || []).map((category) =>
        normalizeComparablePath(category.path)
      );
      const targetPath = normalizeComparablePath(libraryPath);

      if (!existingPaths.includes(targetPath)) {
        updateState((state) => {
          state.categories = Array.isArray(state.categories) ? state.categories : [];
          state.categories.push({
            id: makeId('category', libraryPath),
            path: libraryPath,
            name: path.basename(libraryPath) || 'Manga',
            hidden: false,
          });
          return state;
        });
        categoryAdded = true;
      }

      if (enqueueScan) {
        enqueueScan('scan', { source: 'first-run-scan' });
      }
    }
  } finally {
    try {
      fsImpl.rmSync(file, { force: true });
    } catch (_err) {
      /* ignore */
    }
  }

  return { consumed: true, categoryAdded };
}

module.exports = {
  MARKER_NAME,
  consumeFirstRunScanMarker,
  markerPath,
  writeFirstRunScanMarker,
};

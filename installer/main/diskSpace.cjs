// Wrapper around `check-disk-space`. Returns { free, required } in GB so the
// UI can render the disk-usage bar. Falls back to a sane mock when the
// dependency is absent (dev / minimal install).

let checkDiskSpace = null;
try {
  // eslint-disable-next-line global-require
  checkDiskSpace = require('check-disk-space').default;
} catch (_err) {
  // dependency not installed — that's fine in dev
}

const REQUIRED_GB = 1.82; // bundled total: app.asar + Suwayomi + JRE + locales

async function getDiskSpace(targetPath) {
  if (!checkDiskSpace) {
    return { free: 286.4, required: REQUIRED_GB };
  }
  try {
    const root =
      process.platform === 'win32'
        ? (targetPath || 'C:\\').slice(0, 2) + '\\'
        : '/';
    const info = await checkDiskSpace(root);
    return {
      free: info.free / (1024 * 1024 * 1024),
      required: REQUIRED_GB,
    };
  } catch (_err) {
    return { free: 0, required: REQUIRED_GB };
  }
}

module.exports = { getDiskSpace, REQUIRED_GB };

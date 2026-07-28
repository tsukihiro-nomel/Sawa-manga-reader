const { parentPort, workerData } = require('worker_threads');
const {
  cleanupStagedBackup,
  exportBackupPackage,
  recoverManagedCoverTransaction,
  replaceManagedCovers,
  stageBackupImport
} = require('./backupPackage.cjs');
const { exportComicInfoCbz } = require('./archiveExport.cjs');
const { buildCoverGallery, importManagedCover } = require('./coverManager.cjs');

let cancelled = false;
parentPort.on('message', (message) => {
  if (message?.type === 'cancel') cancelled = true;
});

async function run() {
  const task = String(workerData?.task || '');
  const payload = workerData?.payload || {};
  if (task === 'archive-export') {
    return exportComicInfoCbz({
      ...payload,
      isCancelled: () => cancelled,
      onProgress: (progress) => parentPort.postMessage({ type: 'progress', progress })
    });
  }
  if (task === 'backup-export') return exportBackupPackage(payload);
  if (task === 'backup-stage') return stageBackupImport(payload.filePath);
  if (task === 'backup-cleanup') {
    cleanupStagedBackup(payload.staged);
    return { ok: true };
  }
  if (task === 'covers-replace') {
    const transaction = replaceManagedCovers(payload.stagedCoverDir, payload.managedCoverDir);
    return {
      changed: transaction.changed,
      journalPath: transaction.journalPath,
      rollbackDir: transaction.rollbackDir
    };
  }
  if (task === 'covers-rollback') {
    return recoverManagedCoverTransaction(payload.managedCoverDir);
  }
  if (task === 'covers-commit') {
    return recoverManagedCoverTransaction(payload.managedCoverDir, { commit: true });
  }
  if (task === 'cover-import') {
    return importManagedCover(payload);
  }
  if (task === 'cover-gallery') {
    return buildCoverGallery(payload);
  }
  throw new Error(`Heavy I/O task inconnue: ${task}`);
}

run()
  .then((result) => parentPort.postMessage({ type: 'result', result }))
  .catch((error) => parentPort.postMessage({
    type: 'error',
    error: error?.message || String(error),
    stack: error?.stack || null
  }));

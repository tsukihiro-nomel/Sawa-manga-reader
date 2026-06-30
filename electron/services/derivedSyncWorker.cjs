const path = require('path');
const {
  isMainThread,
  parentPort,
  workerData,
  Worker
} = require('worker_threads');

if (!isMainThread) {
  if (workerData?.userDataPath) {
    process.env.SAWA_USER_DATA_PATH = workerData.userDataPath;
  }

  const {
    closeDerivedStore,
    patchLibrarySnapshot
  } = require('./derivedStore.cjs');

  try {
    const result = patchLibrarySnapshot(workerData?.library || {}, workerData?.options || {});
    closeDerivedStore();
    parentPort.postMessage({ ok: true, result });
  } catch (error) {
    closeDerivedStore();
    parentPort.postMessage({
      ok: false,
      error: error?.message || 'Derived snapshot worker failed',
      stack: error?.stack || null
    });
  }
}

function patchLibrarySnapshotInWorker(library = {}, options = {}, workerOptions = {}) {
  const WorkerClass = workerOptions.WorkerClass || Worker;
  const workerPath = workerOptions.workerPath || path.join(__dirname, 'derivedSyncWorker.cjs');

  return new Promise((resolve, reject) => {
    const worker = new WorkerClass(workerPath, {
      workerData: {
        library,
        options,
        userDataPath: workerOptions.userDataPath || null
      }
    });
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };

    worker.once('message', (message) => {
      if (message?.ok) {
        finish(resolve, message.result);
        return;
      }
      const error = new Error(message?.error || 'Derived snapshot worker failed');
      if (message?.stack) error.stack = message.stack;
      finish(reject, error);
    });
    worker.once('error', (error) => finish(reject, error));
    worker.once('exit', (code) => {
      if (code !== 0) finish(reject, new Error(`Derived snapshot worker exited with code ${code}`));
    });
  });
}

module.exports = {
  patchLibrarySnapshotInWorker
};

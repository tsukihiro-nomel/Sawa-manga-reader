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

  const { scanLibrary } = require('./libraryScanner.cjs');
  try {
    parentPort.postMessage({ ok: true, library: scanLibrary(workerData?.persistedState || {}) });
  } catch (error) {
    parentPort.postMessage({
      ok: false,
      error: error?.message || 'Library scan worker failed',
      stack: error?.stack || null
    });
  }
}

function scanLibraryInWorker(persistedState = {}, options = {}) {
  const WorkerClass = options.WorkerClass || Worker;
  const workerPath = options.workerPath || path.join(__dirname, 'libraryScanWorker.cjs');

  return new Promise((resolve, reject) => {
    const worker = new WorkerClass(workerPath, {
      workerData: { persistedState, userDataPath: options.userDataPath || null }
    });
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };

    worker.once('message', (message) => {
      if (message?.ok) {
        finish(resolve, message.library);
        return;
      }
      const error = new Error(message?.error || 'Library scan worker failed');
      if (message?.stack) error.stack = message.stack;
      finish(reject, error);
    });
    worker.once('error', (error) => finish(reject, error));
    worker.once('exit', (code) => {
      if (code !== 0) finish(reject, new Error(`Library scan worker exited with code ${code}`));
    });
  });
}

module.exports = {
  scanLibraryInWorker
};

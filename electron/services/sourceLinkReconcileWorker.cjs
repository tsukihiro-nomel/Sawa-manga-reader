const path = require('path');
const { isMainThread, parentPort, workerData, Worker } = require('worker_threads');

if (!isMainThread) {
  if (workerData?.userDataPath) process.env.SAWA_USER_DATA_PATH = workerData.userDataPath;
  const sourceRuntime = require('./sourceRuntime.cjs');
  (async () => {
    try {
      const before = sourceRuntime.loadSourcesState().seriesLinks;
      const links = sourceRuntime.reconcileSeriesLinksWithLibrary(workerData?.mangas || []);
      await sourceRuntime.flushSourcesStateWrites();
      parentPort.postMessage({
        ok: true,
        changed: JSON.stringify(before) !== JSON.stringify(links),
        linkCount: links.length
      });
    } catch (error) {
      parentPort.postMessage({
        ok: false,
        error: error?.message || 'Source link reconciliation failed',
        stack: error?.stack || null
      });
    }
  })();
}

function reconcileSourceLinksInWorker(mangas = [], options = {}) {
  const WorkerClass = options.WorkerClass || Worker;
  const workerPath = options.workerPath || path.join(__dirname, 'sourceLinkReconcileWorker.cjs');
  return new Promise((resolve, reject) => {
    const worker = new WorkerClass(workerPath, {
      workerData: { mangas, userDataPath: options.userDataPath || null }
    });
    worker.unref?.();
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    worker.once('message', (message) => {
      if (message?.ok) return finish(resolve, message);
      const error = new Error(message?.error || 'Source link reconciliation failed');
      if (message?.stack) error.stack = message.stack;
      return finish(reject, error);
    });
    worker.once('error', (error) => finish(reject, error));
    worker.once('exit', (code) => {
      if (code !== 0) finish(reject, new Error(`Source reconciliation worker exited with code ${code}`));
    });
  });
}

module.exports = { reconcileSourceLinksInWorker };

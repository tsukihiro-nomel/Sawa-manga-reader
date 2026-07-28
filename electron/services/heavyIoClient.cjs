const path = require('path');
const { Worker } = require('worker_threads');

const activeWorkerRecords = new Set();

function createAbortError(message = 'Heavy I/O task aborted.') {
  const error = new Error(message);
  error.name = 'AbortError';
  error.interrupted = true;
  return error;
}

function runHeavyIoTask(task, payload = {}, options = {}) {
  if (options.signal?.aborted) return Promise.reject(createAbortError());
  return new Promise((resolve, reject) => {
    const WorkerImpl = options.WorkerImpl || Worker;
    const worker = new WorkerImpl(path.join(__dirname, 'heavyIoWorker.cjs'), {
      workerData: { task, payload }
    });
    let settled = false;
    let cancellationTimer = null;
    let abortTimer = null;
    let resolveFinished;
    const finished = new Promise((done) => { resolveFinished = done; });
    const record = {
      worker,
      finished,
      requestAbort: null
    };
    activeWorkerRecords.add(record);

    const finish = (callback, value, terminate = true) => {
      if (settled) return;
      settled = true;
      if (cancellationTimer) clearInterval(cancellationTimer);
      if (abortTimer) clearTimeout(abortTimer);
      options.signal?.removeEventListener?.('abort', signalAbortHandler);
      activeWorkerRecords.delete(record);
      resolveFinished();
      callback(value);
      if (terminate) Promise.resolve(worker.terminate()).catch(() => {});
    };

    const requestAbort = (reason = 'Heavy I/O task aborted.', timeoutMs = options.abortTimeoutMs) => {
      if (settled || abortTimer) return;
      try { worker.postMessage({ type: 'cancel' }); } catch (_error) {}
      const boundedTimeout = Math.max(25, Math.min(2000, Number(timeoutMs) || 500));
      abortTimer = setTimeout(() => {
        finish(reject, createAbortError(reason));
      }, boundedTimeout);
      if (typeof abortTimer.unref === 'function') abortTimer.unref();
    };
    record.requestAbort = requestAbort;
    const signalAbortHandler = () => requestAbort('Heavy I/O task aborted by signal.');
    options.signal?.addEventListener?.('abort', signalAbortHandler, { once: true });

    worker.on('message', (message) => {
      if (message?.type === 'progress') {
        try {
          options.onProgress?.(message.progress || {});
        } catch (_error) {
          // UI progress observers must never terminate the underlying durable task.
        }
        return;
      }
      if (message?.type === 'result') finish(resolve, message.result);
      if (message?.type === 'error') finish(reject, new Error(message.error || 'Heavy I/O worker failed.'));
    });
    worker.once('error', (error) => finish(reject, error));
    worker.once('exit', (code) => {
      if (!settled) {
        const suffix = code === 0 ? 'without returning a result' : `with code ${code}`;
        finish(reject, new Error(`Heavy I/O worker stopped ${suffix}.`), false);
      }
    });
    if (typeof options.isCancelled === 'function') {
      let cancellationSent = false;
      const forwardCancellation = () => {
        if (!cancellationSent && options.isCancelled()) {
          cancellationSent = true;
          try { worker.postMessage({ type: 'cancel' }); } catch (_error) {}
        }
      };
      forwardCancellation();
      cancellationTimer = setInterval(forwardCancellation, 25);
      if (typeof cancellationTimer.unref === 'function') cancellationTimer.unref();
    }
  });
}

function getActiveHeavyIoWorkerCount() {
  return activeWorkerRecords.size;
}

async function shutdownHeavyIoWorkers(options = {}) {
  const records = [...activeWorkerRecords];
  if (records.length === 0) return { requested: 0, remaining: 0 };
  const timeoutMs = Math.max(50, Math.min(2000, Number(options.timeoutMs) || 750));
  records.forEach((record) => record.requestAbort('Application shutdown interrupted heavy I/O.', timeoutMs));
  await Promise.race([
    Promise.allSettled(records.map((record) => record.finished)),
    new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs + 50);
      if (typeof timer.unref === 'function') timer.unref();
    })
  ]);
  return {
    requested: records.length,
    remaining: activeWorkerRecords.size
  };
}

module.exports = {
  createAbortError,
  getActiveHeavyIoWorkerCount,
  runHeavyIoTask,
  shutdownHeavyIoWorkers
};

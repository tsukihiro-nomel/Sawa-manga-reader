function createAbortError(message = 'Task aborted') {
  if (typeof DOMException !== 'undefined') return new DOMException(message, 'AbortError');
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

export function createAbortableTaskQueue(maxConcurrent = 2) {
  const limit = Math.max(1, Math.floor(Number(maxConcurrent) || 1));
  const pending = [];
  let activeCount = 0;

  const drain = () => {
    while (activeCount < limit && pending.length > 0) {
      const entry = pending.shift();
      if (entry.signal?.aborted) {
        entry.cleanup();
        entry.reject(createAbortError());
        continue;
      }
      entry.started = true;
      entry.cleanup();
      activeCount += 1;
      Promise.resolve()
        .then(() => entry.task())
        .then(entry.resolve, entry.reject)
        .finally(() => {
          activeCount -= 1;
          drain();
        });
    }
  };

  const schedule = (task, options = {}) => {
    const signal = options.signal || null;
    if (signal?.aborted) return Promise.reject(createAbortError());
    return new Promise((resolve, reject) => {
      const entry = {
        task,
        signal,
        resolve,
        reject,
        started: false,
        cleanup: () => {}
      };
      const onAbort = () => {
        if (entry.started) return;
        const index = pending.indexOf(entry);
        if (index >= 0) pending.splice(index, 1);
        entry.cleanup();
        reject(createAbortError());
      };
      entry.cleanup = () => signal?.removeEventListener('abort', onAbort);
      signal?.addEventListener('abort', onAbort, { once: true });
      pending.push(entry);
      drain();
    });
  };

  return {
    schedule,
    getStats: () => ({ activeCount, queuedCount: pending.length, maxConcurrent: limit })
  };
}

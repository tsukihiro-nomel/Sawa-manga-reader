const path = require('path');

function createThumbnailUtilityPool({
  forkImpl,
  workerPath = path.join(__dirname, 'thumbnailUtilityWorker.cjs'),
  maxConcurrent = 2,
  taskTimeoutMs = 30_000
} = {}) {
  if (typeof forkImpl !== 'function') throw new TypeError('forkImpl is required');

  const size = Math.max(1, Math.min(2, Number(maxConcurrent) || 2));
  const slots = Array.from({ length: size }, () => ({
    child: null,
    task: null,
    timer: null
  }));
  const queue = [];
  let nextRequestId = 0;
  let closed = false;

  const clearSlotTask = (slot) => {
    if (slot.timer) clearTimeout(slot.timer);
    slot.timer = null;
    const task = slot.task;
    slot.task = null;
    return task;
  };

  const retireChild = (slot) => {
    const child = slot.child;
    slot.child = null;
    if (!child) return;
    child.removeAllListeners?.('message');
    child.removeAllListeners?.('error');
    child.removeAllListeners?.('exit');
    try {
      child.kill();
    } catch (_) {
      // The utility process may already have exited.
    }
  };

  const drain = () => {
    if (closed) return;
    for (const slot of slots) {
      if (slot.task || queue.length === 0) continue;
      if (!slot.child) {
        const child = forkImpl(workerPath, [], {
          serviceName: 'Sawa Thumbnail Worker'
        });
        slot.child = child;
        child.on('message', (message) => {
          if (!slot.task || message?.requestId !== slot.task.requestId) return;
          if (message?.type !== 'result' && message?.type !== 'error') return;
          const task = clearSlotTask(slot);
          if (message.type === 'result') task.resolve(message.targetPath);
          else task.reject(new Error(message.error || 'Thumbnail utility process failed'));
          drain();
        });
        child.on('error', (error) => {
          const task = clearSlotTask(slot);
          retireChild(slot);
          task?.reject(error);
          drain();
        });
        child.on('exit', (code) => {
          const task = clearSlotTask(slot);
          slot.child = null;
          if (task) task.reject(new Error(`Thumbnail utility process exited (${code ?? 'unknown'})`));
          drain();
        });
      }

      const task = queue.shift();
      slot.task = task;
      slot.timer = setTimeout(() => {
        const timedOutTask = clearSlotTask(slot);
        retireChild(slot);
        timedOutTask?.reject(new Error('Thumbnail utility process timed out'));
        drain();
      }, taskTimeoutMs);
      slot.timer.unref?.();
      try {
        slot.child.postMessage({
          type: 'generate',
          requestId: task.requestId,
          payload: task.payload
        });
      } catch (error) {
        clearSlotTask(slot);
        retireChild(slot);
        task.reject(error);
        drain();
      }
    }
  };

  const generateThumbnail = (payload) => {
    if (closed) return Promise.reject(new Error('Thumbnail utility pool is closed'));
    return new Promise((resolve, reject) => {
      queue.push({
        requestId: `thumbnail-${Date.now()}-${nextRequestId += 1}`,
        payload,
        resolve,
        reject
      });
      drain();
    });
  };

  const shutdown = async () => {
    if (closed) return;
    closed = true;
    const error = new Error('Thumbnail utility pool is shutting down');
    while (queue.length > 0) queue.shift().reject(error);
    for (const slot of slots) {
      clearSlotTask(slot)?.reject(error);
      retireChild(slot);
    }
  };

  return {
    generateThumbnail,
    shutdown
  };
}

module.exports = {
  createThumbnailUtilityPool
};

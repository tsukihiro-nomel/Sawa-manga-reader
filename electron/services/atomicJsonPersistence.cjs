const fs = require('fs');
const path = require('path');

function createAtomicJsonPersistence(options = {}) {
  const io = options.fsPromises || fs.promises;
  const maxConcurrent = Math.max(1, Math.min(2, Number(options.maxConcurrent) || 2));
  const pending = new Map();
  let running = null;
  let revision = 0;
  let lastError = null;

  async function writeEntry(entry) {
    const directory = path.dirname(entry.filePath);
    const temporaryPath = `${entry.filePath}.tmp-${process.pid}-${entry.revision}`;
    await io.mkdir(directory, { recursive: true });
    await io.writeFile(temporaryPath, entry.content, 'utf8');
    await io.rename(temporaryPath, entry.filePath);
  }

  async function drain() {
    let drainError = null;
    while (pending.size > 0) {
      const batch = [...pending.values()].slice(0, maxConcurrent);
      const results = await Promise.allSettled(batch.map(writeEntry));
      results.forEach((result, index) => {
        const entry = batch[index];
        if (result.status === 'rejected') {
          drainError ||= result.reason;
          return;
        }
        if (pending.get(entry.filePath)?.revision === entry.revision) {
          pending.delete(entry.filePath);
          try {
            entry.onSuccess?.({
              filePath: entry.filePath,
              content: entry.content,
              revision: entry.revision
            });
          } catch (_error) {
            // Persistence succeeded. A bookkeeping callback must not turn it
            // into a failed disk write.
          }
        }
      });
      // Keep rejected entries queued for an explicit later retry. Stopping
      // here avoids a tight loop while a disk remains unavailable.
      if (drainError) break;
    }
    lastError = drainError || (pending.size > 0 ? lastError : null);
    return !drainError;
  }

  function kick() {
    if (!running) {
      running = Promise.resolve()
        .then(drain)
        .finally(() => {
          running = null;
        });
    }
    return running;
  }

  function schedule(filePath, content, callbacks = {}) {
    revision += 1;
    pending.set(filePath, {
      filePath,
      content: String(content),
      revision,
      onSuccess: typeof callbacks.onSuccess === 'function' ? callbacks.onSuccess : null
    });
    kick();
    return revision;
  }

  async function flush() {
    if (running) await running;
    else if (pending.size > 0) await kick();
    return {
      ok: pending.size === 0 && !lastError,
      error: lastError?.message || null,
      revision
    };
  }

  function getStatus() {
    return {
      pendingCount: pending.size,
      writing: Boolean(running),
      revision,
      lastError: lastError?.message || null
    };
  }

  return { flush, getStatus, schedule };
}

module.exports = { createAtomicJsonPersistence };

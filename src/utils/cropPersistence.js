export function createCropPersistenceController(options) {
  const delay = Math.max(20, Number(options.delay) || 160);
  const scheduleTimer = options.setTimeoutFn || setTimeout;
  const cancelTimer = options.clearTimeoutFn || clearTimeout;
  let timer = null;
  let tail = Promise.resolve();
  let latestRevision = 0;
  let pending = null;

  function enqueue(entry) {
    if (!entry) return tail;
    pending = null;
    tail = tail
      .catch(() => {})
      .then(() => options.persist(entry.value, entry.revision))
      .then((result) => {
        if (entry.revision === latestRevision) options.onApplied?.(result, entry.revision);
        return result;
      })
      .catch((error) => {
        if (entry.revision === latestRevision) options.onError?.(error, entry.revision);
        return null;
      });
    return tail;
  }

  function schedule(value) {
    latestRevision += 1;
    pending = { value, revision: latestRevision };
    if (timer) cancelTimer(timer);
    timer = scheduleTimer(() => {
      timer = null;
      enqueue(pending);
    }, delay);
    return latestRevision;
  }

  function flush(value) {
    if (timer) {
      cancelTimer(timer);
      timer = null;
    }
    if (value !== undefined) {
      latestRevision += 1;
      pending = { value, revision: latestRevision };
    }
    return enqueue(pending);
  }

  return {
    schedule,
    flush,
    idle: () => tail,
    revision: () => latestRevision
  };
}

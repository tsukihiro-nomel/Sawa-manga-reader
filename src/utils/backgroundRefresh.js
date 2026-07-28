function refreshError(error) {
  return String(error?.message || error || 'La synchronisation en arriere-plan a echoue.');
}

export function createBackgroundRefreshController({
  load,
  apply,
  getRevision = () => 0,
  onStatus = () => {},
  wait = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
  retryDelays = [350, 900, 1800]
} = {}) {
  if (typeof load !== 'function' || typeof apply !== 'function') {
    throw new TypeError('load and apply are required');
  }

  let generation = 0;
  let disposed = false;

  async function run({ manual = false } = {}) {
    const currentGeneration = ++generation;
    onStatus({
      state: 'refreshing',
      label: manual ? 'synchronisation relancee' : 'synchronisation en cours',
      detail: 'Les donnees visibles restent disponibles.',
      attempt: 1
    });

    let lastError = null;
    const attemptCount = retryDelays.length + 1;
    for (let attempt = 0; attempt < attemptCount; attempt += 1) {
      if (disposed || currentGeneration !== generation) return { ok: false, cancelled: true };
      if (attempt > 0) {
        await wait(retryDelays[attempt - 1]);
        if (disposed || currentGeneration !== generation) return { ok: false, cancelled: true };
        onStatus({
          state: 'refreshing',
          label: 'nouvelle tentative',
          detail: `Tentative ${attempt + 1}/${attemptCount}; la bibliotheque reste utilisable.`,
          attempt: attempt + 1
        });
      }

      try {
        const payload = await load();
        if (disposed || currentGeneration !== generation) return { ok: false, cancelled: true };
        const incomingRevision = Number(payload?.stateRevision || 0);
        const currentRevision = Number(getRevision() || 0);
        if (incomingRevision > 0 && incomingRevision < currentRevision) {
          onStatus({
            state: 'ready',
            label: 'a jour',
            detail: 'Une reponse obsolete a ete ignoree.',
            retryable: false
          });
          return { ok: false, stale: true, revision: incomingRevision };
        }
        apply(payload);
        onStatus(payload?.syncState?.status
          ? {
              state: payload.syncState.status,
              label: payload.syncState.status === 'attention-needed' ? 'verification requise' : 'a jour',
              detail: payload.syncState.error || '',
              retryable: payload.syncState.status === 'attention-needed'
            }
          : { state: 'ready', label: 'a jour', detail: '', retryable: false });
        return { ok: true, revision: incomingRevision, attempts: attempt + 1 };
      } catch (error) {
        lastError = error;
      }
    }

    const status = {
      state: 'retry-required',
      label: 'synchronisation a relancer',
      detail: refreshError(lastError),
      retryable: true,
      attempts: attemptCount
    };
    onStatus(status);
    return { ok: false, error: status.detail, attempts: attemptCount };
  }

  return {
    run,
    retry: () => run({ manual: true }),
    cancel: () => {
      generation += 1;
    },
    dispose: () => {
      disposed = true;
      generation += 1;
    }
  };
}

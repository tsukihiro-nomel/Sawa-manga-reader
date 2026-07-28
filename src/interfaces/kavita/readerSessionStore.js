function resolved() {
  return Promise.resolve();
}

function ensureSuccessful(result) {
  if (result?.ok === false) {
    throw new Error(String(result.error || 'Ecriture locale impossible.'));
  }
  return result;
}

export function createReaderSessionStore(options = {}) {
  const persistProgress = options.persistProgress || resolved;
  const commitProgress = options.commitProgress || resolved;
  const persistSettings = options.persistSettings || resolved;
  const commitSettings = options.commitSettings || resolved;
  const onPersistenceError = options.onPersistenceError || (() => {});
  const onPersistenceSuccess = options.onPersistenceSuccess || (() => {});
  const progressDelay = Number.isFinite(options.progressDelay) ? options.progressDelay : 450;
  const settingsDelay = Number.isFinite(options.settingsDelay) ? options.settingsDelay : 500;

  let progressTimer = null;
  let settingsTimer = null;
  let progressRevision = 0;
  let settingsRevision = 0;
  let latestProgress = null;
  let progressMeta = { tabId: null, incognito: false };
  let latestSettings = null;
  let progressNeedsPersist = false;
  let progressNeedsCommit = false;
  let settingsNeedPersist = false;
  let settingsNeedCommit = false;

  async function persistLatestProgress(revision = progressRevision) {
    if (!latestProgress || progressMeta.incognito || !progressNeedsPersist) return;
    const payload = latestProgress;
    ensureSuccessful(await persistProgress(payload));
    if (revision === progressRevision) {
      progressNeedsPersist = false;
      onPersistenceSuccess({ kind: 'progress', revision });
    }
  }

  async function persistLatestSettings(revision = settingsRevision) {
    if (!latestSettings || !settingsNeedPersist) return;
    const payload = latestSettings;
    ensureSuccessful(await persistSettings(payload));
    if (revision === settingsRevision) {
      settingsNeedPersist = false;
      onPersistenceSuccess({ kind: 'settings', revision });
    }
  }

  function reportPersistenceError(kind, error, payload, revision) {
    const currentRevision = kind === 'progress' ? progressRevision : settingsRevision;
    if (revision !== currentRevision) return;
    const retry = async () => {
      try {
        if (kind === 'progress') await persistLatestProgress(revision);
        else await persistLatestSettings(revision);
        return { ok: true };
      } catch (retryError) {
        reportPersistenceError(kind, retryError, payload, revision);
        return { ok: false, error: retryError };
      }
    };
    onPersistenceError({ kind, error, payload, revision, retry });
  }

  function stageProgress(payload, meta = {}) {
    latestProgress = payload;
    progressMeta = {
      ...meta,
      tabId: meta.tabId ?? null,
      incognito: Boolean(meta.incognito),
    };
    progressRevision += 1;
    progressNeedsPersist = !progressMeta.incognito;
    progressNeedsCommit = true;
    clearTimeout(progressTimer);
    const revision = progressRevision;
    if (!progressMeta.incognito) {
      progressTimer = setTimeout(() => {
        progressTimer = null;
        void persistLatestProgress(revision).catch((error) => {
          reportPersistenceError('progress', error, latestProgress, revision);
        });
      }, progressDelay);
    }
  }

  function stageSettings(settings) {
    latestSettings = settings;
    settingsRevision += 1;
    settingsNeedPersist = true;
    settingsNeedCommit = true;
    clearTimeout(settingsTimer);
    const revision = settingsRevision;
    settingsTimer = setTimeout(() => {
      settingsTimer = null;
      void persistLatestSettings(revision).catch((error) => {
        reportPersistenceError('settings', error, latestSettings, revision);
      });
    }, settingsDelay);
  }

  async function flush({ commit = true } = {}) {
    clearTimeout(progressTimer);
    clearTimeout(settingsTimer);
    progressTimer = null;
    settingsTimer = null;
    const errors = [];
    try {
      await persistLatestProgress();
    } catch (error) {
      errors.push(error);
      reportPersistenceError('progress', error, latestProgress, progressRevision);
    }
    try {
      await persistLatestSettings();
    } catch (error) {
      errors.push(error);
      reportPersistenceError('settings', error, latestSettings, settingsRevision);
    }

    if (commit && latestProgress && progressNeedsCommit) {
      try {
        await commitProgress(latestProgress, progressMeta);
        progressNeedsCommit = false;
      } catch (error) {
        errors.push(error);
      }
    }
    if (commit && latestSettings && settingsNeedCommit) {
      try {
        await commitSettings(latestSettings);
        settingsNeedCommit = false;
      } catch (error) {
        errors.push(error);
      }
    }
    return { ok: errors.length === 0, errors };
  }

  function cancelScheduled() {
    clearTimeout(progressTimer);
    clearTimeout(settingsTimer);
    progressTimer = null;
    settingsTimer = null;
  }

  return {
    stageProgress,
    stageSettings,
    flush,
    cancelScheduled,
    getSnapshot: () => ({
      progress: latestProgress,
      progressMeta,
      settings: latestSettings,
    }),
  };
}

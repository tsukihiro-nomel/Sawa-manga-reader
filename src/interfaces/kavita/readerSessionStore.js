function resolved() {
  return Promise.resolve();
}

export function createReaderSessionStore(options = {}) {
  const persistProgress = options.persistProgress || resolved;
  const commitProgress = options.commitProgress || resolved;
  const persistSettings = options.persistSettings || resolved;
  const commitSettings = options.commitSettings || resolved;
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
    await persistProgress(payload);
    if (revision === progressRevision) progressNeedsPersist = false;
  }

  async function persistLatestSettings(revision = settingsRevision) {
    if (!latestSettings || !settingsNeedPersist) return;
    const payload = latestSettings;
    await persistSettings(payload);
    if (revision === settingsRevision) settingsNeedPersist = false;
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
        void persistLatestProgress(revision).catch(() => {});
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
      void persistLatestSettings(revision).catch(() => {});
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
    }
    try {
      await persistLatestSettings();
    } catch (error) {
      errors.push(error);
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

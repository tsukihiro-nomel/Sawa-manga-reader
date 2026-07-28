function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function fieldEntries(patch = {}) {
  const entries = [];
  for (const [key, value] of Object.entries(isObject(patch) ? patch : {})) {
    if (key === 'experimental' && isObject(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        entries.push({ path: `experimental.${nestedKey}`, value: nestedValue });
      }
    } else {
      entries.push({ path: key, value });
    }
  }
  return entries;
}

function readField(settings, path) {
  if (!path.includes('.')) return settings?.[path];
  const [parent, child] = path.split('.');
  return settings?.[parent]?.[child];
}

function patchFromEntries(entries = []) {
  const patch = {};
  for (const { path, value } of entries) {
    if (!path.includes('.')) {
      patch[path] = value;
      continue;
    }
    const [parent, child] = path.split('.');
    patch[parent] = { ...(patch[parent] || {}), [child]: value };
  }
  return patch;
}

function errorMessage(error) {
  return String(error?.message || error?.error || error || 'Impossible d enregistrer les parametres.');
}

export function createSettingsPersistenceController({
  getSettings,
  applyPatch,
  persist,
  getRevision = () => 0,
  onIssue = () => {},
  onIssueResolved = () => {},
  onRevision = () => {}
} = {}) {
  if (typeof getSettings !== 'function' || typeof applyPatch !== 'function' || typeof persist !== 'function') {
    throw new TypeError('getSettings, applyPatch and persist are required');
  }

  let sequence = 0;
  let latestRevision = 0;
  const latestByField = new Map();
  const confirmedByField = new Map();

  async function update(patch, options = {}) {
    const entries = fieldEntries(patch);
    if (!entries.length) return { ok: true, skipped: true };
    const operationSequence = ++sequence;
    const before = getSettings() || {};
    const previousEntries = entries.map(({ path }) => ({ path, value: readField(before, path) }));
    entries.forEach(({ path }) => latestByField.set(path, operationSequence));
    applyPatch(patch);

    try {
      const result = await persist(patch);
      if (result?.ok === false) throw new Error(errorMessage(result.error));
      const revision = Number(result?.revision || 0);
      const staleRevision = revision > 0 && revision < Math.max(latestRevision, Number(getRevision() || 0));
      if (revision > latestRevision) {
        latestRevision = revision;
        onRevision(revision);
      }

      if (!staleRevision && isObject(result?.ui)) {
        const confirmedEntries = entries
          .filter(({ path }) => latestByField.get(path) === operationSequence)
          .map(({ path }) => ({ path, value: readField(result.ui, path) }));
        if (confirmedEntries.length) applyPatch(patchFromEntries(confirmedEntries));
      }
      const confirmedFields = entries
        .filter(({ path }) => operationSequence >= (confirmedByField.get(path) || 0))
        .map(({ path }) => path);
      confirmedFields.forEach((path) => confirmedByField.set(path, operationSequence));
      if (confirmedFields.length) onIssueResolved({ fields: confirmedFields, sequence: operationSequence });
      return { ok: true, revision, stale: staleRevision };
    } catch (error) {
      const rollbackEntries = previousEntries.filter(({ path }) => (
        latestByField.get(path) === operationSequence
        && (confirmedByField.get(path) || 0) <= operationSequence
      ));
      if (rollbackEntries.length) applyPatch(patchFromEntries(rollbackEntries));
      const failedFields = rollbackEntries.map(({ path }) => path);
      if (!failedFields.length) {
        return { ok: false, stale: true, error: errorMessage(error), rolledBackFields: [] };
      }
      const retry = () => {
        const retryEntries = entries.filter(({ path }) => (
          latestByField.get(path) === operationSequence
          && (confirmedByField.get(path) || 0) <= operationSequence
        ));
        if (!retryEntries.length) return Promise.resolve({ ok: true, stale: true });
        return update(patchFromEntries(retryEntries), { ...options, retry: true });
      };
      onIssue({
        id: `settings-${operationSequence}`,
        kind: 'settings',
        title: 'Parametres non enregistres',
        message: failedFields.length
          ? `${failedFields.length} reglage(s) ont ete restaures.`
          : 'Une version plus recente est conservee; sa sauvegarde reste a confirmer.',
        details: errorMessage(error),
        fields: failedFields,
        retry
      });
      return { ok: false, error: errorMessage(error), rolledBackFields: failedFields };
    }
  }

  return {
    update,
    getLatestRevision: () => latestRevision
  };
}

export { fieldEntries, patchFromEntries };

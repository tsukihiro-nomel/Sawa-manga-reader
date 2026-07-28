function messageFromError(error) {
  if (typeof error === 'string' && error.trim()) return error.trim();
  return String(error?.message || error?.error || 'Ecriture locale impossible.');
}

function asMutationError(result) {
  if (result?.ok !== false) return null;
  return new Error(messageFromError(result?.error));
}

export function createOptimisticMutationManager({
  getState,
  updateState,
  onIssuesChanged = () => {},
  onRevision = () => {}
} = {}) {
  if (typeof getState !== 'function' || typeof updateState !== 'function') {
    throw new TypeError('getState and updateState are required');
  }

  let sequence = 0;
  let issueSequence = 0;
  let latestRevision = 0;
  const latestByKey = new Map();
  const confirmedByKey = new Map();
  const confirmedPatchByKey = new Map();
  const operationsByKey = new Map();
  const statusBySequence = new Map();
  const issues = new Map();

  const emitIssues = () => {
    onIssuesChanged([...issues.values()].map(({ retrySpec: _retrySpec, ...issue }) => issue));
  };

  const clearKeyIssue = (key) => {
    let changed = false;
    for (const [issueId, issue] of issues) {
      if (issue.key !== key) continue;
      issues.delete(issueId);
      changed = true;
    }
    if (changed) emitIssues();
  };

  async function execute(spec = {}) {
    const key = String(spec.key || '').trim();
    if (!key || typeof spec.apply !== 'function' || typeof spec.persist !== 'function') {
      throw new TypeError('A mutation key, apply and persist are required');
    }

    const operationSequence = ++sequence;
    const before = getState();
    const captureInverse = spec.captureInverse || spec.createInversePatch;
    const captureApplied = spec.captureApplied || spec.createAppliedPatch || captureInverse;
    const inversePatch = typeof captureInverse === 'function'
      ? captureInverse(before)
      : null;
    if (!confirmedPatchByKey.has(key)) {
      confirmedPatchByKey.set(key, { sequence: 0, patch: inversePatch });
    }
    const after = spec.apply(before);
    const appliedPatch = typeof captureApplied === 'function'
      ? captureApplied(after)
      : null;
    const operation = {
      key,
      sequence: operationSequence,
      spec,
      inversePatch,
      appliedPatch
    };
    const previousLatestSequence = latestByKey.get(key);
    latestByKey.set(key, operationSequence);
    if (previousLatestSequence) statusBySequence.delete(previousLatestSequence);
    operationsByKey.set(key, operation);
    statusBySequence.set(operationSequence, 'pending');
    clearKeyIssue(key);
    updateState((current) => (current === before ? after : spec.apply(current)));

    try {
      const result = await spec.persist();
      const mutationError = asMutationError(result);
      if (mutationError) throw mutationError;

      const revision = Number(result?.revision || 0);
      if (revision > latestRevision) {
        latestRevision = revision;
        onRevision(revision, result?.patch);
      }
      statusBySequence.set(operationSequence, 'confirmed');
      confirmedByKey.set(key, Math.max(confirmedByKey.get(key) || 0, operationSequence));
      const currentConfirmed = confirmedPatchByKey.get(key);
      if (!currentConfirmed || operationSequence > currentConfirmed.sequence) {
        confirmedPatchByKey.set(key, { sequence: operationSequence, patch: appliedPatch });
      }
      const latestOperation = operationsByKey.get(key);
      if (
        latestOperation
        && latestOperation.sequence > operationSequence
        && statusBySequence.get(latestOperation.sequence) === 'failed'
        && typeof latestOperation.spec.rollback === 'function'
      ) {
        updateState((current) => latestOperation.spec.rollback(
          current,
          confirmedPatchByKey.get(key)?.patch
        ));
      }
      if (latestByKey.get(key) === operationSequence) clearKeyIssue(key);
      return { ok: true, revision, superseded: latestByKey.get(key) !== operationSequence };
    } catch (error) {
      const latestSequence = latestByKey.get(key);
      const superseded = latestSequence !== operationSequence;
      const alreadyConfirmedByNewer = (confirmedByKey.get(key) || 0) > operationSequence;
      statusBySequence.set(operationSequence, 'failed');

      if (!superseded && typeof spec.rollback === 'function') {
        updateState((current) => spec.rollback(
          current,
          confirmedPatchByKey.get(key)?.patch ?? inversePatch
        ));
      }

      if (!alreadyConfirmedByNewer) {
        clearKeyIssue(key);
        const retryOperation = superseded
          ? operationsByKey.get(key)
          : operation;
        const issueId = `mutation-${++issueSequence}`;
        issues.set(issueId, {
          id: issueId,
          kind: 'mutation',
          key,
          title: spec.label || 'Modification non enregistree',
          message: superseded
            ? 'Une modification plus recente est affichee, mais sa sauvegarde reste a confirmer.'
            : 'La modification a ete annulee car elle n a pas pu etre enregistree.',
          details: messageFromError(error),
          rolledBack: !superseded,
          superseded,
          retrySpec: retryOperation?.spec || spec
        });
        emitIssues();
      }

      return {
        ok: false,
        error: messageFromError(error),
        rolledBack: !superseded,
        superseded
      };
    }
  }

  async function retry(issueId) {
    const issue = issues.get(issueId);
    if (!issue?.retrySpec) return { ok: false, error: 'Relance indisponible.' };
    issues.delete(issueId);
    emitIssues();
    return execute(issue.retrySpec);
  }

  function dismiss(issueId) {
    if (issues.delete(issueId)) emitIssues();
  }

  return {
    execute,
    retry,
    dismiss,
    getIssues: () => [...issues.values()].map(({ retrySpec: _retrySpec, ...issue }) => issue),
    getLatestRevision: () => latestRevision
  };
}

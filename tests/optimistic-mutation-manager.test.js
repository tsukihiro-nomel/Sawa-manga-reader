import { describe, expect, it, vi } from 'vitest';
import { createOptimisticMutationManager } from '../src/utils/optimisticMutationManager.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('optimistic mutation manager', () => {
  it('does not roll back a superseded mutation and clears its warning when the newer write succeeds', async () => {
    let state = { favorite: false };
    const issues = [];
    const first = deferred();
    const second = deferred();
    const manager = createOptimisticMutationManager({
      getState: () => state,
      updateState: (update) => {
        state = update(state);
      },
      onIssuesChanged: (next) => {
        issues.splice(0, issues.length, ...next);
      }
    });
    const mutation = (favorite, pending) => ({
      key: 'favorite:manga-1',
      apply: (current) => ({ ...current, favorite }),
      createInversePatch: (before) => ({ favorite: before.favorite }),
      rollback: (current, inverse) => ({ ...current, favorite: inverse.favorite }),
      persist: () => pending.promise
    });

    const firstRun = manager.execute(mutation(true, first));
    const secondRun = manager.execute(mutation(false, second));
    first.reject(new Error('first failed'));
    await firstRun;

    expect(state.favorite).toBe(false);
    expect(issues).toMatchObject([{ superseded: true, rolledBack: false }]);

    second.resolve({ ok: true, revision: 8 });
    await secondRun;
    expect(issues).toEqual([]);
  });

  it('rolls back only the failed field and keeps unrelated newer state', async () => {
    let state = { favorite: false, note: 'before' };
    const pending = deferred();
    const manager = createOptimisticMutationManager({
      getState: () => state,
      updateState: (update) => {
        state = update(state);
      }
    });

    const run = manager.execute({
      key: 'favorite:manga-1',
      apply: (current) => ({ ...current, favorite: true }),
      createInversePatch: (before) => ({ favorite: before.favorite }),
      rollback: (current, inverse) => ({ ...current, favorite: inverse.favorite }),
      persist: () => pending.promise
    });
    state = { ...state, note: 'newer' };
    pending.reject(new Error('disk full'));
    const result = await run;

    expect(result).toMatchObject({ ok: false, rolledBack: true });
    expect(state).toEqual({ favorite: false, note: 'newer' });
  });

  it('keeps a local retry for a failed current mutation', async () => {
    let state = { tagged: false };
    const issues = [];
    const persist = vi.fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({ ok: true, revision: 4 });
    const manager = createOptimisticMutationManager({
      getState: () => state,
      updateState: (update) => {
        state = update(state);
      },
      onIssuesChanged: (next) => {
        issues.splice(0, issues.length, ...next);
      }
    });

    await manager.execute({
      key: 'tag:manga-1:action',
      apply: (current) => ({ ...current, tagged: true }),
      createInversePatch: (before) => ({ tagged: before.tagged }),
      rollback: (current, inverse) => ({ ...current, tagged: inverse.tagged }),
      persist
    });
    expect(state.tagged).toBe(false);

    const result = await manager.retry(issues[0].id);
    expect(result.ok).toBe(true);
    expect(state.tagged).toBe(true);
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it('returns to the confirmed baseline when chained optimistic values both fail', async () => {
    let state = { favorite: false };
    const first = deferred();
    const second = deferred();
    const manager = createOptimisticMutationManager({
      getState: () => state,
      updateState: (update) => {
        state = update(state);
      }
    });
    const mutation = (favorite, pending) => ({
      key: 'favorite:manga-1',
      apply: (current) => ({ ...current, favorite }),
      createInversePatch: (current) => ({ favorite: current.favorite }),
      rollback: (current, patch) => ({ ...current, favorite: patch.favorite }),
      persist: () => pending.promise
    });

    const firstRun = manager.execute(mutation(true, first));
    const secondRun = manager.execute(mutation(false, second));
    second.reject(new Error('second failed'));
    await secondRun;
    expect(state.favorite).toBe(false);
    first.reject(new Error('first failed'));
    await firstRun;

    expect(state.favorite).toBe(false);
  });

  it('reconciles to an older confirmed write when the superseding write already failed', async () => {
    let state = { favorite: false };
    const first = deferred();
    const second = deferred();
    const manager = createOptimisticMutationManager({
      getState: () => state,
      updateState: (update) => {
        state = update(state);
      }
    });
    const mutation = (favorite, pending) => ({
      key: 'favorite:manga-1',
      apply: (current) => ({ ...current, favorite }),
      createInversePatch: (current) => ({ favorite: current.favorite }),
      rollback: (current, patch) => ({ ...current, favorite: patch.favorite }),
      persist: () => pending.promise
    });

    const firstRun = manager.execute(mutation(true, first));
    const secondRun = manager.execute(mutation(false, second));
    second.reject(new Error('second failed'));
    await secondRun;
    first.resolve({ ok: true, revision: 9 });
    await firstRun;

    expect(state.favorite).toBe(true);
  });
});

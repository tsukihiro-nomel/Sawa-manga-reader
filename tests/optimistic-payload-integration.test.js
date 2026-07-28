import { describe, expect, it } from 'vitest';
import { createOptimisticMutationManager } from '../src/utils/optimisticMutationManager.js';
import {
  applyChapterReadMutation,
  applyFavoriteMutation,
  captureReadMutationSnapshot,
  restoreReadMutationSnapshot
} from '../src/utils/payloadMutations.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function payload() {
  const manga = {
    id: 'manga-1',
    isFavorite: false,
    isRead: false,
    readingState: 'never',
    progressPercent: 0,
    chapters: [
      { id: 'chapter-1', pageCount: 10, isRead: false, readingState: 'never', progress: null },
      { id: 'chapter-2', pageCount: 10, isRead: false, readingState: 'never', progress: null }
    ]
  };
  return {
    persisted: { favorites: {} },
    library: { allMangas: [manga], categories: [], favorites: [], recents: [] },
    vaultLibrary: { allMangas: [], categories: [], favorites: [], recents: [] }
  };
}

describe('optimistic payload integration', () => {
  it('reconciles rapid favorite toggles to the late persisted A value when B fails', async () => {
    let state = payload();
    const first = deferred();
    const second = deferred();
    const manager = createOptimisticMutationManager({
      getState: () => state,
      updateState: (update) => {
        state = update(state);
      }
    });
    const captureFavorite = (current) => ({
      isFavorite: Boolean(current.library.allMangas[0].isFavorite)
    });
    const mutation = (isFavorite, pending) => ({
      key: 'favorite:manga-1',
      apply: (current) => applyFavoriteMutation(current, 'manga-1', isFavorite),
      captureInverse: captureFavorite,
      captureApplied: captureFavorite,
      rollback: (current, patch) => applyFavoriteMutation(current, 'manga-1', patch.isFavorite),
      persist: () => pending.promise
    });

    const firstRun = manager.execute(mutation(true, first));
    const secondRun = manager.execute(mutation(false, second));
    second.reject(new Error('B failed'));
    await secondRun;
    first.resolve({ ok: true, revision: 10 });
    await firstRun;

    expect(state.library.allMangas[0].isFavorite).toBe(true);
    expect(state.persisted.favorites['manga-1']).toBe(true);
  });

  it('isolates concurrent chapter confirmations and rollbacks', async () => {
    let state = payload();
    const first = deferred();
    const second = deferred();
    const manager = createOptimisticMutationManager({
      getState: () => state,
      updateState: (update) => {
        state = update(state);
      }
    });
    const mutation = (chapterId, pending) => {
      const capture = (current) => captureReadMutationSnapshot(current, 'manga-1', [chapterId]);
      return {
        key: `reading:manga-1:${chapterId}`,
        apply: (current) => applyChapterReadMutation(current, 'manga-1', chapterId, true, 10),
        captureInverse: capture,
        captureApplied: capture,
        rollback: (current, snapshot) => restoreReadMutationSnapshot(current, snapshot),
        persist: () => pending.promise
      };
    };

    const firstRun = manager.execute(mutation('chapter-1', first));
    const secondRun = manager.execute(mutation('chapter-2', second));
    second.reject(new Error('chapter 2 failed'));
    await secondRun;
    first.resolve({ ok: true, revision: 20 });
    await firstRun;

    const [chapter1, chapter2] = state.library.allMangas[0].chapters;
    expect(chapter1.isRead).toBe(true);
    expect(chapter2.isRead).toBe(false);
  });
});

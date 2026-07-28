import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReaderSessionStore } from '../src/interfaces/kavita/readerSessionStore.js';

describe('ReaderSessionStore', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('persists only the latest progress without committing the global payload during reading', async () => {
    const persistProgress = vi.fn(async () => {});
    const commitProgress = vi.fn();
    const store = createReaderSessionStore({ persistProgress, commitProgress, progressDelay: 180 });

    store.stageProgress({ chapterId: 'chapter-1', pageIndex: 2 });
    store.stageProgress({ chapterId: 'chapter-1', pageIndex: 8 });
    await vi.advanceTimersByTimeAsync(180);

    expect(persistProgress).toHaveBeenCalledTimes(1);
    expect(persistProgress).toHaveBeenCalledWith({ chapterId: 'chapter-1', pageIndex: 8 });
    expect(commitProgress).not.toHaveBeenCalled();
  });

  it('flushes pending progress and commits it once when leaving the reader', async () => {
    const persistProgress = vi.fn(async () => {});
    const commitProgress = vi.fn();
    const store = createReaderSessionStore({ persistProgress, commitProgress, progressDelay: 500 });
    const payload = { chapterId: 'chapter-2', pageIndex: 14 };

    store.stageProgress(payload, { tabId: 'tab-1' });
    await store.flush({ commit: true });
    await store.flush({ commit: true });

    expect(persistProgress).toHaveBeenCalledTimes(1);
    expect(commitProgress).toHaveBeenCalledTimes(1);
    expect(commitProgress).toHaveBeenCalledWith(payload, { tabId: 'tab-1', incognito: false });
  });

  it('never writes incognito progress to disk but still commits the tab position', async () => {
    const persistProgress = vi.fn(async () => {});
    const commitProgress = vi.fn();
    const store = createReaderSessionStore({ persistProgress, commitProgress });

    store.stageProgress({ chapterId: 'private', pageIndex: 3 }, { tabId: 'tab-private', incognito: true });
    await store.flush({ commit: true });

    expect(persistProgress).not.toHaveBeenCalled();
    expect(commitProgress).toHaveBeenCalledWith(
      { chapterId: 'private', pageIndex: 3 },
      { tabId: 'tab-private', incognito: true }
    );
  });

  it('buffers Kavita settings independently from the application payload', async () => {
    const persistSettings = vi.fn(async () => {});
    const commitSettings = vi.fn();
    const store = createReaderSessionStore({ persistSettings, commitSettings, settingsDelay: 200 });

    store.stageSettings({ mode: 'single', fitMode: 'fit-height', zoom: 1 });
    store.stageSettings({ mode: 'webtoon', fitMode: 'fit-width', zoom: 0.9 });
    await vi.advanceTimersByTimeAsync(200);

    expect(persistSettings).toHaveBeenCalledTimes(1);
    expect(persistSettings).toHaveBeenCalledWith({ mode: 'webtoon', fitMode: 'fit-width', zoom: 0.9 });
    expect(commitSettings).not.toHaveBeenCalled();
  });

  it('still commits the local session when a light persistence call fails', async () => {
    const persistProgress = vi.fn(async () => {
      throw new Error('disk unavailable');
    });
    const commitProgress = vi.fn();
    const store = createReaderSessionStore({ persistProgress, commitProgress });
    const payload = { chapterId: 'chapter-3', pageIndex: 6 };

    store.stageProgress(payload, { tabId: 'tab-3' });
    const result = await store.flush({ commit: true });

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(commitProgress).toHaveBeenCalledWith(payload, { tabId: 'tab-3', incognito: false });
  });

  it('reports timer persistence failures with a retry instead of swallowing them', async () => {
    const onPersistenceError = vi.fn();
    const persistProgress = vi.fn()
      .mockRejectedValueOnce(new Error('disk unavailable'))
      .mockResolvedValueOnce({ ok: true, revision: 3 });
    const store = createReaderSessionStore({
      persistProgress,
      onPersistenceError,
      progressDelay: 100
    });

    store.stageProgress({ chapterId: 'chapter-retry', pageIndex: 4 });
    await vi.advanceTimersByTimeAsync(100);

    expect(onPersistenceError).toHaveBeenCalledTimes(1);
    const issue = onPersistenceError.mock.calls[0][0];
    expect(issue).toMatchObject({ kind: 'progress', revision: 1 });
    await expect(issue.retry()).resolves.toMatchObject({ ok: true });
    expect(persistProgress).toHaveBeenCalledTimes(2);
  });

  it('ignores a superseded timer failure after newer progress has been staged', async () => {
    const onPersistenceError = vi.fn();
    const first = deferred();
    const persistProgress = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce({ ok: true, revision: 4 });
    const store = createReaderSessionStore({
      persistProgress,
      onPersistenceError,
      progressDelay: 100
    });

    store.stageProgress({ chapterId: 'chapter-1', pageIndex: 1 });
    await vi.advanceTimersByTimeAsync(100);
    store.stageProgress({ chapterId: 'chapter-1', pageIndex: 2 });
    first.reject(new Error('old write failed'));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);

    expect(onPersistenceError).not.toHaveBeenCalled();
    expect(persistProgress).toHaveBeenCalledTimes(2);
  });

  it('treats an explicit MutationResult failure as a persistence error', async () => {
    const onPersistenceError = vi.fn();
    const store = createReaderSessionStore({
      persistSettings: vi.fn().mockResolvedValue({ ok: false, error: 'read only' }),
      onPersistenceError,
      settingsDelay: 100
    });

    store.stageSettings({ mode: 'webtoon' });
    await vi.advanceTimersByTimeAsync(100);

    expect(onPersistenceError).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'settings',
      error: expect.objectContaining({ message: 'read only' })
    }));
  });

  it.each([
    ['progress', 'stageProgress', 'persistProgress', { chapterId: 'chapter-1', pageIndex: 1 }, { chapterId: 'chapter-1', pageIndex: 2 }],
    ['settings', 'stageSettings', 'persistSettings', { mode: 'single' }, { mode: 'webtoon' }]
  ])('clears stale %s notices when a newer revision succeeds', async (
    kind,
    stageMethod,
    persistOption,
    firstPayload,
    secondPayload
  ) => {
    const notices = [];
    const persist = vi.fn()
      .mockRejectedValueOnce(new Error('r1 failed'))
      .mockResolvedValueOnce({ ok: true, revision: 2 });
    const store = createReaderSessionStore({
      [persistOption]: persist,
      progressDelay: 100,
      settingsDelay: 100,
      onPersistenceError: (failure) => {
        notices.push({ kind: failure.kind, revision: failure.revision });
      },
      onPersistenceSuccess: (success) => {
        for (let index = notices.length - 1; index >= 0; index -= 1) {
          if (notices[index].kind === success.kind) notices.splice(index, 1);
        }
      }
    });

    store[stageMethod](firstPayload);
    await vi.advanceTimersByTimeAsync(100);
    expect(notices).toEqual([{ kind, revision: 1 }]);

    store[stageMethod](secondPayload);
    await vi.advanceTimersByTimeAsync(100);
    expect(notices).toEqual([]);
  });
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

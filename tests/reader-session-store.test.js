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
});

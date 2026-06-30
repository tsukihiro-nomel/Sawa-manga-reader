import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { LibraryWatcher } = require('../electron/services/watcher.cjs');

afterEach(() => {
  vi.useRealTimers();
});

describe('LibraryWatcher on Windows', () => {
  it('uses one recursive native watcher per library root without indexing every file', () => {
    vi.useFakeTimers();
    const nativeCallbacks = [];
    const nativeWatchers = [];
    const fsImpl = {
      watch: vi.fn((_root, options, callback) => {
        nativeCallbacks.push(callback);
        const nativeWatcher = { on: vi.fn(), close: vi.fn() };
        nativeWatchers.push(nativeWatcher);
        expect(options).toEqual({ recursive: true });
        return nativeWatcher;
      })
    };
    const chokidarImpl = { watch: vi.fn(() => { throw new Error('chokidar should not run on Windows'); }) };
    const onChange = vi.fn();
    const watcher = new LibraryWatcher({ platform: 'win32', fsImpl, chokidarImpl });

    watcher.restart(['C:\\Manga', 'D:\\Comics'], onChange);

    expect(fsImpl.watch).toHaveBeenCalledTimes(2);
    expect(chokidarImpl.watch).not.toHaveBeenCalled();

    nativeCallbacks[0]('rename', 'Series\\Chapter\\001.jpg');
    vi.advanceTimersByTime(1_000);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0]).toMatchObject({
      path: 'C:\\Manga\\Series\\Chapter\\001.jpg',
      kinds: ['rename']
    });

    watcher.close();
    expect(nativeWatchers.every((entry) => entry.close.mock.calls.length === 1)).toBe(true);
  });
});

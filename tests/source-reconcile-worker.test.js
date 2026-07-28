import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { reconcileSourceLinksInWorker } = require('../electron/services/sourceLinkReconcileWorker.cjs');

describe('source reconciliation worker', () => {
  it('returns asynchronously without occupying the caller event loop', async () => {
    class FakeWorker {
      constructor(_path, options) {
        this.options = options;
        this.listeners = new Map();
        setImmediate(() => this.listeners.get('message')?.({ ok: true, changed: false, linkCount: 0 }));
      }

      once(name, callback) {
        this.listeners.set(name, callback);
      }
    }

    let yielded = false;
    const resultPromise = reconcileSourceLinksInWorker([{ id: 'manga-1' }], {
      WorkerClass: FakeWorker,
      userDataPath: 'C:\\data'
    });
    await new Promise((resolve) => setImmediate(() => {
      yielded = true;
      resolve();
    }));

    expect(yielded).toBe(true);
    await expect(resultPromise).resolves.toMatchObject({ changed: false, linkCount: 0 });
  });
});

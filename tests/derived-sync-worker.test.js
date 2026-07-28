import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { patchLibrarySnapshotInWorker } = require('../electron/services/derivedSyncWorker.cjs');

class FakeWorker extends EventEmitter {
  static instances = [];

  constructor(workerPath, options) {
    super();
    this.workerPath = workerPath;
    this.options = options;
    FakeWorker.instances.push(this);
  }
}

describe('derived snapshot worker', () => {
  it('passes the snapshot and isolated user-data path to a worker', async () => {
    FakeWorker.instances = [];
    const library = { allMangas: [{ id: 'manga-1' }] };
    const promise = patchLibrarySnapshotInWorker(library, { annotationsByManga: {} }, {
      WorkerClass: FakeWorker,
      userDataPath: 'C:/Temp/Sawa-Test'
    });
    const worker = FakeWorker.instances[0];

    expect(worker.options.workerData).toMatchObject({
      library,
      userDataPath: 'C:/Temp/Sawa-Test'
    });
    worker.emit('message', { ok: true, result: { itemCount: 1 } });

    await expect(promise).resolves.toEqual({ itemCount: 1 });
  });

  it('keeps the interactive derived timer off the Electron main thread', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'electron', 'main.cjs'), 'utf8');
    const scheduleBody = source.match(/function scheduleInteractiveDerivedSync[\s\S]*?\n}\n\nfunction buildInteractivePayload/)?.[0] || '';

    expect(source).toContain('patchLibrarySnapshotInWorker');
    expect(scheduleBody).not.toContain('patchLibrarySnapshot(rawLibrary');
  });
});

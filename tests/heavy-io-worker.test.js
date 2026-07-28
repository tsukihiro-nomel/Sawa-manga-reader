import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  getActiveHeavyIoWorkerCount,
  runHeavyIoTask,
  shutdownHeavyIoWorkers
} = require('../electron/services/heavyIoClient.cjs');
const { validateCbz } = require('../electron/services/archiveExport.cjs');
const tempDirs = [];
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

afterEach(() => {
  tempDirs.splice(0).forEach((directory) => fs.rmSync(directory, { recursive: true, force: true }));
});

describe('heavy I/O worker boundary', () => {
  it('exports and validates an archive outside the caller thread while forwarding progress', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-heavy-worker-'));
    tempDirs.push(root);
    const chapterDir = path.join(root, 'chapter');
    const targetPath = path.join(root, 'chapter.cbz');
    fs.mkdirSync(chapterDir);
    fs.writeFileSync(path.join(chapterDir, '001.png'), ONE_PIXEL_PNG);
    const progress = [];

    const result = await runHeavyIoTask('archive-export', {
      sourcePath: chapterDir,
      targetPath,
      record: { title: 'Worker export' }
    }, {
      onProgress: (entry) => progress.push(entry)
    });

    expect(result).toMatchObject({ ok: true, path: targetPath });
    await expect(validateCbz(targetPath)).resolves.toMatchObject({
      imageCount: 1,
      comicInfoCount: 1
    });
    expect(progress.at(-1)).toMatchObject({ phase: 'done', percent: 100 });
  });

  it('runs backup packaging and validation through the same worker service', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-heavy-backup-'));
    tempDirs.push(root);
    const targetPath = path.join(root, 'backup.sawa-backup');

    await expect(runHeavyIoTask('backup-export', {
      targetPath,
      state: { version: 4, favorites: { worker: true } }
    })).resolves.toMatchObject({ ok: true, path: targetPath });

    const staged = await runHeavyIoTask('backup-stage', { filePath: targetPath });
    expect(staged).toMatchObject({
      ok: true,
      legacy: false,
      state: { favorites: { worker: true } }
    });
    await runHeavyIoTask('backup-cleanup', { staged });
    expect(fs.existsSync(staged.stagingDir)).toBe(false);
  });

  it('isolates exceptions thrown by progress observers from the worker result', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-heavy-progress-'));
    tempDirs.push(root);
    const chapterDir = path.join(root, 'chapter');
    const targetPath = path.join(root, 'chapter.cbz');
    fs.mkdirSync(chapterDir);
    fs.writeFileSync(path.join(chapterDir, '001.png'), ONE_PIXEL_PNG);

    await expect(runHeavyIoTask('archive-export', {
      sourcePath: chapterDir,
      targetPath,
      record: { title: 'Observer isolation' }
    }, {
      onProgress: () => { throw new Error('observer crashed'); }
    })).resolves.toMatchObject({ ok: true, path: targetPath });
  });

  it('rejects a worker that exits cleanly without returning a result', async () => {
    class ExitZeroWorker extends EventEmitter {
      constructor() {
        super();
        queueMicrotask(() => this.emit('exit', 0));
      }

      postMessage() {}

      terminate() {
        return Promise.resolve(0);
      }
    }

    await expect(runHeavyIoTask('no-result', {}, { WorkerImpl: ExitZeroWorker }))
      .rejects.toThrow(/without returning a result/i);
    expect(getActiveHeavyIoWorkerCount()).toBe(0);
  });

  it('aborts and unregisters active workers within the shutdown deadline', async () => {
    let terminated = false;
    class HangingWorker extends EventEmitter {
      postMessage() {}

      terminate() {
        terminated = true;
        return Promise.resolve(1);
      }
    }

    const task = runHeavyIoTask('hang', {}, {
      WorkerImpl: HangingWorker,
      abortTimeoutMs: 50
    });
    const rejectedTask = expect(task).rejects.toMatchObject({
      name: 'AbortError',
      interrupted: true
    });
    expect(getActiveHeavyIoWorkerCount()).toBe(1);
    await expect(shutdownHeavyIoWorkers({ timeoutMs: 50 })).resolves.toMatchObject({
      requested: 1,
      remaining: 0
    });
    await rejectedTask;
    expect(terminated).toBe(true);
    expect(getActiveHeavyIoWorkerCount()).toBe(0);
  });
});

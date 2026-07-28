import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);

class FakeUtilityProcess extends EventEmitter {
  constructor(onPost) {
    super();
    this.onPost = onPost;
    this.kill = vi.fn();
  }

  postMessage(message) {
    this.onPost(message, this);
  }
}

describe('thumbnail utility process pool', () => {
  it('keeps sharp decoding and PNG encoding outside the Electron main process', () => {
    const mainSource = fs.readFileSync('electron/main.cjs', 'utf8');
    const workerSource = fs.readFileSync('electron/services/thumbnailUtilityWorker.cjs', 'utf8');
    const thumbnailFactory = mainSource.slice(
      mainSource.indexOf('function getThumbnailCache()'),
      mainSource.indexOf('async function createThumbnailAssetResponse')
    );

    expect(thumbnailFactory).toContain('createThumbnailUtilityPool');
    expect(thumbnailFactory).not.toContain('nativeImage');
    expect(workerSource).toContain("require('sharp')");
    expect(workerSource).toContain('.toBuffer()');
    expect(workerSource).not.toContain('nativeImage');
  });

  it('keeps at most two persistent utility children active', async () => {
    const { createThumbnailUtilityPool } = require('../electron/services/thumbnailUtilityClient.cjs');
    const pending = [];
    const children = [];
    const forkImpl = vi.fn(() => {
      const child = new FakeUtilityProcess((message, sender) => pending.push({ message, sender }));
      children.push(child);
      return child;
    });
    const pool = createThumbnailUtilityPool({ forkImpl, maxConcurrent: 2 });

    const tasks = [1, 2, 3].map((index) => pool.generateThumbnail({
      sourcePath: `source-${index}`,
      targetPath: `target-${index}`
    }));
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    expect(children).toHaveLength(2);
    for (const entry of pending.splice(0, 2)) {
      entry.sender.emit('message', {
        type: 'result',
        requestId: entry.message.requestId,
        targetPath: entry.message.payload.targetPath
      });
    }
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    const last = pending.shift();
    last.sender.emit('message', {
      type: 'result',
      requestId: last.message.requestId,
      targetPath: last.message.payload.targetPath
    });

    await expect(Promise.all(tasks)).resolves.toEqual(['target-1', 'target-2', 'target-3']);
    expect(forkImpl).toHaveBeenCalledTimes(2);
    await pool.shutdown();
  });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it } from 'vitest';

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
});

function runWithoutElectron(targetModule, workerData = {}) {
  const fixture = path.join(process.cwd(), 'tests', 'fixtures', 'worker-without-electron.cjs');
  return new Promise((resolve, reject) => {
    const worker = new Worker(fixture, {
      workerData: {
        ...workerData,
        targetModule: path.join(process.cwd(), 'electron', 'services', targetModule)
      }
    });
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
}

describe('packaged worker runtime', () => {
  it('runs the library scanner when the Electron module is unavailable', async () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-packaged-scan-'));
    tempDirs.push(userDataPath);

    await expect(runWithoutElectron('libraryScanWorker.cjs', {
      userDataPath,
      persistedState: { categories: [] }
    })).resolves.toMatchObject({
      ok: true,
      library: { allMangas: [] }
    });
  });

  it('runs the derived sync worker when the Electron module is unavailable', async () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-packaged-derived-'));
    tempDirs.push(userDataPath);

    await expect(runWithoutElectron('derivedSyncWorker.cjs', {
      userDataPath,
      library: { allMangas: [], categories: [], favorites: [], recents: [] },
      options: {}
    })).resolves.toMatchObject({
      ok: true,
      result: { itemCount: 0 }
    });
  });
});

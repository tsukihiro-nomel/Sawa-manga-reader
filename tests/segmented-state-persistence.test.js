import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const storagePath = require.resolve('../electron/services/storage.cjs');
const tempDirs = [];

afterEach(() => {
  delete process.env.SAWA_USER_DATA_PATH;
  delete require.cache[storagePath];
  tempDirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
});

describe('segmented state persistence', () => {
  it('writes only the dirty storage segment for a light mutation', async () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-segmented-state-'));
    tempDirs.push(userDataPath);
    process.env.SAWA_USER_DATA_PATH = userDataPath;
    delete require.cache[storagePath];
    const storage = require('../electron/services/storage.cjs');

    storage.loadState();
    await storage.flushStateWrites();
    const rootPath = storage.getStatePath();
    const storePaths = storage.getUserDataStorePaths();
    const rootMtime = fs.statSync(rootPath).mtimeMs;
    const metadataMtime = fs.statSync(storePaths.metadata).mtimeMs;

    await new Promise((resolve) => setTimeout(resolve, 20));
    storage.updateStateSegments({ organization: ['favorites'] }, (state) => {
      state.favorites['manga-fast'] = true;
      return state;
    });
    await storage.flushStateWrites();

    const organization = JSON.parse(fs.readFileSync(storePaths.organization, 'utf8'));
    expect(organization.favorites['manga-fast']).toBe(true);
    expect(fs.statSync(rootPath).mtimeMs).toBe(rootMtime);
    expect(fs.statSync(storePaths.metadata).mtimeMs).toBe(metadataMtime);
  });
});

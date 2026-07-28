import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  clearShutdownMarker,
  flushWithDeadline,
  readLastValidSnapshot,
  readShutdownMarker,
  writeLastValidSnapshot,
  writeShutdownMarker
} = require('../electron/services/appReliability.cjs');
const tempDirs = [];

afterEach(() => {
  tempDirs.splice(0).forEach((directory) => fs.rmSync(directory, { recursive: true, force: true }));
});

describe('application reliability markers', () => {
  it('accepts shutdown only when both persistence flushes succeed', async () => {
    await expect(flushWithDeadline({
      flushState: async () => true,
      flushSources: async () => false,
      timeoutMs: 500
    })).resolves.toMatchObject({
      ok: false,
      timedOut: false,
      stateFlushed: true,
      sourcesFlushed: false
    });
  });

  it('bounds a hung shutdown flush and persists a readable marker', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-shutdown-'));
    tempDirs.push(root);
    const result = await flushWithDeadline({
      flushState: () => new Promise(() => {}),
      flushSources: async () => true,
      timeoutMs: 100
    });
    expect(result).toMatchObject({ ok: false, timedOut: true });

    writeShutdownMarker(root, result);
    expect(readShutdownMarker(root)).toMatchObject({ ok: false, timedOut: true });
    clearShutdownMarker(root);
    expect(readShutdownMarker(root)).toBeNull();
  });

  it('stores a last-valid state snapshot independently from the live state', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-snapshot-'));
    tempDirs.push(root);
    const filePath = writeLastValidSnapshot(root, { version: 4, favorites: { safe: true } });
    expect(JSON.parse(fs.readFileSync(filePath, 'utf8'))).toMatchObject({
      version: 4,
      favorites: { safe: true }
    });
    expect(readLastValidSnapshot(root)).toMatchObject({
      path: filePath,
      state: {
        version: 4,
        favorites: { safe: true }
      }
    });
  });

  it('wires safe mode to the last-valid snapshot as a read-only runtime state', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-safe-mode-'));
    tempDirs.push(root);
    writeLastValidSnapshot(root, { version: 4, favorites: { safe: true } });
    const snapshot = readLastValidSnapshot(root);
    const storageModulePath = require.resolve('../electron/services/storage.cjs');
    const previousUserDataPath = process.env.SAWA_USER_DATA_PATH;
    process.env.SAWA_USER_DATA_PATH = root;
    delete require.cache[storageModulePath];
    const storage = require(storageModulePath);
    storage.activateRuntimeStateOverride(snapshot.state, { readOnly: true });
    expect(storage.loadState()).toMatchObject({ favorites: { safe: true } });
    storage.saveState({ version: 4, favorites: { changedOnlyInMemory: true } });
    expect(fs.existsSync(storage.getStatePath())).toBe(false);
    delete require.cache[storageModulePath];
    if (previousUserDataPath === undefined) delete process.env.SAWA_USER_DATA_PATH;
    else process.env.SAWA_USER_DATA_PATH = previousUserDataPath;

    const mainSource = fs.readFileSync(path.resolve('electron/main.cjs'), 'utf8');
    expect(mainSource).toContain('readLastValidSnapshot(getUserDataPath())');
    expect(mainSource).toContain('activateRuntimeStateOverride(safeModeSnapshot.state, { readOnly: true })');
    expect(mainSource).toContain('safeModeSnapshotLoaded');
    expect(mainSource).toContain('const restored = await importBackup(backupPath)');
  });
});

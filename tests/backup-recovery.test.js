import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const tempDirs = [];
const storageModulePath = require.resolve('../electron/services/storage.cjs');
const {
  getCoverTransactionJournalPath
} = require('../electron/services/backupPackage.cjs');

afterEach(() => {
  delete require.cache[storageModulePath];
  tempDirs.splice(0).forEach((directory) => fs.rmSync(directory, { recursive: true, force: true }));
});

describe('backup import crash recovery', () => {
  it('serializes concurrent backup imports across their complete transaction', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-import-mutex-'));
    tempDirs.push(root);
    const previousUserDataPath = process.env.SAWA_USER_DATA_PATH;
    process.env.SAWA_USER_DATA_PATH = root;
    delete require.cache[storageModulePath];
    const { serializeBackupImport } = require(storageModulePath);
    const events = [];
    let releaseFirst;
    const firstGate = new Promise((resolve) => { releaseFirst = resolve; });

    try {
      const first = serializeBackupImport(async () => {
        events.push('first:start');
        await firstGate;
        events.push('first:end');
        return 'first';
      });
      const second = serializeBackupImport(async () => {
        events.push('second:start');
        events.push('second:end');
        return 'second';
      });

      await Promise.resolve();
      expect(events).toEqual(['first:start']);
      releaseFirst();
      await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
      expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
    } finally {
      if (previousUserDataPath === undefined) delete process.env.SAWA_USER_DATA_PATH;
      else process.env.SAWA_USER_DATA_PATH = previousUserDataPath;
    }
  });

  it('restores both the pre-import state and managed covers from durable journals', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-import-recovery-'));
    tempDirs.push(root);
    const previousUserDataPath = process.env.SAWA_USER_DATA_PATH;
    process.env.SAWA_USER_DATA_PATH = root;
    delete require.cache[storageModulePath];
    const storage = require(storageModulePath);

    try {
      storage.saveState({
        ...structuredClone(storage.DEFAULT_STATE),
        favorites: { before: true }
      });
      expect(await storage.flushStateWrites()).toBe(true);
      const preImportBackup = storage.createBackup('recovery-test');

      storage.saveState({
        ...structuredClone(storage.DEFAULT_STATE),
        favorites: { imported: true }
      });
      expect(await storage.flushStateWrites()).toBe(true);

      const managedCoverDir = storage.getManagedCoverDir();
      fs.writeFileSync(path.join(managedCoverDir, 'original.jpg'), 'original');
      const rollbackDir = `${managedCoverDir}.rollback-test`;
      fs.renameSync(managedCoverDir, rollbackDir);
      fs.mkdirSync(managedCoverDir);
      fs.writeFileSync(path.join(managedCoverDir, 'partial.jpg'), 'partial');
      fs.writeFileSync(getCoverTransactionJournalPath(managedCoverDir), JSON.stringify({
        version: 1,
        phase: 'covers-replaced',
        managedCoverDir,
        rollbackDir,
        movedCurrent: true
      }));
      fs.writeFileSync(storage.getBackupImportJournalPath(), JSON.stringify({
        version: 1,
        phase: 'prepared',
        preImportBackupPath: preImportBackup.path
      }));

      expect(storage.recoverIncompleteBackupImport()).toMatchObject({
        recovered: true,
        committed: false
      });
      expect(storage.loadState()).toMatchObject({ favorites: { before: true } });
      expect(fs.readdirSync(managedCoverDir)).toEqual(['original.jpg']);
      expect(fs.existsSync(storage.getBackupImportJournalPath())).toBe(false);
      expect(fs.existsSync(getCoverTransactionJournalPath(managedCoverDir))).toBe(false);
    } finally {
      if (previousUserDataPath === undefined) delete process.env.SAWA_USER_DATA_PATH;
      else process.env.SAWA_USER_DATA_PATH = previousUserDataPath;
    }
  });
});

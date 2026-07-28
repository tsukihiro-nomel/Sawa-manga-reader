import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
});

describe('Electron scan jobs', () => {
  it('run the disk scanner through the worker-backed scan coordinator', () => {
    const mainSource = fs.readFileSync(path.join(process.cwd(), 'electron/main.cjs'), 'utf8');

    expect(mainSource).toMatch(/scanLibraryInWorker/);
    expect(mainSource).toMatch(/async function runLibraryJob[\s\S]{0,500}await requestLibraryScan/);
  });

  it('does not immediately repeat manual scans on the Electron main thread', () => {
    const mainSource = fs.readFileSync(path.join(process.cwd(), 'electron/main.cjs'), 'utf8');
    const forceRescanHandler = mainSource.match(/ipcMain\.handle\('library:forceRescan'[\s\S]*?\n}\);/)?.[0] || '';
    const deepScanHandler = mainSource.match(/ipcMain\.handle\('library:runDeepScan'[\s\S]*?\n}\);/)?.[0] || '';

    expect(forceRescanHandler).not.toContain('buildStatePayload()');
    expect(forceRescanHandler).toContain('buildInteractivePayload');
    expect(deepScanHandler).not.toContain('buildStatePayload()');
    expect(deepScanHandler).toContain('buildInteractivePayload');
  });

  it('returns a compact manual-scan result when the disk index is unchanged', () => {
    const mainSource = fs.readFileSync(path.join(process.cwd(), 'electron/main.cjs'), 'utf8');
    const appSource = fs.readFileSync(path.join(process.cwd(), 'src/App.jsx'), 'utf8');
    const forceRescanHandler = mainSource.match(/ipcMain\.handle\('library:forceRescan'[\s\S]*?\n}\);/)?.[0] || '';

    expect(mainSource).toMatch(/checkpoint\(\{[\s\S]{0,160}diskChanged/);
    expect(forceRescanHandler).toMatch(/getJob\([\s\S]{0,240}diskChanged\s*===\s*false/);
    expect(forceRescanHandler).toMatch(/changed:\s*false/);
    expect(appSource).not.toMatch(/refreshWith\(window\.mangaAPI\.forceRescan\(\)\)/);
    expect(appSource).toMatch(/result\?\.payload/);
  });

  it('keeps maintenance and structural IPC scans off the main thread', () => {
    const mainSource = fs.readFileSync(path.join(process.cwd(), 'electron/main.cjs'), 'utf8');

    expect(mainSource).toMatch(/async function buildInteractivePayloadAsync/);
    expect(mainSource).toMatch(/async function buildPayloadAfterStructuralScan/);
    expect(mainSource).not.toMatch(/scanLibrary\(loadState\(\)\)/);
    expect(mainSource.match(/buildStatePayload\(\)/g) || []).toHaveLength(0);
    expect(mainSource).toMatch(/ipcMain\.handle\('library:addCategories'[\s\S]{0,1200}await buildPayloadAfterStructuralScan/);
    expect(mainSource).toMatch(/ipcMain\.handle\('library:trashManga'[\s\S]{0,2400}buildPayloadAfterStructuralScan/);
    expect(mainSource).toMatch(/ipcMain\.handle\('maintenance:rebuildDerivedData'[\s\S]{0,900}buildInteractivePayloadAsync/);
  });

  it('returns scan results asynchronously without occupying the caller event loop', async () => {
    let workerModule = null;
    try {
      workerModule = require('../electron/services/libraryScanWorker.cjs');
    } catch (_error) {
      workerModule = null;
    }
    expect(typeof workerModule?.scanLibraryInWorker).toBe('function');

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-worker-scan-'));
    tempDirs.push(root);
    const mangaPath = path.join(root, 'Manga');
    fs.mkdirSync(mangaPath, { recursive: true });
    fs.writeFileSync(path.join(mangaPath, '001.jpg'), 'page');

    let yielded = false;
    const scanPromise = workerModule.scanLibraryInWorker({
      categories: [{ id: 'library', name: 'Library', path: root, hidden: false }]
    });
    await new Promise((resolve) => setImmediate(() => {
      yielded = true;
      resolve();
    }));

    expect(yielded).toBe(true);
    await expect(scanPromise).resolves.toMatchObject({
      allMangas: [{ displayTitle: 'Manga', pageCount: 1 }]
    });
  });

  it('returns only an unchanged marker when a reusable scan index still matches', async () => {
    const workerModule = require('../electron/services/libraryScanWorker.cjs');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-worker-scan-'));
    tempDirs.push(root);
    const mangaPath = path.join(root, 'Manga');
    fs.mkdirSync(mangaPath, { recursive: true });
    fs.writeFileSync(path.join(mangaPath, '001.jpg'), 'page');
    const persistedState = {
      categories: [{ id: 'library', name: 'Library', path: root, hidden: false }]
    };
    const first = await workerModule.scanLibraryInWorker(persistedState);
    const second = await workerModule.scanLibraryInWorker({
      ...persistedState,
      scanIndex: first.scanIndex
    }, { skipUnchanged: true });

    expect(second).toEqual({ unchanged: true });
  });
});

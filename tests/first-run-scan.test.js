import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  consumeFirstRunScanMarker,
  writeFirstRunScanMarker
} = require('../electron/services/firstRunScan.cjs');

describe('first run scan marker', () => {
  it('creates one category from the selected library path and queues a scan', () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-first-run-'));
    const libraryPath = path.join(userDataPath, 'Manga');
    fs.mkdirSync(libraryPath, { recursive: true });
    writeFirstRunScanMarker(userDataPath, libraryPath);

    const state = { categories: [] };
    const queued = [];
    const result = consumeFirstRunScanMarker({
      userDataPath,
      loadState: () => state,
      updateState: (fn) => fn(state),
      makeId: (_prefix, value) => 'category-' + path.basename(value),
      enqueueScan: (kind, payload) => queued.push({ kind, payload })
    });

    expect(result).toMatchObject({ consumed: true, categoryAdded: true });
    expect(state.categories).toEqual([{
      id: 'category-Manga',
      path: libraryPath,
      name: 'Manga',
      hidden: false
    }]);
    expect(queued).toEqual([{ kind: 'scan', payload: { source: 'first-run-scan' } }]);
    expect(fs.existsSync(path.join(userDataPath, 'first-run-scan.json'))).toBe(false);
  });

  it('does not duplicate an existing library category', () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-first-run-'));
    const libraryPath = path.join(userDataPath, 'Manga');
    fs.mkdirSync(libraryPath, { recursive: true });
    writeFirstRunScanMarker(userDataPath, libraryPath);

    const state = {
      categories: [{
        id: 'category-Manga',
        path: libraryPath,
        name: 'Manga',
        hidden: false
      }]
    };

    const result = consumeFirstRunScanMarker({
      userDataPath,
      loadState: () => state,
      updateState: (fn) => fn(state),
      makeId: () => 'duplicate',
      enqueueScan: () => {}
    });

    expect(result).toMatchObject({ consumed: true, categoryAdded: false });
    expect(state.categories).toHaveLength(1);
  });
});

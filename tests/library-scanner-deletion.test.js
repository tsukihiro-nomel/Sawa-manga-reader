import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { scanLibrary } = require('../electron/services/libraryScanner.cjs');
const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
});

describe('library scanner deletions', () => {
  it('drops a manga from the next snapshot after its folder is deleted', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-scan-delete-'));
    tempDirs.push(root);
    const mangaPath = path.join(root, 'Removed Series');
    fs.mkdirSync(mangaPath, { recursive: true });
    fs.writeFileSync(path.join(mangaPath, '001.jpg'), 'page');
    const persisted = {
      categories: [{ id: 'library', name: 'Library', path: root, hidden: false }]
    };

    const first = scanLibrary(persisted);
    expect(first.allMangas).toHaveLength(1);

    fs.rmSync(mangaPath, { recursive: true, force: true });
    const second = scanLibrary({ ...persisted, scanIndex: first.scanIndex });

    expect(second.allMangas).toEqual([]);
    expect(second.categories[0].mangas).toEqual([]);
    expect(Object.values(second.scanIndex.entries)).toEqual([]);
  });
});

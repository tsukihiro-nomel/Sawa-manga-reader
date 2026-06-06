import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { scanLibrary } = require('../electron/services/libraryScanner.cjs');

const tempDirs = [];

function makeFixtureLibrary() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-scan-'));
  tempDirs.push(root);
  const categoryPath = path.join(root, 'Shonen');
  const mangaPath = path.join(categoryPath, 'Sample Manga');
  const chapterPath = path.join(mangaPath, 'Chapter 01');
  fs.mkdirSync(chapterPath, { recursive: true });
  fs.writeFileSync(path.join(chapterPath, '001.jpg'), 'page-one');
  fs.writeFileSync(path.join(chapterPath, '002.jpg'), 'page-two');
  return { root, categoryPath };
}

function makePersistedState(categoryPath, scanIndex = null) {
  return {
    categories: [{ id: 'cat-shonen', path: categoryPath, name: 'Shonen', hidden: false }],
    scanIndex: scanIndex || { updatedAt: null, entries: [] },
    metadata: {},
    metadataLocks: {},
    metadataFieldSource: {},
    favorites: {},
    tags: {},
    mangaTags: {},
    mangaTagMeta: {},
    collections: {},
    smartCollections: {},
    annotations: {},
    readingStates: {},
    chapterStates: {},
    readStatus: {},
    chapterReadStatus: {},
    progress: {},
    pdfMeta: {},
    recents: [],
    knownChapterCounts: {},
    readerPrefs: {},
    vault: { privateMangaIds: [], privateCategoryIds: [], locked: false, stealthMode: false }
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe('scanLibrary scanIndex compatibility', () => {
  it('keeps content identities stable when previous scanIndex is stored as an object map', () => {
    const { categoryPath } = makeFixtureLibrary();
    const first = scanLibrary(makePersistedState(categoryPath));

    const firstManga = first.allMangas[0];
    const firstChapter = firstManga.chapters[0];
    const objectScanIndex = Object.fromEntries(
      first.scanIndex.entries.map((entry) => [entry.locationId, entry])
    );

    const second = scanLibrary(makePersistedState(categoryPath, {
      updatedAt: first.scanIndex.updatedAt,
      entries: objectScanIndex
    }));

    expect(second.allMangas).toHaveLength(1);
    expect(second.allMangas[0].contentId).toBe(firstManga.contentId);
    expect(second.allMangas[0].chapters[0].contentId).toBe(firstChapter.contentId);
  });
});

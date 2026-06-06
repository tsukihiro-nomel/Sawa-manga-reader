import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

const {
  analyzeLegacySnapshot,
  createCoreStore
} = require('../electron/services/coreStore.cjs');

function makeTempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-core-v2-'));
  return path.join(dir, 'sawa-core-v2.db');
}

function makeLegacyFixtures() {
  const chapter = {
    id: 'chapter-1',
    contentId: 'chapter-content-1',
    locationId: 'chapter-location-1',
    name: 'Chapitre 1',
    path: 'C:/Manga/Series/Chapitre 1',
    pageCount: 12,
    pages: [
      { index: 0, path: 'C:/Manga/Series/Chapitre 1/001.jpg', mediaType: 'image' },
      { index: 1, path: 'C:/Manga/Series/Chapitre 1/002.jpg', mediaType: 'image' }
    ],
    progress: { pageIndex: 5, pageCount: 12 },
    readingState: 'in-progress',
    isRead: false
  };
  const manga = {
    id: 'manga-1',
    contentId: 'manga-content-1',
    locationId: 'manga-location-1',
    name: 'Series',
    displayTitle: 'Series Deluxe',
    author: 'Sawa',
    description: 'Migrated from legacy JSON',
    path: 'C:/Manga/Series',
    categoryId: 'cat-1',
    categoryName: 'Manga',
    pageCount: 12,
    chapterCount: 1,
    progressPercent: 50,
    readingState: 'in-progress',
    isFavorite: true,
    chapters: [chapter],
    tags: [{ id: 'tag-action', name: 'Action', color: '#ef4444' }],
    collectionIds: ['col-main']
  };
  const persistedState = {
    version: 3,
    stateVersion: 3,
    categories: [{ id: 'cat-1', name: 'Manga', path: 'C:/Manga', hidden: false }],
    favorites: { 'manga-1': true },
    tags: { 'tag-action': { id: 'tag-action', name: 'Action', color: '#ef4444' } },
    mangaTags: { 'manga-1': ['tag-action'] },
    collections: {
      'col-main': { id: 'col-main', name: 'A lire', description: 'Pile', color: '#10b981', mangaIds: ['manga-1'] }
    },
    smartCollections: {
      'smart-favorites': { id: 'smart-favorites', name: 'Favoris', rules: { type: 'favorites' } }
    },
    progress: {
      'chapter-1': {
        mangaId: 'manga-1',
        chapterId: 'chapter-1',
        pageIndex: 5,
        pageCount: 12,
        lastReadAt: '2026-06-01T10:00:00.000Z'
      }
    },
    readStatus: { 'manga-1': false },
    chapterReadStatus: { 'chapter-1': false },
    recents: [{ mangaId: 'manga-1', chapterId: 'chapter-1', lastReadAt: '2026-06-01T10:00:00.000Z' }],
    metadata: { 'manga-1': { title: 'Series Deluxe', author: 'Sawa' } },
    annotations: {
      'manga-1': [{ id: 'ann-1', chapterId: 'chapter-1', pageIndex: 2, text: 'Note' }]
    },
    vault: { privateMangaIds: ['manga-private'], privateCategoryIds: [] },
    readerPrefs: { global: { scaling: 'height' } }
  };
  const library = {
    categories: [{ id: 'cat-1', name: 'Manga', path: 'C:/Manga', hidden: false, mangas: [manga] }],
    allMangas: [manga],
    favorites: [manga],
    recents: []
  };
  return { persistedState, library };
}

describe('Core v2 legacy migration', () => {
  it('analyzes a legacy JSON snapshot before writing SQLite rows', () => {
    const { persistedState, library } = makeLegacyFixtures();

    const report = analyzeLegacySnapshot({ persistedState, library });

    expect(report).toMatchObject({
      storageVersion: 3,
      stateVersion: 3,
      counts: {
        libraries: 1,
        series: 1,
        chapters: 1,
        pages: 2,
        tags: 1,
        collections: 1,
        smartCollections: 1,
        progress: 1,
        recents: 1,
        metadata: 1,
        annotations: 1,
        privateManga: 1,
        readerPrefs: 1
      }
    });
  });

  it('migrates legacy JSON data into a transactionally queryable Core v2 database', () => {
    const store = createCoreStore({ dbPath: makeTempDbPath() });
    const { persistedState, library } = makeLegacyFixtures();

    const result = store.migrateLegacySnapshot({
      persistedState,
      library,
      backupPath: 'C:/Backups/pre-v2.json',
      migrationId: 'migration-1'
    });

    expect(result.ok).toBe(true);
    expect(result.report.counts.series).toBe(1);
    expect(store.getMigrationStatus()).toMatchObject({
      ready: true,
      schemaVersion: 1,
      latestMigration: {
        id: 'migration-1',
        status: 'completed',
        backupPath: 'C:/Backups/pre-v2.json'
      }
    });
    expect(store.listSeries({ query: 'deluxe', limit: 10 })).toMatchObject({
      total: 1,
      items: [{
        id: 'manga-1',
        title: 'Series Deluxe',
        favorite: true,
        progressPercent: 50,
        tags: [{ id: 'tag-action', name: 'Action', color: '#ef4444' }],
        collectionIds: ['col-main']
      }]
    });
    expect(store.getSeriesChapters('manga-1').items).toEqual([expect.objectContaining({
      id: 'chapter-1',
      title: 'Chapitre 1',
      pageCount: 12,
      progressPercent: 50
    })]);
    expect(store.getReaderPages('chapter-1').pages).toHaveLength(2);
  });

  it('rolls back the Core v2 database when migration fails before commit', () => {
    const store = createCoreStore({ dbPath: makeTempDbPath() });
    const { persistedState, library } = makeLegacyFixtures();

    expect(() => store.migrateLegacySnapshot({
      persistedState,
      library,
      migrationId: 'migration-fail',
      beforeCommit: () => {
        throw new Error('boom');
      }
    })).toThrow('boom');

    expect(store.listSeries({ limit: 10 })).toMatchObject({ total: 0, items: [] });
    expect(store.getMigrationStatus().latestMigration).toBe(null);
  });
});

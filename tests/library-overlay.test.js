import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

const {
  applyPersistedOverlayToLibrary,
  buildInteractiveLibraryPayload
} = require('../electron/services/libraryOverlay.cjs');

function makeRawLibrary() {
  const firstChapter = {
    id: 'chapter-1',
    contentId: 'chapter-content-1',
    locationId: 'chapter-location-1',
    name: 'Chapitre 1',
    path: 'C:/Manga/Series/Chapitre 1',
    pageCount: 10,
    isRead: false,
    readingState: 'never',
    progress: null,
    scanIndexEntry: { type: 'chapter', legacyId: 'chapter-1' }
  };
  const secondChapter = {
    id: 'chapter-2',
    contentId: 'chapter-content-2',
    locationId: 'chapter-location-2',
    name: 'Chapitre 2',
    path: 'C:/Manga/Series/Chapitre 2',
    pageCount: 8,
    isRead: false,
    readingState: 'never',
    progress: null,
    scanIndexEntry: { type: 'chapter', legacyId: 'chapter-2' }
  };
  const manga = {
    id: 'manga-1',
    contentId: 'manga-content-1',
    locationId: 'manga-location-1',
    name: 'Series',
    displayTitle: 'Series',
    author: '',
    description: '',
    aliases: [],
    path: 'C:/Manga/Series',
    chapterCount: 2,
    completedChapterCount: 0,
    progressPercent: 0,
    pageCount: 18,
    isFavorite: false,
    isRead: false,
    readingState: 'never',
    chapters: [firstChapter, secondChapter],
    progress: { percent: 0, completedChapterCount: 0, totalChapterCount: 2, lastChapterId: null },
    lastProgress: null,
    lastReadAt: null,
    categoryId: 'cat-1',
    categoryName: 'Manga',
    tags: [],
    collectionIds: [],
    scanIndexEntry: { type: 'manga', legacyId: 'manga-1' }
  };

  return {
    categories: [{
      id: 'cat-1',
      name: 'Manga',
      path: 'C:/Manga',
      hidden: false,
      mangaCount: 1,
      mangas: [manga]
    }],
    allMangas: [manga],
    favorites: [],
    recents: [],
    scanIndex: {
      updatedAt: '2026-05-22T08:00:00.000Z',
      entries: [manga.scanIndexEntry, firstChapter.scanIndexEntry, secondChapter.scanIndexEntry]
    }
  };
}

function makePersistedState() {
  return {
    categories: [{ id: 'cat-1', name: 'Manga', path: 'C:/Manga', hidden: false }],
    metadata: {
      'manga-1': {
        title: 'Series Deluxe',
        author: 'Sawa',
        description: 'Metadata appliquee sans rescan',
        aliases: ['Serie Deluxe']
      }
    },
    favorites: { 'manga-1': true },
    tags: {
      'tag-action': { id: 'tag-action', name: 'Action', color: '#ef4444' }
    },
    mangaTags: { 'manga-1': ['tag-action'] },
    mangaTagMeta: {},
    collections: {
      'col-main': {
        id: 'col-main',
        name: 'A lire',
        mangaIds: ['manga-1']
      }
    },
    readingStates: {},
    chapterStates: {},
    readStatus: {},
    chapterReadStatus: { 'chapter-1': true },
    progress: {
      'chapter-1': {
        mangaId: 'manga-1',
        chapterId: 'chapter-1',
        pageIndex: 9,
        pageCount: 10,
        lastReadAt: '2026-05-22T08:10:00.000Z'
      },
      'chapter-2': {
        mangaId: 'manga-1',
        chapterId: 'chapter-2',
        pageIndex: 3,
        pageCount: 8,
        lastReadAt: '2026-05-22T08:20:00.000Z'
      }
    },
    recents: [{
      mangaId: 'manga-1',
      chapterId: 'chapter-2',
      pageIndex: 3,
      pageCount: 8,
      lastReadAt: '2026-05-22T08:20:00.000Z'
    }],
    knownChapterCounts: { 'manga-1': 2 },
    pdfMeta: {},
    ui: { allowNsfwSources: false }
  };
}

describe('applyPersistedOverlayToLibrary', () => {
  it('updates organization, metadata and reading state without changing scanned identities', () => {
    const rawLibrary = makeRawLibrary();
    const persisted = makePersistedState();

    const overlaid = applyPersistedOverlayToLibrary(rawLibrary, persisted);
    const manga = overlaid.allMangas[0];

    expect(manga).toMatchObject({
      id: 'manga-1',
      contentId: 'manga-content-1',
      locationId: 'manga-location-1',
      path: 'C:/Manga/Series',
      displayTitle: 'Series Deluxe',
      author: 'Sawa',
      description: 'Metadata appliquee sans rescan',
      isFavorite: true,
      readingState: 'in-progress',
      isRead: false,
      completedChapterCount: 1,
      progressPercent: 75,
      collectionIds: ['col-main']
    });
    expect(manga.tags).toEqual([{ id: 'tag-action', name: 'Action', color: '#ef4444' }]);
    expect(manga.chapters.map((chapter) => ({
      id: chapter.id,
      contentId: chapter.contentId,
      readingState: chapter.readingState,
      isRead: chapter.isRead,
      progress: chapter.progress?.pageIndex ?? null
    }))).toEqual([
      { id: 'chapter-1', contentId: 'chapter-content-1', readingState: 'read', isRead: true, progress: 9 },
      { id: 'chapter-2', contentId: 'chapter-content-2', readingState: 'in-progress', isRead: false, progress: 3 }
    ]);
    expect(overlaid.categories[0].mangas[0]).toBe(manga);
    expect(overlaid.favorites).toEqual([manga]);
    expect(overlaid.recents[0]).toMatchObject({
      mangaId: 'manga-1',
      chapterId: 'chapter-2',
      mangaTitle: 'Series Deluxe',
      chapterName: 'Chapitre 2',
      mangaContentId: 'manga-content-1',
      chapterContentId: 'chapter-content-2'
    });
    expect(rawLibrary.allMangas[0].displayTitle).toBe('Series');
  });
});

describe('buildInteractiveLibraryPayload', () => {
  it('uses an existing snapshot without calling the scanner', () => {
    const rawLibrary = makeRawLibrary();
    const persisted = makePersistedState();
    const scanLibrary = () => {
      throw new Error('scan should not run');
    };

    const result = buildInteractiveLibraryPayload({ rawLibrary, persisted, scanLibrary });

    expect(result.usedSnapshot).toBe(true);
    expect(result.rawLibrary.allMangas[0].displayTitle).toBe('Series Deluxe');
  });

  it('falls back to the scanner when no snapshot is available', () => {
    const persisted = makePersistedState();
    let scanCount = 0;
    const scanLibrary = () => {
      scanCount += 1;
      return makeRawLibrary();
    };

    const result = buildInteractiveLibraryPayload({ rawLibrary: null, persisted, scanLibrary });

    expect(scanCount).toBe(1);
    expect(result.usedSnapshot).toBe(false);
    expect(result.rawLibrary.allMangas[0].displayTitle).toBe('Series Deluxe');
  });
});

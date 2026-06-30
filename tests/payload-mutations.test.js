import { describe, expect, it } from 'vitest';
import {
  applyChapterReadMutation,
  applyCollectionMutation,
  applyFavoriteMutation,
  applyMangaReadMutation,
  applyTagMutation
} from '../src/utils/payloadMutations.js';

function makePayload() {
  const first = {
    id: 'manga-1',
    contentId: 'content-1',
    isFavorite: false,
    isRead: false,
    readingState: 'never',
    progressPercent: 0,
    tags: [],
    collectionIds: [],
    chapters: [
      { id: 'chapter-1', pageCount: 10, isRead: false, readingState: 'never', progress: null },
      { id: 'chapter-2', pageCount: 8, isRead: false, readingState: 'never', progress: null }
    ]
  };
  const second = { id: 'manga-2', isFavorite: false, chapters: [] };
  return {
    persisted: {
      tags: { action: { id: 'action', name: 'Action', color: '#ef4444' } },
      mangaTags: {},
      favorites: {},
      collections: { queue: { id: 'queue', name: 'Queue', mangaIds: [] } }
    },
    library: {
      allMangas: [first, second],
      categories: [{ id: 'cat-1', mangas: [first, second] }],
      favorites: [],
      recents: []
    },
    vaultLibrary: { allMangas: [], categories: [], favorites: [], recents: [] }
  };
}

describe('light payload mutations', () => {
  it('updates favorites, tags and collections without replacing unrelated manga', () => {
    const initial = makePayload();
    const unrelated = initial.library.allMangas[1];
    let next = applyFavoriteMutation(initial, 'content-1', true);
    next = applyTagMutation(next, 'manga-1', 'action', true);
    next = applyCollectionMutation(next, 'manga-1', 'queue', true);
    const manga = next.library.allMangas[0];

    expect(manga.isFavorite).toBe(true);
    expect(manga.tags).toEqual([{ id: 'action', name: 'Action', color: '#ef4444' }]);
    expect(manga.collectionIds).toEqual(['queue']);
    expect(next.library.favorites).toEqual([manga]);
    expect(next.persisted.favorites['manga-1']).toBe(true);
    expect(next.persisted.mangaTags['manga-1']).toEqual(['action']);
    expect(next.persisted.collections.queue.mangaIds).toEqual(['manga-1']);
    expect(next.library.allMangas[1]).toBe(unrelated);
    expect(next.library.categories[0].mangas[0]).toBe(manga);
  });

  it('recomputes manga progress for chapter and complete-series read mutations', () => {
    let next = applyChapterReadMutation(makePayload(), 'manga-1', 'chapter-1', true, 10);
    expect(next.library.allMangas[0]).toMatchObject({
      isRead: false,
      readingState: 'in-progress',
      completedChapterCount: 1,
      progressPercent: 50
    });
    expect(next.library.allMangas[0].chapters[0]).toMatchObject({
      isRead: true,
      readingState: 'read',
      progress: { pageIndex: 9, pageCount: 10 }
    });

    next = applyMangaReadMutation(next, 'manga-1', true, ['chapter-1', 'chapter-2']);
    expect(next.library.allMangas[0]).toMatchObject({
      isRead: true,
      readingState: 'read',
      completedChapterCount: 2,
      progressPercent: 100
    });
  });
});

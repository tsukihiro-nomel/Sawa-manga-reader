import { describe, expect, it, vi } from 'vitest';

import { mergePayloadForStability } from '../src/utils/payloadMerge.js';

describe('payload stability merge', () => {
  it('reuses unchanged manga references across full payload refreshes', () => {
    const unchanged = {
      id: 'manga-1',
      contentId: 'content-1',
      locationId: 'loc-1',
      displayTitle: 'Stable',
      isFavorite: false,
      chapters: [{ id: 'chapter-1', name: 'Chapter 1', isRead: false }]
    };
    const changed = {
      id: 'manga-2',
      contentId: 'content-2',
      locationId: 'loc-2',
      displayTitle: 'Changed',
      isFavorite: false,
      chapters: []
    };
    const previous = {
      library: {
        allMangas: [unchanged, changed],
        categories: [{ id: 'cat-1', mangas: [unchanged, changed] }],
        favorites: []
      }
    };
    const next = {
      library: {
        allMangas: [
          JSON.parse(JSON.stringify(unchanged)),
          { ...changed, isFavorite: true }
        ],
        categories: [{
          id: 'cat-1',
          mangas: [
            JSON.parse(JSON.stringify(unchanged)),
            { ...changed, isFavorite: true }
          ]
        }],
        favorites: [{ ...changed, isFavorite: true }]
      }
    };

    const merged = mergePayloadForStability(previous, next);

    expect(merged.library.allMangas[0]).toBe(unchanged);
    expect(merged.library.categories[0].mangas[0]).toBe(unchanged);
    expect(merged.library.allMangas[1]).not.toBe(changed);
    expect(merged.library.favorites[0]).toBe(merged.library.allMangas[1]);
  });

  it('compares large entities without serializing their complete page trees', () => {
    const unchanged = {
      id: 'manga-large',
      contentId: 'content-large',
      displayTitle: 'Large',
      chapters: [{
        id: 'chapter-large',
        contentId: 'chapter-content-large',
        name: 'Chapter',
        pageCount: 300,
        pages: Array.from({ length: 300 }, (_, index) => `C:/Manga/Large/${index}.jpg`),
        progress: { pageIndex: 12, pageCount: 300 },
        isRead: false
      }]
    };
    const previous = {
      library: { allMangas: [unchanged], categories: [], favorites: [], recents: [] }
    };
    const next = structuredClone(previous);
    const stringify = vi.spyOn(JSON, 'stringify');

    const merged = mergePayloadForStability(previous, next);

    expect(merged.library.allMangas[0]).toBe(unchanged);
    expect(stringify).not.toHaveBeenCalled();
    stringify.mockRestore();
  });

  it('does not reuse an entity when a nested page or progress value changed', () => {
    const original = {
      id: 'manga-1',
      chapters: [{
        id: 'chapter-1',
        pageCount: 3,
        pages: ['a.jpg', 'b.jpg', 'c.jpg'],
        progress: { pageIndex: 0, pageCount: 3 }
      }]
    };
    const next = structuredClone(original);
    next.chapters[0].pages[1] = 'changed.jpg';
    next.chapters[0].progress.pageIndex = 1;

    const merged = mergePayloadForStability(
      { library: { allMangas: [original], categories: [], favorites: [], recents: [] } },
      { library: { allMangas: [next], categories: [], favorites: [], recents: [] } }
    );

    expect(merged.library.allMangas[0]).toBe(next);
  });
});

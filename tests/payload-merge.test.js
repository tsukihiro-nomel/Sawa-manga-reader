import { describe, expect, it } from 'vitest';

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
});

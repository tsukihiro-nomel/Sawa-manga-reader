import { describe, expect, it } from 'vitest';

import legacySeriesIndex from '../electron/services/legacySeriesIndex.cjs';

const { buildLegacySeriesIndex, queryLegacySeriesIndex } = legacySeriesIndex;

function manga(id, overrides = {}) {
  return {
    id,
    name: `Series ${id}`,
    chapters: Array.from({ length: 80 }, (_, index) => ({
      id: `${id}-chapter-${index + 1}`,
      name: `Chapter ${index + 1}`
    })),
    ...overrides
  };
}

describe('legacy series index', () => {
  it('queries a large public library without returning nested chapter payloads', () => {
    const library = {
      allMangas: Array.from({ length: 420 }, (_, index) => manga(String(index + 1), {
        displayTitle: index === 319 ? 'Mizukage Chronicle' : `Series ${index + 1}`
      }))
    };

    const index = buildLegacySeriesIndex(library);
    const result = queryLegacySeriesIndex(index, { query: 'mizu', limit: 25, includePayload: false });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: '320', title: 'Mizukage Chronicle' });
    expect(result.items[0]).not.toHaveProperty('payload');
    expect(JSON.stringify(result)).not.toContain('chapter-1');
  });

  it('only indexes the client-safe library supplied by the caller', () => {
    const publicManga = manga('public', { displayTitle: 'Visible Story' });
    const privateManga = manga('private', { displayTitle: 'Private Secret' });
    const index = buildLegacySeriesIndex({ allMangas: [publicManga] });

    expect(queryLegacySeriesIndex(index, { query: 'visible' }).total).toBe(1);
    expect(queryLegacySeriesIndex(index, { query: 'private' }).total).toBe(0);
    expect(index.some((entry) => entry.id === privateManga.id)).toBe(false);
  });

  it('keeps pagination, favorite filtering and optional compatibility payloads', () => {
    const index = buildLegacySeriesIndex({
      allMangas: [
        manga('a', { displayTitle: 'Alpha', isFavorite: true }),
        manga('b', { displayTitle: 'Beta', isFavorite: false }),
        manga('c', { displayTitle: 'Gamma', isFavorite: true })
      ]
    });

    const result = queryLegacySeriesIndex(index, {
      favoriteOnly: true,
      limit: 1,
      offset: 1,
      includePayload: true
    });

    expect(result).toMatchObject({ total: 2, limit: 1, offset: 1 });
    expect(result.items[0]).toMatchObject({ id: 'c', favorite: true });
    expect(result.items[0].payload.chapters).toHaveLength(80);
  });
});

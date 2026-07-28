import { describe, expect, it } from 'vitest';
import { createLibraryReferenceIndex } from '../src/utils/libraryReferenceIndex.js';

describe('library reference index', () => {
  it('resolves manga and chapter search results in one indexed pass', () => {
    const library = {
      allMangas: [
        {
          id: 'manga-1',
          contentId: 'manga-content-1',
          chapters: [{ id: 'chapter-1', contentId: 'chapter-content-1' }]
        },
        {
          id: 'manga-2',
          locationId: 'manga-location-2',
          chapters: [{ id: 'chapter-2', locationId: 'chapter-location-2' }]
        }
      ]
    };
    const index = createLibraryReferenceIndex(library);

    expect(index.resolveMangaIds([
      { itemContentId: 'manga-content-1' },
      { itemContentId: 'chapter-content-1' },
      { itemLocationId: 'chapter-location-2' },
      { itemContentId: 'missing' }
    ])).toEqual(new Set(['manga-1', 'manga-2']));
  });

  it('returns an empty set for malformed result records', () => {
    const index = createLibraryReferenceIndex({ allMangas: [] });
    expect(index.resolveMangaIds([null, {}, { itemContentId: '' }])).toEqual(new Set());
  });
});

import { describe, expect, it } from 'vitest';
import {
  normalizeCollectionAppearance,
  getFeaturedMangaPage,
  resolveCollectionCoverMangas,
  toggleFeaturedManga
} from '../src/utils/collectionAppearance.js';

describe('collection cover appearance', () => {
  const mangas = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));

  it('falls back to the next available manga when a featured one disappeared', () => {
    const result = resolveCollectionCoverMangas({
      appearance: { type: 'mosaic', featuredMangaIds: ['missing', 'c'] }
    }, mangas);
    expect(result.map((manga) => manga.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('limits single and banner appearances to one cover', () => {
    expect(resolveCollectionCoverMangas({ appearance: { type: 'single' } }, mangas)).toHaveLength(1);
    expect(resolveCollectionCoverMangas({ appearance: { type: 'banner' } }, mangas)).toHaveLength(1);
  });

  it('keeps at most four optional featured mangas', () => {
    let appearance = normalizeCollectionAppearance({ type: 'stack' });
    for (const id of ['a', 'b', 'c', 'd', 'e']) appearance = toggleFeaturedManga(appearance, id);
    expect(appearance.featuredMangaIds).toEqual(['b', 'c', 'd', 'e']);
  });

  it('can reach and select a manga beyond the former first 24 entries', () => {
    const largeLibrary = Array.from({ length: 35 }, (_, index) => ({
      id: `manga-${index + 1}`,
      displayTitle: `Manga ${index + 1}`
    }));
    const result = getFeaturedMangaPage(largeLibrary, { query: 'Manga 30', pageSize: 40 });
    expect(result.items.map((manga) => manga.id)).toContain('manga-30');
    const selected = toggleFeaturedManga({ type: 'mosaic', featuredMangaIds: [] }, result.items[0].id);
    expect(selected.featuredMangaIds).toContain('manga-30');
  });
});

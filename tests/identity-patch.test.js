import { describe, expect, it } from 'vitest';
import { mergeIdentityPatchIntoPayload } from '../src/utils/identityPatch.js';

describe('identity organization patches', () => {
  it('applies every group and organization segment immediately', () => {
    const previous = {
      stateRevision: 4,
      persisted: {
        tags: { tag: { id: 'tag', name: 'Tag' } },
        favorites: { old: true },
        mangaTags: { old: ['old-tag'] },
        collections: { old: { mangaIds: ['old'] } },
        workGroups: {},
        metadata: { stable: { title: 'Conservé' } }
      },
      library: {
        allMangas: [{ id: 'a', isFavorite: false, tags: [], collectionIds: [] }],
        favorites: [],
        categories: [{ id: 'category', mangas: [{ id: 'a', isFavorite: false }] }]
      }
    };
    const merged = mergeIdentityPatchIntoPayload(previous, {
      ok: true,
      revision: 8,
      patch: {
        workGroups: { work: { editionIds: ['a', 'b'] } },
        favorites: { a: true, b: true },
        mangaTags: { a: ['tag'], b: ['tag'] },
        collections: { collection: { mangaIds: ['a', 'b'] } }
      }
    });
    expect(merged).toMatchObject({
      stateRevision: 8,
      persisted: {
        workGroups: { work: { editionIds: ['a', 'b'] } },
        favorites: { a: true, b: true },
        mangaTags: { a: ['tag'], b: ['tag'] },
        collections: { collection: { mangaIds: ['a', 'b'] } },
        metadata: { stable: { title: 'Conservé' } }
      }
    });
    expect(merged.library.allMangas[0]).toMatchObject({
      id: 'a',
      isFavorite: true,
      tags: [{ id: 'tag', name: 'Tag' }],
      collectionIds: ['collection']
    });
    expect(merged.library.favorites.map((manga) => manga.id)).toEqual(['a']);
    expect(merged.library.categories[0].mangas[0].isFavorite).toBe(true);
  });

  it('ignores failed and stale non-patches', () => {
    const previous = { stateRevision: 10, persisted: { workGroups: {} } };
    expect(mergeIdentityPatchIntoPayload(previous, { ok: false, revision: 11 })).toBe(previous);
    expect(mergeIdentityPatchIntoPayload(previous, {
      ok: true,
      revision: 9,
      patch: { workGroups: { stale: { editionIds: ['secret'] } } }
    })).toBe(previous);
  });
});

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { normalizeState, sanitizeCollectionPatch } = require('../electron/services/storage.cjs');

describe('storage v4 covers and collection appearances', () => {
  it('migrates legacy cover paths into preserved variants', () => {
    const state = normalizeState({
      metadata: {
        mangaA: {
          coverPath: 'C:\\library\\Manga A\\.sawa-custom-cover.jpg',
          onlineCoverPath: 'C:\\library\\Manga A\\.sawa-online-cover.webp'
        }
      }
    });
    expect(state.coverProfiles.mangaA.variants.map((variant) => variant.kind).sort())
      .toEqual(['legacy-custom', 'legacy-online']);
    expect(state.metadata.mangaA.coverPath).toContain('.sawa-custom-cover');
  });

  it('rebases managed cover paths to the current user-data cover directory', () => {
    const state = normalizeState({
      metadata: { mangaA: { coverPath: 'D:\\old-profile\\managed-covers\\hash.jpg' } },
      coverProfiles: {
        mangaA: {
          mangaId: 'mangaA',
          activeVariantId: 'managed-hash',
          variants: [{
            id: 'managed-hash',
            hash: 'hash',
            fileName: '..\\hash.jpg',
            path: 'D:\\old-profile\\managed-covers\\hash.jpg',
            kind: 'managed'
          }]
        }
      }
    });
    expect(state.coverProfiles.mangaA.variants[0].path).toContain('managed-covers');
    expect(state.coverProfiles.mangaA.variants[0].path).not.toContain('old-profile');
    expect(state.metadata.mangaA.coverPath).toBe(state.coverProfiles.mangaA.variants[0].path);
  });

  it('normalizes manual and smart collection appearances with mosaic fallback', () => {
    const state = normalizeState({
      collections: {
        manual: {
          id: 'manual',
          name: 'Pile',
          mangaIds: ['m1', 'm1', 'm2'],
          appearance: { type: 'stack', featuredMangaIds: ['missing', 'm2'] }
        }
      },
      smartCollections: {
        custom: {
          id: 'custom',
          name: 'Bannière',
          rules: { type: 'unread' },
          appearance: { type: 'banner', featuredMangaIds: ['m3'] }
        }
      }
    });

    expect(state.collections.manual.mangaIds).toEqual(['m1', 'm2']);
    expect(state.collections.manual.appearance).toEqual({
      type: 'stack',
      featuredMangaIds: ['missing', 'm2']
    });
    expect(state.smartCollections.custom.appearance.type).toBe('banner');
    expect(state.smartCollections['smart-unread'].appearance.type).toBe('mosaic');
  });

  it('whitelists collection edits and normalizes appearance immediately', () => {
    expect(sanitizeCollectionPatch({
      id: 'hijacked',
      mangaIds: ['private'],
      createdAt: 'forged',
      name: '  Nouveau nom  ',
      description: '  Description  ',
      color: '#AABBCC',
      appearance: { type: 'stack', featuredMangaIds: ['m1', 'm1', 'm2'] }
    })).toEqual({
      name: 'Nouveau nom',
      description: 'Description',
      color: '#AABBCC',
      appearance: { type: 'stack', featuredMangaIds: ['m1', 'm2'] }
    });
  });
});

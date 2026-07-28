import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { applyPersistedOverlayToLibrary } = require('../electron/services/libraryOverlay.cjs');

function library() {
  return {
    categories: [{
      id: 'cat',
      name: 'Catégorie',
      mangas: [{
        id: 'm1',
        displayTitle: 'Manga',
        coverSrc: 'manga://local/custom.jpg',
        coverType: 'custom',
        chapters: [{
          id: 'ch1',
          previewSrc: 'manga://local/page.jpg',
          previewFilePath: 'C:\\library\\page.jpg',
          previewMediaType: 'image'
        }]
      }]
    }]
  };
}

describe('library cover overlay', () => {
  it('restores the automatic chapter cover without deleting legacy metadata', () => {
    const overlaid = applyPersistedOverlayToLibrary(library(), {
      categories: [{ id: 'cat' }],
      metadata: { m1: { coverMode: 'auto', coverPath: 'C:\\legacy\\.sawa-custom-cover.jpg' } },
      coverProfiles: { m1: { mangaId: 'm1', activeVariantId: 'auto', variants: [], crops: {} } }
    });
    expect(overlaid.allMangas[0].coverSrc).toBe('manga://local/page.jpg');
    expect(overlaid.allMangas[0].coverType).toBe('auto');
    expect(overlaid.allMangas[0].coverProfile.activeVariantId).toBe('auto');
  });
});

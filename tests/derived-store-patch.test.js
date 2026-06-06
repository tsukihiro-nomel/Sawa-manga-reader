import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

const {
  patchLibrarySnapshot,
  readLibrarySnapshot
} = require('../electron/services/derivedStore.cjs');

function makeLibrary(title = 'Series') {
  return {
    allMangas: [{
      id: 'manga-1',
      locationId: 'loc-manga-1',
      contentId: 'content-manga-1',
      displayTitle: title,
      name: 'Series',
      path: 'C:/Manga/Series',
      categoryId: 'cat-1',
      chapters: [{
        id: 'chapter-1',
        locationId: 'loc-chapter-1',
        contentId: 'content-chapter-1',
        name: 'Chapter 1',
        path: 'C:/Manga/Series/Chapter 1',
        containerType: 'folder',
        sourceType: 'image'
      }]
    }],
    categories: [],
    favorites: [],
    recents: []
  };
}

describe('derived store interactive patch', () => {
  it('updates the snapshot through a patch interface', () => {
    const result = patchLibrarySnapshot(makeLibrary('Series Deluxe'));

    expect(result).toMatchObject({ ok: true, mode: 'patch' });
    expect(readLibrarySnapshot().allMangas[0].displayTitle).toBe('Series Deluxe');
  });

  it('keeps global row deletes out of the interactive patch implementation', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'electron', 'services', 'derivedStore.cjs'),
      'utf8'
    );
    const patchBody = source.match(/function patchLibrarySnapshotInner[\s\S]*?\n}\n\nfunction patchLibrarySnapshot/)?.[0] || '';

    expect(patchBody).not.toContain('DELETE FROM library_items');
    expect(patchBody).not.toContain('DELETE FROM pages');
    expect(patchBody).not.toContain('replaceSearchDocuments');
  });
});

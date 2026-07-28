import fs from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildAllowedReferences,
  runPrivacySafeAdvancedSearch
} = require('../electron/services/searchPrivacy.cjs');

const rawLibrary = {
  allMangas: [
    {
      id: 'public',
      contentId: 'public-content',
      locationId: 'public-location',
      categoryId: 'safe',
      chapters: [{ id: 'public-chapter', contentId: 'public-chapter-content', locationId: 'public-chapter-location' }]
    },
    {
      id: 'secret',
      contentId: 'secret-content',
      locationId: 'secret-location',
      categoryId: 'private-category',
      chapters: [{ id: 'secret-chapter', contentId: 'secret-chapter-content', locationId: 'secret-chapter-location' }]
    }
  ],
  categories: [
    { id: 'safe', mangas: [{ id: 'public' }] },
    { id: 'private-category', mangas: [{ id: 'secret' }] }
  ]
};

const documents = [
  {
    id: 'manga:secret-content',
    itemContentId: 'secret-content',
    itemLocationId: 'secret-location',
    docType: 'manga',
    title: 'Secret title',
    body: 'secret annotation and OCR'
  },
  {
    id: 'ocr:secret',
    itemContentId: 'secret-chapter-content',
    itemLocationId: 'secret-chapter-location',
    docType: 'ocr',
    title: 'Secret OCR',
    body: 'secret words'
  },
  {
    id: 'manga:public-content',
    itemContentId: 'public-content',
    itemLocationId: 'public-location',
    docType: 'manga',
    title: 'Public title',
    body: 'public description'
  }
];

describe('server-side advanced search privacy', () => {
  it('intersects a compromised renderer request with public ids while locked', () => {
    const searchDocuments = vi.fn(() => documents);
    const result = runPrivacySafeAdvancedSearch({
      input: {
        query: 'secret',
        scope: 'library',
        includePrivate: true,
        allowedIds: ['secret', 'secret-content', 'secret-location'],
        limit: 1200
      },
      state: {
        vault: {
          locked: true,
          stealthMode: false,
          privateMangaIds: [],
          privateCategoryIds: ['private-category']
        }
      },
      rawLibrary,
      searchDocuments
    });
    expect(result.results).toEqual([{
      itemContentId: 'public-content',
      itemLocationId: 'public-location',
      docType: 'manga'
    }]);
    expect(result.results).toHaveLength(1);
    expect(searchDocuments).toHaveBeenCalledWith('secret', 960);
    expect(JSON.stringify(result)).not.toMatch(/Secret title|annotation|OCR|secret-content|secret-location|secret-chapter/);
  });

  it('returns no private ids, titles, bodies, OCR or annotations for locked/stealth vault scope', () => {
    for (const vault of [
      { locked: true, stealthMode: false },
      { locked: false, stealthMode: true }
    ]) {
      const result = runPrivacySafeAdvancedSearch({
        input: { query: 'secret', scope: 'vault', includePrivate: true },
        state: {
          vault: {
            ...vault,
            privateMangaIds: ['secret'],
            privateCategoryIds: []
          }
        },
        rawLibrary,
        searchDocuments: () => documents
      });
      expect(result).toEqual({ query: 'secret', scope: 'vault', results: [] });
      expect(JSON.stringify(result)).not.toContain('secret-content');
    }
  });

  it('allows only sanitized private references for an explicitly unlocked non-stealth vault scope', () => {
    const result = runPrivacySafeAdvancedSearch({
      input: { query: 'secret', scope: 'vault' },
      state: {
        vault: {
          locked: false,
          stealthMode: false,
          privateMangaIds: ['secret-content'],
          privateCategoryIds: []
        }
      },
      rawLibrary,
      searchDocuments: () => documents
    });
    expect(result.results).toEqual([
      {
        itemContentId: 'secret-content',
        itemLocationId: 'secret-location',
        docType: 'manga'
      },
      {
        itemContentId: 'secret-chapter-content',
        itemLocationId: 'secret-chapter-location',
        docType: 'ocr'
      }
    ]);
    expect(JSON.stringify(result)).not.toMatch(/Secret title|secret annotation|secret words/);
  });

  it('fails closed when no raw library is available and trusts location over shared content ids', () => {
    expect(runPrivacySafeAdvancedSearch({
      input: { query: 'x', scope: 'library' },
      state: {},
      rawLibrary: null,
      searchDocuments: () => documents
    }).results).toEqual([]);

    const access = buildAllowedReferences({ state: {}, rawLibrary, scope: 'library' });
    const mixed = runPrivacySafeAdvancedSearch({
      input: { query: 'x', scope: 'library' },
      state: {
        vault: { privateMangaIds: ['secret'], privateCategoryIds: [] }
      },
      rawLibrary,
      searchDocuments: () => [{
        itemContentId: 'public-content',
        itemLocationId: 'secret-location',
        title: 'private document with shared public content'
      }]
    });
    expect(access.references.has('public-location')).toBe(true);
    expect(mixed.results).toEqual([]);
  });

  it('wires the IPC handler through the privacy boundary instead of returning raw documents', () => {
    const main = fs.readFileSync('electron/main.cjs', 'utf8');
    const queryHandler = main.slice(main.indexOf("ipcMain.handle('search:query'"), main.indexOf("ipcMain.handle('filters:run'"));
    const handler = main.slice(main.indexOf("ipcMain.handle('search:advanced'"), main.indexOf("ipcMain.handle('reader:getVisualPrefs'"));
    expect(queryHandler).toContain('runPrivacySafeAdvancedSearch');
    expect(queryHandler).not.toContain('title: series.title');
    expect(handler).toContain('runPrivacySafeAdvancedSearch');
    expect(handler).toContain('loadState()');
    expect(handler).toContain('rawLibrarySnapshot');
    expect(handler).not.toContain('results: searchDocuments');
  });
});

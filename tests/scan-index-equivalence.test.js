import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { areScanIndexesEquivalent } = require('../electron/services/libraryScanner.cjs');
const { normalizeState } = require('../electron/services/storage.cjs');

function entry(overrides = {}) {
  return {
    type: 'chapter',
    legacyId: 'chapter-1',
    contentId: 'content-1',
    locationId: 'location-1',
    path: 'C:/Manga/Series/Chapter 1',
    containerType: 'folder',
    pageCount: 80,
    size: 1024,
    mtimeMs: 1234,
    healthStatus: 'ok',
    signature: 'stable',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

describe('scan index equivalence', () => {
  it('ignores timestamps when disk signatures are unchanged', () => {
    const previous = { entries: [entry()] };
    const next = { entries: [entry({ updatedAt: '2026-06-29T12:00:00.000Z' })] };

    expect(areScanIndexesEquivalent?.(previous, next)).toBe(true);
  });

  it('detects a page-count or signature change', () => {
    const previous = { entries: [entry()] };

    expect(areScanIndexesEquivalent?.(previous, { entries: [entry({ pageCount: 81 })] })).toBe(false);
    expect(areScanIndexesEquivalent?.(previous, { entries: [entry({ signature: 'changed' })] })).toBe(false);
  });

  it('preserves disk signatures and nullable counts through state normalization', () => {
    const normalized = normalizeState({
      scanIndex: {
        entries: [entry({ chapterCount: null })]
      }
    });
    const stored = normalized.scanIndex.entries['location-1'];

    expect(stored.signature).toBe('stable');
    expect(stored.pageCount).toBe(80);
    expect(stored.chapterCount).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { attachWorkGroupMetadata, projectCanonicalMangas } from '../src/utils/workGroups.js';

describe('work group renderer projection', () => {
  it('keeps all editions addressable but projects one preferred card', () => {
    const mangas = [
      { id: 'a', displayTitle: 'A', lastReadAt: '2025-01-01' },
      { id: 'b', displayTitle: 'B', lastReadAt: '2026-01-01' },
      { id: 'c', displayTitle: 'C' }
    ];
    const groups = { work: { id: 'work', editionIds: ['a', 'b'], preferredEditionId: 'b' } };
    const attached = attachWorkGroupMetadata(mangas, groups);
    expect(attached).toHaveLength(3);
    expect(attached[0].workGroup.editionCount).toBe(2);
    expect(projectCanonicalMangas(mangas, groups).map((manga) => manga.id)).toEqual(['b', 'c']);
  });
});

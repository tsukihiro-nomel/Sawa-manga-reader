import { describe, expect, it } from 'vitest';
import { paginateItems } from '../src/utils/paginateItems.js';

describe('chapter pagination', () => {
  it('caps mounted chapters and clamps invalid pages', () => {
    const chapters = Array.from({ length: 137 }, (_, index) => ({ id: index }));
    expect(paginateItems(chapters, 0, 50)).toMatchObject({ page: 0, totalPages: 3, start: 0, end: 50 });
    expect(paginateItems(chapters, 2, 50).items).toHaveLength(37);
    expect(paginateItems(chapters, 99, 50)).toMatchObject({ page: 2, start: 100, end: 137 });
  });

  it('handles an empty list without producing an invalid page', () => {
    expect(paginateItems([], 4, 50)).toEqual({ items: [], page: 0, totalPages: 0, start: 0, end: 0 });
  });
});

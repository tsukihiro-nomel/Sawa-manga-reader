import { describe, expect, it } from 'vitest';
import {
  buildDashboardSelectionModel,
  resolveVisibleSelectionIds
} from '../src/utils/selectionVisibility.js';

function manga(id, patch = {}) {
  return {
    id,
    displayTitle: id,
    addedAt: '2026-01-01T00:00:00.000Z',
    ...patch
  };
}

describe('selection visibility', () => {
  it('uses the dashboard render order, caps sections and de-duplicates cards across sections', () => {
    const shared = manga('shared', {
      progressPercent: 25,
      lastReadAt: '2026-06-10T00:00:00.000Z',
      hasNewChapters: true,
      isFavorite: true
    });
    const recentOnly = manga('recent-only', {
      progressPercent: 10,
      lastReadAt: '2026-06-09T00:00:00.000Z'
    });
    const additions = Array.from({ length: 14 }, (_, index) => (
      manga(`added-${index}`, { addedAt: `2026-05-${String(28 - index).padStart(2, '0')}T00:00:00.000Z` })
    ));
    const allMangas = [shared, recentOnly, ...additions];
    const model = buildDashboardSelectionModel({
      allMangas,
      favorites: [shared],
      persisted: {
        recents: [
          { mangaId: 'shared', chapterId: 'chapter-1' },
          { mangaId: 'recent-only', chapterId: 'chapter-2' }
        ]
      },
      ui: {
        dashboardLayout: [
          'favorites',
          'recently-resumed',
          'continue-reading',
          'recently-added',
          'new-chapters'
        ]
      }
    });

    expect(model.visibleIds[0]).toBe('shared');
    expect(model.visibleIds.filter((id) => id === 'shared')).toHaveLength(1);
    expect(model.visibleIds.filter((id) => id.startsWith('added-'))).toHaveLength(12);
    expect(model.visibleIds.indexOf('recent-only')).toBeGreaterThan(model.visibleIds.indexOf('shared'));
  });

  it('excludes hidden dashboard blocks from the selectable order', () => {
    const model = buildDashboardSelectionModel({
      allMangas: [
        manga('favorite', { isFavorite: true, addedAt: null }),
        manga('continue', { progressPercent: 20, lastReadAt: '2026-06-10T00:00:00.000Z' })
      ],
      favorites: [manga('favorite', { isFavorite: true, addedAt: null })],
      ui: {
        dashboardLayout: ['favorites', 'continue-reading'],
        dashboardHiddenSections: { favorites: true }
      }
    });

    expect(model.visibleIds).toContain('continue');
    expect(model.visibleIds).not.toContain('favorite');
  });

  it('keeps the 13th card selectable in full sections while recent sections stay capped at 12', () => {
    const continuing = Array.from({ length: 13 }, (_, index) => manga(`continue-${index}`, {
      addedAt: null,
      progressPercent: 20,
      lastReadAt: `2026-06-${String(20 - index).padStart(2, '0')}T00:00:00.000Z`
    }));
    const favorites = Array.from({ length: 13 }, (_, index) => manga(`favorite-${index}`, {
      addedAt: null,
      isFavorite: true
    }));
    const recent = Array.from({ length: 13 }, (_, index) => manga(`recent-${index}`, {
      addedAt: `2026-05-${String(20 - index).padStart(2, '0')}T00:00:00.000Z`
    }));
    const model = buildDashboardSelectionModel({
      allMangas: [...continuing, ...favorites, ...recent],
      favorites,
      persisted: {
        recents: recent.map((entry) => ({ mangaId: entry.id }))
      },
      ui: {
        dashboardLayout: ['continue-reading', 'favorites', 'recently-resumed', 'recently-added']
      }
    });

    expect(model.sectionMangas['continue-reading']).toHaveLength(13);
    expect(model.sectionMangas.favorites).toHaveLength(13);
    expect(model.visibleIds).toContain('continue-12');
    expect(model.visibleIds).toContain('favorite-12');
    expect(model.sectionMangas['recently-resumed']).toHaveLength(12);
    expect(model.sectionMangas['recently-added']).toHaveLength(12);
    expect(model.visibleIds).not.toContain('recent-12');
  });

  it('resolves the ids that are really rendered for each selectable view', () => {
    const filtered = [manga('library-1'), manga('library-2')];
    const vault = [manga('vault-1')];
    const workbench = [manga('workbench-1')];

    expect(resolveVisibleSelectionIds({ activeScreen: 'library', filteredMangas: filtered }))
      .toEqual(['library-1', 'library-2']);
    expect(resolveVisibleSelectionIds({ activeScreen: 'vault', vaultMangas: vault }))
      .toEqual(['vault-1']);
    expect(resolveVisibleSelectionIds({ activeScreen: 'workbench', workbenchMangas: workbench }))
      .toEqual(['workbench-1']);
    expect(resolveVisibleSelectionIds({
      activeScreen: 'collections',
      collectionVisibleIds: ['collection-2', 'collection-1']
    })).toEqual(['collection-2', 'collection-1']);
    expect(resolveVisibleSelectionIds({ activeScreen: 'maintenance', filteredMangas: filtered }))
      .toEqual([]);
  });
});

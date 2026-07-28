import { describe, expect, it, vi } from 'vitest';
import {
  advancedSearchResultsMatch,
  createAdvancedSearchState,
  createDeferredSearchController,
  createRecentSearchStore,
  moveSuggestionCursor,
  neutralizePrivateTabSearch,
  normalizeSearchState,
  serializeTabSearchState,
  shouldRecordRecentSearch
} from '../src/utils/searchSession.js';
import {
  buildCompactSearchIndex,
  getSearchSuggestions
} from '../src/utils/searchIndex.js';

describe('search session', () => {
  it('normalizes legacy query and tab-local scope/filters', () => {
    expect(normalizeSearchState(null, 'legacy')).toEqual({
      query: 'legacy',
      scope: 'current',
      filters: []
    });
    expect(normalizeSearchState({
      query: 'berserk',
      scope: 'all',
      filters: [{ field: 'tag', value: 'seinen' }, { field: 'invalid', value: 'x' }]
    })).toMatchObject({
      query: 'berserk',
      scope: 'all',
      filters: [{ field: 'tag', value: 'seinen' }]
    });
  });

  it('wraps keyboard suggestion navigation', () => {
    expect(moveSuggestionCursor(-1, 'ArrowDown', 3)).toBe(0);
    expect(moveSuggestionCursor(2, 'ArrowDown', 3)).toBe(0);
    expect(moveSuggestionCursor(0, 'ArrowUp', 3)).toBe(2);
    expect(moveSuggestionCursor(1, 'Escape', 3)).toBe(1);
  });

  it('keeps recents local, bounded and excludes incognito/private/locked searches', () => {
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key)
    };
    const store = createRecentSearchStore(storage, { limit: 2 });
    store.add('One Piece');
    store.add('Berserk');
    store.add('Vagabond');
    expect(store.list()).toEqual(['Vagabond', 'Berserk']);
    store.add('Secret', { incognito: true });
    expect(store.list()).not.toContain('Secret');
    expect(shouldRecordRecentSearch({ query: 'x', privateContext: true })).toBe(false);
    expect(shouldRecordRecentSearch({ query: 'x', vaultLocked: true })).toBe(false);
    expect(store.clear()).toEqual([]);
  });

  it('serializes incognito and explicitly private tab searches as a blank default state', () => {
    const secretTab = {
      incognito: true,
      searchState: {
        query: 'secret annotation',
        scope: 'all',
        filters: [{ field: 'tag', value: 'private-only' }]
      }
    };
    expect(serializeTabSearchState(secretTab)).toEqual({
      query: '',
      scope: 'current',
      filters: []
    });
    expect(serializeTabSearchState({
      ...secretTab,
      incognito: false,
      searchPrivate: true
    }, { vaultLocked: false })).toEqual({
      query: '',
      scope: 'current',
      filters: []
    });
    expect(serializeTabSearchState({
      ...secretTab,
      incognito: false,
      stack: [{ screen: 'manga', mangaId: 'private' }]
    }, {
      vaultLocked: true,
      privateMangaIds: new Set(['private'])
    })).toEqual({
      query: '',
      scope: 'current',
      filters: []
    });
  });

  it('neutralizes an unlocked vault search before public recents or suggestions can use it', () => {
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key)
    };
    const tabAfterLeavingVault = neutralizePrivateTabSearch({
      id: 'vault-tab',
      searchPrivate: true,
      search: 'legacy private query',
      searchState: {
        query: 'secret title',
        scope: 'all',
        filters: [{ field: 'tag', value: 'private-only' }]
      }
    }, { leavingPrivateContext: true });

    expect(tabAfterLeavingVault.searchPrivate).toBe(false);
    expect(tabAfterLeavingVault.searchState).toEqual({
      query: '',
      scope: 'current',
      filters: []
    });
    expect(tabAfterLeavingVault).not.toHaveProperty('search');

    const recents = createRecentSearchStore(storage);
    expect(recents.add(tabAfterLeavingVault.searchState.query)).toEqual([]);
    expect(values.size).toBe(0);

    const publicIndex = buildCompactSearchIndex([
      { id: 'public', displayTitle: 'Public title' },
      { id: 'private', displayTitle: 'Secret title', isPrivate: true }
    ]);
    const suggestions = getSearchSuggestions(publicIndex, tabAfterLeavingVault.searchState.query, {
      includePrivate: false,
      recents: recents.list()
    });
    expect(suggestions).toEqual([]);
    expect(JSON.stringify(suggestions)).not.toContain('Secret title');
  });

  it('clears q1 results while q2 is pending and requires query, scope and generation equality', () => {
    const q1 = createAdvancedSearchState({
      query: 'first',
      scope: 'library',
      generation: 1,
      results: [{ itemContentId: 'q1-result' }]
    });
    const q2Pending = createAdvancedSearchState({
      query: 'second',
      scope: 'library',
      generation: 2,
      results: [],
      busy: true
    });

    expect(advancedSearchResultsMatch(q1, {
      query: 'second',
      scope: 'library',
      generation: 2
    })).toBe(false);
    expect(advancedSearchResultsMatch(q2Pending, {
      query: 'second',
      scope: 'library',
      generation: 2
    })).toBe(true);
    expect(q2Pending.results).toEqual([]);
    expect(advancedSearchResultsMatch(q2Pending, {
      query: 'second',
      scope: 'vault',
      generation: 2
    })).toBe(false);
    expect(advancedSearchResultsMatch(q2Pending, {
      query: 'second',
      scope: 'library',
      generation: 3
    })).toBe(false);
  });

  it('cancels pending work and rejects stale async responses', async () => {
    vi.useFakeTimers();
    const resolvers = new Map();
    const execute = vi.fn((query) => new Promise((resolve) => resolvers.set(query, resolve)));
    const controller = createDeferredSearchController({ execute, delay: 20 });
    const first = controller.run('old');
    await vi.advanceTimersByTimeAsync(20);
    const second = controller.run('new');
    expect(await first).toEqual({ stale: true, cancelled: true });
    await vi.advanceTimersByTimeAsync(20);
    resolvers.get('old')?.({ ids: ['old'] });
    resolvers.get('new')?.({ ids: ['new'] });
    await expect(second).resolves.toEqual({ stale: false, value: { ids: ['new'] } });
    vi.useRealTimers();
  });
});

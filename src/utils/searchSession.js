export const DEFAULT_SEARCH_STATE = Object.freeze({
  query: '',
  scope: 'current',
  filters: []
});

export const SEARCH_PRIVACY_VERSION = 1;

export function emptySearchState() {
  return { query: '', scope: 'current', filters: [] };
}

const SEARCH_SCOPES = new Set(['current', 'all']);
const FILTER_FIELDS = new Set([
  'tag',
  'status',
  'favorite',
  'private',
  'author',
  'collection',
  'missing',
  'chapters',
  'added'
]);
const FILTER_OPERATORS = new Set([':', '=', '>', '>=', '<', '<=']);

function text(value, maxLength = 256) {
  return String(value ?? '').trim().slice(0, maxLength);
}

export function normalizeSearchFilter(candidate, index = 0) {
  if (!candidate || typeof candidate !== 'object') return null;
  const field = text(candidate.field, 32).toLowerCase();
  const value = text(candidate.value);
  if (!FILTER_FIELDS.has(field) || !value) return null;
  const operator = FILTER_OPERATORS.has(candidate.operator) ? candidate.operator : ':';
  return {
    id: text(candidate.id, 96) || `filter-${field}-${index}`,
    field,
    operator,
    value,
    label: text(candidate.label) || ''
  };
}

export function normalizeSearchState(candidate, legacyQuery = '') {
  const source = candidate && typeof candidate === 'object'
    ? candidate
    : {};
  const filters = (Array.isArray(source.filters) ? source.filters : [])
    .slice(0, 24)
    .map(normalizeSearchFilter)
    .filter(Boolean);
  return {
    query: text(source.query ?? legacyQuery, 512),
    scope: SEARCH_SCOPES.has(source.scope) ? source.scope : 'current',
    filters
  };
}

export function updateSearchState(current, patch = {}) {
  return normalizeSearchState({
    ...normalizeSearchState(current),
    ...(patch && typeof patch === 'object' ? patch : {})
  });
}

function tabReferencesPrivateContent(tab, privateMangaIds, privateChapterIds) {
  const mangaIds = privateMangaIds instanceof Set ? privateMangaIds : new Set(privateMangaIds || []);
  const chapterIds = privateChapterIds instanceof Set ? privateChapterIds : new Set(privateChapterIds || []);
  const views = [
    ...(Array.isArray(tab?.stack) ? tab.stack : []),
    tab?.view
  ].filter(Boolean);
  return views.some((view) => (
    mangaIds.has(String(view?.mangaId || ''))
    || chapterIds.has(String(view?.chapterId || ''))
  ));
}

export function serializeTabSearchState(tab, {
  vaultLocked = false,
  privateContext = false,
  privateMangaIds = [],
  privateChapterIds = []
} = {}) {
  const privateTab = privateContext
    || Boolean(tab?.searchPrivate)
    || tabReferencesPrivateContent(tab, privateMangaIds, privateChapterIds);
  if (
    tab?.incognito
    || privateContext
    || tab?.searchPrivate
    || (vaultLocked && privateTab)
  ) return emptySearchState();
  return normalizeSearchState(tab?.searchState, tab?.search);
}

export function neutralizePrivateTabSearch(tab, {
  leavingPrivateContext = false
} = {}) {
  if (!tab || (!leavingPrivateContext && !tab.searchPrivate)) return tab;
  const { search: _legacySearch, ...safeTab } = tab;
  return {
    ...safeTab,
    searchPrivate: false,
    searchState: emptySearchState()
  };
}

export function createAdvancedSearchState({
  query = '',
  scope = 'library',
  generation = 0,
  results = [],
  busy = false,
  error = ''
} = {}) {
  return {
    query: text(query, 512),
    scope: scope === 'vault' ? 'vault' : 'library',
    generation: Math.max(0, Number(generation) || 0),
    results: Array.isArray(results) ? results : [],
    busy: Boolean(busy),
    error: text(error, 512)
  };
}

export function advancedSearchResultsMatch(state, {
  query = '',
  scope = 'library',
  generation = 0
} = {}) {
  return Boolean(state)
    && state.query === text(query, 512)
    && state.scope === (scope === 'vault' ? 'vault' : 'library')
    && state.generation === Math.max(0, Number(generation) || 0);
}

export function removeAdvancedQueryToken(query, rawToken) {
  const source = String(query || '');
  const token = String(rawToken || '').trim();
  if (!token) return source;
  const index = source.indexOf(token);
  if (index === -1) return source;
  return `${source.slice(0, index)} ${source.slice(index + token.length)}`
    .replace(/\s+/g, ' ')
    .trim();
}

export function moveSuggestionCursor(currentIndex, key, itemCount) {
  const count = Math.max(0, Number(itemCount) || 0);
  if (count === 0) return -1;
  if (key === 'ArrowDown') return currentIndex < count - 1 ? currentIndex + 1 : 0;
  if (key === 'ArrowUp') return currentIndex > 0 ? currentIndex - 1 : count - 1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return currentIndex;
}

export function shouldRecordRecentSearch({
  query,
  incognito = false,
  privateContext = false,
  vaultLocked = false
} = {}) {
  return Boolean(String(query || '').trim())
    && !incognito
    && !privateContext
    && !vaultLocked;
}

export function createRecentSearchStore(storage, {
  key = 'sawa.search.recents.v1',
  limit = 12
} = {}) {
  const boundedLimit = Math.max(1, Math.min(30, Number(limit) || 12));

  function read() {
    try {
      const parsed = JSON.parse(storage?.getItem?.(key) || '[]');
      return (Array.isArray(parsed) ? parsed : [])
        .map((entry) => text(entry, 512))
        .filter(Boolean)
        .slice(0, boundedLimit);
    } catch {
      return [];
    }
  }

  function write(entries) {
    try {
      storage?.setItem?.(key, JSON.stringify(entries.slice(0, boundedLimit)));
    } catch {
      // Recent searches are an optional local convenience.
    }
  }

  return {
    list: read,
    add(query, privacy = {}) {
      const normalized = text(query, 512);
      if (!shouldRecordRecentSearch({ query: normalized, ...privacy })) return read();
      const next = [normalized, ...read().filter((entry) => entry !== normalized)]
        .slice(0, boundedLimit);
      write(next);
      return next;
    },
    clear() {
      try {
        storage?.removeItem?.(key);
      } catch {
        write([]);
      }
      return [];
    }
  };
}

export function createDeferredSearchController({
  execute,
  delay = 240,
  setTimer = setTimeout,
  clearTimer = clearTimeout
} = {}) {
  if (typeof execute !== 'function') throw new TypeError('execute doit etre une fonction');
  let revision = 0;
  let pending = null;

  function settlePending(result) {
    if (!pending) return;
    pending.resolve(result);
    pending = null;
  }

  return {
    run(input) {
      revision += 1;
      const ownRevision = revision;
      if (pending) {
        clearTimer(pending.timer);
        pending.controller.abort();
        settlePending({ stale: true, cancelled: true });
      }
      const controller = new AbortController();
      return new Promise((resolve) => {
        const timer = setTimer(async () => {
          if (!pending || ownRevision !== revision) {
            resolve({ stale: true, cancelled: true });
            return;
          }
          pending.timer = null;
          try {
            const value = await execute(input, {
              signal: controller.signal,
              revision: ownRevision
            });
            if (ownRevision !== revision || controller.signal.aborted) {
              resolve({ stale: true, cancelled: true });
            } else {
              pending = null;
              resolve({ stale: false, value });
            }
          } catch (error) {
            if (ownRevision !== revision || controller.signal.aborted) {
              resolve({ stale: true, cancelled: true });
            } else {
              pending = null;
              resolve({ stale: false, error });
            }
          }
        }, Math.max(0, Number(delay) || 0));
        pending = { timer, controller, resolve };
      });
    },
    cancel() {
      revision += 1;
      if (!pending) return;
      if (pending.timer != null) clearTimer(pending.timer);
      pending.controller.abort();
      settlePending({ stale: true, cancelled: true });
    },
    getRevision() {
      return revision;
    }
  };
}

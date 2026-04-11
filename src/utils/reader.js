/**
 * Sawa Manga Library - Reader and library utilities
 */

const STRUCTURED_FIELDS = new Set([
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

const BOOL_TRUE = new Set(['1', 'true', 'yes', 'oui', 'on']);
const BOOL_FALSE = new Set(['0', 'false', 'no', 'non', 'off']);

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeBool(value) {
  const normalized = normalizeText(value);
  if (BOOL_TRUE.has(normalized)) return true;
  if (BOOL_FALSE.has(normalized)) return false;
  return null;
}

function tokenizeSearchQuery(query) {
  const source = String(query || '');
  const tokens = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }

    if (!inQuotes && /\s/.test(char)) {
      if (current.trim()) tokens.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

function unquote(value) {
  const trimmed = String(value || '').trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function getReadingState(manga) {
  return manga.readingState || (manga.isRead ? 'read' : manga.progressPercent > 0 ? 'in-progress' : 'never');
}

function resolveCollectionNames(manga, collectionsById = {}) {
  return Array.isArray(manga.collectionIds)
    ? manga.collectionIds
      .map((id) => collectionsById?.[id]?.name || id)
      .filter(Boolean)
    : [];
}

function buildSearchHaystack(manga, collectionsById = {}) {
  const fields = [
    manga.displayTitle,
    manga.name,
    manga.author,
    manga.description,
    ...(Array.isArray(manga.aliases) ? manga.aliases : []),
    ...(Array.isArray(manga.tags) ? manga.tags.map((tag) => tag?.name) : []),
    ...resolveCollectionNames(manga, collectionsById)
  ];
  return fields.filter(Boolean).join(' ').toLowerCase();
}

function parseFieldToken(token) {
  const rawToken = String(token || '').trim();
  if (!rawToken) return null;

  const compareMatch = rawToken.match(/^([a-z-]+)(<=|>=|<|>)(.+)$/i);
  if (compareMatch) {
    const [, fieldRaw, operator, valueRaw] = compareMatch;
    const field = normalizeText(fieldRaw);
    if (!STRUCTURED_FIELDS.has(field)) return null;
    return {
      kind: 'structured',
      raw: rawToken,
      field,
      operator,
      value: unquote(valueRaw)
    };
  }

  const separatorIndex = rawToken.indexOf(':');
  if (separatorIndex === -1) return null;

  const field = normalizeText(rawToken.slice(0, separatorIndex));
  if (!STRUCTURED_FIELDS.has(field)) return null;

  return {
    kind: 'structured',
    raw: rawToken,
    field,
    operator: ':',
    value: unquote(rawToken.slice(separatorIndex + 1))
  };
}

export function parseSearchQuery(query) {
  const raw = String(query || '').trim();
  const tokens = tokenizeSearchQuery(raw);
  const filters = [];
  const textTerms = [];

  tokens.forEach((token) => {
    const parsed = parseFieldToken(token);
    if (parsed && parsed.value) {
      filters.push(parsed);
      return;
    }
    textTerms.push(unquote(token));
  });

  return {
    raw,
    tokens,
    filters,
    textTerms: textTerms.filter(Boolean)
  };
}

function matchesStatusToken(manga, value) {
  const normalized = normalizeText(value);
  const readingState = getReadingState(manga);
  if (normalized === 'continue' || normalized === 'to-resume') {
    return readingState === 'in-progress' || readingState === 'to-resume';
  }
  if (normalized === 'unread' || normalized === 'never') {
    return readingState === 'never';
  }
  if (normalized === 'in-progress' || normalized === 'started') {
    return readingState === 'in-progress' || readingState === 'to-resume';
  }
  if (normalized === 'read' || normalized === 'completed') {
    return readingState === 'read';
  }
  return false;
}

function matchesMissingToken(manga, value) {
  const normalized = normalizeText(value);
  if (normalized === 'cover') return manga.coverType === 'default' || !manga.coverSrc;
  if (normalized === 'metadata') return (!manga.author || !manga.author.trim()) && (!manga.description || !manga.description.trim());
  if (normalized === 'description') return !manga.description || !manga.description.trim();
  return false;
}

function matchesStructuredFilter(manga, filter, context = {}) {
  const value = String(filter?.value || '').trim();
  const normalizedValue = normalizeText(value);
  const collectionsById = context.collectionsById || {};

  switch (filter?.field) {
    case 'tag':
      return Array.isArray(manga.tags) && manga.tags.some((tag) => {
        const tagId = normalizeText(tag?.id);
        const tagName = normalizeText(tag?.name);
        return tagId === normalizedValue || tagName === normalizedValue;
      });
    case 'status':
      return matchesStatusToken(manga, value);
    case 'favorite': {
      const boolValue = normalizeBool(value);
      return boolValue === null ? false : Boolean(manga.isFavorite) === boolValue;
    }
    case 'private': {
      const boolValue = normalizeBool(value);
      return boolValue === null ? false : Boolean(manga.isPrivate) === boolValue;
    }
    case 'author':
      return normalizeText(manga.author).includes(normalizedValue);
    case 'collection': {
      const names = resolveCollectionNames(manga, collectionsById).map(normalizeText);
      const ids = Array.isArray(manga.collectionIds) ? manga.collectionIds.map(normalizeText) : [];
      return [...names, ...ids].some((entry) => entry === normalizedValue || entry.includes(normalizedValue));
    }
    case 'missing':
      return matchesMissingToken(manga, value);
    case 'chapters': {
      const count = Number(manga.chapterCount || manga.chapters?.length || 0);
      const target = toFiniteNumber(value);
      if (target === null) return false;
      if (filter.operator === '>') return count > target;
      if (filter.operator === '>=') return count >= target;
      if (filter.operator === '<') return count < target;
      if (filter.operator === '<=') return count <= target;
      return count === target;
    }
    case 'added': {
      const days = toFiniteNumber(value);
      if (days === null || !manga.addedAt) return false;
      const ageDays = (Date.now() - new Date(manga.addedAt).getTime()) / 86400000;
      if (filter.operator === '>') return ageDays > days;
      if (filter.operator === '>=') return ageDays >= days;
      if (filter.operator === '<') return ageDays < days;
      if (filter.operator === '<=') return ageDays <= days;
      return Math.round(ageDays) === Math.round(days);
    }
    default:
      return true;
  }
}

export function applySearchQuery(mangas, query, context = {}) {
  const parsed = typeof query === 'string' ? parseSearchQuery(query) : query;
  if ((!parsed?.filters?.length) && (!parsed?.textTerms?.length)) {
    return mangas;
  }

  return mangas.filter((manga) => {
    const structuredMatch = (parsed.filters || []).every((filter) => matchesStructuredFilter(manga, filter, context));
    if (!structuredMatch) return false;
    if (!(parsed.textTerms || []).length) return true;
    const haystack = buildSearchHaystack(manga, context.collectionsById || {});
    return parsed.textTerms.every((term) => haystack.includes(normalizeText(term)));
  });
}

export function formatSearchChips(parsedQuery, context = {}) {
  const parsed = typeof parsedQuery === 'string' ? parseSearchQuery(parsedQuery) : parsedQuery;
  const collectionsById = context.collectionsById || {};
  const chips = [];

  (parsed.filters || []).forEach((filter) => {
    let label = `${filter.field}${filter.operator}${filter.value}`;
    if (filter.field === 'collection') {
      const value = String(filter.value || '').trim();
      const collection = Object.values(collectionsById).find((entry) => {
        const id = normalizeText(entry?.id);
        const name = normalizeText(entry?.name);
        const needle = normalizeText(value);
        return id === needle || name === needle;
      });
      if (collection?.name) label = `collection: ${collection.name}`;
    } else if (filter.field === 'tag') {
      label = `tag: ${filter.value}`;
    } else if (filter.field === 'author') {
      label = `auteur: ${filter.value}`;
    } else if (filter.field === 'status') {
      label = `statut: ${filter.value}`;
    } else if (filter.field === 'favorite') {
      label = filter.value === 'true' || filter.value === 'oui' ? 'favoris' : 'hors favoris';
    } else if (filter.field === 'private') {
      label = filter.value === 'true' || filter.value === 'oui' ? 'prive' : 'public';
    } else if (filter.field === 'missing') {
      label = `manque: ${filter.value}`;
    } else if (filter.field === 'chapters') {
      label = `chapitres ${filter.operator} ${filter.value}`;
    } else if (filter.field === 'added') {
      label = `ajout ${filter.operator} ${filter.value}j`;
    }
    chips.push({
      kind: 'filter',
      raw: filter.raw,
      label
    });
  });

  (parsed.textTerms || []).forEach((term) => {
    chips.push({
      kind: 'text',
      raw: term,
      label: `"${term}"`
    });
  });

  return chips;
}

function findCollectionByToken(collectionsById, value) {
  const needle = normalizeText(value);
  return Object.values(collectionsById || {}).find((entry) => {
    const id = normalizeText(entry?.id);
    const name = normalizeText(entry?.name);
    return id === needle || name === needle;
  }) || null;
}

function findTagByToken(tagsById, value) {
  const needle = normalizeText(value);
  return Object.values(tagsById || {}).find((entry) => {
    const id = normalizeText(entry?.id);
    const name = normalizeText(entry?.name);
    return id === needle || name === needle;
  }) || null;
}

export function buildSmartCollectionFromSearch(query, options = {}) {
  const parsed = typeof query === 'string' ? parseSearchQuery(query) : query;
  const tagsById = options.tagsById || {};
  const collectionsById = options.collectionsById || {};
  const conditions = [];
  const leftoverTerms = [...(parsed.textTerms || [])];

  (parsed.filters || []).forEach((filter) => {
    const value = String(filter.value || '').trim();
    switch (filter.field) {
      case 'status':
        if (matchesStatusToken({ readingState: 'never', isRead: false, progressPercent: 0 }, value)) {
          if (normalizeText(value) === 'unread' || normalizeText(value) === 'never') {
            conditions.push({ key: 'status', value: 'unread' });
          } else if (normalizeText(value) === 'in-progress' || normalizeText(value) === 'started' || normalizeText(value) === 'continue') {
            conditions.push({ key: 'status', value: 'in-progress' });
          } else if (normalizeText(value) === 'read' || normalizeText(value) === 'completed') {
            conditions.push({ key: 'status', value: 'completed' });
          }
        }
        break;
      case 'favorite': {
        const boolValue = normalizeBool(value);
        if (boolValue !== null) conditions.push({ key: 'favorite', value: boolValue });
        break;
      }
      case 'private': {
        const boolValue = normalizeBool(value);
        if (boolValue !== null) conditions.push({ key: 'private', value: boolValue });
        break;
      }
      case 'tag': {
        const tag = findTagByToken(tagsById, value);
        if (tag?.id) {
          conditions.push({ key: 'tag', value: tag.id });
        } else {
          leftoverTerms.push(`tag:${value}`);
        }
        break;
      }
      case 'collection': {
        const collection = findCollectionByToken(collectionsById, value);
        if (collection?.id) {
          conditions.push({ key: 'collection', value: collection.id });
        } else {
          leftoverTerms.push(`collection:${value}`);
        }
        break;
      }
      case 'missing':
        if (normalizeText(value) === 'cover') conditions.push({ key: 'missing-cover', value: true });
        else if (normalizeText(value) === 'metadata') conditions.push({ key: 'missing-metadata', value: true });
        else leftoverTerms.push(`missing:${value}`);
        break;
      case 'chapters': {
        const target = toFiniteNumber(value);
        if (target === null) break;
        if (filter.operator === '>' || filter.operator === '>=') conditions.push({ key: 'min-chapters', value: target });
        else if (filter.operator === '<' || filter.operator === '<=') conditions.push({ key: 'max-chapters', value: target });
        break;
      }
      case 'added': {
        const target = toFiniteNumber(value);
        if (target !== null && (filter.operator === '<' || filter.operator === '<=')) {
          conditions.push({ key: 'recent-added', value: target });
        } else {
          leftoverTerms.push(`added${filter.operator}${value}`);
        }
        break;
      }
      case 'author':
        leftoverTerms.push(value);
        break;
      default:
        leftoverTerms.push(filter.raw);
        break;
    }
  });

  if (leftoverTerms.length > 0) {
    conditions.push({
      key: 'query',
      value: leftoverTerms.join(' ')
    });
  }

  return {
    id: `smart-${Date.now()}`,
    name: options.name || 'Recherche sauvegardee',
    description: parsed.raw || 'Recherche avancee',
    isSmart: true,
    rules: {
      matchMode: 'all',
      sort: options.sort || 'title-asc',
      conditions
    }
  };
}

export function sortMangas(mangas, sortKey) {
  const list = [...mangas];
  switch (sortKey) {
    case 'title-desc':
      return list.sort((a, b) => b.displayTitle.localeCompare(a.displayTitle, undefined, { numeric: true }));
    case 'recent':
      return list.sort((a, b) => new Date(b.lastReadAt || 0).getTime() - new Date(a.lastReadAt || 0).getTime());
    case 'chapters-desc':
      return list.sort((a, b) => b.chapterCount - a.chapterCount);
    case 'pages-desc':
      return list.sort((a, b) => (b.pageCount || 0) - (a.pageCount || 0));
    case 'favorites':
      return list.sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));
    case 'added-recent':
      return list.sort((a, b) => new Date(b.addedAt || b.modifiedAt || 0).getTime() - new Date(a.addedAt || a.modifiedAt || 0).getTime());
    case 'added-oldest':
      return list.sort((a, b) => new Date(a.addedAt || a.modifiedAt || 0).getTime() - new Date(b.addedAt || b.modifiedAt || 0).getTime());
    case 'progress-desc':
      return list.sort((a, b) => (b.progressPercent || 0) - (a.progressPercent || 0));
    case 'progress-asc':
      return list.sort((a, b) => (a.progressPercent || 0) - (b.progressPercent || 0));
    case 'updated-recent':
      return list.sort((a, b) => new Date(b.modifiedAt || 0).getTime() - new Date(a.modifiedAt || 0).getTime());
    case 'title-asc':
    default:
      return list.sort((a, b) => a.displayTitle.localeCompare(b.displayTitle, undefined, { numeric: true }));
  }
}

export function buildDoubleSpreadRanges(pageCount) {
  if (pageCount <= 0) return [];
  const ranges = [{ start: 0, end: 0 }];
  for (let index = 1; index < pageCount; index += 2) {
    ranges.push({ start: index, end: Math.min(index + 1, pageCount - 1) });
  }
  return ranges;
}

export function buildMangaJPSpreadRanges(pageCount) {
  if (pageCount <= 0) return [];
  const ranges = [{ start: 0, end: 0, isRTL: false }];
  for (let index = 1; index < pageCount; index += 2) {
    const end = Math.min(index + 1, pageCount - 1);
    ranges.push({ start: index, end, isRTL: true });
  }
  return ranges;
}

export function getProgressPercent(progress) {
  if (!progress || typeof progress.pageIndex !== 'number' || !progress.pageCount) return 0;
  return Math.max(0, Math.min(100, Math.round(((progress.pageIndex + 1) / progress.pageCount) * 100)));
}

export function filterMangas(mangas, filters = {}) {
  let result = mangas;

  if (filters.readStatus && filters.readStatus !== 'all') {
    result = result.filter((m) => {
      const state = m.readingState || (m.isRead ? 'read' : m.progressPercent > 0 ? 'in-progress' : 'never');
      switch (filters.readStatus) {
        case 'unread': return state === 'never';
        case 'in-progress': return state === 'in-progress' || state === 'to-resume';
        case 'read': return state === 'read';
        default: return true;
      }
    });
  }

  if (filters.favoriteOnly) {
    result = result.filter((m) => m.isFavorite);
  }

  if (filters.hasDescription === true) {
    result = result.filter((m) => m.description && m.description.trim().length > 0);
  } else if (filters.hasDescription === false) {
    result = result.filter((m) => !m.description || m.description.trim().length === 0);
  }

  if (filters.hasCustomCover === true) {
    result = result.filter((m) => m.coverType === 'custom');
  } else if (filters.hasCustomCover === false) {
    result = result.filter((m) => m.coverType !== 'custom');
  }

  if (Array.isArray(filters.tags) && filters.tags.length > 0) {
    const tagSet = new Set(filters.tags);
    result = result.filter((m) => {
      const mTags = Array.isArray(m.tags) ? m.tags.map((t) => t.id) : [];
      return mTags.some((t) => tagSet.has(t));
    });
  }

  if (Array.isArray(filters.collections) && filters.collections.length > 0) {
    const colSet = new Set(filters.collections);
    result = result.filter((m) => {
      const mCols = Array.isArray(m.collectionIds) ? m.collectionIds : [];
      return mCols.some((c) => colSet.has(c));
    });
  }

  return result;
}

export function searchMangas(mangas, query) {
  return applySearchQuery(mangas, query);
}

function defaultSmartCollectionForId(smartId) {
  return persistedFallbackSmartCollections[smartId] || { id: smartId, rules: { type: smartId } };
}

const persistedFallbackSmartCollections = {
  'smart-continue': { id: 'smart-continue', rules: { type: 'in-progress' } },
  'smart-unread': { id: 'smart-unread', rules: { type: 'unread' } },
  'smart-in-progress': { id: 'smart-in-progress', rules: { type: 'started' } },
  'smart-completed': { id: 'smart-completed', rules: { type: 'completed' } },
  'smart-favorites': { id: 'smart-favorites', rules: { type: 'favorites' } },
  'smart-recent-added': { id: 'smart-recent-added', rules: { type: 'recent-added', days: 30 } },
  'smart-recent-read': { id: 'smart-recent-read', rules: { type: 'recent-read', days: 14 } },
  'smart-new-chapters': { id: 'smart-new-chapters', rules: { type: 'new-chapters' } },
  'smart-no-cover': { id: 'smart-no-cover', rules: { type: 'no-cover' } },
  'smart-no-metadata': { id: 'smart-no-metadata', rules: { type: 'no-metadata' } }
};

function matchesSmartQuery(manga, value) {
  const needle = String(value || '').trim().toLowerCase();
  if (!needle) return true;
  const fields = [
    manga.displayTitle,
    manga.name,
    manga.author,
    manga.description,
    ...(Array.isArray(manga.aliases) ? manga.aliases : []),
    ...(Array.isArray(manga.tags) ? manga.tags.map((tag) => tag.name) : [])
  ];
  return fields.filter(Boolean).join(' ').toLowerCase().includes(needle);
}

function matchesSmartCondition(manga, condition = {}, now, dayMs) {
  const key = String(condition.key || '').trim();
  const value = condition.value;
  const readingState = manga.readingState || (manga.isRead ? 'read' : manga.progressPercent > 0 ? 'in-progress' : 'never');

  switch (key) {
    case 'status':
      if (value === 'continue') return readingState === 'in-progress' || readingState === 'to-resume';
      if (value === 'unread') return !manga.isRead && (!manga.progressPercent || manga.progressPercent === 0);
      if (value === 'in-progress') return manga.progressPercent > 0 && !manga.isRead;
      if (value === 'completed') return manga.isRead;
      return true;
    case 'favorite':
      return Boolean(manga.isFavorite) === Boolean(value);
    case 'tag':
      return Array.isArray(manga.tags) && manga.tags.some((tag) => tag.id === value);
    case 'collection':
      return Array.isArray(manga.collectionIds) && manga.collectionIds.includes(value);
    case 'missing-cover':
      return manga.coverType === 'default' || !manga.coverSrc;
    case 'missing-metadata':
      return (!manga.author || !manga.author.trim()) && (!manga.description || !manga.description.trim());
    case 'new-chapters':
      return Boolean(manga.hasNewChapters);
    case 'recent-added': {
      const days = Number(value || 30);
      return manga.addedAt && (now - new Date(manga.addedAt).getTime()) < days * dayMs;
    }
    case 'recent-read': {
      const days = Number(value || 14);
      return manga.lastReadAt && (now - new Date(manga.lastReadAt).getTime()) < days * dayMs;
    }
    case 'query':
      return matchesSmartQuery(manga, value);
    case 'min-chapters':
      return Number(manga.chapterCount || 0) >= Number(value || 0);
    case 'max-chapters':
      return Number(manga.chapterCount || 0) <= Number(value || 0);
    case 'private':
      return Boolean(manga.isPrivate) === Boolean(value);
    default:
      return true;
  }
}

function applyLegacySmartCollection(allMangas, rulesOrId, now, dayMs) {
  const smartType = typeof rulesOrId === 'string' ? rulesOrId : rulesOrId?.type;

  switch (smartType) {
    case 'smart-continue': {
      return allMangas.filter((m) => {
        const state = m.readingState || (m.progressPercent > 0 && !m.isRead ? 'in-progress' : null);
        return state === 'in-progress' || state === 'to-resume';
      }).sort((a, b) => new Date(b.lastReadAt || 0).getTime() - new Date(a.lastReadAt || 0).getTime());
    }
    case 'smart-unread':
      return allMangas.filter((m) => !m.isRead && (!m.progressPercent || m.progressPercent === 0));
    case 'smart-in-progress':
      return allMangas.filter((m) => m.progressPercent > 0 && !m.isRead);
    case 'smart-completed':
      return allMangas.filter((m) => m.isRead);
    case 'smart-favorites':
      return allMangas.filter((m) => m.isFavorite);
    case 'smart-recent-added':
      return allMangas
        .filter((m) => m.addedAt && (now - new Date(m.addedAt).getTime()) < Number(rulesOrId?.days || 30) * dayMs)
        .sort((a, b) => new Date(b.addedAt || 0).getTime() - new Date(a.addedAt || 0).getTime());
    case 'smart-recent-read':
      return allMangas
        .filter((m) => m.lastReadAt && (now - new Date(m.lastReadAt).getTime()) < Number(rulesOrId?.days || 14) * dayMs)
        .sort((a, b) => new Date(b.lastReadAt || 0).getTime() - new Date(a.lastReadAt || 0).getTime());
    case 'smart-new-chapters':
      return allMangas.filter((m) => m.hasNewChapters);
    case 'smart-no-cover':
      return allMangas.filter((m) => m.coverType === 'default' || !m.coverSrc);
    case 'smart-no-metadata':
      return allMangas.filter((m) => (!m.author || !m.author.trim()) && (!m.description || !m.description.trim()));
    default:
      return [];
  }
}

export function resolveSmartCollection(allMangas, smartCollectionOrId, persisted = {}) {
  const now = Date.now();
  const dayMs = 86400000;
  const collection = typeof smartCollectionOrId === 'string'
    ? (persisted?.smartCollections?.[smartCollectionOrId] || defaultSmartCollectionForId(smartCollectionOrId))
    : smartCollectionOrId;

  if (!collection) return [];

  const rules = collection.rules || {};
  const legacyType = rules.type || collection.id;
  const isLegacyRule = typeof rules.type === 'string' && !Array.isArray(rules.conditions);
  if (isLegacyRule || String(collection.id || '').startsWith('smart-')) {
    const legacyResults = applyLegacySmartCollection(allMangas, { ...rules, type: legacyType }, now, dayMs);
    if (legacyResults.length > 0 || isLegacyRule) return legacyResults;
  }

  const conditions = Array.isArray(rules.conditions) ? rules.conditions.filter(Boolean) : [];
  if (conditions.length === 0) return [];

  const matchMode = rules.matchMode === 'any' ? 'any' : 'all';
  const matched = allMangas.filter((manga) => {
    const results = conditions.map((condition) => matchesSmartCondition(manga, condition, now, dayMs));
    return matchMode === 'any' ? results.some(Boolean) : results.every(Boolean);
  });

  const sortKey = String(rules.sort || 'title-asc');
  switch (sortKey) {
    case 'recent-read':
      return [...matched].sort((a, b) => new Date(b.lastReadAt || 0).getTime() - new Date(a.lastReadAt || 0).getTime());
    case 'recent-added':
      return [...matched].sort((a, b) => new Date(b.addedAt || 0).getTime() - new Date(a.addedAt || 0).getTime());
    case 'progress-desc':
      return [...matched].sort((a, b) => (b.progressPercent || 0) - (a.progressPercent || 0));
    case 'chapters-desc':
      return [...matched].sort((a, b) => (b.chapterCount || 0) - (a.chapterCount || 0));
    case 'title-desc':
      return [...matched].sort((a, b) => b.displayTitle.localeCompare(a.displayTitle, undefined, { numeric: true }));
    case 'title-asc':
    default:
      return [...matched].sort((a, b) => a.displayTitle.localeCompare(b.displayTitle, undefined, { numeric: true }));
  }
}

export function buildMangaAggregate(manga) {
  const chapters = Array.isArray(manga?.chapters) ? manga.chapters : [];
  const completedChapterCount = chapters.filter((ch) => ch.isRead).length;
  const progressUnits = chapters.reduce((sum, ch) => {
    if (ch.isRead) return sum + 1;
    if (ch.progress?.pageCount) {
      return sum + Math.max(0, Math.min(1, (ch.progress.pageIndex + 1) / ch.progress.pageCount));
    }
    return sum;
  }, 0);
  const progressPercent = chapters.length
    ? Math.max(0, Math.min(100, Math.round((progressUnits / chapters.length) * 100)))
    : 0;

  let readingState = 'never';
  if (chapters.length > 0 && completedChapterCount === chapters.length) {
    readingState = 'read';
  } else if (progressPercent > 0) {
    readingState = 'in-progress';
  }

  return {
    ...manga,
    completedChapterCount,
    progressPercent,
    isRead: chapters.length > 0 && completedChapterCount === chapters.length,
    readingState,
    progress: {
      percent: progressPercent,
      completedChapterCount,
      totalChapterCount: chapters.length,
      lastChapterId: manga?.lastProgress?.chapterId ?? null
    }
  };
}

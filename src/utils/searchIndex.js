import { parseSearchQuery } from './reader.js';
import { normalizeSearchFilter } from './searchSession.js';

const GROUP_PRIORITY = Object.freeze({
  manga: 0,
  author: 1,
  tag: 2,
  collection: 3,
  filter: 4,
  recent: 5
});

export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[’']/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function words(value) {
  return normalizeSearchText(value).split(' ').filter(Boolean);
}

function boundedEditDistanceOne(left, right) {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  let mismatches = 0;
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    mismatches += 1;
    if (mismatches > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  if (leftIndex < left.length || rightIndex < right.length) mismatches += 1;
  return mismatches <= 1;
}

function valuesFromTags(manga) {
  return (Array.isArray(manga?.tags) ? manga.tags : [])
    .map((tag) => typeof tag === 'string' ? tag : tag?.name || tag?.id)
    .filter(Boolean);
}

function entityLabel(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (!value || typeof value !== 'object') return '';
  return String(value.name || value.title || value.value || value.label || '').trim();
}

function collectionNamesFor(manga, collectionsById) {
  return (Array.isArray(manga?.collectionIds) ? manga.collectionIds : [])
    .map((id) => collectionsById?.[id]?.name || id)
    .filter(Boolean);
}

export function buildCompactSearchIndex(mangas = [], {
  collectionsById = {},
  tags = []
} = {}) {
  const entries = (Array.isArray(mangas) ? mangas : [])
    .filter((manga) => manga?.id)
    .map((manga, order) => {
      const title = String(manga.displayTitle || manga.name || '').trim();
      const aliases = (Array.isArray(manga.aliases) ? manga.aliases : [])
        .map(entityLabel)
        .filter(Boolean);
      const authors = [
        manga.author,
        manga.artist,
        ...(Array.isArray(manga.authors) ? manga.authors : [])
      ].map(entityLabel).filter(Boolean);
      const tagNames = valuesFromTags(manga);
      const collectionNames = collectionNamesFor(manga, collectionsById);
      return {
        id: String(manga.id),
        manga,
        order,
        isPrivate: Boolean(manga.isPrivate),
        title,
        titleKey: normalizeSearchText(title),
        aliases,
        aliasKeys: aliases.map(normalizeSearchText),
        authors,
        authorKeys: authors.map(normalizeSearchText),
        tags: tagNames,
        tagKeys: tagNames.map(normalizeSearchText),
        collections: collectionNames,
        collectionKeys: collectionNames.map(normalizeSearchText)
      };
    });

  const knownTags = new Set((Array.isArray(tags) ? tags : [])
    .map((tag) => typeof tag === 'string' ? tag : tag?.name)
    .filter(Boolean));
  entries.forEach((entry) => entry.tags.forEach((tag) => knownTags.add(tag)));

  return {
    entries,
    collections: Object.values(collectionsById || {})
      .filter((entry) => entry?.name)
      .map((entry) => ({ id: String(entry.id), name: String(entry.name) })),
    tags: [...knownTags],
    createdAt: Date.now()
  };
}

function fieldScore(term, values, exactScore, prefixScore, containsScore, typoScore) {
  let best = 0;
  for (const rawValue of values) {
    const value = normalizeSearchText(rawValue);
    if (!value) continue;
    if (value === term) best = Math.max(best, exactScore);
    else if (value.startsWith(term)) best = Math.max(best, prefixScore);
    else if (value.includes(term)) best = Math.max(best, containsScore);
    else if (term.length >= 4 && words(value).some((word) => boundedEditDistanceOne(term, word))) {
      best = Math.max(best, typoScore);
    }
  }
  return best;
}

function textMatchScore(entry, terms, rawQuery) {
  if (!terms.length) return 1;
  let total = entry.titleKey === rawQuery ? 2400 : entry.titleKey.startsWith(rawQuery) ? 1600 : 0;
  for (const term of terms) {
    const score = Math.max(
      fieldScore(term, [entry.titleKey], 1200, 950, 760, 580),
      fieldScore(term, entry.aliasKeys, 850, 740, 620, 460),
      fieldScore(term, entry.authorKeys, 650, 560, 440, 320),
      fieldScore(term, entry.tagKeys, 480, 410, 340, 250),
      fieldScore(term, entry.collectionKeys, 360, 310, 260, 190)
    );
    if (!score) return 0;
    total += score;
  }
  return total;
}

function booleanValue(value) {
  const normalized = normalizeSearchText(value);
  if (['1', 'true', 'yes', 'oui', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'non', 'off'].includes(normalized)) return false;
  return null;
}

function compareNumber(actual, operator, expected) {
  if (!Number.isFinite(expected)) return false;
  if (operator === '>') return actual > expected;
  if (operator === '>=') return actual >= expected;
  if (operator === '<') return actual < expected;
  if (operator === '<=') return actual <= expected;
  return actual === expected;
}

function matchesFilter(entry, rawFilter) {
  const filter = normalizeSearchFilter(rawFilter);
  if (!filter) return true;
  const manga = entry.manga;
  const needle = normalizeSearchText(filter.value);
  switch (filter.field) {
    case 'tag':
      return entry.tagKeys.some((value) => value === needle || value.includes(needle));
    case 'author':
      return entry.authorKeys.some((value) => value.includes(needle));
    case 'collection':
      return entry.collectionKeys.some((value) => value === needle || value.includes(needle));
    case 'favorite': {
      const expected = booleanValue(filter.value);
      return expected !== null && Boolean(manga.isFavorite) === expected;
    }
    case 'private': {
      const expected = booleanValue(filter.value);
      return expected !== null && entry.isPrivate === expected;
    }
    case 'status': {
      const state = normalizeSearchText(manga.readingState || (manga.isRead ? 'read' : manga.progressPercent > 0 ? 'in progress' : 'never'));
      if (['unread', 'never'].includes(needle)) return state === 'never';
      if (['read', 'completed'].includes(needle)) return state === 'read';
      if (['continue', 'started', 'in progress', 'to resume'].includes(needle)) return ['in progress', 'to resume'].includes(state);
      return state === needle;
    }
    case 'missing':
      if (needle === 'cover') return manga.coverType === 'default' || !manga.coverSrc;
      if (needle === 'metadata') return !String(manga.author || '').trim() && !String(manga.description || '').trim();
      if (needle === 'description') return !String(manga.description || '').trim();
      return false;
    case 'chapters':
      return compareNumber(Number(manga.chapterCount || manga.chapters?.length || 0), filter.operator, Number(filter.value));
    case 'added': {
      const timestamp = new Date(manga.addedAt || 0).getTime();
      if (!timestamp) return false;
      const age = (Date.now() - timestamp) / 86400000;
      return compareNumber(age, filter.operator, Number(filter.value));
    }
    default:
      return true;
  }
}

function advancedFilters(query) {
  const parsed = parseSearchQuery(query);
  return {
    terms: parsed.textTerms.map(normalizeSearchText).filter(Boolean),
    filters: parsed.filters.map((filter, index) => normalizeSearchFilter({
      ...filter,
      id: `advanced-${index}`
    })).filter(Boolean),
    parsed
  };
}

export function searchCompactIndex(index, {
  query = '',
  filters = [],
  scopeIds = null,
  includePrivate = false,
  extendedIds = null
} = {}) {
  const parsed = advancedFilters(query);
  const rawQuery = normalizeSearchText(parsed.terms.join(' '));
  const allowed = scopeIds instanceof Set ? scopeIds : null;
  const extended = extendedIds instanceof Set ? extendedIds : null;
  const allFilters = [...parsed.filters, ...(Array.isArray(filters) ? filters : [])];

  return (index?.entries || [])
    .filter((entry) => (!allowed || allowed.has(entry.id)))
    .filter((entry) => includePrivate || !entry.isPrivate)
    .filter((entry) => allFilters.every((filter) => matchesFilter(entry, filter)))
    .map((entry) => {
      const localScore = textMatchScore(entry, parsed.terms, rawQuery);
      const extendedMatch = parsed.terms.length > 0 && extended?.has(entry.id);
      if (!localScore && !extendedMatch) return null;
      return {
        id: entry.id,
        manga: entry.manga,
        score: localScore || 80,
        match: localScore ? 'local' : 'extended'
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.manga.displayTitle?.localeCompare(right.manga.displayTitle, 'fr') || left.id.localeCompare(right.id));
}

function highlightRanges(label, query) {
  const normalizedLabel = normalizeSearchText(label);
  const normalizedQuery = normalizeSearchText(query);
  const index = normalizedLabel.indexOf(normalizedQuery);
  return index >= 0 && normalizedQuery ? [{ start: index, end: index + normalizedQuery.length }] : [];
}

function suggestion(group, label, value, extra = {}) {
  return {
    id: `${group}:${extra.id || normalizeSearchText(value)}`,
    group,
    label,
    value,
    highlight: highlightRanges(label, value),
    ...extra
  };
}

export function getSearchSuggestions(index, query, {
  limit = 8,
  recents = [],
  includePrivate = false,
  scopeIds = null
} = {}) {
  const needle = normalizeSearchText(query);
  if (needle.length < 2) {
    return (Array.isArray(recents) ? recents : [])
      .slice(0, Math.max(0, limit))
      .map((entry) => suggestion('recent', entry, entry));
  }

  const output = [];
  const seen = new Set();
  const visibleEntries = (index?.entries || []).filter((entry) => (
    (!(scopeIds instanceof Set) || scopeIds.has(entry.id))
    && (includePrivate || !entry.isPrivate)
  ));
  const add = (item) => {
    const identity = `${item.group}:${normalizeSearchText(item.label)}`;
    if (!seen.has(identity)) {
      seen.add(identity);
      output.push(item);
    }
  };

  visibleEntries.forEach((entry) => {
    const titleScore = fieldScore(needle, [entry.titleKey], 100, 90, 70, 45);
    if (titleScore) add(suggestion('manga', entry.title, entry.title, { id: entry.id, score: titleScore, mangaId: entry.id }));
    if (!titleScore) {
      entry.aliases.forEach((alias) => {
        const score = fieldScore(needle, [alias], 88, 78, 62, 40);
        if (score) add(suggestion('manga', alias, alias, {
          id: entry.id,
          score,
          mangaId: entry.id,
          secondary: entry.title
        }));
      });
    }
    entry.authors.forEach((author) => {
      const score = fieldScore(needle, [author], 70, 60, 45, 30);
      if (score) add(suggestion('author', author, author, { score, token: `author:"${author}"` }));
    });
  });
  const visibleTags = new Set(visibleEntries.flatMap((entry) => entry.tags));
  const visibleCollections = new Map();
  visibleEntries.forEach((entry) => {
    entry.collections.forEach((name) => visibleCollections.set(normalizeSearchText(name), name));
  });
  visibleTags.forEach((tag) => {
    const score = fieldScore(needle, [tag], 55, 48, 36, 24);
    if (score) add(suggestion('tag', tag, tag, { score, token: `tag:"${tag}"` }));
  });
  visibleCollections.forEach((name, normalizedName) => {
    const score = fieldScore(needle, [name], 50, 44, 32, 22);
    if (score) add(suggestion('collection', name, name, {
      id: normalizedName,
      score,
      token: `collection:"${name}"`
    }));
  });

  const filterCandidates = [
    {
      label: 'Non lus',
      token: 'status:unread',
      available: visibleEntries.some((entry) => !entry.manga.isRead && !(Number(entry.manga.progressPercent) > 0))
    },
    {
      label: 'En cours',
      token: 'status:in-progress',
      available: visibleEntries.some((entry) => Number(entry.manga.progressPercent) > 0 && !entry.manga.isRead)
    },
    {
      label: 'Favoris',
      token: 'favorite:true',
      available: visibleEntries.some((entry) => entry.manga.isFavorite)
    },
    {
      label: 'Sans couverture',
      token: 'missing:cover',
      available: visibleEntries.some((entry) => entry.manga.coverType === 'default' || !entry.manga.coverSrc)
    }
  ];
  filterCandidates.filter((filter) => filter.available).forEach((filter) => {
    const score = fieldScore(needle, [filter.label], 40, 35, 28, 18);
    if (score) add(suggestion('filter', filter.label, filter.label, { score, token: filter.token }));
  });

  return output
    .sort((left, right) => GROUP_PRIORITY[left.group] - GROUP_PRIORITY[right.group]
      || (right.score || 0) - (left.score || 0)
      || left.label.localeCompare(right.label, 'fr'))
    .slice(0, Math.max(1, Math.min(8, Number(limit) || 8)));
}

export function mergeSuggestionIntoQuery(query, item) {
  const token = item?.token || item?.value || '';
  if (!token) return String(query || '');
  if (item?.group === 'manga' || item?.group === 'recent') return token;
  return `${String(query || '').trim()} ${token}`.trim();
}

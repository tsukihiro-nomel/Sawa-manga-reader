function toLegacySeriesRecord(manga = {}) {
  const tags = Array.isArray(manga.tags) ? manga.tags : [];
  const record = {
    id: manga.id,
    contentId: manga.contentId || null,
    locationId: manga.locationId || null,
    legacyId: manga.legacyId || manga.id || null,
    libraryId: manga.categoryId || null,
    title: manga.displayTitle || manga.name || manga.id,
    author: manga.author || '',
    description: manga.description || '',
    path: manga.path || null,
    coverSrc: manga.coverSrc || null,
    pageCount: Number(manga.pageCount || 0),
    chapterCount: Number(manga.chapterCount || manga.chapters?.length || 0),
    favorite: Boolean(manga.isFavorite),
    readState: manga.readingState || (manga.isRead ? 'read' : 'never'),
    progressPercent: Number(manga.progressPercent || 0),
    lastReadAt: manga.lastReadAt || null,
    tags,
    collectionIds: Array.isArray(manga.collectionIds) ? manga.collectionIds : [],
    payload: manga
  };

  Object.defineProperty(record, 'searchText', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: [
      record.title,
      record.author,
      record.description,
      ...tags.map((tag) => tag?.name || tag?.id || '')
    ].map((value) => String(value || '').toLocaleLowerCase()).join('\n')
  });
  return record;
}

function buildLegacySeriesIndex(library = {}) {
  return (Array.isArray(library?.allMangas) ? library.allMangas : [])
    .filter((manga) => manga?.id)
    .map(toLegacySeriesRecord);
}

function queryLegacySeriesIndex(index = [], options = {}) {
  const query = String(options?.query || '').trim().toLocaleLowerCase();
  const limit = Math.max(1, Math.min(500, Number(options?.limit) || 50));
  const offset = Math.max(0, Number(options?.offset) || 0);
  const includePayload = options?.includePayload !== false;
  let items = Array.isArray(index) ? index : [];

  if (query) items = items.filter((series) => series.searchText.includes(query));
  if (options?.favoriteOnly) items = items.filter((series) => series.favorite);

  const total = items.length;
  const page = items.slice(offset, offset + limit).map((series) => {
    if (includePayload) return series;
    const { payload: _payload, ...compact } = series;
    return compact;
  });

  return {
    source: 'legacy-memory-index',
    total,
    limit,
    offset,
    items: page
  };
}

module.exports = {
  buildLegacySeriesIndex,
  queryLegacySeriesIndex,
  toLegacySeriesRecord
};

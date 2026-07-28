export const COLLECTION_APPEARANCE_OPTIONS = [
  { value: 'mosaic', label: 'Mosaïque' },
  { value: 'banner', label: 'Bannière' },
  { value: 'single', label: 'Couverture unique' },
  { value: 'stack', label: 'Pile' }
];

export function normalizeCollectionAppearance(value) {
  const validTypes = new Set(COLLECTION_APPEARANCE_OPTIONS.map((option) => option.value));
  const type = typeof value === 'string' ? value : value?.type;
  return {
    type: validTypes.has(type) ? type : 'mosaic',
    featuredMangaIds: [...new Set((Array.isArray(value?.featuredMangaIds) ? value.featuredMangaIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean))]
      .slice(0, 4)
  };
}

export function resolveCollectionCoverMangas(collection, mangas = []) {
  const appearance = normalizeCollectionAppearance(collection?.appearance);
  const limit = appearance.type === 'single' || appearance.type === 'banner' ? 1 : 4;
  const available = new Map((Array.isArray(mangas) ? mangas : [])
    .filter((manga) => manga?.id)
    .map((manga) => [String(manga.id), manga]));
  const selected = [];
  appearance.featuredMangaIds.forEach((id) => {
    const manga = available.get(String(id));
    if (manga && !selected.some((entry) => entry.id === manga.id)) selected.push(manga);
  });
  for (const manga of available.values()) {
    if (selected.length >= limit) break;
    if (!selected.some((entry) => entry.id === manga.id)) selected.push(manga);
  }
  return selected.slice(0, limit);
}

export function toggleFeaturedManga(appearance, mangaId) {
  const normalized = normalizeCollectionAppearance(appearance);
  const id = String(mangaId || '').trim();
  if (!id) return normalized;
  const active = normalized.featuredMangaIds.includes(id);
  return {
    ...normalized,
    featuredMangaIds: active
      ? normalized.featuredMangaIds.filter((value) => value !== id)
      : [...normalized.featuredMangaIds, id].slice(-4)
  };
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR')
    .trim();
}

export function getFeaturedMangaPage(mangas = [], options = {}) {
  const query = normalizeSearchText(options.query);
  const pageSize = Math.max(10, Math.min(100, Number(options.pageSize) || 40));
  const filtered = (Array.isArray(mangas) ? mangas : []).filter((manga) => {
    if (!query) return true;
    return normalizeSearchText(`${manga?.displayTitle || manga?.name || ''} ${manga?.author || ''}`).includes(query);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.max(0, Math.min(totalPages - 1, Math.floor(Number(options.page) || 0)));
  return {
    items: filtered.slice(page * pageSize, (page + 1) * pageSize),
    page,
    pageSize,
    total: filtered.length,
    totalPages
  };
}

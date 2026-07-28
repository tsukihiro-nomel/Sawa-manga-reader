function normalizedReference(value) {
  return String(value || '').trim();
}

function entityReferences(entity = {}) {
  return [entity.id, entity.contentId, entity.locationId, entity.legacyId]
    .map(normalizedReference)
    .filter(Boolean);
}

function buildPrivateMangaIds(state = {}, rawLibrary = {}) {
  const mangas = Array.isArray(rawLibrary?.allMangas) ? rawLibrary.allMangas : [];
  const mangaByReference = new Map();
  mangas.forEach((manga) => {
    entityReferences(manga).forEach((reference) => mangaByReference.set(reference, manga));
  });

  const privateIds = new Set();
  const directIds = Array.isArray(state?.vault?.privateMangaIds) ? state.vault.privateMangaIds : [];
  directIds.forEach((reference) => {
    const manga = mangaByReference.get(normalizedReference(reference));
    if (manga?.id) privateIds.add(String(manga.id));
  });

  const privateCategoryIds = new Set(
    (Array.isArray(state?.vault?.privateCategoryIds) ? state.vault.privateCategoryIds : [])
      .map(normalizedReference)
      .filter(Boolean)
  );
  mangas.forEach((manga) => {
    if (privateCategoryIds.has(normalizedReference(manga?.categoryId)) && manga?.id) {
      privateIds.add(String(manga.id));
    }
  });
  (Array.isArray(rawLibrary?.categories) ? rawLibrary.categories : []).forEach((category) => {
    if (!privateCategoryIds.has(normalizedReference(category?.id))) return;
    (Array.isArray(category?.mangas) ? category.mangas : []).forEach((manga) => {
      const canonical = mangaByReference.get(normalizedReference(manga?.id));
      if (canonical?.id) privateIds.add(String(canonical.id));
    });
  });
  return privateIds;
}

function buildAllowedReferences({ state = {}, rawLibrary = {}, scope = 'library' } = {}) {
  const mangas = Array.isArray(rawLibrary?.allMangas) ? rawLibrary.allMangas : [];
  const privateIds = buildPrivateMangaIds(state, rawLibrary);
  const requestedScope = scope === 'vault' ? 'vault' : 'library';
  const vaultSearchAllowed = !Boolean(state?.vault?.locked) && !Boolean(state?.vault?.stealthMode);
  const allowedMangas = requestedScope === 'vault'
    ? (vaultSearchAllowed ? mangas.filter((manga) => privateIds.has(String(manga?.id))) : [])
    : mangas.filter((manga) => !privateIds.has(String(manga?.id)));

  const references = new Set();
  allowedMangas.forEach((manga) => {
    entityReferences(manga).forEach((reference) => references.add(reference));
    (Array.isArray(manga?.chapters) ? manga.chapters : []).forEach((chapter) => {
      entityReferences(chapter).forEach((reference) => references.add(reference));
    });
  });
  return {
    requestedScope,
    references,
    allowedMangaIds: new Set(allowedMangas.map((manga) => String(manga.id))),
    privateMangaIds: privateIds
  };
}

function sanitizeAllowedSearchDocument(document, allowedReferences) {
  if (!document || typeof document !== 'object') return null;
  const contentReference = normalizedReference(document.itemContentId || document.contentId);
  const locationReference = normalizedReference(document.itemLocationId || document.locationId);
  const primaryReference = locationReference || contentReference;
  if (!primaryReference || !allowedReferences.has(primaryReference)) return null;

  const allowedContentReference = contentReference && allowedReferences.has(contentReference)
    ? contentReference
    : null;
  const allowedLocationReference = locationReference && allowedReferences.has(locationReference)
    ? locationReference
    : null;
  if (!allowedContentReference && !allowedLocationReference) return null;
  const rawDocType = normalizedReference(document.docType).toLowerCase();
  const docType = ['manga', 'chapter', 'ocr'].includes(rawDocType) ? rawDocType : 'document';
  return {
    itemContentId: allowedContentReference,
    itemLocationId: allowedLocationReference,
    docType
  };
}

function filterSearchDocumentsForAccess(documents, access, limit = 50) {
  const maxResults = Math.max(1, Math.min(120, Number(limit) || 50));
  const results = [];
  for (const document of Array.isArray(documents) ? documents : []) {
    const sanitized = sanitizeAllowedSearchDocument(document, access?.references || new Set());
    if (!sanitized) continue;
    results.push(sanitized);
    if (results.length >= maxResults) break;
  }
  return results;
}

function runPrivacySafeAdvancedSearch({
  input = {},
  state = {},
  rawLibrary = {},
  searchDocuments
} = {}) {
  const request = typeof input === 'string' ? { query: input } : (input || {});
  const query = String(request.query || '').trim().slice(0, 512);
  const limit = Math.max(1, Math.min(120, Number(request.limit) || 50));
  const scope = request.scope === 'vault' ? 'vault' : 'library';
  const access = buildAllowedReferences({ state, rawLibrary, scope });
  if (!query || access.references.size === 0 || typeof searchDocuments !== 'function') {
    return { query, scope: access.requestedScope, results: [] };
  }

  // Fetch beyond the requested page so inaccessible private matches cannot crowd
  // public matches out before the server-side privacy intersection.
  const fetchLimit = Math.min(1000, Math.max(200, limit * 8));
  const rawResults = searchDocuments(query, fetchLimit);
  return {
    query,
    scope: access.requestedScope,
    results: filterSearchDocumentsForAccess(rawResults, access, limit)
  };
}

module.exports = {
  buildPrivateMangaIds,
  buildAllowedReferences,
  sanitizeAllowedSearchDocument,
  filterSearchDocumentsForAccess,
  runPrivacySafeAdvancedSearch
};

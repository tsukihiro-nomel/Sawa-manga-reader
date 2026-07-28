function entityReferences(entity = {}) {
  return [entity.id, entity.contentId, entity.locationId, entity.legacyId]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function resultReferences(result = {}) {
  return [
    result?.itemContentId,
    result?.itemLocationId,
    result?.contentId,
    result?.locationId
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

export function createLibraryReferenceIndex(library = {}) {
  const mangaIdByReference = new Map();

  for (const manga of Array.isArray(library?.allMangas) ? library.allMangas : []) {
    for (const reference of entityReferences(manga)) {
      mangaIdByReference.set(reference, manga.id);
    }
    for (const chapter of Array.isArray(manga?.chapters) ? manga.chapters : []) {
      for (const reference of entityReferences(chapter)) {
        mangaIdByReference.set(reference, manga.id);
      }
    }
  }

  return {
    resolveMangaIds(results = []) {
      const mangaIds = new Set();
      for (const result of Array.isArray(results) ? results : []) {
        for (const reference of resultReferences(result)) {
          const mangaId = mangaIdByReference.get(reference);
          if (mangaId) {
            mangaIds.add(mangaId);
            break;
          }
        }
      }
      return mangaIds;
    }
  };
}

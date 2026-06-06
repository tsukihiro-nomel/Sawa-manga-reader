function entityKeys(entity) {
  return [entity?.id, entity?.contentId, entity?.locationId, entity?.legacyId]
    .filter((value) => value !== undefined && value !== null && value !== '')
    .map(String);
}

function libraryMangas(library) {
  if (!library) return [];
  const candidates = [
    ...(library.allMangas || []),
    ...(library.favorites || []),
    ...(library.recents || []),
    ...(library.categories || []).flatMap((category) => category.mangas || [])
  ];
  const seen = new Set();
  return candidates.filter((manga) => {
    const key = entityKeys(manga)[0];
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function resolveEditorManga(mangaId, library) {
  if (!mangaId) return null;
  const requestedKeys = new Set(entityKeys(typeof mangaId === 'object' ? mangaId : { id: mangaId }));
  if (!requestedKeys.size) return null;
  return libraryMangas(library).find((manga) => entityKeys(manga).some((key) => requestedKeys.has(key))) || null;
}

export function resolveMangaCollections(manga, collections = []) {
  if (!manga) return [];
  const assignedIds = new Set((manga.collectionIds || []).map(String));
  return collections.filter((collection) => assignedIds.has(String(collection.id)));
}

export async function runOptimisticAction({ apply, rollback, action }) {
  apply?.();
  try {
    return await action?.();
  } catch (error) {
    rollback?.();
    throw error;
  }
}

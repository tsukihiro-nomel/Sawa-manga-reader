function entityKeys(entity = {}) {
  return [entity.id, entity.contentId, entity.locationId, entity.legacyId]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function indexEntities(entities = []) {
  const index = new Map();
  for (const entity of Array.isArray(entities) ? entities : []) {
    for (const key of entityKeys(entity)) index.set(key, entity);
  }
  return index;
}

function sameEntity(left, right) {
  if (left === right) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch (_error) {
    return false;
  }
}

function reuseUnchangedEntities(previousEntities = [], nextEntities = []) {
  const previousByKey = indexEntities(previousEntities);
  const nextByKey = new Map();
  const merged = (Array.isArray(nextEntities) ? nextEntities : []).map((entity) => {
    const previous = entityKeys(entity).map((key) => previousByKey.get(key)).find(Boolean);
    const next = previous && sameEntity(previous, entity) ? previous : entity;
    for (const key of entityKeys(next)) nextByKey.set(key, next);
    return next;
  });
  return { merged, nextByKey };
}

function remapEntityList(entities = [], byKey = new Map()) {
  return (Array.isArray(entities) ? entities : []).map((entity) => (
    entityKeys(entity).map((key) => byKey.get(key)).find(Boolean) || entity
  ));
}

function mergeLibraryForStability(previousLibrary, nextLibrary) {
  if (!previousLibrary || !nextLibrary) return nextLibrary;
  const { merged: allMangas, nextByKey } = reuseUnchangedEntities(previousLibrary.allMangas, nextLibrary.allMangas);
  return {
    ...nextLibrary,
    allMangas,
    categories: (Array.isArray(nextLibrary.categories) ? nextLibrary.categories : []).map((category) => ({
      ...category,
      mangas: remapEntityList(category.mangas, nextByKey)
    })),
    favorites: remapEntityList(nextLibrary.favorites, nextByKey),
    recents: nextLibrary.recents
  };
}

export function mergePayloadForStability(previousPayload, nextPayload) {
  if (!previousPayload || !nextPayload || !nextPayload.library) return nextPayload;
  return {
    ...nextPayload,
    library: mergeLibraryForStability(previousPayload.library, nextPayload.library),
    vaultLibrary: mergeLibraryForStability(previousPayload.vaultLibrary, nextPayload.vaultLibrary)
  };
}

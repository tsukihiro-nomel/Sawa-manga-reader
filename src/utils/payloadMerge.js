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

function samePayloadValue(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;

  const leftIsArray = Array.isArray(left);
  if (leftIsArray !== Array.isArray(right)) return false;
  if (leftIsArray) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!samePayloadValue(left[index], right[index])) return false;
    }
    return true;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
    if (!samePayloadValue(left[key], right[key])) return false;
  }
  return true;
}

function sameEntity(left, right) {
  return samePayloadValue(left, right);
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

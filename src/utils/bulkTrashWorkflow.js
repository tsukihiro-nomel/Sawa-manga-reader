function uniqueIds(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
}

export function resolveCurrentTrashTargets(ids, mangas = []) {
  const byId = new Map((Array.isArray(mangas) ? mangas : [])
    .map((manga) => [String(manga?.id || '').trim(), manga]));
  return uniqueIds(ids).map((id) => byId.get(id)).filter(Boolean);
}

export function formatTrashConfirmation(mangas = []) {
  const targets = (Array.isArray(mangas) ? mangas : []).filter((manga) => manga?.path);
  const count = targets.length;
  return `Envoyer ${count} dossier${count > 1 ? 's' : ''} vers la Corbeille Windows ?\n\n${targets
    .map((manga) => manga.path)
    .join('\n')}`;
}

export function createFailedTrashRetry({
  failedIds = [],
  getCurrentMangas,
  confirm,
  start
} = {}) {
  const retryIds = uniqueIds(failedIds);
  return async () => {
    const currentTargets = resolveCurrentTrashTargets(retryIds, getCurrentMangas?.() || []);
    if (!currentTargets.length) return { ok: false, error: 'Les mangas en echec ne sont plus disponibles.' };
    if (confirm && !confirm(formatTrashConfirmation(currentTargets))) {
      return { ok: false, cancelled: true };
    }
    return start?.(currentTargets.map((manga) => manga.id));
  };
}

function removeMangasFromLibrary(library, removedIds) {
  if (!library || typeof library !== 'object') return library;
  const remove = (items) => Array.isArray(items)
    ? items.filter((manga) => !removedIds.has(String(manga?.id || '')))
    : items;
  let changed = false;
  const allMangas = remove(library.allMangas);
  const favorites = remove(library.favorites);
  if (allMangas !== library.allMangas && allMangas.length !== library.allMangas.length) changed = true;
  if (favorites !== library.favorites && favorites.length !== library.favorites.length) changed = true;
  const categories = Array.isArray(library.categories)
    ? library.categories.map((category) => {
      const mangas = remove(category?.mangas);
      if (mangas === category?.mangas || mangas.length === category.mangas.length) return category;
      changed = true;
      return { ...category, mangas };
    })
    : library.categories;
  return changed ? { ...library, allMangas, favorites, categories } : library;
}

export function applyBulkTrashPatch(payload, patch = {}) {
  if (!payload || typeof payload !== 'object') return payload;
  const removedIds = new Set(uniqueIds(patch?.removedMangaIds));
  if (!removedIds.size) return payload;
  const library = removeMangasFromLibrary(payload.library, removedIds);
  const vaultLibrary = removeMangasFromLibrary(payload.vaultLibrary, removedIds);
  return {
    ...payload,
    library,
    vaultLibrary,
    stateRevision: Math.max(
      Number(payload.stateRevision || 0),
      Number(patch.revision || 0)
    )
  };
}

export function readBulkTrashJobUpdate(incoming, jobId) {
  const normalizedJobId = String(jobId || '').trim();
  if (!normalizedJobId) return null;
  const jobs = incoming?.job ? [incoming.job] : (Array.isArray(incoming?.jobs) ? incoming.jobs : []);
  const job = jobs
    .find((entry) => entry?.id === normalizedJobId && entry?.kind === 'bulk-trash');
  if (!job) return null;
  const results = Array.isArray(job.progress?.results) ? job.progress.results : [];
  return {
    jobId: normalizedJobId,
    status: job.status,
    completed: Number(job.progress?.completed || 0),
    total: Number(job.progress?.total || job.payload?.mangaIds?.length || 0),
    results,
    succeededIds: results.filter((entry) => entry?.ok).map((entry) => entry.mangaId),
    failedIds: results.filter((entry) => !entry?.ok && !entry?.cancelled).map((entry) => entry.mangaId),
    cancelledIds: results.filter((entry) => entry?.cancelled).map((entry) => entry.mangaId),
    patch: job.progress?.patch || null,
    error: job.lastError || null,
    terminal: ['done', 'failed', 'interrupted'].includes(job.status)
  };
}

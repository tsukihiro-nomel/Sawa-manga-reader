const {
  buildEditionSuggestions,
  buildIdentityRecord,
  classifyIdentityPair,
  createWorkGroup,
  deriveChapterMoves,
  remapPersistedReferences,
  remapSourceLinks,
  setPreferredEdition,
  ungroupWork
} = require('./identityWorks.cjs');
const { analyzeIdentityInWorker } = require('./identityWorker.cjs');

function mergeSuggestions(existing = [], incoming = []) {
  const decided = new Map((Array.isArray(existing) ? existing : [])
    .filter((entry) => entry?.status && entry.status !== 'pending')
    .map((entry) => [entry.id, entry]));
  const byId = new Map(decided);
  for (const suggestion of incoming) {
    if (!suggestion?.id || decided.has(suggestion.id)) continue;
    byId.set(suggestion.id, { ...suggestion, status: 'pending', decidedAt: null });
  }
  return [...byId.values()].slice(-256);
}

function currentIdentityRecords(mangas = [], storedRecords = {}) {
  return Object.fromEntries((Array.isArray(mangas) ? mangas : []).map((manga) => {
    const record = buildIdentityRecord(manga, { private: Boolean(manga?.isPrivate) });
    const stored = storedRecords?.[record.mangaId];
    const sameContent = stored
      && Boolean(record.contentId)
      && String(stored.contentId || '') === String(record.contentId || '')
      && String(stored.path || '') === String(record.path || '');
    if (!record.strongFingerprint && sameContent && stored.strongFingerprint) {
      record.chapters = structuredClone(stored.chapters || []);
      record.chapterFingerprints = [...(stored.chapterFingerprints || [])];
      record.strongFingerprint = stored.strongFingerprint;
    }
    return [record.mangaId, record];
  }).filter(([mangaId]) => mangaId));
}

function validatePendingSuggestion(state, suggestion, mangas) {
  const currentRecords = currentIdentityRecords(mangas, state.identityRecords);
  if (suggestion.kind === 'edition') {
    const left = currentRecords[suggestion.fromMangaId];
    const right = currentRecords[suggestion.toMangaId];
    if (!left || !right) throw new Error('Cette suggestion est périmée: une édition est introuvable.');
    const stillSuggested = buildEditionSuggestions({
      [left.mangaId]: left,
      [right.mangaId]: right
    }, state.workGroups).some((entry) => entry.id === suggestion.id);
    if (!stillSuggested) {
      const classification = classifyIdentityPair(left, right);
      if (classification.kind === 'blocked-vault') {
        throw new Error('Regroupement refusé: contenu public et coffre ne peuvent pas être mélangés.');
      }
      throw new Error('Cette suggestion est périmée: les empreintes ou métadonnées ne correspondent plus.');
    }
    return { chapterMoves: [] };
  }

  const source = state.identityRecords?.[suggestion.fromMangaId];
  const target = currentRecords[suggestion.toMangaId];
  if (!source || !target) throw new Error('Cette suggestion est périmée: la paire n’existe plus.');
  const classification = classifyIdentityPair(source, target);
  if (classification.kind === 'blocked-vault') {
    throw new Error('Déplacement refusé: contenu public et coffre ne peuvent pas être mélangés.');
  }
  if (!['exact', 'probable'].includes(classification.kind)) {
    throw new Error('Cette suggestion est périmée: les empreintes ou métadonnées ne correspondent plus.');
  }

  const candidates = Object.values(currentRecords)
    .map((record) => ({ record, classification: classifyIdentityPair(source, record) }))
    .filter((entry) => ['exact', 'probable'].includes(entry.classification.kind));
  const exactCandidates = candidates.filter((entry) => entry.classification.kind === 'exact');
  if (exactCandidates.length > 1) throw new Error('Déplacement ambigu: plusieurs dossiers ont la même empreinte.');
  if (classification.kind === 'exact' && (exactCandidates.length !== 1 || exactCandidates[0].record.mangaId !== target.mangaId)) {
    throw new Error('Déplacement ambigu: la cible exacte n’est plus unique.');
  }
  if (classification.kind === 'probable') {
    if (exactCandidates.length > 0) {
      throw new Error('Déplacement périmé: une correspondance exacte plus récente existe.');
    }
    const probable = candidates
      .filter((entry) => entry.classification.kind === 'probable')
      .sort((left, right) => right.classification.overlap - left.classification.overlap);
    if (
      probable[0]?.record.mangaId !== target.mangaId
      || (probable[1] && Math.abs(probable[0].classification.overlap - probable[1].classification.overlap) < 0.05)
    ) {
      throw new Error('Déplacement ambigu: la cible probable n’est plus unique.');
    }
  }
  return { chapterMoves: deriveChapterMoves(source, target) };
}

function createIdentityService(dependencies = {}) {
  const {
    loadState,
    updateState,
    getMangas,
    updateSourcesState,
    getContextSignature = () => null,
    worker = analyzeIdentityInWorker
  } = dependencies;
  if (typeof loadState !== 'function' || typeof updateState !== 'function' || typeof getMangas !== 'function') {
    throw new TypeError('Identity service dependencies are incomplete.');
  }

  function contextSignature() {
    const value = getContextSignature();
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  async function analyze(attempt = 0) {
    const signatureBefore = contextSignature();
    const state = loadState();
    const mangas = getMangas();
    const result = await worker({
      previousRecords: state.identityRecords || {},
      privateMangaIds: state.vault?.privateMangaIds || [],
      mangas
    });
    if (contextSignature() !== signatureBefore) {
      if (attempt < 1) return analyze(attempt + 1);
      return {
        ok: false,
        stale: true,
        discarded: true,
        retryable: true,
        exactMoveCount: 0,
        ambiguousCount: 0,
        suggestions: listSuggestions()
      };
    }
    const allChapterMoves = [];
    for (const move of result.analysis.exactMoves) {
      allChapterMoves.push(...deriveChapterMoves(
        state.identityRecords?.[move.fromMangaId],
        result.currentRecords?.[move.toMangaId]
      ));
    }
    const editionSuggestions = buildEditionSuggestions(result.currentRecords, state.workGroups);
    const persisted = updateState((draft) => {
      remapPersistedReferences(draft, result.analysis.exactMoves, allChapterMoves);
      draft.identityRecords = {
        ...(draft.identityRecords || {}),
        ...result.currentRecords
      };
      draft.identitySuggestions = mergeSuggestions(
        draft.identitySuggestions,
        [...result.analysis.suggestions, ...editionSuggestions]
      );
      draft.identityMediaIssues = (result.mediaIssues || []).slice(-256);
      return draft;
    });
    if (result.analysis.exactMoves.length && typeof updateSourcesState === 'function') {
      updateSourcesState((draft) => {
        draft.seriesLinks = remapSourceLinks(draft.seriesLinks, result.analysis.exactMoves);
        return draft;
      });
    }
    return {
      ok: true,
      exactMoveCount: result.analysis.exactMoves.length,
      ambiguousCount: result.analysis.ambiguous.length,
      mediaIssues: persisted.identityMediaIssues || [],
      suggestions: (persisted.identitySuggestions || []).filter((entry) => entry.status === 'pending')
    };
  }

  function listSuggestions() {
    return (loadState().identitySuggestions || []).filter((entry) => entry.status === 'pending');
  }

  function decideSuggestion(suggestionId, decision) {
    const normalizedId = String(suggestionId || '').trim();
    const accepted = decision === 'accept';
    let applied = null;
    const mangas = getMangas();
    const currentState = loadState();
    const currentSuggestion = (currentState.identitySuggestions || []).find((entry) => entry.id === normalizedId);
    if (!currentSuggestion || currentSuggestion.status !== 'pending') {
      return { ok: false, error: 'Suggestion introuvable ou déjà traitée.' };
    }
    const validation = accepted
      ? validatePendingSuggestion(currentState, currentSuggestion, mangas)
      : { chapterMoves: [] };
    const persisted = updateState((draft) => {
      const suggestion = (draft.identitySuggestions || []).find((entry) => entry.id === normalizedId);
      if (!suggestion || suggestion.status !== 'pending') throw new Error('Suggestion devenue obsolète.');
      if (accepted && suggestion.kind === 'move') {
        remapPersistedReferences(draft, [{
          fromMangaId: suggestion.fromMangaId,
          toMangaId: suggestion.toMangaId
        }], validation.chapterMoves);
      }
      if (accepted && suggestion.kind === 'edition') {
        applied = createWorkGroup(draft, [suggestion.fromMangaId, suggestion.toMangaId], mangas);
      }
      suggestion.status = accepted ? 'accepted' : 'rejected';
      suggestion.decidedAt = new Date().toISOString();
      return draft;
    });
    const suggestion = (persisted.identitySuggestions || []).find((entry) => entry.id === normalizedId);
    if (accepted && suggestion?.kind === 'move' && typeof updateSourcesState === 'function') {
      updateSourcesState((draft) => {
        draft.seriesLinks = remapSourceLinks(draft.seriesLinks, [{
          fromMangaId: suggestion.fromMangaId,
          toMangaId: suggestion.toMangaId
        }]);
        return draft;
      });
    }
    return { ok: Boolean(suggestion), suggestion, workGroup: applied };
  }

  function groupEditions(mangaIds, options = {}) {
    let group;
    updateState((draft) => {
      group = createWorkGroup(draft, mangaIds, getMangas(), options);
      return draft;
    });
    return { ok: true, workGroup: group };
  }

  function ungroup(groupId) {
    let group;
    updateState((draft) => {
      group = ungroupWork(draft, String(groupId || '').trim());
      return draft;
    });
    return { ok: Boolean(group), workGroup: group };
  }

  function setPreferred(groupId, mangaId) {
    let changed = false;
    updateState((draft) => {
      changed = setPreferredEdition(draft, String(groupId || '').trim(), String(mangaId || '').trim());
      return draft;
    });
    return { ok: changed };
  }

  return { analyze, decideSuggestion, groupEditions, listSuggestions, setPreferred, ungroup };
}

module.exports = {
  createIdentityService,
  currentIdentityRecords,
  mergeSuggestions,
  validatePendingSuggestion
};

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createIdentityService, currentIdentityRecords, mergeSuggestions } = require('../electron/services/identityService.cjs');
const { buildEditionSuggestions, buildIdentityRecord } = require('../electron/services/identityWorks.cjs');

function makeHarness(initialState, mangas, workerResult, options = {}) {
  let state = structuredClone(initialState);
  let sources = { seriesLinks: [{ localMangaId: 'old' }] };
  const service = createIdentityService({
    loadState: () => state,
    updateState: (updater) => {
      state = updater(state) || state;
      return state;
    },
    getMangas: () => mangas,
    updateSourcesState: (updater) => {
      sources = updater(sources) || sources;
      return sources;
    },
    getContextSignature: options.getContextSignature,
    worker: typeof workerResult === 'function' ? workerResult : async () => workerResult
  });
  return { service, getState: () => state, getSources: () => sources };
}

describe('identity service', () => {
  it('expires absent pending suggestions while keeping decided history', () => {
    expect(mergeSuggestions([
      { id: 'stale', status: 'pending' },
      { id: 'rejected', status: 'rejected', decidedAt: '2026-01-01' },
      { id: 'accepted', status: 'accepted', decidedAt: '2026-01-02' }
    ], [
      { id: 'fresh', status: 'pending' },
      { id: 'rejected', status: 'pending' }
    ])).toEqual([
      { id: 'rejected', status: 'rejected', decidedAt: '2026-01-01' },
      { id: 'accepted', status: 'accepted', decidedAt: '2026-01-02' },
      { id: 'fresh', status: 'pending', decidedAt: null }
    ]);
  });

  it('applies unique exact moves and chapter mappings while retaining probable suggestions', async () => {
    const oldRecord = {
      mangaId: 'old',
      chapters: [{ id: 'old-chapter', fingerprint: 'same' }]
    };
    const newRecord = {
      mangaId: 'new',
      normalizedTitles: ['titre'],
      chapterFingerprints: ['same'],
      chapters: [{ id: 'new-chapter', fingerprint: 'same' }]
    };
    const harness = makeHarness({
      identityRecords: { old: oldRecord },
      identitySuggestions: [],
      workGroups: {},
      metadata: { old: { title: 'Titre' } },
      progress: { 'old-chapter': { mangaId: 'old', chapterId: 'old-chapter' } },
      vault: { privateMangaIds: [] },
      collections: {},
      session: {}
    }, [{ id: 'new', displayTitle: 'Titre', chapters: [] }], {
      currentRecords: { new: newRecord },
      analysis: {
        exactMoves: [{ fromMangaId: 'old', toMangaId: 'new' }],
        suggestions: [{ id: 'suggestion', kind: 'move', status: 'pending', fromMangaId: 'missing', toMangaId: 'new' }],
        ambiguous: []
      }
    });
    const result = await harness.service.analyze();
    expect(result).toMatchObject({ ok: true, exactMoveCount: 1 });
    expect(harness.getState().metadata.new.title).toBe('Titre');
    expect(harness.getState().progress['new-chapter']).toMatchObject({ mangaId: 'new', chapterId: 'new-chapter' });
    expect(harness.getSources().seriesLinks[0].localMangaId).toBe('new');
    expect(harness.service.listSuggestions()).toEqual([expect.objectContaining({ id: 'suggestion' })]);
  });

  it('accepts or rejects explicit edition suggestions and exposes group mutations', () => {
    const mangas = [
      { id: 'a', displayTitle: 'Même titre', author: 'Auteur', chapters: [{ id: 'a-ch', contentId: 'a' }], lastReadAt: '2025-01-01', isPrivate: false },
      { id: 'b', displayTitle: 'Même titre', author: 'Auteur', chapters: [{ id: 'b-ch', contentId: 'b' }], lastReadAt: '2026-01-01', isPrivate: false }
    ];
    const editionSuggestion = buildEditionSuggestions(currentIdentityRecords(mangas), {})[0];
    const harness = makeHarness({
      identityRecords: {},
      identitySuggestions: [editionSuggestion],
      workGroups: {},
      favorites: {},
      mangaTags: {},
      collections: {},
      vault: { privateMangaIds: [] }
    }, mangas, {});
    const decision = harness.service.decideSuggestion(editionSuggestion.id, 'accept');
    expect(decision.ok).toBe(true);
    expect(decision.workGroup.preferredEditionId).toBe('b');
    expect(harness.service.setPreferred(decision.workGroup.id, 'a')).toEqual({ ok: true });
    expect(harness.service.ungroup(decision.workGroup.id).ok).toBe(true);
  });

  it('refuses grouping a public manga with a private-category manga while unlocked', () => {
    const mangas = [
      { id: 'public', displayTitle: 'Public', isPrivate: false, chapters: [] },
      { id: 'category-private', displayTitle: 'Privé par catégorie', isPrivate: true, chapters: [] }
    ];
    const harness = makeHarness({
      identityRecords: {},
      identitySuggestions: [],
      workGroups: {},
      favorites: {},
      mangaTags: {},
      collections: {},
      vault: { locked: false, privateMangaIds: [], privateCategoryIds: ['private-category'] }
    }, mangas, {});
    expect(() => harness.service.groupEditions(['public', 'category-private'])).toThrow(/coffre/i);
    expect(harness.getState().workGroups).toEqual({});
  });

  it('derives chapter moves again when accepting a probable move', () => {
    const oldManga = {
      id: 'old',
      displayTitle: 'Titre',
      author: 'Auteur',
      chapters: ['p1', 'p2', 'p3', 'p4'].map((contentId, index) => ({
        id: `old-${index}`,
        contentId,
        strongFingerprint: `sha256:${contentId}`
      }))
    };
    const newManga = {
      id: 'new',
      displayTitle: 'Titre',
      author: 'Auteur',
      chapters: ['p1', 'p2', 'p3', 'p5'].map((contentId, index) => ({
        id: `new-${index}`,
        contentId,
        strongFingerprint: `sha256:${contentId}`
      }))
    };
    const oldRecord = buildIdentityRecord(oldManga);
    const suggestion = {
      id: 'move-probable',
      kind: 'move',
      status: 'pending',
      fromMangaId: 'old',
      toMangaId: 'new'
    };
    const harness = makeHarness({
      identityRecords: { old: oldRecord },
      identitySuggestions: [suggestion],
      workGroups: {},
      metadata: { old: { title: 'Titre' } },
      progress: { 'old-0': { mangaId: 'old', chapterId: 'old-0' } },
      chapterStates: { 'old-1': 'in-progress' },
      chapterReadStatus: { 'old-2': true },
      annotations: { old: [{ mangaId: 'old', chapterId: 'old-2' }] },
      vault: { privateMangaIds: [] },
      collections: {},
      session: {}
    }, [newManga], {});
    expect(harness.service.decideSuggestion(suggestion.id, 'accept').ok).toBe(true);
    const state = harness.getState();
    expect(state.progress['new-0']).toMatchObject({ mangaId: 'new', chapterId: 'new-0' });
    expect(state.chapterStates['new-1']).toBe('in-progress');
    expect(state.chapterReadStatus['new-2']).toBe(true);
    expect(state.annotations.new[0]).toMatchObject({ mangaId: 'new', chapterId: 'new-2' });
  });

  it.each([
    {
      label: 'fingerprint and metadata changed',
      target: {
        id: 'new',
        displayTitle: 'Autre',
        author: 'Autre',
        chapters: [{ id: 'x', contentId: 'x', strongFingerprint: 'sha256:x' }]
      },
      message: /périmée/i
    },
    {
      label: 'vault boundary changed',
      target: {
        id: 'new',
        displayTitle: 'Titre',
        author: 'Auteur',
        isPrivate: true,
        chapters: ['p1', 'p2', 'p3', 'p5'].map((contentId) => ({
          id: contentId,
          contentId,
          strongFingerprint: `sha256:${contentId}`
        }))
      },
      message: /coffre/i
    }
  ])('refuses a stale move when $label', ({ target, message }) => {
    const oldRecord = buildIdentityRecord({
      id: 'old',
      displayTitle: 'Titre',
      author: 'Auteur',
      chapters: ['p1', 'p2', 'p3', 'p4'].map((contentId) => ({
        id: `old-${contentId}`,
        contentId,
        strongFingerprint: `sha256:${contentId}`
      }))
    });
    const harness = makeHarness({
      identityRecords: { old: oldRecord },
      identitySuggestions: [{ id: 'stale', kind: 'move', status: 'pending', fromMangaId: 'old', toMangaId: 'new' }],
      workGroups: {},
      vault: { privateMangaIds: [] },
      collections: {}
    }, [target], {});
    expect(() => harness.service.decideSuggestion('stale', 'accept')).toThrow(message);
    expect(harness.getState().identitySuggestions[0].status).toBe('pending');
  });

  it('refuses an old probable target when a fresh exact target exists', () => {
    const sourceManga = {
      id: 'old',
      displayTitle: 'Titre',
      author: 'Auteur',
      chapters: ['p1', 'p2', 'p3', 'p4'].map((contentId) => ({
        id: `old-${contentId}`,
        contentId,
        strongFingerprint: `sha256:${contentId}`
      }))
    };
    const probableTarget = {
      id: 'probable',
      displayTitle: 'Titre',
      author: 'Auteur',
      chapters: ['p1', 'p2', 'p3', 'x'].map((contentId) => ({
        id: `probable-${contentId}`,
        contentId,
        strongFingerprint: `sha256:${contentId}`
      }))
    };
    const exactTarget = {
      id: 'exact',
      displayTitle: 'Titre déplacé',
      author: 'Auteur',
      chapters: ['p1', 'p2', 'p3', 'p4'].map((contentId) => ({
        id: `exact-${contentId}`,
        contentId,
        strongFingerprint: `sha256:${contentId}`
      }))
    };
    const harness = makeHarness({
      identityRecords: { old: buildIdentityRecord(sourceManga) },
      identitySuggestions: [{
        id: 'old-probable',
        kind: 'move',
        status: 'pending',
        fromMangaId: 'old',
        toMangaId: 'probable'
      }],
      metadata: { old: { title: 'Conservé' } },
      progress: { 'old-p1': { mangaId: 'old', chapterId: 'old-p1' } },
      workGroups: {},
      vault: { privateMangaIds: [] },
      collections: {}
    }, [probableTarget, exactTarget], {});
    expect(() => harness.service.decideSuggestion('old-probable', 'accept')).toThrow(/exacte plus récente/i);
    expect(harness.getState().identitySuggestions[0].status).toBe('pending');
    expect(harness.getState().metadata.old.title).toBe('Conservé');
    expect(harness.getState().metadata.probable).toBeUndefined();
    expect(harness.getState().progress['old-p1']).toBeTruthy();
  });

  it('discards worker output when the library context keeps changing', async () => {
    let contextRevision = 1;
    let workerCalls = 0;
    const worker = async () => {
      workerCalls += 1;
      contextRevision += 1;
      return {
        currentRecords: { new: { mangaId: 'new', chapters: [] } },
        analysis: {
          exactMoves: [{ fromMangaId: 'old', toMangaId: 'new' }],
          suggestions: [],
          ambiguous: []
        }
      };
    };
    const harness = makeHarness({
      identityRecords: { old: { mangaId: 'old', chapters: [] } },
      identitySuggestions: [],
      metadata: { old: { title: 'Ne doit pas bouger' } },
      workGroups: {},
      vault: { privateMangaIds: [] },
      collections: {}
    }, [{ id: 'new', displayTitle: 'Nouveau', chapters: [] }], worker, {
      getContextSignature: () => `revision-${contextRevision}`
    });

    const result = await harness.service.analyze();
    expect(result).toMatchObject({ ok: false, stale: true, discarded: true, retryable: true });
    expect(workerCalls).toBe(2);
    expect(harness.getState().identityRecords).toHaveProperty('old');
    expect(harness.getState().identityRecords).not.toHaveProperty('new');
    expect(harness.getState().metadata.old.title).toBe('Ne doit pas bouger');
    expect(harness.getState().metadata.new).toBeUndefined();
  });

  it('retries once and applies only the fresh worker result', async () => {
    let contextRevision = 1;
    let workerCalls = 0;
    const worker = async () => {
      workerCalls += 1;
      if (workerCalls === 1) contextRevision += 1;
      return {
        currentRecords: {
          new: { mangaId: 'new', normalizedTitles: ['nouveau'], chapters: [], chapterFingerprints: [] }
        },
        analysis: { exactMoves: [], suggestions: [], ambiguous: [] }
      };
    };
    const harness = makeHarness({
      identityRecords: {},
      identitySuggestions: [],
      workGroups: {},
      vault: { privateMangaIds: [] },
      collections: {}
    }, [{ id: 'new', displayTitle: 'Nouveau', chapters: [] }], worker, {
      getContextSignature: () => `revision-${contextRevision}`
    });

    expect(await harness.service.analyze()).toMatchObject({ ok: true });
    expect(workerCalls).toBe(2);
    expect(harness.getState().identityRecords).toHaveProperty('new');
  });
});

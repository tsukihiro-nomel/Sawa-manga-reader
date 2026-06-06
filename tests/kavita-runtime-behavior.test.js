import { describe, expect, it, vi } from 'vitest';

async function loadModule(relativePath) {
  try {
    return await import(relativePath);
  } catch (_error) {
    return {};
  }
}

function measuredNode(index, top, height) {
  return {
    dataset: { kvPageIndex: String(index) },
    isConnected: true,
    getBoundingClientRect: () => ({ top, height })
  };
}

describe('Kavita runtime behavior', () => {
  it('measures the visible Webtoon page without relying on a React event', async () => {
    const { measureVisibleWebtoonPage } = await loadModule('../src/interfaces/kavita/webtoonMeasurement.js');
    const root = {
      isConnected: true,
      clientHeight: 600,
      getBoundingClientRect: () => ({ top: 100 }),
      querySelectorAll: () => [
        measuredNode(0, 80, 200),
        measuredNode(1, 330, 240),
        measuredNode(2, 640, 200)
      ]
    };

    expect(measureVisibleWebtoonPage).toBeTypeOf('function');
    expect(measureVisibleWebtoonPage(root)).toBe(1);
  });

  it('ignores missing, detached and zero-sized Webtoon roots or pages', async () => {
    const { measureVisibleWebtoonPage } = await loadModule('../src/interfaces/kavita/webtoonMeasurement.js');
    const detachedRoot = {
      isConnected: false,
      clientHeight: 600,
      getBoundingClientRect: () => ({ top: 0 }),
      querySelectorAll: () => []
    };
    const emptyRoot = {
      isConnected: true,
      clientHeight: 600,
      getBoundingClientRect: () => ({ top: 0 }),
      querySelectorAll: () => [
        { ...measuredNode(0, 0, 0), getBoundingClientRect: () => ({ top: 0, height: 0 }) }
      ]
    };

    expect(measureVisibleWebtoonPage).toBeTypeOf('function');
    expect(measureVisibleWebtoonPage(null)).toBeNull();
    expect(measureVisibleWebtoonPage(detachedRoot)).toBeNull();
    expect(measureVisibleWebtoonPage(emptyRoot)).toBeNull();
  });

  it('resolves the live manga and its collections from the refreshed library', async () => {
    const { resolveEditorManga, resolveMangaCollections } = await loadModule('../src/interfaces/kavita/kavitaState.js');
    const manga = {
      id: 'series-1',
      contentId: 'content-1',
      tags: [{ id: 'tag-new', name: 'Nouveau' }],
      collectionIds: ['collection-2']
    };
    const library = { allMangas: [manga] };
    const collections = [
      { id: 'collection-1', name: 'Ancienne' },
      { id: 'collection-2', name: 'Actuelle' }
    ];

    expect(resolveEditorManga).toBeTypeOf('function');
    expect(resolveMangaCollections).toBeTypeOf('function');
    expect(resolveEditorManga('content-1', library)).toBe(manga);
    expect(resolveMangaCollections(manga, collections)).toEqual([collections[1]]);
  });

  it('rolls an optimistic editor mutation back when the IPC action fails', async () => {
    const { runOptimisticAction } = await loadModule('../src/interfaces/kavita/kavitaState.js');
    const apply = vi.fn();
    const rollback = vi.fn();

    expect(runOptimisticAction).toBeTypeOf('function');
    await expect(runOptimisticAction({
      apply,
      rollback,
      action: async () => {
        throw new Error('IPC indisponible');
      }
    })).rejects.toThrow('IPC indisponible');
    expect(apply).toHaveBeenCalledOnce();
    expect(rollback).toHaveBeenCalledOnce();
  });
});

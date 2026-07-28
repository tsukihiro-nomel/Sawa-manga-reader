import { describe, expect, it, vi } from 'vitest';
import {
  applyBulkTrashPatch,
  createFailedTrashRetry,
  formatTrashConfirmation,
  readBulkTrashJobUpdate
} from '../src/utils/bulkTrashWorkflow.js';

describe('bulk trash renderer workflow', () => {
  it('retries only failed ids and resolves their current paths at retry time', async () => {
    let currentMangas = [
      { id: 'failed', path: 'C:\\library\\old-folder' },
      { id: 'succeeded', path: 'C:\\library\\already-trashed' }
    ];
    const confirm = vi.fn(() => true);
    const start = vi.fn(async (ids) => ({ ok: true, jobId: 'retry-job', requestedIds: ids }));
    const retry = createFailedTrashRetry({
      failedIds: ['failed'],
      getCurrentMangas: () => currentMangas,
      confirm,
      start
    });

    currentMangas = [{ id: 'failed', path: 'D:\\moved\\current-folder' }];
    await retry();

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('D:\\moved\\current-folder'));
    expect(confirm.mock.calls[0][0]).not.toContain('old-folder');
    expect(start).toHaveBeenCalledWith(['failed']);
  });

  it('formats every current path and folder count before starting', () => {
    const message = formatTrashConfirmation([
      { id: 'a', path: 'C:\\library\\A' },
      { id: 'b', path: 'C:\\library\\B' }
    ]);
    expect(message).toContain('2 dossiers');
    expect(message).toContain('C:\\library\\A');
    expect(message).toContain('C:\\library\\B');
  });

  it('correlates progress by job id and returns only a lightweight completion patch', () => {
    expect(readBulkTrashJobUpdate({
      jobs: [{ id: 'other', kind: 'bulk-trash', status: 'done', progress: {} }]
    }, 'wanted')).toBeNull();

    const update = readBulkTrashJobUpdate({
      jobs: [{
        id: 'wanted',
        kind: 'bulk-trash',
        status: 'done',
        progress: {
          completed: 2,
          total: 2,
          results: [
            { mangaId: 'a', ok: true },
            { mangaId: 'b', ok: false, error: 'locked' }
          ],
          patch: { removedMangaIds: ['a'], revision: 8 }
        }
      }]
    }, 'wanted');

    expect(update).toMatchObject({
      jobId: 'wanted',
      status: 'done',
      succeededIds: ['a'],
      failedIds: ['b'],
      patch: { removedMangaIds: ['a'], revision: 8 }
    });
    expect(update).not.toHaveProperty('payload');
  });

  it('applies removed ids without replacing the full renderer payload', () => {
    const payload = {
      stateRevision: 7,
      library: {
        allMangas: [{ id: 'a' }, { id: 'b' }],
        favorites: [{ id: 'a' }, { id: 'b' }],
        categories: [{ id: 'category', mangas: [{ id: 'a' }, { id: 'b' }] }]
      },
      vaultLibrary: {
        allMangas: [{ id: 'vault' }],
        favorites: []
      }
    };
    const next = applyBulkTrashPatch(payload, {
      removedMangaIds: ['a'],
      revision: 8
    });

    expect(next.library.allMangas.map((entry) => entry.id)).toEqual(['b']);
    expect(next.library.favorites.map((entry) => entry.id)).toEqual(['b']);
    expect(next.library.categories[0].mangas.map((entry) => entry.id)).toEqual(['b']);
    expect(next.vaultLibrary).toBe(payload.vaultLibrary);
    expect(next.stateRevision).toBe(8);
  });
});

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createAtomicJsonPersistence } = require('../electron/services/atomicJsonPersistence.cjs');

describe('atomic JSON persistence', () => {
  it('coalesces pending writes by file and keeps at most two writes active', async () => {
    const writes = [];
    let active = 0;
    let peak = 0;
    const io = {
      mkdir: async () => {},
      writeFile: async (filePath, content) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setImmediate(resolve));
        writes.push([filePath, content]);
        active -= 1;
      },
      rename: async () => {}
    };
    const persistence = createAtomicJsonPersistence({ fsPromises: io, maxConcurrent: 2 });

    persistence.schedule('C:\\data\\state.json', '{"revision":1}');
    persistence.schedule('C:\\data\\state.json', '{"revision":2}');
    persistence.schedule('C:\\data\\reader.json', '{"page":4}');
    persistence.schedule('C:\\data\\metadata.json', '{"title":"Sawa"}');
    const result = await persistence.flush();

    expect(result.ok).toBe(true);
    expect(writes.some(([, content]) => content === '{"revision":1}')).toBe(false);
    expect(writes.some(([, content]) => content === '{"revision":2}')).toBe(true);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('retains a failed write for retry and clears the error after success', async () => {
    let attempts = 0;
    const persisted = [];
    const confirmed = [];
    const io = {
      mkdir: async () => {},
      writeFile: async (_filePath, content) => {
        attempts += 1;
        if (attempts === 1) throw new Error('disk temporarily unavailable');
        persisted.push(content);
      },
      rename: async () => {}
    };
    const persistence = createAtomicJsonPersistence({ fsPromises: io, maxConcurrent: 1 });

    persistence.schedule('C:\\data\\state.json', '{"revision":3}', {
      onSuccess: ({ content }) => confirmed.push(content)
    });
    const failed = await persistence.flush();

    expect(failed).toMatchObject({ ok: false, error: 'disk temporarily unavailable' });
    expect(persistence.getStatus()).toMatchObject({
      pendingCount: 1,
      lastError: 'disk temporarily unavailable'
    });
    expect(confirmed).toEqual([]);

    const retried = await persistence.flush();

    expect(retried).toMatchObject({ ok: true, error: null });
    expect(persistence.getStatus()).toMatchObject({ pendingCount: 0, lastError: null });
    expect(persisted).toEqual(['{"revision":3}']);
    expect(confirmed).toEqual(['{"revision":3}']);
  });
});

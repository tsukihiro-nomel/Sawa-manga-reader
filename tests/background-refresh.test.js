import { describe, expect, it, vi } from 'vitest';
import { createBackgroundRefreshController } from '../src/utils/backgroundRefresh.js';

describe('background refresh controller', () => {
  it('keeps visible data and performs three spaced retries before asking for a manual retry', async () => {
    const visible = { title: 'still visible' };
    const statuses = [];
    const wait = vi.fn().mockResolvedValue();
    const load = vi.fn().mockRejectedValue(new Error('offline'));
    const apply = vi.fn();
    const controller = createBackgroundRefreshController({
      load,
      apply,
      getRevision: () => 5,
      onStatus: (status) => statuses.push(status),
      wait
    });

    const result = await controller.run();

    expect(result).toMatchObject({ ok: false, attempts: 4 });
    expect(load).toHaveBeenCalledTimes(4);
    expect(wait).toHaveBeenCalledTimes(3);
    expect(apply).not.toHaveBeenCalled();
    expect(visible).toEqual({ title: 'still visible' });
    expect(statuses.at(-1)).toMatchObject({
      state: 'retry-required',
      retryable: true
    });
  });

  it('supports manual retry and applies the newer payload', async () => {
    const statuses = [];
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockRejectedValueOnce(new Error('temporary'))
      .mockRejectedValueOnce(new Error('temporary'))
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({ stateRevision: 7, library: { allMangas: [] } });
    const apply = vi.fn();
    const controller = createBackgroundRefreshController({
      load,
      apply,
      getRevision: () => 6,
      onStatus: (status) => statuses.push(status),
      wait: () => Promise.resolve()
    });

    await controller.run();
    const result = await controller.retry();

    expect(result).toMatchObject({ ok: true, revision: 7, attempts: 1 });
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ stateRevision: 7 }));
    expect(statuses.some((status) => status.label === 'synchronisation relancee')).toBe(true);
  });

  it('rejects an obsolete revision without replacing the current payload', async () => {
    const apply = vi.fn();
    const controller = createBackgroundRefreshController({
      load: async () => ({ stateRevision: 3, library: { allMangas: ['obsolete'] } }),
      apply,
      getRevision: () => 4,
      wait: () => Promise.resolve()
    });

    const result = await controller.run();

    expect(result).toMatchObject({ ok: false, stale: true, revision: 3 });
    expect(apply).not.toHaveBeenCalled();
  });
});

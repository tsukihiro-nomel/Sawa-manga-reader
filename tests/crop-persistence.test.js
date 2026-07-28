import { describe, expect, it, vi } from 'vitest';
import { createCropPersistenceController } from '../src/utils/cropPersistence.js';

describe('serialized crop persistence', () => {
  it('persists a keyboard change on blur and restores it after reopen', async () => {
    let stored = { x: 0, y: 0, zoom: 1 };
    const applied = [];
    const controller = createCropPersistenceController({
      delay: 500,
      persist: async (value) => {
        stored = structuredClone(value.crop);
        return { profile: { crops: { portrait: stored } } };
      },
      onApplied: (result) => applied.push(result.profile.crops.portrait)
    });
    controller.schedule({ format: 'portrait', crop: { x: 0.35, y: -0.1, zoom: 1.4 } });
    await controller.flush();
    await controller.idle();
    expect(stored).toEqual({ x: 0.35, y: -0.1, zoom: 1.4 });
    expect(applied.at(-1)).toEqual(stored);
  });

  it('never applies an older response after a newer keyboard change', async () => {
    const resolvers = [];
    const applied = vi.fn();
    const controller = createCropPersistenceController({
      persist: (value) => new Promise((resolve) => resolvers.push(() => resolve(value))),
      onApplied: applied
    });
    controller.schedule({ crop: { zoom: 1.2 } });
    const first = controller.flush();
    await vi.waitFor(() => expect(resolvers).toHaveLength(1));
    controller.schedule({ crop: { zoom: 2.2 } });
    const second = controller.flush();
    resolvers.shift()();
    await first;
    await vi.waitFor(() => expect(resolvers).toHaveLength(1));
    resolvers.shift()();
    await second;
    expect(applied).toHaveBeenCalledTimes(1);
    expect(applied.mock.calls[0][0].crop.zoom).toBe(2.2);
  });
});

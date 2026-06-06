import { describe, expect, it, vi } from 'vitest';
import { createInterfaceTransitionCoordinator } from '../src/interfaces/interfaceTransition.js';

describe('interface transition coordinator', () => {
  it('flushes, closes transient UI, preloads and persists before applying Kavita', async () => {
    const calls = [];
    const coordinator = createInterfaceTransitionCoordinator({
      flushReaderSession: async () => calls.push('flush'),
      closeTransientUi: () => calls.push('close'),
      preloadKavita: async () => calls.push('preload'),
      persistMode: async () => calls.push('persist'),
      applyMode: () => calls.push('apply'),
      setTransition: (active) => calls.push(active ? 'veil-on' : 'veil-off'),
      waitForStableLayout: async () => calls.push('layout')
    });

    await coordinator.request('kavita', 'sawa');

    expect(calls).toEqual(['veil-on', 'flush', 'close', 'preload', 'persist', 'apply', 'layout', 'veil-off']);
  });

  it('keeps the current shell and reports a local error when persistence fails', async () => {
    const applyMode = vi.fn();
    const reportError = vi.fn();
    const coordinator = createInterfaceTransitionCoordinator({
      flushReaderSession: async () => {},
      closeTransientUi: () => {},
      preloadKavita: async () => {},
      persistMode: async () => {
        throw new Error('disk unavailable');
      },
      applyMode,
      reportError,
      setTransition: () => {},
      waitForStableLayout: async () => {}
    });

    await expect(coordinator.request('kavita', 'sawa')).resolves.toBe(false);
    expect(applyMode).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledWith('disk unavailable');
  });
});

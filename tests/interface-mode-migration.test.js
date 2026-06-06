import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { DEFAULT_STATE, normalizeState } = require('../electron/services/storage.cjs');

describe('interface mode migration', () => {
  it('uses the Kavita shell with a neutral theme for fresh installs', () => {
    expect(DEFAULT_STATE.ui).toMatchObject({
      theme: 'dark-night',
      interfaceMode: 'kavita'
    });
  });

  it('migrates the legacy Kavita Clean preset to the independent Kavita shell', () => {
    const normalized = normalizeState({
      ui: {
        theme: 'kavita-clean',
        interfaceMode: 'kavita-clean'
      }
    });

    expect(normalized.ui.theme).toBe('dark-night');
    expect(normalized.ui.interfaceMode).toBe('kavita');
  });

  it('preserves existing Sawa users and their selected theme', () => {
    const normalized = normalizeState({
      ui: {
        theme: 'coffee-house',
        interfaceMode: 'sawa'
      }
    });

    expect(normalized.ui.theme).toBe('coffee-house');
    expect(normalized.ui.interfaceMode).toBe('sawa');
  });
});

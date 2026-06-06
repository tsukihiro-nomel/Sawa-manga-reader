import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const diagnosticsPath = require.resolve('../electron/services/perfDiagnostics.cjs');

function loadDiagnostics(enabled) {
  delete require.cache[diagnosticsPath];
  if (enabled) process.env.SAWA_PERF_DIAG = '1';
  else delete process.env.SAWA_PERF_DIAG;
  return require('../electron/services/perfDiagnostics.cjs');
}

afterEach(() => {
  delete process.env.SAWA_PERF_DIAG;
  delete require.cache[diagnosticsPath];
});

describe('performance diagnostics', () => {
  it('does not record measurements unless explicitly enabled', () => {
    const diagnostics = loadDiagnostics(false);

    const result = diagnostics.measureSync('library.scan', () => 'ok', { source: 'test' });

    expect(result).toBe('ok');
    expect(diagnostics.getMeasurements()).toEqual([]);
  });

  it('records duration and payload size when enabled', () => {
    const diagnostics = loadDiagnostics(true);

    diagnostics.measureSync('library.payload', () => ({ allMangas: [{ id: 'manga-1' }] }), {
      payload: { allMangas: [{ id: 'manga-1' }] }
    });

    const measurements = diagnostics.getMeasurements();
    expect(measurements).toHaveLength(1);
    expect(measurements[0]).toMatchObject({
      name: 'library.payload',
      payloadBytes: expect.any(Number)
    });
    expect(measurements[0].durationMs).toBeGreaterThanOrEqual(0);
  });
});

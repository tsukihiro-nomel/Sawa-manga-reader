import { describe, expect, it } from 'vitest';
import {
  normalizeRendererError,
  shouldEscalateUnhandledRejection
} from '../src/utils/fatalErrors.js';

describe('renderer rejection escalation', () => {
  it('keeps recoverable request and media failures out of the permanent fatal screen', () => {
    expect(shouldEscalateUnhandledRejection(new Error('Network request failed'))).toBe(false);
    expect(shouldEscalateUnhandledRejection(new Error('Image decode failed'))).toBe(false);
  });

  it('escalates renderer bootstrap and bundle-integrity failures', () => {
    expect(shouldEscalateUnhandledRejection(new Error('ChunkLoadError: Loading chunk 8 failed'))).toBe(true);
    expect(shouldEscalateUnhandledRejection(new SyntaxError('Unexpected token'))).toBe(true);
    expect(normalizeRendererError('corrupt renderer state')).toMatchObject({
      name: '',
      message: 'corrupt renderer state'
    });
  });
});

import { describe, expect, it } from 'vitest';

import derivedStore from '../electron/services/derivedStore.cjs';

const { buildFtsPrefixQuery } = derivedStore;

describe('derived search query normalization', () => {
  it('turns user text into safe token-prefix matching', () => {
    expect(buildFtsPrefixQuery('Mizu')).toBe('"Mizu"*');
    expect(buildFtsPrefixQuery('Star embracing')).toBe('"Star"* AND "embracing"*');
  });

  it('ignores punctuation-only input and escapes quotes', () => {
    expect(buildFtsPrefixQuery('---')).toBe('');
    expect(buildFtsPrefixQuery('hero "zero"')).toBe('"hero"* AND "zero"*');
  });
});

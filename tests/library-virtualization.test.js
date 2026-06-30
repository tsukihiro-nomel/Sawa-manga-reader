import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Sawa library virtualization layout', () => {
  it('prevents the virtual canvas from shrinking inside the flex scroller', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src/styles/globals.css'), 'utf8');
    const blocks = [...css.matchAll(/\.manga-grid-virtual\s*\{([^}]*)\}/g)].map((match) => match[1]);

    expect(blocks.some((block) => /flex\s*:\s*0\s+0\s+auto/.test(block))).toBe(true);
  });
});

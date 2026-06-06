import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('third-party notices and credits', () => {
  it('documents bundled dependencies and Kavita inspiration without claiming copied Kavita code', () => {
    const readme = fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf8');
    const notices = fs.readFileSync(path.join(process.cwd(), 'THIRD_PARTY_NOTICES.md'), 'utf8');
    const combined = `${readme}\n${notices}`;

    for (const name of [
      'Electron',
      'React',
      'Vite',
      'SQLite',
      'better-sqlite3',
      'PDF.js',
      'TanStack Virtual',
      'dnd-kit',
      'lucide-react',
      'chokidar',
      'fast-xml-parser',
      'Kavita'
    ]) {
      expect(combined).toContain(name);
    }

    expect(combined).toContain('inspiration');
    expect(combined).toContain('aucun code');
  });
});

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

describe('Core v2 IPC/preload contract', () => {
  it('exposes targeted library, reader, search and migration APIs without exposing a generic file bridge', () => {
    const preloadSource = require('node:fs').readFileSync(
      require('node:path').join(process.cwd(), 'electron', 'preload.cjs'),
      'utf8'
    );

    for (const apiName of [
      'listSeries',
      'getSeriesDetail',
      'getSeriesChapters',
      'getChapterDetail',
      'getReaderPagesV2',
      'saveReaderProgressV2',
      'searchLibrary',
      'runSmartFilter',
      'getMigrationStatus',
      'analyzeMigration',
      'runMigration',
      'restoreMigrationBackup',
      'cleanupLegacyStorage'
    ]) {
      expect(preloadSource).toContain(`${apiName}:`);
    }

    expect(preloadSource).not.toContain('readFile:');
    expect(preloadSource).not.toContain('writeFile:');
  });
});

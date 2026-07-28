import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('reader persistence wiring', () => {
  it('routes Sawa progress and deferred Kavita failures through recoverable owners', () => {
    const app = fs.readFileSync(path.join(process.cwd(), 'src/App.jsx'), 'utf8');
    const store = fs.readFileSync(path.join(process.cwd(), 'src/interfaces/kavita/readerSessionStore.js'), 'utf8');

    expect(app).toContain('createOptimisticMutationManager');
    expect(app).toContain('key: `progress:${progressPayload.chapterId}`');
    expect(app).toContain('onPersistenceError: (failure) => handleReaderPersistenceError(failure)');
    expect(app).toContain("kind: 'reader-session'");
    expect(app).toContain('issue.persistenceKind !== kind');
    expect(app).toContain('captureInverse: captureFavorite');
    expect(app).toContain('captureApplied: captureFavorite');
    expect(app).toContain('captureApplied: captureReading');
    expect(app).toContain('captureApplied: captureTag');
    expect(app).toContain('captureApplied: captureCollection');
    expect(app).toContain('findMangaInPayload(payloadRef.current, mangaId)');
    expect(app).toContain('key: `reading-series:${mangaId}`');
    expect(app).toContain('key: `reading:${mangaId}:${chapterId}`');
    expect(app).toContain('key: `progress:${progressPayload.chapterId}`');
    expect(app).not.toMatch(/updateProgressLight\(progressPayload\)\.catch\(\(\) =>/);
    expect(store).toContain('reportPersistenceError');
    expect(store).not.toContain('persistLatestProgress(revision).catch(() => {})');
    expect(store).not.toContain('persistLatestSettings(revision).catch(() => {})');
  });
});

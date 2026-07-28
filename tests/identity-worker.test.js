import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  analyzeIdentityInWorker,
  hashChapterContent
} = require('../electron/services/identityWorker.cjs');
const { buildEditionSuggestions } = require('../electron/services/identityWorks.cjs');
const temporaryDirectories = [];

async function makeChapterFolder(name, files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `sawa-identity-${name}-`));
  temporaryDirectories.push(root);
  await Promise.all(Object.entries(files).map(([fileName, contents]) =>
    fs.writeFile(path.join(root, fileName), contents)
  ));
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })
  ));
});

describe('identity worker', () => {
  it('recognizes identical chapter contents after a folder move', async () => {
    const oldPath = await makeChapterFolder('old', { '001.jpg': 'page-one', '002.jpg': 'page-two' });
    const newPath = await makeChapterFolder('new', { '001.jpg': 'page-one', '002.jpg': 'page-two' });
    const previous = await analyzeIdentityInWorker({
      previousRecords: {},
      mangas: [{
        id: 'old',
        displayTitle: 'Titre original',
        chapters: [{ id: 'old-chapter', path: oldPath }]
      }]
    });
    const result = await analyzeIdentityInWorker({
      previousRecords: previous.currentRecords,
      mangas: [{
        id: 'new',
        displayTitle: 'Titre déplacé',
        chapters: [{ id: 'new-chapter', path: newPath }]
      }]
    });

    expect(result.currentRecords.new.strongFingerprint).toBeTruthy();
    expect(result.currentRecords.new.chapters[0].fingerprint).toMatch(/^sha256:/);
    expect(result.analysis.exactMoves).toEqual([
      expect.objectContaining({ fromMangaId: 'old', toMangaId: 'new' })
    ]);
  });

  it('does not confuse equal names and sizes with equal contents', async () => {
    const oldPath = await makeChapterFolder('old-different', { '001.jpg': 'abc', '002.jpg': 'def' });
    const newPath = await makeChapterFolder('new-different', { '001.jpg': 'xyz', '002.jpg': 'uvw' });
    const previous = await analyzeIdentityInWorker({
      previousRecords: {},
      mangas: [{
        id: 'old',
        displayTitle: 'Même titre',
        chapters: [{ id: 'old-chapter', path: oldPath }]
      }]
    });
    const result = await analyzeIdentityInWorker({
      previousRecords: previous.currentRecords,
      mangas: [{
        id: 'new',
        displayTitle: 'Même titre',
        chapters: [{ id: 'new-chapter', path: newPath }]
      }]
    });

    expect(result.currentRecords.new.strongFingerprint)
      .not.toBe(previous.currentRecords.old.strongFingerprint);
    expect(result.analysis.exactMoves).toEqual([]);
  });

  it('invalidates the whole folder fingerprint when a single expected page cannot be read', async () => {
    const chapterPath = await makeChapterFolder('one-failure', {
      '001.jpg': 'readable-one',
      '002.jpg': 'readable-two'
    });
    const hashed = await hashChapterContent({
      id: 'chapter',
      path: chapterPath,
      pageCount: 2
    }, {
      hashFile: async (filePath) => (
        filePath.endsWith('002.jpg') ? null : 'sha256:readable'
      )
    });
    expect(hashed.strongFingerprint).toBeNull();
    expect(hashed.issue).toMatchObject({
      type: 'identity-media-unreadable',
      chapterId: 'chapter',
      reason: 'page-unreadable-or-disappeared'
    });
    expect(hashed.issue.failedPath).toMatch(/002\.jpg$/);
  });

  it('never matches folders from their readable subset when their other pages are missing', async () => {
    const readableA = await makeChapterFolder('readable-a', { '001.jpg': 'common-page' });
    const readableB = await makeChapterFolder('readable-b', { '001.jpg': 'common-page' });
    const previous = await analyzeIdentityInWorker({
      previousRecords: {},
      mangas: [{
        id: 'old',
        displayTitle: 'Même titre',
        chapters: [{
          id: 'old-chapter',
          pages: [
            { path: path.join(readableA, '001.jpg') },
            { path: path.join(readableA, 'missing-a.jpg') }
          ]
        }]
      }]
    });
    const result = await analyzeIdentityInWorker({
      previousRecords: previous.currentRecords,
      mangas: [{
        id: 'new',
        displayTitle: 'Même titre',
        chapters: [{
          id: 'new-chapter',
          pages: [
            { path: path.join(readableB, '001.jpg') },
            { path: path.join(readableB, 'missing-b.jpg') }
          ]
        }]
      }]
    });
    expect(previous.currentRecords.old.strongFingerprint).toBeNull();
    expect(result.currentRecords.new.strongFingerprint).toBeNull();
    expect(result.analysis.exactMoves).toEqual([]);
    expect(previous.mediaIssues).toEqual([
      expect.objectContaining({ mangaId: 'old', reason: 'page-unreadable-or-disappeared' })
    ]);
    expect(result.mediaIssues).toEqual([
      expect.objectContaining({ mangaId: 'new', reason: 'page-unreadable-or-disappeared' })
    ]);
  });

  it('never promotes a structural contentId to a strong fingerprint', async () => {
    const result = await analyzeIdentityInWorker({
      previousRecords: {},
      mangas: [{
        id: 'unreadable',
        displayTitle: 'Sans fichier',
        chapters: [{ id: 'chapter', contentId: 'same-name-and-size', pageCount: 10 }]
      }]
    });
    expect(result.currentRecords.unreadable.strongFingerprint).toBeNull();
    expect(result.currentRecords.unreadable.chapterFingerprints).toEqual([]);
  });

  it('does not suggest a public/private-category pair when direct private ids are empty', async () => {
    const result = await analyzeIdentityInWorker({
      previousRecords: {},
      privateMangaIds: [],
      mangas: [
        { id: 'public', displayTitle: 'Même œuvre', author: 'Auteur', chapters: [] },
        {
          id: 'category-private',
          displayTitle: 'Même œuvre',
          author: 'Auteur',
          isPrivate: true,
          chapters: []
        }
      ]
    });
    expect(result.currentRecords['category-private'].private).toBe(true);
    expect(buildEditionSuggestions(result.currentRecords, {})).toEqual([]);
    expect(result.analysis.suggestions).toEqual([]);
  });
});

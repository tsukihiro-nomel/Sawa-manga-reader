import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  exportComicInfoCbz,
  installValidatedArchive,
  validateCbz
} = require('../electron/services/archiveExport.cjs');
const { loadComicInfoForSource } = require('../electron/services/archive.cjs');
const tempDirs = [];
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

afterEach(() => {
  tempDirs.splice(0).forEach((directory) => fs.rmSync(directory, { recursive: true, force: true }));
});

describe('transactional CBZ export', () => {
  it('creates a CBZ from a chapter folder and embeds exactly one ComicInfo.xml', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-cbz-export-'));
    tempDirs.push(root);
    const chapterDir = path.join(root, 'chapter');
    fs.mkdirSync(chapterDir);
    fs.writeFileSync(path.join(chapterDir, '001.png'), ONE_PIXEL_PNG);
    const targetPath = path.join(root, 'chapter.cbz');
    const progress = [];

    const result = await exportComicInfoCbz({
      sourcePath: chapterDir,
      targetPath,
      record: { series: 'Serie locale', title: 'Chapitre 1', number: '1' },
      onProgress: (entry) => progress.push(entry)
    });

    expect(result.ok).toBe(true);
    await expect(validateCbz(targetPath)).resolves.toMatchObject({ imageCount: 1, comicInfoCount: 1 });
    await expect(loadComicInfoForSource(targetPath)).resolves.toMatchObject({
      series: 'Serie locale',
      title: 'Chapitre 1',
      number: '1'
    });
    expect(progress.at(-1)).toMatchObject({ phase: 'done', percent: 100 });
  });

  it('replaces ComicInfo.xml in an existing CBZ while retaining the original archive', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-cbz-replace-'));
    tempDirs.push(root);
    const chapterDir = path.join(root, 'chapter');
    fs.mkdirSync(chapterDir);
    fs.writeFileSync(path.join(chapterDir, '001.png'), ONE_PIXEL_PNG);
    const targetPath = path.join(root, 'chapter.cbz');
    await exportComicInfoCbz({
      sourcePath: chapterDir,
      targetPath,
      record: { title: 'Ancien titre' }
    });

    const replaced = await exportComicInfoCbz({
      sourcePath: targetPath,
      targetPath,
      record: { title: 'Nouveau titre' }
    });

    expect(replaced.ok).toBe(true);
    expect(fs.existsSync(replaced.originalBackupPath)).toBe(true);
    await expect(loadComicInfoForSource(targetPath)).resolves.toMatchObject({ title: 'Nouveau titre' });
    await expect(loadComicInfoForSource(replaced.originalBackupPath)).resolves.toMatchObject({ title: 'Ancien titre' });
  });

  it('renames by default, skips on request and replaces with a backup on conflict', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-cbz-conflicts-'));
    tempDirs.push(root);
    const chapterDir = path.join(root, 'chapter');
    fs.mkdirSync(chapterDir);
    fs.writeFileSync(path.join(chapterDir, '001.png'), ONE_PIXEL_PNG);
    const targetPath = path.join(root, 'chapter.cbz');
    fs.writeFileSync(targetPath, 'existing archive');

    const renamed = await exportComicInfoCbz({
      sourcePath: chapterDir,
      targetPath,
      record: { title: 'Renomme' }
    });
    expect(renamed).toMatchObject({ ok: true, path: path.join(root, 'chapter (2).cbz') });
    expect(fs.readFileSync(targetPath, 'utf8')).toBe('existing archive');

    const skipped = await exportComicInfoCbz({
      sourcePath: chapterDir,
      targetPath,
      conflictPolicy: 'skip',
      record: { title: 'Ignore' }
    });
    expect(skipped).toMatchObject({ ok: true, skipped: true, path: targetPath });
    expect(fs.readFileSync(targetPath, 'utf8')).toBe('existing archive');

    const replaced = await exportComicInfoCbz({
      sourcePath: chapterDir,
      targetPath,
      conflictPolicy: 'replace',
      record: { title: 'Remplace' }
    });
    expect(replaced.ok).toBe(true);
    expect(fs.existsSync(replaced.originalBackupPath)).toBe(true);
    expect(fs.readFileSync(replaced.originalBackupPath, 'utf8')).toBe('existing archive');
    await expect(loadComicInfoForSource(targetPath)).resolves.toMatchObject({ title: 'Remplace' });
  });

  it('honors rename when a whole-manga copy targets the original CBZ directory', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-cbz-same-source-copy-'));
    tempDirs.push(root);
    const chapterDir = path.join(root, 'source');
    fs.mkdirSync(chapterDir);
    fs.writeFileSync(path.join(chapterDir, '001.png'), ONE_PIXEL_PNG);
    const sourceCbz = path.join(root, 'chapter.cbz');
    await exportComicInfoCbz({ sourcePath: chapterDir, targetPath: sourceCbz, record: { title: 'Original' } });

    const copied = await exportComicInfoCbz({
      sourcePath: sourceCbz,
      targetPath: sourceCbz,
      replaceSource: false,
      conflictPolicy: 'rename',
      record: { title: 'Copie exportee' }
    });

    expect(copied).toMatchObject({ ok: true, path: path.join(root, 'chapter (2).cbz') });
    await expect(loadComicInfoForSource(sourceCbz)).resolves.toMatchObject({ title: 'Original' });
    await expect(loadComicInfoForSource(copied.path)).resolves.toMatchObject({ title: 'Copie exportee' });
  });

  it('cancels before installation without creating or deleting source content', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-cbz-cancel-'));
    tempDirs.push(root);
    const chapterDir = path.join(root, 'chapter');
    fs.mkdirSync(chapterDir);
    fs.writeFileSync(path.join(chapterDir, '001.png'), ONE_PIXEL_PNG);
    const targetPath = path.join(root, 'chapter.cbz');

    const result = await exportComicInfoCbz({
      sourcePath: chapterDir,
      targetPath,
      record: { title: 'Annule' },
      isCancelled: () => true
    });

    expect(result).toMatchObject({ ok: false, cancelled: true });
    expect(fs.existsSync(targetPath)).toBe(false);
    expect(fs.existsSync(path.join(chapterDir, '001.png'))).toBe(true);
  });

  it('keeps the canonical archive present when atomic installation fails', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-cbz-install-fail-'));
    tempDirs.push(root);
    const targetPath = path.join(root, 'chapter.cbz');
    const temporaryPath = path.join(root, '.chapter.cbz.tmp');
    fs.writeFileSync(targetPath, 'original-bytes');
    fs.writeFileSync(temporaryPath, 'replacement-bytes');

    await expect(installValidatedArchive(temporaryPath, targetPath, true, {
      ...fs,
      renameSync: () => { throw new Error('simulated rename failure'); }
    })).rejects.toThrow('simulated rename failure');

    expect(fs.existsSync(targetPath)).toBe(true);
    expect(fs.readFileSync(targetPath, 'utf8')).toBe('original-bytes');
    expect(fs.existsSync(temporaryPath)).toBe(true);
  });

  it('cancels during folder queueing and leaves source files untouched', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-cbz-mid-cancel-'));
    tempDirs.push(root);
    const chapterDir = path.join(root, 'chapter');
    fs.mkdirSync(chapterDir);
    fs.writeFileSync(path.join(chapterDir, '001.png'), ONE_PIXEL_PNG);
    fs.writeFileSync(path.join(chapterDir, '002.png'), ONE_PIXEL_PNG);
    const targetPath = path.join(root, 'chapter.cbz');
    let cancelled = false;

    const result = await exportComicInfoCbz({
      sourcePath: chapterDir,
      targetPath,
      record: { title: 'Annulation intermediaire' },
      isCancelled: () => cancelled,
      onProgress: (progress) => {
        if (progress.phase === 'queued' && progress.processedBytes < progress.totalBytes) cancelled = true;
      }
    });

    expect(result).toMatchObject({ ok: false, cancelled: true });
    expect(fs.existsSync(targetPath)).toBe(false);
    expect(fs.existsSync(path.join(chapterDir, '001.png'))).toBe(true);
    expect(fs.existsSync(path.join(chapterDir, '002.png'))).toBe(true);
  });

  it('rechecks cancellation after validation and before installing the target', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-cbz-validate-cancel-'));
    tempDirs.push(root);
    const chapterDir = path.join(root, 'chapter');
    fs.mkdirSync(chapterDir);
    fs.writeFileSync(path.join(chapterDir, '001.png'), ONE_PIXEL_PNG);
    const targetPath = path.join(root, 'chapter.cbz');
    let cancelled = false;
    const result = await exportComicInfoCbz({
      sourcePath: chapterDir,
      targetPath,
      record: { title: 'Validation puis annulation' },
      isCancelled: () => cancelled,
      onProgress: (progress) => {
        if (progress.phase === 'validating') cancelled = true;
      }
    });

    expect(result).toMatchObject({ ok: false, cancelled: true });
    expect(fs.existsSync(targetPath)).toBe(false);
    expect(fs.existsSync(path.join(chapterDir, '001.png'))).toBe(true);
  });

  it('aborts an active folder ZIP stream after output writing begins', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-cbz-stream-cancel-'));
    tempDirs.push(root);
    const chapterDir = path.join(root, 'chapter');
    fs.mkdirSync(chapterDir);
    const firstSource = crypto.randomBytes(256 * 1024);
    const secondSource = crypto.randomBytes(256 * 1024);
    fs.writeFileSync(path.join(chapterDir, '001.png'), firstSource);
    fs.writeFileSync(path.join(chapterDir, '002.png'), secondSource);
    const targetPath = path.join(root, 'chapter.cbz');
    let cancellationRequested = false;
    let observedStreaming = false;

    const result = await exportComicInfoCbz({
      sourcePath: chapterDir,
      targetPath,
      record: { title: 'Annulation pendant ecriture' },
      isCancelled: () => cancellationRequested,
      onProgress: (progress) => {
        if (progress.phase !== 'streaming') return;
        observedStreaming = true;
        cancellationRequested = true;
      }
    });

    expect(observedStreaming).toBe(true);
    expect(result).toMatchObject({ ok: false, cancelled: true });
    expect(fs.existsSync(targetPath)).toBe(false);
    expect(fs.readFileSync(path.join(chapterDir, '001.png'))).toEqual(firstSource);
    expect(fs.readFileSync(path.join(chapterDir, '002.png'))).toEqual(secondSource);
    expect(fs.readdirSync(root).sort()).toEqual(['chapter']);
  });
});

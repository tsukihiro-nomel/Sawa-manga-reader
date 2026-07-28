import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  readAllowedPdfBuffer,
  resolveAllowedPdfPath,
  resolveRealPathWithinRoots
} = require('../electron/services/mediaFileAccess.cjs');
const tempDirs = [];

afterEach(() => {
  tempDirs.splice(0).forEach((directory) => fs.rmSync(directory, { recursive: true, force: true }));
});

describe('bounded local PDF access', () => {
  it('refuses a PDF outside every configured media root', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-media-root-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-media-outside-'));
    tempDirs.push(root, outside);
    const outsidePdf = path.join(outside, 'private.pdf');
    fs.writeFileSync(outsidePdf, '%PDF-private');

    expect(resolveRealPathWithinRoots(outsidePdf, [root])).toBeNull();
    expect(resolveAllowedPdfPath(outsidePdf, { roots: [root] })).toBeNull();
    await expect(readAllowedPdfBuffer(outsidePdf, { roots: [root] })).resolves.toBeNull();
  });

  it('reads an allowed PDF but rejects it before reading when its size exceeds the bound', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-media-bounded-'));
    tempDirs.push(root);
    const pdfPath = path.join(root, 'chapter.pdf');
    fs.writeFileSync(pdfPath, '%PDF-allowed');

    await expect(readAllowedPdfBuffer(pdfPath, { roots: [root], maxBytes: 64 }))
      .resolves.toMatchObject({ resolvedPath: fs.realpathSync(pdfPath) });
    await expect(readAllowedPdfBuffer(pdfPath, { roots: [root], maxBytes: 4 }))
      .resolves.toBeNull();
    expect(resolveAllowedPdfPath(pdfPath, { roots: [root], maxBytes: 4 })).toBeNull();
  });

  it('wires the chapter-pages IPC PDF branch through the bounded realpath guard', () => {
    const mainSource = fs.readFileSync(path.resolve('electron/main.cjs'), 'utf8');
    const handler = mainSource.slice(
      mainSource.indexOf("ipcMain.handle('library:getChapterPages'"),
      mainSource.indexOf("ipcMain.handle('library:readPdfData'")
    );
    expect(handler).toContain('resolveAllowedPdfPath(chapterPath, { roots })');
    expect(handler).toContain('if (!allowedPdf) return []');
    expect(handler).toContain('readPdfPageCount(allowedPdf.resolvedPath');
  });
});

import fs from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MediaAsset, { buildOptimizedImageSrc } from '../src/components/MediaAsset.jsx';
import PreviewDisplayControls from '../src/components/PreviewDisplayControls.jsx';
import {
  normalizePreviewQuality,
  normalizePreviewSize,
  normalizeMeasuredPreviewDimensions,
  resolvePreviewRequest,
  resolvePreviewSize
} from '../src/utils/previewQuality.js';

const require = createRequire(import.meta.url);
const { normalizeState } = require('../electron/services/storage.cjs');

describe('preview sizes and adaptive quality', () => {
  it('keeps chapter and page sizes independent and normalizes unknown values', () => {
    expect(resolvePreviewSize('chapter', 'large')).toEqual({ width: 320, height: 224, minWidth: 300 });
    expect(resolvePreviewSize('page', 'compact')).toEqual({ width: 140, height: 200, minWidth: 130 });
    expect(normalizePreviewSize('unknown')).toBe('comfortable');
    expect(normalizePreviewQuality('unknown')).toBe('balanced');
  });

  it('uses displayed size times screen density with bounded profile ceilings', () => {
    expect(normalizeMeasuredPreviewDimensions(213, 301, { width: 200, height: 286 }))
      .toEqual({ width: 216, height: 304, measured: true });
    expect(resolvePreviewRequest({
      width: 200,
      height: 286,
      quality: 'balanced',
      devicePixelRatio: 2
    })).toMatchObject({ width: 400, height: 572, pixelRatio: 2, nativeQuality: 'best' });

    expect(resolvePreviewRequest({
      width: 280,
      height: 400,
      quality: 'economy',
      devicePixelRatio: 3
    })).toMatchObject({ width: 280, height: 400, pixelRatio: 1, nativeQuality: 'good' });

    const net = resolvePreviewRequest({
      width: 1000,
      height: 1600,
      quality: 'high',
      devicePixelRatio: 3
    });
    expect(Math.max(net.width, net.height)).toBe(2048);
    expect(net.pixelRatio).toBeGreaterThan(1);
  });

  it('adds adaptive dimensions to local thumbnails without changing remote assets', () => {
    const local = 'manga://local/C%3A%2FManga%2Fpage.jpg';
    expect(buildOptimizedImageSrc(local, {
      thumbnail: true,
      maxWidth: 200,
      maxHeight: 286,
      previewQuality: 'balanced',
      devicePixelRatio: 2
    })).toBe(`${local}?thumbnail=1&w=400&h=572&q=balanced`);
    expect(buildOptimizedImageSrc('https://example.test/page.jpg', {
      thumbnail: true,
      previewQuality: 'high'
    })).toBe('https://example.test/page.jpg');
  });

  it('renders keyboard-accessible French profile controls and a lazy optimized image', () => {
    const controls = renderToStaticMarkup(React.createElement(PreviewDisplayControls, {
      kind: 'page',
      size: 'large',
      quality: 'high',
      onSizeChange: () => {},
      onQualityChange: () => {}
    }));
    expect(controls).toContain('aria-label="Pages"');
    expect(controls).toContain('Économe');
    expect(controls).toContain('Auto');
    expect(controls).toContain('Net');
    expect(controls).toContain('aria-pressed="true"');

    const asset = renderToStaticMarkup(React.createElement(MediaAsset, {
      src: 'manga://local/page.jpg',
      alt: 'Page 1',
      thumbnail: true,
      previewQuality: 'high',
      maxWidth: 280,
      maxHeight: 400
    }));
    expect(asset).toContain('loading="lazy"');
    expect(asset).toContain('q=high');
  });

  it('persists all three version 4 settings and falls back field by field', () => {
    const state = normalizeState({
      ui: {
        cardSize: 'compact',
        chapterCardSize: 'large',
        pagePreviewSize: 'compact',
        previewQuality: 'high'
      }
    });
    expect(state.ui).toMatchObject({
      cardSize: 'compact',
      chapterCardSize: 'large',
      pagePreviewSize: 'compact',
      previewQuality: 'high'
    });

    const repaired = normalizeState({
      ui: {
        chapterCardSize: 'invalid',
        pagePreviewSize: 'large',
        previewQuality: 'invalid'
      }
    });
    expect(repaired.ui).toMatchObject({
      chapterCardSize: 'comfortable',
      pagePreviewSize: 'large',
      previewQuality: 'balanced'
    });
  });

  it('wires Sawa and Kavita headers and uses contain without a GPU promotion', () => {
    const app = fs.readFileSync('src/App.jsx', 'utf8');
    const sawaChapter = fs.readFileSync('src/components/MangaDetailView.jsx', 'utf8');
    const sawaPages = fs.readFileSync('src/components/ChapterPreviewView.jsx', 'utf8');
    const kavitaShell = fs.readFileSync('src/interfaces/kavita/KavitaShell.jsx', 'utf8');
    const kavitaChapter = fs.readFileSync('src/interfaces/kavita/KavitaChapterView.jsx', 'utf8');
    const mediaAsset = fs.readFileSync('src/components/MediaAsset.jsx', 'utf8');
    const globalCss = fs.readFileSync('src/styles/globals.css', 'utf8');
    const kavitaCss = fs.readFileSync('src/interfaces/kavita/kavita.css', 'utf8');

    expect(app).toContain('chapterCardSize={ui.chapterCardSize}');
    expect(app).toContain('pagePreviewSize={ui.pagePreviewSize}');
    expect(sawaChapter).toContain('kind="chapter"');
    expect(sawaPages).toContain('kind="page"');
    expect(kavitaShell).toContain('onPreviewSettingsChange={actions.onUpdateSettings}');
    expect(kavitaChapter).toContain('data-preview-size={normalizedPagePreviewSize}');
    expect(globalCss).toMatch(/\.page-thumb \.thumb-media[\s\S]*?object-fit:\s*contain/);
    expect(globalCss).toMatch(/\.chapter-cover[\s\S]*?object-fit:\s*contain/);
    expect(kavitaCss).toMatch(/\.kv-page-preview[\s\S]*?object-fit:\s*contain/);
    expect(kavitaCss).toMatch(/\.kv-chapter-thumb-image,[\s\S]*?object-fit:\s*contain/);
    expect(mediaAsset).toContain('new ResizeObserver');
    expect(mediaAsset).toContain('}, 80)');
    expect(mediaAsset).toContain('commit(0, 0), 120');
    expect(mediaAsset).toContain('measuredDimensions?.width || maxWidth');
    const smoothRule = globalCss.match(/\.thumb-smooth\s*\{([^}]*)\}/)?.[1] || '';
    expect(smoothRule).not.toContain('transform');
    const sharedPreviewRule = globalCss.match(/\.manga-card,\s*\.chapter-card,\s*\.page-thumb\s*\{([^}]*)\}/)?.[1] || '';
    expect(sharedPreviewRule).not.toContain('will-change');
  });
});

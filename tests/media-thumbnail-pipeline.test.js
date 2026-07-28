import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as mediaAssetModule from '../src/components/MediaAsset.jsx';

describe('library cover thumbnail pipeline', () => {
  it('adds bounded thumbnail parameters only for local manga assets', () => {
    const buildOptimizedImageSrc = mediaAssetModule.buildOptimizedImageSrc;
    const local = 'manga://local/C%3A%5CManga%5Cpage.jpg';
    const archive = 'manga://cbz/C%3A%5CManga%5Cchapter.cbz?entry=001.jpg';

    expect(buildOptimizedImageSrc?.(local, { thumbnail: true, maxWidth: 360, maxHeight: 540 }))
      .toBe(`${local}?thumbnail=1&w=360&h=540`);
    expect(buildOptimizedImageSrc?.(archive, { thumbnail: true, maxWidth: 360, maxHeight: 540 }))
      .toBe(`${archive}&thumbnail=1&w=360&h=540`);
    expect(buildOptimizedImageSrc?.('https://example.com/cover.jpg', { thumbnail: true, maxWidth: 360, maxHeight: 540 }))
      .toBe('https://example.com/cover.jpg');
  });

  it('renders an optimized thumbnail request without throwing', () => {
    const MediaAsset = mediaAssetModule.default;
    const markup = renderToStaticMarkup(React.createElement(MediaAsset, {
      src: 'manga://local/C:/library/cover.jpg',
      alt: 'Cover',
      thumbnail: true,
      maxWidth: 360,
      maxHeight: 540
    }));

    expect(markup).toContain('thumbnail=1&amp;w=360&amp;h=540');
  });

  it('requests thumbnails from both library card implementations', () => {
    const sawaCard = fs.readFileSync(path.join(process.cwd(), 'src/components/MangaCard.jsx'), 'utf8');
    const kavitaLibrary = fs.readFileSync(path.join(process.cwd(), 'src/interfaces/kavita/KavitaLibraryView.jsx'), 'utf8');

    expect(sawaCard).toMatch(/<MediaAsset[\s\S]{0,260}\bthumbnail\b/);
    expect(kavitaLibrary).toMatch(/<MediaAsset[\s\S]{0,260}\bthumbnail\b/);
  });

  it('keeps library overscan small enough to bound decoded cover memory', () => {
    const sawaLibrary = fs.readFileSync(path.join(process.cwd(), 'src/components/LibraryView.jsx'), 'utf8');
    const kavitaLibrary = fs.readFileSync(path.join(process.cwd(), 'src/interfaces/kavita/KavitaLibraryView.jsx'), 'utf8');
    const mangaCard = fs.readFileSync(path.join(process.cwd(), 'src/components/MangaCard.jsx'), 'utf8');

    expect(sawaLibrary).toMatch(/performanceMode\s*=\s*mangas\.length\s*>=\s*150/);
    expect(sawaLibrary).toMatch(/overscan:\s*performanceMode\s*\?\s*0\s*:\s*1/);
    expect(sawaLibrary).toMatch(/performanceMode=\{performanceMode\}/);
    expect(sawaLibrary).toMatch(/height:\s*`\$\{rowHeight\}px`/);
    expect(sawaLibrary).not.toMatch(/ref=\{virtualizer\.measureElement\}/);
    expect(mangaCard).toMatch(/mc-performance/);
    expect(mangaCard).toMatch(/!performanceMode\s*\?\s*\([\s\S]{0,260}mc-chrome/);
    expect(kavitaLibrary).toMatch(/overscan:\s*1/);
  });
});

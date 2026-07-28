import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildComicInfoExportRecord,
  buildComicInfoXml,
  writeComicInfoSidecar
} = require('../electron/services/comicInfo.cjs');

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe('ComicInfo service', () => {
  it('builds escaped XML from local metadata overrides', () => {
    const xml = buildComicInfoXml({
      series: 'Blue & Green',
      title: 'Chapitre <1>',
      author: 'Auteure "Test"',
      description: "L'histoire avance & reste locale.",
      tags: ['Seinen', 'seinen', 'Action']
    });

    expect(xml).toContain('<Series>Blue &amp; Green</Series>');
    expect(xml).toContain('<Title>Chapitre &lt;1&gt;</Title>');
    expect(xml).toContain('<Writer>Auteure &quot;Test&quot;</Writer>');
    expect(xml).toContain('<Summary>L&apos;histoire avance &amp; reste locale.</Summary>');
    expect(xml).toContain('<Genre>Seinen, Action</Genre>');
  });

  it('writes a sidecar file atomically', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-comicinfo-'));
    tempDirs.push(tempDir);
    const targetPath = path.join(tempDir, 'ComicInfo.xml');

    const result = writeComicInfoSidecar(targetPath, {
      title: 'Mon manga',
      number: '12'
    });

    expect(result.path).toBe(targetPath);
    expect(fs.existsSync(targetPath)).toBe(true);
    expect(fs.readFileSync(targetPath, 'utf8')).toContain('<Number>12</Number>');
  });

  it('builds chapter-specific XML without losing the manga series metadata', () => {
    const record = buildComicInfoExportRecord({
      displayTitle: 'Serie principale',
      number: '99',
      volume: '8',
      author: 'Auteure locale',
      tags: [{ name: 'Action' }]
    }, {
      title: 'Chapitre 7',
      number: '7',
      volume: '2'
    });
    const xml = buildComicInfoXml(record);

    expect(xml).toContain('<Series>Serie principale</Series>');
    expect(xml).toContain('<Title>Chapitre 7</Title>');
    expect(xml).toContain('<Number>7</Number>');
    expect(xml).toContain('<Volume>2</Volume>');
    expect(xml).toContain('<Writer>Auteure locale</Writer>');
  });
});

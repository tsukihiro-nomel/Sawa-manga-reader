import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('CBZ export UI contract', () => {
  it('offers a chapter or whole-manga export with all conflict policies', () => {
    const ui = fs.readFileSync(path.join(root, 'src/components/MetadataEditorModal.jsx'), 'utf8');
    expect(ui).toContain('value="__all__"');
    expect(ui).toContain("mode: 'manga-cbz'");
    expect(ui).toContain('<option value="rename">');
    expect(ui).toContain('<option value="replace">');
    expect(ui).toContain('<option value="skip">');
  });

  it('queues one chapter-specific archive job per manga chapter', () => {
    const main = fs.readFileSync(path.join(root, 'electron/main.cjs'), 'utf8');
    expect(main).toContain("mode === 'manga-cbz'");
    expect(main).toContain('chapters.map((chapter, index)');
    expect(main).toContain('buildComicInfoExportRecord(manga, chapter)');
    expect(main).toContain('conflictPolicy');
  });
});

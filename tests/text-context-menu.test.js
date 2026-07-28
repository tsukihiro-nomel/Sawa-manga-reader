import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { isTextContextRequest } from '../src/utils/textContextMenu.js';

const require = createRequire(import.meta.url);
const servicePath = path.join(process.cwd(), 'electron/services/textContextMenu.cjs');

describe('text context menu', () => {
  it('lets editable controls and selected text use the native menu', () => {
    const editableTarget = { closest: () => ({ tagName: 'INPUT' }) };
    const plainTarget = { closest: () => null };

    expect(isTextContextRequest({ target: editableTarget }, '')).toBe(true);
    expect(isTextContextRequest({ target: plainTarget }, 'titre selectionne')).toBe(true);
    expect(isTextContextRequest({ target: plainTarget }, '')).toBe(false);
  });

  it('builds safe native edit roles without exposing clipboard IPC', () => {
    expect(fs.existsSync(servicePath)).toBe(true);
    if (!fs.existsSync(servicePath)) return;

    const { buildTextContextMenuTemplate } = require(servicePath);
    const editable = buildTextContextMenuTemplate({
      isEditable: true,
      selectionText: 'abc',
      editFlags: { canCut: true, canCopy: true, canPaste: true, canSelectAll: true }
    });
    expect(editable.map((item) => item.role || item.type)).toEqual([
      'cut', 'copy', 'paste', 'separator', 'selectAll'
    ]);

    const selectedText = buildTextContextMenuTemplate({ isEditable: false, selectionText: 'abc' });
    expect(selectedText.map((item) => item.role || item.type)).toEqual(['copy']);
    expect(buildTextContextMenuTemplate({ isEditable: false, selectionText: '' })).toEqual([]);
  });

  it('installs the native menu on the main BrowserWindow', () => {
    const main = fs.readFileSync(path.join(process.cwd(), 'electron/main.cjs'), 'utf8');
    expect(main).toContain("require('./services/textContextMenu.cjs')");
    expect(main).toMatch(/installTextContextMenu\(mainWindow\.webContents/);
  });
});

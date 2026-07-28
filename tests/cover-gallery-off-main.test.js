import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('cover gallery off the Electron main thread', () => {
  it('delegates legacy and candidate discovery to the heavy I/O worker', () => {
    const main = fs.readFileSync(path.resolve('electron/main.cjs'), 'utf8');
    const worker = fs.readFileSync(path.resolve('electron/services/heavyIoWorker.cjs'), 'utf8');
    const region = main.slice(
      main.indexOf("ipcMain.handle('covers:list'"),
      main.indexOf("ipcMain.handle('covers:import'")
    );
    expect(region).toContain("runHeavyIoTask('cover-gallery'");
    expect(region).not.toContain('buildCoverGallery(');
    expect(region).not.toContain('existsSync');
    expect(region).not.toContain('readdirSync');
    expect(worker).toContain("task === 'cover-gallery'");
    expect(worker).toContain('buildCoverGallery(payload)');
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('performance IPC contracts', () => {
  it('exposes revisions, state patches, job progress and renderer long-task reporting', () => {
    const main = read('electron/main.cjs');
    const preload = read('electron/preload.cjs');
    const app = read('src/App.jsx');

    expect(main).toContain('stateRevision');
    expect(main).toContain('sourceRevision');
    expect(main).toContain('syncState');
    expect(main).toContain("webContents.send('state:patch'");
    expect(main).toContain("webContents.send('jobs:progress'");
    expect(main).toContain('function mutationResult');
    expect(preload).toContain('onStatePatch');
    expect(preload).toContain('onJobsProgress');
    expect(preload).toContain('reportPerformanceEntry');
    expect(app).toContain('renderer.longtask');
  });

  it('keeps source reconciliation out of every payload build', () => {
    const main = read('electron/main.cjs');
    const payloadBuilder = main.match(/function buildStatePayload[\s\S]*?\n}\n\nfunction runInteractiveDerivedSync/)?.[0] || '';
    expect(payloadBuilder).not.toContain('reconcileSeriesLinksWithLibrary');
    expect(main).toContain('reconcileSourceLinksInWorker');
    expect(main).toMatch(/sourceRevision \+= 1;[\s\S]{0,500}emitStatePatch\(\{[\s\S]{0,250}linkCount/);
  });
});

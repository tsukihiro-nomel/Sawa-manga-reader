import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { parseLine, start } = require('../installer/main/nsisRunner.cjs');

describe('nsisRunner', () => {
  it('parses backend progress, task, error and done lines', () => {
    expect(parseLine('Progress: 42')).toMatchObject({ p: 42 });
    expect(parseLine('Task: Runtime Suwayomi')).toMatchObject({
      c: 'em',
      task: 'Runtime Suwayomi'
    });
    expect(parseLine('Error: EACCES denied')).toMatchObject({
      c: 'err',
      error: { code: 'EACCES', message: 'denied' }
    });
    expect(parseLine('Done.')).toMatchObject({
      c: 'ok',
      p: 100,
      task: 'Termine'
    });
  });

  it('reports missing backend instead of pretending the install started', async () => {
    const errors = [];
    const result = await start({
      backendPath: 'Z:\\missing\\installer-backend.exe',
      installPath: 'C:\\Temp\\Sawa'
    }, {
      onError: (error) => errors.push(error)
    });

    expect(result.started).toBe(false);
    expect(errors[0]).toMatchObject({ kind: 'missing-backend' });
  });

  it('passes normalized log, scope and ui bundle args to the backend', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-runner-'));
    const backendPath = path.join(tempDir, 'installer-backend.exe');
    const logPath = path.join(tempDir, 'install.log');
    fs.writeFileSync(backendPath, '');

    const spawned = [];
    const result = await start({
      backendPath,
      scope: 'currentUser',
      installPath: 'C:\\Users\\Ada\\AppData\\Local\\Programs\\Sawa Manga Library',
      libraryPath: 'D:\\Manga',
      logPath,
      uiBundlePath: 'C:\\Temp\\sawa-ui',
      shortcuts: { desktop: true, startMenu: false, autostart: true },
      components: { assoc: true, ctx: true }
    }, {
      onDone: () => {}
    }, {
      spawnBackend: (exe, args) => {
        spawned.push({ exe, args });
        const child = new EventEmitter();
        child.kill = () => {};
        setImmediate(() => child.emit('close', 0));
        return child;
      },
      tailLog: () => () => {}
    });

    expect(result.started).toBe(true);
    expect(spawned[0].exe).toBe(backendPath);
    expect(spawned[0].args).toContain('/currentuser');
    expect(spawned[0].args).toContain(`/LOG=${logPath}`);
    expect(spawned[0].args).toContain('/UIBUNDLE=C:\\Temp\\sawa-ui');
    expect(spawned[0].args).toContain('/LIBPATH=D:\\Manga');
    expect(spawned[0].args.at(-1)).toBe('/D=C:\\Users\\Ada\\AppData\\Local\\Programs\\Sawa Manga Library');
  });
});

import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  terminateRunningApp,
  killByImage,
  APP_IMAGE,
} = require('../installer/main/processGuard.cjs');

describe('installer process guard', () => {
  it('targets the installed app image, not the installer binaries', () => {
    expect(APP_IMAGE).toBe('Sawa Manga Library.exe');
    expect(APP_IMAGE).not.toMatch(/installer-ui/);
    expect(APP_IMAGE).not.toMatch(/installer-backend/);
  });

  it('killByImage issues a forced, tree taskkill on Windows', () => {
    const calls = [];
    const fakeRunner = (cmd, args) => {
      calls.push({ cmd, args });
      return { status: 0 };
    };

    const res = killByImage('Sawa Manga Library.exe', fakeRunner);

    if (process.platform === 'win32') {
      expect(calls[0].cmd).toBe('taskkill');
      expect(calls[0].args).toEqual(['/IM', 'Sawa Manga Library.exe', '/T', '/F']);
      expect(res.killed).toBe(true);
    } else {
      // Non-Windows hosts (CI) short-circuit without spawning anything.
      expect(calls).toHaveLength(0);
      expect(res.notFound).toBe(true);
    }
  });

  it('treats taskkill "not found" (128) as a no-op, not a kill', () => {
    const res = killByImage('Sawa Manga Library.exe', () => ({ status: 128 }));
    expect(res.killed).toBe(false);
    if (process.platform === 'win32') {
      expect(res.notFound).toBe(true);
    }
  });

  it('also terminates the owned runtime and returns its pids', async () => {
    const delay = vi.fn().mockResolvedValue(undefined);
    const result = await terminateRunningApp(
      {},
      {
        runner: () => ({ status: 0 }),
        killRuntime: () => [4242, 4243],
        delay,
      }
    );

    expect(result.runtimePids).toEqual([4242, 4243]);
    // Something was killed (runtime pids present) -> we wait for handle release.
    expect(delay).toHaveBeenCalledTimes(1);
  });

  it('skips the settle delay when nothing was running', async () => {
    const delay = vi.fn().mockResolvedValue(undefined);
    await terminateRunningApp(
      {},
      {
        runner: () => ({ status: 128 }), // app not found
        killRuntime: () => [], // no runtime
        delay,
      }
    );

    expect(delay).not.toHaveBeenCalled();
  });

  it('never throws when the runtime kill blows up', async () => {
    const delay = vi.fn().mockResolvedValue(undefined);
    const result = await terminateRunningApp(
      {},
      {
        runner: () => ({ status: 128 }),
        killRuntime: () => {
          throw new Error('powershell unavailable');
        },
        delay,
      }
    );

    expect(result.runtimePids).toEqual([]);
  });
});

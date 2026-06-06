import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

const {
  APP_EXE_NAME,
  assertSafeInstallOrigin,
  buildBackendArgs,
  normalizeInstallOptions,
  resolveInstalledAppExe
} = require('../installer/main/installOptions.cjs');

const env = {
  LOCALAPPDATA: 'C:\\Users\\Ada\\AppData\\Local',
  ProgramFiles: 'C:\\Program Files',
  APPDATA: 'C:\\Users\\Ada\\AppData\\Roaming',
  USERPROFILE: 'C:\\Users\\Ada'
};

describe('installer install options', () => {
  it('defaults to a per-user install without elevation', () => {
    const options = normalizeInstallOptions({}, env);

    expect(options.scope).toBe('currentUser');
    expect(options.elevate).toBe(false);
    expect(options.installPath).toBe('C:\\Users\\Ada\\AppData\\Local\\Programs\\Sawa Manga Library');
    expect(resolveInstalledAppExe(options.installPath)).toBe(
      `C:\\Users\\Ada\\AppData\\Local\\Programs\\Sawa Manga Library\\${APP_EXE_NAME}`
    );
  });

  it('uses Program Files and elevation for all-users installs', () => {
    const options = normalizeInstallOptions({ scope: 'allUsers' }, env);

    expect(options.scope).toBe('allUsers');
    expect(options.elevate).toBe(true);
    expect(options.installPath).toBe('C:\\Program Files\\Sawa Manga Library');
  });

  it('builds NSIS args from visible UI options and keeps /D last', () => {
    const options = normalizeInstallOptions({
      scope: 'allUsers',
      installPath: 'C:\\Program Files\\Sawa Manga Library',
      libraryPath: 'D:\\Manga',
      logPath: 'C:\\Temp\\sawa.log',
      uiBundlePath: 'C:\\Temp\\sawa-ui',
      startMenu: 'Sawa Tools',
      components: { assoc: true, ctx: false },
      shortcuts: { desktop: false, startMenu: true, autostart: true },
      noShortcuts: false
    }, env);

    const args = buildBackendArgs(options);

    expect(args).toContain('/S');
    expect(args).toContain('/allusers');
    expect(args).toContain('/LOG=C:\\Temp\\sawa.log');
    expect(args).toContain('/UIBUNDLE=C:\\Temp\\sawa-ui');
    expect(args).toContain('/LIBPATH=D:\\Manga');
    expect(args).toContain('/STARTMENU=Sawa Tools');
    expect(args).toContain('/COMP_ASSOC=1');
    expect(args).toContain('/COMP_CTX=0');
    expect(args).toContain('/SC_DESKTOP=0');
    expect(args).toContain('/SC_STARTMENU=1');
    expect(args).toContain('/SC_AUTOSTART=1');
    expect(args.at(-1)).toBe('/D=C:\\Program Files\\Sawa Manga Library');
  });

  it('rejects unsafe uninstall origins', () => {
    expect(() => assertSafeInstallOrigin('')).toThrow(/safe/i);
    expect(() => assertSafeInstallOrigin('C:\\')).toThrow(/safe/i);
    expect(() => assertSafeInstallOrigin('C:\\Users\\Ada')).toThrow(/safe/i);
    expect(() => assertSafeInstallOrigin('C:\\Program Files')).toThrow(/safe/i);

    expect(assertSafeInstallOrigin('C:\\Users\\Ada\\AppData\\Local\\Programs\\Sawa Manga Library')).toBe(true);
  });
});

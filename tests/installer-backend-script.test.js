import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const scriptPath = path.join(process.cwd(), 'installer', 'build', 'installer-backend.nsh');

describe('installer NSIS backend script', () => {
  it('does not hardcode the old executable name', () => {
    const script = fs.readFileSync(scriptPath, 'utf8');

    expect(script).not.toMatch(/Sawa\.exe/);
    expect(script).toMatch(/Sawa Manga Library\.exe/);
  });

  it('uses shell context and parses the UI driven flags', () => {
    const script = fs.readFileSync(scriptPath, 'utf8');

    expect(script).toMatch(/SHELL_CONTEXT/);
    for (const flag of [
      '/UIBUNDLE=',
      '/LIBPATH=',
      '/SC_DESKTOP=',
      '/SC_STARTMENU=',
      '/SC_AUTOSTART=',
      '/STARTMENU=',
      '/COMP_ASSOC=',
      '/COMP_CTX=',
      '/NOSHORTCUTS='
    ]) {
      expect(script).toContain(flag);
    }
  });

  it('copies the custom UI bundle into the uninstall directory', () => {
    const script = fs.readFileSync(scriptPath, 'utf8');

    expect(script).toMatch(/SawaUiBundle/);
    expect(script).toMatch(/\\uninstall/);
    expect(script).toMatch(/CopyFiles|FileCopy|CopyFiles/);
  });

  it('overrides handleUninstallResult so the blocking uninstallFailed dialog never fires', () => {
    const script = fs.readFileSync(scriptPath, 'utf8');

    // electron-builder only skips its native "uninstallFailed" MessageBox +
    // SetErrorLevel 2 / Quit when these hooks are defined (installUtil.nsh).
    expect(script).toMatch(/!macro\s+customUnInstallCheck\b/);
    expect(script).toMatch(/!macro\s+customUnInstallCheckCurrentUser\b/);

    // The override must log and continue, never pop a MessageBox.
    const overrideBlock = script.slice(script.indexOf('!macro customUnInstallCheck'));
    expect(overrideBlock).toMatch(/SawaLog/);
    expect(overrideBlock).not.toMatch(/MessageBox/);
  });
});

import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildUninstallCleanupPlan,
  resolveUninstallBackend
} = require('../installer/main/uninstall.cjs');

describe('custom uninstaller helpers', () => {
  it('resolves the backend from process resources before sibling fallbacks', () => {
    const resolved = resolveUninstallBackend({
      resourcesPath: 'C:\\Temp\\installer\\resources',
      execPath: 'C:\\Temp\\stage\\installer-ui.exe'
    });

    expect(resolved).toBe('C:\\Temp\\installer\\resources\\backend\\installer-backend.exe');
  });

  it('plans cleanup according to keep flags and protects user data by default', () => {
    const plan = buildUninstallCleanupPlan({
      origin: 'C:\\Users\\Ada\\AppData\\Local\\Programs\\Sawa Manga Library',
      sawaData: 'C:\\Users\\Ada\\AppData\\Roaming\\sawa-manga-library',
      keepData: true,
      keepLib: false,
      keepRuntime: false
    });

    expect(plan.remove).toContain(path.win32.normalize('C:\\Users\\Ada\\AppData\\Roaming\\sawa-manga-library\\library'));
    expect(plan.remove).toContain(path.win32.normalize('C:\\Users\\Ada\\AppData\\Roaming\\sawa-manga-library\\derived'));
    expect(plan.remove).toContain(path.win32.normalize('C:\\Users\\Ada\\AppData\\Roaming\\sawa-manga-library\\cache'));
    expect(plan.remove).not.toContain(path.win32.normalize('C:\\Users\\Ada\\AppData\\Roaming\\sawa-manga-library\\user-data'));
    expect(plan.remove).toContain(path.win32.normalize('C:\\Users\\Ada\\AppData\\Local\\Programs\\Sawa Manga Library'));
  });
});

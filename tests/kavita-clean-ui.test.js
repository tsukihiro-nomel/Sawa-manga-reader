import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('independent Kavita interface mode', () => {
  it('separates interface selection from color theme selection', () => {
    const appSource = readRepoFile('src/App.jsx');
    const settingsSource = readRepoFile('src/components/SettingsDrawer.jsx');

    expect(settingsSource).toContain("id: 'kavita'");
    expect(settingsSource).toContain("id: 'sawa'");
    expect(settingsSource).toContain('onRequestInterfaceMode?.(entry.id)');
    expect(settingsSource).not.toContain("id: 'kavita-clean'");
    expect(appSource).toContain('interfaceMode');
    expect(appSource).toContain("interfaceMode === 'kavita'");
  });

  it('keeps migration compatibility while defaulting fresh installs to Kavita', () => {
    const appSource = readRepoFile('src/App.jsx');
    const storageSource = readRepoFile('electron/services/storage.cjs');

    expect(storageSource).toContain("theme: 'dark-night'");
    expect(storageSource).toContain("interfaceMode: 'kavita'");
    expect(storageSource).toContain("requestedInterfaceMode === 'kavita-clean'");
    expect(storageSource).toContain('kavitaUpgradePromptSeen');
    expect(appSource).toContain('v2-upgrade-banner');
    expect(appSource).toContain('Activer l interface Kavita');
    expect(appSource).toContain('kavitaUpgradePromptSeen');
  });
});

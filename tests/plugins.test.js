import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pluginsPath = require.resolve('../electron/services/plugins.cjs');
const storagePath = require.resolve('../electron/services/storage.cjs');

const tempDirs = [];

function loadPluginService(userDataPath) {
  delete require.cache[pluginsPath];
  require.cache[storagePath] = {
    id: storagePath,
    filename: storagePath,
    loaded: true,
    exports: {
      getUserDataPath: () => userDataPath
    }
  };
  return require('../electron/services/plugins.cjs');
}

afterEach(() => {
  delete require.cache[pluginsPath];
  delete require.cache[storagePath];
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe('plugin service', () => {
  it('lists Sources web as a built-in addon disabled by default', () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-plugins-'));
    tempDirs.push(userDataPath);
    const { listAvailablePlugins } = loadPluginService(userDataPath);

    const plugins = listAvailablePlugins({});
    const addon = plugins.find((plugin) => plugin.id === 'sources-web');

    expect(addon).toBeTruthy();
    expect(addon.name).toBe('Sources web');
    expect(addon.kind).toBe('source-addon');
    expect(addon.integrated).toBe(true);
    expect(addon.bundled).toBe(true);
    expect(addon.installed).toBe(false);
    expect(addon.installable).toBe(true);
    expect(addon.uninstallable).toBe(false);
    expect(addon.enabled).toBe(false);
    expect(addon.origin).toBe('built-in');
  });

  it('installs then uninstalls the bundled Sources web addon locally', () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-plugins-'));
    tempDirs.push(userDataPath);
    const { installPlugin, uninstallPlugin, listAvailablePlugins } = loadPluginService(userDataPath);

    const installed = installPlugin('sources-web');
    const installedManifestPath = path.join(userDataPath, 'plugins', 'sources-web', 'plugin.json');

    expect(installed).toBeTruthy();
    expect(installed.id).toBe('sources-web');
    expect(installed.integrated).toBe(true);
    expect(fs.existsSync(installedManifestPath)).toBe(true);

    const activePlugins = listAvailablePlugins({
      plugins: {
        enabled: {
          'sources-web': true
        }
      }
    });
    const activeAddon = activePlugins.find((plugin) => plugin.id === 'sources-web');

    expect(activeAddon).toBeTruthy();
    expect(activeAddon.installed).toBe(true);
    expect(activeAddon.uninstallable).toBe(true);
    expect(activeAddon.enabled).toBe(true);
    expect(activeAddon.pluginPath.endsWith(path.join('plugins', 'sources-web'))).toBe(true);

    const removed = uninstallPlugin('sources-web');
    expect(removed).toEqual({ id: 'sources-web', removed: true });
    expect(fs.existsSync(path.join(userDataPath, 'plugins', 'sources-web'))).toBe(false);

    const catalogAfterRemoval = listAvailablePlugins({});
    const addonAfterRemoval = catalogAfterRemoval.find((plugin) => plugin.id === 'sources-web');
    expect(addonAfterRemoval).toBeTruthy();
    expect(addonAfterRemoval.installed).toBe(false);
    expect(addonAfterRemoval.installable).toBe(true);
  });

  it('merges local manifests with persisted activation state', () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-plugins-'));
    tempDirs.push(userDataPath);
    const pluginDir = path.join(userDataPath, 'plugins', 'notes-helper');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
      id: 'notes-helper',
      name: 'Assistant notes',
      description: 'Plugin local de test.',
      version: '0.2.0',
      defaultEnabled: false,
      permissions: ['json-user-data']
    }, null, 2));

    const { listAvailablePlugins } = loadPluginService(userDataPath);
    const plugins = listAvailablePlugins({
      plugins: {
        enabled: {
          'notes-helper': true
        }
      }
    });

    const plugin = plugins.find((entry) => entry.id === 'notes-helper');
    expect(plugin).toBeTruthy();
    expect(plugin.name).toBe('Assistant notes');
    expect(plugin.enabled).toBe(true);
    expect(plugin.origin).toBe('local');
    expect(plugin.installed).toBe(true);
  });
});

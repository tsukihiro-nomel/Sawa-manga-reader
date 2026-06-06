const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getUserDataPath } = require('./storage.cjs');

const PLUGIN_FILE = 'plugin.json';
const BUILT_IN_PLUGINS_DIR = path.resolve(__dirname, '..', 'plugins');
const INSTALLING_MARKER = '.__installing__.';

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

function normalizePluginId(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-');
}

function normalizeString(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizeList(input) {
  return Array.isArray(input)
    ? input.map((value) => normalizeString(value)).filter(Boolean)
    : [];
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function copyDirectoryRecursive(sourceDir, targetDir) {
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    force: false,
    errorOnExist: true
  });
}

function removeDirectorySafe(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return;
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function getPluginsDir() {
  return ensureDir(path.join(getUserDataPath(), 'plugins'));
}

function getPluginDir(pluginId) {
  return path.join(getPluginsDir(), normalizePluginId(pluginId));
}

function listPluginDirectories(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  return fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: path.join(rootDir, entry.name)
    }));
}

function cleanupInstallingDirectories(rootDir = getPluginsDir()) {
  for (const entry of listPluginDirectories(rootDir)) {
    if (!entry.name.includes(INSTALLING_MARKER)) continue;
    removeDirectorySafe(entry.path);
  }
}

function normalizePluginManifest(manifest = {}, fallback = {}) {
  const id = normalizePluginId(manifest.id || fallback.id);
  if (!id) return null;

  const kind = normalizeString(manifest.kind, normalizeString(fallback.kind, 'ui-addon'));
  const bundled = Boolean(manifest.bundled ?? fallback.bundled);
  const integrated = Boolean(manifest.integrated ?? fallback.integrated);
  const launchable = Boolean(manifest.launchable ?? fallback.launchable);
  const defaultEnabled = Boolean(manifest.defaultEnabled ?? fallback.defaultEnabled);
  const origin = normalizeString(manifest.origin, normalizeString(fallback.origin, 'local'));

  return {
    id,
    name: normalizeString(manifest.name, normalizeString(fallback.name, id)),
    description: normalizeString(manifest.description, normalizeString(fallback.description, 'Addon local Sawa.')),
    version: normalizeString(manifest.version, normalizeString(fallback.version, '0.0.0')),
    kind,
    entry: normalizeString(manifest.entry, normalizeString(fallback.entry)),
    permissions: normalizeList(manifest.permissions?.length ? manifest.permissions : fallback.permissions),
    capabilities: normalizeList(manifest.capabilities?.length ? manifest.capabilities : fallback.capabilities),
    defaultEnabled,
    bundled,
    integrated,
    launchable,
    installable: Boolean(manifest.installable ?? fallback.installable),
    uninstallable: Boolean(manifest.uninstallable ?? fallback.uninstallable),
    installed: Boolean(manifest.installed ?? fallback.installed),
    enabled: Boolean(manifest.enabled ?? fallback.enabled),
    status: normalizeString(manifest.status, normalizeString(fallback.status, 'available')),
    origin,
    runtimeKind: normalizeString(manifest.runtimeKind, normalizeString(fallback.runtimeKind)),
    runtimeVersion: normalizeString(manifest.runtimeVersion, normalizeString(fallback.runtimeVersion)),
    runtimeBundled: Boolean(manifest.runtimeBundled ?? fallback.runtimeBundled),
    managementSurface: normalizeString(manifest.managementSurface, normalizeString(fallback.managementSurface)),
    repository: normalizeString(manifest.repository, normalizeString(fallback.repository)),
    pluginPath: normalizeString(manifest.pluginPath, normalizeString(fallback.pluginPath)),
    bundledPath: normalizeString(manifest.bundledPath, normalizeString(fallback.bundledPath))
  };
}

function readManifestFromDirectory(pluginDir, fallback = {}) {
  const manifestPath = path.join(pluginDir, PLUGIN_FILE);
  if (!fs.existsSync(manifestPath)) return null;
  const manifest = readJsonSafe(manifestPath);
  if (!manifest || typeof manifest !== 'object') return null;
  return normalizePluginManifest(manifest, {
    ...fallback,
    pluginPath: pluginDir
  });
}

function listBuiltInPluginTemplates() {
  if (!fs.existsSync(BUILT_IN_PLUGINS_DIR)) return [];

  return listPluginDirectories(BUILT_IN_PLUGINS_DIR)
    .map((entry) => readManifestFromDirectory(entry.path, {
      origin: 'built-in',
      bundled: true,
      bundledPath: entry.path
    }))
    .filter(Boolean);
}

function listLocalInstalledPlugins() {
  const pluginsDir = getPluginsDir();
  cleanupInstallingDirectories(pluginsDir);
  return listPluginDirectories(pluginsDir)
    .filter((entry) => !entry.name.includes(INSTALLING_MARKER))
    .map((entry) => readManifestFromDirectory(entry.path, {
      origin: 'local',
      installed: true
    }))
    .filter(Boolean);
}

function mergePluginRecord(basePlugin, installedPlugin, state = {}) {
  const enabledState = state?.plugins?.enabled || {};
  const installed = Boolean(installedPlugin);
  const merged = normalizePluginManifest({
    ...(basePlugin || {}),
    ...(installedPlugin || {}),
    origin: basePlugin?.origin || installedPlugin?.origin || 'local',
    installed,
    installable: Boolean(basePlugin?.bundled) && !installed,
    uninstallable: installed,
    launchable: Boolean(installedPlugin?.launchable || basePlugin?.launchable),
    status: installed ? 'installed' : (basePlugin?.status || 'available'),
    pluginPath: installedPlugin?.pluginPath || basePlugin?.pluginPath || '',
    bundledPath: basePlugin?.bundledPath || ''
  }, {
    origin: 'local'
  });

  if (!merged) return null;
  merged.enabled = installed
    ? Boolean(enabledState[merged.id] ?? merged.defaultEnabled)
    : false;
  return merged;
}

function listAvailablePlugins(state = {}) {
  const bundledPlugins = listBuiltInPluginTemplates();
  const installedPlugins = listLocalInstalledPlugins();
  const installedById = new Map(installedPlugins.map((plugin) => [plugin.id, plugin]));
  const catalog = new Map();

  bundledPlugins.forEach((plugin) => {
    catalog.set(plugin.id, mergePluginRecord(plugin, installedById.get(plugin.id), state));
  });

  installedPlugins.forEach((plugin) => {
    if (catalog.has(plugin.id)) return;
    catalog.set(plugin.id, mergePluginRecord(null, plugin, state));
  });

  return [...catalog.values()]
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' }));
}

function resolveBuiltInTemplate(pluginId) {
  const normalizedId = normalizePluginId(pluginId);
  return listBuiltInPluginTemplates().find((plugin) => plugin.id === normalizedId) || null;
}

function installPlugin(pluginId) {
  const template = resolveBuiltInTemplate(pluginId);
  if (!template || !template.bundledPath) {
    throw new Error('Addon introuvable.');
  }

  const normalizedId = template.id;
  const targetDir = getPluginDir(normalizedId);
  if (fs.existsSync(targetDir)) {
    return readManifestFromDirectory(targetDir, {
      origin: template.origin,
      installed: true
    });
  }

  cleanupInstallingDirectories();

  const tempSuffix = crypto.randomBytes(6).toString('hex');
  const installingDir = path.join(getPluginsDir(), `${normalizedId}${INSTALLING_MARKER}${tempSuffix}`);

  try {
    copyDirectoryRecursive(template.bundledPath, installingDir);
    const manifest = readManifestFromDirectory(installingDir, {
      origin: template.origin,
      installed: true
    });
    if (!manifest) {
      throw new Error('Manifest addon introuvable.');
    }
    fs.renameSync(installingDir, targetDir);
    return readManifestFromDirectory(targetDir, {
      origin: template.origin,
      installed: true
    });
  } catch (error) {
    removeDirectorySafe(installingDir);
    throw error;
  }
}

function uninstallPlugin(pluginId) {
  const normalizedId = normalizePluginId(pluginId);
  if (!normalizedId) {
    throw new Error('Addon introuvable.');
  }

  const pluginDir = getPluginDir(normalizedId);
  if (!fs.existsSync(pluginDir)) {
    throw new Error('Addon non installe.');
  }

  removeDirectorySafe(pluginDir);
  cleanupInstallingDirectories();
  return { id: normalizedId, removed: true };
}

function openPlugin(pluginId) {
  const normalizedId = normalizePluginId(pluginId);
  if (normalizedId === 'sources-web') {
    throw new Error('Cet addon s utilise directement dans Sawa via Ajouter > Sources web.');
  }
  throw new Error('Ce plugin ne propose pas d ouverture externe.');
}

module.exports = {
  normalizePluginManifest,
  listAvailablePlugins,
  installPlugin,
  uninstallPlugin,
  openPlugin,
  getPluginsDir
};

const path = require('path');

const PRODUCT_NAME = 'Sawa Manga Library';
const APP_EXE_NAME = `${PRODUCT_NAME}.exe`;
const DEFAULT_START_MENU = PRODUCT_NAME;

function envValue(env, ...keys) {
  for (const key of keys) {
    if (env && typeof env[key] === 'string' && env[key].trim()) return env[key];
  }
  return '';
}

function winNormalize(input) {
  return path.win32.normalize(String(input || '').trim());
}

function defaultUserProfile(env) {
  return envValue(env, 'USERPROFILE') || 'C:\\Users\\Default';
}

function defaultLocalAppData(env) {
  return (
    envValue(env, 'LOCALAPPDATA', 'LocalAppData') ||
    path.win32.join(defaultUserProfile(env), 'AppData', 'Local')
  );
}

function defaultAppData(env) {
  return (
    envValue(env, 'APPDATA', 'AppData') ||
    path.win32.join(defaultUserProfile(env), 'AppData', 'Roaming')
  );
}

function defaultProgramFiles(env) {
  return envValue(env, 'ProgramFiles', 'PROGRAMFILES') || 'C:\\Program Files';
}

function getDefaultInstallPath(scope, env = process.env) {
  if (scope === 'allUsers') {
    return path.win32.join(defaultProgramFiles(env), PRODUCT_NAME);
  }
  return path.win32.join(defaultLocalAppData(env), 'Programs', PRODUCT_NAME);
}

function getDefaultLibraryPath(env = process.env) {
  return path.win32.join(defaultUserProfile(env), 'Documents', 'Sawa');
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(lower)) return true;
    if (['0', 'false', 'no', 'off'].includes(lower)) return false;
  }
  return fallback;
}

function normalizeScope(value) {
  return value === 'allUsers' ? 'allUsers' : 'currentUser';
}

function normalizeStartMenu(value) {
  const trimmed = String(value || '').trim();
  return trimmed || DEFAULT_START_MENU;
}

function normalizeInstallOptions(opts = {}, env = process.env) {
  const scope = normalizeScope(opts.scope);
  const installPath = winNormalize(opts.installPath || getDefaultInstallPath(scope, env));
  const userInstallPath = getDefaultInstallPath('currentUser', env);
  const machineInstallPath = getDefaultInstallPath('allUsers', env);

  const rawComponents = opts.components && typeof opts.components === 'object' ? opts.components : {};
  const rawShortcuts = opts.shortcuts && typeof opts.shortcuts === 'object' ? opts.shortcuts : {};

  const components = {
    assoc: normalizeBoolean(rawComponents.assoc, true),
    ctx: normalizeBoolean(rawComponents.ctx, false),
  };

  const shortcuts = {
    desktop: normalizeBoolean(rawShortcuts.desktop, true),
    startMenu: normalizeBoolean(rawShortcuts.startMenu, true),
    autostart: normalizeBoolean(rawShortcuts.autostart, false),
  };

  return {
    ...opts,
    scope,
    installPath,
    userInstallPath,
    machineInstallPath,
    libraryPath: winNormalize(opts.libraryPath || getDefaultLibraryPath(env)),
    startMenu: normalizeStartMenu(opts.startMenu),
    components,
    shortcuts,
    noShortcuts: normalizeBoolean(opts.noShortcuts, false),
    elevate: scope === 'allUsers',
    logPath: opts.logPath ? winNormalize(opts.logPath) : opts.logPath,
    uiBundlePath: opts.uiBundlePath ? winNormalize(opts.uiBundlePath) : opts.uiBundlePath,
    appDataPath: defaultAppData(env),
  };
}

function boolFlag(value) {
  return value ? '1' : '0';
}

function buildBackendArgs(options) {
  const normalized = normalizeInstallOptions(options || {});
  const args = ['/S', normalized.scope === 'allUsers' ? '/allusers' : '/currentuser'];

  if (normalized.mode === 'uninstall') args.push('/uninstall');
  if (normalized.logPath) args.push(`/LOG=${normalized.logPath}`);
  if (normalized.uiBundlePath) args.push(`/UIBUNDLE=${normalized.uiBundlePath}`);
  if (normalized.libraryPath) args.push(`/LIBPATH=${normalized.libraryPath}`);
  if (normalized.startMenu) args.push(`/STARTMENU=${normalized.startMenu}`);

  args.push(`/COMP_ASSOC=${boolFlag(normalized.components.assoc)}`);
  args.push(`/COMP_CTX=${boolFlag(normalized.components.ctx)}`);

  args.push(`/SC_DESKTOP=${boolFlag(normalized.shortcuts.desktop)}`);
  args.push(`/SC_STARTMENU=${boolFlag(normalized.shortcuts.startMenu)}`);
  args.push(`/SC_AUTOSTART=${boolFlag(normalized.shortcuts.autostart)}`);

  if (normalized.noShortcuts) args.push('/NOSHORTCUTS=1');
  if (typeof normalized.keepData === 'boolean') args.push(`/KEEPDATA=${boolFlag(normalized.keepData)}`);
  if (typeof normalized.keepLib === 'boolean') args.push(`/KEEPLIB=${boolFlag(normalized.keepLib)}`);
  if (typeof normalized.keepRuntime === 'boolean') args.push(`/KEEPRUNTIME=${boolFlag(normalized.keepRuntime)}`);

  if (normalized.mode !== 'uninstall' && normalized.installPath) {
    args.push(`/D=${normalized.installPath}`);
  }

  return args;
}

function resolveInstalledAppExe(installPath) {
  return path.win32.join(winNormalize(installPath), APP_EXE_NAME);
}

function comparablePath(input) {
  return winNormalize(input).replace(/[\\]+$/, '').toLowerCase();
}

function assertSafeInstallOrigin(origin, env = process.env) {
  const normalized = winNormalize(origin);
  if (!normalized) throw new Error('Unsafe empty install origin');

  const parsed = path.win32.parse(normalized);
  const withoutTrailing = normalized.replace(/[\\]+$/, '');
  if (!path.win32.isAbsolute(normalized) || withoutTrailing.toLowerCase() === parsed.root.replace(/[\\]+$/, '').toLowerCase()) {
    throw new Error(`Unsafe install origin: ${origin}`);
  }

  const forbidden = [
    defaultUserProfile(env),
    defaultProgramFiles(env),
    defaultAppData(env),
    defaultLocalAppData(env),
    path.win32.join(defaultLocalAppData(env), 'Programs'),
  ].map(comparablePath);

  const target = comparablePath(normalized);
  if (forbidden.includes(target)) {
    throw new Error(`Unsafe install origin: ${origin}`);
  }

  if (path.win32.basename(normalized).toLowerCase() !== PRODUCT_NAME.toLowerCase()) {
    throw new Error(`Unsafe install origin, expected ${PRODUCT_NAME}: ${origin}`);
  }

  return true;
}

module.exports = {
  APP_EXE_NAME,
  DEFAULT_START_MENU,
  PRODUCT_NAME,
  assertSafeInstallOrigin,
  buildBackendArgs,
  getDefaultInstallPath,
  getDefaultLibraryPath,
  normalizeInstallOptions,
  resolveInstalledAppExe,
};

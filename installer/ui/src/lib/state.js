// State + reducer for the installer wizard. The state object is the single
// source of truth; every page calls dispatch({ goto, set, abort, modal }).

import installerAPI from './ipc.js';

export const STEP_LABELS = [
  'Accueil',
  'Licence',
  'Prérequis',
  'Composants',
  'Emplacement',
  'Raccourcis',
  'Installation',
  'Fin',
];

export const PAGE_TO_STEP = {
  welcome: 0,
  license: 1,
  prereq: 2,
  components: 3,
  location: 4,
  shortcuts: 5,
  installing: 6,
  finish: 7,
};

const defaults = installerAPI.defaults();

export const initialState = {
  page: 'welcome',
  modal: null,
  agreed: false,
  prereqScan: null,
  components: {
    core: true,
    suwa: true,
    jre: true,
    themes: true,
    assoc: true,
    ctx: false,
  },
  scope: defaults.scope || 'currentUser',
  installPath: defaults.installPath,
  userInstallPath: defaults.userInstallPath || defaults.installPath,
  machineInstallPath:
    defaults.machineInstallPath || 'C:\\Program Files\\Sawa Manga Library',
  libraryPath: defaults.libraryPath,
  startMenu: 'Sawa Manga Library',
  shortcuts: {
    desktop: true,
    startMenu: true,
    autostart: false,
  },
  noShortcuts: false,
  runId: defaults.runId,
  // installation outputs
  installResult: null,
  // uninstall flags
  uninstall: {
    keepData: true,
    keepLib: true,
    keepRuntime: false,
  },
};

export function reducer(state, action) {
  if (!action) return state;
  if (action.abort) {
    installerAPI.cancelInstall();
    installerAPI.quit();
    return state;
  }
  let next = state;
  if (action.set) {
    next = { ...next, ...action.set };
  }
  if (action.goto) {
    next = { ...next, page: action.goto };
  }
  if ('modal' in action) {
    next = { ...next, modal: action.modal };
  }
  return next;
}

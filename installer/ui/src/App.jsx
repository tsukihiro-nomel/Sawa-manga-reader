// Top-level controller. Routes between pages based on state.page (or the
// uninstall flow when --uninstall was passed on the command line).

import React, { useReducer } from 'react';
import { initialState, reducer } from './lib/state.js';
import installerAPI from './lib/ipc.js';

import { WelcomePage } from './pages/Welcome.jsx';
import { LicensePage } from './pages/License.jsx';
import { PrereqPage } from './pages/Prereq.jsx';
import { ComponentsPage } from './pages/Components.jsx';
import { LocationPage } from './pages/Location.jsx';
import { ShortcutsPage } from './pages/Shortcuts.jsx';
import { InstallingPage } from './pages/Installing.jsx';
import { FinishPage } from './pages/Finish.jsx';
import { UninstallPage } from './pages/Uninstall.jsx';

const PAGES = {
  welcome: WelcomePage,
  license: LicensePage,
  prereq: PrereqPage,
  components: ComponentsPage,
  location: LocationPage,
  shortcuts: ShortcutsPage,
  installing: InstallingPage,
  finish: FinishPage,
};

function isUninstallMode() {
  const argv = installerAPI.argv();
  return argv.includes('--uninstall');
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);

  if (isUninstallMode()) {
    return <UninstallPage state={state} dispatch={dispatch} />;
  }

  const Page = PAGES[state.page] || WelcomePage;
  return <Page state={state} dispatch={dispatch} />;
}

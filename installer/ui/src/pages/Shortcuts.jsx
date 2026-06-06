import React, { useState } from 'react';
import { InstallerShell, Check } from '../components/Shell.jsx';
import { STEP_LABELS } from '../lib/state.js';

export function ShortcutsPage({ state, dispatch }) {
  const [sc, setSc] = useState(state.shortcuts);
  const [folder, setFolder] = useState(state.startMenu);
  const [noShortcuts, setNoShortcuts] = useState(state.noShortcuts);
  const set = (k, v) => setSc((p) => ({ ...p, [k]: v }));

  return (
    <InstallerShell
      steps={STEP_LABELS}
      current={5}
      header={{
        eyebrow: 'Etape 06',
        title: 'Menu Demarrer & raccourcis',
        sub: 'Ces options creent de vrais raccourcis Windows',
      }}
      footer={
        <>
          <button className="btn" onClick={() => dispatch({ goto: 'location' })}>
            Precedent
          </button>
          <button className="btn" onClick={() => dispatch({ abort: true })}>
            Annuler
          </button>
          <button
            className="btn primary"
            onClick={() =>
              dispatch({
                set: { shortcuts: sc, startMenu: folder, noShortcuts },
                goto: 'installing',
              })
            }
          >
            Installer
          </button>
        </>
      }
    >
      <div className="field">
        <label>Dossier menu Demarrer</label>
        <div className="input">
          <input
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            disabled={noShortcuts}
            style={{ opacity: noShortcuts ? 0.4 : 1 }}
          />
        </div>
      </div>

      <div className="card" style={{ padding: '10px 12px' }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Raccourcis a creer
        </div>
        <div
          style={{
            opacity: noShortcuts ? 0.4 : 1,
            pointerEvents: noShortcuts ? 'none' : 'auto',
          }}
        >
          <Check
            on={sc.desktop}
            onClick={() => set('desktop', !sc.desktop)}
            title="Bureau"
            desc="Raccourci Sawa Manga Library"
          />
          <Check
            on={sc.startMenu}
            onClick={() => set('startMenu', !sc.startMenu)}
            title="Menu Demarrer"
            desc="Dossier avec entree principale et desinstallateur"
          />
          <Check
            on={sc.autostart}
            onClick={() => set('autostart', !sc.autostart)}
            title="Demarrer avec Windows"
            desc="Cree un raccourci dans le dossier Startup"
          />
        </div>
      </div>

      <Check
        on={noShortcuts}
        onClick={() => setNoShortcuts(!noShortcuts)}
        title="Ne creer aucun raccourci"
        desc="Sawa restera installe, mais vous devrez le lancer depuis le dossier d'installation"
      />
    </InstallerShell>
  );
}

export default ShortcutsPage;

import React, { useEffect, useState } from 'react';
import { InstallerShell, Notice } from '../components/Shell.jsx';
import { STEP_LABELS } from '../lib/state.js';
import installerAPI from '../lib/ipc.js';

function samePath(left, right) {
  return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
}

export function LocationPage({ state, dispatch }) {
  const [scope, setScope] = useState(state.scope || 'currentUser');
  const [path, setPath] = useState(state.installPath);
  const [libPath, setLibPath] = useState(state.libraryPath);
  const [disk, setDisk] = useState({ free: 286.4, required: 1.82 });

  const userPath = state.userInstallPath || state.installPath;
  const machinePath = state.machineInstallPath || 'C:\\Program Files\\Sawa Manga Library';

  useEffect(() => {
    let cancelled = false;
    installerAPI.getDiskSpace(path).then((d) => {
      if (cancelled || !d) return;
      setDisk({
        free: typeof d.free === 'number' ? d.free : 286.4,
        required: typeof d.required === 'number' ? d.required : 1.82,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  function chooseScope(nextScope) {
    const previousDefault = scope === 'allUsers' ? machinePath : userPath;
    const nextDefault = nextScope === 'allUsers' ? machinePath : userPath;
    setScope(nextScope);
    if (!path || samePath(path, previousDefault)) setPath(nextDefault);
  }

  async function pickInstall() {
    const dir = await installerAPI.pickDir(path);
    if (dir) setPath(dir);
  }

  async function pickLibrary() {
    const dir = await installerAPI.pickDir(libPath);
    if (dir) setLibPath(dir);
  }

  const ratio = Math.min(1, (disk.required / Math.max(disk.free, 0.01)) * 30);
  const isMachine = scope === 'allUsers';

  return (
    <InstallerShell
      steps={STEP_LABELS}
      current={4}
      header={{
        eyebrow: 'Etape 05',
        title: "Emplacement d'installation",
        sub: isMachine
          ? 'Installation machine avec elevation UAC et registre HKLM'
          : 'Installation utilisateur sans elevation et registre HKCU',
      }}
      footer={
        <>
          <button className="btn" onClick={() => dispatch({ goto: 'components' })}>
            Precedent
          </button>
          <button className="btn" onClick={() => dispatch({ abort: true })}>
            Annuler
          </button>
          <button
            className="btn primary"
            onClick={() =>
              dispatch({
                set: { scope, installPath: path, libraryPath: libPath },
                goto: 'shortcuts',
              })
            }
          >
            Suivant
          </button>
        </>
      }
    >
      <div className="card" style={{ padding: '10px 12px' }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          Mode Windows
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            type="button"
            className="btn"
            onClick={() => chooseScope('currentUser')}
            style={{
              height: 'auto',
              minHeight: 54,
              alignItems: 'flex-start',
              justifyContent: 'center',
              flexDirection: 'column',
              background: !isMachine ? 'rgba(200,100,48,.14)' : undefined,
              borderColor: !isMachine ? 'var(--border-ember)' : undefined,
              color: !isMachine ? 'var(--gold-soft)' : undefined,
            }}
          >
            <span>Utilisateur</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              Sans UAC - HKCU
            </span>
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => chooseScope('allUsers')}
            style={{
              height: 'auto',
              minHeight: 54,
              alignItems: 'flex-start',
              justifyContent: 'center',
              flexDirection: 'column',
              background: isMachine ? 'rgba(200,100,48,.14)' : undefined,
              borderColor: isMachine ? 'var(--border-ember)' : undefined,
              color: isMachine ? 'var(--gold-soft)' : undefined,
            }}
          >
            <span>Machine / Admin</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              UAC - HKLM
            </span>
          </button>
        </div>
      </div>

      <div className="field">
        <label>Dossier d'installation</label>
        <div className="input">
          <input value={path} onChange={(e) => setPath(e.target.value)} />
          <div className="adorn" onClick={pickInstall}>
            Parcourir...
          </div>
        </div>
      </div>

      <div className="field">
        <label>
          Dossier bibliotheque par defaut
          <span
            style={{
              marginLeft: 8,
              fontWeight: 400,
              textTransform: 'none',
              letterSpacing: 0,
              color: 'var(--text-muted)',
            }}
          >
            - vos fichiers manga vivront ici
          </span>
        </label>
        <div className="input">
          <input value={libPath} onChange={(e) => setLibPath(e.target.value)} />
          <div className="adorn" onClick={pickLibrary}>
            Parcourir...
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '10px 12px' }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Espace disque - Volume {(path[0] || 'C').toUpperCase()}:
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div className="progress" style={{ height: 6 }}>
              <div
                className="bar"
                style={{
                  width: `${ratio * 100}%`,
                  background:
                    'linear-gradient(90deg, var(--ember-orange), var(--gold-soft))',
                }}
              />
            </div>
            <div
              style={{
                marginTop: 6,
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 10.5,
                color: 'var(--text-muted)',
                fontFamily: 'var(--ff-mono)',
                letterSpacing: '.05em',
              }}
            >
              <span>
                REQUIS{' '}
                <span style={{ color: 'var(--ember-orange)' }}>
                  {disk.required.toFixed(2)} GB
                </span>
              </span>
              <span>
                DISPONIBLE{' '}
                <span style={{ color: 'var(--mint)' }}>
                  {disk.free.toFixed(1)} GB
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <Notice kind={isMachine ? 'warn' : 'info'}>
        {isMachine
          ? "Le mode machine demandera l'autorisation administrateur pendant l'installation."
          : "Le mode utilisateur installe Sawa dans votre profil et n'a pas besoin d'UAC."}
      </Notice>
    </InstallerShell>
  );
}

export default LocationPage;

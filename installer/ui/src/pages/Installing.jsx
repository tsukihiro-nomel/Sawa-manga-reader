import React, { useEffect, useRef, useState } from 'react';
import { InstallerShell, Progress, ConsoleLog } from '../components/Shell.jsx';
import { STEP_LABELS } from '../lib/state.js';
import installerAPI from '../lib/ipc.js';
import ErrorModal from '../modals/ErrorModal.jsx';
import PermissionsModal from '../modals/PermissionsModal.jsx';

// Mock script played in dev/browser mode so the UI looks correct
// without an Electron backend. In production the real backend
// emits matching `{ t, c, m, p, task }` records via onProgress().
const MOCK_SCRIPT = [
  { t: '00:00', c: 'mute', m: 'NSIS 3.09 · /LANG=FR /S=0 /TEMP=%TEMP%\\nsaB7F2.tmp' },
  {
    t: '00:00',
    c: 'em',
    m: 'Nettoyage des process Suwayomi/Sawa résiduels…',
    task: 'Préparation du système',
    p: 3,
  },
  {
    t: '00:00',
    c: 'mute',
    m: '  scan APPDATA\\sawa-manga-library\\source-runtime — 0 process trouvés',
  },
  {
    t: '00:01',
    c: 'ok',
    m: 'Aucun java.exe/javaw.exe/jcef_helper.exe à terminer',
    p: 6,
  },
  {
    t: '00:01',
    c: 'em',
    m: "Création du répertoire d'installation…",
    task: 'Extraction des fichiers',
  },
  { t: '00:01', c: '', m: '  mkdir C:\\Program Files\\Sawa Manga Library', p: 10 },
  { t: '00:02', c: '', m: '  extraction resources\\app.asar (312 MB)…', p: 24 },
  {
    t: '00:04',
    c: '',
    m: '  extraction resources\\app.asar.unpacked\\better-sqlite3',
    p: 32,
  },
  { t: '00:05', c: '', m: '  extraction locales\\fr.pak · en-US.pak · ja.pak', p: 38 },
  {
    t: '00:06',
    c: 'em',
    m: 'Installation du runtime Sources web…',
    task: 'Runtime Suwayomi',
    p: 42,
  },
  { t: '00:07', c: '', m: '  vendor\\suwayomi\\Suwayomi-Server.jar (124 MB)', p: 54 },
  { t: '00:09', c: '', m: '  vendor\\jre21\\ (184 MB)', p: 68 },
  { t: '00:11', c: 'em', m: 'Configuration…', task: 'Registre & protocoles' },
  {
    t: '00:11',
    c: '',
    m: '  HKLM\\Software\\Sawa\\Setup\\InstallDir ← C:\\Program Files\\Sawa...',
    p: 72,
  },
  { t: '00:12', c: '', m: '  protocole sawa:// enregistré', p: 76 },
  { t: '00:12', c: '', m: '  associations .cbz .cbr .cb7 .pdf → Sawa', p: 80 },
  { t: '00:13', c: 'em', m: 'Création des raccourcis…', task: 'Raccourcis' },
  { t: '00:13', c: '', m: '  %DESKTOP%\\Sawa Manga Library.lnk', p: 85 },
  {
    t: '00:13',
    c: '',
    m: '  %APPDATA%\\Microsoft\\Windows\\Start Menu\\...\\Sawa\\',
    p: 88,
  },
  { t: '00:14', c: '', m: '  désinstallateur ← Uninstall.exe', p: 91 },
  {
    t: '00:14',
    c: 'em',
    m: 'Initialisation des données utilisateur…',
    task: 'Bootstrap user-data',
  },
  { t: '00:14', c: '', m: '  %APPDATA%\\sawa-manga-library\\user-data\\ créé', p: 94 },
  {
    t: '00:15',
    c: '',
    m: '  thèmes : Dark Night · Light Paper · Coffee House · Neon City',
    p: 97,
  },
  {
    t: '00:15',
    c: '',
    m: '  index SQLite dérivé : à reconstruire au 1er démarrage',
    p: 99,
  },
  {
    t: '00:15',
    c: 'ok',
    m: 'Installation terminée — Sawa est prêt.',
    p: 100,
    task: 'Terminé',
  },
];

export function InstallingPage({ state, dispatch }) {
  const [progress, setProgress] = useState(0);
  const [lines, setLines] = useState([]);
  const [task, setTask] = useState('Initialisation…');
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const opts = {
      scope: state.scope,
      installPath: state.installPath,
      libraryPath: state.libraryPath,
      components: state.components,
      shortcuts: state.shortcuts,
      startMenu: state.startMenu,
      noShortcuts: state.noShortcuts,
      runId: state.runId,
    };

    const unsubProgress = installerAPI.onProgress((evt) => {
      setLines((l) => [...l, evt]);
      if (typeof evt.p === 'number') setProgress(evt.p);
      if (evt.task) setTask(evt.task);
    });
    const unsubDone = installerAPI.onDone((res) => {
      setDone(true);
      dispatch({ set: { installResult: res } });
    });
    const unsubErr = installerAPI.onError((err) => {
      setError(err || { kind: 'unknown', message: 'Erreur inconnue' });
    });

    (async () => {
      const res = await installerAPI.startInstall(opts);

      // Dev/browser fallback: play the mock script.
      if (!res || res.started === false) {
        let i = 0;
        const tick = () => {
          if (i >= MOCK_SCRIPT.length) {
            setDone(true);
            return;
          }
          const s = MOCK_SCRIPT[i++];
          setLines((l) => [...l, s]);
          if (typeof s.p === 'number') setProgress(s.p);
          if (s.task) setTask(s.task);
          setTimeout(tick, i < 8 ? 260 : 320);
        };
        const t = setTimeout(tick, 400);
        return () => clearTimeout(t);
      }
      return undefined;
    })();

    return () => {
      unsubProgress && unsubProgress();
      unsubDone && unsubDone();
      unsubErr && unsubErr();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <InstallerShell
        steps={STEP_LABELS}
        current={6}
        header={{
          eyebrow: 'Étape 07',
          title: 'Installation en cours',
          sub: task,
        }}
        footer={
          <>
            <button className="btn ghost" disabled>
              ‹ Précédent
            </button>
            <button
              className="btn"
              onClick={() => dispatch({ abort: true })}
              disabled={done}
            >
              Annuler
            </button>
            <button
              className="btn primary"
              disabled={!done}
              onClick={() => dispatch({ goto: 'finish' })}
            >
              Suivant ›
            </button>
          </>
        }
        footerLeft={
          <div
            style={{
              marginLeft: 14,
              fontSize: 10.5,
              color: 'var(--text-muted)',
              fontFamily: 'var(--ff-mono)',
            }}
          >
            <span
              style={{
                color: done ? 'var(--mint)' : 'var(--gold-soft)',
              }}
            >
              {done ? '✓' : '●'}
            </span>
            &nbsp;{progress}%
          </div>
        }
      >
        <Progress value={progress} done={done} />
        <div
          style={{
            fontSize: 11.5,
            color: 'var(--text-secondary)',
            display: 'flex',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <span
            className="h-serif"
            style={{ fontStyle: 'italic', color: 'var(--gold-soft)' }}
          >
            ✦
          </span>
          <span>{task}</span>
          <span style={{ flex: 1 }} />
          <span
            className="mono"
            style={{ fontSize: 10.5, color: 'var(--text-muted)' }}
          >
            {progress}%
          </span>
        </div>
        <ConsoleLog lines={lines} />
      </InstallerShell>

      {error && error.kind === 'permissions' && (
        <PermissionsModal
          onElevate={async () => {
            setError(null);
            await installerAPI.startInstall({
              installPath: state.installPath,
              scope: state.scope,
              libraryPath: state.libraryPath,
              components: state.components,
              shortcuts: state.shortcuts,
              startMenu: state.startMenu,
              noShortcuts: state.noShortcuts,
              runId: state.runId,
              elevate: true,
            });
          }}
          onCancel={() => {
            setError(null);
            dispatch({ goto: 'location' });
          }}
        />
      )}

      {error && error.kind !== 'permissions' && (
        <ErrorModal
          error={error}
          onRetry={async () => {
            setError(null);
            await installerAPI.startInstall({
              installPath: state.installPath,
              scope: state.scope,
              libraryPath: state.libraryPath,
              components: state.components,
              shortcuts: state.shortcuts,
              startMenu: state.startMenu,
              noShortcuts: state.noShortcuts,
              runId: state.runId,
            });
          }}
          onIgnore={() => setError(null)}
          onCancel={() => dispatch({ abort: true })}
        />
      )}
    </>
  );
}

export default InstallingPage;

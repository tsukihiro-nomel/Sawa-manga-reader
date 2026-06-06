import React, { useEffect, useState } from 'react';
import { InstallerShell, Notice } from '../components/Shell.jsx';
import { STEP_LABELS } from '../lib/state.js';
import installerAPI from '../lib/ipc.js';
import AppRunningModal from '../modals/AppRunningModal.jsx';
import ExistingInstallModal from '../modals/ExistingInstallModal.jsx';

// Items exposed in the UI. Order matters — they animate sequentially.
const ITEMS = [
  {
    key: 'os',
    name: "Système d'exploitation",
    detail: 'Windows 10 · 64 bits · build ≥ 19041',
  },
  {
    key: 'admin',
    name: "Privilèges d'installation",
    detail: 'Utilisateur sans UAC, machine avec elevation',
  },
  {
    key: 'disk',
    name: 'Espace disque disponible',
    detail: 'Sawa + Suwayomi-Server.jar ≈ 1,82 Go',
  },
  {
    key: 'java',
    name: 'Runtime Java (Sources web)',
    detail: 'Java 21+ · ou JRE bundled · ou $SAWA_JAVA_PATH',
  },
  {
    key: 'proc',
    name: 'Aucun process Sawa en cours',
    detail: 'java.exe / javaw.exe / jcef_helper.exe ciblés',
  },
  {
    key: 'prev',
    name: 'Version précédente',
    detail: 'Detection via HKCU/HKLM\\Software\\Sawa',
  },
];

// Sequentially reveal scan results so we keep the polished "ANALYSE…"
// animation. We animate even when the IPC call returns instantly.
function useAnimatedScan(state, dispatch) {
  const [scan, setScan] = useState(state.prereqScan || null);

  useEffect(() => {
    if (scan && scan.done) return;
    let cancelled = false;
    let timer = null;

    (async () => {
      const real = await installerAPI.runPrereqScan();
      if (cancelled) return;
      const results = {};
      let i = 0;
      const tick = () => {
        if (cancelled) return;
        const it = ITEMS[i];
        if (!it) {
          setScan({ done: true, results });
          dispatch({ set: { prereqScan: { done: true, results } } });
          return;
        }
        setScan({
          done: false,
          running: it.key,
          results: { ...results },
        });
        timer = setTimeout(() => {
          results[it.key] = real[it.key] || {
            ok: true,
            label: it.detail,
          };
          i += 1;
          tick();
        }, 320);
      };
      tick();
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [scan, setScan];
}

export function PrereqPage({ state, dispatch }) {
  const [scan, setScan] = useAnimatedScan(state, dispatch);
  const allDone = scan && scan.done;

  // Auto-detect edge cases on completion.
  useEffect(() => {
    if (!allDone) return;
    const procs = scan.results.proc;
    const prev = scan.results.prev;
    if (procs && procs.ok === false && Array.isArray(procs.pids) && procs.pids.length) {
      dispatch({ modal: { kind: 'app-running', pids: procs.pids } });
      return;
    }
    if (prev && prev.found) {
      dispatch({
        modal: {
          kind: 'existing-install',
          version: prev.version || 'inconnue',
        },
      });
    }
  }, [allDone, scan, dispatch]);

  function rescan() {
    setScan(null);
    dispatch({ modal: null });
  }

  return (
    <>
      <InstallerShell
        steps={STEP_LABELS}
        current={2}
        header={{
          eyebrow: 'Étape 03',
          title: 'Vérification des prérequis',
          sub: 'Sawa scanne votre système avant de continuer',
        }}
        footer={
          <>
            <button
              className="btn"
              onClick={() => dispatch({ goto: 'license' })}
            >
              ‹ Précédent
            </button>
            <button className="btn" onClick={() => dispatch({ abort: true })}>
              Annuler
            </button>
            <button
              className="btn primary"
              disabled={!allDone}
              onClick={() =>
                dispatch({ set: { prereqScan: scan }, goto: 'components' })
              }
            >
              Suivant ›
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ITEMS.map((it) => {
            const r = scan && scan.results[it.key];
            const running = scan && scan.running === it.key;
            let statusNode;
            if (!r && !running) {
              statusNode = (
                <span
                  className="mono"
                  style={{ color: 'var(--text-muted)', fontSize: 10.5 }}
                >
                  EN ATTENTE
                </span>
              );
            } else if (running) {
              statusNode = (
                <span
                  className="mono"
                  style={{ color: 'var(--gold-ui)', fontSize: 10.5 }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--gold-ui)',
                      marginRight: 6,
                      animation: 'shimmer 1s infinite',
                    }}
                  />
                  ANALYSE…
                </span>
              );
            } else if (r.ok === true) {
              statusNode = (
                <span
                  className="mono"
                  style={{ color: 'var(--mint)', fontSize: 10.5 }}
                >
                  ✓ OK
                </span>
              );
            } else if (r.ok === 'warn') {
              statusNode = (
                <span
                  className="mono"
                  style={{ color: 'var(--gold-ui)', fontSize: 10.5 }}
                >
                  ! ATTENTION
                </span>
              );
            } else {
              statusNode = (
                <span
                  className="mono"
                  style={{ color: '#ff7a6a', fontSize: 10.5 }}
                >
                  ✕ ÉCHEC
                </span>
              );
            }
            return (
              <div
                key={it.key}
                className="card"
                style={{
                  padding: '9px 12px',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  borderColor: running ? 'var(--border-ember)' : undefined,
                  background: running ? 'rgba(200,100,48,.04)' : undefined,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: 'var(--silver-cool)',
                      fontWeight: 600,
                    }}
                  >
                    {it.name}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: r ? 'var(--text-secondary)' : 'var(--text-muted)',
                      marginTop: 2,
                    }}
                  >
                    {r ? r.label : it.detail}
                  </div>
                </div>
                {statusNode}
              </div>
            );
          })}
        </div>

        {allDone && scan.results.java && scan.results.java.ok === 'warn' && (
          <Notice kind="warn" title="Runtime Java bundled requis">
            Java 21+ n'est pas détecté sur le système. Le JRE bundled
            (vendor/suwayomi) sera installé — cela ajoute ≈ 180&nbsp;Mo. Vous
            pouvez définir <span className="mono">SAWA_JAVA_PATH</span> plus
            tard.
          </Notice>
        )}
      </InstallerShell>

      {state.modal && state.modal.kind === 'app-running' && (
        <AppRunningModal
          pids={state.modal.pids}
          onForce={async () => {
            await installerAPI.killSuwayomi();
            rescan();
          }}
          onRetry={rescan}
          onCancel={() => dispatch({ abort: true })}
        />
      )}

      {state.modal && state.modal.kind === 'existing-install' && (
        <ExistingInstallModal
          version={state.modal.version}
          onCancel={() => dispatch({ abort: true })}
          onUpgrade={() => dispatch({ modal: null })}
          onRepair={() => dispatch({ modal: null })}
          onUninstall={() => dispatch({ modal: null, goto: 'welcome' })}
        />
      )}
    </>
  );
}

export default PrereqPage;

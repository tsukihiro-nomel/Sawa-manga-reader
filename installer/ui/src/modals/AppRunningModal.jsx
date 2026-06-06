import React from 'react';
import { Modal } from '../components/Shell.jsx';

export function AppRunningModal({ pids = [], onRetry, onForce, onCancel }) {
  const list = pids.length
    ? pids
    : [
        {
          name: 'java.exe',
          pid: 14820,
          path: '%APPDATA%\\sawa-manga-library\\source-runtime',
        },
        {
          name: 'Sawa Manga Library.exe',
          pid: 19044,
          path: 'C:\\Program Files\\Sawa Manga Library',
        },
      ];

  return (
    <Modal
      kind="warn"
      title="Sawa semble déjà en cours d'exécution"
      sub={`${list.length} processus correspondants détectés`}
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            Annuler
          </button>
          <button className="btn" onClick={onForce}>
            Forcer la fermeture
          </button>
          <button className="btn primary" onClick={onRetry}>
            Réessayer
          </button>
        </>
      }
    >
      <p style={{ margin: '0 0 8px' }}>
        L'installateur nettoie automatiquement les process Suwayomi
        appartenant à Sawa. Les processus suivants pointent vers le
        runtime&nbsp;:
      </p>
      <div
        className="card"
        style={{
          fontFamily: 'var(--ff-mono)',
          fontSize: 11,
          lineHeight: 1.5,
          padding: 10,
          background: 'var(--bg-field)',
        }}
      >
        {list.map((p, i) => (
          <div key={`${p.pid || i}`}>
            <span style={{ color: 'var(--gold-soft)' }}>
              {p.name || 'process'}
            </span>{' '}
            <span className="muted">PID {p.pid ?? '—'}</span>
            {p.path ? ` — ${p.path}` : null}
          </div>
        ))}
      </div>
      <p
        style={{
          margin: '8px 0 0',
          fontSize: 11,
          color: 'var(--text-muted)',
        }}
      >
        Seuls les process appartenant à Sawa seront terminés — les autres
        installations Java de votre machine restent intactes.
      </p>
    </Modal>
  );
}

export default AppRunningModal;

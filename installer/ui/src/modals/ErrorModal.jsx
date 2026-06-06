import React from 'react';
import { Modal } from '../components/Shell.jsx';

export function ErrorModal({ error, onRetry, onIgnore, onCancel }) {
  const code = error?.code || '0x80070020';
  const message = error?.message || 'Fichier verrouillé';
  const path =
    error?.path || 'C:\\Program Files\\Sawa Manga Library\\resources\\app.asar';

  return (
    <Modal
      kind="danger"
      title="Erreur pendant l'extraction"
      sub={`Code ${code} · ${message}`}
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            Annuler l'installation
          </button>
          <button className="btn" onClick={onIgnore}>
            Ignorer
          </button>
          <button className="btn primary" onClick={onRetry}>
            Réessayer
          </button>
        </>
      }
    >
      <p style={{ margin: '0 0 6px' }}>Impossible d'écrire&nbsp;:</p>
      <div
        className="card"
        style={{
          padding: 8,
          fontFamily: 'var(--ff-mono)',
          fontSize: 11,
          background: 'var(--bg-field)',
          color: '#ff7a6a',
          wordBreak: 'break-all',
        }}
      >
        {path}
      </div>
      <p
        style={{
          margin: '10px 0 0',
          fontSize: 11,
          color: 'var(--text-muted)',
        }}
      >
        {error?.hint ||
          'Le fichier est ouvert par un autre processus. Fermez Sawa ou tout antivirus qui pourrait le scanner, puis réessayez.'}
      </p>
    </Modal>
  );
}

export default ErrorModal;

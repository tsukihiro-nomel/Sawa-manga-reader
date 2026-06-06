import React from 'react';
import { Modal } from '../components/Shell.jsx';

export function PermissionsModal({ onElevate, onCancel, path }) {
  return (
    <Modal
      kind="danger"
      title="Privileges administrateur requis"
      sub={`Impossible d'ecrire dans ${path || 'C:\\Program Files'}`}
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            Changer de dossier
          </button>
          <button className="btn primary" onClick={onElevate}>
            Relancer en admin
          </button>
        </>
      }
    >
      <p style={{ margin: '0 0 8px' }}>
        Le mode machine installe dans
        <span className="mono"> {path || 'C:\\Program Files'}</span> et ecrit
        les integrations systeme dans
        <span className="mono"> HKLM\Software</span>.
      </p>
      <p style={{ margin: 0 }}>
        Le mode utilisateur installe dans
        <span className="mono"> %LOCALAPPDATA%\Programs\Sawa Manga Library</span>
        et utilise <span className="mono">HKCU</span>, sans elevation.
      </p>
    </Modal>
  );
}

export default PermissionsModal;

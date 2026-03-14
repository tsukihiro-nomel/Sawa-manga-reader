import { useState } from 'react';
import { MoonIcon, SparklesIcon, SunIcon, KeyboardIcon, HardDriveIcon, DownloadIcon, UploadIcon, RefreshIcon, ImageIcon, TrashIcon } from './Icons.jsx';

const THEMES = [
  { id: 'dark-night', icon: MoonIcon, title: 'Dark Night', description: 'Noir profond, contraste premium et lumière maîtrisée.' },
  { id: 'light-paper', icon: SunIcon, title: 'Light Paper', description: "Clair lisible, propre et beaucoup moins cassé qu'avant." },
  { id: 'coffee-house', icon: SparklesIcon, title: 'Coffee House', description: 'Tons crème, cacao et verre fumé pour une ambiance cosy.' },
  { id: 'neon-city', icon: SparklesIcon, title: 'Neon City', description: 'Fond encre, cyan électrique et contours glow façon cyberpunk.' }
];

const DEFAULT_SHORTCUTS = {
  nextPage: { label: 'Page suivante', keys: ['ArrowRight'] },
  prevPage: { label: 'Page précédente', keys: ['ArrowLeft'] },
  nextChapter: { label: 'Chapitre suivant', keys: ['Ctrl', 'ArrowRight'] },
  prevChapter: { label: 'Chapitre précédent', keys: ['Ctrl', 'ArrowLeft'] },
  toggleFullscreen: { label: 'Plein écran', keys: ['F'] },
  toggleUI: { label: 'Masquer/Afficher l\'UI', keys: ['H'] },
  zoomIn: { label: 'Zoom +', keys: ['+'] },
  zoomOut: { label: 'Zoom −', keys: ['-'] },
  zoomReset: { label: 'Zoom 100%', keys: ['0'] },
  exitReader: { label: 'Quitter la lecture', keys: ['Escape'] }
};

function ColorField({ label, value, onChange, helper }) {
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(value || '') ? value : '#8b5cf6';
  return (
    <label className="color-picker-field">
      <span className="color-picker-label">{label}</span>
      <div className="color-picker-control">
        <input className="color-picker-input" type="color" value={safeColor} onChange={(e) => onChange(e.target.value)} />
        <input className="color-picker-text" type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="#8b5cf6" spellCheck={false} />
      </div>
      {helper ? <small>{helper}</small> : null}
    </label>
  );
}

function ShortcutRow({ id, shortcut, customKeys, onRecord }) {
  const [recording, setRecording] = useState(false);
  const displayKeys = customKeys || shortcut.keys;

  function startRecording() {
    setRecording(true);
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const keys = [];
      if (e.ctrlKey || e.metaKey) keys.push('Ctrl');
      if (e.shiftKey) keys.push('Shift');
      if (e.altKey) keys.push('Alt');
      const key = e.key;
      if (!['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
        keys.push(key.length === 1 ? key.toUpperCase() : key);
      }
      if (keys.length > 0 && !['Control', 'Shift', 'Alt', 'Meta'].includes(keys[keys.length - 1])) {
        onRecord(id, keys);
        setRecording(false);
        window.removeEventListener('keydown', handler, true);
      }
    };
    window.addEventListener('keydown', handler, true);
    // Auto-cancel after 5s
    setTimeout(() => {
      setRecording(false);
      window.removeEventListener('keydown', handler, true);
    }, 5000);
  }

  return (
    <div className="shortcut-row">
      <span className="shortcut-label">{shortcut.label}</span>
      <div className="shortcut-key-wrap">
        {displayKeys.map((k, i) => (
          <span key={i} className={`shortcut-key ${recording ? 'shortcut-recording' : ''}`}>{k}</span>
        ))}
        <button className="ghost-button shortcut-edit-btn" onClick={startRecording}>
          {recording ? '...' : 'Modifier'}
        </button>
      </div>
    </div>
  );
}

export default function SettingsDrawer({ open, ui, onClose, onChange, onPickBackground, onRemoveBackground }) {
  const shortcuts = ui.shortcuts || {};

  async function handleExportSawa() {
    try {
      await window.mangaAPI.exportBackup();
    } catch (err) {
      console.error('Export failed:', err);
    }
  }

  async function handleImportSawa() {
    try {
      await window.mangaAPI.importBackup();
    } catch (err) {
      console.error('Import failed:', err);
    }
  }

  function handleRecordShortcut(id, keys) {
    const updated = { ...shortcuts, [id]: keys };
    onChange({ shortcuts: updated });
  }

  function handleResetShortcuts() {
    onChange({ shortcuts: {} });
  }

  return (
    <div className={`settings-drawer-backdrop ${open ? 'open' : ''}`} onClick={onClose}>
      <aside className={`settings-drawer ${open ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <div>
            <h3>Paramètres</h3>
            <p>Personnalise l'apparence, le lecteur, les raccourcis et gère tes données.</p>
          </div>
          <button className="ghost-button" onClick={onClose}>Fermer</button>
        </div>

        {/* ── Thème ── */}
        <div className="settings-section">
          <div className="settings-section-heading">
            <h4>Ambiance visuelle</h4>
            <span>Choisis le thème global de l'app.</span>
          </div>
          <div className="theme-grid">
            {THEMES.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.id} className={`theme-card ${ui.theme === t.id ? 'theme-card-active' : ''}`} onClick={() => onChange({ theme: t.id })}>
                  <div className="theme-card-topline">
                    <span className="theme-card-icon"><Icon size={16} /></span>
                    <strong>{t.title}</strong>
                  </div>
                  <p>{t.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Bibliothèque & Accent ── */}
        <div className="settings-section settings-grid-two">
          <section className="settings-card-block">
            <div className="settings-section-heading">
              <h4>Bibliothèque</h4>
              <span>Contrôle le filtrage et la densité.</span>
            </div>
            <label className="settings-toggle">
              <span>Afficher les catégories masquées</span>
              <input type="checkbox" checked={ui.showHiddenCategories} onChange={(e) => onChange({ showHiddenCategories: e.target.checked })} />
            </label>
            <label className="settings-toggle">
              <span>Aperçu des pages avant lecture</span>
              <input type="checkbox" checked={ui.showPagePreviewBeforeReading} onChange={(e) => onChange({ showPagePreviewBeforeReading: e.target.checked })} />
            </label>
            <div className="settings-subsection">
              <h5>Taille des cartes</h5>
              <div className="segmented-control segmented-control-full">
                <button className={ui.cardSize === 'compact' ? 'active' : ''} onClick={() => onChange({ cardSize: 'compact' })}>Compact</button>
                <button className={ui.cardSize === 'comfortable' ? 'active' : ''} onClick={() => onChange({ cardSize: 'comfortable' })}>Confort</button>
                <button className={ui.cardSize === 'large' ? 'active' : ''} onClick={() => onChange({ cardSize: 'large' })}>Large</button>
              </div>
            </div>
          </section>

          <section className="settings-card-block">
            <div className="settings-section-heading">
              <h4>Accent et détails</h4>
              <span>Choisis une couleur principale et secondaire.</span>
            </div>
            <ColorField label="Couleur d'accent" value={ui.accent || '#8b5cf6'} onChange={(accent) => onChange({ accent })} helper="Boutons actifs, sélection, focus." />
            <ColorField label="Couleur de détail" value={ui.accentAlt || '#38bdf8'} onChange={(accentAlt) => onChange({ accentAlt })} helper="Dégradés secondaires, glows." />
          </section>
        </div>

        {/* ── Image de fond ── */}
        <div className="settings-section">
          <div className="settings-section-heading">
            <h4><ImageIcon size={16} /> Image de fond</h4>
            <span>Personnalise le fond du logiciel avec une image.</span>
          </div>

          {ui.backgroundImage ? (
            <div className="bg-image-preview-wrap">
              <div className="bg-image-preview">
                <img src={`manga://local/${encodeURIComponent(ui.backgroundImage)}`} alt="Fond" />
                <div className="bg-image-preview-overlay" style={{ opacity: 1 - (ui.backgroundOpacity ?? 0.15) }} />
              </div>
              <div className="bg-image-actions">
                <button className="ghost-button" onClick={onPickBackground}>
                  <ImageIcon size={14} /> Changer
                </button>
                <button className="ghost-button ghost-button-danger" onClick={onRemoveBackground}>
                  <TrashIcon size={14} /> Retirer
                </button>
              </div>
            </div>
          ) : (
            <button className="ghost-button bg-image-pick-btn" onClick={onPickBackground}>
              <ImageIcon size={16} /> Choisir une image
            </button>
          )}

          {ui.backgroundImage && (
            <>
              <div className="settings-subsection">
                <h5>Opacité de l'image ({Math.round((ui.backgroundOpacity ?? 0.15) * 100)}%)</h5>
                <input
                  type="range"
                  min="0" max="100" step="1"
                  value={Math.round((ui.backgroundOpacity ?? 0.15) * 100)}
                  onChange={(e) => onChange({ backgroundOpacity: parseInt(e.target.value, 10) / 100 })}
                  className="settings-slider"
                />
                <div className="settings-note">Baisse l'opacité pour voir le thème en fond.</div>
              </div>

              <div className="settings-subsection">
                <label className="settings-toggle">
                  <span>Utiliser les couleurs extraites de l'image</span>
                  <input
                    type="checkbox"
                    checked={!!ui.useBackgroundColors}
                    onChange={(e) => {
                      if (e.target.checked && ui.backgroundAccent) {
                        onChange({
                          useBackgroundColors: true,
                          accent: ui.backgroundAccent,
                          accentAlt: ui.backgroundAccentAlt || ui.backgroundAccent
                        });
                      } else {
                        onChange({ useBackgroundColors: false });
                      }
                    }}
                  />
                </label>
                {ui.backgroundAccent && (
                  <div className="bg-extracted-colors">
                    <span className="bg-color-swatch" style={{ background: ui.backgroundAccent }} title={ui.backgroundAccent} />
                    <span className="bg-color-swatch" style={{ background: ui.backgroundAccentAlt || ui.backgroundAccent }} title={ui.backgroundAccentAlt} />
                    <span className="muted-text" style={{ fontSize: '0.75rem' }}>Couleurs détectées</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Lecture ── */}
        <div className="settings-section">
          <div className="settings-section-heading">
            <h4>Lecture</h4>
            <span>Paramètres du lecteur de chapitres.</span>
          </div>
          <div className="settings-subsection">
            <h5>Seuil de marquage lu automatique</h5>
            <div className="segmented-control segmented-control-full">
              <button className={ui.readThreshold === 0.9 ? 'active' : ''} onClick={() => onChange({ readThreshold: 0.9 })}>90%</button>
              <button className={ui.readThreshold === 0.95 ? 'active' : ''} onClick={() => onChange({ readThreshold: 0.95 })}>95%</button>
              <button className={ui.readThreshold === 1.0 ? 'active' : ''} onClick={() => onChange({ readThreshold: 1.0 })}>100%</button>
            </div>
          </div>
          <label className="settings-toggle">
            <span>Lecture continue</span>
            <input type="checkbox" checked={!!ui.autoNextChapter} onChange={(e) => onChange({ autoNextChapter: e.target.checked })} />
          </label>
          <div className="settings-note">Passer automatiquement au chapitre suivant en fin de chapitre.</div>
          <label className="settings-toggle">
            <span>Précharger le chapitre suivant</span>
            <input type="checkbox" checked={!!ui.preloadNextChapter} onChange={(e) => onChange({ preloadNextChapter: e.target.checked })} />
          </label>
          <label className="settings-toggle">
            <span>Masquer l'UI après inactivité</span>
            <input type="checkbox" checked={!!ui.autoHideReaderUI} onChange={(e) => onChange({ autoHideReaderUI: e.target.checked })} />
          </label>
          <div className="settings-subsection">
            <h5>Direction de lecture par défaut</h5>
            <div className="segmented-control segmented-control-full">
              <button className={ui.readDirection === 'ltr' ? 'active' : ''} onClick={() => onChange({ readDirection: 'ltr' })}>Gauche → Droite</button>
              <button className={ui.readDirection === 'rtl' ? 'active' : ''} onClick={() => onChange({ readDirection: 'rtl' })}>Droite → Gauche</button>
            </div>
          </div>
        </div>

        {/* ── Raccourcis clavier ── */}
        <div className="settings-section">
          <div className="settings-section-heading">
            <h4><KeyboardIcon size={16} /> Raccourcis clavier</h4>
            <span>Personnalise les raccourcis du lecteur.</span>
          </div>
          <div className="shortcuts-list">
            {Object.entries(DEFAULT_SHORTCUTS).map(([id, shortcut]) => (
              <ShortcutRow
                key={id}
                id={id}
                shortcut={shortcut}
                customKeys={shortcuts[id]}
                onRecord={handleRecordShortcut}
              />
            ))}
          </div>
          <button className="ghost-button" onClick={handleResetShortcuts} style={{ marginTop: 8 }}>
            Réinitialiser les raccourcis
          </button>
        </div>

        {/* ── Métadonnées en ligne ── */}
        <div className="settings-section">
          <div className="settings-section-heading">
            <h4>Métadonnées en ligne</h4>
            <span>Enrichis ta bibliothèque avec des données en ligne.</span>
          </div>
          <label className="settings-toggle">
            <span>Activer les métadonnées en ligne</span>
            <input type="checkbox" checked={!!ui.onlineMetadata} onChange={(e) => onChange({ onlineMetadata: e.target.checked })} />
          </label>
          <div className="settings-note">Le logiciel reste entièrement fonctionnel hors ligne.</div>
          {ui.onlineMetadata && (
            <div className="settings-subsection">
              <label className="settings-toggle">
                <span>Couvertures en ligne</span>
                <input type="checkbox" checked={!!ui.onlineCoverAllowed} onChange={(e) => onChange({ onlineCoverAllowed: e.target.checked })} />
              </label>
              <label className="settings-toggle">
                <span>Descriptions en ligne</span>
                <input type="checkbox" checked={!!ui.onlineDescriptionAllowed} onChange={(e) => onChange({ onlineDescriptionAllowed: e.target.checked })} />
              </label>
              <label className="settings-toggle">
                <span>Confirmer avant import</span>
                <input type="checkbox" checked={!!ui.onlineConfirmBeforeImport} onChange={(e) => onChange({ onlineConfirmBeforeImport: e.target.checked })} />
              </label>
            </div>
          )}
        </div>

        {/* ── Données & Sauvegarde ── */}
        <div className="settings-section">
          <div className="settings-section-heading">
            <h4><HardDriveIcon size={16} /> Données & Sauvegarde</h4>
            <span>Exporte ou importe tes données au format .sawa pour les transférer entre appareils.</span>
          </div>

          <div className="settings-grid-two">
            <button className="ghost-button" onClick={handleExportSawa}>
              <DownloadIcon size={16} /> Exporter (.sawa)
            </button>
            <button className="ghost-button" onClick={handleImportSawa}>
              <UploadIcon size={16} /> Importer (.sawa)
            </button>
          </div>
          <div className="settings-note">
            Le fichier .sawa contient ta progression, tes favoris, tes tags, tes collections et tes paramètres.
            Les fichiers manga eux-mêmes ne sont pas inclus.
          </div>
        </div>

        {/* ── Maintenance ── */}
        <div className="settings-section">
          <div className="settings-section-heading">
            <h4>Maintenance</h4>
            <span>Outils de gestion et de diagnostic.</span>
          </div>
          <div className="settings-grid-two">
            <button className="ghost-button" onClick={() => onChange({ forceRescan: true })}>
              <RefreshIcon size={16} /> Rescan complet
            </button>
            <button className="ghost-button" onClick={() => onChange({ clearCache: true })}>
              <HardDriveIcon size={16} /> Vider le cache
            </button>
          </div>
        </div>

        {/* ── À propos ── */}
        <div className="settings-section">
          <div className="settings-section-heading"><h4>À propos</h4></div>
          <div className="settings-note">
            <strong>Sawa Manga Library v2.0.0</strong><br />
            Bibliothèque manga locale, premium, intelligente et entièrement hors ligne.
          </div>
        </div>

      </aside>
    </div>
  );
}

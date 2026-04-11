import { useState } from 'react';
import { MoonIcon, SparklesIcon, SunIcon, KeyboardIcon, HardDriveIcon, DownloadIcon, UploadIcon, RefreshIcon, ImageIcon, TrashIcon, ArchiveIcon, EyeOffIcon, LockIcon } from './Icons.jsx';

const THEMES = [
  { id: 'dark-night', icon: MoonIcon, title: 'Dark Night', description: 'Noir profond, contraste premium et lumiere maitrisee.' },
  { id: 'light-paper', icon: SunIcon, title: 'Light Paper', description: "Clair lisible, propre et beaucoup moins casse qu'avant." },
  { id: 'coffee-house', icon: SparklesIcon, title: 'Coffee House', description: 'Tons creme, cacao et verre fume pour une ambiance cosy.' },
  { id: 'neon-city', icon: SparklesIcon, title: 'Neon City', description: 'Fond encre, cyan electrique et contours glow facon cyberpunk.' }
];

const DEFAULT_SHORTCUTS = {
  nextPage: { label: 'Page suivante', keys: ['ArrowRight'] },
  prevPage: { label: 'Page precedente', keys: ['ArrowLeft'] },
  nextChapter: { label: 'Chapitre suivant', keys: ['Ctrl', 'ArrowRight'] },
  prevChapter: { label: 'Chapitre precedent', keys: ['Ctrl', 'ArrowLeft'] },
  toggleFullscreen: { label: 'Plein ecran', keys: ['F'] },
  toggleUI: { label: 'Masquer/Afficher l\'UI', keys: ['H'] },
  zoomIn: { label: 'Zoom +', keys: ['+'] },
  zoomOut: { label: 'Zoom -', keys: ['-'] },
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

export default function SettingsDrawer({
  open,
  ui,
  vault,
  onClose,
  onChange,
  onPickBackground,
  onRemoveBackground,
  onUpdateVaultPrefs,
  onLockVault,
  onPanicLock
}) {
  const shortcuts = ui.shortcuts || {};
  const vaultConfigured = Boolean(vault?.configured);
  const vaultLocked = Boolean(vault?.locked);

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
            <h3>Parametres</h3>
            <p>Personnalise l'apparence, le lecteur, les raccourcis et gere tes donnees.</p>
          </div>
          <button className="ghost-button" onClick={onClose}>Fermer</button>
        </div>

        <div className="settings-section">
          <div className="settings-section-heading">
            <h4>Ambiance visuelle</h4>
            <span>Choisis le theme global de l'app.</span>
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

        <div className="settings-section settings-grid-two">
          <section className="settings-card-block">
            <div className="settings-section-heading">
              <h4>Bibliotheque</h4>
              <span>Controle le filtrage et la densite.</span>
            </div>
            <label className="settings-toggle">
              <span>Afficher les categories masquees</span>
              <input type="checkbox" checked={ui.showHiddenCategories} onChange={(e) => onChange({ showHiddenCategories: e.target.checked })} />
            </label>
            <label className="settings-toggle">
              <span>Apercu des pages avant lecture</span>
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
              <h4>Accent et details</h4>
              <span>Choisis une couleur principale et secondaire.</span>
            </div>
            <ColorField label="Couleur d'accent" value={ui.accent || '#8b5cf6'} onChange={(accent) => onChange({ accent })} helper="Boutons actifs, selection, focus." />
            <ColorField label="Couleur de detail" value={ui.accentAlt || '#38bdf8'} onChange={(accentAlt) => onChange({ accentAlt })} helper="Degrades secondaires, glows." />
          </section>
        </div>

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
                <h5>Opacite de l'image ({Math.round((ui.backgroundOpacity ?? 0.15) * 100)}%)</h5>
                <input
                  type="range"
                  min="0" max="100" step="1"
                  value={Math.round((ui.backgroundOpacity ?? 0.15) * 100)}
                  onChange={(e) => onChange({ backgroundOpacity: parseInt(e.target.value, 10) / 100 })}
                  className="settings-slider"
                />
                <div className="settings-note">Baisse l'opacite pour voir le theme en fond.</div>
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
                    <span className="muted-text" style={{ fontSize: '0.75rem' }}>Couleurs detectees</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="settings-section">
          <div className="settings-section-heading">
            <h4>Lecture</h4>
            <span>Parametres du lecteur de chapitres.</span>
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
            <span>Precharger le chapitre suivant</span>
            <input type="checkbox" checked={!!ui.preloadNextChapter} onChange={(e) => onChange({ preloadNextChapter: e.target.checked })} />
          </label>
          <label className="settings-toggle">
            <span>Masquer l'UI apres inactivite</span>
            <input type="checkbox" checked={!!ui.autoHideReaderUI} onChange={(e) => onChange({ autoHideReaderUI: e.target.checked })} />
          </label>
          <div className="settings-subsection">
            <h5>Direction de lecture par defaut</h5>
            <div className="segmented-control segmented-control-full">
              <button className={ui.readDirection === 'ltr' ? 'active' : ''} onClick={() => onChange({ readDirection: 'ltr' })}>Gauche {'->'} Droite</button>
              <button className={ui.readDirection === 'rtl' ? 'active' : ''} onClick={() => onChange({ readDirection: 'rtl' })}>Droite {'->'} Gauche</button>
            </div>
          </div>
        </div>

        <div className="settings-section settings-grid-two">
          <section className="settings-card-block">
            <div className="settings-section-heading">
              <h4><ArchiveIcon size={16} /> Coffre & Privacy</h4>
              <span>Pilote rapidement les options de confidentialite.</span>
            </div>
            <label className="settings-toggle">
              <span>Flouter les couvertures privees</span>
              <input
                type="checkbox"
                checked={!!vault?.blurCovers}
                disabled={!vaultConfigured || vaultLocked || !onUpdateVaultPrefs}
                onChange={(e) => onUpdateVaultPrefs?.({ blurCovers: e.target.checked })}
              />
            </label>
            <label className="settings-toggle">
              <span>Stealth mode (masquage strict)</span>
              <input
                type="checkbox"
                checked={!!vault?.stealthMode}
                disabled={!vaultConfigured || vaultLocked || !onUpdateVaultPrefs}
                onChange={(e) => onUpdateVaultPrefs?.({ stealthMode: e.target.checked })}
              />
            </label>
            <div className="settings-grid-two">
              <button className="ghost-button" disabled={!vaultConfigured || vaultLocked || !onLockVault} onClick={() => onLockVault?.()}>
                <LockIcon size={16} /> Reverrouiller le coffre
              </button>
              <button className="ghost-button ghost-button-danger" disabled={!vaultConfigured || vaultLocked || !onPanicLock} onClick={() => onPanicLock?.()}>
                <EyeOffIcon size={16} /> Panic lock
              </button>
            </div>
            <div className="settings-note">
              {vaultConfigured
                ? (vaultLocked ? 'Le coffre est verrouille: deverrouille-le pour modifier ses options.' : 'Le coffre se verrouille automatiquement a la fermeture de l application.')
                : 'Configure d abord un code PIN dans la vue Coffre pour activer ces options.'}
            </div>
          </section>

          <section className="settings-card-block">
            <div className="settings-section-heading">
              <h4>Recherche & Queue</h4>
              <span>Rappels des nouvelles fonctions de navigation.</span>
            </div>
            <div className="settings-note">Queue de lecture: ouvre/ferme avec Ctrl+Shift+Q depuis la barre d onglets.</div>
            <div className="settings-note">Recherche avancee: utilise `tag:`, `status:`, `private:`, `author:` et `chapters&gt;`.</div>
            <div className="settings-note">Les filtres reconnus restent visibles en chips dans la barre de recherche.</div>
          </section>
        </div>

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
            Reinitialiser les raccourcis
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-section-heading">
            <h4>Metadonnees en ligne</h4>
            <span>Enrichis ta bibliotheque avec des donnees en ligne.</span>
          </div>
          <label className="settings-toggle">
            <span>Activer les metadonnees en ligne</span>
            <input type="checkbox" checked={!!ui.onlineMetadata} onChange={(e) => onChange({ onlineMetadata: e.target.checked })} />
          </label>
          <div className="settings-note">Le logiciel reste entierement fonctionnel hors ligne.</div>
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
                <span>Afficher les resultats NSFW (nHentai)</span>
                <input type="checkbox" checked={!!ui.allowNsfwSources} onChange={(e) => onChange({ allowNsfwSources: e.target.checked })} />
              </label>
              <div className="settings-note">Desactive = nHentai est completement retire des recherches de metadonnees.</div>
              <label className="settings-toggle">
                <span>Confirmer avant import</span>
                <input type="checkbox" checked={!!ui.onlineConfirmBeforeImport} onChange={(e) => onChange({ onlineConfirmBeforeImport: e.target.checked })} />
              </label>
            </div>
          )}
          <div className="settings-subsection">
            <h5>ComicInfo.xml local</h5>
            <label className="settings-toggle">
              <span>Support actif (CBZ + sidecar)</span>
              <input type="checkbox" checked readOnly />
            </label>
            <div className="settings-note">
              Lecture de ComicInfo.xml incluse: detection locale pendant le scan et import manuel depuis
              le menu contextuel (clic droit manga {'>'} Importer ComicInfo) ou l editeur de metadonnees.
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-heading">
            <h4><HardDriveIcon size={16} /> Donnees & Sauvegarde</h4>
            <span>Exporte ou importe tes donnees au format .sawa pour les transferer entre appareils.</span>
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
            Le fichier .sawa contient ta progression, tes favoris, tes tags, tes collections et tes parametres.
            Les fichiers manga eux-memes ne sont pas inclus.
          </div>
        </div>

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

        <div className="settings-section">
          <div className="settings-section-heading"><h4>A propos</h4></div>
          <div className="settings-note">
            <strong>Sawa Manga Library v3.0.0</strong><br />
            Bibliotheque manga locale, premium, intelligente et entierement hors ligne.
          </div>
        </div>

      </aside>
    </div>
  );
}

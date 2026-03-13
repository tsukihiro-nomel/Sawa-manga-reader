import { MoonIcon, SparklesIcon, SunIcon } from './Icons.jsx';

const THEMES = [
  {
    id: 'dark-night',
    icon: MoonIcon,
    title: 'Dark Night',
    description: 'Noir profond, contraste premium et lumière maîtrisée.'
  },
  {
    id: 'light-paper',
    icon: SunIcon,
    title: 'Light Paper',
    description: 'Clair lisible, propre et beaucoup moins cassé qu’avant.'
  },
  {
    id: 'coffee-house',
    icon: SparklesIcon,
    title: 'Coffee House',
    description: 'Tons crème, cacao et verre fumé pour une ambiance cosy.'
  },
  {
    id: 'neon-city',
    icon: SparklesIcon,
    title: 'Neon City',
    description: 'Fond encre, cyan électrique et contours glow façon cyberpunk.'
  }
];

function ColorField({ label, value, onChange, helper }) {
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(value || '') ? value : '#8b5cf6';
  return (
    <label className="color-picker-field">
      <span className="color-picker-label">{label}</span>
      <div className="color-picker-control">
        <input
          className="color-picker-input"
          type="color"
          value={safeColor}
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          className="color-picker-text"
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="#8b5cf6"
          spellCheck={false}
        />
      </div>
      {helper ? <small>{helper}</small> : null}
    </label>
  );
}

export default function SettingsDrawer({ open, ui, onClose, onChange }) {
  return (
    <div className={`settings-drawer-backdrop ${open ? 'open' : ''}`} onClick={onClose}>
      <aside className={`settings-drawer ${open ? 'open' : ''}`} onClick={(event) => event.stopPropagation()}>
        <div className="settings-header">
          <div>
            <h3>Paramètres avancés</h3>
            <p>Personnalise les thèmes, les couleurs d’accent, la densité des cartes et le comportement de la bibliothèque.</p>
          </div>
          <button className="ghost-button" onClick={onClose}>Fermer</button>
        </div>

        <div className="settings-section">
          <div className="settings-section-heading">
            <h4>Ambiance visuelle</h4>
            <span>Choisis le thème global de l’app.</span>
          </div>
          <div className="theme-grid">
            {THEMES.map((themeOption) => {
              const Icon = themeOption.icon;
              return (
                <button
                  key={themeOption.id}
                  className={`theme-card ${ui.theme === themeOption.id ? 'theme-card-active' : ''}`}
                  onClick={() => onChange({ theme: themeOption.id })}
                >
                  <div className="theme-card-topline">
                    <span className="theme-card-icon"><Icon size={16} /></span>
                    <strong>{themeOption.title}</strong>
                  </div>
                  <p>{themeOption.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="settings-section settings-grid-two">
          <section className="settings-card-block">
            <div className="settings-section-heading">
              <h4>Bibliothèque</h4>
              <span>Contrôle le filtrage et la densité.</span>
            </div>
            <label className="settings-toggle">
              <span>Afficher les catégories masquées</span>
              <input type="checkbox" checked={ui.showHiddenCategories} onChange={(event) => onChange({ showHiddenCategories: event.target.checked })} />
            </label>
            <label className="settings-toggle">
              <span>Afficher l’aperçu des pages avant lecture</span>
              <input type="checkbox" checked={ui.showPagePreviewBeforeReading} onChange={(event) => onChange({ showPagePreviewBeforeReading: event.target.checked })} />
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
              <span>Choisis une couleur principale et une couleur secondaire plus perso.</span>
            </div>
            <ColorField
              label="Couleur d’accent"
              value={ui.accent || '#8b5cf6'}
              onChange={(accent) => onChange({ accent })}
              helper="Utilisée pour les boutons actifs, la sélection et les focus."
            />
            <ColorField
              label="Couleur de détail"
              value={ui.accentAlt || '#38bdf8'}
              onChange={(accentAlt) => onChange({ accentAlt })}
              helper="Utilisée pour les dégradés secondaires, les glows et certains effets visuels."
            />
            <div className="settings-note">
              Les couleurs sont sauvegardées localement et restaurées au démarrage. En thème Néon, elles pilotent aussi les contours glow.
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

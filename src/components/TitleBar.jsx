import { CloseIcon, MaximizeIcon, MinimizeIcon, PanelCollapseIcon, PanelExpandIcon } from './Icons.jsx';

export default function TitleBar({ sidebarCollapsed = false, onToggleSidebar }) {
  return (
    <header className="titlebar">
      <div className="titlebar-drag-zone">
        <div className="titlebar-brand no-drag">
          <button
            className="window-button titlebar-sidebar-toggle"
            onClick={onToggleSidebar}
            aria-label={sidebarCollapsed ? 'Afficher la barre latérale' : 'Replier la barre latérale'}
            title={sidebarCollapsed ? 'Afficher la barre latérale' : 'Replier la barre latérale'}
          >
            {sidebarCollapsed ? <PanelExpandIcon size={15} /> : <PanelCollapseIcon size={15} />}
          </button>
          <span className="brand-dot" />
          <span>Sawa</span>
        </div>
      </div>
      <div className="titlebar-actions no-drag">
        <button className="window-button" onClick={() => window.mangaAPI.minimizeWindow()} aria-label="Minimiser">
          <MinimizeIcon size={16} />
        </button>
        <button className="window-button" onClick={() => window.mangaAPI.toggleMaximizeWindow()} aria-label="Agrandir">
          <MaximizeIcon size={14} />
        </button>
        <button className="window-button window-button-close" onClick={() => window.mangaAPI.closeWindow()} aria-label="Fermer">
          <CloseIcon size={14} />
        </button>
      </div>
    </header>
  );
}

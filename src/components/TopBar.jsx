import { memo } from 'react';
import { FolderPlusIcon, PanelExpandIcon, PanelCollapseIcon, SearchIcon, SettingsIcon } from './Icons.jsx';

function TopBar({
  sidebarCollapsed,
  onToggleSidebar,
  search,
  onSearchChange,
  sort,
  onSortChange,
  selectedCategory,
  onClearCategory,
  onOpenSettings,
  onAddCategories,
  activeShelf
}) {
  return (
    <div className="topbar-shell">
      <div className="topbar-left">
        <button className="icon-pill topbar-sidebar-toggle" onClick={onToggleSidebar} title={sidebarCollapsed ? 'Déplier la barre latérale' : 'Replier la barre latérale'}>
          {sidebarCollapsed ? <PanelExpandIcon size={16} /> : <PanelCollapseIcon size={16} />}
        </button>
        <div>
          <div className="page-title">{activeShelf === 'favorites' ? 'Favoris' : activeShelf === 'recents' ? 'Récents' : 'Bibliothèque'}</div>
          <div className="page-subtitle">
            {selectedCategory ? (
              <>
                Filtré sur <button className="inline-link" onClick={onClearCategory}>{selectedCategory.name}</button>
              </>
            ) : 'Vue globale de toute la bibliothèque'}
          </div>
        </div>
      </div>

      <div className="topbar-right">
        <div className="search-box">
          <SearchIcon size={16} />
          <input
            placeholder="Rechercher un manga, un auteur, une description…"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>

        <select className="sort-select" value={sort} onChange={(event) => onSortChange(event.target.value)}>
          <option value="title-asc">Titre A → Z</option>
          <option value="title-desc">Titre Z → A</option>
          <option value="recent">Dernière lecture</option>
          <option value="favorites">Favoris d'abord</option>
          <option value="chapters-desc">Plus de chapitres</option>
          <option value="added-recent">Ajout récent</option>
          <option value="added-oldest">Ajout ancien</option>
        </select>

        <button className="icon-pill" onClick={onAddCategories} title="Ajouter des catégories">
          <FolderPlusIcon size={16} />
        </button>
        <button className="icon-pill" onClick={onOpenSettings} title="Paramètres">
          <SettingsIcon size={16} />
        </button>
      </div>
    </div>
  );
}


export default memo(TopBar);

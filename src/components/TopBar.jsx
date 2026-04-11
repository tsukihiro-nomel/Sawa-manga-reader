import { memo } from 'react';
import {
  CheckIcon,
  FolderPlusIcon,
  LayersIcon,
  PanelCollapseIcon,
  PanelExpandIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon
} from './Icons.jsx';

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
  activeScreen,
  selectionMode = false,
  selectedCount = 0,
  onToggleSelectionMode,
  searchChips = [],
  searchHelpOpen = false,
  onToggleSearchHelp,
  onSaveSearch
}) {
  const title = activeScreen === 'favorites'
    ? 'Favoris'
    : activeScreen === 'recents'
      ? 'Recents'
      : activeScreen === 'vault'
        ? 'Coffre'
        : 'Bibliotheque';
  const subtitle = selectedCategory
    ? (
      <>
        Filtre sur <button className="inline-link" onClick={onClearCategory}>{selectedCategory.name}</button>
      </>
    )
    : activeScreen === 'vault'
      ? 'Vue protegee du coffre prive'
      : 'Vue globale de toute la bibliotheque';

  return (
    <div className="topbar-shell">
      <div className="topbar-left">
        <button className="icon-pill topbar-sidebar-toggle" onClick={onToggleSidebar} title={sidebarCollapsed ? 'Deplier la barre laterale' : 'Replier la barre laterale'}>
          {sidebarCollapsed ? <PanelExpandIcon size={16} /> : <PanelCollapseIcon size={16} />}
        </button>
        <div>
          <div className="page-title">{title}</div>
          <div className="page-subtitle">{subtitle}</div>
        </div>
      </div>

      <div className="topbar-right">
        <div className={`search-box ${searchChips.length ? 'search-box-advanced' : ''}`}>
          <div className="search-box-input-row">
            <SearchIcon size={16} />
            <input
              placeholder='Recherche libre ou syntaxe: tag:romance status:unread'
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
            />
            <button type="button" className={`search-help-button ${searchHelpOpen ? 'active' : ''}`} onClick={onToggleSearchHelp} title="Aide recherche avancee">
              ?
            </button>
            {search.trim() ? (
              <button type="button" className="search-save-button" onClick={onSaveSearch} title="Sauver cette requete en smart collection">
                <LayersIcon size={14} />
              </button>
            ) : null}
          </div>

          {searchChips.length ? (
            <div className="search-chip-row">
              {searchChips.map((chip) => (
                <span key={`${chip.kind}-${chip.raw}`} className={`search-chip search-chip-${chip.kind}`}>{chip.label}</span>
              ))}
            </div>
          ) : null}

          {searchHelpOpen ? (
            <div className="search-help-popover">
              <strong>Recherche avancee</strong>
              <span>`tag:romance` `status:unread` `favorite:true` `private:false`</span>
              <span>`author:"Inoue Takehiko"` `collection:seinen`</span>
              <span>`missing:cover` `missing:metadata` `chapters&gt;10` `added&lt;30`</span>
            </div>
          ) : null}
        </div>

        <select className="sort-select" value={sort} onChange={(event) => onSortChange(event.target.value)}>
          <option value="title-asc">Titre A-Z</option>
          <option value="title-desc">Titre Z-A</option>
          <option value="recent">Derniere lecture</option>
          <option value="favorites">Favoris d'abord</option>
          <option value="chapters-desc">Plus de chapitres</option>
          <option value="added-recent">Ajout recent</option>
          <option value="added-oldest">Ajout ancien</option>
        </select>

        {onToggleSelectionMode ? (
          <button className={`ghost-button topbar-select-button ${selectionMode ? 'active' : ''}`} onClick={onToggleSelectionMode} title="Selection multiple">
            {selectionMode ? <CheckIcon size={15} /> : <SparklesIcon size={15} />}
            <span>{selectionMode ? `${selectedCount} selection${selectedCount > 1 ? 's' : ''}` : 'Selection'}</span>
          </button>
        ) : null}

        <button className="icon-pill" onClick={onAddCategories} title="Ajouter des categories">
          <FolderPlusIcon size={16} />
        </button>
        <button className="icon-pill" onClick={onOpenSettings} title="Parametres">
          <SettingsIcon size={16} />
        </button>
      </div>
    </div>
  );
}

export default memo(TopBar);

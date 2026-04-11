import { memo, useMemo, useState } from 'react';
import {
  AlertIcon,
  ArchiveIcon,
  ClockIcon,
  EyeIcon,
  EyeOffIcon,
  FolderPlusIcon,
  HeartIcon,
  HomeIcon,
  LayersIcon,
  LibraryIcon,
  PanelCollapseIcon,
  PanelExpandIcon,
  SettingsIcon,
  SparklesIcon,
  TagIcon,
  TrashIcon
} from './Icons.jsx';

function SidebarNavItem({ label, title, icon, active, compact, onClick, badge = 0 }) {
  return (
    <button
      className={`sidebar-nav-item ${active ? 'sidebar-nav-item-active' : ''} ${compact ? 'sidebar-nav-item-compact' : ''}`}
      onClick={onClick}
      title={title || label}
    >
      {icon}
      {!compact ? <span>{label}</span> : null}
      {!compact && badge > 0 ? <span className="sidebar-badge">{badge}</span> : null}
    </button>
  );
}

function pinIconFor(pin) {
  switch (pin?.type) {
    case 'smart-collection':
      return <SparklesIcon size={16} />;
    case 'collection':
      return <LayersIcon size={16} />;
    case 'tag':
      return <TagIcon size={16} />;
    case 'screen':
      if (pin.refId === 'maintenance') return <AlertIcon size={16} />;
      if (pin.refId === 'workbench') return <SparklesIcon size={16} />;
      if (pin.refId === 'vault') return <ArchiveIcon size={16} />;
      return <LibraryIcon size={16} />;
    default:
      return <LayersIcon size={16} />;
  }
}

function Sidebar({
  collapsed,
  onToggleCollapsed,
  activeScreen,
  onScreenChange,
  categories,
  allCategories,
  selectedCategoryId,
  onSelectCategory,
  onAddCategories,
  onToggleCategoryHidden,
  onRemoveCategory,
  onOpenSettings,
  onContextMenu,
  favoritesCount = 0,
  maintenanceCount = 0,
  workbenchCount = 0,
  vaultCount = 0,
  sidebarPins = [],
  onActivatePin
}) {
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(true);
  const [pinsOpen, setPinsOpen] = useState(true);

  const visibleCats = useMemo(() => (allCategories || categories || []).filter((category) => !category.hidden), [allCategories, categories]);
  const hiddenCats = useMemo(() => (allCategories || []).filter((category) => category.hidden), [allCategories]);

  return (
    <aside className={`sidebar-panel ${collapsed ? 'sidebar-panel-collapsed' : ''}`} onContextMenu={(event) => onContextMenu(event, { type: 'app' })}>
      <div className="sidebar-top">
        <div className="sidebar-header-row">
          <button
            className={`primary-button sidebar-add-button ${collapsed ? 'sidebar-add-button-collapsed' : ''}`}
            onClick={onAddCategories}
            title="Ajouter des categories"
          >
            <FolderPlusIcon size={16} />
            {!collapsed ? <span>Ajouter</span> : null}
          </button>
          <button
            className="icon-pill sidebar-collapse-button"
            onClick={onToggleCollapsed}
            title={collapsed ? 'Deplier' : 'Replier'}
          >
            {collapsed ? <PanelExpandIcon size={16} /> : <PanelCollapseIcon size={16} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          <SidebarNavItem label="Dashboard" icon={<HomeIcon size={18} />} active={activeScreen === 'dashboard'} compact={collapsed} onClick={() => onScreenChange('dashboard')} />
          <SidebarNavItem label="Bibliotheque" icon={<LibraryIcon size={18} />} active={activeScreen === 'library'} compact={collapsed} onClick={() => onScreenChange('library')} />
          <SidebarNavItem label="Collections" icon={<LayersIcon size={18} />} active={activeScreen === 'collections'} compact={collapsed} onClick={() => onScreenChange('collections')} />
          <SidebarNavItem label="Entretien" icon={<AlertIcon size={18} />} active={activeScreen === 'maintenance'} compact={collapsed} onClick={() => onScreenChange('maintenance')} badge={maintenanceCount} />
          <SidebarNavItem label="Atelier" icon={<SparklesIcon size={18} />} active={activeScreen === 'workbench'} compact={collapsed} onClick={() => onScreenChange('workbench')} badge={workbenchCount} />
          <SidebarNavItem label="Coffre" icon={<ArchiveIcon size={18} />} active={activeScreen === 'vault'} compact={collapsed} onClick={() => onScreenChange('vault')} badge={vaultCount} />
          <SidebarNavItem label="Favoris" icon={<HeartIcon size={18} filled={activeScreen === 'favorites'} />} active={activeScreen === 'favorites'} compact={collapsed} onClick={() => onScreenChange('favorites')} badge={favoritesCount} />
          <SidebarNavItem label="Recents" icon={<ClockIcon size={18} />} active={activeScreen === 'recents'} compact={collapsed} onClick={() => onScreenChange('recents')} />
        </nav>
      </div>

      {!collapsed && sidebarPins.length > 0 ? (
        <div className="sidebar-section sidebar-section-pins">
          <button className="sidebar-section-title" onClick={() => setPinsOpen((value) => !value)}>
            Acces rapides
            <span className="sidebar-section-chevron">{pinsOpen ? '?' : '?'}</span>
          </button>
          {pinsOpen ? (
            <div className="sidebar-pin-list">
              {sidebarPins.map((pin) => (
                <button
                  key={pin.id}
                  type="button"
                  className={`sidebar-pin-item ${activeScreen === pin.refId ? 'sidebar-pin-item-active' : ''}`}
                  onClick={() => onActivatePin(pin)}
                  onContextMenu={(event) => onContextMenu(event, { type: 'sidebar-pin', pin })}
                >
                  <span className="sidebar-pin-icon">{pinIconFor(pin)}</span>
                  <span className="sidebar-pin-copy">
                    <strong>{pin.label || pin.refId}</strong>
                    <small>{pin.type === 'screen' ? 'vue epinglee' : 'raccourci perso'}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="sidebar-section">
        {!collapsed ? (
          <button className="sidebar-section-title" onClick={() => setCategoriesOpen((value) => !value)}>
            Categories
            <span className="sidebar-section-chevron">{categoriesOpen ? '?' : '?'}</span>
          </button>
        ) : null}

        {(collapsed || categoriesOpen) ? (
          <>
            <button
              className={`chip-button ${selectedCategoryId === null ? 'chip-button-active' : ''} ${collapsed ? 'chip-button-compact' : ''}`}
              onClick={() => onSelectCategory(null)}
              title="Toutes les categories"
            >
              {collapsed ? 'All' : 'Toutes les categories'}
            </button>

            <div className="category-list">
              {visibleCats.map((category) => (
                <div
                  key={category.id}
                  className={`category-row ${selectedCategoryId === category.id ? 'category-row-active' : ''} ${collapsed ? 'category-row-collapsed' : ''}`}
                  onContextMenu={(event) => onContextMenu(event, { type: 'category', category })}
                >
                  <button className="category-main" onClick={() => onSelectCategory(selectedCategoryId === category.id ? null : category.id)} title={category.name}>
                    <span className="category-name">{collapsed ? category.name.slice(0, 2).toUpperCase() : category.name}</span>
                    {!collapsed ? <span className="category-count">{category.mangaCount ?? 0}</span> : null}
                  </button>
                  {!collapsed ? (
                    <div className="category-actions">
                      <button className="icon-button" title={category.hidden ? 'Afficher' : 'Masquer'} onClick={() => onToggleCategoryHidden(category.id)}>
                        {category.hidden ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
                      </button>
                      <button className="icon-button danger" title="Retirer" onClick={() => onRemoveCategory(category.id)}>
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {!collapsed && hiddenCats.length > 0 ? (
              <div className="hidden-categories-block">
                <button className="hidden-categories-toggle" onClick={() => setHiddenOpen((value) => !value)}>
                  <span>Categories cachees</span>
                  <span className="category-count">{hiddenCats.length}</span>
                </button>
                {hiddenOpen ? (
                  <div className="category-list category-list-hidden">
                    {hiddenCats.map((category) => (
                      <div key={category.id} className="category-row" onContextMenu={(event) => onContextMenu(event, { type: 'category', category })}>
                        <button className="category-main" onClick={() => onToggleCategoryHidden(category.id)} title={category.name}>
                          <span className="category-name">{category.name}</span>
                          <span className="category-count">{category.mangaCount ?? 0}</span>
                        </button>
                        <div className="category-actions">
                          <button className="icon-button" title="Afficher" onClick={() => onToggleCategoryHidden(category.id)}><EyeOffIcon size={15} /></button>
                          <button className="icon-button danger" title="Retirer" onClick={() => onRemoveCategory(category.id)}><TrashIcon size={15} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="sidebar-footer">
        <button className={`ghost-button sidebar-settings-button ${collapsed ? 'sidebar-settings-button-collapsed' : ''}`} onClick={onOpenSettings} title="Parametres">
          <SettingsIcon size={16} />
          {!collapsed ? <span>Parametres</span> : null}
        </button>
      </div>
    </aside>
  );
}

export default memo(Sidebar);

import { memo, useState } from 'react';
import {
  ClockIcon, EyeIcon, EyeOffIcon, FolderPlusIcon, HeartIcon,
  HomeIcon, LayersIcon, LibraryIcon, PanelCollapseIcon,
  PanelExpandIcon, SettingsIcon, TrashIcon
} from './Icons.jsx';

function SidebarNavItem({ label, title, icon, active, compact, onClick, badge }) {
  return (
    <button
      className={`sidebar-nav-item ${active ? 'sidebar-nav-item-active' : ''} ${compact ? 'sidebar-nav-item-compact' : ''}`}
      onClick={onClick}
      title={title || label}
    >
      {icon}
      {!compact && <span>{label}</span>}
      {!compact && badge > 0 && <span className="sidebar-badge">{badge}</span>}
    </button>
  );
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
  showHiddenCategories,
  onContextMenu,
  continueCount = 0,
  favoritesCount = 0
}) {
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(true);
  const visibleCats = (allCategories || categories || []).filter((c) => !c.hidden);
  const hiddenCats = (allCategories || []).filter((c) => c.hidden);

  return (
    <aside
      className={`sidebar-panel ${collapsed ? 'sidebar-panel-collapsed' : ''}`}
      onContextMenu={(e) => onContextMenu(e, { type: 'app' })}
    >
      <div className="sidebar-top">
        <div className="sidebar-header-row">
          <button
            className={`primary-button sidebar-add-button ${collapsed ? 'sidebar-add-button-collapsed' : ''}`}
            onClick={onAddCategories}
            title="Ajouter des catégories"
          >
            <FolderPlusIcon size={16} />
            {!collapsed && <span>Ajouter</span>}
          </button>
          <button
            className="icon-pill sidebar-collapse-button"
            onClick={onToggleCollapsed}
            title={collapsed ? 'Déplier' : 'Replier'}
          >
            {collapsed ? <PanelExpandIcon size={16} /> : <PanelCollapseIcon size={16} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          <SidebarNavItem label="Dashboard" icon={<HomeIcon size={18} />} active={activeScreen === 'dashboard'} compact={collapsed} onClick={() => onScreenChange('dashboard')} />
          <SidebarNavItem label="Bibliothèque" icon={<LibraryIcon size={18} />} active={activeScreen === 'library'} compact={collapsed} onClick={() => onScreenChange('library')} />
          <SidebarNavItem label="Collections" icon={<LayersIcon size={18} />} active={activeScreen === 'collections'} compact={collapsed} onClick={() => onScreenChange('collections')} />
          <SidebarNavItem label="Favoris" icon={<HeartIcon size={18} filled={activeScreen === 'favorites'} />} active={activeScreen === 'favorites'} compact={collapsed} onClick={() => onScreenChange('favorites')} badge={favoritesCount} />
          <SidebarNavItem label="Récents" icon={<ClockIcon size={18} />} active={activeScreen === 'recents'} compact={collapsed} onClick={() => onScreenChange('recents')} />
        </nav>
      </div>

      <div className="sidebar-section">
        {!collapsed && (
          <button className="sidebar-section-title" onClick={() => setCategoriesOpen((v) => !v)}>
            Catégories
            <span className="sidebar-section-chevron">{categoriesOpen ? '▾' : '▸'}</span>
          </button>
        )}

        {(collapsed || categoriesOpen) && (
          <>
            <button
              className={`chip-button ${selectedCategoryId === null ? 'chip-button-active' : ''} ${collapsed ? 'chip-button-compact' : ''}`}
              onClick={() => onSelectCategory(null)}
              title="Toutes les catégories"
            >
              {collapsed ? 'All' : 'Toutes les catégories'}
            </button>

            <div className="category-list">
              {visibleCats.map((cat) => (
                <div
                  key={cat.id}
                  className={`category-row ${selectedCategoryId === cat.id ? 'category-row-active' : ''} ${collapsed ? 'category-row-collapsed' : ''}`}
                  onContextMenu={(e) => onContextMenu(e, { type: 'category', category: cat })}
                >
                  <button
                    className="category-main"
                    onClick={() => onSelectCategory(selectedCategoryId === cat.id ? null : cat.id)}
                    title={cat.name}
                  >
                    <span className="category-name">{collapsed ? cat.name.slice(0, 2).toUpperCase() : cat.name}</span>
                    {!collapsed && <span className="category-count">{cat.mangaCount ?? 0}</span>}
                  </button>
                  {!collapsed && (
                    <div className="category-actions">
                      <button className="icon-button" title={cat.hidden ? 'Afficher' : 'Masquer'} onClick={() => onToggleCategoryHidden(cat.id)}>
                        {cat.hidden ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
                      </button>
                      <button className="icon-button danger" title="Retirer" onClick={() => onRemoveCategory(cat.id)}>
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {!collapsed && hiddenCats.length > 0 && (
              <div className="hidden-categories-block">
                <button className="hidden-categories-toggle" onClick={() => setHiddenOpen((v) => !v)}>
                  <span>Catégories cachées</span>
                  <span className="category-count">{hiddenCats.length}</span>
                </button>
                {hiddenOpen && (
                  <div className="category-list category-list-hidden">
                    {hiddenCats.map((cat) => (
                      <div key={cat.id} className="category-row" onContextMenu={(e) => onContextMenu(e, { type: 'category', category: cat })}>
                        <button className="category-main" onClick={() => onToggleCategoryHidden(cat.id)} title={cat.name}>
                          <span className="category-name">{cat.name}</span>
                          <span className="category-count">{cat.mangaCount ?? 0}</span>
                        </button>
                        <div className="category-actions">
                          <button className="icon-button" title="Afficher" onClick={() => onToggleCategoryHidden(cat.id)}><EyeOffIcon size={15} /></button>
                          <button className="icon-button danger" title="Retirer" onClick={() => onRemoveCategory(cat.id)}><TrashIcon size={15} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="sidebar-footer">
        <button className={`ghost-button sidebar-settings-button ${collapsed ? 'sidebar-settings-button-collapsed' : ''}`} onClick={onOpenSettings} title="Paramètres">
          <SettingsIcon size={16} />
          {!collapsed && <span>Paramètres</span>}
        </button>
      </div>
    </aside>
  );
}

export default memo(Sidebar);

import SourcesExplorer from './SourcesExplorer.jsx';
import SourcesAddonManager from './SourcesAddonManager.jsx';
import { SearchIcon, RefreshIcon } from './Icons.jsx';

export default function SourcesView({
  plugin,
  section = 'explorer',
  categories = [],
  defaultCategoryId = '',
  context = null,
  recentSeries = [],
  linkedSeries = [],
  initialScrollTop = 0,
  onSectionChange,
  onImported,
  onScrollPositionChange
}) {
  return (
    <section
      className="sources-view"
      onScroll={(event) => onScrollPositionChange?.(event.currentTarget.scrollTop)}
      ref={(node) => {
        if (node && typeof initialScrollTop === 'number') {
          node.scrollTop = initialScrollTop;
        }
      }}
    >
      <div className="sources-view-topbar">
        <div className="sources-view-topbar-copy">
          <span className="sources-view-kicker">Sources communautaires</span>
          <h1>Sources web</h1>
          <p>Recherche, reprise et import dans la bibliotheque locale.</p>
        </div>

        <div className="sources-view-topbar-actions">
          <button
            type="button"
            className={`ghost-button ${section === 'explorer' ? 'active' : ''}`}
            onClick={() => onSectionChange?.('explorer')}
          >
            <SearchIcon size={16} /> Explorer
          </button>
          <button
            type="button"
            className={`ghost-button ${section === 'catalogue' ? 'active' : ''}`}
            onClick={() => onSectionChange?.('catalogue')}
          >
            <RefreshIcon size={16} /> Depots et extensions
          </button>
        </div>
      </div>

      <div className="sources-view-panel">
        {section === 'catalogue' ? (
          <SourcesAddonManager plugin={plugin} onOpenSources={() => onSectionChange?.('explorer')} />
        ) : (
          <SourcesExplorer
            categories={categories}
            defaultCategoryId={defaultCategoryId}
            initialContext={context}
            initialRecentSeries={recentSeries}
            initialLinkedSeries={linkedSeries}
            onImported={onImported}
          />
        )}
      </div>
    </section>
  );
}

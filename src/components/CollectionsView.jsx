import { memo, useMemo, useState } from 'react';
import { resolveSmartCollection } from '../utils/reader.js';
import MangaCard from './MangaCard.jsx';
import {
  BookIcon, ChevronLeftIcon, ClockIcon, EditIcon, HeartIcon, ImageIcon, LayersIcon,
  PlayIcon, PlusIcon, SparklesIcon, TagIcon, TrashIcon, ZapIcon
} from './Icons.jsx';

const SMART_COLLECTIONS = [
  { id: 'smart-continue', label: 'Continuer la lecture', icon: PlayIcon, description: 'Mangas en cours, triés par dernière lecture.' },
  { id: 'smart-unread', label: 'Non lus', icon: ZapIcon, description: 'Mangas jamais ouverts.' },
  { id: 'smart-in-progress', label: 'En cours', icon: ClockIcon, description: 'Mangas commencés mais pas terminés.' },
  { id: 'smart-completed', label: 'Terminés', icon: BookIcon, description: 'Tous les chapitres sont lus.' },
  { id: 'smart-favorites', label: 'Favoris', icon: HeartIcon, description: 'Tes mangas marqués comme favoris.' },
  { id: 'smart-recent-added', label: 'Ajoutés récemment', icon: PlusIcon, description: 'Ajoutés ces 30 derniers jours.' },
  { id: 'smart-recent-read', label: 'Lus récemment', icon: ClockIcon, description: 'Lus ces 14 derniers jours.' },
  { id: 'smart-new-chapters', label: 'Nouveaux chapitres', icon: SparklesIcon, description: 'Chapitres détectés depuis le dernier scan.' },
  { id: 'smart-no-cover', label: 'Sans couverture', icon: ImageIcon, description: 'Mangas sans couverture personnalisée.' },
  { id: 'smart-no-metadata', label: 'Sans métadonnées', icon: TagIcon, description: 'Mangas sans auteur ni description.' }
];

// ── Create/Edit Collection Modal ──
function CollectionFormModal({ onClose, onSubmit, initial }) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), description: description.trim() });
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h3>{initial ? 'Modifier la collection' : 'Nouvelle collection'}</h3>
        <form onSubmit={handleSubmit}>
          <label>
            Nom de la collection
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Shonen préférés" autoFocus />
          </label>
          <label>
            Description (optionnel)
            <textarea rows="3" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Une courte description…" />
          </label>
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>Annuler</button>
            <button type="submit" className="primary-button" disabled={!name.trim()}>
              {initial ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Collection Detail View (shows manga cards in a grid) ──
function CollectionDetailView({ collection, mangas, onBack, onOpenManga, onToggleFavorite, onRemoveManga, onEditCollection, onDeleteCollection, onContextMenu }) {
  return (
    <div className="collection-detail">
      <div className="collection-detail-header">
        <button className="ghost-button" onClick={onBack}>
          <ChevronLeftIcon size={16} /> Retour
        </button>
        {!collection.isSmart && (
          <div className="collection-detail-actions">
            <button className="ghost-button" onClick={onEditCollection} title="Modifier">
              <EditIcon size={16} />
            </button>
            <button className="ghost-button" onClick={onDeleteCollection} title="Supprimer la collection">
              <TrashIcon size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="collection-detail-info">
        <h2>{collection.name}</h2>
        {collection.description && <p className="muted-text">{collection.description}</p>}
        <span className="collection-detail-count">{mangas.length} manga{mangas.length > 1 ? 's' : ''}</span>
      </div>

      {mangas.length === 0 ? (
        <div className="empty-card">
          <h3>Collection vide</h3>
          <p>Ajoute des mangas depuis le menu contextuel (clic droit sur un manga).</p>
        </div>
      ) : (
        <div className="collection-manga-grid">
          {mangas.map((manga) => (
            <MangaCard
              key={manga.id}
              manga={manga}
              onOpen={onOpenManga}
              onToggleFavorite={onToggleFavorite}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── MDList-style Collection Card ──
function MDListCard({ collection, mangas, onOpen, onContextMenu }) {
  return (
    <div
      className="mdlist-card"
      onClick={() => onOpen(collection.id)}
      onContextMenu={(e) => onContextMenu?.(e, { type: 'collection', collection })}
    >
      <div className="mdlist-card-header">
        <div className="mdlist-card-title">
          <h3>{collection.name}</h3>
          <span className="muted-text">{mangas.length} manga{mangas.length > 1 ? 's' : ''}</span>
        </div>
      </div>
      {collection.description && <p className="mdlist-card-desc muted-text">{collection.description}</p>}
      {mangas.length > 0 && (
        <div className="mdlist-card-covers">
          {mangas.slice(0, 8).map((m) => (
            <div key={m.id} className="mdlist-cover-thumb">
              {m.coverSrc
                ? <img src={m.coverSrc} alt={m.displayTitle} loading="lazy" />
                : <div className="cover-fallback cover-fallback-sm">{(m.displayTitle || '?')[0]}</div>
              }
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main CollectionsView ──
function CollectionsView({
  allMangas = [],
  persisted = {},
  onOpenManga,
  onToggleFavorite,
  onCreateCollection,
  onDeleteCollection,
  onUpdateCollection,
  onRemoveMangaFromCollection,
  onContextMenu
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [activeCollectionId, setActiveCollectionId] = useState(null);
  const [editingCollection, setEditingCollection] = useState(null);
  const [activeTab, setActiveTab] = useState('manual'); // 'manual' | 'smart'

  const manualCollections = useMemo(() => {
    const cols = persisted?.collections ?? {};
    return Object.values(cols).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [persisted?.collections]);

  const mangaById = useMemo(() => {
    const map = {};
    for (const m of allMangas) map[m.id] = m;
    return map;
  }, [allMangas]);

  const smartCounts = useMemo(() => {
    const counts = {};
    for (const sc of SMART_COLLECTIONS) {
      counts[sc.id] = resolveSmartCollection(allMangas, sc.id, persisted).length;
    }
    return counts;
  }, [allMangas, persisted]);

  // Active collection detail view
  const activeCollection = useMemo(() => {
    if (!activeCollectionId) return null;
    const smart = SMART_COLLECTIONS.find((sc) => sc.id === activeCollectionId);
    if (smart) {
      const mangas = resolveSmartCollection(allMangas, smart.id, persisted);
      return { collection: { id: smart.id, name: smart.label, description: smart.description, isSmart: true }, mangas };
    }
    const cols = persisted?.collections ?? {};
    const col = cols[activeCollectionId];
    if (!col) return null;
    const mangaIds = col.mangaIds || [];
    const mangas = mangaIds.map((id) => mangaById[id]).filter(Boolean);
    return { collection: col, mangas };
  }, [activeCollectionId, persisted, allMangas, mangaById]);

  // Detail view
  if (activeCollection) {
    return (
      <section className="collections-view">
        <CollectionDetailView
          collection={activeCollection.collection}
          mangas={activeCollection.mangas}
          onBack={() => setActiveCollectionId(null)}
          onOpenManga={onOpenManga}
          onToggleFavorite={onToggleFavorite}
          onRemoveManga={(mangaId) => {
            if (activeCollection.collection.isSmart) return;
            onRemoveMangaFromCollection?.(activeCollection.collection.id, mangaId);
          }}
          onEditCollection={() => {
            if (activeCollection.collection.isSmart) return;
            setEditingCollection(activeCollection.collection);
          }}
          onDeleteCollection={() => {
            if (activeCollection.collection.isSmart) return;
            onDeleteCollection?.(activeCollection.collection.id);
            setActiveCollectionId(null);
          }}
          onContextMenu={onContextMenu}
        />
        {editingCollection && (
          <CollectionFormModal
            initial={editingCollection}
            onClose={() => setEditingCollection(null)}
            onSubmit={(data) => {
              onUpdateCollection?.(editingCollection.id, data);
              setEditingCollection(null);
            }}
          />
        )}
      </section>
    );
  }

  // Main list view
  return (
    <section className="collections-view">
      <div className="collections-top-bar">
        <h2>Mes Collections</h2>
        <button className="primary-button" onClick={() => setShowCreate(true)}>
          <PlusIcon size={16} /> Nouvelle collection
        </button>
      </div>

      <div className="collections-tabs">
        <button
          className={`collections-tab ${activeTab === 'manual' ? 'collections-tab-active' : ''}`}
          onClick={() => setActiveTab('manual')}
        >
          Mes collections
        </button>
        <button
          className={`collections-tab ${activeTab === 'smart' ? 'collections-tab-active' : ''}`}
          onClick={() => setActiveTab('smart')}
        >
          Collections intelligentes
        </button>
      </div>

      {activeTab === 'manual' && (
        <>
          <button className="mdlist-new-btn" onClick={() => setShowCreate(true)}>
            <PlusIcon size={18} /> Nouvelle collection
          </button>

          {manualCollections.length === 0 ? (
            <div className="empty-card">
              <h3>Aucune collection</h3>
              <p>Crée des collections pour organiser tes mangas. Clique sur le bouton ci-dessus ou utilise le menu contextuel (clic droit) sur un manga.</p>
            </div>
          ) : (
            <div className="mdlist-list">
              {manualCollections.map((col) => {
                const mangaIds = col.mangaIds || [];
                const mangas = mangaIds.map((id) => mangaById[id]).filter(Boolean);
                return (
                  <MDListCard
                    key={col.id}
                    collection={col}
                    mangas={mangas}
                    onOpen={setActiveCollectionId}
                    onContextMenu={onContextMenu}
                  />
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === 'smart' && (
        <div className="mdlist-list">
          {SMART_COLLECTIONS.map((sc) => {
            const Icon = sc.icon;
            const count = smartCounts[sc.id] ?? 0;
            return (
              <button
                key={sc.id}
                className="smart-collection-row"
                onClick={() => setActiveCollectionId(sc.id)}
              >
                <span className="smart-collection-icon"><Icon size={18} /></span>
                <div className="smart-collection-copy">
                  <strong>{sc.label}</strong>
                  <small>{sc.description}</small>
                </div>
                <span className="smart-collection-count">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CollectionFormModal
          onClose={() => setShowCreate(false)}
          onSubmit={async (data) => {
            await onCreateCollection(data.name, data.description);
            setShowCreate(false);
          }}
        />
      )}
    </section>
  );
}

export default memo(CollectionsView);

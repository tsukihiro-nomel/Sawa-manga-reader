import { memo, useMemo, useState } from 'react';
import { resolveSmartCollection } from '../utils/reader.js';
import {
  BookIcon, ClockIcon, HeartIcon, ImageIcon, LayersIcon,
  PlayIcon, PlusIcon, SparklesIcon, TagIcon, ZapIcon
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

function CreateCollectionModal({ onClose, onCreateCollection }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await onCreateCollection(name.trim(), description.trim());
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h3>Créer une collection</h3>
        <form onSubmit={handleSubmit}>
          <label>
            Nom de la collection
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Shonen préférés"
              autoFocus
            />
          </label>
          <label>
            Description (optionnel)
            <textarea
              rows="3"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Une courte description…"
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>Annuler</button>
            <button type="submit" className="primary-button" disabled={!name.trim()}>Créer</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CollectionsView({ allMangas = [], persisted = {}, onOpenManga, onCreateCollection, onContextMenu }) {
  const [showCreate, setShowCreate] = useState(false);

  const manualCollections = useMemo(() => {
    const cols = persisted?.collections ?? {};
    return Object.values(cols).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [persisted?.collections]);

  const smartCounts = useMemo(() => {
    const counts = {};
    for (const sc of SMART_COLLECTIONS) {
      counts[sc.id] = resolveSmartCollection(allMangas, sc.id, persisted).length;
    }
    return counts;
  }, [allMangas, persisted]);

  const mangaById = useMemo(() => {
    const map = {};
    for (const m of allMangas) map[m.id] = m;
    return map;
  }, [allMangas]);

  return (
    <section className="collections-view">
      <div className="section-header">
        <h2>Collections</h2>
        <button className="primary-button" onClick={() => setShowCreate(true)}>
          <PlusIcon size={16} /> Nouvelle collection
        </button>
      </div>

      {manualCollections.length > 0 && (
        <div className="collections-section">
          <div className="section-header">
            <h3><LayersIcon size={18} /> Collections manuelles</h3>
          </div>
          <div className="collections-grid">
            {manualCollections.map((col) => {
              const mangaIds = col.mangaIds || [];
              const covers = mangaIds.slice(0, 4).map((id) => mangaById[id]).filter(Boolean);
              return (
                <div key={col.id} className="collection-card" onClick={() => covers[0] && onOpenManga(covers[0].id)}>
                  <div className="collection-card-header">
                    <span className="collection-card-icon collection-card-icon-manual">
                      <LayersIcon size={20} />
                    </span>
                    <div>
                      <h4>{col.name}</h4>
                      <span className="collection-card-count">{mangaIds.length} manga{mangaIds.length > 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  {col.description && <p>{col.description}</p>}
                  {covers.length > 0 && (
                    <div className="collection-card-covers">
                      {covers.map((m) => (
                        m.coverSrc
                          ? <img key={m.id} src={m.coverSrc} alt={m.displayTitle} loading="lazy" />
                          : <div key={m.id} className="cover-fallback">{(m.displayTitle || '?')[0]}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="collections-section">
        <div className="section-header">
          <h3><SparklesIcon size={18} /> Collections intelligentes</h3>
        </div>
        <div className="smart-collection-grid">
          {SMART_COLLECTIONS.map((sc) => {
            const Icon = sc.icon;
            const count = smartCounts[sc.id] ?? 0;
            return (
              <button
                key={sc.id}
                className="smart-collection-card"
                onClick={() => {
                  const mangas = resolveSmartCollection(allMangas, sc.id, persisted);
                  if (mangas[0]) onOpenManga(mangas[0].id);
                }}
              >
                <span className="smart-collection-icon"><Icon size={18} /></span>
                <div className="smart-collection-copy">
                  <strong>{sc.label}</strong>
                  <small>{count} manga{count > 1 ? 's' : ''} · {sc.description}</small>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {manualCollections.length === 0 && (
        <div className="empty-card">
          <h3>Aucune collection manuelle</h3>
          <p>Crée des collections pour organiser tes mangas sans déplacer les fichiers.</p>
          <div className="detail-actions-row" style={{ marginTop: 16 }}>
            <button className="primary-button" onClick={() => setShowCreate(true)}>
              <PlusIcon size={16} /> Créer une collection
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateCollectionModal
          onClose={() => setShowCreate(false)}
          onCreateCollection={onCreateCollection}
        />
      )}
    </section>
  );
}

export default memo(CollectionsView);

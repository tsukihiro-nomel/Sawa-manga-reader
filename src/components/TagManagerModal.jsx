import { useState, useMemo, memo } from 'react';
import { CheckIcon, CloseIcon, PlusIcon, SearchIcon, TrashIcon, TagIcon } from './Icons.jsx';

const DEFAULT_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
  '#6366f1', '#f43f5e', '#0ea5e9', '#84cc16',
];

function TagManagerModal({ manga, allTags, onToggleTag, onCreateTag, onDeleteTag, onClose }) {
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(DEFAULT_COLORS[0]);
  const [showCreate, setShowCreate] = useState(false);
  const [tagSearch, setTagSearch] = useState('');

  const assignedTagIds = new Set((manga?.tags || []).map(t => t.id));
  const tagList = useMemo(() => Object.values(allTags || {}), [allTags]);
  const filteredTags = useMemo(() => {
    const query = tagSearch.trim().toLowerCase();
    if (!query) return tagList;
    return tagList.filter((tag) => (tag?.name || '').toLowerCase().includes(query));
  }, [tagList, tagSearch]);

  const handleCreateTag = () => {
    const trimmed = newTagName.trim();
    if (!trimmed) return;
    onCreateTag(trimmed, newTagColor);
    setNewTagName('');
    setNewTagColor(DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)]);
    setShowCreate(false);
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel tag-modal">
        {/* Header */}
        <div className="tag-modal-header">
          <div className="tag-modal-title">
            <div className="tag-modal-icon"><TagIcon size={20} /></div>
            <div>
              <h3>Tags</h3>
              <p className="muted-text">{manga?.displayTitle}</p>
            </div>
          </div>
          <button className="mc-fav" onClick={onClose} style={{ position: 'static' }}>
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Tag grid */}
        <div className="tag-modal-section tag-modal-section-flex">
          <span className="tag-modal-label">
            {tagList.length > 0 ? 'Clique pour activer/désactiver' : 'Aucun tag créé'}
          </span>
          {tagList.length > 0 && (
            <div className="modal-search-row">
              <SearchIcon size={15} />
              <input
                className="modal-search-input"
                type="text"
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                placeholder="Rechercher un tag"
              />
            </div>
          )}
          <div className="tag-modal-grid-scroll">
            <div className="tag-modal-grid">
              {filteredTags.length > 0 ? filteredTags.map(tag => {
                const isSelected = assignedTagIds.has(tag.id);
                return (
                  <button
                    key={tag.id}
                    className={`tag-chip ${isSelected ? 'tag-chip-active' : ''}`}
                    style={{ '--tc': tag.color }}
                    onClick={() => onToggleTag(manga.id, tag.id)}
                  >
                    {isSelected && <CheckIcon size={12} />}
                    <span>{tag.name}</span>
                    <button
                      className="tag-chip-delete"
                      onClick={(e) => { e.stopPropagation(); onDeleteTag(tag.id); }}
                      title="Supprimer"
                    >
                      <TrashIcon size={11} />
                    </button>
                  </button>
                );
              }) : (
                <p className="muted-text modal-empty-state">Aucun tag ne correspond à la recherche.</p>
              )}
            </div>
          </div>
        </div>

        {/* Create new tag */}
        <div className="tag-modal-section">
          {!showCreate ? (
            <button className="tag-create-trigger" onClick={() => setShowCreate(true)}>
              <PlusIcon size={16} /> Créer un nouveau tag
            </button>
          ) : (
            <div className="tag-create-form">
              <span className="tag-modal-label">Nouveau tag</span>
              <div className="tag-create-row">
                <input
                  className="tag-create-input"
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                  placeholder="Nom du tag"
                  autoFocus
                />
                <div className="tag-color-picker">
                  {DEFAULT_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`tag-color-dot ${newTagColor === c ? 'tag-color-dot-active' : ''}`}
                      style={{ background: c }}
                      onClick={() => setNewTagColor(c)}
                    />
                  ))}
                </div>
              </div>
              <div className="tag-create-actions">
                <button className="ghost-button" onClick={() => setShowCreate(false)}>Annuler</button>
                <button className="primary-button" onClick={handleCreateTag} disabled={!newTagName.trim()}>
                  <PlusIcon size={14} /> Créer
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-actions">
          <button className="primary-button" onClick={onClose} style={{ width: '100%' }}>
            Terminé
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(TagManagerModal);

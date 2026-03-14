import { useState, memo } from 'react';
import { CheckIcon, CloseIcon, PlusIcon, TrashIcon, TagIcon } from './Icons.jsx';

const DEFAULT_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
  '#6366f1', '#f43f5e', '#0ea5e9', '#84cc16',
];

function TagManagerModal({ manga, allTags, onToggleTag, onCreateTag, onDeleteTag, onClose }) {
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(DEFAULT_COLORS[0]);
  const [showCreate, setShowCreate] = useState(false);

  const assignedTagIds = new Set((manga?.tags || []).map(t => t.id));
  const tagList = Object.values(allTags || {});

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
        <div className="tag-modal-section">
          <span className="tag-modal-label">
            {tagList.length > 0 ? 'Clique pour activer/désactiver' : 'Aucun tag créé'}
          </span>
          <div className="tag-modal-grid">
            {tagList.map(tag => {
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
            })}
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

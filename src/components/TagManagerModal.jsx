import React, { useState, memo } from 'react';
import { CheckIcon, CloseIcon, PlusIcon, TrashIcon, TagIcon } from './Icons.jsx';

const DEFAULT_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
];

function TagManagerModal({ manga, allTags, onToggleTag, onCreateTag, onDeleteTag, onClose }) {
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(DEFAULT_COLORS[0]);

  const assignedTagIds = new Set((manga?.tags || []).map(t => t.id));

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleCreateTag = () => {
    const trimmed = newTagName.trim();
    if (!trimmed) return;
    onCreateTag(trimmed, newTagColor);
    setNewTagName('');
    setNewTagColor(DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)]);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleCreateTag();
    }
  };

  const tagList = Object.values(allTags || {});

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-panel">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: '1.1rem' }}>
            <TagIcon size={20} />
            Gérer les tags
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 4 }}
            title="Fermer"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        <div className="tag-manager-grid">
          {tagList.length === 0 && (
            <p style={{ color: 'var(--text-secondary, #888)', fontStyle: 'italic', gridColumn: '1 / -1' }}>
              Aucun tag créé
            </p>
          )}
          {tagList.map(tag => {
            const isSelected = assignedTagIds.has(tag.id);
            return (
              <div
                key={tag.id}
                className={`tag-manager-pill manga-tag-pill${isSelected ? ' tag-manager-pill-selected' : ''}`}
                style={{ backgroundColor: tag.color, cursor: 'pointer', position: 'relative' }}
                onClick={() => onToggleTag(manga.id, tag.id)}
                title={isSelected ? `Retirer "${tag.name}"` : `Ajouter "${tag.name}"`}
              >
                {isSelected && <CheckIcon size={14} />}
                <span>{tag.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteTag(tag.id);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'inherit',
                    padding: 2,
                    marginLeft: 4,
                    display: 'flex',
                    alignItems: 'center',
                    opacity: 0.7,
                  }}
                  title={`Supprimer "${tag.name}"`}
                >
                  <TrashIcon size={13} />
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 20 }}>
          <label style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 8, display: 'block' }}>
            Créer un tag
          </label>
          <div className="tag-create-row">
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nom du tag"
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid var(--border-color, #333)',
                background: 'var(--input-bg, #1a1a2e)',
                color: 'inherit',
                fontSize: '0.9rem',
              }}
            />
            <input
              type="color"
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value)}
              title="Couleur du tag"
              style={{
                width: 36,
                height: 36,
                padding: 2,
                border: '1px solid var(--border-color, #333)',
                borderRadius: 6,
                cursor: 'pointer',
                background: 'none',
              }}
            />
            <button
              onClick={handleCreateTag}
              disabled={!newTagName.trim()}
              title="Ajouter le tag"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 12px',
                borderRadius: 6,
                border: 'none',
                background: newTagName.trim() ? 'var(--accent-color, #3b82f6)' : 'var(--border-color, #333)',
                color: 'white',
                cursor: newTagName.trim() ? 'pointer' : 'not-allowed',
                fontSize: '0.9rem',
                fontWeight: 500,
              }}
            >
              <PlusIcon size={16} />
              Ajouter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(TagManagerModal);

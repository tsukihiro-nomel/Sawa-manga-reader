import { useEffect, useState } from 'react';
import { Check, Plus, Search, Trash2, X } from 'lucide-react';
import { runOptimisticAction } from './kavitaState.js';

const TAG_COLORS = ['#ef6262', '#ef9a43', '#d8bd42', '#45b979', '#4f93df', '#9271df', '#d15d9b', '#3db9b0'];

function MetadataEditor({ manga, onSave }) {
  const [form, setForm] = useState({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setForm({
      title: manga.displayTitle || '',
      author: manga.author || '',
      description: manga.description || '',
      volume: manga.volume || '',
      number: manga.number || '',
      year: manga.year || ''
    });
  }, [manga]);

  const fields = [
    ['title', 'Titre'],
    ['author', 'Auteur'],
    ['volume', 'Volume'],
    ['number', 'Numero'],
    ['year', 'Annee']
  ];

  return (
    <form className="kv-editor-form" onSubmit={async (event) => {
      event.preventDefault();
      setPending(true);
      setError('');
      try {
        await onSave?.(manga.id, form);
      } catch (saveError) {
        setError(saveError?.message || 'Impossible d enregistrer les metadata.');
      } finally {
        setPending(false);
      }
    }}>
      <div className="kv-editor-grid">
        {fields.map(([key, label]) => (
          <label key={key}><span>{label}</span><input value={form[key] || ''} onChange={(event) => setForm((value) => ({ ...value, [key]: event.target.value }))} /></label>
        ))}
      </div>
      <label><span>Description</span><textarea rows="7" value={form.description || ''} onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))} /></label>
      {error ? <p className="kv-editor-error" role="alert">{error}</p> : null}
      <button type="submit" className="kv-primary-action" disabled={pending}>{pending ? 'Enregistrement...' : 'Enregistrer'}</button>
    </form>
  );
}

function TagEditor({ manga, tags, onToggleTag, onCreateTag, onDeleteTag }) {
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState(TAG_COLORS[0]);
  const [assigned, setAssigned] = useState(() => new Set((manga.tags || []).map((tag) => String(tag.id))));
  const [pending, setPending] = useState(() => new Set());
  const [error, setError] = useState('');
  const filtered = tags.filter((tag) => tag.name?.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    setAssigned(new Set((manga.tags || []).map((tag) => String(tag.id))));
  }, [manga.id, manga.tags]);

  const toggleTag = async (tag) => {
    const tagId = String(tag.id);
    if (pending.has(tagId)) return;
    const previous = new Set(assigned);
    const next = new Set(previous);
    if (next.has(tagId)) next.delete(tagId);
    else next.add(tagId);
    setPending((value) => new Set(value).add(tagId));
    setError('');
    try {
      await runOptimisticAction({
        apply: () => setAssigned(next),
        rollback: () => setAssigned(previous),
        action: () => onToggleTag?.(manga.id, tag.id)
      });
    } catch (toggleError) {
      setError(toggleError?.message || 'Impossible de modifier ce tag.');
    } finally {
      setPending((value) => {
        const updated = new Set(value);
        updated.delete(tagId);
        return updated;
      });
    }
  };

  return (
    <div className="kv-editor-form">
      <label className="kv-editor-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un tag" /></label>
      {error ? <p className="kv-editor-error" role="alert">{error}</p> : null}
      <div className="kv-editor-tag-list">
        {filtered.map((tag) => {
          const tagId = String(tag.id);
          const active = assigned.has(tagId);
          const isPending = pending.has(tagId);
          return (
          <div key={tag.id} className={isPending ? 'is-pending' : ''} style={{ '--tag-color': tag.color || '#45c99a' }}>
            <button type="button" className={active ? 'is-active' : ''} disabled={isPending} aria-busy={isPending} onClick={() => toggleTag(tag)}>
              {active ? <Check size={14} /> : null}<span>{tag.name}</span>
            </button>
            <button type="button" title="Supprimer le tag" disabled={isPending} onClick={async () => {
              setPending((value) => new Set(value).add(tagId));
              setError('');
              try {
                await onDeleteTag?.(tag.id);
              } catch (deleteError) {
                setError(deleteError?.message || 'Impossible de supprimer ce tag.');
              } finally {
                setPending((value) => {
                  const updated = new Set(value);
                  updated.delete(tagId);
                  return updated;
                });
              }
            }}><Trash2 size={14} /></button>
          </div>
          );
        })}
      </div>
      <div className="kv-editor-create-row">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nouveau tag" />
        <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        <button type="button" onClick={async () => {
          const trimmed = name.trim();
          if (!trimmed) return;
          setError('');
          try {
            await onCreateTag?.(trimmed, color);
            setName('');
          } catch (createError) {
            setError(createError?.message || 'Impossible de creer ce tag.');
          }
        }}><Plus size={16} /> Ajouter</button>
      </div>
    </div>
  );
}

function CollectionEditor({ manga, collections, onToggleCollection, onCreateCollection }) {
  const [name, setName] = useState('');
  const [assigned, setAssigned] = useState(() => new Set((manga.collectionIds || []).map(String)));
  const [pending, setPending] = useState(() => new Set());
  const [error, setError] = useState('');

  useEffect(() => {
    setAssigned(new Set((manga.collectionIds || []).map(String)));
  }, [manga.id, manga.collectionIds]);

  const toggleCollection = async (collection) => {
    const collectionId = String(collection.id);
    if (pending.has(collectionId)) return;
    const previous = new Set(assigned);
    const next = new Set(previous);
    const active = next.has(collectionId);
    if (active) next.delete(collectionId);
    else next.add(collectionId);
    setPending((value) => new Set(value).add(collectionId));
    setError('');
    try {
      await runOptimisticAction({
        apply: () => setAssigned(next),
        rollback: () => setAssigned(previous),
        action: () => onToggleCollection?.(collection, active)
      });
    } catch (toggleError) {
      setError(toggleError?.message || 'Impossible de modifier cette collection.');
    } finally {
      setPending((value) => {
        const updated = new Set(value);
        updated.delete(collectionId);
        return updated;
      });
    }
  };

  return (
    <div className="kv-editor-form">
      {error ? <p className="kv-editor-error" role="alert">{error}</p> : null}
      <div className="kv-editor-collection-list">
        {collections.map((collection) => {
          const collectionId = String(collection.id);
          const active = assigned.has(collectionId);
          const isPending = pending.has(collectionId);
          return (
            <button key={collection.id} type="button" className={`${active ? 'is-active' : ''} ${isPending ? 'is-pending' : ''}`} disabled={isPending} aria-busy={isPending} onClick={() => toggleCollection(collection)}>
              <span>{collection.name}</span><small>{collection.mangaIds?.length || 0} manga(s)</small>{active ? <Check size={15} /> : null}
            </button>
          );
        })}
      </div>
      <div className="kv-editor-create-row">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nouvelle collection" />
        <button type="button" onClick={async () => {
          const trimmed = name.trim();
          if (!trimmed) return;
          setError('');
          try {
            await onCreateCollection?.(trimmed, '');
            setName('');
          } catch (createError) {
            setError(createError?.message || 'Impossible de creer cette collection.');
          }
        }}><Plus size={16} /> Creer</button>
      </div>
    </div>
  );
}

export default function KavitaEditorDialog({
  editor,
  manga,
  tags = [],
  collections = [],
  onClose,
  onSaveMetadata,
  onToggleTag,
  onCreateTag,
  onDeleteTag,
  onAddToCollection,
  onRemoveFromCollection,
  onCreateCollection
}) {
  if (!editor || !manga) return null;
  const title = editor.type === 'metadata' ? 'Modifier les metadata' : editor.type === 'tags' ? 'Gerer les tags' : 'Gerer les collections';

  return (
    <div className="kv-editor-backdrop" onClick={onClose}>
      <section className="kv-editor-dialog" onClick={(event) => event.stopPropagation()}>
        <header>
          <div><strong>{title}</strong><span>{manga.displayTitle}</span></div>
          <button type="button" className="kv-icon-button" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="kv-editor-content">
          {editor.type === 'metadata' ? <MetadataEditor manga={manga} onSave={async (...args) => { await onSaveMetadata?.(...args); onClose(); }} /> : null}
          {editor.type === 'tags' ? (
            <TagEditor manga={manga} tags={tags} onToggleTag={onToggleTag} onCreateTag={onCreateTag} onDeleteTag={onDeleteTag} />
          ) : null}
          {editor.type === 'collections' ? (
            <CollectionEditor
              manga={manga}
              collections={collections}
              onToggleCollection={(collection, active) => active
                ? onRemoveFromCollection?.(collection.id, manga.id)
                : onAddToCollection?.(manga.id, collection.id)}
              onCreateCollection={onCreateCollection}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}

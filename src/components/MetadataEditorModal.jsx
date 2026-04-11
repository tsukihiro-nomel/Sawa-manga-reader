import { useEffect, useMemo, useState } from 'react';
import { CheckIcon, LockIcon, RefreshIcon, SparklesIcon } from './Icons.jsx';

const EDITABLE_FIELDS = [
  { key: 'title', label: 'Titre affiche', type: 'input' },
  { key: 'author', label: 'Auteur', type: 'input' },
  { key: 'description', label: 'Description', type: 'textarea', rows: 5 },
  { key: 'volume', label: 'Volume', type: 'input' },
  { key: 'number', label: 'Numero', type: 'input' },
  { key: 'year', label: 'Annee', type: 'input' }
];

function sourceLabel(source) {
  if (source === 'manual') return 'Manuel';
  if (source === 'comicinfo') return 'ComicInfo';
  if (source === 'online') return 'Online';
  if (source === 'scanner') return 'Scanner';
  return 'Auto';
}

export default function MetadataEditorModal({
  manga,
  onClose,
  onSave,
  onUpdateLocks,
  onImportComicInfo
}) {
  const [form, setForm] = useState({
    title: '',
    author: '',
    description: '',
    volume: '',
    number: '',
    year: '',
    aliasesText: ''
  });
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm({
      title: manga.displayTitle || '',
      author: manga.author || '',
      description: manga.description || '',
      volume: manga.volume || '',
      number: manga.number || '',
      year: manga.year || '',
      aliasesText: Array.isArray(manga.aliases) ? manga.aliases.join('\n') : ''
    });
    setStatus('');
    setBusy(false);
  }, [manga]);

  const fieldLocks = useMemo(() => manga.metadataLocks || {}, [manga.metadataLocks]);
  const fieldSources = useMemo(() => manga.metadataFieldSource || {}, [manga.metadataFieldSource]);

  async function handleImport() {
    if (!onImportComicInfo) return;
    setBusy(true);
    setStatus('');
    try {
      const result = await onImportComicInfo(manga.id);
      if (result?.ok === false) {
        setStatus(result.error || 'Impossible d importer ComicInfo.');
      } else {
        setStatus('ComicInfo importe.');
      }
    } catch (error) {
      setStatus(error?.message || 'Impossible d importer ComicInfo.');
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleLock(field, value) {
    if (!onUpdateLocks) return;
    await onUpdateLocks(manga.id, { [field]: value });
  }

  function handleSave() {
    const aliases = [...new Map(
      form.aliasesText
        .split(/\r?\n|;/)
        .flatMap((chunk) => chunk.split(','))
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => [value.toLowerCase(), value])
    ).values()];

    onSave(manga.id, {
      title: form.title,
      author: form.author,
      description: form.description,
      volume: form.volume,
      number: form.number,
      year: form.year,
      aliases
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel metadata-editor-modal" onClick={(event) => event.stopPropagation()}>
        <div className="metadata-editor-head">
          <div>
            <span className="vault-kicker">Source metadata</span>
            <h3>Editer les metadonnees</h3>
            <p>Tu peux verrouiller un champ pour empecher tout ecrasement automatique.</p>
          </div>
          <div className="metadata-editor-head-actions">
            <button type="button" className="ghost-button" onClick={handleImport} disabled={busy}>
              <SparklesIcon size={14} /> {busy ? 'Import...' : 'Importer ComicInfo'}
            </button>
            <button type="button" className="ghost-button" onClick={onClose}>Fermer</button>
          </div>
        </div>

        {status ? <div className="metadata-editor-status">{status}</div> : null}

        <div className="metadata-editor-grid">
          {EDITABLE_FIELDS.map((field) => (
            <label key={field.key} className="metadata-editor-field">
              <div className="metadata-editor-field-top">
                <span>{field.label}</span>
                <div className="metadata-editor-field-meta">
                  <span className="metadata-editor-source">{sourceLabel(fieldSources[field.key])}</span>
                  <button
                    type="button"
                    className={`metadata-lock-toggle ${fieldLocks[field.key] ? 'active' : ''}`}
                    onClick={() => handleToggleLock(field.key, !fieldLocks[field.key])}
                    title={fieldLocks[field.key] ? 'Champ verrouille' : 'Verrouiller ce champ'}
                  >
                    {fieldLocks[field.key] ? <CheckIcon size={12} /> : <LockIcon size={12} />}
                    <span>{fieldLocks[field.key] ? 'Verrouille' : 'Libre'}</span>
                  </button>
                </div>
              </div>

              {field.type === 'textarea' ? (
                <textarea
                  rows={field.rows || 4}
                  value={form[field.key] || ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value }))}
                />
              ) : (
                <input
                  value={form[field.key] || ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value }))}
                />
              )}
            </label>
          ))}
        </div>

        <label className="metadata-editor-field">
          <div className="metadata-editor-field-top">
            <span>Titres alternatifs</span>
            <span className="metadata-editor-source">Manuel</span>
          </div>
          <textarea
            rows="4"
            value={form.aliasesText}
            placeholder="Un titre par ligne ou separe par des virgules"
            onChange={(event) => setForm((prev) => ({ ...prev, aliasesText: event.target.value }))}
          />
        </label>

        <div className="metadata-editor-footnote">
          <RefreshIcon size={14} />
          <span>Priorite appliquee: manuel verrouille &gt; manuel &gt; ComicInfo &gt; online &gt; scanner.</span>
        </div>

        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose}>Annuler</button>
          <button className="primary-button" onClick={handleSave}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

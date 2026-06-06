import { useEffect, useState } from 'react';

export default function TextPromptModal({
  open,
  title,
  description = '',
  label = 'Nom',
  defaultValue = '',
  placeholder = '',
  confirmLabel = 'Valider',
  cancelLabel = 'Annuler',
  onCancel,
  onConfirm
}) {
  const [value, setValue] = useState(defaultValue || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setValue(defaultValue || '');
  }, [defaultValue, open]);

  if (!open) return null;

  async function handleSubmit(event) {
    event?.preventDefault?.();
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm?.(value);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !busy && onCancel?.()}>
      <div className="modal-panel modal-panel-wide" onClick={(event) => event.stopPropagation()}>
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
        <form className="text-prompt-form" onSubmit={handleSubmit}>
          <label className="text-prompt-field">
            <span>{label}</span>
            <input
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={placeholder}
              disabled={busy}
            />
          </label>
          <div className="modal-actions-row text-prompt-actions">
            <button type="button" className="ghost-button" disabled={busy} onClick={() => onCancel?.()}>
              {cancelLabel}
            </button>
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? 'Validation...' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

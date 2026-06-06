import { memo, useEffect, useMemo, useRef } from 'react';
import { SearchIcon } from './Icons.jsx';

function normalizeValue(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function CommandPalette({
  open = false,
  query = '',
  commands = [],
  onQueryChange,
  onClose,
  onRun
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select?.();
    }, 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  const filteredCommands = useMemo(() => {
    const needle = normalizeValue(query);
    if (!needle) return commands.slice(0, 12);
    return commands.filter((command) => {
      const haystack = normalizeValue(`${command.label}\n${command.description || ''}\n${command.keywords || ''}`);
      return haystack.includes(needle);
    }).slice(0, 12);
  }, [commands, query]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
        const firstCommand = filteredCommands[0];
        if (firstCommand) {
          event.preventDefault();
          onRun?.(firstCommand);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose, onRun, filteredCommands]);

  if (!open) return null;

  return (
    <div className="command-palette-layer" onClick={onClose}>
      <div className="command-palette" onClick={(event) => event.stopPropagation()}>
        <div className="command-palette-head">
          <div>
            <span className="command-palette-kicker">Palette locale</span>
            <h3>Aller vite, sans charger l'interface</h3>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>Fermer</button>
        </div>

        <label className="command-palette-search">
          <SearchIcon size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange?.(event.target.value)}
            placeholder="Naviguer, ouvrir la maintenance, relancer un scan..."
          />
          <span>Ctrl+K</span>
        </label>

        <div className="command-palette-list">
          {filteredCommands.length === 0 ? (
            <div className="command-palette-empty">
              <strong>Aucune commande</strong>
              <span>Essaie un autre mot-cle comme maintenance, queue, coffre ou scan.</span>
            </div>
          ) : (
            filteredCommands.map((command) => (
              <button
                key={command.id}
                type="button"
                className="command-palette-item"
                onClick={() => onRun?.(command)}
              >
                <div>
                  <strong>{command.label}</strong>
                  {command.description ? <span>{command.description}</span> : null}
                </div>
                {command.shortcut ? <small>{command.shortcut}</small> : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(CommandPalette);

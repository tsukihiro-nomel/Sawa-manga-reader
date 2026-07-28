import { memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  CloseIcon,
  FilterIcon,
  LayersIcon,
  SearchIcon
} from './Icons.jsx';
import {
  moveSuggestionCursor,
  normalizeSearchFilter,
  updateSearchState
} from '../utils/searchSession.js';
import { mergeSuggestionIntoQuery } from '../utils/searchIndex.js';

const GROUP_LABELS = Object.freeze({
  recent: 'Recherches recentes',
  manga: 'Manga',
  author: 'Auteur',
  tag: 'Tag',
  collection: 'Collection',
  filter: 'Filtre'
});

const FILTER_FIELDS = Object.freeze([
  { value: 'tag', label: 'Tag' },
  { value: 'author', label: 'Auteur' },
  { value: 'collection', label: 'Collection' },
  { value: 'status', label: 'Statut' },
  { value: 'favorite', label: 'Favori' },
  { value: 'missing', label: 'Element manquant' },
  { value: 'chapters', label: 'Nombre de chapitres' },
  { value: 'added', label: 'Age de l ajout' }
]);

const FILTER_PRESETS = Object.freeze({
  status: ['unread', 'in-progress', 'read'],
  favorite: ['true', 'false'],
  missing: ['cover', 'metadata', 'description']
});

function makeFilterLabel(filter) {
  const prefix = FILTER_FIELDS.find((field) => field.value === filter.field)?.label || filter.field;
  const operator = filter.operator === ':' ? ' : ' : ` ${filter.operator} `;
  return `${prefix}${operator}${filter.value}`;
}

function HighlightedLabel({ label, query, ranges = [] }) {
  const source = String(label || '');
  const firstRange = ranges[0];
  if (firstRange && Number.isInteger(firstRange.start) && Number.isInteger(firstRange.end)) {
    return (
      <>
        {source.slice(0, firstRange.start)}
        <mark>{source.slice(firstRange.start, firstRange.end)}</mark>
        {source.slice(firstRange.end)}
      </>
    );
  }
  const needle = String(query || '').trim();
  if (!needle) return source;
  const index = source.toLocaleLowerCase('fr').indexOf(needle.toLocaleLowerCase('fr'));
  if (index < 0) return source;
  return (
    <>
      {source.slice(0, index)}
      <mark>{source.slice(index, index + needle.length)}</mark>
      {source.slice(index + needle.length)}
    </>
  );
}

function SearchExperience({
  state,
  suggestions = [],
  resultCount = 0,
  advancedChips = [],
  status = null,
  filterOptions = {},
  onStateChange,
  onCommitSearch,
  onSaveSearch,
  onRemoveAdvancedToken,
  onClearRecents,
  compact = false,
  className = '',
  privateContext = false
}) {
  const normalizedState = updateSearchState(state);
  const { query, scope, filters } = normalizedState;
  const listboxId = useId();
  const inputRef = useRef(null);
  const blurTimerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [filterDraft, setFilterDraft] = useState({
    id: '',
    field: 'tag',
    operator: ':',
    value: ''
  });

  const visibleSuggestions = useMemo(
    () => suggestions.slice(0, 8),
    [suggestions]
  );
  const groupedSuggestions = useMemo(() => {
    const groups = [];
    visibleSuggestions.forEach((item, index) => {
      const last = groups[groups.length - 1];
      if (last?.name === item.group) {
        last.items.push({ item, index });
      } else {
        groups.push({ name: item.group, items: [{ item, index }] });
      }
    });
    return groups;
  }, [visibleSuggestions]);

  useEffect(() => {
    setActiveIndex((current) => current >= visibleSuggestions.length ? -1 : current);
  }, [visibleSuggestions.length]);

  useEffect(() => () => {
    if (blurTimerRef.current != null) window.clearTimeout(blurTimerRef.current);
  }, []);

  const update = (patch) => onStateChange?.(updateSearchState(normalizedState, patch));
  const commit = (nextQuery = query) => {
    const trimmed = String(nextQuery || '').trim();
    if (trimmed) onCommitSearch?.(trimmed);
    setOpen(false);
    setActiveIndex(-1);
  };
  const selectSuggestion = (item) => {
    const nextQuery = mergeSuggestionIntoQuery(query, item);
    update({ query: nextQuery });
    commit(nextQuery);
  };

  const addFilter = () => {
    const candidate = normalizeSearchFilter({
      ...filterDraft,
      id: filterDraft.id || `filter-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    });
    if (!candidate) return;
    const next = filterDraft.id
      ? filters.map((filter) => filter.id === filterDraft.id ? candidate : filter)
      : [...filters, candidate];
    update({ filters: next });
    setFilterDraft({ id: '', field: 'tag', operator: ':', value: '' });
    setBuilderOpen(false);
  };

  const editFilter = (filter) => {
    setFilterDraft(filter);
    setBuilderOpen(true);
    inputRef.current?.focus();
  };

  const removeFilter = (filterId) => {
    update({ filters: filters.filter((filter) => filter.id !== filterId) });
  };

  const currentPresets = filterDraft.field === 'tag'
    ? filterOptions.tags || []
    : filterDraft.field === 'collection'
      ? filterOptions.collections || []
      : FILTER_PRESETS[filterDraft.field] || [];

  const showDropdown = open && (
    visibleSuggestions.length > 0
    || (query.trim() && resultCount === 0)
  );

  return (
    <div className={`search-experience ${compact ? 'is-compact' : ''} ${className}`.trim()} data-private-context={privateContext || undefined}>
      <div className="search-experience-main">
        <label className="search-experience-input">
          <SearchIcon size={compact ? 16 : 18} />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showDropdown}
            aria-controls={showDropdown ? listboxId : undefined}
            aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
            placeholder="Rechercher mangas, auteurs, tags ou collections"
            value={query}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              blurTimerRef.current = window.setTimeout(() => setOpen(false), 120);
            }}
            onChange={(event) => {
              update({ query: event.target.value });
              setOpen(true);
              setActiveIndex(-1);
            }}
            onKeyDown={(event) => {
              if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                setOpen(true);
                setActiveIndex((current) => moveSuggestionCursor(current, event.key, visibleSuggestions.length));
                return;
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                if (activeIndex >= 0 && visibleSuggestions[activeIndex]) {
                  selectSuggestion(visibleSuggestions[activeIndex]);
                } else {
                  commit();
                }
                return;
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setOpen(false);
                setBuilderOpen(false);
                setActiveIndex(-1);
              }
            }}
          />
          {query ? (
            <button
              type="button"
              className="search-experience-icon"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => update({ query: '' })}
              title="Effacer la recherche"
              aria-label="Effacer la recherche"
            >
              <CloseIcon size={14} />
            </button>
          ) : null}
        </label>

        <label className="search-experience-scope" title="Portee de la recherche">
          <span>Portee</span>
          <select value={scope} onChange={(event) => update({ scope: event.target.value })}>
            <option value="current">Vue actuelle</option>
            <option value="all">Toute la bibliotheque</option>
          </select>
        </label>

        <button
          type="button"
          className={`search-experience-tool ${builderOpen ? 'is-active' : ''}`}
          onClick={() => setBuilderOpen((value) => !value)}
          title="Ajouter un filtre"
        >
          <FilterIcon size={15} />
          {!compact ? <span>Filtres</span> : null}
        </button>

        {(query.trim() || filters.length > 0) && onSaveSearch ? (
          <button type="button" className="search-experience-tool" onClick={onSaveSearch} title="Sauvegarder comme collection intelligente">
            <LayersIcon size={15} />
            {!compact ? <span>Sauver</span> : null}
          </button>
        ) : null}

        <span className="search-experience-count" aria-live="polite">
          {resultCount} resultat{resultCount > 1 ? 's' : ''}
        </span>
      </div>

      {(filters.length > 0 || advancedChips.length > 0 || status?.label) ? (
        <div className="search-experience-chips" aria-label="Filtres actifs">
          {filters.map((filter) => (
            <span key={filter.id} className="search-experience-chip">
              <button type="button" onClick={() => editFilter(filter)} title="Modifier ce filtre">
                {filter.label || makeFilterLabel(filter)}
              </button>
              <button type="button" onClick={() => removeFilter(filter.id)} aria-label={`Retirer ${filter.label || makeFilterLabel(filter)}`}>
                <CloseIcon size={12} />
              </button>
            </span>
          ))}
          {advancedChips.map((chip) => (
            <span key={`${chip.kind}-${chip.raw}`} className="search-experience-chip is-advanced">
              <span>{chip.label}</span>
              {onRemoveAdvancedToken ? (
                <button type="button" onClick={() => onRemoveAdvancedToken(chip.raw)} aria-label={`Retirer ${chip.label}`}>
                  <CloseIcon size={12} />
                </button>
              ) : null}
            </span>
          ))}
          {status?.label ? <span className={`search-experience-status is-${status.tone || 'neutral'}`}>{status.label}</span> : null}
          {(filters.length + advancedChips.length) > 1 ? (
            <button type="button" className="search-experience-clear-filters" onClick={() => update({ filters: [], query: '' })}>
              Tout effacer
            </button>
          ) : null}
        </div>
      ) : null}

      {builderOpen ? (
        <div className="search-filter-builder" role="dialog" aria-label="Constructeur de filtres">
          <strong>{filterDraft.id ? 'Modifier le filtre' : 'Ajouter un filtre'}</strong>
          <label>
            <span>Champ</span>
            <select
              value={filterDraft.field}
              onChange={(event) => setFilterDraft({
                id: filterDraft.id,
                field: event.target.value,
                operator: ':',
                value: ''
              })}
            >
              {FILTER_FIELDS.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}
            </select>
          </label>
          {['chapters', 'added'].includes(filterDraft.field) ? (
            <label>
              <span>Comparaison</span>
              <select value={filterDraft.operator} onChange={(event) => setFilterDraft((current) => ({ ...current, operator: event.target.value }))}>
                <option value=":">egal a</option>
                <option value=">">superieur a</option>
                <option value=">=">superieur ou egal</option>
                <option value="<">inferieur a</option>
                <option value="<=">inferieur ou egal</option>
              </select>
            </label>
          ) : null}
          <label>
            <span>Valeur</span>
            <input
              value={filterDraft.value}
              list={`${listboxId}-filter-values`}
              onChange={(event) => setFilterDraft((current) => ({ ...current, value: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addFilter();
                }
              }}
              placeholder="Choisir ou saisir une valeur"
            />
            <datalist id={`${listboxId}-filter-values`}>
              {currentPresets.map((value) => {
                const candidate = typeof value === 'string' ? value : value?.name;
                return candidate ? <option key={candidate} value={candidate} /> : null;
              })}
            </datalist>
          </label>
          <div className="search-filter-builder-actions">
            <button type="button" onClick={() => setBuilderOpen(false)}>Annuler</button>
            <button type="button" className="is-primary" onClick={addFilter} disabled={!String(filterDraft.value).trim()}>
              {filterDraft.id ? 'Enregistrer' : 'Ajouter'}
            </button>
          </div>
        </div>
      ) : null}

      {showDropdown ? (
        <div id={listboxId} className="search-suggestions" role="listbox">
          {groupedSuggestions.map((group) => (
            <div key={group.name} className="search-suggestion-group">
              <div className="search-suggestion-heading">
                <span>{GROUP_LABELS[group.name] || group.name}</span>
                {group.name === 'recent' && onClearRecents ? (
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onClearRecents}>Effacer</button>
                ) : null}
              </div>
              {group.items.map(({ item, index }) => (
                <button
                  key={item.id}
                  id={`${listboxId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className={index === activeIndex ? 'is-active' : ''}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectSuggestion(item)}
                >
                  <span><HighlightedLabel label={item.label} query={query} ranges={item.highlight} /></span>
                  <small>{item.secondary || GROUP_LABELS[item.group] || item.group}</small>
                </button>
              ))}
            </div>
          ))}
          {query.trim() && resultCount === 0 ? (
            <div className="search-zero-state">
              <strong>Aucun resultat pour « {query.trim()} »</strong>
              <span>Essaie une portee plus large ou retire un filtre.</span>
              <div>
                {scope === 'current' ? <button type="button" onClick={() => update({ scope: 'all' })}>Toute la bibliotheque</button> : null}
                {filters.length > 0 ? <button type="button" onClick={() => update({ filters: [] })}>Retirer les filtres</button> : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default memo(SearchExperience);

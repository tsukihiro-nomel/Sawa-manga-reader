import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { RefreshIcon, SearchIcon, TrashIcon } from './Icons.jsx';

function RuntimeStateBadge({ runtime }) {
  const state = runtime?.state === 'running'
    ? 'Actif'
    : runtime?.needsAttention
      ? 'Attention'
      : 'Arrete';
  const className = runtime?.state === 'running'
    ? 'sources-addon-badge sources-addon-badge-active'
    : runtime?.needsAttention
      ? 'sources-addon-badge sources-addon-badge-warning'
      : 'sources-addon-badge';
  return <span className={className}>Etat: {state}</span>;
}

function PluginNotice({ children }) {
  return <div className="settings-note sources-addon-note">{children}</div>;
}

function pickPreferredConnectorId(connectors = [], requestedId = '') {
  const available = connectors.filter((connector) => connector.availability === 'available');
  if (requestedId && available.some((connector) => connector.id === requestedId)) {
    return requestedId;
  }
  if (available.length > 0) return available[0].id;
  if (requestedId && connectors.some((connector) => connector.id === requestedId)) {
    return requestedId;
  }
  return connectors[0]?.id || '';
}

function isAwaitingRuntimeSources(extension) {
  return Boolean(extension?.sourcesDeferred)
    || (
      !extension?.installed
      && Number(extension?.sourceCount || extension?.connectors?.length || 0) === 0
      && Boolean(extension?.packageName)
    );
}

function formatExtensionCoverage(extension) {
  const sourceCount = Number(extension?.sourceCount || extension?.connectors?.length || 0);
  const compatibleSourceCount = Number(extension?.compatibleSourceCount || 0);
  if (isAwaitingRuntimeSources(extension)) {
    return extension?.installed
      ? 'Sources en attente de revelation par le runtime'
      : 'Installation requise pour reveler les sources';
  }
  if (sourceCount === 0) return 'Aucune source revelee pour le moment';
  return `${sourceCount} source${sourceCount > 1 ? 's' : ''} - ${compatibleSourceCount} compatible${compatibleSourceCount > 1 ? 's' : ''} dans Sawa`;
}

function formatExtensionStatus(extension) {
  const base = extension.installed ? 'installee' : (extension.status || 'disponible');
  if (isAwaitingRuntimeSources(extension) && !extension?.error) {
    return extension.installed
      ? `${base} - en attente de confirmation par Suwayomi`
      : `${base} - les sources apparaitront apres installation`;
  }
  return extension.error ? `${base} - ${extension.error}` : base;
}

function countRepositorySources(repository) {
  return (repository.catalog || []).reduce(
    (total, extension) => total + Number(extension.sourceCount || extension.connectors?.length || 0),
    0
  );
}

function sortExtensions(extensions = []) {
  return [...extensions].sort((left, right) => {
    const leftInstalled = left.installed ? 1 : 0;
    const rightInstalled = right.installed ? 1 : 0;
    if (leftInstalled !== rightInstalled) return rightInstalled - leftInstalled;

    const leftReady = Number(left.compatibleSourceCount || 0) > 0 ? 1 : (isAwaitingRuntimeSources(left) ? 0.5 : 0);
    const rightReady = Number(right.compatibleSourceCount || 0) > 0 ? 1 : (isAwaitingRuntimeSources(right) ? 0.5 : 0);
    if (leftReady !== rightReady) return rightReady - leftReady;

    return String(left.displayName || '').localeCompare(String(right.displayName || ''), 'fr', { sensitivity: 'base' });
  });
}

function ExtensionCard({
  extension,
  pluginEnabled,
  busyKey,
  withBusy,
  setRuntime,
  refresh,
  setFeedback
}) {
  return (
    <div className="sources-addon-item-card sources-addon-extension-card">
      <div className="sources-addon-item-copy">
        <div className="sources-addon-item-topline">
          <strong>{extension.displayName}</strong>
          {extension.installed ? <span className="sources-addon-badge">Installee</span> : null}
          {Number(extension.compatibleSourceCount || 0) > 0 ? <span className="sources-addon-badge">Compatible</span> : null}
          {extension.runtimeKind === 'suwayomi' ? <span className="sources-addon-badge">Runtime</span> : null}
        </div>

        <div className="settings-note">
          {extension.packageName}
          {extension.languages?.length ? ` - ${extension.languages.join(', ')}` : ''}
          {extension.nsfw ? ' - NSFW' : ''}
        </div>

        <div className="settings-note">{formatExtensionCoverage(extension)}</div>

        {isAwaitingRuntimeSources(extension) ? (
          <div className="settings-note">
            Cette extension sera hydratee apres installation par le runtime local.
          </div>
        ) : null}

        {extension.connectors?.length ? (
          <div className="settings-note">
            Sources: {extension.connectors.slice(0, 4).map((connector) => connector.displayName).join(', ')}
            {extension.connectors.length > 4 ? '...' : ''}
          </div>
        ) : null}

        <div className="settings-note">Statut: {formatExtensionStatus(extension)}</div>
      </div>

      <div className="sources-addon-item-actions">
        <div className="sources-addon-inline-actions">
          {!extension.installed ? (
            <button
              className="primary-button"
              disabled={!pluginEnabled || busyKey === `ext-install:${extension.id}`}
              onClick={() => withBusy(`ext-install:${extension.id}`, async () => {
                const result = await window.mangaAPI.installSourceExtension(extension.id);
                if (!result?.ok) throw new Error(result?.error || 'Installation impossible.');
                setRuntime(result?.runtime || null);
                await refresh();
                startTransition(() => {
                  setFeedback(`${extension.displayName} a ete installee. Le runtime revele maintenant ses sources.`);
                });
              })}
            >
              Installer
            </button>
          ) : (
            <>
              <button
                className="ghost-button"
                disabled={!pluginEnabled || busyKey === `ext-update:${extension.id}`}
                onClick={() => withBusy(`ext-update:${extension.id}`, async () => {
                  const result = await window.mangaAPI.updateSourceExtension(extension.id);
                  if (!result?.ok) throw new Error(result?.error || 'Mise a jour impossible.');
                  setRuntime(result?.runtime || null);
                  await refresh();
                  setFeedback(`Extension ${extension.displayName} mise a jour.`);
                })}
              >
                Mettre a jour
              </button>

              <button
                className="ghost-button ghost-button-danger"
                disabled={!pluginEnabled || busyKey === `ext-remove:${extension.id}`}
                onClick={() => withBusy(`ext-remove:${extension.id}`, async () => {
                  const result = await window.mangaAPI.uninstallSourceExtension(extension.id);
                  if (!result?.ok) throw new Error(result?.error || 'Retrait impossible.');
                  setRuntime(result?.runtime || null);
                  await refresh();
                  setFeedback(`Extension ${extension.displayName} retiree.`);
                })}
              >
                Retirer
              </button>
            </>
          )}
        </div>

        {extension.installed ? (
          <label className="sources-addon-switch">
            <span>Active</span>
            <input
              type="checkbox"
              checked={!!extension.enabled}
              disabled={!pluginEnabled || busyKey === `ext-toggle:${extension.id}`}
              onChange={(event) => withBusy(`ext-toggle:${extension.id}`, async () => {
                const result = await window.mangaAPI.setSourceExtensionEnabled(extension.id, event.target.checked);
                if (!result?.ok) throw new Error(result?.error || 'Activation impossible.');
                setRuntime(result?.runtime || null);
                await refresh();
              })}
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}

function renderPreferenceField(field, prefValues, patchPreferenceValue) {
  const key = String(field?.key || '').trim();
  const type = String(field?.type || 'text').trim();
  const value = prefValues?.[key] ?? field?.defaultValue ?? '';
  if (!key) return null;

  if (type === 'boolean' || type === 'checkbox') {
    return (
      <label key={key} className="settings-toggle">
        <span>{field.label || key}</span>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => patchPreferenceValue(key, event.target.checked)}
        />
      </label>
    );
  }

  if (type === 'select') {
    return (
      <label key={key} className="sources-addon-pref-field">
        <span>{field.label || key}</span>
        <select
          value={String(value ?? '')}
          onChange={(event) => patchPreferenceValue(key, event.target.value)}
        >
          {(Array.isArray(field.options) ? field.options : []).map((option) => {
            const optionValue = typeof option === 'object' && option !== null
              ? String(option.value ?? option.id ?? option.key ?? '')
              : String(option ?? '');
            const optionLabel = typeof option === 'object' && option !== null
              ? String(option.label ?? option.name ?? optionValue)
              : optionValue;
            return <option key={`${key}-${optionValue}`} value={optionValue}>{optionLabel}</option>;
          })}
        </select>
      </label>
    );
  }

  if (type === 'multiselect') {
    const currentValues = Array.isArray(value) ? value.map((entry) => String(entry)) : [];
    return (
      <label key={key} className="sources-addon-pref-field">
        <span>{field.label || key}</span>
        <div className="sources-addon-pref-options">
          {(Array.isArray(field.options) ? field.options : []).map((option) => {
            const optionValue = typeof option === 'object' && option !== null
              ? String(option.value ?? option.id ?? option.key ?? '')
              : String(option ?? '');
            const optionLabel = typeof option === 'object' && option !== null
              ? String(option.label ?? option.name ?? optionValue)
              : optionValue;
            const checked = currentValues.includes(optionValue);
            return (
              <label key={`${key}-${optionValue}`} className="sources-addon-option-toggle">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    const nextValues = event.target.checked
                      ? [...currentValues, optionValue]
                      : currentValues.filter((entry) => entry !== optionValue);
                    patchPreferenceValue(key, [...new Set(nextValues)]);
                  }}
                />
                <span>{optionLabel}</span>
              </label>
            );
          })}
        </div>
      </label>
    );
  }

  return (
    <label key={key} className="sources-addon-pref-field">
      <span>{field.label || key}</span>
      <input
        type={type === 'number' ? 'number' : (field.secret ? 'password' : 'text')}
        value={value == null ? '' : String(value)}
        onChange={(event) => patchPreferenceValue(
          key,
          type === 'number' ? Number(event.target.value || 0) : event.target.value
        )}
      />
    </label>
  );
}

export default function SourcesAddonManager({
  plugin = null,
  onOpenSources
}) {
  const [runtime, setRuntime] = useState(null);
  const [repositories, setRepositories] = useState([]);
  const [extensions, setExtensions] = useState([]);
  const [connectors, setConnectors] = useState([]);
  const [connectorId, setConnectorId] = useState('');
  const [prefFields, setPrefFields] = useState([]);
  const [prefValues, setPrefValues] = useState({});
  const [busyKey, setBusyKey] = useState('');
  const [feedback, setFeedback] = useState('');
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [trustRepository, setTrustRepository] = useState(false);
  const [filter, setFilter] = useState('');
  const [isRefreshing, startRefresh] = useTransition();

  const deferredFilter = useDeferredValue(filter);
  const pluginEnabled = Boolean(plugin?.installed && plugin?.enabled);
  const runtimeIsRunning = runtime?.state === 'running';
  const extensionsListRef = useRef(null);

  const installedExtensions = useMemo(
    () => extensions.filter((extension) => extension.installed),
    [extensions]
  );

  const availableConnectors = useMemo(
    () => connectors.filter((connector) => connector.availability === 'available'),
    [connectors]
  );

  const filteredExtensions = useMemo(() => {
    const needle = String(deferredFilter || '').trim().toLowerCase();
    const visible = !needle
      ? extensions
      : extensions.filter((extension) => (
        extension.displayName?.toLowerCase().includes(needle)
        || extension.packageName?.toLowerCase().includes(needle)
        || extension.languages?.join(' ').toLowerCase().includes(needle)
        || extension.connectors?.some((connector) => connector.displayName?.toLowerCase().includes(needle))
      ));
    return sortExtensions(visible);
  }, [deferredFilter, extensions]);

  const selectedConnector = useMemo(
    () => connectors.find((connector) => connector.id === connectorId) || null,
    [connectors, connectorId]
  );

  const extensionsVirtualizer = useVirtualizer({
    count: filteredExtensions.length,
    getScrollElement: () => extensionsListRef.current,
    estimateSize: () => 188,
    overscan: 8,
    getItemKey: (index) => filteredExtensions[index]?.id || `ext-${index}`
  });

  const virtualExtensions = extensionsVirtualizer.getVirtualItems();

  useEffect(() => {
    extensionsVirtualizer.scrollToOffset(0);
  }, [deferredFilter, extensionsVirtualizer]);

  async function refresh() {
    try {
      const [runtimeResult, repositoryResult, extensionResult, connectorResult] = await Promise.all([
        window.mangaAPI.getSourceRuntimeStatus(),
        window.mangaAPI.listSourceRepositories(),
        window.mangaAPI.listSourceExtensions(),
        window.mangaAPI.listSourceConnectors().catch(() => ({ connectors: [] }))
      ]);

      const nextConnectors = Array.isArray(connectorResult?.connectors) ? connectorResult.connectors : [];
      const nextConnectorId = pickPreferredConnectorId(nextConnectors, connectorResult?.lastConnectorId || '');

      startRefresh(() => {
        setRuntime(runtimeResult?.runtime || null);
        setRepositories(Array.isArray(repositoryResult?.repositories) ? repositoryResult.repositories : []);
        setExtensions(Array.isArray(extensionResult?.extensions) ? extensionResult.extensions : []);
        setConnectors(nextConnectors);
        setConnectorId((current) => pickPreferredConnectorId(nextConnectors, current || nextConnectorId));
      });
    } catch (_error) {
      startRefresh(() => {
        setRuntime(null);
        setRepositories([]);
        setExtensions([]);
        setConnectors([]);
        setConnectorId('');
      });
    }
  }

  useEffect(() => {
    if (!plugin?.installed) return;
    refresh();
  }, [plugin?.installed, plugin?.enabled]);

  useEffect(() => {
    if (!connectors.length) {
      setConnectorId('');
      setPrefFields([]);
      setPrefValues({});
      return;
    }
    const nextConnectorId = pickPreferredConnectorId(connectors, connectorId);
    if (nextConnectorId !== connectorId) {
      setConnectorId(nextConnectorId);
    }
  }, [connectors, connectorId]);

  useEffect(() => {
    if (!pluginEnabled || !connectorId) {
      setPrefFields([]);
      setPrefValues({});
      return;
    }

    let disposed = false;
    window.mangaAPI.getSourceConnectorPrefs(connectorId).then((result) => {
      if (disposed) return;
      if (!result?.ok) {
        setPrefFields([]);
        setPrefValues({});
        return;
      }
      setPrefFields(Array.isArray(result?.fields) ? result.fields : []);
      setPrefValues(result?.values && typeof result.values === 'object' ? result.values : {});
    }).catch(() => {
      if (disposed) return;
      setPrefFields([]);
      setPrefValues({});
    });

    return () => {
      disposed = true;
    };
  }, [connectorId, pluginEnabled]);

  async function withBusy(key, action) {
    setBusyKey(key);
    setFeedback('');
    try {
      await action();
    } catch (error) {
      setFeedback(error?.message || 'Action impossible.');
    } finally {
      setBusyKey('');
    }
  }

  function patchPreferenceValue(fieldKey, value) {
    setPrefValues((current) => ({
      ...current,
      [fieldKey]: value
    }));
  }

  if (!plugin?.installed) {
    return (
      <div className="settings-note">
        Installe d'abord l'addon pour gerer les depots, les extensions et les imports web.
      </div>
    );
  }

  return (
    <div className="sources-addon-manager">
      <section className="sources-addon-hero">
        <div className="sources-addon-hero-copy">
          <span className="sources-addon-kicker">Addon officiel</span>
          <h5>Sources web communautaires</h5>
          <p>
            Installe des extensions, choisis une source active puis importe les chapitres
            directement dans une categorie locale Sawa.
          </p>
          <div className="sources-addon-badges">
            <RuntimeStateBadge runtime={runtime} />
            {runtime?.version ? <span className="sources-addon-badge">{runtime.version}</span> : null}
            <span className="sources-addon-badge">
              {installedExtensions.length} extension{installedExtensions.length > 1 ? 's' : ''} installee{installedExtensions.length > 1 ? 's' : ''}.
            </span>
            <span className="sources-addon-badge">
              {availableConnectors.length} source{availableConnectors.length > 1 ? 's' : ''} prete{availableConnectors.length > 1 ? 's' : ''}.
            </span>
            {isRefreshing ? <span className="sources-addon-badge">Actualisation...</span> : null}
          </div>
          {runtime?.lastError ? <PluginNotice>{runtime.lastError}</PluginNotice> : null}
        </div>

        <div className="sources-addon-hero-actions">
          <button
            className="primary-button"
            disabled={!pluginEnabled || runtimeIsRunning || busyKey === 'start'}
            onClick={() => withBusy('start', async () => {
              const result = await window.mangaAPI.startSourceRuntime();
              setRuntime(result?.runtime || null);
              await refresh();
              setFeedback('Moteur de sources demarre.');
            })}
          >
            Demarrer
          </button>

          <button
            className="ghost-button"
            disabled={!pluginEnabled || busyKey === 'sync'}
            onClick={() => withBusy('sync', async () => {
              const result = await window.mangaAPI.syncSourceRepositories();
              if (!result?.ok) throw new Error(result?.error || 'Synchronisation impossible.');
              setRuntime(result?.runtime || null);
              await refresh();
              setFeedback('Catalogues synchronises.');
            })}
          >
            <RefreshIcon size={14} /> Synchroniser
          </button>

          <button
            className="ghost-button"
            disabled={!pluginEnabled}
            onClick={() => onOpenSources?.()}
          >
            Ouvrir Sources web
          </button>
        </div>
      </section>

      {!pluginEnabled ? (
        <section className="settings-card-block sources-addon-panel">
          <PluginNotice>
            Active l'addon en haut de la section Plugins pour demarrer le moteur,
            voir les connecteurs installes et ouvrir la recherche web.
          </PluginNotice>
        </section>
      ) : null}

      <div className="sources-addon-grid">
        <section className="settings-card-block sources-addon-panel sources-addon-panel-repositories">
          <div className="settings-section-heading">
            <h4>Depots</h4>
            <span>Le catalogue officiel est deja integre. Les depots tiers restent manuels et explicites.</span>
          </div>

          <div className="sources-addon-repo-form">
            <label className="sources-addon-input-block">
              <span>URL du depot JSON</span>
              <div className="sources-addon-input-row">
                <SearchIcon size={16} />
                <input
                  value={repositoryUrl}
                  onChange={(event) => setRepositoryUrl(event.target.value)}
                  placeholder="https://exemple.test/catalog.json"
                />
              </div>
            </label>

            <label className="sources-addon-trust">
              <input
                type="checkbox"
                checked={trustRepository}
                onChange={(event) => setTrustRepository(event.target.checked)}
              />
              <span>Je confirme faire confiance a ce depot tiers avant installation.</span>
            </label>

            <div className="sources-addon-inline-actions">
              <button
                type="button"
                className="primary-button"
                disabled={!pluginEnabled || !repositoryUrl.trim() || !trustRepository || busyKey === 'repo-add'}
                onClick={() => withBusy('repo-add', async () => {
                  const result = await window.mangaAPI.addSourceRepository({
                    url: repositoryUrl.trim(),
                    trusted: true
                  });
                  if (!result?.ok) throw new Error(result?.error || 'Depot impossible a ajouter.');
                  setRepositoryUrl('');
                  setTrustRepository(false);
                  setRuntime(result?.runtime || null);
                  await refresh();
                  setFeedback('Depot ajoute. Lance une synchronisation pour charger son catalogue.');
                })}
              >
                Ajouter
              </button>

              <button
                type="button"
                className="ghost-button"
                disabled={!pluginEnabled || busyKey === 'sync-inline'}
                onClick={() => withBusy('sync-inline', async () => {
                  const result = await window.mangaAPI.syncSourceRepositories();
                  if (!result?.ok) throw new Error(result?.error || 'Synchronisation impossible.');
                  setRuntime(result?.runtime || null);
                  await refresh();
                  setFeedback('Catalogues synchronises.');
                })}
              >
                <RefreshIcon size={14} /> Sync
              </button>
            </div>
          </div>

          <div className="sources-addon-list">
            {repositories.length === 0 ? (
              <PluginNotice>Aucun depot charge pour le moment.</PluginNotice>
            ) : repositories.map((repository) => (
              <div key={repository.id} className="sources-addon-item-card">
                <div className="sources-addon-item-copy">
                  <div className="sources-addon-item-topline">
                    <strong>{repository.name}</strong>
                    {repository.bundled ? <span className="sources-addon-badge">Officiel</span> : null}
                  </div>
                  <div className="settings-note">{repository.url}</div>
                  <div className="settings-note">
                    {repository.catalog?.length || 0} extension{(repository.catalog?.length || 0) > 1 ? 's' : ''} - {countRepositorySources(repository)} source{countRepositorySources(repository) > 1 ? 's' : ''}
                  </div>
                  <div className="settings-note">
                    Statut: {repository.status || 'idle'}
                    {repository.trusted ? ' - approuve' : ' - non approuve'}
                    {repository.error ? ` - ${repository.error}` : ''}
                  </div>
                </div>

                {!repository.bundled ? (
                  <div className="sources-addon-inline-actions">
                    <button
                      className="ghost-button ghost-button-danger"
                      disabled={busyKey === `repo-remove:${repository.id}`}
                      onClick={() => withBusy(`repo-remove:${repository.id}`, async () => {
                        const result = await window.mangaAPI.removeSourceRepository(repository.id);
                        if (!result?.ok) throw new Error(result?.error || 'Depot introuvable.');
                        setRuntime(result?.runtime || null);
                        await refresh();
                        setFeedback('Depot retire.');
                      })}
                    >
                      <TrashIcon size={14} /> Retirer
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="settings-card-block sources-addon-panel sources-addon-panel-extensions">
          <div className="settings-section-heading">
            <h4>Extensions</h4>
            <span>Installe, active puis ouvre les sources utiles sans quitter Sawa.</span>
          </div>

          <label className="sources-addon-input-block">
            <span>Filtrer les extensions</span>
            <div className="sources-addon-input-row">
              <SearchIcon size={16} />
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="MangaDex, fr, package..."
              />
            </div>
          </label>

          <div
            ref={extensionsListRef}
            className="sources-addon-list sources-addon-list-virtual"
          >
            {filteredExtensions.length === 0 ? (
              <PluginNotice>Aucune extension ne correspond a ce filtre.</PluginNotice>
            ) : (
              <div
                className="sources-addon-virtual-spacer"
                style={{ height: `${extensionsVirtualizer.getTotalSize()}px` }}
              >
                {virtualExtensions.map((virtualRow) => {
                  const extension = filteredExtensions[virtualRow.index];
                  if (!extension) return null;
                  return (
                    <div
                      key={virtualRow.key}
                      className="sources-addon-virtual-item"
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                      ref={extensionsVirtualizer.measureElement}
                    >
                      <ExtensionCard
                        extension={extension}
                        pluginEnabled={pluginEnabled}
                        busyKey={busyKey}
                        withBusy={withBusy}
                        setRuntime={setRuntime}
                        refresh={refresh}
                        setFeedback={setFeedback}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="settings-card-block sources-addon-panel">
        <div className="settings-section-heading">
          <h4>Preferences de source</h4>
          <span>Reglages du connecteur actif, sans ouvrir une autre interface.</span>
        </div>

        {!pluginEnabled ? (
          <PluginNotice>Active d'abord l'addon pour charger les connecteurs disponibles.</PluginNotice>
        ) : availableConnectors.length === 0 ? (
          <PluginNotice>
            Installe au moins une extension avec une source compatible dans Sawa pour faire apparaitre ses connecteurs ici.
          </PluginNotice>
        ) : (
          <>
            <label className="sources-addon-pref-field">
              <span>Connecteur</span>
              <select value={connectorId} onChange={(event) => setConnectorId(event.target.value)}>
                {availableConnectors.map((connector) => (
                  <option key={connector.id} value={connector.id}>
                    {connector.displayName}{connector.language ? ` - ${connector.language}` : ''}
                  </option>
                ))}
              </select>
            </label>

            {selectedConnector ? (
              <div className="sources-addon-badges">
                <span className="sources-addon-badge">
                  Disponibilite: {selectedConnector.availability === 'available' ? 'prete' : selectedConnector.availability}
                </span>
                <span className="sources-addon-badge">
                  Config: {selectedConnector.configState || 'ready'}
                </span>
              </div>
            ) : null}

            {prefFields.length === 0 ? (
              <PluginNotice>Cette source n'expose pas encore de preference modifiable dans Sawa.</PluginNotice>
            ) : (
              <>
                <div className="sources-addon-pref-grid">
                  {prefFields.map((field) => renderPreferenceField(field, prefValues, patchPreferenceValue))}
                </div>

                <div className="sources-addon-inline-actions">
                  <button
                    className="primary-button"
                    disabled={!connectorId || busyKey === 'prefs-save'}
                    onClick={() => withBusy('prefs-save', async () => {
                      const result = await window.mangaAPI.setSourceConnectorPrefs({
                        connectorId,
                        values: prefValues
                      });
                      if (!result?.ok) throw new Error(result?.error || 'Enregistrement impossible.');
                      setFeedback('Preferences source enregistrees.');
                    })}
                  >
                    Enregistrer
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </section>

      <div className="sources-addon-footer">
        <button
          className="ghost-button"
          disabled={!pluginEnabled || busyKey === 'reset-cache'}
          onClick={() => withBusy('reset-cache', async () => {
            const result = await window.mangaAPI.resetSourceRuntimeCache();
            setRuntime(result?.runtime || null);
            await refresh();
            setFeedback('Cache runtime reinitialise.');
          })}
        >
          Reinitialiser le moteur de sources
        </button>

        <button
          className="ghost-button"
          disabled={!pluginEnabled || !runtimeIsRunning || busyKey === 'stop'}
          onClick={() => withBusy('stop', async () => {
            const result = await window.mangaAPI.stopSourceRuntime();
            setRuntime(result?.runtime || null);
            setConnectors([]);
            setConnectorId('');
            setPrefFields([]);
            setPrefValues({});
            setFeedback('Moteur de sources arrete.');
          })}
        >
          Arreter le moteur
        </button>
      </div>

      {feedback ? <div className="settings-note plugin-preview-feedback">{feedback}</div> : null}
    </div>
  );
}

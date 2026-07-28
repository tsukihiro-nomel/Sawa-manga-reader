export default function ReliabilityNoticeCenter({ issues = [], onRetry, onDismiss, onRetrySync, syncStatus }) {
  const visibleIssues = Array.isArray(issues) ? issues.slice(-3) : [];
  const showSyncRetry = syncStatus?.state === 'retry-required' || syncStatus?.retryable;
  if (!visibleIssues.length && !showSyncRetry) return null;

  return (
    <aside className="reliability-notice-center" aria-label="Etat des sauvegardes" aria-live="polite">
      {showSyncRetry ? (
        <div className="reliability-notice is-warning">
          <strong>{syncStatus?.label || 'Synchronisation a relancer'}</strong>
          <span>{syncStatus?.detail || 'Les donnees visibles ont ete conservees.'}</span>
          <div>
            <button type="button" onClick={onRetrySync}>Relancer</button>
          </div>
        </div>
      ) : null}
      {visibleIssues.map((issue) => (
        <div className="reliability-notice is-error" key={issue.id}>
          <strong>{issue.title || 'Modification non enregistree'}</strong>
          <span>{issue.message}</span>
          <details>
            <summary>Details</summary>
            <small>{issue.details || 'Aucun detail supplementaire.'}</small>
          </details>
          <div>
            <button type="button" onClick={() => onRetry?.(issue.id)}>Reessayer</button>
            <button type="button" onClick={() => onDismiss?.(issue.id)}>Fermer</button>
          </div>
        </div>
      ))}
    </aside>
  );
}

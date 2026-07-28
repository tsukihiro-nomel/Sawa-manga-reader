const FATAL_ERROR_PATTERN = /(?:chunkloaderror|failed to fetch dynamically imported module|syntaxerror|integrity|corrupt|react invariant|cannot find module)/i;

export function normalizeRendererError(errorLike) {
  if (!errorLike) return { name: '', message: 'Erreur inconnue' };
  if (typeof errorLike === 'string') return { name: '', message: errorLike };
  return {
    name: String(errorLike?.name || ''),
    message: String(errorLike?.message || errorLike || 'Erreur inconnue')
  };
}

export function shouldEscalateUnhandledRejection(errorLike) {
  const normalized = normalizeRendererError(errorLike);
  return FATAL_ERROR_PATTERN.test(`${normalized.name} ${normalized.message}`);
}

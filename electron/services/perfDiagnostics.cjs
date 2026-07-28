const { monitorEventLoopDelay, performance } = require('perf_hooks');

const MAX_MEASUREMENTS = 200;
const measurements = [];
let runtimeEnabled = false;
let eventLoopHistogram = null;

function isPerfDiagnosticsEnabled() {
  return process.env.SAWA_PERF_DIAG === '1'
    || process.env.SAWA_PERF_DIAGNOSTICS === '1'
    || runtimeEnabled;
}

function configurePerfDiagnostics(enabled) {
  runtimeEnabled = Boolean(enabled);
  if (isPerfDiagnosticsEnabled() && !eventLoopHistogram) {
    eventLoopHistogram = monitorEventLoopDelay({ resolution: 20 });
    eventLoopHistogram.enable();
  } else if (!isPerfDiagnosticsEnabled() && eventLoopHistogram) {
    eventLoopHistogram.disable();
    eventLoopHistogram = null;
  }
  return isPerfDiagnosticsEnabled();
}

function estimatePayloadBytes(payload) {
  if (payload == null) return 0;
  try {
    return Buffer.byteLength(JSON.stringify(payload), 'utf8');
  } catch (_error) {
    return 0;
  }
}

function normalizeMetadata(metadata = {}) {
  const payload = metadata.payload;
  const safe = {};
  Object.entries(metadata || {}).forEach(([key, value]) => {
    if (key === 'payload' || /(path|url|query|title|name|\bid\b)/i.test(key)) return;
    if (typeof value === 'number' || typeof value === 'boolean') safe[key] = value;
    else if (typeof value === 'string') safe[key] = value.slice(0, 80);
  });
  const payloadBytes = estimatePayloadBytes(payload);
  return payloadBytes > 0 ? { ...safe, payloadBytes } : safe;
}

function recordMeasurement(name, durationMs, metadata = {}) {
  if (!isPerfDiagnosticsEnabled()) return null;
  const safeMetadata = normalizeMetadata(metadata);
  const entry = {
    kind: name,
    name,
    durationMs: Number(durationMs.toFixed(2)),
    at: new Date().toISOString(),
    ...safeMetadata
  };
  measurements.push(entry);
  while (measurements.length > MAX_MEASUREMENTS) measurements.shift();
  return entry;
}

function measureSync(name, operation, metadata = {}) {
  if (!isPerfDiagnosticsEnabled()) return operation();
  const startedAt = performance.now();
  let result;
  try {
    result = operation();
    return result;
  } finally {
    recordMeasurement(name, performance.now() - startedAt, normalizeMetadata(metadata));
  }
}

async function measureAsync(name, operation, metadata = {}) {
  if (!isPerfDiagnosticsEnabled()) return operation();
  const startedAt = performance.now();
  let result;
  try {
    result = await operation();
    return result;
  } finally {
    recordMeasurement(name, performance.now() - startedAt, normalizeMetadata(metadata));
  }
}

function getMeasurements() {
  return measurements.map((entry) => ({ ...entry }));
}

function clearMeasurements() {
  measurements.length = 0;
  eventLoopHistogram?.reset();
}

function getDiagnosticsSnapshot() {
  const eventLoop = eventLoopHistogram
    ? {
      minMs: Number((eventLoopHistogram.min / 1e6).toFixed(2)),
      maxMs: Number((eventLoopHistogram.max / 1e6).toFixed(2)),
      meanMs: Number((eventLoopHistogram.mean / 1e6).toFixed(2)),
      p95Ms: Number((eventLoopHistogram.percentile(95) / 1e6).toFixed(2))
    }
    : null;
  return {
    enabled: isPerfDiagnosticsEnabled(),
    eventLoop,
    measurements: getMeasurements()
  };
}

module.exports = {
  clearMeasurements,
  configurePerfDiagnostics,
  estimatePayloadBytes,
  getDiagnosticsSnapshot,
  getMeasurements,
  isPerfDiagnosticsEnabled,
  measureAsync,
  measureSync,
  recordMeasurement
};

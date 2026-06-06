const { performance } = require('perf_hooks');

const MAX_MEASUREMENTS = 200;
const measurements = [];

function isPerfDiagnosticsEnabled() {
  return process.env.SAWA_PERF_DIAG === '1';
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
  const safe = { ...metadata };
  delete safe.payload;
  const payloadBytes = estimatePayloadBytes(payload);
  return payloadBytes > 0 ? { ...safe, payloadBytes } : safe;
}

function recordMeasurement(name, durationMs, metadata = {}) {
  if (!isPerfDiagnosticsEnabled()) return null;
  const entry = {
    name,
    durationMs: Number(durationMs.toFixed(2)),
    at: new Date().toISOString(),
    ...metadata
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
}

module.exports = {
  clearMeasurements,
  estimatePayloadBytes,
  getMeasurements,
  isPerfDiagnosticsEnabled,
  measureAsync,
  measureSync,
  recordMeasurement
};

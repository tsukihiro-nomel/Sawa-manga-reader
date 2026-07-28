const fs = require('fs');
const path = require('path');

const MAX_PDF_BYTES = 128 * 1024 * 1024;

function resolveRealPathWithinRoots(filePath, roots = [], operations = fs) {
  const requested = path.resolve(String(filePath || ''));
  if (!requested || !operations.existsSync(requested)) return null;
  let resolved;
  try {
    resolved = operations.realpathSync(requested);
  } catch (_error) {
    return null;
  }
  const resolvedRoots = roots.map((root) => {
    try {
      return operations.realpathSync(path.resolve(String(root || '')));
    } catch (_error) {
      return null;
    }
  }).filter(Boolean);
  return resolvedRoots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))
    ? resolved
    : null;
}

function resolveAllowedPdfPath(filePath, options = {}) {
  const operations = options.operations || fs;
  const maxBytes = Math.max(1, Number(options.maxBytes) || MAX_PDF_BYTES);
  const resolvedPath = resolveRealPathWithinRoots(filePath, options.roots || [], operations);
  if (!resolvedPath || path.extname(resolvedPath).toLowerCase() !== '.pdf') return null;
  const stats = operations.statSync(resolvedPath);
  if (!stats.isFile() || stats.size <= 0 || stats.size > maxBytes) return null;
  return { resolvedPath, size: stats.size };
}

async function readAllowedPdfBuffer(filePath, options = {}) {
  const operations = options.operations || fs;
  const maxBytes = Math.max(1, Number(options.maxBytes) || MAX_PDF_BYTES);
  const allowed = resolveAllowedPdfPath(filePath, { ...options, operations, maxBytes });
  if (!allowed) return null;
  const { resolvedPath } = allowed;
  const buffer = await operations.promises.readFile(resolvedPath);
  if (!Buffer.isBuffer(buffer) || buffer.length > maxBytes) return null;
  return { buffer, resolvedPath };
}

module.exports = {
  MAX_PDF_BYTES,
  readAllowedPdfBuffer,
  resolveAllowedPdfPath,
  resolveRealPathWithinRoots
};

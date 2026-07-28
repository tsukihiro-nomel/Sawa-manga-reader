const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.avif', '.jfif']);
const APPEARANCE_TYPES = new Set(['mosaic', 'banner', 'single', 'stack']);

function clamp(value, min, max, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
}

function uniqueStrings(values, limit = Infinity) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))]
    .slice(0, limit);
}

function normalizeCrop(value) {
  return {
    x: clamp(value?.x, -1, 1, 0),
    y: clamp(value?.y, -1, 1, 0),
    zoom: clamp(value?.zoom, 1, 4, 1)
  };
}

function stableLegacyVariantId(kind, filePath) {
  return `${kind}-${crypto.createHash('sha256').update(String(filePath || '')).digest('hex').slice(0, 16)}`;
}

function normalizeCoverVariant(value) {
  if (!value || typeof value !== 'object') return null;
  const filePath = String(value.path || value.filePath || '').trim();
  const id = String(value.id || '').trim();
  if (!filePath || !id) return null;
  return {
    id,
    hash: String(value.hash || '').trim() || null,
    path: filePath,
    fileName: path.basename(String(value.fileName || path.basename(filePath)).trim()),
    kind: ['managed', 'legacy-custom', 'legacy-online'].includes(value.kind) ? value.kind : 'managed',
    label: String(value.label || '').trim() || 'Couverture locale',
    createdAt: value.createdAt || null
  };
}

function normalizeCoverProfile(value, mangaId = '') {
  const variants = (Array.isArray(value?.variants) ? value.variants : [])
    .map(normalizeCoverVariant)
    .filter(Boolean);
  const ids = new Set(variants.map((variant) => variant.id));
  const requestedActive = String(value?.activeVariantId || 'auto').trim() || 'auto';
  return {
    mangaId: String(value?.mangaId || mangaId || '').trim(),
    activeVariantId: requestedActive === 'auto' || ids.has(requestedActive) ? requestedActive : 'auto',
    variants,
    crops: {
      portrait: normalizeCrop(value?.crops?.portrait),
      banner: normalizeCrop(value?.crops?.banner)
    },
    updatedAt: value?.updatedAt || null
  };
}

function rebaseManagedCoverProfile(value, managedCoverDir, mangaId = '') {
  const profile = normalizeCoverProfile(value, mangaId);
  if (!managedCoverDir) return profile;
  return {
    ...profile,
    variants: profile.variants.map((variant) => variant.kind === 'managed'
      ? { ...variant, path: path.join(managedCoverDir, variant.fileName) }
      : variant)
  };
}

function normalizeCollectionAppearance(value) {
  const requestedType = typeof value === 'string' ? value : value?.type;
  return {
    type: APPEARANCE_TYPES.has(requestedType) ? requestedType : 'mosaic',
    featuredMangaIds: uniqueStrings(value?.featuredMangaIds, 4)
  };
}

function assertImagePath(filePath) {
  const resolvedPath = path.resolve(String(filePath || ''));
  const extension = path.extname(resolvedPath).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) {
    throw new Error('Format de couverture non pris en charge.');
  }
  const stats = fs.statSync(resolvedPath);
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error('La couverture choisie est vide ou illisible.');
  }
  return { resolvedPath, extension, stats };
}

function isPathInside(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveCoverCandidatePath(sourcePath, mangaRoot, operations = fs) {
  const requested = path.resolve(String(sourcePath || ''));
  const requestedRoot = path.resolve(String(mangaRoot || ''));
  if (!requested || !requestedRoot || !operations.existsSync(requested) || !operations.existsSync(requestedRoot)) return null;
  let realSource;
  let realRoot;
  try {
    realSource = operations.realpathSync(requested);
    realRoot = operations.realpathSync(requestedRoot);
  } catch (_error) {
    return null;
  }
  if (!isPathInside(realSource, realRoot)) return null;
  try {
    const stats = operations.statSync(realSource);
    if (!stats.isFile() || stats.size <= 0) return null;
  } catch (_error) {
    return null;
  }
  return realSource;
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function importManagedCover({
  sourcePath,
  managedCoverDir,
  sourceLabel = 'Image locale',
  allowedRoot = null,
  hooks = null
}) {
  const validatedSourcePath = allowedRoot
    ? resolveCoverCandidatePath(sourcePath, allowedRoot)
    : sourcePath;
  if (!validatedSourcePath) throw new Error('Chemin de couverture refusé.');
  const { resolvedPath, extension } = assertImagePath(validatedSourcePath);
  await fs.promises.mkdir(managedCoverDir, { recursive: true });
  const tempPath = path.join(
    managedCoverDir,
    `.cover-import.${process.pid}.${Date.now()}.${crypto.randomBytes(5).toString('hex')}.tmp`
  );
  const digest = crypto.createHash('sha256');
  let descriptor = null;
  try {
    descriptor = fs.openSync(tempPath, 'wx');
    let chunkIndex = 0;
    const hashingStream = new Transform({
      transform(chunk, _encoding, callback) {
        digest.update(chunk);
        try {
          hooks?.onChunk?.({ chunkIndex, bytes: chunk.length, sourcePath: resolvedPath });
        } catch (_error) {}
        chunkIndex += 1;
        callback(null, chunk);
      }
    });
    await pipeline(
      fs.createReadStream(resolvedPath, { highWaterMark: 64 * 1024 }),
      hashingStream,
      fs.createWriteStream(null, { fd: descriptor, autoClose: false })
    );
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    const hash = digest.digest('hex');
    if (await hashFile(tempPath) !== hash) {
      throw new Error('Validation de la copie de couverture impossible.');
    }

    const names = await fs.promises.readdir(managedCoverDir);
    let existing = null;
    for (const name of names.filter((entry) => (
      entry.toLowerCase().startsWith(`${hash}.`)
      || entry.toLowerCase().startsWith(`${hash}-`)
    ))) {
      try {
        if (await hashFile(path.join(managedCoverDir, name)) === hash) {
          existing = name;
          break;
        }
      } catch (_error) {}
    }

    const normalizedExtension = extension === '.jpeg' ? '.jpg' : extension;
    let fileName = existing || `${hash}${normalizedExtension}`;
    let destinationPath = path.join(managedCoverDir, fileName);
    const deduplicated = Boolean(existing);
    if (existing) {
      await fs.promises.rm(tempPath, { force: true });
    } else {
      if (fs.existsSync(destinationPath)) {
        fileName = `${hash}-${crypto.randomBytes(4).toString('hex')}${normalizedExtension}`;
        destinationPath = path.join(managedCoverDir, fileName);
      }
      await fs.promises.rename(tempPath, destinationPath);
    }

    return {
      id: `managed-${hash.slice(0, 20)}`,
      hash,
      path: destinationPath,
      fileName,
      kind: 'managed',
      label: String(sourceLabel || 'Image locale').trim(),
      createdAt: new Date().toISOString(),
      deduplicated
    };
  } catch (error) {
    if (descriptor !== null) {
      try { fs.closeSync(descriptor); } catch (_error) {}
    }
    await fs.promises.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

function discoverLegacyCovers(mangaPath) {
  if (!mangaPath || !fs.existsSync(mangaPath)) return [];
  let entries = [];
  try {
    entries = fs.readdirSync(mangaPath, { withFileTypes: true });
  } catch (_error) {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const lower = entry.name.toLowerCase();
      const kind = lower.startsWith('.sawa-custom-cover')
        ? 'legacy-custom'
        : (lower.startsWith('.sawa-online-cover') ? 'legacy-online' : null);
      if (!kind || !IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) return null;
      const filePath = path.join(mangaPath, entry.name);
      return {
        id: stableLegacyVariantId(kind, filePath),
        hash: null,
        path: filePath,
        fileName: entry.name,
        kind,
        label: kind === 'legacy-custom' ? 'Ancienne couverture personnalisée' : 'Ancienne couverture en ligne',
        createdAt: null
      };
    })
    .filter(Boolean);
}

function mergeCoverVariants(profile, variants = []) {
  const normalized = normalizeCoverProfile(profile, profile?.mangaId);
  const byId = new Map(normalized.variants.map((variant) => [variant.id, variant]));
  variants.map(normalizeCoverVariant).filter(Boolean).forEach((variant) => byId.set(variant.id, variant));
  return {
    ...normalized,
    variants: [...byId.values()],
    updatedAt: new Date().toISOString()
  };
}

function selectCoverVariant(profile, variantId) {
  const normalized = normalizeCoverProfile(profile, profile?.mangaId);
  const requested = String(variantId || 'auto').trim() || 'auto';
  if (requested !== 'auto' && !normalized.variants.some((variant) => variant.id === requested)) {
    throw new Error('Cette couverture n’est plus disponible.');
  }
  return { ...normalized, activeVariantId: requested, updatedAt: new Date().toISOString() };
}

function updateCoverCrop(profile, format, crop) {
  const normalized = normalizeCoverProfile(profile, profile?.mangaId);
  if (!['portrait', 'banner'].includes(format)) throw new Error('Format de cadrage invalide.');
  return {
    ...normalized,
    crops: { ...normalized.crops, [format]: normalizeCrop(crop) },
    updatedAt: new Date().toISOString()
  };
}

function activeCoverPath(profile) {
  const normalized = normalizeCoverProfile(profile, profile?.mangaId);
  if (normalized.activeVariantId === 'auto') return null;
  return normalized.variants.find((variant) => variant.id === normalized.activeVariantId)?.path || null;
}

function buildCoverGallery({ manga, profile }) {
  const normalized = mergeCoverVariants(
    normalizeCoverProfile(profile, manga?.id),
    discoverLegacyCovers(manga?.path)
  );
  const seenCandidates = new Set();
  const pageCandidates = (Array.isArray(manga?.chapters) ? manga.chapters : [])
    .map((chapter) => ({
      id: `page-${chapter.id}`,
      label: `Page candidate · ${chapter.name || 'chapitre'}`,
      path: chapter.previewFilePath || null,
      src: chapter.previewSrc || null,
      mediaType: chapter.previewMediaType || 'image'
    }))
    .filter((candidate) => {
      const key = candidate.path || candidate.src;
      if (!key || seenCandidates.has(key)) return false;
      seenCandidates.add(key);
      return true;
    })
    .slice(0, 8);
  return {
    profile: normalized,
    auto: {
      id: 'auto',
      label: 'Couverture automatique',
      src: manga?.coverType === 'auto' || manga?.coverType === 'default'
        ? manga?.coverSrc || null
        : (manga?.chapters?.[0]?.previewSrc || null),
      mediaType: manga?.coverType === 'auto'
        ? manga?.coverMediaType || 'image'
        : (manga?.chapters?.[0]?.previewMediaType || 'image'),
      filePath: manga?.coverType === 'auto'
        ? manga?.coverFilePath || null
        : (manga?.chapters?.[0]?.previewFilePath || manga?.chapters?.[0]?.path || null)
    },
    pageCandidates
  };
}

module.exports = {
  APPEARANCE_TYPES,
  IMAGE_EXTENSIONS,
  activeCoverPath,
  buildCoverGallery,
  discoverLegacyCovers,
  hashFile,
  importManagedCover,
  isPathInside,
  mergeCoverVariants,
  normalizeCollectionAppearance,
  normalizeCoverProfile,
  rebaseManagedCoverProfile,
  resolveCoverCandidatePath,
  normalizeCoverVariant,
  normalizeCrop,
  selectCoverVariant,
  stableLegacyVariantId,
  updateCoverCrop
};

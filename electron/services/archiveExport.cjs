const fs = require('fs');
const path = require('path');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const yauzl = require('yauzl');
const yazl = require('yazl');
const { buildComicInfoXml } = require('./comicInfo.cjs');

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif', '.tif', '.tiff'
]);

function normalizeEntryName(value) {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('\0')) throw new Error('Nom d entree ZIP invalide.');
  const parts = normalized.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Chemin d entree ZIP non securise.');
  }
  return parts.join('/');
}

function ensureCbzPath(filePath) {
  const resolved = path.resolve(String(filePath || ''));
  if (!resolved || path.extname(resolved).toLowerCase() !== '.cbz') {
    throw new Error('La cible doit etre un fichier CBZ.');
  }
  return resolved;
}

function normalizeConflictPolicy(value) {
  return ['rename', 'replace', 'skip'].includes(String(value || '').trim())
    ? String(value).trim()
    : 'rename';
}

function nextAvailableCbzPath(filePath) {
  const parsed = path.parse(filePath);
  let suffix = 2;
  let candidate = filePath;
  while (fs.existsSync(candidate)) {
    candidate = path.join(parsed.dir, `${parsed.name} (${suffix})${parsed.ext}`);
    suffix += 1;
  }
  return candidate;
}

function openZip(filePath, options = {}) {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: options.autoClose !== false }, (error, zipFile) => {
      if (error) reject(error);
      else resolve(zipFile);
    });
  });
}

async function collectEntries(filePath, options = {}) {
  const zipFile = await openZip(filePath, { autoClose: options.autoClose });
  const entries = [];
  await new Promise((resolve, reject) => {
    zipFile.on('entry', (entry) => {
      entries.push(entry);
      zipFile.readEntry();
    });
    zipFile.once('end', resolve);
    zipFile.once('error', reject);
    zipFile.readEntry();
  });
  return { zipFile, entries };
}

function listImageFiles(rootPath) {
  const root = path.resolve(rootPath);
  const output = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        output.push({
          fullPath,
          entryName: normalizeEntryName(path.relative(root, fullPath))
        });
      }
    }
  };
  visit(root);
  return output.sort((left, right) => left.entryName.localeCompare(right.entryName, undefined, { numeric: true }));
}

function tempPathFor(targetPath) {
  return path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`
  );
}

async function validateCbz(filePath) {
  const { zipFile, entries } = await collectEntries(filePath);
  const normalizedNames = entries
    .filter((entry) => !/\/$/.test(entry.fileName || ''))
    .map((entry) => normalizeEntryName(entry.fileName));
  const comicInfoCount = normalizedNames.filter((entryName) => path.basename(entryName).toLowerCase() === 'comicinfo.xml').length;
  const imageCount = normalizedNames.filter((entryName) => IMAGE_EXTENSIONS.has(path.extname(entryName).toLowerCase())).length;
  try { zipFile.close(); } catch (_error) {}
  if (comicInfoCount !== 1) throw new Error('Le CBZ produit ne contient pas exactement un ComicInfo.xml.');
  if (imageCount < 1) throw new Error('Le CBZ produit ne contient aucune image.');
  return { ok: true, entryCount: normalizedNames.length, imageCount, comicInfoCount };
}

async function writeZipFromCbz({ sourcePath, temporaryPath, xml, isCancelled, onProgress }) {
  const { zipFile: sourceZip, entries } = await collectEntries(sourcePath, { autoClose: false });
  const sourceEntries = entries.filter((entry) => {
    if (/\/$/.test(entry.fileName || '')) return false;
    return path.basename(String(entry.fileName || '')).toLowerCase() !== 'comicinfo.xml';
  });
  const totalBytes = sourceEntries.reduce((sum, entry) => sum + Number(entry.uncompressedSize || 0), 0);
  let processedBytes = 0;
  const output = new yazl.ZipFile();
  const destination = fs.createWriteStream(temporaryPath, { flags: 'wx' });
  const completion = pipeline(output.outputStream, destination);

  sourceEntries.forEach((entry) => {
    const entryName = normalizeEntryName(entry.fileName);
    output.addReadStreamLazy(entryName, (callback) => {
      if (isCancelled?.()) {
        callback(new Error('Export annule.'));
        return;
      }
      sourceZip.openReadStream(entry, (error, stream) => {
        if (error) {
          callback(error);
          return;
        }
        stream.on('data', (chunk) => {
          processedBytes += chunk.length;
          onProgress?.({
            phase: 'writing',
            processedBytes,
            totalBytes,
            percent: totalBytes > 0 ? Math.min(99, Math.round((processedBytes / totalBytes) * 100)) : 0
          });
          if (isCancelled?.()) {
            stream.destroy(new Error('Export annule.'));
          }
        });
        callback(null, stream);
      });
    }, {
      mtime: entry.getLastModDate?.() || new Date(),
      compress: entry.compressionMethod !== 0
    });
  });
  output.addBuffer(Buffer.from(xml, 'utf8'), 'ComicInfo.xml', { compress: true });
  output.end();
  try {
    await completion;
  } finally {
    try { sourceZip.close(); } catch (_error) {}
  }
}

async function writeZipFromFolder({ sourcePath, temporaryPath, xml, isCancelled, onProgress }) {
  const files = listImageFiles(sourcePath);
  if (files.length === 0) throw new Error('Le dossier ne contient aucune image exportable.');
  const totalBytes = files.reduce((sum, file) => sum + fs.statSync(file.fullPath).size, 0);
  let processedBytes = 0;
  let streamedBytes = 0;
  let cancelledDuringStreaming = false;
  const output = new yazl.ZipFile();
  const destination = fs.createWriteStream(temporaryPath, { flags: 'wx' });
  const cancellationGate = new Transform({
    transform(chunk, _encoding, callback) {
      streamedBytes += chunk.length;
      onProgress?.({
        phase: 'streaming',
        streamedBytes,
        totalSourceBytes: totalBytes
      });
      if (!isCancelled?.()) {
        callback(null, chunk);
        return;
      }
      cancelledDuringStreaming = true;
      // Discard output after cancellation. The cancellable source stream ends
      // naturally at its next 64 KiB boundary so yazl can release every handle.
      callback();
    }
  });
  let completionFailure = null;
  const completion = pipeline(output.outputStream, cancellationGate, destination).catch((error) => {
    completionFailure = error;
  });
  let cancelledWhileQueueing = false;
  for (const file of files) {
    if (isCancelled?.()) {
      cancelledWhileQueueing = true;
      break;
    }
    const stats = fs.statSync(file.fullPath);
    output.addReadStreamLazy(file.entryName, (callback) => {
      const stream = Readable.from((async function* readCancellableFile() {
        const handle = await fs.promises.open(file.fullPath, 'r');
        const buffer = Buffer.allocUnsafe(64 * 1024);
        let position = 0;
        try {
          while (!isCancelled?.()) {
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
            if (bytesRead <= 0) break;
            position += bytesRead;
            yield Buffer.from(buffer.subarray(0, bytesRead));
          }
        } finally {
          await handle.close();
        }
      })());
      callback(null, stream);
    }, {
      mtime: stats.mtime,
      mode: stats.mode,
      // Manga page formats are already compressed. Storing avoids expensive
      // recompression and makes cancellation settle at the next stream chunk.
      compress: false
    });
    processedBytes += stats.size;
    onProgress?.({
      phase: 'queued',
      processedBytes,
      totalBytes,
      percent: totalBytes > 0 ? Math.min(95, Math.round((processedBytes / totalBytes) * 95)) : 0
    });
  }
  if (cancelledWhileQueueing) {
    const cancellationError = new Error('Export annule.');
    output.outputStream.destroy(cancellationError);
    cancellationGate.destroy(cancellationError);
    await completion.catch(() => {});
    throw cancellationError;
  }
  output.addBuffer(Buffer.from(xml, 'utf8'), 'ComicInfo.xml', { compress: true });
  output.end();
  try {
    await completion;
    if (completionFailure) throw completionFailure;
    if (cancelledDuringStreaming || isCancelled?.()) throw new Error('Export annule.');
  } finally {
    // All lazy file handles close in their generator finally blocks.
  }
}

async function installValidatedArchive(temporaryPath, targetPath, replaceExisting, operations = fs) {
  const targetExists = operations.existsSync(targetPath);
  if (!replaceExisting && targetExists) {
    throw new Error('La cible CBZ existe deja.');
  }
  if (!replaceExisting || !targetExists) {
    operations.renameSync(temporaryPath, targetPath);
    return { path: targetPath, originalBackupPath: null };
  }

  const parsed = path.parse(targetPath);
  const originalBackupPath = path.join(
    parsed.dir,
    `${parsed.name}.sawa-original-${new Date().toISOString().replace(/[:.]/g, '-')}${parsed.ext}`
  );
  operations.copyFileSync(targetPath, originalBackupPath, fs.constants.COPYFILE_EXCL);
  try {
    // Both paths live in the same directory. The rename replaces the canonical
    // directory entry atomically while the copied backup retains the old bytes.
    operations.renameSync(temporaryPath, targetPath);
  } catch (error) {
    if (!operations.existsSync(targetPath) && operations.existsSync(originalBackupPath)) {
      try { operations.copyFileSync(originalBackupPath, targetPath, fs.constants.COPYFILE_EXCL); } catch (_restoreError) {}
    }
    throw error;
  }
  return { path: targetPath, originalBackupPath };
}

async function exportComicInfoCbz(options = {}) {
  const sourcePath = path.resolve(String(options.sourcePath || ''));
  const requestedTargetPath = ensureCbzPath(options.targetPath || sourcePath);
  if (!sourcePath || !fs.existsSync(sourcePath)) throw new Error('Source CBZ ou dossier introuvable.');
  const sourceStats = fs.statSync(sourcePath);
  if (!sourceStats.isFile() && !sourceStats.isDirectory()) throw new Error('Type de source non pris en charge.');
  if (sourceStats.isFile() && path.extname(sourcePath).toLowerCase() !== '.cbz') {
    throw new Error('La source fichier doit etre un CBZ.');
  }
  const sameSourceAndTarget = options.replaceSource !== false
    && sourceStats.isFile()
    && path.resolve(sourcePath) === path.resolve(requestedTargetPath);
  const conflictPolicy = sameSourceAndTarget
    ? 'replace'
    : normalizeConflictPolicy(options.conflictPolicy);
  if (fs.existsSync(requestedTargetPath) && conflictPolicy === 'skip') {
    return {
      ok: true,
      skipped: true,
      path: requestedTargetPath,
      originalBackupPath: null,
      validation: null
    };
  }
  const targetPath = fs.existsSync(requestedTargetPath) && conflictPolicy === 'rename'
    ? nextAvailableCbzPath(requestedTargetPath)
    : requestedTargetPath;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const temporaryPath = tempPathFor(targetPath);
  const xml = options.xml || buildComicInfoXml(options.record || {});
  const isCancelled = typeof options.isCancelled === 'function' ? options.isCancelled : () => false;
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

  try {
    if (isCancelled()) throw new Error('Export annule.');
    if (sourceStats.isDirectory()) {
      await writeZipFromFolder({ sourcePath, temporaryPath, xml, isCancelled, onProgress });
    } else {
      await writeZipFromCbz({ sourcePath, temporaryPath, xml, isCancelled, onProgress });
    }
    if (isCancelled()) throw new Error('Export annule.');
    onProgress({ phase: 'validating', percent: 99 });
    const validation = await validateCbz(temporaryPath);
    if (isCancelled()) throw new Error('Export annule.');
    const installed = await installValidatedArchive(
      temporaryPath,
      targetPath,
      conflictPolicy === 'replace'
    );
    onProgress({ phase: 'done', percent: 100 });
    return { ok: true, ...installed, validation };
  } catch (error) {
    try { fs.rmSync(temporaryPath, { force: true }); } catch (_cleanupError) {}
    return {
      ok: false,
      cancelled: /annule/i.test(String(error?.message || '')),
      error: error?.message || 'Export CBZ impossible.'
    };
  }
}

module.exports = {
  exportComicInfoCbz,
  installValidatedArchive,
  listImageFiles,
  nextAvailableCbzPath,
  normalizeConflictPolicy,
  normalizeEntryName,
  validateCbz
};

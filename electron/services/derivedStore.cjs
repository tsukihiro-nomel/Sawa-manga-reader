const fs = require('fs');
const path = require('path');

const {
  getDerivedDbPath,
  getDerivedDir
} = require('./storage.cjs');
const {
  isPerfDiagnosticsEnabled,
  measureSync
} = require('./perfDiagnostics.cjs');

let Database = null;
try {
  Database = require('better-sqlite3');
} catch (_error) {
  Database = null;
}

const SCHEMA_VERSION = 2;
let database = null;
let nativeStoreFailed = false;

const memoryStore = {
  snapshot: null,
  jobs: new Map(),
  searchDocuments: [],
  ocrPages: new Map(),
  visualHashes: new Map()
};

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function openDatabase() {
  if (!Database || nativeStoreFailed) return null;
  if (database) return database;
  try {
    ensureDir(getDerivedDir());
    database = new Database(getDerivedDbPath());
    initializeSchema(database);
    return database;
  } catch (error) {
    nativeStoreFailed = true;
    database = null;
    if (isPerfDiagnosticsEnabled()) {
      console.warn('[derived-store] native sqlite unavailable, using memory store:', error?.message || error);
    }
    return null;
  }
}

function hasNativeStore() {
  return Boolean(openDatabase());
}

function initializeSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS library_snapshot (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      updated_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS library_items (
      location_id TEXT PRIMARY KEY,
      content_id TEXT,
      legacy_id TEXT,
      type TEXT NOT NULL,
      title TEXT,
      path TEXT,
      category_id TEXT,
      manga_content_id TEXT,
      container_type TEXT,
      source_type TEXT,
      health_status TEXT,
      updated_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      chapter_location_id TEXT NOT NULL,
      page_index INTEGER NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      priority INTEGER NOT NULL,
      lane TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      progress_json TEXT NOT NULL,
      attempt INTEGER NOT NULL DEFAULT 0,
      requeueable INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      ended_at TEXT,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS search_documents (
      id TEXT PRIMARY KEY,
      item_content_id TEXT,
      item_location_id TEXT,
      doc_type TEXT NOT NULL,
      title TEXT,
      body TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS search_documents_fts USING fts5(
      id UNINDEXED,
      title,
      body
    );

    CREATE TABLE IF NOT EXISTS ocr_pages (
      id TEXT PRIMARY KEY,
      item_content_id TEXT,
      item_location_id TEXT,
      page_ref TEXT NOT NULL,
      lang_codes TEXT,
      text_body TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS visual_hashes (
      id TEXT PRIMARY KEY,
      item_content_id TEXT,
      item_location_id TEXT,
      hash TEXT NOT NULL,
      source TEXT,
      updated_at TEXT NOT NULL
    );
  `);

  db.prepare(`
    INSERT INTO schema_meta (key, value)
    VALUES ('schema_version', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(SCHEMA_VERSION));
}

function getDatabase() {
  return openDatabase();
}

function flattenLibraryItems(library) {
  const rows = [];
  for (const manga of library?.allMangas || []) {
    rows.push({
      locationId: manga.locationId || manga.id,
      contentId: manga.contentId || null,
      legacyId: manga.legacyId || manga.id || null,
      type: 'manga',
      title: manga.displayTitle || manga.name || '',
      path: manga.path || null,
      categoryId: manga.categoryId || null,
      mangaContentId: manga.contentId || null,
      containerType: 'folder',
      sourceType: manga.sourceType || 'library',
      healthStatus: manga.healthStatus || 'ok',
      payload: manga
    });

    for (const chapter of manga.chapters || []) {
      rows.push({
        locationId: chapter.locationId || chapter.id,
        contentId: chapter.contentId || null,
        legacyId: chapter.legacyId || chapter.id || null,
        type: 'chapter',
        title: `${manga.displayTitle || manga.name || ''} · ${chapter.name || ''}`.trim(),
        path: chapter.path || null,
        categoryId: manga.categoryId || null,
        mangaContentId: manga.contentId || null,
        containerType: chapter.containerType || null,
        sourceType: chapter.sourceType || null,
        healthStatus: chapter.healthStatus || 'ok',
        payload: {
          ...chapter,
          mangaId: manga.id,
          mangaContentId: manga.contentId
        }
      });
    }
  }
  return rows;
}

function buildSearchDocuments(library, options = {}) {
  const documents = [];
  const annotationsByManga = options.annotationsByManga || {};
  for (const manga of library?.allMangas || []) {
    const annotations = Array.isArray(annotationsByManga[manga.id]) ? annotationsByManga[manga.id] : [];
    const body = [
      manga.displayTitle,
      manga.author,
      manga.description,
      ...(Array.isArray(manga.aliases) ? manga.aliases : []),
      ...(Array.isArray(manga.tags) ? manga.tags : []).map((tag) => tag.name || tag.id || ''),
      ...annotations.flatMap((annotation) => [
        annotation?.text,
        annotation?.note
      ])
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join('\n');

    documents.push({
      id: `manga:${manga.contentId || manga.locationId || manga.id}`,
      itemContentId: manga.contentId || null,
      itemLocationId: manga.locationId || manga.id || null,
      docType: 'manga',
      title: manga.displayTitle || manga.name || '',
      body
    });

    for (const chapter of manga.chapters || []) {
      documents.push({
        id: `chapter:${chapter.contentId || chapter.locationId || chapter.id}`,
        itemContentId: chapter.contentId || null,
        itemLocationId: chapter.locationId || chapter.id || null,
        docType: 'chapter',
        title: `${manga.displayTitle || manga.name || ''} ${chapter.name || ''}`.trim(),
        body: [
          manga.displayTitle,
          chapter.name,
          chapter.comicInfo?.summary
        ]
          .map((value) => String(value || '').trim())
          .filter(Boolean)
          .join('\n')
      });
    }
  }
  return documents;
}

function normalizeSearchDocument(doc = {}) {
  return {
    id: String(doc.id || '').trim(),
    itemContentId: doc.itemContentId ? String(doc.itemContentId).trim() : null,
    itemLocationId: doc.itemLocationId ? String(doc.itemLocationId).trim() : null,
    docType: String(doc.docType || 'manga').trim() || 'manga',
    title: String(doc.title || '').trim(),
    body: String(doc.body || '').trim(),
    updatedAt: doc.updatedAt || nowIso()
  };
}

function replaceSearchDocuments(baseDocuments = [], preservedDocuments = []) {
  const normalizedBase = baseDocuments.map(normalizeSearchDocument).filter((doc) => doc.id);
  const normalizedPreserved = preservedDocuments.map(normalizeSearchDocument).filter((doc) => doc.id);

  if (!hasNativeStore()) {
    memoryStore.searchDocuments = [...normalizedBase, ...normalizedPreserved];
    return;
  }

  const db = getDatabase();
  const allDocuments = [...normalizedBase, ...normalizedPreserved];
  const replaceDocs = db.transaction(() => {
    db.prepare('DELETE FROM search_documents').run();
    db.prepare('DELETE FROM search_documents_fts').run();

    const insertDoc = db.prepare(`
      INSERT INTO search_documents (id, item_content_id, item_location_id, doc_type, title, body, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertFts = db.prepare(`
      INSERT INTO search_documents_fts (id, title, body)
      VALUES (?, ?, ?)
    `);

    for (const doc of allDocuments) {
      insertDoc.run(doc.id, doc.itemContentId, doc.itemLocationId, doc.docType, doc.title, doc.body, doc.updatedAt);
      insertFts.run(doc.id, doc.title, doc.body);
    }
  });

  replaceDocs();
}

function listStoredOcrSearchDocuments() {
  if (!hasNativeStore()) {
    return memoryStore.searchDocuments.filter((doc) => doc.docType === 'ocr');
  }

  const db = getDatabase();
  return db.prepare(`
    SELECT id, item_content_id, item_location_id, doc_type, title, body, updated_at
    FROM search_documents
    WHERE doc_type = 'ocr'
  `).all().map((row) => ({
    id: row.id,
    itemContentId: row.item_content_id,
    itemLocationId: row.item_location_id,
    docType: row.doc_type,
    title: row.title,
    body: row.body,
    updatedAt: row.updated_at
  }));
}

function syncLibrarySnapshotInner(library, options = {}) {
  const snapshot = {
    updatedAt: nowIso(),
    library
  };

  if (!hasNativeStore()) {
    memoryStore.snapshot = snapshot;
    const preservedOcrDocs = memoryStore.searchDocuments.filter((doc) => doc.docType === 'ocr');
    memoryStore.searchDocuments = [
      ...buildSearchDocuments(library, options).map((doc) => ({ ...doc, updatedAt: snapshot.updatedAt })),
      ...preservedOcrDocs
    ];
    return {
      ok: true,
      backend: 'memory',
      updatedAt: snapshot.updatedAt,
      itemCount: flattenLibraryItems(library).length
    };
  }

  const db = getDatabase();
  const rows = flattenLibraryItems(library);
  const documents = buildSearchDocuments(library, options).map((doc) => ({ ...doc, updatedAt: snapshot.updatedAt }));
  const preservedOcrDocs = listStoredOcrSearchDocuments();
  const writeSnapshot = db.transaction(() => {
    db.prepare(`
      INSERT INTO library_snapshot (id, updated_at, payload_json)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, payload_json = excluded.payload_json
    `).run(snapshot.updatedAt, JSON.stringify(snapshot.library));

    db.prepare('DELETE FROM library_items').run();
    db.prepare('DELETE FROM pages').run();

    const insertItem = db.prepare(`
      INSERT INTO library_items (
        location_id, content_id, legacy_id, type, title, path, category_id, manga_content_id,
        container_type, source_type, health_status, updated_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const row of rows) {
      insertItem.run(
        row.locationId,
        row.contentId,
        row.legacyId,
        row.type,
        row.title,
        row.path,
        row.categoryId,
        row.mangaContentId,
        row.containerType,
        row.sourceType,
        row.healthStatus,
        snapshot.updatedAt,
        JSON.stringify(row.payload)
      );
    }
  });

  writeSnapshot();
  replaceSearchDocuments(documents, preservedOcrDocs);
  return {
    ok: true,
    backend: 'sqlite',
    updatedAt: snapshot.updatedAt,
    itemCount: rows.length
  };
}

function syncLibrarySnapshot(library, options = {}) {
  return measureSync('derived.syncLibrarySnapshot', () => syncLibrarySnapshotInner(library, options), {
    mangaCount: Array.isArray(library?.allMangas) ? library.allMangas.length : 0,
    payload: library
  });
}

function upsertLibraryRows(db, rows, updatedAt) {
  const upsertItem = db.prepare(`
    INSERT INTO library_items (
      location_id, content_id, legacy_id, type, title, path, category_id, manga_content_id,
      container_type, source_type, health_status, updated_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(location_id) DO UPDATE SET
      content_id = excluded.content_id,
      legacy_id = excluded.legacy_id,
      type = excluded.type,
      title = excluded.title,
      path = excluded.path,
      category_id = excluded.category_id,
      manga_content_id = excluded.manga_content_id,
      container_type = excluded.container_type,
      source_type = excluded.source_type,
      health_status = excluded.health_status,
      updated_at = excluded.updated_at,
      payload_json = excluded.payload_json
  `);

  for (const row of rows) {
    upsertItem.run(
      row.locationId,
      row.contentId,
      row.legacyId,
      row.type,
      row.title,
      row.path,
      row.categoryId,
      row.mangaContentId,
      row.containerType,
      row.sourceType,
      row.healthStatus,
      updatedAt,
      JSON.stringify(row.payload)
    );
  }
}

function patchLibrarySnapshotInner(library, options = {}) {
  const snapshot = {
    updatedAt: nowIso(),
    library
  };
  const rows = flattenLibraryItems(library);
  const documents = buildSearchDocuments(library, options).map((doc) => ({ ...doc, updatedAt: snapshot.updatedAt }));

  if (!hasNativeStore()) {
    memoryStore.snapshot = snapshot;
    for (const doc of documents) upsertSearchDocument(doc);
    return {
      ok: true,
      mode: 'patch',
      backend: 'memory',
      updatedAt: snapshot.updatedAt,
      itemCount: rows.length
    };
  }

  const db = getDatabase();
  const writePatch = db.transaction(() => {
    db.prepare(`
      INSERT INTO library_snapshot (id, updated_at, payload_json)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, payload_json = excluded.payload_json
    `).run(snapshot.updatedAt, JSON.stringify(snapshot.library));
    upsertLibraryRows(db, rows, snapshot.updatedAt);
  });

  writePatch();
  for (const doc of documents) upsertSearchDocument(doc);
  return {
    ok: true,
    mode: 'patch',
    backend: 'sqlite',
    updatedAt: snapshot.updatedAt,
    itemCount: rows.length
  };
}

function patchLibrarySnapshot(library, options = {}) {
  return measureSync('derived.patchLibrarySnapshot', () => patchLibrarySnapshotInner(library, options), {
    mangaCount: Array.isArray(library?.allMangas) ? library.allMangas.length : 0,
    payload: library
  });
}

function readLibrarySnapshot() {
  if (!hasNativeStore()) {
    return memoryStore.snapshot?.library || null;
  }

  const db = getDatabase();
  const row = db.prepare('SELECT payload_json FROM library_snapshot WHERE id = 1').get();
  if (!row?.payload_json) return null;
  try {
    return JSON.parse(row.payload_json);
  } catch (_error) {
    return null;
  }
}

function getSnapshotMeta() {
  if (!hasNativeStore()) {
    return {
      backend: 'memory',
      dbPath: null,
      updatedAt: memoryStore.snapshot?.updatedAt || null
    };
  }

  const db = getDatabase();
  const row = db.prepare('SELECT updated_at FROM library_snapshot WHERE id = 1').get();
  return {
    backend: 'sqlite',
    dbPath: getDerivedDbPath(),
    updatedAt: row?.updated_at || null
  };
}

function upsertSearchDocument(doc = {}) {
  const normalized = normalizeSearchDocument(doc);
  if (!normalized.id) {
    throw new Error('Search document id is required');
  }

  if (!hasNativeStore()) {
    memoryStore.searchDocuments = memoryStore.searchDocuments.filter((entry) => entry.id !== normalized.id);
    memoryStore.searchDocuments.push(normalized);
    return normalized;
  }

  const db = getDatabase();
  db.prepare(`
    INSERT INTO search_documents (id, item_content_id, item_location_id, doc_type, title, body, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      item_content_id = excluded.item_content_id,
      item_location_id = excluded.item_location_id,
      doc_type = excluded.doc_type,
      title = excluded.title,
      body = excluded.body,
      updated_at = excluded.updated_at
  `).run(
    normalized.id,
    normalized.itemContentId,
    normalized.itemLocationId,
    normalized.docType,
    normalized.title,
    normalized.body,
    normalized.updatedAt
  );
  db.prepare('DELETE FROM search_documents_fts WHERE id = ?').run(normalized.id);
  db.prepare(`
    INSERT INTO search_documents_fts (id, title, body)
    VALUES (?, ?, ?)
  `).run(normalized.id, normalized.title, normalized.body);
  return normalized;
}

function removeSearchDocument(docId) {
  const normalizedId = String(docId || '').trim();
  if (!normalizedId) return;

  if (!hasNativeStore()) {
    memoryStore.searchDocuments = memoryStore.searchDocuments.filter((entry) => entry.id !== normalizedId);
    return;
  }

  const db = getDatabase();
  db.prepare('DELETE FROM search_documents WHERE id = ?').run(normalizedId);
  db.prepare('DELETE FROM search_documents_fts WHERE id = ?').run(normalizedId);
}

function upsertJob(job) {
  const normalized = {
    id: String(job?.id || '').trim(),
    kind: String(job?.kind || '').trim(),
    priority: Number.isFinite(Number(job?.priority)) ? Number(job.priority) : 0,
    lane: String(job?.lane || '').trim() || 'scanAnalyze',
    status: String(job?.status || '').trim() || 'queued',
    payload: job?.payload && typeof job.payload === 'object' ? job.payload : {},
    progress: job?.progress && typeof job.progress === 'object' ? job.progress : {},
    attempt: Number.isFinite(Number(job?.attempt)) ? Number(job.attempt) : 0,
    requeueable: job?.requeueable === undefined ? true : Boolean(job.requeueable),
    createdAt: job?.createdAt || nowIso(),
    updatedAt: job?.updatedAt || nowIso(),
    startedAt: job?.startedAt || null,
    endedAt: job?.endedAt || null,
    lastError: job?.lastError ? String(job.lastError) : null
  };

  if (!normalized.id || !normalized.kind) {
    throw new Error('Invalid job payload');
  }

  if (!hasNativeStore()) {
    memoryStore.jobs.set(normalized.id, normalized);
    return normalized;
  }

  const db = getDatabase();
  db.prepare(`
    INSERT INTO jobs (
      id, kind, priority, lane, status, payload_json, progress_json, attempt, requeueable,
      created_at, updated_at, started_at, ended_at, last_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      kind = excluded.kind,
      priority = excluded.priority,
      lane = excluded.lane,
      status = excluded.status,
      payload_json = excluded.payload_json,
      progress_json = excluded.progress_json,
      attempt = excluded.attempt,
      requeueable = excluded.requeueable,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      started_at = excluded.started_at,
      ended_at = excluded.ended_at,
      last_error = excluded.last_error
  `).run(
    normalized.id,
    normalized.kind,
    normalized.priority,
    normalized.lane,
    normalized.status,
    JSON.stringify(normalized.payload),
    JSON.stringify(normalized.progress),
    normalized.attempt,
    normalized.requeueable ? 1 : 0,
    normalized.createdAt,
    normalized.updatedAt,
    normalized.startedAt,
    normalized.endedAt,
    normalized.lastError
  );
  return normalized;
}

function listJobs() {
  if (!hasNativeStore()) {
    return [...memoryStore.jobs.values()]
      .sort((left, right) => {
        if (left.priority !== right.priority) return right.priority - left.priority;
        return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      });
  }

  const db = getDatabase();
  return db.prepare(`
    SELECT id, kind, priority, lane, status, payload_json, progress_json, attempt, requeueable,
           created_at, updated_at, started_at, ended_at, last_error
    FROM jobs
    ORDER BY priority DESC, datetime(created_at) ASC
  `).all().map((row) => ({
    id: row.id,
    kind: row.kind,
    priority: row.priority,
    lane: row.lane,
    status: row.status,
    payload: JSON.parse(row.payload_json || '{}'),
    progress: JSON.parse(row.progress_json || '{}'),
    attempt: row.attempt,
    requeueable: Boolean(row.requeueable),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    lastError: row.last_error
  }));
}

function getJob(jobId) {
  return listJobs().find((job) => job.id === jobId) || null;
}

function removeJob(jobId) {
  if (!hasNativeStore()) {
    memoryStore.jobs.delete(jobId);
    return;
  }
  const db = getDatabase();
  db.prepare('DELETE FROM jobs WHERE id = ?').run(jobId);
}

function markRunningJobsInterrupted() {
  const jobs = listJobs();
  const interrupted = [];
  for (const job of jobs) {
    if (job.status !== 'running') continue;
    const next = upsertJob({
      ...job,
      status: 'interrupted',
      updatedAt: nowIso(),
      endedAt: nowIso(),
      lastError: 'Interrupted during previous shutdown'
    });
    interrupted.push(next);
  }
  return interrupted;
}

function upsertOcrPage(input = {}) {
  const normalized = {
    id: String(input.id || '').trim(),
    itemContentId: input.itemContentId ? String(input.itemContentId).trim() : null,
    itemLocationId: input.itemLocationId ? String(input.itemLocationId).trim() : null,
    pageRef: String(input.pageRef || '').trim(),
    langCodes: Array.isArray(input.langCodes) ? input.langCodes.map((value) => String(value || '').trim()).filter(Boolean) : [],
    textBody: String(input.textBody || '').trim(),
    title: String(input.title || '').trim() || 'OCR local',
    updatedAt: input.updatedAt || nowIso()
  };

  if (!normalized.id || !normalized.pageRef) {
    throw new Error('OCR page id and pageRef are required');
  }

  if (!hasNativeStore()) {
    memoryStore.ocrPages.set(normalized.id, normalized);
  } else {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO ocr_pages (id, item_content_id, item_location_id, page_ref, lang_codes, text_body, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        item_content_id = excluded.item_content_id,
        item_location_id = excluded.item_location_id,
        page_ref = excluded.page_ref,
        lang_codes = excluded.lang_codes,
        text_body = excluded.text_body,
        updated_at = excluded.updated_at
    `).run(
      normalized.id,
      normalized.itemContentId,
      normalized.itemLocationId,
      normalized.pageRef,
      JSON.stringify(normalized.langCodes),
      normalized.textBody,
      normalized.updatedAt
    );
  }

  upsertSearchDocument({
    id: `ocr:${normalized.id}`,
    itemContentId: normalized.itemContentId,
    itemLocationId: normalized.itemLocationId,
    docType: 'ocr',
    title: normalized.title,
    body: normalized.textBody,
    updatedAt: normalized.updatedAt
  });

  return normalized;
}

function listOcrPages(itemReference = null) {
  const normalizedReference = String(itemReference || '').trim();

  if (!hasNativeStore()) {
    return [...memoryStore.ocrPages.values()].filter((entry) => (
      !normalizedReference
      || entry.itemContentId === normalizedReference
      || entry.itemLocationId === normalizedReference
    ));
  }

  const db = getDatabase();
  const rows = normalizedReference
    ? db.prepare(`
      SELECT id, item_content_id, item_location_id, page_ref, lang_codes, text_body, updated_at
      FROM ocr_pages
      WHERE item_content_id = ? OR item_location_id = ?
      ORDER BY updated_at DESC
    `).all(normalizedReference, normalizedReference)
    : db.prepare(`
      SELECT id, item_content_id, item_location_id, page_ref, lang_codes, text_body, updated_at
      FROM ocr_pages
      ORDER BY updated_at DESC
    `).all();

  return rows.map((row) => ({
    id: row.id,
    itemContentId: row.item_content_id,
    itemLocationId: row.item_location_id,
    pageRef: row.page_ref,
    langCodes: JSON.parse(row.lang_codes || '[]'),
    textBody: row.text_body,
    updatedAt: row.updated_at
  }));
}

function countOcrPages(itemReference = null) {
  const normalizedReference = String(itemReference || '').trim();

  if (!hasNativeStore()) {
    return listOcrPages(normalizedReference).length;
  }

  const db = getDatabase();
  const row = normalizedReference
    ? db.prepare(`
      SELECT COUNT(*) AS count
      FROM ocr_pages
      WHERE item_content_id = ? OR item_location_id = ?
    `).get(normalizedReference, normalizedReference)
    : db.prepare('SELECT COUNT(*) AS count FROM ocr_pages').get();

  return Number(row?.count || 0);
}

function clearOcrData() {
  if (!hasNativeStore()) {
    memoryStore.ocrPages.clear();
    memoryStore.searchDocuments = memoryStore.searchDocuments.filter((entry) => entry.docType !== 'ocr');
    return { ok: true, backend: 'memory' };
  }

  const db = getDatabase();
  const purge = db.transaction(() => {
    db.prepare('DELETE FROM ocr_pages').run();
    const ocrIds = db.prepare(`SELECT id FROM search_documents WHERE doc_type = 'ocr'`).all();
    db.prepare(`DELETE FROM search_documents WHERE doc_type = 'ocr'`).run();
    const deleteFts = db.prepare('DELETE FROM search_documents_fts WHERE id = ?');
    ocrIds.forEach((row) => deleteFts.run(row.id));
  });
  purge();
  return { ok: true, backend: 'sqlite' };
}

function upsertVisualHash(input = {}) {
  const normalized = {
    id: String(input.id || input.itemContentId || input.itemLocationId || '').trim(),
    itemContentId: input.itemContentId ? String(input.itemContentId).trim() : null,
    itemLocationId: input.itemLocationId ? String(input.itemLocationId).trim() : null,
    hash: String(input.hash || '').trim(),
    source: String(input.source || '').trim() || 'cover',
    updatedAt: input.updatedAt || nowIso()
  };

  if (!normalized.id || !normalized.hash) {
    throw new Error('Visual hash id and hash are required');
  }

  if (!hasNativeStore()) {
    memoryStore.visualHashes.set(normalized.id, normalized);
    return normalized;
  }

  const db = getDatabase();
  db.prepare(`
    INSERT INTO visual_hashes (id, item_content_id, item_location_id, hash, source, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      item_content_id = excluded.item_content_id,
      item_location_id = excluded.item_location_id,
      hash = excluded.hash,
      source = excluded.source,
      updated_at = excluded.updated_at
  `).run(
    normalized.id,
    normalized.itemContentId,
    normalized.itemLocationId,
    normalized.hash,
    normalized.source,
    normalized.updatedAt
  );
  return normalized;
}

function listVisualHashes() {
  if (!hasNativeStore()) {
    return [...memoryStore.visualHashes.values()];
  }

  const db = getDatabase();
  return db.prepare(`
    SELECT id, item_content_id, item_location_id, hash, source, updated_at
    FROM visual_hashes
    ORDER BY updated_at DESC
  `).all().map((row) => ({
    id: row.id,
    itemContentId: row.item_content_id,
    itemLocationId: row.item_location_id,
    hash: row.hash,
    source: row.source,
    updatedAt: row.updated_at
  }));
}

function searchDocuments(query, limit = 50) {
  const needle = String(query || '').trim();
  if (!needle) return [];

  if (!hasNativeStore()) {
    const lowered = needle.toLowerCase();
    return memoryStore.searchDocuments
      .filter((doc) => `${doc.title}\n${doc.body}`.toLowerCase().includes(lowered))
      .slice(0, Math.max(1, limit));
  }

  const db = getDatabase();
  try {
    return db.prepare(`
      SELECT fts.id, docs.item_content_id, docs.item_location_id, docs.doc_type, docs.title, docs.body
      FROM search_documents_fts AS fts
      JOIN search_documents AS docs ON docs.id = fts.id
      WHERE search_documents_fts MATCH ?
      LIMIT ?
    `).all(needle, Math.max(1, limit)).map((row) => ({
      id: row.id,
      itemContentId: row.item_content_id,
      itemLocationId: row.item_location_id,
      docType: row.doc_type,
      title: row.title,
      body: row.body
    }));
  } catch (_error) {
    const fallbackNeedle = needle.toLowerCase();
    return db.prepare(`
      SELECT id, item_content_id, item_location_id, doc_type, title, body
      FROM search_documents
      WHERE lower(title || ' ' || body) LIKE ?
      LIMIT ?
    `).all(`%${fallbackNeedle}%`, Math.max(1, limit)).map((row) => ({
      id: row.id,
      itemContentId: row.item_content_id,
      itemLocationId: row.item_location_id,
      docType: row.doc_type,
      title: row.title,
      body: row.body
    }));
  }
}

function closeDerivedStore() {
  if (database) {
    try {
      database.close();
    } catch (_error) {
      // noop
    }
    database = null;
  }
}

module.exports = {
  SCHEMA_VERSION,
  hasNativeStore,
  getDatabase,
  getSnapshotMeta,
  syncLibrarySnapshot,
  patchLibrarySnapshot,
  readLibrarySnapshot,
  upsertSearchDocument,
  removeSearchDocument,
  upsertJob,
  listJobs,
  getJob,
  removeJob,
  markRunningJobsInterrupted,
  upsertOcrPage,
  listOcrPages,
  countOcrPages,
  clearOcrData,
  upsertVisualHash,
  listVisualHashes,
  searchDocuments,
  closeDerivedStore
};

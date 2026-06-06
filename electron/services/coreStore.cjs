const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  getStateDir
} = require('./storage.cjs');

let Database = null;
try {
  Database = require('better-sqlite3');
} catch (_error) {
  Database = null;
}

const CORE_SCHEMA_VERSION = 1;
const CORE_DB_FILE = 'sawa-core-v2.db';

let singletonStore = null;

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function getCoreDbPath() {
  return path.join(getStateDir(), CORE_DB_FILE);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function json(value) {
  return JSON.stringify(value ?? null);
}

function parseJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function hashSnapshot(input) {
  return crypto.createHash('sha256').update(json(input)).digest('hex');
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeId(...candidates) {
  for (const candidate of candidates) {
    const value = normalizeText(candidate);
    if (value) return value;
  }
  return `core-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function countObjectKeys(value) {
  return Object.keys(asObject(value)).length;
}

function getLibraryCategories(persistedState, library) {
  const byId = new Map();
  for (const category of asArray(persistedState?.categories)) {
    if (!category?.id) continue;
    byId.set(category.id, {
      id: String(category.id),
      name: category.name || path.basename(category.path || '') || 'Bibliotheque',
      path: category.path || '',
      hidden: Boolean(category.hidden)
    });
  }
  for (const category of asArray(library?.categories)) {
    if (!category?.id) continue;
    byId.set(category.id, {
      ...(byId.get(category.id) || {}),
      id: String(category.id),
      name: category.name || byId.get(category.id)?.name || path.basename(category.path || '') || 'Bibliotheque',
      path: category.path || byId.get(category.id)?.path || '',
      hidden: Boolean(category.hidden)
    });
  }
  return Array.from(byId.values());
}

function getSeriesCollectionIds(persistedState, manga) {
  const explicit = asArray(manga?.collectionIds).map(String).filter(Boolean);
  const fromCollections = Object.values(asObject(persistedState?.collections))
    .filter((collection) => asArray(collection?.mangaIds).includes(manga?.id))
    .map((collection) => String(collection.id || ''))
    .filter(Boolean);
  return Array.from(new Set([...explicit, ...fromCollections]));
}

function getSeriesTags(persistedState, manga) {
  const byId = asObject(persistedState?.tags);
  const explicit = asArray(manga?.tags).filter((tag) => tag?.id || tag?.name);
  const explicitIds = explicit.map((tag) => String(tag.id || '')).filter(Boolean);
  const legacyIds = asArray(persistedState?.mangaTags?.[manga?.id]).map(String).filter(Boolean);
  const mergedIds = Array.from(new Set([...explicitIds, ...legacyIds]));
  const mapped = mergedIds.map((tagId) => byId[tagId] || explicit.find((tag) => tag.id === tagId) || null).filter(Boolean);
  const unnamed = explicit.filter((tag) => !tag.id || !mergedIds.includes(tag.id));
  return [...mapped, ...unnamed].map((tag) => ({
    id: normalizeId(tag.id, tag.name),
    name: normalizeText(tag.name || tag.id),
    color: tag.color || '#8b5cf6'
  }));
}

function getChapterProgress(persistedState, chapter, manga) {
  const legacyProgress = asObject(persistedState?.progress?.[chapter?.id]);
  const chapterProgress = asObject(chapter?.progress);
  const pageCount = Number(chapter?.pageCount || legacyProgress.pageCount || chapterProgress.pageCount || 0);
  const pageIndex = Number(legacyProgress.pageIndex ?? chapterProgress.pageIndex ?? 0);
  const percent = pageCount > 0 ? Math.max(0, Math.min(100, Math.round(((pageIndex + 1) / pageCount) * 100))) : 0;
  const explicitRead = Boolean(persistedState?.chapterReadStatus?.[chapter?.id] || chapter?.isRead);
  const readingState = explicitRead ? 'read' : (percent > 0 ? 'in-progress' : 'never');
  return {
    mangaId: manga?.id || legacyProgress.mangaId || null,
    chapterId: chapter?.id || legacyProgress.chapterId || null,
    pageIndex,
    pageCount,
    percent: explicitRead ? 100 : percent,
    lastReadAt: legacyProgress.lastReadAt || chapter?.lastReadAt || null,
    readingState,
    isRead: explicitRead
  };
}

function getChapterPages(chapter) {
  const explicitPages = asArray(chapter?.pages);
  if (explicitPages.length > 0) {
    return explicitPages.map((page, index) => ({
      index: Number.isFinite(Number(page.index)) ? Number(page.index) : index,
      path: page.path || page.filePath || null,
      mediaType: page.mediaType || page.type || 'image',
      payload: page
    }));
  }
  const pageFiles = asArray(chapter?.pageFiles);
  if (pageFiles.length > 0) {
    return pageFiles.map((filePath, index) => ({
      index,
      path: filePath,
      mediaType: 'image',
      payload: { index, path: filePath, mediaType: 'image' }
    }));
  }
  const pageCount = Number(chapter?.pageCount || 0);
  return Array.from({ length: Math.max(0, pageCount) }, (_value, index) => ({
    index,
    path: null,
    mediaType: 'unknown',
    payload: { index, pageNumber: index + 1, virtual: true }
  }));
}

function analyzeLegacySnapshot({ persistedState = {}, library = {} } = {}) {
  const series = asArray(library?.allMangas);
  const chapters = series.flatMap((manga) => asArray(manga?.chapters));
  const pages = chapters.flatMap(getChapterPages);
  return {
    storageVersion: persistedState?.version ?? null,
    stateVersion: persistedState?.stateVersion ?? null,
    createdAt: nowIso(),
    counts: {
      libraries: getLibraryCategories(persistedState, library).length,
      series: series.length,
      chapters: chapters.length,
      pages: pages.length,
      tags: countObjectKeys(persistedState?.tags),
      collections: countObjectKeys(persistedState?.collections),
      smartCollections: countObjectKeys(persistedState?.smartCollections),
      progress: countObjectKeys(persistedState?.progress),
      recents: asArray(persistedState?.recents).length,
      metadata: countObjectKeys(persistedState?.metadata),
      annotations: Object.values(asObject(persistedState?.annotations)).reduce((count, items) => count + asArray(items).length, 0),
      privateManga: asArray(persistedState?.vault?.privateMangaIds).length,
      privateCategories: asArray(persistedState?.vault?.privateCategoryIds).length,
      sources: countObjectKeys(persistedState?.plugins?.enabled),
      readerPrefs: countObjectKeys(persistedState?.readerPrefs)
    }
  };
}

function initializeSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS core_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS migration_manifest (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      source_storage_version INTEGER,
      source_state_version INTEGER,
      source_hash TEXT,
      backup_path TEXT,
      report_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS libraries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT,
      hidden INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS series (
      id TEXT PRIMARY KEY,
      content_id TEXT,
      location_id TEXT,
      legacy_id TEXT,
      library_id TEXT,
      title TEXT NOT NULL,
      sort_title TEXT NOT NULL,
      author TEXT,
      description TEXT,
      path TEXT,
      cover_src TEXT,
      page_count INTEGER NOT NULL DEFAULT 0,
      chapter_count INTEGER NOT NULL DEFAULT 0,
      favorite INTEGER NOT NULL DEFAULT 0,
      read_state TEXT NOT NULL DEFAULT 'never',
      progress_percent INTEGER NOT NULL DEFAULT 0,
      last_read_at TEXT,
      metadata_json TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      collection_ids_json TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(library_id) REFERENCES libraries(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_series_library ON series(library_id);
    CREATE INDEX IF NOT EXISTS idx_series_title ON series(sort_title);

    CREATE TABLE IF NOT EXISTS volumes (
      id TEXT PRIMARY KEY,
      series_id TEXT NOT NULL,
      number_text TEXT,
      title TEXT,
      payload_json TEXT NOT NULL,
      FOREIGN KEY(series_id) REFERENCES series(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      series_id TEXT NOT NULL,
      volume_id TEXT,
      content_id TEXT,
      location_id TEXT,
      legacy_id TEXT,
      title TEXT NOT NULL,
      path TEXT,
      number_text TEXT,
      page_count INTEGER NOT NULL DEFAULT 0,
      read_state TEXT NOT NULL DEFAULT 'never',
      progress_percent INTEGER NOT NULL DEFAULT 0,
      last_read_at TEXT,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(series_id) REFERENCES series(id) ON DELETE CASCADE,
      FOREIGN KEY(volume_id) REFERENCES volumes(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chapters_series ON chapters(series_id);

    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      page_index INTEGER NOT NULL,
      path TEXT,
      media_type TEXT,
      payload_json TEXT NOT NULL,
      FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_pages_chapter ON pages(chapter_id, page_index);

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS series_tags (
      series_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY(series_id, tag_id),
      FOREIGN KEY(series_id) REFERENCES series(id) ON DELETE CASCADE,
      FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collection_series (
      collection_id TEXT NOT NULL,
      series_id TEXT NOT NULL,
      PRIMARY KEY(collection_id, series_id),
      FOREIGN KEY(collection_id) REFERENCES collections(id) ON DELETE CASCADE,
      FOREIGN KEY(series_id) REFERENCES series(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS smart_filters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rules_json TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reading_progress (
      chapter_id TEXT PRIMARY KEY,
      series_id TEXT NOT NULL,
      page_index INTEGER NOT NULL DEFAULT 0,
      page_count INTEGER NOT NULL DEFAULT 0,
      percent INTEGER NOT NULL DEFAULT 0,
      last_read_at TEXT,
      payload_json TEXT NOT NULL,
      FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
      FOREIGN KEY(series_id) REFERENCES series(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY,
      series_id TEXT NOT NULL,
      chapter_id TEXT,
      page_index INTEGER,
      text TEXT,
      payload_json TEXT NOT NULL,
      FOREIGN KEY(series_id) REFERENCES series(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS search_documents (
      id TEXT PRIMARY KEY,
      series_id TEXT,
      chapter_id TEXT,
      doc_type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS search_documents_fts USING fts5(
      id UNINDEXED,
      title,
      body
    );
  `);

  db.prepare(`
    INSERT INTO core_meta (key, value)
    VALUES ('schema_version', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(CORE_SCHEMA_VERSION));
}

function rowToSeries(row) {
  if (!row) return null;
  return {
    id: row.id,
    contentId: row.content_id || null,
    locationId: row.location_id || null,
    legacyId: row.legacy_id || null,
    libraryId: row.library_id || null,
    title: row.title,
    sortTitle: row.sort_title,
    author: row.author || '',
    description: row.description || '',
    path: row.path || null,
    coverSrc: row.cover_src || null,
    pageCount: Number(row.page_count || 0),
    chapterCount: Number(row.chapter_count || 0),
    favorite: Boolean(row.favorite),
    readState: row.read_state || 'never',
    progressPercent: Number(row.progress_percent || 0),
    lastReadAt: row.last_read_at || null,
    metadata: parseJson(row.metadata_json, {}),
    tags: parseJson(row.tags_json, []),
    collectionIds: parseJson(row.collection_ids_json, []),
    payload: parseJson(row.payload_json, {})
  };
}

function rowToChapter(row) {
  if (!row) return null;
  return {
    id: row.id,
    seriesId: row.series_id,
    volumeId: row.volume_id || null,
    contentId: row.content_id || null,
    locationId: row.location_id || null,
    legacyId: row.legacy_id || null,
    title: row.title,
    path: row.path || null,
    numberText: row.number_text || '',
    pageCount: Number(row.page_count || 0),
    readState: row.read_state || 'never',
    progressPercent: Number(row.progress_percent || 0),
    lastReadAt: row.last_read_at || null,
    payload: parseJson(row.payload_json, {})
  };
}

function normalizeLimit(value, fallback = 50) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.min(500, Math.floor(number)));
}

function normalizeOffset(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.floor(number));
}

function createSqliteCoreStore(db, dbPath) {
  const selectSeriesRows = () => db.prepare('SELECT * FROM series ORDER BY sort_title COLLATE NOCASE ASC').all();
  const findSeriesRow = (ref) => db.prepare(`
    SELECT * FROM series
    WHERE id = ? OR content_id = ? OR location_id = ? OR legacy_id = ?
    LIMIT 1
  `).get(ref, ref, ref, ref);
  const findChapterRow = (ref) => db.prepare(`
    SELECT * FROM chapters
    WHERE id = ? OR content_id = ? OR location_id = ? OR legacy_id = ?
    LIMIT 1
  `).get(ref, ref, ref, ref);

  function clearAll() {
    db.exec(`
      DELETE FROM search_documents_fts;
      DELETE FROM search_documents;
      DELETE FROM annotations;
      DELETE FROM reading_progress;
      DELETE FROM smart_filters;
      DELETE FROM collection_series;
      DELETE FROM collections;
      DELETE FROM series_tags;
      DELETE FROM tags;
      DELETE FROM pages;
      DELETE FROM chapters;
      DELETE FROM volumes;
      DELETE FROM series;
      DELETE FROM libraries;
    `);
  }

  function migrateLegacySnapshot(input = {}) {
    const persistedState = asObject(input.persistedState);
    const library = asObject(input.library);
    const report = analyzeLegacySnapshot({ persistedState, library });
    const migrationId = normalizeId(input.migrationId, `migration-${Date.now()}`);
    const createdAt = nowIso();
    const sourceHash = input.sourceHash || hashSnapshot({ persistedState, library });

    const runMigration = db.transaction(() => {
      clearAll();
      const insertLibrary = db.prepare(`
        INSERT INTO libraries (id, name, path, hidden, payload_json, created_at, updated_at)
        VALUES (@id, @name, @path, @hidden, @payload, @createdAt, @updatedAt)
      `);
      const insertSeries = db.prepare(`
        INSERT INTO series (
          id, content_id, location_id, legacy_id, library_id, title, sort_title, author, description,
          path, cover_src, page_count, chapter_count, favorite, read_state, progress_percent, last_read_at,
          metadata_json, tags_json, collection_ids_json, payload_json, updated_at
        )
        VALUES (
          @id, @contentId, @locationId, @legacyId, @libraryId, @title, @sortTitle, @author, @description,
          @path, @coverSrc, @pageCount, @chapterCount, @favorite, @readState, @progressPercent, @lastReadAt,
          @metadata, @tags, @collectionIds, @payload, @updatedAt
        )
      `);
      const insertChapter = db.prepare(`
        INSERT INTO chapters (
          id, series_id, volume_id, content_id, location_id, legacy_id, title, path, number_text,
          page_count, read_state, progress_percent, last_read_at, payload_json, updated_at
        )
        VALUES (
          @id, @seriesId, @volumeId, @contentId, @locationId, @legacyId, @title, @path, @numberText,
          @pageCount, @readState, @progressPercent, @lastReadAt, @payload, @updatedAt
        )
      `);
      const insertPage = db.prepare(`
        INSERT INTO pages (id, chapter_id, page_index, path, media_type, payload_json)
        VALUES (@id, @chapterId, @pageIndex, @path, @mediaType, @payload)
      `);
      const insertTag = db.prepare(`
        INSERT INTO tags (id, name, color, payload_json)
        VALUES (@id, @name, @color, @payload)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color, payload_json = excluded.payload_json
      `);
      const insertSeriesTag = db.prepare(`
        INSERT OR IGNORE INTO series_tags (series_id, tag_id)
        VALUES (?, ?)
      `);
      const insertCollection = db.prepare(`
        INSERT INTO collections (id, name, description, color, payload_json)
        VALUES (@id, @name, @description, @color, @payload)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          color = excluded.color,
          payload_json = excluded.payload_json
      `);
      const insertCollectionSeries = db.prepare(`
        INSERT OR IGNORE INTO collection_series (collection_id, series_id)
        VALUES (?, ?)
      `);
      const insertSmartFilter = db.prepare(`
        INSERT INTO smart_filters (id, name, rules_json, payload_json)
        VALUES (@id, @name, @rules, @payload)
      `);
      const insertProgress = db.prepare(`
        INSERT INTO reading_progress (chapter_id, series_id, page_index, page_count, percent, last_read_at, payload_json)
        VALUES (@chapterId, @seriesId, @pageIndex, @pageCount, @percent, @lastReadAt, @payload)
      `);
      const insertAnnotation = db.prepare(`
        INSERT INTO annotations (id, series_id, chapter_id, page_index, text, payload_json)
        VALUES (@id, @seriesId, @chapterId, @pageIndex, @text, @payload)
      `);
      const insertDocument = db.prepare(`
        INSERT INTO search_documents (id, series_id, chapter_id, doc_type, title, body, updated_at)
        VALUES (@id, @seriesId, @chapterId, @docType, @title, @body, @updatedAt)
      `);
      const insertFts = db.prepare(`
        INSERT INTO search_documents_fts (id, title, body)
        VALUES (?, ?, ?)
      `);

      for (const category of getLibraryCategories(persistedState, library)) {
        insertLibrary.run({
          id: category.id,
          name: category.name,
          path: category.path || null,
          hidden: category.hidden ? 1 : 0,
          payload: json(category),
          createdAt,
          updatedAt: createdAt
        });
      }

      for (const tag of Object.values(asObject(persistedState.tags))) {
        const id = normalizeId(tag?.id, tag?.name);
        insertTag.run({
          id,
          name: normalizeText(tag?.name || id),
          color: tag?.color || '#8b5cf6',
          payload: json({ ...tag, id })
        });
      }

      for (const collection of Object.values(asObject(persistedState.collections))) {
        const id = normalizeId(collection?.id, collection?.name);
        insertCollection.run({
          id,
          name: normalizeText(collection?.name || id),
          description: collection?.description || '',
          color: collection?.color || '#8b5cf6',
          payload: json({ ...collection, id })
        });
      }

      for (const smartFilter of Object.values(asObject(persistedState.smartCollections))) {
        const id = normalizeId(smartFilter?.id, smartFilter?.name);
        insertSmartFilter.run({
          id,
          name: normalizeText(smartFilter?.name || id),
          rules: json(smartFilter?.rules || {}),
          payload: json({ ...smartFilter, id })
        });
      }

      for (const manga of asArray(library.allMangas)) {
        const seriesId = normalizeId(manga?.id, manga?.contentId, manga?.locationId, manga?.path);
        const metadata = asObject(persistedState.metadata?.[manga?.id]);
        const title = normalizeText(metadata.title || manga?.displayTitle || manga?.name || path.basename(manga?.path || '') || seriesId);
        const tags = getSeriesTags(persistedState, manga);
        const collectionIds = getSeriesCollectionIds(persistedState, manga);
        const chapters = asArray(manga?.chapters);
        const favorite = Boolean(persistedState.favorites?.[manga?.id] || manga?.isFavorite);
        const readState = persistedState.readStatus?.[manga?.id] || manga?.readingState || (manga?.isRead ? 'read' : 'never');
        const updatedAt = nowIso();
        insertSeries.run({
          id: seriesId,
          contentId: manga?.contentId || null,
          locationId: manga?.locationId || null,
          legacyId: manga?.legacyId || manga?.id || null,
          libraryId: manga?.categoryId || null,
          title,
          sortTitle: title.toLowerCase(),
          author: metadata.author || manga?.author || '',
          description: metadata.description || manga?.description || '',
          path: manga?.path || null,
          coverSrc: manga?.coverSrc || null,
          pageCount: Number(manga?.pageCount || 0),
          chapterCount: Number(manga?.chapterCount || chapters.length),
          favorite: favorite ? 1 : 0,
          readState: readState === true ? 'read' : String(readState || 'never'),
          progressPercent: Number(manga?.progressPercent || 0),
          lastReadAt: manga?.lastReadAt || null,
          metadata: json(metadata),
          tags: json(tags),
          collectionIds: json(collectionIds),
          payload: json(manga),
          updatedAt
        });

        for (const tag of tags) {
          insertTag.run({
            id: tag.id,
            name: tag.name,
            color: tag.color,
            payload: json(tag)
          });
          insertSeriesTag.run(seriesId, tag.id);
        }

        for (const collectionId of collectionIds) {
          insertCollectionSeries.run(collectionId, seriesId);
        }

        const annotationList = asArray(persistedState.annotations?.[manga?.id]);
        for (const [index, annotation] of annotationList.entries()) {
          insertAnnotation.run({
            id: normalizeId(annotation?.id, `${seriesId}-annotation-${index}`),
            seriesId,
            chapterId: annotation?.chapterId || null,
            pageIndex: Number.isFinite(Number(annotation?.pageIndex)) ? Number(annotation.pageIndex) : null,
            text: annotation?.text || annotation?.note || '',
            payload: json(annotation)
          });
        }

        const seriesBody = [
          title,
          metadata.author || manga?.author,
          metadata.description || manga?.description,
          ...tags.map((tag) => tag.name),
          ...annotationList.map((annotation) => annotation?.text || annotation?.note)
        ].map(normalizeText).filter(Boolean).join('\n');
        insertDocument.run({
          id: `series:${seriesId}`,
          seriesId,
          chapterId: null,
          docType: 'series',
          title,
          body: seriesBody,
          updatedAt
        });
        insertFts.run(`series:${seriesId}`, title, seriesBody);

        for (const chapter of chapters) {
          const chapterId = normalizeId(chapter?.id, chapter?.contentId, chapter?.locationId, chapter?.path);
          const progress = getChapterProgress(persistedState, chapter, manga);
          const chapterTitle = normalizeText(chapter?.name || chapter?.title || path.basename(chapter?.path || '') || chapterId);
          insertChapter.run({
            id: chapterId,
            seriesId,
            volumeId: null,
            contentId: chapter?.contentId || null,
            locationId: chapter?.locationId || null,
            legacyId: chapter?.legacyId || chapter?.id || null,
            title: chapterTitle,
            path: chapter?.path || null,
            numberText: chapter?.number || chapter?.chapterNumber || '',
            pageCount: Number(chapter?.pageCount || progress.pageCount || 0),
            readState: progress.readingState,
            progressPercent: progress.percent,
            lastReadAt: progress.lastReadAt,
            payload: json(chapter),
            updatedAt
          });
          insertProgress.run({
            chapterId,
            seriesId,
            pageIndex: progress.pageIndex,
            pageCount: progress.pageCount,
            percent: progress.percent,
            lastReadAt: progress.lastReadAt,
            payload: json(progress)
          });
          const pages = getChapterPages(chapter);
          for (const page of pages) {
            insertPage.run({
              id: `${chapterId}:${page.index}`,
              chapterId,
              pageIndex: page.index,
              path: page.path,
              mediaType: page.mediaType,
              payload: json(page.payload)
            });
          }

          const chapterBody = [title, chapterTitle, chapter?.comicInfo?.summary].map(normalizeText).filter(Boolean).join('\n');
          insertDocument.run({
            id: `chapter:${chapterId}`,
            seriesId,
            chapterId,
            docType: 'chapter',
            title: chapterTitle,
            body: chapterBody,
            updatedAt
          });
          insertFts.run(`chapter:${chapterId}`, chapterTitle, chapterBody);
        }
      }

      if (typeof input.beforeCommit === 'function') input.beforeCommit();

      db.prepare(`
        INSERT INTO migration_manifest (
          id, status, source_storage_version, source_state_version, source_hash,
          backup_path, report_json, created_at, completed_at, error
        )
        VALUES (?, 'completed', ?, ?, ?, ?, ?, ?, ?, NULL)
      `).run(
        migrationId,
        persistedState.version || null,
        persistedState.stateVersion || null,
        sourceHash,
        input.backupPath || null,
        json(report),
        createdAt,
        nowIso()
      );
    });

    runMigration();
    return { ok: true, migrationId, report, dbPath };
  }

  function getMigrationStatus() {
    const schemaVersion = db.prepare("SELECT value FROM core_meta WHERE key = 'schema_version'").get()?.value || String(CORE_SCHEMA_VERSION);
    const latest = db.prepare('SELECT * FROM migration_manifest ORDER BY completed_at DESC, created_at DESC LIMIT 1').get();
    return {
      ready: true,
      native: true,
      dbPath,
      schemaVersion: Number(schemaVersion),
      latestMigration: latest ? {
        id: latest.id,
        status: latest.status,
        backupPath: latest.backup_path || null,
        createdAt: latest.created_at,
        completedAt: latest.completed_at || null,
        report: parseJson(latest.report_json, {})
      } : null
    };
  }

  function listSeries(options = {}) {
    const query = normalizeText(options.query).toLowerCase();
    const favoriteOnly = Boolean(options.favoriteOnly);
    const tagIds = asArray(options.tagIds).map(String).filter(Boolean);
    const collectionIds = asArray(options.collectionIds).map(String).filter(Boolean);
    const limit = normalizeLimit(options.limit);
    const offset = normalizeOffset(options.offset);
    let items = selectSeriesRows().map(rowToSeries);
    if (query) {
      items = items.filter((series) => [
        series.title,
        series.author,
        series.description,
        ...asArray(series.tags).map((tag) => tag.name)
      ].some((value) => normalizeText(value).toLowerCase().includes(query)));
    }
    if (favoriteOnly) items = items.filter((series) => series.favorite);
    if (tagIds.length) items = items.filter((series) => tagIds.every((tagId) => asArray(series.tags).some((tag) => tag.id === tagId)));
    if (collectionIds.length) items = items.filter((series) => collectionIds.every((collectionId) => asArray(series.collectionIds).includes(collectionId)));
    const total = items.length;
    return { total, limit, offset, items: items.slice(offset, offset + limit) };
  }

  function getSeriesDetail(ref) {
    return rowToSeries(findSeriesRow(normalizeText(ref)));
  }

  function getSeriesChapters(ref, options = {}) {
    const series = getSeriesDetail(ref);
    if (!series) return { total: 0, items: [] };
    const limit = normalizeLimit(options.limit, 1000);
    const offset = normalizeOffset(options.offset);
    const rows = db.prepare('SELECT * FROM chapters WHERE series_id = ? ORDER BY title COLLATE NOCASE ASC').all(series.id);
    const items = rows.map(rowToChapter);
    return { total: items.length, limit, offset, items: items.slice(offset, offset + limit) };
  }

  function getChapterDetail(ref) {
    return rowToChapter(findChapterRow(normalizeText(ref)));
  }

  function getReaderPages(ref) {
    const chapter = getChapterDetail(ref);
    if (!chapter) return { chapter: null, pages: [] };
    const pages = db.prepare('SELECT * FROM pages WHERE chapter_id = ? ORDER BY page_index ASC').all(chapter.id).map((row) => ({
      id: row.id,
      chapterId: row.chapter_id,
      index: Number(row.page_index),
      path: row.path || null,
      mediaType: row.media_type || 'image',
      payload: parseJson(row.payload_json, {})
    }));
    return { chapter, pages };
  }

  function search(query, limit = 50) {
    const needle = normalizeText(query);
    if (!needle) return { query: '', results: [] };
    return {
      query: needle,
      results: listSeries({ query: needle, limit }).items.map((series) => ({
        id: series.id,
        type: 'series',
        title: series.title,
        body: [series.author, series.description].filter(Boolean).join('\n'),
        series
      }))
    };
  }

  function runSmartFilter(filter = {}) {
    const rules = filter.rules || filter;
    let options = { limit: normalizeLimit(filter.limit, 100) };
    if (rules.type === 'favorites') options.favoriteOnly = true;
    const result = listSeries(options);
    if (rules.type === 'in-progress' || rules.type === 'started') {
      result.items = result.items.filter((series) => series.readState === 'in-progress' || series.progressPercent > 0);
      result.total = result.items.length;
    } else if (rules.type === 'unread') {
      result.items = result.items.filter((series) => series.progressPercent === 0 && series.readState !== 'read');
      result.total = result.items.length;
    } else if (rules.type === 'completed') {
      result.items = result.items.filter((series) => series.readState === 'read' || series.progressPercent >= 100);
      result.total = result.items.length;
    }
    return result;
  }

  function close() {
    db.close();
  }

  return {
    dbPath,
    native: true,
    analyzeLegacySnapshot,
    migrateLegacySnapshot,
    getMigrationStatus,
    listSeries,
    getSeriesDetail,
    getSeriesChapters,
    getChapterDetail,
    getReaderPages,
    search,
    runSmartFilter,
    close
  };
}

function createMemoryCoreStore(dbPath = ':memory:', reason = 'native-sqlite-unavailable') {
  let memory = {
    manifest: null,
    libraries: [],
    series: [],
    chapters: [],
    pages: []
  };

  function migrateLegacySnapshot(input = {}) {
    const before = structuredClone(memory);
    const persistedState = asObject(input.persistedState);
    const library = asObject(input.library);
    const report = analyzeLegacySnapshot({ persistedState, library });
    const migrationId = normalizeId(input.migrationId, `migration-${Date.now()}`);
    try {
      const categories = getLibraryCategories(persistedState, library);
      const series = [];
      const chapters = [];
      const pages = [];
      for (const manga of asArray(library.allMangas)) {
        const tags = getSeriesTags(persistedState, manga);
        const collectionIds = getSeriesCollectionIds(persistedState, manga);
        const id = normalizeId(manga?.id, manga?.contentId, manga?.locationId, manga?.path);
        const metadata = asObject(persistedState.metadata?.[manga?.id]);
        series.push({
          id,
          contentId: manga?.contentId || null,
          locationId: manga?.locationId || null,
          legacyId: manga?.legacyId || manga?.id || null,
          libraryId: manga?.categoryId || null,
          title: metadata.title || manga?.displayTitle || manga?.name || id,
          author: metadata.author || manga?.author || '',
          description: metadata.description || manga?.description || '',
          path: manga?.path || null,
          pageCount: Number(manga?.pageCount || 0),
          chapterCount: Number(manga?.chapterCount || asArray(manga?.chapters).length),
          favorite: Boolean(persistedState.favorites?.[manga?.id] || manga?.isFavorite),
          readState: manga?.readingState || 'never',
          progressPercent: Number(manga?.progressPercent || 0),
          tags,
          collectionIds,
          payload: manga
        });
        for (const chapter of asArray(manga?.chapters)) {
          const progress = getChapterProgress(persistedState, chapter, manga);
          const chapterId = normalizeId(chapter?.id, chapter?.contentId, chapter?.locationId, chapter?.path);
          chapters.push({
            id: chapterId,
            seriesId: id,
            title: chapter?.name || chapter?.title || chapterId,
            pageCount: Number(chapter?.pageCount || progress.pageCount || 0),
            progressPercent: progress.percent,
            readState: progress.readingState,
            payload: chapter
          });
          for (const page of getChapterPages(chapter)) {
            pages.push({ id: `${chapterId}:${page.index}`, chapterId, ...page });
          }
        }
      }
      if (typeof input.beforeCommit === 'function') input.beforeCommit();
      memory = {
        manifest: {
          id: migrationId,
          status: 'completed',
          backupPath: input.backupPath || null,
          report,
          createdAt: nowIso(),
          completedAt: nowIso()
        },
        libraries: categories,
        series,
        chapters,
        pages
      };
      return { ok: true, migrationId, report, dbPath };
    } catch (error) {
      memory = before;
      throw error;
    }
  }

  function listSeries(options = {}) {
    const query = normalizeText(options.query).toLowerCase();
    const limit = normalizeLimit(options.limit);
    const offset = normalizeOffset(options.offset);
    let items = memory.series;
    if (query) {
      items = items.filter((series) => [
        series.title,
        series.author,
        series.description,
        ...asArray(series.tags).map((tag) => tag.name)
      ].some((value) => normalizeText(value).toLowerCase().includes(query)));
    }
    if (options.favoriteOnly) items = items.filter((series) => series.favorite);
    const total = items.length;
    return { total, limit, offset, items: items.slice(offset, offset + limit) };
  }

  function getSeriesDetail(ref) {
    const value = normalizeText(ref);
    return memory.series.find((series) => [series.id, series.contentId, series.locationId, series.legacyId].includes(value)) || null;
  }

  function getSeriesChapters(ref, options = {}) {
    const series = getSeriesDetail(ref);
    if (!series) return { total: 0, items: [] };
    const limit = normalizeLimit(options.limit, 1000);
    const offset = normalizeOffset(options.offset);
    const items = memory.chapters.filter((chapter) => chapter.seriesId === series.id);
    return { total: items.length, limit, offset, items: items.slice(offset, offset + limit) };
  }

  function getChapterDetail(ref) {
    const value = normalizeText(ref);
    return memory.chapters.find((chapter) => chapter.id === value || chapter.contentId === value || chapter.locationId === value || chapter.legacyId === value) || null;
  }

  function getReaderPages(ref) {
    const chapter = getChapterDetail(ref);
    if (!chapter) return { chapter: null, pages: [] };
    return { chapter, pages: memory.pages.filter((page) => page.chapterId === chapter.id).sort((a, b) => a.index - b.index) };
  }

  return {
    dbPath,
    native: false,
    fallbackReason: reason,
    analyzeLegacySnapshot,
    migrateLegacySnapshot,
    getMigrationStatus: () => ({
      ready: true,
      native: false,
      fallbackReason: reason,
      dbPath,
      schemaVersion: CORE_SCHEMA_VERSION,
      latestMigration: memory.manifest
    }),
    listSeries,
    getSeriesDetail,
    getSeriesChapters,
    getChapterDetail,
    getReaderPages,
    search: (query, limit = 50) => ({
      query: normalizeText(query),
      results: listSeries({ query, limit }).items.map((series) => ({ id: series.id, type: 'series', title: series.title, series }))
    }),
    runSmartFilter: (filter = {}) => listSeries({ favoriteOnly: filter?.rules?.type === 'favorites', limit: filter.limit || 100 }),
    close: () => {}
  };
}

function createCoreStore(options = {}) {
  const dbPath = options.dbPath || getCoreDbPath();
  if (!Database) return createMemoryCoreStore(dbPath);
  try {
    if (dbPath !== ':memory:') ensureDir(path.dirname(dbPath));
    const db = new Database(dbPath);
    initializeSchema(db);
    return createSqliteCoreStore(db, dbPath);
  } catch (error) {
    return createMemoryCoreStore(dbPath, error?.message || 'native-sqlite-open-failed');
  }
}

function getCoreStore() {
  if (!singletonStore) singletonStore = createCoreStore();
  return singletonStore;
}

function closeCoreStore() {
  if (singletonStore) {
    singletonStore.close();
    singletonStore = null;
  }
}

module.exports = {
  CORE_SCHEMA_VERSION,
  CORE_DB_FILE,
  analyzeLegacySnapshot,
  createCoreStore,
  getCoreStore,
  closeCoreStore,
  getCoreDbPath
};

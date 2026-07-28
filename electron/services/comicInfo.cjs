const fs = require('fs');
const path = require('path');

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeString(value) {
  const next = String(value || '').trim();
  return next || '';
}

function uniqueList(values = []) {
  const unique = new Map();
  values
    .map((value) => normalizeString(value))
    .filter(Boolean)
    .forEach((value) => {
      const key = value.toLowerCase();
      if (!unique.has(key)) unique.set(key, value);
    });
  return [...unique.values()];
}

function buildComicInfoExportRecord(manga = {}, chapter = null) {
  const tags = uniqueList((manga.tags || []).map((tag) => tag?.name || tag?.id || tag || ''));
  const chapterNumber = chapter?.number ?? chapter?.chapterNumber ?? chapter?.index ?? manga.number ?? '';
  return {
    series: manga.displayTitle || manga.name || '',
    title: chapter?.displayTitle || chapter?.name || chapter?.title || manga.displayTitle || manga.name || '',
    number: chapterNumber,
    volume: chapter?.volume ?? manga.volume ?? '',
    year: manga.year || '',
    writer: manga.author || '',
    artist: '',
    summary: manga.description || '',
    genre: tags
  };
}

function buildComicInfoXml(record = {}) {
  const fields = [
    ['Series', normalizeString(record.series || record.title)],
    ['Title', normalizeString(record.title || record.series)],
    ['Number', normalizeString(record.number)],
    ['Volume', normalizeString(record.volume)],
    ['Year', normalizeString(record.year)],
    ['Writer', normalizeString(record.writer || record.author)],
    ['Penciller', normalizeString(record.artist)],
    ['Summary', normalizeString(record.summary || record.description)],
    ['Genre', uniqueList(record.genre || record.tags || []).join(', ')]
  ].filter(([, value]) => value);

  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<ComicInfo>'
  ];

  fields.forEach(([tag, value]) => {
    lines.push(`  <${tag}>${escapeXml(value)}</${tag}>`);
  });

  lines.push('</ComicInfo>');
  return `${lines.join('\n')}\n`;
}

function writeAtomicTextFile(targetPath, text) {
  const directory = path.dirname(targetPath);
  fs.mkdirSync(directory, { recursive: true });
  const tempPath = path.join(
    directory,
    `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`
  );
  fs.writeFileSync(tempPath, text, 'utf8');
  fs.renameSync(tempPath, targetPath);
  return targetPath;
}

function writeComicInfoSidecar(targetPath, record = {}) {
  const xml = buildComicInfoXml(record);
  return {
    path: writeAtomicTextFile(targetPath, xml),
    xml
  };
}

module.exports = {
  buildComicInfoExportRecord,
  buildComicInfoXml,
  writeComicInfoSidecar
};

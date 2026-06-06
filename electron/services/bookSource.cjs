const fs = require('fs');
const path = require('path');

const {
  getChapterPages,
  isPdfFile,
  isCbzFile,
  isImageFile
} = require('./libraryScanner.cjs');
const { loadComicInfoForSource } = require('./archive.cjs');

function detectSourceKind(targetPath) {
  if (!targetPath) return 'folder';
  if (isPdfFile(targetPath)) return 'pdf';
  if (isCbzFile(targetPath)) return 'cbz';
  return 'folder';
}

function createPageProvider(sourcePath, persistedState = {}) {
  const kind = detectSourceKind(sourcePath);

  return {
    kind,
    async getPageCount() {
      return this.getPages().length;
    },
    getPages() {
      return getChapterPages(sourcePath, persistedState);
    },
    getPageDescriptor(index) {
      return this.getPages()[index] || null;
    },
    openPageAsset(index) {
      return this.getPageDescriptor(index);
    },
    getAnalysisHints() {
      const pages = this.getPages();
      return {
        pageCount: pages.length,
        probableSpreadCount: pages.filter((page) => Number(page.width || 0) > Number(page.height || 0)).length,
        imageFormats: [...new Set(
          pages
            .map((page) => path.extname(String(page.path || page.archiveEntryName || '')).toLowerCase())
            .filter(Boolean)
        )]
      };
    }
  };
}

function createBookSource(sourcePath, persistedState = {}) {
  const kind = detectSourceKind(sourcePath);
  return {
    kind,
    containerType: kind,
    async stat() {
      return fs.statSync(sourcePath);
    },
    async listChapters() {
      if (kind !== 'folder') {
        return [{ name: path.basename(sourcePath, path.extname(sourcePath)), path: sourcePath }];
      }
      return fs.readdirSync(sourcePath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() || (entry.isFile() && (isPdfFile(entry.name) || isCbzFile(entry.name) || isImageFile(entry.name))))
        .map((entry) => ({
          name: entry.isDirectory() ? entry.name : path.basename(entry.name, path.extname(entry.name)),
          path: path.join(sourcePath, entry.name)
        }));
    },
    async getPageProvider(chapterPath = sourcePath) {
      return createPageProvider(chapterPath, persistedState);
    },
    async readComicInfo() {
      return loadComicInfoForSource(sourcePath);
    },
    async dispose() {
      return undefined;
    }
  };
}

module.exports = {
  createBookSource,
  createPageProvider
};

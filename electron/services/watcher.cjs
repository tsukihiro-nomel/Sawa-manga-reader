const chokidar = require('chokidar');

class LibraryWatcher {
  constructor() {
    this.watcher = null;
    this.timer = null;
  }

  restart(paths, onChange) {
    this.close();
    const validPaths = paths.filter(Boolean);
    if (validPaths.length === 0) return;

    this.watcher = chokidar.watch(validPaths, {
      ignoreInitial: true,
      depth: 6
    });

    const debounced = () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => onChange(), 250);
    };

    this.watcher.on('add', debounced);
    this.watcher.on('addDir', debounced);
    this.watcher.on('unlink', debounced);
    this.watcher.on('unlinkDir', debounced);
    this.watcher.on('change', debounced);
  }

  close() {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}

module.exports = {
  LibraryWatcher
};

const chokidar = require('chokidar');

class LibraryWatcher {
  constructor() {
    this.watcher = null;
    this.timer = null;
    this.pending = new Map();
    this.onChange = null;
    this.startedAt = 0;
    this.settleMs = 420;
    this.startupQuietMs = 1200;
  }

  restart(paths, onChange) {
    this.close();
    const validPaths = (Array.isArray(paths) ? paths : []).filter(Boolean);
    if (validPaths.length === 0) return;

    this.onChange = typeof onChange === 'function' ? onChange : null;
    this.startedAt = Date.now();
    this.pending.clear();

    this.watcher = chokidar.watch(validPaths, {
      ignoreInitial: true,
      depth: 8,
      awaitWriteFinish: {
        stabilityThreshold: 320,
        pollInterval: 80
      }
    });

    const record = (kind, targetPath) => {
      const normalizedPath = String(targetPath || '');
      if (!normalizedPath) return;
      const key = process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath;
      const existing = this.pending.get(key) || {
        path: normalizedPath,
        kinds: new Set(),
        firstEventAt: Date.now(),
        lastEventAt: 0
      };
      existing.path = normalizedPath;
      existing.kinds.add(kind);
      existing.lastEventAt = Date.now();
      this.pending.set(key, existing);
      this.scheduleFlush();
    };

    this.watcher.on('add', (targetPath) => record('add', targetPath));
    this.watcher.on('addDir', (targetPath) => record('addDir', targetPath));
    this.watcher.on('unlink', (targetPath) => record('unlink', targetPath));
    this.watcher.on('unlinkDir', (targetPath) => record('unlinkDir', targetPath));
    this.watcher.on('change', (targetPath) => record('change', targetPath));
    this.watcher.on('error', () => this.scheduleFlush());
  }

  scheduleFlush() {
    clearTimeout(this.timer);
    const inStartupWindow = (Date.now() - this.startedAt) < this.startupQuietMs;
    const delay = inStartupWindow ? Math.max(this.settleMs, 900) : this.settleMs;
    this.timer = setTimeout(() => this.flush(), delay);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.onChange) return;

    const events = [...this.pending.values()].map((entry) => ({
      path: entry.path,
      kinds: [...entry.kinds].sort(),
      firstEventAt: entry.firstEventAt,
      lastEventAt: entry.lastEventAt
    }));
    this.pending.clear();
    this.onChange(events);
  }

  close() {
    clearTimeout(this.timer);
    this.timer = null;
    this.pending.clear();
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}

module.exports = {
  LibraryWatcher
};

// Spawns the silent NSIS backend and tails its log. The React installer only
// sees structured events; all Windows/NSIS details stay in this process.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { runElevated } = require('./elevate.cjs');
const {
  buildBackendArgs,
  normalizeInstallOptions,
} = require('./installOptions.cjs');

function timestamp() {
  const d = new Date();
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${m}:${s}`;
}

function createTempLog(runId) {
  const tmp = os.tmpdir();
  const file = path.join(tmp, `sawa-setup-${runId || Date.now().toString(16)}.log`);
  fs.writeFileSync(file, '');
  return file;
}

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let match;
  if ((match = trimmed.match(/^Progress:\s*(\d+)/i))) {
    return { t: timestamp(), c: '', m: '', p: parseInt(match[1], 10) };
  }
  if ((match = trimmed.match(/^Task:\s*(.+)/i))) {
    return { t: timestamp(), c: 'em', m: match[1], task: match[1] };
  }
  if (/^Extract:/i.test(trimmed) || /^Installing:/i.test(trimmed)) {
    return { t: timestamp(), c: '', m: `  ${trimmed}` };
  }
  if (/^Registry:/i.test(trimmed)) {
    return { t: timestamp(), c: '', m: `  ${trimmed}` };
  }
  if (/^Done\.?$/i.test(trimmed)) {
    return {
      t: timestamp(),
      c: 'ok',
      m: 'Installation terminee - Sawa est pret.',
      p: 100,
      task: 'Termine',
    };
  }
  if ((match = trimmed.match(/^Error:\s*(\S+)\s*(.*)$/i))) {
    return {
      t: timestamp(),
      c: 'err',
      m: trimmed,
      error: { code: match[1], message: match[2] },
    };
  }
  return { t: timestamp(), c: 'mute', m: trimmed };
}

function tailLog(filePath, onLine) {
  let pos = 0;
  let buffer = '';
  let watcher = null;

  function flush() {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size <= pos) return;
      const stream = fs.createReadStream(filePath, {
        start: pos,
        end: stat.size,
      });
      stream.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        let idx;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          const evt = parseLine(line);
          if (evt) onLine(evt);
        }
      });
      stream.on('end', () => {
        pos = stat.size;
      });
      stream.on('error', () => {
        /* file might disappear while the backend exits */
      });
    } catch (_err) {
      /* file not yet present */
    }
  }

  try {
    watcher = fs.watch(filePath, { persistent: false }, () => flush());
  } catch (_err) {
    /* interval fallback below */
  }
  const interval = setInterval(flush, 250);

  return () => {
    if (watcher) watcher.close();
    clearInterval(interval);
    flush();
    if (buffer.trim()) {
      const evt = parseLine(buffer);
      if (evt) onLine(evt);
    }
  };
}

async function start(opts = {}, handlers = {}, deps = {}) {
  const backendPath = opts.backendPath;
  if (!backendPath || !fs.existsSync(backendPath)) {
    handlers.onError &&
      handlers.onError({
        kind: 'missing-backend',
        message: 'Backend NSIS introuvable - installation impossible',
      });
    return { started: false };
  }

  const createLog = deps.createLog || createTempLog;
  const watchLog = deps.tailLog || tailLog;
  const spawnBackend = deps.spawnBackend || spawn;
  const runAsAdmin = deps.runElevated || runElevated;

  const options = normalizeInstallOptions({
    ...opts,
    logPath: opts.logPath || createLog(opts.runId),
  });

  if (options.logPath && !fs.existsSync(options.logPath)) {
    try {
      fs.writeFileSync(options.logPath, '');
    } catch (_err) {
      // NSIS can still create the log; the tailer tolerates missing files.
    }
  }

  const stop = watchLog(options.logPath, (evt) => {
    handlers.onProgress && handlers.onProgress(evt);
  });
  const args = buildBackendArgs(options);

  try {
    if (options.elevate) {
      const result = await runAsAdmin(backendPath, args, {
        name: 'Sawa Manga Library Setup',
      });
      stop();
      handlers.onDone &&
        handlers.onDone({ ok: result.code === 0, code: result.code, logPath: options.logPath });
      return { started: true, logPath: options.logPath };
    }

    const child = spawnBackend(backendPath, args, { windowsHide: true });
    child.on('error', (err) => {
      stop();
      handlers.onError && handlers.onError({ kind: 'spawn', message: err.message });
    });
    child.on('close', (code) => {
      stop();
      if (code === 0) {
        handlers.onDone && handlers.onDone({ ok: true, code, logPath: options.logPath });
      } else if (code === 1314) {
        handlers.onError &&
          handlers.onError({
            kind: 'permissions',
            code,
            message: 'Privileges insuffisants (1314)',
          });
      } else {
        handlers.onError &&
          handlers.onError({ kind: 'backend', code, message: `Code ${code}` });
      }
    });
    return { started: true, logPath: options.logPath, child };
  } catch (err) {
    stop();
    if (err && err.message && /User did not grant permission/i.test(err.message)) {
      handlers.onError && handlers.onError({ kind: 'permissions', message: err.message });
    } else {
      handlers.onError &&
        handlers.onError({
          kind: 'backend',
          message: err.message || String(err),
        });
    }
    return { started: false };
  }
}

module.exports = { start, parseLine, createTempLog, tailLog };

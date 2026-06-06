// UAC elevation helper. Wraps `sudo-prompt` with a sane fallback to the
// non-elevated spawn used in dev. In packaged builds sudo-prompt is required
// — at install click we re-spawn the silent NSIS backend with admin
// privileges so file/registry/symlink writes succeed.

const { spawn } = require('child_process');

let sudoPrompt = null;
try {
  // eslint-disable-next-line global-require
  sudoPrompt = require('sudo-prompt');
} catch (_err) {
  // dev mode — fall back to plain spawn
}

function escapeArg(arg) {
  if (typeof arg !== 'string') return String(arg);
  if (!/[\s"]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

/**
 * Run an executable with admin privileges. Returns a Promise that resolves
 * once the elevated process finishes (or rejects on UAC refusal).
 *   exe: absolute path to the executable
 *   args: array of CLI arguments
 *   opts: { name, icns, env }
 */
function runElevated(exe, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    if (sudoPrompt && process.platform === 'win32') {
      const cmd =
        escapeArg(exe) + (args.length ? ' ' + args.map(escapeArg).join(' ') : '');
      sudoPrompt.exec(
        cmd,
        { name: opts.name || 'Sawa Manga Library Setup' },
        (err, stdout, stderr) => {
          if (err) return reject(err);
          resolve({ stdout, stderr, code: 0 });
        }
      );
      return;
    }
    // Dev fallback: plain spawn (no UAC). Useful for testing on a writable
    // install path like %LOCALAPPDATA%\Programs\Sawa.
    const child = spawn(exe, args, {
      windowsHide: true,
      env: { ...process.env, ...(opts.env || {}) },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr, code });
      else
        reject(
          Object.assign(new Error(`Process exited with code ${code}`), {
            code,
            stdout,
            stderr,
          })
        );
    });
  });
}

module.exports = { runElevated };

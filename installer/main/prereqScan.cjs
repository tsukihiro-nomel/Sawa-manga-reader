const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const suwayomiKill = require('./suwayomiKill.cjs');
const { getDiskSpace, REQUIRED_GB } = require('./diskSpace.cjs');
const { normalizeInstallOptions } = require('./installOptions.cjs');

function checkOS() {
  if (process.platform !== 'win32') {
    return { ok: false, label: `${os.type()} ${os.release()} non supporte - Windows requis` };
  }
  const release = os.release();
  const build = parseInt(release.split('.').pop() || '0', 10);
  const arch = process.arch === 'x64' ? 'x64' : process.arch;
  if (build < 19041) {
    return {
      ok: 'warn',
      label: `Windows ${release} - build ${build} recommande >= 19041`,
    };
  }
  return { ok: true, label: `Windows 10/11 build ${build} (${arch})` };
}

function checkAdmin(scope) {
  if (scope !== 'allUsers') {
    return {
      ok: true,
      label: 'Mode utilisateur - aucune elevation requise',
      requiresElevation: false,
    };
  }

  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  try {
    fs.accessSync(programFiles, fs.constants.W_OK);
    return { ok: true, label: 'Privileges administrateur accordes' };
  } catch (_err) {
    return {
      ok: 'warn',
      label: "Elevation UAC demandee pour l'installation machine",
      requiresElevation: true,
    };
  }
}

async function checkDisk(targetPath) {
  const info = await getDiskSpace(targetPath);
  if (info.free < info.required) {
    return {
      ok: false,
      label: `Espace insuffisant - ${info.required.toFixed(2)} Go requis, ${info.free.toFixed(1)} Go libres`,
      free: info.free,
      required: info.required,
    };
  }
  return {
    ok: true,
    label: `Espace disque - ${info.required.toFixed(2)} Go requis, ${info.free.toFixed(0)} Go libres`,
    free: info.free,
    required: info.required,
  };
}

function checkJava() {
  try {
    const out = spawnSync('java', ['-version'], {
      windowsHide: true,
      timeout: 4000,
      encoding: 'utf8',
    });
    if (out.status === 0 || out.stderr) {
      const text = (out.stderr || out.stdout || '').toString();
      const m = text.match(/version "(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
      const major = m ? parseInt(m[1], 10) : 0;
      if (major >= 21) return { ok: true, label: `Java ${major}+ detecte sur le systeme` };
      return {
        ok: 'warn',
        label: `Java ${major} detecte - runtime bundled Java 21 utilise`,
      };
    }
  } catch (_err) {
    /* fallthrough */
  }
  return {
    ok: 'warn',
    label: 'Java 21 non detecte - runtime bundled utilise',
  };
}

function checkProcs() {
  const pids = suwayomiKill.listProcesses();
  if (!pids.length) return { ok: true, label: 'Aucun process Suwayomi/Sawa en cours', pids: [] };
  return {
    ok: false,
    label: `${pids.length} process Sawa detecte(s) - fermeture requise`,
    pids: pids.map((pid) => ({ pid, name: 'java.exe' })),
  };
}

function checkPrev() {
  try {
    for (const hive of ['HKCU', 'HKLM']) {
      const out = spawnSync(
        'reg',
        [
          'query',
          `${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\SawaMangaLibrary`,
          '/v',
          'DisplayVersion',
        ],
        { windowsHide: true, encoding: 'utf8', timeout: 4000 }
      );
      if (out.status === 0 && out.stdout) {
        const m = out.stdout.match(/DisplayVersion\s+REG_SZ\s+(\S+)/);
        const version = m ? m[1] : 'inconnue';
        return {
          ok: 'warn',
          label: `Version ${version} deja installee (${hive}) - mise a jour disponible`,
          found: true,
          version,
          hive,
        };
      }
    }
  } catch (_err) {
    /* not found */
  }
  return {
    ok: true,
    label: 'Aucune installation precedente detectee',
    found: false,
  };
}

async function runPrereqScan(opts = {}) {
  const options = normalizeInstallOptions(opts);
  const [os_, admin, disk, java, proc, prev] = [
    checkOS(),
    checkAdmin(options.scope),
    await checkDisk(options.installPath),
    checkJava(),
    checkProcs(),
    checkPrev(),
  ];
  return { os: os_, admin, disk, java, proc, prev };
}

module.exports = { runPrereqScan, REQUIRED_GB };

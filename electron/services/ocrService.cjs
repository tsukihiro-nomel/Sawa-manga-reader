const fs = require('fs');
const { execFileSync, spawn } = require('child_process');

const OCR_INFO_CACHE_TTL_MS = 15000;
const WINDOWS_OCR_ENGINE_LABEL = 'OCR Windows';
const TESSERACT_ENGINE_LABEL = 'Tesseract';

let cachedOcrInfo = null;
let cachedOcrInfoAt = 0;

function runLookupCommand(command, args) {
  try {
    const output = execFileSync(command, args, {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
      windowsHide: true
    });
    return String(output || '').trim();
  } catch (_error) {
    return '';
  }
}

function resolveTesseractBinary() {
  const explicitPath = String(process.env.SAWA_TESSERACT_PATH || '').trim();
  if (explicitPath && fs.existsSync(explicitPath)) {
    return explicitPath;
  }

  const pathLookup = process.platform === 'win32'
    ? runLookupCommand('where.exe', ['tesseract'])
    : runLookupCommand('which', ['tesseract']);
  if (pathLookup) {
    const first = pathLookup.split(/\r?\n/).map((value) => value.trim()).find(Boolean);
    if (first && fs.existsSync(first)) return first;
  }

  const candidatePaths = process.platform === 'win32'
    ? [
      'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
      'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe'
    ]
    : [
      '/usr/bin/tesseract',
      '/usr/local/bin/tesseract'
    ];

  return candidatePaths.find((candidate) => fs.existsSync(candidate)) || null;
}

function getPowerShellCommand() {
  if (process.platform !== 'win32') return null;
  const explicit = 'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
  if (fs.existsSync(explicit)) return explicit;
  return 'powershell.exe';
}

function buildPowerShellArgs(script) {
  return ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Sta', '-Command', script];
}

function executePowerShellSync(script, extraEnv = {}) {
  const powerShell = getPowerShellCommand();
  if (!powerShell) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      error: 'PowerShell indisponible sur cette plateforme.'
    };
  }

  try {
    const stdout = execFileSync(powerShell, buildPowerShellArgs(script), {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      windowsHide: true,
      env: {
        ...process.env,
        ...extraEnv
      }
    });

    return {
      ok: true,
      stdout: String(stdout || '').trim(),
      stderr: '',
      error: ''
    };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error?.stdout || '').trim(),
      stderr: String(error?.stderr || '').trim(),
      error: error?.message || 'Execution PowerShell impossible.'
    };
  }
}

function executePowerShell(script, extraEnv = {}) {
  const powerShell = getPowerShellCommand();
  if (!powerShell) {
    return Promise.reject(new Error('PowerShell indisponible sur cette plateforme.'));
  }

  return new Promise((resolve, reject) => {
    const child = spawn(powerShell, buildPowerShellArgs(script), {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...extraEnv
      }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
    });

    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `OCR Windows termine avec le code ${code}.`));
    });
  });
}

function parseJsonSafe(value, fallback = null) {
  try {
    return JSON.parse(String(value || '').trim());
  } catch (_error) {
    return fallback;
  }
}

function buildWindowsOcrSupportScript() {
  return `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[void][Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]

$languages = @([Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]::AvailableRecognizerLanguages)
$items = @()
foreach ($language in $languages) {
  $label = [string]$language.LanguageTag
  if ($language.DisplayName) {
    $label = [string]$language.DisplayName
  }
  $items += @{
    code = [string]$language.LanguageTag
    label = $label
  }
}

@{
  available = ($items.Count -gt 0)
  engineKind = 'windows-ocr'
  engineLabel = '${WINDOWS_OCR_ENGINE_LABEL}'
  binaryPath = 'winrt'
  languages = $items
} | ConvertTo-Json -Depth 5 -Compress
`.trim();
}

function buildWindowsOcrImageScript() {
  return `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[void][Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
[void][Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
[void][Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]

function Await-WinRt {
  param([Parameter(Mandatory = $true)] $Operation)

  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 -and $_.GetGenericArguments().Count -eq 1 } |
    Select-Object -First 1

  if (-not $method) {
    throw 'AsTask est indisponible.'
  }

  $resultType = $Operation.GetType().GenericTypeArguments[0]
  $genericMethod = $method.MakeGenericMethod($resultType)
  $task = $genericMethod.Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}

function Resolve-OcrLanguage($requested, $available) {
  foreach ($value in $requested) {
    $normalized = [string]$value
    if ([string]::IsNullOrWhiteSpace($normalized)) {
      continue
    }

    $candidate = $available | Where-Object { $_.LanguageTag -ieq $normalized } | Select-Object -First 1
    if ($candidate) {
      return $candidate
    }

    $base = $normalized.Split('-')[0]
    if (-not [string]::IsNullOrWhiteSpace($base)) {
      $candidate = $available | Where-Object { $_.LanguageTag -like "$base*" } | Select-Object -First 1
      if ($candidate) {
        return $candidate
      }
    }
  }

  $fallback = $available | Where-Object { $_.LanguageTag -like 'en*' } | Select-Object -First 1
  if ($fallback) {
    return $fallback
  }

  return $available | Select-Object -First 1
}

$requested = @()
try {
  $decoded = ConvertFrom-Json -InputObject $env:SAWA_OCR_LANGS
  if ($decoded -is [System.Collections.IEnumerable]) {
    foreach ($entry in $decoded) {
      $requested += [string]$entry
    }
  }
} catch {}

$availableLanguages = @([Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]::AvailableRecognizerLanguages)
if ($availableLanguages.Count -eq 0) {
  throw 'Aucune langue OCR Windows disponible.'
}

$selectedLanguage = Resolve-OcrLanguage $requested $availableLanguages
if (-not $selectedLanguage) {
  throw 'Impossible de selectionner une langue OCR Windows.'
}

$engine = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]::TryCreateFromLanguage($selectedLanguage)
if (-not $engine) {
  throw 'Impossible de creer le moteur OCR Windows.'
}

$stream = $null
try {
  $file = Await-WinRt ([Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]::GetFileFromPathAsync($env:SAWA_OCR_IMAGE_PATH))
  $stream = Await-WinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read))
  $decoder = Await-WinRt ([Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]::CreateAsync($stream))
  $bitmap = Await-WinRt ($decoder.GetSoftwareBitmapAsync())
  $result = Await-WinRt ($engine.RecognizeAsync($bitmap))

  $lines = @()
  foreach ($line in $result.Lines) {
    $lines += [string]$line.Text
  }

  @{
    text = [string]$result.Text
    lines = $lines
    language = [string]$selectedLanguage.LanguageTag
  } | ConvertTo-Json -Depth 5 -Compress
} finally {
  if ($stream) {
    $stream.Dispose()
  }
}
`.trim();
}

function probeTesseract() {
  const binaryPath = resolveTesseractBinary();
  if (!binaryPath) {
    return null;
  }

  try {
    const output = execFileSync(binaryPath, ['--list-langs'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      windowsHide: true
    });
    const languages = String(output || '')
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean)
      .filter((value) => !/list of available languages/i.test(value))
      .map((code) => ({ code, label: code }));

    return {
      available: true,
      binaryPath,
      engineKind: 'tesseract',
      engineLabel: TESSERACT_ENGINE_LABEL,
      languages
    };
  } catch (error) {
    return {
      available: true,
      binaryPath,
      engineKind: 'tesseract',
      engineLabel: TESSERACT_ENGINE_LABEL,
      languages: [],
      error: error?.message || 'Impossible de lister les langues Tesseract.'
    };
  }
}

function probeWindowsOcr() {
  if (process.platform !== 'win32') {
    return null;
  }

  const result = executePowerShellSync(buildWindowsOcrSupportScript());
  if (!result.ok) {
    return {
      available: false,
      binaryPath: null,
      engineKind: 'windows-ocr',
      engineLabel: WINDOWS_OCR_ENGINE_LABEL,
      languages: [],
      error: result.stderr || result.error || 'OCR Windows indisponible.'
    };
  }

  const parsed = parseJsonSafe(result.stdout, null);
  if (!parsed || !parsed.available) {
    return {
      available: false,
      binaryPath: null,
      engineKind: 'windows-ocr',
      engineLabel: WINDOWS_OCR_ENGINE_LABEL,
      languages: [],
      error: 'OCR Windows indisponible.'
    };
  }

  return {
    available: true,
    binaryPath: 'winrt',
    engineKind: 'windows-ocr',
    engineLabel: WINDOWS_OCR_ENGINE_LABEL,
    languages: Array.isArray(parsed.languages) ? parsed.languages : []
  };
}

function readCachedOcrInfo(forceRefresh = false) {
  if (!forceRefresh && cachedOcrInfo && (Date.now() - cachedOcrInfoAt) < OCR_INFO_CACHE_TTL_MS) {
    return cachedOcrInfo;
  }
  return null;
}

function writeCachedOcrInfo(value) {
  cachedOcrInfo = value;
  cachedOcrInfoAt = Date.now();
  return cachedOcrInfo;
}

function getOcrEngineInfo(forceRefresh = false) {
  const cached = readCachedOcrInfo(forceRefresh);
  if (cached) return cached;

  const tesseract = probeTesseract();
  if (tesseract?.available) {
    return writeCachedOcrInfo(tesseract);
  }

  const windowsOcr = probeWindowsOcr();
  if (windowsOcr?.available) {
    return writeCachedOcrInfo(windowsOcr);
  }

  return writeCachedOcrInfo({
    available: false,
    binaryPath: null,
    engineKind: windowsOcr?.engineKind || 'local-ocr',
    engineLabel: windowsOcr?.engineLabel || 'OCR local',
    languages: [],
    error: windowsOcr?.error || tesseract?.error || 'Aucun moteur OCR local disponible.'
  });
}

function listOcrLanguages(forceRefresh = false) {
  const engine = getOcrEngineInfo(forceRefresh);
  return {
    available: Boolean(engine.available),
    binaryPath: engine.binaryPath || null,
    engineKind: engine.engineKind || 'local-ocr',
    engineLabel: engine.engineLabel || 'OCR local',
    languages: Array.isArray(engine.languages) ? engine.languages : [],
    error: engine.error || ''
  };
}

function runTesseractOcr(imagePath, languages = ['eng']) {
  const engine = getOcrEngineInfo();
  const langCodes = Array.isArray(languages) && languages.length > 0 ? languages : ['eng'];

  return new Promise((resolve, reject) => {
    const child = spawn(engine.binaryPath, [imagePath, 'stdout', '-l', langCodes.join('+')], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
    });

    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve(stdout.replace(/\r\n/g, '\n').trim());
        return;
      }
      reject(new Error(stderr.trim() || `OCR termine avec le code ${code}.`));
    });
  });
}

async function runWindowsOcr(imagePath, languages = []) {
  const stdout = await executePowerShell(buildWindowsOcrImageScript(), {
    SAWA_OCR_IMAGE_PATH: String(imagePath || ''),
    SAWA_OCR_LANGS: JSON.stringify(Array.isArray(languages) ? languages : [])
  });
  const parsed = parseJsonSafe(stdout, null);
  if (!parsed) {
    throw new Error('Le moteur OCR Windows a renvoye une reponse invalide.');
  }
  return String(parsed.text || '').replace(/\r\n/g, '\n').trim();
}

function runOcrOnImage(imagePath, languages = ['eng']) {
  const engine = getOcrEngineInfo();
  if (!engine.available) {
    return Promise.reject(new Error('Moteur OCR local introuvable.'));
  }

  if (engine.engineKind === 'windows-ocr') {
    return runWindowsOcr(imagePath, languages);
  }

  return runTesseractOcr(imagePath, languages);
}

module.exports = {
  getOcrEngineInfo,
  listOcrLanguages,
  runOcrOnImage
};

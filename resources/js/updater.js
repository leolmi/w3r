// Updates from the GitHub releases of the repository (Windows): the release is read with the REST API
// (open to the page), its manifest and the new exe with curl.exe (the downloads of GitHub do not allow
// pages of other origins). The exe is replaced by a PowerShell script started as the app exits
// (UPDATE_SCRIPT); the new version removes what the update left behind (finishUpdate).

const UPDATE_REPO = 'leolmi/w3r';
// Written by the script before starting the new version, removed by it at startup
const UPDATE_MARKER = 'w3r-update.json';

function compareVersions(a, b) {
  const [pa, pb] = [a, b].map((v) => String(v).replace(/^v/, '').split('.').map(Number));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

// Runs a command, returns its output; throws when it fails
async function runCommand(command) {
  const { stdOut, stdErr, exitCode } = await Neutralino.os.execCommand(command);
  if (exitCode !== 0) throw new Error(stdErr.trim() || `${command.split(' ')[0]}: codice di uscita ${exitCode}`);
  return stdOut;
}

const backslashes = (path) => path.replace(/\//g, '\\');

let appDirPromise = null;

// Absolute folder of the exe (NL_PATH can be relative)
function appDir() {
  appDirPromise ??= Neutralino.filesystem.getAbsolutePath(NL_PATH).then(backslashes);
  return appDirPromise;
}

function exeName() {
  return (NL_ARGS[0] || 'w3r.exe').split(/[\\/]/).pop();
}

// Latest release with an update package, null when there is none; throws when GitHub is not reachable.
// { version, notes, page, download: { url, size, sha256 } }
async function latestRelease() {
  const response = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(15000)
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub: ${response.status} ${response.statusText}`);
  const release = await response.json();
  const manifestAsset = release.assets.find((a) => a.name === 'manifest.json');
  if (!manifestAsset) return null;
  const manifest = JSON.parse(await runCommand(`curl.exe -sSfL --max-time 20 "${manifestAsset.browser_download_url}"`));
  const exe = release.assets.find((a) => a.name === manifest.package.name);
  if (!exe) return null;
  return {
    version: manifest.version,
    notes: release.body || '',
    page: release.html_url,
    download: { url: exe.browser_download_url, size: exe.size, sha256: manifest.package.sha256 }
  };
}

// Why the release cannot be installed here, null when it can
async function updateBlocker() {
  // From the sources (neu run) the exe is the Neutralino binary: nothing to replace
  if (NL_RESMODE !== 'embedded') return 'Aggiornamento non disponibile: w3r è avviato dai sorgenti.';
  const dir = await appDir();
  const probe = `${dir}\\.w3r-write-test`;
  try {
    await Neutralino.filesystem.writeFile(probe, '');
    await Neutralino.filesystem.remove(probe);
  } catch (err) {
    return `Aggiornamento non disponibile: la cartella di w3r non è scrivibile (${dir}).`;
  }
  return null;
}

// Downloads the new exe, starts the installer script and closes this window; the other windows keep
// running the current version until they are closed. paths: documents to open again in the new version
async function installUpdate(release, paths) {
  const work = `${backslashes(await Neutralino.os.getPath('temp'))}\\w3r-update`;
  await Neutralino.filesystem.createDirectory(work).catch(() => {});
  // Downloaded with the app still open: a failure is shown here, with nothing closed yet
  const exe = `${work}\\w3r.exe`;
  await runCommand(`curl.exe -sSfL --max-time 600 -o "${exe}" "${release.download.url}"`);
  const config = {
    appDir: await appDir(),
    exe: exeName(),
    pid: NL_PID,
    file: exe,
    sha256: release.download.sha256,
    from: NL_APPVERSION,
    to: release.version,
    paths,
    title: 'Aggiornamento di w3r',
    failed: 'Aggiornamento non riuscito: {message}\nResta la versione precedente.'
  };
  await Neutralino.filesystem.writeFile(`${work}\\update.ps1`, UPDATE_SCRIPT);
  await Neutralino.filesystem.writeFile(`${work}\\update.json`, JSON.stringify(config));
  await Neutralino.os.execCommand(
    `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${work}\\update.ps1" -Config "${work}\\update.json"`,
    { background: true });
  await removeInstance();
  await Neutralino.app.exit();
}

// At startup: removes the marker and the old exe left by the last update; returns the marker
// ({ from, to, paths }) when the update has just happened
async function finishUpdate() {
  if (NL_RESMODE !== 'embedded') return null;
  const dir = await appDir();
  const marker = `${dir}\\${UPDATE_MARKER}`;
  let done = null;
  try {
    done = JSON.parse((await Neutralino.filesystem.readFile(marker)).replace(/^﻿/, ''));
    // Removed first: the script, still watching, takes it as the sign of a good start
    await Neutralino.filesystem.remove(marker).catch(() => {});
  } catch (err) { /* no update */ }
  // Old exe still in use by windows of the previous version: removed at a later start
  const entries = await Neutralino.filesystem.readDirectory(dir).catch(() => []);
  for (const entry of entries) {
    if (entry.type === 'FILE' && /\.\d{14}\.old$/.test(entry.entry)) {
      await Neutralino.filesystem.remove(`${dir}\\${entry.entry}`).catch(() => {});
    }
  }
  return done;
}

// Installer of an update (Windows PowerShell 5.1), written to the temporary folder and started by the app
// just before it exits; settings from the JSON file given as -Config. Plain ASCII: PowerShell 5.1 reads a
// script without BOM in the ANSI code page (the texts come from the JSON, read as UTF-8).
// Checks the downloaded exe, waits for this window to close, renames the current exe to *.<stamp>.old
// (a running exe can be renamed, not overwritten: other windows may still use it), copies the new one,
// writes the marker and starts the new version, which removes the marker and the old exe (finishUpdate).
// If anything fails, or the new version exits without removing the marker, the old exe is put back and
// the previous version starts again.
const UPDATE_SCRIPT = String.raw`
param([Parameter(Mandatory = $true)][string]$Config)
$ErrorActionPreference = 'Stop'
$cfg = Get-Content -Raw -Encoding UTF8 -LiteralPath $Config | ConvertFrom-Json
$work = Split-Path -Parent $Config
Start-Transcript -LiteralPath (Join-Path $work 'update.log') -Force | Out-Null
Add-Type -AssemblyName System.Windows.Forms

$appDir = $cfg.appDir
$exe = Join-Path $appDir $cfg.exe
$marker = Join-Path $appDir 'w3r-update.json'
$backup = $null

try {
  $hash = (Get-FileHash -LiteralPath $cfg.file -Algorithm SHA256).Hash
  if ($hash -ne $cfg.sha256) { throw "checksum mismatch of the downloaded file" }

  Wait-Process -Id $cfg.pid -Timeout 60 -ErrorAction SilentlyContinue
  $backup = "$exe." + (Get-Date -Format 'yyyyMMddHHmmss') + '.old'
  Move-Item -LiteralPath $exe -Destination $backup -Force
  Copy-Item -LiteralPath $cfg.file -Destination $exe -Force
  Unblock-File -LiteralPath $exe

  [IO.File]::WriteAllText($marker, (@{ from = $cfg.from; to = $cfg.to; paths = @($cfg.paths) } | ConvertTo-Json))
  $proc = Start-Process -FilePath $exe -WorkingDirectory $appDir -PassThru
  $deadline = (Get-Date).AddSeconds(60)
  while ((Test-Path -LiteralPath $marker) -and -not $proc.HasExited -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
  }
  if ((Test-Path -LiteralPath $marker) -and $proc.HasExited) { throw "the new version did not start" }
  Remove-Item -LiteralPath $cfg.file -Force -ErrorAction SilentlyContinue
} catch {
  $message = $_.Exception.Message
  Write-Output "update failed: $message"
  if ($backup -and (Test-Path -LiteralPath $backup)) {
    if ($proc -and -not $proc.HasExited) { $proc | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 500 }
    Remove-Item -LiteralPath $exe -Force -ErrorAction SilentlyContinue
    Move-Item -LiteralPath $backup -Destination $exe -Force
  }
  Remove-Item -LiteralPath $marker -Force -ErrorAction SilentlyContinue
  [System.Windows.Forms.MessageBox]::Show($cfg.failed.Replace('{message}', $message), $cfg.title, 'OK', 'Error') | Out-Null
  Start-Process -FilePath $exe -WorkingDirectory $appDir
}
Stop-Transcript | Out-Null
`;

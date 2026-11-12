// Publishes the update package made by `npm run package` as the GitHub release v<version> of this
// repository (GitHub CLI, logged in with `gh auth login`): the installed apps find it as the latest release.
// The installer dist/w3r-setup-<version>.exe is attached too, when present (npm run installer).
// Notes: `npm run release -- "testo"`, default the subject of the last commit
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const releaseDir = path.join(root, 'release');
const { version } = require(path.join(root, 'package.json'));

const manifestPath = path.join(releaseDir, 'manifest.json');
if (!fs.existsSync(manifestPath)) throw new Error('manca release/manifest.json: eseguire "npm run package"');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.version !== version) {
  throw new Error(`release/ contiene la versione ${manifest.version}, package.json ${version}: eseguire di nuovo "npm run package"`);
}
const exePath = path.join(releaseDir, manifest.package.name);
if (!fs.existsSync(exePath)) throw new Error(`manca ${exePath}: eseguire di nuovo "npm run package"`);
const assets = [exePath, manifestPath];
const setup = path.join(root, 'dist', `w3r-setup-${version}.exe`);
if (fs.existsSync(setup)) assets.push(setup);

const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
try {
  run('gh', ['--version']);
} catch (err) {
  throw new Error('GitHub CLI non trovata: installarla ("winget install GitHub.cli") ed eseguire "gh auth login"');
}
const notes = process.argv[2] ?? run('git', ['log', '-1', '--format=%s']);
const tag = `v${version}`;
console.log(run('gh', ['release', 'create', tag, ...assets, '--title', `w3r ${version}`, '--notes', notes,
  '--target', run('git', ['rev-parse', 'HEAD'])]));

// Prepares the update package published as a GitHub release (npm run release): release/w3r-win_x64.exe,
// the exe with embedded resources built by `npm run build`, and release/manifest.json describing it
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const releaseDir = path.join(root, 'release');
const { version } = require(path.join(root, 'package.json'));
const config = require(path.join(root, 'neutralino.config.json'));
if (config.version !== version) {
  throw new Error(`neutralino.config.json ha la versione ${config.version}, package.json ${version}: allinearle`);
}

const exe = path.join(root, 'dist', 'w3r', 'w3r-win_x64.exe');
if (!fs.existsSync(exe)) throw new Error(`manca ${exe}: eseguire "npm run build"`);

const name = 'w3r-win_x64.exe';
fs.rmSync(releaseDir, { recursive: true, force: true });
fs.mkdirSync(releaseDir, { recursive: true });
fs.copyFileSync(exe, path.join(releaseDir, name));
const data = fs.readFileSync(exe);
const manifest = {
  version,
  package: { name, size: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex').toUpperCase() }
};
fs.writeFileSync(path.join(releaseDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`pacchetto di aggiornamento pronto: ${releaseDir} (${(data.length / 1048576).toFixed(1)} MB)`);

// Builds the Windows installer with Inno Setup (dist/w3r-setup-<version>.exe)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const png2icons = require('png2icons');

const root = path.join(__dirname, '..');
const { version } = require(path.join(root, 'package.json'));

// Inno Setup needs an .ico for the setup executable
const png = fs.readFileSync(path.join(root, 'resources', 'icons', 'app.png'));
fs.writeFileSync(path.join(root, 'installer', 'app.ico'), png2icons.createICO(png, png2icons.HERMITE, 0, true, true));

const candidates = [
  process.env.ISCC,
  path.join(process.env['ProgramFiles(x86)'] || '', 'Inno Setup 6', 'ISCC.exe'),
  path.join(process.env.ProgramFiles || '', 'Inno Setup 6', 'ISCC.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Inno Setup 6', 'ISCC.exe')
];
const iscc = candidates.find((file) => file && fs.existsSync(file));
if (!iscc) {
  console.error('Inno Setup 6 non trovato: installarlo (winget install JRSoftware.InnoSetup) o impostare ISCC.');
  process.exit(1);
}

execFileSync(iscc, [`/DAppVersion=${version}`, path.join(root, 'installer', 'w3r.iss')], { stdio: 'inherit' });

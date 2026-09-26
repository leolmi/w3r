// Persistent data in the OS data folder (%APPDATA%\w3r, ~/Library/Application Support/w3r, ~/.local/share/w3r):
// settings shared by all instances and the registry of open windows.
// localStorage cannot be used, since every instance runs on a random port (a different origin).

const INSTANCE_HEARTBEAT_MS = 10000;
const INSTANCE_STALE_MS = 30000;
const CASCADE_STEP = 32;

let appDataDir = null;

async function getAppDataDir() {
  if (!appDataDir) {
    appDataDir = joinPath(toNativePath(await Neutralino.os.getPath('data')), 'w3r');
    await Neutralino.filesystem.createDirectory(joinPath(appDataDir, 'instances')).catch(() => {});
  }
  return appDataDir;
}

async function readJson(path) {
  try {
    return JSON.parse(await Neutralino.filesystem.readFile(path));
  } catch (err) {
    return null;
  }
}

async function loadSettings() {
  return (await readJson(joinPath(await getAppDataDir(), 'settings.json'))) || {};
}

// Last writer wins: settings are small and changed one at a time
async function saveSetting(key, value) {
  const path = joinPath(await getAppDataDir(), 'settings.json');
  const settings = (await readJson(path)) || {};
  settings[key] = value;
  await Neutralino.filesystem.writeFile(path, JSON.stringify(settings, null, 2)).catch(() => {});
}

// Each instance owns one file (no write conflicts) with its window position and a heartbeat timestamp
async function instanceFile() {
  return joinPath(await getAppDataDir(), 'instances', `${NL_PID}.json`);
}

async function writeInstance() {
  const position = await Neutralino.window.getPosition().catch(() => null);
  if (!position) return;
  await Neutralino.filesystem.writeFile(await instanceFile(),
    JSON.stringify({ x: position.x, y: position.y, at: Date.now() })).catch(() => {});
}

async function liveInstancePositions() {
  const dir = joinPath(await getAppDataDir(), 'instances');
  const entries = await Neutralino.filesystem.readDirectory(dir).catch(() => []);
  const positions = [];
  for (const entry of entries) {
    if (entry.type !== 'FILE' || entry.entry === `${NL_PID}.json`) continue;
    const path = joinPath(dir, entry.entry);
    const data = await readJson(path);
    if (data && Date.now() - data.at < INSTANCE_STALE_MS) positions.push(data);
    else await Neutralino.filesystem.remove(path).catch(() => {});
  }
  return positions;
}

// Cascades the window starting from the centered position, skipping the ones already taken by open windows
async function placeWindow() {
  const start = await Neutralino.window.getPosition().catch(() => null);
  if (start) {
    const taken = await liveInstancePositions();
    const isTaken = (x, y) => taken.some((p) => Math.abs(p.x - x) < 8 && Math.abs(p.y - y) < 8);
    // The window starts centered, so the free space is the same on every side
    const maxOffset = Math.min(start.x, start.y);

    // Windows spread down-right first, then up-left from the center, so they stay on screen
    const shifts = [];
    for (let s = 0; s <= maxOffset; s += CASCADE_STEP) shifts.push(s);
    for (let s = -CASCADE_STEP; s >= -maxOffset; s -= CASCADE_STEP) shifts.push(s);
    const shift = shifts.find((s) => !isTaken(start.x + s, start.y + s)) || 0;
    if (shift) await Neutralino.window.move(start.x + shift, start.y + shift).catch(() => {});
  }

  await writeInstance();
  setInterval(writeInstance, INSTANCE_HEARTBEAT_MS);
}

async function removeInstance() {
  await Neutralino.filesystem.remove(await instanceFile()).catch(() => {});
}

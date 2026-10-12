// Persistent data in %APPDATA%\w3r: settings shared by all instances, the registry of open windows
// and their inboxes (files handed over by a new instance started from Explorer).
// localStorage cannot be used, since every instance runs on a random port (a different origin).

const INSTANCE_HEARTBEAT_MS = 10000;
const INSTANCE_STALE_MS = 30000;
const CASCADE_STEP = 32;
const INBOX_POLL_MS = 250;
const HANDOFF_TIMEOUT_MS = 2000;

let appDataDir = null;

async function getAppDataDir() {
  if (!appDataDir) {
    const base = (await Neutralino.os.getPath('data')).replace(/\//g, '\\');
    appDataDir = `${base}\\w3r`;
    await Neutralino.filesystem.createDirectory(`${appDataDir}\\instances`).catch(() => {});
    await Neutralino.filesystem.createDirectory(`${appDataDir}\\inbox`).catch(() => {});
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
  return (await readJson(`${await getAppDataDir()}\\settings.json`)) || {};
}

// Last writer wins: settings are small and changed one at a time
async function saveSetting(key, value) {
  const path = `${await getAppDataDir()}\\settings.json`;
  const settings = (await readJson(path)) || {};
  settings[key] = value;
  await Neutralino.filesystem.writeFile(path, JSON.stringify(settings, null, 2)).catch(() => {});
}

// Each instance owns one file (no write conflicts) with its window position, a heartbeat timestamp
// and the time its window was last selected (a new window counts as selected)
let focusedAt = Date.now();

async function instanceFile() {
  return `${await getAppDataDir()}\\instances\\${NL_PID}.json`;
}

async function writeInstance() {
  const position = await Neutralino.window.getPosition().catch(() => null);
  if (!position) return;
  await Neutralino.filesystem.writeFile(await instanceFile(),
    JSON.stringify({ x: position.x, y: position.y, at: Date.now(), focusedAt })).catch(() => {});
}

// The other instances still alive, with their pid; stale files (crashed instances) are removed
async function liveInstances() {
  const dir = `${await getAppDataDir()}\\instances`;
  const entries = await Neutralino.filesystem.readDirectory(dir).catch(() => []);
  const instances = [];
  for (const entry of entries) {
    if (entry.type !== 'FILE' || entry.entry === `${NL_PID}.json`) continue;
    const path = `${dir}\\${entry.entry}`;
    const data = await readJson(path);
    if (data && Date.now() - data.at < INSTANCE_STALE_MS) instances.push({ ...data, pid: entry.entry.replace(/\.json$/, '') });
    else await Neutralino.filesystem.remove(path).catch(() => {});
  }
  return instances;
}

// Cascades the window starting from the centered position, skipping the ones already taken by open windows
async function placeWindow() {
  const start = await Neutralino.window.getPosition().catch(() => null);
  if (start) {
    const taken = await liveInstances();
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
  await Neutralino.filesystem.remove(await inboxDir(NL_PID)).catch(() => {});
}

window.addEventListener('focus', () => {
  focusedAt = Date.now();
  writeInstance();
});

async function inboxDir(pid) {
  return `${await getAppDataDir()}\\inbox\\${pid}`;
}

// Hands a file over to the instance selected last: the request is a file in its inbox, which the instance
// removes once it has taken it. Without an answer in time (the instance has just closed or hangs)
// the request is withdrawn and false is returned, so the file opens here
async function handOff(path) {
  const target = (await liveInstances()).sort((a, b) => (b.focusedAt || 0) - (a.focusedAt || 0))[0];
  if (!target) return false;
  const dir = await inboxDir(target.pid);
  await Neutralino.filesystem.createDirectory(dir).catch(() => {});
  const request = `${dir}\\${NL_PID}.json`;
  try {
    await Neutralino.filesystem.writeFile(request, JSON.stringify({ path }));
  } catch (err) {
    return false;
  }
  for (let waited = 0; waited < HANDOFF_TIMEOUT_MS; waited += 100) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (!(await readJson(request))) return true;
  }
  await Neutralino.filesystem.remove(request).catch(() => {});
  return false;
}

// Requests from new instances, in order of arrival; each one is removed (the answer) before it is handled
async function watchInbox(onFile) {
  const dir = await inboxDir(NL_PID);
  await Neutralino.filesystem.createDirectory(dir).catch(() => {});
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    const entries = await Neutralino.filesystem.readDirectory(dir).catch(() => []);
    for (const entry of entries.filter((e) => e.type === 'FILE')) {
      const path = `${dir}\\${entry.entry}`;
      // A request not readable yet (still being written) is taken at the next round
      const data = await readJson(path);
      if (!data) continue;
      await Neutralino.filesystem.remove(path).catch(() => {});
      if (data.path) await onFile(data.path);
    }
    busy = false;
  }, INBOX_POLL_MS);
}

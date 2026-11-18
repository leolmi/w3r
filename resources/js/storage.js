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

// Reading points by file path, shared by all windows: { block, fraction, text } (see Column.readingPoint)
async function loadBookmarks() {
  return (await readJson(`${await getAppDataDir()}\\bookmarks.json`)) || {};
}

// Read again before writing, so the reading points set in other windows are kept; null removes one
async function saveBookmark(path, bookmark) {
  const file = `${await getAppDataDir()}\\bookmarks.json`;
  const bookmarks = (await readJson(file)) || {};
  if (bookmark) bookmarks[path] = bookmark;
  else delete bookmarks[path];
  await Neutralino.filesystem.writeFile(file, JSON.stringify(bookmarks, null, 2)).catch(() => {});
}

// Each instance owns one file (no write conflicts) with its window position and size, a heartbeat timestamp,
// the time its window was last selected (a new window counts as selected) and its documents (state, set
// by setInstanceState), kept for the session restored at the next start
let focusedAt = Date.now();
let instanceState = null;

async function instanceFile() {
  return `${await getAppDataDir()}\\instances\\${NL_PID}.json`;
}

async function windowGeometry() {
  const position = await Neutralino.window.getPosition().catch(() => null);
  if (!position) return null;
  const size = await Neutralino.window.getSize().catch(() => ({}));
  const maximized = await Neutralino.window.isMaximized().catch(() => false);
  return { x: position.x, y: position.y, width: size.width, height: size.height, maximized };
}

async function writeInstance() {
  const geometry = await windowGeometry();
  if (!geometry) return;
  await Neutralino.filesystem.writeFile(await instanceFile(),
    JSON.stringify({ ...geometry, at: Date.now(), focusedAt, state: instanceState })).catch(() => {});
}

function setInstanceState(state) {
  instanceState = state;
  writeInstance();
}

// The other instances still alive, with their pid; the files of crashed instances (stale) go to the
// session, as windows closed at their last heartbeat
async function liveInstances() {
  const dir = `${await getAppDataDir()}\\instances`;
  const entries = await Neutralino.filesystem.readDirectory(dir).catch(() => []);
  const instances = [];
  for (const entry of entries) {
    if (entry.type !== 'FILE' || entry.entry === `${NL_PID}.json`) continue;
    const path = `${dir}\\${entry.entry}`;
    const data = await readJson(path);
    if (data && Date.now() - data.at < INSTANCE_STALE_MS) instances.push({ ...data, pid: entry.entry.replace(/\.json$/, '') });
    else {
      if (data) await archiveWindow(entry.entry, { ...data, closedAt: data.at });
      await Neutralino.filesystem.remove(path).catch(() => {});
    }
  }
  return instances;
}

// Session: the windows closed last, one file each ({ x, y, width, height, maximized, state, closedAt }).
// Windows closed within SESSION_TOGETHER_MS of the last one count as closed together (one after the
// other, or by the shutdown of Windows); one closed earlier, while others stayed open, was closed on purpose
const SESSION_TOGETHER_MS = 15000;

async function sessionDir(name = 'session') {
  const dir = `${await getAppDataDir()}\\${name}`;
  await Neutralino.filesystem.createDirectory(dir).catch(() => {});
  return dir;
}

async function readSession() {
  const dir = await sessionDir();
  const entries = await Neutralino.filesystem.readDirectory(dir).catch(() => []);
  const windows = [];
  for (const entry of entries.filter((e) => e.type === 'FILE')) {
    const data = await readJson(`${dir}\\${entry.entry}`);
    if (data) windows.push({ ...data, file: entry.entry });
  }
  return windows;
}

// A window without documents is not kept; the windows closed before this one, and not together with it,
// are no longer part of the last session
async function archiveWindow(file, data) {
  const dir = await sessionDir();
  for (const window of await readSession()) {
    if (window.closedAt < data.closedAt - SESSION_TOGETHER_MS) await Neutralino.filesystem.remove(`${dir}\\${window.file}`).catch(() => {});
  }
  if (!data.state?.columns?.some((c) => c.path)) return;
  await Neutralino.filesystem.writeFile(`${dir}\\${file}`, JSON.stringify(data)).catch(() => {});
}

async function archiveInstance() {
  const geometry = await windowGeometry();
  await archiveWindow(`${NL_PID}.json`, { ...geometry, state: instanceState, closedAt: Date.now() });
}

// The windows of the last session, the one closed last first; they leave the session, the others are
// handed over (one file each in "restore", named by the returned key) to the instances that will open them
async function takeSession() {
  const dir = await sessionDir();
  const all = await readSession();
  const last = Math.max(0, ...all.map((w) => w.closedAt || 0));
  const windows = all.filter((w) => w.closedAt >= last - SESSION_TOGETHER_MS).sort((a, b) => b.closedAt - a.closedAt);
  for (const window of all) await Neutralino.filesystem.remove(`${dir}\\${window.file}`).catch(() => {});
  const restoreDir = await sessionDir('restore');
  for (const [index, window] of windows.entries()) {
    if (!index) continue;
    window.key = `${NL_PID}-${index}`;
    await Neutralino.filesystem.writeFile(`${restoreDir}\\${window.key}.json`, JSON.stringify(window)).catch(() => {});
  }
  return windows;
}

// The window handed over to this instance by takeSession (--session=key), removed once read
async function takeRestoredWindow(key) {
  const file = `${await sessionDir('restore')}\\${key}.json`;
  const window = await readJson(file);
  await Neutralino.filesystem.remove(file).catch(() => {});
  return window;
}

// Moves and sizes the window as it was
async function applyGeometry(window) {
  if (Number.isFinite(window.width) && Number.isFinite(window.height)) {
    await Neutralino.window.setSize({ width: window.width, height: window.height }).catch(() => {});
  }
  if (Number.isFinite(window.x) && Number.isFinite(window.y)) await Neutralino.window.move(window.x, window.y).catch(() => {});
  if (window.maximized) await Neutralino.window.maximize().catch(() => {});
}

// Cascades the window starting from the centered position, skipping the ones already taken by open windows
// (cascade false: the window keeps the position given, e.g. restored from the session)
async function placeWindow(cascade = true) {
  const start = cascade && await Neutralino.window.getPosition().catch(() => null);
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

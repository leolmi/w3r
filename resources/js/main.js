Neutralino.init();

const content = document.getElementById('content');
const btnOpen = document.getElementById('btn-open');
const btnPrint = document.getElementById('btn-print');
const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const baseEl = document.getElementById('doc-base');
const dropZone = document.getElementById('drop-zone');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnZoomReset = document.getElementById('btn-zoom-reset');
const zoomBadge = document.getElementById('zoom-badge');

const MD_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd'];

// Navigation state: currentPath is null for dropped files (their location is unknown)
let currentPath = null;
const backStack = [];
const forwardStack = [];

// Each document folder gets its own mount point, so images are not served from the cache of a previous folder
let mountPoint = null;
let mountCounter = 0;

function dirOf(path) {
  return path.replace(/[\\/][^\\/]*$/, '');
}

function extensionOf(path) {
  const match = /\.([^.\\/]+)$/.exec(path);
  return match ? match[1].toLowerCase() : '';
}

// Resolves a relative link (URL syntax) against the folder of the current document
function resolvePath(href) {
  const target = decodeURIComponent(href).replace(/\//g, '\\');
  if (/^[a-zA-Z]:\\/.test(target)) return target;

  const base = currentPath ? dirOf(currentPath) : '';
  const parts = target.startsWith('\\') ? [base.slice(0, 2)] : base.split('\\');
  for (const segment of target.split('\\')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') { if (parts.length > 1) parts.pop(); }
    else parts.push(segment);
  }
  return parts.join('\\');
}

// GitHub-style heading ids, so that "#section" links work
function addHeadingIds() {
  const used = new Map();
  for (const heading of content.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const slug = heading.textContent.trim().toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-');
    const count = used.get(slug) || 0;
    used.set(slug, count + 1);
    heading.id = count ? `${slug}-${count}` : slug;
  }
}

async function mountFolder(folder) {
  if (mountPoint) await Neutralino.server.unmount(mountPoint).catch(() => {});
  mountPoint = `/doc${++mountCounter}`;
  await Neutralino.server.mount(mountPoint, folder);
  baseEl.href = `${mountPoint}/`;
}

async function render(markdown, name, path) {
  currentPath = path;
  if (path) await mountFolder(dirOf(path));
  else baseEl.href = '/';

  content.innerHTML = DOMPurify.sanitize(marked.parse(markdown), {
    FORBID_TAGS: ['form', 'iframe', 'object', 'embed', 'base', 'meta']
  });
  addHeadingIds();
  btnPrint.disabled = false;
  document.title = name;
  Neutralino.window.setTitle(`${name} - w3r`);
  saveState();
}

// The state survives a page reload, so the app never falls back to an empty page
function saveState() {
  try {
    sessionStorage.setItem('w3r-state', JSON.stringify({ currentPath, backStack, forwardStack }));
  } catch (err) { /* storage not available */ }
}

function restoreState() {
  try {
    const state = JSON.parse(sessionStorage.getItem('w3r-state'));
    if (!state || !state.currentPath) return;
    backStack.push(...state.backStack);
    forwardStack.push(...state.forwardStack);
    loadPath(state.currentPath).then(updateNavButtons);
  } catch (err) { /* nothing to restore */ }
}

// Zoom applies to the document only (the CSS zoom property re-flows the text); printing is always at 100%
const ZOOM_LEVELS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300];
let zoom = 100;
let zoomBadgeTimer = null;

function setZoom(level, showBadge = true) {
  zoom = level;
  content.style.zoom = zoom / 100;
  btnZoomIn.disabled = zoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
  btnZoomOut.disabled = zoom === ZOOM_LEVELS[0];
  btnZoomReset.disabled = zoom === 100;
  btnZoomReset.title = `Zoom ${zoom}% - ripristina 100% (Ctrl+0)`;
  if (!showBadge) return;
  saveSetting('zoom', zoom);
  zoomBadge.textContent = `${zoom}%`;
  zoomBadge.classList.add('visible');
  clearTimeout(zoomBadgeTimer);
  zoomBadgeTimer = setTimeout(() => zoomBadge.classList.remove('visible'), 1200);
}

function zoomStep(direction) {
  const next = direction > 0
    ? ZOOM_LEVELS.find((level) => level > zoom)
    : [...ZOOM_LEVELS].reverse().find((level) => level < zoom);
  if (next) setZoom(next);
}

function updateNavButtons() {
  btnBack.disabled = !backStack.length;
  btnForward.disabled = !forwardStack.length;
}

function scrollToAnchor(anchor) {
  const target = anchor && document.getElementById(decodeURIComponent(anchor));
  if (target) target.scrollIntoView();
  else dropZone.scrollTo(0, 0);
}

// Loads a file; returns false if it cannot be read
async function loadPath(path, anchor) {
  try {
    const text = await Neutralino.filesystem.readFile(path);
    await render(text, path.split('\\').pop(), path);
    scrollToAnchor(anchor);
    return true;
  } catch (err) {
    Neutralino.os.showMessageBox('Errore', `Impossibile aprire il file:\n${path}`, 'OK', 'ERROR');
    return false;
  }
}

async function navigateTo(path, anchor) {
  const previous = currentPath;
  if (await loadPath(path, anchor)) {
    if (previous) backStack.push(previous);
    forwardStack.length = 0;
    updateNavButtons();
  }
}

async function goBack() {
  if (!backStack.length) return;
  const path = backStack.pop();
  if (currentPath) forwardStack.push(currentPath);
  await loadPath(path);
  updateNavButtons();
}

async function goForward() {
  if (!forwardStack.length) return;
  const path = forwardStack.pop();
  if (currentPath) backStack.push(currentPath);
  await loadPath(path);
  updateNavButtons();
}

async function openDialog() {
  const entries = await Neutralino.os.showOpenDialog('Apri file Markdown', {
    filters: [
      { name: 'Markdown', extensions: MD_EXTENSIONS.concat('txt') },
      { name: 'Tutti i file', extensions: ['*'] }
    ]
  });
  if (entries.length) navigateTo(entries[0].replace(/\//g, '\\'));
}

content.addEventListener('click', (e) => {
  const link = e.target.closest('a[href]');
  if (!link) return;
  e.preventDefault();

  const href = link.getAttribute('href');
  if (href.startsWith('#')) {
    scrollToAnchor(href.slice(1));
    return;
  }
  if (/^(https?|mailto):/i.test(href)) {
    Neutralino.os.open(href);
    return;
  }
  if (!currentPath && !/^file:/i.test(href)) {
    Neutralino.os.showMessageBox('Link non disponibile',
      'I link relativi funzionano solo per i file aperti con "Apri": il file trascinato non ha un percorso noto.',
      'OK', 'WARNING');
    return;
  }

  const [pathPart, anchor] = href.replace(/^file:\/+/i, '').split('#');
  if (!pathPart) return;
  const path = resolvePath(pathPart);
  if (MD_EXTENSIONS.includes(extensionOf(path))) navigateTo(path, anchor);
  else Neutralino.os.open(path);
});

btnOpen.addEventListener('click', openDialog);
btnPrint.addEventListener('click', () => window.print());
btnBack.addEventListener('click', goBack);
btnForward.addEventListener('click', goForward);
btnZoomIn.addEventListener('click', () => zoomStep(1));
btnZoomOut.addEventListener('click', () => zoomStep(-1));
btnZoomReset.addEventListener('click', () => setZoom(100));

// Ctrl+wheel: replaces the native WebView zoom, which would also scale the sidebar
document.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomStep(1); }
  if (e.key === '-') { e.preventDefault(); zoomStep(-1); }
  if (e.key === '0') { e.preventDefault(); setZoom(100); }
  e.preventDefault();
  zoomStep(e.deltaY < 0 ? 1 : -1);
}, { passive: false });

document.addEventListener('keydown', (e) => {
  if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); goBack(); }
  if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goForward(); }
  if (!e.ctrlKey) return;
  if (e.key === 'o') { e.preventDefault(); openDialog(); }
  if (e.key === 'p' && !btnPrint.disabled) { e.preventDefault(); window.print(); }
});

// Mouse back/forward buttons: handled here, the WebView history is never used
document.addEventListener('mouseup', (e) => {
  if (e.button !== 3 && e.button !== 4) return;
  e.preventDefault();
  if (e.button === 3) goBack(); else goForward();
});
document.addEventListener('mousedown', (e) => { if (e.button === 3 || e.button === 4) e.preventDefault(); });

// Middle click / Ctrl+click would open links in a new WebView window
document.addEventListener('auxclick', (e) => e.preventDefault());

// Any drop outside the document area would make the WebView navigate to the file
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

// Drag & drop: the file is read in the page, its location on disk is not available
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragging');
  const file = e.dataTransfer.files[0];
  if (!file) return;
  if (currentPath) backStack.push(currentPath);
  forwardStack.length = 0;
  updateNavButtons();
  await render(await file.text(), file.name, null);
  dropZone.scrollTo(0, 0);
});

// "Open with" / drag onto the exe: the path arrives as a command-line argument
Neutralino.events.on('ready', async () => {
  placeWindow();
  const settings = await loadSettings();
  if (ZOOM_LEVELS.includes(settings.zoom)) setZoom(settings.zoom, false);

  const fileArg = NL_ARGS.slice(1).find((arg) => !arg.startsWith('--'));
  if (!fileArg) { restoreState(); return; }
  const path = fileArg.replace(/\//g, '\\');
  navigateTo(/^[a-zA-Z]:\\/.test(path) ? path : `${NL_CWD.replace(/\//g, '\\')}\\${path}`);
});

setZoom(100, false);

Neutralino.events.on('windowClose', async () => {
  await removeInstance();
  Neutralino.app.exit();
});

Neutralino.init();

const columnsEl = document.getElementById('columns');
const btnOpen = document.getElementById('btn-open');
const btnPrint = document.getElementById('btn-print');
const btnBookmark = document.getElementById('btn-bookmark');
const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnZoomReset = document.getElementById('btn-zoom-reset');
const zoomBadge = document.getElementById('zoom-badge');
const btnEdit = document.getElementById('btn-edit');
const btnSave = document.getElementById('btn-save');
const btnDiscard = document.getElementById('btn-discard');
const btnWrap = document.getElementById('btn-wrap');
const btnInsert = document.getElementById('btn-insert');
const insertMenu = document.getElementById('insert-menu');
const fileList = document.getElementById('file-list');
const fileListItems = document.getElementById('file-list-items');
const btnOpenColumn = document.getElementById('btn-open-column');
const btnCloseAll = document.getElementById('btn-close-all');
const fileListCount = document.getElementById('file-list-count');
const bookmarkList = document.getElementById('bookmark-list');
const bookmarkListItems = document.getElementById('bookmark-list-items');
const btnScrollLeft = document.getElementById('btn-scroll-left');
const btnScrollRight = document.getElementById('btn-scroll-right');
const btnSettings = document.getElementById('btn-settings');
const settingsDialog = document.getElementById('settings');
const settingZoom = document.getElementById('setting-zoom');
const settingNewWindow = document.getElementById('setting-new-window');
const settingTheme = document.getElementById('setting-theme');
const settingMdTheme = document.getElementById('setting-md-theme');
const settingPageWidth = document.getElementById('setting-page-width');
const settingPageWidthCustom = document.getElementById('setting-page-width-custom');

const MD_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd'];

// Relative resource URLs (images, media) are rewritten onto the mount point of the column's folder
const RELATIVE_URL = /^(?![a-z][a-z0-9+.-]*:|[\\/#])/i;

// Page break: a line with only <!-- pagebreak --> (hidden by other viewers) or \pagebreak / \newpage (Pandoc)
const PAGE_BREAK = /^ {0,3}(?:<!--\s*(?:pagebreak|newpage)\s*-->|\\(?:pagebreak|newpage))[ \t]*(?:\n+|$)/i;

marked.use({
  extensions: [{
    name: 'pageBreak',
    level: 'block',
    // Lets the marker interrupt a paragraph
    start: (src) => src.match(/^ {0,3}(?:<!--\s*(?:pagebreak|newpage)\s*-->|\\(?:pagebreak|newpage))[ \t]*$/im)?.index,
    tokenizer(src) {
      const match = PAGE_BREAK.exec(src);
      if (match) return { type: 'pageBreak', raw: match[0] };
    },
    renderer: () => '<div class="page-break"></div>\n'
  }]
});

function dirOf(path) {
  return path.replace(/[\\/][^\\/]*$/, '');
}

function extensionOf(path) {
  const match = /\.([^.\\/]+)$/.exec(path);
  return match ? match[1].toLowerCase() : '';
}

function fileName(path) {
  return path.split('\\').pop();
}

// Each column has its own mount point, and a new one for every folder change,
// so images are not served from the cache of a previous folder
let mountCounter = 0;

// A column shows one document, with its own navigation history and editing state.
// path is null for dropped files (their location is unknown); dropped is the File of a dropped document
class Column {
  constructor() {
    this.path = null;
    this.dropped = null;
    this.name = '';
    this.loaded = false;
    this.back = [];
    this.forward = [];

    // The textarea always holds the source; savedText is the content on disk (LF line endings,
    // since the textarea normalizes them), eol the line ending to write back
    this.savedText = '';
    this.renderedText = '';
    this.eol = '\n';
    this.editing = false;
    this.wrap = false;
    this.mountPoint = null;

    this.el = document.createElement('section');
    this.el.className = 'column';
    this.el.innerHTML = `
      <header class="column-header">
        <span class="column-title"></span>
        <span class="column-spacer"></span>
        <button class="column-detach" title="Sposta in una nuova finestra" aria-label="Sposta in una nuova finestra">
          <span class="icon" style="--icon: url(/icons/open_in_new.svg)"></span>
        </button>
        <button class="column-close" title="Chiudi colonna" aria-label="Chiudi colonna">×</button>
      </header>
      <button class="column-close-overlay" title="Chiudi documento" aria-label="Chiudi documento">×</button>
      <div class="column-scroller">
        <div class="sheet">
          <article class="markdown-body">
            <p class="placeholder">Apri un file .md oppure trascinalo qui.</p>
          </article>
          <textarea class="editor" wrap="off" spellcheck="false" aria-label="Testo Markdown"></textarea>
          <button class="bookmark" title="Trascina per spostare il punto di lettura, clic per toglierlo" aria-label="Togli il punto di lettura" hidden></button>
        </div>
      </div>`;
    this.title = this.el.querySelector('.column-title');
    this.scroller = this.el.querySelector('.column-scroller');
    this.sheet = this.el.querySelector('.sheet');
    this.content = this.el.querySelector('.markdown-body');
    this.editor = this.el.querySelector('.editor');
    this.mark = this.el.querySelector('.bookmark');
    // Set when the document opens at its reading point: the point is kept in view while images load,
    // until the user scrolls
    this.followMark = false;
    this.bindEvents();
  }

  bindEvents() {
    this.el.addEventListener('mousedown', () => activate(this));
    this.el.addEventListener('focusin', () => activate(this));
    // Scrolled into view on click, not on mousedown, so the content does not move under a click in progress
    // (instant: a smooth scroll started by a click inside the column gets cancelled)
    this.el.addEventListener('click', () => revealColumn(this, 'instant'));
    this.content.addEventListener('click', (e) => this.onLinkClick(e));
    // The hint of an empty column opens the file dialog (the column is already active, from mousedown)
    this.content.addEventListener('click', (e) => { if (e.target.closest('.placeholder')) openDialog(); });
    this.content.addEventListener('auxclick', (e) => { if (e.button === 1) this.onLinkClick(e); });
    this.el.querySelector('.column-close').addEventListener('click', () => closeColumn(this));
    this.el.querySelector('.column-close-overlay').addEventListener('click', () => closeColumn(this));
    this.el.querySelector('.column-detach').addEventListener('click', () => detachColumn(this));
    this.el.querySelector('.column-header').addEventListener('pointerdown', (e) => startColumnDrag(this, e));
    // A click removes the reading point, unless it ends a drag of the tab
    this.mark.addEventListener('pointerdown', (e) => startMarkDrag(this, e));
    this.mark.addEventListener('click', () => {
      if (!this.markDragged) removeBookmark(this.path);
      this.markDragged = false;
    });
    for (const type of ['wheel', 'pointerdown', 'keydown']) {
      this.el.addEventListener(type, () => { this.followMark = false; }, { passive: true });
    }
    // Zoom, page width, wrapping and loading images move the reading point
    new ResizeObserver(() => {
      this.placeMark();
      if (this.followMark) this.scrollToMark();
    }).observe(this.content);

    this.editor.addEventListener('input', () => { this.fitEditor(); updateUI(); });
    // Tab inserts a tab character instead of moving the focus (execCommand keeps the undo history)
    this.editor.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      document.execCommand('insertText', false, '\t');
    });

    // Drag & drop: the file is read in the page, its location on disk is not available.
    // On a loaded column, dropping near an edge opens the file in a new column on that side
    this.el.addEventListener('dragover', (e) => { e.preventDefault(); this.showDropZone(this.dropZone(e)); });
    this.el.addEventListener('dragleave', (e) => { if (!this.el.contains(e.relatedTarget)) this.showDropZone(null); });
    this.el.addEventListener('drop', (e) => {
      e.preventDefault();
      const zone = this.dropZone(e);
      this.showDropZone(null);
      // Folders only fill the file list (entries must be taken now: the data transfer is emptied after the event)
      const folders = [...e.dataTransfer.items].map((item) => item.webkitGetAsEntry?.()).filter((entry) => entry?.isDirectory);
      if (folders.length) { addDroppedFolders(folders); return; }
      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (zone === 'center') this.openDropped(file);
      else openDroppedInNewColumn(file, this, zone);
    });
  }

  dropZone(e) {
    if (!this.loaded) return 'center';
    const rect = this.el.getBoundingClientRect();
    const edge = Math.min(rect.width * 0.25, 200);
    if (e.clientX < rect.left + edge) return 'left';
    if (e.clientX > rect.right - edge) return 'right';
    return 'center';
  }

  showDropZone(zone) {
    this.el.classList.toggle('dragging', zone === 'center');
    this.el.classList.toggle('drop-left', zone === 'left');
    this.el.classList.toggle('drop-right', zone === 'right');
  }

  isDirty() {
    return this.editor.value !== this.savedText;
  }

  // Resolves a relative link (URL syntax) against the folder of the document
  resolvePath(href) {
    const target = decodeURIComponent(href).replace(/\//g, '\\');
    if (/^[a-zA-Z]:\\/.test(target)) return target;

    const base = this.path ? dirOf(this.path) : '';
    const parts = target.startsWith('\\') ? [base.slice(0, 2)] : base.split('\\');
    for (const segment of target.split('\\')) {
      if (segment === '' || segment === '.') continue;
      if (segment === '..') { if (parts.length > 1) parts.pop(); }
      else parts.push(segment);
    }
    return parts.join('\\');
  }

  async mountFolder(folder) {
    if (this.mountPoint) await Neutralino.server.unmount(this.mountPoint).catch(() => {});
    this.mountPoint = `/doc${++mountCounter}`;
    await Neutralino.server.mount(this.mountPoint, folder);
  }

  // GitHub-style heading ids, so that "#section" links work
  addHeadingIds() {
    const used = new Map();
    for (const heading of this.content.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
      const slug = heading.textContent.trim().toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]/gu, '')
        .replace(/\s/g, '-');
      const count = used.get(slug) || 0;
      used.set(slug, count + 1);
      heading.id = count ? `${slug}-${count}` : slug;
    }
  }

  renderMarkdown(markdown) {
    const fragment = DOMPurify.sanitize(marked.parse(markdown), {
      FORBID_TAGS: ['form', 'iframe', 'object', 'embed', 'base', 'meta'],
      RETURN_DOM_FRAGMENT: true
    });
    // Rewritten before the fragment enters the page, so no request goes to the wrong URL
    if (this.mountPoint) {
      for (const el of fragment.querySelectorAll('[src]')) {
        const src = el.getAttribute('src');
        if (RELATIVE_URL.test(src)) el.setAttribute('src', `${this.mountPoint}/${src}`);
      }
    }
    this.content.replaceChildren(fragment);
    this.addHeadingIds();
    this.renderedText = markdown;
    this.placeMark();
  }

  // The reading point is the first line in view (or the given height in the window): the top-level block
  // it falls in, how far into it, and the start of the block's text, to find the block again if the
  // document has changed
  readingPoint(top = this.scroller.getBoundingClientRect().top) {
    const blocks = [...this.content.children];
    const index = blocks.findIndex((block) => block.getBoundingClientRect().bottom > top);
    if (index < 0) return null;
    const rect = blocks[index].getBoundingClientRect();
    const fraction = rect.height ? Math.min(1, Math.max(0, (top - rect.top) / rect.height)) : 0;
    return { block: index, fraction, text: blocks[index].textContent.trim().slice(0, 80) };
  }

  findBlock(bookmark) {
    const blocks = [...this.content.children];
    const sameText = (block) => block.textContent.trim().slice(0, 80) === bookmark.text;
    const block = blocks[bookmark.block];
    if (block && sameText(block)) return block;
    return blocks.find(sameText) || blocks[Math.min(bookmark.block, blocks.length - 1)];
  }

  // The tab hangs from the reading point, on the right margin of the rendered document
  placeMark() {
    const bookmark = this.path && bookmarks[this.path];
    const block = bookmark && this.loaded && !this.editing && this.findBlock(bookmark);
    this.mark.hidden = !block;
    if (block) this.mark.style.top = `${block.offsetTop + bookmark.fraction * block.offsetHeight}px`;
  }

  // Returns false if the document has no reading point
  scrollToMark() {
    if (this.mark.hidden) return false;
    this.scroller.scrollTop += this.mark.getBoundingClientRect().top - this.scroller.getBoundingClientRect().top;
    return true;
  }

  async render(text, name, path, dropped = null) {
    this.path = path;
    this.name = name;
    this.dropped = dropped;
    if (path) await this.mountFolder(dirOf(path));
    else if (this.mountPoint) {
      await Neutralino.server.unmount(this.mountPoint).catch(() => {});
      this.mountPoint = null;
    }

    this.eol = text.includes('\r\n') ? '\r\n' : '\n';
    this.savedText = text.replace(/\r\n/g, '\n');
    this.editor.value = this.savedText;
    this.renderMarkdown(this.savedText);
    this.setEditing(false);
    this.loaded = true;
    this.placeMark();
    if (path) addVisited(path);
    updateUI();
    saveState();
  }

  // The textarea grows with its text, so the column scrolls as a whole like the rendered document
  fitEditor() {
    const scroll = this.scroller.scrollTop;
    this.editor.style.height = 'auto';
    // Plus the horizontal scrollbar, if any (the border-box height includes it, scrollHeight does not)
    this.editor.style.height = `${this.editor.scrollHeight + this.editor.offsetHeight - this.editor.clientHeight}px`;
    this.scroller.scrollTop = scroll;
  }

  // Long lines (code blocks and the source) wrap instead of scrolling sideways, for this column only
  setWrap(value) {
    this.wrap = value;
    this.sheet.classList.toggle('wrap', value);
    this.editor.wrap = value ? 'soft' : 'off';
    if (this.editing) this.fitEditor();
    updateUI();
    saveState();
  }

  // Inserts a block on lines of its own at the caret, separated by blank lines (execCommand keeps the undo history)
  insertBlock(block) {
    const { value, selectionStart, selectionEnd } = this.editor;
    const before = value.slice(0, selectionStart);
    const after = value.slice(selectionEnd);
    const prefix = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const suffix = after.startsWith('\n\n') ? '' : after.startsWith('\n') || !after ? '\n' : '\n\n';
    this.editor.focus({ preventScroll: true });
    document.execCommand('insertText', false, `${prefix}${block}${suffix}`);
  }

  setEditing(value) {
    this.editing = value;
    this.sheet.classList.toggle('editing', value);
    if (value) this.fitEditor();
    else if (this.renderedText !== this.editor.value) this.renderMarkdown(this.editor.value);
    this.placeMark();
  }

  // The sheet turns on itself: half turn, swap of the face, half turn back; the scroll position is kept in proportion
  async flip() {
    if (!this.loaded || this.sheet.getAnimations().length) return;
    const range = this.scroller.scrollHeight - this.scroller.clientHeight;
    const ratio = range > 0 ? this.scroller.scrollTop / range : 0;
    const turn = (from, to, easing) => this.sheet.animate([
      { transform: `perspective(2000px) rotateY(${from}deg)` },
      { transform: `perspective(2000px) rotateY(${to}deg)` }
    ], { duration: 160, easing }).finished;

    await turn(0, 90, 'ease-in');
    this.setEditing(!this.editing);
    updateUI();
    this.scroller.scrollTop = ratio * (this.scroller.scrollHeight - this.scroller.clientHeight);
    const back = turn(-90, 0, 'ease-out');
    if (this.editing) this.editor.focus({ preventScroll: true });
    await back;
  }

  // Returns false if nothing was written (dialog cancelled or write error)
  async save() {
    if (!this.isDirty()) return true;
    let path = this.path;
    if (!path) {
      path = await Neutralino.os.showSaveDialog('Salva file Markdown', {
        defaultPath: this.name,
        filters: [{ name: 'Markdown', extensions: MD_EXTENSIONS }]
      }).catch(() => '');
      if (!path) return false;
      path = path.replace(/\//g, '\\');
    }
    const text = this.editor.value;
    try {
      await Neutralino.filesystem.writeFile(path, text.replace(/\n/g, this.eol));
    } catch (err) {
      Neutralino.os.showMessageBox('Errore', `Impossibile salvare il file:\n${path}`, 'OK', 'ERROR');
      return false;
    }
    this.savedText = text;
    if (path !== this.path) {
      // A dropped file saved to disk becomes a regular file: relative links and images now resolve
      this.path = path;
      this.dropped = null;
      this.name = fileName(path);
      await this.mountFolder(dirOf(path));
      this.renderMarkdown(text);
      addVisited(path);
      saveState();
    }
    updateUI();
    return true;
  }

  async discard() {
    if (!this.isDirty()) return;
    const choice = await Neutralino.os.showMessageBox('Annulla modifiche',
      `Annullare tutte le modifiche a ${this.name}?`, 'OK_CANCEL', 'WARNING');
    if (choice !== 'OK') return;
    this.editor.value = this.savedText;
    if (this.editing) this.fitEditor();
    else this.renderMarkdown(this.savedText);
    updateUI();
  }

  // Before leaving the document: returns false if the user chose to stay
  async confirmLeave() {
    if (!this.isDirty()) return true;
    const choice = await Neutralino.os.showMessageBox('Modifiche non salvate',
      `Salvare le modifiche a ${this.name}?`, 'YES_NO_CANCEL', 'QUESTION');
    if (choice === 'YES') return this.save();
    return choice === 'NO';
  }

  scrollToAnchor(anchor) {
    const target = anchor && this.content.querySelector(`[id="${CSS.escape(decodeURIComponent(anchor))}"]`);
    if (target) target.scrollIntoView();
    else this.scroller.scrollTo(0, 0);
  }

  // Loads a file, at the anchor or else at its reading point; returns false if it cannot be read
  async loadPath(path, anchor) {
    try {
      const text = await Neutralino.filesystem.readFile(path);
      await this.render(text, fileName(path), path);
      this.followMark = !anchor && this.scrollToMark();
      if (!this.followMark) this.scrollToAnchor(anchor);
      return true;
    } catch (err) {
      Neutralino.os.showMessageBox('Errore', `Impossibile aprire il file:\n${path}`, 'OK', 'ERROR');
      return false;
    }
  }

  async navigateTo(path, anchor) {
    if (showIfOpen(path, anchor, this)) return;
    if (!(await this.confirmLeave())) return;
    const previous = this.path;
    if (await this.loadPath(path, anchor)) {
      if (previous) this.back.push(previous);
      this.forward.length = 0;
      updateUI();
      saveState();
    }
  }

  async goBack() {
    if (!this.back.length || showIfOpen(this.back[this.back.length - 1])) return;
    if (!(await this.confirmLeave())) return;
    const path = this.back.pop();
    if (this.path) this.forward.push(this.path);
    await this.loadPath(path);
    updateUI();
    saveState();
  }

  async goForward() {
    if (!this.forward.length || showIfOpen(this.forward[this.forward.length - 1])) return;
    if (!(await this.confirmLeave())) return;
    const path = this.forward.pop();
    if (this.path) this.back.push(this.path);
    await this.loadPath(path);
    updateUI();
    saveState();
  }

  async openDropped(file) {
    if (!(await this.confirmLeave())) return;
    if (this.path) this.back.push(this.path);
    this.forward.length = 0;
    await this.render(await file.text(), file.name, null, file);
    this.scroller.scrollTo(0, 0);
  }

  onLinkClick(e) {
    const link = e.target.closest('a[href]');
    if (!link) return;
    e.preventDefault();

    const href = link.getAttribute('href');
    if (href.startsWith('#')) {
      this.scrollToAnchor(href.slice(1));
      return;
    }
    if (/^(https?|mailto):/i.test(href)) {
      Neutralino.os.open(href);
      return;
    }
    if (!this.path && !/^file:/i.test(href)) {
      Neutralino.os.showMessageBox('Link non disponibile',
        'I link relativi funzionano solo per i file aperti con "Apri": il file trascinato non ha un percorso noto.',
        'OK', 'WARNING');
      return;
    }

    const [pathPart, anchor] = href.replace(/^file:\/+/i, '').split('#');
    if (!pathPart) return;
    const path = this.resolvePath(pathPart);
    if (!MD_EXTENSIONS.includes(extensionOf(path))) Neutralino.os.open(path);
    // Ctrl+click and middle click open the document in a new column
    else if (e.ctrlKey || e.button === 1) openInNewColumn(path, anchor);
    else this.navigateTo(path, anchor);
  }
}

// Columns side by side; the sidebar commands act on the active one
const columns = [];
let active = null;

// A new column goes to the right of the active one, unless an index is given
function addColumn(index = active ? columns.indexOf(active) + 1 : columns.length) {
  const column = new Column();
  columns.splice(index, 0, column);
  columnsEl.insertBefore(column.el, columnsEl.children[index] || null);
  column.sheet.style.zoom = zoom / 100;
  activate(column);
  return column;
}

// A file is open in one column only: a request for a file already open brings its column into view.
// from is the column the request comes from: a link to its own document just scrolls to the anchor
function showIfOpen(path, anchor, from) {
  const column = columns.find((c) => c.path === path);
  if (!column) return false;
  activate(column);
  revealColumn(column);
  if (anchor || column === from) column.scrollToAnchor(anchor);
  return true;
}

// The empty column shown at startup is used instead of adding one next to it
async function openInNewColumn(path, anchor) {
  if (showIfOpen(path, anchor)) return;
  if (!active.loaded) { await active.navigateTo(path, anchor); return; }
  // Revealed once loaded: an empty column has no minimum width, so it would not be fully in view
  const column = addColumn();
  if (!(await column.loadPath(path, anchor))) closeColumn(column);
  else revealColumn(column);
  saveState();
}

// A file dropped near the edge of a column opens in a new column on that side
// (the empty column shown at startup is used instead)
async function openDroppedInNewColumn(file, beside, side) {
  if (!beside.loaded) { await beside.openDropped(file); return; }
  const column = addColumn(columns.indexOf(beside) + (side === 'right' ? 1 : 0));
  await column.openDropped(file);
  revealColumn(column);
}

// Moves the document to a window of its own: a new instance opens it (detached through "start", so it
// outlives this one), next to this window (--at, otherwise it would open centered on the main screen),
// and the column closes here. Unsaved changes are saved or dropped first, since the new
// window reads the file from disk; a dropped file has no path and cannot be moved
async function detachColumn(column) {
  if (!column.path || columns.length < 2 || !(await column.confirmLeave())) return;
  const quote = (arg) => `"${arg}"`;
  const flags = NL_ARGS.slice(1).filter((arg) => arg.startsWith('--') && !arg.startsWith('--at='));
  const position = await Neutralino.window.getPosition().catch(() => null);
  if (position) flags.push(`--at=${position.x + CASCADE_STEP},${position.y + CASCADE_STEP}`);
  const command = ['start', '""', quote(NL_ARGS[0]), ...flags.map(quote), '--new-window', quote(column.path)].join(' ');
  try {
    await Neutralino.os.execCommand(`cmd /c ${command}`, { background: true });
  } catch (err) {
    Neutralino.os.showMessageBox('Errore', 'Impossibile aprire una nuova finestra.', 'OK', 'ERROR');
    return;
  }
  column.savedText = column.editor.value;
  closeColumn(column);
}

// The last column is replaced by an empty one, unless it is already empty
async function closeColumn(column) {
  const last = columns.length < 2;
  if ((last && !column.loaded) || !(await column.confirmLeave())) return;
  const index = columns.indexOf(column);
  columns.splice(index, 1);
  column.el.remove();
  if (column.mountPoint) Neutralino.server.unmount(column.mountPoint).catch(() => {});
  if (last) {
    active = null;
    addColumn();
    Neutralino.window.setTitle('w3r');
  } else if (active === column) {
    active = null;
    activate(columns[Math.min(index, columns.length - 1)]);
  } else updateUI();
  saveState();
}

function moveColumn(column, index) {
  const from = columns.indexOf(column);
  if (index < 0 || index >= columns.length || index === from) return;
  columns.splice(from, 1);
  columns.splice(index, 0, column);
  columnsEl.insertBefore(column.el, columnsEl.children[index + (index > from ? 1 : 0)] || null);
  updateUI();
  saveState();
}

// Dragging a column header moves the column live: it swaps with a neighbor once the pointer passes
// the neighbor's middle; near the edges of the view the columns scroll
const DRAG_THRESHOLD = 5;
const EDGE_SCROLL_ZONE = 48;

function startColumnDrag(column, e) {
  if (e.button !== 0 || e.target.closest('.column-close')) return;
  const startX = e.clientX;
  let lastX = startX;
  let dragging = false;
  let edgeTimer = null;

  const reorder = () => {
    const index = columns.indexOf(column);
    const left = columns[index - 1];
    const right = columns[index + 1];
    const middle = (c) => { const r = c.el.getBoundingClientRect(); return r.left + r.width / 2; };
    if (left && lastX < middle(left)) moveColumn(column, index - 1);
    else if (right && lastX > middle(right)) moveColumn(column, index + 1);
  };

  const edgeScroll = () => {
    const view = columnsEl.getBoundingClientRect();
    if (lastX < view.left + EDGE_SCROLL_ZONE) columnsEl.scrollLeft -= 20;
    else if (lastX > view.right - EDGE_SCROLL_ZONE) columnsEl.scrollLeft += 20;
    else return;
    reorder();
  };

  const onMove = (ev) => {
    lastX = ev.clientX;
    if (!dragging) {
      if (Math.abs(lastX - startX) < DRAG_THRESHOLD) return;
      dragging = true;
      column.el.classList.add('moving');
      document.body.classList.add('column-dragging');
      edgeTimer = setInterval(edgeScroll, 30);
    }
    reorder();
  };

  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('blur', onUp);
    clearInterval(edgeTimer);
    column.el.classList.remove('moving');
    document.body.classList.remove('column-dragging');
    if (dragging) revealColumn(column);
  };

  // Listened on the window, not with pointer capture on the header: moving the column in the DOM
  // would release the capture and the drag would never end
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('blur', onUp);
}

// Reading points by file path, as saved in storage; read at startup and each time the window is selected
let bookmarks = {};

function hasBookmark(entry) {
  return !isDropped(entry) && !!bookmarks[entry];
}

// The documents with a reading point are always in the file list
function addBookmarked() {
  for (const path of Object.keys(bookmarks)) addVisited(path);
}

async function reloadBookmarks() {
  bookmarks = await loadBookmarks();
  addBookmarked();
  for (const column of columns) column.placeMark();
  updateUI();
  saveState();
}

// Only for a document on disk, shown rendered: a new reading point replaces the previous one.
// At the first line in view, or at the given height in the window
function setBookmark(column, top) {
  if (!column.loaded || !column.path || column.editing) return;
  const point = column.readingPoint(top);
  if (!point) return;
  bookmarks[column.path] = point;
  column.placeMark();
  updateUI();
  saveBookmark(column.path, point);
}

// The top of the line of text at that height, if there is one: lines are found at the left edge of the text
function lineTop(column, y) {
  const content = column.content.getBoundingClientRect();
  const padding = parseFloat(getComputedStyle(column.content).paddingLeft) * content.width / column.content.offsetWidth;
  const rect = document.caretRangeFromPoint(content.left + padding + 1, y)?.getBoundingClientRect();
  return rect?.height && Math.abs(rect.top + rect.height / 2 - y) < rect.height ? rect.top : y;
}

// Dragging the tab moves the reading point up or down, onto the lines of the text;
// near the top and bottom of the column the document scrolls
function startMarkDrag(column, e) {
  if (e.button !== 0) return;
  e.preventDefault();
  const startY = e.clientY;
  let lastY = startY;
  let dropY = null;
  let dragging = false;
  let edgeTimer = null;

  const follow = () => {
    dropY = lineTop(column, lastY);
    const sheet = column.sheet.getBoundingClientRect();
    // From window pixels to the pixels of the zoomed sheet
    const scale = sheet.height / column.sheet.offsetHeight;
    column.mark.style.top = `${(dropY - sheet.top) / scale}px`;
  };

  const edgeScroll = () => {
    const view = column.scroller.getBoundingClientRect();
    if (lastY < view.top + EDGE_SCROLL_ZONE) column.scroller.scrollTop -= 20;
    else if (lastY > view.bottom - EDGE_SCROLL_ZONE) column.scroller.scrollTop += 20;
    else return;
    follow();
  };

  const onMove = (ev) => {
    lastY = ev.clientY;
    if (!dragging) {
      if (Math.abs(lastY - startY) < DRAG_THRESHOLD) return;
      dragging = true;
      document.body.classList.add('mark-dragging');
      edgeTimer = setInterval(edgeScroll, 30);
    }
    follow();
  };

  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('blur', onUp);
    clearInterval(edgeTimer);
    document.body.classList.remove('mark-dragging');
    column.markDragged = dragging;
    if (dragging) setBookmark(column, dropY);
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('blur', onUp);
}

function removeBookmark(path) {
  if (!bookmarks[path]) return;
  delete bookmarks[path];
  for (const column of columns) column.placeMark();
  updateUI();
  saveBookmark(path, null);
}

// Closes the columns of the documents without a reading point (asking to save unsaved changes) and empties
// their list; the documents with a reading point stay open and listed
async function closeAll() {
  const choice = await Neutralino.os.showMessageBox('Chiudi tutto',
    'Chiudere i documenti senza punto di lettura e svuotare il loro elenco?', 'OK_CANCEL', 'QUESTION');
  if (choice !== 'OK') return;
  const closing = columns.filter((column) => !(column.path && bookmarks[column.path]));
  for (const column of closing) {
    if (!(await column.confirmLeave())) return;
  }
  for (const column of closing) {
    columns.splice(columns.indexOf(column), 1);
    column.el.remove();
    if (column.mountPoint) Neutralino.server.unmount(column.mountPoint).catch(() => {});
  }
  visited.length = 0;
  addBookmarked();
  if (!columns.includes(active)) active = null;
  if (!columns.length) {
    addColumn();
    Neutralino.window.setTitle('w3r');
  } else if (!active) activate(columns[0]);
  else updateUI();
  saveState();
}

// Scrolls the columns horizontally so the whole column is visible (its left edge, if it is wider than the view)
function revealColumn(column, behavior = 'smooth') {
  const view = columnsEl.getBoundingClientRect();
  const rect = column.el.getBoundingClientRect();
  let delta = 0;
  if (rect.left < view.left) delta = rect.left - view.left;
  else if (rect.right > view.right) delta = Math.min(rect.right - view.right, rect.left - view.left);
  if (delta) columnsEl.scrollBy({ left: delta, behavior });
}

// Columns hidden (even partly) beyond the left or right edge of the view
function hiddenColumns() {
  const view = columnsEl.getBoundingClientRect();
  return {
    left: columns.filter((c) => c.el.getBoundingClientRect().left < view.left - 1),
    right: columns.filter((c) => c.el.getBoundingClientRect().right > view.right + 1)
  };
}

function updateScrollButtons() {
  const { left, right } = hiddenColumns();
  btnScrollLeft.hidden = !left.length;
  btnScrollRight.hidden = !right.length;
}

function activate(column) {
  if (active === column) return;
  active = column;
  for (const c of columns) c.el.classList.toggle('active', c === column);
  updateUI();
}

// Sidebar buttons, window title and file list reflect the active column
function updateUI() {
  if (!active) return;
  btnBack.disabled = !active.back.length;
  btnForward.disabled = !active.forward.length;
  btnPrint.disabled = !active.loaded;
  btnBookmark.disabled = !active.loaded || !active.path || active.editing;
  btnEdit.disabled = !active.loaded;
  const dirty = active.isDirty();
  btnSave.disabled = !dirty;
  btnDiscard.disabled = !dirty;
  btnWrap.disabled = !active.loaded;
  btnWrap.classList.toggle('pressed', active.wrap);
  btnWrap.setAttribute('aria-pressed', active.wrap);
  btnInsert.disabled = !active.editing;
  if (!active.editing) insertMenu.hidePopover();

  const label = active.editing ? 'Anteprima (Ctrl+E)' : 'Modifica (Ctrl+E)';
  btnEdit.title = label;
  btnEdit.setAttribute('aria-label', label);
  btnEdit.querySelector('.icon').style.setProperty('--icon', `url(/icons/${active.editing ? 'visibility' : 'edit'}.svg)`);

  const title = active.loaded ? `${dirty ? '● ' : ''}${active.name}` : 'w3r';
  document.title = title;
  if (active.loaded) Neutralino.window.setTitle(`${title} - w3r`);

  // Column headers are shown only with more than one column
  columnsEl.classList.toggle('multi', columns.length > 1);
  for (const column of columns) {
    column.title.textContent = column.loaded ? `${column.isDirty() ? '● ' : ''}${column.name}` : 'Nessun documento';
    column.title.title = column.path || column.name;
    column.el.classList.toggle('dirty', column.isDirty());
    column.el.classList.toggle('empty', !column.loaded);
    column.el.classList.toggle('on-disk', !!column.path);
  }
  // The file list is useful only with at least two files, or with a reading point to go back to
  const unmarked = visited.filter((entry) => !hasBookmark(entry));
  fileList.hidden = visited.length < 2 && !visited.some(isDropped) && !visited.some(hasBookmark);
  fileListCount.textContent = `${unmarked.length} documenti`;
  btnCloseAll.disabled = !unmarked.length;
  renderFileList();
  updateScrollButtons();
}

// Files seen in this window, in order of first visit, as paths. The Markdown files of a dropped folder are
// listed too, as { key, file }: key is the path inside the dropped folder, the location on disk is unknown,
// so they can be opened only while the window lives. A file open in a column shows the column number
const visited = [];

function isDropped(entry) {
  return typeof entry !== 'string';
}

function addVisited(path) {
  if (!visited.includes(path)) visited.push(path);
}

function columnsShowing(entry) {
  return columns.filter((c) => (isDropped(entry) ? c.dropped === entry.file : c.path === entry));
}

// A folder dropped again updates its entries (and the columns showing them) instead of repeating them
async function addDroppedFolders(folders) {
  const found = [];
  try {
    for (const folder of folders) await collectMarkdown(folder, found);
  } catch (err) {
    Neutralino.os.showMessageBox('Errore', 'Impossibile leggere la cartella trascinata.', 'OK', 'ERROR');
    return;
  }
  if (!found.length) {
    Neutralino.os.showMessageBox('Nessun documento', 'La cartella non contiene file Markdown.', 'OK', 'INFO');
    return;
  }
  found.sort((a, b) => a.key.localeCompare(b.key));
  for (const { key, file } of found) {
    const entry = visited.find((e) => isDropped(e) && e.key === key);
    if (!entry) { visited.push({ key, file }); continue; }
    for (const column of columnsShowing(entry)) column.dropped = file;
    entry.file = file;
  }
  updateUI();
}

// Markdown files of a folder and its subfolders, hidden folders and node_modules excluded
async function collectMarkdown(folder, found) {
  const reader = folder.createReader();
  let batch;
  do {
    batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    for (const entry of batch) {
      if (entry.isDirectory) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') await collectMarkdown(entry, found);
      } else if (MD_EXTENSIONS.includes(extensionOf(entry.name))) {
        found.push({ key: entry.fullPath, file: await new Promise((resolve, reject) => entry.file(resolve, reject)) });
      }
    }
  } while (batch.length);
}

// A path opens through navigation; a dropped file is read again from its File
function openEntry(entry, newColumn) {
  if (!isDropped(entry)) {
    if (newColumn) openInNewColumn(entry); else active.navigateTo(entry);
  } else if (newColumn) openDroppedInNewColumn(entry.file, active, 'right');
  else active.openDropped(entry.file);
}

// The documents with a reading point have a list of their own, at the bottom, by name
function renderFileList() {
  fileListItems.replaceChildren(...visited.filter((entry) => !hasBookmark(entry)).map(fileItem));
  const marked = Object.keys(bookmarks).sort((a, b) => fileName(a).localeCompare(fileName(b)));
  bookmarkList.hidden = !marked.length;
  bookmarkListItems.replaceChildren(...marked.map(fileItem));
}

function fileItem(entry) {
  const openIn = columnsShowing(entry);
  const item = document.createElement('li');
  item.className = openIn.length ? 'open' : '';
  item.classList.toggle('dirty', openIn.some((c) => c.isDirty()));
  item.classList.toggle('active', openIn.includes(active));
  item.title = isDropped(entry) ? `${entry.key.slice(1)} (cartella trascinata, percorso non noto)` : entry;

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = `${openIn.some((c) => c.isDirty()) ? '● ' : ''}${isDropped(entry) ? entry.file.name : fileName(entry)}`;
  const label = document.createElement('span');
  label.className = 'label';
  label.append(name);

  // Folder under the name, to tell apart files with the same name; the full path is in the tooltip
  const folder = isDropped(entry)
    ? entry.key.slice(1).split('/').slice(0, -1).join('/')
    : entry.split('\\').slice(0, -1).join('\\');
  if (folder) {
    const path = document.createElement('span');
    path.className = 'path';
    // Marks keep the path left to right inside the rtl box that cuts it on the left
    path.textContent = `‎${folder}‎`;
    label.append(path);
  }
  item.append(label);

  for (const column of openIn) {
    const number = columns.indexOf(column) + 1;
    const badge = document.createElement('span');
    badge.className = column === active ? 'badge active' : 'badge';
    badge.textContent = number;
    badge.title = `Aperto nella colonna ${number}`;
    item.append(badge);
  }

  // A reading point can be removed also while the document is open: the document goes back to the
  // list above, or leaves the list if it is not open
  const marked = hasBookmark(entry);
  if (marked || !openIn.length) {
    const remove = document.createElement('button');
    remove.className = 'remove';
    remove.textContent = '×';
    remove.title = marked ? 'Togli il punto di lettura' : 'Togli dall\'elenco';
    remove.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (marked) {
        const choice = await Neutralino.os.showMessageBox('Punto di lettura',
          `Togliere il punto di lettura di ${fileName(entry)}?`, 'OK_CANCEL', 'QUESTION');
        if (choice !== 'OK') return;
        removeBookmark(entry);
      }
      if (!openIn.length) visited.splice(visited.indexOf(entry), 1);
      updateUI();
      saveState();
    });
    item.append(remove);
  }

  // An open file: its column is brought into view; otherwise the file opens in the active column
  // Ctrl+click and middle click open the file in a new column
  item.addEventListener('auxclick', (e) => { if (e.button === 1) openEntry(entry, true); });
  item.addEventListener('click', (e) => {
    if (e.ctrlKey) { openEntry(entry, true); return; }
    const target = openIn.includes(active) ? active : openIn[0];
    if (!target) { openEntry(entry, false); return; }
    revealColumn(target);
    activate(target);
  });
  return item;
}

// The state survives a page reload, so the app never falls back to an empty page
function saveState() {
  try {
    sessionStorage.setItem('w3r-state', JSON.stringify({
      columns: columns.map((c) => ({ path: c.path, back: c.back, forward: c.forward, wrap: c.wrap })),
      active: columns.indexOf(active),
      visited: visited.filter((entry) => !isDropped(entry))
    }));
  } catch (err) { /* storage not available */ }
}

async function restoreState() {
  let state = null;
  try { state = JSON.parse(sessionStorage.getItem('w3r-state')); } catch (err) { /* nothing to restore */ }
  if (!state || !Array.isArray(state.columns)) return;
  for (const path of state.visited || []) addVisited(path);
  state.columns.forEach((saved, index) => {
    const column = index ? addColumn() : columns[0];
    column.back.push(...saved.back);
    column.forward.push(...saved.forward);
    if (saved.wrap) column.setWrap(true);
    // A file that can no longer be read would leave an empty column
    if (saved.path) column.loadPath(saved.path).then((ok) => { if (!ok) closeColumn(column); });
  });
  activate(columns[state.active] || columns[0]);
  updateUI();
}

// Zoom applies to the documents only (the CSS zoom property re-flows the text), the same for all columns;
// printing is always at 100%
const ZOOM_LEVELS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300];
let zoom = 100;
let zoomBadgeTimer = null;

settingZoom.append(...ZOOM_LEVELS.map((level) => new Option(`${level}%`, level)));

function setZoom(level, showBadge = true) {
  zoom = level;
  for (const column of columns) column.sheet.style.zoom = zoom / 100;
  columnsEl.style.setProperty('--zoom', zoom / 100);
  btnZoomIn.disabled = zoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
  btnZoomOut.disabled = zoom === ZOOM_LEVELS[0];
  btnZoomReset.disabled = zoom === 100;
  btnZoomReset.title = `Zoom ${zoom}% - ripristina 100% (Ctrl+0)`;
  settingZoom.value = zoom;
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

// With several files selected, the first one opens as requested and the others in new columns, in order
async function openDialog(newColumn = false) {
  const entries = await Neutralino.os.showOpenDialog('Apri file Markdown', {
    multiSelections: true,
    filters: [
      { name: 'Markdown', extensions: MD_EXTENSIONS.concat('txt') },
      { name: 'Tutti i file', extensions: ['*'] }
    ]
  });
  const paths = entries.map((entry) => entry.replace(/\//g, '\\'));
  for (const [index, path] of paths.entries()) {
    if (newColumn || index) await openInNewColumn(path);
    else await active.navigateTo(path);
  }
}

// Printing shows the rendered document of the active column, with the latest edits
function printDocument() {
  if (!active.loaded) return;
  if (active.renderedText !== active.editor.value) active.renderMarkdown(active.editor.value);
  window.print();
}

// The printed text keeps the width it has on screen (the page width, or less in a narrow window) and is
// scaled down to the printable width of the paper; set on beforeprint, so it applies to Ctrl+P from the
// webview as well
function printZoom() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position: absolute; visibility: hidden; width: var(--print-page-width)';
  document.body.append(probe);
  const pageWidth = probe.offsetWidth;
  probe.style.width = 'var(--sheet-padding-x)';
  const textWidth = active.sheet.clientWidth - 2 * probe.offsetWidth;
  probe.remove();
  return Math.min(1, pageWidth / textWidth);
}

// Tables and code blocks wider than the text scroll sideways on screen; in print each one is scaled down
// to the width of the text instead, so nothing is cut off. Measured on the rendered document, which is
// shown for the measure even while editing (the print shows it anyway)
let printScaled = [];

function unscaleWideBlocks() {
  for (const block of printScaled) block.style.zoom = '';
  printScaled = [];
}

function scaleWideBlocks() {
  unscaleWideBlocks();
  const content = active.content;
  content.style.display = 'block';
  for (const block of content.querySelectorAll('table, pre')) {
    if (printScaled.some((scaled) => scaled.contains(block))) continue;
    if (block.scrollWidth > block.clientWidth) {
      // The zoomed layout rounds on its own (differently in print): shrunk a little more, and again
      // until nothing sticks out
      let scale = block.clientWidth / block.scrollWidth * 0.99;
      do {
        block.style.zoom = scale;
        scale *= 0.995;
      } while (block.scrollWidth > block.clientWidth && scale > 0.1);
      printScaled.push(block);
    }
  }
  content.style.display = '';
}

window.addEventListener('beforeprint', () => {
  document.documentElement.style.setProperty('--print-zoom', printZoom());
  scaleWideBlocks();
});

window.addEventListener('afterprint', unscaleWideBlocks);

btnOpen.addEventListener('click', () => openDialog());
btnOpenColumn.addEventListener('click', () => openDialog(true));
btnCloseAll.addEventListener('click', closeAll);
btnPrint.addEventListener('click', printDocument);
btnBookmark.addEventListener('click', () => setBookmark(active));
btnEdit.addEventListener('click', () => active.flip());
btnSave.addEventListener('click', () => active.save());
btnDiscard.addEventListener('click', () => active.discard());
btnWrap.addEventListener('click', () => { if (active.loaded) active.setWrap(!active.wrap); });
// Insert menu, for the source of the active column: opens on the right of its button
const INSERTS = { 'page-break': '<!-- pagebreak -->' };
insertMenu.addEventListener('beforetoggle', (e) => {
  btnInsert.setAttribute('aria-expanded', e.newState === 'open');
  btnInsert.classList.toggle('pressed', e.newState === 'open');
  if (e.newState !== 'open') return;
  const rect = btnInsert.getBoundingClientRect();
  insertMenu.style.left = `${rect.right + 4}px`;
  insertMenu.style.top = `${rect.top}px`;
});
insertMenu.addEventListener('click', (e) => {
  const item = e.target.closest('[data-insert]');
  if (!item) return;
  insertMenu.hidePopover();
  if (active.editing) active.insertBlock(INSERTS[item.dataset.insert]);
});
btnBack.addEventListener('click', () => active.goBack());
btnForward.addEventListener('click', () => active.goForward());
btnZoomIn.addEventListener('click', () => zoomStep(1));
btnZoomOut.addEventListener('click', () => zoomStep(-1));
btnZoomReset.addEventListener('click', () => setZoom(100));

// Page width, the same for all columns: a preset or a custom width in pixels, within limits
const PAGE_WIDTHS = { narrow: 720, medium: 900, large: 1200 };
const PAGE_WIDTH_MIN = 480;
const PAGE_WIDTH_MAX = 2400;
let pageWidth = { preset: 'medium', custom: PAGE_WIDTHS.medium };

settingPageWidthCustom.min = PAGE_WIDTH_MIN;
settingPageWidthCustom.max = PAGE_WIDTH_MAX;

function applyPageWidth(settings) {
  const saved = settings.pageWidth || {};
  const custom = Number(saved.custom);
  pageWidth = {
    preset: saved.preset in PAGE_WIDTHS || saved.preset === 'custom' ? saved.preset : 'medium',
    custom: custom >= PAGE_WIDTH_MIN && custom <= PAGE_WIDTH_MAX ? custom : PAGE_WIDTHS.medium
  };
  const width = pageWidth.preset === 'custom' ? pageWidth.custom : PAGE_WIDTHS[pageWidth.preset];
  document.documentElement.style.setProperty('--sheet-width', `${width}px`);
}

function showPageWidth() {
  settingPageWidth.value = pageWidth.preset;
  settingPageWidthCustom.value = pageWidth.custom;
  settingPageWidthCustom.hidden = pageWidth.preset !== 'custom';
}

// App theme (system, light, dark) and Markdown theme, each with a light and a dark variant.
// Applied as data-scheme / data-md-theme on <html>; "system" follows the Windows setting
const THEMES = ['system', 'light', 'dark'];
const MD_THEMES = ['github', 'github-hc', 'solarized', 'academic'];
const systemDark = matchMedia('(prefers-color-scheme: dark)');
let theme = 'system';

function applyTheme(settings) {
  theme = THEMES.includes(settings.theme) ? settings.theme : 'system';
  const root = document.documentElement;
  root.dataset.scheme = theme === 'system' ? (systemDark.matches ? 'dark' : 'light') : theme;
  root.dataset.mdTheme = MD_THEMES.includes(settings.mdTheme) ? settings.mdTheme : 'github';
}

systemDark.addEventListener('change', () => { if (theme === 'system') applyTheme({ theme, mdTheme: document.documentElement.dataset.mdTheme }); });
// Another window may have changed the themes or the reading points
window.addEventListener('focus', async () => {
  const settings = await loadSettings();
  applyTheme(settings);
  applyPageWidth(settings);
  reloadBookmarks();
});

// Settings are shared by all windows: they are read again each time the panel opens
btnSettings.addEventListener('click', async () => {
  const settings = await loadSettings();
  settingNewWindow.checked = !!settings.newWindowPerFile;
  applyTheme(settings);
  settingTheme.value = theme;
  settingMdTheme.value = document.documentElement.dataset.mdTheme;
  applyPageWidth(settings);
  showPageWidth();
  settingsDialog.showModal();
});
for (const [select, key] of [[settingTheme, 'theme'], [settingMdTheme, 'mdTheme']]) {
  select.addEventListener('change', () => {
    applyTheme({ theme: settingTheme.value, mdTheme: settingMdTheme.value });
    saveSetting(key, select.value);
  });
}
settingPageWidth.addEventListener('change', () => {
  // A preset chosen as the custom starting point keeps the width of the previous one
  if (settingPageWidth.value === 'custom' && pageWidth.preset !== 'custom') pageWidth.custom = PAGE_WIDTHS[pageWidth.preset];
  pageWidth.preset = settingPageWidth.value;
  applyPageWidth({ pageWidth });
  showPageWidth();
  saveSetting('pageWidth', pageWidth);
});
// Out-of-range values are clamped once the field is left
settingPageWidthCustom.addEventListener('change', () => {
  const value = Math.round(Number(settingPageWidthCustom.value));
  if (!Number.isFinite(value) || settingPageWidthCustom.value === '') { showPageWidth(); return; }
  pageWidth.custom = Math.min(PAGE_WIDTH_MAX, Math.max(PAGE_WIDTH_MIN, value));
  applyPageWidth({ pageWidth });
  showPageWidth();
  saveSetting('pageWidth', pageWidth);
});
settingZoom.addEventListener('change', () => setZoom(Number(settingZoom.value)));
settingNewWindow.addEventListener('change', () => saveSetting('newWindowPerFile', settingNewWindow.checked));

// Windows lets a background process only flash the taskbar button: being topmost for a moment
// brings the window up anyway
async function bringToFront() {
  await Neutralino.window.unminimize().catch(() => {});
  await Neutralino.window.show().catch(() => {});
  await Neutralino.window.setAlwaysOnTop(true).catch(() => {});
  await Neutralino.window.focus().catch(() => {});
  await Neutralino.window.setAlwaysOnTop(false).catch(() => {});
}

// The nearest hidden column on that side is brought fully into view
btnScrollLeft.addEventListener('click', () => {
  const { left } = hiddenColumns();
  if (left.length) revealColumn(left[left.length - 1]);
});
// The next column is the first one hidden on the right that also starts right of the view's left edge:
// a column wider than the view, aligned on the left, sticks out on the right but is not the one to reveal;
// with none, scroll one view
btnScrollRight.addEventListener('click', () => {
  const viewLeft = columnsEl.getBoundingClientRect().left;
  const next = hiddenColumns().right.find((c) => c.el.getBoundingClientRect().left > viewLeft + 1);
  if (next) revealColumn(next);
  else columnsEl.scrollBy({ left: columnsEl.clientWidth, behavior: 'smooth' });
});
columnsEl.addEventListener('scroll', updateScrollButtons, { passive: true });
new ResizeObserver(updateScrollButtons).observe(columnsEl);

window.addEventListener('resize', () => {
  for (const column of columns) if (column.editing) column.fitEditor();
});

// Ctrl+wheel: replaces the native WebView zoom, which would also scale the sidebar
document.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  zoomStep(e.deltaY < 0 ? 1 : -1);
}, { passive: false });

document.addEventListener('keydown', (e) => {
  if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); active.goBack(); }
  if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); active.goForward(); }
  if (e.altKey && e.key.toLowerCase() === 'z' && active.loaded) { e.preventDefault(); active.setWrap(!active.wrap); }
  if (!e.ctrlKey) return;
  // Ctrl+Shift+PageUp/PageDown move the active column, as with browser tabs
  if (e.shiftKey && (e.key === 'PageUp' || e.key === 'PageDown')) {
    e.preventDefault();
    moveColumn(active, columns.indexOf(active) + (e.key === 'PageUp' ? -1 : 1));
    revealColumn(active);
  }
  if (e.key.toLowerCase() === 'o') { e.preventDefault(); openDialog(e.shiftKey); }
  if (e.key === 'p') { e.preventDefault(); printDocument(); }
  if (e.key === 'b') { e.preventDefault(); setBookmark(active); }
  if (e.key === 'e') { e.preventDefault(); active.flip(); }
  if (e.key === 's') { e.preventDefault(); active.save(); }
  if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomStep(1); }
  if (e.key === '-') { e.preventDefault(); zoomStep(-1); }
  if (e.key === '0') { e.preventDefault(); setZoom(100); }
});

// Mouse back/forward buttons: handled here, the WebView history is never used
document.addEventListener('mouseup', (e) => {
  if (e.button !== 3 && e.button !== 4) return;
  e.preventDefault();
  if (e.button === 3) active.goBack(); else active.goForward();
});
document.addEventListener('mousedown', (e) => { if (e.button === 3 || e.button === 4) e.preventDefault(); });

// Middle click / Ctrl+click would open links in a new WebView window
document.addEventListener('auxclick', (e) => e.preventDefault());

// Any drop outside a column would make the WebView navigate to the file
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

applyTheme({});
addColumn();
setZoom(100, false);

// "Open with" / drag onto the exe: the path arrives as a command-line argument
Neutralino.events.on('ready', async () => {
  const settings = await loadSettings();
  applyTheme(settings);
  applyPageWidth(settings);
  if (ZOOM_LEVELS.includes(settings.zoom)) setZoom(settings.zoom, false);

  const fileArg = NL_ARGS.slice(1).find((arg) => !arg.startsWith('--'));
  const newWindow = NL_ARGS.includes('--new-window');
  const path = fileArg && fileArg.replace(/\//g, '\\');
  const fullPath = path && (/^[a-zA-Z]:\\/.test(path) ? path : `${NL_CWD.replace(/\//g, '\\')}\\${path}`);

  // Unless each file wants its own window, a file opened from Explorer goes to the window selected last
  // and this instance quits without ever showing up
  // (--new-window: a column moved out of a window)
  if (fullPath && !newWindow && !settings.newWindowPerFile && (await handOff(fullPath))) {
    Neutralino.app.exit();
    return;
  }

  // The window starts hidden, so it shows up already in its cascade position (from --at, if given)
  const at = /^--at=(-?\d+),(-?\d+)$/.exec(NL_ARGS.find((arg) => arg.startsWith('--at=')) || '');
  if (at) await Neutralino.window.move(Number(at[1]), Number(at[2])).catch(() => {});
  await placeWindow();
  await Neutralino.window.show();
  if (newWindow) bringToFront();
  watchInbox(async (file) => {
    await openInNewColumn(file);
    bringToFront();
  });

  bookmarks = await loadBookmarks();
  if (fullPath) active.navigateTo(fullPath);
  else restoreState();
  addBookmarked();
  updateUI();
});

Neutralino.events.on('windowClose', async () => {
  for (const column of columns) {
    if (!(await column.confirmLeave())) return;
  }
  await removeInstance();
  Neutralino.app.exit();
});

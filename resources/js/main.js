Neutralino.init();

const columnsEl = document.getElementById('columns');
const btnOpen = document.getElementById('btn-open');
const btnPrint = document.getElementById('btn-print');
const btnCopyText = document.getElementById('btn-copy-text');
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
const btnReload = document.getElementById('btn-reload');
const btnWrap = document.getElementById('btn-wrap');
const alertMenu = document.getElementById('alert-menu');
const pathMenu = document.getElementById('path-menu');
const fileList = document.getElementById('file-list');
const fileListItems = document.getElementById('file-list-items');
const btnOpenColumn = document.getElementById('btn-open-column');
const btnCloseAll = document.getElementById('btn-close-all');
const btnFileList = document.getElementById('btn-file-list');
const fileListResizer = document.getElementById('file-list-resizer');
// Set by the user (toolbar button), the same for all windows (setting fileListHidden)
let fileListHidden = false;
const fileListCount = document.getElementById('file-list-count');
const bookmarkList = document.getElementById('bookmark-list');
const bookmarkListItems = document.getElementById('bookmark-list-items');
const btnScrollLeft = document.getElementById('btn-scroll-left');
const btnScrollRight = document.getElementById('btn-scroll-right');
const btnSettings = document.getElementById('btn-settings');
const settingsDialog = document.getElementById('settings');
const settingZoom = document.getElementById('setting-zoom');
const settingNewWindow = document.getElementById('setting-new-window');
const settingRestoreSession = document.getElementById('setting-restore-session');
const settingTheme = document.getElementById('setting-theme');
const settingMdTheme = document.getElementById('setting-md-theme');
const settingPageWidth = document.getElementById('setting-page-width');
const settingPageWidthCustom = document.getElementById('setting-page-width-custom');
const settingCheckUpdates = document.getElementById('setting-check-updates');
const btnCheckUpdates = document.getElementById('btn-check-updates');
const updateDialog = document.getElementById('update');

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
  }, {
    // Formulas: $$...$$ on lines of their own, $$...$$ and $...$ in the text (as on GitHub, $ is not
    // followed by a space, the closing one is not preceded by a space nor followed by a digit: "$5 and $10" is text)
    name: 'blockMath',
    level: 'block',
    start: (src) => src.match(/^ {0,3}\$\$/m)?.index,
    tokenizer(src) {
      const match = /^ {0,3}\$\$([\s\S]+?)\$\$[ \t]*(?:\n+|$)/.exec(src);
      if (match) return { type: 'blockMath', raw: match[0], text: match[1].trim() };
    },
    renderer: (token) => mathHtml(token.text, true)
  }, {
    name: 'inlineMath',
    level: 'inline',
    start: (src) => { const index = src.indexOf('$'); return index < 0 ? undefined : index; },
    tokenizer(src) {
      const match = /^\$\$((?:\\.|[^\\$])+?)\$\$/.exec(src) || /^\$(?!\s)((?:\\.|[^\\\n$])+?)(?<!\s)\$(?!\d)/.exec(src);
      if (match) return { type: 'inlineMath', raw: match[0], text: match[1].trim(), display: match[0].startsWith('$$') };
    },
    renderer: (token) => mathHtml(token.text, token.display, true)
  }]
});
marked.use(markedFootnote({ description: 'Note' }));
hljs.configure({ ignoreUnescapedHTML: true });

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// A formula shows its source until KaTeX draws it; the source stays in data-source, for the reading point
function mathHtml(tex, display, inline = false) {
  const tag = inline ? 'span' : 'div';
  const html = `<${tag} class="math ${display ? 'math-display' : 'math-inline'}" data-source="${escapeHtml(tex)}">${escapeHtml(tex)}</${tag}>`;
  return inline ? html : `${html}\n`;
}

// Front matter: the YAML block between --- lines at the start of the file (Jekyll, Hugo, Obsidian),
// shown as a table of its top-level keys; a block that is not key: value lines is shown as code
const FRONT_MATTER = /^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/;

function splitFrontMatter(markdown) {
  const match = FRONT_MATTER.exec(markdown);
  return match ? { frontMatter: match[1], body: markdown.slice(match[0].length) } : { frontMatter: null, body: markdown };
}

// Indented lines lose their common indentation; a block scalar (| or >) loses its indicator; a quoted value its quotes
function frontMatterValue([first, ...more]) {
  if (/^[|>][+-]?$/.test(first)) first = '';
  const indent = Math.min(...more.filter((line) => line.trim()).map((line) => /^\s*/.exec(line)[0].length));
  more = more.map((line) => line.slice(Number.isFinite(indent) ? indent : 0));
  const text = (first ? [first, ...more] : more).join('\n').trim();
  const quoted = /^(["'])(.*)\1$/.exec(text);
  return quoted && !text.includes('\n') ? quoted[2] : text;
}

function frontMatterElement(yaml) {
  const entries = [];
  for (const line of yaml.split('\n')) {
    if (/^\s*#/.test(line) || !line.trim()) {
      if (entries.length && !line.trim()) entries[entries.length - 1][1].push('');
      continue;
    }
    const match = /^([^\s#-][^:]*):(?:[ \t]+(.*)|[ \t]*$)/.exec(line);
    if (match) entries.push([match[1].trim(), [match[2]?.trim() ?? '']]);
    else if (entries.length && (/^\s/.test(line) || line.startsWith('-'))) entries[entries.length - 1][1].push(line);
    else { entries.length = 0; break; }
  }
  if (!entries.length) {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.className = 'language-yaml';
    code.textContent = yaml;
    pre.append(code);
    pre.classList.add('front-matter');
    return pre;
  }
  const table = document.createElement('table');
  table.className = 'front-matter';
  const body = table.createTBody();
  for (const [key, lines] of entries) {
    const row = body.insertRow();
    const th = document.createElement('th');
    th.textContent = key;
    row.append(th);
    row.insertCell().textContent = frontMatterValue(lines);
  }
  return table;
}

// GitHub alerts: a blockquote that starts with [!NOTE], [!TIP], [!IMPORTANT], [!WARNING] or [!CAUTION]
const ALERT_ICON_MARK = '<rect x="7.25" y="5.25" width="1.5" height="4" rx=".75"/><circle cx="8" cy="11.25" r=".9"/>';
const ALERTS = {
  note: ['Nota', '<circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="7.25" y="7" width="1.5" height="4.5" rx=".75"/><circle cx="8" cy="4.75" r=".9"/>'],
  tip: ['Suggerimento', '<path d="M8 1.5a4.5 4.5 0 0 0-2.7 8.1c.4.3.7.8.7 1.3V12h4v-1.1c0-.5.3-1 .7-1.3A4.5 4.5 0 0 0 8 1.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><rect x="6" y="13.25" width="4" height="1.5" rx=".75"/>'],
  important: ['Importante', '<path d="M2 2.25h12v8.5H7.25L4 13.5v-2.75H2Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><rect x="7.25" y="4" width="1.5" height="3.5" rx=".75"/><circle cx="8" cy="9" r=".9"/>'],
  warning: ['Attenzione', `<path d="M8 1.75 14.75 13.75H1.25Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>${ALERT_ICON_MARK}`],
  caution: ['Pericolo', `<path d="M5.3 1.75h5.4l3.55 3.55v5.4l-3.55 3.55H5.3L1.75 10.7V5.3Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>${ALERT_ICON_MARK}`]
};

function addAlerts(root) {
  for (const quote of root.querySelectorAll('blockquote')) {
    const first = quote.firstElementChild;
    const text = first?.tagName === 'P' ? first.firstChild : null;
    const match = text?.nodeType === Node.TEXT_NODE && /^\s*\[!(\w+)\][ \t]*(?:\n|$)/.exec(text.data);
    const type = match && match[1].toLowerCase();
    if (!ALERTS[type]) continue;
    text.data = text.data.slice(match[0].length);
    if (!first.textContent.trim() && !first.querySelector('img')) first.remove();
    const alert = document.createElement('div');
    alert.className = `markdown-alert markdown-alert-${type}`;
    const title = document.createElement('p');
    title.className = 'markdown-alert-title';
    title.innerHTML = `<svg class="octicon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">${ALERTS[type][1]}</svg>`;
    title.append(ALERTS[type][0]);
    alert.append(title, ...quote.childNodes);
    quote.replaceWith(alert);
  }
}

// Code blocks of a known language get syntax colors (the colors of the Markdown theme)
function highlightCode(root) {
  for (const code of root.querySelectorAll('pre > code[class*="language-"]')) {
    const language = /language-(\S+)/.exec(code.className)[1];
    if (hljs.getLanguage(language)) hljs.highlightElement(code);
  }
}

// ```math code blocks are formulas on lines of their own, as on GitHub
function mathCodeBlocks(root) {
  for (const code of root.querySelectorAll('pre > code.language-math')) {
    const div = document.createElement('div');
    div.className = 'math math-display';
    div.dataset.source = div.textContent = code.textContent.trim();
    code.parentElement.replaceWith(div);
  }
}

// Mermaid diagrams (```mermaid code blocks): the library is loaded by the first document that has one.
// Diagrams are drawn one at a time, since the library is configured globally
let mermaidLoading = null;
let diagramQueue = Promise.resolve();
let diagramCounter = 0;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => { script.remove(); reject(new Error(`${src} non disponibile`)); };
    document.head.append(script);
  });
}

function loadMermaid() {
  mermaidLoading ??= loadScript('/vendor/mermaid.min.js').then(() => window.mermaid, (err) => { mermaidLoading = null; throw err; });
  return mermaidLoading;
}

// KaTeX, for the formulas, is loaded by the first document that has one, with its stylesheet
let katexLoading = null;

function loadKatex() {
  katexLoading ??= Promise.all([
    loadScript('/vendor/katex/katex.min.js'),
    new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/vendor/katex/katex.min.css';
      link.onload = resolve;
      link.onerror = reject;
      document.head.append(link);
    })
  ]).then(() => window.katex, (err) => { katexLoading = null; throw err; });
  return katexLoading;
}

// Returns the SVG of the diagram; each drawing has its own id, which scopes its styles and arrowheads
async function drawDiagram(mermaid, source, theme, fontFamily) {
  const id = `diagram-${++diagramCounter}`;
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme, themeVariables: { fontFamily } });
  try {
    return (await mermaid.render(id, source)).svg;
  } finally {
    // Left in the page by a failed drawing
    document.getElementById(`d${id}`)?.remove();
  }
}

// The text that identifies a top-level block for the reading point: diagrams and formulas by their source,
// so the text is the same before and after they are drawn
function blockText(block) {
  let text = block.dataset.source;
  if (text === undefined) {
    if (block.querySelector('[data-source]')) {
      block = block.cloneNode(true);
      for (const el of block.querySelectorAll('[data-source]')) el.replaceWith(el.dataset.source);
    }
    text = block.textContent;
  }
  return text.trim().slice(0, 80);
}

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
    // Size and modification time of the file as last read or written; changed is set when the file
    // on disk no longer matches them (another program wrote it)
    this.stamp = null;
    this.changed = false;
    this.writing = false;
    this.editing = false;
    this.wrap = false;
    this.mountPoint = null;

    this.el = document.createElement('section');
    this.el.className = 'column';
    this.el.innerHTML = `
      <header class="column-header">
        <span class="column-title"></span>
        <span class="column-spacer"></span>
        <span class="column-actions">
          <button class="column-detach" title="Sposta in una nuova finestra" aria-label="Sposta in una nuova finestra">
            <span class="icon" style="--icon: url(/icons/open_in_new.svg)"></span>
          </button>
          <button class="column-close" title="Chiudi colonna" aria-label="Chiudi colonna">×</button>
        </span>
      </header>
      <button class="column-close-overlay" title="Chiudi documento" aria-label="Chiudi documento">×</button>
      <button class="column-path" aria-haspopup="menu"></button>
      <div class="edit-toolbar" role="toolbar" aria-label="Formattazione e inserimento">${editToolbarHtml()}</div>
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
    this.pathLine = this.el.querySelector('.column-path');
    this.scroller = this.el.querySelector('.column-scroller');
    this.sheet = this.el.querySelector('.sheet');
    this.content = this.el.querySelector('.markdown-body');
    this.editor = this.el.querySelector('.editor');
    this.toolbar = this.el.querySelector('.edit-toolbar');
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
    this.pathLine.addEventListener('click', () => { if (this.path) openPathMenu(this.pathLine, this.path); });
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

    this.editor.addEventListener('input', () => { this.edited = true; this.fitEditor(); updateUI(); });
    // The toolbar does not take the focus, so the selection in the source stays where it is
    this.toolbar.addEventListener('mousedown', (e) => e.preventDefault());
    this.toolbar.addEventListener('click', (e) => {
      const button = e.target.closest('[data-tool]');
      if (button && this.editing) applyTool(this, button.dataset.tool, button);
      this.scheduleToolbarUpdate();
    });
    for (const type of ['input', 'select', 'selectionchange', 'keyup', 'mouseup', 'focus']) {
      this.editor.addEventListener(type, () => this.scheduleToolbarUpdate());
    }
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
      const files = [...e.dataTransfer.files];
      if (files.length) this.openDroppedFiles(files, zone);
    });
  }

  // Dropped files are listed and opened: the first where dropped, the others in new columns on its right
  async openDroppedFiles(files, zone) {
    addDroppedFiles(files);
    let column = this;
    if (zone === 'center') await this.openDropped(files[0]);
    else column = await openDroppedInNewColumn(files[0], this, zone);
    for (const file of files.slice(1)) column = await openDroppedInNewColumn(file, column, 'right');
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
    const { frontMatter, body } = splitFrontMatter(markdown);
    const fragment = DOMPurify.sanitize(marked.parse(body), {
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
    if (frontMatter !== null) fragment.prepend(frontMatterElement(frontMatter));
    addAlerts(fragment);
    mathCodeBlocks(fragment);
    highlightCode(fragment);
    this.content.replaceChildren(fragment);
    this.addHeadingIds();
    this.renderedText = markdown;
    // Diagrams and formulas are drawn later: a document rendered again in the meantime drops the drawings
    const token = this.renderCount = (this.renderCount || 0) + 1;
    this.renderDiagrams(token);
    this.renderMath(token);
    this.placeMark();
  }

  async renderMath(token) {
    const formulas = [...this.content.querySelectorAll('.math')];
    if (!formulas.length) return;
    let katex;
    try {
      katex = await loadKatex();
    } catch (err) {
      return;
    }
    for (const el of formulas) {
      if (token !== this.renderCount) return;
      // Errors are shown in the formula, in red, with its source
      katex.render(el.dataset.source, el, { displayMode: el.classList.contains('math-display'), throwOnError: false });
    }
  }

  // The mermaid code blocks are replaced by their diagrams once drawn, in a light and a dark version
  // (the print is always light). A diagram that cannot be drawn keeps its code, with the error above it
  renderDiagrams(token) {
    const blocks = [...this.content.querySelectorAll('pre > code.language-mermaid')].map((code) => code.parentElement);
    if (!blocks.length) return;
    const fontFamily = getComputedStyle(this.content).fontFamily;
    diagramQueue = diagramQueue.then(async () => {
      let mermaid;
      try {
        mermaid = await loadMermaid();
      } catch (err) {
        return;
      }
      for (const pre of blocks) {
        if (token !== this.renderCount) return;
        const source = pre.textContent;
        const figure = document.createElement('div');
        figure.className = 'diagram';
        figure.dataset.source = source;
        try {
          for (const [theme, scheme] of [['default', 'light'], ['dark', 'dark']]) {
            const variant = document.createElement('div');
            variant.className = `diagram-${scheme}`;
            variant.innerHTML = await drawDiagram(mermaid, source, theme, fontFamily);
            figure.append(variant);
          }
        } catch (err) {
          const message = document.createElement('p');
          message.className = 'diagram-error';
          message.textContent = `Diagramma non valido: ${String(err?.message ?? err).split('\n')[0]}`;
          figure.replaceChildren(message, pre.cloneNode(true));
          figure.classList.add('invalid');
        }
        if (token === this.renderCount) pre.replaceWith(figure);
      }
    });
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
    return { block: index, fraction, text: blockText(blocks[index]) };
  }

  findBlock(bookmark) {
    const blocks = [...this.content.children];
    const sameText = (block) => blockText(block) === bookmark.text;
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

  async readStamp() {
    const stats = this.path && await Neutralino.filesystem.getStats(this.path).catch(() => null);
    this.stamp = stats ? { size: stats.size, modifiedAt: stats.modifiedAt } : null;
    this.changed = false;
  }

  // Sets changed if the file on disk differs from the one read or written last
  async checkChanged() {
    if (!this.path || !this.stamp || this.changed || this.writing) return;
    const { path, stamp } = this;
    const stats = await Neutralino.filesystem.getStats(path).catch(() => null);
    // The document may have changed, or been saved, in the meantime; a file gone missing is not reported
    if (!stats || path !== this.path || stamp !== this.stamp || this.writing) return;
    if (stats.size === stamp.size && stats.modifiedAt === stamp.modifiedAt) return;
    this.changed = true;
    updateUI();
  }

  // Reads the file again, keeping the view on the same block; unsaved changes are lost, after a confirmation
  async reload() {
    if (!this.path) return;
    if (this.isDirty()) {
      const choice = await Neutralino.os.showMessageBox('Ricarica',
        `${this.name} è stato modificato da un altro programma.\nRicaricarlo perdendo le modifiche non salvate?`, 'OK_CANCEL', 'WARNING');
      if (choice !== 'OK') return;
    }
    const editing = this.editing;
    const point = !editing && this.readingPoint();
    const ratio = this.scroller.scrollTop / Math.max(1, this.scroller.scrollHeight - this.scroller.clientHeight);
    let text;
    try {
      text = await Neutralino.filesystem.readFile(this.path);
    } catch (err) {
      Neutralino.os.showMessageBox('Errore', `Impossibile leggere il file:\n${this.path}`, 'OK', 'ERROR');
      return;
    }
    await this.render(text, this.name, this.path);
    this.followMark = false;
    if (editing) {
      this.setEditing(true);
      updateUI();
      this.scroller.scrollTop = ratio * (this.scroller.scrollHeight - this.scroller.clientHeight);
    } else if (point) {
      const block = this.findBlock(point);
      if (block) this.scroller.scrollTop += block.getBoundingClientRect().top + point.fraction * block.offsetHeight
        - this.scroller.getBoundingClientRect().top;
    }
  }

  async render(text, name, path, dropped = null) {
    this.path = path;
    this.name = name;
    this.dropped = dropped;
    await this.readStamp();
    if (path) await this.mountFolder(dirOf(path));
    else if (this.mountPoint) {
      await Neutralino.server.unmount(this.mountPoint).catch(() => {});
      this.mountPoint = null;
    }

    this.eol = text.includes('\r\n') ? '\r\n' : '\n';
    this.savedText = text.replace(/\r\n/g, '\n');
    this.setSource(this.savedText);
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

  // Replaces a range of the source and selects [selStart, selEnd] (execCommand keeps the undo history)
  replaceRange(start, end, text, selStart = start + text.length, selEnd = selStart) {
    this.editor.focus({ preventScroll: true });
    this.editor.setSelectionRange(start, end);
    if (text || start !== end) document.execCommand('insertText', false, text);
    this.editor.setSelectionRange(selStart, selEnd);
  }

  // Inserts a block on lines of its own in place of the selection, separated by blank lines;
  // select is the range to select inside the block (by default the caret goes after it)
  insertBlock(block, select = [block.length, block.length]) {
    const { value, selectionStart, selectionEnd } = this.editor;
    const before = value.slice(0, selectionStart);
    const after = value.slice(selectionEnd);
    const prefix = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const suffix = after.startsWith('\n\n') ? '' : after.startsWith('\n') || !after ? '\n' : '\n\n';
    const start = selectionStart + prefix.length;
    this.replaceRange(selectionStart, selectionEnd, `${prefix}${block}${suffix}`, start + select[0], start + select[1]);
  }

  // Puts markers around the selection (or a placeholder, selected); inside a span of that format
  // (span, from toolState) its markers are taken away instead, keeping the selection on the same text
  wrapSelection(mark, placeholder, span) {
    const { value, selectionStart: s, selectionEnd: e } = this.editor;
    const n = mark.length;
    if (span) {
      const inner = value.slice(span.start + n, span.end - n);
      const keep = (x) => Math.max(span.start, Math.min(span.start + inner.length, x - n));
      this.replaceRange(span.start, span.end, inner, keep(s), keep(e));
      return;
    }
    const text = value.slice(s, e) || placeholder;
    this.replaceRange(s, e, `${mark}${text}${mark}`, s + n, s + n + text.length);
  }

  // Source set from the program (file read, changes discarded): the undo history starts again
  setSource(text) {
    this.editor.value = text;
    this.edited = false;
    this.scheduleToolbarUpdate();
  }

  // The buttons of the toolbar show what the selection is in (once per frame, however many events).
  // Undo and redo: the browser knows its history only for the focused source, so the state is
  // read while this one has the focus; after setSource the browser still claims an undo, without one
  scheduleToolbarUpdate() {
    if (this.toolbarFrame) return;
    this.toolbarFrame = requestAnimationFrame(() => {
      this.toolbarFrame = 0;
      if (!this.editing) return;
      if (document.activeElement === this.editor) {
        this.history = { undo: document.queryCommandEnabled('undo'), redo: document.queryCommandEnabled('redo') };
      }
      const state = toolState(this.editor.value, this.editor.selectionStart, this.editor.selectionEnd);
      for (const button of this.toolbar.querySelectorAll('[data-tool]')) {
        const tool = button.dataset.tool;
        if (tool === 'undo' || tool === 'redo') {
          button.disabled = !(this.edited && this.history?.[tool]);
          continue;
        }
        const on = !!state[tool];
        button.classList.toggle('pressed', on);
        button.setAttribute('aria-pressed', on);
      }
    });
  }

  // Rewrites the whole lines touched by the selection with transform(lines); a caret goes to the end of
  // the lines rewritten, a selection covers them
  transformLines(transform) {
    const { value, selectionStart: s, selectionEnd: e } = this.editor;
    const start = value.lastIndexOf('\n', s - 1) + 1;
    const last = e > s && value[e - 1] === '\n' ? e - 1 : e;
    const end = value.indexOf('\n', last) < 0 ? value.length : value.indexOf('\n', last);
    const text = transform(value.slice(start, end).split('\n')).join('\n');
    if (s === e) this.replaceRange(start, end, text);
    else this.replaceRange(start, end, text, start, start + text.length);
  }

  setEditing(value) {
    this.editing = value;
    this.sheet.classList.toggle('editing', value);
    this.el.classList.toggle('editing', value);
    if (value) { this.fitEditor(); this.scheduleToolbarUpdate(); }
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
    if (path === this.path && this.changed) {
      const choice = await Neutralino.os.showMessageBox('Salva',
        `${this.name} è stato modificato da un altro programma.\nSovrascriverlo con le tue modifiche?`, 'OK_CANCEL', 'WARNING');
      if (choice !== 'OK') return false;
    }
    const text = this.editor.value;
    // The check for changes on disk is suspended, so this write is not taken for another program's
    this.writing = true;
    try {
      await Neutralino.filesystem.writeFile(path, text.replace(/\n/g, this.eol));
    } catch (err) {
      this.writing = false;
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
    await this.readStamp();
    this.writing = false;
    updateUI();
    return true;
  }

  async discard() {
    if (!this.isDirty()) return;
    const choice = await Neutralino.os.showMessageBox('Annulla modifiche',
      `Annullare tutte le modifiche a ${this.name}?`, 'OK_CANCEL', 'WARNING');
    if (choice !== 'OK') return;
    this.setSource(this.savedText);
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
// (the empty column shown at startup is used instead); returns the column of the file
async function openDroppedInNewColumn(file, beside, side) {
  if (!beside.loaded) { await beside.openDropped(file); return beside; }
  const column = addColumn(columns.indexOf(beside) + (side === 'right' ? 1 : 0));
  await column.openDropped(file);
  revealColumn(column);
  return column;
}

// Moves the document to a window of its own: a new instance opens it (detached through "start", so it
// outlives this one), next to this window (--at, otherwise it would open centered on the main screen),
// and the column closes here. Unsaved changes are saved or dropped first, since the new
// window reads the file from disk; a dropped file has no path and cannot be moved
async function detachColumn(column) {
  if (!column.path || columns.length < 2 || !(await column.confirmLeave())) return;
  const position = await Neutralino.window.getPosition().catch(() => null);
  const args = position ? [`--at=${position.x + CASCADE_STEP},${position.y + CASCADE_STEP}`] : [];
  try {
    await launchInstance([...args, '--new-window', column.path]);
  } catch (err) {
    Neutralino.os.showMessageBox('Errore', 'Impossibile aprire una nuova finestra.', 'OK', 'ERROR');
    return;
  }
  column.savedText = column.editor.value;
  closeColumn(column);
}

// Starts a new instance (detached through "start", so it outlives this one) with the flags of this one
// (e.g. those of the development mode) and the given arguments
async function launchInstance(args) {
  const quote = (arg) => `"${arg}"`;
  const flags = NL_ARGS.slice(1).filter((arg) => arg.startsWith('--') && !/^--(at|session)=/.test(arg) && arg !== '--new-window');
  const command = ['start', '""', quote(NL_ARGS[0]), ...[...flags, ...args].map(quote)].join(' ');
  await Neutralino.os.execCommand(`cmd /c ${command}`, { background: true });
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
  btnCopyText.disabled = !active.loaded;
  btnBookmark.disabled = !active.loaded || !active.path || active.editing;
  btnEdit.disabled = !active.loaded;
  const dirty = active.isDirty();
  btnSave.disabled = !dirty;
  btnDiscard.disabled = !dirty;
  btnReload.disabled = !active.changed;
  btnWrap.disabled = !active.loaded;
  btnWrap.classList.toggle('pressed', active.wrap);
  btnWrap.setAttribute('aria-pressed', active.wrap);
  if (alertMenuColumn && !alertMenuColumn.editing) alertMenu.hidePopover();

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
    column.title.textContent = column.loaded ? `${column.isDirty() ? '● ' : ''}${column.changed ? '↻ ' : ''}${column.name}` : 'Nessun documento';
    column.title.title = column.changed ? `${column.path}\nModificato da un altro programma` : column.path || column.name;
    column.el.classList.toggle('dirty', column.isDirty());
    column.el.classList.toggle('empty', !column.loaded);
    column.el.classList.toggle('on-disk', !!column.path);
    // Path of the document, cut on the left; the marks keep it left to right inside the rtl box
    if (column.pathLine.dataset.path !== (column.path || '')) {
      column.pathLine.dataset.path = column.path || '';
      column.pathLine.textContent = column.path ? `‎${column.path}‎` : '';
      column.pathLine.title = column.path || '';
    }
  }
  // The file list is useful only with at least two files, or with a reading point to go back to
  const unmarked = visited.filter((entry) => !hasBookmark(entry));
  // (hidden by the user, it stays hidden; the toolbar button shows it again)
  const listUseful = visited.length >= 2 || visited.some(isDropped) || visited.some(hasBookmark);
  fileList.hidden = !listUseful || fileListHidden;
  btnFileList.disabled = !listUseful;
  btnFileList.classList.toggle('pressed', !fileList.hidden);
  btnFileList.setAttribute('aria-pressed', !fileList.hidden);
  const toggleLabel = fileList.hidden ? `Mostra l'elenco dei file (${visited.length})` : "Nascondi l'elenco dei file";
  btnFileList.title = toggleLabel;
  btnFileList.setAttribute('aria-label', toggleLabel);
  btnFileList.querySelector('.icon').style.setProperty('--icon', `url(/icons/left_panel_${fileList.hidden ? 'open' : 'close'}.svg)`);
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
  addDroppedEntries(found);
}

// Dropped files are listed by name (their key has no folder), as the Markdown files of a dropped folder
function addDroppedFiles(files) {
  addDroppedEntries(files.map((file) => ({ key: `/${file.name}`, file })));
}

// An entry dropped again updates the one listed (and the columns showing it) instead of repeating it
function addDroppedEntries(found) {
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
  item.classList.toggle('editing', openIn.some((c) => c.editing));
  item.classList.toggle('dirty', openIn.some((c) => c.isDirty()));
  item.classList.toggle('active', openIn.includes(active));
  const droppedFrom = isDropped(entry) && entry.key.lastIndexOf('/') > 0 ? 'cartella trascinata' : 'file trascinato';
  item.title = isDropped(entry) ? `${entry.key.slice(1)} (${droppedFrom}, percorso non noto)` : entry;

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = `${openIn.some((c) => c.isDirty()) ? '● ' : ''}${openIn.some((c) => c.changed) ? '↻ ' : ''}${isDropped(entry) ? entry.file.name : fileName(entry)}`;
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
    // A click opens the menu of the path (copy, open in Explorer); a dropped file has none
    if (!isDropped(entry)) {
      path.classList.add('actionable');
      path.title = folder;
      path.addEventListener('click', (e) => {
        e.stopPropagation();
        openPathMenu(path, entry);
      });
    }
    label.append(path);
  }
  item.append(label);

  for (const column of openIn) {
    const number = columns.indexOf(column) + 1;
    const badge = document.createElement('span');
    badge.className = column === active ? 'badge active' : 'badge';
    badge.textContent = number;
    badge.title = `Aperto nella colonna ${number}`;
    // A pencil after the number while the column shows the editor
    if (column.editing) {
      const pencil = document.createElement('span');
      pencil.className = 'icon';
      pencil.style.setProperty('--icon', 'url(/icons/edit.svg)');
      badge.append(pencil);
      badge.classList.add('editing');
      badge.title += ', in modifica';
    }
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
      // Columns as they are now: they may have changed while the dialog was open
      const index = visited.indexOf(entry);
      if (!columnsShowing(entry).length && index >= 0) visited.splice(index, 1);
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

// The state survives a page reload, so the app never falls back to an empty page; it is also kept in the
// file of the instance, for the session restored at the next start
function saveState() {
  const state = {
    columns: columns.map((c) => ({ path: c.path, back: c.back, forward: c.forward, wrap: c.wrap })),
    active: columns.indexOf(active),
    visited: visited.filter((entry) => !isDropped(entry))
  };
  try {
    sessionStorage.setItem('w3r-state', JSON.stringify(state));
  } catch (err) { /* storage not available */ }
  setInstanceState(state);
}

// The state saved before a page reload, if any
function reloadState() {
  try { return JSON.parse(sessionStorage.getItem('w3r-state')); } catch (err) { return null; }
}

// A window of the last session opens again without its empty columns (and the dropped files, which have no path)
function sessionState(state) {
  if (!state || !Array.isArray(state.columns)) return null;
  const kept = state.columns.filter((c) => c.path);
  const active = kept.indexOf(state.columns[state.active]);
  return { ...state, columns: kept, active: Math.max(0, active) };
}

function restoreState(state) {
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
  flashBadge(`${zoom}%`);
}

// Short notice in the badge over the columns (zoom level, text copied), announced to screen readers
function flashBadge(text, duration = 1200) {
  zoomBadge.textContent = text;
  zoomBadge.classList.add('visible');
  clearTimeout(zoomBadgeTimer);
  zoomBadgeTimer = setTimeout(() => zoomBadge.classList.remove('visible'), duration);
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
  for (const block of content.querySelectorAll('table, pre, .math-display')) {
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

function setFileListHidden(value) {
  fileListHidden = value;
  updateUI();
  saveSetting('fileListHidden', value);
}
btnFileList.addEventListener('click', () => setFileListHidden(!fileListHidden));

// Width of the file list: dragged from its right edge, between the initial width and a maximum;
// a double click goes back to the initial width
const FILE_LIST_WIDTH_MIN = 210;
const FILE_LIST_WIDTH_MAX = 480;
let fileListWidth = FILE_LIST_WIDTH_MIN;

function setFileListWidth(width, save = true) {
  fileListWidth = Math.round(Math.max(FILE_LIST_WIDTH_MIN, Math.min(FILE_LIST_WIDTH_MAX, Number(width) || FILE_LIST_WIDTH_MIN)));
  document.documentElement.style.setProperty('--file-list-width', `${fileListWidth}px`);
  if (save) saveSetting('fileListWidth', fileListWidth);
}

fileListResizer.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  const startX = e.clientX;
  const startWidth = fileList.getBoundingClientRect().width;
  fileListResizer.setPointerCapture(e.pointerId);
  document.body.classList.add('resizing');
  const move = (ev) => setFileListWidth(startWidth + ev.clientX - startX, false);
  const end = () => {
    fileListResizer.removeEventListener('pointermove', move);
    fileListResizer.removeEventListener('pointerup', end);
    fileListResizer.removeEventListener('pointercancel', end);
    document.body.classList.remove('resizing');
    saveSetting('fileListWidth', fileListWidth);
  };
  fileListResizer.addEventListener('pointermove', move);
  fileListResizer.addEventListener('pointerup', end);
  fileListResizer.addEventListener('pointercancel', end);
});
fileListResizer.addEventListener('dblclick', () => setFileListWidth(FILE_LIST_WIDTH_MIN));
btnPrint.addEventListener('click', printDocument);
// Copies the document text as it is in the column (unsaved edits included), with its own line endings
btnCopyText.addEventListener('click', async () => {
  if (!active.loaded) return;
  try {
    await Neutralino.clipboard.writeText(active.editor.value.replace(/\n/g, active.eol));
    flashBadge('Testo copiato negli appunti', 3000);
  } catch (err) {
    Neutralino.os.showMessageBox('Errore', 'Impossibile copiare il testo in clipboard.', 'OK', 'ERROR');
  }
});
btnBookmark.addEventListener('click', () => setBookmark(active));
btnEdit.addEventListener('click', () => active.flip());
btnSave.addEventListener('click', () => active.save());
btnDiscard.addEventListener('click', () => active.discard());
btnReload.addEventListener('click', () => active.reload());
btnWrap.addEventListener('click', () => { if (active.loaded) active.setWrap(!active.wrap); });
// Toolbar over the source, while editing: formatting of the selection and blocks to insert
const EDIT_TOOLS = [
  { tool: 'undo', icon: 'edit_undo', title: 'Annulla (Ctrl+Z)' },
  { tool: 'redo', icon: 'edit_redo', title: 'Ripeti (Ctrl+Y)' },
  null,
  { tool: 'heading', icon: 'heading', title: 'Titolo: livello 1, 2, 3, nessuno' },
  { tool: 'bold', glyph: 'B', title: 'Grassetto' },
  { tool: 'italic', glyph: 'I', title: 'Corsivo' },
  { tool: 'strike', glyph: 'S', title: 'Barrato' },
  { tool: 'code', icon: 'code', title: 'Codice nel testo' },
  { tool: 'link', icon: 'link', title: 'Collegamento' },
  { tool: 'image', icon: 'image', title: 'Immagine' },
  null,
  { tool: 'bullet', icon: 'list_bulleted', title: 'Elenco puntato' },
  { tool: 'ordered', icon: 'list_numbered', title: 'Elenco numerato' },
  { tool: 'task', icon: 'checklist', title: 'Elenco di attività' },
  { tool: 'quote', icon: 'quote', title: 'Citazione' },
  null,
  { tool: 'table', icon: 'table', title: 'Tabella' },
  { tool: 'code-block', icon: 'code_block', title: 'Blocco di codice' },
  { tool: 'flowchart', icon: 'flowchart', title: 'Diagramma di flusso (Mermaid)' },
  { tool: 'formula', icon: 'formula', title: 'Formula (KaTeX)' },
  { tool: 'alert', icon: 'alert', title: 'Avviso', menu: true },
  { tool: 'footnote', icon: 'footnote', title: 'Nota a piè di pagina' },
  { tool: 'rule', icon: 'horizontal_rule', title: 'Linea orizzontale' },
  { tool: 'page-break', icon: 'page_break', title: 'Salto pagina' }
];

function editToolbarHtml() {
  return EDIT_TOOLS.map((item) => {
    if (!item) return '<span class="separator"></span>';
    const face = item.glyph
      ? `<span class="glyph glyph-${item.tool}">${item.glyph}</span>`
      : `<span class="icon" style="--icon: url(/icons/${item.icon}.svg)"></span>`;
    const menu = item.menu ? ' aria-haspopup="menu" aria-expanded="false"' : '';
    return `<button class="icon-btn small" data-tool="${item.tool}" title="${item.title}" aria-label="${item.title}"${menu}>${face}</button>`;
  }).join('');
}

const TABLE_TEMPLATE = '| Colonna 1 | Colonna 2 | Colonna 3 |\n| --- | --- | --- |\n| Testo | Testo | Testo |';
const FLOWCHART_TEMPLATE = '```mermaid\nflowchart TD\n    A[Inizio] --> B{Condizione?}\n    B -- Sì --> C[Azione]\n    B -- No --> D[Fine]\n    C --> D\n```';
// An existing list marker (task, bullet or number), after the indentation
const LIST_MARKER = /^(\s*)(?:[-*+] \[[ xX]\] |([-*+]) |(\d+)[.)] )?/;

// Turns the lines into a list of the kind given, or back to plain lines if they already are one;
// blank lines between the selected ones stay blank
function listKind(line) {
  const m = LIST_MARKER.exec(line);
  if (!m[0].trim()) return null;
  return m[2] ? 'bullet' : m[3] ? 'ordered' : 'task';
}

function isList(lines, kind) {
  const filled = lines.filter((line) => line.trim());
  return filled.length > 0 && filled.every((line) => listKind(line) === kind);
}

function listLines(lines, kind) {
  const off = isList(lines, kind);
  let number = 0;
  return lines.map((line) => {
    if (!line.trim() && lines.length > 1) return line;
    const m = LIST_MARKER.exec(line);
    const rest = line.slice(m[0].length);
    if (off) return m[1] + rest;
    const marker = kind === 'task' ? '- [ ] ' : kind === 'bullet' ? '- ' : `${++number}. `;
    return m[1] + marker + rest;
  });
}

// Inline formats: the patterns of a span on one line, the length of its markers
const INLINE_SPANS = {
  bold: [[/\*\*(?!\s)[^\n]*?(?<!\s)\*\*/g, /__(?!\s)[^\n]*?(?<!\s)__/g], 2],
  italic: [[/(?<![*\\])\*(?![\s*])[^*\n]*?(?<![\s*\\])\*(?!\*)/g, /(?<![\w\\])_(?![\s_])[^_\n]*?(?<![\s_\\])_(?!\w)/g], 1],
  strike: [[/~~(?!\s)[^\n]*?(?<!\s)~~/g], 2],
  code: [[/`[^`\n]+`/g], 1]
};
const LINK_SPAN = /!?\[[^\]\n]*\]\([^)\n]*\)/g;
const FOOTNOTE_SPAN = /\[\^[^\]\s]+\]/g;
const INLINE_MATH_SPAN = /\$(?!\s)[^$\n]*?(?<!\s)\$/g;
const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/;
const RULE_LINE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const PAGE_BREAK_LINE = /^ {0,3}(?:<!--\s*(?:pagebreak|newpage)\s*-->|\\(?:pagebreak|newpage))\s*$/i;
const ALERT_HEAD = /^ {0,3}>\s*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i;

// The span (start, end in the source) of one of the patterns around the selection, on the line given;
// a caret just before or after a span is outside it
function spanAround(patterns, line, lineStart, s, e) {
  for (const pattern of patterns) {
    for (const m of line.matchAll(pattern)) {
      const start = lineStart + m.index;
      const end = start + m[0].length;
      if (s >= start && e <= end && !(s === e && (s === start || s === end))) return { start, end, text: m[0] };
    }
  }
  return null;
}

// What the selection of the source is in: the tools to show pressed, with the inline spans found
function toolState(value, s, e) {
  const lineStart = value.lastIndexOf('\n', s - 1) + 1;
  const lineEnd = value.indexOf('\n', s) < 0 ? value.length : value.indexOf('\n', s);
  const line = value.slice(lineStart, lineEnd);
  const state = {};

  // Fenced code and formula blocks, from the start of the document to the line of the caret
  const before = value.slice(0, lineStart).split('\n');
  before.pop();
  let fence = null;
  let math = false;
  for (const text of before) {
    if (fence) {
      if (text.trim().startsWith(fence.mark) && !text.trim().slice(fence.mark.length).trim()) fence = null;
      continue;
    }
    const m = FENCE.exec(text);
    if (m && !math) { fence = { mark: m[1], info: m[2] }; continue; }
    const trimmed = text.trim();
    if (trimmed.startsWith('$$') && !(trimmed.length > 4 && trimmed.endsWith('$$'))) math = !math;
  }
  const opening = !fence && !math && FENCE.exec(line);
  if (fence || opening) {
    const info = (fence || { info: opening[2] }).info.toLowerCase();
    state[info === 'mermaid' ? 'flowchart' : 'code-block'] = true;
    return state;
  }
  if (math || line.trim().startsWith('$$')) { state.formula = true; return state; }

  const inline = (patterns) => (e <= lineEnd ? spanAround(patterns, line, lineStart, s, e) : null);
  for (const [tool, [patterns]] of Object.entries(INLINE_SPANS)) {
    const span = inline(patterns);
    if (span) state[tool] = span;
  }
  const link = inline([LINK_SPAN]);
  if (link) state[link.text.startsWith('!') ? 'image' : 'link'] = true;
  if (inline([INLINE_MATH_SPAN])) state.formula = true;
  if (inline([FOOTNOTE_SPAN]) || /^\[\^[^\]\s]+\]:/.test(line)) state.footnote = true;

  // Lines: the ones touched by the selection, as transformLines takes them
  const last = e > s && value[e - 1] === '\n' ? e - 1 : e;
  const end = value.indexOf('\n', last) < 0 ? value.length : value.indexOf('\n', last);
  const lines = value.slice(lineStart, end).split('\n');
  if (/^#{1,6}\s/.test(line)) state.heading = true;
  for (const kind of ['bullet', 'ordered', 'task']) if (isList(lines, kind)) state[kind] = true;
  if (line.trimStart().startsWith('|')) state.table = true;
  if (RULE_LINE.test(line)) state.rule = true;
  if (PAGE_BREAK_LINE.test(line)) state['page-break'] = true;
  if (/^ {0,3}>/.test(line)) {
    // An alert is a quote whose first line names its type
    let first = before.length;
    while (first > 0 && /^ {0,3}>/.test(before[first - 1])) first--;
    const head = first < before.length ? before[first] : line;
    if (ALERT_HEAD.test(head)) state.alert = true;
    else if (lines.every((text) => text.startsWith('>'))) state.quote = true;
  }
  return state;
}

function applyTool(column, tool, button) {
  const { editor } = column;
  const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd);
  const span = () => toolState(editor.value, editor.selectionStart, editor.selectionEnd)[tool];
  switch (tool) {
    case 'undo': case 'redo':
      editor.focus({ preventScroll: true });
      document.execCommand(tool);
      break;
    case 'bold': column.wrapSelection('**', 'testo in grassetto', span()); break;
    case 'italic': column.wrapSelection('*', 'testo in corsivo', span()); break;
    case 'strike': column.wrapSelection('~~', 'testo barrato', span()); break;
    case 'code': column.wrapSelection('`', 'codice', span()); break;
    // With text selected it becomes the label and the address is selected, otherwise the label is
    case 'link': case 'image': {
      const bang = tool === 'image' ? '!' : '';
      const text = selected || (bang ? 'descrizione' : 'testo');
      const target = bang ? 'immagine.png' : 'https://';
      const s = editor.selectionStart;
      const from = selected ? s + bang.length + text.length + 3 : s + bang.length + 1;
      column.replaceRange(s, editor.selectionEnd, `${bang}[${text}](${target})`, from, from + (selected ? target.length : text.length));
      break;
    }
    // # → ## → ### → plain line
    case 'heading': column.transformLines((lines) => lines.map((line) => {
      const m = /^(#{1,6})\s+/.exec(line);
      const level = m ? m[1].length : 0;
      const text = m ? line.slice(m[0].length) : line;
      return level >= 3 ? text : `${'#'.repeat(level + 1)} ${text}`;
    })); break;
    case 'bullet': case 'ordered': case 'task': column.transformLines((lines) => listLines(lines, tool)); break;
    case 'quote': column.transformLines((lines) => (lines.every((line) => line.startsWith('>'))
      ? lines.map((line) => line.replace(/^> ?/, ''))
      : lines.map((line) => (line ? `> ${line}` : '>')))); break;
    case 'table': column.insertBlock(TABLE_TEMPLATE, [2, 11]); break;
    case 'code-block': {
      const code = selected.replace(/\n$/, '') || 'codice';
      // With code selected the caret goes after the opening fence, for the language
      column.insertBlock(`\`\`\`\n${code}\n\`\`\``, selected ? [3, 3] : [4, 4 + code.length]);
      break;
    }
    case 'flowchart': {
      const at = FLOWCHART_TEMPLATE.indexOf('Inizio');
      column.insertBlock(FLOWCHART_TEMPLATE, [at, at + 6]);
      break;
    }
    case 'formula': {
      const tex = selected.trim() || 'E = mc^2';
      column.insertBlock(`$$\n${tex}\n$$`, [3, 3 + tex.length]);
      break;
    }
    case 'alert': openAlertMenu(column, button); break;
    // The reference after the selection, the note (next free number) at the end of the document
    case 'footnote': {
      const used = [...editor.value.matchAll(/\[\^(\d+)\]/g)].map((m) => Number(m[1]));
      const n = Math.max(0, ...used) + 1;
      const e = editor.selectionEnd;
      const ref = `[^${n}]`;
      column.replaceRange(e, e, ref);
      const end = editor.value.length;
      const gap = editor.value.endsWith('\n\n') ? '' : editor.value.endsWith('\n') ? '\n' : '\n\n';
      column.replaceRange(end, end, `${gap}${ref}: Testo della nota\n`, e + ref.length);
      break;
    }
    case 'rule': column.insertBlock('---'); break;
    case 'page-break': column.insertBlock('<!-- pagebreak -->'); break;
  }
}

// Alert types, from the button of the toolbar: the selected lines go inside the alert
let alertMenuColumn = null;
function openAlertMenu(column, button) {
  alertMenuColumn = column;
  alertMenu.showPopover();
  placeMenu(alertMenu, button.getBoundingClientRect(), 'below');
  button.setAttribute('aria-expanded', 'true');
}
alertMenu.addEventListener('toggle', (e) => {
  if (e.newState === 'open') return;
  for (const button of document.querySelectorAll('[data-tool="alert"]')) button.setAttribute('aria-expanded', 'false');
});
alertMenu.addEventListener('mousedown', (e) => e.preventDefault());
alertMenu.addEventListener('click', (e) => {
  const item = e.target.closest('[data-alert]');
  if (!item) return;
  alertMenu.hidePopover();
  const column = alertMenuColumn;
  if (!column?.editing) return;
  const { editor } = column;
  const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd).replace(/\n$/, '');
  const head = `> [!${item.dataset.alert}]\n`;
  const body = (selected || 'Testo').split('\n').map((line) => (line ? `> ${line}` : '>')).join('\n');
  const end = head.length + body.length;
  column.insertBlock(head + body, selected ? [end, end] : [head.length + 2, end]);
});

// Places an open menu next to its origin, on the preferred side if it fits in the viewport, otherwise
// on the opposite side, and in any case within the viewport edges
const MENU_MARGIN = 4;
function placeMenu(menu, origin, side) {
  const { innerWidth: width, innerHeight: height } = window;
  const { offsetWidth: w, offsetHeight: h } = menu;
  let left;
  let top;
  if (side === 'right') {
    left = origin.right + MENU_MARGIN;
    if (left + w > width - MENU_MARGIN) left = origin.left - MENU_MARGIN - w;
    top = origin.top;
  } else {
    top = origin.bottom + 2;
    if (top + h > height - MENU_MARGIN) top = origin.top - 2 - h;
    left = origin.left;
  }
  menu.style.left = `${Math.max(MENU_MARGIN, Math.min(left, width - MENU_MARGIN - w))}px`;
  menu.style.top = `${Math.max(MENU_MARGIN, Math.min(top, height - MENU_MARGIN - h))}px`;
}

// Path menu of a file (in the list or at the top of a column): opens under the path clicked, or above it near the bottom
let pathMenuTarget = null;
function openPathMenu(path, entry) {
  pathMenuTarget = { path, entry };
  pathMenu.showPopover();
  placeMenu(pathMenu, path.getBoundingClientRect(), 'below');
}
pathMenu.addEventListener('click', async (e) => {
  const item = e.target.closest('[data-action]');
  if (!item || !pathMenuTarget) return;
  pathMenu.hidePopover();
  const { path, entry } = pathMenuTarget;
  if (item.dataset.action === 'copy') {
    await Neutralino.clipboard.writeText(entry);
    const text = path.textContent;
    path.textContent = 'Percorso copiato';
    // Not restored if the path was rewritten in the meantime (another document in the column)
    setTimeout(() => { if (path.textContent === 'Percorso copiato') path.textContent = text; }, 1200);
  } else {
    // Explorer opens the folder with the file selected
    await Neutralino.os.execCommand(`explorer /select,"${entry}"`, { background: true }).catch(() => {
      Neutralino.os.showMessageBox('Errore', 'Impossibile aprire il percorso.', 'OK', 'ERROR');
    });
  }
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
  checkChangedFiles();
});

// Files changed on disk by another program are looked for every few seconds and when the window gets the focus
const CHANGE_CHECK_INTERVAL = 2000;

function checkChangedFiles() {
  for (const column of columns) column.checkChanged();
}

setInterval(checkChangedFiles, CHANGE_CHECK_INTERVAL);

// Settings are shared by all windows: they are read again each time the panel opens
btnSettings.addEventListener('click', async () => {
  const settings = await loadSettings();
  settingNewWindow.checked = !!settings.newWindowPerFile;
  settingRestoreSession.checked = !!settings.restoreSession;
  settingCheckUpdates.checked = settings.checkUpdates !== false;
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
settingRestoreSession.addEventListener('change', () => saveSetting('restoreSession', settingRestoreSession.checked));
settingCheckUpdates.addEventListener('change', () => saveSetting('checkUpdates', settingCheckUpdates.checked));
btnCheckUpdates.addEventListener('click', () => checkForUpdates(true));
document.getElementById('app-version').textContent = NL_APPVERSION;

// Updates from the GitHub releases (updater.js): looked for at startup by the first window (when the
// setting is on) or on request, installed only after the user confirms
const UPDATE_STARTUP_DELAY = 3000;
let checkingUpdates = false;

// manual: asked by the user, who is told the outcome even when there is nothing new, and is offered a
// version skipped before
async function checkForUpdates(manual) {
  if (checkingUpdates) return;
  checkingUpdates = true;
  btnCheckUpdates.disabled = true;
  btnCheckUpdates.textContent = 'Verifica in corso…';
  let release = null;
  try {
    release = await latestRelease();
  } catch (err) {
    if (manual) Neutralino.os.showMessageBox('Aggiornamenti', `Impossibile verificare gli aggiornamenti:\n${err.message || err}`, 'OK', 'ERROR');
    else console.warn('Update check failed', err);
    return;
  } finally {
    checkingUpdates = false;
    btnCheckUpdates.disabled = false;
    btnCheckUpdates.textContent = 'Verifica ora';
  }
  if (!release || compareVersions(release.version, NL_APPVERSION) <= 0) {
    if (manual) Neutralino.os.showMessageBox('Aggiornamenti', `w3r ${NL_APPVERSION} è la versione più recente.`, 'OK', 'INFO');
    return;
  }
  if (!manual && (await loadSettings()).skippedVersion === release.version) return;
  await offerUpdate(release);
}

async function offerUpdate(release) {
  const blocker = await updateBlocker();
  const others = (await liveInstances()).length;
  document.getElementById('update-text').textContent = `È disponibile w3r ${release.version} (in uso la ${NL_APPVERSION}, `
    + `${(release.download.size / 1048576).toFixed(1)} MB). Installandola w3r si chiude e si riapre con i documenti aperti.`
    + (others ? ` Le altre ${others === 1 ? 'finestra resta aperta' : `${others} finestre restano aperte`} con la versione attuale fino alla chiusura.` : '');
  document.getElementById('update-notes').textContent = release.notes.trim();
  document.getElementById('update-blocker').textContent = blocker || '';
  document.getElementById('btn-install-update').disabled = !!blocker;
  if (settingsDialog.open) settingsDialog.close();
  updateDialog.returnValue = '';
  updateDialog.showModal();
  const choice = await new Promise((resolve) => updateDialog.addEventListener('close', () => resolve(updateDialog.returnValue), { once: true }));
  if (choice === 'skip') saveSetting('skippedVersion', release.version);
  if (choice === 'page') Neutralino.os.open(release.page);
  if (choice === 'install') await startUpdate(release);
}

// Unsaved changes are dealt with first; the documents on disk open again in the new version
async function startUpdate(release) {
  for (const column of columns) {
    if (!(await column.confirmLeave())) return;
  }
  flashBadge(`Download di w3r ${release.version}…`, 600000);
  try {
    await installUpdate(release, columns.filter((c) => c.path).map((c) => c.path));
  } catch (err) {
    flashBadge('', 0);
    Neutralino.os.showMessageBox('Aggiornamenti', `Impossibile installare l'aggiornamento:\n${err.message || err}`, 'OK', 'ERROR');
  }
}

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
  // F5 would reload the whole page
  if (e.key === 'F5') { e.preventDefault(); if (active.changed) active.reload(); }
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

// Files and folders dropped on the file list are only listed, to be opened from there
fileList.addEventListener('dragover', (e) => { e.preventDefault(); fileList.classList.add('dragging'); });
fileList.addEventListener('dragleave', (e) => { if (!fileList.contains(e.relatedTarget)) fileList.classList.remove('dragging'); });
fileList.addEventListener('drop', (e) => {
  e.preventDefault();
  fileList.classList.remove('dragging');
  const folders = [...e.dataTransfer.items].map((item) => item.webkitGetAsEntry?.()).filter((entry) => entry?.isDirectory);
  if (folders.length) { addDroppedFolders(folders); return; }
  const files = [...e.dataTransfer.files];
  if (files.length) addDroppedFiles(files);
});

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
  fileListHidden = !!settings.fileListHidden;
  setFileListWidth(settings.fileListWidth, false);

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

  const firstWindow = !(await liveInstances()).length;
  const updated = await finishUpdate().catch(() => null);
  const reloaded = reloadState();

  // A window of the last session: handed over by the first window (--session), or the first window itself,
  // started with nothing else to open (no file, no update, not a page reload), which starts the others
  let restored = null;
  const sessionKey = (NL_ARGS.find((arg) => arg.startsWith('--session=')) || '').slice('--session='.length);
  if (sessionKey) restored = await takeRestoredWindow(sessionKey);
  else if (firstWindow && settings.restoreSession && !fullPath && !newWindow && !updated?.paths?.length && !reloaded) {
    const session = await takeSession();
    restored = session[0] || null;
    for (const window of session.slice(1)) await launchInstance([`--session=${window.key}`]).catch(() => {});
  }

  // The window starts hidden, so it shows up already in its place: as it was in the session, or in its
  // cascade position (from --at, if given)
  if (restored) await applyGeometry(restored);
  else {
    const at = /^--at=(-?\d+),(-?\d+)$/.exec(NL_ARGS.find((arg) => arg.startsWith('--at=')) || '');
    if (at) await Neutralino.window.move(Number(at[1]), Number(at[2])).catch(() => {});
  }
  await placeWindow(!restored);
  await Neutralino.window.show();
  if (newWindow) bringToFront();
  watchInbox(async (file) => {
    await openInNewColumn(file);
    bringToFront();
  });

  bookmarks = await loadBookmarks();
  if (fullPath) active.navigateTo(fullPath);
  else if (updated?.paths?.length) {
    for (const [index, path] of updated.paths.entries()) {
      if (index) await openInNewColumn(path); else await active.navigateTo(path);
    }
  } else restoreState(restored ? sessionState(restored.state) : reloaded);
  addBookmarked();
  updateUI();
  saveState();
  if (updated) flashBadge(`w3r aggiornato alla versione ${updated.to}`, 4000);

  // Only the first window looks for updates at startup
  if (settings.checkUpdates !== false && firstWindow) {
    setTimeout(() => checkForUpdates(false), UPDATE_STARTUP_DELAY);
  }
});

// The window goes to the session (for the next start) once its documents may be left
Neutralino.events.on('windowClose', async () => {
  for (const column of columns) {
    if (!(await column.confirmLeave())) return;
  }
  await archiveInstance();
  await removeInstance();
  Neutralino.app.exit();
});

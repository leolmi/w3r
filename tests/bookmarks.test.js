// Reading points in storage.js: a read never gives back a reading point changed by this window meanwhile
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const STORAGE = fs.readFileSync(path.join(__dirname, '..', 'resources', 'js', 'storage.js'), 'utf8');
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

// storage.js with a file system in memory; each read and write waits a little, as on disk
function loadStorage(files = {}) {
  const delay = () => tick();
  const context = {
    window: { addEventListener() {} },
    Neutralino: {
      os: { getPath: async () => 'C:/data' },
      filesystem: {
        createDirectory: async () => {},
        readFile: async (file) => {
          const content = files[file];
          await delay();
          if (content === undefined) throw new Error('not found');
          return content;
        },
        writeFile: async (file, content) => {
          await delay();
          files[file] = content;
        },
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(`${STORAGE}\nthis.api = { loadBookmarks, saveBookmark };`, context);
  return { api: context.api, files };
}

const FILE = 'C:\\data\\w3r\\bookmarks.json';
const POINT = { block: 3, fraction: 0.5, text: 'testo' };

test('a reading point removed while the file is being read does not come back', async () => {
  const { api } = loadStorage({ [FILE]: JSON.stringify({ 'C:\\doc.md': POINT }) });
  // The window gets the focus (dialog closed) just before the removal
  const reading = api.loadBookmarks();
  await tick();
  api.saveBookmark('C:\\doc.md', null);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(await reading)), {});
});

test('a read after a removal waits for the write', async () => {
  const { api, files } = loadStorage({ [FILE]: JSON.stringify({ 'C:\\doc.md': POINT }) });
  api.saveBookmark('C:\\doc.md', null);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(await api.loadBookmarks())), {});
  assert.deepStrictEqual(JSON.parse(files[FILE]), {});
});

test('writes one after the other keep all the changes', async () => {
  const { api, files } = loadStorage();
  api.saveBookmark('C:\\a.md', POINT);
  api.saveBookmark('C:\\b.md', POINT);
  await api.saveBookmark('C:\\a.md', null);
  assert.deepStrictEqual(JSON.parse(files[FILE]), { 'C:\\b.md': POINT });
});

test('reading points set in other windows are kept', async () => {
  const { api, files } = loadStorage({ [FILE]: JSON.stringify({ 'C:\\altro.md': POINT }) });
  await api.saveBookmark('C:\\doc.md', POINT);
  assert.deepStrictEqual(JSON.parse(files[FILE]), { 'C:\\altro.md': POINT, 'C:\\doc.md': POINT });
});

// Copies the front-end libraries from node_modules into resources/vendor
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const vendorDir = path.join(root, 'resources', 'vendor');

const files = [
  'node_modules/marked/lib/marked.umd.js',
  'node_modules/dompurify/dist/purify.min.js',
  'node_modules/github-markdown-css/github-markdown-light.css'
];

fs.mkdirSync(vendorDir, { recursive: true });
for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(vendorDir, path.basename(file)));
}

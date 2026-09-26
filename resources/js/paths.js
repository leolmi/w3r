// Platform-neutral path helpers: paths are always kept in the native form of the OS (\ on Windows, / elsewhere)

const IS_WINDOWS = NL_OS === 'Windows';
const SEP = IS_WINDOWS ? '\\' : '/';

function toNativePath(path) {
  return IS_WINDOWS ? path.replace(/\//g, '\\') : path;
}

function isAbsolutePath(path) {
  return IS_WINDOWS ? /^([a-zA-Z]:\\|\\\\)/.test(path) : path.startsWith('/');
}

function joinPath(...parts) {
  return parts.join(SEP);
}

function dirOf(path) {
  return path.replace(/[\\/][^\\/]*$/, '');
}

function baseNameOf(path) {
  return path.split(/[\\/]/).pop();
}

function extensionOf(path) {
  const match = /\.([^.\\/]+)$/.exec(path);
  return match ? match[1].toLowerCase() : '';
}

// Version gate: the Figma file remembers the plugin version that last wrote to it; an older plugin may not
// overwrite it. PLUGIN_VERSION is embedded by the build from the VERSION file.
const FILE_STAMP_KEY = 'designsync.generatorVersion';

function parseVersion(v) {
  return String(v || '').split('.').map((n) => parseInt(n, 10) || 0);
}

// -1 if a < b, 0 if equal, 1 if a > b (compared number by number; a missing number counts as 0).
function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i += 1) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

function readFileStamp() {
  return figma.root.getPluginData(FILE_STAMP_KEY) || '';
}

// Refuses to write when the file was written by a NEWER plugin; opts.force overrides on purpose.
function assertCanWrite(opts) {
  const stamp = readFileStamp();
  if (stamp && compareVersions(stamp, PLUGIN_VERSION) > 0 && !(opts && opts.force)) {
    throw new Error(
      'File Figma đã được cập nhật bằng plugin bản ' + stamp + '. Bạn đang dùng bản ' + PLUGIN_VERSION +
      '. Hãy cập nhật, dựng lại và mở lại plugin trước khi thử lại.'
    );
  }
}

function stampFile() {
  figma.root.setPluginData(FILE_STAMP_KEY, PLUGIN_VERSION);
}

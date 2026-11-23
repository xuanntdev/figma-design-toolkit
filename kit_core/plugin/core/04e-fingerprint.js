// Dấu vân tay nội dung: lúc dựng, plugin lưu hash của khung (kích thước + cả cây con: loại, tên, vị trí/kích thước, màu nền
// đầu, chữ) vào plugin data `fp`. Lượt sau, khung `source=ai` mà vân tay hiện tại khác (designer sửa tay mà không đổi tag)
// bị coi là đã sửa: gắn source=human + edited=1, giữ nguyên, bản nháp mới đặt cạnh/bên dưới như status=chosen.
// Khung bản cũ chưa có vân tay thì không biết đã sửa hay chưa: chỉ được thay khi đúng tên, đúng kích thước và các node con
// cấp 1 trùng bản plugin sẽ dựng (không có node lạ); còn lại giữ và báo.
// Vị trí/tên của chính khung và kích thước text không tính (layout và font có thể đổi mà designer không đụng).

let ST_EDITED = new Set();

function stResetEdited() {
  ST_EDITED = new Set();
}

function stEditedCount() {
  return ST_EDITED.size;
}

function fpMix(h, s) {
  let x = h;
  for (let i = 0; i < s.length; i += 1) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return x >>> 0;
}

function fpFill(n) {
  const f = n.fills;
  if (!Array.isArray(f) || !f.length || f[0].type !== 'SOLID' || !f[0].color) return '';
  const c = f[0].color;
  return [c.r, c.g, c.b, f[0].opacity == null ? 1 : f[0].opacity].map((v) => Math.round(v * 255)).join(',');
}

function fpNode(n, h, root) {
  const text = n.type === 'TEXT';
  let geo = [n.x, n.y, n.width, n.height];
  if (root) geo = [n.width, n.height];
  else if (text) geo = [n.x, n.y];
  const kids = n.children || [];
  const row = [n.type, root ? '' : n.name, geo.map(Math.round).join(','), fpFill(n), text ? n.characters : '', kids.length].join('|');
  let x = fpMix(h, row);
  for (const c of kids) x = fpNode(c, x, false);
  return x;
}

function stFingerprint(frame) {
  return fpNode(frame, 2166136261, true).toString(16);
}

function stStampFp(frame) {
  frame.setPluginData('fp', stFingerprint(frame));
}

// Dựng khung màn bằng extension rồi đóng dấu vân tay (mọi chỗ dựng khung `ai` đều đi qua đây).
function stBuildFrame(screen, theme) {
  const frame = stExtension().build(screen, theme);
  stStampFp(frame);
  stStampSource(frame, screen);
  return frame;
}

function fpShape(f) {
  return f.children.map((c) => c.type + '|' + c.name).sort().join('\n');
}

function stLegacyPristine(node) {
  const id = stTagOf(node, 'screenId');
  const screen = stFindScreen(id);
  if (!screen) return false;
  let ref;
  try {
    ref = stExtension().build(screen, stTagOf(node, 'theme') || 'light');
  } catch (err) {
    return false;
  }
  try {
    const name = node.name.startsWith(id) || node.name.includes(screen.title);
    return name && Math.round(node.width) === Math.round(ref.width) && Math.round(node.height) === Math.round(ref.height) && fpShape(node) === fpShape(ref);
  } finally {
    ref.remove();
  }
}

// Thuần đọc: khung có đang khác bản plugin dựng không (khung `human` đã gắn edited=1 thì tính là đã sửa).
function stEditedNow(node) {
  if (node.type !== 'FRAME') return false;
  if (stTagOf(node, 'source') !== 'ai') return stTagOf(node, 'edited') === '1';
  const fp = stTagOf(node, 'fp');
  return fp ? stFingerprint(node) !== fp : !stLegacyPristine(node);
}

// Khung `ai` đã bị sửa tay (hoặc không chứng minh được là nguyên bản) => retag human, giữ lại.
function stIsEdited(node) {
  if (stTagOf(node, 'edited') === '1') ST_EDITED.add(node.id);
  if (node.type !== 'FRAME' || stTagOf(node, 'source') !== 'ai') return false;
  const edited = stEditedNow(node);
  if (edited) {
    ST_EDITED.add(node.id);
    stTag(node, { source: 'human', edited: 1 });
  }
  return edited;
}

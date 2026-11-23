// Engine "link" (trung lập, không biết thư viện UI hay dự án nào): dựng node bằng INSTANCE của component dùng chung + gắn biến token, để sửa
// component / token một chỗ thì mọi màn đổi theo. Luật nhận diện nằm ở extension: DESIGN_EXTENSION.linkRules (mảng { name, match(node, ctx) -> link | null,
// matchRun?(list, i, ctx) }), bảng tra token: DESIGN_EXTENSION.linkTokens(), tag plugin data nhận component: DESIGN_EXTENSION.linkTag (mặc định 'linkComp').
// Engine là phần BẮT BUỘC của bộ sinh (không có cờ bật/tắt): extension khai linkRules thì MỌI node đi qua engine; chỉ khi không luật nào khớp mới dựng
// khối thô (fallback, thống kê "chưa liên kết"). Extension không khai luật thì dựng như cũ: khối thô (+ gắn token nếu có linkTokens).
// Registry: LK.comps[key] = [{ name, props, node }] (mỗi COMPONENT mang plugin data <tag>=<key>; tên biến thể dạng "A=b, C=d").
const LK = { comps: {}, tables: null, byName: {}, pending: [], stats: null };

function lkExt() {
  return typeof DESIGN_EXTENSION === 'undefined' ? null : DESIGN_EXTENSION;
}

function lkRules() {
  const e = lkExt();
  return e && Array.isArray(e.linkRules) ? e.linkRules : [];
}

function lkHasTokens() {
  const e = lkExt();
  return !!(e && typeof e.linkTokens === 'function');
}

// Engine có việc làm khi extension khai luật hoặc bảng token; không khai gì thì mọi node dựng như cũ.
function lkActive() {
  return lkRules().length > 0 || lkHasTokens();
}

function lkTag() {
  const e = lkExt();
  return (e && e.linkTag) || 'linkComp';
}

function lkParseVariant(name) {
  const out = {};
  String(name).split(',').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  });
  return out;
}

// Quét một trang tìm mọi COMPONENT có tag; trả số component set/key tìm được.
async function lkDiscover(page) {
  await page.loadAsync();
  const tag = lkTag();
  const found = {};
  page.findAll((n) => n.type === 'COMPONENT' && !!stTagOf(n, tag)).forEach((c) => {
    const key = stTagOf(c, tag);
    (found[key] = found[key] || []).push({ name: c.name, props: lkParseVariant(c.name), node: c });
  });
  LK.comps = found;
  return Object.keys(found).length;
}

// Tìm biến thể khớp mọi thuộc tính của `variant` (object hoặc chuỗi "A=b, C=d"); không có variant thì lấy biến thể đầu.
function lkFind(key, variant) {
  const list = LK.comps[key];
  if (!list || !list.length) return null;
  const want = typeof variant === 'string' ? lkParseVariant(variant) : (variant || {});
  return list.find((e) => Object.keys(want).every((k) => e.props[k] === String(want[k]))) || null;
}

function lkHasComponents() {
  return Object.keys(LK.comps).length > 0;
}

// Khoá màu: hex 6 chữ thường + '@alpha' (2 số lẻ) khi trong suốt; extension dùng chính hàm này khi lập bảng tra.
function lkColorKey(hex, alpha) {
  const a = Math.round((alpha == null ? 1 : alpha) * 100) / 100;
  return String(hex).slice(0, 7).toLowerCase() + (a < 1 ? '@' + a : '');
}

function lkTextKey(family, style, size, lineHeight) {
  return [family, style, size, lineHeight].join('|');
}

function lkVarMap(table, byName) {
  const m = new Map();
  Object.keys(table || {}).forEach((k) => { if (byName[table[k]]) m.set(k, byName[table[k]]); });
  return m;
}

// Bảng token từ DESIGN_EXTENSION.linkTokens(): { fill, stroke, text: {khoá màu: tên biến}, radius: {số: tên biến}, textStyles: [{ name, family, style, size, lineHeight }] }.
async function lkLoadTokens() {
  const ext = lkExt();
  const t = ext && ext.linkTokens ? ext.linkTokens() : null;
  LK.tables = null;
  LK.byName = {};
  if (!t || !figma.variables) return;
  const byName = {};
  (await figma.variables.getLocalVariablesAsync()).forEach((v) => { byName[v.name] = v; });
  LK.byName = byName;
  const styles = {};
  (await figma.getLocalTextStylesAsync()).forEach((s) => { styles[s.name] = s; });
  const textKey = new Map();
  (t.textStyles || []).forEach((r) => { if (styles[r.name]) textKey.set(lkTextKey(r.family, r.style, r.size, r.lineHeight), styles[r.name]); });
  LK.tables = { fill: lkVarMap(t.fill, byName), stroke: lkVarMap(t.stroke, byName), text: lkVarMap(t.text, byName), radius: lkVarMap(t.radius, byName), textKey };
}

// Gọi sau khi trang Token vừa dựng xong (tokens hook): nhận lại component + biến mới nhất.
async function lkOnTokens(page) {
  if (!lkActive()) return;
  await lkDiscover(page);
  await lkLoadTokens();
}

// Thiếu thứ engine cần: luật có mà chưa có component nào, hoặc chỉ có bảng token mà file chưa có biến nào.
function lkNeedsLibrary() {
  if (lkRules().length) return !lkHasComponents();
  return lkHasTokens() && !Object.keys(LK.byName).length;
}

// Tự dựng trang Token & Component khi thiếu (extension có buildTokens, cấu hình tokens không tắt); lượt này commit undo riêng
// để Hoàn tác chỉ gỡ khung màn. Không dựng được thì màn dựng bằng khối thô.
async function lkHealLibrary() {
  const ext = lkExt();
  if (typeof ext.buildTokens !== 'function' || stTokensMode() === 'off') return;
  try {
    assertCanWrite();
    const page = await stEnsurePage(stOpts().pageTokens);
    if (liveProtected().has(figma.currentPage.id)) await figma.setCurrentPageAsync(page);
    await ext.buildTokens(page);
    stampFile();
    figma.commitUndo();
    await lkDiscover(page);
    await lkLoadTokens();
  } catch (err) { /* không dựng được Token: màn dựng bằng khối thô */ }
}

// Trước khi dựng màn (mỗi lượt): nhận component + bảng token từ trang Token; thiếu thì tự dựng trang Token trước (self-heal).
// opts.readOnly (Xem trước) chỉ đọc, không dựng gì.
async function lkPrepare(opts) {
  if (!lkActive()) return;
  LK.pending = [];
  const page = figma.root.children.find((p) => p.name === stOpts().pageTokens);
  if (page) await lkDiscover(page);
  else LK.comps = {};
  await lkLoadTokens();
  if (lkNeedsLibrary() && !(opts && opts.readOnly)) await lkHealLibrary();
}

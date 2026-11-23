// Kiểm giả lập plugin của một dự án: chạy bundle (mặc định project/dist/code.js) trong vm với Figma giả (có text, rectangle,
// SVG, ảnh, font, variables/text style/component) rồi dựng toàn bộ màn trong draft-plan, đếm node, chạy lại phải ổn định.
// Nếu extension khai buildTokens thì kiểm thêm trang Token & Component (chạy lại không nhân đôi, giữ node của designer).
// Chạy: node verify_project.js [đường-dẫn/code.js]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { strictNode, markRemoved } = require('./strict-node.js');

let seq = 1;
class MockNode {
  constructor(type) {
    Object.assign(this, { id: 'N' + seq++, type, name: type, children: [], parent: null, x: 0, y: 0, width: 100, height: 20, fills: [], strokes: [], _pd: {} });
    return strictNode(this);
  }
  getPluginData(k) { return this._pd[k] || ''; }
  setPluginData(k, v) { this._pd[k] = String(v); }
  resize(w, h) { this.width = w; this.height = h; }
  appendChild(ch) {
    if (ch.parent) ch.parent.children = ch.parent.children.filter((x) => x !== ch);
    ch.parent = this;
    this.children.push(ch);
  }
  clone() { const c = new MockNode(this.type); c.width = this.width; c.height = this.height; return c; }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this);
    this.parent = null;
    markRemoved(this);
  }
  set characters(v) { this._chars = v; this.width = Math.max(8, v.length * 7); }
  get characters() { return this._chars; }
}

const installTokenApi = require('./figma-token-mock')(MockNode);

function boot(bundlePath, fontsMissing) {
  const root = new MockNode('DOCUMENT');
  const page = new MockNode('PAGE');
  page.name = 'Page 1';
  root.appendChild(page);
  const msgs = [];
  const loaded = [];
  const mk = (t) => () => new MockNode(t);
  const figma = {
    root, currentPage: page, ui: { onmessage: null, postMessage: (m) => msgs.push(m) }, showUI() {}, closePlugin() {},
    loadAllPagesAsync: async () => {}, setCurrentPageAsync: async (p) => { figma.currentPage = p; },
    getNodeByIdAsync: async () => null,
    loadFontAsync: async (f) => { if (fontsMissing && f.family !== 'Inter') throw new Error('no font'); loaded.push(f.family + '/' + f.style); },
    listAvailableFontsAsync: async () => [{ fontName: { family: 'Inter', style: 'Regular' } }, { fontName: { family: 'Inter', style: 'Semi Bold' } },
      ...(fontsMissing ? [] : [{ fontName: { family: 'Public Sans', style: 'Regular' } }, { fontName: { family: 'Public Sans', style: 'SemiBold' } }])],
    commitUndo() {}, createPage: () => { const p = new MockNode('PAGE'); root.appendChild(p); return p; },
    createFrame: mk('FRAME'), createSection: mk('SECTION'), createText: mk('TEXT'), createRectangle: mk('RECTANGLE'),
    createNodeFromSvg: (s) => { if (!s.includes('<svg')) throw new Error('bad svg'); return new MockNode('FRAME'); },
    createImage: () => ({ hash: 'h' }), base64Decode: (s) => Buffer.from(s, 'base64'),
  };
  const registry = installTokenApi(figma, root);
  const sb = { figma, __html__: '<html/>', console, Uint8Array };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(bundlePath, 'utf8'), sb);
  const call = async (name, args) => {
    msgs.length = 0;
    await figma.ui.onmessage({ type: 'PLUGIN_CMD', cmd: { id: 'c', name, args: args || {} } });
    return msgs.find((m) => m.type === 'PLUGIN_RESULT').result;
  };
  return { root, call, loaded, registry, figma };
}

function count(node, acc) {
  acc[node.type] = (acc[node.type] || 0) + 1;
  node.children.forEach((c) => count(c, acc));
  return acc;
}


function tokenPage(root) {
  return root.children.find((p) => p.name === 'Token & Component');
}

function descendants(node) {
  return node.children.reduce((sum, c) => sum + 1 + descendants(c), 0);
}

function tokenCounts(env) {
  const r = env.registry;
  const page = tokenPage(env.root);
  const comps = r.sets.reduce((sum, set) => sum + set.children.length, 0);
  return { vars: r.variables.length, styles: r.styles.length, collections: r.collections.length, sets: r.sets.length, comps, roots: page.children.length, nodes: descendants(page) };
}

// Trang Token & Component (chỉ khi extension có buildTokens và tokens != off): tokens=update làm mới ở mỗi lượt Cập nhật, tokens=button
// chỉ khi bấm nút. Có nội dung, chạy lại không nhân đôi variable/style/component, giữ thứ designer thêm. Trả null nếu không có hook.
async function checkTokens(env, res, mode) {
  if (mode === 'off') {
    assert.equal(res.value.tokens, undefined, 'tokens=off/không có hook: Cập nhật không đụng trang Token');
    return null;
  }
  if (mode === 'button') {
    assert.equal(res.value.tokens, undefined, 'tokens=button: Cập nhật không tự làm mới trang Token');
    assert.equal(tokenPage(env.root).children.length, 0, 'tokens=button: chưa bấm nút thì trang Token còn trống');
    const pressed = await env.call('buildTokens');
    assert.equal(pressed.ok, true, pressed.error);
  } else {
    assert.equal(res.value.tokens.ok, true, JSON.stringify(res.value.tokens));
  }
  const page = tokenPage(env.root);
  assert.ok(page && page.children.length > 0, 'Trang Token & Component trống');
  const first = tokenCounts(env);
  assert.ok(first.collections >= 1 && first.vars > 0 && first.styles > 0 && first.sets > 0, JSON.stringify(first));
  assert.ok(env.registry.variables.every((v) => Object.keys(v.values).length >= 1), 'Mỗi variable phải có giá trị');
  assert.ok(env.root.children.every((p) => p.children.every((n) => n.type !== 'COMPONENT')), 'Component lẻ không vào set');
  const mine = new MockNode('FRAME');
  mine.name = 'Designer tự vẽ';
  page.appendChild(mine);
  const again = await env.call('buildTokens');
  assert.equal(again.ok, true, again.error);
  assert.equal(again.value.variables.created, 0, 'Chạy lại không được tạo variable mới');
  assert.equal(again.value.textStyles.created, 0);
  assert.ok(again.value.components.every((c) => c.created === 0 && c.removed === 0));
  assert.ok(page.children.includes(mine), 'Phải giữ node designer tự thêm');
  page.children = page.children.filter((n) => n !== mine);
  assert.deepEqual(tokenCounts(env), first, 'Chạy lần 2 làm đổi số lượng node/variable/component');
  return first;
}

// Lượt Cập nhật thứ 2 khi nguồn không đổi: sync=merge bỏ qua hết (không coi khung chưa ai sửa là đã sửa tay); sync=replace thay hết
// bản nháp. Cả hai không nhân đôi khung và không đổi trang Token.
async function checkRerun(env, tok, merge) {
  const upd = await env.call('updateDraft', {});
  assert.equal(upd.ok, true, upd.error);
  assert.equal(upd.value.editedKept, 0, 'Cập nhật lại khung chưa ai sửa không được coi là đã sửa tay');
  assert.equal(upd.value.keptProtected, 0);
  assert.equal(upd.value.builtCount, merge ? 0 : upd.value.proposals.length, merge ? 'Nguồn không đổi: lượt 2 bỏ qua hết' : 'sync=replace: lượt 2 thay hết bản nháp');
  assert.equal(upd.value.merge.counts[merge ? 'skip' : 'replace'], upd.value.proposals.length);
  if (tok) assert.deepEqual(tokenCounts(env), tok, 'Cập nhật lần 2 làm đổi trang Token');
}

async function run(bundle, fontsMissing) {
  const env = boot(bundle, fontsMissing);
  const cat = await env.call('getCatalog');
  assert.equal(cat.ok, true, cat.error);
  const res = await env.call('updateDraft', {});
  assert.equal(res.ok, true, res.error);
  assert.equal(res.value.builtCount, cat.value.defaultPlan.screenIds.length * cat.value.defaultPlan.themes.length);
  const settings = cat.value.settings;
  const tok = await checkTokens(env, res, settings.tokens);
  await checkRerun(env, tok, settings.sync === 'merge');
  const acc = count(env.root, {});
  assert.ok(acc.TEXT > 0 || cat.value.defaultPlan.screenIds.length === 0, 'Không có text node nào');
  console.log(`${fontsMissing ? 'thiếu font' : 'đủ font'} · sync=${settings.sync} tokens=${settings.tokens}: dựng ${res.value.builtCount} khung ·`, JSON.stringify(acc), '· token:', (tok ? JSON.stringify(tok) : 'không có hook'), '· font nạp:', [...new Set(env.loaded)].join(', '));
}

(async () => {
  const bundle = path.resolve(process.argv[2] || path.join(__dirname, '..', 'project/dist/code.js'));
  if (!fs.existsSync(bundle)) throw new Error('Không thấy ' + bundle + ' (chạy python design_sync.py build trước).');
  await run(bundle, false);
  await run(bundle, true);
  console.log('verify_project.js: OK');
})().catch((e) => { console.error(e); process.exit(1); });

// Kiểm giả lập đầy đủ plugin cục bộ ở cấu hình MẶC ĐỊNH (= hành vi kit gốc: layout grid, sync replace, không nhãn/xem trước/dọn): chế độ file mới (Container), chế độ gương Section (Hiện tại ↔ Cải tiến),
// bảo toàn status=chosen & source=human, kiểm đích trước khi ghi, hoàn tác an toàn và chuyển tên trang cũ.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { strictNode, markRemoved } = require('./tests/strict-node.js');

let seq = 1;
class MockNode {
  constructor(type) {
    this.id = 'N' + (seq++);
    this.type = type;
    this.name = type;
    this.children = [];
    this.parent = null;
    this.x = 0; this.y = 0; this.width = 100; this.height = 100;
    this.fills = []; this.strokes = [];
    this._pd = {};
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
  remove() {
    if (this.parent) {
      this.parent.children = this.parent.children.filter((x) => x !== this);
      this.parent = null;
    }
    markRemoved(this);
  }
}

function findNode(root, id) {
  if (root.id === id) return root;
  for (const c of root.children) {
    const found = findNode(c, id);
    if (found) return found;
  }
  return null;
}

function boot(bundlePath, initialPages) {
  const root = new MockNode('DOCUMENT');
  for (const p of initialPages || []) root.appendChild(p);
  if (!root.children.length) {
    const p = new MockNode('PAGE');
    p.name = 'Page 1';
    root.appendChild(p);
  }
  const uiMsgs = [];
  const figma = {
    root,
    currentPage: root.children[0],
    ui: { onmessage: null, postMessage: (m) => uiMsgs.push(m) },
    showUI: () => {},
    closePlugin: () => {},
    loadAllPagesAsync: async () => {},
    setCurrentPageAsync: async (p) => { figma.currentPage = p; },
    getNodeByIdAsync: async (id) => findNode(root, id),
    loadFontAsync: async () => {},
    commitUndo: () => {},
    createPage: () => { const p = new MockNode('PAGE'); root.appendChild(p); return p; },
    createFrame: () => new MockNode('FRAME'),
    createSection: () => new MockNode('SECTION'),
    createText: () => new MockNode('TEXT'),
  };
  const code = fs.readFileSync(bundlePath, 'utf8');
  const sb = { figma, __html__: '<html/>', console };
  vm.createContext(sb);
  vm.runInContext(code, sb);
  async function call(name, args) {
    uiMsgs.length = 0;
    await figma.ui.onmessage({ type: 'PLUGIN_CMD', cmd: { id: 'c-' + name, name, args: args || {} } });
    const msg = uiMsgs.find((m) => m.type === 'PLUGIN_RESULT');
    assert.ok(msg, 'Không nhận được PLUGIN_RESULT cho ' + name);
    return msg.result;
  }
  return { root, figma, call };
}

async function testContainerAndUndo(bundlePath) {
  const env = boot(bundlePath);
  const cat = await env.call('getCatalog');
  assert.equal(cat.ok, true);
  assert.equal(cat.value.defaultPlan.screenIds.length, 1);

  // Chặn hoàn tác khi chưa có lượt cập nhật nào
  const earlyUndo = await env.call('rollbackDraft');
  assert.equal(earlyUndo.ok, false);

  // Cập nhật lần 1: dựng 1 màn × 2 chủ đề = 2 khung
  const res1 = await env.call('updateDraft', { target: 'improved' });
  assert.equal(res1.ok, true, res1.error);
  assert.equal(res1.value.mode, 'container');
  assert.equal(res1.value.builtCount, 2);
  assert.equal(res1.value.groups.length, 1);
  assert.equal(res1.value.groups[0].title, '1 · Bắt đầu');
  assert.equal(res1.value.groups[0].built, 2);

  // Đánh dấu 1 khung status=chosen, cập nhật lại phải bảo toàn bản chosen
  const chosenId = res1.value.proposals[0].frameId;
  const chosen = findNode(env.root, chosenId);
  chosen.setPluginData('status', 'chosen');
  const res2 = await env.call('updateDraft', { target: 'improved' });
  assert.equal(res2.ok, true, res2.error);
  assert.equal(res2.value.keptProtected, 1);
  assert.ok(findNode(env.root, chosenId), 'Bản status=chosen bị xoá');

  // Hoàn tác gỡ đúng 2 khung mới và giữ bản chosen; bấm lần 2 phải bị từ chối
  const undo = await env.call('rollbackDraft');
  assert.equal(undo.ok, true, undo.error);
  assert.equal(undo.value.rolledBackCount, 2);
  assert.equal(undo.value.groups[0].title, '1 · Bắt đầu');
  assert.ok(findNode(env.root, chosenId), 'Hoàn tác làm mất bản chosen');
  const undo2 = await env.call('rollbackDraft');
  assert.equal(undo2.ok, false);
}

async function testSectionMirror(bundlePath) {
  const page = new MockNode('PAGE');
  page.name = '01 · Màn hình';
  const cur = new MockNode('SECTION'); cur.name = 'Hiện tại';
  const imp = new MockNode('SECTION'); imp.name = 'Cải tiến';
  page.appendChild(cur); page.appendChild(imp);
  for (const theme of ['light', 'dark']) {
    const area = new MockNode('SECTION'); area.name = theme === 'light' ? 'Sáng' : 'Tối';
    const grp = new MockNode('SECTION'); grp.name = '1 · Bắt đầu';
    grp.x = 64; grp.y = 100; grp.resize(600, 1020);
    grp.fills = [{ type: 'SOLID', color: { r: 0.92, g: 0.94, b: 0.98 } }];
    grp.cornerRadius = 16;
    const f1 = new MockNode('FRAME'); f1.name = 'Chào mừng'; f1.x = 60; f1.y = 90; f1.resize(393, 873);
    grp.appendChild(f1);
    area.appendChild(grp); cur.appendChild(area);
  }
  const env = boot(bundlePath, [page]);

  // Sai mã màn phải từ chối trước khi ghi
  const bad = await env.call('updateDraft', { screenIds: ['khong-ton-tai'], themes: ['light'], target: 'improved' });
  assert.equal(bad.ok, false);
  assert.equal(imp.children.length, 0, 'Sai mã màn không được tạo node trong Cải tiến');

  // Cập nhật hợp lệ: gương cây Section Hiện tại → Cải tiến
  const ok = await env.call('updateDraft', { target: 'improved' });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.value.mode, 'section');
  assert.equal(ok.value.builtCount, 2);
  assert.equal(imp.children.length, 2);
  const firstFrame = findNode(env.root, ok.value.proposals[0].frameId);
  assert.equal(firstFrame.x, 60);
  assert.equal(firstFrame.y, 90);
  assert.equal(firstFrame.parent.name, '1 · Bắt đầu');
  assert.equal(firstFrame.parent.cornerRadius, 16);
}

// DESIGN_CONFIG mà build nhúng vào code.js (rỗng nếu dựng không có design-sync.json).
function bundleConfig(bundlePath) {
  const m = fs.readFileSync(bundlePath, 'utf8').match(/^const DESIGN_CONFIG = (.*);$/m);
  return m ? JSON.parse(m[1]) : {};
}

function sectionPage(withGroup) {
  const page = new MockNode('PAGE');
  page.name = '01 · Màn hình';
  const cur = new MockNode('SECTION'); cur.name = 'Hiện tại';
  const imp = new MockNode('SECTION'); imp.name = 'Cải tiến';
  page.appendChild(cur); page.appendChild(imp);
  if (withGroup) {
    const area = new MockNode('SECTION'); area.name = 'Sáng';
    const grp = new MockNode('SECTION'); grp.name = '1 · Bắt đầu';
    const manual = new MockNode('FRAME'); manual.name = 'Chào mừng'; manual.x = 60; manual.y = 90; manual.resize(393, 873);
    grp.appendChild(manual); area.appendChild(grp); cur.appendChild(area);
  }
  return { page, cur, imp };
}

// Cỡ khung theo design-sync.json; target=current dựng vào "Hiện tại" (Container lẫn Section), không đụng "Cải tiến".
async function testConfigAndCurrentTarget(bundlePath) {
  const cfg = bundleConfig(bundlePath);
  const frame = cfg.frame || { width: 393, height: 873 };
  const env = boot(bundlePath);
  const res = await env.call('updateDraft', { target: 'current', themes: ['light'] });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.value.target, 'current');
  const built = findNode(env.root, res.value.proposals[0].frameId);
  assert.equal(built.parent.getPluginData('kind'), 'current');
  assert.equal(built.getPluginData('role'), 'cell');
  assert.equal(built.width, frame.width);
  assert.equal(built.height, frame.height);
  const again = await env.call('updateDraft', { target: 'current', themes: ['light'] });
  assert.equal(again.value.proposals[0].replaced, 1, 'Cập nhật lại phải thay bản nháp cũ trong Hiện tại');

  const s = sectionPage(true);
  const env2 = boot(bundlePath, [s.page]);
  const sec = await env2.call('updateDraft', { target: 'current', themes: ['light', 'dark'] });
  assert.equal(sec.ok, true, sec.error);
  assert.equal(sec.value.mode, 'section');
  assert.equal(s.imp.children.length, 0, 'target=current không được ghi vào Cải tiến');
  const light = findNode(env2.root, sec.value.proposals[0].frameId);
  assert.equal(light.parent.name, '1 · Bắt đầu');
  assert.ok(light.x >= 60 + 393, 'Không được đè lên khung vẽ tay trong Hiện tại');
  assert.equal(light.parent.children.length, 2, 'Khung vẽ tay phải được giữ');
  const dark = findNode(env2.root, sec.value.proposals[1].frameId);
  assert.equal(dark.parent.parent.name, 'Tối', 'Thiếu vùng Tối thì phải tự tạo');
}

async function testLegacyPages(bundlePath) {
  const f = new MockNode('PAGE'); f.name = 'Features';
  const cur = new MockNode('FRAME'); cur.setPluginData('role', 'container'); cur.setPluginData('kind', 'current');
  f.appendChild(cur);
  const t = new MockNode('PAGE'); t.name = 'Tokens & Components';
  const env = boot(bundlePath, [f, t]);
  const res = await env.call('ensureLayout');
  assert.equal(res.ok, true, res.error);
  assert.deepEqual(env.root.children.map((p) => p.name), ['Tính năng', 'Token & Component']);
}

(async () => {
  const bundlePath = process.argv[2] || path.join(__dirname, 'plugin', 'code.js');
  await testContainerAndUndo(bundlePath);
  await testSectionMirror(bundlePath);
  await testLegacyPages(bundlePath);
  await testConfigAndCurrentTarget(bundlePath);
  console.log('PASSED: Container, Section mirror, bảo toàn chosen, kiểm đích trước khi ghi, hoàn tác an toàn, tên trang cũ, cỡ khung & target=current.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
